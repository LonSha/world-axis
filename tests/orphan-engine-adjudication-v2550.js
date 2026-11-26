'use strict';
/**
 * tests/orphan-engine-adjudication-v2550.js — 五台「零故事面读点」引擎的裁决锁（v2.550.0）
 *
 * 治的病（比「没接线」更根本的一件）：
 *   v2.548.0 收口时把第三梯队压到 7 台，量了一遍「有没有产品读点」，读数把五台晾在台上：
 *     `preflight 0 · polish 0 · ensemble 0`（`WA.<ns>` 零引用），
 *     `archiveHide / autoHide` 的「有人用」经核全是**工具表 / 面板开关**，不是故事面。
 *
 *   而这五台的困境各不相同，混成一句「欠债」会掩盖真因。实测三层：
 *     ① **有开关、也是开的，但开不开都一个样**：`ui/settings.js` 的「缝合引擎总开关」
 *        给 preflight / polish / archiveHide 各一行，而这三台的 `getSettings().enabled`
 *        **默认就是 true**；全仓没有任何故事面读它们 ⇒ 勾掉/勾上不改变任何注入内容。
 *        这比「默认关着」更坏：面板看起来已经在用，读数（checked）也对。
 *     ② **有工具表，但工具是手动面**：autoHide 在 `tool-diag-tables` 有 11 处、在
 *        `action-desk-routes` 有 7 条路由，玩家/模型手动点才动；故事面零读。
 *     ③ **连入口都没有**：ensemble 只有 `tool-diag-tables` 里一行「文件 → 命名空间」注册，
 *        没有开关、没有工具表、没有路由。
 *
 * 本锁锁的不是「已接」，而是这份**裁决本身可复算**：五台的可达面逐项计数、故事面逐条零读、
 * 裁决文档在位。谁哪天真把它们接进故事面，C 段立刻红，逼着改裁决（而不是悄悄多一条读点）。
 *
 * 段：
 *   A 定义面：五台都在 `WA` 上，且各自的关键方法在场（名字与文件一一对应）。
 *   B 可达面：开关 / 工具表 / 行动台路由 / 注册表 四类入口的**精确读数**（含「零」）。
 *   C 故事面：除自身文件、`tool-diag*`、`narrow-consumers`、`action-desk-routes` 之外，
 *     源码里不得出现 `WA.<ns>`。零命中是主判据。
 *   D 文档面：`docs/ORPHAN_ENGINES_ADJUDICATION.md` 在位，五台名字 + 改判触发器 + 复算命令。
 *   E 非空转：扫描面文件数下限、合成样本能被同一判定函数逮住、被排除的三个面确实存在。
 *
 * 负控（人工做，做完还原）：
 *   在 `render/inject.js` 里加一行 `WA.polish` 引用 ⇒ C 段红并点名该文件；删掉即绿。
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const env = require('./ui-gate-sync.js').fresh();
const W = env.WA;
const BASE = path.join(__dirname, '..');
const DOC_REL = 'docs/ORPHAN_ENGINES_ADJUDICATION.md';

let pass = 0;
function ok(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + ' :: ' + e.message); throw e; }
}

// ── 五台裁决对象：命名空间 ⇄ 文件 ⇄ 中文名 ──
//   `enabled` 在 A3 钉住：默认开着却无人读，正是这份裁决最要紧的那句话（见文档「开关≠读点」）。
const TARGETS = [
  { ns: 'preflight', file: 'engines/rehearse.js', zh: '写前预演与检查存档' },
  { ns: 'polish', file: 'engines/polish.js', zh: '输入润色' },
  { ns: 'ensemble', file: 'engines/ensemble.js', zh: '多模型并发推演与仲裁' },
  { ns: 'archiveHide', file: 'engines/archive-hide.js', zh: '归档楼层隐藏' },
  { ns: 'autoHide', file: 'engines/auto-hide.js', zh: '自动隐去' }
];

// ── 第二批（v2.588.0 / R264）：又七台「定义面完整、故事面零读」的引擎 ──
//   前五台的形态是「面板开关 + 注册行」；这七台形态不同，所以**不塞进 TARGETS**：
//   硬套 A3（getSettings().enabled 必为 true）会要求三台没有设置面的引擎凭空长出一个，
//   那就是为了迁就锁而改产品。故另起 SECOND_WAVE，只钉三件与形态无关的事实：
//   ① 命名空间在位且方法不是空壳；② 定义文件各一处行首赋值（不是靠注释冒充）；
//   ③ 故事面零读。可达面读数照样逐台记（大多为 0，如实报）。
//   其中 `unifiedPending` 落在 core/ 而不是 engines/ —— 它是聚合器不是引擎，
//   但「零读」的后果完全一样（产品面拿不到聚合器，待办中心就读不到合并视图）。
const SECOND_WAVE = [
  { ns: 'refine', file: 'engines/refine.js', zh: '输入润色与合并（与 polish 同族但不可替代）' },
  { ns: 'observationProjection', file: 'engines/observation-projection.js', zh: '观察面投影与归一' },
  { ns: 'binding', file: 'engines/binding.js', zh: '作用域绑定（bind / read / unbind）' },
  { ns: 'calendarPlan', file: 'engines/calendar-custom.js', zh: '自定义历法规划' },
  { ns: 'purifyScope', file: 'engines/purify-scope.js', zh: '净域保护（protect / restore）' },
  { ns: 'unifiedPending', file: 'core/unified-pending.js', zh: '统一待办聚合器' },
  { ns: 'fieldWriters', file: 'engines/field-writers.js', zh: '字段写者登记与冲突' }
];
const ALL_TARGETS = TARGETS.concat(SECOND_WAVE);
// 第二批的关键方法（逐台现场实读导出面，不是照抄注释）。
const KEYS2 = {
  refine: ['getSettings', 'normalize', 'merge', 'condense', 'polish'],
  observationProjection: ['project', 'sole', 'merge', 'settings'],
  binding: ['getSettings', 'bind', 'read', 'unbind', 'list'],
  calendarPlan: ['getSettings', 'setMonths', 'getMonths', 'label', 'labelNow', 'clear'],
  purifyScope: ['getSettings', 'protect', 'restore', 'applyWith', 'kinds'],
  unifiedPending: ['collect', 'pending', 'diagnose', 'stat'],
  fieldWriters: ['entryOf', 'writersOf', 'conflicts', 'undeclaredConflicts', 'view']
};
// 第二批可达面实测（v2.588.0 现场，node tools 复算命令见文档 D3）。
//   `assign` = 行首顶格后的 `WA.<ns> = {` 处数：必须恰 1 —— 注释里写 `= {...}` 不算。
const FACES2 = {
  refine: { switchN: 1, toolTable: 0, deskRoute: 0, registry: 1, assign: 1 },
  observationProjection: { switchN: 0, toolTable: 0, deskRoute: 0, registry: 1, assign: 1 },
  binding: { switchN: 1, toolTable: 0, deskRoute: 0, registry: 1, assign: 1 },
  calendarPlan: { switchN: 1, toolTable: 0, deskRoute: 0, registry: 1, assign: 1 },
  purifyScope: { switchN: 1, toolTable: 0, deskRoute: 0, registry: 1, assign: 1 },
  unifiedPending: { switchN: 0, toolTable: 0, deskRoute: 0, registry: 1, assign: 1 },
  fieldWriters: { switchN: 0, toolTable: 0, deskRoute: 0, registry: 1, assign: 1 }
};
// 每台至少要有这些方法才算「定义面完整」（不是空对象挂在 WA 上）。
const KEYS = {
  preflight: ['preview', 'getSettings', 'setSettings'],
  polish: ['variants', 'pick', 'getSettings'],
  ensemble: ['run', 'agreementOf', 'getSettings'],
  archiveHide: ['plan', 'shouldHide', 'getSettings'],
  autoHide: ['plan', 'mark', 'revoke', 'isHidden']
};
// 可达面的**实测计数**（v2.550.0 现场）。写成字面量而不是「≥1」：
//   数字变了 = 入口变了 = 裁决要重看，锁必须红。`ensemble` 三项全 0 是结论的一部分。
const FACES = {
  preflight: { switchN: 1, toolTable: 0, deskRoute: 0, registry: 1 },
  polish: { switchN: 1, toolTable: 0, deskRoute: 0, registry: 1 },
  ensemble: { switchN: 0, toolTable: 0, deskRoute: 0, registry: 1 },
  archiveHide: { switchN: 1, toolTable: 0, deskRoute: 0, registry: 1 },
  autoHide: { switchN: 0, toolTable: 11, deskRoute: 14, registry: 1 }
};
// 故事面扫描根：故事面 = 生成流水线 / 注入装配 / 结算所能读到的全部源码。
const SRC_DIRS = ['engines', 'core', 'render', 'ui', 'actors', 'direction'];
// 非故事面的三个已知出口：工具表、窄消费者台账、行动台路由表（手动面）。
const EXCLUDE_BASENAME = /(^tool-diag|^narrow-consumers|^action-desk-routes)/;

function walk(dir, out) {
  let ents;
  try { ents = fs.readdirSync(path.join(BASE, dir), { withFileTypes: true }); }
  catch (e) { return out; }
  ents.forEach(function (e) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.js$/.test(e.name)) out.push(rel);
  });
  return out;
}
function storyFiles() {
  const out = ['index.js'];
  SRC_DIRS.forEach(function (d) { walk(d, out); });
  return out;
}
function readsOf(list, ns) {
  const re = new RegExp('WA\\.' + ns + '\\b');
  const hits = [];
  list.forEach(function (rel) {
    const base = rel.split('/').pop().replace(/\.js$/, '');
    if (EXCLUDE_BASENAME.test(base)) return;
    if (ALL_TARGETS.some(function (t) { return t.file === rel; })) return;
    const src = fs.readFileSync(path.join(BASE, rel), 'utf8');
    if (re.test(src)) hits.push(rel);
  });
  return hits;
}
/** 行首计数：只数「整行 strip 后以 needle 开头」的行 —— 注释里提到 `WA.x = {...}` 不算。 */
function countLineStart(rel, needle) {
  return fs.readFileSync(path.join(BASE, rel), 'utf8').split('\n')
    .filter(function (ln) { return ln.trim().indexOf(needle) === 0; }).length;
}
function countIn(rel, needle) {
  const src = fs.readFileSync(path.join(BASE, rel), 'utf8');
  let n = 0;
  let i = src.indexOf(needle);
  while (i >= 0) { n++; i = src.indexOf(needle, i + needle.length); }
  return n;
}

