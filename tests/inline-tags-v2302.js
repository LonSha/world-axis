'use strict';
/**
 * tests/inline-tags-v2302.js — 内联状态回报标签专锁（v2.302.0，缝 World Chronicle）
 *
 * 判据口径：**执行真实模块源码**（读 engines/inline-tags.js 原文跑），
 * 不做「另写一份等价实现来测自己」。store / calendar 用受控桩，二者都是**既有写口的形状**。
 *
 * 五组判据：
 *   A 纯函数解析：严格日期边界、多标签取末、转义兼容、畸形单列
 *   B 落账归属：时间→clock.iso、抉择→chronicle、事实→worldFacts（按 key 去重）
 *   C 去重纪律：同一文本只应用一次；force 可强制重放
 *   D 不造假：<bgm> 只解析不落账且 owners.bgm === null；不可解析日期不兜底成今天
 *   E 反向自证：破坏去重锁 / 让日期兜底 / 让 flag 每次新插入 → 本锁必须变红
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'engines', 'inline-tags.js'), 'utf8');

let pass = 0; const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fails.push(name + (detail ? ' :: ' + detail : ''));
}

/** 建一个受控沙箱：store / calendar / evict 都是桩，形状对齐既有写口。 */
function makeRig(opts) {
  const o = opts || {};
  const state = {
    clock: { iso: '', label: '第1日·黎明', dayIndex: 1, source: 'unset' },
    worldFacts: [], chronicle: [],
  };
  const writes = { setClock: 0, transact: 0 };

  const store = {
    get: () => state,
    read: (k, dflt) => {
      const seg = String(k).split('.');
      let cur = state;
      for (const s of seg) { if (cur == null) return dflt; cur = cur[s]; }
      return cur === undefined ? dflt : cur;
    },
    transact: (fn) => { writes.transact++; const d = JSON.parse(JSON.stringify(state)); fn(d); Object.assign(state, d); return { ok: true }; },
  };
  const calendar = {
    setClock: (label, op) => {
      writes.setClock++;
      const p = op || {};
      state.clock.label = p.label !== undefined ? p.label : label;
      state.clock.source = p.source || 'user';
      if (p.iso !== undefined) state.clock.iso = p.iso;
      if (p.dayIndex != null) state.clock.dayIndex = p.dayIndex;
    },
  };
  const WA = {
    store: store, calendar: calendar,
    evict: { array: () => {} },
    rand: { id: (prefix, n) => (prefix || '') + 'x1' + Math.random().toString(36).slice(2, 2 + (n || 4)) },
    clock: { now: () => 1700000000000 },
    log: () => {},
    registerModule: () => {},
  };
  const sandbox = { window: { WorldAxis: WA }, console };
  sandbox.window.mainWin = { localStorage: { getItem: () => null, setItem: () => {} } };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: 'inline-tags.js' });
  return { WA: sandbox.window.WorldAxis, state, writes };
}

// ── A 纯函数解析 ────────────────────────────────────────────────
{
  const rig = makeRig();
  const T = rig.WA.inlineTags;

  ok('A1 严格 ISO 通过', T.normalizeDate('1997-07-02') === '1997-07-02');
  ok('A2 单数字补零', T.normalizeDate('1997-7-2') === '1997-07-02');
  ok('A3 中文日期', T.normalizeDate('1997年7月2日') === '1997-07-02');
  ok('A4 斜杠日期', T.normalizeDate('1997/7/2') === '1997-07-02');
  ok('A5 2 月 30 日拒收（不进位）', T.normalizeDate('1997-02-30') === null, String(T.normalizeDate('1997-02-30')));
  ok('A6 13 月拒收', T.normalizeDate('1997-13-01') === null);
  ok('A7 空串拒收', T.normalizeDate('') === null);
  ok('A8 纯文字拒收', T.normalizeDate('明天') === null);

  const p1 = T.parse('天亮了。<time>1997-07-02</time>');
  ok('A9 time 提取', p1.time === '1997-07-02', JSON.stringify(p1.time));
  ok('A10 无畸形计数', (p1.malformed.time | 0) === 0);

  const p2 = T.parse('<time>1997-07-02</time>…<time>1997-07-05</time>');
  ok('A11 多 time 取末', p2.time === '1997-07-05', p2.time);

  const p3 = T.parse('<time>不是日期</time>');
  ok('A12 不可解析 time → null', p3.time === null);
  ok('A13 畸形 time 单独计数', p3.malformed.time === 1, String(p3.malformed.time));

  const p4 = T.parse('<choice who="爱丽丝" event="审判">她选择作证</choice>');
  ok('A14 choice 提取 who', p4.choices.length === 1 && p4.choices[0].who === '爱丽丝');
  ok('A15 choice 提取 event', p4.choices[0].event === '审判');
  ok('A16 choice 提取正文', p4.choices[0].choice === '她选择作证');

  const p5 = T.parse('<choice>没有 who</choice>');
  ok('A17 缺 who 的 choice 计畸形', p5.choices.length === 0 && p5.malformed.choice === 1);

  const p6 = T.parse('<flag>王已被处决</flag><flag>王已被处决</flag>');
  ok('A18 flag 同段去重', p6.flags.length === 1, JSON.stringify(p6.flags));

  const esc = T.parse('&lt;time&gt;1997-07-02&lt;/time&gt;');
  ok('A19 转义标签不误当有效 time（原文同款边界）', esc.time === null, 'strip 侧负责隐藏，解析侧不猜');

  // strip：四组全去掉，长段落不塌成多个空行
  const stripped = T.strip('正文A<time>1997-07-02</time>正文B<flag>x</flag>正文C');
  ok('A20 strip 去掉标签留正文', stripped === '正文A正文B正文C', JSON.stringify(stripped));
  ok('A21 strip 压缩三连空行', T.strip('a\n\n\n\nb') === 'a\n\nb', JSON.stringify(T.strip('a\n\n\n\nb')));
  ok('A22 hasTag 快筛', T.hasTag('x<time>1</time>') === true && T.hasTag('无标签') === false);
}

