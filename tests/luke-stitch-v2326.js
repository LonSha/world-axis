// tests/luke-stitch-v2326.js — 缝合「卢克之光 / Anti-Route 8.31」三引擎专锁
//   A 叙述层镜片：默认 off / 三档枚举 / 幂等注入 / 剥旧 / 不猜名字
//   B 回包守卫：五级判定 / 安全拒绝不续写 / 冷却与轮次上限 / 不自动发请求
//   C 渠道探针：只产 body 不发请求 / 非对称判据 / 逐字匹配 / 账本归并 / Wilson / 无 key
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const BASE = path.join(__dirname, '..');
require(path.join(BASE, 'tests/mock.js'));
const runSrc = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
const li = runSrc.indexOf('const LOAD = ['); const lj = runSrc.indexOf('];', li);
const LOAD = vm.runInNewContext('(' + runSrc.slice(runSrc.indexOf('[', li), lj + 1) + ')');
const ctx = vm.createContext(global);
for (const rel of LOAD) vm.runInContext(fs.readFileSync(path.join(BASE, rel), 'utf8'), ctx, { filename: rel });
const WA = global.WorldAxis || ctx.WorldAxis;
const LENS = WA.narrativeLens, GUARD = WA.replyGuard, PROBE = WA.channelProbe;

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.error('  ✗ ' + name + ': ' + (e && e.stack ? e.stack : e)); }
}
/** 静态自证只看可执行代码：先剥掉块注释与行注释，否则「绝不调 apiRouter.call」
 *  这类纪律说明会被当成真实调用，假绿地炸掉测试自己。 */
