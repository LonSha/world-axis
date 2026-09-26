#!/usr/bin/env node
// WorldAxis tests/switch-matrix-v2910.js —— v2.91.0（O4 因果与状态批量治理）
//
// 【它治的两个缺口】
//   ① **开关矩阵的两面真值**：v2.84.1 的 settle-v2841 已逐源证明「关掉可见性 ⇒ 该源消失」，
//      但它只翻了**一面**。真正决定「某个源进不进正文」的是两个开关**相与**：
//        · 渲染可见性 `vis[k]`（用户勾的）；
//        · 模块级总开关 `getSettings().enabled`（模块自己声明的）。
//      实测（O4 侦察四支探针）：勾着 longline 而关掉模块，产物里**一个字节都没有**，
//      而旧账把这一轮报成「本轮无内容」——用户会一路去改世界内容，改不动，
//      因为那个源**根本没被调用过**。本版补上第三个状态码 `module-off`，
//      并加一张逐源两面对账表（`visibilityStat().faceAudit`）。
//   ② **跨模块身份引用的悬空**：关系 / 量值 / 承诺三类行里的 `target` 都是**名字引用**，
//      而名字的生死从来没人核对——某人被改名、被解除绑定、或从来没登记过，
//      指向他的行仍原样留着，且在任何出口上都看不见（`idStat` 只对账
//      「people 容器键 ↔ 持久 id」，看不见**行内 target** 这一层）。
//      口径：**只报不删**——悬空引用不是错误，是待确认的旧账，
//      自动清掉等于替作者做了「这个关系不算数」的决定。
//
// 【判据】（A 成类锁 / B 运行时 / C 缺陷锁 / N 负控制）
//   A1 显式映射表在场；七态归因码全部落在真源码里；module-off 是归因链的一支。
//   A2 三态读取自模块**自己登记**的项；该键没登记 ⇒ 如实报不可判定（不猜成已关）。
//   B1 对账面逐源覆盖全部源、面码封闭、无模块开关的源报 unavailable。
//   B2 模块关 ⇒ module-off（与「用户关的 visibility-off」不混，同一个源可翻转）。
//   B3 模块开 ⇒ landed（开关真改归因，不是恒报一个值）。
//   B4 对账面与解释面**同源**，且两侧随事实一起翻。
//   B5 module-absent ≠ module-off；对账面看的是**设置真值**不是模块在不在。
//   B6 三类悬空被逐条点名、按类计数、**只报不删**、带分母。
//   B7 指向已登记的名字 / 存档容器键不算悬空（反面对照）。
//   B8 诊断面真消费（modules.danglingRefs / inject.faceOff / faceUnavailable）。
//   B9 面板面真消费（按钮 + 绑定 + 守卫登记 + 只列异常面）。
//   C1 表恰覆盖「有模块级总开关的源」，不多不少；表里没有源表之外的键。
//   C2 表里每个值都是**真登记键**；只有真拿到布尔值才算可判定。
//   N0 三个破坏锚点在真源码各恰中 1 次。
//   N1a/N1b/N1c 真源码破坏 ⇒ B2/B1/B6 各自现形；N2 影响面有限；
//   N3 原版读数自洽（不硬编码绝对计数）；N4 锚点工具两向自证 + 读数随事实变化。
//
// 【首跑十处失败的教训（判据自己写错，不是实现错）】
//   ① **不能假设模块开关的默认值**：run.js 各 section 共享宿主面（localStorage），
//      前序用例把模块开关改过之后，本锁看到的「默认态」可能是开着的一批。
//      凡是依赖开关状态的读数，一律在 seed 里**显式置定**，不吃环境。
//   ② `gate.fresh()` 复用的是**同一个 WA 对象**（模块重装、对象不换）——
//      早先取的实例读数不会因为后面又 fresh 一次而变，但 store/设置会。
//      故每条判据只用「本段自己 seed 过的那个实例」，不跨段复用变量。
//   ③ 对账明细是按**扫描顺序**返回的（relationships → relations → commitments），
//      不是字典序；拿 `sort()` 后的期望串去比会把自己写错。
//   ④ 条件置假有两种语义，**要挑对方向**：把守卫条件置 `false` 会让它**多报**
//      （连正例、空串都报），置 `true` 才是**静默报零**——
//      而「静默报零」才是对账类功能最危险的失效形态（它看起来像「一切正常」）。
//'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const gate = require('./ui-gate-sync.js');
const INJECT = path.join(BASE, 'render/inject.js');
const DIAG = path.join(BASE, 'engines/tool-diag.js');
const PANEL = path.join(BASE, 'ui/panel.js');
const REGISTRY = path.join(BASE, 'actors/registry.js');
function src(p) { return fs.readFileSync(p, 'utf8'); }
// ── 真源码破坏锚点（各恰中 1 次才动刀）──
const ANCHOR_OFF = "else if (moduleEnabled(k) === false) st = 'module-off';";
const ANCHOR_FACE = "else if (mod === false) face = 'mod-off';";
// v2.97.0（O9）重取：三类分类由两处内联循环收进单一 `mark()`（直认 / 靠别名认 / 谁也认不出
//   三态**分列**），旧锚点 `byKind[sec]++` / `byKind.commitment++` 已随结构消失。
//   新锚点取 mark() 的守卫 + 后续分支——语义与原锚点**同一件事**（「名字认不出来 ⇒ 记一笔」），
//   且在全仓唯一（该守卫只此一处）。
const ANCHOR_DANG = "        if (!t || known[t]) return;\n        if (rev[t]) {";
// 第二条独立行为面（v2.97.0 新增）：**靠改名台账兜住**的那一支。它必须与上面那一支
//   各自可证——两支若合一，「有人把名字改坏了」与「这里记着一个早没人认得的名字」
//   会重新长得一模一样（那正是 O9 要消灭的那种混同）。
const ANCHOR_ALIAS_BODY = "        if (rev[t]) {\n          const up = canonicalOf(t);";
// 破坏形态：条件置假 / 条件置真（**不删行**——删条件会留下悬空 else ⇒ 破坏副本语法错，
//   「装不起来」证明不了判据敏感；而「装不起来」与「判据失灵」是两件事）
const BREAK_OFF = "else if (false && moduleEnabled(k) === false) st = 'module-off';";
const BREAK_FACE = "else if (false && mod === false) face = 'mod-off';";
const BREAK_DANG_NIL = "        if (true || !t || known[t]) return;\n        if (rev[t]) {";
// 第二支的破坏取**置假**（不是置真）：置真在「无别名登记」时不可观测 ⇒ 那是假敏感
//   （本仓库点过名的一类坏负控制）；置假则无论有没有别名登记都改变行为面。
const BREAK_ALIAS_OFF = "        if (false && rev[t]) {\n          const up = canonicalOf(t);";
const BREAK_DANG_ALL = "        if (false && (!t || known[t])) return;\n        if (rev[t]) {";
// 归因码封闭集合（v2.91.0 由六态扩到七态：新增 module-off）
const STATES = ['landed', 'landed-in-state', 'visibility-off', 'module-absent', 'module-off', 'failed', 'no-content'];
// 面码封闭集合（对账面四态）
const FACES = ['on', 'vis-off', 'mod-off', 'unavailable'];
const LL = 'longline';
function hits(s, anchor) {
  const n = s.split(anchor).length - 1;
  if (n !== 1) throw new Error('锚点命中 ' + n + ' 次（要求恰 1 次）: ' + anchor.slice(0, 60));
  return n;
}
function fresh(ov) { return gate.fresh(ov || undefined); }
/** 源键 → 模块 settings 键：**从真源码解析**（不抄副本——抄的那份迟早漂） */
function modSettingMap() {
  const s = src(INJECT);
  const i = s.indexOf('const SRC_MOD_SETTING = {');
  if (i < 0) return {};
  const j = s.indexOf('};', i);
  const seg = s.slice(i + 'const SRC_MOD_SETTING = {'.length, j);
  const out = {}, re = /([A-Za-z_$][\w$]*)\s*:\s*'([^']+)'/g;
  let m; while ((m = re.exec(seg)) !== null) out[m[1]] = m[2];
  return out;
}
const MAP = modSettingMap();
const MAP_KEYS = Object.keys(MAP).sort();
/** 按**真登记项**改模块总开关（造壳去读正是本版要治的错法，此处绝不重犯） */
function setEnabled(WA, key, on) {
  const sk = MAP[key];
  if (!sk) return false;
  const reg = (WA.__settingsRegs || []).filter(function (r) { return r && r.key === sk; })[0];
  if (!reg) return false;
  const all = WA.settingsBus.read(reg) || {};
  all.enabled = !!on;
  WA.settingsBus.save(reg, all);
  return true;
}
function seed(WA) {
  WA.store.init();
  WA.store.transact(function (d) {
    // 显式复位：run.js 里本锁与前序 section 共享 localStorage，
    //   不重置就会读到别人留下的存档（「读数随环境漂」的老坑）。
    d.clock = { iso: '', label: '第1日', dayIndex: 0, source: 'unset' };
    d.background = { text: 'BG', updatedAt: 0 };
    d.people = {};
    d.people.p1 = { id: 'p1', name: '甲', location: 'A', action: '走' };
    d.evolution = d.evolution || {};
    d.evolution.round = 3;
    d.lastInjection = null;
    d.memory = d.memory || {};
    // 长线伏笔：已过承诺时刻 ⇒ buildBlock 出内容 ⇒ 模块开时**真落地**（正样本）
    d.memory.foreshadows = [{ id: 'f-v2910', content: '<<TOK-V2910>>', status: 'waiting', dueAt: 1 }];
  }, 'switch-matrix-v2910:seed');
  WA.render.SOURCES.forEach(function (k) { WA.render.setVisibility(k, true); });
  // 开关状态**显式置定**，不吃环境：longline 开、其余有模块开关的一律关。
  //   （首跑就是在这吃了一次：前序 section 把一批模块打开过，于是「默认全关」的假设塌了。）
  MAP_KEYS.forEach(function (k) { setEnabled(WA, k, k === LL); });
}
/** 三条悬空引用的种子：raw 行里同时埋正例（已登记 / 空串）——只该报出未登记的三个 */
function seedPeople(WA) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people.p_甲 = { id: 'p_甲', name: '甲', profile: {
      relationships: [{ target: '丙' }, { target: '已登记' }, { target: '' }],
      relations: [{ target: '丁' }] },
      life: { commitments: [{ target: '戊' }, { target: '容器键' }] } };
    d.people.p_已登记 = { id: 'p_已登记', name: '已登记' };
    d.people.p_容器键 = { id: 'p_容器键', name: '容器键' };
  }, 'switch-matrix-v2910:people');
}
/**
 * v2.97.0（O9）探针：**同一批函数**在原版与破坏副本上跑。
 *   夹具：给「甲」挂一条旧名「阿甲」，再让一条关系行指向那个**旧名**。
 *   原版上它应被改名台账兜住（进 aliasRows，真悬空仍是 3 条）；
 *   别名支被拆掉之后它会掉回 rows（真悬空变 4 条）——「改名」重新等于「断链」。
 */
