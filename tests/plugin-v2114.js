'use strict';
/**
 * v2.114.0 专锁：计划二 #56 生命周期钩子 + #68 进程内白名单沙箱
 * 四段：A 静态契约 / B 运行时 / C 不变式 / N 真源码破坏
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
function srcOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

const ANCHOR_DENY = "err.code = 'sandbox-denied'";
const ANCHOR_BLOCK = "reason: 'plugin-blocked'";

function host() {
  const ctx = { console: console, Date: Date, Object: Object, Array: Array, Error: Error, JSON: JSON, Math: Math, setTimeout: setTimeout, clearTimeout: clearTimeout };
  ctx.window = ctx;
  ctx.WorldAxis = {};
  vm.createContext(ctx);
  const files = ['core/clock.js', 'core/input-guard.js', 'core/sandbox.js', 'core/plugin.js'];
  files.forEach(function (rel) {
    vm.runInContext(srcOf(rel), ctx, { filename: rel });
  });
  ctx.WorldAxis.log = function () {};
  return ctx.WorldAxis;
}

function runA(assert) {
  const plug = srcOf('core/plugin.js');
  const sand = srcOf('core/sandbox.js');
  const store = srcOf('core/store.js');
  const idx = srcOf('index.js');
  const panel = srcOf('ui/panel.js');
  const diag = srcOf('engines/tool-diag.js');
  assert(plug.indexOf("HOOKS = ['init', 'beforeSave', 'afterLoad', 'onRender']") > 0, 'A: 四钩子封闭集合');
  assert(sand.indexOf("Access denied") > 0 && sand.indexOf(ANCHOR_DENY) > 0, 'A: 沙箱拒收锚点恰在热路径');
  assert(store.indexOf("plugin.fire('beforeSave'") > 0, 'A: save 真消费 beforeSave');
  assert(store.indexOf("plugin.fire('afterLoad'") > 0, 'A: init 真消费 afterLoad');
  assert(idx.indexOf("'core/sandbox.js'") > 0 && idx.indexOf("'core/plugin.js'") > 0, 'A: LOAD_ORDER 登记');
  assert(panel.indexOf('id="wa-pl-reg"') > 0 && diag.indexOf("secPlugin") > 0, 'A: 面板+诊断真消费方');
  assert(plug.indexOf('plugin-market') < 0 && plug.indexOf('REST') > 0, 'A: 文件头声明不做 REST/市场（注释里点名）');
  // v2.114.0 收口：plugin.unregister 有真产品消费方（面板 #wa-pl-unreg 卸载按钮，
  //   注册的逆操作）＋ 见证收尾（reject-v2780）。收口期误删过一次，现场立刻
  //   以「见证缺失：plugin-blocked」＋「新增死导出」两面现形。
  assert(plug.indexOf('function unregister(') > 0 && panel.indexOf("on('#wa-pl-unreg'") > 0,
    'A: plugin.unregister 在位且有真消费方（面板卸载按钮 + reject-v2780 见证收尾）');
  assert(!/\breset\s*:\s*function/.test(plug) && !/\breset\s*:\s*function/.test(sand),
    'A: plugin.reset / sandbox.reset 出口已摘除（能力未接线 ⇒ 当场删，不登记死面）');
  assert(!/freezeApi\s*:/.test(sand) && !/freezeApi\s*:/.test(plug),
    'A: sandbox.freezeApi 过度导出已摘除（白名单冻结只该是 run 的内部步骤，不外露旁路）');
  assert(sand.indexOf('stat: function ()') > 0 && diag.indexOf('WA.sandbox.stat') > 0,
    'A: sandbox.stat 保留（有真消费方：tool-diag 的 secPlugin 读 runs/denied/timeouts）');
}

function runB(assert) {
  const WA = host();
  const r0 = WA.plugin.register({ name: 'XYZ', version: '1', hooks: {
    beforeSave: function () { this.log('intercepted save'); return { ok: true }; }
  }});
  assert(r0.ok === true && r0.name === 'XYZ', 'B: 注册成功');
  const fire = WA.plugin.fire('beforeSave', { chatId: 'c1' });
  assert(fire.ok === true, 'B: beforeSave 放行');
  const st = WA.plugin.stat();
  assert(st.plugins === 1 && st.fires >= 1, 'B: 至少触发过 beforeSave');
  const denyFs = WA.sandbox.run(function () { return this.require; }, {}, []);
  assert(denyFs.ok === false && denyFs.reason === 'Access denied', 'B: require 拒收 Access denied');
  const block = WA.plugin.register({ name: 'blocker', hooks: {
    beforeSave: function () { return { ok: false, reason: 'nope' }; }
  }});
  assert(block.ok, 'B: blocker 注册');
  const br = WA.plugin.fire('beforeSave', {});
  assert(br.ok === false && br.reason === 'plugin-blocked', 'B: 钩子否决变成 plugin-blocked');
}

function runC(assert) {
  const WA = host();
  WA.plugin.register({ name: 'mut', hooks: {
    beforeSave: function (ctx) {
      if (ctx && ctx.snap) ctx.snap.hacked = 1;
      return { ok: true };
    }
  }});
  const snap = Object.freeze({ meta: { a: 1 } });
  let threw = false;
  try { WA.plugin.fire('beforeSave', { snap: snap }); } catch (e) { threw = true; }
  assert(snap.hacked === undefined, 'C: 冻结快照不被钩子改写');
  const thrown = WA.plugin.register({ name: 'boom', hooks: {
    beforeSave: function () { throw new Error('x'); }
  }});
  const fr = WA.plugin.fire('beforeSave', {});
  assert(fr.ok === true, 'C: 钩子抛错不拦保存');
  assert(WA.plugin.stat().hookThrow >= 1, 'C: 抛错进 hookThrow');
}

function runN(assert) {
  const nDeny = srcOf('core/sandbox.js').split(ANCHOR_DENY).length - 1;
  const nBlock = srcOf('core/plugin.js').split(ANCHOR_BLOCK).length - 1;
  assert(nDeny === 1, 'N0: sandbox-denied 锚点恰 1 次，实=' + nDeny);
  assert(nBlock === 1, 'N0: plugin-blocked 锚点恰 1 次，实=' + nBlock);
  const broken = srcOf('core/sandbox.js').replace(ANCHOR_DENY, "err.code = 'sandbox-open'");
  assert(broken.indexOf(ANCHOR_DENY) < 0, 'N5: 破坏替换掉锚点');
  const ctx = { console: console, Date: Date, Object: Object, Array: Array, Error: Error, JSON: JSON };
  ctx.window = ctx; ctx.WorldAxis = {};
  vm.createContext(ctx);
  vm.runInContext(broken, ctx, { filename: 'sandbox-broken.js' });
  const r = ctx.WorldAxis.sandbox.run(function () { return this.require; }, {}, []);
  assert(!(r.ok === false && r.reason === 'Access denied'), 'N: 破坏后 require 不再按 sandbox-denied 归类');
}

module.exports = { runA, runB, runC, runN, srcOf, ANCHOR_DENY, ANCHOR_BLOCK };