'use strict';
// 探针：那 3 个「面板只展示」的引擎，到底有没有人在喂？
//   这是关键裁决点：如果它们其实被别的引擎/链/渲染面驱动，
//   那么按「面板只展示」把它们降档就是**假阴性** —— 与 W() 漏判 27 条同一类错误。
//   故先查它们在全产品代码里的每一个调用点，逐一读原文判断性质。
const fs = require('fs');
const path = require('path');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }

const TARGETS = ['genGate', 'beatReport', 'memorySampler'];

const PROD = [];
for (const d of ['ui', 'engines', 'core', 'render', 'actors', 'direction', 'compat', 'design']) {
  (function walk(dir) {
    let ents = [];
    try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) PROD.push(rel);
    }
  })(d);
}
PROD.push('index.js');

for (const ns of TARGETS) {
  console.log('\n════════ ' + ns + ' ════════');
  let total = 0;
  for (const rel of PROD) {
    const src = read(rel);
    const re = new RegExp('WA\\.' + ns + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)', 'g');
    let m, hits = [];
    while ((m = re.exec(src)) !== null) {
      const line = src.slice(0, m.index).split('\n').length;
      hits.push({ line: line, mem: m[1], at: m.index });
    }
    if (!hits.length) continue;
    // 自己文件里调自己不算
    const selfRel = 'engines/' + ns.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase() + '.js';
    const isSelf = rel === selfRel;
    console.log('\n  [' + rel + (isSelf ? '  ← 自身文件，不算外部调用' : '') + ']  ' + hits.length + ' 处');
    total += isSelf ? 0 : hits.length;
    const seen = {};
    for (const h of hits) {
      if (seen[h.mem + ':' + h.line]) continue;
      seen[h.mem + ':' + h.line] = 1;
      const s = Math.max(0, h.at - 110), e = Math.min(src.length, h.at + 90);
      console.log('    L' + h.line + '  .' + h.mem + '   …' + src.slice(s, e).replace(/\n/g, ' ⏎ ') + '…');
    }
  }
  console.log('\n  → 外部调用点合计 ' + total);
}

// workflow 链与 ROUTES 里有没有它们
console.log('\n════════ 链 / 路由登记 ════════');
const wf = read('core/workflow.js');
const ad = read('engines/action-desk.js');
for (const ns of TARGETS) {
  const inWf = new RegExp('[\'"]' + ns + '\\.').test(wf);
  const inAd = new RegExp('[\'"]' + ns + '\\.').test(ad);
  console.log('  ' + ns + '  链里? ' + inWf + '  路由里? ' + inAd);
}