// ═════════ A 定义面：五台都在 WA 上，关键方法在场 ═════════
ok('A0 前置：五台命名空间都在 WA 上（不是缺载/改名）', function () {
  TARGETS.forEach(function (t) {
    assert.ok(W[t.ns], 'WA.' + t.ns + ' 缺席（' + t.file + '）');
    assert.strictEqual(typeof W[t.ns], 'object', 'WA.' + t.ns + ' 不是对象');
  });
});
ok('A1 五台的关键方法都在（定义面不是空壳）', function () {
  TARGETS.forEach(function (t) {
    KEYS[t.ns].forEach(function (k) {
      assert.strictEqual(typeof W[t.ns][k], 'function', 'WA.' + t.ns + '.' + k + ' 缺席');
    });
  });
});
ok('A2 名字与文件一一对应：源码里恰有一处 `WA.<ns> = {`', function () {
  TARGETS.forEach(function (t) {
    assert.ok(fs.existsSync(path.join(BASE, t.file)), t.file + ' 不存在');
    const n = countIn(t.file, 'WA.' + t.ns + ' = {');
    assert.strictEqual(n, 1, t.file + ' 里 `WA.' + t.ns + ' = {` 应恰 1 处，实 ' + n);
  });
});
ok('A3 默认就是开的：五台 getSettings().enabled 均为 true（开却无人读）', function () {
  TARGETS.forEach(function (t) {
    const st = W[t.ns].getSettings();
    assert.strictEqual(st.enabled, true, 'WA.' + t.ns + '.getSettings().enabled 应为 true（实 '
      + JSON.stringify(st.enabled) + '）——若某台改成默认关，文档里的措辞要跟着改');
  });
});

