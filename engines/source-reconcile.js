/**
 * WorldAxis engines/source-reconcile.js (v2.409.0) — 来源编辑 → **依赖后缀撤销** + 复合票据
 *
 *  缝合来源：npc-life 3.0.0-beta.4 的 `world-service.js`（`capture` / `current` / `reconcile` /
 *  `resetBaseline`）与 `timeline.js`（`proposeTurn` 纯函数事务 / `undoTurns(fromIndex)`）。
 *
 *  ── 治什么 ──────────────────────────────────────────────────
 *  本仓已有 `engines/timeline.js` 的 `auditRefs`：它能算出 `valid / inherited / changed /
 *  missing` —— 但它**只报告**。「正文第 42 层被编辑了」之后该怎么办，此前没有机制：
 *  所有依赖那一层推出的后续（计划推进、状态迁移、事件投影）继续挂在上面，谁都没撤。
 *  于是「用户改一句话」与「世界凭空多出一段没发生过的事」是同一个故障的两面。
 *
 *  本模块补的是**撤销**这一半，并且给出「撤到哪、撤了什么、为什么停」三件可读读数。
 *
 *  ── 六条判据（全部来自上游真实行为，不自行发明）────────────────
 *   ① 前缀比对：来源是**有序**列表，逐位比 `key` 与 `hash`。
 *      `switched`（key 变了）/`edited`（hash 变了）/`deleted`（变短）⇒ 失效。
 *      `appended`（变长，旧前缀逐位一致）⇒ **不失效** —— 新消息不会让旧结论变错，
 *      这一点与上游一致，也是本模块最容易被写错的地方。
 *   ② 失效点定位：`from` = 第一个 `sourceIndex >= drift.index` 的回合下标。
 *      没有这样的回合 ⇒ `from = turns.length`（无可撤，但 drift 仍要报）。
 *   ③ 撤销方式：`before` 是**完整快照**，逆序不必要 —— 直接取 `turns[from].before`
 *      作为回退态。逐回合反向打补丁在「补丁本身依赖被撤内容」时会漏，完整快照不会。
 *   ④ 被撤记录**必须回带给调用方**（`revoked`），而不是静默丢弃：上游明确把被撤记录
 *      返回给宿主用于显示，本仓同规。
 *   ⑤ 去重：同一 `drift` 形态反复对账不得反复「保存」—— 用 `lastDrift` 记指纹，命中即
 *      返回 `repeated:true` 且不再产出新的 revoked。
 *   ⑥ 复合票据：一次分析开始前 `capture`，提交前 `current` 逐项比对；任一项变化即丢弃旧结果
 *      （而不是「尽力合并」）。票面七项：identity / chat / world / stateRevision / revision /
 *      signature / sourcesDigest。
 *
 *  ── 与邻座分工 ───────────────────────────────────────────────
 *   - `engines/timeline.js` 管**哈希与审计报告**（FNV 双哈希 / sourceRef / auditRefs）。
 *     本模块**不重造哈希算法**：hash 由调用方给（通常就是 timeline 的 sourceRef.hash），
 *     缺省时才用本地 FNV 兜底。
 *   - `core/undo.js` 管**单次操作级**回退；本模块管**来源驱动的跨回合后缀撤销**。
 *   - `engines/stale-guard.js` 管**陈旧判定**；本模块消费它的判定结果，只负责撤销动作。
 *
 *  ── 八条否定式边界 ────────────────────────────────────────────
 *   ① 总开关默认关闭；关闭时 reconcile 返回 `{ ok:true, skipped:true }`，一律不动。
 *   ② **零 store 写**：全文无 transact / save / localStorage 写口。撤销以「返回新时间线」
 *      的形式交付，写不写由调用方决定（与上游「宿主负责存储」同规）。
 *   ③ 零落盘、零模型调用、零网络。
 *   ④ 不推进任何时钟：只回退状态，不改 `clockMinutes` 的语义（回退时**一并回到 before 值**，
 *      这是「时间也属于状态」的直接后果，不是额外发明）。
 *   ⑤ 不自动 reset 基线：`resetBaseline` 只产出建议读数（`suggestion`），不执行。
 *   ⑥ 不猜测「用户想要的」：只按来源事实判定失效，不做语义比对。
 *   ⑦ 撤销范围**宁大不小**：从首个失效回合撤到末尾。上游同规 —— 保留一个依赖已删内容的
 *      回合，比多撤几个更难查。
 *   ⑧ 读数不静默：`reason` / `drift` / `revoked` / `repeated` 四件一律可见。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.409.0: 时钟守卫（既有写法：声明与 fallback 同行共现）。
   *  旧实现在多处直接裸调 `Date.now()`（id 尾缀 / 票据时刻 / 诊断 lastAt），
   *  裸调绕过冻结 ⇒ 同一份存档重放两次写下的时间戳必然不同，"可复现"只成立一半。 */
  function clockNow(site) { try { return WA.clock.now(site || 'source-reconcile'); } catch (e) { return Date.now(); } }


  const LS_KEY = 'worldaxis_source_reconcile_settings_v1';
  const DEF = { enabled: false, keepRevokedCap: 50, baselineDeltaCap: 5000 };
  const __REG = { key: LS_KEY, def: DEF, module: 'sourceReconcile',
    bounds: { keepRevokedCap: [0, 200], baselineDeltaCap: [100, 100000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /** 深拷贝：`before` 快照必须与运行时对象**无共享引用**，否则撤销等于没撤。 */
  function snapshot(value) {
    if (value === undefined) return undefined;
    try { return JSON.parse(JSON.stringify(value)); }
    catch (e) { return null; }   // 含函数/循环 ⇒ 快照失败，调用方必须当「不可撤销」处理
  }

  /** 本地 FNV-1a 32 位（仅在调用方没给 hash 时兜底，与 timeline.js 同族但独立实现）。 */
  function fnv(text) {
    let h = 0x811c9dc5;
    const s = String(text == null ? '' : text);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  /** 规范化来源列表：`[{key, hash, text?}]`。缺 hash 时按 text/content 兜底算。 */
  function normalizeSources(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach(function (item, i) {
      if (!item) return;
      const key = String(item.key != null ? item.key : item.id != null ? item.id : i);
      const hash = item.hash != null ? String(item.hash)
        : fnv(item.text != null ? item.text : item.content != null ? item.content : key);
      out.push({ key: key, hash: hash });
    });
    return out;
  }

  /**
   * 前缀比对。返回 `null`（无漂移）或 `{ index, kind, blocking, expected, actual }`。
   *   **`appended` 不 blocking** —— 这条判据是本模块唯一的「不失效」分支，容易被写成全失效。
   */
  function firstDrift(baseline, current) {
    const b = Array.isArray(baseline) ? baseline : [];
    const c = Array.isArray(current) ? current : [];
    // v2.409.0 收尾：baselineDeltaCap 此前是**声明了却零消费**的死键（死键扫描当场报出）。
    //   本意是「基线规模差超过多少就不再逐位比对」—— 逐位比对只在两侧规模接近时才有意义：
    //   基线 3 位、现状 500 位时，第一个差异位之后的逐位比对全是噪声，且会把
    //   「整篇换过」误报成「第 0 位被改了」。消费点就该在逐位循环的入口。
    const cap = Number(settings().baselineDeltaCap);
    const scale = Number.isFinite(cap) && cap > 0 ? cap : 5000;
    if (Math.abs(c.length - b.length) > scale) {
      return { index: 0, kind: 'scale-drift', blocking: true, expected: b.length, actual: c.length };
    }
    const n = Math.min(b.length, c.length);
    for (let i = 0; i < n; i++) {
      if (b[i].key !== c[i].key) return { index: i, kind: 'switched', blocking: true, expected: b[i].key, actual: c[i].key };
      if (b[i].hash !== c[i].hash) return { index: i, kind: 'edited', blocking: true, expected: b[i].hash, actual: c[i].hash };
    }
    if (c.length < b.length) return { index: c.length, kind: 'deleted', blocking: true, expected: b.length, actual: c.length };
    if (c.length > b.length) return { index: b.length, kind: 'appended', blocking: false, expected: b.length, actual: c.length };
    return null;
  }

  /** 回合的 sourceIndex 上界（该回合消费到的最后一个来源位）。 */
  function turnReach(turn) {
    const keys = Array.isArray(turn && turn.sourceKeys) ? turn.sourceKeys : [];
    let max = -1;
    for (const k of keys) {
      const v = Number(k);
      if (Number.isFinite(v) && v > max) max = v;
    }
    if (max >= 0) return max;
    const s = Number(turn && turn.sourceIndex);
    return Number.isFinite(s) ? s : -1;
  }

  /**
   * 从 `fromIndex` 起到末尾整体回退。返回 `{ ok, timeline, revoked, reason }`。
   *   `revoked` 是**被撤回合的浅记录**（id/标题/sourceKeys），按时间正序，便于宿主显示。
   */
  function undoFrom(timeline, fromIndex) {
    const t = timeline || {};
    const turns = Array.isArray(t.turns) ? t.turns : [];
    const idx = Number(fromIndex);
    const out = { ok: false, timeline: t, revoked: [], reason: '' };
    if (!Number.isInteger(idx) || idx < 0 || idx > turns.length) { out.reason = 'bad-index(' + fromIndex + ')'; return out; }
    if (idx === turns.length) { out.ok = true; out.reason = 'nothing-to-undo'; return out; }
    const target = turns[idx];
    if (!target || target.before === undefined) { out.reason = 'missing-before-snapshot@' + idx; return out; }
    const restored = snapshot(target.before);
    if (restored === null) { out.reason = 'uncloneable-before@' + idx; return out; }
    out.revoked = turns.slice(idx).map(function (turn) {
      return {
        id: turn && turn.id != null ? turn.id : null,
        title: turn && turn.title ? String(turn.title).slice(0, 120) : '',
        sourceKeys: Array.isArray(turn && turn.sourceKeys) ? turn.sourceKeys.slice(0, 24) : [],
        sourceIndex: turnReach(turn),
      };
    });
    const next = Object.assign({}, t, restored, {
      turns: turns.slice(0, idx),
      revision: Number.isFinite(Number(t.revision)) ? Number(t.revision) + 1 : 1,
    });
    out.ok = true; out.timeline = next; out.reason = 'undone';
    return out;
  }

  /**
   * 对账：按来源事实判断是否要撤、撤到哪。
   *   返回 `{ ok, skipped, drift, from, revoked, timeline, reason, repeated, suggestion }`。
   */
  function reconcile(timeline, currentSources, opts) {
    const st = settings();
    const t = timeline || {};
    const out = { ok: true, skipped: false, drift: null, from: null, revoked: [], timeline: t,
      reason: '', repeated: false, suggestion: '' };
    if (!st.enabled) { out.skipped = true; out.reason = 'disabled'; return out; }
    const baseline = Array.isArray(t.baselineSources) ? t.baselineSources : [];
    const current = normalizeSources(currentSources);
    const drift = firstDrift(baseline, current);
    if (!drift) { out.reason = 'no-drift'; return out; }
    out.drift = drift;
    if (!drift.blocking) { out.reason = 'appended-only'; return out; }
    const capsule = drift.kind + ':' + drift.index + ':' + drift.actual;
    const seen = Array.isArray(t.invalidReconciliations) ? t.invalidReconciliations : [];
    if (seen.indexOf(capsule) >= 0) {
      out.repeated = true; out.reason = 'duplicate-drift(' + capsule + ')';
      out.suggestion = '同一漂移已对账过；如需重来请显式重置基线（本模块不自动 reset）。'; return out;
    }
    const turns = Array.isArray(t.turns) ? t.turns : [];
    let from = turns.length;
    for (let i = 0; i < turns.length; i++) { if (turnReach(turns[i]) >= drift.index) { from = i; break; } }
    out.from = from;
    const undone = undoFrom(t, from);
    if (!undone.ok) { out.ok = false; out.reason = 'undo-failed:' + undone.reason; return out; }
    out.revoked = undone.revoked.slice(0, st.keepRevokedCap);
    const nextInvalid = seen.concat([capsule]).slice(-64);
    out.timeline = Object.assign({}, undone.timeline, {
      invalidReconciliations: nextInvalid,
      pausedReason: '正文来源已被' + (drift.kind === 'edited' ? '编辑' : drift.kind === 'deleted' ? '删除' : '切换')
        + '（第 ' + drift.index + ' 位）；已撤回依赖回合 ' + undone.revoked.length
        + ' 个，请明确重置基线或重新分析。',
    });
    out.reason = 'reconciled'; out.suggestion = undone.revoked.length
      ? '已撤 ' + undone.revoked.length + ' 个回合；如需重算请从第 ' + from + ' 回合起重跑。'
      : '无可撤回合，但基线已失效，请重置基线。';
    return out;
  }

  // ── 复合票据（capture / current）────────────────────────────────
  const TICKET_FIELDS = ['identity', 'chat', 'world', 'stateRevision', 'revision', 'signature'];

  /** 开一张票：把「这一刻的世界凭据」压成一个可逐项比对的记录。 */
  function capture(spec) {
    const s = spec || {};
    const t = { at: clockNow('source-reconcile'), epoch: Number.isFinite(Number(s.epoch)) ? Number(s.epoch) : 0 };
    for (const f of TICKET_FIELDS) t[f] = s[f] === undefined ? null : s[f];
    t.sourcesDigest = fnv(JSON.stringify(normalizeSources(s.sources)));
    t.sourcesCount = normalizeSources(s.sources).length;
    return t;
  }

  /**
   * 复核票面。返回 `{ ok, changed:[...] }` —— `ok:false` 时调用方**必须丢弃**旧结果。
   *   为什么逐项而不是整体 hash：整体 hash 变化了还得人工找出是哪一项，而这里的判据是
   *   「要不要丢」，逐项命名的成本远低于事后排查。
   */
  function current(ticket, spec) {
    const t = ticket;
    const s = spec || {};
    const out = { ok: true, changed: [] };
    if (!t || typeof t !== 'object') { out.ok = false; out.changed.push('no-ticket'); return out; }
    for (const f of TICKET_FIELDS) {
      const a = t[f] === undefined ? null : t[f];
      const b = s[f] === undefined ? null : s[f];
      if (a !== b) out.changed.push(f);
    }
    const d = fnv(JSON.stringify(normalizeSources(s.sources)));
    if (d !== t.sourcesDigest) out.changed.push('sources');
    const n = normalizeSources(s.sources).length;
    if (n < (t.sourcesCount || 0)) out.changed.push('sources-shrunk');
    out.ok = out.changed.length === 0;
    return out;
  }

  /** 一条可读的丢弃理由（与上游「世界或正文已变化，本次旧结果已丢弃」同形）。 */
  function discardReason(result) {
    if (!result || result.ok) return '';
    const names = { identity: '聊天身份', chat: '聊天对象', world: '世界', stateRevision: '状态版本',
      revision: '回合版本', signature: '正文签名', sources: '正文来源', 'sources-shrunk': '正文来源变短',
      'no-ticket': '票据缺失' };
    return '世界或正文已变化（' + result.changed.map(function (c) { return names[c] || c; }).join('、')
      + '），本次旧结果已丢弃。';
  }

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }

  const stat = { captures: 0, verdicts: 0, discards: 0, reconciles: 0, undos: 0, lastReason: '' };

  WA.sourceReconcile = {
    version: '2.409.0',
    TICKET_FIELDS: TICKET_FIELDS,
    snapshot: snapshot, fnv: fnv, normalizeSources: normalizeSources,
    firstDrift: firstDrift, turnReach: turnReach,
    undoFrom: undoFrom, reconcile: reconcile,
    capture: function (spec) { stat.captures++; return capture(spec); },
    current: function (ticket, spec) {
      stat.verdicts++;
      const r = current(ticket, spec);
      if (!r.ok) { stat.discards++; stat.lastReason = r.changed.join('+'); }
      return r;
    },
    discardReason: discardReason,
    trackReconcile: function (r) { stat.reconciles++; if (r && r.revoked && r.revoked.length) { stat.undos++; stat.lastReason = r.reason; } return r; },
    settings: settings, saveSettings: saveSettings,
    stats: function () { return Object.assign({}, stat); },
    resetStats: function () { for (const k of Object.keys(stat)) stat[k] = (typeof stat[k] === 'number') ? 0 : ''; },
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/source-reconcile.js', { kind: 'engine', ver: '2.409.0' });
  if (WA.log) WA.log('info', 'sourceReconcile 已加载（2.409.0）');
})();