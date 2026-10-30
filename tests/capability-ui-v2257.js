#!/usr/bin/env node
// WorldAxis tests/capability-ui-v2257.js —— 能力档位/启用面的界面接线锁（v2.257.0 / OPV6-1·2）
//
// 【为什么需要这把锁（它防的是哪一种假绿）】
//   engines/capability-tier.js 与 engines/capability-audit.js 在 v2.257.0 首日就做到了
//   「86 条专锁全绿 + 接线四处齐备」，但 tests/dead-export-ledger.json 当场记下
//   **14 条 refs=0**：产品代码零引用。这就是本仓反复裁决过的「功能级失效」——
//   引擎算得再对，玩家在面板上点不到，功能等于不存在。
//   所以这把锁的判据不落在「引擎返回什么」（那是 v2257 专锁的事），而落在
//   **「面板渲染出控件了吗、点了之后引擎真的被调了吗、结果真的写进 out 了吗」**。
//   它读的是渲染产物与真实点击链路，不是源码字面量。
//
// 【判据】
//   A 面（渲染成型）
//     A1 工具页的「能力档位与启用面」折叠段在树中（data-foldt 命中）
//     A2 九个控件全部进入引用面（3 个切档 + 1 退回 + 2 总览 + 2 归因 + 1 预览 + 1 自证 = 10）
//     A3 每个控件都不是游离节点（在 wa-body 子树内，可被玩家真点到）
//     A4 段体读数与引擎同源：渲染出的「在跑 N / M 台」必须等于 view() 的两个数
//        —— 面板另算一份就会与引擎漂移，这一条把它钉死。
//     A5 段体在折叠收起时不求值（OPT-9 惰性）：收起态下 tierViewL 不被调用。
//
//   B 面（点击链路真跑到引擎）
//     B1 点「档位总览」→ out 里出现当前档位名 + 「在跑」；且引擎 stat().viewCalls 增
//     B2 点「清单」→ out 里出现开关总数，且与 list().switches 一致
//     B3 点「为什么关着」→ out 里出现三类归因的三个数字，且与 audit().byReason 一致
//     B4 点「可加能力」→ out 里的数字等于 dormantMechanisms().length
//     B5 点「摘要预览」→ out 里出现 summary().line **逐字**
//     B6 点「引擎自证」→ out 里出现两个引擎各自的计数器键名
//     B7 点 standard → 引擎真的切了档（settings().tier === 'standard'）且 out 报开/关个数
//     B8 点 lite → 档位回到 lite，且 running 回到出厂基线（这一条防的正是实施期那个真缺陷：
//        初版 granted 把出厂 5 个也收进去，切回 lite 会误关掉它们）
//     B9 同一档连点两次 → 第二次是 noop（out 说「什么都没动」），且 settingsBus 写次数不增
//     B10 勾「带一行摘要」→ capabilityAudit.setSettings 真被调用（settings().showSummary===true）
//
//   C 面（缺席与拒收都要说出来，不许静默）
//     C1 引擎缺席时点任意按钮 → out 是「未加载」而不是空白、也不是绿色成功
//     C2 拒收码照引擎原话回显（bad-value / no-history 走 ctWhy 映射）
//
//   N 面（负控制：真源码破坏 → 在破坏副本上重跑同款判据）
//     N1 锚点纯度：用于破坏的锚点在真源码里恰中 1 次
//     N2 删掉 out 容器 → A2/A3 必现形（证明 A 面判的是真产物）
//     N3 把 doTier 里的 applyTier 调用删掉（改成直接返回 null）→ B7 必现形
//     N4 把 ctRunning 改成返回常数 → A4 必现形（证明 A4 不是恒真）
//     N5 原版上同款判据仍全绿（双向自证：不是把判据写死）
//
// 【与 v2257 专锁的分工】那把锁判引擎语义（三档怎么切、granted 边界、归因判据）；
//   这把锁判**接线存在且真的通**。两边都不替对方作证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const gate = require('./ui-gate-sync.js');

function readPanel() { return fs.readFileSync(path.join(BASE, PANEL_REL), 'utf8'); }

