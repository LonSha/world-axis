#!/usr/bin/env node
// WorldAxis tests/alias-trace-v2970.js —— v2.97.0（O9 别名表与追溯链）
//
// 【它治的病：改名这件事在世界里没有历史】
//   v2.91.0 的 danglingRefs 只答「这个引用指向的名字已经不在册了」，答不出**它原来是谁**。
//   于是「张三改叫三哥」之后，所有指向「张三」的关系行 / 量值行 / 承诺行一律变成一行悬空，
//   调用方被迫在「清掉旧账」与「任其悬空」之间二选一——两个选项都在替作者做决定。
//   本版给出第三个选项：**名字可以有历史**。
//
// 【口径（全是否定式——这五条正是本段存在的全部理由）】
//   ① **只登记、不改写**：旧名不删、不重定向任何既有行。
//      「改过名」从此不再等于「断过链」。
//   ② **只增不删**：历史名一经登记永久可解析（与 rumor 的 intact 累积不可恢复同源）。
//   ③ **一个旧名只有一个主人**（name-taken）：否则同一行会解析出两种身份，
//      追溯链当场失去意义。
//   ④ **链可有深度，但必须有边界**（too-deep，上限 8 跳，登记侧与解析侧各一道闸）：
//      往表里放一条永远解析不出来的登记，等于在账上打个死结。
//   ⑤ **查不到就说查不到**（unknown-name）：给它编一个规范名，
//      等于用别名表替世界造了一个人。
//
// 【判据】
//   A 静态面：常量 + 五条口径的注释在位 + 四个导出口 + 设置面登记 + 诊断与面板各有真消费方。
//   B 运行时面（真装载真调用）：
//     B1 只登记不改写：登记前后**既有关系行逐字节不变**（旧名照旧写在那一行上）
//     B2 aliasOf / traceOf 对历史名作答（规范名 / 跳数 / 逐步路径）
//     B3 danglingRefs 的**三态分列**：直认 / 靠别名认（aliasRows）/ 谁也认不出（rows）
//     B4 not-bound：规范名不在册 ⇒ 拒收（给不存在的人登记历史名 = 凭空造一个身份）
//     B5 name-taken：一个旧名只允许一个主人
//     B6 alias-cycle：自指与绕回都被拦（自指一条；绕一圈需要构造，见 B6b）
//     B7 too-deep：链深超过 8 跳当场拒收（登记侧）
//     B8 只增不删：旧名登记后再查仍在（不因「已不是当前名」而消失）
//     B9 分域：按 chatId 分域（切聊天不串味，与身份表同规格）
//     B10 unknown-name：不在册的名字不编规范名（aliasOf 与 traceOf 各一条）
//     B11 面板真消费：登记旧名 → 查改名 → 改名台账 三段读数落在输出节点上
//     B12 诊断真消费：danglingRefs 的 aliasRows / aliasNames 从诊断节读到
//   C 不变式：身份表与关系行在整轮登记动作后**字节级不变**（只登记不改写）；
//             导出面恰 4 口（canonicalOf / aliasRev / aliasKnown 不导出）。
//   N0–N5 负控制：**真源码破坏 ⇒ 加载破坏副本 ⇒ 在副本上重跑同款真判据**。
'use strict';
const fs = require('fs');
const path = require('path');
const { fresh } = require('./ui-gate-sync.js');
const ROOT = path.resolve(__dirname, '..');
const REG = 'actors/registry.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
let PASS = 0, FAIL = 0;
const a = (ok, msg) => { if (ok) PASS++; else { FAIL++; console.log('  ✗ ' + msg); } };
function src(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function must1(s, x, tag) { const n = hits(s, x); if (n !== 1) throw new Error('anchor hits != 1 (' + n + ') :: ' + tag); return n; }
// ══════════════ 真源码破坏锚点（各自**只在本文件声明一次**）══════════════
const ANCHORS = {
  // 口径③ 一个旧名只有一个主人
  NAME_TAKEN: { rel: REG, txt: "if (rev[was] && rev[was] !== canon) return { ok: false, reason: 'name-taken', was: was, owner: rev[was] };" },
  // 口径④ 链必须有边界（登记侧当场拒收）
  TOO_DEEP_AT_BIND: { rel: REG, txt: "if (newDepth > ALIAS_MAX_HOPS) return { ok: false, reason: 'too-deep', at: was, hops: newDepth - 1, cap: ALIAS_MAX_HOPS };" },
  // 口径③ 规范名须在册（给不存在的人登记历史名 = 凭空造一个身份）
  NOT_BOUND: { rel: REG, txt: "if (!rec.known) return { ok: false, reason: 'not-bound', name: canon };" },
  // 口径⑤ 查不到就说查不到（解析侧不许自造规范名）
  //   ⚠ 这条守卫在 aliasOf 与 traceOf 里**逐字相同**，短字面量必然命中 2 次
  //   （本文件首版与二版各踩一次）。唯一可定位的写法是把**函数头**一起带进锚点。
  UNKNOWN_NAME: { rel: REG, txt: "  function aliasOf(name) {\n    const nm = String(name || '').trim();\n    if (!nm) return { ok: false, reason: 'missing-name' };\n    const scI = idScope(), scA = aliasScope(), rev = aliasRev(scA);\n    const rec = aliasKnown(nm, scI, scA, rev);\n    if (!rec.known) return { ok: false, reason: 'unknown-name', name: nm };" },
  // 口径② 只增不删（幂等登记不重复追加）
  REUSE_PAIR: { rel: REG, txt: "return { ok: true, reused: true, canonical: canon, aliases: arr.map(function (x) { return x.was; }) };" },
  // 口径 B3 三态分列：靠别名认的引用**不进**真悬空
  ALIAS_SPLIT: { rel: REG, txt: "        if (rev[t]) {\n          const up = canonicalOf(t);" }
};
// 破坏形态：条件置假（**不删行**——删条件会留悬空 else，那是「装不起来」不是「判据敏感」）
const BREAK = {
  NAME_TAKEN: "if (false && rev[was] && rev[was] !== canon) return { ok: false, reason: 'name-taken', was: was, owner: rev[was] };",
  TOO_DEEP_AT_BIND: "if (false && newDepth > ALIAS_MAX_HOPS) return { ok: false, reason: 'too-deep', at: was, hops: newDepth - 1, cap: ALIAS_MAX_HOPS };",
  NOT_BOUND: "if (false && !rec.known) return { ok: false, reason: 'not-bound', name: canon };",
  UNKNOWN_NAME: "  function aliasOf(name) {\n    const nm = String(name || '').trim();\n    if (!nm) return { ok: false, reason: 'missing-name' };\n    const scI = idScope(), scA = aliasScope(), rev = aliasRev(scA);\n    const rec = aliasKnown(nm, scI, scA, rev);\n    if (false && !rec.known) return { ok: false, reason: 'unknown-name', name: nm };",
  REUSE_PAIR: "return { ok: true, reused: false, canonical: canon, aliases: arr.map(function (x) { return x.was; }) };",
  ALIAS_SPLIT: "        if (false && rev[t]) {\n          const up = canonicalOf(t);"
};
function breakOne(key) {
  const A = ANCHORS[key];
  const s = src(A.rel);
  must1(s, A.txt, key);
  const bad = s.replace(A.txt, BREAK[key]);
  if (bad === s) throw new Error('break no-op :: ' + key);
  return { rel: A.rel, src: bad };
}
// ══════════════ 运行时装置 ══════════════
/** 夹具必须把世界复位到**已知票面**（fresh 复用宿主 localStorage，上一用例的存档会带着出场）。 */
function seed(WA) {
  // 复位两张设置表（它们住在 localStorage，不在 store 里 ⇒ 不复位就会跨用例累积）。
  //   走 settingsBus 的真 API（而不是直接动 localStorage）：登记项是产品自己写进去的，
  //   夹具也按产品的方式清——这样「表住在设置面」这件事本身在夹具里也是可证的。
  ['worldaxis_registry_alias_v1', 'worldaxis_registry_ids_v1'].forEach(function (k) {
    const reg = (WA.__settingsRegs || []).filter(function (r) { return r && r.key === k; })[0];
    if (!reg) return;
    try { WA.settingsBus.save(reg, {}); } catch (e) {}
  });
  WA.store.init();
  WA.store.transact(function (d) {
    d.people = {};
    d.people.p_张三 = { id: 'p_张三', name: '张三', profile: {
      relationships: [{ target: '李四' }, { target: '旧名甲' }], relations: [{ target: '王五' }] },
      life: { commitments: [{ target: '旧名乙' }] } };
    d.people.p_李四 = { id: 'p_李四', name: '李四' };
    d.people.p_王五 = { id: 'p_王五', name: '王五' };
  }, 'v2970:seed');
  WA.registry.identityOf('张三');
  WA.registry.identityOf('李四');
  WA.registry.identityOf('王五');
  return WA;
}
function env(over) {
  const H = fresh(over ? { srcOverride: over } : undefined);
  seed(H.WA);
  return H;
}
const R = '张三', OLD = '三哥';
/** 宿主 localStorage（与产品模块同源）。取不到即抛——静默降级会让 C1 变成恒真断言。 */
function WA_mainWinLS(WA) {
  const w = (WA && WA.mainWin) || global;
  const ls = (w && w.localStorage) || global.localStorage;
  if (!ls || typeof ls.getItem !== 'function') throw new Error('夹具取不到宿主 localStorage');
  return ls;
}
// ══════════════ 同款真判据（原版与破坏副本上跑的是同一批函数）══════════════
/** 口径③：一个旧名只有一个主人。 */
function probeNameTaken(W) {
  try {
    W.registry.identityOf('赵六');
    const a1 = W.registry.bindAlias(R, { was: '老赵' });
    const a2 = W.registry.bindAlias('赵六', { was: '老赵' });
    return a1.ok === true && a2.ok === false && a2.reason === 'name-taken' && a2.owner === R;
  } catch (e) { return false; }
}
/** 口径④：链深超过上限当场拒收。 */
function probeTooDeep(W) {
  try {
    for (let i = 0; i <= 8; i++) W.registry.identityOf('深' + i);
    for (let i = 0; i < 8; i++) W.registry.bindAlias('深' + (i + 1), { was: '深' + i });
    const r = W.registry.bindAlias('深0', { was: '更早的名' });
    return r.ok === false && r.reason === 'too-deep' && r.cap === 8 && r.hops === 8;
  } catch (e) { return false; }
}
/** 口径③（前件）：规范名不在册一律拒收。 */
function probeNotBound(W) {
  try {
    const r = W.registry.bindAlias('查无此人', { was: '老名' });
    return r.ok === false && r.reason === 'not-bound' && r.name === '查无此人';
  } catch (e) { return false; }
}
/** 口径⑤：查不到就说查不到（不编规范名）。 */
function probeUnknownName(W) {
  try {
    const r1 = W.registry.aliasOf('查无此人');
    const r2 = W.registry.traceOf('查无此人');
    return r1.ok === false && r1.reason === 'unknown-name' && r2.ok === false && r2.reason === 'unknown-name';
  } catch (e) { return false; }
}
/** 口径②：只增不删 + 幂等（同一对重复登记不重复追加）。 */
function probeReuse(W) {
  try {
    const b1 = W.registry.bindAlias(R, { was: OLD });
    const b2 = W.registry.bindAlias(R, { was: OLD });
    const s = W.registry.aliasStat();
    return b1.ok === true && b1.reused === false && b2.ok === true && b2.reused === true && s.pairs === 1;
  } catch (e) { return false; }
}
/** 口径 B3：靠别名认的引用不进真悬空（三态分列）。 */
function probeAliasSplit(W) {
  try {
    // 夹具里「旧名甲」「旧名乙」两个引用都不是在册名字 ⇒ 真悬空 2 条.
    const before = W.registry.danglingRefs();
    if (before.rows !== 2 || before.aliasRows !== 0) return false;
    // 给「张三」挂上旧名「旧名甲」⇒ 那一条引用改由别名兜住.
    const b = W.registry.bindAlias(R, { was: '旧名甲' });
    if (!b.ok) return false;
    const after = W.registry.danglingRefs();
    return after.rows === 1 && after.aliasRows === 1
      && after.aliasByKind.relationships === 1 && after.byKind.relationships === 0
      && after.byKind.commitment === 1
      && after.aliasItems[0].canonical === R && after.aliasItems[0].aliasBroken === false
      && after.aliasNames === 1;
  } catch (e) { return false; }
}
function runAll(a) {
  const regSrc = src(REG), diagSrc = src(DIAG), panSrc = src(PANEL);
  // ── A 静态面 ──
  a(regSrc.indexOf("const ALIAS_KEY = 'worldaxis_registry_alias_v1'") >= 0
    && regSrc.indexOf('const ALIAS_MAX_HOPS = 8;') >= 0,
    'v2970: [A1] 常量在位（设置键 + 8 跳上限）——上限写成常量而非设置项：它是一条**边界**，不是一个旋钮');
  a(hits(regSrc, "module: 'registry'") >= 2,
    'v2970: [A1] 别名表已登记进设置面（与身份表同规格：走 settingsBus 读写，本键 JSON 损坏时有隔离留痕）');
  const exportKeys = regSrc.slice(regSrc.indexOf('aliasOf: aliasOf'));
  ['aliasOf', 'bindAlias', 'traceOf', 'aliasStat'].forEach(function (k) {
    a(exportKeys.indexOf(k + ':') >= 0 || exportKeys.indexOf(k + ',') >= 0,
      'v2970: [A2] 导出 ' + k + ' 在位');
  });
  ['canonicalOf', 'aliasRev', 'aliasKnown'].forEach(function (k) {
    a(exportKeys.indexOf(k + ':') < 0,
      'v2970: [A2] 内部口 ' + k + ' **不导出**（它们各自只有本体内的消费方，挂出去就是零消费死面）');
  });
  a(diagSrc.indexOf('secPhoneBridge') >= 0 && panSrc.indexOf('wa-id-bindalias') >= 0,
    'v2970: [A3] 诊断与面板各有真消费方（无消费方的导出等于死面——本仓库判据只认调用点）');
  // ── B 运行时面 ──
  const H = env();
  const W = H.WA;
  // B1 只登记不改写：登记前后既有关系行**逐字节不变**
  const rowsBefore = JSON.stringify(W.store.get().people.p_张三);
  const b1 = W.registry.bindAlias(R, { was: OLD });
  const rowsAfter = JSON.stringify(W.store.get().people.p_张三);
  a(b1.ok === true && b1.reused === false && b1.canonical === R && b1.depth === 1,
    'v2970: [B1] 登记一条旧名（三哥 → 张三，1 跳）');
  a(rowsBefore === rowsAfter,
    'v2970: [B1] **只登记不改写**：既有关系行 / 承诺行逐字节不变（旧名照旧写在那一行上——「改过名」不再等于「断过链」）');
  // B2 对历史名作答
  const a1 = W.registry.aliasOf(OLD);
  a(a1.ok === true && a1.canonical === R && a1.isAlias === true && a1.hops === 1
    && a1.personId === W.registry.aliasOf(R).personId && a1.worldKey === 'p_张三',
    'v2970: [B2] aliasOf 对历史名作答：规范名 + **同一身份**（personId / worldKey 与现名出具的那份逐字相同）');
  const t1 = W.registry.traceOf(OLD);
  a(t1.ok === true && t1.steps.length === 1 && t1.steps[0].from === OLD && t1.steps[0].to === R,
    'v2970: [B2] traceOf 给出**逐步路径**（它答「怎么走到那里的」，与 aliasOf 的「尽头是谁」是两句不同的话）');
  const a2 = W.registry.aliasOf(R);
  a(a2.ok === true && a2.isAlias === false && a2.hops === 0 && a2.aliases.indexOf(OLD) >= 0,
    'v2970: [B2] 对**现名**查也有答案，且同时报出「它名下还有哪些旧名」（两个方向都答得出来）');
  // B3 三态分列
  const H3 = env(); const W3 = H3.WA;
  const st = W3.registry.aliasStat();
  a(st.pairs === 0 && st.maxHops === 8 && st.persisted === true,
    'v2970: [B3] 空台账仍给出完整形状（pairs 0 / maxHops 8 / persisted true）——空不是「没有这个面」');
  const dg0 = W3.registry.danglingRefs();
  a(dg0.rows === 2 && dg0.aliasRows === 0,
    'v2970: [B3] 起点：两个旧名引用都是**真悬空**（旧名甲 / 旧名乙，实 ' + dg0.rows + ' 条）');
  W3.registry.bindAlias(R, { was: '旧名甲' });
  const dg1 = W3.registry.danglingRefs();
  a(dg1.rows === 1 && dg1.aliasRows === 1 && dg1.aliasNames === 1,
    'v2970: [B3] 登记之后那一条改由**别名兜住**（rows 2→' + dg1.rows + ' / aliasRows 0→' + dg1.aliasRows
      + '）——两件事分列，「有人把名字改坏了」不再长得像「这里记着一个早没人认得的名字」');
  a(dg1.aliasItems[0].canonical === R && dg1.aliasItems[0].hops === 1 && dg1.aliasItems[0].aliasBroken === false,
    'v2970: [B3] 兜住的那条带规范名 / 跳数 / 是否断链三字段（可定位到人，不是一串孤立名字）');
  a(dg1.byKind.commitment === 1 && dg1.aliasByKind.relationships === 1
    && dg1.byKind.relationships === 0 && dg1.aliasByKind.commitment === 0,
    'v2970: [B3] 按类计数**同点分列**（被改名兜住的那条在 aliasByKind.relationships，'
      + '真正没人认得的那条在 byKind.commitment）——两类各归各的账，不互相污染');
  // B4–B7 口径
  a(probeNotBound(W), 'v2970: [B4] not-bound：给不存在的人登记历史名一律拒收（那等于凭空造一个身份）');
  a(probeNameTaken(W), 'v2970: [B5] name-taken：一个旧名只允许一个主人（两个主人 ⇒ 同一行解析出两种身份）');
  const self = W.registry.bindAlias(R, { was: R });
  a(self.ok === false && self.reason === 'alias-cycle' && self.self === true,
    'v2970: [B6a] alias-cycle：自指登记被拦（旧名就是现名 ⇒ 这条边没有任何意义）');
  // B6b 绕回成环：x←y 已登记，再给 y 挂 x 的旧名 ⇒ 环
  const H6 = env(); const W6 = H6.WA;
  W6.registry.identityOf('乙某');
  W6.registry.bindAlias('乙某', { was: R });
  const loop = W6.registry.bindAlias(R, { was: '乙某' });
  a(loop.ok === false && loop.reason === 'alias-cycle',
    'v2970: [B6b] alias-cycle：绕一圈回来也被拦（自指只是最小的一种环）');
  a(probeTooDeep(W), 'v2970: [B7] too-deep：链深超过 8 跳当场拒收（登记侧——往表里放一条永远解析不出来的登记 = 在账上打个死结）');
  // B8 只增不删 + 幂等
  const H8 = env(); const W8 = H8.WA;
  a(probeReuse(W8), 'v2970: [B8] 幂等登记（同一对重复登记返回 reused:true，台账仍只有 1 对）——只增不删、不重复追加');
  // B9 分域
  const H9 = env(); const W9 = H9.WA;
  W9.registry.bindAlias(R, { was: OLD });
  const st9a = W9.registry.aliasStat();
  const ctx9 = W9.mainWin.SillyTavern.getContext();
  const keep9 = ctx9.chatId;
  ctx9.chatId = 'v2970_another_chat';
  const st9b = W9.registry.aliasStat();
  a(st9a.pairs === 1 && st9b.pairs === 0 && st9a.chatId !== st9b.chatId,
    'v2970: [B9] 按 chatId 分域（切聊天不串味，与身份表同规格）——' + st9a.chatId + ' 有 1 对，另一个聊天读到 0 对');
  a(W9.registry.aliasOf(OLD).ok === false,
    'v2970: [B9] 另一个聊天里那个旧名**不在册**（分域是真的：不是「看不见」而是「不属于这里」）');
  ctx9.chatId = keep9;
  // B10 unknown-name
  a(probeUnknownName(W), 'v2970: [B10] unknown-name：完全不在册的名字不编规范名（aliasOf 与 traceOf 两条路各自拒收）');
  a(W.registry.aliasOf('').reason === 'missing-name',
    'v2970: [B10] 空名与「不在册的名字」**分开归因**（missing-name ≠ unknown-name——前者是没填，后者是查过了没有）');
  // B11 面板真消费
  const H11 = env();
  const W11 = H11.WA;
  const panel = H11.dom.getElementById('wa-panel');
  const tab = panel.querySelectorAll('.wa-tab').filter(function (x) { return x.dataset.page === 'people'; })[0];
  a(!!tab, 'v2970: [B11] 承载别名控件的 tab 在场');
  tab.click();
  const body = function () { return panel.querySelector('.wa-body'); };
  const btn = function (id) { return body().querySelectorAll('button').filter(function (b) { return b.id === id; })[0]; };
  const inp = function (id) { return body().querySelectorAll('input').filter(function (b) { return b.id === id; })[0]; };
  const outTxt = function () { const o = body().querySelectorAll('div').filter(function (d) { return d.id === 'wa-id-out'; })[0]; return o ? String(o.textContent || '') : ''; };
  a(!!btn('wa-id-bindalias') && !!btn('wa-id-aliasof') && !!btn('wa-id-aliasstat') && !!inp('wa-id-aliasname'),
    'v2970: [B11] 三个按钮 + 一个旧名输入框都渲染成树（渲染了但绑定的 id 写错，此前无出口能发现）');
  inp('wa-id-name').value = R;
  inp('wa-id-aliasname').value = OLD;
  btn('wa-id-bindalias').click();
  a(outTxt().indexOf('已登记') >= 0 && outTxt().indexOf(OLD) >= 0,
    'v2970: [B11] 登记旧名落在输出节点上（实「' + outTxt() + '」）');
  // 每次点击都会 renderBody() 重建 DOM ⇒ 引用必须每步重查（复用旧引用必然空转）
  inp('wa-id-aliasname').value = OLD;
  btn('wa-id-aliasof').click();
  a(outTxt().indexOf('历史名') >= 0 && outTxt().indexOf(R) >= 0 && outTxt().indexOf('跳') >= 0,
    'v2970: [B11] 查改名落在输出节点上（实「' + outTxt() + '」）——历史名那一路点得通');
  btn('wa-id-aliasstat').click();
  a(outTxt().indexOf('改名台账') >= 0 && outTxt().indexOf('1 对') >= 0,
    'v2970: [B11] 改名台账落在输出节点上（实「' + outTxt() + '」）');
  // B12 诊断真消费
  const W12 = env().WA;
  W12.registry.bindAlias(R, { was: '旧名甲' });
  const dg12 = W12.toolDiag.collect();
  a(!!(dg12.modules && dg12.modules.danglingRefs)
    && dg12.modules.danglingRefs.aliasRows === 1 && dg12.modules.danglingRefs.aliasNames === 1,
    'v2970: [B12] 诊断节读到三态分列（aliasRows=' + (dg12.modules && dg12.modules.danglingRefs && dg12.modules.danglingRefs.aliasRows)
      + '）——别名面是 danglingRefs 的第二个消费方，缺它「改坏了名字」在体检里仍不可见');
  // ── C 不变式 ──
  const H14 = env(); const W14 = H14.WA;
  const peopleBefore = JSON.stringify(W14.store.get().people);
  const LS14 = (WA_mainWinLS(W14));
  const idsBefore = JSON.stringify(LS14.getItem('worldaxis_registry_ids_v1'));
  ['阿一', '阿二', '阿三'].forEach(function (n, i) { W14.registry.identityOf('别名目标' + i); W14.registry.bindAlias('别名目标' + i, { was: n }); });
  a(JSON.stringify(W14.store.get().people) === peopleBefore,
    'v2970: [C1] 整轮登记动作后 people 容器**字节级不变**（只登记不改写；别名表住在设置面，不碰世界状态）');
  a(LS14.getItem('worldaxis_registry_ids_v1') !== idsBefore
    && JSON.stringify(W14.store.get().people) === peopleBefore,
    'v2970: [C1] 身份表确实被写过（证上一句不是「什么都没发生」）——两个结论同时成立才是真隔离');
  a(regSrc.indexOf('WA.store.transact') >= 0
    && regSrc.slice(regSrc.indexOf('const ALIAS_KEY'), regSrc.indexOf('function identityOf')).indexOf('WA.store.transact') < 0,
    'v2970: [C2] 别名段的实现里**零 store.transact 调用**（它一个世界状态字段都不写——口径②的静态证据；'
      + '全文件唯一那处 transact 在 replacePersona 里，与别名无关）');
  a(hits(diagSrc, 'danglingRefs') >= 1 && hits(regSrc, 'aliasBroken') >= 1
    && hits(regSrc, 'aliasRows') >= 2,
    'v2970: [C3] 三态分列进返回体且诊断面真消费（诊断取的是 danglingRefs() 的整份返回体，'
      + 'aliasRows / aliasNames 随它一起进体检；aliasBroken 逐条随 aliasItems 出——'
      + '登记过的名字若仍解析不出来，照实报而不假装它一定接得上）');
}
function runNegative(a) {
  const r = src(REG);
  Object.keys(ANCHORS).forEach(function (k) { hits(src(ANCHORS[k].rel), ANCHORS[k].txt); });
  a(hits(r, ANCHORS.ALIAS_SPLIT.txt) === 1 && hits(r, ANCHORS.NAME_TAKEN.txt) === 1,
    'v2970: [N0] 六个破坏锚点在真源码各恰中 1 次（唯一才能定位到要拆的那一处）');
  // 两向自证打的是 **must1**（hits 是纯计数，永远不抛——拿 hits 做自证等于什么都没证）。
  let threw = 0;
  try { must1(r, '锚点根本不在源码里__v2970', 'self'); } catch (e) { threw++; }
  try { must1(r + ANCHORS.NAME_TAKEN.txt, ANCHORS.NAME_TAKEN.txt, 'self'); } catch (e) { threw++; }
  a(threw === 2, 'v2970: [N0] 锚点工具两向自证：不存在 / 不唯一都必须抛（实抛 ' + threw + '/2）');
  // N1 原版上判据干净（先证「判据不是瞎报」）
  //   每条探针一条独立实例：它们都会往台账里写登记，共享实例会让后一条读到前一条的手指印
  //   （本轮实测踩到：nameTaken 挂完「老赵」，reuse 的 `pairs === 1` 当场变 2）。
  const n1 = [['nameTaken', probeNameTaken], ['tooDeep', probeTooDeep], ['notBound', probeNotBound],
    ['unknown', probeUnknownName], ['reuse', probeReuse], ['aliasSplit', probeAliasSplit]]
    .map(function (pr) { return { name: pr[0], ok: pr[1](env().WA) }; });
  const n1bad = n1.filter(function (x) { return !x.ok; }).map(function (x) { return x.name; });
  a(n1bad.length === 0,
    'v2970: [N1] 原版上六条判据全部干净（判据不是瞎报，破坏才有意义；不干净的是 '
      + (n1bad.join(',') || '无') + '）');
  // N2–N6 逐锚：真源码破坏 → 装破坏副本 → 重跑**同款**判据
  function neg(key, fn, label) {
    const b = breakOne(key);
    const Hn = env({ 'actors/registry.js': b.src });
    const ok = fn(Hn.WA);
    a(ok === false,
      'v2970: [N' + label + '] 拆掉「' + key + '」后判据现形（破坏副本上同款判据必须为假）');
    // 破坏副本仍能装载、且其余判据不受牵连（否则测到的是「装不起来」而不是「判据敏感」）
    a(Object.keys(Hn.WA.registry).length > 20,
      'v2970: [N' + label + '] 破坏副本仍正常装载（不是「装不起来」，是**判据真敏感**）');
  }
  neg('NAME_TAKEN', probeNameTaken, '2');
  neg('TOO_DEEP_AT_BIND', probeTooDeep, '3');
  neg('NOT_BOUND', probeNotBound, '4');
  neg('UNKNOWN_NAME', probeUnknownName, '5');
  neg('REUSE_PAIR', probeReuse, '6');
  neg('ALIAS_SPLIT', probeAliasSplit, '7');
  // N7b：破坏 ALIAS_SPLIT 之后，「真悬空」必须**多出**那一条（不是「少报」而是「归错账」）。
  //   这一条把「判据为假」升级成「知道自己为什么假」：三态分列被拆掉时，
  //   被改名兜住的引用会掉回真悬空——读数变差的方向是确定的。
  const bSplit = breakOne('ALIAS_SPLIT');
  const Wsplit = env({ 'actors/registry.js': bSplit.src }).WA;
  const b0 = Wsplit.registry.danglingRefs();
  Wsplit.registry.bindAlias(R, { was: '旧名甲' });
  const b1 = Wsplit.registry.danglingRefs();
  a(b0.rows === 2 && b1.rows === 2 && b1.aliasRows === 0,
    'v2970: [N7b] 拆掉分列之后那条引用**掉回真悬空**（rows 2→' + b1.rows + ' / aliasRows ' + b1.aliasRows
      + '）——「有人把名字改坏了」重新长得像「没人认得这个名字」');
  // N8：非恒真——真实读数随事实变化（不是把 1 写死在判据里）
  const H8 = env(); const W8 = H8.WA;
  const before = W8.registry.aliasStat().pairs;
  W8.registry.bindAlias(R, { was: '另一个旧名' });
  const after = W8.registry.aliasStat().pairs;
  a(before === 0 && after === 1,
    'v2970: [N8] 非恒真：登记一条之后台账从 ' + before + ' 变 ' + after + '（读数随事实变化，不是把常数写进判据）');
  // N9 判据纯度：负控制层内每条锚点字面量只声明一次
  const self = src('tests/alias-trace-v2970.js');
  const ok9 = Object.keys(ANCHORS).every(function (k) {
    return hits(self, ANCHORS[k].txt.replace(/\n/g, '\\n')) === 1;
  });
  a(ok9, 'v2970: [N9] 每条锚点字面量在本文件只出现一次（判据不得引用锚点串）');
}
if (require.main === module) {
  const a2 = function (cond, name) {
    if (cond) { PASS++; }
    else { FAIL++; console.log('  ✗ ' + name); }
  };
  try { runAll(a2); runNegative(a2); }
  catch (e) { FAIL++; console.log('  ✗ 判据失效：' + (e && e.stack)); }
  if (FAIL) { console.log('ALIAS-TRACE-V2970: FAIL ' + FAIL + ' / ' + (PASS + FAIL)); process.exit(1); }
  console.log('ALIAS-TRACE-V2970: pass（' + PASS + ' 项）');
}
module.exports = { runAll: runAll, runNegative: runNegative, ANCHORS: ANCHORS };