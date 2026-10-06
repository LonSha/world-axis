#!/usr/bin/env node
// v2.155.0 RX8 专锁：世界生成种子库（engines/world-seed.js）
//   它锁的判据：
//     ① 种子**只装骨头**（白名单四结构面；编年史/暗流/回声/章节/世界事实/记忆一律不得进种子）；
//     ② 签名**只由结构面决定**（不含 at/时间戳）—— 否则「同格局两局」永远去不了重；
//     ③ 四张表全空 ⇒ **不产空种子**（空种子播种出来的是空世界，与「还没开局」在读数上不可分）；
//     ④ 写口**只写自己那一格**（一次 transact、只动 worldSeed.library）；
//     ⑤ 播种**不写世界**（sow 只返回计划，progress 全零 + zeroProgress）；
//     ⑥ 变异度越界拒 `bad-value`（**不静默夹住** —— 「你要的变异度」与「真发生的」长得一样是最坏的读数）；
//     ⑦ 环上限走 evict 单一出口且与 libCap 设置同源（per-call）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/world-seed.js';
const SELF_REL = 'tests/world-seed-v2155.js';

// 锚点一取「四表全空即拒收」这一行：它是**防空种子闸门** —— 丢了它，
//   一个还没开局的空世界也能被存成种子，播种出来是个空世界，而它在读数上与「新局」一模一样。
const ANCHOR = "    if (empty) { note('nothing-to-extract'); return { ok: false, reason: 'nothing-to-extract' }; }";
// 锚点二取**签名输入面**。它多了 `at` 就恒变、少了 `era.label` 就把两个时代混成一个：
//   去重判据的输入面错一格，库里要么全是重复、要么全是误合并，两种都不报错。
const ANCHOR2 = "    const canon = JSON.stringify({ powers: raw.powers, network: raw.network, geo: raw.geo, era: raw.era.label });";
// 锚点三取**进度归零**这一行：它是「开新局」与「读旧档」的分界线。
//   v2.158.0（S3）：initPreview 也**必须**声明同一行（预览要如实告知「将写入的进度面是零」），
//   故本锚点由「恰 1 次」升级为「恰 2 次，且分别落在 sow 与 initPreview 内」——
//   这是**更强**的一致性要求：预览与播种对进度面的口径一旦分家，
//   「玩家看到的计划」与「真装上的世界」就在同一个读数上不可分。
const ANCHOR3 = "      progress: { round: 0, chronicle: 0, currents: 0, echoes: 0 },";
// 锚点四取变异度**越界拒收**：夹住与拒收在调用方看来是同一个返回值，
//   而玩家以为按自己要的变异度播了种。
//   v2.158.0（S3）：initPreview 同样要拒收越界变异度（预览与确认必须同一口径），
//   故本锚点由「恰 1 次」升级为「恰 2 次，且分别落在 sow 与 initPreview 内」。
const ANCHOR4 = "      if (n === null || n < VARIANCE.min || n > VARIANCE.max) {";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }

function on(WA) {
  WA.store.init();
  WA.worldSeed.setSettings({ enabled: true, libCap: 12 });
}

/** 造一个有格局的世界（只动结构面，不动进度面）。keepLib=true 时**不动**种子库。
 *    为什么需要这个开关：初版每次造世界都把库清空（`worldSeed = { library: [], seq: 0 }`），
 *    于是「库满」永远造不出来 —— 每个新格局进来前库都被重置了。夹具自己把被测条件抹掉了。 */
function bones(WA, tag, keepLib) {
  WA.store.transact(function (d) {
    if (!keepLib) d.worldSeed = { library: [], seq: 0 };
    d.evolution = Object.assign({}, d.evolution, { factions: [
      { id: 'f1', name: tag + '甲势力', power: 30 },
      { id: 'f2', name: tag + '乙势力', power: 18 }] });
    d.people = {
      p1: { id: 'p1', name: tag + '甲人', profile: { relations: [{ target: 'p2', intimacy: 80 }] } },
      p2: { id: 'p2', name: tag + '乙人', profile: null }
    };
    d.world = Object.assign({}, d.world, { places: [{ id: 'pl1', name: tag + '甲城' }], roads: [{ id: 'r1' }] });
    d.background = Object.assign({}, d.background, { text: tag + '乱世之初。\n第二行不进 title。' });
    // 进度面故意塞脏：它们**一丝都不得进种子**（这是本版最贵的一条边界）。
    d.chronicle = [{ id: 'ch1', title: tag + '不该进种子的事', at: 7 }];
    d.currents = [{ id: 'cu1', title: tag + '不该进种子的暗流' }];
    d.echoes = [{ id: 'ec1', title: tag + '不该进种子的回声' }];
  }, 'world-seed-v2155:bones');
}

