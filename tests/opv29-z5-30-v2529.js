#!/usr/bin/env node
// WorldAxis tests/opv29-z5-30-v2529.js — OPV29-30 破坏性变更迁移（存档结构变更给迁移与回滚）
//
// 验收（计划表原话）：**老档能读；回滚能回**。
// 这两条恰恰是最容易「看起来做到了」的两条：
//   · 老档能读 —— 到处写 `if (old) x = old.x || new` 也能读，代价是把老档读成新档、写回后回不去；
//   · 回滚能回 —— 用「反向推理」（把加上的字段再删掉）也能回，代价是数据删过之后就回错了。
// 所以本锁不测「能读能回」这种结果，而是测四条**结构性质**：
//   ① 版本必须认出来（老档按形状判，不许默认当最新）；
//   ② 每一步都有一对 up/down（而不是只有一个方向）；
//   ③ 回滚用的是**备份**逐字还原（不是反向推理）；
//   ④ 缺一步就明说 unsupported 且原档一字不动（不许升一半）。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function a(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); return true; }
  fail++;
  console.log('  ✗ ' + name + (extra === undefined ? '' : ' :: ' + JSON.stringify(extra)));
  return false;
}
const RD = function (rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); };
function mkSandbox() {
  const win = { console: { log: function () {}, warn: function () {}, error: function () {} } };
  const sb = {
    window: win, console: win.console,
    Promise: Promise, Date: Date, JSON: JSON, Math: Math, Object: Object, Array: Array,
    String: String, Number: Number, Boolean: Boolean, RegExp: RegExp, Error: Error, isFinite: isFinite
  };
  win.WorldAxis = { registerModule: function (n, m) { (win.__regs = win.__regs || []).push({ rel: n, meta: m }); } };
  return sb;
}
function load() {
  const sb = mkSandbox();
  const ctx = vm.createContext(sb);
  vm.runInContext(RD('engines/save-migrate.js'), ctx, { filename: 'engines/save-migrate.js' });
  const wa = sb.window.WorldAxis;
  wa.__regs = sb.window.__regs || [];
  return wa;
}
function broken(from, to) {
  const src = RD('engines/save-migrate.js');
  if (src.indexOf(from) < 0) return { WA: null, miss: true };
  const sb = mkSandbox();
  const ctx = vm.createContext(sb);
  try { vm.runInContext(src.split(from).join(to), ctx, { filename: 'engines/save-migrate.js' }); }
  catch (e) { return { WA: sb.window.WorldAxis, miss: false, err: String(e && e.message) }; }
  return { WA: sb.window.WorldAxis, miss: false };
}
const WA = load();
const SM = WA.saveMigrate;

// v1 老档：worlds 是数组，楼层没有 extra，没有 schemaVer
function v1Save() {
  return {
    chat: { name: '长夜将至', messages: [
      { mes: '开场白', is_user: false },
      { mes: '我推门进去', is_user: true },
      { mes: '门后是黑的', is_user: false }
    ] },
    worlds: ['北辰商会的账本', '雨夜']
  };
}

// ── A0 装载面 ───────────────────────────────────────────
a(!!SM && typeof SM.migrate === 'function', 'A0a saveMigrate 命名空间可装载');
const regs = WA.__regs || [];
a(regs.length === 1 && regs[0].meta && regs[0].meta.kind === 'engine' && regs[0].meta.ver === '2.529.0',
  'A0b 尾调 registerModule 且元信息统一（kind=engine / ver=2.529.0）', regs);
const IDX = RD('index.js'), RUN = RD('tests/run.js');
// OPV29-04 后口径：引擎可以在 LOAD_ORDER（首帧）或 LAZY_ORDER（首帧之后）——两者之一即算登记，
// 但必须在其中之一（不许两边都没有 = 永远不装），且 tests/run.js 的测试装载面必须有它。
const inIdx = IDX.indexOf("'engines/save-migrate.js'") >= 0;
a(inIdx && RUN.indexOf("'engines/save-migrate.js'") >= 0,
  'A0c 双登记齐全（index.js 的 LOAD_ORDER 或 LAZY_ORDER / tests/run.js LOAD）',
  { idx: IDX.indexOf("'engines/save-migrate.js'") >= 0, run: RUN.indexOf("'engines/save-migrate.js'") >= 0 });

// ── 1 认版本：老档按形状判，不许默认当最新 ──────────────────
a(SM.detect(v1Save()) === 1, 'A1a 没有 schemaVer、worlds 是数组 ⇒ 认成 v1（按形状判，不是默认当最新）', SM.detect(v1Save()));
a(SM.detect({ schemaVer: 3 }) === 3 && SM.detect({ schemaVer: 7 }) === 7,
  'A1b 有 schemaVer 就信它（不拿形状去覆盖显式版本）');
