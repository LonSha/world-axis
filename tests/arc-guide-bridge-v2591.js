#!/usr/bin/env node
// WorldAxis tests/arc-guide-bridge-v2591.js — 引导弧落地面专锁（v2.591.0 / R266）
//
// 锁的是「多拍长线引导第一次真的能发生」，不是「多了一个文件」。七组：
//
//   A 静态契约：导出齐 / **零窗口重写**（0 处深度比较、0 处拍排序）/ 只写自己的桶 /
//     两处装载表 + 注入面四处 + 面板显示名 + 诊断表。
//   B 默认关：总开关默认 false，关时 buildBlock 返回空串、plan/advance 一律拒收 ——
//     这是它能上线的唯一理由（老用户注入正文逐字不变）。
//   C 写口：坏弧只进 rejected、好弧照收；上限截断**自报**；advance 单调不减。
//   D 窗口：三个楼层各一条，逐条复算 inject / expired / upcoming / active。
//   E 不猜楼层：现场与手动都没有 ⇒ null，buildBlock 空块 + why=no-floor。
//   F 注入块：只出窗口内有正文的拍；无正文/超限的计入 dropped；
//     全无正文时 why=no-text-in-window。
//   G 关键词：委托 arcGuide 去重保序（同 key 两拍只出一行）。
//
// 跑完把 store 桶逐字还原（本锁不往世界存档里留测试数据）。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function snip(o) { return JSON.parse(JSON.stringify(o === undefined ? null : o)); }

