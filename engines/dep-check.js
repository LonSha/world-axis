/**
 * WorldAxis engines/dep-check.js (v2.187.0) — E8 蓝图 / 种子依赖包与迁移助手（**纯读**）
 *
 * ── 它治什么（缺口，计划原文）──────────────────────────────────
 *   「蓝图与种子已有，缺『缺了什么、能不能用、怎么降级』的报告。」
 *   现场确实如此：`world-blueprint.checkIntegrity` 只答「这份蓝图内部自洽吗」
 *   （重复 key / 悬空引用 / 未知顶层键），`previewImport` 只答「现在能不能装」
 *   （六道门 + 目标非空）；`world-seed` 答「用同样的格局开新局」并如实标注损失；
 *   `checkpoints.migrate` 答「这份信封能不能迁到当前格式」。
 *   四家各自答得很清楚，但**没有一条把它们并成一句「这一坨东西在你这台机器上到底能不能用」**。
 *   玩家手上拿到的是一份从别人那儿拷来的 JSON —— 他要的是体检报告，不是四份读数。
 *
 * ── 本模块只做一件事：把「可搬物 → 环境」的落差算成可机械判定的读数 ──
 *   · `check(payload)`   —— 依赖体检：体裁判定 / 格式版本 / 依赖三项态 / 机制开关落差 /
 *                           降级损失 / 可迁移性 / 总判（四态封闭集）
 *   · `prepare(payload)` —— 迁移助手：候选转换（**只出计划，不动原文件**）
 *   · `catalog()`        —— 可体检体裁与依赖类目的封闭集（面板念的就是这一份）
 *   · `diagnose()` / `stat()`
 *   判定源全部是**既有模块的公开读口**：`worldBlueprint.BP_VER` / `worldSeed.SEED_VER` /
 *   `checkpoints.FORMAT` + `migrations()` + `migrate()` / `recipe.SOURCE_FILES` + `staleness()` /
 *   `compat.context()` / `worldbook.peekEntries()` / `store` 骨架。
 *   本模块**不自带任何一份版本号或依赖清单副本**。
 *
 * ── 边界（全是否定式，逐条来自计划原文）────────────────────────
 *   1 默认关（enabled:false）。
 *   2 **只读**：零 `store.transact`、零文件写、**不驱动任何模块干活**
 *     （不为了核对 pack 版本去调 `worldSeed.importPack` —— 那会动它的计数器，
 *      「我这轮体检」变成「我改了别人的台账」）。
 *   3 **缺依赖就明说缺**：每项依赖都有 `state`，`absent` 一律进 `missing` 并计入总判；
 *     不静默跳过，也不把缺项折成「大概能跑」。
 *   4 **不假装可用**：只要有缺席依赖、探不出的类目、或版本不合 ⇒ 总判**永不**是 `usable`
 *     （`unknown` 是一个合法结论，不是「差不多能用」的委婉说法）。
 *   5 **旧的有损种子继续如实标注损失**：`kind==='seed'` 的损失面**逐字取自**
 *     `worldSeed` 自报的保留说明，本模块**不重写、不软化**；不伪造道路端点或同名身份。
 *   6 **迁移失败必须保留原文件**：`prepare` 返回的永远是**计划**，并带 `srcUntouched:true`
 *     与源指纹 —— 本模块没有任何一条写路径，连「顺便写回去」这条路都不存在。
 *   7 **不把蓝图当完整聊天存档**：`archive.isChatArchive` 对蓝图与种子恒为 `false`，
 *     并把「不含哪几类」逐条列出 —— 把结构蓝图当存档用是这一项最危险的误读。
 *   8 **探不出 ≠ 没有，且环境限制 ≠ 这一份的未知**：`unknown`（探不出）与 `absent`（确实缺）分列；
 *     而「对**所有**可搬物都一样的探不出」（本仓无媒体资产登记面）另归 `envLimited` ——
 *     否则任何一份可搬物的总判都恒为 `unknown`，总判这一列就废了。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_dep_check_settings_v1';
  const DEF = { enabled: false, maxDeps: 24, maxDegrade: 16 };
  const __REG = {
    key: LS_KEY, def: DEF, module: 'depCheck',
    bounds: { maxDeps: [4, 64], maxDegrade: [4, 48] }
  };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus
      ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
      : Object.assign(base, raw || {});
  }
  function saveSettings(next) {
    if (WA.settingsBus) return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})));
    return Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const _stat = { checks: 0, prepared: 0, blocked: 0, degraded: 0, unknown: 0, refused: 0, lastReason: '', faults: {} };
  function fault(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function num(v) { const n = Number(v); return (typeof n === 'number' && isFinite(n)) ? n : null; }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  /** 源指纹（与 blueprint / seed / world-bridge 同族手法：FNV-1a 取低 32 位）。 */
  function sig(s) {
    let h = 2166136261;
    const t = String(s == null ? '' : s);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }
  /** 设置面登记的模块名与诊断面共用一处真源（避免两处各写一遍）。 */
  const MOD_TAG = __REG.module;
  // 注：本模块**没有** srcFail helper —— 它的三个对外口（check / prepare / catalog）各自
  //   持有自己的拒收形状（disabled / bad-shape / unknown-kind），没有一个「源读失败」的共用出口；
  //   凭空挂一个无人调用的 helper，正是本仓点名过的「导出了但没人读」的同族病。

  // ── 体裁判定（封闭集；每一类都由**形状特征**判，不靠名字）──────────────
  const KINDS = ['blueprint', 'seed', 'pack', 'checkpoint'];
  function kindOf(p) {
    if (!isObj(p)) return { ok: false, reason: 'bad-shape' };
    if (p.worldaxisCheckpoint !== undefined) return { ok: true, kind: 'checkpoint', why: 'worldaxisCheckpoint 在场' };
    if (p.packVer !== undefined || (isObj(p.seed) && p.seed.sig)) return { ok: true, kind: 'pack', why: 'packVer / seed.sig 在场' };
    if (p.bpVer !== undefined || isObj(p.ids)) return { ok: true, kind: 'blueprint', why: 'bpVer / ids 在场' };
    if ((p.ver !== undefined || p.sig) && (p.powers || p.network || p.geo)) return { ok: true, kind: 'seed', why: 'ver/sig + 结构面在场' };
    return { ok: false, reason: 'unknown-kind', shape: Object.keys(p).slice(0, 12) };
  }

  // ── 格式版本：**版本号只有一个来源（各自的模块）**，本模块不自带副本 ──────
  function faceOf(got, want, source) {
    if (got === null) return { state: 'blocked', reason: 'bad-format', want: want, source: source };
    if (got === want) return { state: 'ok', got: got, want: want, source: source };
    return got > want
      ? { state: 'blocked', reason: 'too-new', got: got, want: want, source: source }
      : { state: 'blocked', reason: 'no-migration', got: got, want: want, source: source };
  }
  /**
   * 为什么 pack 的信封版本是 `unknown` 而**不是**写一个常量：
   *   `world-seed` 的导出面里**没有** `PACK_VER`（只有 `SEED_VER`）。
   *   本模块若自己写一个 pack 版本号，就出现了**两个版本真源** ——
   *   下一次 world-seed 升版时两处必然分叉，而分叉的表现是
   *   「体检说能装、导入说 bad-pack-ver」：最坏的那种读数（体检本身失效）。
   *   核对它也不需要驱动对方干活（调 importPack 探 supported 会动它的计数器 —— 边界 2）。
   */
  function formatOf(kind, p) {
    if (kind === 'blueprint') {
      const B = WA.worldBlueprint;
      if (!B || num(B.BP_VER) === null) return { state: 'unknown', why: 'version-source-absent', source: 'worldBlueprint.BP_VER' };
      const want = num(B.BP_VER), got = num(p.bpVer);
      if (got === null) return { state: 'blocked', reason: 'missing-fields', field: 'bpVer', want: want, source: 'worldBlueprint.BP_VER' };
      if (got === want) return { state: 'ok', got: got, want: want, source: 'worldBlueprint.BP_VER' };
      return got > want
        ? { state: 'blocked', reason: 'too-new', got: got, want: want, source: 'worldBlueprint.BP_VER' }
        : { state: 'blocked', reason: 'no-migration', got: got, want: want, source: 'worldBlueprint.BP_VER',
            note: '蓝图没有迁移链（格式版本一步到位）—— 不假装能降级装进来' };
    }
    if (kind === 'seed') {
      const S = WA.worldSeed;
      if (!S || num(S.SEED_VER) === null) return { state: 'unknown', why: 'version-source-absent', source: 'worldSeed.SEED_VER' };
      const want = num(S.SEED_VER), got = num(p.ver);
      if (got === null) return { state: 'ok', got: want, want: want, source: 'worldSeed.SEED_VER',
        note: '种子未标版本 —— 按当前版读（与 world-seed 自报口径一致）' };
      return got === want
        ? { state: 'ok', got: got, want: want, source: 'worldSeed.SEED_VER' }
        : (got > want
          ? { state: 'blocked', reason: 'too-new', got: got, want: want, source: 'worldSeed.SEED_VER' }
          : { state: 'blocked', reason: 'no-migration', got: got, want: want, source: 'worldSeed.SEED_VER' });
    }
    if (kind === 'pack') {
      const S = WA.worldSeed;
      const inner = isObj(p.seed) ? p.seed : {};
      const seedFmt = (S && num(S.SEED_VER) !== null)
        ? faceOf(num(inner.ver), num(S.SEED_VER), 'worldSeed.SEED_VER')
        : { state: 'unknown', why: 'version-source-absent', source: 'worldSeed.SEED_VER' };
      return {
        state: 'unknown', why: 'version-source-not-exported', source: 'worldSeed.PACK_VER',
        note: '转移包信封版本（packVer）未由 world-seed 导出 —— 本模块**不自带第二份**，如实报「验不了」；'
          + '这一项验不了，总判就不再是「可用」（不拿「大概能装」冒充「验过了」）',
        envelopeGot: num(p.packVer),
        seed: seedFmt
      };
    }
    if (kind === 'checkpoint') {
      const C = WA.checkpoints;
      if (!C || num(C.FORMAT) === null) return { state: 'unknown', why: 'version-source-absent', source: 'checkpoints.FORMAT' };
      return faceOf(num(p.worldaxisCheckpoint), num(C.FORMAT), 'checkpoints.FORMAT');
    }
    return { state: 'unknown', why: 'kind-unresolved' };
  }

  // ── 依赖项（外部依赖 / 机制 / 配方真源）三族，每项都有 state ────────────
  /**
   * 三态而非两态：`present`（在）/ `absent`（确实缺）/ `unknown`（**探不出**）。
   *   第三态是这一项存在的主要理由 —— 「不知道有没有」与「没有」处置完全相反：
   *   前者要用户去核实，后者要他去找那份依赖。压成一档就是把两者说成一件事。
   */
  function dep(rows, o) {
    rows.push({ id: o.id, label: o.label, kind: o.kind, state: o.state, why: o.why || null,
      required: o.required === true, impact: o.impact || null,
      // `envLimited`：这一项的「探不出」来自**环境的结构性限制**（对所有可搬物一样），
      //   而不是「这一份可搬物有未知」—— 两者处置不同，故必须分列（见 depsOf ⑤ 的长注）。
      envLimited: o.envLimited === true });
  }
  function depsOf(kind, p, cap) {
    const rows = [];
    // ① 世界书面：蓝图导出时把「世界书条目数」如实列进 deps（真源：world-blueprint.depsOf）。
    const declaresWb = (Array.isArray(p.deps) ? p.deps : []).some(function (d) { return String(d).indexOf('worldbook:') === 0; });
    const W = WA.worldbook;
    if (!W || typeof W.peekEntries !== 'function') {
      dep(rows, { id: 'worldbook', label: '世界书条目', kind: 'external', required: declaresWb,
        state: 'absent', why: 'worldbook-absent',
        impact: declaresWb ? '这份蓝图声明了世界书条目，但本侧读不到世界书面' : '世界书面不可读（本侧扩展自身的问题）' });
    } else {
      let n = null;
      try { const e = W.peekEntries(); n = Array.isArray(e) ? e.length : null; } catch (err) { n = null; }
      if (n === null) {
        dep(rows, { id: 'worldbook', label: '世界书条目', kind: 'external', required: declaresWb,
          state: 'unknown', why: 'peek-threw', impact: '世界书面读不出条目数 —— 不知有没有，不等于没有' });
      } else if (declaresWb && n === 0) {
        dep(rows, { id: 'worldbook', label: '世界书条目', kind: 'external', required: true,
          state: 'absent', why: 'declared-but-empty', impact: '蓝图声明需要世界书条目，当前一条都没有' });
      } else {
        dep(rows, { id: 'worldbook', label: '世界书条目', kind: 'external', required: declaresWb,
          state: 'present', why: n + ' 条在场' });
      }
    }
    // ② 宿主角色卡：**只能经 compat.context() 探**；宿主不在场时探不出 ⇒ unknown（不是 absent）。
    let ctx = null;
    try { ctx = (WA.compat && typeof WA.compat.context === 'function') ? WA.compat.context() : null; } catch (e) { ctx = null; }
    if (!ctx) {
      dep(rows, { id: 'host-card', label: '宿主角色卡', kind: 'external', required: false,
        state: 'unknown', why: 'host-context-unavailable',
        impact: '不在 SillyTavern 里 / 宿主上下文取不到 —— 角色卡在不在**没法验**，不等于不在' });
    } else {
      const nm = clean(ctx.name2, 60);
      dep(rows, { id: 'host-card', label: '宿主角色卡', kind: 'external', required: false,
        state: nm ? 'present' : 'absent', why: nm ? ('name2=' + nm) : 'no-name2',
        impact: nm ? null : '宿主上下文在，但取不到角色名（这份可搬物若依赖卡面设定，装进去会是空壳）' });
    }
    // ③ 机制开关：蓝图 mech 白名单（真源：world-blueprint 的机制面，本模块不另立白名单）。
    const mech = isObj(p.mech) ? p.mech : {};
    Object.keys(mech).slice(0, Math.max(1, cap)).forEach(function (eng) {
      const e = WA[eng];
      if (!e || typeof e.getSettings !== 'function') {
        dep(rows, { id: 'mechanism:' + eng, label: '机制 ' + eng, kind: 'mechanism', required: true,
          state: 'absent', why: 'engine-absent', impact: '这份可搬物要求该引擎的开关，但本侧没有这个引擎' });
        return;
      }
      let cur = null;
      try { cur = e.getSettings() || {}; } catch (err) { cur = null; }
      if (cur === null) {
        dep(rows, { id: 'mechanism:' + eng, label: '机制 ' + eng, kind: 'mechanism', required: true,
          state: 'unknown', why: 'settings-threw', impact: '该引擎的开关读不出 —— 验不了，不等于匹配' });
        return;
      }
      const want = mech[eng] || {};
      const off = Object.keys(want).filter(function (k) { return (cur[k] === true) !== (want[k] === true); });
      dep(rows, { id: 'mechanism:' + eng, label: '机制 ' + eng, kind: 'mechanism', required: true,
        state: off.length ? 'absent' : 'present',
        why: off.length ? ('mismatch:' + off.join('+')) : 'matched',
        impact: off.length ? ('需要但未启用的开关：' + off.join('、') + ' —— 装进去会长出一个机制没开的世界') : null });
    });
    // ④ 配方真源：`recipe.SOURCE_FILES` 点名的三类文件对应模块是否在场（真源：engines/recipe.js）。
    const R = WA.recipe;
    if (!R || !isObj(R.SOURCE_FILES)) {
      dep(rows, { id: 'recipe-sources', label: '配方真源（题材 / 行动类型 / 组织）', kind: 'recipe', required: false,
        state: 'unknown', why: 'recipe-absent',
        impact: 'engines/recipe.js 未加载 —— 配方真源清单读不到（这是**本侧**的问题，不是对方的）' });
    } else {
      const pairs = [['themes', 'theme'], ['kinds', 'act'], ['org', 'org']];
      const miss = pairs.filter(function (x) { return !WA[x[1]]; }).map(function (x) { return x[0] + '→' + R.SOURCE_FILES[x[0]]; });
      let stale = null;
      try { stale = (typeof R.staleness === 'function') ? R.staleness() : null; } catch (e) { stale = null; }
      const staleN = stale ? (stale.kinds.length + stale.themes.length + stale.policies.length) : null;
      dep(rows, { id: 'recipe-sources', label: '配方真源（题材 / 行动类型 / 组织）', kind: 'recipe', required: false,
        state: miss.length ? 'absent' : 'present',
        why: miss.length ? ('file-absent:' + miss.join('、')) : ('staleness:' + (staleN === null ? 'unreadable' : staleN)),
        impact: miss.length ? ('配方依赖的真源文件不在场：' + miss.join('、'))
          : (staleN ? '配方里有指向已消失真源的陈旧项 ' + staleN + ' 条' : null) });
    }
    // ⑤ 媒体资产：**本仓没有媒体资产登记面** ⇒ 恒 `env-limited`。
    //   为什么不并进 `unknown`：`unknown` 的语义是「**这一份**可搬物有探不出的项」——
    //   而媒体资产对**所有**可搬物都一样（本仓无登记面，这是环境的结构性限制）。
    //   把两者合成一档的后果实测过：任何一份可搬物的总判都恒为 `unknown`，
    //   于是「验不了」与「验了但有未知」再也分不开，总判这一列就废了。
    //   故媒体资产单列进 `envLimited`，**不参与**总判的 unknown 门（但仍如实报出）。
    dep(rows, { id: 'media', label: '媒体资产（立绘 / 音效 / 图像包）', kind: 'external', required: false,
      state: 'unknown', envLimited: true, why: 'no-registry-in-repo',
      impact: '本扩展没有媒体资产登记面 —— 这类依赖**永远验不了**；不代表它不存在，也不代表它存在' });
    return rows.slice(0, Math.max(1, cap));
  }

  // ── 降级损失：逐字段、与导入侧真源同源 ────────────────────────────────
  /**
   * 「降级报告与导入后的实际状态一致」是计划原文的验收条之一。
   *   做法：损失面**逐条取自导入侧的真源**（保留层级表 / 保留说明），本模块只做**映射与列示**。
   *   源模块缺席时**不猜** —— 报 `unknown` 并说明「损失也算不出来」。
   */
  function degradeOf(kind, p, cap) {
    const rows = [];
    let source = null, unknownWhy = null;
    if (kind === 'blueprint') {
      const B = WA.worldBlueprint;
      if (!B || !Array.isArray(B.KEEP_LEVELS)) unknownWhy = 'keep-levels-source-absent';
      else {
        source = 'worldBlueprint.KEEP_LEVELS';
        const want = clean(p.keep, 20) || 'roster';
        const hit = B.KEEP_LEVELS.filter(function (x) { return x.id === want; })[0];
        rows.push({ field: 'keep', level: want, label: (hit && hit.label) || null, loss: null,
          note: (hit && hit.note) || '保留层级表里没有这一档 —— 装进去按默认档处理' });
        if (want === 'structure') rows.push({ field: 'roster', level: want, loss: '静态人设（personality / worldview / family）不安装' });
        if (want !== 'mech') rows.push({ field: 'mech', level: want, loss: '机制开关不安装（装完要逐个手动开）' });
        if (p.scene && p.scene.zeroed === true) rows.push({ field: 'progress', level: want, loss: '进度归零（轮次 / 编年史 / 暗流 / 回声全为空）' });
      }
    } else if (kind === 'seed' || kind === 'pack') {
      const S = WA.worldSeed;
      let note = null;
      try { note = (S && typeof S.stat === 'function') ? S.stat().retainNote : null; } catch (e) { note = null; }
      if (!note) unknownWhy = 'retain-note-absent';
      else {
        source = 'worldSeed.stat().retainNote';
        const sd = (kind === 'pack') ? (isObj(p.seed) ? p.seed : {}) : p;
        rows.push({ field: 'retain', level: 'seed', loss: null, note: note });
        // 有损格式的两条硬承诺（计划原文点名）：不伪造道路端点、不伪造同名身份。
        const roads = num(sd.geo && sd.geo.roads);
        rows.push({ field: 'geo.roads', level: 'seed', loss: '道路只记**数量**（本格式记 ' + (roads === null ? '?' : roads) + ' 条），端点不还原' });
        rows.push({ field: 'network.nodes', level: 'seed', loss: '人物只有显示名 —— 同名人物**不区分身份**（本格式没有稳定 id）' });
      }
    } else if (kind === 'checkpoint') {
      const C = WA.checkpoints;
      if (!C || !Array.isArray(C.SCOPES)) unknownWhy = 'scopes-source-absent';
      else {
        source = 'checkpoints.SCOPES / GUARDED';
        const scope = clean(p.slot && p.slot.scope, 16) || 'global';
        const keys = (p.slot && Array.isArray(p.slot.keys)) ? p.slot.keys.slice(0, 12) : [];
        rows.push({ field: 'scope', level: scope,
          loss: scope === 'global' ? null : ('只覆盖 ' + (keys.join('/') || '（未列键）') + ' —— 范围外的块原样留在目标世界里') });
        rows.push({ field: 'guarded', level: scope,
          loss: '守卫键（' + (C.GUARDED || []).join('、') + '）永不还原 —— 它在快照里就不存在' });
      }
    } else unknownWhy = 'kind-unresolved';
    return { rows: rows.slice(0, Math.max(1, cap)), source: source, unknown: unknownWhy, unknownWhy: unknownWhy };
  }

  // ── 可迁移性（**单一真源：checkpoints.migrations / migrate**）───────────
  function migrationOf(kind, p) {
    if (kind !== 'checkpoint') {
      const f = formatOf(kind, p);
      const steps = (f.state === 'ok') ? 0 : null;
      return { applicable: f.state === 'ok', steps: steps,
        from: (f.got === undefined ? null : f.got), to: (f.want === undefined ? null : f.want),
        why: f.state === 'ok' ? 'already-current' : (f.reason || f.why || null), note: f.note || null };
    }
    const C = WA.checkpoints;
    if (!C || typeof C.migrate !== 'function' || typeof C.migrations !== 'function') {
      return { applicable: null, steps: null, from: null, to: num(C && C.FORMAT), why: 'migration-source-absent' };
    }
    const mg = C.migrate(p);           // **纯读**：只做深拷 + 链上步进，不落盘（checkpoints 自己声明）
    if (!mg || mg.ok !== true) {
      return { applicable: false, steps: 0, from: num(p.worldaxisCheckpoint), to: num(C.FORMAT),
        why: (mg && mg.reason) || 'migrate-unreadable', known: (C.migrations() || []).slice() };
    }
    const from = num(p.worldaxisCheckpoint), to = num(C.FORMAT);
    const steps = (C.migrations() || []).filter(function (m) { return m >= from && m < to; });
    return { applicable: true, steps: steps.length, from: from, to: to, chain: steps,
      why: steps.length ? 'steps-available' : 'already-current' };
  }

  // ── 总判（封闭词表；四条互不合并的结论）───────────────────────────────
  const VERDICTS = ['usable', 'degraded', 'unknown', 'blocked'];
  const REQUIRED_MISS = function (d) { return d.required && d.state === 'absent'; };
  /** 「这一份可搬物的未知」——**排除**环境结构性限制项（它们对所有可搬物一样，见 depsOf ⑤）。 */
  const OWN_UNK = function (d) { return d.state === 'unknown' && d.envLimited !== true; };
  function verdictOf(shape, fmt, deps, degrade) {
    if (!shape.ok) return 'blocked';
    if (fmt && fmt.state === 'blocked') return 'blocked';
    if (fmt && fmt.state === 'unknown') return 'unknown';
    if (fmt && fmt.seed && fmt.seed.state === 'blocked') return 'blocked';
    if (deps.some(REQUIRED_MISS)) return 'blocked';
    if (deps.some(OWN_UNK) || degrade.unknown) return 'unknown';
    if (deps.some(function (d) { return d.state === 'absent'; })) return 'degraded';
    if ((degrade.rows || []).some(function (r) { return !!r.loss; })) return 'degraded';
    return 'usable';
  }
  /** 判定依据：结论是从哪一步定下来的必须答得出来（否则「为什么是 blocked」只能靠猜）。 */
  function basisOf(verdict, shape, fmt, deps, deg) {
    const missReq = deps.filter(REQUIRED_MISS);
    const unk = deps.filter(OWN_UNK).map(function (d) { return d.id; });
    if (verdict === 'blocked') {
      if (!shape.ok) return 'shape:' + shape.reason;
      if (missReq.length) return 'required-dep-absent:' + missReq[0].id;
      if (fmt && fmt.state === 'blocked') return 'format:' + (fmt.reason || 'blocked');
      if (fmt && fmt.seed && fmt.seed.state === 'blocked') return 'format:seed:' + (fmt.seed.reason || 'blocked');
      return 'blocked';
    }
    if (verdict === 'unknown') {
      const parts = unk.slice();
      if (fmt && fmt.state === 'unknown') parts.push('format:' + (fmt.why || 'unknown'));
      if (deg.unknown) parts.push('degrade:' + deg.unknown);
      return 'unknown:' + (parts.join('+') || 'unspecified');
    }
    if (verdict === 'degraded') {
      const losses = (deg.rows || []).filter(function (r) { return !!r.loss; }).length;
      const softMiss = deps.filter(function (d) { return d.state === 'absent'; }).length;
      return 'losses:' + (losses + softMiss);
    }
    return 'no-losses';
  }
  /** 可搬物的档案面：把「搬过来用不了什么」逐条写清（边界 7）。 */
  function archiveOf(kind, p) {
    return {
      isChatArchive: false,
      why: '可搬物搬的是**结构**或**时点**，不是这条聊天的全部内容',
      notIncluded: ['聊天文本', '已完成事件', '人物私密记忆', '外部凭据', '可执行脚本'],
      whatItIs: { blueprint: '结构（稳定 ID / 关系方向 / 道路端点 / 时代）',
        seed: '有损格局（显示名 / 权重 / 地名与道路数量）',
        pack: '带信封的有损种子（可跨聊天转移）',
        checkpoint: '世界状态的一个时点（含守卫键剥离）' }[kind] || null,
      counts: isObj(p.ids) ? { people: (p.ids.people || []).length, powers: (p.ids.powers || []).length,
        places: (p.ids.places || []).length } : null
    };
  }

  // ── 对外三口 ────────────────────────────────────────────────────────
  function check(payload, opt) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled' }; }
    const shape = kindOf(payload);
    if (!shape.ok) { fault(shape.reason); return { ok: false, reason: shape.reason, shape: shape.shape || null }; }
    const kind = shape.kind;
    const cap = Math.max(1, cfg.maxDeps || 24);
    const fmt = formatOf(kind, payload);
    const deps = depsOf(kind, payload, cap);
    const deg = degradeOf(kind, payload, Math.max(1, cfg.maxDegrade || 16));
    const mig = migrationOf(kind, payload);
    const missing = deps.filter(function (d) { return d.state === 'absent'; });
    const unverifiable = deps.filter(function (d) { return d.state === 'unknown' && d.envLimited !== true; })
      .map(function (d) { return d.id; });
    const envLimited = deps.filter(function (d) { return d.envLimited === true; }).map(function (d) { return d.id; });
    const verdict = verdictOf(shape, fmt, deps, deg);
    _stat.checks++;
    if (verdict === 'blocked') _stat.blocked++;
    else if (verdict === 'degraded') _stat.degraded++;
    else if (verdict === 'unknown') _stat.unknown++;
    _stat.lastReason = verdict;
    return {
      ok: true, kind: kind, kindWhy: shape.why, verdict: verdict,
      format: fmt, deps: deps,
      missing: missing.map(function (d) { return d.id; }),
      missingRequired: missing.filter(function (d) { return d.required; }).map(function (d) { return d.id; }),
      unverifiable: unverifiable,
      // 环境结构性限制（对所有可搬物一样）**单列**：它们不参与总判，但必须被看到。
      envLimited: envLimited,
      mechanism: deps.filter(function (d) { return d.kind === 'mechanism'; }),
      degrade: deg.rows, degradeSource: deg.source, degradeUnknown: deg.unknown,
      migration: mig, archive: archiveOf(kind, payload),
      verdictBasis: basisOf(verdict, shape, fmt, deps, deg),
      // 只读自证：源指纹随体回带 —— 调用方可以拿它与手上那份逐字比一次。
      srcSig: sig(JSON.stringify(payload)), srcUntouched: true
    };
  }
  /**
   * 迁移助手：**只出计划**。返回值里没有任何「已写」语义，源指纹随体回带 ——
   *   调用方可以把 `srcSig` 与手上那份逐字比一次，证明本模块一个字都没动它。
   *   失败时同样回带指纹并给出原因（`not-migratable` 是有据的结论，不是「我不知道」）。
   */
  function prepare(payload, opt) {
    const cfg = settings();
    if (!cfg.enabled) { fault('disabled'); return { ok: false, reason: 'disabled', srcUntouched: true }; }
    const shape = kindOf(payload);
    if (!shape.ok) { fault(shape.reason); return { ok: false, reason: shape.reason, srcUntouched: true }; }
    const kind = shape.kind, mig = migrationOf(kind, payload);
    const base = { kind: kind, srcSig: sig(JSON.stringify(payload)), srcUntouched: true,
      note: '本模块**没有写路径**：原文件与目标世界都不由它改，这里返回的永远是计划' };
    const action = { blueprint: 'install', seed: 'sow', pack: 'importPack', checkpoint: 'importOne' }[kind];
    if (mig.applicable === true) {
      _stat.prepared++; _stat.lastReason = 'prepared';
      return Object.assign({}, base, { ok: true, action: action, steps: mig.steps,
        from: mig.from, to: mig.to, chain: mig.chain || null, why: mig.why });
    }
    const why = mig.why || 'not-migratable';
    fault(why);
    return Object.assign({}, base, { ok: false, reason: why, action: null, from: mig.from, to: mig.to,
      known: mig.known || null,
      hint: '本格式没有可用的迁移链 —— 原文件保持不动；需要转换请由调用方自行处理，本模块不猜一份降级转换' });
  }
  /** 可体检体裁与依赖类目的**封闭集**（面板念的就是这一份，不另写一遍）。 */
  function catalog() {
    return {
      ok: true,
      kinds: KINDS.slice(),
      kindLabel: { blueprint: '结构蓝图（世界蓝图）', seed: '有损格局种子',
        pack: '种子转移包', checkpoint: '存档搬迁信封' },
      depKinds: ['external', 'mechanism', 'recipe'],
      depStates: ['present', 'absent', 'unknown'],
      envLimitedNote: '对**所有**可搬物都一样的「探不出」（本仓无媒体资产登记面）另归 envLimited，'
        + '不参与总判 —— 否则任何一份可搬物的总判都恒为 unknown，这一列就废了。',
      verdicts: VERDICTS.slice(),
      verdictNote: 'usable 要求「无缺项 + 无探不出 + 无损失 + 格式相符」四条同时成立；'
        + 'unknown 是**合法结论**（探不出），不是「差不多能用」的委婉说法。',
      archiveNote: '任何可搬物的 isChatArchive 都是 false —— 蓝图 / 种子都不是这条聊天的存档。',
      module: MOD_TAG
    };
  }
  function diagnose() {
    const cfg = settings();
    const deps = {
      store: !!WA.store, settingsBus: !!WA.settingsBus, inputGuard: !!WA.inputGuard,
      worldBlueprint: !!(WA.worldBlueprint && typeof WA.worldBlueprint.checkIntegrity === 'function'),
      worldSeed: !!(WA.worldSeed && typeof WA.worldSeed.stat === 'function'),
      checkpoints: !!(WA.checkpoints && typeof WA.checkpoints.migrate === 'function'),
      recipe: !!(WA.recipe && typeof WA.recipe.staleness === 'function'),
      compat: !!(WA.compat && typeof WA.compat.context === 'function'),
      worldbook: !!(WA.worldbook && typeof WA.worldbook.peekEntries === 'function')
    };
    return {
      ok: true, enabled: !!cfg.enabled, maxDeps: cfg.maxDeps, maxDegrade: cfg.maxDegrade,
      deps: deps,
      // 版本真源逐项报「读得到吗」—— 读不到时总判必然降级成 unknown，这里给出**原因**。
      versionSources: {
        blueprint: (WA.worldBlueprint && num(WA.worldBlueprint.BP_VER) !== null) ? num(WA.worldBlueprint.BP_VER) : null,
        seed: (WA.worldSeed && num(WA.worldSeed.SEED_VER) !== null) ? num(WA.worldSeed.SEED_VER) : null,
        pack: null,          // 真源未导出（如实报 null，不填一个常量冒充）
        checkpoint: (WA.checkpoints && num(WA.checkpoints.FORMAT) !== null) ? num(WA.checkpoints.FORMAT) : null
      },
      missingVersionSource: ['pack'],
      migrationChain: (WA.checkpoints && typeof WA.checkpoints.migrations === 'function') ? (WA.checkpoints.migrations() || []).slice() : null,
      faults: Object.assign({}, _stat.faults)
    };
  }
  function statOf() {
    return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults),
      enabled: !!settings().enabled, kinds: KINDS.length });
  }
  // 导出面：**每一口都有真消费方**（本仓口径：无消费方不挂导出）。
  //   `check` / `prepare` / `catalog` / `getSettings` / `setSettings` / `diagnose`
  //   → 面板「依赖体检与迁移助手」区块（八枚静态控件 + 一个开关）；
  //   `stat` → tool-diag 的 `secDepCheck()`。
  //   刻意**不导出** `resetStat`：无产品侧消费方（与 atlas 同一条裁决）。
  WA.depCheck = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    catalog: catalog, check: check, prepare: prepare,
    diagnose: diagnose, stat: statOf
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/dep-check.js', { kind: 'engine', ver: '2.187.0' });
})();
