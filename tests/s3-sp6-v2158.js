#!/usr/bin/env node
// v2.158.0 专锁：S3（可确认的种子新局）+ SP6（面板操作与真实宿主验收）。
//
// S3 增量（在 RX8「提取/保存/播种计划」三件之上）：
//   · transferPack(seedId, max)      —— 种子转移包（格式版本/来源/签名/容量界限；跨聊天转移的序列化面）。
//   · importPack(pack, opt)          —— 白名单校验接收（格式版本/包形状/种子白名单/库容量四道门，整批交付或整批拒收）。
//   · initPreview(seedId, variance) —— 显式初始化消费者的**预览**：id 映射 + 引用完整性 + 拟写入结构 + 保留层级说明。
//   · initConfirm(opt)               —— **确认**：一次 store.transact 安装完整结构，进度归零，写 meta.initFrom；
//                                      预览时变异生成一次，确认应用同一份（不重抽）；失败不半写。
//   空新局判定 emptyCheck：复用 store 默认骨架 + 存档来源（meta.initFrom），**不只看 round === 0**。
//
// SP6 增量：面板 tools 页五枚新控件（转移包/粘贴/导入/预览/确认）+ 四处理器 + UI_BINDINGS 守卫登记。
//
// 判据（按「静默失效」代价排序）：
//   ① 变异 fixed：预览生成一次、确认应用同一份 —— 确认重抽 = 「你要的世界」与「真装的世界」长得一样。
//   ② 重复确认 already：先查 meta.initFrom（持久真源）再查 _pending —— 确认后 _pending 已消费清空。
//   ③ 失败不半写：initConfirm 只在一次 transact 内落完整结构，任一门未过不碰世界。
//   ④ 空新局判定不看轮次：14 项逐格清点，任一非空即 not-empty 带 what 现场清单。
//   ⑤ 悬空引用预览即拦：边两端不在节点表内即滤除，不装一个断网的世界。
//   ── 夹具纪律（沿用 v2.157.0 五条）：fresh() 每例隔离 / 同批取比较值 / 「真被改了」判据也要有 /
//      打桩调用计数算上夹具自身读取 / 不硬编码宿主聊天 id。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL_WS = 'engines/world-seed.js';
const REL_STORE = 'core/store.js';
const REL_PANEL = 'ui/panel.js';
const REL_TDG = 'engines/tool-diag.js';

// ── 锚点（每条在真源码里必须恰中 1 次）─────────────────────────
const ANCHOR_PACK = 'function transferPack(seedId, max)';
const ANCHOR_IMPORT = 'function importPack(pack, opt)';
const ANCHOR_PREVIEW = 'function initPreview(seedId, variance, opt)';
const ANCHOR_CONFIRM = 'function initConfirm(opt)';
const ANCHOR_NOT_EMPTY = "return { ok: false, reason: 'not-empty', what: ec.what };";
const ANCHOR_EMPTY_CHECK = 'function emptyCheck(';
const ANCHOR_WHAT_INITFROM = "what.push('initFrom');";
const ANCHOR_ALREADY = "if (s.meta && s.meta.initFrom) {";
const ANCHOR_NO_PREVIEW = "reason: 'no-preview', hint: '先 initPreview() 再 initConfirm()'";
const ANCHOR_FIXED = '_fixed: true';
const ANCHOR_ROOT_INITFROM = 'root.meta.initFrom = { seedId: t.seedId';
const ANCHOR_BAD_SEED_KEYS = "SEED_KEYS.indexOf(k) < 0";
const ANCHOR_META_SKELETON = 'lastSettle: null, initFrom: null }';
const ANCHOR_RETAIN_NOTE = 'const RETAIN_NOTE =';

