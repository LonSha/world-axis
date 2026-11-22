#!/usr/bin/env node
// WorldAxis tools/settings-audit.js — 设置面总账审计（计划 OPV22-7, v2.400.0）
//
// ── 它治的病 ──────────────────────────────────────────────────────────
//   391 个引擎各自 `WA.__settingsRegs = (WA.__settingsRegs||[]).concat([__REG])`，
//   但**没有任何读口**回答「一共几个设置面、几个默认开启」。
//   于是两类默认值完全没有账：
//     · `enabled:false` 是出厂默认 —— 谁默认关着，没人能一次读出来。
//       后果是真实的：玩家以为某机制在跑，其实出厂就是关的，而面板上没有任何地方
//       把「一共有几个面、几个关着」摆出来。
//     · 同一 key 被两个模块登记（双真源）—— 必然有一方读到别人的值，
//       而两个模块各自都「看起来正常」。
//
// ── 口径（三条，均可复算）──────────────────────────────────────────────
//   ① 只读 `WA.settingsBus.faces()`（单一真源在 core/settings-bus.js），
//      本工具**不另立第二份登记表** —— 那正是本仓反复治过的第二真源病。
//   ② `enabled` 缺省视为 **true**：本仓 normalize 的既有契约是「未声明即原样」。
//   ③ 重复 key / 缺 key 单独报，且计入退出码（它们是结构缺陷，不是风格问题）。
//
// ── 用法 ──────────────────────────────────────────────────────────────
//   node tools/settings-audit.js           # 总账 + 默认关闭清单
//   node tools/settings-audit.js --check   # 有重复键/缺键 ⇒ exit 1
//   node tools/settings-audit.js --json    # 机器可读
//   node tools/settings-audit.js --disabled# 只列默认关闭的设置面
'use strict';
const path = require('path');
const BASE = path.join(__dirname, '..');

/**
 * 从 tests/run.js 提取 LOAD 常量，返回其中的 `engines/*.js` 条目（**装载面**的真值）。
 *
 * 为什么必须另取这一份，而不能用 `__settingsRegs.length` 冒充：
 *   本工具第一版把「装载引擎」这一行直接打印成 `__settingsRegs.length`，实测读 **292**，
 *   而磁盘上 `engines/` 有 **391** 个文件 —— 两个数字碰巧相同（292 既是登记项数、
 *   又被当成装载引擎数），于是那行读数**看起来像真的**，其实它只是把第二行的值抄了一遍。
 *   这正是本仓治过八次的同型病（读数与现场脱钩），只是这次它出现在**审计工具自己身上**：
 *   工具自称「回答一共有几个设置面」，却连「看了几个引擎」都答错。
 *   分离之后两个读数各自可复算：
 *     · 装载面 = LOAD 里的 engines/ 条目（与磁盘对比即知有没有漏装载）；
 *     · 登记面 = `__settingsRegs`（276 个引擎文件含该字面量，实际产出 292 条登记）。
 *   292 < 391 是**正常的**：115 个引擎根本没有设置面。但「没有设置面」必须是
 *   由装载面覆盖证明的结论，不能靠一个抄来的数字暗示。
 */
function loadOrderEngines() {
  const fs = require('fs');
  const vm = require('vm');
  const runRel = path.join(BASE, 'tests', 'run.js');
  const src = fs.readFileSync(runRel, 'utf8');
  const li = src.indexOf('const LOAD = [');
  const lj = src.indexOf('];', li);
  if (li < 0 || lj < 0) throw new Error('settings-audit: 无法从 tests/run.js 提取 LOAD 清单');
  const LOAD = vm.runInNewContext('(' + src.slice(src.indexOf('[', li), lj + 1) + ')');
  const engines = LOAD.filter(function (rel) { return rel.indexOf('engines/') === 0; });
  const onDisk = fs.readdirSync(path.join(BASE, 'engines'))
    .filter(function (f) { return f.endsWith('.js'); })
    .map(function (f) { return 'engines/' + f; });
  const inLoad = {};
  engines.forEach(function (r) { inLoad[r] = true; });
  const missing = onDisk.filter(function (r) { return !inLoad[r]; });
  return { engines: engines, onDisk: onDisk, missing: missing };
}

