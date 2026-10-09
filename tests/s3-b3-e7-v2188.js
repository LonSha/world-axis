'use strict';
// WorldAxis tests/s3-b3-e7-v2188.js (v2.188.0) — E7 玩家自定义规则包与白名单自动化模板专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许把两种不同的处境写成同一个形状」）：
//   ① **默认关**：`enabled:false` 时 save / apply / drop / importPack / exportPack / template.set /
//      template.run **全部**拒收 `disabled` —— 不是「静默成功」；
//   ② **模板不得绕过各模块的拒收与容量规则**：模板动作只调**既有公开读口**，写口的拒收
//      **原样带回**（不回滚、不吞掉、不折成「成功但没生效」）；预算跑满即停并如实报
//      `budget-exhausted`；
//   ③ **不得引入可执行脚本**：全文零 `eval` / `new Function` / `require(` / `import(`；
//      动作是**封闭词表**里的枚举（五口），参数经 `inputGuard` 收口；
//   ④ **只记录设置与启用面，不改世界状态**：零 `store.transact`、零 `draft.` 赋值、
//      零世界键写入（跑遍全部对外口后 store 零写，本锁逐条实测）；
//   ⑤ **`settingsBus` 仍是唯一写路径**：本模块零 `localStorage` 写；`apply` 走
//      `settingsBus.saveOrThrow`，逐键结果如实回带（部分成功就是部分成功）；
//   ⑥ **非法模板拒收且不改设置**：形状不对 / 动作不在词表 / `every` 越界 / `budget` 越界 /
//      `failPolicy` 不在集合 —— 一律在**写盘之前**拒收，且**整批**拒收（半套落地会让
//      「哪几条生效了」只能靠读列表猜）；
//   ⑦ **关闭后零写入**（= ①的另一种读法：拒收之后设置面必须逐字未变）。
//
// 探针实测（本版写锁前先跑，写锁不是凭空写判据）抓到并修掉的四处**从出生起就是死的**面：
//   · `surface()` 的 `themes: (X ? null : null)` 恒 null（两侧同值的三元）⇒ 启用面读数永远空；
//   · 动作词表三口指向**不存在的读口**（`pendingCenter.view` / `worldHealth.view` /
//     `perfBaseline.snapshot`）⇒ 该三条模板每次都回 `engine-absent`；
//   · `readKey()` 收到的是 `{key,module}` 记录而不是键名字符串 ⇒ **每一个键都读成
//     key-not-registered**，于是「当前规则面」永远为空、`save()` 永远 `empty-surface`；
//   · 诊断面只报「一串动作名」而不报「那五个名字在现场存不存在」⇒ 名字写错了与引擎缺席同形。
// 这四处都是同一家族：**形态上不报错，读数是空的**。故本锁的 A 段逐条把它们钉住。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const synthHost = require('./synth-host.js');
const REL = 'engines/rule-pack.js';
const KEYS = ['getSettings', 'setSettings', 'catalog', 'save', 'apply', 'drop', 'list', 'get',
  'current', 'exportPack', 'importPack', 'template', 'diagnose', 'stat'];
const FORMAT = 1;
// 仓规「无消费方不挂导出」：这几口在产品代码里零消费方 ⇒ **不许**出现在导出面上。
const MUST_BE_ABSENT = ['ACTION_TARGETS', 'MODULE_OF', 'FAIL_POLICIES', 'readKey', 'surface', 'resetStat'];
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.rulePack = {');
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
/**
 * 合成宿主：真 settingsBus + 真 inputGuard + **真 store**（与 E8 同规格）。
 *   `surface()` **只**从 `WA.__settingsRegs` 现场筛键 —— 合成宿主里没有别的模块，
 *   故这里按真登记项的同样形状补三条（theme / rules / 一个白名单外的模块）。
 *   第三条正是「运维类键不许进包」那条边界的现场证据。
 */
function hostWith(src, extra, opts) {
  const o = opts || {};
  const c = synthHost.negativeContext({});
  const __ls = fakeLS();
  c.window.localStorage = __ls;
  vm.runInContext(readOf('core/settings-bus.js'), c, { filename: 'core/settings-bus.js' });
  vm.runInContext(readOf('core/store.js'), c, { filename: 'core/store.js' });
  vm.runInContext(readOf('core/input-guard.js'), c, { filename: 'core/input-guard.js' });
  vm.runInContext(src, c, { filename: REL });
  const WA = c.window.WorldAxis;
  try { WA.store.init(); } catch (e) { /* 已初始化 */ }
  // `o.regs === false` ⇒ **不加**任何可进包的登记项。
  //   为什么需要这一档：settingsBus.read 在磁盘无值时会**回落到 reg.def**，于是「有登记项」
  //   就等于「读得到值」——想测「规则面是空的」那条路径，就必须真的没有登记项。
  if (o.regs !== false) {
    WA.__settingsRegs = (WA.__settingsRegs || []).concat([
      { key: 'worldaxis_theme_settings_v1', def: { themes: [] }, module: 'theme' },
      { key: 'worldaxis_rules_settings_v1', def: { strict: false }, module: 'rules' },
      { key: 'worldaxis_orphan_settings_v1', def: { x: 1 }, module: 'notInWhitelist' }
    ]);
  }
  if (extra) extra(WA);
  // 把宿主窗口挂到 `WA.mainWin` 上：`settingsBus` 读的是 `(WA.mainWin || window).localStorage`。
  //   显式挂上之后「测试里包了一层计数的那个 localStorage」与「模块真正用的那个」**同一个对象** ——
  //   否则计数包的是 `window.localStorage`，而模块走 `WA.mainWin` 那条路，写入会从计数里漏出去
  //   （判据会变成「恒 0 次」的假绿）。
  WA.mainWin = c.window;
  WA.mainDoc = c.window.document;
  return WA;
}
/**
 * 只留主题那一条登记项并把它真写进去。
 *   为什么需要：登记项一多，「可读键数」就跟着变（每个 key 都会回落到自己的 def）——
 *   而「readKey 收不收记录」这条判据要的读数**恰好**是 1（不写死 2/3 这类会随夹具漂移的数）。
 */
function onlyTheme(WA, themes) {
  ENGINES(WA);
  WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) { return r.key === 'worldaxis_theme_settings_v1'; });
  const reg = WA.__settingsRegs[0];
  if (reg) WA.settingsBus.saveOrThrow(reg, WA.settingsBus.normalize(reg, { themes: themes || ['x'] }));
}
/**
 * 「不许写别人的键」的判据：赋值而不是比较。
 *   ⚠ 本锁第一版用 `X.y\s*=` 判，把 `WA.rules.getRuleCount === 'function'` 里的 `===`
 *     读成了赋值 —— 于是**每一个**只读依赖都被判成「写了它的键」（九条全红）。
 *     口径必须与语法同宽：`=` 前不是 `=!<>`、后不是 `=`，才算一次赋值。
 */
function assigns(src, ns) {
  const re = new RegExp('(^|[^=!<>])\\b(?:d|draft|WA)\\.' + ns + '\\.[A-Za-z_$][\\w$]*\\s*=(?!=)', 'm');
  return re.test(src);
}
/**
 * 三方引擎桩：**只桩读口**（名字逐字对齐真引擎的公开读口）。
 *   本函数的价值正在于：`ACTION_TARGETS` 那五个名字**必须**在这里命得中，
 *   否则就是「词表指向不存在的读口」（本版修掉的那一处）。
 */
