'use strict';
// WorldAxis tests/s3-b1-e1-v2183.js (v2.183.0) — E1 统一待办事项中心专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许把两种不同的状况压成同一个绿点」）：
//   ① 缺席（读不到）/ 空（有源且全部自报无数据）/ 无事（读过且此刻没有待办）**三态可分** ——
//      初版只有后两个，八源全缺席时 allClear=true，把「读不到」报成了「全处理完」；
//   ② **可达性如实标注**：八源没有一个申报 `empty` ⇒ emptyAll 不可达。
//      灯不亮可以，但「为什么亮不了」必须可答（emptyReported / emptyAllReachable）——
//      否则那是一盏**永远不亮、也没人知道为什么**的死灯；
//   ③ **四种返回形状**（items 桶 / points 桶 / 裸数组 / 单对象或 null）在归一化层消化，
//      形状不认的如实报 bad-shape，**不许猜字段**；
//   ④ 关闭 / 缺席的模块进 `skipped` 带原因，**不许静默当作「没有这类事项」**；
//   ⑤ **只读**：连读五口之后存档逐字节不变（本模块不导出任何写口 —— 不是「暂未实现」，
//      是**设计上不导出**：确认语义由各来源模块自己的公开写口持有）；
//   ⑥ 排序**不用对象键序**（会随插入顺序漂移），按来源声明序 + 记录 id 升序，
//      同一状态两次读数逐字相同。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD），
//   而不是自拼一份模块清单 —— 自拼清单就是第二个真源，长出来的模块它不认识。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const synthHost = require('./synth-host.js');
const REL = 'engines/pending-center.js';
const KEYS = ['getSettings', 'setSettings', 'items', 'soon', 'bySource', 'describe', 'diagnose', 'stat', 'reset'];
// 按仓规「无消费方不挂导出」：本模块的真消费方是面板与诊断节，故**没有**注入段。
//   多一个 buildBlock 就要走注入链七点登记 —— 这里钉住它「不该存在」。
const MUST_BE_ABSENT = ['buildBlock'];
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.pendingCenter = {');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
/** 最小 localStorage 桩（真 localStorage 语义：缺键返 null、值恒字符串） */
function fakeLS() {
  const m = Object.create(null);
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; }, _dump: function () { return m; } };
}
/** 合成宿主 + 真 settingsBus（N 段要用**真归一/saveOrThrow 路径**，否则开关判据会静默降级） */
function hostWith(src, stubs) {
  const c = synthHost.negativeContext({});
  c.window.localStorage = fakeLS();
  vm.runInContext(readOf('core/settings-bus.js'), c, { filename: 'core/settings-bus.js' });
  vm.runInContext(src, c, { filename: REL });
  const WA = c.window.WorldAxis;
  if (stubs) stubs(WA);
  return WA;
}
/** 四个来源桩：覆盖四族形状（items 桶 / points 桶 / 裸数组 / 单对象） */
function fourShapes(WA) {
  WA.commission = { pending: function () { return { ok: true, items: [{ id: 'c1', title: '送信' }] }; } };
  WA.storyChoice = { pending: function () { return { ok: true, points: [{ id: 'p1', prompt: '选边', options: 3 }] }; } };
  WA.coop = { pending: function () { return [{ id: 'm1_s0', actor: '张三', load: 'x' }]; } };
  WA.backstage = { pending: function () { return { anchor: { idx: 4, swipe: 0 }, reason: 'await-confirm' }; } };
}
/** 「有源在场且确实没有待办，但**没有一个源申报 empty**」—— 现版本最常见的那一态 */
const LIVE_NO_EMPTY = function (WA) {
  WA.commission = { pending: function () { return { ok: true, items: [], count: 0 }; } };
};

