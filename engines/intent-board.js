/**
 * WorldAxis engines/intent-board.js（v2.286.0 · V7 EXV7-2）
 * 人物意图看板：他在图什么、卡在哪一步。
 *
 * 【EXV7-2 立项原文】plan.expand(person, goalId, steps) 已有完整链状态
 *   （第几步 / 缺什么前置 / 卡在哪），但面板从未把它呈现成人话。产出
 *   「目标 → 计划步骤 → 当前卡点」三列看板；数据全部读 plan.chain，不推断。
 *
 * 【本模块与 plan.js 的分工（两边都答「计划」，答的不是同一问）】
 *   plan.chain(name)   答一个人：他这一步、他卡在哪、他后面还有几步；
 *   plan.buildBlock()  给正文模型（只说「他打算做这一步」）；
 *   plan.chainBlock()  给推演引擎（要给链状态）；
 *   intentBoard        给玩家：把同一批 chain 读数摆成一张可扫的看板 ——
 *                      逐人一行、卡点单独成列、拟稿与已结算分开摆。
 *   本模块零新容器、零新真源：不持有任何计划数据，全部现读 plan.chain；
 *   plan 缺席则整块如实报缺席（不补空白行、不合成空看板）。
 *
 * 【四条否定式边界（本模块存在的全部理由）】
 *   ① 不推断卡点：卡点列逐字取 chain.blockedBy（资源缺口 / 前置步未完成
 *      两类分开报）。chain 说不出卡点的行，看板也不许自己编一句「受阻」。
 *   ② 不造空行：chain() 报 no-plan / unknown-goal 的人不进看板，
 *      不补一行「（暂无计划）」——那会让「他没计划」与「看板坏了」同形。
 *   ③ 拟稿不冒充事实：step.status 为 pending/running 的行标 draft
 *      （与 plan.review 的 asFact:false 同口径），不得叙述成「他做了」。
 *   ④ 只读：不调 expand / advance / settle / rechoose / adopt 任何一个写口，
 *      不改 store、不落盘（除自身设置键）、不调模型、不碰 DOM。
 *
 * 【导出面（8 口）】
 *   getSettings / setSettings / board / buildBlock / view / stat / reset / _blockedText
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const LS_KEY = 'worldaxis_intent_board_settings_v1';
  // maxRows：看板最多几行（人）；maxRest：每行最多列几步后续步（不让一行撑满屏）
  const DEF = { enabled: true, maxRows: 8, maxRest: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'intentBoard',
    bounds: { maxRows: [1, 24], maxRest: [0, 8] } };

  function settings() {
    const raw = (WA.settingsBus && typeof WA.settingsBus.read === 'function') ? WA.settingsBus.read(__REG) : DEF;
    const merged = Object.assign({}, DEF, raw || {});
    return (WA.settingsBus && typeof WA.settingsBus.normalize === 'function')
      ? WA.settingsBus.normalize(__REG, merged) : merged;
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      const norm = (typeof WA.settingsBus.normalize === 'function') ? WA.settingsBus.normalize(__REG, merged) : merged;
      return WA.settingsBus.saveOrThrow(__REG, norm);
    }
    return merged;
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) { return !r || r.key !== LS_KEY; }).concat([__REG]);

  const __stat = { boards: 0, rows: 0, skipped: 0, blocked: 0, faults: {}, lastReason: '' };
  function fault(k) { __stat.faults[k] = (__stat.faults[k] || 0) + 1; __stat.lastReason = k; }

  /** 只读、失败即降级（观察层失败不许影响主链）。 */
  function safe(fn, fb) {
    try { const v = fn(); return v === undefined ? fb : v; } catch (e) { fault('read-threw'); return fb; }
  }

  /**
   * 候选人物名单：只取存档里真有的人，不按计划表反查。
   *   为什么从 people 走出去：计划表（store.plan.plans）只有「有计划的人」，
   *   从它反查得到的名单无法区分「这人没计划」与「这人不存在」——
   *   而看板要答的正是前一件事。人的真源是 people（registry 才是唯一写者）。
   */
  function personNames() {
    return safe(function () {
      const st = (WA.store && typeof WA.store.get === 'function') ? WA.store.get() : null;
      const people = (st && st.people && typeof st.people === 'object') ? st.people : {};
      return Object.keys(people).map(function (k) {
        const row = people[k];
        const nm = (row && row.name) ? String(row.name) : String(k).replace(/^p_/, '');
        return { key: k, name: nm };
      });
    }, []);
  }

  /**
   * 卡点文案：把 chain.blockedBy 两类逐条译成人话（纯函数，专锁直接驱动）。
   *   两类不可合并（同 plan.chain 的裁决：「资源不够可以等」与
   *   「前置没完成得先做前面的」处置完全不同）。
   * @returns {string[]} 逐条文案；空数组 = 没卡点（不造「无」行）
   */
  function _blockedText(blockedBy) {
    const list = Array.isArray(blockedBy) ? blockedBy : [];
    const out = [];
    list.forEach(function (b) {
      if (!b) return;
      if (b.kind === 'need') {
        out.push('缺 ' + String(b.detail || ''));
      } else if (b.kind === 'after') {
        const st = String(b.waitingOn || '');
        const tail = st === 'running' ? '正在做' : (st === 'blocked' ? '那一步自己卡住了' : '还没轮到自己');
        out.push('等前置第 ' + String(b.seq) + ' 步「' + String(b.text || '') + '」（' + tail + '）');
      }
    });
    return out;
  }

  /**
   * 一行看板：一个人一条。
   *   chain 报 ok:false 时**返回 null**（调用方据此跳过，不造空行）。
   */
  function rowOf(name, cfg) {
    if (!WA.plan || typeof WA.plan.chain !== 'function') return null;
    const c = safe(function () { return WA.plan.chain(name); }, null);
    if (!c || c.ok !== true) return null;   // no-plan / unknown-goal → 不进看板
    const blocks = _blockedText(c.blockedBy);
    const step = c.step ? {
      seq: c.step.seq, kind: c.step.kind, text: c.step.text, status: c.step.status,
      // 拟稿与事实分开（与 plan.review 的 asFact 同口径）：只有 done 才算已结算
      asFact: c.step.status === 'done'
    } : null;
    return {
      name: name,
      goalId: c.goalId,
      goalText: c.goalText,
      goalStatus: c.goalStatus,
      status: c.status,
      reason: c.reason || '',
      tries: c.tries || 0,
      total: c.total,
      done: c.done,
      step: step,
      blocked: blocks,
      isBlocked: !!(c.status === 'blocked' || blocks.length),
      rest: (Array.isArray(c.rest) ? c.rest : []).slice(0, cfg.maxRest).map(function (s) {
        return { seq: s.seq, text: s.text };
      }),
      restTotal: (Array.isArray(c.rest) ? c.rest.length : 0),
      drift: c.drift === true
    };
  }

  /**
   * 整张看板（只读）。
   *   plan 引擎缺席 ⇒ { ok:false, reason:'no-plan-engine' }（不合成空看板）；
   *   一个人在场上但没有一条能出行的链 ⇒ { ok:true, rows:[], empty:true, checked:N }。
   *   `empty` 与 `no-plan-engine` 是两件事（「大家都还没计划」vs「这台引擎没装」）。
   */
  function board() {
    const cfg = settings();
    if (!cfg.enabled) return { ok: false, reason: 'disabled' };
    if (!WA.plan || typeof WA.plan.chain !== 'function') {
      fault('no-plan-engine');
      return { ok: false, reason: 'no-plan-engine',
        note: 'engines/plan.js 未加载 —— 看板没有可读的链，不是「没人有计划」' };
    }
    const all = personNames();
    const rows = [];
    let skipped = 0;
    for (let i = 0; i < all.length && rows.length < cfg.maxRows; i++) {
      const r = rowOf(all[i].name, cfg);
      if (!r) { skipped++; continue; }
      rows.push(r);
    }
    __stat.boards++;
    __stat.rows = rows.length;
    __stat.skipped = skipped;
    __stat.blocked = rows.filter(function (r) { return r.isBlocked; }).length;
    return {
      ok: true, reason: rows.length ? 'ok' : 'empty',
      rows: rows, checked: all.length, skipped: skipped,
      empty: rows.length === 0 && all.length > 0,
      capped: rows.length >= cfg.maxRows && all.length > rows.length + skipped,
      maxRows: cfg.maxRows, maxRest: cfg.maxRest
    };
  }

  /** 面板直接用的一句话读数（不拼 HTML；HTML 在 ui/panel.js 里拼）。 */
  function view() {
    const b = board();
    const cfg = settings();
    return Object.assign({}, b, { enabled: cfg.enabled === true, settings: { maxRows: cfg.maxRows, maxRest: cfg.maxRest } });
  }

  /**
   * 注入块（给正文模型/推演引擎的极简版）：逐行「谁 → 目标：卡在哪」。
   *   为什么本模块也要有注入块：本仓纪律是「有开关、无注入面」的机制会被判 dormant；
   *   但本模块的注入面**必须极短**，且只列**受阻**的人（没卡点的不用提醒）。
   *   开关关着 / plan 缺席 ⇒ 空串（零 token）。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const b = board();
    if (!b.ok || !b.rows.length) return '';
    const stuck = b.rows.filter(function (r) { return r.isBlocked; });
    if (!stuck.length) return '';
    return '【人物意图（只列受阻）】' + stuck.slice(0, cfg.maxRows).map(function (r) {
      const at = r.step ? ('第 ' + r.step.seq + '/' + r.total + ' 步「' + r.step.text + '」') : '（无当前步）';
      return r.name + ' → ' + r.goalText + '：' + at + '，卡在 ' + r.blocked.join('、');
    }).join('；');
  }

  function stat() {
    return { boards: __stat.boards, rows: __stat.rows, skipped: __stat.skipped,
      blocked: __stat.blocked, lastReason: __stat.lastReason,
      faults: Object.assign({}, __stat.faults),
      // 自证面：两源在场与否（「没装」与「没内容」必须分得开）
      planAvailable: !!(WA.plan && typeof WA.plan.chain === 'function'),
      enabled: settings().enabled === true };
  }

  function reset() {
    __stat.boards = 0; __stat.rows = 0; __stat.skipped = 0; __stat.blocked = 0;
    __stat.lastReason = ''; __stat.faults = {};
    return true;
  }

  WA.intentBoard = {
    getSettings: settings, setSettings: saveSettings,
    board: board, buildBlock: buildBlock, view: view, stat: stat, reset: reset,
    // 纯函数出口：专锁与探针直接驱动（已登记消费方：tests/v7-intent-board-2286.js）。
    _blockedText: _blockedText
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/intent-board.js', { kind: 'engine', ver: '2.286.0' });
  }
  if (WA.log) WA.log('info', 'intentBoard 已加载（人物意图看板 · 只读聚合）');
})();