// ── B 落账归属 ──────────────────────────────────────────────────
{
  const rig = makeRig();
  const T = rig.WA.inlineTags;
  const r = T.apply('正文<time>1997-07-02</time>');
  ok('B1 时间写入 clock.iso', rig.state.clock.iso === '1997-07-02', rig.state.clock.iso);
  ok('B2 时间来源标 text', rig.state.clock.source === 'text', rig.state.clock.source);
  ok('B3 label 未被清空', rig.state.clock.label === '第1日·黎明', rig.state.clock.label);
  ok('B4 回执 changed=true', r.time && r.time.changed === true);
  ok('B5 走既有 setClock 写口', rig.writes.setClock === 1, String(rig.writes.setClock));

  const rig2 = makeRig();
  rig2.state.clock.iso = '1997-07-02';
  const r2 = rig2.WA.inlineTags.apply('<time>1997-07-02</time>');
  ok('B6 同值不重写（noop）', rig2.writes.setClock === 0 && r2.time.changed === false);

  const rig3 = makeRig();
  rig3.WA.inlineTags.apply('<choice who="爱丽丝" event="审判">作证</choice>');
  const ch = rig3.state.chronicle;
  ok('B7 抉择进 chronicle', ch.length === 1, String(ch.length));
  ok('B8 抉择 kind 标记', ch[0].kind === 'inline-choice', ch[0].kind);
  ok('B9 抉择标题含人与选择', /爱丽丝/.test(ch[0].title) && /作证/.test(ch[0].title), ch[0].title);
  ok('B10 抉择不进 worldFacts', rig3.state.worldFacts.length === 0);

  const rig4 = makeRig();
  rig4.WA.inlineTags.apply('<flag>王已被处决</flag>');
  const wf = rig4.state.worldFacts;
  ok('B11 事实进 worldFacts', wf.length === 1, String(wf.length));
  ok('B12 事实 scope=flag', wf[0].scope === 'flag', wf[0].scope);
  ok('B13 事实 source=inline-tag', wf[0].source === 'inline-tag', wf[0].source);
  ok('B14 事实 key 为原文', wf[0].key === '王已被处决', wf[0].key);

  // 重复声明：只更新 at，不新增行
  rig4.WA.inlineTags.apply('<flag>王已被处决</flag>', { force: true });
  ok('B15 重复 flag 不新增行', rig4.state.worldFacts.length === 1, String(rig4.state.worldFacts.length));
  ok('B16 重复 flag 计入 deduped', rig4.WA.inlineTags.read().flagDeduped >= 1);
}

// ── C 去重纪律 ──────────────────────────────────────────────────
{
  const rig = makeRig();
  const T = rig.WA.inlineTags;
  const text = '正文<flag>城门已破</flag>';
  const a = T.apply(text);
  const b = T.apply(text);          // 同一文本再来一次
  ok('C1 首次应用', a.ok === true && a.flags === 1, JSON.stringify(a));
  ok('C2 同文本第二次被去重', b.reason === 'dedup', String(b.reason));
  ok('C3 去重不写第二行', rig.state.worldFacts.length === 1, String(rig.state.worldFacts.length));
  const c = T.apply(text, { force: true });
  ok('C4 force 可强制重放', c.reason !== 'dedup', String(c.reason));
}

// ── D 不造假 ────────────────────────────────────────────────────
{
  const rig = makeRig();
  const T = rig.WA.inlineTags;
  const r = T.apply('音乐响起<bgm>马赛曲</bgm>');
  ok('D1 bgm 被解析出来', r.bgm === '马赛曲', String(r.bgm));
  ok('D2 bgm 不落任何账', rig.state.worldFacts.length === 0 && rig.state.chronicle.length === 0 && rig.state.clock.iso === '');
  ok('D3 owners.bgm 如实为 null', T.read().owners.bgm === null);
  ok('D4 bgmSeen 计数', T.read().bgmSeen === 1, String(T.read().bgmSeen));

  const rig2 = makeRig();
  const r2 = rig2.WA.inlineTags.apply('<time>明天</time>');
  ok('D5 不可解析日期不兜底', rig2.state.clock.iso === '' && r2.time === null);
  ok('D6 畸形如实计数', rig2.WA.inlineTags.read().malformed >= 1);

  const rig3 = makeRig();
  const r3 = rig3.WA.inlineTags.apply('这句没有标签');
  ok('D7 无标签回执 no-tag', r3.reason === 'no-tag', String(r3.reason));
  ok('D8 无标签不写任何账', rig3.writes.transact === 0 && rig3.writes.setClock === 0);

  // 归属读面：四项都要能回答「谁负责」
  const own = rig3.WA.inlineTags.read().owners;
  ok('D9 owners.time 有归属', own.time === 'calendar.setClock', String(own.time));
  ok('D10 owners.flag 有归属', own.flag === 'store.worldFacts', String(own.flag));
  ok('D11 owners.choice 有归属', own.choice === 'store.chronicle', String(own.choice));
}

// ── E 反向自证：破坏后本锁必须变红 ──────────────────────────────
function mutateAndExpectRed(label, from, to) {
  if (SRC.indexOf(from) < 0) { fails.push('E0 变异锚点缺失：' + label); return; }
  const bad = SRC.replace(from, to);
  const sandbox = { window: { WorldAxis: { store: { get: () => ({ clock: {}, worldFacts: [], chronicle: [] }), read: () => '', transact: (f) => f({ clock: {}, worldFacts: [], chronicle: [] }) }, calendar: { setClock: () => {} }, clock: { now: () => 0 }, log: () => {}, evict: { array: () => {} }, rand: { id: () => 'x' } } }, console };
  sandbox.window.mainWin = { localStorage: { getItem: () => null, setItem: () => {} } };
  vm.createContext(sandbox);
  vm.runInContext(bad, sandbox, { filename: 'inline-tags-mut.js' });
  const T = sandbox.window.WorldAxis.inlineTags;
  return { T, label };
}

{
  // N1：去掉去重锁 → C2 的那条断言必须不再成立
  const m1 = mutateAndExpectRed('去重锁', "if (o.force !== true && sig === stat.lastSig) {", "if (false) {");
  if (m1 && m1.T) {
    const rig = makeRig();
    // 用变异体覆盖真实模块，复跑 C 组
    const sandbox = { window: { WorldAxis: rig.WA }, console };
    sandbox.window.mainWin = { localStorage: { getItem: () => null, setItem: () => {} } };
    vm.createContext(sandbox);
    vm.runInContext(SRC.replace("if (o.force !== true && sig === stat.lastSig) {", "if (false) {"), sandbox, { filename: 'm1.js' });
    const T = sandbox.window.WorldAxis.inlineTags;
    const t = '正文<flag>变异测试</flag>';
    T.apply(t); const b2 = T.apply(t);
    ok('E1 破坏去重锁后 C2 判据确实失效（证明该锁非空转）', b2.reason !== 'dedup', String(b2.reason));
  }

  // N2：让不可解析日期兜底成今天 → D5 必须失效
  const sandbox2 = { window: { WorldAxis: makeRig().WA }, console };
  sandbox2.window.mainWin = { localStorage: { getItem: () => null, setItem: () => {} } };
  vm.createContext(sandbox2);
  vm.runInContext(SRC.replace('if (!m) return null;', "if (!m) return '1970-01-01';"), sandbox2, { filename: 'm2.js' });
  const T2 = sandbox2.window.WorldAxis.inlineTags;
  ok('E2 破坏「不兜底」后 D5 判据确实失效', T2.normalizeDate('明天') === '1970-01-01', String(T2.normalizeDate('明天')));

  // N3：让 <bgm> 也写 facts → D2 必须失效
  const rig3 = makeRig();
  const sandbox3 = { window: { WorldAxis: rig3.WA }, console };
  sandbox3.window.mainWin = { localStorage: { getItem: () => null, setItem: () => {} } };
  vm.createContext(sandbox3);
  vm.runInContext(SRC.replace('const out = { ok: true, time: null, choices: 0, flags: 0, bgm: p.bgm, reason: undefined };',
    'const out = { ok: true, time: null, choices: 0, flags: 0, bgm: p.bgm, reason: undefined }; if (p.bgm) { WA.store.transact(function(d){ d.worldFacts = d.worldFacts||[]; d.worldFacts.push({key:p.bgm,scope:"flag"}); }); }'),
    sandbox3, { filename: 'm3.js' });
  // 必须真的驱动一次，否则「装载了变异体」与「变异体确实改变了行为」是两件事
  sandbox3.window.WorldAxis.inlineTags.apply('音乐响起<bgm>马赛曲</bgm>');
  ok('E3 破坏「bgm 不落账」后 D2 判据确实失效', rig3.state.worldFacts.length === 1, String(rig3.state.worldFacts.length));
}

// ── 汇总 ────────────────────────────────────────────────────────
console.log('inline-tags-v2302: pass=' + pass + ' fail=' + fails.length);
if (fails.length) {
  fails.forEach(f => console.log('  FAIL ' + f));
  process.exitCode = 1;
}