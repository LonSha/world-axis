#!/usr/bin/env node
// WorldAxis tests/appearance-items-v2585.js —— v2.585.0（R261）外貌子项名单 × 要素库 data-only
//
// 【它治的两类「说了但没判据」】
//   ① 覆盖率只有**下限数字**：`COVERAGE_REQ` 说「L2 要 8 项」，于是同一处被数两遍也算 8 项、
//      八项全写在手上也算盖住了身体。判据是数字，不是「哪几处」。
//   ② 「要素库不进引擎」这句裁决被当成「要素库不落地」：词表一直躺在预设层，没有任何
//      可核验的交付物，于是「我们有词表吗」每轮都要重新讨论一次。
//
// 【本轮裁决（写死在锁里，免得下轮重开）】
//   · 子项**名单**进引擎 —— 它是判据（这一处写没写，可判定可拒收）；
//   · 描写**词表**不进引擎 —— 但**要有交付物**：engines/appearance-lexicon.js，data-only，
//     引擎不消费、不参与任何拒收（本锁 C4/C5 把这两条钉住）。
//   · 必盖项 = 名单前 N 项，N 取既有 COVERAGE_REQ ⇒ **不设第三张表**（第二份真源是本仓老病）。
//
// 【判据】（A 名单表本身 / B 名单级登记 / C 词库面 / D 两向自证）
//   A1 四层齐全且每层非空；A2 id 全局唯一（跨层重复也算错）；
//   A3 每层条数 ≥ 该层在四档里最大的下限；A4 label 非空；A5 requiredOf 长度 == COVERAGE_REQ（16 组）；
//   A6 required 是名单**前缀**（顺序即语义）；A7 coveragePlan 的 required/optional 不相交且并集齐全；
//   A8 未知档位退回 C 档而不抛。
//   B1 完整名单 ⇒ ok 且 row.items 入账、cover = 名单计数；B2 同项写两遍只计一次（dupItems 记账）；
//   B3 名单外 id ⇒ unknown-item（带层与 id）；B4 跨层用错同样 unknown-item；
//   B5 缺必盖项 ⇒ missing-item 且带中文名；B6 **名单优先于数字**（数字掩护不了名单）；
//   B7 名单外的项不被当成「多一项」（不给它发通过）。
//   C1 词库在位；C2 词库 id 集合与 LAYER_ITEMS **逐字相等**；C3 每个 id 至少 3 个词；
//   C4 词库只导出数据（无 buildBlock/settings/register 一类函数）+ DATA_ONLY 自述；
//   C5 appearance.js 源码**不出现** appearanceLexicon（引擎不消费词库，静态钉住）；
//   C6 「私处」这一处确实在 L2（露骨那部分真的进来了，不是嘴上说纳入）。
//   D1/D2 两向自证：改表即改判据（加一项 ⇒ 放行）、改下限即改必盖（C 档空了 ⇒ 放行），
//        两处都必须在**还原后**回到拒收 —— 否则证明的是「判据被关掉了」而不是「判据在表上」。
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const LAYERS = ['L1', 'L2', 'L3', 'L4'];

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA && !!WA.appearance, 'A0: WA.appearance 在位（本锁必须跑在真产品上）');
  const AP = WA.appearance;
  const ITEMS = AP.LAYER_ITEMS;
  const REQ = AP.COVERAGE_REQ;
  const TIERS = AP.TIERS;

  // ── A 名单表本身 ──────────────────────────────────────────────
  a(!!ITEMS && typeof ITEMS === 'object', 'A1a: LAYER_ITEMS 已导出');
  const allIds = [];
  LAYERS.forEach(function (L) {
    const list = ITEMS[L];
    a(Array.isArray(list) && list.length > 0, 'A1b: ' + L + ' 层有子项名单（实 ' + (Array.isArray(list) ? list.length : 'N/A') + ' 项）');
    (Array.isArray(list) ? list : []).forEach(function (it) {
      allIds.push(it.id);
      a(!!it.id && !!it.label, 'A4: ' + L + ' 的子项带 id 与中文名（' + it.id + '/' + it.label + '）');
    });
  });
  a(new Set(allIds).size === allIds.length,
    'A2: 子项 id 全局唯一（跨层重名也算错；实 ' + allIds.length + ' 项 / 去重 ' + new Set(allIds).size + '）');

  // A3：每层条数 ≥ 四档里该层最大的下限（否则「必盖项」会超出台账）
  LAYERS.forEach(function (L) {
    let maxNeed = 0;
    TIERS.forEach(function (t) { maxNeed = Math.max(maxNeed, Number((REQ[t] || {})[L]) || 0); });
    a(ITEMS[L].length >= maxNeed,
      'A3: ' + L + ' 条数（' + ITEMS[L].length + '）≥ 四档最大下限（' + maxNeed + '）');
  });

  // A5：requiredOf 的长度必须与 COVERAGE_REQ 逐格一致（16 组，不写第二份数字）
  let bad5 = [];
  TIERS.forEach(function (t) {
    LAYERS.forEach(function (L) {
      const got = AP.requiredOf(t, L);
      const want = Number((REQ[t] || {})[L]) || 0;
      if (!Array.isArray(got) || got.length !== want) bad5.push(t + '.' + L + '(' + (got || []).length + '≠' + want + ')');
    });
  });
  a(bad5.length === 0, 'A5: requiredOf 长度 == COVERAGE_REQ 逐格一致（坏 ' + bad5.length + ' 格: ' + bad5.slice(0, 3).join(',') + '）');

  // A6：required 必须是名单**前缀**（顺序即语义；否则「前 N 项」这句话就是假的）
  let bad6 = [];
  LAYERS.forEach(function (L) {
    const ids = ITEMS[L].map(function (x) { return x.id; });
    TIERS.forEach(function (t) {
      const req = AP.requiredOf(t, L);
      if (req.join(',') !== ids.slice(0, req.length).join(',')) bad6.push(t + '.' + L);
    });
  });
  a(bad6.length === 0, 'A6: required 是名单前缀（坏 ' + bad6.length + ' 格: ' + bad6.slice(0, 3).join(',') + '）');

  // A7：coveragePlan 自洽
  const plan = AP.coveragePlan('B');
  let bad7 = [];
  LAYERS.forEach(function (L) {
    const p = plan.layers[L] || {};
    const req = p.required || [], opt = p.optional || [];
    const inter = req.filter(function (x) { return opt.indexOf(x) >= 0; });
    const uni = req.concat(opt).slice().sort().join(',');
    const all = ITEMS[L].map(function (x) { return x.id; }).slice().sort().join(',');
    if (inter.length) bad7.push(L + ':交叠' + inter.length);
    if (uni !== all) bad7.push(L + ':并集不全');
    if ((p.need || 0) !== req.length) bad7.push(L + ':need≠required');
  });
  a(bad7.length === 0, 'A7: coveragePlan 的 required/optional 不相交、并集 = 全层、need 自洽（坏 ' + bad7.join('|') + '）');

  const planX = AP.coveragePlan('zzz');
  a(planX && planX.tier === 'C' && planX.layers && planX.layers.L1,
    'A8: 未知档位退回 C 档（不抛、不返回空壳）');

  // ── B 名单级登记 ──────────────────────────────────────────────
  const was = AP.getSettings ? AP.getSettings() : null;
  if (AP.setSettings) AP.setSettings({ enabled: true });
  function pick(tier) {
    const out = {};
    LAYERS.forEach(function (L) { out[L] = AP.requiredOf(tier, L).slice(); });
    return out;
  }
  try {
    const W1 = '__w2585_complete';
    const r1 = AP.register(W1, 'B', { items: pick('B') });
    a(r1.ok === true, 'B1a: 按 B 档必盖名单登记 ⇒ ok（实 ' + JSON.stringify(r1) + '）');
    const row1 = AP.read(W1);
    a(row1.ok && row1.items && row1.items.L1.length === REQ.B.L1,
      'B1b: 只读视图带 items（L1 实 ' + (row1.items ? row1.items.L1.length : 'null') + ' 项）');
    a(row1.ok && row1.cover && row1.cover.L2 === REQ.B.L2,
      'B1c: cover 由名单推出（L2 实 ' + (row1.cover ? row1.cover.L2 : 'null') + '）');

    // B2：同一项写两遍只计一次
    const W2 = '__w2585_dup';
    const dup = pick('B');
    dup.L1 = dup.L1.concat([dup.L1[0]]);
    const r2 = AP.register(W2, 'B', { items: dup });
    const row2 = AP.read(W2);
    a(r2.ok === true && row2.dupItems === 1,
      'B2a: 同项写两遍只计一次且 dupItems=1（实 ' + row2.dupItems + '）');
    a(row2.cover && row2.cover.L1 === REQ.B.L1,
      'B2b: 去重后 L1 计数不变（实 ' + (row2.cover ? row2.cover.L1 : 'null') + '）');

    // B3：名单外
    const W3 = '__w2585_unknown';
    const r3 = AP.register(W3, 'B', { items: { L1: ['eye-shape'], L2: ['tail'], L3: [], L4: [] } });
    a(r3.ok === false && r3.reason === 'unknown-item', 'B3a: 名单外子项 ⇒ unknown-item（实 ' + r3.reason + '）');
    a(Array.isArray(r3.outside) && r3.outside.length === 1 && r3.outside[0].id === 'tail' && r3.outside[0].layer === 'L2',
      'B3b: outside 带出「哪一层、哪个 id」（实 ' + JSON.stringify(r3.outside) + '）');

    // B4：跨层用错
    const W4 = '__w2585_cross';
    const r4 = AP.register(W4, 'B', { items: { L1: ['neck'], L2: [], L3: [], L4: [] } });
    a(r4.ok === false && r4.reason === 'unknown-item',
      'B4: 把 L2 的子项写进 L1 ⇒ 同样 unknown-item（不按 id 全局认账）');

    // B5：缺必盖项
    const W5 = '__w2585_missing';
    const short = pick('B');
    short.L2 = short.L2.slice(0, 1); // B 档 L2 要 3 项
    const r5 = AP.register(W5, 'B', { items: short });
    a(r5.ok === false && r5.reason === 'missing-item', 'B5a: 缺必盖项 ⇒ missing-item（实 ' + r5.reason + '）');
    a(Array.isArray(r5.missing) && r5.missing.length === REQ.B.L2 - 1 && r5.missing[0].label,
      'B5b: missing 带中文名（实 ' + JSON.stringify((r5.missing || []).slice(0, 2)) + '）');

    // B6：名单优先于数字 —— 数字填满、名单只有 1 项 ⇒ 仍按名单拒
    const W6 = '__w2585_numshadow';
    const r6 = AP.register(W6, 'B', {
      cover: { L1: 10, L2: 8, L3: 4, L4: 4 },
      items: { L1: ['eye-shape'], L2: ['neck'], L3: ['top'], L4: ['height'] }
    });
    a(r6.ok === false && r6.reason === 'missing-item',
      'B6: 数字填满也掩护不了名单（实 ' + r6.reason + '）—— 名单是现场，数字是手填');

    // B7：名单外的项不记账（不给它换来一次通过）
    const W7 = '__w2585_unknowncount';
    const r7 = AP.register(W7, 'C', { items: { L1: ['eye-shape', 'zzz'], L2: [], L3: [], L4: [] } });
    a(r7.ok === false && r7.reason === 'unknown-item',
      'B7: C 档 1 项合法 + 1 项名单外 ⇒ 拒 unknown-item（名单外不算「多一项」）');

    // ── C 词库面（data-only）────────────────────────────────────
    const LEX = WA.appearanceLexicon;
    a(!!LEX && !!LEX.LEXICON, 'C1: WA.appearanceLexicon 在位（词表有交付物，不是只在注释里）');
    let bad2 = [];
    LAYERS.forEach(function (L) {
      const aIds = ITEMS[L].map(function (x) { return x.id; }).sort().join(',');
      const bIds = Object.keys(LEX.LEXICON[L] || {}).sort().join(',');
      if (aIds !== bIds) bad2.push(L);
    });
    a(bad2.length === 0, 'C2: 词库 id 集合与 LAYER_ITEMS **逐字相等**（不齐的层: ' + bad2.join(',') + '）');
    let thin = [];
    LAYERS.forEach(function (L) {
      Object.keys(LEX.LEXICON[L] || {}).forEach(function (id) {
        const arr = LEX.LEXICON[L][id];
        if (!Array.isArray(arr) || arr.length < 3) thin.push(L + '.' + id + '(' + (arr || []).length + ')');
      });
    });
    a(thin.length === 0, 'C3: 每个子项至少 3 个候选词（词太薄的: ' + thin.slice(0, 3).join(',') + '）');
    const funcs = Object.keys(LEX).filter(function (k) { return typeof LEX[k] === 'function'; });
    a(funcs.length === 0, 'C4a: 词库只导出数据，不导出任何函数（实函数 ' + funcs.join(',') + '）');
    a(LEX.DATA_ONLY === true && typeof LEX.NOTE === 'string',
      'C4b: 词库自述 DATA_ONLY + NOTE（记账面据此判「有主无调用方」而不是「有注入面」）');
    const apSrc = fs.readFileSync(path.join(ROOT, 'engines', 'appearance.js'), 'utf8');
    a(apSrc.indexOf('appearanceLexicon') < 0,
      'C5: appearance.js 源码**不出现** appearanceLexicon —— 引擎不消费词库（静态钉住）');
    a(!!(LEX.LEXICON.L2 && LEX.LEXICON.L2.pubic),
      'C6: 「私处」这一处在 L2 真的进来（不是嘴上说纳入）');

    // ── D 两向自证：表就是判据 ────────────────────────────────
    //   D1 往名单里加一项 ⇒ 立刻能登记；还原后同款必须拒。
    //      这一对是本锁的核心：单向（只测「加了能过」）证明不了表在起作用。
    const W8 = '__w2585_grow';
    const fakeId = 'zz-fake-item-2585';
    ITEMS.L1.push({ id: fakeId, label: '临时项' });
    const growList = pick('B');
    growList.L1.push(fakeId); // 追加（必盖项是名单前 N 项，替换末尾会变成缺项，测的就不是同一件事）
    const r8 = AP.register(W8, 'B', { items: growList });
    ITEMS.L1.pop();
    a(r8.ok === true, 'D1a: 名单里加一项后，同一条登记放行（实 ' + JSON.stringify(r8).slice(0, 80) + '）');
    const W9 = '__w2585_grow_back';
    const backList = pick('B');
    backList.L1[REQ.B.L1 - 1] = fakeId; // 已从名单移除
    const r9 = AP.register(W9, 'B', { items: backList });
    a(r9.ok === false && r9.reason === 'unknown-item',
      'D1b: 还原（移除该项）后同款必须被拒 —— 单向通过不算自证（实 ' + r9.reason + '）');

    //   D2 把 C 档 L1 下限临时改 0 ⇒ 空名单可登记；还原后空名单必拒（缺必盖项）。
    const W10 = '__w2585_floor';
    const oldReq = REQ.C.L1;
    REQ.C.L1 = 0;
    const r10 = AP.register(W10, 'C', { items: { L1: [], L2: [], L3: [], L4: [] } });
    REQ.C.L1 = oldReq;
    const W11 = '__w2585_floor_back';
    const r11 = AP.register(W11, 'C', { items: { L1: [], L2: [], L3: [], L4: [] } });
    a(r10.ok === true, 'D2a: 下限改 0 后空名单放行（证明必盖项由 COVERAGE_REQ 推、不是写死的）');
    a(r11.ok === false && r11.reason === 'missing-item',
      'D2b: 还原下限后空名单必拒（实 ' + r11.reason + '）—— 两向才叫自证');
    // ── E（v2.586.0 / R262）：名单面接进**注入面** ── 判据此前只落「L1×4」这种数字，
    //   「哪四处」要人去查表。planHints 默认关，开启后 buildBlock 多一段【该写】清单。
    //   E 面钉三件事：默认关时逐字不变 / 开启后与名单同源 / 改下限即改清单（两向）。
    const NL = String.fromCharCode(10);
    AP.setSettings({ enabled: true, planHints: false });
    const off1 = AP.buildBlock();
    a(off1.indexOf('[该写]') < 0, 'E1: planHints 默认关 ⇒ 输出里没有【该写】段（默认行为逐字不变）');
    AP.setSettings({ enabled: true, planHints: true });
    const on1 = AP.buildBlock();
    a(on1.indexOf('[该写]') >= 0, 'E2: 开启后出现【该写】段（判据面真的接进注入面）');
    const needLabel = function (tier, L) {
      const id = AP.requiredOf(tier, L)[0];
      const it = (AP.LAYER_ITEMS[L] || []).filter(function (x) { return x.id === id; })[0];
      return it ? it.label : id;
    };
    const needC1 = needLabel('C', 'L1');
    a(on1.indexOf(needC1) >= 0, 'E3: 清单里出现该级必盖项的**中文名**（实查「' + needC1 + '」）—— 名字与名单同源');
    AP.setSettings({ enabled: true, planHints: true });
    const rowsC = [];
    const lineC = on1.split(NL).filter(function (l) { return l.indexOf('单一特征：') === 0; })[0] || '';
    rowsC.push(lineC);
    const cntC = (lineC ? lineC.split('、').length : 0);
    a(cntC === 1, 'E4: C 档清单恰 1 处（=' + AP.requiredOf('C', 'L1').length + '；读数 ' + cntC + '）—— 清单条数就是该级必盖项数');
    const oldC = REQ.C.L1;
    REQ.C.L1 = 3;
    const on2 = AP.buildBlock();
    REQ.C.L1 = oldC;
    const lineC2 = on2.split(NL).filter(function (l) { return l.indexOf('单一特征：') === 0; })[0] || '';
    a((lineC2 ? lineC2.split('、').length : 0) === 3,
      'E5: 把 C 档下限临时改成 3 ⇒ 清单跟着变 3 处（两向：判据与注入面共用同一份表，实 '
      + (lineC2 ? lineC2.split('、').length : 0) + '）');
    const on3 = AP.buildBlock();
    a(on3 === on1, 'E6: 还原下限后输出与改动前**逐字相等**（清单不是写死的）');
    AP.setSettings({ enabled: true, planHints: false });
    a(AP.buildBlock() === off1, 'E7: 关回去后输出与开启前逐字相等（不是“加了就删不掉”）');
  } finally {
    if (AP.setSettings && was) AP.setSettings({ enabled: !!was.enabled });
  }
}

module.exports = { runAll: runAll };