#!/usr/bin/env node
// WorldAxis tests/q2-snapshot-identity-v2211.js — v2.211.0(优化 Q2)专锁:
//   快照搬运的**身份与引用完整性**(改名 = 改键 + 同步 id/name + 同步跨面引用)。
//
// ── 它治的病(源码实证,不是推测)───────────────────────────────────
//   旧实现遇到命名冲突、勾了「改名装进来」时只做一件事:`cur[k + '·' + sig] = inc[k]`。
//   面键是改了,可本仓的身份口径是 `life.personId(name) = 'p_' + name`、**`people` 的键就是 id**,
//   而跨面引用(fondness.person / bonds.a·b·key / inst.holder)按**人名**落点比对。
//   于是「改名进来」的那份数据:键换了、记录里的 `id` 还指着旧身份、各处引用也仍指旧人 ——
//   新对象在**任何按身份查人的地方都查不到**(死数据),旧身份继续被引用(同名异人就此串档)。
//   真实 store 合成宿主探针实测:导入返回 ok:true,而 `p_A·incoming` 的 id 仍是 `p_A`。
//
// ── 承重设计(判据必须打在这几条上)────────────────────────────────
//   · **只改声明过的位置**:规则表 `IDENTITY_REFS` 之外一个字符都不动 —— 全局字符串替换
//     正是本项要治的病(同名的人与地/物会被一起改掉)。
//   · **预览与执行同源**:两处走同一份计划构造;预览报的引用处数必须与执行侧逐字相等。
//   · **行内自洽**:bonds 的 `key` 是按字典序拼的,`a`/`b` 必须与它同批落 ——
//     只改 key 不改 a/b(或反之)会让同一行内部自相矛盾,下次 `pairKey()` 就算不出这一行。
//   · **不支持的形态拒收,不硬塞**:`id` 与自身键不一致的条目,改名会把这份矛盾搬进新世界。
//
// ── 负控制口径(H6)────────────────────────────────────────────────
//   每条都是**真源码破坏**:锚点取自产品源码、各恰中 1 次 → 在 vm 内的**内存副本**上重装
//   → 重跑同款真判据 → 原版上同判据必须仍为真(两向)。破坏从不触碰磁盘。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/q2-snapshot-identity-v2211.js';
const MOD_REL = 'engines/world-snapshot.js';
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function sha(rel) { return crypto.createHash('sha256').update(read(rel)).digest('hex').slice(0, 16); }

function fakeLS() {
  const m = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    clear: function () { Object.keys(m).forEach(function (k) { delete m[k]; }); },
    key: function (i) { return Object.keys(m)[i] || null; },
    get length() { return Object.keys(m).length; }
  };
}

/**
 * 独立无头装载面:只装 world-snapshot 本身 + 它需要的宿主面。
 *   为什么不装 `core/store.js`:本锁判的是**搬运语义**(键/引用/账目),不是事务实现;
 *   用真 store 会把「改名对不对」与「事务提没提交」混在一条判据里。
 *   这里的 store 桩给出**与真 store 同形的语义**(draft → 提交或放弃),
 *   并且 `transact` 的 draft 是深拷贝 —— 于是「拒收后原档逐字节不变」才是一条真判据。
 */
function harness(opts) {
  const o = opts || {};
  const ov = o.srcOverride || {};
  const G = {};
  G.window = G; G.global = G; G.console = console;
  G.localStorage = fakeLS();
  const ctx = vm.createContext(G);
  const WA = G.window.WorldAxis = {};
  WA.log = function () {};
  WA.inputGuard = { text: function (v, m) { return String(v == null ? '' : v).slice(0, m || 60); } };
  WA.clock = { now: function () { return 1000; } };
  let state = JSON.parse(JSON.stringify(o.state || {}));
  WA.store = {
    get: function () { return state; },
    transact: function (fn) {
      const draft = JSON.parse(JSON.stringify(state));
      let r;
      try { r = fn(draft); } catch (e) { return { ok: false, error: e }; }
      if (r === false) return { ok: false };
      state = draft;
      return { ok: true };
    }
  };
  const src = ov[MOD_REL] !== undefined ? ov[MOD_REL] : read(MOD_REL);
  vm.runInContext(src, ctx, { filename: MOD_REL });
  WA.__state = function () { return state; };
  return WA;
}

