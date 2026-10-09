/**
 * WorldAxis engines/storyclock.js (v2.129.0) — 正文时间锚点（缝 A3）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓有两个「时间」，而它们从不互相校准：
 *     · **世界钟**（`core/clock.js` + `engines/calendar.js` / `engines/chrono.js`）——
 *       本扩展自己的推演时间，由结算写入 `state.clock`；
 *     · **正文里的时间**——模型在回复里实际写出的「次日清晨」「三天后」。
 *   两者可以差出十天而**全库不可观测**：`engines/contract-audit.js` 有 `clock` 探针、
 *   `engines/chrono.js` 有时间面，但没有任何一条边是「从正文回读」。
 *   于是「世界钟写着第 3 日、正文已经过了半个月」这种漂移只能靠用户自己发现。
 *
 *   缝合来源：ST-SevenDaysCal `debug-sessions/2026-08-08-time-anchor-system.md`
 *   （已落代码于分支 `feature/story-clock`）。原文机制的三个要点，本模块逐一照搬：
 *     ① 强制注桩：主楼 AI 每楼在正文首尾产出 `<!-- SDC-start … -->` / `<!-- SDC-end … -->`；
 *     ② 回读从**末楼往回扫**，多层兜底（最近一楼没有就往前找）；
 *     ③ 标签**留在 `message.mes` 里绝不真删** —— 命门是「下楼主模型看得见上楼 end，
 *        自然以它为基准往前推」，删了标签这一整条链就断了。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `parseStamp(text)` —— 从一段正文里取出时间标签（纯函数，不认识就如实说 `no-stamp`）；
 *   ② `readLatest(list)` —— 从楼层数组**从末往前**扫出最近一个锚点（带扫了几层）；
 *   ③ `audit(label)` —— 把「正文锚点」与「世界钟」对账，答「差多少」。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `discipline()` 返回空串（不注桩），`readLatest` 报 `disabled`。
 *   2 本模块**从不改写正文**：`parseStamp` 只读；读取不删标签、不改 `message.mes`。
 *      「标签必须留在正文里」是本模块唯一的命门约束，由测试负控制钉住。
 *   3 只认**成对**标签的 start 段。只有 end、或 start 无闭合 `-->` ⇒ 如实报 `no-stamp`
 *      （不去猜「可能是时间」）。
 *   4 缺省取**最后一层**（最靠近当前楼的锚点）；扫不到就报 `no-stamp` 并带上扫了几层。
 *   5 `audit` 只比字符串标签，**不做自然语言时间解析** ——「次日清晨」与「第 2 日·清晨」
 *      是不是同一天，本模块答不了，也不假装答得了（答不了的事不编答案）。
 *   6 世界钟为空时 `audit` 报 `empty`（不是「一致」）：两个空值相等不构成证据。
 *   7 不写 store、不进存档：锚点是正文本体的一部分，本模块只读正文。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_storyclock_settings_v1';
  const DEF = { enabled: false, maxScan: 40, driftWarn: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'storyclock', bounds: { maxScan: [4, 200], driftWarn: [0, 30] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { reads: 0, hits: 0, misses: 0, audits: 0, drifts: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }

  const MARK = 'SDC';
  // 只认成对的 start 段：`<!-- SDC-start 第3日·清晨 -->`。`[^\->]` 防止吃掉闭合符。
  const START_RE = /<!--\s*SDC-start\s*([^\-]*?)\s*-->/;
  const END_RE = /<!--\s*SDC-end\s*[^\-]*?-->/;

  /** 从一段正文里取时间标签。纯函数：不抛、不写、不猜。 */
  function parseStamp(text) {
    if (typeof text !== 'string' || !text) { return { ok: false, reason: 'empty-text' }; }
    const m = START_RE.exec(text);
    if (!m) { noteFault('not-found'); return { ok: false, reason: 'not-found' }; }
    const label = m[1].trim();
    if (!label) { noteFault('not-found'); return { ok: false, reason: 'not-found' }; }
    return { ok: true, label: label, at: m.index, paired: END_RE.test(text) };
  }

  /** 从楼层数组**从末往前**扫最近一个锚点。list 可为字符串数组或 `{mes}` 对象数组。 */
  function readLatest(list, opts) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!Array.isArray(list)) { noteFault('not-array'); return { ok: false, reason: 'not-array' }; }
    const o = opts || {};
    const limit = (typeof o.maxScan === 'number' && o.maxScan > 0) ? Math.min(o.maxScan, settings().maxScan) : settings().maxScan;
    let scanned = 0;
    for (let i = list.length - 1; i >= 0 && scanned < limit; i--) {
      const m = list[i];
      const txt = (typeof m === 'string') ? m : (m && typeof m.mes === 'string' ? m.mes : '');
      scanned++;
      const p = parseStamp(txt);
      if (p.ok) {
        stat.reads++; stat.hits++; stat.lastReason = 'hit';
        return { ok: true, index: i, fromEnd: list.length - 1 - i, label: p.label, paired: p.paired, scanned: scanned };
      }
    }
    stat.reads++; stat.misses++; stat.lastReason = 'not-found';
    return { ok: false, reason: 'not-found', scanned: scanned, scannedLimit: limit };
  }

  /** 正文锚点 ⇄ 世界钟 对账。只比标签字符串，不做时间解析。 */
  function audit(label, opts) {
    const o = opts || {};
    const mine = (typeof label === 'string') ? label.trim() : '';
    if (!mine) { noteFault('empty-text'); return { ok: false, reason: 'empty-text' }; }
    stat.audits++;
    let clockLabel = '';
    try { clockLabel = (WA.store && WA.store.get && WA.store.get().clock && WA.store.get().clock.label) || ''; } catch (e) { clockLabel = ''; }
    if (!clockLabel) { noteFault('empty'); return { ok: false, reason: 'empty', note: '世界钟未设定，两个空值相等不构成证据', text: mine }; }
    const same = clockLabel === mine;
    const out = { ok: true, same: same, text: mine, clock: clockLabel, driftWarn: settings().driftWarn };
    if (!same) { stat.drifts++; out.detail = '正文锚点「' + mine + '」与世界钟「' + clockLabel + '」不一致'; }
    return out;
  }

  /** 注桩文本（总开关默认关闭 ⇒ 返回空串，什么都不注入）。 */
  function discipline() {
    if (!settings().enabled) return '';
    return '[正文时间锚点] 每楼正文**必须**在首部产出且仅产出一个时间标签，形如：\n'
      + '<!-- ' + MARK + '-start 第3日·清晨 -->\n'
      + '并在正文尾部产出闭合标注：<!-- ' + MARK + '-end -->\n'
      + '铁律：标签是正文的一部分，**任何情况下都不得删除或改写**——下一楼要据此往前推时间。\n'
      + '时间必须是**绝对坐标**（第几日 + 时辰），不得只写「次日」「三天后」这类相对词。\n';
  }

  WA.storyclock = {
    MARK: MARK,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    parseStamp: parseStamp, readLatest: readLatest, audit: audit, discipline: discipline,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/storyclock.js', { kind: 'engine', ver: '2.129.0' });
})();