// ── A 结构面 ──────────────────────────────────────────────────────────
function runA(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(countOcc(src, ANCHOR) === 1, 'v2155/ws A1: 四表全空即拒收锚点恰中 1 次（实 ' + countOcc(src, ANCHOR) + '）');
  a(countOcc(src, ANCHOR2) === 1, 'v2155/ws A2: 签名输入面锚点恰中 1 次（实 ' + countOcc(src, ANCHOR2) + '）');
  // v2.158.0（S3）：两条锚点各**恰中 2 次** —— 播种（sow）与初始化预览（initPreview）各一处。
  //   判据从「唯一」升级为「两处同口径」：预览与播种对同一个量的处置一旦分家，
  //   「预览时看到的计划」与「确认后真装上的世界」就不可分了。
  a(countOcc(src, ANCHOR3) === 2, 'v2155/ws A3: 播种进度归零锚点恰中 2 次（sow 与 initPreview 各一处；实 ' + countOcc(src, ANCHOR3) + '）—— 预览与播种必须同口径');
  a(countOcc(src, ANCHOR4) === 2, 'v2155/ws A4: 变异度越界拒收锚点恰中 2 次（sow 与 initPreview 各一处；实 ' + countOcc(src, ANCHOR4) + '）—— 越界拒收不得在一处夹住、另一处拒收');
  // 归属可核：两次命中必须**分别**落在两个函数体内（不是同一函数里写了两遍 —— 那只是重复代码）。
  const bSow = src.indexOf('function sow(');
  const bPrev = src.indexOf('function initPreview(');
  const bStat = src.indexOf('function statOf(');
  a(bSow > 0 && bPrev > bSow && bStat > bPrev,
    'v2155/ws A3b-0: 三个函数边界都在场（sow / initPreview / statOf 实 '
    + [bSow, bPrev, bStat].join('/') + '）');
  const inSow3 = src.indexOf(ANCHOR3, bSow) >= 0 && src.indexOf(ANCHOR3, bSow) < bPrev;
  const inPrev3 = src.indexOf(ANCHOR3, bPrev) >= 0 && src.indexOf(ANCHOR3, bPrev) < bStat;
  const inSow4 = src.indexOf(ANCHOR4, bSow) >= 0 && src.indexOf(ANCHOR4, bSow) < bPrev;
  const inPrev4 = src.indexOf(ANCHOR4, bPrev) >= 0 && src.indexOf(ANCHOR4, bPrev) < bStat;
  a(inSow3 && inPrev3 && inSow4 && inPrev4,
    'v2155/ws A3b: 两条锚点的两次命中分别落在 sow 与 initPreview 内（不是同一函数写两遍）—— 实 sow '
    + (inSow3 ? 'A3✓' : 'A3✗') + '/' + (inSow4 ? 'A4✓' : 'A4✗')
    + ' · initPreview ' + (inPrev3 ? 'A3✓' : 'A3✗') + '/' + (inPrev4 ? 'A4✓' : 'A4✗'));
  a(src.indexOf("WA.registerModule('engines/world-seed.js'") >= 0, 'v2155/ws A5: 模块自报登记');
  a(src.indexOf('__settingsRegs = (WA.__settingsRegs || []).concat([__REG])') >= 0,
    'v2155/ws A6: 设置键走 __settingsRegs 登记（自检可见，不是黑盒）');
  // 边界 2 的**结构事实**（v2.158.0 更新）：
  //   v2.155.0 时全模块只有一个 transact —— 那是**当版的事实**，不是永久承诺。
  //   v2.158.0（S3）的 initConfirm 必须写目标世界的骨架（把种子装进空新局，那是它的职责），
  //   故有第二个事务。判据因此升级为**更强**的结构事实：
  //     ① 种子库写口恰一处（事务名 worldSeed:library，只动 worldSeed 桶）；
  //     ② 初始化确认恰一处（事务名 worldSeed:initConfirm，只写目标世界骨架）；
  //     ③ 除这两处外**再无第三个** transact 调用点 —— 新增写面必须显式改本判据，不许静默长出。
  a(countOcc(src, 'WA.store.transact(') === 2 && countOcc(src, '.transact(') === 2,
    'v2155/ws A7: 全模块恰两处 transact 调用点（种子库写口 + 初始化确认；实 ' + countOcc(src, '.transact(')
    + '）—— 新增第三处写面必须显式改本判据，不许静默长出');
  // v2.162.0 修（判据锚点归位）：原判据数的是**字面量出现次数**，而 v2.159.0 起
  //   `'worldSeed:initConfirm'` 同时在 settleAsync 的站点名上露面一次（同一个名字被如实复用
  //   是正当的）⇒「恰 1 次」恒假 —— 实测第二趟起本项恒红，与产品行为无关。
  //   判据本义是「两处写口各有**显式事务名**、互不复用」，故锚到事务调用的**语句尾部**
  //   （`}, 'worldSeed:xxx');`），即该名字作为 store.transact 第二参出现的那一次：
  //   两处共用同一个名字 ⇒ 命中 2 次（红）；有人干脆不传事务名 ⇒ 命中 0 次（红）。
  a(countOcc(src, "}, 'worldSeed:library');") === 1 && countOcc(src, "}, 'worldSeed:initConfirm');") === 1,
    'v2155/ws A7b: 两个事务各有**显式事务名**且互不复用（事务名就是审计面上那个「谁改过世界」；'
    + '锚事务调用尾部，实 ' + countOcc(src, "}, 'worldSeed:library');") + '/'
    + countOcc(src, "}, 'worldSeed:initConfirm');") + '）');
  const txn = src.slice(src.indexOf('function doWrite'), src.indexOf('function doWrite') + 400);
  a(txn.indexOf("fn(bucket(root))") >= 0 && txn.indexOf("'worldSeed:library'") >= 0,
    'v2155/ws A8: 那个事务名是显式的 worldSeed:library（事务名就是审计面上那个「谁改过世界」）');
  // 骨架之外的世界面一律不写：断言源码里**没有**任何 d.people / d.chronicle 赋值。
  a(countOcc(src, 'd.people') === 1 && countOcc(src, 'd.chronicle') === 1,
    'v2155/ws A9: 全模块 d.people / d.chronicle 各只出现在文件头注释里（零赋值点）');
  a(src.indexOf("'worldSeed.library', cfg.libCap") >= 0,
    'v2155/ws A10: 环上限走 evict 单一出口且把 libCap **per-call 传进去**（静态登记 cap 而设置另有一套 = 点了没效果的开关）');
  a(src.indexOf("excluded: ['chronicle', 'currents', 'echoes', 'chapters', 'worldFacts', 'memory']") >= 0,
    'v2155/ws A11: extract 返回体如实申明**不含**哪些面（读的人不必去猜边界在哪）');
  const self = fs.readFileSync(path.join(BASE, SELF_REL), 'utf8');
  a(countOcc(self, ANCHOR) >= 1 && countOcc(self, ANCHOR2) >= 1 && countOcc(self, ANCHOR3) >= 1 && countOcc(self, ANCHOR4) >= 1,
    'v2155/ws A12: 四个锚点在本文件里至少各引用 1 次');
}

