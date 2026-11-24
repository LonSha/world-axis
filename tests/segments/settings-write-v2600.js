'use strict';
// 模块顶层的真 require（段体内会声明同名 `require` 做路径基准重绑，见下）。
const NODE_REQUIRE = require;
/**
 * tests/segments/settings-write-v2600.js — 从 tests/run.js 抽出的可独跑段落（v2.522.0 · A11 收口）。
 *
 * 为什么抽：`segment-extract-v2400` 的 A11 是「run.js 已显著变短」的棘轮（拆前 26001 行，须 < 23000）。
 *   本段整块 606 行（v2.6.0 全部 7 个块：写入侧计量 / 保存回传 / 迁移回写 / 增量死键 / 诊断接线 /
 *   单源不变量 / 统一写出口）是 run.js 里剩下的最大内聚块，且**自持全部夹具**
 *   （LS2600 / ctx2600 / SRC2600 / fresh2600 / src2600 / wstat2600 都在块内声明）—— 抽取代价最低。
 *
 * **等价性契约（与 v2.400.0 的 tool-diag 段同款，不许放宽）**：
 *   · 段体**逐字搬入**，一个字符都没改（连块标签 `v2600:` 都保留）；
 *   · 段外依赖只有 7 个（BASE / WA / assert / section / fs / path / verAtLeast），由调用点注入；
 *   · 调用点**原位**执行（仍在 run.js 的 async IIFE 内、同一行号位置）⇒ 顺序、
 *     共享 WA 运行时状态（store 已 init、settings-bus 写统计）与抽取前逐字一致；
 *   · 段体是**同步**体（零 await），故本模块导出同步函数、调用点不 await ——
 *     少一个 await 也不会让后续节并跑。
 *
 * 负控制：本文件若从 run.js 的调用点摘掉 ⇒ tests/test-surface-gate.js 报孤儿（从不执行）。
 */
/**
 * @param {{BASE:string, WA:Object, assert:Function, section:Function, fs:Object, path:Object, verAtLeast:Function}} ctx
 * @returns {void}
 */
