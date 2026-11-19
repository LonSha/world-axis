/**
 * WorldAxis ui/schema-view.js (v2.535.0) — 声明式视图层（schema → DOM）
 *
 * ── 它治的病 ────────────────────────────────────────────────────────────────
 *   本仓的机制是**代码**：加一个机制要改 ui/panel.js + UI_BINDINGS + MODULE_EXPORTS +
 *   出口契约 + 三本账（v2.533.0 的缝合件台账一次接线实测踩了四条）。于是「给玩家的界面」
 *   永远滞后于「内核能力」，而界面本身只有三种表现手段（读数行 / 输入框 / 按钮）——
 *   实测 ui/ 全树 svg 0 个、canvas 0 个、table 0 个。
 *
 *   对照参考实现（索绪尔的语境织机）后确认：它的机制是**数据**（showcase.blocks 是 JSON，
 *   host 有一套渲染器把它变成 filter_bar / collapse / row / stack / repeat / metric /
 *   badges / text / action / timeline / matrix）。加一套机制 = 加一个 JSON。
 *
 *   本文件就是那套渲染器的**第一版**：吃声明，出 HTML 字符串。它不认识任何具体机制
 *   （不读 store、不调引擎、零落盘），所以可以被任何页复用，也可以被专锁整块验证。
 *
 * ── 三条不变量（专锁 tests/opv31-r1-schema-view-v2535.js 逐条判）────────────────
 *   ① **未知块类型不许静默丢弃**：产出可见的「未知块」行并计入 stat().unknown ——
 *      「算不出来」与「本来就没有」在读数上必须不同形（本仓反复点过的同型错误）。
 *   ② **插值缺路径不许抛、不许编**：取不到就渲染 — 并记进 stat().missing，
 *      不许用空串冒充（空串会被读成「这个字段就是空的」）。
 *   ③ **纯函数**：同一 spec + 同一 ctx 两次渲染逐字相等（不读时钟、不读随机、不读 store）。
 *
 *   安全面：**文本字段一律先转义再插值**（txt()）。这一步不能省 —— 只对 {{…}} 的取值做
 *   转义、模板原串直通，等于把「世界里的一句话」原样注进 innerHTML：v2.535.0 首版就是
 *   这么写的，专锁 E1 当场抓到 script 标签直通。
 *
 * ── 它不做的事（写给下一个改它的人）──────────────────────────────────────────
 *   · 不绑定事件：action/filter 只出结构（带 id / data-*），绑定由消费方按既有
 *     panel.js 的 __obBind / addEventListener 纪律做 —— 渲染器里藏事件会让「谁处理了这次
 *     点击」变成不可查。
 *   · 不做样式：类名一出，样式只在 style.css（引擎零内联样式是同仓既有纪律）。
 *     唯一例外是 matrix 的 --wa-mx-cols：列数是数据，静态化不了。
 */