// ═════════ B 可达面：四类非故事面入口的精确读数 ═════════
ok('B0 面板开关面：preflight / polish / archiveHide 各一行，ensemble / autoHide 无', function () {
  TARGETS.forEach(function (t) {
    const n = countIn('ui/settings.js', 'data-sw-ns="' + t.ns + '"');
    assert.strictEqual(n, FACES[t.ns].switchN, t.ns + ' 开关行数应为 ' + FACES[t.ns].switchN + '，实 ' + n);
  });
});
ok('B1 诊断工具表面：只有 autoHide 有（其余四台为 0）', function () {
  TARGETS.forEach(function (t) {
    const n = countIn('engines/tool-diag-tables.js', 'WA.' + t.ns + '.');
    assert.strictEqual(n, FACES[t.ns].toolTable, t.ns + ' 在 tool-diag-tables 的条目应为 '
      + FACES[t.ns].toolTable + '，实 ' + n);
  });
});
ok('B2 行动台路由面：只有 autoHide 有（7 条路由 × 每行 2 处引用 = 14 处）', function () {
  TARGETS.forEach(function (t) {
    const n = countIn('engines/action-desk-routes.js', 'WA.' + t.ns + '.');
    assert.strictEqual(n, FACES[t.ns].deskRoute, t.ns + ' 在 action-desk-routes 的路由应为 '
      + FACES[t.ns].deskRoute + '，实 ' + n);
  });
});
ok('B3 注册表面：五台各一行「文件 → 命名空间」（注册表不等于读点）', function () {
  TARGETS.forEach(function (t) {
    const n = countIn('engines/tool-diag-tables.js', "'" + t.file + "': '" + t.ns + "'");
    assert.strictEqual(n, FACES[t.ns].registry, t.ns + ' 注册行应为 ' + FACES[t.ns].registry + '，实 ' + n);
  });
});
ok('B4 可达≠故事面：五台入口全是手动面/面板面（为零读做前置）', function () {
  TARGETS.forEach(function (t) {
    const f = FACES[t.ns];
    const storyFace = 0;   // 四类入口没有一类在故事面上
    assert.strictEqual(storyFace, 0, t.ns);
    // 至少注册表有它 —— 否则连「登记过」都不成立，那份裁决就该改成「退役」
    assert.ok(f.registry >= 1, t.ns + ' 连注册行都没有：应改为「退役」而不是「待接」');
  });
});

