// WorldAxis tests/permissions-v2110.js (v2.110.0) — 权限系统专锁（计划二 #39 多人协作 + #70 多租户）
//
// 这两项在计划里是两条，在本仓是**同一处机制**：角色 → 权限位 → 判定。
//   · #39 协作：GM 与玩家对同一份世界有不同程度的写权；
//   · #70 多租户：细粒度权限位（read/write/delete/admin）在 API 边界上缺失。
//   两处病灶同源 ⇒ 一个模块（core/permissions.js）、一份判据（本文件）。
//
// 本锁的**否定式**核心（三条，都是「不许把缺失当成通过」）：
//   ① **未声明 ≠ 允许**：未注册用户一律 `allowed:false` + `reason:'unknown-user'` ——
//      「谁都没说不行」与「说了行」是两件事；
//   ② **审计模式不改产品行为**：`has/check` 只回答「允不允许」，**不阻断**任何既有写路径。
//      判定函数里不许出现写存档 / 抛异常 / 改世界（本锁用「调用前后存档逐字不变」证明这一点）；
//   ③ **通配只认一种写法**：`'*'` 是全域网，`'actor.*'` 是前缀通配，`'*.*'` **不支持**
//      （判定只用 `startsWith(前缀 + '.')`，不做正则、不猜）。
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const synthHost = require('./synth-host.js');
const BASE = path.join(__dirname, '..');
const REL = 'core/permissions.js';
const KEYS = ['defineRole', 'grant', 'revoke', 'grantDirect', 'effective', 'has', 'can', 'check',
  'matrix', 'stat', 'reset', 'ROLE_LABELS', 'ACTIONS',
  // v2.112.0（收边界①的尾巴）：显式闸门与当前使用者。写路径唯一消费方 = core/store.js 的 save()。
  //   枚举口径不变：导出面上**多一个口就要在这里多一行**，否则 A 段会以「未登记的多余口」报红
  //   （这正是想要的效果 —— 出口面只能显式增长）。
  'session', 'currentUser', 'gate', 'gateStat'];

function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function freshHost() {
  const c = synthHost.negativeContext({});
  vm.runInContext(srcOf(), c, { filename: REL });
  return c;
}
function hostWith(broken) {
  const c = synthHost.negativeContext({});
  vm.runInContext(broken, c, { filename: REL + '#broken' });
  return c;
}
function exportBody(src) {
  const m = /WA\.permissions\s*=\s*\{/.exec(src);
  if (!m) return '';
  let i = src.indexOf('{', m.index + m[0].length - 1), depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i + 1, j); }
  }
  return '';
}

// ── A 段：导出面枚举 ─────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  a(/WA\.permissions\s*=\s*\{/.test(src), 'perm/A: 命名空间赋值形态未变');
  const body = exportBody(src);
  a(body.length > 50, 'perm/A: 导出面对象字面量可定位（' + body.length + ' 字符）');
  KEYS.forEach(function (k) {
    a(new RegExp('(^|[\\s,{])' + k + '\\s*:').test(body), 'perm/A: 导出面**对象体内**含 ' + k);
  });
  const keys = (body.match(/(?:^|[\s,{])([A-Za-z_$][\w$]*)\s*:/g) || [])
    .map(function (s) { return s.replace(/[^A-Za-z_$]/g, ''); });
  const uniq = keys.filter(function (k, i) { return keys.indexOf(k) === i && KEYS.indexOf(k) < 0; });
  a(uniq.length === 0, 'perm/A: 导出面无未登记的多余口（实 ' + JSON.stringify(uniq) + '）');
  a(/window\.WorldAxis = window\.WorldAxis \|\| \{\}/.test(src), 'perm/A: 宿主入口沿用 window.WorldAxis');
}