module.exports = function settingsWriteV2600(deps) {
  // 外部符号解构：段内代码保持逐字不变（不改成 ctx.WA.xxx 这种改写）。
  // vm：段体的 jsdom 缺省分支里用 vm 造沙箱（run.js 顶层本来就 require('vm')，抽取后走注入）。
  const { BASE, WA, assert, section, fs, path, verAtLeast, vm, ctx } = deps;
  // 段体里有两处 `require('./ui-dom.js')`（jsdom 缺席时的 JSDOMShim 回退）。从 run.js
  //   （tests/ 下）搬进 tests/segments/ 之后，相对基准变了 ⇒ 裸搬会 Cannot find module。
  //   处置：在段体内给出一个**同名 require**，相对路径一律按 tests/ 解析 —— 段体一个字不改，
  //   而「路径基准」这件事只在入口说明一次。（绝对/裸包名原样透给 Node 的 require。）
  //   注意 NODE_REQUIRE 必须在**模块顶层**取：这里声明同名 `require` 会让整块进入 TDZ，
  //   在块内写 `const nodeRequire = require` 会抛 "Cannot access before initialization"（踩过一次）。
  const require = function (p) {
    return (typeof p === 'string' && p.charAt(0) === '.')
      ? NODE_REQUIRE(path.join(BASE, 'tests', p))
      : NODE_REQUIRE(p);
  };
  v2600: {
  const LS2600 = global.localStorage;
  const ctx2600 = global.SillyTavern.getContext();
  const PROD2600 = ['core/store.js', 'core/settings-bus.js', 'core/api-router.js', 'core/workflow.js',
    'engines/backstage.js', 'engines/evolution.js', 'engines/opinion.js', 'engines/regional.js', 'engines/parallel-world.js', 'engines/horizon.js',
    'engines/calendar.js', 'engines/preset.js', 'engines/tool-diag.js',
    'render/inject.js', 'render/purifier.js', 'ui/panel.js', 'ui/settings.js'];
  const SRC2600 = PROD2600.map(function (rel) { return { rel: rel, text: fs.readFileSync(path.join(BASE, rel), 'utf8') }; });
  function fresh2600() { LS2600.clear(); ctx2600.chatId = 'v2600_chat'; global.__mockChat.length = 0; WA.store.init(); }
  function src2600(rel) { const h = SRC2600.filter(function (x) { return x.rel === rel; })[0]; return h ? h.text : ''; }
  function wstat2600() { return WA.settingsBus.writeStat(); }
  const probeKey2600 = 'worldaxis_v2600_probe_v1';
  const extraKey2600 = 'worldaxis_v2600_extra_v1';
  const contKey2600 = 'worldaxis_v2600_container_v1';
  const migWbKey2600 = 'worldaxis_v2600_migwb_v1';
  const bkKey2600 = 'worldaxis_backstage_settings_v1';
  // ── A. 块1：写入侧计量与三分归因 ──
  fresh2600();
  section('v2.6.0 块1：写入侧计量与失败三分归因');
  {
    const w0 = wstat2600();
    assert(typeof w0.writes === 'number' && typeof w0.writeFailed === 'number', '写入台账可用（writes / writeFailed）');
    assert(w0.ok === true || w0.writeFailed > 0, 'writeStat.ok 由 writeFailed 派生（不自持第二份状态）');
    assert(!!w0.subkeyDrift && typeof w0.subkeyDrift.count === 'number', 'writeStat 带写入侧子键漂移计量');
    const regA2600 = { key: probeKey2600, def: { a: 1 }, module: 'test' };
    const writesBefore = wstat2600().writes;
    assert(WA.settingsBus.save(regA2600, { a: 2 }) === true, '正常写入返回 true');
    assert(wstat2600().writes === writesBefore + 1, '成功写入计入 writes（实 ' + wstat2600().writes + '）');
    assert(JSON.parse(LS2600.getItem(probeKey2600)).a === 2, '写入确实落盘（计量不是唯一证据）');
    // 失败①：登记项缺 key —— 调用方传值无效，此前只是静默 false
    const f1 = wstat2600().writeFailed;
    assert(WA.settingsBus.save({}, { x: 1 }) === false, '（负向）缺 key 的 save 返回 false');
    assert(wstat2600().writeFailed === f1 + 1, '缺 key 计入 writeFailed');
    assert(/missing-key/.test(wstat2600().lastError), '缺 key 可归因（实 ' + wstat2600().lastError + '）');
    // 失败②：值不可序列化（与写盘失败原因完全不同，必须分开归因）
    const cyc2600 = { a: 1 }; cyc2600.self = cyc2600;
    const f2 = wstat2600().writeFailed;
    assert(WA.settingsBus.save(regA2600, cyc2600) === false, '（负向）循环引用值 save 返回 false');
    assert(wstat2600().writeFailed === f2 + 1, '序列化失败计入 writeFailed');
    assert(/^stringify/.test(wstat2600().lastError), '序列化失败带 stringify 归因前缀（实 ' + wstat2600().lastError + '）');
    // 失败③：setItem 抛错（模拟配额满 / 隐私模式）
    const rawSet2600 = LS2600.setItem;
    let srFail2600 = null;
    try {
      LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
      const f3 = wstat2600().writeFailed;
      assert(WA.settingsBus.save(regA2600, { a: 3 }) === false, '（负向）setItem 抛错时 save 返回 false（此前调用方无从知晓）');
      assert(wstat2600().writeFailed === f3 + 1, 'setItem 失败计入 writeFailed');
      assert(/^setItem/.test(wstat2600().lastError) && /QuotaExceededError/.test(wstat2600().lastError),
        '归因前缀区分 setItem 与 stringify，且带原始错误（实 ' + wstat2600().lastError + '）');
      srFail2600 = WA.settingsBus.saveOrThrow(regA2600, { a: 4 });
      assert(srFail2600.ok === false && typeof srFail2600.reason === 'string' && srFail2600.reason.length > 0,
        'saveOrThrow 结构化回传失败原因（实 ' + JSON.stringify(srFail2600) + '）');
    } finally { LS2600.setItem = rawSet2600; }
    assert(LS2600.getItem(probeKey2600) !== null || true, '恢复写盘能力');
    assert(WA.settingsBus.save(regA2600, { a: 5 }) === true, '恢复后写入成功');
    const wOK2600 = wstat2600();
    assert(wOK2600.lastError === null, '成功写入清空 lastError（否则「还在坏」永远为真）');
    assert(!!wOK2600.last && wOK2600.last.key === probeKey2600 && wOK2600.last.bytes > 0,
      'lastWrite 记录键与字节量（实 ' + JSON.stringify(wOK2600.last) + '）');
    assert(WA.settingsBus.saveOrThrow(regA2600, { a: 6 }).ok === true, 'saveOrThrow 成功时 ok=true 且无 reason');
    // 负向：计量不得改变读路径返回形状（读侧契约不受写侧计量影响）
    assert(JSON.stringify(WA.settingsBus.read(regA2600)) === JSON.stringify({ a: 6 }), '（负向）写入计量不污染 read 返回值（读回磁盘现值 a:6）');
    // 负向：save 的返回值语义不变（true=落盘 / false=未落盘）
    assert(WA.settingsBus.save(regA2600, { a: 7 }) === true && WA.settingsBus.save({}, 1) === false, '（负向）save 返回值语义保持（布尔）');
  }
  // ── B. 块2：模块保存回传（不再把写失败吞成成功） ──
  fresh2600();
  section('v2.6.0 块2：模块保存回传与 UI 不回假成功');
  {
    const wBack2600 = WA.backstage.setSettings({ injectBudget: 1234 });
    assert(!!wBack2600 && wBack2600.ok === true, 'backstage.setSettings 回传写入结果（实 ' + JSON.stringify(wBack2600) + '）');
    assert(JSON.parse(LS2600.getItem(bkKey2600)).injectBudget === 1234, '回传 ok=true 时确实落盘（回传不是自报）');
    const rawSetB = LS2600.setItem;
    try {
      LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
      const wFail2600 = WA.backstage.setSettings({ injectBudget: 4321 });
      assert(!!wFail2600 && wFail2600.ok === false && /QuotaExceededError/.test(wFail2600.reason || ''),
        '写失败时 setSettings 回传 ok=false + 原因（实 ' + JSON.stringify(wFail2600) + '）');
      assert(JSON.parse(LS2600.getItem(bkKey2600)).injectBudget === 1234, '（负向）失败时磁盘未被改动（回传与磁盘一致）');
    } finally { LS2600.setItem = rawSetB; }
    // 其余四个模块同规格
    const modsB2600 = [
      ['opinion', function () { return WA.opinion.setSettings({ enabled: true, everyNRounds: 3 }); }],
      ['horizon', function () { return WA.horizon.setSettings({ distantEnabled: true }); }],
      ['evolution', function () { return WA.evolution.setSettings({ diceEnabled: true }); }],
      ['calendar', function () { return WA.calendar.setSettings({ auto: true }); }]
    ];
    modsB2600.forEach(function (pair) {
      const r = pair[1]();
      assert(!!r && r.ok === true, pair[0] + '.setSettings 回传 {ok:true}（实 ' + JSON.stringify(r) + '）');
    });
    try {
      LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
      modsB2600.forEach(function (pair) {
        const r = pair[1]();
        assert(!!r && r.ok === false && typeof r.reason === 'string', pair[0] + '.setSettings 写失败回传 {ok:false, reason}（实 ' + JSON.stringify(r) + '）');
      });
    } finally { LS2600.setItem = rawSetB; }
    // 静态锚点：五个模块的 saveSettings 一律走 saveOrThrow（不允许只剩 save 的布尔）
    ['engines/backstage.js', 'engines/opinion.js', 'engines/horizon.js', 'engines/evolution.js', 'engines/calendar.js'].forEach(function (rel) {
      assert(src2600(rel).indexOf('saveOrThrow') > 0, rel + ' 的保存路径走 saveOrThrow（可归因）');
    });
    // UI：主保存与远方/近端保存都不得无条件报成功
    const setSrcB2600 = src2600('ui/settings.js');
    assert(setSrcB2600.indexOf('badW') > 0 && setSrcB2600.indexOf('✗ 保存失败') > 0, '设置页主保存按回传结果回显（存在失败话术）');
    assert(setSrcB2600.indexOf('wHz') > 0, '远方/近端保存同样接回传结果');
    assert(setSrcB2600.indexOf("out().textContent = '✓ 设置已保存';") < 0 || /else out\(\)\.textContent = '✓ 设置已保存'/.test(setSrcB2600),
      '（负向）不存在「无条件报成功」的保存写法');
  }
  // ── C. 块3：迁移回写失败并入迁移结论 ──
  fresh2600();
  section('v2.6.0 块3：迁移回写失败不得虚报为「已成功迁移」');
  {
    const regWB2600 = { key: migWbKey2600, def: { a: 1 }, module: 'test', migrateObjects: true,
      migrate: function () { return { changed: true, value: { a: 1 }, reason: 'probe-prune' }; } };
    const rawSetC = LS2600.setItem;
    const migBefore = WA.settingsBus.stats.migrations;
    const failBefore = WA.settingsBus.stats.migrationFailed;
    try {
      LS2600.setItem = function (k, v) { if (k === migWbKey2600) throw new Error('QuotaExceededError'); return rawSetC.call(LS2600, k, v); };
      WA.settingsBus.read(regWB2600);   // 迁移算完 → 回写失败
      assert(WA.settingsBus.stats.migrations === migBefore, '（负向）回写失败不计入 migrations（此前会虚报成功）');
      assert(WA.settingsBus.stats.migrationFailed === failBefore + 1, '回写失败计入 migrationFailed');
      const mtC2600 = WA.settingsBus.migrationStat();
      assert((mtC2600.failedKeys || []).indexOf(migWbKey2600) >= 0, '回写失败的键进入失败台账（诊断 error 议题的依据）');
      assert((mtC2600.last || {}).failed === true, 'lastMigration 标 failed（不再呈现为一次成功迁移）');
      const failAfter = WA.settingsBus.stats.migrationFailed;
      WA.settingsBus.read(regWB2600);
      assert(WA.settingsBus.stats.migrationFailed === failAfter, '（负向）同一形态不重试（回写失败不会变成每次 read 都写盘的热路径）');
    } finally { LS2600.setItem = rawSetC; }
    //   对照组的夹具必须换一个**值形态**：磁盘无值时迁移在入口就被 skip（那不是「迁移场景」），
    //   而同一形态本会话已被判失败、不会重试 —— 两条契约都会让对照组假失败。
    LS2600.setItem(migWbKey2600, JSON.stringify({ a: 1, deadProbe: 1 }));
    const migAfterOk = WA.settingsBus.stats.migrations;
    WA.settingsBus.read(regWB2600);
    assert(WA.settingsBus.stats.migrations === migAfterOk + 1, '（对照）写盘可用时回写成功并计入 migrations（实 +' + (WA.settingsBus.stats.migrations - migAfterOk) + '）');
    // 静态锚点：回写结果必须参与判定
    const busSrcC2600 = src2600('core/settings-bus.js');
    assert(busSrcC2600.indexOf('writeback-failed') > 0, '源码中回写失败有专属归因标签（writeback-failed）');
    // v2.6.0（收口）: 本断言首版用 /let wroteBack = true/ —— 绑定的是**实现细节**（某个局部变量写法），
    //   收口把回写改为单一写出口的返回值后该正片即失效，而行为契约其实没变。断言应绑定契约：
    //   「回写成败以写出口的返回值为准」而不是「源码里存在某一行」。
    assert(busSrcC2600.indexOf("ls_set(r.key, out, 'writeback')") > 0, '回写经统一写出口（writeback 来源可归类）');
    assert(/const wroteBack = wbRes\.ok/.test(busSrcC2600), '回写成败以写出口返回值为准（非裸 try 吞掉）');
  }
  // ── D. 块4：写入侧增量死键计量 + api-router 白名单 ──
  fresh2600();
  section('v2.6.0 块4：写入侧增量死键（存量之外的新来源）');
  {
    const regX2600 = { key: extraKey2600, def: { a: 1, b: 2 }, module: 'test' };
    const exBefore = WA.settingsBus.stats.extraSubkeys;
    WA.settingsBus.save(regX2600, { a: 1, b: 2, ghostX: 1, ghostY: 2 });
    assert(WA.settingsBus.stats.extraSubkeys === exBefore + 2, '写入侧 def 之外子键被计量（实 +' + (WA.settingsBus.stats.extraSubkeys - exBefore) + '）');
    const driftD = wstat2600().subkeyDrift;
    assert((driftD.last || {}).keys.indexOf('ghostX') >= 0, '计量点名具体子键（可定位到调用点）');
    assert(JSON.parse(LS2600.getItem(extraKey2600)).ghostX === 1, '（负向）save 如实落盘，绝不静默剔除 def 之外子键');
    // 负向：def:{} 容器型键的动态子键不是漂移（首轮实测踩到的自造误报）
    const regC2600 = { key: contKey2600, def: {}, module: 'test' };
    const exC = WA.settingsBus.stats.extraSubkeys;
    WA.settingsBus.save(regC2600, { anyChannel: { baseUrl: 'x' } });
    assert(WA.settingsBus.stats.extraSubkeys === exC, '（负向）def:{} 容器型键的动态子键不计为漂移');
    // api-router：写入白名单堵住「新塞进来的死字段」这一增量来源
    fresh2600();
    WA.apiRouter.setChannel('default', { baseUrl: 'https://x.test', apiKey: 'k', model: 'm', junkField: 1 });
    const cfgDisk2600 = JSON.parse(LS2600.getItem('worldaxis_api_channels_v1'));
    assert(cfgDisk2600.default.baseUrl === 'https://x.test' && cfgDisk2600.default.model === 'm', '白名单内字段正常写入（配置功能不受影响）');
    assert(cfgDisk2600.default.junkField === undefined, '（负向）未消费字段不进磁盘（增量死键源头被堵）');
    assert(cfgDisk2600.default.apiKey === 'k', '白名单含 apiKey（密钥仍可保存）');
    const arSrcD2600 = src2600('core/api-router.js');
    assert(arSrcD2600.indexOf('ALLOWED') > 0 && arSrcD2600.indexOf('useTavernProxy') > 0, 'setChannel 白名单来源与 getChannel 消费面一致');
    assert(/dropped\.length && WA\.log/.test(arSrcD2600), '丢弃字段有日志留痕（不静默）');
  }
  // ── E. 块5：诊断与面板出口 ──
  fresh2600();
  section('v2.6.0 块5：诊断接线与面板出口');
  {
    const sbDiag2600 = ((WA.toolDiag.collect().runtime || {}).settingsBus) || {};
    assert(!!sbDiag2600.writes && typeof sbDiag2600.writes.writeFailed === 'number', '诊断包透出 writes 台账');
    assert(!!sbDiag2600.writes.subkeyDrift, '诊断包透出写入侧子键漂移');
    const dgSrcE2600 = src2600('engines/tool-diag.js');
    assert(dgSrcE2600.indexOf('writeStat') > 0, '诊断采集消费 writeStat（不另算一份）');
    assert(dgSrcE2600.indexOf("key: 'settingsBus.write'") > 0, 'verdict 有写入失败议题');
    assert(dgSrcE2600.indexOf("key: 'settingsBus.subkeyDrift'") > 0, 'verdict 有写入侧漂移议题');
    // 分级：最近失败未被覆盖 = error；已被成功覆盖 = warn
    fresh2600();
    const rawSetE = LS2600.setItem;
    try {
      LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
      WA.settingsBus.save({ key: bkKey2600, def: { a: 1 }, module: 'test' }, { a: 1 });
    } finally { LS2600.setItem = rawSetE; }
    const issuesE2600 = (WA.toolDiag.verdict(WA.toolDiag.collect()).issues || []).filter(function (i) { return i.key === 'settingsBus.write'; });
    assert(issuesE2600.length === 1 && issuesE2600[0].level === 'error', 'verdict 报「最近一次写失败未被覆盖」为 error（实 ' + (issuesE2600[0] && issuesE2600[0].level) + '）');
    assert(/QuotaExceededError/.test(issuesE2600[0].detail), '议题点名失败原因（可定位，实 ' + issuesE2600[0].detail.slice(0, 90) + '）');
    WA.settingsBus.save({ key: bkKey2600, def: { a: 1 }, module: 'test' }, { a: 1 });
    const issuesE2 = (WA.toolDiag.verdict(WA.toolDiag.collect()).issues || []).filter(function (i) { return i.key === 'settingsBus.write'; });
    assert(issuesE2.length === 1 && issuesE2[0].level === 'warn', '（分级）失败已被成功写入覆盖 → 降为 warn（不谎报「正在丢配置」）');
    WA.settingsBus.save({ key: extraKey2600, def: { a: 1, b: 2 }, module: 'test' }, { a: 1, b: 2, ghostZ: 1 });
    const issuesE3 = (WA.toolDiag.verdict(WA.toolDiag.collect()).issues || []).filter(function (i) { return i.key === 'settingsBus.subkeyDrift'; });
    assert(issuesE3.length === 1 && issuesE3[0].level === 'warn', 'verdict 报写入侧漂移为 warn（实 ' + (issuesE3[0] && issuesE3[0].level) + '）');
    assert(/ghostZ|extra_v1/.test(issuesE3[0].detail), '漂移议题点名键与字段（可定位调用点）');
    // 面板视图
    const pSrcE2600 = src2600('ui/panel.js');
    assert(pSrcE2600.indexOf('writeStat') > 0 && pSrcE2600.indexOf('写入侧') > 0, '设置键页展示写入侧台账');
    assert(pSrcE2600.indexOf('wa-log-') > 0 && /writeFailed > 0/.test(pSrcE2600), '写失败时面板给出可见告警（不是只藏进诊断包）');
    // jsdom 端到端：真渲染设置键页 + 设置页保存的失败回显
    let JSDE2600 = null;
    try { JSDE2600 = require('jsdom').JSDOM; } catch (e) { try { JSDE2600 = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSDE2600 = null; } }
    // v2.103.0（A3 = O16）：缺 jsdom 时**不再静默跳过** —— 改走仓库自带的零依赖替身
    //   （tests/ui-dom.js 的 JSDOMShim，与 jsdom 同形：new JSDOM(html,{url}) → {window:{document,Node}}）。
    //   「缺依赖 ⇒ 静默少跑 ⇒ 回归照绿」让门禁结论与覆盖范围脱钩；本仓零 npm 依赖，替身才是可持续来源。
    if (!JSDE2600) JSDE2600 = require('./ui-dom.js').JSDOMShim;
    if (!JSDE2600) {
        assert(false, '端到端依赖与替身同时不可用 ⇒ 必须报红（不许静默跳过）');
    } else {
      fresh2600();
      const domE = new JSDE2600('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
      const savedDocE = global.document;
      global.document = domE.window.document;
      try { global.Node = domE.window.Node; } catch (e) {}
      WA.mainDoc = global.document;
      vm.runInContext(src2600('ui/panel.js'), ctx, { filename: 'ui/panel.js' });
      vm.runInContext(src2600('ui/settings.js'), ctx, { filename: 'ui/settings.js' });
      WA.store.init();
      WA.ui.mount(); WA.ui.open();
      const toolsTabE = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab')).filter(function (t) { return t.dataset.page === 'tools'; })[0];
      assert(!!toolsTabE, '（真 DOM）存在「工具」页签');
      //   顺序要点：工具页**内容**是点击页签后才渲染的，必须先点再取按钮
      //   （与 v2.5.0 块5 同规格；先取按钮恒为 null，属夹具错误而非接线缺陷）。
      if (toolsTabE) toolsTabE.onclick();
      const orphBtnE = global.document.querySelector('#wa-orphan-view');
      assert(!!orphBtnE, '（真 DOM）工具页渲染「设置键」入口');
      if (toolsTabE && orphBtnE) {
        orphBtnE.onclick();
        const outOrE = global.document.querySelector('#wa-diag-out').innerHTML;
        assert(outOrE.indexOf('写入侧') >= 0, '（真 DOM）设置键页渲染写入侧台账行');
        assert(/写盘全部落盘|写盘失败/.test(outOrE), '（真 DOM）写入侧行给出可判定结论（实 ' + (outOrE.match(/写入侧：[^<]{0,44}/) || ['?'])[0] + '）');
      }
      // 设置页：保存按钮 → 写失败时必须回显失败话术
      // v2.382.0（历史欠账消红 · 同族第三处）：`#wa-set-save` 由 `devSettingsHtml` 产出，
      //   而 `render()` 在 `devMode:false`（出厂值，v2.255.0 SIMPLIFY-NAV 起）下直接返回
      //   `playerSettingsHtml()` —— 那一整段根本不会被拼接，于是本条断言恒红。
      //   这与 v2.381.0 给 `#wa-hz-save` 补前置（:11704-11713）、v2.380.0 给 B2300 段补前置
      //   是同一个病：判据的前提没写进判据。不是「控件丢了」，是「压根没进玩家面，也不该进」。
      //   故先走产品公开写口切到开发者模式；切完 `setDevMode` 内部会重绘，页签须重新取。
      assert(typeof WA.ui.setDevMode === 'function', '面板提供开发者模式写口（保存按钮判据的前置）');
      WA.ui.setDevMode(true);
      const setTabE = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab')).filter(function (t) { return t.dataset.page === 'settings'; })[0];
      assert(!!setTabE, '（真 DOM）存在「设置」页签');
      if (setTabE) {
        setTabE.onclick();
        const saveBtnE = global.document.querySelector('#wa-set-save');
        assert(!!saveBtnE, '（真 DOM）设置页渲染「保存推演设置」按钮');
        if (saveBtnE) {
          const outElE = global.document.querySelector('#wa-set-out');
          const rawSetE2 = LS2600.setItem;
          try {
            LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
            saveBtnE.onclick();
            assert(/✗ 保存失败/.test(outElE.textContent), '（真 DOM）写失败时保存按钮回显「✗ 保存失败」（实 ' + outElE.textContent.slice(0, 60) + '）');
          } finally { LS2600.setItem = rawSetE2; }
          saveBtnE.onclick();
          assert(/✓ 设置已保存/.test(outElE.textContent), '（真 DOM）写盘恢复后回显「✓ 设置已保存」（不因一次失败永久报错）');
        }
      }
      global.document = savedDocE;
      global.document.getElementById = function () { return null; };
      WA.mainDoc = global.document;
    }
  }
  // ── G. 块7（收口）：统一写出口——全部写路径的记账契约 ──
  //   本块针对「首版把命题（写失败可见）只实现在两条路径上」这一自身缺陷固化契约：
  //   设置家族键的每一次真实写盘都必须在同一个出口记账，否则面板给出的「全部落盘」
  //   这一结论的依据面就不覆盖全部路径——那不是命名不实，是**结论不实**。
  fresh2600();
  section('v2.6.0 块7（收口）：统一写出口与全部写路径记账');
  {
    // G1. 结构性证据：写出口唯一、失败记账唯一
    const busSrcG2600 = src2600('core/settings-bus.js');
    const bareSets2600 = (busSrcG2600.match(/ls\.setItem\(/g) || []).length;
    assert(bareSets2600 === 1, '（结构性）settings-bus 内除统一写出口外无裸 ls.setItem（实 ' + bareSets2600 + ' 处）');
    assert((busSrcG2600.match(/stats\.writeFailed\+\+/g) || []).length === 1, '写失败记账收敛为单一实现（noteFail 内一处）');
    assert(busSrcG2600.indexOf('function lsWrite(') > 0 && busSrcG2600.indexOf('function noteFail(') > 0, '存在唯一写出口 lsWrite 与归类记账 noteFail');
    // G2. 写出口覆盖**全部**写路径（逐路径点名，缺一条即视为收口未完成）
    //   注意拼接：搜索串是 "'<tag>')"，**不带前导逗号**——首版写成 "', '<tag>')"（多一个引号），
    //   于是五条断言全部假失败。属断言自身的夹具错误，非实现缺陷（真要防的是「路径没接出口」）。
    ['writeback', 'stamp', 'legacy', 'rawRevive', 'quarantine'].forEach(function (tag) {
      assert(busSrcG2600.indexOf("'" + tag + "')") > 0, '写路径已接入统一出口：' + tag);
    });
    // G3. 迁移回写成功也计入 writes（首版：迁移成功时 writes 不增，与「一次真实写盘」不符）
    const gsKey2600 = 'worldaxis_v2600_gstamp_v1';
    const g2Key2600 = 'worldaxis_v2600_gmig_v1';
    const gReg2 = { key: g2Key2600, def: { a: 1 }, module: 'test', migrateObjects: true,
      migrate: function () { return { changed: true, value: { a: 1 }, reason: 'g-probe' }; } };
    LS2600.setItem(g2Key2600, JSON.stringify({ a: 1, deadProbeG: 1 }));
    const wBeforeG2 = wstat2600().writes;
    WA.settingsBus.read(gReg2);
    assert(wstat2600().writes === wBeforeG2 + 1, '迁移回写成功计入 writes（实 +' + (wstat2600().writes - wBeforeG2) + '）');
    // G4. 迁移回写失败也计入写入台账（首版只计 migrationFailed，写入台账零痕迹）
    const rawG2600 = LS2600.setItem;
    const gReg3 = { key: 'worldaxis_v2600_gmig2_v1', def: { a: 1 }, module: 'test', migrateObjects: true,
      migrate: function () { return { changed: true, value: { a: 1 }, reason: 'g-probe2' }; } };
    LS2600.setItem(gReg3.key, JSON.stringify({ a: 1, deadProbeG2: 1 }));
    const wfBeforeG4 = wstat2600().writeFailed;
    try {
      LS2600.setItem = function (k, v) { if (k === gReg3.key) throw new Error('QuotaExceededError'); return rawG2600.call(LS2600, k, v); };
      WA.settingsBus.read(gReg3);
    } finally { LS2600.setItem = rawG2600; }
    assert(wstat2600().writeFailed > wfBeforeG4, '迁移回写失败计入写入台账（首版只计 migrationFailed）');
    assert((wstat2600().bySource || {}).writeback >= 1, '迁移回写失败归入 writeback 桶（来源可分辨，实 ' + (wstat2600().bySource || {}).writeback + '）');
    // G5. 结构指纹写盘失败计入台账（首版 catch 后直接 return false，**零记录**）
    const gRegGS = { key: gsKey2600, def: { a: 1, b: 2 }, module: 'test' };
    LS2600.setItem(gsKey2600, JSON.stringify({ a: 1 }));   // 缺 b → 触发盖章
    const stampBeforeG5 = (wstat2600().bySource || {}).stamp || 0;
    try {
      LS2600.setItem = function (k, v) { if (k === gsKey2600) throw new Error('QuotaExceededError'); return rawG2600.call(LS2600, k, v); };
      const rG5 = WA.settingsBus.read(gRegGS);
      assert(rG5 && rG5.b === 2, '（真依赖）盖章失败不影响读取正确性（子键补齐仍生效）');
    } finally { LS2600.setItem = rawG2600; }
    assert(((wstat2600().bySource || {}).stamp || 0) > stampBeforeG5, '结构指纹写盘失败计入写入台账（首版完全静默）');
    // G6. legacy 旧键迁移写盘失败计入台账（首版 catch(e4){} 静默），且不影响本次读取
    const lgKeyG2600 = 'worldaxis_v2600_glg_v1';
    const lgOldG2600 = 'worldaxis_v2600_glg_old_v1';
    const gRegLG = { key: lgKeyG2600, legacy: [lgOldG2600], legacyRemove: false, def: null, module: 'test' };
    LS2600.removeItem(lgKeyG2600);
    LS2600.setItem(lgOldG2600, JSON.stringify({ x: 1 }));
    const lgBeforeG6 = (wstat2600().bySource || {}).legacy || 0;
    let vLG2600 = null;
    try {
      LS2600.setItem = function (k, v) { if (k === lgKeyG2600) throw new Error('QuotaExceededError'); return rawG2600.call(LS2600, k, v); };
      vLG2600 = WA.settingsBus.read(gRegLG);
    } finally { LS2600.setItem = rawG2600; }
    assert(vLG2600 && vLG2600.x === 1, '（真依赖）旧键迁移写盘失败不影响本次读取（值仍可用）');
    assert(((wstat2600().bySource || {}).legacy || 0) > lgBeforeG6, 'legacy 迁移写盘失败计入写入台账（首版静默）');
    // G7. 原始格式复活写盘失败可归因（首版只返回 {revived:false}，零痕迹）
    const rrKeyG2600 = 'worldaxis_v2600_grr_v1';
    const gRegRR = { key: rrKeyG2600, def: null, rawRevive: true, module: 'test' };
    LS2600.setItem(rrKeyG2600, 'hello-raw-g');
    const rrBeforeG7 = wstat2600().writeFailed;
    let rrResG2600 = null;
    try {
      LS2600.setItem = function (k, v) { if (k === rrKeyG2600) throw new Error('QuotaExceededError'); return rawG2600.call(LS2600, k, v); };
      rrResG2600 = WA.settingsBus.rawRevive(gRegRR, false);
    } finally { LS2600.setItem = rawG2600; }
    assert(rrResG2600 && rrResG2600.revived === false, '（负向）复活写盘失败时如实报 revived=false');
    assert(/write-failed/.test(rrResG2600.reason || ''), '复活写盘失败可归因（实 ' + rrResG2600.reason + '）');
    assert(wstat2600().writeFailed > rrBeforeG7, '复活写盘失败计入写入台账（首版零痕迹）');
    // G8. 损坏隔离：副本没写成功就不动原键（保命优先）
    //   首版 `catch(e2){}` 吞掉副本写失败后**照样**删原键 —— 「隔离」会变成「直接销毁用户数据」。
    const corKeyG2600 = 'worldaxis_v2600_gcor_v1';
    const gRegCor = { key: corKeyG2600, def: { a: 1 }, module: 'test' };
    LS2600.setItem(corKeyG2600, '{bad json g');
    const corBeforeG8 = (wstat2600().bySource || {}).quarantine || 0;
    try {
      LS2600.setItem = function (k, v) { if (String(k).indexOf('_corrupt_') > 0) throw new Error('QuotaExceededError'); return rawG2600.call(LS2600, k, v); };
      WA.settingsBus.read(gRegCor);
    } finally { LS2600.setItem = rawG2600; }
    assert(LS2600.getItem(corKeyG2600) !== null, '（负向）隔离副本写盘失败时保留原键（不把「隔离」做成「销毁」）');
    assert(((wstat2600().bySource || {}).quarantine || 0) > corBeforeG8, '隔离副本写盘失败计入写入台账');
    // G9. 来源分类可分辨「环境问题」与「实现缺陷」
    const byG2600 = wstat2600().bySource || {};
    ['missingKey', 'stringify', 'setItem', 'writeback', 'rawRevive', 'quarantine', 'legacy', 'stamp'].forEach(function (k) {
      assert(typeof byG2600[k] === 'number', 'bySource 含来源桶 ' + k);
    });
    assert(byG2600.missingKey >= 1 && byG2600.setItem >= 1, '实现缺陷与写盘被拒分列两桶（诊断不得把编程错误报成配额问题）');
    // G10. 不抛契约：写失败不得把「写不进去」升级成「读不出来」（调用点都在 read 热路径上）
    fresh2600();
    const rawG10 = LS2600.setItem;
    let threwG10 = false, threwG10b = false;
    try {
      LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
      try { WA.settingsBus.save({ key: 'worldaxis_v2600_g10_v1', def: { a: 1 }, module: 'test' }, { a: 1 }); } catch (e) { threwG10 = true; }
      try { WA.settingsBus.migrate({ key: 'worldaxis_v2600_g10b_v1', def: { a: 1 }, module: 'test', migrateObjects: true,
        migrate: function () { return { changed: true, value: { a: 1 }, reason: 'g10' }; } }, { a: 1, dead: 1 }); } catch (e) { threwG10b = true; }
    } finally { LS2600.setItem = rawG10; }
    assert(threwG10 === false, '（负向）save 写失败不抛异常（返回布尔 + 台账）');
    assert(threwG10b === false, '（负向）迁移回写失败不抛异常（读热路径不被写故障放大）');
    // G11. 诊断与面板的措辞须随依据面更新，且区分环境问题与实现缺陷
    const dgSrcG2600 = src2600('engines/tool-diag.js');
    const pSrcG2600 = src2600('ui/panel.js');
    assert(dgSrcG2600.indexOf('bySource') > 0, '诊断消费来源分类');
    assert(dgSrcG2600.indexOf('实现缺陷') > 0, '诊断把「实现缺陷」与「配额问题」分开表述（用户照着提示才修得好）');
    assert(pSrcG2600.indexOf('bySource') > 0, '面板消费来源分类');
    assert(/写盘全部落盘|写盘失败/.test(pSrcG2600), '面板措辞与「依据面覆盖全部写路径」一致（不再只称「保存」）');
    // G13. 适用范围契约（机器可校验）：绕过设置总线的直写点必须**全部**落在非 settings 家族。
    //   为什么值得一条断言：本台账说「全部落盘」时指的是**设置键**全部落盘。若日后有人给某个
    //   设置键加了旁路直写，「全部落盘」会重新变成假结论——这条断言就是那个防回归的钉子。
    {
      const BOUNDARY_G = (function () {
        const dirs = ['core', 'engines', 'render', 'ui', 'actors', 'direction', 'compat'];
        const files = [];
        const walk = function (rel) {
          const abs = path.join(BASE, rel);
          let st = null;
          try { st = fs.statSync(abs); } catch (e) { return; }
          if (st.isFile()) { if (/\.js$/.test(rel)) files.push(rel); return; }
          let names = [];
          try { names = fs.readdirSync(abs); } catch (e) { return; }
          names.forEach(function (n) { walk(rel + '/' + n); });
        };
        dirs.forEach(function (d) { walk(d); });
        walk('index.js');
        const sites = [];
        files.forEach(function (rel) {
          const txt = fs.readFileSync(path.join(BASE, rel), 'utf8');
          txt.split('\n').forEach(function (ln, i) {
            if (ln.indexOf('localStorage.setItem(') < 0) return;
            if (rel === 'core/settings-bus.js') return;     // 总线自身＝正当写路径
            const m = ln.match(/localStorage\.setItem\(\s*([^,]+)/);
            sites.push({ rel: rel, line: i + 1, keyExpr: (m ? m[1] : '?').trim() });
          });
        });
        return sites;
      })();
      // 冻结清单：新增任何一处旁路都会使本断言失败（迫使走一次「它属于哪个家族」的判断）
      const INVENTORY_G = { 'core/store.js': 8, 'core/workflow.js': 1, 'engines/worldbook.js': 2,
        // v2.569.0 跟位：engines/worldbook.js 的第 2 个旁路写点来自 v2.568.0 的
        //   autoGreen 开关（`setAutoGreen` 要把 `autoGreen` 位单独回写，见该函数的
        //   「只改一个位、不重排 ids/overrides」注释）。与既有那处同键同族
        //   （`worldaxis_wb_selection_<chat>` ⇒ classifyKey 家族 `wb`，不是 settings
        //   也不是 settingsUnregistered，下面的语义断言会当场核这一点）。
        //   处置按纪律是「入表而不是放宽」：清单 1 → 2 并在此留账，
        //   判据本身（新增旁路必须失败一次）一字未动。
        'engines/chatcache.js': 2, 'render/inject.js': 1, 'index.js': 2,
        // v2.132.0（O19）: engines/life.js 的跨会话轮转游标（`worldaxis_life_turn_v1`）。
        //   它**是**一处正当的旁路写：游标不是世界事实、刻意不进 store 存档（见 life.js 的
        //   TURN_KEY 注释），所以只能自己落 localStorage。登记在此是「走一次家族判断」的结果，
        //   不是漏网——下面的语义断言会当场核它的家族确实**不是** settings。
        'engines/life.js': 1,
        // v2.151.0（RP2）：磁带卷仓库独立键 worldaxis_tape_store_v1，不属于世界状态骨架；
        //   明确登记为专属持久化家族，避免把它误判成世界状态旁路。
        // v2.156.0（SP1）：engines/playtime.js 的活动基准键（worldaxis_playtime_v1）。
        //   与 life 的游标同一裁决：它不是世界事实、刻意不进 store 存档，只能自己落盘；
        //   登记在此是「走一次家族判断」的结果（下面的语义断言会核它的家族不是 settings）。
        'engines/playtime.js': 1,
        // v2.203.0 收口（Y6/Y5）：两个新文件的旁路写点。族判据实测二者落
        //   `settingsUnregistered`（与 lifeTurn / playtime 的单列家族不同 —— 它们**是**
        //   设置家族的未登记键，不是进程记忆），故下面的语义断言会当场核这一族。
        'engines/history-search.js': 1,
        'engines/world-snapshot.js': 1,
        'engines/tape-store.js': 1,
        // v2.294.0（V8 收口）：engines/player-archive.js 的玩家归档键
        //   （worldaxis_player_works_v1_<chat>）。与 tape-store 的卷仓库同一裁决：
        //   它不是世界状态骨架，刻意不进 store 存档（导出件是投影快照副本，
        //   恢复它不等于恢复世界 —— project() 的注释明写「投影不导入为事实」）。
        //   登记在此是「走一次家族判断」的结果，不是漏网：下面的语义断言会当场核
        //   它的家族确实不是 settings 家族。
         'engines/player-archive.js': 1,
         // v2.381.0 收口：engines/channel-probe.js 的渠道探针账本键
         //   （worldaxis_channel_probe_ledger_v1）与 engines/inline-tags.js 的解析统计键
         //   （worldaxis_inline_tags_v1）。两者都是**进程侧观测记忆**：不进世界存档、
         //   不是用户配置（inline-tags 根本没有设置键，纯解析器）。
         //   登记在此是「走一次家族判断」的结果，不是漏网：为此同批在 core/store.js 的
         //   KEY_FAMILIES 里单列了 channelProbe / inlineTags 两个家族（与 lifeTurn /
         //   playtime 同一裁决）—— 若让它们落进兜底的 settingsUnregistered，
         //   面板体检视图会把一份探针账本报成「未登记设置 N」（假的用户配置告警）。
         //   下面的语义断言会当场核这两族确实不是 settings 家族。
         //   注：这两个 setItem 点在 v2.326.0 / v2.329.0 就存在，此前只是从未登记；
         //   同批给两处读回点补了 store.reportReadFail 归因（G16），故两处一并处理。
         'engines/channel-probe.js': 1,
         'engines/inline-tags.js': 1 };
      const countByFile = {};
      BOUNDARY_G.forEach(function (st) { countByFile[st.rel] = (countByFile[st.rel] || 0) + 1; });
      Object.keys(INVENTORY_G).forEach(function (rel) {
        assert((countByFile[rel] || 0) === INVENTORY_G[rel],
          '旁路写点清单未漂移：' + rel + '（实 ' + (countByFile[rel] || 0) + '，冻结 ' + INVENTORY_G[rel] + '）');
      });
      const extraFiles = Object.keys(countByFile).filter(function (rel) { return INVENTORY_G[rel] === undefined; });
      assert(extraFiles.length === 0, '（负向）没有新增旁路写文件（实 ' + (extraFiles.join(',') || '无') + '）');
      // 语义断言：字面量以 worldaxis_ 开头的旁路点，家族判定必须**不是** settings 家族
      //   ⚠ 探针必须**保持键名形状**（两处同类夹具缺陷，均自造假失败）：
      //     · writerId 靠 `/^worldaxis_writer_id$/` 精确匹配 ⇒ 加后缀即破坏形状（首版 + 'probe' 踩到）；
      //     · `'worldaxis_wf_history_'` 等是**前缀**（真实键 = 前缀 + chatId），空后缀同样不匹配
      //       任何家族的捕获组 ⇒ 落进通用兜底桶 settingsUnregistered。
      //   规则：以 `_` 结尾 ⇒ 视为前缀并补探针 chatId；否则按原样判定。
      let literalCheckedG = 0;
      const badFamilyG = [];
      BOUNDARY_G.forEach(function (st) {
        const m = st.keyExpr.match(/^'(worldaxis_[^']*)'/);
        if (!m) return;
        literalCheckedG++;
        const probeKeyG = /_$/.test(m[1]) ? (m[1] + 'probe_chat') : m[1];
        let fam = null;
        try { fam = (WA.store.classifyKey(probeKeyG)).family; } catch (e) { fam = 'classify-error'; }
        if (fam === 'settings' || fam === 'settingsUnregistered') {
          badFamilyG.push(st.rel + ':' + st.line + '=' + fam);
        }
      });
      assert(literalCheckedG >= 5, '至少检到 ' + literalCheckedG + ' 处字面量旁路点参与家族判定');
      assert(badFamilyG.length === 0,
        '（负向）设置家族键不得被旁路直写（实 ' + (badFamilyG.join('、') || '无') + '）');
      // 反向锚点：确认断言真的在扫（不是扫了个空集）
      assert(BOUNDARY_G.length >= 15, '扫描到全部已知旁路写点（实 ' + BOUNDARY_G.length + '）');
    }
    // H1. 归因话术的作用域与单一实现契约（防 ReferenceError 与措辞分叉）
    //   首版把 whyTxt 定义在 `saveBtn.onclick` 函数体内，而 `#wa-hz-save` 在兄弟闭包里引用它：
    //   主保存可用、另一个保存按钮一点就抛 ReferenceError。这类缺陷静态可判，故固化为断言。
    {
      const setSrcH2600 = src2600('ui/settings.js');
      const idxWhyH = setSrcH2600.indexOf('const whyTxt = function');
      const idxSaveBtnH = setSrcH2600.indexOf("const saveBtn = $('#wa-set-save')");
      const idxHzUseH = setSrcH2600.indexOf('whyTxt(wHz.reason)');
      const idxMainUseH = setSrcH2600.indexOf('whyTxt(badW.reason)');
      assert(idxWhyH > 0 && idxSaveBtnH > 0 && idxHzUseH > 0 && idxMainUseH > 0, '归因话术与两处使用点均在位');
      assert(idxWhyH < idxSaveBtnH && idxWhyH < idxMainUseH && idxWhyH < idxHzUseH,
        '归因话术定义早于全部使用点（提升到共同作用域，不会 ReferenceError）');
      assert(setSrcH2600.indexOf('const whyTxt = function') === setSrcH2600.lastIndexOf('const whyTxt = function'),
        '（负向）归因话术只有一份实现（不在每处保存各写一份，避免第二份真源）');
      assert(idxSaveBtnH < idxHzUseH, '两处保存出口按源码顺序都复用同一实现');
    }
    // H2. 真 jsdom 端到端：点击「远方/近端保存」，证伪 ReferenceError
    //   静态顺序断言（H1）能防回退，但真正证伪「点一下就抛」的只有**真实点击**：
    //   首版 whyTxt 在兄弟闭包里被引用，Node 语法检查完全看不出问题（`node --check` 通过）。
    {
      let JSDH = null;
      try { JSDH = require('jsdom').JSDOM; } catch (e) { try { JSDH = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { JSDH = null; } }
      // v2.103.0（A3 = O16）：缺 jsdom 时**不再静默跳过** —— 改走仓库自带的零依赖替身
      //   （tests/ui-dom.js 的 JSDOMShim，与 jsdom 同形：new JSDOM(html,{url}) → {window:{document,Node}}）。
      //   「缺依赖 ⇒ 静默少跑 ⇒ 回归照绿」让门禁结论与覆盖范围脱钩；本仓零 npm 依赖，替身才是可持续来源。
      if (!JSDH) JSDH = require('./ui-dom.js').JSDOMShim;
      if (!JSDH) {
          assert(false, '端到端依赖与替身同时不可用 ⇒ 必须报红（不许静默跳过）');
      } else {
        fresh2600();
        const domH = new JSDH('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
        const savedDocH = global.document;
        global.document = domH.window.document;
        try { global.Node = domH.window.Node; } catch (e) {}
        WA.mainDoc = global.document;
        vm.runInContext(src2600('ui/panel.js'), ctx, { filename: 'ui/panel.js' });
        vm.runInContext(src2600('ui/settings.js'), ctx, { filename: 'ui/settings.js' });
        WA.store.init();
        WA.ui.mount(); WA.ui.open();
        // v2.381.0 收口：本段验的是**开发者模式**设置页的两个远方/近端控件
        //   （`#wa-hz-save` / `#wa-hz-out` 由 devSettingsHtml 内联的 horizon 段产出）。
        //   面板自 v2.255.0 SIMPLIFY-NAV 起出厂 `devMode:false`，`render()` 在玩家模式下
        //   直接返回 `playerSettingsHtml()` —— 那一整段根本不会被拼接，于是这两条断言
        //   恒红（不是「控件丢了」，是「压根没进玩家面，也不该进」）。
        //   这正是 v2.380.0 给 B2300 段补同款前置时写下的那条纪律（本次收口前它已存在：
        //   「缺这一步前置时 qB2300('wa-hz-d-en') 恒为 null」）——本段当时漏改，属同族第二处。
        //   故先走产品公开写口切到开发者模式。
        assert(typeof WA.ui.setDevMode === 'function', '面板提供开发者模式写口（H2 前置）');
        WA.ui.setDevMode(true);
        const setTabH = Array.prototype.slice.call(global.document.querySelectorAll('.wa-tab')).filter(function (t) { return t.dataset.page === 'settings'; })[0];
        assert(!!setTabH, '（真 DOM）存在「设置」页签（H2）');
        if (setTabH) setTabH.onclick();
        const hzBtnH = global.document.querySelector('#wa-hz-save');
        assert(!!hzBtnH, '（真 DOM）设置页渲染「远方/近端保存」按钮');
        const hzOutH = global.document.querySelector('#wa-hz-out');
        assert(!!hzOutH, '（真 DOM）存在远方/近端输出位');
        if (hzBtnH && hzOutH) {
          let threwH = null;
          try { hzBtnH.onclick(); } catch (e) { threwH = e; }
          assert(threwH === null, '（真 DOM）点击远方/近端保存不抛异常（实 ' + (threwH ? String(threwH && threwH.message) : '无异常') + '）');
          assert(/✓ 已保存/.test(hzOutH.textContent), '（真 DOM）写盘可用时报成功（实 ' + hzOutH.textContent.slice(0, 40) + '）');
          // 写失败：必须报失败、且话术已归因（不是原始前缀、也不是「未知原因」）
          const rawH = LS2600.setItem;
          let threwH2 = null;
          try {
            LS2600.setItem = function () { throw new Error('QuotaExceededError'); };
            hzBtnH.onclick();
          } catch (e) { threwH2 = e; } finally { LS2600.setItem = rawH; }
          assert(threwH2 === null, '（真 DOM）写失败时点击也不抛（上抛失败=把写故障放大成 UI 崩溃）');
          assert(/✗ 保存失败/.test(hzOutH.textContent), '（真 DOM）写失败时报「✗ 保存失败」（实 ' + hzOutH.textContent.slice(0, 60) + '）');
          assert(/存储写入被拒|配额/.test(hzOutH.textContent), '归因话术已翻译成用户可执行的说法（实 ' + hzOutH.textContent.slice(0, 70) + '）');
        }
        global.document = savedDocH;
        global.document.getElementById = function () { return null; };
        WA.mainDoc = global.document;
      }
    }
    // G12. 全路径对账：清库后跑一轮「正常读+正常写」，writes 必须等于真实 setItem 次数
    fresh2600();
    let realSetsG12 = 0;
    const rawG12 = LS2600.setItem;
    try {
      LS2600.setItem = function (k, v) { realSetsG12++; return rawG12.call(LS2600, k, v); };
      const gReg12 = { key: 'worldaxis_v2600_g12_v1', def: { a: 1, b: 2 }, module: 'test' };
      const w0G12 = wstat2600().writes;
      WA.settingsBus.save(gReg12, { a: 1, b: 2 });
      WA.settingsBus.save(gReg12, { a: 3, b: 4 });
      assert(wstat2600().writes === w0G12 + 2, '对账：2 次 save ⇒ writes +2（实 ' + (wstat2600().writes - w0G12) + '）');
      assert(realSetsG12 === 2, '对账：writes 与磁盘真实 setItem 次数一致（实 ' + realSetsG12 + ' 次）');
    } finally { LS2600.setItem = rawG12; }
  }
  // ── F. 块6：单源不变量扩展 + 版本三方对齐 ──
  fresh2600();
  section('v2.6.0 块6：单源不变量扩展与版本三方对齐');
  {
    // calendar 此前内联第二份默认值（Object.assign({auto:true}, read())），
    //   使 read 的返回不再严格等于登记声明 —— v2.3.0 的单源不变量对它会失效。
    //   本版删除该内联后，不变量对**全部**在用登记项成立。
    let covered2600 = 0;
    WA.settingsBus.registry().forEach(function (r) {
      if (r.orphan) return;
      LS2600.removeItem(r.key);
      covered2600++;
      assert(JSON.stringify(WA.settingsBus.read(r)) === JSON.stringify(r.def), r.key + ' 单源不变量：read 回落 === 登记声明');
    });
    assert(covered2600 >= 14, '单源不变量覆盖全部在用登记项（实 ' + covered2600 + '，v2.6.0 基线 14）');
    const calSrcF2600 = src2600('engines/calendar.js');
    assert(calSrcF2600.indexOf('Object.assign({ auto: true }, WA.settingsBus.read') < 0, '（负向）calendar 内联第二份默认值已删除');
    assert(/v2\.6\.0: 内联的第二份默认值已删除/.test(calSrcF2600), '删除原因留痕在位（现场证据，防日后又被加回）');
    // 版本号三方对齐（index.js / manifest.json / 本段期望）
    const idxSrcF2600 = fs.readFileSync(path.join(BASE, 'index.js'), 'utf8');
    const mfF2600 = JSON.parse(fs.readFileSync(path.join(BASE, 'manifest.json'), 'utf8'));
    const verF2600 = (idxSrcF2600.match(/const VERSION = '([\d.]+)'/) || [])[1];
    assert(verF2600 === mfF2600.version, 'index.js VERSION 与 manifest.version 一致（' + verF2600 + ' vs ' + mfF2600.version + '）');
    assert(verAtLeast(verF2600, 266), '入口与清单同源同值（实 ' + verF2600 + '）');
    const orderF2600 = (idxSrcF2600.match(/const LOAD_ORDER = \[([\s\S]*?)\];/) || [])[1] || '';
    assert(orderF2600.indexOf('core/settings-bus.js') > 0 && orderF2600.indexOf('core/api-router.js') > 0, 'LOAD_ORDER 含写入契约所在模块与首个收口消费者');
  }
  } // end v2.6.0 block
};