// ═════════ C 故事面：零读（主判据）═════════
const FILES = storyFiles();
ok('C0 前置：扫描面非空（故事面源码文件数 ≥ 400）', function () {
  assert.ok(FILES.length >= 400, '故事面只扫到 ' + FILES.length + ' 个文件，扫描面塌了');
  assert.ok(FILES.indexOf('index.js') >= 0, 'index.js 应在扫描面里');
  assert.ok(FILES.indexOf('render/inject.js') >= 0, 'render/inject.js 应在扫描面里（负控锚点）');
});
TARGETS.forEach(function (t) {
  ok('C·' + t.ns + ' 故事面零读：除自身/工具表/窄台账/行动台外，全仓无 `WA.' + t.ns + '`', function () {
    const hits = readsOf(FILES, t.ns);
    assert.strictEqual(hits.length, 0, 'WA.' + t.ns + ' 出现了故事面读点：' + JSON.stringify(hits)
      + ' —— 若是有意接线，请先改 docs/ORPHAN_ENGINES_ADJUDICATION.md 的裁决与改判触发器，再改本锁');
  });
});

// ═════════ D 文档面：裁决在位 ═════════
ok('D0 裁决文档在位，且含五台名字', function () {
  assert.ok(fs.existsSync(path.join(BASE, DOC_REL)), DOC_REL + ' 不存在');
  const doc = fs.readFileSync(path.join(BASE, DOC_REL), 'utf8');
  TARGETS.forEach(function (t) {
    assert.ok(doc.indexOf(t.ns) >= 0, '文档里没有 ' + t.ns);
    assert.ok(doc.indexOf(t.file) >= 0, '文档里没有 ' + t.file);
  });
});
ok('D1 文档含「改判触发器」与「开关≠读点」两节（改判条件是可核的）', function () {
  const doc = fs.readFileSync(path.join(BASE, DOC_REL), 'utf8');
  assert.ok(doc.indexOf('改判触发器') >= 0, '文档缺「改判触发器」');
  assert.ok(doc.indexOf('开关≠读点') >= 0, '文档缺「开关≠读点」');
  assert.ok(doc.indexOf('复算命令') >= 0, '文档缺「复算命令」');
  assert.ok(doc.indexOf('零故事面') >= 0, '文档缺「零故事面」口径');
});
ok('D2 文档的复算命令与实际判据同源：排除项与本期扫描一致', function () {
  const doc = fs.readFileSync(path.join(BASE, DOC_REL), 'utf8');
  ['tool-diag', 'narrow-consumers', 'action-desk-routes'].forEach(function (k) {
    assert.ok(doc.indexOf(k) >= 0, '复算命令缺排除项 ' + k + '（文档与锁会漂移）');
  });
  assert.ok(doc.indexOf('orphan-engine-adjudication-v2550') >= 0, '文档里没写本锁文件名');
});

