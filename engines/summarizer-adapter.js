/**
 * WorldAxis engines/summarizer-adapter.js (v2.407.0) — 总结接口适配层（三缝②）
 *
 * ── 它治什么（缺口，现场核对）──────────────────────────────────────
 *   `engines/summarizer.js` 的两级压缩（纪要 smallSummaries → 总述 bigSummaries）
 *   是**闭环**：产在 `WA.store.memory` 里、喂给 `summarizer.buildBlock()`，
 *   注入面只在本插件内部。而 `engines/memory-relay.js`（V23-2）虽然开了
 *   `compose/attach/buildBlock`，但它的输入面要求调用方**自己把摘要字符串造出来**——
 *   两模块之间没有任何一行代码把它们接起来（实测：relay 的 compose 调用点是面板
 *   手填摘要，summarizer 的产物从来进不去）。
 *
 *   后果：本插件已经压好的两级摘要，换不了格式、出不了插件、也拿不回来自外部
 *   记忆插件的摘要 —— 玩家装了别的记忆插件，两边的摘要只能各过各的。
 *
 * ── 本适配层做四件事，每件一个硬条件 ────────────────────────────
 *   ① `exportDigest(opt)` —— 把 `WA.store.memory` 的两级摘要导成**标准格式**：
 *      `{ v, at, rounds, entries: [{ tier, content, from, range, at }] }`。
 *      每条**必须带 from 与 range**（与 memory-relay 边界⑥同规）：
 *      无出处的摘要不收 —— 挂一条不知从哪来的记忆比不挂更坏。
 *      一条都没有 ⇒ 如实报 `empty-source`，不拿标题凑一条「像样」的摘要。
 *   ② `importDigest(doc, opt)` —— 读外部标准格式，**只读校验**后交给
 *      memory-relay 的 compose/attach（可指定 target）。不收原文数组
 *      （与 relay 边界②同规：接口上就拿不到原文，防「合并两份聊天」）。
 *   ③ `buildBlock(target)` —— 注入面：只输出**摘要文本**，每条带来源标注，
 *      并明写「这是摘要，不是原文」，避免模型当成本段聊天发生过的事。
 *   ④ `view()` —— 读侧：能导几条、来自哪个 tier、上一轮导入结果。
 *
 * ── 九条否定式边界（本模块存在的全部理由）───────────────────────
 *   ① 总开关默认关闭，关闭时三个写/读口一律如实报 `disabled`。
 *   ② **不产摘要、不改摘要**：本模块零模型调用。摘要真源永远是 summarizer，
 *      本模块只搬（导出/导入），不新造也不改写一条。
 *   ③ **不写 store.memory**：记忆层唯一写者是 summarizer。本模块对它是纯只读。
 *   ④ **不写 store** 任何容器：导入的落点是 memory-relay 自己的互通表
 *      （relay 边界⑧ 零 store 写，本模块跟随）。
 *   ⑤ **摘要为空即拒**：`empty-source` 带上哪一段是空的（同 relay 边界⑤）。
 *   ⑥ **无出处的条目拒收**：缺 from 或 range ⇒ `missing-provenance`，
 *      不静默补一个「未知来源」（那等于伪造溯源）。
 *   ⑦ 格式版本锁定：只认 `v === FORMAT_V`（1）。不认识的版本 ⇒ `bad-version`，
 *      不做「尽力解析」——猜格式的写法会把外部字段错读成本插件的语义。
 *   ⑧ **超过上限如实截断并报 `truncated`**（同 relay 的 maxSummaryChars 口径），
 *      不静默砍掉半句当完整句子。
 *   ⑨ 零落盘：标准格式只经返回值传递，不写 localStorage / 不写文件。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_summarizer_adapter_settings_v1';
  const FORMAT_V = 1;
  const DEF = { enabled: false, maxDigestChars: 1200, maxEntries: 40 };
  const __REG = { key: LS_KEY, def: DEF, module: 'summarizerAdapter' };
  const __stat = { exported: 0, imported: 0, refused: 0, lastReason: '', lastAt: 0 };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try { return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {})); }
    catch (e) { return Object.assign({}, DEF); }
  }

  function note(reason) {
    __stat.refused++;
    __stat.lastReason = reason;
    __stat.lastAt = (WA.clock && WA.clock.now ? WA.clock.now('summarizer-adapter') : Date.now());
  }
  // ── ① exportDigest：把本插件的两级摘要导成标准格式（纯只读） ──
  // 只读 store.memory 两张表，不改一个字段。tier：'big'（阶段史）/ 'small'（近期纪要）。
  function exportDigest(opt) {
    const o = opt || {};
    if (!settings().enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    let s = null;
    try { s = WA.store.get(); } catch (e) { note('store-absent'); return { ok: false, reason: 'store-absent' }; }
    const mem = (s && s.memory) || {};
    const bigs = Array.isArray(mem.bigSummaries) ? mem.bigSummaries : [];
    const smalls = Array.isArray(mem.smallSummaries) ? mem.smallSummaries : [];
    const entries = [];
    const cap = settings().maxDigestChars;
    const sourceName = String(o.from || o.source || 'WorldAxis.summarizer');
    const addEntry = function (tier, row, used) {
      if (!row || typeof row.content !== 'string' || !row.content.trim()) return;
      const rangeParts = [row.startLayer, row.endLayer].filter(function (x) { return typeof x === 'number'; });
      if (!rangeParts.length) { note('missing-provenance'); return; }
      const text = row.content;
      const truncated = text.length > cap;
      const entry = {
        tier: tier, content: truncated ? text.slice(0, cap) : text,
        from: sourceName, range: rangeParts.join('-'), at: row.at || 0, truncated: truncated
      };
      if (used !== undefined) entry.used = !!used;
      entries.push(entry);
    };
    // 总述在前（阶段史优先级高于近期纪要，与 summarizer.buildBlock 同序）。
    bigs.forEach(function (b) { addEntry('big', b); });
    smalls.forEach(function (x) { addEntry('small', x, x && x.used); });
    if (!entries.length) {
      // 边界⑤：一条都没有就如实报空，不拿标题凑一条「像样」的摘要。
      note('empty-source');
      return { ok: false, reason: 'empty-source', hint: '本段聊天还没有任何摘要（summarizer 未跑过或两级都为空）' };
    }
    const lim = settings().maxEntries;
    const dropped = Math.max(0, entries.length - lim);
    const kept = dropped > 0 ? entries.slice(0, lim) : entries;
    const out = {
      v: FORMAT_V,
      at: (WA.clock && WA.clock.now ? WA.clock.now('summarizer-adapter') : Date.now()),
      rounds: typeof o.rounds === 'number' ? o.rounds : 0,
      source: String(o.source || 'WorldAxis'),
      entries: kept
    };
    __stat.exported++;
    __stat.lastAt = out.at;
    if (dropped > 0) return { ok: true, truncated: true, dropped: dropped, doc: out };
    return { ok: true, doc: out };
  }

  // ── ② importDigest：读外部标准格式 → 校验 → 交 memory-relay 落地 ──
  // 校验三道（版本 / 出处 / 非空），全过才交给 relay；relay 缺席如实报 relay-absent。
  function importDigest(doc, opt) {
    const o = opt || {};
    if (!settings().enabled) { note('disabled'); return { ok: false, reason: 'disabled' }; }
    if (!doc || typeof doc !== 'object') { note('bad-doc'); return { ok: false, reason: 'bad-doc' }; }
    // 边界⑦：版本锁死，不做「尽力解析」（猜格式会把外部字段错读成本插件语义）。
    if (doc.v !== FORMAT_V) { note('bad-version'); return { ok: false, reason: 'bad-version', expected: FORMAT_V, got: doc.v }; }
    const list = Array.isArray(doc.entries) ? doc.entries : [];
    if (!list.length) { note('empty-source'); return { ok: false, reason: 'empty-source', hint: '导入文档没有任何摘要条目' }; }
    const cap = settings().maxDigestChars;
    const accepted = [];
    let truncated = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || typeof e.content !== 'string' || !e.content.trim()) continue;
      // 边界⑥：无出处拒收，不补「未知来源」（那等于伪造溯源）。
      const from = typeof e.from === 'string' ? e.from.trim() : '';
      const range = typeof e.range === 'string' ? e.range.trim() : '';
      if (!from || !range) { note('missing-provenance'); return { ok: false, reason: 'missing-provenance', index: i, hint: '第 ' + i + ' 条缺 from 或 range' }; }
      const over = e.content.length > cap;
      if (over) truncated++;
      accepted.push({ tier: String(e.tier || 'small'), content: over ? e.content.slice(0, cap) : e.content, from: from, range: range, at: e.at || 0 });
    }
    if (!accepted.length) { note('empty-source'); return { ok: false, reason: 'empty-source' }; }
    // 交 relay：compose（主体=本段聊天 + 次体=导入源）→ attach 到 target。
    if (!WA.memoryRelay || typeof WA.memoryRelay.compose !== 'function') { note('relay-absent'); return { ok: false, reason: 'relay-absent' }; }
    const target = String(o.target || 'current');
    const summaryText = accepted.map(function (x) { return '（' + x.from + ' · ' + x.range + '）' + x.content; }).join('\n\n');
    let composed = null;
    try {
      composed = WA.memoryRelay.compose({
        subject: { kind: 'chat', id: target },
        objects: [{ kind: 'chat', id: String(doc.source || 'external'), label: String(doc.source || 'external'), summary: summaryText, range: accepted.map(function (x) { return x.range; }).join(',') }],
        ranges: [{ from: String(doc.source || 'external'), range: accepted[0].range }]
      });
    } catch (e) { note('relay-threw'); return { ok: false, reason: 'relay-threw', error: String(e && e.message || e) }; }
    if (!composed || composed.ok === false) {
      const rsn = (composed && composed.reason) || 'compose-refused';
      note(rsn);
      return { ok: false, reason: rsn, relay: composed };
    }
    let attached = null;
    try {
      const rid = composed.id || (composed.relay && composed.relay.id) || '';
      attached = WA.memoryRelay.attach(rid, { target: target });
    } catch (e) { note('attach-threw'); return { ok: false, reason: 'attach-threw', composed: composed, error: String(e && e.message || e) }; }
    if (!attached || attached.ok !== true) {
      const rsn = (attached && attached.reason) || 'attach-threw';
      note(rsn);
      return { ok: false, reason: rsn, composed: composed, attached: attached };
    }
    __stat.imported++;
    __stat.lastAt = (WA.clock && WA.clock.now ? WA.clock.now('summarizer-adapter') : Date.now());
    return { ok: true, count: accepted.length, truncated: truncated, composed: composed, attached: attached };
  }

  // ── ③ buildBlock：注入面（只出摘要文本 + 明写「这是摘要不是原文」） ──
  // 本模块自己的导出走 relay.buildBlock（互通表里的才是「跨聊天记忆」）；
  // 本段摘要若也想进注入面，走 summarizer.buildBlock（记忆层唯一真源）。
  // 这里只做**格式标注**：让模型分清哪段是摘要、从哪来、覆盖哪几楼。
  function buildBlock(target) {
    if (!settings().enabled) return '';
    if (!WA.memoryRelay || typeof WA.memoryRelay.buildBlock !== 'function') return '';
    let inner = '';
    try { inner = WA.memoryRelay.buildBlock(String(target || 'current')) || ''; }
    catch (e) { return ''; }
    if (!inner || !inner.trim()) return '';
    return '【跨聊天摘要（注意：这是摘要，不是本段原文）】\n' + inner
      + '\n（以上为摘要转述。本段聊天里未发生过其中描述的场景；如需引用，按「听说/记得」处理，不得当成本段已发生的事实。）';
  }

  // ── ④ view：读侧（能导几条、上一轮结果） ──
  function view() {
    let counts = { big: 0, small: 0 };
    try {
      const s = WA.store.get();
      const mem = (s && s.memory) || {};
      counts.big = (Array.isArray(mem.bigSummaries) ? mem.bigSummaries : []).filter(function (x) { return x && x.content; }).length;
      counts.small = (Array.isArray(mem.smallSummaries) ? mem.smallSummaries : []).filter(function (x) { return x && x.content; }).length;
    } catch (e) {}
    return {
      settings: settings(), formatV: FORMAT_V, exportable: counts,
      stat: Object.assign({}, __stat),
      relayReady: !!(WA.memoryRelay && typeof WA.memoryRelay.compose === 'function')
    };
  }

  WA.summarizerAdapter = {
    exportDigest: exportDigest, importDigest: importDigest, buildBlock: buildBlock, view: view,
    FORMAT_V: FORMAT_V,
    getSettings: function () { return settings(); },
    setSettings: function (patch) {
      if (!WA.settingsBus) return { ok: false, reason: 'settings-bus-absent' };
      try {
        const next = WA.settingsBus.normalize(__REG, Object.assign({}, DEF, settings(), patch || {}));
        WA.settingsBus.saveOrThrow(__REG, next);
        return { ok: true, settings: settings() };
      } catch (e) { return { ok: false, reason: 'save-failed', error: String(e && e.message || e) }; }
    },
    stat: function () { return Object.assign({}, __stat); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/summarizer-adapter.js', { kind: 'engine', ver: '2.407.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/summarizer-adapter 已加载（2.407.0）');

})();