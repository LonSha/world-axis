/**
 * WorldAxis engines/stage-session.js (v2.402.0) — V23-1 小剧场会话账本（缝异空间 V1.4）
 *
 * ── 它治什么（缺口，现场核对）──────────────────────────────────────
 *   `engines/stage.js` 管的是「一套玩法包玩到第几个阶段」（玩法包的**阶段迁移**），
 *   `engines/theme.js` 管的是「这一局允许哪些规则模块」（**题材组合**）。
 *   两者都**不持有会话**：产品面上没有任何一处回答得了「现在正处在哪一段演绎里」。
 *   于是「退出时这一段该怎么处理」这个问题无处可问 —— 退出只有两种可能：
 *   靠人记得保存，或者直接丢掉。实测（`grep -rc 'stageSession\|小剧场' engines/ core/`）
 *   会话生命周期零命中：这是真空白，不是重复轮子。
 *
 * ── 缝合来源（显式写明，不冒称原创）────────────────────────────────
 *   异空间 V1.4（酒馆助手脚本）的「小剧场」会话管理，原文口径三句：
 *     · 进入小剧场**新开一段聊天**，并进行中状态可见；
 *     · 退出**三选**：保存存档回到正文 / 不保存回到正文 / 取消留在当前；
 *     · 存档可再继续；不保存的进「已移除」（**不等于删除**）。
 *   本模块只取其中**可判定的那一层**：会话账本 + 退出策略裁决 + 仓化索引。
 *   真正的「开新聊天 / 切聊天文件」是宿主动作，本模块**只出裁决与清单，不代劳**。
 *
 * ── 与既有模块的分工（三者不读写对方）──────────────────────────────
 *   · `stage.js` / `theme.js` —— 玩法包与题材，本模块不动它们的判据；
 *   · `chat-recycle`（V23-3）—— 丢弃会话进回收站之后的**上限与清理**归它；
 *   · 本模块 —— 会话生命周期（begin / activate / end / resume）+ 退出策略 + 仓化索引。
 *
 * ── 七条否定式边界（本模块存在的全部理由）──────────────────────────
 *   ① 总开关默认关闭。关闭时四个写口一律 `disabled`，读口如实报「关着」。
 *   ② **同一时刻只有一个进行中的会话**：`activate` 遇到已有活跃会话一律拒收
 *      （`already-active`），**不自动把前一个顶掉** —— 「顶掉」会让前一段的存档
 *      落到哪个名字上无法回答，而那是本模块唯一要保证的事。
 *   ③ **退出必须给策略**：`end` 缺 policy 一律拒收。不默认「保存」也不默认「丢弃」：
 *      默认保存会把每次试演都写进存档，默认丢弃会把真剧情扔掉。两者都不能替用户选。
 *   ④ **`cancel` 不改状态**：退出弹窗点「取消」时状态必须**逐字不变**（可断言）。
 *   ⑤ **`discard` 不是删除**：它只把会话标成 `discarded` 并写进 `trash` 索引
 *      （交给 `chatRecycle`）。本模块**不调任何删除口** —— 删除是不可撤销动作，
 *      不该藏在一个「退出」按钮背后。
 *   ⑥ **空会话用调用方给的块数判**（`blocks`）：本模块不自己数楼，
 *      数错一层就会把「刚开的空聊天」当成真剧情存下来，或反过来把真剧情当空的丢掉。
 *   ⑦ **零 store 写**：只记自己的会话表与索引，不碰 `WA.store`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_stage_session_settings_v1';
  const DEF = {
    enabled: false,
    /** 退出策略缺省**不给默认值**：'ask' 表示「必须由调用方显式指定」，不是「默认问一下」。 */
    defaultExitPolicy: 'ask',
    /** 块数低于此值视为空会话（异空间原文用的是「聊天条数 < 2」这一档）。 */
    emptyBlocks: 2,
    /** 同一段会话存档最多保留多少份快照（0 = 不限）。 */
    maxSnapshots: 20
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'stageSession' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { begun: 0, activated: 0, ended: 0, resumed: 0, refused: 0, lastReason: '' };

  /** 会话表（按 begin 先后）。`state`: pending / active / archived / discarded。 */
  const SESSIONS = [];
  /** 仓化索引：discarded 会话的落点（交给 chatRecycle 做上限与清理）。 */
  const TRASH = [];
  let serial = 0;

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function str(v, max) { return String(v == null ? '' : v).slice(0, max || 120); }
  function find(id) {
    for (let i = 0; i < SESSIONS.length; i++) if (SESSIONS[i].id === id) return SESSIONS[i];
    return null;
  }
  function activeOf() {
    for (let i = 0; i < SESSIONS.length; i++) if (SESSIONS[i].state === 'active') return SESSIONS[i];
    return null;
  }
  function refuse(code, hint) { stat.refused++; stat.lastReason = code; return { ok: false, reason: code, hint: hint }; }

  /**
   * 开一段会话（**不激活**）。
   * @param {object} spec { stageId, title, blocks, at }
   * @returns {{ok:boolean, reason?:string, hint?:string, id?:string}}
   */
  function begin(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled', '小剧场会话账本默认关闭，先在设置里打开');
    const s = spec && typeof spec === 'object' ? spec : {};
    const stageId = str(s.stageId, 80).trim();
    if (!stageId) return refuse('missing-stage', 'missing-stage：必须给 stageId —— 会话要挂在哪段设定上，不替你猜');
    const title = str(s.title, 80).trim();
    if (!title) return refuse('missing-title', 'missing-title：存档名取标题，缺标题的会话退出时无法被认领');
    const blocks = num(s.blocks);
    serial += 1;
    const sess = {
      id: 'ss-' + Date.now().toString(36) + '-' + serial,
      stageId: stageId,
      title: title,
      blocks: blocks === null ? 0 : blocks,
      state: 'pending',
      at: num(s.at) || 0,
      snapshots: [],
      endedAt: null,
      exitPolicy: null
    };
    SESSIONS.push(sess);
    stat.begun++;
    return { ok: true, id: sess.id, state: sess.state };
  }

  /**
   * 激活一段会话（进入演绎）。已有活跃会话时**拒收**，不顶掉。
   */
  function activate(id) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled', '小剧场会话账本默认关闭');
    const sess = find(str(id, 80));
    if (!sess) return refuse('unknown-session', 'unknown-session：' + str(id, 40) + ' 不在会话表内');
    const cur = activeOf();
    if (cur && cur.id !== sess.id) {
      // 不自动顶掉：前一段的存档名与退出策略都会变得无法回答。
      return refuse('already-active', 'already-active：已有进行中的会话「' + cur.title + '」（' + cur.id + '），先 end 它');
    }
    if (sess.state === 'discarded') return refuse('discarded', 'discarded：已丢弃的会话不能复活，要重来请 begin 一段新的');
    sess.state = 'active';
    stat.activated++;
    return { ok: true, id: sess.id, state: sess.state };
  }

  /**
   * 退出。**必须给 policy**：'archive'（保存存档）| 'discard'（不保存，进仓）| 'cancel'（取消）。
   * @returns {{ok, reason?, hint?, id?, state?, trashed?, blocks?}}
   */
  function end(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled', '小剧场会话账本默认关闭');
    const s = spec && typeof spec === 'object' ? spec : {};
    const policy = str(s.policy, 20).trim();
    if (!policy) {
      // 边界 ③：不默认保存也不默认丢弃。
      return refuse('missing-policy', 'missing-policy：退出必须显式给 policy（archive / discard / cancel），本模块不替用户选');
    }
    if (['archive', 'discard', 'cancel'].indexOf(policy) < 0) {
      return refuse('unknown-policy', 'unknown-policy：' + policy + ' 不在 archive / discard / cancel 三档内');
    }
    const sess = find(str(s.id, 80));
    if (!sess) return refuse('unknown-session', 'unknown-session：' + str(s.id, 40) + ' 不在会话表内');
    if (sess.state !== 'active') {
      return refuse('not-active', 'not-active：当前状态是 ' + sess.state + '，只有 active 的会话能被 end');
    }

    // 边界 ④：cancel **逐字不改**状态。先判、再原样返回。
    if (policy === 'cancel') {
      return { ok: true, id: sess.id, state: sess.state, policy: 'cancel', changed: false };
    }

    // 边界 ⑥：空会话用调用方给的块数判，本模块不自己数楼。
    const blocks = num(s.blocks);
    const effBlocks = blocks === null ? sess.blocks : blocks;
    const isEmpty = effBlocks < cfg.emptyBlocks;

    sess.state = policy === 'archive' ? 'archived' : 'discarded';
    sess.exitPolicy = policy;
    sess.endedAt = num(s.at) || 0;
    stat.ended++;

    let trashed = null;
    if (policy === 'archive') {
      // 存档：记快照（受 maxSnapshots 约束，0 = 不限）。
      sess.snapshots.push({ at: sess.endedAt, blocks: effBlocks, empty: isEmpty });
      if (cfg.maxSnapshots > 0 && sess.snapshots.length > cfg.maxSnapshots) {
        sess.snapshots.splice(0, sess.snapshots.length - cfg.maxSnapshots);
      }
    } else {
      // 边界 ⑤：discard 只落索引，**不删除任何东西**。
      trashed = { id: sess.id, title: sess.title, blocks: effBlocks, empty: isEmpty, at: sess.endedAt };
      TRASH.push(trashed);
    }

    return {
      ok: true, id: sess.id, state: sess.state, policy: policy,
      blocks: effBlocks, empty: isEmpty, changed: true,
      // 丢弃时把「进的是仓、不是删除」这句话跟着读数一起返回 ——
      //   这份读数就是 UI 弹窗该显示的原话，避免第二处再写一遍文案。
      trashed: trashed ? Object.assign({}, trashed) : null,
      note: policy === 'discard'
        ? '已放进回收站（不是删除）：回收站有上限，超限时最早移入且未锁定的会被彻底删除'
        : '已存档，可 resume 继续'
    };
  }

  /**
   * 继续一段存档。
   */
  function resume(id) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled', '小剧场会话账本默认关闭');
    const sess = find(str(id, 80));
    if (!sess) return refuse('unknown-session', 'unknown-session：' + str(id, 40) + ' 不在会话表内');
    if (sess.state === 'discarded') return refuse('discarded', 'discarded：已丢弃的会话在回收站里，restore 之后再 resume');
    if (!sess.snapshots.length) return refuse('no-snapshot', 'no-snapshot：「' + sess.title + '」没有任何存档快照，resume 出来的会是空壳');
    const cur = activeOf();
    if (cur && cur.id !== sess.id) {
      return refuse('already-active', 'already-active：已有进行中的会话「' + cur.title + '」，先 end 它再 resume');
    }
    sess.state = 'active';
    stat.resumed++;
    const last = sess.snapshots[sess.snapshots.length - 1];
    return { ok: true, id: sess.id, state: sess.state, from: last };
  }

  /** 回收站索引（只读快照，交 chatRecycle 消费）。 */
  function trashView() {
    return { count: TRASH.length, items: TRASH.map(function (t) { return Object.assign({}, t); }) };
  }

  function view() {
    const cfg = settings();
    const cur = activeOf();
    return {
      enabled: !!cfg.enabled,
      active: cur ? { id: cur.id, stageId: cur.stageId, title: cur.title, blocks: cur.blocks } : null,
      sessions: SESSIONS.map(function (x) {
        return { id: x.id, stageId: x.stageId, title: x.title, state: x.state,
          blocks: x.blocks, snapshots: x.snapshots.length, exitPolicy: x.exitPolicy };
      }),
      trash: trashView(),
      stat: Object.assign({}, stat),
      settings: { emptyBlocks: cfg.emptyBlocks, maxSnapshots: cfg.maxSnapshots }
    };
  }

  // ── 注入面：把「此刻正在演绎哪一段」交给 prompt 层 ──────────────────
  //   与 stage.js 的口径一致：**只报事实不编描述**，且没有活跃会话时返回空串
  //   （空串与「有块但内容空」在注入层是两件事，前者不注入）。
  function buildBlock() {
    const cur = activeOf();
    if (!cur) return '';
    return '【当前演绎】' + cur.title + '（设定：' + cur.stageId + '；已进行 ' + cur.blocks + ' 块）';
  }

  function setSettings(patch) {
    if (!WA.settingsBus) return { ok: false, hint: 'settingsBus 不可用' };
    const merged = Object.assign({}, settings(), patch && typeof patch === 'object' ? patch : {});
    try { WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged)); } catch (e) {
      return { ok: false, hint: 'write-threw：' + (e && e.message ? e.message : '未知') };
    }
    // 写完回读：「写进去」不等于「存住了」。
    const back = settings();
    if (back.enabled !== merged.enabled) {
      return { ok: false, hint: 'write-verify：写后回读不一致（enabled ' + String(merged.enabled) + ' → ' + String(back.enabled) + '）' };
    }
    return { ok: true, settings: back };
  }

  function reset() {
    SESSIONS.length = 0; TRASH.length = 0; serial = 0;
    stat.begun = 0; stat.activated = 0; stat.ended = 0; stat.resumed = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }

  WA.stageSession = {
    begin: begin,
    activate: activate,
    end: end,
    resume: resume,
    buildBlock: buildBlock,
    view: view,
    trashView: trashView,
    setSettings: setSettings,
    getSettings: settings,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/stage-session.js', { kind: 'engine', ver: '2.402.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/stage-session 已加载（2.402.0）');
  }
})();
