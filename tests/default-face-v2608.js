/**
 * WorldAxis tests/default-face-v2608.js (v2.608.0) — 默认值声明面（DFC-1）
 *
 * ── 它治什么（缺口）────────────────────────────────
 *   R278 在 `engines/calendar-custom.js` 上碰到一对相反的话：头部边界写「总开关默认关闭」，
 *   而 `const DEF = { enabled: true, ... }` —— 且 `settings()` 就是从 DEF 派生的
 *   （`normalize` 用 `reg.def` 填缺，见 core/settings-bus.js:980-998）。
 *   那时它被当成**一台引擎的小毛病**记进日志。本面把同一句话在**全库**量了一遍：
 *   这不是一台引擎的毛病，是 **100 台引擎共用的一句过期话**。
 *
 * ── 结论（v2.608.0 已关）─────────────────────────
 *   `git log -S'enabled: false'` 给出唯一答案：v2.412.0 的**全开策略**（提交 35d2c93）
 *   一次性把 203 台引擎的 `DEF.enabled` 从 false 翻成 true（「玩家装好即见全量世界，
 *   不再需要档位点亮」）。本面点名的 100 台**全部**在那笔提交里。
 *   所以错的不是默认值、也不是那句子句（「关闭时 X 报 disabled」到今天仍然成立），
 *   而是**「默认关闭」这四个字落后于一次产品决策**。改法只有一种：把四个字改成
 *   「默认开启」。零行为影响（只动注释行的这一处词）。
 *   判决与复算方式写在 `docs/DEFAULT_FACE_ADJUDICATION.md`。
 *
 * ── 口径（五条，全部是收窄式）──────────────────────────
 *   ① **只认 `const DEF = { ... enabled: <bool> ... }`**：这是设置总线的统一形态。
 *      没有 DEF 的引擎（默认写在 `base` 常量里）**不在本面**。
 *   ② **只认 `settings()` 真从 DEF 派生**：`function settings() { ... DEF ... }`。
 *      有引擎 DEF.enabled 是 true 而默认取值走另一个 base 常量，那就不是矛盾。
 *   ③ **只认注释行里的声明**（`//` 或 `*` 开头），且落在 DEF 声明行**上方 80 行内**。
 *      正文里写一句「默认关闭」不算声明。
 *   ④ **双向**：def=true 而声明「默认关闭」、def=false 而声明「默认开启」，两个方向都报。
 *   ⑤ **具名子开关不算**：「总开关 `weatherLink` 默认关闭」说的是子开关（engines/hazard.js:16），
 *      与出厂默认无关。判据是「总开关」后面紧跟引号/反引号即视为具名。
 *
 * ── 这一面不做什么（写清楚，免得被读成「已修」）───────────────
 *   1 **不改默认值**。100 台的 `enabled: true` 是 v2.412.0 的产品决策，本轮一字未动；
 *      改的是文档，不是行为。
 *   2 **不删注释**。声明句必须留着（B2 反过来钉这一条）：删掉等于把「关掉时会怎样」的契约
 *      一起删了 —— 那比过期更糟。
 *   3 **不放宽名单**：FIXED 只减不增，且每一台都要仍然「说得出话」（B2/B3/B4）。
 *
 * 跑：`node tests/default-face-v2608.js`
 */
