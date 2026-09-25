# -*- coding: utf-8 -*-
"""v2.87.0 B6：把 tick 的推进语义抽成**唯一实现**，真跑与试演共用同一份。

不抽的代价（本版要治的）：试演若另写一遗推进规则，它给出的预览会
在某个分支上与真跑不一致——而那种不一致恰好最难发现：用户据预览做决定，
真跑却走了另一条路。

四处锚点均须恰中 1 次；不中即 ABORT（不拿近似字符串蒙）。
"""
import io, sys

PATH = 'engines/causal.js'
src = io.open(PATH, encoding='utf-8').read()

# ── 锚点 1：tick 函数体（起止两锚点切分）──
TICK_START = "  function tick(facts) {\n"
TICK_END = "    return { ok: true, changed: changed, expired: expired, reason: stat.lastReason };\n  }\n"

if src.count(TICK_START) != 1:
    print('ABORT tick start count=%d' % src.count(TICK_START)); sys.exit(1)
if src.count(TICK_END) != 1:
    print('ABORT tick end count=%d' % src.count(TICK_END)); sys.exit(1)

i0 = src.index(TICK_START)
i1 = src.index(TICK_END) + len(TICK_END)
old_tick = src[i0:i1]

NEW_TICK = r'''  function tick(facts) {
    const cfg = settings();
    if (!cfg.enabled) { stat.lastReason = 'disabled'; return { ok: true, changed: 0, reason: 'disabled' }; }
    const f = facts || {};
    let n = null;
    WA.store.transact(function (draft) {
      // v2.87.0 B6：推进语义只有一份（advanceChains），真跑与试演共用。
      n = advanceChains(draft, f, cfg);
      stat.expired += n.expired;
      stat.acts += n.acted;
    }, 'causal:tick');
    const changed = n ? n.changed : 0, expired = n ? n.expired : 0;
    if (n && n.pending) stat.lastReason = 'condition-open';
    stat.lastReason = expired ? 'expired' : (changed ? 'advanced' : (stat.lastReason || 'nothing-to-do'));
    return { ok: true, changed: changed, expired: expired, reason: stat.lastReason };
  }
'''

src = src[:i0] + NEW_TICK + src[i1:]

# ── 锚点 2：stateView 整块 -> summarize + stateView + 四个新能力 ──
SV_START = "  function stateView() {\n"
SV_END = "  function classify(chainId) {\n"
if src.count(SV_START) != 1:
    print('ABORT sv start=%d' % src.count(SV_START)); sys.exit(1)
if src.count(SV_END) != 1:
    print('ABORT sv end=%d' % src.count(SV_END)); sys.exit(1)
j0 = src.index(SV_START)
j1 = src.index(SV_END)

