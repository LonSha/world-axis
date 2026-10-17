/**
 * WorldAxis engines/branch-diff.js (v2.224.0) — 分支语义比较与选择性移植(N8)
 *
 * ── 它治什么(缺口,先用源码说清)──────────────────────────────
 *   本仓此前有**两处**「两个世界差在哪」的答案,但两处都停在**形态**上:
 *     · engines/branch-tree.js `compare(idA,idB)` —— 只比三个**指纹读数**
 *       (keys / chars / digest),答的是「两块东西长得像不像」。
 *     · engines/checkpoints.js `compare(idA,idB)` —— 只到**顶层键粒度**
 *       (`keySig` 给 `'array:12'` / `'object:3'`,答的是「哪几块不同」)。
 *   于是「A 世界比 B 世界多**哪两个人**、多了**哪条义务**、哪一笔**事已落定**」这件事,
 *   在全仓**没有任何一处**能回答 —— 用户看到的是「people 这一块不同」,而不是「多了谁」。
 *   本模块把那两处**收窄一层的读数升级成语义差**:实体 / 关系 / 义务 / 事件四类,
 *   逐行按**身份键**配对,逐行给「新增 / 消失 / 改了哪几个字段」。
 *
 * ── 三条承重口径(每条都是「换个写法就会出错」的那种)────────────
 *   1 **行身份从 `IDENTITY_REFS` 现取,不另立第二份**。跨面引用按什么字段对齐,
 *      `engines/world-snapshot.js` 的 `IDENTITY_REFS` 已经是**单一真源**
 *      (它治的正是「全局替换」那个病)。本模块只**借它的字段名**,取不到时如实记
 *      `idSource:'declared'` —— **不说「我按名字配的」却不告诉你是哪一份名单给的**。
 *   2 **缺身份键的行如实报 `no-identity`,绝不按位置配对**。按位置配对是这一族里
 *      最诱人的错:在表头插一行,整表会被读成「几乎每一行都改了」。
 *      本仓对「半份比拒收更难查」已有裁决(checkpoints 的块数如实口径同源),
 *      故这里宁可不比,也不编一个配对出来。
 *   3 **历史项默认不可重放**。付款 / 揭密 / 已结算因果是**既成事实**,不是配置 ——
 *      把它们「移植」到另一条时间线上,等于伪造一段没发生过的过去。
 *      故 `event` 类(账本类)与行上带结算标记的义务,默认一律落 `blocked`,
 *      要放行须显式把 `includeHistory` 打开(且逐条标注 `history:true`,由调用方自负)。
 *
 * ── 「有共同基点才做三方比较」(计划原文逐字)────────────────────
 *   三方比较的**前提**是三方从同一处出发:否则「A 与 B 分道」这句判断本身无意义
 *   (它们可能本来就不同源)。基点取自槽位的 `root`(checkpoints 把父链存进槽位,
 *   正是为了让「我从哪来」能独立复述 —— 库会挤出最旧的档,现算会永久丢失这个事实)。
 *   三方 root 不全相同 ⇒ **如实报 `no-basis` 并带回三方的 root**,不硬比。
 *
 * ── 本模块**不做**什么(边界)──────────────────────────────────
 *   · **不改任何世界状态、不改任何分支**:`transplant` 只给**计划**(`readOnly:true`,
 *     与 checkpoints `branchPlan` 同口径),落地由调用方在自己的事务里做。
 *     「原分支不改」这句硬要求的实现方式就是:**这个模块里没有一条写路径**。
 *   · 不重算容器的 cap 与挤出策略(那是各模块自己的事)。
 *
 * ── 本轮实测到的**真源不完整**(如实留账,不当成通过遮掩)───────────
 *   `world-snapshot` 的**导出面** `IDENTITY_REFS` 在第 886 行只 map 出
 *   `{face, at, field, domain}` —— **`fields` 数组被丢掉了**。后果:单字段行
 *   (people.id / fondness.rows.person …)还能读 `field`,而**多字段行**
 *   (bonds 的 `key`+`a`+`b`,那条注释明写「三者必须同批处理」)从真源取不全。
 *   本模块对此的处理是**退到声明表兜底并把 `source` 如实标成 `declared`**,
 *   绝不假称「这是从真源拿到的」。修导出面属另一件事(它会动 export-contract
 *   的冻结串),故本轮不改它,只把事实记在这里与 ITERATION_LOG 的收口段。
 *   · 不跨插件(对端契约属 N9,不在本面)。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_branch_diff_v1';
  const DEF = { enabled: false, includeHistory: false, maxRows: 200 };
  const __REG = { key: LS_KEY, def: DEF, module: 'branchDiff',
    bounds: { maxRows: [10, 1000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { diffs: 0, tris: 0, transplants: 0, faults: {}, lastReason: '' };
  function noteFault(code) {
    const t = String(code == null ? 'unknown' : code);
    stat.faults[t] = (stat.faults[t] || 0) + 1;
    stat.lastReason = t;
    return t;
  }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function at(obj, p) {
    const segs = String(p).split('.');
    let cur = obj;
    for (let i = 0; i < segs.length; i++) { if (cur === null || cur === undefined) return undefined; cur = cur[segs[i]]; }
    return cur;
  }
  /** 稳定序列化 + 32 位 FNV-1a:同一份值在任何插入顺序下得同一个指纹(与 blueprint/快照 sig 同法)。 */
  function stable(v) {
    if (v === null || v === undefined) return String(v);
    if (typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    const ks = Object.keys(v).sort();
    return '{' + ks.map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  function sig(v) {
    const s = stable(v);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return ('0000000' + h.toString(16)).slice(-8);
  }
  /**
   * 行身份的字段名单:真源是 world-snapshot 的 `IDENTITY_REFS`(见头注口径 1)。
   *   取不到的形态有两种,都必须**可分辨**:`declared`(声明表兜底)/ `identity-refs`(官方名单)。
   *   第三种是 `absent` —— 连声明都没给(面本身不在支持集),如实报而不猜一个字段。
   */
  function idSpec(face) {
    const refs = (WA.worldSnapshot && Array.isArray(WA.worldSnapshot.IDENTITY_REFS)) ? WA.worldSnapshot.IDENTITY_REFS : null;
    if (refs) {
      const f = String(face.path).split('.')[0];
      const a = face.at || 'self';
      const hit = refs.filter(function (r) { return r && r.face === f && r.at === a; })[0];
      if (hit) {
        // ⚠ **实测到的真源不完整**:world-snapshot 的导出面把 `fields` **丢了**
        //   (第 886 行只 map 出 face/at/field/domain)—— 单字段行还能读 `field`,
        //   多字段行(bonds 的 key+a+b)从真源**取不全**。此处不假装拿到了:
        //   取不全就走声明表兜底,并把 `source` 如实标成 `declared`(见头注「真源不完整」段)。
        const fields = (hit.fields ? hit.fields.slice() : [hit.field]).filter(Boolean);
        const declared = (face.ids ? face.ids.slice() : []);
        if (fields.length >= declared.length && fields.length) {
          return { fields: fields, source: 'identity-refs', domain: hit.domain || '' };
        }
      }
    }
    const own = (face.ids ? face.ids.slice() : []);
    if (own.length) return { fields: own, source: 'declared', domain: '' };
    return { fields: [], source: 'absent', domain: '' };
  }
  // ── 四类落点(每一类都指向**骨架里已有的面**,本模块不新造容器)──────────
  //   `replay` 是本模块的**承重声明**:
  //     · `live`   —— 现行配置(人/势力/组织/关系/在途义务)。改了它就是改了「现在」,可移植。
  //     · `ledger` —— 历史账本(暗流/回声/纪事/已结算因果/拍账)。它记的是**发生过的事**,
  //                   把它搬到另一条时间线上无一不是在伪造过去,故默认不可重放。
  const FACES = [
    { cls: 'entity', path: 'people', ids: ['id'], replay: 'live' },
    { cls: 'entity', path: 'evolution.factions', ids: ['id'], replay: 'live' },
    { cls: 'entity', path: 'inst.orgs', ids: ['id'], replay: 'live' },
    { cls: 'relation', path: 'people', at: 'profile.relations', ids: ['target'], replay: 'live' },
    { cls: 'relation', path: 'people', at: 'profile.relationships', ids: ['target'], replay: 'live' },
    { cls: 'relation', path: 'fondness.rows', ids: ['person'], replay: 'live' },
    { cls: 'relation', path: 'bonds.rows', ids: ['key', 'a', 'b'], replay: 'live' },
    { cls: 'obligation', path: 'freight.shipments', ids: ['id'], replay: 'live' },
    { cls: 'obligation', path: 'causal.chains', ids: ['id'], replay: 'live' },
    { cls: 'obligation', path: 'people', at: 'life.commitments', ids: ['target'], replay: 'live' },
    { cls: 'event', path: 'currents', ids: ['id'], replay: 'ledger' },
    { cls: 'event', path: 'echoes', ids: ['id'], replay: 'ledger' },
    { cls: 'event', path: 'chronicle', ids: ['id'], replay: 'ledger' },
    { cls: 'event', path: 'causal.settled', ids: ['id'], replay: 'ledger' },
    { cls: 'event', path: 'beatLedger.rows', ids: ['id'], replay: 'ledger' }
  ];
  const CLASSES = ['entity', 'relation', 'obligation', 'event'];
  const CLS_LABEL = { entity: '实体', relation: '关系', obligation: '义务', event: '事件' };
  /** 行上带这些标记 ⇒ 该行是**已结算**的既成事实(义务类里混着的历史项)。 */
  const SETTLED_KEYS = ['settled', 'paidAt', 'deliveredAt', 'revealedAt'];
  const SETTLED_STATUS = ['settled', 'delivered', 'paid', 'revealed', 'done', 'closed'];
  function isSettledRow(row) {
    if (!isObj(row)) return false;
    for (let i = 0; i < SETTLED_KEYS.length; i++) {
      const v = row[SETTLED_KEYS[i]];
      if (v === true || (typeof v === 'number' && isFinite(v) && v > 0)) return true;
    }
    return SETTLED_STATUS.indexOf(String(row.status || '')) >= 0;
  }
  /**
   * 把一个「面」展开成**带身份的行列表**。
   *   `at` 给了就是嵌套面(先走 path 到一个 map,再逐人取行内路径);
   *   没给就是顶层面(path 直接是 map 或 list)。
   */
  function rowsOf(st, face) {
    const spec = idSpec(face);
    const out = [];
    function take(row, tag) {
      if (!isObj(row)) return;
      // **配对键**(ids[0])与**同批校验字段**(ids[1..])分开:
      //   · 配对键决定「这两行是不是同一行」;
      //   · 同批校验字段**排序后**参与 id 的稳定拼接 —— 顺序无关,
      //     否则 A(甲×乙,甲,乙) 与 B(甲×乙,乙,甲) 会得到两个不同的 id,
      //     一对「同一行」被读成「一边有一行、另一边有另一行」(凭空造出差异)。
      //     这是探针实测到的形态(bonds 的 key+a+b 那条注释「三者必须同批处理」正指这里)。
      const fs_ = spec.fields;
      const keyVals = fs_.slice(0, 1).map(function (f) { return row[f]; })
        .filter(function (v) { return v !== undefined && v !== null && String(v) !== ''; });
      const extraVals = fs_.slice(1).map(function (f) { return row[f]; })
        .filter(function (v) { return v !== undefined && v !== null && String(v) !== ''; })
        .map(String).sort();
      const id = keyVals.length ? (String(keyVals[0]) + (extraVals.length ? ('|' + extraVals.join('|')) : '')) : '';
      out.push({ id: id, hasId: !!id, tag: tag, row: row, idSource: spec.source, idDomain: spec.domain });
    }
    const base = at(st, face.path);
    if (face.at) {
      if (isObj(base)) {
        Object.keys(base).forEach(function (k) {
          const inner = at(base[k], face.at);
          if (Array.isArray(inner)) inner.forEach(function (r) { take(r, k); });
        });
      }
    } else if (Array.isArray(base)) {
      base.forEach(function (r) { take(r, ''); });
    } else if (isObj(base)) {
      Object.keys(base).forEach(function (k) { take(base[k], k); });
    }
    return out;
  }
  /** 行内容里**变了的顶层字段名**(限 12 个;这是「语义差」与「块大小差」的分水岭)。 */
  function diffFields(rowA, rowB) {
    const out = [];
    const ks = {};
    [rowA, rowB].forEach(function (r) {
      if (isObj(r)) Object.keys(r).forEach(function (k) { ks[k] = 1; });
    });
    Object.keys(ks).sort().forEach(function (k) {
      if (out.length >= 12) return;
      if (sig(rowA ? rowA[k] : undefined) !== sig(rowB ? rowB[k] : undefined)) out.push(k);
    });
    return out;
  }
  /** 有界化:明细行超过 `maxRows` 时**如实截断并带回总数**(不静默丢)。 */
  function bound(arr, cap) {
    return { items: arr.slice(0, cap), total: arr.length, truncated: arr.length > cap };
  }
  function rootOf(slot) { return (slot && (slot.root || slot.name)) || ''; }// ── 槽位读取(全部走 checkpoints 的只读面,不自立第二份库)──────────────
  function readSlot(id) {
    const rid = clean(id, 40);
    if (!rid) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!WA.checkpoints || typeof WA.checkpoints.read !== 'function') {
      noteFault('module-missing'); return { ok: false, reason: 'module-missing', what: 'checkpoints' };
    }
    const r = WA.checkpoints.read(rid);
    if (!r || r.ok !== true) { noteFault((r && r.reason) || 'missing'); return { ok: false, reason: (r && r.reason) || 'missing', id: rid }; }
    return r;
  }
  function gate() {
    const cfg = settings();
    if (!cfg.enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    return { ok: true, cfg: cfg };
  }
  /**
   * 语义比较:两个槽位的世界在**实体 / 关系 / 义务 / 事件**四类上的逐行差异。
   *   返回 `classes` 是四类**各自成栏**(不是一个大杂烩):分类错了,用户就找不到东西。
   *   逐行方向词用 **`onlyA` / `onlyB`**(不用 added / removed)——
   *   「多出来的」是相对哪一边,必须由**读数本身**说清,不能靠调用方记参数顺序。
   */
  function semanticDiff(aId, bId, opts) {
    const g = gate();
    if (!g.ok) return g;
    const A = readSlot(aId);
    if (!A.ok) return A;
    const B = readSlot(bId);
    if (!B.ok) return B;
    const cap = Math.max(10, Math.floor(Number(g.cfg.maxRows) || DEF.maxRows));
    const sa = A.slot.state || {}, sb = B.slot.state || {};
    const classes = {};
    CLASSES.forEach(function (cls) {
      const onlyA = [], onlyB = [], changed = [], noIdentity = [];
      let same = 0;
      FACES.filter(function (f) { return f.cls === cls; }).forEach(function (face) {
        const ra = rowsOf(sa, face), rb = rowsOf(sb, face);
        const ma = {}, mb = {};
        ra.forEach(function (r) { if (r.hasId) { if (ma[r.id]) stat.faults.dupId = (stat.faults.dupId || 0) + 1; ma[r.id] = r; } else noIdentity.push({ face: face.path, side: 'a' }); });
        rb.forEach(function (r) { if (r.hasId) { if (mb[r.id]) stat.faults.dupId = (stat.faults.dupId || 0) + 1; mb[r.id] = r; } else noIdentity.push({ face: face.path, side: 'b' }); });
        const ids = Object.keys(ma).concat(Object.keys(mb)).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort();
        ids.forEach(function (id) {
          const x = ma[id], y = mb[id];
          if (x && !y) { onlyA.push({ face: face.path, id: id }); return; }
          if (!x && y) { onlyB.push({ face: face.path, id: id }); return; }
          if (sig(x.row) === sig(y.row)) { same++; return; }
          changed.push({ face: face.path, id: id, fields: diffFields(x.row, y.row),
            aSig: sig(x.row), bSig: sig(y.row), replay: face.replay });
        });
      });
      classes[cls] = { label: CLS_LABEL[cls], onlyA: bound(onlyA, cap), onlyB: bound(onlyB, cap),
        changed: bound(changed, cap), same: same, noIdentity: bound(noIdentity, cap) };
    });
    stat.diffs++;
    return { ok: true, readOnly: true, a: { id: A.slot.id, name: A.slot.name, root: rootOf(A.slot) },
      b: { id: B.slot.id, name: B.slot.name, root: rootOf(B.slot) },
      sameRoot: !!rootOf(A.slot) && rootOf(A.slot) === rootOf(B.slot),
      classes: classes, classesOrder: CLASSES.slice(),
      identical: CLASSES.every(function (c) {
        return classes[c].onlyA.total === 0 && classes[c].onlyB.total === 0 && classes[c].changed.total === 0;
      }),
      cum: CLASSES.reduce(function (acc, c) { acc[c] = { onlyA: classes[c].onlyA.total, onlyB: classes[c].onlyB.total,
        changed: classes[c].changed.total, same: classes[c].same }; return acc; }, {}),
      note: '行身份取自 world-snapshot 的 IDENTITY_REFS(取不到时按声明表兜底并如实标注);'
        + '缺身份键的行落 noIdentity,不按位置配对。' };
  }/**
   * 三方比较(基点 + 两条分支)。计划原文的硬前提:**有共同基点才做**。
   *   三方 root 不全相同 ⇒ `no-basis`(并把三个 root 一起带回 —— 拒绝必须可操作:
   *   用户看到 no-basis 的第一件事就是确认自己挑的三个档是不是真的同源)。
   *   给「基点」的是一个**槽位 id**(分支点那一档),不是「世界现在的样子」——
   *   拿现场世界当基点等于把「比的时候世界已经往下走了」这件事藏起来。
   */
  function triDiff(baseId, aId, bId, opts) {
    const g = gate();
    if (!g.ok) return g;
    const BASE = readSlot(baseId);
    if (!BASE.ok) return { ok: false, reason: BASE.reason === 'missing' ? 'no-basis' : BASE.reason,
      detail: '基点槽位读不到', id: clean(baseId, 40) };
    const A = readSlot(aId);
    if (!A.ok) return A;
    const B = readSlot(bId);
    if (!B.ok) return B;
    const rB = rootOf(BASE.slot), rA = rootOf(A.slot), rB2 = rootOf(B.slot);
    if (!rB || rB !== rA || rB !== rB2) {
      noteFault('no-basis');
      return { ok: false, reason: 'no-basis', base: rB, a: rA, b: rB2,
        note: '三方 root 不全相同 ⇒ 不做三方比较(「A 与 B 分道」这句话在两个本来就不同源的世界之间没有意义)。' };
    }
    const sBase = BASE.slot.state || {}, sa = A.slot.state || {}, sb = B.slot.state || {};
    const cap = Math.max(10, Math.floor(Number(g.cfg.maxRows) || DEF.maxRows));
    /** 单类单面:把 base→x 的逐行走向收成一张 id → {state, row} 表。 */
    function traceOf(sBaseS, sXS, face) {
      const mBase = {}, mx = {};
      rowsOf(sBaseS, face).forEach(function (r) { if (r.hasId) mBase[r.id] = r; });
      rowsOf(sXS, face).forEach(function (r) { if (r.hasId) mx[r.id] = r; });
      const ids = Object.keys(mBase).concat(Object.keys(mx)).filter(function (v, i, arr) { return arr.indexOf(v) === i; });
      const out = {};
      ids.forEach(function (id) {
        const x = mBase[id], y = mx[id];
        if (!y) { out[id] = { st: 'gone', fields: [] }; return; }
        if (!x) { out[id] = { st: 'new', fields: [] }; return; }
        out[id] = (sig(x.row) === sig(y.row)) ? { st: 'same', fields: [] }
          : { st: 'touched', fields: diffFields(x.row, y.row) };
      });
      return out;
    }
    const classes = {};
    CLASSES.forEach(function (cls) {
      const aChanged = [], bChanged = [], bothSame = [], diverge = [], blockedNew = [];
      FACES.filter(function (f) { return f.cls === cls; }).forEach(function (face) {
        const ta = traceOf(sBase, sa, face), tb = traceOf(sBase, sb, face);
        const ids = Object.keys(ta).concat(Object.keys(tb)).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort();
        ids.forEach(function (id) {
          const x = ta[id] || { st: 'same', fields: [] }, y = tb[id] || { st: 'same', fields: [] };
          if (face.replay === 'ledger' && (x.st === 'new' || y.st === 'new')) { blockedNew.push({ face: face.path, id: id }); return; }
          const xm = x.st !== 'same', ym = y.st !== 'same';
          if (xm && !ym) { aChanged.push({ face: face.path, id: id, fields: x.fields }); return; }
          if (!xm && ym) { bChanged.push({ face: face.path, id: id, fields: y.fields }); return; }
          if (!xm && !ym) return;
          // 两边都相对基点动过:同向(逐字段相同)vs 分道(改了不同字段)
          const fd = x.fields.concat(y.fields).filter(function (v, i, arr) { return arr.indexOf(v) === i; }).sort();
          const sameFields = x.fields.length === y.fields.length && x.fields.every(function (f, i) { return f === y.fields[i]; });
          if (sameFields && x.st === y.st) bothSame.push({ face: face.path, id: id, fields: fd });
          else diverge.push({ face: face.path, id: id, aFields: x.fields, bFields: y.fields, aState: x.st, bState: y.st });
        });
      });
      classes[cls] = { label: CLS_LABEL[cls], aChanged: bound(aChanged, cap), bChanged: bound(bChanged, cap),
        bothSame: bound(bothSame, cap), diverge: bound(diverge, cap), historyBlocked: bound(blockedNew, cap) };
    });
    stat.tris++;
    return { ok: true, readOnly: true, base: { id: BASE.slot.id, name: BASE.slot.name, root: rB },
      a: { id: A.slot.id, name: A.slot.name }, b: { id: B.slot.id, name: B.slot.name },
      classes: classes, classesOrder: CLASSES.slice(),
      cum: CLASSES.reduce(function (acc, c) { acc[c] = { a: classes[c].aChanged.total, b: classes[c].bChanged.total,
        both: classes[c].bothSame.total, diverge: classes[c].diverge.total, history: classes[c].historyBlocked.total }; return acc; }, {}),
      note: '基点取自槽位 root(三方必须同 root);历史类新行的出现单列 historyBlocked,'
        + '不混进 diverge ——「一边多记了一笔过去」与「两边改得不一样」是两件事。' };
  }/**
   * 选择性移植(**只给计划,不落地**)。
   *   计划原文:「只移植**明确支持**的实体配置与改动,历史付款 / 揭密 / 已结算因果
   *   **默认不可重放**。基点缺失报不可比,原分支不改。」
   *   逐条判定 `allowed` / `blocked` + `reason`,**每一笔都带得走一条原因**:
   *     允许 —— `add`(src 有 dst 没有,且该行可重放)/ `update`(两边都有且不同,目标行未结算)
   *     拦下 —— `history`(ledger 类新行)/ `settled`(目标行已结算)/ `no-identity`
   *   `includeHistory` 打开时历史行放行,但**逐行标 `history:true`** —— 由调用方自负,
   *   本模块**不替它把这笔过去说成没过**。
   *   返回 `readOnly:true`;`dst` 一侧本模块**一个字段都不写**(它连 store 都不读,只读两个槽位)。
   */
  function transplant(srcId, dstId, opts) {
    const g = gate();
    if (!g.ok) return g;
    const o = opts || {};
    const S = readSlot(srcId);
    if (!S.ok) return S;
    const D = readSlot(dstId);
    if (!D.ok) return D;
    const cfg = settings();
    const allowHistory = (o.includeHistory === true) || (cfg.includeHistory === true);
    const want = Array.isArray(o.picks) && o.picks.length ? o.picks.map(function (p) { return { face: clean(p && p.face, 80), id: clean(p && p.id, 60) }; }) : null;
    const wantCls = (Array.isArray(o.classes) && o.classes.length) ? o.classes.slice() : CLASSES.slice();
    const ss = S.slot.state || {}, ds = D.slot.state || {};
    const plan = [];
    // 三栏各自成词:`unchanged` 是「两边逐字相同、没有可移植的内容」——
    //   它不是「可移植」(计数吹报)也不是「被挡住」(把无事发生说成被规则拦下)。
    let allowed = 0, blocked = 0, unchanged = 0;
    FACES.forEach(function (face) {
      if (wantCls.indexOf(face.cls) < 0) return;
      const ms = {}, md = {};
      rowsOf(ss, face).forEach(function (r) { ms[r.id] = r; });
      rowsOf(ds, face).forEach(function (r) { md[r.id] = r; });
      Object.keys(ms).sort().forEach(function (id) {
        if (want && !want.some(function (p) { return p.face === face.path && p.id === id; })) return;
        const srow = ms[id].row, drow = md[id] ? md[id].row : null;
        const hitId = ms[id].hasId;
        // **顺序是承重的**:先判「这一行要不要动」,再判「动它合不合规」。
        //   反过来的话,两边逐字相同的行会因为「它是账本类」被拦成 blocked ——
        //   「本来就没变化」被说成「被规则挡住」(探针实测到 event.st1 这种形态)。
        let kind = '', ok = false, reason = '';
        if (!hitId) { reason = 'no-identity'; }
        else if (drow && sig(srow) === sig(drow)) { kind = 'unchanged'; ok = true; reason = 'no-change'; }
        else if (drow) { kind = 'update'; ok = true; reason = ''; }
        else { kind = 'add'; ok = true; reason = ''; }
        if (ok && reason === 'no-change') {
          unchanged++;
          plan.push({ face: face.path, cls: face.cls, id: id, kind: kind, allowed: false, reason: 'no-change', history: false, fields: [] });
          return;
        }
        const settled = isSettledRow(srow) || !!(drow && isSettledRow(drow));
        const history = (face.replay === 'ledger') || settled;
        if (ok && history && !allowHistory) { ok = false; reason = 'history' + (settled ? '/settled' : ''); }
        if (ok) {
          allowed++;
          plan.push({ face: face.path, cls: face.cls, id: id, kind: kind, allowed: true, reason: '',
            history: !!history, fields: drow ? diffFields(drow, srow) : Object.keys(isObj(srow) ? srow : {}).slice(0, 12),
            dstSig: drow ? sig(drow) : null, srcSig: sig(srow) });
        } else {
          blocked++;
          plan.push({ face: face.path, cls: face.cls, id: id, kind: kind || 'unknown', allowed: false, reason: reason,
            history: !!history, fields: [] });
        }
      });
    });
    stat.transplants++;
    if (blocked) noteFault('blocked');
    return { ok: true, readOnly: true,
      from: { id: S.slot.id, name: S.slot.name, root: rootOf(S.slot) },
      to: { id: D.slot.id, name: D.slot.name, root: rootOf(D.slot) },
      sameRoot: !!rootOf(S.slot) && rootOf(S.slot) === rootOf(D.slot),
      includeHistory: !!allowHistory, classes: wantCls,
      plan: bound(plan, Math.max(10, Math.floor(Number(cfg.maxRows) || DEF.maxRows))),
      allowed: allowed, blocked: blocked, unchanged: unchanged,
      note: '只给计划、不落地:本模块没有任何一条写路径(不改 dst、不改 src、不改当前世界)。'
        + '历史项(账本类 + 已结算行)默认 blocked,includeHistory 打开后逐行标 history:true,由调用方自负。'
        + (allowHistory ? '' : '「原分支不改」的实现方式就是「这里没有写口」。') };
  }
  /** 面清单(面板与诊断的**单一真源**:展示的类/面/重放档一律现取,不在 UI 里另抄一份)。 */
  function catalog() {
    return { ok: true, classes: CLASSES.slice(), labels: Object.assign({}, CLS_LABEL),
      faces: FACES.map(function (f) { return { cls: f.cls, path: f.path, at: f.at || '', replay: f.replay,
        idFields: idSpec(f).fields.slice() }; }),
      settled: { keys: SETTLED_KEYS.slice(), status: SETTLED_STATUS.slice() },
      caps: { maxRows: settings().maxRows },
      idSource: (WA.worldSnapshot && Array.isArray(WA.worldSnapshot.IDENTITY_REFS)) ? 'identity-refs' : 'declared' };
  }
  function stat_() {
    const cfg = settings();
    return { enabled: !!cfg.enabled, includeHistory: !!cfg.includeHistory, maxRows: cfg.maxRows,
      diffs: stat.diffs, tris: stat.tris, transplants: stat.transplants,
      faces: FACES.length, classes: CLASSES.length,
      faults: Object.assign({}, stat.faults), lastReason: stat.lastReason };
  }
  function reset() { stat.diffs = 0; stat.tris = 0; stat.transplants = 0; stat.lastReason = ''; stat.faults = {}; return { ok: true }; }
  WA.branchDiff = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    semanticDiff: semanticDiff, triDiff: triDiff, transplant: transplant,
    catalog: catalog, stat: stat_, reset: reset,
    // 常量面(面板/诊断/专锁的单一真源:改一处即全体跟上,不抄第二份)
    CLASSES: CLASSES.slice(), FACES: FACES.slice(), CLS_LABEL: Object.assign({}, CLS_LABEL)
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/branch-diff.js', { kind: 'engine', ver: '2.224.0' });
})();