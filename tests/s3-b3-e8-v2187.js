'use strict';
// WorldAxis tests/s3-b3-e8-v2187.js (v2.187.0) — E8 依赖体检与迁移助手专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许把两种不同的处境写成同一个形状」）：
//   ① **缺依赖就明说缺**：`absent` 一律进 missing 并计入总判 —— 不静默跳过；
//   ② **不假装可用**：有任何 `absent` / `unknown` / 版本不合 ⇒ 总判**永不**是 `usable`
//      （`unknown` 是合法结论，不是「差不多能用」）；
//   ③ **探不出 ≠ 没有**：`unknown` 与 `absent` 分列，「不知道有没有」与「没有」处置相反；
//   ④ **环境限制 ≠ 这一份的未知**：对**所有**可搬物都一样的探不出（本仓无媒体资产登记面）
//      归 `envLimited` 且**不参与总判** —— 否则每一份可搬物的总判都恒为 unknown，这一列就废了；
//   ⑤ **只读**：零 `store.transact`、零文件写、**不驱动任何模块干活**
//      （不为了核对 pack 版本去调 worldSeed.importPack —— 那会动它的计数器）；
//   ⑥ **迁移失败保留原文件**：prepare 只出计划，回带源指纹与 `srcUntouched`，
//      本模块没有任何一条写路径；
//   ⑦ **不把蓝图当聊天存档**：`archive.isChatArchive` 恒 false 且逐条列出「不含什么」；
//   ⑧ **版本真源单一**：四处版本号全部读自各自模块；**读不到就报 unknown，不写常量冒充**
//      （转移包信封版本 world-seed 未导出 ⇒ 恒 unknown，这一项就是这条边界的活证据）。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD），而不是自拼一份模块清单。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const synthHost = require('./synth-host.js');
const REL = 'engines/dep-check.js';
const KEYS = ['getSettings', 'setSettings', 'catalog', 'check', 'prepare', 'diagnose', 'stat'];
// 按仓规「无消费方不挂导出」：resetStat 连产品侧消费方都没有（不导出）。
const MUST_BE_ABSENT = ['resetStat'];
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.depCheck = {');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
/** 最小 localStorage 桩 */
function fakeLS() {
  const m = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    _dump: function () { return m; }
  };
}
/** 合成宿主：真 settingsBus + 真 inputGuard + **真 store**（快照走 store.get）。 */
function hostWith(src, stubs) {
  const c = synthHost.negativeContext({});
  c.window.localStorage = fakeLS();
  vm.runInContext(readOf('core/settings-bus.js'), c, { filename: 'core/settings-bus.js' });
  vm.runInContext(readOf('core/store.js'), c, { filename: 'core/store.js' });
  vm.runInContext(readOf('core/input-guard.js'), c, { filename: 'core/input-guard.js' });
  vm.runInContext(src, c, { filename: REL });
  const WA = c.window.WorldAxis;
  try { WA.store.init(); } catch (e) { /* 已初始化 */ }
  if (stubs) stubs(WA);
  return WA;
}
/** 一份合规格的蓝图桩（字段形状取自 world-blueprint 的真实导出体，不是「随便编一份」）。 */
function BP(over) {
  return Object.assign({ bpVer: 1, bpSig: 'abcd1234', worldKey: '', at: 0, keep: 'roster',
    ids: { people: [{ key: 'p_a', name: 'A' }], powers: [{ key: 'f_A', name: 'A', weight: 1 }],
      places: [], resources: [] },
    relations: [], roads: [], era: { title: 'T', label: 'L', note: '' }, roster: [], mech: {},
    scene: { id: 'blank', enabled: false, zeroed: true }, deps: [] }, over || {});
}
/**
 * 全源桩：**只桩「读口」不桩「数据」** —— 每个桩的形状逐字对齐真引擎的公开读口
 *   （BP_VER / KEEP_LEVELS / SEED_VER / stat().retainNote / FORMAT / SCOPES / GUARDED /
 *   migrations() / migrate() / SOURCE_FILES / staleness() / peekEntries）。
 */
