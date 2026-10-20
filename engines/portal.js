/* portal.js —— 出口屏障引擎（WA.portal）
 *
 * 治什么：同一轮里多个自动模块抢着往外发东西（抢发/重发/漏发）不再靠运气。
 *   - 发送屏障：多个并发请求按「最大」而非「求和」压下轮次载荷（并发不是叠加）；
 *   - 轮次签名：取末条消息 id 优先、内容比对待验，防「删楼重发」被误判为新轮。
 *
 * 缝合来源：SoulLink（js/send-barrier.js 的跨扩展发送屏障——并发取 max 而非求和，
 *   轮次签名取末条消息 id 优先 + 内容比对防「删楼重发误判」）
 *
 * 与邻座分工：interceptor / host 管拦截与接桥，settle-guard 管结算护栏；
 *   portal 只管「这一轮到底该不该往外发、发多少次、发的是不是同一轮」。
 *
 * 边界（否定式）：
 *   1. 并发压载取 max，不求和（求和会把单轮载荷吹大）。
 *   2. 签名优先认消息 id；id 拿不到才回落内容指纹，且明说是回落。
 *   3. 同签名重入一律拒（不重复发）。
 *   4. 屏障失效会如实报 open 数，不假装关着。
 *   5. 不管内容怎么生成，只管出口次数与轮次对的。
 *   6. 不落盘、不跨会话继承（屏障是单会话内的机制）。
 *   7. 不清空别人已排的队，只记并报冲突。
 *   8. 不代替 reject-recovery 做被拒后的重试。
 *   9. 有硬上限，不无限累积。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.230.0：决策时间统一出口（裸调 Date.now 会绕过冻结，回放对不上时只能全库通读）。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_portal_settings_v1';
  const DEF = { enabled: false, maxInflight: 8, maxLog: 64, barrier: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'portal',
    bounds: { maxInflight: [1, 32], maxLog: [8, 256] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const CHANNELS = ['ext:inject', 'ext:status', 'ext:notify', 'ext:archive'];
  const CHANNEL_LABEL = { 'ext:inject': '注入面', 'ext:status': '状态面', 'ext:notify': '提示面', 'ext:archive': '归档面' };
  const SIGN_SOURCES = ['message-id', 'content-digest', 'fallback-seq'];
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { claims: 0, released: 0, merged: 0, reenters: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason) { stat.refused++; noteFault(reason); return { ok: false, reason: reason }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }
  const BARRIER = { round: 0, inflight: {}, log: [], lastSig: '', lastSigVia: '' };
  function digest(s) {
    const t = String(s == null ? '' : s);
    let h = 5381;
    for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  /** 轮次签名：末条消息 id 优先；拿不到才回落内容指纹（且明说是回落）。 */
  function signature(msgs) {
    const list = Array.isArray(msgs) ? msgs : [];
    const last = list[list.length - 1];
    if (last && last.id != null && String(last.id) !== '') {
      return { ok: true, reason: 'ok', sig: 'id:' + String(last.id), via: SIGN_SOURCES[0], tail: list.length };
    }
    const body = last ? String(last.mes != null ? last.mes : (last.content != null ? last.content : last)) : '';
    if (body) return { ok: true, reason: 'ok', sig: 'dg:' + digest(body) + ':' + body.length, via: SIGN_SOURCES[1], tail: list.length };
    if (list.length) return { ok: true, reason: 'fallback', sig: 'sq:' + list.length, via: SIGN_SOURCES[2], tail: list.length };
    return { ok: false, reason: 'no-signature' };
  }
  /** 认领一次发送。同签名重入一律拒（防重复发）。并发压载取 max，不求和。 */
  function claim(opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (!cfg.barrier) return refuse('barrier-off');
    const o = opts || {};
    const ch = clean(o.channel, 30) || 'ext:inject';
    if (CHANNELS.indexOf(ch) < 0) return refuse('bad-channel');
    const sig = signature(o.messages != null ? o.messages : (o.tail ? [o.tail] : []));
    if (!sig.ok) return refuse('no-signature');
    const cur = Number(BARRIER.round || 0);
    const round = Number.isFinite(Number(o.round)) ? Number(o.round) : cur;
    if (round !== cur) { BARRIER.round = round; BARRIER.inflight = {}; }
    if (BARRIER.lastSig && BARRIER.lastSig === sig.sig && round === cur) {
      stat.reenters++;
      return { ok: false, reason: 'reenter', sig: sig.sig, via: sig.via, round: round };
    }
    const held = BARRIER.inflight[ch];
    if (held) {
      const want = Math.max(Number(held.weight) || 1, Number(o.weight) || 1);   // 取 max，不求和
      held.weight = want;
      held.merges = (held.merges || 1) + 1;
      stat.merged++;
      return { ok: true, reason: 'merged', channel: ch, channelLabel: CHANNEL_LABEL[ch], weight: want, merges: held.merges, sig: sig.sig, via: sig.via };
    }
    const open = Object.keys(BARRIER.inflight).length;
    if (open >= cfg.maxInflight) return refuse('inflight-full');
    const weight = Math.max(1, Math.floor(Number(o.weight) || 1));
    BARRIER.inflight[ch] = { channel: ch, weight: weight, merges: 1, at: clockNow('portal'), sig: sig.sig };
    BARRIER.lastSig = sig.sig;
    BARRIER.lastSigVia = sig.via;
    BARRIER.log = BARRIER.log.slice(-(cfg.maxLog - 1)).concat([{ channel: ch, sig: sig.sig, via: sig.via, at: clockNow('portal') }]);
    stat.claims++;
    return { ok: true, reason: 'ok', channel: ch, channelLabel: CHANNEL_LABEL[ch], weight: weight, round: round, sig: sig.sig, via: sig.via };
  }
  /** 释放一次发送。返回本轮合并后的总载荷（max 口径）。 */
  function release(channel, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const ch = clean(channel, 30);
    if (ch && CHANNELS.indexOf(ch) < 0) return refuse('bad-channel');
    const keys = ch ? [ch] : Object.keys(BARRIER.inflight);
    let load = 0, released = 0;
    keys.forEach(function (k) {
      const h = BARRIER.inflight[k];
      if (!h) return;
      load = Math.max(load, Number(h.weight) || 1);
      delete BARRIER.inflight[k];
      released++;
    });
    if (!released) return { ok: true, reason: 'nothing-held', load: 0, open: Object.keys(BARRIER.inflight).length };
    stat.released += released;
    return { ok: true, reason: 'ok', released: released, load: load, open: Object.keys(BARRIER.inflight).length,
      channel: ch || null, sig: BARRIER.lastSig, via: BARRIER.lastSigVia };
  }
  function reset(round) {
    const n = Object.keys(BARRIER.inflight).length;
    BARRIER.inflight = {};
    BARRIER.round = Number.isFinite(Number(round)) ? Number(round) : Number(BARRIER.round || 0) + 1;
    BARRIER.mergeLoad = 0;
    return { ok: true, reason: 'ok', dropped: n, round: BARRIER.round };
  }
  function status() {
    const cfg = settings();
    const open = Object.keys(BARRIER.inflight).length;
    return { ok: true, reason: 'ok', enabled: cfg.enabled, barrier: cfg.barrier, round: BARRIER.round,
      open: open, cap: cfg.maxInflight, refusedByCap: open >= cfg.maxInflight,
      held: Object.keys(BARRIER.inflight).map(function (k) { return { channel: k, label: CHANNEL_LABEL[k], weight: BARRIER.inflight[k].weight, merges: BARRIER.inflight[k].merges }; }),
      lastSig: BARRIER.lastSig, lastSigVia: BARRIER.lastSigVia, log: BARRIER.log.slice(-8) };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, barrier: cfg.barrier, maxInflight: cfg.maxInflight, maxLog: cfg.maxLog,
      channels: CHANNELS.slice(), channelLabel: CHANNEL_LABEL, signSources: SIGN_SOURCES.slice() };
  }
  function resetStat() {
    stat.claims = 0; stat.released = 0; stat.merged = 0; stat.reenters = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  WA.portal = {
    getSettings: settings, setSettings: saveSettings, view: view,
    signature: signature, digest: digest, claim: claim, release: release, reset: reset, status: status,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    CHANNELS: CHANNELS, CHANNEL_LABEL: CHANNEL_LABEL, SIGN_SOURCES: SIGN_SOURCES,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/portal.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'portal 已加载（2.230.0）');
})();
