/**
 * WorldAxis tests/path-face-v2609.js (v2.609.0) — 注释指路面（PTH-1）
 *
 * ── 它治什么（缺口）────────────────────────────────
 *   注释里写 `engines/xxx.js`、`core/yyy.js`、`docs/zzz.md`，读者就该能找得到那个文件。
 *   本面把全库注释里的**路径引用**量一遍：1604 处指向真文件、12 处指向**上游项目**、
 *   1 处是 `xxx` 占位示例、2 处是历史（已删/从未存在）、0 处指向一个本仓本该有却不存在的文件
 *   —— 最后这个 0 是本轮改出来的（下面四处点名）。
 *
 *   改动极小但性质干净：三处把错名改成真名，一处补「已删除」标记。
 *   `core/replay.js` → `core/rand.js` 的 `replay`（「回放台」是旧称，那文件从未存在）；
 *   `engines/continuation.js` → `engines/player-archive.js`（18 个续接拒收码的发射方）；
 *   `engines/inspector.js` → `engines/inject-inspector.js`（v2.20.0 删除后职责由后者承接）。
 *
 * ── 口径（五条，全部是收窄式）──────────────────────────
 *   ① **只认注释行**（`//` 或 `*` 开头）里带**目录前缀**的路径（engines|core|ui|render|tools|plans|docs）。
 *      裸文件名（`rand.js`）不算 —— 它既可能是本仓也可能是上游，判不出就不报。
 *   ② **在位的直接放过**：文件存在 ⇒ 这条不是「指路」问题。
 *   ③ **上游引用要有主体词**：同一段（±2 行）里冇项目名（nekotools / st-beat-tracker /
 *      pilulier / TaihouKai …）就是合格的缝合引用。本仓的 `缝合来源：` 段一直这么做，
 *      本面把它锁住 —— **否则下一步就会有人把上游路径当成本仓缺口去「修」**。
 *   ④ **占位示例不报**：`xxx` / `yyy` / `zzz` 形态是文档里的举例。
 *   ⑤ **历史引用不报**：同一段里有「已删除 / 已移除 / 从未存在 / 曾」就是历史叙述。
 *      但**历史也要标**——这就是本轮四处改动里两处的由来。
 *
 * ── 这一面不做什么 ──────────────────────────────
 *   1 不改上游项目的任何东西，也不把它们的文件拷进来。
 *   2 不把「历史引用」改成「删掉这句话」：那句注释记的是当时的事实。
 *   3 不把裸文件名纳入（判不出就不报，宁可窄）。
 *
 * 跑：`node tests/path-face-v2609.js`
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

  const DIRS = '(?:engines|core|ui|render|tools|plans|docs)';
  const REF_RE = new RegExp('\\b(' + DIRS + '\\/[A-Za-z0-9_.-]+\\.(?:js|json|md))', 'g');
  const PLACE_RE = /\b(?:xxx|yyy|zzz)\b/;
  const HIST_RE = /\u5df2\u5220\u9664|\u5df2\u79fb\u9664|\u4ece\u672a\u5b58\u5728|\u66fe/;
  const TOKENS = ['nekotools', 'st-beat-tracker', 'pilulier', 'ceshihaox-dotcom',
    'TaihouKai', 'SillyTavern-CanonEngine', 'DlSNlGHT', 'dsh-toy', 'npc-life'];

  /** 扫一份（纯函数；vfs 供负控制）。 */
  function scan(opt) {
    const o = opt || {};
    const vfs = o.vfs || null;
    const files = o.files || PF.productFiles();
    const present = [], upstream = [], placeholder = [], history = [], stale = [];
    files.forEach(function (rel) {
      let src = null;
      if (vfs && Object.prototype.hasOwnProperty.call(vfs, rel)) src = vfs[rel];
      else { try { src = fs.readFileSync(path.join(BASE, rel), 'utf8'); } catch (e) { src = null; } }
      if (typeof src !== 'string') return;
      const L = src.split('\n');
      for (let i = 0; i < L.length; i += 1) {
        const t = L[i].trim();
        if (!(t.indexOf('*') === 0 || t.indexOf('//') === 0)) continue;
        REF_RE.lastIndex = 0;
        let m;
        while ((m = REF_RE.exec(L[i])) !== null) {
          const ref = m[1];
          const site = rel + ':' + (i + 1);
          const exists = (vfs && Object.prototype.hasOwnProperty.call(vfs, ref))
            || fs.existsSync(path.join(BASE, ref));
          if (exists) { present.push({ site: site, ref: ref }); continue; }
          const win = L.slice(Math.max(0, i - 2), i + 3).join('\n');
          if (PLACE_RE.test(L[i])) { placeholder.push({ site: site, ref: ref }); continue; }
          if (TOKENS.some(function (k) { return win.indexOf(k) >= 0; })) { upstream.push({ site: site, ref: ref, line: i + 1 }); continue; }
          if (HIST_RE.test(win)) { history.push({ site: site, ref: ref }); continue; }
          stale.push({ site: site, ref: ref, file: rel, line: i + 1 });
        }
      }
    });
    return { files: files.length, present: present, upstream: upstream,
      placeholder: placeholder, history: history, stale: stale,
      total: present.length + upstream.length + placeholder.length + history.length + stale.length };
  }

  /** 现场缺失名单（已清空：四处已校正；只减不增）。 */
  const BASE_STALE = [];

  /** 本轮校正的四处（每处都要仍然「指得出去」）。 */
  const FIXED = [
    ['core/clock.js', 49, 'core/replay.js', 'history'],
    ['engines/reject-recovery-tables.js', 890, 'engines/player-archive.js', 'present'],
    ['engines/inspector-state.js', 5, 'engines/inject-inspector.js', 'present'],
    ['index.js', 2261, 'engines/inspector.js', 'history'],  ];

  /** 已知上游引用（12 条，每条必须带主体词；只减不增）。 */
  const UPSTREAM = [
    ['engines/ephemeral-scrub.js', 24, 'docs/burn-after-reading.md', 'pilulier'],
    ['engines/preset-world.js', 11, 'docs/storybeat-engine.md', 'st-beat-tracker'],
    ['engines/retrieval.js', 20, 'docs/WORLD_STATE_CONTEXT_CONTRACT.md', 'TaihouKai'],
    ['engines/rhythm-loop.js', 12, 'docs/storybeat-engine.md', 'st-beat-tracker'],
    ['engines/mixed-index.js', 4, 'core/worldindex.js', 'nekotools'],
    ['engines/api-vault.js', 4, 'core/apivault.js', 'nekotools'],
    ['engines/stream-gate.js', 4, 'core/streamgate.js', 'nekotools'],
    ['engines/stream-gate.js', 4, 'core/hooks.js', 'nekotools'],
    ['engines/green-keys.js', 4, 'core/worldkeys.js', 'nekotools'],
    ['engines/write-serial.js', 4, 'core/worldcfg.js', 'nekotools'],
    ['engines/floor-hide.js', 4, 'core/st_bridge.js', 'nekotools'],
    ['engines/slot-format.js', 4, 'core/worldfmt.js', 'nekotools'],
  ];

  const LIVE = scan({});
  const staleSites = LIVE.stale.map(function (r) { return r.site; });
  const lineOf = function (rel, ln) {
    try { return fs.readFileSync(path.join(BASE, rel), 'utf8').split('\n')[ln - 1] || ''; }
    catch (e) { return ''; }
  };

  // ══ A 扫描面 ══
  ok('A1 产品文件 ≥ 600、与 product-files 同真源', function () {
    assert.ok(LIVE.files >= 600, '文件面 ' + LIVE.files);
    assert.strictEqual(LIVE.files, PF.productFiles().length);
  });
  ok('A2 路径引用 ≥ 1200（现场 1600+，零命中会恒真）', function () {
    assert.ok(LIVE.total >= 1200, '引用总数 ' + LIVE.total);
  });
  ok('A3 在位率极高：present ≥ 1500（本面不是靠「找不到」吃饭的）', function () {
    assert.ok(LIVE.present.length >= 1500, '在位 ' + LIVE.present.length);
  });

  // ══ B 归类与台账 ══
  ok('B1 现场缺失与 BASE 两向相等（新出现=未登记，已修=表过期）', function () {
    assert.deepStrictEqual(staleSites.slice().sort(), BASE_STALE.slice().sort(),
      '现场缺失：[' + staleSites.join(',') + ']');
  });
  ok('B2 四处校正逐个复算：要么指向真文件，要么带「已删除/从未存在」标记', function () {
    FIXED.forEach(function (row) {
      const rel = row[0], ln = row[1], ref = row[2], kind = row[3];
      assert.strictEqual(staleSites.indexOf(rel + ':' + ln), -1, rel + ':' + ln + ' 仍在缺失名单');
      const line = lineOf(rel, ln);
      assert.ok(line.indexOf(ref) >= 0, rel + ':' + ln + ' 行内找不到 ' + ref);
      if (kind === 'present') {
        assert.ok(fs.existsSync(path.join(BASE, ref)), ref + ' 不存在（改了名字但名字也不对）');
      } else {
        const win = [lineOf(rel, ln - 2), lineOf(rel, ln - 1), line, lineOf(rel, ln + 1), lineOf(rel, ln + 2)].join('\n');
        assert.ok(HIST_RE.test(win), rel + ':' + ln + ' 是历史引用但没标（已删除/从未存在）');
      }
    });
  });
  ok('B3 12 条上游引用：仍在原位、仍带主体词（不许把上游路径当本仓缺口）', function () {
    UPSTREAM.forEach(function (row) {
      const rel = row[0], ln = row[1], ref = row[2], tok = row[3];
      const line = lineOf(rel, ln);
      assert.ok(line.indexOf(ref) >= 0, rel + ':' + ln + ' 不再引用 ' + ref);
      assert.ok(line.indexOf(tok) >= 0, rel + ':' + ln + ' 丢掉了主体词 ' + tok);
    });
  });
  ok('B4 占位示例不报（现场 1 条：ui/console.js 的 engines/xxx.js）', function () {
    assert.strictEqual(LIVE.placeholder.length, 1, '占位条数 ' + LIVE.placeholder.length);
    assert.ok(LIVE.placeholder[0].ref.indexOf('xxx') >= 0);
  });
  ok('B5 历史引用不报（现场 2 条：clock 的 core/replay.js 与 index 的 engines/inspector.js）', function () {
    assert.strictEqual(LIVE.history.length, 2, '历史条数 ' + LIVE.history.length);
  });

  // ══ C 两向自证 ══
  const PROBE = 'engines/zz-pth-probe.js';
  function one(text) { const v = {}; v[PROBE] = text; return scan({ vfs: v, files: [PROBE] }); }
  ok('C1 合成站点：注释指向一个不存在的本仓文件 ⇒ 必报', function () {
    assert.strictEqual(one('// 见 engines/no-such-thing.js 的说明。\n').stale.length, 1);
  });
  ok('C2 反控：带主体词的上游路径 ⇒ 不报', function () {
    assert.strictEqual(one('// 缝合来源：nekotools core/whatever.js（106 行）。\n').stale.length, 0);
  });
  ok('C3 反控：占位示例 xxx ⇒ 不报', function () {
    assert.strictEqual(one('// 形如 engines/xxx.js 的写法只是举例。\n').stale.length, 0);
  });
  ok('C4 反控：标了「已删除」的历史引用 ⇒ 不报', function () {
    assert.strictEqual(one('// engines/old-ghost.js（v2.20.0 已删除）\n').stale.length, 0);
  });
  ok('C5 反控：正文（非注释行）里的路径 ⇒ 不报', function () {
    assert.strictEqual(one("const s = 'engines/no-such-thing.js';\n").stale.length, 0);
  });
  ok('C6 反控：文件真实存在 ⇒ 不报', function () {
    assert.strictEqual(one('// 见 engines/act.js 的头部。\n').stale.length, 0);
  });
  ok('C7 反控：裸文件名（无目录前缀）⇒ 不报', function () {
    assert.strictEqual(one('// 见 no-such-thing.js 的头部。\n').stale.length, 0);
  });

  // ══ D 零写 ══
  ok('D1 扫描只读：四处被校正文件的哈希前后一致', function () {
    const crypto = require('crypto');
    const uniq = Array.from(new Set(FIXED.map(function (r) { return r[0]; })));
    const hash = function () {
      return uniq.map(function (rel) { return crypto.createHash('sha1').update(fs.readFileSync(path.join(BASE, rel))).digest('hex'); });
    };
    const before = hash(); scan({}); const after = hash();
    assert.deepStrictEqual(after, before, '扫描改了文件');
  });
  ok('D2 本不写盘、不起子进程', function () {
    const self = fs.readFileSync(__filename, 'utf8');
    assert.strictEqual(/fs\s*\.\s*(?:write|append)FileSync\s*\(/.test(self), false, '不该写盘');
    assert.strictEqual(/require\s*\(\s*['"]child_process/.test(self), false, '不该起子进程');
  });
  ok('D3 裁决文档在位：三处真名与复算命令都在', function () {
    const p = path.join(BASE, 'docs', 'PATH_FACE_ADJUDICATION.md');
    assert.ok(fs.existsSync(p), 'docs/PATH_FACE_ADJUDICATION.md 不存在');
    const doc = fs.readFileSync(p, 'utf8');
    ['core/rand.js', 'engines/player-archive.js', 'engines/inject-inspector.js',
      'node tests/path-face-v2609.js'].forEach(function (k) {
      assert.ok(doc.indexOf(k) >= 0, '文档缺 ' + k);
    });
  });

  // ══ E 读数出口 ══
  ok('E1 一行读数含五个数（总引用 / 在位 / 上游 / 历史 / 缺失）', function () {
    const line = '指路面：引用 ' + LIVE.total + ' · 在位 ' + LIVE.present.length +
      ' · 上游 ' + LIVE.upstream.length + ' · 历史 ' + LIVE.history.length + ' · 缺失 ' + LIVE.stale.length;
    assert.ok(/\u5f15\u7528 \d+/.test(line) && /\u7f3a\u5931 0/.test(line), line);
  });
  ok('E2 现场缺失为 0，且注定不为 0 的下限也真有（在位 > 0、上游 > 0）', function () {
    assert.strictEqual(LIVE.stale.length, 0);
    assert.ok(LIVE.present.length > 0 && LIVE.upstream.length > 0);
  });

  // ══ F 口径边界 ══
  ok('F1 目录前缀只在仓内五个目录 + tools/plans/docs（别处的路径不收）', function () {
    assert.strictEqual(one('// 见 vendor/no-such-thing.js。\n').stale.length, 0);
  });
  ok('F2 BASE 为空、四处校正无重复', function () {
    assert.strictEqual(BASE_STALE.length, 0);
    assert.strictEqual(new Set(FIXED.map(function (r) { return r[0] + ':' + r[1]; })).size, FIXED.length);
    assert.strictEqual(FIXED.length, 4);
  });

  // ── 收尾读数 ──
  (function summary() {
    console.log('');
    console.log('指路面：引用 ' + LIVE.total + ' · 在位 ' + LIVE.present.length +
      ' · 上游 ' + LIVE.upstream.length + ' · 占位 ' + LIVE.placeholder.length +
      ' · 历史 ' + LIVE.history.length + ' · 缺失 ' + LIVE.stale.length);
    LIVE.stale.forEach(function (r) { console.log('  · 未登记缺失：' + r.site + ' → ' + r.ref); });
  })();

  console.log('\nPTH-1 专锁: ' + (fail ? 'FAIL ' + pass + ' / ' + (pass + fail) : 'pass (' + pass + ')'));
  if (fail) process.exit(1);
})();
