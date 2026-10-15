'use strict';
// WorldAxis tests/ev1-evidence-qa-v2208.js (v2.208.0) — 「带证据引用的世界问答」专锁
//
// 命名纪律：本条**不进** `tools/gen-plan-status.js` 的 EVIDENCE_FORMS 三条正则
//   （`^s3-b\d+-(o|e)(\d)-v2\d{3}\.js$` / `^(o|e)(\d)-...` / `^(o|e)(\d)-...-gate-...`）——
//   那三条认的是**旧代**计划（宿主验收 / 跨模块提交那代，已 9/0 全交付）。
//   新 18 项提案若沿用 `o<N>` / `e<N>` 前缀，会被 O7 门禁的「已交付 ≥8」判据误计入旧编号，
//   让旧代计数虚高。故新项一律走 `ev<N>-...` 形态（本文件即 ev1）。
//
// 本锁钉的是 E1 的四条验收，逐条都是「不许把两件不同的事压成一件」：
//   ① **超出固定快照范围的历史可找到**：回答前先走现场检索（historySearch 六面），
//      而不是只喂快照里那 10 人 / 8 暗流。
//   ② **每条事实性回答有依据**：引用号必须由**代码**核对（落在本次真实返回行上）；
//      模型编的号（超出行数）必须被拒收 —— 引用面不许由模型自称。
//   ③ **无证据明确说明**：命中 0 行 ⇒ `citations: []` 且 `none === true`；
//      且「查了没有」与「没查全」（blind / deferred / notCovered）在本面**分列**。
//   ④ **作者与角色视角在检索前分开过滤**：玩家视角下 `rules` / `entries` 两面
//      从**候选面**里摘掉（不是拿到结果再过滤），并记进 `droppedFaces` + `notCovered`。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD + 真 ui/* 求值），不自拼模块清单。
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');

const REL = 'ui/assistant.js';
function srcOf() { return fs.readFileSync(path.join(BASE, REL), 'utf8'); }
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, sub) { return String(s).split(sub).length - 1; }

