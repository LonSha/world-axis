'use strict';
// WorldAxis tests/s3-b3-e9-v2188.js (v2.188.0) — E9 隔离世界实验室与反事实对比专锁（四段齐备）
//
// 本锁钉的是**否定式核心**（每条都是「不许把两种不同的处境写成同一个形状」）：
//   ① **实验绝不写 live**：本模块零 `draft.` 赋值、零 `store.transact`、零 `localStorage` 写 ——
//      本锁**实测**（把 `store.transact` 与 `localStorage.setItem` 包一层计数，跑遍全部对外口后
//      逐个数）；并且 `liveUnchanged` 本身是**跑前跑后两次 live 摘要的实测差**，不是一句声明；
//   ② **指纹缺失保持 unknown**：某臂拿不到指纹时报 `unknown` —— 不冒充「相同」，也不冒充「不同」；
//      三臂全缺 ⇒ 整次对比报 `not-comparable`（不许回一个「全 same」）；
//   ③ **状态变了就重新预演**：起点钉一份 live 指纹；读的时候当场重算并比对，不一致报 `stale-lab`
//      （过期实验不许被当成当前结论读）；
//   ④ **反事实结果不能回溯覆盖当前存档**：导出面上**没有** apply / restore / commit 一类口 ——
//      这一条靠「那个口不存在」实现，故本锁按**不存在**判（逐名扫导出面）；
//   ⑤ **时光倒流不属于本项**：导出面同样没有 undo / rewind / rollback；
//   ⑥ **默认关**：关闭时 run / exportAs 一并拒收 `disabled`；
//   ⑦ **不重造轮子**：动作词表**逐字取自** `rehearsal.KINDS`（不自带副本）——
//      本锁用「换一份 KINDS，词表跟着变」证明它不是常量副本。
//
// 探针实测（写锁前先跑）抓到并修掉的一处**从出生起就是死的**面：
//   `diff()` 的指纹面只收**字符串** digest，而 `rehearsal.fingerprint()` 用的 `hashOf()`
//   返回的是 32 位**数字** ⇒ 三臂指纹**恒被判成缺失**，`fingerprints.state` 永远是 `unknown`。
//   而 `unknown` 在本模块里是**合法结论**，于是这个死面不会报任何错。A 段逐条钉住。
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const synthHost = require('./synth-host.js');
const REL = 'engines/world-lab.js';
const KEYS = ['getSettings', 'setSettings', 'catalog', 'run', 'arms', 'diff', 'staleness',
  'discard', 'exportAs', 'kinds', 'parseSteps', 'diagnose', 'stat'];
const FORMAT = 1;
// 边界④⑤ 的判据形态：**导出面上根本没那个口**（不是「有但不调」）。
const FORBIDDEN = ['apply', 'restore', 'commit', 'undo', 'rewind', 'rollback', 'writeBack', 'saveLab'];
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function exportBody(src) {
  const at = src.indexOf('WA.worldLab = {');
  if (at < 0) return '';
  let i = src.indexOf('{', at), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}') { depth--; if (!depth) return src.slice(i, j + 1); }
  }
  return '';
}
/** 只留**代码面**：剥掉行注释、块注释起首行与字符串字面量（模块头正在逐字讲这些边界）。 */
function codeNoStrOf(src) {
  const codeLines = src.split('\n').filter(function (l) { return !/^\s*(\/\/|\*|\/\*)/.test(l); });
  const codeOnly = codeLines.join('\n');
  return codeOnly.replace(/'[^'\n]*'/g, "''").replace(/"[^"\n]*"/g, '""');
}
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
 * 合成宿主：真 settingsBus + 真 inputGuard + **真 store**。
 *   `extra` 用来放隔离执行面（exec / rehearsal / blueprint / depCheck）。
 */
function hostWith(src, extra) {
  const c = synthHost.negativeContext({});
  const __ls = fakeLS();
  c.window.localStorage = __ls;
  vm.runInContext(readOf('core/settings-bus.js'), c, { filename: 'core/settings-bus.js' });
  vm.runInContext(readOf('core/store.js'), c, { filename: 'core/store.js' });
  vm.runInContext(readOf('core/input-guard.js'), c, { filename: 'core/input-guard.js' });
  vm.runInContext(src, c, { filename: REL });
  const WA = c.window.WorldAxis;
  try { WA.store.init(); } catch (e) { /* 已初始化 */ }
  WA.mainWin = c.window;
  WA.mainDoc = c.window.document;
  if (extra) extra(WA);
  return WA;
}
/**
 * 隔离执行面桩：**只桩 rehearsal 的公开面**（KINDS / run / fingerprint 的形状逐字对齐真引擎）。
 *   为什么不用真 rehearsal：真引擎依赖 exec 的完整沙箱链，而本锁要测的是**本模块的边界**
 *   （它有没有自己写 live、有没有把 unknown 折成 same、过期判定对不对）。
 *   真链路由面板门禁与 ui-live 通道覆盖。
 *   ⚠ `run` 桩**绝不碰 store** —— 这正是「本模块零写」的前提；桩若自己写，测出来的就不是本模块。
 */
function LAB(opts) {
  const o = opts || {};
  return function (WA) {
    WA.rehearsal = {
      KINDS: (o.kinds || ['wait', 'reroute', 'notify']).slice(),
      KIND_CN: { wait: '等待', reroute: '改道', notify: '提前通知' },
      // run 返回真引擎同形的摘要（字段逐一对应），writes 是**副本上的**事务计数
      run: function (steps, opt) {
        if (o.runRefuses) return { ok: false, reason: 'disabled' };
        const n = Array.isArray(steps) ? steps.length : 0;
        return { ok: true, dryRun: true, steps: n, done: n, refused: 0, at: 1, until: 2,
          writes: (o.writes === undefined ? 1 : o.writes),
          fingerprint: (o.noFingerprint ? null : { rev: 3, keys: 4, chars: 100,
            digest: (o.strDigest ? 'abcd1234' : 2619295927) }),
          act: { total: 2, open: 1, byStatus: {} },
          causal: { changed: 1, facts: 1 },
          notes: [], unknown: ['正文生成：本步结果未产生正文，故「读起来如何」不可比较'],
          trace: [{ n: 1, kind: 'wait', ok: true, effect: 'none' }],
          comparable: { yes: ['准入与拒绝的结论'], no: ['正文输出'] } };
      },
      preview: function () { return { ok: true, id: 'pv_1' }; }
    };
    WA.exec = { cloneState: function (s) { return JSON.parse(JSON.stringify(s)); },
      sandStore: function () { return { transact: function () {} }; },
      withContext: function (ctx, fn) { return fn(); } };
    if (o.noBlueprint !== true) {
      WA.worldBlueprint = { exportBlueprint: function () {
        if (o.bpEmpty) return { ok: false, reason: 'empty-blueprint' };
        return { ok: true, blueprint: { bpVer: 1, bpSig: 'deadbeef', ids: { people: [] },
          relations: [], roads: [], era: {} } };
      } };
    }
    WA.depCheck = { check: function () { return { ok: true, verdict: 'usable' }; } };
    WA.rand = { id: function (pre) { return (pre || 'x') + '1'; } };
    WA.clock = { now: function () { return 1757000000000; } };
  };
}
/** 五口全缺席（用来证明「隔离执行面缺席时**不在 live 上跑**」）。 */
function noLab(WA) {
  ['rehearsal', 'exec', 'worldBlueprint', 'depCheck'].forEach(function (k) { WA[k] = undefined; });
}
/** 「不许写别人的键」的判据：赋值而不是比较（E7 同款 —— `===` 不许被读成赋值）。 */
function assigns(src, ns) {
  const re = new RegExp('(^|[^=!<>])\\b(?:d|draft|WA)\\.' + ns + '\\.[A-Za-z_$][\\w$]*\\s*=(?!=)', 'm');
  return re.test(src);
}
/** 真写一下 live 世界（用来造「世界变了」的现场）。 */
function touchWorld(WA, k) {
  WA.store.transact(function (d) { d[(k || '__marker')] = ((d[(k || '__marker')] || 0) + 1); }, 'test');
}

