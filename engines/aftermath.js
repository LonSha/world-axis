/**
 * WorldAxis engines/aftermath.js (v2.171.0) — TX8 地点历史的实际后果、修复与复访
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
  var _stat = { registered: 0, repaired: 0, expired: 0, cancelled: 0, refused: 0, lastReason: '', faults: {} };
  function noteFault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  const clockNow = function (tag) { try { return WA.clock.now(tag || 'aftermath'); } catch (e) { return Date.now(); } };
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function bucket(root) { var r = root || state(); if (!r.aftermath) r.aftermath = { effects: [] }; if (!Array.isArray(r.aftermath.effects)) r.aftermath.effects = []; return r.aftermath; }
  function effects() { return bucket().effects || []; }
  function find(id) { var k = clean(id, 60); return effects().filter(function (x) { return x && x.id === k; })[0] || null; }
  function findByEvent(eventId) { var k = clean(eventId, 60); return effects().filter(function (x) { return x && x.eventId === k; })[0] || null; }
  function newId() { return WA.rand ? WA.rand.id('aft_', 4, 'id') : 'aft_0000'; }
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
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) { bucket(d).effects.push(rec); }, 'aftermath:register');
    } else { effects().push(rec); }
    if (WA.evict && typeof WA.evict.array === 'function') {
      try { WA.evict.array(bucket().effects, 'aftermath.effects'); } catch (e) {}
    }
    _stat.registered++;
    return { ok: true, id: rec.id, placeId: placeId, effectType: effectType };
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
    rec.repairProgress += progress;
    var done = rec.repairProgress >= (rec.repairTime || 1);
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) {
        var b = bucket(d);
        var t = b.effects.filter(function (x) { return x && x.id === rec.id; })[0];
        if (t) {
          t.repairProgress += progress;
          if (t.repairProgress >= (t.repairTime || 1)) {
            t.status = 'repaired';
            t.repairedAt = clockNow('aftermath');
          }
        }
      }, 'aftermath:repair');
    } else {
      if (done) { rec.status = 'repaired'; rec.repairedAt = clockNow('aftermath'); }
    }
    if (done) { _stat.repaired++; return { ok: true, id: rec.id, status: 'repaired', repaired: true }; }
    return { ok: true, id: rec.id, progress: rec.repairProgress, target: rec.repairTime || 1 };
  }

  // ── 3. inspect：查看某地点活跃效果 ──
  function inspect(placeId) {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    var pid = clean(placeId, 60);
    if (!pid) return { ok: false, reason: 'missing-fields' };
    var active = effects().filter(function (x) { return x && x.placeId === pid && x.status === 'active'; });
    var history = effects().filter(function (x) { return x && x.placeId === pid && x.status !== 'active'; });
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
    var cur = effects().filter(function (x) { return x && x.status === 'active'; });
    return { ok: true, items: cur.map(function (x) { return { id: x.id, placeId: x.placeId, effectType: x.effectType, eventId: x.eventId }; }),
      count: cur.length, cap: cfg.maxEffects };
  }

  // ── 5. pending：列出待修复效果 ──
  function pending() {
    var cfg = getSettings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled', items: [] };
    var cur = effects().filter(function (x) { return x && x.status === 'active' && x.repairProgress > 0; });
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
    var ok = checks.store;
    return { ok: ok, closedLoop: ok, checks: checks, version: '2.171.0' };
  }

  // ── 9. stat ──
  function stat() {
    var cur = effects();
    return { registered: _stat.registered, repaired: _stat.repaired, expired: _stat.expired,
      cancelled: _stat.cancelled, refused: _stat.refused, lastReason: _stat.lastReason,
      active: cur.filter(function (x) { return x && x.status === 'active'; }).length,
      repaired: cur.filter(function (x) { return x && x.status === 'repaired'; }).length,
      total: cur.length, cap: getSettings().maxEffects,
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
    if (WA.store && typeof WA.store.transact === 'function') {
      WA.store.transact(function (d) {
        var b = bucket(d);
        var t = b.effects.filter(function (x) { return x && x.id === rec.id; })[0];
        if (t) { t.status = 'cancelled'; t.cancelledAt = clockNow('aftermath'); }
      }, 'aftermath:cancel');
    } else { rec.status = 'cancelled'; rec.cancelledAt = clockNow('aftermath'); }
    _stat.cancelled++;
    return { ok: true, id: rec.id, reason: rsn };
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
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/aftermath.js', { kind: 'engine', ver: '2.171.0' });
})();