NEW_BLOCK = r'''  /**
   * v2.87.0 B6：一轮推进的**唯一实现**——真跑（tick）与分支试演（rehearse）共用同一份。
   *
   * 抽出来的理由不是「少写代码」，而是**两份实现必然漂移**：试演若另写一通推进规则，
   * 它给出的预览会在某个分支上与真跑不一致——而那种不一致恰好最难发现：
   * 用户据预览做决定，真跑却走了另一条路。
   *
   * 约定：只改传入的 draft（试演传深拷贝），**不碰 store、不碰 stat、不写台账**。
   * only 非空时只推进指定链（供单点干预预览）；真跑不传。
   */
  function advanceChains(draft, f, cfg, only) {
    const c = ensureCausal(draft);
    const now = isFinite(Number(f.now)) ? Number(f.now) : clockNow('causal');
    const n = { changed: 0, expired: 0, acted: 0, immediate: 0, delayed: 0, pending: 0, untouched: 0,
      skipped: Math.max(0, c.chains.length - cfg.maxChains), facts: [] };
    const rows = c.chains.slice(-cfg.maxChains).filter(function (x) { return !only || (x && x.id === only); });
    rows.forEach(function (x) {
      if (!x || isTerminal(x)) { n.untouched++; return; }
      if (!knownCause(x.cause) && (f.pruneInvalid !== false)) {
        x.status = 'expired'; x.stage = 'open';
        x.cancelReason = '前提消失（原因已不在世界事实中）'; x.updatedAt = now;
        n.expired++; n.changed++;
        return;
      }
      if (x.status === 'open') {
        const ready = !x.condition || (Array.isArray(f.metConditions) && f.metConditions.indexOf(x.condition) >= 0);
        if (!ready) {
          if (x.stage !== 'pending') { x.stage = 'pending'; x.updatedAt = now; n.changed++; }
          n.pending++;
          return;
        }
        x.status = 'acted'; x.stage = 'acted'; x.updatedAt = now;
        x.actedAt = now; n.changed++; n.acted++;
        return;
      }
      if (x.status === 'acted') {
        if (x.immediate) {
          draft.worldFacts = Array.isArray(draft.worldFacts) ? draft.worldFacts : [];
          if (!draft.worldFacts.some(function (w) { return w && w.key === ('causal:' + x.id); })) {
            draft.worldFacts.push({ id: 'wf_' + x.id, key: 'causal:' + x.id, value: x.immediate, scope: 'world', source: 'causal', at: now });
            if (draft.worldFacts.length > 100) draft.worldFacts.splice(0, draft.worldFacts.length - 100);
            n.facts.push('causal:' + x.id);
          }
        }
        x.status = 'immediate'; x.stage = 'immediate'; x.updatedAt = now; n.changed++; n.immediate++;
        return;
      }
      if (x.status === 'immediate') {
        x.status = 'delayed'; x.stage = 'delayed'; x.updatedAt = now; n.changed++; n.delayed++;
      }
    });
    return n;
  }
  /** 当前状态的摘要（单一实现：stateView 与试演后的读数同源） */
  function summarize(st) {
    const rows = (((st || {}).causal || {}).chains || []).filter(function (x) { return x && typeof x === 'object'; });
    const byStatus = {};
    let live = 0, terminal = 0, scheduled = 0;
    rows.forEach(function (x) {
      const k = String(x.status || '(未标注)');
      byStatus[k] = (byStatus[k] || 0) + 1;
      if (isTerminal(x)) terminal++; else live++;
      (x.delayed || []).forEach(function (d) { if (d && d.status === 'scheduled') scheduled++; });
    });
    return {
      chains: rows.length, live: live, terminal: terminal,
      byStatus: byStatus, scheduledDelayed: scheduled,
      settledRows: (((st || {}).causal || {}).settled || []).length
    };
  }
  function stateView() { return summarize(state()); }
  /**
   * v2.87.0 B6：分支试演——「如果这一轮这么推进，会发生什么」。
   *
   * 与 rehearse 的分工：本函数跑**一整轮**（全部在推进窗口内的链），
   * previewIntervention 跑**单个动作**（定点）。
   *
   * 三条硬约束（清单：分支零污染）：
   *   ① 在深拷贝上跑，不调 store.transact；
   *   ② 不碰 stat、不写任何台账 —— 试演不得在任何面上留下痕迹；
   *   ③ 与真跑共用 advanceChains —— 预览与真跑不同源就毫无意义。
   */
  function rehearse(facts) {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    const f = facts || {};
    const draft = JSON.parse(JSON.stringify(state() || {}));
    const snap = function (d) {
      const m = {};
      (((d.causal || {}).chains) || []).forEach(function (x) {
        if (x && x.id) m[x.id] = { status: x.status, stage: x.stage };
      });
      return m;
    };
    const b = snap(draft);
    const n = advanceChains(draft, f, cfg);
    const a = snap(draft);
    const changes = [];
    Object.keys(a).forEach(function (id) {
      const x = b[id], y = a[id];
      if (!x || x.status !== y.status || x.stage !== y.stage) {
        changes.push({ id: id, from: x ? (x.status + '/' + x.stage) : '(新)', to: y.status + '/' + y.stage });
      }
    });
    return { ok: true, counts: n, changes: changes, facts: n.facts.slice(), after: summarize(draft), dryRun: true };
  }
  /**
   * v2.87.0 B6：干预预览——「现在对这条链做这个动作，会变成什么」（只读，零副作用）。
   *   导演面所有误操作都源于「先执行再看结果」；预览不留痕，才谈得上
   *   「干预预览留痕」——留痕的是**选择**，不是预览本身。
   *   action ∈ {advance, cancel, settle}。allowed=false 时给出原因码（与真跑同一套）。
   */
  function previewIntervention(chainId, action, args) {
    const cfg = settings();
    const cid = clean(chainId, 80), act = clean(action, 40);
    if (!cid || !act) return { ok: false, reason: 'missing-fields' };
    const x0 = row(cid);
    if (!x0) return { ok: false, reason: 'missing-chain' };
    const a = args || {};
    const before = { status: x0.status, stage: x0.stage };
    if (act === 'advance') {
      if (!cfg.enabled) return { ok: true, chain: cid, action: act, allowed: false, reason: 'disabled', before: before };
      const draft = JSON.parse(JSON.stringify(state() || {}));
      const n = advanceChains(draft, a, cfg, cid);
      const x = (((draft.causal || {}).chains) || []).filter(function (y) { return y && y.id === cid; })[0] || {};
      return { ok: true, chain: cid, action: act, allowed: true, before: before,
        after: { status: x.status, stage: x.stage }, counts: n,
        willWrite: n.facts.slice(), wouldChange: n.changed > 0, dryRun: true };
    }
    if (act === 'cancel') {
      if (isTerminal(x0)) return { ok: true, chain: cid, action: act, allowed: false, reason: 'chain-terminal', before: before };
      return { ok: true, chain: cid, action: act, allowed: true, before: before,
        after: { status: 'cancelled', stage: x0.stage }, reason: clean(a.reason, 80) || '调用方取消', dryRun: true };
    }
    if (act === 'settle') {
      const block = settleBlockReason(x0);
      if (block) return { ok: true, chain: cid, action: act, allowed: false, reason: block, before: before };
      const did = clean(a.delayedId, 80);
      const d = ((x0.delayed || []).filter(function (y) { return y && y.id === did; })[0]) || null;
      if (!d && did) return { ok: true, chain: cid, action: act, allowed: false, reason: 'missing-delayed', before: before };
      if (d && d.status !== 'scheduled') return { ok: true, chain: cid, action: act, allowed: false, reason: 'already-' + d.status, before: before };
      return { ok: true, chain: cid, action: act, allowed: true, before: before,
        after: { status: x0.status, stage: x0.stage, delayedId: d ? d.id : '', echo: d ? ('ec_' + d.id) : '' },
        willWrite: d ? ['ec_' + d.id] : [], dryRun: true };
    }
    return { ok: false, reason: 'unknown-action', action: act };
  }
  /**
   * v2.87.0 B6：冲突显式选择——同因同果的重复链。
   *   实测缺口：对同一 cause 连续两次同 action 建链，得到两条独立链，各自 tick、
   *   各自落事实 ⇒ 世界状态里出现两个「带伞」，调用方无从知道该用哪条。
   *   本函数只**报出**冲突（只读，不改任何状态）；消解由调用方显式选择
   *   （cancel 其一 / 都留）——「静默取一」才是真缺陷。
   */
  function conflicts() {
    const rows = (((state().causal || {}).chains) || []).filter(function (x) { return x && !isTerminal(x); });
    const seen = {}, out = [];
    rows.forEach(function (x) {
      const k = txt(x.cause) + ' :: ' + txt(x.action);
      if (seen[k]) {
        out.push({ cause: x.cause, action: x.action, ids: [seen[k].id, x.id],
          options: [seen[k].id, x.id, 'both'], note: '两条在途链同因同果，须显式选择保留哪条' });
      } else seen[k] = x;
    });
    return out;
  }
  /**
   * v2.87.0 B6：回放证据——「这一轮的推进凭什么？能不能重放同一个结果？」
   *   随机源已由 core/rand 治理（种子/通道/draws 可分列），但**没有任何一处把它与
   *   因果推进绑在一起**：事后想说「这一轮是可复现的」只能自己拼读数。
   *   reproducible=false 时**不得声称可回放**（自动种子刷新即换）。
   */
  function evidence() {
    const cfg = settings();
    const rnd = (WA.rand && typeof WA.rand.randStat === 'function') ? WA.rand.randStat() : null;
    const view = stateView();
    return {
      enabled: !!cfg.enabled, maxChains: cfg.maxChains,
      seed: rnd ? rnd.seed : null, seedSource: rnd ? rnd.seedSource : 'rand-absent',
      reproducible: !!(rnd && rnd.reproducible),
      draws: rnd ? rnd.draws : 0,
      channels: rnd && rnd.byChannel ? Object.keys(rnd.byChannel).sort() : [],
      chains: view.chains, byStatus: view.byStatus,
      acts: stat.acts, expired: stat.expired, blocked: stat.blocked
    };
  }
'''

