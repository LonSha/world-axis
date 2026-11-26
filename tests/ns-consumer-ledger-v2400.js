'use strict';
/**
 * tests/ns-consumer-ledger-v2400.js — 零读 ns 定性账本专锁（v2.400.0 · V22 OPV22-3）。
 *
 * 治的缺口（写在最前面，因为它是本文件存在的唯一理由）：
 *   tests/module-cycle-gate.js 报 35 个「模块提供了、产品源面零读」的 ns，此前这条读数
 *   **只有数字**：既没有地方写明「为什么它零读」，也没有判据区分
 *       「本该有消费点却漏接了」  与  「它本来就只该由 tests/宿主消费」
 *   ⇒ 两者在读数上完全同形。这正是 l3-registry 治过的同一种病（同形不可分辨）。
 *
 * 本锁钉住四件事：
 *   A 账本静态契约：五类分类法齐备、每条 entry 四字段齐备、纪律条文齐备、键名唯一。
 *   B 运行时一致性：账本键集 ↔ 门禁 deadNs **双向一致**；分类分布与 provider 逐条相符。
 *   C 不变式：audit() 纯只读（连调不变量）、接账本前后**零读判据口径一字未动**。
 *   N 负控制：
 *       N1–N5 破坏「判据的输入真源」（账本文本）⇒ 三类新判据必须各自精确点名。
 *       N6    破坏「判据本体」（内存副本）⇒ 关掉定性面后同一份坏账本必须变绿（反证断言非空转）。
 *       N7    **真源码破坏**：真改一个引擎文件注入零读 ns ⇒ 门禁必须 exit≠0 且点名到文件；
 *             结束时 try/finally 逐字节还原 + sha256 校验（还原失败即本锁自己抛）。
 *
 * 关于 N7 为什么不走内存副本：验收纪律第 1 条要的就是「真源码破坏」，即证明判据在
 *   **真实文件系统**上会现形，而不是在一个人造副本里。风险（验证者自己破坏仓库）由
 *   try/finally + sha256 双重兜住：无论断言抛不抛，finally 都会还原并核对摘要。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const vm = require('vm');

const BASE = path.join(__dirname, '..');
const LEDGER_REL = 'tests/ns-consumer-ledger.json';
const GATE_REL = 'tests/module-cycle-gate.js';
const SMOKE_REL = 'tools/smoke.js';
/** 真源码破坏的靶子（一个稳定存在、且不会被并行任务改写的引擎）。 */
const VICTIM_REL = 'engines/courier-dispatch.js';
/** 注入的探针 ns 名：`__` 前缀 + 本锁标识，确保不会与真 ns 撞名。 */
const PROBE_NS = '__negCtlProbeNs2400';
/** 分类法五类（与账本 _classes 必须逐字一致）。 */
// v2.529.0（缝合批 19 件）：新增第 6 类 `pending-wire`。理由：19 件外部缝合引擎已入库，
//   功能面与专锁都在，但**产品消费点尚未接线**（谁会在什么时候读它，逐条写在 evidence 里）。
//   这个状态既不是 readonly-api（不是刻意不读），也不是 stale（不是死面：有测试读点、有明确接线计划），
//   硬塞进任一类都是失真。所以给它一个名字，并在纪律里加上时限（⑤：超过一个版本周期必须改判或补接线）。
const CLASSES = ['wired', 'readonly-api', 'stale', 'derived-handle', 'gate-selfwitness', 'pending-wire'];
/** 零读 ns 的既有基数（v2.380.0 基线读数；变化必须显式改这里并写清原因）。
 *  v2.409.0 跟位：35 → 38。v2.407.0「三缝 + 七主线」新增引擎（director / fact-continuity /
 *  branch-continuity / summarizer-adapter / reading-bookmark / stage-session / memory-relay 等）
 *  带来 3 个新的「产品源面零读」ns（stage / summarizerAdapter / readingBookmark 等，
 *  由 module-cycle-gate 现场 deadNs 实测 38 条），账本 entries 已逐条定性补登；
 *  与门禁 deadNs 双向一致已由 B 组判据复核。 */
