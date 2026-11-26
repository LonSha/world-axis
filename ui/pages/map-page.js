/**
 * WorldAxis ui/pages/map-page.js (v2.588.0) — MAP-5：地图页（底图的生成、体检、检查与导出）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────
 *   v2.587.0 有编辑模型（engines/map-editor.js）、有能按 doc 画五层的渲染分支
 *   （render/map-viewport.js 的 opts.doc）、v2.588.0 有了生成器（engines/map-generator.js），
 *   但**玩家/作者没有任何一页能把它们接起来**：此前地图只有一处调用（geo-tracker 的 locate），
 *   `ui/pages/` 七个文件里没有地图页。本页就是那一个入口。
 *
 * ── 本页的纪律（与前几页同一口径）────────────────────────────────
 *   1. **零业务逻辑**：抽地名、算几何、落地全部在引擎里；本页只调读口、拼 HTML、绑按钮。
 *   2. **缺席即报读数缺口**：模块没装载就说没装载，不画一张空图假装「这里本来就没东西」。
 *   3. **每个数都有出处**：页面上的计数直接取 `mapEditor.counts()` / `mapGenerator.diagnose()`，
 *      不自己累加、不自己猜。
 *   4. **一次操作的结果要留痕**：生成/体检/预演/校验/清空的结果写进 LAST，页面重绘后仍然可见
 *      ——「点完按钮界面刷新，结果没了」是本仓付过的价（v2.6.0 的 ✓ 已保存）。
 *   5. **只读操作不许有副作用**：「素材体检」与「预演」都不碰文档（引擎侧同一条纪律的调用侧）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VER = '2.588.0';

  // 上一次操作的读数（模块级：面板重绘不丢，跨页切回来也还在，但**不进存档**——它是交互痕迹）
  const LAST = { kind: '', at: 0, ok: null, text: '' };

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
  function setLast(kind, r) {
    LAST.kind = kind;
    LAST.at = Date.now();
    LAST.ok = !!(r && r.ok);
    LAST.text = summarize(kind, r);
    return LAST;
  }
  /** 把引擎返回值压成一行人话。**只转述，不评价**：失败就贴原因与原样数值。 */
  function summarize(kind, r) {
    const x = r || {};
    if (kind === 'generate') {
      if (!x.ok) return '生成失败：' + (x.reason || '?') + (x.why ? ('（' + x.why + '）') : '') + (x.hint ? (' · ' + x.hint) : '');
      const c = x.counts || {};
      return '已生成：落地 ' + n(x.appliedCount) + ' 条 / 被拒 ' + n(x.rejectedCount) + ' 条'
        + ' · 素材 ' + n(x.entries) + ' 条（' + (x.sourceKind || '?') + '）抽到地名 ' + n(x.places)
        + (x.dropped ? ('（截断 ' + x.dropped + '）') : '')
        + ' · 图层 水' + n(c.terrains) + ' 区' + n(c.regions) + ' 街区' + n(c.subs) + ' 路' + n(c.roads) + ' 点' + n(c.pois)
        + ' · 指纹 ' + (x.fingerprint || '—');
    }
    if (kind === 'scan') {
      if (!x.ok && !n(x.entries)) return '素材体检：' + (x.reason || '?') + (x.why ? ('（' + x.why + '）') : '') + (x.hint ? (' · ' + x.hint) : '');
      if (!n(x.places)) return '素材体检：读 ' + n(x.entries) + ' 条（' + (x.kind || '?') + '）⇒ 一个地名都没抽到（' + (x.why || '素材里没有后缀词表能识别的名字') + '）';
      return '素材体检：读 ' + n(x.entries) + ' 条（' + (x.kind || '?') + '）⇒ 地名 ' + n(x.places) + ' 个'
        + (x.dropped ? ('（截断 ' + x.dropped + '）') : '') + ' · 共现 ' + n(x.edges) + ' 条 · 预演几何 ' + n(x.ops) + ' 条'
        + (x.sample ? (' · 例：' + x.sample) : '');
    }
    if (kind === 'plan') {
      if (!x.ok) return '预演失败：' + (x.reason || '?') + (x.hint ? (' · ' + x.hint) : '');
      const c = x.counts || {};
      return '预演：将落 ' + ((x.ops || []).length) + ' 条几何 · 水' + n(c.terrains) + ' 区' + n(c.regions)
        + ' 街区' + n(c.subs) + ' 路' + n(c.roads) + ' 点' + n(c.pois)
        + ' · 素材 ' + n(x.entries) + ' 条抽到地名 ' + n(x.places) + '（' + (x.note || '') + '）';
    }
    if (kind === 'check') {
      if (!x.ok && x.reason) return '校验未跑：' + x.reason;
      const v = x.violations || x.vio || [];
      return '校验：' + (v.length ? ('发现 ' + v.length + ' 处问题（' + v.slice(0, 4).map(function (q) { return q.kind + ':' + (q.name || q.id || '?'); }).join('、') + (v.length > 4 ? ' …' : '') + '）') : '无冲突');
    }
    if (kind === 'clear') {
      return x.ok ? ('已清空：文档回到空白（' + n(x.width) + '×' + n(x.height) + '），撤销栈同时清空') : ('清空失败：' + (x.reason || '?'));
    }
    if (kind === 'set') {
      return x.ok === false ? ('画布未改：' + (x.reason || '?')) : ('画布改为 ' + n(x.width) + '×' + n(x.height) + '（下一次生成生效）');
    }
    if (kind === 'export') {
      return x.ok ? ('已导出 ' + n(x.size) + ' 字符 JSON，见下方文本框（可复制）') : ('导出失败：' + (x.reason || '?'));
    }
    return '';
  }

  function render() {
    const ed = WA.mapEditor;
    const gen = WA.mapGenerator;
    const doc = (ed && typeof ed.doc === 'function') ? ed.doc() : null;
    const counts = (ed && typeof ed.counts === 'function') ? ed.counts() : null;
    const total = counts ? (n(counts.terrains) + n(counts.regions) + n(counts.subs) + n(counts.pois) + n(counts.roads)) : 0;
    const fp = (doc && ed && typeof ed.fingerprint === 'function') ? ed.fingerprint() : null;
    const gs = (gen && typeof gen.getSettings === 'function') ? gen.getSettings() : null;
    const dg = (gen && typeof gen.diagnose === 'function') ? gen.diagnose() : null;

    let wbAll = 0, wbSel = 0;
    try {
      if (WA.worldbook && typeof WA.worldbook.peekEntries === 'function') {
        wbAll = (WA.worldbook.peekEntries() || []).length;
        wbSel = (typeof WA.worldbook.getSelectedIds === 'function') ? (WA.worldbook.getSelectedIds() || []).length : 0;
      }
    } catch (e) { wbAll = 0; wbSel = 0; }

    const head = '<div class="wa-sec">地图 —— 底图按卡内素材现场生成</div>'
      + '<div class="wa-dim">数据流：世界书条目 → 抽地名（后缀词表 + 边界扫描）→ 一批编辑操作 → map-editor 落地 → viewport 画五层。'
      + '生成不另造一份几何：整批之后 <b>revert</b> 逆序删回，编辑器自己的 undo 也照旧可用。</div>'
      + '<div class="wa-dim">素材：世界书缓存 <b>' + wbAll + '</b> 条'
      + (wbSel ? ('，已选 <b>' + wbSel + '</b> 条（只读已选）') : '（没勾选 ⇒ 读全量缓存）')
      + ' · 画布 ' + (gs ? (n(gs.width) + '×' + n(gs.height)) : '—') + ' 世界单位（未定标，米数为 null）'
      + '</div>';

    const bar = '<div class="wa-row">'
      + '<button class="wa-btn" id="wa-map-gen" title="按世界书素材生成一张底图（先清空再落）">生成底图</button>'
      + '<button class="wa-btn wa-mini" id="wa-map-scan" title="只读：看这份卡里能抽出哪些地名，一个字节都不落">素材体检</button>'
      + '<button class="wa-btn wa-mini" id="wa-map-plan" title="只算不落：看会生成多少几何，文档不变">预演</button>'
      + '<button class="wa-btn wa-mini" id="wa-map-check" title="纯函数冲突检查（重名/退化/重叠），不改文档">校验</button>'
      + '<button class="wa-btn wa-mini" id="wa-map-clear" title="文档回到空白（撤销栈同时清空）">清空</button>'
      + '<button class="wa-btn wa-mini" id="wa-map-export" title="导出编辑器 JSON（可复制，作为底图存档）">导出 JSON</button>'
      + '</div>';

    const setBar = '<div class="wa-row">'
      + '<span class="wa-dim">画布</span>'
      + '<input id="wa-map-w" class="wa-input" type="number" title="底图宽度（像素）—— 生成器按此比例铺路网与街区" style="width:82px" value="' + (gs ? n(gs.width) : 1600) + '"/>'
      + '<span class="wa-dim">×</span>'
      + '<input id="wa-map-h" class="wa-input" type="number" title="底图高度（像素）—— 与宽度共同决定街区密度" style="width:82px" value="' + (gs ? n(gs.height) : 1200) + '"/>'
      + '<button class="wa-btn wa-mini" id="wa-map-set" title="写进生成器设置（走设置总线，带边界校验）">应用</button>'
      + '<span class="wa-dim">改动只影响下一次生成</span>'
      + '</div>';

    const last = LAST.kind
      ? ('<div id="wa-map-last" class="wa-dim">· 上一次（' + LAST.kind + '）：' + esc(LAST.text) + '</div>')
      : '';
    const out = '<div class="wa-out" id="wa-map-out">' + last + '</div>';

    let canvas;
    if (!ed) {
      canvas = '<div class="wa-dim" id="wa-map-absent">地图编辑模块缺席（engines/map-editor.js 未装载）—— 这不是「没有地图」，是读数缺口</div>';
    } else if (!doc || !total) {
      canvas = '<div class="wa-dim" id="wa-map-empty">底图还是空的（世界坐标 ' + (doc ? (n(doc.width) + '×' + n(doc.height)) : '未建文档') + '）。'
        + '点「生成底图」按卡内素材落一张；也可以在编辑器 JSON 面板导入。</div>';
    } else if (WA.mapViewport && typeof WA.mapViewport.renderSvgScene === 'function') {
      try {
        canvas = WA.mapViewport.renderSvgScene({
          width: n(doc.width), height: n(doc.height),
          viewBox: '0 0 ' + n(doc.width) + ' ' + n(doc.height),
          doc: doc
        });
      } catch (e) {
        canvas = '<div class="wa-dim">渲染失败：' + esc(String((e && e.message) || e)) + '</div>';
      }
    } else {
      canvas = '<div class="wa-dim" id="wa-map-noviewport">渲染模块缺席（render/map-viewport.js 未装载）—— 几何在，画不出来是读数缺口</div>';
    }

    const stat = '<div class="wa-dim">当前文档：'
      + (doc
        ? ('水 <b>' + n(counts && counts.terrains) + '</b> · 区 <b>' + n(counts && counts.regions) + '</b> · 街区 <b>' + n(counts && counts.subs)
          + '</b> · 路 <b>' + n(counts && counts.roads) + '</b> · 点 <b>' + n(counts && counts.pois) + '</b>'
          + ' · version ' + n(doc.version) + ' · 指纹 ' + (fp || '—'))
        : '尚未建文档')
      + (dg ? (' · 生成器：跑 ' + n(dg.stat && dg.stat.runs) + ' 次 · 成图 ' + n(dg.stat && dg.stat.generated)
        + ' 张 · 拒收 ' + n(dg.stat && dg.stat.opsRejected) + ' 条 · 预演 ' + n(dg.stat && dg.stat.plans)
        + ' 次 · 词表 ' + n(dg.suffixes) + ' 项') : '')
      + '</div>';

    return head + bar + setBar + out + stat
      + '<div id="wa-map-canvas" class="wa-map-canvas" style="height:420px;overflow:auto;border:1px solid rgba(255,255,255,0.08);border-radius:6px;margin-top:8px">' + canvas + '</div>'
      + '<div class="wa-dim">读法：面（水/区/街区）在下、路（线）在中、点（POI）在上；每个面/点都带 data-name，可在控制台按名字查。</div>'
      + '<textarea id="wa-map-json" class="wa-input" title="生成结果原文（只读）—— 逐条 addPoly/addRect/addRoad/addPoi，点「导出」后可复制" style="display:none;width:100%;height:120px;margin-top:6px" readonly></textarea>';
  }

  /** 重绘本页（goPage 同页也会 renderBody，见 ui/panel.js 的 goPage）。 */
  function refresh() {
    try {
      if (WA.ui && typeof WA.ui.goPage === 'function') WA.ui.goPage('map');
    } catch (e) { /* 面板还没 mount：不刷也不报 */ }
  }
  function out(html) {
    const el = (typeof document !== 'undefined' && document.getElementById) ? document.getElementById('wa-map-out') : null;
    if (el) el.innerHTML = html;
  }
  function showLast() {
    if (!LAST.kind) return;
    out('<div class="wa-dim">· 上一次（' + LAST.kind + '）：' + esc(LAST.text) + '</div>');
  }

  function bind(root, onAfter) {
    if (!root || typeof root.querySelector !== 'function') return { ok: false, reason: 'no-root' };
    const q = function (s) { return root.querySelector(s); };
    const gen = WA.mapGenerator, ed = WA.mapEditor;

    const bGen = q('#wa-map-gen');
    if (bGen && typeof bGen.onclick !== 'function') {
      bGen.onclick = function () {
        if (!gen || typeof gen.generate !== 'function') { LAST.kind = 'generate'; LAST.ok = false; LAST.text = '生成器未装载（engines/map-generator.js）'; showLast(); return; }
        const r = gen.generate({ mode: 'fresh' });
        setLast('generate', r);
        refresh();
        if (typeof onAfter === 'function') onAfter(r);
      };
    }

    // 素材体检：**只读**。让用户先看清「我的卡里到底能抽出什么名字」再决定要不要生成 ——
    //   否则「点了生成，出来一张不像我世界的图」只能靠猜原因。
    const bScan = q('#wa-map-scan');
    if (bScan && typeof bScan.onclick !== 'function') {
      bScan.onclick = function () {
        if (!gen || typeof gen.readSources !== 'function') { LAST.kind = 'scan'; LAST.ok = false; LAST.text = '生成器未装载'; showLast(); return; }
        const src = gen.readSources({});
        if (!src.ok) { setLast('scan', src); showLast(); return; }
        const hv = gen.harvest(src.texts);
        const g2 = (typeof gen.getSettings === 'function') ? gen.getSettings() : { width: 1600, height: 1200 };
        const pl = gen.plan(hv, { width: n(g2.width) || 1600, height: n(g2.height) || 1200 });
        setLast('scan', {
          ok: hv.places.length > 0, entries: src.entries, kind: src.kind,
          places: hv.places.length, dropped: hv.dropped, edges: hv.edges.length,
          ops: (pl && pl.ops) ? pl.ops.length : 0,
          sample: hv.places.slice(0, 12).map(function (p) { return p.name; }).join('、'),
          why: hv.places.length ? '' : '素材里没有后缀词表能识别的名字'
        });
        showLast();
      };
    }

    const bPlan = q('#wa-map-plan');
    if (bPlan && typeof bPlan.onclick !== 'function') {
      bPlan.onclick = function () {
        if (!gen || typeof gen.generate !== 'function') { LAST.kind = 'plan'; LAST.ok = false; LAST.text = '生成器未装载'; showLast(); return; }
        const r = gen.generate({ mode: 'fresh', dryRun: true });
        setLast('plan', r);
        showLast();
      };
    }

    const bCheck = q('#wa-map-check');
    if (bCheck && typeof bCheck.onclick !== 'function') {
      bCheck.onclick = function () {
        if (!ed || typeof ed.check !== 'function') { LAST.kind = 'check'; LAST.ok = false; LAST.text = '编辑器未装载'; showLast(); return; }
        const r = ed.check();
        setLast('check', r);
        showLast();
      };
    }

    const bClear = q('#wa-map-clear');
    if (bClear && typeof bClear.onclick !== 'function') {
      bClear.onclick = function () {
        if (!ed || typeof ed.newDoc !== 'function') { LAST.kind = 'clear'; LAST.ok = false; LAST.text = '编辑器未装载'; showLast(); return; }
        const g2 = (gen && typeof gen.getSettings === 'function') ? gen.getSettings() : { width: 1600, height: 1200 };
        const r = ed.newDoc(g2.width, g2.height);
        setLast('clear', Object.assign({ width: g2.width, height: g2.height }, r || {}));
        refresh();
      };
    }

    // 画布尺寸：走生成器设置（设置总线 + bounds 校验）。它是「有 bounds 的设置项必须能在面板上改」
    //   这条口径的一个最小示范 —— 不是只能改 localStorage。
    const bSet = q('#wa-map-set');
    if (bSet && typeof bSet.onclick !== 'function') {
      bSet.onclick = function () {
        const wEl = q('#wa-map-w'), hEl = q('#wa-map-h');
        if (!gen || typeof gen.setSettings !== 'function') { setLast('set', { ok: false, reason: '生成器未装载' }); showLast(); return; }
        const w = Number(wEl && wEl.value), h = Number(hEl && hEl.value);
        const r = gen.setSettings({ width: w, height: h });
        setLast('set', (r && r.ok === false) ? r : { ok: true, width: w, height: h });
        if (r && r.ok === false) { showLast(); return; }
        refresh();
      };
    }

    const bExport = q('#wa-map-export');
    if (bExport && typeof bExport.onclick !== 'function') {
      bExport.onclick = function () {
        const ta = q('#wa-map-json');
        if (!ed || typeof ed.exportJSON !== 'function') { setLast('export', { ok: false, reason: 'map-editor 未装载' }); showLast(); return; }
        const json = ed.exportJSON();
        if (!json) { setLast('export', { ok: false, reason: 'no-document' }); showLast(); return; }
        if (ta) {
          ta.style.display = '';
          ta.value = json;
          try { ta.select(); } catch (e) {}
        }
        setLast('export', { ok: true, size: json.length });
        showLast();
      };
    }
    return { ok: true, bound: { gen: !!bGen, scan: !!bScan, plan: !!bPlan, check: !!bCheck, clear: !!bClear, set: !!bSet, export: !!bExport } };
  }

  WA.panelMapPage = {
    render: render,
    bind: bind,
    /** 只读快照（给锁与诊断用；不含 DOM）。 */
    snapshot: function () {
      return {
        last: { kind: LAST.kind, ok: LAST.ok, text: LAST.text, at: LAST.at },
        hasEditor: !!(WA.mapEditor && typeof WA.mapEditor.doc === 'function'),
        hasGenerator: !!(WA.mapGenerator && typeof WA.mapGenerator.generate === 'function'),
        counts: (WA.mapEditor && typeof WA.mapEditor.counts === 'function') ? WA.mapEditor.counts() : null
      };
    },
    ver: VER
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('ui/pages/map-page.js', { kind: 'ui', ver: VER });
  }
})();