function runAll(a) {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA, 'A0: WorldAxis 在位（本锁必须跑在真产品上）');
  const B = WA.arcGuideBridge;
  a(!!B, 'A0b: WA.arcGuideBridge 在位');
  a(!!WA.arcGuide, 'A0c: WA.arcGuide 在位（本面的窗口全部委托它）');
  if (!B) return { arcs: 0 };

  const rel = 'engines/arc-guide-bridge.js';
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const injSrc = fs.readFileSync(path.join(ROOT, 'render/inject.js'), 'utf8');
  const panelSrc = fs.readFileSync(path.join(ROOT, 'ui/panel.js'), 'utf8');
  const idxSrc = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
  const runSrc = fs.readFileSync(path.join(ROOT, 'tests/run.js'), 'utf8');

  // ── A 静态契约 ────────────────────────────────────────────────
  a(B.VERSION === '2.591.0', 'A1: 引擎版本 2.591.0（实 ' + B.VERSION + '）');
  ['plan', 'advance', 'currentFloor', 'view', 'buildBlock', 'keys', 'diagnose', 'summaryText',
    'getSettings', 'setSettings', 'stat', '__reset'].forEach(function (k, i) {
    a(typeof B[k] === 'function', 'A2.' + (i + 1) + ': 导出 ' + k + '()');
  });
  // 第二份真源禁令：窗口算法只能在 arc-guide 里。这里出现深度比较或拍排序就是抄了一遍。
  a(src.indexOf('.at <=') < 0 && src.indexOf('.at >') < 0,
    'A3: 0 处 `.at <=` / `.at >` 比较（窗口不能重写）');
  a(!/\.sort\s*\(/.test(src), 'A3b: 0 处 sort( （拍序由 arcGuide 定）');
  a(src.indexOf('parseArcs') >= 0 && src.indexOf('keysOf') >= 0 && src.indexOf('arcGuide.plan') >= 0,
    'A3c: 真的委托 arcGuide（parseArcs / plan / keysOf 三处都在）');
  a(src.indexOf('draft.arcGuideBridge') >= 0 && src.indexOf('draft.beatMask') < 0,
    'A4: 只写自己的桶（draft.arcGuideBridge）');
  a(!/WA\.store\.patch\s*\(/.test(src), 'A4b: 0 处 store.patch（写口只有 plan / advance 两条）');
  a(idxSrc.indexOf("'" + rel + "'") >= 0 && runSrc.indexOf("'" + rel + "'") >= 0,
    'A5: 引擎在两处装载表都登记（index.js + tests/run.js）');
  a(idxSrc.indexOf("'" + rel + "'") > idxSrc.indexOf("'engines/arc-guide.js'"),
    'A5b: 排在 arc-guide 之后（供者先装；次序违规会被 module-cycle-gate 报）');
  a(injSrc.indexOf("'arcGuideBridge',") >= 0, 'A6: 注入面 SOURCES 登记');
  a(injSrc.indexOf('arcGuideBridge: true,') >= 0, 'A6b: 注入面 vis 默认值登记');
  a(injSrc.indexOf("arcGuideBridge: '引导弧'") >= 0, 'A6c: 注入面 SRC_NAME 显示名');
  a(injSrc.indexOf('vis.arcGuideBridge && WA.arcGuideBridge') >= 0, 'A6d: 注入分支真的存在');
  a(panelSrc.indexOf("arcGuideBridge: '引导弧'") >= 0, 'A7: 面板 VIS_NAMES 显示名（否则注入页裸露英文键名）');
  a(fs.readFileSync(path.join(ROOT, 'engines/tool-diag-tables.js'), 'utf8')
    .indexOf("'" + rel + "': 'arcGuideBridge'") >= 0, 'A8: 诊断表登记（否则装载失败对自检隐身）');

  // ── 备份现场（跑完逐字还原）──────────────────────────────────
  const storeDraft = WA.store.get() || {};
  const bakBucket = snip(storeDraft.arcGuideBridge);
  const bakCfg = snip(B.getSettings());
  const restoreBucket = function () {
    try {
      WA.store.transact(function (d) {
        if (bakBucket === null) delete d.arcGuideBridge;
        else d.arcGuideBridge = bakBucket;
        return true;
      }, 'arcGuideBridge:test-restore');
    } catch (e) { /* 还原失败不掩盖断言失败 */ }
  };
  const restoreCfg = function () {
    try { B.setSettings(bakCfg); } catch (e) {}
  };

  try {
    // ── B 默认关 ─────────────────────────────────────────────
    B.__reset();
    a(bakCfg.enabled === false, 'B1: 总开关默认 false（实 ' + bakCfg.enabled + '）');
    const offBlock = B.buildBlock({});
    a(offBlock.text === '' && offBlock.why === 'disabled',
      'B2: 关着时 buildBlock 返回空串 + why=disabled（实 why=' + offBlock.why + '）');
    a(B.plan([{ id: 'x', beats: [{ no: 1, key: 'k', at: 1, text: 't' }] }]).reason === 'disabled',
      'B3: 关着时 plan 拒收 disabled（一条弧都不落盘）');
    a(B.advance(5).reason === 'disabled', 'B3b: 关着时 advance 也拒收');
    a(Object.keys(B.stat().faults).indexOf('disabled') >= 0, 'B3c: 拒收计入 stat.faults（不是静默返回）');

    // ── C 写口 ───────────────────────────────────────────────
    B.setSettings({ enabled: true, maxArcs: 4, maxBeats: 8, depth: 3, maxChars: 900 });
    B.__reset();
    const ARCS = [
      { id: 'A1', depth: 3, beats: [
        { no: 1, key: '码头', at: 3, text: '第一拍正文' },
        { no: 2, key: '码头', at: 5, text: '第二拍正文' },
        { no: 3, key: '夜潮', at: 9, text: '第三拍正文' }
      ] },
      { id: 'BAD', beats: [{ no: 1, key: '', at: 1 }] }
    ];
    const pr = B.plan(ARCS);
    a(pr.ok === true && pr.kept === 1, 'C1: 坏弧只进 rejected，好弧照收（kept=' + pr.kept + '）');
    a(pr.rejected.length === 1 && pr.rejected[0].code === 'bad-arc', 'C1b: 坏弧在 rejected 里点名 bad-arc');
    a(pr.beats === 3, 'C1c: 拍数如实（实 ' + pr.beats + '）');
    a(pr.cut === 0, 'C1d: 未超上限时 cut=0（不编造截断）');
    const many = [];
    for (let i = 0; i < 6; i++) many.push({ id: 'M' + i, beats: [{ no: 1, key: 'k' + i, at: 1, text: 't' + i }] });
    const pr2 = B.plan(many);
    a(pr2.ok === true && pr2.kept === 4 && pr2.cut === 2,
      'C2: 超 maxArcs 时截批次并**自报**（kept=' + pr2.kept + ' cut=' + pr2.cut + '）');
    B.plan(ARCS);
    const adv = B.advance(5);
    a(adv.ok === true && adv.floor === 5, 'C3: advance 落楼层（实 ' + adv.floor + '）');
    const back = B.advance(2);
    a(back.ok === false && back.reason === 'bad-value', 'C3b: 楼层回退被拒（单调不减）');
    // 注：这里读 store 里的手动值，不读 currentFloor() —— 后者**优先现场聊天**，
    //    在有宿主上下文的环境里返回的是 chat 楼层（它不是「回退被拒」的反证）。
    a(((WA.store.get() || {}).arcGuideBridge || {}).floor === 5,
      'C3c: 回退被拒后 store 里的手动楼层不变（实 ' + (((WA.store.get() || {}).arcGuideBridge || {}).floor) + '）');

    // ── D 窗口（三个楼层逐条复算）───────────────────────────────
    //   A1 depth=3，拍 at=3/5/9。
    const setFloor = function (n) {
      // 从 0 重设：直接改桶（测试只用 store 的真实入口，不走私有函数）
      WA.store.transact(function (d) {
        if (!d.arcGuideBridge) d.arcGuideBridge = { arcs: [], floor: null, at: 0 };
        d.arcGuideBridge.floor = n;
        return true;
      }, 'arcGuideBridge:test-floor');
    };
    // 现场聊天优先于手动值：为了真测手动值，把宿主聊天面临时摘掉。
    const win = WA.mainWin;
    const bakST = win ? win.SillyTavern : undefined;
    try {
      if (win) win.SillyTavern = undefined;
      setFloor(5);
      const cf5 = B.currentFloor();
      a(cf5.floor === 5 && cf5.source === 'manual', 'D0: 现场读不到时退到手动值（source=manual）');
      const v5 = B.view({});
      const r5 = (v5.rows || [])[0] || {};
      a(JSON.stringify(r5.inject) === '[1,2]', 'D1: floor=5 / depth=3 ⇒ 窗口 (2,5] 收 1,2 拍（实 ' + JSON.stringify(r5.inject) + '）');
      a(r5.active === 2, 'D1b: 当前拍 = 2（实 ' + r5.active + '）');
      a(r5.expired === 0, 'D1c: 出窗 0 拍（实 ' + r5.expired + '）');
      a(r5.upcoming === 3, 'D1d: 下一拍 = 3（实 ' + r5.upcoming + '）');
      setFloor(10);
      const v10 = B.view({});
      const r10 = (v10.rows || [])[0] || {};
      a(JSON.stringify(r10.inject) === '[3]', 'D2: floor=10 ⇒ 窗口 (7,10] 只剩第 3 拍（实 ' + JSON.stringify(r10.inject) + '）');
      a(r10.expired === 2, 'D2b: 出窗 2 拍（3/5 都 ≤ 7，实 ' + r10.expired + '）');
      a(r10.upcoming === null, 'D2c: 无未到拍时 upcoming=null（不编一个数）');
      setFloor(0);
      const v0 = B.view({});
      const r0 = (v0.rows || [])[0] || {};
      a(JSON.stringify(r0.inject) === '[]' && r0.why === 'before-first-beat',
        'D3: floor=0 ⇒ 还没开始，inject 空 + why=before-first-beat（不当作第一拍在场）');

      // ── E 不猜楼层 ────────────────────────────────────────
      WA.store.transact(function (d) {
        if (!d.arcGuideBridge) d.arcGuideBridge = { arcs: [], floor: null, at: 0 };
        d.arcGuideBridge.floor = null;
        return true;
      }, 'arcGuideBridge:test-null');
      const cf = B.currentFloor();
      a(cf.floor === null && cf.source === 'none', 'E1: 现场与手动都无 ⇒ floor=null / source=none（不默认 0）');
      const noFloor = B.buildBlock({});
      a(noFloor.text === '' && noFloor.why === 'no-floor', 'E2: 缺楼层 ⇒ 空块 + why=no-floor（实 ' + noFloor.why + '）');

      // ── F 注入块 ─────────────────────────────────────────
      setFloor(5);
      const blk = B.buildBlock({});
      a(blk.ok === true && blk.text.indexOf('第1拍') >= 0 && blk.text.indexOf('第2拍') >= 0,
        'F1: 窗口内两拍逐字进正文（实 ' + blk.text.slice(0, 40) + '…）');
      a(blk.text.indexOf('第3拍') < 0, 'F1b: 未到的那一拍**不进正文**（提前漏一拍就是剧透）');
      a(blk.inject.length === 2 && blk.expired === 0, 'F1c: 回执逐条给出灌了哪几拍');
      // 无正文的拍：只报拍号、不进正文
      B.plan([{ id: 'N', depth: 3, beats: [
        { no: 1, key: 'k1', at: 3, text: '有正文' },
        { no: 2, key: 'k2', at: 4, text: '' }
      ] }]);
      const blk2 = B.buildBlock({});
      a(blk2.text.indexOf('有正文') >= 0 && blk2.dropped === 1,
        'F2: 无正文的拍计入 dropped 且不进正文（dropped=' + blk2.dropped + '）');
      B.plan([{ id: 'Z', depth: 3, beats: [{ no: 1, key: 'kz', at: 4, text: '' }] }]);
      const blk3 = B.buildBlock({});
      a(blk3.text === '' && blk3.why === 'no-text-in-window',
        'F3: 全无正文时 why=no-text-in-window（不输出一句占 token 的空话）');
      // 字数上限
      B.setSettings({ enabled: true, maxArcs: 4, maxBeats: 8, depth: 3, maxChars: 120 });
      const long = '很长的正文'.repeat(20);
      B.plan([{ id: 'L', depth: 3, beats: [
        { no: 1, key: 'l1', at: 4, text: long },
        { no: 2, key: 'l2', at: 5, text: long }
      ] }]);
      setFloor(5);
      const blk4 = B.buildBlock({});
      a(blk4.inject.length === 1 && blk4.dropped >= 1,
        'F4: 超 maxChars 的拍被丢弃并计数（inject=' + blk4.inject.length + ' dropped=' + blk4.dropped + '）');

      // ── G 关键词 ────────────────────────────────────────
      B.setSettings({ enabled: true, maxArcs: 8, maxBeats: 32, depth: 3, maxChars: 900 });
      B.plan(ARCS);
      const K = B.keys();
      a(K.ok === true && K.keys.length === 2, 'G1: 去重后的关键词 2 个（码头 / 夜潮，实 ' + K.keys.length + '）');
      a(K.rows[0].key === '码头' && K.rows[0].arc === 'A1' && K.rows[0].no === 1,
        'G1b: 同 key 两拍只登记一次，出处取首个拍（' + JSON.stringify(K.rows[0]) + '）');
      a(B.diagnose().keys === 2, 'G2: diagnose 的 keys 与 keys() 同源');
      a(B.summaryText(B.view({})).indexOf('引导弧') === 0, 'G3: summary 以「引导弧」开头（面板/诊断同句）');
    } finally {
      if (win) win.SillyTavern = bakST;
      restoreCfg();
      restoreBucket();
    }
  } finally {
    restoreCfg();
    restoreBucket();
  }

  a(JSON.stringify(snip(WA.store.get().arcGuideBridge)) === JSON.stringify(bakBucket),
    'H1: store 桶已逐字还原（本锁不往世界存档里留测试数据）');
  a(B.getSettings().enabled === bakCfg.enabled, 'H2: 设置已还原（enabled=' + B.getSettings().enabled + '）');
  return { arcs: 1 };
}

module.exports = { runAll: runAll };
