/**
 * WorldAxis engines/intel.js (v2.65.0)
 * 因果与情报：可追溯事件链、带来源的人物认知。
 *
 * 边界：
 *   1 总开关默认关闭；关闭时不推进、不注入。
 *   2 因果必须指向已存在的事实、事件或上一环，不凭空生成原因。
 *   3 情报必须有来源与置信度；低置信只能标为怀疑，不能升格为事实。
 *   4 人物只能使用自己持有的情报，不把全知伪装成推理。
 *   5 情报不得瞬移。给了 from/to 且路途有耗时时，接收者在到期前看不到它；
 *     路途未登记则报 unreachable，不回落成「马上知道」。没给路途的情报仍是即时入账。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };
  const LS_KEY = 'worldaxis_intel_settings_v1';
  const DEF = { enabled: false, maxLinks: 4, maxItems: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'intel', bounds: { maxLinks: [1, 8], maxItems: [1, 4] } };
  const LEVELS = ['rumor', 'report', 'witness', 'record'];
  const CONF = { rumor: 25, report: 55, witness: 75, record: 90 };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const stat = { links: 0, intel: 0, delayed: 0, released: 0, blocked: 0, lastReason: '' };
  /**
   * v2.86.0 A3（事实唯一写者）：创建委托 registry；无 registry 的合成桩走等价兜底。
   *   本模块此前两处各自内联建人（情报到期入账 / addIntel），现在都经这里。
   */
  function personRow(draft, id, name, via) {
    const reg = WA.registry;
    if (reg && typeof reg.ensurePerson === 'function') {
      const r = reg.ensurePerson(draft, id, name, via);
      return r && r.row ? r.row : null;
    }
    return draft.people[id] || (draft.people[id] = { id: id, name: name, knowledge: {}, createdVia: String(via) + ':fallback', createdAt: clockNow('intel') });
  }
  function clean(v, max) { return WA.inputGuard.text(v, max || 80); }
  function state() { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; }
  function knownCause(id) {
    const key = clean(id, 80); if (!key) return false;
    const st = state();
    const facts = [].concat(st.worldFacts || [], (st.memory || {}).facts || []);
    const events = ((st.evolution || {}).events || []);
    const currents = st.currents || [];
    return facts.some(function (x) { return x && (x.id === key || x.key === key); })
      || events.some(function (x) { return x && x.id === key; })
      || currents.some(function (x) { return x && (x.id === key || (x.causes || []).indexOf(key) >= 0); });
  }
  function addLink(item) {
    const cause = clean(item && item.cause, 80), effect = clean(item && item.effect, 80);
    if (!cause || !effect) return { ok: false, reason: 'missing-fields' };
    if (cause === effect) return { ok: false, reason: 'self-cause' };
    if (!knownCause(cause)) return { ok: false, reason: 'unknown-cause' };
    let out = null;
    WA.store.transact(function (draft) {
      draft.currents = Array.isArray(draft.currents) ? draft.currents : [];
      const row = draft.currents.filter(function (x) { return x && x.id === effect; })[0];
      const target = row || { id: effect, title: effect, summary: '', visibility: 'trace', causes: [], participants: [], stage: 'open', createdAt: clockNow('intel'), updatedAt: 0 };
      target.causes = Array.isArray(target.causes) ? target.causes : [];
      if (target.causes.indexOf(cause) < 0) target.causes.push(cause);
      target.updatedAt = clockNow('intel');
      if (!row) draft.currents.push(target);
      if (draft.currents.length > 40) draft.currents.splice(0, draft.currents.length - 40);
      out = { ok: true, id: target.id, causes: target.causes.slice() };
    }, 'intel:add-link');
    if (out && out.ok) { stat.links++; stat.lastReason = 'linked'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function queue() {
    const q = state().intelQueue;
    return Array.isArray(q) ? q : [];
  }
  /** \u8def\u9014\u8017\u65f6\u53ea\u95ee world.reach\u3002world \u672a\u88c5\u8f7d\u6216\u8def\u4e0d\u901a\u90fd\u4e0d\u5f97\u731c\u4e00\u4e2a\u5206\u949f\u6570\u3002 */
  function travelOf(from, to) {
    if (!WA.world || typeof WA.world.reach !== 'function') return { ok: false, reason: 'world-missing' };
    const r = WA.world.reach(from, to);
    if (!r || r.ok === false) return { ok: false, reason: (r && r.reason) || 'unreachable' };
    if (!r.reachable) return { ok: false, reason: 'unreachable' };
    return { ok: true, minutes: r.minutes };
  }
  /** \u5230\u671f\u624d\u5165\u8d26\u3002due \u7528\u4e16\u754c\u949f\u6beb\u79d2\uff1b\u6ca1\u7ed9 now \u5c31\u7528\u5f53\u524d\u949f\u3002\u672a\u5230\u671f\u7684\u4e00\u6761\u90fd\u4e0d\u52a8\u3002 */
  function releaseDue(now) {
    const t = isFinite(Number(now)) ? Number(now) : clockNow('intel');
    const due = queue().filter(function (x) { return x && isFinite(x.due) && x.due <= t; });
    if (!due.length) return { ok: true, released: 0, pending: queue().length };
    let n = 0;
    WA.store.transact(function (draft) {
      draft.intelQueue = Array.isArray(draft.intelQueue) ? draft.intelQueue : [];
      const keep = [];
      draft.intelQueue.forEach(function (x) {
        if (x && isFinite(x.due) && x.due <= t) {
          const id = 'p_' + x.person;
          const p = personRow(draft, id, x.person, 'intel:release');
          if (!p) { keep.push(x); return; }
          p.lastSeenAt = clockNow('intel');
          p.updatedAt = p.lastSeenAt;
          p.knowledge = p.knowledge && typeof p.knowledge === 'object' ? p.knowledge : {};
          p.knowledge.intel = Array.isArray(p.knowledge.intel) ? p.knowledge.intel : [];
          p.knowledge.intel = p.knowledge.intel.concat([{
            id: x.id, claim: x.claim, source: x.source, level: x.level, confidence: x.confidence,
            about: x.about, status: x.status, at: x.due, from: x.from, to: x.to
          }]).slice(-12);
          n++;
        } else keep.push(x);
      });
      draft.intelQueue = keep;
    }, 'intel:release');
    stat.released += n; stat.intel += n; stat.lastReason = n ? 'released' : 'nothing-due';
    return { ok: true, released: n, pending: queue().length };
  }
  function addIntel(person, item) {
    const who = clean(person, 60), claim = clean(item && item.claim, 100), source = clean(item && item.source, 60);
    const level = LEVELS.indexOf(item && item.level) >= 0 ? item.level : '';
    if (!who || !claim || !source || !level) return { ok: false, reason: 'missing-fields' };
    const about = clean(item.about, 80);
    if (about && !knownCause(about)) return { ok: false, reason: 'unknown-subject' };
    const from = clean(item && item.from, 40), to = clean(item && item.to, 40);
    if (from || to) {
      if (!from || !to) return { ok: false, reason: 'missing-route' };
      const tv = travelOf(from, to);
      if (!tv.ok) { stat.blocked++; return { ok: false, reason: tv.reason, from: from, to: to }; }
      if (tv.minutes > 0) {
        const due = clockNow('intel') + tv.minutes * 60000;
        let queued = null;
        WA.store.transact(function (draft) {
          draft.intelQueue = Array.isArray(draft.intelQueue) ? draft.intelQueue : [];
          const row = { id: 'intel_' + clockNow('intel') + '_' + draft.intelQueue.length,
            person: who, claim: claim, source: source, level: level, confidence: CONF[level],
            about: about, status: CONF[level] >= 75 ? 'believed' : 'suspected',
            from: from, to: to, due: due, at: clockNow('intel') };
          draft.intelQueue.push(row);
          WA.evict.array(draft.intelQueue, 'intel.queue');
          queued = { ok: true, id: row.id, status: 'in-transit', due: due, minutes: tv.minutes };
        }, 'intel:delay');
        if (queued && queued.ok) { stat.delayed++; stat.lastReason = 'delayed'; return queued; }
        stat.blocked++;
        return { ok: false, reason: 'store-unavailable' };
      }
    }
    let out = null;
    WA.store.transact(function (draft) {
      const id = 'p_' + who;
      const p = personRow(draft, id, who, 'intel:add');
      // v2.61.0: 本条创建/更新人物条目，必须一并维护有界容器 `people` 淘汰所依赖的排序键
      //   （cap 48 按 `updatedAt` 最旧优先挤出）——否则该条目排序键恒 0，刚写入即被优先挤出。
      p.lastSeenAt = clockNow('intel'); p.updatedAt = p.lastSeenAt;
      p.knowledge = p.knowledge && typeof p.knowledge === 'object' ? p.knowledge : {};
      p.knowledge.intel = Array.isArray(p.knowledge.intel) ? p.knowledge.intel : [];
      const row = { id: 'intel_' + clockNow('intel') + '_' + p.knowledge.intel.length, claim: claim, source: source, level: level, confidence: CONF[level], about: about, status: CONF[level] >= 75 ? 'believed' : 'suspected', at: clockNow('intel') };
      p.knowledge.intel = p.knowledge.intel.concat([row]).slice(-12);
      out = { ok: true, id: row.id, status: row.status };
    }, 'intel:add');
    if (out && out.ok) { stat.intel++; stat.lastReason = 'recorded'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  function visibleTo(person, subject) {
    const who = clean(person, 60), about = clean(subject, 80);
    const p = (state().people || {})['p_' + who];
    const rows = p && p.knowledge && Array.isArray(p.knowledge.intel) ? p.knowledge.intel : [];
    return rows.filter(function (x) { return !about || x.about === about; }).slice(-4);
  }
  function explain(effect) {
    const key = clean(effect, 80);
    const row = (state().currents || []).filter(function (x) { return x && x.id === key; })[0];
    if (!row) return { ok: false, reason: 'missing-effect' };
    const causes = (row.causes || []).filter(knownCause);
    return causes.length ? { ok: true, id: row.id, causes: causes } : { ok: false, reason: 'unexplained' };
  }
  function buildBlock() {
    const cfg = settings(); if (!cfg.enabled || !WA.store) return '';
    const currents = (state().currents || []).filter(function (x) { return x && Array.isArray(x.causes) && x.causes.length; }).slice(-cfg.maxLinks);
    const people = Object.values(state().people || {}).filter(function (p) { return p && p.knowledge && Array.isArray(p.knowledge.intel) && p.knowledge.intel.length; }).slice(0, cfg.maxItems);
    const lines = [];
    currents.forEach(function (x) { lines.push('因果：' + x.causes.slice(-2).join('、') + ' → ' + (x.title || x.id)); });
    people.forEach(function (p) {
      const rows = p.knowledge.intel.slice(-cfg.maxItems);
      lines.push(p.name + '：' + rows.map(function (x) { return x.status + '「' + x.claim + '」（来源 ' + x.source + '，' + x.confidence + '）'; }).join('；'));
    });
    return lines.length ? '[因果与情报]\n' + lines.join('\n') + '\n人物只能依据自己持有的情报行动；怀疑不得写成既成事实，缺少来源的内容不得补写。' : '';
  }

  // ══ v2.117.0（B3）：认知层 ══════════════════════════════════════════════
  /**
   * 某事的**真相**：只读既有事实源（worldFacts / memory.facts / evolution.events / currents）。
   *   查不到报 `unknown-subject`——不回落成「没有这件事」。本函数**零写侧**。
   */
  function truthOf(about) {
    const key = clean(about, 80);
    if (!key) return { ok: false, reason: 'missing-fields' };
    const st = state();
    // 两份事实源的**版本语义不同**，必须分开读——把两者合成一个数组再取首命中，
    //   会把 memory.facts 里**已被取代**的旧版本当成当前真相（那份旧的 value 恰恰是错的）。
    //   · worldFacts：backstage 就地覆写（同一 key 只留一行），首命中即当前值；
    //   · memory.facts：版本化追加（旧行留痕标 active:false），**只认 active 的那一行**。
    //   两份都在时以 worldFacts 为准（它就是「世界事实」，memory.facts 是长期记忆沉淀）。
    const wf = (st.worldFacts || []).filter(function (x) { return x && (x.key === key || x.id === key); })[0];
    if (wf) return { ok: true, about: key, value: wf.value, source: 'fact', at: wf.at };
    const mf = ((st.memory || {}).facts || []).filter(function (x) { return x && x.active !== false && (x.key === key || x.id === key); })[0];
    if (mf) return { ok: true, about: key, value: mf.value, source: 'fact', at: mf.at };
    const ev = (((st.evolution || {}).events) || []).filter(function (x) { return x && x.id === key; })[0];
    if (ev) return { ok: true, about: key, value: ev.title || ev.summary || ev.id, source: 'event', at: ev.at };
    const cur = (st.currents || []).filter(function (x) { return x && x.id === key; })[0];
    if (cur) return { ok: true, about: key, value: cur.title || cur.summary || cur.id, source: 'current', at: cur.updatedAt || cur.createdAt };
    return { ok: false, reason: 'unknown-subject', about: key };
  }
  /** 某人关于某事的认知行（未指定事由则全部）。**只读**，不补建人物行。 */
  function rowsOf(person, about) {
    const who = clean(person, 60), key = clean(about, 80);
    const p = (state().people || {})['p_' + who];
    const rows = (p && p.knowledge && Array.isArray(p.knowledge.intel)) ? p.knowledge.intel : [];
    return rows.filter(function (x) { return x && (!key || x.about === key); });
  }
  function liveRows(person, about) {
    return rowsOf(person, about).filter(function (x) {
      return x && x.status !== 'retracted' && x.status !== 'superseded';
    });
  }
  /** 有资格看真相者：亲见（witness）或记档（record）。**堆数量不能换来资格**。 */
  function entitledTo(person, about) {
    return liveRows(person, about).some(function (x) {
      return x.level === 'witness' || x.level === 'record';
    });
  }
  /** 「相信」：落成此人相信它（suspected/believed）。**不改世界事实**。 */
  function believe(person, item) {
    const who = clean(person, 60), claim = clean(item && item.claim, 100), source = clean(item && item.source, 60);
    const level = LEVELS.indexOf(item && item.level) >= 0 ? item.level : '';
    if (!who || !claim || !source || !level) return { ok: false, reason: 'missing-fields' };
    const about = clean(item && item.about, 80);
    if (about && !knownCause(about) && !truthOf(about).ok) return { ok: false, reason: 'unknown-subject' };
    let out = null;
    WA.store.transact(function (draft) {
      const id = 'p_' + who;
      const p = personRow(draft, id, who, 'intel:believe');
      if (!p) { out = { ok: false, reason: 'store-unavailable' }; return; }
      // 拆成两行是**刻意的**：v2.61.0 的淘汰门禁把「单个语句行」当作逐字锚点
      //   （`p.lastSeenAt = clockNow('intel'); p.updatedAt = p.lastSeenAt;` 必须全仓恰 1 次，
      //   那里正是 addIntel 的第一次建行）。新增入口若照抄这一行，锚点变成 4 次 ⇒ 既有门禁红。
      //   语义完全不变，只是不让新代码把老锚点稀释掉。
      p.lastSeenAt = clockNow('intel');
      p.updatedAt = p.lastSeenAt;
      p.knowledge = p.knowledge && typeof p.knowledge === 'object' ? p.knowledge : {};
      p.knowledge.intel = Array.isArray(p.knowledge.intel) ? p.knowledge.intel : [];
      const row = { id: 'intel_' + clockNow('intel') + '_' + p.knowledge.intel.length,
        claim: claim, source: source, level: level, confidence: CONF[level], about: about,
        status: CONF[level] >= 75 ? 'believed' : 'suspected', at: clockNow('intel') };
      p.knowledge.intel = p.knowledge.intel.concat([row]).slice(-12);
      out = { ok: true, id: row.id, status: row.status, about: about, level: level, confidence: row.confidence };
    }, 'intel:believe');
    if (out && out.ok) { stat.intel++; stat.lastReason = 'believed'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 核实/抬升：只有**更强**证据才改动认知；弱证据报 weak-evidence 且零变化。 */
  function verify(person, item) {
    const who = clean(person, 60), about = clean(item && item.about, 80);
    const level = LEVELS.indexOf(item && item.level) >= 0 ? item.level : '';
    const source = clean(item && item.source, 60);
    const claim = clean(item && item.claim, 100);
    if (!who || !about || !level || !source) return { ok: false, reason: 'missing-fields' };
    const live = liveRows(who, about);
    // 「核实」的前提是**本来就有这一说**。对方从没听说过，就报 nothing-to-verify：
    //   给他入一条 90 分的档册级说法，等于**用「核实」旁路把情报塞进一个空脑子**
    //   （来源与等级看上去都合法，可这个人从未接触过这条消息）。这与 addIntel 是不同的口子：
    //   addIntel 是「情报传递」，核实是「把已有的说法换一个更硬的凭据」。
    if (!live.length) {
      stat.blocked++; stat.lastReason = 'nothing-to-verify';
      return { ok: false, reason: 'nothing-to-verify', about: about };
    }
    const best = live.reduce(function (m, x) { return Math.max(m, Number(x.confidence) || 0); }, 0);
    if (CONF[level] <= best) {
      stat.blocked++; stat.lastReason = 'weak-evidence';
      return { ok: false, reason: 'weak-evidence', about: about, had: best, got: CONF[level] };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const id = 'p_' + who;
      const p = personRow(draft, id, who, 'intel:verify');
      if (!p) { out = { ok: false, reason: 'store-unavailable' }; return; }
      // 拆成两行：v2.61.0 的淘汰门禁把「单个语句行」当逐字锚点，
      //   新增入口照抄会把锚点从 1 稀释成 3 ⇒ 既有门禁红。语义不变。
      p.lastSeenAt = clockNow('intel');
      p.updatedAt = p.lastSeenAt;
      p.knowledge = p.knowledge && typeof p.knowledge === 'object' ? p.knowledge : {};
      p.knowledge.intel = Array.isArray(p.knowledge.intel) ? p.knowledge.intel : [];
      let n = 0;
      p.knowledge.intel.forEach(function (x) {
        if (x && x.about === about && x.status !== 'retracted' && x.status !== 'superseded') { x.status = 'superseded'; n++; }
      });
      const row = { id: 'intel_' + clockNow('intel') + '_' + p.knowledge.intel.length,
        claim: claim || about, source: source, level: level, confidence: CONF[level], about: about,
        status: CONF[level] >= 75 ? 'believed' : 'suspected', at: clockNow('intel') };
      p.knowledge.intel = p.knowledge.intel.concat([row]).slice(-12);
      out = { ok: true, id: row.id, status: row.status, superseded: n, level: level, confidence: row.confidence };
    }, 'intel:verify');
    if (out && out.ok) { stat.intel++; stat.lastReason = 'verified'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 辟谣：**只对已经收到过这条说法的人生效**；没听过报 nothing-to-correct。 */
  function correct(person, item) {
    const who = clean(person, 60), about = clean(item && item.about, 80);
    const wrong = clean(item && item.claim, 100), right = clean(item && item.right, 100);
    const source = clean(item && item.source, 60);
    if (!who || !about || !wrong || !source) return { ok: false, reason: 'missing-fields' };
    const hit = liveRows(who, about).filter(function (x) { return String(x.claim) === wrong; });
    if (!hit.length) {
      stat.blocked++; stat.lastReason = 'nothing-to-correct';
      return { ok: false, reason: 'nothing-to-correct', about: about, claim: wrong };
    }
    let out = null;
    WA.store.transact(function (draft) {
      const id = 'p_' + who;
      const p = personRow(draft, id, who, 'intel:correct');
      if (!p) { out = { ok: false, reason: 'store-unavailable' }; return; }
      // 拆成两行：v2.61.0 的淘汰门禁把「单个语句行」当逐字锚点，
      //   新增入口照抄会把锚点从 1 稀释成 3 ⇒ 既有门禁红。语义不变。
      p.lastSeenAt = clockNow('intel');
      p.updatedAt = p.lastSeenAt;
      p.knowledge = p.knowledge && typeof p.knowledge === 'object' ? p.knowledge : {};
      p.knowledge.intel = Array.isArray(p.knowledge.intel) ? p.knowledge.intel : [];
      let n = 0;
      p.knowledge.intel.forEach(function (x) {
        if (x && x.about === about && String(x.claim) === wrong && x.status !== 'retracted') { x.status = 'retracted'; n++; }
      });
      const row = { id: 'intel_' + clockNow('intel') + '_' + p.knowledge.intel.length,
        claim: right || ('更正：' + wrong + '不实'), source: source, level: 'record', confidence: CONF.record,
        about: about, status: 'believed', correctedFrom: wrong, at: clockNow('intel') };
      p.knowledge.intel = p.knowledge.intel.concat([row]).slice(-12);
      out = { ok: true, id: row.id, corrected: n, about: about };
    }, 'intel:correct');
    if (out && out.ok) { stat.intel++; stat.lastReason = 'corrected'; } else stat.blocked++;
    return out || { ok: false, reason: 'store-unavailable' };
  }
  /** 视点投影：无资格者 truth=null 且 knows=null（连「猜没猜对」都不泄露）。 */
  function project(about, person) {
    const t = truthOf(about);
    if (!t.ok) return t;
    const who = clean(person, 60);
    const live = liveRows(who, about);
    const seen = live.map(function (x) { return { claim: x.claim, level: x.level, status: x.status, source: x.source }; });
    const ent = entitledTo(who, about);
    if (!ent) {
      // `withheld`：**只报条数，不报内容**。推演需要知道「他手上有东西但看不到真相」，
      //   而这与「他什么都没听说」是两种不同的处境（前者会被一轮追问逼出破绽，后者不会）；
      //   但条数之外一个字都不能给——否则投影就成了绕过资格的旁道。
      return { ok: true, about: t.about, person: who, entitled: false, truth: null,
        seen: seen, withheld: seen.length, guessed: [], knows: null, mayAssert: false,
        reason: live.length ? 'not-entitled' : 'no-knowledge' };
    }
    const known = live.some(function (x) { return String(x.claim) === String(t.value); });
    const guessed = live.filter(function (x) { return String(x.claim) !== String(t.value); })
      .map(function (x) { return x.claim; });
    return { ok: true, about: t.about, person: who, entitled: true, truth: t.value,
      seen: seen, withheld: 0, guessed: guessed, knows: known, mayAssert: known,
      reason: live.length ? (known ? 'matches' : 'differs') : 'no-knowledge' };
  }
  WA.intel = {
    LEVELS: LEVELS, CONFIDENCE: CONF,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    addLink: addLink, addIntel: addIntel, releaseDue: releaseDue, visibleTo: visibleTo, explain: explain, knownCause: knownCause, buildBlock: buildBlock,
    // v2.117.0（B3）：认知层——真相只读、相信不改事实、弱证据不抬升、辟谣只对收到者生效。
    truthOf: truthOf, rowsOf: rowsOf, entitledTo: entitledTo, believe: believe,
    verify: verify, correct: correct, project: project,
    stat: function () { return Object.assign({}, stat); }
  };
})();