a(SM.detect({ worlds: { a: true }, chat: { messages: [{ mes: 'x' }] } }) === 2,
  'A1c worlds 已是对象、楼层还没有 extra ⇒ 认成 v2', SM.detect({ worlds: { a: true }, chat: { messages: [{ mes: 'x' }] } }));
a(SM.detect({ worlds: { a: true }, chat: { messages: [{ mes: 'x', extra: {} }] } }) === 3,
  'A1d 楼层已有 extra 挂载位 ⇒ 认成 v3');

// ── 2 计划：先算会跑哪几步，不动数据 ───────────────────────
const p1 = SM.plan(v1Save(), 3);
a(p1.count === 2 && p1.unsupported === false && p1.from === 1 && p1.to === 3,
  'A2a v1→v3 需要两步（v1→v2、v2→v3），计划里逐步列名前', p1);
a(p1.steps.length === 2 && p1.steps[0].from === 1 && p1.steps[1].from === 2,
  'A2b 步骤按源版本递增（1→2→3），不跳步');
a(SM.plan({ schemaVer: 3 }, 3).count === 0, 'A2c 已是目标版本 ⇒ 零步（幂等的前提）');
const pUp = SM.plan({ schemaVer: 5 }, 3);
a(pUp.unsupported === true && pUp.reason.indexOf('不支持降级') >= 0,
  'A2d 降级不在这条路上（要回旧版得走 rollback），计划里明说', pUp.reason);
const pGap = SM.plan(v1Save(), 99);
a(pGap.unsupported === true && pGap.reason.indexOf('缺少 v3') >= 0,
  'A2e 迁移链断在 v3→v4 ⇒ unsupported 并点名缺哪一步（不许静默少跑）', pGap.reason);

// ── 3 老档能读（验收①）────────────────────────────────
const orig = v1Save();
const r1 = SM.migrate(orig, 3);
a(r1.unsupported === false && r1.steps.length === 2 && r1.save.schemaVer === 3,
  'A3a v1 老档迁到 v3：两步走完并落版本号', [r1.steps.length, r1.save.schemaVer]);
a(r1.save.chat.messages.length === 3 && r1.save.chat.messages[0].extra
  && typeof r1.save.chat.messages[0].extra === 'object',
  'A3b 老档能读：楼层条数不变，且每条都有 extra 挂载位',
  [r1.save.chat.messages.length, r1.save.chat.messages[0]]);
a(Array.isArray(orig.worlds) && !Array.isArray(r1.save.worlds)
  && r1.save.worlds['北辰商会的账本'] === true && r1.save.worlds['雨夜'] === true,
  'A3c worlds 从数组改成对象，书名原样保留（不丢条目、不改名）', r1.save.worlds);
a(r1.save.chat.messages.map(function (m) { return m.mes; }).join('|')
  === orig.chat.messages.map(function (m) { return m.mes; }).join('|'),
  'A3d 迁移只改形状不改内容：正文序列逐字一致');
a(Array.isArray(orig.worlds) && !('extra' in orig.chat.messages[0]),
  'A3e 迁移不改入参（原档还是老形状，调用方手里那份没被顺手改掉）');

// ── 4 回滚能回（验收②）────────────────────────────────
const back = SM.rollback(r1);
a(back.ok === true && SM.same(back.save, orig) === true,
  'A4a 回滚逐字回到原样（same() 深比较 true，不是「看起来差不多」）',
  { ok: back.ok, same: SM.same(back.save, orig) });
a(SM.same(back.save, v1Save()) && Array.isArray(back.save.worlds),
  'A4b 回滚后 worlds 又变回数组（真的倒着走了一步，不是只改版本号）', back.save.worlds);
a(SM.rollback({}).ok === false && String(SM.rollback({}).reason).indexOf('备份') >= 0,
  'A4c 没有备份就明说回滚不了（不拿反向推理硬凑）', SM.rollback({}));
// 每一步都有 down，且能真的倒着走
a(typeof SM.STEPS[1].down === 'function' && typeof SM.STEPS[2].down === 'function',
  'A4d 两个步骤都成对提供 up/down（只有一个方向的不算迁移）');
const v3Manual = SM.STEPS[2].up(SM.STEPS[1].up(cloneJSON(orig)));
const downOne = SM.STEPS[2].down(v3Manual);
a(Array.isArray(downOne.worlds) && downOne.worlds.indexOf('雨夜') >= 0,
  'A4e down 能真的把 worlds 倒回数组（字段还在，不是清空）', downOne.worlds);

// ── 5 幂等 / 不升一半 ──────────────────────────────────
const r2 = SM.migrate(r1.save, 3);
a(r2.steps.length === 0 && SM.same(r2.save, r1.save) === true,
  'A5a 对已是 v3 的档再迁一次：零步、内容不变（幂等）');
