/**
 * WorldAxis engines/worldbook.js (v0.8)
 * 当前聊天世界书读取 + 蓝绿灯关键词触发引擎
 * 缝合来源：DlSNlGHT World —— world-engine-worldbook.js
 *
 * 机制：
 *  - 读取酒馆当前世界书条目（动态import world-info.js）
 *  - 按聊天隔离持久化已选条目 + 每条触发覆写（const|key|off）
 *  - 复刻酒馆关键词匹配：正则键/整词匹配(仅ASCII)/次键四逻辑(AND_ANY|NOT_ALL|NOT_ANY|AND_ALL)
 *  - 只扫描本扩展喂给推演的上下文，不监听酒馆聊天扫描（解耦）
 *  - 过滤 TavernDB-ACU 开头条目（不显示不可选不注入）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  const mainWin = WA.mainWin || window;
  const LS_PREFIX = 'worldaxis_wb_selection_';

  let worldInfoModulePromise = null;
  // v2.35.0: 条目缓存——面板同步渲染 / 无头测试 seedEntries mock，不必真 import 酒馆模块。
  let cachedEntries = [];

  const LOGIC = { AND_ANY: 0, NOT_ALL: 1, NOT_ANY: 2, AND_ALL: 3 };
  const OVERRIDE_VALUES = ['const', 'key', 'off'];

  function getChatId() {
    try { return WA.store.currentBranchId ? ('c' + WA.store.currentBranchId()) : 'default'; }
    catch (e) { return 'default'; }
  }
  function getSelectionKey() { return LS_PREFIX + getChatId(); }

  function sanitizeOverrides(obj) {
    const out = {};
    if (obj && typeof obj === 'object') {
      for (const k in obj) {
        if (typeof k === 'string' && OVERRIDE_VALUES.indexOf(obj[k]) !== -1) out[k] = obj[k];
      }
    }
    return out;
  }

  function parseStored(raw) {
    try {
      const data = JSON.parse(raw || '[]');
      if (Array.isArray(data)) return { ids: data.filter(id => typeof id === 'string'), t: 0, overrides: {} };
      if (data && Array.isArray(data.ids)) {
        return { ids: data.ids.filter(id => typeof id === 'string'), t: Number(data.t) || 0, overrides: sanitizeOverrides(data.overrides), autoGreen: data.autoGreen === true };
      }
    } catch (e) {}
    return { ids: [], t: 0, overrides: {} };
  }

  // v2.11.0: 读失败与「用户没选过条目」必须分开。此前两者都得到 {ids:[]} / false，
  //   于是「选择的世界书条目读不出来」会表现为「用户没选任何条目」——注入静默少一块，
  //   而界面上没有任何异常（与 workflow/inject/index 三处日志静默清空同型）。
  function noteWbRead(key, err) {
    try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail('worldbookSelection', key, err); } catch (e) {}
  }
  function readStored() {
    let raw = null;
    try { raw = mainWin.localStorage.getItem(getSelectionKey()); }
    catch (e) { noteWbRead(getSelectionKey(), e); return { ids: [], t: 0, overrides: {}, readFailed: true }; }
    return parseStored(raw);
  }
  function hasSelection() {
    try { return mainWin.localStorage.getItem(getSelectionKey()) !== null; }
    catch (e) { noteWbRead(getSelectionKey(), e); return false; }
  }
  function getSelectedIds() { return readStored().ids; }
  function getOverrides() { return readStored().overrides; }

  function persistSelection(ids, overrides) {
    const uniqueIds = [...new Set(Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : [])];
    const idSet = new Set(uniqueIds);
    const ov = sanitizeOverrides(overrides);
    const trimmed = {};
    for (const k in ov) if (idSet.has(k)) trimmed[k] = ov[k];
    // v2.568.0：autoGreen 是同一份选择的开关位，存盘必须带上——否则「保存一次选择」会把它静默清回默认。
    mainWin.localStorage.setItem(getSelectionKey(), JSON.stringify({ ids: uniqueIds, t: clockNow('worldbook'), overrides: trimmed, autoGreen: autoGreenOn() }));
  }
  function saveSelectedIds(ids) { persistSelection(ids, readStored().overrides); }
  function saveSelection(ids, overrides) { persistSelection(ids, overrides); }

  function getEntryId(entry) { return `${entry.world || '未知世界书'}::${entry.uid}`; }
  function getEntryTitle(entry) {
    const comment = String(entry.comment || '').trim();
    if (comment) return comment;
    const keys = Array.isArray(entry.key) ? entry.key.filter(Boolean).join('、') : '';
    if (keys) return keys;
    const content = String(entry.content || '').trim();
    return content ? content.substring(0, 40) : `条目 ${entry.uid}`;
  }

  async function getWorldInfoModule() {
    if (!worldInfoModulePromise) {
      worldInfoModulePromise = import('/scripts/world-info.js').catch(error => {
        worldInfoModulePromise = null;
        throw error;
      });
    }
    return worldInfoModulePromise;
  }

  async function loadCurrentEntries() {
    const module = await getWorldInfoModule();
    if (typeof module.getSortedEntries !== 'function') {
      throw new Error('当前 SillyTavern 版本不支持读取世界书条目');
    }
    const entries = await module.getSortedEntries();
    const mapped = (Array.isArray(entries) ? entries : [])
      .filter(entry => entry && entry.uid !== undefined && String(entry.content || '').trim())
      .filter(entry => !getEntryTitle(entry).startsWith('TavernDB-ACU'))
      .map(entry => ({
        id: getEntryId(entry),
        uid: entry.uid,
        world: entry.world || '未知世界书',
        title: getEntryTitle(entry),
        content: String(entry.content || '').trim(),
        disabled: entry.disable === true || entry.enabled === false,
        constant: entry.constant === true,
        vectorized: entry.vectorized === true,
        selective: entry.selective === true,
        selectiveLogic: Number(entry.selectiveLogic) || 0,
        keys: Array.isArray(entry.key) ? entry.key.filter(k => typeof k === 'string' && k.trim()) : [],
        secondaryKeys: Array.isArray(entry.keysecondary) ? entry.keysecondary.filter(k => typeof k === 'string' && k.trim()) : [],
        caseSensitive: entry.caseSensitive === true,
        matchWholeWords: entry.matchWholeWords === true
      }));
    seedEntries(mapped);
    return mapped;
  }

  /** v2.35.0: 无头/面板写入条目缓存（loadCurrentEntries 成功路径也会走这里） */
  function seedEntries(list) {
    cachedEntries = Array.isArray(list) ? list.slice() : [];
    return cachedEntries.length;
  }
  function peekEntries() { return cachedEntries.slice(); }

  /**
   * v2.35.0: 蓝绿灯触发预览（同步，读缓存 + 当前选择/覆写）。
   * 触发关闭时已选条目视为全量注入；未选/禁用单独标原因。
   */
  function previewActivation(scanText) {
    const stored = readStored();
    const selectedIds = new Set(stored.ids || []);
    const overrides = stored.overrides || {};
    const triggerOn = triggerEnabled();
    const text = String(scanText || '');
    return peekEntries().map(function (entry) {
      const selected = selectedIds.has(entry.id);
      const mode = overrides[entry.id] || 'auto';
      let act;
      if (!selected) act = { active: false, reason: '未选' };
      else if (entry.disabled) act = { active: false, reason: '条目禁用' };
      else if (!triggerOn) act = { active: true, reason: '触发关闭·全量注入' };
      else act = activationOf(entry, text, mode);
      return {
        id: entry.id, title: entry.title, world: entry.world,
        selected: selected, override: mode,
        keys: entry.keys || [], constant: !!entry.constant, disabled: !!entry.disabled,
        active: !!act.active, reason: act.reason
      };
    });
  }

  // ── 蓝绿灯触发引擎 ─────────────────────────────────────
  function triggerEnabled() {
    try {
      const s = WA.backstage && WA.backstage.getSettings ? WA.backstage.getSettings() : {};
      return s.worldbookTrigger === true;
    } catch (e) { return false; }
  }

  function parseRegexKey(str) {
    const m = /^\/(.+)\/([a-z]*)$/i.exec(str);
    if (!m) return null;
    try { return new RegExp(m[1], m[2]); } catch (e) { return null; }
  }

  function matchKey(text, key, caseSensitive, matchWholeWords) {
    if (typeof key !== 'string' || !text) return false;
    const needle = key.trim();
    if (!needle) return false;
    const re = parseRegexKey(needle);
    if (re) { try { return re.test(text); } catch (e) { return false; } }
    if (matchWholeWords && /[A-Za-z0-9_]/.test(needle) && /^[\x00-\x7F]+$/.test(needle)) {
      const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try { return new RegExp('(?:^|\\W)(?:' + esc + ')(?:\\W|$)', caseSensitive ? '' : 'i').test(text); } catch (e) {}
    }
    return caseSensitive ? text.indexOf(needle) !== -1 : text.toLowerCase().indexOf(needle.toLowerCase()) !== -1;
  }

  // ── v2.568.0（引擎深度第二主线）：常驻条目的**关键词闸** ──────────────
  //
  // 治的病：`constant` / 强制常驻的条目**恒常占上下文预算**，与「本轮聊到没聊到它」无关。
  //   本仓此前的做法是事后结算采纳率（engines/inject-value.js），能事后看出「这条没人用」，
  //   但**本轮仍然已经注进去了** —— 读数能追责，不能止损。
  //
  // 所以在这里加一道**事前**闸：常驻条目若能从它的标题/正文里派生出合格的**短词**
  //   （engines/green-keys.js 的口径：2–6 字、非分类名、非抽象名、非句子碎片），
  //   而本轮上下文一个都没命中，则**本轮**不注入；下一轮重新判。
  //
  // 四条否定式边界（缺一条就会静默丢内容，这正是本闸最大的风险）：
  //   ① **默认关闭**（`autoGreen` 位默认 false）—— 关闭时 `activationOf` 行为逐字不变；
  //   ② **派生不出键就放行**（fail-open）：「没有键」不等于「不相关」，否则短条目全被误杀；
  //   ③ **本轮为空文本时放行**：没有可扫的上下文时不能判「没命中」；
  //   ④ **只作用于常驻面**：本来就走关键词的条目不受影响（它们已经是「按需」的了）。
  //   另：触发关闭（全量注入）模式下本闸不参与 —— 那是用户显式要的「全量」。
  function autoGreenOn() {
    try { return readStored().autoGreen === true; } catch (e) { return false; }
  }
  function setAutoGreen(on) {
    const st = readStored();
    if (st.readFailed) return { ok: false, reason: 'read-failed' };
    try {
      mainWin.localStorage.setItem(getSelectionKey(), JSON.stringify({
        ids: st.ids || [], t: clockNow('worldbook'), overrides: st.overrides || {}, autoGreen: !!on
      }));
      return { ok: true, autoGreen: !!on };
    } catch (e) { return { ok: false, reason: 'write-failed' }; }
  }
  /** 从条目标题+正文派生短键（纯派生，不落盘不改条目）。 */
  function greenKeysOf(entry) {
    const GK = WA.greenKeys;
    if (!GK || typeof GK.deriveGreenKeys !== 'function') return [];
    try {
      const names = [getEntryTitle(entry)];
      const body = String(entry && entry.content || '').split(/\n/).slice(0, 4);
      for (let i = 0; i < body.length; i++) if (String(body[i]).trim()) names.push(String(body[i]).trim());
      const ks = GK.deriveGreenKeys(names, { max: 12 });
      return Array.isArray(ks) ? ks : [];
    } catch (e) { return []; }
  }
  /** 常驻条目的相关性判决。返回 { active, reason }，语义与 activationOf 同构。 */
  function constGate(entry, scanText) {
    // 边界④（纵深防御）：本闸只服务于常驻面 —— 调用方传错条目也不能让它误伤
    //   本来就走关键词的条目（那些条目自己已经是「按需」的了）。
    if (!entry || entry.constant !== true) return { active: true, reason: 'not-const(放行)' };
    if (!autoGreenOn()) return { active: true, reason: null };
    const text = String(scanText == null ? '' : scanText);
    if (!text) return { active: true, reason: 'no-text(放行)' };
    const keys = greenKeysOf(entry);
    if (!keys.length) return { active: true, reason: 'no-green-keys(放行)' };
    for (let i = 0; i < keys.length; i++) {
      if (text.indexOf(keys[i]) >= 0) return { active: true, reason: '🔵常驻·绿灯命中「' + keys[i] + '」' };
    }
    return { active: false, reason: '🔵常驻但本轮无命中（绿灯闸）', keys: keys };
  }

  function activationOf(entry, scanText, mode) {
    const m = mode || 'auto';
    if (m === 'off') return { active: false, reason: '关闭(覆写)' };
    if (m === 'const') {
      const g = constGate(entry, scanText);
      return g.active ? { active: true, reason: g.reason || '强制常驻(覆写)' } : { active: false, reason: g.reason, keys: g.keys };
    }
    if (m === 'auto' && entry.constant) {
      const g = constGate(entry, scanText);
      return g.active ? { active: true, reason: g.reason || '🔵常驻' } : { active: false, reason: g.reason, keys: g.keys };
    }
    const primary = entry.keys || [];
    if (!primary.length) return { active: false, reason: entry.vectorized ? '🔗向量条目(不触发)' : '无主关键词' };
    const cs = entry.caseSensitive, mw = entry.matchWholeWords;
    const hitKey = primary.find(k => matchKey(scanText, k, cs, mw));
    if (!hitKey) return { active: false, reason: '🟢未命中' };
    const sec = entry.secondaryKeys || [];
    if (!entry.selective || !sec.length) return { active: true, reason: '🟢命中「' + hitKey + '」' };
    const anySec = sec.some(k => matchKey(scanText, k, cs, mw));
    const allSec = sec.every(k => matchKey(scanText, k, cs, mw));
    let ok;
    switch (entry.selectiveLogic) {
      case LOGIC.AND_ALL: ok = allSec; break;
      case LOGIC.NOT_ALL: ok = !allSec; break;
      case LOGIC.NOT_ANY: ok = !anySec; break;
      default: ok = anySec;
    }
    return { active: ok, reason: ok ? ('🟢命中「' + hitKey + '」+次键') : '🟢主命中但次键逻辑不满足' };
  }

  function isEntryActive(entry, scanText, mode) { return activationOf(entry, scanText, mode).active; }

  /**
   * 构建世界书注入段。scanText：本扩展喂给推演的上下文（近期对话）。
   * 触发关闭时全部已选条目注入。
   */
  async function buildPromptSection(scanText) {
    const stored = readStored();
    const selectedIds = new Set(stored.ids);
    if (!selectedIds.size) return '';

    const triggerOn = triggerEnabled();
    const overrides = stored.overrides || {};
    const text = String(scanText || '');

    try {
      const entries = await loadCurrentEntries();
      const pool = entries.filter(entry => selectedIds.has(entry.id) && !entry.disabled);
      if (!pool.length) return '';

      let selectedEntries;
      if (triggerOn) {
        const decided = pool.map(entry => {
          const r = activationOf(entry, text, overrides[entry.id]);
          return { entry, active: r.active, reason: r.reason };
        });
        selectedEntries = decided.filter(d => d.active).map(d => d.entry);
        WA.log('info', `世界书蓝绿灯：${selectedEntries.length}/${pool.length} 注入`);
      } else {
        selectedEntries = pool;
      }

      if (!selectedEntries.length) return '';

      const content = selectedEntries.map(entry =>
        `【${entry.world} / ${entry.title}】\n${entry.content}`
      ).join('\n\n');

      return `========== 已选世界书条目 ==========
以下内容是当前聊天的世界观事实与约束。后台推演必须遵守；不得擅自改写其既定设定。

${content}`;
    } catch (error) {
      WA.log('warn', '读取已选世界书失败: ' + (error && error.message));
      return '';
    }
  }

  // ── FateLoom 指纹冲突防护与单条目增量 Oplog ────────────────
  const fingerprints = new Map();
  const oplog = [];

  function hashContent(text) {
    const s = String(text || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h) + s.charCodeAt(i);
      h |= 0;
    }
    return 'h_' + (h >>> 0).toString(16);
  }

  function rememberFingerprint(entryId, content) {
    fingerprints.set(String(entryId), hashContent(content));
  }

  function isHandEdited(entryId, currentContent) {
    const id = String(entryId);
    if (!fingerprints.has(id)) return false;
    const known = fingerprints.get(id);
    const curr = hashContent(currentContent);
    return known !== curr;
  }

  function safeUpdateEntry(entryId, newContent, options) {
    options = options || {};
    const id = String(entryId);
    const hit = cachedEntries.find(e => String(e.id) === id);
    if (!hit) return { ok: false, reason: 'entry-not-found', entryId: id };

    if (isHandEdited(id, hit.content) && !options.force) {
      return {
        ok: false,
        reason: 'hand-edited-conflict',
        entryId: id,
        hint: '条目内容已被外部手动修改，拒绝静默覆盖（需 force: true）'
      };
    }

    const old = hit.content;
    const nextText = String(newContent || '');
    hit.content = nextText;
    rememberFingerprint(id, nextText);

    oplog.push({
      op: 'update',
      entryId: id,
      oldContent: old,
      newContent: nextText,
      at: clockNow('worldbook')
    });
    if (oplog.length > 50) oplog.shift();

    return {
      ok: true,
      entryId: id,
      newHash: hashContent(nextText),
      oplogCount: oplog.length
    };
  }

  function rollbackLastOp() {
    if (!oplog.length) return { ok: false, reason: 'empty-oplog' };
    const last = oplog.pop();
    if (last.op === 'update') {
      const hit = cachedEntries.find(e => String(e.id) === last.entryId);
      if (hit) {
        hit.content = last.oldContent;
        rememberFingerprint(last.entryId, last.oldContent);
        return {
          ok: true,
          rolledBack: true,
          entryId: last.entryId,
          restoredContent: last.oldContent
        };
      }
      return { ok: false, reason: 'target-entry-missing-on-rollback', entryId: last.entryId };
    }
    return { ok: false, reason: 'unknown-op' };
  }

  function getOplog() {
    return oplog.slice();
  }

  WA.worldbook = {
    hasSelection, getSelectedIds, getOverrides, saveSelectedIds, saveSelection,
    loadCurrentEntries, buildPromptSection, triggerEnabled,
    isEntryActive, activationOf, matchKey,
    seedEntries, peekEntries, previewActivation, OVERRIDE_VALUES,
    // v2.568.0：getAutoGreen/setAutoGreen 是用户面开关（ui/panel.js 的世界书段真渲染 + 真回写）；
    //   greenKeysOf / constGate 是**内部判据**（派生短键、判决常驻相关性），外部零消费者。
    //   此前一并挂上导出面，实测被门禁判 self-only 过度导出 —— 收回内部，不留在承诺面上。
    getAutoGreen: autoGreenOn, setAutoGreen: setAutoGreen,
    hashContent, rememberFingerprint, isHandEdited, safeUpdateEntry, rollbackLastOp, getOplog
  };
})();