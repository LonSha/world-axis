'use strict';
// WorldAxis tests/s3-b2-o4-v2182.js (v2.182.0) — O4 存储压力专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许把量不出来的东西写成零」）：
//   ① cap 为 null（per-call / 未声明）⇒ 如实标 `unknown`，**不猜一个阈值**充数；
//   ② 通配键（`x.*`）**不展开**，如实进 wildcardSkipped —— 不假装查过；
//   ③ 迁移预检**不跑迁移**（只读判断方向）：跑一次会在 `__migrateReport` 上留痕，
//      污染下一次**真**迁移的复盘证据；
//   ④ **只读**：连读四个面之后存档逐字节不变（本模块只清点，不裁剪任何行）；
//   ⑤ 「不可丢义务」与「可回收历史」**分列** —— 这两类混在一张表里，
//      就会被读成「行都是一样的行」（TP7 的现场代价）。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const synthHost = require('./synth-host.js');
const REL = 'engines/capacity-audit.js';
const KEYS = ['getSettings', 'setSettings', 'obligations', 'waterline', 'reclaimable', 'migrationCheck', 'sources', 'diagnose', 'stat', 'reset'];

function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.capacityAudit = {');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
function fakeLS() {
  const m = Object.create(null);
  return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; }, _dump: function () { return m; } };
}
function hostWith(src, stubs) {
  const c = synthHost.negativeContext({});
  c.window.localStorage = fakeLS();
  vm.runInContext(readOf('core/settings-bus.js'), c, { filename: 'core/settings-bus.js' });
  vm.runInContext(src, c, { filename: REL });
  const WA = c.window.WorldAxis;
  if (stubs) stubs(WA);
  return WA;
}
/** cap 表桩：一个普通容器 + 一个通配键 + 一个 per-call（cap 非数字） */
const CAPS = {
  'chronicle': { cap: 200, kind: 'array' },
  'people.*': { cap: 50, wildcard: true },
  'tx.log': { cap: 'per-call', kind: 'array' }
};
// 通配键的破局点：状态里**真有一个字面 `*` 子键**时，`resolveLen` 是能解出长度的 ——
//   也就是说通配键的守卫不是「反正解不出来」的装饰，它是**唯一**拦住这行进入水位表的东西。
//   判据必须建在这个形态上（建在「解不出来」上会让破坏不显现：破坏前后都不出行 ⇒ 假绿）。
const SEED = function (WA) {
  WA.store = {
    get: function () { return { clock: { label: '第1日', dayIndex: 1 }, chronicle: [],
      people: { '*': { a: 1, b: 2 } }, tx: { log: [] } }; },
    sizeCaps: function () { return CAPS; },
    SCHEMA_VERSION: 1,
    migrations: function () { return []; },
    migrateReport: function () { return null; },
    loadStat: function () { return { migrateRefused: 0, lastRefused: null, lastFix: null }; },
    saveStat: function () { return { at: 1, ok: true, bytes: 10, failCount: 0, reason: null }; }
  };
  WA.evict = { siteDecls: function () { return {}; }, nonEvictDecls: function () { return {}; }, evictStat: function () { return null; } };
};

