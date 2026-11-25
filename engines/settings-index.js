/**
 * WorldAxis engines/settings-index.js (v2.524.0)
 * OPV27-6 设置面中文索引：333 台引擎登记了 `__settingsRegs`，面板侧此前既无中文名、
 *   也无搜索、也无分组——玩家想关掉某功能，得先知道它叫 `affectionNexus`。
 *
 * 本模块只做**索引与问答**，不新增任何设置键、不改任何设置值：
 *   1 数据源就是 `WA.__settingsRegs`（各引擎自己登记的那一份），零二次登记。
 *   2 中文名走两张表（模块名表 + 键名词典），表外**如实标 null 并说明「中文名未登记」**，
 *      不拿拼音或英文名伪造一个中文名（那就只是把不可发现换成了不可信）。
 *   3 「关掉会怎样」对 `enabled` 有确定答复（整块停用、读数返回 disabled）；
 *      对其余键只答它管什么（上限/节奏/开关），不夸大不缩小。
 *   4 只读：read 走 settingsBus.read + normalize，**绝不写**（索引面写设置是最不该犯的错）。
 *   5 检索命中名额只截断不参与筛选：按「模块名精确 > 模块名包含 > 中文名 > 键名」
 *     分级、同级按模块名字典序（v2.577.0）。`hitCount` 报**真实命中总数**，`returned`
 *     才是这一面念了几组；截断必须自证「另有几组未列出」—— 否则「命中 3 组」与
 *     「一共只有 3 组」在读数上同形。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_settings_index_settings_v1';
  const DEF = { enabled: true, maxRows: 30 };
  const __REG = { key: LS_KEY, def: DEF, module: 'settingsIndex', bounds: { maxRows: [5, 100] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
      : Object.assign({}, base, raw || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // ── 模块中文名表：只登记「有把握」的；表外一律 nameZh:null ──────────────
  const NAME_ZH = {
    warrant: '通缉', actionDesk: '场景办事台', act: '行动线', memory: '记忆', pmem: '主观记忆',
    backstage: '幕后推演', digest: '世界推演', opinion: '舆情', ledger: '重大事件账本',
    injectBudget: '注入预算', injectDelta: '注入信息增量账', injectChannel: '注入通道',
    toolDiag: '自检面板', settingsIndex: '设置索引', rejectPhrase: '拒收话术',
    relationTemp: '关系温度', fondness: '好感', family: '家室', org: '组织', guild: '行会',
    economy: '经济', market: '市集', commodityCirculation: '物资商路', freight: '货运',
    clock: '世界钟', weather: '天气', calendar: '历法', geography: '地理',
    research: '研究', craft: 'craft 制作', production: '生产', campaign: '战役',
    pawnRedemption: '当票质押', silverAssay: '银钱成色', saltFranchise: '盐引专卖',
    brokerHouse: '牙行居间', nightWatch: '更夫夜禁', fireWatch: '火政走水',
    festivalFair: '灯会庙市', wardCompact: '保甲乡约', divinationCraft: '巫觋占卜'
  };
  // ── 键名词典：设置项键 → 中文 ──────────────────────────────────────────
  const KEY_ZH = {
    enabled: '启用', maxRows: '条数上限', maxPerGroup: '每组上限', maxItems: '项数上限',
    budget: '预算', injectBudget: '注入预算', cooldown: '冷却', threshold: '阈值',
    mode: '模式', depth: '深度', horizon: '视野', verbose: '详略', interval: '间隔'
  };
  // ── 分组规则：按模块名关键词归组（顺序即优先级）────────────────────────
  const GROUP_RULES = [
    { group: '诊断', re: /(diag|audit|inspect|gate|ledger_check|contract)/i },
    { group: '性能', re: /(perf|cache|budget|sampler|evict|boot|save|quota)/i },
    { group: '注入', re: /(inject|channel|slot|wb|entry|kaleido)/i },
    { group: '关系', re: /(relation|fondness|family|guild|org|loyal|trust|intim|marri)/i },
    { group: '人物', re: /(actor|character|psy|soma|body|mind|mood|emotion|human|lineage)/i },
    { group: '世界', re: /(world|geo|weather|clock|time|calendar|city|market|economy|freight|supply)/i },
    { group: '叙事', re: /(story|digest|ledger|narrative|chapter|scene|opinion|rumor|memory|pmem)/i }
  ];
  function groupOf(module) {
    const m = String(module || '');
    for (let i = 0; i < GROUP_RULES.length; i++) if (GROUP_RULES[i].re.test(m)) return GROUP_RULES[i].group;
    return '其它';
  }

  // ── v2.577.0（按序截断第二十处）：检索命中名额 ──────────────────────────
  //   旧写法 hits = entries.filter(...).slice(0, cap)：命中几组全凭**注册顺序**取前 cap 组，
  //   而 hitCount 报的是截断后的长度 —— 于是「命中 3 组」既可能是全部、也可能是 12 组里的 3 组，
  //   且截断发生在 `hits.length > 3 ? ' 等' : ''` 之前，连那个「等」都不会出现。
  const QUOTA_MAX = 50;
  function quotaOf(cfg, opts) {
    const want = (opts && typeof opts.max === 'number') ? opts.max : (cfg && cfg.maxRows);
    const n = Math.floor(Number(want));
    if (!isFinite(n) || n < 1) return Math.min(QUOTA_MAX, DEF.maxRows);
    return Math.min(QUOTA_MAX, Math.max(1, n));
  }
  /** 相关度：模块名精确 4 > 模块名包含 3 > 中文名 2 > 键名/键中文 1。 */
  function rankOf(e, needle) {
    const m = String(e.module || '').toLowerCase();
    if (m === needle) return 4;
    if (m.indexOf(needle) >= 0) return 3;
    if (e.nameZh && String(e.nameZh).toLowerCase().indexOf(needle) >= 0) return 2;
    return 1;
  }
  /** 名额只截断不参与筛选：先按「相关度降序 → 模块名字典序」定序，再切前 quota 个。 */
  function pickHits(list, needle, quota) {
    const arr = (list || []).slice().sort(function (a, b) {
      const ra = rankOf(a, needle), rb = rankOf(b, needle);
      if (ra !== rb) return rb - ra;
      return String(a.module).localeCompare(String(b.module));
    });
    const picked = arr.slice(0, quota);
    return { picked: picked, candidates: arr.length, hidden: Math.max(0, arr.length - picked.length) };
  }

  const stat = { builds: 0, searches: 0, lastQuery: '', lastHits: 0,
    // v2.577.0：检索名额读数。必须在这里声明 —— 「没搜过」（null）与「搜了没命中」（mode='empty'）
    //   要能分辨，否则「查无此组」与「还没查过」长得一模一样。
    block: null };

  function regs() {
    const arr = WA.__settingsRegs;
    return Array.isArray(arr) ? arr : [];
  }
  function currentOf(reg) {
    try {
      const raw = WA.settingsBus ? WA.settingsBus.read(reg) : null;
      const merged = Object.assign({}, reg.def || {}, raw || {});
      return WA.settingsBus && typeof WA.settingsBus.normalize === 'function'
        ? WA.settingsBus.normalize(reg, merged) : merged;
    } catch (e) { return Object.assign({}, reg.def || {}); }
  }
  function keysOf(reg) {
    const cur = currentOf(reg);
    return Object.keys(reg.def || {}).map(function (k) {
      return { key: k, zh: KEY_ZH[k] || null, value: cur[k] };
    });
  }
  /** 关掉会怎样：enabled 有确定答复；其余键只答它管什么。 */
  function offEffect(reg) {
    const has = reg.def && Object.prototype.hasOwnProperty.call(reg.def, 'enabled');
    if (!has) return '该组参数只影响上限/节奏，不改动已存数据';
    return '整块功能停用：读口返回 reason:"disabled"，写口拒收，相关注入节不再出现';
  }

  function build() {
    stat.builds++;
    const list = regs();
    const entries = list.map(function (reg) {
      const module = String(reg.module || reg.key || '(未命名)');
      const zh = NAME_ZH[module] || null;
      return {
        module: module, nameZh: zh, nameMissing: !zh,
        key: reg.key, group: groupOf(module),
        keys: keysOf(reg), off: offEffect(reg), bounds: reg.bounds || null
      };
    });
    const named = entries.filter(function (e) { return !e.nameMissing; }).length;
    return {
      ok: true, at: clockNow('settingsIndex'),
      total: entries.length, named: named, nameMissing: entries.length - named,
      groups: entries.reduce(function (acc, e) { acc[e.group] = (acc[e.group] || 0) + 1; return acc; }, {}),
      entries: entries,
      text: '设置索引：' + entries.length + ' 组（有中文名 ' + named + ' · 未登记 ' + (entries.length - named) + '）'
    };
  }

  /** search：中文名 / 模块英文名 / 键名 / 键中文，四路匹配。 */
  function search(q, opts) {
    const o = opts || {};
    const s = settings();
    const idx = build();
    const needle = String(q == null ? '' : q).trim().toLowerCase();
    stat.searches++; stat.lastQuery = needle;
    if (!needle) return { ok: false, reason: 'empty-query', hits: [], text: '搜索词为空' };
    const quota = quotaOf(s, o);
    const matched = idx.entries.filter(function (e) {
      if (String(e.module).toLowerCase().indexOf(needle) >= 0) return true;
      if (e.nameZh && e.nameZh.toLowerCase().indexOf(needle) >= 0) return true;
      if (String(e.key).toLowerCase().indexOf(needle) >= 0) return true;
      return e.keys.some(function (k) {
        return String(k.key).toLowerCase().indexOf(needle) >= 0
          || (k.zh && k.zh.toLowerCase().indexOf(needle) >= 0);
      });
    });
    const pk = pickHits(matched, needle, quota);
    const hits = pk.picked;
    stat.lastHits = hits.length;
    // 读数落在返回之前，且落在「没命中」分支之外：搜过但零命中要留下 mode='empty'。
    stat.block = { candidates: pk.candidates, picked: hits.length, quota: quota,
      hidden: pk.hidden,
      mode: !pk.candidates ? 'empty' : (pk.hidden ? 'ranked-first' : 'all-fit') };
    const shown = hits.slice(0, 3).map(function (e) {
      return (e.nameZh || e.module) + '(' + e.module + ')';
    }).join('、');
    return {
      // hitCount 是**真实命中总数**；returned 才是这一面念了几组（v2.577.0 起）。
      ok: true, query: needle, hits: hits, hitCount: pk.candidates, returned: hits.length,
      quota: quota, hidden: pk.hidden,
      text: hits.length
        ? ('「' + needle + '」命中 ' + pk.candidates + ' 组：' + shown
          + (pk.candidates > hits.slice(0, 3).length ? ' 等' : '')
          + (pk.hidden ? '（本面只列 ' + hits.length + ' 组，另有 ' + pk.hidden + ' 组未列出）' : ''))
        : ('「' + needle + '」没有命中任何设置组（' + idx.total + ' 组里没有这个名/这个键）')
    };
  }

  /** entry(module)：单组问答——当前值 + 关掉会怎样。查无此组不编。 */
  function entry(module) {
    const m = String(module == null ? '' : module).trim();
    const idx = build();
    const e = idx.entries.filter(function (x) { return x.module === m || x.nameZh === m; })[0];
    if (!e) return { ok: false, reason: 'no-such-group', text: '没有「' + m + '」这个设置组（未登记在 __settingsRegs）' };
    return {
      ok: true, module: e.module, nameZh: e.nameZh, group: e.group, keys: e.keys, off: e.off,
      text: '「' + (e.nameZh || e.module) + '」(' + e.module + ' · ' + e.group + ')：'
        + e.keys.map(function (k) { return (k.zh || k.key) + '=' + JSON.stringify(k.value); }).join('，')
        + '；关掉 → ' + e.off
    };
  }

  WA.settingsIndex = {
    build: build, search: search, entry: entry,
    groups: function () { const i = build(); return i.groups; },
    coverage: function () { const i = build(); return { total: i.total, named: i.named, nameMissing: i.nameMissing, text: i.text }; },
    settings: settings,
    // v2.577.0：stat() 原先只做 Object.assign —— block 是对象，浅拷拷的是引用，
    //   调用方改一次读数就等于改掉了引擎自己的读数（观测不得改变被观测对象）。
    stat: function () {
      const out = Object.assign({}, stat);
      out.block = stat.block ? JSON.parse(JSON.stringify(stat.block)) : null;
      return out;
    }
  };
  // 装载面登记与自述行：与全部引擎同形态（少这两行会在装载汇报里被算成「未自述」，
  //   而 module-registry 的装载期边也要靠 registerModule 才能记到这台）。
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/settings-index.js', { kind: 'engine', ver: '2.524.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/settings-index 已加载（2.524.0）');
})();