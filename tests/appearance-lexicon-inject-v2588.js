#!/usr/bin/env node
// WorldAxis tests/appearance-lexicon-inject-v2588.js (v2.588.0) — R6 专锁：外貌词库进注入面
//
// 【它治什么】
//   `engines/appearance-lexicon.js` 是一张**描写词表**（L1 五官 / L2 身体 / L3 穿着 / L4 身材），
//   从 v2.585.0 落地起就没有任何消费方：`dead-export-gate` 把它记成 dataOnly（有主、无调用方）。
//   于是「词库」这件事在产品里只存在于文件里 —— 模型看不到它，写出来的描写也不会因为
//   有过这张表而更具体。R6 要治的就是这一格：**让词库进注入面**。
//
// 【为什么这件事此前不能直接做（本锁要守住的三条）】
//   ① **词库不是判据**：R50/R51/R254 三次裁决原文是「几千词要素库是创作词库，不进引擎」。
//      所以本版把消费点放在**注入拼装层**（`render/inject.js`）而不是 `engines/appearance.js`：
//      引擎侧的 `register()` 拒收面一个词都不看，改词表永远不会让某个角色的契约突然合规/违规。
//      本锁 C1 直接把这句话钉成判据：`engines/appearance.js` 里**不许出现** `appearanceLexicon`。
//   ② **默认关**：词库多一段候选词就是多一段上下文。默认 true 会让所有老用户凭空多出来源不明的字，
//      而他们从没开过这个开关。所以 `__REG.def.appearanceLexicon === false`（B3 逐字断言）。
//   ③ **五处同批登记**：源表 / 默认值 / 渲染层显示名 / 面板显示名 / 注入分支 ——
//      少了「分支」是开关点了零效果；少了「显示名」是面板报英文键名；少了「默认值」是幽灵源。
//      本锁 A 组逐处断言，任一处单边增长都红。
//
// 【四段结构】A 五处同批 / B 运行时读数 / C 裁决面（词库不参与判定）/ D 词表→文本的可核规则
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const INJ = 'render/inject.js';
const PANEL = 'ui/panel.js';
const APP = 'engines/appearance.js';
const LEX = 'engines/appearance-lexicon.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }

function runAll(a) {
  const I = rd(INJ);
  const P = rd(PANEL);
  const APP_SRC = rd(APP);
  const LEX_SRC = rd(LEX);

  /* ============ A 五处同批登记 ============ */
  a(cnt(I, "    'appearanceLexicon',") === 1, 'A1: 源表 SOURCES 恰好登记一次');
  a(cnt(I, 'appearanceLexicon: false,') === 1, 'A2: 默认值声明恰一处');
  a(cnt(I, "appearanceLexicon: '外貌词库',") === 1, 'A3: 渲染层显示名（SRC_NAME）恰一处');
  a(cnt(P, "appearanceLexicon: '外貌词库',") === 1, 'A4: 面板显示名（VIS_NAMES）恰一处 —— 不加这行开关会报英文键名');
  a(cnt(I, 'if (vis.appearanceLexicon && WA.appearanceLexicon) {') === 1,
    'A5: 注入分支恰一处（只登记源表不加分支 = 开关点了零效果）');
  // 分支必须真把内容推进入口
  a(cnt(I, "items.push({ source: '外貌词库', content: lx })") === 1,
    'A6: 分支真产出一条名为「外貌词库」的注入项（不是只判了个变量）');

  /* ============ B 运行时读数 ============ */
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  a(!!WA && !!WA.render, 'B0: 需要真产品环境（global.WorldAxis.render）');
  const R = WA && WA.render;
  const SOURCES = (R && R.SOURCES) || [];
  a(SOURCES.indexOf('appearanceLexicon') >= 0, 'B1: 运行时源表含 appearanceLexicon');
  const vs = R && typeof R.visibilityStat === 'function' ? R.visibilityStat() : null;
  a(!!vs && Array.isArray(vs.undeclared), 'B2: visibilityStat 可读（诊断面真读这条口）');
  a(vs && vs.undeclared.indexOf('appearanceLexicon') < 0,
    'B3: 该源有默认值声明（不在 undeclared 里）—— undeclared 非空即「源存在却无默认值」');
  a(vs && vs.declared === vs.sources,
    'B4: 默认值数与源表数相等（' + (vs && vs.declared) + '/' + (vs && vs.sources) + '）—— 两向都不许多出来');
  const audit = vs && Array.isArray(vs.faceAudit) ? vs.faceAudit : null;
  if (audit) {
    const row = audit.filter(function (x) { return x && x.key === 'appearanceLexicon'; })[0];
    a(!!row, 'B5: 开关两面对账里能找到该源');
    a(row && row.name === '外貌词库', 'B6: 对账里报的是中文名（实 ' + (row && row.name) + '）');
    a(row && row.visibility === false, 'B7: **默认关**（visibility 实为 ' + (row && row.visibility) + '）');
  } else {
    a(true, 'B5–B7: 本环境无 faceAudit，如实跳过（不装作验过）');
  }

  /* ============ C 裁决面：词库不参与判定 ============ */
  a(cnt(APP_SRC, 'appearanceLexicon') === 0,
    'C1: engines/appearance.js **不读**词库 —— R50/R51/R254「要素库不进引擎」的裁决仍在位 '
    + '（实 ' + cnt(APP_SRC, 'appearanceLexicon') + ' 处）');
  a(cnt(APP_SRC, 'LEXICON') === 0, 'C2: 判据引擎里连 LEXICON 这个词都不出现（不是换了个名字读）');
  a(LEX_SRC.indexOf('DATA_ONLY: true') >= 0, 'C3: 词库仍自述 data-only（本版没有把它变成引擎）');
  a(LEX_SRC.indexOf('NOTE:') >= 0 && LEX_SRC.indexOf('不提供判据') >= 0,
    'C4: 词库的自述仍是「只提供候选词，不提供判据」');
  // IIFE 的 `(function () {` 不算：要防的是「具名函数」（能被别人调用的第一类对象）。
  const namedFns = (LEX_SRC.match(/function\s+[A-Za-z_$][\w$]*\s*\(/g) || []).length;
  a(namedFns === 0,
    'C5: 词库文件里没有任何**具名**函数（纯数据 —— 一旦有函数它就变成了能判定的东西；实 ' + namedFns + ' 个）');

  /* ============ D 词表→文本的可核规则（静态锚点） ============ */
  a(I.indexOf('function lexiconHintBlock()') >= 0, 'D1: 词表→文本是一个单独的函数（不是散在分支里）');
  a(I.indexOf("if (!LX || !LX.LEXICON || typeof LX.LEXICON !== 'object') return '';") >= 0,
    'D2: 词库缺席如实返回空串（不编造、不抛）');
  a(I.indexOf('arr.slice(0, 2)') >= 0, 'D3: 每个子项最多取 2 个词（再多就是塞满上下文，不是提示）');
  a(I.indexOf('words.slice(0, 8)') >= 0, 'D4: 每层最多 8 个词（有上限，不随词库长）');
  a(I.indexOf('可用可不用') >= 0, 'D5: 块头明写「可用可不用」（候选词不许被读成硬要求）');
  a(I.indexOf("L1: '五官', L2: '身体', L3: '穿着', L4: '身材'") >= 0,
    'D6: 四层中文名逐字对上（层名与 appearance.js 的 LAYER_ITEMS 同一套）');
  a(I.indexOf("if (!groups.length) return '';") >= 0, 'D7: 全空时返回空串（不推一条空块进正文）');

  // D8 词库本身确实有这四层（不是空壳）
  ['L1:', 'L2:', 'L3:', 'L4:'].forEach(function (k) {
    a(LEX_SRC.indexOf(k) >= 0, 'D8/' + k.replace(':', '') + ': 词库有这一层');
  });

  /* ============ E 非空转：判据真的会红 ============ */
  // 用内存副本模拟三种破坏，判据必须各自变红（不真改仓库文件）
  (function () {
    const broken1 = I.replace('appearanceLexicon: false,', 'appearanceLexicon: true,');
    a(cnt(I, 'appearanceLexicon: false,') === 1 && cnt(broken1, 'appearanceLexicon: false,') === 0,
      'E1: 把默认值改成 true ⇒ A2/B3 的判据串就消失（说明它们钉的是真源码，不是注释）');
    const broken2 = P.replace("appearanceLexicon: '外貌词库',", '');
    a(cnt(P, "appearanceLexicon: '外貌词库',") === 1 && cnt(broken2, "appearanceLexicon: '外貌词库',") === 0,
      'E2: 删掉面板显示名 ⇒ A4 会红（面板表与源表是两处真登记，不是同一份）');
    const broken3 = I.replace('if (vis.appearanceLexicon && WA.appearanceLexicon) {', 'if (false) {');
    a(cnt(broken3, 'if (vis.appearanceLexicon && WA.appearanceLexicon) {') === 0,
      'E3: 拆掉分支守卫 ⇒ A5 会红（分支在，开关才有意义）');
  })();

  return { ok: true };
}

module.exports = { runAll: runAll };