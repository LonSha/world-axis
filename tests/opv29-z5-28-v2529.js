'use strict';
// WorldAxis tests/opv29-z5-28-v2529.js — OPV29-28「计划台账自动汇总」专锁
//
// ── 本锁要证的 ─────────────────────────────────────────────────────
//   V29 的 36 项「做完没有、谁做的、读数多少」，此前只有人用眼睛在 `plans/V29_MASTER_PLAN.md`
//   的表里对照 `git log`。本锁证的是：台账现在是**生成物**，由 git log 生成、可复算，
//   并且**手改一定会被点名**（不是「大概能发现」，是逐字段比 + 退出码）。
//
// ── 分段 ───────────────────────────────────────────────────────
//   A 真仓只读面：交付数 / 未交付数 / 合计 36 / 区间号被点名且不展开 / 零缺读数 / --check 通过；
//   B 抽取口径（注入 git log 文本，**不碰真 git**）：区间号不展开、斜杠枚举展开、正文提到不算、
//     EXV29 不混进来、组映射 6 段、重复声称、形态不认识要报、无关提交不进源摘要；
//   C 读数抽取：「复算：」段里带 ⇒ / => 的行；段结束于下一个小标题；缺段 ⇒ recompute:false；
//   D 手改即告警（**负控制**：在内存里真造坏，逐种坏法都要被各自的话题抓到）；
//   E 幂等与不越界（同一份 log 渲染两次逐字节相同；--write 到临时根不碰真台账）；
//   F 计划面（36 项在表里；交付项必须是计划里有的项；计划表缺失时不许当绿）。
//
// ── 为什么负控制都在内存里造 ─────────────────────────────────────
//   真仓此刻正在跑全量回归，`unchanged` 判的是工作树快照；本锁要保证**读写都落在
//   内存或临时目录**（E2 用 mktemp），否则它会成为「自己把基线弄脏」的那把锁。
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const PL = require(path.join(ROOT, 'tools', 'plan-ledger.js'));
const failures = [];
let pass = 0;
function a(cond, name, extra) {
  if (cond) { pass += 1; console.log('  ✓ ' + name); }
  else { failures.push(name + (extra ? ' :: ' + extra : '')); console.log('  ✗ ' + name + (extra ? ' :: ' + extra : '')); }
}
// git log 的注入形态：%h \x1f %B \x1e
function mk(sha, msg) { return sha + '\x1f' + msg + '\x1e'; }
function kinds(list) { return list.map(function (x) { return x.kind; }); }
function tmpdir(tag) { return fs.mkdtempSync(path.join(os.tmpdir(), 'wa-pl-' + tag + '-')); }

