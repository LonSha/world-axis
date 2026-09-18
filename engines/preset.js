/**
 * WorldAxis engines/preset.js (v0.8)
 * 推演提示词预设系统：4段可编辑·可切换·可导入导出
 * 缝合来源：DlSNlGHT World —— world-engine-preset.js
 *
 * 机制：
 *  - 4个可编辑段：engine-role(引擎角色)/reasoning(推演协议)/output-format(输出契约)/json-notes(补充规则)
 *  - 默认预设全null=回退WorldAxis内置硬编码段（backstage.js的REASONING_PROTOCOL等）
 *  - 自定义预设存localStorage，激活id与预设数组分离
 *  - getSegmentOverrides()一次性返回覆写map（避免反复parse）
 *  - backstage.buildPrompt()据此用 override || DEFAULT
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;

  const KEY_ACTIVE = 'worldaxis_active_preset';
  const KEY_CUSTOM = 'worldaxis_custom_presets';
  const DEFAULT_ID = 'default';

  const SEG_KEYS = ['engine-role', 'reasoning', 'output-format', 'json-notes'];
  const SEG_LABELS = {
    'engine-role': '① 引擎角色指令',
    'reasoning':   '② 推演判断协议',
    'output-format': '⑦ JSON输出字段说明',
    'json-notes':  '⑧ JSON补充规则'
  };

  function genId() {
    const ts = (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0;
    let rnd = '';
    try { rnd = Math.floor(Math.random() * 1e6).toString(36); } catch (e) {}
    return 'custom_' + ts.toString(36) + '_' + rnd;
  }

  function normalizePreset(obj) {
    if (!obj || typeof obj !== 'object') obj = {};
    const name = (obj.name == null ? '' : String(obj.name)).trim() || '未命名预设';
    const description = (obj.description == null ? '' : String(obj.description)).trim();
    const segments = {};
    for (const k of SEG_KEYS) {
      let v = obj.segments ? obj.segments[k] : undefined;
      segments[k] = (v == null || String(v).trim() === '') ? null : String(v);
    }
    return {
      id: (obj.id && typeof obj.id === 'string') ? obj.id : genId(),
      name, description, builtin: false, segments,
      createdAt: Number.isFinite(Number(obj.createdAt)) ? Number(obj.createdAt) : 0,
      updatedAt: Number.isFinite(Number(obj.updatedAt)) ? Number(obj.updatedAt) : 0
    };
  }

  function buildDefaultPreset() {
    return {
      id: DEFAULT_ID, name: '默认（内置）',
      description: 'WorldAxis内置推演提示词，4段均为硬编码原文。编辑或另存为即可自定义。',
      builtin: true,
      segments: { 'engine-role': null, 'reasoning': null, 'output-format': null, 'json-notes': null },
      createdAt: 0, updatedAt: 0
    };
  }

  // v2.3.0: 读路径统一走 settingsBus（写路径早已迁移）——自定义预设损坏此前被
  //   静默当成「没有自定义预设」（用户看到预设凭空消失，而不是「已隔离、可去现场查看」）。
  //   登记项上移，避免 loadCustomPresets 在模块初始化期被调用时踩 TDZ。
  const __REG_CUSTOM = { key: KEY_CUSTOM, def: [], module: 'preset' };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG_CUSTOM]);
  function loadCustomPresets() {
    const arr = WA.settingsBus.read(__REG_CUSTOM);
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const item of arr) {
      try { out.push(normalizePreset(item)); } catch (e) {}
    }
    return out;
  }
  function saveCustomPresetsArray(arr) {
    WA.settingsBus.save(__REG_CUSTOM, arr || []);
  }

  // v2.3.0: 原标 orphan:true 属误声明——本键由 setActivePresetId 主动写入、getActivePresetId 主动读取，
  //   是「用户尚未选过预设时才缺席」的可选键，不是废弃键。误标后果：面板「全部注销」会把它从登记表清掉。
  //   声明位置同时上移：本键的读写现在都经 settingsBus，而 const 登记项无提升。
  const __REG_ACTIVE = { key: KEY_ACTIVE, def: null, module: 'preset', optional: true };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG_ACTIVE]);
  // v2.3.0: 一次性格式迁移——历史版本把 id 以**裸字符串**写入本键，而本总线是 JSON 契约，
  //   首个 read 会把裸串判为损坏并隔离，用户选中的预设会静默回到默认。迁移必须在任何读取之前完成。
  (function migrateActiveKeyFormat() {
    try {
      const raw = WA.settingsBus.readRaw(KEY_ACTIVE);
      if (raw === null || raw === undefined) return;
      try { JSON.parse(raw); return; } catch (e) { /* 非合法 JSON → 确需迁移 */ }
      WA.settingsBus.save(__REG_ACTIVE, raw);
      if (WA.log) WA.log('info', 'preset：预设选中键由裸字符串迁移为 JSON 格式（防被误判为损坏）');
    } catch (e) {}
  })();
  function getActivePresetId() {
    const id = WA.settingsBus.read(__REG_ACTIVE);
    if (!id || typeof id !== 'string') return DEFAULT_ID;
    if (id !== DEFAULT_ID) {
      const found = loadCustomPresets().some(p => p.id === id);
      if (!found) { setActivePresetId(DEFAULT_ID); return DEFAULT_ID; }
    }
    return id;
  }

  function setActivePresetId(id) { WA.settingsBus.save(__REG_ACTIVE, id || DEFAULT_ID); }

  function getAllPresets() { return [buildDefaultPreset()].concat(loadCustomPresets()); }

  function getPresetById(id) {
    if (!id || id === DEFAULT_ID) return buildDefaultPreset();
    return loadCustomPresets().find(p => p.id === id) || null;
  }

  function getActivePreset() { return getPresetById(getActivePresetId()) || buildDefaultPreset(); }

  function saveCustomPreset(preset) {
    const p = normalizePreset(preset);
    if (!p.id || p.id === DEFAULT_ID) p.id = genId();
    const customs = loadCustomPresets();
    const idx = customs.findIndex(x => x.id === p.id);
    const now = Date.now();
    p.updatedAt = now;
    if (p.createdAt === 0) p.createdAt = now;
    if (idx >= 0) customs[idx] = p; else customs.push(p);
    saveCustomPresetsArray(customs);
    return p;
  }

  function saveAsCustomPreset(preset, newName) {
    const p = normalizePreset(preset);
    p.id = genId();
    if (newName && String(newName).trim()) p.name = String(newName).trim();
    p.createdAt = Date.now(); p.updatedAt = p.createdAt;
    const customs = loadCustomPresets();
    customs.push(p);
    saveCustomPresetsArray(customs);
    return p;
  }

  function deleteCustomPreset(id) {
    if (!id || id === DEFAULT_ID) return false;
    const customs = loadCustomPresets();
    const next = customs.filter(p => p.id !== id);
    if (next.length === customs.length) return false;
    saveCustomPresetsArray(next);
    if (getActivePresetId() === id) setActivePresetId(DEFAULT_ID);
    return true;
  }

  // ── 核心覆写查询 ───────────────────────────────────────
  function getSegmentOverride(segKey) {
    if (SEG_KEYS.indexOf(segKey) < 0) return null;
    const p = getActivePreset();
    if (!p || !p.segments) return null;
    const v = p.segments[segKey];
    if (v == null || String(v).trim() === '') return null;
    return String(v);
  }

  /**
   * 一次性返回4段覆写map：{key: text|null}
   * 默认预设走快路径：直接全null，0次parse
   */
  function getSegmentOverrides() {
    const out = { 'engine-role': null, 'reasoning': null, 'output-format': null, 'json-notes': null };
    // v2.3.0: 走统一入口 getActivePresetId()。此前裸读本键，而存储格式已由裸字符串变为 JSON，
    //   裸读拿到的是带引号的串 → 与 DEFAULT_ID 比对失败、getPresetById 查不到 → 覆写静默全部失效。
    const id = getActivePresetId();
    if (!id || id === DEFAULT_ID) return out;
    const p = getPresetById(id);
    if (!p) { setActivePresetId(DEFAULT_ID); return out; }
    if (!p.segments) return out;
    for (const k of SEG_KEYS) {
      const v = p.segments[k];
      out[k] = (v == null || String(v).trim() === '') ? null : String(v);
    }
    return out;
  }

  // 导入导出
  function exportPresets() {
    return JSON.stringify({ version: 1, active: getActivePresetId(), presets: loadCustomPresets() });
  }
  function importPresets(json, replace) {
    try {
      const data = JSON.parse(String(json));
      if (!data || !Array.isArray(data.presets)) return false;
      const incoming = data.presets.map(normalizePreset);
      if (replace !== true) {
        const existing = loadCustomPresets();
        const seen = new Set(existing.map(p => p.id));
        for (const p of incoming) if (!seen.has(p.id)) existing.push(p);
        saveCustomPresetsArray(existing);
      } else {
        saveCustomPresetsArray(incoming);
      }
      if (data.active) setActivePresetId(data.active);
      return true;
    } catch (e) { return false; }
  }

  WA.preset = {
    SEG_KEYS, SEG_LABELS, DEFAULT_ID,
    getAllPresets, getActivePreset, getActivePresetId, setActivePresetId,
    saveCustomPreset, saveAsCustomPreset, deleteCustomPreset,
    getSegmentOverride, getSegmentOverrides,
    exportPresets, importPresets
  };
})();