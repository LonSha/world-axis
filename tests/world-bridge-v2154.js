#!/usr/bin/env node
// v2.154.0 RX4 专锁：世界联网面 —— 世界签名两段派生、传说导出（逐句脱敏是**判据**）、
//   导入是唯一写入口（同签名**拒收**而非「导入 0 条」）、转投 rumor 先落事实再起链。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const REL = 'engines/world-bridge.js';
const SELF_REL = 'tests/world-bridge-v2154.js';

// 锚点一取「同签名 = 本世界自己的回灌 ⇒ 硬拒收」这一条：它是传说**不回流**的唯一闸门 ——
//   一旦失效，本世界导出的传说会以「远方来的」名义再念一遍，
//   而读者会以为别处也发生了同样的事（且它在读数上与「真有别处传来」长得一样）。
const ANCHOR = "    if (from && wk.sig && from === wk.sig) { noteFault('self-origin'); return { ok: false, reason: 'self-origin', sig: wk.sig }; }";
// 锚点二取「脱敏是判据」这一行：命中私密词表的**整句**剔除。
//   它失效 ⇒ 那段词表就退化成一段注释，而「不含玩家私密状态」这句需求无法核对。
const ANCHOR2 = "      const bad = PRIVATE.some(function (w) { return s.indexOf(w) >= 0; });";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function fresh(ov) { return sync.fresh(ov ? { srcOverride: ov } : undefined).WA; }

const TITLE = '琥珀世界';
const PLAYER = '测试者';

function reset(WA) {
  WA.store.init();
  WA.worldBridge.setSettings({ enabled: true, worldTitle: TITLE, playerName: PLAYER,
    maxLegends: 24, maxExported: 12, maxItems: 4 });
  // 转投面真跑需要 rumor **开着**：rumor 关闭时 startChain 返回 ok:true / reason:'disabled'
  //   （它自己的口径）而**没有链 id** —— 那是 rumor 的既定行为，不是本模块的结论。
  if (WA.rumor && WA.rumor.setSettings) WA.rumor.setSettings({ enabled: true });
  WA.store.transact(function (d) {
    d.worldBridge = { legends: [], exported: [], seeds: 0, lastExportAt: null, lastImportAt: null };
    d.chronicle = []; d.worldFacts = []; d.rumor = { chains: [] };
  }, 'world-bridge-v2154:reset');
}

/** 六条编年史：三类各一条 + 一条无关 kind + 一条 hidden + 一条只含私密词 + 一条半句私密。 */
function seedChronicle(WA) {
  WA.store.transact(function (d) {
    d.chronicle = [
      { id: 'c1', kind: 'war', title: '北境大战', summary: '两军对峙三日后溃散。', at: 3 },
      { id: 'c2', kind: 'crime', title: '银库失窃案', summary: '失窃发生在夜半。', at: 5 },
      { id: 'c3', kind: 'rise', title: '少年封侯', summary: '他一年之内从伍长升到将军。', at: 2 },
      { id: 'c4', kind: 'weather', title: '晴', summary: '今日无云。', at: 9 },
      { id: 'c5', kind: 'war', title: '私密调兵', summary: '这件事只有我知道。', at: 8 },
      { id: 'c6', kind: 'war', title: '不该出的战役', summary: '归档时被隐藏了。', at: 4, visibility: 'hidden' },
      { id: 'c7', kind: 'crime', title: '夜半劫案', summary: '劫案发生在码头。我的存档里记着这事。', at: 7 }
    ];
  }, 'world-bridge-v2154:chronicle');
}

function anyPrivate(WA, pack) {
  const words = WA.worldBridge.PRIVATE;
  return (pack.legends || []).some(function (l) {
    const t = String(l.title || '') + '|' + String(l.summary || '');
    return words.some(function (w) { return t.indexOf(w) >= 0; });
  });
}