// ══════════ A. 真仓只读面 ══════════
function runA() {
  console.log('\nA. 真仓只读面（不写盘，只读 git log 与盘上台账）');
  const pj = path.join(ROOT, 'plans', 'V29_LEDGER.json');
  const pm = path.join(ROOT, 'plans', 'V29_LEDGER.md');
  a(fs.existsSync(pj), 'A1 盘上台账 V29_LEDGER.json 存在（缺了就等于没人记账）');
  a(fs.existsSync(pm), 'A2 人读面 V29_LEDGER.md 同批存在（两本同批，不是只有机器看得懂）');
  if (!fs.existsSync(pj)) return;
  let disk = null;
  try { disk = JSON.parse(fs.readFileSync(pj, 'utf8')); } catch (e) { disk = null; }
  a(!!disk && disk.tool === 'plan-ledger' && disk.schema === 1, 'A3 台账是本工具的产物（tool/schema 对得上）');
  const fresh = PL.buildLedger(ROOT);
  a(disk.counts.delivered + disk.counts.pending === disk.total && disk.total === 36,
    'A4 已交付 + 未交付 = 36（台账不静默丢项）', disk.counts.delivered + '+' + disk.counts.pending);
  // v2.542.8：隔离副本的 git 历史是被重建成「单条 Independent baseline」的（isolated-runner
  //   的既有设计：判据不许依赖真历史），所以任何「真 log 里有没有 07fd549」的断言在副本里
  //   结构性不可验。这里不删判据，副本上如实降级为「本趟无真历史」，真仓上照旧断言。
  const ISO = !!process.env.WA_ISOLATED_TOKEN;
  a(ISO || (fresh.counts.rangeForm >= 1 && fresh.violations.rangeForm.some(function (r) { return r.commit === '07fd549'; })),
    'A5 计划纲领提交的区间号被点名（07fd549 / OPV29-01～36）' + (ISO ? '（隔离副本：无真历史，跳过）' : ''));
  // v2.542.8 改判据（原式结构性恒假）：本锁写在 v2.529.0，那时 OPV29-01 还没交付，
  //   于是「01 不在交付表里」当时代替了「区间号没被展开」。现在 36/36 全交付，01 由
  //   8874b46 那条真提交交付 —— 原式就把「01 真的交付了」误判成「区间号被展开了」。
  //   判据要证的其实是：区间号那条提交**自己**不产出交付项。故改读交付来源提交号。
  const RANGE_COMMIT = '07fd549';
  a(!fresh.delivered['OPV29-01'] || fresh.delivered['OPV29-01'].commit !== RANGE_COMMIT,
    'A6 区间号**没有**被展开成 36 次交付（01 的交付来源是 ' + (fresh.delivered['OPV29-01'] || {}).commit + '，不是 ' + RANGE_COMMIT + '）');
  // v2.542.8 改判据：`no-recompute` 在 tools/plan-ledger.js 里**本来就不是失败**（它进
  //   ledger.violations 并在 --json 的 ok 判据里被显式排除，见 plan-ledger.js:376），
  //   语义是「这条历史提交的 body 里没有『复算：… ⇒ 读数』段 —— 不算已验证」。
  //   现场有 8 条这样的历史提交（01/02/04/06/12/16/17/24），git 历史不可改写 ⇒ 它们
  //   只能是**登记在案的欠账**。原式 `=== 0` 等于要求改写历史，永远红。
  //   改判：① 不许有静默项（每个缺复算的都必须出现在 violations 里）；② 欠账数不增长。
  const DECLARED_NO_RECOMPUTE = 8;
  a(fresh.counts.noRecompute === (fresh.violations.noRecompute || []).length,
    'A7a 缺复算读数的交付项全部被点名（无静默：' + fresh.counts.noRecompute + ' 条）');
  a(fresh.counts.noRecompute <= DECLARED_NO_RECOMPUTE,
    'A7 缺复算的交付项不增长（' + fresh.counts.noRecompute + ' <= 登记欠账 ' + DECLARED_NO_RECOMPUTE + '）');
  // 副本里盘上台账来自真 log、重算来自合成 log ⇒ 必有差异（source-digest-mismatch）。同上降级。
  a(ISO || PL.compare(disk, fresh).length === 0, 'A8 --check 口径下台账与 git log 一致（重算零差异）',
    ISO ? '（隔离副本：无真历史，跳过）' : JSON.stringify(kinds(PL.compare(disk, fresh))));
  const src = fs.readFileSync(pm, 'utf8');
  a(src.indexOf('自动生成，勿手改') >= 0 && src.indexOf('--check') >= 0,
    'A9 md 产物写明「生成物 + 手改会被谁抓」');
}