// ── A 段：静态契约 ───────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'o4v2182/A1: 能从真源码取出 WA.capacityAudit 的对象字面量体');
  KEYS.forEach(function (k) { a(body.indexOf(k + ':') > 0, 'o4v2182/A2: 导出面含 ' + k); });
  a(body.indexOf('buildBlock:') < 0, 'o4v2182/A3: 导出面**没有** buildBlock（无消费方不挂导出）');
  a(/EXPORT_COUNT\s*=\s*10/.test(src), 'o4v2182/A4: EXPORT_COUNT = 10');
  a(/capacityAudit: export count mismatch/.test(src), 'o4v2182/A5: 自证串在位');
  a(/const DEF = \{ enabled: false, maxRows: 24, nearRatio: 0.8 \}/.test(src), 'o4v2182/A6: 默认关 + 近满阈值 0.8');
  a(/bounds: \{ maxRows: \[4, 96\], nearRatio: \[0\.5, 1\] \}/.test(src), 'o4v2182/A7: 区间声明逐字在位');
  a(/LS_KEY = 'worldaxis_capacity_audit_settings_v1'/.test(src), 'o4v2182/A8: 设置键单一真源');
  a(/if \(meta\.wildcard\) \{ wildcardSkipped\.push\(k\); return; \}/.test(src),
    'o4v2182/A8b: 通配键走「跳过并如实登记」而不是展开');
  a(/reason: 'no-store'/.test(src) && /reason: 'disabled'/.test(src), 'o4v2182/A9: 两个拒收码字面量在位');
  a(src.indexOf('这里只清点、不裁剪') >= 0, 'o4v2182/A10: 「只清点不裁剪」写在返回体里（是判据，不是文案）');
  a(src.indexOf('WA.store.migrate(') < 0, 'o4v2182/A11: 预检不调用 store.migrate（只读面不留痕）');
  a(/NON_EVICT/.test(src) && /在途豁免/.test(src), 'o4v2182/A12: 可回收/不可回收/在途三分口径在位');
  a(readOf('index.js').indexOf("'engines/capacity-audit.js'") >= 0, 'o4v2182/A13: index.js LOAD_ORDER 装载');
  a(readOf('tests/run.js').indexOf("'engines/capacity-audit.js'") >= 0, 'o4v2182/A14: tests/run.js LOAD 装载');
  const diag = readOf('engines/tool-diag.js');
  a(diag.indexOf("'engines/capacity-audit.js': 'capacityAudit'") >= 0, 'o4v2182/A15: tool-diag MODULE_EXPORTS 登记');
  a(diag.indexOf('function secCapacityAudit()') >= 0, 'o4v2182/A16: tool-diag 节函数存在');
  a(diag.indexOf('capacityAudit: secCapacityAudit()') >= 0, 'o4v2182/A17: tool-diag 诊断对象成员在位');
  a(diag.indexOf('wa-cap-enabled') >= 0 && diag.indexOf('wa-cap-water') >= 0, 'o4v2182/A18: tool-diag UI_BINDINGS 登记本模块控件');
  const pan = readOf('ui/panel.js');
  ['wa-cap-enabled', 'wa-cap-oblig', 'wa-cap-water', 'wa-cap-reclaim', 'wa-cap-migrate', 'wa-cap-diag', 'wa-cap-out'].forEach(function (id) {
    a(pan.indexOf(id) >= 0, 'o4v2182/A19: 面板渲染 ' + id);
  });
  a(pan.indexOf("'#wa-cap-migrate'") >= 0, 'o4v2182/A20: 面板接线（迁移预检按钮）在位');
  a(readOf('tests/run.js').indexOf('|capacityAudit:diagnose getSettings migrationCheck obligations reclaimable setSettings stat waterline|') >= 0,
    'o4v2182/A21: FROZEN2800 逐字含本模块的契约成员集');
  a(/VERSION = '2\.(182|183|184)\.0'/.test(readOf('index.js')) && JSON.parse(readOf('manifest.json')).version && ['2.182.0', '2.183.0', '2.184.0'].indexOf(JSON.parse(readOf('manifest.json')).version) >= 0,
    'o4v2182/A22: 版本钉一致（index.js + manifest）');
}

// ── B 段：运行时行为 ─────────────────────────────────────────────────────
function runB(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  a(typeof WA.capacityAudit === 'object', 'o4v2182/B1: 模块装载');
  a(KEYS.every(function (k) { return typeof WA.capacityAudit[k] === 'function'; }), 'o4v2182/B2: 10 口全部可调用');
  a(WA.capacityAudit.getSettings().enabled === false, 'o4v2182/B3: 默认关');
  a(WA.capacityAudit.obligations().reason === 'disabled' && WA.capacityAudit.waterline().reason === 'disabled'
    && WA.capacityAudit.reclaimable().ok === false && WA.capacityAudit.migrationCheck().ok === false,
    'o4v2182/B4: 关闭时**四个面都拒算**（不是只拒一个）');
  WA.capacityAudit.setSettings({ enabled: true });
  a(WA.capacityAudit.getSettings().enabled === true, 'o4v2182/B5: 开关是活的');
  var ob = WA.capacityAudit.obligations();
  a(ob.ok === true && Object.keys(ob.perSource).length === 12, 'o4v2182/B6: 十二源齐备（实 ' + Object.keys(ob.perSource).length + '）');
  a(Object.keys(ob.perSource).every(function (k) { return typeof ob.perSource[k] === 'number'; }),
    'o4v2182/B7: perSource 全是数字（不是 undefined 混进来）');
  a(ob.total === Object.keys(ob.perSource).reduce(function (n, k) { return n + ob.perSource[k]; }, 0),
    'o4v2182/B8: total 与 perSource 之和一致');
  a(Array.isArray(ob.disabled), 'o4v2182/B9: 关掉的源如实进 disabled 名单');
  WA.commission.setSettings({ enabled: true });
  a(WA.commission.create({ title: '护送商队', principal: '商会', agent: '护卫',
    stages: [{ label: '接洽', deadline: 0 }] }).ok === true, 'o4v2182/B10: 夹具（委托）建立成功');
  var ob2 = WA.capacityAudit.obligations();
  a(ob2.perSource.commission >= 1, 'o4v2182/B11: 真义务进清点（读口真的走通了）');
  a(ob2.rows.some(function (r) { return r.source === 'commission' && typeof r.id === 'string' && typeof r.label === 'string'; }),
    'o4v2182/B12: 行形状 source/id/label 恒在');
  a(JSON.stringify(WA.capacityAudit.obligations().rows) === JSON.stringify(WA.capacityAudit.obligations().rows),
    'o4v2182/B13: 同存档两次清点逐字相同（无随机序）');
  var wl = WA.capacityAudit.waterline();
  a(wl.ok === true && wl.total > 0, 'o4v2182/B14: 水位表非空（实 ' + wl.total + '）');
  a(wl.rows.every(function (r) { return r.path.indexOf('*') < 0; }), 'o4v2182/B15: 行里没有通配路径（不展开）');
  a(Array.isArray(wl.wildcardSkipped) && wl.wildcardSkipped.length > 0,
    'o4v2182/B16: 通配键如实登记（实 ' + wl.wildcardSkipped.length + ' 个）而不是静默丢');
  a(wl.fullCount === wl.full.length, 'o4v2182/B17: full 名单与计数一致');
  a(wl.note.indexOf('unknown') >= 0, 'o4v2182/B18: cap 非数字者如实标 unknown（不猜阈值）');
  var ratios = wl.rows.map(function (r) { return r.ratio === null ? -1 : r.ratio; });
  a(ratios.every(function (v, i) { return i === 0 || ratios[i - 1] >= v; }), 'o4v2182/B19: 按逼近度降序');
  WA.store.transact(function (d) { d.chronicle = []; for (var i = 0; i < 200; i++) d.chronicle.push({ at: i }); }, 'lock:fill');
  var wl2 = WA.capacityAudit.waterline();
  a(wl2.fullCount >= 1 && wl2.full.indexOf('chronicle') >= 0, 'o4v2182/B20: 满容器被看见');
  var ch = wl2.rows.filter(function (r) { return r.path === 'chronicle'; })[0];
  a(ch && ch.level === 'full' && ch.cap === 200 && ch.len === 200 && ch.ratio === 1, 'o4v2182/B21: 满行形状正确');
  var rc = WA.capacityAudit.reclaimable();
  a(rc.ok === true, 'o4v2182/B22: 可回收面可读');
  a(Array.isArray(rc.ring) && rc.ringCount === rc.ring.length, 'o4v2182/B23: 环形站点清单与计数一致');
  a(Array.isArray(rc.nonEvict) && rc.nonEvict.every(function (r) { return typeof r.why === 'string' && r.why.length > 0; }),
    'o4v2182/B24: 不可回收面**每条带原因**（不是只剩一个路径）');
  a(rc.note.indexOf('环形站点') >= 0 && rc.note.indexOf('NON_EVICT') >= 0 && rc.note.indexOf('在途豁免') >= 0,
    'o4v2182/B25: 三分口径写在返回体里');
  var mc = WA.capacityAudit.migrationCheck();
  a(mc.ok === true && mc.codeSchema === 1 && mc.direction === 'same' && mc.plan.length === 0,
    'o4v2182/B26: 同版本 ⇒ direction same + 空计划');
  a(WA.store.migrateReport() === null, 'o4v2182/B27: 预检**没有**产生迁移报告（只读不留痕）');
  var z1 = JSON.stringify(WA.store.get());
  WA.capacityAudit.obligations(); WA.capacityAudit.waterline();
  WA.capacityAudit.reclaimable(); WA.capacityAudit.migrationCheck();
  WA.capacityAudit.sources();
  var z2 = JSON.stringify(WA.store.get());
  a(z1 === z2, 'o4v2182/B28: 只读（连读四个面存档逐字节不变）');
  a(WA.store.loadStat().migrateRefused === 0, 'o4v2182/B29: 预检没动 loadStat.migrateRefused');
  var srcs = WA.capacityAudit.sources();
  a(Array.isArray(srcs) && srcs.length === 16, 'o4v2182/B30: 源表 4 基础 + 12 义务 = 16（实 ' + srcs.length + '）');
  a(srcs.every(function (s) { return typeof s.name === 'string' && typeof s.available === 'boolean'; }),
    'o4v2182/B31: 每源带 availability');
  var dg = WA.capacityAudit.diagnose();
  a(dg.closedLoop === true && dg.sourceCount === 12 && dg.version === '2.182.0', 'o4v2182/B32: diagnose 闭环 + 12 源 + 版本');
  var st = WA.capacityAudit.stat();
  a(st.reads >= 1 && typeof st.bySource === 'object' && typeof st.faults.disabled === 'number' && st.faults.disabled >= 4,
    'o4v2182/B33: stat 记读数 / 按源 / 四个 disabled 拒收');
  WA.capacityAudit.reset();
  a(WA.capacityAudit.stat().reads === 0 && Object.keys(WA.capacityAudit.stat().faults).length === 0, 'o4v2182/B34: reset 清零');
  WA.capacityAudit.setSettings({ enabled: false });
  a(WA.capacityAudit.obligations().ok === false && WA.capacityAudit.waterline().ok === false,
    'o4v2182/B35: 关回去仍拒算（开关是活的）');
}