function probeAliasRow(WA) {
  // 夹具自足（本段实测踩到）：别名表住在**设置面**（localStorage），同一进程里别的锁
  //   若曾往它写过，本探针读到的就不是自己挂的那一条 —— 判据会呈现成「原版不干净」，
  //   而真凶在别人身上。故先按产品的方式把这张表清空（与 alias-trace 的 seed 同习俗）。
  (function () {
    const reg = (WA.__settingsRegs || []).filter(function (r) {
      return r && r.key === 'worldaxis_registry_alias_v1';
    })[0];
    if (reg && WA.settingsBus) { try { WA.settingsBus.save(reg, {}); } catch (e) {} }
  })();
  WA.store.transact(function (d) {
    d.people.p_甲.profile.relationships.push({ target: '阿甲' });
  }, 'switch-matrix-v2910:alias-target');
  // 规范名须**在册**（本模块的口径：给一个不存在的人登记历史名等于凭空造一个身份）。
  //   夹具走真 API 登记身份，而不是手工改设置表——那正是「唯一写者」这条口径要的用法。
  WA.registry.identityOf('甲');
  const r = WA.registry.bindAlias('甲', { was: '阿甲' });
  const dg = WA.registry.danglingRefs();
  return { bound: r.ok === true, rows: dg.rows, aliasRows: dg.aliasRows, aliasNames: dg.aliasNames };
}
function inject(WA) { WA.render.applyInjections({ injections: [] }); return WA.store.get().lastInjection; }
function stateOf(ex, key) {
  return (ex.omniscient.decisions.filter(function (x) { return x.key === key; })[0] || {}).state;
}
function auditOf(WA) { return WA.render.visibilityStat().faceAudit || []; }
function faceOf(WA, key) {
  return (auditOf(WA).filter(function (r) { return r.key === key; })[0] || {}).face;
}
function modOf(WA, key) {
  return (auditOf(WA).filter(function (r) { return r.key === key; })[0] || {}).moduleEnabled;
}
function rowsOfFace(WA, f) { return auditOf(WA).filter(function (r) { return r.face === f; }); }
function runAll(a) {
  const injSrc = src(INJECT), regSrc = src(REGISTRY), diagSrc = src(DIAG), panSrc = src(PANEL);
  const H = fresh();
  const W = H.WA;
  seed(W);
  const sources = W.render.SOURCES;
  const audit = auditOf(W);
  const decidable = audit.filter(function (r) { return typeof r.moduleEnabled === 'boolean'; })
    .map(function (r) { return r.key; }).sort();
  const noSW = audit.filter(function (r) { return r.moduleEnabled === null; })
    .map(function (r) { return r.key; }).sort();
  // ── A 面 ──
  a(injSrc.indexOf('const SRC_MOD_SETTING = {') > 0 && MAP_KEYS.length > 0,
    'v2910: [A1] 源键 → 模块 settings 键的**显式**映射表在场（' + MAP_KEYS.length + ' 项；不猜命名约定）');
  const missSt = STATES.filter(function (s) { return injSrc.indexOf("'" + s + "'") < 0; });
  a(missSt.length === 0, 'v2910: [A1] 七态归因码全部落在真源码里（缺: ' + (missSt.join(',') || '无') + '）——封闭集合随源码同批增长');
  a(injSrc.indexOf(ANCHOR_OFF) >= 0, 'v2910: [A1] module-off 是 sourceDecisions 归因链的一支（不是在别处另算的读数）');
  a(MAP_KEYS.length + noSW.length === sources.length,
    'v2910: [A1] 表内（有模块开关）' + MAP_KEYS.length + ' + 表外（由 store 直供）' + noSW.length
      + ' = 源面 ' + sources.length + '——两张面拼起来不留缝');
  // A2：三态读的输入面——正例（走登记表）+ 反例（该键没登记 ⇒ 如实报不可判定，不猜成已关）
  const fnI = injSrc.indexOf('function moduleEnabled(k) {');
  const fnSeg = injSrc.slice(fnI);
  const fnBody = fnSeg.slice(0, fnSeg.indexOf('\n  }') + 4);
  a(fnBody.indexOf('__settingsRegs') > 0 && fnBody.indexOf('settingsBus.read(reg)') > 0,
    'v2910: [A2] 三态读取自模块**自己登记**的项（含它声明的 def），不是拍脑袋拼的键');
  a(fnBody.split('\n').filter(function (l) { return l.trim().indexOf('//') !== 0; }).join('\n').indexOf('def: {}') < 0,
    'v2910: [A2] 代码里不再临时造壳登记项（造壳 ⇒ settingsBus 补不出 enabled 子键 ⇒ 默认关闭的模块被答成「不可判定」，本版实测过的三种答案就是它留下的；'
      + '注意函数体内的注释里仍写着这个历史错法——判据必须剥注释后再判，否则自己会踩成红灯）');
  const k0 = MAP_KEYS[0], savedRegs = W.__settingsRegs.slice();
  let regProbe = null;
  try {
    W.__settingsRegs = savedRegs.filter(function (r) { return !(r && r.key === MAP[k0]); });
    regProbe = auditOf(W).filter(function (r) { return r.key === k0; })[0];
  } finally { W.__settingsRegs = savedRegs; }
  a(!!regProbe && regProbe.moduleEnabled === null && regProbe.face === 'unavailable',
    'v2910: [A2] 该键没登记 ⇒ 如实报不可判定（实 ' + (regProbe && regProbe.face) + '）——不把「读不到」当「已关」');
  a(modOf(W, LL) === true && faceOf(W, LL) === 'on',
    'v2910: [A2] 登记表复原后同一源立刻回到可判定（实 ' + modOf(W, LL) + '/' + faceOf(W, LL) + '）——读数随事实走，不是缓存');
  // ── B 面 ──
  a(audit.length === sources.length, 'v2910: [B1] 对账面逐源覆盖（' + audit.length + '/' + sources.length + '）');
  const badFace = audit.filter(function (r) { return FACES.indexOf(r.face) < 0; });
  a(badFace.length === 0, 'v2910: [B1] 面码取封闭集合（越界: ' + (badFace.map(function (r) { return r.key + '=' + r.face; }).join(',') || '无') + '）');
  a(rowsOfFace(W, 'unavailable').map(function (r) { return r.key; }).sort().join(',') === noSW.join(','),
    'v2910: [B1] 无模块级总开关的源一律报 unavailable（' + noSW.length + ' 个：' + noSW.join('、') + '）——'
      + '六个快照源与 memory/ledger/digest 由 store 直供，不假装知道');
  const offRows0 = rowsOfFace(W, 'mod-off').map(function (r) { return r.key; }).sort();
  const expectOff = MAP_KEYS.filter(function (k) { return k !== LL; }).sort();
  a(offRows0.join(',') === expectOff.join(','),
    'v2910: [B1] 显式置定后「勾着却无效」的名单 = 全部关着的模块（' + offRows0.length + ' 个）——'
      + '这正是本版要让它可见的那一类');
  // B2：模块关 ⇒ module-off；与「用户关的 visibility-off」分开，且同一个源可翻转
  const Wb = fresh().WA;
  seed(Wb);
  const exOn = (inject(Wb), Wb.render.explain());
  a(stateOf(exOn, LL) === 'landed' && faceOf(Wb, LL) === 'on',
    'v2910: [B1] 模块开着的源真落地且对账为 on（实 ' + stateOf(exOn, LL) + '/' + faceOf(Wb, LL) + '）');
  setEnabled(Wb, LL, false);
  inject(Wb);
  const exOff = Wb.render.explain();
  a(stateOf(exOff, LL) === 'module-off',
    'v2910: [B2] 模块关 ⇒ 归 module-off（实 ' + stateOf(exOff, LL) + '）——'
      + '不报成「本轮无内容」（那会让人去改世界内容，改不动：源根本没被调用）');
  a(faceOf(Wb, LL) === 'mod-off', 'v2910: [B2] 对账面上同一源同码（实 ' + faceOf(Wb, LL) + '）——两面同源');
  a(stateOf(exOn, LL) !== stateOf(exOff, LL),
    'v2910: [B2] 同一个源、只翻模块开关：归因跟着翻（' + stateOf(exOn, LL) + ' → ' + stateOf(exOff, LL) + '）——不是恒报一个值');
  const Wv = fresh().WA;
  seed(Wv);
  Wv.render.setVisibility(LL, false);
  inject(Wv);
  const exVis = Wv.render.explain();
  a(stateOf(exVis, LL) === 'visibility-off',
    'v2910: [B2] 用户自己关的仍归 visibility-off（实 ' + stateOf(exVis, LL) + '）——两种「没进正文」不合并');
  a(stateOf(exVis, LL) !== stateOf(exOff, LL),
    'v2910: [B2] 「模块被关」与「用户关掉」是两个码（' + stateOf(exOff, LL) + ' vs ' + stateOf(exVis, LL) + '）');
  a(faceOf(Wv, LL) === 'vis-off', 'v2910: [B2] 对账面按同一条优先级给码（实 ' + faceOf(Wv, LL) + '）');
  // B3：开模块 ⇒ 对账面从 mod-off 回 on（读数随事实翻转）
  const W3 = fresh().WA;
  seed(W3);
  setEnabled(W3, LL, false);
  const offBefore = rowsOfFace(W3, 'mod-off').length;
  a(faceOf(W3, LL) === 'mod-off', 'v2910: [B3] 关闭后该源离开 on 面（实 ' + faceOf(W3, LL) + '）');
  setEnabled(W3, LL, true);
  const offAfter = rowsOfFace(W3, 'mod-off').length;
  a(offAfter === offBefore - 1,
    'v2910: [B3] 再打开 ⇒ 异常面少一个（' + offBefore + ' → ' + offAfter + '）——同一条读数，双向都动');
  a(faceOf(W3, LL) === 'on' && modOf(W3, LL) === true,
    'v2910: [B3] 恢复后该源回 on 面（实 ' + faceOf(W3, LL) + '）');
  // B4：对账面与解释面同源（同一份 moduleEnabled），两侧一起翻
  const W4 = fresh().WA;
  seed(W4);
  setEnabled(W4, LL, false);
  inject(W4);
  const ex4 = W4.render.explain();
  a(stateOf(ex4, LL) === 'module-off' && faceOf(W4, LL) === 'mod-off',
    'v2910: [B4] 解释面与对账面**同源**（走同一份 moduleEnabled，不是第二份实现）');
  a(ex4.omniscient.decisions.length === sources.length,
    'v2910: [B4] 归因面仍是逐源一条（' + ex4.omniscient.decisions.length + '）——新码不该改变归因面的宽度');
  // B5：模块缺席 ≠ 模块被关；对账面看的是设置真值，不是模块在不在
  const W5 = fresh().WA;
  seed(W5);
  const keepLL = W5[LL];
  let exAbsent = null, faceAbsent = null;
  try {
    delete W5[LL];
    inject(W5);
    exAbsent = W5.render.explain();
    faceAbsent = auditOf(W5).filter(function (r) { return r.key === LL; })[0];
  } finally { W5[LL] = keepLL; }
  a(stateOf(exAbsent, LL) === 'module-absent',
    'v2910: [B5] 模块没装载 ⇒ module-absent（实 ' + stateOf(exAbsent, LL) + '）——没装载 ≠ 装载了但关着');
  a(stateOf(exAbsent, LL) !== stateOf(exOff, LL),
    'v2910: [B5] 两个码不可互换（absent=' + stateOf(exAbsent, LL) + ' / off=' + stateOf(exOff, LL) + '）');
  a(!!faceAbsent && faceAbsent.moduleEnabled === true && faceAbsent.face === 'on',
    'v2910: [B5] 对账面看的是**设置真值**而不是模块在不在（缺席时设置仍为开，实 '
      + (faceAbsent && faceAbsent.face) + '）——两面各答各的问题：一格答「进不进得来」，一格答「勾了有没有用」');
  // ── B6/B7：跨模块身份引用的悬空 ──
  const W6 = fresh().WA;
  seed(W6); seedPeople(W6);
  const dg = W6.registry.danglingRefs();
  a(dg.rows === 3, 'v2910: [B6] 三类悬空各 1 条共 3 条被报出（实 ' + dg.rows + '）——正例（已登记 / 空串）不误报');
  a(dg.byKind.relationships === 1 && dg.byKind.relations === 1 && dg.byKind.commitment === 1,
    'v2910: [B6] 按类计数（实 ' + JSON.stringify(dg.byKind) + '）——关系 / 量值 / 承诺三类行都扫到');
  // 明细按**扫描顺序**返回（relationships → relations → commitments），不是字典序
  a(dg.items.map(function (x) { return x.target; }).join(',') === '丙,丁,戊',
    'v2910: [B6] 点名到具体名字且保序（实 ' + dg.items.map(function (x) { return x.target; }).join(',') + '）——只报计数等于把可修的线索丢了');
  a(dg.items.length <= 20, 'v2910: [B6] 明细有上限（' + dg.items.length + ' ≤ 20）——诊断读数不该把整张关系表拖进上下文');
  a(dg.items.every(function (x) { return x.from === '甲' && typeof x.kind === 'string'; }),
    'v2910: [B6] 每条都带「从谁指出来 + 哪一类」（可定位到人，不是一串孤立名字）');
  a(dg.items.map(function (x) { return x.kind; }).join(',') === 'relationships,relations,commitment',
    'v2910: [B6] 条目自带类别（实 ' + dg.items.map(function (x) { return x.kind; }).join(',') + '）——三类共用一条明细格式');
  const before6 = JSON.stringify(W6.store.get().people);
  W6.registry.danglingRefs();
  a(JSON.stringify(W6.store.get().people) === before6,
    'v2910: [B6] **只报不删**：对账不改存档（自动清掉等于替作者做了「这个关系不算数」的决定）');
  a(regSrc.indexOf('knownCount') > 0 && dg.knownCount > 0,
    'v2910: [B6] 同时报出「已知名字有几个」（' + dg.knownCount + '）——不给分母的分子没法判断严重程度');
  a(dg.items.indexOf('已登记') < 0 && dg.items.map(function (x) { return x.target; }).indexOf('已登记') < 0,
    'v2910: [B7] 指向已登记的人不算悬空（反面对照——否则任何关系都会被报，判据就成了噪声）');
  a(dg.items.map(function (x) { return x.target; }).indexOf('容器键') < 0,
    'v2910: [B7] 存档容器键（p_ 前缀）也算已知名字——两套名字来源等价');
  a(dg.items.map(function (x) { return x.target; }).indexOf('') < 0,
    'v2910: [B7] 空 target 不计入（脏行不是「悬空引用」，不混进这条读数）');
  a(dg.persisted === true, 'v2910: [B7] 明示对账面基于持久态（不是内存槽表）');
  // ── B8：诊断面真消费 ──
  const W8 = fresh().WA;
  seed(W8); seedPeople(W8); inject(W8);
  const dg8 = W8.toolDiag.collect();
  a(!!(dg8.modules && dg8.modules.danglingRefs) && dg8.modules.danglingRefs.rows === 3,
    'v2910: [B8] 诊断面是 danglingRefs 的真消费方（modules.danglingRefs.rows='
      + (dg8.modules && dg8.modules.danglingRefs && dg8.modules.danglingRefs.rows) + '）——没有消费方的导出等于死面');
  a(!!(dg8.inject) && Array.isArray(dg8.inject.faceOff) && dg8.inject.faceOff.length === rowsOfFace(W8, 'mod-off').length,
    'v2910: [B8] 诊断只报**异常**面（faceOff ' + (dg8.inject && dg8.inject.faceOff && dg8.inject.faceOff.length)
      + ' 项 = 本实例 mod-off ' + rowsOfFace(W8, 'mod-off').length + ' 项）');
  a(!!(dg8.inject) && dg8.inject.faceUnavailable === rowsOfFace(W8, 'unavailable').length,
    'v2910: [B8] 无模块开关的源只报计数（faceUnavailable=' + (dg8.inject && dg8.inject.faceUnavailable)
      + '）——常态不逐条撞进诊断');
  a(!!(dg8.inject && dg8.inject.faceOff[0]) && String(dg8.inject.faceOff[0]).indexOf('(') > 0,
    'v2910: [B8] 异常面每条带英文源键（实 ' + String(dg8.inject && dg8.inject.faceOff[0]) + '）——显示名会重名，键不会');
  // ── B9：面板面真消费 ──
  a(panSrc.indexOf('id="wa-inj-face"') > 0 && panSrc.indexOf("on('#wa-inj-face'") > 0,
    'v2910: [B9] 面板按钮渲染 + 绑定都在场（渲染了但绑定的 id 写错，此前无出口能发现）');
  a(panSrc.indexOf("r.face === 'mod-off'") > 0,
    'v2910: [B9] 按钮只列 mod-off（on / unavailable 是常态，全列等于把这条读数淹掉）');
  a(panSrc.indexOf('没有模块级总开关') > 0,
    'v2910: [B9] 无异常时给出「两面一致 + M 个源无模块开关」的读数（不静默给空白）');
  a(diagSrc.indexOf("'wa-inj-face'") > 0,
    'v2910: [B9] 守卫表登记了这枚按钮——**登记错页比不登记更坏**（看起来已被覆盖，实际永远查不到）');
  // ── C 面：映射表自身的完整性 ──
  const notSrc = MAP_KEYS.filter(function (k) { return sources.indexOf(k) < 0; });
  a(notSrc.length === 0, 'v2910: [C1] 表里没有源表之外的键（越界: ' + (notSrc.join(',') || '无') + '）');
  a(MAP_KEYS.join(',') === decidable.join(','),
    'v2910: [C1] 表恰覆盖「有模块级总开关的源」，不多不少（表 ' + MAP_KEYS.length + ' / 可判定 ' + decidable.length + '）');
  const regKeys = {};
  (W.__settingsRegs || []).forEach(function (r) { if (r && r.key) regKeys[r.key] = true; });
  const notReg = MAP_KEYS.filter(function (k) { return !regKeys[MAP[k]]; });
  a(notReg.length === 0, 'v2910: [C2] 表里每个值都是**真登记键**（缺: ' + (notReg.join(',') || '无') + '）——拼错一个键就会静默答「不可判定」');
  const badBool = audit.filter(function (r) { return MAP[r.key] ? typeof r.moduleEnabled !== 'boolean' : r.moduleEnabled !== null; });
  a(badBool.length === 0,
    'v2910: [C2] 只有真拿到布尔值才算可判定（越界: ' + (badBool.map(function (r) { return r.key + '=' + r.moduleEnabled; }).join(',') || '无') + '）');
  a(audit.every(function (r) {
    return typeof r.key === 'string' && typeof r.face === 'string' && typeof r.name === 'string' && r.name !== r.key
      && typeof r.visibility === 'boolean' && (r.moduleEnabled === null || typeof r.moduleEnabled === 'boolean');
  }), 'v2910: [C2] 逐源结构 = {key,name,face,visibility,moduleEnabled}（显示名不裸露英文键）');
  a(audit.filter(function (r) { return r.face === 'mod-off'; }).every(function (r) { return r.note && r.note.length > 0; }),
    'v2910: [C2] 异常面每条带说明（不是一串光秃秃的名字——面板要直接把它印给用户看）');
  // ── N 面 ──
  a(hits(injSrc, ANCHOR_OFF) === 1 && hits(injSrc, ANCHOR_FACE) === 1
    && hits(regSrc, ANCHOR_DANG) === 1 && hits(regSrc, ANCHOR_ALIAS_BODY) === 1,
    'v2910: [N0] 四个破坏锚点在真源码各恰中 1 次（inject×2 / registry×2：悬空支 + 别名支）');
  let threw = 0;
  try { hits(injSrc, '锚点根本不在源码里__v2910'); } catch (e) { threw++; }
  try { hits(injSrc + ANCHOR_OFF, ANCHOR_OFF); } catch (e) { threw++; }
  a(threw === 2, 'v2910: [N4] 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');
}
/** 负控制：真源码破坏 → **装上破坏副本** → 在副本上重跑与正面判据**同款**的断言 */
function runNegative(a) {
  const s = src(INJECT), r = src(REGISTRY);
  hits(s, ANCHOR_OFF); hits(s, ANCHOR_FACE); hits(r, ANCHOR_DANG); hits(r, ANCHOR_ALIAS_BODY);
  // N3：原版读数自洽，且**不硬编码绝对计数**（run.js 里各 section 共享宿主面，
  //   前序 section 的残留会让可判定源的个数漂移；本锁只钉相对事实）。
  const H0 = fresh();
  seed(H0.WA);
  const base = auditOf(H0.WA);
  const dec0 = base.filter(function (x) { return typeof x.moduleEnabled === 'boolean'; })
    .map(function (x) { return x.key; }).sort();
  a(dec0.join(',') === MAP_KEYS.join(','),
    'v2910: [N3] 原版上「表 = 可判定集合」自洽（表 ' + MAP_KEYS.length + ' / 可判定 ' + dec0.length + '）——判据不是瞎报');
  a(base.length === H0.WA.render.SOURCES.length && base.filter(function (x) { return FACES.indexOf(x.face) < 0; }).length === 0,
    'v2910: [N3] 原版上面码逐源在场且全在封闭集合内（' + base.length + ' 项）');
  const dgBase = (function () { const X = fresh(); seed(X.WA); seedPeople(X.WA); return X.WA.registry.danglingRefs(); })();
  a(dgBase.rows === 3 && dgBase.byKind.relationships === 1 && dgBase.byKind.relations === 1 && dgBase.byKind.commitment === 1,
    'v2910: [N3] 原版上三类悬空都被分辨出来（' + dgBase.rows + '）——下面破坏才有的可比');
  // N1a：把 `module-off` 归因置假 ⇒ 关着的模块被错报成别的东西（B2 现形）
  const b1 = s.replace(ANCHOR_OFF, BREAK_OFF);
  a(b1 !== s, 'v2910: [N1a] 破坏确实改写了源码（置假 module-off 归因）');
  const A1 = fresh({ srcOverride: { 'render/inject.js': b1 } });
  seed(A1.WA);
  setEnabled(A1.WA, LL, false);
  inject(A1.WA);
  const exa = A1.WA.render.explain();
  a(stateOf(exa, LL) !== 'module-off' && stateOf(exa, LL) === 'no-content',
    'v2910: [N1a] 破坏后 B2 现形：关着的模块被错报成 ' + stateOf(exa, LL)
      + '（正是本版要治的那句话——「本轮无内容」，让人去改世界内容，而那个源根本没被调用过）');
  // N2：影响面有限——错的是**归因码**，归因面的宽度与对账面都不受影响。
  //   注意读数**必须在同一个实例内取**：`fresh()` 复用同一个 WA 对象（模块重装、对象不换），
  //   跨两个实例的读数其实是同一份状态——那样比出来的差根本不是「破坏造成的差」。
  const A1b = fresh({ srcOverride: { 'render/inject.js': b1 } });
  seed(A1b.WA);
  setEnabled(A1b.WA, LL, true);
  const offOn = rowsOfFace(A1b.WA, 'mod-off').length;
  setEnabled(A1b.WA, LL, false);
  const offOff = rowsOfFace(A1b.WA, 'mod-off').length;
  a(offOff === offOn + 1,
    'v2910: [N2] 对账面不受此处破坏影响（同一个实例里关掉那个源：mod-off ' + offOn + ' → ' + offOff
      + '）——归因码与对账面是两条独立可证的面，破坏一条不动另一条');
  // N1b：把对账面的 `mod-off` 面置假 ⇒ 勾着却无效的源落进**常态面**（B1/B4 现形）
  const b2 = s.replace(ANCHOR_FACE, BREAK_FACE);
  a(b2 !== s, 'v2910: [N1b] 破坏确实改写了源码（置假对账面 mod-off 面）');
  const A2 = fresh({ srcOverride: { 'render/inject.js': b2 } });
  seed(A2.WA);
  setEnabled(A2.WA, LL, false);
  const audb = auditOf(A2.WA);
  a(rowsOfFace(A2.WA, 'mod-off').length === 0 && rowsOfFace(A2.WA, 'unavailable').length > 0,
    'v2910: [N1b] 破坏后 B1 现形：异常面清空、勾着却无效的源全落进常态（mod-off='
      + rowsOfFace(A2.WA, 'mod-off').length + ' / unavailable='
      + rowsOfFace(A2.WA, 'unavailable').length + '）——这条读数被淹掉');
  a(audb.length === base.length && audb.filter(function (x) { return FACES.indexOf(x.face) < 0; }).length === 0,
    'v2910: [N1b] 破坏副本仍逐源在场、面码仍封闭（不是「装不起来」，是**判据真敏感**）');
  // N1c-1：把悬空判定置**真** ⇒ 恒早退 ⇒ **静默报零**（B6 现形；这是对账类功能最危险的失效形态）
  const b3 = r.replace(ANCHOR_DANG, BREAK_DANG_NIL);
  a(b3 !== r, 'v2910: [N1c] 破坏确实改写了源码（把悬空判定的守卫置真 ⇒ 恒早退）');
  const A3 = fresh({ srcOverride: { 'actors/registry.js': b3 } });
  seed(A3.WA); seedPeople(A3.WA);
  const dgc = A3.WA.registry.danglingRefs();
  // v2.97.0（O9）自纠：分类收进单一 mark() 之后，置真 ⇒ **三类同时归零**
  //   （原结构里关系/量值走一个分支、承诺走另一个，故当时是「只剩承诺 1 条」）。
  //   断言随结构更新，但被证明的那件事没变：**静默报零看起来像「一切正常」**。
  a(dgc.rows === 0 && dgc.byKind.relationships === 0 && dgc.byKind.relations === 0 && dgc.byKind.commitment === 0,
    'v2910: [N1c] 破坏后 B6 现形：三类悬空**一条都不报**（实 ' + dgc.rows
      + ' / ' + JSON.stringify(dgc.byKind) + '）——静默报零看起来像「一切正常」');
  a(dgc.knownCount > 0, 'v2910: [N1c] 破坏后仍报分母（knownCount=' + dgc.knownCount + '）——分子归零而分母健在，正是这句话的可信伪装');
  // N1c-2：第二条独立行为面 = **靠改名台账兜住的那一支**（v2.97.0 O9 新增）。
  //   闭环口径：真源码上先跑同一条判据（必须干净）→ 单点破坏（锚点恰中 1 次）→
  //   装破坏副本 → 在副本上重跑**同一批函数**（必须现形）。
  const A4o = fresh();
  seed(A4o.WA); seedPeople(A4o.WA);
  const p4o = probeAliasRow(A4o.WA);
  a(p4o.bound && p4o.aliasRows === 1 && p4o.rows === 3,
    'v2910: [N1c] 原版上同一判据干净：旧名「阿甲」被改名台账兜住（aliasRows=' + p4o.aliasRows
      + '）而真悬空仍是 ' + p4o.rows + ' 条——「改过名」不等于「断过链」');
  const b4 = r.replace(ANCHOR_ALIAS_BODY, BREAK_ALIAS_OFF);
  a(b4 !== r && b4.indexOf(BREAK_ALIAS_OFF) >= 0,
    'v2910: [N1c] 别名支置假的可构造性成立（判据有现形空间）');
  const A4 = fresh({ srcOverride: { 'actors/registry.js': b4 } });
  seed(A4.WA); seedPeople(A4.WA);
  const p4 = probeAliasRow(A4.WA);
  a(p4.aliasNames === 1 && p4.aliasRows === 0 && p4.rows === 4,
    'v2910: [N1c] 破坏后现形：台账里那条旧名仍在（aliasNames=' + p4.aliasNames
      + '）却不再兜住任何引用（aliasRows=' + p4.aliasRows + '），真悬空涨到 ' + p4.rows
      + ' 条——「有人把名字改坏了」重新长得像「没人认得这个名字」');
  // N1c-3：条件置**假**是另一个方向——**多报**（连正例都报），说明该判据对破坏双向敏感
  const b5 = r.replace(ANCHOR_DANG, BREAK_DANG_ALL);
  a(b5 !== r, 'v2910: [N1c] 另一个方向的破坏同样可构造（守卫置假 ⇒ 连正例都报）');
  const A5 = fresh({ srcOverride: { 'actors/registry.js': b5 } });
  seed(A5.WA); seedPeople(A5.WA);
  const dge = A5.WA.registry.danglingRefs();
  a(dge.rows > 3 && dge.items.map(function (x) { return x.target; }).indexOf('已登记') >= 0,
    'v2910: [N1c] 守卫置假 ⇒ 连「指向已登记的人」都被报成悬空（实 ' + dge.rows
      + ' 条）——对账失去分辨力，B7 现形');
  // N4：非恒真——真实读数随事实变化（不是把 3 写死在判据里）
  const A6 = fresh();
  seed(A6.WA); seedPeople(A6.WA);
  const before = A6.WA.registry.danglingRefs().rows;
  A6.WA.store.transact(function (d) { d.people.p_丙 = { id: 'p_丙', name: '丙' }; }, 'v2910:register-丙');
  const after = A6.WA.registry.danglingRefs().rows;
  a(before === 3 && after === 2,
    'v2910: [N4] 非恒真：把那三个人之一**登记进存档**后悬空数立刻减一（' + before + ' → ' + after + '）'
      + '——读数随事实变化，不是把 3 写死在判据里');
}
module.exports = { runAll: require('./lock-assert.js').restoring(runAll), runNegative: require('./lock-assert.js').restoring(runNegative) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) { pass++; } else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); } catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('SWITCH-MATRIX-V2910: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('SWITCH-MATRIX-V2910: pass（' + pass + ' 项）');
}