// v2.529.0（缝合批 19 件）：47 → 66（+19）。这 19 条**是本批引入的**（每件一个新命名空间），
//   与 v2.524.0 那次「+9 不是本批引入」的情形不同 —— 所以这次必须逐条登记，
//   不能像上次那样只解释来源。19 条的 cls 全是 pending-wire，evidence 写明消费点归属。
// v2.542.12 跟位：69 -> 68（jsonRepair 已被面板 dcPayload 的 catch 真接上 ⇒ 出表）。
//   「补完即出表」是账本 _classes 里 wired 档的原文，这里就是第一次真的发生。
// v2.542.14 跟位：68 -> 67。elapsedEvidence 由 readonly-api 出表 —— 它不再零读：
//   engines/toxic-metabolism.js 的 resolveMinutes 现在真调它的 parse/verify，把「代谢过了多久」
//   从常量代劳改为证据判定（这是该账本 evidence 里写明的「独立一步」，本批落地）。
// v2.542.20：67 -> 66（narrativeDeduction 已接线：它的五个导出被 action-desk-routes 真调，按纪律四从 ns 账本删行出表）。
// v2.542.23：66 -> 65（storyExport 按纪律④出表：panel「导出正文」真调 storyExport.build，
//   接线完成即删除本行——这正是 _classes.pending-wire 的原文，不是判据放宽）。
// v2.542.24：65 -> 64（apiVault 按纪律④出表：api-router 的读写链真调它）。
// v2.585.0（R261）：54 → 55 —— appearanceLexicon 入库（外貌描写词表，data-only）。
//   零读是**设计**：判据在 engines/appearance.js 的 LAYER_ITEMS，词表只供预设/注入拼装取词；
//   刻意性由 tests/appearance-items-v2585.js 的 C5 静态钉住（appearance.js 里不出现该名）。
//   故条目按 readonly-api 入账，不是 pending-wire（不是欠接线，是刻意不接）。
// v2.594.0（本版补记，如实说明 54 → 49 这段空白）：v2.569.0 以后的四轮接线（R265 unifiedPending /
//   R267 refine / R268 fieldWriters / R269 observationProjection）按纪律④逐条出表，但只有本轮记得同步本常量；
//   故 55 这个值早已过期 —— 本轮不猜中间值，只把实测 49 写上并把口径写清：「零读 ns 真少四台（+ 一台历史差额），不是判据放宽」。
//   复算：node tests/module-cycle-gate.js 的「零读 ns 49/49」与本账本 entries 长度同源。
// v2.596.0（R271 FAG-1）：49 → 48。factAge 按纪律④出表 —— 它的新消费方是 engines/fact-age-bridge.js，
//   而那道桥有真产品读面（工具页「事实老化面」段）。**这不等于原来的缺口被治好**：
//   桥今天报的正是「no-last-turn，本读数不可用」—— 出表的是「零读」，不是「无数据」。
//   复算：grep -rn 'WA.factAge' engines/fact-age-bridge.js
const BASE_DEAD_NS = 44;   // v2.600.0（BND-1）：45 → 44 = binding 出表（binding-bridge 逐层调 binding.list 只取键名、读 SCOPES 与 getSettings 判开关，成了它第一个产品面读者）。
//   销行销的是「零读」，不是「绑定已经能用」—— 桥今天只报三层各多少键、谁遮住了谁，不 bind 不 unbind。
//   复算：grep -rn 'WA.binding' engines/binding-bridge.js
// v2.599.0（CNT-1）：46 → 45 = contrast 出表（contrast-bridge 按 CSS 变量对算 WCAG，
//   顺带补上全仓 `getComputedStyle` 0 命中的空白）。销行销的是「零读」，不是「配色都合格」。
// v2.598.0（SLT-1）：47 → 46 = slotFormat 出表   // v2.598.0（SLT-1）：47 → 46 = slotFormat 出表（byte-budget-bridge 成为它第一个产品面读者：
//   用 byteLength 量全仓字符串、用 MAX_NAME_BYTES 算存档名余量）。销行销的是「零读」，不是「无数据」。
// v2.597.0（ENS-1）：48 → 47 = ensemble 出表   // v2.597.0（ENS-1）：48 → 47 = ensemble 出表（engines/ensemble-bridge.js 成为它第一个产品面读者：
//   读 getSettings / STRATEGIES / stat，且不调 run）。**这不等于原来的缺口被治好**：桥今天报的正是 no-channel-ready / no-runs
//   —— 出表的是「零读」，不是「无数据」。
// v2.594.0：实测 49（基线原写 55，自 v2.569.0 起未跟位）  // v2.594.0：实测 49（基线原写 55，自 v2.569.0 起未跟位） —— greenKeys 出表（engines/worldbook.js 的 constGate 用 deriveGreenKeys 给常驻条目派生短键，成为“本轮聊到没聊到”的事前判据；零读 ns 真少一条，不是判据放宽）
//   为什么这 9 条不是本批引入的：本批五个新 ns（injectDelta / narrowConsumers / rejectPhrase /
//   settingsIndex / saveCurve）**都**被产品源面真读（render/inject.js 读前两个、
//   engines/action-desk.js 读 rejectPhrase、engines/tool-diag.js 读后两个），所以它们不在零读面上。
//   差集来自 v2.409.0（38 条基线）之后若干批新增引擎的只读面至今无人消费——账本 entries 里逐条列着，
//   本条只把「面真变了」这件事跟位到现场值，不改零读判据本身。

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8')
    // OPV29-08：1328 条动作路由已出闸到 engines/action-desk-routes.js（工厂）。
    //   本读取器给 rel 是 action-desk 时补上路由表源 —— 判据问的是「这条路由在不在」，
    //   不是「它写在哪个文件」。
    + (rel === 'engines/action-desk.js'
      ? String.fromCharCode(10) + fs.readFileSync(path.join(BASE, 'engines/action-desk-routes.js'), 'utf8')
      : ''); }
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function gate() { return require(path.join(BASE, GATE_REL)); }
function ledger() { return JSON.parse(rd(LEDGER_REL)); }
function tryJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }
/**
 * audit() 的进程内缓存。
 *   为什么要它：单次 audit 现场约 750–980ms（扫 441 个文件），而本锁要做 ~20 次调用。
 *   不加缓存实测 9796ms，已顶到快档 MAX_MS=12000 的 82%；加缓存后回到 3s 量级。
 *   缓存键是 opt 的 JSON 序列化 —— 本锁的 opt 只有 `{}` / `{nsLedger:null}` / `{nsLedgerText}` 三类，
 *   都是纯数据、无函数，序列化即等价。**这不改变任何断言强度**：同一 opt 重复调用本来就该同结果，
 *   而 C1/C2/C3 正是在钉这一点（缓存若掩盖了不确定性，C 组会失败）。
 */
