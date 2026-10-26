/**
 * WorldAxis engines/one-shot-mod.js (v2.250.0) — OSM-1 一次性注入调制（药盒）
 *
 * ── 它治什么（先说清缺口）──────────────────────────────────────────
 *   本仓的调制面全是**长期设定**：`affect.loads` 是四载荷（疲惫/饥饿/疼痛/社交消耗），
 *   `temperament` 是性格底色，`masks` 是假面口径 —— 它们一次写入就一直在场。
 *   于是「**只这一轮**让他咳嗽得厉害」「这一场雨只下到本回合」没有出口，实际只有两种做法：
 *     · 写进长期设定 ⇒ 下一轮还咳，得记得自己撤；
 *     · 只在正文里提一句 ⇒ 下一步的判定完全不知道他咳着。
 *   两者都错在同一个地方：**把「一次」当成了「一直」或「没有」**。
 *
 * ── 机制（只管下一次，消费即焚）────────────────────────────────────
 *   `dose()` 投一粒：`{ id, kind, text, ttl, at }`。`kind` 是承重字段（决定它落在哪个面）：
 *     · `body`   生理（咳嗽/发热/宿醉 —— 判定时的体况）
 *     · `scene`  场景（雨/停电/门外有人 —— 只描述环境）
 *     · `stance` 态度（只这一轮的对人态度，不进 bonds）
 *   `buildBlock()` 把**待发**的几条摊给模型看；`consume()` 在正文落地后销账（消费即焚）。
 *   TTL 是**轮数**：没人来销就自己过期（`expired`），不会慢慢变成长期设定。
 *
 * ── 六条否定式边界 ────────────────────────────────────────────────
 *   ① 总开关默认关闭；关闭时 `dose()` 判 `disabled`，不排队。
 *   ② 队列有硬上界（`maxPending`），满了**如实拒收**（`queue-full`），不挤掉旧条目
 *      —— 挤掉旧条目会让用户刚投的那粒还在、上一粒悄悄没了，两粒都是他投的。
 *   ③ `consume()` **幂等**：同 id 第二次返回 `stillQueued:false`，不重复销账、不误报成功。
 *   ④ 空文本拒收（`empty-text`），不排一条「什么都没说」的空调制。
 *   ⑤ 过期按 `ttl` **轮数**判定，不按时钟 —— 挂机一小时不该比推进一轮更快失效。
 *   ⑥ 本模块**不写** affect / bonds / 任何长期表。落地后仍在正文里看见它，是调用方没销账，
 *      不是本模块偷偷写进了长期设定（`stat.leaked` 按读取路径记账）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  const LS_KEY = 'worldaxis_one_shot_mod_settings_v1';
  const DEF = {
    enabled: false,
    maxPending: 6,          // 队列硬上界（满了如实拒收）
    defaultTtl: 1,          // 默认存活轮数（1 = 只活到下一次生成）
    maxTtl: 5,
    maxBlockItems: 4        // 注入块最多摊几条（多的不摊，但仍在队里）
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'oneShotMod', bounds: { maxPending: [1, 24], defaultTtl: [1, 5], maxTtl: [1, 9], maxBlockItems: [1, 8] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const merged = Object.assign({}, DEF, raw || {});
    if (WA.settingsBus && WA.settingsBus.normalize) return WA.settingsBus.normalize(__REG, merged);
    return merged;
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (!WA.settingsBus || !WA.settingsBus.saveOrThrow) return { ok: false, reason: 'no-bus' };
    try { return { ok: true, settings: WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged)) }; }
    catch (e) { return { ok: false, reason: 'save-failed', detail: e && e.message }; }
  }

  const KINDS = ['body', 'scene', 'stance'];
  const KIND_CN = { body: '体况', scene: '场景', stance: '态度' };
  const stat = {
    dosed: 0, consumed: 0, expired: 0, rejected: 0,
    leaked: 0, lastReason: '', faults: {}
  };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v || '').trim().slice(0, max || 80); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function box(root) {
    const r = root || state();
    const b = r.oneShotMod;
    if (!b || typeof b !== 'object' || Array.isArray(b)) return { pending: [], round: 0 };
    if (!Array.isArray(b.pending)) b.pending = [];
    if (typeof b.round !== 'number') b.round = 0;
    return b;
  }
  function newId() {
    const s = (WA.rand && typeof WA.rand.id === 'function') ? WA.rand.id('osm_', 4, 'id') : ('osm_' + clockNow('oneShotMod:id').toString(36));
    return s;
  }

  /**
   * 投一粒一次性调制。
   * @param {{kind?:string, text:string, ttl?:number, by?:string}} spec
   * @returns {{ok:boolean, reason?:string, id?:string, queued?:number}}
   */
  function dose(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.rejected++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const sp = spec || {};
    const text = clean(sp.text, 120);
    if (!text) { stat.rejected++; noteFault('empty-text'); stat.lastReason = 'empty-text'; return { ok: false, reason: 'empty-text' }; }
    const kind = KINDS.indexOf(sp.kind) >= 0 ? sp.kind : 'scene';
    const ttlRaw = Number(sp.ttl);
    const ttl = isFinite(ttlRaw) && ttlRaw >= 1 ? Math.min(cfg.maxTtl, Math.floor(ttlRaw)) : cfg.defaultTtl;
    const out = { ok: false, reason: '' };
    try {
      WA.store.transact(function (draft) {
        const b = (draft.oneShotMod && typeof draft.oneShotMod === 'object' && !Array.isArray(draft.oneShotMod))
          ? draft.oneShotMod : { pending: [], round: 0 };
        if (!Array.isArray(b.pending)) b.pending = [];
        if (b.pending.length >= cfg.maxPending) { out.ok = false; out.reason = 'queue-full'; out.queued = b.pending.length; return; }
        const id = newId();
        b.pending.push({ id: id, kind: kind, text: text, ttl: ttl, born: clockNow('oneShotMod:dose'), by: clean(sp.by, 20) || 'ai' });
        draft.oneShotMod = b;
        out.ok = true; out.id = id; out.queued = b.pending.length;
      }, 'oneShotMod:dose');
    } catch (e) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    if (out.ok) { stat.dosed++; stat.lastReason = 'dosed'; }
    else { stat.rejected++; noteFault(out.reason); stat.lastReason = out.reason; }
    return out;
  }

  /** 推进一轮：所有条目的剩余轮数 -1，到 0 的作废（记 expired，不静默消失） */
  function advance() {
    const expired = [];
    try {
      WA.store.transact(function (draft) {
        const b = (draft.oneShotMod && typeof draft.oneShotMod === 'object' && !Array.isArray(draft.oneShotMod))
          ? draft.oneShotMod : { pending: [], round: 0 };
        b.round = (typeof b.round === 'number' ? b.round : 0) + 1;
        const keep = [];
        (Array.isArray(b.pending) ? b.pending : []).forEach(function (it) {
          const left = (typeof it.ttl === 'number' ? it.ttl : 1) - 1;
          if (left > 0) { it.ttl = left; keep.push(it); }
          else { expired.push({ id: it.id, kind: it.kind, text: it.text }); }
        });
        b.pending = keep;
        draft.oneShotMod = b;
        // per-call 站点：上限 = 设置项 maxPending（旋钮拧小了也要真截，不能只靠入队闸）。
        //   漏传即 bad-cap —— 「悄悄回落到一个随手挑的默认值」正是登记表与执行漂移的起点。
        if (WA.evict) WA.evict.array(b.pending, 'oneShotMod.pending', settings().maxPending);
      }, 'oneShotMod:advance');
    } catch (e) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable', expired: [] }; }
    stat.expired += expired.length;
    return { ok: true, expired: expired, left: box().pending.length };
  }

  /**
   * 销账（正文已落地，这一粒用掉了 ⇒ 消费即焚）。
   * 幂等：同 id 第二次返回 `stillQueued:false`，**不**再算一次消费。
   */
  function consume(id) {
    const want = clean(id, 40);
    if (!want) { noteFault('missing-id'); return { ok: false, reason: 'missing-id' }; }
    let found = false;
    let dropped = null;
    try {
      WA.store.transact(function (draft) {
        const b = (draft.oneShotMod && typeof draft.oneShotMod === 'object' && !Array.isArray(draft.oneShotMod))
          ? draft.oneShotMod : { pending: [], round: 0 };
        const list = Array.isArray(b.pending) ? b.pending : [];
        const keep = [];
        list.forEach(function (it) { if (!found && it && it.id === want) { found = true; dropped = it; } else keep.push(it); });
        b.pending = keep;
        draft.oneShotMod = b;
      }, 'oneShotMod:consume');
    } catch (e) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    if (found) { stat.consumed++; stat.lastReason = 'consumed'; return { ok: true, consumed: dropped, stillQueued: false }; }
    return { ok: true, consumed: null, stillQueued: false, reason: 'not-queued' };
  }

  /** 清空（人换话题/换场时一次带走），返回被清掉的条数 */
  function flush() {
    let n = 0;
    try {
      WA.store.transact(function (draft) {
        const b = (draft.oneShotMod && typeof draft.oneShotMod === 'object' && !Array.isArray(draft.oneShotMod))
          ? draft.oneShotMod : { pending: [], round: 0 };
        n = Array.isArray(b.pending) ? b.pending.length : 0;
        b.pending = [];
        draft.oneShotMod = b;
      }, 'oneShotMod:flush');
    } catch (e) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable', dropped: 0 }; }
    return { ok: true, dropped: n };
  }

  function read() {
    const b = box();
    const cfg = settings();
    return {
      enabled: cfg.enabled,
      maxPending: cfg.maxPending,
      pending: b.pending.map(function (it) {
        return { id: it.id, kind: it.kind, kindCn: KIND_CN[it.kind] || it.kind, text: it.text, ttl: it.ttl };
      })
    };
  }

  /** 注入块：把「只这一轮」的调制摊给模型看，并明写「用完就撤，别写成长期设定」 */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const r = read();
    if (!r.pending.length) return '';
    stat.leaked++;
    const lines = [];
    lines.push('[只这一轮的临时调制（' + r.pending.length + '/' + cfg.maxPending + '）]');
    r.pending.slice(0, cfg.maxBlockItems).forEach(function (it, i) {
      lines.push((i + 1) + '. [' + it.kindCn + '｜还剩 ' + it.ttl + ' 轮] ' + it.text);
    });
    if (r.pending.length > cfg.maxBlockItems) lines.push('（另有 ' + (r.pending.length - cfg.maxBlockItems) + ' 条未列）');
    lines.push('口径：这些**只在这一轮有效**——按它写，但别写进长期设定（下一轮它就不在了）；用掉之后不追述。');
    return lines.join('\n') + '\n';
  }

  WA.oneShotMod = {
    getSettings: settings,
    setSettings: function (patch) { const r = saveSettings(patch); return r.ok ? r.settings : r; },
    dose: dose, advance: advance, consume: consume, flush: flush, read: read, buildBlock: buildBlock,
    KINDS: KINDS.slice(), KIND_CN: Object.assign({}, KIND_CN),
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/one-shot-mod.js', { kind: 'engine', ver: '2.250.0' });
  if (WA.log) WA.log('info', 'engines/one-shot-mod 已加载（2.250.0）');
})();