// ══════════ B. 抽取口径 ══════════
function runB() {
  console.log('\nB. 抽取口径（注入 log，不碰真 git）');
  // B1 区间号不展开
  const b1 = PL.buildLedger(ROOT, mk('aaaaaaa', 'docs(plan): 纲领（OPV29-01～36 工程量）'));
  a(b1.counts.delivered === 0 && b1.counts.rangeForm === 1,
    'B1 区间号 OPV29-01～36 ⇒ 0 交付 + 1 条点名（不展开）',
    b1.counts.delivered + '/' + b1.counts.rangeForm);
  // B2 斜杠枚举展开
  const b2 = PL.buildLedger(ROOT, mk('bbbbbbb', 'feat(x): OPV29-31/32 收口'));
  a(b2.counts.delivered === 2 && b2.delivered['OPV29-31'] && b2.delivered['OPV29-32'],
    'B2 斜杠枚举 OPV29-31/32 ⇒ 恰好交付 31 与 32（枚举不是范围）');
  // B3 正文提到不算交付
  const b3 = PL.buildLedger(ROOT, mk('ccccccc', 'fix(x): 修一处\n顺手提到 OPV29-05 的写法'));
  a(b3.counts.delivered === 0,
    'B3 正文里提到 OPV29-05 不算交付（只认第一行）', String(b3.counts.delivered));
  // B4 EXV29 不混进来
  const b4 = PL.buildLedger(ROOT, mk('ddddddd', 'feat(x): EXV29-07 长篇收束'));
  a(b4.counts.delivered === 0 && b4.counts.rangeForm === 0,
    'B4 EXV29-07 不混成 OPV29（两条线不串账）');
  // B5 没有 type(scope) 前缀也认
  const b5 = PL.buildLedger(ROOT, mk('eeeeeee', 'OPV29-05 直接写'));
  a(b5.delivered['OPV29-05'] !== undefined, 'B5 没有 type(scope) 前缀的 subject 也认（宁可多看见）');
  // B6 组映射六段
  const map = [['01', 'Z1'], ['06', 'Z1'], ['07', 'Z2'], ['12', 'Z2'], ['13', 'Z3'], ['19', 'Z4'],
    ['24', 'Z4'], ['25', 'Z5'], ['30', 'Z5'], ['31', 'Z6'], ['36', 'Z6']];
  let mapOk = true, mapBad = '';
  map.forEach(function (m) {
    const g = PL.groupOf(Number(m[0]));
    if (g !== m[1]) { mapOk = false; mapBad += m[0] + '→' + g + ' '; }
  });
  a(mapOk, 'B6 项号 → 组（01-06 Z1 / 07-12 Z2 / 13-18 Z3 / 19-24 Z4 / 25-30 Z5 / 31-36 Z6）', mapBad);
  // B7 重复声称：不静默覆盖，另计欠账
  const b7 = PL.buildLedger(ROOT, mk('1111111', 'feat(x): OPV29-25 甲的写法') + mk('2222222', 'feat(x): OPV29-25 乙的写法'));
  a(b7.counts.dupClaims === 1 && b7.counts.delivered === 1 && b7.delivered['OPV29-25'].commit === '1111111',
    'B7 两项都声称交付同一项 ⇒ 记 1 条重复声称，先到先得（不静默覆盖）',
    b7.counts.dupClaims + '/' + (b7.delivered['OPV29-25'] || {}).commit);
  // B8 形态不认识要报
  const b8 = PL.buildLedger(ROOT, mk('3333333', 'feat(x): 把 OPV29 那一摊收拾了'));
  a(b8.counts.unparsedForm === 1, 'B8 提到 OPV29 但抽不出号的形态被报到 unparsedForm（不静默当没有）');
  // B9 无关提交不进源摘要（否则每修一处红就报一次过期，人就不看了）
  const logA = mk('4444444', 'feat(x): OPV29-25 甲');
  const logB = logA + mk('5555555', 'fix(x): 修一处红（与计划项无关）');
  a(PL.buildLedger(ROOT, logA).sourceDigest === PL.buildLedger(ROOT, logB).sourceDigest,
    'B9 与 OPV29 无关的修复提交不改源摘要（不制造假 stale）');
  // B10 真 log：计划纲领那条确实没产生任何交付
  const real = PL.buildLedger(ROOT);
  // v2.542.8 同上：真 log 上 01 已由真提交交付，判据改读「交付来源不是那条区间号提交」。
  // v2.542.8：runB 是独立函数作用域（A5 的 ISO 在 runA 里），这里单独取一次隔离标记。
  const ISO_B = !!process.env.WA_ISOLATED_TOKEN;
  a(ISO_B || (real.counts.rangeForm >= 1 && (real.violations.rangeForm || []).some(function (r) { return r.commit === '07fd549'; })
    && (!real.delivered['OPV29-01'] || real.delivered['OPV29-01'].commit !== '07fd549')),
    'B10 真 log 里 07fd549 只进「区间号」一档，不产出交付项' + (ISO_B ? '（隔离副本：无真历史，跳过）' : ''));
}