const _auditCache = new Map();
function auditOf(opt) {
  const key = JSON.stringify(opt || {});
  if (_auditCache.has(key)) return _auditCache.get(key);
  const r = gate().audit(opt);
  _auditCache.set(key, r);
  return r;
}
function runGateCli() {
  const r = cp.spawnSync(process.execPath, [GATE_REL], { cwd: BASE, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function names(arr) {
  return arr.map(function (x) { return (x && x.ns) || x; });
}

// ────────────────────────────── A 静态契约 ──────────────────────────────
function runA(A) {
  const raw = rd(LEDGER_REL);
  const L = tryJson(raw);
  A(!!L, 'A1 账本可解析为 JSON');
  if (!L) return;

  A(typeof L._note === 'string' && L._note.length > 80,
    'A2 _note 写明「治的是什么病」（不是一句占位符）');
  A(/同形不可分辨/.test(L._note || ''),
    'A2b _note 点明病根是「同形不可分辨」（与本仓 l3-registry 同族）');

  const cls = L._classes || {};
  A(Object.keys(cls).length === CLASSES.length,
    'A3 分类法恰 ' + CLASSES.length + ' 类（实 ' + Object.keys(cls).length + '）');
  CLASSES.forEach(function (c) {
    A(typeof cls[c] === 'string' && cls[c].length > 20, 'A3.' + c + ' 该类有实质定义（不是空串占位）');
  });

  const dis = L._discipline;
  // v2.529.0（缝合批）：纪律 4 → 5（新增 ⑤ pending-wire 的时限条款）。
  A(Array.isArray(dis) && dis.length === 5, 'A4 纪律恰 5 条（实 ' + (Array.isArray(dis) ? dis.length : 'N/A') + '）');
  A(Array.isArray(dis) && dis.some(function (s) { return /禁止改账本销账/.test(s); }),
    'A4b 纪律含「stale 不得替代 dead-export-ledger，禁止改账本销账」');
  A(Array.isArray(dis) && dis.some(function (s) { return /未定性/.test(s) && /计红/.test(s); }),
    'A4c 纪律含「新增零读 ns 未登记 ⇒ 报未定性并计红」');
  A(Array.isArray(dis) && dis.some(function (s) { return /双向一致/.test(s); }),
    'A4d 纪律含「账本键集与门禁 deadNs 双向一致」');
  A(Array.isArray(dis) && dis.some(function (s) { return /pending-wire/.test(s) && /时限|一个版本周期/.test(s); }),
    'A4e 纪律含「pending-wire 有时限：超一个版本周期必须补接线或改判 stale」');

  const E = L.entries || {};
  const keys = Object.keys(E);
  A(keys.length === BASE_DEAD_NS,
    'A5 条目数 === 基线零读数 ' + BASE_DEAD_NS + '（实 ' + keys.length + '；若门禁零读面真变了，'
    + '必须同时改 BASE_DEAD_NS 并在此写明原因）');

  const missing = [];
  keys.forEach(function (k) {
    const e = E[k] || {};
    const bad = [];
    if (!e.cls) bad.push('cls');
    if (!e.provider) bad.push('provider');
    if (!e.evidence) bad.push('evidence');
    if (!e.recompute) bad.push('recompute');
    if (e.cls && CLASSES.indexOf(e.cls) < 0) bad.push('cls-not-in-classes');
    if (bad.length) missing.push(k + '[' + bad.join(',') + ']');
  });
  A(missing.length === 0, 'A6 每条 entry 四字段齐备且 cls 合法（缺项 ' + (missing.join(' ') || '无') + '）');

  const thin = keys.filter(function (k) { return (E[k].evidence || '').length < 30; });
  A(thin.length === 0, 'A7 evidence 全部是实质理由（≥30 字；过短 ' + (thin.join(',') || '无') + '）');

  // 每条的 recompute 必须是**真命令**（以 grep / node / sed 开头），不是一句描述。
  const notCmd = keys.filter(function (k) { return !/^(grep|node|sed|ls|cat)\b/.test(E[k].recompute || ''); });
  A(notCmd.length === 0, 'A8 recompute 全部是可执行命令（不可执行的 ' + (notCmd.join(',') || '无') + '）');

  // 键名唯一性（JSON 对象天然唯一，但要防「同一 ns 两条互相矛盾的说法」：
  //   用 provider 面反查，同一个 ns 不可能有两个 provider 字段）。
  A(new Set(keys).size === keys.length, 'A9 键名无重复');

  // v2.542.9 改判据（原来是冻结常量 '2.530.0'）：账本是版本面登记的**副本**
  //   （tools/release-manifest.js 的 VERSION_SURFACE 里 kind:'mirror'），而副本的
  //   唯一合法值就是真源 index.js:VERSION。冻结常量有两个错：①版本面一动它就恒假
  //   （同一个「把当时的事实当判据」的病，本仓已犯多次）；②它与版本面规则**互斥** ——
  //   真源是 2.524.0 时写 2.530.0，会让 opv29-z5-27 的 A4「无载体与真源不一致」必然红。
  //   改成读真源再严格相等：仍然**不放宽成「大于等于」**（忘升账本照样红，这条门禁
  //   不许退化成装饰），只是把「真值是几」交给唯一真源，不再由本文件抄一份。
  const CANON = (function () {
    const src = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
    const m = src.match(/const VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'/);
    return m ? m[1] : null;
  })();
  A(CANON !== null && L.version === CANON,
    'A10 账本 version === 版本面真源（实 ' + L.version + ' / 真源 ' + CANON + '）');
}

// ────────────────────────────── B 运行时一致性 ──────────────────────────────
function runB(A) {
  const L = ledger();
  const r = auditOf({});
  const E = L.entries || {};
  const ledKeys = Object.keys(E);
  const deadKeys = names(r.deadNs);

  A(r.nsLedgerAvailable === true, 'B1 门禁认到账本（nsLedgerAvailable=true）');
  A(r.nsLedgerCount === ledKeys.length, 'B2 门禁读到的条数 === 账本条数（' + r.nsLedgerCount + '/' + ledKeys.length + '）');

  const onlyGate = deadKeys.filter(function (n) { return !E[n]; });
  const onlyLed = ledKeys.filter(function (n) { return deadKeys.indexOf(n) < 0; });
  A(onlyGate.length === 0, 'B3 门禁有、账本无 ⇒ 0 条（未定性：' + (onlyGate.join(',') || '无') + '）');
  A(onlyLed.length === 0, 'B4 账本有、门禁无 ⇒ 0 条（过期登记：' + (onlyLed.join(',') || '无') + '）');
  A(r.undeterminedNs.length === 0 && r.expiredNs.length === 0 && r.badClassNs.length === 0,
    'B5 三类新判据在真账本上全为 0（未定性/过期/不合规 = '
    + r.undeterminedNs.length + '/' + r.expiredNs.length + '/' + r.badClassNs.length + '）');
  A(r.ok === true, 'B6 门禁整体 ok=true（problems=' + r.problems + '）');

  // provider 逐条与门禁现场读数相符（防「账本抄错提供方」这种静默错账）。
  const prov = {};
  (r.deadNs || []).forEach(function (d) { prov[d.ns] = d.providers || []; });
  const mis = ledKeys.filter(function (k) {
    if (!prov[k]) return false;
    return prov[k].indexOf(E[k].provider) < 0;
  });
  A(mis.length === 0, 'B7 每条 provider 与门禁现场提供方一致（不符 ' + (mis.join(',') || '无') + '）');

  // stale 类必须在 dead-export-ledger 有对应冻结条目（纪律②的机器化落实）。
  const D = tryJson(rd('tests/dead-export-ledger.json')) || { dead: {} };
  const deadExp = Object.keys(D.dead || {});
  const staleKeys = ledKeys.filter(function (k) { return E[k].cls === 'stale'; });
  const orphanStale = staleKeys.filter(function (ns) {
    return deadExp.filter(function (k) { return k === ns || k.indexOf(ns + '.') === 0; }).length === 0;
  });
  A(staleKeys.length > 0, 'B8 stale 类非空（实 ' + staleKeys.length + ' 条）');
  A(orphanStale.length === 0,
    'B8b 每条 stale 在 dead-export-ledger 都有冻结条目（孤儿 ' + (orphanStale.join(',') || '无') + '）');

  // 分类分布必须真的覆盖多种（若全落一类，说明「定性」被当成批量销账）。
  const dist = {};
  ledKeys.forEach(function (k) { dist[E[k].cls] = (dist[E[k].cls] || 0) + 1; });
  const used = Object.keys(dist).length;
  A(used >= 4, 'B9 分类分布覆盖 ≥4 类（实 ' + used + ' 类：' + JSON.stringify(dist) + '）');
  A(!dist.wired, 'B9b wired 类为 0 条（当前没有「本该读却漏接」的已知项；'
    + '一旦出现必须补消费点，不许把它写成别的类蒙过去）');
}

// ────────────────────────────── C 不变式 ──────────────────────────────
function runC(A) {
  const G = gate();
  const before = sha(path.join(BASE, GATE_REL));
  const ledBefore = sha(path.join(BASE, LEDGER_REL));

  // C1/C2/C3 必须用**两次真调用**：缓存会掩盖不确定性，这里刻意绕过缓存。
  const r1 = G.audit({});
  const r2 = G.audit({});
  A(JSON.stringify(r1.deadNs) === JSON.stringify(r2.deadNs), 'C1 连调不变量：两次 audit 的 deadNs 逐字相同');
  A(r1.problems === r2.problems && r1.ok === r2.ok, 'C2 连调不变量：problems / ok 稳定');
  A(r1.edgesAll === r2.edgesAll, 'C3 连调不变量：边数稳定（' + r1.edgesAll + '）');

  // 接账本 vs 不接账本：零读判据口径必须一字未动（这是「不许改判据放行」的反向证明）。
  const off = auditOf({ nsLedger: null });
  A(names(off.deadNs).join(',') === names(r1.deadNs).join(','),
    'C4 接账本前后 deadNs 清单逐字相同 ⇒ 零读判据口径一字未动');
  A(off.edgesAll === r1.edgesAll && off.nsProvided === r1.nsProvided,
    'C5 接账本前后 边数/提供方数不变（' + r1.edgesAll + '/' + r1.nsProvided + '）');
  A(off.ok === true && r1.ok === true, 'C6 接与不接账本都为 ok=true（账本没被用来「造绿」也没被用来「造红」）');

  A(sha(path.join(BASE, GATE_REL)) === before, 'C7 本锁不修改门禁文件（跑完 sha256 相同）');
  A(sha(path.join(BASE, LEDGER_REL)) === ledBefore, 'C8 本锁不修改账本文件（跑完 sha256 相同）');

  // 账本必须被真门禁消费，不能是一份没人读的文档。
  A(/ns-consumer-ledger\.json/.test(rd(GATE_REL)),
    'C9 门禁源码里真的引用了 ns-consumer-ledger.json（账本不是摆设）');
  const smoke = rd(SMOKE_REL);
  A(/module-cycle-gate\.js/.test(smoke),
    'C10 module-cycle-gate 在快档集 SMOKE_SET 里 ⇒ 本锁的判据每次 commit 前都会跑');
}

// ────────────────────────────── N 负控制 ──────────────────────────────
function runN(A) {
  const G = gate();
  const realText = rd(LEDGER_REL);
  const real = JSON.parse(realText);

  // N1 未定性：删一条 ⇒ 必须红且精确点名
  const c1 = JSON.parse(realText);
  const victim = Object.keys(c1.entries)[0];
  delete c1.entries[victim];
  const r1 = auditOf({ nsLedgerText: JSON.stringify(c1) });
  A(r1.ok === false, 'N1 删一条 entry ⇒ ok=false（实 ' + r1.ok + '）');
  A(r1.undeterminedNs.length === 1 && r1.undeterminedNs[0].ns === victim,
    'N1b 未定性精确点名 ' + victim + '（实 ' + JSON.stringify(names(r1.undeterminedNs)) + '）');
  A((r1.undeterminedNs[0].providers || []).length > 0, 'N1c 未定性条目带提供方（人读能追到文件）');

  // N2 过期登记：加一条幽灵 ⇒ 必须红且精确点名
  const c2 = JSON.parse(realText);
  c2.entries.__ghostNs2400 = { cls: 'stale', provider: 'core/nope.js', evidence: 'x'.repeat(40), recompute: 'true' };
  const r2 = auditOf({ nsLedgerText: JSON.stringify(c2) });
  A(r2.ok === false, 'N2 加幽灵登记 ⇒ ok=false');
  A(r2.expiredNs.length === 1 && r2.expiredNs[0] === '__ghostNs2400',
    'N2b 过期登记精确点名（实 ' + JSON.stringify(r2.expiredNs) + '）');

  // N3 不合规三型：cls 拼错 / 缺 evidence / 缺 provider。
  //   三型合在**一份账本、一次 audit** 里验：badClassNs 是逐条报的，
  //   若判据只会「报一条就收手」，这里就会少报 ⇒ 合并不降低强度，反而多钉一条「逐条报全」。
  const c3 = JSON.parse(realText);
  const v2 = Object.keys(c3.entries)[1];
  const v3 = Object.keys(c3.entries)[2];
  c3.entries[victim].cls = 'readonly-API';   // 大小写错
  delete c3.entries[v2].evidence;            // 缺理由
  delete c3.entries[v3].provider;            // 缺提供方
  const r3 = auditOf({ nsLedgerText: JSON.stringify(c3) });
  const bad = names(r3.badClassNs);
  A(r3.ok === false, 'N3 三类不合规 ⇒ ok=false');
  A(bad.length === 3, 'N3b 三类不合规逐条报全（实 ' + bad.length + ' 条：' + bad.join(',') + '）');
  A(bad.indexOf(victim) >= 0, 'N3c cls 拼错被点名（' + victim + '）');
  A(bad.indexOf(v2) >= 0, 'N3d 缺 evidence 被点名（' + v2 + '）');
  A(bad.indexOf(v3) >= 0, 'N3e 缺 provider 被点名（' + v3 + '）');

  // N4 不可用 ≠ 未定性（本仓反复治理的那类病：把「读不到」伪装成「有缺陷」）
  const r6 = auditOf({ nsLedger: null });
  A(r6.nsLedgerAvailable === false, 'N4 账本缺失 ⇒ nsLedgerAvailable=false');
  A(r6.undeterminedNs.length === 0 && r6.expiredNs.length === 0,
    'N4b 账本缺失 ⇒ 不报 35 条未定性（不可用 ≠ 未定性）');
  A(r6.ok === true, 'N4c 账本缺失不因此计红（本面整面跳过）');
  const r7 = auditOf({ nsLedgerText: '{ not json at all' });
  A(r7.nsLedgerAvailable === false && r7.undeterminedNs.length === 0, 'N4d 坏 JSON ⇒ 视为不可用，不报未定性');
  const r8 = auditOf({ nsLedgerText: JSON.stringify({ version: '2.400.0' }) });
  A(r8.nsLedgerAvailable === false, 'N4e 缺 entries 面 ⇒ 视为不可用（不是「0 条已定性」）');

  // N5 反证断言非空转：**关掉判据本体**后，同一份坏账本必须变绿。
  //   做法：内存副本里把三处 `problems` 增量删掉，装载副本重跑。
  const gSrc = rd(GATE_REL);
  const nSrc = gSrc.replace(
    'undeterminedNs.length + expiredNs.length + badClassNs.length',
    '0 /* 负控制：定性面已关 */'
  );
  A(nSrc !== gSrc, 'N5 判据本体可被定位并破坏（锚点存在）');
  if (nSrc !== gSrc) {
    const mod = { exports: {} };
    const sandbox = {
      module: mod, exports: mod.exports, require: require, console: console,
      process: process, __dirname: path.join(BASE, 'tests'), __filename: path.join(BASE, GATE_REL),
      Buffer: Buffer, setTimeout: setTimeout, clearTimeout: clearTimeout
    };
    vm.runInNewContext(nSrc, sandbox, { filename: 'neg-copy-module-cycle-gate.js' });
    const G2 = mod.exports;
    const rBadOnCopy = G2.audit({ nsLedgerText: JSON.stringify(c1) });
    const rBadOnReal = auditOf({ nsLedgerText: JSON.stringify(c1) });
    A(rBadOnReal.ok === false, 'N5b 真判据上同一份坏账本 ⇒ ok=false（对照组）');
    A(rBadOnCopy.ok === true,
      'N5c 关掉定性面后同一份坏账本 ⇒ ok=true ⇒ 上面的红灯确实来自这三条判据，不是别处连带');
    A(names(rBadOnCopy.deadNs).join(',') === names(rBadOnReal.deadNs).join(','),
      'N5d 破坏副本与真判据的 deadNs 清单相同 ⇒ 破坏只动了「计红」，没动「零读」口径');
  }

  // N6 真源码破坏：真改引擎文件注入零读 ns ⇒ 门禁必须现形；try/finally 逐字节还原。
  const victimAbs = path.join(BASE, VICTIM_REL);
  const vBefore = sha(victimAbs);
  const vSrc = fs.readFileSync(victimAbs, 'utf8');
  A(vSrc.indexOf(PROBE_NS) < 0, 'N6 破坏前靶子里没有探针残留（上一次跑干净还原了）');
  // 踩坑记录：本仓有些源文件**末尾没有换行**（courier-dispatch.js 就是一例）。
  //   若注入写成 `vSrc + '\n...'` 而还原写成 `vSrc`，sha256 会一致（还原是对的）；
  //   但若用 git 之类按行尾规范化的工具收尾，就会出现「只差一个换行」的假污染。
  //   故这里显式断言「靶子原文本末尾是否有换行」并把注入接缝也按原样处理。
  const vEndsWithNl = /\n$/.test(vSrc);
  const inject = (vEndsWithNl ? '' : '\n')
    + '// OPV22-3 负控制临时注入（finally 逐字节还原）\n'
    + 'WA.' + PROBE_NS + ' = { x: 1 };\n';
  let broke = null, restored = false;
  try {
    // 扫描器认 `A.<ns> = ...`（A 为该文件的模块别名）。用局部参数名不会被识别 —— 踩过一次。
    fs.writeFileSync(victimAbs, vSrc + inject, 'utf8');
    broke = runGateCli();
  } finally {
    fs.writeFileSync(victimAbs, vSrc, 'utf8');
    restored = sha(victimAbs) === vBefore;
  }
  A(restored, 'N6b 靶子已逐字节还原（sha256 相同；原文件末尾换行=' + vEndsWithNl + '）');
  if (!restored) throw new Error('负控制还原失败：' + VICTIM_REL + ' 摘要不符，拒绝继续（仓库已被污染）');

  A(!!broke && broke.code !== 0, 'N6c 注入零读 ns ⇒ 门禁 exit≠0（实 ' + (broke && broke.code) + '）');
  A(!!broke && broke.out.indexOf(PROBE_NS) >= 0, 'N6d 门禁读数里出现注入的 ' + PROBE_NS);
  A(!!broke && /未定性/.test(broke.out), 'N6e 门禁把注入项报成「未定性」');
  A(!!broke && broke.out.indexOf(VICTIM_REL) >= 0,
    'N6f 门禁点名到真文件 ' + VICTIM_REL + '（不是只报一个裸 ns 名）');

  const after = runGateCli();
  A(after.code === 0, 'N6g 还原后门禁回到 exit 0（实 ' + after.code + '）');
  A(after.out.indexOf(PROBE_NS) < 0, 'N6h 还原后读数里不再有探针');

  A(sha(victimAbs) === vBefore, 'N6i 全部负控制跑完后靶子仍未变（负控制不得留下痕迹）');
  A(rd(LEDGER_REL) === realText, 'N6j 全部负控制跑完后账本文本逐字未变');
  A(JSON.stringify(JSON.parse(realText)) === JSON.stringify(real), 'N6k 账本语义未变（二次确认）');
}

// ────────────────────────────── 入口 ──────────────────────────────
function runAll(A) { runA(A); runB(A); runC(A); }
module.exports = { CLASSES: CLASSES, PROBE_NS: PROBE_NS, VICTIM_REL: VICTIM_REL, runAll: runAll, runNegative: runN };
if (require.main === module) {
  let P = 0, F = 0;
  const A = function (c, m) { if (c) { P += 1; } else { F += 1; console.log('  ✗ ' + m); } };
  try { runAll(A); } catch (e) { F += 1; console.log('  ✗ 异常：' + e.message); }
  try { runN(A); } catch (e) { F += 1; console.log('  ✗ 负控制异常：' + e.message); }
  console.log('NS-CONSUMER-LEDGER-V2400: ' + (F === 0 ? 'pass（' + P + ' 项）' : 'FAIL ' + F + ' / ' + (P + F)));
  process.exit(F === 0 ? 0 : 1);
}