/** 世界夹具:`people` 键即身份(p_ 前缀),三处跨面引用分别落在名字域与配对键域。 */
function freshWorld() {
  return {
    schemaVersion: 1,
    people: { 'p_阿澈': { id: 'p_阿澈', name: '阿澈', knowledge: {} } },
    fondness: { rows: [{ person: '阿澈', value: 30, trust: null, note: '', at: 0 }],
      meta: { owner: '甲' } },
    bonds: { rows: [{ key: '小满×阿澈', a: '小满', b: '阿澈', types: ['rival'], at: 0 }] },
    inst: { orgs: [{ id: 'o1', posts: [{ title: '执事', holder: '阿澈', perms: [] }] }] },
    world: { old: null },
    worldFacts: [{ key: '城门', value: '关', scope: 'world' }]
  };
}
/** 同名快照:与本地**同名异人**(键/人名都撞),但内容不同。 */
function mkSnap(sig) {
  return {
    wsVer: 1, schemaVersion: 1, sig: sig || 'abc12345', bytes: 10,
    faces: {
      people: { 'p_阿澈': { id: 'p_阿澈', name: '阿澈', knowledge: { intel: [] } } },
      fondness: { rows: [{ person: '阿澈', value: 88, trust: 5, note: 'x', at: 1 }],
        meta: { owner: '甲', tag: 'incoming' } },
      bonds: { rows: [{ key: '小满×阿澈', a: '小满', b: '阿澈', types: ['ally'], at: 1 }] },
      inst: { orgs: [{ id: 'o1', posts: [{ title: '执事', holder: '阿澈', perms: [] }] }] },
      world: { old: { k: 1 } },
      worldFacts: [{ key: '城门', value: '开', scope: 'world' }]
    }
  };
}
const NEWID = 'p_阿澈·abc12345';
const NEWNAME = '阿澈·abc12345';
/** 一次完整的改名导入,返回最终世界 + 返回值(正负控制在同一条流程上跑)。 */
function doRename(ov, opt, state, snap) {
  const G = harness({ srcOverride: ov, state: state || freshWorld() });
  const S = G.worldSnapshot;
  const sn = snap || mkSnap();
  const im = S.importSnapshot(sn, opt || { onConflict: 'rename' });
  return { S: S, im: im, state: G.__state(), snap: sn };
}
function hasRenamedKey(st) { return !!(st.people && st.people[NEWID]); }
function peopleIdSynced(st) { return !!(st.people && st.people[NEWID] && st.people[NEWID].id === NEWID); }
function peopleNameSynced(st) { return !!(st.people && st.people[NEWID] && st.people[NEWID].name === NEWNAME); }
function fondnessSynced(st) {
  return !!(st.fondness && (st.fondness.rows || []).some(function (r) { return r && r.person === NEWNAME; }));
}
function bondsRowConsistent(st) {
  const rows = (st.bonds && st.bonds.rows) || [];
  const hit = rows.filter(function (r) { return r && (r.a === NEWNAME || r.b === NEWNAME); });
  return hit.length > 0 && hit.every(function (r) { return r.key === [r.a, r.b].sort().join('×'); });
}
function instSynced(st) {
  const orgs = (st.inst && st.inst.orgs) || [];
  return orgs.some(function (o) {
    return ((o && o.posts) || []).some(function (p) { return p && p.holder === NEWNAME; });
  });
}
/** 面里套的**对象**(fondness.meta)是否递归下潜并进来了。 */
function nestedMerged(st) {
  return !!(st.fondness && st.fondness.meta && st.fondness.meta.tag === 'incoming');
}
/** 本地是**空位**(null)的字段是否把来件并进来了(空位不是「已有值」)。 */
function nullSlotMerged(st) {
  return !!(st.world && st.world.old && st.world.old.k === 1);
}
/** 跨面引用环夹具:两人**互指**(配对键把两人绑成一行),两边都同名冲突 ⇒ 都要改名。 */
function cycWorld() {
  return { schemaVersion: 1,
    people: { 'p_ACH': { id: 'p_ACH', name: 'ACH', knowledge: {} },
      'p_XM': { id: 'p_XM', name: 'XM', knowledge: {} } },
    fondness: { rows: [{ person: 'ACH', value: 10, at: 0 }] },
    bonds: { rows: [{ key: 'ACH×XM', a: 'ACH', b: 'XM', at: 0 }] } };
}
function cycSnap() {
  return { wsVer: 1, schemaVersion: 1, sig: 'cyc00001', bytes: 10, faces: {
    people: { 'p_ACH': { id: 'p_ACH', name: 'ACH', knowledge: { intel: [] } },
      'p_XM': { id: 'p_XM', name: 'XM', knowledge: { intel: [] } } },
    fondness: { rows: [{ person: 'ACH', value: 55, at: 1 }] },
    bonds: { rows: [{ key: 'ACH×XM', a: 'ACH', b: 'XM', at: 1 }] } } };
}
/** 收集环上的**人名引用**,按「哪一面、哪一行」成组返回(行内分组是必需的:
 *   环内两人绑在同一行,「只同步一半」的真形态就是行内一个带后缀一个不带)。 */
