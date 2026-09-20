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
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
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
    try {
      if (WA.backstage && WA.backstage.getSettings) return WA.backstage.getSettings();
    } catch (e) {}
    // [v2.19.0] 兜底：backstage 未就位时直读**同一登记项**（不新造第二份真源）。
    //   此前本引擎只认 `WA.backstage.getSettings`，而后者本身就是 `settingsBus.read(__REG_B)`；
    //   故按 key 找到那条登记再读，取到的是同一份数据。
    try {
      const regs = WA.__settingsRegs || [];
      for (let i = 0; i < regs.length; i++) {
        const r = regs[i];
        if (r && r.key === 'worldaxis_backstage_settings_v1' && WA.settingsBus && WA.settingsBus.read) {
          return WA.settingsBus.read(r);
        }
      }
    } catch (e) {}
    return {};
  }
  function syncEnabled() { return settings().syncToChat === true; }
  function autoBackupEnabled() { return settings().autoBackup === true; }

  // 当前聊天唯一的存档slot：与 core/store 保持一致（worldaxis_state_<chatId>）
  function stateKey(id) { return `worldaxis_state_${id}`; }
  function revKey(id) { return `worldaxis_state_${id}_syncrev`; }
  // v2.11.0（结论不实 · 现场五）: 读失败此前返回 null ⇒ 与「本地没有这份存档」**完全同形**。
  //   hasAnyLocal() 直接以它判「有没有本地快照」，而「读不出来」会被报成「没有」——
  //   于是安装/覆盖决策建立在一个不成立的结论上。
  function noteRead(source, key, err) {
    try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail(source, key, err); } catch (e) {}
  }
  function getState(id) {
    try { return mainWin.localStorage.getItem(stateKey(id)); }
    catch (e) { noteRead('chatcacheState', stateKey(id), e); return null; }
  }
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

  // v2.7.0: 安装写盘计量——「安装成功」与「安装失败」此前不可区分。
  //   installPack 是全库 state 直写点里**唯一没有写后读回校验**的一处（其余 store 主路径均走
  //   writeVerified / 校验出口），而它恰恰是**跨设备恢复**的落点：对端写来的存档装不进去时
  //   没有任何信号，用户看到「恢复完成」而磁盘上仍是旧状态，下一次刷新进度整段回退。
  //   （该缺口在 v2.6.0 收口时已作为「已知残留缺口」登记备查，本版补齐。）
  const __installStat = { attempts: 0, ok: 0, failed: 0, lastAt: 0, lastReason: null, lastKey: null, lastBytes: 0 };
  function installPack(data, id) {
    data = data || {};
    _suspend = true;
    try {
      if (data.state != null) {
        const key = stateKey(id);
        // 与 store.writeVerified 同判据：立刻读回逐字符比对。
        //   刻意**不做**就地重试——重试交给下一次同步 tick（幂等），在 _suspend 窗口里硬重试
        //   会把「安装挂起」与「重试写盘」耦合出更难查的时序问题（本仓库已有一次同型教训）。
        try {
          mainWin.localStorage.setItem(key, data.state);
          let back = null, backErr = null;
          // v2.11.0: 安装后的回读校验——读失败不能与「内容不一致」共用结论（要查的是
          //   存储可读性，不是写入毒化）。方向仍保守（一律判失败），但归因必须诚实。
          try { back = mainWin.localStorage.getItem(key); } catch (eR) { back = null; backErr = eR; }
          if (backErr) { noteRead('chatcacheInstallBack', key, backErr); __installStat.readBackFailed = (__installStat.readBackFailed || 0) + 1; }
          __installStat.attempts++; __installStat.lastAt = clockWall();
          __installStat.lastKey = key; __installStat.lastBytes = data.state.length;
          if (back === data.state) {
            __installStat.ok++;
          } else {
            const why = (back === null || back === undefined) ? 'missing-after-write'
              : (typeof back === 'string' && back.length !== data.state.length) ? 'length-mismatch' : 'content-mismatch';
            __installStat.failed++; __installStat.lastReason = why;
            if (WA.log) WA.log('error', 'chatcache: 存档安装写盘未落住（' + why + '）——磁盘仍是旧状态，本次恢复未真正生效');
          }
        } catch (e) {
          __installStat.attempts++; __installStat.failed++;
          __installStat.lastAt = clockWall(); __installStat.lastKey = key;
          __installStat.lastReason = 'write:' + String((e && e.message) || e).slice(0, 80);
          if (WA.log) WA.log('error', 'chatcache: 存档安装写盘失败（配额/隐私模式）——本次恢复未生效', e);
        }
      }
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
    // v2.11.0（结论不实 · 现场六）: 本键是**跨实例同步修订号**（Lamport）。读失败此前
    //   回落 0 ⇒ 「本地修订号为 0」这个结论会把序号判成倒退，同步决策随之失真；
    //   与 v2.10.0 在 store.diskRev 修的同型缺陷（那里导致并发覆盖检测失效）。
    let raw = null;
    try { raw = mainWin.localStorage.getItem(revKey(id)); }
    catch (e) { noteRead('chatcacheRev', revKey(id), e); return 0; }
    const v = parseInt(raw || '0', 10);
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
    ns.live = { rev, updatedAt: clockNow('chatcache'), chatId: id, data };
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
          ns.live = { rev, updatedAt: clockNow('chatcache'), chatId: id, data };
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
              id: 'auto_' + clockNow('chatcache').toString(36), name: `自动备份 第${round}轮`,
              auto: true, at: clockNow('chatcache'), data: packChat(id)
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
    ns.snapshots.push({ id: 'snap_' + clockNow('chatcache').toString(36), name: String(name || '存档').slice(0, 30), auto: false, at: clockNow('chatcache'), data });
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
  let _inited = false;
  function init() {
    // [v2.19.0] 幂等守卫：本函数**包裹** WA.store.save。若被调用两次，第二层包裹会把
    //   第一层再包一层——每次 save 触发两次 scheduleTick，且原函数链无界累积。
    //   返回 true=本次挂载成功 / false=已挂载或前提不足，供启动侧归因。
    if (_inited) return false;
    try {
      if (!WA.store || typeof WA.store.save !== 'function') {
        WA.log('warn', 'chatcache挂载跳过：store.save 未就位');
        return false;
      }
      const origSave = WA.store.save.bind(WA.store);
      WA.store.save = function (state, chatIdArg) {
        const r = origSave(state, chatIdArg);
        if (!_suspend) scheduleTick();
        return r;
      };
      _inited = true;
      WA.log('info', '酒馆缓存同步已挂载（chat_metadata镜像）');
      return true;
    } catch (e) {
      WA.log('warn', 'chatcache挂载失败（非致命）', e);
      return false;
    }
  }

  WA.chatcache = {
    NS, init, scheduleTick, runTick, pushLiveNow,
    stripHeavy, packChat, installPack, pruneSnapshots, writeNamespace,
    addSnapshot, listSnapshots, restoreSnapshot, deleteSnapshot,
    readNamespace, ensureNamespace,
    /** v2.7.0: 存档安装写盘台账（只读）——「恢复成功」与「恢复了但没写进去」必须可分辨 */
    installStat() { return Object.assign({}, __installStat); }
  };
})();