#!/usr/bin/env node
// WorldAxis tests/dead-export-gate.js — 死子面冻结账本门禁（v2.28.0）
//
// 缺口（它治什么）：
//   出口面契约（tests/export-contract.js 生成冻结串 + tests/run.js 的 FROZEN2800 断言）钉住的是
//   **整个 interface 面**：命名空间 × 成员的集合有没有被增删。它不区分「这个成员有没有消费方」，
//   于是**新增一个产品代码永不引用的导出，只要把冻结串一并回填，契约照样通过**。
//   也就是说死导出（dead）这一子面长期无账本、无门禁——v2.11.0 曾把 70 项真死导出分级
//   （internal-helper / unwired）并接通其中一部分能力，但之后任何一轮新增死导出都不会有任何提示：
//   它是一条**静默增长**的面。
//
// 本门禁的三条纪律：
//   ① 口径单源：直接 require('./inventory.js') 的 collect()，不另写一份「表面求差」实现。
//      判据的输入面与结论面必须是同一件事，否则会出现「门禁绿、清册红」这种互相矛盾的结论。
//   ② 冻结而非放行：账本 tests/dead-export-ledger.json 逐条登记当前死导出及归因；
//      新增死导出 = 红灯（要么显式 --update 登记，要么给导出接上消费方、要么删掉它）。
//   ③ 归因由测量判定、不留占位：不写 TODO——
//        test-only：产品零引用但 tests/run.js 有引用 ⇒ 产能保留在测试里；
//        self-only：定义文件内部自用、外部零引用 ⇒ 过度导出；
//        unwired  ：产品与测试都零引用 ⇒ 能力已实现、消费端未接线。
//
// v2.28.0（第十六面）：把「归因可读」推到「归因可证伪」。三条新纪律：
//   ④ **元数据三级同源**：账本 version 字段、_note 里的版本词、入口 index.js 的 VERSION 必须同值。
//      v2.27.0 交付时实测现场：version="2.26.0"、_note 写 v2.27.0、入口 2.27.0——**同一文件内两个
//      版本、且都不等于入口**。账本是一份需要人工按版本号去找、去比对的审计凭证，凭证自称哪个版本
//      却和实际不符，整份凭证的可信度就只是自称；而这个字段此前**没有任何门禁**。
//      版本词用 `v*` 前缀锚定而非全串扫描：规则里写「v0.1.x 遗留」这类历史表述不得被当成版本声明
//      （否则闸会把注释变成红灯——判据的输入面必须与结论面同宽）。
//   ⑤ **归因带证、且证据须与判据同宽**：每条冻结项标一组可复算的证据：
//        src  ：定义文件（来自 MODULE_EXPORTS，非人工填写）
//        refs ：**产品代码**内该成员的真引用数（filterRefs 的口径，注释/字符串不计）
//        tref ：**测试侧**（tests/run.js）该成员的真引用数
//      证据由 --update 从现场测量写入，判定时**在账本上重算复比**（不是拿来源文档比结论文档）。
//      `refs===0` 与「产品零引用」是同一件事的不同写法，所以证据与归因同宽；此前 208 条归因
//      **零条带证据**，「如何核对」完全没有答案（本仓既有裁决：归因不可读等于归因不实）。
//   ⑥ **未识别归因拒绝写入**：refresh 时若真产出一个不在 REASON_CODES 里的归因，立即 fail-closed
//      而不落盘，也不留占位（实测：把归因临时改成 '' 曾产出 `reason: ""` 的账本）。
//
// 复用的判据与清册完全一致（见 tests/inventory.js）：
//   「死」= 函数成员在产品代码（不含 tests/、tools/）内零引用；dataOnly 是常量/数据成员，
//   常被测试与诊断间接消费，单列备查、不进冻结面。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const LEDGER_PATH = path.join(__dirname, 'dead-export-ledger.json');
const inventory = require('./inventory.js');
// 被冻结的两个死面：模块接口面的函数成员 + UI 层函数成员（无头环境不装载，但成员名是静态可判的）
const FROZEN_KINDS = ['dead', 'uiDead'];
// 只记录计数、不拦截的面（常量/数据成员零引用）
const ADVISORY_KINDS = ['dataOnly'];
const REASON_CODES = ['test-only', 'self-only', 'unwired'];
// 每条冻结项必须携带的证据字段（由 --update 测量写入，判定时复算）。
//   src  ：定义文件（来自 MODULE_EXPORTS，非人工填写）
//   refs ：**产品侧**引用数（清册 REF_RE 口径：`WA <sep> ns <sep> mem`，注释也计——须与冻结判据同宽）
//   tref ：**测试侧**（tests/run.js）引用数（同一份 REF_RE）
//   own  ：定义文件内部对该成员名的真代码自用数（剥注释/字符串——注释里提到名字不算使用）
// 由 (tref, own) 可**唯一反推**归因：tref>0 ⇒ test-only；否则 own≥2 ⇒ self-only；否则 unwired。
// 也就是说归因不再是「测量之后贴上的标签」，而是一条可独立复算的结论。
const EVIDENCE_KEYS = ['src', 'refs', 'tref', 'own'];
function keyOf(rec) { return rec.ns + '.' + rec.mem; }
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// 命名空间 → 定义文件（用于判断「是否只在定义文件内部自用」）
function nsToFile() {
  const out = {};
  const inv = inventory.MODULE_EXPORTS;
  Object.keys(inv).forEach(function (f) { out[inv[f]] = f; });
  return out;
}
// v2.29.0：剥离口径**只有一个来源**——tests/inventory.js 的 codeFace（真代码面）。
//   本文件不再自写剥离器：旧 stripNonCode 不识别正则字面量，遇字符类正则会跨行失步、
//   把其后整段真代码剥成空格（实测 ui/settings.js 39 处真引用只留 1 处），
//   于是「门禁说 refs=0、其实那行代码真在跑」——探测器坏了比缺陷更危险。

