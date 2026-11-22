// tests/choice-board-v2325.js — 待选按钮引擎专锁（缝合 -Galgame 呈现半边）
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const BASE = path.join(__dirname, '..');
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const li = runSrc.indexOf('const LOAD = ['); const lj = runSrc.indexOf('];', li);
const LOAD = vm.runInNewContext('(' + runSrc.slice(runSrc.indexOf('[', li), lj + 1) + ')');
const ctx = vm.createContext(global);
for (const rel of LOAD) vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
const WA = global.WorldAxis || ctx.WorldAxis;
const CB = WA.choiceBoard;
const SC = WA.storyChoice;
const domModule = require(path.join(BASE, 'tests/ui-dom.js'));
const doc = domModule.makeDoc(WA);
WA.mainDoc = doc;

// 启用依赖模块
['storyChoice', 'branchTree', 'rehearsal', 'commit', 'choiceBoard'].forEach(function (m) {
  if (WA[m] && WA[m].setSettings) WA[m].setSettings({ enabled: true });
});

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.error('  ✗ ' + name + ': ' + (e && e.stack ? e.stack : e)); }
}

console.log('=== choice-board-v2325: 正文待选按钮闭环 ===');

t('T1: 基础导出与单例声明', function () {
  assert.ok(CB, 'choiceBoard 挂在 WA 上');
  assert.strictEqual(CB.VERSION, '2.325.0');
  assert.strictEqual(typeof CB.mount, 'function');
  assert.strictEqual(typeof CB.choose, 'function');
  assert.strictEqual(typeof CB.board, 'function');
  assert.strictEqual(typeof CB.unmount, 'function');
});

t('T2: storyChoice 登记后，board() 能读出完整待选内容', function () {
  CB.reset();
  const pres = SC.present({
    round: 1,
    prompt: '十字路口如何抉择？',
    options: [
      { label: '向左走密林', ops: [{ type: 'add_fact', path: 'geo.left', value: 1 }] },
      { label: '向右走大道', ops: [{ type: 'add_fact', path: 'geo.right', value: 1 }] }
    ]
  });
  assert.ok(pres && pres.ok, 'present 成功: ' + JSON.stringify(pres));
  const b = CB.board();
  assert.ok(b.ok, 'board 读取成功: ' + JSON.stringify(b));
  assert.strictEqual(b.points.length, 1);
  assert.strictEqual(b.points[0].prompt, '十字路口如何抉择？');
  assert.strictEqual(b.points[0].options.length, 2);
  assert.strictEqual(b.points[0].options[0].label, '向左走密林');
  assert.strictEqual(b.points[0].options[1].label, '向右走大道');
});

t('T3: mount() 在给定容器上挂载 dock 与按钮', function () {
  const container = doc.createElement('div');
  container.className = 'mes';
  const res = CB.mount(container);
  assert.ok(res.ok, 'mount 成功: ' + JSON.stringify(res));
  assert.strictEqual(res.mounted, 1);
  const docks = container.querySelectorAll('.' + CB.DOCK_CLS);
  assert.strictEqual(docks.length, 1, '存在一个 dock');
  const btns = container.querySelectorAll('.' + CB.BTN_CLS);
  assert.strictEqual(btns.length, 2, '生成两个选项按钮');
  assert.strictEqual(btns[0].textContent, '向左走密林');
});

t('T4: 点击按钮触发 choose() 并完成确认，选项从 pending 中核销', function () {
  const container = doc.createElement('div');
  container.className = 'mes';
  CB.mount(container);
  const btns = container.querySelectorAll('.' + CB.BTN_CLS);
  btns[0].click();
  const st = CB.stat();
  assert.strictEqual(st.clicks, 1);
  assert.strictEqual(st.confirms, 1);
  assert.strictEqual(st.chosen, 1);
  const bAfter = CB.board();
  assert.strictEqual(bAfter.points.length, 0, '已选点不再出现在 pending');
});

t('T5: unmount() 干净移除 DOM 并清空状态', function () {
  const container = doc.createElement('div');
  container.className = 'mes';
  SC.present({
    round: 2,
    prompt: '是否过桥？',
    options: [{ label: '过桥' }, { label: '回营' }]
  });
  CB.mount(container);
  assert.strictEqual(container.querySelectorAll('.' + CB.DOCK_CLS).length, 1);
  CB.unmount();
  assert.strictEqual(container.querySelectorAll('.' + CB.DOCK_CLS).length, 0, 'DOM 清理完毕');
});

t('T6: 禁用开关（enabled: false）拦截 mount', function () {
  CB.setSettings({ enabled: false });
  const container = doc.createElement('div');
  container.className = 'mes';
  const res = CB.mount(container);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.reason, 'disabled');
  CB.setSettings({ enabled: true });
});

console.log('---');
console.log('通过: ' + pass + ' / 失败: ' + fail);
process.exit(fail ? 1 : 0);