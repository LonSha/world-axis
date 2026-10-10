/**
 * WorldAxis engines/beat-ledger.js (v2.189.0) — 拍账 / 拍号由引擎推进（缝 A3）
 *
 * ── 它治什么（缺口，现场实测）──────────────────────────────────
 *   本仓有「章」（`chapters`）、有「阶段」（`campaign` 的谓词）、有「相位」
 *   （`rhythm-loop`），**没有一个「拍」**。
 *   实测：`拍` / `beat` 散落在 18 个引擎，但清一色是**别的东西** ——
 *   `beat-mask` 是遮未来节拍、`rhythm-loop` 是张弛相位、`chapters` 是章。
 *   没有任何一处回答得了这三句：「现在演到第几拍」「这一拍落了没有」「谁在推进拍号」。
 *
 *   而「谁在推进」恰恰是最贵的一问。上游 story-director 把答案写在 README 里：
 *   > **拍号由插件推进** —— 模型自己改 `当前拍` 不算数，节奏不会被偷偷踩油门。
 *   本仓没有这一层，于是「模型顺手把当前拍改到第 5 拍」在状态里与「引擎推到了第 5 拍」
 *   长得一模一样 —— 这与本仓反复治过的「两件不同的事在读数上同形」是同一家族。
 *
 *   缝合来源：SnowIII/story-director（MIT）`README §节奏控制` 的节奏铁律两条：
 *     ① 「换场必须先演过渡（不许一句话从宿舍切到列车）」；
 *     ② 「拍号由插件推进 —— 模型自己改 `当前拍` 不算数」。
 *   第二条是本模块的骨架；第一条本来只是注入文本里的一句纪律，本模块把它落成**可判定**的
 *   一件事（`transition` 的硬条件），因为「内容纪律」在本仓的口径是：能判的就不只写给人看。
 *
 * ── 本模块只做四件事，每件一个硬条件 ─────────────────────────
 *   ① `plan(titles)`  —— 登记本幕的拍序（**只替换未落下的拍**，已落的一拍不动）；
 *   ② `land()`        —— 落一拍：**引擎是唯一推进者**，且不许跳拍；
 *   ③ `claim(no)`     —— 模型自报「我现在在第几拍」：与引擎账不符 ⇒ 如实拒收并留痕；
 *   ④ `transition()`  —— 换场必须给出过渡桥段（`from !== to` 而无 `via` ⇒ `hard-cut`）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `plan` / `land` / `claim` / `transition` 报 `disabled`。
 *   2 **拍号单调不减**，且 `land` 只认**当前拍**：跳拍报 `out-of-order` 并带 `expected`。
 *      跳拍会让「第几拍落了」失去意义（那是本模块唯一的计量真源）。
 *   3 **模型自改拍号不算数**：`claim(no)` 与引擎账不符 ⇒ `beat-order-locked`，
 *      **不改台账**，只把 `overwrites` 计数与最近一次自改的 `claimed` 记下（自改必须可查）。
 *   4 **已落的拍不得改写**：`plan` 只替换 `status === 'pending'` 的尾部；
 *      已落拍的标题被改报 `landed-immutable` —— 演过的东西是既成事实。
 *   5 **换场必有过渡**：`from !== to` 而 `via` 为空 ⇒ `hard-cut`，**不落账**。
 *      同一场内（`from === to`）不需要过渡（那不是换场，是同场的下一个画面）。
 *   6 拍标题必须非空（`missing-title`）；空标题会让「这一拍讲什么」只能靠读正文猜。
 *   7 台账有界且挤出有账：站点 `beatLedger.rows` 走 `evict` 单一出口。
 *   8 不判断剧情语义：本模块只记账、只推进、只拦自改 ——
 *      「这一拍写得对不对」是 `beat-report` 与各专锁的事，不是账本的事。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_beat_ledger_settings_v1';
  const STATUSES = ['pending', 'landed'];
  const DEF = { enabled: false, maxRows: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'beatLedger', bounds: { maxRows: [8, 64] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { plans: 0, lands: 0, claims: 0, refuses: 0, transitions: 0, hardCuts: 0, blocks: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }
  /**
   * 轮次严格判定。**刻意不用 `inputGuard.count`** —— 实测它把所有坏输入塌成 0
   *   （`count('abc')===0`、`count(NaN)===0`），于是「轮次坏了」与「第 0 轮」同形，
   *   而 `bad-round` 会因此**写得出、跑不到**（拒收码门禁要抓的正是这种「存在但不可证」）。
   */
  function roundOf(v) {
    if (v === undefined || v === null || v === '') {
      try {
        const s = (WA.store && WA.store.get && WA.store.get()) || null;
        if (WA.evolution && typeof WA.evolution.roundOf === 'function') {
          const n0 = WA.evolution.roundOf(s);
          return (typeof n0 === 'number' && isFinite(n0) && n0 >= 0) ? Math.floor(n0) : null;
        }
      } catch (e) { return null; }
      return null;
    }
    const n = (typeof v === 'number') ? v : Number(v);
    return (typeof n === 'number' && isFinite(n) && n >= 0) ? Math.floor(n) : null;
  }
  /** 给了没有（「没给」与「给坏了」是两件事，处置方向相反）。 */
  function notGiven(v) { return v === undefined || v === null || v === ''; }

  const EMPTY = { seq: 0, round: 0, rows: [], overwrites: 0, lastClaim: 0, lastVia: '' };
  function bucket(draft) {
    if (!draft.beatLedger || typeof draft.beatLedger !== 'object' || Array.isArray(draft.beatLedger)) {
      draft.beatLedger = { seq: 0, round: 0, rows: [], overwrites: 0, lastClaim: 0, lastVia: '' };
    }
    const b = draft.beatLedger;
    if (typeof b.seq !== 'number') b.seq = 0;
    if (typeof b.round !== 'number') b.round = 0;
    if (!Array.isArray(b.rows)) b.rows = [];
    if (typeof b.overwrites !== 'number') b.overwrites = 0;
    if (typeof b.lastClaim !== 'number') b.lastClaim = 0;
    if (typeof b.lastVia !== 'string') b.lastVia = '';
    return b;
  }
  function view() {
    const s = WA.store && WA.store.get ? (WA.store.get() || {}) : {};
    const b = (s.beatLedger && typeof s.beatLedger === 'object') ? s.beatLedger : EMPTY;
    return Object.assign({}, EMPTY, b, { rows: (b.rows || []).slice(-16) });
  }
  /** 当前拍（第一行 pending；全落完则 null）。**引擎是唯一推进者**：它就是这一行的号。 */
  function current() {
    const v = view();
    return (v.rows || []).filter(function (r) { return r && r.status === 'pending'; })[0] || null;
  }

  /**
   * 登记本幕的拍序。**只替换未落下的拍**（边界 4）。
   * @param {string[]} titles 拍标题序列（顺序即拍序）
   */
  function plan(titles) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const list = Array.isArray(titles) ? titles.map(function (t) { return clean(t, 60); }) : [];
    if (!list.length) { noteFault('missing-title'); return { ok: false, reason: 'missing-title', detail: '拍序不得为空' }; }
    if (list.some(function (t) { return !t; })) { noteFault('missing-title'); return { ok: false, reason: 'missing-title', detail: '拍标题必须非空（空标题会让「这一拍讲什么」只能靠读正文猜）' }; }
    let out = null;
    const tx = (WA.store && WA.store.transact) ? WA.store.transact(function (draft) {
      const b = bucket(draft);
      const landed = (b.rows || []).filter(function (r) { return r && r.status === 'landed'; });
      // 边界 4（**必须真执行，不能只写在注释里**）：已落的拍是既成事实。
      //   重排时那些拍必须在**同样位置、同样标题**上原样重复一遍；否则就是在改写历史。
      //   两种改写都当场拒收（并且**不落账**——半套替换会让「哪几拍是真的」只能靠读列表猜）：
      if (list.length < landed.length) {
        out = { ok: false, reason: 'landed-immutable', landed: landed.length, planned: list.length, detail: '已落 ' + landed.length + ' 拍；重排不得少于这个数（演过的东西是既成事实）' };
        return false;
      }
      for (let i = 0; i < landed.length; i++) {
        if (list[i] !== landed[i].title) {
          out = { ok: false, reason: 'landed-immutable', at: i + 1, was: landed[i].title, now: list[i], detail: '第 ' + (i + 1) + ' 拍已落，不得改写标题' };
          return false;
        }
      }
      const rows = landed.concat(list.slice(landed.length).map(function (t, i) {
        return { no: landed.length + i + 1, title: t, status: 'pending', at: 0, round: b.round };
      }));
      const dropped = (b.rows || []).filter(function (r) { return r && r.status === 'pending'; }).length;
      b.rows = rows;
      b.seq += 1;                       // 单调事件计数（plan 与 land 共用；诊断读它答「台账动过几次」）
      if (WA.evict) WA.evict.array(b.rows, 'beatLedger.rows', cfg.maxRows);
      out = { ok: true, landed: landed.length, planned: list.length, replacedPending: dropped, total: b.rows.length, seq: b.seq };
      return true;
    }, 'beatLedger:plan') : null;
    if (!out) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    if (out.ok) stat.plans++; else noteFault(out.reason);
    return out;
  }

  /** 落一拍（引擎推进）。`no` 可省：省略即落当前拍。给了就必须等于当前拍号（不许跳拍）。 */
  function land(opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const opt = opts || {};
    // 参数名用 opt 而非单字母 o：v2390 的幽灵读点扫描器把 `o.<点>round` 算作「顶层 round 读」（单字母 o
    //   在它的标识符集内）——那正是本仓「两件不同的事在读数上同形」的又一例：这里读的是**入参对象**，
    //   与世界状态顶层 round 毫无关系。故按事实改名，而不是放宽扫描器（放宽等于把真幽灵一起放走）。
    const round = (opt.round === undefined || opt.round === null) ? null : roundOf(opt.round);
    let out = null;
    const tx = (WA.store && WA.store.transact) ? WA.store.transact(function (draft) {
      const b = bucket(draft);
      if (round !== null) b.round = round;
      const cur = (b.rows || []).filter(function (r) { return r && r.status === 'pending'; })[0];
      if (!cur) { out = { ok: false, reason: 'no-pending', detail: '没有待落的拍（要么还没 plan，要么本幕已演完）' }; return false; }
      const asked0 = notGiven(opt.no) ? cur.no : roundOf(opt.no);
      // 边界（与 reject 档同规）：**「没给」与「给坏了」是两个码** ——
      //   没给＝用当前拍（合法）；给坏了＝轮次不是有限数（NaN 不得被当成某一拍）。
      //   合成一个 out-of-order 会让现场分不清「你跳拍了」与「你给的数根本读不出来」。
      if (asked0 === null) { out = { ok: false, reason: 'bad-round', detail: '拍号不是有限数 ⇒ 拒收' }; return false; }
      const asked = asked0;
      if (asked !== cur.no) {
        // 不许跳拍：跳拍会让「第几拍落了」失去意义
        out = { ok: false, reason: 'out-of-order', expected: cur.no, got: asked };
        return false;
      }
      cur.status = 'landed';
      cur.at = clockNow('beatLedger');
      b.seq += 1;
      const nx = (b.rows || []).filter(function (r) { return r && r.status === 'pending'; })[0] || null;
      out = { ok: true, no: cur.no, title: cur.title, next: nx ? nx.no : 0, done: !nx, seq: b.seq };
      return true;
    }, 'beatLedger:land') : null;
    if (!out) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    if (out.ok) stat.lands++; else noteFault(out.reason);
    return out;
  }

  /**
   * 模型自报「我现在在第几拍」。**与引擎账不符一律不算数**（边界 3）。
   * 不改台账、不放行 —— 只把自改记下来（不做这一笔，模型会静默踩油门而无人可见）。
   */
  function claim(no) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const asked = notGiven(no) ? null : roundOf(no);
    // 「没给」是 missing-round；「给坏了」是 bad-round —— 前者是漏了参数，后者是参数本身不是轮次。
    if (notGiven(no)) { noteFault('missing-round'); return { ok: false, reason: 'missing-round' }; }
    if (asked === null) { noteFault('bad-round'); return { ok: false, reason: 'bad-round', detail: '拍号不是有限数 ⇒ 拒收（NaN 不得被当成某一拍）' }; }
    const cur = current();
    if (!cur) { noteFault('no-pending'); return { ok: false, reason: 'no-pending' }; }
    stat.claims++;
    if (asked !== cur.no) {
      stat.refuses++;
      // 留痕：自改次数与最近一次自称（模型自己改 `当前拍` 不算数，但必须可查）
      try {
        WA.store.transact(function (draft) {
          const b = bucket(draft);
          b.overwrites += 1; b.lastClaim = asked;
          return true;
        }, 'beatLedger:claim');
      } catch (e) {}
      noteFault('beat-order-locked');
      return { ok: false, reason: 'beat-order-locked', expected: cur.no, got: asked, overwrites: view().overwrites, detail: '拍号由引擎推进，模型自改不算数' };
    }
    return { ok: true, no: cur.no, title: cur.title };
  }

  /** 换场纪律：`from !== to` 必须给出过渡桥段（`via`），否则 `hard-cut`。 */
  function transition(opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const from = clean(o.from, 60), to = clean(o.to, 60), via = clean(o.via, 120);
    if (!from || !to) { noteFault('missing-key'); return { ok: false, reason: 'missing-key', detail: 'from / to 都要给（同一场内也要明说）' }; }
    if (from === to) {
      // 同场换画面：不是换场，不需要过渡（边界 5 的另一半）
      return { ok: true, same: true, from: from, to: to, detail: '同一场内换画面，无需过渡' };
    }
    if (!via) {
      stat.hardCuts++;
      noteFault('hard-cut');
      return { ok: false, reason: 'hard-cut', from: from, to: to, detail: '换场必须先演过渡（不许一句话从宿舍切到列车）' };
    }
    let out = null;
    try {
      out = WA.store.transact(function (draft) {
        const b = bucket(draft);
        b.lastVia = from + '→' + to + '：' + via;
        return true;
      }, 'beatLedger:transition');
    } catch (e) { out = null; }
    if (!out) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.transitions++;
    return { ok: true, from: from, to: to, via: via };
  }

  /** 当前拍 + 两条铁律。关闭或没有 pending 拍时返回空串（零 token 占用）。 */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const cur = current();
    if (!cur) return '';
    stat.blocks++;
    const v = view();
    const rows = (v.rows || []).slice(-16);
    const marks = rows.map(function (r) { return (r.status === 'landed' ? '✔' : (r.no === cur.no ? '▶' : '·')) + r.no + '.' + r.title; });
    const lines = ['[拍账] 当前拍：**第 ' + cur.no + ' 拍 · ' + cur.title + '**（' + marks.join('  ') + '）'];
    lines.push('节奏铁律一：**拍号由引擎推进** —— 你自己改 `当前拍` 不算数（引擎会当场拒收并留痕）。');
    lines.push('节奏铁律二：**换场必须先演过渡** —— 不许一句话从宿舍切到列车。');
    if (v.lastVia) lines.push('（上次换场：' + v.lastVia + '）');
    return lines.join('\n') + '\n';
  }

  function diagnose() {
    const cfg = settings();
    const v = view();
    const cur = current();
    return {
      enabled: cfg.enabled,
      seq: v.seq, round: v.round,
      total: (v.rows || []).length,
      landed: (v.rows || []).filter(function (r) { return r && r.status === 'landed'; }).length,
      current: cur ? { no: cur.no, title: cur.title } : null,
      overwrites: v.overwrites, lastClaim: v.lastClaim,
      lastVia: v.lastVia,
      recent: (v.rows || []).slice(-5),
      notes: [
        '拍号单调不减、不许跳拍：land 只认当前拍',
        '模型自改拍号不改台账，只进 overwrites（自改必须可查）',
        '同一场内换画面不需要过渡；只有 from !== to 才算换场'
      ]
    };
  }

  WA.beatLedger = {
    STATUSES: STATUSES.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    plan: plan, land: land, claim: claim, transition: transition,
    view: view, current: current, buildBlock: buildBlock,
    diagnose: diagnose,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/beat-ledger.js', { kind: 'engine', ver: '2.189.0' });
})();