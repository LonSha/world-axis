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
        return { ids: data.ids.filter(id => typeof id === 'string'), t: Number(data.t) || 0, overrides: sanitizeOverrides(data.overrides) };
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
    mainWin.localStorage.setItem(getSelectionKey(), JSON.stringify({ ids: uniqueIds, t: clockNow('worldbook'), overrides: trimmed }));
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

  function activationOf(entry, scanText, mode) {
    const m = mode || 'auto';
    if (m === 'off') return { active: false, reason: '关闭(覆写)' };
    if (m === 'const') return { active: true, reason: '强制常驻(覆写)' };
    if (m === 'auto' && entry.constant) return { active: true, reason: '🔵常驻' };
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

  WA.worldbook = {
    hasSelection, getSelectedIds, getOverrides, saveSelectedIds, saveSelection,
    loadCurrentEntries, buildPromptSection, triggerEnabled,
    isEntryActive, activationOf, matchKey,
    seedEntries, peekEntries, previewActivation, OVERRIDE_VALUES
  };
})();