src = src[:j0] + NEW_BLOCK + src[j1:]

# ── 锚点 3：导出面 ──
OLD_EXPORT = "    stateView: stateView\n  };"
NEW_EXPORT = ("    stateView: stateView,\n"
              "    // v2.87.0 B6：导演面四个只读口（干预预览 / 分支试演 / 冲突报出 / 回放证据）。\n"
              "    //   全部零副作用：预览与试演不改任何状态，冲突只报不消解，证据只读。\n"
              "    previewIntervention: previewIntervention,\n"
              "    rehearse: rehearse,\n"
              "    conflicts: conflicts,\n"
              "    evidence: evidence\n"
              "  };")
if src.count(OLD_EXPORT) != 1:
    print('ABORT export count=%d' % src.count(OLD_EXPORT)); sys.exit(1)
src = src.replace(OLD_EXPORT, NEW_EXPORT)

# ── 锚点 4：txt 小工具（本文件原先没有；conflicts 的键拼接必须同一处实现）──
TXT_ANCHOR = "  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }\n"
if src.count(TXT_ANCHOR) != 1:
    print('ABORT txt anchor=%d' % src.count(TXT_ANCHOR)); sys.exit(1)
src = src.replace(TXT_ANCHOR, TXT_ANCHOR + "  function txt(v) { return (v === undefined || v === null) ? '' : String(v); }\n")

io.open(PATH, 'w', encoding='utf-8').write(src)
print('OK patched causal.js for B6')
print('DONE')
