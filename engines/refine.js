/**
 * WorldAxis engines/refine.js (v2.130.0) — 档案精编（缝 D2）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓的人物档案 / 组织纪事 / 事件台账是**只增不减**的（挤出只按条数环形丢尾，
 *   不管内容重复）。同一件事被记了三遍、同一条设定写了两处、短句堆成一堆——
 *   这些在面板上人人都看得见，但没有任何一处能把它们**规范化 / 去重 / 压短**。
 *   用户只能自己一条条删，删完还不能批量做。
 *
 *   缝合来源：SoulLink —— 原文口径是「档案可精编：规范化格式、合并重复、提炼浓缩，
 *   单个与全部都支持，多处并发执行」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `normalize(list)` —— 规范化：去首尾空白、统一全角空格、剥控制符（**纯函数**）；
 *   ② `merge(list)` —— 合并重复条目（按规范化后的文本比），并记「哪几条被并成了一条」；
 *   ③ `condense(list, maxLen)` —— 提炼浓缩：超长条目截到 `maxLen` 并在尾部标注省略，
 *      **不生成新内容**（本模块不调 API）。
 *
 *   三者都是**纯函数**：收一份数组、回一份数组，**不写 store**。
 *   落手（把结果写回档案）由调用方做——那一步才需要事务、权限与挤出。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时三个函数一律**原样返回**（并带 `disabled:true`），
 *      绝不返回空数组——空数组会让调用方把档案清空。
 *   2 **不生成新内容**：本模块不做摘要、不调 API、不“措辞润色”。
 *      浓缩只是**截断 + 省略号**，保内容可追溯（编出来的摘要无法回溯原文）。
 *   3 合并只在**规范化后完全相同**时发生（不相似度匹配）：
 *      相似匹配会把两条不同的设定判成一条，代价是永久丢一条。
 *   4 合并不丢信息：被并掉的条目原文仍出现在 `merged[].from` 里，供面板展开。
 *   5 输入非数组一律拒收（`bad-type`）；数组里的非字符串项**逐项跳过并记数**
 *      （不整批拒——档案里混一个坏项就全不精编，反而更坏），但条数如实报出。
 *   6 空数组是**正常结果**（`{ok:true, rows:[], count:0}`），不是错误：
 *      “没有档案可编”与“编坏了”必须能分开。
 *   7 不写 store、不进 `SOURCES`：精编结果由调用方决定要不要落盘。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_refine_settings_v1';
  const DEF = { enabled: false, maxLen: 120, keepTail: false };
  const __REG = { key: LS_KEY, def: DEF, module: 'refine', bounds: { maxLen: [8, 2000] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { seen: 0, kept: 0, merged: 0, trimmed: 0, skipped: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }

  function normOne(v) {
    return String(v)
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .replace(/[\u3000\t]+/g, ' ')
      .replace(/ {2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function rowsOf(list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    let skipped = 0;
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const t = (it && typeof it === 'object' && typeof it.text === 'string') ? it.text : it;
      if (typeof t !== 'string') { skipped++; continue; }
      out.push({ raw: t, norm: normOne(t) });
    }
    stat.skipped += skipped;
    stat.seen += list.length;
    return { rows: out, skipped: skipped };
  }

  function normalize(list) {
    if (!settings().enabled) { stat.blocked++; stat.lastReason = 'disabled'; return { ok: true, rows: Array.isArray(list) ? list.slice() : [], count: Array.isArray(list) ? list.length : 0, disabled: true }; }
    const r = rowsOf(list);
    if (r === null) { noteFault('bad-type'); return { ok: false, reason: 'bad-type' }; }
    return { ok: true, rows: r.rows.map(function (x) { return x.norm; }), count: r.rows.length, skipped: r.skipped };
  }

  function merge(list) {
    if (!settings().enabled) { stat.blocked++; stat.lastReason = 'disabled'; return { ok: true, rows: Array.isArray(list) ? list.slice() : [], merged: [], count: Array.isArray(list) ? list.length : 0, disabled: true }; }
    const r = rowsOf(list);
    if (r === null) { noteFault('bad-type'); return { ok: false, reason: 'bad-type' }; }
    const seen = {};
    const out = [];
    const merged = [];
    r.rows.forEach(function (x) {
      if (!x.norm) return;
      if (Object.prototype.hasOwnProperty.call(seen, x.norm)) {
        const g = seen[x.norm];
        g.from.push(x.raw);
        stat.merged++;
        return;
      }
      seen[x.norm] = { key: x.norm, from: [x.raw] };
      out.push(x.norm);
    });
    Object.keys(seen).forEach(function (k) { if (seen[k].from.length > 1) merged.push({ key: k, from: seen[k].from, n: seen[k].from.length }); });
    stat.kept += out.length;
    stat.lastReason = merged.length ? 'merged' : 'clean';
    return { ok: true, rows: out, merged: merged, count: out.length, dropped: r.rows.length - out.length, skipped: r.skipped };
  }

  /** 提炼浓缩：只截断，不生成（边界 2）。keepTail=true 时保尾部（台账类更适合留尾）。 */
  function condense(list, maxLen) {
    if (!settings().enabled) { stat.blocked++; stat.lastReason = 'disabled'; return { ok: true, rows: Array.isArray(list) ? list.slice() : [], count: Array.isArray(list) ? list.length : 0, disabled: true }; }
    const r = rowsOf(list);
    if (r === null) { noteFault('bad-type'); return { ok: false, reason: 'bad-type' }; }
    const cap = Number(maxLen) || settings().maxLen;
    const out = r.rows.map(function (x) {
      if (x.norm.length <= cap) return x.norm;
      stat.trimmed++;
      return settings().keepTail ? ('…' + x.norm.slice(x.norm.length - (cap - 1))) : (x.norm.slice(0, cap - 1) + '…');
    });
    stat.kept += out.length;
    stat.lastReason = stat.trimmed ? 'trimmed' : 'clean';
    return { ok: true, rows: out, count: out.length, cap: cap, skipped: r.skipped };
  }

  /** 一条龙：规范化 → 合并 → 浓缩。三处共用同一份设置，不重复读。 */
  function polish(list, maxLen) {
    const m = merge(list);
    if (!m.ok) return m;
    const c = condense(m.rows, maxLen);
    if (!c.ok) return c;
    return { ok: true, rows: c.rows, merged: m.merged, count: c.rows.length,
      dropped: m.dropped || 0, skipped: (m.skipped || 0) + (c.skipped || 0), steps: ['normalize', 'merge', 'condense'] };
  }

  WA.refine = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    normalize: normalize, merge: merge, condense: condense, polish: polish,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/refine.js', { kind: 'engine', ver: '2.130.0' });
})();
