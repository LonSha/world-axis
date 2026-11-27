/**
 * WorldAxis tests/promise-face-v2605.js (v2.605.0) — 点名面（GNS-1）
 *
 * ── 它治什么（缺口）────────────────────────────────────────────────────
 *   R278 的 `labelBack` 是**手数**出来的：读 `calendar-custom.js` 的头部注释，
 *   发现「本模块只做三件事」里第三件在导出表里根本没有，再用一次 `grep` 坐实
 *   「全仓只命中那句注释本身」。同一件事能不能**不靠手数**？ —— 本面就是为了回答它。
 *
 *   口径只有一句话：**注释里以「调用形态」点名、而代码面一次也没出现的名字**。
 *   这样的名字是「只在注释里活着」的：读注释的人会以为它已存在，而它从未存在过。
 *   它不是算术错、不是接线漏，是**文档比实现多走了一步** —— 而这一步在任何
 *   运行时读数上都看不见（没东西可读）。
 *
 * ── 四条口径（三条是否定式，一条是收窄式）────────────────────────────
 *   ① **只扫产品面**（`tests/product-files.js` 的 `productFiles`，与 doc-gate /
 *      reject-code-gate 同一真源）。但由此产生一类**扫描面产物**：名字只存在于
 *      `tests/` 或 `tools/` 面（实例：`makeHost(` 是测试宿主的构造器，八台引擎的
 *      注释都在引用它）。这类必须显式登记为 `testSide` —— 否则门禁天天假报。
 *   ② **只认调用形态**：注释里写成 `` `name(` ``（反引号 + 小驼峰 + 左括号）。
 *      裸反引号名**不收**：实测裸形态 2050 个名、其中 85 个「代码面零出现」，
 *      而绝大多数是概念词与参数名（`grep` / `bayes` / `poisson` / `argA`）——
 *      噪声比信号高一个量级，收进来只会把这面做成噪声源。
 *      收窄后：532 个名、12 个幽灵，人工逐条可读。
 *   ③ **判「代码面零出现」时先剥注释**，否则每个点名的名字都在**自己那句注释里**
 *      自我作证，判据恒假。剥离器**不新写**，直接委托
 *      `tests/test-surface-gate.js` 的 `stripComments`（单行，与
 *      reject-code-gate / inventory 同一状态机思路，保留字符串、长度守恒）。
 *   ④ **字符串里出现也算出现**（保守口径）：宁可漏报，不可误诉。
 *      实例：把 `` `zzFakeCall(` `` 写进一个字符串字面量，本面就**不**报它。
 *
 * ── 四类（每条幽灵必须显式归类，表里不许留白）──────────────────────
 *   `claim`       注释把它当现存的东西用，而它不存在 ⇒ 读的人会被误导（**真缺口**）
 *   `history`     注释原文就交代了它被删 / 没另开 ⇒ 不误导（实例：`impactOf`）
 *   `testSide`    名字只在 tests/ 或 tools/ 面 ⇒ 扫描面产物，不是产品缺口
 *   `placeholder` `Xxx` / `xxx` 占位形态 ⇒ 说的是「每一处」，不是某个函数
 *
 *   表过期也是红：写了 `claim` 而已被实现、或写了 `history` 而注释不再提那句话，
 *   都必须回来改表 —— 否则这张表会变成「一份不许质疑的结论」。
 *
 * ── 边界（如实登记）──────────────────────────────────────────────────
 *   1 **不做句义判断**。归类靠人，判据只核「归类不矛盾」（每类的旁证都复算一遍）。
 *   2 **不做跨仓拼写比较**：`fsec` 与 `foldSec` 像不像不算证，只报「代码面零出现」。
 *   3 **不修改注释**。改注释是产品判断（那句注释也许该改成新名字、也许该删），
 *     本面只把「有这几处」摆到台面上。
 *   4 **零写库**：本面只读、只打印；不产生任何账本文件（连 `--update` 都没有）。
 *
 * ── v2.607.0 补记：五条 claim 不是同一种东西 ────────────────────
 *   R282 逐条读了源码（结论见 `docs/PROMISE_FACE_ADJUDICATION.md`），发现 claim
 *   这一类里混着两种事：
 *     ① **注释承诺了一个没有的行为**（`onCommit` / `effectPending`）—— 补上就改行为，
 *        删注释就是撕承认欠账，两边都是产品判断，本面不得自己关。
 *     ② **注释提了一个别处的名字、却没说是别处的**（`undoTurns` 是 npc-life 的、
 *        `exclusive` 是 dsh-toy 的、一个是当年记错的那支名）—— 这类不是承诺，
 *        是**归属欠标**；治法只有一个：把主体写进注释（纯注释、零行为影响）。
 *   所以本面**不新增第五类**：② 不是一种新的「幽灵」，而是「本来就能关掉」的一类。
 *   `RESOLVED` 因此分两种关闭方式（两边不许串）：
 *     `rename`    旧名是错的 ⇒ 换成真名 ⇒ 旧名必须在该文件零出现
 *     `attribute` 旧名是对的、主体是错的 ⇒ 旧名留下、但不得再写成调用形态，
 *                 且**主体与本仓对应物都必须真在文件里**（R6 / R7 两条钉住）
 *
 * 跑：`node tests/promise-face-v2605.js`
 */