// ── B 运行时 ──────────────────────────────────────────────────────────
function runB(a) {
  const WA = fresh();
  on(WA);
  const Ws = WA.worldSeed;
  a(!!Ws && typeof Ws.extract === 'function' && typeof Ws.save === 'function' && typeof Ws.get === 'function'
    && typeof Ws.list === 'function' && typeof Ws.drop === 'function' && typeof Ws.sow === 'function'
    && typeof Ws.stat === 'function' && Ws.SEED_VER === 1 && Object.keys(Ws.VARIANCE).length === 2,
    'v2155/ws B1: extract/save/get/list/drop/sow/stat 七出口 + 种子版本 + 变异度闭区间在场');

  // B2 总开关：关闭态一并拒收（不是「提取到空的」）
  Ws.setSettings({ enabled: false });
  a(Ws.extract().reason === 'disabled' && Ws.save('x').reason === 'disabled',
    'v2155/ws B2: 关闭后提取与保存一并拒收（disabled）—— 「关掉了」与「没格局可提」必须分得开');
  Ws.setSettings({ enabled: true });

  // B3 四表全空 ⇒ 不产空种子（本版点名要防的第一类伪装）
  WA.store.init();
  // v2.155.0 收口（全量回归当场抓到，单跑专锁时是绿的）：本判据要在「四张结构表全空」上成立，
  //   而原夹具只重置了 worldSeed 一格 —— 单跑时 store 本来就是白的，全量回归里前面几百个
  //   块已经把 evolution.factions / people / world.places / background.text 写满了，
  //   于是 extract 照实报 extracted、判据红。**夹具依赖了全局状态干净**，这是夹具的错，
  //   不是被测代码的错。夹具必须自己把前置条件摆出来（与 bones() 造格局同一口径）。
  WA.store.transact(function (d) {
    d.worldSeed = { library: [], seq: 0 };
    d.evolution = Object.assign({}, d.evolution, { factions: [] });
    d.people = {};
    d.world = Object.assign({}, d.world, { places: [], roads: [] });
    d.background = Object.assign({}, d.background, { text: '' });
    d.clock = Object.assign({}, d.clock, { label: '' });
  }, 'world-seed-v2155:blank');
  const blank = WA.store.get();
  const rawBlank = JSON.stringify(blank);
  a(Ws.extract().reason === 'nothing-to-extract', 'v2155/ws B3: 四张结构表全空 ⇒ nothing-to-extract（空种子播种出来的是空世界）');
  a(JSON.stringify(WA.store.get()) === rawBlank, 'v2155/ws B4: extract 全链路不写存档（它是个只读推导）');

  // B5 有格局时的提取：四个面都在、且**进度面一丝不进**
  bones(WA, 'b5');
  const ex = Ws.extract();
  a(ex.ok === true && ex.counts.powers === 2 && ex.counts.nodes === 2 && ex.counts.edges === 1 && ex.counts.places === 1,
    'v2155/ws B5: 提取到势力 2 / 节点 2 / 边 1 / 地名 1（实 ' + JSON.stringify(ex.counts) + '）');
  const seedTxt = JSON.stringify(ex.seed);
  a(seedTxt.indexOf('不该进种子') < 0,
    'v2155/ws B6: 编年史/暗流/回声一律不进种子（白名单式提取 —— 存了进度就不是新局，是续集）');
  a(ex.seed.at !== undefined && seedTxt.indexOf('"at"') >= 0
    ? ex.sig === Ws.extract().sig : false,
    'v2155/ws B7: 同一格局两次提取签名相同（签名不带时间戳 —— 否则同格局永远去不了重）');

  // B8 亲疏只落三档、不带私密量值原文
  a(ex.seed.network.edges[0][2] === 'near', 'v2155/ws B8: 关系边只带亲疏档（intimacy 80 ⇒ near），**不带量值原文**（种子是可流通的世界资产，不是私人档案）');

  // B9 保存 + 去重靠签名
  const sv = Ws.save('b9格局', 'other');
  a(sv.ok === true && sv.id.indexOf('ws_') === 0, 'v2155/ws B9: 保存成功并给出 ws_ 前缀 id（实 ' + sv.id + '）');
  const dup = Ws.save('b9换个名字');
  a(dup.reason === 'duplicate-seed' && dup.existing === sv.id,
    'v2155/ws B10: 换个名字存同一格局仍被去重（去重靠签名不靠名字）且回报已有 id（实 ' + dup.reason + '）');

  // B11 名字为空 ⇒ missing-fields（不是「存了个无名种子」）
  a(Ws.save('   ').reason === 'missing-fields', 'v2155/ws B11: 种子名为空 ⇒ missing-fields（不存无名种子）');

  // B12 库有界：不静默挤掉旧种子
  const put = function (tag) {
    bones(WA, tag, true);
    Ws.extract();
    return Ws.save(tag, 'other');
  };
  Ws.setSettings({ libCap: 2 });
  const s2 = put('b12甲');
  a(s2.ok === true, 'v2155/ws B12: 库内第 2 个仍可存（上限 2）');
  const s3 = put('b12乙');
  a(s3.reason === 'library-full' && s3.cap === 2,
    'v2155/ws B13: 库达上限 ⇒ library-full 并回报 cap（不静默挤掉旧种子 —— 旧种子没了玩家不会知道）');
  Ws.setSettings({ libCap: 12 });

  // B14 清单 / 取 / 删 / 未知 id
  const li = Ws.list();
  a(li.ok === true && li.rows.length === 2 && li.rows.every(function (x) { return x.id && x.sig && x.counts; }),
    'v2155/ws B14: 清单带 id/签名/各面条数（只给名字的清单没法选）');
  a(Ws.get('ws_不存在').reason === 'unknown-seed' && Ws.drop('ws_不存在').reason === 'unknown-seed',
    'v2155/ws B15: 未知 id ⇒ unknown-seed（不凭空造一个，也不假装删掉了）');
  const got = Ws.get(li.rows[0].id);
  a(got.ok === true && got.row.seed.sig === li.rows[0].sig, 'v2155/ws B16: get 取回的就是那一条（签名对得上）');
  const dr = Ws.drop(li.rows[0].id);
  a(dr.ok === true && dr.total === 1, 'v2155/ws B17: 删掉一个后总数减一（实剩 ' + dr.total + '）');

  // B18 播种：只返回计划、世界一个字不动
  const before = JSON.stringify(WA.store.get());
  const sow = Ws.sow(li.rows[1].id, 30);
  a(sow.ok === true && sow.plan.progress.round === 0 && sow.plan.progress.chronicle === 0
    && sow.plan.progress.currents === 0 && sow.plan.progress.echoes === 0 && sow.plan.zeroProgress === true,
    'v2155/ws B18: 播种计划进度全零（开新局与读旧档的分界线）');
  a(JSON.stringify(WA.store.get()) === before,
    'v2155/ws B19: sow **不写世界**（一个「自己会开新局」的引擎在长局里不可接受 —— 玩家没让它重开）');
  a(sow.plan.powers.length === 2 && sow.plan.geo.places.length === 1 && sow.plan.fromSeed === li.rows[1].id,
    'v2155/ws B20: 计划里带骨头（势力/地名）与来源种子 id（没有来源的播种计划无法追溯）');

  // B21 变异度：闭区间内接受、越界**拒收不夹住**
  a(Ws.sow(li.rows[1].id, 0).plan.variance === 0 && Ws.sow(li.rows[1].id, 100).plan.variance === 100,
    'v2155/ws B21: 变异度 0 与 100 都在界内（闭区间）');
  const bad = Ws.sow(li.rows[1].id, 101);
  a(bad.reason === 'bad-value' && bad.allowed[0] === 0 && bad.allowed[1] === 100 && String(bad.got) === '101',
    'v2155/ws B22: 变异度 101 拒收 bad-value 并回报 allowed 与 got（**不静默夹住** —— 夹住后「你要的变异度」与「真发生的」长得一样）');
  a(Ws.sow(li.rows[1].id, -1).reason === 'bad-value', 'v2155/ws B23: 变异度 -1 同样拒收（下界也管）');

  // B24 高变异只动名字后缀与权重、不动结构（高变异不等于换格局）
  const hi = Ws.sow(li.rows[1].id, 100).plan, lo = Ws.sow(li.rows[1].id, 0).plan;
  a(hi.geo.places.join() === lo.geo.places.join() && hi.network.nodes.join() === lo.network.nodes.join()
    && hi.powers.length === lo.powers.length,
    'v2155/ws B24: 高变异不动结构面（只动权重/后缀 —— 否则「同种子高变异」与「另一个种子」在读数上长得一样）');

  // B25 台账 + 拒收归因
  const st = Ws.stat();
  a(st.faults['bad-value'] >= 2 && st.faults['library-full'] >= 1 && st.faults['duplicate-seed'] >= 1,
    'v2155/ws B25: 拒收进 faults 分桶（可归因）');
  a(st.extracts >= 2 && st.saves >= 2 && st.sows >= 4 && st.total === 1,
    'v2155/ws B26: 提取/保存/播种次数与库内总数累计（台账可对账）');
  a(st.hasLast === true && typeof st.lastSig === 'string' && st.seedVer === 1,
    'v2155/ws B27: 台账带出「身上有未保存的提取」与种子版本（否则存了个什么版本无人知）');

  // B28 bounds：libCap 越界被收进界内
  Ws.setSettings({ libCap: 9999 });
  a(Ws.getSettings().libCap <= 60 && Ws.getSettings().libCap >= 2,
    'v2155/ws B28: libCap 越界被收进界内（实 ' + Ws.getSettings().libCap + '）');
  Ws.setSettings({ libCap: 12 });

  // B29 写口以运行时现值为底（两次独立写动作不得互相抹掉）
  Ws.setSettings({ enabled: true, libCap: 6 });
  Ws.setSettings({ enabled: false });
  a(Ws.getSettings().libCap === 6, 'v2155/ws B29: 改一个键不得把另一个独立写动作摸回默认（libCap 实测 ' + Ws.getSettings().libCap + '）');
  Ws.setSettings({ enabled: true, libCap: 12 });

  // B30 种子版本漂移：改 SEED_VER 必须是有意动作（旧种子带旧号，可被识别）
  a(typeof Ws.SEED_VER === 'number' && Ws.stat().seedVer === Ws.SEED_VER,
    'v2155/ws B30: 种子版本是显式常量且向诊断面露出');
}

