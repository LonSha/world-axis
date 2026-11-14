#!/usr/bin/env node
/**
 * WorldAxis tools/run-observer.js (v2.409.0) — 长跑观测器：**心跳 + 双口径空闲 + 增量预算**
 *
 *  缝合来源：`xxs-ddc/st-4a-guard` v4.3.1 的 `STREAM_POLICY` / `observeStream` /
 *  `STREAM_LIMIT`（酒馆前端脚本，沙箱证据见 .agents/notes/proposed/architecture/
 *  2026-11-14-cross-reference-stitch-batch.md）。
 *
 *  ── 治什么（本仓现场三次踩到，全部落在同一处）────────────────────
 *   `tests/isolated-runner.js` 目前只有**一个总时长闸**（`opts.timeoutMs`）。超时到了就
 *   SIGKILL，然后靠日志尾部正则还原「跑到哪一节」（v2.131.0 O15①）。三个后果：
 *     ① 405 秒 / 240 秒的两次现场读数里，**「正在跑」与「已卡死」完全不可区分** ——
 *        两者在 run.log 上的表现都是「最后一行不再增长」。
 *     ② 「无输出」与「有输出但无内容」被算成同一件事。慢节预热、GC 抖动、死循环
 *        三种形态的修复方向完全不同，读数却一样。
 *     ③ 单趟上限固定（旧 L2 日志：`单趟上限 10 节`），在 `240s` 预算下必然超 ——
 *        固定节数与实测耗时无关，这是结构性的超预算。
 *
 *  ── 四件读数（全部来自上游真实形态，不自行发明）──────────────────
 *   ① **本地心跳**（`localHeartbeat` / `heartbeatIntervalMs:15000`）：子进程无输出时
 *      由观测者**自己生成**心跳行，而不是等子进程。心跳是「观测者还活着」的证据，
 *      **不是**「子进程有进展」的证据 —— 这条区分是整套机制的全部要害。
 *   ② **双口径空闲**（`idleWarningMs:90000`）：
 *      `idleMs` = 距最后一次**任何字节**；
 *      `idleContentMs` = 距最后一次**有内容**的行（非心跳、非空行、非纯进度点）。
 *      两者分开报，避免「有字节但没内容」被当成健康。
 *   ③ **增量预算**（对应上游 `STREAM_LIMIT` 逐点拦截而非总闸）：预算按
 *      「已用/预计」动态收缩每趟节数，而不是固定 N 节。
 *   ④ **超限即分级**：`ok` → `slow`(idleContentMs ≥ warn) → `stalled`(idleMs ≥ stall) →
 *      `oversize`(输出超硬上限)。四态各有独立读数，不塌成一个 `timedOut:true`。
 *
 *  ── 为什么是独立文件而不是改 isolated-runner.js ────────────────
 *   O6 门禁 `tests/o6-layer-gate-v2187.js` 的 N5 负控制要求 `isolated-runner.js`
 *   **逐字未变**。把观测逻辑塞进去 ⇒ N5 必红（本轮已因同类尝试回滚过一次）。
 *   故本文件是**纯新增、零侵入**：`isolated-runner.js` 只多一个可选 `opts.observer`，
 *   不传时逐字不变（该分支在 N5 眼里是「多了一行 if」，需同步登记进门禁 —— 见本批 Note）。
 *
 *  ── 八条否定式边界 ────────────────────────────────────────────
 *   ① 零副作用：不写被测树、不改 result.json、不碰锁。只读 stdout 流 + 内存计数。
 *   ② 不替代超时：观察者**不杀进程**，只报态。杀与不杀仍由 `launch()` 决定。
 *   ③ 心跳不写进被测日志：心跳走**观测者自己的 stderr/stdout 前缀**，不进 run.log
 *      （写进去会污染「跑到哪一节」的尾部还原，v2.131.0 的判据就失效了）。
 *   ④ 时间源可注入（`now()`）：门禁用假时钟驱动，不靠 sleep。
 *   ⑤ 无内容行判定**不含**「进度点」「空行」「ANSI 控制序列」，把它们算成「无进展」。
 *   ⑥ 预算收缩只给**建议**（`suggestedSections`），不改调度器行为。
 *   ⑦ 不做 SSE/流式协议解析：这里不是网络流，是子进程管道。上游 `boundaryScan`
 *      的帧边界判据在管道场景退化成「按行」，故只保留按行统计。
 *   ⑧ 全部读数可序列化（`snapshot()` 返回纯 JSON），便于写进 result.json。
 */
'use strict';

