/**
 * WorldAxis engines/memory-relay.js (v2.402.0) — V23-2 记忆互通（缝异空间 V1.4）
 *
 * ── 它治什么（缺口，现场核对）──────────────────────────────────────
 *   `engines/summarizer.js` 是**单段聊天内部**的两级压缩（纪要 → 阶段史），
 *   `engines/pmem.js` 是逐楼记忆覆盖，二者都在「同一段聊天」里打转。
 *   产品面上没有任何一处能把「A 段聊天的摘要」交给「B 段聊天」——
 *   实测 `grep -rc 'memoryRelay\|记忆互通\|crossChat' engines/ core/` 零命中。
 *   后果是：换一段聊天就得从头介绍一遍世界，而读者（模型）不知道前面发生过什么。
 *
 * ── 缝合来源（显式写明，不冒称原创）────────────────────────────────
 *   异空间 V1.4 的「记忆互通」，原文口径三句：
 *     · 选**主体**（一段聊天或一段小剧场记忆）+ 至少一个**次体**；
 *     · 生成时可选取楼层范围与是否含隐藏/系统楼层，摘要**可编辑**；
 *     · **传递的是摘要上下文，不会把两份完整聊天合并** —— 原文特别点名
 *       「别混为一谈：存档用于回到原聊天继续演绎，互通记忆用于给另一段聊天提供摘要」。
 *
 * ── 本模块只做四件事，每件一个硬条件 ───────────────────────────────
 *   ① `compose(spec)`  —— 组一次互通：主体 + ≥1 次体 + 每段的范围与摘要，
 *      组不出摘要的**如实报 `empty-source`**，不拿标题凑一条「像样」的摘要。
 *   ② `attach(id, spec)` —— 把互通挂到某段聊天上（`target`），
 *      同一聊天同一次互通**不重复挂**（`already-attached`）。
 *   ③ `buildBlock(target)` —— 注入面：只输出**摘要文本**，每条带来源标注，
 *      并明写「这是摘要，不是原文」，避免模型把它当成本段聊天里发生过的事。
 *   ④ `view()` —— 读侧：已有的互通、各自挂在哪、条数。
 *
 * ── 八条否定式边界（本模块存在的全部理由）──────────────────────────
 *   ① 总开关默认关闭，关闭时写口一律 `disabled`。
 *   ② **不合并原文**：本模块的输入面只有「摘要字符串」，**不接受消息数组** ——
 *      接口上就拿不到原文，从结构上防止「合并两份聊天」这件原文点名禁止的事。
 *   ③ **主体必须存在且不是次体**：`subject.kind` 只认 `chat` / `stage`，
 *      且主体不能同时出现在次体列表里（`subject-in-objects`）。
 *   ④ **至少要一个次体**：零次体的「互通」等于没互通（`missing-objects`）。
 *   ⑤ **摘要为空即拒**：`empty-source` 带上哪一段是空的 —— 空摘要挂上去
 *      会让模型以为「那段时间什么都没发生」，与「那段没读过」是两件事。
 *   ⑥ **摘要必须可溯源**：每条都记 `from`（哪段）与 `range`（哪个楼层区间），
 *      缺 `from` 的摘要一律拒收 —— 挂一条不知道出处的记忆比不挂更坏。
 *   ⑦ **同一目标不重复挂**：`attach` 对 `(target, relayId)` 幂等并如实报
 *      `already-attached`，不静默累加（累加会让同一段摘要被注入两遍）。
 *   ⑧ **零 store 写**：只记自己的互通表，不碰 `WA.store`。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_memory_relay_settings_v1';
  const DEF = {
    enabled: false,
    /** 一次互通最多几个次体（0 = 不限）。上限存在的理由：注入面是有预算的。 */
    maxObjects: 4,
    /** 一条摘要最多多少字（超出截断并如实报 `truncated`）。 */
    maxSummaryChars: 1200,
    /** 同一目标最多挂几次互通。 */
    maxRelaysPerTarget: 3
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'memoryRelay' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { composed: 0, attached: 0, refused: 0, lastReason: '' };

  const RELAYS = [];
  /** target（聊天 id / 舞台 id） → 挂着的 relayId 列表 */
  const ATTACH = {};
  let serial = 0;

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function str(v, max) { return String(v == null ? '' : v).slice(0, max || 200); }
  function refuse(code, hint) { stat.refused++; stat.lastReason = code; return { ok: false, reason: code, hint: hint }; }

  /**
   * 组一次互通。
   * @param {object} spec {
   *   subject: { kind:'chat'|'stage', id, label },
   *   objects: [{ kind, id, label, summary, range }],
   *   at
   * }
   * ⚠ 接口上刻意**没有** `messages` / `raw` / `lines` 字段 —— 本模块拿不到原文，
   *   于是「把两份完整聊天合并」这件事在结构上不可能发生（边界 ②）。
   */
  function compose(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled', '记忆互通默认关闭，先在设置里打开');

    const s = spec && typeof spec === 'object' ? spec : {};
    const sub = s.subject && typeof s.subject === 'object' ? s.subject : null;
    if (!sub) return refuse('missing-subject', 'missing-subject：必须先选主体（一段聊天或一段小剧场记忆）');
    const subKind = str(sub.kind, 20);
    if (['chat', 'stage'].indexOf(subKind) < 0) {
      return refuse('bad-subject-kind', 'bad-subject-kind：' + subKind + ' 不在 chat / stage 两档内（互通只在这两类之间做）');
    }
    const subId = str(sub.id, 80).trim();
    if (!subId) return refuse('missing-subject-id', 'missing-subject-id：主体要给 id，只给名字无法确认读的是哪一段');

    const objs = Array.isArray(s.objects) ? s.objects.filter(function (o) { return o && typeof o === 'object'; }) : [];
    if (!objs.length) {
      // 边界 ④：零次体的「互通」等于没互通。
      return refuse('missing-objects', 'missing-objects：至少要选一个次体，否则这段记忆没有来源可挂');
    }
    if (cfg.maxObjects > 0 && objs.length > cfg.maxObjects) {
      return refuse('too-many-objects', 'too-many-objects：次体 ' + objs.length + ' 个，超过上限 ' + cfg.maxObjects + '（注入面有预算）');
    }
    // 边界 ③：主体不能同时出现在次体里。
    for (let i = 0; i < objs.length; i++) {
      if (str(objs[i].kind, 20) === subKind && str(objs[i].id, 80) === subId) {
        return refuse('subject-in-objects', 'subject-in-objects：主体不能同时当次体（那会把同一段摘要注入两遍）');
      }
    }

    const parts = [];
    const empties = [];
    let truncated = 0;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const from = str(o.label, 60).trim() || str(o.id, 80);
      // 边界 ⑥：摘要必须可溯源。缺 from 的一律拒 —— 挂一条不知道出处的记忆比不挂更坏。
      if (!from) return refuse('missing-origin', 'missing-origin：第 ' + (i + 1) + ' 个次体既无 label 也无 id，摘要无处可溯');
      let body = String(o.summary == null ? '' : o.summary).trim();
      if (!body) {
        // 边界 ⑤：空摘要如实报，不拿标题凑。
        empties.push(from);
        continue;
      }
      if (cfg.maxSummaryChars > 0 && body.length > cfg.maxSummaryChars) {
        body = body.slice(0, cfg.maxSummaryChars);
        truncated++;
      }
      parts.push({ from: from, kind: str(o.kind, 20), id: str(o.id, 80), range: str(o.range, 40), text: body });
    }
    if (!parts.length) {
      return refuse('empty-source', 'empty-source：所有次体都没有摘要（' + empties.join('、') + '）——「没读过」与「那段时间什么都没发生」不是一回事，不能互相顶替');
    }

    serial += 1;
    const relay = {
      id: 'mr-' + Date.now().toString(36) + '-' + serial,
      subject: { kind: subKind, id: subId, label: str(sub.label, 60) },
      parts: parts,
      at: num(s.at) || 0,
      truncated: truncated,
      emptySources: empties
    };
    RELAYS.push(relay);
    stat.composed++;
    return {
      ok: true, id: relay.id, parts: parts.length,
      truncated: truncated,
      emptySources: empties,
      // 把原文的口径直接写进读数，让 UI 不必再解释一遍：
      note: '互通传递的是摘要上下文，不合并两份完整聊天；要回到原聊天继续演绎请用存档'
    };
  }

  /**
   * 把一次互通挂到某段聊天 / 舞台。
   */
  function attach(id, spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled', '记忆互通默认关闭');
    const rid = str(id, 80);
    const relay = RELAYS.filter(function (r) { return r.id === rid; })[0];
    if (!relay) return refuse('unknown-relay', 'unknown-relay：' + rid + ' 不在互通表内');
    const s = spec && typeof spec === 'object' ? spec : {};
    const target = str(s.target, 80).trim();
    if (!target) return refuse('missing-target', 'missing-target：要挂到哪段聊天上，不替你猜');
    const list = ATTACH[target] = ATTACH[target] || [];
    // 边界 ⑦：幂等，不静默累加。
    if (list.indexOf(rid) >= 0) {
      return refuse('already-attached', 'already-attached：这次互通已经挂在 ' + target + ' 上（重复挂会让同一段摘要注入两遍）');
    }
    if (cfg.maxRelaysPerTarget > 0 && list.length >= cfg.maxRelaysPerTarget) {
      return refuse('too-many-relays', 'too-many-relays：' + target + ' 已挂 ' + list.length + ' 次，上限 ' + cfg.maxRelaysPerTarget);
    }
    list.push(rid);
    stat.attached++;
    return { ok: true, id: rid, target: target, count: list.length };
  }

  function detach(id, target) {
    const rid = str(id, 80), t = str(target, 80);
    const list = ATTACH[t];
    if (!list) return { ok: false, reason: 'not-found', hint: 'not-found：' + t + ' 上没有挂过互通' };
    const i = list.indexOf(rid);
    if (i < 0) return { ok: false, reason: 'not-found', hint: 'not-found：' + t + ' 上没有挂 ' + rid };
    list.splice(i, 1);
    if (!list.length) delete ATTACH[t];
    return { ok: true, id: rid, target: t, count: (ATTACH[t] || []).length };
  }

  /**
   * 注入面：只输出摘要文本，每条带来源与区间，并明写「这是摘要不是原文」。
   */
  function buildBlock(target) {
    const t = str(target, 80);
    const list = ATTACH[t];
    if (!list || !list.length) return '';
    const out = [];
    out.push('【互通记忆】以下是**其他聊天的摘要**，不是本段聊天里发生过的事；'
      + '可据此了解前情，但不得当作本段已发生的事实续写，也不得替玩家补齐细节。');
    for (let i = 0; i < list.length; i++) {
      const r = RELAYS.filter(function (x) { return x.id === list[i]; })[0];
      if (!r) continue;
      const subLabel = r.subject.label || r.subject.id;
      for (let j = 0; j < r.parts.length; j++) {
        const p = r.parts[j];
        out.push('· 来自「' + p.from + '」' + (p.range ? '（' + p.range + '）' : '')
          + '，主体「' + subLabel + '」：' + p.text);
      }
    }
    return out.join('\n');
  }

  function view() {
    const cfg = settings();
    const attached = {};
    Object.keys(ATTACH).forEach(function (k) { attached[k] = ATTACH[k].slice(); });
    return {
      enabled: !!cfg.enabled,
      relays: RELAYS.map(function (r) {
        return { id: r.id, subject: r.subject, parts: r.parts.length, truncated: r.truncated, emptySources: r.emptySources };
      }),
      attached: attached,
      stat: Object.assign({}, stat),
      settings: { maxObjects: cfg.maxObjects, maxSummaryChars: cfg.maxSummaryChars, maxRelaysPerTarget: cfg.maxRelaysPerTarget }
    };
  }

  function setSettings(patch) {
    if (!WA.settingsBus) return { ok: false, hint: 'settingsBus 不可用' };
    const merged = Object.assign({}, settings(), patch && typeof patch === 'object' ? patch : {});
    try { WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged)); } catch (e) {
      return { ok: false, hint: 'write-threw：' + (e && e.message ? e.message : '未知') };
    }
    const back = settings();
    if (back.enabled !== merged.enabled) {
      return { ok: false, hint: 'write-verify：写后回读不一致（enabled ' + String(merged.enabled) + ' → ' + String(back.enabled) + '）' };
    }
    return { ok: true, settings: back };
  }

  function reset() {
    RELAYS.length = 0;
    Object.keys(ATTACH).forEach(function (k) { delete ATTACH[k]; });
    serial = 0;
    stat.composed = 0; stat.attached = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }

  WA.memoryRelay = {
    compose: compose,
    attach: attach,
    detach: detach,
    buildBlock: buildBlock,
    view: view,
    setSettings: setSettings,
    getSettings: settings,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/memory-relay.js', { kind: 'engine', ver: '2.402.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/memory-relay 已加载（2.402.0）');
  }
})();