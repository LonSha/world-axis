/** WorldAxis render/purifier.js (v0.2) — 输出净化（缝合 Veridis规则引擎 + 通用规则集） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_purifier_rules_v1';

  // 内置常见净化规则（用户可扩展）
  const BUILTIN = [
    { id: 'think_block', name: '移除思考块', find: '<think>[\\s\\S]*?</think>', replace: '', flags: 'g', enabled: true },
    { id: 'json_fence', name: '移除孤立JSON代码块', find: '```json\\s*[\\s\\S]*?```', replace: '', flags: 'g', enabled: false }
  ];

  function loadRules() {
    try {
      const saved = JSON.parse(WA.mainWin.localStorage.getItem(LS_KEY) || 'null');
      if (saved && Array.isArray(saved)) return saved;
    } catch (e) {}
    return BUILTIN.slice();
  }
  function saveRules(rules) { WA.mainWin.localStorage.setItem(LS_KEY, JSON.stringify(rules)); }

  WA.purifier = {
    rules: loadRules(),
    getRules() { return this.rules; },
    addRule(rule) { this.rules.push(Object.assign({ id: 'r' + Date.now(), flags: 'g', enabled: true }, rule)); saveRules(this.rules); },
    removeRule(id) { this.rules = this.rules.filter(r => r.id !== id); saveRules(this.rules); },
    setEnabled(id, on) { const r = this.rules.find(x => x.id === id); if (r) { r.enabled = !!on; saveRules(this.rules); } },
    /** 导入Veridis预设 */
    loadPreset(preset) {
      if (preset && preset.type === 'veridis-rewrite-preset' && Array.isArray(preset.rules)) {
        const imported = preset.rules.filter(r => r && r.find).map(r => ({ id: 'vr_' + (r.id || Date.now() + Math.random().toString(36).slice(2, 5)), name: r.name || r.find.slice(0, 20), find: r.find, replace: r.replace || '', flags: r.flags || 'g', enabled: true }));
        this.rules = this.rules.concat(imported);
        saveRules(this.rules);
        WA.log('info', '净化规则导入 ' + imported.length + ' 条');
        return imported.length;
      }
      return 0;
    },
    /** 应用净化到文本 */
    apply(text) {
      let out = String(text || '');
      for (const r of this.rules) {
        if (!r.enabled) continue;
        try { out = out.replace(new RegExp(r.find, r.flags || 'g'), r.replace || ''); } catch (e) { WA.log('warn', '净化规则异常 ' + r.id, e.message); }
      }
      return out;
    }
  };
})();