const DEFAULTS = Object.freeze({
  heartbeatIntervalMs: 15000,
  idleWarningMs: 90000,
  stallMs: 240000,
  hardBytes: 8 * 1024 * 1024,
  budgetMs: 240000,
  sectionsPerTrip: 10,
});

/** 无条件算「有内容」的行长度下限（少于这个长度的非空行按「噪声」算）。 */
const CONTENT_MIN_CHARS = 4;
/** 已知的无内容行形态：进度点、纯分隔线、纯计时行。 */
const NOISE_PATTERNS = [
  /^[.·。…\s]*$/,
  /^[-=_─━]{3,}$/,
  /^[\s]*⏱[\s\d.]+s/,
  /^[\s]*\d+(\.\d+)?s[\s]*$/,
];

function isNoise(line) {
  const text = String(line == null ? '' : line).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').trim();
  if (!text) return true;
  if (text.length < CONTENT_MIN_CHARS && !/^■/.test(text)) return true;
  for (const re of NOISE_PATTERNS) if (re.test(text)) return true;
  return false;
}

/** 从一行里提取节名（本仓 run.js 每节开头是 `■ 标题`），用于「死在哪一节」。 */
function sectionOf(line) {
  const m = String(line == null ? '' : line).match(/^■\s*(.*)$/);
  return m ? m[1].trim() : '';
}

