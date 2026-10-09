#!/usr/bin/env node
// WorldAxis tests/hazard-trigger-v2138.js — 区域天气与灾害深度联动（E7）专锁
//
// 它治什么（与 engines/hazard.js 的边界 9/10 同一件事）：
//   v2.96.0（X6）做了「判定面读天气」——恶劣天气把 roll 的目标值往下压。**反向那条一直缺着**：
//   天气再恶劣也不会自己长出一行风险账，全靠人记得手工 open()。缺了它，「台风过境」在世界里
//   就只是一串描写，而没有任何账。本锁钉五问：
//     ① 「没打开联动」与「天气没恶劣到」必须分得开（link-off vs below-threshold）——
//        前者是开关事，后者是天气事，两者在回执里合成一个码就等于本版什么都没做；
//     ② 「以词表为准」——白名单外的天气哪怕系数够大也不触发（不猜「系数高就是灾害」）；
//     ③ 「只建账，不动别人」——weatherTrigger 跑完，天气表/天气计数/世界表字节级不变；
//     ④ 「不替代手工创建」——open() 逐字未动，两条入口各有各的成因，且在读数上分得开；
//     ⑤ 「同地同天气不堆行」——重复触发只记触发计数，一次连阴雨不许长出几十行同样的账。
//
// 两向取证（本仓纪律，不是自述）：
//   正向 —— 全部走真 API：面板开关由**真 DOM 点击**驱动（v2.3.0 的教训：静态 id 在场
//          不等于点得动），成因面从 open / weatherTrigger / 旧存档三条入口分别读回；
//   逆向 —— 真源码破坏（锚点恰中 1 次）→ 装载破坏副本 → **在副本上重跑同款真判据**，
//          证明判据真会因破坏而变红，且不出现「对原文件断言」「破坏写死成模拟常量」
//          「破坏把判据自己删掉」三种假绿（H6）。
//
//   ⚠ 一条**不可达**分支的诚实登记：当前词表（storm/snow）的系数都是 2，而 triggerFactor 的
//     上界也是 2 ⇒ `factor < thr` 在**产品面不可达**（`why:'factor-below-threshold'`）。
//     本锁不假装它可达：正向断言把它记成「当前词表下不可达」，另用 N11（把 clear 加进白名单）
//     证明它在**条件放宽后立刻可达** —— 这正是不许把它当成「永远死码」的理由。
//
// H5 判据纯度：本文件内锚点字面量**只准在 ANCHORS 里声明一次**，
//   破坏与断言都引用 ANCHORS.x.txt，不在别处再写一遍。
'use strict';

/** 锚点表（单一真源；判据别处只引用，不再写字面量）。 */
const ANCHORS = {
  // ① 默认关闭（未打开时一次账都不建）
  gate: { rel: 'engines/hazard.js', txt: "if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', place: pl }; }" },
  // ② 「没打开联动」独立成码 —— 与「天气没恶劣到」分得开
  linkOff: { rel: 'engines/hazard.js', txt: "if (cfg.weatherLink !== true) { noteFault('link-off'); return { ok: false, reason: 'link-off', place: pl }; }" },
  // ③ 天气面纯读（与 X6 共用同一把尺子：观测不得改变被观测对象）
  wxAt: { rel: 'engines/hazard.js', txt: "const eff = weatherAt(pl);" },
  // ④ 以词表为准（白名单外一律不触发）
  whitelist: { rel: 'engines/hazard.js', txt: "if (TRIGGER_KINDS.indexOf(kind) < 0) {" },
  // ⑤ 系数闸（与词表并存时的第二道；当前词表下不可达，见文件头）
  factorThr: { rel: 'engines/hazard.js', txt: "if (!isFinite(thr) || factor < thr) {" },
  // ⑥ 键的默认口径：weather:<地点>
  keyOf: { rel: 'engines/hazard.js', txt: "const k = clean((opts && opts.key) || ('weather:' + pl), 60);" },
  // ⑦ 同地同天气不堆行：只累加触发计数
  hitAdd: { rel: 'engines/hazard.js', txt: "row.triggerHits = Math.floor(Number(row.triggerHits) || 0) + 1;" },
  // ⑧ 刷新既有行的成因（不许被后来的手工行冒名顶替）
  byWeather: { rel: 'engines/hazard.js', txt: "row.causedBy = 'weather';" },
  // ⑨ 建行时把成因写在行上
  newRow: { rel: 'engines/hazard.js', txt: "at: clockNow('hazard'), causedBy: 'weather', weatherKind: kind, triggerHits: 1 });" },
  // ⑩ 计数只在**真建行**时 +1（重复触发不再计）
  statInc: { rel: 'engines/hazard.js', txt: "if (out && out.ok) { if (out.created) stat.triggers++; stat.lastReason = out.reason; }" },
  // ⑪ 手工入口也留成因（open() 只加了这三个字，语义未动）
  manualBy: { rel: 'engines/hazard.js', txt: "at: clockNow('hazard'), causedBy: 'manual' });" },
  // ⑫ 词表本身（判据的单一真源，导出给面板与见证表用）
  kinds: { rel: 'engines/hazard.js', txt: "const TRIGGER_KINDS = ['storm', 'snow'];" },
  // ⑬ 成因三态
  byList: { rel: 'engines/hazard.js', txt: "const CAUSED_BY = ['manual', 'weather', 'cascade'];" },
  // ⑭ 默认值（weatherLink 默认关 / 阈值默认 2 = 只认最坏那一档）
  cfgLine: { rel: 'engines/hazard.js', txt: "weatherLink: false, triggerFactor: 2 };" },
  // ⑮ 设置面边界（阈值不许被拖到「晴天也触发」）
  bounds: { rel: 'engines/hazard.js', txt: "triggerFactor: [1.25, 2] } };" },
  // ⑯ 读数：触发次数进既有 stat（不为读一个计数新开导出）
  statTrig: { rel: 'engines/hazard.js', txt: "triggers: 0," },
  // ⑰ 成因面回读
  readBy: { rel: 'engines/hazard.js', txt: "const rawBy = row.causedBy;" },
  // ⑱ 旧行如实报 unrecorded（**不回落成 manual** —— 那等于替旧行认领成因）
  readUnrec: { rel: 'engines/hazard.js', txt: "causedBy: by || 'unrecorded'," },
  // ⑲ 回读天气种类
  readKind: { rel: 'engines/hazard.js', txt: "weatherKind: typeof row.weatherKind === 'string' ? row.weatherKind : ''," },
  // ⑳ 回读触发计数
  readHits: { rel: 'engines/hazard.js', txt: "triggerHits: Number(row.triggerHits) || 0 };" },
  // ㉑ 导出入口
  expTrigger: { rel: 'engines/hazard.js', txt: "weatherTrigger: weatherTrigger," },
  // ㉒ 导出两张词表（面板标成因 / 见证驱动触发都读它，不各自抄一份）
  expConsts: { rel: 'engines/hazard.js', txt: "CAUSED_BY: CAUSED_BY.slice(), TRIGGER_KINDS: TRIGGER_KINDS.slice()," },
  // ㉓ 面板控件（字面量 id：H2 采集面看不见动态拼接的 id）
  uiCb: { rel: 'ui/settings.js', txt: 'id="wa-sw-hazardwx" data-hzwx="link"' },
  // ㉔ 面板读数行
  uiView: { rel: 'ui/settings.js', txt: 'id="wa-hzwx-view"' },
  // ㉕ 面板写回走引擎既有 setSettings，且**只写 weatherLink**（不顺手改总开关）
  uiWrite: { rel: 'ui/settings.js', txt: 'w = hz.setSettings({ weatherLink: !!hzwx.checked });' },
  // ㉖ 守卫登记（渲染 + 绑定 + 登记三件齐做）
  diagIds: { rel: 'engines/tool-diag.js', txt: "'wa-sw-hazardwx', 'wa-hzwx-view'," },
  // ㉗ 逐落地结算：联动没开就一次地点都不问（关闭即零开销）
  rollAllGate: { rel: 'engines/hazard.js', txt: "if (cfg.weatherLink !== true) return { ok: false, reason: 'link-off', asked: 0, results: [] };" },
  // ㉘ 地点清单**向天气问**（不在本模块里翻别人的存档 —— 两套真源是本仓库最贵的病）
  rollAllPlaces: { rel: 'engines/hazard.js', txt: "const list = wx.places();" },
  // ㉘b 天气门面缺席 ⇒ 如实报 engine-absent（不自己翻存档硬算）
  rollAllAbsent: { rel: 'engines/hazard.js', txt: "if (!wx || typeof wx.places !== 'function') return { ok: false, reason: 'engine-absent', asked: 0, results: [] };" },
  // ㉙ 结算入口挂进导出面（否则主链节点调不到它）
  rollAllExp: { rel: 'engines/hazard.js', txt: "rollAll: rollAll," },
  // ㉚ 主链挂点：after / 13（紧随 autoAdvance，且在 hazard.tick 之前）、附属面失败不拖主链
  wfNode: { rel: 'engines/hazard.js', txt: "id: 'hazard.weatherTrigger', chain: 'after', order: 13, critical: false," },
  // ㉛ 节点体真调结算（只声明不调 = 空节点）
  //   ⚠ 锚点体首行**不含缩进**：实测节点体在源码里是 `      async run() {`，而锚点早先写成
  //     `async run() {`（无前导空格）—— 于是 H5 半① 当场红（实 0 次命中）。两种取向都可以，
  //     但不能同时按两种写：这里选「从函数体开始」对齐。
  wfBody: { rel: 'engines/hazard.js', txt: "async run() {\n        try { if (WA.hazard && typeof WA.hazard.rollAll === 'function') WA.hazard.rollAll();" },
  // ㉜ 天气侧新增的清单读口（E7 的另一半：别人要枚举，就向天气问）
  wxPlaces: { rel: 'engines/weather.js', txt: "function places() {" },
  // ㉝ 清单读口挂进天气导出面
  wxPlacesExp: { rel: 'engines/weather.js', txt: "places: places," }
};

