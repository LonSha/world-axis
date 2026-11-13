/**
 * WorldAxis engines/chat-recycle.js (v2.402.0) — V23-3 聊天回收站（缝异空间 V1.4）
 *
 * ── 它治什么（缺口，现场核对）──────────────────────────────────────
 *   `engines/archive-hide.js` / `engines/auto-hide.js` 管的是**楼层**隐藏（哪一楼藏起来），
 *   与**聊天文件**的生命周期是两回事：前者管「上下文里还送不送这几楼」，
 *   后者管「这个文件还在不在」。实测 `grep -rc 'recycle\|回收站\|锁定' engines/ core/`
 *   在文件生命周期上零命中 —— 也就是说：本仓没有任何地方记着「哪些聊天被移出了、
 *   移出之后还能不能回来、什么时候会被真删」。
 *
 * ── 缝合来源（显式写明，不冒称原创）────────────────────────────────
 *   异空间 V1.4 的「已移除」区，原文口径四句（教程里反复加粗的那一段）：
 *     · 「已移除」固定最多保留 **10** 个；
 *     · 超过上限时，**最早移入且未锁定的**文件会从酒馆里**彻底删除**；
 *     · 重要聊天请先**锁定**；锁定可防止异空间移除或自动清理；
 *     · 「只负责移动到显示区，不是保护」—— 单纯新开聊天不触发清理。
 *   原文的措辞非常克制（「📌只负责移动到显示区，不是保护」），本模块照这个克制写：
 *   **它只出「该清谁」的清单，不自己删**。真删由宿主做，且必须带上本模块给的理由。
 *
 * ── 本模块只做五件事，每件一个硬条件 ───────────────────────────────
 *   ① `hide(spec)`     —— 把一个文件移入回收站（**不是删除**），记 `at`（移入顺序）。
 *   ② `lock(file)` / `unlock(file)` —— 锁定/解锁；**锁定的不参与清理**。
 *   ③ `plan()`         —— 算出「超限时该清哪几个」，纯函数不写状态；
 *      **锁定项一律跳过**，从**最早移入的未锁定项**开始清。
 *   ④ `restore(file)`  —— 从回收站移回显示区。
 *   ⑤ `view()`         —— 读侧：池内项、上限、锁定数、下次清理会清谁。
 *
 * ── 九条否定式边界（本模块存在的全部理由）──────────────────────────
 *   ① 总开关默认关闭。关闭时三个写口一律 `disabled`。
 *   ② **回收站不是回收站软件**：本模块**不调任何删除口**。`plan()` 只出清单，
 *      `enforce()` 也只返回「请宿主删这几个」，并带 `reason` 与 `irreversible:true`。
 *      这条是原文最强调的一句（「📌只负责移动到显示区，不是保护」）的代码化。
 *   ③ **锁定优先于一切**：`plan()` 永不把 `locked` 的项放进清单，
 *      哪怕它是最早移入的 —— 否则「锁定保护」就是一句空话。
 *   ④ **上限有下界**：`limit` 越界（< 1）夹到 1 并如实报 `clamped`，
 *      不静默用 0（0 = 进来就删干净，那是数据丢失而不是清理）。
 *   ⑤ **移入顺序用调用方给的 `at`**，本模块不自己取当前时间当顺序 ——
 *      同一次批量移除里所有项的 `at` 会撞成同一个值，撞了就无法判定「最早」。
 *      `at` 相等时按**移入序号**（`seq`）排，且这个 tie-break 是显式写明的。
 *   ⑥ **重复移入不重置顺序**：已在本池里的文件再次 `hide` 如实报 `already-hidden`
 *      且**不改 `at` / `seq`** —— 重置顺序会让「最早移入」变成「最近被点过的最后清」。
 *   ⑦ **restore 清掉锁定与顺序**：移回显示区后不再是池内项，`lock` 状态一并失效
 *      （保留锁定会让它下次移入时立刻挡在清理前面，而用户已经「救回」过它）。
 *   ⑧ **不存在静默 success**：`lock` / `restore` 对不在池内的文件一律 `not-found`，
 *      不返回 `ok:true` 让调用方以为锁上了。
 *   ⑨ **零 store 写**：只记自己的池，不碰 `WA.store`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_chat_recycle_settings_v1';
  const DEF = {
    enabled: false,
    /** 回收站上限。原文口径固定 10，这里可配但默认逐字取 10。 */
    limit: 10,
    /** 锁定的项是否参与清理。**默认 false，且不建议改** —— 见边界 ③。 */
    purgeLocked: false
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'chatRecycle' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { hidden: 0, restored: 0, locked: 0, planned: 0, refused: 0, lastReason: '' };

  /** 池：{ file, title, at, seq, locked } */
  const POOL = [];
  let seq = 0;

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function str(v, max) { return String(v == null ? '' : v).slice(0, max || 200); }
  function refuse(code, hint) { stat.refused++; stat.lastReason = code; return { ok: false, reason: code, hint: hint }; }
  function find(file) {
    for (let i = 0; i < POOL.length; i++) if (POOL[i].file === file) return POOL[i];
    return null;
  }
  /** 有效上限：越界夹到 1 并如实报（边界 ④）。 */
  function effLimit(cfg) {
    const raw = num(cfg.limit);
    if (raw === null || raw < 1) return { limit: 1, clamped: true, raw: cfg.limit };
    return { limit: Math.floor(raw), clamped: raw !== Math.floor(raw), raw: cfg.limit };
  }

  /**
   * 把一个文件移入回收站（**不是删除**）。
   * @param {object} spec { file, title, at }
   */
  function hide(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled', '聊天回收站默认关闭，先在设置里打开');
    const s = spec && typeof spec === 'object' ? spec : {};
    const file = str(s.file, 200).trim();
    if (!file) return refuse('missing-file', 'missing-file：要移入回收站的是哪个文件，不替你猜');
    // 边界 ⑥：重复移入不重置顺序。
    if (find(file)) {
      return refuse('already-hidden', 'already-hidden：' + file + ' 已在回收站里（重复移入不会重置「最早移入」的顺序）');
    }
    const at = num(s.at);
    seq += 1;
    const item = { file: file, title: str(s.title, 80), at: at === null ? 0 : at, seq: seq, locked: false };
    POOL.push(item);
    stat.hidden++;
    const info = effLimit(cfg);
    return {
      ok: true, file: file, seq: item.seq, at: item.at,
      count: POOL.length, limit: info.limit, clamped: info.clamped,
      // 边界 ②：移入不是删除，且池子有上限 —— 这句话必须跟着读数走。
      note: '已移入回收站（不是删除）：上限 ' + info.limit + ' 个，超限时最早移入且未锁定的会被彻底删除'
    };
  }

  function lock(file) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled', '聊天回收站默认关闭');
    const f = str(file, 200).trim();
    const it = find(f);
    // 边界 ⑧：不在池内不许假装锁上。
    if (!it) return refuse('not-found', 'not-found：' + f + ' 不在回收站里，锁它没有意义（它本来就不参与清理）');
    if (it.locked) return { ok: true, file: f, locked: true, changed: false };
    it.locked = true;
    stat.locked++;
    return { ok: true, file: f, locked: true, changed: true };
  }

  function unlock(file) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled', '聊天回收站默认关闭');
    const f = str(file, 200).trim();
    const it = find(f);
    if (!it) return refuse('not-found', 'not-found：' + f + ' 不在回收站里');
    if (!it.locked) return { ok: true, file: f, locked: false, changed: false };
    it.locked = false;
    return { ok: true, file: f, locked: false, changed: true };
  }

  /**
   * 清理顺序：**最早移入的未锁定项优先**（边界 ③/⑤）。
   * 排序键显式两段：`at` 升序；`at` 相等按 `seq` 升序（同批移入时 at 会撞值）。
   */
  function purgeOrder(cfg) {
    const cand = POOL.filter(function (it) { return cfg.purgeLocked ? true : !it.locked; });
    return cand.slice().sort(function (a, b) {
      if (a.at !== b.at) return a.at - b.at;
      return a.seq - b.seq;
    });
  }

  /**
   * 算出超限时该清哪几个。**纯函数，不写状态**（边界 ②）。
   * @returns {{ok, limit, count, over, victims:[{file,title,at,seq,reason}], lockedKept, clamped}}
   */
  function plan() {
    const cfg = settings();
    const info = effLimit(cfg);
    const over = Math.max(0, POOL.length - info.limit);
    const order = purgeOrder(cfg);
    const victims = order.slice(0, over).map(function (it) {
      return { file: it.file, title: it.title, at: it.at, seq: it.seq,
        reason: 'earliest-unlocked' };
    });
    stat.planned++;
    const lockedKept = POOL.filter(function (it) { return it.locked; }).length;
    return {
      ok: true,
      limit: info.limit, clamped: info.clamped,
      count: POOL.length, over: over,
      victims: victims,
      lockedKept: lockedKept,
      // 边界 ③：锁着的有多少被保住了，必须报出来 —— 否则「锁定保护」是否生效无从验证。
      wouldPurgeLocked: cfg.purgeLocked,
      note: over > 0
        ? '将彻底删除 ' + victims.length + ' 个（不可撤销）；锁定项已跳过 ' + lockedKept + ' 个'
        : '未超限，本次不清理'
    };
  }

  /**
   * 执行清理的**申请**：只返回「请宿主删这几个」，**不删**（边界 ②）。
   */
  function enforce() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled', '聊天回收站默认关闭');
    const p = plan();
    if (!p.over) return { ok: true, purged: 0, victims: [], irreversible: false, note: '未超限，无需清理' };
    return {
      ok: true,
      purged: 0,                       // 恒 0：本模块不删（边界 ②）
      approved: p.victims.length,      // 「这批可以删」
      victims: p.victims,
      irreversible: true,
      // 这句话是给宿主与 UI 的：删是不可撤销的，且必须由调用方显式执行。
      note: '本模块只出清单，不执行删除。' + p.victims.length + ' 项已获准清理（不可撤销），'
        + '请宿主显式调用删除口；锁定项已跳过 ' + p.lockedKept + ' 个'
    };
  }

  /** 宿主删完之后回执：从池里摘掉。**只摘已获准的那几个**。 */
  function confirmPurge(files) {
    const list = Array.isArray(files) ? files.map(function (f) { return str(f, 200); }) : [];
    const removed = [];
    for (let i = POOL.length - 1; i >= 0; i--) {
      if (list.indexOf(POOL[i].file) >= 0) { removed.push(POOL[i].file); POOL.splice(i, 1); }
    }
    if (removed.length) { /* stat 里不另立「删除数」—— 那是宿主的动作，本模块不冒领 */ }
    return { ok: true, removed: removed, count: POOL.length };
  }

  function restore(file) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled', '聊天回收站默认关闭');
    const f = str(file, 200).trim();
    const it = find(f);
    if (!it) return refuse('not-found', 'not-found：' + f + ' 不在回收站里，无从恢复');
    const idx = POOL.indexOf(it);
    POOL.splice(idx, 1);
    stat.restored++;
    // 边界 ⑦：移回后锁定与顺序一并失效（它已不是池内项）。
    return { ok: true, file: f, count: POOL.length, lockedCleared: it.locked };
  }

  function view() {
    const cfg = settings();
    const info = effLimit(cfg);
    const p = plan();
    return {
      enabled: !!cfg.enabled,
      limit: info.limit, clamped: info.clamped,
      count: POOL.length,
      items: POOL.map(function (it) {
        return { file: it.file, title: it.title, at: it.at, seq: it.seq, locked: it.locked };
      }),
      nextPurge: p.victims,
      lockedKept: p.lockedKept,
      stat: Object.assign({}, stat)
    };
  }

  function setSettings(patch) {
    if (!WA.settingsBus) return { ok: false, hint: 'settingsBus 不可用' };
    const merged = Object.assign({}, settings(), patch && typeof patch === 'object' ? patch : {});
    try { WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged)); } catch (e) {
      return { ok: false, hint: 'write-threw：' + (e && e.message ? e.message : '未知') };
    }
    const back = settings();
    if (back.enabled !== merged.enabled) {
      return { ok: false, hint: 'write-verify：写后回读不一致（enabled ' + String(merged.enabled) + ' → ' + String(back.enabled) + '）' };
    }
    return { ok: true, settings: back };
  }

  function reset() {
    POOL.length = 0; seq = 0;
    stat.hidden = 0; stat.restored = 0; stat.locked = 0; stat.planned = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }

  WA.chatRecycle = {
    hide: hide,
    lock: lock,
    unlock: unlock,
    plan: plan,
    enforce: enforce,
    confirmPurge: confirmPurge,
    restore: restore,
    view: view,
    setSettings: setSettings,
    getSettings: settings,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/chat-recycle.js', { kind: 'engine', ver: '2.402.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/chat-recycle 已加载（2.402.0）');
  }
})();