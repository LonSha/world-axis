#!/usr/bin/env node
// WorldAxis tests/life-turn-v2132.js —— v2.132.0（O19）：跨会话的轮转游标
//
// 【它治的病：公平只跨「轮」，不跨「会话」】
//   v2.115.0（E4）把 tick 的截断从「静态定序」改成「同级轮转」，游标 `_turn` 是模块级
//   `let`。它治的是**跨轮**的不公平，而 `let` 的初值只在**求值期**跑一次，本模块的求值
//   **每个会话都发生一次** —— 于是跨会话时游标归零。
//   后果与 v2.115.0 之前那句原话同形：「一个会话只跑一轮」的长局里，`_turn` 恒为 0
//   ⇒ 位置再次决定命运，而 `stat().lastTurn` 会**看起来很正常**（它如实报出 0）——
//   **账在进程里、答案在世界外**，正是本仓 v2.115.0 → v2.131.1 四版「未覆盖」清单里
//   逐字重复的那一条。
//   比「不延续」更坏的是**没法分辨**：延续与归零在面板与诊断里此前都是空白
//   （`tool-diag` 的 life 节读了 `WA.life.stat()` 却只取 5 个字段，`lastTurn` 当场丢掉）。
//
// 【本版落点】
//   · `engines/life.js`：游标落盘 `worldaxis_life_turn_v1` = `{ chatId, turn }`，
//     载入时**恢复一次**，tick 结束时**写回一次**；开关 `crossSession`（默认 **false**）。
//   · 单真源：一个键、一个结构、一个原子交换点。**不落存档**（v2.115.0 的原始口径继续成立：
//     游标记的是「这一轮从谁开始」，不是世界事实 —— 进存档就会跟着导出/导入搬家）。
//   · 读面：`life.stat()` 多一口 `turnRestored`；`tool-diag` 的 life 节补 `lastTurn` /
//     `turnRestored` / `crossSession`；面板「结算」输出带「轮转起点 N(续)」。
//     全程**零新增导出**（本仓纪律：为读一个量新开一口会立刻变成死导出）。
//
// 【判据结构（与 delete-gate-v2124 / x1-chain-v2127 同规格）】
//   A 结构 · B 运行时（原版成绿）· C 消费方（真读者）· N0–N5 真源码破坏 ⇒ 破坏副本上重跑同款判据
//   N5 纯度：全部负控制跑完后三个真文件逐字未变。
//
// 【本锁自己踩到的那个坑（写给下一把锁）】
//   首版探针写成 `function probeX() { const WA = fresh(); ... }` —— 探针**自己**重新装载，
//   于是 `probeWith(spec, probeX)` 传进去的破坏环境被当场丢掉，负控制全部跑在原版上：
//   六条 N1 全红、N2 全绿，看起来像「判据坏了」，其实是**探针没被测到**（负控制假绿的第四形：
//   破坏副本没被送到判据手里）。修法：环境由 harness 造好传进去，且跨会话的第二次装载
//   也必须用**同一份破坏**（`env.next()`）。
'use strict';
const fs = require('fs');
const path = require('path');
const gate = require('./ui-gate-sync.js');
const BASE = path.join(__dirname, '..');
const LIFE = 'engines/life.js', DIAG = 'engines/tool-diag.js', PANEL = 'ui/panel.js';
const TURN_KEY = 'worldaxis_life_turn_v1';
const SET_KEY = 'worldaxis_life_settings_v1';
function src(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function hits(s, x) { return s.split(x).length - 1; }
function over(rel, s) { const o = {}; o[rel] = s; return o; }
// ── 真源码破坏锚点（各须恰中 1 次）───────────────────────────────────
const ANCHORS = {
  restore: { rel: LIFE, from: "if (_restored !== null) _turn = _restored;", to: "void _restored;" },
  loadGate: { rel: LIFE, from: "if (!turnCfg()) return null;", to: "if (false) return null;" },
  chat: { rel: LIFE, from: "if (!row || typeof row !== 'object' || row.chatId !== curChatId()) return null;", to: "if (!row || typeof row !== 'object') return null;" },
  call: { rel: LIFE, from: "const persisted = turnStore();", to: "const persisted = { ok: false, reason: 'broken' };" },
  ret: { rel: LIFE, from: "unreciprocated: unrecip, turn: persisted };", to: "unreciprocated: unrecip };" },
  diag: { rel: DIAG, from: "lastTurn: isFinite(Number(st.lastTurn)) ? Number(st.lastTurn) : 0,", to: "lastTurn: 0," }
};
const BROKEN = [
  { key: 'control', spec: ANCHORS.restore },
  { key: 'write', spec: ANCHORS.call },
  { key: 'offGate', spec: ANCHORS.loadGate },
  { key: 'chatId', spec: ANCHORS.chat },
  { key: 'diagRead', spec: ANCHORS.diag },
  { key: 'retFace', spec: ANCHORS.ret }
];
const B = {}; BROKEN.forEach(function (s, i) { B[s.key] = i; });
function anchorHits(spec) { return hits(src(spec.rel), spec.from); }
function brokenOverride(spec) {
  const s = src(spec.rel);
  const n = hits(s, spec.from);
  if (n !== 1) throw new Error('anchor hits ' + n + ' :: ' + spec.rel);
  return over(spec.rel, s.split(spec.from).join(spec.to));
}
// ── 环境：**破坏副本必须送到判据手里**（见文件头「本锁自己踩到的那个坑」）──
//   两条纪律缺一不可：
//     ① 环境**惰性**创建（`get first`）——急切创建会让模块在探针清盘**之前**就求值，
//        而 `turnLoad()` 在求值期就跑，于是上一用例的盘面残留会被当成「本会话的恢复」，
//        读数随执行顺序漂移（首版实测：同一条判据两次调用结果不同）。
//     ② harness 在造环境**之前**清掉游标键——每个探针自己声明它要的盘面初态。
function mkEnv(ov) {
  let f = null;
  const mk = function () { return ov ? gate.fresh({ srcOverride: ov }).WA : gate.fresh().WA; };
  return { ov: ov, get first() { if (!f) f = mk(); return f; }, next: function () { return mk(); } };
}
function guarded(fn) { return function (env) { try { return fn(env); } catch (e) { return 'threw:' + (e && (e.message || e)); } }; }
function probeWith(spec, fn) { clearTurn(); return guarded(fn)(mkEnv(brokenOverride(spec))); }
function probeClean(fn) { clearTurn(); return guarded(fn)(mkEnv(null)); }
// ── 造场景（与 life-e4-v2115 同口径：6 人同依据、名额 4）──────────────
const NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
function clearTurn() { try { global.localStorage.removeItem(TURN_KEY); } catch (e) {} }
function setup(WA, names) {
  WA.store.init();
  WA.store.transact(function (d) {
    d.people = {};
    (names || NAMES).forEach(function (n) {
      d.people['p_' + n] = { id: 'p_' + n, name: n,
        life: { goals: [{ id: 'g_' + n, text: '目标', status: 'active' }], commitments: [], schedule: [], lastDecision: null } };
    });
  }, 'o19-seed');
}
function enable(WA, cross) {
  WA.life.setSettings({ enabled: true, maxPeople: 4 });
  WA.life.setSettings({ crossSession: !!cross });
}
function diskRow() { try { return global.localStorage.getItem(TURN_KEY); } catch (e) { return 'ls-error'; } }
function crossOnDisk() {
  try { const r = JSON.parse(String(global.localStorage.getItem(SET_KEY) || 'null')); return !!(r && r.crossSession); } catch (e) { return 'parse-fail'; }
}
// 本锁自己收尾：**crossSession 必须回到默认 false、游标键必须清掉**。
//   为什么是必须：本锁把它打开过，而它是**跨会话**开关 —— 留在盘上会传染给后面所有 section
//   （首个受害者就是 life-e4-v2115.js：它的期望建立在「每次会话都从 0 开始」上）。
function cleanup() { clearTurn(); try { global.WorldAxis.life.setSettings({ crossSession: false }); } catch (e) {} clearTurn(); }

// ── 探针（返回症状值，便于两向对照；环境由 harness 传入）──
// P1 关闭 ⇒ 跨会话归零（**旧行为对照**：v2.115.0–v2.131.1 的现状）
function probeOffKeepsZero(env) {
  clearTurn();
  const WA = env.first; setup(WA); enable(WA, false);
  WA.life.tick({ now: 1 });
  const a = WA.life.stat().lastTurn;
  const WA2 = env.next();
  return a + '>' + WA2.life.stat().lastTurn + '|' + String(WA2.life.stat().turnRestored);
}
// P2 打开 ⇒ 写出 { chatId, turn }
function probeWrite(env) {
  clearTurn();
  const WA = env.first; setup(WA); enable(WA, true);
  WA.life.tick({ now: 1 });
  return String(diskRow());
}
// P3 打开 ⇒ 跨会话延续（本版核心）
function probeRestored(env) {
  clearTurn();
  const WA = env.first; setup(WA); enable(WA, true);
  WA.life.tick({ now: 1 });
  const first = WA.life.stat().lastTurn;
  const st = env.next().life.stat();
  // 症状取**效果**（lastTurn）而不是 turnRestored：破坏若只摘掉赋值，
  //   读数会自称「恢复了」而游标仍是 0 —— 那正是要抓的那种假象。
  if (first === 0 || st.lastTurn !== first) return 'lost:' + st.lastTurn + '/' + st.turnRestored;
  const WA3 = env.next();
  setup(WA3); enable(WA3, true);
  const r = WA3.life.tick({ now: 2 });
  return (r.turn && r.turn.ok === true && r.turn.turn === 2) ? 'restored' : 'not-resumed:' + JSON.stringify(r.turn);
}
// P4 关闭但盘上有行 ⇒ **不得**恢复（开关门的检验面）
function probeOffIgnoresDisk(env) {
  clearTurn();
  const WA = env.first; setup(WA); enable(WA, true);
  WA.life.tick({ now: 1 });
  enable(WA, false);              // 关掉开关，盘上那行**留着**
  const st = env.next().life.stat();
  return (st.lastTurn === 0 && st.turnRestored === false) ? 'off' : 'ghost:' + st.lastTurn + '/' + st.turnRestored;
}
// P5 不得回落：别聊天的行 / 坏结构 / 负数一律答「不知道」
function probeForeign(env) {
  clearTurn();
  const WA = env.first; setup(WA); enable(WA, true);
  WA.life.tick({ now: 1 });
  const probe = function (raw) {
    global.localStorage.setItem(TURN_KEY, raw);
    const st = env.next().life.stat();
    return (st.turnRestored === false && st.lastTurn === 0) ? 'rejected' : 'adopted:' + st.lastTurn;
  };
  const f1 = probe(JSON.stringify({ chatId: '别的聊天', turn: 5 }));
  const g1 = probe('{坏 json');
  const h1 = probe(JSON.stringify({ chatId: 'test_chat_001', turn: -3 }));
  return [f1, g1, h1].join('/');
}
// P6 世界面：开关打开时游标**仍然**不进存档（v2.115.0 的原始口径）
function probeWorldClean(env) {
  clearTurn();
  const WA = env.first; setup(WA); enable(WA, true);
  WA.life.tick({ now: 1 });
  const dump = JSON.stringify(WA.store.get());
  const bad = [];
  if (dump.indexOf(TURN_KEY) >= 0) bad.push('key');
  if (dump.indexOf('_turn') >= 0) bad.push('_turn');
  if (dump.indexOf('lastTurn') >= 0) bad.push('lastTurn');
  return bad.length ? bad.join(',') : 'clean';
}
// P7 诊断面真读（走 collect()——本仓 life 节的真消费者就是汇总；
//   `secLife` 本身不在导出面，直接调它只会拿到 undefined）
function probeDiagFace(env) {
  clearTurn();
  const WA = env.first; setup(WA); enable(WA, true);
  WA.life.tick({ now: 1 });
  if (!WA.toolDiag || typeof WA.toolDiag.collect !== 'function') return 'no-diag';
  const lf = (WA.toolDiag.collect() || {}).life || {};
  return JSON.stringify({ t: lf.lastTurn, r: lf.turnRestored, c: lf.crossSession });
}

// ── A 结构 · B 运行时 · C 消费方 ──────────────────────────────────────
function judge(a) {
  const lifeSrc = src(LIFE), diagSrc = src(DIAG), panelSrc = src(PANEL);
  // A 结构面：单真源（一个键、一个结构、一盏灯）
  a(hits(lifeSrc, "const TURN_KEY = 'worldaxis_life_turn_v1';") === 1
    && hits(lifeSrc, 'worldaxis_life_turn_v1') === 1,
    'o19/A: 落盘键是全文件唯一字面量（另起一处就是第二份真源）');
  a(lifeSrc.indexOf("const TURN_REG = { key: 'worldaxis_life_settings_v1', def: TURN_DEF, module: 'life' };") > 0,
    'o19/A: 开关复用**本模块既有**设置键（未注册第二个键——另开一键会让「设置归属」读到两个来源）');
  a(lifeSrc.indexOf('crossSession: false') > 0,
    'o19/A: 开关默认 false（默认关闭 ⇒ 行为逐字回到 v2.115.0）');
  a(hits(lifeSrc, 'WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);') === 1,
    'o19/A: 设置登记仍恰一条（无条件 concat 在多次求值后会变多条，而重复登记是 selfCheck 的 error 级项）');
  // A 出口面：零新增导出（读数全在既有成员里）
  const expBlock = lifeSrc.slice(lifeSrc.indexOf('WA.life = {'));
  a(expBlock.indexOf('turn:') < 0 && expBlock.indexOf('turnStore') < 0 && expBlock.indexOf('turnLoad') < 0,
    'o19/A: 出口面**零新增**（turn / turnLoad / turnStore 都不导出——为读一个量新开一口会立刻变成死导出）');
  a(expBlock.indexOf('lastTurn: _turn, turnRestored: _restored !== null') > 0,
    'o19/A: 读数挂在既有成员 stat() 的返回里');
  a(lifeSrc.indexOf("JSON.stringify({ chatId: curChatId(), turn: _turn })") > 0,
    'o19/A: 落盘结构是 { chatId, turn }（键序也钉住：结构就是契约）');
  // A 落点：**不**进世界骨架（否则会跟着导出/导入搬家）
  //   v2.132.0（O19 收口）: 原判据是「core/store.js 全文不含该键字面量」——**代理判据**。
  //   本版给 `classifyKey` 单列 `lifeTurn` 家族（治「游标被判成幽灵设置、污染
  //   `families.settingsUnregistered`」），store.js 里因此**必须**出现该键（家族正则 + 家族桶）。
  //   收窄到真正的存档面：`defaultWorldState()` 的返回体里不得出现该键。
  const dwSrc = src('core/store.js');
  const dwAt = dwSrc.indexOf('function defaultWorldState()');
  let d = 0, dwEnd = -1;
  for (let i = dwSrc.indexOf('{', dwAt); i < dwSrc.length; i++) {
    if (dwSrc[i] === '{') d++;
    else if (dwSrc[i] === '}') { d--; if (d === 0) { dwEnd = i; break; } }
  }
  const dwBody = dwSrc.slice(dwAt, dwEnd + 1);
  a(dwAt > 0 && dwEnd > dwAt && dwBody.indexOf('worldaxis_life_turn') < 0 && dwBody.indexOf('lifeTurn') < 0,
    'o19/A: 世界骨架里没有这个键（游标不是世界事实；骨架是导出/导入世界的载荷面）');

  // B0 前置：默认（未打开）时逐字回到老口径
  clearTurn();
  const WA0 = gate.fresh().WA;
  setup(WA0);
  WA0.life.setSettings({ enabled: true, maxPeople: 4 });
  const r0 = WA0.life.tick({ now: 1 });
  a(r0.turn && r0.turn.ok === false && r0.turn.reason === 'disabled',
    'o19/B0: 开关默认关闭 ⇒ tick 的落盘口答 disabled（实 ' + JSON.stringify(r0.turn) + '）');
  a(diskRow() === null, 'o19/B0: 开关关闭 ⇒ 盘上零写入（实 ' + String(diskRow()) + '）');
  // B1 关闭 ⇒ 跨会话归零（旧行为对照：判据非恒真 —— 打开时必须不再是这样）
  a(probeClean(probeOffKeepsZero) === '4>0|false',
    'o19/B1: 关闭时跨会话归零（v2.115.0–v2.131.1 的现状，作为本版对照面）实 ' + probeClean(probeOffKeepsZero));
  // B2 打开 ⇒ 写出结构
  const w2 = probeClean(probeWrite);
  a(/^\{"chatId":"[^"]+","turn":4\}$/.test(w2),
    'o19/B2: 打开 ⇒ 落盘 {"chatId":…,"turn":4}（实 ' + w2 + '）');
  // B3 打开 ⇒ 跨会话延续（核心）
  a(probeClean(probeRestored) === 'restored',
    'o19/B3: 打开 ⇒ 跨会话延续且接着排（本版治的就是这句话：公平不再只跨轮）实 ' + probeClean(probeRestored));
  // B4 关闭但盘上有行 ⇒ 不得恢复
  a(probeClean(probeOffIgnoresDisk) === 'off',
    'o19/B4: 关闭时盘上残留行**不得**被采信（一盏灯管读与写两件事）实 ' + probeClean(probeOffIgnoresDisk));
  // B5 不得回落
  a(probeClean(probeForeign) === 'rejected/rejected/rejected',
    'o19/B5: 别聊天的行 / 坏结构 / 负数一律答「不知道」（不把 0 假装成恢复值）实 ' + probeClean(probeForeign));
  // B6 世界面仍然干净
  a(probeClean(probeWorldClean) === 'clean',
    'o19/B6: 开关打开时游标**仍然**不进存档（进了就会跟着导出/导入搬家）实 ' + probeClean(probeWorldClean));
  clearTurn();
  // C 消费方（真读者）
  a(hits(panelSrc, '·轮转起点') === 1,
    'o19/C: 面板「结算」输出带轮转起点（玩家此前看不到「这一轮从谁开始」）');
  a(panelSrc.indexOf("st.turnRestored ? '(续)' : ''") > 0,
    'o19/C: 面板标出本会话是否从盘上恢复过（「延续」与「每次归零」必须可分辨）');
  a(hits(diagSrc, 'turnRestored: st.turnRestored === true') === 1,
    'o19/C: 诊断 life 节真读 turnRestored（此前读了 stat() 却只取 5 个字段、当场丢掉）');
  const dstat = (function () {
    try { return (gate.fresh().WA.toolDiag.collect() || {}).life || null; } catch (e) { return null; }
  })();
  a(!!dstat && ['lastTurn', 'turnRestored', 'crossSession'].every(function (k) {
    return Object.prototype.hasOwnProperty.call(dstat, k);
  }), 'o19/C: collect().life 真报出三口（实 ' + JSON.stringify(dstat) + '）');
  // 收尾
  cleanup();
  a(crossOnDisk() === false, 'o19/C: 本锁收尾后 crossSession 回到 false（不传染后面的 section）实 ' + String(crossOnDisk()));
  a(diskRow() === null, 'o19/C: 本锁收尾后游标键已清（实 ' + String(diskRow()) + '）');
}

// ── N：真源码破坏 ⇒ 破坏副本上重跑同款判据 ──────────────────────────
function runNegative(a) {
  const purity = { [LIFE]: src(LIFE), [DIAG]: src(DIAG), [PANEL]: src(PANEL) };
  BROKEN.forEach(function (s) { a(anchorHits(s.spec) === 1, 'o19: [N0] 锚点在真源码中恰 1 次 :: ' + s.key); });
  const withSpec = function (key) { return function (fn) { return probeWith(BROKEN[B[key]].spec, fn); }; };
  // N1 破坏现形
  a(/^lost:0\//.test(withSpec('control')(probeRestored)),
    'o19: [N1] 摘掉「载入时恢复」⇒ 跨会话回到归零（缺陷复现）实 ' + withSpec('control')(probeRestored));
  a(withSpec('write')(probeWrite) === 'null',
    'o19: [N1] 摘掉「tick 末写回」⇒ 盘上零行（跨会话必归零）实 ' + withSpec('write')(probeWrite));
  a(withSpec('offGate')(probeOffIgnoresDisk) === 'ghost:4/true',
    'o19: [N1] 摘掉开关门 ⇒ 关闭时也照读盘上残留（关不掉的开关）实 ' + withSpec('offGate')(probeOffIgnoresDisk));
  a(withSpec('chatId')(probeForeign).indexOf('adopted:5') === 0,
    'o19: [N1] 摘掉聊天归属判定 ⇒ **别的聊天**的行被采信（跨聊天串味）实 ' + withSpec('chatId')(probeForeign));
  a(withSpec('diagRead')(probeDiagFace).indexOf('{"t":0') === 0,
    'o19: [N1] 摘掉诊断读数 ⇒ lastTurn 恒 0（账在进程里、答案在世界外）实 ' + withSpec('diagRead')(probeDiagFace));
  const rw = withSpec('retFace')(probeWrite);
  const rr = withSpec('retFace')(probeRestored);
  a(rw.indexOf('"turn":4') >= 0 && rr === 'not-resumed:undefined',
    'o19: [N1] 摘掉返回值里的落盘结论 ⇒ 调用方看不到本轮的落盘结果（实 ' + rr + '）');
  // N2 原版成绿（同一批探针）
  a(probeClean(probeRestored) === 'restored', 'o19: [N2] 原版：跨会话延续');
  a(probeClean(probeWrite).indexOf('"turn":4') >= 0, 'o19: [N2] 原版：末次 tick 写回');
  a(probeClean(probeOffIgnoresDisk) === 'off', 'o19: [N2] 原版：关闭时不读盘上残留');
  a(probeClean(probeForeign) === 'rejected/rejected/rejected', 'o19: [N2] 原版：三形一律拒收');
  a(probeClean(probeDiagFace).indexOf('{"t":4') === 0, 'o19: [N2] 原版：诊断读数是 4');
  a(probeClean(probeWorldClean) === 'clean', 'o19: [N2] 原版：世界面不落游标');
  // N3 隔离：破坏甲不影响乙
  a(withSpec('control')(probeWorldClean) === 'clean',
    'o19: [N3] 摘掉恢复不影响「世界面不落游标」');
  a(withSpec('diagRead')(probeRestored) === 'restored',
    'o19: [N3] 摘掉诊断读数不影响「跨会话延续」');
  a(withSpec('chatId')(probeWrite).indexOf('"turn":4') >= 0,
    'o19: [N3] 摘掉归属判定不影响「写回结构」');
  clearTurn();
  // N4 判据非恒真：开关两端必须真的不同（否则整把锁在测一个不动的量）
  const withOn = probeClean(probeRestored);
  clearTurn();
  const withOff = probeClean(probeOffKeepsZero);
  a(withOn === 'restored' && withOff === '4>0|false',
    'o19: [N4] 开关两端症状**不同**（非恒真）：开=' + withOn + ' 关=' + withOff);
  clearTurn();
  // N5 纯度：全部负控制跑完后三个真文件逐字未变
  [LIFE, DIAG, PANEL].forEach(function (rel) {
    a(src(rel) === purity[rel], 'o19: [N5] ' + rel + ' 逐字未变');
  });
  cleanup();
  a(diskRow() === null && crossOnDisk() === false, 'o19: [N5] 负控制全部跑完仍无盘面残留');
}
function runAll(a) { judge(a); }
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) { if (cond) pass++; else { fail++; console.log('  x ' + name); } };
  try { runAll(a); runNegative(a); }
  catch (e) { fail++; console.log('  x threw: ' + (e && e.stack)); }
  if (fail) { console.log('LIFE-TURN-V2132: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('LIFE-TURN-V2132: pass (' + pass + ')');
}
module.exports = { runAll: runAll, runNegative: runNegative, BROKEN: BROKEN, REL: LIFE, anchorHits: anchorHits };