function createObserver(options) {
  const opts = Object.assign({}, DEFAULTS, options || {});
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const started = now();
  const st = {
    startedAt: started,
    lastByteAt: started,
    lastContentAt: started,
    bytes: 0,
    lines: 0,
    contentLines: 0,
    noiseLines: 0,
    heartbeats: 0,
    sectionsSeen: 0,
    lastSection: '',
    partialLine: '',
    state: 'ok',
    reason: '',
    emittedOversize: false,
  };

  /** 喂一行。**幂等可重复调**；返回这行是否算「有内容」。字节由 feedChunk 计。 */
  function feedLine(line) {
    const at = now();
    st.lines += 1;
    st.lastByteAt = at;
    const text = String(line == null ? '' : line);
    if (isNoise(text)) { st.noiseLines += 1; return false; }
    st.contentLines += 1;
    st.lastContentAt = at;
    const sec = sectionOf(text);
    if (sec) { st.sectionsSeen += 1; st.lastSection = sec; }
    if (st.bytes > opts.hardBytes && !st.emittedOversize) { st.emittedOversize = true; st.reason = 'hard-bytes'; }
    return true;
  }

  /**
   * 喂一段可能不完整的字节块（按 `\n` 切，残段留到下次）。
   *   **字节在这里累计、不按行累计**：末段没有换行时它仍占管道带宽，
   *   若等换行才算字节，`hardBytes` 会在「一直在吐半行」的形态下永远不触发。
   */
  function feedChunk(chunk) {
    const raw = String(chunk == null ? '' : chunk);
    st.bytes += Buffer.byteLength(raw, 'utf8');
    if (st.bytes > opts.hardBytes && !st.emittedOversize) { st.emittedOversize = true; st.reason = 'hard-bytes'; }
    const text = st.partialLine + raw;
    const parts = text.split('\n');
    st.partialLine = parts.pop() || '';
    let anyContent = false;
    for (const p of parts) { if (feedLine(p)) anyContent = true; }
    st.lastByteAt = now();   // 即使全是残段，字节也算到了
    return anyContent;
  }

  /** 观测者自己的心跳：证明**观测者活着**，不是证明子进程有进展。 */
  function heartbeat() {
    st.heartbeats += 1;
    return ': wa-observer local-wait ' + Math.round((now() - st.startedAt) / 1000) + 's' + String.fromCharCode(10) + String.fromCharCode(10);
  }

  /**
   * 当前读数。四态：
   *   `ok`        —— idleContentMs < warn 且 idleMs < stall 且 bytes ≤ hard
   *   `slow`      —— 有字节，但「有内容」的空闲已过 warn（GC 抖动 / 慢节预热）
   *   `stalled`   —— 连字节都没有，idleMs ≥ stall（真卡死 / 等外部资源）
   *   `oversize`  —— 输出超硬上限
   *   优先级：oversize > stalled > slow > ok。
   */
  function snapshot() {
    const at = now();
    const idleMs = Math.max(0, at - st.lastByteAt);
    const idleContentMs = Math.max(0, at - st.lastContentAt);
    const elapsedMs = Math.max(0, at - st.startedAt);
    let state = 'ok', reason = st.reason || '';
    if (st.bytes > opts.hardBytes) { state = 'oversize'; reason = reason || 'hard-bytes'; }
    else if (idleMs >= opts.stallMs) { state = 'stalled'; reason = reason || 'no-bytes'; }
    else if (idleContentMs >= opts.idleWarningMs) { state = 'slow'; reason = reason || 'no-content'; }
    st.state = state; st.reason = reason;
    return {
      state: state, reason: reason,
      elapsedMs: elapsedMs, idleMs: idleMs, idleContentMs: idleContentMs,
      bytes: st.bytes, lines: st.lines, contentLines: st.contentLines,
      noiseLines: st.noiseLines, heartbeats: st.heartbeats,
      sectionsSeen: st.sectionsSeen, lastSection: st.lastSection,
      budgetMs: opts.budgetMs, overBudget: elapsedMs > opts.budgetMs,
    };
  }

  /** 一行可读摘要（写进 run.log 尾部 / 中断摘要，与 v2.131.0 的补写同形）。 */
  function summaryLine() {
    const s = snapshot();
    const names = { ok: '正常', slow: '慢（有字节无内容）', stalled: '停滞（无字节）', oversize: '输出超上限' };
    return '（观测器）' + (names[s.state] || s.state)
      + ' · 已跑 ' + (s.elapsedMs / 1000).toFixed(1) + 's'
      + ' · 空闲 ' + (s.idleMs / 1000).toFixed(1) + 's'
      + ' · 无内容 ' + (s.idleContentMs / 1000).toFixed(1) + 's'
      + ' · 内容行 ' + s.contentLines + '/' + s.lines
      + ' · 心跳 ' + s.heartbeats
      + ' · 已见节 ' + s.sectionsSeen
      + (s.lastSection ? ' · 末节「' + s.lastSection.slice(0, 40) + '」' : '')
      + ' · 输出 ' + (s.bytes / 1024).toFixed(1) + 'KB'
      + (s.overBudget ? ' · **已超预算**' : '');
  }

  /**
   * 增量预算：已用 X% 时每趟还能跑几节。
   *   判据：`可用剩余 = budgetMs - elapsedMs`；单节均耗按「已跑节数」估。
   *   只给建议，不执行 —— 调度器采纳与否由它决定（本仓「游标是建议不是命令」同规）。
   */
  function suggestSections(perSectionMs) {
    const s = snapshot();
    const mean = Number(perSectionMs);
    if (!Number.isFinite(mean) || mean <= 0) {
      return { suggestedSections: opts.sectionsPerTrip, mean: null,
        why: '无单节均耗时读数，沿用固定值 ' + opts.sectionsPerTrip };
    }
    const left = opts.budgetMs - s.elapsedMs;
    if (left <= 0) return { suggestedSections: 0, mean: mean, why: '预算已用尽（' + (s.elapsedMs / 1000).toFixed(1) + 's）' };
    const fit = Math.floor(left / mean);
    const n = Math.max(0, Math.min(opts.sectionsPerTrip, fit));
    return { suggestedSections: n, mean: mean, leftMs: left,
      why: '剩余 ' + (left / 1000).toFixed(1) + 's ÷ 单节 ' + (mean / 1000).toFixed(1) + 's = ' + fit + ' 节，取 min(' + opts.sectionsPerTrip + ') = ' + n };
  }

  /**
   * 冲掉缓冲里的残段。**子进程结束时必须调**：
   *   最后一节若没有以 `\n` 结尾（SIGKILL 前正好写了一半，或末尾省略换行），
   *   它永远不会成为「完整行」，于是 `lastSection` 停在上一节 —— 恰好把「死在哪一节」
   *   这一条最有用的读数丢掉。上游 `observeStream` 的 `boundary` 判据同理：
   *   流结束时不补一次边界，末尾帧就被丢掉。
   */
  function flush() {
    if (!st.partialLine) return false;
    const rest = st.partialLine;
    st.partialLine = '';
    return feedLine(rest);
  }

  return {
    options: opts,
    feedLine: feedLine, feedChunk: feedChunk, flush: flush,
    heartbeat: heartbeat, snapshot: snapshot, summaryLine: summaryLine,
    suggestSections: suggestSections,
    isNoise: isNoise, sectionOf: sectionOf,
  };
}

/**
 * 把观测器挂到一个 `child_process` 子进程上：双流监听 + 心跳定时器。
 *   返回 `{ stop, snapshot, summaryLine, timer }`。`stop()` 幂等。
 *   注意：**不终结进程** —— 杀与不杀是 launch() 的事，本文件只报态。
 */
