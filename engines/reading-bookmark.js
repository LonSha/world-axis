/**
 * WorldAxis engines/reading-bookmark.js (v2.407.0) — 增量阅读书签（三缝①）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────
 *   backstage 的推演上下文只喂 `recentText(8)`——最近 8 楼的原文。长局里模型
 *   一轮只看这 8 楼，**中间漏掉的楼层（10 楼之前发生了什么）没有出口**：
 *   摘要（summarizer）压缩的是「结论」，不保证覆盖每一楼；pmem 是人物主观
 *   记忆；world-reader 是世界状态快照。三者都不答「这一段聊天里，哪些楼层
 *   从来没进过任何一次上下文」。
 *
 * ── 机制（显式写明来源：RUBY /flushread 增量阅读的 WorldAxis 版）────
 *   每个分支（m{idx}_s{swipe}，与 backstage.anchorBranchId 同构）一条书签，
 *   记「已读到哪一楼」。推演结算成功后把书签推进到该锚点——推演看过的
 *   楼层就是已读楼层。下次推演时，若「书签 → 最新锚」之间存在**漏楼段**
 *   （长度 > 0 且未被摘要覆盖），补读块把它们点名出来。
 *
 * ── 八条否定式边界 ─────────────────────────────────────────────
 *   ① 唯一 store 写面：只写 `draft.reading.marks`（骨架已声明，evict 站点
 *      'reading.marks' cap 24）。不碰任何其他容器。
 *   ② 总开关默认关闭（settingsBus），关闭时 mark/catchUpBlock 一律空转。
 *   ③ 书签只前进不后退：新锚 idx < 已存 idx 的回退请求**如实拒绝**（ rewind
 *      是显式 reset，不是静默覆盖——静默回退会让「已读」变成假账）。
 *   ④ 补读块只点名「哪几楼没进过上下文」，不伪造内容——楼的内容由
 *      调用方用 recentText 的同款读法现取，本模块不复制一份文本。
 *   ⑤ 分支隔离：切分支/切滑动就是不同的书签行，互不覆盖。
 *   ⑥ 每分支只一条书签（upsert，不是 append）。
 *   ⑦ 零模型调用、零 worldbook 写、零 settingsBus 写。
 *   ⑧ 摘要覆盖面豁免：若 summarizer 的游标已声明覆盖到某楼（endLayer >= 该楼），
 *      该楼不算漏楼——摘要已把它压进结论，再点名就是重复喂。
 *      游标读不到时**如实按「无豁免」算**（宁可多点名，不静默缩小覆盖面）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_reading_bookmark_settings_v1';
  const DEF = { enabled: false, maxCatchupFloors: 12 };
  const __REG = { key: LS_KEY, def: DEF, module: 'readingBookmark' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try { return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {})); }
    catch (e) { return Object.assign({}, DEF); }
  }
  // 分支族键（v2.407.0 · 主线B）：宿主 store.currentBranchId() 与 backstage.anchorBranchId()
  //   都是「最新锚派生」的 m{idx}_s{swipe}——它标识一次结算的**出处**，不是稳定的分支树 id
  //   （实测 core/store.js:5107）。书签不能把这种键当成一条不可变分支行去 upsert：
  //   每推进一楼 idx 就变，pending() 拿最新锚查同一行永远查不到旧行 ⇒ 补读恒为空。
  //   故：mark 按 swipe 族 upsert，锚点键另记出处；旧存档的「已读到哪一楼」由
  //   **同 swipe 族的所有行取最大 idx** 得到（跨楼层复用）；不同 swipe 族互不污染。
  //   这正是 AVS V4PROD「楼层绑定 + 切回旧分支直接恢复、不重新猜、其它分支不污染当前」
  //   在 WorldAxis 现有骨架里的最小落地：零新顶层字段、零 store 写面扩张。
  function branchKey(anchor) {
    if (!anchor || typeof anchor.idx !== 'number') return '';
    return 'm' + anchor.idx + '_s' + (anchor.swipe || 0);
  }
  // 族键：只认 swipe 变体（宿主没有稳定 branchId 字段时不编一个出来）。
  function familyOf(anchor) {
    if (!anchor || typeof anchor.idx !== 'number') return '';
    return 's' + (anchor.swipe || 0);
  }
  function familyOfKey(key) {
    const m = /_s(\d+)$/.exec(String(key || ''));
    return m ? 's' + m[1] : '';
  }

  // marks 读面：保证容器存在（骨架已声明，防御旧存档）。
  function marksOf() {
    const s = WA.store.get();
    if (!s.reading || !Array.isArray(s.reading.marks)) return [];
    return s.reading.marks;
  }

  // mark(anchor)：把「这个 swipe 族已读到 anchor.idx」落账。同族 upsert + 只前进。
  //   行主键 = 族键（跨楼层复用）；anchoredAt 记本次结算的锚点出处，供审计但不参与查表。
  //   返回 {ok, reason?, mark?}——关闭/缺参/回退都如实报，不静默。
  function mark(anchor) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    if (!anchor || typeof anchor.idx !== 'number') return { ok: false, reason: 'missing-anchor' };
    const fam = familyOf(anchor);
    const atKey = branchKey(anchor);
    if (!fam || !atKey) return { ok: false, reason: 'missing-anchor' };
    let out = null;
    WA.store.transact(function (draft) {
      if (!draft.reading || !Array.isArray(draft.reading.marks)) draft.reading = { marks: [] };
      const row = draft.reading.marks.find(m => m.branch === fam);
      if (row) {
        if (anchor.idx < row.idx) { out = { ok: false, reason: 'rewind-denied', mark: { branch: fam, idx: row.idx, swipe: row.swipe || 0 } }; return; }
        row.lastAnchorKey = atKey;
        row.at = anchor.hash || row.at;
        if (anchor.idx === row.idx) { out = { ok: true, outcome: 'same', mark: row }; return; }
        row.idx = anchor.idx; row.swipe = anchor.swipe || 0;
        out = { ok: true, outcome: 'advanced', mark: row };
      } else {
        const row = { branch: fam, idx: anchor.idx, swipe: anchor.swipe || 0, at: anchor.hash || '',
          lastAnchorKey: atKey, setAt: (WA.clock && WA.clock.now ? WA.clock.now('reading-bookmark') : Date.now()) };
        draft.reading.marks.push(row);
        if (WA.evict) WA.evict.array(draft.reading.marks, 'reading.marks');
        out = { ok: true, outcome: 'new', mark: row };
      }
    });
    return out || { ok: false, reason: 'transact-no-output' };
  }

  // reset(branch?)：显式回退口。带族键（s{n}）只清该族；不带清全部。
  //   也接受锚点键（m{idx}_s{n}）——取它的族再清，避免调用方拿旧 API 静默失效。
  function reset(branch) {
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const fam = branch ? (familyOfKey(branch) || String(branch)) : '';
    WA.store.transact(function (draft) {
      if (!draft.reading || !Array.isArray(draft.reading.marks)) { draft.reading = { marks: [] }; return; }
      if (!fam) { draft.reading.marks = []; return; }
      draft.reading.marks = draft.reading.marks.filter(m => m.branch !== fam);
    });
    return { ok: true, family: fam || 'all' };
  }

  // 摘要豁免游标：summarizer 的最后一条纪要覆盖到哪一楼。读不到按 -1（无豁免）。
  function summaryCursor() {
    try {
      const s = WA.store.get();
      const arr = (s.memory && s.memory.smallSummaries) || [];
      const last = arr.slice(-1)[0];
      return (last && typeof last.endLayer === 'number') ? last.endLayer : -1;
    } catch (e) { return -1; }
  }

  // pending(anchor)：漏楼计算（纯只读）。返回：
  //   { ok, reason?, from?, to?, floors?, coveredBySummary? }
  //   漏楼段 = (书签idx, 最新锚idx] 且 idx > summaryCursor（摘要已覆盖的不算）。
  function pending(anchor) {
    if (!anchor || typeof anchor.idx !== 'number') return { ok: false, reason: 'missing-anchor' };
    const fam = familyOf(anchor);
    if (!fam) return { ok: false, reason: 'missing-anchor' };
    const marks = marksOf();
    // 兼容旧存档：旧行主键是 m{idx}_s{swipe}（锚点键），取它的族再并入同族最大 idx。
    let readUpTo = -1;
    let rowCount = 0;
    marks.forEach(function (m) {
      if (!m || typeof m.idx !== 'number') return;
      const same = m.branch === fam || familyOfKey(m.branch) === fam;
      if (!same) return;
      rowCount++;
      if (m.idx > readUpTo) readUpTo = m.idx;
    });
    const coveredBySummary = summaryCursor();
    const from = Math.max(readUpTo + 1, coveredBySummary + 1);
    const to = anchor.idx - 1; // 最新锚本身在 recentText 里，不算漏楼
    if (from > to) return { ok: true, outcome: 'none', from: from, to: to, floors: 0, readUpTo: readUpTo, family: fam, rows: rowCount };
    return { ok: true, outcome: 'gaps', from: from, to: to, floors: to - from + 1, readUpTo: readUpTo, coveredBySummary: coveredBySummary, family: fam, rows: rowCount };
  }

  // catchUpBlock(anchor)：补读注入块。空缺时返回空串（注入面零成本）。
  // 超出 maxCatchupFloors 只点名计数，不虚报「已点名全部」。
  function catchUpBlock(anchor) {
    if (!settings().enabled) return '';
    const p = pending(anchor);
    if (!p.ok || p.outcome !== 'gaps') return '';
    const cap = settings().maxCatchupFloors;
    const total = p.floors;
    const listFrom = Math.max(p.from, p.to - cap + 1);
    const lines = [];
    for (let i = listFrom; i <= p.to; i++) lines.push('第' + i + '楼');
    const head = '【漏楼补读】书签在第' + p.readUpTo + '楼，最新锚在第' + (p.to + 1) + '楼，之间有 ' + total + ' 楼未进过任何上下文';
    const tail = total > (p.to - listFrom + 1) ? '（仅列出最近 ' + (p.to - listFrom + 1) + ' 楼，其余 ' + (total - (p.to - listFrom + 1)) + ' 楼同样未读）' : '';
    return head + tail + '：' + lines.join('、') + '。请结合这些楼层可能产生的影响推演；若无法确认内容，如实按「信息不足」处理，不要编造。';
  }

  // view()：读侧——全部书签 + 开关态。
  function view() {
    return { settings: settings(), marks: marksOf().map(m => Object.assign({}, m)) };
  }

  WA.readingBookmark = {
    mark: mark, reset: reset, pending: pending, catchUpBlock: catchUpBlock, view: view, branchKey: branchKey
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/reading-bookmark.js', { kind: 'engine', ver: '2.407.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/reading-bookmark 已加载（2.407.0）');

  // settings 面：面板开关需要（getSettings/setSettings 同 memory-relay 惯例）。
  WA.readingBookmark.getSettings = function () { return settings(); };
  WA.readingBookmark.setSettings = function (patch) {
    if (!WA.settingsBus) return { ok: false, reason: 'settings-bus-absent' };
    try {
      const next = WA.settingsBus.normalize(__REG, Object.assign({}, DEF, settings(), patch || {}));
      WA.settingsBus.saveOrThrow(__REG, next);
      return { ok: true, settings: settings() };
    } catch (e) { return { ok: false, reason: 'save-failed', error: String(e && e.message || e) }; }
  };
})();