let pass = 0, fail = 0;
const failures = [];
function a(cond, name) { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; failures.push(name); console.log('  ✗ ' + name); } }
// ── A 段：静态契约 ─────────────────────────────────────────────────────
function runA(a) {
  const src = srcOf();
  const body = exportBody(src);
  a(body.length > 0, 'e9/A1: 能从真源码取出 WA.worldLab 的对象字面量体');
  KEYS.forEach(function (k) {
    a(body.indexOf(k + ':') > 0 || body.indexOf(k + ': ') > 0, 'e9/A2: 导出面含 ' + k);
  });
  // 边界④⑤：那些口**根本不存在**（这一条是靠不存在实现的，故按不存在判）
  FORBIDDEN.forEach(function (k) {
    const re = new RegExp('\\b' + k + '\\s*:');
    a(!re.test(body), 'e9/A3: 导出面**没有** ' + k + '（反事实不回溯覆盖存档 / 不倒带）');
  });
  a(/const DEF = \{ enabled: false, maxSteps: 6, armA: '', armB: '' \}/.test(src),
    'e9/A4: 默认关 + 步数上限 + 两条路径槽声明逐字在位');
  a(/bounds: \{ maxSteps: \[1, 12\] \}/.test(src), 'e9/A5: 步数区间声明逐字在位');
  a(/LS_KEY = 'worldaxis_world_lab_settings_v1'/.test(src), 'e9/A6: 设置键是单一真源');
  a(/module: 'worldLab'/.test(src), 'e9/A7: 设置登记 module 为 worldLab');
  a(/const ARMS = \['hold', 'a', 'b'\]/.test(src), 'e9/A8: 三条路径是封闭集（hold / a / b）');
  a(/const HOLD_STEP = \{ kind: 'wait', who: '世界', ms: 0 \}/.test(src),
    'e9/A9: hold 臂那一步逐字在位（wait 是三个动作里唯一零状态面写入的一个）');
  // 边界① 零写：只在**剥掉注释与字符串**的代码面上查（模块头正是在讲这条边界）
  const codeNoStr = codeNoStrOf(src);   // 判据工具单一真源（A/C 两段共用）
  a(codeNoStr.indexOf('transact') < 0, 'e9/A10: 真代码里零 store 事务（实验绝不写 live）');
  a(codeNoStr.indexOf('draft') < 0, 'e9/A11: 真代码里零 draft 赋值');
  //   只查**代码面**：模块头与口径注释里逐字写着「零 localStorage 写」——那是这条边界的证据。
  a(codeNoStr.indexOf('localStorage') < 0, 'e9/A12: 真代码里零 localStorage（连读都不碰；注释里的说明不算）');
  ['rehearsal', 'exec', 'worldBlueprint', 'depCheck'].forEach(function (ns) {
    a(!assigns(src, ns), 'e9/A13: 不写 ' + ns + ' 的任何键（只读它的公开读口）');
  });
  // 边界② 指纹缺失保持 unknown
  a(/digest: sig\(parts\.join\('\|'\)\)/.test(src), 'e9/A14: live 摘要有自己的指纹函数（sig，FNV-1a）');
  a(/const digOf = function \(f\) \{/.test(src) && /typeof v === 'number' && isFinite\(v\)/.test(src),
    'e9/A15: digOf 同时收字符串与数字 digest（本版修掉的那一处：rehearsal 的 hashOf 返回数字）');
  a(/if \(!known\.length\) fpState = 'unknown'/.test(src)
    && /else if \(known\.length < ARMS\.length\) fpState = 'partial'/.test(src),
    'e9/A16: 指纹面三态逐字在位（unknown / partial / same|diff）');
  a(/reason: 'not-comparable'/.test(src) && /不回一个「全相同」/.test(src),
    'e9/A17: 三臂全缺 ⇒ not-comparable 且逐字写明「不回一个全相同」');
  a(/unknownArms: unknown === ARMS\.length \? ARMS\.slice\(\)/.test(src),
    'e9/A18: 逐行报「哪几条臂这一项读不到」');
  // 边界③ 过期判定
  a(/'stale-lab'/.test(src) && /_stat\.lastReason = 'stale-lab'/.test(src),
    'e9/A19: 过期码 stale-lab 在位（且真被写进台账 —— 判据形态与源码同宽）');
  a(/不是一句声明/.test(src), 'e9/A20: 逐字写明 liveUnchanged 是**实测差**而不是声明');
  a(/const before = liveDigest\(\)/.test(src) && /const after = liveDigest\(\)/.test(src),
    'e9/A21: 跑前跑后各取一次 live 摘要（这才是「实测」的现场）');
  a(/liveUnchanged = !!\(before\.ok && after\.ok && before\.digest === after\.digest\)/.test(src),
    'e9/A22: liveUnchanged 由两次摘要的**比对**算出（不是常量、不是声明）');
  // 边界⑦ 词表逐字取自 rehearsal.KINDS
  a(/if \(!r \|\| !Array\.isArray\(r\.KINDS\)\) return null/.test(src),
    'e9/A23: kinds() 从 rehearsal.KINDS 读（读不到给 null，**不给空词表**）');
  a(!/const KINDS = \[/.test(src), 'e9/A24: 本模块**不自带** KINDS 副本（自带就是第二份真源）');
  a(/kindSource: 'rehearsal\.KINDS（本模块\*\*不自带副本\*\*）'/.test(src),
    'e9/A25: 口径里逐字写明词表来源');
  // 路径解析：先全判再跑
  ['rehearsal-absent', 'empty-path', 'too-many-steps', 'unknown-kind', 'missing-who'].forEach(function (c) {
    a(src.indexOf("'" + c + "'") >= 0, 'e9/A26: 解析拒收码 ' + c + ' 在位');
  });
  a(/半套路径跑起来会让「哪几步生效了」只能靠读 trace 猜/.test(src),
    'e9/A27: 逐字写明「先全判再跑」的理由（半套路径会让生效步只能靠猜）');
  // 差异面：逐项带来源
  a(/const DIFF_ROWS = \[/.test(src), 'e9/A28: 差异行是封闭表');
  const rowsM = (src.match(/const DIFF_ROWS = \[([\s\S]*?)\n  \];/) || [])[1] || '';
  const keys = (rowsM.match(/key: '([\w.]+)'/g) || []).map(function (x) { return x.slice(6, -1); });
  a(keys.length === 8, 'e9/A29: 差异行恰八项（实 ' + keys.length + '：' + keys.join('/') + '）');
  a((rowsM.match(/src: 'rehearsal\.run\(\)\./g) || []).length >= 6,
    'e9/A30: 每一行都标了来源（逐字取自 rehearsal.run 的读数面）');
  a(/state = allSame \? 'same' : 'diff'/.test(src) && /unknown === ARMS\.length\) state = 'unknown'/.test(src),
    'e9/A31: 三态判定逐字在位（unknown 优先于 same/diff）');
  a(/正文与 NPC 临场反应在 rehearsal 的口径里本来就是 unknown/.test(src),
    'e9/A32: 逐字写明「不比正文」（混进差异面会让「试演过了」变成无法反驳的一句话）');
  // 边界④⑤ 的口径说明
  a(/没有 apply \/ restore \/ commit/.test(src), 'e9/A33: 逐字写明导出面无 apply/restore/commit');
  a(/时光倒流不属于本项/.test(src), 'e9/A34: 逐字写明时光倒流不属于本项（往回走是 chrono.undo 的事）');
  a(/本模块\*\*不落盘\*\*/.test(src) || /不落盘/.test(src), 'e9/A35: 逐字写明实验记录只在内存里');
  // 导出：起点世界为真蓝图
  a(/exportBlueprint\(\{ keep: 'roster' \}\)/.test(src), 'e9/A36: 导出走 blueprint 的既有读口（纯读）');
  a(/reason: 'blueprint-absent'/.test(src), 'e9/A37: 蓝图引擎缺席时如实拒收（不自己拼一份「长得像蓝图」的东西）');
  a(/蓝图里\*\*不含\*\*任何一条反事实结果/.test(src),
    'e9/A38: 逐字写明导出体不含任何反事实结果（那份副本从来不是真世界）');
  // ── 接线面 ──
  a(readOf('index.js').indexOf("'engines/world-lab.js'") >= 0, 'e9/A39: index.js LOAD_ORDER 装载');
  a(readOf('tests/run.js').indexOf("'engines/world-lab.js'") >= 0, 'e9/A40: tests/run.js LOAD 装载');
  {
    const idx = readOf('index.js');
    const pos = idx.indexOf("'engines/world-lab.js'");
    ['engines/rehearsal.js', 'core/exec.js', 'engines/world-blueprint.js', 'engines/dep-check.js'].forEach(function (f) {
      const p = idx.indexOf("'" + f + "'");
      a(p >= 0 && p < pos, 'e9/A41: ' + f + ' 排在 world-lab 之前（装载顺序是它的执行面前提）');
    });
  }
  {
    const diag = readOf('engines/tool-diag.js');
    a(diag.indexOf("'engines/world-lab.js': 'worldLab'") >= 0, 'e9/A42: tool-diag MODULE_EXPORTS 登记');
    a(diag.indexOf('function secWorldLab()') >= 0, 'e9/A43: tool-diag secWorldLab() 存在');
    a(diag.indexOf('worldLab: secWorldLab()') >= 0, 'e9/A44: tool-diag 诊断对象成员在位');
    a(diag.indexOf('rulePack: secRulePack()') >= 0, 'e9/A44b: 同批的 rulePack 成员未被挤掉（新增不许删旧）');
    a(diag.indexOf("page: 'tools', ids: ['wa-wl-enabled'") >= 0, 'e9/A45: UI_BINDINGS 登记在**工具页**（与渲染处同页）');
    a(diag.indexOf("dynamic: ['wa-wl-out']") >= 0, 'e9/A45b: 动态读数出口一并登记');
  }
  {
    const pan = readOf('ui/panel.js');
    ['WA.worldLab.run', 'WA.worldLab.arms', 'WA.worldLab.diff', 'WA.worldLab.discard', 'WA.worldLab.exportAs',
      'WA.worldLab.catalog', 'WA.worldLab.diagnose', 'WA.worldLab.stat', 'WA.worldLab.getSettings',
      'WA.worldLab.setSettings', 'WA.worldLab.kinds', 'WA.worldLab.parseSteps', 'WA.worldLab.staleness'].forEach(function (t) {
      a(pan.indexOf(t) >= 0, 'e9/A46: 面板上有 ' + t + ' 的真消费方（不是 test-only 挂着）');
    });
    ['wa-wl-enabled', 'wa-wl-a', 'wa-wl-b', 'wa-wl-run', 'wa-wl-arms', 'wa-wl-diff',
      'wa-wl-export', 'wa-wl-discard', 'wa-wl-catalog', 'wa-wl-diag', 'wa-wl-out'].forEach(function (id) {
      a(pan.indexOf(id) >= 0, 'e9/A47: 面板渲染 ' + id);
    });
    a(pan.indexOf('<div class="wa-sec">世界实验室与反事实对比</div>') >= 0,
      'e9/A48: 分区标题是纯文本形态且含模块身份词');
    ['wa-wl-run', 'wa-wl-arms', 'wa-wl-diff', 'wa-wl-export', 'wa-wl-discard', 'wa-wl-catalog', 'wa-wl-diag']
      .forEach(function (id) {
        a(pan.indexOf("on('#" + id + "'") >= 0, 'e9/A49: 事件绑定在位 ' + id);
      });
    a(pan.indexOf("$('#wa-wl-enabled')") >= 0, 'e9/A49b: 开关的 onchange 绑定在位');
    a(pan.indexOf('const wlbOut = function') >= 0, 'e9/A50: 输出出口用 wlbOut（不与同作用域的既有名字撞）');
  }
  {
    const mv = (readOf('index.js').match(/VERSION = '([0-9.]+)'/) || [])[1] || '';
    const cmp = function (x, y) {
      const A = String(x).split('.').map(Number), B = String(y).split('.').map(Number);
      for (let i = 0; i < 3; i++) { if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0); }
      return 0;
    };
    a(cmp(mv, '2.190.0') >= 0, 'e9/A51: 入口版本不低于本锁的交付基线（实 ' + mv + '）');
  }
}
// ── B 段：运行时行为 ───────────────────────────────────────────────────
function runB(a) {
  const src = srcOf();
  const H = hostWith(src, LAB());
  a(!!H.worldLab && typeof H.worldLab === 'object', 'e9/B1: 模块装载');
  a(KEYS.every(function (k) { return typeof H.worldLab[k] === 'function'; }), 'e9/B2: 全部导出可调用');
  a(H.worldLab.getSettings().enabled === false, 'e9/B3: 默认关');
  a(H.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' }).reason === 'disabled', 'e9/B4: 关闭时 run 拒收 disabled');
  a(H.worldLab.exportAs('blueprint').reason === 'disabled', 'e9/B4b: 关闭时 exportAs 拒收 disabled');
  a(H.worldLab.arms().reason === 'no-lab', 'e9/B4c: 没跑过实验时 arms 报 no-lab（不是空数组冒充）');
  a(H.worldLab.diff().reason === 'no-lab', 'e9/B4d: 没跑过实验时 diff 报 no-lab');
  a(H.worldLab.staleness().reason === 'no-lab', 'e9/B4e: 没跑过实验时 staleness 报 no-lab');
  a(H.worldLab.discard().discarded === false, 'e9/B4f: 没跑过实验时 discard 如实报「本就没有可丢」（不是「丢成功了」）');
  H.worldLab.setSettings({ enabled: true });
  // 三张封闭集
  const c = H.worldLab.catalog();
  a(c.arms.length === 3 && c.arms.map(function (x) { return x.id; }).join() === 'hold,a,b',
    'e9/B5: 三条路径是封闭集且次序固定（hold / a / b）');
  a(c.kinds && c.kinds.join() === 'wait,reroute,notify', 'e9/B6: 动作词表取自 rehearsal.KINDS');
  a(c.rows.length === 8 && c.bounds.maxSteps[0] === 1 && c.bounds.maxSteps[1] === 12,
    'e9/B7: 差异行八项 + 步数区间声明');
  a(c.maxSteps === 6 && c.format === FORMAT && c.module === 'worldLab', 'e9/B8: 默认步数上限与格式版本在口径里');
  a(typeof c.notes.noLiveWrite === 'string' && typeof c.notes.noRollback === 'string'
    && typeof c.notes.noRewind === 'string' && typeof c.notes.stale === 'string'
    && typeof c.notes.fingerprint === 'string' && typeof c.notes.selfProof === 'string',
    'e9/B9: 口径里六条边界口径齐备（零写 / 自证 / 指纹 / 过期 / 不回溯 / 不倒带）');
  // 路径解析
  {
    const p = H.worldLab.parseSteps('wait|李明|3\nreroute|张三|码头|车站\nnotify|李四|货到了', 6);
    a(p.ok === true && p.steps.length === 3, 'e9/B10: 三条合法步骤解析通过');
    a(p.steps[0].ms === 3 && p.steps[1].from === '码头' && p.steps[1].to === '车站' && p.steps[2].text === '货到了',
      'e9/B11: 三种动作各自的参数位解析正确');
    a(H.worldLab.parseSteps('nope|A|1', 6).reason === 'unknown-kind', 'e9/B12: 动作不在词表 ⇒ unknown-kind');
    a(H.worldLab.parseSteps('nope|A|1', 6).known.length === 3, 'e9/B12b: 拒收时回带**真**词表（现场核对的前提）');
    a(H.worldLab.parseSteps('   ', 6).reason === 'empty-path', 'e9/B13: 空路径 ⇒ empty-path');
    a(H.worldLab.parseSteps('wait||1', 6).reason === 'missing-who', 'e9/B14: 缺 who ⇒ missing-who');
    a(H.worldLab.parseSteps('wait|A|1\nwait|A|1\nwait|A|1', 2).reason === 'too-many-steps',
      'e9/B15: 超过步数上限 ⇒ too-many-steps（上限是硬上限）');
    a(H.worldLab.parseSteps('wait|A|1\n# 注释行\nwait|A|2', 6).steps.length === 2,
      'e9/B16: 井号开头的行是注释（不占步数）');
    const H2 = hostWith(src, LAB());
    H2.worldLab.setSettings({ enabled: true });
    H2.rehearsal = undefined;
    a(H2.worldLab.parseSteps('wait|A|1', 6).reason === 'rehearsal-absent',
      'e9/B17: rehearsal 缺席 ⇒ rehearsal-absent（**不是**空词表 + unknown-kind）');
  }
  // 跑一次：三臂 + 起点 + 零写自证
  {
    const r = H.worldLab.run({ a: 'wait|李明|3', b: 'notify|李明|货到了' });
    a(r.ok === true && r.arms.length === 3, 'e9/B18: 跑成且三条臂都回了');
    a(r.arms[0].id === 'hold' && r.arms[0].ok === true && r.arms[0].done === 1,
      'e9/B19: hold 臂真跑了（一步 wait），不是「跳过」');
    a(r.arms[1].ok === true && r.arms[2].ok === true, 'e9/B20: A / B 两臂都跑成');
    a(r.liveUnchanged === true && r.liveBefore === r.liveAfter,
      'e9/B21: live 前后摘要**实测一致**（零写入）');
    a(typeof r.start.keys === 'number' && typeof r.start.digest === 'string' && r.start.digest.length === 8,
      'e9/B22: 起点摘要带键数 / 字节数 / 8 位指纹');
    a(typeof r.id === 'string' && r.id.indexOf('lab') >= 0, 'e9/B23: 实验带 id（可被后续读数引用）');
  }
  // 逐臂读数
  {
    const A = H.worldLab.arms();
    a(A.ok === true && A.rows.length === 3, 'e9/B24: arms 回三行');
    a(A.rows.every(function (x) { return typeof x.writes === 'number' && x.act && x.causal; }),
      'e9/B25: 逐臂带副本事务数 / 行动面 / 因果面');
    a(A.rows.every(function (x) { return x.fingerprint && x.fingerprint.digest !== undefined; }),
      'e9/B26: 逐臂带指纹（**数字 digest 也算有** —— 本版修掉的那一处）');
    a(A.stale === false && A.staleReason === '', 'e9/B27: 世界没变时标「未过期」');
    a(A.liveUnchanged === true, 'e9/B28: 逐臂读数里带着「live 零写」这一栏');
  }
  // 差异面
  {
    const D = H.worldLab.diff();
    a(D.ok === true && D.rows.length === 8, 'e9/B29: 差异面八行');
    a(D.rows.every(function (x) { return typeof x.src === 'string' && x.src.indexOf('rehearsal.run') >= 0; }),
      'e9/B30: 每行都标来源（逐字取自 rehearsal.run 的读数面）');
    a(D.fingerprints.state === 'same',
      'e9/B31: 三臂指纹同源 ⇒ 指纹面报 same（**本版修掉的那一处**：此前恒 unknown）');
    a(D.fingerprints.rows.length === 3 && D.fingerprints.rows.every(function (x) { return !!x.fingerprint; }),
      'e9/B32: 逐臂指纹都在（不是一片 null）');
    a(D.differing === 0, 'e9/B33: 三臂读数一致时 differing 为 0（同一份桩 ⇒ 真的同值）');
    a(D.unknownRows === 0, 'e9/B34: 没有读不到的项时 unknownRows 为 0');
  }
  // 边界③ 过期判定
  {
    a(H.worldLab.staleness().match === true, 'e9/B35: 世界未变时 staleness 判「一致」');
    touchWorld(H, '__probe_marker');
    const st = H.worldLab.staleness();
    a(st.ok === true && st.match === false && st.reason === 'stale-lab',
      'e9/B36: 真改了世界之后 staleness 报 stale-lab（实测，不是靠 meta.stateRev）');
    a(typeof st.pinned === 'string' && typeof st.current === 'string' && st.pinned !== st.current,
      'e9/B37: 过期的依据是**两个指纹不同**（起点的与当前的）');
    a(H.worldLab.arms().stale === true && H.worldLab.arms().staleReason === 'stale-lab',
      'e9/B38: 逐臂读数把过期标出来（旧实验与当前结论在界面上必须分得开）');
    const D2 = H.worldLab.diff();
    a(D2.stale === true && D2.staleReason === 'stale-lab', 'e9/B39: 差异面同样标过期');
    a(D2.ok === true && D2.rows.length === 8, 'e9/B39b: 过期**不**让差异面直接失效（读数照出，只是被标出来）');
    a(H.worldLab.stat().staleReads >= 1, 'e9/B40: 读过期进台账（可复算）');
  }
  // 边界② 三臂全缺 ⇒ not-comparable
  {
    const H3 = hostWith(src, LAB({ runRefuses: true }));
    H3.worldLab.setSettings({ enabled: true });
    const r = H3.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
    a(r.ok === true, 'e9/B41: 三臂都跑不成时 run 本身仍回 ok（拒收是**逐臂**的事实，不是整次失败）');
    a(r.arms.every(function (x) { return x.ok === false && x.reason === 'disabled'; }),
      'e9/B42: 三条臂逐条报自己的拒收理由');
    a(r.liveUnchanged === true, 'e9/B43: 三臂都没跑成时 live 当然没变（这一栏仍是实测）');
    const D3 = H3.worldLab.diff();
    a(D3.ok === false && D3.reason === 'not-comparable',
      'e9/B44: 三臂全缺可比读数 ⇒ not-comparable（**不许**回一个「全 same」）');
    a(D3.rows.every(function (x) { return x.state === 'unknown'; }), 'e9/B45: 八行全部标 unknown（不冒充相同/不同）');
    a(D3.rows[0].unknownArms.length === 3, 'e9/B46: 逐行报「三条臂都读不到」');
    a(D3.fingerprints.state === 'unknown', 'e9/B47: 指纹面同样 unknown');
  }
  // 边界② 部分缺 ⇒ partial（不折成 unknown，也不折成 same）
  {
    const H4 = hostWith(src, LAB({ noFingerprint: true }));
    H4.worldLab.setSettings({ enabled: true });
    H4.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
    const D4 = H4.worldLab.diff();
    a(D4.fingerprints.state === 'unknown', 'e9/B48: 指纹全缺 ⇒ 指纹面 unknown');
    a(D4.ok === true, 'e9/B49: 但计数面仍有可比读数 ⇒ 整次对比**不**判 not-comparable（两件事分得开）');
    a(D4.rows.filter(function (x) { return x.state !== 'unknown'; }).length >= 1,
      'e9/B50: 计数行仍报得出 same/diff');
  }
  // 数字 digest 与字符串 digest 两种形态都收（本版修掉的那一处）
  {
    const Hs = hostWith(src, LAB({ strDigest: true }));
    Hs.worldLab.setSettings({ enabled: true });
    Hs.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
    a(Hs.worldLab.diff().fingerprints.state === 'same', 'e9/B51: 字符串 digest 也认（same）');
    const Hn = hostWith(src, LAB({ strDigest: false }));
    Hn.worldLab.setSettings({ enabled: true });
    Hn.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
    a(Hn.worldLab.diff().fingerprints.state === 'same', 'e9/B52: 数字 digest 也认（same）—— 两种形态同待遇');
  }
  // 丢弃
  {
    const r = H.worldLab.discard();
    a(r.ok === true && r.discarded === true, 'e9/B53: 丢弃读数成功');
    a(H.worldLab.arms().reason === 'no-lab', 'e9/B54: 丢完之后再读 ⇒ no-lab（读数真被清掉）');
    a(typeof r.note === 'string' && r.note.indexOf('本来就不落任何地方') > 0,
      'e9/B55: 丢弃回执里逐字写明「副本本来就不落任何地方」');
  }
  // 导出：起点世界为蓝图
  {
    H.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
    const ex = H.worldLab.exportAs('blueprint');
    a(ex.ok === true && ex.kind === 'blueprint' && typeof ex.blueprint === 'object',
      'e9/B56: 导出成真蓝图信封（走 blueprint 的既有出口）');
    a(ex.lab && ex.lab.arms.length === 3, 'e9/B57: 读数作为**附注**随体带走');
    a(typeof ex.attach === 'string' && ex.attach.indexOf('不含') > 0,
      'e9/B58: 逐字写明蓝图里不含任何反事实结果');
    a(H.worldLab.exportAs('nope').reason === 'unknown-kind', 'e9/B59: 未知导出类型 ⇒ unknown-kind（封闭集）');
    const H5 = hostWith(src, LAB({ noBlueprint: true }));
    H5.worldLab.setSettings({ enabled: true });
    a(H5.worldLab.exportAs('blueprint').reason === 'blueprint-absent',
      'e9/B60: 蓝图引擎缺席 ⇒ blueprint-absent（不自己拼一份「长得像蓝图」的东西）');
    const H6 = hostWith(src, LAB({ bpEmpty: true }));
    H6.worldLab.setSettings({ enabled: true });
    a(H6.worldLab.exportAs('blueprint').reason === 'export-failed',
      'e9/B61: 蓝图引擎自己有理由地拒收 ⇒ 原样带回 export-failed');
  }
  // 边界① 零写：**实测**（把 transact 与 setItem 包一层计数）
  {
    const H7 = hostWith(src, LAB());
    H7.worldLab.setSettings({ enabled: true });
    let writes = 0;
    const orig = H7.store.transact;
    H7.store.transact = function () { writes++; return orig.apply(this, arguments); };
    let lsW = [];
    const ls = H7.mainWin.localStorage;
    const oSet = ls.setItem;
    ls.setItem = function (k) { lsW.push(k); return oSet.apply(this, arguments); };
    const r = H7.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
    H7.worldLab.arms(); H7.worldLab.diff(); H7.worldLab.staleness(); H7.worldLab.catalog();
    H7.worldLab.diagnose(); H7.worldLab.stat(); H7.worldLab.kinds(); H7.worldLab.getSettings();
    H7.worldLab.setSettings({ maxSteps: 6 }); H7.worldLab.discard();
    H7.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
    H7.worldLab.exportAs('blueprint');
    ls.setItem = oSet;
    H7.store.transact = orig;
    a(writes === 0, 'e9/B62: 跑遍全部对外口后 store **零事务**（实 ' + writes + '）');
    a(lsW.every(function (k) { return k === 'worldaxis_world_lab_settings_v1'; }),
      'e9/B63: localStorage 写只落在本模块的设置键上（实 ' + JSON.stringify(lsW) + '）');
    a(lsW.indexOf('worldaxis_world_lab_settings_v1') >= 0, 'e9/B63b: 反空转 —— 上面确实发生过写入');
    a(r.liveUnchanged === true, 'e9/B64: 而 liveUnchanged 是**那份被计数的 store** 跑出来的实测差（两件事互相印证）');
  }
  // 逐臂 run 的写入数落在**副本**上（不是 live）
  {
    const H8 = hostWith(src, LAB({ writes: 7 }));
    H8.worldLab.setSettings({ enabled: true });
    let live = 0;
    const orig = H8.store.transact;
    H8.store.transact = function () { live++; return orig.apply(this, arguments); };
    const r = H8.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
    H8.store.transact = orig;
    a(live === 0 && r.liveUnchanged === true, 'e9/B65: 副本事务数 >0 而 live 事务数 =0 —— 两者必须分列');
    a(H8.worldLab.arms().rows.every(function (x) { return x.writes === 7; }),
      'e9/B66: 逐臂如实回带**副本上的**事务数（不是把它折成 0）');
  }
  // 诊断面
  {
    const d = H.worldLab.diagnose();
    a(d.ok === true && typeof d.enabled === 'boolean', 'e9/B67: 诊断面报开关');
    a(typeof d.deps.rehearsal === 'boolean' && typeof d.deps.exec === 'boolean'
      && typeof d.deps.store === 'boolean' && typeof d.deps.worldBlueprint === 'boolean',
      'e9/B68: 诊断面逐项报依赖在不在');
    a(Array.isArray(d.unknowns) && d.unknowns.length >= 2, 'e9/B69: 诊断面报「不可比项的来源」');
    a(d.unknowns.some(function (x) { return x.source === 'rehearsal.KINDS' && x.why === 'ok'; }),
      'e9/B70: 词表来源那一项在合作时标 ok');
    a(typeof d.maxSteps === 'number' && typeof d.hasLab === 'boolean', 'e9/B71: 诊断面报步数上限与「有没有实验」');
    a(Array.isArray(d.arms), 'e9/B72: 诊断面报逐臂摘要');
    const H9 = hostWith(src, LAB());
    H9.worldLab.setSettings({ enabled: true });
    noLab(H9);
    const d9 = H9.worldLab.diagnose();
    a(d9.deps.rehearsal === false && d9.deps.exec === false, 'e9/B73: 执行面缺席时逐项报 false');
    a(d9.unknowns.some(function (x) { return x.source === 'rehearsal' && x.why === 'engine-absent'; }),
      'e9/B74: 缺席时不可比项来源如实点名 engine-absent');
    a(H9.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' }).reason === 'rehearsal-absent',
      'e9/B75: 隔离执行面缺席 ⇒ **不在 live 上跑**（如实拒收）');
  }
  // 台账
  {
    const s = H.worldLab.stat();
    a(typeof s.runs === 'number' && s.runs >= 1 && typeof s.arms === 'number', 'e9/B76: 台账报实验次数与臂数');
    a(s.armIds.join() === 'hold,a,b', 'e9/B77: 台账报三条路径名');
    a(s.faults && typeof s.faults === 'object', 'e9/B78: 台账带故障分桶');
    const before = H.worldLab.stat().refused;
    H.worldLab.parseSteps('nope|A|1', 6);   // 这条**不**进拒收（它是纯解析口，如实返回自己的结论）
    H.worldLab.run({ a: 'nope|A|1', b: 'wait|B|1' });
    a(H.worldLab.stat().refused > before, 'e9/B79: 路径非法时整次 run 拒收并进分桶（先全判再跑）');
    a(H.worldLab.stat().faults['unknown-kind'] >= 1, 'e9/B80: 分桶按**码**归因');
  }
  // 设置：越界夹回
  {
    a(H.worldLab.setSettings({ maxSteps: 999 }), 'e9/B81: setSettings 经 settingsBus 写入');
    a(H.worldLab.getSettings().maxSteps === 12, 'e9/B82: 越界值被夹回 12（bounds 声明在起作用）');
  }
}
// ── C 段：接线面 ───────────────────────────────────────────────────────
function runC(a) {
  const src = srcOf();
  a(src.indexOf('bounds: {') >= 0, 'e9/C1: 设置区间声明（settingsBus 越界夹回的前提）');
  a(src.indexOf('WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);') >= 0,
    'e9/C2: 设置键走 __settingsRegs 登记');
  a(src.indexOf('WA.registerModule') >= 0, 'e9/C3: 装载期自注册（模块图需要）');
  a(/module: 'worldLab'/.test(src), 'e9/C4: 设置登记的 module 与命名空间同名');
  a(/WA\.clock \? WA\.clock\.now/.test(src), 'e9/C5: 时间走决策时钟守卫（G20 时间源治理）');
  a(src.indexOf('WA.inputGuard.text') >= 0, 'e9/C6: 参数经 inputGuard 收口');
  // 它读到 store 的**唯一**一处在 liveDigest 里（且只读）
  a(src.indexOf('WA.store.get') >= 0, 'e9/C7: 起点摘要读 store（这是它读世界的唯一一处）');
  // 同宽的判据：把「真读一次」与「探测它在不在」分开数 ——
  //   `WA.store.get()`（带括号 = 真调了一次）只准一处；
  //   其余 `WA.store.get ===`/`typeof ...` 形态是诊断面的能力探测（它不读任何东西）。
  {
    const cf = codeNoStrOf(src);
    const calls = (cf.match(/WA\.store\.get\s*\(/g) || []).length;
    const probes = (cf.match(/WA\.store\.get\s*[=)]|typeof WA\.store\.get/g) || []).length;
    a(calls === 1, 'e9/C8: **真代码里**只有一处 WA.store.get() 真调用（读面单点 ⇒ 「零写」这条判据可逐字核）');
    a(probes >= 2, 'e9/C8b: 其余 WA.store 出现处都是能力探测（typeof 形态），不是读（实 ' + probes + '）');
  }
  a(src.indexOf('WA.rand') >= 0, 'e9/C9: 实验 id 走 rand（与全仓标识流同规）');
  // 每一条导出都有真消费方 —— 逐口与其消费方逐字配对（不是「有一处用到了」就算）
  {
    const pan = readOf('ui/panel.js');
    const pairs = [
      ['run', 'WA.worldLab.run'], ['arms', 'WA.worldLab.arms'], ['diff', 'WA.worldLab.diff'],
      ['discard', 'WA.worldLab.discard'], ['exportAs', 'WA.worldLab.exportAs'],
      ['catalog', 'WA.worldLab.catalog'], ['diagnose', 'WA.worldLab.diagnose'],
      ['stat', 'WA.worldLab.stat'], ['kinds', 'WA.worldLab.kinds'],
      ['parseSteps', 'WA.worldLab.parseSteps'], ['staleness', 'WA.worldLab.staleness']
    ];
    pairs.forEach(function (p) {
      a(pan.indexOf(p[1]) >= 0, 'e9/C10: ' + p[0] + ' 有真消费方（面板上的 ' + p[1] + '）');
    });
  }
  // 「先全判再跑」的结构：三臂的形状判定在 before = liveDigest() **之前**
  {
    const iParse = src.indexOf('const p = stepsOfArm(ARMS[i], cfg, o);');
    const iBefore = src.indexOf('const before = liveDigest();');
    a(iParse > 0 && iBefore > 0 && iParse < iBefore,
      'e9/C11: 形状判定排在取起点摘要**之前**（不合格就一次都不跑，不留下半套实验）');
  }
  // liveUnchanged 的两侧都在同一函数里（不在别处算一个常量回来）
  {
    const iBefore = src.indexOf('const before = liveDigest();');
    const iAfter = src.indexOf('const after = liveDigest();');
    const iCmp = src.indexOf('const liveUnchanged = !!(before.ok && after.ok');
    a(iBefore > 0 && iAfter > iBefore && iCmp > iAfter,
      'e9/C12: 跑前 / 跑后 / 比对三句同段且次序正确（实测差的结构本身就是判据）');
  }
  // 差异面的三态判定在**同一处**（不在别处再算一遍）
  a((src.match(/state = allSame \? 'same' : 'diff'/g) || []).length === 1,
    'e9/C13: same/diff 判定全文只写一处（两处必然漂移）');
  a((src.match(/'not-comparable'/g) || []).length >= 1, 'e9/C14: not-comparable 有现场');
}

// ── N 段：真源码破坏 + 两向自证 ─────────────────────────────────────────
function runN(a) {
  const SRC = srcOf();
  const CASES = [
    { n: 1, why: 'N1: 默认关被翻成开 ⇒ 「我没开它」与「它一直在跑实验」两件事合一',
      from: "  const DEF = { enabled: false, maxSteps: 6, armA: '', armB: '' };",
      to: "  const DEF = { enabled: true, maxSteps: 6, armA: '', armB: '' };",
      probe: function (__src) { const WA = hostWith(__src, LAB()); return WA.worldLab.getSettings().enabled; },
      want: false },
    { n: 2, why: 'N2: 关闭时让 run「静默成功」⇒ 关着它也在跑（就是这么来的）',
      from: "    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }\n    if (!WA.rehearsal",
      to: "    if (!WA.rehearsal",
      probe: function (__src) {
        const WA = hostWith(__src, LAB());
        WA.worldLab.setSettings({ enabled: false });
        return WA.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' }).reason;
      },
      want: 'disabled' },
    { n: 3, why: 'N3: live 前后摘要不再比对（liveUnchanged 成常量）⇒ 「零写入」从实测退化成声明',
      from: '    const liveUnchanged = !!(before.ok && after.ok && before.digest === after.digest);',
      to: '    const liveUnchanged = true;',
      probe: function (__src) {
        const WA = hostWith(__src, LAB());
        WA.worldLab.setSettings({ enabled: true });
        // 让 live 在实验**期间**真的变一下：用 run 桩顺手写一个键（模拟「本模块自己写了 live」）
        const orig = WA.rehearsal.run;
        WA.rehearsal.run = function (steps, o) { WA.store.transact(function (d) { d.__dirty = 1; }, 'x'); return orig(steps, o); };
        return WA.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' }).liveUnchanged;
      },
      want: false },
    { n: 4, why: 'N4: 过期判定不再比对 ⇒ 世界变了还在把旧结论当当前结论读',
      from: '    const match = (cur.digest === _lab.start.digest);',
      to: '    const match = true;',
      probe: function (__src) {
        const WA = hostWith(__src, LAB());
        WA.worldLab.setSettings({ enabled: true });
        WA.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
        touchWorld(WA, '__probe_marker');
        return WA.worldLab.staleness().reason;
      },
      want: 'stale-lab' },
    { n: 5, why: 'N5: 指纹缺失被折成「相同」⇒ 读不到指纹时也报 same（unknown 这一态被吃掉）',
      from: "    if (!known.length) fpState = 'unknown';",
      to: "    if (!known.length) fpState = 'same';",
      probe: function (__src) {
        const WA = hostWith(__src, LAB({ noFingerprint: true }));
        WA.worldLab.setSettings({ enabled: true });
        WA.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
        return WA.worldLab.diff().fingerprints.state;
      },
      want: 'unknown' },
    { n: 6, why: 'N6: 三臂全缺可比读数时回一个「全 same」⇒ 没有可比性可言却报「大家都一样」',
      from: "    if (!known.length && !knownRows.length) {\n      _stat.lastReason = 'not-comparable';",
      to: "    if (false) {\n      _stat.lastReason = 'not-comparable';",
      probe: function (__src) {
        const WA = hostWith(__src, LAB({ runRefuses: true }));
        WA.worldLab.setSettings({ enabled: true });
        WA.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
        const d = WA.worldLab.diff();
        return [d.ok, d.rows.filter(function (x) { return x.state === 'same'; }).length];
      },
      want: [false, 0] },
    { n: 7, why: 'N7: 逐行的 unknown 被折成 same ⇒ 「这一项读不到」从界面上消失',
      from: "      if (unknown === ARMS.length) state = 'unknown';",
      to: "      if (unknown === ARMS.length) state = 'same';",
      probe: function (__src) {
        const WA = hostWith(__src, LAB({ runRefuses: true }));
        WA.worldLab.setSettings({ enabled: true });
        WA.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
        return WA.worldLab.diff().rows[0].state;
      },
      want: 'unknown' },
    { n: 8, why: 'N8: 路径不再「先全判」⇒ 半套路径开跑，「哪几步生效了」只能靠读 trace 猜',
      from: "      if (!p.ok) { fault(p.reason); return Object.assign({ ok: false, arm: ARMS[i], cn: ARM_CN[ARMS[i]] }, p); }",
      to: "      if (false) { fault(p.reason); return Object.assign({ ok: false, arm: ARMS[i], cn: ARM_CN[ARMS[i]] }, p); }",
      probe: function (__src) {
        const WA = hostWith(__src, LAB());
        WA.worldLab.setSettings({ enabled: true });
        const r = WA.worldLab.run({ a: 'nope|A|1', b: 'wait|B|1' });
        return [r.ok, r.reason || '', r.liveBefore || null];
      },
      want: [false, 'unknown-kind', null] },
    { n: 9, why: 'N9: 隔离执行面缺席时改成在 live 上跑 ⇒ 「不在 live 上做实验」这条前提消失',
      from: "      fault('rehearsal-absent'); return { ok: false, reason: 'rehearsal-absent',",
      to: "      fault('rehearsal-absent'); if (false) return { ok: false, reason: 'rehearsal-absent',",
      probe: function (__src) {
        const WA = hostWith(__src, LAB());
        WA.worldLab.setSettings({ enabled: true });
        noLab(WA);
        const r = WA.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
        // 拒收得发生在**开跑之前**：`arm` 有值就说明它已经进了臂循环（= 在 live 上试）。
        return [r.reason || 'ran', r.arm || null];
      },
      want: ['rehearsal-absent', null] },
    { n: 10, why: 'N10: 步数上限不再生效 ⇒ maxSteps 从硬上限变成建议值',
      from: "    if (lines.length > cap) {\n      return { ok: false, reason: 'too-many-steps', got: lines.length, cap: cap,",
      to: "    if (false) {\n      return { ok: false, reason: 'too-many-steps', got: lines.length, cap: cap,",
      probe: function (__src) {
        const WA = hostWith(__src, LAB());
        WA.worldLab.setSettings({ enabled: true });
        const p = WA.worldLab.parseSteps('wait|A|1\nwait|A|2\nwait|A|3', 2);
        return [p.ok, p.reason || ''];
      },
      want: [false, 'too-many-steps'] },
    { n: 11, why: 'N11: 词表改成本模块自带一份副本 ⇒ 与 rehearsal.KINDS 悄悄分叉（不是报错，是分家）',
      from: "    if (!r || !Array.isArray(r.KINDS)) return null;   // null = 读不到（**不是**空词表）\n    return r.KINDS.slice();",
      to: "    return ['wait', 'reroute', 'notify'];",
      probe: function (__src) {
        const WA = hostWith(__src, LAB({ kinds: ['wait', 'reroute', 'notify', 'shout'] }));
        WA.worldLab.setSettings({ enabled: true });
        const k = WA.worldLab.kinds();
        return [k.length, k.indexOf('shout') >= 0];
      },
      want: [4, true] },
    { n: 12, why: 'N12: 词表读不到时给空数组（而不是 null）⇒ 「引擎缺席」与「一条动作都没有」被折成同一件事',
      from: "    if (!r || !Array.isArray(r.KINDS)) return null;   // null = 读不到（**不是**空词表）",
      to: "    if (!r || !Array.isArray(r.KINDS)) return [];   // null = 读不到（**不是**空词表）",
      probe: function (__src) {
        const WA = hostWith(__src, LAB());
        WA.worldLab.setSettings({ enabled: true });
        WA.rehearsal = undefined;
        const p = WA.worldLab.parseSteps('wait|A|1', 6);
        return [WA.worldLab.kinds() === null, p.reason];
      },
      want: [true, 'rehearsal-absent'] },
    { n: 13, why: 'N13: 数字 digest 不再被认（本版修掉的那一处回归）⇒ 三臂指纹恒被判缺失，指纹面永远是 unknown',
      from: "      if (typeof v === 'number' && isFinite(v)) return String(v);",
      to: "      if (false && typeof v === 'number' && isFinite(v)) return String(v);",
      probe: function (__src) {
        const WA = hostWith(__src, LAB({ strDigest: false }));
        WA.worldLab.setSettings({ enabled: true });
        WA.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
        return WA.worldLab.diff().fingerprints.state;
      },
      want: 'same' },
    { n: 14, why: 'N14: 副本上的事务数被折成 0 ⇒ 「实验里改了哪些」从逐臂读数里消失',
      from: '        writes: okArm ? (num(r.writes) || 0) : null,',
      to: '        writes: 0,',
      probe: function (__src) {
        const WA = hostWith(__src, LAB({ writes: 7 }));
        WA.worldLab.setSettings({ enabled: true });
        WA.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
        return WA.worldLab.arms().rows.map(function (x) { return x.writes; });
      },
      want: [7, 7, 7] },
    { n: 15, why: 'N15: 蓝图导出失败时仍报成功（把「导不出」折成「导出了一份空的」）',
      from: "      fault('export-failed');\n      return { ok: false, reason: 'export-failed', why: String((bp && bp.reason) || 'unknown') };",
      to: "      fault('export-failed');\n      return { ok: true, reason: 'export-failed', why: String((bp && bp.reason) || 'unknown') };",
      probe: function (__src) {
        const WA = hostWith(__src, LAB({ bpEmpty: true }));
        WA.worldLab.setSettings({ enabled: true });
        const r = WA.worldLab.exportAs('blueprint');
        return [r.ok, r.reason];
      },
      want: [false, 'export-failed'] },
    { n: 16, why: 'N16: 丢弃时不真清读数 ⇒ 丢弃成了「一句声明」，旧实验还能被当当前结论读',
      from: "    _lab = null;\n    if (had) _stat.discarded++;",
      to: "    if (had) _stat.discarded++;",
      probe: function (__src) {
        const WA = hostWith(__src, LAB());
        WA.worldLab.setSettings({ enabled: true });
        WA.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
        WA.worldLab.discard();
        return WA.worldLab.arms().ok;
      },
      want: false },
    { n: 17, why: 'N17: 起点摘要在三臂跑完**之后**才取 ⇒ 「同一份起点」这句话失去依据',
      from: '    const before = liveDigest();\n    const start = before.ok ? { keys: before.keys, chars: before.chars, digest: before.digest } : null;',
      to: '    const start = { keys: 1, chars: 1, digest: \'00000000\' };\n    const before = liveDigest();',
      probe: function (__src) {
        const WA = hostWith(__src, LAB());
        WA.worldLab.setSettings({ enabled: true });
        const r = WA.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
        // 两向同形：起点摘要得是**跑前**那份 live 摘要（被改成写死的哨值就报 false）
        return r.start.digest === r.liveBefore;
      },
      want: true }
  ];
  CASES.forEach(function (cs) {
    const hits = SRC.split(cs.from).length - 1;
    a(hits === 1, 'e9/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = SRC.split(cs.from).join(cs.to);
    a(broken !== SRC, 'e9/Na(' + cs.n + '): 破坏真的改动了源码文本');
    const same = function (x, y) { return JSON.stringify(x) === JSON.stringify(y); };
    let okSet = null;
    try { okSet = cs.probe(SRC); } catch (e) { okSet = 'THREW ' + e.message; }
    a(same(okSet, cs.want), 'e9/Nb(' + cs.n + '): 原版上同款判据为真（实 ' + JSON.stringify(okSet) + '）');
    let badSet = null;
    try { badSet = cs.probe(broken); } catch (e) { badSet = 'THREW ' + e.message; }
    a(!same(badSet, cs.want), 'e9/Nc(' + cs.n + '): 破坏副本上同款判据现形（实 ' + JSON.stringify(badSet) + '）');
    a(String(cs.probe).indexOf(cs.to.slice(0, 24)) < 0, 'e9/Nd(' + cs.n + '): 判据不引用破坏后的锚点串（H5 纯度）');
    const shown = cs.from.split('\n')[0];
    a(!/^\s*(\/\/|\*|\/\*)/.test(shown), 'e9/Ne(' + cs.n + '): 锚点落在真代码上（不是注释里的说明文字）');
  });
  // 反空转：未破坏时读口真出内容（不是空集上恒真）
  {
    const host = hostWith(SRC, LAB());
    host.worldLab.setSettings({ enabled: true });
    host.worldLab.run({ a: 'wait|A|1', b: 'wait|B|1' });
    a(host.worldLab.catalog().arms.length === 3 && host.worldLab.diff().rows.length === 8
      && host.worldLab.arms().rows.length === 3,
      'e9/N9: 反空转 —— 未破坏时读口真出内容（不是空集上恒真）');
  }
  // H6 工具两向自证
  {
    const S = 'const A = 1;\nconst B = 2;\n';
    const hit = function (src, from, to) {
      const n = src.split(from).length - 1;
      if (n !== 1) throw new Error('anchor-not-unique:' + n);
      return src.split(from).join(to);
    };
    let threw = false;
    try { hit(S, 'const ZZZ = 9;', 'x'); } catch (e) { threw = true; }
    a(threw, 'e9/N10: 锚点不存在时工具**必须抛**（不许静默返回原串）');
    threw = false;
    try { hit('const A = 1;\nconst A = 1;\n', 'const A = 1;', 'x'); } catch (e) { threw = true; }
    a(threw, 'e9/N10b: 锚点不唯一时工具**必须抛**（改到哪一处成了未知）');
    a(hit(S, 'const A = 1;', 'const A = 2;') !== S, 'e9/N10c: 破坏可观测地改动了文本');
    a(hit(S, 'const A = 1;', 'const A = 2;').indexOf('const A = 2;') >= 0, 'e9/N10d: 破坏结果**真含**替换后的文本');
  }
}

// ── 汇总 ───────────────────────────────────────────────────────────────
const __a = function (cond, name) { a(cond, name); };
runA(__a); runB(__a); runC(__a); runN(__a);
console.log('\nE9 s3-b3-e9-v2188 ' + pass + ' / 失败 ' + fail);
if (fail) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }