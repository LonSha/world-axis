/**
 * WorldAxis engines/mend.js (v2.119.0) — 关系修复与破裂（拓展计划 ②）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   `fondness` 只有单向阶梯（`apply` 明确写下「好感不降：冲突走 trust 对冲」），
 *   `shadow` 记两人共同隐瞒的经历，`bonds/affect` 记关系经历 —— **没有任何一处**
 *   回答得了被反复问到的那句话：**「伤到哪一步才算好？怎么做才算补上了？」**
 *   于是现场只有两种做法：要么一次加分就把整场冲突抹平（角色像没有记忆），
 *   要么永远修不好（关系没有回程路）。两者都是「和好」这个词不可判定。
 *
 * ── 本模块只做四件事，每件都有一个硬条件 ───────────────────────
 *   ① `mark`  登记一次**具体伤害**：伤的是「什么」（hurt 必填），涉及谁（with）。
 *      伤害与「感受」分开记：`affect` 记情绪，本模块记**待履行的修复条件**。
 *   ② `step`  记录一次**修复动作**，四种各有各的门槛（下表），门槛不过就是没过：
 *        · apology     —— 需要对方**显式接受**（`acceptedBy` + accepted:true）；
 *        · restitution —— 需要一笔**真实转移的回执**（`receipt`）——没有回执的补偿
 *                         就是「我说我补偿了」，那正是本仓最贵的一类默认值；
 *        · keeping     —— 需要**守约证据**（`kept:true`，由 act/world 侧给出）；
 *        · guarantee   —— 需要**第三方担保人**（`by` 存在、且不是当事人自己）。
 *   ③ `close` 结案：`fulfilled` **必须**同时满足进度门槛 `minProgress` 与显式
 *      `applyRelation:true` 才动关系；否则 `insufficient-progress` 拒收。
 *      本模块**不自动**改好感（谁把「修复进度」与「好感分」合成一个数，
 *      谁就再也答不出「她到底是原谅了还是在忍着」）。
 *   ④ `failed` 是**一等公民**：修复可以失败、可以被拒绝，失败如实留痕且不再推进。
 *
 * ── 八条设计边界（全是否定式）──────────────────────────────────
 *   ① **伤害必须写明**。`hurt` 缺失 ⇒ `missing-hurt` 拒收（「他伤了我」不可执行）。
 *   ② **不同手段不可互相顶替**。道歉不能代替补偿，担保不能代替守约：
 *      四种动作各记一格（`acts` 表），同一格重复做只更新最近一次的时间。
 *   ③ **没有回执不算补偿**（见上 ②）。
 *   ④ **进度不是好感**：progress 是 0..minProgress 的**条件满足度**，只在 close
 *      且显式授权时才转化为一次关系变化，转化失败照实带出（不吞错）。
 *   ⑤ **一次修复只结一次**：终态（fulfilled/failed/dropped）后任何 step 报
 *      `already-closed`，重复请求不产生第二次关系变化（幂等靠状态机，不靠调用方自觉）。
 *   ⑥ **未和好也留痕**。`failed` 不删行——「他求过一次，被拒了」是复盘证据。
 *   ⑦ **不代人决定**。本模块没有「自动原谅」「到点自动和好」的路径；
 *      对方接受与否必须由调用方显式给出（`acceptedBy` 是谁接受的，也是证据）。
 *   ⑧ **容量有界且挤出有账**：站点 `mend.threads`（cap 12）走 evict 单一出口。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────────
 *   · 本模块**不做关系判定**：好感/信任的真源始终是 `fondness`；本模块只是在
 *     被显式授权时调用它一次，并把它的返回值如实带回。
 *   · 本模块**不度量情绪**（那是 affect 的职责），也不记共同秘密（shadow 的职责）。
 *   · 总开关默认关闭；关闭时不登记、不推进、不结案、不注入。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_mend_settings_v1';
  const DEF = { enabled: false, maxRows: 12, minProgress: 2, maxSteps: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'mend',
    bounds: { maxRows: [4, 32], minProgress: [1, 3], maxSteps: [1, 4] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 四种手段**各占一格**（可互相顶替的口径会让「他到底做了什么」答不出）。
  const ACTS = ['apology', 'restitution', 'keeping', 'guarantee'];
  const STATUS = ['open', 'fulfilled', 'failed', 'dropped'];
  const TERMINAL = ['fulfilled', 'failed', 'dropped'];
  // 进度达标时允许的那一步关系变化（**唯一**一次；由 close 显式触发）。
  const RELIEF = { 1: 0.1, 2: 0.3, 3: 0.5, 4: 0.8 };   // 必须落在 fondness 步进白名单 [0.1,0.3,0.5,0.8] 内：自造刻度（1/2/4）会被 fondness 以 off-step 拒收 —— 那时「结案成功」与「关系没动」会同时为真，整条修复看起来成了却什么也没变。（由 mend 专锁的 off-step 判据钉住）

  const stat = { marks: 0, steps: 0, closed: 0, refused: 0, failed: 0, blocked: 0,
    lastReason: '', faults: {} };
  function noteFault(reason) {
    stat.faults[reason] = (stat.faults[reason] || 0) + 1;
    stat.blocked++; stat.lastReason = reason;
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function rowsOf(root) { const c = (root || state()).mend; return (c && Array.isArray(c.threads)) ? c.threads : []; }
  function find(id, root) {
    const key = clean(id, 60);
    if (!key) return null;
    return rowsOf(root).filter(function (r) { return r && clean(r.id, 60) === key; })[0] || null;
  }
  function pair(row) { return clean(row && row.person, 40) + '|' + clean(row && row.with, 40); }
  function openOf(person, withWhom, root) {
    const p = clean(person, 40), w = clean(withWhom, 40);
    return rowsOf(root).filter(function (r) {
      return r && clean(r.person, 40) === p && clean(r.with, 40) === w && TERMINAL.indexOf(r.status) < 0;
    })[0] || null;
  }
  function progressOf(row) {
    // 进度 = **已满足条件的手段格数**（不是做了几次：同一格做两次还是那一格）。
    const acts = row && row.acts && typeof row.acts === 'object' ? row.acts : {};
    return ACTS.filter(function (k) { return acts[k] && acts[k].ok === true; }).length;
  }
  /** 登记一次具体伤害（必须写明伤的是什么）。 */
  function mark(person, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const who = clean(person, 40), withWhom = clean(o.with, 40), hurt = clean(o.hurt, 80);
    if (!who || !withWhom) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!hurt) { noteFault('missing-hurt'); return { ok: false, reason: 'missing-hurt', hint: '伤害必须写明针对什么' }; }
    if (who === withWhom) { noteFault('bad-pair'); return { ok: false, reason: 'bad-pair' }; }
    const cfg = settings();
    if (openOf(who, withWhom)) { noteFault('exists'); return { ok: false, reason: 'exists', person: who, with: withWhom }; }
    let out = null;
    WA.store.transact(function (draft) {
      draft.mend = (draft.mend && typeof draft.mend === 'object' && !Array.isArray(draft.mend)) ? draft.mend : { threads: [] };
      draft.mend.threads = Array.isArray(draft.mend.threads) ? draft.mend.threads : [];
      if (draft.mend.threads.length >= cfg.maxRows) { out = { ok: false, reason: 'rows-full', cap: cfg.maxRows }; return false; }
      const now = clockNow('mend');
      const row = { id: 'mend_' + now + '_' + draft.mend.threads.length,
        person: who, with: withWhom, hurt: hurt, note: clean(o.note, 80),
        status: 'open', acts: {}, tries: 0, reason: '', at: now, updatedAt: now };
      draft.mend.threads.push(row);
      WA.evict.array(draft.mend.threads, 'mend.threads', cfg.maxRows);
      out = { ok: true, id: row.id, hurt: hurt };
    }, 'mend:mark');
    if (out && out.ok) { stat.marks++; stat.lastReason = 'marked'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 记录一次修复动作。每个门都不通过就**不是这一步**（拒收并说明缺什么），
   * 而不是「记下来算努力过」。`reason` 一律是缺的那件东西。
   */
  function step(person, id, kind, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const k = clean(kind, 20);
    if (ACTS.indexOf(k) < 0) { noteFault('bad-kind'); return { ok: false, reason: 'bad-kind', allowed: ACTS.slice() }; }
    const row = find(id);
    if (!row) { noteFault('missing'); return { ok: false, reason: 'missing', id: clean(id, 60) }; }
    if (TERMINAL.indexOf(row.status) >= 0) { noteFault('already-closed'); return { ok: false, reason: 'already-closed', status: row.status }; }
    if (clean(person, 40) !== clean(row.person, 40)) {
      // 只有当事人自己能做修复动作（别人代做不是他在修复）。
      noteFault('not-a-party');
      return { ok: false, reason: 'not-a-party', person: clean(person, 40) };
    }
    const cfg = settings();
    if ((row.tries || 0) >= cfg.maxSteps + 1) { noteFault('too-many-tries'); return { ok: false, reason: 'too-many-tries', tries: row.tries }; }
    // ── 四道门（各自必要条件，互不顶替）──
    if (k === 'apology') {
      if (o.accepted !== true) return { ok: false, reason: 'not-accepted', hint: '道歉只有对方接受才算一步' };
      if (!clean(o.acceptedBy, 40)) return { ok: false, reason: 'missing-accepter', hint: '谁接受了必须写明' };
    } else if (k === 'restitution') {
      // 没有真实转移回执的补偿 = 「我说我赔了」——本模块不接受口头赔偿。
      if (o.receipt !== true) return { ok: false, reason: 'no-receipt', hint: '补偿需要一笔真实转移的回执' };
    } else if (k === 'keeping') {
      if (o.kept !== true) return { ok: false, reason: 'not-kept', hint: '守约需要实际守约的证据' };
    } else {
      const by = clean(o.by, 40);
      if (!by) return { ok: false, reason: 'missing-guarantor' };
      if (by === clean(row.person, 40) || by === clean(row.with, 40)) {
        noteFault('bad-guarantor');
        return { ok: false, reason: 'bad-guarantor', hint: '担保人必须是第三方' };
      }
    }
    let out = null;
    WA.store.transact(function (draft) {
      const r = find(id, draft);
      if (!r) { out = { ok: false, reason: 'missing', id: clean(id, 60) }; return false; }
      if (TERMINAL.indexOf(r.status) >= 0) { out = { ok: false, reason: 'already-closed', status: r.status }; return false; }
      const now = clockNow('mend');
      const prev = r.acts[k];
      // 同一格重复做只更新最近一次（**不叠加**：格数就是格数）。
      r.acts[k] = { ok: true, at: now, count: ((prev && prev.count) || 0) + 1,
        evidence: clean(o.evidence, 60) || (k === 'apology' ? ('accepted-by:' + clean(o.acceptedBy, 40)) : '') };
      r.tries = (r.tries || 0) + 1;
      r.updatedAt = now;
      out = { ok: true, id: r.id, kind: k, progress: progressOf(r), need: cfg.minProgress,
        repeated: !!(prev && prev.ok) };
    }, 'mend:step');
    if (out && out.ok) { stat.steps++; stat.lastReason = 'stepped'; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 结案。`fulfilled` 需要**两件事同时成立**：进度达标 + 显式授权关系变化。
   * 关系变化走 fondness.apply（本模块唯一一次调它），失败照实带出。
   */
  function close(person, id, outcome, opts) {
    if (!settings().enabled) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const o = opts || {};
    const oc = clean(outcome, 20);
    if (['fulfilled', 'failed', 'dropped'].indexOf(oc) < 0) {
      noteFault('bad-outcome');
      return { ok: false, reason: 'bad-outcome', allowed: ['fulfilled', 'failed', 'dropped'] };
    }
    const row = find(id);
    if (!row) { noteFault('missing'); return { ok: false, reason: 'missing', id: clean(id, 60) }; }
    if (TERMINAL.indexOf(row.status) >= 0) { noteFault('already-closed'); return { ok: false, reason: 'already-closed', status: row.status }; }
    if (clean(person, 40) !== clean(row.person, 40)) { noteFault('not-a-party'); return { ok: false, reason: 'not-a-party' }; }
    const cfg = settings();
    const prog = progressOf(row);
    if (oc === 'fulfilled') {
      if (prog < cfg.minProgress) {
        // 条件不足就不结案 —— 这正是「伤到哪一步才算好」的答案。
        return { ok: false, reason: 'insufficient-progress', progress: prog, need: cfg.minProgress };
      }
      if (o.applyRelation !== true) {
        return { ok: false, reason: 'relation-not-authorized', hint: '结案改关系必须显式授权' };
      }
    }
    // 关系效果先算（真源是 fondness），**结案落库后**才如实回报它的结果。
    let rel = null;
    if (oc === 'fulfilled') {
      const delta = RELIEF[Math.min(prog, 4)] || 0.1;
      if (WA.fondness && typeof WA.fondness.apply === 'function') {
        try {
          rel = WA.fondness.apply(clean(row.with, 40), { delta: delta, note: clean(o.note, 60) || ('修复：' + clean(row.hurt, 40)) });
        } catch (e) { rel = { ok: false, reason: 'relation-threw' }; }
      } else rel = { ok: false, reason: 'fondness-missing' };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const r = find(id, draft);
      if (!r) { out = { ok: false, reason: 'missing', id: clean(id, 60) }; return false; }
      if (TERMINAL.indexOf(r.status) >= 0) { out = { ok: false, reason: 'already-closed', status: r.status }; return false; }
      const now = clockNow('mend');
      r.status = oc;
      r.reason = clean(o.reason || oc, 40);
      r.progress = progressOf(r);
      r.closedAt = now; r.updatedAt = now;
      // 关系效果**如实记在行上**：失败也是这次结案的真实结果（不吞错）。
      r.relation = rel ? { ok: rel.ok === true, reason: clean(rel.reason || (rel.ok ? 'applied' : 'failed'), 40) } : null;
      out = { ok: true, id: r.id, status: oc, progress: r.progress, relation: r.relation };
    }, 'mend:close');
    if (out && out.ok) {
      stat.closed++;
      if (oc === 'failed') stat.failed++; else if (oc === 'fulfilled' && !(rel && rel.ok)) stat.refused++;
      stat.lastReason = oc;
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function view(person, withWhom) {
    const who = clean(person, 40), withW = clean(withWhom, 40);
    let row = withW ? openOf(who, withW) : rowsOf().filter(function (r) {
      return r && clean(r.person, 40) === who;
    })[0];
    let historical = false;
    if (!row && withW) {
      // terminal rows are still evidence: fall back to the most recent row for the pair.
      // Real gap found while landing this version: openOf alone makes failed/dropped
      // rows unreadable through the API -- "failed keeps its row" then means "failed is invisible".
      const all = rowsOf().filter(function (r) { return r && clean(r.person, 40) === who && clean(r.with, 40) === withW; });
      row = all[all.length - 1] || null;
      historical = !!row;
    }
    if (!row) return { ok: false, reason: 'missing' };
    const missing = ACTS.filter(function (k) { return !(row.acts[k] && row.acts[k].ok); });
    return { ok: true, id: row.id, person: row.person, with: row.with, hurt: row.hurt,
      status: row.status, reason: row.reason,
      progress: progressOf(row), need: settings().minProgress,
      acts: ACTS.map(function (k) {
        const a = row.acts[k];
        return { kind: k, done: !!(a && a.ok), count: (a && a.count) || 0, evidence: (a && a.evidence) || '' };
      }),
      // 「还差什么」必须当场可答，否则修复永远停在猜。
      missing: missing, relation: row.relation || null,
      closed: TERMINAL.indexOf(row.status) >= 0, historical: historical };
  }
  function statView() {
    const rows = rowsOf();
    const byStatus = {};
    STATUS.forEach(function (k) { byStatus[k] = 0; });
    rows.forEach(function (r) { if (r && byStatus[r.status] !== undefined) byStatus[r.status]++; });
    return { enabled: settings().enabled, rows: rows.length, byStatus: byStatus,
      open: rows.filter(function (r) { return r && r.status === 'open'; }).length };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const lines = [];
    rowsOf().filter(function (r) { return r && r.status === 'open'; }).slice(0, cfg.maxRows).forEach(function (r) {
      const missing = ACTS.filter(function (k) { return !(r.acts[k] && r.acts[k].ok); });
      lines.push(r.person + ' 与 ' + r.with + ' 之间：' + r.hurt
        + '（已补 ' + progressOf(r) + '/' + cfg.minProgress + (missing.length ? '，尚缺：' + missing.join('、') : '') + '）');
    });
    if (!lines.length) return '';
    return '[关系修复]' + String.fromCharCode(10) + lines.join(String.fromCharCode(10))
      + String.fromCharCode(10) + '这些是尚未了结的伤害与待履行的修复条件。没有取得对方接受或实际补偿之前，不得写成已经和好；修复也可能失败。';
  }
  WA.mend = {
    ACTS: ACTS.slice(), STATUS: STATUS.slice(), TERMINAL: TERMINAL.slice(),
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    mark: mark, step: step, close: close, view: view, statView: statView, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/mend.js', { kind: 'engine', ver: '2.119.0' });
})();