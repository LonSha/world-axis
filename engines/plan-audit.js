/**
 * WorldAxis engines/plan-audit.js (v2.189.0) — 未来安排复验（缝 A2）
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   本仓会**提前**安排事：`chapters` 的 `script`（这一章打算怎么走）、
 *   `beat-ledger` 的 pending 拍（还没演的拍）、`campaign` 的阶段。
 *   而**没有任何一处回过头问一句**：「往后还没演的那些，在**已经发生的这些事**之后，
 *   还成立吗？」
 *   实测：`复验` / `篇章检查` / `未来章` / `unwritten` / `revalidate` 在 `engines` **零命中**
 *   （唯一的两个「校准」命中是**两个钟**的同步，语义无关）。
 *
 *   后果是上游 story-director 在 README 里写下的那个现场，一字不差：
 *   > 这正是「我明明没帮忙，她却安然度过」那类问题的解药：
 *   > **旧章刚完是最该回头的时刻**，而不是等下一章撞上墙。
 *   本仓的《主角不去救、后文却按他已经救了写》只能等演到那一章才炸。
 *
 *   缝合来源：SnowIII/story-director（MIT）`README §每章演完后：篇章检查`。原文口径：
 *     · 「**它只是检查，不是重生成**」——成立就**一字不改**；
 *     · 只有真走不通的那几章才改，**已经写过的章与标题一个字都不动**；
 *     · 「**要改就小改**」：换成**同一批人、同一处地方能自然发生的等价安排**
 *       （换个人推动 / 换个场合 / 换一种施压方式）——**不许引入新的灾变 / 机关 / 更大的事件**；
 *     · 「**不许掀掉你正奔向的东西**」——天降灾变 / 第三方插手 / 「就在…即将…之际，突然…」
 *       一律不许；变局要与那件事**并存、或在它之后**；
 *     · 也不许为了让角色脱困而降下一个**刚好解围的巧合**；
 *     · 「**你还没做 ≠ 不成立**」——判断只看**已经写进正文的事**。
 *       你没做、还没出手只是**还没演**，不据此提前作废后面的章（以前最容易在这里误伤）。
 *
 * ── 本模块只做两件事，每件一个硬条件 ─────────────────────────
 *   ① `audit(items)` —— 拿一组**未写的安排**去与已发生的事实对账，逐条给
 *      `stands` / `needs-adjust`，并**把依据读出来**（不是给一个分数）；
 *   ② `equivalent(before, after)` —— 改法是否**等价**（同批人、同场合）之机械判据：
 *      引入了新的人 / 新地点 / 新灾变词 ⇒ `not-equivalent` 并指出是哪一类。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `audit` 返回 `disabled`。
 *   2 **本模块是纯只读面**：全文零 `store.transact`、零 `draft.` 赋值 ——
 *      「只看不写」不是口号，是它的存在意义（谁把复验写进状态，谁就把一份**必然过期**的
 *      读数固化了：世界一动，那份「还成立吗」的答案就变成假账）。
 *   3 **「还没做」不等于「不成立」**：依据面只读**已发生**的三处事实源
 *      （`chronicle` 已归档纪事 / `worldFacts` 已结算世界事实 / `evolution.events` 已登记事件）。
 *      pending 的拍、未推进的阶段**不进依据面**。
 *   4 **不在场的人不算缺**：安排里提到而在 `people` 里**一个人都没有** ⇒ 报 `unknown-cast`
 *      且**只有这一条**按 `needs-adjust` 计；把「没这个人」静默折成「不成立」是另一类错。
 *   5 **未知不得代替**：依据面读不到（store 未装载 / 三个来源都空）⇒ 逐条报 `unreadable`，
 *      **既不报 stands 也不报 needs-adjust** —— 「读不到」与「不成立」必须分得开。
 *   6 **不许引入新东西**：`equivalent` 里新增人物名 / 新增地点（不在具名地点表内）/
 *      命中灾变词表（`突然` / `就在这时` / `忽然` / `天降` / `之际`）⇒ 一律 `not-equivalent`，
 *      并逐类报出命中项（不许只说「不等价」）。
 *   7 **已写过的章不进本模块的输入面**：`audit` 只接受未被 `landed` 的安排；
 *      传进来的条目若自带 `landed:true` ⇒ `already-written` 拒收（不许拿它当待改项）。
 *   8 零 token 占用：本模块**没有** `buildBlock`（它不注入正文，只给面板与门禁读）。
 *
 * ── 与既有两个面的分工（不写清就会长出第三本账）────────────────
 *   · 与 `beat-mask`：mask 遮住**未来拍**防剧透（可见性）；本模块复验**未来拍还成不成立**
 *     （一致性）。两者都读拍，但一个管「给不给看」，一个管「还对不对」。
 *   · 与 `dep-check`（E8）：dep-check 查**模块依赖**是否漂移；本模块查**剧情安排**是否漂移。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_plan_audit_settings_v1';
  const DEF = { enabled: false, maxItems: 24, evidenceCap: 6 };
  const __REG = { key: LS_KEY, def: DEF, module: 'planAudit', bounds: { maxItems: [4, 64], evidenceCap: [2, 12] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { audits: 0, items: 0, stands: 0, needsAdjust: 0, unreadable: 0, equivs: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }

  /** 灾变词表（上游原话：「天降灾变 / 第三方插手 / 就在…即将…之际，突然…」一律不许）。 */
  const DISASTER_WORDS = ['突然', '忽然', '就在这时', '之际', '天降', '凭空', '不知为何', '怎料', '不料'];
  /** 地点词表（判「换了场合」用；不在表内的新地名一律算新地点）。 */
  const PLACE_WORDS = ['家', '屋里', '屋外', '门外', '楼上', '楼下', '院子', '街', '巷', '店里', '铺子',
    '集市', '车站', '车厢', '校', '教室', '办公室', '医院', '公园', '河边', '桥', '山', '林', '田',
    '客栈', '酒馆', '茶楼', '大厅', '走廊', '天台', '地下室', '书房', '卧室', '客厅', '厨房', '阳台'];

  /** 文字里出现的人名：从 people 的名字表 + 安排文本里对照（未知即 unknown-cast）。 */
  function peopleNames() {
    const out = [];
    try {
      const s = (WA.store && WA.store.get && WA.store.get()) || {};
      const p = s.people || {};
      Object.keys(p).forEach(function (id) {
        const row = p[id] || {};
        [row.name, id].forEach(function (n) { const v = clean(n, 40); if (v && out.indexOf(v) < 0) out.push(v); });
      });
    } catch (e) {}
    return out;
  }
  /** 已发生事实的**三个真源**（只读；边界 3）。返回 {facts, sources, readable}。 */
  function evidence() {
    const facts = [];
    const sources = { chronicle: 0, worldFacts: 0, evolutionEvents: 0 };
    let readable = false;
    try {
      const s = (WA.store && WA.store.get && WA.store.get()) || null;
      if (s) {
        readable = true;
        (s.chronicle || []).forEach(function (c) {
          if (!c) return;
          sources.chronicle++;
          const t = clean(c.title, 80) + ' ' + clean(c.summary, 160);
          if (t.trim()) facts.push({ from: 'chronicle', text: t, at: c.at || 0 });
        });
        (s.worldFacts || []).forEach(function (f) {
          if (!f) return;
          sources.worldFacts++;
          const t = clean(f.key, 80) + ' ' + clean(f.value, 160);
          if (t.trim()) facts.push({ from: 'worldFacts', text: t, at: f.at || 0 });
        });
        const evs = (s.evolution && s.evolution.events) || [];
        evs.forEach(function (e) {
          if (!e) return;
          sources.evolutionEvents++;
          const t = clean(e.name || e.title, 80) + ' ' + clean(e.stage, 40);
          if (t.trim()) facts.push({ from: 'evolution', text: t, at: e.at || 0 });
        });
      }
    } catch (e) { readable = false; }
    return { facts: facts, sources: sources, readable: readable };
  }

  /**
   * 复验一组**未写的安排**。
   * @param {Array<{id?:string,title:string,cast?:string[],place?:string,premise?:string,landed?:boolean}>} items
   */
  function audit(items) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const list = Array.isArray(items) ? items.slice(0, cfg.maxItems) : [];
    if (!list.length) { noteFault('empty-input'); return { ok: false, reason: 'empty-input' }; }
    // 边界 7：已写过的章不进输入面
    const written = list.filter(function (it) { return it && it.landed === true; });
    if (written.length) {
      noteFault('already-written');
      return { ok: false, reason: 'already-written', count: written.length, detail: '已写过的不在复验面（它不再是可以改的东西）' };
    }
    const ev = evidence();
    const names = peopleNames();
    const results = list.map(function (raw) {
      const it = raw || {};
      const title = clean(it.title, 80);
      const cast = Array.isArray(it.cast) ? it.cast.map(function (c) { return clean(c, 40); }).filter(Boolean) : [];
      const place = clean(it.place, 40);
      const premise = clean(it.premise, 240);
      const blob = title + ' ' + premise + ' ' + cast.join(' ');
      const hitFacts = [];
      if (!ev.readable) {
        // 边界 5：读不到 ≠ 不成立
        return { id: clean(it.id, 40) || title, title: title, state: 'unreadable', why: 'store-unavailable', evidence: [] };
      }
      // 边界 4：「不在场的人」单独一类：**在场判据必须是精确名匹配**，不能拿 `cast.join(' ')` 去
      //   跟关键词逐个比 —— 「阿明」会被判成「在 people 里」（哪怕 people 里只有「阿明星」），
      //   于是 unknown-cast 这条码**紧跟在缺铺垫之后、永远轮不到**（存在但不可证）。
      const unknownCast = cast.filter(function (c) { return names.indexOf(c) < 0; });
      // 找依据：安排文本里的关键词与已发生事实的重合（只做**有据可查**的比对，不做语义判断）
      const keys = (title + ' ' + premise).split(/[\s，。、；：！？,.!?;:]+/).filter(function (w) { return w && w.length >= 2; });
      ev.facts.forEach(function (f) {
        for (let i = 0; i < keys.length; i++) {
          if (f.text.indexOf(keys[i]) >= 0) { hitFacts.push({ from: f.from, key: keys[i], text: f.text }); return; }
        }
      });
      const out = {
        id: clean(it.id, 40) || title,
        title: title,
        cast: cast.slice(),
        place: place,
        evidence: hitFacts.slice(0, cfg.evidenceCap)
      };
      if (unknownCast.length) {
        out.state = 'needs-adjust';
        out.why = 'unknown-cast';
        out.detail = '这些人在 people 里不存在：' + unknownCast.join('、') + '（「没这个人」与「不成立」是两件事）';
      } else if (hitFacts.length) {
        out.state = 'stands';
        out.why = 'grounded';
        out.detail = '与已发生的事实对得上（' + hitFacts.length + ' 条依据）';
      } else {
        // 没有任何依据：**未知不得代替**——报 stands 会把「没查」当「查过了」
        out.state = 'unreadable';
        out.why = ev.facts.length ? 'no-grounding' : 'empty-evidence';
        out.detail = ev.facts.length ? '在已发生的事实里找不到支撑，也没找到冲突' : '依据面三个来源都是空的';
      }
      return out;
    });
    const stands = results.filter(function (r) { return r.state === 'stands'; }).length;
    const adjust = results.filter(function (r) { return r.state === 'needs-adjust'; }).length;
    const unknown = results.filter(function (r) { return r.state === 'unreadable'; }).length;
    stat.audits++; stat.items += results.length;
    stat.stands += stands; stat.needsAdjust += adjust; stat.unreadable += unknown;
    return {
      ok: true,
      // 三态分开报（合成一个「不通过」之后用户答不出该补什么）
      total: results.length, stands: stands, needsAdjust: adjust, unreadable: unknown,
      sources: ev.sources,
      results: results,
      // 上游纪律原样交给调用方（这是给**人**看的，不是给模型看的）
      rules: [
        '只核不写：成立就一字不改',
        '要改就小改：同一批人、同一处地方能自然发生的等价安排',
        '不许引入新的灾变 / 机关 / 更大的事件；不许刚好解围的巧合',
        '你还没做 ≠ 不成立：判断只看已经写进正文的事'
      ]
    };
  }

  /**
   * 改法是否**等价**（上游三条口径的机械判据）。
   * @param {{cast?:string[], place?:string, text?:string}} before
   * @param {{cast?:string[], place?:string, text?:string}} after
   */
  function equivalent(before, after) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const b = before || {}, a = after || {};
    const bc = Array.isArray(b.cast) ? b.cast.map(function (x) { return clean(x, 40); }).filter(Boolean) : [];
    const ac = Array.isArray(a.cast) ? a.cast.map(function (x) { return clean(x, 40); }).filter(Boolean) : [];
    const bp = clean(b.place, 40), ap = clean(a.place, 40);
    const at = clean(a.text, 400);
    const issues = [];
    const newCast = ac.filter(function (c) { return bc.indexOf(c) < 0; });
    const goneCast = bc.filter(function (c) { return ac.indexOf(c) < 0; });
    if (newCast.length) issues.push({ kind: 'new-cast', items: newCast, detail: '小改不许引入新的人：' + newCast.join('、') });
    if (goneCast.length) issues.push({ kind: 'dropped-cast', items: goneCast, detail: '小改把原定的人换掉了：' + goneCast.join('、') });
    if (ap && !PLACE_WORDS.some(function (w) { return ap.indexOf(w) >= 0; })) {
      issues.push({ kind: 'new-place', items: [ap], detail: '「' + ap + '」不在具名地点表内 ⇒ 当作新地点' });
    }
    const hits = DISASTER_WORDS.filter(function (w) { return at.indexOf(w) >= 0; });
    if (hits.length) issues.push({ kind: 'disaster-word', items: hits, detail: '改动里出现灾变/巧合口吻：' + hits.join('、') + '（不许天降变局，变局只能与那件事并存或在它之后）' });
    stat.equivs++;
    const payload = { issues: issues, before: { cast: bc, place: bp }, after: { cast: ac, place: ap } };
    // ⚠ 与 beat-report 同规：拒收码写成**内联字面量**，不用 `reason: ok ? '' : 'x'` 三元形态
    //   —— 三元里的码逃出拒收码扫描面（CODE_RE 只认 `reason: 'x'`），
    //   于是「源码里存在、账本里看不见」，而漏掉的正是本模块最该被门禁盯住的那一条。
    if (issues.length) {
      stat.refused++;
      noteFault('not-equivalent');
      return Object.assign({ ok: false, reason: 'not-equivalent' }, payload);
    }
    return Object.assign({ ok: true, reason: '' }, payload);
  }

  function diagnose() {
    const cfg = settings();
    const ev = evidence();
    return {
      enabled: cfg.enabled,
      readOnly: true,
      sources: ev.sources,
      facts: ev.facts.length,
      cast: peopleNames().length,
      disasterWords: DISASTER_WORDS.slice(),
      places: PLACE_WORDS.length,
      notes: [
        '纯只读：全文零 store.transact（复验结果落盘等于把必然过期的读数固化）',
        '依据面只读已发生：pending 拍与未推进阶段不进依据面（你还没做 ≠ 不成立）',
        '三态分开：stands / needs-adjust / unreadable —— 读不到不得当成不成立'
      ]
    };
  }

  WA.planAudit = {
    DISASTER_WORDS: DISASTER_WORDS.slice(),
    PLACE_WORDS: PLACE_WORDS.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    audit: audit, equivalent: equivalent,
    evidence: evidence, diagnose: diagnose,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/plan-audit.js', { kind: 'engine', ver: '2.189.0' });
})();