(function () {
  'use strict';
  var WA = window.WorldAxis = window.WorldAxis || {};
  var VER = '2.535.0';

  var _stat = { renders: 0, blocks: 0, unknown: [], missing: [], last: 0 };

  function esc(s) {
    // 四个替换值一律用 `'&' + 'amp;'` 这种拼法而不写实体字面量：本仓多份工具链会对
    // .js 里的实体字面量做一次解码，写死会在回写时退化成裸引号（属性注入）。
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      return '&' + 'quot;';
    });
  }

  /** 取值：$.a.b.c / a.b.c 两种写法都收（$ 是根，等价于 ctx 本身）。 */
  function pick(path, ctx) {
    if (path == null) return { ok: false, val: null };
    var p = String(path).trim();
    if (p.charAt(0) === '$') p = p.slice(1);
    p = p.replace(/^\./, '');
    if (!p) return { ok: true, val: ctx };
    var cur = ctx;
    var segs = p.split('.');
    for (var i = 0; i < segs.length; i++) {
      var k = segs[i];
      if (cur == null || typeof cur !== 'object') return { ok: false, val: null };
      if (!(k in cur)) return { ok: false, val: null };
      cur = cur[k];
    }
    return { ok: true, val: cur };
  }

  /** 插值：{{$.a.b}} 全串替换；取不到 → — 并记账（不抛、不编）。值本身已转义。 */
  function interp(str, ctx) {
    if (typeof str !== 'string') return str == null ? '' : String(str);
    return str.replace(/\{\{\s*([^}]+?)\s*\}\}/g, function (m, path) {
      var r = pick(path, ctx);
      if (!r.ok || r.val == null) {
        if (_stat.missing.length < 32 && _stat.missing.indexOf(path) < 0) _stat.missing.push(path);
        return '—';
      }
      if (typeof r.val === 'object') return esc(JSON.stringify(r.val));
      return esc(r.val);
    });
  }

  /** 文本字段的唯一入口：**先整串转义，再插值**（顺序反了就是 XSS）。 */
  function txt(v, ctx) { return interp(esc(v), ctx); }

  function tone(t) {
    return (t === 'ok' || t === 'warn' || t === 'bad' || t === 'info') ? t : '';
  }

  // ── 块渲染器（每个只出结构，不带事件、不带内联样式）──────────────────────
  var BL = {};

  BL.text = function (b, ctx) {
    return '<div class="' + (b.dim ? 'wa-dim' : '') + '">' + txt(b.text, ctx) + '</div>';
  };

  BL.kv = function (b, ctx) {
    var rows = (b.rows || []).map(function (r) {
      // 兼容 `v` 与 `value` 两种写法：声明式 schema 里两种都常见，收窄成一种会让
      // 上游写错时静默变成空值（专锁 E4 就是这么抓到首版只认 value 的）。
      var raw = (r.value !== undefined && r.value !== null) ? r.value : r.v;
      return '<div class="wa-kv"><span>' + txt(r.k, ctx) + '</span><b>' + txt(raw, ctx) + '</b></div>';
    }).join('');
    var head = b.title ? '<div class="wa-sec">' + txt(b.title, ctx) + '</div>' : '';
    return head + (rows || '<div class="wa-empty">' + txt(b.empty || '暂无数据', ctx) + '</div>');
  };

  BL.metric = function (b, ctx) {
    return '<div class="wa-metric' + (tone(b.tone) ? ' wa-mt-' + tone(b.tone) : '') + '">'
      + '<span class="wa-metric-label">' + txt(b.label, ctx) + '</span>'
      + '<b class="wa-metric-value">' + txt(b.value, ctx) + '</b>'
      + (b.unit ? '<span class="wa-metric-unit">' + txt(b.unit, ctx) + '</span>' : '')
      + '</div>';
  };

  BL.badges = function (b, ctx) {
    var it = (b.items || []).map(function (x) {
      var t = typeof x === 'string' ? '' : tone(x.tone);
      return '<span class="wa-badge' + (t ? ' wa-badge-' + t : '') + '">'
        + txt(typeof x === 'string' ? x : x.text, ctx) + '</span>';
    }).join('');
    return '<div class="wa-badges">' + (it || '<span class="wa-dim">' + txt(b.empty || '—', ctx) + '</span>') + '</div>';
  };

  BL.row = function (b, ctx) {
    return '<div class="wa-row">' + renderBlocks(b.children || [], ctx) + '</div>';
  };

  BL.stack = function (b, ctx) {
    return '<div class="wa-stack">' + renderBlocks(b.children || [], ctx) + '</div>';
  };

  BL.collapse = function (b, ctx) {
    return '<details class="wa-collapse"' + (b.open ? ' open' : '') + '>'
      + '<summary>' + txt(b.title || '展开', ctx) + '</summary>'
      + renderBlocks(b.children || [], ctx) + '</details>';
  };

  BL.filter = function (b, ctx) {
    // 只出控件：绑定由消费方按 id 做（渲染器里藏事件会让「谁处理了这次输入」不可查）。
    return '<div class="wa-filter"><input class="wa-input" id="' + esc(b.id || '') + '" type="search"'
      + ' placeholder="' + txt(b.placeholder || '搜索…', ctx) + '"'
      + (b.target ? ' data-target="' + esc(b.target) + '"' : '') + '/></div>';
  };

  BL.action = function (b, ctx) {
    var v = b.variant === 'primary' ? ' wa-btn-primary' : '';
    return '<button class="wa-btn wa-mini' + v + '" id="' + esc(b.id || '') + '"'
      + (b.title ? ' title="' + txt(b.title, ctx) + '"' : '')
      + '>' + txt(b.label || '执行', ctx) + '</button>';
  };

  BL.repeat = function (b, ctx) {
    var src = pick(b.source, ctx);
    var arr = (src.ok && Array.isArray(src.val)) ? src.val : [];
    if (!arr.length) return '<div class="wa-empty">' + txt(b.empty || '暂无记录', ctx) + '</div>';
    var tpl = b.block || {};
    return arr.map(function (row, i) {
      // 行内上下文 = 行对象 + $i（序号）+ $root（外层上下文），三者都只读。
      var c = Object.create(null);
      Object.keys(row && typeof row === 'object' ? row : {}).forEach(function (k) { c[k] = row[k]; });
      c.$i = i;
      c.$root = ctx;
      return renderBlock(tpl, c);
    }).join('');
  };

  /** 时间轴：按 sortBy 稳定排序（同值保持输入序 —— 排序不许改写叙事顺序）。 */
  BL.timeline = function (b, ctx) {
    var items = (b.items || []).slice();
    var key = b.sortBy || b.sortByKey;
    if (key) {
      items = items.map(function (x, i) { return { x: x, i: i }; }).sort(function (a, c) {
        var av = pick(key, a.x), cv = pick(key, c.x);
        var as = av.ok && av.val != null ? String(av.val) : '';
        var cs = cv.ok && cv.val != null ? String(cv.val) : '';
        if (as === cs) return a.i - c.i;       // 稳定：序号兜底
        return as < cs ? -1 : 1;
      }).map(function (o) { return o.x; });
    }
    if (!items.length) return '<div class="wa-empty">' + txt(b.empty || '时间轴上还没有东西', ctx) + '</div>';
    var rows = items.map(function (it) {
      var t = tone(it.tone);
      return '<div class="wa-tl-row' + (t ? ' wa-tl-' + t : '') + '">'
        + '<span class="wa-tl-dot"></span>'
        + '<div class="wa-tl-body">'
        + (it.at != null ? '<span class="wa-tl-at">' + txt(it.at, ctx) + '</span>' : '')
        + '<b class="wa-tl-title">' + txt(it.title, ctx) + '</b>'
        + (it.badge ? '<span class="wa-badge">' + txt(it.badge, ctx) + '</span>' : '')
        + (it.detail ? '<div class="wa-tl-detail">' + txt(it.detail, ctx) + '</div>' : '')
        + '</div></div>';
    }).join('');
    return '<div class="wa-tl">' + rows + '</div>';
  };

  /** 占格矩阵：格子是 DOM（不是 canvas）—— 所以可聚焦、可 tab、可被阅读器念出来。 */
  BL.matrix = function (b, ctx) {
    var cols = Number(b.cols) > 0 ? Math.floor(Number(b.cols)) : 0;
    if (!cols) {
      if (_stat.unknown.length < 32) _stat.unknown.push('matrix:cols');
      return '<div class="wa-empty">矩阵缺列数（cols）—— 这不是「没有格子」，是声明不全</div>';
    }
    var cells = (b.cells || []).map(function (c) {
      var w = Math.max(1, Math.floor(Number(c.w) || 1));
      var h = Math.max(1, Math.floor(Number(c.h) || 1));
      var t = tone(c.tone);
      return '<div class="wa-mx-cell' + (t ? ' wa-mx-' + t : '') + '"'
        + ' data-r="' + (Number(c.r) || 0) + '" data-c="' + (Number(c.c) || 0) + '"'
        + (w > 1 ? ' data-w="' + w + '"' : '') + (h > 1 ? ' data-h="' + h + '"' : '')
        + ' title="' + txt(c.detail || c.label || '', ctx) + '">'
        + '<b>' + txt(c.label, ctx) + '</b>'
        + (c.badge ? '<span class="wa-mx-badge">' + txt(c.badge, ctx) + '</span>' : '')
        + '</div>';
    }).join('');
    return '<div class="wa-mx" style="--wa-mx-cols:' + cols + '">' + cells + '</div>';
  };

  function renderBlock(b, ctx) {
    if (!b || typeof b !== 'object') return '';
    var t = String(b.type || 'stack').trim();
    var fn = BL[t];
    if (!fn) {
      if (_stat.unknown.length < 32 && _stat.unknown.indexOf(t) < 0) _stat.unknown.push(t);
      // 可见的降级行：断在「未知块」上要有人看得见（不许静默消失）。
      return '<div class="wa-dim" data-wa-unknown="' + esc(t) + '">未知块类型：' + esc(t) + '</div>';
    }
    _stat.blocks++;
    try {
      return fn(b, ctx || {});
    } catch (e) {
      return '<div class="wa-dim" data-wa-boom="' + esc(t) + '">块渲染失败（' + esc(t) + '）：'
        + esc(String(e && e.message || e).slice(0, 120)) + '</div>';
    }
  }

  function renderBlocks(list, ctx) {
    return (list || []).map(function (b) { return renderBlock(b, ctx); }).join('');
  }

  /** 顶层入口：收 {blocks:[…]} 或单块；ctx 是插值根。 */
  function render(spec, ctx) {
    _stat.renders++;
    _stat.last = Date.now();
    if (!spec) return '';
    if (Array.isArray(spec)) return renderBlocks(spec, ctx || {});
    if (spec.blocks) return renderBlocks(spec.blocks, ctx || {});
    return renderBlock(spec, ctx || {});
  }

  function stat() {
    return {
      ver: VER,
      renders: _stat.renders,
      blocks: _stat.blocks,
      unknown: _stat.unknown.slice(),
      missing: _stat.missing.slice(),
      kinds: Object.keys(BL)
    };
  }

  // 导出面**刻意只有四个**：render 是产品消费口（ui/panel.js 事件页）；stat 是读数口；
  //   ver / KINDS 是数据成员。renderBlock / escape / text / pick / interp / resetStat
  //   一律不导出 —— 没有外部消费方的导出在本仓的定性是「死导出债」（过度导出）。
  WA.schemaView = {
    ver: VER,
    render: render,
    stat: stat,
    KINDS: Object.keys(BL)
  };
})();