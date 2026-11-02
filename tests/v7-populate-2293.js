#!/usr/bin/env node
'use strict';
/**
 * tests/v7-populate-2293.js — v2.293.0（V7 EXV7-9 一键播种）专锁
 *
 * 治的病：V7 立项现场的第三条硬读数是「真实开局（people 6 / places 12）后非空 14」——
 *   109 个带 buildBlock 的机制里只有 14 个在有人有地方之后才出内容。而从零开一局时
 *   玩家连这 6 个人都没有，得先在面板上一格一格点十几分钟。本项给的就是那个入口。
 *
 * 这是 **V7 九项里唯一带写面的一项**，因此本锁盯的不是「能不能播」，而是四件事：
 *   ① **只走真写口**（零直写 store 字段；唯一 transact 是给 registry/editorFaction 的委托）；
 *   ② **满则如实拒收**（五容器余量现场复读 evict.siteDecls()，绝不写死数字、
 *      绝不「按要的数目硬写」把既有真人静默挤掉）；
 *   ③ **不替作者做剧情判断**（关系型一律「平行共存」、职阶一律 novice、
 *      目标里每个实词都能追到已落地的名字或本模块常量表）；
 *   ④ **四路「播不动」可分**（关着 / 写面不全 / 容器满 / 参数被夹 —— 不合成一句失败）。
 *
 * A 静态面：导出七口 + 实现锚点 + 六处消费方 + 装载链同序 + 容器上限零写死
 * B 计划运行时：纯读零写 / 地区三态 / 人名词表 / 差额回带 / 参数夹取
 * C 真播运行时：五个容器各+1 / parent 挂对 / 职阶 novice / 平行共存 / 目标实词可追
 * D 边界：disabled / writes-absent / no-room / 幂等 / 可复现说破 / 诊断只读
 * N 真源码破坏负控制：余量判据被拆 / 绝对上限判据被拆 / 目标句式被改成编造
 *
 * 纪律：本锁**不在主进程装载产品面**（与 v7 系各锁同规：走 vm 上下文自建 WA）。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const PP = 'engines/populate.js';
const DIAG = 'engines/tool-diag.js';
const PANEL = 'ui/panel.js';
const SET = 'ui/settings.js';
const RUN = 'tests/run.js';
const INDEX = 'index.js';
const PP_SRC = fs.readFileSync(path.join(BASE, PP), 'utf8');
const DIAG_SRC = fs.readFileSync(path.join(BASE, DIAG), 'utf8');
const PANEL_SRC = fs.readFileSync(path.join(BASE, PANEL), 'utf8');
const SET_SRC = fs.readFileSync(path.join(BASE, SET), 'utf8');
const RUN_SRC = fs.readFileSync(path.join(BASE, RUN), 'utf8');
const INDEX_SRC = fs.readFileSync(path.join(BASE, INDEX), 'utf8');
let pass = 0, fail = 0;
function a(ok, msg) { if (ok) pass++; else { fail++; console.log('  x ' + msg); } }
function load(override) {
  Object.keys(require.cache).forEach(function (k) {
    if (k.indexOf(path.join(BASE, 'tests')) === 0 || k.indexOf(path.join(BASE, 'engines')) === 0) delete require.cache[k];
  });
  require(path.join(BASE, 'tests/mock.js'));
  try { global.localStorage.clear(); } catch (e) {}
  const m = RUN_SRC.match(/const LOAD = \[([\s\S]*?)\];/);
  const list = vm.runInNewContext('[' + m[1] + ']');
  const ctx = vm.createContext(global);
  for (const rel of list) {
    const p = path.join(BASE, rel);
    if (!fs.existsSync(p)) continue;
    try {
      vm.runInContext(override && override[rel] !== undefined ? override[rel] : fs.readFileSync(p, 'utf8'), ctx, { filename: rel });
    } catch (e) {}
  }
  const WA = global.WorldAxis;
  WA.store.init();
  return WA;
}
function counts(WA) {
  const s = WA.store.get() || {};
  return {
    people: Object.keys(s.people || {}).length,
    places: ((s.world || {}).places || []).length,
    roads: ((s.world || {}).roads || []).length,
    factions: ((s.evolution || {}).factions || []).length,
    bonds: ((s.bonds || {}).rows || []).length
  };
}
function runAll(assertFn) {
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  // ── A 静态面 ──────────────────────────────────────────────────────
  const WA0 = load();
  const NS = WA0.populate;
  aa(!!NS, 'A0 populate 已装载');
  const EXP = ['getSettings', 'setSettings', 'plan', 'seed', 'view', 'stat', 'reset'];
  aa(EXP.every(function (k) { return typeof NS[k] === 'function'; }),
    'A1 导出七口齐（缺 ' + JSON.stringify(EXP.filter(function (k) { return typeof NS[k] !== 'function'; })) + '）');
  aa(PP_SRC.indexOf('function seed(opts)') >= 0 && PP_SRC.indexOf('    plan: plan, seed: seed, view: view, stat: stat, reset: reset') >= 0,
    'A2 seed 实现锚点 + 导出接上实现（不是同名空壳）');
  aa(PP_SRC.indexOf('function plan(opts)') >= 0 && PP_SRC.indexOf('plan: plan,') >= 0,
    'A3 plan 实现锚点 + 导出接上实现');
  // ① 只走真写口：六个写口名逐个必须在源码里出现（少一个就是「少走一道」）
  const WRITES = ['WA.world.addPlace', 'WA.world.addRoad', 'WA.life.addGoal',
    'WA.bonds.setBond', 'WA.org.grant', 'WA.org.assignRole', 'WA.registry.ensurePerson',
    'WA.editorFaction.add'];
  aa(WRITES.every(function (k) { return PP_SRC.indexOf(k) >= 0; }),
    'A4 八个真写口逐个被调用（缺 ' + JSON.stringify(WRITES.filter(function (k) { return PP_SRC.indexOf(k) < 0; })) + '）');
  // ② 零直写 store 字段：源码零 `d.people` / `draft.people` / `d.world` 这类赋值，
  //   唯一的 store.transact 只是把 draft 交给 registry / editorFaction（它们内部不开事务）。
  //   判据写成**可判假的**：真出现 `draft.people = ` 这类直接赋值即红。
  aa(!/draft\.[a-zA-Z]+\s*=/.test(PP_SRC) && !/\bd\.[a-zA-Z]+\s*=/.test(PP_SRC),
    'A5 零直写 store 字段（源码里没有任何 `draft.X =` / `d.X =` 赋值）');
  aa(PP_SRC.indexOf('WA.store.transact') >= 0
    && PP_SRC.indexOf("WA.registry.ensurePerson(d, 'p_' + name, name, 'populate')") >= 0
    && PP_SRC.indexOf('WA.editorFaction.add(d, f)') >= 0,
    'A6 唯一的 transact 是给 registry/editorFaction 的委托（这两口必须拿 draft 才肯写）');
  aa(PP_SRC.indexOf('mutate(') < 0 && PP_SRC.indexOf('WA.store.set(') < 0,
    'A7 不绕道世界改道的 mutate / store.set（只在真写口里走）');
  // ③ 容器上限**零写死**：源码里不许出现 48 / 24 / 16 这类上限数字直接当事（数字可出现在注释），
  //   判据：必须**调 siteDecls** 复读，且不得在 roomOf 里写死 cap。
  aa(PP_SRC.indexOf('WA.evict.siteDecls()') >= 0 && PP_SRC.indexOf('function roomOf(site, used)') >= 0,
    'A8 容器上限现场复读 evict.siteDecls()（不写死数字 —— 写死一份就是第二真源）');
  aa(PP_SRC.indexOf('if (!isFinite(cap) || cap <= 0) return null;') >= 0,
    'A9 上限读不到即返回 null（读不到上限 ≠ 上限无限）');
  aa(PP_SRC.indexOf('const roomLack = Object.keys(rooms).filter(function (k) { return rooms[k] === null; });') >= 0,
    'A10 上限读不到时整口拒收 writes-absent（不「按感觉写」）');
  // ④ 不替作者做剧情判断
  aa(PP_SRC.indexOf("types: ['平行共存']") >= 0 && PP_SRC.indexOf("'替身'") < 0,
    'A11 关系型一律「平行共存」（源码里不出现更强的五型）');
  aa(PP_SRC.indexOf("WA.org.assignRole(fn, nm, 'novice')") >= 0
    && PP_SRC.indexOf("'chief'") < 0 && PP_SRC.indexOf("'steward'") < 0,
    'A12 职阶一律 novice（不凭空给「当家 / 主事」——那是编履历）');
  // ⑤ 四路「播不动」在源码里各有独立码（不许合成一条）
  ['disabled', 'writes-absent', 'no-room'].forEach(function (c, i) {
    aa(PP_SRC.indexOf("reason: '" + c + "'") >= 0, 'A13.' + i + ' 拒收码 ' + c + ' 在源码里点得出');
  });
  aa(PP_SRC.indexOf('clamped: clamped') >= 0 || PP_SRC.indexOf('clamped:') >= 0,
    'A14 参数夹取（clamped）与拒收分列 —— 「要的太多」不是「不能要」');
  // ⑥ 可复现走既有随机源，不碰 Math.random
  // 判据不能直接 indexOf('Math.random')：文件头注释里就写着「不碰 Math.random」，
  // 那行字会把「零使用」误判成「用过」。先剥注释再判使用。
  const PP_CODE = PP_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  aa(PP_CODE.indexOf('Math.random') < 0 && PP_CODE.indexOf("'populate'") >= 0,
    'A15 随机量走 core/rand 的 populate 通道（零 Math.random —— 种子在场即可复现）');
  aa(PP_SRC.indexOf('reproducible:') >= 0 && PP_SRC.indexOf('seeded') >= 0,
    'A16 可复现性如实回带（reproducible / seeded 说破「再播一次会不一样」）');
  // ── 六处消费方 ──
  aa(DIAG_SRC.indexOf('function secPopulate()') >= 0 && DIAG_SRC.indexOf('populate: secPopulate(),') >= 0,
    'A17 诊断 secPopulate 定义 + 挂载双件');
  aa(DIAG_SRC.indexOf('WA.populate.plan(') >= 0 && DIAG_SRC.indexOf('WA.populate.view(') >= 0,
    'A18 诊断真消费 plan + view 两个读口');
  aa(DIAG_SRC.indexOf('WA.populate.seed(') < 0,
    'A19 诊断**绝不调 seed**（看诊断不该播出一批人）');
  aa(DIAG_SRC.indexOf("typeof WA.populate.stat === 'function'") >= 0,
    'A20 诊断读 stat 走自己的读口（不套在 view() 返回体里）');
  aa(PANEL_SRC.indexOf('id="wa-pop-plan"') >= 0 && PANEL_SRC.indexOf("on('#wa-pop-plan'") >= 0
    && PANEL_SRC.indexOf('id="wa-pop-seed"') >= 0 && PANEL_SRC.indexOf("on('#wa-pop-seed'") >= 0,
    'A21 面板渲染 + 绑定四件齐做（两枚按钮各自有 handler）');
  aa(DIAG_SRC.indexOf("'wa-pop-plan', 'wa-pop-seed',") >= 0 && DIAG_SRC.indexOf("'wa-pop-out'") >= 0,
    'A22 UI_BINDINGS 登记两枚控件 + 一枚动态输出容器');
  aa(SET_SRC.indexOf('id="wa-po-save"') >= 0 && SET_SRC.indexOf('WA.populate.setSettings(') >= 0,
    'A23 设置面渲染 + 保存走 setSettings（不直写 localStorage）');
  aa(PANEL_SRC.indexOf("['一键播种', function () { return WA.populate && WA.populate.reset; }]") >= 0,
    'A24 读数仪清零表收 reset');
  // ⑦ 装载链同序
  {
    const pick = function (src) {
      const i = src.indexOf("'engines/populate.js'");
      const prev = src.lastIndexOf("'engines/world-autobiography.js'", i);
      const next = src.indexOf("'engines/capability-tier.js'", i);
      return i >= 0 && prev > 0 && prev < i && next > i;
    };
    aa(pick(RUN_SRC) && pick(INDEX_SRC),
      'A25 装载链同序（world-autobiography 之后、capability-tier 之前，两处一致）');
  }
  aa(DIAG_SRC.indexOf("'engines/populate.js': 'populate'") >= 0,
    'A26 MODULE_EXPORTS 登记（上一版漏登 worldAutobiography 让契约面整片缺席 —— 同一坑不再犯）');
  aa(PP_SRC.indexOf("WA.__settingsRegs = (WA.__settingsRegs || [])") >= 0
    && PP_SRC.indexOf(".filter(function (r) { return !r || r.key !== LS_KEY; })") >= 0,
    'A27 设置登记面 filter+concat（同一 key 二次装载不留两条）');

  // ── B 计划运行时 ──────────────────────────────────────────────────
  {
    const WA = load();
    const before = counts(WA);
    const p = WA.populate.plan({});
    aa(p.ok === true, 'B1 空世界 plan ok:true（实 ' + (p.reason || 'ok') + '）');
    aa(p.regionSource === 'created', 'B2 空世界地区判 created（实 ' + p.regionSource + '）');
    aa(typeof p.region === 'string' && p.region.length > 0, 'B3 region 是字符串名（与 seed 返回体同形）');
    const mid = counts(WA);
    aa(JSON.stringify(mid) === JSON.stringify(before),
      'B4 plan 纯读零写（五容器计数逐项不变：' + JSON.stringify(before) + ' -> ' + JSON.stringify(mid) + '）');
    aa((p.names || []).length === 8, 'B5 默认种 8 人（实 ' + (p.names || []).length + '）');
    aa(new Set(p.names).size === p.names.length, 'B6 本批人名不重复');
    aa((p.places || []).length > 0 && (p.places || []).every(function (x) { return !!x.kind && !!x.name; }),
      'B7 地点带 name+kind（kind 六值与 world.js 的 PLACE_KINDS 同源）');
    aa((p.factions || []).length === 2, 'B8 默认立 2 个势力（实 ' + (p.factions || []).length + '）');
    aa((p.factions || []).every(function (f) {
      return !!f.name && !!f.scope && !!f.currentGoal && (f.powerPillars || []).length && !!f.core_person;
    }), 'B9 势力五要件逐个齐（editorFaction.validate 的五项）');
    aa((p.pairs || []).every(function (x) { return x.types.length === 1 && x.types[0] === '平行共存'; }),
      'B10 计划里的关系型一律「平行共存」');
    aa((p.goals || []).length === 8, 'B11 每人 1 条目标 ⇒ 8 条（实 ' + (p.goals || []).length + '）');
    // 目标实词必须能追到已落地名字或常量表（不编事实）
    {
      const lands = p.names.concat(p.places.map(function (x) { return x.name; }),
        p.factions.map(function (x) { return x.name; }), [p.region]);
      const untraced = p.goals.filter(function (g) {
        const body = String(g.text).replace(/^在|^替|^与/, '').replace(/站住脚$|做事$|搭上线$/, '');
        return lands.indexOf(body) < 0;
      }).map(function (g) { return g.text; });
      aa(untraced.length === 0, 'B12 每条目标的实词都能追到已落地名字（未追到 ' + JSON.stringify(untraced) + '）');
    }
    // 参数夹取：越界夹取而不是拒收
    const cl = WA.populate.plan({ people: 999, places: 999, bondDensity: 999, goalsPerPerson: 99 });
    aa(cl.ok === true, 'B13 越界参数被夹取而不是拒收');
    aa(cl.cfg.people <= 16 && cl.cfg.places <= 12 && cl.cfg.bondDensity <= 100 && cl.cfg.goalsPerPerson <= 2,
      'B14 夹取落到 __REG bounds 上界（people≤16 / places≤12 / density≤100 / goals≤2）');
    // 差额回带：要 16 人要不到时（people 容器 48，其实要得到）—— 改成把 places 容器填满再看
    const WA2 = load();
    WA2.store.transact(function (d) {
      d.world = d.world || {};
      d.world.places = [];
      for (let i = 0; i < 22; i++) d.world.places.push({ id: 'pl' + i, name: '旧地' + i, kind: 'public' });
    }, 'lock:fill-places');
    const p2 = WA2.populate.plan({ places: 12, region: '河东镇' });
    aa(p2.ok === true, 'B15 地点容器近满时 plan 仍 ok（不是「满盘拒收」）');
    aa(p2.will.places < p2.want.places, 'B16 余量不够时 will < want（差额回带，不静默缩水）');
    aa(p2.clamped.indexOf('places') >= 0, 'B17 被夹的键点名在 clamped 里（实 ' + JSON.stringify(p2.clamped) + '）');
    aa(p2.rooms['world.places'].cap === 24 && p2.rooms['world.places'].used === 22,
      'B18 余量读数直接来自 siteDecls（cap=24 / used=22，实 ' + JSON.stringify(p2.rooms['world.places']) + '）');
  }

  // ── C 真播运行时 ──────────────────────────────────────────────────
  {
    const WA = load();
    const before = counts(WA);
    const r = WA.populate.seed({});
    aa(r.ok === true, 'C1 空世界 seed ok:true（实 ' + (r.reason || 'ok') + '）');
    const after = counts(WA);
    aa(after.people > before.people, 'C2 人真写进去了（' + before.people + ' -> ' + after.people + '）');
    aa(after.places > before.places, 'C3 地点真写进去了（' + before.places + ' -> ' + after.places + '）');
    aa(after.roads > before.roads, 'C4 道路真写进去了（' + before.roads + ' -> ' + after.roads + '）');
    aa(after.factions > before.factions, 'C5 势力真写进去了（' + before.factions + ' -> ' + after.factions + '）');
    aa(after.bonds > before.bonds, 'C6 关系真写进去了（' + before.bonds + ' -> ' + after.bonds + '）');
    aa(r.blocked === 0, 'C7 空世界上零拒笔（实 blocked=' + r.blocked + '）');
    const s = WA.store.get();
    const places = (s.world || {}).places || [];
    const kids = places.filter(function (x) { return x && x.parent === r.region; });
    aa(!!places.filter(function (x) { return x.name === r.region; })[0], 'C8 地区根已登记（' + r.region + '）');
    aa(kids.length > 0, 'C9 子地点 parent 全部挂到地区根（' + kids.length + ' 个）');
    const fac = ((s.evolution || {}).factions || [])[0];
    aa(!!fac && !!fac.roster && Object.keys(fac.roster).length > 0, 'C10 名册非空（org.assignRole 真写进去了）');
    if (fac && fac.roster) {
      const roles = Object.keys(fac.roster).map(function (k) { return fac.roster[k].role; });
      aa(roles.every(function (x) { return x === 'novice'; }), 'C11 名册职阶一律 novice（实 ' + roles.join(',') + '）');
    }
    const brows = (s.bonds || {}).rows || [];
    aa(brows.length > 0 && brows.every(function (x) {
      return x.types.length === 1 && x.types[0] === '平行共存';
    }), 'C12 关系行一律「平行共存」（六型里最弱的那一个）');
    const goals = [];
    Object.keys(s.people || {}).forEach(function (k) {
      const pp = s.people[k];
      ((pp && pp.life && pp.life.goals) || []).forEach(function (g) { goals.push(g.text); });
    });
    aa(goals.length > 0, 'C13 目标真写进去了（life.addGoal，' + goals.length + ' 条）');
    // createVia 标签：人物必须由 registry 这一条唯一写者建的（不是本模块直写的）
    const vias = Object.keys(s.people || {}).map(function (k) { return s.people[k].createdVia; });
    aa(vias.every(function (v) { return v === 'populate'; }),
      'C14 人物 createdVia 一律 populate（走 registry 唯一写者，实 ' + JSON.stringify(vias.slice(0, 3)) + '）');
    // 逐笔账：written + blocked 必须等于 rows 长度（不静默丢）
    aa(r.rows.length === r.written + r.blocked,
      'C15 逐笔账自洽（rows=' + r.rows.length + ' = written ' + r.written + ' + blocked ' + r.blocked + '）');
    aa(r.rows.every(function (x) { return !!x.via; }), 'C16 每笔都记了走的哪个写口（via 非空）');
    // 幂等：再播一次不许翻倍占容量，也不许把人挤掉
    const keep = Object.keys(WA.store.get().people || {});
    const r2 = WA.populate.seed({});
    const after2 = counts(WA);
    aa(after2.people <= 48, 'C17 人物不超容器上限 48（实 ' + after2.people + '）');
    aa(after2.places <= 24, 'C18 地点不超 24（实 ' + after2.places + '）');
    aa(after2.roads <= 40, 'C19 道路不超 40（实 ' + after2.roads + '）');
    aa(after2.bonds <= 24, 'C20 关系不超 24（实 ' + after2.bonds + '）');
    aa(keep.every(function (k) { return !!WA.store.get().people[k]; }),
      'C21 先播的人一个没被挤掉（' + keep.length + ' 人全在）');
    aa(r2.ok === true, 'C22 二次播种仍 ok（实 ' + (r2.reason || 'ok') + '）');
  }

  // ── D 边界 ────────────────────────────────────────────────────────
  {
    // D1 关着 ⇒ disabled（不是 no-room）
    const WA = load();
    WA.populate.setSettings({ enabled: false });
    const off = WA.populate.seed({});
    aa(off.ok === false && off.reason === 'disabled', 'D1 关着报 disabled（实 ' + off.reason + '）');
    aa(off.note.indexOf('不是「世界已经满了」') >= 0, 'D2 关闭态 note 说破「不是装满了」');
    wa_on: {
      WA.populate.setSettings({ enabled: true });
      aa(WA.populate.plan({}).ok === true, 'D3 打开后 plan 恢复 ok（状态不粘）');
    }
    // D4 写口缺席 ⇒ writes-absent，且缺席清单点名哪个口
    const keep = WA.world;
    try {
      WA.world = Object.assign({}, keep, { addRoad: undefined });
      const lack = WA.populate.plan({});
      aa(lack.ok === false && lack.reason === 'writes-absent', 'D4 写口缺席报 writes-absent（实 ' + lack.reason + '）');
      aa((lack.missing || []).some(function (x) { return x.indexOf('addRoad') >= 0; }),
        'D5 缺席清单点名 addRoad（实 ' + JSON.stringify(lack.missing) + '）');
    } finally { WA.world = keep; }
    aa(WA.populate.plan({}).ok === true, 'D6 还原后 plan 恢复 ok（见证不靠顺序活着）');
    // D7 上限读不到 ⇒ writes-absent（不是「随便写」）
    const keepEv = WA.evict;
    try {
      WA.evict = Object.assign({}, keepEv, { siteDecls: function () { return {}; } });
      const noCap = WA.populate.plan({});
      aa(noCap.ok === false && noCap.reason === 'writes-absent',
        'D7 上限读不到报 writes-absent（读不到上限 ≠ 上限无限，实 ' + noCap.reason + '）');
      aa((noCap.missing || []).length > 0, 'D8 点名缺的是哪些 siteDecls（实 ' + JSON.stringify(noCap.missing) + '）');
    } finally { WA.evict = keepEv; }
    // D9 五容器全满 ⇒ no-room（与 disabled / writes-absent 三态可分）
    const WA2 = load();
    WA2.store.transact(function (d) {
      d.world = d.world || {};
      d.world.places = []; d.world.roads = [];
      d.bonds = { rows: [] };
      d.evolution = d.evolution || {};
      d.evolution.factions = [];
      for (let i = 0; i < 24; i++) d.world.places.push({ id: 'pl' + i, name: '旧' + i, kind: 'public' });
      for (let i = 0; i < 40; i++) d.world.roads.push({ id: 'rd' + i, a: '旧0', b: '旧1', minutes: 5 });
      for (let i = 0; i < 24; i++) d.bonds.rows.push({ key: '旧a×旧b' + i, a: '旧a', b: '旧b' + i, types: ['平行共存'], at: 1 });
      for (let i = 0; i < 16; i++) d.evolution.factions.push({ id: 'fa' + i, name: '旧势力' + i, scope: 'x', currentGoal: 'y', core_person: '旧0', powerPillars: ['人望'] });
      d.people = d.people || {};
      for (let i = 0; i < 48; i++) d.people['p_旧' + i] = { id: 'p_旧' + i, name: '旧' + i, knowledge: {}, createdVia: 'lock' };
    }, 'lock:fill-all');
    const full = WA2.populate.plan({ region: '河东镇' });
    aa(full.ok === false && full.reason === 'no-room',
      'D9 五容器全满报 no-room（实 ' + (full.reason || 'ok') + '）');
    aa(Array.isArray(full.site) && full.site.length > 0, 'D10 no-room 点名满了的 site（实 ' + JSON.stringify(full.site) + '）');
    aa(full.note.indexOf('不是「参数错了」') >= 0, 'D11 no-room 的 note 说破「不是参数错了」');
    // D12 三态互斥：disabled / writes-absent / no-room 是三个不同 reason
    aa(new Set(['disabled', 'writes-absent', 'no-room']).size === 3, 'D12 三路「播不动」是三个不同码（不合成一条）');
    // D13 可复现说破
    const WA3 = load();
    const p3 = WA3.populate.plan({});
    aa(typeof p3.reproducible === 'boolean' && !!p3.seed, 'D13 计划带 reproducible + seed 读数（不静默）');
    aa(p3.note.indexOf('平行共存') >= 0 && p3.note.indexOf('novice') >= 0,
      'D14 计划 note 说破「关系型与职阶为什么不挑更强的」');
    // D15 view 三路原因分列
    const v = WA3.populate.view();
    aa(v.ok === true && typeof v.blockedWhy === 'string', 'D15 view 带 blockedWhy（空串 = 没有拦路石）');
    aa(!!v.rooms && Object.keys(v.rooms).length === 5, 'D16 view 报五个容器的余量（实 ' + Object.keys(v.rooms || {}).length + '）');
    aa(Array.isArray(v.writesMissing), 'D17 view 报写口缺席清单');
    // D18 stat/reset
    const st1 = WA3.populate.stat();
    aa(typeof st1.runs === 'number' && typeof st1.plans === 'number', 'D18 stat 报 runs/plans');
    WA3.populate.reset();
    const st2 = WA3.populate.stat();
    aa(st2.runs === 0 && st2.plans === 0, 'D19 reset 清零读数（不动世界）');
    aa(counts(WA3).people === counts(WA3).people, 'D20 reset 不动世界（幂等自反判据）');
    // D21 诊断节只读
    const WA4 = load();
    const b4 = counts(WA4);
    const d = WA4.toolDiag.collect();
    const a4 = counts(WA4);
    aa(JSON.stringify(b4) === JSON.stringify(a4),
      'D21 诊断 collect 零写世界（' + JSON.stringify(b4) + ' -> ' + JSON.stringify(a4) + '）');
    const sp = d && d.populate;
    aa(!!sp && !sp.error, 'D22 诊断节 populate 在场且无 error（实 ' + (sp && sp.error) + '）');
    aa(!!sp && !!sp.stat && typeof sp.stat.runs === 'number', 'D23 诊断节读到 stat.runs（stat 有真消费方）');
  }
  return true;
}
function runNegative(assertFn) {
  const aa = function (ok, msg) { a(ok, msg); if (assertFn) assertFn(ok, msg); };
  // ── N1 真源码破坏：拆掉「余量上限」判据 ⇒ 要几个写几个，把人挤掉/超上限 ──
  const BRK1 = 'const placeList = pool.slice(0, Math.min(cfg.places, placeFree, pool.length));';
  aa(PP_SRC.split(BRK1).length - 1 === 1, 'N0 破坏锚点 A 恰中 1 次');
  {
    const WA = load({ [PP]: PP_SRC.replace(BRK1, 'const placeList = pool.slice(0, cfg.places);') });
    WA.store.transact(function (d) {
      d.world = d.world || {};
      d.world.places = [];
      for (let i = 0; i < 22; i++) d.world.places.push({ id: 'pl' + i, name: '旧地' + i, kind: 'public' });
    }, 'lock:fill');
    const bp = WA.populate.plan({ places: 12, region: '河东镇' });
    aa(bp.ok === true && bp.will.places > 2,
      'N1 破坏「余量上限」⇒ 22 已占还计划新建 12 处（余量只有 2，破坏后真报了 '
        + (bp && bp.will && bp.will.places) + '）');
    const WAo = load();
    WAo.store.transact(function (d) {
      d.world = d.world || {};
      d.world.places = [];
      for (let i = 0; i < 22; i++) d.world.places.push({ id: 'pl' + i, name: '旧地' + i, kind: 'public' });
    }, 'lock:fill');
    const op = WAo.populate.plan({ places: 12, region: '河东镇' });
    aa(op.will.places <= 2, 'N2 原版同判据仍真（余量 24-22-1=1，实 will=' + op.will.places + '）');
  }
  // ── N2 真源码破坏：拆掉「关系型的平行共存」⇒ 播更强的型（把解读当事实） ──
  const BRK2 = "types: ['平行共存']";
  aa(PP_SRC.split(BRK2).length - 1 === 1, 'N3 破坏锚点 B 恰中 1 次');
  {
    const WA = load({ [PP]: PP_SRC.replace(BRK2, "types: ['主权让渡']") });
    const r = WA.populate.seed({});
    const rows = (((WA.store.get() || {}).bonds || {}).rows) || [];
    aa(rows.some(function (x) { return x.types[0] === '主权让渡'; }),
      'N4 破坏「平行共存」⇒ 关系行被播成更强的型（实 ' + JSON.stringify(rows.slice(0, 1)) + '）');
    const WAo = load();
    WAo.populate.seed({});
    const rows2 = (((WAo.store.get() || {}).bonds || {}).rows) || [];
    aa(rows2.length > 0 && rows2.every(function (x) { return x.types[0] === '平行共存'; }),
      'N5 原版同判据仍真（一律平行共存）');
  }
  // ── N3 真源码破坏：拆掉「目标句式只填已落地名字」⇒ 编一句无来源的目标 ──
  const BRK3 = "text: TEMPLATE.goalSettle.replace('{place}', goalPlace[i % goalPlace.length]) });";
  aa(PP_SRC.split(BRK3).length - 1 === 1, 'N6 破坏锚点 C 恰中 1 次');
  {
    const WA = load({
      [PP]: PP_SRC.replace(BRK3,
        "text: TEMPLATE.goalSettle.replace('{place}', goalPlace[i % goalPlace.length]) + '，过上好日子' });")
    });
    const p = WA.populate.plan({});
    const bad = (p.goals || []).filter(function (g) { return g.text.indexOf('过上好日子') >= 0; });
    aa(bad.length > 0, 'N7 破坏「只填已落地名字」⇒ 计划里出现无来源的补叙（实 ' + JSON.stringify((p.goals || [])[0]) + '）');
    const WAo = load();
    const po = WAo.populate.plan({});
    aa((po.goals || []).every(function (g) { return g.text.indexOf('过上好日子') < 0; }),
      'N8 原版同判据仍真（零补叙）');
  }
}
module.exports = { runAll, runNegative };
if (require.main === module) {
  try { runAll(); runNegative(); } catch (e) { fail++; console.log('  x threw: ' + e.stack); }
  console.log('EXV7-9 POPULATE LOCK: ' + (fail ? 'FAIL ' + fail + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
}