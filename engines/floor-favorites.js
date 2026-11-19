/**
 * WorldAxis engines/floor-favorites.js (v2.529.0) — 楼层收藏（纯函数）
 *
 * 缝合来源：nekotools modules/textmanager.js 的收藏族（124-190 行）。
 * 病：本仓能改楼层（净化）、能数楼层（timeline）、能审计楼层（floor-changes），
 *   但「用户标记这一楼值得回看」这件事全仓零命中——`favorite` 在 engines/core/ui 下 0 个文件。
 * 边界：只读写 `chat[i].extra.waxFavorite`，不碰 mes / 不存盘（存盘由调用方决定）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const KEY = 'waxFavorite';

  function chatOf(chat) { return Array.isArray(chat) ? chat : []; }
  function entry(chat, i) {
    const c = chatOf(chat);
    const m = c[i];
    return (m && typeof m === 'object') ? m : null;
  }

  function isFav(chat, i) {
    const m = entry(chat, i);
    return !!(m && m.extra && m.extra[KEY]);
  }

  /** 切换单楼收藏：返回切换后的布尔值；楼层不存在返回 null（不是 false，避免与「取消收藏」混判）。 */
  function toggle(chat, i) {
    const m = entry(chat, i);
    if (!m) return null;
    if (!m.extra || typeof m.extra !== 'object') m.extra = {};
    m.extra[KEY] = !m.extra[KEY];
    return !!m.extra[KEY];
  }

  /** 区间收藏（0 基含端点）；from/to 顺序随便给，自动归位并夹到合法区间。 */
  function setRange(chat, from, to, value) {
    const c = chatOf(chat);
    if (!c.length) return 0;
    const a = Math.max(0, Math.min(Number(from) || 0, Number(to) == null ? Number(from) || 0 : Number(to) || 0));
    const b = Math.min(c.length - 1, Math.max(Number(from) || 0, Number(to) == null ? Number(from) || 0 : Number(to) || 0));
    let n = 0;
    for (let i = a; i <= b; i++) {
      const m = c[i];
      if (!m || typeof m !== 'object') continue;
      if (!m.extra || typeof m.extra !== 'object') m.extra = {};
      m.extra[KEY] = !!value;
      n++;
    }
    return n;
  }

  /** 收藏清单：带楼号、说话人、前 50 字预览（剥标签），供面板/导出直接用。 */
  function list(chat) {
    const out = [];
    chatOf(chat).forEach(function (m, i) {
      if (!m || !m.extra || !m.extra[KEY]) return;
      out.push({
        index: i,
        name: m.name || (m.is_user ? 'User' : 'AI'),
        isUser: !!m.is_user,
        preview: String(m.mes || '').replace(/<[^>]+>/g, '').slice(0, 50)
      });
    });
    return out;
  }

  function count(chat) { return list(chat).length; }

  WA.floorFavorites = { isFav: isFav, toggle: toggle, setRange: setRange, list: list, count: count, KEY: KEY };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/floor-favorites.js', { kind: 'engine', ver: '2.529.0' });
})();