// ── A 段：静态契约（导出面 / 单一真源 / 装载面 / 登记面 / 冻结串）───────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'e1v2183/A1: 能从真源码取出 WA.pendingCenter 的对象字面量体');
  KEYS.forEach(function (k) { a(body.indexOf(k + ':') > 0, 'e1v2183/A2: 导出面含 ' + k); });
  MUST_BE_ABSENT.forEach(function (k) {
    a(body.indexOf(k + ':') < 0, 'e1v2183/A3: 导出面**没有** ' + k + '（无消费方不挂导出）');
  });
  a(/EXPORT_COUNT\s*=\s*9/.test(src), 'e1v2183/A4: EXPORT_COUNT = 9');
  a(/pendingCenter: export count mismatch/.test(src), 'e1v2183/A5: 自证串在位（导出面变动必须有人确认过）');
  a(/const DEF = \{ enabled: false, maxRows: 32, soonCount: 8 \}/.test(src), 'e1v2183/A6: 默认关 + 两项参数声明');
  a(/bounds: \{ maxRows: \[4, 128\], soonCount: \[1, 32\] \}/.test(src), 'e1v2183/A7: 区间声明逐字在位');
  a(/LS_KEY = 'worldaxis_pending_center_settings_v1'/.test(src), 'e1v2183/A8: 设置键是单一真源');
  // 三旗标 + 可达性读数：**并排**写在返回体里（少一个就是「承诺悄悄缩水」）
  a(/emptyAll: emptyAll, emptyReported: emptyReported, unavailable: unavailable,/.test(src),
    'e1v2183/A9: 三旗标 + 可达性读数在返回体里逐字并排');
  a(/allClear: rows\.length === 0 && !emptyAll && !unavailable/.test(src),
    'e1v2183/A10: allClear 的判据**排除了**另两态（不是单纯 rows.length===0）');
  a(/function emptyOf\(r\) \{ return \(r && typeof r\.empty === 'boolean'\) \? r\.empty : null; \}/.test(src),
    'e1v2183/A11: empty 走**三值**函数（未申报 ⇒ null，不压成 false）');
  a(/empty: null, allClear: arr\.length === 0/.test(src),
    'e1v2183/A12: 裸数组那一族如实报 empty:null（它没有申报面，不拿 false 冒充回答）');
  a(/emptyReported === liveSrc\.length/.test(src), 'e1v2183/A13: emptyAll 的判据要求**全部**在场源都自报');
  ['disabled', 'missing-kind', 'unknown-kind', 'not-found', 'module-missing', 'source-threw', 'bad-shape']
    .forEach(function (c) { a(src.indexOf("'" + c + "'") >= 0, 'e1v2183/A14: 拒收码 ' + c + ' 在位'); });
  a(/不改任何来源模块的状态/.test(src), 'e1v2183/A15: 「只读」写在模块头（不改来源模块状态）');
  a(/不导出任何写口/.test(src), 'e1v2183/A16: 「不导出任何写口」写在模块头（不是暂未实现）');
  a(readOf('index.js').indexOf("'engines/pending-center.js'") >= 0, 'e1v2183/A17: index.js LOAD_ORDER 装载');
  a(readOf('tests/run.js').indexOf("'engines/pending-center.js'") >= 0, 'e1v2183/A18: tests/run.js LOAD 装载');
  const diag = readOf('engines/tool-diag.js');
  a(diag.indexOf("'engines/pending-center.js': 'pendingCenter'") >= 0, 'e1v2183/A19: tool-diag MODULE_EXPORTS 登记');
  a(diag.indexOf('function secPendingCenter()') >= 0, 'e1v2183/A20: tool-diag secPendingCenter() 存在');
  a(diag.indexOf('pendingCenter: secPendingCenter()') >= 0, 'e1v2183/A21: tool-diag 诊断对象成员在位');
  a(diag.indexOf('wa-pc-enabled') >= 0 && diag.indexOf('wa-pc-drill-go') >= 0,
    'e1v2183/A22: tool-diag UI_BINDINGS 登记本模块控件');
  const pan = readOf('ui/panel.js');
  ['wa-pc-enabled', 'wa-pc-view', 'wa-pc-soon', 'wa-pc-sources', 'wa-pc-diag', 'wa-pc-drill', 'wa-pc-drill-go', 'wa-pc-out']
    .forEach(function (id) { a(pan.indexOf(id) >= 0, 'e1v2183/A23: 面板渲染 ' + id); });
  a(pan.indexOf("'#wa-pc-drill-go'") >= 0, 'e1v2183/A24: 面板接线（下钻按钮）在位');
  a(pan.indexOf('<div class="wa-sec">统一待办中心</div>') >= 0,
    'e1v2183/A25: 分区标题是纯文本形态且含模块身份词（v2570 的分区提取正则不吃内联 span）');
  a(readOf('tests/run.js').indexOf('|pendingCenter:bySource describe diagnose getSettings items setSettings soon stat|') >= 0,
    'e1v2183/A26: FROZEN2800 逐字含本模块的契约成员集（reset 不在其中：产品侧零消费 ⇒ 它走 test-only 账本，'
    + '不进跨文件契约 —— 契约收的是「产品真引用的成员」，把测试侧引用也算进去会让契约随测试漂移）');
  // 本锁的版本判据是**下界**（本版是 v2.183.0 交付的），不是「恰好等于」——
  //   后续升版（v2.184.0…）不该让这条判据变红：旧锁钉的是「该版本及以上」
  //   （与仓内 s3-tx* 系列旧锁同一口径，它们把新版本词**追加**进白名单而不是替换）。
  //   同时钉住**入口与清单必须同值**——那才是这条判据真正要防的事。
  const idxSrc = readOf('index.js'), manVer = JSON.parse(readOf('manifest.json')).version;
  const mv = (idxSrc.match(/VERSION = '([0-9.]+)'/) || [])[1] || '';
  const cmp = function (a, b) {
    const A = String(a).split('.').map(Number), B = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0); }
    return 0;
  };
  a(cmp(mv, '2.183.0') >= 0, 'e1v2183/A27: 入口版本不低于本锁的交付版本（实 ' + mv + '）');
  a(mv === manVer, 'e1v2183/A27b: 入口与清单版本同值（实 ' + mv + ' / ' + manVer + '）');
}

