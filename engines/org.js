/**
 * WorldAxis engines/org.js (v2.54.0)
 * 资源与组织：势力资源库存、人物持有、条件式转移。
 *
 * 边界：
 *   1 总开关默认关闭；关闭时不结算、不注入。
 *   2 只记已存在的势力或人物，不凭空创建组织。
 *   3 资源不足时拒绝转移，不把负数伪装成成功。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_org_settings_v1';
  const DEF = { enabled: false, maxItems: 3 };
  const __REG = { key: LS_KEY, def: DEF, module: 'org', bounds: { maxItems: [1, 6] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) { return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))); }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { grants: 0, transfers: 0, blocked: 0, assigns: 0, credits: 0,
    promotions: 0, payrolls: 0, penalties: 0, lastReason: '' };
  // ── v2.92.0（O5）：资源流水（观测面，**不参与判定**）──────────
  // 为什么需要它：本模块此前只有**累计计数**（grants / transfers / blocked），
  //   于是「某笔交易之后存量 = 存量 ± 流量」这句话在此之前**不可判定**——
  //   计数只知道发生了多少次，不知道每一次的前后值。库存被写坏时账上一切正常。
  // 三条口径：
  //   ① 只记**成功**的交易：失败的不是流量（被拒的转移只增 blocked 计数）。
  //   ② 流水**驻内存**（与 causal 磁带同口径：不落盘、不注入正文），环形上限
  //      JOURNAL_CAP，**挤出即记账**（dropped++）——静默丢弃不是可接受的默认值。
  //   ③ 记录**不得影响判定**：noteJournal 全程 try 包裹，grant / transfer 的
  //      返回值与既有 stat 语义一字不变（观测不得改变被观测行为）。
  const JOURNAL_CAP = 200;
  // ── v2.94.0（O6）：流水导出 / 存档点（跨会话可查，**显式触发不自动落盘**）──
  // 为什么需要它：v2.92.0 的流水只驻内存（与 causal 磁带同口径），于是「上一节会话里
  //   那笔之后存量对不对」跨会话不可判定；reconcile 在环形挤出后只能核对**带内**。
  // 三条口径：
  //   ① **不自动落盘**：落盘由用户显式调用 exportJournal() 触发——自动落盘会把
  //      观测面变成隐式写盘面（且每次交易都写一次 localStorage 是性能陷阱）。
  //   ② 导出带 **format / version / cap** 三元头：读的人能判「这是哪一版的流水」
  //      与「这一卷是不是被截断过」（dropped 照实带出，不假装完整）。
  //   ③ 导出是**纯读**：不挤出、不清空、不改 stat、不改 journalStat（观测不得
  //      改变被观测对象）；导入是**显式**动作，且只接受同 format 的卷。
  const JOURNAL_FORMAT = 'worldaxis.org.journal';
  const JOURNAL_FORMAT_VERSION = 1;
  function exportJournal() {
    try {
      return {
        ok: true, format: JOURNAL_FORMAT, formatVersion: JOURNAL_FORMAT_VERSION,
        cap: JOURNAL_CAP, entries: journal.length,
        recorded: journalStat.recorded, dropped: journalStat.dropped,
        // dropped > 0 ⇒ 本卷只含**带内**流水，链首无上游可核——照实带出不假装完整。
        truncated: journalStat.dropped > 0,
        savedAt: clockNow('org'), rows: journal.slice()
      };
    } catch (e) { return { ok: false, reason: 'export-throw' }; }
  }
  /** 校验一卷外来的流水（不导入、不写盘）——读的人先知道这卷能不能用。 */
  function inspectJournal(vol) {
    if (!vol || typeof vol !== 'object') return { ok: false, reason: 'bad-volume' };
    if (vol.format !== JOURNAL_FORMAT) return { ok: false, reason: 'bad-format', want: JOURNAL_FORMAT, got: vol.format };
    if (vol.formatVersion !== JOURNAL_FORMAT_VERSION) return { ok: false, reason: 'bad-version', want: JOURNAL_FORMAT_VERSION, got: vol.formatVersion };
    if (!Array.isArray(vol.rows)) return { ok: false, reason: 'bad-rows' };
    return { ok: true, format: JOURNAL_FORMAT, formatVersion: JOURNAL_FORMAT_VERSION,
      entries: vol.rows.length, truncated: !!vol.truncated, savedAt: vol.savedAt || 0 };
  }
  /** 带外对账：把一卷外来流水与本侧当前存量比对（**不改本侧 journal**）。
   *  「带外」= 本侧环形已挤出的那些笔，只有外来卷才核得到——这正是跨会话可查的意义。 */
  function reconcileWith(vol) {
    const ins = inspectJournal(vol);
    if (!ins.ok) return ins;
    const last = {}; const kOf = function (kind, name, resource) { return kind + '|' + name + '|' + resource; };
    const breaks = [];
    vol.rows.forEach(function (r, i) {
      if (!r || typeof r !== 'object') return;
      const sides = [['to', r.toKind, r.toName, r.toBefore, r.toAfter]];
      if (r.op === 'transfer') sides.push(['from', r.fromKind, r.fromName, r.fromBefore, r.fromAfter]);
      sides.forEach(function (side) {
        const k = kOf(side[1], side[2], r.resource), before = side[3], after = side[4];
        if (Object.prototype.hasOwnProperty.call(last, k) && typeof before === 'number' && before !== last[k]) {
          breaks.push({ i: i, why: 'chain', key: k, expect: last[k], got: before });
        }
        last[k] = after;
      });
    });
    stockBreakOf(last, breaks, null);
    return { ok: breaks.length === 0, checked: vol.rows.length, breakCount: breaks.length,
      breaks: breaks.slice(0, 20), truncated: !!vol.truncated, savedAt: vol.savedAt || 0 };
  }
  const journal = [];
  const journalStat = { recorded: 0, dropped: 0 };
  function noteJournal(row) {
    try {
      if (!row) return;
      journal.push(row);
      journalStat.recorded++;
      while (journal.length > JOURNAL_CAP) { journal.shift(); journalStat.dropped++; }
    } catch (e) {}
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 40); }
  function qty(v) { const n = Number(v); return isFinite(n) && n > 0 ? Math.min(9999, Math.floor(n)) : 0; }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function holder(kind, name, root) {
    const st = root || state();
    if (kind === 'faction') {
      const key = clean(name, 40);
      return (((st.evolution || {}).factions) || []).filter(function (f) { return f && clean(f.name, 40) === key; })[0] || null;
    }
    if (kind !== 'person') return null;
    const key = clean(name, 60); if (!key) return null;
    const people = st.people || {};
    if (people[key]) return people[key];
    const id = key.indexOf('p_') === 0 ? key : ('p_' + key);
    return people[id] || null;
  }
  function stockOf(row) { return row && row.resources && typeof row.resources === 'object' && !Array.isArray(row.resources) ? row.resources : {}; }
  function grant(kind, name, item, amount) {
    const resource = clean(item, 30), n = qty(amount);
    if (!resource || !n) return { ok: false, reason: 'bad-resource' };
    if (!holder(kind, name)) return { ok: false, reason: 'missing-holder' };
    let out = null, pending = null;
    WA.store.transact(function (draft) {
      const row = holder(kind, name, draft);
      if (!row) { out = { ok: false, reason: 'missing-holder' }; return false; }
      row.resources = stockOf(row);
      const before = qty(row.resources[resource]) || 0;
      row.resources[resource] = before + n;
      row.updatedAt = clockNow('org');
      pending = { op: 'grant', resource: resource, amount: n, toKind: kind, toName: clean(name, 60), toBefore: before, toAfter: row.resources[resource] };
      out = { ok: true, id: resource, amount: row.resources[resource] };
    }, 'org:grant');
    if (out && out.ok) { stat.grants++; stat.lastReason = 'granted'; noteJournal(pending); } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function transfer(fromKind, fromName, toKind, toName, item, amount) {
    const resource = clean(item, 30), n = qty(amount);
    if (!resource || !n) return { ok: false, reason: 'bad-resource' };
    const from = holder(fromKind, fromName), to = holder(toKind, toName);
    if (!from || !to || (fromKind === toKind && clean(fromName, 60) === clean(toName, 60))) return { ok: false, reason: 'missing-holder' };
    if ((stockOf(from)[resource] || 0) < n) { stat.blocked++; stat.lastReason = 'insufficient'; return { ok: false, reason: 'insufficient' }; }
    let out = null, pending = null;
    WA.store.transact(function (draft) {
      const a = holder(fromKind, fromName, draft), b = holder(toKind, toName, draft);
      if (!a || !b) { out = { ok: false, reason: 'missing-holder' }; return false; }
      a.resources = stockOf(a); b.resources = stockOf(b);
      if ((a.resources[resource] || 0) < n) { out = { ok: false, reason: 'insufficient' }; return false; }
      const fromBefore = qty(a.resources[resource]) || 0, toBefore = qty(b.resources[resource]) || 0;
      a.resources[resource] = fromBefore - n; b.resources[resource] = toBefore + n;
      pending = { op: 'transfer', resource: resource, amount: n,
        fromKind: fromKind, fromName: clean(fromName, 60), fromBefore: fromBefore, fromAfter: fromBefore - n,
        toKind: toKind, toName: clean(toName, 60), toBefore: toBefore, toAfter: toBefore + n };
      if (!a.resources[resource]) delete a.resources[resource];
      out = { ok: true, id: resource, amount: n };
    }, 'org:transfer');
    if (out && out.ok) { stat.transfers++; stat.lastReason = 'transferred'; noteJournal(pending); } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function canAfford(kind, name, item, amount) {
    const row = holder(kind, name); if (!row) return false;
    return (stockOf(row)[clean(item, 30)] || 0) >= qty(amount);
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const lines = [];
    ((state().evolution || {}).factions || []).forEach(function (f) {
      const keys = Object.keys(stockOf(f)).slice(0, cfg.maxItems);
      if (keys.length) lines.push(f.name + '：' + keys.map(function (k) { return k + stockOf(f)[k]; }).join('、'));
    });
    Object.values(state().people || {}).slice(0, cfg.maxItems).forEach(function (p) {
      const keys = Object.keys(stockOf(p)).slice(0, cfg.maxItems);
      if (keys.length) lines.push(p.name + '：' + keys.map(function (k) { return k + stockOf(p)[k]; }).join('、'));
    });

    // v2.117.0（计划二 B5）：共同项目与欠账——**同一条注入面**追加两段。
    //   为什么不能另开一条通道：「组织在办什么」与「组织有什么」是同一件事的两面，
    //   分开会让模型看到「会：粮30」却不知道这 30 是留着做什么的。
    //   只报未结项的项目（已结项的是历史，历史不占注入预算）；欠账只报有欠的、逐条带原因。
    const projLines = [];
    (((state().evolution || {}).factions) || []).forEach(function (f) {
      if (!f || projLines.length >= 4) return;
      projectRows(f).forEach(function (p) {
        if (!p || projLines.length >= 4) return;
        if (!isLive(p)) return;
        const tl = tierLine(p);
        const cov = coverageOf(f, p);
        // 两档分述：记了刻数的报「已备/需备」，只记了档位词的报词并注明**不计缺口**。
        const spec = cov.filter(function (x) { return x.need !== null; });
        const narr = cov.filter(function (x) { return x.need === null; });
        projLines.push(clean(f.name, 40) + '「' + clean(p.what, 60) + '」' + (p.status === 'ongoing' ? '进行中' : '待办')
          + (spec.length ? '：' + spec.map(function (x) { return x.item + ' ' + x.covered + '/' + x.need; }).join('、') : '')
          + (narr.length ? '；' + narr.map(function (x) { return x.item + ' ' + (x.tierWord || '未记数量'); }).join('、')
            + '（未记数量，不计缺口）' : '')
          + (spec.some(function (x) { return x.gap > 0; }) ? '（尚缺 '
            + spec.filter(function (x) { return x.gap > 0; }).map(function (x) { return x.item + x.gap; }).join('、') + '）'
            : (spec.length ? '（备齐）' : ''))
          + (tl.tier === 'narrative' ? '〔' + tl.words.join('、') + '〕' : ''));
      });
    });
    const debtLines = [];
    const stNow = state();
    (((stNow.evolution || {}).factions) || []).forEach(function (f) {
      if (!f) return;
      const rs = rosterOf(f);
      Object.keys(rs).sort().forEach(function (p) {
        if (debtLines.length >= 5) return;
        const amt = typeof rs[p].owed === 'number' ? rs[p].owed : 0;
        if (amt > 0) debtLines.push(clean(f.name, 40) + ' 欠 ' + p + ' ' + clean(rs[p].owedItem || '粮', 30) + '×' + amt + '（薪俸未清）');
      });
    });
    Object.keys(stNow.people || {}).forEach(function (pid) {
      const per = stNow.people[pid];
      if (!per || debtLines.length >= 5) return;
      (Array.isArray(per.debts) ? per.debts : []).forEach(function (d) {
        if (debtLines.length >= 5) return;
        if (d && (qty(d.amount) || 0) > 0) {
          debtLines.push(clean(per.name || pid, 60) + ' 欠 ' + clean(d.to, 40) + ' '
            + clean(d.item, 30) + '×' + (qty(d.amount) || 0) + (d.why ? '（' + clean(d.why, 80) + '）' : ''));
        }
      });
    });
    if (projLines.length) lines.push('共同项目：' + projLines.join('；'));
    if (debtLines.length) lines.push('欠账：' + debtLines.join('；'));
    if (projLines.length || debtLines.length) lines.push('项目缺料就照实说缺、照实算缺口；已结项的事不因进度重算而消失。');
    return lines.length ? '[资源与组织]\n' + lines.slice(0, cfg.maxItems + 2).join('\n') + '\n资源不足时不得完成转移或消耗；不得凭空增加库存。' : '';
  }
  // ── v2.95.0（X2 · B3）：经济引擎——职册 / 功簿 / 薪俸 / 欠薪 / 罚没 ──────────
  // 治的病：本模块从 v2.54.0 起只有**库存**（谁持有多少资源）与**累计计数**，没有**组织**——
  //   没有人有职位、没有人领薪、没有人欠债、没有人因功晋升或受过。于是「资源驱动组织行动」
  //   这句话在本仓库**无法表达**：库存在动，组织不动；v2.94.0 的经济风也只是个读数
  //   （climateOf），不影响任何人拿到什么。
  //
  // 三条口径：
  //   ① **不新造写通道**：薪俸 / 补发 / 罚没一律复用 transfer（→ 自动接上 O5 逐笔流水、
  //      O6 流水卷与带外对账、O7 异常笔与健康分）。同一本账，没有影子账——自开一条
  //      「直接改库存」的捷径会让流水与存量当场分叉，而分叉正是 O5 存在的理由。
  //   ② **两档同账不同词**：同一个 TIDE 倍率在精确档给 `mul`（1.25 / 1 / 0.75 / 0.6）、
  //      在叙事档给词（宽裕 / 如常 / 紧绌 / 朝不保夕）。词是**解释**不是另一套数字；
  //      经济风不可读时两档都**不给**（`known:false` / `word:null` / `mul:1`）——
  //      「不知道」不能借用「如常」这张脸（承 O8 的不回落）。
  //   ③ **欠就是欠**：库存不足时不假装发得出——记进名册的 `owed` 并报 `partial` /
  //      `insufficient`，绝不静默减半、绝不跳过。跳过会让「发过薪」与「没发薪」长得一样，
  //      而欠薪能烂在账里没人知道，正是因为它看起来和「按时发了」一样干净。
  const ROLES = [
    { id: 'novice', name: '帮闲', pay: 2, need: 0 },
    { id: 'member', name: '管事', pay: 5, need: 12 },
    { id: 'steward', name: '主事', pay: 12, need: 40 },
    { id: 'chief', name: '当家', pay: 30, need: 120 }
  ];
  const ROLE_IDS = ROLES.map(function (r) { return r.id; });
  // 经济风倍率与词表**只此一份**（climateOf 只报气候词，不报倍率）。两处各写一份倍率的那天，
  //   气候变了薪俸不跟着变，而账面看不出是谁没跟上。
  const TIDE = { 繁荣: 1.25, 平稳: 1, 衰退: 0.75, 动荡: 0.6 };
  const TIDE_WORD = { 繁荣: '宽裕', 平稳: '如常', 衰退: '紧绌', 动荡: '朝不保夕' };
  // 一期直接发**一份职阶工钱**（pay 就是「每期发多少单位资源」，新手 2 / 当家 30）。
  //   不引入「工分当量」这类换算系数：换算系数会把倍率摊成不到一个单位的小数，
  //   再被整数下限兜住——账面看似正常，而**经济风实际没影响任何人拿到多少**
  //   （本版实测踩到：pay 2 / 系数 20 ⇒ 四档气候下应付恒为最小 1）。
  function roleOf(id) {
    const key = clean(id, 20);
    return ROLES.filter(function (r) { return r.id === key || r.name === key; })[0] || null;
  }
  /** 当前经济风：精确档（mul）+ 叙事档（word）+ 可读性（known/reason）。**纯读**。 */
  function tideOf() {
    const c = climateOf();
    const climate = c.available ? c.climate : null;
    const mul = (c.available && typeof TIDE[climate] === 'number') ? TIDE[climate] : 1;
    const word = (c.available && TIDE_WORD[climate]) ? TIDE_WORD[climate] : null;
    return { known: !!(c.available && word), reason: c.reason, climate: climate, mul: mul, word: word,
      recognized: !!c.recognized };
  }
  /** 职册：挂在**势力**上（`faction.roster`）——势力是雇主，人是成员。人物持有的是他自己的资源，
   *  名册记的是「谁在这个组织里、担什么职、欠着什么数」——两件事不能混成一件。 */
  function rosterOf(row) {
    const r = row && row.roster;
    return (r && typeof r === 'object' && !Array.isArray(r)) ? r : {};
  }
  /** 一期的应付：`fine` 是精确档（到 0.05），`pay` 是要过的账（整数，最小 1——付 0 不叫发薪）。 */
  function dueOf(role, cycles, mul) {
    const rs = cycles > 0 ? cycles : 1;
    const m = (typeof mul === 'number' && mul > 0) ? mul : 1;
    const fine = Math.max(0.1, Math.round((role.pay * rs * m) * 20) / 20);
    return { fine: fine, pay: Math.max(1, Math.round(fine)) };
  }
  /** 名册全量（内部面，不导出）：逐人把职阶 / 贡献 / 欠薪 / 下一阶门槛 / 本期应付一次算齐。
   *  全量而非截断——payroll 靠它逐人发，截断会让名册超过显示上限的人**静默失业**。 */
  function membersOf(row) {
    const rs = rosterOf(row);
    const tide = tideOf();
    return Object.keys(rs).sort().map(function (k) {
      const rec = rs[k] || {};
      const role = roleOf(rec.role) || ROLES[0];
      const idx = ROLE_IDS.indexOf(role.id);
      const next = ROLES[idx + 1] || null;
      const contrib = typeof rec.contrib === 'number' ? rec.contrib : 0;
      const due = dueOf(role, 1, tide.mul);
      return { name: k, role: role.id, roleName: role.name, pay: role.pay, contrib: contrib,
        owed: typeof rec.owed === 'number' ? rec.owed : 0, owedItem: rec.owedItem || '',
        fined: typeof rec.fined === 'number' ? rec.fined : 0,
        next: next ? next.id : null, need: next ? next.need : null, ready: !!(next && contrib >= next.need),
        fine: due.fine, due: due.pay, hiredAt: rec.hiredAt || 0 };
    });
  }
  /** 欠薪写口（内部面，不导出）：`value` 是**绝对值**——发薪要「累加欠额」时先读再加，
   *  补发要「把余额改小」时直接给。两个语义走同一个口，账面才只有一处真源。 */
  function writeOwed(f, name, value, item) {
    try {
      WA.store.transact(function (draft) {
        const row = holder('faction', f, draft);
        if (!row || !row.roster || !row.roster[name]) return false;
        const rec = row.roster[name];
        rec.owed = Math.max(0, Math.floor(value) || 0);
        if (item) rec.owedItem = clean(item, 30);
        rec.updatedAt = clockNow('org');
      }, 'org:owed');
    } catch (e) {}
  }
  /** 编入名册 / 改任：同一个人重复编入 = **改职**，不叠加——「本来就是他」与「刚收进来」
   *  必须可区分（否则一次改任读起来像一次招聘）。 */
  function assignRole(factionName, personName, roleId) {
    const f = clean(factionName, 40), p = clean(personName, 60), role = roleOf(roleId);
    if (!f || !p) return { ok: false, reason: 'bad-name' };
    if (!role) return { ok: false, reason: 'bad-role', want: ROLE_IDS.slice() };
    if (!holder('faction', f)) return { ok: false, reason: 'missing-holder' };
    let out = null;
    WA.store.transact(function (draft) {
      const row = holder('faction', f, draft);
      if (!row) { out = { ok: false, reason: 'missing-holder' }; return false; }
      if (!row.roster || typeof row.roster !== 'object' || Array.isArray(row.roster)) row.roster = {};
      const old = row.roster[p];
      const rec = old || { contrib: 0, owed: 0, owedItem: '', fined: 0, hiredAt: clockNow('org') };
      rec.role = role.id;
      if (typeof rec.contrib !== 'number') rec.contrib = 0;
      if (typeof rec.owed !== 'number') rec.owed = 0;
      rec.updatedAt = clockNow('org');
      row.roster[p] = rec;
      out = { ok: true, id: p, faction: f, role: role.id, roleName: role.name, pay: role.pay,
        changed: !!old, count: Object.keys(row.roster).length };
    }, 'org:assign');
    if (out && out.ok) { stat.assigns++; stat.lastReason = 'assigned'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 记功：只记**在册者**——给一个不在册的人记功，等于承认「名册」这件事不存在。
   *  单次上限 99：功簿是累计履历，不是一次性灌满的门票。 */
  function creditWork(factionName, personName, amount) {
    const f = clean(factionName, 40), p = clean(personName, 60), n = qty(amount);
    if (!f || !p) return { ok: false, reason: 'bad-name' };
    if (!n) return { ok: false, reason: 'bad-amount' };
    if (!holder('faction', f)) return { ok: false, reason: 'missing-holder' };
    let out = null;
    WA.store.transact(function (draft) {
      const row = holder('faction', f, draft);
      if (!row) { out = { ok: false, reason: 'missing-holder' }; return false; }
      // 功簿只记在册者：不在册就谈不上「他为这个组织做了什么」。
      const rec = rosterOf(row)[p];
      if (!rec) { out = { ok: false, reason: 'not-on-roster' }; return false; }
      const before = typeof rec.contrib === 'number' ? rec.contrib : 0;
      rec.contrib = Math.min(9999, before + Math.min(99, n));
      rec.updatedAt = clockNow('org');
      const role = roleOf(rec.role) || ROLES[0];
      const next = ROLES[ROLE_IDS.indexOf(role.id) + 1] || null;
      // ready = 「够格了」，但**不自动晋升**：晋升是显式决策，不是记账的副作用——
      //   自动晋升会让「谁做主的」从账上消失。
      out = { ok: true, id: p, faction: f, contrib: rec.contrib, plus: rec.contrib - before,
        role: role.id, need: next ? next.need : null, ready: !!(next && rec.contrib >= next.need) };
    }, 'org:credit');
    if (out && out.ok) { stat.credits++; stat.lastReason = 'credited'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 晋升：贡献够门槛才升一阶。**门槛不达标就照实报差多少**，不四舍五入、不「看表现」。 */
  function promote(factionName, personName) {
    const f = clean(factionName, 40), p = clean(personName, 60);
    if (!f || !p) return { ok: false, reason: 'bad-name' };
    if (!holder('faction', f)) return { ok: false, reason: 'missing-holder' };
    let out = null;
    WA.store.transact(function (draft) {
      const row = holder('faction', f, draft);
      if (!row) { out = { ok: false, reason: 'missing-holder' }; return false; }
      const rec = rosterOf(row)[p];
      if (!rec) { out = { ok: false, reason: 'not-on-roster' }; return false; }
      const from = roleOf(rec.role) || ROLES[0];
      const to = ROLES[ROLE_IDS.indexOf(from.id) + 1] || null;
      if (!to) { out = { ok: false, reason: 'top-role', role: from.id }; return false; }
      const contrib = typeof rec.contrib === 'number' ? rec.contrib : 0;
      if (contrib < to.need) { out = { ok: false, reason: 'insufficient-contrib', need: to.need, have: contrib }; return false; }
      rec.role = to.id;
      rec.updatedAt = clockNow('org');
      out = { ok: true, id: p, faction: f, from: from.id, fromName: from.name, to: to.id,
        toName: to.name, pay: to.pay, contrib: contrib };
    }, 'org:promote');
    if (out && out.ok) { stat.promotions++; stat.lastReason = 'promoted'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 名册读数：逐人职阶 / 贡献 / 欠薪 / 下一阶门槛 / 本期应付 + 势力库存 + 当前经济风。**纯读**。 */
  function rosterView(factionName) {
    const f = clean(factionName, 40);
    const row = f ? holder('faction', f) : null;
    if (!row) return { ok: false, reason: 'missing-holder' };
    const mem = membersOf(row).sort(function (a, b) { return b.contrib - a.contrib || (a.name < b.name ? -1 : 1); });
    return { ok: true, faction: f, tide: tideOf(), count: mem.length,
      members: mem.slice(0, 30), owed: mem.reduce(function (a, b) { return a + b.owed; }, 0),
      stock: stockOf(row) };
  }
  /** 发薪：逐人把本期应付从势力转给本人。**走 transfer**——同一支笔，于是这一笔自动进流水、
   *  自动被带外对账核、异常时自动进健康分（口径①：没有影子账）。
   *  `ok` 答「流程跑完了没有」，`settled` 答「从此不欠谁了吗」——两者必须分开：
   *  流程跑完而全员欠薪，是最坏也最容易被读成成功的一种结局。 */
  function payroll(factionName, opts) {
    const f = clean(factionName, 40);
    const o = opts || {};
    const item = clean(o.item || '粮', 30);
    const cycles = qty(o.cycle) || 1;
    if (!f) return { ok: false, reason: 'bad-name' };
    if (!item) return { ok: false, reason: 'bad-resource' };
    const row = holder('faction', f);
    if (!row) return { ok: false, reason: 'missing-holder' };
    // 发薪顺序**显式规定**为职阶从低到高（同阶按名字）：不规定的话，「钱不够时谁被欠」
    //   会由名字的字典序决定——账面照样可复现，但业务上不可解释（没人能回答为什么是他）。
    const mem = membersOf(row).sort(function (a, b) {
      return ROLE_IDS.indexOf(a.role) - ROLE_IDS.indexOf(b.role) || (a.name < b.name ? -1 : 1);
    });
    if (!mem.length) return { ok: false, reason: 'empty-roster' };
    const tide = tideOf();
    const lines = [], failed = [], owed = [];
    let paidTotal = 0, owedTotal = 0;
    mem.forEach(function (m) {
      const due = dueOf({ pay: m.pay }, cycles, tide.mul);
      const r = transfer('faction', f, 'person', m.name, item, due.pay);
      if (r.ok) {
        paidTotal += due.pay;
        lines.push({ name: m.name, role: m.role, fine: due.fine, pay: due.pay, paid: true });
      } else if (r.reason === 'insufficient') {
        // **欠就是欠**：发不出就记在名册上，连「欠的是什么东西」（owedItem）一起记。
        owedTotal += due.pay;
        writeOwed(f, m.name, m.owed + due.pay, item);
        owed.push({ name: m.name, role: m.role, due: due.pay, owed: m.owed + due.pay });
        lines.push({ name: m.name, role: m.role, fine: due.fine, pay: due.pay, paid: false, reason: 'insufficient' });
      } else {
        // 结构性失败（人不在世界里 / 存档不可用）与「没钱」是两件事，不合并计数。
        failed.push({ name: m.name, reason: r.reason });
        lines.push({ name: m.name, role: m.role, fine: due.fine, pay: due.pay, paid: false, reason: r.reason });
      }
    });
    const left = membersOf(holder('faction', f)).reduce(function (a, b) { return a + b.owed; }, 0);
    const settled = failed.length === 0 && owed.length === 0 && left === 0;
    if (paidTotal > 0 || owedTotal > 0) { stat.payrolls++; stat.lastReason = settled ? 'paid' : 'owed'; }
    return { ok: true, faction: f, item: item, cycle: cycles, tide: tide, count: mem.length,
      lines: lines.slice(0, 30), paid: paidTotal, owedTotal: owedTotal, leftOwed: left,
      settled: settled, failed: failed, owed: owed,
      reason: settled ? '' : (paidTotal > 0 ? 'partial' : 'insufficient') };
  }
  /** 补发欠薪：只补得起的量——「欠 20 只补得起 12」时照实报 partial 并把余额改成 8，
   *  绝不静默把欠额抹成 0（那会让「还欠着」看起来像「清了」）。
   *
   *  与 payroll 的差异是**有意**的，不是随手不一致：
   *    · payroll 发的是「这一期的一份薪」——一份就是一份，发半份不叫发薪，故库存不足时
   *      整笔拒收并记欠（离散量）；
   *    · settleOwed 还的是「已经欠下的债」——债可以分次还清，故按库存能还多少还多少
   *      （连续量）。两者共用同一支 transfer、同一本流水，差别只在「发放粒度」。 */
  function settleOwed(factionName, personName, opts) {
    const f = clean(factionName, 40), p = clean(personName, 60);
    if (!f || !p) return { ok: false, reason: 'bad-name' };
    const row = holder('faction', f);
    if (!row) return { ok: false, reason: 'missing-holder' };
    const rec = rosterOf(row)[p];
    if (!rec) return { ok: false, reason: 'not-on-roster' };
    const owed = typeof rec.owed === 'number' ? rec.owed : 0;
    if (owed <= 0) return { ok: false, reason: 'no-debt' };
    const item = clean((opts && opts.item) || rec.owedItem || '粮', 30);
    const have = qty(stockOf(row)[item]) || 0;
    const pay = Math.min(owed, have);
    if (!pay) return { ok: false, reason: 'insufficient', owed: owed, have: have, item: item };
    const r = transfer('faction', f, 'person', p, item, pay);
    if (!r.ok) return { ok: false, reason: r.reason, owed: owed, have: have, item: item };
    const left = owed - pay;
    writeOwed(f, p, left, item);
    const settled = left === 0;
    stat.lastReason = settled ? 'settled' : 'partial';
    return { ok: true, id: p, faction: f, item: item, paid: pay, owed: owed, left: left,
      settled: settled, reason: settled ? '' : 'partial' };
  }
  /** 罚没：**一次 transfer 走完**，不是「先 grant 给势力再扣本人」两步。
   *  两步之间没有原子性——第一步成功、第二步失败时，凭空多出的资源就留在账上了，
   *  而流水会把它记成一次成功。罚没本就是「本人 → 势力」的转移，用同一支笔即可。 */
  function penalize(factionName, personName, item, amount) {
    const f = clean(factionName, 40), p = clean(personName, 60);
    const it = clean(item || '粮', 30), n = qty(amount);
    if (!f || !p) return { ok: false, reason: 'bad-name' };
    if (!it || !n) return { ok: false, reason: 'bad-resource' };
    const row = holder('faction', f);
    if (!row) return { ok: false, reason: 'missing-holder' };
    if (!rosterOf(row)[p]) return { ok: false, reason: 'not-on-roster' };
    const r = transfer('person', p, 'faction', f, it, n);
    if (!r.ok) return r;
    WA.store.transact(function (draft) {
      const frow = holder('faction', f, draft);
      if (!frow || !frow.roster || !frow.roster[p]) return false;
      const rec = frow.roster[p];
      rec.fined = (typeof rec.fined === 'number' ? rec.fined : 0) + n;
      rec.updatedAt = clockNow('org');
    }, 'org:penalize');
    stat.penalties++; stat.lastReason = 'penalized';
    return { ok: true, id: p, faction: f, item: it, amount: n, to: f };
  }
  /** 组织总览（内部面，不导出——被 ledgerView 消费）：名册规模 / 职阶分布 / 欠薪总量 / 当前经济风。 */
  function organizationSummary() {
    const st = state();
    const facs = ((st.evolution || {}).factions) || [];
    const rows = [];
    let rosterAll = 0, owedAll = 0;
    facs.forEach(function (fr) {
      if (!fr) return;
      const mem = membersOf(fr);
      if (!mem.length) return;
      const spread = {};
      mem.forEach(function (m) { spread[m.role] = (spread[m.role] || 0) + 1; });
      const owed = mem.reduce(function (a, b) { return a + b.owed; }, 0);
      rosterAll += mem.length; owedAll += owed;
      rows.push({ faction: clean(fr.name, 40), count: mem.length, owed: owed, spread: spread });
    });
    return { factions: rows.slice(0, 10), rosterCount: rosterAll, owedTotal: owedAll, tide: tideOf() };
  }
  // ── v2.92.0（O5）：资源账本读数（存量 / 流量 / 笔数 / 异常笔）──
  function qtyOf(kind, name, resource) {
    const row = holder(kind, name);
    return row ? (qty(stockOf(row)[resource]) || 0) : null;
  }
  /** 异常笔单列：负库存 / 前后值漂移 / 超额支付。**不猜**——逐笔按算术判。 */
  function anomalies() {
    const out = { stockDrift: [], negativeStock: [], overpay: [], count: 0 };
    journal.forEach(function (r, i) {
      const amt = qty(r.amount);
      const side = function (s) {
        const before = r[s + 'Before'], after = r[s + 'After'];
        const who = (s === 'to' ? r.toKind : r.fromKind) + ':' + (s === 'to' ? r.toName : r.fromName);
        const sign = s === 'to' ? 1 : -1;
        if (typeof before === 'number' && typeof after === 'number' && (before + sign * amt) !== after) {
          out.stockDrift.push({ i: i, op: r.op, resource: r.resource, side: s, who: who, expect: before + sign * amt, got: after });
        }
        if (typeof after === 'number' && after < 0) {
          out.negativeStock.push({ i: i, op: r.op, resource: r.resource, side: s, who: who, got: after });
        }
        if (s === 'from' && typeof before === 'number' && amt > before) {
          out.overpay.push({ i: i, op: r.op, resource: r.resource, who: who, want: amt, have: before });
        }
      };
      side('to');
      if (r.op === 'transfer') side('from');
    });
    out.count = out.stockDrift.length + out.negativeStock.length + out.overpay.length;
    return out;
  }
  /** 存量比对：把「流水末值」与「当前存量」逐键对齐，对不上即记一笔 vs-stock 断裂。
   *  抽成函数是**实质需要**不是洁癖：v2.94.0 的带外对账（reconcileWith）与带内对账
   *  （reconcile）必须给同一份账同一个答案——复制一份循环的那天，改一处漏一处就分叉了。
   *  `onGone` 是两面对「持有者已消失」的既有分歧：带内记进 holderGone（持有人没了），
   *  带外只报断裂（外来卷说的持有者本侧根本不认识，这本身就是一种对不上）。 */
  function stockBreakOf(last, breaks, onGone) {
    Object.keys(last).forEach(function (k) {
      const parts = k.split('|');
      const cur = qtyOf(parts[0], parts[1], parts[2]);
      if (cur === null) { if (onGone) onGone(k); return; }
      if (cur !== last[k]) breaks.push({ i: -1, why: 'vs-stock', key: k, expect: last[k], got: cur });
    });
  }
  /** 对账：把流水逐笔串起来，核对「这笔的 before == 上一笔的 after」，再与当前存量比对。
   *  基线照实：链首那笔的 before 没有上游可核（环形挤出后更无从核起）——如实报 truncated。 */
  function reconcile() {
    const breaks = [];
    const last = {};
    const has = function (k) { return Object.prototype.hasOwnProperty.call(last, k); };
    const kOf = function (kind, name, resource) { return kind + '|' + name + '|' + resource; };
    journal.forEach(function (r, i) {
      const sides = [['to', r.toKind, r.toName, r.toBefore, r.toAfter]];
      if (r.op === 'transfer') sides.push(['from', r.fromKind, r.fromName, r.fromBefore, r.fromAfter]);
      sides.forEach(function (s) {
        const k = kOf(s[1], s[2], r.resource), before = s[3], after = s[4];
        if (has(k) && typeof before === 'number' && before !== last[k]) {
          breaks.push({ i: i, why: 'chain', key: k, expect: last[k], got: before });
        }
        last[k] = after;
      });
    });
    const gone = [];
    stockBreakOf(last, breaks, function (k) { gone.push(k); });
    return {
      ok: breaks.length === 0, checked: journal.length, breaks: breaks.slice(0, 20), breakCount: breaks.length,
      baseline: journalStat.dropped > 0 ? 'truncated' : 'journal-head', truncated: journalStat.dropped > 0,
      holderGone: gone.slice(0, 10)
    };
  }
  /** 只读账本视图：存量（逐持有者逐资源）+ 流量（流入 / 流出 / 净）+ 笔数 + 异常笔 + 对账。 */
  // ── v2.94.0（O8）：经济风纳入账本读数（**只读 evolution.economy**）──
  // 为什么：O5 的计划原文是「经济风（ECONOMY_CLIMATE）+ org.stockOf 流水」，v2.92.0 只落了
  //   后者——于是「存量在动、经济风是繁荣还是衰退」这张账答不上来，读者看完库存仍不知道
  //   这些物资是在盛世囤的还是乱世抢的。
  // 口径：**只读不写**——`evolution` 是经济气候的唯一写入口（本模块不越界改它）；
  //   引擎缺席或字段缺失时如实报 `available:false` 与 `reason`，**不回落成「平稳」**
  //   （「不知道」与「平稳」是两件事，拿后者冒充前者就是静默撒谎）。
  function climateOf() {
    try {
      if (!WA.evolution || typeof WA.evolution !== 'object') return { available: false, reason: 'engine-absent', climate: null, signals: [] };
      const st = state();
      const eco = (st.evolution || {}).economy;
      if (!eco || typeof eco !== 'object') return { available: false, reason: 'missing', climate: null, signals: [] };
      const known = (WA.evolution.ECONOMY_CLIMATE || []);
      const climate = eco.climate;
      // 表外气候词不装作认识：照实报出来，由调用方面对。
      const recognized = known.length ? known.indexOf(climate) >= 0 : !!climate;
      const sigs = Array.isArray(eco.signals) ? eco.signals : [];
      return { available: true, reason: recognized ? 'ok' : 'unknown-climate', climate: climate || null,
        recognized: recognized, known: known.slice(), signals: sigs.map(function (x) {
          return { summary: (x && x.summary) || '', at: (x && x.at) || 0 };
        }).slice(0, 6) };
    } catch (e) { return { available: false, reason: 'climate-throw', climate: null, signals: [] }; }
  }
  // ── v2.117.0（计划二 B5）：从资源与职位记录延伸到组织行动 ────────────────
  // 治的病：本模块此前答得出「谁在册、谁欠薪、罚了谁多少」，答不出**组织在干什么**——
  //   没有共同项目（目标 / 所需物资 / 参与者 / 交付），于是「缺钱缺货会驱动行动与冲突」
  //   这句话在本仓无输入面：库存在动，组织不动（与 v2.95.0 当年的「经济风只是读数」同型）。
  //
  // 三条口径：
  //   ① **交付走同一支笔**：材料交给项目 = transfer(人 → 势力)。不为项目另开一条
  //      「直接加库存」的通道——那会让项目进度与流水对不上，而对不上正是 O5 存在的理由。
  //   ② **短缺照实报**：结项时缺多少就报多少（missing 逐项），既不四舍五入也不静默放弃。
  //   ③ **两档不互换**：tierOf 只有确凿刻数才叫 precise；只有档位词才叫 narrative；
  //      两样都没有就是 unknown，**不给词**。
  const PROJECT_STATUS = ['planned', 'ongoing', 'done', 'failed'];
  const PROJECT_CAP = 6;      // 每势力项目环上限（与 evict 站点 per-call 实参同值）
  const DEBT_CAP = 12;        // 每人债务环上限
  const PROJECT_TIERS = ['precise', 'narrative', 'unknown'];
  // 叙事档的档位词。**与精确刻数并存于同一条需求串**（"粮100、布 紧张"）：
  //   「未记录具体数量时保持未知」是原文最后一句，也是本表存在的理由——
  //   没有它，叙事档就只能在「经济风不可读」时出现，而那根本不是叙事档的定义。
  const NEED_TIERS = { 充足: 'ample', 紧张: 'tight', 短缺: 'short' };
  const NEED_TIER_CN = { ample: '充足', tight: '紧张', short: '短缺' };

  function factionRow(name, root) {
    const st = root || state();
    const key = clean(name, 40);
    return (((st.evolution || {}).factions) || []).filter(function (f) { return f && clean(f.name, 40) === key; })[0] || null;
  }
  function projectRows(row) {
    const r = row && row.projects;
    return Array.isArray(r) ? r : [];
  }
  function findProject(row, what) {
    const w = clean(what, 60);
    return projectRows(row).filter(function (p) { return p && clean(p.what, 60) === w; }).pop() || null;
  }
  /** 未结项 = 状态在册且不是终态。**表外状态不当成未结项**（不猜）——若把任何
   *  没见过的状态都当「还在办」，一个拼错的 status 就能让项目永远关不掉。 */
  function isLive(p) {
    const st = clean(p && p.status, 12);
    return PROJECT_STATUS.indexOf(st) >= 0 && st !== 'done' && st !== 'failed';
  }
  /** 需求串解析："粮100、布20" / "粮100,布:20" / "布 紧张" ⇒ [{item, need?, tier?}]。
   *   两种记法**可以混在一条串里**：记了刻数的用精确档，没记刻数的用档位词。
   *   两样都没写的项整条拒收（bad-needs）——「照单子发货」不允许有猜的成分。
   *   档位词表外的词（如"有点紧"）不猜、不回落，当解析失败照实拒收。 */
  function parseNeeds(text) {
    const s = clean(text, 200);
    if (!s) return { ok: false, reason: 'no-needs' };
    const out = [];
    const parts = s.split(/[,，、;；]+/);
    for (let i = 0; i < parts.length; i++) {
      const seg = String(parts[i] || '').trim();
      if (!seg) continue;
      const m = seg.match(/^([^\d:：\s]+)[:：]?\s*(\d+)$/);
      if (m) {
        const item = clean(m[1], 30), need = qty(m[2]);
        if (!item || !need) return { ok: false, reason: 'bad-needs', at: seg };
        out.push({ item: item, need: need, tier: null });
        continue;
      }
      const t = seg.match(/^([^\d:：\s]+)\s*[:：]?\s*(\S+)$/);
      if (!t || !NEED_TIERS[t[2]]) return { ok: false, reason: 'bad-needs', at: seg };
      const item2 = clean(t[1], 30);
      if (!item2) return { ok: false, reason: 'bad-needs', at: seg };
      out.push({ item: item2, need: null, tier: NEED_TIERS[t[2]] });
    }
    if (!out.length) return { ok: false, reason: 'no-needs' };
    return { ok: true, items: out };
  }
  /**
   * 档位：精确档（至少一项记了刻数） / 叙事档（至少一项记了档位词）/ 未知（两样都没有）。
   *   为什么不是「看经济风能不能读」：那是**外部读数**，与「这个项目记了多少」无关。
   *   本函数答的是原文那一句「未记录具体数量时保持未知」——未知就**不给词**。
   */
  function tierOf(proj) {
    const needs = Array.isArray(proj && proj.needs) ? proj.needs : [];
    if (needs.some(function (n) { return n && typeof n.need === 'number'; })) return 'precise';
    if (needs.some(function (n) { return n && n.tier && NEED_TIER_CN[n.tier]; })) return 'narrative';
    return 'unknown';
  }
  /** 档位对应的读数行（诊断/面板共用）：精确档给刻数，叙事档给词，未知**不给词**。
   *  未知档的 word 是空串而不是 null——空串拼进文本什么也不出现，null 会印出「null」。 */
  function tierLine(proj) {
    const t = tierOf(proj);
    if (t === 'precise') return { tier: 'precise', word: '', words: [], reason: 'recorded' };
    if (t === 'narrative') {
      const words = (Array.isArray(proj && proj.needs) ? proj.needs : [])
        .filter(function (n) { return n && n.tier; })
        .map(function (n) { return n.item + ' ' + (NEED_TIER_CN[n.tier] || ''); });
      return { tier: 'narrative', word: words.join('、'), words: words, reason: 'narrative-only' };
    }
    return { tier: 'unknown', word: '', words: [], reason: 'nothing-recorded' };
  }
  /** 交付覆盖：逐项算 have / covered / missing。**纯读**。
   *   叙事档项（只有词、没有刻数）**不进缺口**：不知道要多少，就不能说「还缺多少」——
   *   那是把「未知」算成 0 的另一张脸（与 v2.117.0 B3/B4 的不回落同一条红线）。 */
  function coverageOf(row, proj) {
    const stock = stockOf(row);
    const covered = (proj && proj.covered && typeof proj.covered === 'object' && !Array.isArray(proj.covered)) ? proj.covered : {};
    return (Array.isArray(proj && proj.needs) ? proj.needs : []).map(function (n) {
      const got = qty(covered[n.item]) || 0;
      const hasN = typeof n.need === 'number';
      return { item: n.item, need: hasN ? n.need : null, tier: n.tier || null,
        tierWord: (n.tier && NEED_TIER_CN[n.tier]) || '',
        covered: hasN ? Math.min(got, n.need) : got,
        gap: hasN ? Math.max(0, n.need - got) : null,
        have: qty(stock[n.item]) || 0 };
    });
  }
  /**
   * 立项目：目标 + 所需物资（逐项刻数）+ 发起人 + 期限。
   *   同名项目未结项时拒收（duplicate-project）——并存两个同名项目，
   *   账面就再也答不出「交付的这批货进了哪一个」，而那是交付面的全部意义。
   */
  function openProject(factionName, item) {
    const f = clean(factionName, 40);
    const o = item || {};
    const what = clean(o.what || o.title, 60);
    if (!f) return { ok: false, reason: 'bad-name' };
    if (!what) return { ok: false, reason: 'bad-name' };
    if (!holder('faction', f)) return { ok: false, reason: 'missing-holder' };
    const parsed = parseNeeds(o.needs || o.need);
    if (!parsed.ok) return parsed;
    const by = clean(o.by, 60);
    const due = Number(o.due) || 0;   // 0 = 没记期限（**不是**「已经过了」）
    const row0 = holder('faction', f);
    const live = findProject(row0, what);
    if (live && live.status !== 'done' && live.status !== 'failed') {
      stat.blocked++; stat.lastReason = 'duplicate-project';
      return { ok: false, reason: 'duplicate-project', what: what, status: live.status };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const row = factionRow(f, draft);
      if (!row) { out = { ok: false, reason: 'missing-holder' }; return false; }
      row.projects = Array.isArray(row.projects) ? row.projects : [];
      row.projects.push({ what: what, status: 'planned', by: by, due: due,
        needs: parsed.items.slice(),
        covered: {}, startedAt: clockNow('org'), updatedAt: clockNow('org') });
      WA.evict.array(row.projects, 'org.projects', PROJECT_CAP);
      out = { ok: true, faction: f, what: what, needs: parsed.items, by: by, due: due,
        count: row.projects.length };
    }, 'org:project-open');
    if (out && out.ok) { stat.lastReason = 'project-opened'; }
    else if (out) { stat.blocked++; if (!stat.lastReason) stat.lastReason = out.reason; }
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 交付物资给项目：**走 transfer（人 → 势力）**，再把这批记进该项目的 covered。
   *   两件事在**同一次 transact** 里：分开写会在中间失败时留下「流水有、项目没记」
   *   或反过来，而这两种账面都答不出「这批货算不算数」。
   *   只收清单上有的东西（not-needed）：把无关物资倒进来算进度，等于进度可被伪造。
   */
  function deliverToProject(factionName, projectName, personName, item, amount) {
    const f = clean(factionName, 40), p = clean(personName, 60);
    const what = clean(projectName, 60), it = clean(item, 30), n = qty(amount);
    if (!f || !p || !what) return { ok: false, reason: 'bad-name' };
    if (!it || !n) return { ok: false, reason: 'bad-resource' };
    const row0 = factionRow(f);
    if (!row0) return { ok: false, reason: 'missing-holder' };
    const proj0 = findProject(row0, what);
    if (!proj0) return { ok: false, reason: 'no-such-project' };
    if (proj0.status === 'done' || proj0.status === 'failed') {
      stat.blocked++; stat.lastReason = 'project-closed';
      return { ok: false, reason: 'project-closed', status: proj0.status };
    }
    const onList = (Array.isArray(proj0.needs) ? proj0.needs : []).some(function (x) { return x && x.item === it; });
    if (!onList) { stat.blocked++; stat.lastReason = 'not-needed'; return { ok: false, reason: 'not-needed', item: it }; }
    const cov0 = coverageOf(row0, proj0).filter(function (x) { return x.item === it; })[0];
    // 精确档项：按缺口收，收满即停（take = min(n, gap)）。
    //   叙事档项（只记了词、没记刻数）**没有「收满」这回事**——不知道要多少，就不能
    //   拿「已经够了」把人挡回去（那是把未知当成 0 的另一张脸）。照实全收。
    const isSpec = !!(cov0 && typeof cov0.need === 'number');
    if (isSpec && !cov0.gap) {
      stat.blocked++; stat.lastReason = 'already-covered';
      return { ok: false, reason: 'already-covered', item: it };
    }
    const take = isSpec ? Math.min(n, cov0.gap) : n;
    const tr = transfer('person', p, 'faction', f, it, take);
    if (!tr.ok) return tr;
    let out = null;
    WA.store.transact(function (draft) {
      const row = factionRow(f, draft);
      if (!row) { out = { ok: false, reason: 'missing-holder' }; return false; }
      const proj = findProject(row, what);
      if (!proj) { out = { ok: false, reason: 'no-such-project' }; return false; }
      proj.covered = (proj.covered && typeof proj.covered === 'object' && !Array.isArray(proj.covered)) ? proj.covered : {};
      proj.covered[it] = (qty(proj.covered[it]) || 0) + take;
      if (proj.status === 'planned') proj.status = 'ongoing';
      proj.updatedAt = clockNow('org');
      const cov = coverageOf(row, proj);
      out = { ok: true, faction: f, what: what, item: it, took: take, offered: n, short: n - take,
        status: proj.status, covered: cov.map(function (x) { return { item: x.item, covered: x.covered, need: x.need }; }),
        complete: cov.every(function (x) { return x.need !== null && x.gap === 0; }) };
    }, 'org:project-deliver');
    if (out && out.ok) { stat.lastReason = 'project-delivered'; }
    else if (out) stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 项目读数（纯读）：逐项目的状态 / 需求 / 已覆盖 / 缺口 / 参与者 + 当前档位。 */
  function projectView(factionName) {
    const f = clean(factionName, 40);
    if (!f) return { ok: false, reason: 'bad-name' };
    const row = factionRow(f);
    if (!row) return { ok: false, reason: 'missing-holder' };
    const rows = projectRows(row).map(function (p) {
      const cov = coverageOf(row, p);
      const tOf = tierOf(p);   // 档位由**这个项目自己记了多少**决定，不是外部气候读数
      return { what: clean(p.what, 60), status: clean(p.status, 12), by: clean(p.by, 60), live: isLive(p),
        due: Number(p.due) || 0, tier: tOf, tierReason: tierLine(p).reason,
        tierWords: cov.filter(function (x) { return x.need === null; })
          .map(function (x) { return x.item + ' ' + (x.tierWord || '未记数量'); }),
        needs: cov.map(function (x) { return { item: x.item, need: x.need, tier: x.tier }; }),
        covered: cov, missing: cov.filter(function (x) { return x.gap > 0; })
          .map(function (x) { return { item: x.item, gap: x.gap }; }),
        canClose: cov.every(function (x) { return x.need !== null && x.gap === 0; }) };
    });
    const anyPrecise = rows.some(function (r) { return r.tier === 'precise'; });
    const anyNarr = rows.some(function (r) { return r.tier === 'narrative'; });
    return { ok: true, faction: f, count: rows.length,
      tier: anyPrecise ? 'precise' : (anyNarr ? 'narrative' : 'unknown'),
      tierReason: !rows.length ? 'no-project'
        : (anyPrecise ? 'recorded' : (anyNarr ? 'narrative-only' : 'nothing-recorded')),
      hasPrecise: anyPrecise, hasNarrative: anyNarr,
      projects: rows.slice(0, PROJECT_CAP) };
  }
  /**
   * 结项：全部覆盖才算完成（done），缺口照实报（shortfall，状态不动）。
   *   不把「差一点」写成「完成」——那是本仓库最贵的一类默认值在项目面上的翻版。
   */
  function closeProject(factionName, projectName) {
    const f = clean(factionName, 40), what = clean(projectName, 60);
    if (!f || !what) return { ok: false, reason: 'bad-name' };
    const row0 = factionRow(f);
    if (!row0) return { ok: false, reason: 'missing-holder' };
    const proj0 = findProject(row0, what);
    if (!proj0) return { ok: false, reason: 'no-such-project' };
    if (proj0.status === 'done' || proj0.status === 'failed') {
      return { ok: false, reason: 'project-closed', status: proj0.status };
    }
    const covAll = coverageOf(row0, proj0);
    const miss = covAll.filter(function (x) { return x.gap > 0; })
      .map(function (x) { return { item: x.item, gap: x.gap, have: x.have }; });
    // 叙事档项（只记了词、没记刻数）：**不能算满足**——不知道要多少就答不出「够了没有」。
    //   照实并入 shortfall 并注明原因，不给「缺口 0」的假备齐。
    const unknownNeed = covAll.filter(function (x) { return x.need === null; })
      .map(function (x) { return { item: x.item, tier: x.tier, why: 'unrecorded-need' }; });
    if (miss.length || unknownNeed.length) {
      stat.blocked++; stat.lastReason = 'shortfall';
      return { ok: false, reason: 'shortfall', what: what, missing: miss, unrecorded: unknownNeed };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const row = factionRow(f, draft);
      if (!row) { out = { ok: false, reason: 'missing-holder' }; return false; }
      const proj = findProject(row, what);
      if (!proj) { out = { ok: false, reason: 'no-such-project' }; return false; }
      proj.status = 'done';
      proj.closedAt = clockNow('org');
      proj.updatedAt = proj.closedAt;
      out = { ok: true, faction: f, what: what, status: 'done', closedAt: proj.closedAt };
    }, 'org:project-close');
    if (out && out.ok) { stat.lastReason = 'project-closed-ok'; } else if (out) stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 登记债务：**谁欠谁、欠什么、为什么**。没有原因字段的欠账，日后没人答得出它是怎么来的
   *   （「罚没」有据、「欠薪」有据，「他欠势力 30 粮」没据就是在编）。
   *   债务挂在**人**身上（`person.debts`），与名册的 `owed`（势力欠人）方向相反、表也分开。
   */
  function oweTo(factionName, personName, opts) {
    const f = clean(factionName, 40), p = clean(personName, 60);
    const o = opts || {};
    const it = clean(o.item || '粮', 30), n = qty(o.amount);
    const why = clean(o.why, 80);
    if (!f || !p) return { ok: false, reason: 'bad-name' };
    if (!it || !n) return { ok: false, reason: 'bad-resource' };
    if (!why) return { ok: false, reason: 'missing-why' };
    const prow = holder('person', p);
    if (!prow) return { ok: false, reason: 'missing-holder' };
    if (!holder('faction', f)) return { ok: false, reason: 'missing-holder' };
    if (!rosterOf(holder('faction', f))[p]) return { ok: false, reason: 'not-on-roster' };
    let out = null;
    WA.store.transact(function (draft) {
      const person = holder('person', p, draft);
      if (!person) { out = { ok: false, reason: 'missing-holder' }; return false; }
      person.debts = Array.isArray(person.debts) ? person.debts : [];
      const hit = person.debts.filter(function (d) { return d && d.to === f && d.item === it; })[0] || null;
      if (hit) { hit.amount = (qty(hit.amount) || 0) + n; hit.updatedAt = clockNow('org'); }
      else person.debts.push({ to: f, item: it, amount: n, why: why, at: clockNow('org'), updatedAt: clockNow('org') });
      WA.evict.array(person.debts, 'org.debts', DEBT_CAP);
      const total = person.debts.filter(function (d) { return d && d.to === f && d.item === it; })
        .reduce(function (a, b) { return a + (qty(b.amount) || 0); }, 0);
      out = { ok: true, faction: f, person: p, item: it, added: n, amount: total, why: why, count: person.debts.length };
    }, 'org:owe');
    if (out && out.ok) stat.lastReason = 'owed-to'; else if (out) stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 清偿人对势力的欠账：**只还得起的量**（与 settleOwed 同一条「债可分批」口径），
   *  余额照实留着；走 transfer（人 → 势力），与罚没同一支笔。 */
  function settleDebt(factionName, personName, opts) {
    const f = clean(factionName, 40), p = clean(personName, 60);
    const o = opts || {};
    if (!f || !p) return { ok: false, reason: 'bad-name' };
    const person = holder('person', p);
    if (!person) return { ok: false, reason: 'missing-holder' };
    const debts = Array.isArray(person.debts) ? person.debts : [];
    const it = clean(o.item, 30);
    const hit = debts.filter(function (d) { return d && d.to === f && (!it || d.item === it); })[0] || null;
    if (!hit) return { ok: false, reason: 'no-debt' };
    const owed = qty(hit.amount) || 0;
    if (owed <= 0) return { ok: false, reason: 'no-debt' };
    const have = qty(stockOf(person)[hit.item]) || 0;
    const pay = Math.min(owed, have);
    if (!pay) return { ok: false, reason: 'insufficient', owed: owed, have: have, item: hit.item };
    const tr = transfer('person', p, 'faction', f, hit.item, pay);
    if (!tr.ok) return tr;
    let out = null;
    WA.store.transact(function (draft) {
      const per = holder('person', p, draft);
      if (!per || !Array.isArray(per.debts)) { out = { ok: false, reason: 'no-debt' }; return false; }
      const h = per.debts.filter(function (d) { return d && d.to === f && d.item === hit.item; })[0] || null;
      if (!h) { out = { ok: false, reason: 'no-debt' }; return false; }
      const left = (qty(h.amount) || 0) - pay;
      if (left <= 0) per.debts = per.debts.filter(function (d) { return d !== h; });
      else { h.amount = left; h.updatedAt = clockNow('org'); }
      out = { ok: true, faction: f, person: p, item: hit.item, paid: pay, owed: owed, left: Math.max(0, left),
        settled: left <= 0 };
    }, 'org:debt-settle');
    if (out && out.ok) stat.lastReason = out.settled ? 'debt-settled' : 'debt-partial';
    else if (out) stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /**
   * 债权债务双向读数。**逐条带对象与原因**（欠谁的、欠什么、为什么），不汇总成一个净额——
   *   净额会把「甲欠我 10 粮」和「我欠甲 10 布」抵成 0，而这两件事一件都不能忘。
   */
  function debtsView(kind, name) {
    const k = clean(kind, 20) || 'person';
    const nm = clean(name, 60);
    if (!nm) return { ok: false, reason: 'bad-name' };
    if (k === 'person') {
      const person = holder('person', nm);
      if (!person) return { ok: false, reason: 'missing-holder' };
      const owes = (Array.isArray(person.debts) ? person.debts : []).map(function (d) {
        return { to: clean(d.to, 40), item: clean(d.item, 30), amount: qty(d.amount) || 0, why: clean(d.why, 80) };
      }).filter(function (d) { return d.amount > 0; });
      const owedTo = [];
      (((state().evolution || {}).factions) || []).forEach(function (fr) {
        if (!fr) return;
        const rec = rosterOf(fr)[nm];
        if (!rec) return;
        const amt = typeof rec.owed === 'number' ? rec.owed : 0;
        if (amt > 0) owedTo.push({ from: clean(fr.name, 40), item: clean(rec.owedItem || '粮', 30), amount: amt, why: '薪俸未清' });
      });
      const pay = owes.reduce(function (a, b) { return a + b.amount; }, 0);
      const recv = owedTo.reduce(function (a, b) { return a + b.amount; }, 0);
      return { ok: true, kind: 'person', name: nm, payable: owes, receivable: owedTo,
        payableTotal: pay, receivableTotal: recv, count: owes.length + owedTo.length };
    }
    if (k === 'faction') {
      const row = factionRow(nm);
      if (!row) return { ok: false, reason: 'missing-holder' };
      const receivable = [];
      const rs = rosterOf(row);
      Object.keys(rs).sort().forEach(function (p) {
        const amt = typeof rs[p].owed === 'number' ? rs[p].owed : 0;
        if (amt > 0) receivable.push({ from: p, item: clean(rs[p].owedItem || '粮', 30), amount: amt, why: '薪俸未清' });
      });
      const payable = [];
      const st = state();
      Object.keys(st.people || {}).forEach(function (pid) {
        const per = st.people[pid];
        if (!per) return;
        (Array.isArray(per.debts) ? per.debts : []).forEach(function (d) {
          if (d && clean(d.to, 40) === nm && (qty(d.amount) || 0) > 0) {
            payable.push({ to: clean(per.name || pid, 60), item: clean(d.item, 30), amount: qty(d.amount) || 0, why: clean(d.why, 80) });
          }
        });
      });
      const recv = receivable.reduce(function (a, b) { return a + b.amount; }, 0);
      const pay = payable.reduce(function (a, b) { return a + b.amount; }, 0);
      return { ok: true, kind: 'faction', name: nm, receivable: receivable, payable: payable,
        receivableTotal: recv, payableTotal: pay, count: receivable.length + payable.length };
    }
    return { ok: false, reason: 'bad-kind', want: ['faction', 'person'] };
  }
  function ledgerView() {
    const st = state();
    const holders = [];
    const push = function (kind, name, res) {
      const items = Object.keys(stockOf({ resources: res })).map(function (k) { return { id: k, qty: qty(res[k]) }; })
        .filter(function (x) { return x.qty > 0; });
      if (items.length) holders.push({ kind: kind, name: name, items: items, total: items.reduce(function (a, b) { return a + b.qty; }, 0) });
    };
    (((st.evolution || {}).factions) || []).forEach(function (f) { if (f) push('faction', clean(f.name, 40), stockOf(f)); });
    Object.keys(st.people || {}).forEach(function (k) { const p = st.people[k]; if (p) push('person', clean(p.name || k, 60), stockOf(p)); });
    let inflow = 0, outflow = 0;
    journal.forEach(function (r) { inflow += qty(r.amount); if (r.op === 'transfer') outflow += qty(r.amount); });
    return {
      enabled: !!settings().enabled,
      climate: climateOf(),
      holderCount: holders.length, holders: holders.slice(0, 20),
      entries: journal.length, recorded: journalStat.recorded, dropped: journalStat.dropped, cap: JOURNAL_CAP,
      flow: { in: inflow, out: outflow, net: inflow - outflow },
      anomalies: anomalies(),
      // v2.95.0（X2）：名册规模 / 职阶分布 / 欠薪总量 / 当前经济风。
      //   organizationSummary 是**内部面**（不单独导出）：它的真消费方就是这一行，
      //   于是「欠薪看得见」不必靠用户去点面板——账本读数里直接在场。
      organization: organizationSummary(),
      reconciled: reconcile()
    };
  }

  WA.org = {
    KINDS: ['faction', 'person'],
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    grant: grant, transfer: transfer, canAfford: canAfford, stockOf: stockOf, buildBlock: buildBlock,
    // v2.92.0（O5）：账本读数两口。ledgerView → 诊断 secOrg + 面板「资源账本」按钮；
    //   reconcile → 诊断 secOrg（跨文件消费方）。**纯读**：不跑引擎、不改存档、不注入。
    ledgerView: ledgerView, reconcile: reconcile,
    // v2.94.0（O6）：流水导出/存档点三面。exportJournal → 面板「导出流水」按钮 + 诊断 secOrg；
    //   reconcileWith → 面板「带外对账」按钮（带外 = 本侧环形已挤出、只有外来卷才核得到）。
    //   inspectJournal 被 reconcileWith 消费（不单独导出——无独立消费方不挂）。
    exportJournal: exportJournal, reconcileWith: reconcileWith,
    // v2.95.0（X2 · B3）：经济引擎七口——**每个口一个真消费方**（面板人物页七个按钮）：
    //   assignRole / creditWork / promote / rosterView / payroll / settleOwed / penalize。
    //   内部面 writeOwed / membersOf / organizationSummary **不导出**（无独立消费方不挂）。
    //   薪酬 / 补发 / 罚没一律复用 transfer ⇒ 自动进 O5 流水、可被 O6 带外对账核、
    //   异常时进 O7 健康分——同一本账，没有影子账。
    assignRole: assignRole, creditWork: creditWork, promote: promote, rosterView: rosterView,
    payroll: payroll, settleOwed: settleOwed, penalize: penalize,
    // v2.117.0（计划二 B5）：组织行动七口——**每个口一个真消费方**：
    //   openProject / projectView / closeProject / deliverToProject → 诊断 secOrg（项目面）
    //     + inject 注入面（buildBlock 的「共同项目」段，模型据此知道组织正在办什么）；
    //   oweTo / settleDebt / debtsView → 诊断 secOrg（债务面）+ buildBlock 的欠账读数。
    //   交付一律走 transfer（在 deliverToProject / settleDebt 内部），**不开影子账**。
    openProject: openProject, projectView: projectView, closeProject: closeProject,
    deliverToProject: deliverToProject, oweTo: oweTo, settleDebt: settleDebt, debtsView: debtsView,
    TIERS: PROJECT_TIERS,
    stat: function () { return Object.assign({}, stat); }
  };
})();
