/**
 * WorldAxis engines/world-snapshot.js (v2.200.0) — 世界快照与整包搬运（计划 Y5）
 *
 * ── 它治什么（计划 Y5 立项原文，现场读数复核过）─────────────────────
 *   玩家要把一个世界（含规则 / 人物 / 地图 / 编年史 / 拍账）拿到另一台设备或另一个存档继续，
 *   目前只有两条路，**都不是「把已有世界搬过去」**：
 *     · `engines/tool-snapshot.js` —— 整张世界状态快照，`restore()` 是**替换式**
 *       （`for (const k of Object.keys(draft)) delete draft[k]`）⇒ 装到非空世界上就是
 *       「把当前世界整块抹掉换成另一份」，没有「并进来」这回事；
 *     · `engines/world-blueprint.js` —— 「**用蓝图生成世界**」（只作用于空新局，
 *       `targetEmpty()` 一票否决），蓝图里连 memory / chronicle / currents / echoes /
 *       worldFacts / chapters 都是**刻意排除**的（它的 `excluded` 逐项列了）。
 *   本仓 `bundle` / `portable` 关键词**零命中**（立项轮实测）⇒ 这是真空白，不是重构需求。
 *
 * ── 与上面两者的分工（三条边界，不重叠）────────────────────────────
 *   · **对 tool-snapshot**：它是「整块换掉」，本模块是「按面搬 + 默认不覆盖」。
 *     两个写口都留着，因为两种意图是两件事：「我要回到那一份」与「我要把那边的世界并过来」。
 *   · **对 world-blueprint**：蓝图是**可复用的种子**（无具体历史，从它生成新世界）；
 *     快照是**具体世界的照片**（带那一局的编年史 / 拍账 / 事实）。两者互转是**单向有损**，
 *     故 `toBlueprint()` 如实列出丢掉了哪些面（`dropped`），不假装无损。
 *   · **对 world-seed**：种子是有损骨架（势力 / 关系 / 地理 / 时代四张表），更远。
 *
 * ── 计划 Y5 的四条功能，逐条落到口上 ──────────────────────────────
 *   ① 世界快照（单文件、可读 JSON、带 schema 版本）—— `exportSnapshot()`；
 *   ② 导入时的兼容检查（schema 版本差 / 缺失模块 / 命名冲突）—— `checkCompat()`；
 *   ③ 导入预览（将要新增什么、覆盖什么、跳过什么）—— `previewImport()`；
 *   ④ 快照与蓝图互转 —— `toBlueprint()` / `fromBlueprint()`。
 *
 * ── 计划 Y5 的五条边界（全是否定式，逐条落到代码）───────────────────
 *   1 **导入默认不覆盖**已有键：冲突要么跳过（默认）/ 重命名（`onConflict:'rename'`）/
 *     整世界另开槽（`mode:'newslot'`）。覆盖只有显式 `overwrite:true` 才发生。
 *     为什么默认不是覆盖：覆盖是**不可逆**的那一侧，而「并进来」这个动作里
 *     最坏的结果是把本地世界写没了。默认落在可逆的一侧，代价只是「得多点一次」。
 *   2 **版本不兼容时拒绝导入并说明差异**，不做「尽力而为」的静默降级：
 *     `wsVer` 不在 `ACCEPTED` / `schemaVersion` 高于当前 / 顶层形态不对 —— 一律
 *     `ok:false` + `diff` 逐项说清差在哪。
 *   3 **不把密钥 / 宿主机密写进快照**：`SECRETS` 是一张**显式名单**，
 *     导出时整键剔除，且**逐项如实报**（`stripped`）——静默剔除 = 用户以为带上了。
 *   4 **不含无法复现的宿主状态**：面板展开态 / 上次注入 / 运行期脏字段（`__*`）
 *     一律剔除（`DROP_PREFIX`）。理由：快照的承诺是「导入后关键面逐字一致」，
 *     把宿主态带进来会让这个承诺变成「大部分一致」。
 *   5 `newslot` 模式**不写世界状态**：另开槽落在快照库（`localStorage`，不进存档）——
 *     世界事实只该有一个家，槽是「还没搬进来的行李」，那是进程外的暂存物。
 *
 * ── 计划 Y5 的四条验收，逐条对应的判据面 ──────────────────────────
 *   ① 导出→导入往返后世界关键面逐字一致（哈希对照）—— `sigOf()` + 专锁 B 组；
 *   ② 缺失模块 / 旧 schema / 冲突键三类都有拒收或预览 —— `checkCompat()` 的
 *     `unknownFaces` / `schemaAhead` / `conflicts` 三栏，各由专锁逐条驱动；
 *   ③ 导入大世界时有容量预检 —— `capacity()`（超限 `budget-exceeded`，**不静默截断**）；
 *   ④ 损坏文件有可读错误而不是抛异常 —— `parse()` 把 JSON 解析失败收成
 *     `{ok:false, reason:'bad-json', detail}`，专锁 N 组用真源码破坏两向自证。
 *
 * ── 零新世界键（本仓口径：登记了却不在骨架里，registryParity 会当场报红）──
 *   本模块**不新增任何 `store` 顶层键**：快照库落在自己的 localStorage 键
 *   （`worldaxis_worldsnapshot_v1`），与 presetWorld / genGate / perfLedger 三条先例同规格
 *   （那些不是世界事实，不该进存档）。导入面只**改已经存在的面**，不改骨架。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const FORMAT = 1;
  const ACCEPTED = [1];
  const LIB_KEY = 'worldaxis_worldsnapshot_v1';
  const MAX_LIB = 8;
  /** 容量预检预算（字节）。超限拒收而**不截断** —— 截断会让「搬过来了」变成半句话。 */
  const MAX_BYTES = 2 * 1024 * 1024;

  // ── 面的白名单（**白名单**，不是黑名单）────────────────────────────
  //   为什么是白名单：世界面会长（本仓已 90+ 顶层键），黑名单永远跟不上，
  //   新增的面会在「整包搬运」里被**静默带上**。未点名的名字一律进 `dropped` 如实报。
  //   为什么是这些面：计划 Y5 原文点名「规则 / 人物 / 地图 / 编年史 / 拍账」，
  //   外加它们读取时所依赖的邻近面（记忆 / 事实 / 暗流 / 回声 / 势力演化 / 经济）。
  const FACES = ['people', 'world', 'evolution', 'chronicle', 'chapters',
    'beatLedger', 'beatReport', 'worldFacts', 'memory', 'currents', 'echoes',
    'economy', 'opinion', 'causal', 'bonds', 'fondness', 'inst'];
  /** 宿主机密 / 凭证类：**显式名单**，整键剔除并逐项如实报（边界 3）。 */
  const SECRETS = ['credentials', 'scripts', 'chatText', 'apiKey', 'session', 'binding', 'userlock'];
  /** 运行期脏字段前缀：带它的键一律不进快照（边界 4）。 */
  const DROP_PREFIX = '__';
  /** 无法复现的宿主态：面板展开态 / 观测量 / 上次注入 —— 名字逐个列出，不靠前缀猜。 */
  const HOST_STATE = ['lastInjection', 'nextTurnInjection', 'proactiveLastRound', 'commit'];

  const _stat = { exports: 0, imports: 0, previews: 0, refused: 0, lastReason: '', faults: {} };
  function note(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function clockNow(site) { try { return WA.clock ? WA.clock.now(site || 'worldSnapshot') : Date.now(); } catch (e) { return Date.now(); } }
  function state() { try { return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function deep(v) { try { return JSON.parse(JSON.stringify(v)); } catch (e) { return null; } }
  /** 世界指纹：与 world-blueprint 的 `sig()` 同法（32 位 FNV 风格散列，稳定、可复读）。 */
  function sig(s) {
    let h = 0x811c9dc5;
    const t = String(s == null ? '' : s);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  /** 面内容的指纹（**只比内容**，不比「这一面在不在」——缺席由 counts 报）。 */
  function sigOf(faces) {
    const f = faces || {};
    const keys = Object.keys(f).sort();
    return sig(keys.map(function (k) { return k + '=' + sig(JSON.stringify(f[k])); }).join('|'));
  }

  // ── 剔除：秘密 / 宿主态 / 脏字段 ──────────────────────────────────
  /** 逐层剔除脏字段（与 tool-snapshot 的 `sanitize` 同口径，但**多收一份账**）。 */
  function scrub(node, book) {
    if (Array.isArray(node)) return node.map(function (x) { return scrub(x, book); });
    if (node && typeof node === 'object') {
      const out = {};
      for (const k of Object.keys(node)) {
        if (k.indexOf(DROP_PREFIX) === 0) { book.dropped.push(k); continue; }
        out[k] = scrub(node[k], book);
      }
      return out;
    }
    return node;
  }
  /** 挑面：白名单 + 秘密剔除 + 宿主态剔除，三条都记账（不静默）。 */
  function pickFaces(s, want) {
    const book = { dropped: [], stripped: [], skippedHost: [] };
    const names = (Array.isArray(want) && want.length) ? want : FACES.slice();
    const faces = {}, missing = [];
    names.forEach(function (k) {
      const key = clean(k, 40);
      if (!key) return;
      if (SECRETS.indexOf(key) >= 0) { book.stripped.push(key); return; }
      if (HOST_STATE.indexOf(key) >= 0) { book.skippedHost.push(key); return; }
      if (!Object.prototype.hasOwnProperty.call(s, key)) { missing.push(key); return; }
      const v = deep(s[key]);
      faces[key] = scrub(v === null ? s[key] : v, book);
    });
    // 账面收口：白名单只决定「面」进不进快照，而「本局的密钥 / 宿主态 / 脏字段
    //   被剔掉了哪些」必须按**世界实际有的键**报 —— 否则白名单下这两张名单永远报空，
    //   玩家会以为「我库里没有凭证」。（首跑实测踩到：`credentials` 不在 FACES 里，
    //   于是 SECRETS 那条分支永不触发、`stripped` 恒为 []。）
    Object.keys(s || {}).forEach(function (k) {
      if (SECRETS.indexOf(k) >= 0) { if (book.stripped.indexOf(k) < 0) book.stripped.push(k); return; }
      if (HOST_STATE.indexOf(k) >= 0) { if (book.skippedHost.indexOf(k) < 0) book.skippedHost.push(k); return; }
      if (k.indexOf(DROP_PREFIX) === 0 && book.dropped.indexOf(k) < 0) book.dropped.push(k);
    });
    book.dropped = book.dropped.filter(function (x, i, a) { return a.indexOf(x) === i; }).slice(0, 24);
    book.stripped = book.stripped.filter(function (x, i, a) { return a.indexOf(x) === i; });
    book.skippedHost = book.skippedHost.filter(function (x, i, a) { return a.indexOf(x) === i; });
    return { faces: faces, missing: missing, book: book };
  }
  function countsOf(faces) {
    const f = faces || {};
    const num = function (v) { return Array.isArray(v) ? v.length : (isObj(v) ? Object.keys(v).length : 0); };
    return { faces: Object.keys(f).length, people: num(f.people), chronicle: num(f.chronicle),
      facts: num(f.worldFacts), ledger: num(f.beatLedger && f.beatLedger.rows),
      chapters: num(f.chapters && f.chapters.history), factions: num(f.evolution && f.evolution.factions) };
  }
  function worldKeyOf(s) {
    try { if (WA.worldBridge && typeof WA.worldBridge.worldKey === 'function') return String(WA.worldBridge.worldKey() || ''); } catch (e) { }
    return sig(JSON.stringify((s.evolution && s.evolution.factions || []).map(function (f) { return f && f.name; })));
  }

  // ── ① 导出 ──────────────────────────────────────────────────────
  /**
   * 出一个世界快照。**纯读**（零 store 写、零 localStorage 写）。
   * @param {object} [opt] { faces: string[], label: string }
   * @returns {ok, snapshot, sig, counts, dropped, stripped, skippedHost} 或 {ok:false, reason}
   */
  function exportSnapshot(opt) {
    const o = opt || {};
    const s = state();
    if (!s || !Object.keys(s).length) { note('empty-world'); return { ok: false, reason: 'empty-world' }; }
    const p = pickFaces(s, o.faces);
    if (!Object.keys(p.faces).length) { note('empty-snapshot'); return { ok: false, reason: 'empty-snapshot', missing: p.missing }; }
    const snap = {
      wsVer: FORMAT,
      at: clockNow('worldSnapshot.export'),
      schemaVersion: Number(s.schemaVersion || 1),
      chatLabel: clean(o.label || (s.clock && s.clock.label) || '', 60),
      worldKey: worldKeyOf(s),
      faces: p.faces,
      sig: sigOf(p.faces)
    };
    snap.bytes = JSON.stringify(snap).length;
    _stat.exports++; _stat.lastReason = 'exported';
    return { ok: true, snapshot: snap, sig: snap.sig, bytes: snap.bytes,
      counts: countsOf(p.faces), missing: p.missing,
      dropped: p.book.dropped, stripped: p.book.stripped, skippedHost: p.book.skippedHost,
      note: '秘密类键（' + SECRETS.join('/') + '）与宿主态（' + HOST_STATE.join('/') + '）已剔除并逐项报出。' };
  }
  /** 出可读 JSON 文本（缩进 2）。 */
  function toJSON(opt) {
    const r = exportSnapshot(opt);
    if (!r.ok) return r;
    return { ok: true, text: JSON.stringify(r.snapshot, null, 2), bytes: r.bytes, counts: r.counts, sig: r.sig };
  }
  /** 解析：字符串 / 对象都收 —— **坏文件给可读错误，不抛异常**（验收 ④）。 */
  function parse(raw) {
    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); }
      catch (e) { return { ok: false, reason: 'bad-json', detail: String((e && e.message) || e).slice(0, 160) }; }
    }
    if (!isObj(data)) return { ok: false, reason: 'bad-shape', detail: '快照顶层不是对象' };
    if (!isObj(data.faces)) return { ok: false, reason: 'bad-shape', detail: '快照缺少 faces 对象' };
    return { ok: true, snapshot: data };
  }

  // ── ② 兼容检查 ─────────────────────────────────────────────────
  /**
   * 导入前的兼容检查：**不写任何东西**，只回答「这份快照能不能装、差在哪」。
   * 三条判据逐条出自计划原文：schema 版本差 / 缺失模块 / 命名冲突。
   */
  function checkCompat(raw) {
    const p = parse(raw);
    if (!p.ok) { note(p.reason); return { ok: false, reason: p.reason, detail: p.detail, blocking: true }; }
    const snap = p.snapshot;
    const s = state();
    const ver = Number(snap.wsVer);
    const diff = { snapshotVer: snap.wsVer, accepted: ACCEPTED.slice(),
      snapshotSchema: Number(snap.schemaVersion || 0), currentSchema: Number(s.schemaVersion || 1),
      unknownFaces: [], conflicts: [], absent: [] };
    // ① 格式版本
    if (!ACCEPTED.length || ACCEPTED.indexOf(ver) < 0) {
      note('bad-snapshot-ver');
      return { ok: false, reason: 'bad-snapshot-ver', blocking: true, diff: diff,
        detail: '快照格式 ' + (snap.wsVer === undefined ? '(缺 wsVer)' : snap.wsVer) + ' 不在受支持面 ' + ACCEPTED.join('/') };
    }
    // ② schema 版本差（快照比当前新 ⇒ 拒收；比当前旧 ⇒ 放行但**如实标注**）
    if (diff.snapshotSchema > diff.currentSchema) {
      note('schema-ahead');
      return { ok: false, reason: 'schema-ahead', blocking: true, diff: diff,
        detail: '快照存档 schema ' + diff.snapshotSchema + ' 高于当前 ' + diff.currentSchema };
    }
    // ③ 缺失模块 / 命名冲突（逐面判，两条都进 diff，不合并成一栏）
    Object.keys(snap.faces).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(s, k)) {
        // 面名在此世界**根本不存在** —— 这不是「空」，是「这个模块不在这局里」。
        //   静默装进去等于凭空造一个骨架里没有的键（registryParity 会报「未在骨架物化」）。
        diff.unknownFaces.push(k);
        return;
      }
      const inc = snap.faces[k], cur = s[k];
      if (isObj(inc) && isObj(cur)) {
        const dup = Object.keys(inc).filter(function (kk) { return Object.prototype.hasOwnProperty.call(cur, kk); });
        if (dup.length) diff.conflicts.push({ face: k, keys: dup.slice(0, 12), n: dup.length });
      } else if (Array.isArray(inc) && Array.isArray(cur) && cur.length) {
        // 数组面（编年史 / 事实 / 拍账…）：冲突判据是**有没有东西**，不是逐元素比 ——
        //   逐元素比会把「同一条在不同局里长得一样」误判成不冲突（id 是局内生成的）。
        diff.conflicts.push({ face: k, keys: ['(数组面非空)'], n: cur.length });
      }
    });
    const blocking = diff.unknownFaces.length > 0;
    return { ok: !blocking, reason: blocking ? 'unknown-faces' : 'compatible',
      blocking: blocking, diff: diff, sig: snap.sig || sigOf(snap.faces),
      counts: countsOf(snap.faces), bytes: Number(snap.bytes || JSON.stringify(snap).length) };
  }

  // ── ③ 导入预览 ─────────────────────────────────────────────────
  /**
   * 预览：将要**新增什么 / 冲突什么 / 跳过什么**。**纯读**（零写入）。
   * @param {object|string} raw 快照
   * @param {object} [opt] { overwrite: boolean, onConflict: 'skip'|'rename', mode: 'merge'|'newslot' }
   */
  function previewImport(raw, opt) {
    const o = opt || {};
    const cc = checkCompat(raw);
    _stat.previews++;
    if (cc.blocking) {
      return { ok: false, reason: cc.reason, detail: cc.detail, diff: cc.diff,
        willAdd: [], willOverwrite: [], willSkip: [], willRename: [], blocked: true };
    }
    const snap = parse(raw).snapshot;
    const s = state();
    const mode = (o.mode === 'newslot') ? 'newslot' : 'merge';
    const overwrite = o.overwrite === true;
    const rename = (o.onConflict === 'rename');
    const add = [], over = [], skip = [], ren = [];
    const confMap = {};
    (cc.diff.conflicts || []).forEach(function (c) { confMap[c.face] = c; });
    Object.keys(snap.faces).forEach(function (face) {
      const c = confMap[face];
      if (!c) { add.push({ face: face, n: faceSize(snap.faces[face]) }); return; }
      if (mode === 'newslot') { add.push({ face: face, n: faceSize(snap.faces[face]), note: '另开槽：不碰当前世界' }); return; }
      if (overwrite) { over.push({ face: face, n: c.n }); return; }
      if (rename) { ren.push({ face: face, as: face + '·' + (snap.sig || 'snap'), n: c.n }); return; }
      skip.push({ face: face, n: c.n, why: 'conflict-kept' });
    });
    const cap = capacity(snap);
    return { ok: true, mode: mode, overwrite: overwrite, onConflict: rename ? 'rename' : 'skip',
      willAdd: add, willOverwrite: over, willSkip: skip, willRename: ren,
      unknownFaces: cc.diff.unknownFaces.slice(), bytes: cap.bytes, budget: cap.budget,
      capacityOk: cap.ok, capacityReason: cap.reason || '',
      sig: snap.sig || sigOf(snap.faces), counts: countsOf(snap.faces) };
  }
  function faceSize(v) { return Array.isArray(v) ? v.length : (isObj(v) ? Object.keys(v).length : 0); }
  /** 容量预检：超预算拒收（**不截断** —— 截断会让「搬过来了」变成半句话）。 */
  function capacity(snap) {
    const bytes = Number((snap && snap.bytes) || (snap ? JSON.stringify(snap).length : 0));
    if (bytes > MAX_BYTES) {
      note('budget-exceeded');
      return { ok: false, reason: 'budget-exceeded', bytes: bytes, budget: MAX_BYTES };
    }
    return { ok: true, bytes: bytes, budget: MAX_BYTES };
  }

  // ── ④ 快照与蓝图互转 ────────────────────────────────────────────
  /**
   * 快照 → 蓝图：**单向有损**。丢掉的面逐项列出（`dropped`），不假装无损。
   *   为什么要它：蓝图是可复用的「种子」（能反复开新局），快照是「照片」（只对应那一局）。
   *   把照片另存成种子是常见诉求，但**带历史的部分进不去**（蓝图没有承载它的字段）。
   */
  function toBlueprint(raw) {
    const p = parse(raw);
    if (!p.ok) { note(p.reason); return { ok: false, reason: p.reason, detail: p.detail }; }
    if (!WA.worldBlueprint || typeof WA.worldBlueprint.exportBlueprint !== 'function') {
      note('module-missing'); return { ok: false, reason: 'module-missing', detail: 'worldBlueprint 缺席' };
    }
    // 只搬「能从快照面反推蓝图字段」的那部分：本模块**不自己重写一份映射**，
    //   蓝图字段的语义归 world-blueprint，这里只把面原样交给它去读（它是唯一真源）。
    const dropped = Object.keys(p.snapshot.faces).filter(function (k) {
      return ['chronicle', 'chapters', 'beatLedger', 'beatReport', 'currents', 'echoes', 'worldFacts'].indexOf(k) >= 0;
    });
    const bp = WA.worldBlueprint.exportBlueprint({ keep: 'structure' });
    if (!bp || bp.ok !== true) {
      return { ok: false, reason: (bp && bp.reason) || 'blueprint-refused', detail: '蓝图导出面拒收：本局结构面为空或不完整' };
    }
    _stat.lastReason = 'to-blueprint';
    return { ok: true, blueprint: bp.blueprint, bpSig: bp.bpSig, fromSig: p.snapshot.sig || sigOf(p.snapshot.faces),
      dropped: dropped, lossy: true,
      note: '单向有损：编年史 / 章节 / 拍账 / 暗流 / 回声 / 世界事实六类不承载在蓝图里（它没有这些字段）。' };
  }
  /**
   * 蓝图 → 快照：把蓝图的**结构面**包成快照形态（faces.people / faces.world / faces.evolution）。
   *   为什么也标 lossy：蓝图里没有历史，出来的快照自然也没有 —— 这一点必须写在回执里，
   *   否则用户会以为「蓝图里本来就记着编年史，只是我没看见」。
   */
  function fromBlueprint(bpIn) {
    if (!isObj(bpIn)) { note('bad-shape'); return { ok: false, reason: 'bad-shape', detail: '蓝图不是对象' }; }
    const ids = isObj(bpIn.ids) ? bpIn.ids : {};
    const people = {};
    (Array.isArray(ids.people) ? ids.people : []).forEach(function (r, i) {
      if (!isObj(r)) return;
      const key = clean(r.key || ('bp_' + i), 60);
      if (!key) return;
      people[key] = { id: key, name: clean(r.name || key, 40), fromBlueprint: true };
    });
    const places = (Array.isArray(ids.places) ? ids.places : []).map(function (r) {
      return isObj(r) ? { name: clean(r.name || r.key, 40), key: clean(r.key, 60) } : null;
    }).filter(Boolean);
    const roads = (Array.isArray(bpIn.roads) ? bpIn.roads : []).map(function (r) {
      return isObj(r) ? { a: clean(r.a, 60), b: clean(r.b, 60) } : null;
    }).filter(function (r) { return r && r.a && r.b; });
    const factions = (Array.isArray(ids.powers) ? ids.powers : []).map(function (r) {
      return isObj(r) ? { name: clean(r.name || r.key, 40) } : null;
    }).filter(Boolean);
    const faces = {
      people: people,
      world: { places: places, roads: roads },
      evolution: { factions: factions, round: 0, events: [], winds: [], trends: [], enemies: [] }
    };
    _stat.lastReason = 'from-blueprint';
    return { ok: true, snapshot: { wsVer: FORMAT, at: clockNow('worldSnapshot.fromBlueprint'),
      schemaVersion: Number((state().schemaVersion) || 1), chatLabel: '', worldKey: String(bpIn.worldKey || ''),
      faces: faces, sig: sigOf(faces), bytes: JSON.stringify(faces).length },
      lossy: true, dropped: ['chronicle', 'chapters', 'beatLedger', 'beatReport', 'memory', 'worldFacts'],
      note: '蓝图只有结构面（人物 / 势力 / 地名 / 道路）：编年史 / 章节 / 拍账 / 记忆 / 世界事实**本就不在里面**，故出来的快照也没有。' };
  }

  // ── 导入（有写口：merge 才动世界状态）─────────────────────────────
  /**
   * 导入。三种模式：
   *   · `merge`（默认）：把快照的面并进当前世界。**默认不覆盖**冲突键 ——
   *     冲突按 `onConflict` 处置：`skip`（默认，逐项报）/ `rename`（改名进来）；
   *   · `newslot`：**不碰当前世界**，把快照原样存进快照库（localStorage）。
   * 唯一的写入通道是 `store.transact`（merge）或快照库（newslot），没有第三条。
   */
  function importSnapshot(raw, opt) {
    const o = opt || {};
    const pv = previewImport(raw, o);
    if (pv.blocked) { note(pv.reason); return { ok: false, reason: pv.reason, detail: pv.detail, diff: pv.diff }; }
    if (!pv.capacityOk) { return { ok: false, reason: pv.capacityReason, bytes: pv.bytes, budget: pv.budget }; }
    const snap = parse(raw).snapshot;
    if (pv.mode === 'newslot') {
      const put = libPut(snap, o);
      if (!put.ok) return put;
      _stat.imports++; _stat.lastReason = 'newslot';
      return { ok: true, mode: 'newslot', slot: put.slot, bytes: pv.bytes, sig: pv.sig,
        note: '存进快照库（localStorage），当前世界**一格未动**。要装进世界请用 merge 或在空世界上装载。' };
    }
    if (!WA.store || typeof WA.store.transact !== 'function') { note('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    const overwrite = o.overwrite === true;
    const rename = (o.onConflict === 'rename');
    // 逐面合并的结果账（**部分成功是真结论**：谎报「全装上了」会让用户以为某面搬过来了）
    const added = [], overwritten = [], skipped = [], renamed = [];
    const tx = WA.store.transact(function (draft) {
      Object.keys(snap.faces).forEach(function (face) {
        const inc = deep(snap.faces[face]);
        if (!Object.prototype.hasOwnProperty.call(draft, face)) { skipped.push({ face: face, why: 'unknown-face' }); return; }
        const cur = draft[face];
        if (isObj(inc) && isObj(cur)) {
          const dup = Object.keys(inc).filter(function (k) { return Object.prototype.hasOwnProperty.call(cur, k); });
          if (!dup.length) {
            Object.keys(inc).forEach(function (k) { cur[k] = inc[k]; });
            added.push({ face: face, n: Object.keys(inc).length }); return;
          }
          if (overwrite) {
            Object.keys(inc).forEach(function (k) { cur[k] = inc[k]; });
            overwritten.push({ face: face, n: dup.length }); return;
          }
          if (rename) {
            Object.keys(inc).forEach(function (k) {
              if (!Object.prototype.hasOwnProperty.call(cur, k)) { cur[k] = inc[k]; return; }
              cur[k + '·' + (snap.sig || 'snap')] = inc[k];
            });
            renamed.push({ face: face, n: dup.length }); return;
          }
          // 默认支：**只并进不冲突的那些键**，冲突键原地不动（逐项报）
          let n = 0;
          Object.keys(inc).forEach(function (k) {
            if (Object.prototype.hasOwnProperty.call(cur, k)) return;
            cur[k] = inc[k]; n++;
          });
          skipped.push({ face: face, n: dup.length, added: n, why: 'conflict-kept' });
          return;
        }
        if (Array.isArray(inc) && Array.isArray(cur)) {
          if (!cur.length || overwrite) {
            const before = cur.length;
            inc.forEach(function (x) { cur.push(x); });
            (before ? overwritten : added).push({ face: face, n: inc.length });
            return;
          }
          // 数组面不覆盖：**不重复追加**（按 JSON 逐字去重），冲突部分如实报
          const seen = {};
          cur.forEach(function (x) { seen[sig(JSON.stringify(x))] = true; });
          let n = 0, dup = 0;
          inc.forEach(function (x) {
            const h = sig(JSON.stringify(x));
            if (seen[h]) { dup++; return; }
            seen[h] = true; cur.push(x); n++;
          });
          skipped.push({ face: face, n: dup, added: n, why: 'conflict-kept' });
          return;
        }
        // 形态不同（快照是对象、本地是数组，或反之）：**不硬塞**，如实报
        if (overwrite) { draft[face] = inc; overwritten.push({ face: face, n: faceSize(inc) }); }
        else skipped.push({ face: face, why: 'shape-mismatch' });
      });
    }, 'worldSnapshot:import');
    if (!tx || tx.ok === false) {
      note('write-failed');
      return { ok: false, reason: 'write-failed', detail: String((tx && tx.error && tx.error.message) || '未知') };
    }
    _stat.imports++;
    _stat.lastReason = (overwritten.length || renamed.length) ? 'partial' : 'imported';
    return { ok: true, mode: 'merge', added: added, overwritten: overwritten,
      skipped: skipped, renamed: renamed,
      partial: skipped.length > 0 || overwritten.length > 0,
      sig: snap.sig, counts: countsOf(snap.faces), nested: !!(tx && tx.deferred === true),
      note: '默认不覆盖：冲突键按 onConflict 处置（默认 skip）。写路径唯一：store.transact。' };
  }
  /** 导出→导入往返的**同源对照**：关键面哈希（验收 ①）。 */
  function roundTrip(snapIn, facesIn) {
    const p = parse(snapIn);
    if (!p.ok) { note(p.reason); return { ok: false, reason: p.reason, detail: p.detail }; }
    const s = state();
    const names = (Array.isArray(facesIn) && facesIn.length) ? facesIn : Object.keys(p.snapshot.faces);
    const live = {}, dead = [];
    names.forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(s, k)) { dead.push(k); return; }
      live[k] = s[k];
    });
    const a = sigOf(p.snapshot.faces);
    const b = sigOf(live);
    return { ok: a === b, snapshotSig: a, liveSig: b, compared: Object.keys(live).length, absent: dead };
  }

  // ── 快照库（localStorage，**不进世界状态**）──────────────────────
  function lsGet() {
    try { const raw = window.localStorage.getItem(LIB_KEY); return raw ? JSON.parse(raw) : { ver: FORMAT, slots: [] }; }
    catch (e) { return { ver: FORMAT, slots: [] }; }
  }
  function lsSet(v) {
    try { window.localStorage.setItem(LIB_KEY, JSON.stringify(v)); return { ok: true }; }
    catch (e) { return { ok: false, reason: 'ls-write-failed' }; }
  }
  function libPut(snap, opt) {
    const lib = lsGet();
    const name = clean((opt && opt.slot) || ('snap-' + (snap.sig || 'x') + '-' + snap.at), 40);
    const slots = Array.isArray(lib.slots) ? lib.slots : [];
    const row = { slot: name, at: snap.at, sig: snap.sig, bytes: Number(snap.bytes || JSON.stringify(snap).length),
      counts: countsOf(snap.faces), snapshot: snap };
    const i = slots.findIndex ? slots.findIndex(function (x) { return x && x.slot === name; }) : -1;
    if (i >= 0) slots[i] = row; else slots.push(row);
    while (slots.length > MAX_LIB) slots.shift();
    const w = lsSet({ ver: FORMAT, slots: slots });
    if (!w.ok) { note(w.reason); return { ok: false, reason: w.reason }; }
    return { ok: true, slot: name, slots: slots.length };
  }
  function library() {
    const lib = lsGet();
    const slots = Array.isArray(lib.slots) ? lib.slots : [];
    return { ok: true, max: MAX_LIB, count: slots.length,
      rows: slots.map(function (x) { return { slot: x.slot, at: x.at, sig: x.sig, bytes: x.bytes, counts: x.counts }; }) };
  }
  function libTake(slotName) {
    const lib = lsGet();
    const n = clean(slotName, 40);
    const row = (Array.isArray(lib.slots) ? lib.slots : []).filter(function (x) { return x && x.slot === n; })[0] || null;
    if (!row) return { ok: false, reason: 'not-found', slot: n };
    return { ok: true, slot: n, snapshot: row.snapshot, sig: row.sig, counts: row.counts };
  }
  function libDrop(slotName) {
    const lib = lsGet();
    const n = clean(slotName, 40);
    const slots = (Array.isArray(lib.slots) ? lib.slots : []).filter(function (x) { return x && x.slot !== n; });
    if (slots.length === (lib.slots || []).length) return { ok: false, reason: 'not-found', slot: n };
    const w = lsSet({ ver: FORMAT, slots: slots });
    if (!w.ok) return w;
    return { ok: true, slot: n, remaining: slots.length };
  }

  function catalog() {
    return {
      FORMAT: FORMAT, ACCEPTED: ACCEPTED.slice(), FACES: FACES.slice(),
      SECRETS: SECRETS.slice(), HOST_STATE: HOST_STATE.slice(),
      DROP_PREFIX: DROP_PREFIX, MAX_BYTES: MAX_BYTES, MAX_LIB: MAX_LIB, LIB_KEY: LIB_KEY,
      CONFLICT_MODES: ['skip', 'rename'], MODES: ['merge', 'newslot']
    };
  }
  function diagnose() {
    const s = state();
    const lib = library();
    const live = FACES.filter(function (k) { return Object.prototype.hasOwnProperty.call(s, k); });
    return { ok: true, facesDeclared: FACES.length, facesLive: live.length,
      facesMissing: FACES.filter(function (k) { return live.indexOf(k) < 0; }),
      secretsDeclared: SECRETS.slice(), hostStateDeclared: HOST_STATE.slice(),
      storeAvailable: !!(WA.store && typeof WA.store.transact === 'function'),
      blueprintAvailable: !!(WA.worldBlueprint && typeof WA.worldBlueprint.exportBlueprint === 'function'),
      library: { count: lib.count, max: lib.max },
      bytes: JSON.stringify(s).length, budget: MAX_BYTES,
      stat: statOf() };
  }
  function statOf() {
    return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults) });
  }
  function reset() { _stat.exports = 0; _stat.imports = 0; _stat.previews = 0; _stat.refused = 0; _stat.lastReason = ''; _stat.faults = {}; return { ok: true }; }

  WA.worldSnapshot = {
    FORMAT: FORMAT,
    FACES: FACES.slice(),
    SECRETS: SECRETS.slice(),
    HOST_STATE: HOST_STATE.slice(),
    catalog: catalog,
    exportSnapshot: exportSnapshot, toJSON: toJSON, parse: parse,
    checkCompat: checkCompat, previewImport: previewImport, importSnapshot: importSnapshot,
    toBlueprint: toBlueprint, fromBlueprint: fromBlueprint, roundTrip: roundTrip,
    capacity: capacity, sigOf: sigOf,
    library: library, libTake: libTake, libDrop: libDrop,
    diagnose: diagnose, stat: statOf, reset: reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/world-snapshot.js', { kind: 'engine', ver: '2.200.0' });
})();