function refsOf(st) {
  const out = [];
  ((st.bonds || {}).rows || []).forEach(function (r) { out.push({ where: 'bonds', names: [r.a, r.b] }); });
  ((st.fondness || {}).rows || []).forEach(function (r) { out.push({ where: 'fondness', names: [r.person] }); });
  return out;
}
/** 环内「引用真同步」硬判据(第一版只用「能解析到真身份」,那是**假绿**:本地本来就有同名的人,
 *   引用没同步也照样解析得到 —— 探针实证:摘掉 bonds 配对规则后旧判据仍为真)。
 *   · tagged:带 sig 后缀的引用处数(不同步就是 0 / 少算,旧病现形);
 *   · bad:带后缀却解析不到同后缀真身份的引用,以及「半同步行」。 */
function cycSynced(st, tag) {
  let tagged = 0;
  const bad = [];
  refsOf(st).forEach(function (r) {
    const t = r.names.filter(function (nm) { return typeof nm === 'string' && nm.indexOf('·' + tag) >= 0; });
    if (t.length && t.length !== r.names.length) bad.push({ where: r.where, why: 'half-row', names: r.names });
    t.forEach(function (nm) {
      tagged++;
      const rec = (st.people || {})['p_' + nm];
      if (!rec || rec.id !== 'p_' + nm || rec.name !== nm) bad.push({ where: r.where, name: nm, why: 'unresolved' });
    });
  });
  return { tagged: tagged, bad: bad };
}
function over(rel, from, to) {
  const raw = read(rel);
  const hits = raw.split(from).length - 1;
  if (hits !== 1) throw new Error('破坏锚点命中 ' + hits + ' 次(要求恰 1): ' + rel + ' :: ' + from.slice(0, 70));
  const o = {}; o[rel] = raw.split(from).join(to);
  return o;
}

