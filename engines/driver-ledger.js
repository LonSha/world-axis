/**
 * WorldAxis engines/driver-ledger.js (v2.275.0) — 驱动者登记表：谁在什么时机驱动哪个引擎
 *
 * 【OPV7-5】V7 立项现场的根因不是「没接线」，是「没人喂」：
 *   109 个带 buildBlock 的引擎里，空世界只有 4 个出内容、真实开局 14 个、连推 5 轮仍 14 个，
 *   而 healthPreflight 的 threeGates 照样报 verdict="running" passed=3。
 *   仓外探针（tools/v7probes/p_four_layer.js）能算出四层分级，但那是**仓外**读数：
 *   产品里没有任何一处能回答「这个机制此刻有没有驱动者」。
 *
 * 【本模块只做一件事：把「驱动者」这件事变成产品内可读的读数】
 *   对每个带 buildBlock 的引擎，静态判定它属于哪一层：
 *     · L1  ：before/after 工作流链里被自动调用（真源 = WA.workflow 的链清单）
 *     · L2p ：面板有真实写口调用（真源 = 源码静态扫描 ui/，见下方 SCAN）
 *     · L2  ：仅代码路由可达（action-desk 的 ROUTES 表）
 *     · L3  ：真悬空 —— 产品代码里**没有任何写口调用**
 *   分层结论**不手写常量表**：除 L1（工作流链是运行期可读的真源）外，L2/L2p/L3
 *   一律由源码静态扫描得出。写死一份名单等于把「上次盘点的结论」当成「此刻的事实」，
 *   引擎改了、控件删了，台账还在念旧的 —— 那正是本仓反复付过价的病。
 *
 * 【为什么扫描源码而不读运行期】
 *   「谁在调用谁」在运行期是**已经发生过**的调用，而驱动者问题是「以后会不会有人调用」。
 *   运行期读数会把「本轮恰好没走到」误判成「没有驱动者」。静态扫描回答的才是这个问题。
 *   代价：扫描面必须是**产品代码**（engines/core/ui/render/actors/direction/compat/design + index.js），
 *   不含 tests/ 与 tools/ —— 测试里的调用不是驱动者，那只是判据在自证。
 *
 * 【与 capabilityAudit 的分工（分列不合并）】
 *   capabilityAudit（v2.257.0）答「179 个开关此刻谁在跑」——读的是 enabled 开关面。
 *   本节答「这个机制有没有任何人会去驱动它」——读的是调用面。
 *   两者是正交的两件事：**开关开着但没有驱动者**，正是 V7 立项要抓的那一类。
 *   合并成一个节会让「开着」与「有人喂」再次同形 —— 与 V6 拒绝合并 faceAudit 是同一裁决。
 *
 * 【本模块不做的事】
 *   · 零 store 写、零 settingsBus 写、零落盘：纯静态 + 纯读口聚合；
 *   · 不改任何引擎的 enabled：档位与开关归 capabilityTier 管；
 *   · 不猜「应该有驱动者」：L3 是**事实**（没扫到调用），不是建议。
 *     它该不该有驱动者，是 OPV7-1/OPV7-6 要解决的产品问题，不是本台账该下的结论。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};

  const LS_KEY = 'worldaxis_driver_ledger_settings_v1';
  const DEF = { enabled: true, includeEmpty: true, maxList: 200 };
  const __REG = { key: LS_KEY, def: DEF, module: 'driverLedger', bounds: { maxList: [10, 400] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // ── 驱动面：只认产品**自己登记的**驱动入口 ───────────────────────────────
  // 【V7 首轮两次自纠记录 —— 两条错路都走过，都不许再走】
  //   ① 先按「名字像不像写口」猜（set*/add*/declare*/…）：
  //      对账 27 条漏判 —— digest.generate / activity.declareSeries / world.transit 都真在写，
  //      只是名字不在表里。凭命名猜语义，必错。
  //   ② 改成「任何产品代码调用都算驱动」：读数立刻虚高到 L2p 49 / L2 49。
  //      因为 render/ 与注入面把 `buildBlock(` 当读口调了 102 次 —— 渲染在读它，
  //      不等于有人在喂它。把渲染当驱动，L3 恒为 0，这一栏就再也不成其为判据。
  //
  // 【现在的判据：三条产品自证驱动面，一条猜测都不做】
  //   L1  workflow 链里的步（core/workflow.js 的节点表）—— 声明式自动化
  //   L2r actionDesk.ROUTES 的键名（engines/action-desk.js）—— 声明式可执行动作
  //   L2p ui/ 面板里的调用 —— 玩家点得到的控制面
  //   L3  以上三条都没有。再细分为：
  //        L3a 只有诊断/健康聚合在读它（读口不等于驱动者，V7 命题的正面靶）
  //        L3b 谁都不调（连诊断面都没念）
  //   这三条面的共同点：**都是产品自己写下来的登记项**，不需要引擎去猜任何成员的语义。
  //   代价也说清：面板读 `getSettings()` 属玩家面可见，计入 L2p；这是刻意的宽口径 ——
  //   宁可把「面板能看见」算作有驱动，也不把「渲染在读」算作有驱动。

  // 读数面（只读聚合）：这些文件调用某个引擎 = 「把它的数念出来」，不是驱动它。
  //   名单刻意只放诊断与健康聚合两处 —— 放得越宽，「没人喂」就越好洗白。
  const READ_FACES = { 'engines/tool-diag.js': 1, 'engines/world-health.js': 1 };
  // 运行期扫描拿不到文件名，只能拿到「这段函数挂在谁的命名空间下」。
  //   故同一份名单要有一份命名空间形态 —— 早先只比文件名，运行期认不出诊断面，
  //   诊断面的读取被归成 other，L3a 与 L3b 就分不开了。
  const DIAG_NS = { toolDiag: 1, worldHealth: 1 };

  const PROD_DIRS = ['engines', 'core', 'ui', 'render', 'actors', 'direction', 'compat', 'design'];

  // 扫描结果缓存：同一进程内重复调用不重复读盘（面板会反复渲染）。
  //
  //   【缓存必须带签名，不能等外部来清】真机上预取是并行 fetch 的，面板有可能在预取完成前
  //   就读一次 —— 那时算出的是「预取不完整」，若就此缓存，这一栏会**永远**停在未判定。
  //   早先靠一个 invalidate() 让外部来清，但产品侧零调用点：没人记得调，缓存就永不失效。
  //   故改成自带签名比对（该导出已随之撤除，理由见文件末的导出面说明）。
  //   故缓存每次先用签名比对：扫描面的形态一变就重扫。签名取三样能反映「读到了多少」的
  //   事实 —— WA 命名空间数、预取条数、声明装载条数；任一变化都意味着扫描面变了。
  let __scan = null;
  let __scanSig = '';
  function scanSig() {
    let nsN = 0;
    try { nsN = Object.keys(WA).length; } catch (e) { nsN = 0; }
    const pf = WA.__prefetch;
    const pfN = (pf && typeof pf.size === 'number') ? pf.size : -1;
    const ldN = Array.isArray(WA.__loadOrder) ? WA.__loadOrder.length : -1;
    return nsN + '|' + pfN + '|' + ldN;
  }
  // 互调面（L2e）缓存：文件 → {defs, calls}，只在能读到源码时有值
  let __graph = null;

  function fsx() {
    // 只在使用时才取 fs：宿主（浏览器）里没有 fs，此时退回「静态表不可用」——
    //   如实报 unavailable，而不是假装没有驱动者（那是把「读不到」写成「读到且为否」）。
    try { return (typeof require === 'function') ? require('fs') : null; } catch (e) { return null; }
  }
  function px() {
    try { return (typeof require === 'function') ? require('path') : null; } catch (e) { return null; }
  }

  function rootDir() {
    const p = px();
    if (!p) return null;
    // 本文件的期望位置是 <root>/engines/driver-ledger.js
    try { return p.join(__dirname, '..'); } catch (e) { return null; }
  }

  function walkRel(fs, path, base, rel, out) {
    const abs = path.join(base, rel);
    let st = null;
    try { st = fs.statSync(abs); } catch (e) { return; }
    if (st.isFile()) { if (/\.js$/.test(rel)) out.push(rel); return; }
    let names = [];
    try { names = fs.readdirSync(abs); } catch (e) { return; }
    for (let i = 0; i < names.length; i++) walkRel(fs, path, base, rel + '/' + names[i], out);
  }

  /** 收集产品侧源码文件清单（不含 tests/ tools/）。 */
  function prodFiles() {
    const fs = fsx(), path = px(), base = rootDir();
    if (!fs || !path || !base) return null;
    const out = [];
    for (let i = 0; i < PROD_DIRS.length; i++) walkRel(fs, path, base, PROD_DIRS[i], out);
    walkRel(fs, path, base, 'index.js', out);
    return { files: out, base: base, fs: fs, path: path };
  }

  /** 命名空间 → 自身的引擎文件相对路径（用于排除「自己调自己」）。 */
  function selfFileOf(ns) {
    const kebab = String(ns).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
    return ['engines/' + kebab + '.js'];
  }

  /**
   * 统一的记账核心：把「某文件 src 里调用了 WA.ns.mem(」按调用来源分桶。
   *   三处扫描（static / prefetch / runtime）共用它 —— 早先三处各写一遍，
   *   口径稍有出入就会得出三套分层，那比不报更坏。
   *
   *   【桶的含义 = 调用它的那个东西是谁】
   *     diag  ：诊断/健康聚合在读它（READ_FACES）⇒ 有人在**看**
   *     panel ：面板在调（ui/*）⇒ 玩家点得到 ⇒ 有人在**喂**
   *     other ：其余产品代码在调 ⇒ 逻辑里有人在喂
   *   V7 要抓的「没人喂」= diag 之外零调用。buckets 里记的是**来源文件**，
   *   不给数字：要回答「谁在驱动它」必须能点出名字，只给计数等于没答。
   */
  function tally(byNs, ns, mem, rel, face) {
    const b = byNs[ns] || (byNs[ns] = { members: {}, diag: {}, panel: {}, other: {} });
    b.members[mem] = (b.members[mem] || 0) + 1;
    const bucket = b[face] || b.other;
    const key = mem;
    if (!bucket[key]) bucket[key] = { calls: 0, from: {} };
    bucket[key].calls++;
    bucket[key].from[rel] = (bucket[key].from[rel] || 0) + 1;
  }

  /**
   * 显示优先级：hint 里先点「专属成员」，最后点通用口径词。
   *
   *   【为什么只影响显示，不影响分层】getSettings/view/stat 这类成员几乎每个模块都有，
   *   把它们排在最前会让 hint 读起来像「这个引擎只有读数口」—— 实测 diplomacy 有
   *   propose/reply/sign/fulfil 等 11 个真控件，hint 却只念出 getSettings、setSettings、view，
   *   读者会误判它没人喂。这属于「读数没错但报告误导」，与把「读不到」写成「没有」同类。
   *   但它**不参与裁决**：分层只看四条自证面，这里排错也只是措辞难看，不会改层档。
   */
  const PLAIN = { getSettings: 1, setSettings: 1, stat: 1, statView: 1, DEF: 1, settings: 1,
    view: 1, summaryText: 1, why: 1, build: 1 };
  function byPriority(list) {
    const own = [], plain = [];
    for (let i = 0; i < list.length; i++) (PLAIN[list[i]] ? plain : own).push(list[i]);
    return own.concat(plain);
  }

  /** 由「来源文件」判定这一面：只有 ui/ 是面板，只有 READ_FACES 是诊断面。 */
  function faceOfFile(rel, isPanel) {
    if (isPanel) return 'panel';
    return READ_FACES[rel] ? 'diag' : 'other';
  }

  /** 扫一段源码文本（static 与 prefetch 共用；runtime 的来源是命名空间而非文件）。 */
  function scanSource(byNs, src, rel, isPanel) {
    const re = /WA\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(src)) !== null) {
      const ns = m[1], mem = m[2];
      // 排除「自己文件里调自己命名空间」：引擎内部互调不是外部驱动者
      if (selfFileOf(ns).indexOf(rel) >= 0) continue;
      tally(byNs, ns, mem, rel, faceOfFile(rel, isPanel));
    }
  }

  /**
   * 互调图：文件 → 它定义了哪些命名空间 + 它调了谁。
   *
   *   【为什么需要这一面】实测发现 memorySampler 被 engines/sampler-check.js 调
   *   sampleEntries、bonds 被 activity 调 setBond、fondness 被 mend 调 apply ——
   *   这些是**引擎之间的逻辑互调**，是真驱动，但三条自证面（链/路由/面板）都看不见。
   *   漏掉它们的后果是把「有引擎在喂」写成「没有驱动入口」，即假阴性。
   *
   *   【为什么不直接照搬「任何调用都算驱动」】那条路已实证失败：render/ 把 buildBlock
   *   当读口调了 102 次，一律算驱动会让 L3 恒为 0。本面的解法不是猜成员语义，
   *   而是要求**驱动者自身可达**：只有已可达引擎所在的文件发出的调用才算扩散边。
   *   于是未可达引擎之间的互相调用不会自证（互引成环不算有人驱动）。
   *
   *   【命名空间归属由源码自己声明】`WA.xxx = {` 就是它定义了 xxx ——
   *   不用文件名反推（实测反推有错配：perspective 反推不到任何文件）。
   */
  function buildGraph(byNs, src, rel) {
    const g = __graph || (__graph = { files: {} });
    const f = g.files[rel] || (g.files[rel] = { defs: [], calls: [] });
    const dRe = /WA\.([A-Za-z_$][\w$]*)\s*=\s*\{/g;
    let m;
    while ((m = dRe.exec(src)) !== null) {
      if (f.defs.indexOf(m[1]) < 0) f.defs.push(m[1]);
    }
    const cRe = /WA\.([A-Za-z_$][\w$]*)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g;
    while ((m = cRe.exec(src)) !== null) f.calls.push([m[1], m[2]]);
    return f;
  }

  /**
   * 互调可达性不动点：从三条自证面的可达集出发，沿引擎文件里的调用边扩散。
   *
   *   【只从兜底目录扩散】engines/ 与 core/ 是引擎与核心层：实证 engines/ 内
   *   buildBlock 仅 2 处（占 4038 处调用的 0.04%）、core/ 为 0，噪音可忽略。
   *   render/ 的 102 处 buildBlock 天然被排除在外（它不是扩散来源，只可能被读）。
   *   ui/ 不参与扩散：面板本身是自证面，它调什么都该由面板面自己记账。
   *
   *   【不动点会迭代到收敛】A 可达 → A 调 B → B 可达 → B 调 C → C 可达。
   *   上界取 8 轮：链深超过 8 层的调用链在实际代码里不存在，超了就是有环，
   *   有环时 reach 不再增长，循环会自己停。
   */
  function reachSet(baseNs) {
    const out = {};
    const src = {};
    let i;
    for (i = 0; i < baseNs.length; i++) out[baseNs[i]] = 'face';
    const g = __graph;
    if (!g) return { set: out, via: src, ok: false };
    const rels = Object.keys(g.files).filter(function (r) {
      return r.indexOf('engines/') === 0 || r.indexOf('core/') === 0;
    });
    let round = 0;
    while (round < 8) {
      round++;
      let added = 0;
      for (let k = 0; k < rels.length; k++) {
        const verbatim = g.files[rels[k]];
        const live = verbatim.defs.filter(function (d) { return out[d]; });
        if (!live.length) continue;
        for (let c = 0; c < verbatim.calls.length; c++) {
          const dst = verbatim.calls[c][0];
          if (verbatim.defs.indexOf(dst) >= 0) continue;   // 自己文件调自己
          if (out[dst]) continue;
          out[dst] = 'call';
          src[dst] = live[0] + '.' + verbatim.calls[c][1];
          added++;
        }
      }
      if (!added) break;
    }
    return { set: out, via: src, ok: true, rounds: round };
  }

  /**
   * 静态扫描（Node / 专锁 / 诊断 CLI 现场）：读产品源码文件。
   *   【生产宿主里它必然不可用】index.js 在浏览器里靠 loadScript 取源码，FS 根本不存在；
   *   无头 vm（tests/run.js 的 ctx）里 `require` 与 `__dirname` 同样都是 undefined。
   *   故本函数报 no-fs 是**常态**，不是异常 —— 此时按强弱顺序退到 prefetch / runtime。
   */
  function scanStatic() {
    const pk = prodFiles();
    if (!pk) return { ok: false, level: 'none', why: 'no-fs' };
    const fs = pk.fs, path = pk.path;
    const byNs = {};
    __graph = { files: {} };
    for (let i = 0; i < pk.files.length; i++) {
      const rel = pk.files[i];
      let src = '';
      try { src = fs.readFileSync(path.join(pk.base, rel), 'utf8'); } catch (e) { continue; }
      if (!src) continue;
      scanSource(byNs, src, rel, rel.indexOf('ui/') === 0);
      buildGraph(byNs, src, rel);
    }
    return { ok: true, level: 'static', byNs: byNs, files: pk.files.length, fns: 0, why: '' };
  }

  /**
   * 运行期扫描（无预取时的兜底）：把 WA 树上每个导出函数 toString，扫函数体里的调用。
   *
   *   【它只能作正向证据，不能作反向证据 —— 这是本节最关键的一条裁决】
   *     · 函数体里**找到**调用 ⇒ 确实有人在调它（可信）；
   *     · 函数体里**没找到** ⇒ **不能**断言没有：私有函数、IIFE 内部逻辑、事件回调闭包
   *       都不在 WA 的导出面上，toString 看不到它们。把下界当全量，就会把「有人喂」
   *       写成「没人喂」—— 那是假读数，比不报更坏。
   *   所以运行期口径下「没找到」的引擎一律进 unknown（未判定），**绝不进 L3**。
   *
   *   【调用来源只能是命名空间，不是文件名】toString 拿到的是函数体，
   *   唯一可得的来源信息是「这个函数挂在谁的命名空间下」。故来源记作 `<ns>.<mem>`，
   *   由 isDiagSource() 判定它是不是诊断面（只能认出 tool-diag / world-health 的导出成员）。
   */
  function scanRuntime() {
    // 运行期拿不到任何源码，故图必须清空：拿上一次 prefetch 建的图来算互调可达，
    //   等于用「扫描面 A」的边去解释「扫描面 B」的结论 —— 同一台机器上先扫预取再退回来，
    //   会得到与「一开始就没预取」不同的分层，读数不可复现。图与扫描面必须同源。
    __graph = null;
    let names = [];
    try { names = Object.keys(WA); } catch (e) { names = []; }
    if (!names.length) return { ok: false, level: 'none', why: 'no-wa' };
    const byNs = {};
    const RE = /WA\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
    let fns = 0;
    for (let i = 0; i < names.length; i++) {
      const owner = names[i];
      if (owner === 'modules') continue;
      let mod = null;
      try { mod = WA[owner]; } catch (e) { mod = null; }
      if (!mod || typeof mod !== 'object') continue;
      let keys = [];
      try { keys = Object.keys(mod); } catch (e) { keys = []; }
      for (let j = 0; j < keys.length; j++) {
        let fn = null;
        try { fn = mod[keys[j]]; } catch (e) { fn = null; }
        if (typeof fn !== 'function') continue;
        let s = '';
        try { s = Function.prototype.toString.call(fn); } catch (e) { continue; }
        if (!s || s.indexOf('[native code]') >= 0) continue;
        fns++;
        const rel = owner + '.' + keys[j];
        // 面板面在无头装载面里不装（ui/* 不执行），这一层永远拿不到 panel 证据；
        //   诊断面则只能靠命名空间认 —— 文件名在运行期不存在。
        const face = DIAG_NS[owner] ? 'diag' : 'other';
        RE.lastIndex = 0;
        let m;
        while ((m = RE.exec(s)) !== null) {
          const ns = m[1], mem = m[2];
          if (ns === owner) continue;      // 自己调自己不是外部驱动者
          tally(byNs, ns, mem, rel, face);
        }
      }
    }
    return { ok: fns > 0, level: 'runtime', byNs: byNs, files: 0, fns: fns,
      // 运行期来源是命名空间串，不是文件路径 —— 诊断面判定要另走一套（见 isDiagSrc）
      srcIsNs: true,
      why: fns > 0 ? '' : 'no-exported-fn' };
  }

  /**
   * 预取面扫描（Tauri 宿主 = 真机主场景）：index.js 在装载前把全部 LOAD_ORDER 模块源码
   *   并行 fetch 进 `WA.__prefetch`（Map: url -> 源码文本），那是**全量产品源码**。
   *
   *   【为什么它比函数体扫描强得多】它拿到的是原文，含私有函数、IIFE 内部、事件回调 ——
   *   而这些正是函数体扫描看不到的部分。所以本面扫不到时可以下「没有驱动者」的结论，
   *   前提是**预取完整**（pf.size 覆盖 __loadOrder）：缺了几个模块就说「全都扫过了」，
   *   与扫不了却说「没有」是同一种错。
   */
  function scanPrefetch() {
    const pf = WA.__prefetch;
    if (!pf || typeof pf.size !== 'number' || typeof pf.forEach !== 'function' || pf.size === 0) {
      return { ok: false, level: 'none', why: 'no-prefetch' };
    }
    const base = String(WA.baseUrl || '');
    const byNs = {};
    __graph = { files: {} };
    let n = 0;
    pf.forEach(function (src, url) {
      if (!src) return;
      let rel = String(url);
      // url 形态：<baseUrl>/<rel> 或 <baseUrl>/<rel>?v=<ver>（Tauri 下不带 query）
      if (base && rel.indexOf(base + '/') === 0) rel = rel.slice(base.length + 1);
      const q = rel.indexOf('?');
      if (q >= 0) rel = rel.slice(0, q);
      rel = rel.replace(/^\/+/, '');
      if (!/\.js$/.test(rel)) return;
      n++;
      scanSource(byNs, src, rel, rel.indexOf('ui/') === 0);
      buildGraph(byNs, src, rel);
    });
    const declared = Array.isArray(WA.__loadOrder) ? WA.__loadOrder.length : 0;
    const complete = declared > 0 && pf.size >= declared;
    return { ok: true, level: 'prefetch', byNs: byNs, files: n, fns: 0,
      canConclude: complete, complete: complete, why: '', declared: declared, prefetched: pf.size };
  }

  /** 两个下界面并起来（只用于 prefetch 不完整时补运行期正向证据，并集仍是下界）。 */
  function mergeScan(a, b) {
    if (!b || !b.byNs) return a;
    Object.keys(b.byNs).forEach(function (ns) {
      const src = b.byNs[ns];
      const dst = a.byNs[ns] || (a.byNs[ns] = { members: {}, diag: {}, panel: {}, other: {} });
      // members 的值是计数（数字），diag/panel/other 的值是 { calls, from } —— 两者合并方式不同。
      //   早先混在一张键表里按数字相加，会把对象加成 '[object Object]' 串；
      //   而且那张表漏了 diag，合完之后「只有诊断面读」的分档信息就整批丢了。
      const o = src.members || {};
      Object.keys(o).forEach(function (m) { dst.members[m] = (dst.members[m] || 0) + o[m]; });
      ['diag', 'panel', 'other'].forEach(function (k) {
        const ob = src[k] || {};
        const db = dst[k] || (dst[k] = {});
        Object.keys(ob).forEach(function (m) {
          const e = ob[m] || {};
          if (!db[m]) db[m] = { calls: 0, from: {} };
          db[m].calls += Number(e.calls) || 0;
          const f = e.from || {};
          Object.keys(f).forEach(function (r) { db[m].from[r] = (db[m].from[r] || 0) + f[r]; });
        });
      });
    });
    return a;
  }

  /**
   * 扫描面选择，按「能读出多少真形态」从强到弱：
   *   ① static     读产品源码文件（Node / 专锁 / CLI 现场）—— 完整，可下没有驱动者的结论
   *   ② prefetch   Tauri 真机的预取全量源码 —— 完整时可下结论，不完整则退成下界
   *   ③ runtime    导出函数体扫描 —— 只能作正向证据，**永不**用来下「没有」的结论
   *   ④ none       两者都不可用 ⇒ 报缺席
   */
  function scan() {
    const sig = scanSig();
    if (__scan && __scanSig === sig) return __scan;
    const st = scanStatic();
    if (st && st.ok) { st.canConclude = true; __scan = st; __scanSig = sig; return __scan; }
    const pf = scanPrefetch();
    if (pf && pf.ok) {
      if (!pf.complete) {
        const rt = scanRuntime();
        if (rt && rt.ok) mergeScan(pf, rt);
      }
      __scan = pf;
      __scanSig = sig;
      return __scan;
    }
    const rt = scanRuntime();
    // 静态缺席的原因要留着：它是「为什么这一栏有一部分是未判定」的归因
    if (rt && rt.ok && st && st.why) rt.fallbackWhy = st.why;
    __scan = rt;
    __scanSig = sig;
    return __scan;
  }

  // ── L1：工作流链真源 ────────────────────────────────────────────────────
  // 链清单是运行期真源（WA.workflow.run('before'/'after', ctx) 实际会走的步），
  // 故这里读它而不是写常量：链改了，L1 跟着改。
  //   形态（实测 core/workflow.js:87）：`list(chain)` 传链名时只返回该链节点，
  //   不传则返回全部。节点形如 { id, chain, order, enabled }，`id` 是链内步名。
  function chainDrivers() {
    const out = {};
    const steps = [];
    try {
      if (WA.workflow && typeof WA.workflow.list === 'function') {
        const all = WA.workflow.list();
        if (Array.isArray(all)) {
          all.forEach(function (n) {
            if (!n || !n.id) return;
            const ph = String(n.chain || '');
            // 只认 before / after：其它链（若有）不属轮次自动驱动面
            if (ph !== 'before' && ph !== 'after') return;
            steps.push(ph + ':' + String(n.id));
          });
        }
      }
    } catch (e) {}
    const stepsByNs = {};
    steps.forEach(function (s) {
      const p = s.split(':')[0];
      const key = s.split(':').slice(1).join(':');
      // 步名形态是 `命名空间.方法`（如 livingWorld.autonomousTick）
      const ns = key.split('.')[0];
      if (!ns) return;
      if (!stepsByNs[ns]) stepsByNs[ns] = [];
      const tag = p + ':' + key;
      if (stepsByNs[ns].indexOf(tag) < 0) stepsByNs[ns].push(tag);
      out[ns] = (out[ns] || 0) + 1;
    });
    return { count: out, steps: steps, stepsByNs: stepsByNs };
  }

  /** 命名空间是否在工作流链里被自动调用。 */
  function chainStepsFor(ns, cd) {
    return (cd && cd.stepsByNs && cd.stepsByNs[ns]) ? cd.stepsByNs[ns] : null;
  }

  // ── L2r：actionDesk 路由登记面（产品自证）─────────────────────────────────
  //   真源：engines/action-desk.js 的 ROUTES 表。它对外导出的是**键名数组**
  //   （`Object.keys(ROUTES).slice()`），值（函数）拿不到 —— 正好：本节要的就是
  //   「产品自己登记了哪些可执行动作」，不需要也不该真的去调那些函数。
  //   键名形态是 `命名空间.动作`（如 research.supply / family.contribute），
  //   取 `.split('.')[0]` 即得该动作所属的命名空间。
  function routesFace() {
    const out = {};
    try {
      const r = WA.actionDesk ? WA.actionDesk.ROUTES : null;
      if (Array.isArray(r)) {
        for (let i = 0; i < r.length; i++) {
          const k = String(r[i] || '');
          const ns = k.split('.')[0];
          if (!k || !ns) continue;
          if (!out[ns]) out[ns] = [];
          if (out[ns].indexOf(k) < 0) out[ns].push(k);
        }
      }
    } catch (e) {}
    return out;
  }

  // ── 逐个引擎分层 ────────────────────────────────────────────────────────
  /**
   * 分层判据：**只认产品自己写下来的登记项**，一条语义猜测都不做。
   *   L1  workflow 链里的步（core/workflow.js 的节点表 = 声明式自动化）
   *   L2r actionDesk.ROUTES 的键名（engines/action-desk.js = 声明式可执行动作）
   *   L2p ui/ 面板里的调用（玩家点得到的控制面）
   *   L3a 三条面都没有登记，但诊断/健康聚合在读它 —— 读口不等于驱动者，这是 V7 的正面靶
   *   L3b 三条面都没有登记，连诊断面都没念
   *   L?  面板面读不到（宿主拿不到 ui/ 源码）⇒ 未判定，不下 L3 结论
   *
   *   正向证据不需要完整性：链/路由/面板任一面命中就是命中。
   *   反过来，「没命中」才需要扫描面完整（canConclude）才敢下结论。
   */
  function build() {
    const sc = scan();
    const cd = chainDrivers();
    const rt = routesFace();
    const canConclude = !!(sc.ok && sc.canConclude);

    // 三条自证面的名单先算出来：它们是互调扩散的**起点**。
    //   注意顺序依赖：扩散必须先知道「谁是自证面」才能开始，故不能边遍历边算。
    const faceOf = {};
    (function () {
      let names0;
      try { names0 = Object.keys(WA); } catch (e) { names0 = []; }
      for (let i0 = 0; i0 < names0.length; i0++) {
        const ns0 = names0[i0];
        let m0 = null;
        try { m0 = WA[ns0]; } catch (e) { m0 = null; }
        if (!m0 || typeof m0 !== 'object') continue;
        if (typeof m0.buildBlock !== 'function') continue;
        if (chainStepsFor(ns0, cd)) { faceOf[ns0] = 'L1'; continue; }
        if (rt[ns0] && rt[ns0].length) { faceOf[ns0] = 'L2r'; continue; }
        const c0 = (sc.ok && sc.byNs[ns0]) ? sc.byNs[ns0] : null;
        if (c0 && Object.keys(c0.panel || {}).length) { faceOf[ns0] = 'L2p'; continue; }
      }
    })();
    // 可达集：三条面 + 沿引擎互调扩散。图不可用（运行期口径）时 only face，报 ok=false。
    const reach = reachSet(Object.keys(faceOf));
    const reached = reach.set;
    const rows = [];
    let names;
    try { names = Object.keys(WA); } catch (e) { names = []; }
    for (let i = 0; i < names.length; i++) {
      const ns = names[i];
      let mod = null;
      try { mod = WA[ns]; } catch (e) { mod = null; }
      if (!mod || typeof mod !== 'object') continue;
      if (typeof mod.buildBlock !== 'function') continue;

      const call = (sc.ok && sc.byNs[ns]) ? sc.byNs[ns] : null;
      const panelM = call ? Object.keys(call.panel || {}) : [];
      const diagM = call ? Object.keys(call.diag || {}) : [];
      const otherM = call ? Object.keys(call.other || {}) : [];
      const chain = chainStepsFor(ns, cd) || [];
      const routed = rt[ns] || [];

      // 谁在驱动它：三条登记面的名字合起来 —— 必须能点出名字，只给计数等于没答
      const drivers = chain.concat(routed, panelM);
      const diagOnly = diagM.filter(function (k) { return panelM.indexOf(k) < 0; });

      // 裁决顺序：链 > 路由 > 面板 > 未判定 > 只诊断读 > 谁都不碰。
      //   前三档是正向证据（命中即成立，不需要扫描完整）；
      //   「没命中」的那两档必须扫描面完整（canConclude），否则只能记未判定。
      let layer, driver;
      if (chain.length) { layer = 'L1'; driver = 'workflow'; }
      else if (routed.length) { layer = 'L2r'; driver = 'route'; }
      else if (panelM.length) { layer = 'L2p'; driver = 'panel'; }
      // L2e：只有「已可达引擎」调它才算数 —— 未可达引擎之间的互引不构成驱动。
      //   排在面板之后：面板是玩家直接可操作，互调只是逻辑传导，强度弱一档。
      else if (reached[ns] === 'call') { layer = 'L2e'; driver = 'engine'; }
      else if (!canConclude) { layer = 'L?'; driver = 'undetermined'; }
      else if (diagM.length) { layer = 'L3a'; driver = 'diagOnly'; }
      else { layer = 'L3b'; driver = 'none'; }

      rows.push({
        ns: ns,
        layer: layer,
        driver: driver,
        chainSteps: chain,
        routedBy: routed,
        panelMembers: panelM,
        diagMembers: diagM,
        // 非登记面调用（render/ 装配、一般逻辑）：**只作旁证，不参与分层** ——
        //   第六段把 buildBlock 被渲染读当成驱动，L3 立刻归零，那一栏就再也不成判据。
        otherCallers: otherM,
        driverNames: byPriority(drivers),
        driverCount: drivers.length,
        // L2e 的驱动者名字：是哪个可达引擎调了它（能点出名字，不只是一句「有引擎在用」）
        reachVia: (reached[ns] === 'call' && reach.via[ns]) ? reach.via[ns] : '',
        diagOnlyMembers: byPriority(diagOnly),
        diagOnlyCount: diagOnly.length,
        hasSwitch: (function () {
          try { return !!(mod.getSettings && typeof mod.getSettings === 'function'); } catch (e) { return false; }
        })()
      });
    }
    rows.sort(function (a, b) {
      // 可疑的排前面：完全没人碰 > 只有诊断面读 > 未判定 > 面板 > 路由 > 链自动
      const ord = { L3b: 0, L3a: 1, 'L?': 2, L2e: 3, L2p: 4, L2r: 5, L1: 6 };
      const oa = ord[a.layer] == null ? 9 : ord[a.layer];
      const ob = ord[b.layer] == null ? 9 : ord[b.layer];
      if (oa !== ob) return oa - ob;
      if (b.diagOnlyCount !== a.diagOnlyCount) return b.diagOnlyCount - a.diagOnlyCount;
      return a.ns < b.ns ? -1 : (a.ns > b.ns ? 1 : 0);
    });
    const layers = { L1: [], L2r: [], L2p: [], L2e: [], L3a: [], L3b: [], 'L?': [] };
    rows.forEach(function (r) {
      if (!layers[r.layer]) layers[r.layer] = [];
      layers[r.layer].push(r.ns);
    });
    const orphans = rows.filter(function (r) { return r.layer === 'L3a' || r.layer === 'L3b'; });
    const undetermined = rows.filter(function (r) { return r.layer === 'L?'; });
    let routeKeys = 0;
    Object.keys(rt).forEach(function (k) { routeKeys += rt[k].length; });
    return {
      ok: true,
      total: rows.length,
      counts: {
        L1: layers.L1.length, L2r: layers.L2r.length, L2p: layers.L2p.length,
        L2e: layers.L2e.length,
        L3a: layers.L3a.length, L3b: layers.L3b.length, undetermined: layers['L?'].length
      },
      layers: layers,
      rows: rows,
      // 「没有登记驱动入口」= L3a ∪ L3b。两个子档必须分开报：
      //   一个还有人在看（诊断面），一个彻底没人碰 —— 压成一个数就丢了归因。
      orphans: orphans.map(function (r) { return r.ns; }),
      orphanCount: orphans.length,
      diagOnlyOrphans: layers.L3a.slice(),
      blindOrphans: layers.L3b.slice(),
      // 兼容早先字段名（面板与诊断面读的是 readOnlyOrphans）
      readOnlyOrphans: layers.L3a.slice(),
      undetermined: undetermined.map(function (r) { return r.ns; }),
      chainSteps: cd.steps.length,
      routeKeys: routeKeys,
      // 互调面自述：图不可用时 reached 只有三条面，扩散没发生 —— 这必须对外可见，
      //   否则读者会把「没扩散」当成「扩散后也没有」。
      reachOk: !!reach.ok,
      reachSize: Object.keys(reached).length,
      reachRounds: reach.rounds || 0,
      scannedFiles: sc.ok ? (sc.files || 0) : 0,
      scannedFns: sc.ok ? (sc.fns || 0) : 0,
      scanOk: !!sc.ok,
      scanLevel: sc.ok ? (sc.level || 'static') : 'none',
      // 这一栏能不能下「没有驱动者」的结论 —— 由扫描面完整性决定，
      //   不由「扫描面叫什么名字」决定（见 scan() 注释）。
      scanCanConclude: canConclude,
      scanComplete: canConclude,
      scanDeclared: sc.declared || 0,
      scanPrefetched: sc.prefetched || 0,
      scanWhy: sc.ok ? '' : (sc.why || 'unavailable'),
      scanFallback: sc.ok && sc.fallbackWhy ? String(sc.fallbackWhy) : ''
    };
  }

  /** 本节对外读数：分层计数 + 悬空清单 + 扫描口径自述。 */
  function view() {
    const b = build();
    const cfg = settings();
    const maxList = Number(cfg.maxList) || 200;
    return {
      ok: true,
      total: b.total,
      counts: b.counts,
      orphans: b.orphans.slice(0, maxList),
      orphanCount: b.orphanCount,
      diagOnlyOrphans: b.diagOnlyOrphans.slice(0, maxList),
      diagOnlyOrphanCount: b.diagOnlyOrphans.length,
      blindOrphans: b.blindOrphans.slice(0, maxList),
      blindOrphanCount: b.blindOrphans.length,
      readOnlyOrphans: b.readOnlyOrphans.slice(0, maxList),
      readOnlyOrphanCount: b.readOnlyOrphans.length,
      // 未判定名单必须对外可见：它是「这一栏没读全」的直接证据，
      //   藏起来就会让读者把「未判定」误读成「已确认没有驱动者」。
      undetermined: b.undetermined.slice(0, maxList),
      undeterminedCount: b.undetermined.length,
      // 每一档的名单也带出来：只有计数不给名单，玩家没法知道「谁在驱动它」
      layerNames: {
        L1: b.layers.L1.slice(0, maxList),
        L2r: b.layers.L2r.slice(0, maxList),
        L2p: b.layers.L2p.slice(0, maxList),
        L2e: b.layers.L2e.slice(0, maxList),
        L3a: b.layers.L3a.slice(0, maxList),
        L3b: b.layers.L3b.slice(0, maxList)
      },
      scan: { ok: b.scanOk, level: b.scanLevel, files: b.scannedFiles, fns: b.scannedFns,
        canConclude: b.scanCanConclude, complete: b.scanComplete,
        declared: b.scanDeclared, prefetched: b.scanPrefetched,
        why: b.scanWhy, fallback: b.scanFallback,
        chainSteps: b.chainSteps, routeKeys: b.routeKeys,
        reachOk: b.reachOk, reachSize: b.reachSize, reachRounds: b.reachRounds },
      // 判据自述：面板与诊断面共用同一句，避免两处措辞分叉
      note: '本节读「调用面」，判据是四条可自证的面：工作流链（L1）、'
        + 'actionDesk 路由表（L2r）、面板控件（L2p）、已可达引擎的互调（L2e）。'
        + 'L2e 要求驱动者自身可达 —— 未可达引擎之间的互相调用不算有人驱动。'
        + '开关面读「enabled」，两件事正交：开关开着而四条面都没有登记，就是本节的 L3。'
        + (!b.scanCanConclude
          ? (b.scanLevel === 'none'
            ? '本宿主既读不到产品源码、也拿不到面板面，四条面里只剩链与路由两条：'
              + '没登记这两条的引擎一律记未判定（L?），不冒充「没有驱动者」。'
            : '本宿主读到的调用面不完整'
              + (b.scanLevel === 'prefetch'
                ? '（源码预取 ' + b.scanPrefetched + '/' + b.scanDeclared + '）'
                : '（只有导出函数体，看不到私有函数与回调）')
              + '：没命中已读面的引擎一律记未判定（L?），不冒充「没有驱动者」。')
          : '')
    };
  }

  /** 单个引擎的驱动者明细（面板点进去看的那一层）。 */
  function why(ns) {
    const name = String(ns || '');
    const b = build();
    const r = b.rows.filter(function (x) { return x.ns === name; })[0];
    if (!r) return { ok: false, reason: 'unknown-engine', ns: name };
    return {
      ok: true,
      ns: r.ns,
      layer: r.layer,
      driver: r.driver,
      // 「谁在驱动它」必须能点出名字：这是本节唯一的交付物
      driverNames: r.driverNames.slice(0, 40),
      driverCount: r.driverCount,
      chainSteps: r.chainSteps.slice(0, 20),
      routedBy: r.routedBy.slice(0, 20),
      panelMembers: byPriority(r.panelMembers).slice(0, 40),
      diagMembers: byPriority(r.diagMembers).slice(0, 40),
      diagOnlyMembers: r.diagOnlyMembers.slice(0, 40),
      diagOnlyCount: r.diagOnlyCount,
      otherCallers: r.otherCallers.slice(0, 40),
      hasSwitch: r.hasSwitch,
      hint: hintOf(r)
    };
  }

  /** 单档的人话解释（每档一句，措辞集中一处，避免各处自己编）。 */
  function hintOf(r) {
    if (r.layer === 'L1') return '工作流链自动驱动：' + r.chainSteps.slice(0, 3).join('、') + '。';
    if (r.layer === 'L2r') return 'actionDesk 路由表给它登记了可执行动作：' + r.routedBy.slice(0, 3).join('、') + '。';
    if (r.layer === 'L2p') {
      const ps = byPriority(r.panelMembers);
      return '面板有控件在调它：' + ps.slice(0, 3).join('、')
        + (ps.length > 3 ? ' 等 ' + ps.length + ' 个成员' : '') + '。';
    }
    if (r.layer === 'L2e') {
      // 互调驱动要能点出「是谁在喂」—— 否则与「有个模糊的东西在调它」没区别
      return (r.reachVia ? '被可达引擎调用：' + r.reachVia + '。' : '被可达引擎调用。')
        + '面板没有控件、路由没登记、链上不走，但引擎逻辑链能从玩家面传导到这里。';
    }
    if (r.layer === 'L3a') {
      return '只有诊断/健康聚合在读它（' + r.diagOnlyMembers.slice(0, 3).join('、') + '）—— '
        + '读口被诊断面调用不等于有驱动者：链上不走、路由没登记、面板没控件。';
    }
    if (r.layer === 'L3b') {
      return '链上不走、路由没登记、面板没控件、诊断面也没念它'
        + (r.otherCallers.length
          ? '（另有 ' + r.otherCallers.length + ' 处非登记面代码调用，属装配/一般逻辑，不构成驱动入口）'
          : '')
        + '。';
    }
    return '未判定：本宿主读不到 ui/ 面板源码 —— 没登记链/路由不等于没有驱动者，'
      + '要确认得在能读到全量产品源码的环境里跑一次。';
  }

  /** 一行人话摘要（概览页 / 诊断面共用）。 */
  function summaryText() {
    const v = view();
    const c = v.counts;
    if (!v.scan.ok) return '驱动者台账不可用（' + (v.scan.why || 'unavailable') + '）：读不到调用面，如实报缺席，不假装没有驱动者。';
    let s = '带内容构建的引擎 ' + v.total + ' 个：链上自动 ' + c.L1 + ' · 路由登记 ' + c.L2r
      + ' · 面板可喂 ' + c.L2p + ' · 引擎互调 ' + c.L2e;
    // 「没有驱动入口」与「未判定」必须分开念 —— 压成一句就是把下界当成全量
    if (v.scan.canConclude) {
      const noDriver = c.L3a + c.L3b;
      s += ' · 没有驱动入口 ' + noDriver;
      if (noDriver > 0) {
        s += '（只被诊断面读 ' + c.L3a + ' · 没人碰 ' + c.L3b + '）。'
          + '这 ' + noDriver + ' 个机制开关开着也不会出内容：链上不走、路由没登记、面板没控件。';
      } else s += '。所有机制都有产品登记的驱动入口。';
    } else {
      s += ' · 未判定 ' + c.undetermined;
      // 归因必须分清：预取不完整、没有预取、运行时只看到函数体 —— 三种原因，三种说法。
      if (v.scan.level === 'prefetch') {
        s += '。本宿主的源码预取不完整（' + v.scan.prefetched + '/' + v.scan.declared + '），'
          + '面板与互调这两面只读到一部分：没命中已读面的 ' + c.undetermined
          + ' 个只能确认「读到的这些面里没有」，不能确认「没有驱动者」。';
      } else if (v.scan.level === 'runtime') {
        s += '。本宿主只能读导出函数的函数体（读不到私有函数、IIFE 内部与事件回调），'
          + '面板面完全不可见：没命中链与路由的 ' + c.undetermined
          + ' 个只能确认「链和路由都没登记」，不能确认「没有驱动者」。';
      } else {
        s += '。本宿主读不到任何调用面（' + (v.scan.why || 'unavailable') + '）：'
          + c.undetermined + ' 个全部记未判定，不下任何结论。';
      }
    }
    return s;
  }


  // ── 设置（本模块唯一可配面；纯读数模块，只有开与上限）─────────────────
  function settings() {
    const raw = (WA.settingsBus ? WA.settingsBus.read(__REG) : DEF) || DEF;
    const o = Object.assign({}, DEF, raw || {});
    const out = {
      enabled: o.enabled !== false,
      includeEmpty: o.includeEmpty !== false,
      maxList: Number(o.maxList) || DEF.maxList
    };
    if (out.maxList < 10) out.maxList = 10;
    if (out.maxList > 400) out.maxList = 400;
    return out;
  }
  function getSettings() { return settings(); }
  function setSettings(next) {
    const cur = settings();
    const o = Object.assign({}, cur, next || {});
    const norm = {
      enabled: o.enabled !== false,
      includeEmpty: o.includeEmpty !== false,
      maxList: Math.max(10, Math.min(400, Number(o.maxList) || DEF.maxList))
    };
    if (WA.settingsBus && typeof WA.settingsBus.saveOrThrow === 'function') {
      WA.settingsBus.saveOrThrow(__REG, norm);
    } else if (WA.settingsBus && typeof WA.settingsBus.save === 'function') {
      WA.settingsBus.save(__REG, norm);
    }
    return { ok: true, settings: norm };
  }

  const stat = { calls: 0, lastAt: 0, lastLayer: '' };
  function statView() { return Object.assign({}, stat); }
  function noteCall() { stat.calls++; stat.lastAt = (function () { try { return WA.clock.now('driverLedger'); } catch (e) { return Date.now(); } })(); }

  // ── 导出面 ───────────────────────────────────────────────────────────
  //   刻意收窄到「产品侧真的有人调」的六口。早先还导出过 build / invalidate / DEF：
  //   实测产品代码零引用 —— 那种导出就是死面，死面会累积成「导出了 API 但全库零调用点」
  //   的老账（V7 主线要清的正是这一类）。撤下去比留着等账本记一笔更干净：
  //     · build       是 view 的内部实现，外部要读数就用 view；
  //     · invalidate  已被扫描签名取代（缓存自己会失效，不需要外部记得调）；
  //     · DEF         是本模块的设置默认表，产品侧没有读者。
  WA.driverLedger = {
    getSettings: getSettings,
    setSettings: setSettings,
    view: function () { noteCall(); return view(); },
    why: why,
    summaryText: summaryText,
    stat: statView
  };
})();