function SOURCES(WA) {
  WA.worldBlueprint = { BP_VER: 1,
    KEEP_LEVELS: [{ id: 'structure', label: '仅结构', note: 'N1' }, { id: 'roster', label: '结构与人设', note: 'N2' },
      { id: 'mech', label: '结构与人设与机制', note: 'N3' }],
    getSettings: function () { return { enabled: true }; } };
  WA.worldSeed = { SEED_VER: 1,
    getSettings: function () { return { enabled: false }; },
    stat: function () { return { retainNote: '保留层级：势力名字与权重。不保留：人物 id / 道路端点。' }; } };
  WA.checkpoints = { FORMAT: 1, SCOPES: ['global', 'module', 'scene'], GUARDED: ['schemaVersion'],
    getSettings: function () { return { enabled: true }; },
    migrations: function () { return []; }, migrate: function () { return { ok: true, env: {} }; } };
  WA.recipe = { SOURCE_FILES: { themes: 'engines/theme.js', kinds: 'engines/act.js', org: 'engines/org.js' },
    getSettings: function () { return { enabled: true }; },
    staleness: function () { return { kinds: [], themes: [], policies: [] }; } };
  WA.theme = {}; WA.act = {}; WA.org = {};
  WA.worldbook = { peekEntries: function () { return [{ id: 1 }]; } };
  // 宿主面：`compat.context()` 是「宿主角色卡在不在」的**唯一探针**（真引擎读 name2）。
  //   不桩它的话，host-card 恒 unknown ⇒ 每份体检都带一个「这一份的未知」，把要测的读数淹没。
  WA.compat = { context: function () { return { name2: '测试卡' }; } };
}
function noSource(WA) {
  ['worldBlueprint', 'worldSeed', 'checkpoints', 'recipe', 'theme', 'act', 'org', 'worldbook', 'compat']
    .forEach(function (k) { WA[k] = undefined; });
}

let pass = 0, fail = 0;
const failures = [];
function a(cond, name) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; failures.push(name); console.log('  ✗ ' + name); } }

