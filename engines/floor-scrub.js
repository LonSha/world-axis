/**
 * WorldAxis engines/floor-scrub.js (v2.529.0) — 楼层文本清洗（纯函数 + 三处同步口径）
 *
 * 缝合来源：nekotools modules/textmanager.js::parseSlopRules / cleanChatSlop / undoLastClean（280-430 行）。
 *
 * 病：本仓有生成侧的去八股（deep-clean / polish），但**已经落到楼层里**的文本没有清理入口。
 *   更要紧的是 nekotools 踩过、本仓还没有判据的那个坑：改楼层文本必须同时改三处 ——
 *   `mes`、`swipes[swipe_id]`、`extra.display_text`。只改 mes 的话，用户切一次 swipe
 *   或重渲染就看到没清洗的旧文本；撤销时也必须三处一起还原。
 *
 * 边界：`plan()` 只算补丁、不落笔；真正写入与存盘由调用方做（本仓 store 是唯一写口）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /**
   * 解析规则文本，三种形态（与 nekotools 同口径）：
   *   /正则/flags       → 正则删除
   *   旧 => 新          → 字面替换
   *   裸词              → 字面删除
   * 坏正则跳过并计数（不抛：一条写坏不该让整批清洗失效）。
   */
  function parseRules(text) {
    const rules = [];
    let bad = 0;
    String(text || '').split('\n').forEach(function (raw) {
      const line = raw.trim();
      if (!line) return;
      const m = /^\/(.*)\/([a-z]*)$/.exec(line);
      if (m) {
        try {
          const flags = m[2].indexOf('g') >= 0 ? m[2] : m[2] + 'g';
          rules.push({ re: new RegExp(m[1], flags), to: '', mode: '正则' });
        } catch (e) { bad++; }
        return;
      }
      if (line.indexOf('=>') >= 0) {
        const parts = line.split('=>');
        const from = parts[0].trim();
        const to = (parts[1] || '').trim();
        if (!from) return;
        try { rules.push({ re: new RegExp(escapeRe(from), 'g'), to: to, mode: '替换' }); } catch (e) { bad++; }
        return;
      }
      try { rules.push({ re: new RegExp(escapeRe(line), 'g'), to: '', mode: '词' }); } catch (e) { bad++; }
    });
    return { rules: rules, bad: bad };
  }

  /** 收尾：删词留下的重复标点/空白收敛一下。 */
  function tidy(s) {
    return String(s)
      .replace(/，{2,}/g, '，').replace(/。{2,}/g, '。')
      .replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** 规则集 → 数组。允许直接传 parseRules 的返回值（{rules,bad}），不止数组。 */
  function rulesOf(rules) {
    if (Array.isArray(rules)) return rules;
    if (rules && Array.isArray(rules.rules)) return rules.rules;
    return [];
  }

  function apply(text, rules) {
    let out = String(text == null ? '' : text);
    let hits = 0;
    rulesOf(rules).forEach(function (r) {
      if (!r || !r.re) return; // 解析失败的行不带 re：跳过，不吞掉其余规则
      const before = out;
      out = out.replace(r.re, r.to);
      if (out !== before) hits++;
    });
    return { text: hits ? tidy(out) : out, hits: hits };
  }

  /**
   * 出补丁：每层一条 { i, mes, swipeId, swipe, display, hits }。
   * 三处同步的判据就在这里——swipe/display 只在「原本与旧 mes 同值」时才跟着改，
   * 否则说明它本来就与 mes 不同源（别的扩展写过），不许覆盖。
   */
  function plan(chat, opts) {
    const o = opts || {};
    const list = Array.isArray(chat) ? chat : [];
    const parsed = parseRules(o.rulesText || '');
    const start = Math.max(0, (o.from == null) ? ((o.rangeCount > 0) ? list.length - o.rangeCount : 0) : Number(o.from) || 0);
    const end = (o.to == null) ? list.length - 1 : Math.min(list.length - 1, Math.max(0, Number(o.to) || 0));
    const patches = [];
    let totalHits = 0;
    for (let i = start; i <= end; i++) {
      const m = list[i];
      if (!m || typeof m.mes !== 'string' || !m.mes) continue;
      if (m.is_user && o.includeUser !== true) continue;
      const r = apply(m.mes, parsed.rules);
      if (!r.hits) continue;
      const swipeId = m.swipe_id;
      const oldSwipe = (Array.isArray(m.swipes) && Number.isInteger(swipeId) && typeof m.swipes[swipeId] === 'string')
        ? m.swipes[swipeId] : null;
      const oldDisplay = (m.extra && typeof m.extra.display_text === 'string' && m.extra.display_text === m.mes)
        ? m.extra.display_text : null;
      patches.push({
        i: i, mes: r.text, hits: r.hits, swipeId: swipeId,
        swipe: (oldSwipe === m.mes) ? r.text : null,
        display: (oldDisplay === m.mes) ? r.text : null
      });
      totalHits += r.hits;
    }
    return { patches: patches, totalHits: totalHits, floors: patches.length, rules: parsed.rules.length, badRules: parsed.bad };
  }

  /** 撤销补丁：由调用方把 {i, mes, swipe, display} 原值传回来，三处一起还。 */
  function undoPlan(backup) {
    const list = Array.isArray(backup) ? backup : [];
    return {
      patches: list.map(function (b) {
        return { i: b.i, mes: b.mes, swipeId: b.swipeId, swipe: b.swipe, display: b.display };
      }),
      floors: list.length
    };
  }

  WA.floorScrub = { parseRules: parseRules, apply: apply, plan: plan, undoPlan: undoPlan, tidy: tidy };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/floor-scrub.js', { kind: 'engine', ver: '2.529.0' });
})();