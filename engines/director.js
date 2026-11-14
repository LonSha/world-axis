/**
 * WorldAxis engines/director.js (v2.407.0) — 导演调度（三缝③）
 *
 * ── 它治什么（缺口，现场核对）──────────────────────────────────────
 *   本仓已有**六个面各自报「此刻有什么」**：
 *     · `plan.candidates()`        人物想做但还没做的事（含受挫重决策）
 *     · `opportunity`              此刻可参与的窗口（含窗口时长与忽略后果）
 *     · `currents`                 暗流本体（含 advanceAtRound 到期自动推进）
 *     · `foreshadows`              承诺何时该回收（waiting/developing）
 *     · `beat-facade.status()/blocked()`  拍引擎家族的启用态与「本刻谁在卡」
 *     · `worldReader.snapshot()`   世界状态的统一读出（v2.405.0）
 *   但**没有任何一处把它们排成「接下来这一幕该演什么」**。后果实测：
 *   六个面都开着的长局里，正文仍然是「有读数、没调度」——模型每轮只能各自
 *   挑一条（通常挑最显眼的那条），于是「暗流到期了但被窗口盖住」「伏笔该回
 *   收了但候选步更急」这类冲突，从来没被任何一行代码看到过。
 *
 * ── 本模块做三件事，**一件世界写入都不做** ────────────────────────
 *   ① `agenda(opt)`   —— 把六个面的读数归一成**候选条目**，每条带
 *      `kind / who / what / urgency / why`。urgent = 有到期日/已到期/受挫在等。
 *   ② `rank(opt)`     —— 排期：按 urgency 分档（overdue > due > soon > idle），
 *      同档内按「谁也等不了」的硬性顺序（到期暗流 > 伏笔回收 > 受阻计划 >
 *      机会窗口 > 候选步），并**如实标注被压下的条目与理由**（`suppressed`）。
 *      排序不做「取前 N 就完事」——压下的那些必须可见，否则又是静默丢弃。
 *   ③ `buildBlock(opt)` —— 注入面：把排期结果出成一段**建议**（不是命令），
 *      明写「这是建议，不是已经发生的事」，并列出被压下的条目。
 *
 * ── 九条否定式边界（本模块存在的全部理由）───────────────────────
 *   ① 总开关默认关闭，关闭时三个口一律空转（agenda 报 disabled / buildBlock 空串）。
 *   ② **零 store 写**：全文没有一处 `store.transact`，对 store 只有只读。
 *   ③ **零模型调用**：排期是**本地确定性排序**，不花一次 token。为什么不让模型排：
 *      排期必须在注入前就算好，而模型调用是异步且可能失败的；用模型排期会让
 *      「这一轮该演什么」取决于通道是否通 —— 那是把叙事节奏押在网络上。
 *   ④ **不改任何引擎的状态**：不替 plan 推进步、不替 currents 推进阶段、
 *      不替 foreshadows 标记回收。本模块只**读**，动作永远由原引擎做。
 *   ⑤ **不发明条目**：六个面读不到的项一律不多造一条（「该演点什么」永不由
 *      本模块编）。所有条目都带 `why`（来自哪个面、哪个字段）。
 *   ⑥ **压下的必须可见**：`suppressed` 与 `picked` 同批返回，且 buildBlock 也列出。
 *      只给前 N 条等于让「暗流到期被盖住」这件事继续隐形。
 *   ⑦ 读数失败**如实标 unknown**，不当 0 也不当空：某面抛异常时报 `faces[x]='error'`，
 *      该面的条目就不出现（缺读 != 没有）。
 *   ⑧ 条目数有硬上限（maxItems），超出**如实报 dropped**，不静默截断。
 *   ⑨ 零落盘：排期结果只经返回值传递，不进 store、不写 localStorage。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_director_settings_v1';
  // v2.407.0 主线D（GM调度引擎1.98 的 WorldAxis 版）：事件桶/冷却/落地窗口/顺延。
  // 只借「调度纪律」，不搬事件池内容、不做随机抽签、不写任何状态。
  //  · bucket      条目归桶（current/foreshadow/plan/opening），同桶按冷却错开
  //  · cooldown    同一 who 在 minGap 轮内不重复占首位（确定性，不抽签）
  //  · landWindow  只标「此刻是否适合落地」，不改条目、不替引擎推进
  //  · deferred    被冷却/窗口顺延的条目进 deferred（=压下项，必须可见）
  //  · forced      urgency=overdue 且带 due 的条目可越过冷却（强制注入，但仍只建议）
  const DEF = { enabled: false, maxItems: 6, minGap: 1, includeBlocked: true,
    cooldownRounds: 2, landWindow: true, forcedOverdue: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'director' };
  const __stat = { agendas: 0, blocks: 0, lastPicked: 0, lastSuppressed: 0, lastAt: 0, faults: {} };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try { return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {})); }
    catch (e) { return Object.assign({}, DEF); }
  }

  function fault(face, e) {
    __stat.faults[face] = String(e && e.message || e).slice(0, 120);
  }

  // ── ① agenda：六面归一成候选条目（纯只读、零模型） ──
  // urgency 四档：overdue（已过期/已该回收）/ due（本刻到期）/ soon（临近）/
  // idle（只是「有事可做」，没有时点压力）。
  function agenda(opt) {
    const o = opt || {};
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    const s = (function () { try { return WA.store.get() || {}; } catch (e) { fault('store', e); return {}; } })();
    const round = typeof o.round === 'number' ? o.round
      : (typeof s.round === 'number' ? s.round : 0);
    const items = [];
    const faces = {};

    // 面1：暗流到期（currents.advanceAtRound）——「谁等不了」里最硬的一档。
    try {
      const currents = Array.isArray(s.currents) ? s.currents : [];
      let n = 0;
      currents.forEach(function (c) {
        if (!c || !c.title) return;
        if (c.stage === 'resolved' || c.stage === 'ended' || c.endedAt) return;
        const adv = (typeof c.advanceAtRound === 'number') ? c.advanceAtRound : null;
        if (adv === null) return;
        let urgency = 'idle';
        if (round > adv) urgency = 'overdue';
        else if (round === adv) urgency = 'due';
        else if (adv - round <= 2) urgency = 'soon';
        if (urgency === 'idle') return;
        items.push({ kind: 'current', who: c.title, what: '这条暗流该推进了（阶段 ' + (c.stage || '?') + '）',
          urgency: urgency, due: adv, why: 'currents.advanceAtRound=' + adv + ' / round=' + round, id: c.id || c.title });
        n++;
      });
      faces.currents = n;
    } catch (e) { fault('currents', e); faces.currents = 'error'; }

    // 面2：伏笔该回收（foreshadows waiting/developing 带 dueRound 或超期）
    try {
      const fs = Array.isArray(s.foreshadows) ? s.foreshadows : [];
      let n = 0;
      fs.forEach(function (f) {
        if (!f || !f.text) return;
        if (f.status !== 'waiting' && f.status !== 'developing') return;
        const due = (typeof f.dueRound === 'number') ? f.dueRound : null;
        if (due === null) return;
        let urgency = 'idle';
        if (round > due) urgency = 'overdue';
        else if (round === due) urgency = 'due';
        else if (due - round <= 2) urgency = 'soon';
        if (urgency === 'idle') return;
        items.push({ kind: 'foreshadow', who: f.text.slice(0, 40), what: '这个承诺该回收了（' + f.status + '）',
          urgency: urgency, due: due, why: 'foreshadows.dueRound=' + due + ' / round=' + round, id: f.id || '' });
        n++;
      });
      faces.foreshadows = n;
    } catch (e) { fault('foreshadows', e); faces.foreshadows = 'error'; }

    // 面3：受阻/受挫的计划（plan.candidates）——受挫在等 = 有人被卡住。
    try {
      let cands = [];
      if (WA.plan && typeof WA.plan.candidates === 'function') cands = WA.plan.candidates() || [];
      if (cands && !Array.isArray(cands) && Array.isArray(cands.list)) cands = cands.list;
      let n = 0;
      (Array.isArray(cands) ? cands : []).forEach(function (c) {
        if (!c) return;
        const blocked = c.blocked || c.state === 'blocked' || c.tries > 0;
        if (blocked && !settings().includeBlocked) return;
        items.push({ kind: 'plan', who: String(c.person || c.who || c.id || ''), what: blocked ? '这一步受阻了，等他决定改走哪条路' : '这个人打算接着做下一步',
          urgency: blocked ? 'due' : 'idle', due: null, why: 'plan.candidates' + (blocked ? '（受阻）' : ''), id: c.id || '' });
        n++;
      });
      faces.plan = n;
    } catch (e) { fault('plan', e); faces.plan = 'error'; }

    // 面4：机会窗口（opportunity.openings）
    try {
      const op = (s.opportunity && Array.isArray(s.opportunity.openings)) ? s.opportunity.openings : [];
      let n = 0;
      op.forEach(function (x) {
        if (!x) return;
        if (x.status === 'closed' || x.taken) return;
        items.push({ kind: 'opening', who: String(x.title || x.about || '一个窗口'), what: '此刻有一个可参与的窗口',
          urgency: 'soon', due: null, why: 'opportunity.openings', id: x.id || '' });
        n++;
      });
      faces.opportunity = n;
    } catch (e) { fault('opportunity', e); faces.opportunity = 'error'; }

    // 面5：拍家族在卡（beat-facade.blocked()）——只是读数，不带条目（避免编）
    try {
      if (WA.beatFacade && typeof WA.beatFacade.blocked === 'function') {
        const b = WA.beatFacade.blocked();
        faces.beat = (b && (b.text || b.reason)) ? String(b.text || b.reason).slice(0, 80) : '';
      } else faces.beat = 'absent';
    } catch (e) { fault('beat', e); faces.beat = 'error'; }

    // 面6：世界读数（worldReader.snapshot）——只取脉搏与计数，不当条目
    try {
      if (WA.worldReader && typeof WA.worldReader.snapshot === 'function') {
        const sn = WA.worldReader.snapshot({ peopleCap: 0, currentCap: 0 });
        faces.world = (sn && sn.pulse) ? (sn.pulse.trend || 'steady') : '';
      } else faces.world = 'absent';
    } catch (e) { fault('world', e); faces.world = 'error'; }

    __stat.agendas++;
    __stat.lastAt = (WA.clock && WA.clock.now ? WA.clock.now('director') : Date.now());
    return { ok: true, round: round, items: items, faces: faces, faults: Object.assign({}, __stat.faults) };
  }

  // ── ② rank：确定性排期（主线D：桶/冷却/落地窗口/顺延/强制注入）──────
  // 三段：① urgency+kind 排序 → ② 同 who 冷却与落地窗口判定，顺延项进 deferred
  //       → ③ 容量切分，超出进 suppressed。deferred 与 suppressed 都必须在返回里可见。
  function rank(opt) {
    const a = agenda(opt);
    if (!a.ok) return a;
    const ur = { overdue: 0, due: 1, soon: 2, idle: 3 };
    const kr = { current: 0, foreshadow: 1, plan: 2, opening: 3 };
    const all = a.items.slice().sort(function (x, y) {
      const du = (ur[x.urgency] === undefined ? 9 : ur[x.urgency]) - (ur[y.urgency] === undefined ? 9 : ur[y.urgency]);
      if (du) return du;
      const dk = (kr[x.kind] === undefined ? 9 : kr[x.kind]) - (kr[y.kind] === undefined ? 9 : kr[y.kind]);
      if (dk) return dk;
      if (typeof x.due === 'number' && typeof y.due === 'number' && x.due !== y.due) return x.due - y.due;
      if (typeof x.due === 'number') return -1;
      if (typeof y.due === 'number') return 1;
      return String(x.who || '').localeCompare(String(y.who || ''));
    });
    const gap = Math.max(0, Number(settings().cooldownRounds) || 0);
    const forced = !!settings().forcedOverdue;
    const windowed = !!settings().landWindow;
    const round = a.round;
    // 冷却表：来自 opt（调用方可给「上一轮谁已演过」），本模块自己不落盘、不记历史。
    const lastSeen = (opt && opt.lastSeen && typeof opt.lastSeen === 'object') ? opt.lastSeen : {};
    const eligible = [];
    const deferred = [];
    const seenThisRound = {};
    all.forEach(function (x) {
      const bucket = x.kind || 'opening';
      const who = String(x.who || x.id || '');
      const item = Object.assign({}, x, { bucket: bucket });
      // 落地窗口：有 due 的条目在 due 之前只标「窗口未到」，不删除、不改状态。
      if (windowed && typeof x.due === 'number' && x.due > round) item.landWindow = 'not-yet';
      else item.landWindow = 'open';
      const last = typeof lastSeen[who] === 'number' ? lastSeen[who] : -1;
      const cooling = gap > 0 && last >= 0 && (round - last) < gap;
      const isForced = forced && x.urgency === 'overdue' && typeof x.due === 'number';
      if (cooling && !isForced) {
        deferred.push(Object.assign({}, item, { deferredBecause: 'cooldown-' + gap, lastSeen: last }));
        return;
      }
      if (isForced && cooling) item.forced = true;
      // 同桶去重：同一轮里同一个 who 不重复占两条（第二次顺延，仍可见）。
      const bk = bucket + '|' + who;
      if (seenThisRound[bk]) {
        deferred.push(Object.assign({}, item, { deferredBecause: 'same-bucket-duplicate' }));
        return;
      }
      seenThisRound[bk] = 1;
      eligible.push(item);
    });
    const cap = Math.max(1, Number(settings().maxItems) || DEF.maxItems);
    const picked = eligible.slice(0, cap);
    const suppressed = eligible.slice(cap).map(function (x) {
      return Object.assign({}, x, { suppressedBecause: 'director-capacity-' + cap });
    });
    __stat.lastPicked = picked.length;
    __stat.lastSuppressed = suppressed.length + deferred.length;
    return {
      ok: true, round: a.round, picked: picked, suppressed: suppressed, deferred: deferred,
      dropped: suppressed.length + deferred.length, faces: a.faces, faults: a.faults,
      sourceCount: all.length, eligibleCount: eligible.length, capacity: cap,
      buckets: picked.reduce(function (m, x) { m[x.bucket] = (m[x.bucket] || 0) + 1; return m; }, {})
    };
  }

  // ── ③ buildBlock：把排期作为建议注入，明确建议与事实的边界 ──
  function buildBlock(opt) {
    if (!settings().enabled) return '';
    const r = rank(opt);
    if (!r.ok) return '';
    if (!r.picked.length && !r.suppressed.length && !r.deferred.length) return '';
    const out = [];
    out.push('【导演排期建议】以下是根据当前世界读数整理的建议，不是已经发生的事实，也不是对玩家的强制命令。');
    if (r.picked.length) {
      out.push('优先考虑：');
      r.picked.forEach(function (x, i) {
        const tag = (x.forced ? '·强制注入' : '') + (x.landWindow === 'not-yet' ? '·落地窗口未到' : '');
        out.push((i + 1) + '. [' + x.urgency + '/' + x.bucket + tag + '] ' + x.who + '：' + x.what + '（依据：' + x.why + '）');
      });
    }
    if (r.deferred.length) {
      out.push('顺延（冷却/落地窗口，未丢弃）：');
      r.deferred.forEach(function (x) {
        out.push('· ' + x.who + '：' + x.what + '（顺延原因：' + x.deferredBecause + '；依据：' + x.why + '）');
      });
    }
    if (r.suppressed.length) {
      out.push('暂压但仍需留意：');
      r.suppressed.forEach(function (x) {
        out.push('· ' + x.who + '：' + x.what + '（暂压原因：' + x.suppressedBecause + '；依据：' + x.why + '）');
      });
    }
    out.push('排期只提供候选顺序；是否采用、如何演绎，仍由当前流程和玩家决定。');
    __stat.blocks++;
    return out.join('\n');
  }

  function view() {
    return { settings: settings(), stat: Object.assign({}, __stat), lastAt: __stat.lastAt };
  }

  WA.director = {
    agenda: agenda, rank: rank, buildBlock: buildBlock, view: view,
    getSettings: function () { return settings(); },
    setSettings: function (patch) {
      if (!WA.settingsBus) return { ok: false, reason: 'settings-bus-absent' };
      try {
        const next = WA.settingsBus.normalize(__REG, Object.assign({}, DEF, settings(), patch || {}));
        WA.settingsBus.saveOrThrow(__REG, next);
        return { ok: true, settings: settings() };
      } catch (e) { return { ok: false, reason: 'save-failed', error: String(e && e.message || e) }; }
    },
    stat: function () { return Object.assign({}, __stat, { faults: Object.assign({}, __stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/director.js', { kind: 'engine', ver: '2.407.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/director 已加载（2.407.0）');
})();