// ── A 结构面 ──────────────────────────────────────────────────────────
function runA(a) {
  const src = fs.readFileSync(path.join(BASE, REL), 'utf8');
  a(countOcc(src, ANCHOR) === 1, 'v2154/wb A1: 「同签名回灌即拒收」判据锚点恰中 1 次（实 ' + countOcc(src, ANCHOR) + '）');
  a(countOcc(src, ANCHOR2) === 1, 'v2154/wb A2: 「脱敏是判据」锚点恰中 1 次（实 ' + countOcc(src, ANCHOR2) + '）');
  a(src.indexOf("WA.registerModule('engines/world-bridge.js'") >= 0, 'v2154/wb A3: 模块自报登记');
  a(src.indexOf('__settingsRegs = (WA.__settingsRegs || []).concat([__REG])') >= 0, 'v2154/wb A4: 设置键走 __settingsRegs 登记');
  // 传说链是**世界状态**（跨会话要活），故它必须有真正的写事务；
  //   反面同样要钉：若一个写事务都没有，导入就只是「面板上显示了一下」。
  a(countOcc(src, 'WA.store.transact(') === 2, 'v2154/wb A5: 两处写事务（导入 / 转投落事实），一处不多一处不少（实 ' + countOcc(src, 'WA.store.transact(') + '）');
  a(src.indexOf("'worldBridge.legends'") >= 0 && src.indexOf("'worldBridge.exported'") >= 0,
    'v2154/wb A6: 两条环各走 WA.evict 单一出口（站点名登记）');
  a(src.indexOf('const PRIVATE = [') >= 0 && src.indexOf("const LEGEND_KINDS = ['war', 'crime', 'rise']") >= 0,
    'v2154/wb A7: 脱敏词表与传说三档是显式常量（成表而不是散落分支）');
  a(src.indexOf("return { ok: true, added: 0") >= 0, 'v2154/wb A8: 「都收过」是一条 ok:true 的**读数**，不是一句含糊的失败');
  // H5 纯度：锚点字面量在**本文件**里只出现在 ANCHOR 常量那一处语义上；判据一律引用常量。
  const self = fs.readFileSync(path.join(BASE, SELF_REL), 'utf8');
  a(countOcc(self, ANCHOR) >= 1 && countOcc(self, ANCHOR2) >= 1, 'v2154/wb A9: 锚点在本文件里至少各引用 1 次');
}

