/**
 * WorldAxis engines/tape-store.js (v2.148.0) — 磁带卷持久化仓库（RP2）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   v2.98.0 P2 的 tapeVol / verifyTapeWith 只做「手动导出/核对」——卷由调用方拿走，
 *   本侧不替调用方写盘。后果：**跨会话重放不可用**——会话结束磁带即蒸发。
 *   一句话：**磁带只有导出口没有仓库，证据活不过一次会话。**
 *
 * ── 本模块落点 ────────────────────────────────────────────────
 *   不改 rand.js 的磁带语义（录制/收卷/回放仍是它的职责），本模块只做仓库四口：
 *     · save(vol)  — 把一卷磁带存入仓库（环形 20 卷，超限自动回收最旧）；
 *     · list()     — 列仓库里的卷（只读，id/seed/entries/savedAt）；
 *     · load(id)   — 从仓库取一卷（返回 rand 可回放的磁带对象）；
 *     · drop(id)   — 显式删一卷。
 *   仓库键 worldaxis_tape_store_v1 容量登记入 __BOUNDED_CAPS（kind:'object'）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 不自动收录（保存必须显式调用——「哪一卷值得留」是人的判断，不是机制的判断）。
 *   2 不做迁移器（formatVersion 不匹配即拒收 tape-version-mismatch，不做兼容转换）。
 *   3 不进回放路径（回放仍走 rand.replay —— 本模块只是仓库，不是回放器）。
 *   4 存储上限硬性：20 卷超限回收最旧（不堆行、不静默塞满 localStorage）。
 */
