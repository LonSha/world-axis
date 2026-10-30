'use strict';
/**
 * v2.274.0（V6 · 收口）专锁：**读数仪的「一行」与「清零」都接上了真消费方**
 *
 * ── 这一版治的是什么 ───────────────────────────────────────────────────────
 * 七台读数仪（世界日记 / 人物动线 / 关系温度 / 暗流日历 / 单轮成本 / 存档体检 /
 * 开局引导）的人话一行此前有两种形态并存：四台把它做成**独立 line() 函数**并挂在
 * 导出面上，三台只把它塞进 build() 的返回体。同一个「一行」在两套形态里各写一份
 * ⇒ 面板要按引擎分支分别取，而两份措辞迟早会分叉（本仓反复裁决的「第二份真源」）。
 * 本版统一：**line 只作为 build() 的返回字段**，导出面不另立 line 口。
 *
 * 八台引擎的 reset() 则是另一种形态的死：**导出面有口、产品代码零引用**（只在测试里
 * 被调用）。这就是「只在测试里活的导出不算交付」。本版给它们接上一个真消费方
 * （工具页「清零读数仪」），并把同样零消费的两个动作一并接上：
 *   · firstRun.dismiss()   —— 曾经只定义不导出，「知道了」在引擎里存在、界面上不存在；
 *   · handoffPack.suggest() —— 打包之后最需要的「缺块去哪开 / 先复哪块」，此前零消费。
 *
 * ── 段结构 ────────────────────────────────────────────────────────────────
 *  A 静态契约（锚点各恰 1 次 / 导出面形态 / 控件三件齐做：渲染 + 绑定 + 守卫登记）
 *  B 运行时（build().line 七台都在；七台各分支都给非空串；不再有独立 line 导出）
 *  C 真点击链路（清零读数仪真的把八台计数归零；「知道了」真的收起；打包真的给下一步）
 *  N 真源码破坏 + 两向自证（破坏内存副本 ⇒ 同款判据必须现形；原版上必须为真）
 */
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const SELF_REL = 'tests/gauge-wire-v2274.js';
const PANEL_REL = 'ui/panel.js';
const SET_REL = 'ui/settings.js';
const DIAG_REL = 'engines/tool-diag.js';
// 七台有「人话一行」的读数仪（handoff-pack 是打包器，不是读数仪，它只有 reset 面）
const LINE_ENGINES = [
  ['engines/world-diary.js', 'worldDiary', '世界日记'],
  ['engines/day-route.js', 'dayRoute', '人物动线'],
  ['engines/relation-temp.js', 'relationTemp', '关系温度'],
  ['engines/undercurrent-calendar.js', 'undercurrentCalendar', '暗流日历'],
  ['engines/round-cost.js', 'roundCost', '单轮成本'],
  ['engines/save-health.js', 'saveHealth', '存档体检'],
  ['engines/first-run.js', 'firstRun', '开局引导'],
];
// 八台有 reset 的引擎（上七台 + 打包器）
const RESET_ENGINES = LINE_ENGINES.concat([['engines/handoff-pack.js', 'handoffPack', '一键交班']]);
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/**
 * 取 `WA.<ns> = { … };` 这个**导出块本身**。
 * 判据必须咬导出块，不能咬全文：动线的逐人一行 `line: line ? … : ''` 是真代码、
 *   成本卡/体检/引导的 `function line(cfg, …)` 是**内部**拼句 helper（由 build 调用），
 *   全文计数会把它们误判成「导出面另立 line 口」。
 */
