'use strict';
// V7 立项探针：盘点「能读懂正文（文本入参）」的引擎 vs 只能靠结构化写口的引擎
const fs = require('fs');
const path = require('path');
const BASE = '/home/user/wa_opt1';
const ENG = path.join(BASE, 'engines');
const files = fs.readdirSync(ENG).filter(function (f) { return f.endsWith('.js'); });

// 文本消费特征：形参名或局部变量里出现 text/mes/utterance/line/speech + 正则/关键词匹配
const TEXT_PARAM = /function\s+\w+\s*\([^)]*\b(text|mes|raw|utterance|speech|line|sentence|content)\b/;
const KW_MATCH = /\.match\(|\.test\(|RegExp\(|\/\^|\.indexOf\(/;

const rows = [];
for (const f of files) {
  const src = fs.readFileSync(path.join(ENG, f), 'utf8');
  const lines = src.split('\n').length;
  const hasTextParam = TEXT_PARAM.test(src);
  const kwHits = (src.match(/\.indexOf\(/g) || []).length;
  const matchHits = (src.match(/\.match\(|\.exec\(/g) || []).length;
  // 是否是「从正文里抽取世界事实」的形态：既有文本入参，又有字典/关键词匹配
  const reads = hasTextParam && (kwHits + matchHits) > 0;
  rows.push({ f: f, lines: lines, hasTextParam: hasTextParam, kw: kwHits, mt: matchHits, reads: reads });
}

const readers = rows.filter(function (r) { return r.reads; }).sort(function (a, b) { return b.lines - a.lines; });
console.log('=== engines 总数 ' + rows.length + ' ===');
console.log('=== 有「文本入参 + 关键词/正则匹配」的引擎（可能能读懂正文）: ' + readers.length + ' ===');
for (const r of readers) console.log(' ' + r.f + ' | lines=' + r.lines + ' | indexOf=' + r.kw + ' | match=' + r.mt);
console.log('\n=== 有文本入参但零匹配（纯搬运不做解析）: ' + rows.filter(function (r) { return r.hasTextParam && !r.reads; }).length + ' ===');
for (const r of rows.filter(function (r) { return r.hasTextParam && !r.reads; })) console.log(' ' + r.f + ' | lines=' + r.lines);