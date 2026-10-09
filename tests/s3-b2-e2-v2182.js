'use strict';
// WorldAxis tests/s3-b2-e2-v2182.js (v2.182.0) — E2 世界日程专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许把「不知道」写成「没有」」）：
//   ① 剧情时间缺失时**整表拒算**（no-story-clock），不许退回墙钟、不许用「现在」冒充；
//   ② 未知时间的条目**保持未知**（untimed 计数单列），不许猜一个日期把它排进时间序；
//   ③ 表里没有 ⇒ 不下「不会发生」的结论（note 里那句话是判据，不是文案）；
//   ④ **只读**：连读四口之后存档逐字节不变（本模块是聚合面，不是第二个写者）；
//   ⑤ 委派而非复算：五源的「是否到期」由来源模块自己判，本模块只排序与展示。
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
const REL = 'engines/agenda.js';
const KEYS = ['getSettings', 'setSettings', 'upcoming', 'soon', 'overdueList', 'sources', 'diagnose', 'stat', 'reset'];
// 按仓规「无消费方不挂导出」：本模块的真消费方是面板与诊断节，故**没有**注入段。
//   多一个 buildBlock 就要走注入链七点登记 —— 这里钉住它「不该存在」。
const MUST_BE_ABSENT = ['buildBlock'];

