'use strict';
// V7 立项探针（最终定稿判据）：主链消费面 vs 结构化引擎写口面 的交叉核对
// 回答一个问题：世界每轮都在推演，推演产出的事实最终写进了哪些引擎？
const fs = require('fs');
const path = require('path');
const BASE = '/home/user/wa_opt1';

function read(p) { try { return fs.readFileSync(path.join(BASE, p), 'utf8'); } catch (e) { return ''; } }

const bs = read('engines/backstage.js');

// 1. 契约声明的节（输出契约区）
const contract = (bs.slice(bs.indexOf('【输出契约】'), bs.indexOf('宁缺毋滥')))
  .match(/"[a-zA-Z_]+":/g) || [];
const contractSet = new Set(contract.map(function (s) { return s.replace(/["\s:]/g, ''); }));

// 2. applyResult 真读取的顶层节
const ai = bs.indexOf('applyResult(draft, r, anchor)');
const body = bs.slice(ai, ai + 40000);
const readSet = new Set();
const re = /\br\.([a-zA-Z_]+)\b/g;
let m;
while ((m = re.exec(body)) !== null) readSet.add(m[1]);
const REAL_READ = ['clock','world_pulse','worldFacts','people','persona_update','relation_update',
  'currents','knowledge_updates','echoes','chronicle','foreshadows','factions','reputation',
  'economy','winds','influenceChain','enemies','blackbox','worldTrends','regionalIncident',
  'distantEvent','nearEvent','entities','events_create','events_update','next_turn_injection'];

const consumed = REAL_READ.filter(function (k) { return readSet.has(k); });
const notConsumed = REAL_READ.filter(function (k) { return !readSet.has(k); });
console.log('=== backstage 输出契约节数 = ' + REAL_READ.length + ' ===');
console.log('=== applyResult 真读取 = ' + consumed.length + ' ===');
console.log(' ' + consumed.join(', '));
console.log('=== 契约有、applyResult 未读 = ' + notConsumed.length + ' ===');
console.log(' ' + notConsumed.join(', '));

// 3. backstage 实际写到的命名空间
const nsUsed = new Set();
const re2 = /\bWA\.([a-zA-Z_]+)\.([a-zA-Z_]+)\s*\(/g;
while ((m = re2.exec(bs)) !== null) nsUsed.add(m[1]);
const NSS = [...nsUsed].sort();
console.log('\n=== backstage 调用的命名空间（' + NSS.length + '）===');
console.log(' ' + NSS.join(', '));

// 4. 关键结构化引擎是否其一
const TARGET = ['life','events','plan','intel','bonds','org','sediment','agency','masks',
  'temperament','shadow','fondness','rivalry','karma','chrono','gauge','quota','spotlight',
  'beastBond','appearance','lingqi','canon','stall','contest','survey','probe','diplomacy',
  'aftermath','inst','temporalLock','ladder','enigma','warrant','tempo','difficulty','sceneSlice'];
const missing = TARGET.filter(function (n) { return NSS.indexOf(n) < 0; });
console.log('\n=== 目标结构化引擎 ' + TARGET.length + ' 个中，backstage 零调用的 = ' + missing.length + ' ===');
console.log(' ' + missing.join(', '));

// 5. 全产品侧，这些引擎的写口谁在调
function walk(dir, out) {
  let ents = [];
  try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); } catch (e) { return out; }
  for (const e of ents) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel, out); else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}
const PROD = [];
for (const d of ['engines','core','ui','render','actors','direction','compat','design']) walk(d, PROD);

const WRITE_VERB = /^(set(?!tings)|add|schedule|start|cancel|depart|arrive|propose|declare|seal|settle|resolve|claim|advance|grant|create|record|feed|inject|register|bind|fulfill|relay|sign|confirm|postpone|complete|transition|drop|expand|converge|stall|abandon|refute|conceal|investigate|mutate|propagate|compete|claim|mark|sink|knot|lock|unlock|anchor|gain|use|define|escalate|deescalate|report|pardon|train|bond|note|plan|peek|clear|seed|stageAdd|stageResolve|spend|advanceRound|submit|rule|enforce|apply|voiceCheck|socialHint|noteAdd|posterior|utilityOf|ackSent|inQuiet|assign|registerAnchor|setProfile|setGear|setBaseline|setView|setChannel|setLoad|setBond|setMask|setTemperament|addGoal|addCommitment|addSchedule|addPlace|addRoad|addEvent|addBlock|addChain|addLead|addIntel|addLink|addShadow|addExperience|addEvidence|recordExperience|declareSpot)/;

const table = [];
for (const ns of TARGET) {
  const callers = [];
  for (const f of PROD) {
    const src = read(f);
    if (!src) continue;
    const r3 = new RegExp('WA\\.' + ns + '\\.([A-Za-z_$][\\w$]*)\\s*\\(', 'g');
    let x, hits = [];
    while ((x = r3.exec(src)) !== null) hits.push(x[1]);
    if (hits.length) callers.push(f + ' -> ' + [...new Set(hits)].join('/'));
  }
  // 只保留写口调用者
  const writeCallers = callers.filter(function (c) {
    const ms = c.split(' -> ')[1].split('/');
    return ms.some(function (k) { return WRITE_VERB.test(k); });
  });
  table.push({ ns: ns, all: callers.length, write: writeCallers.length, detail: writeCallers.slice(0, 3) });
}

console.log('\n=== 目标引擎：产品侧「含写口调用」的文件数（0 = 只能靠外部/面板/无驱动）===');
for (const t of table.sort(function (a, b) { return a.write - b.write; })) {
  console.log(' ' + (t.write === 0 ? '[0] ' : '    ') + t.ns + ' : writeCallers=' + t.write + (t.detail.length ? '  ' + t.detail.join(' | ').slice(0, 120) : ''));
}
const zero = table.filter(function (t) { return t.write === 0; });
console.log('\n=== 零写口驱动 = ' + zero.length + ' 个 ===');
console.log(' ' + zero.map(function (t) { return t.ns; }).join(', '));