// ── A 段:静态契约 ──────────────────────────────────────────────────────
function runAll(a) {
  const src = read(MOD_REL);
  const shaBefore = sha(MOD_REL);

  // A1 身份引用表是**声明**、且三个域齐备(表被悄悄改短 ⇒ 这里先红)
  const m = src.match(/const IDENTITY_REFS = \[([\s\S]*?)\n  \];/);
  a(!!m, 'q2: [A1] IDENTITY_REFS 是显式声明表(不是散在代码里的 if)');
  const body = m ? m[1] : '';
  a(/domain: 'id'/.test(body) && /domain: 'name'/.test(body) && /domain: 'pair'/.test(body),
    'q2: [A1] 三个域齐备(id / name / pair)—— 少一个就有一类引用被静默漏改');
  a(/face: 'people'/.test(body) && /face: 'fondness'/.test(body) && /face: 'bonds'/.test(body)
    && /face: 'inst'/.test(body),
    'q2: [A1] 四个承载身份引用的面都在表内(people / fondness / bonds / inst)');
  // A2 配对键与 a/b **同批**(分两条规则写会让 key 与 a/b 各自落位 ⇒ 行内自相矛盾)
  a(/fields: \['key', 'a', 'b'\]/.test(body) || /fields: \[[^\]]*'a'[^\]]*'b'[^\]]*\]/.test(body),
    'q2: [A2] bonds 的 key/a/b 绑在同一条规则上(不是三条各改各的)');
  // A3 只导出「一件事一个读口」:内部件不得外露
  const G0 = harness({ state: freshWorld() });
  const S0 = G0.worldSnapshot;
  a(S0.buildRenamePlan === undefined && S0.applyRenamePlan === undefined && S0.utf8Len === undefined,
    'q2: [A3] 改名链内部件(buildRenamePlan / applyRenamePlan / utf8Len)**不导出**'
      + '(消费面是 previewImport / importSnapshot 的返回,不留第二个可漂移读口)');
  a(Array.isArray(S0.IDENTITY_REFS) && S0.IDENTITY_REFS.length > 0,
    'q2: [A3] IDENTITY_REFS 以只读数据形态转出(诊断/维护可见)');
  // A4 诊断面报出引用同步面(该表的真消费方,不是装饰)
  const dg = S0.diagnose();
  a(Array.isArray(dg.identityRefs) && dg.identityRefs.length === S0.IDENTITY_REFS.length,
    'q2: [A4] diagnose 报出引用同步面(实 ' + JSON.stringify(dg.identityRefs && dg.identityRefs.length) + ')');
  // A5 拒收码进见证档:rename-unsupported 在源码里真出现(不是只写在注释里)
  a(src.indexOf("'rename-unsupported'") > 0, 'q2: [A5] 拒收码 rename-unsupported 真出现在代码里');
  a(src.indexOf("'rename-collision'") > 0, 'q2: [A5] 二次撞名记账 rename-collision 真出现');

  // ── B 段:运行时(真跑)──────────────────────────────────────────────
  const r1 = doRename(null, { onConflict: 'rename' });
  a(r1.im.ok === true, 'q2: [B1] 改名导入成功(实 ' + JSON.stringify(r1.im.reason) + ')');
  a(hasRenamedKey(r1.state), 'q2: [B2] 冲突键已改名为 键·sig(实 ' + Object.keys(r1.state.people).join(',') + ')');
  a(peopleIdSynced(r1.state), 'q2: [B2] 新记录的 **id** 已同步到新身份(旧实现留着旧 id ⇒ 死数据)');
  a(peopleNameSynced(r1.state), 'q2: [B2] 新记录的 name 已同步(人名域引用才能对上)');
  a(!!r1.state.people['p_阿澈'], 'q2: [B2] 本地旧身份**仍在**(改名不是替换、不是覆盖)');
  a(fondnessSynced(r1.state), 'q2: [B3] fondness.person 引用已指到新身份(实 '
    + JSON.stringify((r1.state.fondness || {}).rows) + ')');
  a(bondsRowConsistent(r1.state), 'q2: [B4] bonds 的 key 与 a/b 行内自洽(实 '
    + JSON.stringify(((r1.state.bonds || {}).rows || []).filter(function (x) { return x.b === NEWNAME; })) + ')');
  a(instSynced(r1.state), 'q2: [B5] inst 职位持有人引用已同步(实 '
    + JSON.stringify(((r1.state.inst || {}).orgs || [])) + ')');
  a(r1.state.worldFacts.length === 2,
    'q2: [B6] 表外的面不受影响(worldFacts 数组按去重并进,实 ' + r1.state.worldFacts.length + ' 条)');
  // B7 预览与执行同源:预览报的引用处数 === 执行侧
  const G7 = harness({ state: freshWorld() });
  const S7 = G7.worldSnapshot;
  const pv = S7.previewImport(mkSnap(), { onConflict: 'rename' });
  const im7 = S7.importSnapshot(mkSnap(), { onConflict: 'rename' });
  a(pv.ok === true && pv.renamePlan && pv.renamePlan.conflicts === 1,
    'q2: [B7] 预览报出改名计划(冲突 1 条 / sigTag ' + (pv.renamePlan && pv.renamePlan.sigTag) + ')');
  a(pv.refsTotal >= 4 && pv.refsTotal === im7.refsTotal,
    'q2: [B7] 预览与执行的引用处数**逐字相等**(预览 ' + pv.refsTotal + ' / 执行 ' + im7.refsTotal + ')');
  // B8 二次撞名:不得叠后缀造出第三身份
  const r2 = doRename(null, { onConflict: 'rename' }, r1.state);
  a(r2.im.ok === true && Object.keys(r2.state.people).length === 2 && !r2.state.people[NEWID + '·abc12345'],
    'q2: [B8] 二次同名不叠后缀、不造第三身份(实 ' + Object.keys(r2.state.people).join(',') + ')');
  a(r2.im.skipped.some(function (s) { return s.why === 'rename-collision'; }),
    'q2: [B8] 二次撞名如实记 rename-collision(实 ' + JSON.stringify(r2.im.skipped) + ')');
  // B9 不支持的形态:拒收 + 原档逐字节不变
  const bad = mkSnap(); bad.faces.people['p_阿澈'].id = 'p_别的';
  const G9 = harness({ state: freshWorld() });
  const before9 = JSON.stringify(G9.__state());
  const im9 = G9.worldSnapshot.importSnapshot(bad, { onConflict: 'rename' });
  a(im9.ok === false && im9.reason === 'rename-unsupported',
    'q2: [B9] id 与自身键不一致 ⇒ 拒收(实 ' + JSON.stringify(im9.reason) + ')');
  a(JSON.stringify(G9.__state()) === before9, 'q2: [B9] 拒收后原档逐字节不变');
  // B10 skip 模式**不触发**改名与引用同步(改写只属于改名处置)
  const G10 = harness({ state: freshWorld() });
  const im10 = G10.worldSnapshot.importSnapshot(mkSnap(), {});
  a(im10.ok === true && !G10.__state().people[NEWID],
    'q2: [B10] 默认 skip:不产生改名键(实 ' + Object.keys(G10.__state().people).join(',') + ')');
  a(!fondnessSynced(G10.__state()), 'q2: [B10] skip 模式下引用**不**被改写(没有凭空改名)');
  // B11 newslot:一格不碰世界
  const G11 = harness({ state: freshWorld() });
  const before11 = JSON.stringify(G11.__state());
  const im11 = G11.worldSnapshot.importSnapshot(mkSnap(), { mode: 'newslot', slot: 'q2' });
  a(im11.ok === true && im11.mode === 'newslot' && JSON.stringify(G11.__state()) === before11,
    'q2: [B11] newslot 模式世界一格未动(存进快照库)');
  // B12 容量三档分开报(字符 / code unit / UTF-8 字节),中文下字节 > 字符
  const cap = S7.capacity(mkSnap());
  a(cap.seen && cap.seen.unit && cap.seen.unit.utf8Bytes > cap.seen.unit.chars
    && cap.seen.unit.codeUnits >= cap.seen.unit.chars,
    'q2: [B12] 容量三档分开报且中文 utf8Bytes > chars(实 ' + JSON.stringify(cap.seen.unit) + ')');
  // B13 面里套的**对象**要递归下潜(不是整卷当冲突丢)
  a(nestedMerged(r1.state), 'q2: [B13] 嵌套对象子面并进(实 ' + JSON.stringify((r1.state.fondness || {}).meta) + ')');
  // B14 本地**空位**(null)不是「已有值」⇒ 来件子树并进
  a(nullSlotMerged(r1.state), 'q2: [B14] 本地空位的字段并进(实 ' + JSON.stringify(r1.state.world) + ')');

  // ── C 段:不变式(只读 / 幂等)─────────────────────────────────────
  // B15 容量**四**读数齐备:字符 / code unit / UTF-8 字节 / **宿主估计**(计划原文三档点名)
  const S15 = harness({ state: freshWorld() });
  const u15 = S15.worldSnapshot.capacity(mkSnap()).seen.unit;
  a(u15.chars > 0 && u15.utf8Bytes > u15.chars && u15.codeUnits >= u15.chars
    && u15.hostEstimate === u15.codeUnits * 2,
    'q2: [B15] 容量四读数齐备且宿主估计 = codeUnits×2(实 ' + JSON.stringify(u15) + ')');
  // B16 跨面**循环引用**:两人互指且两边都同名冲突 ⇒ 改名后环内处处同步、引用仍解析到真身份
  const G16 = harness({ state: cycWorld() });
  const c16 = G16.worldSnapshot.importSnapshot(cycSnap(), { onConflict: 'rename' });
  const s16 = G16.__state();
  const cRows = ((s16.bonds || {}).rows || []);
  a(c16.ok === true && Object.keys(s16.people).length === 4,
    'q2: [B16] 环内两侧同名的人各自留身份(本地 2 + 改名进 2,实 ' + Object.keys(s16.people).join(',') + ')');
  a(cRows.length === 2 && cRows.every(function (r) { return r.key === [r.a, r.b].sort().join('×'); }),
    'q2: [B16] 环内每一行仍行内自洽(实 ' + JSON.stringify(cRows) + ')');
  const cy = cycSynced(s16, 'cyc00001');
  a(cy.bad.length === 0 && cy.tagged === 3,
    'q2: [B16] 环内引用真同步:3 处带后缀引用各自解析到同后缀真身份、无半同步行(实 '
      + JSON.stringify(cy) + ')');
  const G12 = harness({ state: freshWorld() });
  const one = JSON.stringify(G12.worldSnapshot.previewImport(mkSnap(), { onConflict: 'rename' }));
  const two = JSON.stringify(G12.worldSnapshot.previewImport(mkSnap(), { onConflict: 'rename' }));
  a(one === two, 'q2: [C1] 预览幂等:同输入连调逐字一致(计划是纯读、确定的)');
  a(JSON.stringify(G12.__state()) === JSON.stringify(freshWorld()),
    'q2: [C1] 预览全程不改世界(纯读)');
  a(sha(MOD_REL) === shaBefore, 'q2: [C2] 判据跑完产品源 sha 不变(没有任何落盘改写)');

  // ── N 段:负控制(真源码破坏 → 内存副本重跑同款判据)──────────────
  require('./q2-snapshot-identity-v2211.js').runNegative(a, {});
}