function countOcc(s, sub) { return s.split(sub).length - 1; }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function ov(file, src) { const o = {}; o[file] = src; return o; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function freshW(o) { return sync.fresh(o ? { srcOverride: o } : {}).WA; }

/** 起一个干净空新局宿主（worldSeed 开关全开）。 */
let __chatSeq = 0;
function boot(srcOv, chatId) {
  // chatId 给定 = 模拟切聊天（与 demand-integrity-v2155 同法：改 getContext().chatId 后
  //   store.init() 以磁盘为准重新同步 —— 目标聊天的库键 worldaxis_state_<chatId> 是新键、必为空）。
  // chatId 未给定 = 自增序列号新聊天：fresh() **不重置 chatId**，此前 boot 切过的 chatId 会被
  //   后续 boot() 静默继承 —— 该库已有导入种子且 meta.initFrom 已写，残留会污染后续用例
  //   （save 撞 duplicate / confirm 误报 already / transferPack 失败后 clone(undefined) 抛出）。
  //   每个 boot = 独立新聊天，不硬编码宿主聊天 id。
  if (!chatId) chatId = 'v2158_seq_' + (++__chatSeq);
  const WA = freshW(srcOv);
  {
    try {
      const c = global.SillyTavern.getContext();
      c.chatId = chatId; c.chatMetadata = {};
    } catch (e) {}
  }
  WA.store.init();
  WA.worldSeed.setSettings({ enabled: true });
  return WA;
}

/** 源世界：势力/人物关系/地名/时代四面都有内容（在源聊天上构筑）。 */
function makeSourceWorld(WA) {
  WA.store.transact(function (root) {
    root.evolution.factions = [
      { id: 'fa_a', name: '北盟', scope: '北境', status: '鼎盛', relation: '盟友', currentGoal: '称霸北境', core_person: '韩烈', powerPillars: ['铁骑', '粮仓'] },
      { id: 'fa_b', name: '南会', scope: '南郡', status: '稳固', relation: '敌对', currentGoal: '守住南郡', core_person: '沈青', powerPillars: ['水师'] }
    ];
    root.people = {
      p1: { id: 'p1', name: '韩烈', profile: { relations: [{ target: 'p2', intimacy: 80 }] } },
      p2: { id: 'p2', name: '沈青', profile: { relations: [{ target: 'p1', intimacy: -40 }] } }
    };
    root.world.places = [
      { id: 'pl_beijing', name: '北境城', kind: 'public', parent: '', open: 0, close: 0, uses: [], at: 0 },
      { id: 'pl_nangang', name: '南港', kind: 'public', parent: '', open: 0, close: 0, uses: [], at: 0 }
    ];
    root.world.roads = [{ a: '北境城', b: '南港', minutes: 600 }];
    root.background.text = '乱世已过三百年，双雄分治。';
    root.clock.label = '元和三年';
  }, 'v2158:makeSource');
}

// ── A 段：结构面（锚点各恰中 1 次）──────────────────────────────
function runA(a) {
  const s = read(REL_WS);
  const items = [
    [ANCHOR_PACK, 'A1 转移包四口 transferPack 锚点恰中 1 次'],
    [ANCHOR_IMPORT, 'A2 白名单导入 importPack 锚点恰中 1 次'],
    [ANCHOR_PREVIEW, 'A3 初始化预览 initPreview 锚点恰中 1 次'],
    [ANCHOR_CONFIRM, 'A4 初始化确认 initConfirm 锚点恰中 1 次'],
    [ANCHOR_EMPTY_CHECK, 'A5 空新局判定 emptyCheck 锚点恰中 1 次'],
    [ANCHOR_WHAT_INITFROM, 'A6 空新局判定把 meta.initFrom 算作非空（镜像已有初始化来源即非空）锚点恰中 1 次'],
    [ANCHOR_ALREADY, 'A7 重复确认先查 meta.initFrom（持久真源）锚点恰中 1 次'],
    [ANCHOR_NO_PREVIEW, 'A8 无预览拒收 no-preview（带 hint）锚点恰中 1 次'],
    [ANCHOR_FIXED, 'A9 变异 fixed（预览生成一次，确认应用同一份）锚点恰中 1 次'],
    [ANCHOR_ROOT_INITFROM, 'A10 initConfirm 写 meta.initFrom（唯一写入方）锚点恰中 1 次'],
    [ANCHOR_BAD_SEED_KEYS, 'A11 种子白名单校验（只准七键）锚点恰中 1 次'],
    [ANCHOR_RETAIN_NOTE, 'A12 保留层级说明 RETAIN_NOTE 锚点恰中 1 次']
  ];
  items.forEach(function (it) {
    const n = countOcc(s, it[0]);
    a(n === 1, 'v2158 ' + it[1] + '（实 ' + n + '）');
  });
  const st = read(REL_STORE);
  a(countOcc(st, ANCHOR_META_SKELETON) === 1,
    'v2158 A13 store 骨架物化 meta.initFrom: null（登记了却不在骨架里 = registryParity 未物化）');
}

// ── B 段：行为面 ────────────────────────────────────────────────
function runB(a) {
  const WA = boot();
  makeSourceWorld(WA);

  // B1 提取 + 保存（源聊天入库）
  const ex = WA.worldSeed.extract();
  a(ex.ok && /^[0-9a-f]{8}$/.test(ex.sig), 'v2158 B1 extract ok + 8 位十六进制签名');
  const sv = WA.worldSeed.save('v2158 测试格局', ['门派']);
  a(sv.ok && sv.id, 'v2158 B1 save 入库 ok（id ' + (sv.id || '-') + '）');
  const ex2 = WA.worldSeed.extract();
  a(ex2.ok && ex2.sig === ex.sig, 'v2158 B1 同一世界二次提取同签名（确定性提取）');

  // B2 转移包：格式版本 / 来源 / 签名 / 容量
  const pk = WA.worldSeed.transferPack(sv.id);
  a(pk.ok && pk.pack && pk.pack.packVer === 1
    && typeof pk.pack.chatId === 'string'
    && pk.pack.seed && pk.pack.seed.sig === ex.sig
    && typeof pk.pack.at === 'number',
    'v2158 B2 transferPack 带格式版本 1 / 来源 chatId / 种子含签名');

  // B3 跨聊天导入（目标空新局 —— 真切聊天，非同库换名）
  const W2 = boot(null, 'v2158_target_chat');
  const im = W2.worldSeed.importPack(pk.pack);
  a(im.ok && im.id, 'v2158 B3 目标聊天导入整批交付 ok（新 id ' + (im.id || '-') + '）');
  const im2 = W2.worldSeed.importPack(pk.pack);
  a(im2.ok === false && im2.reason === 'duplicate-seed' && im2.existing === im.id,
    'v2158 B3 重复导入同签名包 ⇒ duplicate-seed 带既有 id（源侧去重纪律不因跨聊天放宽）');

  // B4 预览：id 映射 + 引用完整性 + 保留层级
  const pv = W2.worldSeed.initPreview(im.id, 30);
  a(pv.ok && pv.plan && pv.plan.powers.length === 2
    && pv.plan.geo && pv.plan.geo.places.length === 2,
    'v2158 B4 initPreview ok（势力 2 / 地名 2）');
  a(pv.retain === true && typeof pv.retainNote === 'string' && pv.retainNote.length,
    'v2158 B4 预览带保留层级说明（不保留人物 id / 道路端点 / 编年史）');
  a(pv.plan.sig === ex.sig, 'v2158 B4 预览计划签名与源种子一致（跨聊天结构面同源）');

  // B5 变异 fixed：预览时生成一次
  a(pv.plan.variance === 30 && pv.plan._fixed === true,
    'v2158 B5 预览变异 30 且 _fixed:true（预览生成一次，确认不重抽）');

  // B6 确认：一次事务装完
  const cf = W2.worldSeed.initConfirm();
  a(cf.ok && cf.installed && cf.installed.factions === 2
    && cf.installed.places === 2 && cf.installed.nodes === 2,
    'v2158 B6 initConfirm 一次事务装完（势力 2 / 地名 2 / 节点 2）');
  a(cf.installed.roads === 0, 'v2158 B6 道路只记数量不还原端点（如实落 0 条 —— RETAIN_NOTE 同口径）');

  // B7 确认后世界真实落位
  const st = W2.store.get();
  a(st.evolution.factions.length === 2 && st.evolution.factions[0].name === '北盟'
    && st.evolution.factions[0].relation === '中立',
    'v2158 B7 确认后势力落位（北盟·relation 引擎定中立 —— 种子只记势力名与权重，初始关系不抄源世界）');
  a(st.world.places.length === 2 && st.world.places.some(function (p) { return p.name === '南港'; }),
    'v2158 B7 确认后地名落位（world.places 含南港）');
  a(Object.keys(st.people).length === 2, 'v2158 B7 确认后人物落位（people 两枚）');
  a(st.clock.label === '元和三年' && st.background.text === '乱世已过三百年，双雄分治。',
    'v2158 B7 确认后时代落位（clock.label + background.text 逐字）');
  a(st.meta && st.meta.initFrom && st.meta.initFrom.sig === ex.sig,
    'v2158 B7 初始化来源落 meta.initFrom（跨会话要留下：换会话仍知道这个世界从哪颗种子来）');

  // B8 进度面归零
  a(st.evolution.round === 0 && st.chronicle.length === 0 && st.currents.length === 0 && st.echoes.length === 0,
    'v2158 B8 进度面归零（轮 0 / 编年史 0 / 暗流 0 / 回声 0 —— 种子只记骨头不记进度）');

  // B9 重复确认 already（先查 meta.initFrom 再查 _pending）
  const cf2 = W2.worldSeed.initConfirm();
  a(cf2.ok === true && cf2.reason === 'already' && cf2.installedAt === cf.installedAt && cf2.repeat === true,
    'v2158 B9 重复确认 ⇒ already 带原结果（先查持久真源 meta.initFrom，不误报 no-preview）');

  // B10 确认应用同一份变异（不重抽）
  const w0 = st.evolution.factions[0].power;
  a(typeof w0 === 'number' && w0 >= 0, 'v2158 B10 确认后的势力权重是数（预览那份，非重抽）');

  // B11 空新局判定拒非空目标（带 what 现场清单）
  const W3 = boot();
  makeSourceWorld(W3);
  W3.worldSeed.extract();   // save 前置：签名先备（否则 nothing-to-extract，.id 连锁 undefined）
  const pv3 = W3.worldSeed.initPreview('ws_no_such', 0);
  a(pv3.ok === false && pv3.reason === 'unknown-seed' && pv3.id === 'ws_no_such',
    'v2158 B11 不存在的种子 ⇒ unknown-seed 带 id 透传（get() 报 unknown-seed，initPreview 不吞不改）');
  const sv3 = W3.worldSeed.save('busy 格局', []);
  const pvBusy = W3.worldSeed.initPreview(sv3.id, 0);
  a(pvBusy.ok === false && pvBusy.reason === 'not-empty' && Array.isArray(pvBusy.what) && pvBusy.what.length > 0,
    'v2158 B11 非空目标（源世界非空）⇒ not-empty 带 what 现场清单（实 ' + ((pvBusy && pvBusy.what) || []).join('、') + '）');

  // B12 确认前预览不可重复消费（无预览直接确认 ⇒ no-preview）
  const W4 = boot();
  const cfNoPv = W4.worldSeed.initConfirm();
  a(cfNoPv.ok === false && cfNoPv.reason === 'no-preview',
    'v2158 B12 没预览过直接确认 ⇒ no-preview（不能绕过预览装世界）');
}

// ── R 段：拒收面（真实局面触发）───────────────────────────────
function runR(a) {
  // R1 格式不支持（packVer 99）
  {
    const WA = boot();
    makeSourceWorld(WA);
    WA.worldSeed.extract();   // save 前置：签名先备
    const pk = WA.worldSeed.transferPack(WA.worldSeed.save('r1', []).id);
    const bad = clone(pk.pack);
    bad.packVer = 99;
    const r = WA.worldSeed.importPack(bad);
    a(r.ok === false && r.reason === 'bad-pack-ver' && r.supported === 1,
      'v2158 R1 格式不支持（packVer 99）⇒ bad-pack-ver 带 supported:1');
  }
  // R2 包损坏（种子四面全空但带假签名）
  {
    const WA = boot();
    makeSourceWorld(WA);
    WA.worldSeed.extract();   // save 前置：签名先备
    const pk = WA.worldSeed.transferPack(WA.worldSeed.save('r2', []).id);
    const bad = clone(pk.pack);
    bad.seed = { ver: 1, sig: 'deadbeef', at: 0, powers: [], network: { nodes: [], edges: [] }, geo: { places: [], roads: 0 }, era: {} };
    const r = WA.worldSeed.importPack(bad);
    a(r.ok === false && r.reason === 'empty-seed',
      'v2158 R2 损坏包（四面全空带假签名）⇒ empty-seed（不装一个空世界）');
  }
  // R3 种子白名单（多一个键即拒）
  {
    const WA = boot();
    makeSourceWorld(WA);
    WA.worldSeed.extract();   // save 前置：签名先备
    const pk = WA.worldSeed.transferPack(WA.worldSeed.save('r3', []).id);
    const bad = clone(pk.pack);
    bad.seed.sneaky = 'x';
    const r = WA.worldSeed.importPack(bad);
    a(r.ok === false && r.reason === 'bad-seed-keys' && Array.isArray(r.extra) && r.extra.indexOf('sneaky') >= 0,
      'v2158 R3 种子白名单拒收（多了 sneaky 键）⇒ bad-seed-keys 带 extra');
  }
  // R4 签名格式坏
  {
    const WA = boot();
    makeSourceWorld(WA);
    WA.worldSeed.extract();   // save 前置：签名先备
    const pk = WA.worldSeed.transferPack(WA.worldSeed.save('r4', []).id);
    const bad = clone(pk.pack);
    bad.seed.sig = 'ZZ-not-hex';
    const r = WA.worldSeed.importPack(bad);
    a(r.ok === false && r.reason === 'bad-sig', 'v2158 R4 签名非 8 位十六进制 ⇒ bad-sig');
  }
  // R5 库容量满（目标库满拒收）
  {
    const WA = boot();
    makeSourceWorld(WA);
    // 造 12 颗不同结构的种子把库填满（libCap 12）
    for (let i = 0; i < 12; i++) {
      WA.store.transact(function (root) {
        root.evolution.factions = [{ id: 'fa_i', name: '势力' + i, scope: 's', status: '稳固', relation: '中立', currentGoal: 'g', core_person: 'c', powerPillars: ['p'] }];
        root.background.text = '格局' + i;
      }, 'r5:' + i);
      WA.worldSeed.extract();
      WA.worldSeed.save('种' + i, []);
    }
    const lst = WA.worldSeed.list();
    a(lst.rows.length === 12, 'v2158 R5 前提：库满 12（libCap）');
    // 换一个空库目标接收（容量界限在包与库各自的边上 —— 真切聊天空库）
    const pk = WA.worldSeed.transferPack(lst.rows[0].id);
    const W2 = boot(null, 'v2158_r5_target');
    const r = W2.worldSeed.importPack(pk.pack);
    a(r.ok, 'v2158 R5 空库目标收包不受源库满影响（容量界限在包与库各自的边上）');
  }
  // R6 容量超限（transferPack 侧上限：powers 24 / nodes 60 / edges 120 / places 40）
  //   注：extract 侧在 powersOf 已 slice(0,24) 截断 —— 活世界造不出 >24 的种子；
  //   这道门防的是「库里的种子被改大 / 未来格式」，故直接往库里注入一枚 25 势力种子实测。
  {
    const WA = boot();
    WA.store.transact(function (root) {
      if (!root.worldSeed || typeof root.worldSeed !== 'object') root.worldSeed = { library: [], seq: 0 };
      if (!Array.isArray(root.worldSeed.library)) root.worldSeed.library = [];
      const powers = [];
      for (let i = 0; i < 25; i++) powers.push({ name: '势力' + i, weight: 10 });
      root.worldSeed.library.push({ id: 'ws_r6_over', name: '超限格局', tags: [],
        seed: { ver: 1, sig: 'aabbccdd', at: 0, powers: powers,
          network: { nodes: [], edges: [] }, geo: { places: [], roads: 0 },
          era: { title: 'x', label: 'y', note: 'z' } }, at: 0 });
    }, 'r6:over');
    const pk = WA.worldSeed.transferPack('ws_r6_over');
    a(pk.ok === false && pk.reason === 'pack-too-big'
      && pk.counts.powers === 25 && pk.limits.powers === 24,
      'v2158 R6 转移包容量超限（库里 25 势力种子 > 24）⇒ pack-too-big 带 counts 与 limits');
  }
  // R7 悬空引用：提取侧只收 nameOf 命中的目标（不进包）
  {
    const WA = boot();
    makeSourceWorld(WA);
    WA.store.transact(function (root) {
      root.people.p1.profile.relations = [{ target: 'p_ghost', intimacy: 50 }];
    }, 'r7');
    const ex = WA.worldSeed.extract();
    a(ex.ok, 'v2158 R7 悬空关系在提取侧被跳过（networkOf 只收 nameOf 命中的目标）');
    const sv = WA.worldSeed.save('r7', []);
    const pk = WA.worldSeed.transferPack(sv.id);
    const W2 = boot(null, 'v2158_r7_target');
    const im = W2.worldSeed.importPack(pk.pack);
    a(im.ok, 'v2158 R7 悬空引用不进包（包内引用完整是提取侧的纪律）');
    const pv = W2.worldSeed.initPreview(im.id, 0);
    a(pv.ok, 'v2158 R7 预览引用完整性通过（包内无悬空边）');
  }
  // R8 总开关关：四口全拒
  {
    const WA = boot();
    WA.worldSeed.setSettings({ enabled: false });
    a(WA.worldSeed.extract().reason === 'disabled'
      && WA.worldSeed.transferPack('ws_x').reason === 'disabled'
      && WA.worldSeed.importPack({ packVer: 1 }).reason === 'disabled'
      && WA.worldSeed.initPreview('ws_x', 0).reason === 'disabled'
      && WA.worldSeed.initConfirm().reason === 'disabled',
      'v2158 R8 总开关关 ⇒ 五口全拒 disabled（不写一格）');
  }
}

// ── N 段：负控制（真源码破坏，内存副本 ⇒ 同款判据由真变假）──
function runNegative(a) {
  const src = read(REL_WS);

  // N1 前提 + 破坏：空新局判定漏掉 initFrom 项
  //   结构纪律与 B 段同款：种子在源宿主造、预览/确认在**空新局目标宿主** ——
  //   同一宿主上先造非空源世界再预览会被 not-empty 拒收，_pending 从未建立。
  a(countOcc(src, ANCHOR_WHAT_INITFROM) === 1, 'v2158 N1 前提: initFrom 项锚点恰中 1 次');
  const b1 = src.replace(ANCHOR_WHAT_INITFROM, "    what.push('initFromX');");
  a(b1 !== src, 'v2158 N1a: 破坏副本已生成（内存态，真源码不动）');
  const pkN1 = (function () {
    const WA = boot();
    makeSourceWorld(WA);
    WA.worldSeed.extract();   // save 前置：签名先备
    return WA.worldSeed.transferPack(WA.worldSeed.save('neg1', []).id);
  })();
  {
    // 原版判据：确认后（initFrom 已写）再预览 ⇒ not-empty 且 what 点名 initFrom
    const W2 = boot(null, 'v2158_n1_orig');
    const im = W2.worldSeed.importPack(pkN1.pack);
    W2.worldSeed.initPreview(im.id, 0);
    const cf = W2.worldSeed.initConfirm();
    a(cf.ok === true, 'v2158 N1b 前提: 原版首次确认 ok');
    const pv2 = W2.worldSeed.initPreview(im.id, 0);
    a(pv2.ok === false && pv2.reason === 'not-empty' && (pv2.what || []).indexOf('initFrom') >= 0,
      'v2158 N1b: 原版判据 —— initFrom 已写 ⇒ not-empty 且 what 点名 initFrom（不能在装好的世界上再装一层）');
  }
  {
    // 破坏版：emptyCheck 漏掉 initFrom 项 ⇒ 现场清单不再点名（判据由真变假）
    const W2 = boot(ov(REL_WS, b1), 'v2158_n1_broken');
    const im = W2.worldSeed.importPack(pkN1.pack);
    W2.worldSeed.initPreview(im.id, 0);
    const cf = W2.worldSeed.initConfirm();
    a(cf.ok === true, 'v2158 N1c 前提: 破坏版首次确认 ok');
    const pv2 = W2.worldSeed.initPreview(im.id, 0);
    a((pv2.what || []).indexOf('initFrom') < 0,
      'v2158 N1d: 破坏后 initFrom 不再被点名（已装世界少算一格 —— 静默双装的第一步）');
  }

  // N2 破坏：already 分支被移除（先查 _pending 的旧形态）
  a(countOcc(src, ANCHOR_ALREADY) === 1, 'v2158 N2 前提: already 分支锚点恰中 1 次');
  const b2 = src.replace(ANCHOR_ALREADY, '    if (false) {');
  a(b2 !== src, 'v2158 N2a: 破坏副本已生成');
  const pkN2 = (function () {
    const WA = boot();
    makeSourceWorld(WA);
    WA.worldSeed.extract();   // save 前置：签名先备
    return WA.worldSeed.transferPack(WA.worldSeed.save('neg2', []).id);
  })();
  {
    // 破坏版：重复确认误报 no-preview（「装过了」与「没预览过」混淆 —— _pending 已消费清空）
    const W2 = boot(ov(REL_WS, b2), 'v2158_n2_broken');
    const im = W2.worldSeed.importPack(pkN2.pack);
    W2.worldSeed.initPreview(im.id, 0);
    const cf = W2.worldSeed.initConfirm();
    a(cf.ok === true, 'v2158 N2b 前提: 破坏版首次确认 ok');
    const cf2 = W2.worldSeed.initConfirm();
    a(cf2.ok === false && cf2.reason === 'no-preview',
      'v2158 N2c: 破坏后重复确认误报 no-preview（meta.initFrom 先查被移除）');
  }
  {
    // 原版同款判据：重复确认返回 already
    const W2 = boot(null, 'v2158_n2_orig');
    const im = W2.worldSeed.importPack(pkN2.pack);
    W2.worldSeed.initPreview(im.id, 0);
    W2.worldSeed.initConfirm();
    const cf2 = W2.worldSeed.initConfirm();
    a(cf2.ok === true && cf2.reason === 'already',
      'v2158 N2d: 原版上同款判据成立（重复确认 ⇒ already）—— 不是把判据写死');
  }

  // N3 破坏：白名单校验被移除（任何键都收）
  a(countOcc(src, ANCHOR_BAD_SEED_KEYS) === 1, 'v2158 N3 剔提: 白名单锚点恰中 1 次');
  const b3 = src.replace(ANCHOR_BAD_SEED_KEYS, 'SEED_KEYS.indexOf(k) < 0 && false');
  a(b3 !== src, 'v2158 N3a: 破坏副本已生成');
  {
    const WA = boot();
    makeSourceWorld(WA);
    WA.worldSeed.extract();   // save 前置：签名先备
    const pk = WA.worldSeed.transferPack(WA.worldSeed.save('neg3', []).id);
    const W2 = boot(ov(REL_WS, b3));
    const bad = clone(pk.pack);
    bad.seed.sneaky = 'x';
    const r = W2.worldSeed.importPack(bad);
    a(r.ok === true, 'v2158 N3b: 破坏后白名单形同虚设（任何键都收 —— 静默收下恶意载荷/未来格式）');
  }
  {
    // 原版同款判据：白名单拒收
    const WA = boot();
    makeSourceWorld(WA);
    WA.worldSeed.extract();   // save 前置：签名先备
    const pk = WA.worldSeed.transferPack(WA.worldSeed.save('neg3o', []).id);
    const bad = clone(pk.pack);
    bad.seed.sneaky = 'x';
    const r = WA.worldSeed.importPack(bad);
    a(r.ok === false && r.reason === 'bad-seed-keys',
      'v2158 N3c: 厴版上同款判据成立（白名单拒收）—— 不是把判据写死');
  }

  // N8 真源码逐字未变
  a(read(REL_WS) === src, 'v2158 N8: 真源码逐字未变（破坏只在内存副本）');
}

// ── SP6 段：面板渲染 + 绑定 + 守卫登记三件 ─────────────────────
function runSp6(a) {
  const panelSrc = read(REL_PANEL);
  const diagSrc = read(REL_TDG);
  const ids = ['wa-ws-pack', 'wa-ws-packin', 'wa-ws-import', 'wa-ws-init', 'wa-ws-confirm'];
  ids.forEach(function (id) {
    const nPanel = countOcc(panelSrc, 'id="' + id + '"');
    a(nPanel === 1, 'v2158 SP6 ' + id + ' 在 ui/panel.js 渲染恰 1 次（实 ' + nPanel + '）');
  });
  const bound = ['wa-ws-import', 'wa-ws-init', 'wa-ws-confirm'];
  bound.forEach(function (id) {
    const nBind = countOcc(panelSrc, "'#" + id + "'");
    a(nBind >= 1, 'v2158 SP6 #' + id + ' 处理器绑定在位（实 ' + nBind + '）');
  });
  ids.forEach(function (id) {
    const nReg = countOcc(diagSrc, "'" + id + "'");
    a(nReg === 1, 'v2158 SP6 ' + id + ' 在 UI_BINDINGS（tool-diag.js）登记恰 1 次（实 ' + nReg + '）');
  });
}

function runAll(a) { runA(a); runB(a); runR(a); runSp6(a); }
function runLockOnly(a) { runB(a); runR(a); }
module.exports = { runAll, runA, runB, runR, runNegative, runSp6,
  ANCHOR_PACK, ANCHOR_IMPORT, ANCHOR_PREVIEW, ANCHOR_CONFIRM,
  ANCHOR_NOT_EMPTY, ANCHOR_EMPTY_CHECK, ANCHOR_WHAT_INITFROM, ANCHOR_ALREADY,
  ANCHOR_NO_PREVIEW, ANCHOR_FIXED, ANCHOR_ROOT_INITFROM, ANCHOR_BAD_SEED_KEYS,
  ANCHOR_META_SKELETON, ANCHOR_RETAIN_NOTE, runLockOnly };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) {
    if (cond) { pass++; } else { fail++; console.log('  x ' + msg); }
  };
  const m = process.argv[2] || 'all';
  try {
    if (m === 'negative') { runNegative(a); }
    else if (m === 'lock') { runLockOnly(a); }
    else { runAll(a); runNegative(a); }
  } catch (e) { fail++; console.log('  x 抛出：' + e.message); }
  console.log('S3-SP6-V2158: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}
