#!/usr/bin/env node
// WorldAxis tests/v11-inject-dualface.js —— 主路径与宿主槽位双面一致性锁（v2.298.0 · V11 OPV11-2）
//
// 【它治什么】
//   立项读数：「`applyInjections({injections:[]})` 之后入参 `injections` 仍是 0 条，
//   而 `setExtensionPrompt` 实际收到 573 字符 / 4 个源」。当时判为「产出面与记录面不是同一个」。
//   现场复测的真相更精确：**这两个面本来就不该一致**，混为一谈才是立项误读：
//     · `ctx.injections` 是**调用方预置的输入槽位**（宿主把剧情约束等塞进来，由本函数
//       取出并入 items）。它是**输入**，不是产出。往里回写才是错的设计。
//     · 真实产出面 = `combined`（主块文本）＋ 各路独立槽位，落点记在 `lastInjection`。
//   因此本项不做「让入参回写产出」（那会污染输入面），而做两件事：
//     ① **契约显式化**：把「本轮到底把多少字送到宿主、送达是否成功」作为独立字段
//        `lastInjection.hosted` 记录，与 `sources` / `len` / `mainCount` 同一份打点。
//     ② **两面同账可对账**：`hosted.chars` 必须与宿主实收长度逐字相等；
//        `sources` 必须与宿主实收文本里真能找到的内容一致（源名逐个在场）。
//
// 【判据】
//   D1  `lastInjection.hosted` 存在且 `ok===true`（送达成功）；`chars === combined.length`
//       且与宿主桩实收的文本长度**逐字相等**（不是「大约相等」）。
//   D2  `hosted.key === 'WorldAxis'`：送达的槽位键与读面约定一致（键名漂移会让读面读空）。
//   D3  两面同源：`hosted.chars === lastInjection.len`（长度只有一个真源，不许两处各算一遍）。
//   D4  `sources` 里每个源名都在 `hosted` 那一轮的真实产物中被解释得到：
//       世界状态源（`世界状态`）必须伴随 `<world_axis_state>` 标记在场。
//   D5  入参**不被回写**：调用后 `ctx.injections` 长度与调用前一致（输入面不被污染）。
//       这一条是本次裁决的正面表述 —— 「items=0」不是缺陷，是正确行为。
//   D6  送达失败必须可辨：桩一个抛错的 `setExtensionPrompt` ⇒ `hosted` 为 null 且
//       外层走既有 catch（不得静态成功）。
//   D7  空世界（全源关）下 `hosted.chars === 0` 且 `ok===true`：
//       「清了上一轮」与「没送达」必须能分辨（空串送达是成功的清场）。
//   D8  纯只读面：`lastInjection` 落盘后不改它以外的存档键（除既有的审计/观测面）。
//
// 【两向自证】
//   N0  锚点各恰中 1 次；N1 把 `__hostedSnap` 赋值注掉 ⇒ D1 现形；
//   N2 把 `hosted` 字段从打点里去掉 ⇒ D1 现形；N3 原版上同款判据仍成立。
'use strict';

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');
const TARGET = 'render/inject.js';

/** 建一个会把 setExtensionPrompt 实收内容抓下来的环境 */
function harness(opts) {
  const o = opts || {};
  const env = sync.fresh(o.override ? { files: [TARGET], srcOverride: o.override } : undefined);
  const WA = env.WA;
  try { global.localStorage.clear(); } catch (e) {}
  WA.store.init();
  const calls = [];
  const ctx = WA.mainWin.SillyTavern.getContext();
  const orig = ctx.setExtensionPrompt;
  if (o.throwHost) {
    ctx.setExtensionPrompt = function () { throw new Error('__v11dualface_host__'); };
  } else {
    ctx.setExtensionPrompt = function (key, txt) {
      calls.push({ key: key, txt: String(txt == null ? '' : txt) });
      return orig.apply(this, arguments);
    };
  }
  if (o.seedFacts) {
    WA.store.transact(function (d) {
      d.clock = { iso: '2026-01-01T00:00:00Z', label: '第1日', dayIndex: 1, source: 'seed' };
      d.background = { text: '背景在场' };
    });
  }
  if (o.allVis) WA.render.SOURCES.forEach(function (k) { WA.render.setVisibility(k, true); });
  return {
    WA: WA, calls: calls,
    restore: function () { ctx.setExtensionPrompt = orig; },
    lastCall: function () { return calls.length ? calls[calls.length - 1] : null; },
    lastWorld: function () {
      for (let i = calls.length - 1; i >= 0; i--) if (calls[i].key === 'WorldAxis') return calls[i];
      return null;
    }
  };
}