// ── N 负控制（真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据）──
function runNegative(a) {
  const orig = fs.readFileSync(path.join(BASE, REL), 'utf8');

  if (countOcc(orig, ANCHOR) !== 1) throw new Error('N0 锚点未恰中 1 次：' + countOcc(orig, ANCHOR));
  if (countOcc(orig, ANCHOR2) !== 1) throw new Error('N0b 锚点二未恰中 1 次：' + countOcc(orig, ANCHOR2));
  // v2.158.0（S3）：锚点三/四各恰中 2 次（sow 与 initPreview 各一处）—— 见 A3/A4 的注。
  if (countOcc(orig, ANCHOR3) !== 2) throw new Error('N0c 锚点三未恰中 2 次：' + countOcc(orig, ANCHOR3));
  if (countOcc(orig, ANCHOR4) !== 2) throw new Error('N0d 锚点四未恰中 2 次：' + countOcc(orig, ANCHOR4));

  // N1 摘掉防空种子闸门 ⇒ 空世界也能被存成种子（本版点名要防的第一类伪装）
  const b1 = orig.replace(ANCHOR, "    if (false) { note('nothing-to-extract'); return { ok: false, reason: 'nothing-to-extract' }; }");
  if (b1 === orig) throw new Error('N1 破坏没有改变源码');
  const WA1 = fresh((function () { const o = {}; o[REL] = b1; return o; })());
  on(WA1);
  WA1.store.transact(function (d) { d.worldSeed = { library: [], seq: 0 }; }, 'ws-v2155:n1');
  a(WA1.worldSeed.extract().ok === true,
    'v2155/ws N1: 摘掉防空种子闸门后，一个什么格局都没有的世界也被提取成「种子」（实 ok ' + WA1.worldSeed.extract().ok + '）');

  // N2 签名里混入时间戳 ⇒ 同格局两次提取签名不同（去重彻底失效）
  const b2 = orig.replace(ANCHOR2,
    "    const canon = JSON.stringify({ powers: raw.powers, network: raw.network, geo: raw.geo, era: raw.era.label, at: raw.at });");
  if (b2 === orig) throw new Error('N2 破坏没有改变源码');
  const WA2 = fresh((function () { const o = {}; o[REL] = b2; return o; })());
  on(WA2);
  bones(WA2, 'n2');
  const sA = WA2.worldSeed.extract().sig;
  WA2.store.transact(function (d) { d.evolution.round = 9; }, 'ws-v2155:n2');
  const sB = WA2.worldSeed.extract().sig;
  a(sA !== sB, 'v2155/ws N2: 签名里混入轮次/时间戳后，同一格局两次提取签名不同（' + sA + ' vs ' + sB + '）—— 去重判据对输入面敏感');

  // N3 播种时把进度面照抄 ⇒ 「开新局」与「读旧档」长得一样
  // v2.158.0：同 N4 —— 全量替换（split/join），破坏必须落到**两处**（sow + initPreview）。
  const b3 = orig.split(ANCHOR3).join(
    "      progress: { round: (sd.progress && sd.progress.round) || 7, chronicle: 3, currents: 2, echoes: 1 },");
  if (b3 === orig) throw new Error('N3 破坏没有改变源码');
  if (countOcc(b3, ANCHOR3) !== 0) throw new Error('N3 破坏未覆盖两处锚点：剩 ' + countOcc(b3, ANCHOR3));
  const WA3 = fresh((function () { const o = {}; o[REL] = b3; return o; })());
  on(WA3);
  bones(WA3, 'n3');
  WA3.worldSeed.extract();
  const sv3 = WA3.worldSeed.save('n3种子', 'other');
  const sow3 = WA3.worldSeed.sow(sv3.id, 0);
  a(sow3.ok === true && sow3.plan.progress.round !== 0 && sow3.plan.zeroProgress === true,
    'v2155/ws N3: 播种计划照抄进度后，round 不再是 0（实 ' + (sow3.plan && sow3.plan.progress.round) + '）而 zeroProgress 仍写 true —— 两个读数打架，「开新局」与「读旧档」不再可分');;

  // N4 变异度改为静默夹住 ⇒ 「你要的 150」被伪装成「发生了的 100」
  const NL = '\n';
  // v2.158.0：破坏锚点改为「越界拒收的四行 + 其后的赋值行」，与 ANCHOR4 同源但**多一行**——
  //   多出的 `v = Math.floor(n);` 是本段的**破坏目标**（把「拒收」改成「夹住」必须动它）。
  //   判据纯度（H5）：本串与 ANCHOR4 不重复（ANCHOR4 只到闭括号为止），故不违反「锚点只声明一次」。
  const B4FIND = [ANCHOR4,
    "        note('bad-value'); return { ok: false, reason: 'bad-value', field: 'variance',",
    "          allowed: [VARIANCE.min, VARIANCE.max], got: variance };",
    "      }",
    "      v = Math.floor(n);"
  ].join(NL);
  if (countOcc(orig, B4FIND) !== 2) throw new Error('N4 破坏锚点未恰中 2 次：' + countOcc(orig, B4FIND));
  // v2.158.0：JS 的字符串版 replace **只换第一处** —— 必须走 split/join 才是全量替换，
  //   否则只破坏了 sow 那一处、initPreview 仍守口径（破坏的就不是「口径本身」）。
  const B4NEW = [
    "      if (n === null) { note('bad-value'); return { ok: false, reason: 'bad-value' }; }",
    "      if (n < VARIANCE.min) v = VARIANCE.min; else if (n > VARIANCE.max) v = VARIANCE.max;",
    "      v = Math.floor(v);"
  ].join(NL);
  const b4 = orig.split(B4FIND).join(B4NEW);
  if (b4 === orig) throw new Error('N4 破坏没有改变源码');
  if (countOcc(b4, B4FIND) !== 0) throw new Error('N4 破坏未覆盖两处锚点：剩 ' + countOcc(b4, B4FIND));
  const WA4 = fresh((function () { const o = {}; o[REL] = b4; return o; })());
  on(WA4);
  bones(WA4, 'n4');
  WA4.worldSeed.extract();
  const sv4 = WA4.worldSeed.save('n4种子', 'other');
  const sow4 = WA4.worldSeed.sow(sv4.id, 150);
  a(sow4.ok === true && sow4.plan.variance === 100,
    'v2155/ws N4: 变异度被静默夹住后，sow(...,150) 返回 ok:true 且 variance 100 —— 调用方无从分辨「你要的 150」与「真发生的 100」');

  // N5 真文件逐字未变
  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === orig, 'v2155/ws N5: 真源码文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, ANCHOR, ANCHOR2, ANCHOR3, ANCHOR4, runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  \u2717 ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制抛出：' + e.message); }
  console.log('WORLD-SEED-V2155: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}
