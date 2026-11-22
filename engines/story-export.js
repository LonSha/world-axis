/**
 * WorldAxis engines/story-export.js (v2.529.0) — 纯正文导出（纯函数）
 *
 * 缝合来源：nekotools modules/textmanager.js::exportPureStoryTxt（201-245 行）。
 * 病：本仓的楼层文本里混着结构化标签（ws_* 块、[[NT_STATUS]] 标记、宿主 HTML），
 *   用户想把自己这局的故事拿出来复读/投稿时**没有出口**——`纯正文` 全仓零命中。
 * 边界：只做字符串变换，不碰 DOM、不触发下载（下载是宿主的事）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /** 剥干净：结构化块整段去掉 → 状态标记整行去掉 → HTML 去掉 → 收敛空行。 */
  function strip(text) {
    return String(text == null ? '' : text)
      .replace(/<ws_[^>]*>[\s\S]*?<\/ws_[^>]*>/gi, '')
      .replace(/<nekotools:[^>]*>[\s\S]*?<\/nekotools:[^>]*>/gi, '')
      .replace(/\[\[NT_STATUS\]\][^\n]*/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  /**
   * 组一份纯正文。
   * @param {Array} chat 楼层数组
   * @param {{favoritesOnly?:boolean, from?:number, to?:number, includeNames?:boolean,
   *          skipSystem?:boolean, skipHidden?:boolean}} opts
   */
  function build(chat, opts) {
    const o = opts || {};
    const list = Array.isArray(chat) ? chat : [];
    const includeNames = o.includeNames !== false;
    const skipSystem = o.skipSystem !== false;
    const skipHidden = o.skipHidden === true;
    const favoritesOnly = o.favoritesOnly === true;
    const start = Math.max(0, Number(o.from) || 0);
    // to 非法（NaN/非数）按「到末尾」处理：导出是只读操作，宁可多导也不要整段作废
    const toNum = (o.to === null || o.to === undefined) ? null : Number(o.to);
    const end = Number.isFinite(toNum) ? Math.min(list.length - 1, Math.max(0, toNum)) : list.length - 1;

    const blocks = [];
    let skipped = 0;
    list.forEach(function (m, i) {
      if (i < start || i > end) { skipped++; return; }
      if (!m || !m.mes) { skipped++; return; }
      if (favoritesOnly && !(m.extra && m.extra.waxFavorite)) { skipped++; return; }
      // 系统消息不是剧情；但「被插件为省 token 隐藏的楼层」仍是剧情，照常导出
      if (skipSystem && m.is_system && !(m.extra && m.extra.waxHiddenByPlugin)) { skipped++; return; }
      if (skipHidden && m.extra && m.extra.hidden) { skipped++; return; }
      const text = strip(m.mes);
      if (!text) { skipped++; return; }
      blocks.push(includeNames ? ((m.is_user ? 'User' : (m.name || 'AI')) + '：' + text) : text);
    });
    return { text: blocks.join('\n\n'), floors: blocks.length, skipped: skipped, from: start, to: end };
  }

  WA.storyExport = { build: build, strip: strip };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/story-export.js', { kind: 'engine', ver: '2.529.0' });
})();