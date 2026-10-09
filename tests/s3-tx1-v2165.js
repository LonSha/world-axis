#!/usr/bin/env node
// v2.165.0 专锁（TX1）：可谈判、可履约的势力外交（engines/diplomacy.js）。
//
// ── 本锁治的三件事（TX1 原文逐句落地）──────────────────────────────
//   TX1 要求「为势力对建立稳定 pairId、双向态度、关系状态、有效条约及变化来源」。
//   它与 v2.139.0 的 faction-graph 是**同一族问题的两个档位**：
//     faction-graph（推导）：从双方各自的对外态度档位算出关系图，边恒为 derived:true；
//     本模块（事实）：成对条目 / 双边态度 / 条约 / 有效期 / 履约回执。
//   本锁锁的就是这条分水岭，以及它带来的三处**静默失效**风险：
//     ① **推导值冒充事实**：把 faction-graph 算出来的边静默写进 pairs，于是「算出来的」
//        与「谈成的」在读数上同形 —— 而「我们什么时候跟他结盟了」永远答不出来。
//     ② **非对称态度被合成一个数**：A 对 B 与 B 对 A 是两个独立读数；合成一个数会让
//        「一方示好、另一方防备」这种最常见的局面在读数上消失。
//     ③ **到期条款没人收**：until 过了却仍算有效 ⇒ 一张早该失效的禁运永远挂在商路上。
//
// ── 回执口径（v2.165.0 起，全文件唯一真源 = 下方 rc()）─────────────
//   `store.transact` 的外层返回值是**事务回执**（ok/persisted/applied/state/result），
//   模块自己的业务回执在 `result` 里。两者**不能混读**：业务拒收（如 `disabled`）在外面
//   同样是 `ok:true` —— 把外层当业务回执，拒收与成功在读数上完全同形。
//
// ── 判据分三层（按「静默失效」代价排序）──────────────────────────
//   A 结构面：具名词表、pairId 稳定性与对称性、恰六处 transact、六处登记同值。
//   B 行为面（真 API，不直调内部函数）：
//     B1 稳定 pairId：同一对势力永远得到同一个 id，**且与顺序无关**
//     B2 未知关系保持 unknown（不是「中立」——中立是一个谈成过的状态）
//     B3 提案不产生世界效果（pairs 不变；只落 proposals）
//     B4 有据答复：无 basis 拒收；非受方拒收；accept → accepted
//     B5 签约**不改写其他对**（A–B 签完，A–C 逐字节未变）
//     B6 权限预检：inst 缺席 ⇒ 拒收 no-authority（**不作默许放行**）
//     B7 非对称态度保留（两个方向各自独立，不合成一个数）
//     B8 重复条款拒收（同一对关系的同名条款仍在有效期 ⇒ duplicate-term）
//     B9 履约必须有据（无 evidence 拒 missing-evidence）+ 不得重复结算（already）
//     B10 到期收敛幂等（同一时刻连调两次，第二次 changed:0）
//     B11 开关默认关（关闭时不提案、不签约、不注入）
//   N 负控制（**真源码内存副本**破坏，两向自证）：每条先证「原版上同款判据为真」，
//     再证「破坏版上同款判据为假」，最后证「真源文件逐字未变」。
//     N0 前置：造局与提案链本身成功（否则后面每条都可能是「坏在别处」）
//     N1 pairId 不排序 ⇒ 同一对势力因「谁先谁后」得到**两个** id（缺陷复现）
//     N2 开关门改成「一律放行」⇒ 关闭状态下提案被静默收下（缺陷复现）
//     N3 到期门拆掉（until 不再比对）⇒ 过期条款仍算有效（缺陷复现）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');