(function () {
  'use strict';
  const assert = require('assert');
  const fs = require('fs');
  const path = require('path');
  const BASE = path.join(__dirname, '..');
  const PF = require('./product-files.js');
  const TS = require('./test-surface-gate.js');

  let pass = 0, fail = 0;
  function ok(name, fn) {
    try { fn(); pass++; console.log('  \u2713 ' + name); }
    catch (e) { fail++; console.log('  X ' + name + '\n      ' + (e && e.message)); }
  }

  // ── 口径常量 ────────────────────────────────────────────────────────
  const CALL_NAME = /`([a-z][A-Za-z0-9]{2,40})\(/g;
  const KINDS = ['claim', 'history', 'testSide', 'placeholder'];

  /** 四类归类表。每一条必须给 `why` —— 没有理由的分类等于没分类。 */
  const GHOSTS = {
    onCommit: { kind: 'claim', file: 'core/commit.js',
      why: 'chain(opt) 的 JSDoc 写着 onCommit(scope) 在链事务提交之后调用、并据此把邀约漏账记进 faults；而 opt.onCommit 在代码面一次没读' },
    effectPending: { kind: 'claim', file: 'core/commit.js',
      why: '注释说「effectPending() 读它」，而 commit 的导出表里没有这个读口 —— 副作用队列有写无读' },
    impactOf: { kind: 'history', file: 'engines/perf-ledger.js',
      why: '注释原文写着「删掉两个零消费方的出口——原设计的 impactOf(path)」，读的人不会被误导' },
    addRule: { kind: 'history', file: 'render/purifier.js',
      why: '注释原文写着「此处原有 addRule(rule) / removeRule(id) 两个裸入口……已被 addRuleSafe / removeRuleSafe 取代」，是墓碑不是承诺' },
    loadPreset: { kind: 'history', file: 'render/purifier.js',
      why: '同上：「此处原有 loadPreset(preset)——只认 Veridis 预设」，交代的是它被删的理由' },
    loadGateStat: { kind: 'history', file: 'core/store.js',
      why: '注释标题就是「为什么不另开一个 loadGateStat」，交代的是没有这件东西的理由' },
    makeHost: { kind: 'testSide', file: 'engines/betrothal-alliance.js',
      why: '名字在 tests/exv22-v2400.js 里，是测试宿主的构造器；八台引擎的注释都在引用它' },
    secXxx: { kind: 'placeholder', file: 'engines/world-health.js',
      why: 'Xxx 是占位形态，说的是「每个诊断节」，不是某个具体函数' },
    xxxOn: { kind: 'placeholder', file: 'ui/pages/tools-page.js',
      why: '同上：xxxOn() 是「段体里那个取值函数」的占位写法' }
  };

  /**
   * 已关闭的检点（v2.606.0 立）。
   *   一条 `claim` 只有两种下场：**改注释**（注释就是错的）或**补实现**（行为欠账）；
   *   两者都不做也行，但必须留在 GHOSTS 里 —— 「报出来但没人理」与「关掉了」必须分开。
   *   本表只收**改注释**这一类（无行为影响；改实现是产品判断，不在这里）。
   *   每条必须带三栏：`version`（哪个版本关的）/ `file` / `newName`（注释现在写的是什么）。
   *   判据两向：① 旧名必须**从现场幽灵名单里消失**（注释真改了）；
   *   ② 文件里必须真出现 `newName`（不是删了名字改成一句含糊话）；
   *   ③ 旧名在该文件里**零出现**（不许「新名留着，旧名也留着」）。
   *   v2.607.0 起分两种关闭方式（`mode` 必填）：
   *     `rename`    旧名就是错的（拼错 / 指错支）⇒ 换成真名，旧名在该文件连子串都不许留。
   *     `attribute` 旧名本就是别处的 API（上游 / 外部项目）⇒ 名字留下，但必须补两列：
   *                 `owner`（主体词，R6 钉「它就在名字旁边」）与 `ours`
   *                 （本仓对应物，R7 钉「它在代码面真存在」）。
   */
  const RESOLVED = {
    fsec: { version: '2.606.0', mode: 'rename', file: 'ui/panel-fold.js', newName: 'foldSec(',
      how: '注释改成真名与真签名 foldSec(page, sec, label, body) —— ui/panel.js 里就是这么定义的（第三参是 label、第四参是 body 函数）' },
    devSettingsHtml: { version: '2.606.0', mode: 'rename', file: 'engines/tool-diag.js',
      newName: 'if (!__dev) return playerSettingsHtml();',
      how: '设置页并没有两个分支函数：同一函数里一行早退切两侧（ui/settings.js:875）。注释改成这个真形态' },
    // ── v2.607.0 关的三条：名字在、主体错（判据见 R4 / R6 / R7）──────────
    sizeAll: { version: '2.607.0', mode: 'rename', file: 'engines/storage-forecast.js',
      newName: 'store.storageStat()',
      how: '本仓从来没有 sizeAll 这个名；返回 totalBytes 的是 store.storageStat()（盘点支，core/store.js:5213-5246）。改的是「另一支」的人名，叙述的事实（两处不同源、曾静默退化）一字未动' },
    undoTurns: { version: '2.607.0', mode: 'attribute', file: 'engines/source-reconcile.js',
      newName: '`undoTurns` 撤销面', owner: 'npc-life', ours: 'undoFrom(',
      how: 'undoTurns 是 npc-life 那台 timeline.js 的 API；本仓对应物叫 undoFrom(timeline, fromIndex)，已在导出表（271 行）。注释把主体、退路与语义映射一并写清' },
    exclusive: { version: '2.607.0', mode: 'attribute', file: 'engines/defer-token.js',
      newName: 'dsh-toy 的** `exclusive` 面', owner: 'dsh-toy', ours: 'serial(',
      how: 'exclusive 是外部项目 dsh-toy 的 API（index.js:674 早就写着 cf. dsh-toy ... + exclusive）；本仓对应物是 serial()。两处注释现在同口径' },
  };

  /** 占位形态：`Xxx` / `xxx` / 连续大写 X —— 只在**词尾或词腰**出现即算。 */
  function isPlaceholder(id) { return /[Xx]{2,}/.test(id); }

  // ── 扫描器（纯函数；vfs 供负控制用）──────────────────────────────
  function readAny(vfs, rel) {
    if (vfs && Object.prototype.hasOwnProperty.call(vfs, rel)) return vfs[rel];
    try { return fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { return null; }
  }

  /** 注释洞里以调用形态点名的名字（剥注释委托 TS.stripComments）。 */
  function candidatesOf(src) {
    const code = TS.stripComments(src);
    const out = [];
    let m;
    CALL_NAME.lastIndex = 0;
    while ((m = CALL_NAME.exec(src))) {
      const start = m.index, len = m[0].length;
      let allInComment = true;
      for (let k = start; k < start + len; k += 1) {
        if (src[k] === code[k]) { allInComment = false; break; }
      }
      if (!allInComment) continue;
      out.push({ id: m[1], line: src.slice(0, start).split('\n').length });
    }
    return out;
  }

  function scan(opt) {
    const o = opt || {};
    const vfs = o.vfs || null;
    const files = o.files || PF.productFiles();
    const codeOf = {};
    const owners = {};
    let read = 0;
    files.forEach(function (rel) {
      const src = readAny(vfs, rel);
      if (typeof src !== 'string') return;
      read += 1;
      codeOf[rel] = TS.stripComments(src);
      candidatesOf(src).forEach(function (c) {
        if (!owners[c.id]) owners[c.id] = [];
        owners[c.id].push({ file: rel, line: c.line });
      });
    });
    const ids = Object.keys(owners).sort();
    const ghosts = ids.filter(function (id) {
      const re = new RegExp('\\b' + id + '\\b');
      for (const rel in codeOf) { if (re.test(codeOf[rel])) return false; }
      return true;
    });
    return { files: files.length, read: read, ids: ids, ghosts: ghosts, owners: owners, codeOf: codeOf };
  }

  /** tests/ 与 tools/ 面的原文索引（`testSide` 类要在这里找名字）。 */
  let __sideText = null;
  function sideText() {
    if (__sideText) return __sideText;
    const parts = [];
    PF.testFiles().forEach(function (rel) {
      try { parts.push(fs.readFileSync(path.join(BASE, rel), 'utf8')); } catch (e) { /* 缺失不抛 */ }
    });
    try {
      fs.readdirSync(path.join(BASE, 'tools')).forEach(function (f) {
        if (!/\.js$/.test(f)) return;
        try { parts.push(fs.readFileSync(path.join(BASE, 'tools', f), 'utf8')); } catch (e) { /* 同上 */ }
      });
    } catch (e) { /* tools/ 不在也算能跑 */ }
    __sideText = parts.join('\n');
    return __sideText;
  }

  const LIVE = scan({});

  // ═══════════ A 扫描口径 ═══════════
  ok('A1 扫描面非空：产品文件 ≥ 600、真读到 ≥ 600', function () {
    assert.ok(LIVE.files >= 600, '文件面 ' + LIVE.files);
    assert.ok(LIVE.read >= 600, '真读到 ' + LIVE.read);
  });
  ok('A2 注释里以调用形态点名的名字 ≥ 400（剥注释器没把注释吃掉）', function () {
    assert.ok(LIVE.ids.length >= 400, '命中名数 ' + LIVE.ids.length);
  });
  ok('A3 剥离器单一真源：本文件不自己写 stripComments', function () {
    const self = fs.readFileSync(__filename, 'utf8');
    // 同 D2 的坑：查的串不能直接写在被查文件里 —— 它会找到自己。用正则形态。
    assert.strictEqual(/function\s+stripComments\s*\(/.test(self), false, '本文件不该自带剥离器');
    assert.ok(typeof TS.stripComments === 'function', 'TS.stripComments 必须可用');
  });
  ok('A4 剥注释真的会动（同一行「注释里点名」vs「代码里点名」结果相反）', function () {
    const a = candidatesOf('// \\u8bf4\u660e\\uff1a`zzProbeOne(x)` \\u8fd8\\u6ca1\\u5199\n');
    const b = candidatesOf('const zzProbeOne = 1; // `zzProbeTwo(x)`\n');
    assert.deepStrictEqual(a.map(function (x) { return x.id; }), ['zzProbeOne']);
    assert.deepStrictEqual(b.map(function (x) { return x.id; }), ['zzProbeTwo'], '代码行里那个不算');
  });

  // ═══════════ B 归类完备 ═══════════
  ok('B1 现场幽灵名单与归类表两向相等（多一个=未定性，少一个=表过期）', function () {
    const live = LIVE.ghosts.slice().sort();
    const tab = Object.keys(GHOSTS).sort();
    assert.deepStrictEqual(live, tab,
      '现场多出：[' + live.filter(function (x) { return tab.indexOf(x) < 0; }).join(',') +
      ']，表里过期：[' + tab.filter(function (x) { return live.indexOf(x) < 0; }).join(',') + ']');
  });
  ok('B2 每一类都有承担者（四类不许有空类）', function () {
    KINDS.forEach(function (k) {
      const n = Object.keys(GHOSTS).filter(function (id) { return GHOSTS[id].kind === k; }).length;
      assert.ok(n > 0, '空类：' + k);
      assert.ok(GHOSTS[Object.keys(GHOSTS).filter(function (i) { return GHOSTS[i].kind === k; })[0]].why, k + ' 类缺 why');
    });
  });
  ok('B3 四类计数 = claim 2 / history 4 / testSide 1 / placeholder 2（v2.607.0 又关了三条：undoTurns / exclusive / sizeAll）', function () {
    const c = {};
    KINDS.forEach(function (k) { c[k] = 0; });
    Object.keys(GHOSTS).forEach(function (id) { c[GHOSTS[id].kind] += 1; });
    assert.deepStrictEqual(c, { claim: 2, history: 4, testSide: 1, placeholder: 2 });
  });
  ok('B4 每条都给了所在文件与理由，且文件真存在', function () {
    Object.keys(GHOSTS).forEach(function (id) {
      const g = GHOSTS[id];
      assert.ok(g.file && g.why, id + ' 缺 file/why');
      assert.ok(fs.existsSync(path.join(BASE, g.file)), id + ' 的文件不存在：' + g.file);
    });
  });
  ok('B5 claim 类逐条复算：全仓产品代码面真的零出现（不信表，重扫一遍）', function () {
    Object.keys(GHOSTS).forEach(function (id) {
      if (GHOSTS[id].kind !== 'claim') return;
      const re = new RegExp('\\b' + id + '\\b');
      const hit = Object.keys(LIVE.codeOf).filter(function (rel) { return re.test(LIVE.codeOf[rel]); });
      assert.deepStrictEqual(hit, [], id + ' 已在代码面出现（' + hit.join(',') + '）—— 表过期');
    });
  });
  ok('B6 claim 类逐条复算：确实出现在注释里，且所属文件与表一致', function () {
    Object.keys(GHOSTS).forEach(function (id) {
      if (GHOSTS[id].kind !== 'claim') return;
      const own = LIVE.owners[id] || [];
      assert.ok(own.length > 0, id + ' 不在任何注释里');
      const files = own.map(function (o) { return o.file; });
      assert.ok(files.indexOf(GHOSTS[id].file) >= 0, id + ' 实际出现在：' + files.join(',') + '（表写 ' + GHOSTS[id].file + '）');
    });
  });
  ok('B7 testSide 类的名字真的在 tests/ 或 tools/ 面出现（否则归类撒谎）', function () {
    const txt = sideText();
    Object.keys(GHOSTS).forEach(function (id) {
      if (GHOSTS[id].kind !== 'testSide') return;
      assert.ok(new RegExp('\\b' + id + '\\b').test(txt), id + ' 在 tests/tools 面也找不到');
    });
  });
  ok('B8 history 类的注释原文必须真的写了「删 / 不另开」', function () {
    Object.keys(GHOSTS).forEach(function (id) {
      if (GHOSTS[id].kind !== 'history') return;
      const src = fs.readFileSync(path.join(BASE, GHOSTS[id].file), 'utf8');
      const lines = src.split('\n');
      const own = (LIVE.owners[id] || []).filter(function (o) { return o.file === GHOSTS[id].file; });
      assert.ok(own.length > 0, id + ' 不在该文件注释里');
      const hit = own.some(function (o) {
        const line = lines[o.line - 1] || '';
        return /删|不另开|撤回|从来没有|原有|取代|墓碑/.test(line);
      });
      assert.ok(hit, id + ' 的注释没说它被删/没另开 —— history 归类不成立');
    });
  });
  ok('B9 placeholder 类的名字真的符合占位形态（Xxx / xxx）', function () {
    Object.keys(GHOSTS).forEach(function (id) {
      if (GHOSTS[id].kind !== 'placeholder') return;
      assert.ok(isPlaceholder(id), id + ' 不是占位形态');
    });
    assert.ok(!isPlaceholder('onCommit'), 'onCommit 不该被判成占位');
    assert.ok(isPlaceholder('secXxx'), 'secXxx 应判成占位');
  });
  ok('B10 claim 类必须都是「行为承诺」型（why 里得说得出一处代码没读 / 有写无读）', function () {
    // 防的是一种退步：把「借名」当成真缺口混进来，再靠改注释「关」掉 —— 那就不是关，是洗。
    Object.keys(GHOSTS).forEach(function (id) {
      if (GHOSTS[id].kind !== 'claim') return;
      assert.ok(/没读|有写无读|导出表里没有/.test(GHOSTS[id].why), id + ' 的 why 里没有行为面证据，不该归 claim');
    });
  });

  // ═══════════ R 已关闭的检点（关掉要能自证关掉了）═══════════
  ok('R1 已关条目的旧名真的从现场幽灵名单里消失（注释改了才算关）', function () {
    Object.keys(RESOLVED).forEach(function (id) {
      assert.strictEqual(LIVE.ghosts.indexOf(id), -1, id + ' 还在幽灵名单里 —— 注释没改干净');
    });
  });
  ok('R2 已关条目三栏齐全（version / file / newName），且文件真存在', function () {
    Object.keys(RESOLVED).forEach(function (id) {
      const r = RESOLVED[id];
      assert.ok(r.version && r.file && r.newName && r.how, id + ' 缺栏');
      assert.ok(fs.existsSync(path.join(BASE, r.file)), id + ' 的文件不存在');
    });
  });
  ok('R3 文件里真出现新名字（不是把名字删掉换成一句含糊话）', function () {
    Object.keys(RESOLVED).forEach(function (id) {
      const r = RESOLVED[id];
      const src = fs.readFileSync(path.join(BASE, r.file), 'utf8');
      assert.ok(src.indexOf(r.newName) >= 0, id + ' 的 newName 不在文件里：' + r.newName);
    });
  });
  ok('R4 关掉后旧名不得再以调用形态出现（rename 型还要更严：旧名在该文件零出现）', function () {
    Object.keys(RESOLVED).forEach(function (id) {
      const r = RESOLVED[id];
      const src = fs.readFileSync(path.join(BASE, r.file), 'utf8');
      assert.strictEqual(src.indexOf('`' + id + '('), -1, id + ' 仍写成调用形态');
      if (r.mode === 'rename') {
        assert.strictEqual(src.indexOf(id), -1, id + ' 是 rename 型，旧名连子串都不许留');
      }
    });
  });
  ok('R5 GHOSTS 与 RESOLVED 不许同时收录同一个名字（一个名字只有一个状态）', function () {
    Object.keys(RESOLVED).forEach(function (id) {
      assert.strictEqual(Object.prototype.hasOwnProperty.call(GHOSTS, id), false, id + ' 两边都在');
    });
  });
  ok('R6 attribute 型的名字旁边真有主体（主体词必须在本行或上两行，不能只写在表里）', function () {
    Object.keys(RESOLVED).forEach(function (id) {
      const r = RESOLVED[id];
      if (r.mode !== 'attribute') return;
      const lines = fs.readFileSync(path.join(BASE, r.file), 'utf8').split('\n');
      const at = lines.findIndex(function (ln) { return ln.indexOf('`' + id + '`') >= 0; });
      assert.ok(at >= 0, id + ' 在该文件里找不到带反引号的这个名字');
      const win = lines.slice(Math.max(0, at - 2), at + 1).join('\n');
      assert.ok(win.indexOf(r.owner) >= 0, id + ' 所在行及上两行都没有主体词：' + r.owner);
    });
  });
  ok('R7 attribute 型的「本仓对应物」在代码面真存在（不许拿一个也还没写的名字当退路）', function () {
    Object.keys(RESOLVED).forEach(function (id) {
      const r = RESOLVED[id];
      if (r.mode !== 'attribute') return;
      const code = TS.stripComments(fs.readFileSync(path.join(BASE, r.file), 'utf8'));
      const m = /^([A-Za-z_$][A-Za-z0-9_$]*)\($/.exec(r.ours);
      assert.ok(m, id + ' 的 ours 不是「名字(」形态：' + r.ours);
      assert.ok(code.indexOf(m[1]) >= 0, id + ' 的对应物在代码面不存在：' + m[1]);
    });
  });

  // ═══════════ C 两向自证（造真）═══════════
  const PROBE = 'engines/zz-gns-probe.js';
  ok('C1 合成站点：注释里点名而代码没有 ⇒ 必须报', function () {
    const vfs = {};
    vfs[PROBE] = '// \\u8bf4\\u660e\\uff1a`zzFakeCall(x)` \\u8fd8\\u6ca1\\u5199\n';
    const r = scan({ vfs: vfs, files: PF.productFiles().concat([PROBE]) });
    assert.ok(r.ghosts.indexOf('zzFakeCall') >= 0, '应报 zzFakeCall，实报：' + r.ghosts.join(','));
  });
  ok('C2 反控：把它真写进代码 ⇒ 不再报（判据不是「见过就报」）', function () {
    const vfs = {};
    vfs[PROBE] = '// \\u8bf4\\u660e\\uff1a`zzFakeCall(x)`\nfunction zzFakeCall(x) { return x; }\n';
    const r = scan({ vfs: vfs, files: PF.productFiles().concat([PROBE]) });
    assert.strictEqual(r.ghosts.indexOf('zzFakeCall'), -1, '已实现却仍报');
  });
  ok('C3 反控：只写在字符串字面量里 ⇒ 不报（保守口径：宁可漏报）', function () {
    const vfs = {};
    vfs[PROBE] = '// \\u8bf4\\u660e\\uff1a`zzFakeCall(x)`\nconst note = "`zzFakeCall(` \\u4e0d\\u5b58\\u5728";\n';
    const r = scan({ vfs: vfs, files: PF.productFiles().concat([PROBE]) });
    assert.strictEqual(r.ghosts.indexOf('zzFakeCall'), -1, '字符串里出现也当成实现了（保守口径失效）');
  });
  ok('C4 反控：另一个文件实现了它 ⇒ 跨文件看，仍不报', function () {
    const vfs = {};
    vfs[PROBE] = '// \\u8bf4\\u660e\\uff1a`zzFakeCall(x)`\n';
    vfs['engines/zz-gns-impl.js'] = 'function zzFakeCall() { return 2; }\n';
    const r = scan({ vfs: vfs, files: PF.productFiles().concat([PROBE, 'engines/zz-gns-impl.js']) });
    assert.strictEqual(r.ghosts.indexOf('zzFakeCall'), -1, '跨文件实现没被看见');
  });
  ok('C5 反控：两个不同文件各点名一个 ⇒ 各自都报（不是只看最后一个）', function () {
    const vfs = {};
    vfs[PROBE] = '// `zzCallOne(x)`\n';
    vfs['engines/zz-gns-two.js'] = '// `zzCallTwo(x)`\n';
    const r = scan({ vfs: vfs, files: PF.productFiles().concat([PROBE, 'engines/zz-gns-two.js']) });
    assert.ok(r.ghosts.indexOf('zzCallOne') >= 0 && r.ghosts.indexOf('zzCallTwo') >= 0,
      '实报：' + r.ghosts.join(','));
  });

  // ═══════════ D 零写 ═══════════
  ok('D1 扫描只读：12 个归属文件的内容哈希在扫描前后一致', function () {
    const crypto = require('crypto');
    const rels = Object.keys(GHOSTS).map(function (id) { return GHOSTS[id].file; });
    const uniq = Array.from(new Set(rels));
    const before = uniq.map(function (rel) {
      return crypto.createHash('sha1').update(fs.readFileSync(path.join(BASE, rel))).digest('hex');
    });
    scan({});
    const after = uniq.map(function (rel) {
      return crypto.createHash('sha1').update(fs.readFileSync(path.join(BASE, rel))).digest('hex');
    });
    assert.deepStrictEqual(after, before, '扫描改了文件');
  });
  ok('D2 本面不产生任何账本文件（连 --update 都没有）', function () {
    const self = fs.readFileSync(__filename, 'utf8');
    // 注意：此处**不能**把要查的字面串直接写进源码 —— 它会找到自己（q1 锁里记过这个坑）。
    //   所以用等价的正则形态：源码里出现的是「带转义点的模式」，而它自身不命中自己。
    assert.strictEqual(/fs\s*\.\s*(?:write|append)FileSync\s*\(/.test(self), false, '本文件不该写盘');
    assert.strictEqual(/require\s*\(\s*['"]child_process/.test(self), false, '本面不起子进程');
  });
  ok('D3 裁决文档在位：五个名字 + 两类分界 + 两条未关的触发器 + 复算命令', function () {
    const src = fs.readFileSync(path.join(BASE, 'docs/PROMISE_FACE_ADJUDICATION.md'), 'utf8');
    ['onCommit', 'effectPending', 'undoTurns', 'exclusive', 'sizeAll'].forEach(function (id) {
      assert.ok(src.indexOf(id) >= 0, id + ' 不在裁决文档里');
    });
    assert.ok(src.indexOf('改判触发器') >= 0, '缺改判触发器');
    assert.ok(src.indexOf('node tests/promise-face-v2605.js') >= 0, '缺复算命令');
  });

  // ═══════════ E 读数出口 ═══════════
  ok('E1 一行读数含「文件面 / 点名 / 幽灵 / 真缺口」四个数', function () {
    const c = {};
    KINDS.forEach(function (k) { c[k] = 0; });
    Object.keys(GHOSTS).forEach(function (id) { c[GHOSTS[id].kind] += 1; });
    const line = '点名面：产品文件 ' + LIVE.files + ' · 注释点名 ' + LIVE.ids.length +
      ' · 幽灵 ' + LIVE.ghosts.length + ' · 真缺口 ' + c.claim + ' · 已关 ' + Object.keys(RESOLVED).length +
      '（history ' + c.history + ' / testSide ' + c.testSide + ' / 占位 ' + c.placeholder + '）';
    assert.ok(/产品文件 \d+/.test(line) && /幽灵 9/.test(line) && /真缺口 2/.test(line) && /已关 5/.test(line), line);
  });
  ok('E2 每条 claim 都能报出 file:line（读数要能带人去现场）', function () {
    Object.keys(GHOSTS).forEach(function (id) {
      if (GHOSTS[id].kind !== 'claim') return;
      const own = (LIVE.owners[id] || []).filter(function (o) { return o.file === GHOSTS[id].file; });
      assert.ok(own.length > 0 && own[0].line > 0, id + ' 报不出行号');
    });
  });

  // ═══════════ F 口径边界（如实登记）═══════════
  ok('F1 归类表里不出现 tests/ 或 tools/ 路径（扫描面纯产品面）', function () {
    Object.keys(GHOSTS).forEach(function (id) {
      assert.ok(!/^(tests|tools)\//.test(GHOSTS[id].file), id + ' 指向扫描面外：' + GHOSTS[id].file);
    });
  });
  ok('F2 裸反引号名不收（口径收窄是可复算的，不是说法）', function () {
    const src = '// \\u53ea\\u5199\\u540d\\u5b57\\uff1a`zzBareName` \\u4e0d\\u5e26\\u62ec\\u53f7\n';
    assert.deepStrictEqual(candidatesOf(src), [], '裸名被收了');
  });

  // ── 收尾读数 ────────────────────────────────────────────────────────
  (function summary() {
    const c = {};
    KINDS.forEach(function (k) { c[k] = 0; });
    Object.keys(GHOSTS).forEach(function (id) { c[GHOSTS[id].kind] += 1; });
    console.log('');
    console.log('\u70b9\u540d\u9762\uff1a\u4ea7\u54c1\u6587\u4ef6 ' + LIVE.files +
      ' \u00b7 \u6ce8\u91ca\u70b9\u540d ' + LIVE.ids.length +
      ' \u00b7 \u5e7d\u7075 ' + LIVE.ghosts.length +
      ' \u00b7 \u771f\u7f3a\u53e3 ' + c.claim + ' \u00b7 \u5df2\u5173 ' + Object.keys(RESOLVED).length +
      '\uff08history ' + c.history + ' / testSide ' + c.testSide + ' / \u5360\u4f4d ' + c.placeholder + '\uff09');
    Object.keys(GHOSTS).forEach(function (id) {
      if (GHOSTS[id].kind !== 'claim') return;
      const own = (LIVE.owners[id] || []).filter(function (o) { return o.file === GHOSTS[id].file; })[0];
      console.log('  \u00b7 ' + id + ' \t' + GHOSTS[id].file + ':' + (own ? own.line : '?') + '  \u2014\u2014 ' + GHOSTS[id].why);
    });
  })();

  console.log('\nGNS-1 专锁: ' + (fail ? 'FAIL ' + pass + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
})();