// ── A 段：静态契约 ─────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'e8/A1: 能从真源码取出 WA.depCheck 的对象字面量体');
  KEYS.forEach(function (k) { a(body.indexOf(k + ':') > 0 || body.indexOf(k + ': ') > 0, 'e8/A2: 导出面含 ' + k); });
  MUST_BE_ABSENT.forEach(function (k) { a(body.indexOf(k + ':') < 0, 'e8/A3: 导出面**没有** ' + k); });
  a(/const DEF = \{ enabled: false, maxDeps: 24, maxDegrade: 16 \}/.test(src),
    'e8/A4: 默认关 + 两项参数声明');
  a(/bounds: \{ maxDeps: \[4, 64\], maxDegrade: \[4, 48\] \}/.test(src), 'e8/A5: 区间声明逐字在位');
  a(/LS_KEY = 'worldaxis_dep_check_settings_v1'/.test(src), 'e8/A6: 设置键是单一真源');
  a(/module: 'depCheck'/.test(src), 'e8/A7: 设置登记 module 为 depCheck（settings-registry-only 档的存在性前提）');
  // 边界⑤ 只读：零 store 写 + 不驱动任何模块干活
  a(src.indexOf('WA.store.transact') < 0 && src.indexOf('.transact(') < 0,
    'e8/A8: **零 store 写** —— 全文没有 transact（体检是纯读）');
  // 正文里出现这些名字只准出现在**注释**里（说明「为什么不去调它」）；真调用一律不许有。
  //   口径：逐行剥掉行首注释行后再找调用形态 —— 否则「注释里解释了为什么不调」会被判成「调了」。
  const codeLines = src.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); });
  const codeOnly = codeLines.join('\n');
  ['importPack(', 'initConfirm(', 'sow(', 'importBlueprint(', 'previewImport(', 'importOne('].forEach(function (t) {
    a(codeOnly.indexOf(t) < 0, 'e8/A9: **不驱动任何模块干活** —— 真代码里不调 ' + t);
  });
  // 边界⑧ 版本真源单一：四处版本全部读自各自模块
  ['worldBlueprint.BP_VER', 'worldSeed.SEED_VER', 'checkpoints.FORMAT'].forEach(function (t) {
    a(src.indexOf(t) >= 0, 'e8/A10: 版本真源读自 ' + t + '（不自带副本）');
  });
  a(/version-source-not-exported/.test(src) && /pack: null/.test(src),
    'e8/A11: 转移包信封版本真源未导出 ⇒ 恒 unknown + 诊断面报 null（不写常量冒充）');
  // 【口径必须与判据同宽】`world-seed` 自己**有** PACK_VER，本模块正文提到它只准在注释里
  //   （解释「为什么不去读它」）。真代码里读它一次，就是第二份版本真源。
  //   H5 纯度：判据必须与口径同宽 —— 正文里 `source: 'worldSeed.PACK_VER'` 是**标签字符串**
  //   （说明「缺的是哪一份真源」），不是把 PACK_VER 当值读。先把字符串字面量剥掉再查。
  const codeNoStr = codeOnly.replace(/'[^'\n]*'/g, "''").replace(/"[^"\n]*"/g, '""');
  a(codeNoStr.indexOf('PACK_VER') < 0,
    'e8/A12: 真代码里**不读** PACK_VER（提出一个常量就是第二份版本真源；只准作标签串出现）');
  // 边界② 不假装可用
  a(/const VERDICTS = \['usable', 'degraded', 'unknown', 'blocked'\]/.test(src),
    'e8/A13: 总判是四态封闭集（usable / degraded / unknown / blocked）');
  // 边界①② 依赖三态 + required
  a(/state: 'present'/.test(src) && /state: 'absent'/.test(src) && /state: 'unknown'/.test(src),
    'e8/A14: 依赖三项态逐字在位（present / absent / unknown）');
  a(/required: true/.test(src) && /missingRequired/.test(src),
    'e8/A15: 必需依赖缺席进 missingRequired（与可选缺项分列）');
  // 边界④ 环境限制分列
  a(/envLimited: true/.test(src) && /const OWN_UNK/.test(src),
    'e8/A16: 环境限制项带 envLimited 且不参与总判（OWN_UNK 排除它）');
  a(/no-registry-in-repo/.test(src), 'e8/A17: 媒体资产报「本仓无登记面」的域内码');
  // 边界⑥ 迁移助手只出计划
  a(/srcUntouched: true/.test(src), 'e8/A18: prepare 回带 srcUntouched（原文件未动）');
  a(/本模块\*\*没有写路径\*\*/.test(src), 'e8/A19: 逐字写明「本模块没有写路径」');
  // 边界⑦ 不是聊天存档
  a(/isChatArchive: false/.test(src) && /notIncluded/.test(src),
    'e8/A20: archive.isChatArchive 恒 false 且逐条列出不含什么');
  // 边界⑤ 降级损失取自真源
  a(/worldBlueprint.KEEP_LEVELS/.test(src) && /worldSeed.stat\(\).retainNote/.test(src)
    && /checkpoints.SCOPES/.test(src),
    'e8/A21: 三处损失面来源逐字写自各导入侧真源');
  a(/道路只记/.test(src) && /同名人物/.test(src),
    'e8/A22: 有损格式的两条硬承诺逐字在位（不伪造道路端点 / 不伪造同名身份）');
  a(readOf('index.js').indexOf("'engines/dep-check.js'") >= 0, 'e8/A23: index.js LOAD_ORDER 装载');
  a(readOf('tests/run.js').indexOf("'engines/dep-check.js'") >= 0, 'e8/A24: tests/run.js LOAD 装载');
  // 装载顺序：四处版本真源 + 配方 + 世界书 + 宿主面都必须排在它之前
  const idx = readOf('index.js');
  const pos = idx.indexOf("'engines/dep-check.js'");
  ['engines/world-blueprint.js', 'engines/world-seed.js', 'engines/checkpoints.js', 'engines/recipe.js',
    'engines/worldbook.js', 'engines/campaign.js'].forEach(function (f) {
    a(idx.indexOf("'" + f + "'") >= 0 && idx.indexOf("'" + f + "'") < pos, 'e8/A25: ' + f + ' 排在 dep-check 之前');
  });
  const diag = readOf('engines/tool-diag.js');
  a(diag.indexOf("'engines/dep-check.js': 'depCheck'") >= 0, 'e8/A26: tool-diag MODULE_EXPORTS 登记');
  a(diag.indexOf('function secDepCheck()') >= 0, 'e8/A27: tool-diag secDepCheck() 存在');
  a(diag.indexOf('depCheck: secDepCheck()') >= 0, 'e8/A28: tool-diag 诊断对象成员在位');
  a(diag.indexOf('atlas: secAtlas(),') >= 0, 'e8/A28b: 上一版的 atlas 成员未被挤掉（新增不许删旧）');
  const pan = readOf('ui/panel.js');
  ['WA.depCheck.check', 'WA.depCheck.prepare', 'WA.depCheck.catalog', 'WA.depCheck.diagnose',
    'WA.depCheck.getSettings', 'WA.depCheck.setSettings'].forEach(function (t) {
    a(pan.indexOf(t) >= 0, 'e8/A29: 面板上有 ' + t + ' 的真消费方（不是 test-only 挂着）');
  });
  ['wa-dc-enabled', 'wa-dc-kind', 'wa-dc-in', 'wa-dc-use', 'wa-dc-check', 'wa-dc-plan', 'wa-dc-catalog', 'wa-dc-diag', 'wa-dc-out']
    .forEach(function (id) { a(pan.indexOf(id) >= 0, 'e8/A30: 面板渲染 ' + id); });
  a(pan.indexOf('<div class="wa-sec">依赖体检与迁移助手</div>') >= 0, 'e8/A31: 分区标题是纯文本形态且含模块身份词');
  a(pan.indexOf('atEsc') < 0 || pan.indexOf('const atEsc') >= 0 || pan.indexOf('atEsc = (v)') >= 0,
    'e8/A32: 本版新增区块不含未定义的 atEsc（ui-gate 抓到过的 ReferenceError 面）');
  a(diag.indexOf("page: 'tools', ids: ['wa-dc-enabled'") >= 0, 'e8/A33: UI_BINDINGS 登记在**工具页**（与渲染处同页）');
  const mv = (readOf('index.js').match(/VERSION = '([0-9.]+)'/) || [])[1] || '';
  const cmp = function (x, y) {
    const A = String(x).split('.').map(Number), B = String(y).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0); }
    return 0;
  };
  a(cmp(mv, '2.188.0') >= 0, 'e8/A34: 入口版本不低于本锁的交付基线（实 ' + mv + '）');
}