// ── B 段：运行时探针 ────────────────────────────────────────────────────
function runB(a, WA) {
  const P = (WA || global.WorldAxis || {}).permissions;
  a(!!P, 'perm/B: 命名空间已装载');
  if (!P) return;
  P.reset();

  // B1. 内置角色齐全，且是**拷贝**（外部改不动内置表）
  const roles = Object.keys(P.ROLE_LABELS).sort();
  a(roles.join(',') === 'editor,gm,guest,owner,viewer',
    'perm/B: 内置五角色（实 ' + roles.join(',') + '）');
  const acts1 = P.ACTIONS;
  acts1.push('被外部塞进来的');
  a(P.matrix().actions.indexOf('被外部塞进来的') < 0,
    'perm/B: ACTIONS 是副本（外部推入不回写**内置表** —— 判据读的是 matrix() 的默认动作面，'
    + '而不是 P.ACTIONS：后者本来就与推入的是同一个对象，拿它做判据是自证）');

  // B2. **未注册用户一律拒绝**（边界①）
  const u = P.has('陌生人', 'read');
  a(u.allowed === false && u.reason === 'unknown-user' && u.ok === false,
    'perm/B: 未注册用户 ⇒ allowed:false / unknown-user（实 ' + JSON.stringify(u.reason) + '）')
  a(P.has('', 'read').reason === 'missing-args' && P.has('x', '').reason === 'missing-args',
    'perm/B: 空用户 / 空动作如实报 missing-args（不与 unknown-user 混成一个值）');

  // B3. GM 落位：内置角色的判定
  P.reset();
  P.grant('gm1', 'gm');
  a(P.has('gm1', 'write').allowed === true && P.has('gm1', 'delete').allowed === true,
    'perm/B: gm 持有 write/delete');
  a(P.has('gm1', 'ADMIN').allowed === false,
    'perm/B: gm **不**持有 ADMIN（owner 专属）—— 「高角色包不包含低角色权限」必须逐位核');
  P.grant('v1', 'viewer');
  a(P.has('v1', 'read').allowed === true && P.has('v1', 'write').allowed === false,
    'perm/B: viewer 只读（read 通过 / write 拒绝）');
  a(P.check('v1', 'write', 'editor') !== null,
    'perm/B: check 对拒绝返回非 null（拒收体）');
  a(P.check('v1', 'read') === null, 'perm/B: check 对允许返回 null（无异议时不留噪声）');

  // B4. 拒收体形态（#39 验收点名的形态）
  const body = P.check('v1', 'publish', 'editor');
  a(body && body.ok === false && body.reason === 'permission-denied' && body.required === 'editor',
    'perm/B: 拒收体为 {ok:false, reason:permission-denied, required:…}（实 ' + JSON.stringify(body) + '）');
  const body2 = P.check('查无此人', 'publish');
  a(body2 && body2.reason === 'unknown-user' && typeof body2.note === 'string',
    'perm/B: 未注册用户的拒收体**区分**出 unknown-user 并带说明');

  // B5. grant 的诚实性：未知角色**不静默接受**
  const g1 = P.grant('u5', '没这个角色');
  a(g1.ok === false && g1.reason === 'unknown-role' && Array.isArray(g1.known),
    'perm/B: grant 未知角色 ⇒ unknown-role 并附已知角色名单（实 ' + JSON.stringify(g1.reason) + '）');
  a(P.grant('u6', '幽灵', { allowUnknown: true }).ok === true,
    'perm/B: 显式 allowUnknown 才接受未知角色名（放宽必须声明）');
  a(P.grant('u7', '').ok === false || P.grant('u7', 'gm').ok === true, 'perm/B: grant 不抛');

  // B6. grant 幂等 + revoke 的诚实性
  P.reset();
  P.grant('idem', 'gm');
  const before = P.effective('idem').length;
  P.grant('idem', 'gm');
  a(P.effective('idem').length === before, 'perm/B: 重复 grant 幂等（有效权限面不变）');
  const r1 = P.revoke('idem', '没授过的角色');
  a(r1.ok === true && r1.removed === false,
    'perm/B: revoke 一个没授过的角色 ⇒ ok:true / removed:false（**不**假称成功，也不算失败）');
  const r2 = P.revoke('查无此人', 'gm');
  a(r2.ok === false && r2.reason === 'unknown-user', 'perm/B: revoke 未注册用户 ⇒ unknown-user');
  const r3 = P.revoke('idem', 'gm');
  a(r3.ok === true && r3.removed === true && P.has('idem', 'write').allowed === false,
    'perm/B: 撤掉 gm 后写权限真的没了（撤销必须落到判定上）');

  // B7. 直授权限位（绕过角色）+ 归属优先
  P.reset();
  P.grant('d1', 'viewer');
  P.grantDirect('d1', 'publish');
  a(P.has('d1', 'publish').allowed === true && P.has('d1', 'publish').via === 'direct',
    'perm/B: 直授权限位生效且 via=direct（实 ' + P.has('d1', 'publish').via + '）');
  a(P.has('d1', 'read').via === 'role', 'perm/B: 角色给的权限 via=role（归属不混）');
  a(P.has('d1', 'delete').allowed === false, 'perm/B: 直授一个位**不**顺带另外的位');

  // B8. 通配：'*' 全域网；'actor.*' 前缀；'*.*' 不支持
  P.reset();
  P.grantDirect('w1', '*');
  a(P.has('w1', '任何东西').allowed === true && P.has('w1', '任何东西').via === '*',
    'perm/B: 持有 * ⇒ 全部（实 ' + P.has('w1', '任何东西').via + '）');
  P.reset();
  P.grantDirect('w2', 'actor.*');
  a(P.has('w2', 'actor.name').allowed === true, 'perm/B: actor.* 覆盖 actor.name（前缀通配）');
  a(P.has('w2', 'actorx.name').allowed === false,
    'perm/B: actor.* **不**覆盖 actorx.name（前缀必须是「前缀 + 点」，不是裸 startsWith）');
  a(P.has('w2', 'actor').allowed === false,
    'perm/B: actor.* 不覆盖 actor 本身（通配不当成「家族名」）');
  P.reset();
  P.grantDirect('w3', '*.*');
  a(P.has('w3', 'anything').allowed === false,
    'perm/B: *.* 不被支持（多重通配不做正则、不猜）—— 它落成一条普通字符串权限位');

  // B9. defineRole 覆盖内置角色（**用自定义角色名**：覆盖内置 `gm` 会污染后续用例 ——
  //   本仓的模块态在 run.js 里是**跨 section 共享**的，专锁不许给下一节留全局改动）
  P.reset();
  P.defineRole('t-role-a', ['read']);
  P.grant('g9', 't-role-a');
  a(P.has('g9', 'write').allowed === false && P.has('g9', 'read').allowed === true,
    'perm/B: defineRole 真能定义角色并生效（否则「可自定义角色」是空话）');
  a(P.defineRole('', []).ok === false, 'perm/B: 空角色名不注册（如实报）');

  // B10. matrix：只读快照
  P.reset();
  P.grant('m1', 'gm');
  const mx = P.matrix(['read', 'write', 'ADMIN']);
  a(mx && Array.isArray(mx.actions) && mx.actions.join(',') === 'read,write,ADMIN',
    'perm/B: matrix 尊重传入的动作面（实 ' + JSON.stringify(mx.actions) + '）');
  a(mx.users.length === 1 && mx.users[0].user === 'm1' && mx.users[0].allow.indexOf('write') >= 0
    && mx.users[0].allow.indexOf('ADMIN') < 0,
    'perm/B: matrix 逐用户给出「允许哪几项」（实 ' + JSON.stringify(mx.users[0].allow) + '）');
  mx.users[0].roles.push('被外部改坏了');
  a(P.matrix(['read']).users[0].roles.indexOf('被外部改坏了') < 0,
    'perm/B: matrix 返回副本（诊断读数不许反过来篡改权限表）');

  // B11. stat / reset
  const st = P.stat();
  a(st && typeof st.checks === 'number' && typeof st.denied === 'number' && Array.isArray(st.actions),
    'perm/B: stat 给出 checks/allowed/denied/unknownUser/grants/revokes（实 ' + JSON.stringify(st.checks) + '）');
  // stat.roles 反映当前角色表。**口径自纠**：首版写「恰等于五个内置角色」——
  //   那是错的，因为 `reset()` 只清**用户表与计数**，不清**角色定义**（那是定义面，不是状态面）。
  //   实测根因：B9 定义的 `t-role-a` 在本条之前仍然在册，于是判据报红。
  //   真判据不该钉「恰好五条」，而该钉两件事：① 内置五角色一个不少；
  //   ② 自定义角色**跨 reset 保留**（这是刻意登记下来的边界，不是遗漏）。
  const allRoles = P.stat().roles;
  const builtins = ['editor', 'gm', 'guest', 'owner', 'viewer'];
  a(builtins.every(function (r) { return allRoles.indexOf(r) >= 0; }),
    'perm/B: stat.roles 含全部内置五角色（实 ' + JSON.stringify(allRoles) + '）');
  a(allRoles.indexOf('t-role-a') >= 0,
    'perm/B: 自定义角色跨 reset 保留（reset 清的是用户表与计数，**不是**角色定义 —— '
    + '把定义也清掉会让「先 defineRole 再 grant」的顺序依赖变成隐形契约，实 ' + JSON.stringify(allRoles) + '）');
  P.reset();
  a(P.stat().users === 0 && P.effective('m1') === null, 'perm/B: reset 清空用户表（生效面同步归零）');
}