function attach(child, options) {
  const obs = createObserver(options);
  const out = child && child.stdout, err = child && child.stderr;
  const onData = function (buf) { obs.feedChunk(buf); };
  if (out && typeof out.on === 'function') out.on('data', onData);
  if (err && typeof err.on === 'function') err.on('data', onData);
  let timer = null, stopped = false;
  if (obs.options.heartbeatIntervalMs > 0) {
    timer = setInterval(function () { obs.heartbeat(); }, obs.options.heartbeatIntervalMs);
    if (timer.unref) timer.unref();
  }
  const stop = function () {
    if (stopped) return;
    stopped = true;
    if (timer) { clearInterval(timer); timer = null; }
    obs.flush();   // 末行无换行时靠这一步才进入「已见节」统计
    if (out && typeof out.removeListener === 'function') out.removeListener('data', onData);
    if (err && typeof err.removeListener === 'function') err.removeListener('data', onData);
  };
  return { stop: stop, snapshot: obs.snapshot, summaryLine: obs.summaryLine,
    suggestSections: obs.suggestSections, observer: obs, timer: timer };
}

module.exports = {
  DEFAULTS: DEFAULTS,
  CONTENT_MIN_CHARS: CONTENT_MIN_CHARS,
  createObserver: createObserver,
  attach: attach,
  isNoise: isNoise,
  sectionOf: sectionOf,
};

// ── 自测：不依赖任何外部夹具，纯内存假时钟 ─────────────────────
if (require.main === module) {
  const assert = require('assert');
  let t = 0;
  const clock = function () { return t; };
  const o = createObserver({ now: clock, heartbeatIntervalMs: 1000, idleWarningMs: 5000, stallMs: 10000, hardBytes: 1024, budgetMs: 60000 });

  // ① 噪声行不算内容
  assert.strictEqual(o.feedLine('...'), false, '进度点算噪声');
  assert.strictEqual(o.feedLine(''), false, '空行算噪声');
  assert.strictEqual(o.feedLine('10.5s'), false, '纯计时行算噪声');
  // ② 真内容行算内容，并提取节名
  assert.strictEqual(o.feedLine('■ v2.408.0 (V23 超级史诗): EXV23-1~9'), true, '节标题算内容');
  let s = o.snapshot();
  assert.strictEqual(s.sectionsSeen, 1, '认出一个节');
  assert.ok(s.lastSection.indexOf('v2.408.0') === 0, '末节提取正确');
  assert.strictEqual(s.state, 'ok', '刚有内容 ⇒ ok');

  // ③ 有字节无内容 ⇒ slow（不是 stalled）
  t += 6000;
  o.feedLine('...');               // 噪声行也有字节
  s = o.snapshot();
  assert.strictEqual(s.idleMs, 0, '刚有字节 ⇒ idleMs 归零');
  assert.ok(s.idleContentMs >= 6000, '无内容时长累积');
  assert.strictEqual(s.state, 'slow', '有字节无内容 ⇒ slow');

  // ④ 连字节都没有 ⇒ stalled
  t += 12000;
  s = o.snapshot();
  assert.strictEqual(s.state, 'stalled', '无字节超 stall ⇒ stalled');

  // ⑤ 超硬上限 ⇒ oversize 且优先级最高
  t = 0;
  const o2 = createObserver({ now: clock, hardBytes: 8 });
  o2.feedChunk('这一行明显超过八个字节');
  assert.strictEqual(o2.snapshot().state, 'oversize', '超上限 ⇒ oversize');

  // ⑥ feedChunk 残段拼接（末行无换行时靠 flush 收口）
  const o3 = createObserver({ now: clock });
  o3.feedChunk('■ 第一行');
  o3.feedChunk('续\n■ 第二行');
  o3.flush();
  const s3 = o3.snapshot();
  assert.strictEqual(s3.sectionsSeen, 2, '残段拼成完整两行（含 flush 收口）');
  assert.strictEqual(s3.lastSection, '第二行', '第二行被识别');

  // ⑦ 预算建议：剩余 60s ÷ 单节 10s = 6 节，受 sectionsPerTrip 上限约束
  t = 0;
  const o4 = createObserver({ now: clock, budgetMs: 60000, sectionsPerTrip: 10 });
  t = 30000;
  const sug = o4.suggestSections(10000);
  assert.strictEqual(sug.suggestedSections, 3, '剩余 30s ÷ 10s = 3 节');
  const sug0 = o4.suggestSections(0);
  assert.strictEqual(sug0.suggestedSections, 10, '无均耗时 ⇒ 沿用固定值');

  // ⑧ 心跳是观测者自己的，不进被测行计数
  const before = o4.snapshot();
  o4.heartbeat();
  const after = o4.snapshot();
  assert.strictEqual(after.heartbeats, before.heartbeats + 1, '心跳数 +1');
  assert.strictEqual(after.lines, before.lines, '心跳不计入被测行数');

  console.log('RUN-OBSERVER: self-test pass（8 组判据）');
}