/**
 * 装载全部引擎，让每个 `__REG` 都 concat 进 `WA.__settingsRegs`。
 * 为什么必须真装载而不是静态扫源码：登记发生在模块执行期（`concat([__REG])`），
 * 静态扫只能看到字面量，看不到「哪些模块真的装载了、装载了几个」。
 * 复用 tests/run.js 的 LOAD 顺序会引入 26000 行依赖，故这里直接 require engines/ 全量。
 */
function loadAll() {
  const failed = [];
  // ── 装载顺序是这里唯一容易做错的地方，实测踩过两次 ──────────────────────
  //   fresh() 会**先**把 `__settingsRegs` 清空、**再**按 `tests/run.js` 的 LOAD
  //   把产品面完整装载一遍（现场实测：LOAD 426 条，其中 engines/ 391 条 = 磁盘全部引擎）。
  //   于是「谁先谁后」有决定性差别：
  //
  //   ① 先 fresh 再 require 补（错）：fresh 已把 292 条写进 __settingsRegs，
  //      补装载的那批再 concat 一次 ⇒ 其中 274 条变成两条 ⇒
  //      总账 292→566、凭空出现 274 个「重复键」。那是**工具造出来的读数**。
  //   ② 先 require 再 fresh（对）：fresh 会先 `__settingsRegs = []` 再重跑 LOAD，
  //      于是登记表被**完整重建**，重复项归零。
  //
  //   注意 vm.runInContext 不经过 require.cache，所以「用 cache 判重」也拦不住 ①。
  //   本仓纪律里最危险的一种错正是「判据写错却报出更戏剧化的读数」。
  //
  //   ⚠ 修掉一处会误导人的旧注释：这里曾写着「fresh() 只装载**一部分**引擎（292 项），
  //   剩下 270 个要靠 require 补」。现场复算否定它 —— LOAD 里 engines/ 391 条与磁盘
  //   391 个文件逐一对上（差集为空），fresh() 装载的就是**全部**引擎；292 是**登记条数**
  //   而不是装载条数（391 个引擎里 276 个含 `__settingsRegs` 字面量，合计产出 292 条）。
  //   把「登记数」误读成「装载数」正是本工具第一行读数出错的同一个根因。
  require(path.join(BASE, 'tests', 'mock.js'));
  // ── 只用 fresh()，不要自己再 require 一遍 engines/ ────────────────────
  //   踩过的两个坑（都是「工具造读数」而非仓库缺陷）：
  //     ① 先 fresh 再补 require ⇒ 每个 __REG 被 concat 第二次 ⇒
  //        总账 292→566、凭空出现 274 个「重复键」；
  //     ② 按字母序 require 补装载 ⇒ workflow / settingsBus 的依赖方先求值 ⇒
  //        15 个引擎抛 `Cannot read properties of undefined (reading 'register')`。
  //   结论：登记表的读数只认 fresh() 这一个来源，本工具不另排装载序。
  const sync = require(path.join(BASE, 'tests', 'ui-gate-sync.js'));
  const WA = sync.fresh().WA;
  if (WA.store && typeof WA.store.init === 'function') WA.store.init();
  const after = (WA.__settingsRegs || []).length;
  const ord = loadOrderEngines();
  return {
    WA: WA,
    // 两个读数**分开放**：装载面（LOAD 覆盖了多少引擎）与登记面（产出多少条设置登记）。
    loadedEngines: ord.engines.length, enginesOnDisk: ord.onDisk.length,
    enginesMissingFromLoad: ord.missing, registrations: after,
    failed: [],
    regsBefore: after, regsAfter: after, addedByUs: 0,
  };
}

