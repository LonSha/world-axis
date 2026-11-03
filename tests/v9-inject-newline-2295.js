'use strict';
/**
 * v2.295.0 OPV9-1：注入块字面换行污染清扫。
 *
 * 背景（现场实测）：三处 buildBlock 的 return 表达式把换行写成 '\\n'（双反斜杠），
 * 于是产出里带的是**字面反斜杠 + n 两字符**，模型看到的是 `[家庭]\n甲（家庭，3人）\n乙\n共同生活单位…`
 * 里混进 `\\n`。旧锁只看「有没有内容」，看不见字符级污染，所以长期绿。
 *
 * 本锁三层：
 *   ① 静态：全仓 return 行不得出现字面 '\\n'（源码级，扫 engines/core/render/ui）。
 *   ② 动态：三处 owner 真跑 buildBlock，产出不得含字面反斜杠。
 *   ③ 负向（真源码破坏）：把 family.js 的 '\n' 破坏回 '\\n'，同一判据必须红。
 */
const fs = require('fs'), path = require('path');
const { load, must1, BASE } = require('./v8-harness.js');

let pass = 0, fail = 0;
const a = (v, m) => { if (v) pass++; else { fail++; console.error('FAIL ' + m); } };

// ── ① 静态扫描：return 行里的字面 \n ──────────────────────────────
const DIRS = ['engines', 'core', 'render', 'ui'];
const suspects = [];
DIRS.forEach(function (d) {
  const abs = path.join(BASE, d);
  if (!fs.existsSync(abs)) return;
  fs.readdirSync(abs).filter(f => f.endsWith('.js')).forEach(function (f) {
    const src = fs.readFileSync(path.join(abs, f), 'utf8');
    src.split('\n').forEach(function (line, i) {
      if (line.indexOf('return') < 0) return;
      if (line.indexOf('\\\\n') >= 0) suspects.push(d + '/' + f + ':' + (i + 1));
    });
  });
});
a(suspects.length === 0, 'no literal backslash-n in return lines (found: ' + suspects.join(', ') + ')');

// ── ② 动态 ────────────────────────────────────────────────────
function seedPerson(W, name) {
  W.store.transact(function (d) {
    d.people['p_' + name] = { id: 'p_' + name, name: name, knowledge: {}, resources: {}, life: { goals: [], schedule: [] }, updatedAt: 1 };
  });
}
function familyBlock(W) {
  seedPerson(W, '阿澄');
  W.family.setSettings({ enabled: true });
  const r = W.family.createUnit({ name: '甲宅', type: '家庭', by: '阿澄' });
  if (!r || r.ok !== true) throw Error('createUnit failed: ' + JSON.stringify(r));
  return String(W.family.buildBlock() || '');
}
function researchBlock(W) {
  seedPerson(W, '阿澄');
  W.research.setSettings({ enabled: true });
  const r = W.research.open({ hypothesis: '水车为何停转', by: '阿澄', result: '水车图纸', resultKind: 'tool', phases: 3 });
  if (!r || r.ok !== true) throw Error('research.open failed: ' + JSON.stringify(r));
  return String(W.research.buildBlock() || '');
}
function hasLiteralBackslash(s) { return s.indexOf('\\') >= 0; }

// family：有内容才判定（空世界零产出是合法设计）
const W1 = load();
const fb = familyBlock(W1);
a(fb.length > 0, 'family produces a block once a unit exists');
a(!hasLiteralBackslash(fb), 'family block has no literal backslash: ' + JSON.stringify(fb.slice(0, 140)));

const W2 = load();
const rb = researchBlock(W2);
a(rb.length > 0, 'research produces a block once a project exists');
a(!hasLiteralBackslash(rb), 'research block has no literal backslash: ' + JSON.stringify(rb.slice(0, 140)));

// agency 在空世界产不出内容，静态层已覆盖；这里只断言「若有内容则干净」
const W3 = load();
const ab = (W3.agency && typeof W3.agency.buildBlock === 'function') ? String(W3.agency.buildBlock() || '') : '';
a(!hasLiteralBackslash(ab), 'agency block (if any) has no literal backslash');

// ── ③ 负向：真源码破坏，同一判据必须红 ───────────────────────────
const REL = 'engines/family.js';
const source = fs.readFileSync(path.join(BASE, REL), 'utf8');
// 锚点：当前正确写法里的那一处 '\n共同生活单位'
const ANCHOR = "'\\n共同生活单位";
a(source.split(ANCHOR).length === 2, 'mutation anchor matches exactly once in real source');
const mutant = must1(source, ANCHOR, "'\\\\n共同生活单位");
const W4 = load({ [REL]: mutant });
const brokenBlock = familyBlock(W4);
a(brokenBlock.length > 0, 'mutant still produces a block (so the check is about chars, not emptiness)');
a(hasLiteralBackslash(brokenBlock), 'mutant block DOES carry literal backslash — same predicate goes red');

// 判据纯度：静态扫描对破坏副本也红
const staticHitsOnMutant = mutant.split('\n').filter(l => l.indexOf('return') >= 0 && l.indexOf('\\\\n') >= 0).length;
a(staticHitsOnMutant >= 1, 'static scan also red on mutant');

// 工具自证：锚点不存在 / 不唯一必须抛
let caught = 0;
try { must1(source, 'impossible-anchor-xyz', 'x'); } catch (_) { caught++; }
try { must1('aXaXa', 'X', 'y'); } catch (_) { caught++; }
a(caught === 2, 'mutation utility rejects missing and ambiguous anchors');

console.log('v9-inject-newline-2295 ' + pass + ' / 失败 ' + fail);
process.exit(fail ? 1 : 0);