// ── B 段：运行时行为 ─────────────────────────────────────────────────────
function runB(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  a(typeof WA.pendingCenter === 'object', 'e1v2183/B1: 模块装载');
  a(KEYS.every(function (k) { return typeof WA.pendingCenter[k] === 'function'; }), 'e1v2183/B2: 9 口全部可调用');
  a(WA.pendingCenter.getSettings().enabled === false, 'e1v2183/B3: 默认关');
  a(WA.pendingCenter.items().reason === 'disabled' && WA.pendingCenter.soon().reason === 'disabled'
    && WA.pendingCenter.describe('commission').reason === 'disabled',
    'e1v2183/B4: 关闭时三面**都**拒算（不是只拒一个）');
  WA.pendingCenter.setSettings({ enabled: true });
  a(WA.pendingCenter.getSettings().enabled === true, 'e1v2183/B5: 开关是活的');
  // ── 三态可分（本节核心）──
  const r0 = WA.pendingCenter.items();
  a(r0.ok === true, 'e1v2183/B6: 开启后可读');
  a(r0.rows.length === 0 && r0.unavailable === false && r0.allClear === true && r0.emptyAll === false,
    'e1v2183/B7: 现版本常态是 allClear（有源在读、此刻没有待办）——实 allClear=' + r0.allClear);
  a(r0.sourceCount >= 1 && r0.skipped.length >= 1, 'e1v2183/B8: 在场源与跳过源分别计数（实 '
    + r0.sourceCount + ' / ' + r0.skipped.length + '）');
  a(r0.skipped.every(function (s) { return typeof s.source === 'string' && typeof s.reason === 'string'; }),
    'e1v2183/B9: skipped 逐条带来源与原因');
  a(r0.skipped.some(function (s) { return s.reason === 'disabled'; }), 'e1v2183/B10: 关掉的模块进 skipped 且原因就是 disabled');
  a(r0.perSource && Object.keys(r0.perSource).length === 8, 'e1v2183/B11: perSource 逐源有账（8 源全覆盖）');
  a(Object.keys(r0.perSource).every(function (k) {
    return typeof r0.perSource[k].ok === 'boolean' && typeof r0.perSource[k].count === 'number';
  }), 'e1v2183/B12: 每源带 ok 与 count');
  a(r0.note.indexOf('不可区分') >= 0 && r0.note.indexOf('emptyReported') >= 0,
    'e1v2183/B13: 可答范围如实标注（不可区分 + 可达性证据都写在返回体里）');
  // 族 A 形状真读得出来
  WA.commission.setSettings({ enabled: true });
  WA.commission.create({ title: '护送商队', principal: '商会', agent: '护卫',
    stages: [{ label: '接洽', deadline: 0 }, { label: '启程', deadline: 0 }] });
  const r1 = WA.pendingCenter.items();
  a(r1.total >= 1 && r1.rows.some(function (x) { return x.kind === 'commission'; }),
    'e1v2183/B14: 族 A（items 桶）真待办读得出来');
  a(r1.emptyAll === false && r1.allClear === false, 'e1v2183/B15: 有待办时两旗标都为假');
  a(r1.rows.every(function (x) {
    return typeof x.kind === 'string' && typeof x.source === 'string' && typeof x.ref === 'string'
      && typeof x.title === 'string' && typeof x.canAct === 'boolean' && x.route && typeof x.route.kind === 'string';
  }), 'e1v2183/B16: 统一形状齐备（kind/source/ref/title/canAct/route）');
  a(!r1.skipped.some(function (s) { return s.source === 'commission'; }), 'e1v2183/B17: 开启后不再出现在 skipped');
  // 下钻
  var d1 = WA.pendingCenter.describe('commission');
  a(d1.ok === true && d1.module === 'commission' && typeof d1.page === 'string',
    'e1v2183/B18: 下钻答「去哪看」（page + module）');
  a(d1.settingsKey === 'worldaxis_commission_settings_v1', 'e1v2183/B19: 下钻带设置键');
  a(d1.note.indexOf('不执行确认动作') >= 0, 'e1v2183/B20: 下钻自述「只给路由、不执行动作」');
  var d2 = WA.pendingCenter.describe('commission', d1.id);
  a(d2.ok === true && d2.id === d1.id, 'e1v2183/B21: 带 id 的下钻与不带 id 的结果自洽');
  a(WA.pendingCenter.describe('commission', 'no_such_id').reason === 'not-found',
    'e1v2183/B22: 在场源里查不到该条 ⇒ not-found（与「源缺席」分开）');
  a(WA.pendingCenter.describe('nope').reason === 'unknown-kind', 'e1v2183/B23: 未知类型 ⇒ unknown-kind');
  a(WA.pendingCenter.describe('').reason === 'missing-kind', 'e1v2183/B24: 空参数 ⇒ missing-kind（与 not-found 分开）');
  // 逐源可用性
  var srcs = WA.pendingCenter.bySource();
  a(srcs.length === 8, 'e1v2183/B25: 源表 8 条（实 ' + srcs.length + '）');
  a(srcs.every(function (s) { return typeof s.name === 'string' && typeof s.available === 'boolean' && typeof s.read === 'number'; }),
    'e1v2183/B26: 每源带 availability 与会话累计读数');
  a(srcs.filter(function (s) { return s.name === 'commission'; })[0].available === true, 'e1v2183/B27: 在场源如实报在场');
  // 诊断
  var dg = WA.pendingCenter.diagnose();
  a(dg.ok === true && dg.closedLoop === true && dg.version === '2.183.0' && dg.sourceCount === 8,
    'e1v2183/B28: diagnose 闭环 + 8 源 + 版本');
  a(typeof dg.emptyReporterCount === 'number' && typeof dg.emptyAllReachable === 'boolean',
    'e1v2183/B29: 诊断面报 empty 申报数（灯亮不亮的现场证据）');
  a(dg.liveSources >= 1 && dg.emptyReporterCount === 0 && dg.emptyAllReachable === false,
    'e1v2183/B30: 八源全不申报 empty ⇒ emptyAllReachable 为假（这是现场事实，不是文案）');
  a(dg.checks.aftermath === true && dg.checks.backstage === true && typeof dg.checks.settingsBus === 'boolean',
    'e1v2183/B31: checks 覆盖八源 + 两个基础依赖');
  // 计数
  var st = WA.pendingCenter.stat();
  a(st.reads >= 1 && st.enabled === true && typeof st.maxRows === 'number', 'e1v2183/B32: stat 记读数与开关态');
  a(typeof st.faults === 'object' && typeof st.bySource === 'object', 'e1v2183/B33: stat 记拒收与逐源读数');
  WA.pendingCenter.reset();
  a(WA.pendingCenter.stat().reads === 0 && Object.keys(WA.pendingCenter.stat().faults).length === 0,
    'e1v2183/B34: reset 清零三面');
  // 只读
  var z1 = JSON.stringify(WA.store.get());
  WA.pendingCenter.items();
  WA.pendingCenter.soon();
  WA.pendingCenter.bySource();
  WA.pendingCenter.describe('commission');
  WA.pendingCenter.diagnose();
  var z2 = JSON.stringify(WA.store.get());
  a(z1 === z2, 'e1v2183/B35: 只读（连读五口之后存档逐字节不变）');
  WA.pendingCenter.setSettings({ enabled: false });
  a(WA.pendingCenter.items().ok === false, 'e1v2183/B36: 关回去仍拒算（开关是活的）');
}