const REL = 'engines/hazard.js';
const WREL = 'ui/settings.js';
const WXREL = 'engines/weather.js';


// ── 模块级装配（v2.138.0 收口）──────────────────────────────────────────────
//   为什么要提模块级：run.js 的两条挂载路径（runAll / runNegative）必须真跑**同一批**判据。
//   若把负控制单独摘出、而装配台（makeEnv / wreck / wreckUI / 五条探针）留在 runAll 里，
//   第二入口就只能把装配台**复制一份** —— 那是两处装配（本仓点名的「两套数并存」）。
//   提到模块级 = 只有一处装配，两条入口共用，且锚点表与真判据仍各只有一份。
const fs = require('fs');
const path = require('path');
const { fresh } = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const ABS = path.join(BASE, REL);
const WABS = path.join(BASE, WREL);
const XABS = path.join(BASE, WXREL);
/** 三份源文本：模块加载时各读一次（纯只读面；一切破坏都只发生在内存副本上）。 */
const SRC = fs.readFileSync(ABS, 'utf8');
const WSRC = fs.readFileSync(WABS, 'utf8');
const XSRC = fs.readFileSync(XABS, 'utf8');
  /** 按锚点声明的 rel 取该文件当前文本（三处锚点分布在三个文件里）。 */
  const srcOf = function (rel) { return rel === REL ? SRC : (rel === WREL ? WSRC : (rel === WXREL ? XSRC : fs.readFileSync(path.join(BASE, rel), 'utf8'))); };
  const absOf = function (rel) { return path.join(BASE, rel); };

  // ── 装配：真源码 or 破坏副本（同一台装载机；破坏只发生在内存副本上）──
  const P = { A: '甲镇', B: '乙镇', C: '丙镇', D: '丁镇' };
  const HK = '暴雨风险';
  function makeEnv(over) {
    const W = fresh(over ? { srcOverride: over } : undefined).WA;
    W.store.init();
    W.store.transact(function (d) {
      d.world = { places: [], roads: [], events: [], journeys: [] };
      d.weather = { rows: [] };
      d.hazard = { rows: [] };
    }, 'e2138hz:seed');
    [P.A, P.B, P.C, P.D].forEach(function (n) { W.world.addPlace({ name: n, kind: 'public' }); });
    W.world.setSettings({ enabled: true });
    W.weather.setSettings({ enabled: true });
    // 「必设」而不是「靠默认」：localStorage 是宿主面的，上一用例写过的值会带进来。
    W.hazard.setSettings({ enabled: true, weatherLink: true, maxRows: 16, triggerFactor: 2 });
    return W;
  }
  /** 破坏副本：锚点恰中 1 次才允许替换（H6 工具两向自证之一：不唯一必须抛）。 */
  function wreck(key, to) {
    const t = ANCHORS[key].txt;
    const n = SRC.split(t).length - 1;
    if (n !== 1) throw new Error('wreck 锚点不唯一：' + key + ' 命中 ' + n);
    return SRC.replace(t, to);
  }
/**
   * 面板侧破坏：**同一台装载机**先把破坏形态的 `ui/settings.js` 当作「产品面 srcOverride」
   *   装进 vm（于是 `WA.ui` 由 ui/panel.js 建出，ui/settings.js 也被真正求值），
   *   再借 `ui-gate-sync.checkPages` 的 `srcOverride` 机制把**同一个字节的破坏形态**交给
   *   `uiFiles` 那一段重新求值 —— 否则破坏只活在「产品面」那一次求值里，
   *   而面板里的 `WA.uiSettings` 仍是原版（判据就会静默地实原版，正是本锁要防的假绿）。
   */
  function wreckUI(key, to) {
    const t = ANCHORS[key].txt;
    const n = WSRC.split(t).length - 1;
    if (n !== 1) throw new Error('wreckUI 锚点不唯一：' + key + ' 命中 ' + n);
    const code = WSRC.replace(t, to);
    return { code: code, api: { 'ui/settings.js': code } };
  }
  const rows = function (W) { return ((W.store.get() || {}).hazard || {}).rows || []; };
  /** 天气侧快照（读表 + 读计数）——用于「只建账，不动天气」的字节级比对。 */
  function wxSnap(W) { return JSON.stringify((W.store.get() || {}).weather) + '|' + JSON.stringify(W.weather.stat()); }
  /** 世界侧快照 —— 「不改通行」的证据面。 */
  function wdSnap(W) { return JSON.stringify((W.store.get() || {}).world); }
  /**
   * 同款真判据（原版与破坏副本上跑的是同一批函数）。
   *
   * ⚠ 为什么签名带 H（hazard 门面）：`fresh()` 把所有模块装进**同一个 vm 全局**，
   *   而产品模块的入口对象是 `window.WorldAxis`（`|| {}` 只在缺席时新建）。于是
   *   「构造破坏副本 → 再 fresh 一次原版做正控」会让 `W.hazard` 被原版**覆盖**，
   *   而 `W` 与全局 WA 是同一个对象 ⇒ 破坏断言会悄悄跑在原版上。
   *   第一次实测正是这样：7 条破坏判据全绿/全红得毫无规律（实的不是破坏副本）。
   *   处置：破坏副本的 handler 引用**当场抓下来**（H），断言只经 H 走，
   *   与后来装了什么无关。
   */
  function probeLinkOff(W, H) {
    H = H || W.hazard;
    try {
      H.setSettings({ weatherLink: false });
      W.weather.setWeather(P.B, 'storm');
      const r = H.weatherTrigger(P.B);
      return r.ok === false && r.reason === 'link-off' && rows(W).length === 0 && H.stat().triggers === 0;
    } catch (e) { return false; }
  }
  function probeWhitelist(W, H) {
    H = H || W.hazard;
    try {
      W.weather.setWeather(P.A, 'rain');   // 系数 1.5，但不在词表里
      const r = H.weatherTrigger(P.A);
      return r.ok === false && r.reason === 'below-threshold' && r.why === 'kind-not-in-whitelist'
        && rows(W).length === 0;
    } catch (e) { return false; }
  }
  /** 成因面：天气造的行必须答 weather，手工开的必须答 manual，二者可分辨。 */
  function probeCause(W, H) {
    H = H || W.hazard;
    try {
      W.weather.setWeather(P.C, 'snow');
      H.weatherTrigger(P.C);
      H.open(HK, '人写的');
      return H.read('weather:' + P.C).causedBy === 'weather'
        && H.read(HK).causedBy === 'manual';
    } catch (e) { return false; }
  }
  /** 只建账不动别人：跑完天气表/天气计数/世界表字节级不变。 */
  function probeNoSideEffect(W, H) {
    H = H || W.hazard;
    try {
      W.weather.setWeather(P.D, 'storm');
      const w0 = wxSnap(W), d0 = wdSnap(W);
      H.weatherTrigger(P.D);
      return wxSnap(W) === w0 && wdSnap(W) === d0 && rows(W).length === 1;
    } catch (e) { return false; }
  }
  /** 不堆行：同地同天气触发两次，行数恒 1 而触发计数 1 → 2。 */
  function probeNoPile(W, H) {
    H = H || W.hazard;
    try {
      W.weather.setWeather(P.A, 'storm');
      H.weatherTrigger(P.A);
      const r2 = H.weatherTrigger(P.A);
      return rows(W).length === 1 && r2.existed === true && r2.triggerHits === 2
        && H.stat().triggers === 1;
    } catch (e) { return false; }
  }

function runAll(a) {
  const assert = require('./lock-assert.js').from(a);
  const fs = require('fs');
  const path = require('path');
  const src = SRC, srcBefore = SRC;
  const wSrc = WSRC, wSrcBefore = WSRC;
  const xSrc = XSRC, xSrcBefore = XSRC;
  // ── H5 判据纯度（两半）：① 每条锚点在**它的**目标文件里恰中 1 次；
  //    ② 每条锚点字面量在**本锁文件**里只出现一次（即只在 ANCHORS 表里，判据不得引用锚点串）。
  const selfTxt = fs.readFileSync(__filename, 'utf8');
  Object.keys(ANCHORS).forEach(function (k) {
    const t = ANCHORS[k].txt, rel = ANCHORS[k].rel;
    const inSrc = srcOf(rel).split(t).length - 1;
    assert.ok(inSrc === 1, 'H5 锚点「' + k + '」在 ' + rel + ' 内恰中 1 次（实 ' + inSrc + '）');
    // H5 半②的口径（v2.138.0 修订）：量的是**锚点体的字面量**，不是锚点名。
    //   ⚠ 早先按「整条锚点串在文件里只出现一次」量，而每个负控制都要写 `wreck('锚点名', …)`
    //     —— 锚点名于是天然出现两次，**每加一个负控制就必然假红**。那是把「工具两向自证」
    //     这件事本身真实测成红（判据自身缺陷，本锁 E7 段实测踩到）。
    //   锚点体则相反：它只准出现在 ANCHORS 表里 —— 判据不得引用锚点串（引用即第二真源）。
    const tblStart = selfTxt.indexOf('const ANCHORS = {');
    const codeZone = selfTxt.slice(selfTxt.indexOf('\n};', tblStart));
    const bodyForms = [t, t.replace(/\\/g, '\\\\').replace(/\n/g, '\\n')];
    const inSelf = bodyForms.reduce(function (m, f) { return Math.max(m, codeZone.split(f).length - 1); }, 0);
    assert.ok(inSelf === 0, 'H5 锚点体「' + k + '」在本锁的判据区不出现（判据不得引用锚点串；实 ' + inSelf + '）');
  });
  assert.ok(src.indexOf('WorldAxis engines/hazard.js') >= 0, '源文件头在场（装载面可信）');

  // ══════════════ 正向 ══════════════
  const W1 = makeEnv();

  // 1 默认值：登记表里读 DEF（不是读某个被写过的存档值）
  const regs = (W1.__settingsRegs || []).filter(function (r) { return r && r.module === 'hazard'; });
  assert.ok(regs.length === 1, '本模块向设置总线登记恰一次（实 ' + regs.length + '）');
  assert.ok(regs[0].def.weatherLink === false && regs[0].def.triggerFactor === 2,
    '默认关闭且阈值默认 2（实 ' + JSON.stringify([regs[0].def.weatherLink, regs[0].def.triggerFactor]) + '）');
  assert.ok(regs[0].bounds.triggerFactor[0] === 1.25 && regs[0].bounds.triggerFactor[1] === 2,
    '阈值边界 [1.25,2] 由设置总线声明（界面与写路径读同一份，实 ' + JSON.stringify(regs[0].bounds.triggerFactor) + '）');
  assert.ok(JSON.stringify(W1.hazard.CAUSED_BY) === JSON.stringify(['manual', 'weather', 'cascade']),
    '成因三态导出（实 ' + JSON.stringify(W1.hazard.CAUSED_BY) + '）');
  assert.ok(JSON.stringify(W1.hazard.TRIGGER_KINDS) === JSON.stringify(['storm', 'snow']),
    '词表导出（实 ' + JSON.stringify(W1.hazard.TRIGGER_KINDS) + '）');
  // 导出的必须是**副本**：外部改它不许动到判据（两套数并存的经典入口）
  W1.hazard.TRIGGER_KINDS.push('rain');
  W1.weather.setWeather(P.A, 'rain');
  assert.ok(W1.hazard.weatherTrigger(P.A).reason === 'below-threshold',
    '导出的是副本：外部往 TRIGGER_KINDS 塞值不影响引擎判据');

  // 2 总开关关闭：拒收 disabled，且一次账都不建
  W1.hazard.setSettings({ enabled: false });
  const r2 = W1.hazard.weatherTrigger(P.A);
  assert.ok(r2.ok === false && r2.reason === 'disabled', '关闭时拒收 disabled（实 ' + r2.reason + '）');
  assert.ok(rows(W1).length === 0 && W1.hazard.stat().triggers === 0, '关闭时零建账（实行数 ' + rows(W1).length + '）');
  W1.hazard.setSettings({ enabled: true });

  // 3 link-off 与 below-threshold **分得开**（本版最不该合成的两个码）
  const W3 = makeEnv();
  assert.ok(probeLinkOff(W3), '没打开联动 ⇒ link-off（不是「天气没恶劣到」）');
  W3.hazard.setSettings({ weatherLink: true });
  assert.ok(probeWhitelist(W3), '天气没恶劣到 ⇒ below-threshold（与 link-off 是两码）');
  assert.ok(W3.hazard.stat().faults['link-off'] >= 1 && W3.hazard.stat().faults['below-threshold'] === undefined,
    '归因口径：「没打开」算故障，「天气没恶劣到」不算（实 ' + JSON.stringify(W3.hazard.stat().faults) + '）');

  // 4 天气面三态如实（engine-absent / missing / disabled），一律不回落成「天气很好」
  const W4 = makeEnv();
  const keepWx = W4.weather;
  try {
    delete W4.weather;
    const ra = W4.hazard.weatherTrigger(P.A);
    assert.ok(ra.reason === 'engine-absent', '天气模块缺席 ⇒ engine-absent（实 ' + ra.reason + '）');
  } finally { W4.weather = keepWx; }
  const rb = W4.hazard.weatherTrigger(P.B);   // 登记了地点但没登记天气
  assert.ok(rb.reason === 'missing', '该地未登记天气 ⇒ missing（实 ' + rb.reason + '）');
  W4.weather.setWeather(P.C, 'storm');
  W4.weather.setSettings({ enabled: false });
  const rc = W4.hazard.weatherTrigger(P.C);
  assert.ok(rc.reason === 'disabled', '天气模块关着 ⇒ disabled（不回落成晴天，实 ' + rc.reason + '）');
  assert.ok(rows(W4).length === 0, '三态一律不建账（实行数 ' + rows(W4).length + '）');

  // 5 以词表为准：白名单外的天气哪怕系数够大也不触发
  const W5 = makeEnv();
  ['clear', 'fog', 'rain', 'heat'].forEach(function (k) {
    W5.weather.setWeather(P.A, k);
    const r = W5.hazard.weatherTrigger(P.A);
    assert.ok(r.ok === false && r.reason === 'below-threshold' && r.why === 'kind-not-in-whitelist',
      k + '（系数 ' + W5.weather.FACTOR[k] + '）不在词表 ⇒ 不触发（实 ' + r.why + '）');
  });
  W5.hazard.setSettings({ triggerFactor: 1.25 });
  const r5 = W5.hazard.weatherTrigger(P.A);
  assert.ok(r5.reason === 'below-threshold' && r5.why === 'kind-not-in-whitelist',
    '把阈值拉到最低，白名单外的 rain 仍不触发（两条判据并存时**以词表为准**，实 ' + r5.why + '）');
  W5.hazard.setSettings({ triggerFactor: 2 });

  // 5a 不可达分支的诚实登记（见文件头）：当前词表的系数都 ≥ 阈值上界 ⇒ 系数闸打不到
  assert.ok(W5.weather.FACTOR.storm === 2 && W5.weather.FACTOR.snow === 2 && regs[0].bounds.triggerFactor[1] === 2,
    '系数闸在当前词表下不可达（storm/snow 系数 = 阈值上界 2 ⇒ factor 恒 ≥ thr）——本锁不假装它可达');

  // 6 storm 触发：建行 + 成因 + 计数
  const W6 = makeEnv();
  W6.weather.setWeather(P.A, 'storm');
  const r6 = W6.hazard.weatherTrigger(P.A);
  assert.ok(r6.ok === true && r6.created === true && r6.reason === 'triggered', 'storm 触发建行（实 ' + r6.reason + '）');
  assert.ok(r6.kind === 'storm' && r6.factor === 2 && r6.triggerHits === 1, '回执带天气种类与系数（实 ' + JSON.stringify([r6.kind, r6.factor]) + '）');
  assert.ok(rows(W6).length === 1 && rows(W6)[0].key === 'weather:' + P.A, '默认键口径 weather:<地点>（实 ' + JSON.stringify(rows(W6).map(function (r) { return r.key; })) + '）');
  assert.ok(W6.hazard.stat().triggers === 1, 'stat.triggers 记 1（实 ' + W6.hazard.stat().triggers + '）');
  const rd6 = W6.hazard.read('weather:' + P.A);
  assert.ok(rd6.causedBy === 'weather' && rd6.weatherKind === 'storm' && rd6.triggerHits === 1,
    'read 回读成因三项（实 ' + JSON.stringify([rd6.causedBy, rd6.weatherKind, rd6.triggerHits]) + '）');
  // 6a 自定义键与备注落地
  W6.weather.setWeather(P.B, 'snow');
  W6.hazard.weatherTrigger(P.B, { key: '旱情账', note: '连日大雪' });
  assert.ok(W6.hazard.read('旱情账').ok === true && rows(W6).length === 2, '自定义键受理（实行数 ' + rows(W6).length + '）');

  // 7 同地同天气不堆行
  const W7 = makeEnv();
  assert.ok(probeNoPile(W7), '重复触发只累加 triggerHits（行数恒 1，triggers 不增）');
  // 7a 不堆行但**成因被刷新**（不许被后来的手工行冒名顶替）
  const W7b = makeEnv();
  W7b.weather.setWeather(P.A, 'storm');
  W7b.hazard.weatherTrigger(P.A);
  W7b.hazard.weatherTrigger(P.A);
  assert.ok(W7b.hazard.read('weather:' + P.A).causedBy === 'weather', '重复触发后成因仍是 weather（实 ' + W7b.hazard.read('weather:' + P.A).causedBy + '）');

  // 8 两条入口并存、成因可分辨
  const W8 = makeEnv();
  assert.ok(probeCause(W8), '天气造的行答 weather / 手工开的答 manual（两条入口分得开）');
  assert.ok(W8.hazard.read(HK).triggerHits === 0 && W8.hazard.read(HK).weatherKind === '',
    '手工行没有触发计数与天气种类（不伪造天气痕迹，实 ' + JSON.stringify([W8.hazard.read(HK).triggerHits, W8.hazard.read(HK).weatherKind]) + '）');
  // 8a 旧存档行如实报 unrecorded（不回落成 manual）
  W8.store.transact(function (d) { d.hazard.rows.push({ key: '旧行', note: '', count: 0, hits: 0, pending: false, waiting: 0, at: '' }); }, 'e2138hz:old');
  assert.ok(W8.hazard.read('旧行').causedBy === 'unrecorded', '旧存档行答 unrecorded（实 ' + W8.hazard.read('旧行').causedBy + '）');

  // 9 只建账，不动别人
  const W9 = makeEnv();
  assert.ok(probeNoSideEffect(W9), 'weatherTrigger 跑完：天气表 / 天气计数 / 世界表字节级不变');
  // 9a 源码面：weatherTrigger 体内零天气写入口（观测不得改变被观测对象）
  const body = src.split('function weatherTrigger(place, opts) {')[1].split('/** 读：单项风险账')[0];
  assert.ok(body.indexOf('setWeather') < 0 && body.indexOf('setSettings') < 0 && body.indexOf('BLOCK_LEVEL') < 0,
    'weatherTrigger 体内零天气写入口、零设置写入、零 BLOCK_LEVEL（源码级）');

  // 10 容量闸与入参闸（maxRows 走设置总线 ⇒ 越界值会被夹到 bounds 下界 4，
  //    所以「满员」要按**夹取后的真实容量**造，不能填个 1 就当满了）
  const W10 = makeEnv();
  const cap10 = W10.hazard.getSettings().maxRows;
  W10.store.transact(function (d) {
    d.hazard.rows = [];
    for (let i = 0; i < cap10; i++) d.hazard.rows.push({ key: '占位' + i, note: '', count: 0, hits: 0, pending: false, waiting: 0, at: '' });
  }, 'e2138hz:cap');
  W10.weather.setWeather(P.B, 'storm');
  const r10 = W10.hazard.weatherTrigger(P.B);
  assert.ok(r10.ok === false && r10.reason === 'rows-full', '满员拒收 rows-full（实 ' + r10.reason + '）');
  assert.ok(rows(W10).length === cap10, '满员时一行都不多（实 ' + rows(W10).length + ' / 容量 ' + cap10 + '）');
  const r10b = W10.hazard.weatherTrigger('   ');
  assert.ok(r10b.ok === false && r10b.reason === 'missing-fields', '空地点拒收 missing-fields（实 ' + r10b.reason + '）');
  assert.ok(W10.hazard.stat().faults['rows-full'] === 1 && W10.hazard.stat().faults['missing-fields'] === 1,
    '两类故障各自点名（实 ' + JSON.stringify(W10.hazard.stat().faults) + '）');
  // 10a 越界值被设置总线夹取（「界面拖不到的值引擎也不接受」这一条的实证）
  W10.hazard.setSettings({ maxRows: 1 });
  assert.ok(W10.hazard.getSettings().maxRows === regs[0].bounds.maxRows[0],
    '越界 maxRows 被夹回设置面声明的下界（实 ' + W10.hazard.getSettings().maxRows + '，声明下界 ' + regs[0].bounds.maxRows[0] + '）');

  // 11 面板面：真 DOM 点击驱动（v2.3.0 教训：静态 id 在场 ≠ 点得动）
  const W11 = makeEnv();
  W11.hazard.setSettings({ weatherLink: false });
  W11.ui.mount();
  const doc = W11.__uiDoc;
  const panel = doc.getElementById('wa-panel');
  const tabs = Array.prototype.slice.call(panel.querySelectorAll('.wa-tab'));
  const setTab = tabs.filter(function (t) { return t.dataset.page === 'settings'; })[0];
  assert.ok(!!setTab, '设置页 tab 在场');
  setTab.onclick();
  const cb = doc.getElementById('wa-sw-hazardwx');
  assert.ok(!!cb, '面板渲染出天气造灾害开关（真 DOM 在场）');
  assert.ok(typeof cb.onchange === 'function', '开关绑定生效（选择器写错时这里必为 null）');
  assert.ok(!!doc.getElementById('wa-hzwx-view'), '读数行在场');
  cb.checked = true; cb.onchange();
  assert.ok(W11.hazard.getSettings().weatherLink === true, '点开关真写 weatherLink（实 ' + W11.hazard.getSettings().weatherLink + '）');
  assert.ok(W11.hazard.getSettings().enabled === true, '且**没有**顺手改掉总开关（总开关仍是 ' + W11.hazard.getSettings().enabled + '）');
  cb.checked = false; cb.onchange();
  assert.ok(W11.hazard.getSettings().weatherLink === false, '再点一次能关回来（实 ' + W11.hazard.getSettings().weatherLink + '）');
  W11.hazard.setSettings({ weatherLink: true });

  // 13 逐落地结算（E7 的真消费者）：联动没开 ⇒ 一次地点都不问；开了 ⇒ 逐地过一遍并逐地留理由
  {
    const W13 = makeEnv();
    // 13a 联动关：连地点清单都不问（用**计数桩**证明「零开销」不是自述）
    let asked = 0;
    const keepPlaces = W13.weather.places;
    W13.weather.places = function () { asked++; return keepPlaces.call(W13.weather); };
    W13.hazard.setSettings({ weatherLink: false });
    const r13a = W13.hazard.rollAll();
    assert.ok(r13a.ok === false && r13a.reason === 'link-off' && r13a.asked === 0 && r13a.results.length === 0,
      '13a 联动关 ⇒ link-off 且零结果（实 ' + JSON.stringify([r13a.reason, r13a.asked]) + '）');
    assert.ok(asked === 0, '13a 联动关 ⇒ **连天气的地点清单都不问**（实问 ' + asked + ' 次，本版要治的「关闭还照样跑一圈」）');
    // 13b 总开关关：同样零开销，且理由与「联动关」分得开
    W13.hazard.setSettings({ enabled: false });
    const r13b = W13.hazard.rollAll();
    assert.ok(r13b.reason === 'disabled' && asked === 0, '13b 总开关关 ⇒ disabled 且零问（实 ' + r13b.reason + '/' + asked + '）');
    W13.hazard.setSettings({ enabled: true, weatherLink: true });
    // 13c 开着：逐地过一遍（甲镇 storm 建账 / 乙镇 rain 不达白名单 / 丙镇未登记天气）
    W13.weather.setWeather(P.A, 'storm');
    W13.weather.setWeather(P.B, 'rain');
    //   ⚠「问满几地」的口径 = **已登记天气的地点**数（`places()` 报的是天气表）：
    //     甲镇 storm / 乙镇 rain 两处；丙镇只活在世界表里，天气表没它 —— 早先按「世界表 3 地」写，
    //     当场红。读数一律用真值拼接（本仓库铁律：两套数并列是最贵的缺陷，
    //     红字只报一个合计就分不清是「少问一地」还是「多问一地」）。
    const r13c = W13.hazard.rollAll();
    assert.ok(r13c.ok === true && r13c.asked === 2, '13c 逐落地结算问满 2 个已登记天气的地点（实 ' + r13c.asked + '）');
    assert.ok(r13c.created === 1 && rows(W13).length === 1, '13c 只有风暴那一地建了账（实建 ' + r13c.created + '）');
    const why = r13c.results.map(function (r) { return (r && r.reason) || '?'; }).sort().join(',');
    assert.ok(why === 'below-threshold,triggered', '13c 每地的理由**照实各留**（实 ' + why + '，本版要治的「并成一个失败」）');
    // 13d 二次结算不堆行（还是那一行，触发计数累加）
    const r13d = W13.hazard.rollAll();
    assert.ok(rows(W13).length === 1 && r13d.created === 0 && W13.hazard.stat().triggers === 1,
      '13d 二次结算不堆行、不再计建账（实行数 ' + rows(W13).length + ' / triggers ' + W13.hazard.stat().triggers + '）');
    // 13e 天气模块缺席 ⇒ engine-absent（不是「问了 0 个地点 ⇒ 世界很平静」）
    const keepWx13 = W13.weather;
    delete W13.weather;
    const r13e = W13.hazard.rollAll();
    assert.ok(r13e.ok === false && r13e.reason === 'engine-absent', '13e 天气模块缺席 ⇒ engine-absent（实 ' + r13e.reason + '）');
    W13.weather = keepWx13;
    // 13f 主链挂点在场：节点真注册、真调结算（只声明不调 = 空节点）
    const nodes = W13.workflow.list('after');
    const nd = nodes.filter(function (n) { return n.id === 'hazard.weatherTrigger'; })[0];
    assert.ok(!!nd, '13f 主链挂点在册（after 链里找得到）');
    assert.ok(nd.order === 13 && nd.critical === false, '13f 节点排位 after/13 且非 critical（实 ' + nd.order + '/' + nd.critical + '）');
    // 排位的真依据是 `calendar.autoAdvance`（12，世界钟先走）：结算必须排在**推进之后**。
    //   ⚠ 早先这里拿 `hazard.tick` 当基准、还写「tick 是 14」——那是**注释里的假事实**：
    //     全仓（产品码 + 测试 + 账本）零处把它挂成节点，`list('after')` 里根本没有它，
    //     下标恒为 -1，判据必然红。改为按**同链内真实存在的节点**定序；
    //     再补一条「假设 tick 真挂进来会怎样」——注释不许替未挂点的函数占位。
    const ids = nodes.map(function (n) { return n.id; });
    assert.ok(ids.indexOf('hazard.weatherTrigger') > ids.indexOf('calendar.autoAdvance'),
      '13f 结算排在世界钟推进（calendar.autoAdvance）之后（实 ' + ids.indexOf('hazard.weatherTrigger') + ' > ' + ids.indexOf('calendar.autoAdvance') + '）');
    const tickAdj = { id: 'hazard.tick', chain: 'after', order: 14, label: '假设挂点（仅本判据用）', run: function () {} };
    const nodes2 = nodes.concat([tickAdj]).sort(function (x, y) { return (x.order - y.order) || x.id.localeCompare(y.id); });
    const ids2 = nodes2.map(function (n) { return n.id; });
    assert.ok(ids2.indexOf('hazard.weatherTrigger') < ids2.indexOf('hazard.tick'),
      '13f 假设 hazard.tick 真挂到 after/14 时，结算仍排在它之前（实 ' + ids2.indexOf('hazard.weatherTrigger') + ' < ' + ids2.indexOf('hazard.tick') + '）');
    // 13g 点一次天气（真 API）后跑该节点 ⇒ 账本里真多出一行（节点不是空壳）
    const W13b = makeEnv();
    W13b.weather.setWeather(P.A, 'storm');
    const before13 = rows(W13b).length;
    const node13 = W13b.workflow.list('after').filter(function (n) { return n.id === 'hazard.weatherTrigger'; })[0];
    node13.run();
    assert.ok(rows(W13b).length === before13 + 1, '13g 主链节点真调结算 ⇒ 账本多出一行（实 ' + before13 + ' → ' + rows(W13b).length + '）');
  }

  // 14 与拒收码门禁一致：三个新码都写进了见证表（否则第十二面当场红灯）
  const witnessSrc = fs.readFileSync(path.join(BASE, 'tests/reject-v2780.js'), 'utf8');
  ['already-open', 'below-threshold', 'triggered'].forEach(function (c) {
    assert.ok(witnessSrc.indexOf("want('" + c + "'") >= 0, '新码 ' + c + ' 已进见证表（门禁第十二面可分类）');
  });

  // ── 负控制段（N0–N15 + 收尾门）住在 runNegative 里（run.js 的第二入口直接挂它）。
  //    此处也调一次：**单入口直跑**（`node tests/hazard-trigger-v2138.js`）时逆向面同样被跑，
  //    两个入口跑的是同一批真判据（不存在「入口一跑一套、入口二跑另一套」）。
  runNegative(a);
}