function audit() {
  const loaded = loadAll();
  const WA = loaded.WA;
  const bus = WA.settingsBus;
  const base = {
    loadedEngines: loaded.loadedEngines, enginesOnDisk: loaded.enginesOnDisk,
    enginesMissingFromLoad: loaded.enginesMissingFromLoad, registrations: loaded.registrations,
    failed: loaded.failed,
    regsBefore: loaded.regsBefore, regsAfter: loaded.regsAfter, addedByUs: loaded.addedByUs,
  };
  if (!bus || typeof bus.faces !== 'function') {
    return Object.assign({ ok: false, reason: 'settingsBus.faces 缺失（OPV22-7 读口未装载）' }, base);
  }
  const f = bus.faces();
  const problems = [];
  if (f.dupKeys.length) problems.push({ kind: 'dup-key', why: '同一设置键被两个以上模块登记（双真源）', items: f.dupKeys });
  if (f.missingKey) problems.push({ kind: 'missing-key', why: '登记项没有 key 字段（登记面空转）', count: f.missingKey });
  // 装载面：磁盘上有、LOAD 里没有的引擎 = 它对**所有**门禁同时隐身。
  //   这条是本工具第一版漏掉的那一面：它把「装载数」抄成了「登记数」，
  //   于是「少装载了 3 个引擎」这件事在总账上根本不可能现形。
  if (loaded.enginesMissingFromLoad.length) {
    problems.push({
      kind: 'engine-not-loaded', why: '磁盘上的引擎不在 LOAD 里（它没有任何门禁能看见）',
      items: loaded.enginesMissingFromLoad,
    });
  }
  // 恒等式：total == enabled + disabled + missingKey
  const sum = f.enabled + f.disabled + f.missingKey;
  if (sum !== f.total) {
    problems.push({ kind: 'identity', why: 'enabled+disabled+missingKey ≠ total（' + sum + ' vs ' + f.total + '）' });
  }
  return Object.assign({
    ok: problems.length === 0, faces: f, problems,
    identityOk: sum === f.total,
  }, base);
}

function printReport(a) {
  if (!a.faces) { console.log('✗ ' + a.reason); return; }
  const f = a.faces;
  console.log('WorldAxis · 设置面总账（OPV22-7）');
  console.log('─'.repeat(72));
  // 装载面与登记面**分开两行**：这两个数以前是同一个值（都读 __settingsRegs.length），
  //   于是一行错、另一行也错，且错得互相印证，看上去特别可信。
  console.log('  装载引擎（LOAD）    ' + a.loadedEngines + ' / 磁盘 ' + a.enginesOnDisk
    + (a.enginesMissingFromLoad.length ? '（漏装载 ' + a.enginesMissingFromLoad.length + '）' : '')
    + (a.failed.length ? '（失败 ' + a.failed.length + '）' : ''));
  console.log('  设置面（登记项）    ' + f.total);
  console.log('  涉及模块            ' + f.modules);
  console.log('  出厂默认开启        ' + f.enabled);
  console.log('  出厂默认关闭        ' + f.disabled);
  console.log('  缺 key 的登记项     ' + f.missingKey);
  console.log('  重复键              ' + (f.dupKeys.length || 0));
  console.log('─'.repeat(72));
  console.log('  恒等式  ' + f.enabled + ' + ' + f.disabled + ' + ' + f.missingKey
    + ' = ' + (f.enabled + f.disabled + f.missingKey) + ' / ' + f.total
    + (a.identityOk ? '  ✓ 成立' : '  ✗ 破裂'));
  if (f.dupKeys.length) {
    console.log('\n── 重复键（双真源，必有一方读到别人的值）──');
    f.dupKeys.forEach((k) => console.log('   ' + k));
  }
  if (f.disabledList.length) {
    console.log('\n── 出厂默认关闭的设置面（玩家以为开着、其实关着的那批）──');
    f.disabledList.forEach((k) => console.log('   ' + k));
  }
  if (a.failed.length) {
    console.log('\n── 装载失败的引擎（读数可能偏小）──');
    a.failed.slice(0, 10).forEach((x) => console.log('   ' + x.file + ' —— ' + x.err));
  }
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const a = audit();
  if (argv.includes('--json')) {
    console.log(JSON.stringify(a, null, 2));
  } else if (argv.includes('--disabled')) {
    const f = a.faces || { disabledList: [] };
    f.disabledList.forEach((k) => console.log(k));
    if (!f.disabledList.length) console.log('(none)');
  } else {
    printReport(a);
  }
  if (argv.includes('--check')) {
    if (!a.ok) {
      console.error('\n✗ --check 失败：');
      a.problems.forEach((p) => console.error('   · [' + p.kind + '] ' + p.why
        + (p.items ? '：' + p.items.join(',') : '') + (p.count ? '（' + p.count + ' 项）' : '')));
      process.exit(1);
    }
    console.error('\n✓ --check 通过：无重复键、无缺键、恒等式成立');
  }
  process.exit(a.ok ? 0 : (argv.includes('--check') ? 1 : 0));
}

module.exports = { audit, loadAll, loadOrderEngines };