// ── C 段：不变式 ─────────────────────────────────────────────────────────
function runC(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  WA.pendingCenter.setSettings({ enabled: true });
  a(WA.pendingCenter.getSettings().maxRows === 32 && WA.pendingCenter.getSettings().soonCount === 8,
    'e1v2183/C1: 两个子键默认值原样');
  WA.pendingCenter.setSettings({ maxRows: 5 });
  a(WA.pendingCenter.getSettings().maxRows === 5 && WA.pendingCenter.getSettings().soonCount === 8,
    'e1v2183/C2: 未写的子键保持默认（不塌成 undefined）');
  WA.pendingCenter.setSettings({ soonCount: 2, maxRows: 32 });
  a(WA.pendingCenter.getSettings().soonCount === 2 && WA.pendingCenter.getSettings().maxRows === 32,
    'e1v2183/C3: 两个子键互不串写');
  a(WA.pendingCenter.getSettings().enabled === true, 'e1v2183/C4: 写子键不动开关');
  // 区间声明真的参与归一（越界被夹取，而不是静默接受）
  WA.pendingCenter.setSettings({ maxRows: 99999 });
  a(WA.pendingCenter.getSettings().maxRows <= 128, 'e1v2183/C5: 越界值被夹到区间上界（实 '
    + WA.pendingCenter.getSettings().maxRows + '）');
  WA.pendingCenter.setSettings({ maxRows: 32 });
  a(WA.pendingCenter.getSettings().maxRows === 32, 'e1v2183/C6: 下限之上的值原样写回');
  // 排序稳定：声明序在前、id 升序在后（**不是**对象键序）
  var order = WA.pendingCenter.bySource().map(function (s) { return s.name; });
  a(JSON.stringify(order) === JSON.stringify(['aftermath', 'commission', 'investigation', 'operations', 'storyChoice', 'coop', 'farfield', 'backstage']),
    'e1v2183/C7: 源声明序固定（下钻与排序都建在它上面）');
  // 两次读数逐字相同
  a(JSON.stringify(WA.pendingCenter.items()) === JSON.stringify(WA.pendingCenter.items()),
    'e1v2183/C8: 同一状态两次读数逐字相同');
  // 返回的是副本：改返回值不改下一次读数
  var rows1 = WA.pendingCenter.items().rows;
  if (rows1.length) { rows1[0].title = '__mutated__'; rows1[0].route.kind = '__mutated__'; }
  a(WA.pendingCenter.items().rows.every(function (r) { return r.title !== '__mutated__' && r.route.kind !== '__mutated__'; }),
    'e1v2183/C9: 返回的是副本（行与 route 都改不动下一次读数）');
  // soon 受 soonCount 封顶
  var sn = WA.pendingCenter.soon();
  a(sn.ok === true && sn.count <= WA.pendingCenter.getSettings().soonCount, 'e1v2183/C10: soon 受 soonCount 封顶');
  var sn9 = WA.pendingCenter.soon(999);
  a(sn9.count <= WA.pendingCenter.getSettings().soonCount, 'e1v2183/C11: 传入更大的 n 也不会超过 soonCount');
  // 玩家面纯度：不夹带维护者诊断字段
  var dump = JSON.stringify(WA.pendingCenter.items());
  a(dump.indexOf('"refs"') < 0 && dump.indexOf('"tref"') < 0 && dump.indexOf('"own"') < 0,
    'e1v2183/C12: 返回体不含维护者诊断字段（refs / tref / own 那一族）');
}

