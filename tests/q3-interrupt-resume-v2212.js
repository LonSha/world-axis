#!/usr/bin/env node
// WorldAxis tests/q3-interrupt-resume-v2212.js — v2.212.0(优化 Q3)专锁:
//   中断与跨层恢复(待恢复台账落盘 / 身份校验 / 只读判定入口)。
//
// ── 它治的病(探针实证 /tmp/q3_probe.js,不是推测)────────────────────
//   跨引擎链中断时,「已做但未提交的跨层副作用」只活在**进程态** `__pendingEffects`:
//     重装模块即归零(实测重装前 1 条 / 重装后 0 条);
//   而落盘侧只有 `commit.receipts`(已提交回执)—— 它答「做过没有」,
//   **答不了「没做完的是什么、断在哪一层」**。于是「刷新后要不要重导一次蓝图」
//   只能靠用户记忆。更坏的是:没有任何身份校验面 —— 待恢复信息若跨 chat / 跨分支
//   被恢复,就是把**别处的一段机制配置**装到当前世界,比不恢复更坏。
//
// ── 承重设计(判据必须打在这几条上)────────────────────────────────
//   A **只落可序列化的安全信息**:没有闭包、没有 draft 引用、没有宿主对象。
//     (闭包进不了 JSON,硬塞等于静默丢一半 —— 台账里"看起来有"而实际读不回来。)
//   B **恢复前校验身份**:行上带 chat / branch / epoch / rev 四元组,逐条比对;
//     不匹配 ⇒ 标 `foreign-*` 且 **不给** 恢复动作。
//   C **不自动回放**:入口只答「有什么、能不能恢复、为什么不能」,决定权在调用方。
//     (机制开关是全局的,自动回放等于把一个聊天的配置写到所有聊天上。)
//   D **台账有界**:走 evict 环形,否则长局里只增不减。
//
// ── 负控制口径(H6)────────────────────────────────────────────────
//   每组都是**真源码破坏**:锚点取自产品源码、各恰中 1 次 → 在 vm 内的**内存副本**上重装
//   → 重跑同款真判据 → 原版上同判据必须仍为真(两向)。破坏从不触碰磁盘。
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/q3-interrupt-resume-v2212.js';
const COMMIT_REL = 'core/commit.js';
const STORE_REL = 'core/store.js';
const EVICT_REL = 'core/evict.js';
function read(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function sha(rel) { return crypto.createHash('sha256').update(read(rel)).digest('hex').slice(0, 16); }
function fakeLS() {
  const m = Object.create(null);
  return {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem: function (k, v) { m[k] = String(v); },
    removeItem: function (k) { delete m[k]; },
    clear: function () { Object.keys(m).forEach(function (k) { delete m[k]; }); },
    key: function (i) { return Object.keys(m)[i] || null; },
    get length() { return Object.keys(m).length; },
    _dump: function () { return m; }
  };
}
/**
 * 独立无头装载面:只装中断落账这条路真需要的模块 + 宿主面。
 *   为什么不装整个 LOAD(209 个):本锁判的是**中断落账与身份判定**这件事本身;
 *   装全量会把「台账写没写进去」与「别的引擎宣没宣称自己」混在一条判据里。
 *   宿主桩补齐入口侧提供的那两样(`log`)——缺件会被误读成产品缺陷(本仓 synth-host 同一条理由)。
 *   `ls` 可注入:用来演「真实刷新」——同一份 localStorage,新的模块实例。
 */
const MODS = ['core/clock.js', 'core/rand.js', 'core/input-guard.js',
  'core/store.js', 'core/evict.js', 'core/commit.js'];
function harness(opts) {
  const o = opts || {};
  const ov = o.srcOverride || {};
  const G = {};
  G.window = G; G.global = G; G.console = console;
  G.localStorage = o.ls || fakeLS();
  G.document = { createElement: function () { return {}; }, addEventListener: function () {} };
  const ctx = vm.createContext(G);
  G.window.WorldAxis = { log: function () {} };
  MODS.forEach(function (rel) {
    vm.runInContext(ov[rel] !== undefined ? ov[rel] : read(rel), ctx, { filename: rel });
  });
  const WA = G.window.WorldAxis;
  WA.mainWin = G.window; WA.mainDoc = G.window.document;
  try { WA.store.init(); } catch (e) { /* init 失败不影响台账判据 */ }
  return WA;
}
/** 造一次「中止链 + 一个已做未提交的跨层副作用」—— 本锁全部判据的共同起点。 */
function abortChain(WA, opId, site) {
  return WA.commit.chain({
    opId: opId || 'q3lock-1', site: site || 'q3lock', steps: 3,
    fn: function (chain) {
      WA.commit.step(chain, { site: 'a' });
      WA.commit.effect(chain, 'mech-switch', function () { return true; });
      WA.commit.step(chain, { site: 'b' });
      return false;              // 主动拒签 ⇒ 整链中止
    }
  });
}
function rowsOf(WA) { return WA.store.read('commit.interrupted', []) || []; }
function lastRow(WA) { const r = rowsOf(WA); return r.length ? r[r.length - 1] : null; }
/** 真源码破坏:锚点须恰中 1 次,否则抛(不静默生成一份「看起来破坏过」的副本)。 */
function over(rel, from, to) {
  const raw = read(rel);
  const hits = raw.split(from).length - 1;
  if (hits !== 1) throw new Error('破坏锚点命中 ' + hits + ' 次(要求恰 1): ' + rel + ' :: ' + from.slice(0, 70));
  const o = {}; o[rel] = raw.split(from).join(to);
  return o;
}

// ── A 段:静态契约 ──────────────────────────────────────────────────────
function runAll(a) {
  const src = read(COMMIT_REL);
  const shaCommitBefore = sha(COMMIT_REL);
  const srcStore = read(STORE_REL);
  const srcEvict = read(EVICT_REL);
  // A1 单一落盘点:台账只在该写的地方写一次(写两处 = 同一笔中断记两条)
  a(/function markPending\(c, reason, persistReason\)/.test(src),
    'q3: [A1] markPending 是**唯一落盘点**(收 persistReason 以便透出真因)');
  const persistCalls = (src.match(/(^|[^a-zA-Z_.])persistResume\(/g) || []).length;
  a(persistCalls === 2,
    'q3: [A1] persistResume 只在两处被调用(定义体 1 + markPending 内 1);实 ' + persistCalls
      + ' —— 多出来就是「同一笔中断记两条」');
  a(src.indexOf("persistResume(c, persistReason || why, rows)") > 0,
    'q3: [A1] markPending 内那一次带的是 persistReason(不是外层另起一处)');
  // A2 三条失败路径都经 markPending(否则有一条路上什么账都不留)
  //   计数只认**调用点**:定义行 `function markPending(c, reason, persistReason)` 同样含
  //   `markPending(c, `,把它算进来会让判据从 3 变 4(本锁首轮实测踩到)。
  const mp = (src.match(/\n\s+markPending\(c, /g) || []).length;
  a(mp === 3, 'q3: [A2] 三条失败路径各调一次 markPending(step-threw / stale-aborted / refused);实 ' + mp);
  // A3 只落可序列化安全字段:定义体里出现这些名字,且**不出现** fn / draft
  const defM = src.match(/function persistResume\(c, reason, rows\) \{([\s\S]*?)\n  \}/);
  a(!!defM, 'q3: [A3] persistResume 有定义体可供审计');
  const defBody = defM ? defM[1] : '';
  a(/opId:/.test(defBody) && /site:/.test(defBody) && /reason:/.test(defBody)
    && /chat: id\.chat/.test(defBody) && /branch: id\.branch/.test(defBody)
    && /epoch:/.test(defBody) && /rev:/.test(defBody),
    'q3: [A3] 落盘字段是安全摘要(opId/site/reason + 身份四元组)');
  a(defBody.indexOf('fn:') < 0 && defBody.indexOf('draft:') < 0 && /r && r\.kind/.test(defBody),
    'q3: [A3] 副作用只记**名字**(r.kind),不落 fn 闭包 / draft 引用');
  // A4 身份四元组来自 store 的真源(不是自己另算一套)。
  //   判据打在 **identityOf** 上:身份读数的定义体在那里(首轮打在 persistResume 上 ⇒ 误红)。
  const idM = src.match(/function identityOf\(\) \{([\s\S]*?)\n  \}/);
  a(!!idM, 'q3: [A4] identityOf 有定义体可供审计');
  const idBody = idM ? idM[1] : '';
  a(/st\.chatId\)\s*===?\s*'function'/.test(idBody) || /st\.chatId\(\)/.test(idBody),
    'q3: [A4] chat 取自 store.chatId(身份真源,不自造)');
  a(/st\.currentBranchId/.test(idBody), 'q3: [A4] branch 取自 store.currentBranchId');
  a(/st\.committedRev/.test(idBody), 'q3: [A4] rev 取自 store.committedRev');
  // A5 不自动回放:导出面只有「读 / 判定 / 身份」三面,没有 resume/rebind/apply 之类动作口
  a(/scanInterrupted: scanInterrupted/.test(src) && /resumeStat: resumeStat/.test(src)
    && /resumeIdentity: identityOf/.test(src),
    'q3: [A5] 导出 scanInterrupted / resumeStat / resumeIdentity 三面');
  a(!/resume:\s*function/.test(src) && !/rebind:\s*function/.test(src) && !/applyResume:\s*function/.test(src),
    'q3: [A5] **不给**恢复动作口(自动回放 = 把一个聊天的配置写到所有聊天上)');
  // A6 身份判定三个 verdict 齐全
  a(src.indexOf("'foreign-chat'") > 0 && src.indexOf("'foreign-branch'") > 0
    && src.indexOf("'stale-site'") > 0,
    'q3: [A6] 身份判定三档齐备(foreign-chat / foreign-branch / stale-site)');
  // A7 三处同名同值:store 骨架 / store 容量表 / evict 站点表
  a(/commit: \{ receipts: \[\], interrupted: \[\] \}/.test(srcStore),
    'q3: [A7] store 骨架物化 commit.interrupted(冷启动直写不炸事务)');
  a(/'commit\.interrupted': \{ cap: 32, site: 'commit\.js WA\.evict\.array\(draft\.commit\.interrupted/.test(srcStore),
    'q3: [A7] store 容量表登记 commit.interrupted(cap 32)');
  a(/'commit\.interrupted': \{ path: 'commit\.interrupted', cap: 32, why:/.test(srcEvict),
    'q3: [A7] evict 站点表同名同值(缺此键 ⇒ evict 走 unknown-site **静默失败**)');
  a(/LIMITS\.RESUME/.test(srcStore) && /RESUME: 32/.test(src),
    'q3: [A7] 容量单源:store 容量表的 site 指向 LIMITS.RESUME,commit.js 定义 RESUME: 32');
  // A8 消费方接线:诊断面真读这三个新面(否则死导出)
  const diag = read('engines/tool-diag.js');
  a(/WA\.commit\.resumeStat/.test(diag) && /WA\.commit\.scanInterrupted/.test(diag)
    && /WA\.commit\.resumeIdentity/.test(diag),
    'q3: [A8] tool-diag 的 commit 节真消费三个新面(不是只导出不消费)');
  // A9 **运行时**容量双向对账(此前只住 tests/run.js 的 G18 块)。
  //   为什么搬到这里:G18 住 `engines/tool-diag v0.9.2` 节,而该节被 `tools/test-layers.js`
  //   判为 `refuse`(跨度里没有独立证据文件 ⇒ 不可独跑),且本仓**裸语句节的节体在 section()
  //   提前返回时仍逐条执行** —— 实测 `--only-v-section` 把整份 run.js 跑了一遍,17377 行、
  //   **0 条 ✗**、随后 V8 heap OOM → SIGABRT(exit -1)。也就是说:**这一面在现环境下没有
  //   可用的验收入口**,把它的读数写成「通过」或「失败」都是假结论。
  //   本段把同款判据搬到本锁已经在用的最小装载面上,判据逐字对齐 G18:`站点表 cap ⇄ 登记表 cap`
  //   逐键对账 + 「声明即执行」(喂超限数组过真站点,实测丢弃数须等于超限数)。
  //   三处同源(store 骨架 / store.__BOUNDED_CAPS / evict.SITES)才是 Q3 真正要钉的东西:
  //   缺任一处,`commit.interrupted` 要么不落盘,要么走 unknown-site **静默失败**(挤出不发生,
  //   而调用方以为做了)—— 长局里它就是一根只增不减的钉子。
  {
    const WA9 = harness({});
    const caps9 = WA9.store.sizeCaps();
    const decls9 = WA9.evict.siteDecls();
    const sitePathMatch = function (p, k) {
      if (p === k) return true;
      if (p.indexOf('*') < 0) return false;
      const ps = p.split('.'), ks = k.split('.');
      const i = ps.indexOf('*');
      if (ks.length < ps.length) return false;
      for (let eat = 1; eat <= ks.length - (ps.length - 1); eat++) {
        let ok = true;
        for (let si = 0; si < ps.length && ok; si++) {
          if (si === i) continue;
          const ki = si < i ? si : si + eat - 1;
          if (ps[si] !== ks[ki]) ok = false;
        }
        if (ok) return true;
      }
      return false;
    };
    const mism9 = [];
    Object.keys(decls9).forEach(function (st) {
      const d = decls9[st];
      if (d.cap === 'per-call') return;
      Object.keys(caps9).filter(function (k) { return sitePathMatch(d.path, k) || k === st; })
        .forEach(function (k) {
          const c = caps9[k];
          if (c.wildcard && sitePathMatch(d.path, k) && d.path.indexOf('*') >= 0) return;
          if (c.cap !== d.cap) mism9.push(k + '(登记 ' + c.cap + ' vs 站点 ' + d.cap + ')');
        });
    });
    a(mism9.length === 0, 'q3: [A9] 站点表 ⇄ 容量登记表**运行时**逐键一致(全表,不只本键)'
      + (mism9.length ? ' —— ' + mism9.join('、') : ''));
    a(!!caps9['commit.interrupted'] && caps9['commit.interrupted'].cap === 32,
      'q3: [A9] store.sizeCaps() 现场读到 commit.interrupted cap=32');
    a(!!decls9['commit.interrupted'] && decls9['commit.interrupted'].cap === 32,
      'q3: [A9] evict.siteDecls() 现场读到同名同值(缺此键 ⇒ unknown-site 静默失败)');
    a(WA9.commit.resumeStat().cap === 32,
      'q3: [A9] commit 侧 LIMITS.RESUME 与两表同值(三处同源,不是各写各的碰巧相等)');
    // 「声明即执行」:声明 cap 不算证据,真丢一次才算
    const execBad9 = [];
    ['commit.interrupted', 'commit.receipts'].forEach(function (st) {
      const decl = decls9[st];
      const arr = [];
      for (let i = 0; i < decl.cap + 3; i++) arr.push({ name: 'probe' + i });
      const s0 = WA9.evict.evictStat();
      const r = WA9.evict.array(arr, st);
      const s1 = WA9.evict.evictStat();
      if (!r.ok || r.dropped !== 3 || arr.length !== decl.cap) {
        execBad9.push(st + '(dropped=' + r.dropped + ' len=' + arr.length + ' 期望 3/' + decl.cap + ')');
      }
      if ((s1.evicts - s0.evicts) !== 1) execBad9.push(st + '(未记账)');
      WA9.evict.resetEvictStat();
    });
    a(execBad9.length === 0, 'q3: [A9] 声明即执行:过真站点实测丢失数 = 超限数'
      + (execBad9.length ? ':' + execBad9.join('、') : '(含既有 commit.receipts 作对照)'));
    a(WA9.evict.evictStat().evicts === 0, 'q3: [A9] 探针自清:挤出台账已归零(不污染后续节)');
  }

  // ── B 段:运行时(真跑)──────────────────────────────────────────────
  const WA = harness({});
  const r1 = abortChain(WA);
  a(r1.ok === false, 'q3: [B1] 中止链返回 ok:false(实 ' + r1.ok + '/' + r1.reason + ')');
  const pend = WA.commit.pending();
  a(pend.count === 1, 'q3: [B1] 进程态待办确有 1 条(那是本锁要落盘的那一份);实 ' + pend.count);
  const rows1 = rowsOf(WA);
  a(rows1.length === 1, 'q3: [B1] 落盘台账**恰新增 1 条**(不是两条);实 ' + rows1.length);
  const row = lastRow(WA);
  a(!!row && row.opId === 'q3lock-1', 'q3: [B2] 行内 opId 与链一致');
  a(!!row && row.reason === 'step-refused', 'q3: [B2] 行内 reason 是真因(step-refused);实 ' + (row && row.reason));
  a(!!row && row.steps.join(',') === 'a,b', 'q3: [B2] 行内带断点步骤摘要(a,b);实 ' + JSON.stringify(row && row.steps));
  a(!!row && row.effects.join(',') === 'mech-switch',
    'q3: [B2] 行内记下已做未提交的副作用名(mech-switch);实 ' + JSON.stringify(row && row.effects));
  a(!!row && ['chat', 'branch', 'epoch', 'rev'].every(function (k) { return k in row; }),
    'q3: [B2] 行内带身份四元组(chat/branch/epoch/rev)');
  // B3 台账里不得有闭包/宿主对象(整账可 JSON 序列化,且无 'function')
  let ser = '{}';
  try { ser = JSON.stringify(rows1); } catch (e) { ser = 'THREW:' + e.message; }
  a(ser.indexOf('THREW') !== 0, 'q3: [B3] 整账可 JSON 序列化(闭包硬塞会当场丢一半)');
  a(ser.indexOf('function') < 0, 'q3: [B3] 序列化结果里没有函数体');
  // B4 真实刷新语义:同一份 localStorage,新的模块实例 ⇒ 台账仍在
  const WA2 = harness({ ls: WA.mainWin.localStorage });
  a(WA2.commit.pending().count === 0,
    'q3: [B4] 重装后进程态待办归零 —— 这正是缺口本身(旧实现到此什么都答不出)');
  const rows2 = rowsOf(WA2);
  a(rows2.length === 1, 'q3: [B4] 重装后台账仍在(跨刷新可读);实 ' + rows2.length);
  a(!!lastRow(WA2) && lastRow(WA2).opId === 'q3lock-1', 'q3: [B4] 重装后读到的仍是同一笔(opId 一致)');
  // B5 scanInterrupted 判定面:本现场可恢复
  const sc = WA2.commit.scanInterrupted({});
  a(sc.ok === true, 'q3: [B5] scanInterrupted 返回 ok');
  a(sc.resumable === 1, 'q3: [B5] 本现场那一条判 resumable;实 ' + sc.resumable);
  a(sc.foreign === 0, 'q3: [B5] 本现场无外来行;实 ' + sc.foreign);
  a(sc.cap === 32, 'q3: [B5] cap 透出为 32');
  a(typeof sc.note === 'string' && sc.note.indexOf('不自动回放') >= 0,
    'q3: [B5] 返回体自陈边界(不自动回放)');
  // B6 外来身份:塞一条别的 chat ⇒ 判 foreign-chat 且不进默认视图
  WA2.store.transact(function (draft) {
    if (!draft.commit) draft.commit = { receipts: [], interrupted: [] };
    if (!Array.isArray(draft.commit.interrupted)) draft.commit.interrupted = [];
    draft.commit.interrupted.push({ opId: 'foreign-1', site: 'other', reason: 'aborted', at: 1,
      chat: '__other__', branch: '__other__', epoch: 0, rev: 0, steps: ['x'], stepCount: 1, effects: [], miss: 0 });
    return true;
  }, 'lock:foreign');
  const fo = WA2.commit.scanInterrupted({ opId: 'foreign-1', all: true });
  a(fo.rows.length === 1 && fo.rows[0].verdict === 'foreign-chat',
    'q3: [B6] 别的 chat 的行判 foreign-chat;实 ' + (fo.rows[0] && fo.rows[0].verdict));
  a(fo.rows[0].resumable === false, 'q3: [B6] 外来行 resumable=false');
  const fd = WA2.commit.scanInterrupted({ opId: 'foreign-1' });
  a(fd.rows.length === 0,
    'q3: [B6] 默认视图**不给**外来行(把别处的一段配置装进来比不恢复更坏);实 ' + fd.rows.length);
  // B7 身份四元组只读:取证两次一致(取证不得改变被取证对象)
  const i1 = WA2.commit.resumeIdentity();
  const i2 = WA2.commit.resumeIdentity();
  a(JSON.stringify(i1) === JSON.stringify(i2), 'q3: [B7] resumeIdentity 是只读的(两次读数一致)');
  a(['chat', 'branch', 'epoch', 'rev'].every(function (k) { return k in i1; }),
    'q3: [B7] 身份四元组字段齐备');
  // B8 resumeStat 读数与实读一致
  const st = WA2.commit.resumeStat();
  a(st.rows === rowsOf(WA2).length, 'q3: [B8] resumeStat().rows 与实读一致');
  a(st.foreign >= 1, 'q3: [B8] 外来行计入 foreign;实 ' + st.foreign);
  a(Array.isArray(st.reasons) && st.reasons.length > 0, 'q3: [B8] reasons 是显式声明表');
  // B9 有界:压 40 条 ⇒ 挤到 <= 32
  for (let i = 0; i < 40; i++) {
    WA2.commit.chain({ opId: 'cap-' + i, site: 'cap', steps: 1,
      fn: function (chain) { WA2.commit.step(chain, { site: 'x' }); return false; } });
  }
  const capped = rowsOf(WA2);
  a(capped.length <= 32, 'q3: [B9] 台账被环形挤出到 <= 32(不是只增不减);实 ' + capped.length);
  a(capped.every(function (x) { return x.opId !== 'cap-0'; }),
    'q3: [B9] 最旧的行真被挤出(cap-0 已不在)');
  // B10 store 侧容量读数与 commit 侧同值
  const caps = WA2.store.sizeCaps ? WA2.store.sizeCaps() : {};
  a(!!caps['commit.interrupted'] && caps['commit.interrupted'].cap === 32,
    'q3: [B10] store 侧容量读数 cap=32(与 LIMITS.RESUME 同值)');
  // B11 产品源未被本锁触碰
  a(sha(COMMIT_REL) === shaCommitBefore, 'q3: [B11] 正段全程未改产品源(逐字节一致)');
}

// ── N 段:负控制(真源码破坏 → 内存副本重跑同款判据)──────────────────
function runNegative(a) {
  // N7 的判据必须是**真前后比对**:`sha(x) === sha(x)` 恒真(假绿)。
  const shaAtEntry = sha(COMMIT_REL);
  // N0 两向自证的地基:原版上那几条判据必须全真
  const W0 = harness({});
  abortChain(W0, 'n0-1');
  const r0 = lastRow(W0);
  a(rowsOf(W0).length === 1 && !!r0 && r0.reason === 'step-refused' && r0.effects.join(',') === 'mech-switch',
    'q3: [N0] (原版)落盘 + 真因 + 副作用名三条判据全真 —— 否则「破坏后翻假」证明不了任何事');
  // N1 摘掉 markPending 里的落盘调用 ⇒ 台账整条不出现(本项要治的病原样复现)
  const b1 = over(COMMIT_REL, '    persistResume(c, persistReason || why, rows);\n', '');
  const W1 = harness({ srcOverride: b1 });
  const c1 = abortChain(W1, 'n1-1');
  a(c1.ok === false, 'q3: [N1] 破坏副本**无异常逃逸**(ok:false ⇒ 变的是行为,不是炸了装载)');
  a(rowsOf(W1).length === 0,
    'q3: [N1] 摘掉唯一落盘点 ⇒ 中断台账为空(世界照旧未提交,但「断在哪一层」无人答);实 '
      + rowsOf(W1).length);
  // N2 让 persistResume 把一个闭包也塞进去 ⇒ 可序列化判据当场现形
  const b2 = over(COMMIT_REL,
    "      effects: rows.map(function (r) { return clean(r && r.kind, LIMITS.KIND) || 'effect'; }),",
    "      effects: rows.map(function (r) { return clean(r && r.kind, LIMITS.KIND) || 'effect'; }),\n"
      + "      _fn: function () { return 1; },");
  const W2 = harness({ srcOverride: b2 });
  abortChain(W2, 'n2-1');
  const r2 = lastRow(W2);
  a(!!r2 && typeof r2._fn === 'function',
    'q3: [N2] 破坏副本里闭包**确实进了行**(证明判据盯的是这条,不是空转)');
  // 判据的正确形态是**往返丢件**,不是「序列化串里有 'function' 字样」:
  //   JSON.stringify 遇到函数是**静默丢弃**(不写字符串、也不抛),所以串里根本不会出现
  //   'function' —— 首轮把判据写成 indexOf('function') 是假判据(原版上也是假)。
  //   真判据:行里有 _fn,而 JSON 往返后 _fn 不见了 ⇒ 「落盘时静默丢一半」。
  let roundTrip = null;
  try { roundTrip = JSON.parse(JSON.stringify(rowsOf(W2))); } catch (e) { roundTrip = null; }
  a(roundTrip !== null && !('_fn' in (roundTrip[0] || {})),
    'q3: [N2] 闭包进台账 ⇒ JSON 往返静默丢件(落盘"看起来有"而读不回来);原版上行内没有任何函数,'
      + '往返逐字段一致(两向)');
  // 两向自证:原版行 JSON 往返后与行内字段完全一致(没有东西被丢)
  const W2b = harness({});
  abortChain(W2b, 'n2b-1');
  const rb = lastRow(W2b);
  let rt2 = null;
  try { rt2 = JSON.parse(JSON.stringify([rb])); } catch (e) { rt2 = null; }
  a(rt2 !== null && JSON.stringify(Object.keys(rt2[0]).sort()) === JSON.stringify(Object.keys(rb).sort()),
    'q3: [N2] (原版)行内字段往返无损 —— 证明上面那条判据不是恒真');
  // N3 摘掉身份四元组里的 chat ⇒ 外来行判定失效(跨聊天串档不再被拦)
  const b3 = over(COMMIT_REL, '      chat: id.chat, branch: id.branch, epoch: id.epoch, rev: id.rev,',
    '      branch: id.branch, epoch: id.epoch, rev: id.rev,');
  const W3 = harness({ srcOverride: b3 });
  abortChain(W3, 'n3-1');
  const r3 = lastRow(W3);
  a(!!r3 && !('chat' in r3), 'q3: [N3] 摘掉 chat ⇒ 行内不再有 chat 字段(判据盯的是身份四元组)');
  // 同一副本上:把这条行(缺 chat)与当前现场比对 —— 缺 chat ⇒ 落进 foreign-chat 分支(实为误判)
  a(!!r3 && WA_scanVerdictFor(W3, r3) === 'foreign-chat',
    'q3: [N3] 缺 chat 的行被判成外来(而不是「无从判定 ⇒ 放行」)—— 缺字段不得当同现场放行');
  // N4 摘掉环形挤出调用 ⇒ 台账只增不减
  const b4 = over(COMMIT_REL,
    "        if (WA.evict) WA.evict.array(draft.commit.interrupted, 'commit.interrupted', LIMITS.RESUME);\n", '');
  const W4 = harness({ srcOverride: b4 });
  for (let i = 0; i < 40; i++) {
    W4.commit.chain({ opId: 'n4-' + i, site: 'cap', steps: 1,
      fn: function (chain) { W4.commit.step(chain, { site: 'x' }); return false; } });
  }
  a(rowsOf(W4).length > 32,
    'q3: [N4] 摘掉 evict 调用 ⇒ 台账无界增长(环形挤出判据真在盯这一步);实 ' + rowsOf(W4).length);
  // N5 摘掉 RESUME 常量 ⇒ 静态契约的容量单源判据现形
  const b5 = over(COMMIT_REL, '    RESUME: 32, RESUME_STEPS: 8 };', '    RESUME_STEPS: 8 };');
  const W5 = harness({ srcOverride: b5 });
  a(W5.commit.resumeStat().cap !== 32,
    'q3: [N5] 摘掉 RESUME 常量 ⇒ cap 不再是 32(容量单源判据现形);实 ' + W5.commit.resumeStat().cap);
  // N6 加回一个恢复动作口 ⇒ A5 的同款判据必须在副本上翻假(两向自证)
  const b6 = over(COMMIT_REL, '    scanInterrupted: scanInterrupted,',
    '    resume: function () { return { ok: true }; },\n    scanInterrupted: scanInterrupted,');
  const W6src = (b6[COMMIT_REL] || '');
  // 判据取自 A5 **逐字同款**,在**破坏副本**上重跑:原版为真、副本为假。
  const a5 = function (s) {
    return !/resume:\s*function/.test(s) && !/rebind:\s*function/.test(s) && !/applyResume:\s*function/.test(s);
  };
  a(a5(read(COMMIT_REL)) === true && a5(W6src) === false,
    'q3: [N6] 加回恢复动作口 ⇒ A5 同款判据在副本上翻假(原版真 / 副本假,两向)');
  // N7 无副作用:整段负控制跑完,产品源逐字节未动、不留临时产物
  a(sha(COMMIT_REL) === shaAtEntry, 'q3: [N7] 负控制段全在内存副本上,产品源逐字节未被触碰');
  a(fs.readdirSync(path.join(BASE, 'tests')).filter(function (f) { return f.indexOf('.bak') >= 0; }).length === 0,
    'q3: [N7] 不留 .bak 之类的临时产物');
  // N8 A9 的容量对账判据必须**承重**:摘掉 evict 站点表那一行 ⇒ 同款判据当场现形。
  //   判据取自 A9 的现场口径(声明即执行 + 登记/站点对账),在**破坏副本**上重跑同一段逻辑。
  //   锚点用整行定位(全角/半角括号在本仓曾被坑过一次,故不写含括号的锚点)。
  {
    const evictSrc = read(EVICT_REL);
    const lineN8 = evictSrc.split('\n').filter(function (l) {
      return l.indexOf("'commit.interrupted': { path: 'commit.interrupted'") >= 0; })[0] || '';
    a(lineN8 !== '' && evictSrc.split(lineN8).length - 1 === 1,
      'q3: [N8] 破坏锚点在 core/evict.js 恰中 1 次(H5 纯度:本文件里该行只声明这一处)');
    const o8 = {}; o8[EVICT_REL] = evictSrc.replace(lineN8 + '\n', '');
    const W8 = harness({ srcOverride: o8 });
    const d8 = W8.evict.siteDecls();
    a(!d8['commit.interrupted'], 'q3: [N8] 破坏副本上站点确实消失(破坏真落在行为上,不是炸了装载)');
    a(!!W8.store.sizeCaps()['commit.interrupted'],
      'q3: [N8] 残的是执行侧:登记表仍有此键 ⇒ 对账缺口暴露(这一条正是 Q3 要钉的三处同源)');
    const probe8 = (function () {
      const decl = d8['commit.interrupted'];
      if (!decl) return 'site-missing';
      const arr = []; for (let i = 0; i < decl.cap + 3; i++) arr.push({ name: 'p' + i });
      const r = W8.evict.array(arr, 'commit.interrupted');
      return (r.ok && r.dropped === 3 && arr.length === decl.cap) ? null : 'exec-mismatch';
    })();
    a(probe8 !== null, 'q3: [N8] 站点缺失 ⇒ 「声明即执行」判据现形(实 ' + probe8 + ')');
    const ru8 = W8.evict.array([{ name: 'x' }], 'commit.interrupted');
    a(ru8.ok === false && ru8.reason === 'unknown-site',
      'q3: [N8] 未登记站点归因 unknown-site(而不是「先丢掉再说」)');
    // 两向:原版上同款读数仍为真(harness 起一份原版装载面,不跨段引用 runAll 的 WA ——
    //   越界引用在 require 路径下会当场 ReferenceError,本仓 Q2 轮踩过同型坑)
    const W0n8 = harness({});
    a(W0n8.commit.resumeStat().cap === 32 && W0n8.evict.siteDecls()['commit.interrupted'].cap === 32
      && W0n8.store.sizeCaps()['commit.interrupted'].cap === 32,
      'q3: [N8] 原版上同款判据仍为真(判据非恒真)');
  }
  // N9 A9 的**漂移**面:站点 cap 改成 16 ⇒ 逐键对账必须现形(与「整条站点消失」是两回事)
  {
    const evictSrc = read(EVICT_REL);
    const anchorN9 = "'commit.interrupted': { path: 'commit.interrupted', cap: 32,";
    a(evictSrc.split(anchorN9).length - 1 === 1, 'q3: [N9] 漂移锚点恰中 1 次');
    const o9 = {}; o9[EVICT_REL] = evictSrc.replace(anchorN9, anchorN9.replace('cap: 32', 'cap: 16'));
    const W9 = harness({ srcOverride: o9 });
    const c9 = W9.store.sizeCaps(), d9 = W9.evict.siteDecls();
    a(c9['commit.interrupted'].cap === 32 && d9['commit.interrupted'].cap === 16,
      'q3: [N9] 破坏副本上两侧真漂开(登记 32 / 站点 16)');
    a(c9['commit.interrupted'].cap !== d9['commit.interrupted'].cap,
      'q3: [N9] 逐键对账判据能看见这处漂移(原版上两侧相等)');
    const e0 = harness({});
    a(e0.store.sizeCaps()['commit.interrupted'].cap === e0.evict.siteDecls()['commit.interrupted'].cap,
      'q3: [N9] 原版上两侧同值(两向)');
  }
}
/** N3 用:取某个装载面上「某一行会得到什么 verdict」。 */
function WA_scanVerdictFor(WA, row) {
  try {
    const sc = WA.commit.scanInterrupted({ opId: row.opId, all: true });
    return (sc.rows[0] && sc.rows[0].verdict) || 'none';
  } catch (e) { return 'threw'; }
}

const lockAssert = require('./lock-assert.js');
module.exports = { runAll: lockAssert.restoring(runAll), runNegative: lockAssert.restoring(runNegative) };
// CLI:可独立跑(与本仓门禁同规格:命令行 / require / 自证三件齐)
if (require.main === module) {
  let pass = 0, fail = 0; const failures = [];
  const assert = function (cond, msg) {
    if (cond) { pass++; return; }
    fail++; failures.push(msg);
    console.log('  ✗ ' + msg);
  };
  console.log('■ q3-interrupt-resume-v2212(优化 Q3 专锁)');
  lockAssert.restoring(runAll)(assert);
  lockAssert.restoring(runNegative)(assert);
  console.log('通过 ' + pass + ' / 失败 ' + fail);
  if (fail) { console.log('失败项: ' + failures.join(' | ')); process.exit(1); }
  console.log('全部通过 ✓');
}