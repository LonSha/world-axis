/**
 * WorldAxis engines/world-blueprint.js (v2.164.0) — 版本化完整世界蓝图（TX5）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   world-seed 答得出「用同样的格局开新局」，但它**有损**：种子只记势力名字与权重、
 *   人物显示名与亲疏档、地名与道路**数量**、时代标签 —— 道路端点不记（导入时如实落 0 条）、
 *   同名人物无法区分（只有显示名，没有身份）、事件进度整批丢弃。
 *   一句话：**能重开一局，但重开的不是同一张地图。**
 *   本模块补的是「**结构可往返**」：带 schemaVersion 与**稳定 ID**的蓝图，
 *   导入后人物/势力/地点/道路/引用关系逐项对得上，而进度仍然归零。
 *
 * ── 与 world-seed 的分工（不许重叠）──────────────────────────
 *   · world-seed = **有损种子**（只取骨头，兼容旧格式，明确声明不还原身份与历史）；
 *   · 本模块     = **无损结构蓝图**（稳定 ID、道路端点、别名映射、方向化关系、日历起点）。
 *   两者并存：老种子照旧可用且预览如实显示损失，新蓝图另走一条路径 —— 不把旧格式
 *   悄悄升级成新格式（那会让「旧存档打开后发现世界变了样」成为无声事件）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认**开**（导出与预览是纯读；只有 import 写世界）。
 *   2 **只写自己那一格 + 一次安装**：库写入只碰 `blueprint.library`；
 *     安装只碰它声明的结构面（people / world / evolution.factions / clock / background），
 *     并在同一事务里写 `blueprint.installed`。不碰 memory / chronicle / currents /
 *     echoes / worldFacts / chapters（那是**进度与历史**，不是结构）。
 *   3 **私密面不外流**：人物私密记忆、聊天文本、已完成事件、外部凭据、可执行脚本
 *     一律不进蓝图（白名单提取，不是黑名单过滤）。
 *   4 **稳定 ID 必须被消费**：蓝图里的 key 不是装饰 —— 关系边与道路端点都用它引用，
 *     导入时按 key 复原；悬空引用整批拒收（`dangling-ref`），不装一个断网的世界。
 *   5 **同名不合并**：两个同名人物各自拿到不同的稳定 key（key 由 名字+序号 决定）。
 *     引用一律走 key（关系边、道路端点），所以同名不构成歧义；预览另把重名如实标进
 *     `ambiguousNames` 与 `idMap[].ambiguous` —— 「名字撞了」这件事必须被看见，
 *     而不是靠「反正按 key 引用所以没事」把它藏起来。
 *   6 **进度归零是可区分状态**：`scene.enabled` 与 `progress.zeroed` 各自成立，
 *     「启用了场景模板」与「默认清零」在读数上必须分得开。
 *   7 库有界：`libCap` 到顶即拒收 `library-full`（不静默挤掉旧蓝图）。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_world_blueprint_v1';
  const DEF = {
    enabled: true,
    libCap: 8          // 蓝图库环（一张蓝图比一颗种子大得多，上限刻意更小）
  };
  const __REG = { key: LS_KEY, def: { enabled: true, libCap: 8 }, module: 'worldBlueprint',
    bounds: { libCap: [1, 40] } };

  // v2.164.0（TX5）：蓝图格式版本。与 SEED_VER 各自独立演进 ——
  //   把「种子格式升级」与「蓝图格式升级」绑成一个数字，会让其中一条路径的改动
  //   迫使另一条路径的存档被拒收（两条路径的字段面根本不同）。
  const BP_VER = 1;

  // 保留层级（导出侧的可选项；导入侧只认蓝图自己声明的层级）。
  const KEEP_LEVELS = [
    { id: 'structure', label: '仅结构', note: '势力 / 人物 / 地理 / 时代 —— 不含人设与机制配置' },
    { id: 'roster', label: '结构与人设', note: '外加受支持的静态人设（persona 白名单字段）' },
    { id: 'mech', label: '结构与人设与机制', note: '外加受支持的机制配置（引擎开关白名单）' }
  ];

  // 场景起点模板。**默认不启用** —— 「开新局」的默认语义是「清零的历史」，
  //   而不是「从一条正在发生的事件开始」（后者是显式选择）。
  const SCENES = [
    { id: 'blank', label: '空白开局', note: '不装任何场景起点：进度全零，只有结构' },
    { id: 'cold-open', label: '事件开局', note: '从一条进行中的事件开始（须显式启用）' },
    { id: 'market-day', label: '集市日', note: '从一次集市开始（须显式启用）' }
  ];

  // 人设分节白名单（**只有这三节进蓝图**）：与「私密记忆不外流」同一条纪律 ——
  //   registry 的档案结构（fields / personality / worldview / family / memory /
  //   relationships / relations / persona）里，memory 与 relationships / relations 是
  //   **私密认知与关系量值**（那是**进度**，不是结构），persona 是**人格骰面**（运行时机制态）。
  //   只有 personality / worldview / family 三节是「这个人本来是什么样」的静态人设。
  const PROFILE_SECS = ['personality', 'worldview', 'family'];
  // 机制配置白名单：只取**静态开关**，不取任何运行时读数。
  const MECH_KEYS = ['enabled'];

  const _stat = { exports: 0, saves: 0, previews: 0, imports: 0, refused: 0, lastReason: '', faults: {} };
  // 最近一次成功导出的蓝图（**内存态，不进存档**）：让面板的「导出 → 保存」两步走
  //   不必把整张蓝图在 DOM 里往返一遍（大蓝图塞进 textarea 再解析回来，既是性能负担，
  //   也让「保存的到底是哪一份」多了一次不可见的转换）。与 world-seed 的 lastSeed 同口径。
  let _last = null;
  let _lastSig = '';
  function note(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60);
  }
  function num(v) { const n = (v === null || v === undefined || v === '') ? NaN : Number(v); return isFinite(n) ? n : null; }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  const clockNow = function () { try { return WA.clock.now('worldBlueprint'); } catch (e) { return Date.now(); } };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, __REG.def, raw || {}))
                          : Object.assign({}, __REG.def, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /** FNV-1a 取低 32 位十六进制（与 world-seed / world-bridge 同族手法）。 */
  function sig(s) {
    let h = 2166136261;
    const t = String(s == null ? '' : s);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }

  /**
   * **稳定 ID**。这是本模块与 world-seed 的分水岭：
   *   种子只有显示名，两个同名人物在种子里长得一模一样（导入后合并成一个）；
   *   蓝图给每个实体一个由「类别 + 名字 + 同名序号」决定的 key —— 同一份输入永远得到
   *   同一个 key（往返可复现），而两个同名人物因序号不同拿到不同 key（不合并）。
   *   为什么不用 rand.id：id 是**进存档的产物**，但蓝图要跨聊天、跨会话、跨版本复现，
   *   随机 id 每导出一次就变一次，「同一份蓝图两次导入结果不同」正是本项要治的病。
   */
  function stableKey(kind, name, idx) {
    return 'bk_' + kind.slice(0, 2) + '_' + sig(kind + '|' + name + '|' + idx) + '_' + idx;
  }

  // ── 提取面（白名单）─────────────────────────────────────────
  /** 人物：显示名 + 别名 + 稳定 key（**不带** knowledge / 记忆 / 运行时游标）。 */
  function peopleOf(s) {
    const src = (s.people && typeof s.people === 'object') ? s.people : {};
    const ids = Object.keys(src).filter(function (k) { return src[k] && typeof src[k] === 'object'; });
    const seen = {};                       // name → 已用序号（同名不合并）
    const rows = [];
    const byId = {};
    ids.forEach(function (id) {
      const p = src[id];
      const nm = clean(p.name || id, 30);
      if (!nm) return;
      const idx = (seen[nm] = (seen[nm] === undefined ? 0 : seen[nm] + 1));
      const key = stableKey('people', nm, idx);
      const aliases = [];
      try {
        // registry.aliasOf 是**按名字**查的（不是按 id）：它答「这个名字的历史名有哪几个」。
        //   读面隔离：返回体是新建对象，写它不会改持久态。
        if (WA.registry && typeof WA.registry.aliasOf === 'function') {
          const al = WA.registry.aliasOf(nm);
          const arr = (al && al.ok && Array.isArray(al.aliases)) ? al.aliases : [];
          arr.forEach(function (a) { const t = clean(a, 30); if (t && aliases.indexOf(t) < 0) aliases.push(t); });
        }
      } catch (e) {}
      byId[id] = key;
      rows.push({ key: key, name: nm, aliases: aliases.slice(0, 4) });
    });
    return { rows: rows, byId: byId };
  }

  /** 势力：名字与权重（与种子同口径 —— 势力没有别的静态结构面）。 */
  function powersOf(s) {
    const ev = (s.evolution && Array.isArray(s.evolution.factions)) ? s.evolution.factions : [];
    const seen = {};
    return ev.map(function (f) {
      const nm = clean(f && (f.name || f.id), 30);
      if (!nm) return null;
      const idx = (seen[nm] = (seen[nm] === undefined ? 0 : seen[nm] + 1));
      return { key: stableKey('powers', nm, idx), name: nm,
        weight: num(f && f.power) === null ? 0 : num(f && f.power) };
    }).filter(Boolean).slice(0, 24);
  }

  /** 地点：**带 kind / parent / 开关时刻**（种子只记名字）。 */
  function placesOf(s) {
    const w = (s.world && typeof s.world === 'object') ? s.world : {};
    const arr = Array.isArray(w.places) ? w.places : [];
    const seen = {};
    const rows = [];
    const byName = {};
    arr.forEach(function (p) {
      const nm = clean(p && (p.name || p.id), 30);
      if (!nm) return;
      const idx = (seen[nm] = (seen[nm] === undefined ? 0 : seen[nm] + 1));
      const key = stableKey('places', nm, idx);
      if (byName[nm] === undefined) byName[nm] = key;   // 首见者优先（道路端点按名解析的落点）
      rows.push({ key: key, name: nm, kind: clean(p && p.kind, 12),
        parent: clean(p && p.parent, 30), open: num(p && p.open) || 0, close: num(p && p.close) || 0 });
    });
    return { rows: rows.slice(0, 40), byName: byName };
  }

  /** 道路：**带端点**（这是种子做不到的那一件事）。 */
  function roadsOf(s, byName) {
    const w = (s.world && typeof s.world === 'object') ? s.world : {};
    const arr = Array.isArray(w.roads) ? w.roads : [];
    const out = [];
    arr.forEach(function (r) {
      if (!r) return;
      const a = byName[clean(r.a, 30)], b = byName[clean(r.b, 30)];
      // 端点解析不出的路**不导出**（而不是导出一条 a:'' 的假路）：导入侧要的是
      //   「引用完整」，导出一条悬空边等于把本模块要治的病写进格式里。
      if (!a || !b) return;
      out.push({ a: a, b: b, minutes: num(r.minutes) || 0, cap: num(r.cap) || 0,
        capBy: (r.capBy && typeof r.capBy === 'object') ? Object.assign({}, r.capBy) : {} });
    });
    return out.slice(0, 40);
  }

  /** 关系：**方向化**（from → to）。档位由 intimacy 映射（与 world-seed 的 near/mid/far 同源）。 */
  function relationsOf(s, byId) {
    const src = (s.people && typeof s.people === 'object') ? s.people : {};
    const out = [];
    Object.keys(src).forEach(function (id) {
      const p = src[id] || {};
      const rels = (p.profile && Array.isArray(p.profile.relations)) ? p.profile.relations : [];
      rels.forEach(function (r) {
        const t = r && (r.target || r.to || r.id);
        if (!t || !byId[id] || !byId[t] || id === t) return;
        const iv = num(r.intimacy) || 0;
        const band = iv >= 60 ? 'near' : (iv <= -30 ? 'far' : 'mid');
        out.push({ from: byId[id], to: byId[t], band: band, dir: '->' });
      });
    });
    return out.slice(0, 120);
  }

  function eraOf(s) {
    const bg = (s.background && typeof s.background === 'object') ? clean(s.background.text, 400) : '';
    const clk = (s.clock && typeof s.clock === 'object') ? s.clock : {};
    return { title: bg ? bg.split('\n')[0].slice(0, 40) : '', note: bg.slice(0, 200),
      label: clean(clk.label, 40), dayIndex: num(clk.dayIndex) || 0 };
  }

  /**
   * 人设（分节白名单）。为什么**直接读人物行的 profile**而不是 registry.getProfile(name)：
   *   registry 的档案接口按**名字**键（`people['p_' + name]`），而蓝图里的人可以有同名条目
   *   （各自不同的稳定 key）—— 用名字键的接口读，两个「张三」会读到同一份档案。
   *   这里只拷白名单三节，memory / relationships / relations / persona 一律不带
   *   （那是私密认知、关系量值与运行时人格态 —— **进度**，不是结构）。
   */
  function rosterOf(s, byId, keep) {
    if (keep !== 'roster' && keep !== 'mech') return [];
    const src = (s.people && typeof s.people === 'object') ? s.people : {};
    const out = [];
    Object.keys(src).forEach(function (id) {
      const p = src[id] || {};
      if (!byId[id]) return;
      const prof = (p.profile && typeof p.profile === 'object' && !Array.isArray(p.profile)) ? p.profile : null;
      if (!prof) return;
      const secs = {};
      PROFILE_SECS.forEach(function (k) {
        const v = prof[k];
        if (Array.isArray(v) && v.length) secs[k] = v.slice(0, 20).map(function (x) { return clean(x, 120); }).filter(Boolean);
      });
      if (!Object.keys(secs).length) return;
      out.push({ key: byId[id], name: clean(p.name, 30), sections: secs });
    });
    return out.slice(0, 48);
  }

  /** 机制配置（静态开关白名单）：只取**引擎存在**且声明为白名单键的设置。 */
  function mechOf(s, keep) {
    if (keep !== 'mech') return {};
    const out = {};
    [['economy', 'economy'], ['weather', 'weather'], ['worldSeed', 'worldSeed'], ['worldBlueprint', 'worldBlueprint']].forEach(function (pair) {
      const eng = WA[pair[0]];
      if (!eng || typeof eng.getSettings !== 'function') return;
      let cfg = null;
      try { cfg = eng.getSettings() || {}; } catch (e) { return; }
      const w = {};
      MECH_KEYS.forEach(function (k) { if (cfg[k] !== undefined) w[k] = !!cfg[k]; });
      if (Object.keys(w).length) out[pair[1]] = w;
    });
    return out;
  }

  function keepOf(v) {
    const k = clean(v, 20);
    return KEEP_LEVELS.some(function (x) { return x.id === k; }) ? k : 'roster';
  }

  /**
   * 导出蓝图（纯读）。返回 `{ ok, blueprint, counts, excluded, deps }`。
   *   白名单提取：只有结构面进蓝图；`excluded` 如实列出**没进**的那几类
   *   （读的人不必去猜边界在哪 —— 与 world-seed 同一条纪律）。
   */
  function exportBlueprint(opt) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const s = state();
    const keep = keepOf(opt && opt.keep);
    const pp = peopleOf(s), pl = placesOf(s);
    const bp = {
      bpVer: BP_VER,
      worldKey: worldKeyOf(s),
      at: clockNow(),
      keep: keep,
      ids: { people: pp.rows, powers: powersOf(s), places: pl.rows,
        resources: resourcesOf(s) },
      relations: relationsOf(s, pp.byId),
      roads: roadsOf(s, pl.byName),
      era: eraOf(s),
      roster: rosterOf(s, pp.byId, keep),
      mech: mechOf(s, keep),
      scene: { id: 'blank', enabled: false,
        progress: { round: 0, chronicle: 0, currents: 0, echoes: 0 }, zeroed: true },
      deps: depsOf(s, opt)
    };
    const empty = !bp.ids.people.length && !bp.ids.powers.length && !bp.ids.places.length && !bp.era.title;
    if (empty) { note('empty-blueprint'); return { ok: false, reason: 'empty-blueprint' }; }
    // 自检：导出**当场**跑一遍引用完整性 —— 蓝图自己就悬空的话，
    //   问题出在导出侧而不是导入侧（「坏数据在谁手里产生」必须答得出来）。
    const ic = checkIntegrity(bp);
    if (!ic.ok) { note('dangling-ref'); return Object.assign({ ok: false, reason: 'dangling-ref' }, ic); }
    bp.bpSig = sig(JSON.stringify({ ids: bp.ids, relations: bp.relations, roads: bp.roads, era: bp.era.label }));
    _last = bp; _lastSig = bp.bpSig;
    _stat.exports++; _stat.lastReason = 'exported';
    return { ok: true, blueprint: bp, bpSig: bp.bpSig,
      counts: countsOf(bp),
      excluded: ['memory', 'chronicle', 'currents', 'echoes', 'worldFacts', 'chapters',
        'persona.private', 'chatText', 'credentials', 'scripts'],
      deps: bp.deps };
  }

  function worldKeyOf(s) {
    try { if (WA.worldBridge && typeof WA.worldBridge.worldKey === 'function') return String(WA.worldBridge.worldKey() || ''); } catch (e) {}
    return sig(JSON.stringify((s.evolution && s.evolution.factions || []).map(function (f) { return f && f.name; })));
  }

  /** 资源面：只取**登记过**的货与产地（不凭空创建）。 */
  function resourcesOf(s) {
    const ec = (s.economy && typeof s.economy === 'object') ? s.economy : {};
    const arr = Array.isArray(ec.goods) ? ec.goods : [];
    return arr.map(function (g) {
      return { place: clean(g && g.place, 30), resource: clean(g && g.resource, 30),
        base: num(g && g.base) || 0 };
    }).filter(function (g) { return !!g.place && !!g.resource; }).slice(0, 16);
  }

  /** 外部依赖：卡/世界书/媒体资产**不能嵌进蓝图**，只能如实列为依赖。 */
  function depsOf(s, opt) {
    const out = [];
    const declared = (opt && Array.isArray(opt.deps)) ? opt.deps : [];
    declared.forEach(function (d) { const t = clean(d, 60); if (t && out.indexOf(t) < 0) out.push(t); });
    try {
      if (WA.worldbook && typeof WA.worldbook.loadCurrentEntries === 'function') {
        // 同步读面：取**已缓存**的条目（不触发异步拉取 —— 导出是纯读且必须可同步复现）。
        const ents = (typeof WA.worldbook.peekEntries === 'function') ? WA.worldbook.peekEntries() : null;
        if (Array.isArray(ents) && ents.length) out.push('worldbook:' + ents.length + ' 条');
      }
    } catch (e) {}
    return out.slice(0, 12);
  }

  function countsOf(bp) {
    const ids = bp.ids || {};
    return { people: (ids.people || []).length, powers: (ids.powers || []).length,
      places: (ids.places || []).length, relations: (bp.relations || []).length,
      roads: (bp.roads || []).length, roster: (bp.roster || []).length };
  }

  /**
   * 引用完整性（纯读）。三条判据：
   *   ① 重复 key（同一 key 出现在两张表里 / 同一表两次）；
   *   ② 悬空引用（关系边或道路端点指向不存在的 key）；
   *   ③ 未知顶层键（未来格式或恶意载荷 —— 静默收下等于把「不确定能装」伪装成「装下了」）。
   */
  function checkIntegrity(bp) {
    const out = { ok: true, dupIds: [], dangling: [], unknownKeys: [] };
    if (!bp || typeof bp !== 'object' || Array.isArray(bp)) { out.ok = false; out.unknownKeys.push('(bad-shape)'); return out; }
    const TOP = ['bpVer', 'bpSig', 'worldKey', 'at', 'keep', 'ids', 'relations', 'roads', 'era', 'roster', 'mech', 'scene', 'deps'];
    Object.keys(bp).forEach(function (k) { if (TOP.indexOf(k) < 0) out.unknownKeys.push(k); });
    const ids = bp.ids && typeof bp.ids === 'object' ? bp.ids : {};
    const keys = {};
    ['people', 'powers', 'places'].forEach(function (grp) {
      (Array.isArray(ids[grp]) ? ids[grp] : []).forEach(function (r) {
        const k = clean(r && r.key, 60);
        if (!k) { out.dangling.push(grp + ':(missing-key)'); return; }
        if (keys[k]) { out.dupIds.push(k); return; }
        keys[k] = grp;
      });
    });
    (Array.isArray(bp.relations) ? bp.relations : []).forEach(function (r) {
      const f = clean(r && r.from, 60), t = clean(r && r.to, 60);
      if (!keys[f] || !keys[t]) out.dangling.push('relation:' + (f || '?') + '->' + (t || '?'));
    });
    (Array.isArray(bp.roads) ? bp.roads : []).forEach(function (r) {
      const a = clean(r && r.a, 60), b = clean(r && r.b, 60);
      if (!keys[a] || !keys[b]) out.dangling.push('road:' + (a || '?') + '~' + (b || '?'));
    });
    out.ok = !out.dupIds.length && !out.dangling.length && !out.unknownKeys.length;
    return out;
  }

  // ── 目标空局判定 ────────────────────────────────────────────
  /**
   * 蓝图安装只作用于**空新局**。判据不只看 round：人物/势力/地点/道路/纪事/事实/暗流/回声/
   *   初始化来源（meta.initFrom）/ 蓝图安装留痕（blueprint.installed）任一非空 ⇒ 非空。
   *   可传入指定状态对象（事务内复核用 draft，不用 memCache —— 判据与事实同批）。
   */
  function targetEmpty(at) {
    const s = (at && typeof at === 'object') ? at : state();
    const what = [];
    if (Object.keys(s.people || {}).length) what.push('people');
    if ((s.world && s.world.places || []).length) what.push('world.places');
    if ((s.world && s.world.roads || []).length) what.push('world.roads');
    if ((s.evolution && s.evolution.factions || []).length) what.push('evolution.factions');
    if ((s.evolution && s.evolution.round || 0) > 0) what.push('evolution.round');
    if ((s.chronicle || []).length) what.push('chronicle');
    if ((s.currents || []).length) what.push('currents');
    if ((s.echoes || []).length) what.push('echoes');
    if ((s.worldFacts || []).length) what.push('worldFacts');
    if ((s.economy && s.economy.goods || []).length) what.push('economy.goods');
    if (s.meta && s.meta.initFrom) what.push('initFrom');
    if (s.blueprint && s.blueprint.installed) what.push('blueprint.installed');
    return { empty: what.length === 0, what: what };
  }

  // ── 库（蓝图库：跨会话要留下的世界资产）──────────────────────
  function bucket(root) {
    const r = root || state();
    if (!r.blueprint || typeof r.blueprint !== 'object') r.blueprint = { library: [], seq: 0, installed: null };
    if (!Array.isArray(r.blueprint.library)) r.blueprint.library = [];
    return r.blueprint;
  }
  function listOf() { return bucket().library || []; }

  function doWrite(fn) {
    if (!WA.store || typeof WA.store.transact !== 'function') return { ok: false, reason: 'store-unavailable' };
    const r = WA.store.transact(function (root) { fn(bucket(root)); }, 'worldBlueprint:library');
    if (r && r.ok === false) return { ok: false, reason: r.reason || 'store-unavailable' };
    return { ok: true };
  }

  function save(name, tags, opt) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const nm = clean(name, 30);
    if (!nm) { note('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'name' }; }
    const bp = (opt && opt.blueprint) ? opt.blueprint : _last;
    if (!bp || !bp.bpVer) {
      note('missing-fields');
      return { ok: false, reason: 'missing-fields', field: 'blueprint',
        hint: '未传蓝图且本会话尚未导出过任何蓝图 —— 先 exportBlueprint() 再 save()（不凭空造一份空蓝图存进库）' };
    }
    const lib = listOf();
    const dup = lib.filter(function (x) { return x && x.bp && x.bp.bpSig === bp.bpSig; })[0];
    if (dup) { note('duplicate-blueprint'); return { ok: false, reason: 'duplicate-blueprint', existing: dup.id, bpSig: bp.bpSig }; }
    if (lib.length >= Math.max(1, Math.floor(cfg.libCap))) {
      note('library-full'); return { ok: false, reason: 'library-full', cap: cfg.libCap };
    }
    const id = WA.rand.id('bp_', 4, 'id');
    const row = { id: id, name: nm, tags: tagsOf(tags), bp: bp, at: clockNow() };
    const res = doWrite(function (b) {
      b.library.push(row);
      b.seq = (b.seq || 0) + 1;
      if (WA.evict && typeof WA.evict.array === 'function') WA.evict.array(b.library, 'blueprint.library', cfg.libCap);
    });
    if (!res.ok) { note(res.reason); return res; }
    _stat.saves++; _stat.lastReason = 'saved';
    return { ok: true, id: id, name: nm, total: listOf().length, counts: countsOf(bp) };
  }

  function tagsOf(tags) {
    const arr = Array.isArray(tags) ? tags : (tags ? String(tags).split(/[,，]/) : []);
    return arr.map(function (x) { return clean(x, 16); }).filter(Boolean).slice(0, 4);
  }

  function get(id) {
    const k = clean(id, 60);
    if (!k) { note('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'id' }; }
    const row = listOf().filter(function (x) { return x && x.id === k; })[0];
    if (!row) { note('unknown-blueprint'); return { ok: false, reason: 'unknown-blueprint', id: k }; }
    return { ok: true, row: row };
  }

  function drop(id) {
    const k = clean(id, 60);
    if (!k) { note('missing-fields'); return { ok: false, reason: 'missing-fields', field: 'id' }; }
    if (!listOf().some(function (x) { return x && x.id === k; })) { note('unknown-blueprint'); return { ok: false, reason: 'unknown-blueprint', id: k }; }
    const res = doWrite(function (b) { b.library = b.library.filter(function (x) { return !(x && x.id === k); }); });
    if (!res.ok) { note(res.reason); return res; }
    _stat.lastReason = 'dropped';
    return { ok: true, id: k, total: listOf().length };
  }

  function list() {
    return { ok: true, rows: listOf().map(function (x) {
      return { id: x.id, name: x.name, tags: (x.tags || []).slice(), at: x.at,
        bpVer: x.bp && x.bp.bpVer, bpSig: x.bp && x.bp.bpSig, keep: x.bp && x.bp.keep,
        counts: countsOf(x.bp || {}) };
    }) };
  }

  // ── 归属票据（与 world-seed / TP1 同一套 store 原语）─────────
  let _pending = null;
  let _previewSeq = 0;
  function chatIdentity() {
    let chatId = '', epoch = null, rev = null;
    try { chatId = (WA.store && typeof WA.store.chatId === 'function') ? String(WA.store.chatId() || '') : ''; } catch (e) {}
    try { epoch = (WA.store && typeof WA.store.epoch === 'function') ? WA.store.epoch() : null; } catch (e) {}
    try { rev = (WA.store && typeof WA.store.committedRev === 'function') ? WA.store.committedRev() : null; } catch (e) {}
    return { chatId: chatId, epoch: epoch, rev: rev };
  }
  function clearPending(reason) {
    if (!_pending) return false;
    const tk = _pending.ticket;
    _pending = null;
    if (tk && WA.store && typeof WA.store.dropAsync === 'function') { try { WA.store.dropAsync(tk); } catch (e) {} }
    _stat.pendingCleared = (_stat.pendingCleared || 0) + 1;
    _stat.lastClearedReason = reason || 'cleared';
    return true;
  }
  /**
   * 归属结算：**以 store 的异步归属票据为唯一真源**（不另造一套全局聊天状态）。
   *   读集版本只记账不拒收（与 world-seed 同口径：预览后世界被别的引擎写过，
   *   不代表「目标是空局」这个前提变了 —— 那由事务内复核承担）。
   */
  function settleOwnership(opt) {
    if (_pending.ticket && WA.store && typeof WA.store.settleAsync === 'function') {
      const r = WA.store.settleAsync(_pending.ticket, { site: 'worldBlueprint:import' });
      if (r && r.ok === true) return null;
      const rs = (r && r.reason) || 'missing-key';
      if (rs === 'missing-key') {
        note('pending-mismatch');
        return { ok: false, reason: 'pending-mismatch', at: 'claim',
          detail: '预览票据已不在册（超过 30 分钟、被挤出，或已被消费）——计划无法证明还属于当前局',
          hint: '重新 previewImport() 再确认' };
      }
      note(rs);
      const hint = rs === 'foreign-chat'
        ? '跨聊天不能确认 —— 请在预览的那个聊天里确认，或在新聊天重新预览'
        : (rs === 'stale-epoch' ? '聊天已重载/重新初始化 —— 预览时的现场已不是同一份，请重新预览'
          : '预览之后这个世界已经被写过 —— 「目标是空新局」这个前提不再成立，请重新预览');
      return Object.assign({}, r, { ok: false, reason: rs, hint: hint, at: 'claim' });
    }
    const now = chatIdentity();
    const want = (opt && opt.chatId !== undefined && opt.chatId !== null) ? String(opt.chatId) : now.chatId;
    if (_pending.chatId !== want) {
      note('foreign-chat');
      return { ok: false, reason: 'foreign-chat',
        detail: '这份待确认计划属于聊天「' + _pending.chatId + '」，当前是「' + want + '」',
        hint: '跨聊天不能确认 —— 请在预览的那个聊天里确认，或在新聊天重新预览' };
    }
    if (_pending.epoch !== null && now.epoch !== null && _pending.epoch !== now.epoch) {
      note('stale-epoch');
      return { ok: false, reason: 'stale-epoch',
        detail: '聊天纪元已推进（' + _pending.epoch + ' → ' + now.epoch + '）' };
    }
    return null;
  }

  /**
   * 导入预览（纯读，**不写世界**）：四道门 + 拟写入结构 + 身份映射 + 依赖清单。
   *   门：格式版本（bad-bp-ver）/ 蓝图形状（bad-blueprint）/ 白名单键（bad-bp-keys）/
   *       重复 ID（duplicate-id）/ 悬空引用（dangling-ref）/ 容量（too-many）。
   *   预览只做**一次**映射（含同名解析），确认应用同一份 —— 与 world-seed 的
   *   「预览说世界会长这样，确认后就必须长这样」同一条纪律。
   */
  function previewImport(bp, opt) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const gate = formatGate(bp);
    if (gate) return gate;
    const ic = checkIntegrity(bp);
    if (ic.dupIds.length) { note('duplicate-id'); return { ok: false, reason: 'duplicate-id', ids: ic.dupIds.slice(0, 8) }; }
    if (ic.dangling.length) { note('dangling-ref'); return { ok: false, reason: 'dangling-ref', refs: ic.dangling.slice(0, 8) }; }
    if (ic.unknownKeys.length) { note('bad-bp-keys'); return { ok: false, reason: 'bad-bp-keys', extra: ic.unknownKeys.slice(0, 8) }; }
    const lim = limits();
    const c = countsOf(bp);
    const over = Object.keys(lim).filter(function (k) { return (c[k] || 0) > lim[k]; });
    if (over.length) {
      note('too-many');
      return { ok: false, reason: 'too-many', over: over.map(function (k) { return k + '(' + c[k] + '>' + lim[k] + ')'; }), counts: c, limits: lim };
    }
    const ec = targetEmpty();
    if (!ec.empty) {
      note('not-empty');
      return { ok: false, reason: 'not-empty', what: ec.what,
        hint: '蓝图安装只作用于空新局（' + ec.what.join('、') + '）—— 不覆盖既有存档' };
    }
    // 同名解析：按 key 引用（首选）；按名字解析时命中多 key ⇒ 明确拒收，不静默挑一个。
    const byName = {};
    (bp.ids.people || []).forEach(function (r) { const n = clean(r.name, 30); (byName[n] = byName[n] || []).push(r.key); });
    const amb = Object.keys(byName).filter(function (n) { return byName[n].length > 1; });
    const idMap = (bp.ids.people || []).map(function (r) {
      return { key: r.key, display: r.name, aliases: (r.aliases || []).slice(),
        ambiguous: byName[r.name].length > 1 };
    });
    const scene = sceneOf(bp);
    const plan = {
      bpVer: bp.bpVer, bpSig: bp.bpSig, worldKey: bp.worldKey, keep: bp.keep,
      ids: { people: (bp.ids.people || []).slice(), powers: (bp.ids.powers || []).slice(),
        places: (bp.ids.places || []).slice(), resources: (bp.ids.resources || []).slice() },
      relations: (bp.relations || []).slice(), roads: (bp.roads || []).slice(),
      era: Object.assign({}, bp.era || {}), roster: (bp.roster || []).slice(),
      mech: Object.assign({}, bp.mech || {}), scene: scene, deps: (bp.deps || []).slice(),
      counts: c, _fixed: true
    };
    const idn = chatIdentity();
    let ticket = null;
    if (WA.store && typeof WA.store.claimAsync === 'function') {
      try { const cc = WA.store.claimAsync('worldBlueprint:previewImport'); if (cc && cc.ok) ticket = cc.ticket; } catch (e) {}
    }
    _previewSeq++;
    if (_pending && _pending.ticket && _pending.ticket !== ticket &&
        WA.store && typeof WA.store.dropAsync === 'function') {
      try { WA.store.dropAsync(_pending.ticket); } catch (e) {}
    }
    _pending = { bpSig: bp.bpSig, bpVer: bp.bpVer, chatId: idn.chatId, epoch: idn.epoch,
      rev: idn.rev, seq: _previewSeq, plan: plan, at: clockNow(), ticket: ticket };
    _stat.previews++; _stat.lastReason = 'previewed';
    return { ok: true, plan: plan, counts: c, idMap: idMap,
      ambiguousNames: amb, deps: plan.deps,
      retainNote: RETAIN_NOTE, previewSeq: _previewSeq, chatId: idn.chatId, ticket: ticket,
      // 场景起点与默认清零**分别**声明（两者在读数上必须分得开）。
      scene: { id: scene.id, enabled: scene.enabled, zeroed: scene.zeroed } };
  }

  const RETAIN_NOTE = '保留层级：人物稳定 ID 与别名、关系方向与档位、势力名字与权重、'
    + '地点（含 kind / 归属 / 开关时刻）、道路端点与时长容量、时代与日历起点、'
    + '受支持的静态人设与机制开关。不保留：人物私密记忆、聊天文本、已完成事件、'
    + '编年史 / 暗流 / 回声 / 事实、外部凭据与可执行脚本 —— 蓝图搬的是**结构**，不是**这一局发生过什么**。';

  /** 格式门（两道）：版本与形状。 */
  function formatGate(bp) {
    if (!bp || typeof bp !== 'object' || Array.isArray(bp)) { note('bad-blueprint'); return { ok: false, reason: 'bad-blueprint' }; }
    if (num(bp.bpVer) !== BP_VER) {
      note('bad-bp-ver');
      return { ok: false, reason: 'bad-bp-ver', got: bp.bpVer, supported: BP_VER,
        hint: '未知版本的蓝图**明确拒收**，不按 v1 猜着收（「包是好的只是旧」与「包是坏的」在处置上是两件事）' };
    }
    if (!bp.ids || typeof bp.ids !== 'object') { note('bad-blueprint'); return { ok: false, reason: 'bad-blueprint', field: 'ids' }; }
    return null;
  }

  /** 场景起点解析：默认 `blank` 且 `zeroed: true`（清零是**默认**，不是副作用）。 */
  function sceneOf(bp) {
    const sc = (bp.scene && typeof bp.scene === 'object') ? bp.scene : {};
    const id = SCENES.some(function (x) { return x.id === clean(sc.id, 20); }) ? clean(sc.id, 20) : 'blank';
    const enabled = sc.enabled === true && id !== 'blank';
    return { id: id, enabled: enabled, zeroed: true,
      progress: { round: 0, chronicle: 0, currents: 0, echoes: 0 } };
  }

  /** 容量界限：从**既有容器登记**取值（不另写一套常量 —— cap 的单一真源在 evict/store）。 */
  function limits() {
    const out = { people: 48, places: 40, roads: 40, powers: 16, relations: 120, roster: 48 };
    try {
      const decls = (WA.evict && typeof WA.evict.siteDecls === 'function') ? WA.evict.siteDecls() : {};
      [['people', 'people'], ['world.places', 'places'], ['world.roads', 'roads'],
        ['evolution.factions', 'powers']].forEach(function (pair) {
        const d = decls[pair[0]];
        const c = d && (typeof d.cap === 'number' ? d.cap : num(d.cap));
        if (c) out[pair[1]] = c;
      });
    } catch (e) {}
    return out;
  }

  /**
   * 导入确认：一次 store.transact 装完整结构。
   *   无预览 ⇒ no-preview；目标非空 ⇒ not-empty（事务外预检 + 事务内 draft 复核两道）；
   *   失败不半写（transact 原子性）。确认即消费票据；**拒收也消费**。
   */
  function importBlueprint(bp, opt) {
    const cfg = settings();
    if (!cfg.enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    const s = state();
    // 重复导入：先查**持久真源** blueprint.installed（确认后 _pending 已消费清空，
    //   再确认若先查 _pending 会误报 no-preview，而「装过了」与「没预览过」是两件事）。
    if (s.blueprint && s.blueprint.installed) {
      const ins = s.blueprint.installed;
      note('already');
      return { ok: true, reason: 'already', installedAt: ins.at, installed: ins.counts,
        bpSig: ins.bpSig, repeat: true };
    }
    if (!_pending) { note('no-preview'); return { ok: false, reason: 'no-preview', hint: '先 previewImport() 再 importBlueprint()' }; }
    const own = settleOwnership(opt);
    if (own) { clearPending('verdict:' + own.reason); return own; }
    // 票面自洽：传了蓝图就必须与预览那份同签名（否则装下去的不是预览那份）。
    if (bp && bp.bpSig && bp.bpSig !== _pending.bpSig) {
      note('pending-mismatch'); clearPending('pending-mismatch');
      return { ok: false, reason: 'pending-mismatch', detail: '待安装蓝图与预览票据不符（bpSig 对不上）' };
    }
    const ec = targetEmpty();
    if (!ec.empty) { clearPending('not-empty'); note('not-empty'); return { ok: false, reason: 'not-empty', what: ec.what }; }
    const t = _pending;
    const plan = t.plan;
    const now = clockNow();
    let out = null;
    let innerBlock = null;
    const r = WA.store.transact(function (root) {
      const ecIn = targetEmpty(root);
      if (!ecIn.empty) { innerBlock = { ok: false, reason: 'not-empty', what: ecIn.what, atCommit: true }; return false; }
      // ① 势力
      root.evolution = root.evolution || {};
      root.evolution.factions = (plan.ids.powers || []).map(function (p) {
        return { id: WA.rand.id('fa_', 4, 'id'), name: p.name, scope: plan.era.title || '',
          status: '稳固', relation: '中立', currentGoal: '', core_person: '',
          powerPillars: [], power: num(p.weight) || 0 };
      });
      // ② 人物：走**唯一写者**（registry.ensurePerson），并用蓝图 key → 实际 id 的映射表。
      root.people = {};
      const keyToId = {};
      (plan.ids.people || []).forEach(function (r0) {
        const id = WA.rand.id('np_', 4, 'id');
        keyToId[r0.key] = id;
        const p = (WA.registry && typeof WA.registry.ensurePerson === 'function')
          ? (WA.registry.ensurePerson(root, id, r0.name, 'worldBlueprint').row || null)
          // v2.173.0（TX4b）：fallback 建人点**必须同带淘汰排序键 updatedAt** —— 主路
          //   （registry.ensurePerson）在下面统一补，这条旁路若不补，registry 缺席时
          //   刚装好的世界会因缺键被优先挤出（evict-meta C2b 的立论同款）。
          : (root.people[id] = { id: id, name: r0.name, knowledge: {}, createdVia: 'worldBlueprint:fallback', createdAt: now, updatedAt: now });
        if (!p) return;
        p.profile = { relations: [] };
        p.updatedAt = now;             // 淘汰排序键：缺这一格，刚装好的世界会优先被挤出
        // 别名：蓝图里声明过的别名**落在人物行自己的 profile.fields.aliases** 上 ——
        //   不写进 registry 的全局别名表：那张表按**名字**键，两个同名人物会互相覆盖，
        //   而「同名不合并」正是本模块存在的理由之一。写在这里，导入侧照样查得到。
        if (Array.isArray(r0.aliases) && r0.aliases.length) {
          p.profile.fields = { name: r0.name, aliases: r0.aliases.slice(0, 4) };
        }
      });
      // ③ 关系（**按 key 复原**，方向保留）
      (plan.relations || []).forEach(function (e) {
        const a = keyToId[e.from], b = keyToId[e.to];
        if (!a || !b || a === b) return;
        const iv = e.band === 'near' ? 60 : (e.band === 'far' ? -30 : 0);
        const pa = root.people[a];
        if (!pa) return;
        if (!pa.profile) pa.profile = { relations: [] };
        if (!Array.isArray(pa.profile.relations)) pa.profile.relations = [];
        if (pa.profile.relations.some(function (x) { return x && x.target === b; })) return;
        pa.profile.relations.push({ target: b, intimacy: iv, trust: 0, hostility: 0,
          vigilance: 0, attachment: 0, boundary_status: '', at: now });
      });
      // ④ 地点（**带 kind / 归属 / 开关时刻**）
      root.world = root.world && typeof root.world === 'object' && !Array.isArray(root.world) ? root.world : {};
      const placeKeyToName = {};
      root.world.places = (plan.ids.places || []).map(function (p) {
        placeKeyToName[p.key] = p.name;
        return { id: 'pl_' + p.name, name: p.name, kind: p.kind || 'public', parent: p.parent || '',
          open: num(p.open) || 0, close: num(p.close) || 0, uses: [], at: now };
      });
      // ⑤ 道路（**端点复原** —— 这是蓝图对种子的净增量）
      root.world.roads = (plan.roads || []).map(function (rd) {
        const a = placeKeyToName[rd.a], b = placeKeyToName[rd.b];
        if (!a || !b) return null;
        const row = { id: 'rd_' + a + '_' + b, a: a, b: b, minutes: num(rd.minutes) || 0,
          cap: num(rd.cap) || 0, at: now };
        if (rd.capBy && typeof rd.capBy === 'object') row.capBy = Object.assign({}, rd.capBy);
        return row;
      }).filter(Boolean);
      // ⑥ 时代与日历起点
      root.background = root.background && typeof root.background === 'object' ? root.background : {};
      root.background.text = plan.era.note || plan.era.title || '';
      root.background.updatedAt = now;
      root.clock = root.clock && typeof root.clock === 'object' ? root.clock : {};
      root.clock.label = plan.era.label || '';
      root.clock.dayIndex = num(plan.era.dayIndex) || 0;
      root.clock.source = root.clock.source === 'unset' ? 'engine' : root.clock.source;
      // ⑦ 进度面清零（**显式**写零，而不是「恰好没写」）
      root.evolution.round = 0;
      root.chronicle = []; root.currents = []; root.echoes = [];
      // ⑧ 受支持的静态人设（分节白名单）
      (plan.roster || []).forEach(function (rp) {
        const id = keyToId[rp.key];
        if (!id || !root.people[id]) return;
        const p = root.people[id];
        if (!p.profile) p.profile = { relations: [] };
        Object.keys(rp.sections || {}).forEach(function (k) {
          if (PROFILE_SECS.indexOf(k) < 0) return;
          p.profile[k] = (rp.sections[k] || []).slice(0, 20);
        });
      });
      // ⑨ 机制配置（只对有该引擎的键生效）
      Object.keys(plan.mech || {}).forEach(function (eng) {
        const e = WA[eng];
        if (!e || typeof e.setSettings !== 'function') return;
        try { e.setSettings(Object.assign({}, plan.mech[eng])); } catch (err) {}
      });
      // ⑩ 安装留痕（**持久真源**：跨会话知道这个世界从哪张蓝图来）
      root.blueprint = root.blueprint && typeof root.blueprint === 'object' ? root.blueprint : { library: [], seq: 0, installed: null };
      root.blueprint.installed = { bpVer: t.bpVer, bpSig: t.bpSig, worldKey: plan.worldKey,
        keep: plan.keep, at: now, chatId: t.chatId, previewSeq: t.seq,
        scene: { id: plan.scene.id, enabled: plan.scene.enabled, zeroed: plan.scene.zeroed },
        counts: plan.counts };
      out = { ok: true, installed: plan.counts, installedAt: now, bpSig: t.bpSig,
        bpVer: t.bpVer, worldKey: plan.worldKey, keep: plan.keep,
        chatId: t.chatId, previewSeq: t.seq,
        scene: { id: plan.scene.id, enabled: plan.scene.enabled, zeroed: plan.scene.zeroed },
        deps: plan.deps };
    }, 'worldBlueprint:import');
    if (r && r.ok === false) {
      if (innerBlock) { note('not-empty'); return innerBlock; }
      note(r.reason || 'store-unavailable');
      return { ok: false, reason: r.reason || 'store-unavailable' };
    }
    _stat.imports++; _stat.lastReason = 'imported';
    _pending = null;   // 确认即消费
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function statOf() {
    const cfg = settings();
    const ins = (function () { try { return (state().blueprint || {}).installed || null; } catch (e) { return null; } })();
    return Object.assign({}, _stat, {
      faults: Object.assign({}, _stat.faults),
      enabled: !!cfg.enabled, libCap: cfg.libCap,
      total: listOf().length,
      bpVer: BP_VER, keepLevels: KEEP_LEVELS.map(function (x) { return x.id; }),
      scenes: SCENES.map(function (x) { return x.id; }),
      hasPending: !!_pending, hasInstalled: !!ins,
      hasLast: !!_last, lastSig: _lastSig,
      installedBpVer: ins ? ins.bpVer : null, installedSig: ins ? ins.bpSig : null,
      retainNote: RETAIN_NOTE,
      limits: limits()
    });
  }

  WA.worldBlueprint = {
    BP_VER: BP_VER,
    KEEP_LEVELS: KEEP_LEVELS.map(function (x) { return Object.assign({}, x); }),
    SCENES: SCENES.map(function (x) { return Object.assign({}, x); }),
    getSettings: settings,
    setSettings: saveSettings,
    exportBlueprint: exportBlueprint,
    checkIntegrity: checkIntegrity,
    save: save,
    get: get,
    list: list,
    drop: drop,
    previewImport: previewImport,
    importBlueprint: importBlueprint,
    targetEmpty: targetEmpty,
    stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/world-blueprint.js', { kind: 'engine', ver: '2.164.0' });
})();