// ── C 段：不变式 ────────────────────────────────────────────────────────
function runC(a, WA) {
  const P = (WA || global.WorldAxis || {}).permissions;
  if (!P) { a(false, 'perm/C: 命名空间缺席，不变式无从判定'); return; }

  // C1. **审计模式不改产品行为**：判定前后存档逐字不变（这是「不阻断」的可证伪形态）
  const ST = (global.WorldAxis || {}).store;
  P.reset();
  P.grant('c1', 'viewer');
  const snapBefore = ST && typeof ST.read === 'function' ? JSON.stringify(ST.read()) : null;
  for (let i = 0; i < 20; i++) { P.has('c1', 'write'); P.check('c1', 'write'); P.has('查无此人', 'read'); }
  const snapAfter = ST && typeof ST.read === 'function' ? JSON.stringify(ST.read()) : null;
  a(snapBefore === null || snapBefore === snapAfter,
    'perm/C: 判定不写世界（20 次判定前后存档逐字一致 —— 审计模式不是「顺手改一下」）');

  // C2. 判定自洽：allowed === (via !== '') ；denied 与 allowed 计数守恒
  P.reset();
  P.grant('c2', 'editor');
  const y = P.has('c2', 'write'), n = P.has('c2', 'delete');
  a(y.allowed === (y.via !== ''), 'perm/C: 允许 ⇔ via 非空（实 ' + JSON.stringify([y.allowed, y.via]) + '）');
  a(n.allowed === false && n.via === '', 'perm/C: 拒绝时 via 为空（不许给拒绝编一个归属）');
  const s = P.stat();
  a(s.allowed + s.denied === s.checks,
    'perm/C: allowed + denied === checks（每次判定都有唯一去向，实 '
    + s.allowed + '+' + s.denied + ' vs ' + s.checks + '）');

  // C3. can 与 has 同源（别名不许变成第二份实现）
  P.reset();
  P.grant('c3', 'viewer');
  const h = P.has('c3', 'write'), c = P.can('c3', 'write');
  a(h.allowed === c.allowed && h.reason === c.reason && h.via === c.via,
    'perm/C: can 与 has 逐字段同源（别名不是第二份实现）');

  // C4. effective 的并集语义：多角色 = 并集，不是最后一个
  P.reset();
  P.grant('c4', 'viewer');
  P.grant('c4', 'editor');
  const eff = P.effective('c4');
  a(eff.indexOf('read') >= 0 && eff.indexOf('write') >= 0,
    'perm/C: 多角色取**并集**（实 ' + JSON.stringify(eff) + '）');
  a(eff.length === new Set(eff).size, 'perm/C: effective 去重（同一权限位不重复出现）');
  a(P.effective('查无此人') === null, 'perm/C: 未注册用户的 effective 是 null（不是空数组 ——「没有这个人」≠「这个人没有权限」）');
  P.reset();
}