const REL = 'engines/diplomacy.js';
const REL_STORE = 'core/store.js';
const REL_EVICT = 'core/evict.js';
const REL_DIAG = 'engines/tool-diag.js';
const REL_INDEX = 'index.js';
const REL_RUN = 'tests/run.js';
const REL_PANEL = 'ui/panel.js';
// ── 锚点（真源码里各恰中 1 次）─────────────────────────────────
// 锚点一取**pairId 的排序输入面**：少了 `[a,b].sort()`，同一对势力按「谁先谁后」得到两个 id，
//   而两个 id 在读数上与「世界上有两段关系」完全同形 —— 其中一个必然先过期。
const A_PAIR = "    return 'dp_' + sig([a, b].sort().join('|'));";
// 锚点二取**开关门**：默认关是刻意的（外交会改世界：禁运真的断商路）。
const A_GATE = "    if (!st.enabled) return no('disabled', { hint: '外交总开关关闭（默认关）' });";
// 锚点三取**到期比对**：`until !== null && until <= now` 是「到期」这件事的唯一实现处。
const A_EXPIRE = "          if (x.status === 'active' && x.until !== null && x.until <= now) {";
// 锚点四取**权限预检**：查不到 inst 一律拒收（查不到与有权必须不同形）。
const A_AUTH = "        return { ok: false, hint: 'inst 权限面缺席 ⇒ 无法证明有权（不作默许放行）' };";
// 锚点五取**非对称态度**：att 是 { first, second } 两个独立读数。
const A_ATT = "        state: 'contact', att: { first: '中立', second: '中立' },";
// 锚点六取**条款白名单**：自造条款等于自造权力（条款不成表，执行方无从写代码）。
const A_TERMS = "  const TERMS = ['trade', 'mutual-aid', 'armistice', 'embargo'];";
const A_CODES = "  const CODES = ['disabled', 'missing-fields', 'unknown-faction', 'same-faction', 'bad-term', 'bad-duration',";

function countOcc(s, sub) { return s.split(sub).length - 1; }
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function ov(file, src) { const o = {}; o[file] = src; return o; }

let __seq = 0;
/** 起一个干净宿主（每例独立聊天 id —— 上一例的世界会黏在 memCache 上）。 */
function boot(srcOv) {
  const chatId = 'tx1_' + (++__seq);
  const WA = sync.fresh(srcOv ? { srcOverride: srcOv } : {}).WA;
  try {
    const c = global.SillyTavern.getContext();
    c.chatId = chatId; c.chatMetadata = {};
    c.chat = [{ is_user: true, mes: 'TX1 专锁锚点楼层：三方使节的车马停在驿馆外。', swipe_id: 0 }];
  } catch (e) {}
  WA.store.init();
  // 每例隔离设置真源：settingsBus 走 localStorage（跨 chat），上一例 setSettings(true)
  //   不得伪装成下一例的「默认关」。业务例随后显式 setSettings(true)。
  try { if (WA.diplomacy && WA.diplomacy.setSettings) WA.diplomacy.setSettings({ enabled: false }); } catch (e) {}
  return WA;
}
/**
 * 造一个**带势力的世界**（三势力 A/B/C —— B5 的「A–B 签约不改写 A–C」需要第三个）。
 *   势力进 evolution.factions（那是 `propose` 校验势力存在性的真源）。
 */
function bones(WA, tag) {
  WA.store.transact(function (d) {
    // **只造局，不碰外交面**：旧版在这里把 `d.diplomacy` 覆写成空表，B3b 的「提案前后
    //   pairs 逐字节未变」基线于是被自己重置过（前后都是空表，判据成了同义反复），
    //   而 N2 的「默认关」也会被这一笔写回默认 —— 造局的函数不该顺手改被测对象的开关。
    d.evolution = Object.assign({}, d.evolution, {
      round: 0,
      factions: [
        { id: 'fa_' + tag + 'a', name: tag + '甲盟', power: 40, status: '稳固', relation: '中立' },
        { id: 'fa_' + tag + 'b', name: tag + '乙邦', power: 35, status: '稳固', relation: '中立' },
        { id: 'fa_' + tag + 'c', name: tag + '丙国', power: 30, status: '稳固', relation: '中立' }
      ]
    });
  }, 'tx1:fa');
  return { a: tag + '甲盟', b: tag + '乙邦', c: tag + '丙国' };
}
/** 让某势力**有权签**：装一个带 approve 权限的职位并任职（读 inst 真源，不替它答）。 */
function empower(WA, faction) {
  // 走 **inst 的真源三写口**（新签名：`charter(id,{kind})` → `post(id,title,{perms})` →
  //   `assign(id,title,person)`）。旧版按 `inst.assign({post,person,org})` 调用，
  //   而 inst 早已改成新签名 ⇒ 一律 `unknown-post`——**专锁不能自带一份过时的 inst 假壳**：
  //   那样测的就不是「外交是否问了制度」，而是「假壳是否还认得老签名」。
  //   注意 `org.posts[].title` 才是职位名（旧版记为 `name` 的写法同样会静默失配）。
  try {
    WA.inst.setSettings({ enabled: true });
    const og = 'og_' + faction;
    if (!WA.inst.charter(og, { kind: '帮派', name: faction }).ok) return false;
    if (!WA.inst.post(og, '盟主', { perms: ['approve', 'grant'] }).ok) return false;
    const r = WA.inst.assign(og, '盟主', faction);
    if (!r || r.ok !== true) return false;
    // 两向自证：**真的**能拍到板了（不是「写进去了」就算数）
    const au = WA.inst.authority(og, faction);
    return !!(au && au.ok && au.canApprove);
  } catch (e) { return false; }
}
/**
 * 业务回执解包：v2.165.0 起 `store.transact` 的外层返回值是**事务回执**
 *   （`{ ok, persisted, applied, state, result }`），模块自己的业务回执在 `result` 里。
 *   两条**不能混读**：外层 `ok:true` 只说「事务落盘了」，业务拒收（如 `disabled`）
 *   照样是外层 ok —— 把外层当业务回执，`disabled` 与「成功」在读数上完全同形。
 *   本助手是这一层口径的**单一真源**（判据里不得再各处手抄 `.result`）。
 */