// ── C 段：不变式 ─────────────────────────────────────────────────────────
function runC(a) {
  const boot = sync.fresh({});
  const WA = boot.WA;
  WA.capacityAudit.setSettings({ enabled: true });
  WA.capacityAudit.setSettings({ maxRows: 4 });
  a(WA.capacityAudit.getSettings().maxRows === 4, 'o4v2182/C1: maxRows 写回一致');
  a(WA.capacityAudit.getSettings().nearRatio === 0.8, 'o4v2182/C2: 小数域默认值 0.8 原样保留（不被取整成 1）');
  WA.capacityAudit.setSettings({ nearRatio: 0.5 });
  a(WA.capacityAudit.getSettings().nearRatio === 0.5,
    'o4v2182/C3: 近满阈值可写下小数（**死旋钮的现场判据**：写 0.5 读回必须是 0.5 而不是 1）');
  WA.capacityAudit.setSettings({ nearRatio: 1.5 });
  a(WA.capacityAudit.getSettings().nearRatio === 1, 'o4v2182/C4: 越上限被夹到 1（夹取仍在，只是不取整）');
  WA.capacityAudit.setSettings({ nearRatio: 0.5 });
  WA.store.transact(function (d) {
    d.chronicle = []; for (var i = 0; i < 120; i++) d.chronicle.push({ at: i });   // 120/200 = 0.6
  }, 'lock:near');
  var wl = WA.capacityAudit.waterline();
  var ch = wl.rows.filter(function (r) { return r.path === 'chronicle'; })[0];
  a(ch && ch.level === 'near', 'o4v2182/C5: 近满阈值**真的参与判定**（0.6 ≥ 0.5 ⇒ near，实 ' + (ch && ch.level) + '）');
  WA.capacityAudit.setSettings({ nearRatio: 0.9 });
  var wl2 = WA.capacityAudit.waterline();
  var ch2 = wl2.rows.filter(function (r) { return r.path === 'chronicle'; })[0];
  a(ch2 && ch2.level === 'ok',
    'o4v2182/C6: 阈值调高后同一容器回到 ok（实 ' + (ch2 && ch2.level) + '）—— 参数真的被用上，不是摆设');
  WA.capacityAudit.setSettings({ nearRatio: 0.8 });
  var ob = WA.capacityAudit.obligations({ limit: 1 });
  a(ob.count <= 1 && typeof ob.capped === 'boolean', 'o4v2182/C7: 截断标志与计数自洽');
  var rows1 = WA.capacityAudit.waterline().rows;
  if (rows1.length) { rows1[0].level = '__mutated__'; }
  a(WA.capacityAudit.waterline().rows.every(function (r) { return r.level !== '__mutated__'; }),
    'o4v2182/C8: 返回的是副本（改返回值不改下一次读数）');
}