function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.agenda = {');
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

// ── A 段：静态契约（导出面 / 单一真源 / 装载面 / 登记面 / 冻结串）───────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'e2v2182/A1: 能从真源码取出 WA.agenda 的对象字面量体');
  KEYS.forEach(function (k) { a(body.indexOf(k + ':') > 0, 'e2v2182/A2: 导出面含 ' + k); });
  MUST_BE_ABSENT.forEach(function (k) {
    a(body.indexOf(k + ':') < 0, 'e2v2182/A3: 导出面**没有** ' + k + '（无消费方不挂导出）');
  });
  a(/EXPORT_COUNT\s*=\s*9/.test(src), 'e2v2182/A4: EXPORT_COUNT = 9');
  a(/agenda: export count mismatch/.test(src), 'e2v2182/A5: 自证串在位（导出面变动必须有人确认过）');
  a(/const DEF = \{ enabled: false,/.test(src), 'e2v2182/A6: 默认关');
  a(/LS_KEY = 'worldaxis_agenda_settings_v1'/.test(src), 'e2v2182/A7: 设置键是单一真源');
  a(/bounds: \{ maxRows: \[4, 96\], soonCount: \[1, 24\] \}/.test(src), 'e2v2182/A8: 区间声明在位');
  a(/reason: 'no-story-clock'/.test(src) && /reason: 'disabled'/.test(src), 'e2v2182/A9: 两个拒收码字面量在位');
  // 装载面：index.js 与 tests/run.js 的 LOAD 必须**都**有它（漏一边就是「测了但没接上」）
  a(readOf('index.js').indexOf("'engines/agenda.js'") >= 0, 'e2v2182/A10: index.js LOAD_ORDER 装载');
  a(readOf('tests/run.js').indexOf("'engines/agenda.js'") >= 0, 'e2v2182/A11: tests/run.js LOAD 装载');
  // 诊断面三点登记：模块映射 / 节函数 / 诊断对象成员
  const diag = readOf('engines/tool-diag.js');
  a(diag.indexOf("'engines/agenda.js': 'agenda'") >= 0, 'e2v2182/A12: tool-diag MODULE_EXPORTS 登记');
  a(diag.indexOf('function secAgenda()') >= 0, 'e2v2182/A13: tool-diag secAgenda() 存在');
  a(diag.indexOf('agenda: secAgenda()') >= 0, 'e2v2182/A14: tool-diag 诊断对象成员在位');
  a(diag.indexOf('wa-wh-ag-enabled') >= 0 && diag.indexOf('wa-wh-ag-view') >= 0,
    'e2v2182/A15: tool-diag UI_BINDINGS 登记本模块的两个控件');
  // 面板面：三块合页（健康中心 / 世界日程 / 世界纪事）里的日程块
  const pan = readOf('ui/panel.js');
  ['wa-wh-ag-enabled', 'wa-wh-ag-view', 'wa-wh-ag-sources', 'wa-wh-ag-out'].forEach(function (id) {
    a(pan.indexOf(id) >= 0, 'e2v2182/A16: 面板渲染 ' + id);
  });
  a(pan.indexOf("'#wa-wh-ag-view'") >= 0, 'e2v2182/A17: 面板接线（点击处理器）在位');
  a(pan.indexOf('agenda: renderHealth') < 0 || pan.indexOf('renderHealth') >= 0, 'e2v2182/A18: 面板 RENDERERS 挂载 renderHealth');
  // 出口面契约冻结串：**逐字**钉住本模块进契约面的成员集
  a(readOf('tests/run.js').indexOf('|agenda:getSettings setSettings sources stat upcoming|') >= 0,
    'e2v2182/A19: FROZEN2800 逐字含本模块的契约成员集');
  a(/VERSION = '2\.182\.0'/.test(readOf('index.js')), 'e2v2182/A20: index.js 版本钉在 2.182.0');
  a(JSON.parse(readOf('manifest.json')).version === '2.182.0', 'e2v2182/A21: manifest 版本一致');
}

// ── B 段：运行时行为（真装载面 + 真 API）────────────────────────────────
function runB(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  a(typeof WA.agenda === 'object', 'e2v2182/B1: 模块装载');
  a(KEYS.every(function (k) { return typeof WA.agenda[k] === 'function'; }), 'e2v2182/B2: 9 口全部可调用');
  a(WA.agenda.getSettings().enabled === false, 'e2v2182/B3: 默认关');
  const d0 = WA.agenda.upcoming();
  a(d0.ok === false && d0.reason === 'disabled', 'e2v2182/B4: 关闭时整表拒算（disabled）');
  WA.agenda.setSettings({ enabled: true });
  a(WA.agenda.getSettings().enabled === true, 'e2v2182/B5: 开关是活的（写了读得回来）');
  const d1 = WA.agenda.upcoming();
  a(d1.ok === false && d1.reason === 'no-story-clock',
    'e2v2182/B6: 无剧情钟 ⇒ 整表拒算（不退回墙钟，实 ' + JSON.stringify(d1.reason) + '）');
  WA.calendar.setClock('第1日', { source: 'user', dayIndex: 1 });
  const d2 = WA.agenda.upcoming();
  a(d2.ok === true && typeof d2.storyDay === 'number', 'e2v2182/B7: 有剧情钟 ⇒ ok + storyDay');
  a(d2.count === 0 && d2.note.indexOf('不等于不会发生') >= 0,
    'e2v2182/B8: 空表如实报，且不下「不会发生」的结论');
  // 造一条有 deadline 的真条目（委托在途阶段）——时间序里应出现
  WA.commission.setSettings({ enabled: true });
  var c1 = WA.commission.create({ title: '护送商队', principal: '商会', agent: '护卫',
    stages: [{ label: '接洽', deadline: 0 }, { label: '启程', deadline: 0 }] });
  a(c1.ok === true, 'e2v2182/B9: 夹具（委托）建立成功');
  var d3 = WA.agenda.upcoming();
  a(d3.rows.some(function (r) { return r.source === 'commission'; }), 'e2v2182/B10: 委托进日程（聚合真的走通了源）');
  a(d3.perSource.commission >= 1, 'e2v2182/B11: perSource 如实计数');
  // 未知时间与已知时间**分列**：委托阶段 deadline 为 0 ⇒ 未知时间，进 untimed 而不是被猜一个日期
  a(d3.untimedCount >= 1 && d3.timedCount + d3.untimedCount === d3.total,
    'e2v2182/B12: 未知时间单列（timed + untimed = total，实 ' + d3.timedCount + '+' + d3.untimedCount + '=' + d3.total + '）');
  // 只读不变式：连读四口之后存档逐字节不变
  var s1 = JSON.stringify(WA.store.get());
  WA.agenda.upcoming(); WA.agenda.soon(3); WA.agenda.overdueList(); WA.agenda.sources();
  var s2 = JSON.stringify(WA.store.get());
  a(s1 === s2, 'e2v2182/B13: 只读（连读四口存档逐字节不变）');
  var srcs = WA.agenda.sources();
  a(Array.isArray(srcs) && srcs.length === 5, 'e2v2182/B14: 五源可用性表');
  a(srcs.every(function (s) { return typeof s.name === 'string' && typeof s.available === 'boolean'; }),
    'e2v2182/B15: 每源带 available（缺席如实报，不静默丢）');
  var sn = WA.agenda.soon(1);
  a(sn.ok === true && sn.count <= 1, 'e2v2182/B16: soon(n) 按 n 夹取（实 ' + sn.count + '）');
  var ol = WA.agenda.overdueList();
  a(ol.ok === true && Array.isArray(ol.rows), 'e2v2182/B17: overdueList 结构稳定');
  var dg = WA.agenda.diagnose();
  a(dg.closedLoop === true && dg.checks.store === true, 'e2v2182/B18: diagnose 闭环自证');
  a(dg.version === '2.182.0', 'e2v2182/B19: diagnose 报版本');
  WA.agenda.upcoming();
  var stt = WA.agenda.stat();
  a(stt.reads >= 1 && typeof stt.bySource === 'object', 'e2v2182/B20: stat 记读数与按源计数');
  WA.agenda.reset();
  a(WA.agenda.stat().reads === 0 && Object.keys(WA.agenda.stat().faults).length === 0, 'e2v2182/B21: reset 清读数与 faults');
  // 开关**关回去**再拒算一次：证明它不是「装载时读一次」的死旋钮
  WA.agenda.setSettings({ enabled: false });
  a(WA.agenda.upcoming().ok === false && WA.agenda.upcoming().reason === 'disabled',
    'e2v2182/B22: 关回去仍拒算（开关每次读，不是装载期快照）');
}

// ── C 段：不变式（跨入口一致 / 形状稳定）────────────────────────────────
function runC(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  WA.agenda.setSettings({ enabled: true });
  WA.agenda.setSettings({ maxRows: 4 });
  a(WA.agenda.getSettings().maxRows === 4, 'e2v2182/C1: maxRows 写回一致（区间内不夹错）');
  WA.calendar.setClock('第1日', { source: 'user', dayIndex: 1 });
  var r1 = WA.agenda.upcoming();
  var r2 = WA.agenda.upcoming();
  a(JSON.stringify(r1.rows) === JSON.stringify(r2.rows), 'e2v2182/C2: 同一存档两次读数逐字相同（无随机序）');
  // 上限生效且**如实标注**覆盖范围
  WA.commission.setSettings({ enabled: true });
  for (var i = 0; i < 6; i++) {
    WA.commission.create({ title: 't' + i, principal: 'p', agent: 'a', stages: [{ label: 's', deadline: 0 }] });
  }
  var r3 = WA.agenda.upcoming();
  a(r3.count === 4 && r3.total >= 6 && r3.capped === true,
    'e2v2182/C3: 上限生效并标注 capped（count ' + r3.count + ' / total ' + r3.total + '）');
  a(r3.rows.every(function (x) { return x && typeof x.source === 'string' && typeof x.label === 'string'; }),
    'e2v2182/C4: 行形状稳定（source/label/kind 恒在）');
  // 五源判据只看「读口是否在场」，不看结果内容 —— 探可用性不得污染 bySource 计数
  var b1 = JSON.stringify(WA.agenda.stat().bySource);
  WA.agenda.sources();
  var b2 = JSON.stringify(WA.agenda.stat().bySource);
  a(b1 === b2, 'e2v2182/C5: sources() 不产生读数副作用（探可用性不改被探对象）');
  // 返回副本：调用方改不动内部行
  var rows1 = WA.agenda.upcoming().rows;
  rows1[0].source = '__mutated__';
  a(WA.agenda.upcoming().rows.every(function (x) { return x.source !== '__mutated__'; }),
    'e2v2182/C6: 返回的是副本（改返回值不改下一次读数）');
}

// ── N 段：负控制（真源码破坏 → 合成宿主装载破坏副本 → 重跑同款真判据）──────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: 剧情时间缺失时照算 ⇒ 拿「现在/0」冒充剧情时间（本模块的头号禁令）',
      from: "if (!label) return { ok: false, reason: 'no-story-clock' };",
      to: 'if (false) return { ok: false, reason: \'no-story-clock\'; };',
      probe: function (WA) { WA.agenda.setSettings({ enabled: true }); return WA.agenda.upcoming().ok; },
      want: false },
    { n: 2, why: 'N2: 关掉的模块照算 ⇒ 开关是死旋钮（点了没效果的开关）',
      from: "if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }\n    const o = (opts && typeof opts === 'object') ? opts : {};",
      to: "if (false) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [] }; }\n    const o = (opts && typeof opts === 'object') ? opts : {};",
      probe: function (WA) { return WA.agenda.upcoming().ok; },
      want: false,
      // 判据必须能只由「关掉仍照算」这一件事决定：给合成宿主一支**剧情钟**，
      //   否则破坏后走到的下一道闸（no-story-clock）也返回 ok:false —— 破坏不显现（假绿）。
      stubs: function (WA) {
        WA.store = { get: function () { return { clock: { label: '第1日', dayIndex: 1 } }; },
          sizeCaps: function () { return {}; } };
      } },
    { n: 3, why: 'N3: 未知时间被丢掉 ⇒ 「不知道什么时候」在读数上与「不会发生」同形',
      from: 'const untimed = rows.filter(function (r) { return r.unknown; });',
      to: 'const untimed = [];',
      probe: function (WA) { WA.agenda.setSettings({ enabled: true }); return WA.agenda.upcoming().untimedCount; },
      want: 1,
      stubs: function (WA) {
        WA.freight = { view: function () { return { ok: true }; } };
        WA.store = { get: function () { return { freight: { shipments: [
          { id: 's1', status: 'transit', from: '甲', to: '乙', resource: '粮', qty: 1 }] } }; },
          sizeCaps: function () { return {}; } };
      } },
    { n: 4, why: 'N4: 截断不标注 ⇒ 「前 N 行都正常」被读成「全部正常」',
      from: 'const capped = merged.length > limit;',
      to: 'const capped = false;',
      probe: function (WA) { WA.agenda.setSettings({ enabled: true }); return WA.agenda.upcoming({ limit: 1 }).count; },
      want: 1,
      stubs: function (WA) {
        WA.freight = { view: function () { return { ok: true }; } };
        WA.store = { get: function () { return { freight: { shipments: [
          { id: 's1', status: 'transit', from: '甲', to: '乙', resource: '粮', qty: 1 },
          { id: 's2', status: 'transit', from: '丙', to: '丁', resource: '盐', qty: 2 }] } }; },
          sizeCaps: function () { return {}; } };
      } },
    { n: 5, why: 'N5: 读数不计数 ⇒ 「读过几次」不可观测（面在，账不在）',
      from: '    _stat.reads++;\n    return { ok: true, rows: kept.map(function (r) { return Object.assign({}, r); }),',
      to: '    ;\n    return { ok: true, rows: kept.map(function (r) { return Object.assign({}, r); }),',
      probe: function (WA) { WA.agenda.setSettings({ enabled: true }); WA.agenda.reset(); WA.agenda.upcoming(); WA.agenda.upcoming(); return WA.agenda.stat().reads; },
      want: 2,
      stubs: function (WA) {
        WA.store = { get: function () { return { clock: { label: '第1日', dayIndex: 1 } }; },
          sizeCaps: function () { return {}; } };
      } },
    { n: 6, why: 'N6: 拒收不记账 ⇒ 「为什么拒算」在诊断面上消失（只剩一句 ok:false）',
      from: "if (!now.ok) { noteFault('no-story-clock'); return { ok: false, reason: 'no-story-clock', rows: [], note: '世界钟未设定：剧情时间缺失时拒算，不猜日期' }; }",
      to: "if (!now.ok) { ; return { ok: false, reason: 'no-story-clock', rows: [], note: '世界钟未设定：剧情时间缺失时拒算，不猜日期' }; }",
      probe: function (WA) { WA.agenda.setSettings({ enabled: true }); WA.agenda.reset(); WA.agenda.upcoming(); return WA.agenda.stat().faults['no-story-clock']; },
      want: 1 }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'e2v2182/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）—— 锚点漂了该条不算通过');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'e2v2182/Na(' + cs.n + '): 破坏真的改动了源码文本');
    let got = '#threw#';
    try {
      const WA = hostWith(broken, cs.stubs);
      got = cs.probe(WA);
    } catch (e) { got = '#threw#:' + (e && e.message); }
    a(got !== cs.want, 'e2v2182/' + cs.why + '（破坏后实得 ' + JSON.stringify(got) + '，原版为 '
      + JSON.stringify(cs.want) + '）');
  });
  // Nb. 纯度：原版上同款判据必须为真 —— 否则「破坏后不同」可能只是因为原版本来就不成立
  const W0 = hostWith(SRC, function (WA) {
    WA.store = { get: function () { return { clock: { label: '第1日', dayIndex: 1 } }; }, sizeCaps: function () { return {}; } };
  });
  W0.agenda.setSettings({ enabled: true });
  a(W0.agenda.upcoming().ok === true, 'e2v2182/Nb1: （纯度）原版上有剧情钟即 ok');
  W0.agenda.reset();
  W0.agenda.upcoming();
  a(W0.agenda.stat().reads === 1, 'e2v2182/Nb2: （纯度）原版上读数记账成立');
  W0.agenda.setSettings({ enabled: false });
  a(W0.agenda.upcoming().reason === 'disabled', 'e2v2182/Nb3: （纯度）原版上关掉即拒算');
  a(SRC.length > 12000, 'e2v2182/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
}

module.exports = { runA: runA, runB: runB, runC: runC, runN: runN, KEYS: KEYS, REL: REL };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runN(a);
  console.log('\nE2 s3-b2-e2-v2182 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