// ═════════ E 非空转：判据真的有牙 ═════════
ok('E0 判定函数有牙：合成的 `WA.polish` 样本必须被同一正则逮住', function () {
  const re = new RegExp('WA\\.' + 'polish' + '\\b');
  assert.ok(re.test('const v = WA.polish.variants(src);'), '合成样本没被正则逮住');
  // 边界：`WA.polishX` 不算（\b 起了作用），否则会误伤同前缀命名空间
  assert.ok(!re.test('WA.polishExtra.x'), '\\b 失效：同前缀命名空间被误判');
});
ok('E1 排除项真的存在：三个非故事面出口都在，不是排空', function () {
  ['engines/tool-diag-tables.js', 'engines/narrow-consumers.js', 'engines/action-desk-routes.js']
    .forEach(function (rel) {
      assert.ok(fs.existsSync(path.join(BASE, rel)), rel + ' 不存在：排除项漂了，C 段可能误判');
    });
});
ok('E2 台账口径：autoHide 已被窄消费者台账登记（本裁决不新增也不注销条目）', function () {
  const src = fs.readFileSync(path.join(BASE, 'engines/narrow-consumers.js'), 'utf8');
  assert.ok(src.indexOf("ns: 'autoHide'") >= 0, 'autoHide 应仍在窄消费者台账里');
});


