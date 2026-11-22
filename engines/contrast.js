/**
 * WorldAxis engines/contrast.js (v2.529.0) — 可读性对比度（WCAG）与背景压暗量
 *
 * 缝合来源：RedBird-Tools src/core/quote.ts（54 行，带 quote.test.ts 检查每个色值 ≥ 4.5:1）。
 *
 * 病：本仓的界面颜色是**手挑**的，没有任何一处能证明「这行字在它自己的底色上读得出来」。
 *   换主题、加背景图、深色/浅色切换时，同一组色值里必有一半是错的，而这种错**不会报错**
 *   —— 只会在某台手机上让人看不见字。
 *
 * 判据：WCAG 相对亮度公式 + 对比度 (L亮+0.05)/(L暗+0.05)；
 *   背景图要给一个**压暗量**（0.3–0.7）：从 0.30 起按 1% 递增，取第一个满足「所有要用到的字色
 *   都对压暗后的图 ≥ 4.5:1」的值；到 0.70 仍不满足就取 0.70（压暗上限，宁可图糊也不许字糊）。
 *   图读不到（跨站加载、还没解码）用 0.40 兜底 —— 不许当成「纯白」去算。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LOOK_KINDS = ['dark', 'light', 'warm'];
  const CANVAS = { dark: '#161618', light: '#faf9f6', warm: '#f4ecd8' };
  const ON_IMAGE_TEXT = '#ececf1';
  const SHADE_MIN = 0.3;
  const SHADE_MAX = 0.7;
  const SHADE_UNKNOWN = 0.4;
  const MIN_RATIO = 4.5;

  function hexRgb(hex) {
    const s = String(hex == null ? '' : hex).trim();
    const m = /^#([0-9a-f]{6})$/i.exec(s) || /^#([0-9a-f]{3})$/i.exec(s);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /** 一个颜色字串或 [r,g,b] → [r,g,b]；认不出返回 null（不是黑）。 */
  function toRgb(c) {
    if (Array.isArray(c)) {
      if (c.length < 3) return null;
      const out = [];
      for (let i = 0; i < 3; i++) {
        const v = Number(c[i]);
        if (!isFinite(v)) return null;
        out.push(Math.max(0, Math.min(255, v)));
      }
      return out;
    }
    return hexRgb(c);
  }

  /** WCAG 相对亮度。 */
  function relLum(rgb) {
    const c = toRgb(rgb);
    if (!c) return null;
    const ch = [];
    for (let i = 0; i < 3; i++) {
      const v = c[i] / 255;
      ch.push(v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    }
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }

  /** 对比度。任一侧认不出颜色 → 返回 0（当作不可读，倒逼调用方给合法色值）。 */
  function contrast(a, b) {
    const la = relLum(a);
    const lb = relLum(b);
    if (la == null || lb == null) return 0;
    const hi = Math.max(la, lb);
    const lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  /** 这套底色的正文色在它自己上面够不够读。返回 {ratio, ok}。 */
  function checkOn(kind, textColor) {
    const canvas = CANVAS[kind];
    if (!canvas) return { ratio: 0, ok: false };
    const t = textColor || ON_IMAGE_TEXT;
    const ratio = contrast(t, canvas);
    return { ratio: ratio, ok: ratio >= MIN_RATIO };
  }

  /**
   * 有背景图时压多深。avg = 图里偏亮那部分的平均色（0–255 三元组）。
   * texts = 这张图上要画的字色（默认只算正文色）。图读不到就传 null/undefined → 兜底值。
   */
  function shadeFor(avg, texts) {
    if (!toRgb(avg)) return SHADE_UNKNOWN;
    const list = Array.isArray(texts) && texts.length ? texts : [ON_IMAGE_TEXT];
    for (let i = Math.round(SHADE_MIN * 100); i < SHADE_MAX * 100; i++) {
      const k = i / 100;
      const bg = avg.slice(0, 3).map(function (v) { return v * (1 - k); });
      let ok = true;
      for (let j = 0; j < list.length; j++) {
        if (contrast(list[j], bg) < MIN_RATIO) { ok = false; break; }
      }
      if (ok) return k;
    }
    return SHADE_MAX;
  }

  /** 把一组「深/浅/护眼各一色」的色彩表按对比度体检一遍，返回不合格项（不抛错，供界面自检）。 */
  function auditPalette(table) {
    const bad = [];
    const rows = Array.isArray(table) ? table : [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || {};
      for (let j = 0; j < LOOK_KINDS.length; j++) {
        const kind = LOOK_KINDS[j];
        const ratio = contrast(row[kind], CANVAS[kind]);
        if (!(ratio >= MIN_RATIO)) bad.push({ id: row.id || ('#' + i), look: kind, ratio: Math.round(ratio * 100) / 100 });
      }
    }
    return bad;
  }

  WA.contrast = {
    LOOK_KINDS: LOOK_KINDS,
    CANVAS: CANVAS,
    ON_IMAGE_TEXT: ON_IMAGE_TEXT,
    SHADE_MIN: SHADE_MIN,
    SHADE_MAX: SHADE_MAX,
    SHADE_UNKNOWN: SHADE_UNKNOWN,
    MIN_RATIO: MIN_RATIO,
    hexRgb: hexRgb,
    relLum: relLum,
    contrast: contrast,
    checkOn: checkOn,
    shadeFor: shadeFor,
    auditPalette: auditPalette
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/contrast.js', { kind: 'engine', ver: '2.529.0' });
})();