(function () {
  'use strict';
  // v2.148.0：别名形态**必须**是本仓规范式（`HOST.WorldAxis = HOST.WorldAxis || {}`）。
  //   初版写成 `if (!window.WorldAxis) window.WorldAxis = {}; const WA = window.WorldAxis;`
  //   —— 运行期完全等价，但 module-cycle-gate 的别名扫描器只认规范式那一种形态，
  //   于是这个文件在静态依赖图上**没有提供方**：它导出的 tapeStore 被 tool-diag / panel
  //   真读，图上却报「读了无人提供的 ns」。这正是该门禁存在的意义（形态不统一 =
  //   可见性缺失），故改回规范式而不是去放宽门禁。
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.148.0: 不设幂等守卫（对齐 causal.js / faction-graph.js 新范式）。
  //   测试侧 fresh() 在同一 global 上重评估全部 LOAD 模块，守卫会让第二次装载静默短路——
  //   srcOverride 破坏副本装不上、跨用例模块状态泄漏。产品侧由 index.js 顶层
  //   __WORLD_AXIS_LOADED__ 防重入，本守卫冗余。

  const LS_KEY = 'worldaxis_tape_store_v1';
  const TAPE_FORMAT = 'worldaxis.rand.tape';
  const TAPE_FORMAT_VERSION = 1;
  const CAP_VOLS = 20;

  const __REG = { key: 'worldaxis_tape_store_cfg_v1', def: { enabled: true }, module: 'tapeStore' };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = { enabled: true };
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
                          : Object.assign(base, raw || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  let _seq = 0;
  const _stat = { saved: 0, loaded: 0, dropped: 0, evicted: 0, writeFails: 0, lastWriteFailReason: '', lastSavedAt: 0 };

  /**
   * 裸读归因（G16）：磁带仓库的读回点必须能被归因。
   *   为什么不能只 `catch (e) { return {} }`：读失败时我们答的是「仓库里一卷都没有」，
   *   这与「真的没存过」**同形**——而两者处置完全不同（一个是存储故障要修，一个是正常开局）。
   *   投递 store.reportReadFail 是让那件事在诊断里留痕的唯一出口（G16 冻结此清单）。
   */
  function noteRead(key, err) {
    try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('tapeStore', key, err); } catch (e) {}
  }

  function readStore() {
    try {
      const raw = (WA.mainWin ? WA.mainWin : window).localStorage.getItem(LS_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : {};
    } catch (e) { noteRead(LS_KEY, e); return {}; }
  }

  function writeStore(obj) {
    try {
      (WA.mainWin ? WA.mainWin : window).localStorage.setItem(LS_KEY, JSON.stringify(obj));
      return true;
    } catch (e) {
      _stat.writeFails++;
      _stat.lastWriteFailReason = String(e && e.message || e);
      return false;
    }
  }

  function save(vol) {
    if (settings().enabled === false) return { ok: false, reason: 'disabled' };
    if (!vol || typeof vol !== 'object') return { ok: false, reason: 'bad-volume' };
    if (vol.format !== TAPE_FORMAT) return { ok: false, reason: 'bad-format', want: TAPE_FORMAT, got: vol.format };
    if (vol.formatVersion !== TAPE_FORMAT_VERSION) return { ok: false, reason: 'tape-version-mismatch', want: TAPE_FORMAT_VERSION, got: vol.formatVersion };
    if (!Array.isArray(vol.rows)) return { ok: false, reason: 'bad-tape' };
    if (vol.rows.length === 0) return { ok: false, reason: 'empty-tape' };
    const now = (WA.clock ? WA.clock.wallNow() : Date.now());
    const id = 't' + now + '_' + (++_seq);
    const store = readStore();
    store[id] = { format: TAPE_FORMAT, formatVersion: TAPE_FORMAT_VERSION, seed: vol.seed,
      rows: vol.rows, entries: vol.rows.length, savedAt: now, __seq: _seq };
    const evicted = [];
    const keys = Object.keys(store).sort(function (a, b) { return (store[a].__seq || 0) - (store[b].__seq || 0); });
    while (Object.keys(store).length > CAP_VOLS) {
      const oldest = keys.shift();
      if (oldest === undefined) break;
      delete store[oldest];
      evicted.push(oldest);
      _stat.evicted++;
    }
    _stat.saved++;
    _stat.lastSavedAt = now;
    const w = writeStore(store);
    return { ok: w, id: id, entries: vol.rows.length, evicted: evicted, persist: w };
  }


  function list() {
    if (settings().enabled === false) return { ok: false, reason: 'disabled' };
    const store = readStore();
    const rows = Object.keys(store).sort(function (a, b) { return (store[b].savedAt || 0) - (store[a].savedAt || 0); }).map(function (k) {
      const v = store[k];
      return { id: k, seed: v.seed, entries: v.entries, savedAt: v.savedAt };
    });
    return { ok: true, rows: rows, total: rows.length };
  }

  function load(id) {
    if (settings().enabled === false) return { ok: false, reason: 'disabled' };
    if (typeof id !== 'string' || !id) return { ok: false, reason: 'type', field: 'id', got: typeof id };
    const store = readStore();
    const v = store[id];
    if (!v) return { ok: false, reason: 'no-such-vol' };
    _stat.loaded++;
    // 剥离仓库元数据，还原成 rand.replay 可回放的磁带对象（entries 只含磁带字段）
    return { ok: true, tape: { seed: v.seed, open: false, entries: v.rows.map(function (r) {
      return { c: r.c, v: r.v, k: r.k, n: r.n, r: r.r, s: r.s };
    }), recordedAt: v.savedAt } };
  }

  function drop(id) {
    if (settings().enabled === false) return { ok: false, reason: 'disabled' };
    if (typeof id !== 'string' || !id) return { ok: false, reason: 'type', field: 'id', got: typeof id };
    const store = readStore();
    if (!store[id]) return { ok: false, reason: 'no-such-vol' };
    delete store[id];
    _stat.dropped++;
    const w = writeStore(store);
    return { ok: w, persist: w };
  }

  function stat() {
    const store = readStore();
    return { saved: _stat.saved, loaded: _stat.loaded, dropped: _stat.dropped, evicted: _stat.evicted,
      writeFails: _stat.writeFails, lastWriteFailReason: _stat.lastWriteFailReason,
      lastSavedAt: _stat.lastSavedAt, total: Object.keys(store).length, cap: CAP_VOLS };
  }

  WA.tapeStore = {
    save: save,
    list: list,
    load: load,
    drop: drop,
    stat: stat
  };
})();