// ── B 段：运行时行为 ───────────────────────────────────────────────────
function runB(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  a(typeof WA.depCheck === 'object', 'e8/B1: 模块装载');
  a(KEYS.every(function (k) { return typeof WA.depCheck[k] === 'function'; }), 'e8/B2: 全部导出可调用');
  a(WA.depCheck.getSettings().enabled === false, 'e8/B3: 默认关');
  a(WA.depCheck.check(BP()).reason === 'disabled', 'e8/B4: 关闭时 check 拒收 disabled');
  WA.depCheck.setSettings({ enabled: true });
  const c = WA.depCheck.catalog();
  a(c.kinds.length === 4 && c.depKinds.length === 3 && c.depStates.length === 3 && c.verdicts.length === 4,
    'e8/B5: catalog 四张封闭集（体裁 / 依赖类目 / 状态 / 总判）');
  a(c.kinds.indexOf('checkpoint') >= 0 && c.verdicts.indexOf('unknown') >= 0, 'e8/B5b: 体裁与总判词表含全部成员');
  // 真装载环境（全源在场）：蓝图体检
  const r = WA.depCheck.check(BP());
  a(r.ok === true && r.kind === 'blueprint', 'e8/B6: 蓝图体裁判定');
  a(r.format.state === 'ok' && r.format.want === 1 && r.format.source === 'worldBlueprint.BP_VER',
    'e8/B7: 蓝图格式与版本真源读自 worldBlueprint.BP_VER');
  a(r.archive.isChatArchive === false && r.archive.notIncluded.length >= 4, 'e8/B8: 蓝图不是聊天存档且列出不含面');
  a(r.degradeSource === 'worldBlueprint.KEEP_LEVELS', 'e8/B9: 蓝图损失面来源是真源 KEEP_LEVELS');
  // 三态与分列
  const byId = {};
  r.deps.forEach(function (d) { byId[d.id] = d; });
  a(!!byId['media'] && byId['media'].state === 'unknown' && byId['media'].envLimited === true,
    'e8/B10: 媒体资产恒 unknown 且带 envLimited（环境限制）');
  a(r.envLimited.indexOf('media') >= 0 && r.unverifiable.indexOf('media') < 0,
    'e8/B11: 环境限制**不混进** unverifiable（否则总判恒 unknown）');
  a(WA.depCheck.check(BP({ mech: { worldBlueprint: { enabled: true } } })).deps
    .filter(function (d) { return d.id === 'mechanism:worldBlueprint'; })[0].state === 'present',
    'e8/B12: 机制开关一致 ⇒ present（蓝图引擎真在且开着）');
  const r2 = WA.depCheck.check(BP({ mech: { worldBlueprint: { enabled: false } } }));
  const m = r2.deps.filter(function (d) { return d.id === 'mechanism:worldBlueprint'; })[0];
  a(m.state === 'absent' && m.required === true, 'e8/B13: 机制开关不一致（需关而实证开）⇒ absent 且 required');
  a(r2.verdict === 'blocked' && r2.verdictBasis.indexOf('required-dep-absent') === 0,
    'e8/B14: 必需依赖缺席 ⇒ 总判 blocked 且依据点名该依赖');
  a(r2.missingRequired.indexOf('mechanism:worldBlueprint') >= 0, 'e8/B15: missingRequired 含该机制');
  // 版本不合
  a(WA.depCheck.check(BP({ bpVer: 9 })).verdict === 'blocked', 'e8/B16: 蓝图版本过高 ⇒ blocked');
  a(WA.depCheck.check(BP({ bpVer: 9 })).format.reason === 'too-new', 'e8/B17: 过高归因是 too-new（不与过低同码）');
  a(WA.depCheck.check({ bpVer: 9, ids: {} }).format.reason === 'too-new', 'e8/B17b: 形状够判体裁即判版本');
  // 种子：损失面逐字取自 worldSeed
  const s = WA.depCheck.check({ ver: 1, sig: 'deadbeef', powers: [], network: { nodes: [], edges: [] },
    geo: { places: ['p'], roads: 4 }, era: {} });
  a(s.kind === 'seed', 'e8/B18: 种子体裁判定');
  a(s.degradeSource === 'worldSeed.stat().retainNote', 'e8/B19: 种子损失面来源是 stat().retainNote');
  a(s.degrade.some(function (x) { return /不保留/.test(x.note || ''); }), 'e8/B20: 保留说明**逐字**取自 worldSeed（不重写、不软化）');
  a(s.degrade.some(function (x) { return /道路只记/.test(x.loss || ''); }), 'e8/B21: 道路端点不还原如实标注');
  a(s.degrade.some(function (x) { return /同名人物/.test(x.loss || ''); }), 'e8/B22: 同名身份不区分如实标注');
  a(s.degrade.some(function (x) { return /4 条/.test(x.loss || ''); }), 'e8/B22b: 道路「数量」按这份的实际值报出');
  // 转移包：信封版本真源未导出 ⇒ unknown ⇒ 总判 unknown
  const pk = WA.depCheck.check({ packVer: 1, seed: { ver: 1, sig: 'deadbeef', powers: [],
    network: { nodes: [], edges: [] }, geo: { places: ['p'], roads: 1 }, era: {} } });
  a(pk.kind === 'pack' && pk.format.state === 'unknown'
    && pk.format.why === 'version-source-not-exported', 'e8/B23: packVer 真源未导出 ⇒ unknown（不写常量冒充）');
  a(pk.format.envelopeGot === 1, 'e8/B24: 如实回带信封里那个 packVer（报了但不据它下结论）');
  a(pk.verdict === 'unknown' && pk.verdictBasis.indexOf('format:') >= 0, 'e8/B25: 验不了 ⇒ 总判 unknown（不冒充可用）');
  a(pk.format.seed.state === 'ok', 'e8/B26: 内层种子版本仍按其真源单独判（一层验不了不拖累另一层）');
  // 存档信封
  const ck = WA.depCheck.check({ worldaxisCheckpoint: 1, slot: { scope: 'module', keys: ['a'] } });
  a(ck.kind === 'checkpoint' && ck.format.source === 'checkpoints.FORMAT', 'e8/B27: 存档信封体裁与版本真源');
  a(ck.degradeSource === 'checkpoints.SCOPES / GUARDED', 'e8/B28: 存档损失面来源是真源 SCOPES/GUARDED');
  a(ck.degrade.some(function (x) { return /schemaVersion/.test(x.loss || ''); }), 'e8/B29: 守卫键永不还原如实标注');
  const ck2 = WA.depCheck.check({ worldaxisCheckpoint: 5, slot: { scope: 'global' } });
  a(ck2.format.state === 'blocked' && ck2.format.reason === 'too-new' && ck2.verdict === 'blocked',
    'e8/B30: 未来格式 ⇒ too-new ⇒ blocked');
  // 迁移助手：只出计划
  const p1 = WA.depCheck.prepare(BP());
  a(p1.ok === true && p1.action === 'install' && p1.srcUntouched === true, 'e8/B31: prepare 对蓝图给 install 计划且标记原文件未动');
  a(typeof p1.srcSig === 'string' && p1.srcSig.length === 8, 'e8/B32: prepare 回带 8 位源指纹');
  a(p1.srcSig === WA.depCheck.check(BP()).srcSig, 'e8/B33: 同一份输入两次得到的指纹相同（指纹真由内容算出）');
  const p2 = WA.depCheck.prepare(BP({ bpVer: 9 }));
  a(p2.ok === false && p2.reason === 'too-new' && p2.srcUntouched === true,
    'e8/B34: 不能迁移 ⇒ 拒收且仍标记原文件未动（失败不许静默改文件）');
  const p3 = WA.depCheck.prepare({ worldaxisCheckpoint: 1, slot: {} });
  a(p3.ok === true && p3.action === 'importOne' && p3.why === 'already-current',
    'e8/B35: 存档信封同版 ⇒ 计划是 importOne 且 already-current');
  const p4 = WA.depCheck.prepare({ worldaxisCheckpoint: 5, slot: {} });
  a(p4.ok === false && p4.why === undefined ? true : (p4.ok === false && p4.reason === 'too-new'),
    'e8/B36: 存档信封版本过高 ⇒ 计划拒收 too-new');
  // 只读：跑遍全部对外口后 store 零写
  const H0 = hostWith(srcOf(), SOURCES);
  H0.depCheck.setSettings({ enabled: true });
  let writes = 0;
  const orig = H0.store.transact;
  H0.store.transact = function () { writes++; return orig.apply(this, arguments); };
  H0.depCheck.check(BP()); H0.depCheck.prepare(BP()); H0.depCheck.catalog();
  H0.depCheck.diagnose(); H0.depCheck.stat(); H0.depCheck.getSettings();
  a(writes === 0, 'e8/B37: 跑遍全部对外口后 store **零写**（实 ' + writes + '）');
  // 台账真在动
  a(H0.depCheck.stat().checks >= 1 && H0.depCheck.stat().prepared >= 1, 'e8/B38: 会话读数真在动（checks / prepared）');
  // 源缺席 ⇒ 不猜（版本 unknown、损失也算不出）
  const H1 = hostWith(srcOf(), function (WA) { noSource(WA); });
  H1.depCheck.setSettings({ enabled: true });
  const r3 = H1.depCheck.check(BP());
  a(r3.format.state === 'unknown' && r3.format.why === 'version-source-absent',
    'e8/B39: 蓝图模块缺席 ⇒ 版本 unknown（不猜一个版本出来）');
  a(r3.degradeUnknown === 'keep-levels-source-absent', 'e8/B40: 保留层级源缺席 ⇒ 损失面报 unknown（算不出就说算不出）');
  a(r3.verdict === 'unknown', 'e8/B41: 验不出 ⇒ 总判 unknown');
  a(r3.deps.filter(function (d) { return d.id === 'recipe-sources'; })[0].state === 'unknown',
    'e8/B42: 配方真源缺席 ⇒ unknown（那是**本侧**的问题，不是对方的）');
  a(H1.depCheck.diagnose().versionSources.blueprint === null, 'e8/B43: 诊断面版本真源报 null（不是 0）');
  // 形状不合与体裁认不出
  a(H1.depCheck.check('nope').reason === 'bad-shape', 'e8/B44: 非对象 ⇒ bad-shape');
  const uk = H1.depCheck.check({ x: 1 });
  a(uk.reason === 'unknown-kind' && Array.isArray(uk.shape), 'e8/B45: 认不出体裁 ⇒ unknown-kind（不猜一种）');
  a(H1.depCheck.stat().refused >= 1, 'e8/B46: 拒收进故障分桶（可复算）');
  // diagnose 的四源
  const d0 = WA.depCheck.diagnose();
  a(typeof d0.deps.worldBlueprint === 'boolean' && typeof d0.deps.checkpoints === 'boolean',
    'e8/B47: 诊断面逐源报「在不在」');
  a(d0.missingVersionSource.indexOf('pack') >= 0, 'e8/B48: 诊断面点名「哪个版本真源读不到」');
}