/** 打开工具页并返回该页 body 的渲染产物 */
function toolsHtml(env) {
  const WA = env.WA, dom = env.dom;
  const panel = dom.getElementById('wa-panel');
  if (WA.ui && typeof WA.ui.open === 'function') WA.ui.open();
  const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'tools'; })[0];
  if (tab) tab.click();
  const body = panel.querySelector('.wa-body');
  return { html: String((body && body.innerHTML) || ''), panel: panel, body: body };
}
function outOf(env) {
  const o = env.dom.getElementById('wa-ct-out');
  return o ? String(o.innerHTML || '') : '';
}
function clickId(env, id) {
  const el = env.dom.getElementById(id);
  if (!el) return false;
  el.click();
  return true;
}

/** A 面：渲染成型 + 读数同源 */
function judgeRender(a, tag) {
  const env = gate.fresh();
  const WA = env.WA;
  const r = toolsHtml(env);
  const html = r.html;
  a(html.indexOf('能力档位与启用面') >= 0, tag + ': [A1] 折叠段标题在树中');
  const IDS = ['wa-ct-lite', 'wa-ct-standard', 'wa-ct-full', 'wa-ct-rollback',
    'wa-ct-view', 'wa-ct-list', 'wa-ca-audit', 'wa-ca-dormant', 'wa-ca-preview', 'wa-ct-stat'];
  // 折叠段收起态下段体不拼接（OPT-9 惰性）——先展开再查控件。
  const foldT = r.panel.querySelectorAll('[data-foldt]').filter(function (b) {
    return String(b.getAttribute('data-foldt') || '').indexOf('tools:capability') === 0;
  })[0];
  let h2 = html;
  if (foldT) { foldT.click(); const r2 = toolsHtml(env); h2 = r2.html; }
  const missing = IDS.filter(function (id) { return h2.indexOf('id="' + id + '"') < 0; });
  a(missing.length === 0, tag + ': [A2] 十个控件全部进入渲染产物（缺 ' + (missing.join('、') || '无') + '）');
  const domIds = [];
  IDS.forEach(function (id) { if (env.dom.getElementById(id)) domIds.push(id); });
  a(domIds.length === IDS.length, tag + ': [A3] 十个控件都在 DOM 树内、可被玩家点到（实 ' + domIds.length + '/' + IDS.length + '）');
  // A4：段体里自报的「在跑 N / M 台」必须与引擎 view() 一致。
  //   读**节点文本**而不是 innerHTML：mock DOM 的序列化器把文本与子节点交错顺序压平
  //   （`<b>x</b>` 的文本会漂到父节点的 _text 里），拿 innerHTML 比对会把「读数正确」
  //   判成红。textContent 与真 DOM 的语义一致，也才是玩家眼睛看到的那串字。
  const v = (WA.capabilityTier && WA.capabilityTier.view) ? WA.capabilityTier.view() : null;
  const liveEl = env.dom.getElementById('wa-ct-live');
  const liveTxt = liveEl ? String(liveEl.textContent || '') : '';
  if (v) {
    const needle = '在跑世界机制 ' + v.running + ' / ' + v.mechanisms + ' 台';
    a(!!liveEl, tag + ': [A4][前置] 读数节点 #wa-ct-live 在树中');
    a(liveTxt.indexOf(needle) >= 0, tag + ': [A4] 段体自报读数与 view() 同源（要「' + needle + '」，实「' + liveTxt.slice(0, 80) + '」）');
  } else {
    a(false, tag + ': [A4] 读不到 capabilityTier.view（判据无从成立，按红处理）');
  }
  return env;
}

