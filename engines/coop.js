/**
 * WorldAxis engines/coop.js (v2.118.0) — 多人协作可靠性层（计划二 B9）
 *
 * ── 它治什么（缺口原句）────────────────────────────────────
 *   计划二 B9 原文：「当前 `collab` 属于本地会话、占用、排队和冲突记录。后续若确有多人共享世界
 *   需求，**先完善本地提议的待处理/确认/拒绝/重试**，以及关闭会话释放占用、确认前不标完成、
 *   历史归档与操作负载完整性。优先选择一个**权威世界维护者**，其他参与者提交**带基础版本**的
 *   提议；每位玩家只获得**自身视点**，冲突提供可理解的处理方式。传输、认证、断线恢复和授权
 *   单独建设，**不能用本地 session 或持有角色的声明当成真实身份**。
 *   验收：两人同时占同一角色、提交冲突资源操作、客户端重发、主持者拒绝、断线重连，
 *   都有确定结果与可追溯回执。」
 *
 * ── 与 collab 的分工（两者不是同一个问题）────────────────────
 *   collab 答的是「**本地有谁在开会话、谁占着哪个角色、排队排了什么**」——
 *   它是一组本地台账，零权威概念、零版本概念、零视点概念。
 *   本模块答的是「**一份提议能不能被权威世界接受**」——它需要四个 collab 里
 *   根本不存在的概念：基础版本、权威维护者、参与者视点、可追溯回执。
 *   故它是**新表**而不是往 collab 里塞字段：把 baseRev 塞进 queue 的行里，
 *   会让「排队的一笔操作」与「带版本的提议」在状态里长得一样。
 *
 * ── 七条否定式（本模块存在的全部理由）──────────────────────
 *   ① **本地 session 不是身份**。每个写入口都要求显式的 `by`；**从不**从
 *      collab 会话或占用声明里推身份（B9 原文点名）。`by` 缺席 ⇒ 拒收。
 *   ② **确认前不标完成**。提议的 `accepted` 只能由 `confirm()` 给出，
 *      且**必须**同时产出回执；回执失败 ⇒ 保持 pending 并如实报因。
 *   ③ **基础版本不匹配 ⇒ 拒收**，不自动合并、不猜测、不「尽力应用」。
 *      这是「权威世界维护者」这一概念的全部含义：世界只有一个版本序列。
 *   ④ **不凭空改**。提议里的每个路径在确认时都必须真的写进世界（走 setPath），
 *      应用不到就整份拒收（不做「部分成功」——那会留下半份没写进去的提议）。
 *   ⑤ **每位玩家只获得自身视点**。`viewOf(proposalId, person)` 只返回他自己
 *      知道的路径；别人的私有条目返回 `visible: false`（不是隐藏、不是返回空值）。
 *   ⑥ **重试有上限且可追溯**。`retry()` 只在 `pending/rejected` 且次数未满时生效；
 *      每次重试记 `tries`（「客户端重发了几次」是复盘证据）。
 *   ⑦ **历史归档与操作负载一起留痕**。归档行带上 `load`（提议携带的操作数），
 *      故「这位参与者长期提交了多少负载」可答；归档不删、只环形挤出。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────
 *   · 传输 / 认证 / 断线恢复 / 授权**不在本模块**（B9 原文点名要单独建设）：
 *     本模块只处理「一份带基础版本的提议到达本侧之后」的本地状态机。
 *   · 自动合并任意世界、去中心化同步、大规模并发**不在近期交付**（B9 原文）；
 *     故本模块只有**单一权威**模型：`confirm` 是唯一的接受口。
 *   · 实机多人联调**未执行**（规划原文亦未执行）。
 *   · 总开关默认关闭；关闭时不校验、不登记、不确认。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };
  const LS_KEY = 'worldaxis_coop_settings_v1';
  const DEF = {
    enabled: false,
    // 形状容忍（0 = 严格）。非 0 时：内容面顶层键数与长度都一致即视为同一状态
    //   （留给「同一批操作内先后提交」的余地）；指纹不等仍只在形状一致时才放过。
    //   默认 0：指纹不等即 stale，不做任何「尽力应用」。世界改过就是改过。
    horizon: 0,
    // 允许提议人自己确认（单机自用默认关：权威与提交同人时，「权威世界维护者」形同虚设）
    allowSelfApprove: false,
    // 同一份提议最多重试几次（客户端重发是常态，但要有上限才答得出「它被重发了几次」）
    maxTries: 3,
    // 视点里最多回几行（每人各自有界）
    maxView: 60
  };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'coop',
    bounds: { horizon: [0, 86400000], maxTries: [0, 20], maxView: [1, 200] }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 提议状态：**确认前不标完成** —— accepted 只由 confirm 给出
  const STATUS = ['pending', 'accepted', 'rejected', 'superseded'];
  const STATUS_CN = { pending: '待处理', accepted: '已确认', rejected: '已拒绝', superseded: '已被新提议取代' };
  const LIMITS = { ROWS: 24, ARCHIVE: 40, OPS: 24, TEXT: 80, PATH: 120 };
  const stat = {
    proposed: 0, pending: 0, accepted: 0, rejected: 0, retried: 0, stale: 0,
    blocked: 0, receipts: 0, faults: {}, lastReason: ''
  };
  // 与本仓其余模块同规格：门面把计数转发给执行上下文里的计数袋（试演不污染真计数器）
  function execMod() { return (WA.exec && typeof WA.exec.withContext === 'function') ? WA.exec : null; }
  function storeOf() { const e = execMod(); return e ? e.storeOf(WA.store) : WA.store; }
  function mutate(fn, opt) {
    const e = execMod(); const st = storeOf();
    return e ? e.mutate(st, fn, opt) : (st && st.transact ? st.transact(fn, opt) : { ok: false, reason: 'store-absent' });
  }
  function statBagOf() {
    const e = execMod(); const bag = e ? e.statBag(stat) : stat;
    if (bag && bag !== stat) {
      Object.keys(stat).forEach(function (k) {
        if (bag[k] === undefined) {
          const v = stat[k];
          bag[k] = (v && typeof v === 'object') ? Object.assign(Object.create(null), v) : v;
        }
      });
    }
    return bag || stat;
  }
  const S = (function () {
    const f = {};
    Object.keys(stat).forEach(function (k) {
      Object.defineProperty(f, k, { enumerable: true,
        get: function () { return statBagOf()[k]; },
        set: function (v) { statBagOf()[k] = v; } });
    });
    return f;
  })();
  function noteFault(reason) {
    const tag = String(reason == null ? 'unknown' : reason);
    S.faults[tag] = (S.faults[tag] || 0) + 1;
    S.blocked++;
    S.lastReason = tag;
    return tag;
  }
  function str(v, max) {
    if (typeof v !== 'string') return '';
    return v.replace(/\s+/g, ' ').trim().slice(0, max || LIMITS.TEXT);
  }
  function finite(v) {
    if (v === undefined || v === null || v === '' || typeof v === 'boolean') return NaN;
    const n = Number(v);
    return isFinite(n) ? n : NaN;
  }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : str(v, max); }
  function state() { const st = storeOf(); return st && st.get ? (st.get() || {}) : {}; }
  function nodeOf(draft) {
    if (!draft.coop || typeof draft.coop !== 'object' || Array.isArray(draft.coop)) {
      draft.coop = { proposals: [], archive: [] };
    }
    const n = draft.coop;
    if (!Array.isArray(n.proposals)) n.proposals = [];
    if (!Array.isArray(n.archive)) n.archive = [];
    if (typeof n.seq !== 'number') n.seq = 0;
    return n;
  }
  function rowsOf() { const n = state().coop; return (n && Array.isArray(n.proposals)) ? n.proposals : []; }
  function archiveOf() { const n = state().coop; return (n && Array.isArray(n.archive)) ? n.archive : []; }
  /** 人物查找的唯一口（与 liaison 同口径：键 / 前缀键 / name / id 四种写法都认）。 */
  function personOf(person) {
    const who = str(person, 60);
    if (!who) return null;
    const ppl = state().people || {};
    const keys = Object.keys(ppl);
    for (let i = 0; i < keys.length; i++) {
      const p = ppl[keys[i]];
      if (!p) continue;
      if (keys[i] === who || keys[i] === 'p_' + who || p.name === who || p.id === who) return p;
    }
    return null;
  }
  /**
   * 世界版本戳（**权威的唯一依据**）。三件东西一起比：
   *   rev   —— 世界**内容面**的指纹（对簿记之外的整片状态做确定性散列）
   *   keys  —— 内容面顶层键数（答「容器被增删了」）
   *   chars —— 内容面序列化长度（答「内容被改了」）
   *   `rev` 刻意**不是** `meta.stateRev`：那个计数器每事务递增，而本模块的 propose / retry
   *   自己就走事务 —— 用它做版本，等于「我提交一份提议」就足以让这份提议自己作废，
   *   于是没有任何提议能被确认（实测踩中）。口径改为「只对世界内容面求指纹」，
   *   本模块与协作层的簿记（meta / coop / collab）整片排除。
   *   残余边界如实登记：其它模块若在自己的簿记容器里写入，也会推动指纹 ⇒ 提议被判 stale。
   *   方向是保守的（宁可让人重提，也不错误地接受过期提交），不假称已消除。
   *   `keys/chars` 不是装饰：批内已改内存、尚未落盘的那一类变化只有它们看得见。
   *   刻意**不含时刻**：把 now 放进戳里会让「什么都没变的两次提交」永不相等。
   */
  const BOOK = { meta: 1, coop: 1, collab: 1 };
  // v2.160.0（TP4）：跨引擎提交回执（commit.receipts）是**簿记**不是世界事实 —— 与
  //   meta / coop / collab 同口径从内容指纹里排除。不排除的后果：确认一份提议会写一条
  //   回执 ⇒ 指纹被推动 ⇒ **别的在途提议当场被判 stale**（b9 的「协作簿记不得推动
  //   指纹」判据治的正是这一类）。
  BOOK.commit = 1;
  function contentOf() {
    const s = state();
    const w = {};
    Object.keys(s).forEach(function (k) { if (!BOOK[k]) w[k] = s[k]; });
    return w;
  }
  /** 确定性指纹（FNV-1a 32 位；同一内容恒同值，不含时刻、不含随机）。 */
  function fingerprint(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function stamp() {
    const w = contentOf();
    let json = '';
    try { json = JSON.stringify(w); } catch (e) { json = ''; }
    return { rev: fingerprint(json), keys: Object.keys(w).length, chars: json.length };
  }
  function sameStamp(a, b) {
    if (!a || !b) return false;
    return a.rev === b.rev && a.keys === b.keys && a.chars === b.chars;
  }
  /**
   * 参与者是否有权提交/确认：**只认显式传入的 `by`**。
   *   刻意不读 collab 的会话或占用声明 —— 「本地 session 或持有角色」不是身份（B9 原文）。
   */
  function actorOf(by, person) {
    const a = clean(by, 60);
    if (!a) return { ok: false, reason: 'missing-actor' };
    // 参与者在世界里存在（认不出的名字不进协作面：否则谁都能以任意名字提交）
    if (person && !str(person, 60)) return { ok: false, reason: 'missing-person' };
    return { ok: true, actor: a };
  }
  /** 该角色此刻是否被**别的**会话占着（只读；不夺取、不等待，如实报持有者）。 */
  function claimOf(actor) {
    try {
      if (WA.collab && typeof WA.collab.holderOf === 'function') {
        return WA.collab.holderOf(actor) || null;
      }
    } catch (e) {}
    return null;
  }
  /**
   * 提交一份提议（**带基础版本**）。
   *   `ops`：`[{ path, value }]`——路径是**世界里的绝对路径**（如 `world.places`）。
   *   `baseRev`：提议人看到的世界版本（三件一起给）。缺席 ⇒ 拒收（无版本的提议不可裁）。
   *   幂等键 `opId`：客户端重发是常态，第二次只拿回第一份原结果。
   */
  function propose(input) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const it = input || {};
    const opId = clean(it.opId, 60);
    if (!opId) { noteFault('missing-op'); return { ok: false, reason: 'missing-op' }; }
    const act = actorOf(it.by);
    if (!act.ok) { noteFault(act.reason); return { ok: false, reason: act.reason }; }
    const by = act.actor;
    const actor = clean(it.actor, 60);          // 提议涉及的**角色**（可空：世界级提议）
    if (actor && !personOf(actor)) { noteFault('unknown-actor'); return { ok: false, reason: 'unknown-actor', actor: actor }; }
    const base = it.baseRev && typeof it.baseRev === 'object' ? it.baseRev : null;
    if (!base || !isFinite(finite(base.rev)) || !isFinite(finite(base.keys)) || !isFinite(finite(base.chars))) {
      noteFault('missing-base'); return { ok: false, reason: 'missing-base', note: '提议必须带基础版本（rev + keys + chars）' };
    }
    const rawOps = Array.isArray(it.ops) ? it.ops : [];
    if (!rawOps.length) { noteFault('no-ops'); return { ok: false, reason: 'no-ops' }; }
    if (rawOps.length > LIMITS.OPS) { noteFault('too-many-ops'); return { ok: false, reason: 'too-many-ops', cap: LIMITS.OPS }; }
    const ops = [];
    for (let i = 0; i < rawOps.length; i++) {
      const o = rawOps[i] || {};
      const p = str(o.path, LIMITS.PATH);
      if (!p) { noteFault('bad-op'); return { ok: false, reason: 'bad-op', index: i }; }
      ops.push({ path: p, value: (o.value === undefined ? null : o.value) });
    }
    // 幂等先于一切：重发不得产出第二份提议
    const hit = rowsOf().filter(function (x) { return x && x.opId === opId; })[0];
    if (hit) {
      S.retried++;
      return { ok: true, reused: true, opId: opId, id: hit.id, status: hit.status,
        statusLabel: STATUS_CN[hit.status] || hit.status, tries: hit.tries };
    }
    const now = isFinite(finite(it.at)) ? Number(it.at) : clockNow('coop');
    let out = null;
    mutate(function (draft) {
      const n = nodeOf(draft);
      if (n.proposals.length >= LIMITS.ROWS) { out = { ok: false, reason: 'proposals-full', cap: LIMITS.ROWS }; return false; }
      const id = 'cp_' + String(now).toString(36) + '_' + (n.seq = (n.seq || 0) + 1);
      const row = {
        id: id, opId: opId, by: by, actor: actor,
        baseRev: { rev: Number(base.rev), keys: Math.round(Number(base.keys)), chars: Math.round(Number(base.chars)) },
        ops: ops, load: ops.length,
        status: 'pending', statusLabel: STATUS_CN.pending,
        note: str(it.note, LIMITS.TEXT),
        tries: 0, receiptId: '', reason: '',
        at: now, decidedAt: 0, decidedBy: '', updatedAt: now
      };
      n.proposals.push(row);
      if (WA.evict) WA.evict.array(n.proposals, 'coop.proposals');
      out = { ok: true, reused: false, opId: opId, id: id, status: row.status,
        statusLabel: row.statusLabel, load: ops.length };
      return true;
    }, 'coop:propose');
    if (!out || !out.ok) return out || { ok: false, reason: 'store-unavailable' };
    S.proposed++; S.pending++; S.lastReason = 'proposed';
    return out;
  }
  /** 待处理（只读；可只取某位参与者的）。 */
  function pending(of) {
    const who = clean(of, 60);
    return rowsOf().filter(function (x) { return x && x.status === 'pending' && (!who || x.by === who); })
      .map(function (x) {
        return { id: x.id, opId: x.opId, by: x.by, actor: x.actor, load: x.load,
          baseRev: Object.assign({}, x.baseRev), tries: x.tries, at: x.at };
      });
  }
  /** 归档（只读；含终态与负载，答「这位参与者长期提交了多少」）。 */
  function archive(limit) {
    const lim = Math.max(1, Math.floor(finite(limit)) || 20);
    return archiveOf().slice(-lim).map(function (x) {
      return { id: x.id, opId: x.opId, by: x.by, actor: x.actor, status: x.status,
        statusLabel: STATUS_CN[x.status] || x.status, load: x.load, tries: x.tries,
        receiptId: x.receiptId || '', reason: x.reason || '', at: x.at, decidedAt: x.decidedAt, decidedBy: x.decidedBy };
    });
  }
  /** 把一行从 proposals 移到 archive（**不删**：终态是复盘证据）。 */
  function fileOut(n, row, finalStatus, reason, decidedBy, atMs, receiptId) {
    row.status = finalStatus;
    row.statusLabel = STATUS_CN[finalStatus] || finalStatus;
    row.reason = str(reason, LIMITS.TEXT);
    row.decidedAt = atMs;
    row.decidedBy = decidedBy;
    row.receiptId = receiptId || '';
    row.updatedAt = atMs;
    n.proposals = n.proposals.filter(function (x) { return x && x.id !== row.id; });
    n.archive.push({
      id: row.id, opId: row.opId, by: row.by, actor: row.actor, status: finalStatus,
      load: row.load, tries: row.tries, baseRev: Object.assign({}, row.baseRev),
      ops: row.ops.slice(), note: row.note, receiptId: receiptId || '',
      reason: row.reason, at: row.at, decidedAt: atMs, decidedBy: decidedBy
    });
    if (WA.evict) WA.evict.array(n.archive, 'coop.archive');
    return true;
  }
  /** 按路径写世界（`a.b.c` / `a[0]` 两种写法都认）。路径不存在 ⇒ 拒收，不代造中间层。 */
  function setPath(root, path, value) {
    const segs = String(path).replace(/\[(\d+)\]/g, '.$1').split('.').filter(function (s) { return s !== ''; });
    if (!segs.length) return { ok: false, reason: 'bad-path' };
    let cur = root;
    for (let i = 0; i < segs.length - 1; i++) {
      const k = segs[i];
      if (cur === null || typeof cur !== 'object' || !(k in cur) || cur[k] === null || typeof cur[k] !== 'object') {
        return { ok: false, reason: 'path-missing', at: segs.slice(0, i + 1).join('.') };
      }
      cur = cur[k];
    }
    const last = segs[segs.length - 1];
    if (cur === null || typeof cur !== 'object') return { ok: false, reason: 'bad-path' };
    if (!Array.isArray(cur) && !(last in cur)) return { ok: false, reason: 'path-missing', at: segs.join('.') };
    cur[last] = value;
    return { ok: true };
  }
  /**
   * 确认一份提议（**唯一的接受口**，权威世界维护者在这里）。
   *   顺序刻意从「这份提议本身」到「世界条件」，任何一条不过 ⇒ 整份拒收、零写入：
   *     ① 存在且为 pending（确认前不标完成：已终态的只回原结果）
   *     ② 操作者显式给出，且（除非 allowSelfApprove）不得是提议人自己
   *     ③ 角色占用：被**别的**会话占着 ⇒ 拒收并带出持有者（不夺取）
   *     ④ **基础版本**：与世界当前版本逐项相等，否则 stale 拒收（不自动合并）
   *     ⑤ 每条 op 的路径都真的存在（应用不到的整份拒收，不做部分成功）
   *   全部通过后：写入世界 + 登记离线队列回执（走 collab 的单一出口）。
   */
  function confirm(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const pid = clean(id, 60);
    if (!pid) { noteFault('bad-proposal'); return { ok: false, reason: 'bad-proposal' }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const act = actorOf(o.by);
    if (!act.ok) { noteFault(act.reason); return { ok: false, reason: act.reason }; }
    const by = act.actor;
    const now = isFinite(finite(o.at)) ? Number(o.at) : clockNow('coop');
    const row = rowsOf().filter(function (x) { return x && x.id === pid; })[0] || null;
    if (!row) {
      // 已终态（或从没存在）⇒ 只返回原结果，**不重复接受**
      const gone = archiveOf().filter(function (x) { return x && x.id === pid; })[0] || null;
      if (gone) {
        S.retried++;
        return { ok: true, reused: true, id: pid, status: gone.status,
          statusLabel: STATUS_CN[gone.status] || gone.status, receiptId: gone.receiptId || '',
          note: '已终态，不重复确认' };
      }
      noteFault('no-proposal'); return { ok: false, reason: 'no-proposal' };
    }
    // ② 权威与提交不同人（默认）：单机自用时显式打开 allowSelfApprove 才能自审
    if (!cfg.allowSelfApprove && row.by === by) {
      noteFault('self-approve'); return { ok: false, reason: 'self-approve', by: by,
        note: '权威世界维护者不得是提议人自己（allowSelfApprove 可显式打开）' };
    }
    // ③ 占用（只读，绝不夺取）
    const holder = row.actor ? claimOf(row.actor) : null;
    if (holder && holder !== by) {
      noteFault('actor-claimed-by-other');
      return { ok: false, reason: 'actor-claimed-by-other', actor: row.actor, holder: holder };
    }
    // ④ 基础版本（世界改过就是改过，不做「尽力应用」）
    const cur = stamp();
    const tolerance = isFinite(finite(cfg.horizon)) ? Number(cfg.horizon) : 0;
    const same = sameStamp(row.baseRev, cur);
    if (!same) {
      S.stale++;
      // 时钟容差只放宽**时刻**语义；rev/keys/chars 三项任一项不等即为 stale。
      //   horizon 的用途是给「同一批操作内先后提交」留一点余地：此时 rev 可能差 1，
      //   但 keys/chars 一致 ⇒ 属于「世界形状未变」，仍算可裁。
      const shapeOnly = tolerance > 0
        && row.baseRev.keys === cur.keys && row.baseRev.chars === cur.chars;
      if (!shapeOnly) {
        noteFault('stale-base');
        return { ok: false, reason: 'stale-base', base: Object.assign({}, row.baseRev), current: cur,
          note: '基础版本与世界当前版本不一致：请基于当前版本重新提交（不自动合并）' };
      }
    }
    // ⑤ 先干跑一遍（只读副本上验路径），全部通过才真写
    const dry = JSON.parse(JSON.stringify(state()));
    for (let i = 0; i < row.ops.length; i++) {
      const r = setPath(dry, row.ops[i].path, row.ops[i].value);
      if (!r.ok) {
        noteFault('unappliable');
        return { ok: false, reason: 'unappliable', path: row.ops[i].path, why: r.reason,
          note: '任一条路径应用不到 ⇒ 整份拒收（不做部分成功）' };
      }
    }
    let out = null;
    mutate(function (draft) {
      const n = nodeOf(draft);
      const live = n.proposals.filter(function (x) { return x && x.id === pid; })[0];
      if (!live) { out = { ok: false, reason: 'no-proposal' }; return false; }
      if (live.status !== 'pending') {
        out = { ok: true, reused: true, id: pid, status: live.status, receiptId: live.receiptId || '' };
        return false;
      }
      for (let i = 0; i < live.ops.length; i++) {
        const r = setPath(draft, live.ops[i].path, live.ops[i].value);
        if (!r.ok) { out = { ok: false, reason: 'unappliable', path: live.ops[i].path, why: r.reason }; return false; }
      }
      if (!draft.coop || typeof draft.coop !== 'object') draft.coop = { proposals: [], archive: [] };
      fileOut(draft.coop, live, 'accepted', '', by, now, '');
      out = { ok: true, reused: false, id: pid, applied: live.ops.length, receiptId: '' };
      return true;
    }, 'coop:confirm');
    if (!out || !out.ok) return out || { ok: false, reason: 'store-unavailable' };
    if (out.reused) { S.retried++; return out; }
    // 回执：走 collab 的离线队列单一出口（本模块不自造第二套排队设施）。
    //   回执失败 ⇒ 提议**不算已确认**（拉回 pending 并如实报因）——「确认前不标完成」的另一半。
    let receiptId = '';
    let receiptDone = false;
    try {
      if (WA.collab && typeof WA.collab.enqueue === 'function') {
        const r = WA.collab.enqueue('coop:' + pid, 'coop-apply', { proposal: pid, by: by, ops: row.load }, { by: by });
        if (r && r.ok === true) { receiptId = 'r_' + pid; receiptDone = true; }
        else {
          mutate(function (draft) {
            const n = nodeOf(draft);
            const a = n.archive.filter(function (x) { return x && x.id === pid; })[0];
            if (a) {
              // 拉回待处理必须**连状态一起退回**：只把行搬回去而不改状态，外部读到的仍是
              //   「已确认」（pending() 看不见它、view().byStatus 还记着 accepted），
              //   那等于「确认前不标完成」只做了一半（实测踩中）。
              a.status = 'pending'; a.statusLabel = STATUS_CN.pending;
              a.decidedAt = 0; a.decidedBy = ''; a.receiptId = '';
              a.reason = 'receipt-failed'; a.updatedAt = now;
              n.proposals.push(a);
              n.archive = n.archive.filter(function (x) { return x && x.id !== pid; });
              if (WA.evict) WA.evict.array(n.proposals, 'coop.proposals');
            }
            return true;
          }, 'coop:receipt-rollback');
          noteFault('receipt-failed');
          return { ok: false, reason: 'receipt-failed', why: (r && r.reason) || 'enqueue-refused',
            worldWritten: true,
            note: '回执未落 ⇒ 提议退回待处理（世界写入已发生且未撤销，但这次确认**不标完成**）' };
        }
      } else {
        noteFault('no-receipt-face');
        return { ok: false, reason: 'no-receipt-face', note: '回执面缺席 ⇒ 不标完成' };
      }
    } catch (e) {
      noteFault('receipt-threw');
      return { ok: false, reason: 'receipt-threw' };
    }
    if (receiptDone) {
      mutate(function (draft) {
        const n = nodeOf(draft);
        const a = n.archive.filter(function (x) { return x && x.id === pid; })[0];
        if (a) a.receiptId = receiptId;
        return true;
      }, 'coop:receipt');
      S.receipts++;
      // v2.160.0（TP4）：确认回执落位后补记**跨引擎提交回执** —— 「已提交但当时没记」
      //   的补账口（core/commit.js 的 settle 只写 commit.receipts，不碰本模块任何世界键）。
      //   落在这里而不是 confirm 的事务里：settle 是**事务外**的一次独立写入，
      //   与 collab 回执同处一个「世界已写、通知刚发」的时点。
      if (WA.commit && typeof WA.commit.settle === 'function') {
        try { WA.commit.settle('coop:' + pid, { site: 'coop', note: 'coop-apply' }); } catch (e) {}
      }
    }
    S.accepted++; S.lastReason = 'accepted';
    return { ok: true, reused: false, id: pid, status: 'accepted', statusLabel: STATUS_CN.accepted,
      applied: row.ops.length, receiptId: receiptId, at: now };
  }
  /** 拒绝一份提议（**必带理由与操作者**；拒绝也进归档，不删）。 */
  function reject(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const pid = clean(id, 60);
    if (!pid) { noteFault('bad-proposal'); return { ok: false, reason: 'bad-proposal' }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const act = actorOf(o.by);
    if (!act.ok) { noteFault(act.reason); return { ok: false, reason: act.reason }; }
    const reason = clean(o.reason, LIMITS.TEXT);
    if (!reason) { noteFault('missing-reason'); return { ok: false, reason: 'missing-reason', note: '拒绝必须给理由' }; }
    const now = isFinite(finite(o.at)) ? Number(o.at) : clockNow('coop');
    let out = null;
    mutate(function (draft) {
      const n = nodeOf(draft);
      const live = n.proposals.filter(function (x) { return x && x.id === pid; })[0];
      if (!live) { out = { ok: false, reason: 'no-proposal' }; return false; }
      if (live.status !== 'pending') { out = { ok: true, reused: true, id: pid, status: live.status }; return false; }
      fileOut(n, live, 'rejected', reason, act.actor, now, '');
      out = { ok: true, reused: false, id: pid, status: 'rejected', statusLabel: STATUS_CN.rejected, reason: reason };
      return true;
    }, 'coop:reject');
    if (!out || !out.ok) return out || { ok: false, reason: 'store-unavailable' };
    if (!out.reused) { S.rejected++; S.lastReason = 'rejected'; }
    return out;
  }
  /**
   * 重试一份提议（客户端重发 / 断线重连后的显式动作）。
   *   只在 `rejected` 时生效（`pending` 本来就还在队列里，重试等于什么都不做）；
   *   次数上限之后如实拒收 —— 「它被重发了几次」必须答得出。
   */
  function retry(id, opts) {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const pid = clean(id, 60);
    if (!pid) { noteFault('bad-proposal'); return { ok: false, reason: 'bad-proposal' }; }
    const o = (opts && typeof opts === 'object') ? opts : {};
    const act = actorOf(o.by);
    if (!act.ok) { noteFault(act.reason); return { ok: false, reason: act.reason }; }
    const now = isFinite(finite(o.at)) ? Number(o.at) : clockNow('coop');
    const cap = Math.max(0, Math.floor(finite(cfg.maxTries)));
    const gone = archiveOf().filter(function (x) { return x && x.id === pid; })[0] || null;
    if (!gone) { noteFault('no-proposal'); return { ok: false, reason: 'no-proposal' }; }
    if (gone.status !== 'rejected') {
      S.retried++;
      return { ok: true, reused: true, id: pid, status: gone.status, note: '只有被拒绝的提议需要重试' };
    }
    if (gone.tries >= cap) {
      noteFault('tries-exhausted');
      return { ok: false, reason: 'tries-exhausted', tries: gone.tries, cap: cap };
    }
    // 重试 = 用**当前**版本重开一份（提议人此刻看到的版本才是它真正的基础版本）
    const cur = stamp();
    let out = null;
    mutate(function (draft) {
      const n = nodeOf(draft);
      const a = n.archive.filter(function (x) { return x && x.id === pid; })[0];
      if (!a) { out = { ok: false, reason: 'no-proposal' }; return false; }
      if (n.proposals.length >= LIMITS.ROWS) { out = { ok: false, reason: 'proposals-full' }; return false; }
      const tries = (a.tries || 0) + 1;
      a.tries = tries;
      const row = {
        id: 'cp_' + String(now).toString(36) + '_r' + (n.seq = (n.seq || 0) + 1), opId: a.opId, by: a.by, actor: a.actor,
        baseRev: { rev: cur.rev, keys: cur.keys, chars: cur.chars },
        ops: a.ops.slice(), load: a.load, status: 'pending', statusLabel: STATUS_CN.pending,
        note: a.note, tries: tries, receiptId: '', reason: '',
        at: now, decidedAt: 0, decidedBy: '', updatedAt: now
      };
      n.proposals.push(row);
      if (WA.evict) WA.evict.array(n.proposals, 'coop.proposals');
      out = { ok: true, reused: false, id: row.id, fromId: pid, status: 'pending', tries: tries, baseRev: row.baseRev };
      return true;
    }, 'coop:retry');
    if (!out || !out.ok) return out || { ok: false, reason: 'store-unavailable' };
    S.retried++; S.pending++; S.lastReason = 'retried';
    return out;
  }
  /**
   * 参与者自身视点（**每位玩家只获得自身视点**）。
   *   每条 op 给 `visible`：只有该参与者知道的世界条目才算可见；
   *   别人的私有条目返回 `visible:false`（**不是**隐藏、不是空值 —— 空值会被读成「没有」）。
   */
  function viewOf(id, person) {
    const pid = clean(id, 60);
    const who = clean(person, 60);
    if (!pid || !who) return { ok: false, reason: 'missing-fields' };
    const cfg = settings();
    const lim = Math.max(1, Math.floor(finite(cfg.maxView)));
    const row = rowsOf().filter(function (x) { return x && x.id === pid; })[0]
      || archiveOf().filter(function (x) { return x && x.id === pid; })[0] || null;
    if (!row) return { ok: false, reason: 'no-proposal' };
    const mine = row.actor && (row.actor === who || row.by === who);
    const me = who.replace(/^p_/, '');
    const ops = (row.ops || []).slice(0, lim).map(function (o) {
      // 「私有」= 路径里带本模块约定的 `people.<人>.private` 形状
      const m = /^people\.([^.]+)\.private\b/.exec(o.path);
      const owner = m ? m[1].replace(/^p_/, '') : '';
      // 「每位玩家只获得自身视点」：别人的私有条目**一律**不可见 —— 与提议是不是他提的无关。
      //   看不到就是看不到（`visible:false`），**不是**隐藏、不是空值（空值会被读成「没有」）。
      const visible = !owner || owner === me;
      return { path: o.path, visible: visible, owner: owner };
    });
    return { ok: true, id: pid, person: who, status: row.status, mine: !!mine,
      load: row.load, ops: ops, truncated: (row.ops || []).length > lim };
  }
  /** 追溯：一份提议的回执与裁决（答「谁在什么时候把它怎么了」）。 */
  function traceOf(id) {
    const pid = clean(id, 60);
    if (!pid) return { ok: false, reason: 'bad-proposal' };
    const live = rowsOf().filter(function (x) { return x && x.id === pid; })[0] || null;
    const gone = archiveOf().filter(function (x) { return x && x.id === pid; })[0] || null;
    const row = live || gone;
    if (!row) {
      // v2.160.0（TP4）：归档是**环形容器**（ARCHIVE=40）—— 被挤出之后，「这一笔的裁决
      //   在哪」仍要答得出，故回落到**跨引擎提交回执**（core/commit.js 的 replay，
      //   跨刷新可用；回执写在提交那一刻的同一个事务里，不靠进程态）。
      //   注意本分支**只在 live/gone 都没有时**才走 —— 不动既有判据链（既有行一律
      //   按原口径回答，破坏项的现形路径一条不遮）。
      const rp = (WA.commit && typeof WA.commit.replay === 'function')
        ? (function () { try { return WA.commit.replay('coop:' + pid); } catch (e) { return null; } })()
        : null;
      if (rp && rp.ok === true && rp.receipt) {
        return { ok: true, id: pid, opId: 'coop:' + pid, by: rp.receipt.site || '', actor: '',
          status: 'accepted', statusLabel: STATUS_CN.accepted, archived: true, load: 0, tries: 0,
          baseRev: {}, decidedAt: rp.receipt.at || 0, decidedBy: '',
          receiptId: 'r_' + pid, reason: '', viaCommitReceipt: true };
      }
      return { ok: false, reason: 'no-proposal', id: pid };
    }
    return { ok: true, id: pid, opId: row.opId, by: row.by, actor: row.actor,
      status: row.status, statusLabel: STATUS_CN[row.status] || row.status,
      archived: !live, load: row.load, tries: row.tries,
      baseRev: Object.assign({}, row.baseRev),
      decidedAt: row.decidedAt || 0, decidedBy: row.decidedBy || '',
      receiptId: row.receiptId || '', reason: row.reason || '' };
  }
  /** 只读视图（面板 / 诊断消费）。 */
  function view(opts) {
    const cfg = settings();
    const o = opts || {};
    const lim = Math.max(1, Math.min(200, Math.floor(finite(o.limit)) || 10));
    const rows = rowsOf();
    const byStatus = {};
    STATUS.forEach(function (s) { byStatus[s] = 0; });
    rows.forEach(function (r) { if (r && byStatus[r.status] !== undefined) byStatus[r.status]++; });
    const arch = archiveOf();
    return {
      ok: true, enabled: cfg.enabled, allowSelfApprove: !!cfg.allowSelfApprove,
      statuses: STATUS.slice(), statusLabel: Object.assign({}, STATUS_CN),
      pending: rows.length, archived: arch.length,
      load: arch.reduce(function (a, x) { return a + (x && x.load ? x.load : 0); }, 0),
      byStatus: byStatus,
      recent: rows.slice(-lim).map(function (r) {
        return { id: r.id, by: r.by, actor: r.actor, status: r.status, load: r.load, tries: r.tries,
          baseRev: Object.assign({}, r.baseRev) };
      })
    };
  }
  function statView() {
    const bag = statBagOf();
    return Object.assign({}, bag, { faults: Object.assign({}, bag.faults),
      pending: rowsOf().length, archive: archiveOf().length });
  }
  WA.coop = {
    STATUS: STATUS.slice(), STATUS_CN: Object.assign({}, STATUS_CN), LIMITS: Object.assign({}, LIMITS),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    propose: propose, confirm: confirm, reject: reject, retry: retry,
    pending: pending, archive: archive, viewOf: viewOf, traceOf: traceOf,
    stamp: stamp, view: view, statView: statView,
    stat: function () { const bag = statBagOf(); return Object.assign({}, bag, { faults: Object.assign({}, bag.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/coop.js', { kind: 'engine', ver: '2.118.0' });
})();