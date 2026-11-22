#!/usr/bin/env node
// v2.401.0(OPV23):一次性回填 FROZEN2800（export_contract.txt 产物 → tests/run.js 冻结串）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const produced = fs.readFileSync(path.join(BASE, 'tests/export_contract.txt'), 'utf8').trim();
const runP = path.join(BASE, 'tests/run.js');
let src = fs.readFileSync(runP, 'utf8');
const m = src.match(/const FROZEN2800 = '([\s\S]*?)';/);
if (!m) { console.error('FROZEN2800 不可定位'); process.exit(1); }
if (m[1] === produced) { console.log('已一致（' + produced.length + ' 字符），无需回填'); process.exit(0); }
const esc = produced.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
src = src.replace(/const FROZEN2800 = '[\s\S]*?';/, "const FROZEN2800 = '" + esc + "';");
fs.writeFileSync(runP, src, 'utf8');
console.log('回填完成：' + m[1].length + ' → ' + produced.length + ' 字符');