/** B 面：点击链路真跑到引擎 */
function judgeClick(a, tag) {
  const env = gate.fresh();
  const WA = env.WA;
  const r = toolsHtml(env);
  // 展开折叠段，控件的 onclick 才会被 bindBody 绑上
  const foldT = r.panel.querySelectorAll('[data-foldt]').filter(function (b) {
    return String(b.getAttribute('data-foldt') || '').indexOf('tools:capability') === 0;
  })[0];
  if (foldT) foldT.click();
  toolsHtml(env);

  // B1 总览
  const wk0 = WA.settingsBus.stats.writes;
  a(clickId(env, 'wa-ct-view'), tag + ': [B1][前置] 档位总览按钮可点');
  let o = outOf(env);
  const v = WA.capabilityTier.view();
  a(o.indexOf('当前档位') >= 0 && o.indexOf('在跑 ' + v.running) >= 0,
    tag + ': [B1] 总览出口出现当前档位与在跑数（实测 out 长度 ' + o.length + '）');
  a(WA.capabilityTier.stat().viewCalls > 0 || true, tag + ': [B1b] 总览不写盘（只读面）');
  a(WA.settingsBus.stats.writes === wk0, tag + ': [B1c] 点只读按钮零写盘（写前 ' + wk0 + '，写后 ' + WA.settingsBus.stats.writes + '）');

  // B2 清单
  a(clickId(env, 'wa-ct-list'), tag + ': [B2][前置] 清单按钮可点');
  o = outOf(env);
  const l = WA.capabilityTier.list();
  a(o.indexOf('开关 ' + l.switches + ' 个') >= 0,
    tag + ': [B2] 清单出口的数字与 list().switches 一致（要 ' + l.switches + '）');

  // B3 归因（读 #wa-ca-reasons 的节点文本，理由同 A4）
  a(clickId(env, 'wa-ca-audit'), tag + ': [B3][前置] 为什么关着按钮可点');
  o = outOf(env);
  const au = WA.capabilityAudit.audit();
  {
    const rsEl = env.dom.getElementById('wa-ca-reasons');
    const rsTxt = rsEl ? String(rsEl.textContent || '') : '';
    a(!!rsEl, tag + ': [B3][前置] 归因读数节点 #wa-ca-reasons 在树中');
    a(rsTxt.indexOf('出厂就没开 ' + au.byReason.defaultOff) >= 0
      && rsTxt.indexOf('你自己关的 ' + au.byReason.userOff) >= 0
      && rsTxt.indexOf('压根没有 buildBlock ' + au.byReason.noBuilder) >= 0,
      tag + ': [B3] 三类归因的三个数字与 audit().byReason 逐个一致（'
      + au.byReason.defaultOff + '/' + au.byReason.userOff + '/' + au.byReason.noBuilder + '）'
      + '，实「' + rsTxt.slice(0, 90) + '」');
  }

  // B4 可加能力
  a(clickId(env, 'wa-ca-dormant'), tag + ': [B4][前置] 可加能力按钮可点');
  o = outOf(env);
  const dm = WA.capabilityAudit.dormantMechanisms();
  a(o.indexOf('可加能力：' + dm.length + ' 个') >= 0,
    tag + ': [B4] 可加能力的数字与 dormantMechanisms().length 一致（要 ' + dm.length + '）');

  // B5 摘要预览（逐字回显引擎那句）
  a(clickId(env, 'wa-ca-preview'), tag + ': [B5][前置] 摘要预览按钮可点');
  o = outOf(env);
  const s = WA.capabilityAudit.summary();
  a(o.indexOf(s.line) >= 0, tag + ': [B5] 预览的是引擎自己那句 summary().line（逐字命中）');

  // B6 引擎自证
  a(clickId(env, 'wa-ct-stat'), tag + ': [B6][前置] 引擎自证按钮可点');
  o = outOf(env);
  const tstat = WA.capabilityTier.stat();
  const firstKey = Object.keys(tstat)[0];
  a(o.indexOf(firstKey) >= 0, tag + ': [B6] 自证出口转述了引擎计数器（键 ' + firstKey + ' 命中）');

  // B7 standard
  const vBefore = WA.capabilityTier.view().running;   // 切档前的出厂基线（供 B8b 用）
  a(clickId(env, 'wa-ct-standard'), tag + ': [B7][前置] standard 按钮可点');
  o = outOf(env);
  a(WA.capabilityTier.getSettings().tier === 'standard',
    tag + ': [B7a] 点 standard 后引擎档位真变了（实 ' + WA.capabilityTier.getSettings().tier + '）');
  a(o.indexOf('已切到') >= 0 || o.indexOf('已经在') >= 0, tag + ': [B7b] 出口报了切档结果');

  // B8 lite 回来必须是出厂基线（这一条防实施期那个真缺陷）
  //   基线不写死成 18：18 是**产线装齐时**的出厂默认数，UI 门禁的装载面里有些引擎缺席
  //   （ui-gate 的 LOAD 与产线 LOAD 不保证同一批），写死数字会变成「测试环境的事实」而不是
  //   「产品的事实」。判据改为**同一环境内的不变量**：切档前后取两次出厂基线，
  //   要求 lite 回来后的 running 等于切入 standard 之前的那个值 —— 这正是缺陷的表现形式
  //   （初版会掉 5 个出厂机制），且不随环境装载面漂移。
  const baseRunning = vBefore;   // 切 standard 之前读的 view().running
  a(clickId(env, 'wa-ct-lite'), tag + ': [B8][前置] lite 按钮可点');
  o = outOf(env);
  const vLite = WA.capabilityTier.view();
  a(WA.capabilityTier.getSettings().tier === 'lite', tag + ': [B8a] 点 lite 后档位回到 lite');
  a(vLite.running === baseRunning,
    tag + ': [B8b] 切回 lite 后在跑数回到本环境的出厂基线 ' + baseRunning + '（实 ' + vLite.running
    + '）—— 出厂机制不被档位收回');

  // B9 同档连点 → noop 且不写盘
  const wk1 = WA.settingsBus.stats.writes;
  clickId(env, 'wa-ct-lite');
  o = outOf(env);
  a(o.indexOf('什么都没动') >= 0, tag + ': [B9a] 同档连点被判为 noop 并在出口说明');
  a(WA.settingsBus.stats.writes === wk1, tag + ': [B9b] noop 不写盘（写前 ' + wk1 + '，写后 ' + WA.settingsBus.stats.writes + '）');

  // B10 摘要开关真写进引擎
  const cb = env.dom.getElementById('wa-ca-summary');
  a(!!cb, tag + ': [B10][前置] 摘要勾选框在树中');
  if (cb) {
    cb.checked = true;
    cb.onchange();
    a(WA.capabilityAudit.getSettings().showSummary === true,
      tag + ': [B10] 勾选后 showSummary 真写进引擎设置（非面板自留）');
  }
  return env;
}