// ── B 运行时 ──────────────────────────────────────────────────────────
function runB(a) {
  const WA = fresh();
  reset(WA);
  const WB = WA.worldBridge;
  a(!!WB && typeof WB.worldKey === 'function' && typeof WB.seed === 'function'
    && typeof WB.exportLegends === 'function' && typeof WB.importLegends === 'function'
    && typeof WB.toRumor === 'function' && typeof WB.view === 'function'
    && typeof WB.buildBlock === 'function' && typeof WB.stat === 'function',
    'v2154/wb B1: 八个真出口在场');

  // B2 关闭态：三处一并拒收，且注入块**返回空串**（不给老用户凭空多出约束）
  WB.setSettings({ enabled: false });
  a(WB.exportLegends().reason === 'disabled' && WB.importLegends({ legends: [{}] }).reason === 'disabled'
    && WB.toRumor('x').reason === 'disabled' && WB.buildBlock() === '',
    'v2154/wb B2: 关闭后导出/导入/转投三处一并拒收，注入块为空串');
  a(WB.view().count === 0, 'v2154/wb B2b: 关闭后只读面照常可读（关闭是「不传」，不是「把已收的删掉」）');
  WB.setSettings({ enabled: true });

  // B3 世界签名：两段派生值 + 合成哈希；缺任一段即**整份不成签名**
  const wk = WB.worldKey();
  a(wk.complete === true && wk.sig.length === 8 && wk.titleId !== wk.playerId,
    'v2154/wb B3: 两段身份齐备时给出 8 位合成签名（实 ' + wk.sig + '）');
  a(wk.label.indexOf(TITLE) >= 0 && wk.label.indexOf(PLAYER) >= 0, 'v2154/wb B3b: 签名读数带可读标签（面板据此核对）');
  WB.setSettings({ playerName: '' });
  const half = WB.worldKey();
  a(half.complete === false && half.sig === '' && half.titleId !== '',
    'v2154/wb B4: 半份身份不成签名（有 titleId 而 sig 为空 —— 拿半份身份去判「是不是同一个世界」是假判据）');
  a(WB.exportLegends().reason === 'identity-incomplete', 'v2154/wb B4b: 身份不全时导出如实报 identity-incomplete（不是「没有大事可传」）');
  WB.setSettings({ playerName: PLAYER });

  // B5 落种子：**必须在事务里调用**（幂等：同签名重复只累加计数）
  let s1 = null, s2 = null;
  WA.store.transact(function (d) { s1 = WB.seed(d); }, 'world-bridge-v2154:seed1');
  WA.store.transact(function (d) { s2 = WB.seed(d); }, 'world-bridge-v2154:seed2');
  a(s1.ok === true && s2.seeds === 2, 'v2154/wb B5: 落种子幂等（同签名重复只累加计数，实 ' + s2.seeds + '）');
  a(WB.seed(null).reason === 'no-draft', 'v2154/wb B5b: 不开事务直接调用 ⇒ 如实报 no-draft（不静默改一份游离对象）');
  a(WB.stat().seeds === 2, 'v2154/wb B5c: 种子计数真的落进世界（面板与诊断据此判「联网面起没起来」）');

  // B6 无编年史
  a(WB.exportLegends().reason === 'no-chronicle', 'v2154/wb B6: 编年史为空 ⇒ no-chronicle（「推演几轮后才有大事可传」）');

  // B7 导出：三类归集 + 逐句脱敏 + hidden 不出 + 脱敏后空者整条剔除
  seedChronicle(WA);
  const snap = JSON.stringify(WA.store.get());
  const ex = WB.exportLegends();
  a(ex.ok === true && ex.exported === ex.total && ex.total === 4,
    'v2154/wb B7: 只取三类（war/crime/rise）四类之外与 hidden 一律不出（实 ' + ex.exported + '/' + ex.total + '）');
  a(JSON.stringify(WA.store.get()) === snap, 'v2154/wb B7b: 导出是**纯读**（存档逐字未变 —— 面板与诊断的安全读口）');
  a(ex.dropped === 1, 'v2154/wb B8: 脱敏后什么都不剩的那条**整条剔除**（不是导出一条空传说，实 dropped ' + ex.dropped + '）');
  a(ex.redacted >= 2 && anyPrivate(WA, ex.pack) === false,
    'v2154/wb B8b: 命中私密词表的句子一句都没进包（剔除 ' + ex.redacted + ' 句）');
  a(Array.isArray(ex.privateWords) && ex.privateWords.length === WB.PRIVATE.length,
    'v2154/wb B8c: 脱敏口径**随读数一起给出**（调用方看到的是「剔了几句、按什么词」，不是一句「已脱敏」）');
  a(ex.pack.format === 'worldaxis-legend-pack' && ex.pack.formatVer === 1 && ex.pack.sig === ex.sig,
    'v2154/wb B9: 包自带格式与格式版本与来源签名（跨世界传递靠它判「这是不是我的回灌」）');
  a(ex.pack.legends.every(function (l) { return l.kind && l.label && l.title && l.at !== undefined; }),
    'v2154/wb B9b: 每条传说带档位与可读标签（只给摘要的包没法核对它属于哪一档）');

  // B10 同签名回灌 ⇒ **拒收**而非「导入 0 条」
  const selfPack = ex.pack;
  a(WB.importLegends(selfPack).reason === 'self-origin',
    'v2154/wb B10: 本世界自己的包回灌 ⇒ self-origin 硬拒收（「拒收」不能退化成「导入了 0 条」：后者像是别处刚好传了空的）');

  // B11 导入：唯一写入口，只写传说链
  const before = WA.store.get();
  const factsBefore = JSON.stringify(before.worldFacts), chronBefore = JSON.stringify(before.chronicle);
  const pack = JSON.parse(JSON.stringify(selfPack));
  pack.sig = 'aa11bb22';
  const im = WB.importLegends(pack, { remember: true });
  a(im.ok === true && im.added === 4 && im.total === 4, 'v2154/wb B11: 别处的包四条全部收下（实 added ' + im.added + '）');
  a(JSON.stringify(WA.store.get().worldFacts) === factsBefore && JSON.stringify(WA.store.get().chronicle) === chronBefore,
    'v2154/wb B11b: 导入**不写世界事实、不写编年史**（写了它就变成「这里发生过的事」，模型下一轮会照着它推本地人物）');
  a(JSON.stringify(WA.store.get().worldBridge.exported) !== '[]', 'v2154/wb B11c: remember 选项把「别处的世界来过」记进第二环（只记签名与计数，不存第二份传说）');
  const rows = WB.view().rows;
  a(rows.length === 4 && rows.every(function (r) { return r.source === 'another-world' && r.from === 'aa11bb22'; }),
    'v2154/wb B12: 收进来的每条都标 source:another-world 与来源签名（「听说的」这个身份是**数据**，不是注释）');
  a(rows.every(function (r) { return r.heard === 0; }), 'v2154/wb B12b: 刚收下的传说 heard 从 0 起算（「收下」与「传开过」是两件事）');

  // B13 重复导入 ⇒ all-duplicates（ok:true 的读数，不是坏状态）
  const dup = WB.importLegends(pack);
  a(dup.ok === true && dup.added === 0 && dup.reason === 'all-duplicates' && dup.dup === 4,
    'v2154/wb B13: 全重复 ⇒ ok:true / added:0 / all-duplicates（「都收过」不是「别处什么都没传」）');

  // B14 坏负载三码
  a(WB.importLegends(null).reason === 'missing-fields', 'v2154/wb B14: 无包 ⇒ missing-fields');
  a(WB.importLegends({ sig: 'cc22', legends: 'x' }).reason === 'bad-payload', 'v2154/wb B14b: legends 不是数组 ⇒ bad-payload');
  a(WB.importLegends({ sig: 'cc22', legends: [] }).reason === 'no-legends', 'v2154/wb B14c: 空包 ⇒ no-legends（与 bad-payload 分开：一个要改负载形态、一个要改来源）');
  const mal = WB.importLegends({ sig: 'cc22', legends: [{ kind: 'zzz', title: 't' }, { kind: 'war', title: '好的一条' }] });
  a(mal.ok === true && mal.added === 1 && mal.malformed === 1,
    'v2154/wb B15: 档位不在闭集的行**逐条剔除**并如实报数（一个来源写错一档，不该让其余几条一起进不来）');
  a(WB.importLegends({ sig: 'cc22', legends: [{ kind: 'zzz', title: 't' }] }).reason === 'nothing-to-import',
    'v2154/wb B15b: 整包一条都收不下 ⇒ nothing-to-import（与 all-duplicates 分开：一个要改来源，一个要改去重口径）');

  // B16 转投 rumor：先落事实、再起链；链 id 由事实键派生
  const one = WB.view().rows[0];
  const r1 = WB.toRumor(one.id);
  a(r1.ok === true && r1.factAdded === true && r1.chain === 'rm_' + r1.factKey,
    'v2154/wb B16: 转投先落一条世界事实、再起链（链 id 由事实键派生，实 ' + r1.chain + '）');
  a(WA.store.get().worldFacts.some(function (w) { return w.key === r1.factKey; }),
    'v2154/wb B16b: 事实真落进 worldFacts（不落事实而直接起链，唯一结果是这条传说永远传不出去）');
  a(WB.view().rows.filter(function (r) { return r.id === one.id; })[0].heard === 1, 'v2154/wb B16c: 转投一次则 heard +1');
  const r1b = WB.toRumor(one.id);
  a(r1b.ok === false && r1b.factAdded === false && r1b.reason === 'exists',
    'v2154/wb B17: 同一事实只落一次、链只起一条（第二次如实透传 rumor 侧原因，实 ' + r1b.reason + '）');
  a(WA.store.get().worldFacts.filter(function (w) { return w.key === r1.factKey; }).length === 1,
    'v2154/wb B17d: 世界事实不会因为「又转投一次」而重复落盘');
  a(WB.toRumor('lg_不存在').reason === 'unknown-legend', 'v2154/wb B17b: 未知传说 ⇒ unknown-legend（不凭空编一条事实）');
  a(WB.toRumor('').reason === 'missing-fields', 'v2154/wb B17c: 空 id ⇒ missing-fields');

  // B18 注入块：只念收进来的传说，且逐条标明来自别处
  const blk = WB.buildBlock();
  a(blk.indexOf('[远方的传说]') === 0, 'v2154/wb B18: 注入块以标题起头');
  a(blk.indexOf('来自：琥珀世界') > 0 && blk.indexOf('不是本世界发生过的') > 0
    && blk.indexOf('不得') > 0,
    'v2154/wb B18b: 每条标明来源、并声明「不是本世界发生过的」—— 没这条标注，模型会把远方事当成本地既成事实写下去');
  WB.setSettings({ maxItems: 1 });
  a(WB.buildBlock().split('- ').length - 1 <= 1, 'v2154/wb B19: 注入块按 maxItems 截断（实上限 1）');
  WB.setSettings({ maxItems: 1 });

  // B20 环 cap 与 bounds
  const big = { sig: 'dd33ee44', legends: [] };
  for (let i = 0; i < 8; i++) big.legends.push({ kind: 'war', title: '远方战事' + i, summary: '第' + i + '次。' });
  WB.setSettings({ maxLegends: 4 });
  WB.importLegends(big);
  a(WB.stat().legends <= 4, 'v2154/wb B20: 传说环按 maxLegends 截断（实 ' + WB.stat().legends + '）');
  WB.setSettings({ maxLegends: 999, maxExported: 999, maxItems: 99 });
  const g = WB.getSettings();
  a(g.maxLegends <= 96 && g.maxLegends >= 4, 'v2154/wb B21: maxLegends 越界被收进界内（实 ' + g.maxLegends + '）');
  a(g.maxExported <= 48 && g.maxExported >= 1, 'v2154/wb B21b: maxExported 越界被收进界内（实 ' + g.maxExported + '）');
  a(g.maxItems <= 12 && g.maxItems >= 1, 'v2154/wb B21c: maxItems 越界被收进界内（实 ' + g.maxItems + '）');

  // B22 档位归类是**单向查表**、认不出即 null（不回落任何档）
  const kinds = WB.KINDS_OF;
  a(kinds.war.indexOf('battle') >= 0 && Object.keys(WB.LEGEND_LABEL).join(',') === 'war,crime,rise',
    'v2154/wb B22: 三档闭集与档位标签成表（自造档位 = 自造判定，下一手接不上）');
  a(WB.stat().faults['self-origin'] >= 1 && WB.stat().faults['unknown-legend'] >= 1,
    'v2154/wb B23: 拒收进 faults 分桶（可归因，不是一句「没成功」）');
  a(WB.stat().kinds && WB.stat().kinds.length === 3, 'v2154/wb B23b: 台账随读数带出三档闭集');
}