/**
 * 负控制段（逆向取证）：真源码破坏 → 装载破坏副本 → **在副本上重跑同款真判据**。
 * 与 runAll 共用模块级装配台（见文件头）；锚点仍只在本文件顶部的 ANCHORS 里声明一次。
 */
function runNegative(a) {
  const assert = require('./lock-assert.js').from(a);
  const fs = require('fs');
  const path = require('path');
  const src = SRC, srcBefore = SRC;
  const wSrc = WSRC, wSrcBefore = WSRC;
  const xSrc = XSRC, xSrcBefore = XSRC;
  // ══════════════ 逆向：真源码破坏 → 装载破坏副本 → 副本上重跑同款真判据 ══════════════
  // N0 前置：真源码里每条锚点恰中 1 次（与 H5 分列：H5 是判据纯度，N0 是负控制的前置）
  let n0 = 0;
  Object.keys(ANCHORS).forEach(function (k) {
    try { if (srcOf(ANCHORS[k].rel).split(ANCHORS[k].txt).length - 1 === 1) n0++; } catch (e) {}
  });
  assert.ok(n0 === Object.keys(ANCHORS).length, 'N0 ' + Object.keys(ANCHORS).length + ' 条锚点在各自目标文件内恰中 1 次（实 ' + n0 + '）');

  // N1 破坏「总开关闸」：条件置假 ⇒ 关闭态也建账（可观测）
  {
    const code = wreck('gate', "if (false) { noteFault('disabled'); return { ok: false, reason: 'disabled', place: pl }; }");
    const W = makeEnv({ 'engines/hazard.js': code });
    const H = W.hazard;                    // 当场抓下破坏副本的门面（见 probe* 头的说明）
    H.setSettings({ enabled: false });
    W.weather.setWeather(P.A, 'storm');
    const r = H.weatherTrigger(P.A);
    assert.ok(r.ok === true && rows(W).length === 1, 'N1 破坏可观测：关闭态也建了账（实 ' + JSON.stringify([r.ok, rows(W).length]) + '）');
    // N1 正控：原版在同路径下零建账（证明该判据未破坏时是绿的，不是恒绿）
    const Wp = makeEnv();
    const Hp = Wp.hazard;
    Hp.setSettings({ enabled: false });
    Wp.weather.setWeather(P.A, 'storm');
    Hp.weatherTrigger(P.A);
    assert.ok(rows(Wp).length === 0, 'N1 正控：原版关闭时零建账（实 ' + rows(Wp).length + '）');
  }

  // N2 破坏「联动闸」：条件置假 ⇒ 没打开联动也建账，且 link-off 判据由真变假
  {
    const code = wreck('linkOff', "if (false) { noteFault('link-off'); return { ok: false, reason: 'link-off', place: pl }; }");
    const Wp = makeEnv();
    assert.ok(probeLinkOff(Wp, Wp.hazard) === true, 'N2 正控：原版同款判据为真（link-off 且零建账）');
    const W = makeEnv({ 'engines/hazard.js': code });
    const H = W.hazard;
    assert.ok(probeLinkOff(W, H) === false, 'N2 破坏可观测：同款判据在副本上由真变假');
    assert.ok(rows(W).length === 1, 'N2 破坏可观测：没打开联动也真建了行（实 ' + rows(W).length + '）');
  }

  // N3 破坏「词表闸」：白名单判据置假 ⇒ 白名单外的天气也能触发（第二道闸拦住时，
  //    拦它的**理由**也随之改变 —— 这正是「以词表为准」失守的可观测面）
  {
    const code = wreck('whitelist', "if (false) {");
    const Wp = makeEnv();
    assert.ok(probeWhitelist(Wp, Wp.hazard) === true, 'N3 正控：原版白名单外不触发');
    const W = makeEnv({ 'engines/hazard.js': code });
    const H = W.hazard;
    assert.ok(probeWhitelist(W, H) === false, 'N3 破坏可观测：同款判据在副本上由真变假');
    // 把系数闸也降到下限 1.25 ⇒ 副本上白名单外的 rain（1.5）立刻长出账
    H.setSettings({ triggerFactor: 1.25 });
    W.weather.setWeather(P.A, 'rain');
    const r = H.weatherTrigger(P.A);
    assert.ok(r.ok === true && rows(W).length === 1, 'N3 破坏可观测：白名单外的 rain 也长出了一行灾害账（实 ' + r.reason + '）');
    // 正控同参数：原版在白名单外照样不建账（证明「词表为准」不是靠系数闸顺手拦下的）
    const Wp2 = makeEnv();
    Wp2.hazard.setSettings({ triggerFactor: 1.25 });
    Wp2.weather.setWeather(P.A, 'rain');
    assert.ok(Wp2.hazard.weatherTrigger(P.A).reason === 'below-threshold' && rows(Wp2).length === 0,
      'N3 正控同参数：原版把 triggerFactor 降到下限，rain 仍不建账（实 ' + Wp2.hazard.weatherTrigger(P.A).why + '）');
  }

  // N4 破坏「触发计数累加」：写死 1 ⇒ 重复触发不再累加（读数失真）
  {
    const code = wreck('hitAdd', "row.triggerHits = 1;");
    const Wp = makeEnv();
    assert.ok(probeNoPile(Wp, Wp.hazard) === true, 'N4 正控：原版重复触发累加到 2');
    const W = makeEnv({ 'engines/hazard.js': code });
    const H = W.hazard;
    assert.ok(probeNoPile(W, H) === false, 'N4 破坏可观测：同款判据在副本上由真变假');
    W.weather.setWeather(P.A, 'storm');
    H.weatherTrigger(P.A);
    const r = H.weatherTrigger(P.A);
    assert.ok(r.triggerHits === 1, 'N4 破坏可观测：触发计数恒 1（实 ' + r.triggerHits + '）');
  }

  // N5 破坏「成因刷新」：既有行的成因被改成 manual ⇒ 天气行冒充手工行
  {
    const code = wreck('byWeather', "row.causedBy = 'manual';");
    const W = makeEnv({ 'engines/hazard.js': code });
    const H = W.hazard;
    W.weather.setWeather(P.A, 'storm');
    H.weatherTrigger(P.A);
    H.weatherTrigger(P.A);
    assert.ok(H.read('weather:' + P.A).causedBy === 'manual',
      'N5 破坏可观测：天气造的行自称手工（实 ' + H.read('weather:' + P.A).causedBy + '，本版要治的「成因被冒名」）');
  }

  // N6 破坏「建行时写成因」：拔掉 causedBy ⇒ 新行读到 unrecorded（成因丢失）
  {
    const code = wreck('newRow', "at: clockNow('hazard'), weatherKind: kind, triggerHits: 1 });");
    const Wp = makeEnv();
    assert.ok(probeCause(Wp, Wp.hazard) === true, 'N6 正控：原版两条入口的成因可分辨');
    const W = makeEnv({ 'engines/hazard.js': code });
    const H = W.hazard;
    assert.ok(probeCause(W, H) === false, 'N6 破坏可观测：同款判据在副本上由真变假');
    // ⚠ 必须**另起一个**破坏副本再断言建行面：同实例里再触发一次会命中「已存在的行」，
    //   走的是 `row.causedBy = 'weather'` 那支（刷新既有行成因，未被破坏）——
    //   第一次实测就是这样拿到 'weather' 的：测的其实是另一条路径。
    const W6 = makeEnv({ 'engines/hazard.js': code });
    W6.weather.setWeather(P.C, 'snow');
    W6.hazard.weatherTrigger(P.C);
    assert.ok(W6.hazard.read('weather:' + P.C).causedBy === 'unrecorded', 'N6 破坏可观测：天气造的行成了「未记录成因」（实 ' + W6.hazard.read('weather:' + P.C).causedBy + '）');
    assert.ok(W6.hazard.stat().triggers === 1 && rows(W6).length === 1, 'N6 破坏可观测：行确实建了（触发计数 ' + W6.hazard.stat().triggers + '）——只是成因丢了');
  }

  // N7 破坏「计数只在真建行时 +1」：去掉 created 判据 ⇒ 重复触发也计数（读数失真）
  {
    const code = wreck('statInc', "if (out && out.ok) { stat.triggers++; stat.lastReason = out.reason; }");
    const W = makeEnv({ 'engines/hazard.js': code });
    const H = W.hazard;
    W.weather.setWeather(P.A, 'storm');
    H.weatherTrigger(P.A);
    H.weatherTrigger(P.A);
    assert.ok(H.stat().triggers === 2 && rows(W).length === 1,
      'N7 破坏可观测：只建了 1 行却报触发 2 次（实 ' + H.stat().triggers + '）');
  }

  // N8 破坏「手工入口写成因」：open 不再留 causedBy ⇒ 手工行也成 unrecorded（两条入口不再可分辨）
  {
    const code = wreck('manualBy', "at: clockNow('hazard') });");
    const W = makeEnv({ 'engines/hazard.js': code });
    const H = W.hazard;
    H.open(HK, '人写的');
    assert.ok(H.read(HK).causedBy === 'unrecorded',
      'N8 破坏可观测：手工行丢了成因（实 ' + H.read(HK).causedBy + '）');
    const Wo = makeEnv();
    Wo.hazard.open(HK, '人写的');
    assert.ok(Wo.hazard.read(HK).causedBy === 'manual', 'N8 正控：原版手工行答 manual（实 ' + Wo.hazard.read(HK).causedBy + '）');
  }

  // N9 破坏「旧行如实报」：unrecorded 改成 manual ⇒ 旧存档行被冒充成手工行（可观测）
  {
    const code = wreck('readUnrec', "causedBy: by || 'manual',");
    const W = makeEnv({ 'engines/hazard.js': code });
    const H = W.hazard;
    W.store.transact(function (d) { d.hazard.rows.push({ key: '旧行', note: '', count: 0, hits: 0, pending: false, waiting: 0, at: '' }); }, 'e2138hz:n9');
    assert.ok(H.read('旧行').causedBy === 'manual',
      'N9 破坏可观测：旧存档行被冒充成手工行（实 ' + H.read('旧行').causedBy + '，本版要治的「替旧行认领成因」）');
  }

  // N10 破坏「面板只写 weatherLink」：改成写 enabled ⇒ 点一次开关把总开关也改了（可观测）
  {
    const bu = wreckUI('uiWrite', 'w = hz.setSettings({ enabled: !!hzwx.checked });');
    // 原版同路径正控（证明该判据未破坏时是绿的，不是恒绿）
    const Wo = makeEnv();
    Wo.hazard.setSettings({ enabled: true, weatherLink: false });
    Wo.ui.mount();
    const dO = Wo.__uiDoc;
    Array.prototype.slice.call(dO.getElementById('wa-panel').querySelectorAll('.wa-tab'))
      .filter(function (t) { return t.dataset.page === 'settings'; })[0].onclick();
    const cO = dO.getElementById('wa-sw-hazardwx');
    assert.ok(!!cO && typeof cO.onchange === 'function', 'N10 正控前置：原版控件与绑定在场');
    cO.checked = true; cO.onchange();
    assert.ok(Wo.hazard.getSettings().weatherLink === true && Wo.hazard.getSettings().enabled === true,
      'N10 正控：原版点开关写的是 weatherLink（实 ' + JSON.stringify([Wo.hazard.getSettings().weatherLink, Wo.hazard.getSettings().enabled]) + '）');
    cO.checked = false; cO.onchange();
    assert.ok(Wo.hazard.getSettings().enabled === true, 'N10 正控：原版取消勾选不动总开关（实 ' + Wo.hazard.getSettings().enabled + '）');
    // 破坏副本：两条通道都给破坏形态（产品面一次 + 面板面一次）
    const W = makeEnv({ 'ui/settings.js': bu.code, 'engines/hazard.js': src });
    W.hazard.setSettings({ enabled: true, weatherLink: false });
    W.ui.mount();
    const d = W.__uiDoc;
    Array.prototype.slice.call(d.getElementById('wa-panel').querySelectorAll('.wa-tab'))
      .filter(function (t) { return t.dataset.page === 'settings'; })[0].onclick();
    const c = d.getElementById('wa-sw-hazardwx');
    assert.ok(!!c && typeof c.onchange === 'function', 'N10 破坏前置：破坏副本上控件与绑定仍在场');
    c.checked = true; c.onchange();
    assert.ok(W.hazard.getSettings().weatherLink === false && W.hazard.getSettings().enabled === true,
      'N10 破坏可观测：面板没写 weatherLink（实 ' + W.hazard.getSettings().weatherLink + '）');
    c.checked = false; c.onchange();
    assert.ok(W.hazard.getSettings().enabled === false,
      'N10 破坏可观测：取消勾选把**总开关**关掉了（实 ' + W.hazard.getSettings().enabled + '）——一个控件改两个语义');
  }

  // N11 破坏「词表常量」：把 clear 塞进白名单 ⇒ 系数闸立刻可达（不可达分支的诚实登记之反面证据）
  {
    const code = wreck('kinds', "const TRIGGER_KINDS = ['storm', 'snow', 'clear'];");
    const W = makeEnv({ 'engines/hazard.js': code });
    W.weather.setWeather(P.A, 'clear');
    const r = W.hazard.weatherTrigger(P.A);
    assert.ok(r.ok === false && r.reason === 'below-threshold' && r.why === 'factor-below-threshold',
      'N11 条件放宽后系数闸立刻可达（实 ' + r.why + '）——故不宜当成「永远死码」，本锁按不可达如实登记');
    const Wo = makeEnv();
    Wo.weather.setWeather(P.A, 'clear');
    assert.ok(Wo.hazard.weatherTrigger(P.A).why === 'kind-not-in-whitelist', 'N11 正控：原版同输入由词表先拦（实 ' + Wo.hazard.weatherTrigger(P.A).why + '）');
  }

  // N13 破坏「联动的零开销闸」：两层各破一次 —— 全关时仍不许建账（第一层破开，第二层仍拦）
  {
    // 第一层：把 rollAll 的联动闸置假 ⇒ 没打开联动也照样逐地跑一圈
    const code = wreck('rollAllGate', "if (false) return { ok: false, reason: 'link-off', asked: 0, results: [] };");
    const W = makeEnv({ 'engines/hazard.js': code });
    const H = W.hazard;
    H.setSettings({ weatherLink: false });
    W.weather.setWeather(P.A, 'storm');
    const r = H.rollAll();
    assert.ok(r.ok === true && r.asked >= 1, 'N13 破坏可观测：联动关着也跑了结算（实 ' + JSON.stringify([r.ok, r.asked]) + '）');
    //   ⚠ 这一层破到的是「结算的闸」，内层 `weatherTrigger` 的联动闸**仍在** —— 于是结算跑了、
    //     账却建不出来。原判据在这里断言 `rows === 1` 是**判据自身的错误**（实测 0 行）：
    //     它把「破一层」读成了「破全链」。改测**理由变了**：关着时逐地回执从「没问过」
    //     变成「问了但没打开」——那正是这一层破坏的真实可观测面。
    assert.ok(r.results.length === 1 && r.results[0].reason === 'link-off',
      'N13 破坏可观测：关着也逐地留下回执，理由 link-off（实 ' + JSON.stringify(r.results.map(function (x) { return x && x.reason; })) + '）');
    // 第二层：连内层 `weatherTrigger` 的同一道闸也置假 ⇒ 这才真把「关闭即零开销」整条打穿。
    //   ⚠ 「link-off」这件事实在**两处**各判一次（结算处 + 建账处）：只破一处时世界照样平静，
    //     必须同码两处一起破才测得建账 —— 否则判据是在替一层闸宣称整条链路（实测踩到）。
    const code2 = wreck('rollAllGate', "if (false) return { ok: false, reason: 'link-off', asked: 0, results: [] };")
      .replace(ANCHORS.linkOff.txt, "if (false) { noteFault('link-off'); return { ok: false, reason: 'link-off', place: pl }; }");
    const W2 = makeEnv({ 'engines/hazard.js': code2 });
    const H2 = W2.hazard;
    H2.setSettings({ enabled: true, weatherLink: false });
    W2.weather.setWeather(P.A, 'storm');
    const r2 = H2.rollAll();
    assert.ok(rows(W2).length === 1 && r2.created === 1, 'N13 两层破坏可观测：关着也真建了账（实建 ' + r2.created + ' / 行数 ' + rows(W2).length + '，本版要治的「关闭还照样跑」）');
    // 正控：原版同参数下零问零建
    const Wp = makeEnv();
    Wp.hazard.setSettings({ weatherLink: false });
    Wp.weather.setWeather(P.A, 'storm');
    assert.ok(Wp.hazard.rollAll().reason === 'link-off' && rows(Wp).length === 0, 'N13 正控：原版联动关着零建账（实 ' + rows(Wp).length + '）');
  }

  // N14 破坏「天气门面缺席的如实拒」：改成自己翻存档硬算 ⇒ 门面缺席时也照样建账（可观测）
  {
    //   ⚠ 只破这一层，能观测到的只是「照跑一圈、逐地如实报 engine-absent」——**建不出账**：
    //     建账还要问天气，天气门面缺席时 `weatherAt` 自己就会如实拒。真正把「如实拒」打穿的
    //     是**两层一起破**（问题就在第一层的话，第二层也躲不掉）。故这里补第二层：
    //     把 `weatherAt` 的缺席闸也置假、并让它自己给系数 —— 那才是「越过门面自己硬算」。
    const raw = "const list = (((WA.store.get() || {}).weather || {}).rows || []).map(function (x) { return x && x.place; }).filter(Boolean);";
    const absent = "if (!wx || typeof wx.effect !== 'function') return { ok: false, reason: 'engine-absent', place: pl, factor: 1 };";
    const code = wreck('rollAllAbsent', "if (false) return { ok: false, reason: 'engine-absent', asked: 0, results: [] };")
      .replace(ANCHORS.rollAllPlaces.txt, raw)
      .replace(absent, "void wx; return { ok: true, place: pl, kind: 'storm', factor: 2 };");
    const W = makeEnv({ 'engines/hazard.js': code });
    const H = W.hazard;
    W.weather.setWeather(P.A, 'storm');
    W.weather.setWeather(P.B, 'storm');
    // 门面缺席：原版会照实拒；破坏版**越过门面**直接读存档 ⇒ 照样跑一圈
    const keepWx = W.weather;
    delete W.weather;
    const r = H.rollAll();
    W.weather = keepWx;
    assert.ok(r.ok === true && r.asked === 2 && rows(W).length === 2,
      'N14 两层破坏可观测：天气门面整个缺席时，坏副本越过门面自己翻存档、还建了 2 行（实 ' + JSON.stringify([r.ok, r.asked, rows(W).length]) + '）');
    //   只破第一层时，如实拒**仍然成立**（第二层闸在拦）—— 这不是「破坏不可观测」，而是
    //   「两层复合闸」的真实形状：单破一层要能观测到它自己的那一面（照跑一圈），
    //   没有第二层确认，就不该声称整条打穿（否则判据会把「破一层」读成「破全链」）。
    const code1 = wreck('rollAllAbsent', "if (false) return { ok: false, reason: 'engine-absent', asked: 0, results: [] };")
      .replace(ANCHORS.rollAllPlaces.txt, raw);
    const W1 = makeEnv({ 'engines/hazard.js': code1 });
    W1.weather.setWeather(P.A, 'storm');
    const keep1 = W1.weather;
    delete W1.weather;
    const r1 = W1.hazard.rollAll();
    W1.weather = keep1;
    assert.ok(r1.ok === true && r1.asked === 1 && r1.results[0].reason === 'engine-absent' && rows(W1).length === 0,
      'N14 单破第一层可观测：照跑一圈、逐地如实报 engine-absent、零建账（实 ' + JSON.stringify([r1.ok, r1.asked, r1.results[0].reason, rows(W1).length]) + '）');
    // 正控：原版同路径如实拒、零建账
    const Wp = makeEnv();
    Wp.weather.setWeather(P.A, 'storm');
    const keepWp = Wp.weather;
    delete Wp.weather;
    const rp = Wp.hazard.rollAll();
    Wp.weather = keepWp;
    assert.ok(rp.ok === false && rp.reason === 'engine-absent' && rows(Wp).length === 0,
      'N14 正控：原版在门面缺席时如实报 engine-absent 且零建账（实 ' + rp.reason + '/' + rows(Wp).length + '）');
  }

  // N15 工具两向自证：锚点不存在 / 不唯一须抛；破坏须可观测改行为（H6）
  let n15 = 0;
  try { wreck('no-such-anchor-e2138b', ''); } catch (e) { n15++; }
  try {
    // 「不唯一」的造法：拿一个在源码里出现多次的片段当锚点（未登记进 ANCHORS，故不违反 H5）
    const dup = ANCHORS.hitAdd.txt;
    const s2 = src + '\n// ' + dup + '\n';
    if (s2.split(dup).length - 1 !== 1) throw new Error('dup');
  } catch (e) { n15++; }
  try {
    const code = wreck('gate', "if (false) { noteFault('disabled'); return { ok: false, reason: 'disabled', place: pl }; }");
    if (code !== src && code.indexOf(ANCHORS.gate.txt) < 0) n15++;
  } catch (e) {}
  try {
    const code = wreck('rollAllGate', "if (false) return { ok: false, reason: 'link-off', asked: 0, results: [] };");
    if (code.indexOf(ANCHORS.rollAllGate.txt) < 0) n15++;
  } catch (e) {}
  assert.ok(n15 === 4, 'N15 工具两向自证：不存在的锚点必抛 / 不唯一的锚点必抛 / 破坏真能改掉锚点（实 ' + n15 + '）');

  // ══════════════ 收尾门：原文件逐字未变（破坏只发生在内存副本上） ══════════════
  assert.ok(fs.readFileSync(ABS, 'utf8') === srcBefore, '收尾门：engines/hazard.js 逐字未变（破坏只在内存副本）');
  assert.ok(fs.readFileSync(path.join(BASE, WREL), 'utf8') === wSrcBefore, '收尾门：ui/settings.js 逐字未变（破坏只在内存副本）');
  assert.ok(fs.readFileSync(path.join(BASE, WXREL), 'utf8') === xSrcBefore, '收尾门：engines/weather.js 逐字未变（本锁只读它）');
}

module.exports = { runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } };
  try { module.exports.runAll(a); }
  catch (e) { fail++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (fail) { console.log('HAZARD-TRIGGER-V2138: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('HAZARD-TRIGGER-V2138: pass（' + pass + ' 项）');
}
