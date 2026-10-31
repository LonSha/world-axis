#!/usr/bin/env node
// WorldAxis tests/opt8-lexicon-v2231.js (v2.231.0) -- OPT-8 专锁：真正跨题材（世界词汇面）
//
// 【它治什么（现场实测）】
//   OPT-8 原文要的是「把『银元 / 面包 / 六属性』变成可选配置」「让既有执行器统一读取当前世界
//   定义的货币、资源、制造配方和判定维度」「保留旧档语义并明确映射，不自动把已有银元改名成
//   另一种资产」「非数值叙事可关闭属性判定」。开工前逐条复核现场，三处都是真的：
//     1 **货币与配方是写死的常量**：`engines/economy.js` 的 `MONEY='银元'` 与两行 `RECIPES`
//       （面包 / 铁器）没有任何声明出口 —— 科幻局声明了「组件 ← 合金×2 + 元件×1」也照样被
//       底层固定词汇拉回同一种游戏。判据 B2/B3/B5/B10。
//     2 **判定维度是写死的白名单**：`engines/fate.js` 的 `ATTRS` 六项是唯一真源，
//       `evalFormula` 只认它 ⇒「非数值叙事可关闭属性判定」在源码里**没有任何落点**。判据 B7。
//     3 **诊断面看不见这件事**：面板与诊断都答不出「这一局的货币叫什么、判定维度是哪几个」，
//       于是「执行器没读到声明」这类失效在读数上完全不可见。判据 A4/A8/D1。
//
// 【六条口径（逐条有判据咬）】
//   · **真源只有一份**：扩展题材进的是 `theme.THEMES` 本身（不是别处另存一份、也不往真源对象上
//     补键）—— `theme.apply` 读的是模块内那张表，补键只在「同模块实例先被求值」时成立（B1）。
//   · **未声明 ⇒ 沿用旧常量**（不是拒收、也不是半用）：旧档语义逐字不变（B6/B9）。
//   · **声明了却对不上 ⇒ 如实报缺陷**：`satisfied()` 把 missing（真缺陷）/ unknown（核不了）/
//     fallback（未声明，合法）三列分开 —— 否则旧五张会被一律报成「有缺陷」（B6）。
//   · **关闭与写坏了分列两个码**：`attrs-off`（这一局不要属性判定）与 `attrs-empty`（声明写坏了）
//     处置相反，合成一个即让两种处置在读数上长得一样（B7/N2）。
//   · **只读口不记 stat**：`catalogView` 会遍历调用这些口，一次「看目录」就把拒收计数刷满 ——
//     那是观测污染被观测者（B8）。
//   · **出口面契约双向**：新增导出必须显式进冻结串，且契约串不得引用运行时不存在的东西（C1/C2）。
//
// 四段结构：A 静态契约 / B 运行时行为 / C 契约面与依赖 / D 面板面 / N 真源码破坏 + 两向自证。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const SELF_REL = 'tests/opt8-lexicon-v2231.js';
const RCP = 'engines/recipe.js', ECO = 'engines/economy.js', FAT = 'engines/fate.js';
const THM = 'engines/theme.js', SCH = 'engines/supply-chain.js', PAN = 'ui/panel.js';
function rd(rel, ov) {
  if (ov && ov[rel] !== undefined) return ov[rel];
  return fs.readFileSync(path.join(BASE, rel), 'utf8');
}
function cnt(s, n) { return s.split(n).length - 1; }
// ── 破坏锚点（各恰 1 次，A6 逐键核）──
//   ⚠ 锚点必须落在**完整语句**上：本轮首跑实测过一次「行首空格数写多一格 ⇒ 命中 0 次」，
//     故下面每一条都取自源码原文（不是手敲重排），并在 A6 逐键复算。
const ANCHOR = {
  // ① 经济面：未声明 ⇒ 如实拒收 no-economy（不回落成银元）
  rcpNoEconomy: { rel: RCP, txt: "    if (!e || typeof e !== 'object' || !e.money) return { ok: false, reason: 'no-economy', name: k };" },
  // ② 判定面：未声明 ⇒ 如实拒收 no-judge
  rcpNoJudge: { rel: RCP, txt: "    if (!j || typeof j !== 'object') return { ok: false, reason: 'no-judge', name: k };" },
  // ③ 前置自洽：声明了却没基准价 ⇒ 真缺陷（不是「核不了」，也不是「未声明」）
  rcpSatGoods: { rel: RCP, txt: "              missing.push({ kind: 'goods', id: g, why: '配方「' + rn + '」的' + (side === 'in' ? '输入' : '产出') + '没有基准价' });" },
  // ④ 题材真源扩展标记（只回答「哪几张是这一轮加的」）
  themeExt: { rel: THM, txt: "  const THEME_EXT = { modern: true, history: true, scifi: true, xianxia: true };" },
  // ⑤ 扩展题材**进真源本身**（不是别处另存一份）
  themeModern: { rel: THM, txt: "    modern: { label: '现代', modules:" },
  // ⑥⑦ 判定面两态分列（关掉 / 写坏了）
  fateOff: { rel: FAT, txt: "    if (js.mode === 'off') return { ok: false, reason: 'attrs-off' };" },
  fateEmpty: { rel: FAT, txt: "    if (js.mode === 'empty') return { ok: false, reason: 'attrs-empty' };" },
  // ⑧ 声明价目表内的资源**可免显式给价**（表内价就是依据）
  ecoBase: { rel: ECO, txt: "    const base = (asked !== null) ? asked : declaredBase(res);" },
  // ⑨ 货币读声明面（未声明回落旧常量）
  ecoMoney: { rel: ECO, txt: "  function money() { const e = spec(); return (e && e.money) ? e.money : MONEY_DEF; }" },
  // ⑩ 生产段读声明配方（旧常量仍是回落面）
  schRecipe: { rel: SCH, txt: "      const rec = recipeOf(recipe);" }
};
const EXPORTS_RCP = ['themeCatalog', 'economySpec', 'judgeSpec', 'satisfied', 'extendedThemes'];
const EXPORTS_ECO = ['economySpec', 'money', 'declaredBase', 'recipeOf', 'recipeKeys'];
const EXPORTS_FAT = ['judgeView'];
const EXPORTS_THM = ['THEME_EXT'];
// 出口面契约里本轮涉及的四段（冻结串是逐字锁：改导出面就必须显式确认，C1 双向咬）
//
// ⚠ 全量回归体检批次：recipe / economy 两段此前**落后于 run.js 的 FROZEN2800**。
//   v2.231.0 那批给 run.js 冻结串补了 recipe 的 economySpec/judgeSpec/list/setSettings/stat
//   与 economy 的 RECIPES/declaredBase/recipeOf/stat，而本文件那份手抄副本没同批跟进 ——
//   于是 C2 每趟都报「不合：recipe,economy」。两条通道本来就该**同一份真源**：这里手抄一份
//   是为了让「run.js 冻结串被悄悄改了」这件事有第二个读者（若本文件直接从 run.js 派生期望值，
//   C2 就退化成同义反复、判据自我指涉）。所以修法不是取消双份，而是**把这次对齐显式写下来**：
//   下面两段逐字取自当前 FROZEN2800，等于一次人工确认过的同步。
const CONTRACT_SEG = {
  recipe: 'recipe:catalogView economySpec extendedThemes getSettings judgeSpec list policyClashes preview satisfied seed staleness statView themeCatalog themeClashes',
  economy: 'economy:RECIPES buildBlock buy craft declaredBase economySpec getSettings markRoute money price recipeKeys recipeOf route routeView setSettings shelf ship statView stock tick view',
  fate: 'fate:bigrams check deck dedupe evalArith evalFormula getSettings isArithmeticSyntax jaccard judgeView oversample parse reset resolveCount resolveDC roll setSettings stat stripHeader titleGate view',
  theme: 'theme:THEMES THEME_EXT activeModules apply contrast engineFace list preview separation statView'
};
function envWith(ov) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh(ov ? { srcOverride: ov } : {});
  try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
  env.WA.store.init();
  return env;
}
/** 收卷：把这一局声明过的配方与题材还原（本文件里每一例都必须自己收，不靠别人）。 */
function restore(WA) {
  try { WA.recipe.setSettings({ name: '' }); } catch (e) {}
  try { if (WA.theme && typeof WA.theme.apply === 'function') WA.theme.apply([]); } catch (e) {}
  try { if (WA.economy && typeof WA.economy.setSettings === 'function') WA.economy.setSettings({ enabled: false }); } catch (e) {}
}
/** 种一个最小可判世界：甲（一笔声明货币的钱）——经济面要真跑才看得见。 */
function seedEco(WA, cur) {
  WA.store.transact(function (d) {
    d.people = d.people || {};
    d.people['p_甲'] = { id: 'p_甲', name: '甲', resources: {}, updatedAt: 1 };
    d.people['p_甲'].resources[cur] = 1000;
    return true;
  }, 'opt8:seed');
}
async function runAll(a, ov) {
  ov = ov || {};
  const S = rd(RCP, ov);
  /* ============ A 静态契约 ============ */
  a(fs.existsSync(path.join(BASE, RCP)), 'A1: 引擎落到仓库里');
  a(rd('tests/run.js', ov).indexOf("'engines/recipe.js'") > 0 && rd('tests/run.js', ov).indexOf("'engines/economy.js'") > 0,
    'A2: tests/run.js LOAD 已挂（recipe 与 economy 都在装载面上）');
  (function () {
    const d = rd('engines/tool-diag.js', ov);
    a(d.indexOf("'engines/recipe.js': 'recipe'") > 0 && d.indexOf("'engines/economy.js': 'economy'") > 0
      && d.indexOf("'engines/fate.js': 'fate'") > 0 && d.indexOf("'engines/theme.js': 'theme'") > 0,
      'A3: tool-diag 声明表已登记（漏登记 ⇒ inventory 定义面与诊断面上该模块不存在）');
  })();
  (function () {
    const d = rd('engines/tool-diag.js', ov);
    const i = d.indexOf('// fate: read 4 / act 17');
    const seg = i >= 0 ? d.slice(i, i + 2000) : '';
    a(i > 0, 'A4: 诊断面口径已升到 read 4 / act 17（判定维度读数进只读面）');
    a(seg.indexOf('judgeView:') > 0,
      'A4b: 诊断面含 judgeView（「这一局的判定维度是哪几个」必须可答 —— 这正是本项要治的不可见）');
    a(d.indexOf('worldLexicon: secWorldLexicon()') > 0 && d.indexOf('function secWorldLexicon()') > 0,
      'A4c: 世界词汇面诊断节在位（货币 / 配方 / 判定维度 / 题材目录 + 逐配方前置自洽）');
    a(d.indexOf("'wa-lex-view'") > 0, 'A4d: 守卫表登记了面板新控件（渲染 + 绑定 + 守卫三件齐做）');
  })();
  (function () {
    const e0 = envWith(ov);
    const miss = EXPORTS_RCP.filter(function (k) { return e0.WA.recipe[k] === undefined; })
      .concat(EXPORTS_ECO.filter(function (k) { return e0.WA.economy[k] === undefined; }))
      .concat(EXPORTS_FAT.filter(function (k) { return e0.WA.fate[k] === undefined; }))
      .concat(EXPORTS_THM.filter(function (k) { return e0.WA.theme[k] === undefined; }));
    a(miss.length === 0, 'A5: 导出面齐备（缺 ' + (miss.join(',') || '无') + '）');
    restore(e0.WA);
  })();
  const badA = Object.keys(ANCHOR).filter(function (k) { return cnt(rd(ANCHOR[k].rel, ov), ANCHOR[k].txt) !== 1; });
  a(badA.length === 0, 'A6: 破坏锚点在目标文件里各恰 1 次（不合：' + badA.join(',') + '）');
  (function () {
    const self = rd(SELF_REL, ov);
    const table = self.slice(self.indexOf('const ANCHOR = {'), self.indexOf('\n};', self.indexOf('const ANCHOR = {')));
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(table, k + ': {') !== 1; });
    a(bad.length === 0, 'A7: 锚点逐键在锚表里声明恰 1 处（缺 ' + bad.join(',') + '）');
  })();
  (function () {
    // 面板三件齐做：渲染 + 绑定 + 输出面（守卫登记在 A4d）
    const P = rd(PAN, ov);
    a(cnt(P, 'id="wa-lex-view"') === 1, 'A8: 面板渲染了 wa-lex-view（实 ' + cnt(P, 'id="wa-lex-view"') + ' 处）');
    a(cnt(P, "on('#wa-lex-view'") === 1, 'A8b: 面板绑定了 wa-lex-view（实 ' + cnt(P, "on('#wa-lex-view'") + ' 处）');
    a(cnt(P, 'WA.economy.money(') >= 1 && cnt(P, 'WA.fate.judgeView(') >= 1,
      'A8c: 面板读的正是**执行器读的那几口**（economy.money / fate.judgeView）——「面板显示信用点、结算仍扣银元」在结构上不可能发生');
  })();

  /* ============ B 运行时行为 ============ */
  // B1 题材真源只有一份：扩展题材进的是 THEMES 本身
  (function () {
    const W = envWith(ov).WA;
    const cat = W.recipe.themeCatalog();
    const keys = cat ? Object.keys(cat).sort() : [];
    a(keys.length === 9 && ['history', 'modern', 'scifi', 'xianxia'].every(function (k) { return keys.indexOf(k) >= 0; }),
      'B1: 题材目录 9 张（实 ' + keys.join(',') + '）');
    a(keys.every(function (k) { return !!W.theme.THEMES[k]; }),
      'B1b: 目录里的每一张都在**真源 THEMES 里**（不是别处另存一份、也不是往对象上补键）');
    const ext = Object.keys(W.recipe.extendedThemes() || {}).sort();
    a(ext.join(',') === 'history,modern,scifi,xianxia', 'B1c: 扩展标记恰四张（实 ' + ext.join(',') + '）');
    a(W.theme.THEME_EXT && !W.theme.THEME_EXT.urban, 'B1d: 内建五张**不进**扩展标记（旧档语义不变）');
    restore(W);
  })();
  // B2 声明生效：货币与配方真的换了（且换的是**真源**，不是返回体上的字面量）
  (function () {
    const W = envWith(ov).WA;
    const r = W.recipe.apply('scifi');
    a(r.ok === true && r.themeApplied && r.themeApplied.ok === true,
      'B2: scifi 配方真应用（题材侧也真认它，实 ' + JSON.stringify(r.themeApplied) + '）');
    a(W.economy.money() === '信用点', 'B2b: 货币读声明面（实 ' + W.economy.money() + '）');
    a(W.economy.recipeKeys().indexOf('组件') >= 0, 'B2c: 声明配方进表（实 ' + W.economy.recipeKeys().join(',') + '）');
    const rec = W.economy.recipeOf('组件');
    a(!!rec && rec.in['合金'] === 2 && rec.out['组件'] === 1,
      'B2d: 声明配方的输入输出逐字生效（实 ' + JSON.stringify(rec) + '）');
    restore(W);
    a(W.economy.money() === '银元' && W.economy.recipeKeys().join(',') === '面包,铁器',
      'B2e: 收卷后回到旧常量（实 ' + W.economy.money() + ' / ' + W.economy.recipeKeys().join(',') + '）');
  })();
  // B3 声明价目表：表内免显式给价；表外仍须显式给价（少给一样都不算有据）
  (function () {
    const W = envWith(ov).WA;
    W.recipe.apply('scifi');
    W.economy.setSettings({ enabled: true });
    seedEco(W, '信用点');
    const ok = W.economy.stock('舱A', '合金', 5, {});
    a(ok.ok === true && ok.base === 40, 'B3: 表内资源免显式给价（取声明价 40，实 ' + JSON.stringify(ok) + '）');
    const off = W.economy.stock('舱A', '陨铁', 5, {});
    a(off.ok === false && off.reason === 'missing-base',
      'B3b: 表外资源仍须显式给价（实 ' + off.reason + '）—— 「声明过」不等于「随便什么都有价」');
    const neg = W.economy.stock('舱B', '合金', 5, { base: -1 });
    a(neg.ok === false && neg.reason === 'missing-base',
      'B3c: 显式给了非正数不回落成声明价（实 ' + neg.reason + '）—— 回落会把「你给错了」读成「收下了」');
    const seen = W.economy.view('舱A', '合金');
    a(seen.ok === true && seen.base === 40 && seen.stock === 5, 'B3d: 真入库了（实 ' + JSON.stringify(seen) + '）');
    restore(W);
  })();
  // B4 成交用声明货币（余额记在哪个键上是可观测的）
  (function () {
    const W = envWith(ov).WA;
    W.recipe.apply('scifi');
    W.economy.setSettings({ enabled: true });
    seedEco(W, '信用点');
    W.economy.stock('舱A', '合金', 5, {});
    const b = W.economy.buy('舱A', '合金', 2, { by: '甲' });
    a(b.ok === true && b.currency === '信用点' && b.balance === 920,
      'B4: 成交扣的是声明货币（实 ' + JSON.stringify({ cur: b.currency, bal: b.balance }) + '）');
    const purse = W.store.get().people['p_甲'].resources;
    a(purse['信用点'] === 920 && purse['银元'] === undefined,
      'B4b: 存档里记的是「信用点」这一键（**不自动把银元改名**，实 ' + JSON.stringify(purse) + '）');
    restore(W);
  })();
  // B5 生产走声明配方；未知配方如实拒收并带出**声明面**的可选清单
  (function () {
    const W = envWith(ov).WA;
    W.recipe.apply('scifi');
    W.economy.setSettings({ enabled: true });
    seedEco(W, '信用点');
    W.store.transact(function (d) {
      d.people['p_甲'].resources['合金'] = 4; d.people['p_甲'].resources['元件'] = 2; return true;
    }, 'opt8:seed-mat');
    const c = W.economy.craft('舱A', '组件', { by: '甲', times: 1 });
    a(c.ok === true, 'B5: 声明配方真能生产（实 ' + JSON.stringify(c) + '）');
    const u = W.economy.craft('舱A', '不存在的东西', { by: '甲' });
    a(u.ok === false && u.reason === 'unknown-recipe' && u.known.indexOf('组件') >= 0,
      'B5b: 未知配方如实拒收且带出**当前世界**的可选清单（实 ' + JSON.stringify(u.known) + '）');
    restore(W);
  })();
  // B6 前置自洽三列分列：未声明 = fallback（合法）；声明了却对不上 = missing（真缺陷）
  (function () {
    const W = envWith(ov).WA;
    const u = W.recipe.satisfied('urban');
    a(u.ok === true && u.satisfied === true && u.missing.length === 0 && u.fallback.length === 2,
      'B6: 旧五张未声明经济面 / 判定面 ⇒ fallback 两列、**零缺陷**（实 fallback ' + u.fallback.length + '）');
    const sc = W.recipe.satisfied('scifi');
    a(sc.satisfied === true && sc.missing.length === 0 && sc.fallback.length === 0,
      'B6b: 声明且自洽 ⇒ 无缺陷、无 fallback（实 ' + JSON.stringify(sc.fallback) + '）');
    // 真缺陷当场可造：往导出面放一张「配方产出没有基准价」的声明
    const R = W.recipe.RECIPES;
    R.__opt8Bad = { cn: '见证（价目缺项）', core: '', themes: ['urban'], extraThemes: [], policies: [],
      kinds: [], resources: [], engines: [], optional: [], scenes: [],
      // ⚠ 夹具必须**两个面都声明**：只声明经济面的话，判定面会合法地进 fallback，
      //   那样「声明过就不进 fallback」这条断言就成了在考夹具自己（首跑实测即此）。
      judge: { enabled: true, attrs: ['mind'], labels: { mind: '心智' } },
      economy: { money: '元', goods: { '米': 1 }, recipes: { '饭': { in: { '米': 1 }, out: { '饭': 1 } } } } };
    try {
      const bad = W.recipe.satisfied('__opt8Bad');
      a(bad.satisfied === false && bad.missing.length >= 1 && bad.missing[0].kind === 'goods',
        'B6c: 声明了却没给产出基准价 ⇒ 如实记 missing（实 ' + JSON.stringify(bad.missing) + '）——「我声明了」不等于「它真在那儿」');
      a(bad.fallback.length === 0, 'B6d: 声明过就不进 fallback（两列不重叠：一个说「没声明」、一个说「声明错了」）');
    } finally { try { delete R.__opt8Bad; } catch (e) {} }
    restore(W);
  })();
  // B7 判定维度读声明面：三种状态各自可观测
  (function () {
    const W = envWith(ov).WA;
    // ① 未声明：旧六属性照旧能算（旧档语义逐字不变）
    a(W.fate.evalFormula('str + 1', { str: 3 }).ok === true, 'B7: 未声明时旧六属性照旧能算（旧档语义逐字不变）');
    a(W.fate.judgeView().mode === 'default' && W.fate.judgeView().fallback === true,
      'B7b: 判定面读数如实报「在沿用旧白名单」（mode=' + W.fate.judgeView().mode + '）');
    // ② 声明了四个维度：新维度能算、旧维度不再被接受
    W.recipe.apply('scifi');
    const jv = W.fate.judgeView();
    a(jv.mode === 'declared' && jv.attrs.join(',') === 'body,sense,mind,will',
      'B7c: 判定维度来自声明（实 ' + jv.attrs.join(',') + '）');
    a(W.fate.evalFormula('body + 1', { body: 3 }).ok === true, 'B7d: 声明的维度真能算');
    const old = W.fate.evalFormula('str + 1', { str: 3 });
    a(old.ok === false && old.reason === 'unknown-attr', 'B7e: 旧六属性不再被接受（实 ' + old.reason + '）');
    // ③ 声明关闭：一律拒收 attrs-off（**不回落**成旧白名单）
    W.recipe.apply('history');
    const off = W.fate.evalFormula('str + 1', { str: 3 });
    a(off.ok === false && off.reason === 'attrs-off',
      'B7f: 声明关闭判定面 ⇒ 公式式 DC 一律拒收 attrs-off（实 ' + off.reason + '）—— 回落会让「不要属性判定」与「没声明」长得一样');
    a(W.fate.judgeView().enabled === false, 'B7g: 读数同时报「判定已关闭」（enabled=' + W.fate.judgeView().enabled + '）');
    restore(W);
    a(W.fate.evalFormula('str + 1', { str: 3 }).ok === true, 'B7h: 收卷后旧六属性恢复可算');
  })();
  // B8 只读口不记 stat（「看一眼」不该变成一次拒收）
  (function () {
    const W = envWith(ov).WA;
    const before = JSON.stringify(W.recipe.stat());
    W.recipe.catalogView(); W.recipe.satisfied('urban'); W.recipe.economySpec('urban'); W.recipe.judgeSpec('urban');
    W.fate.judgeView(); W.fate.view();
    a(JSON.stringify(W.recipe.stat()) === before,
      'B8: recipe 只读口不记 stat（catalogView 会遍历调用它们，记了账就会把「看目录」刷成拒收）');
    const eb = JSON.stringify(W.economy.stat());
    W.economy.economySpec(); W.economy.money(); W.economy.recipeKeys(); W.economy.declaredBase('米');
    a(JSON.stringify(W.economy.stat()) === eb, 'B8b: economy 只读口不记 stat（它每笔交易都会被调）');
    const fb = JSON.stringify(W.fate.stat());
    W.fate.judgeView(); W.fate.evalFormula('str + 1', { str: 3 });
    a(JSON.stringify(W.fate.stat()) === fb, 'B8c: fate 只读口与求值器不记 stat（判定面每次判定都被读）');
  })();
  // B9 旧档语义：未声明时一切逐字如旧，且**不新增 store 键**
  (function () {
    const W = envWith(ov).WA;
    const before = JSON.stringify(W.store.get());
    W.recipe.economySpec('urban'); W.recipe.satisfied('urban'); W.fate.judgeView(); W.economy.money();
    a(JSON.stringify(W.store.get()) === before, 'B9: 只读口不改世界（存档逐字不变）');
    //   `economy` 是 core/store.js 的**既有骨架键**（v2.119.0 起就在），不算本版新增；
    //   本版要证的是「判定面与题材面**不另存一份**到存档里」。
    a(!('fate' in W.store.get()) && !('theme' in W.store.get()),
      'B9b: 判定面 / 题材面不新增 store 键（世界词汇的真源在声明面，不在存档里另存一份）');
  })();
  // B10 供应链读声明配方（计划原文点名的「新增合法配方可被供应链真正执行」）
  (function () {
    const W = envWith(ov).WA;
    W.supplyChain.setSettings({ enabled: true });
    W.recipe.apply('scifi');
    const p = W.supplyChain.plan({ id: 'o1', stages: [{ kind: 'produce', recipe: '组件', by: '甲', times: 1 }] });
    const st = p.stages[0];
    a(st.kind === 'produce' && st.reason !== 'unknown-recipe',
      'B10: 供应链认得**声明进来的**配方（实 ' + st.reason + '）—— 它此前直接读写死的两行常量');
    a(!!st.detail && st.detail.recipe === '组件', 'B10b: 走的是声明的配方名（实 ' + JSON.stringify(st.detail && st.detail.recipe) + '）');
    // 旧常量配方**仍在表内**（声明面与旧常量取并集）：这是「保留旧档语义」的设计，不是巧合，
    //   故显式锁住 —— 它保证旧存档里的「面包 / 铁器」在换题材之后仍能被生产链读到。
    a(W.economy.recipeKeys().indexOf('面包') >= 0,
      'B10c: 旧常量配方仍在表内（实 ' + W.economy.recipeKeys().join(',') + '）—— 旧档语义保留，不因换题材而失联');
    const bad = W.supplyChain.plan({ id: 'o2', stages: [{ kind: 'produce', recipe: '不存在的东西', by: '甲', times: 1 }] });
    a(bad.stages[0].reason === 'unknown-recipe' && (bad.stages[0].detail.known || []).indexOf('组件') >= 0,
      'B10d: 真·表外配方如实拒收，且带出**当前世界**的可选清单（实 ' + JSON.stringify(bad.stages[0].detail.known) + '）');
    restore(W);
  })();

  /* ============ C 契约面与依赖 ============ */
  (function () {
    const self = rd(SELF_REL, ov);
    const reqs = (self.match(/require\(['"]([^'"]+)['"]\)/g) || []).filter(function (x) { return x.indexOf('./') < 0 && x.indexOf('../') < 0; });
    a(reqs.length === 2, 'C1: 本锁只 require Node 内置（fs/path），零第三方（实 ' + reqs.length + '）');
  })();
  (function () {
    const run = rd('tests/run.js', ov);
    const m = run.match(/const FROZEN2800 = '([^']*)'/);
    const frozen = m ? m[1] : '';
    const bad = Object.keys(CONTRACT_SEG).filter(function (ns) {
      const seg = (frozen.match(new RegExp(ns + ':[^|]*')) || [''])[0];
      return seg !== CONTRACT_SEG[ns];
    });
    a(bad.length === 0, 'C2: 出口面契约四段逐字一致（不合：' + bad.join(',') + '）—— 新增导出必须显式确认过');
    const e0 = envWith(ov);
    const phantom = [];
    Object.keys(CONTRACT_SEG).forEach(function (ns) {
      const mem = CONTRACT_SEG[ns].split(':')[1].split(' ');
      mem.forEach(function (k) { if (e0.WA[ns][k] === undefined) phantom.push(ns + '.' + k); });
    });
    a(phantom.length === 0, 'C2b: 契约串不得引用运行时不存在的东西（悬空 ' + (phantom.join(',') || '无') + '）');
    restore(e0.WA);
  })();
  (function () {
    // 生产段的真源注释必须与实现同步（不宣称「取自写死常量」）
    const s = rd(SCH, ov);
    a(s.indexOf('当前世界声明的具名表') > 0 && s.indexOf('未声明时回落旧常量') > 0,
      'C3: 供应链的 basisNote 如实登记真源（不宣称「取自写死的两行」）');
    const r = rd(RCP, ov);
    a(r.indexOf('不自动把已有银元改名') > 0 || r.indexOf('不把已有银元自动改名') > 0,
      'C4: 口径写明「不自动把已有银元改名成另一种资产」（旧档语义逐字不变）');
  })();

  /* ============ D 面板面 ============ */
  (function () {
    // 真点击：面板页切到 people → 点「世界词汇」→ 读回执位
    const uiGate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
    const env = uiGate.fresh(ov ? { srcOverride: ov } : {});
    try { if (global.localStorage && global.localStorage.clear) global.localStorage.clear(); } catch (e) {}
    const dom = env.dom, W = env.WA;
    W.store.init();
    const panelEl = dom.getElementById('wa-panel');
    const tabs = panelEl ? panelEl.querySelectorAll('.wa-tab') : [];
    const tab = tabs.filter(function (x) { return x.dataset && x.dataset.page === 'people'; })[0];
    a(!!tab, 'D1: 人物页页签在位（词汇面按钮渲染在这一页）');
    if (tab) tab.click();
    const B = function (id) { return dom.getElementById(id); };
    const btn = B('wa-lex-view');
    a(!!btn, 'D1b: wa-lex-view 真渲染出来了');
    if (btn) {
      W.recipe.apply('scifi');
      const nm = B('wa-rec-name'); if (nm) nm.value = 'scifi';
      btn.click();
      const out = String((panelEl.dataset || {}).recOut || '');
      a(out.indexOf('信用点') > 0, 'D2: 回执如实报出声明货币（实「' + out.slice(0, 120) + '」）');
      a(out.indexOf('体魄') > 0 || out.indexOf('body') > 0, 'D2b: 回执如实报出声明判定维度');
      a(out.indexOf('自洽') > 0, 'D2c: 回执带前置自洽结论（缺什么 / 核不了什么 / 哪些在沿用旧常量）');
      W.recipe.setSettings({ name: '' }); W.theme.apply([]);
      btn.click();
      const out2 = String((panelEl.dataset || {}).recOut || '');
      a(out2.indexOf('银元') > 0, 'D2d: 收卷后回执报回旧常量货币（实「' + out2.slice(0, 90) + '」）—— 未声明即沿用，不是「没有」');
    }
    restore(W);
  })();

  console.log('\n\u25a0 N 负控制：真源码破坏 → 装载破坏副本 → 重跑同款判据');
  await runNegative(a, S);
}