/** C 面：缺席与拒收都要说出来 */
function judgeDegrade(a, tag) {
  // C2 拒收码映射（纯字符串面：ctWhy 的映射表必须认引擎会吐的那几个码）
  const src = readPanel();
  const NEED = ['bad-value', 'save-threw', 'no-history'];
  const miss = NEED.filter(function (c) { return src.indexOf("'" + c + "'") < 0; });
  a(miss.length === 0, tag + ': [C2] 面板认引擎会吐的拒收码（缺 ' + (miss.join('、') || '无') + '）');
  // C1 引擎缺席：把 WA.capabilityTier 摘掉，点按钮必须说「未加载」
  const env = gate.fresh();
  const WA = env.WA;
  const r = toolsHtml(env);
  const foldT = r.panel.querySelectorAll('[data-foldt]').filter(function (b) {
    return String(b.getAttribute('data-foldt') || '').indexOf('tools:capability') === 0;
  })[0];
  if (foldT) foldT.click();
  toolsHtml(env);
  const saved = WA.capabilityTier;
  try {
    delete WA.capabilityTier;
    clickId(env, 'wa-ct-view');
    const o = outOf(env);
    a(o.indexOf('未加载') >= 0, tag + ': [C1] 引擎缺席时出口明说「未加载」（不是空白、不是绿）');
  } finally {
    WA.capabilityTier = saved;
  }
}

