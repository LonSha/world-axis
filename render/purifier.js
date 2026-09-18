/** WorldAxis render/purifier.js (v0.2) — 输出净化（缝合 Veridis规则引擎 + 通用规则集） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_purifier_rules_v1';
  // v2.1.0: 净化运行观测（此前 apply 零调用 = 功能失效，接入后必须能回答「到底净化了没有」）
  const __purifyStat = { runs: 0, changed: 0, charsSaved: 0, blocked: 0, lastAt: 0, ruleErrors: 0, lastRules: [],
    imported: 0, importFailed: 0, lastImport: null };   // v2.2.0: 导入治理可观测

  // 内置常见净化规则（用户可扩展）
  const BUILTIN = [
    { id: 'think_block', name: '移除思考块', find: '<think>[\\s\\S]*?</think>', replace: '', flags: 'g', enabled: true },
    { id: 'json_fence', name: '移除孤立JSON代码块', find: '```json\\s*[\\s\\S]*?```', replace: '', flags: 'g', enabled: false }
  ];

  const __REG = { key: LS_KEY, def: null, module: 'purifier' };
  // v2.3.0: 读路径统一走 settingsBus（写路径早已迁移）。
  //   此前自写 try/catch 看似稳健实则掩盖损坏：JSON 坏掉时静默回落内置规则，
  //   用户自定义规则无声消失且不留任何痕迹。迁后由 settingsBus 隔离为 <key>_corrupt_<ts>。
  function loadRules() {
    const saved = WA.settingsBus.read(__REG);
    return Array.isArray(saved) ? saved : BUILTIN.slice();
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
function saveRules(rules) { WA.settingsBus.save(__REG, rules); }

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
    /**
     * v2.2.0: 安全导入预设（此前 loadPreset 零调用 = 导入能力无入口）。
     *   入参可为 JSON 字符串或对象；逐条准入（必须有 find，正则可编译），
     *   非法条目拒收并归因（不把坏规则写进存档——那会让净化整体静默失效）。
     */
    importPresetSafe(input) {
      let preset = input;
      if (typeof input === 'string') {
        try { preset = JSON.parse(input); }
        catch (e) { __purifyStat.importFailed++; __purifyStat.lastImport = 'parse-fail'; return { ok: false, reason: 'parse-fail', added: 0 }; }
      }
      if (!preset || typeof preset !== 'object') { __purifyStat.importFailed++; __purifyStat.lastImport = 'not-object'; return { ok: false, reason: 'not-object', added: 0 }; }
      // 兼容两种形态：Veridis 预设（{type, rules}）与裸规则数组
      const rawRules = Array.isArray(preset) ? preset : (Array.isArray(preset.rules) ? preset.rules : null);
      if (!rawRules) { __purifyStat.importFailed++; __purifyStat.lastImport = 'no-rules'; return { ok: false, reason: 'no-rules', added: 0 }; }
      const accepted = [];
      let rejected = 0, reasons = [];
      for (const r of rawRules) {
        if (!r || typeof r.find !== 'string' || !r.find) { rejected++; if (reasons.length < 3) reasons.push('missing-find'); continue; }
        try { new RegExp(r.find, r.flags || 'g'); }
        catch (e) { rejected++; if (reasons.length < 3) reasons.push('bad-regex:' + ((e && e.message) || '').slice(0, 30)); continue; }
        accepted.push({ id: 'vr_' + (r.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 5))),
          name: r.name || r.find.slice(0, 20), find: r.find, replace: r.replace || '', flags: r.flags || 'g', enabled: r.enabled !== false });
      }
      if (!accepted.length) { __purifyStat.importFailed++; __purifyStat.lastImport = 'all-rejected'; return { ok: false, reason: 'all-rejected', added: 0, rejected: rejected, reasons: reasons }; }
      this.rules = this.rules.concat(accepted);
      saveRules(this.rules);
      __purifyStat.imported += accepted.length; __purifyStat.lastImport = 'ok:' + accepted.length;
      WA.log('info', '净化规则导入 ' + accepted.length + ' 条（拒收 ' + rejected + '）');
      return { ok: true, added: accepted.length, rejected: rejected, reasons: reasons };
    },
    /** v2.2.0: 删除规则（此前 removeRule 零调用 = 加错了删不掉） */
    removeRuleSafe(id) {
      if (!id) return { ok: false, reason: 'no-id' };
      const before = this.rules.length;
      this.rules = this.rules.filter(r => r.id !== id);
      if (this.rules.length === before) return { ok: false, reason: 'not-found' };
      saveRules(this.rules);
      return { ok: true, remaining: this.rules.length };
    },
    /** v2.2.0: 新增规则（带准入，替代裸 addRule 的静默接受非法正则） */
    addRuleSafe(rule) {
      const r = rule || {};
      if (typeof r.find !== 'string' || !r.find) return { ok: false, reason: 'missing-find' };
      try { new RegExp(r.find, r.flags || 'g'); }
      catch (e) { return { ok: false, reason: 'bad-regex:' + ((e && e.message) || '').slice(0, 40) }; }
      const id = r.id || ('r' + Date.now().toString(36));
      this.rules.push({ id: id, name: r.name || r.find.slice(0, 20), find: r.find, replace: r.replace || '', flags: r.flags || 'g', enabled: r.enabled !== false });
      saveRules(this.rules);
      return { ok: true, id: id, total: this.rules.length };
    },
    /** v2.2.0: 恢复内置规则（用户清空后可复原） */
    resetToBuiltin() {
      this.rules = BUILTIN.slice();
      saveRules(this.rules);
      return { ok: true, total: this.rules.length };
    },
    /** v2.1.0: 净化统计（此前 apply 零调用，功能整体失效——接入输出链后须可观测） */
    stat() { return { runs: __purifyStat.runs, changed: __purifyStat.changed, charsSaved: __purifyStat.charsSaved, blocked: __purifyStat.blocked, lastAt: __purifyStat.lastAt, ruleErrors: __purifyStat.ruleErrors, lastRules: __purifyStat.lastRules.slice(0, 8),
      imported: __purifyStat.imported, importFailed: __purifyStat.importFailed, lastImport: __purifyStat.lastImport, ruleCount: this.rules.length }; },
    /** v2.1.0: 安全净化——空结果守卫（规则把正文清空时回退原文，绝不静默吞掉整条回复） */
    applySafe(text, opts) {
      const o = opts || {};
      const src = String(text == null ? '' : text);
      __purifyStat.runs++;
      let out = src, hit = [];
      for (const r of this.rules) {
        if (!r || !r.enabled) continue;
        let next = out;
        try { next = out.replace(new RegExp(r.find, r.flags || 'g'), r.replace || ''); }
        catch (e) { __purifyStat.ruleErrors++; continue; }
        if (next !== out) hit.push(r.id);
        out = next;
      }
      __purifyStat.lastAt = Date.now();
      if (out !== src && !out.trim() && src.trim()) {
        // 守卫：净化后为空但原文非空——规则过宽，回退原文（否则整条回复消失且无从察觉）
        __purifyStat.blocked++;
        if (WA.log) WA.log('warn', '净化被空结果守卫拦下（规则过宽），已回退原文', { rules: hit });
        return src;
      }
      if (out !== src) {
        __purifyStat.changed++; __purifyStat.charsSaved += (src.length - out.length);
        __purifyStat.lastRules = hit;
        if (o.silent !== true && WA.log) WA.log('info', '输出净化命中 ' + hit.length + ' 条规则（-' + (src.length - out.length) + ' 字符）', { rules: hit });
      }
      return out;
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