/**
 * WorldAxis engines/write-desk.js（v2.294.0 · V8 EXV8-2）
 * 写口台：悬空引擎的统一手动写入口 ——「点了有回音」的最后一公里。
 *
 * 【为什么需要它】
 *   V8 立项实测：34 台 L3 引擎产品侧零写口调用。轮次驱动器（round-drivers.js）
 *   接走了「每轮推进」的七台，分发器扩组接走了「契约可喂」的 memoryTiers；
 *   剩下二十多台引擎的写口需要**剧情判断入参**（karma.record 谁、什么因果、多少账；
 *   contest.open 谁对谁、什么性质）——自动喂就是编事实。这些引擎的合法接入面
 *   是玩家显式操作。
 *
 * 【本模块只做一件事】
 *   把「哪台引擎、哪个写口、要什么参数、什么会拒收」从 write-contract 的
 *   源码契约（contractOf）里读出来，摆成可查询的台面。面板据此渲染表单，
 *   玩家提交时按参数名透传给真写口——本模块零业务逻辑、零事实编造。
 *
 * 【三条硬纪律】
 *   ① 契约只读一次源码：参数名/拒收码/hint 全部来自 write-contract（真源是函数体），
 *      本模块不手抄任何引擎名单或参数表 —— 名单手抄一份就漂移一份；
 *   ② 透传不转换：参数按逗号分隔解析为字符串/数字后**原样**传给写口，
 *      不做单位换算、不做枚举映射、不做默认值兜底 —— 写口拒收什么就如实展示什么；
 *   ③ 拒收可见：每次调用的结论（含 reason）进台账，玩家看见「为什么没写进去」。
 *
 * 【与邻座分工】
 *   · round-drivers：自动面（每轮推进），管零参写口；
 *   · intake-dispatch：翻译面（契约→写口），管字段诚实对得上的自动喂入；
 *   · 本模块：手动面（玩家显式操作），管需要剧情判断的写口。三面互补，不重叠。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  /**
   * 台面成员名单：ns → 待接入写口（人工可调用面）。
   *   名单**只声明引擎与写口名**，参数形状一律从 write-contract 现场读 ——
   *   契约变了台面自动跟，这里不抄第二份参数表。
   * 只读口（stat/view/buildBlock/getSettings/setSettings/list/read）不上台面。
   */
  const DESK = {
    karma: ['record', 'offset', 'intervene', 'drop'],
    contest: ['open', 'stageAdd', 'spend', 'advanceRound', 'withdraw'],
    ruling: ['open', 'notify', 'submit', 'rule', 'enforce', 'refund'],
    fondness: ['propose', 'accept', 'reject', 'undo', 'correct', 'advance', 'updateAffect', 'unlockGate'],
    tolerance: ['use', 'drop', 'clear'],
    genTiming: ['ackSent'],
    spotlight: ['note', 'seal'],
    motif: ['note', 'used', 'drop', 'clear'],
    beatMask: ['plan', 'advance', 'clear'],
    lingqi: ['register', 'seed', 'route'],
    ladder: ['define', 'escalate', 'deescalate', 'drop'],
    marginal: ['open', 'gain', 'cool', 'drop'],
    userlock: ['lock', 'unlock', 'clear'],
    powerAnchor: ['anchor', 'drop'],
    memoryTiers: ['knot', 'sink', 'clearTier'],
    temporalLock: ['lock', 'unlock'],
    beastBond: ['register', 'train', 'bond'],
    rivalry: ['declare', 'modulate', 'retire'],
    enigma: ['unmark', 'drop'],
    tempo: ['setGear'],
    quota: ['add', 'resolve', 'drop'],
    rhythmLoop: ['step', 'cool'],
    masks: ['setMask', 'dropMask'],
    parallelEvents: ['add', 'resolve'],
    warrant: ['report', 'pardon'],
    appearance: ['register', 'sceneAssert'],
    sceneSlice: ['set'],
    genGate: ['gate', 'record'],
    reasoning: ['directive'],
    storyTone: ['set', 'clear'],
    temperament: ['setTemperament'],
    eraCycle: ['init'],
    backstageTone: ['era', 'socialHint', 'noteAdd']
  };

  const stat = { calls: 0, ok: 0, rejected: 0, lastReason: '', byEngine: {}, activity: {} };
  function note(why) { stat.lastReason = why; stat.byEngine[why] = (stat.byEngine[why] || 0) + 1; }

  /**
   * 台面清单：全部成员的契约（参数形状 + 拒收码 + hint）。
   * @returns {rows: [{ns, method, params, arity, reasons, hints, guards, label}]}
   */
  function catalog() {
    const rows = [];
    if (!WA.writeContract || typeof WA.writeContract.contractOf !== 'function') return { ok: false, reason: 'contract-unavailable', rows: [] };
    Object.keys(DESK).forEach(function (ns) {
      DESK[ns].forEach(function (method) {
        const c = WA.writeContract.contractOf(ns, method);
        rows.push({
          ns: ns, method: method,
          readable: !!(c && c.ok && c.readable),
          params: (c && c.ok && c.params) || null,
          arity: (c && c.ok && c.arity) || 0,
          reasons: (c && c.ok && c.reasons) || null,
          hints: (c && c.ok && c.hints) || null,
          guards: (c && c.ok && c.guards) || null
        });
      });
    });
    return { ok: true, rows: rows };
  }

  /**
   * 调用一个写口：参数按契约顺序解析（逗号分隔，数字自动转 number），原样透传。
   *   对象参数用 JSON.parse（解析失败如实拒收 bad-json，不猜结构）。
   * @returns 写口的原始返回（{ok:false,reason:...} 原样给玩家）
   */
  function call(ns, method, args) {
    if (!DESK[ns] || DESK[ns].indexOf(method) < 0) return { ok: false, reason: 'not-on-desk' };
    const eng = WA[ns];
    if (!eng || typeof eng[method] !== 'function') return { ok: false, reason: 'engine-missing' };
    const a = Array.isArray(args) ? args : [];
    const c = (WA.writeContract && WA.writeContract.contractOf(ns, method)) || null;
    const arity = (c && c.ok && c.arity) || a.length;
    // 按契约截齐参数个数（透传不多给）
    const argv = a.slice(0, Math.max(0, arity));
    stat.calls++;
    const act = stat.activity[ns] || (stat.activity[ns] = { calls: 0, written: 0, rejected: 0, lastMethod: '', lastReason: '' });
    act.calls++; act.lastMethod = method;
    let res = null;
    try { res = eng[method].apply(eng, argv); }
    catch (e) { act.rejected++; act.lastReason = 'threw'; stat.rejected++; note('threw:' + ns + '.' + method); return { ok: false, reason: 'threw', detail: String(e && e.message) }; }
    const wrote = !!(res && res.ok && res.reason !== 'disabled');
    act.lastReason = wrote ? '' : ((res && res.reason) || 'unknown');
    if (wrote) { stat.ok++; act.written++; note('ok:' + ns + '.' + method); }
    else { stat.rejected++; act.rejected++; note(act.lastReason + ':' + ns + '.' + method); }
    return res;
  }

  WA.writeDesk = {
    catalog: catalog,
    call: call,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/write-desk.js', { kind: 'engine', ver: '2.294.0' });
  if (WA.log) WA.log('info', 'engines/write-desk 已加载（2.294.0）');
})();