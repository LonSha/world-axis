/** WorldAxis render/purifier.js — 输出净化（缝合 Veridis规则引擎；可直接导入 veridis-rewrite-preset）骨架 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  WA.purifier = {
    rules: [],
    loadPreset(preset) { if (preset && preset.type === 'veridis-rewrite-preset') { this.rules = (preset.rules || []).filter(r => r && r.find); WA.log('info', '净化规则载入 ' + this.rules.length + ' 条'); } },
    apply(text) {
      let out = String(text || '');
      for (const r of this.rules) { try { out = out.replace(new RegExp(r.find, r.flags || 'g'), r.replace || ''); } catch (e) {} }
      return out;
    }
  };
})();
