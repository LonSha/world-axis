/**
 * WorldAxis ui/pages/faces-page.js (v2.589.0) — CFG-2：设置面总账页
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────
 *   `engines/settings-desk.js` 有了清单读口与写回口，但**玩家点不到**：
 *   面板 50 页里没有任何一页列设置面，`ui/panel.js` 的 117 处 `getSettings` 全是
 *   一页一页手写的开关。于是「这个面改不了」在界面上表现为「这一页没有它」——
 *   与「这一页设计上就不给你改」完全同形。
 *
 * ── 本页的纪律（与 map-page / tools-page / now-page 同一契约）────────────
 *   1. **零业务逻辑**：读清单走 `settingsDesk.list()`，写回走 `settingsDesk.flip()`。
 *      本页不判断「有没有 enabled」、不判断「写成功没有」——那些判断只能有一份实现。
 *   2. **缺席即报读数缺口**：引擎没装载就说没装载，不画一张空表假装「这里本来就没东西」。
 *   3. **每个数都有出处**：页头读数直接取 `settingsDesk.summaryText()`；行数取 list() 的
 *      `shown / matched / total`，本页**不自己累加**。
 *   4. **截断必须自报**：列表只渲染 `limit` 行，页脚恒写「显示 X / 匹配 Y / 共 Z」。
 *      这是本页最容易犯的错：24 行看起来像「一共就 24 个面」。
 *   5. **一次操作的结果要留痕**：翻转成功/被拒（含拒收码）写进 LAST，重绘后仍可见。
 *   6. **纯参数面不给勾选框**：渲染成一行读数（「纯参数，不可翻」），
 *      而不是给个 disable 的灰 checkbox —— 灰框会被读成「暂时不能用」，那是错误信息。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VER = '2.589.0';

  // 上一次操作（模块级：面板重绘不丢，但不进存档 —— 它是交互痕迹）
  const LAST = { kind: '', at: 0, ok: null, text: '' };
  // 本页的过滤状态（同样只活在内存里：重开面板回到默认「全部」）
  const VIEW = { kw: '', only: 'all', limit: 24 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[<>&"]/g, function (c) {
      if (c === '<') return '&lt;';
      if (c === '>') return '&gt;';
      if (c === '&') return '&amp;';
      // 引号用码点拼：文件层会把某些字面实体还原，属性值里还原成裸引号就会破结构。
      return String.fromCharCode(38) + 'quot;';
    });
  }
  function n(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }
  function desk() { return WA.settingsDesk || null; }

  function setLast(kind, r) {
    const x = r || {};
    LAST.kind = kind;
    LAST.at = Date.now();
    LAST.ok = !!x.ok;
    if (kind === 'flip') {
      LAST.text = x.ok
        ? ('已' + (x.after ? '打开' : '关闭') + ' ' + (x.key || '?') + '（原为' + (x.before ? '开' : '关') + '）'
          + (x.changed === false ? ' · 本来就是目标值，未写盘' : ' · 已读回复核'))
        : ('被拒：' + (x.reason || '?') + (x.hint ? ('（' + x.hint + '）') : '') + (x.key ? (' · ' + x.key) : ''));
    } else {
      LAST.text = x.ok ? ('已重读：' + n((x.totals || {}).faces) + ' 个面') : ('失败：' + (x.reason || '?'));
    }
    return LAST;
  }

  function showLast() {
    if (!LAST.kind) return '';
    return '<div class="wa-out" id="wa-faces-out">· 上一次（' + esc(LAST.kind) + '，' + (LAST.ok ? '成' : '拒') + '）：'
      + esc(LAST.text) + '</div>';
  }

  /** 一行。`row` 来自 settingsDesk.list()，本页只负责排版。 */
  function rowHtml(r) {
    const key = esc(r.key);
    const tag = r.source === 'disk' ? '磁盘' : (r.source === 'default-after-failure' ? '兜底(读失败)' : '默认');
    const changed = (r.source === 'disk' && r.on !== r.defOn);
    const head = '<div class="wa-row" data-face="' + key + '">'
      + (r.hasSwitch
        ? ('<label><input type="checkbox" class="wa-face-box" data-key="' + key + '"' + (r.on ? ' checked' : '') + '/>'
          + '<b>' + esc(r.module) + '</b></label>')
        : ('<span class="wa-dim"><b>' + esc(r.module) + '</b> · 纯参数，不可翻</span>'))
      + '<span class="wa-dim">' + (r.hasSwitch ? ('默认' + (r.defOn ? '开' : '关') + ' · 现' + (r.on ? '开' : '关') + ' · 来源 ' + tag) : ('键 ' + key))
      + (changed ? ' · <b>改过</b>' : '')
      + (r.ok === false && r.hasSwitch ? ' · <b>读回兜底</b>' : '')
      + '</span></div>';
    return head;
  }

  function render() {
    const d = desk();
    if (!d || typeof d.list !== 'function') {
      return '<div class="wa-dim" id="wa-faces-absent">设置面台模块缺席（engines/settings-desk.js 未装载）—— 这不是「没有设置面」，是读数缺口</div>';
    }
    const dg = (typeof d.diagnose === 'function') ? d.diagnose() : null;
    const l = d.list({ only: VIEW.only, kw: VIEW.kw, limit: VIEW.limit });
    const t = l.totals || {};
    const head = '<div class="wa-sec">设置面总账（清单由登记表现场生成，页面上不存第二份）</div>'
      + '<div class="wa-dim" id="wa-faces-head">' + esc(typeof d.summaryText === 'function' ? d.summaryText(dg) : '') + '</div>'
      + (dg && dg.sameOrigin === false
        ? ('<div class="wa-dim" id="wa-faces-dup"><b>警告：</b>' + esc(dg.note || '') + '</div>') : '')
      + (dg && n(dg.dupKeys) ? ('<div class="wa-dim">重复键 <b>' + n(dg.dupKeys) + '</b> 个 —— 两个模块抢同一个键，必有一方读到别人的值</div>') : '');

    const bar = '<div class="wa-row">'
      + '<input id="wa-faces-kw" class="wa-input" style="max-width:200px" placeholder="按键名/模块名搜（如 map、inject）" value="' + esc(VIEW.kw) + '"/>'
      + '<select id="wa-faces-only" class="wa-input" style="max-width:130px">'
      + ['all:全部', 'switchable:只看有开关的', 'off:只看关着的', 'on:只看开着的', 'changed:只看改过的', 'no-enabled:只看纯参数']
        .map(function (x) { const p = x.split(':'); return '<option value="' + p[0] + '"' + (VIEW.only === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('')
      + '</select>'
      + '<label>行数 <input id="wa-faces-limit" type="number" min="1" max="400" value="' + n(VIEW.limit) + '" style="width:70px"/></label>'
      + '<button class="wa-btn wa-mini" id="wa-faces-apply">应用筛选</button>'
      + '<button class="wa-btn wa-mini" id="wa-faces-reload" title="重读登记表（引擎热装后用）">重读</button>'
      + '</div>';

    const rows = (l.rows || []).map(rowHtml).join('');
    const list = '<div id="wa-faces-list">' + (rows || '<div class="wa-dim">没有匹配的设置面（筛选条件：'
      + esc(VIEW.only) + (VIEW.kw ? (' / 关键词 ' + esc(VIEW.kw)) : '') + '）</div>') + '</div>';

    const foot = '<div class="wa-dim" id="wa-faces-count">显示 <b>' + n(l.shown) + '</b> / 匹配 ' + n(l.matched)
      + ' / 共 <b>' + n(l.total) + '</b> 个面'
      + (l.truncated ? (' —— <b>还有 ' + (n(l.matched) - n(l.shown)) + ' 个没列出来</b>：用关键词缩小范围，或把行数调大（上限 400）') : '')
      + '｜可翻 ' + n(t.switchable) + ' · 纯参数 ' + n(t.noSwitch) + ' · 出厂关着 ' + n(t.disabledByDefault)
      + '</div>';

    return head + bar + showLast() + list + foot
      + '<div class="wa-dim">读法：勾一下就写回（走设置总线，写后读回复核）；失败会当场说明是「键不存在 / 这个面没有开关 / 写不进去 / 写了但没存住」中的哪一种。'
      + '纯参数面（只有阈值、比例、上限）没有开关可给 —— 给它一个勾选框等于凭空发明一个语义。</div>';
  }

  function refresh() {
    try {
      if (WA.ui && typeof WA.ui.goPage === 'function') WA.ui.goPage('faces');
    } catch (e) { /* 面板还没 mount：不刷也不报 */ }
  }

  function bind(root, onAfter) {
    if (!root || typeof root.querySelector !== 'function') return { ok: false, reason: 'no-root' };
    const q = function (s) { return root.querySelector(s); };
    const d = desk();

    const bApply = q('#wa-faces-apply');
    if (bApply && typeof bApply.onclick !== 'function') {
      bApply.onclick = function () {
        const kw = q('#wa-faces-kw'), lim = q('#wa-faces-limit'), only = q('#wa-faces-only');
        VIEW.kw = kw ? String(kw.value || '') : '';
        VIEW.only = only ? String(only.value || 'all') : 'all';
        const v = lim ? Number(lim.value) : VIEW.limit;
        VIEW.limit = (isFinite(v) && v > 0) ? Math.min(400, Math.round(v)) : 24;
        refresh();
      };
    }

    const bReload = q('#wa-faces-reload');
    if (bReload && typeof bReload.onclick !== 'function') {
      bReload.onclick = function () {
        if (!d || typeof d.list !== 'function') { setLast('reload', { ok: false, reason: 'desk-absent' }); refresh(); return; }
        setLast('reload', d.list({ only: VIEW.only, kw: VIEW.kw, limit: VIEW.limit }));
        refresh();
        if (typeof onAfter === 'function') onAfter(LAST);
      };
    }

    // 勾选框：**不逐个手写 id**（那是第二份清单），一律按 data-key 委托。
    //   若换成「为每个面写一行 bind」，新引擎登记后就会出现「面在列表里但勾不动」——
    //   正是本页要治的那类静默缺口的翻版。
    const boxes = (typeof root.querySelectorAll === 'function') ? root.querySelectorAll('.wa-face-box') : [];
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (typeof box.onclick === 'function') continue;
      box.onclick = function (ev) {
        const el = (ev && ev.target) || box;
        const key = el && el.getAttribute ? el.getAttribute('data-key') : null;
        const want = !!(el && el.checked);
        if (!d || typeof d.flip !== 'function') { setLast('flip', { ok: false, reason: 'desk-absent', key: key }); refresh(); return; }
        const r = d.flip(key, want);
        setLast('flip', r);
        // 失败必须把勾选框**还原**：写不进去却留着一个勾，就是界面在说谎。
        if (!r.ok && el) el.checked = !want;
        refresh();
        if (typeof onAfter === 'function') onAfter(r);
      };
    }
    return { ok: true };
  }

  WA.panelFacesPage = { VERSION: VER, render: render, bind: bind, refresh: refresh, VIEW: VIEW };
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] ui/pages/faces-page 已加载（' + VER + '）');
})();