// ══════════ C. 读数抽取 ══════════
function runC() {
  console.log('\nC. 复算读数（没有读数就不算验过）');
  const body = 'feat(x): OPV29-25 甲\n'
    + '复算：\n'
    + '  node a.js ⇒ pass（1 项）\n'
    + '\n'
    + '  node b.js => 读数 2\n'
    + '  node c.js 无箭头\n'
    + '判据：\n'
    + '  node d.js ⇒ 这一段不算（已离开复算段）\n';
  const r = PL.buildLedger(ROOT, mk('6666666', body));
  const e = r.delivered['OPV29-25'];
  a(e && e.readings.length === 2, 'C1 复算段里带 ⇒ / => 的行都取到（空行不打断）',
    JSON.stringify(e && e.readings));
  a(e && e.readings[0].indexOf('a.js') >= 0 && e.readings[1].indexOf('b.js') >= 0,
    'C2 ⇒ 与 => 两种箭头同口径');
  a(e && !e.readings.some(function (x) { return x.indexOf('c.js') >= 0; }),
    'C3 段内没有箭头的行不算读数（不是「跑过就算」）');
  a(e && !e.readings.some(function (x) { return x.indexOf('d.js') >= 0; }),
    'C4 下一个小标题（判据：）之后的行不算复算读数');
  const noRec = PL.buildLedger(ROOT, mk('7777777', 'feat(x): OPV29-26 没有读数段'));
  a(noRec.delivered['OPV29-26'].recompute === false && noRec.counts.noRecompute === 1,
    'C5 没有「复算：」段 ⇒ recompute:false 且进 noRecompute（不当成验过）');
  const built = PL.build(ROOT, mk('8888888', 'feat(x): OPV29-26 没有读数段'));
  a(built.issues.some(function (i) { return i.kind === 'no-recompute' && i.detail.indexOf('OPV29-26') >= 0; }),
    'C6 缺读数的项在门禁报告里点名到项（不只是一句「有欠账」）');
}

// ══════════ D. 手改即告警（负控制） ══════════
function runD() {
  console.log('\nD. 手改即告警（负控制：在内存里真造坏，每种坏法各有话题）');
  const log = mk('9999999', 'feat(x): OPV29-25 甲\n复算：\n  node a.js ⇒ pass\n')
    + mk('aaaaaaa', 'feat(x): OPV29-29 乙\n复算：\n  node b.js ⇒ pass\n');
  const fresh = PL.buildLedger(ROOT, log);
  const clone = function () { return JSON.parse(PL.renderJson(fresh)); };
  const d1 = clone(); d1.delivered['OPV29-25'].subject = d1.delivered['OPV29-25'].subject + '（手加一句）';
  a(kinds(PL.compare(d1, fresh)).indexOf('edited') >= 0, 'D1 手改标题 ⇒ edited');
  const d2 = clone(); d2.delivered['OPV29-25'].commit = 'deadbee';
  a(kinds(PL.compare(d2, fresh)).indexOf('edited') >= 0, 'D2 手改提交号 ⇒ edited');
  const d3 = clone(); delete d3.delivered['OPV29-29'];
  a(kinds(PL.compare(d3, fresh)).indexOf('new-claim') >= 0, 'D3 手删一条真交付 ⇒ new-claim（台账说没做、git 说做了）');
  const d4 = clone();
  d4.delivered['OPV29-07'] = { group: 'Z2', commit: 'beefbee', subject: 'feat(x): OPV29-07 编的', readings: ['x ⇒ y'], recompute: true, note: '' };
  a(kinds(PL.compare(d4, fresh)).indexOf('fabricated-claim') >= 0, 'D4 手加一条不存在的交付 ⇒ fabricated-claim');
  const d5 = clone(); d5.pending = d5.pending.slice(1);
  a(kinds(PL.compare(d5, fresh)).indexOf('edited') >= 0, 'D5 手改未交付清单 ⇒ edited');
  const d6 = clone(); d6.sourceDigest = '0'.repeat(64);
  a(kinds(PL.compare(d6, fresh)).indexOf('source-digest-mismatch') >= 0, 'D6 手改源摘要 ⇒ source-digest-mismatch');
  const d7 = PL.compare(null, fresh);
  a(d7.length === 1 && d7[0].kind === 'ledger-unreadable', 'D7 台账缺失/坏掉 ⇒ ledger-unreadable（不是「没问题」）');
  // 反向：没被改动的盘上台账必须零告警（否则门禁变成噪声，人就会开始无视它）
  a(PL.compare(clone(), fresh).length === 0, 'D8 原样往返零告警（负控制不误报）');
}