function exportBlock(src, ns) {
  const m = src.match(new RegExp('WA\\.' + ns + ' = \\{([\\s\\S]*?)\\n  \\};'));
  return m ? m[1] : null;
}
const ANCHOR = {
  // 清零按钮的绑定体（负控制：破坏它 ⇒ 按钮照旧响应、读数一台都不清）
  gaugeCall: "['世界日记', function () { return WA.worldDiary && WA.worldDiary.reset; }],",
  // 「知道了」的真调用（负控制：破坏它 ⇒ 按钮照旧响应、引导不收起）
  dismissCall: 'const r = WA.firstRun.dismiss();',
  // 打包结果里带上 suggest 的下一步（负控制：破坏它 ⇒ 打包照旧成功但少了下一步）
  //   定界一律用双引号：本体里带单引号，用单引号包裹时源码字面量会带反斜杠转义，
  //   H5 纯度判据（SELF 里恰 1 次）就数不到。
  suggestCall: "const sg = (typeof WA.handoffPack.suggest === 'function') ? WA.handoffPack.suggest(p) : null;",
};
const TGT = { gaugeCall: PANEL_REL, dismissCall: PANEL_REL, suggestCall: SET_REL };
function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const SELF = rd(SELF_REL);
  const P = rd(PANEL_REL), S = rd(SET_REL), D = rd(DIAG_REL);
  function freshEnv(ov) {
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    const env = gate.fresh(ov ? { srcOverride: ov } : {});
    try { env.WA.store.init(); } catch (e) {}
    return env;
  }
  function pageHtml(env, page) {
    const WA = env.WA, dom = env.dom;
    const panel = dom.getElementById('wa-panel');
    if (WA.ui && typeof WA.ui.open === 'function') WA.ui.open();
    if (WA.ui && typeof WA.ui.goPage === 'function') WA.ui.goPage(page);
    const body = panel.querySelector('.wa-body');
    return { html: String((body && body.innerHTML) || ''), body: body, panel: panel };
  }
  // 只给 WA/dom 时也能真渲染到目标页（控件不在树里时「点了没反应」恒成立 —— 那是空判据）
  function goto(WA, page) {
    if (WA.ui && typeof WA.ui.open === 'function') WA.ui.open();
    if (WA.ui && typeof WA.ui.goPage === 'function') WA.ui.goPage(page);
  }
  // ── A 静态契约 ──────────────────────────────────────────────────────────
  Object.keys(ANCHOR).forEach(function (k) {
    const c = cnt(rd(TGT[k]), ANCHOR[k]);
    a(c === 1, 'v2274/A1: 锚点 ' + k + ' 在 ' + TGT[k] + ' 恰中 1 次（实 ' + c + '）');
  });
  // H5 判据纯度：锚点字面量在 SELF 里只出现 1 次（不得靠引用自身当判据）
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(SELF, ANCHOR[k]) === 1, 'v2274/A1f: 锚点 ' + k + ' 在 SELF 里恰 1 次（实 ' + cnt(SELF, ANCHOR[k]) + '）');
  });
  {
    // 八台都导出 reset；七台的**导出块**里不得另立 line 口（单一措辞真源）
    RESET_ENGINES.forEach(function (e) {
      const src = rd(e[0]);
      a(cnt(src, 'reset: reset') === 1, 'v2274/A2: ' + e[2] + ' 导出 reset 恰 1 处（实 ' + cnt(src, 'reset: reset') + '）');
    });
    LINE_ENGINES.forEach(function (e) {
      const blk = exportBlock(rd(e[0]), e[1]);
      a(blk !== null, 'v2274/A3pre: ' + e[2] + ' 导出块可定位（否则下面两条在空串上恒真）');
      if (blk === null) {
        a(false, 'v2274/A3: ' + e[2] + ' 导出面不另立 line 口（导出块没定位到，无从判）');
        a(false, 'v2274/A3b: ' + e[2] + ' 导出块里真有 reset 成员（导出块没定位到，无从判）');
        return;
      }
      a(!/\bline\s*:/.test(blk), 'v2274/A3: ' + e[2] + ' 导出面不另立 line 口（措辞只有 build().line 一份）');
      a(/\breset\s*:\s*reset/.test(blk), 'v2274/A3b: ' + e[2] + ' 导出块里真有 reset 成员');
    });
  }
  {
    // 控件三件齐做：渲染（panel 模板）+ 绑定（onclick）+ 守卫登记（UI_BINDINGS）
    a(cnt(P, 'id="wa-gauge-reset"') === 1, 'v2274/A4: 面板模板渲染清零读数仪控件（实 ' + cnt(P, 'id="wa-gauge-reset"') + '）');
    a(cnt(P, "const grBtn = $('#wa-gauge-reset');") === 1, 'v2274/A4b: 控件绑上处理器');
    a(cnt(D, "'wa-gauge-reset'") === 1, 'v2274/A4c: 控件登记进 UI_BINDINGS（守卫表照得到它）');
    a(cnt(P, 'data-first-dismiss') >= 1, 'v2274/A5: 开局引导「知道了」在面板模板里渲染');
    a(cnt(P, "querySelectorAll('[data-first-dismiss]')") === 1, 'v2274/A5b: 该按钮绑上处理器');
  }
  // ── B 运行时：line 是 build() 的字段，且各分支都非空 ─────────────────────
  {
    const env = freshEnv();
    const WA = env.WA;
    LINE_ENGINES.forEach(function (e) {
      const m = WA[e[1]];
      a(!!m && typeof m.build === 'function', 'v2274/B1: ' + e[2] + ' 已装载（否则下面的判据在空集上恒真）');
      if (!m || typeof m.build !== 'function') return;
      let r = null, err = null;
      try { r = m.build(); } catch (ex) { err = ex; }
      a(err === null, 'v2274/B2: ' + e[2] + ' build() 不抛（实 ' + j(err && err.message) + '）');
      a(!!r && typeof r.line === 'string' && r.line.length > 0,
        'v2274/B2b: ' + e[2] + ' 的 build() 直接给出非空人话一行（实 ' + j(r && r.line) + '）');
      // 导出面不另有 line 口：这正是「两份措辞真源」的判据
      a(typeof m.line !== 'function', 'v2274/B2c: ' + e[2] + ' 不导出 line 函数（实 ' + typeof m.line + '）');
      a(typeof m.reset === 'function', 'v2274/B2d: ' + e[2] + ' 导出 reset（实 ' + typeof m.reset + '）');
    });
  }
  // ── C 真点击链路 ────────────────────────────────────────────────────────
  {
    // C1 清零读数仪：先 accum 出非零计量，再点按钮，八台必须归零
    const env = freshEnv();
    const WA = env.WA, dom = env.dom;
    const r0 = pageHtml(env, 'tools');
    a(r0.html.indexOf('id="wa-gauge-reset"') >= 0, 'v2274/C1a: 工具页真渲染清零读数仪（实 ' + (r0.html.indexOf('wa-gauge-reset') >= 0) + '）');
    LINE_ENGINES.forEach(function (e) { try { WA[e[1]].build(); } catch (ex) {} });
    a(WA.worldDiary.stat().builds >= 1, 'v2274/C1b: 前置成立 —— 世界日记计量已累积（实 ' + WA.worldDiary.stat().builds + '）');
    const btn = dom.getElementById('wa-gauge-reset');
    a(!!btn && typeof btn.onclick === 'function', 'v2274/C1c: 控件真绑定处理器');
    if (btn && btn.onclick) btn.onclick();
    a(WA.worldDiary.stat().builds === 0, 'v2274/C2: 点击后世界日记计量归零（reset 真被调用；实 ' + WA.worldDiary.stat().builds + '）');
    a(WA.dayRoute.stat().builds === 0, 'v2274/C2b: 人物动线同步归零（实 ' + WA.dayRoute.stat().builds + '）');
    a(WA.roundCost.stat().builds === 0, 'v2274/C2c: 单轮成本同步归零（实 ' + WA.roundCost.stat().builds + '）');
    const out = dom.getElementById('wa-diag-out');
    a(!!out && String(out.innerHTML).indexOf('读数仪已清零') >= 0,
      'v2274/C3: 面板给出清零反馈（不静默；实 ' + j(out && String(out.textContent).slice(0, 40)) + '）');
    a(String(out && out.innerHTML).indexOf('8') >= 0, 'v2274/C3b: 反馈里报出清零台数（八台都在场）');
  }
  {
    // C4 「知道了」：点一下引导必须收起（此前 dismiss 未导出，界面上根本没有这个动作）
    const env = freshEnv();
    const WA = env.WA, dom = env.dom;
    pageHtml(env, 'overview');
    a(WA.firstRun.build().visible === true, 'v2274/C4a: 前置成立 —— 出厂态引导可见');
    const btn = dom.querySelector('[data-first-dismiss]');
    a(!!btn && typeof btn.onclick === 'function', 'v2274/C4b: 「知道了」真渲染且绑上处理器（实 ' + !!btn + '）');
    if (btn && btn.onclick) btn.onclick();
    a(WA.firstRun.build().visible === false, 'v2274/C4c: 点击后引导收起（dismiss 真被调用）');
    a(WA.firstRun.build().ok === true, 'v2274/C4d: 收起只写设置族，不把引擎弄成读不到');
  }
  {
    // C5 打包并校验：结果里带 suggest 的「下一步」（此前 suggest 是零消费死导出）
    const env = freshEnv();
    const WA = env.WA, dom = env.dom;
    pageHtml(env, 'settings');
    try { WA.rulePack.setSettings({ enabled: false }); } catch (ex) {}
    const pack = dom.getElementById('wa-hp-pack');
    const out = dom.getElementById('wa-hp-out');
    a(!!pack && typeof pack.onclick === 'function', 'v2274/C5a: 打包钮在场并绑上');
    if (pack && pack.onclick) pack.onclick();
    const txt = String(out && out.textContent || '');
    a(txt.indexOf('打包完成') >= 0, 'v2274/C5b: 打包给出结论（实 ' + j(txt.slice(0, 50)) + '）');
    a(txt.indexOf('下一步') >= 0, 'v2274/C5c: 结论里带 suggest 的下一步（缺块该去哪开）');
  }
  // ── N 真源码破坏 + 两向自证 ─────────────────────────────────────────────
  {
    /**
     * 一律：真源码破坏（锚点恰中 1 次）→ 装载破坏副本 → 在副本上重跑**同款判据**必须现形；
     *   原版上同判据必须为真。破坏只改内存，零文件改写。
     * ⚠ 两种运行都必须**先真渲染到目标页**再点：控件不在 DOM 树里时 getElementById 返回 null、
     *   「点了没反应」恒成立 —— 那是空判据，不是破坏现形。故两条自证都要求 hasBtn 为真。
     */
    function withBroken(anchorRel, anchor, replacement, fn) {
      const src = rd(anchorRel);
      const n = cnt(src, anchor);
      if (n !== 1) throw new Error('破坏锚点须恰中 1 次（实 ' + n + '）：' + anchor.slice(0, 40));
      const ov = {};
      ov[anchorRel] = src.split(anchor).join(replacement);
      const env = freshEnv(ov);
      let out = null, threw = null;
      try { out = fn(env.WA, env.dom); } catch (e) { threw = (e && e.message) || String(e); }
      return { threw: threw, out: out };
    }
    function withGood(fn) {
      const env = freshEnv();
      let out = null, threw = null;
      try { out = fn(env.WA, env.dom); } catch (e) { threw = (e && e.message) || String(e); }
      return { threw: threw, out: out };
    }
    // N1 破坏清零调用 ⇒ 计量不清零
    const bad1 = withBroken(PANEL_REL, ANCHOR.gaugeCall, "['世界日记', function () { return null; }],",
      function (WA, dom) {
        goto(WA, 'tools');
        try { WA.worldDiary.build(); } catch (e) {}
        const before = WA.worldDiary.stat().builds;
        const btn = dom.getElementById('wa-gauge-reset');
        if (btn && btn.onclick) btn.onclick();
        return { hasBtn: !!btn, zeroed: WA.worldDiary.stat().builds === 0, before: before };
      });
    a(bad1.threw === null, 'v2274/N1a: 破坏版不抛（实 ' + j(bad1.threw) + '）');
    a(bad1.out && bad1.out.hasBtn === true && bad1.out.before >= 1 && bad1.out.zeroed === false,
      'v2274/N1b: （两向）清零调用被摘后世界日记不清零（实 ' + j(bad1.out) + '）');
    const good1 = withGood(function (WA, dom) {
      goto(WA, 'tools');
      try { WA.worldDiary.build(); } catch (e) {}
      const before = WA.worldDiary.stat().builds;
      const btn = dom.getElementById('wa-gauge-reset');
      if (btn && btn.onclick) btn.onclick();
      return { hasBtn: !!btn, before: before, zeroed: WA.worldDiary.stat().builds === 0 };
    });
    a(good1.out && good1.out.hasBtn === true && good1.out.before >= 1 && good1.out.zeroed === true,
      'v2274/N1c: 原版上同判据为真（实 ' + j(good1.out) + '）');
    // N2 破坏 dismiss 调用 ⇒ 引导不收起
    const bad2 = withBroken(PANEL_REL, ANCHOR.dismissCall, 'const r = { ok: true };',
      function (WA, dom) {
        goto(WA, 'overview');
        const btn = dom.querySelector('[data-first-dismiss]');
        if (btn && btn.onclick) btn.onclick();
        return { hasBtn: !!btn, visible: WA.firstRun.build().visible };
      });
    a(bad2.threw === null, 'v2274/N2a: 破坏版不抛（实 ' + j(bad2.threw) + '）');
    a(bad2.out && bad2.out.hasBtn === true && bad2.out.visible === true,
      'v2274/N2b: （两向）dismiss 调用被摘后引导仍可见（实 ' + j(bad2.out) + '）');
    const good2 = withGood(function (WA, dom) {
      goto(WA, 'overview');
      const btn = dom.querySelector('[data-first-dismiss]');
      if (btn && btn.onclick) btn.onclick();
      return { hasBtn: !!btn, visible: WA.firstRun.build().visible };
    });
    a(good2.out && good2.out.hasBtn === true && good2.out.visible === false,
      'v2274/N2c: 原版上同判据为真（收起；实 ' + j(good2.out) + '）');
    // N3 破坏 suggest 调用 ⇒ 结论里没有「下一步」（但打包本身仍成功 —— 证明破坏的是这一句）
    const bad3 = withBroken(SET_REL, ANCHOR.suggestCall, 'const sg = null;',
      function (WA, dom) {
        goto(WA, 'settings');
        const pack = dom.getElementById('wa-hp-pack');
        const out = dom.getElementById('wa-hp-out');
        if (pack && pack.onclick) pack.onclick();
        const txt = String(out && out.textContent || '');
        return { hasBtn: !!pack, hasNext: txt.indexOf('下一步') >= 0, packed: txt.indexOf('打包完成') >= 0 };
      });
    a(bad3.threw === null, 'v2274/N3a: 破坏版不抛（实 ' + j(bad3.threw) + '）');
    a(bad3.out && bad3.out.hasBtn === true && bad3.out.packed === true && bad3.out.hasNext === false,
      'v2274/N3b: （两向）suggest 被摘后打包照旧成功但没有「下一步」（实 ' + j(bad3.out) + '）');
    const good3 = withGood(function (WA, dom) {
      goto(WA, 'settings');
      const pack = dom.getElementById('wa-hp-pack');
      const out = dom.getElementById('wa-hp-out');
      if (pack && pack.onclick) pack.onclick();
      return { hasBtn: !!pack, hasNext: String(out && out.textContent || '').indexOf('下一步') >= 0 };
    });
    a(good3.out && good3.out.hasBtn === true && good3.out.hasNext === true,
      'v2274/N3c: 原版上同判据为真（有下一步；实 ' + j(good3.out) + '）');
    // N4 负控制全程未改真源码
    a(rd(PANEL_REL) === P, 'v2274/N4a: 负控制后 panel.js 逐字未变');
    a(rd(SET_REL) === S, 'v2274/N4b: 负控制后 settings.js 逐字未变');
    a(cnt(rd(PANEL_REL), ANCHOR.gaugeCall) === 1, 'v2274/N4c: 真源码里的清零调用仍在（破坏只发生在内存副本）');
  }
  return { pass: pass, fail: fail, fails: fails };
}
module.exports = { runAll: runAll };
if (require.main === module) {
  const r = runAll(null);
  console.log('══ v2.274.0 读数仪接线锁（gauge-wire-v2274）══');
  console.log('通过 ' + r.pass + ' / 失败 ' + r.fail);
  if (r.fail) r.fails.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(r.fail > 0 ? 1 : 0);
}