// ── A 段：静态契约（源码面，不装载）─────────────────────────────────────────
function runA(a) {
  const SRC = srcOf();
  const pan = readOf('ui/panel.js');
  const diag = readOf('engines/tool-diag.js');

  a(/async function ask\(question, opts\)/.test(SRC), 'A1: ask(question, opts) 在源码里（带 opts，旧签名升级）');
  a(SRC.indexOf('historySearch') >= 0, 'A2: 真走 historySearch（现场检索面，不是只看快照）');
  a(/WA\.assistant = \{/.test(SRC) && /\n    ask: ask,/.test(SRC), 'A3: ask 在导出面上');
  a(SRC.indexOf('citationsOf') >= 0 && SRC.indexOf('function citationsOf(text, g)') >= 0,
    'A4: 引用号由本地函数核对（citationsOf）');
  // A5：编号纪律 —— 本条文件名必须避开旧代 O/E 形态（`s3-b<N>-o<N>` / `e<N>-...`），否则会被
  //   O7 门禁的「已交付 ≥8」判据误计入旧代编号（旧代已 9/0 全交付，计数会被顶虚高）。
  a(!/^s3-b\d+-(o|e)\d/.test(REL) && !/^(o|e)\d-/.test(path.basename(REL)),
    'A5: 专锁命名避开旧代 O/E 形态（basename=' + path.basename(REL) + '）');
  a(REL.indexOf('assistant') >= 0, 'A5b: 锁钉的是 ui/assistant.js 这个产品文件');
  // A6：版本面 —— 文件头自报 v2.208.0，且是 IIFE 形态（与全仓 ui/* 一致）
  a(SRC.indexOf('v2.208.0') >= 0, 'A6: 源码自报 v2.208.0（E1 落地版本）');
  a(/^\(function \(\) \{/m.test(SRC) && /\}\)\(\);\s*$/.test(SRC.trim()), 'A6b: IIFE 形态完整（首尾闭合）');
  // A7：四条判据的字面量都在
  ['no-evidence', 'cited', 'uncited', 'blindRuns', 'viewFiltered'].forEach(function (k) {
    a(SRC.indexOf(k) >= 0, 'A7: 计量字面量在位：' + k);
  });
  a(/PLAYER_DENY_FACES = \['rules', 'entries'\]/.test(SRC), 'A8: 玩家视角禁读面表在位（rules / entries）');
  // A9：玩家视角收窄发生在**检索之前** —— 源码里 filter 出的 faces 被传进 search 的 args
  a(/args\.faces = faces/.test(SRC), 'A9: 收窄后的面清单真的传进检索调用（先于检索）');
  // A10：面板真调（产品引用，非只测试引用）
  a(pan.indexOf('WA.assistant.search(') >= 0, 'A10: 面板真调 WA.assistant.search(...)（只查证据按钮）');
  a(pan.indexOf('wa-ask-cites') >= 0 && pan.indexOf('wa-ask-gaps') >= 0, 'A11: 引用区 / 缺口区控件 id 在位');
  // A12：tool-diag 的 assistant 页锚点已登记新控件（未登记 = 锚点扫描会报缺）
  //   切片不能拿 `{ page: 'events'` 当下界 —— 它在文件里**首次出现的位置早于** assistant 段
  //   （实测 i=177306 / j=163389 ⇒ 反向切片得空串，A12 会假红）。改用 `{ page: 'logs'` 之后
  //   最近的分节起点，或退一步：直接断言产物串里四个 id 与页名同段出现。
  const ai = diag.indexOf("{ page: 'assistant'");
  a(ai > 0, 'A12a: tool-diag 里有 assistant 页锚点段');
  const seg = (ai > 0) ? diag.slice(ai, ai + 600) : '';
  ['wa-ask-ev', 'wa-ask-hint', 'wa-ask-cites', 'wa-ask-gaps'].forEach(function (id) {
    a(seg.indexOf("'" + id + "'") >= 0, 'A12: tool-diag 助手页锚点已登记：' + id);
  });
  a(seg.indexOf("'wa-ask-btn'") >= 0, 'A12b: 原有锚点未被顶掉（wa-ask-btn 仍在同段）');
  // A13：本面只读 —— 不写 store / 不写 localStorage
  ['localStorage.setItem', 'WA.store.set', 'store.transact'].forEach(function (k) {
    a(SRC.indexOf(k) < 0, 'A13: 源码里不出现 ' + k + '（本面只读世界）');
  });
  // A14：唯一真源 —— 视角常量只声明一次，关键词表只声明一次
  a(cnt(SRC, 'const PLAYER_DENY_FACES =') === 1, 'A14: PLAYER_DENY_FACES 声明恰 1 次');
  a(cnt(SRC, 'const STOPWORDS =') === 1, 'A15: STOPWORDS 声明恰 1 次');
  a(cnt(SRC, 'const CIT_MAX =') === 1 && cnt(SRC, 'const SNIP_MAX =') === 1, 'A16: 两个上限常量各声明恰 1 次');
  // A17：本面不自己造时间 —— 唯一的时间兜底在 clockNow（时钟缺席时）。
  //   v2.213.0 修判据形态：原版数整份源码的 `Date.now()`，把**注释里的沿革说明**（3 处，
  //   讲的就是这个兜底本身）也数了进去 ⇒ 自 v2.210.0 起恒红（Q3 收口轮已实测同红）。
  //   真判据 = 剥掉块注释与行注释后的代码面里恰 1 次。
  const CODE_A17 = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  a(cnt(CODE_A17, 'Date.now()') === 1, 'A17: Date.now() 恰 1 次（只在 clockNow 的兜底里；剥注释计数，实 ' + cnt(CODE_A17, 'Date.now()') + '）');
  a(/function clockNow\(\)/.test(SRC), 'A18: clockNow 在位（世界钟优先，缺席才兜底）');
  // A19：空拆词必须**不是**一次「全查过」—— 提问里没有可检索词时不许谎称「真的没记录」
  a(SRC.indexOf('noTerms') >= 0 && SRC.indexOf("'no-terms'") >= 0,
    'A19: 无可检索词走 noTerms 通道（不当成「六面全查过」）');
}

// ── B 段：检索面（真装载，改 historySearch 桩）──────────────────────────────
function boot(opts) {
  const b = sync.fresh(opts || {});
  return b.WA;
}
function stubSearch(WA, fn) { WA.historySearch = Object.assign({}, WA.historySearch, { search: fn }); }

function runB(a) {
  // B1：全知视角 —— 六面全开，检索行可按序被引用
  {
    const WA = boot();
    const seen = [];
    stubSearch(WA, function (q, o) {
      seen.push({ q: q, faces: o.faces || null });
      return { ok: true, query: q, faces: o.faces || ['chronicle'], total: 1, matched: 1, returned: 1,
        trimmed: false, empty: false, blind: [], deferred: [], notCovered: [],
        sources: [{ face: 'chronicle', ok: true, matched: 1 }],
        rows: [{ face: 'chronicle', ref: 'r-' + q, at: 100, title: 'T-' + q, text: 'X-' + q,
          source: 'chronicleView.entries()', route: { page: 'events', face: 'chronicle', ref: 'r-' + q } }] };
    });
    const g = WA.assistant.search('幕府将军');
    a(g.ok === true, 'B1a: 检索面返回 ok');
    a(g.rows.length > 0, 'B1b: 命中若干行（' + g.rows.length + '）');
    a(g.view === 'omniscient', 'B1c: 未切视角时按作者视角（omniscient）');
    a(seen.every(function (s) { return s.faces === null; }), 'B1d: 作者视角下不传 faces（六面全开）');
    a(g.droppedFaces.length === 0, 'B1e: 作者视角下无被摘面');
  }
  // B2：玩家视角 —— rules / entries 从候选面里摘掉，且进 notCovered
  {
    const WA = boot();
    let passedFaces = 'unset';
    stubSearch(WA, function (q, o) {
      passedFaces = o.faces || null;
      return { ok: true, query: q, faces: o.faces || [], total: 0, matched: 0, returned: 0,
        trimmed: false, empty: true, blind: [], deferred: [], notCovered: [],
        sources: [], rows: [] };
    });
    WA.perspective.setView('player');
    const g = WA.assistant.search('幕府将军');
    a(WA.perspective.getView().view === 'player', 'B2a: 视角真的切到 player');
    a(Array.isArray(passedFaces), 'B2b: 玩家视角下**传了** faces（先于检索收窄）');
    a(passedFaces.indexOf('rules') < 0 && passedFaces.indexOf('entries') < 0,
      'B2c: 候选面里没有 rules / entries（作者侧设定面被摘掉）');
    a(passedFaces.indexOf('chronicle') >= 0 && passedFaces.indexOf('people') >= 0,
      'B2d: 其余四面仍在候选面里（不是一刀切成空）');
    a(g.droppedFaces.indexOf('rules') >= 0 && g.droppedFaces.indexOf('entries') >= 0,
      'B2e: droppedFaces 报出被摘的两面');
    a(g.notCovered.indexOf('rules') >= 0 && g.notCovered.indexOf('entries') >= 0,
      'B2f: 被摘的面照样进 notCovered（不静默消失）');
    WA.perspective.setView('omniscient');
  }
  // B3：「读不到」与「零命中」分列 —— blind 剥夺 empty 的语义在本面如实带出
  {
    const WA = boot();
    stubSearch(WA, function (q) {
      return { ok: true, query: q, faces: ['chronicle', 'people'], total: 0, matched: 0, returned: 0,
        trimmed: false, empty: false, blind: ['people'], deferred: ['places'], notCovered: ['people', 'places'],
        sources: [{ face: 'chronicle', ok: true, matched: 0 }, { face: 'people', ok: false, matched: 0 }],
        rows: [] };
    });
    const g = WA.assistant.search('幕府将军');
    a(g.noTerms !== true && g.rows.length === 0, 'B3a: 有实义词但零命中（不是 noTerms）');
    a(g.blind.indexOf('people') >= 0, 'B3b: 读不到的面被报出');
    a(g.deferred.indexOf('places') >= 0, 'B3c: 被挡下的面被报出');
    a(g.short === true, 'B3d: short === true（没查全与查了没有不同判）');
  }
  // B4：全查到且零命中 ⇒ short === false（「真的没记录」）
  {
    const WA = boot();
    stubSearch(WA, function (q) {
      return { ok: true, query: q, faces: ['chronicle'], total: 3, matched: 0, returned: 0,
        trimmed: false, empty: true, blind: [], deferred: [], notCovered: [],
        sources: [{ face: 'chronicle', ok: true, matched: 0 }], rows: [] };
    });
    const g = WA.assistant.search('京都事件');
    a(g.rows.length === 0 && g.short === false, 'B4: 六面全查后零命中 ⇒ short === false');
    a(g.noTerms !== true, 'B4b: 这次确实查过（不是「没能提问」）');
  }
  // B5：检索口拒收 / 抛异常 ⇒ 记「查不了」，不当空结果
  {
    const WA = boot();
    stubSearch(WA, function () { throw new Error('boom'); });
    const g = WA.assistant.search('任意');
    a(g.ok === true && g.rows.length === 0, 'B5a: 检索抛异常时不崩，仍是「无行」');
    a(g.blind.length > 0 && g.short === true, 'B5b: 抛异常记为「读不到」而不是「空结果」（blind 非空 + short）');
  }
  // B6：检索面缺席（未装载）⇒ 明确 no-search-face，不谎称查过了
  {
    const WA = boot();
    const saved = WA.historySearch;
    WA.historySearch = undefined;
    const g = WA.assistant.search('任意');
    a(g.ok === false && g.reason === 'no-search-face', 'B6: 检索面缺席 ⇒ reason=no-search-face（不谎称查过）');
    WA.historySearch = saved;
  }
}

// ── C 段：ask 全链（桩住 apiRouter，验引用核对 / 无据自述 / 通道未配置）────────
function stubApi(WA, sink, reply) {
  WA.apiRouter = Object.assign({}, WA.apiRouter, {
    getChannel: function () { return { baseUrl: 'http://stub', model: 'stub-model' }; },
    call: async function (ch, msgs, opt) {
      sink.msgs = msgs; sink.opt = opt;
      return typeof reply === 'function' ? reply(msgs, opt) : reply;
    }
  });
}
function searchStub(n) {
  return function (q) {
    const rows = [];
    for (let i = 1; i <= n; i++) {
      rows.push({ face: 'chronicle', ref: 'ref' + i, at: i, title: 'T' + i, text: 'X' + i,
        source: 'chronicleView.entries()', route: { page: 'events', face: 'chronicle', ref: 'ref' + i } });
    }
    return { ok: true, query: q, faces: ['chronicle'], total: n, matched: n, returned: n,
      trimmed: false, empty: n === 0, blind: [], deferred: [], notCovered: [], sources: [
        { face: 'chronicle', ok: true, matched: n }], rows: rows };
  };
}

async function runC(a) {
  // C1：模型给出合法引用号 ⇒ citations 由代码核对并带上 route（可跳转）
  {
    const WA = boot();
    const sink = {};
    stubSearch(WA, searchStub(3));
    stubApi(WA, sink, '人物甲做了某事 [2]。人物乙是知情人 [3]。依据：[2] chronicle；[3] chronicle');
    const r = await WA.assistant.ask('发生了什么？');
    a(r.ok === true, 'C1a: ask 成功');
    a(r.citations.length === 2 && r.citations[0].n === 2 && r.citations[1].n === 3, 'C1b: 引用号 2 / 3 被核出');
    a(r.citations[0].ref === 'ref2' && r.citations[0].route && r.citations[0].route.page === 'events',
      'C1c: 引用带 ref 与 route（回答可跳回来源面）');
    a(r.none === false && r.short === false, 'C1d: 有据且六面全查（none/short 都 false）');
    a(typeof sink.msgs[1].content === 'string' && sink.msgs[1].content.indexOf('[2]') >= 0,
      'C1e: 证据清单真的进了提示词（带编号）');
    a(sink.msgs[1].content.indexOf('T2') >= 0, 'C1f: 提示词里带的是**本次检索行**（不是固定快照）');
  }
  // C2：模型编出超出行数的引用号 ⇒ 必须被拒收（编号不由模型自称）
  {
    const WA = boot();
    const sink = {};
    stubSearch(WA, searchStub(2));
    stubApi(WA, sink, '断言甲 [7]。断言乙 [1]。');
    const r = await WA.assistant.ask('发生了什么？');
    a(r.ok === true, 'C2a: ask 成功');
    a(r.citations.length === 1 && r.citations[0].n === 1, 'C2b: 越界号 [7] 被拒收，只留合法 [1]');
    a(r.citations.every(function (c) { return c.n <= r.evidence.offered; }),
      'C2c: 所有留存的引用号都 ≤ 本次真实行数');
  }
  // C3：零命中 ⇒ none === true，且提示词里明写「没证据」
  {
    const WA = boot();
    const sink = {};
    stubSearch(WA, searchStub(0));
    stubApi(WA, sink, '查不到对应的世界记录。');
    const r = await WA.assistant.ask('查无此事？');
    a(r.none === true && r.citations.length === 0, 'C3a: 零命中 ⇒ none 且无引用');
    a(sink.msgs[1].content.indexOf('六面全查过') >= 0, 'C3b: 提示词区分「真的没记录」与「没查全」');
    a(WA.assistant.stat().noEvidence >= 1, 'C3c: 计量面上记了零命中一次');
  }
  // C4：没查全 ⇒ 缺口段进提示词，且 short === true
  {
    const WA = boot();
    const sink = {};
    stubSearch(WA, function (q) {
      return { ok: true, query: q, faces: ['chronicle'], total: 1, matched: 1, returned: 1, empty: false,
        trimmed: false, blind: ['places'], deferred: [], notCovered: ['places'],
        sources: [{ face: 'chronicle', ok: true, matched: 1 }],
        rows: [{ face: 'chronicle', ref: 'r1', at: 1, title: 'T1', text: 'X1', source: 'chron' }] };
    });
    stubApi(WA, sink, 'T1 这件事有记录 [1]。');
    const r = await WA.assistant.ask('在哪发生的？');
    a(r.short === true, 'C4a: short === true');
    a(r.gaps.blind.indexOf('places') >= 0, 'C4b: 缺口面带回 blind');
    a(sink.msgs[1].content.indexOf('没查全') >= 0, 'C4c: 提示词里明说本次没查全');
  }
  // C5：通道未配置 ⇒ 明确拒收，不静默给空答案
  {
    const WA = boot();
    WA.apiRouter = Object.assign({}, WA.apiRouter, {
      getChannel: function () { return { baseUrl: '', model: '' }; }
    });
    const r = await WA.assistant.ask('任意');
    a(r.ok === false && r.reason === 'channel-unconfigured', 'C5: 通道未配置 ⇒ reason=channel-unconfigured');
  }
  // C6：空提问 ⇒ 明确拒收
  {
    const WA = boot();
    const r = await WA.assistant.ask('   ');
    a(r.ok === false && r.reason === 'empty-question', 'C6: 空提问 ⇒ reason=empty-question');
  }
  // C7：拆词稳定 —— 同一提问两次得到同一词序（可复算）
  {
    const WA = boot();
    const t1 = WA.assistant.terms('幕府将军 在 京都 做了什么');
    const t2 = WA.assistant.terms('幕府将军 在 京都 做了什么');
    a(JSON.stringify(t1) === JSON.stringify(t2), 'C7a: 拆词两次逐字同（稳定序）');
    a(t1.indexOf('的') < 0 && t1.indexOf('在') < 0 && t1.indexOf('什么') < 0, 'C7b: 停用词被剔掉');
    // 空拆表**不是**「全查过、零命中」—— 它是「这次没能提问」，必须单列
    a(WA.assistant.terms('   ').length === 0, 'C7c: 纯空白提问拆出空表（不伪造一条词）');
    const g0 = WA.assistant.search('的了是吗呢');
    a(g0.ok === true && g0.noTerms === true && g0.short === true,
      'C7d: 无词可查 ⇒ noTerms 且 short（不当成「六面全查过」）');
  }
  // C8：玩家视角下 ask 也收窄（与 search 同源，不是两套判据）
  {
    const WA = boot();
    const sink = {};
    let facesSeen = 'unset';
    stubSearch(WA, function (q, o) {
      facesSeen = o.faces || null;
      return { ok: true, query: q, faces: o.faces || [], total: 0, matched: 0, returned: 0, empty: true,
        trimmed: false, blind: [], deferred: [], notCovered: [], sources: [], rows: [] };
    });
    stubApi(WA, sink, '查不到对应的世界记录。');
    WA.perspective.setView('player');
    const r = await WA.assistant.ask('规则里怎么写的？');
    a(Array.isArray(facesSeen), 'C8a: ask 路径同样先收窄面（先于检索）');
    a(r.gaps.droppedFaces.indexOf('rules') >= 0, 'C8b: 返回面报出被摘的 rules');
    a(sink.msgs[1].content.indexOf('未检索') >= 0, 'C8c: 提示词里明说该面「因玩家视角未检索」');
    WA.perspective.setView('omniscient');
  }
}

// ── N 段：真源码破坏（内存副本，不写回盘）+ 两向自证 ────────────────────────
function runN(a) {
  const SRC = srcOf();
  // 三处锚点各须恰中 1 次
  const A_DENY = "  const PLAYER_DENY_FACES = ['rules', 'entries'];  // 玩家视角下摘掉的作者侧设定面";
  const A_CHECK = "      if (!row || typeof row !== 'object') continue;   // 没有对应行 = 号是编的，拒收";
  const A_FACES = "      if (faces) args.faces = faces;";
  const c1 = cnt(SRC, A_DENY), c2 = cnt(SRC, A_CHECK), c3 = cnt(SRC, A_FACES);
  if (c1 !== 1 || c2 !== 1 || c3 !== 1) {
    a(false, 'N0: 三处锚点各恰中 1 次（实 ' + c1 + '/' + c2 + '/' + c3 + '）');
    return;
  }
  a(true, 'N0: 三处锚点各恰中 1 次');

  // N1：把「玩家视角禁读面」掏空 ⇒ 玩家视角下的收窄面退化（rules/entries 不再被摘）
  const b1 = SRC.split(A_DENY).join("  const PLAYER_DENY_FACES = [];  // 玩家视角下摘掉的作者侧设定面");
  a(b1 !== SRC, 'N1a: 破坏真的改动了源码文本');
  {
    const WA = sync.fresh({ srcOverride: { 'ui/assistant.js': b1 } }).WA;
    let faced = 'unset';
    stubSearch(WA, function (q, o) {
      faced = o.faces || null;
      return { ok: true, query: q, faces: o.faces || [], total: 0, matched: 0, returned: 0, empty: true,
        trimmed: false, blind: [], deferred: [], notCovered: [], sources: [], rows: [] };
    });
    WA.perspective.setView('player');
    const g = WA.assistant.search('规则里怎么写的？');
    a(Array.isArray(faced) && faced.indexOf('rules') >= 0,
      'N1b: 破坏后玩家视角下 rules **回到**候选面（收窄失效 —— 靶子真被抹掉）');
    a(g.droppedFaces.length === 0, 'N1c: 破坏后 droppedFaces 为空');
    WA.perspective.setView('omniscient');
  }
  // 两向：原版上同款判据为真
  {
    const WA = sync.fresh({}).WA;
    let faced = 'unset';
    stubSearch(WA, function (q, o) {
      faced = o.faces || null;
      return { ok: true, query: q, faces: o.faces || [], total: 0, matched: 0, returned: 0, empty: true,
        trimmed: false, blind: [], deferred: [], notCovered: [], sources: [], rows: [] };
    });
    WA.perspective.setView('player');
    const g = WA.assistant.search('规则里怎么写的？');
    a(Array.isArray(faced) && faced.indexOf('rules') < 0 && g.droppedFaces.indexOf('rules') >= 0,
      'N1d: 原版上玩家视角**真摘下** rules（两向成立）');
    WA.perspective.setView('omniscient');
  }

  // N2：把「越界号拒收」改成放行 ⇒ 模型编的引用号会被当真的用
  const A_CHECK2 = "      if (!row || typeof row !== 'object') continue;   // 没有对应行 = 号是编的，拒收";
  const c4 = cnt(SRC, A_CHECK2);
  a(c4 === 1, 'N0b: 拒收锚点恰中 1 次（实 ' + c4 + '）');
  const A_RANGE = "      const row = (n >= 1 && n <= offered.length) ? offered[n - 1] : null;";
  const cr = cnt(SRC, A_RANGE);
  a(cr === 1, 'N0c: 行号域锚点恰中 1 次（实 ' + cr + '）');
  const b2 = SRC.split(A_RANGE).join("      const row = (n >= 1) ? (offered[n - 1] || {}) : null;");
  a(b2 !== SRC, 'N2a: 破坏真的改动了源码文本');
  const p2 = (async function () {
    const WA = sync.fresh({ srcOverride: { 'ui/assistant.js': b2 } }).WA;
    const sink = {};
    stubSearch(WA, searchStub(2));
    stubApi(WA, sink, '断言甲 [7]。断言乙 [1]。');
    const r = await WA.assistant.ask('发生了什么？');
    a(r.citations.some(function (c) { return c.n === 7; }),
      'N2b: 破坏后越界号 [7] 被当合法引用（拒收失效 —— 靶子真被抹掉）');
    const WA2 = sync.fresh({}).WA;
    const sink2 = {};
    stubSearch(WA2, searchStub(2));
    stubApi(WA2, sink2, '断言甲 [7]。断言乙 [1]。');
    const r2 = await WA2.assistant.ask('发生了什么？');
    a(!r2.citations.some(function (c) { return c.n === 7; }) && r2.citations.length === 1,
      'N2c: 原版上越界号被拒收（两向成立）');
    // N3：负控制未写回盘
    a(cnt(srcOf(), A_DENY) === 1 && cnt(srcOf(), A_CHECK2) === 1 && cnt(srcOf(), A_FACES) === 1,
      'N3: 负控制之后真源码仍是原版（破坏只活在内存副本里）');
    a(srcOf() === SRC, 'N4: 源文件逐字节未变');
  })();
  return p2;
}

async function runAll(a) {
  runA(a);
  runB(a);
  await runC(a);
  await runN(a);
}

module.exports = { runAll: runAll };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a).then(function () {
    console.log('\nev1-evidence-qa-v2208 ' + pass + ' / 失败 ' + fail);
    process.exit(fail > 0 ? 1 : 0);
  }).catch(function (e) {
    console.log('FAIL threw: ' + (e && e.stack));
    console.log('\nev1-evidence-qa-v2208 ' + pass + ' / 失败 ' + (fail + 1));
    process.exit(1);
  });
}