// ── N 负控制（真源码破坏 → 装载破坏副本 → 在副本上重跑同款真判据）──
function runNegative(a) {
  const orig = fs.readFileSync(path.join(BASE, REL), 'utf8');

  // N0 锚点必须恰中 1 次（锚点漂移即「负控制作废」）
  if (countOcc(orig, ANCHOR) !== 1) throw new Error('N0 锚点未恰中 1 次：' + countOcc(orig, ANCHOR));

  // N1 真源码破坏：摘掉「同签名即拒收」⇒ 本世界自己的回灌必须被放行（这就是本版点名要防的假读数）
  const broken1 = orig.replace(ANCHOR,
    "    if (false && from && wk.sig && from === wk.sig) { noteFault('self-origin'); return { ok: false, reason: 'self-origin', sig: wk.sig }; }");
  if (broken1 === orig) throw new Error('N1 破坏没有改变源码');
  const WA1 = fresh((function () { const o = {}; o[REL] = broken1; return o; })());
  reset(WA1); seedChronicle(WA1);
  const ex1 = WA1.worldBridge.exportLegends();
  const r1 = WA1.worldBridge.importLegends(ex1.pack);
  a(r1.reason !== 'self-origin',
    'v2154/wb N1: 摘掉同签名守卫后回灌不再被拒收（reason ' + r1.reason + ' / added ' + r1.added + '）—— 判据对破坏敏感');

  // N2 真源码破坏：把脱敏判据改成恒假 ⇒ 私密句必须原样进包
  const broken2 = orig.replace(ANCHOR2, "      const bad = false;");
  if (broken2 === orig) throw new Error('N2 破坏没有改变源码');
  const WA2 = fresh((function () { const o = {}; o[REL] = broken2; return o; })());
  reset(WA2); seedChronicle(WA2);
  const ex2 = WA2.worldBridge.exportLegends();
  a(anyPrivate(WA2, ex2.pack) === true && ex2.dropped === 0,
    'v2154/wb N2: 摘掉脱敏判据后私密句原样进包（含私密 ' + anyPrivate(WA2, ex2.pack) + ' / 整条剔除 ' + ex2.dropped + '）—— 脱敏真是判据，不是注释');

  // N3 真文件逐字未变（破坏只发生在内存副本上）
  a(fs.readFileSync(path.join(BASE, REL), 'utf8') === orig, 'v2154/wb N3: 真源码文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, ANCHOR, ANCHOR2, runA, runB, runAll, runNegative };

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  ✗ 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  ✗ 负控制抛出：' + e.message); }
  console.log('WORLD-BRIDGE-V2154: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}