function rc(r) {
  if (!r || typeof r !== 'object') return { ok: false, reason: 'no-receipt' };
  return (r.result && typeof r.result === 'object') ? r.result : r;
}
function pairsSnap(WA) { const d = (WA.store.get() || {}).diplomacy || {}; return JSON.stringify(d.pairs || {}); }

// ── A 结构面 ─────────────────────────────────────────────────
function runA(a) {
  const src = read(REL), st = read(REL_STORE), ev = read(REL_EVICT), dg = read(REL_DIAG),
        ix = read(REL_INDEX), rn = read(REL_RUN), pn = read(REL_PANEL);
  a(countOcc(src, A_PAIR) === 1, 'v2165/tx1 A1: pairId 排序输入面锚点恰中 1 次（实 ' + countOcc(src, A_PAIR) + '）');
  a(countOcc(src, A_GATE) === 1, 'v2165/tx1 A2: 开关门锚点恰中 1 次（实 ' + countOcc(src, A_GATE) + '）');
  a(countOcc(src, A_EXPIRE) === 1, 'v2165/tx1 A3: 到期比对锚点恰中 1 次（实 ' + countOcc(src, A_EXPIRE) + '）');
  a(countOcc(src, A_AUTH) === 1, 'v2165/tx1 A4: 权限预检锚点恰中 1 次（实 ' + countOcc(src, A_AUTH) + '）');
  a(countOcc(src, A_ATT) === 1, 'v2165/tx1 A5: 非对称态度锚点恰中 1 次（实 ' + countOcc(src, A_ATT) + '）');
  a(countOcc(src, A_TERMS) === 1, 'v2165/tx1 A6: 条款白名单锚点恰中 1 次（实 ' + countOcc(src, A_TERMS) + '）');
  a(countOcc(src, A_CODES) === 1, 'v2165/tx1 A7: 拒收码表锚点恰中 1 次（实 ' + countOcc(src, A_CODES) + '）');
  // 具名词表：自造条款 / 自造状态一律拒收（不成表的权力，下一任无法接手）
  // 判**可执行面**：不取「源码里有没有这个词」——注释里提 `FACTION_RELATION` 恰恰是本条边界
  //   要留下的证据（写清楚「为什么不用它」）。取的应当是：词表取值里没有一个档位词。
  const statesLine = (src.split('\n').filter(function (l) { return l.indexOf('const STATES = [') >= 0; })[0] || '');
  const relWords = ['血盟', '盟友', '友好', '冷淡', '敌对', '世仇'];
  a(src.indexOf('TERMS = [\'trade\', \'mutual-aid\', \'armistice\', \'embargo\']') >= 0
    && statesLine.length > 0
    && relWords.every(function (w) { return statesLine.indexOf(w) < 0; }),
    'v2165/tx1 A8: 状态表取值**不复用** evolution 的立场档位词（单方立场档位 ≠ 成对关系状态；实 [' + statesLine.trim() + ']）');
  a(src.indexOf("WA.registerModule('engines/diplomacy.js'") >= 0, 'v2165/tx1 A9: 模块自报登记');
  a(src.indexOf('__settingsRegs = (WA.__settingsRegs || []).concat([__REG])') >= 0,
    'v2165/tx1 A10: 设置键走 __settingsRegs 登记（自检可见，不是黑盒）');
  a(countOcc(src, 'WA.store.transact(') === 6 && countOcc(src, '.transact(') === 6,
    'v2165/tx1 A11: 全模块恰六处 transact 调用点（提案 / 答复 / 签约 / 履约 / 违约 / 到期；实 '
      + countOcc(src, '.transact(') + '）—— 新增第七处写面必须显式改本判据，不许静默长出');
  // 六处登记面（少一处即静默降级）
  a(ix.indexOf("'engines/diplomacy.js',") >= 0, 'v2165/tx1 A12: index.js LOAD_ORDER 已登记');
  a(rn.indexOf("'engines/diplomacy.js',") >= 0, 'v2165/tx1 A13: tests/run.js LOAD 已登记（与 index 同序）');
  a(dg.indexOf("'engines/diplomacy.js': 'diplomacy'") >= 0 && dg.indexOf('secDiplomacy()') >= 0
    && dg.indexOf('diplomacy: secDiplomacy()') >= 0,
    'v2165/tx1 A14: tool-diag 三件齐做（MODULE_EXPORTS + 诊断节 + collect 汇总行）');
  a(st.indexOf('diplomacy: { pairs: {}, proposals: {}, seq: 0 },') >= 0,
    'v2165/tx1 A15: store 骨架**物化** diplomacy 容器（登记了却不在骨架里，registryParity 会报未物化）');
  a(st.indexOf("'diplomacy.pairs':") >= 0 && ev.indexOf("'diplomacy.pairs':") >= 0
    && st.indexOf("'diplomacy.proposals':") >= 0 && ev.indexOf("'diplomacy.proposals':") >= 0,
    'v2165/tx1 A16: 两环容量登记四处逐键同名登记（store 容量 + evict 侧声明；v2.173.0 起 evict 侧落 NON_EVICT 而非 SITES）');
  a(pn.indexOf('id="wa-dp-sign"') >= 0 && pn.indexOf("'#wa-dp-sign'") >= 0,
    'v2165/tx1 A17: 面板有产品消费方（渲染 + 绑定）—— 死导出门禁的另一半');
  a(dg.indexOf("'wa-dp-sign'") >= 0 && dg.indexOf("'wa-dp-out'") >= 0,
    'v2165/tx1 A18: 面板控件登记进 UI_BINDINGS 守卫表');
  const self = read('tests/s3-tx1-v2165.js');
  a(countOcc(self, A_PAIR) >= 1 && countOcc(self, A_GATE) >= 1 && countOcc(self, A_EXPIRE) >= 1
    && countOcc(self, A_AUTH) >= 1 && countOcc(self, A_ATT) >= 1 && countOcc(self, A_TERMS) >= 1
    && countOcc(self, A_CODES) >= 1,
    'v2165/tx1 A19: 七个锚点在本文件里至少各引用 1 次');
  // 两处登记逐键同值（cap 与 kind 都要对得上）
  //   v2.173.0（TX4b）口径迁移：两环是**写入侧硬上界**（满即拒写，既有项一条不动），
  //   与 region.places / stage.metrics / binding.* 同族 ⇒ 从 SITES 迁入 NON_EVICT，
  //   **不走 evict**（否则就是零调用挤出站点）。故本判据改为三条同时成立：
  //     ① store.sizeCaps() 里 cap:'per-call' + kind:'object'（容量声明真源仍在 store）
  //     ② evict.nonEvictDecls() 里两环存在（「为什么不给它记账」是声明过的决定）
  //     ③ evict.siteDecls() 里两环**不存在**（明确不在挤出站点表 = 不走 evict 的可执行证据；
  //        同时防止有人把它加回 SITES，那会重新变成零调用站点）
  //   三条合起来比旧版（只钉「在 SITES」）更强，不是放宽。
  const WA = boot();
  const caps = WA.store.sizeCaps ? WA.store.sizeCaps() : {};
  const decls = WA.evict.siteDecls ? WA.evict.siteDecls() : {};
  const nonEvict = WA.evict.nonEvictDecls ? WA.evict.nonEvictDecls() : {};
  a(!!caps['diplomacy.pairs'] && !!caps['diplomacy.proposals']
    && caps['diplomacy.pairs'].cap === 'per-call' && caps['diplomacy.pairs'].kind === 'object'
    && caps['diplomacy.proposals'].cap === 'per-call' && caps['diplomacy.proposals'].kind === 'object'
    && !!nonEvict['diplomacy.pairs'] && !!nonEvict['diplomacy.proposals']
    && !decls['diplomacy.pairs'] && !decls['diplomacy.proposals'],
    'v2165/tx1 A20: 容量声明真源在 store（per-call/object）+ 两环在 NON_EVICT 且**不在** SITES'
      + '（写入侧硬上界不走 evict；实 store '
      + JSON.stringify(caps['diplomacy.pairs'] && caps['diplomacy.pairs'].cap)
      + '/' + JSON.stringify(caps['diplomacy.pairs'] && caps['diplomacy.pairs'].kind)
      + ' · nonEvict ' + (!!nonEvict['diplomacy.pairs']) + '/' + (!!nonEvict['diplomacy.proposals'])
      + ' · siteDecls ' + JSON.stringify(decls['diplomacy.pairs'] || null) + '）');
  // 与 faction-graph 的分工必须在源码里写明（「不自动迁成事实」是 TX1 边界原文）
  a(src.indexOf('不自动迁成联盟或战争') >= 0 && src.indexOf('derived') >= 0,
    'v2165/tx1 A21: 模块头写明与 faction-graph 的分工（推导面 vs 事实面；推导结果不自动迁成事实）');
}