function brk(src, txt, repl) {
  const n = cnt(src, txt);
  if (n !== 1) throw new Error('anchor hits=' + n);
  return src.replace(txt, repl);
}
async function runNegative(a, S) {
  S = S || rd(RCP);
  (function () {
    const self = rd(SELF_REL);
    const esc = function (t) { return t.replace(/\n/g, '\\n'); };
    const bad = Object.keys(ANCHOR).filter(function (k) { return cnt(self, esc(ANCHOR[k].txt)) !== 1; });
    a(bad.length === 0, 'N0: 锚点字面量在本文件恰 1 次（不合 ' + bad.join(',') + '）');
  })();
  // N1 破坏：经济面「未声明」不再如实拒收（回落成 ok:true）⇒ 未声明与声明在读数上分不开
  (function () {
    //   ⚠ 破坏必须打在**语义**上：首跑写成 `if (false) …`，副本随即在 `Object.keys(e.goods)`
    //     上抛（e 为 undefined）—— 装载即炸的破坏等于没测（还把后面 N2–N8 全带停）。
    //     改成「未声明也返回一个默认经济面」：路径真跑到，码真读不到。
    const S1 = brk(S, ANCHOR.rcpNoEconomy.txt,
      "    if (!e || typeof e !== 'object' || !e.money) return { ok: true, name: k, money: '银元', goods: {}, recipes: {}, source: 'default' };");
    const ov = {}; ov[RCP] = S1;
    const W = envWith(ov).WA;
    const u = W.recipe.economySpec('urban');
    a(u.ok === true && u.money === '银元',
      'N1: 破坏版上未声明也报成功（实 ' + JSON.stringify(u).slice(0, 80) + '）⇒ 与「声明了元」长得一样；原版如实拒收 no-economy ⇒ 两向自证');
    restore(W);
  })();
  // N2 破坏：判定面「关闭」不再分列（两个码合成一个）⇒ 关掉与写坏了分不开
  (function () {
    //   ⚠ 破坏要打在**语义**上（同 N1 的教训）：首跑把 off 分支整句换成 empty 分支，
    //     于是 off 态下两个分支都不走、落到 unknown-attr —— 那测的是「分支被删掉」。
    //     本版保留分支、只把它的**返回码**换掉：这正是「两个码合成一个」的形态。
    const S2 = brk(rd(FAT), ANCHOR.fateOff.txt, '    if (js.mode === \'off\') return { ok: false, reason: \'attrs-empty\' };');
    const ov = {}; ov[FAT] = S2;
    const W = envWith(ov).WA;
    W.recipe.apply('history');
    const off = W.fate.evalFormula('str + 1', { str: 3 });
    a(off.reason === 'attrs-empty',
      'N2: 破坏版上「这一局关掉判定」被读成 attrs-empty（实 ' + off.reason
        + '）—— 两种处置相反的处境合并成一个码；原版 attrs-off ⇒ 两向自证');
    restore(W);
  })();
  // N3 破坏：入库不再看声明价目表（表内也要显式给价）⇒ 声明的价目表形同虚设
  (function () {
    const S3 = brk(rd(ECO), ANCHOR.ecoBase.txt, '    const base = (asked !== null) ? asked : null;');
    const ov = {}; ov[ECO] = S3;
    const W = envWith(ov).WA;
    W.recipe.apply('scifi');
    W.economy.setSettings({ enabled: true });
    seedEco(W, '信用点');
    const ok = W.economy.stock('舱A', '合金', 5, {});
    a(ok.ok === false && ok.reason === 'missing-base',
      'N3: 破坏版上表内资源也拒收（实 ' + ok.reason + '）⇒ 声明的价目表读不到；原版取 40 成功 ⇒ 两向自证');
    restore(W);
  })();
  // N4 破坏：扩展题材标记抹掉 ⇒ 面板与诊断把「扩展题材」报成 0（读数谎报）
  (function () {
    const S4 = brk(rd(THM), ANCHOR.themeExt.txt, '  const THEME_EXT = {};');
    const ov = {}; ov[THM] = S4;
    const W = envWith(ov).WA;
    const ext = W.recipe.extendedThemes();
    a(!!ext && Object.keys(ext).length === 0,
      'N4: 破坏版上扩展标记为空（实 ' + JSON.stringify(ext) + '）⇒ 面板「扩展 N 张」会报 0；原版四张 ⇒ 两向自证');
    const cat = W.recipe.themeCatalog();
    a(!!cat && Object.keys(cat).length === 9,
      'N4b: 反面对照：同一破坏副本上**题材目录仍是 9 张**（实 ' + (cat ? Object.keys(cat).length : 'null')
        + '）—— N4 的红只由标记缺失引起，不是破坏把真源打死了');
    restore(W);
  })();
  // N5 破坏：供应链改回直接读写死常量 ⇒ 声明进来的配方在生产段读不到
  (function () {
    const S5 = brk(rd(SCH), ANCHOR.schRecipe.txt, '      const rec = (E && E.RECIPES) ? E.RECIPES[recipe] : null;');
    const ov = {}; ov[SCH] = S5;
    const W = envWith(ov).WA;
    W.supplyChain.setSettings({ enabled: true });
    W.recipe.apply('scifi');
    const p = W.supplyChain.plan({ id: 'o1', stages: [{ kind: 'produce', recipe: '组件', by: '甲', times: 1 }] });
    a(p.stages[0].reason === 'unknown-recipe',
      'N5: 破坏版上声明配方在生产段读不到（实 ' + p.stages[0].reason
        + '）⇒ 「新增合法配方可被供应链真正执行」当场失效；原版认得它 ⇒ 两向自证');
    restore(W);
  })();
  // N6 破坏：面板回执不再读执行器那几口（改读写死的字面量）⇒ 面板与结算分家
  (function () {
    const P = rd(PAN);
    const S6 = P.split('WA.economy.money()').join("'银元'");
    a(cnt(S6, 'WA.economy.money()') === 0 && cnt(P, 'WA.economy.money()') >= 1,
      'N6: 把面板里读执行器那口的地方换成写死字面量 ⇒ A8c 的判据现形（实 '
        + cnt(S6, 'WA.economy.money()') + ' 处，原版 ' + cnt(P, 'WA.economy.money()') + ' 处）—— 面板与结算分家必须被看见');
  })();
  // N7 工具两向自证
  let threw = false;
  try { brk(S, 'THIS-DOES-NOT-EXIST-OPT8', 'x'); } catch (e) { threw = e.message === 'anchor hits=0'; }
  a(threw, 'N7: 锚点不存在必须抛（不静默 0 命中）');
  threw = false;
  try { brk(S, 'if (', 'x'); } catch (e) { threw = /anchor hits=\d+/.test(e.message) && e.message !== 'anchor hits=1'; }
  a(threw, 'N7b: 锚点不唯一必须抛');
  // N8 真源码逐字未变
  a(rd(RCP) === S, 'N8: 被破坏过的引擎真源码逐字未变（破坏只发生在内存副本上）');
}

module.exports = { runAll: runAll, runNegative: runNegative, ANCHOR: ANCHOR };
if (require.main === module) {
  (async function () {
    let pass = 0, fail = 0;
    const a = function (ok, name, extra) {
      if (ok) { pass++; } else { fail++; console.log('  \u2717 ' + name + (extra ? ' \u2014 ' + extra : '')); }
    };
    try { await runAll(a); } catch (e) { fail++; console.log('  \u2717 判据失效：' + (e && e.stack)); }
    console.log('\nOPT8-V2231: ' + pass + ' / 失败 ' + fail);
    if (fail) process.exitCode = 1;
  })();
}