const rGap = SM.migrate(orig, 99);
a(rGap.unsupported === true && SM.same(rGap.save, orig) === true,
  'A5b 缺步时原档**一字不动**（不许尽力而为地升一半：半升的档比老档更难救）', rGap.reason);
a(rGap.steps.length === 0, 'A5c 缺步时不报「已完成几步」（steps 为空，读数不掺水）', rGap.steps);
const rSame = SM.migrate({ schemaVer: 3, x: 1 }, 3);
a(SM.same(rSame.save, { schemaVer: 3, x: 1 }) === true, 'A5d 同版本迁移原样返回（不重建、不丢未知字段）');

// ── B 负控制（每处真破坏现场取值，同一套断言必须翻红）──────────
// B1 不落版本号 ⇒ 迁完还是 v1（A3a 翻红，且下一次打开会再迁一遍）
const bf1 = broken('cur[SCHEMA_KEY] = v + 1;', 'void 0;');
if (bf1.miss) a(false, 'B1 负控制锚点未命中（版本号落盘那行已改）');
else {
  const rr = bf1.WA.saveMigrate.migrate(orig, 3);
  a(!(rr.save.schemaVer === 3), 'B1 负控制：不落版本号 ⇒ 迁完还认成 v1（判据翻红）', rr.save.schemaVer);
}
// B2 回滚改用「当前结果」而不是备份 ⇒ 回滚等于没回
const bf2 = broken('return { ok: true, save: clone(r.backup), reason: \'\' };',
  'return { ok: true, save: clone(r.save), reason: \'\' };');
if (bf2.miss) a(false, 'B2 负控制锚点未命中（rollback 用备份那行已改）');
else {
  const rb = bf2.WA.saveMigrate.rollback(r1);
  a(!(rb.ok === true && SM.same(rb.save, orig) === true),
    'B2 负控制：回滚拿当前值 ⇒ 回不到原样（判据翻红）', rb.ok);
}
// B3 老档不再按形状判 ⇒ v1 档被当成 v2，少跑一步
const bf3 = broken('if (Array.isArray(o.worlds)) return 1;', 'if (false) return 1;');
if (bf3.miss) a(false, 'B3 负控制锚点未命中（按形状判 v1 那行已改）');
else {
  a(!(bf3.WA.saveMigrate.detect(v1Save()) === 1),
    'B3 负控制：不按形状判 ⇒ 最老的档认不出来（判据翻红）', bf3.WA.saveMigrate.detect(v1Save()));
}

// ── C 真跑（跨函数协同，验收两步的端到端形态）──────────────────
// C1 打开老档 → 读 → 回滚：全链往返
const opened = SM.migrate(orig, SM.CURRENT);
const restored = SM.rollback(opened);
a(opened.unsupported === false && SM.detect(opened.save) === SM.CURRENT
  && restored.ok === true && SM.same(restored.save, orig) === true,
  'C1 老档→打开（迁到当前版本）→回滚：版本认得出、内容逐字还原（验收①②一次走完）',
  [SM.detect(opened.save), restored.ok]);
// C2 回滚之后再打开，结果必须和第一次一致（迁移是确定性的）
const opened2 = SM.migrate(restored.save, SM.CURRENT);
a(SM.same(opened2.save, opened.save) === true,
  'C2 回滚后再打开：迁移结果与第一次逐字相同（确定性，不是每次都漂一点）');
// C3 真写过内容的 extra 不许被 down 抹掉（老档的「空壳 extra」才摘）
const withData = { schemaVer: 3, chat: { messages: [{ mes: 'a', extra: { waxFavorite: true } }, { mes: 'b', extra: {} }] }, worlds: {} };
const d3 = SM.STEPS[1].down(withData);
a(d3.chat.messages[0].extra && d3.chat.messages[0].extra.waxFavorite === true
  && !('extra' in d3.chat.messages[1]),
  'C3 down 只摘空壳 extra：真写过东西的挂载位不许丢（收藏标记就在里面）',
  d3.chat.messages);
// C4 计划与实跑条数一致（界面按计划提示「会改动 N 处」不能骗人）
let agree = true;
for (const t of [2, 3]) {
  const pp = SM.plan(v1Save(), t);
  const rr2 = SM.migrate(v1Save(), t);
  if (pp.count !== rr2.steps.length) agree = false;
}
a(agree === true, 'C4 plan 的步数与 migrate 实跑步数一致（界面提示不许骗人）');

function cloneJSON(v) { return JSON.parse(JSON.stringify(v)); }

setTimeout(function () {
  console.log('');
  console.log('OPV29-Z5-30-V2529: ' + (fail === 0 ? 'pass' : 'FAIL') + ' ' + pass + ' / ' + (pass + fail));
  process.exit(fail === 0 ? 0 : 1);
}, 60);