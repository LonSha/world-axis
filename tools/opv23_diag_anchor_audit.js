#!/usr/bin/env node
// v2.401.0(OPV23):诊断负控制锚点审计的 1 条问题
'use strict';
const A = require('../tests/negative-control-audit.js');
const r = A.audit();
const bad = r.problems.filter(function (p) { return p.kind !== 'ok'; });
console.log('summary:', JSON.stringify(r.summary));
console.log('problems:', JSON.stringify(bad, null, 1));
process.exit(0);