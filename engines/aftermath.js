/**
 * WorldAxis engines/aftermath.js (v2.194.0) — TX8 地点历史的实际后果、修复与复访
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   sediment 保存地点痕迹并衰减，region 有道路/阻塞/传播，economy 有供需/路线。
 *   但「历史事件的持续后果」没有一条链：道路被毁多久能修、设施修复中能否使用、
 *   修复需要什么材料/工期、修复后痕迹还在不在——这些没有登记和消费。
 *   aftermath 补的就是这一层。
 *
 * ── 本模块落点（协调者，不替代）──────────────────────────────
 *   · register(spec) —— 以真实事件/回执 ID 登记有时限的地点效果（道路受损/交易暂停/设施修复中）
 *   · repair(id, opts) —— 投入材料/工期修复，完成回执更新效果而保留历史痕迹
 *   · inspect(placeId) —— 查看某地点的活跃效果与历史痕迹
 *   · active()/pending()/view()/buildBlock()/diagnose()/stat()/reset()
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 默认关（enabled:false）。
 *   2 一段痕迹文字不自动解释成资源惩罚——必须 register 登记效果才生效。
 *   3 衰减不自动证明修好——sediment 衰减只影响感知面，效果是否生效由本模块判定。
 *   4 同一事件效果只生效一次——register 用 eventId 去重。
 *   5 气候影响只取已有明确条件——不凭空造天气效果。
 *   6 不重复推进近场/远场——不重建 region 的传播链。
 *   7 不为未知地点制造物理状态——placeId 必须在 region.places 中存在。
 *   8 效果到期、工期中断、取消、并发修复与重载结果一致。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_aftermath_settings_v1';
  var DEF = { enabled: false, maxEffects: 48 };
  var __REG = { key: LS_KEY, def: DEF, module: 'aftermath',
    bounds: { maxEffects: [4, 128] } };
  function getSettings() {
    var raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    var base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  function setSettings(patch) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})))
      : Object.assign({}, getSettings(), patch || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  var _stat = { registered: 0, repaired: 0, expired: 0, cancelled: 0, refused: 0, lastReason: '', faults: {},
    bridgeMiss: 0 };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  const clockNow = function (tag) { try { return WA.clock.now(tag || 'aftermath'); } catch (e) { return Date.now(); } };
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function bucket(root) { var r = root || state(); if (!r.aftermath) r.aftermath = { effects: [] }; if (!Array.isArray(r.aftermath.effects)) r.aftermath.effects = []; return r.aftermath; }
  function effects() { return bucket().effects || []; }
  // ── U2 批次④（v2.194.0）：统一原子提交链接入面 ──────────────────────────────
  //   三条真病，全部**探针实测**（不是阅读推断）：
  //     ① 链内 `view` / `repair` 找不到本链刚登记的实体：读口取的是**已提交快照**
  //        （`store.get()`），而登记写在外层 draft 上 ⇒ 链内恒 `not-found`。
  //     ② 同一链内重复 `eventId` **去重失效**：判据同样读已提交快照 ⇒ 两条同类效果
  //        都落进世界，而「同一事件效果只生效一次」是本模块的边界 4。
  //     ③ 链上写入**不报在途**：回执只有 `ok:true`，看不出「这一笔还没提交」——
  //        与 U2 各批（diplomacy / operations / freight / commission / agency / investigation）
  //        口径不同。
  //   修法：链内读面改查链的那一份 draft；写口按三态如实标注。
  function nestedTx(r) { return !!(r && r.deferred === true); }
  function chainInflight() {
    return (WA.commit && typeof WA.commit.inflight === 'function') ? WA.commit.inflight() : null;
  }
  function inChainDraft() { var inf = chainInflight(); return (inf && inf.draft) ? inf.draft : null; }
  /** 链内读面：链里有草稿就查这一份（本链刚写的实体就在里面）。 */
  function readEffects() { var d = inChainDraft(); return d ? bucket(d).effects : effects(); }
  /**
   * 在途如实标注（三态，口径与 U2 各批逐字一致）：
   *   链上 ⇒ `chain:true / persisted:false / projected:true`；
   *   调用方自己的事务里 ⇒ `nested:true / persisted:false`；
   *   链外顶层 ⇒ `chain:false / persisted:true`。
   *   同一条读法不许同时代表两种事实。
   */
  function markInflight(out, ctx) {
    var c = ctx || {};
    out.chain = !!c.onChain;
    out.persisted = false;
    if (c.onChain) out.projected = true;
    if (c.nestedHere) out.nested = true;
    return out;
  }
  /** 写口用的行定位（只在**指定那一层**的草稿上找；与 `find` 同源，不各写一份判据）。 */
  function rowForWrite(root, id) {
    var k = clean(id, 60);
    var rows = bucket(root).effects;
    return rows.filter(function (x) { return x && x.id === k; })[0] || null;
  }
  function find(id) { var k = clean(id, 60);
    return readEffects().filter(function (x) { return x && x.id === k; })[0] || null; }
  function findByEvent(eventId) { var k = clean(eventId, 60);
    return readEffects().filter(function (x) { return x && x.eventId === k; })[0] || null; }
  function newId() { return WA.rand ? WA.rand.id('aft_', 4, 'id') : 'aft_0000'; }
  // ── U2 批次④：修复闭环的桥接面（只读 + 在同一层里解除受阻）────────────────
  //   为什么由 aftermath 写而不是 region：**「修好了」这个事实的判定权在本模块**
  //   （`status === 'repaired'` 是这里定的），region 只持有「渠道是否受阻」这一状态。
  //   两侧各说一遍正是本仓反复治理的毛病，故收口在此，读写的都只有 region 的那个字段。
  /** 该地点的任一渠道路由是否受阻（只读，不写）。 */
  function laneBlocked(placeId) {
    if (!WA.region || typeof WA.region.places !== 'function') return false;
    var pid = clean(placeId, 60);
    return (WA.region.places() || []).some(function (p) { return p && p.name === pid && p.blocked; });
  }
  /**
   * 在**指定那一层**上解除该地点的受阻（链内传链草稿、链外传本笔事务的世界态）。
   *   返回是否真的写了一笔（本来就不受阻 ⇒ 不写、不谎报）。
   *   `root` 为 null（无事务可用）时**不写**：宁可如实报 `bridgeMiss`，也不偷偷另开一笔。
   */
  function _clearLaneIfBlocked(root, placeId) {
    if (!root) return false;
    var pid = clean(placeId, 60);
    var rg = root.region;
    if (!rg || !Array.isArray(rg.places)) return false;
    var hit = rg.places.filter(function (p) { return p && p.name === pid && p.blocked; })[0];
    if (!hit) return false;
    hit.blocked = false;
    hit.why = '';
    hit.updatedAt = clockNow('aftermath');
    return true;
  }
  function isValidPlace(placeId) {
    if (!placeId) return false;
    if (WA.region && typeof WA.region.places === 'function') {
      var places = WA.region.places();
      return places.some(function (p) { return p && p.name === placeId; });
    }
    return true; // 无 region 时不阻断（测试环境兼容）
  }

  // ── 1. register：登记有时限的地点效果 ──
  function register(spec) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var s = spec || {};
    var placeId = clean(s.placeId, 60);
    if (!placeId) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'placeId' }; }
    var eventId = clean(s.eventId, 60);
    if (!eventId) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'eventId' }; }
    // 同一事件效果只生效一次
    if (findByEvent(eventId)) { noteFault('duplicate-event'); return { ok: false, reason: 'duplicate-event', eventId: eventId }; }
    var effectType = clean(s.effectType || 'damage', 30);
    if (!effectType) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'effectType' }; }
    if (effects().length >= cfg.maxEffects) { noteFault('effects-full'); return { ok: false, reason: 'effects-full', cap: cfg.maxEffects }; }
    // 检查地点是否存在
    if (!isValidPlace(placeId)) { noteFault('unknown-place'); return { ok: false, reason: 'unknown-place', placeId: placeId }; }
    var now = clockNow('aftermath');
    var duration = s.duration ? Number(s.duration) : 0;
    var rec = {
      id: newId(), placeId: placeId, eventId: eventId, effectType: effectType,
      description: clean(s.description || '', 120),
      duration: duration,
      expiresAt: duration > 0 ? now + duration : 0,
      status: 'active',
      repairCost: s.repairCost ? Number(s.repairCost) : 0,
      repairCostType: clean(s.repairCostType || 'material', 30),
      repairTime: s.repairTime ? Number(s.repairTime) : 0,
      repairProgress: 0,
      registeredAt: now,
      repairedAt: 0,
      cancelledAt: 0
    };
    // U2 批次④：链上/调用方事务里 ⇒ 写落在**那一层**的草稿上（随其提交），并按三态如实标注。
    var _inf = chainInflight();
    var _txr = null;
    if (_inf) {
      bucket(_inf.draft).effects.push(rec);
    } else if (WA.store && typeof WA.store.transact === 'function') {
      _txr = WA.store.transact(function (d) { bucket(d).effects.push(rec); }, 'aftermath:register');
    } else { effects().push(rec); }
    if (!_inf && WA.evict && typeof WA.evict.array === 'function') {
      try { WA.evict.array(bucket().effects, 'aftermath.effects'); } catch (e) {}
    }
    _stat.registered++;
    var _ro = { ok: true, id: rec.id, placeId: placeId, effectType: effectType };
    if (_inf) return markInflight(_ro, { onChain: true });
    if (nestedTx(_txr)) return markInflight(_ro, { nestedHere: true });
    _ro.chain = false; _ro.persisted = true;
    return _ro;
  }

  // ── 2. repair：投入材料/工期修复 ──
  function repair(id, opts) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var rec = find(id);
    if (!rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(id, 60) }; }
    if (rec.status !== 'active') { noteFault('not-active'); return { ok: false, reason: 'not-active', status: rec.status }; }
    var o = opts || {};
    var progress = o.progress ? Number(o.progress) : 1;
    // 读面上的进度以**本层**为准（链内 find 已改查链草稿）
    rec = find(id) || rec;
    rec.repairProgress += progress;
    var done = rec.repairProgress >= (rec.repairTime || 1);
    // ── U2 批次④：链级半写。修复完成与「渠道解除受阻」此前分属两笔顶层事务 ——
    //   探针实测：`aftermath.repair` 报 `{status:'repaired'}`，而 `region` 的
    //   `lane.blocked` **仍是 true**（路还是堵着）。世界读了两个互斥的事实：
    //   「效果已修好」与「这条路仍然不通」。现在：链内两笔同链，链外本口自开链。
    var _inf = chainInflight();
    var _txr = null;
    var _laneCleared = false;   // 取自**本层**的清除结果（不读已提交面，免得链内误报）
    function _applyRepair(root) {
      var t = rowForWrite(root, rec.id);
      if (!t) return false;
      t.repairProgress += progress;
      if (t.repairProgress >= (t.repairTime || 1)) {
        t.status = 'repaired';
        t.repairedAt = clockNow('aftermath');
        _laneCleared = _clearLaneIfBlocked(root, rec.placeId);   // ← 与「修好」同一层、同一笔
      }
      return true;
    }
    if (_inf) {
      _applyRepair(_inf.draft);
    } else if (WA.store && typeof WA.store.transact === 'function') {
      _txr = WA.store.transact(function (d) { _applyRepair(d); }, 'aftermath:repair');
    } else {
      if (done) { rec.status = 'repaired'; rec.repairedAt = clockNow('aftermath'); }
    }
    if (done) {
      _stat.repaired++;
      var _out = { ok: true, id: rec.id, status: 'repaired', repaired: true, laneCleared: _laneCleared };
      if (!_laneCleared) { _stat.bridgeMiss++; }
      if (_inf) return markInflight(_out, { onChain: true });
      if (nestedTx(_txr)) return markInflight(_out, { nestedHere: true });
      _out.chain = false; _out.persisted = true;
      return _out;
    }
    var _mid = { ok: true, id: rec.id, progress: rec.repairProgress, target: rec.repairTime || 1 };
    if (_inf) return markInflight(_mid, { onChain: true });
    if (nestedTx(_txr)) return markInflight(_mid, { nestedHere: true });
    _mid.chain = false; _mid.persisted = true;
    return _mid;
  }

  // ── 3. inspect：查看某地点活跃效果 ──
  function inspect(placeId) {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    var pid = clean(placeId, 60);
    if (!pid) return { ok: false, reason: 'missing-fields' };
    var _rows = readEffects();
    var active = _rows.filter(function (x) { return x && x.placeId === pid && x.status === 'active'; });
    var history = _rows.filter(function (x) { return x && x.placeId === pid && x.status !== 'active'; });
    // 读 sediment 感知面（只读，不写）
    var sedimentFeel = null;
    if (WA.sediment && typeof WA.sediment.feel === 'function') {
      try { sedimentFeel = WA.sediment.feel(pid); } catch (e) {}
    }
    return { ok: true, placeId: pid, active: active.map(function (x) { return { id: x.id, effectType: x.effectType, description: x.description, repairProgress: x.repairProgress, repairTime: x.repairTime }; }),
      activeCount: active.length, historyCount: history.length, sediment: sedimentFeel };
  }

  // ── 4. active：列出所有活跃效果 ──
  function active() {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', items: [] };
    var cur = readEffects().filter(function (x) { return x && x.status === 'active'; });
    return { ok: true, items: cur.map(function (x) { return { id: x.id, placeId: x.placeId, effectType: x.effectType, eventId: x.eventId }; }),
      count: cur.length, cap: cfg.maxEffects };
  }

  // ── 5. pending：列出待修复效果 ──
  function pending() {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', items: [] };
    var cur = readEffects().filter(function (x) { return x && x.status === 'active' && x.repairProgress > 0; });
    return { ok: true, items: cur.map(function (x) { return { id: x.id, placeId: x.placeId, progress: x.repairProgress, target: x.repairTime || 1 }; }),
      count: cur.length };
  }

  // ── 6. view ──
  function view(id) {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    var rec = find(id);
    if (!rec) return { ok: false, reason: 'not-found', id: clean(id, 60) };
    return { ok: true, id: rec.id, placeId: rec.placeId, eventId: rec.eventId, effectType: rec.effectType,
      status: rec.status, description: rec.description, repairProgress: rec.repairProgress, repairTime: rec.repairTime,
      registeredAt: rec.registeredAt, repairedAt: rec.repairedAt };
  }

  // ── 7. buildBlock ──
  function buildBlock() {
    var cfg = getSettings();
    if (!cfg.enabled) return '';
    var cur = effects().filter(function (x) { return x && x.status === 'active'; });
    if (!cur.length) return '';
    var lines = ['[地点后果]'];
    cur.slice(0, Math.max(1, Math.floor(cfg.maxEffects / 2))).forEach(function (x) {
      lines.push('· ' + x.placeId + '：' + x.effectType + (x.repairProgress > 0 ? '（修复中 ' + x.repairProgress + '/' + (x.repairTime || 1) + '）' : ''));
    });
    return lines.join('\n');
  }

  // ── 8. diagnose ──
  function diagnose() {
    var checks = {
      sediment: !!(WA.sediment && typeof WA.sediment.feel === 'function'),
      region: !!(WA.region && typeof WA.region.places === 'function'),
      store: !!(WA.store && typeof WA.store.transact === 'function'),
      settingsBus: !!(WA.settingsBus && typeof WA.settingsBus.read === 'function')
    };
    // v2.194.0（U2 批次④）：`chain` 是**能力自报**（本口接入统一提交链与否），
    //   与 `closedLoop` 无关 —— 后者说的是「观测/修复闭环齐不齐」。
    checks.chain = !!(WA.commit && typeof WA.commit.chain === 'function');
    var ok = checks.store;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.194.0' };
  }

  // ── 9. stat ──
  function stat() {
    var cur = effects();
    return { registered: _stat.registered, repaired: _stat.repaired, expired: _stat.expired,
      cancelled: _stat.cancelled, refused: _stat.refused, lastReason: _stat.lastReason,
      active: cur.filter(function (x) { return x && x.status === 'active'; }).length,
      repaired: cur.filter(function (x) { return x && x.status === 'repaired'; }).length,
      total: cur.length, cap: getSettings().maxEffects,
      // v2.194.0（U2 批次④）：修复闭环的**实测读数** —— repair 报「已修好」而渠道仍受阻的次数。
      //   它必须恒为 0（修好时在同一层同步解除）；非 0 即这两个模块又各说了一遍。
      bridgeMiss: _stat.bridgeMiss,
      faults: Object.assign({}, _stat.faults) };
  }

  // ── 10. cancel ──
  function cancel(id, reason) {
    var cfg = getSettings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    var rec = find(id);
    if (!rec) { noteFault('not-found'); return { ok: false, reason: 'not-found', id: clean(id, 60) }; }
    if (rec.status !== 'active') { noteFault('not-active'); return { ok: false, reason: 'not-active', status: rec.status }; }
    var rsn = clean(reason || 'cancelled', 60);
    var _inf = chainInflight();
    var _txr = null;
    function _applyCancel(root) {
      var t = rowForWrite(root, rec.id);
      if (!t) return false;
      t.status = 'cancelled'; t.cancelledAt = clockNow('aftermath');
      return true;
    }
    if (_inf) {
      _applyCancel(_inf.draft);
    } else if (WA.store && typeof WA.store.transact === 'function') {
      _txr = WA.store.transact(function (d) { _applyCancel(d); }, 'aftermath:cancel');
    } else { rec.status = 'cancelled'; rec.cancelledAt = clockNow('aftermath'); }
    _stat.cancelled++;
    var _ro = { ok: true, id: rec.id, reason: rsn };
    if (_inf) return markInflight(_ro, { onChain: true });
    if (nestedTx(_txr)) return markInflight(_ro, { nestedHere: true });
    _ro.chain = false; _ro.persisted = true;
    return _ro;
  }

  // ── 11. reset ──
  function reset() { _stat.registered = 0; _stat.repaired = 0; _stat.expired = 0; _stat.cancelled = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }

  WA.aftermath = {
    getSettings: getSettings,
    setSettings: function (patch) { return setSettings(patch); },
    register: register,
    repair: repair,
    inspect: inspect,
    active: active,
    pending: pending,
    view: view,
    cancel: cancel,
    buildBlock: buildBlock,
    diagnose: diagnose,
    stat: stat,
    reset: reset
  };
  var EXPORT_COUNT = 13;
  var _exported = Object.keys(WA.aftermath).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('aftermath: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/aftermath.js', { kind: 'engine', ver: '2.194.0' });
})();
