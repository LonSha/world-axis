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
    fsec: { kind: 'claim', file: 'ui/panel-fold.js',
      why: '两处注释把面板折叠段的渲染口写成 fsec(page, sec, headerHtml, bodyHtml)，而本文件导出的是 foldSec 一族' },
    onCommit: { kind: 'claim', file: 'core/commit.js',
      why: 'chain(opt) 的 JSDoc 写着 onCommit(scope) 在链事务提交之后调用、并据此把邀约漏账记进 faults；而 opt.onCommit 在代码面一次没读' },
    effectPending: { kind: 'claim', file: 'core/commit.js',
      why: '注释说「effectPending() 读它」，而 commit 的导出表里没有这个读口 —— 副作用队列有写无读' },
    undoTurns: { kind: 'claim', file: 'engines/source-reconcile.js',
      why: '注释把 timeline.js 描述成「proposeTurn 纯函数事务 / undoTurns(fromIndex)」，而 timeline 的导出表里没有 undo 面' },
    sizeAll: { kind: 'claim', file: 'engines/storage-forecast.js',
      why: '注释说 totalBytes 是 sizeAll() 那支的名字，而 store 的导出表里没有 sizeAll' },
    exclusive: { kind: 'claim', file: 'engines/defer-token.js',
      why: '注释说传输操作「再经 exclusive() 串进一条尾链」，全仓没有这个函数 —— 被借喻的那台已改名或消失' },
    devSettingsHtml: { kind: 'claim', file: 'engines/tool-diag.js',
      why: '注释说设置页有两个互斥分支 playerSettingsHtml() / devSettingsHtml()，前者存在、后者不存在' },
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
  ok('B3 四类计数 = claim 7 / history 4 / testSide 1 / placeholder 2', function () {
    const c = {};
    KINDS.forEach(function (k) { c[k] = 0; });
    Object.keys(GHOSTS).forEach(function (id) { c[GHOSTS[id].kind] += 1; });
    assert.deepStrictEqual(c, { claim: 7, history: 4, testSide: 1, placeholder: 2 });
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

  // ═══════════ E 读数出口 ═══════════
  ok('E1 一行读数含「文件面 / 点名 / 幽灵 / 真缺口」四个数', function () {
    const c = {};
    KINDS.forEach(function (k) { c[k] = 0; });
    Object.keys(GHOSTS).forEach(function (id) { c[GHOSTS[id].kind] += 1; });
    const line = '点名面：产品文件 ' + LIVE.files + ' · 注释点名 ' + LIVE.ids.length +
      ' · 幽灵 ' + LIVE.ghosts.length + ' · 真缺口 ' + c.claim +
      '（history ' + c.history + ' / testSide ' + c.testSide + ' / 占位 ' + c.placeholder + '）';
    assert.ok(/产品文件 \d+/.test(line) && /幽灵 14/.test(line) && /真缺口 7/.test(line), line);
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
      ' \u00b7 \u771f\u7f3a\u53e3 ' + c.claim +
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
