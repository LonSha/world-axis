/**
 * WorldAxis engines/ruling.js (v2.231.0) — EXP-6：案件裁决与处罚执行
 *
 * ── 它治什么（缺口，开工前逐条复核现场）──────────────────────────
 *   计划原文：「**管辖规则、立案、告知/传唤、提交与质证、裁决、处罚执行与复核**。
 *   区分**客观事件、已知证据、指控和裁决**；虚构世界的制度可配置，不把现代法律
 *   假定为通则。」
 *   验收原文：「**证据不足的指控不能仅凭通缉分值定罪**；**新证据经复核改变裁决**；
 *   **罚款确实进入既有经济结算，撤销处罚不重复退款**。」
 *
 *   现场事实（不是静态推测）：
 *     · `engines/warrant.js` 的头注释**自己写明**「只记账不执法」—— 它有
 *       `report` / `pardon` / `read` / `buildBlock`，答的是「谁在案上、罪度几档、
 *       是不是惯犯」，它**答不出**「这桩指控立了案没有、传唤过没有、质证过没有、
 *       谁判的、判了什么、罚了没有、撤销过没有」—— 一条程序都没有；
 *     · `engines/investigation.js` 答「有哪些线索可查、查出了什么证据、证据够不够
 *       核验、核验后谁知道」；`checkEvidence` 给的是 `verified` / `unverified` /
 *       `contradictory` / `cannot-judge` —— 那是**证据面**的结论，不是**案件**的裁决；
 *     · `engines/evidence-board.js` 记的是**主张与边**（谁主张什么、缺哪条边），
 *       它是**论证结构**，没有当事人、没有程序、没有处罚；
 *     · `engines/economy.js` 答「买卖与制造怎么扣钱」——它认的是**交易**，
 *       罚款不是交易（没有卖家、没有货），它不认。
 *   四者合起来仍缺的那一格：**「有罪」不是记账的结论，是走完程序后的裁决**。
 *   本模块补的就是这一层。
 *
 * ── 机制（六句话）──────────────────────────────────────────────────
 *   ① **案件跨轮**（`store.ruling.cases`）：`open()` 立案，带被告、指控、案发地、
 *      管辖与提出方；案件**不是一条通缉记录**，它有状态机。
 *   ② **程序六段**（封闭集 `CASE_STATUS`）：`filed`（已立案）→ `notified`（已告知/
 *      传唤）→ `hearing`（已进入提交与质证）→ `ruled`（已裁决）→ `enforced`
 *      （已执行）→ `reviewed`（已复核）。顺序不对 ⇒ `bad-phase`。
 *   ③ **证据与指控分列**：`submit()` 落的是**证物**（谁提的、哪一类、指向什么）；
 *      裁决只认**已提交的证物**，不认通缉分值 —— 见 ④。
 *   ④ **不得仅凭通缉分值定罪**：`rule({verdict:'guilty'})` 要求已提交证物里
 *      **至少有一条不是 `warrant` 类**（`no-grounds`）——「他在通缉名单上」是
 *      **一条记录**，不是**一个证据**。判无罪 / 驳回不需要证据（举证责任在控方）。
 *   ⑤ **处罚执行走既有资源账**：`enforce({kind:'fine'})` 从被告的
 *      `people[].resources[货币]` 扣款（货币名读 `economy.money()`，**不另立币种**），
 *      指定 `to` 则记入对方账。**先判后扣**：不够 ⇒ `short-fine`，一克不动。
 *   ⑥ **撤销不重复退款**：`refund()` 只对**未撤销过**的处罚生效（`already-refunded`）；
 *      退款如实退回被告；若该笔记入了 `to`，从 `to` 扣回（不够则扣到 0 并把差额
 *      如实写进回执，**不静默造钱**）。
 *
 * ── 十一条否定式边界（每条都有判据咬）────────────────────────────
 *   ① 总开关默认关闭；关闭时一律拒收 `disabled`。
 *   ② **不自动抓人**：本模块**不读** `warrant` 的通缉名单去批量立案 —— 案件只能由
 *      `open()` 显式立案（「不自动把所有有通缉记录的人抓走」）。
 *   ③ **不建第二份名册**：当事人必须是世界里的人物（`unknown-party`）。
 *   ④ **不假定现代法律**：管辖名单是**配置**（`settings.jurisdictions` 逗号分隔；
 *      留空 ⇒ 不设限）；`charge` / `place` 是自由文本；处罚种类是**可配置清单**
 *      （`PENALTY_KINDS` 只是建议，表外自造 ⇒ `bad-penalty` 只在声明为封闭时生效）。
 *   ⑤ **不凭空定罪**：`guilty` 必须有非通缉类证物（`no-grounds`）。
 *   ⑥ **不凭空执行**：没裁决就执行 ⇒ `case-not-ruled`；案已执行完再动它 ⇒ `case-closed`。
 *   ⑦ **不重复退款**：`refunded` 只置一次（`already-refunded`）。
 *   ⑧ **不静默造钱**：退款回执带 `clawbackShort`（从 `to` 扣不够的差额如实上报）。
 *   ⑨ **裁决之后仍可提交证物**：那正是复核（`review`）的「新证据」。
 *     ⚠ 判据是**证物序数**（`n` > 裁决时的 `grounds`），**不是墙钟毫秒** ——
 *       同一毫秒内「裁决」与「提交」不可分（实测 `at` 相等，d=0），靠时间比大小必然不稳。
 *   ⑨ **复核必须有新证据**：裁决之后再提交过证物才谈得上复核（`no-new-grounds`）——
 *      不许「同一批证据翻来覆去改判」。
 *   ⑩ **不替世界定位置**：全文不写 `world.*`；收监 / 流放的位置改动走世界侧。
 *   ⑪ **存档是唯一真源**（`store.ruling`）：`reload()` 从存档重建（切聊天必须重建）。
 *
 * ── 与邻近模块的分工（不是同一件事，故不合并）──────────────────
 *   · `warrant`        —— 「谁在通缉名单上」（**记录**）；本模块答「这桩指控判了没有」。
 *   · `investigation`  —— 「查出了什么、证据够不够核验」（**证据面**）；本模块答「够不够定罪」。
 *   · `evidenceBoard`  —— 「谁主张什么、缺哪条边」（**论证结构**）；本模块答「谁判的」。
 *   · `economy`        —— 「买卖与制造怎么扣钱」（**交易**）；罚款不是交易，本模块只借用同一本资源账。
 *   · `contest`        —— 「这场对抗谁占上风」（**过程**）；本模块是**程序**，不是胜负。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_ruling_settings_v1';
  // 管辖名单与国库账用**文本**（逗号分隔 / 空串）而不是数组：settingsBus 的默认值
  //   走的是深拷贝与类型校验，数组默认在部分路径上会被规整成字符串 —— 与其猜它，
  //   不如自己定成文本再解析（「制度可配置」要求它必须能被面板直接编辑）。
  const DEF = { enabled: false, maxCases: 24, maxExhibits: 96, maxRulings: 48, maxPenalties: 48,
    minGrounds: 1, jurisdictions: '', treasury: '', viewer: '' };
  const __REG = { key: LS_KEY, def: DEF, module: 'ruling',
    bounds: { maxCases: [2, 96], maxExhibits: [4, 240], maxRulings: [2, 120], maxPenalties: [2, 120],
      minGrounds: [1, 8] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}))
      : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})))
      : Object.assign({}, DEF, next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // ── 程序六段（封闭集：自造一个 ⇒ 拒收）──
  const CASE_STATUS = ['filed', 'notified', 'hearing', 'ruled', 'enforced', 'reviewed'];
  // 还在「未裁决」段的（可提交证物）；裁决之后的段只能复核。
  const OPEN_CASE = ['filed', 'notified', 'hearing'];
  // 案结：已执行完毕 —— 除退款外不再收指令。
  const CLOSED_CASE = ['enforced'];
  // ── 裁决三档（封闭集）──
  const VERDICTS = ['guilty', 'not-guilty', 'dismissed'];
  // ── 证物分类（建议清单，**不是**封闭集 —— 不同题材自己定 kind）──
  //   唯一被本模块**特别对待**的是 `warrant`：它是「记录」不是「证据」（见 ④）。
  const EXHIBIT_KINDS = ['testimony', 'document', 'object', 'forensic', 'warrant'];
  // ── 提出方（两造）──
  const PARTIES = ['prosecution', 'defense'];
  // ── 处罚种类（建议清单；`fine` 是唯一会动资源账的一类）──
  const PENALTY_KINDS = ['fine', 'warning', 'custody'];
  const MONEY_DEF = '银元';

  const stat = { opened: 0, notified: 0, submitted: 0, ruled: 0, enforced: 0, reviewed: 0,
    refunded: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason, extra) { noteFault(reason); return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : (typeof v === 'string' ? v.slice(0, max || 60) : ''); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function bagOf(root) {
    const p = (root || state()).ruling;
    return (p && typeof p === 'object' && !Array.isArray(p)) ? p : null;
  }
  function casesOf(root) { const b = bagOf(root); return (b && Array.isArray(b.cases)) ? b.cases : []; }
  function exhibitsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.exhibits)) ? b.exhibits : []; }
  function rulingsOf(root) { const b = bagOf(root); return (b && Array.isArray(b.rulings)) ? b.rulings : []; }
  function penaltiesOf(root) { const b = bagOf(root); return (b && Array.isArray(b.penalties)) ? b.penalties : []; }
  function ensure(draft) {
    if (!draft.ruling || typeof draft.ruling !== 'object' || Array.isArray(draft.ruling)) {
      draft.ruling = { cases: [], exhibits: [], rulings: [], penalties: [] };
    }
    ['cases', 'exhibits', 'rulings', 'penalties'].forEach(function (k) {
      if (!Array.isArray(draft.ruling[k])) draft.ruling[k] = [];
    });
    return draft.ruling;
  }
  function caseOf(id, root) {
    const k = clean(id, 60);
    if (!k) return null;
    return casesOf(root).filter(function (s) { return s && clean(s.id, 60) === k; })[0] || null;
  }
  function exhibitsFor(caseId, root) {
    const k = clean(caseId, 60);
    return exhibitsOf(root).filter(function (x) { return x && clean(x.case, 60) === k; });
  }
  function rulingFor(caseId, root) {
    const k = clean(caseId, 60);
    return rulingsOf(root).filter(function (x) { return x && clean(x.case, 60) === k; });
  }
  function penaltyOf(pid, root) {
    const k = clean(pid, 60);
    if (!k) return null;
    return penaltiesOf(root).filter(function (x) { return x && clean(x.id, 60) === k; })[0] || null;
  }
  function personExists(who, root) {
    const w = clean(who, 60);
    if (!w) return false;
    const ppl = (root || state()).people || {};
    if (ppl['p_' + w]) return true;
    const keys = Object.keys(ppl);
    for (let i = 0; i < keys.length; i++) {
      if (ppl[keys[i]] && clean(ppl[keys[i]].name, 60) === w) return true;
    }
    return false;
  }
  function purseOf(root, who, create) {
    const w = clean(who, 60);
    const pe = (root || state()).people || {};
    let hit = pe['p_' + w] || null;
    if (!hit) {
      Object.keys(pe).forEach(function (k) { if (pe[k] && clean(pe[k].name, 60) === w) hit = pe[k]; });
    }
    if (!hit) return null;
    if (create && (!hit.resources || typeof hit.resources !== 'object')) hit.resources = {};
    return (hit.resources && typeof hit.resources === 'object') ? hit.resources : null;
  }
  function haveOf(pur, material) { return (pur && typeof pur === 'object') ? (num(pur[material]) || 0) : 0; }
  function money() {
    // 货币名**不另立**：读既有经济定义（未加载 economy ⇒ 沿用它的默认币名）。
    try { if (WA.economy && typeof WA.economy.money === 'function') return WA.economy.money(); } catch (e) {}
    return MONEY_DEF;
  }
  /** 管辖名单（逗号分隔文本 → 去空白后的数组）。留空 ⇒ 不设限（制度可配置）。 */
  function jurisList(cfg) {
    const t = clean(cfg.jurisdictions, 240);
    if (!t) return [];
    return t.split(',').map(function (x) { return clean(x, 40); }).filter(function (x) { return !!x; });
  }
  function jurisOk(cfg, j) {
    const list = jurisList(cfg);
    if (!list.length) return true;      // 没声明管辖名单 ⇒ 不设限（不假定现代法律）
    return list.indexOf(clean(j, 40)) >= 0;
  }
  /** 阶段闸：返回拒收码或 null。`allow` 是允许的状态列表。 */
  function phaseGate(cur, allow) {
    const c = clean(cur, 12);
    if (CLOSED_CASE.indexOf(c) >= 0 && allow.indexOf(c) < 0) return 'case-closed';
    if (allow.indexOf(c) < 0) return 'bad-phase';
    return null;
  }

  /**
   * 证物序数判新旧（**不以墙钟毫秒判** —— 同一毫秒内「裁决」与「提交」不可分，实测 d=0）。
   *   每条证物带 `n`（本案内 1 起、只增不复用）；每份裁决记 `grounds`（裁决时的本案证物序数）。
   *   「裁决之后提交的新证据」= `n > grounds`。旧档（无 `n` / `grounds`）退回 `at` 比较。
   */
  function isFresh(x, last) {
    if (!x || !last) return false;
    const n = num(x.n);
    if (n !== null) {
      const g = num(last.grounds);
      return g === null ? true : n > g;
    }
    return num(x.at) !== null && num(last.at) !== null && num(x.at) > num(last.at);
  }

  /**
   * ① 立案。**只能显式立案**（本模块不读通缉名单去批量抓人 —— 边界 ②）。
   *   被告必须已在册（`unknown-party`）；指控与案发地缺一拒收（`missing-fields`）；
   *   管辖不在配置名单内 ⇒ `no-jurisdiction`。
   */
  function open(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const accused = clean(s.accused, 60), charge = clean(s.charge, 60);
    const place = clean(s.place, 40), juris = clean(s.jurisdiction, 40);
    if (!accused || !charge || !place) return refuse('missing-fields',
      { field: !accused ? 'accused' : (!charge ? 'charge' : 'place') });
    if (!personExists(accused)) return refuse('unknown-party', { who: accused, role: 'accused' });
    if (!jurisOk(cfg, juris)) return refuse('no-jurisdiction', { jurisdiction: juris,
      declared: jurisList(cfg) });
    const by = clean(s.by, 60);
    if (by && !personExists(by)) return refuse('unknown-party', { who: by, role: 'by' });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      if (b.cases.length >= cfg.maxCases) {
        out = { ok: false, reason: 'cases-full', cap: cfg.maxCases }; return false;
      }
      const now = clockNow('ruling');
      const id = 'cs_' + now + '_' + b.cases.length;
      b.cases.push({ id: id, accused: accused, charge: charge, place: place,
        jurisdiction: juris, by: by, status: 'filed', at: now, exhibitSeq: 0, updatedAt: now });
      WA.evict.array(b.cases, 'ruling.cases', cfg.maxCases);
      out = { ok: true, id: id, accused: accused, charge: charge, place: place,
        jurisdiction: juris, status: 'filed' };
      return true;
    }, 'ruling:open');
    if (out && out.ok) { stat.opened++; stat.lastReason = 'opened'; }
    return out || refuse('store-unavailable');
  }

  /** ② 告知 / 传唤：`filed` → `notified`。顺序不对 ⇒ `bad-phase`。 */
  function notify(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const cur = caseOf(id);
    if (!cur) return refuse('no-such-case', { id: clean(id, 60) });
    const g = phaseGate(cur.status, ['filed']);
    if (g) return refuse(g, { id: cur.id, status: cur.status,
      hint: g === 'case-closed' ? '本案已执行完毕' : '先立案，再告知/传唤' });
    const by = clean(s.by, 60);
    if (by && !personExists(by)) return refuse('unknown-party', { who: by, role: 'by' });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.cases.filter(function (x) { return x && clean(x.id, 60) === clean(cur.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'no-such-case', id: cur.id }; return false; }
      if (clean(row.status, 12) !== 'filed') {
        out = { ok: false, reason: CLOSED_CASE.indexOf(clean(row.status, 12)) >= 0 ? 'case-closed' : 'bad-phase',
          id: row.id, status: row.status }; return false;
      }
      const now = clockNow('ruling');
      row.status = 'notified';
      row.notifiedAt = now;
      row.notifiedBy = by || '';
      row.notice = clean(s.notice, 80) || '';
      row.updatedAt = now;
      out = { ok: true, id: row.id, status: 'notified', by: row.notifiedBy,
        note: '已告知/传唤 —— 下一步是提交与质证（submit）' };
      return true;
    }, 'ruling:notify');
    if (out && out.ok) { stat.notified++; stat.lastReason = 'notified'; }
    return out || refuse('store-unavailable');
  }

  /**
   * ③ 提交与质证。落一条**证物**（谁提的、哪一类、指向什么）。
   *   案已执行完 ⇒ `case-closed`（与 `bad-phase` 分列：一个「案结了」、一个「顺序不对」）。
   */
  function submit(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const cur = caseOf(id);
    if (!cur) return refuse('no-such-case', { id: clean(id, 60) });
    // 裁决（ruled）/ 复核过（reviewed）之后仍可提交：那正是 review 要用的「新证据」。
    const g = phaseGate(cur.status, ['notified', 'hearing', 'ruled', 'reviewed']);
    if (g) return refuse(g, { id: cur.id, status: cur.status,
      hint: g === 'case-closed' ? '本案已执行完毕 —— 除退款外不再收指令' : '先告知/传唤，再提交证物' });
    const side = clean(s.side, 20);
    if (!side) return refuse('missing-fields', { field: 'side' });
    if (PARTIES.indexOf(side) < 0) return refuse('unknown-party', { who: side, role: 'side',
      parties: PARTIES.slice() });
    const content = clean(s.content, 80);
    if (!content) return refuse('missing-fields', { field: 'content' });
    const kind = clean(s.kind, 20) || 'testimony';
    const by = clean(s.by, 60);
    if (by && !personExists(by)) return refuse('unknown-party', { who: by, role: 'by' });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.cases.filter(function (x) { return x && clean(x.id, 60) === clean(cur.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'no-such-case', id: cur.id }; return false; }
      if (CLOSED_CASE.indexOf(clean(row.status, 12)) >= 0) {
        out = { ok: false, reason: 'case-closed', id: row.id, status: row.status }; return false;
      }
      if (['notified', 'hearing', 'ruled', 'reviewed'].indexOf(clean(row.status, 12)) < 0) {
        out = { ok: false, reason: 'bad-phase', id: row.id, status: row.status }; return false;
      }
      if (b.exhibits.length >= cfg.maxExhibits) {
        out = { ok: false, reason: 'exhibits-full', cap: cfg.maxExhibits }; return false;
      }
      const now = clockNow('ruling');
      const eid = 'ex_' + now + '_' + b.exhibits.length;
      // 证物序数：本案内 1 起、只增不复用（判新旧用它，不用墙钟毫秒 —— 同毫秒不可分）。
      const seq = (num(row.exhibitSeq) || 0) + 1;
      row.exhibitSeq = seq;
      b.exhibits.push({ id: eid, case: row.id, side: side, kind: kind, content: content,
        pointsTo: clean(s.pointsTo, 60) || '', by: by || '', at: now, n: seq });
      WA.evict.array(b.exhibits, 'ruling.exhibits', cfg.maxExhibits);
      const phaseNow = clean(row.status, 12);
      // 裁决之后再提交：**不改回 hearing**（本案已判；这一条留给复核当新证据）。
      if (phaseNow === 'notified' || phaseNow === 'hearing') row.status = 'hearing';
      row.updatedAt = now;
      const total = b.exhibits.filter(function (x) { return x && clean(x.case, 60) === clean(row.id, 60); }).length;
      const postRuling = phaseNow === 'ruled' || phaseNow === 'reviewed';
      out = { ok: true, id: eid, case: row.id, side: side, kind: kind, status: clean(row.status, 12),
        seq: seq, exhibits: total, postRuling: postRuling, note: kind === 'warrant'
          ? '已记入证物 —— 但通缉记录只是**记录**，不能单独作为定罪依据（见 rule）'
          : (postRuling
            ? '已记入证物 —— 本案已裁决，这一条是复核（review）可用的**新证据**'
            : '已记入证物') };
      return true;
    }, 'ruling:submit');
    if (out && out.ok) { stat.submitted++; stat.lastReason = 'submitted'; }
    return out || refuse('store-unavailable');
  }

  /**
   * ④ 裁决。三档封闭集（`guilty` / `not-guilty` / `dismissed`）。
   *   **不得仅凭通缉分值定罪**：`guilty` 要求已提交证物里至少有一条**非 `warrant` 类**，
   *   且总条数 ≥ `minGrounds`（默认 1）—— 不满足 ⇒ `no-grounds`。
   *   判无罪 / 驳回**不需要**证据（举证责任在控方）。
   */
  function rule(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const cur = caseOf(id);
    if (!cur) return refuse('no-such-case', { id: clean(id, 60) });
    const g = phaseGate(cur.status, ['hearing']);
    if (g) return refuse(g, { id: cur.id, status: cur.status,
      hint: g === 'case-closed' ? '本案已执行完毕' : '先提交并质证，再裁决（不许跳过质证）' });
    const verdict = clean(s.verdict, 20);
    if (!verdict) return refuse('missing-fields', { field: 'verdict' });
    if (VERDICTS.indexOf(verdict) < 0) return refuse('bad-ruling', { verdict: verdict,
      allowed: VERDICTS.slice() });
    const by = clean(s.by, 60);
    if (by && !personExists(by)) return refuse('unknown-party', { who: by, role: 'by' });
    const exs = exhibitsFor(cur.id);
    // ── 定罪证据闸（两道）──
    const solid = exs.filter(function (x) { return x && clean(x.kind, 20) !== 'warrant'; });
    if (verdict === 'guilty') {
      if (exs.length < cfg.minGrounds) {
        return refuse('no-grounds', { case: cur.id, exhibits: exs.length, need: cfg.minGrounds,
          hint: '证据不足不能定罪 —— 先提交证物' });
      }
      if (!solid.length) {
        return refuse('no-grounds', { case: cur.id, exhibits: exs.length, solid: 0,
          hint: '「他在通缉名单上」是**一条记录**，不是**一个证据** —— 不能仅凭通缉分值定罪' });
      }
    }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.cases.filter(function (x) { return x && clean(x.id, 60) === clean(cur.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'no-such-case', id: cur.id }; return false; }
      if (CLOSED_CASE.indexOf(clean(row.status, 12)) >= 0) {
        out = { ok: false, reason: 'case-closed', id: row.id, status: row.status }; return false;
      }
      if (clean(row.status, 12) !== 'hearing') {
        out = { ok: false, reason: 'bad-phase', id: row.id, status: row.status }; return false;
      }
      const live = b.exhibits.filter(function (x) { return x && clean(x.case, 60) === clean(row.id, 60); });
      const solidNow = live.filter(function (x) { return x && clean(x.kind, 20) !== 'warrant'; });
      if (verdict === 'guilty' && (live.length < cfg.minGrounds || !solidNow.length)) {
        out = { ok: false, reason: 'no-grounds', case: row.id, exhibits: live.length,
          solid: solidNow.length }; return false;
      }
      if (b.rulings.length >= cfg.maxRulings) {
        out = { ok: false, reason: 'rulings-full', cap: cfg.maxRulings }; return false;
      }
      const now = clockNow('ruling');
      const rid = 'ru_' + now + '_' + b.rulings.length;
      b.rulings.push({ id: rid, case: row.id, verdict: verdict, reason: clean(s.reason, 120) || '',
        by: by || '', at: now, exhibits: live.length, solid: solidNow.length, seq: 1,
        grounds: num(row.exhibitSeq) || 0 });
      WA.evict.array(b.rulings, 'ruling.rulings', cfg.maxRulings);
      row.status = 'ruled';
      row.verdict = verdict;
      row.ruledAt = now;
      row.updatedAt = now;
      out = { ok: true, id: rid, case: row.id, verdict: verdict, status: 'ruled',
        exhibits: live.length, solid: solidNow.length,
        note: verdict === 'guilty'
          ? '已定罪 —— 处罚由 enforce 执行（罚款走既有资源账）'
          : '已裁决（不判有罪不需要证据：举证责任在控方）' };
      return true;
    }, 'ruling:rule');
    if (out && out.ok) { stat.ruled++; stat.lastReason = out.verdict; }
    return out || refuse('store-unavailable');
  }

  /**
   * ⑤ 处罚执行。`fine` 从被告资源账扣款（**先判后扣**：不够 ⇒ `short-fine`，一克不动）；
   *   指定 `to` 则记入对方账。`warning` / `custody` 只记账（收监的位置改动走世界侧）。
   */
  function enforce(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const cur = caseOf(id);
    if (!cur) return refuse('no-such-case', { id: clean(id, 60) });
    const g = phaseGate(cur.status, ['ruled', 'reviewed']);
    if (g) return refuse(g, { id: cur.id, status: cur.status,
      hint: g === 'case-closed' ? '本案已执行完毕' : '还没裁决就执行不了（case-not-ruled）' });
    const kind = clean(s.kind, 20) || 'fine';
    if (PENALTY_KINDS.indexOf(kind) < 0) return refuse('bad-penalty', { kind: kind,
      allowed: PENALTY_KINDS.slice() });
    const verdict = clean(cur.verdict, 20);
    if (verdict !== 'guilty') return refuse('case-not-ruled', { case: cur.id, verdict: verdict,
      hint: '只有定罪了才有处罚可执行' });
    const to = clean(s.to, 60);
    if (to && !personExists(to)) return refuse('unknown-party', { who: to, role: 'to' });
    const material = kind === 'fine' ? (clean(s.material, 20) || money()) : clean(s.material, 20);
    const amount = num(s.amount) === null ? (kind === 'fine' ? 0 : 0) : num(s.amount);
    if (kind === 'fine' && !(amount > 0)) return refuse('missing-fields', { field: 'amount' });
    if (kind === 'fine') {
      const pur = purseOf(null, cur.accused);
      if (!pur) return refuse('unknown-party', { who: cur.accused, role: 'accused' });
      if (haveOf(pur, material) < amount) {
        return refuse('short-fine', { who: cur.accused, material: material,
          need: amount, have: haveOf(pur, material),
          hint: '先判后扣 —— 不够就一克不动（不出现「扣了一半又失败」）' });
      }
    }
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.cases.filter(function (x) { return x && clean(x.id, 60) === clean(cur.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'no-such-case', id: cur.id }; return false; }
      if (CLOSED_CASE.indexOf(clean(row.status, 12)) >= 0) {
        out = { ok: false, reason: 'case-closed', id: row.id, status: row.status }; return false;
      }
      if (['ruled', 'reviewed'].indexOf(clean(row.status, 12)) < 0) {
        out = { ok: false, reason: 'case-not-ruled', case: row.id, verdict: clean(row.verdict, 20) }; return false;
      }
      if (clean(row.verdict, 20) !== 'guilty') {
        out = { ok: false, reason: 'case-not-ruled', case: row.id, verdict: clean(row.verdict, 20) }; return false;
      }
      if (b.penalties.length >= cfg.maxPenalties) {
        out = { ok: false, reason: 'penalties-full', cap: cfg.maxPenalties }; return false;
      }
      const now = clockNow('ruling');
      let balance = null, paid = 0;
      if (kind === 'fine') {
        const pur = purseOf(draft, row.accused, true);
        if (!pur) { out = { ok: false, reason: 'unknown-party', who: row.accused, role: 'accused' }; return false; }
        if (haveOf(pur, material) < amount) {
          out = { ok: false, reason: 'short-fine', who: row.accused, material: material,
            need: amount, have: haveOf(pur, material) }; return false;
        }
        pur[material] = +((haveOf(pur, material) - amount).toFixed(2));
        paid = amount;
        balance = pur[material];
        if (to) {
          const tp = purseOf(draft, to, true);
          if (tp) tp[material] = +((haveOf(tp, material) + amount).toFixed(2));
        }
      }
      const pid = 'pn_' + now + '_' + b.penalties.length;
      b.penalties.push({ id: pid, case: row.id, kind: kind, amount: kind === 'fine' ? amount : 0,
        material: material, to: to, by: clean(s.by, 60) || '', at: now,
        refunded: false, refundedAt: 0 });
      WA.evict.array(b.penalties, 'ruling.penalties', cfg.maxPenalties);
      row.status = 'enforced';
      row.enforcedAt = now;
      row.updatedAt = now;
      out = { ok: true, id: pid, case: row.id, kind: kind, status: 'enforced',
        amount: kind === 'fine' ? amount : 0, material: material, currency: material,
        to: to || '', balance: balance, paid: paid,
        note: kind === 'fine'
          ? (to ? '罚款已从被告账上扣出并记入 ' + to + ' 账（走既有资源账，不另立币种）'
                : '罚款已从被告账上扣出（未指定收款方 ⇒ 上缴出账）')
          : '非罚款处罚只记账 —— 收监/流放的位置改动走世界侧（本模块不瞬移）' };
      return true;
    }, 'ruling:enforce');
    if (out && out.ok) { stat.enforced++; stat.lastReason = 'enforced'; }
    return out || refuse('store-unavailable');
  }

  /**
   * ⑥ 复核。**必须有新证据**：裁决之后再提交过证物（`no-new-grounds`）——
   *   不许「同一批证据翻来覆去改判」（验收原文：新证据经复核改变裁决）。
   */
  function review(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const cur = caseOf(id);
    if (!cur) return refuse('no-such-case', { id: clean(id, 60) });
    const g = phaseGate(cur.status, ['ruled', 'enforced', 'reviewed']);
    if (g) return refuse(g, { id: cur.id, status: cur.status,
      hint: g === 'case-closed' ? '本案已执行完毕' : '还没裁决，谈不上复核' });
    const verdict = clean(s.verdict, 20);
    if (!verdict) return refuse('missing-fields', { field: 'verdict' });
    if (VERDICTS.indexOf(verdict) < 0) return refuse('bad-ruling', { verdict: verdict,
      allowed: VERDICTS.slice() });
    const last = rulingFor(cur.id).slice(-1)[0] || null;
    const exs = exhibitsFor(cur.id);
    const fresh = exs.filter(function (x) { return isFresh(x, last); });
    if (!fresh.length) {
      return refuse('no-new-grounds', { case: cur.id, exhibits: exs.length,
        hint: '复核必须有**新证据**（裁决之后提交的证物）—— 不许同一批证据翻来覆去改判' });
    }
    const solid = exs.filter(function (x) { return x && clean(x.kind, 20) !== 'warrant'; });
    if (verdict === 'guilty' && (exs.length < cfg.minGrounds || !solid.length)) {
      return refuse('no-grounds', { case: cur.id, exhibits: exs.length, solid: solid.length });
    }
    const by = clean(s.by, 60);
    if (by && !personExists(by)) return refuse('unknown-party', { who: by, role: 'by' });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const row = b.cases.filter(function (x) { return x && clean(x.id, 60) === clean(cur.id, 60); })[0] || null;
      if (!row) { out = { ok: false, reason: 'no-such-case', id: cur.id }; return false; }
      if (['ruled', 'enforced', 'reviewed'].indexOf(clean(row.status, 12)) < 0) {
        out = { ok: false, reason: 'bad-phase', id: row.id, status: row.status }; return false;
      }
      const live = b.exhibits.filter(function (x) { return x && clean(x.case, 60) === clean(row.id, 60); });
      const prev = b.rulings.filter(function (x) { return x && clean(x.case, 60) === clean(row.id, 60); });
      const before = prev.length ? prev[prev.length - 1] : null;
      const freshNow = live.filter(function (x) { return isFresh(x, before); });
      if (!freshNow.length) {
        out = { ok: false, reason: 'no-new-grounds', case: row.id, exhibits: live.length }; return false;
      }
      const solidNow = live.filter(function (x) { return x && clean(x.kind, 20) !== 'warrant'; });
      if (verdict === 'guilty' && (live.length < cfg.minGrounds || !solidNow.length)) {
        out = { ok: false, reason: 'no-grounds', case: row.id, exhibits: live.length, solid: solidNow.length }; return false;
      }
      if (b.rulings.length >= cfg.maxRulings) {
        out = { ok: false, reason: 'rulings-full', cap: cfg.maxRulings }; return false;
      }
      const now = clockNow('ruling');
      const prevVerdict = clean(row.verdict, 20);
      const rid = 'ru_' + now + '_' + b.rulings.length;
      b.rulings.push({ id: rid, case: row.id, verdict: verdict, reason: clean(s.reason, 120) || '',
        by: by || '', at: now, exhibits: live.length, solid: solidNow.length,
        seq: prev.length + 1, overrides: before ? before.id : '',
        grounds: num(row.exhibitSeq) || 0 });
      WA.evict.array(b.rulings, 'ruling.rulings', cfg.maxRulings);
      row.status = 'reviewed';
      row.verdict = verdict;
      row.reviewedAt = now;
      row.updatedAt = now;
      out = { ok: true, id: rid, case: row.id, verdict: verdict, prevVerdict: prevVerdict,
        status: 'reviewed', fresh: freshNow.length, exhibits: live.length,
        changed: prevVerdict !== verdict,
        note: prevVerdict !== verdict
          ? '复核改判：' + (prevVerdict || '（未定）') + ' → ' + verdict + '（依据裁决后新提交的 '
            + freshNow.length + ' 条证物）'
          : '复核维持原判（新证据不足以改判）' };
      return true;
    }, 'ruling:review');
    if (out && out.ok) { stat.reviewed++; stat.lastReason = 'reviewed'; }
    return out || refuse('store-unavailable');
  }

  /**
   * ⑦ 撤销处罚（**不重复退款**）。退款如实退回被告；若该笔记入了 `to`，
   *   从 `to` 扣回（不够则扣到 0 并把差额如实写进 `clawbackShort` —— 不静默造钱）。
   */
  function refund(pid, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec || {};
    const row = penaltyOf(pid);
    if (!row) return refuse('no-penalty', { id: clean(pid, 60),
      hint: '没有这条处罚可撤销（处罚只能来自 enforce 的落账）' });
    const cur = caseOf(row.case);
    if (!cur) return refuse('no-such-case', { id: clean(row.case, 60) });
    if (clean(row.kind, 20) !== 'fine') return refuse('no-penalty', { id: clean(pid, 60),
      kind: clean(row.kind, 20), hint: '非罚款类处罚没有可退的款项' });
    let out = null;
    WA.store.transact(function (draft) {
      const b = ensure(draft);
      const pr = b.penalties.filter(function (x) { return x && clean(x.id, 60) === clean(pid, 60); })[0] || null;
      if (!pr) { out = { ok: false, reason: 'no-penalty', id: clean(pid, 60) }; return false; }
      if (pr.refunded) {
        out = { ok: false, reason: 'already-refunded', id: pr.id,
          hint: '撤销处罚不重复退款 —— 这一笔已经退过了' }; return false;
      }
      const amount = num(pr.amount) || 0;
      const material = clean(pr.material, 20) || money();
      let clawbackShort = 0, clawedBack = 0;
      if (amount > 0) {
        if (pr.to) {
          const tp = purseOf(draft, pr.to, false);
          const have = haveOf(tp, material);
          clawedBack = Math.min(amount, have);
          clawbackShort = +((amount - clawedBack).toFixed(2));
          if (tp) tp[material] = +((have - clawedBack).toFixed(2));
        }
        const pur = purseOf(draft, cur.accused, true);
        if (!pur) { out = { ok: false, reason: 'unknown-party', who: cur.accused, role: 'accused' }; return false; }
        pur[material] = +((haveOf(pur, material) + amount).toFixed(2));
      }
      const now = clockNow('ruling');
      pr.refunded = true;
      pr.refundedAt = now;
      pr.refundReason = clean(s.why, 80) || '';
      out = { ok: true, id: pr.id, case: pr.case, amount: amount, material: material,
        refunded: true, clawedBack: clawedBack, clawbackShort: clawbackShort,
        balance: haveOf(purseOf(draft, cur.accused, false), material),
        note: '已撤销并退款（只退一次）—— '
          + (pr.to ? ('从 ' + pr.to + ' 账扣回 ' + clawedBack
            + (clawbackShort ? '，差额 ' + clawbackShort + ' 如实上报（不静默造钱）' : '')) : '原为上缴出账') };
      return true;
    }, 'ruling:refund');
    if (out && out.ok) { stat.refunded++; stat.lastReason = 'refunded'; }
    return out || refuse('store-unavailable');
  }

  // ── 只读口 ──
  function caseOfRead(id) {
    const c = caseOf(id);
    if (!c) return null;
    const exs = exhibitsFor(c.id);
    return { id: c.id, accused: c.accused, charge: c.charge, place: c.place,
      jurisdiction: c.jurisdiction, by: c.by, status: c.status, verdict: c.verdict || '',
      exhibits: exs.length,
      solid: exs.filter(function (x) { return x && clean(x.kind, 20) !== 'warrant'; }).length };
  }
  function verdictOf(id) {
    const c = caseOf(id);
    if (!c) return null;
    const last = rulingFor(c.id).slice(-1)[0] || null;
    return { case: c.id, status: c.status, verdict: clean(c.verdict, 20) || '',
      ruledAt: num(c.ruledAt) || 0, ruledBy: last ? last.by : '', seq: last ? num(last.seq) : 0 };
  }
  function penaltiesFor(caseId) {
    const k = clean(caseId, 60);
    return penaltiesOf().filter(function (x) { return x && clean(x.case, 60) === k; })
      .map(function (x) { return { id: x.id, kind: x.kind, amount: num(x.amount) || 0,
        material: x.material, to: x.to || '', refunded: !!x.refunded }; });
  }
  function list() {
    return casesOf().map(function (c) { return caseOfRead(c.id); });
  }
  function reload() {
    // 本模块无内存缓存：存档（store.ruling）是唯一真源，reload 是「切聊天后重建」的显式入口。
    const b = bagOf();
    return { ok: true, cases: casesOf().length, exhibits: exhibitsOf().length,
      rulings: rulingsOf().length, penalties: penaltiesOf().length, present: !!b };
  }
  function view() {
    const cfg = settings();
    return { enabled: !!cfg.enabled, statuses: CASE_STATUS.slice(), verdicts: VERDICTS.slice(),
      penaltyKinds: PENALTY_KINDS.slice(), exhibitKinds: EXHIBIT_KINDS.slice(),
      parties: PARTIES.slice(), minGrounds: cfg.minGrounds,
      jurisdictions: jurisList(cfg), treasury: clean(cfg.treasury, 60),
      cases: casesOf().length, exhibits: exhibitsOf().length,
      rulings: rulingsOf().length, penalties: penaltiesOf().length,
      currency: money() };
  }
  /**
   * 注入块：**两道闸**（无观察者 ⇒ 空串；没参与任何一案 ⇒ 空串）。
   *   只列观察者自己是当事人的案子（被告 / 提出方 / 判决人）。
   */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled || !WA.store) return '';
    const viewer = clean(cfg.viewer, 60);
    if (!viewer) return '';   // 无观察者 ⇒ 零 token（绝不产出全知版案卷）
    const mine = casesOf().filter(function (c) {
      if (!c) return false;
      if (clean(c.accused, 60) === viewer) return true;
      if (clean(c.by, 60) === viewer) return true;
      return rulingFor(c.id).some(function (r) { return r && clean(r.by, 60) === viewer; });
    });
    if (!mine.length) return '';   // 没参与任何一案 ⇒ 仍是零 token（纵深防御）
    const lines = mine.map(function (c) {
      const exs = exhibitsFor(c.id);
      const solid = exs.filter(function (x) { return x && clean(x.kind, 20) !== 'warrant'; }).length;
      const pens = penaltiesFor(c.id).filter(function (p) { return !p.refunded; });
      const pen = pens.length ? '｜罚：' + pens.map(function (p) {
        return p.kind + (p.amount ? ' ' + p.material + ' ' + p.amount : '');
      }).join('、') : '';
      return '· ' + c.id + '：指控 ' + c.charge + '（' + c.place + '）'
        + '｜阶段 ' + c.status
        + (c.verdict ? '｜裁决 ' + c.verdict : '')
        + '｜证物 ' + exs.length + '（非通缉类 ' + solid + '）' + pen;
    });
    return '[案件]\n' + lines.join('\n')
      + '\n证据不足不得定罪：通缉记录只是**记录**，不能单独作为定罪依据；已裁决的结果不重掷；'
      + '撤销处罚不重复退款；收监/流放的位置改动由世界侧落实（本表不瞬移）。\n';
  }
  function statView() {
    return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) });
  }
  function resetStat() {
    stat.opened = 0; stat.notified = 0; stat.submitted = 0; stat.ruled = 0; stat.enforced = 0;
    stat.reviewed = 0; stat.refunded = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  function reset() {
    let out = null;
    WA.store.transact(function (draft) {
      draft.ruling = { cases: [], exhibits: [], rulings: [], penalties: [] };
      out = { ok: true };
      return true;
    }, 'ruling:reset');
    resetStat();
    return out || refuse('store-unavailable');
  }

  WA.ruling = {
    CASE_STATUS: CASE_STATUS.slice(), VERDICTS: VERDICTS.slice(),
    PENALTY_KINDS: PENALTY_KINDS.slice(), EXHIBIT_KINDS: EXHIBIT_KINDS.slice(),
    PARTIES: PARTIES.slice(), OPEN_CASE: OPEN_CASE.slice(),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    open: open, notify: notify, submit: submit, rule: rule, enforce: enforce,
    review: review, refund: refund,
    caseOf: caseOfRead, exhibits: function (id) { return exhibitsFor(id).map(function (x) {
      return { id: x.id, side: x.side, kind: x.kind, content: x.content, by: x.by, at: x.at,
        n: num(x.n) }; }); },
    verdictOf: verdictOf, penaltyOf: function (pid) { const r = penaltyOf(pid); return r ? Object.assign({}, r) : null; },
    penalties: penaltiesFor, list: list, reload: reload, view: view, buildBlock: buildBlock,
    stat: statView, resetStat: resetStat, reset: reset
  };
  var EXPORT_COUNT = 27;
  var _exported = Object.keys(WA.ruling).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('ruling: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/ruling.js', { kind: 'engine', ver: '2.231.0' });
})();