// ── N 段：负控制（真源码破坏 → 合成宿主装载破坏副本 → 重跑同款真判据）──────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: 通配键被展开进水位表 ⇒ 假装查过了没查的东西（并伪造出一个不存在的容器行）',
      from: '      if (meta.wildcard) { wildcardSkipped.push(k); return; }',
      to: '      if (false) { wildcardSkipped.push(k); return; }',
      probe: function (WA) { WA.capacityAudit.setSettings({ enabled: true }); return WA.capacityAudit.waterline().rows.length; },
      want: 1, stubs: SEED },
    { n: 2, why: 'N2: cap 非数字时拿猜来的数当阈值 ⇒ 「量不出来」被写成「没满」（最危险的读法）',
      from: '      const ratio = (capNum && capNum > 0) ? (len / capNum) : null;',
      to: '      const ratio = (len / 100);',
      probe: function (WA) { WA.capacityAudit.setSettings({ enabled: true }); return WA.capacityAudit.waterline().rows.filter(function (r) { return r.path === 'tx.log'; })[0].ratio; },
      want: null, stubs: SEED },
    { n: 3, why: 'N3: 关掉的模块照算 ⇒ 开关是死旋钮',
      from: "    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [], total: 0, perSource: {}, disabled: [] }; }",
      to: "    if (false) { noteFault('disabled'); return { ok: false, reason: 'disabled', rows: [], total: 0, perSource: {}, disabled: [] }; }",
      probe: function (WA) { return WA.capacityAudit.obligations().ok; },
      want: false, stubs: SEED },
    { n: 4, why: 'N4: 截断不标注 ⇒ 「前 N 条都清点过了」被读成「全部清点过」',
      from: '    const capped = total > limit;\n    const kept = capped ? rows.slice(0, limit) : rows;',
      to: '    const capped = false;\n    const kept = capped ? rows.slice(0, limit) : rows;',
      probe: function (WA) { WA.capacityAudit.setSettings({ enabled: true }); return WA.capacityAudit.obligations({ limit: 1 }).capped; },
      want: true,
      stubs: function (WA) {
        SEED(WA);
        WA.longline = { overdue: function () { return [{ id: 'a', content: 'x', lateBy: 1 }, { id: 'b', content: 'y', lateBy: 2 }]; } };
        WA.coop = { pending: function () { return [{ id: 'c', actor: 'z', tries: 1 }]; } };
      } },
    { n: 5, why: 'N5: 读数不计数 ⇒ 「清点过几次」不可观测（面在，账不在）',
      from: '    _stat.reads++;\n    return { ok: true, rows: kept, count: kept.length, total: total, capped: capped,',
      to: '    ;\n    return { ok: true, rows: kept, count: kept.length, total: total, capped: capped,',
      probe: function (WA) { WA.capacityAudit.setSettings({ enabled: true }); WA.capacityAudit.reset(); WA.capacityAudit.obligations(); WA.capacityAudit.obligations(); return WA.capacityAudit.stat().reads; },
      want: 2, stubs: SEED },
    { n: 6, why: 'N6: 满容器不进 full 名单 ⇒ 「哪个容器满了」在读数上消失（水位栏成了装饰）',
      from: "      else if (ratio !== null) level = (len >= capNum) ? 'full' : (ratio >= cfg.nearRatio ? 'near' : 'ok');",
      to: "      else if (ratio !== null) level = (ratio >= cfg.nearRatio ? 'near' : 'ok');",
      probe: function (WA) {
        WA.capacityAudit.setSettings({ enabled: true });
        return WA.capacityAudit.waterline().fullCount;
      },
      want: 1,
      stubs: function (WA) {
        SEED(WA);
        WA.store.get = function () { return { chronicle: new Array(200) }; };
      } }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'o4v2182/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'o4v2182/Na(' + cs.n + '): 破坏真的改动了源码文本');
    let got = '#threw#';
    try { const WA = hostWith(broken, cs.stubs); got = cs.probe(WA); }
    catch (e) { got = '#threw#:' + (e && e.message); }
    a(got !== cs.want, 'o4v2182/' + cs.why + '（破坏后实得 ' + JSON.stringify(got) + '，原版为 ' + JSON.stringify(cs.want) + '）');
  });
  const W0 = hostWith(SRC, SEED);
  W0.capacityAudit.setSettings({ enabled: true });
  a(W0.capacityAudit.waterline().rows.length === 2 && W0.capacityAudit.waterline().wildcardSkipped.join(',') === 'people.*',
    'o4v2182/Nb1: （纯度）原版上通配键只登记不进表（实 ' + W0.capacityAudit.waterline().rows.length + ' 行 / skipped '
    + JSON.stringify(W0.capacityAudit.waterline().wildcardSkipped) + '）');
  a(W0.capacityAudit.waterline().rows.filter(function (r) { return r.path === 'tx.log'; })[0].ratio === null,
    'o4v2182/Nb2: （纯度）原版上 cap 非数字 ⇒ ratio:null');
  a(W0.capacityAudit.obligations().ok === true, 'o4v2182/Nb3: （纯度）原版上开启即照算');
  W0.capacityAudit.reset();
  W0.capacityAudit.obligations();
  a(W0.capacityAudit.stat().reads === 1, 'o4v2182/Nb4: （纯度）原版上读数记账成立');
  const W1 = hostWith(SRC, function (WA) { WA.store = {}; });
  W1.capacityAudit.setSettings({ enabled: true });
  a(W1.capacityAudit.obligations().reason === 'no-store', 'o4v2182/Nb5: （纯度）原版上读不到即报 no-store');
  a(SRC.length > 15000, 'o4v2182/Nc: 被破坏的源码面非空（' + SRC.length + ' 字符）');
}

module.exports = { runA: runA, runB: runB, runC: runC, runN: runN, KEYS: KEYS, REL: REL };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runN(a);
  console.log('\nO4 s3-b2-o4-v2182 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}