// ── C 段：接线面 ───────────────────────────────────────────────────────
function runC(a) {
  const src = srcOf();
  a(src.indexOf('bounds: {') >= 0, 'e8/C1: 设置区间声明（settingsBus 越界拒收的前提）');
  a(src.indexOf('WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);') >= 0,
    'e8/C2: 设置键走 __settingsRegs 登记');
  a(src.indexOf('WA.registerModule') >= 0, 'e8/C3: 装载期自注册（模块图需要）');
  a(/module: 'depCheck'/.test(src), 'e8/C4: 设置登记的 module 与命名空间同名');
  a(src.indexOf('WA.store.get') < 0, 'e8/C5: 连 store 读面都不碰（体检不需要它读世界状态）');
  a(src.indexOf('WA.store.read') < 0, 'e8/C6: 不绕道 read 取别人的单键');
  // 只读：不写任何别人的键
  ['worldBlueprint', 'worldSeed', 'checkpoints', 'recipe', 'worldbook', 'theme', 'act', 'org'].forEach(function (ns) {
    const wrote = new RegExp('d\\.' + ns + '\\s*=').test(src) || new RegExp('draft\\.' + ns + '\\s*=').test(src);
    a(!wrote, 'e8/C7: 不写 ' + ns + ' 的键（只读它的公开读口）');
  });
  // 不调任何写口（体检不许改别人的东西）
  ['importPack(', 'initConfirm(', 'sow(', 'importBlueprint(', 'previewImport(', 'importOne(',
    'exportOne(', 'registerMigration(', 'staleBasics('].forEach(function (t) {
    a(src.indexOf(t) < 0, 'e8/C8: 不调写口/驱动口 ' + t);
  });
  // 唯一允许的驱动口：migrate（checkpoints 自己声明它是纯读 —— 只做深拷 + 链上步进）
  a(src.indexOf('C.migrate(p)') >= 0 || src.indexOf('.migrate(') >= 0, 'e8/C9: 可迁移性走 checkpoints.migrate（纯读，不落盘）');
  a(src.indexOf('localStorage.setItem') < 0 && src.indexOf('setItem(') < 0,
    'e8/C10: 零 localStorage 写（设置走 settingsBus）');
}