function ENGINES(WA) {
  WA.theme = { activeModules: function () { return ['sus']; }, list: function () { return []; },
    getSettings: function () { return { themes: ['sus'] }; } };
  WA.rules = { getRuleCount: function () { return 16; } };
  WA.recipe = { getSettings: function () { return { name: '' }; } };
  WA.preset = { getAllPresets: function () { return []; } };
  WA.rehearsal = { preview: function () { return { ok: true, id: 'pv_1' }; } };
  WA.pendingCenter = { items: function () { return { ok: true, items: [] }; } };
  WA.worldHealth = { summary: function () { return { ok: true, score: 88 }; } };
  WA.perfBaseline = { bands: function () { return { ok: true, bands: [] }; } };
  WA.atlas = { view: function () { return { ok: true, places: [] }; } };
}
/** 五口**全部缺席**（用来证明「引擎缺席时那一条模板拒收 engine-absent」）。 */
function noEngines(WA) {
  ['rehearsal', 'pendingCenter', 'worldHealth', 'perfBaseline', 'atlas', 'theme', 'rules', 'recipe', 'preset']
    .forEach(function (k) { WA[k] = undefined; });
}
/** 把主题键真写进去（经 settingsBus）—— 「规则面读得到」那条判据的前置现场。 */
function seedTheme(WA, themes) {
  const reg = WA.__settingsRegs.filter(function (r) { return r.key === 'worldaxis_theme_settings_v1'; })[0];
  return WA.settingsBus.saveOrThrow(reg, WA.settingsBus.normalize(reg, { themes: themes || ['x'] }));
}

