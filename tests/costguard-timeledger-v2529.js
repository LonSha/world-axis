#!/usr/bin/env node
// WorldAxis tests/costguard-timeledger-v2529.js —— v2.529.0 悬空成员收口专锁
//
// 【它治的病：九处引用指向从来不存在的成员，判据全是假的】
//   inventory 在 2.524 收口时暴出 9 条「悬空引用」（18 处引用点），全落在 four 台引擎：
//     time-ledger   : calendar.labelNow (×2) / chrono.phase (×2) / storyclock.roundOf (×2)
//     cost-guard    : modelReceipt.view (×2) / apiRouter.pick (×2) / apiRouter.route (×2)
//     story-rhythm  : storyTone.current (×1) / storyTone.view (×1)
//     narrative-preset : worldHealth.note (×2)
//   它们全是 `WA.x && WA.x.y ? ... : 默认值` 这种防御式写法 —— 运行时**不报错**，
//   于是从来没人发现：装了 story-tone 也照样说「现场没有 story-tone」；改了一句也永远
//   `available:false`。**不崩的假判据比崩更贵**：它把「没做」说成了「做了但没数据」。
//
// 【本版口径】
//   ① 不新造能力：目标成员一律换成该引擎**真实存在**的读面（storyTone.get / modelReceipt.list /
//      apiRouter.getChannel / store.clock.label / worldHealth.summary）。
//   ② 算不出来就直说：deviation 的正文轮次只能显式传入（storyclock 只给「第N日·时段」，
//      没有轮次映射，不臆造换算）。
//   ③ 本锁同时钉两件事：**臆想引用不许回归**（静态面）+ **换成真成员后真能读出数**（行为面）。
//
// 【判据】
//   S1~S3 静态面：九处具名引用在四个文件里归零；目标成员在各自引擎里确有定义（不是同一串换了个名）。
//   B1~B11 行为面：vm 装配最小 WorldAxis，真调 season / deviation / read / roundCost / offstageRoute。
//   N 负控制：空世界、无 apiRouter、无收据时都必须如实说「读不到」，不许编数。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const fails = [];
function ok(cond, name, extra) {
  if (cond) { pass++; return true; }
  fail++; fails.push(name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
function eq(a, b, name) { return ok(a === b, name, { got: a, want: b }); }

const ROOT = path.join(__dirname, '..');
function src(f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }
// 静态面只认**代码里的引用**：注释里写到的名字不算引用（否则「解释为什么删」这件事本身会被判红）。
function stripComments(t) {
  let out = '';
  let i = 0;
  const n = t.length;
  while (i < n) {
    const c = t[i], d = t[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && t[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(t[i] === '*' && t[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c;
      out += c; i++;
      while (i < n) {
        if (t[i] === '\\') { out += t[i] + (t[i + 1] || ''); i += 2; continue; }
        out += t[i];
        if (t[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    out += c; i++;
  }
  return out;
}
function codeDoc(f) { return stripComments(src(f)); }

// ── 加载器：最小 WorldAxis 沙箱（静音 console，store/evolution/receipt/router 由用例给） ──
const SETTINGS_BUS = {
  normalize(reg, cfg) { return Object.assign({}, reg.def, cfg || {}); },
  read() { return null; },
  saveOrThrow() { return { ok: true }; },
  registry() { return []; }
};
function load(file, seed) {
  const WA = Object.assign({ registerModule() {}, settingsBus: SETTINGS_BUS }, seed || {});
  const sandbox = {
    window: { WorldAxis: WA },
    console: { log() {}, warn() {}, error() {} },
    Date: Date, Math: Math, JSON: JSON, Number: Number, Array: Array, Object: Object,
    String: String, Boolean: Boolean, parseInt: parseInt, parseFloat: parseFloat,
    isNaN: isNaN, setTimeout: setTimeout, clearTimeout: clearTimeout
  };
  vm.createContext(sandbox);
  vm.runInContext(src(file), sandbox, { filename: file });
  return sandbox.window.WorldAxis;
}

// ══════════════════ S 类：静态面（臆想引用归零 + 目标成员确有定义） ══════════════════
const GHOSTS = [
  ['engines/time-ledger.js', 'calendar.labelNow'],
  ['engines/time-ledger.js', 'calendar && WA.calendar.labelNow'],
  ['engines/time-ledger.js', 'chrono.phase'],
  ['engines/time-ledger.js', 'storyclock.roundOf'],
  ['engines/cost-guard.js', 'modelReceipt.view'],
  ['engines/cost-guard.js', 'apiRouter.pick'],
  ['engines/cost-guard.js', 'apiRouter.route'],
  ['engines/story-rhythm.js', 'storyTone.current'],
  ['engines/story-rhythm.js', 'storyTone.view'],
  ['engines/narrative-preset.js', 'worldHealth.note']
];
const CODE = {};
GHOSTS.forEach(function (g, i) {
  if (!CODE[g[0]]) CODE[g[0]] = codeDoc(g[0]);
  ok(CODE[g[0]].indexOf(g[1]) < 0, 'S' + (i + 1) + ' 臆想引用归零：' + g[0] + ' 的**代码**里不再含 ' + g[1]);
});
// 负控制：剥注释这件事本身要成立 —— 剥完还必须留着真代码（否则上面十条可能是对空串判绿）
ok(CODE['engines/time-ledger.js'].indexOf('function clockLabel') >= 0, 'S10b 负控制：剥注释后 time-ledger 的真代码仍在');
ok(CODE['engines/cost-guard.js'].indexOf('modelReceipt.list') >= 0, 'S10c 负控制：剥注释后 cost-guard 的真读面仍在');

// S11 负控制：扫的确实是真内容（同一文件里真实成员必须还在，否则 S1~S10 可能是空扫）
ok(CODE['engines/time-ledger.js'].indexOf('clockLabel') >= 0, 'S11 负控制：time-ledger 里新的真源 clockLabel 在位');
ok(codeDoc('engines/story-rhythm.js').indexOf('WA.storyTone.get') >= 0, 'S12 负控制：story-rhythm 改指向真实成员 get');

// S13~S16：目标成员在各自引擎里确有定义（不是把名字换了个花样）
ok(/get:\s*get[,}]/.test(src('engines/story-tone.js')), 'S13 story-tone 真的导出 get');
ok(/list:\s*list[,}]/.test(src('engines/model-receipt.js')), 'S14 model-receipt 真的导出 list');
ok(/getChannel\(name\)/.test(src('core/api-router.js')), 'S15 api-router 真的导出 getChannel');
ok(/summary:\s*summary[,}]/.test(src('engines/world-health.js')), 'S16 world-health 真的导出 summary');
ok(/setClock\(label, opts\)/.test(src('engines/calendar.js')), 'S17 calendar 的写入点 setClock 仍在（label 的唯一真源）');

// ══════════════════ B 类：行为面（换成真成员后真能读出数） ══════════════════
// ── time-ledger ──
function timeEnv(opts) {
  const o = opts || {};
  return load('engines/time-ledger.js', {
    store: { get() { return o.doc === undefined ? { clock: { label: '第3日·黄昏' } } : o.doc; } },
    evolution: { roundOf() { return o.round === undefined ? 7 : o.round; } }
  });
}
const t1 = timeEnv();
eq(t1.timeLedger.season().label, '第3日·黄昏', 'B1 season 读的是 store.clock.label（真源，不是臆想成员）');
eq(t1.timeLedger.season().known, true, 'B1b season 有标签就 known:true');
eq(t1.timeLedger.season().phase, undefined, 'B1c 不再有 phase 这个第二份口径（不造）');
const rows = t1.timeLedger.read().rows;
eq(rows[0].value, '第3日·黄昏', 'B2 read() 三栏的「世界钟」就是 clock.label');
eq(t1.timeLedger.deviation().known, false, 'B3 deviation 不给正文轮次时如实说判不了（N 负控制）');
eq(t1.timeLedger.deviation().reason, 'no-story-round', 'B3b 理由说得出');
const dv = t1.timeLedger.deviation({ storyRound: 5 });
eq(dv.known, true, 'B4 显式传 storyRound 后真能算（不再恒 false）');
eq(dv.deviation, 2, 'B4b 偏差 = |7-5| = 2');
eq(dv.warn, false, 'B4c 2 ≤ devWarnRounds(3) ⇒ 不告警');
const dv2 = t1.timeLedger.deviation({ storyRound: 1 });
eq(dv2.deviation, 6, 'B5 偏差 6');
eq(dv2.warn, true, 'B5b 6 > 3 ⇒ 告警');
eq(dv2.reason, 'drift', 'B5c 理由 drift');
const t2 = timeEnv({ doc: {} });
eq(t2.timeLedger.season().known, false, 'B6 空世界 ⇒ known:false（不编日历）');
eq(t2.timeLedger.season().reason, 'no-calendar', 'B6b 理由 no-calendar');

// ── cost-guard ──
function costEnv(opts) {
  const o = opts || {};
  return load('engines/cost-guard.js', {
    store: { get() { return {}; } },
    modelReceipt: o.receipt,
    apiRouter: o.router
  });
}
const r1 = costEnv({
  receipt: {
    list() { return { ok: true, rows: [{ promptTokens: 100, completionTokens: 20 }] }; }
  },
  router: {
    getChannel(n) { return n === 'digest' ? { baseUrl: 'https://x', model: 'm1' } : { baseUrl: '' }; }
  }
});
const rc = r1.costGuard.roundCost();
eq(rc.available, true, 'B7 roundCost 从真实读面 list 取到一笔（不再恒 available:false）');
eq(rc.tokens, 120, 'B7b tokens = 100 + 20');
eq(rc.calls, 1, 'B7c calls = 1');
const r2 = costEnv({ receipt: { list() { return { ok: true, rows: [] }; } } });
const rc2 = r2.costGuard.roundCost();
eq(rc2.available, false, 'B8 收据为空 ⇒ 不报数（N 负控制）');
ok(rc2.line.indexOf('读不到') >= 0, 'B8b 明说读不到');
const off0 = r1.costGuard.offstageRoute();
eq(off0.available, false, 'B9 默认通道没配 baseUrl ⇒ 不走低配（不假装走了便宜路）');
eq(off0.mainChannel, 'unchanged', 'B9b 主链口径不变');
const off1 = r1.costGuard.offstageRoute({ channel: 'digest' });
eq(off1.available, true, 'B10 点名配好的通道 ⇒ 真能用');
eq(off1.channel, 'digest', 'B10b 报出用的是哪条通道');
const r3 = costEnv({ router: undefined });
const off2 = r3.costGuard.offstageRoute();
eq(off2.available, false, 'B11 apiRouter 缺席 ⇒ 不崩且如实说没有（N 负控制）');
eq(off2.mainChannel, 'unchanged', 'B11b 主链不动');

// ── story-rhythm：装了 story-tone 就必须认得出 ──
const sr = load('engines/story-rhythm.js', {
  store: { get() { return {}; }, transact() {} },
  storyTone: { get() { return { ok: true }; } }
});
const tone = sr.storyRhythm.tone({ direction: 5 });
eq(tone.available, true, 'B12 装了 story-tone 就认得出（改前恒说没有）');
const sr2 = load('engines/story-rhythm.js', { store: { get() { return {}; }, transact() {} } });
eq(sr2.storyRhythm.tone({ direction: 5 }).available, false, 'B13 真没装时才说没有（区分得开）');

// ── narrative-preset：健康面没有写入入口就不许声称记过 ──
const np = load('engines/narrative-preset.js', {
  store: { get() { return {}; } },
  worldBrief: { quiet() { return { ok: true, quiet: true }; } },
  worldHealth: { summary() { return { ok: true }; } }
});
const si = np.narrativePreset.silence();
eq(si.health, 'read-only', 'B14 健康面只有读数面 ⇒ 记 read-only，不再声称 noted');
const np2 = load('engines/narrative-preset.js', {
  store: { get() { return {}; } },
  worldBrief: { quiet() { return { ok: true, quiet: true }; } }
});
eq(np2.narrativePreset.silence().health, 'health-absent', 'B15 健康面不在场 ⇒ 如实说缺席');

// ══════════════════ v2.542.18：「正文时间」栏接真锚点 ══════════════════
// 【它治的病】read().rows 的「正文时间」曾取 `storyclock.discipline()` —— 那是**给模型的注桩指令**，
//   不是正文里写着的时间；而 storyclock 的 parseStamp / readLatest / audit 在整条读面上一次没被调过
//   （audit refs=0）。buildBlock() 的对账也惨：它只调 deviation()，而后者必须由调用方传 spec.storyRound，
//   buildBlock 从不传 ⇒ 「差了几轮」那句在整条注入链上**从未可能触发**。
// 【本节的判据】真锚点能读出来 / 三类「读不到」各自说得清 / 漂移真能报出 / 无数据时不编。
function loadInto(WA, file) {
  const sandbox = { window: { WorldAxis: WA }, console: { log() {}, warn() {}, error() {} },
    Date: Date, Math: Math, JSON: JSON, Number: Number, Array: Array, Object: Object,
    String: String, Boolean: Boolean, parseInt: parseInt, parseFloat: parseFloat,
    isNaN: isNaN, setTimeout: setTimeout, clearTimeout: clearTimeout };
  vm.createContext(sandbox);
  vm.runInContext(src(file), sandbox, { filename: file });
  return WA;
}
function tlEnv(o) {
  o = o || {};
  const WA = load('engines/storyclock.js', {
    settingsBus: SETTINGS_BUS,
    mainWin: o.mainWin === undefined ? {} : o.mainWin,
    store: { get() { return o.doc === undefined ? { clock: { label: '第3日·黄昏' } } : o.doc; } }
  });
  loadInto(WA, 'engines/time-ledger.js');
  return WA;
}
function host(msgs) { return { SillyTavern: { getContext() { return { chat: msgs }; } } }; }
// B20 拿不到楼层：算不出来 ≠ 正文没写
const tl1 = tlEnv({});
eq(tl1.timeLedger.read().rows[1].value, 'unknown', 'B20 无楼层 ⇒ 正文栏 unknown（不再是一段指令文本）');
eq(tl1.timeLedger.read().story.reason, 'no-messages', 'B20b 理由 no-messages（算不出来）');
ok(String(tl1.timeLedger.read().rows[1].why).indexOf('拿不到楼层') >= 0, 'B20c why 说清了是哪一种读不到');
ok(String(tl1.timeLedger.read().hints).length > 20, 'B20d 原注桩指令没丢（挪到 hints）');
ok(tl1.timeLedger.buildBlock().indexOf('时间标签') < 0, 'B20e 无楼层时注入块不编任何时间行');
// B21 有楼层、正文没写标签：真没写
const tl2 = tlEnv({ mainWin: host([{ mes: '普通正文' }]) });
eq(tl2.timeLedger.read().story.reason, 'no-stamp', 'B21 无标签 ⇒ no-stamp（扫过了）');
ok(String(tl2.timeLedger.read().story.why).indexOf('扫了 1 层') >= 0, 'B21b 报出扫了几层');
ok(tl2.timeLedger.buildBlock().indexOf('还没有时间标签') >= 0, 'B21c 注入块提示「还没有时间标签」');
// B22 真锚点读得出来，且与世界钟一致
const tl3 = tlEnv({ mainWin: host([{ mes: '<!-- SDC-start 第3日·黄昏 -->正文<!-- SDC-end -->' }]) });
const tlR3 = tl3.timeLedger.read();
ok(tlR3.story.known === true, 'B22 真锚点读到了');
eq(tlR3.rows[1].value, '第3日·黄昏', 'B22b 三栏「正文时间」= 真锚点');
eq(tlR3.reconcile.drift, false, 'B22c 与世界钟一致 ⇒ 不报漂移');
// B23 漂移：真的报出来（旧版这条线恒不触发）
const tl4 = tlEnv({ doc: { clock: { label: '第9日·正午' } },
  mainWin: host([{ mes: '<!-- SDC-start 第3日·黄昏 -->x' }]) });
eq(tl4.timeLedger.read().reconcile.drift, true, 'B23 判定漂移');
const b4 = tl4.timeLedger.buildBlock();
ok(b4.indexOf('两处不一致') >= 0 && b4.indexOf('第3日·黄昏') >= 0 && b4.indexOf('第9日·正午') >= 0,
  'B23b 注入块把两个标签都写出来（不再只说「差了 N 轮」）');
// B24 世界钟为空：两个空值不构成证据
eq(tlEnv({ doc: {}, mainWin: host([{ mes: '<!-- SDC-start 第1日·清晨 -->x' }]) })
  .timeLedger.read().reconcile.reason, 'no-calendar', 'B24 世界钟未设定 ⇒ no-calendar（不是「一致」）');
// B25 第四种读不到：storyclock 总开关关（stub 成 disabled，与 reject-v2780 的见证同款）
const tl5 = tlEnv({ mainWin: host([{ mes: 'x' }]) });
tl5.storyclock.readLatest = function () { return { ok: false, reason: 'disabled' }; };
eq(tl5.timeLedger.read().story.reason, 'storyclock-disabled', 'B25 总开关关 ⇒ 单独一种理由，不并进 no-stamp');
// B26 负控制：真没装 storyclock 时也不能崩、要如实说
eq(tlEnv({ mainWin: host([{ mes: 'x' }]) }).timeLedger.read().ok, true, 'B26 负控制：读取永不抛（ok 恒真）');
// ══════════════════ 收尾 ══════════════════
if (fail) {
  console.log('══ v2.529.0 悬空成员收口专锁（costguard-timeledger-v2529）══');
  fails.forEach(function (f) { console.log('  ✗ ' + f); });
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  process.exit(1);
}
console.log('exv529 悬空成员收口: 全部通过（' + pass + ' 项）');
