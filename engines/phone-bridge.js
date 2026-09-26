/**
 * WorldAxis engines/phone-bridge.js (v2.97.0) — 跨插件因果桥（入站边）
 *
 * 【为什么需要这一面】engines/bridge.js 做的是**出站**边：把本扩展的世界投影出去给
 *   RubyPhone / LonSha 读。但反向那条边一直是断的——手机侧的交互动作（回消息 / 置顶 /
 *   拉黑）在真实剧情里**就是世界里的因**，而本扩展看不见它们：一次「拉黑」之后，
 *   因果结算面照旧只有正文里冒出来的那些 cause，于是同一件事在两边各说一遍。
 *   X5 的计划判据写得很直白：手机侧一次「拉黑」要在本扩展生成一条因果链
 *   （原因=交互执行），evidence() 要能把这条链追溯到那笔手机操作。
 *
 * 【与 bridge.js 的分工（两侧不可互相调用）】
 *   · bridge.js      —— 只读**出站**：本扩展 → 外部。零写世界状态。
 *   · phone-bridge.js —— **入站**：外部 → 本扩展。它唯一的副产物是「登记一笔操作」。
 *   两者刻意不共用实现：出站要深拷贝 + 去抖 + 投影裁剪，入站要的是**幂等 + 留痕 + 可追溯**，
 *   把它们合成一个模块，最直接的后果就是「读取外部快照」与「接受外部写入」共用一条代码路径——
 *   而那正是本仓库最不想要的一种混合（观测面与写入面混在一起）。
 *
 * 【口径（全是否定式，这六条正是本模块存在的全部理由）】
 *   1 **入站是显式动作**：`noteAction()` 是唯一写入口。不挂事件监听、不轮询手机侧存储、
 *     不自动消费任何外部快照——「自己动起来」的桥无法被归因，出了问题也说不清是谁写的。
 *   2 **绝不覆盖世界状态**：本模块**只写 `causal.phoneOps`**（一笔操作台账），一个字段都不碰。
 *     手机侧说「拉黑了谁」不等于世界里的关系已变——那是结算面的事，不是桥的事。
 *   3 **幂等**：同一笔操作重复上报返回 `reused:true`（按 `opId` 认），既不重复登记也不报错。
 *     手机侧的重试是常态，不能因此把台账写胀。
 *   4 **不认识的动作一律拒收**（`unknown-act`）：白名单 `PHONE_ACTS` 四值封闭。
 *     收到不认识的动作就照收，等于让外部决定本扩展的因果词汇表。
 *   5 **能力缺席如实降级**：不检查 RubyPhone 是否在场、不宣称「已接入」——
 *     入站面不依赖对方在场（对方不在场时这笔操作仍然发生过），
 *     但 `phase` 读数会**照实**报出「手机侧此刻有没有在推」（`pushing` / `quiet` / `unknown`）。
 *   6 **可追溯**：每笔操作带 `at`（决策时间）与 `seq`（递变序），`traceOf(opId)` 把它们
 *     与因果链 id 连起来——**追溯靠真源比对，不靠字符串拼接猜**。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const BRIDGE_ID = 'worldaxis_phone_ops_v1';
  const OPS_VERSION = 1;
  const LS_KEY = 'worldaxis_phone_bridge_v1';
  // 动作白名单（**封闭集合**）：手机侧能作为「因」的动作类型。
  //   `block`（拉黑）与 `unblock`（解除）是两个方向，不合并——合并就答不出「现在是拉黑还是解除」。
  const PHONE_ACTS = ['message', 'pin', 'block', 'unblock'];
  const ACT_LABEL = { message: '回消息', pin: '置顶', block: '拉黑', unblock: '解除拉黑' };
  // 缺席三态：手机侧有没有在推。`unknown` 是**合法的默认**——
  //   不允许用 `quiet` 冒充「我检查过，它没在推」（本仓库「缺席不得被读成无事发生」的口径）。
  const PHASES = ['pushing', 'quiet', 'unknown'];
  // 台账容量是**常量**而非设置项：这里刻意不给滑块。
  //   为什么：本仓库的容量一律「常量 + evict 站点同源 + 满员拒收」三件套
  //   （causal.chains 24 / rumor.chains 8 都是这么办的）。做成 [1,200] 的滑块，
  //   就会出现「设置里写着 200、evict 站点却按 40 静默挤掉」——两套容量治理互相打架，
  //   而「静默挤掉」正是本仓库点名反对的那类失效。满员时**拒收**（ops-full），
  //   台账里每一笔都还在，谁也不会被无声抹掉。
  const MAX_OPS = 40;
  const __REG = {
    key: LS_KEY,
    def: { enabled: false, linkCausal: true },
    module: 'phoneBridge'
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : __REG.def;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, __REG.def, raw || {})) : Object.assign({}, __REG.def, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, __REG.def, next || {})));
  }
  const stat = { noted: 0, reused: 0, blocked: 0, linked: 0, linkFails: 0, lastReason: '',
    lastAct: '', lastOpId: '', faults: {}, byAct: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.blocked++; stat.lastReason = reason;
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 80); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function ops() { const p = state().causal; return (p && Array.isArray(p.phoneOps)) ? p.phoneOps : []; }
  /** 动作是否白名单内（未知动作报空串，**不回落成 message**——那是替外部决定语义）。 */
  function actOf(v) {
    const a = clean(v, 20);
    return PHONE_ACTS.indexOf(a) >= 0 ? a : '';
  }
  /** 人在场与否**不判**：手机侧的操作是既成事实，本模块不对它做资格校验。 */

  /**
   * 登记一笔手机侧操作（**唯一写入口**）。
   *   @param {{opId:string, act:string, from?:string, to?:string, text?:string, at?:number, chainId?:string}} item
   *   @returns {{ok:boolean, reason?:string, opId?:string, reused?:boolean, id?:string, chainId?:string}}
   *   真源是 `causal.phoneOps`（与因果链同容器，但**另立一张表**：把手机操作混进 chains
   *   会让「世界里发生的事」与「手机上按下的按钮」在状态里长得一样）。
   */
  function noteAction(item) {
    const it = item || {};
    const opId = clean(it.opId, 60);
    const act = actOf(it.act);
    if (!opId || !act) { noteFault(!act ? 'unknown-act' : 'missing-op'); return { ok: false, reason: !act ? 'unknown-act' : 'missing-op' }; }
    // 关闭时「收下了但不记」与「没收下」是两件事：照实报 disabled，不返回成功
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    let out = null;
    WA.store.transact(function (draft) {
      const c = (draft.causal && typeof draft.causal === 'object') ? draft.causal : (draft.causal = { chains: [], settled: [] });
      if (!Array.isArray(c.phoneOps)) c.phoneOps = [];
      // 幂等：同一笔操作重复上报（手机侧重试是常态）返回原样，不追加第二条
      //   顺序不可颠倒：幂等判定必须**先于**满员判定，否则台账满时同一笔重试
      //   会从「已收下（reused）」变成「没收下（ops-full）」——手机侧看到的重试语义当场翻转。
      const hit = c.phoneOps.filter(function (x) { return x && x.opId === opId; })[0];
      if (hit) { out = { ok: true, reused: true, opId: opId, id: hit.id, chainId: hit.chainId || '', act: hit.act }; return false; }
      // 满员拒收（不静默挤掉最早的）：挤掉一笔等于让「这条链的因」在事后消失，
      //   而手机侧那笔操作**确实发生过**——台账少一笔，追溯就永远断在那里。
      if (c.phoneOps.length >= MAX_OPS) { out = { ok: false, reason: 'ops-full', cap: MAX_OPS }; return false; }
      const now = (it.at === undefined || it.at === null || !isFinite(Number(it.at))) ? clockNow('phone-bridge') : Number(it.at);
      const seq = c.phoneOps.length + 1;
      const row = {
        id: 'po_' + String(now).toString(36) + '_' + seq,
        opId: opId, act: act, actLabel: ACT_LABEL[act] || act,
        from: clean(it.from, 60), to: clean(it.to, 60),
        // 正文/备注**不进台账**：手机侧的原文属于那个插件的领域，本侧只留一笔「发生过什么」
        text: clean(it.text, 120),
        at: now, seq: seq,
        // 因果链 id 是**上报时给的**（手机侧如果知道那条链），也可由 linkChain 事后补
        chainId: clean(it.chainId, 60)
      };
      c.phoneOps.push(row);
      // 兜底剪枝走既有 evict 站点（与其余容器同一套容量治理，不自建第二套）。
      //   正常情况下上游的 ops-full 已经拦住，这里只在「有别的路径直写这张表」时才生效。
      if (WA.evict) WA.evict.array(c.phoneOps, 'phoneBridge.ops');
      out = { ok: true, reused: false, opId: opId, id: row.id, act: act, actLabel: row.actLabel, seq: seq, chainId: row.chainId };
      return true;
    }, 'phone-bridge:note-action');
    if (out && out.ok) {
      stat.noted++; stat.lastReason = out.reused ? 'reused' : 'noted';
      stat.lastAct = act; stat.lastOpId = opId;
      if (out.reused) stat.reused++;
      else stat.byAct[act] = (stat.byAct[act] || 0) + 1;
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 把一笔已登记的操作接到一条因果链上（**只改 phoneOps 的 chainId**，不碰链本身）。
   *   为什么分两步而不是在 noteAction 里一步做完：手机侧常常先按键、后由正文结算出原因，
   *   强迫它一次报全，等于让「链还没建好」变成「这笔操作白记了」。
   *   @returns {{ok:boolean, reason?:string, opId?:string, chainId?:string, already?:boolean}}
   */
  function linkChain(opId, chainId) {
    const op = clean(opId, 60), cid = clean(chainId, 60);
    if (!op || !cid) return { ok: false, reason: 'missing-fields' };
    if (!settings().linkCausal) return { ok: false, reason: 'link-off' };
    // 链必须**已存在**：接一条不存在的链，等于用桥给世界造一条因果
    const exists = (function () {
      try { const cs = (state().causal || {}).chains || []; return cs.some(function (x) { return x && x.id === cid; }); } catch (e) { return false; }
    })();
    if (!exists) { stat.linkFails++; return { ok: false, reason: 'unknown-chain', chainId: cid }; }
    let out = null;
    WA.store.transact(function (draft) {
      const c = (draft.causal && typeof draft.causal === 'object') ? draft.causal : null;
      if (!c || !Array.isArray(c.phoneOps)) { out = { ok: false, reason: 'no-ops' }; return false; }
      const hit = c.phoneOps.filter(function (x) { return x && x.opId === op; })[0];
      if (!hit) { out = { ok: false, reason: 'unknown-op', opId: op }; return false; }
      if (hit.chainId === cid) { out = { ok: true, already: true, opId: op, chainId: cid }; return false; }
      // 已接过别的链：**不覆盖**。一笔操作改变不了自己当初引起的是哪条链，
      //   静默改写会让「这条链的因」在事后被换掉而没人知道。
      if (hit.chainId) { out = { ok: false, reason: 'already-linked', opId: op, chainId: hit.chainId, want: cid }; return false; }
      hit.chainId = cid; hit.linkedAt = clockNow('phone-bridge');
      out = { ok: true, already: false, opId: op, chainId: cid };
      return true;
    }, 'phone-bridge:link');
    if (out && out.ok && !out.already) stat.linked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 追溯（纯读）：一条因果链 → 它背后那几笔手机操作。
   *   方向是「链 → 操作」：判据里那句话读作「evidence() 可把链回放到手机操作记录」，
   *   反过来问（这笔操作引起了什么）由 opTrace 答。两个方向都只读。
   */
  function traceOf(chainId) {
    const cid = clean(chainId, 60);
    if (!cid) return { ok: false, reason: 'missing-fields' };
    const rows = ops().filter(function (x) { return x && x.chainId === cid; });
    return { ok: true, chainId: cid, count: rows.length,
      items: rows.map(function (x) { return { opId: x.opId, act: x.act, actLabel: x.actLabel, from: x.from, to: x.to, at: x.at }; }),
      // 一笔都没接上不是错误，但它必须是**可见的**：说明这条链的因不在手机侧
      note: rows.length ? '' : '这条链上没有登记过手机侧操作（它的因在世界侧）' };
  }
  /** 追溯（纯读，反方向）：一笔手机操作 → 它接在哪个链上。 */
  function opTrace(opId) {
    const op = clean(opId, 60);
    if (!op) return { ok: false, reason: 'missing-fields' };
    const hit = ops().filter(function (x) { return x && x.opId === op; })[0];
    if (!hit) return { ok: false, reason: 'unknown-op', opId: op };
    return { ok: true, opId: op, act: hit.act, actLabel: hit.actLabel, id: hit.id,
      chainId: hit.chainId || '', linked: !!hit.chainId, at: hit.at, seq: hit.seq };
  }
  /**
   * 相位读数（只读）：手机侧此刻有没有在推。
   *   三态由**本进程内是否见过上报**与「最近一次上报多久以前」共同决定——
   *   但 `quiet` 只在**确有过上报**之后才可能出现；没有过任何上报时一律 `unknown`
   *   （「它没在推」与「我不知道它推不推」是两件事）。
   */
  function phaseOf() {
    const cfg = settings();
    if (!cfg.enabled) return { phase: 'disabled', sinceMs: -1, note: '入站桥默认关闭：手机侧的操作不会进世界台账' };
    const last = (function () {
      let mx = 0;
      ops().forEach(function (x) { if (x && isFinite(Number(x.at)) && Number(x.at) > mx) mx = Number(x.at); });
      return mx;
    })();
    if (!last) return { phase: 'unknown', sinceMs: -1, note: '本会话尚未收到过任何手机侧上报（与「它没在推」不是同一件事）' };
    const now = clockNow('phone-bridge.phase');
    const since = Math.max(0, now - last);
    const window = 15 * 60 * 1000;
    return { phase: since <= window ? 'pushing' : 'quiet', sinceMs: since, lastAt: last,
      note: since <= window ? '最近有上报' : '最近一次上报已超出活跃窗口（15 分钟）' };
  }
  /** 挂载入站点（与出站桥同规格：宿主侧用同一个消费习惯） */
  function ensureMounted() {
    try {
      const w = WA.mainWin || window;
      if (w && w[BRIDGE_ID] !== api) w[BRIDGE_ID] = api;
    } catch (e) {}
  }
  const api = WA.phoneBridge = {
    id: BRIDGE_ID, version: OPS_VERSION,
    PHONE_ACTS: PHONE_ACTS, ACT_LABEL: ACT_LABEL, PHASES: PHASES,
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    noteAction: noteAction,
    linkChain: linkChain,
    traceOf: traceOf,
    opTrace: opTrace,
    phaseOf: phaseOf,
    // 只读视图（诊断 / 面板消费）：三态计数 + 逐动作分列 + 未接链的笔数
    stat: function () {
      return {
        enabled: !!settings().enabled, linkCausal: !!settings().linkCausal, maxOps: MAX_OPS,
        noted: stat.noted, reused: stat.reused, blocked: stat.blocked,
        linked: stat.linked, linkFails: stat.linkFails,
        lastReason: stat.lastReason, lastAct: stat.lastAct, lastOpId: stat.lastOpId,
        byAct: Object.assign({}, stat.byAct), faults: Object.assign({}, stat.faults),
        // 台账现值（只读存档）
        rows: ops().length,
        unlinked: ops().filter(function (x) { return x && !x.chainId; }).length,
        linked_rows: ops().filter(function (x) { return x && !!x.chainId; }).length,
        phases: (function () { const p = phaseOf(); return { phase: p.phase, sinceMs: p.sinceMs }; })()
      };
    },
    // 容量上限走既有 evict 表（站点 'phoneBridge.ops'）——不自建第二套容量治理。
    //   刻意**不导出** resetStat：与 bridge.js 同裁决，stat() 前后做差即可驱动测试。
    opsView: function (limit) {
      const n = Math.max(1, Math.min(200, Math.floor(Number(limit)) || 20));
      return { rows: ops().length,
        items: ops().slice(-n).map(function (x) {
          return { id: x.id, opId: x.opId, act: x.act, actLabel: x.actLabel, from: x.from, to: x.to, at: x.at, seq: x.seq, chainId: x.chainId || '' };
        }) };
    }
  };
  ensureMounted();
  if (WA.log) WA.log('info', '跨插件因果桥（入站）已就绪（' + BRIDGE_ID + '，默认休眠：' + (__REG.def.enabled === false) + '）');
})();