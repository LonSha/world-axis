/**
 * WorldAxis actors/registry.js — NPC注册与档案（SoulLink JSON契约 + 世界背面认知边界）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_npc_registry_v1';
  const mainWin = WA.mainWin || window;

  // -- v2.51.0 面B：人格机制（D1-D5）x 关系量值 --------------------------
  // 缝合来源：万相锚典 V6.4（五骰人格机制 / 亲密度语义区间），压缩口径。
  // 纪律：① 现实性格与人格机制（persona）严格分层，禁止互推；
  //      ② 骰面一经写入即锁定，重骰拒收（演化须显式且一次只改一个维度）；
  //      ③ 缺失保持未知（不补写、不猜）；④ 关系量值单向、单次变化受 20 硬边界钳制。
  const PERSONA_KEYS = ['d1', 'd2', 'd3', 'd4', 'd5'];
  const SLOT_ORDER = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];
  // -- v2.51.0 面C：稳定随机槽（A-L）--------------------------------------
  // 槽位是人格的**稳定锚**：同一次运行内同一角色始终落在同一槽（不因调用顺序漂移），
  //   槽位顺序即读取优先级。**不自动回收**：槽位耗尽时显式报告，由外部决定
  //   （减 NPC 生成速率 / 显式 slotRelease 旧角色）——引擎不偷偷压缩语义冒充真随机。
  //   槽位不参与决策流抽数（与 rand 的通道隔离纪律同构），仅作为身份标签。
  let __slots = {};   // slot -> name（内存态；稳定随机本身不进存档）
  function slotAssign(name) {
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, reason: 'missing-name' };
    for (let i = 0; i < SLOT_ORDER.length; i++) {
      if (__slots[SLOT_ORDER[i]] === nm) return { ok: true, slot: SLOT_ORDER[i], reused: true };
    }
    for (let i = 0; i < SLOT_ORDER.length; i++) {
      if (!__slots[SLOT_ORDER[i]]) { __slots[SLOT_ORDER[i]] = nm; return { ok: true, slot: SLOT_ORDER[i], reused: false }; }
    }
    return { ok: false, reason: 'slots-exhausted', capacity: SLOT_ORDER.length };
  }
  function slotRelease(name) {
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, reason: 'missing-name' };
    let freed = '';
    SLOT_ORDER.forEach(function (x) { if (__slots[x] === nm) { delete __slots[x]; freed = x; } });
    return freed ? { ok: true, slot: freed } : { ok: false, reason: 'not-assigned' };
  }
  // -- v2.62.0：稳定人物 ID（路线图前置收口①）-------------------------------
  // 缺陷：A–L 槽表此前既当「身份」又当「容量」用——它是**模块内存态**（刷新即丢）、
  //   按姓名分配，且只容 12 人。于是长期状态（目标/承诺/日程/认知/资源）若绑在槽位上：
  //     · 刷新一次全部认不出人（槽是内存态，存档里的状态却还在）；
  //     · 第 13 个角色**根本没有位置**，而「没有槽位」被当成「无法身份化」。
  //   本次把两件事彻底分开：
  //     · **人物 ID**（本区）：按**聊天分域持久化**，跨刷新/跨切页稳定；人数不设 12 上限。
  //     · **活动槽**（上一区）：只承担「本轮计算 / 提示组织」用途——12 是它的合法边界，
  //       不是人物的数量边界。slotStat().purpose 明写这一点，免得下游再把两者混用。
  //   迁移口径：只为**已经出现过的姓名**登记 id，不凭空生成履历或关系
  //   （登记的是身份，不是经历）。
  const ID_KEY = 'worldaxis_registry_ids_v1';
  const __REG_IDS = { key: ID_KEY, def: {}, module: 'registry' };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG_IDS]);
  function idTable() { try { return WA.settingsBus.read(__REG_IDS) || {}; } catch (e) { return {}; } }
  function idScope() {
    const all = idTable();
    const cid = chatId();
    if (!all[cid] || typeof all[cid] !== 'object' || Array.isArray(all[cid])) all[cid] = {};
    return { all: all, cid: cid, mine: all[cid] };
  }
  /**
   * 稳定人物 ID：同一姓名在同一聊天内**始终**同一 id（刷新、切页、重载都不变），
   *   且人数不受活动槽 12 个上限约束。
   *   序号取「本域已有 id 的最大值 + 1」（不读全局计数）——这样切聊天时序号不会漂移，
   *   同一聊天内删掉某人再新增也不会把旧 id 复用给别人。
   */
  function personId(name) {
    const nm = String(name || '').trim();
    if (!nm) return '';
    const sc = idScope();
    if (sc.mine[nm]) return sc.mine[nm];
    let max = 0;
    Object.keys(sc.mine).forEach(function (k) {
      const n = parseInt(String(sc.mine[k]).replace(/^pid_/, ''), 10);
      if (isFinite(n) && n > max) max = n;
    });
    const id = 'pid_' + (max + 1);
    sc.mine[nm] = id;
    try { WA.settingsBus.save(__REG_IDS, sc.all); } catch (e) { /* 落盘失败不影响本次分配 */ }
    return id;
  }
  /** 稳定 ID 视图（诊断/面板消费）——**同时**报出槽位占用，使「槽耗尽 ≠ ID 耗尽」一眼可分 */
  function idStat() {
    const sc = idScope();
    const names = Object.keys(sc.mine);
    const slots = (function () {
      const owners = SLOT_ORDER.map(function (x) { return __slots[x] || ''; }).filter(Boolean);
      return { capacity: SLOT_ORDER.length, used: owners.length };
    })();
    // 状态侧对账：people 容器里有状态、但从未登记稳定 id 的人数（以及反向）。
    //   这正是「长期状态与身份脱节」的可观测出口——>0 说明有人有履历却没有编号。
    let worldKeys = {}, driftState = [], driftId = [];
    try {
      const s = WA.store && WA.store.get ? (WA.store.get() || {}) : {};
      const withState = Object.keys(s.people || {}).filter(function (k) {
        const p = s.people[k];
        return p && (p.life || p.knowledge || (p.profile && (p.profile.relations || p.profile.personality)));
      });
      worldKeys = withState.reduce(function (acc, k) {
        const nm = String(k).replace(/^p_/, '');
        acc[k] = sc.mine[nm] || '';
        if (!sc.mine[nm]) driftState.push(k);
        return acc;
      }, {});
      driftId = names.filter(function (nm) { return !s.people || !s.people[worldKey(nm)]; });
    } catch (e) {}
    return {
      chatId: sc.cid, bound: names.length, ids: Object.assign({}, sc.mine),
      slotCapacity: slots.capacity, slotUsed: slots.used,
      slotsExhausted: slots.used >= slots.capacity,
      // 「有身份但没分到本轮活动槽」的人数——>0 是**正常**的（活动槽只为本轮服务），
      //   而此前这种局面在界面上不存在，只能被读成「人物丢了」。
      beyondSlots: Math.max(0, names.length - slots.used),
      // v2.62.0: 身份 ↔ 长期状态落点（people 容器键）的对账
      worldKeys: worldKeys,
      stateWithoutId: driftState,   // 有状态、无稳定 id
      idWithoutState: driftId,      // 有稳定 id、无状态容器
      drifted: driftState.length > 0,
      persisted: true
    };
  }
  /** 本轮进程内「按来源计的新建次数」（内存态：诊断「这条链真的在用唯一写者吗」） */
  const __created = {};
  /**
   * v2.86.0 A3（事实唯一写者）：**people 条目的唯一创建点**。
   *
   * 修前：五个模块各自内联 `draft.people[id] = draft.people[id] || { id, name, knowledge: {} }`
   *   （life/intel 各若干处、backstage 两处、本文件一处）。五种写法、四处分散，
   *   于是「这个人是怎么出现的」在状态里**没有任何痕迹**——写一条承诺就凭空多一个人，
   *   还占掉 cap 48 的名额。
   *
   * 现口径：创建只此一处，每次**新建**都打来源标签（createdVia / createdAt）。
   *   已存在的条目原样返回，**绝不覆盖**既有字段——本函数只解决「有没有」，
   *   不解决「内容是什么」（那是 setProfileSafe 的事）。
   */
  function ensurePerson(draft, id, name, via) {
    if (!draft || typeof draft !== 'object') return { ok: false, reason: 'bad-draft' };
    const key = String(id == null ? '' : id);
    if (!key || key === 'p_') return { ok: false, reason: 'missing-name' };
    if (!draft.people || typeof draft.people !== 'object') draft.people = {};
    const row = draft.people[key];
    if (row && typeof row === 'object') return { ok: true, isNew: false, row: row };
    const nm = String(name == null ? key.replace(/^p_/, '') : name).trim().slice(0, 60);
    const p = { id: key, name: nm, knowledge: {} };
    p.createdVia = String(via || 'unknown').slice(0, 40);
    p.createdAt = clockNow('registry');
    draft.people[key] = p;
    __created[p.createdVia] = (__created[p.createdVia] || 0) + 1;
    // v2.86.0 A3：返回值用 isNew、不写 reason: 'created' —— 拒收码门禁按字面量扫
    //   `reason: 'x'`（不辨语义），在返回值里带上一个叫 created 的 reason 会被当成新拒收码。
    //   返回值本就是内部契约，键名改动零外部影响。
    return { ok: true, isNew: true, row: p };
  }
  /**
   * v2.86.0 A3 观测出口：人物条目来源分布 + **未标注行**。
   *   unlabeledCount > 0 只有两种可能：旧存档（本版之前建的条目），
   *   或有人又绕过了唯一写者。两种都需要被看见——这就是本出口存在的理由。
   */
  function personOriginStat() {
    let s = {};
    try { s = (WA.store && WA.store.get ? (WA.store.get() || {}) : {}); } catch (e) { s = {}; }
    const rows = Object.keys(s.people || {}).filter(function (k) {
      const p = s.people[k];
      return p && typeof p === 'object';
    });
    const unlabeled = rows.filter(function (k) { return !s.people[k].createdVia; });
    const byVia = {};
    rows.forEach(function (k) {
      const v = s.people[k].createdVia || '(未标注)';
      byVia[v] = (byVia[v] || 0) + 1;
    });
    return {
      rows: rows.length, byVia: byVia,
      unlabeledCount: unlabeled.length, unlabeled: unlabeled.slice(0, 12),
      createdThisRun: Object.assign({}, __created)
    };
  }
  function idClear(name) {
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, reason: 'missing-name' };
    const sc = idScope();
    if (!sc.mine[nm]) return { ok: false, reason: 'not-bound' };
    const old = sc.mine[nm];
    delete sc.mine[nm];
    try { WA.settingsBus.save(__REG_IDS, sc.all); } catch (e) {}
    return { ok: true, name: nm, id: old };
  }
  // -- v2.97.0 O9：别名表与追溯链（v2.91.0 O4 未覆盖项「id 重命名后旧引用可追溯」）------
  //   它治的病：`danglingRefs` 只答「这个引用指向的名字已经不在册了」，答不出**它原来是谁**。
  //   于是「张三改叫三哥」之后，所有指向「张三」的关系行 / 量值行 / 承诺行一律变成悬空——
  //   调用方被迫在「清掉旧账」与「任其悬空」之间二选一，而两个选项都在替作者做决定。
  //   别名表是第三个选项：**名字可以有历史**。
  //
  //   口径（全是否定式，这五条正是本段存在的全部理由）：
  //     ① **只登记、不改写**：旧名不删、不重定向任何既有行——关系行照旧写着旧名，
  //        「改过名」从此不再等于「断过链」。
  //     ② **只增不删**：历史名一经登记永久可解析（与 rumor 的 intact 累积不可恢复同源）。
  //     ③ **一个旧名只有一个主人**：旧名若已属于别人，报 name-taken。否则同一行会解析出
  //        两种身份，追溯链当场失去意义。
  //     ④ **链可有深度，但必须有边界**：登记时**当场**拒绝把链建过 ALIAS_MAX_HOPS
  //        （too-deep）——往表里放一条永远解析不出来的登记，等于在账上打个死结；
  //        解析侧另有一道同样的闸，管旧存档与外部导入的数据。
  //     ⑤ **查不到就说查不到**：对完全不在册的名字报 unknown-name——
  //        给它编一个规范名，等于用别名表替世界造了一个人。
  const ALIAS_KEY = 'worldaxis_registry_alias_v1';
  const __REG_ALIAS = { key: ALIAS_KEY, def: {}, module: 'registry' };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG_ALIAS]);
  const ALIAS_MAX_HOPS = 8;
  function aliasTable() { try { return WA.settingsBus.read(__REG_ALIAS) || {}; } catch (e) { return {}; } }
  /** 按聊天分域（与身份表同规格：切聊天不串味） */
  function aliasScope() {
    const all = aliasTable();
    const cid = chatId();
    if (!all[cid] || typeof all[cid] !== 'object' || Array.isArray(all[cid])) all[cid] = {};
    return { all: all, cid: cid, mine: all[cid] };
  }
  /**
   * 反向索引：历史名 → 它的直接主人（规范名）。
   *   **单一构造点**：追溯、结环检查、在册判定三处共用一份，免得三处各写一套配对逻辑
   *   （「同一份真源、三种实现」是本仓库反复治理过的病）。
   */
  function aliasRev(sc) {
    const s = sc || aliasScope();
    const rev = {};
    Object.keys(s.mine).forEach(function (canon) {
      const arr = Array.isArray(s.mine[canon]) ? s.mine[canon] : [];
      arr.forEach(function (row) {
        const old = String((row && row.was) || '').trim();
        if (old && !rev[old]) rev[old] = canon;
      });
    });
    return rev;
  }
  /**
   * 逐跳回溯到规范名。**不判在册**——它只回答「往上的链尽头是谁」（在册判定在 aliasOf 里）。
   *   链走不通时报**停在哪一跳**，而不是返回一个半截答案。
   */
  function canonicalOf(name) {
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, reason: 'missing-name' };
    const rev = aliasRev();
    let cur = nm, hops = 0;
    const seen = {};
    seen[nm] = true;
    for (;;) {
      const up = rev[cur];
      if (!up) return { ok: true, canonical: cur, hops: hops };
      if (seen[up]) return { ok: false, reason: 'alias-cycle', at: cur, next: up, hops: hops };
      if (hops + 1 > ALIAS_MAX_HOPS) return { ok: false, reason: 'too-deep', at: cur, hops: hops, cap: ALIAS_MAX_HOPS };
      seen[up] = true; cur = up; hops++;
    }
  }
  /** 名字是否「在册」：有稳定 id / 自己名下有历史名 / 自己是别人的历史名，三者任一即算 */
  function aliasKnown(nm, scI, scA, rev) {
    const s1 = scI || idScope(), s2 = scA || aliasScope(), r = rev || aliasRev(s2);
    if (s1.mine[nm]) return { known: true, how: 'id' };
    if (Array.isArray(s2.mine[nm]) && s2.mine[nm].length > 0) return { known: true, how: 'aliases' };
    if (r[nm]) return { known: true, how: 'alias-of:' + r[nm] };
    return { known: false, how: '' };
  }
  /**
   * 登记一条别名：`name` 是**现在的名字**，`opts.was` 是它的旧名。
   *   幂等：同一对重复登记返回 reused:true（与 slotAssign 同规格），不报错也不重复追加。
   *   规范名须**在册**（有 id、或本身就是某人的旧名）——给一个不存在的人登记历史名，
   *   等于凭空造一个身份；而给「本身就是旧名」的名字再挂一个更早的名字，正是链式登记。
   */
  function bindAlias(name, opts) {
    const o = opts || {};
    const canon = String(name || '').trim();
    const was = String(o.was === undefined || o.was === null ? '' : o.was).trim();
    if (!canon || !was) return { ok: false, reason: 'missing-fields' };
    if (canon === was) return { ok: false, reason: 'alias-cycle', at: canon, next: was, self: true };
    const scI = idScope();
    const scA = aliasScope();
    const rev = aliasRev(scA);
    const rec = aliasKnown(canon, scI, scA, rev);
    if (!rec.known) return { ok: false, reason: 'not-bound', name: canon };
    if (rev[was] && rev[was] !== canon) return { ok: false, reason: 'name-taken', was: was, owner: rev[was] };
    const arr = Array.isArray(scA.mine[canon]) ? scA.mine[canon] : (scA.mine[canon] = []);
    for (let i = 0; i < arr.length; i++) {
      if (String((arr[i] && arr[i].was) || '') === was) {
        return { ok: true, reused: true, canonical: canon, aliases: arr.map(function (x) { return x.was; }) };
      }
    }
    // 结环检查：新边是 was → canon。若从 canon 沿既有边能走回 was，这条登记就把链焊成了环。
    //   自指（canon === was）已在上面拦下；这里管的是「绕一圈回来」。
    const seenC = {};
    let probe = canon, guard = 0;
    seenC[probe] = true;
    for (;;) {
      const nx = rev[probe];
      if (!nx) break;
      if (nx === was) return { ok: false, reason: 'alias-cycle', at: canon, next: was, via: probe };
      if (seenC[nx] || guard++ > ALIAS_MAX_HOPS + 2) break;
      seenC[nx] = true; probe = nx;
    }
    // 深度闸：加上这一边之后，was 的链长 = 1 + canon 的链长。超上限当场拒绝。
    const upCanon = canonicalOf(canon);
    if (!upCanon.ok) return upCanon;
    const newDepth = upCanon.hops + 1;
    if (newDepth > ALIAS_MAX_HOPS) return { ok: false, reason: 'too-deep', at: was, hops: newDepth - 1, cap: ALIAS_MAX_HOPS };
    arr.push({ was: was, at: clockNow('registry.alias'),
      note: String(o.note === undefined || o.note === null ? '' : o.note).slice(0, 60) });
    try { WA.settingsBus.save(__REG_ALIAS, scA.all); } catch (e) { /* 落盘失败不影响本次登记的内存视图 */ }
    return { ok: true, reused: false, canonical: canon,
      aliases: arr.map(function (x) { return x.was; }), depth: newDepth };
  }
  /**
   * 名字 → 身份（别名面，只读）。三位一体一律给**规范名**那一份，
   *   并同时报出「这个名字是历史名吗、它的规范名是谁、它名下还有哪些历史名」。
   *   与 identityOf 的分工：identityOf 按**当前名**给身份（写路径用），本口额外回答历史。
   */
  function aliasOf(name) {
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, reason: 'missing-name' };
    const scI = idScope(), scA = aliasScope(), rev = aliasRev(scA);
    const rec = aliasKnown(nm, scI, scA, rev);
    if (!rec.known) return { ok: false, reason: 'unknown-name', name: nm };
    const up = canonicalOf(nm);
    if (!up.ok) return { ok: false, reason: up.reason, at: up.at, next: up.next, hops: up.hops, cap: up.cap };
    const canon = up.canonical;
    const arr = Array.isArray(scA.mine[canon]) ? scA.mine[canon] : [];
    return {
      ok: true, name: nm, canonical: canon,
      // 自己就是历史名，还是「当前名 + 一串历史名」——这一位决定调用方该认哪个身份
      isAlias: canon !== nm,
      hops: up.hops,
      aliases: arr.map(function (x) { return x.was; }),
      personId: scI.mine[canon] || '',
      worldKey: worldKey(canon)
    };
  }
  /**
   * 追溯链（只读）：名字 → 规范名的**完整路径**，逐跳带时间与备注。
   *   与 aliasOf 的分工：aliasOf 答「尽头是谁」，traceOf 答「它是怎么走到那里的」——
   *   中间每一跳都是作者做过的一次决定，抹掉就等于把「为什么改过名」从账上删掉。
   */
  function traceOf(name) {
    const nm = String(name || '').trim();
    if (!nm) return { ok: false, reason: 'missing-name' };
    const scI = idScope(), scA = aliasScope(), rev = aliasRev(scA);
    const rec = aliasKnown(nm, scI, scA, rev);
    if (!rec.known) return { ok: false, reason: 'unknown-name', name: nm };
    const steps = [];
    let cur = nm, hops = 0;
    const seen = {};
    seen[nm] = true;
    for (;;) {
      const up = rev[cur];
      if (!up) break;
      if (seen[up]) return { ok: false, reason: 'alias-cycle', at: cur, next: up, steps: steps, hops: hops };
      if (hops + 1 > ALIAS_MAX_HOPS) return { ok: false, reason: 'too-deep', at: cur, hops: hops, cap: ALIAS_MAX_HOPS, steps: steps };
      // 这一跳的登记行（时间与备注）：从**主人名下的表**里取，不从反向索引里猜
      const rows = Array.isArray(scA.mine[up]) ? scA.mine[up] : [];
      const row = rows.filter(function (x) { return String((x && x.was) || '') === cur; })[0] || {};
      steps.push({ at: Number(row.at) || 0, from: cur, to: up, note: String(row.note || '') });
      seen[up] = true; cur = up; hops++;
    }
    return { ok: true, name: nm, canonical: cur, hops: hops, steps: steps };
  }
  /**
   * 别名表只读视图（诊断 / 面板消费）：成对总数、跳数上限、**最深链**。
   *   maxDepth 是这张表最该被看见的数：它说明世界里的名字被改过几手。
   */
  function aliasStat() {
    const s = aliasScope(), rev = aliasRev(s);
    const rows = [];
    Object.keys(s.mine).forEach(function (canon) {
      const arr = Array.isArray(s.mine[canon]) ? s.mine[canon] : [];
      arr.forEach(function (x) {
        rows.push({ canonical: canon, was: String((x && x.was) || ''), at: Number(x && x.at) || 0 });
      });
    });
    const depthOf = function (nm) { const u = canonicalOf(nm); return u.ok ? u.hops : -1; };
    let maxDepth = 0;
    rows.forEach(function (r) { const d = depthOf(r.was); if (d > maxDepth) maxDepth = d; });
    return { chatId: s.cid, pairs: rows.length, owners: Object.keys(s.mine).length,
      names: Object.keys(rev).length, maxDepth: maxDepth, maxHops: ALIAS_MAX_HOPS,
      rows: rows.slice(0, 20), persisted: true };
  }
  /**
   * 世界状态键：long-term 状态（目标/承诺/日程/认知）在 store 里的**实际落点**是
   *   `people['p_' + 姓名]`。它与 personId() 是**两件事**，必须显式桥接而不是各自为政：
   *     · worldKey  = 存档里的容器键（人一旦被存档就固定，是本引擎的持久身份）；
   *     · personId  = 稳定编号（跨重命名/跨引用统一的短 id，供外部引用与诊断）。
   *   历史上二者同名不同义（life.js 内部也有一个叫 personId 的函数，返回的正是 worldKey）
   *   是**真实风险**：下一个调用者会以为它们可以互换。故此处提供唯一桥接口，
   *   并让 idStat() 报出两侧对应关系，使「长期状态绑的到底是哪个键」可被机器核对。
   */
  function worldKey(name) {
    const nm = String(name || '').trim();
    return nm ? ('p_' + nm) : '';
  }
  /** 姓名 → { name, personId, worldKey } 三位一体（下游只认这一个口，不再各拼各的） */
  function identityOf(name) {
    const nm = String(name || '').trim();
    if (!nm) return null;
    return { name: nm, personId: personId(nm), worldKey: worldKey(nm) };
  }

  const REL_NUM_FIELDS = ['intimacy', 'hostility', 'trust', 'vigilance', 'attachment'];
  const REL_STR_FIELDS = ['boundary_status', 'relationship_aftereffect'];
  const REL_DELTA_CAP = 20;   // 单次事件最终变化绝对不超过 20（硬边界）
  const REL_BANDS = [[0, 10, '陌生人'], [11, 25, '相识'], [26, 40, '普通朋友'], [41, 55, '信任者'],
    [56, 70, '好友'], [71, 85, '至交'], [86, 95, '挚爱'], [96, 100, '灵魂羁绊']];
  /** 骰面合法性：1-12 整数；非法返回 null（不补写、不猜） */
  function clampDice(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Math.floor(Number(v));
    if (!isFinite(n) || n < 1 || n > 12) return null;
    return n;
  }
  /** 槽位字母（A-L）；非法返回 null */
  function slotOf(v) {
    const c = String(v === null || v === undefined ? '' : v).trim().toUpperCase().charAt(0);
    return SLOT_ORDER.indexOf(c) >= 0 ? c : null;
  }
  /** 关系量值阶梯名（语义区间与 rules.relation 同源） */
  function relBand(v) {
    const n = Number(v);
    if (!isFinite(n)) return '';
    for (let i = 0; i < REL_BANDS.length; i++) {
      if (n >= REL_BANDS[i][0] && n <= REL_BANDS[i][1]) return REL_BANDS[i][2];
    }
    return '';
  }
  /** 关系量值单步钳制：以 prev 为基准，|delta|<=20，结果截断 0-100；非法返回 null */
  function clampRelStep(prev, next) {
    const n = Number(next);
    if (!isFinite(n)) return null;
    const p = isFinite(Number(prev)) ? Math.max(0, Math.min(100, Number(prev))) : 0;
    const d = Math.max(-REL_DELTA_CAP, Math.min(REL_DELTA_CAP, n - p));
    return Math.round(Math.max(0, Math.min(100, p + d)));
  }

  const __REG = { key: LS_KEY, def: {}, module: 'registry' };
  // v2.3.0: 读路径统一走 settingsBus（写路径早已迁移）——人物档案损坏此前静默清空，
  //   用户看到的是「所有NPC凭空消失」而不是「存档损坏已隔离」
  function loadAll() { return WA.settingsBus.read(__REG); }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function saveAll(m) { WA.settingsBus.save(__REG, m); }
  function chatId() { try { const c = WA.mainWin.SillyTavern.getContext(); return c.chatId || 'default'; } catch (e) { return 'default'; } }

  WA.registry = {
    list() { const all = loadAll(); return all[chatId()] || []; },
    register(name) {
      if (!name) return false;
      const all = loadAll(); const cid = chatId();
      all[cid] = all[cid] || [];
      if (!all[cid].includes(name)) { all[cid].push(name); saveAll(all); WA.emit('registry:changed'); return true; }
      return false;
    },
    unregister(name) {
      const all = loadAll(); const cid = chatId();
      all[cid] = (all[cid] || []).filter(n => n !== name); saveAll(all);
      slotRelease(name);   // v2.51.0 面C：人物退出注册表即释放其稳定槽
      WA.emit('registry:changed');
    },
    /** 档案存取（SoulLink结构：fields + personality/worldview/family/relationships/memory分节） */
    /**
     * v2.79.0（第十三面 · 读面隔离）：此处此前**直接返回** `store.people['p_'+name].profile` ——
     *   返回值与持久态是同一个对象。消费方（独白取性格锚点、观测切片、关系面只读视图、
     *   面板档案编辑器、巡视统计）只要顺手写一下返回值（`p.personality.push(x)`、
     *   `p.persona.locked = true`），就绕过了 setProfileSafe 的全部准入：分节剪裁、
     *   20 条关系硬边界、0-100 截断、容量登记表。症状是「写路径的校验只对走写路径的人有效」。
     *   现在按元素浅拷一层（口径与 editor-events / editor-faction / rivalry.read 一致）：
     *   切断「改返回值即改持久态」；不再往下拷 —— 读面成本不该随嵌套膨胀（深层请走写路径）。
     */
    getProfile(name) {
      // v2.79.0（第十三面续 · 输入边界）：名字必须先真的是字符串。
      //   此前非字符串名走 `'p_' + name` 的隐式字符串化 —— 要么在 ToPrimitive 上抛
      //   （对象 / 带敌意 toString），要么查出一个**根本不存在的键**（null → 'p_null'）
      //   并返回一份看着正常的空档案，把「调用方传错了」伪装成「这个人没档案」。
      if (typeof name !== 'string' || !name.trim()) {
        return { fields: { name: '' }, personality: [], worldview: [], family: [], relationships: [], memory: [], relations: [], persona: null };
      }
      const s = WA.store.get();
      const p = s.people['p_' + name];
      const src = (p && p.profile) || { fields: { name }, personality: [], worldview: [], family: [], relationships: [], memory: [], relations: [], persona: null };
      const out = {};
      Object.keys(src).forEach(function (k) {
        const v = src[k];
        if (Array.isArray(v)) {
          out[k] = v.map(function (x) {
            if (!x || typeof x !== 'object') return x;
            const c = {};
            Object.keys(x).forEach(function (f) { c[f] = x[f]; });
            return c;
          });
          return;
        }
        if (v && typeof v === 'object') {
          const c = {};
          Object.keys(v).forEach(function (f) { c[f] = v[f]; });
          out[k] = c;
          return;
        }
        out[k] = v;
      });
      return out;
    },
    /**
     * v2.11.0（面C · 死面治理）: 此处原有 `setProfile(name, profile)` ——**裸整份覆盖、无准入**。
     *   它自 v2.2.0 起就已被 `setProfileSafe` 取代（唯一写入路径：面板档案编辑器 → Safe），
     *   全库**零调用点**。留着它的实际风险不是「多一个 API」，而是**下一个调用者会挑错的那个**：
     *   误传 `{personality:'字符串'}` 会写坏结构，而 getProfile 的消费端（独白/观测的性格锚点）
     *   拿到非数组后**静默降级**——这正是 v2.2.0 引入 Safe 版要治的缺陷。本版如实收回该导出，
     *   保留 name/profile 两参数语义的**带准入替代**即 setProfileSafe（本文件内已说明映射关系）。
     *   私有实现随之删除：没有调用者的写入路径 = 下一处「声明面空转」。
     */
    /**
     * v2.2.0: 安全档案写入（准入 + 按节合并 + 剪裁取自容量登记表）。
     *   缺陷背景：裸 setProfile 整份覆盖且无准入——误传 {personality:'字符串'} 会写坏结构，
     *   让 getProfile 的消费端（独白/观测的性格锚点）拿到非数组而静默降级。
     *   sections 各节接受：数组 | 换行分隔字符串 | 省略（该节不动）；
     *   relationships 条目：{target, relation, dynamic} 或 'target|relation|dynamic' 字符串。
     *   opts.replace === true → 整节替换（默认追加合并，去重同文本）。
     *   返回 {ok, name, reason?, added:{节:条数}, rejected:[...], total}
     */
    setProfileSafe(name, sections, opts) {
      const o = opts || {};
      if (typeof name !== 'string' || !name.trim()) return { ok: false, reason: 'missing-name' };
      const nm = name.trim();
      if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return { ok: false, reason: 'not-object' };
      // 剪裁上限取自 store 容量登记表（单一真源）——写死常量会与登记值漂移，被 sizeAudit 判 drifted
      const capOf = function (sec) {
        try {
          const meta = WA.store && WA.store.capsFor ? WA.store.capsFor('people.p_x.profile.' + sec) : null;
          if (meta && typeof meta.cap === 'number' && meta.cap > 0) return meta.cap;
        } catch (e) {}
        return null;
      };
      const TEXT_SECS = ['personality', 'worldview', 'family', 'memory'];
      const out = { ok: true, name: nm, added: {}, rejected: [], total: 0 };
      const toTexts = function (v) {
        if (typeof v === 'string') return v.split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
        if (Array.isArray(v)) return v.map(function (x) { return typeof x === 'string' ? x.trim() : (x && x.text ? String(x.text).trim() : ''); }).filter(Boolean);
        return null;
      };
      const toRels = function (v) {
        if (typeof v === 'string') v = v.split('\n');
        if (!Array.isArray(v)) return null;
        const okRows = [];
        v.forEach(function (x) {
          let t = null, r = '', dy = '';
          if (x && typeof x === 'object') { t = x.target; r = x.relation || ''; dy = x.dynamic || ''; }
          else if (typeof x === 'string' && x.trim()) { const parts = x.split('|').map(function (y) { return y.trim(); }); t = parts[0]; r = parts[1] || ''; dy = parts[2] || ''; }
          if (!t) { out.rejected.push({ section: 'relationships', reason: 'missing-target' }); return; }
          okRows.push({ target: String(t).slice(0, 60), relation: String(r).slice(0, 60), dynamic: String(dy).slice(0, 160) });
        });
        return okRows;
      };
      const now = clockNow('registry');
      let changed = false;
      // v2.51.0 修正：persona 的「本次是否被给定」必须用显式标记——
      //   先前用 `'persona' in next` 判定，而 next 里恒有这个键（初值 null），
      //   于是任何一次**不带 persona 的写入**（如写关系量值）都会把已锁定人格清空。
      //   冒烟实测：写 relation 后 getPersona().locked 由 true 变 false。
      let personaTouched = false;
      const next = {
        fields: null,
        personality: null, worldview: null, family: null, memory: null, relationships: null,
        relations: null, persona: null
      };
      const old = this.getProfile(nm);
      TEXT_SECS.forEach(function (sec) {
        if (!(sec in sections)) return;
        const items = toTexts(sections[sec]);
        if (items === null) { out.rejected.push({ section: sec, reason: 'bad-shape' }); return; }
        const kept = items.filter(function (x) { return x.length > 0 && x.length <= 200; });
        if (kept.length !== items.length) out.rejected.push({ section: sec, reason: 'length-or-empty' });
        const base = (o.replace === true || !Array.isArray(old[sec])) ? [] : old[sec].map(function (x) { return x && x.text ? x : { text: String(x || ''), at: now }; });
        kept.forEach(function (t) {
          const dup = base.some(function (x) { return String(x.text) === t; });
          if (dup) return;
          base.push({ text: t, at: now });
        });
        const cap = capOf(sec) || 25;
        // v2.13.0: 档案节挤出走单一出口（上限逐节不同 → 站点 cap 声明为 per-call，
        //   须显式传入本次上限；传漏会以 bad-cap 归因，而不是随手回落到 25）。
        if (WA.evict) WA.evict.array(base, 'people.profile', cap);
        next[sec] = base.slice(-cap);
        out.added[sec] = Math.max(0, next[sec].length - (o.replace === true ? 0 : (old[sec] || []).length));
        changed = true;
      });
      if ('relationships' in sections) {
        const rels = toRels(sections.relationships);
        if (rels === null) out.rejected.push({ section: 'relationships', reason: 'bad-shape' });
        else {
          const base = (o.replace === true || !Array.isArray(old.relationships)) ? [] : old.relationships.slice();
          rels.forEach(function (rl) {
            const hit = base.filter(function (x) { return x && x.target === rl.target; })[0];
            if (hit) { hit.relation = rl.relation || hit.relation; hit.dynamic = rl.dynamic || hit.dynamic; hit.at = now; }
            else base.push({ target: rl.target, relation: rl.relation, dynamic: rl.dynamic, at: now });
          });
          const capR = capOf('relationships') || 15;
          // v2.13.0: 关系节同上——逐节上限来自登记表，挤出经单一出口记账。
          if (WA.evict) WA.evict.array(base, 'people.profile', capR);
          next.relationships = base.slice(-capR);
          out.added.relationships = Math.max(0, next.relationships.length - (o.replace === true ? 0 : (old.relationships || []).length));
          changed = true;
        }
      }
      // v2.51.0: 关系量值节（单向数组；数值受单步 20 硬边界与 0-100 截断约束）
      if ('relations' in sections) {
        const raw0 = sections.relations;
        let rows = null;
        if (typeof raw0 === 'string') {
          rows = raw0.split(String.fromCharCode(10)).map(function (x) { return x.trim(); }).filter(Boolean).map(function (line) {
            const parts = line.split('|').map(function (y) { return y.trim(); });
            return { target: parts[0], intimacy: parts[1], trust: parts[2], hostility: parts[3], vigilance: parts[4], boundary_status: parts[5] };
          });
        } else if (Array.isArray(raw0)) rows = raw0;
        if (rows === null) out.rejected.push({ section: 'relations', reason: 'bad-shape' });
        else {
          const prev = Array.isArray(old.relations) ? old.relations.slice() : [];
          rows.forEach(function (rl) {
            if (!rl || typeof rl !== 'object') { out.rejected.push({ section: 'relations', reason: 'bad-shape' }); return; }
            const t = String(rl.target || '').slice(0, 60).trim();
            if (!t) { out.rejected.push({ section: 'relations', reason: 'missing-target' }); return; }
            let hit = prev.filter(function (x) { return x && x.target === t; })[0];
            if (!hit) { hit = { target: t, at: now }; prev.push(hit); }
            REL_NUM_FIELDS.forEach(function (f) {
              if (!(f in rl) || rl[f] === null || rl[f] === undefined || rl[f] === '') return;
              // v2.51.0 修正：**首次建立**该关系行时不应受单步钳制——
              //   单步限约束的是「一次事件带来的变化」，而初始化是给定初值。
              //   先前实现以 prev=0 为准，令首次 intimacy:30 被削成 20（静默失真）。
              const isNewField = (hit[f] === undefined || hit[f] === null);
              const rawN = Number(rl[f]);
              if (!isFinite(rawN)) { out.rejected.push({ section: 'relations', reason: 'bad-value:' + f }); return; }
              const v2 = isNewField ? Math.round(Math.max(0, Math.min(100, rawN))) : clampRelStep(hit[f], rl[f]);
              if (v2 === null) { out.rejected.push({ section: 'relations', reason: 'bad-value:' + f }); return; }
              if (v2 !== hit[f]) { hit[f] = v2; hit.at = now; }
            });
            REL_STR_FIELDS.forEach(function (f) {
              if (rl[f] !== undefined && rl[f] !== null && rl[f] !== '') hit[f] = String(rl[f]).slice(0, 160);
            });
          });
          const capRel = capOf('relations') || 40;
          if (WA.evict) WA.evict.array(prev, 'people.profile', capRel);
          next.relations = prev.slice(-capRel);
          out.added.relations = Math.max(0, next.relations.length - (Array.isArray(old.relations) ? old.relations.length : 0));
          changed = true;
        }
      }
      // v2.51.0: 人格机制节（对象；打平存 d1..d5）写入即锁定，非法骰面不落盘
      if ('persona' in sections) {
        personaTouched = true;
        const rawP = sections.persona;
        if (rawP === null) { next.persona = null; changed = true; }
        else if (!rawP || typeof rawP !== 'object' || Array.isArray(rawP)) { out.rejected.push({ section: 'persona', reason: 'bad-shape' }); }
        else {
          const src = (rawP.dice && typeof rawP.dice === 'object') ? rawP.dice : rawP;
          const rec = { slot: slotOf(rawP.slot) || '', locked: rawP.locked === true, at: Number(rawP.at) || now, note: String(rawP.note || '').slice(0, 200) };
          PERSONA_KEYS.forEach(function (k) { const v = clampDice(src[k]); if (v !== null) rec[k] = v; });
          if (rawP.evolvedFrom) rec.evolvedFrom = String(rawP.evolvedFrom).slice(0, 8);
          if (rawP.evolveAt) rec.evolveAt = Number(rawP.evolveAt) || 0;
          next.persona = rec;
          out.added.persona = 1;
          changed = true;
        }
      }
      if (!changed) return { ok: false, reason: 'no-sections', rejected: out.rejected };
      const merged = {
        fields: Object.assign({ name: nm }, old.fields || {}),
        personality: next.personality || (old.personality || []),
        worldview: next.worldview || (old.worldview || []),
        family: next.family || (old.family || []),
        memory: next.memory || (old.memory || []),
        relationships: next.relationships || (old.relationships || []),
        relations: next.relations || (old.relations || []),
        persona: personaTouched ? next.persona : (old.persona || null)
      };
      WA.store.transact(function (draft) {
        const id = 'p_' + nm;
        // v2.86.0 A3：创建走唯一写者（本文件自己也是调用方之一，不搞双重标准）。
        ensurePerson(draft, id, nm, 'registry');
        const p = draft.people[id];
        p.profile = merged;
        p.updatedAt = now;
      });
      TEXT_SECS.concat(['relationships', 'relations']).forEach(function (sec) { out.total += (merged[sec] || []).length; });
      if (merged.persona) out.total += 1;
      WA.emit('registry:changed');
      return out;
    },
    /** v2.2.0: 清空某人档案（分节清空，保留人物条目本身） */
    clearProfile(name) {
      const nm = String(name || '').trim();
      if (!nm) return { ok: false, reason: 'missing-name' };
      const empty = { fields: { name: nm }, personality: [], worldview: [], family: [], relationships: [], memory: [], relations: [], persona: null };
      return this.setProfileSafe(nm, empty, { replace: true }).ok ? { ok: true, name: nm } : { ok: false, reason: 'no-sections' };
    },
    // -- v2.51.0 面B：人格机制与关系量值 ------------------------------
    /** 读取人格机制。locked=false 表示「尚未建立」（与「已建立但读取不到」分开记） */
    getPersona(name) {
      const pr = this.getProfile(name) || {};
      const p = pr.persona;
      if (!p || typeof p !== 'object') return { locked: false, slot: '', dice: {}, missing: PERSONA_KEYS.slice(), at: 0, note: '' };
      const dice = {};
      PERSONA_KEYS.forEach(function (k) { if (typeof p[k] === 'number') dice[k] = p[k]; });
      return { locked: p.locked === true, slot: p.slot || '', dice: dice,
        missing: PERSONA_KEYS.filter(function (k) { return !(k in dice); }), at: p.at || 0, note: p.note || '' };
    },
    /**
     * 写入人格机制骰面并锁定。
     *   ① 一经写入即锁定；重复写入默认拒收（reason:'already-locked'）；
     *   ② 演化改写须显式 {allowEvolve:true, evolveKey:'d3'}，一次只改一个维度；
     *   ③ 骰面不完整或任一项非法 -> 整笔拒收，不留「半套锁定」的假象。
     */
    setPersonaDice(name, dice, opts) {
      const o = opts || {};
      const nm = String(name || '').trim();
      if (!nm) return { ok: false, reason: 'missing-name' };
      if (!dice || typeof dice !== 'object' || Array.isArray(dice)) return { ok: false, reason: 'not-object' };
      const cur = this.getPersona(nm);
      // v2.51.0 面C：偏好槽与稳定槽分开
      //   显式给了非空值但非法 -> 仍拒 bad-slot（不静默忽略调用方的错）；
      //   未给槽 -> prefer=null，交由稳定随机槽分配（此前 `if (!slot) return bad-slot`
      //   在分配之前，导致**不传槽的调用一律被拒**，槽层从未生效）。
      const rawPrefer = (o.slot !== undefined && o.slot !== null && String(o.slot).trim() !== '') ? o.slot
        : ((dice.slot !== undefined && dice.slot !== null && String(dice.slot).trim() !== '') ? dice.slot : null);
      const prefer = rawPrefer === null ? null : slotOf(rawPrefer);
      if (rawPrefer !== null && !prefer) return { ok: false, reason: 'bad-slot' };
      const clean = {}, rejected = [];
      PERSONA_KEYS.forEach(function (k) {
        const v = clampDice(dice[k]);
        if (v === null) { if (dice[k] !== undefined && dice[k] !== null && dice[k] !== '') rejected.push(k); }
        else clean[k] = v;
      });
      const now = clockNow('registry');
      if (cur.locked) {
        if (o.allowEvolve !== true) return { ok: false, reason: 'already-locked', slot: cur.slot };
        // v2.51.0 修正：演化必须**恰好**一个维度。先前仅校验 evolveKey 合法，
        //   多传的其余维度被静默丢弃——调用方以为改了两维，实际只改一维。
        const provided = PERSONA_KEYS.filter(function (k) { return clean[k] !== undefined; });
        if (provided.length !== 1) return { ok: false, reason: 'evolve-needs-single-key', provided: provided, keys: PERSONA_KEYS };
        const kk = provided[0];
        const wantKey = String(o.evolveKey || '');
        if (wantKey && wantKey !== kk) return { ok: false, reason: 'evolve-key-mismatch', evolveKey: wantKey, provided: provided };

        if (clean[kk] === cur.dice[kk]) return { ok: false, reason: 'no-change', key: kk };
        const evolved = Object.assign({}, cur.dice); evolved[kk] = clean[kk];
        const resE = this.setProfileSafe(nm, { persona: { slot: cur.slot, locked: true, at: now, note: o.note || cur.note || '', evolvedFrom: kk, evolveAt: now, dice: evolved } });
        return (resE && resE.ok) ? { ok: true, evolved: kk, slot: cur.slot, dice: evolved } : { ok: false, reason: 'write-fail' };
      }
      const miss = PERSONA_KEYS.filter(function (k) { return !(k in clean); });
      if (miss.length) return { ok: false, reason: 'incomplete-dice', missing: miss, rejected: rejected };
      // v2.51.0 面C：在校验全过后才占稳定槽（被拒的写入不占槽）；稳定分配始终优先于偏好
      const asg = slotAssign(nm);
      if (!asg.ok) return { ok: false, reason: asg.reason, capacity: asg.capacity };
      const slot = asg.slot;
      const slotCorrected = !!(prefer && prefer !== slot);
      const res = this.setProfileSafe(nm, { persona: { slot: slot, locked: true, at: now, note: o.note || '', dice: clean } });
      if (!res || !res.ok) { slotRelease(nm); return { ok: false, reason: (res && res.reason) || 'write-fail' }; }
      return { ok: true, slot: slot, dice: clean, locked: true, slotCorrected: slotCorrected };
    },
    /** 关系面只读视图（含阶梯名）。单向：source 对 target */
    getRelation(name, target) {
      const t = String(target || '').trim();
      const arr = (this.getProfile(name) || {}).relations || [];
      const hit = arr.filter(function (x) { return x && x.target === t; })[0] || null;
      if (!hit) return { known: false, target: t, band: '' };
      const view = { known: true, target: t, band: relBand(hit.intimacy), at: hit.at || 0 };
      REL_NUM_FIELDS.concat(REL_STR_FIELDS).forEach(function (f) { if (hit[f] !== undefined) view[f] = hit[f]; });
      return view;
    },
    /** 关系量值写入（委托 setProfileSafe 的 relations 节：20 硬边界与 0-100 截断在那里统一实施） */
    setRelations(name, rows, opts) {
      const nm = String(name || '').trim();
      if (!nm) return { ok: false, reason: 'missing-name' };
      return this.setProfileSafe(nm, { relations: rows }, opts || {});
    },
    /** 关系面只读统计（巡视/诊断消费） */
    relationStat() {
      const names = this.list();
      let rows = 0, withRel = 0, lockedPersona = 0;
      const detail = {};
      names.forEach(function (n) {
        const pr = (WA.registry.getProfile(n) || {});
        const a = Array.isArray(pr.relations) ? pr.relations : [];
        if (a.length) { withRel++; rows += a.length; }
        if (pr.persona && pr.persona.locked === true) lockedPersona++;
        detail[n] = { relations: a.length, personaLocked: !!(pr.persona && pr.persona.locked === true) };
      });
      return { registered: names.length, withRelations: withRel, relationRows: rows, personaLocked: lockedPersona, detail: detail };
    },
    /** v2.51.0 面C：稳定槽位视图（容量/占用/空闲/归属）——「槽位还剩几个」此前不可观测 */
    slotStat() {
      const owners = SLOT_ORDER.map(function (x) { return { slot: x, name: __slots[x] || '' }; });
      const used = owners.filter(function (o) { return !!o.name; }).length;
      // v2.62.0: 明写**用途**。此前「槽耗尽」与「人物装不下」被读成同一件事，
      //   而它们是两件事：槽只为本轮计算/提示组织服务，人物身份另有一套持久 id。
      return { capacity: SLOT_ORDER.length, used: used, free: SLOT_ORDER.length - used, owners: owners,
        exhausted: used >= SLOT_ORDER.length,
        purpose: '本轮计算与提示组织的活动槽；人物身份见 personId()/idStat()（持久、不设 12 上限）' };
    },
    // -- v2.62.0：稳定人物 ID 出口（路线图前置收口①）-------------------------
    //   身份与活动槽分离后，长期状态（目标/承诺/日程/认知/资源）一律绑 id 而非槽位。
    //   口径：**对外只留三个口，且每个都有真实消费方**（本仓库纪律：导出即有承诺）。
    //     · identityOf() —— 姓名 → {personId, worldKey} 的唯一入口（面板「查身份」消费）；
    //     · idStat()     —— 身份/槽位/存档键三方对账（面板人物页 + 诊断 actors.identity 消费）；
    //     · idClear()    —— 解除绑定（面板「解除绑定」消费）。
    //   内部的 personId() / worldKey() / idOf() 曾经也挂在出口上，但它们**零外部消费**
    //   （只有本文件自用）⇒ 被 dead-export-gate 判 self-only/unwired「过度导出」。
    //   现在它们退回实现内部：拿到 id 请走 identityOf().personId，不要再单挂一个口。
    identityOf: identityOf,
    idStat: idStat,
    idClear: idClear,
    // v2.97.0 O9：别名表与追溯链。四个口，每个都有真消费方（无消费方不挂）：
    //   · aliasOf   —— 名字 → 规范名身份（面板「查身份」在历史名上也能作答）
    //   · bindAlias —— 登记一次改名留痕（面板「登记曾用名」消费）
    //   · traceOf   —— 逐步追溯路径（诊断 alias.trace 消费：中间每一跳都要看得见）
    //   · aliasStat —— 表视图（诊断 + 面板空态提示两处消费）
    //   不导出 canonicalOf / aliasRev / aliasKnown：三者只有本文件内的消费方
    //   （danglingRefs / aliasOf / traceOf），挂出去就是本仓库点名的「零消费死面」。
    aliasOf: aliasOf,
    bindAlias: bindAlias,
    traceOf: traceOf,
    aliasStat: aliasStat,
    /**
     * v2.91.0 O4：**跨模块身份引用的悬空对账**（只读，不改任何状态）。
     *   它治的病：关系 / 量值 / 承诺三类行里的 `target` 都是**名字引用**，
     *   而名字引用的生死从来没人核对——某人被改了名、被解除绑定、或从来没登记过，
     *   指向他的行仍然原样留着，且在任何出口上都看不见（idStat 只对账
     *   `people` 容器键 ↔ 持久 id，看不见「行内 target」这一层）。
     *   口径：**只报不删**。悬空引用不是错误，是待确认的旧账——
     *   自动清掉等于替作者做了「这个关系不算数」的决定。
     */
    danglingRefs() {
      const sc = idScope();
      // v2.97.0 O9：别名面是名字的**第三套来源**。旧名不再等于悬空——
      //   它只是「走到了别人名下」。两件事必须分列报出（见下方 aliasRows）。
      const rev = aliasRev(aliasScope());
      const bound = {}, known = {};
      Object.keys(sc.mine).forEach(function (n) { bound[n] = true; known[n] = true; });
      let s = {};
      try { s = (WA.store && WA.store.get ? (WA.store.get() || {}) : {}); } catch (e) { s = {}; }
      const people = s.people || {};
      Object.keys(people).forEach(function (k) { known[String(k).replace(/^p_/, '')] = true; });
      // 名字的两套来源（等价）：持久绑定表 + 存档容器键。任一命中即不算悬空。
      //   分类口径（v2.97.0 O9 立）：直认 / 靠别名认 / 谁也认不出，三态**分列**。
      //   全塞进 rows 会让「有人把名字改坏了」与「这里记着一个早就没人认得的名字」
      //   长得一模一样（都表现为一行悬空）——而它们要的处理完全不同。
      const rows = [], aliasRows = [], byKind = { relationships: 0, relations: 0, commitment: 0 };
      const aliasByKind = { relationships: 0, relations: 0, commitment: 0 };
      const mark = function (from, kind, t) {
        if (!t || known[t]) return;
        if (rev[t]) {
          const up = canonicalOf(t);
          aliasByKind[kind]++;
          aliasRows.push({ from: from, kind: kind, target: t,
            canonical: up.ok ? up.canonical : '', hops: up.ok ? up.hops : -1, aliasBroken: !up.ok });
          return;
        }
        byKind[kind]++;
        rows.push({ from: from, kind: kind, target: t });
      };
      Object.keys(people).forEach(function (k) {
        const nm = String(k).replace(/^p_/, '');
        const p = people[k];
        if (!p || typeof p !== 'object') return;
        const pr = (p.profile || {});
        ['relationships', 'relations'].forEach(function (sec) {
          const arr = Array.isArray(pr[sec]) ? pr[sec] : [];
          arr.forEach(function (x) { mark(nm, sec, String((x && x.target) || '').trim()); });
        });
        const lf = p.life;
        if (lf && Array.isArray(lf.commitments)) {
          lf.commitments.forEach(function (x) { mark(nm, 'commitment', String((x && x.target) || '').trim()); });
        }
      });
      return { rows: rows.length, byKind: byKind, items: rows.slice(0, 20),
        // 靠改名台账兜住的那些引用：不是缺陷，但必须可见——一个引用面全靠别名兜住，
        //   本身就是「这个世界的名字被改得很勤」这条实情。
        aliasRows: aliasRows.length, aliasByKind: aliasByKind, aliasItems: aliasRows.slice(0, 20),
        knownCount: Object.keys(known).length, aliasNames: Object.keys(rev).length, persisted: true };
    },
    // v2.86.0 A3：people 条目的唯一写者 + 来源观测口（消费方：life/intel/backstage + 诊断）
    ensurePerson: ensurePerson,
    personOriginStat: personOriginStat,
    /** 关系量值阶梯（只读，供面板/诊断取语义区间） */
    relationBands() { return REL_BANDS.map(function (b) { return { min: b[0], max: b[1], band: b[2] }; }); },

    /** v2.2.0: 档案覆盖率只读视图（巡视/诊断消费）——「有注册却零档案」此前完全不可见 */
    profileStat() {
      const names = this.list();
      const s = WA.store.get();
      const withProfile = [], detail = {};
      let entries = 0, sections = 0, personaCount = 0;
      names.forEach(function (n) {
        const p = (s.people || {})['p_' + n];
        const pr = p && p.profile;
        if (!pr) return;
        let cnt = 0;
        ['personality', 'worldview', 'family', 'memory', 'relationships', 'relations'].forEach(function (k) {
          const a = pr[k];
          if (Array.isArray(a) && a.length) { sections++; cnt += a.length; }
        });
        entries += cnt;
        if (pr.persona && pr.persona.locked === true) { cnt += 1; personaCount++; }
        detail[n] = cnt;
        if (cnt > 0) withProfile.push(n);
      });
      return { registered: names.length, withProfile: withProfile.length, sections: sections, entries: entries, personaLocked: personaCount, detail: detail };
    }
  };
})();