(function () {
  'use strict';
  const assert = require('assert');
  const fs = require('fs');
  const path = require('path');
  const BASE = path.join(__dirname, '..');
  const PF = require('./product-files.js');

  let pass = 0, fail = 0;
  function ok(name, fn) {
    try { fn(); pass++; console.log('  \u2713 ' + name); }
    catch (e) { fail++; console.log('  X ' + name + '\n      ' + (e && e.message)); }
  }

  const DEF_RE = /const DEF\s*=\s*\{/;
  const EN_RE = /enabled\s*:\s*(true|false)/;
  const DECL_RE = /\u9ed8\u8ba4(\u5173\u95ed|\u5173\u7740|\u4e0d\u5f00|\u5f00\u542f|\u6253\u5f00|\u5f00\u7740)/;
  const OFF_WORDS = ['\u9ed8\u8ba4\u5173\u95ed', '\u9ed8\u8ba4\u5173\u7740', '\u9ed8\u8ba4\u4e0d\u5f00'];
  const SUB_RE = /\u603b\u5f00\u5173\s*[`'"]/;
  const WINDOW = 80;

  /** 扫一份（纯函数；vfs 供负控制）。 */
  function scan(opt) {
    const o = opt || {};
    const vfs = o.vfs || null;
    const files = o.files || PF.productFiles();
    const rows = [];
    let read = 0;
    files.forEach(function (rel) {
      let src = null;
      if (vfs && Object.prototype.hasOwnProperty.call(vfs, rel)) src = vfs[rel];
      else { try { src = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { src = null; } }
      if (typeof src !== 'string') return;
      read += 1;
      const L = src.split('\n');
      let at = -1, def = null;
      for (let i = 0; i < L.length; i += 1) {
        const t = L[i].trim();
        if (t.indexOf('*') === 0 || t.indexOf('//') === 0) continue;
        if (!DEF_RE.test(L[i])) continue;
        // DEF 可能是多行对象：enabled 允许落在声明行之后 7 行内（本仓有 12 个这样的写法）
        let m = EN_RE.exec(L[i]);
        for (let k = i + 1; !m && k < i + 8 && k < L.length; k += 1) m = EN_RE.exec(L[k]);
        if (!m) break;
        at = i; def = m[1]; break;
      }
      if (at < 0) return;
      // settings() 只要在其后 600 字内碰到 DEF 就算派生（多行函数体 / 箭头函数都能认）
      const si = src.indexOf('function settings');
      const derives = si >= 0 && src.slice(si, si + 600).indexOf('DEF') >= 0;
      let claim = null, claimLine = 0;
      for (let j = at - 1; j >= 0 && j > at - WINDOW; j -= 1) {
        const t = L[j].trim();
        if (!(t.indexOf('*') === 0 || t.indexOf('//') === 0)) continue;
        if (SUB_RE.test(t)) continue;
        const m = DECL_RE.exec(t);
        if (!m) continue;
        claim = OFF_WORDS.indexOf(m[0]) >= 0 ? 'off' : 'on';
        claimLine = j + 1; break;
      }
      rows.push({ file: rel, line: at + 1, def: def, derives: derives, claim: claim, claimLine: claimLine });
    });
    const contra = rows.filter(function (r) {
      return r.derives && ((r.def === 'true' && r.claim === 'off') || (r.def === 'false' && r.claim === 'on'));
    }).map(function (r) { return r.file; }).sort();
    return { files: files.length, read: read, rows: rows, contra: contra };
  }

  /** 现场矛盾名单（v2.608.0 全量关闭后应为空；只减不增）。 */
  const BASE_CONTRA = [];

  /** 已校正的 127 台：每一台都必须仍然「说得出话」（B2/B3/B4 逐个复算）。 */
  const FIXED = [
    'engines/act.js',
    'engines/activity.js',
    'engines/affect.js',
    'engines/appearance.js',
    'engines/archive-hide.js',
    'engines/auto-hide.js',
    'engines/beast-bond.js',
    'engines/beat-ledger.js',
    'engines/beat-mask.js',
    'engines/beat-report.js',
    'engines/binding.js',
    'engines/bonds.js',
    'engines/calendar-custom.js',
    'engines/causal.js',
    'engines/chrono.js',
    'engines/community-note.js',
    'engines/compact-timing.js',
    'engines/contest.js',
    'engines/deep-clean.js',
    'engines/difficulty.js',
    'engines/dream-settle.js',
    'engines/economy.js',
    'engines/elsewhere.js',
    'engines/enigma.js',
    'engines/ensemble.js',
    'engines/ephemeral-scrub.js',
    'engines/era-cycle.js',
    'engines/events.js',
    'engines/faction-graph.js',
    'engines/family.js',
    'engines/floor-snapshot.js',
    'engines/followup-gate.js',
    'engines/fondness.js',
    'engines/foreshadow.js',
    'engines/gear.js',
    'engines/gen-gate.js',
    'engines/hazard.js',
    'engines/identity-match.js',
    'engines/inst.js',
    'engines/intel.js',
    'engines/karma.js',
    'engines/ladder.js',
    'engines/length-policy.js',
    'engines/life.js',
    'engines/longline.js',
    'engines/marginal.js',
    'engines/masks.js',
    'engines/memory-tiers.js',
    'engines/mend.js',
    'engines/motif.js',
    'engines/noesis.js',
    'engines/observation-projection.js',
    'engines/observe-slice.js',
    'engines/org.js',
    'engines/outline-inject.js',
    'engines/parallel-events.js',
    'engines/perspective-lock.js',
    'engines/plan-audit.js',
    'engines/plan-roster.js',
    'engines/plan.js',
    'engines/polish.js',
    'engines/power-anchor.js',
    'engines/prefilter-gate.js',
    'engines/preset-world.js',
    'engines/probe.js',
    'engines/production.js',
    'engines/quota.js',
    'engines/reasoning.js',
    'engines/redact-layer.js',
    'engines/refine.js',
    'engines/region.js',
    'engines/rehearse.js',
    'engines/relation-graph.js',
    'engines/request-viewer.js',
    'engines/research.js',
    'engines/rewriter.js',
    'engines/rhythm-loop.js',
    'engines/ruling.js',
    'engines/rumor.js',
    'engines/scene-budget.js',
    'engines/session.js',
    'engines/shadow.js',
    'engines/solo-voice.js',
    'engines/spotlight.js',
    'engines/stage.js',
    'engines/stale-guard.js',
    'engines/stall.js',
    'engines/story-tone.js',
    'engines/storyclock.js',
    'engines/survival.js',
    'engines/temperament.js',
    'engines/tempo.js',
    'engines/temporal-lock.js',
    'engines/threads.js',
    'engines/tolerance.js',
    'engines/training.js',
    'engines/userlock.js',
    'engines/vitals.js',
    'engines/warrant.js',
    'engines/word-budget.js',
    'engines/world-clock.js',    'engines/body-anatomy.js',
    'engines/branch-continuity.js',
    'engines/canon.js',
    'engines/chat-recycle.js',
    'engines/coop.js',
    'engines/credit-ledger.js',
    'engines/defer-token.js',
    'engines/director.js',
    'engines/elapsed-evidence.js',
    'engines/fact-continuity.js',
    'engines/gen-timing.js',
    'engines/interest-face.js',
    'engines/liaison.js',
    'engines/lifeline.js',
    'engines/lingqi.js',
    'engines/memory-relay.js',
    'engines/mood-glide.js',
    'engines/one-shot-mod.js',
    'engines/reading-bookmark.js',
    'engines/rehearsal.js',
    'engines/sediment.js',
    'engines/source-reconcile.js',
    'engines/stage-session.js',
    'engines/success-grade.js',
    'engines/summarizer-adapter.js',
    'engines/weighted-draw.js',
  ];

  const LIVE = scan({});
  const byFile = {};
  LIVE.rows.forEach(function (r) { byFile[r.file] = r; });
  const alignedOn = LIVE.rows.filter(function (r) { return r.derives && r.def === 'true' && r.claim === 'on'; });

  // ══ A 扫描面 ══
  ok('A1 产品文件 ≥ 600、真读到 ≥ 600', function () {
    assert.ok(LIVE.files >= 600, '文件面 ' + LIVE.files);
    assert.ok(LIVE.read >= 600, '真读到 ' + LIVE.read);
  });
  ok('A2 带 DEF 表的文件 ≥ 200、其中 settings() 从 DEF 派生的 ≥ 100', function () {
    assert.ok(LIVE.rows.length >= 200, 'DEF 表数 ' + LIVE.rows.length);
    const d = LIVE.rows.filter(function (r) { return r.derives; }).length;
    assert.ok(d >= 100, '派生数 ' + d);
  });
  ok('A3 扫描面只是产品面（与 product-files 同真源）', function () {
    assert.strictEqual(LIVE.files, PF.productFiles().length);
  });

  // ══ B 已关闭面（点名 100 台）══
  ok('B1 现场矛盾与 BASE 两向相等（此刻两边都空）', function () {
    const live = LIVE.contra.slice().sort();
    const tab = BASE_CONTRA.slice().sort();
    assert.deepStrictEqual(live, tab,
      '现场多出：[' + live.filter(function (x) { return tab.indexOf(x) < 0; }).join(',') +
      ']，表里过期：[' + tab.filter(function (x) { return live.indexOf(x) < 0; }).join(',') + ']');
  });
  ok('B2 点名 127 台：每台的声明行现在写「默认开启」（不是把注释删了）', function () {
    const bad = FIXED.filter(function (f) {
      const r = byFile[f]; return !r || r.claim !== 'on';
    });
    assert.deepStrictEqual(bad, [], '这些文件找不到「默认开启」的声明行：' + bad.join(','));
    assert.strictEqual(alignedOn.length >= FIXED.length, true, '同向声明数 ' + alignedOn.length);
  });
  ok('B3 点名 127 台：DEF.enabled 仍是 true（翻回 false 就把声明变成新的反话）', function () {
    const bad = FIXED.filter(function (f) { const r = byFile[f]; return !r || r.def !== 'true'; });
    assert.deepStrictEqual(bad, [], '这些文件的 DEF.enabled 不是 true：' + bad.join(','));
  });
  ok('B4 点名 127 台：声明行仍在 DEF 上方 80 行内（面没被搬走）', function () {
    const bad = FIXED.filter(function (f) {
      const r = byFile[f];
      return !r || !(r.claimLine > 0 && r.claimLine < r.line && r.line - r.claimLine <= WINDOW);
    });
    assert.deepStrictEqual(bad, [], '这些文件的声明行不在窗口内：' + bad.join(','));
  });
  ok('B5 点名 127 台：settings() 仍从 DEF 派生（没改成另一个 base 常量把面绕开）', function () {
    const bad = FIXED.filter(function (f) { const r = byFile[f]; return !r || r.derives !== true; });
    assert.deepStrictEqual(bad, [], '这些文件的 settings() 不再从 DEF 派生：' + bad.join(','));
  });
  ok('B6 名单形态：全部落在 engines/ 面、无重复、条数就是 127', function () {
    assert.strictEqual(FIXED.length, 127, '名单条数 ' + FIXED.length);
    assert.strictEqual(new Set(FIXED).size, 127, '名单有重复');
    const bad = FIXED.filter(function (f) { return !/^engines\/[a-z0-9-]+\.js$/.test(f); });
    assert.deepStrictEqual(bad, [], '不在 engines 面：' + bad.join(','));
  });

  // ══ C 两向自证 ══
  const PROBE = 'engines/zz-dfc-probe.js';
  function one(text) { const v = {}; v[PROBE] = text; return scan({ vfs: v, files: [PROBE] }); }
  ok('C1 合成站点：声明关闭而 def=true ⇒ 必报', function () {
    assert.deepStrictEqual(one('// 总开关默认关闭。\nconst DEF = { enabled: true };\nfunction settings() { return DEF; }\n').contra, [PROBE]);
  });
  ok('C2 反控：声明开启而 def=true ⇒ 不报（不是见声明就报）', function () {
    assert.deepStrictEqual(one('// 总开关默认开启。\nconst DEF = { enabled: true };\nfunction settings() { return DEF; }\n').contra, []);
  });
  ok('C3 反向自证：声明开启而 def=false ⇒ 必报（另一个方向也真的会响）', function () {
    assert.deepStrictEqual(one('// 总开关默认开启。\nconst DEF = { enabled: false };\nfunction settings() { return DEF; }\n').contra, [PROBE]);
  });
  ok('C4 反控：没有 DEF 表 ⇒ 不报（base 常量在管默认的引擎不在本面）', function () {
    assert.deepStrictEqual(one('// 总开关默认关闭。\nconst base = { enabled: false };\nfunction settings() { return base; }\n').contra, []);
  });
  ok('C5 反控：DEF 在、但 settings() 不用 DEF ⇒ 不报', function () {
    assert.deepStrictEqual(one('// 总开关默认关闭。\nconst DEF = { enabled: true };\nfunction settings() { return { enabled: false }; }\n').contra, []);
  });
  ok('C6 反控：声明写在正文（非注释行）⇒ 不报', function () {
    assert.deepStrictEqual(one("const note = '默认关闭';\nconst DEF = { enabled: true };\nfunction settings() { return DEF; }\n").contra, []);
  });
  ok('C7 反控：具名子开关的声明 ⇒ 不报（总开关 `x` 默认关闭 说的是子开关）', function () {
    assert.deepStrictEqual(one('*   总开关 `weatherLink` 默认关闭：不打开时拒收。\nconst DEF = { enabled: true };\nfunction settings() { return DEF; }\n').contra, []);
  });

  // ══ D 零写 ══
  ok('D1 扫描只读：127 个归属文件的哈希在扫描前后一致', function () {
    const crypto = require('crypto');
    const hash = function () {
      return FIXED.map(function (rel) { return crypto.createHash('sha1').update(fs.readFileSync(path.join(BASE, rel))).digest('hex'); });
    };
    const before = hash(); scan({}); const after = hash();
    assert.deepStrictEqual(after, before, '扫描改了文件');
  });
  ok('D2 本不写盘、不起子进程、不反向改产品文件', function () {
    const self = fs.readFileSync(__filename, 'utf8');
    assert.strictEqual(/fs\s*\.\s*(?:write|append)FileSync\s*\(/.test(self), false, '不该写盘');
    assert.strictEqual(/require\s*\(\s*['"]child_process/.test(self), false, '不该起子进程');
  });
  ok('D3 裁决文档在位：含 git 证据与复算命令', function () {
    const p = path.join(BASE, 'docs', 'DEFAULT_FACE_ADJUDICATION.md');
    assert.ok(fs.existsSync(p), 'docs/DEFAULT_FACE_ADJUDICATION.md 不存在');
    const doc = fs.readFileSync(p, 'utf8');
    assert.ok(doc.indexOf('35d2c93') >= 0, '文档里没有 v2.412.0 的提交号（证据不可复核）');
    assert.ok(doc.indexOf('node tests/default-face-v2608.js') >= 0, '文档里没有复算命令');
    assert.ok(doc.indexOf(String(FIXED.length)) >= 0, '文档里没有受影响的台数');
  });

  // ══ E 读数出口 ══
  ok('E1 一行读数含四个数（DEF 表 / 派生 / 矛盾 / 已校正）', function () {
    const d = LIVE.rows.filter(function (r) { return r.derives; }).length;
    const line = 'DEF 面：表 ' + LIVE.rows.length + ' · 派生 ' + d + ' · 矛盾 ' + LIVE.contra.length + ' · 已校正 ' + FIXED.length;
    assert.ok(/\u8868 \d+/.test(line) && /\u77db\u76fe 0/.test(line) && /\u5df2\u6821\u6b63 127/.test(line), line);
  });
  ok('E2 同向声明数 ≥ 127（读数要能看见这 127 台现在站在哪一边）', function () {
    assert.ok(alignedOn.length >= 127, '同向声明数 ' + alignedOn.length);
  });

  // ══ F 口径边界 ══
  ok('F1 窗口口径：DEF 上方 80 行之外的声明不认', function () {
    const pad = new Array(WINDOW + 2).join('\n');
    const src = '// 总开关默认关闭。' + pad + 'const DEF = { enabled: true };\nfunction settings() { return DEF; }\n';
    assert.deepStrictEqual(one(src).contra, []);
  });
  ok('F2 只认 DEF 里的 enabled：别的对象上的 enabled 不算', function () {
    const src = '// 总开关默认关闭。\nconst other = { enabled: true };\nconst DEF = { maxKeep: 8 };\nfunction settings() { return DEF; }\n';
    assert.deepStrictEqual(one(src).contra, []);
  });
  ok('F3 不替人改默认值：只报不写、名单只减不增', function () {
    assert.strictEqual(new Set(FIXED).size, FIXED.length);
    assert.strictEqual(BASE_CONTRA.length, 0, '关闭态下 BASE 必须为空（新出现一条即红）');
  });

  // ── 收尾读数 ──
  (function summary() {
    const d = LIVE.rows.filter(function (r) { return r.derives; }).length;
    console.log('');
    console.log('DEF 面：表 ' + LIVE.rows.length + ' · settings() 派生 ' + d +
      ' · 矛盾 ' + LIVE.contra.length + ' · 已校正 ' + FIXED.length +
      ' · 同向声明 ' + alignedOn.length);
    LIVE.contra.forEach(function (f) { console.log('  · 未登记矛盾：' + f); });
  })();

  console.log('\nDFC-1 专锁: ' + (fail ? 'FAIL ' + pass + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
})();