function runNegative(a) {
  // N7 的判据必须是**真前后比对**:`sha(x) === sha(x)` 是自我恒等,破坏没发生也恒真(假绿)。
  const shaAtEntry = sha(MOD_REL);
  // N0 两向自证的地基:原版上六条判据必须全真
  const r0 = doRename(null, { onConflict: 'rename' });
  a(hasRenamedKey(r0.state) && peopleIdSynced(r0.state) && peopleNameSynced(r0.state)
    && fondnessSynced(r0.state) && bondsRowConsistent(r0.state) && instSynced(r0.state)
    && nestedMerged(r0.state) && nullSlotMerged(r0.state),
    'q2: [N0] (原版)八条身份/合并判据全真 —— 否则下面的「破坏后翻假」证明不了任何事');

  // N1 摘掉 fondness 那条规则 ⇒ 引用同步必须现形消失
  const b1 = over(MOD_REL, "{ face: 'fondness', at: 'rows', field: 'person', domain: 'name' }",
    "{ face: 'fondness', at: '__off', field: 'person', domain: '__off' }");
  const s1 = doRename(b1, { onConflict: 'rename' });
  a(fondnessSynced(r0.state) === true && fondnessSynced(s1.state) === false,
    'q2: [N1] 摘掉 fondness 规则 ⇒ 同判据翻假(引用被静默漏改,正是本项要治的病)');

  // N2 摘掉 people 顶层身份键分支 ⇒ 新身份根本不出现
  const b2 = over(MOD_REL, "if (face === 'people' && !path) {", "if (false && path) {");
  const s2 = doRename(b2, { onConflict: 'rename' });
  a(s2.im.ok === true, 'q2: [N2] 破坏副本**无异常逃逸**(ok:true ⇒ 变的是行为,不是炸了装载)');
  a(hasRenamedKey(r0.state) === true && hasRenamedKey(s2.state) === false,
    'q2: [N2] 摘掉身份键改名分支 ⇒ 新身份不出现(判据真在盯改键这一步)');

  // N3 摘掉**对象递归下潜** ⇒ 面里套的对象(fondness.meta)整棵被当冲突丢
  //    注:同一面里的数组(fondness.rows)走的是另一条分支(`appendUniq`),不受本破坏影响 ——
  //    判据因此必须打在「面里套对象」上,否则破坏与判据对不上(第一版就错在这里)。
  const b3 = over(MOD_REL, "if (isObj(cv) && isObj(iv)) { mergeRename(cv, iv, face, at); return; }",
    "if (false && isObj(cv)) { mergeRename(cv, iv, face, at); return; }");
  const s3 = doRename(b3, { onConflict: 'rename' });
  a(s3.im.ok === true, 'q2: [N3] 破坏副本**无异常逃逸**(ok:true)');
  a(nestedMerged(r0.state) === true && nestedMerged(s3.state) === false,
    'q2: [N3] 摘掉对象递归下潜 ⇒ 嵌套子面整棵丢失(来件的新键一个都进不来)');

  // N4 只改 key 不改 a/b ⇒ 行内自相矛盾(本条钉住「同批」这条设计)
  const b4 = over(MOD_REL, "const pair = [a0, b0].sort();", "const pair = [b0, a0];");
  const s4 = doRename(b4, { onConflict: 'rename' });
  a(s4.im.ok === true, 'q2: [N4] 破坏副本**无异常逃逸**(ok:true)');
  a(bondsRowConsistent(r0.state) === true && bondsRowConsistent(s4.state) === false,
    'q2: [N4] a/b 不按字典序同批落 ⇒ key 与 a/b 对不上、行内自相矛盾(判据现形)');

  // N5 摘掉「不支持即拒收」⇒ 自相矛盾的数据被硬塞进新世界
  const b5 = over(MOD_REL, "if (rec.id !== undefined && String(rec.id) !== oldId) {", "if (false) {");
  const bad = mkSnap(); bad.faces.people['p_阿澈'].id = 'p_别的';
  const s5 = doRename(b5, { onConflict: 'rename' }, null, bad);
  a(s5.im.ok === true && s5.im.reason === undefined,
    'q2: [N5] 摘掉拒收判据 ⇒ 矛盾数据被放行(判据真在拦,不是摆设;且无异常逃逸)');

  // N6 摘掉二次撞名守卫 ⇒ 二次撞名**照样落位**(本地那份被静默覆盖),_记账消失_
  //    真后果不是「叠出第三身份」:`cur[as] = inc[k]` 覆盖同名键,身份计数一直是 2。
  //    守卫保的是**如实**:撞上了要说出来,而不是把本地那份悄悄换掉。
  const GUARD = [
    "          if (Object.prototype.hasOwnProperty.call(cur, as)) {",
    "            skipped.push({ face: face, key: k, as: as, why: 'rename-collision' });",
    "            return;",
    "          }"
  ].join('\n');
  const b6 = over(MOD_REL, GUARD, "          if (false && as) {\n            return;\n          }");
  const r2o = doRename(null, { onConflict: 'rename' }, r0.state);
  const r6a = doRename(b6, { onConflict: 'rename' });
  const r6b = doRename(b6, { onConflict: 'rename' }, r6a.state);
  a(r6a.im.ok === true && r6b.im.ok === true, 'q2: [N6] 破坏副本**无异常逃逸**(ok:true)');
  a(r2o.im.ok === true && r2o.im.skipped.some(function (s) { return s.why === 'rename-collision'; })
    && !r6b.im.skipped.some(function (s) { return s.why === 'rename-collision'; }),
    'q2: [N6] 摘掉撞名守卫 ⇒ 撞名不再如实记账(本地那份被静默覆盖;实 '
      + JSON.stringify(r6b.im.skipped) + ')');
  a(Object.keys(r2o.state.people).length === 2 && Object.keys(r6b.state.people).length === 2,
    'q2: [N6] 两向自证「计数确实不变」:守卫保的是**如实**,不是身份个数(实 '
      + Object.keys(r2o.state.people).length + ' / ' + Object.keys(r6b.state.people).length + ')');

  // N8 摘掉「本地空位并进」⇒ 空位上的来件子树整棵丢(空位被当成「已有值」的冲突)
  const b8 = over(MOD_REL, "if (cv == null && iv) {", "if (false && iv) {");
  const s8 = doRename(b8, { onConflict: 'rename' });
  a(s8.im.ok === true, 'q2: [N8] 破坏副本**无异常逃逸**(ok:true)');
  a(nullSlotMerged(r0.state) === true && nullSlotMerged(s8.state) === false,
    'q2: [N8] 摘掉空位并进 ⇒ 本地为 null 的字段上,来件子树整棵丢(判据真在盯这一步)');

  // N9 摘掉容量读数里的**宿主估计**那一档 ⇒ 同判据翻假(它不是顺手多给的一个数)
  const b9 = over(MOD_REL, "      hostEstimate: actual * 2", "      __offHost: actual * 2");
  const u9 = harness({ srcOverride: b9, state: freshWorld() }).worldSnapshot.capacity(mkSnap()).seen.unit;
  const u9b = harness({ state: freshWorld() }).worldSnapshot.capacity(mkSnap()).seen.unit;
  a(u9b.hostEstimate === u9b.codeUnits * 2 && u9.hostEstimate === undefined,
    'q2: [N9] 摘掉宿主估计 ⇒ 该档读数真消失(原版 ' + u9b.hostEstimate + ' / 破坏后 ' + u9.hostEstimate + ')');
  // N10 摘掉 bonds 配对规则 ⇒ 环内引用真同步消失(B16 硬判据必须跟着翻假)
  const b10 = over(MOD_REL, "{ face: 'bonds', at: 'rows', fields: ['key', 'a', 'b'], domain: 'pair' }", "{ face: 'bonds', at: 'rows', fields: ['key', 'a', 'b'], domain: '__off' }");
  const G10a = harness({ state: cycWorld() });
  G10a.worldSnapshot.importSnapshot(cycSnap(), { onConflict: 'rename' });
  const c10a = cycSynced(G10a.__state(), 'cyc00001');
  const G10b = harness({ srcOverride: b10, state: cycWorld() });
  const i10 = G10b.worldSnapshot.importSnapshot(cycSnap(), { onConflict: 'rename' });
  const c10b = cycSynced(G10b.__state(), 'cyc00001');
  a(i10.ok === true, 'q2: [N10] 破坏副本**无异常逃逸**(ok:true)');
  a(c10a.bad.length === 0 && c10a.tagged === 3 && c10b.tagged === 1,
    'q2: [N10] 摘掉配对规则 ⇒ 环内带后缀引用从 3 掉到 1(判据真在盯同步,不是「能解析就行」;实 '
      + JSON.stringify(c10b) + ')');
  // N7 无副作用:整段负控制跑完,产品源逐字节未动、不留临时产物
  a(sha(MOD_REL) === shaAtEntry, 'q2: [N7] 负控制段全在内存副本上,产品源逐字节未被触碰');
  a(fs.readdirSync(path.join(BASE, 'tests')).filter(function (f) { return f.indexOf('.bak') >= 0; }).length === 0,
    'q2: [N7] 不留 .bak 之类的临时产物');
}

const lockAssert = require('./lock-assert.js');
module.exports = { runAll: lockAssert.restoring(runAll), runNegative: lockAssert.restoring(runNegative) };

// CLI:可独立跑(与本仓门禁同规格:命令行 / require / 自证三件齐)
if (require.main === module) {
  let pass = 0, fail = 0; const failures = [];
  const assert = function (cond, msg) {
    if (cond) { pass++; return; }
    fail++; failures.push(msg);
    console.log('  ✗ ' + msg);
  };
  console.log('■ q2-snapshot-identity-v2211(优化 Q2 专锁)');
  lockAssert.restoring(runAll)(assert);
  lockAssert.restoring(runNegative)(assert);
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fail) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }
  console.log('全部通过 ✓');
}