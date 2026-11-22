'use strict';
// 实测：tests/run.js 的 vm 上下文里，引擎能看见哪些宿主能力？
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = '/home/user/wa_opt1';
process.chdir(BASE);
require(path.join(BASE, 'tests/mock.js'));
const g = global;
const src = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8').split('\n');
// 找到 ctx 的建法
src.forEach(function (l, i) {
  if (/createContext|new vm\.|sandbox/.test(l)) console.log('run.js:' + (i + 1) + ': ' + l.trim().slice(0, 140));
});