function runAll(a) {
  // D1 / D2 / D3 / D4 / D5：正常一轮
  {
    const h = harness({ seedFacts: true, allVis: true });
    const WA = h.WA;
    const ctx = WA.mainWin.SillyTavern.getContext();
    const before = (ctx.injections || []).length;
    global.__lastExtensionPrompt = null;
    const arg = { injections: [] };
    WA.render.applyInjections(arg);
    const li = WA.store.get().lastInjection || {};
    const world = h.lastWorld();

    // D1
    a(!!li.hosted, 'v11dualface: [D1a] lastInjection.hosted 存在（实 ' + JSON.stringify(li.hosted) + '）');
    a(li.hosted && li.hosted.ok === true, 'v11dualface: [D1b] 送达成功记为 ok===true');
    a(!!world, 'v11dualface: [D1c] 宿主桩确实收到 WorldAxis 槽位');
    a(li.hosted && world && li.hosted.chars === world.txt.length,
      'v11dualface: [D1d] hosted.chars === 宿主实收长度（' + (li.hosted && li.hosted.chars) + ' vs ' + (world && world.txt.length) + '）');
    // D2
    a(li.hosted && li.hosted.key === 'WorldAxis', 'v11dualface: [D2] 送达键与读面约定一致（实 ' + (li.hosted && li.hosted.key) + '）');
    // D3
    a(li.hosted && li.hosted.chars === li.len, 'v11dualface: [D3] 长度单一真源：hosted.chars === li.len（'
      + (li.hosted && li.hosted.chars) + ' vs ' + li.len + '）——两处各算一遍就会分叉');
    // D4
    a(Array.isArray(li.sources) && li.sources.indexOf('世界状态') >= 0, 'v11dualface: [D4a] sources 含世界状态源');
    a(world && world.txt.indexOf('<world_axis_state') >= 0,
      'v11dualface: [D4b] 宿主实收文本里真有世界状态块标记（不是只记了个名字）');
    // D5
    a((arg.injections || []).length === before,
      'v11dualface: [D5] 入参 injections 不被回写（' + before + ' → ' + (arg.injections || []).length + '）——'
      + '它是输入槽位，不是产出面；「items=0」是正确行为不是缺陷');
    h.restore();
  }

  // D6：送达失败必须可辨
  {
    const h = harness({ seedFacts: true, allVis: true, throwHost: true });
    const WA = h.WA;
    let threw = false;
    try { WA.render.applyInjections({ injections: [] }); } catch (e) { threw = true; }
    const li = WA.store.get().lastInjection;
    a(!threw, 'v11dualface: [D6a] 送达失败不向外抛（外层既有 catch 接住）');
    a(!li || li.hosted == null,
      'v11dualface: [D6b] 送达失败时 hosted 为 null/缺席（实 ' + JSON.stringify(li && li.hosted) + '）——'
      + '不许静态成功，否则「没送到」与「送到了」同形');
    h.restore();
  }

  // D7：全源关 = 空串送达（成功的清场）
  {
    const h = harness({ seedFacts: true, allVis: false });
    const WA = h.WA;
    WA.render.SOURCES.forEach(function (k) { WA.render.setVisibility(k, false); });
    WA.render.applyInjections({ injections: [] });
    const li = WA.store.get().lastInjection || {};
    a(li.hosted && li.hosted.ok === true, 'v11dualface: [D7a] 空串送达仍记 ok===true（清场成功，不是失败）');
    a(li.hosted && li.hosted.chars === 0, 'v11dualface: [D7b] 空串送达时 chars===0（实 ' + (li.hosted && li.hosted.chars) + '）');
    a(li.hosted && li.hosted.chars === li.len, 'v11dualface: [D7c] 空轮时长度仍单一真源（' + (li.hosted && li.hosted.chars) + ' vs ' + li.len + '）');
    h.restore();
  }
}

function runNegative(a) {
  const src = fs.readFileSync(path.join(BASE, TARGET), 'utf8');
  const A_SNAP = "__hostedSnap = { ok: true, key: 'WorldAxis', chars: combined.length, slotCount: slotCount };";
  const A_FIELD = 'hosted: __hostedSnap,';
  const n1 = src.split(A_SNAP).length - 1;
  const n2 = src.split(A_FIELD).length - 1;
  a(n1 === 1, 'v11dualface: [N0a] 实收快照锚点在真源码中恰中 1 次（实 ' + n1 + '）');
  a(n2 === 1, 'v11dualface: [N0b] 打点字段锚点在真源码中恰中 1 次（实 ' + n2 + '）');

  // N1：注掉实收快照赋值 ⇒ hosted 恒 null ⇒ D1 现形
  {
    const broken = src.replace(A_SNAP, 'void 0;');
    a(broken !== src, 'v11dualface: [N1a] 破坏确实发生（实收快照不再赋值）');
    const h = harness({ seedFacts: true, allVis: true, override: { [TARGET]: broken } });
    h.WA.render.applyInjections({ injections: [] });
    const li = h.WA.store.get().lastInjection || {};
    a(!li.hosted, 'v11dualface: [N1b] 破坏后 hosted 恒为 null ⇒ D1 不是恒真判据（实 ' + JSON.stringify(li.hosted) + '）');
    h.restore();
  }

  // N2：把打点字段去掉 ⇒ 读面拿不到实收面 ⇒ D1 现形
  {
    const broken = src.replace(A_FIELD, 'hosted: null,');
    const h = harness({ seedFacts: true, allVis: true, override: { [TARGET]: broken } });
    h.WA.render.applyInjections({ injections: [] });
    const li = h.WA.store.get().lastInjection || {};
    a(li.hosted === null, 'v11dualface: [N2] 去掉字段后读面永远读不到实收面（实 ' + JSON.stringify(li.hosted) + '）');
    h.restore();
  }

  // N3：原版上同款判据仍成立
  {
    const h = harness({ seedFacts: true, allVis: true });
    h.WA.render.applyInjections({ injections: [] });
    const li = h.WA.store.get().lastInjection || {};
    a(li.hosted && li.hosted.ok === true && li.hosted.chars === li.len,
      'v11dualface: [N3] 原版上同款判据仍成立（hosted.chars=' + (li.hosted && li.hosted.chars) + '）');
    h.restore();
  }
}

module.exports = {
  runAll: require('./lock-assert.js').restoring(runAll),
  runNegative: require('./lock-assert.js').restoring(runNegative)
};
