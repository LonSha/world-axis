/**
 * WorldAxis engines/parallel-world.js (v0.1)
 * 平行世界：主线之外的独立世界推演 —— NPC 档案 + 关系网 + 事件模块（影响分级）
 * 缝合来源：狐神抚 V19.5「平行世界」模块（六大审查协议改写为本引擎推进提示词）。
 * 与 backstage（主线结算）互为镜像：backstage 结算"已经发生"，本引擎推演"此刻别处正在发生"。
 * 独立性铁律：平行世界不依赖主线正文也能运转；注入侧只放 high/critical 事件（防主线中心漂移）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const IMPACTS = ['none', 'low', 'mid', 'high', 'critical'];
  const IMPACT_LABEL = { none: '无影响', low: '轻微', mid: '中等', high: '重大', critical: '致命' };
  const INJECT_MIN_IMPACT = 'high'; // 注入主线门槛（源卡 impactMode=strong 口径：只放高影响）
  const CAP_NPCS = 24;      // 平行世界 NPC 档案环形容量
  const CAP_RELATIONS = 120;
  const CAP_MODULES = 80;   // 事件模块总量（注入只取最新 slice）
  const CAP_SNAPSHOTS = 12; // v2.35.0: 平行世界子树快照环形（不含设置）
  const INJECT_MODULE_SHOW = 5;  // 注入块事件条数上限
  const AUTO_MODES = ['manual', 'per_turn', 'every_n', 'dice'];
  const LS_KEY = 'worldaxis_parallel_settings_v1';
  const PW_DEF = { enabled: false, autoMode: 'manual', autoInterval: 5, diceEnabled: false, detailLevel: 'normal' };
  const PW_BOUNDS = { autoInterval: [1, 50] };
  const __PWR = { key: LS_KEY, def: PW_DEF, bounds: PW_BOUNDS, module: 'parallelWorld' };

  function loadSettings() { try { return WA.settingsBus ? WA.settingsBus.read(__PWR) : null; } catch (e) { return null; } }
  function saveSettings(s) {
    try { if (WA.settingsBus) return WA.settingsBus.saveOrThrow(__PWR, s); } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
    return { ok: false, reason: 'settingsBus 未装载' };
  }
  function effSettings() {
    const s = loadSettings() || {};
    const d = PW_DEF;
    const interval = WA.settingsBus ? WA.settingsBus.clampNum(s.autoInterval, d.autoInterval, 1, 50) : d.autoInterval;
    return {
      enabled: WA.settingsBus ? WA.settingsBus.toBool(s.enabled, false) : false,
      autoMode: AUTO_MODES.indexOf(s.autoMode) >= 0 ? s.autoMode : d.autoMode,
      autoInterval: interval,
      diceEnabled: WA.settingsBus ? WA.settingsBus.toBool(s.diceEnabled, false) : false,
      detailLevel: s.detailLevel === 'brief' || s.detailLevel === 'rich' ? s.detailLevel : d.detailLevel
    };
  }

  function uid(p) { try { return WA.rand.id(p, 4, 'id'); } catch (e) { return p + '_' + (clockWall() % 1e9) + '_' + (WA.rand ? WA.rand.int(0, 99999) : (clockWall() % 100000)); } }

  // ── 消息源（与 backstage.recentText 同口径：最近 N 楼，玩家/正文标注）──
  function recentText(n) {
    let chat = [];
    try {
      if (WA.mainWin && WA.mainWin.SillyTavern && WA.mainWin.SillyTavern.getContext) {
        const ctx = WA.mainWin.SillyTavern.getContext();
        chat = (ctx && ctx.chat) || [];
      }
    } catch (e) {}
    return chat.slice(Math.max(0, chat.length - (n || 6))).map(function (m) {
      const who = m.is_user ? '【玩家】' : '【' + (m.name || '正文') + '】';
      return who + String(m.mes || m.content || '').slice(0, 900);
    }).join('\n---\n');
  }

  function pwState() {
    const s = WA.store.get();
    const pw = s.parallelWorld;
    if (!pw) return null;
    return { clock: pw.clock || '', npcs: pw.npcs || [], relations: pw.relations || [], modules: pw.modules || [], round: pw.round || 0 };
  }

  // v2.35.0: 只快照平行世界子树（clock/npcs/relations/modules/round），不含 settings、不含 snapshots 自身。
  function clonePwCore(pw) {
    const src = pw || {};
    try {
      return JSON.parse(JSON.stringify({
        clock: src.clock || '',
        npcs: Array.isArray(src.npcs) ? src.npcs : [],
        relations: Array.isArray(src.relations) ? src.relations : [],
        modules: Array.isArray(src.modules) ? src.modules : [],
        round: src.round || 0
      }));
    } catch (e) {
      return { clock: '', npcs: [], relations: [], modules: [], round: 0 };
    }
  }
  function saveSnapshot(label) {
    const st = pwState() || { round: 0 };
    const name = String(label == null ? '' : label).trim().slice(0, 40) || ('快照 第' + (st.round || 0) + '轮');
    const r = WA.store.transact(function (draft) {
      draft.parallelWorld = draft.parallelWorld || { clock: '', npcs: [], relations: [], modules: [], round: 0, snapshots: [] };
      if (!Array.isArray(draft.parallelWorld.snapshots)) draft.parallelWorld.snapshots = [];
      const core = clonePwCore(draft.parallelWorld);
      draft.parallelWorld.snapshots.push({
        id: uid('pwsp'), label: name, at: clockNow('parallel'),
        round: core.round, clock: core.clock,
        npcs: core.npcs, relations: core.relations, modules: core.modules
      });
      if (WA.evict) WA.evict.array(draft.parallelWorld.snapshots, 'parallelWorld.snapshots');
      else if (draft.parallelWorld.snapshots.length > CAP_SNAPSHOTS) {
        draft.parallelWorld.snapshots = draft.parallelWorld.snapshots.slice(-CAP_SNAPSHOTS);
      }
    });
    return (r && r.ok) ? { ok: true } : { ok: false, reason: String((r && r.error) || 'store-fail') };
  }
  function listSnapshots() {
    const s = WA.store.get();
    return ((s && s.parallelWorld && s.parallelWorld.snapshots) || []).slice();
  }
  function restoreSnapshot(id) {
    const snap = listSnapshots().find(function (x) { return x && x.id === id; });
    if (!snap) return { ok: false, reason: 'not-found' };
    const r = WA.store.transact(function (draft) {
      draft.parallelWorld = draft.parallelWorld || { clock: '', npcs: [], relations: [], modules: [], round: 0, snapshots: [] };
      const keep = (draft.parallelWorld.snapshots || []).slice();
      const core = clonePwCore(snap);
      draft.parallelWorld.clock = core.clock;
      draft.parallelWorld.npcs = core.npcs;
      draft.parallelWorld.relations = core.relations;
      draft.parallelWorld.modules = core.modules;
      draft.parallelWorld.round = core.round;
      draft.parallelWorld.snapshots = keep;
    });
    return (r && r.ok) ? { ok: true } : { ok: false, reason: 'store-fail' };
  }
  function dropSnapshot(id) {
    const r = WA.store.transact(function (draft) {
      if (!draft.parallelWorld) return false;
      draft.parallelWorld.snapshots = (draft.parallelWorld.snapshots || []).filter(function (x) { return x.id !== id; });
    });
    return (r && r.ok) ? { ok: true } : { ok: false, reason: 'none' };
  }

  // ── 推进提示词（六大审查协议：事实锚定 / NPC延续 / 独立性 / 自然互动 / 因果分级 / 输出合规）──
  function buildPrompt(state) {
    const st = state || pwState() || { clock: '', npcs: [], relations: [], modules: [], round: 0 };
    const detail = effSettings().detailLevel;
    const words = detail === 'brief' ? '80-200字' : detail === 'rich' ? '200-500字' : '100-300字';
    const npcLines = (st.npcs || []).slice(0, 12).map(function (n) {
      const kb = Object.values(n.knowledge || {}).filter(Boolean).join('；');
      return '- ' + n.name + '（情绪' + (n.emotionLevel != null ? n.emotionLevel : '?') + '/态度' + (n.attitudeLevel != null ? n.attitudeLevel : '?') +
        '）当前想法:' + (n.CURRENT_THOUGHT || '未知') + ' | 短期目标:' + (n.SHORT_TERM_GOAL || '无') + ' | 长期目标:' + (n.LONG_TERM_GOAL || '无') +
        (kb ? ' | 认知:' + kb : '');
    }).join('\n');
    const relLines = (st.relations || []).slice(0, 30).map(function (r) { return r.from + '→' + r.to + ':' + (r.type || '无'); }).join('；');
    const recentMod = (st.modules || []).slice(-4).map(function (m) { return '[' + m.impact_level + '] ' + m.title + '：' + (m.detail || '').slice(0, 60); }).join('\n');
    return '你是「平行世界」推演器。主线之外，世界在独立运转：NPC 按自己的欲望与恐惧行动，事件按自己的因果发展。主角不在场，也不是中心。\n' +
      '【世界时间锚】' + (st.clock || '未设定（沿用上轮时间，禁止使用现实日期）') + '\n' +
      '【现有NPC档案】\n' + (npcLines || '（尚无档案——从主线背景中自然衍生 2-4 个关键NPC）') + '\n' +
      '【关系网】' + (relLines || '（无）') + '\n' +
      '【最近平行事件】\n' + (recentMod || '（无）') + '\n' +
      '【主线最近进展（仅作背景，不得让平行事件围绕主角发生）】\n' + (recentText(6).slice(-1600) || '（主线尚无可读内容——纯世界演化）') + '\n' +
      '【推进前审查（逐条自检，仅内部思考，不得输出）】\n' +
      '1. 事实锚定：不改动已结算硬事实；时间锚自然推进，主线未推进则停留或微移。\n' +
      '2. NPC延续：每个NPC的情绪/态度/目标须有因由地演化；认知只分五类——确认/传言/推测/误认/讳言；NPC 不得知道它不该知道的事。\n' +
      '3. 独立性：事件由 NPC 的动机与既有因果触发，禁止"为衬托主角"或"替下轮主线埋伏笔"而硬造事件。\n' +
      '4. 自然互动：关系联动须符合双方人设；允许无互动（各自安好也是推进）；禁止硬凑相遇。\n' +
      '5. 因果与影响分级：每条事件独立判定 impact_level（none/low/mid/high/critical）——只有改变该NPC人生轨迹或牵动多方势力的才是 high/critical；多数事件应为 none-low。\n' +
      '6. 输出合规：每个模块必须含 perspective（事件视角NPC）；标题≤20字；detail 按 ' + words + ' 写；不得输出审查过程，不得输出主线续写。\n' +
      '只输出 JSON：{"clock":"剧情内时间","npcs":[{"name":"","emotionLevel":0,"attitudeLevel":0,"CURRENT_THOUGHT":"","SHORT_TERM_GOAL":"","LONG_TERM_GOAL":"","knowledge":{"确认":"","传言":"","推测":"","误认":"","讳言":""}}],"relations":[{"from":"","to":"","type":""}],"modules":[{"title":"","perspective":"","detail":"","impact_level":"mid"}]}\n' +
      'npcs 只报有变化的NPC；relations 只报新增/变化的边；modules 报本轮 1-3 条平行事件。';
  }

  // ── 入账器（结构化校验 + 环形剪枝 + 认知边界五分类）──
  const KB_KEYS = ['确认', '传言', '推测', '误认', '讳言'];
  function applyAdvance(draft, r) {
    const now = clockNow('parallel');
    draft.parallelWorld = draft.parallelWorld || { clock: '', npcs: [], relations: [], modules: [], round: 0 };
    const pw = draft.parallelWorld;
    pw.round = (pw.round || 0) + 1;
    if (r.clock && typeof r.clock === 'string') pw.clock = r.clock.trim().slice(0, 60);
    (r.npcs || []).slice(0, 12).forEach(function (n) {
      if (!n || !n.name) return;
      const old = (pw.npcs || []).find(function (x) { return x.name === n.name; });
      const entry = {
        id: old ? old.id : uid('pwnc'),
        name: String(n.name).slice(0, 24),
        emotionLevel: n.emotionLevel != null ? Math.max(-5, Math.min(5, n.emotionLevel | 0)) : (old ? old.emotionLevel : 0),
        attitudeLevel: n.attitudeLevel != null ? Math.max(-5, Math.min(5, n.attitudeLevel | 0)) : (old ? old.attitudeLevel : 0),
        CURRENT_THOUGHT: String(n.CURRENT_THOUGHT || (old && old.CURRENT_THOUGHT) || '').slice(0, 120),
        SHORT_TERM_GOAL: String(n.SHORT_TERM_GOAL || (old && old.SHORT_TERM_GOAL) || '').slice(0, 120),
        LONG_TERM_GOAL: String(n.LONG_TERM_GOAL || (old && old.LONG_TERM_GOAL) || '').slice(0, 120),
        knowledge: {},
        at: now
      };
      KB_KEYS.forEach(function (k) {
        entry.knowledge[k] = String((n.knowledge && n.knowledge[k]) || (old && old.knowledge && old.knowledge[k]) || '').slice(0, 100);
      });
      if (old) pw.npcs.splice(pw.npcs.indexOf(old), 1, entry); else pw.npcs.push(entry);
    });
    // NPC 环形容量
    if (pw.npcs.length > CAP_NPCS) {
      const over = pw.npcs.slice(0, pw.npcs.length - CAP_NPCS);
      if (WA.evict) WA.evict.note('parallelWorld.npcs', over);
      pw.npcs = pw.npcs.slice(-CAP_NPCS);
      WA.log('info', '平行世界NPC容量治理：挤出 ' + over.length + ' 个（上限 ' + CAP_NPCS + '）');
    }
    // 关系网（同向边去重，新覆盖旧）
    pw.relations = pw.relations || [];
    (r.relations || []).slice(0, 20).forEach(function (e) {
      if (!e || !e.from || !e.to || e.from === e.to) return;
      const i = pw.relations.findIndex(function (x) { return x.from === e.from && x.to === e.to; });
      const edge = { from: String(e.from).slice(0, 24), to: String(e.to).slice(0, 24), type: String(e.type || '无').slice(0, 40) };
      if (i >= 0) pw.relations.splice(i, 1, edge); else pw.relations.push(edge);
    });
    if (pw.relations.length > CAP_RELATIONS) {
      const over = pw.relations.slice(0, pw.relations.length - CAP_RELATIONS);
      if (WA.evict) WA.evict.note('parallelWorld.relations', over);
      pw.relations = pw.relations.slice(-CAP_RELATIONS);
    }
    // 事件模块
    (r.modules || []).slice(0, 4).forEach(function (m) {
      if (!m || !m.title) return;
      const imp = IMPACTS.indexOf(m.impact_level) >= 0 ? m.impact_level : 'mid';
      pw.modules.push({ id: uid('pwmd'), title: String(m.title).slice(0, 40), perspective: String(m.perspective || '').slice(0, 24), detail: String(m.detail || '').slice(0, 400), impact_level: imp, at: now });
    });
    if (pw.modules.length > CAP_MODULES) {
      const over = pw.modules.slice(0, pw.modules.length - CAP_MODULES);
      if (WA.evict) WA.evict.note('parallelWorld.modules', over);
      pw.modules = pw.modules.slice(-CAP_MODULES);
    }
    return pw;
  }

  // ── 注入块（只放 high/critical：主线之外的剧透只准以"后果"形式渗回主线）──
  function buildParallelBlock() {
    const st = pwState();
    if (!st) return '';
    const hot = (st.modules || []).filter(function (m) {
      return IMPACTS.indexOf(m.impact_level) >= IMPACTS.indexOf(INJECT_MIN_IMPACT);
    }).slice(-INJECT_MODULE_SHOW);
    if (!hot.length) return '';
    const lines = hot.map(function (m) {
      return '· ' + m.title + '（' + IMPACT_LABEL[m.impact_level] + '）' + (m.perspective ? '〔' + m.perspective + '视角〕' : '') + '：' + (m.detail || '').slice(0, 120);
    });
    const heads = (st.npcs || []).slice(0, 6).map(function (n) { return n.name; });
    let block = '<world_axis_parallel>\n主线之外正在发生：\n' + lines.join('\n') + '\n';
    if (heads.length) block += '【平行世界活跃人物】' + heads.join('、') + '\n';
    block += '〔呈现代入〕平行事件只能以传闻/后果/人物状态变化形式影响主线叙述，禁止NPC直接说出平行世界细节。';
    return block + '\n</world_axis_parallel>';
  }

  // ── 自动触发判定（after 链调用）──
  function shouldAuto() {
    const cfg = effSettings();
    if (!cfg.enabled || cfg.autoMode === 'manual') return false;
    if (cfg.autoMode === 'per_turn') return true;
    if (cfg.autoMode === 'every_n') {
      let turns = 0;
      try { turns = WA.store.read('evolution.round', 0) || 0; } catch (e) {}
      return turns > 0 && (turns % Math.max(1, cfg.autoInterval)) === 0;
    }
    if (cfg.autoMode === 'dice' && cfg.diceEnabled) {
      try {
        if (WA.rand && typeof WA.rand.dice === 'function') return WA.rand.dice(6) === 1;
        if (WA.rand && typeof WA.rand.chance === 'function') return WA.rand.chance(1 / 6);
      } catch (e) {}
      return false;
    }
    return false;
  }

  // ── 串行推进链（防并发重入；失败不落账）──
  let running = false;
  const __stat = { advances: 0, failed: 0, notConfigured: 0, lastAt: 0, lastErr: '' };
  function advance(reason) {
    if (running) return Promise.resolve({ ok: false, reason: 'busy' });
    const cfg = effSettings();
    if (!cfg.enabled) return Promise.resolve({ ok: false, reason: 'disabled' });
    running = true;
    const startedAt = clockWall();
    return (async function () {
      let res = null;
      try {
        const parsed = await WA.apiRouter.call('inference', [
          { role: 'system', content: '你是平行世界推演器。只输出 JSON。' },
          { role: 'user', content: buildPrompt() }
        ], { json: true, maxTokens: 2200, temperature: 0.8 });
        if (parsed && typeof parsed === 'object') {
          // apiRouter call(json) 已解析；个别网关多包一层 content 时兜底
          if (!parsed.clock && !parsed.npcs && !parsed.modules && typeof parsed.content === 'string') {
            try { parsed = JSON.parse(parsed.content); } catch (e) {}
          }
          if (parsed.clock || (parsed.npcs && parsed.npcs.length) || (parsed.modules && parsed.modules.length)) {
            const r2 = WA.store.transact(function (draft) { applyAdvance(draft, parsed); });
            res = (r2 && r2.ok)
              ? { ok: true, reason: reason, modules: (parsed.modules || []).length, npcs: (parsed.npcs || []).length }
              : { ok: false, reason: 'store-' + String((r2 && r2.error) || '?') };
            if (res.ok) { __stat.advances++; WA.log('info', '平行世界推进（' + reason + '）：模块' + res.modules + ' / NPC' + res.npcs); }
          } else { res = { ok: false, reason: 'empty-response' }; }
        } else { res = { ok: false, reason: 'bad-response' }; }
      } catch (e) {
        const kind = (e && e.kind) || 'error';
        if (kind === 'not-configured') __stat.notConfigured++;
        __stat.failed++;
        __stat.lastErr = kind + ':' + String((e && e.message) || e).slice(0, 120);
        res = { ok: false, reason: kind };
        WA.log('warn', '平行世界推进失败（' + reason + '）：' + __stat.lastErr);
      } finally {
        running = false; __stat.lastAt = startedAt;
      }
      return res;
    })();
  }

  // ── 手动编辑（面板录入，不走推演）──
  function addNpc(o) {
    o = o || {};
    if (!o.name || !String(o.name).trim()) return { ok: false, reason: 'no-name' };
    const r = WA.store.transact(function (draft) {
      draft.parallelWorld = draft.parallelWorld || { clock: '', npcs: [], relations: [], modules: [], round: 0 };
      const pw = draft.parallelWorld;
      const old = pw.npcs.find(function (x) { return x.name === o.name; });
      const kb = {}; KB_KEYS.forEach(function (k) { kb[k] = String((o.knowledge && o.knowledge[k]) || (old && old.knowledge && old.knowledge[k]) || ''); });
      const entry = { id: old ? old.id : uid('pwnc'), name: String(o.name).trim().slice(0, 24),
        emotionLevel: o.emotionLevel != null ? Math.max(-5, Math.min(5, o.emotionLevel | 0)) : (old ? old.emotionLevel : 0),
        attitudeLevel: o.attitudeLevel != null ? Math.max(-5, Math.min(5, o.attitudeLevel | 0)) : (old ? old.attitudeLevel : 0),
        CURRENT_THOUGHT: String(o.CURRENT_THOUGHT || (old && old.CURRENT_THOUGHT) || ''),
        SHORT_TERM_GOAL: String(o.SHORT_TERM_GOAL || (old && old.SHORT_TERM_GOAL) || ''),
        LONG_TERM_GOAL: String(o.LONG_TERM_GOAL || (old && old.LONG_TERM_GOAL) || ''),
        knowledge: kb, at: clockNow('parallel') };
      if (old) pw.npcs.splice(pw.npcs.indexOf(old), 1, entry); else pw.npcs.push(entry);
    });
    return (r && r.ok) ? { ok: true } : { ok: false, reason: String((r && r.error) || 'store-fail') };
  }
  function removeNpc(name) {
    const r = WA.store.transact(function (draft) {
      if (!draft.parallelWorld) return false;
      draft.parallelWorld.npcs = (draft.parallelWorld.npcs || []).filter(function (x) { return x.name !== name; });
      draft.parallelWorld.relations = (draft.parallelWorld.relations || []).filter(function (x) { return x.from !== name && x.to !== name; });
    });
    return (r && r.ok) ? { ok: true } : { ok: false, reason: 'none' };
  }
  function dropModule(id) {
    const r = WA.store.transact(function (draft) {
      if (!draft.parallelWorld) return false;
      draft.parallelWorld.modules = (draft.parallelWorld.modules || []).filter(function (m) { return m.id !== id; });
    });
    return (r && r.ok) ? { ok: true } : { ok: false, reason: 'none' };
  }

  const pw = WA.parallelWorld = {
    IMPACTS: IMPACTS, IMPACT_LABEL: IMPACT_LABEL, INJECT_MIN_IMPACT: INJECT_MIN_IMPACT,
    CAP_NPCS: CAP_NPCS, CAP_RELATIONS: CAP_RELATIONS, CAP_MODULES: CAP_MODULES, CAP_SNAPSHOTS: CAP_SNAPSHOTS,
    AUTO_MODES: AUTO_MODES, LS_KEY: LS_KEY, KB_KEYS: KB_KEYS,
    getSettings: loadSettings, effectiveSettings: effSettings,
    setSettings(o) {
      o = o || {};
      const cur = loadSettings() || {};
      const next = Object.assign({}, cur);
      ['enabled', 'autoMode', 'autoInterval', 'diceEnabled', 'detailLevel'].forEach(function (k) { if (o[k] !== undefined) next[k] = o[k]; });
      // 写入即归一（regional v2.7.0 口径）：非法枚举不落盘、保留旧值——否则磁盘长出
      // 引擎认不出的值，下次 effSettings 回退到 def 而非用户的既有选择，静默漂移。
      if (o.autoMode !== undefined && AUTO_MODES.indexOf(o.autoMode) < 0) next.autoMode = cur.autoMode;
      if (o.detailLevel !== undefined && o.detailLevel !== 'brief' && o.detailLevel !== 'rich' && o.detailLevel !== 'normal') next.detailLevel = cur.detailLevel;
      return saveSettings(WA.settingsBus ? WA.settingsBus.normalize(__PWR, next) : next);
    },
    buildPrompt: buildPrompt, buildParallelBlock: buildParallelBlock,
    advance: advance, addNpc: addNpc, removeNpc: removeNpc, dropModule: dropModule,
    saveSnapshot: saveSnapshot, listSnapshots: listSnapshots, restoreSnapshot: restoreSnapshot, dropSnapshot: dropSnapshot,
    shouldAuto: shouldAuto, state: pwState,
    stat() { return { running: running, advances: __stat.advances, failed: __stat.failed, notConfigured: __stat.notConfigured, lastAt: __stat.lastAt, lastErr: __stat.lastErr }; }
  };
  try { WA.__settingsRegs = (WA.__settingsRegs || []).concat([__PWR]); } catch (e) {}

  // 注入管线：before 链注入 + after 链自动推进（同 enemies 的 before/after 分离口径）
  WA.workflow.register({
    id: 'parallel.inject', chain: 'before', order: 21, label: '平行世界注入',
    async run(ctx) {
      const cfg = effSettings();
      if (!cfg.enabled) return;
      const block = buildParallelBlock();
      if (block) ctx.injections.push({ source: '平行世界', position: 'after_last_user', depth: 3, content: block });
    }
  });
  WA.workflow.register({
    id: 'parallel.simulate', chain: 'after', order: 22, label: '平行世界推进（后台）',
    async run(ctx) {
      // v2.64.0 缺陷修复：此前此处裸调内部闭包 `effSettings()`，而导出的
      //   `WA.parallelWorld.getSettings` 是同一个只读设置口的对外名字 —— 引擎内部
      //   一律不走它，于是它成了死导出（unwired：产品与测试均零引用）。
      //   后果不是崩溃，而是**导出面与真实生效的口可以各自漂移**：门禁只钉得住
      //   「导出还在场」，钉不住「它就是真正被读的那只口」。
      //   现在本处（after 链唯一入口）经导出面读原始设置，再经 effectiveSettings
      //   归一 —— 两条口都成为真实生效路径，缺一即本模块整体不推进（回归可证）。
      const raw = WA.parallelWorld.getSettings();
      if (!raw) return;
      const cfg = WA.parallelWorld.effectiveSettings();
      if (!cfg.enabled) return;
      if (running) return;
      // 触发判定走导出面（WA.parallelWorld.shouldAuto）——shouldAuto 的真实消费方；
      // 不走内部闭包，否则它是 self-only 过度导出（门禁口径同 regional.getSettings 先例）。
      if (!WA.parallelWorld.shouldAuto()) return;
      advance('auto-' + cfg.autoMode);
    }
  });
})();