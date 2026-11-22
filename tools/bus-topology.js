#!/usr/bin/env node
// WorldAxis tools/bus-topology.js - 总线拓扑图（计划 OPV22-5, v2.400.0）
//
// ── 它治的病 ──────────────────────────────────────────────────────────
//   修改前，「六层总线到底铺了哪些引擎」只能人读 engines/cascade-bus.js 的
//   dispatchTick() 体内 800 多行。这会带来两个真实后果：
//     1) 想知道某个引擎有没有挂进总线，必须全文搜一遍，搜到了还得判断它在哪层；
//     2) 新增引擎时「挂不挂」全靠手感 —— 没有任何地方回答「总线一共消费了几个引擎」。
//   OPV22-1 补齐六层之后，这层需求更紧迫：层数从 4 变 6，人读成本又涨了。
//
// ── 口径：只报不改，不做门禁 ────────────────────────────────────────
//   本工具输出三列：层 / 引擎命名空间 / 调用口（哪个函数被调）。
//   它**不做门禁**：总线的消费面是演进的，今天没挂不代表错。门禁会把
//   「设计选择」误判成「缺陷」，那正是本仓拒绝过的事。
//
//   行输出形态：
//     L3 tactical      siegeAttrition          getFortress, advanceSiege
//     L6 epochal       epochTide               advanceEpoch
//
//   用法：
//     node tools/bus-topology.js            # 三列表
//     node tools/bus-topology.js --json     # 机器可读
//     node tools/bus-topology.js --layer L6 # 只看某层

'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SRC_REL = 'engines/cascade-bus.js';

const LAYER_LABEL = {
  physical: 'L1 physical',
  somatic: 'L2 somatic',
  tactical: 'L3 tactical',
  behavioral: 'L4 behavioral',
  social: 'L5 social',
  epochal: 'L6 epochal'
};

/** 把源码按 `// ── Layer N: ...` 切成六段（段内到下一个 Layer 头或函数尾）。 */
function splitLayers(src) {
  const marks = [];
  const re = /\/\/ ── Layer (\d+): [^\n]*/g;
  let m;
  while ((m = re.exec(src)) !== null) marks.push({ idx: m.index, num: Number(m[1]) });
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const start = marks[i].idx;
    const end = i + 1 < marks.length ? marks[i + 1].idx : src.length;
    out.push({ num: marks[i].num, body: src.slice(start, end) });
  }
  return out;
}

/** 段内抽取引擎命名空间 + 被调函数名。 */
function extractConsumers(body) {
  const byNs = {};
  // 先吃掉可选的 engines. 前缀，再取真正的命名空间 —— 否则 WA.engines.X 会把
  //   'engines' 本身当成一个命名空间统计进去（实测会多出一行假的 engines 行）。
  const re = /WA\.(?:engines\.)?([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    const ns = m[1]; const fn = m[2];
    if (!fn) continue;
    if (!byNs[ns]) byNs[ns] = new Set();
    byNs[ns].add(fn);
  }
  return byNs;
}

function build() {
  const src = fs.readFileSync(path.join(ROOT, SRC_REL), 'utf8');
  const segs = splitLayers(src);
  const layers = [];
  const allNs = new Set();
  segs.forEach(function (s) {
    const byNs = extractConsumers(s.body);
    const rows = [];
    Object.keys(byNs).sort().forEach(function (ns) {
      allNs.add(ns);
      rows.push({ ns: ns, fns: Array.from(byNs[ns]).sort() });
    });
    layers.push({ num: s.num, rows: rows });
  });
  return { layers: layers, engineCount: allNs.size, namespaces: Array.from(allNs).sort() };
}

function main() {
  const argv = process.argv.slice(2);
  const wantJson = argv.indexOf('--json') >= 0;
  const layerArg = (function () {
    const i = argv.indexOf('--layer');
    return i >= 0 ? argv[i + 1] : null;
  })();
  const d = build();
  if (wantJson) { console.log(JSON.stringify(d, null, 2)); return 0; }
  console.log('[总线拓扑] ' + SRC_REL + ' · 层 ' + d.layers.length + ' · 消费引擎 ' + d.engineCount + ' 个');
  d.layers.forEach(function (L) {
    if (layerArg && String(L.num) !== String(layerArg).replace(/^[Ll]/, '')) return;
    let label = 'L' + L.num;
    console.log('');
    console.log('── ' + label + ' · ' + L.rows.length + ' 个引擎');
    L.rows.forEach(function (r) {
      console.log('   ' + (r.ns + '                          ').slice(0, 26) + r.fns.join(', '));
    });
  });
  return 0;
}

if (require.main === module) process.exit(main());
module.exports = { build: build, splitLayers: splitLayers, extractConsumers: extractConsumers };