// ── N 段：负控制（真源码破坏 → 合成宿主装载破坏副本 → 重跑同款真判据）──────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: 三旗标塌成两个 ⇒ 八源全缺席时「读不到」被报成「全处理完」（本模块的头号禁令）',
      from: '      allClear: rows.length === 0 && !emptyAll && !unavailable,',
      to: '      allClear: rows.length === 0,',
      probe: function (WA) { WA.pendingCenter.setSettings({ enabled: true }); var r = WA.pendingCenter.items(); return [r.unavailable, r.allClear]; },
      want: [true, false] },
    { n: 2, why: 'N2: 未申报 empty 被压成 false ⇒ 三值语义塌成两值，「没申报」与「申报了假」不可分',
      from: '  function emptyOf(r) { return (r && typeof r.empty === \'boolean\') ? r.empty : null; }',
      to: '  function emptyOf(r) { return !!(r && r.empty); }',
      probe: function (WA) {
        WA.pendingCenter.setSettings({ enabled: true });
        // 这个源**没有**申报 empty 字段。原版：perSource.empty === null（如实说「它没回答」）；
        //   破坏版：false（冒充了一个回答）。这就是三值 vs 两值的现场差别。
        WA.commission = { pending: function () { return { ok: true, items: [], count: 0 }; } };
        return WA.pendingCenter.items().perSource.commission.empty;
      },
      want: null },
    { n: 3, why: 'N3: emptyAll 被写死 ⇒ 「有源且全部自报无数据」这一态永远不亮（判据被绕过）',
      from: '      emptyAll: emptyAll, emptyReported: emptyReported, unavailable: unavailable,',
      to: '      emptyAll: false, emptyReported: emptyReported, unavailable: unavailable,',
      probe: function (WA) {
        WA.pendingCenter.setSettings({ enabled: true });
        WA.commission = { pending: function () { return { ok: true, items: [], empty: true }; } };
        var r = WA.pendingCenter.items();
        return [r.emptyAll, r.allClear];
      },
      want: [true, false] },
    { n: 4, why: 'N4: 关掉的模块被当成「读过了、没待办」⇒ 开关是死旋钮，「没有」与「关着」不可分',
      from: "    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }",
      to: "    if (false) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }",
      probe: function (WA) { return WA.pendingCenter.items().ok; },
      want: false },
    { n: 5, why: 'N5: 形状不认也不报 ⇒ 猜字段（四族形状的差异重新变成调用方的负担）',
      from: "    if (!Array.isArray(arr)) return { ok: false, reason: 'bad-shape', items: [] };",
      to: "    if (!Array.isArray(arr)) return { ok: true, reason: null, items: [], empty: null, allClear: true };",
      probe: function (WA) {
        WA.pendingCenter.setSettings({ enabled: true });
        WA.coop = { pending: function () { return { ok: true, items: [] }; } };   // 错形状：给的是对象不是裸数组
        var r = WA.pendingCenter.items();
        return [r.skipped.some(function (s) { return s.source === 'coop' && s.reason === 'bad-shape'; }), r.count];
      },
      want: [true, 0] },
    { n: 6, why: 'N6: 下钻不校验类型 ⇒ 未知来源给不出路由却报成功（「点了没反应」的读数形态）',
      from: "    if (!hit) { noteFault('unknown-kind'); return { ok: false, reason: 'unknown-kind', kind: k }; }",
      to: "    if (false) { noteFault('unknown-kind'); return { ok: false, reason: 'unknown-kind', kind: k }; }",
      probe: function (WA) { WA.pendingCenter.setSettings({ enabled: true }); return WA.pendingCenter.describe('nope').ok; },
      want: false },
    { n: 7, why: 'N7: 排序被掏空 ⇒ 同一状态两次读数可能不同序（漂移）',
      from: '    rows.sort(function (a, b) {\n      const d = order[a.source] - order[b.source];\n      if (d !== 0) return d;\n      return String(a.ref).localeCompare(String(b.ref));\n    });',
      to: '    rows.sort(function () { return 0; });',
      probe: function (WA) {
        WA.pendingCenter.setSettings({ enabled: true });
        WA.commission = { pending: function () { return { ok: true, items: [{ id: 'z9', title: 'Z' }, { id: 'a1', title: 'A' }] }; } };
        return WA.pendingCenter.items().rows.map(function (r) { return r.ref; });
      },
      want: ['a1', 'z9'] }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'e1v2183/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'e1v2183/Na(' + cs.n + '): 破坏真的改动了源码文本');
    let got = '#threw#';
    try { const WA = hostWith(broken, cs.stubs); got = cs.probe(WA); }
    catch (e) { got = '#threw#:' + (e && e.message); }
    a(JSON.stringify(got) !== JSON.stringify(cs.want),
      'e1v2183/' + cs.why + '（破坏后实得 ' + JSON.stringify(got) + '，原版为 ' + JSON.stringify(cs.want) + '）');
  });
  // 纯度：原版上同款判据必须真（否则上面那些「破坏后不同」可能是判据自己坏了）
  const W0 = hostWith(SRC, LIVE_NO_EMPTY);
  W0.pendingCenter.setSettings({ enabled: true });
  var p0 = W0.pendingCenter.items();
  a(p0.unavailable === false && p0.allClear === true && p0.emptyAll === false, 'e1v2183/Nb1: （纯度）原版上三态可分');
  a(W0.pendingCenter.diagnose().emptyReporterCount === 0 && W0.pendingCenter.diagnose().emptyAllReachable === false,
    'e1v2183/Nb2: （纯度）原版上「这盏灯亮不了」可答');
  a(W0.pendingCenter.describe('nope').ok === false, 'e1v2183/Nb3: （纯度）原版上未知类型拒收');
  a(W0.pendingCenter.describe('').reason === 'missing-kind', 'e1v2183/Nb4: （纯度）原版上空参数报 missing-kind');
  const W1 = hostWith(SRC, fourShapes);
  W1.pendingCenter.setSettings({ enabled: true });
  a(W1.pendingCenter.items().rows.map(function (r) { return r.kind; }).join(',') === 'commission,storyChoice,coop,backstage',
    'e1v2183/Nb5: （纯度）原版上四族形状都归一得出来且按声明序排');
  const W2 = hostWith(SRC, function (WA) {
    LIVE_NO_EMPTY(WA);
    WA.coop = { pending: function () { return { ok: true, items: [] }; } };
  });
  W2.pendingCenter.setSettings({ enabled: true });
  a(W2.pendingCenter.items().skipped.some(function (s) { return s.source === 'coop' && s.reason === 'bad-shape'; }),
    'e1v2183/Nb6: （纯度）原版上错形状进 skipped 且原因就是 bad-shape');
  a(SRC.length > 15000, 'e1v2183/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
}

module.exports = { runA: runA, runB: runB, runC: runC, runN: runN, KEYS: KEYS, REL: REL };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runN(a);
  console.log('\nE1 s3-b1-e1-v2183 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}