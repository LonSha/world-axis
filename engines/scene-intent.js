/**
 * WorldAxis engines/scene-intent.js — 叙事脊柱 L1「本幕」场景意图（v2.542.2）
 *
 * 【它治的病】注入链把 165 个源逐个 push 成一份**并列事实清单**：世界很全，但没有「这一场戏」。
 *   本模块不加任何新机制、不调模型，只做一件事：把**已经存在**的排期 / 张力 / 伏笔组织成
 *   一段短而硬的「这一幕要解决什么」，作为注入的**第一项**。世界照旧由各引擎推进，本模块只组织。
 *
 * 【接口全部按 v2.541.7 现场核对，与设计稿的三处不符已就地改】
 *   ① `WA.director.rank(opt)` → `{ ok, round, picked[], deferred[], suppressed[], dropped, ... }`，
 *      条目带 `kind / who / what / urgency / due / bucket / why`。**picked 可能为空而 suppressed 非空**
 *      （超编），故兜底顺序是 picked → deferred → suppressed，设计稿漏了第三档。
 *   ② `WA.plotGauge.tension({ push:false })` → `{ ok:true, score:0~100, band }` **或**
 *      `{ ok:false, reason:'disabled'|'no-signal'|'no-reading'|'stale-round' }`；
 *      `trend()` 在脉搏不足 3 个时返回 `{ ok:false, reason:'insufficient-samples' }`
 *      —— 设计稿把这两条当「总能算出值」，照写会让新档永远落到 hold 且无人知晓，故这里逐条点名进 skipped。
 *   ③ `WA.foreshadow.track()` **不存在**（设计稿 §4.1 那一行是错的）。伏笔真源是
 *      `store.memory.foreshadows`，形状 `{ id, content, status:waiting|developing|triggered|recycled|dropped,
 *      links, at }`，挤出站点已登记 cap 30。
 *   ④ `WA.dramaticTension.getSceneTension()` 返回**标量**（默认 20.0），不是对象；而
 *      `primeChekhovGun / updateSceneTension` 全仓只有 `engines/action-desk-routes.js` 的手动路由在调
 *      ⇒ **没有人在自动装填枪**。故本版**不**把「已装填的枪」写成输入：那一支默认永远是空的，
 *      写进去就是一段看起来在跑、其实什么都不出的代码。要接它，先有自动装填方（L3 的活）。
 *
 * 【硬约束（沿用仓库纪律）】
 *   · 默认关闭（`enabled:false`）：关闭时 `buildBlock()` 返回空串 ⇒ 注入字节与 v2.541.7 逐字节一致；
 *   · 零写入：本版**不写** store（`sceneIntent.last` 推迟到 L3 与核账同批落地，避免凭空多一处挤出站点）；
 *   · 不编剧情：每一行都能指回「哪个引擎的哪个字段」，读不到就进 `skipped` 并点名，不猜、不补；
 *   · 不替任何引擎写状态：排期 / 张力 / 伏笔仍由原引擎推进。
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const VERSION = '2.542.2';
  const LS_KEY = 'worldaxis_scene_intent_settings_v1';
  const DEF = { enabled: false, maxTokens: 220, paceRules: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'sceneIntent' };
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const __stat = { composes: 0, blocks: 0, lastPace: '', lastAxis: '', lastAt: 0, faults: {} };

  function fault(face, e) { __stat.faults[face] = String((e && e.message) || e).slice(0, 120); }
  // G20 口径：唯一墙钟读取点。守卫 fallback 必须与本行共现（同一行有 WA.clock. 才算「守卫」），
  //   写成多行会让它被归为裸调。
  function clockNow(site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } }
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try { return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {})); }
    catch (e) { return Object.assign({}, DEF); }
  }
  function storeState() { try { return (WA.store && WA.store.get && WA.store.get()) || {}; } catch (e) { fault('store', e); return {}; } }
  function roundOf(s, opt) {
    if (opt && typeof opt.round === 'number') return opt.round;
    try { if (WA.evolution && typeof WA.evolution.roundOf === 'function') return WA.evolution.roundOf(s); } catch (e) {}
    try { if (s && s.evolution && typeof s.evolution.round === 'number') return s.evolution.round; } catch (e) {}
    return 0;
  }

  /** ── ① 取一条「本幕核心条目」：picked → deferred → suppressed（第三档设计稿漏了） ── */
  function pickItem(skipped) {
    if (!WA.director || typeof WA.director.rank !== 'function') { skipped.push({ face: 'director', reason: 'absent' }); return null; }
    let r;
    try { r = WA.director.rank({}); } catch (e) { fault('director', e); skipped.push({ face: 'director', reason: 'threw' }); return null; }
    if (!r || !r.ok) { skipped.push({ face: 'director', reason: (r && r.reason) || 'not-ok' }); return null; }
    const order = [['picked', r.picked], ['deferred', r.deferred], ['suppressed', r.suppressed]];
    for (let i = 0; i < order.length; i += 1) {
      const list = order[i][1];
      if (Array.isArray(list) && list.length) return { item: list[0], from: order[i][0] };
    }
    skipped.push({ face: 'director', reason: 'no-agenda' });
    return null;
  }

  /** ── ② 改变轴：只看 bucket 与既有字段，不猜 ── */
  function axisOf(item, s) {
    const b = String((item && item.bucket) || '');
    if (b === 'foreshadow') return { axis: 'knowledge', why: 'director.item.bucket=foreshadow' };
    if (b === 'plan') return { axis: 'situation', why: 'director.item.bucket=plan' };
    const who = String((item && item.who) || '');
    const p = (s && s.people && who) ? s.people[who] : null;
    const rel = p && p.profile && Array.isArray(p.profile.relations) ? p.profile.relations : null;
    if (rel && rel.length) return { axis: 'relation', why: 'people[' + who + '].profile.relations 非空' };
    return { axis: 'situation', why: 'director.item.bucket=' + (b || 'unknown') };
  }

  /** ── ③ 回收：只认 store.memory.foreshadows 里 developing 的最老一条 ── */
  function callbackOf(s, skipped) {
    const list = (s && s.memory && Array.isArray(s.memory.foreshadows)) ? s.memory.foreshadows : null;
    if (!list) { skipped.push({ face: 'foreshadows', reason: 'absent' }); return null; }
    const dev = list.filter(function (f) { return f && f.status === 'developing' && f.content; });
    if (!dev.length) { skipped.push({ face: 'foreshadows', reason: 'none-developing' }); return null; }
    // 「最老的一条」用 at（登记轮次）作代理 —— 骨架里没有 lastTouchedAt 字段，不假造一个。
    let best = dev[0];
    for (const f of dev) { if ((typeof f.at === 'number' ? f.at : 0) < (typeof best.at === 'number' ? best.at : 0)) best = f; }
    return { id: String(best.id || ''), text: String(best.content).slice(0, 40), why: 'memory.foreshadows status=developing, at=' + String(best.at) };
  }

  /** ── ④ 节奏：张力 + 走向 + 收线建议；任一层读不到就如实点名，退回 hold ── */
  const PACE_TEXT = {
    press: '加压——不要让场面松下来',
    hold: '稳住——按现在的速度推进',
    breathe: '换气——张力已经很高，给一个喘息的短场',
    release: '收线——把该收的收掉，别再开新的问题'
  };
  function paceOf(skipped) {
    const out = { pace: 'hold', why: [] };
    if (!WA.plotGauge || typeof WA.plotGauge.tension !== 'function') { skipped.push({ face: 'plotGauge', reason: 'absent' }); return out; }
    let t;
    try { t = WA.plotGauge.tension({ push: false }); } catch (e) { fault('plotGauge', e); skipped.push({ face: 'plotGauge', reason: 'threw' }); return out; }
    if (!t || !t.ok) { skipped.push({ face: 'plotGauge', reason: (t && t.reason) || 'not-ok' }); return out; }
    out.why.push('plotGauge.tension=' + t.score + '(' + (t.band || '?') + ')');
    let tr = null;
    try { tr = (typeof WA.plotGauge.trend === 'function') ? WA.plotGauge.trend() : null; } catch (e) { fault('trend', e); }
    if (tr && tr.ok) out.why.push('plotGauge.trend=' + tr.direction);
    else skipped.push({ face: 'plotGauge.trend', reason: (tr && tr.reason) || 'not-ok' });
    let adv = null;
    try { adv = (typeof WA.plotGauge.advice === 'function') ? WA.plotGauge.advice() : null; } catch (e) { fault('advice', e); }
    const ids = (adv && Array.isArray(adv.rows)) ? adv.rows.map(function (r) { return String(r && r.id || ''); }) : [];
    if (ids.length) out.why.push('plotGauge.advice=[' + ids.join(',') + ']');
    if (!settings().paceRules) { out.why.push('paceRules=false'); return out; }
    if (ids.indexOf('close-overdue') >= 0) { out.pace = 'release'; return out; }
    if (t.score >= 75 && tr && tr.ok && tr.direction === 'rising') { out.pace = 'breathe'; return out; }
    if ((tr && tr.ok && tr.direction === 'falling') || t.score <= 30) { out.pace = 'press'; return out; }
    return out;
  }

  /** ── ④-b v2.542.4（L3）三个桥接：核账 / 欠账 / 段位。任何一层缺席都不算错，逐条点名。 ── */
  function arcSettle() {
    if (!WA.arcPhase || typeof WA.arcPhase.settle !== 'function') return null;
    try { return WA.arcPhase.settle({}); } catch (e) { fault('arcPhase.settle', e); return null; }
  }
  function arcDebt() {
    if (!WA.arcPhase || typeof WA.arcPhase.debtItem !== 'function') return null;
    try { return WA.arcPhase.debtItem(); } catch (e) { fault('arcPhase.debt', e); return null; }
  }
  function arcPhaseInfo() {
    if (!WA.arcPhase || typeof WA.arcPhase.phase !== 'function') return null;
    try { return WA.arcPhase.phase({}); } catch (e) { fault('arcPhase.phase', e); return null; }
  }
  function driveStakes(target) {
    if (!WA.characterDrive || typeof WA.characterDrive.stakes !== 'function') return null;
    try { return WA.characterDrive.stakes(target); } catch (e) { fault('drive.stakes', e); return null; }
  }
  function driveLineTouch(target, text) {
    if (!WA.characterDrive || typeof WA.characterDrive.touchesLine !== 'function') return null;
    try { return WA.characterDrive.touchesLine(target, text); } catch (e) { fault('drive.line', e); return null; }
  }
  /** 段位反哺节奏（文档 §6）：rising 禁 release / resolution 优先收线 / crisis 必须有回收。 */
  function applyPhase(ph, pace, cb, skipped) {
    if (!ph) { skipped.push({ face: 'arcPhase', reason: 'absent' }); return; }
    if (!ph.ok) {
      // 它只是关着 —— 那是用户选择，不是「缺席」，不该每轮在 skipped 里点名。
      if (ph.reason !== 'disabled') skipped.push({ face: 'arcPhase', reason: ph.reason || 'not-ok' });
      return;
    }
    pace.why.push('arcPhase=' + ph.phase + '(' + ph.score + ')');
    if (ph.phase === 'rising' && pace.pace === 'release') {
      pace.pace = 'hold';
      pace.why.push('rising 禁止 release ⇒ hold');
      return;
    }
    if (ph.phase === 'resolution') { pace.pace = 'release'; pace.why.push('resolution 优先收线 ⇒ release'); return; }
    if (ph.phase === 'crisis' && !cb) skipped.push({ face: 'arcPhase', reason: 'crisis 要求回收，但无可回收伏笔' });
  }
  /** ── ⑤ 戏剧问题：从条目的 who + bucket 生成，模板固定，不编情节 ── */
  const VERB = { foreshadow: '碰回这件旧事', plan: '把这一步真的走成', current: '被这件事推着动一步', opening: '走进这个窗口' };
  function questionOf(item) {
    const who = String((item && item.who) || '').slice(0, 24);
    if (!who) return '';
    const b = String((item && item.bucket) || '');
    return who + '这一场会不会' + (VERB[b] || '真的动一步') + '？';
  }

  function compose(opt) {
    const skipped = [];
    if (!settings().enabled) return { ok: false, reason: 'disabled', skipped: skipped };
    const s = storeState();
    const round = roundOf(s, opt);
    // v2.542.4（L3）：先懒核账（比对**上一条**记录），再取本条意图 —— 顺序反了就是拿自己比自己。
    const settled = arcSettle();
    const debt = arcDebt();
    const pick = debt ? { item: debt, from: 'debt' } : pickItem(skipped);
    if (!pick) return { ok: false, reason: 'no-agenda', round: round, skipped: skipped, settled: settled };
    const item = pick.item;
    const ax = axisOf(item, s);
    const cb = callbackOf(s, skipped);
    const pace = paceOf(skipped);
    // v2.542.4（L3）：弧线段位反过来约束节奏（文档 §6）。
    const ph = arcPhaseInfo();
    applyPhase(ph, pace, cb, skipped);
    __stat.composes += 1; __stat.lastAxis = ax.axis; __stat.lastPace = pace.pace; __stat.lastAt = clockNow('scene-intent.compose');
    const change = { axis: ax.axis, target: String(item.who || ''), why: ax.why };
    // v2.542.5（L4）：碰到某人的底线 ⇒ 强制 press。只认**字面包含**（宁漏不冤）。
    const lt = driveLineTouch(change.target, String(item.what || '') + '|' + String(item.why || ''));
    if (lt && lt.hit) { pace.pace = String(lt.pace || 'press'); pace.why.push('触碰底线（' + lt.line + '）⇒ press'); }
    // v2.542.5（L4）：筹码（赌的是什么）。两侧都只有真字段才出，一个都没有就仍然是 null。
    const stakes = driveStakes(change.target);
    // v2.542.4（L3）：唯一写入点 —— 记下本条意图与**变化前的底数**（下一轮核账要用它比对）。
    //   只有 L3 开启时才写：arcPhase 关着时本模块仍然零写入（L1 的纪律不变）。
    if (WA.arcPhase && typeof WA.arcPhase.record === 'function' && WA.arcPhase.getSettings && WA.arcPhase.getSettings().enabled) {
      try { WA.arcPhase.record({ round: round, change: change, callback: cb, watch: WA.arcPhase.measure(change) }); }
      catch (e) { fault('arcPhase.record', e); }
    }
    return {
      ok: true,
      round: round,
      question: questionOf(item),
      change: change,
      phase: (ph && ph.ok) ? { phase: ph.phase, score: ph.score, rising: !!ph.rising } : null,
      settled: settled || null,
      callback: cb,
      pace: pace.pace,
      why: ['director.' + pick.from + '[0]', 'director.item.why=' + String(item.why || '').slice(0, 60)].concat(pace.why),
      item: { kind: item.kind, who: item.who, what: item.what, urgency: item.urgency, bucket: item.bucket },
      stakes: stakes || null,
      skipped: skipped
    };
  }

  const AXIS_TEXT = { knowledge: '知情变化（谁知道了什么）', relation: '关系变化（谁和谁之间变了）', situation: '处境变化（位置 / 行动 / 计划）' };
  /** ── ⑥ 注入文本：≤ maxTokens 字符（中文按 1 字≈1 token 保守截断），不含引擎名 / 字段名 ── */
  function render(c, cfg) {
    if (!c || !c.ok) return '';
    const lines = ['【本幕】这是写作意图，不是已发生的事实；不要在正文里提到它。'];
    if (c.question) lines.push('· 戏剧问题：' + c.question);
    if (c.change && c.change.axis) lines.push('· 这一幕结束时，至少有一件事要变：' + (c.change.target ? c.change.target + ' 的' : '') + (AXIS_TEXT[c.change.axis] || '处境变化'));
    if (c.callback && c.callback.text) lines.push('· 可以用上：' + c.callback.text);
    // v2.542.5（L4）：筹码行只写取得到的一侧（只有 want 就只写「争取到」，不补一句「失手：未知」）。
    if (c.stakes && (c.stakes.win || c.stakes.lose)) {
      const parts = [];
      if (c.stakes.win) parts.push(c.stakes.win);
      if (c.stakes.lose) parts.push(c.stakes.lose);
      lines.push('· 筹码：' + parts.join('；'));
    }
    const pt = PACE_TEXT[c.pace] || PACE_TEXT.hold;
    lines.push('· 节奏：' + pt);
    let text = lines.join('\n');
    const cap = Math.max(80, Math.min(400, Number(cfg && cfg.maxTokens) || DEF.maxTokens));
    if (text.length > cap) text = text.slice(0, cap - 1) + '…';
    return text;
  }

  function buildBlock(opt) {
    const cfg = settings();
    if (!cfg.enabled) return '';
    let c;
    try { c = compose(opt); } catch (e) { fault('compose', e); if (WA.log) WA.log('warn', '本幕意图合成失败', e); return ''; }
    if (!c || !c.ok) return '';
    const text = render(c, cfg);
    if (!text) return '';
    __stat.blocks += 1;
    return text;
  }

  WA.sceneIntent = {
    VERSION: VERSION,
    compose: compose,
    buildBlock: buildBlock,
    getSettings: function () { return settings(); },
    setSettings: function (patch) {
      if (!WA.settingsBus) return { ok: false, reason: 'settings-bus-absent' };
      try {
        const next = WA.settingsBus.normalize(__REG, Object.assign({}, DEF, settings(), patch || {}));
        WA.settingsBus.saveOrThrow(__REG, next);
        return { ok: true, settings: settings() };
      } catch (e) { return { ok: false, reason: 'save-failed', error: String((e && e.message) || e) }; }
    },
    stat: function () { return Object.assign({}, __stat, { faults: Object.assign({}, __stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/scene-intent.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/scene-intent 已加载（' + VERSION + '）');
})();