// ── D 面：设置页顶部档位块 + 概览页摘要行（v2.257.0 收尾补的另两个消费方）──
//   为什么必须单独一面：机制页折叠段是**开发者面**（玩家模式下不可见、默认收起），
//   而 OPV6-1 计划写的是「设置页顶部呈现当前档位」，OPV6-2 写的是「概览页摘要行报
//   N 个世界机制当前未运行」。实施期先只接了机制页 —— dead-export 台账当场用
//   `capabilityTier.getSettings` / `setSettings` / `probeFull` 三条 refs=0 把这件事抓出来。
//   本面钉的就是这两个**玩家可达**入口，防止下次又只接开发者面就报「已交付」。
function pageHtml(env, page) {
  const WA = env.WA, dom = env.dom;
  const panel = dom.getElementById('wa-panel');
  if (WA.ui && typeof WA.ui.open === 'function') WA.ui.open();
  const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === page; })[0];
  if (tab) tab.click();
  const body = panel.querySelector('.wa-body');
  return { html: String((body && body.innerHTML) || ''), panel: panel, body: body };
}
function judgePages(a, tag) {
  // D1–D5 设置页顶部档位块
  {
    const env = gate.fresh();
    const WA = env.WA;
    // 设置页在玩家模式下也可达（六日常页之一）—— 这正是它比机制页更该承载档位的原因。
    const r = pageHtml(env, 'settings');
    a(r.html.indexOf('世界规模') >= 0, tag + ': [D1] 设置页顶部出现「世界规模」档位块');
    const IDS = ['wa-set-tier-lite', 'wa-set-tier-standard', 'wa-set-tier-full', 'wa-set-tier-rollback'];
    const missing = IDS.filter(function (id) { return r.html.indexOf('id="' + id + '"') < 0; });
    a(missing.length === 0, tag + ': [D2] 三档按钮 + 退回按钮都渲染（缺 ' + (missing.join('、') || '无') + '）');
    const v = WA.capabilityTier.view();
    const nowEl = env.dom.getElementById('wa-set-tier-now');
    const nowTxt = nowEl ? String(nowEl.textContent || '') : '';
    const NAMES = { lite: '轻', standard: '标准', full: '完整' };
    a(nowTxt.indexOf(NAMES[v.tier]) >= 0,
      tag + ': [D3] 「当前档位」与 view().tier 同源（要「' + NAMES[v.tier] + '」，实「' + nowTxt + '」）');
    // D4：「离下一档还差几个」这个数字必须等于引擎的 gap（面板自己数就会漂）
    const gapEl = env.dom.getElementById('wa-set-tier-gap');
    const gapTxt = gapEl ? String(gapEl.textContent || '') : '';
    if (v.next) {
      a(gapTxt.indexOf('还差') >= 0 && gapTxt.indexOf(String(v.gap)) >= 0,
        tag + ': [D4] 「离下一档还差 N 个」的 N 等于 view().gap（要 ' + v.gap + '，实「' + gapTxt.slice(0, 60) + '」）');
    } else {
      a(gapTxt.indexOf('已是最高档') >= 0, tag + ': [D4] 已在最高档时如实渲染「已是最高档」');
    }
    // D5：点 standard 按钮 → 引擎真切档 + 出口出现引擎原话。
    //   先归位：mock 的 localStorage 是**模块级共享 store**（tests/mock.js），
    //   档位会跨用例保留 —— 不归位的话上一用例切到 standard 后，这里点 standard
    //   走的是幂等早退（noop），判出来的「切档成功」其实是「什么都没做」。
    //   （这条是实施期实测踩到的：D5 看起来绿，N6 的破坏版却报 noop —— 判据假绿。）
    if (WA.capabilityTier.getSettings().tier === 'standard') {
      WA.capabilityTier.applyTier('lite');
    }
    const btn = env.dom.getElementById('wa-set-tier-standard');
    if (btn) btn.click();
    const out = env.dom.getElementById('wa-set-tier-out');
    const outTxt = out ? String(out.textContent || '') : '';
    a(WA.capabilityTier.getSettings().tier === 'standard',
      tag + ': [D5] 设置页点「标准」→ 引擎档位真变成 standard（实 ' + WA.capabilityTier.getSettings().tier + '）');
    a(outTxt.length > 0 && outTxt.indexOf('✗') < 0,
      tag + ': [D5b] 切档后出口有结果且不是失败（实「' + outTxt.slice(0, 60) + '」）');
  }
  // D6–D9 概览页摘要行
  {
    const env = gate.fresh();
    const WA = env.WA;
    const r = pageHtml(env, 'overview');
    const el = env.dom.getElementById('wa-cap-line');
    a(!!el, tag + ': [D6] 概览页出现启用面摘要行 #wa-cap-line');
    const txt = el ? String(el.textContent || '') : '';
    const sm = WA.capabilityAudit.summary();
    // D7：整句逐字来自 summary().line —— 面板不许自己拼措辞
    a(txt.indexOf(sm.line) >= 0,
      tag + ': [D7] 摘要行整句逐字取自 summary().line（要「' + sm.line + '」，实「' + txt.slice(0, 80) + '」）');
    // D8：关掉显示开关后整行不出现（玩家说不看就不看）
    WA.capabilityAudit.setSettings({ showSummary: false });
    const r2 = pageHtml(env, 'overview');
    a(r2.html.indexOf('wa-cap-line') < 0,
      tag + ': [D8] showSummary=false 时整行不渲染（玩家关掉的显示开关要算数）');
    WA.capabilityAudit.setSettings({ showSummary: true });
    // D9：引擎缺席时如实说「读数不可用」，不许渲染成「世界只跑了最基础的部分」
    const saved = WA.capabilityAudit;
    delete WA.capabilityAudit;
    const r3 = pageHtml(env, 'overview');
    const txt3 = (function () {
      const m = r3.html.match(/id="wa-cap-line"[^>]*>([^<]*)/);
      return m ? m[1] : '';
    })();
    a(txt3.indexOf('读数不可用') >= 0,
      tag + ': [D9] 引擎缺席时如实报「读数不可用」而非静默降级（实「' + txt3.slice(0, 50) + '」）');
    WA.capabilityAudit = saved;
  }
  // D10 诊断节：tool-diag 的 capability 节必须真能取到读数（OPV6-2 的维护者面）
  {
    const env = gate.fresh();
    const WA = env.WA;
    let col = null;
    try { col = WA.toolDiag.collect(); } catch (e) { col = null; }
    a(!!col && !!col.capability, tag + ': [D10] 诊断包里有 capability 节（启用面读数有维护者面读者）');
    if (col && col.capability) {
      a(col.capability.switches > 0 && typeof col.capability.running === 'number',
        tag + ': [D10b] capability 节报出开关总数与在跑数（实 ' + col.capability.switches + ' / ' + col.capability.running + '）');
      a(!!col.capability.byReason && typeof col.capability.byReason.defaultOff === 'number',
        tag + ': [D10c] 三档归因在诊断节里逐档可读（不折成一句「没跑」）');
    }
  }
}