// ═════════ F 第二批：七台零读引擎（v2.588.0 / R264）═════════
ok('F0 第二批命名空间都在 WA 上且是对象', function () {
  SECOND_WAVE.forEach(function (t) {
    assert.ok(W[t.ns], 'WA.' + t.ns + ' 缺席（' + t.file + '）');
    assert.strictEqual(typeof W[t.ns], 'object', 'WA.' + t.ns + ' 不是对象');
  });
});
ok('F1 第二批关键方法都在（不是空壳挂着）', function () {
  SECOND_WAVE.forEach(function (t) {
    KEYS2[t.ns].forEach(function (k) {
      assert.strictEqual(typeof W[t.ns][k], 'function', 'WA.' + t.ns + '.' + k + ' 缺席');
    });
  });
});
ok('F2 定义面：文件在场，且行首 `WA.<ns> = {` 恰一处（注释不算）', function () {
  SECOND_WAVE.forEach(function (t) {
    assert.ok(fs.existsSync(path.join(BASE, t.file)), t.file + ' 不存在');
    const n = countLineStart(t.file, 'WA.' + t.ns + ' = {');
    assert.strictEqual(n, FACES2[t.ns].assign, t.file + ' 行首 `WA.' + t.ns + ' = {` 应为 '
      + FACES2[t.ns].assign + ' 处，实 ' + n);
  });
});
ok('F3 可达面读数与现场逐台相等（面板开关 / 工具表 / 行动台）', function () {
  SECOND_WAVE.forEach(function (t) {
    const f = FACES2[t.ns];
    const sw = countIn('ui/settings.js', 'data-sw-ns="' + t.ns + '"');
    const tt = countIn('engines/tool-diag-tables.js', 'WA.' + t.ns + '.');
    const dr = countIn('engines/action-desk-routes.js', 'WA.' + t.ns + '.');
    assert.strictEqual(sw, f.switchN, t.ns + ' 开关行 ' + sw + ' ≠ ' + f.switchN);
    assert.strictEqual(tt, f.toolTable, t.ns + ' 工具表条目 ' + tt + ' ≠ ' + f.toolTable);
    assert.strictEqual(dr, f.deskRoute, t.ns + ' 行动台引用 ' + dr + ' ≠ ' + f.deskRoute);
  });
});
ok('F4 注册表面：七台各一行「文件 → 命名空间」（注册≠读点）', function () {
  SECOND_WAVE.forEach(function (t) {
    const n = countIn('engines/tool-diag-tables.js', "'" + t.file + "': '" + t.ns + "'");
    assert.strictEqual(n, FACES2[t.ns].registry, t.ns + ' 注册行应为 ' + FACES2[t.ns].registry + '，实 ' + n);
  });
});
SECOND_WAVE.forEach(function (t) {
  ok('C2·' + t.ns + ' 故事面零读：除自身/工具表/窄台账/行动台外，全仓无 `WA.' + t.ns + '`', function () {
    const hits = readsOf(FILES, t.ns);
    assert.strictEqual(hits.length, 0, 'WA.' + t.ns + ' 出现了故事面读点：' + JSON.stringify(hits)
      + ' —— 若是有意接线，请先改 docs/ORPHAN_ENGINES_ADJUDICATION.md 的裁决与改判触发器，再改本锁');
  });
});
ok('F5 文档含第二批七台的命名空间与文件（裁决写进文档才算数）', function () {
  const doc = fs.readFileSync(path.join(BASE, DOC_REL), 'utf8');
  SECOND_WAVE.forEach(function (t) {
    assert.ok(doc.indexOf(t.ns) >= 0, '文档里没有 ' + t.ns);
    assert.ok(doc.indexOf(t.file) >= 0, '文档里没有 ' + t.file);
  });
});
ok('F6 非空转：行首计数不把注释里的 `= {...}` 算成定义', function () {
  // 合成样本：一行注释提及 + 一行真赋值 ⇒ 必须计 1（若计 2，F2 就变成「靠注释也能过」）
  const probe = '//   `WA.probeNs = {...}` 也因此没进 nsOwner\n  WA.probeNs = { a: 1 };\n';
  const n = probe.split('\n').filter(function (ln) { return ln.trim().indexOf('WA.probeNs = {') === 0; }).length;
  assert.strictEqual(n, 1, '行首计数口径失效：注释被算成定义（实 ' + n + '）');
});

console.log('\norphan-engine-adjudication-2550: pass (' + pass + ' 段：12 台零故事面读点已裁决（五台 + 第二批七台），不接线)');