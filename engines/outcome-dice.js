/**
 * WorldAxis engines/outcome-dice.js (v2.524.0) — S1 单列可开关项：说了不一定成（d20 五档检定）
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   现在的现场是「玩家说什么就成什么」：`act.VERDICTS` 四档（action/refuse/delay/status-quo）
 *   由叙事方判定，没有任何一处用骰子决定玩家声明的成败。于是：
 *     撬锁必定撬开、说谎必定骗过、跳崖必定抓住——**世界对玩家没有概率**。
 *   `engines/success-grade.js` 已经把 CoC7 的六档做成**纯判据**（`grade(roll,target)`，
 *   大失败/失败/普通成功/困难成功/极难成功/大成功），但它只吃 1..100，且没有"这条判定属于
 *   哪个行动、能不能重掷"的账。本模块补的正是这两块：**d20 五档** + **一次一票（防刷）**。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   总开关（**默认关**）。关着 = 原样通过（`reason:'off'`，世界不掷骰，保持"说了就成"）；
 *   开着 = 按 `target`（1..100 的能力值）算 d20 需求，掷一颗 d20，回五档之一。
 *
 * ── 五档怎么分（d20，需求的换算 target/5 → 1..20）─────────────────
 *   roll = 1                     ⇒ 大成功（critical，rank 5）
 *   roll ≤ ⌊need/5⌋ 且 need ≥ 10 ⇒ 极难成功（extreme，rank 3）
 *   roll ≤ need                  ⇒ 成功（success，rank 1）
 *   roll > need                  ⇒ 失败（fail，rank 0）
 *   roll = 20 且 need ≤ 18       ⇒ 大失败（fumble，rank -1）
 *   注：need ≥ 19（≈能力 93 以上）时掷 20 只算失败——**不把高能力者当侥幸**，
 *   与 `success-grade` 的③同一条纪律（那边是 96..100 只对低目标算大失败）。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① **默认关**。关着不掷骰、不记账、不产出（`reason:'off'`），绝不偷偷改世界。
 *   ② **一次一票**：同一 `ticket` 只掷一次；重掷回首次结果并标 `replay:true`。
 *      —— 玩家不能"读到失败再重掷到成功"；要重掷必须换票（换票由调用方给新 id）。
 *   ③ 入参严校：`target` 必须 1..100 整数，否则 `bad-target`；`die` 只许 20 或 100，
 *      否则 `bad-roll`。**不隐式取整、不夹取**。
 *   ④ d100 模式**不另立一套判据**：直接交 `WA.successGrade.grade()`，本模块只做标签归并
 *      （困难成功/普通成功 → success）。两套骰子必须能互相印证，否则就是两套世界。
 *   ⑤ 失败与大失败**只给代价，不给惩罚判定**：本模块不扣血、不改关系、不写正文，
 *      只回 `consequence`，由 causal / act 决定怎么落地（越权改世界是别的模块的病）。
 *   ⑥ 账本有界：`diceLog` 只留最近 32 票（`__BOUNDED_CAPS` 同批登记），挤出最旧。
 *   ⑦ 纯函数 `bandOf(need, roll)` 可整表核：`ladder(target)` 给出 20 行，供专锁对读。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_outcomedice_settings_v1';
  const DEF = { enabled: false, die: 20 };
  const __REG = { key: LS_KEY, def: DEF, module: 'outcomeDice', bounds: { die: [20, 100] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const STORE_KEY = 'diceLog';
  const CAP = 32;
  const LABEL = { critical: '大成功', extreme: '极难成功', success: '成功', fail: '失败', fumble: '大失败' };
  const RANK = { fumble: -1, fail: 0, success: 1, extreme: 3, critical: 5 };
  const CONSEQ = {
    critical: { effect: 'beyond', cost: null, desc: '超出预期：不止办成，还多拿到一样东西（线索/物件/人情）' },
    extreme: { effect: 'clean', cost: null, desc: '干净利落：办成且没有响动' },
    success: { effect: 'done', cost: null, desc: '办成了' },
    fail: { effect: 'stalled', cost: 'time_or_chance', desc: '没办成：耗掉一段窗口，机会变窄' },
    fumble: { effect: 'setback', cost: 'harm_or_expose', desc: '办砸了：受伤 / 暴露 / 弄坏东西，且被人记住' }
  };
  const stat = { rolled: 0, off: 0, replay: 0, badInput: 0, lastBand: '', lastAt: 0 };
  let shadow = null;

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    const raw = WA.settingsBus.read(__REG);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
  }
  function saveSettings(next) {
    const val = Object.assign({}, DEF, next || {});
    if (!WA.settingsBus) { shadow = val; return val; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, val));
  }
  function refuse(code, extra) {
    stat.badInput++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function isInt100(v) { return typeof v === 'number' && isFinite(v) && (v | 0) === v && v >= 1 && v <= 100; }

  /** d20 需求：能力值 1..100 → 1..20（四舍五入后夹到 1..20，口径公开可核）。 */
  function needOf(target) {
    const n = Math.round(target / 5);
    return n < 1 ? 1 : (n > 20 ? 20 : n);
  }
  /** 纯判据：需求 + 骰点 → 五档（不掷骰、不读 store）。 */
  function bandOf(need, roll) {
    if (roll === 1) return 'critical';
    if (roll >= 20) return need >= 19 ? 'fail' : 'fumble';
    const ext = Math.floor(need / 5);
    if (ext >= 2 && roll <= ext) return 'extreme';
    return roll <= need ? 'success' : 'fail';
  }
  /** d100 模式：标签归并到五档（困难/普通成功都算 success）。 */
  function bandFromGrade(gradeName) {
    if (gradeName === '大成功') return 'critical';
    if (gradeName === '极难成功') return 'extreme';
    if (gradeName === '困难成功' || gradeName === '普通成功') return 'success';
    if (gradeName === '失败') return 'fail';
    return 'fumble';
  }
  function readLog() {
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      return Array.isArray(all[STORE_KEY]) ? all[STORE_KEY] : [];
    } catch (e) { return []; }
  }
  function writeLog(arr) {
    try {
      if (!WA.store || !WA.store.transact) return false;
      WA.store.transact(function (d) { d[STORE_KEY] = arr; return true; }, 'outcome:log');
      return true;
    } catch (e) { return false; }
  }

  /**
   * 掷一次判定。
   * @param {{target:number, ticket?:string, die?:number, who?:string, what?:string}} opts
   */
  function resolve(opts) {
    const cfg = settings();
    const o = opts && typeof opts === 'object' ? opts : {};
    if (!cfg.enabled) {
      stat.off++;
      return { ok: true, reason: 'module-disabled', enabled: false, grade: 'auto', label: '原样通过',
        note: '开关关着：按“说了就成”原样通过，世界不掷骰、不记账' };
    }
    if (!isInt100(o.target)) return refuse('bad-target', { target: o.target });
    const die = o.die === undefined || o.die === null ? (cfg.die === 100 ? 100 : 20) : o.die;
    if (die !== 20 && die !== 100) return refuse('bad-roll', { die: die, allowed: [20, 100] });
    const ticket = o.ticket === undefined || o.ticket === null ? '' : String(o.ticket);
    if (ticket) {
      const hit = readLog().filter(function (x) { return x && x.ticket === ticket; })[0];
      if (hit) {
        stat.replay++;
        return Object.assign({}, hit, { ok: true, reason: 'ok', replay: true,
          note: '这张票已经掷过：照首次结果执行，不许“读到失败再重掷”' });
      }
    }
    let band, roll, need = null;
    if (die === 20) {
      need = needOf(o.target);
      roll = WA.rand.int(1, 20);
      band = bandOf(need, roll);
    } else {
      roll = WA.rand.int(1, 100);
      if (!WA.successGrade || typeof WA.successGrade.grade !== 'function') return refuse('bad-roll', { why: 'd100 模式下 successGrade 未装载' });
      const g = WA.successGrade.grade(roll, o.target);
      if (!g || !g.ok) return refuse(g && g.reason ? g.reason : 'bad-roll', { roll: roll, target: o.target });
      band = bandFromGrade(g.grade);
    }
    const at = (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('outcomeDice') : Date.now();
    const entry = {
      ticket: ticket, die: die, roll: roll, target: o.target, need: need,
      band: band, label: LABEL[band], rank: RANK[band],
      who: o.who ? String(o.who) : '', what: o.what ? String(o.what) : '',
      consequence: CONSEQ[band], at: at
    };
    const log = readLog();
    log.push(entry);
    while (log.length > CAP) log.shift();
    writeLog(log);
    stat.rolled++;
    stat.lastBand = band;
    stat.lastAt = at;
    return Object.assign({ ok: true, reason: 'ok', enabled: true, replay: false }, entry);
  }

  /** 开关（唯一入口：不在别处偷偷改）。 */
  function toggle(on) {
    const cur = settings();
    const want = on === undefined ? !cur.enabled : !!on;
    const next = saveSettings(Object.assign({}, cur, { enabled: want }));
    return { ok: true, reason: 'ok', enabled: next.enabled !== false };
  }
  /** 整表：给出某能力值下 20 个骰点各落哪档（供专锁对读，不掷骰）。 */
  function ladder(target) {
    if (!isInt100(target)) return refuse('bad-target', { target: target });
    const need = needOf(target);
    const rows = [];
    for (let i = 1; i <= 20; i++) rows.push({ roll: i, band: bandOf(need, i), label: LABEL[bandOf(need, i)] });
    return { ok: true, reason: 'ok', target: target, need: need, rows: rows };
  }
  /** 读面：最近 5 票 + 开关 + 读数。 */
  function view() {
    const cfg = settings();
    const log = readLog();
    return { ok: true, enabled: cfg.enabled !== false, die: cfg.die,
      recent: log.slice(-5), total: log.length, cap: CAP, stat: statOf() };
  }
  function statOf() { return Object.assign({}, stat); }
  /** 注入面：只在开着且有最近一票时说话（关着就是零 token）。 */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const log = readLog();
    const last = log[log.length - 1];
    if (!last) return '';
    const who = last.who ? last.who + ' ' : '';
    const what = last.what ? last.what : '这一手';
    return '【判定】' + who + what + '：' + last.label + '（d' + last.die + '=' + last.roll +
      (last.need ? ' / 需求 ' + last.need : '') + '）。' + (last.consequence && last.consequence.desc ? last.consequence.desc : '');
  }
  function reset() {
    writeLog([]);
    return { ok: true, reason: 'ok', cleared: true };
  }

  WA.outcomeDice = {
    resolve: resolve, toggle: toggle, ladder: ladder, view: view, buildBlock: buildBlock,
    reset: reset, settings: settings, saveSettings: saveSettings, stat: statOf,
    bandOf: bandOf, needOf: needOf, REG: __REG, DEF: DEF, LABEL: LABEL, RANK: RANK, CAP: CAP
  };
})();