// ── B 行为面 ─────────────────────────────────────────────────
function runB(a) {
  // B11 开关默认关（先测：默认态下提案就被拒）
  const WA0 = boot();
  bones(WA0, 'tx1z');
  const off0 = rc(WA0.diplomacy.propose({ from: 'tx1z甲盟', to: 'tx1z乙邦', terms: [{ term: 'trade', days: null }] }));
  a(off0.ok === false && off0.reason === 'disabled',
    'v2165/tx1 B11: 开关**默认关** ⇒ 提案拒收 disabled（实 ' + off0.reason + '）—— 外交会改世界，默认不启动它');

  const WA = boot();
  WA.diplomacy.setSettings({ enabled: true, maxPairs: 24, maxTerms: 6, maxProposals: 16 });
  const F = bones(WA, 'tx1b');
  const D = WA.diplomacy;

  // B1 稳定 pairId：同输入同 id，且**与顺序无关**
  a(D.pairId(F.a, F.b) === D.pairId(F.b, F.a) && D.pairId(F.a, F.b).indexOf('dp_') === 0,
    'v2165/tx1 B1: 同一对势力永远得到同一个 pairId，且**与顺序无关**（' + D.pairId(F.a, F.b) + '）');

  // B2 未知关系保持 unknown（不是「中立」）
  const pv0 = D.pairView(F.a, F.b);
  a(pv0.ok === true && pv0.state === 'unknown' && pv0.att.a2b === null,
    'v2165/tx1 B2: 没有成对条目 ⇒ unknown 且态度为 null（实 ' + pv0.state + '）'
      + '—— 「未接触」不等于「中立」（中立是一个谈成过的状态）');

  // B3 提案不产生世界效果
  const pairsBefore = pairsSnap(WA);
  const pr = rc(D.propose({ from: F.a, to: F.b, terms: [{ term: 'trade', days: 30 }, { term: 'mutual-aid', days: 30 }] }));
  a(pr.ok === true && pr.stage === 'proposed', 'v2165/tx1 B3: 提案成立（实 ' + pr.reason + '/' + pr.stage + '）');
  a(pairsSnap(WA) === pairsBefore, 'v2165/tx1 B3b: 提案**不产生正式世界效果**（pairs 逐字节未变 —— 未签约提案不落事实表）');

  // B4 有据答复
  const bad4 = rc(D.reply({ id: pr.id, kind: 'accept', by: F.b, basis: '' }));
  a(bad4.ok === false && bad4.reason === 'missing-fields',
    'v2165/tx1 B4: 答复无依据 ⇒ 拒收（实 ' + bad4.reason + '）—— 无据答复不留存');
  const wrong4 = rc(D.reply({ id: pr.id, kind: 'accept', by: F.c, basis: '丙国越权' }));
  a(wrong4.ok === false && wrong4.reason === 'no-authority',
    'v2165/tx1 B4b: 非受方答复 ⇒ 拒收 no-authority（实 ' + wrong4.reason + '）');
  const rp4 = rc(D.reply({ id: pr.id, kind: 'accept', by: F.b, basis: '贵邦上月借道未还，此番通商算作抵偿' }));
  a(rp4.ok === true && rp4.stage === 'accepted',
    'v2165/tx1 B4c: 有据答复 ⇒ accepted（实 ' + rp4.reason + '/' + rp4.stage + '）');

  // B6 权限预检：inst 未认可 ⇒ 拒收（不作默许放行）
  const signNoAuth = rc(D.sign({ id: pr.id }));
  a(signNoAuth.ok === false && signNoAuth.reason === 'no-authority',
    'v2165/tx1 B6: 权限预检未过 ⇒ 拒收 no-authority（实 ' + signNoAuth.reason + '）'
      + '—— 「查不到」与「有权」在读数上必须不同形（放行会让缺席的制度变成无门槛）');

  // 给甲盟装上带 approve 的职位与任职，再签
  const emp = empower(WA, F.a);
  a(emp === true, 'v2165/tx1 B6-pre: 已给甲盟装上带 approve 的职位并任职（inst 真源）');
  const pairsBefore5 = pairsSnap(WA);
  const sg = rc(D.sign({ id: pr.id }));
  a(sg.ok === true && sg.pairId === D.pairId(F.a, F.b) && sg.terms.length === 2,
    'v2165/tx1 B5: 签约成功且 pairId 与 pairId() 一致（实 ' + sg.reason + '/' + sg.pairId + '）');

  // B5b A–B 签约不改写 A–C：丙国那一对**根本没有条目**
  a(D.pairView(F.a, F.c).state === 'unknown',
    'v2165/tx1 B5b: A–B 签约**不改写 A–C**（丙国那对仍是 unknown）—— 没有全局关系矩阵，一处改不会处处变');
  a(pairsSnap(WA) !== pairsBefore5, 'v2165/tx1 B5c: 签约**确实**写了 pairs（与 B3 的「提案不写」形成对照）');

  // B7 非对称态度保留（两个方向各自独立，不合成一个数）
  WA.store.transact(function (d) {
    const p = d.diplomacy.pairs[D.pairId(F.a, F.b)];
    const first = [F.a, F.b].sort()[0];
    // 刻意设成**不对称**：一方示好、另一方防备
    p.att.first = (first === F.a) ? '友好' : '冷淡';
    p.att.second = (first === F.a) ? '冷淡' : '友好';
  }, 'tx1:att');
  const pv7 = D.pairView(F.a, F.b);
  a(pv7.att.a2b === '友好' && pv7.att.b2a === '冷淡',
    'v2165/tx1 B7: 非对称态度**各自保留**（甲→乙 ' + pv7.att.a2b + ' / 乙→甲 ' + pv7.att.b2a + '）'
      + '—— 合成一个数会让「一方示好、另一方防备」这种最常见的局面在读数上消失');

  // B8 重复条款拒收（同一对关系的同名条款仍在有效期）
  const pr8 = rc(D.propose({ from: F.a, to: F.b, terms: [{ term: 'trade', days: 30 }] }));
  const rp8 = rc(D.reply({ id: pr8.id, kind: 'accept', by: F.b, basis: '再通商一次也无妨' }));
  const sg8 = rc(D.sign({ id: pr8.id }));
  a(pr8.ok === true && rp8.ok === true && sg8.ok === false && sg8.reason === 'duplicate-term',
    'v2165/tx1 B8: 同名条款仍在有效期 ⇒ 拒收 duplicate-term（实 ' + sg8.reason + '）'
      + '—— 同一对关系的同一条款只允许一条有效（否则「这条通商到哪天」有两个答案）');

  // B9 履约必须有据 + 不得重复结算
  const pid = D.pairId(F.a, F.b);
  const fNo = rc(D.fulfil({ pairId: pid, term: 'trade', evidence: '' }));
  a(fNo.ok === false && fNo.reason === 'missing-evidence',
    'v2165/tx1 B9: 履约无据 ⇒ 拒收 missing-evidence（实 ' + fNo.reason + '）—— 无据的「完成了」不结算');
  const f1 = rc(D.fulfil({ pairId: pid, term: 'trade', evidence: '船队回执 ship_12：三十车盐已入库' }));
  a(f1.ok === true && f1.status === 'fulfilled',
    'v2165/tx1 B9b: 有据履约 ⇒ fulfilled（实 ' + f1.reason + '/' + f1.status + '）');
  // 已结算后再结：该条款不再是 active ⇒ 不在有效期内
  const f2 = rc(D.fulfil({ pairId: pid, term: 'trade', evidence: '同一份回执再报一次' }));
  a(f2.ok === false && f2.reason === 'unknown-pair',
    'v2165/tx1 B9c: 同一完成证据不得重复结算（该条款已非 active ⇒ 实 ' + f2.reason + '）');

  // B10 到期收敛幂等
  const e1 = rc(D.expire({}));
  const e2 = rc(D.expire({}));
  a(e1.ok === true && e2.ok === true && e2.changed === 0,
    'v2165/tx1 B10: 到期收敛**幂等**（首次 changed ' + e1.changed + '，同一时刻第二次 changed '
      + e2.changed + '）—— 到期是读数驱动的收敛，不是每次 tick 都改一次状态');

  // B10b 到期后条款真的失效（换一个人为「很久以后」的 at 再收敛）
  const D2 = WA.diplomacy;
  const far = Date.now() + 400 * 86400000;   // 400 天后（trade 是 30 天）
  const e3 = rc(D2.expire({ at: far }));
  const pv10 = D2.pairView(F.a, F.b);
  a(e3.ok === true && pv10.active.length === 0,
    'v2165/tx1 B10b: 过了有效期后收敛 ⇒ 有效条款归零（实 ' + pv10.active.length + ' 条）'
      + '—— 一张早该失效的禁运不许永远挂在商路上');
}

