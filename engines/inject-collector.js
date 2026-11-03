/** v2.294.0 OPV8-1 / EXV8-1: read-only structured material projection.
 * Owner reads remain authoritative. No pending information is promoted to knowledge,
 * no intention is promoted to fact, and clocks are never converted across owners.
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const DEF = { enabled: false, maxItems: 4, maxChars: 2400, maxTokens: 0 };
  const REG = { key: 'worldaxis_inject_collector_settings_v1', def: DEF,
    module: 'injectCollector', bounds: { maxItems: [1, 12], maxChars: [400, 12000], maxTokens: [0, 12000] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([REG]);
  let last = { enabled: false, selected: 0, folded: 0, chars: 0, rows: [], faults: [] };
  // V8 EXV8-1：场景来源留痕。为什么要单独一格而不是塞进 last：
  //   「场景换了但选的一样」有两种完全不同的原因 —— ①场景输入根本没到（from='none'）；
  //   ②到了但这几条候选恰好不含在场人（relevance 全是 0）。两者修法相反，
  //   混成一个读数就只能靠猜。故把「这一轮场景从哪来」与「选了哪些」分开记。
  let lastScene = { from: 'none', people: [], place: '' };
  function settings() {
    return WA.settingsBus ? WA.settingsBus.normalize(REG, Object.assign({}, DEF, WA.settingsBus.read(REG) || {})) : Object.assign({}, DEF);
  }
  function clean(v, cap) { return String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').slice(0, cap || 240); }
  function ownerOn(name) {
    const m = WA[name];
    return m && (!m.getSettings || m.getSettings().enabled !== false);
  }
  function buildBlock(context) {
    const cfg = settings();
    if (!cfg.enabled) { last = { enabled: false, selected: 0, folded: 0, chars: 0, rows: [], faults: [] }; return ''; }
    const c = context || {}, candidates = [], faults = [];
    const max = Math.max(1, Math.min(12, Math.floor(Number(cfg.maxItems) || 4)));
    const cap = Math.max(400, Math.min(12000, Math.floor(Number(cfg.maxChars) || 2400)));
    const visibility = c.visibility || {};
    function add(owner, id, text, names, at, label) {
      if (!text) return;
      const source = { life: '人物生活', plan: '人物计划', events: '事件调度', intel: '因果与情报', bonds: '关系六型' }[owner];
      const rank = WA.injectBudget && WA.injectBudget.rankOf ? WA.injectBudget.rankOf(source) : 6;
      const wanted = Array.isArray(c.people) ? c.people : [];
      const relevant = (names || []).filter(function (n) { return wanted.indexOf(n) >= 0; }).length;
      candidates.push({ owner: owner, id: clean(id, 100), text: clean(text, 600), rank: rank,
        relevance: relevant + (c.place && text.indexOf(String(c.place)) >= 0 ? 1 : 0),
        at: Number(at) || 0, label: label || '' });
    }
    function read(owner, fn) {
      if (visibility[owner] === false) return;
      try { if (ownerOn(owner)) fn(); }
      catch (e) { faults.push({ owner: owner, error: clean(e && e.message, 120) }); }
    }
    read('life', function () {
      // Existing owner block is the only public goal reader. Preserve its fact boundaries.
      const block = WA.life.buildBlock();
      if (block) String(block).split('\n').slice(1, -1).forEach(function (s, i) {
        const name = s.split('：')[0]; add('life', 'goal:' + name + ':' + i, s, [name], 0, '目标/安排');
      });
      const v = WA.life.commitmentsView({ maxPeople: 8, maxPer: 12 });
      if (v && v.ok) (v.rows || []).forEach(function (r) {
        (r.items || []).filter(function (x) { return x.kind !== 'secret'; }).forEach(function (x) {
          add('life', x.id, r.person + '：' + x.kind + '「' + x.text + '」'
            + (x.target ? '，对象 ' + x.target : '') + (x.overdue ? '（已到期，未结清）' : '（承诺，非完成事实）'),
          [r.person, x.target], x.at, '承诺台账');
        });
      });
    });
    read('plan', function () {
      // chainBlock intentionally belongs to backstage. Use chain() and reveal only the
      // current step/blockers, never the future rest[] itinerary.
      const people = ((WA.store && WA.store.get()) || {}).people || {};
      Object.keys(people).slice(0, 48).forEach(function (id) {
        const p = people[id]; if (!p) return;
        const v = WA.plan.chain(p.name || id.replace(/^p_/, ''));
        if (!v || !v.ok || ['done', 'abandoned', 'refused'].indexOf(v.status) >= 0) return;
        const blockers = (v.blockedBy || []).map(function (b) {
          return b.kind === 'need' ? '缺 ' + b.detail : '等待前置第 ' + b.seq + ' 步（' + b.status + '）';
        }).join('；');
        add('plan', v.id, (p.name || id) + '：目标「' + v.goalText + '」，'
          + (v.step ? '当前拟稿「' + v.step.text + '」' : '暂无当前步骤')
          + (blockers ? '；卡点：' + blockers : '') + '（意图不是完成事实）', [p.name], 0, '意图链');
      });
    });
    read('events', function () {
      const v = WA.events.timelineView({ maxRows: 48 });
      if (v && v.ok) (v.rows || []).filter(function (r) { return r.due && r.canAct; }).forEach(function (r) {
        add('events', r.id, r.title + '（已到点、未认领，不等于已发生）'
          + (r.condition ? '；仍需核实条件：' + r.condition : ''), [], r.at, '到期轴');
      });
    });
    read('intel', function () {
      const v = WA.intel.network({});
      if (v && v.ok) (v.rows || []).filter(function (r) {
        // In-transit payload is not yet known to its recipient. Never print it.
        return r.state === 'held' && r.status !== 'retracted' && r.status !== 'superseded';
      }).forEach(function (r) {
        add('intel', r.id, r.person + '持有情报「' + r.claim + '」（'
          + clean(r.status, 32) + '；来源 ' + clean(r.source, 80) + '；'
          + clean(r.confidence, 32) + '；仅该持有人知情，传闻不等于事实）', [r.person], r.at, '已持有情报');
      });
    });
    read('bonds', function () {
      const v = WA.bonds.network({ maxRows: 24 });
      if (v && v.ok) (v.rows || []).forEach(function (r) {
        add('bonds', r.key, r.a + ' × ' + r.b + '：' + r.types.join('、') + '（当前登记，非新增关系事件）',
          [r.a, r.b], r.at, '关系登记');
      });
    });
    // Rank first, then scene relevance, then owner-local freshness (different clocks
    // are never compared across owners), finally stable owner/id order.
    candidates.sort(function (a, b) {
      return a.rank - b.rank || b.relevance - a.relevance
        || (a.owner === b.owner ? b.at - a.at : a.owner.localeCompare(b.owner))
        || a.id.localeCompare(b.id);
    });
    const header = '[结构汇流]\n';
    const footer = '\n只按持有人/当前场景呈现；承诺、拟稿、到期不是已完成，禁止替未登记内容补写。';
    const picked = [], counts = {}, skipped = {};
    // Local material ceiling, not a second allocation from render's shared pool.
    const tokenCap = Math.max(0, Math.floor(Number(cfg.maxTokens) || 0));
    const tokenCost = WA.injectBudget.tokensOf;
    function compose(rows, omitted) {
      return rows.length ? header + rows.map(function(r){return r.content;}).join('\n')
        + (omitted ? '\n其余折叠：' + omitted + ' 条' : '') + footer : '';
    }
    // Reserve an exact worst-case omission marker; final text is re-counted below.
    const reserve = tokenCost(header + footer + '\n其余折叠：' + candidates.length + ' 条');
    let tokenUsed = reserve;
    let used = header.length + footer.length + 100; // reserve collapse counters
    candidates.forEach(function (r) {
      const text = '· ' + r.label + '：' + r.text;
      if ((counts[r.owner] || 0) >= max || used + text.length + 1 > cap || (tokenCap > 0 && tokenUsed + tokenCost(text + "\n") > tokenCap)) {
        skipped[r.owner] = (skipped[r.owner] || 0) + 1; return;
      }
      counts[r.owner] = (counts[r.owner] || 0) + 1;
      picked.push(Object.assign({}, r, { content: text })); used += text.length + 1; tokenUsed += tokenCost(text + "\n");
    });
    const block = compose(picked, candidates.length - picked.length);
    const inputs = candidates.map(function(r){return {source:'结构汇流',content:'· '+r.label+'：'+r.text};});
    const volume = WA.injectBudget.volumeView(inputs, block ? [{source:'结构汇流',content:block}] : []);
    last = { enabled: true, selected: picked.length, folded: candidates.length - picked.length,
      chars: block.length, cap: cap, tokenCap: tokenCap, tokens: tokenCost(block), candidateCount: candidates.length, inputTokens: inputs.reduce(function(n,r){return n+tokenCost(r.content);},0), volume: volume, rows: picked, skipped: skipped, faults: faults, chatId: WA.store.chatId() };
    return block;
  }
  WA.injectCollector = {
    getSettings: settings,
    setSettings: function (patch) { return WA.settingsBus.saveOrThrow(REG,
      WA.settingsBus.normalize(REG, Object.assign({}, settings(), patch || {}))); },
    buildBlock: buildBlock,
    diagnose: function () {
      const cfg=settings(),s=WA.store.get()||{};
      if(!cfg.enabled)return {ok:true,status:'disabled',faults:[]};
      if(last.chatId!==WA.store.chatId()||last.enabled!==true)return {ok:true,status:'not-collected',faults:[]};
      const populated=Object.keys(s.people||{}).length>0||(s.currents||[]).length>0||(s.events&&s.events.rows||[]).length>0;
      const faults=last.faults.slice();
      if(populated&&last.candidateCount===0)faults.push({fault:'state-but-no-candidate',scope:'collector-five-owners',note:'可能是源关闭/可见性过滤或无适用材料，不代表整个世界注入失败'});
      return {ok:faults.length===0,status:faults.length?'attention':'ok',candidateCount:last.candidateCount,selected:last.selected,faults:faults};
    },
    noteScene: function (info) {
      const i = info || {};
      const from = ['sceneNarrative', 'ctx', 'none'].indexOf(i.from) >= 0 ? i.from : 'none';
      lastScene = { from: from, people: Array.isArray(i.people) ? i.people.slice(0, 12) : [],
        place: String(i.place == null ? '' : i.place).slice(0, 60) };
      return { ok: true };
    },
    sceneStat: function () { return JSON.parse(JSON.stringify(lastScene)); },
    stat: function () { return JSON.parse(JSON.stringify(last)); }
  };
  if (WA.registerModule) WA.registerModule('engines/inject-collector.js', { kind: 'engine', ver: '2.294.0' });
})();