// 计数：word-boundary 匹配，**只在真代码面上**（仅用于 own —— 判断「算不算自用」）
// v2.29.0：剥离器从自写的 stripNonCode 换成清册同源的 inventory.codeFace。
//   旧 stripNonCode 不识别正则字面量，遇到 `/[&<>"]/` 这类会进字符串态且**跨行失步**，
//   把其后整段真代码剥成空格：实测 ui/settings.js 保留 39 处真引用中的 1 处（丢 38），
//   ui/panel.js 丢 58，engines/tool-snapshot.js 丢 1 —— 即「证据少算」。
// v2.32.0：文件级读盘缓存（性能）。
//   病：referenceCounts() 对每个产品文件独立 readFileSync + refCountIn()，而它被 evidenceOf()
//   逐条（冻结项 ~211 条）调用 => 同一文件被 codeFace 解析 211 次（实测单次 evidenceDrift
//   82.7~87.3 秒；完整回归 11 次调用约占 15 分钟的大头）。refCountIn() 返回的本来就是
//   **完整 key->count map**，每个文件其实只需解析一次。
//   药：按绝对路径缓存 {stamp, src, code, map}，stamp = mtimeMs + ':' + size。
//   安全（为什么不假绿）：缓存键含 mtime+size，任何写盘（含 v2.29 负控的「注入注释 ->
//   注入真调用 -> 还原备份」）都会改变 stamp => 必然 miss => 重读重算。**绝不**用
//   「内容哈希」当键（那要先读盘，等于没省），也**绝不**用无键缓存（那会让端到端注入负控假绿）。
const __srcCache = Object.create(null);
function stampOf(abs) {
  const st = fs.statSync(abs);
  return String(st.mtimeMs) + ':' + String(st.size);
}
// 读文件 + 真代码面 + REF_RE 计数，一次算齐；同 stamp 内命中缓存
function readCached(abs) {
  let stamp;
  try { stamp = stampOf(abs); } catch (e) { return null; }
  const hit = __srcCache[abs];
  if (hit && hit.stamp === stamp) return hit;
  let srcText;
  try { srcText = fs.readFileSync(abs, 'utf8'); } catch (e) { return null; }
  const code = inventory.codeFace(srcText);
  const map = Object.create(null);
  const re = new RegExp(inventory.REF_RE.source, 'g');
  let m;
  while ((m = re.exec(code))) {
    const k = m[1] + '.' + m[2];
    map[k] = (map[k] || 0) + 1;
  }
  const entry = { stamp: stamp, src: srcText, code: code, map: map };
  __srcCache[abs] = entry;
  return entry;
}
// v2.32.0（第二层）：整趟快照。上一层缓存把「读盘 + codeFace」降到每文件一次，但
//   referenceCounts() 仍被 211 条冻结项各调一次 => 每趟仍要 211 x 66 = 13926 次 statSync。
//   本层再把「产品文件面」整体做成一份快照，每趟只 stat / codeFace 各 67 次。
//   安全：sig 由全部产品文件 + run.js 的 mtimeMs:size 拼成；任一文件被写（含负控注入与还原）
//   => sig 变化 => 整份快照重建。evidenceDrift 内部是同步执行，单线程下不存在「趟中被改写」。
const __snap = { sig: null, byFile: null, run: null };
// v2.32.0（第三层）：趟内复用。sig 核验本身要 67 次 statSync，若 211 条冻结项各核一次，
//   光 stat 就又是 14k 次。而 evidenceDrift 是**同步**执行：一趟之内没有任何写盘机会，
//   因此「趟首核一次 sig」与「每条都核」在同步语义下等价。趟外调用（evidenceOf 直调）
//   仍走全量核验，缓存安全性一分不减。
let __passDepth = 0;
let __passResolved = false;
function beginPass() { if (__passDepth === 0) __passResolved = false; __passDepth += 1; }
function endPass() { __passDepth -= 1; if (__passDepth <= 0) { __passDepth = 0; __passResolved = false; } }
function productSnapshot() {
  if (__passDepth > 0 && __passResolved && __snap.byFile) return __snap;
  const rels = inventory.PRODUCT_FILES || [];
  const runAbs = path.join(__dirname, 'run.js');
  let sig = '';
  for (let i = 0; i < rels.length; i++) {
    const abs = path.join(BASE, rels[i]);
    try { const st = fs.statSync(abs); sig += String(st.mtimeMs) + ':' + String(st.size) + '|'; }
    catch (e) { sig += '-|'; }
  }
  try { const st = fs.statSync(runAbs); sig += String(st.mtimeMs) + ':' + String(st.size); }
  catch (e) { sig += '-'; }
  if (__snap.sig === sig && __snap.byFile) { if (__passDepth > 0) __passResolved = true; return __snap; }
  const byFile = Object.create(null);
  for (let i = 0; i < rels.length; i++) {
    const e = readCached(path.join(BASE, rels[i]));
    if (e) byFile[rels[i]] = e;
  }
  __snap.sig = sig;
  __snap.byFile = byFile;
  __snap.run = readCached(runAbs);
  if (__passDepth > 0) __passResolved = true;
  return __snap;
}
// 在**已剥离的真代码面**上按 word-boundary 计数（countRefs 的纯核）
function countRefsOnCode(code, mem) {
  const re = new RegExp('(?<![\\w$])' + escapeRe(mem) + '(?![\\w$])', 'g');
  let n = 0;
  let m;
  while ((m = re.exec(code))) n += 1;
  return n;
}
function countRefs(src, mem) {
  return countRefsOnCode(inventory.codeFace(src), mem);
}
// 产品侧引用数（清册 REF_RE × 清册 codeFace —— 与冻结判据同宽，独立实现避免漂移）
// v2.29.0：**只在真代码面**上计数。此前直接扫原文，把注释与字符串文本里的 `WA.ns.mem`
//   也算成引用，于是「加一行注释」就能把冻结项伪装成「已被消费」，而同一条目在账本里
//   的 refs 仍是 0 ⇒ evidenceDrift 报「证据失实」⇒ 门禁反而逼人跑 --update 抹掉它。
function refCountIn(src) {
  const out = Object.create(null);
  const re = new RegExp(inventory.REF_RE.source, 'g');
  let m;
  const code = inventory.codeFace(src);
  while ((m = re.exec(code))) {
    const ns = m[1];
    const mem = m[2];
    const k = ns + '.' + mem;
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}
// 产品侧真引用（定义文件**自身之外**的产品文件；定义文件内自用由 own 单独计）
function referenceCounts(rec) {
  const fileMap = nsToFile();
  const own = fileMap[rec.ns];
  const k = keyOf(rec);
  let refs = 0;
  const snap = productSnapshot();
  const rels = inventory.PRODUCT_FILES || [];
  for (let i = 0; i < rels.length; i++) {
    const rel = rels[i];
    if (rel === own) continue;
    const hit = snap.byFile[rel];
    if (!hit) continue;
    refs += (hit.map[k] || 0);
  }
  return refs;
}
// 测试侧引用数（与清册同口径：只读 tests/run.js）
function testRefCount(rec) {
  const hit = productSnapshot().run;
  if (!hit) return 0;
  return (hit.map[keyOf(rec)] || 0);
}
// 定义文件内部对该成员名的**真代码**自用数（真代码面：注释里提到名字不算使用）
function ownRefCount(rec) {
  const rel = nsToFile()[rec.ns];
  if (!rel) return 0;
  const snap = productSnapshot();
  const hit = snap.byFile[rel] || readCached(path.join(BASE, rel));
  if (!hit) return 0;
  return countRefsOnCode(hit.code, rec.mem);
}
// 证据组（写入与复算共用同一份实现——两侧不同源就会「写进去的对不上复算的」）
function evidenceOf(rec) {
  const fileMap = nsToFile();
  return {
    src: fileMap[rec.ns] || '',
    refs: referenceCounts(rec),
    tref: testRefCount(rec),
    own: ownRefCount(rec)
  };
}
// 定义文件内部是否自用该成员：声明 1 处 + 使用 ≥1 处（才算是「过度导出」）
function selfUsed(fileMap, ns, mem) {
  return ownRefCount({ ns: ns, mem: mem }) >= 2;
}

function classify(fileMap, rec) {
  if (rec.inTests) return 'test-only';
  if (selfUsed(fileMap, rec.ns, rec.mem)) return 'self-only';
  return 'unwired';
}
function detailOf(code, fileMap, rec) {
  if (code === 'test-only') return '仅测试引用（tests/run.js），产品代码零引用';
  if (code === 'self-only') return (fileMap[rec.ns] || '定义文件') + ' 内部自用、外部零引用（过度导出）';
  return '产品与测试均零引用（能力未接线）';
}
function byKey(a, b) { return keyOf(a) < keyOf(b) ? -1 : 1; }
// 依据一次 collect() 结果生成账本（逐条 reason + detail + 证据）
function build(result, version) {
  const fileMap = nsToFile();
  const out = {
    _note: 'WorldAxis 死子面冻结账本（v' + version + '）。dead / uiDead 两面由 tests/dead-export-gate.js 冻结：'
         + '出现新条目即红灯（须显式 --update 登记，或给导出接上消费方、或删除它）。'
         + 'advisory 面只记计数、不拦截。每条证据 refs/tref 为现场实测的引用数，判定时会复算比对。'
         + '判据口径与 tests/inventory.js 同源。',
    version: version,
    dead: {},
    uiDead: {}
  };
  FROZEN_KINDS.forEach(function (kind) {
    result[kind].slice().sort(byKey).forEach(function (rec) {
      const code = classify(fileMap, rec);
      // 未识别归因 = 拒绝写入（fail-closed），绝不落占位
      if (REASON_CODES.indexOf(code) < 0) {
        throw new Error('[dead-export-gate] 归因未识别：' + keyOf(rec) + ' → ' + JSON.stringify(code)
          + '（拒绝写入账本；归因词表 ' + REASON_CODES.join('/') + '）');
      }
      const ev = evidenceOf(rec);
      out[kind][keyOf(rec)] = { reason: code, detail: detailOf(code, fileMap, rec), src: ev.src, refs: ev.refs, tref: ev.tref, own: ev.own };
    });
  });
  out.advisory = {};
  ADVISORY_KINDS.forEach(function (kind) { out.advisory[kind] = result[kind].length; });
  return out;
}
// 保留账本中已有条目的**人工修正**（detail 人工改过的措辞），其余（reason/证据）一律按现场重算。
// v2.28.0 起不再保留旧 reason：reserved 的语义是「理由文本可人工润色」，不是「归因可脱离测量」。
function refresh(result, ledger, version) {
  const next = build(result, version);
  if (ledger) {
    FROZEN_KINDS.forEach(function (kind) {
      const old = ledger[kind] || {};
      Object.keys(next[kind]).forEach(function (k) {
        if (old[k] && typeof old[k].detail === 'string' && old[k].detail) next[kind][k].detail = old[k].detail;
      });
    });
  }
  return next;
}

function loadLedger() {
  if (!fs.existsSync(LEDGER_PATH)) return null;
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}
function versionOf() {
  const idx = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
  return (idx.match(/const VERSION = '([\d.]+)'/) || [])[1] || '0.0.0';
}
// ── 元数据三级同源（v2.28.0）──
//   level 1：账本 version 字段（mismatch: 'field-vs-entry'）
//   level 2：账本 _note 里的版本词（mismatch: 'note-vs-entry'）
//   level 3：账本 version 字段 vs _note（mismatch: 'field-vs-note'）
// 只认 `v<数字>` 形态：规则里写「v0.1.x 遗留」不会被误认。
function versionNotes(text) {
  return (String(text || '').match(/v\d+(?:\.\d+)*/g) || []);
}
function metadataProblems(ledger, entryVersion) {
  const out = [];
  if (!ledger || typeof ledger !== 'object') return out;
  const field = String(ledger.version == null ? '' : ledger.version);
  if (field !== entryVersion) out.push({ kind: 'metadata', key: 'version', mismatch: 'field-vs-entry', detail: '账本 version=' + JSON.stringify(field) + '，入口 VERSION=' + entryVersion });
  const notes = versionNotes(ledger._note);
  if (!notes.length) out.push({ kind: 'metadata', key: '_note', mismatch: 'note-absent', detail: '_note 里没有任何 v* 版本词（账本须自称版本）' });
  else if (notes.indexOf('v' + entryVersion) < 0) out.push({ kind: 'metadata', key: '_note', mismatch: 'note-vs-entry', detail: '_note 版本词 ' + notes.join(',') + '，入口 VERSION=' + entryVersion });
  if (field && notes.length && notes.indexOf('v' + field) < 0) out.push({ kind: 'metadata', key: 'version', mismatch: 'field-vs-note', detail: 'version=' + JSON.stringify(field) + ' 与 _note 版本词 ' + notes.join(',') + ' 不一致' });
  return out;
}
// ── 证据复算（v2.28.0）──
// 逐条在**账本上**重算 src/refs/tref，与账本声明比对：任何一项不符即证据失实。
// 另有一条**同宽性**约束：refs/tref 与归因必须自洽（test-only ⇔ tref>0 且 refs===0 等）。
function evidenceDrift(result, ledger) {
  const out = [];
  if (!ledger || typeof ledger !== 'object') return out;
  beginPass();
  try {
  FROZEN_KINDS.forEach(function (kind) {
    const now = {};
    (result[kind] || []).forEach(function (rec) { now[keyOf(rec)] = rec; });
    const frozen = ledger[kind] || {};
    Object.keys(frozen).forEach(function (k) {
      const item = frozen[k] || {};
      EVIDENCE_KEYS.forEach(function (f) {
        if (item[f] === undefined) {
          out.push({ kind: kind, key: k, field: f, detail: '证据字段缺失（' + f + '）——归因不得无证' });
        }
      });
      const rec = now[k];
      if (!rec) return;
      // v2.28.0：逐条**异常隔离**。证据复算会读盘（定义文件、产品文件、tests/run.js），
      //   单个文件读失败/不可解析不能让整个门禁抛栈中断（那会让「读不到证据」退化成
      //   「门禁挂了」，其余条目的失实全部无人过问）。失败即**记一条失实**——不许静默跳过：
      //   「算不出来」与「算出来不符」在红灯面上一视同仁。
      let ev;
      try {
        ev = evidenceOf(rec);
      } catch (e) {
        out.push({ kind: kind, key: k, field: '（复算）', detail: '证据复算失败（' + (e && e.message ? e.message : e) + '）——算不出来不得当作算过' });
        return;
      }
      EVIDENCE_KEYS.forEach(function (f) {
        if (item[f] === undefined) return;
        if (item[f] !== ev[f]) {
          out.push({ kind: kind, key: k, field: f, detail: '证据失实：账本 ' + f + '=' + JSON.stringify(item[f]) + '，复算=' + JSON.stringify(ev[f]) });
        }
      });
      // 证据 → 归因的**唯一反推**（判据不得比证据宽）：由 (tref, own) 判归因，与账本声明不符即红灯。
      //   这比「字段级别对照」更强：改动证据本身也必须与声明自洽，无处可绕。
      if (typeof item.tref === 'number' && typeof item.own === 'number') {
        const derived = item.tref > 0 ? 'test-only' : (item.own >= 2 ? 'self-only' : 'unwired');
        if (item.reason !== derived) {
          out.push({ kind: kind, key: k, field: 'reason',
            detail: '归因与证据不符：账本 reason=' + item.reason + '，由证据 (tref=' + item.tref + ', own=' + item.own + ') 反推应为 ' + derived });
        }
      }
      // 产品零引用是「死」的定义本身，证据里必须看得见（refs 与冻结判据同宽）
      if (item.refs !== undefined && item.refs !== 0) {
        out.push({ kind: kind, key: k, field: 'refs', detail: '冻结项的产品引用数应为 0（实 ' + item.refs + '）——它已不是死导出' });
      }
    });
  });
  return out;
  } finally { endPass(); }
}
// 判定：added / staleReason / metadata / evidence 是红灯；gone 只提示
function judge(result, ledger, opts) {
  const fileMap = nsToFile();
  const entryVersion = (opts && opts.entryVersion) || versionOf();
  const out = { added: [], gone: [], staleReason: [], metadata: [], evidence: [], advisory: {}, ok: true };
  if (!ledger || typeof ledger !== 'object') {
    out.added.push({ kind: 'ledger', key: '（账本缺失）', reason: 'unwired', detail: 'tests/dead-export-ledger.json 不存在或不可解析' });
    out.ok = false;
    return out;
  }
  FROZEN_KINDS.forEach(function (kind) {
    const now = {};
    (result[kind] || []).forEach(function (rec) {
      now[keyOf(rec)] = { reason: classify(fileMap, rec), detail: detailOf(classify(fileMap, rec), fileMap, rec) };
    });
    const frozen = ledger[kind] || {};
    Object.keys(now).forEach(function (k) {
      if (!frozen[k]) out.added.push({ kind: kind, key: k, reason: now[k].reason, detail: now[k].detail });
    });
    Object.keys(frozen).forEach(function (k) {
      const item = frozen[k] || {};
      if (!now[k]) { out.gone.push({ kind: kind, key: k, reason: item.reason }); return; }
      if (REASON_CODES.indexOf(item.reason) < 0) out.staleReason.push({ kind: kind, key: k, reason: String(item.reason) });
    });
  });
  ADVISORY_KINDS.forEach(function (kind) {
    const was = (ledger.advisory || {})[kind];
    const nowN = (result[kind] || []).length;
    out.advisory[kind] = { was: was, now: nowN, delta: (typeof was === 'number') ? nowN - was : null };
  });
  out.metadata = metadataProblems(ledger, entryVersion);
  out.evidence = evidenceDrift(result, ledger);
  out.ok = out.added.length === 0 && out.staleReason.length === 0
    && out.metadata.length === 0 && out.evidence.length === 0;
  return out;
}
function report(result, verdict) {
  console.log('');
  console.log('■ 死子面冻结门禁（dead / uiDead）');
  console.log('  冻结面规模 dead ' + result.dead.length + ' · uiDead ' + result.uiDead.length
    + ' · 归因分布 test-only ' + result.dead.filter(function (d) { return d.inTests; }).length
    + ' / 其余 ' + result.dead.filter(function (d) { return !d.inTests; }).length);
  if (verdict.added.length) {
    console.log('  ✗ 新增死导出 ' + verdict.added.length + ' 项（未登记 = 产品代码零引用，是静默增长的面）:');
    verdict.added.forEach(function (a) { console.log('    + ' + a.key + '  [' + a.reason + '] ' + a.detail); });
  }
  if (verdict.staleReason.length) {
    console.log('  ✗ 账本归因不可读 ' + verdict.staleReason.length + ' 项（reason 不在词表内）:');
    verdict.staleReason.forEach(function (s) { console.log('    ? ' + s.key + '  reason=' + s.reason); });
  }
  if (verdict.metadata.length) {
    console.log('  ✗ 账本元数据不自洽 ' + verdict.metadata.length + ' 项（凭证自称的版本与实际不符 = 凭证不可信）:');
    verdict.metadata.forEach(function (m) { console.log('    ? ' + m.key + '  [' + m.mismatch + '] ' + m.detail); });
  }
  if (verdict.evidence.length) {
    console.log('  ✗ 归因证据失实 ' + verdict.evidence.length + ' 项（账本声明与现场复算不符）:');
    verdict.evidence.slice(0, 20).forEach(function (e) { console.log('    ! ' + e.kind + ' ' + e.key + '  [' + e.field + '] ' + e.detail); });
    if (verdict.evidence.length > 20) console.log('    … 其余 ' + (verdict.evidence.length - 20) + ' 项省略');
  }
  if (verdict.gone.length) {
    console.log('  ⚠ 已登记的死导出消失 ' + verdict.gone.length + ' 项（接通或删除后请跑 --update 收敛账本）:');
    verdict.gone.forEach(function (g) { console.log('    - ' + g.key + '  [' + g.reason + ']'); });
  }
  Object.keys(verdict.advisory).forEach(function (k) {
    const a = verdict.advisory[k];
    console.log('  ⓘ ' + k + '（备查，不拦截）: ' + a.was + ' → ' + a.now + (a.delta ? '（Δ' + a.delta + '）' : ''));
  });
  if (verdict.ok) console.log('  ✓ 死子面无新增、归因可读、元数据同源、证据可复算');
}
function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.indexOf('--json') >= 0;
  const doUpdate = argv.indexOf('--update') >= 0;
  const result = inventory.collect();
  if (doUpdate) {
    const before = loadLedger();
    const next = refresh(result, before, versionOf());
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(next, null, 2) + '\n');
    const bd = before ? Object.keys(before.dead || {}).length : 0;
    const bu = before ? Object.keys(before.uiDead || {}).length : 0;
    const evN = FROZEN_KINDS.reduce(function (a, k) { return a + Object.keys(next[k] || {}).length; }, 0);
    console.log('[dead-export-gate] 账本已写入 ' + LEDGER_PATH);
    console.log('  dead ' + bd + ' → ' + Object.keys(next.dead).length + ' · uiDead ' + bu + ' → ' + Object.keys(next.uiDead).length);
    console.log('  证据已复核写入 ' + evN + ' 条（src/refs/tref）· 账本 version=' + next.version);
    // 同 inventory.js：用 exitCode 而非 process.exit()，避免大输出经管道时被截断
    process.exitCode = 0;
    return;
  }
  const verdict = judge(result, loadLedger());
  if (asJson) console.log(JSON.stringify(verdict, null, 2)); else report(result, verdict);
  // 同 inventory.js：--json 的结论体可能很大，process.exit() 会截断管道写入
  process.exitCode = verdict.ok ? 0 : 1;
}
if (require.main === module) main();
module.exports = { LEDGER_PATH: LEDGER_PATH, FROZEN_KINDS: FROZEN_KINDS, ADVISORY_KINDS: ADVISORY_KINDS,
  REASON_CODES: REASON_CODES, EVIDENCE_KEYS: EVIDENCE_KEYS, loadLedger: loadLedger, build: build, refresh: refresh,
  judge: judge, classify: classify, detailOf: detailOf, selfUsed: selfUsed, nsToFile: nsToFile, keyOf: keyOf,
  versionOf: versionOf, versionNotes: versionNotes, metadataProblems: metadataProblems, evidenceDrift: evidenceDrift,
  evidenceOf: evidenceOf, countRefs: countRefs, ownRefCount: ownRefCount, refCountIn: refCountIn,
  referenceCounts: referenceCounts, testRefCount: testRefCount, report: report };