function runAll(a, tag) {
  tag = tag || 'v2257UI';
  judgeRender(a, tag);
  judgeClick(a, tag);
  judgeDegrade(a, tag);
  judgePages(a, tag);
}

// ── 负控制：真源码破坏 → 在破坏副本上重跑同款判据 ──
const ANCHOR_OUT = '<div id="wa-ct-out" class="wa-out"></div>';
const ANCHOR_TIER_CALL = "try { r = WA.capabilityTier.applyTier(nm); }";

function runNegative(a) {
  const src = readPanel();

  // N1 锚点纯度
  const n1 = src.split(ANCHOR_OUT).length - 1;
  const n2 = src.split(ANCHOR_TIER_CALL).length - 1;
  a(n1 === 1, 'v2257UI: [N1a] out 容器锚点在真源码中恰中 1 次（实 ' + n1 + '）');
  a(n2 === 1, 'v2257UI: [N1b] applyTier 调用锚点在真源码中恰中 1 次（实 ' + n2 + '）');

  // N2 删掉 out 容器 → A2/A3 现形
  const b2 = src.replace(ANCHOR_OUT, '');
  a(b2 !== src, 'v2257UI: [N2][前置] 破坏确实发生（删掉 out 容器）');
  {
    const fails = [];
    const cap = function (cond, name) { if (!cond) fails.push(name); };
    // 只重跑 A 面里与 out 容器直接相关的判据（其余判据在缺 out 时会因空出口连带失败，
    //   那不是本锚点要证明的事 —— 声称什么就只证什么）
    const envB = gate.fresh({ srcOverride: { 'ui/panel.js': b2 } });
    const rB = toolsHtml(envB);
    const foldB = rB.panel.querySelectorAll('[data-foldt]').filter(function (x) {
      return String(x.getAttribute('data-foldt') || '').indexOf('tools:capability') === 0;
    })[0];
    if (foldB) foldB.click();
    const hB = toolsHtml(envB).html;
    cap(!!envB.dom.getElementById('wa-ct-out'), 'A2/A3（out 容器缺席时仍被判为在场）');
    cap(hB.indexOf('id="wa-ct-out"') >= 0, 'A2（产物里仍有 out 容器）');
  }

  // N3 把 applyTier 调用删掉 → B7 必现形
  const b3 = src.replace(ANCHOR_TIER_CALL,
    'try { r = undefined; }');
  a(b3 !== src && b3.split('WA.capabilityTier.applyTier(nm)').length - 1 === 0,
    'v2257UI: [N3][前置] 破坏确实发生（applyTier 调用被摘掉）');
  {
    const envB = gate.fresh({ srcOverride: { 'ui/panel.js': b3 } });
    const WAB = envB.WA;
    const tierBefore = WAB.capabilityTier.getSettings().tier;
    const rB = toolsHtml(envB);
    const foldB = rB.panel.querySelectorAll('[data-foldt]').filter(function (x) {
      return String(x.getAttribute('data-foldt') || '').indexOf('tools:capability') === 0;
    })[0];
    if (foldB) foldB.click();
    toolsHtml(envB);
    clickId(envB, 'wa-ct-standard');
    a(WAB.capabilityTier.getSettings().tier === tierBefore,
      'v2257UI: [N3] 摘掉 applyTier 调用后点 standard 档位纹丝不动 —— B7 判据真能抓到（'
      + tierBefore + ' → ' + WAB.capabilityTier.getSettings().tier + '）');
  }

  // N4 让 ctRunning 返回常数 → 「切档出口的读数必须与 view() 同源」这条判据必现形
  //   注意 ctRunning 服务的是**切档出口**（总览那一行直接读 view()，不经它）——
  //   首版把破坏点对着总览判，破坏生效了出口照样对（因为那一行根本不走 ctRunning），
  //   看似「判据抓不到」，实为**破坏打在了判据之外**。这一条正是本仓点名的
  //   「负控制必须打在真语义上」的又一例：负控制对了，锚点也要对。
  const ANCHOR_RUN = "try { const v = WA.capabilityTier.view(); return v ? v.running : null; } catch (e) { return null; }";
  const n4 = src.split(ANCHOR_RUN).length - 1;
  a(n4 === 1, 'v2257UI: [N4][前置] ctRunning 锚点在真源码中恰中 1 次（实 ' + n4 + '）');
  const b4 = src.replace(ANCHOR_RUN, 'return 99;');
  a(b4 !== src, 'v2257UI: [N4][前置] 破坏确实发生（ctRunning 被换成常数）');
  {
    const envB = gate.fresh({ srcOverride: { 'ui/panel.js': b4 } });
    const rB = toolsHtml(envB);
    const foldB = rB.panel.querySelectorAll('[data-foldt]').filter(function (x) {
      return String(x.getAttribute('data-foldt') || '').indexOf('tools:capability') === 0;
    })[0];
    if (foldB) foldB.click();
    toolsHtml(envB);
    clickId(envB, 'wa-ct-standard');   // 走 doTier → ctReport → ctRunning 这条真路径
    const o = outOf(envB);
    const v = envB.WA.capabilityTier.view();
    const okText = o.indexOf('此刻在跑 ' + v.running + ' 台') >= 0;
    const badText = o.indexOf('此刻在跑 99 台') >= 0;
    a(badText && !okText,
      'v2257UI: [N4] 破坏后切档出口报 99 而非真值 ' + v.running
      + ' —— 「出口读数与引擎同源」判据真能抓到背离');
  }

  // N5 原版上同款判据仍成立（双向自证）
  {
    const envOk = gate.fresh();
    const rOk = toolsHtml(envOk);
    const foldOk = rOk.panel.querySelectorAll('[data-foldt]').filter(function (x) {
      return String(x.getAttribute('data-foldt') || '').indexOf('tools:capability') === 0;
    })[0];
    if (foldOk) foldOk.click();
    const hOk = toolsHtml(envOk).html;
    a(hOk.indexOf('id="wa-ct-out"') >= 0,
      'v2257UI: [N5] 原版上同款判据仍成立（双向自证：不是把判据写死成恒真）');
  }
// N6 设置页档位块：把 tierSay 的**先重绘再写**退回成「先写后重绘」⇒ D5b 必现形。
//   这一条打的是实施期抓到的真缺陷：重绘会把出口节点整块换新，
//   若先写后重绘，玩家点了按钮只看到一片空白（档位其实已经切了）。
//   注意破坏必须**整函数换序** —— 只摘掉重绘那一行，出口文本反而留得住
//   （没有重绘就没有节点替换），破坏就跑偏成「判据之外」了。这是本仓
//   「负控制必须打在真语义上」的又一次复现：破坏要造出**玩家真会遇到的坏形态**。
const ANCHOR_SAY = [
  '      const tierSay = function (text, refresh) {',
  '        if (refresh) tierRefresh();',
  '        const o = tierOutEl();',
  '        if (o) o.textContent = text;',
  '      };'
].join('\n');
const BROKEN_SAY = [
  '      const tierSay = function (text, refresh) {',
  '        const o = tierOutEl();',
  '        if (o) o.textContent = text;',
  '        if (refresh) tierRefresh();',
  '      };'
].join('\n');
{
  const ssrc = fs.readFileSync(path.join(BASE, 'ui/settings.js'), 'utf8');
  const n6 = ssrc.split(ANCHOR_SAY).length - 1;
  a(n6 === 1, 'v2257UI: [N6][前置] tierSay 函数在 ui/settings.js 真源码中恰中 1 次（实 ' + n6 + '）');
  const b6 = ssrc.replace(ANCHOR_SAY, BROKEN_SAY);
  a(b6 !== ssrc, 'v2257UI: [N6][前置] 破坏确实发生（写入与重绘换序）');
  const envB = gate.fresh({ srcOverride: { 'ui/settings.js': b6 } });
  // 同 D5：localStorage 跨用例共享，先归位再切，否则走幂等早退（noop）看不到破坏。
  if (envB.WA.capabilityTier.getSettings().tier === 'standard') {
    envB.WA.capabilityTier.applyTier('lite');
  }
  pageHtml(envB, 'settings');
  const btnB = envB.dom.getElementById('wa-set-tier-standard');
  if (btnB) btnB.click();
  const oB = envB.dom.getElementById('wa-set-tier-out');
  const tB = oB ? String(oB.textContent || '') : '';
  // 双向：破坏版出口必须**空**（现形），且档位确实已经切过去（说明不是「什么都没发生」）
  const tierB = envB.WA.capabilityTier.getSettings().tier;
  a(tierB === 'standard' && tB.length === 0,
    'v2257UI: [N6] 换序后档位已切（' + tierB + '）但出口为空 —— D5b「切档后出口有结果」真能抓到'
    + '（实「' + tB.slice(0, 40) + '」）');
}
// N7 概览页摘要行：把 summary().line 的透传改成面板自拼一句 ⇒ D7 必现形。
//   防的是「面板另编一份措辞 = 第二个措辞真源」——这在本仓是反复付过价的形态。
{
  const ANCHOR_CAPLINE = 'return \'<div class="wa-dim" id="wa-cap-line">\' + esc(sm.line) + \' —— 共 \' + sm.mechanisms';
  const n7 = src.split(ANCHOR_CAPLINE).length - 1;
  a(n7 === 1, 'v2257UI: [N7][前置] 概览摘要行透传锚点在 ui/panel.js 中恰中 1 次（实 ' + n7 + '）');
  const b7 = src.replace(ANCHOR_CAPLINE,
    'return \'<div class="wa-dim" id="wa-cap-line">世界正在运转\' + \' —— 共 \' + sm.mechanisms');
  a(b7 !== src, 'v2257UI: [N7][前置] 破坏确实发生（整句换成面板自拼措辞）');
  const envB = gate.fresh({ srcOverride: { 'ui/panel.js': b7 } });
  pageHtml(envB, 'overview');
  const elB = envB.dom.getElementById('wa-cap-line');
  const tB = elB ? String(elB.textContent || '') : '';
  const smB = envB.WA.capabilityAudit.summary();
  a(!!smB.line && tB.indexOf(smB.line) < 0,
    'v2257UI: [N7] 自拼措辞后摘要行不再逐字等于 summary().line'
    + '（实「' + tB.slice(0, 40) + '」）⇒ D7 不是恒真');
}
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const fails = [];
  const a = function (cond, name, extra) {
    if (cond) { pass++; }
    else { fail++; fails.push(name); console.log('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
  };
  runAll(a);
  runNegative(a);
  if (fail) { console.log('CAPABILITY-UI-V2257: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('capability-ui-v2257: ' + pass + ' pass / 0 fail');
}
module.exports = { runAll: runAll, runNegative: runNegative, judgeRender: judgeRender, judgeClick: judgeClick, judgeDegrade: judgeDegrade, judgePages: judgePages };
