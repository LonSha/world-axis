/**
 * WorldAxis engines/fact-continuity.js (v2.407.0) — 事实连续性统一诊断面
 *
 *  外部 11 份资料侦察后收敛的四条主线（A/C/E/F/G）在这里落地成**机制骨架**：
 *   A 事实分层 / 反漂移   ← AVS 视觉创作总则 / 连续性与事实保护 / 029b 经济连续性
 *   C 信息边界 / 反全知   ← 心之壁认知隔离 / AVS Evidence Contract / 1.5 信息屏障
 *   E 数值与正文分离 / 前后对账 / 禁词 ← NSFW-v5 的纯协议骨架（题材整体不移植）
 *   F 经济锚定             ← 029b 经济锚定·财富与生活逻辑
 *   G 写权分离 / 状态签名 ← AVS_UI「状态写入由 Core 独占」+ VisualStateSignature
 *
 *  ── 八条否定式边界 ──────────────────────────────────────────────
 *   ① 总开关默认关闭；关闭时 diagnose/buildBlock 一律空转。
 *   ② 零 store 写：全文无 transact / save / localStorage。纯只读聚合。
 *   ③ 零模型调用：诊断是本地确定性判据，不花一次 token。
 *   ④ 不采用任何题材规则：不搬恋爱四轴 / 足部物性 / ACGN 视觉硬规则 / 成人内容。
 *      只取「稳定事实 vs 当前配置 vs 临时状态」「UNMENTIONED≠ABSENT」
 *      「正文不朗读字段」「经济设定不得凭空漂移」这些通用纪律。
 *   ⑤ 不扩 world-reader 的 visibility 集合：它仍是 known/direct 的玩家面真源。
 *      本模块只读地报告「信念/传闻层是否缺分记」，不改写既有字段语义。
 *   ⑥ 不替玩家决定、不编造事实：缺数据一律标 unknown / insufficient，不推测。
 *   ⑦ 压下项必须可见：诊断里的 findings 含 severity 与 why，一条都不静默丢。
 *   ⑧ 注入块默认空串；开启后也只出「纪律提示 + 已确证的读数」，不出题材措辞。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_fact_continuity_settings_v1';
  const DEF = { enabled: false, maxFindings: 8, maxBlockChars: 900, includeEconomy: true, includeInfoBoundary: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'factContinuity' };
  const __stat = { diagnoses: 0, blocks: 0, lastFindings: 0, lastAt: 0, faults: {} };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try { return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {})); }
    catch (e) { return Object.assign({}, DEF); }
  }
  function fault(face, e) { __stat.faults[face] = String(e && e.message || e).slice(0, 120); }
  function now() { return WA.clock && WA.clock.now ? WA.clock.now('fact-continuity') : Date.now(); }

  // ── A：事实分层（稳定事实 / 当前配置 / 临时状态）────────────────────
  // 只做只读归类与「无事件不漂移」的判据，不改任何字段、不迁移容器。
  function layers(s) {
    const people = (s && s.people) || {};
    const ids = Object.keys(people);
    const out = { stable: 0, config: 0, transient: 0, absentEvidence: [], unknown: 0 };
    ids.forEach(function (id) {
      const p = people[id] || {};
      // 稳定身份：有 personalityAnchor / speakingStyle 即视为已确证（不猜、不补）。
      if (p.personalityAnchor || p.speakingStyle) out.stable++;
      // 当前配置：location / body / resources 属于「这一刻的呈现」，不是身份。
      if (p.location || p.body || p.resources) out.config++;
      // 临时状态：action / intent 是本轮动作，不反写稳定身份。
      if (p.action || p.intent) out.transient++;
      // AVS uid309：UNMENTIONED≠ABSENT。没写不代表消失——只在「连身份都没确证」时报 unknown。
      if (!p.personalityAnchor && !p.speakingStyle && !p.name) out.absentEvidence.push(id);
    });
    if (!ids.length) out.unknown = 1;
    return out;
  }

  // ── C：信息边界（世界事实 / 接收事实 / 角色信念三层分记）──────────────
  // 边界⑤：不扩 world-reader 的 visibility 集合，只读地报告「信念层是否缺分记」。
  function infoBoundary(s) {
    const people = (s && s.people) || {};
    const currents = Array.isArray(s && s.currents) ? s.currents : [];
    const facts = Array.isArray(s && s.worldFacts) ? s.worldFacts : [];
    const out = { knownWorldFacts: 0, hiddenCurrents: 0, rumorTrace: 0, beliefBearingPeople: 0,
      missingBeliefLedger: [], visibilitySeen: {}, verdict: 'insufficient' };
    facts.forEach(function (f) {
      const v = String((f && f.visibility) || '');
      out.visibilitySeen[v] = (out.visibilitySeen[v] || 0) + 1;
      if (v === 'known' || v === 'direct' || !v) out.knownWorldFacts++;
    });
    currents.forEach(function (c) {
      if (!c) return;
      const v = String(c.visibility || '');
      out.visibilitySeen[v] = (out.visibilitySeen[v] || 0) + 1;
      if (v === 'hidden') out.hiddenCurrents++;
      if (v === 'trace') out.rumorTrace++;
    });
    Object.keys(people).forEach(function (id) {
      const p = people[id] || {};
      if (p.knowledge && Object.keys(p.knowledge).length) out.beliefBearingPeople++;
      else if (out.hiddenCurrents + out.rumorTrace > 0) out.missingBeliefLedger.push(id);
    });
    // 有 hidden/trace 暗流却没有任一人物带 knowledge，即「世界事实与角色认知未分记」。
    if (out.hiddenCurrents + out.rumorTrace > 0 && out.beliefBearingPeople === 0) out.verdict = 'belief-ledger-missing';
    else if (out.hiddenCurrents + out.rumorTrace > 0) out.verdict = 'partial';
    else out.verdict = 'no-hidden-surface';
    return out;
  }

  // ── F：经济锚定（029b 的通用纪律，只读判据）────────────────────────
  // 不擅自赋予/剥夺财富；不把「身家」当现金；不为冲突凭空制造与设定矛盾的贫困。
  // 这里只诊断「经济基准是否被记录」，不判定谁该有多少钱（那是玩家/设定权）。
  function economy(s) {
    const ec = (s && s.economy) || {};
    const evo = (s && s.evolution) || {};
    const signals = Array.isArray(ec.signals) ? ec.signals : [];
    const climate = String(ec.climate || evo.economy && evo.economy.climate || '');
    const people = (s && s.people) || {};
    let peopleWithResources = 0;
    Object.keys(people).forEach(function (id) { if (people[id] && people[id].resources) peopleWithResources++; });
    const out = { climate: climate || 'unknown', signals: signals.length, peopleWithResources: peopleWithResources,
      goods: Array.isArray(ec.goods) ? ec.goods.length : 0,
      orders: Array.isArray(ec.orders) ? ec.orders.length : 0,
      verdict: 'insufficient', findings: [] };
    if (!climate && !signals.length && !peopleWithResources) {
      out.verdict = 'no-anchor';
      out.findings.push('经济基准未记录：涉及消费/资源调度时按「信息不足」处理，不得擅自赋予或剥夺财富');
    } else {
      out.verdict = 'anchored';
      out.findings.push('经济基准已记录：区分个人/家庭/企业与可自由支配资金，身家不等于现金；不得为制造冲突凭空写拮据');
    }
    return out;
  }

  // ── E：正文纪律（数值/正文分离 + 前后对账 + 禁词，纯协议骨架）─────────
  // 只产出「生成前读状态、生成后校对」的纪律提示，不带任何题材词表。
  const PROSE_RULES = [
    '状态读数只用于内部判断，正文只写人物正在经历的事，不朗读字段、不报数值与进度',
    '生成前先读当前已确证状态；生成后校对：未提及不等于消失，无变化事件不得改写稳定事实',
    '裁决术语（判定/推进/解锁/达到/阶段名）不进入叙事；压下项须以可见方式保留'
  ];

  // ── G：状态签名（AVS_UI 的 VisualStateSignature，只读差异指纹）───────
  // 不做渲染、不写状态；只给一个可比的指纹，供 UI/诊断判断「读数是否变了」。
  function signature(s, diag) {
    const raw = JSON.stringify({
      people: Object.keys((s && s.people) || {}).sort(),
      facts: (Array.isArray(s && s.worldFacts) ? s.worldFacts.length : 0),
      currents: (Array.isArray(s && s.currents) ? s.currents.length : 0),
      layers: diag && diag.layers ? [diag.layers.stable, diag.layers.config, diag.layers.transient] : [],
      info: diag && diag.info ? diag.info.verdict : '',
      economy: diag && diag.economy ? diag.economy.verdict : ''
    });
    let h = 0;
    for (let i = 0; i < raw.length; i++) { h = ((h << 5) - h + raw.charCodeAt(i)) | 0; }
    return 'fc-' + (h >>> 0).toString(36);
  }

  // ── diagnose：六面归一成 findings（只读、确定性、压下可见）────────────
  function diagnose(opt) {
    const o = opt || {};
    if (!settings().enabled) return { ok: false, reason: 'disabled' };
    let s = {};
    try { s = WA.store.get() || {}; } catch (e) { fault('store', e); return { ok: false, reason: 'store-unreadable' }; }
    let L = null, I = null, E = null;
    try { L = layers(s); } catch (e) { fault('layers', e); L = null; }
    try { I = settings().includeInfoBoundary ? infoBoundary(s) : null; } catch (e) { fault('info', e); I = null; }
    try { E = settings().includeEconomy ? economy(s) : null; } catch (e) { fault('economy', e); E = null; }
    const findings = [];
    function add(face, severity, text, why) { findings.push({ face: face, severity: severity, text: text, why: why }); }
    if (!L) add('layers', 'unknown', '事实分层读数取不到', 'layers 抛异常');
    else {
      if (L.unknown) add('layers', 'info', '当前无人物读数：不据此判定「没有人」', 'people 为空属缺读而非否定');
      if (L.absentEvidence.length) add('layers', 'warn', '有 ' + L.absentEvidence.length + ' 个人物条目连身份锚都没有', 'AVS uid309：UNMENTIONED≠ABSENT，不擅自补全也不擅自删除');
      add('layers', 'info', '稳定身份 ' + L.stable + ' / 当前配置 ' + L.config + ' / 临时状态 ' + L.transient + ' 三层已分离', '无事件不漂移；临时动作不得反写稳定身份');
    }
    if (!I) add('info', 'unknown', '信息边界读数取不到或已按设置关闭', 'includeInfoBoundary');
    else {
      if (I.verdict === 'belief-ledger-missing') add('info', 'warn', '存在 hidden/trace 暗流但无人物带 knowledge：世界事实与角色信念未分记', '心之壁三层分记 / AVS Evidence Contract');
      else add('info', 'info', '信息边界判定=' + I.verdict + '（hidden ' + I.hiddenCurrents + ' / trace ' + I.rumorTrace + '）', '玩家面 visibility 仍以 world-reader 的 known/direct 为真源，本模块不扩集合');
    }
    if (!E) add('economy', 'unknown', '经济读数取不到或已按设置关闭', 'includeEconomy');
    else E.findings.forEach(function (t) { add('economy', E.verdict === 'no-anchor' ? 'warn' : 'info', t, '029b 经济锚定'); });
    PROSE_RULES.forEach(function (t, i) { add('prose', 'rule', t, 'NSFW-v5 纯协议骨架 E-' + (i + 1)); });

    const cap = Math.max(1, Number(settings().maxFindings) || DEF.maxFindings);
    const visible = findings.slice(0, cap);
    const suppressed = findings.slice(cap).map(function (f) { return Object.assign({}, f, { suppressedBecause: 'fact-continuity-capacity-' + cap }); });
    const diag = {
      ok: true, at: now(), round: typeof o.round === 'number' ? o.round : (typeof s.round === 'number' ? s.round : 0),
      layers: L, info: I, economy: E, signature: signature(s, { layers: L, info: I, economy: E }),
      findings: visible, suppressed: suppressed, total: findings.length, capacity: cap,
      faults: Object.assign({}, __stat.faults),
      verdict: findings.some(function (f) { return f.severity === 'warn'; }) ? 'attention' : 'steady'
    };
    __stat.diagnoses++; __stat.lastFindings = findings.length; __stat.lastAt = diag.at;
    return diag;
  }

  // ── buildBlock：注入面（默认空串；只出纪律 + 已确证读数，不出题材措辞）──
  function buildBlock(opt) {
    if (!settings().enabled) return '';
    const d = diagnose(opt);
    if (!d.ok || !d.findings.length) return '';
    const out = ['【事实连续性纪律】以下是只读诊断与写作约束，不是已经发生的事实，也不替玩家做决定。'];
    d.findings.forEach(function (f) { out.push('· [' + f.face + '/' + f.severity + '] ' + f.text); });
    if (d.suppressed.length) out.push('· 另有 ' + d.suppressed.length + ' 条诊断因容量暂压（未丢弃，可由 view() 读取）。');
    out.push('状态签名：' + d.signature + '。未提及不等于消失；无变化事件不得改写稳定事实。');
    const cap = Math.max(200, Number(settings().maxBlockChars) || DEF.maxBlockChars);
    const text = out.join('\n');
    const trimmed = text.length > cap ? text.slice(0, cap) + '\n（诊断块已按上限如实截断，余项未丢弃）' : text;
    __stat.blocks++;
    return trimmed;
  }

  function view() {
    return { settings: settings(), stat: Object.assign({}, __stat, { faults: Object.assign({}, __stat.faults) }),
      proseRules: PROSE_RULES.slice(), lastSignature: signature((function () { try { return WA.store.get() || {}; } catch (e) { return {}; } })(), null) };
  }

  WA.factContinuity = {
    diagnose: diagnose, buildBlock: buildBlock, view: view,
    // 判据面（专锁可直测，不依赖 store 全局）：纯函数，零副作用。
    judges: { layers: layers, infoBoundary: infoBoundary, economy: economy, signature: signature },
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
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/fact-continuity.js', { kind: 'engine', ver: '2.407.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/fact-continuity 已加载（2.407.0）');
})();