function codeOnly(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

console.log('=== luke-stitch-v2326: 卢克之光三引擎缝合专锁 ===');

// ─────────────────────────── A 叙述层镜片 ───────────────────────────
t('A1: 三引擎装载且版本/出口齐备', function () {
  assert.ok(LENS && GUARD && PROBE, '三个命名空间都在 WA 上');
  assert.strictEqual(LENS.VERSION, '2.326.0');
  assert.strictEqual(GUARD.VERSION, '2.326.0');
  assert.strictEqual(PROBE.VERSION, '2.326.0');
  ['getSettings', 'setSettings', 'lensBody', 'lensStrip', 'lensApply', 'buildBlock', 'diagnose', 'reset']
    .forEach(function (k) { assert.strictEqual(typeof LENS[k], 'function', 'LENS.' + k); });
  ['judge', 'noteRetry', 'unlock', 'diagnose'].forEach(function (k) { assert.strictEqual(typeof GUARD[k], 'function', 'GUARD.' + k); });
  ['buildProbe', 'judgeProbe', 'record', 'channelStat', 'wilson', 'exportText', 'spark']
    .forEach(function (k) { assert.strictEqual(typeof PROBE[k], 'function', 'PROBE.' + k); });
});

t('A2: 默认关闭（改文风的开关不默认替玩家做主）', function () {
  LENS.reset();
  LENS.setSettings({ enabled: false, know: 'off', charm: 'off', userName: '' });
  const c = LENS.getSettings();
  assert.strictEqual(c.enabled, false);
  assert.strictEqual(c.know, 'off');
  assert.strictEqual(c.charm, 'off');
  assert.strictEqual(LENS.buildBlock(), '', '关闭时注入链逐字无变化');
  assert.strictEqual(LENS.lensBody(), '');
  assert.strictEqual(LENS.label(), '关');
  assert.strictEqual(LENS.diagnose().status, 'disabled');
});

t('A3: 档位枚举白名单（非法值回落 off，不静默接受）', function () {
  LENS.setSettings({ know: 'ultra', charm: 'full' });
  const c = LENS.getSettings();
  assert.strictEqual(c.know, 'off', '非法档被 settingsBus 枚举夹回 off');
  assert.strictEqual(c.charm, 'full');
  assert.strictEqual(LENS.pick('nope'), 'off');
  assert.strictEqual(LENS.tagOf('full'), '强');
  assert.strictEqual(LENS.nextTier('off'), 'lite');
  assert.strictEqual(LENS.nextTier('full'), 'off');
});

t('A4: 全档文案含硬约束，且把 <user> 换成显式名而非从正文猜', function () {
  LENS.setSettings({ enabled: true, know: 'full', charm: 'full', userName: '林克' });
  const b = LENS.lensBody();
  assert.ok(b.indexOf(LENS.OPEN) === 0, '带开标记');
  assert.ok(b.indexOf(LENS.CLOSE) > 0, '带闭标记');
  assert.ok(b.indexOf('他早就知道') > 0, '防全知禁用句式在位');
  assert.ok(b.indexOf('没有必胜结局') > 0, '去媚基调在位');
  assert.ok(b.indexOf('<user>') < 0, '尖括号不留在提示里');
  assert.ok(b.indexOf('林克') > 0, '用的是显式配置名');
  assert.strictEqual(LENS.label(), '防全知强+去媚强');
  assert.ok(LENS.tokens() > 100, '粗估 token 有量级');
  assert.strictEqual(LENS.buildBlock(), b, 'buildBlock 与 lensBody 同源');
});

t('A5: 幂等——注入 N 次与注入 1 次逐字相同（不累积、不多空行）', function () {
  const base = '玩家推门进屋。\n屋里有三个人。';
  const once = LENS.lensApply(base);
  assert.strictEqual(once.ok, true);
  assert.strictEqual(once.changed, true);
  const twice = LENS.lensApply(once.text);
  const thrice = LENS.lensApply(twice.text);
  assert.strictEqual(twice.text, once.text, '第二次不再改动');
  assert.strictEqual(thrice.text, once.text, '第三次不再改动');
  assert.strictEqual(twice.changed, false);
  assert.ok(once.text.indexOf(base) === 0, '原文一字不动地保留在前面');
  assert.strictEqual((once.text.match(/〔WA-LENS/g) || []).length, 1, '只有一块');
});

t('A6: 切档先剥旧块；两维全关时只剥不贴（不留残片）', function () {
  const once = LENS.lensApply('正文第一行。').text;
  LENS.setSettings({ know: 'lite', charm: 'off' });
  const rel = LENS.lensApply(once);
  assert.ok(rel.text.indexOf('【视角受限】') > 0, '换成了轻档文案');
  assert.ok(rel.text.indexOf('【本回合铁律') < 0, '强档旧块已被剥掉');
  assert.strictEqual((rel.text.match(/〔WA-LENS/g) || []).length, 1);
  LENS.setSettings({ know: 'off', charm: 'off' });
  const cleared = LENS.lensApply(rel.text);
  assert.strictEqual(cleared.text, '正文第一行。', '两维全关后只剩原文');
  assert.strictEqual(cleared.changed, true);
});

t('A7: 失败安全——无标记文本原样返回，绝不猜着删', function () {
  const s = '〔别的块〕普通正文\n第二行';
  assert.strictEqual(LENS.lensStrip(s), s);
  assert.strictEqual(LENS.lensStrip(''), '');
  assert.strictEqual(LENS.lensStrip(null), '');
});

t('A8: 不猜玩家名（拿不到宿主名就退回「你」）', function () {
  LENS.setSettings({ userName: '', know: 'lite', charm: 'off' });
  const b = LENS.lensBody();
  assert.ok(b.indexOf('你') > 0 || b.indexOf('<user>') < 0, '不把尖括号留给渠道吞');
  assert.strictEqual(b.indexOf('<user>'), -1);
});

// ─────────────────────────── B 回包守卫 ───────────────────────────
t('B1: 正常回包判 ok，不给任何建议', function () {
  GUARD.reset();
  GUARD.setSettings({ enabled: true, minChars: 12, relockMs: 90000, maxRetryPerRound: 1 });
  const r = GUARD.judge({ text: '他推开门，屋里的灯还亮着，桌上有半杯冷茶。', roundKey: 'r1' });
  assert.strictEqual(r.code, 'ok');
  assert.strictEqual(r.suggest, 'none');
  assert.strictEqual(r.patch, null);
});

t('B2: 五级判定各自分离（空回 / 截断 / 拒答 / 安全 / 跳过）', function () {
  const e = GUARD.judge({ text: '', roundKey: 'r2' });
  assert.strictEqual(e.code, 'empty');
  assert.strictEqual(e.suggest, 'retry-once', '空回只建议补一次');
  assert.ok(e.patch && e.patch.tail, '补写素材随建议给出，但不代发');

  const tr = GUARD.judge({ text: '半截正文', finish: 'length', roundKey: 'r3' });
  assert.strictEqual(tr.code, 'truncated');
  assert.strictEqual(tr.suggest, 'raise-max-tokens', '截断该抬上限，不是再问一次');

  const rf = GUARD.judge({ text: '很抱歉，我无法协助完成这段内容。', roundKey: 'r4' });
  assert.strictEqual(rf.code, 'refused');

  const sf = GUARD.judge({ text: '根据内容政策，此请求不适宜生成。', roundKey: 'r5' });
  assert.strictEqual(sf.code, 'safety');
  assert.strictEqual(sf.suggest, 'switch-channel', '安全层硬拒绝绝不续写');

  const sk = GUARD.judge({ text: '【Reply directly】正常长正文', roundKey: 'r6' });
  assert.strictEqual(sk.code, 'skipped', '已有框架自带标记则整段跳过');
  assert.strictEqual(sk.reason, 'preset-owned');
});

t('B3: 安全词在长正文里是剧情，不误判（短回包才判）', function () {
  const long = '他提到安全策略时压低了声音，'.repeat(30) + '桌上摊着旧地图。';
  const r = GUARD.judge({ text: long, roundKey: 'r7' });
  assert.notStrictEqual(r.code, 'safety');
  assert.strictEqual(r.code, 'ok');
});

t('B4: 冷却锁与轮次上限——不连环补（防雪崩）', function () {
  GUARD.reset();
  GUARD.setSettings({ enabled: true, minChars: 12, relockMs: 90000, maxRetryPerRound: 1 });
  const r1 = GUARD.judge({ text: '', roundKey: 'rx' });
  assert.strictEqual(r1.suggest, 'retry-once');
  GUARD.noteRetry(false);                       // 调用方真的补过一次
  const r2 = GUARD.judge({ text: '', roundKey: 'rx' });
  assert.strictEqual(r2.suggest, 'none', '自补后 90 秒内不再建议');
  assert.ok(/relocked/.test(r2.reason));
  GUARD.unlock();
  const r3 = GUARD.judge({ text: '', roundKey: 'rx' });
  assert.strictEqual(r3.suggest, 'none', '解锁后仍受同一轮 1 次上限约束');
  assert.ok(/round-cap/.test(r3.reason));
  const r4 = GUARD.judge({ text: '', roundKey: 'new-round' });
  assert.strictEqual(r4.suggest, 'retry-once', '新一轮重新给一次机会');
});

t('B5: 关闭开关一律 skipped；异常输入落 reason 不假装正常', function () {
  GUARD.setSettings({ enabled: false });
  const r = GUARD.judge({ text: '', roundKey: 'r8' });
  assert.strictEqual(r.code, 'skipped');
  assert.strictEqual(r.reason, 'guard-disabled');
  GUARD.setSettings({ enabled: true });
  const bad = GUARD.judge({ get text() { throw new Error('boom'); }, roundKey: 'r9' });
  assert.strictEqual(bad.reason, 'judge-threw', '异常不静默吞');
});

t('B6: 不 hook fetch、不自动发请求（源码静态自证，只看可执行代码）', function () {
  const src = codeOnly(fs.readFileSync(path.join(BASE, 'engines/reply-guard.js'), 'utf8'));
  assert.strictEqual(/\bfetch\s*\(/.test(src), false, '零 fetch 调用');
  assert.strictEqual(/XMLHttpRequest/.test(src), false);
  assert.strictEqual(/apiRouter\s*\.\s*call/.test(src), false, '不替调用方发第二次请求');
  assert.strictEqual(/origFetch|hooked/.test(src), false);
});

// ─────────────────────────── C 渠道探针 ───────────────────────────
t('C1: 默认关闭；buildProbe 只产 body 且零网络副作用', function () {
  PROBE.reset();
  PROBE.setSettings({ enabled: false, itemsPerProbe: 8, passLine: 0.75, maxLedger: 40 });
  const off = PROBE.buildProbe();
  assert.strictEqual(off.ok, false);
  assert.strictEqual(off.reason, 'probe-disabled');
  PROBE.setSettings({ enabled: true });
  const p = PROBE.buildProbe();
  assert.strictEqual(p.ok, true);
  assert.strictEqual(p.items.length, 8);
  assert.strictEqual(p.messages.length, 1);
  assert.strictEqual(p.messages[0].role, 'user');
  assert.ok(p.instruction.indexOf('逐字抄回') >= 0);
  assert.ok(p.messages[0].content.indexOf(p.items[0]) > 0);
  const src = codeOnly(fs.readFileSync(path.join(BASE, 'engines/channel-probe.js'), 'utf8'));
  assert.strictEqual(/\bfetch\s*\(/.test(src), false, '零 fetch');
  assert.strictEqual(/XMLHttpRequest/.test(src), false);
  assert.strictEqual(/setTimeout|setInterval/.test(src), false, '无定时器');
});

t('C2: 轮换——连续两轮不重复同一批，跑完一轮才重置', function () {
  PROBE.reset();
  PROBE.setSettings({ enabled: true, itemsPerProbe: 8 });
  const a = PROBE.buildProbe().items.join('|');
  const b = PROBE.buildProbe().items.join('|');
  assert.notStrictEqual(a, b, '第二批用没跑过的 token');
});

t('C3: 非对称判据——抄错可证伪 / 抄对只说「不像替身」，绝不宣称证明身份', function () {
  const items = PROBE.ITEMS.slice(0, 8);
  const good = items.map(function (x, i) { return (i + 1) + ') ' + x; }).join('\n');
  const rGood = PROBE.judgeProbe({ items: items, text: good });
  assert.strictEqual(rGood.verdict, 'inconclusive');
  assert.strictEqual(rGood.hit, 8);
  assert.ok(rGood.conclusion.indexOf('不能证明') > 0, '明确写出不可证实');

  const bad = items.slice(0, 2).join('\n');   // 只抄回 2 个
  const rBad = PROBE.judgeProbe({ items: items, text: bad });
  assert.strictEqual(rBad.verdict, 'weak');
  assert.strictEqual(rBad.hit, 2);
  assert.strictEqual(rBad.misses.length, 6);
});

t('C4: 逐字精确匹配——幻觉补形不算抄对', function () {
  const items = ['Kv7Qm2Lz9RxT', 'StarSrvGroupBody'];
  const fake = '1) Kv7Qm2Lz9Rx\n2) StarSrvGroupBodyy';  // 漏位 / 多一字
  const r = PROBE.judgeProbe({ items: items, text: fake });
  assert.strictEqual(r.hit, 0, '近似不算命中');
  assert.strictEqual(r.verdict, 'weak');
  assert.strictEqual(PROBE.judgeProbe({ items: items, text: '' }).reason, 'empty-reply');
  assert.strictEqual(PROBE.judgeProbe({ items: [], text: 'x' }).reason, 'no-items');
});

t('C5: 账本按 base 归并（换尾斜杠/协议不分家），只记有结论的轮', function () {
  const base = 'https://api.example.com/v1';
  assert.strictEqual(PROBE.channelKey(base), PROBE.channelKey('http://api.example.com/v1/'));
  const before = PROBE.ledgerRow(base).n;
  assert.strictEqual(PROBE.record(base, 'unknown-thing').ok, false, '没结论不进分母');
  PROBE.record(base, 'weak');
  PROBE.record('https://api.example.com/v1/', 'inconclusive');
  const row = PROBE.ledgerRow(base);
  assert.strictEqual(row.n, before + 2, '同一 base 两次都记在同一行');
  assert.strictEqual(row.weak + row.inconclusive, row.n);
  const txt = PROBE.exportText(base);
  assert.ok(txt.indexOf('WA-PROBE:') > 0, '带机读码');
  assert.ok(txt.indexOf('apiKey') < 0 && txt.indexOf('sk-') < 0, '导出不含任何 key');
  assert.ok(txt.length <= 1800);
});

t('C6: Wilson 区间——样本不足不给假精确，n>=8 才放行', function () {
  const w0 = PROBE.wilson(0, 0);
  assert.strictEqual(w0.enough, false);
  assert.strictEqual(PROBE.wilson(3, 4).enough, false);
  const w8 = PROBE.wilson(4, 10);
  assert.strictEqual(w8.enough, true);
  assert.ok(w8.low >= 0 && w8.high <= 1 && w8.low < w8.high);
});

t('C7: 纯字符火花图（零 canvas / 零依赖，截图可复制）', function () {
  assert.strictEqual(PROBE.spark([1, 2, 3]), '▁▅█', '均匀三点落在首/中/末');
  assert.strictEqual(PROBE.spark([]), '');
  assert.strictEqual(PROBE.spark([5, 5, 5]), '▅▅▅');
  assert.strictEqual(PROBE.spark([1, NaN, 3]), '▁█');
});

t('C8: 三处装载登记与 tool-diag 出口面同步', function () {
  const idx = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  const run = fs.readFileSync(path.join(BASE, 'tests/run.js'), 'utf8');
  const diag = fs.readFileSync(path.join(BASE, 'engines/tool-diag.js'), 'utf8');
  ['engines/narrative-lens.js', 'engines/reply-guard.js', 'engines/channel-probe.js'].forEach(function (f) {
    assert.ok(idx.indexOf("'" + f + "'") > 0, 'index LOAD_ORDER 含 ' + f);
    assert.ok(run.indexOf("'" + f + "'") > 0, 'run.js LOAD 含 ' + f);
  });
  assert.ok(diag.indexOf("'engines/narrative-lens.js': 'narrativeLens'") > 0);
  assert.ok(diag.indexOf("'engines/reply-guard.js': 'replyGuard'") > 0);
  assert.ok(diag.indexOf("'engines/channel-probe.js': 'channelProbe'") > 0);
});

console.log('---');
console.log('通过: ' + pass + ' / 失败: ' + fail);
process.exit(fail ? 1 : 0);