// ── N 段：负控制（真源码破坏 + 真宿主重跑同款判据）────────────────────────
function runNegative(a) {
  const src = srcOf();

  // N1. 破坏「未声明 ≠ 允许」：把 unknown-user 早退摘掉
  const A1 = "    if (!rec) { out.reason = 'unknown-user'; _stat.unknownUser++; _stat.denied++; return out; }";
  const n1 = src.split(A1).length - 1;
  a(n1 === 1, 'perm/N1: 破坏锚点（unknown-user 早退）在真源码中恰 1 处（实 ' + n1 + '）');
  const b1 = src.replace(A1, "    if (false) { out.reason = 'unknown-user'; _stat.unknownUser++; _stat.denied++; return out; }");
  a(n1 === 1 && b1 !== src, 'perm/N1: 破坏真的改动了源码文本');
  if (n1 === 1) {
    const P1 = hostWith(b1).WorldAxis.permissions;
    const r1 = P1.has('查无此人', 'read');
    a(r1.reason !== 'unknown-user',
      'perm/N1: 破坏后未注册用户**不再被标为 unknown-user**（实 ' + r1.reason
      + '）—— 这正是「谁都没说不行 ⇒ 就当行」的形态');
  }

  // N2. 破坏前缀通配：让 '.*' 分支恒不成立
  const A2 = "      if (p.length > 2 && p.indexOf('.*') === p.length - 2 && a.indexOf(p.slice(0, -1)) === 0) {";
  const n2 = src.split(A2).length - 1;
  a(n2 === 1, 'perm/N2: 破坏锚点（前缀通配）在真源码中恰 1 处（实 ' + n2 + '）');
  const b2 = src.replace(A2, "      if (false) {");
  a(n2 === 1 && b2 !== src, 'perm/N2: 破坏真的改动了源码文本');
  if (n2 === 1) {
    const P2 = hostWith(b2).WorldAxis.permissions;
    P2.grantDirect('n2u', 'actor.*');
    a(P2.has('n2u', 'actor.name').allowed === false,
      'perm/N2: 破坏后前缀通配失效（actor.* 不再覆盖 actor.name）—— 判据在真源码上生效');
  }

  // N3. 破坏「未知角色不静默接受」：把未知角色检查摘掉
  const A3 = "    if (!Object.prototype.hasOwnProperty.call(ROLES, r) && !(opts && opts.allowUnknown)) {";
  const n3 = src.split(A3).length - 1;
  a(n3 === 1, 'perm/N3: 破坏锚点（未知角色检查）在真源码中恰 1 处（实 ' + n3 + '）');
  const b3 = src.replace(A3, "    if (false) {");
  a(n3 === 1 && b3 !== src, 'perm/N3: 破坏真的改动了源码文本');
  if (n3 === 1) {
    const P3 = hostWith(b3).WorldAxis.permissions;
    const r3 = P3.grant('n3u', '没这个角色');
    a(r3.ok === true, 'perm/N3: 破坏后未知角色被静默接受（ok 由 false 变 true）—— '
      + '「拼错角色名 = 所有人都没权限」与「拼错角色名 = 当没看见」是两种坏法，本模块取前者');
  }

  // N4. 纯度：原版上同款判据必须为真
  const P0 = freshHost().WorldAxis.permissions;
  a(P0.has('查无此人', 'read').reason === 'unknown-user', 'perm/N4: （纯度）原版上未注册用户判据为真');
  P0.grantDirect('p0u', 'actor.*');
  a(P0.has('p0u', 'actor.name').allowed === true, 'perm/N4: （纯度）原版上前缀通配判据为真');
  a(P0.grant('p0u2', '没这个角色').ok === false, 'perm/N4: （纯度）原版上未知角色判据为真');

  // N5. 反空转下限
  a(src.length > 3000, 'perm/N5: 被破坏的源码面非空（' + src.length + ' 字符）');
}

module.exports = { REL: REL, KEYS: KEYS, srcOf: srcOf, exportBody: exportBody,
  runA: runA, runB: runB, runC: runC, runNegative: runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  const _c = freshHost();
  runA(a); runB(a, _c.WorldAxis); runC(a, _c.WorldAxis); runNegative(a);
  console.log('permissions-v2110 ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
}