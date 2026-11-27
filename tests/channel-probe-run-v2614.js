// tests/channel-probe-run-v2614.js — R289 人工探针「接线面」专锁（v2.614.0）
//   病：引擎/账本/读数面/设置面全齐，buildProbe/judgeProbe 在产品面零调用点 —— 就差用户点一下。
//   本锁钉死四件事：① runOnce 是真发一次的唯一入口且经 apiRouter；② 三态 unknown 绝不折叠、
//   不进分母；③ 不进世界/正文/主判据；④ 面板那枚按钮真的接到了 runOnce（渲染 + 绑定同在）。
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const BASE = path.join(__dirname, '..');
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const li = runSrc.indexOf('const LOAD = ['); const lj = runSrc.indexOf('];', li);
const LOAD = vm.runInNewContext('(' + runSrc.slice(runSrc.indexOf('[', li), lj + 1) + ')');
const ctx = vm.createContext(global);
for (const rel of LOAD) vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
const WA = global.WorldAxis || ctx.WorldAxis;
const P = WA.channelProbe;
const PANEL = fs.readFileSync(path.join(BASE, 'ui/panel.js'), 'utf8');
const ENG = fs.readFileSync(path.join(BASE, 'engines/channel-probe.js'), 'utf8');

let pass = 0, fail = 0;
function codeOnly(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'); }
const B = 'https://probe.example.com/v1';
function echoAll(ch, msgs) { return msgs[0].content.split('\n').slice(1).join('\n'); }
function echoFew(ch, msgs) { return msgs[0].content.split('\n').slice(1, 3).join('\n'); }
function boom(kind) { return async function () { const e = new Error('x'); e.kind = kind; throw e; }; }
function n() { return P.ledgerRow(B).n; }
async function at(name, fn) {
  try { await fn(); pass++; console.log('  OK ' + name); }
  catch (e) { fail++; console.error('  NG ' + name + ': ' + (e && e.message ? e.message : e)); }
}

(async function () {
  console.log('=== channel-probe-run-v2614: 人工探针接线面专锁 ===');

  await at('A1: 引擎版本 2.327.0 与 runOnce 出口，默认传输取 apiRouter.call', function () {
    assert.strictEqual(P.VERSION, '2.327.0');
    assert.strictEqual(typeof P.runOnce, 'function');
    const src = codeOnly(ENG);
    assert.ok(/WA\.apiRouter\.call/.test(src), '默认传输口是 core/api-router 唯一出口');
    assert.strictEqual(/\bfetch\s*\(/.test(src), false, '引擎里零裸 fetch');
    assert.strictEqual(/XMLHttpRequest/.test(src), false);
    assert.strictEqual(/setInterval|setTimeout/.test(src), false, '零定时器');
  });

  await at('A2: 静态纪律 —— 探针不进正文、不改身份面主判据、面板真接按钮', function () {
    const src = codeOnly(ENG);
    assert.strictEqual(/applyInjections/.test(src), false, '引擎不碰注入链');
    assert.ok(/CP\.runOnce/.test(PANEL), '面板按钮真接到 runOnce');
    assert.ok(/wa-ch-probe/.test(PANEL), '渲染那枚按钮');
    assert.ok(src.indexOf('modelReceipt') < 0, '引擎不改 model-receipt 判据');
  });

  P.setSettings({ enabled: true, itemsPerProbe: 8, passLine: 0.75 });

  await at('B1: 全对 -> inconclusive（抄对不证明身份），记一笔', async function () {
    const before = n();
    const r = await P.runOnce({ channel: 'inference', base: B, call: echoAll });
    assert.strictEqual(r.status, 'inconclusive');
    assert.strictEqual(r.hit, 8);
    assert.strictEqual(r.recorded, true);
    assert.strictEqual(n(), before + 1);
    assert.ok(/不能证明/.test(r.conclusion));
  });

  await at('B2: 抄错 -> weak（可证伪），记一笔', async function () {
    const before = n();
    const r = await P.runOnce({ channel: 'inference', base: B, call: echoFew });
    assert.strictEqual(r.status, 'weak');
    assert.strictEqual(r.hit, 2);
    assert.strictEqual(n(), before + 1);
  });

  await at('B3: 失败/空回/截断一律 unknown —— 不折叠、不进分母', async function () {
    const before = n();
    const cases = ['timeout', 'auth', 'rate-limit', 'not-configured', 'vault-not-ready', 'output-limit'];
    for (const k of cases) {
      const r = await P.runOnce({ channel: 'inference', base: B, call: boom(k) });
      assert.strictEqual(r.status, 'unknown', k);
      assert.ok(/request-failed:/.test(r.reason), k);
      assert.strictEqual(r.recorded, false, k);
    }
    const emp = await P.runOnce({ channel: 'inference', base: B, call: async () => '' });
    assert.strictEqual(emp.status, 'unknown');
    assert.strictEqual(emp.reason, 'empty-reply');
    assert.strictEqual(n(), before, 'unknown 一次都没进分母');
  });

  await at('B4: 无 base / 关闭 / busy 都答 unknown', async function () {
    const rb = await P.runOnce({ channel: 'inference', base: '', call: echoAll });
    assert.strictEqual(rb.status, 'unknown');
    P.setSettings({ enabled: false });
    const rd = await P.runOnce({ channel: 'inference', base: B, call: echoAll });
    assert.strictEqual(rd.reason, 'probe-disabled');
    P.setSettings({ enabled: true });
    const slow = async () => { await new Promise(r => setTimeout(r, 40)); return 'x'; };
    const p1 = P.runOnce({ channel: 'inference', base: B, call: slow });
    const rbz = await P.runOnce({ channel: 'inference', base: B, call: slow });
    assert.strictEqual(rbz.status, 'unknown');
    assert.strictEqual(rbz.reason, 'busy');
    await p1;
  });

  await at('B5: diagnose 分得开「读失败」与「没结论」，并暴露上次结论', function () {
    const d = P.diagnose();
    assert.strictEqual(typeof d.readFail, 'number');
    assert.ok(d.ledger === 'ok' || d.ledger === 'unreadable');
    assert.ok(d.last && d.last.status, '上次结论在册');
    assert.ok(d.runs && typeof d.runs.built === 'number');
  });

  await at('C1: 账本按 base 归并、换尾斜杠不分家；导出无 key', function () {
    assert.strictEqual(P.channelKey(B), P.channelKey(B + '/'));
    const txt = P.exportText(B);
    assert.ok(txt.indexOf('WA-PROBE:') > 0);
    assert.ok(txt.indexOf('apiKey') < 0 && txt.indexOf('sk-') < 0);
  });

  console.log('---');
  console.log('通过: ' + pass + ' / 失败: ' + fail);
  if (fail) process.exitCode = 1;
})();
