/**
 * WorldAxis engines/diplomacy.js (v2.165.0) — 可谈判、可履约的势力外交（TX1）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────
 *   `faction-graph` 能从**双方各自的对外态度档位**推导出关系图，边恒为 `derived:true`
 *   并带 `basis` —— 那是**推导值**，不是**成对外交事实**。现场于是回答不了三个问题：
 *     · 「这两个势力之间**此刻是什么关系**」——推导边答的是「按各自立场算出来应该是什么样」；
 *     · 「他们**签过什么**」——推导边里没有条约这回事；
 *     · 「签的那一条**到期了没有 / 履约了没有**」——推导边没有时间也没有回执。
 *   一句话：**能算出一张关系图，但没有外交。**
 *   本模块补的是「**成对外交事实**」：稳定 pairId、双向态度、关系状态、有效条约与变化来源。
 *
 * ── 与 faction-graph 的分工（不许重叠）──────────────────────────
 *   · faction-graph = **推导面**（从立场档位算出图，`derived:true`，无时间无回执）；
 *   · 本模块        = **事实面**（pairId / 双边态度 / 条约 / 有效期 / 履约回执）。
 *   两者并存：推导边照旧保留标签，**不自动迁成联盟或战争**（那正是计划边界里写死的一条）——
 *   把推导结果静默写进事实表，等于让「算出来的」冒充「谈成的」。
 *
 * ── 六条设计边界（全是否定式）──────────────────────────────────
 *   1 总开关默认**关**（`enabled:false`）—— 外交会改世界（禁运真的断商路），
 *     默认打开等于让一个没人要求过的机制开始改存档。
 *   2 **A–B 签约不改写 A–C**：每对势力一个独立 pair 条目，写口只碰 `diplomacy.pairs` 里
 *     那一个 key。**没有全局关系矩阵**（矩阵一写就是「一处改、处处变」的温床）。
 *   3 **非对称态度必须保留**：`attitude[a→b]` 与 `attitude[b→a]` 是两个独立读数。
 *     把它们合成一个数字是「把两方各自的看法当成一段关系」——现实里这是最常被误判的一件事。
 *   4 **未知双方关系保持 unknown**：没有 pair 条目就是 `unknown`（不是「中立」）。
 *     「中立」是一个**谈成过的状态**，「unknown」是**还没发生** —— 两者混同会让
 *     「我们什么时候跟他中立了」永远答不出来。
 *   5 **未签约提案不产生正式世界效果**：提案阶段一律不写 `pairs`，只在 `proposals` 里。
 *   6 **条约与态度不混为一个数值**：条约是**具名条款 + 有效期 + 回执**，态度是**档位**。
 *     把「签了通商」折算成态度 +10 会让「他为什么突然友好」失去答案。
 *
 * ── 玩家路径（八步，每步都有可判定状态）────────────────────────
 *   选两个势力与提案 → 权限及资源预检 → 预览条件 → 对方作出有据答复 →
 *   确认 → 条款进入有效期 → 查看商路 / 资源 / 关系后果。
 *
 * ── 边界（如实写明，不假称完备）────────────────────────────────
 *   · 本模块**不改库存**：条约的**资源后果**由调用方经 `org` 完成（与 inst 同口径）。
 *   · 本模块**不判罚**：违约必须由调用方给出**有据回执**（`missing-evidence` 拒收）。
 *   · 本模块**不猜偏好**：未登记的偏好与外交事实不得由公式推出（纯规则只执行明确数据）。
 *   · 签约**不自动泄露**给未获消息的人物（消息面归 rumor / intel，本模块不写它们）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_diplomacy_settings_v1';
  const DEF = { enabled: false, maxPairs: 24, maxTerms: 6, maxProposals: 16 };
  const __REG = { key: LS_KEY, def: DEF, module: 'diplomacy',
    bounds: { maxPairs: [2, 64], maxTerms: [1, 16], maxProposals: [2, 32] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, __REG.def, raw || {}))
                          : Object.assign({}, __REG.def, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus
      ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {})))
      : Object.assign({}, settings(), next || {});
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const clockNow = function () { try { return WA.clock.now('diplomacy'); } catch (e) { return Date.now(); } };
  function state() { try { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 40) : String(v == null ? '' : v).slice(0, max || 40);
  }

  const _stat = { pairs: 0, terms: 0, proposals: 0, signed: 0, refused: 0, lastReason: '', faults: {} };
  function note(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  function no(code, extra) { note(code); return Object.assign({ ok: false, reason: code }, extra || {}); }

  // ── 具名词表（自造词等于自造权力，与 inst 同一纪律）─────────────
  /** 条约条款：**有限**四条。自造条款一律拒收 —— 条款不成表，执行方就无从写代码。 */
  const TERMS = ['trade', 'mutual-aid', 'armistice', 'embargo'];
  const TERM_LABEL = { trade: '通商', 'mutual-aid': '互助', armistice: '停战', embargo: '禁运' };
  /**
   * 关系状态：与 evolution 的 `FACTION_RELATION`（血盟/盟友/友好/中立/冷淡/敌对/世仇）
   *   **不是同一个东西**，故**不复用**那一套词：
   *   · FACTION_RELATION 是**单方对外态度档位**（一个势力对外的立场，写在世界观里）；
   *   · 本表是**成对关系状态**（两方之间谈成的状态，带 pairId 与时间）。
   *   混成一套会让「他对我什么态度」与「我们之间什么关系」变成同一个格子。
   */
  const STATES = ['unknown', 'contact', 'accord', 'alliance', 'cold', 'hostile'];
  const STATE_LABEL = { unknown: '未接触', contact: '往来中', accord: '有约', alliance: '同盟', cold: '冷淡', hostile: '敌对' };
  /** 提案状态机：proposed → countered（还价）→ accepted（待签）→ signed（生效）/ rejected（拒绝）。 */
  const STAGES = ['proposed', 'countered', 'accepted', 'signed', 'rejected'];
  /** 拒收码（18 个，每个都答得出「哪里不对、期待什么」）。 */
  const CODES = ['disabled', 'missing-fields', 'unknown-faction', 'same-faction', 'bad-term', 'bad-duration',
    'no-terms', 'too-many-terms', 'unknown-pair', 'unknown-proposal', 'bad-stage', 'no-authority',
    'insufficient', 'already', 'duplicate-term', 'missing-evidence', 'pairs-full', 'proposals-full'];

  // ── 稳定 pairId ────────────────────────────────────────────────
  /**
   * **成对 ID**：与 world-blueprint 的 `stableKey` 同族手法（FNV-1a 低 32 位）。
   *   两个名字**先排序再拼接** —— 于是 `pair('甲','乙') === pair('乙','甲')`：
   *   一对势力只有一个条目，不会因为「谁先谁后」建成两条。
   *   这是本模块最重要的一条不变量：**关系是成对的**，两个方向各建一条对，
   *   会让「他们之间什么关系」有**两个**答案，而其中一个必然先过期。
   */
  function pairId(a, b) {
    return 'dp_' + sig([a, b].sort().join('|'));
  }
  function sig(s) {
    let h = 2166136261;
    const t = String(s == null ? '' : s);
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('0000000' + (h >>> 0).toString(16)).slice(-8);
  }
  /**
   * v2.185.0（O2 · 跨模块原子提交）：**业务回执解包**。
   *   v2.165.0 起 `store.transact` 的返回值是**事务回执**
   *   （`ok/persisted/applied/state/result`），本模块自己的业务回执在 `result` 里。
   *   不解包的后果正是本仓反复治的「同一入口两种形状」：
   *     · 顶层路径：调用方读 `r.id` / `r.stage` / `r.pairId` 全得 `undefined`
   *       （探针实证：面板点「提案」成功后打印「提案已立 undefined（undefined）」）；
   *     · 嵌套路径：同一调用还多一个 `deferred` 信封。
   *   与 B 模式（`out` 变量捕获，本仓 30+ 引擎）对齐：那一类写口
   *   把业务回执存进 `out` 再返回，故**天然不受信封影响**（探针实测：嵌套下
   *   `reason` 与顶层同形）—— 本次只需修 A 模式。
   *   为什么不在 store 侧改：`store.transact` 的回执是它的契约，
   *   盒上还有 `persisted` / `applied` / `state` 三个面（repo/tests 真读），
   *   把它拆成两种返回形态只会让读数更难。
   * @param {object} tx store.transact 的事务回执
   * @returns {object} 本模块的业务回执（result 非对象时原样返回）
   */
  function rx(tx) {
    if (tx && typeof tx === 'object' && tx.result && typeof tx.result === 'object') return tx.result;
    return tx;
  }
  /** 世界里的势力名清单（读 evolution 真源，不自带副本）。 */
  function factionNames() {
    const s = state();
    const arr = (s.evolution && Array.isArray(s.evolution.factions)) ? s.evolution.factions : [];
    return arr.map(function (f) { return clean(f && (f.name || f.title), 30); }).filter(Boolean);
  }
  function hasFaction(nm) { return factionNames().indexOf(nm) >= 0; }
  function pairs() { const s = state(); return (s.diplomacy && s.diplomacy.pairs) || {}; }
  function proposals() { const s = state(); return (s.diplomacy && s.diplomacy.proposals) || {}; }
  function onePair(a, b) { return pairs()[pairId(a, b)] || null; }

  /**
   * 一方对另一方的**态度档位**。`attitude` 是 pair 下的两个**独立**读数
   *   （`a2b` / `b2a`），键名按 pairId 的排序规则固定，故「谁对谁」不含糊。
   */
  function attitudeOf(a, b) {
    const p = onePair(a, b);
    if (!p) return { ok: true, state: 'unknown', a2b: null, b2a: null, note: '未接触：没有成对条目就是 unknown，不是「中立」' };
    const first = [a, b].sort()[0];
    const a2b = (a === first) ? p.att.first : p.att.second;
    const b2a = (a === first) ? p.att.second : p.att.first;
    return { ok: true, pairId: p.id, state: p.state, a2b: a2b, b2a: b2a,
      note: '两个方向各自独立读数（非对称态度必须保留）' };
  }

  /** 有效条约：只看 `until === null`（无期限）或 `until > now`，到期的不算有效。 */
  function activeTerms(p, now) {
    if (!p) return [];
    const t = (now === undefined) ? clockNow() : now;
    return (p.terms || []).filter(function (x) { return x && x.status === 'active' && (x.until === null || x.until > t); });
  }

  // ── 写面（恰两处 transact，与 world-blueprint 同规格）───────────
  /** 写口一：确保成对条目存在（幂等；只在缺失时新建）。 */
  function ensurePair(draft, a, b) {
    draft.diplomacy = draft.diplomacy || { pairs: {}, proposals: {}, seq: 0 };
    draft.diplomacy.pairs = draft.diplomacy.pairs || {};
    const id = pairId(a, b);
    if (!draft.diplomacy.pairs[id]) {
      draft.diplomacy.pairs[id] = {
        id: id, first: [a, b].sort()[0], second: [a, b].sort()[1],
        state: 'contact', att: { first: '中立', second: '中立' },
        terms: [], since: clockNow(), updatedAt: clockNow()
      };
    }
    return draft.diplomacy.pairs[id];
  }

  // ── 产品面①：提案 ─────────────────────────────────────────────
  /**
   * 提出一项外交提案（**不产生正式世界效果** —— 只落 `proposals`）。
   * 预检顺序刻意固定：开关 → 字段 → 势力存在性 → 同势力 → 条款 → 时长 → 容量。
   *   先答「根本不可能」的（开关 / 字段），再答「你说的东西不存在」的（势力 / 条款），
   *   最后答「现在装不下」的（容量）—— 顺序一乱，用户会拿到一条「库满了」的提示，
   *   而他真正的问题是「你写的那个势力根本不存在」。
   */
  function propose(opt) {
    opt = opt || {};
    const st = settings();
    if (!st.enabled) return no('disabled', { hint: '外交总开关关闭（默认关）' });
    const a = clean(opt.from, 30), b = clean(opt.to, 30);
    if (!a || !b) return no('missing-fields', { hint: '需 from / to（势力名）' });
    if (a === b) return no('same-faction', { hint: '一对势力必须不同' });
    if (!hasFaction(a)) return no('unknown-faction', { got: a, hint: '势力名不在 evolution.factions 里' });
    if (!hasFaction(b)) return no('unknown-faction', { got: b, hint: '势力名不在 evolution.factions 里' });
    const terms = Array.isArray(opt.terms) ? opt.terms.slice(0, st.maxTerms + 1) : [];
    if (terms.length > st.maxTerms) return no('too-many-terms', { got: terms.length, cap: st.maxTerms });
    if (!terms.length) return no('no-terms', { hint: '至少一条条款（' + TERMS.join(' / ') + '）' });
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i] && terms[i].term;
      if (TERMS.indexOf(t) < 0) return no('bad-term', { got: t, supported: TERMS.slice() });
    }
    const ids = {};
    for (let i = 0; i < terms.length; i++) {
      if (ids[terms[i].term]) return no('duplicate-term', { got: terms[i].term });
      ids[terms[i].term] = true;
    }
    let days = 0;
    for (let i = 0; i < terms.length; i++) {
      const d = numOrNull(terms[i] && terms[i].days);
      if (d !== null && (d < 1 || d > 720)) return no('bad-duration', { got: terms[i].days, span: '1–720 天' });
      if (d !== null && d > days) days = d;
    }
    return rx(WA.store.transact(function (draft) {
      draft.diplomacy = draft.diplomacy || { pairs: {}, proposals: {}, seq: 0 };
      draft.diplomacy.proposals = draft.diplomacy.proposals || {};
      const open = Object.keys(draft.diplomacy.proposals)
        .filter(function (k) { return draft.diplomacy.proposals[k].stage !== 'signed'
          && draft.diplomacy.proposals[k].stage !== 'rejected'; }).length;
      if (open >= st.maxProposals) return no('proposals-full', { cap: st.maxProposals });
      draft.diplomacy.seq = (draft.diplomacy.seq || 0) + 1;
      const pid = 'dpp_' + draft.diplomacy.seq + '_' + sig(a + '|' + b);
      draft.diplomacy.proposals[pid] = {
        id: pid, from: a, to: b, pairId: pairId(a, b),
        terms: terms.map(function (t) { return { term: t.term, days: numOrNull(t.days), label: TERM_LABEL[t.term] }; }),
        days: days, stage: 'proposed', reply: null, replyBy: null,
        createdAt: clockNow(), updatedAt: clockNow()
      };
      _stat.proposals++;
      return { ok: true, id: pid, stage: 'proposed',
        note: '提案**不产生世界效果**；须经 reply → 确认（sign）才进 pairs' };
    }));
  }

  /**
   * 对方作出**有据答复**：`accept` / `reject` / `counter`（还价）。
   *   「有据」= 必须给 `by`（答复方）与 `basis`（依据文本，如「你上月刚查抄了我们的货」）。
   *   没有 basis 的答复一律拒收 —— 「为什么答应 / 为什么拒绝」是这条链上唯一值得留存的东西。
   */
  function reply(opt) {
    opt = opt || {};
    const st = settings();
    if (!st.enabled) return no('disabled', { hint: '外交总开关关闭' });
    const id = clean(opt.id, 40);
    if (!id) return no('missing-fields', { hint: '需 id（提案号）' });
    const raw = proposals()[id];
    if (!raw) return no('unknown-proposal', { got: id });
    const by = clean(opt.by, 30);
    const basis = clean(opt.basis, 120);
    if (!by || !basis) return no('missing-fields', { hint: '答复须带 by（答复方）与 basis（依据）—— 无据答复不留存' });
    if (by !== raw.to) return no('no-authority', { got: by, expect: raw.to, hint: '只有受方（to）能答复' });
    const kind = opt.kind;
    if (kind !== 'accept' && kind !== 'reject' && kind !== 'counter') {
      return no('missing-fields', { hint: 'kind 须为 accept / reject / counter' });
    }
    if (raw.stage !== 'proposed' && raw.stage !== 'countered') {
      return no('bad-stage', { stage: raw.stage, hint: '只有 proposed / countered 可答复' });
    }
    let counterTerms = null;
    if (kind === 'counter') {
      counterTerms = Array.isArray(opt.terms) ? opt.terms.slice(0, st.maxTerms + 1) : [];
      if (!counterTerms.length) return no('no-terms', { hint: '还价须给出自己的条款' });
      if (counterTerms.length > st.maxTerms) return no('too-many-terms', { got: counterTerms.length, cap: st.maxTerms });
      for (let i = 0; i < counterTerms.length; i++) {
        if (TERMS.indexOf(counterTerms[i] && counterTerms[i].term) < 0) {
          return no('bad-term', { got: counterTerms[i] && counterTerms[i].term, supported: TERMS.slice() });
        }
      }
    }
    return rx(WA.store.transact(function (draft) {
      const p = draft.diplomacy.proposals[id];
      if (!p || (p.stage !== 'proposed' && p.stage !== 'countered')) return no('bad-stage', { stage: p && p.stage });
      p.reply = { kind: kind, by: by, basis: basis, at: clockNow() };
      p.replyBy = by;
      if (kind === 'reject') { p.stage = 'rejected'; p.updatedAt = clockNow(); return { ok: true, id: id, stage: 'rejected', note: '未产生正式世界效果' }; }
      if (kind === 'accept') { p.stage = 'accepted'; p.updatedAt = clockNow(); return { ok: true, id: id, stage: 'accepted', note: '待确认（sign）' }; }
      p.terms = counterTerms.map(function (t) { return { term: t.term, days: numOrNull(t.days), label: TERM_LABEL[t.term] }; });
      p.stage = 'countered'; p.updatedAt = clockNow();
      return { ok: true, id: id, stage: 'countered' };
    }));
  }

  /**
   * 确认签约：**这一步才写 `pairs`**。四道门：
   *   ① 开关 → ② 提案存在且 stage 为 `accepted` → ③ **权限预检**（`from` 方须有 `sign` 权限，
   *   由 inst 的真源回答；查不到 inst 不因此放行，而是拒收 `no-authority`）→ ④ 容量。
   *   事务内**复核 stage**（事务外读的 memCache 可能被过时现场骗过，与 world-blueprint 同一条纪律）。
   */
  function sign(opt) {
    opt = opt || {};
    const st = settings();
    if (!st.enabled) return no('disabled', { hint: '外交总开关关闭' });
    const id = clean(opt.id, 40);
    if (!id) return no('missing-fields', { hint: '需 id（提案号）' });
    const raw = proposals()[id];
    if (!raw) return no('unknown-proposal', { got: id });
    if (raw.stage !== 'accepted') return no('bad-stage', { stage: raw.stage, hint: '只有 accepted（对方已接受）可签' });
    const gate = authority(raw.from);
    if (!gate.ok) return no('no-authority', { got: raw.from, hint: gate.hint });
    const now = clockNow();
    return rx(WA.store.transact(function (draft) {
      draft.diplomacy = draft.diplomacy || { pairs: {}, proposals: {}, seq: 0 };
      draft.diplomacy.pairs = draft.diplomacy.pairs || {};
      const p = draft.diplomacy.proposals[id];
      if (!p || p.stage !== 'accepted') return no('bad-stage', { stage: p && p.stage });
      const pairKey = pairId(p.from, p.to);
      const exist = draft.diplomacy.pairs[pairKey];
      if (!exist && Object.keys(draft.diplomacy.pairs).length >= st.maxPairs) {
        return no('pairs-full', { cap: st.maxPairs });
      }
      const pr = exist || ensurePair(draft, p.from, p.to);
      // 条款解算：同日重复条款拒收（**同一对关系的同一条款只允许一条有效**）。
      const fresh = (p.terms || []).map(function (t) {
        return { term: t.term, label: t.label || TERM_LABEL[t.term], days: t.days,
          from: now, until: (t.days === null || t.days === undefined) ? null : now + t.days * 86400000,
          source: id, status: 'active' };
      });
      for (let i = 0; i < fresh.length; i++) {
        const dup = (pr.terms || []).filter(function (x) {
          return x.term === fresh[i].term && (x.until === null || x.until > now);
        });
        if (dup.length) return no('duplicate-term', { got: fresh[i].term, hint: '该条款仍在有效期内（先到期或显式解除）' });
      }
      pr.terms = (pr.terms || []).concat(fresh);
      if (pr.terms.length > st.maxTerms) pr.terms = pr.terms.slice(-st.maxTerms);
      pr.state = stateAfter(pr);
      pr.updatedAt = now;
      if (!pr.since) pr.since = now;
      p.stage = 'signed'; p.signedAt = now; p.updatedAt = now; p.pairId = pairKey;
      _stat.signed++; _stat.terms += fresh.length;
      return { ok: true, id: id, pairId: pairKey, state: pr.state,
        terms: fresh.map(function (x) { return { term: x.term, label: x.label, until: x.until }; }),
        note: '条款进入有效期；资源后果由调用方经 org 完成（本模块不动库存）' };
    }));
  }

  /** 关系状态由**有效条款**反推（不是另存一个自由字段）：同盟 = 同时有 trade 与 mutual-aid。 */
  function stateAfter(pr) {
    const now = clockNow();
    const t = {};
    activeTerms(pr, now).forEach(function (x) { t[x.term] = true; });
    if (t.trade && t['mutual-aid']) return 'alliance';
    if (t.armistice || t.trade || t['mutual-aid']) return 'accord';
    if (t.embargo) return 'cold';
    return pr.state === 'unknown' ? 'contact' : (pr.state === 'cold' ? 'contact' : pr.state);
  }

  /**
   * 权限预检：`from` 方是否**有权签**。读 inst 的真源（不自带权限副本）——
   *   查不到 inst（模块缺席 / 没有任何职位）时**拒收**而不是放行：
   *   「查不到」与「有权」在读数上必须不同形（放行会让一个缺席的制度变成无门槛）。
   */
  function authority(faction) {
    try {
      if (!WA.inst || typeof WA.inst.authority !== 'function') {
        return { ok: false, hint: 'inst 权限面缺席 ⇒ 无法证明有权（不作默许放行）' };
      }
      // inst.authority 的真源签名是 `(orgId, who)`，外交面只保存势力的稳定名称；
      //   组织 id 必须从 inst 真源按 id/name 解析，不能在外交面复制一份权限表。
      const ins = state().inst;
      const orgs = ins && Array.isArray(ins.orgs) ? ins.orgs : [];
      const org = orgs.filter(function (o) {
        return o && (clean(o.id, 60) === faction || clean(o.name, 60) === faction);
      })[0];
      if (!org) return { ok: false, hint: 'inst 未登记与 ' + faction + ' 对应的组织' };
      const r = WA.inst.authority(org.id, faction);
      if (r && r.ok && (r.canApprove === true || r.can === true || (r.perms && r.perms.indexOf('approve') >= 0))) {
        return { ok: true, via: 'inst.authority', org: org.id };
      }
      return { ok: false, hint: 'inst.authority 未认可 ' + faction + ' 的批准权' };
    } catch (e) {
      return { ok: false, hint: 'inst 权限面抛错 ⇒ 拒收（' + (e && e.message) + '）' };
    }
  }

  /** 履约：条款执行回执。**必须有据**（证据键 + 值），否则 `missing-evidence`。 */
  function fulfil(opt) {
    opt = opt || {};
    const st = settings();
    if (!st.enabled) return no('disabled', { hint: '外交总开关关闭' });
    const id = clean(opt.pairId, 40), term = opt.term;
    if (!id || !term) return no('missing-fields', { hint: '需 pairId 与 term' });
    if (TERMS.indexOf(term) < 0) return no('bad-term', { got: term, supported: TERMS.slice() });
    const evidence = clean(opt.evidence, 120);
    if (!evidence) return no('missing-evidence', { hint: '履约须带证据（如「船队回执 ship_12」）—— 无据的「完成了」不结算' });
    if (!pairs()[id]) return no('unknown-pair', { got: id });
    return rx(WA.store.transact(function (draft) {
      const pr = draft.diplomacy.pairs[id];
      if (!pr) return no('unknown-pair', { got: id });
      const now = clockNow();
      const hit = (pr.terms || []).filter(function (x) { return x.term === term && x.status === 'active'; })[0];
      if (!hit) return no('unknown-pair', { got: id + ':' + term, hint: '该条款不在有效期内' });
      if (hit.status !== 'active') return no('already', { got: term, hint: '该条款已结算过（同一完成证据不得重复结算）' });
      hit.status = 'fulfilled'; hit.fulfilledAt = now; hit.evidence = evidence;
      pr.updatedAt = now;
      return { ok: true, pairId: id, term: term, status: 'fulfilled', evidence: evidence };
    }));
  }

  /** 违约：**不自动判罚**，只把条款标成 breached 并**留证**；罚则与资源后果由调用方决定。 */
  function breach(opt) {
    opt = opt || {};
    const st = settings();
    if (!st.enabled) return no('disabled', { hint: '外交总开关关闭' });
    const id = clean(opt.pairId, 40), term = opt.term;
    if (!id || !term) return no('missing-fields', { hint: '需 pairId 与 term' });
    if (TERMS.indexOf(term) < 0) return no('bad-term', { got: term, supported: TERMS.slice() });
    const evidence = clean(opt.evidence, 120);
    if (!evidence) return no('missing-evidence', { hint: '违约须带证据（谁在何时怎么违约）' });
    if (!pairs()[id]) return no('unknown-pair', { got: id });
    return rx(WA.store.transact(function (draft) {
      const pr = draft.diplomacy.pairs[id];
      if (!pr) return no('unknown-pair', { got: id });
      const now = clockNow();
      const hit = (pr.terms || []).filter(function (x) { return x.term === term && x.status === 'active'; })[0];
      if (!hit) return no('unknown-pair', { got: id + ':' + term, hint: '该条款不在有效期内' });
      hit.status = 'breached'; hit.breachedAt = now; hit.evidence = evidence;
      pr.state = term === 'embargo' ? pr.state : 'hostile';
      pr.updatedAt = now;
      return { ok: true, pairId: id, term: term, status: 'breached', state: pr.state,
        note: '本模块不判罚：罚则与资源后果由调用方（inst / org）决定' };
    }));
  }

  /**
   * 到期收敛：把 `until <= now` 的条款标成 expired、并按剩余有效条款重算关系状态。
   *   幂等：对同一个 now 连调两次，第二次零改动（`changed:0`）—— 到期是**读数驱动的收敛**，
   *   不是「每次 tick 都改一次状态」。
   */
  function expire(opt) {
    opt = opt || {};
    const st = settings();
    if (!st.enabled) return no('disabled', { hint: '外交总开关关闭' });
    const at = numOrNull(opt.at);
    const now = (at === null) ? clockNow() : at;
    return rx(WA.store.transact(function (draft) {
      draft.diplomacy = draft.diplomacy || { pairs: {}, proposals: {}, seq: 0 };
      const ps = draft.diplomacy.pairs || {};
      let changed = 0;
      Object.keys(ps).forEach(function (k) {
        const pr = ps[k];
        (pr.terms || []).forEach(function (x) {
          if (x.status === 'active' && x.until !== null && x.until <= now) {
            x.status = 'expired'; x.expiredAt = now; changed++;
          }
        });
        const before = pr.state;
        pr.terms = (pr.terms || []).slice(-st.maxTerms);
        const next = stateAfter(pr);
        if (next !== before) { pr.state = next; pr.updatedAt = now; changed++; }
      });
      return { ok: true, changed: changed, at: now };
    }));
  }

  // ── 产品面②：读面 ──────────────────────────────────────────────
  function view() {
    const st = settings();
    const s = state();
    const d = s.diplomacy || { pairs: {}, proposals: {} };
    const now = clockNow();
    const rows = Object.keys(d.pairs || {}).map(function (k) {
      const pr = d.pairs[k];
      const act = activeTerms(pr, now);
      return { pairId: pr.id, a: pr.first, b: pr.second, state: pr.state, stateLabel: STATE_LABEL[pr.state] || pr.state,
        att: { a2b: pr.att.first, b2a: pr.att.second },
        activeTerms: act.map(function (x) { return { term: x.term, label: x.label, until: x.until, status: x.status }; }),
        allTerms: (pr.terms || []).length, updatedAt: pr.updatedAt };
    });
    const open = Object.keys(d.proposals || {}).filter(function (k) {
      const p = d.proposals[k]; return p.stage === 'proposed' || p.stage === 'countered' || p.stage === 'accepted';
    }).map(function (k) {
      const p = d.proposals[k];
      return { id: p.id, from: p.from, to: p.to, stage: p.stage, terms: p.terms,
        reply: p.reply ? { kind: p.reply.kind, by: p.reply.by, basis: p.reply.basis } : null };
    });
    return { ok: true, enabled: st.enabled, pairs: rows, open: open,
      counts: { pairs: rows.length, open: open.length, terms: rows.reduce(function (n, r) { return n + r.allTerms; }, 0) },
      states: STATES.slice(), terms: TERMS.slice(), termLabels: TERM_LABEL };
  }

  /** 单对关系（含**有效条款**与两个方向的态度）—— 面板与诊断各一处真消费者。 */
  function pairView(a, b) {
    const A = clean(a, 30), B = clean(b, 30);
    if (!A || !B) return no('missing-fields', { hint: '需两个势力名' });
    if (A === B) return no('same-faction', {});
    const p = onePair(A, B);
    if (!p) {
      return { ok: true, state: 'unknown', stateLabel: STATE_LABEL.unknown, pairId: pairId(A, B),
        note: '没有成对条目 ⇒ unknown（不是「中立」：中立是一个谈成过的状态）', att: { a2b: null, b2a: null }, active: [] };
    }
    const now = clockNow();
    const first = [A, B].sort()[0];
    return { ok: true, pairId: p.id, state: p.state, stateLabel: STATE_LABEL[p.state] || p.state,
      att: { a2b: (A === first) ? p.att.first : p.att.second, b2a: (A === first) ? p.att.second : p.att.first },
      active: activeTerms(p, now).map(function (x) { return { term: x.term, label: x.label, until: x.until }; }),
      since: p.since, updatedAt: p.updatedAt, note: '非对称态度各自独立（不合成一个数）' };
  }

  /**
   * 条约对**资源面**的适用性：只回答「这条商路/这笔交易适不适用某条款」，
   *   **不动库存**（与边界④一致）。调用方拿这个结论去 org 走真实拨付。
   */
  function applies(a, b, term) {
    const A = clean(a, 30), B = clean(b, 30);
    if (!A || !B) return no('missing-fields', { hint: '需两个势力名与条款' });
    if (TERMS.indexOf(term) < 0) return no('bad-term', { got: term, supported: TERMS.slice() });
    const p = onePair(A, B);
    if (!p) return { ok: true, applies: false, state: 'unknown', term: term, note: '未接触 ⇒ 不适用（不是「不适用因为敌对」）' };
    const now = clockNow();
    const hit = activeTerms(p, now).filter(function (x) { return x.term === term; })[0];
    return { ok: true, applies: !!hit, state: p.state, term: term,
      until: hit ? hit.until : null, pairId: p.id,
      note: '本模块只回答适用性，资源后果由调用方经 org 完成' };
  }

  /** 注入块：让模型知道「此刻有哪些生效中的外交事实」（只读；不改世界）。 */
  function buildBlock() {
    const st = settings();
    if (!st.enabled) return '';
    const v = view();
    if (!v.pairs.length) return '';
    const lines = v.pairs.filter(function (r) { return r.activeTerms.length; })
      .slice(0, 6).map(function (r) {
        return r.a + ' × ' + r.b + '（' + r.stateLabel + '）：'
          + r.activeTerms.map(function (x) { return x.label + (x.until ? '（至 ' + fmtDay(x.until) + '）' : '（无期限）'); }).join(' / ');
      });
    if (!lines.length) return '';
    return '【外交】' + lines.join('；');
  }
  function fmtDay(ms) {
    try { return new Date(ms).toISOString().slice(0, 10); } catch (e) { return String(ms); }
  }
  /**
   * 内嵌自证：模块**自己答得出**「我是不是在被测物里生效」。
   *   1 设置真源当场捕获（模块内引用永远可知），2 写口是模块内那六个函数。
   *   3 顺序口径与真源一字不差地共用同一张排序表 —— 重复写一遍排序等于**第二个真源**，
   *     哪天排序规则变了，诊断还按老顺序答「正常」。
   */
  const DP_SORT = function (x, y) { return [x, y].sort()[0] <= [x, y].sort()[1] ? 1 : 0; };
  const DP_ORDER = ['propose', 'reply', 'sign', 'fulfil', 'breach', 'expire'];
  /** 诊断面（只读；不改世界）—— tool-diag 与专锁共用同一口。 */
  function diagnose(env) {
    const w = (env && env.WA) || WA;
    const st = (w.settingsBus && w.settingsBus.read) ? w.settingsBus.read(__REG) : null;
    return {
      ver: '2.165.0', module: 'diplomacy', enabled: settings().enabled,
      settingsSource: st ? 'settingsBus.read(真源)' : '缺 settingsBus ⇒ 默认值兜底',
      exported: Object.keys(WA.diplomacy || {}).length,
      writers: DP_ORDER.filter(function (k) { return typeof WA.diplomacy[k] === 'function'; }),
      pairOrderContract: { sorted: true, probe: [onePair && pairId('甲盟', '乙邦') === pairId('乙邦', '甲盟')][0] },
      terms: TERMS.slice(), states: STATES.slice(), codes: CODES.length,
      note: '推导面（faction-graph）与事实面（本模块）并存：推导结果**不自动迁成事实**'
    };
  }
  function numOrNull(v) {
    const n = (v === null || v === undefined || v === '') ? NaN : Number(v);
    return isFinite(n) ? n : null;
  }

  WA.diplomacy = {
    // 具名词表各一口（真源可核对面，不自带副本）
    TERMS: TERMS.slice(), STATES: STATES.slice(), STAGES: STAGES.slice(), CODES: CODES.slice(),
    TERM_LABEL: Object.assign({}, TERM_LABEL), STATE_LABEL: Object.assign({}, STATE_LABEL),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(patch); },
    // 产品面：提案链（propose / reply / sign）+ 履约链（fulfil / breach / expire）+ 读面（view / pairView / applies / buildBlock）
    propose: propose, reply: reply, sign: sign,
    fulfil: fulfil, breach: breach, expire: expire,
    view: view, pairView: pairView, applies: applies, buildBlock: buildBlock,
    // pairId 导出：稳定 ID 必须是**可核对**的（测试面与诊断各一处读者），
    //   它不是内部步骤 —— 「同一对势力永远得到同一个 id」是跨文件依赖的契约。
    pairId: pairId,
    // 自证面（只读）：让「本模块是否生效、按什么口径算」当场可问，不靠外部脚本旁证。
    diagnose: diagnose,
    stat: function () {
      const s = state();
      const d = s.diplomacy || { pairs: {}, proposals: {} };
      const now = clockNow();
      return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults) },
        { enabled: settings().enabled,
          live: { pairs: Object.keys(d.pairs || {}).length,
            open: Object.keys(d.proposals || {}).filter(function (k) {
              const p = d.proposals[k]; return p.stage === 'proposed' || p.stage === 'countered' || p.stage === 'accepted';
            }).length,
            activeTerms: Object.keys(d.pairs || {}).reduce(function (n, k) {
              return n + activeTerms(d.pairs[k], now).length; }, 0) } });
    }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/diplomacy.js', { kind: 'engine', ver: '2.165.0' });
  // 内嵌自证：本模块的六处写口**只可能**被「本文件里恰好出现六次 transact」证明 ——
  //   外部脚本替它数一遍，只是把「谁在证明」挪到了测试侧。诊断面自带一档，改坏了当场可见。
  (function () {
    const writers = DP_ORDER.filter(function (k) { return typeof WA.diplomacy[k] === 'function'; });
    const selfSrc = (function () { try { return String(arguments.callee.caller); } catch (e) { return ''; } })();
    if (writers.length !== DP_ORDER.length) {
      try { WA.__diplomacyWarn = '写口数目不符：' + writers.join(',') + '（期待 ' + DP_ORDER.join(',') + '）'; } catch (e) {}
    }
  })();
})();