// ── N 段：真源码破坏 + 两向自证 ─────────────────────────────────────────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: 缺席依赖被折成「在」⇒ 缺什么这件事从报告里消失',
      from: "    dep(rows, { id: 'media', label: '媒体资产（立绘 / 音效 / 图像包）', kind: 'external', required: false,\n      state: 'unknown', envLimited: true, why: 'no-registry-in-repo',",
      to: "    dep(rows, { id: 'media', label: '媒体资产（立绘 / 音效 / 图像包）', kind: 'external', required: false,\n      state: 'present', envLimited: true, why: 'no-registry-in-repo',",
      probe: function (WA) {
        SOURCES(WA);
        WA.depCheck.setSettings({ enabled: true });
        const r = WA.depCheck.check(BP());
        return r.deps.filter(function (d) { return d.id === 'media'; })[0].state;
      },
      want: 'unknown' },
    { n: 2, why: 'N2: 环境限制混进「这一份的未知」⇒ 每一份可搬物的总判都恒为 unknown（总判这一列作废）',
      from: "  const OWN_UNK = function (d) { return d.state === 'unknown' && d.envLimited !== true; };",
      to: "  const OWN_UNK = function (d) { return d.state === 'unknown'; };",
      probe: function (WA) {
        SOURCES(WA);
        WA.depCheck.setSettings({ enabled: true });
        const r = WA.depCheck.check(BP());
        return [r.verdict, r.envLimited.length];
      },
      want: ['degraded', 1] },
    { n: 3, why: 'N3: 总判对「验不了」放行 ⇒ 拿「大概能装」冒充「验过了」',
      from: "    if (fmt && fmt.state === 'unknown') return 'unknown';",
      to: "    if (false && fmt && fmt.state === 'unknown') return 'unknown';",
      probe: function (WA) {
        SOURCES(WA);
        WA.depCheck.setSettings({ enabled: true });
        const r = WA.depCheck.check({ packVer: 1, seed: { ver: 1, sig: 'deadbeef', powers: [],
          network: { nodes: [], edges: [] }, geo: { places: ['p'], roads: 1 }, era: {} } });
        return r.verdict;
      },
      want: 'unknown' },
    { n: 4, why: 'N4: 必需依赖的不一致被降级成可选 ⇒ 「缺机制开关」读成「没事」',
      from: "        state: off.length ? 'absent' : 'present',\n        why: off.length ? ('mismatch:' + off.join('+')) : 'matched',",
      to: "        state: off.length ? 'absent' : 'present', required: false,\n        why: off.length ? ('mismatch:' + off.join('+')) : 'matched',",
      probe: function (WA) {
        SOURCES(WA);
        WA.depCheck.setSettings({ enabled: true });
        const r = WA.depCheck.check(BP({ mech: { worldSeed: { enabled: true } } }));
        return r.verdict;
      },
      want: 'blocked' },
    { n: 5, why: 'N5: 有损种子的损失面被软化 ⇒ 「不还原道路端点」这件事从报告里消失',
      from: "        rows.push({ field: 'geo.roads', level: 'seed', loss: '道路只记**数量**（本格式记 ' + (roads === null ? '?' : roads) + ' 条），端点不还原' });",
      to: "        rows.push({ field: 'geo.roads', level: 'seed', loss: null });",
      probe: function (WA) {
        SOURCES(WA);
        WA.depCheck.setSettings({ enabled: true });
        const s = WA.depCheck.check({ ver: 1, sig: 'deadbeef', powers: [], network: { nodes: [], edges: [] },
          geo: { places: ['p'], roads: 4 }, era: {} });
        return s.degrade.filter(function (x) { return /道路只记/.test(x.loss || ''); }).length;
      },
      want: 1 },
    { n: 6, why: 'N6: 迁移助手开始「顺手改原文件」⇒ 体检变成破坏性操作',
      from: "    const base = { kind: kind, srcSig: sig(JSON.stringify(payload)), srcUntouched: true,",
      to: "    const base = { kind: kind, srcSig: sig(JSON.stringify(payload)), srcUntouched: false,",
      probe: function (WA) {
        SOURCES(WA);
        WA.depCheck.setSettings({ enabled: true });
        const p = WA.depCheck.prepare(BP());
        return p.srcUntouched;
      },
      want: true },
    { n: 7, why: 'N7: 蓝图被当成聊天存档 ⇒ 用户会拿它当「这一局的存档」用',
      from: "      isChatArchive: false,",
      to: "      isChatArchive: true,",
      probe: function (WA) {
        SOURCES(WA);
        WA.depCheck.setSettings({ enabled: true });
        return WA.depCheck.check(BP()).archive.isChatArchive;
      },
      want: false },
    { n: 8, why: 'N8: 版本真源读不到时说「相符」⇒ 版面对不上也报健康（体检本身失效）',
      from: "      if (!B || num(B.BP_VER) === null) return { state: 'unknown', why: 'version-source-absent', source: 'worldBlueprint.BP_VER' };",
      to: "      if (!B || num(B.BP_VER) === null) return { state: 'ok', why: 'version-source-absent', source: 'worldBlueprint.BP_VER' };",
      probe: function (WA) {
        noSource(WA);
        WA.depCheck.setSettings({ enabled: true });
        return WA.depCheck.check(BP()).format.state;
      },
      want: 'unknown' }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'e8/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'e8/Na(' + cs.n + '): 破坏真的改动了源码文本');
    // 两向自证：先证明「同款判据」在原版上给出 want（判据本身是真的）
    const okHost = hostWith(SRC, SOURCES);
    okHost.depCheck.setSettings({ enabled: true });
    const orig = cs.probe(okHost);
    const same = function (x, y) { return JSON.stringify(x) === JSON.stringify(y); };
    a(same(orig, cs.want), 'e8/Nb(' + cs.n + '): 原版上同款判据为真（实 ' + JSON.stringify(orig) + '）');
    // 再在**破坏副本**上重跑同款判据：必须现形
    const badHost = hostWith(broken, SOURCES);
    badHost.depCheck.setSettings({ enabled: true });
    const got = cs.probe(badHost);
    a(!same(got, cs.want), 'e8/Nc(' + cs.n + '): 破坏副本上同款判据现形（实 ' + JSON.stringify(got) + '）');
    // H5 判据纯度：判据层内锚点字面量只准声明一次；判据不得引用锚点串
    a(String(cs.probe).indexOf(cs.to.slice(0, 24)) < 0, 'e8/Nd(' + cs.n + '): 判据不引用破坏后的锚点串（H5 纯度）');
  });
  // 原版零破坏时全部读口都能跑（反空转：判据不许在空集上恒真）
  const host = hostWith(SRC, SOURCES);
  host.depCheck.setSettings({ enabled: true });
  a(host.depCheck.catalog().kinds.length === 4 && host.depCheck.check(BP()).deps.length >= 4,
    'e8/N9: 反空转 —— 未破坏时读口真出内容（不是空集上恒真）');
}

// ── 汇总 ───────────────────────────────────────────────────────────────
const __a = function (cond, name) { a(cond, name); };
runA(__a); runB(__a); runC(__a); runN(__a);
console.log('\nE8 s3-b3-e8-v2187 ' + pass + ' / 失败 ' + fail);
if (fail) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }