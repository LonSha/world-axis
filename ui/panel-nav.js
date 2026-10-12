/**
 * WorldAxis ui/panel-nav.js (v2.209.0) — 面板导航协议（计划一 #6 · 面板拆分与精确定位）
 *
 * ── 它治什么（现场读数，不是阅读推断）──────────────────────────────────
 *   ① 检索页的「跳到来源页」只跳到**页**（engines/history-search.js 的路由表给的是
 *      `{ page, face, ref }`，落到页面上只有 `route.page` 被消费）—— 到了之后停在哪一条
 *      记录，没有任何东西管。待办页只给路由字符串（「去哪看 / 看哪条 / 哪个设置键」），
 *      图谱页连行清单都不渲染。于是**同一个意图**（去看那一条）在三页里有三种写法，
 *      而三种写法都不能真正**停在**那一条上。
 *   ② 切页会整块重建 body（`body.innerHTML = RENDERERS[currentPage]()`）⇒
 *      上一页**未提交的输入与滚动位置**一并消失。`scheduleRerender` 里那条
 *      「正在输入就不重绘」的守卫管的是**自动重绘**；用户主动切页时它不拦
 *      —— 那是对的（切页就是要换内容），但「换出去再换回来」不该等于「刚才填的没了」。
 *   ③ 新增一处跳转就多一处漂移点：`tab.click()` / 直接改 currentPage / 干脆不跳。
 *
 * ── 本模块落点（三条，逐条对应上面三处）──────────────────────────────
 *   ① **一份协议** 目标 = `{ page, rec, filter }`。规范化只在 `parse()` 里做一次，
 *      编码只在 `attr()` 里做一次（面板侧只渲染，不自己拼串）。非法页**拒收**并给出
 *      认得的集合（`known`）——「跳过去了但什么都没发生」在这里是不可能的。
 *   ② **一条回程** 切页前记（当前页 + 输入态 + 滚动位）并**按页留档**，切页后回填的是
 *      **目标页自己**的旧态（不是刚离开那页的 —— 那是跨页错配），`backTo()` 原样送回上一页；
 *      栈有界（`CAP_BACK`），重入同页不污染它（见 `go` 的 `cur !== t.page` 判据）。
 *   ③ **一次定位** 切页后按 `[data-rec]` 找记录：命中 **1** 处才叫定位成功；
 *      0 处报 `rec-not-rendered`、>1 处报 `rec-ambiguous`（**不猜** —— 猜一条出来
 *      比报一句「这条没渲染出来」坏得多：用户会以为定位是对的）。
 *
 * ── 边界（全部否定式，与同仓 ui 模块同规）────────────────────────────
 *   1 **不造第二份页表**：页白名单取运行时 `WA.ui.pages()`；它缺席即拒收 `no-page-table`
 *     （自造一份等于自造判定，页表长一页两边就各说一套）。
 *   2 **不落盘**：回程栈是进程态交互物（与 ui/render-perf.js 第 3 条同口径）。
 *   3 **不产生时间读数**：本模块不调时钟、不裸调 `Date.now()`（沿革见 G20 那条纪律）。
 *   4 **不替页面渲染**：`[data-rec]` 由各页自己打在行上，本模块只读它、只加高亮类。
 *   5 **定位零写入**：滚 + 标类，不碰 store（改正数据是各模块写口的事）。
 *   6 **一次 go 只切一次页**：走 `WA.ui.goPage()`（单一入口），不自己改名 currentPage。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** 回程栈上限：够用即可，无界栈会让「回退」变成一个记忆负担。 */
  const CAP_BACK = 8;
  const REC_ATTR = 'data-rec';
  const HIT_CLASS = 'wa-hit';
  const _stat = { goes: 0, located: 0, misses: 0, ambiguous: 0, backs: 0, refused: 0,
    restored: 0, lastReason: '', faults: {} };
  function note(code) { _stat.refused++; _stat.faults[code] = (_stat.faults[code] || 0) + 1; _stat.lastReason = code; }
  const stack = [];
  /** 按页缓存「上一次离开那一页时的输入态」—— 与回程栈分工不同：
   *  栈管**从哪来**（有界、后进先出），缓存管**那一页原来填了什么**（以页为键，天然有界）。
   *  为什么必须有它：切页整块重建 body（`body.innerHTML = …`），旧 DOM 连同输入一并销毁。
   *  只靠「切页前抓一份、切页后填回去」会把**刚离开那页**的输入填进**新页**（跨页错配：
   *  两页控件不同，最轻是全部 miss，最重是撞上同名 id 把 A 页的内容写进 B 页）。
   *  正确语义是：**每一页自己**的输入态，回到那一页时才回填。 */
  const snaps = {};

  function hostDoc() {
    try { return WA.mainDoc || (WA.mainWin && WA.mainWin.document) || window.document; } catch (e) { return null; }
  }
  function bodyOf() { const d = hostDoc(); try { return d ? d.querySelector('.wa-body') : null; } catch (e) { return null; } }
  /** 页白名单 = 运行时页表（**不是本模块自带的副本**）。 */
  function pageTable() {
    try { return (WA.ui && typeof WA.ui.pages === 'function') ? (WA.ui.pages() || []) : []; } catch (e) { return []; }
  }
  function curPage() {
    try { return (WA.ui && typeof WA.ui.currentPage === 'function') ? WA.ui.currentPage() : null; } catch (e) { return null; }
  }
  function enc(s) { return encodeURIComponent(String(s == null ? '' : s)); }
  function dec(s) { try { return decodeURIComponent(String(s || '')); } catch (e) { return String(s || ''); } }
  function valOf(el) {
    try { return (el.value === undefined || el.value === null) ? '' : String(el.value); } catch (e) { return ''; }
  }
  /** 面板内控件集合的唯一入口（`input,textarea,select` —— 与 renderBody 的 DOM 规模同口径）。 */
  function fieldsOf(body) {
    const out = [];
    try {
      const all = body.querySelectorAll('input,textarea,select');
      for (let i = 0; i < all.length; i++) out.push(all[i]);
    } catch (e) { /* 宿主查询失败 ⇒ 空集（调用方按 miss 如实报） */ }
    return out;
  }

  /**
   * 规范化导航目标。接受三种入参：`{page,rec,filter}` / `'page|rec|filter'` / `'page'`。
   * **拒收码**：`empty-target`（没给东西）/ `no-page`（页名为空）/ `no-page-table`（页表缺席）
   *   / `bad-page`（页名不在页表里，带 `known`）。
   */
  function parse(input) {
    let t = null;
    if (typeof input === 'string') {
      const parts = String(input).split('|');
      t = { page: dec(parts[0]), rec: dec(parts[1]), filter: dec(parts[2]) };
    } else if (input && typeof input === 'object') {
      t = { page: input.page, rec: input.rec, filter: input.filter };
    }
    if (!t) return { ok: false, reason: 'empty-target' };
    const page = String(t.page == null ? '' : t.page).trim();
    if (!page) return { ok: false, reason: 'no-page' };
    const known = pageTable();
    if (!known.length) return { ok: false, reason: 'no-page-table' };
    if (known.indexOf(page) < 0) return { ok: false, reason: 'bad-page', page: page, known: known };
    return { ok: true, target: { page: page, rec: String(t.rec == null ? '' : t.rec).trim(),
      filter: String(t.filter == null ? '' : t.filter).trim() } };
  }
  /** 编码成 `data-nav` 属性的值 —— 面板侧只调它，不自己拼串（拼串就是第二份格式）。 */
  function attr(target) {
    const p = parse(target);
    if (!p.ok) return '';
    return enc(p.target.page) + '|' + enc(p.target.rec) + '|' + enc(p.target.filter);
  }
  /** 从被点元素的 `data-nav` 取目标（面板绑定用；空串 ⇒ 拒收）。 */
  function fromAttr(v) { return parse(String(v == null ? '' : v)); }

  /** 抓当前页输入态与滚动位（切页前调）。**只读 DOM，不写世界**。 */
  function grab() {
    const body = bodyOf();
    if (!body) return { ok: false, reason: 'no-body', page: curPage(), fields: [], scroll: null };
    const els = fieldsOf(body);
    const fields = [];
    for (let i = 0; i < els.length; i++) {
      const el = els[i];
      const tag = String(el.tagName || '').toLowerCase();
      const typ = String(el.type || '').toLowerCase();
      const boxed = (typ === 'checkbox' || typ === 'radio');
      fields.push({ idx: i, id: el.id || '',
        value: boxed ? !!el.checked : valOf(el), boxed: boxed });
    }
    const scroll = (typeof body.scrollTop === 'number') ? body.scrollTop : null;
    return { ok: true, page: curPage(), fields: fields, scroll: scroll };
  }
  /** 回填输入态（切页后 / 回程时调）。**如实报 miss**：对不上的控件不假装填上了。
   *  `opt.keepScroll` —— 本次要定位到某条记录时置 true（滚动权交给定位，不在这里抢）。 */
  function restore(snap, opt) {
    const o = opt || {};
    if (!snap || snap.ok !== true) return { ok: false, reason: 'no-snapshot', restored: 0, missed: 0 };
    const body = bodyOf();
    if (!body) return { ok: false, reason: 'no-body', restored: 0, missed: 0 };
    const els = fieldsOf(body);
    const byId = {};
    for (let i = 0; i < els.length; i++) if (els[i].id) byId[els[i].id] = els[i];
    let n = 0, miss = 0;
    (snap.fields || []).forEach(function (f) {
      const el = f.id ? byId[f.id] : els[f.idx];
      if (!el) { miss++; return; }
      if (f.boxed) el.checked = !!f.value;
      else el.value = f.value;
      n++;
    });
    if (!o.keepScroll && snap.scroll !== null && typeof body.scrollTop === 'number') body.scrollTop = snap.scroll;
    return { ok: true, restored: n, missed: miss };
  }
  function clearHit(body) {
    try {
      const all = (body || bodyOf());
      if (!all) return 0;
      const hit = all.querySelectorAll('.' + HIT_CLASS);
      for (let i = 0; i < hit.length; i++) if (hit[i].classList) hit[i].classList.remove(HIT_CLASS);
      return hit.length;
    } catch (e) { return 0; }
  }
  /**
   * 定位到一条记录（切页后调）。`rec` 与行上的 `data-rec` 逐字比对。
   * 命中 **1** 处 ⇒ 标 `wa-hit` + 滚到它；0 处 ⇒ `rec-not-rendered`；>1 处 ⇒ `rec-ambiguous`。
   */
  function locate(rec) {
    const body = bodyOf();
    if (!body) return { ok: false, reason: 'no-body' };
    const key = String(rec == null ? '' : rec);
    if (!key) return { ok: false, reason: 'empty-rec' };
    let all = [];
    try {
      const list = body.querySelectorAll('[' + REC_ATTR + ']');
      for (let i = 0; i < list.length; i++) all.push(list[i]);
    } catch (e) { return { ok: false, reason: 'no-body' }; }
    const hits = all.filter(function (el) {
      try { return String(el.getAttribute(REC_ATTR) || '') === key; } catch (e) { return false; }
    });
    clearHit(body);
    if (!hits.length) return { ok: false, reason: 'rec-not-rendered', rec: key, scanned: all.length };
    if (hits.length > 1) return { ok: false, reason: 'rec-ambiguous', rec: key, n: hits.length };
    const el = hits[0];
    if (el.classList) el.classList.add(HIT_CLASS);
    const top = (typeof el.offsetTop === 'number') ? el.offsetTop : 0;
    if (typeof body.scrollTop === 'number') body.scrollTop = top;
    return { ok: true, rec: key, at: top, marked: true, scanned: all.length };
  }
  function pushStack(page, snap) {
    stack.push({ page: page, snap: snap });
    if (stack.length > CAP_BACK) stack.shift();
    return stack.length;
  }

  /**
   * 走到一个目标：规范化 → 记回程（仅在真换页时）→ 抓输入态 → 切页 → 定位 → 回填。
   * `opt.replay` 为 true 时**不记回程**（回退自身用，否则回退会把自己也记进去）。
   */
  function go(target, opt) {
    const o = opt || {};
    _stat.goes++;
    const p = parse(target);
    if (!p.ok) { note(p.reason); return { ok: false, reason: p.reason, known: p.known || [] }; }
    const t = p.target;
    const cur = curPage();
    const snap = grab();
    if (snap && snap.ok && cur) snaps[cur] = snap;
    if (!o.replay && cur && cur !== t.page) pushStack(cur, snap);
    const r = (WA.ui && typeof WA.ui.goPage === 'function')
      ? WA.ui.goPage(t.page) : { ok: false, reason: 'ui-module-missing' };
    if (!r || r.ok !== true) {
      note((r && r.reason) || 'go-refused');
      return { ok: false, reason: (r && r.reason) || 'go-refused', known: (r && r.known) || [] };
    }
    let loc = null;
    if (t.rec) {
      loc = locate(t.rec);
      if (loc.ok) _stat.located++;
      else if (loc.reason === 'rec-ambiguous') _stat.ambiguous++;
      else _stat.misses++;
    }
    // 回填的是**目标页自己的**旧输入态（首次进入该页时为 undefined ⇒ 如实返回 no-snapshot，
    //   不拿刚离开那页的快照顶替 —— 那正是「跨页错配」）。
    const rs = restore(snaps[t.page], { keepScroll: !!t.rec });
    if (rs.ok) _stat.restored += rs.restored;
    return { ok: true, page: t.page, changed: !!r.changed, rec: t.rec, filter: t.filter,
      located: loc, restored: rs, backDepth: stack.length };
  }
  /** 回程：把「离开那一页时的样子」原样送回去（输入态 + 滚动位都由**那一页自己的**快照承担）。 */
  function backTo() {
    if (!stack.length) { note('no-back'); return { ok: false, reason: 'no-back', backDepth: 0 }; }
    const e = stack.pop();
    const here = curPage();
    const hereSnap = grab();
    if (hereSnap && hereSnap.ok && here) snaps[here] = hereSnap;
    const r = (WA.ui && typeof WA.ui.goPage === 'function')
      ? WA.ui.goPage(e.page) : { ok: false, reason: 'ui-module-missing' };
    if (!r || r.ok !== true) {
      note((r && r.reason) || 'go-refused');
      stack.push(e);
      return { ok: false, reason: (r && r.reason) || 'go-refused' };
    }
    const rs = restore(snaps[e.page] || e.snap, {});
    _stat.backs++;
    return { ok: true, page: e.page, restored: rs, backDepth: stack.length };
  }
  /** 读数**不改变被观测对象**：这里不调 clearHit（读数顺手清掉高亮标记 = 观测污染现场）。 */
  function stat() {
    return Object.assign({}, _stat, { faults: Object.assign({}, _stat.faults),
      backDepth: stack.length, capBack: CAP_BACK });
  }
  /** 自证面：协议在自己的读数上**可被核对**（页表、栈、拒收计数、命中类）。 */
  function diagnose() {
    const body = bodyOf();
    let mark = 0;
    try { mark = body ? body.querySelectorAll('.' + HIT_CLASS).length : 0; } catch (e) { mark = 0; }
    return { ok: true, pages: pageTable().length,
      stack: stack.map(function (e) { return { page: e.page, fields: (e.snap && e.snap.fields || []).length, scroll: (e.snap && e.snap.scroll) }; }),
      mark: mark, backDepth: stack.length, capBack: CAP_BACK,
      cachedPages: Object.keys(snaps).length,
      stat: stat(),
      source: '协议单一入口：parse() 规范化 / go() 切页 + 定位 / backTo() 原样回程；页白名单取 WA.ui.pages()' };
  }

  WA.panelNav = {
    parse: parse, attr: attr, fromAttr: fromAttr,
    go: go, backTo: backTo, locate: locate,
    grab: grab, restore: restore,
    stat: stat, diagnose: diagnose
  };
  var EXPORT_COUNT = 10;
  var _exported = Object.keys(WA.panelNav).length;
  if (_exported !== EXPORT_COUNT) { throw new Error('panelNav: export count mismatch (' + _exported + ' !== ' + EXPORT_COUNT + ')'); }
  if (typeof WA.registerModule === 'function') WA.registerModule('ui/panel-nav.js', { kind: 'ui', ver: '2.209.0' });
})();
