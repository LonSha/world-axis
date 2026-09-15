/**
 * WorldAxis engines/chatcache.js (v0.8)
 * 酒馆缓存与存档：chat_metadata跨设备同步 + 防丢失快照
 * 缝合来源：DlSNlGHT World —— world-engine-chatcache.js
 *
 * 机制：
 *  - 把「本扩展、当前聊天」的存档镜像进 chat_metadata.worldaxis（随聊天文件跨设备同步）
 *  - live同步：Lamport修订号冲突解决（较新修订号胜出，不依赖跨设备时钟）
 *  - 内容去重：无变化不推送不bump rev（避免高频整份聊天文件保存）
 *  - 快照：手动命名存档 + 滚动自动备份（MAX_AUTO=3），可恢复
 *  - 安全护栏：本地无存档时绝不用空内容覆盖聊天里的live
 *  - 全局设置（含API Key）绝不进聊天文件，只镜像按聊天隔离的状态
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;

  const NS = 'worldaxis';
  const SCHEMA_VERSION = 1;
  const MAX_AUTO_BACKUPS = 3;
  const MAX_MANUAL_BACKUPS = 20;
  const TICK_DELAY = 1500;
  const SIZE_WARN_BYTES = 1024 * 1024;

  function getCtx() { try { return mainWin.SillyTavern.getContext(); } catch (e) { return null; } }
  function chatUsable(ctx) { return !!(ctx && ctx.chatId && ctx.chatId !== 'default'); }
  function chatId() { const ctx = getCtx(); return ctx && ctx.chatId ? ctx.chatId : 'default'; }

  function settings() {
    try { return WA.backstage && WA.backstage.getSettings ? WA.backstage.getSettings() : {}; }
    catch (e) { return {}; }
  }
  function syncEnabled() { return settings().syncToChat === true; }
  function autoBackupEnabled() { return settings().autoBackup === true; }

  // 当前聊天唯一的存档slot：与 core/store 保持一致（worldaxis_state_<chatId>）
  function stateKey(id) { return `worldaxis_state_${id}`; }
  function revKey(id) { return `worldaxis_state_${id}_syncrev`; }
  function getState(id) { return mainWin.localStorage.getItem(stateKey(id)); }
  function hasAnyLocal(id) { return getState(id) != null; }

  let _suspend = false;   // 安装存档期间挂起同步，防回弹
  let _tickTimer = null;
  let _lastAutoRound = null;

  // ── slot打包/安装 ──────────────────────────────────────
  // v0.1.11: 扩大临时字段剥离范围——注入诊断快照只服务于当前轮渲染排障，
  //         跨设备同步它们既浪费带宽又会在对端复活成脏数据
  const HEAVY_KEYS = ['lastInjection', 'slotErrors', 'nextTurnInjection'];
  function stripHeavy(rawJson) {
    try {
      const o = JSON.parse(rawJson);
      HEAVY_KEYS.forEach(function (k) { delete o[k]; });
      if (o.evolution) delete o.evolution._ledgerCheckpoint;  // 纯临时字段
      return JSON.stringify(o);
    } catch (e) { return rawJson; }
  }

  function packChat(id) {
    const data = {};
    const raw = getState(id);
    if (raw != null) data.state = stripHeavy(raw);
    return data;
  }

  function sameData(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (a[k] !== b[k]) return false;
    return true;
  }

  function nsSize(ns) {
    let n = 0;
    if (ns.live && ns.live.data) {
      for (const k in ns.live.data) n += (ns.live.data[k] || '').length;
      n += 64;
    }
    if (Array.isArray(ns.snapshots)) {
      for (const s of ns.snapshots) {
        const d = s && s.data;
        if (d) for (const k in d) n += (d[k] || '').length;
        n += 80;
      }
    }
    return n;
  }

  function installPack(data, id) {
    data = data || {};
    _suspend = true;
    try {
      if (data.state != null) mainWin.localStorage.setItem(stateKey(id), data.state);
      // 注意：WorldAxis单slot，state缺失时保留本地值（安全语义，等同原版checkpoint保护）
    } finally { _suspend = false; }
  }

  // ── chat_metadata命名空间 ──────────────────────────────
  function readNamespace() {
    const ctx = getCtx();
    const md = ctx && ctx.chatMetadata;
    const ns = md && md[NS];
    return (ns && typeof ns === 'object') ? ns : null;
  }

  function ensureNamespace() {
    const ns = readNamespace() || {};
    ns.v = SCHEMA_VERSION;
    if (!ns.live) ns.live = null;
    if (!Array.isArray(ns.snapshots)) ns.snapshots = [];
    return ns;
  }

  function writeNamespace(ns) {
    const ctx = getCtx();
    if (!ctx || !chatUsable(ctx)) return false;
    try {
      const size = nsSize(ns);
      if (size > SIZE_WARN_BYTES) {
        WA.log('warn', `酒馆缓存体积偏大（约${(size / 1024).toFixed(0)}KB），建议减少存档条数`);
      }
      if (typeof ctx.updateChatMetadata === 'function') ctx.updateChatMetadata({ [NS]: ns });
      else if (ctx.chatMetadata) ctx.chatMetadata[NS] = ns;
      else return false;
      if (typeof ctx.saveMetadataDebounced === 'function') ctx.saveMetadataDebounced();
      else if (typeof ctx.saveMetadata === 'function') ctx.saveMetadata();
      else if (typeof ctx.saveChat === 'function') ctx.saveChat();
      return true;
    } catch (e) {
      WA.log('warn', '写chat_metadata失败', e);
      return false;
    }
  }

  // ── Lamport修订号 ──────────────────────────────────────
  function localRev(id) {
    const v = parseInt(mainWin.localStorage.getItem(revKey(id)) || '0', 10);
    return Number.isFinite(v) ? v : 0;
  }
  function setLocalRev(id, rev) {
    _suspend = true;
    try { mainWin.localStorage.setItem(revKey(id), String(rev)); } finally { _suspend = false; }
  }

  function pushLiveNow(nsArg, force) {
    const ctx = getCtx();
    if (!ctx || !chatUsable(ctx)) return nsArg ? null : false;
    const id = ctx.chatId;
    const data = packChat(id);
    // 安全护栏：本地无存档时绝不用空内容覆盖聊天live
    if (Object.keys(data).length === 0) return nsArg ? null : false;
    const ns = nsArg || ensureNamespace();
    // 内容去重
    if (!force && ns.live && ns.live.chatId === id && sameData(ns.live.data, data)) {
      const curRev = (ns.live && ns.live.rev) || localRev(id);
      return nsArg ? curRev : true;
    }
    const rev = Math.max(localRev(id), (ns.live && ns.live.rev) || 0) + 1;
    ns.live = { rev, updatedAt: Date.now(), chatId: id, data };
    if (nsArg) return rev;
    if (writeNamespace(ns)) { setLocalRev(id, rev); return true; }
    return false;
  }

  // ── 同步tick（去抖合并写入）────────────────────────────
  function scheduleTick() {
    if (!syncEnabled() && !autoBackupEnabled()) return;
    if (_tickTimer) clearTimeout(_tickTimer);
    _tickTimer = setTimeout(() => { _tickTimer = null; runTick(); }, TICK_DELAY);
  }

  function runTick() {
    const ctx = getCtx();
    if (!ctx || !chatUsable(ctx)) return;
    if (_suspend) return;
    const id = ctx.chatId;
    if (!syncEnabled() && !autoBackupEnabled()) return;
    const ns = ensureNamespace();
    let changed = false;

    // live同步：本地比聊天新则推送
    if (syncEnabled()) {
      const data = packChat(id);
      if (Object.keys(data).length) {
        const same = ns.live && ns.live.chatId === id && sameData(ns.live.data, data);
        if (!same && (!ns.live || (ns.live.rev || 0) <= localRev(id))) {
          const rev = Math.max(localRev(id), (ns.live && ns.live.rev) || 0) + 1;
          ns.live = { rev, updatedAt: Date.now(), chatId: id, data };
          setLocalRev(id, rev);
          changed = true;
        } else if (ns.live && ns.live.chatId === id && (ns.live.rev || 0) > localRev(id)) {
          // 聊天较新：安装回本地
          installPack(ns.live.data, id);
        }
      }
    }

    // 自动备份：轮次推进时滚动备份
    if (autoBackupEnabled()) {
      try {
        const round = (JSON.parse(getState(id) || '{}').meta || {}).round || 0;
        if (_lastAutoRound === null) _lastAutoRound = round;
        else if (round > _lastAutoRound) {
          _lastAutoRound = round;
          const autos = (ns.snapshots || []).filter(s => s.auto);
          const lastAuto = autos[autos.length - 1];
          if (!lastAuto || !sameData(lastAuto.data, packChat(id))) {
            ns.snapshots.push({
              id: 'auto_' + Date.now().toString(36), name: `自动备份 第${round}轮`,
              auto: true, at: Date.now(), data: packChat(id)
            });
            pruneSnapshots(ns);
            changed = true;
          }
        }
      } catch (e) {}
    }

    if (changed) writeNamespace(ns);
  }

  function pruneSnapshots(ns) {
    if (!Array.isArray(ns.snapshots)) return;
    // 自动备份滚动窗口
    const autos = ns.snapshots.filter(s => s.auto);
    if (autos.length > MAX_AUTO_BACKUPS) {
      const cut = autos.slice(0, autos.length - MAX_AUTO_BACKUPS).map(s => s.id);
      ns.snapshots = ns.snapshots.filter(s => !cut.includes(s.id));
    }
    // 手动存档上限
    const manuals = ns.snapshots.filter(s => !s.auto);
    if (manuals.length > MAX_MANUAL_BACKUPS) {
      const cut = manuals.slice(0, manuals.length - MAX_MANUAL_BACKUPS).map(s => s.id);
      ns.snapshots = ns.snapshots.filter(s => !cut.includes(s.id));
    }
  }

  // ── 公开API：手动存档 ──────────────────────────────────
  function addSnapshot(name) {
    const ctx = getCtx();
    if (!ctx || !chatUsable(ctx)) return { ok: false, reason: 'no-chat' };
    const id = ctx.chatId;
    const data = packChat(id);
    if (!Object.keys(data).length) return { ok: false, reason: 'empty' };
    const ns = ensureNamespace();
    ns.snapshots.push({ id: 'snap_' + Date.now().toString(36), name: String(name || '存档').slice(0, 30), auto: false, at: Date.now(), data });
    pruneSnapshots(ns);
    return { ok: writeNamespace(ns) };
  }

  function listSnapshots() {
    const ns = readNamespace();
    return (ns && ns.snapshots) ? ns.snapshots.map(s => ({ id: s.id, name: s.name, auto: !!s.auto, at: s.at })) : [];
  }

  function restoreSnapshot(id) {
    const ns = readNamespace();
    if (!ns || !Array.isArray(ns.snapshots)) return { ok: false, reason: 'not-found' };
    const snap = ns.snapshots.find(s => s.id === id);
    if (!snap) return { ok: false, reason: 'not-found' };
    const cid = chatId();
    installPack(snap.data, cid);
    // 恢复后把live指向恢复后状态
    pushLiveNow(null, true);
    return { ok: true };
  }

  function deleteSnapshot(id) {
    const ns = readNamespace();
    if (!ns || !Array.isArray(ns.snapshots)) return false;
    const before = ns.snapshots.length;
    ns.snapshots = ns.snapshots.filter(s => s.id !== id);
    if (ns.snapshots.length === before) return false;
    return writeNamespace(ns);
  }

  // ── 初始化：监听store保存后调度同步 ────────────────────
  function init() {
    try {
      const origSave = WA.store.save.bind(WA.store);
      WA.store.save = function (state, chatIdArg) {
        const r = origSave(state, chatIdArg);
        if (!_suspend) scheduleTick();
        return r;
      };
      WA.log('info', '酒馆缓存同步已挂载（chat_metadata镜像）');
    } catch (e) {
      WA.log('warn', 'chatcache挂载失败（非致命）', e);
    }
  }

  WA.chatcache = {
    NS, init, scheduleTick, runTick, pushLiveNow,
    stripHeavy, packChat, installPack, pruneSnapshots, writeNamespace,
    addSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot,
    readNamespace, ensureNamespace
  };
})();