let pass = 0, fail = 0;
const failures = [];
function a(cond, name) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; failures.push(name); console.log('  ✗ ' + name); } }
// ── A 段：静态契约 ─────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'e7/A1: 能从真源码取出 WA.rulePack 的对象字面量体');
  KEYS.forEach(function (k) {
    a(body.indexOf(k + ':') > 0 || body.indexOf(k + ': ') > 0, 'e7/A2: 导出面含 ' + k);
  });
  a(body.indexOf('template:') > 0, 'e7/A2b: template 组挂上导出面');
  ['ids', 'list', 'set', 'run', 'tick', 'dueAt', 'reset'].forEach(function (k) {
    a(new RegExp('\\b' + k + ':').test(body), 'e7/A2c: template 组含 ' + k);
  });
  MUST_BE_ABSENT.forEach(function (k) {
    a(new RegExp('\\b' + k + ':').test(body) === false, 'e7/A3: 导出面**没有** ' + k + '（零消费方不挂导出）');
  });
  a(/const DEF = \{ enabled: false, packs: \[\], active: '', maxPacks: 24, maxKeys: 40, seq: 0 \}/.test(src),
    'e7/A4: 默认关 + 包清单/活跃包/两项容量/序号声明逐字在位');
  a(/bounds: \{ maxPacks: \[1, 64\], maxKeys: \[4, 96\] \}/.test(src), 'e7/A5: 两项容量区间声明逐字在位');
  a(/LS_KEY = 'worldaxis_rule_pack_settings_v1'/.test(src), 'e7/A6: 设置键是单一真源');
  a(/module: 'rulePack'/.test(src), 'e7/A7: 设置登记 module 为 rulePack');
  // 边界③ 不得引入可执行脚本（先剥注释与字符串字面量再查：注释里正是在讲这条边界）
  const codeLines = src.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); });
  const codeOnly = codeLines.join('\n');
  const codeNoStr = codeOnly.replace(/'[^'\n]*'/g, "''").replace(/"[^"\n]*"/g, '""');
  a(codeNoStr.indexOf('eval(') < 0, 'e7/A8: 真代码里零 eval（不得引入可执行脚本）');
  a(codeNoStr.indexOf('new Function') < 0, 'e7/A9: 真代码里零 new Function');
  a(codeNoStr.indexOf('require(') < 0 && codeNoStr.indexOf('import(') < 0,
    'e7/A10: 真代码里零 require / import（零依赖仓库）');
  // 边界④ 只记录设置与启用面，不改世界状态
  //   口径必须与判据同宽：本文件**注释里**正是在讲「本模块零 store.transact」，
  //   裸 indexOf 会把那条说明当成「真调了」——故只在**剥掉注释与字符串**之后的代码面上查。
  a(codeNoStr.indexOf('transact') < 0,
    'e7/A11: **零 store 写** —— 真代码里没有 transact（注释里的说明不算）');
  a(codeNoStr.indexOf('draft') < 0, 'e7/A12: 真代码里零 draft（规则包不碰世界）');
  a(src.indexOf('WA.store.get') < 0, 'e7/A13: 连 store 读面都不碰（它读的是设置族）');
  // 边界⑤ settingsBus 唯一写路径
  a(src.indexOf('localStorage.setItem') < 0 && src.indexOf('setItem(') < 0,
    'e7/A14: 零 localStorage 写（设置走 settingsBus）');
  a(/WA\.settingsBus\.saveOrThrow\(rec, WA\.settingsBus\.normalize\(rec, vals\[k\]\)\)/.test(src),
    'e7/A15: apply 逐键经 settingsBus.saveOrThrow（唯一写路径，逐字可见）');
  a(/partial: failed\.length > 0 \|\| skipped\.length > 0 \|\| unreadable\.length > 0/.test(src),
    'e7/A16: partial 含三项（写失败 / 未登记 / 存包时读不到）—— 不谎报「切干净了」');
  a(/unreadable: unreadable/.test(src), 'e7/A16b: 切换回带 unreadable（那几键不在包内，不被这次切换覆盖）');
  // 边界② 模板是封闭词表 + 只调既有读口 + 拒收原样带回
  a(/const ACTIONS = \{/.test(src), 'e7/A17: 动作词表是封闭对象字面量');
  a(/const ACTION_TARGETS = \{/.test(src), 'e7/A17b: ACTION_TARGETS 表在位（词表→真读口的可复算形态）');
  const targetsM = (src.match(/const ACTION_TARGETS = \{([\s\S]*?)\};/) || [])[1] || '';
  const pairs = (targetsM.match(/'([\w.]+)':\s*'([\w.]+)'/g) || []).map(function (x) {
    const m = x.match(/'([\w.]+)':\s*'([\w.]+)'/);
    return { action: m[1], target: m[2] };
  });
  a(pairs.length === 5, 'e7/A18: 词表恰五口（实 ' + pairs.length + '）');
  pairs.forEach(function (p) {
    const mem = p.target.split('.')[1];
    const re = new RegExp('\\.' + mem + "\\s*\\(|\\b" + mem + "\\s*===?\\s*'function'");
    a(re.test(src), 'e7/A19: 词表 ' + p.action + ' 指向的 ' + p.target + ' 在正文里真被读（不是只写进表里）');
  });
  // 本版修掉的三处**不存在的读口**：这三个名字**在真代码里**不许再出现。
  //   ⚠ 判据只查代码面（codeNoStr）：模块头与表头的注释里正是在逐字说明这三个名字**曾写错过** ——
  //     那是这条边界的证据本身，把注释也一起判红就等于「把证据删掉才算修好」。
  ['pendingCenter.view', 'worldHealth.view', 'perfBaseline.snapshot'].forEach(function (t) {
    a(codeNoStr.indexOf(t) < 0, 'e7/A20: 已修掉的空读口 ' + t + ' 在真代码里不再出现');
  });
  a(/const FAIL_POLICIES = \['stop', 'skip'\]/.test(src), 'e7/A21: 失败策略封闭集逐字在位');
  a(/reason: 'unknown-action'/.test(src) && /reason: 'bad-every'/.test(src)
    && /reason: 'bad-budget'/.test(src) && /reason: 'bad-fail-policy'/.test(src),
    'e7/A22: 四条模板拒收码逐字在位（动作 / every / budget / failPolicy）');
  a(/if \(rejected\.length\) \{ fault\(rejected\[0\]\.reason\)/.test(src),
    'e7/A23: **先全判再改** —— 有任何一条非法就整批拒收（半套落地会让人只能靠读列表猜）');
  a(/reason: 'budget-exhausted'/.test(src), 'e7/A24: 预算跑满如实报 budget-exhausted（不是静默跳过）');
  a(/templateRefused\+\+/.test(src) && /refused\+\+; t\.refused\+\+/.test(src),
    'e7/A25: 模板被拒进**两处**台账（本模块合计 + 该条模板自己）');
  a(/stoppedAt: stopped/.test(src), 'e7/A26: failPolicy=stop 时如实报停在哪一条');
  a(/不注册任何定时器/.test(src), 'e7/A27: 逐字写明「不注册任何定时器」（触发时机交给调用方）');
  // 边界⑥⑦ 拒收先于写盘 / 关闭后零写入
  ['disabled', 'missing-name', 'empty-surface', 'not-found', 'bad-json', 'bad-shape',
    'bad-format', 'too-new', 'missing-fields', 'no-usable-keys', 'save-threw', 'no-templates'].forEach(function (c) {
    a(src.indexOf("'" + c + "'") >= 0, 'e7/A28: 拒收码 ' + c + ' 在位（每个码都要有现场）');
  });
  a(/reason: 'empty-surface'/.test(src), 'e7/A29: 空规则面拒收 empty-surface（不存一个空包进去）');
  a(/unknownKeys: unknownKeys\.slice\(0, 12\)/.test(src),
    'e7/A30: 导入的未知键**如实列出**、不进包（不是静默丢弃）');
  a(/srcSig: \(typeof b\.sig === 'string' \? b\.sig : ''\)/.test(src),
    'e7/A31: 导入体保留源指纹（调用方可以核对来源）');
  a(/ver > FORMAT/.test(src) && /reason: 'too-new'/.test(src),
    'e7/A32: 更高格式一律不接（理解不了的字段写进去就是静默损坏）');
  // 本版修掉的死代码：两侧同值的三元（注释里逐字解释了它，故同样只查代码面）
  a(codeNoStr.indexOf('? null : null') < 0,
    'e7/A33: 真代码里无 `X ? null : null` 这类两侧同值的死三元（本版修掉的那一处）');
  a(/themes: themeKeys\(\)/.test(src), 'e7/A33b: surface 的启用面走 themeKeys() 真读（不是恒 null）');
  a(/themeModules: \(function \(\) \{/.test(src) && /rulesCount: \(WA\.rules/.test(src),
    'e7/A33c: themeModules / rulesCount 两栏真取用（取不到时给 null，不给一个空）');
  a(/const kk = \(key && typeof key === 'object'\) \? key\.key : key;/.test(src),
    'e7/A34: readKey 同时收字符串与记录（本版修掉的「每个键都读成未登记」）');
  a(/keys: keys\.map\(function \(k\) \{ return k\.key; \}\)/.test(src),
    'e7/A34b: surface 回带的键名是**字符串数组**（不是记录数组）');
  // 诊断面必须有「词表逐口现场核对」这一栏
  a(/actionTargets: actionRows/.test(src) && /actionsResolved: actionRows\.filter/.test(src),
    'e7/A35: 诊断面有 actionTargets 逐口核对 + actionsResolved 计数（「名字写错了」与「引擎缺席」必须分得开）');
  a(/target: ACTION_TARGETS\[k\] \|\| ''/.test(src), 'e7/A35b: catalog 的 actions 逐口带 target');
  a(/readOnly: /.test(src) && /noWorldWrite: /.test(src),
    'e7/A36: 口径里逐字写明「五口全是只读读口」与「零 store.transact」');
  a(/typeof face\[mem\] === 'function'/.test(src),
    'e7/A36b: 逐口核对的判据是「现场那个成员是不是函数」（不是名字字符串比对）');
  // ── 接线面（LOAD / MODULE_EXPORTS / 诊断节 / UI_BINDINGS / 面板消费方）──
  a(readOf('index.js').indexOf("'engines/rule-pack.js'") >= 0, 'e7/A37: index.js LOAD_ORDER 装载');
  a(readOf('tests/run.js').indexOf("'engines/rule-pack.js'") >= 0, 'e7/A38: tests/run.js LOAD 装载');
  {
    const idx = readOf('index.js');
    const pos = idx.indexOf("'engines/rule-pack.js'");
    // 它读的是**全仓设置登记表**（`__settingsRegs`）与 theme / rules / recipe / preset —— 都必须先装载。
    ['core/settings-bus.js', 'engines/theme.js', 'engines/rules.js', 'engines/recipe.js',
      'engines/preset.js', 'engines/rehearsal.js'].forEach(function (f) {
      const p = idx.indexOf("'" + f + "'");
      a(p >= 0 && p < pos, 'e7/A39: ' + f + ' 排在 rule-pack 之前（装载顺序是它的读面前提）');
    });
  }
  {
    const diag = readOf('engines/tool-diag.js');
    a(diag.indexOf("'engines/rule-pack.js': 'rulePack'") >= 0, 'e7/A40: tool-diag MODULE_EXPORTS 登记');
    a(diag.indexOf('function secRulePack()') >= 0, 'e7/A41: tool-diag secRulePack() 存在');
    a(diag.indexOf('rulePack: secRulePack()') >= 0, 'e7/A42: tool-diag 诊断对象成员在位');
    a(diag.indexOf('depCheck: secDepCheck()') >= 0, 'e7/A42b: 上一版的 depCheck 成员未被挤掉（新增不许删旧）');
    a(diag.indexOf("page: 'tools', ids: ['wa-rp-enabled'") >= 0, 'e7/A43: UI_BINDINGS 登记在**工具页**（与渲染处同页）');
    a(diag.indexOf("dynamic: ['wa-rp-out']") >= 0, 'e7/A43b: 动态读数出口一并登记');
  }
  {
    const pan = readOf('ui/panel.js');
    ['WA.rulePack.save', 'WA.rulePack.list', 'WA.rulePack.apply', 'WA.rulePack.drop', 'WA.rulePack.exportPack',
      'WA.rulePack.importPack', 'WA.rulePack.template', 'WA.rulePack.catalog', 'WA.rulePack.diagnose',
      'WA.rulePack.getSettings', 'WA.rulePack.setSettings', 'WA.rulePack.stat',
      'WA.rulePack.get', 'WA.rulePack.current'].forEach(function (t) {
      a(pan.indexOf(t) >= 0, 'e7/A44: 面板上有 ' + t + ' 的真消费方（不是 test-only 挂着）');
    });
    ['wa-rp-enabled', 'wa-rp-name', 'wa-rp-save', 'wa-rp-list', 'wa-rp-apply', 'wa-rp-drop',
      'wa-rp-export', 'wa-rp-import', 'wa-rp-tpl', 'wa-rp-tpl-list', 'wa-rp-tpl-run',
      'wa-rp-catalog', 'wa-rp-diag', 'wa-rp-out'].forEach(function (id) {
      a(pan.indexOf(id) >= 0, 'e7/A45: 面板渲染 ' + id);
    });
    a(pan.indexOf('<div class="wa-sec">规则包与自动化模板</div>') >= 0,
      'e7/A46: 分区标题是纯文本形态且含模块身份词');
    ['wa-rp-save', 'wa-rp-list', 'wa-rp-apply', 'wa-rp-drop', 'wa-rp-export', 'wa-rp-import',
      'wa-rp-tpl-list', 'wa-rp-tpl-run', 'wa-rp-catalog', 'wa-rp-diag'].forEach(function (id) {
      a(pan.indexOf("on('#" + id + "'") >= 0, 'e7/A47: 事件绑定在位 ' + id);
    });
    a(pan.indexOf("$('#wa-rp-enabled')") >= 0, 'e7/A47b: 开关的 onchange 绑定在位');
    // 名字冲突：bindBody 里已有一个 `const rpOut`（v2.152.0 渲染观测段）——本模块必须另起名字
    a(pan.indexOf('const rpkOut = function') >= 0, 'e7/A48: 本模块的输出出口用 rpkOut（不与既有 rpOut 撞名）');
    a(pan.indexOf('const rpOut = function') < 0 || pan.indexOf('const rpkOut = function') > 0,
      'e7/A48b: 两个输出出口并存且名字可分（同 function 作用域内不许重名声明）');
  }
  {
    const mv = (readOf('index.js').match(/VERSION = '([0-9.]+)'/) || [])[1] || '';
    const cmp = function (x, y) {
      const A = String(x).split('.').map(Number), B = String(y).split('.').map(Number);
      for (let i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0); }
      return 0;
    };
    a(cmp(mv, '2.188.0') >= 0, 'e7/A49: 入口版本不低于本锁的交付基线（实 ' + mv + '）');
  }
}
// ── B 段：运行时行为 ───────────────────────────────────────────────────
function runB(a) {
  const src = srcOf();
  // ① 默认关：全部写口拒收 disabled（逐口点名）
  const H = hostWith(src, ENGINES);
  a(!!H.rulePack && typeof H.rulePack === 'object', 'e7/B1: 模块装载');
  a(KEYS.every(function (k) { return typeof H.rulePack[k] === 'function' || k === 'template'; }),
    'e7/B2: 全部导出可调用（template 是组）');
  a(H.rulePack.getSettings().enabled === false, 'e7/B3: 默认关（enabled:false）');
  ['save', 'apply', 'drop', 'exportPack'].forEach(function (k) {
    a(H.rulePack[k]('x').reason === 'disabled', 'e7/B4: 关闭时 ' + k + ' 拒收 disabled');
  });
  a(H.rulePack.importPack('{}').reason === 'disabled', 'e7/B4b: 关闭时 importPack 拒收 disabled');
  a(H.rulePack.template.set([]).reason === 'disabled', 'e7/B4c: 关闭时 template.set 拒收 disabled');
  a(H.rulePack.template.run({}).reason === 'disabled', 'e7/B4d: 关闭时 template.run 拒收 disabled');
  // ⑦ 关闭后零写入：拒收之后设置面逐字未变
  {
    const before = JSON.stringify(H.rulePack.getSettings());
    H.rulePack.save('x'); H.rulePack.importPack('{"rulePack":1,"values":{}}');
    H.rulePack.template.set([{ id: 't', action: 'atlas.view', every: 1, budget: 1 }]);
    a(JSON.stringify(H.rulePack.getSettings()) === before, 'e7/B5: 关闭状态下跑遍写口后设置面**逐字未变**');
  }
  H.rulePack.setSettings({ enabled: true });
  // ② 封闭集口径（catalog 念的就是这一份）
  const c = H.rulePack.catalog();
  a(c.actions.length === 5 && c.modules.length === 8 && c.failPolicies.length === 2,
    'e7/B6: catalog 三张封闭集（五口动作 / 八个模块 / 两种失败策略）');
  a(c.actions.every(function (x) { return typeof x.target === 'string' && x.target.indexOf('.') > 0; }),
    'e7/B7: 五口逐口带「真读口路径」');
  a(c.format === FORMAT && c.module === 'rulePack', 'e7/B8: 格式版本与模块名在口径里');
  a(c.bounds.maxPacks === 24 && c.bounds.maxKeys === 40, 'e7/B9: 口径里的容量与默认值同源');
  // ③ 空面拒收（**真·空面**：宿主里一条可进包的登记项都不给）
  //   为什么必须另起一档：`settingsBus.read` 在磁盘无值时会**回落到 `reg.def`** ——
  //   只要登记项在，`present` 就是 true。拿「有登记项」的宿主测这条路只会得到
  //   「压根走不到 empty-surface」的假绿（本锁第一版就踩了：读数是 undefined）。
  {
    const H0 = hostWith(src, ENGINES, { regs: false });
    H0.rulePack.setSettings({ enabled: true });
    a(H0.rulePack.save('空包').reason === 'empty-surface',
      'e7/B10: 真·空规则面 ⇒ 如实拒收 empty-surface（不存一个空包）');
    a(H0.rulePack.current({}).packable === 0, 'e7/B10b: 空面的可读键数确实是 0（判据与口径同宽）');
  }
  // ④ 真写入一个设置键之后，规则面**真读得到**（本版修掉的「每个键都读成未登记」的活证据）
  {
    const w = seedTheme(H, ['悬疑']);
    a(w && w.ok === true, 'e7/B11: 经 settingsBus 真写一个主题键（成功）');
    const cur = H.rulePack.current({});
    a(cur.packable >= 1, 'e7/B12: 写入后「当前规则面」**真读得到**（可读 ' + cur.packable + ' 键）');
    a(cur.themes && cur.themes.ok === true && cur.themes.themes.join() === '悬疑',
      'e7/B13: 启用面读到真题材（不是恒 null —— 本版修掉的死代码）');
    a(cur.rulesCount === 16, 'e7/B14: 规则条数取自 rules.getRuleCount（不自带副本）');
    a(cur.themeModules && cur.themeModules.length === 1, 'e7/B15: 题材模块取自 theme.activeModules');
    a(cur.keys.every(function (k) { return typeof k === 'string'; }),
      'e7/B15b: current 回带的键名是字符串（不是记录对象 —— 本版修掉的那一处）');
    const s = H.rulePack.save('甲包');
    a(s.ok === true && s.keys >= 1 && typeof s.sig === 'string' && s.sig.length === 8,
      'e7/B16: 存包成功且带 8 位指纹');
    a(s.replaced === false, 'e7/B17: 首次存包不是覆盖');
    const s2 = H.rulePack.save('甲包');
    a(s2.ok === true && s2.replaced === true, 'e7/B18: 同名再存 ⇒ **明确报 replaced**（不静默顶掉旧包）');
    a(s2.sig === s.sig, 'e7/B19: 两次指纹相同（指纹真由内容算出，不是时间戳）');
    const l = H.rulePack.list();
    a(l.packs.length === 1 && l.packs[0].keys === s.keys, 'e7/B20: 清单只有一包（覆盖不是追加）');
    const g = H.rulePack.get('甲包');
    a(g.ok === true && g.keys.length === s.keys && g.format === FORMAT, 'e7/B21: get 回带逐键与格式版本');
    // ⑤ 切换：真把设置面切回去（改掉再切回）
    seedTheme(H, ['别的']);
    a(H.rulePack.current({}).themes.themes.join() === '别的', 'e7/B22: 先把设置面改掉（对照组）');
    const ap = H.rulePack.apply('甲包');
    a(ap.ok === true && ap.applied.length >= 1 && ap.failed.length === 0,
      'e7/B23: 切换成功且逐键回带（实写回 ' + ap.applied.length + ' 键）');
    a(H.rulePack.current({}).themes.themes.join() === '悬疑', 'e7/B24: 切换**真把设置面切回去了**（端到端）');
    a(ap.marker === true, 'e7/B25: 活跃包标记经同一写路径落盘');
    a(H.rulePack.list().active === '甲包', 'e7/B26: 清单里的活跃包真被标上');
    a(typeof ap.note === 'string' && ap.note.indexOf('settingsBus') > 0,
      'e7/B27: 切换回执里逐字写明「写路径唯一」');
    a(H.rulePack.apply('没有这个包').reason === 'not-found', 'e7/B28: 切一个不存在的包 ⇒ not-found');
    // ⑥ 导入：格式 / 版本 / 键登记三道门
    a(H.rulePack.importPack('{oops').reason === 'bad-json', 'e7/B29: 坏 JSON ⇒ bad-json（不与引擎拒收混为一谈）');
    a(H.rulePack.importPack('[]').reason === 'bad-shape', 'e7/B30: 非对象 ⇒ bad-shape');
    a(H.rulePack.importPack(JSON.stringify({ name: 'x', values: {} })).reason === 'bad-format',
      'e7/B31: 缺 rulePack 字段 ⇒ bad-format');
    a(H.rulePack.importPack(JSON.stringify({ rulePack: 9, values: {} })).reason === 'too-new',
      'e7/B32: 更高格式 ⇒ too-new（不试图理解未来字段）');
    a(H.rulePack.importPack(JSON.stringify({ rulePack: 1 })).reason === 'missing-fields',
      'e7/B33: 缺 values ⇒ missing-fields');
    const imp = H.rulePack.importPack(JSON.stringify({ rulePack: 1, name: '乙包', sig: 'deadbeef',
      values: { worldaxis_theme_settings_v1: { themes: ['悬疑'] }, worldaxis_never_seen_v1: 1 } }));
    a(imp.ok === true && imp.keys === 1, 'e7/B34: 部分键可用的包能导入（可用 1 键）');
    a(imp.unknownKeys.length === 1 && imp.unknownKeys[0] === 'worldaxis_never_seen_v1',
      'e7/B35: 未知键**如实列出**且不进包（不是静默丢弃）');
    a(imp.srcSig === 'deadbeef', 'e7/B36: 导入体保留源指纹（可核对来源）');
    a(imp.sig !== imp.srcSig, 'e7/B37: 本侧重算的指纹与源指纹分列（两者本来就不是同一件事）');
    a(H.rulePack.importPack(JSON.stringify({ rulePack: 1, name: '丙包', values: { worldaxis_never_seen_v1: 1 } })).reason === 'no-usable-keys',
      'e7/B38: 一个键都不认识 ⇒ no-usable-keys（不写任何东西）');
    const ex = H.rulePack.exportPack('甲包');
    a(ex.ok === true && ex.pack.rulePack === FORMAT && typeof ex.text === 'string' && ex.bytes > 0,
      'e7/B39: 导出成带格式版本的可搬运 JSON');
    a(JSON.parse(ex.text).sig === ex.pack.sig, 'e7/B40: 导出体里的指纹与包内指纹同源');
    // 删包：剩余数按「删之前的条数 − 1」判（此处包里还留着上面导入进来的那份，不写死 0）
    const before = H.rulePack.list().packs.length;
    const dr = H.rulePack.drop('甲包');
    a(dr.ok === true && dr.remaining === before - 1,
      'e7/B41: 删包成功且回带剩余数（' + before + ' − 1 = ' + dr.remaining + '）');
    a(H.rulePack.drop('甲包').reason === 'not-found', 'e7/B42: 删一个不存在的包 ⇒ not-found');
    a(H.rulePack.list().active === '', 'e7/B43: 删掉活跃包后活跃标记被清空（不留一个指向幽灵包的标记）');
  }
  // ⑦ 模板：非法一律在写盘之前拒收，且整批拒收
  {
    const T = H.rulePack.template;
    a(Array.isArray(T.ids) && T.ids.length === 5, 'e7/B44: template.ids 是五口封闭集');
    const bad = T.set([{ id: 'ok', action: 'atlas.view', every: 1, budget: 1 },
      { id: 'bad', action: 'nope', every: 1, budget: 1 }]);
    a(bad.ok === false && bad.reason === 'unknown-action', 'e7/B45: 动作不在词表 ⇒ unknown-action');
    a(T.list().length === 0, 'e7/B46: **整批拒收** —— 合法的那一条也不落地（不留半套）');
    a(T.set([{ id: 'a', action: 'atlas.view', every: 0, budget: 1 }]).reason === 'bad-every',
      'e7/B47: every 越下界 ⇒ bad-every');
    a(T.set([{ id: 'a', action: 'atlas.view', every: 1, budget: 0 }]).reason === 'bad-budget',
      'e7/B48: budget 越下界 ⇒ bad-budget');
    a(T.set([{ id: 'a', action: 'atlas.view', every: 1, budget: 1, failPolicy: 'boom' }]).reason === 'bad-fail-policy',
      'e7/B49: 失败策略不在封闭集 ⇒ bad-fail-policy');
    a(T.set('nope').reason === 'bad-shape', 'e7/B50: 非数组 ⇒ bad-shape');
    a(T.list().length === 0, 'e7/B51: 上面五条拒收之后模板仍是空的（拒收不改设置）');
    a(T.set([{ id: 't1', action: 'pending.sweep', every: 2, budget: 2, failPolicy: 'skip' }]).ok === true,
      'e7/B52: 合法模板落地');
    a(T.list()[0].used === 0 && T.list()[0].refused === 0, 'e7/B53: 新模板的用量从零起算');
    const r1 = T.run({});
    a(r1.ok === true && r1.ran === 1 && r1.refused === 0, 'e7/B54: 第一次跑成（pendingCenter 在场）');
    const r2 = T.run({});
    a(r2.ran === 1, 'e7/B55: 第二次跑成（预算还剩）');
    const r3 = T.run({});
    a(r3.ran === 0 && r3.budgetSkipped === 1, 'e7/B56: 第三次预算跑满 ⇒ 该条**不被调用**并如实计数');
    a(r3.trace[0].reason === 'budget-exhausted', 'e7/B57: 逐条 trace 报 budget-exhausted（不是静默跳过）');
    a(T.dueAt(4).due.length === 0 && T.dueAt(2).due.length === 0, 'e7/B58: 预算跑满后 dueAt 不再点名该条（两件事同源）');
    a(T.dueAt('x').reason === 'bad-round', 'e7/B59: 非法轮次 ⇒ bad-round');
    T.set([{ id: 't2', action: 'atlas.view', every: 3, budget: 9 }]);
    a(T.dueAt(3).due.length === 1 && T.dueAt(4).due.length === 0,
      'e7/B60: every=3 时第 3 轮点名、第 4 轮不点名（纯计算不改状态）');
    a(T.reset().ok === true && T.list().length === 0, 'e7/B61: reset 清空内存态模板');
    // 引擎缺席 ⇒ 该条拒收 engine-absent（**不是**「静默成功」）
    const H2 = hostWith(src, ENGINES);
    H2.rulePack.setSettings({ enabled: true });
    noEngines(H2);
    H2.rulePack.template.set([{ id: 't3', action: 'worldHealth.check', every: 1, budget: 3, failPolicy: 'skip' }]);
    const rr = H2.rulePack.template.run({});
    a(rr.ran === 0 && rr.refused === 1, 'e7/B62: 读口缺席时该条**不跑成**（ran 0 / refused 1）');
    a(rr.trace[0].reason === 'engine-absent', 'e7/B63: 缺席归因是 engine-absent（如实，不折成成功）');
    a(H2.rulePack.template.set([]).ok === true && H2.rulePack.template.run({}).reason === 'no-templates',
      'e7/B64: 空模板表 ⇒ no-templates（不是「跑了 0 条 = 成功」）');
    H2.rulePack.template.set([{ id: 's1', action: 'worldHealth.check', every: 1, budget: 5, failPolicy: 'stop' },
      { id: 's2', action: 'worldHealth.check', every: 1, budget: 5, failPolicy: 'skip' }]);
    const st = H2.rulePack.template.run({});
    a(st.stoppedAt === 's1', 'e7/B65: failPolicy=stop ⇒ 停在第 s1 条并如实报出');
    a(st.trace.length === 1, 'e7/B66: 停住之后**不再**跑后面那条（trace 只有一条）');
  }
  // ④⑤ 只读自证：跑遍全部对外口后 store 零写、localStorage 写只落在自己的设置键
  {
    const H3 = hostWith(src, ENGINES);
    H3.rulePack.setSettings({ enabled: true });
    seedTheme(H3, ['x']);
    H3.rulePack.template.set([{ id: 'z', action: 'atlas.view', every: 1, budget: 2 }]);
    let writes = 0;
    const orig = H3.store.transact;
    H3.store.transact = function () { writes++; return orig.apply(this, arguments); };
    H3.rulePack.save('q1'); H3.rulePack.list(); H3.rulePack.get('q1'); H3.rulePack.current({});
    H3.rulePack.apply('q1'); H3.rulePack.exportPack('q1'); H3.rulePack.catalog();
    H3.rulePack.diagnose(); H3.rulePack.stat(); H3.rulePack.getSettings(); H3.rulePack.template.run({});
    H3.rulePack.template.dueAt(1); H3.rulePack.drop('q1');
    H3.store.transact = orig;
    a(writes === 0, 'e7/B67: 跑遍全部对外口后 store **零写**（实 ' + writes + '）');
    const ls = H3.mainWin.localStorage;
    const seen = [];
    const oSet = ls.setItem;
    ls.setItem = function (k, v) { seen.push(k); return oSet.apply(this, arguments); };
    H3.rulePack.save('q2'); H3.rulePack.apply('q2'); H3.rulePack.setSettings({ maxKeys: 40 });
    ls.setItem = oSet;
    a(seen.indexOf('worldaxis_rule_pack_settings_v1') >= 0, 'e7/B68: 反空转 —— 上面那次确实发生了写入');
    a(seen.every(function (k) { return /^worldaxis_(rule_pack|theme|rules)_settings_v1$/.test(k); }),
      'e7/B68b: localStorage 写**只**落在设置族（本模块自己的键 + apply 写回的包内键），'
      + '不写任何第三方键（实 ' + JSON.stringify(seen) + '）');
  }
  // 诊断面：词表逐口**现场核对**（本版补上的那一栏）
  {
    const H4 = hostWith(src, ENGINES);
    H4.rulePack.setSettings({ enabled: true });
    const d = H4.rulePack.diagnose();
    a(d.actionTargets.length === 5 && d.actionsResolved === 5,
      'e7/B69: 五口全部在现场核对为在位（' + d.actionsResolved + '/5）');
    a(d.actionTargets.every(function (x) { return x.present === true; }),
      'e7/B70: 逐口 present=true（词表里那五个名字现场真存在）');
    const H5 = hostWith(src, ENGINES);
    H5.rulePack.setSettings({ enabled: true });
    noEngines(H5);
    const d5 = H5.rulePack.diagnose();
    a(d5.actionsResolved === 0 && d5.actionTargets.every(function (x) { return x.present === false; }),
      'e7/B71: 读口全缺席时逐口 present=false（「名字写错了」与「引擎缺席」在这一栏分得开）');
    a(d.actionsResolved !== d5.actionsResolved, 'e7/B72: 两栏读数不同 ⇒ 这一栏真的在核对现场（不是恒真）');
    a(typeof d.packableCount === 'number' && Array.isArray(d.packable), 'e7/B73: 诊断面报「哪些键可进包」');
    a(d.deps && typeof d.deps.settingsBus === 'boolean', 'e7/B74: 诊断面逐项报依赖在不在');
    a(d.maxPacks === 24, 'e7/B75: 诊断面报容量（与设置同源）');
    a(H4.rulePack.stat().actions === 5, 'e7/B76: 台账报词表口数');
    // 造一次**真拒收**（空名字 ⇒ missing-name）再读台账：
    //   ⚠ 不能拿 `save('x')` 当「必然失败」用 —— 上面那几个宿主里登记项都在，
    //     每个键都会回落到自己的 def，于是 save 是**成功**的（本锁第一版在这里误判过）。
    H4.rulePack.save('');
    a(H4.rulePack.stat().refused >= 1, 'e7/B77: 拒收进故障分桶（可复算）');
    a(H4.rulePack.stat().faults['missing-name'] >= 1,
      'e7/B78: 分桶按**码**归因（不是只给一个总数）—— 上面那次拒收正是这个码');
  }
  // 常量与区间夹回
  {
    const H6 = hostWith(src, ENGINES);
    a(H6.rulePack.FORMAT === FORMAT, 'e7/B79: FORMAT 常量外露（E8 体检读它）');
    a(H6.rulePack.getSettings().maxPacks === 24 && H6.rulePack.getSettings().maxKeys === 40,
      'e7/B80: 归一后的容量与 DEF 同源');
    a(H6.rulePack.setSettings({ maxPacks: 999 }), 'e7/B81: setSettings 经 settingsBus 写入（回 {ok:true}）');
    a(H6.rulePack.getSettings().maxPacks === 64,
      'e7/B81b: 越界值被区间夹回 64（bounds 声明在起作用，实 ' + H6.rulePack.getSettings().maxPacks + '）');
    // 白名单外的模块键**不进包**（本版 C5 的运行时证据）
    seedTheme(H6, ['x']);
    const reg = H6.__settingsRegs.filter(function (r) { return r.key === 'worldaxis_orphan_settings_v1'; })[0];
    H6.settingsBus.saveOrThrow(reg, H6.settingsBus.normalize(reg, { x: 7 }));
    const keys = H6.rulePack.current({}).keys;
    a(keys.indexOf('worldaxis_theme_settings_v1') >= 0, 'e7/B82: 白名单内的键进了包');
    a(keys.indexOf('worldaxis_orphan_settings_v1') < 0,
      'e7/B82b: 白名单外的模块键**不进包**（运维类设置不许被顺手打进规则包）');
  }
}
// ── C 段：接线面 ───────────────────────────────────────────────────────
function runC(a) {
  const src = srcOf();
  a(src.indexOf('bounds: {') >= 0, 'e7/C1: 设置区间声明（settingsBus 越界夹回的前提）');
  a(src.indexOf('WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);') >= 0,
    'e7/C2: 设置键走 __settingsRegs 登记');
  a(src.indexOf('WA.registerModule') >= 0, 'e7/C3: 装载期自注册（模块图需要）');
  a(/module: 'rulePack'/.test(src), 'e7/C4: 设置登记的 module 与命名空间同名');
  a(/const MODULE_OF = \['theme', 'recipe', 'preset', 'rules', 'backstage', 'difficulty', 'storyChoice', 'rehearsal'\]/.test(src),
    'e7/C5: 可进包的模块是**封闭白名单**（运维类设置键不许被顺手打进规则包）');
  a(/rows\.filter\(function \(r\) \{ return r && typeof r\.key === 'string' && r\.key; \}\)/.test(src),
    'e7/C6: 可进包的键从 `__settingsRegs` **现场筛**（不写死键名清单 = 不造第二份真源）');
  a(/WA\.clock \? WA\.clock\.now/.test(src), 'e7/C7: 时间走决策时钟守卫（G20 时间源治理）');
  a(src.indexOf('WA.inputGuard.text') >= 0, 'e7/C8: 参数经 inputGuard 收口');
  ['theme', 'rules', 'recipe', 'preset', 'rehearsal', 'pendingCenter', 'worldHealth', 'perfBaseline', 'atlas']
    .forEach(function (ns) {
      a(!assigns(src, ns), 'e7/C9: 不写 ' + ns + ' 的任何键（只读它的公开读口）');
    });
  a(assigns('WA.rules.count = 1;', 'rules') === true && assigns('WA.rules.getRuleCount === 1', 'rules') === false,
    'e7/C9b: 赋值判据本身两向自证（真赋值判真、比较式判假 —— 本锁第一版正是在这里误红九条）');
  a(src.indexOf('removeItem(') < 0 && src.indexOf('localStorage.setItem') < 0,
    'e7/C10: 不直调删除/写盘口（唯一写路径是 saveSettings → settingsBus）');
  a(/const DEF = \{[\s\S]{0,120}enabled: false/.test(src), 'e7/C11: DEF 的第一项就是 enabled:false（默认关写在最显眼处）');
}

// ── N 段：真源码破坏 + 两向自证 ─────────────────────────────────────────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: 默认关被翻成开 ⇒ 「我没开它」与「它一直在写」两件事合一',
      from: "  const DEF = { enabled: false, packs: [], active: '', maxPacks: 24, maxKeys: 40, seq: 0 };",
      to: "  const DEF = { enabled: true, packs: [], active: '', maxPacks: 24, maxKeys: 40, seq: 0 };",
      // 判据取的是**入参那份源码**建的宿主（不是模块顶层的原版常量）——
      //   否则破坏副本永远进不来，这一条会退化成「对原文件断言」。
      probe: function (__src) { const WA = hostWith(__src, ENGINES); return WA.rulePack.getSettings().enabled; },
      want: false },
    { n: 2, why: 'N2: 关闭时让写口「静默成功」⇒ 关着它也在写（就是这么来的）',
      from: "    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }\n    const n = nameOf(name);\n    if (!n) { fault('missing-name'); return { ok: false, reason: 'missing-name' }; }\n    const snap = surface(cfg.maxKeys);",
      to: "    const n = nameOf(name);\n    if (!n) { fault('missing-name'); return { ok: false, reason: 'missing-name' }; }\n    const snap = surface(cfg.maxKeys);",
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        ENGINES(WA);
        WA.rulePack.setSettings({ enabled: false });
        return WA.rulePack.save('x').reason;
      },
      want: 'disabled' },
    { n: 3, why: 'N3: 模板动作绕过词表（任意动作名照收）⇒ 「不绕过各模块拒收」这条边界消失',
      from: "    if (ACTION_IDS.indexOf(action) < 0) {\n      return { ok: false, reason: 'unknown-action', id: id, action: action, known: ACTION_IDS.slice() };\n    }",
      to: "    if (false) {\n      return { ok: false, reason: 'unknown-action', id: id, action: action, known: ACTION_IDS.slice() };\n    }",
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        ENGINES(WA);
        WA.rulePack.setSettings({ enabled: true });
        return WA.rulePack.template.set([{ id: 'bad', action: '任意动作名', every: 1, budget: 1 }]).reason;
      },
      want: 'unknown-action' },
    { n: 4, why: 'N4: 预算不再生效（跑满还继续跑）⇒ 模板变成一条无限自动写路径',
      from: '      if (t.used >= t.budget) {\n        skippedBudget++;',
      to: '      if (false) {\n        skippedBudget++;',
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        ENGINES(WA);
        WA.rulePack.setSettings({ enabled: true });
        WA.rulePack.template.set([{ id: 't', action: 'atlas.view', every: 1, budget: 1 }]);
        WA.rulePack.template.run({});
        const r2 = WA.rulePack.template.run({});
        return [r2.ran, r2.budgetSkipped];
      },
      want: [0, 1] },
    { n: 5, why: 'N5: 逐条拒收被折成「成功但没生效」⇒ 读口的判决被本模块吃掉',
      from: '      const ok = !!(r && r.ok === true);',
      to: '      const ok = true;',
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        noEngines(WA);
        WA.rulePack.setSettings({ enabled: true });
        WA.rulePack.template.set([{ id: 't', action: 'worldHealth.check', every: 1, budget: 1, failPolicy: 'skip' }]);
        const r = WA.rulePack.template.run({});
        return [r.ran, r.refused];
      },
      want: [0, 1] },
    { n: 6, why: 'N6: 非法模板不再整批拒收 ⇒ 半套落地，「哪几条生效了」只能靠读列表猜',
      from: '    if (rejected.length) { fault(rejected[0].reason); return { ok: false, reason: rejected[0].reason, rejected: rejected }; }',
      to: '    if (false) { fault(rejected[0].reason); return { ok: false, reason: rejected[0].reason, rejected: rejected }; }',
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        ENGINES(WA);
        WA.rulePack.setSettings({ enabled: true });
        const r = WA.rulePack.template.set([{ id: 'ok', action: 'atlas.view', every: 1, budget: 1 },
          { id: 'bad', action: 'nope', every: 1, budget: 1 }]);
        return [r.ok, WA.rulePack.template.list().length];
      },
      want: [false, 0] },
    { n: 7, why: 'N7: 空的规则面也照存 ⇒ 存下一个「什么都没有」的包，切回去把设置清空',
      from: "    if (!snap.packable) { fault('empty-surface'); return { ok: false, reason: 'empty-surface' }; }",
      to: "    if (false) { fault('empty-surface'); return { ok: false, reason: 'empty-surface' }; }",
      // ⚠ 必须用**真·空面**宿主（`{regs:false}`）：有登记项时每个键都会回落到自己的 def，
      //   可读数恒 ≥1，这条路径根本走不到（本锁第一版就在这里拿到 undefined）。
      probe: function (__src) {
        // 这一条要的是**真·空面**宿主（一份登记项都不给）——同样必须建在**入参那份源码**上，
        //   否则破坏副本进不来（判据退化成对原文件断言）。
        const WA = hostWith(__src, ENGINES, { regs: false });
        WA.rulePack.setSettings({ enabled: true });
        const r = WA.rulePack.save('空包');
        return [r.ok, r.reason || ''];
      },
      want: [false, 'empty-surface'] },
    { n: 8, why: 'N8: 部分成功被谎报成「全成」⇒ 用户以为切干净了，实际还有键停在旧值上',
      from: '      partial: failed.length > 0 || skipped.length > 0 || unreadable.length > 0,',
      to: '      partial: false,',
      // 「未登记的键」那一支的现场：包里带一个本侧**没登记**的键 ⇒ skipped 非空 ⇒ partial 必须为真。
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        WA.rulePack.setSettings({ enabled: true });
        seedTheme(WA, ['x']);
        WA.rulePack.save('P');
        // 手写一份含未知键的包进设置族（importPack 会把未知键挡在门外，那正是它的设计），
        //   这条破坏针对的是 apply 的 partial 汇总，故现场要造在 packs 里。
        const cur = WA.rulePack.getSettings();
        const packs = cur.packs.map(function (p) {
          if (p.name !== 'P') return p;
          const q = JSON.parse(JSON.stringify(p));
          q.values['worldaxis_ghost_key_v1'] = 1;
          q.keys = (q.keys || []).concat(['worldaxis_ghost_key_v1']);
          return q;
        });
        WA.rulePack.setSettings({ packs: packs });
        return WA.rulePack.apply('P').partial;
      },
      want: true },
    { n: 9, why: 'N9: 更高格式也照读 ⇒ 理解不了的字段写进去就是静默损坏',
      from: "    if (ver > FORMAT) { fault('too-new'); return { ok: false, reason: 'too-new', got: ver, want: FORMAT,",
      to: "    if (false) { fault('too-new'); return { ok: false, reason: 'too-new', got: ver, want: FORMAT,",
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        ENGINES(WA);
        WA.rulePack.setSettings({ enabled: true });
        return WA.rulePack.importPack(JSON.stringify({ rulePack: 9, name: 'x',
          values: { worldaxis_theme_settings_v1: {} } })).reason;
      },
      want: 'too-new' },
    { n: 10, why: 'N10: readKey 只收字符串（本版修掉的那一处回归）⇒ 每个键都读成未登记，规则面永远为空',
      from: "    const kk = (key && typeof key === 'object') ? key.key : key;",
      to: "    const kk = key;",
      // 只留一条登记项（并把它真写进去）：可读数**恰好** 1，不带任何会随夹具漂移的常量。
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        WA.rulePack.setSettings({ enabled: true });
        onlyTheme(WA, ['x']);
        return WA.rulePack.current({}).packable;
      },
      want: 1 },
    { n: 11, why: 'N11: present 恒 false（把「读到了」折成「读不到」）⇒ 规则面全归 absent，存包永远空面',
      from: "      return { key: kk, present: v !== null && v !== undefined, module: String(rec.module || ''), value: (v === undefined ? null : v) };",
      to: "      return { key: kk, present: false, module: String(rec.module || ''), value: (v === undefined ? null : v) };",
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        WA.rulePack.setSettings({ enabled: true });
        onlyTheme(WA, ['x']);
        const r = WA.rulePack.save('x');    // 原版：可读 1 ⇒ 存成；破坏后：可读 0 ⇒ empty-surface
        return [r.ok, r.reason || ''];
      },
      want: [true, ''] },
    { n: 12, why: 'N12: 启用面读数回到恒 null（本版修掉的死代码回归）⇒ 「取不到」与「确实没有」又合一',
      from: '      themes: themeKeys(),',
      to: '      themes: null,',
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        ENGINES(WA);
        WA.rulePack.setSettings({ enabled: true });
        seedTheme(WA, ['悬疑']);
        const c = WA.rulePack.current({});
        return [c.themes === null, c.packable >= 1];
      },
      want: [false, true] },
    { n: 13, why: 'N13: 诊断面不再逐口现场核对 ⇒ 「名字写错了」与「引擎缺席」重新同形',
      from: '      actionTargets: actionRows,',
      to: '      actionTargets: [],',
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        ENGINES(WA);
        WA.rulePack.setSettings({ enabled: true });
        const d = WA.rulePack.diagnose();
        return [d.actionTargets.length, d.actionsResolved];
      },
      want: [5, 5] },
    { n: 14, why: 'N14: 未知键被静默丢弃（不进 unknownKeys）⇒ 「这份包有几个键在这儿用不了」从回执里消失',
      from: "    const unknownKeys = Object.keys(b.values).filter(function (k) { return known.indexOf(k) < 0; });",
      to: "    const unknownKeys = [];",
      probe: function (__src) {
        const WA = hostWith(__src, ENGINES);
        ENGINES(WA);
        WA.rulePack.setSettings({ enabled: true });
        const imp = WA.rulePack.importPack(JSON.stringify({ rulePack: 1, name: 'x',
          values: { worldaxis_theme_settings_v1: {}, worldaxis_never_seen_v1: 1 } }));
        return imp.unknownKeys.length;
      },
      want: 1 }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'e7/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'e7/Na(' + cs.n + '): 破坏真的改动了源码文本');
    const same = function (x, y) { return JSON.stringify(x) === JSON.stringify(y); };
    // 两向自证：先证明「同款判据」在原版上给出 want（判据本身是真的）
    let okSet = null;
    try { okSet = cs.probe(SRC); } catch (e) { okSet = 'THREW ' + e.message; }
    a(same(okSet, cs.want), 'e7/Nb(' + cs.n + '): 原版上同款判据为真（实 ' + JSON.stringify(okSet) + '）');
    // 再在**破坏副本**上重跑同款判据：必须现形
    let badSet = null;
    try { badSet = cs.probe(broken); } catch (e) { badSet = 'THREW ' + e.message; }
    a(!same(badSet, cs.want), 'e7/Nc(' + cs.n + '): 破坏副本上同款判据现形（实 ' + JSON.stringify(badSet) + '）');
    // H5 判据纯度：判据不得引用破坏后的锚点串
    a(String(cs.probe).indexOf(cs.to.slice(0, 24)) < 0, 'e7/Nd(' + cs.n + '): 判据不引用破坏后的锚点串（H5 纯度）');
    // 每条锚点都必须在**注释之外**命中（破坏的是真代码，不是一段说明）
    const shown = cs.from.split('\n')[0];
    const isComment = /^\s*(\/\/|\*|\/\*)/.test(shown);
    a(!isComment, 'e7/Ne(' + cs.n + '): 锚点落在真代码上（不是注释里的说明文字）');
  });
  // 反空转：未破坏时读口真出内容（不是空集上恒真）
  {
    const host = hostWith(SRC, ENGINES);
    host.rulePack.setSettings({ enabled: true });
    seedTheme(host, ['x']);
    a(host.rulePack.catalog().actions.length === 5 && host.rulePack.current({}).packable >= 1,
      'e7/N9: 反空转 —— 未破坏时读口真出内容（不是空集上恒真）');
  }
  // H6 工具两向自证：锚点不存在 / 不唯一必须抛；破坏必须可观测改行为
  {
    const S = 'const A = 1;\nconst B = 2;\n';
    const hit = function (src, from, to) {
      const n = src.split(from).length - 1;
      if (n !== 1) throw new Error('anchor-not-unique:' + n);
      return src.split(from).join(to);
    };
    let threw = false;
    try { hit(S, 'const ZZZ = 9;', 'x'); } catch (e) { threw = true; }
    a(threw, 'e7/N10: 锚点不存在时工具**必须抛**（不许静默返回原串）');
    threw = false;
    try { hit('const A = 1;\nconst A = 1;\n', 'const A = 1;', 'x'); } catch (e) { threw = true; }
    a(threw, 'e7/N10b: 锚点不唯一时工具**必须抛**（改到哪一处成了未知）');
    a(hit(S, 'const A = 1;', 'const A = 2;') !== S, 'e7/N10c: 破坏可观测地改动了文本');
    a(hit(S, 'const A = 1;', 'const A = 2;').indexOf('const A = 2;') >= 0, 'e7/N10d: 破坏结果**真含**替换后的文本');
  }
}

// ── 汇总 ───────────────────────────────────────────────────────────────
const __a = function (cond, name) { a(cond, name); };
runA(__a); runB(__a); runC(__a); runN(__a);
console.log('\nE7 s3-b3-e7-v2188 ' + pass + ' / 失败 ' + fail);
if (fail) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }