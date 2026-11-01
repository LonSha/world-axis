/**
 * WorldAxis engines/playable-seed.js（v2.281.0 · V7 OPV7-6）— 开局即喂
 * 把一个已安装的玩法蓝图，**按各引擎真写口**播种成结构化世界。
 *
 * 【它治什么（现场立据，tools/v7probes/p_seed_gap.js）】
 *   装完三份样例蓝图后实测：
 *     people 6 / places 12 / worldFactions 4 / **evoFactions 0**
 *     lifeGoals 0 / lifeSchedule 0 / bondsRows 0 / eventRows 0 / plans 0 / rostered 0
 *   也就是说开局只装了「人是谁、地方在哪」。而「人在追什么（life.goals）」
 *   「他怎么安排一天（life.schedule）」「他们之间是什么关系（bonds）」
 *   「他属于哪个组织（org.roster）」全是零 —— 而这些恰恰是有专门结构、
 *   专门容量、专门注入面的机制。世界开局就是一台「有演员、没剧本」的舞台。
 *
 *   同一份探针还照出一个**真缺陷**（本版一并修，见 playable-blueprint 的势力段）：
 *   蓝图把势力写进 `world.factions`，而全仓**零读口**；
 *   `org` / `editorFaction` / `diplomacy` / `evolution` 一律读 `evolution.factions`。
 *   写进没人读的键，在读数上与「没写」长得一样 —— 探针里 `org.assignRole` 因此
 *   直接 skipped（`firstEvoFaction = null`）。
 *
 * 【四条硬纪律】
 *   ① **只走各引擎真写口**（`life.addGoal` / `life.addSchedule` / `bonds.setBond` /
 *      `org.assignRole`），不直写 store。直写会绕开各引擎自己的容量、挤出、记账与拒收。
 *   ② **不编事实值**。目标文本/日程活动/关系型的每一个实词必须能追到两处之一：
 *      蓝图原文（stages / method / recipe.types / role / place / 势力名）或
 *      本模块的 `TEMPLATE` 句式常量表。探针 `p_seed.js` 逐字核对这一条。
 *      一处都取不到 ⇒ 这一行不播（记 `no-source` 由 preview 的 counts 体现），
 *      **绝不编一句「他想要更好的生活」**。
 *   ③ **不造第二真源**。本模块不新建势力、不新建人物、不改任何蓝图定义 ——
 *      势力由安装器写进 `evolution.factions`（与 org/editorFaction 同源），
 *      人物由安装器建。本模块只补「结构位」。
 *   ④ **幂等**。同一份蓝图装两次、或玩家手动补过一条，都不重复播 ——
 *      每条落笔前按现场读取比对（目标比 text、日程比 activity、
 *      关系比 `bonds.read`、名册比 roster 键）。重复播会白占容量并把后来的真实内容挤出。
 *
 * 【关系型为什么一律「平行共存」】
 *   六型里它有最弱的语义承诺：两人共存于同一地点，**仅此而已**。
 *   此刻没有任何事件依据能支撑「替身」「寄生拯救」这类判断，
 *   而播种不是叙事决策 —— 挑一个更好看的型就是把解读当事实写进世界。
 *
 * 【导出面（6 口，每口都有真消费者）】
 *   getSettings / setSettings —— 设置页与面板
 *   preview  —— 只算不写（seed 内部先调它；诊断面也能预读「开局会播什么」）
 *   seed     —— 真播（installSample 成功之后调用；面板据此有「补播」按钮）
 *   view     —— 读数（tool-diag 的 playableSeed 节）
 *   stat     —— 分桶计数（拒因可数）
 */
(function () {
  'use strict';
  // 别名必须是**静态图认的**那一种形态（与 engines/driver-ledger.js 逐字同形）：
  //   tests/module-cycle-gate.js 的 ALIAS_RE 只认 `const X = (HOST.WorldAxis = HOST.WorldAxis || {})`。
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const LS_KEY = 'worldaxis_playable_seed_settings_v1';
  const DEF = { enabled: true, bondPairs: 8, roster: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'playableSeed', bounds: { bondPairs: [0, 24] } };

  /**
   * 句式常量表：**本模块唯一的「知识」**，也因此是唯一要审的地方。
   *   占位符只允许填蓝图原文里的字段（见 preview 的取值处）。
   *   探针会把播种出来的每一句切开，逐词核对「它要么在这张表里、要么在蓝图原文里」。
   */
  const TEMPLATE = {
    goalTrain: '练到 {stage}（{method}）',
    goalRecipe: '把 {type} 做起来',
    goalDuty: '替 {faction} 做事',
    schedDuty: '{role}值守',
    bondDefault: '平行共存',
    note: '只填结构位：目标引用蓝图声明的训练阶段/配方类型/势力名，日程取蓝图声明的岗位与地点，'
      + '关系型一律取六型里最弱的「平行共存」（此刻没有任何事件依据，不做剧情判断）。'
  };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = {
    runs: 0, planned: 0, written: 0, skipped: 0, blocked: 0,
    lastReason: '', reasons: {}, byKind: {}
  };
  function note(reason) { stat.reasons[reason] = (stat.reasons[reason] || 0) + 1; stat.lastReason = reason; }
  function noteKind(kind) { stat.byKind[kind] = (stat.byKind[kind] || 0) + 1; }

  function clean(v, max) {
    const s = (v === null || v === undefined) ? '' : String(v).trim();
    return max ? s.slice(0, max) : s;
  }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };

  /** 填一次性占位：缺任何一个键就返回 ''（不半填 —— 半填出来的句子是编的）。 */
  function fill(tpl, vars) {
    let ok = true;
    const s = String(tpl).replace(/\{(\w+)\}/g, function (_, k) {
      const v = vars[k];
      if (v === undefined || v === null || String(v).trim() === '') { ok = false; return ''; }
      return String(v).trim();
    });
    return ok ? s : '';
  }

  /** 取已安装的蓝图：显式 sampleId 优先，否则最近安装的那份。取不到如实回。 */
  function blueprint(sampleId) {
    const st = state();
    const bp = (st.blueprint && typeof st.blueprint === 'object') ? st.blueprint : null;
    if (!bp || !bp.installed || typeof bp.installed !== 'object') {
      return { ok: false, reason: 'no-blueprint', sampleId: null };
    }
    const id = clean(sampleId, 60) || clean(bp.latestInstalled, 60);
    const inst = id ? bp.installed[id] : null;
    if (!inst) return { ok: false, reason: 'no-blueprint', sampleId: id || null };
    // 玩法定义/初始条件的唯一真源是**蓝图模块自己**（它才是这些字段的作者），此处不复制一份。
    let defs = inst.playDefs || null, init = null;
    if (WA.playableBlueprint && typeof WA.playableBlueprint.getSample === 'function') {
      const r = (function () { try { return WA.playableBlueprint.getSample(id); } catch (e) { return null; } })();
      if (r && r.ok && r.sample) { init = r.sample.initConditions || null; if (!defs) defs = r.sample.playDefs; }
    }
    return { ok: true, sampleId: id, playDefs: defs || {}, initConditions: init || {}, installedAt: inst.installedAt || 0 };
  }

  /** 现场的势力（org/editorFaction/diplomacy 的共同真源）：`evolution.factions`。 */
  function factions() {
    const ev = (state().evolution || {}).factions;
    return Array.isArray(ev) ? ev : [];
  }
  function factionNames() {
    return factions().map(function (f) { return clean(f && f.name, 40); }).filter(Boolean);
  }

  /** 人物在读口上的**显示名**（people 键是 p_<name>，名字真源在行里）。 */
  function peopleList() {
    const people = state().people || {};
    return Object.keys(people).map(function (id) {
      const p = people[id] || {};
      return { id: id, name: clean(p.name, 60) || clean(id.replace(/^p_/, ''), 60), where: clean(p.where, 40) };
    }).filter(function (p) { return !!p.name; });
  }

  /**
   * 算出「该播什么」（**只读，零写**）。
   *   每一行带 `src` 说明它的实词来自蓝图哪一处 —— 这是「不编事实」的可审凭据。
   */
  function preview(opts) {
    const o = opts || {};
    const bp = blueprint(o.sampleId);
    if (!bp.ok) return { ok: false, reason: bp.reason, sampleId: bp.sampleId || null };
    const cfg = settings();
    const defs = bp.playDefs || {};
    const init = bp.initConditions || {};
    const facs = factionNames();
    const people = peopleList();
    const rows = [];
    const noSource = [];

    const train = (defs.training && typeof defs.training === 'object') ? defs.training : null;
    const stages = (train && Array.isArray(train.stages)) ? train.stages.filter(Boolean) : [];
    const recipeTypes = (defs.recipe && Array.isArray(defs.recipe.types)) ? defs.recipe.types.filter(Boolean) : [];
    const facDecl = (Array.isArray(init.factions) ? init.factions : []).map(function (f) { return clean(f && f.name, 40); }).filter(Boolean);
    // 势力只在**两边都有**的时候才用（本模块不造组织，只认安装器已经写进 evolution.factions 的）
    const fac = facs.filter(function (n) { return facDecl.indexOf(n) >= 0; })[0] || '';
    const initPeople = Array.isArray(init.initialPeople) ? init.initialPeople : [];

    people.forEach(function (p) {
      // ① 目标：训练阶段 → 配方类型 → 势力名（三处都取不到 ⇒ 不播，如实记 no-source）
      let goal = '', goalSrc = '';
      if (stages.length) {
        goal = fill(TEMPLATE.goalTrain, { stage: stages[stages.length - 1], method: train.method });
        goalSrc = 'playDefs.training.stages[last]+method';
      }
      if (!goal && recipeTypes.length) {
        goal = fill(TEMPLATE.goalRecipe, { type: recipeTypes[0] });
        goalSrc = 'playDefs.recipe.types[0]';
      }
      if (!goal && fac) {
        goal = fill(TEMPLATE.goalDuty, { faction: fac });
        goalSrc = 'initConditions.factions[0].name';
      }
      if (goal) rows.push({ kind: 'goal', who: p.name, text: goal, src: goalSrc });
      else noSource.push('goal:' + p.name);

      // ② 日程：岗位（role）来自蓝图原文，地点取安装器写进人物行的 where
      const row = initPeople.filter(function (x) { return clean(x && x.name, 60) === p.name; })[0] || null;
      const activity = fill(TEMPLATE.schedDuty, { role: clean(row && row.role, 40) });
      if (activity) {
        rows.push({ kind: 'schedule', who: p.name, activity: activity,
          location: p.where || '', src: 'initConditions.initialPeople[].role+place' });
      } else noSource.push('schedule:' + p.name);

      // ③ 势力归属：势力必须**已经在** evolution.factions 里
      if (cfg.roster) {
        if (fac) rows.push({ kind: 'roster', who: p.name, faction: fac, roleId: 'novice',
          src: 'evolution.factions∩initConditions.factions' });
        else noSource.push('roster:' + p.name);
      }
    });

    // ④ 关系：同一地点相邻两人一对（链式，不做全连接 —— 全连接会当场挤爆 bonds.rows 容量）
    const byPlace = {};
    people.forEach(function (p) {
      const k = p.where || '?';
      byPlace[k] = byPlace[k] || [];
      byPlace[k].push(p.name);
    });
    let pairs = 0;
    Object.keys(byPlace).sort().forEach(function (k) {
      const arr = byPlace[k];
      for (let i = 0; i + 1 < arr.length && pairs < cfg.bondPairs; i++) {
        rows.push({ kind: 'bond', a: arr[i], b: arr[i + 1], types: [TEMPLATE.bondDefault],
          src: '同地点(' + k + ')结构相邻' });
        pairs++;
      }
    });

    stat.planned = rows.length;
    return {
      ok: true, sampleId: bp.sampleId, rows: rows, noSource: noSource,
      counts: {
        goal: rows.filter(function (r) { return r.kind === 'goal'; }).length,
        schedule: rows.filter(function (r) { return r.kind === 'schedule'; }).length,
        bond: rows.filter(function (r) { return r.kind === 'bond'; }).length,
        roster: rows.filter(function (r) { return r.kind === 'roster'; }).length
      },
      note: TEMPLATE.note
    };
  }

  /** 现场是否已有同一条（幂等判据，全部读引擎自己的读口/容器）。 */
  function exists(row) {
    const st = state();
    const p = row.who ? ((st.people || {})['p_' + row.who] || null) : null;
    if (row.kind === 'goal') {
      const L = (p && p.life) || {};
      return !!((L.goals || []).filter(function (g) { return g && clean(g.text, 80) === clean(row.text, 80); }).length);
    }
    if (row.kind === 'schedule') {
      const L = (p && p.life) || {};
      return !!((L.schedule || []).filter(function (s) {
        return s && clean(s.activity, 40) === clean(row.activity, 40);
      }).length);
    }
    if (row.kind === 'bond') {
      // 读口在开关关着时回 `{ok:true, types:[], reason:'disabled'}` —— 那不是「没有」，
      //   是「读不出来」。两者处置完全相反：把「读不出来」当成「没有」，就会每播一次
      //   重写一次（幂等在该开关态下静默失效 —— 本版实测踩到：bonds 出厂 enabled:false，
      //   第二次播种 written 由 0 变成 1）。故先认 disabled，再走容器直读兜底：
      //   真正要回答的是「现场有没有这一对」，那是容器里的事实，不依赖读口开不开。
      const r = (function () { try { return WA.bonds.read(row.a, row.b); } catch (e) { return null; } })();
      if (r && Array.isArray(r.types) && r.types.length) return true;
      const key = [clean(row.a, 40), clean(row.b, 40)].sort().join('×');
      return (((st.bonds || {}).rows) || []).some(function (x) { return x && x.key === key; });
    }
    if (row.kind === 'roster') {
      const f = factions().filter(function (x) { return clean(x && x.name, 40) === row.faction; })[0] || null;
      return !!(f && f.roster && f.roster[row.who]);
    }
    return false;
  }

  /** 调一个写口并记账。**disabled 藏在 ok:true 里**是既有形态，必须先认它（见 intake-dispatch 同款注释）。 */
  function fire(row) {
    let res = null;
    try {
      if (row.kind === 'goal') {
        if (!WA.life || typeof WA.life.addGoal !== 'function') { note('engine-missing'); return false; }
        res = WA.life.addGoal(row.who, { text: row.text });
      } else if (row.kind === 'schedule') {
        if (!WA.life || typeof WA.life.addSchedule !== 'function') { note('engine-missing'); return false; }
        const t0 = clockNow('playableSeed');
        res = WA.life.addSchedule(row.who, { activity: row.activity, location: row.location, start: t0 + 3600000, end: t0 + 18000000 });
      } else if (row.kind === 'bond') {
        if (!WA.bonds || typeof WA.bonds.setBond !== 'function') { note('engine-missing'); return false; }
        res = WA.bonds.setBond(row.a, row.b, row.types);
      } else if (row.kind === 'roster') {
        if (!WA.org || typeof WA.org.assignRole !== 'function') { note('engine-missing'); return false; }
        res = WA.org.assignRole(row.faction, row.who, row.roleId);
      } else { note('bad-kind'); return false; }
    } catch (e) { note('threw'); return false; }

    const why0 = (res && res.reason) ? String(res.reason) : '';
    if (why0 === 'disabled') { note('disabled'); return false; }
    if (res && res.ok) { noteKind(row.kind); stat.written++; return true; }
    note(why0 || 'unknown');
    return false;
  }

  /**
   * 播种。**只允许在 store 事务之外调用**（写口内部各自 transact，嵌进来会回滚连锁）。
   * @returns {{ok, sampleId, planned, written, skipped, blocked, byKind, reasons, counts}}
   */
  function seed(opts) {
    const o = opts || {};
    const cfg = settings();
    if (!cfg.enabled && o.force !== true) { stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const pv = preview(o);
    if (!pv.ok) { note(pv.reason); return { ok: false, reason: pv.reason, sampleId: pv.sampleId || null }; }
    if (o.dryRun) return { ok: true, dryRun: true, sampleId: pv.sampleId, planned: pv.rows.length, counts: pv.counts };

    stat.runs++;
    let written = 0, skipped = 0, blocked = 0;
    const okKinds = {};
    pv.rows.forEach(function (row) {
      if (exists(row)) { skipped++; stat.skipped++; note('already'); return; }
      if (fire(row)) { written++; okKinds[row.kind] = (okKinds[row.kind] || 0) + 1; }
      else blocked++;
    });
    if (written && WA.log) {
      WA.log('info', '[playableSeed] 开局播种 sample=' + pv.sampleId
        + ' written=' + written + ' skipped=' + skipped + (blocked ? ' blocked=' + blocked : ''));
    }
    return { ok: true, sampleId: pv.sampleId, planned: pv.rows.length,
      written: written, skipped: skipped, blocked: blocked,
      byKind: okKinds, reasons: Object.assign({}, stat.reasons), counts: pv.counts };
  }

  /** 面板/诊断读数（只读）。 */
  function view() {
    const cfg = settings();
    const st = state();
    const bp = (st.blueprint && st.blueprint.latestInstalled) ? st.blueprint.latestInstalled : null;
    const pv = (function () { const r = preview({}); return r.ok ? r : null; })();
    return {
      enabled: !!cfg.enabled, bondPairs: cfg.bondPairs, roster: !!cfg.roster,
      blueprint: bp,
      planned: pv ? pv.rows.length : 0,
      noSource: pv ? pv.noSource.slice() : [],
      counts: pv ? pv.counts : { goal: 0, schedule: 0, bond: 0, roster: 0 },
      stat: Object.assign({}, stat, { reasons: Object.assign({}, stat.reasons),
        byKind: Object.assign({}, stat.byKind) }),
      note: TEMPLATE.note
    };
  }

  WA.playableSeed = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    preview: preview,
    seed: seed,
    view: view,
    stat: function () {
      return Object.assign({}, stat, { reasons: Object.assign({}, stat.reasons),
        byKind: Object.assign({}, stat.byKind) });
    }
    // TEMPLATE **不导出**：它是「本模块唯一的知识」，但它是**数据成员**而非函数口，
    //   导出去只会在死子面账本上落一条 dataOnly（判据要核它，走 view().note 与
    //   探针的逐词核对即可 —— 那才是真实输入面）。宁可少一个面，不留一个没人读的口。
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/playable-seed.js', { kind: 'engine', ver: '2.281.0' });
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/playable-seed 已加载（2.281.0）');
  }
})();