// ── N 负控制：真源码内存副本破坏，两向自证 ──────────────────
function runNegative(a) {
  const orig = read(REL);

  // N0 前置：造局与提案链本身成功 —— 否则后面每条「破坏版行为变了」都可能是坏在别处
  const WAsrc = boot();
  WAsrc.diplomacy.setSettings({ enabled: true });
  const Fsrc = bones(WAsrc, 'tx1ns');
  const psrc = rc(WAsrc.diplomacy.propose({ from: Fsrc.a, to: Fsrc.b, terms: [{ term: 'armistice', days: 10 }] }));
  a(psrc.ok === true, 'v2165/tx1 N0: 造局与提案链本身成功（负控制的前置真判据；实 ' + psrc.reason + '）');

  // ── N1 pairId 不排序 ⇒ 同一对势力因「谁先谁后」得到两个 id ──
  //   前置真判据：原版上 pairId(a,b) === pairId(b,a)。
  const WAp1 = boot();
  const Fp1 = bones(WAp1, 'tx1n1o');
  a(WAp1.diplomacy.pairId(Fp1.a, Fp1.b) === WAp1.diplomacy.pairId(Fp1.b, Fp1.a),
    'v2165/tx1 N1-pre: 原版上 pairId 与顺序无关（' + WAp1.diplomacy.pairId(Fp1.a, Fp1.b) + '）');
  //   破坏：把 `[a, b].sort()` 拿掉（直接按传入顺序拼）。
  const b1 = orig.replace(A_PAIR, "    return 'dp_' + sig(a + '|' + b);");
  if (b1 === orig) throw new Error('N1 破坏没有改变源码');
  const WA1 = boot(ov(REL, b1));
  const F1 = { a: 'n1甲', b: 'n1乙' };
  const id1ab = WA1.diplomacy.pairId(F1.a, F1.b), id1ba = WA1.diplomacy.pairId(F1.b, F1.a);
  a(id1ab !== id1ba,
    'v2165/tx1 N1: 拆掉排序后，同一对势力按「谁先谁后」得到**两个** id（' + id1ab + ' vs ' + id1ba + '）'
      + '—— 两个 id 在读数上与「世界上有两段关系」同形，而其中一个必然先过期');

  // ── N2 开关门改成「一律放行」⇒ 关闭状态下提案被静默收下 ──
  //   前置真判据：原版在**默认关**下拒收 disabled。
  const WAo2 = boot();
  // 次序是判据的一部分：`bones()` 把 `d.diplomacy` 覆写成空容器 ⇒ **先造局、再开开关**；
  //   反过来写的话开关会被覆写回默认关，于是这条前置判据测的其实是「bones 之后还是关的」。
  bones(WAo2, 'tx1n2o');
  const rO2 = rc(WAo2.diplomacy.propose({ from: 'tx1n2o甲盟', to: 'tx1n2o乙邦', terms: [{ term: 'trade', days: null }] }));
  a(rO2.ok === false && rO2.reason === 'disabled',
    'v2165/tx1 N2-pre: 原版在默认关下拒收 disabled（实 ' + rO2.reason + '）');
  const b2 = orig.replace(A_GATE, "    if (false) return no('disabled', { hint: '' });");
  if (b2 === orig) throw new Error('N2 破坏没有改变源码');
  const WA2 = boot(ov(REL, b2));
  bones(WA2, 'tx1n2');
  const rN2 = rc(WA2.diplomacy.propose({ from: 'tx1n2甲盟', to: 'tx1n2乙邦', terms: [{ term: 'trade', days: null }] }));
  a(rN2.ok === true,
    'v2165/tx1 N2: 拆掉开关门后，**关闭状态**下的提案被静默收下（实 ok ' + rN2.ok + '）'
      + '—— 默认关形同虚设，一个没人要求过的机制开始改存档');

  // ── N3 到期门拆掉（until 不再比对）⇒ 过期条款仍算有效 ──
  //   前置真判据：原版在「很久以后」收敛后有效条款归零。
  const WAo3 = boot();
  WAo3.diplomacy.setSettings({ enabled: true });
  const Fo3 = bones(WAo3, 'tx1n3o');
  empower(WAo3, Fo3.a);
  const po3 = rc(WAo3.diplomacy.propose({ from: Fo3.a, to: Fo3.b, terms: [{ term: 'embargo', days: 5 }] }));
  WAo3.diplomacy.reply({ id: po3.id, kind: 'accept', by: Fo3.b, basis: '暂且应下' });
  const so3 = rc(WAo3.diplomacy.sign({ id: po3.id }));
  const far3 = Date.now() + 400 * 86400000;
  WAo3.diplomacy.expire({ at: far3 });
  a(so3.ok === true && WAo3.diplomacy.pairView(Fo3.a, Fo3.b).active.length === 0,
    'v2165/tx1 N3-pre: 原版上过期条款真失效（有效条款 '
      + WAo3.diplomacy.pairView(Fo3.a, Fo3.b).active.length + ' 条）');
  const b3 = orig.replace(A_EXPIRE, "          if (false) {");
  if (b3 === orig) throw new Error('N3 破坏没有改变源码');
  const WA3 = boot(ov(REL, b3));
  WA3.diplomacy.setSettings({ enabled: true });
  const F3 = bones(WA3, 'tx1n3');
  empower(WA3, F3.a);
  const p3 = rc(WA3.diplomacy.propose({ from: F3.a, to: F3.b, terms: [{ term: 'embargo', days: 5 }] }));
  WA3.diplomacy.reply({ id: p3.id, kind: 'accept', by: F3.b, basis: '暂且应下' });
  const s3 = rc(WA3.diplomacy.sign({ id: p3.id }));
  WA3.diplomacy.expire({ at: far3 });
  const act3 = WA3.diplomacy.pairView(F3.a, F3.b).active;
  a(s3.ok === true && act3.length === 1,
    'v2165/tx1 N3: 拆掉到期门后，**早该失效**的条款仍算有效（实 ' + act3.length + ' 条）'
      + '—— 一张过期的禁运永远挂在商路上，而读数上它与「正在禁运」完全同形');

  // ── N4 真文件逐字未变 ──
  a(read(REL) === orig, 'v2165/tx1 N4: 真源码文件逐字未变（破坏只在内存副本）');
}

function runAll(a) { runA(a); runB(a); }
module.exports = { REL, A_PAIR, A_GATE, A_EXPIRE, A_AUTH, A_ATT, A_TERMS, A_CODES, runA, runB, runAll, runNegative };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, msg) { if (cond) { pass++; } else { fail++; console.log('  \u2717 ' + msg); } };
  try { runAll(a); } catch (e) { fail++; console.log('  \u2717 抛出：' + e.message); }
  try { runNegative(a); } catch (e) { fail++; console.log('  \u2717 负控制抛出：' + e.message); }
  console.log('S3-TX1-V2165: pass ' + pass + ' / fail ' + fail);
  process.exit(fail ? 1 : 0);
}