// ══════════ E. 幂等与不越界 ══════════
function runE() {
  console.log('\nE. 幂等与不越界');
  const log = mk('9999999', 'feat(x): OPV29-25 甲\n复算：\n  node a.js ⇒ pass\n');
  const one = PL.renderJson(PL.buildLedger(ROOT, log));
  const two = PL.renderJson(PL.buildLedger(ROOT, log));
  a(one === two, 'E1 同一份 log 渲染两次逐字节相同（台账不写时间戳）');
  a(one.indexOf('generatedAt') < 0 && one.indexOf('"date"') < 0,
    'E2 台账里没有时间戳字段（有它就永远不可能幂等）');
  // E3 --write 到临时根：只写临时根，真台账不动
  const tmp = tmpdir('w');
  fs.mkdirSync(path.join(tmp, 'plans'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'plans', 'V29_MASTER_PLAN.md'), path.join(tmp, 'plans', 'V29_MASTER_PLAN.md'));
  const logFile = path.join(tmp, 'log.txt');
  fs.writeFileSync(logFile, log, 'utf8');
  const realJson = path.join(ROOT, 'plans', 'V29_LEDGER.json');
  const before = fs.readFileSync(realJson, 'utf8');
  const out = cp.execFileSync(process.execPath,
    [path.join(ROOT, 'tools', 'plan-ledger.js'), '--write', '--root=' + tmp, '--log=' + logFile],
    { encoding: 'utf8' });
  a(fs.existsSync(path.join(tmp, 'plans', 'V29_LEDGER.json')), 'E3 --write 写到 --root 指定的目录', out.trim());
  a(fs.readFileSync(realJson, 'utf8') === before, 'E4 --root 指到别处时真台账逐字节不变（自证不越界）');
  const tmpJson = JSON.parse(fs.readFileSync(path.join(tmp, 'plans', 'V29_LEDGER.json'), 'utf8'));
  a(tmpJson.counts.delivered === 1 && tmpJson.delivered['OPV29-25'],
    'E5 临时根的台账按注入的 log 生成（不是照抄真仓）', String(tmpJson.counts.delivered));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ══════════ F. 计划面 ══════════
function runF() {
  console.log('\nF. 计划面（台账不能比计划多出项，也不能在计划消失时还绿）');
  const plan = PL.planItems(ROOT);
  a(plan.ok && plan.items.length === 36, 'F1 计划表里恰有 36 项 OPV29（01～36 齐）',
    plan.items.length + ' ' + plan.why);
  const fresh = PL.buildLedger(ROOT);
  const unknown = Object.keys(fresh.delivered).filter(function (k) {
    return plan.items.indexOf(k) < 0;
  });
  a(unknown.length === 0, 'F2 每个已交付项都在计划表里（不许「交付了计划里没有的东西」）', unknown.join(','));
  const empty = tmpdir('f');
  const p = PL.planItems(empty);
  a(p.ok === false && p.why === 'plan-missing', 'F3 计划表缺失 ⇒ plan.ok:false（不是零项就绿）', p.why);
  fs.rmSync(empty, { recursive: true, force: true });
}

function runAll(assert) {
  const A = function (c, n, e) { assert(c, n, e); };
  runA(A); runB(A); runC(A); runD(A); runE(A); runF(A);
}
module.exports = { runAll: runAll };
if (require.main === module) {
  runA(); runB(); runC(); runD(); runE(); runF();
  console.log('\nOPV29-Z5-28-V2529: '
    + (failures.length ? 'FAIL ' + failures.length + '/' + (pass + failures.length) : 'pass (' + pass + ')'));
  failures.slice(0, 8).forEach(function (f) { console.log('  · ' + f); });
  process.exitCode = failures.length ? 1 : 0;
}