/**
 * WorldAxis tests/settings-audit-v2400.js (v2.400.0) — OPV22-7 专锁
 *
 * 它治的病（**这条病在工具自己身上**，写清楚，因为它比任何断言都重要）：
 *   OPV22-7 要求「设置面总账：391 个引擎各自 concat([__REG])，但没有读口回答
 *   一共几个设置面、几个默认开启」。第一版 tools/settings-audit.js 交了这张总账，
 *   但它的第一行读数 `装载引擎  292` 是**假的**：
 *     · 那个 292 直接取自 `__settingsRegs.length`，也就是第二行「设置面（登记项）」的同一个值；
 *     · 现场磁盘上 engines/ 有 391 个文件，LOAD 里 engines/ 也恰 391 条（差集为空）。
 *   两个数字碰巧相等（都是 292），于是假读数**看起来特别可信** —— 一行错、另一行也错，
 *   还互相印证。这正是本仓治过八次的那个形态（读数与现场脱钩），只是这次它出现在
 *   审计工具自己身上：一个自称「回答一共有几个面」的工具，连「看了几个引擎」都答错。
 *
 *   本锁因此分两层：
 *     · 总账面（A/B）：读数自洽、恒等式成立、默认关闭清单与 faces() 同源；
 *     · 装载面（C）：**装载数必须与磁盘独立对齐**，不许由登记数冒充。
 *   C 组是本锁存在的核心理由：只锁总账而不锁装载面，第一版会全绿。
 *
 * 四档：
 *   A 契约：faces() 读口在位、口径三条自述在位、工具不另立第二份登记表
 *   B 总账：真跑 audit()，恒等式成立、默认开/关与 disabledList 同源、重复键为零
 *   C 装载面：LOAD 覆盖全部磁盘引擎；`loadedEngines` 与 `registrations` 是**两个独立读数**
 *   N 真源码破坏负控制：
 *       N1 破坏 faces() 的 `enabled` 缺省（未声明视为 false）⇒ B 组恒等式/读数必须变
 *       N2 真改产品源码：给一个引擎注入重复 key ⇒ audit() 必须报 dup-key 并 exit≠0
 *       N3 真改产品源码：把一个引擎从 LOAD 里摘掉 ⇒ audit() 必须报 engine-not-loaded
 *       全部经 try/finally + sha256 双重还原（N2/N3 只动 run.js 与一个引擎文件，各自核对）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/settings-audit.js');
const RUN = path.join(ROOT, 'tests/run.js');
let passed = 0; let failed = 0;
function a(cond, desc, detail) {
  if (cond) { passed++; console.log('  ✓ ' + desc); }
  else { failed++; console.error('  ✗ ' + desc + (detail ? ' — ' + detail : '')); }
}
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
const toolSrc = fs.readFileSync(TOOL, 'utf8');
const T = require(TOOL);

function runAll() {
  // ═══════════════ A 契约面 ═══════════════
  a(typeof T.audit === 'function' && typeof T.loadAll === 'function',
    'A1: 工具导出 audit() 与 loadAll()（读口可被程序调用，不是只能人眼看输出）');
  a(typeof T.loadOrderEngines === 'function',
    'A2: 导出 loadOrderEngines()（装载面独立读数 —— 本锁 C 组要用的那个口）');
  a(/faces\s*\(\s*\)/.test(toolSrc), 'A3: 工具读的是 settingsBus.faces()（单一真源）');
  // 工具不许自己维护第二份设置键清单（那正是第二真源病）
  const ownKeyList = (toolSrc.match(/worldaxis_[a-z0-9_]+_settings_v1/g) || []);
  a(ownKeyList.length === 0,
    'A4: 工具源码里零个硬编码设置键（实 ' + ownKeyList.length + ' 个）—— 不另立第二份登记表');
  a(/只读\s*`?WA\.settingsBus\.faces\(\)/.test(toolSrc) || /单一真源/.test(toolSrc),
    'A5: 口径自述里写明「只读 faces()」');
  a(/enabled`?\s*缺省视为\s*\*\*true\*\*/.test(toolSrc), 'A6: 口径自述里写明 enabled 缺省为 true');
  a(/重复 key \/ 缺 key 单独报/.test(toolSrc), 'A7: 口径自述里写明重复键/缺键单独报');
  // 装载面读数必须来自 LOAD，不许来自 __settingsRegs（本锁的核心契约）
  a(/function loadOrderEngines/.test(toolSrc), 'A8a: 装载面读数有独立实现 loadOrderEngines()');
  a(/const LOAD = vm\.runInNewContext/.test(toolSrc),
    'A8b: 它真从 tests/run.js 的 LOAD 常量取值（与全仓其他门禁同一真源）');
  a(/onDisk\s*=\s*fs\.readdirSync\(path\.join\(BASE, 'engines'\)\)/.test(toolSrc),
    'A8c: 它真读磁盘 engines/ 做对齐（否则「漏装载」不可能现形）');

  // ═══════════════ B 总账面 ═══════════════
  const A0 = T.audit();
  a(A0.ok === true, 'B1: 原版上 audit() 判 ok（problems 空，实 ' + JSON.stringify(A0.problems) + '）');
  a(!!A0.faces, 'B2: faces 读口有返回');
  const f = A0.faces;
  a(f.total === f.enabled + f.disabled + f.missingKey,
    'B3: 恒等式 enabled+disabled+missingKey === total（'
    + f.enabled + '+' + f.disabled + '+' + f.missingKey + '=' + (f.enabled + f.disabled + f.missingKey)
    + ' vs ' + f.total + '）');
  a(f.disabledList.length === f.disabled,
    'B4: disabledList 长度 === disabled 计数（实 ' + f.disabledList.length + ' vs ' + f.disabled
    + '）—— 两个读数是同一份真源，不是各算一遍');
  a(f.dupKeys.length === 0, 'B5: 零重复键（实 ' + f.dupKeys.length + '）');
  a(f.missingKey === 0, 'B6: 零缺 key 登记项（实 ' + f.missingKey + '）');
  a(f.modules > 200, 'B7: 涉及模块数是大数（实 ' + f.modules + '，须 > 200；太小说明装载面塌了）');
  a(f.total > 200, 'B8: 设置面条数是大数（实 ' + f.total + '，须 > 200）');
  // enabled 缺省视为 true：把一条登记项的 def.enabled 改成 undefined，读数必须按「开」算
  //   这里不碰产品源码 —— 直接对 faces() 的输入真源做内存级探针，证明缺省语义真的成立。
  (function () {
    const WA = T.loadAll().WA;
    const bus = WA.settingsBus;
    const before = bus.faces();
    const rows = WA.__settingsRegs;
    // 找一条 enabled:false 的，把 def 里的 enabled 删掉 ⇒ 它应当从 disabled 转到 enabled
    const idx = rows.findIndex(function (r) { return r && r.def && r.def.enabled === false; });
    a(idx >= 0, 'B9a: 找到一条 enabled:false 的登记项做探针（实 idx=' + idx + '）');
    if (idx >= 0) {
      const keep = rows[idx].def;
      const copy = Object.assign({}, keep);
      delete copy.enabled;
      rows[idx] = Object.assign({}, rows[idx], { def: copy });
      const after = bus.faces();
      a(after.enabled === before.enabled + 1 && after.disabled === before.disabled - 1,
        'B9b: 删掉 def.enabled ⇒ 该项从「关」转「开」（实 enabled ' + before.enabled + '→' + after.enabled
        + ' / disabled ' + before.disabled + '→' + after.disabled + '）—— 缺省即 true 不是空话');
      rows[idx] = Object.assign({}, rows[idx], { def: keep });
    }
  })();
  // --json 与文本同源
  (function () {
    const r = cp.spawnSync(process.execPath, [TOOL, '--json'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    const out = String(r.stdout || '');
    const i = out.indexOf('{');
    let d = null;
    try { d = JSON.parse(out.slice(i)); } catch (e) {}
    a(!!d, 'B10a: --json 可解析（真输出 JSON，不是拼字符串）');
    if (d) {
      a(d.faces && d.faces.total === f.total,
        'B10b: --json 与进程内 audit() 同一读数（total ' + (d.faces ? d.faces.total : '?') + ' vs ' + f.total + '）');
      a(d.loadedEngines === A0.loadedEngines, 'B10c: --json 的装载面读数与进程内一致');
    }
  })();

  // ═══════════════ C 装载面（本锁的核心） ═══════════════
  (function () {
    const ord = T.loadOrderEngines();
    a(ord.onDisk.length > 300, 'C1a: 磁盘 engines/ 文件数是真值（实 ' + ord.onDisk.length + '）');
    a(ord.engines.length === ord.onDisk.length,
      'C1b: LOAD 覆盖全部磁盘引擎（LOAD ' + ord.engines.length + ' / 磁盘 ' + ord.onDisk.length
      + '；差集 ' + ord.missing.length + '）—— 漏一个就对所有门禁隐身');
    a(ord.missing.length === 0, 'C1c: 漏装载清单为空（实 ' + JSON.stringify(ord.missing.slice(0, 5)) + '）');
    // 核心断言：装载数与登记数**必须是两个独立读数**，不许一个冒充另一个。
    //   第一版把两者都写成 __settingsRegs.length（都 292），这一条在当时会**全绿** ——
    //   所以本锁还必须钉住「它们来自不同的计算」，见 C3。
    a(A0.loadedEngines !== A0.registrations,
      'C2: 装载引擎数（' + A0.loadedEngines + '）≠ 登记项数（' + A0.registrations
      + '）—— 两个读数不相等。相等就意味着其中一个在冒充另一个（第一版正是 292=292）');
    a(A0.loadedEngines === ord.engines.length,
      'C3a: loadedEngines 真等于 LOAD 的 engines/ 条目数（' + A0.loadedEngines + '）');
    a(A0.registrations === (T.loadAll().WA.__settingsRegs || []).length,
      'C3b: registrations 真等于 __settingsRegs 长度（' + A0.registrations + '）—— 两读数各有出处');
    // 反向自证：如果装载面塌成登记数，C2 必须变红。
    //   做法：造一份「把 loadedEngines 抄成 registrations」的内存副本，喂给同一条判据。
    const fake = Object.assign({}, A0, { loadedEngines: A0.registrations });
    a(!(fake.loadedEngines !== fake.registrations),
      'C4: 反证 —— 若把装载数抄成登记数（' + fake.loadedEngines + '=' + fake.registrations
      + '），C2 的判据当场变红。证明 C2 不是恒真');
    a(A0.enginesMissingFromLoad.length === 0,
      'C5: audit() 的漏装载读数也为空（实 ' + A0.enginesMissingFromLoad.length + '）');
  })();

  // ═══════════════ N 真源码破坏负控制 ═══════════════
  //   N1：破坏 faces() 的 enabled 缺省语义（内存副本，改的是**判据本体**）
  (function () {
    const busSrc = fs.readFileSync(path.join(ROOT, 'core/settings-bus.js'), 'utf8');
    const anchor = "const on = (typeof d.enabled === 'boolean') ? d.enabled : true;";
    a(busSrc.indexOf(anchor) >= 0, 'N1a: enabled 缺省语义的锚点存在（破坏前提）');
    const broken = busSrc.replace(anchor, "const on = (typeof d.enabled === 'boolean') ? d.enabled : false;");
    a(broken !== busSrc, 'N1b: 锚点恰命中（只改一个字面量）');
    // 在内存副本里跑同一个 faces()，读数必须从 110/182 翻成 0/292
    const sandbox = { window: {}, console: console, Date: Date, JSON: JSON, Math: Math };
    sandbox.window.WorldAxis = {};
    vm.createContext(sandbox);
    let ran = false;
    try {
      vm.runInContext(broken, sandbox, { filename: 'settings-bus-broken.js' });
      ran = true;
    } catch (e) { ran = false; }
    a(ran, 'N1c: 破坏副本能装载（不靠语法报错充数）');
    if (ran) {
      const WA2 = sandbox.window.WorldAxis;
      // 造两条登记项：一条显式 false、一条不声明 enabled
      WA2.__settingsRegs = [
        { key: 'probe_a', def: { enabled: false }, module: 'probe' },
        { key: 'probe_b', def: {}, module: 'probe' },
      ];
      let r = null;
      try { r = WA2.settingsBus.faces(); } catch (e) { r = null; }
      a(!!r, 'N1d: 破坏副本上的 faces() 可调用');
      if (r) {
        a(r.enabled === 0 && r.disabled === 2,
          'N1e: 破坏后「未声明即原样」失效 ⇒ 两条都算关（enabled ' + r.enabled + ' / disabled ' + r.disabled
          + '）；原版同输入应为 enabled 1 / disabled 1');
        // 原版同输入对照（双向自证：判据在原版上必须给出不同的读数）
        const WA1 = T.loadAll().WA;
        const rowsKeep = WA1.__settingsRegs;
        WA1.__settingsRegs = [
          { key: 'probe_a', def: { enabled: false }, module: 'probe' },
          { key: 'probe_b', def: {}, module: 'probe' },
        ];
        const r2 = WA1.settingsBus.faces();
        a(r2.enabled === 1 && r2.disabled === 1,
          'N1f: 原版同输入给 enabled 1 / disabled 1（实 ' + r2.enabled + '/' + r2.disabled
          + '）—— N1e 的对照面，证明判据不是恒红');
        WA1.__settingsRegs = rowsKeep;
      }
    }
  })();

  //   N2：真改产品源码注入**重复 key** ⇒ audit() 必须报 dup-key。
  //   为什么要走真文件：验收纪律第 1 条要的是「真源码破坏」。风险由 try/finally + sha256 兜住。
  (function () {
    const target = path.join(ROOT, 'engines/routine-pacing.js');
    const orig = fs.readFileSync(target, 'utf8');
    const origSha = sha(target);
    // 锚点：该引擎的 __REG.key 取自 LS_KEY，故直接注入一条**与它同 key** 的第二条登记。
    const anchor = '  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);';
    a(orig.indexOf(anchor) >= 0, 'N2a: 目标引擎的登记行锚点存在（破坏前提）');
    let restored = false;
    try {
      const broken = orig.replace(anchor,
        anchor + '\n  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);'
        + ' // NEGCTL-OPV22-7 重复登记');
      a(broken !== orig, 'N2b: 破坏锚点恰命中（注入第二次登记）');
      fs.writeFileSync(target, broken);
      a(sha(target) !== origSha, 'N2c: 破坏后文件摘要已变（不是空写）');
      const r = cp.spawnSync(process.execPath, [TOOL, '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
      const out = String(r.stdout || '') + String(r.stderr || '');
      a(r.status !== 0, 'N2d: 重复登记 ⇒ --check exit≠0（实 ' + r.status + '）');
      a(/dup-key/.test(out), 'N2e: 报的是 dup-key（不是别的错）');
      a(/重复键/.test(out), 'N2f: 文本面也点名「重复键」');
      a(/routinePacing|worldaxis_routinepacing/.test(out) || /worldaxis_routine/.test(out),
        'N2g: 点名到被破坏的那个键/模块（不是只报个数）');
    } finally {
      fs.writeFileSync(target, orig);
      restored = sha(target) === origSha;
    }
    a(restored, 'N2h: 目标引擎已逐字节还原（sha256 相同）');
    if (!restored) throw new Error('N2 还原失败：' + target + ' 摘要不符，拒绝继续（仓库已被污染）');
    const r2 = cp.spawnSync(process.execPath, [TOOL, '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    a(r2.status === 0, 'N2i: 还原后 --check 回到 0（不是恒红）');
  })();

  //   N3：真改 tests/run.js，把一个引擎从 LOAD 里摘掉 ⇒ audit() 必须报 engine-not-loaded。
  //   这一条钉的正是第一版**根本不可能**发现的缺陷：装载面塌了，总账却全绿。
  (function () {
    const orig = fs.readFileSync(RUN, 'utf8');
    const origSha = sha(RUN);
    let restored = false;
    try {
      // 摘掉 engines/routine-pacing.js 这一行（它含设置登记，摘掉后登记数也会掉 1）
      const line = "    'engines/routine-pacing.js',";
      a(orig.indexOf(line) >= 0, 'N3a: LOAD 里有目标引擎行（破坏前提）');
      const broken = orig.replace(line, "    // NEGCTL-OPV22-7 'engines/routine-pacing.js',");
      a(broken !== orig, 'N3b: 破坏锚点恰命中（注释掉该行）');
      fs.writeFileSync(RUN, broken);
      const r = cp.spawnSync(process.execPath, [TOOL, '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
      const out = String(r.stdout || '') + String(r.stderr || '');
      a(r.status !== 0, 'N3c: 摘掉一个引擎 ⇒ --check exit≠0（实 ' + r.status + '）');
      a(/engine-not-loaded/.test(out), 'N3d: 报的是 engine-not-loaded（判据类型正确）');
      a(/engines\/routine-pacing\.js/.test(out), 'N3e: 点名到被摘掉的那个引擎文件');
      a(/漏装载\s*1/.test(out) || /漏装载/.test(out), 'N3f: 文本面报出「漏装载」（人读面也有这一行）');
    } finally {
      fs.writeFileSync(RUN, orig);
      restored = sha(RUN) === origSha;
    }
    a(restored, 'N3g: tests/run.js 已逐字节还原（sha256 相同）');
    if (!restored) throw new Error('N3 还原失败：tests/run.js 摘要不符，拒绝继续（仓库已被污染）');
  })();

  // ── N4 纯度：负控制跑完后一切逐字复原 ─────────────────────────────────
  (function () {
    const r = cp.spawnSync(process.execPath, [TOOL, '--check'], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    a(r.status === 0, 'N4a: 全部负控制跑完后 --check 回到 0（实 ' + r.status + '）');
    const A1 = T.audit();
    a(A1.ok && A1.loadedEngines === A0.loadedEngines && A1.registrations === A0.registrations,
      'N4b: 总账读数与负控制前逐字相同（' + A1.loadedEngines + '/' + A1.registrations + '）');
    a(/NEGCTL-OPV22-7/.test(fs.readFileSync(RUN, 'utf8')) === false,
      'N4c: run.js 里没有负控制残留');
    a(/NEGCTL-OPV22-7/.test(fs.readFileSync(path.join(ROOT, 'engines/routine-pacing.js'), 'utf8')) === false,
      'N4d: 引擎里没有负控制残留');
  })();



}
module.exports = { runAll: runAll };
// 快档口径①：必须有 `require.main === module` 入口（tools/smoke.js 的三条收录口径之一）。
//   tests/run.js 走 runScript spawn（子进程 ⇒ 本守卫成立 ⇒ 跑一遍，退出码即结论）；
//   若哪天有人改用 runLock require，导出面也给了 runAll(assert) 这个名字（签名兼容：
//   本锁不用注入的 assert，而是自带 a()，故传进来的参数被忽略）。
if (require.main === module) {
  runAll();
  console.log('');
  if (failed) { console.error('SETTINGS-AUDIT-V2400: FAIL ' + failed + ' / ' + (passed + failed)); process.exit(1); }
  console.log('SETTINGS-AUDIT-V2400: pass（' + passed + ' 项）');
}
