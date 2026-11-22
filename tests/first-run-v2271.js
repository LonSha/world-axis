'use strict';
/**
 * v2.271.0（V6 · EXV6-7）专锁：**开局引导 —— 第一次开局的三个真实步骤**
 *
 * ── 这一版治的是什么（现场立据见 tools/v6probes/p_firstrun.js）────────────
 * 三步**都有真读数**但没人把它们摆成「你在第几步」：
 *   ① `apiRouter.getChannel()` 三字段全空；② `capabilityTier` 出厂 `lite`；
 *   ③ `store.lastInjection` 不存在且 `evolution.round === 0`。
 *
 * ── 三条不许（每条都在 N 段配真源码破坏与两向自证）────────────────────────
 *   ① **`cannot-tell` 不许折成 done/todo**：读数口不在场时既不算做完也不算没做；
 *      折成 todo 冤枉玩家、折成 done 是假绿。手勾**只**对这一档生效。
 *   ② **环境判得出时手勾不许覆盖**：`mark()` 在 `env-decides` 时必须拒绝写入
 *      （「我点过勾了」不许盖住「其实还没配」）。
 *   ③ **进度落设置族、不落世界**：零 `store.transact`（装机进度是**人**的属性，
 *      写进存档会被分享带给别人）。
 */
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const ENG_FR = 'engines/first-run.js';
const SELF_REL = 'tests/first-run-v2271.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const ANCHOR = {
  // ① cannot-tell 三分支之一：apiRouter 缺席
  pvApiCannot: "return { state: 'cannot-tell', why: 'no-api-router', detail: null };",
  // ② 手勾只在 cannot-tell 这一档生效
  pvManualGate: "if (envState === 'cannot-tell') {",
  // ③ mark() 的环境优先守卫
  pvEnvDecides: "return { ok: false, reason: 'env-decides', state: s.envState,",
  // ④ 「说过第一句话」的两条通路（缺一即会把真开过局的人判成没开口）
  pvTalkTwo: "const said = !!li || (round !== null && round > 0);",
  // ⑤ 三态判决的 env 优先赋值（破坏它 ⇒ 手勾会盖住真读数）
  pvEnvFirst: "let finalState = envState, source = 'env';"
};

function runAll(assertFn) {
  const a = assertFn || function (cond, msg) { if (!cond) throw new Error(msg); };
  require(path.join(BASE, 'tests/mock.js'));
  const WA = global.WorldAxis;
  require(path.join(BASE, 'core/store.js'));
  require(path.join(BASE, 'core/input-guard.js'));
  require(path.join(BASE, 'core/clock.js'));
  require(path.join(BASE, 'core/settings-bus.js'));
  require(path.join(BASE, 'core/api-router.js'));
  require(path.join(BASE, 'engines/capability-tier.js'));
  require(path.join(BASE, 'engines/first-run.js'));

  const FR = WA.firstRun;
  // 设置族直写 helper：capabilityTier 的 setSettings **刻意不导出**（写面只有 applyTier/rollback），
  //   而本锁是精简装载（applyTier 枚举不到引擎）⇒ 用设置族构造「档位是什么」这一事实。
  //   键名从模块源码读，不手写（凭记忆写错过一次：少了 _settings 后缀）。
  const tierSrcForSeed = rd('engines/capability-tier.js');
  const TIER_KEY = (/const LS_KEY = '([^']+)'/.exec(tierSrcForSeed) || [])[1];
  function seedTier(v) {
    WA.settingsBus.saveOrThrow({ key: TIER_KEY, def: { tier: 'lite', granted: [], history: [] }, module: 'capabilityTier', bounds: {} }, v);
  }
  const Ec = rd(ENG_FR);
  const SELF = rd(SELF_REL);

  // ── A 静态契约 ──────────────────────────────────────────────────────────
  Object.keys(ANCHOR).forEach(function (k) {
    const c = cnt(Ec, ANCHOR[k]);
    a(c === 1, 'v2271/A1: 锚点 ' + k + ' 恰中 1 次（实 ' + c + '）');
  });
  const dupA = Object.keys(ANCHOR).filter(function (k) { return cnt(SELF, ANCHOR[k]) > 1; });
  a(dupA.length === 0, 'v2271/A1f: 破坏锚点在 SELF 里只出现 1 次（越界：' + j(dupA) + '）');
  // 零写盘 + 不替别的引擎动手
  a(cnt(Ec, 'store.transact(') === 0, 'v2271/A2a: 零 store.transact 写调用（进度不落世界）');
  a(cnt(Ec, 'localStorage.getItem(') === 0 && cnt(Ec, 'localStorage.setItem(') === 0,
    'v2271/A2b: 零 localStorage 直接读写');
  a(cnt(Ec, 'WA.capabilityTier.setSettings(') === 0, 'v2271/A2c: 绝不替 capabilityTier 切档（只给出口）');
  a(cnt(Ec, 'WA.apiRouter.setChannel(') === 0, 'v2271/A2d: 绝不替玩家写 API');
  a(cnt(Ec, 'saveOrThrow(') === 1, 'v2271/A2e: 唯一写入口是自己的 saveSettings');
  a(typeof FR.build === 'function', 'v2271/A3: build 是函数');
  a(typeof FR.build().line === 'string', 'v2271/A3b: 人话一行由 build() 直接给出（导出面不另立 line 口）');
  a(typeof FR.stat === 'function', 'v2271/A3c: stat 是函数');
  a(typeof FR.reset === 'function', 'v2271/A3d: reset 是函数');
  a(Array.isArray(FR.STEPS) && FR.STEPS.length === 3, 'v2271/A4: 三步定义在场（恰 3）');
  a(FR.DEF.enabled === true, 'v2271/A5: 出厂开着（第一次开局本来就该引导）');
  a(FR.DEF.dismissed === false, 'v2271/A5b: 出厂没被「知道了」遮掉');

  // ── B 运行时 ────────────────────────────────────────────────────────────
  FR.reset(); FR.resetAll();
  WA.store.init();
  FR.setSettings({ enabled: true, dismissed: false, doneApi: false, doneTier: false, doneTalk: false, showWhenDone: false });

  // B1 出厂冷启动：三步各是什么态
  const b1 = FR.build();
  a(b1.ok === true, 'v2271/B1a: build 成功');
  a(b1.cold === true, 'v2271/B1b: 出厂是冷启动');
  a(b1.steps.length === 3, 'v2271/B1c: 三步都报出来');
  const s1 = b1.steps.filter(function (x) { return x.id === 'api'; })[0];
  a(s1.state === 'todo', 'v2271/B1d: 出厂 API 步为 todo（真读得到、确实没配）');
  a(s1.envState === 'todo' || s1.envState === 'unconfigured' || s1.envState === 'todo',
    'v2271/B1e: 环境态判得出（不是 cannot-tell）');
  a(s1.source === 'env', 'v2271/B1f: 态来源标成 env（不是手勾）');
  a(s1.manualAllowed === false, 'v2271/B1g: 环境判得出时不许手勾');
  a(b1.doneCount === 0, 'v2271/B1h: 零步完成');
  a(b1.pendingId === 'api', 'v2271/B1i: 下一步是第一步');
  a(b1.visible === true, 'v2271/B1j: 冷启动时可见');
  a(b1.line.indexOf('下一步是「配一个 API」') >= 0, 'v2271/B1k: line 指出下一步');

  // B2 三步的判据各自真在跑：把世界/档位/API 逐个改成「已做」
  WA.apiRouter.setChannel('default', { baseUrl: 'https://x.example/v1', apiKey: 'k', model: 'm' });
  const b2 = FR.build();
  a(b2.steps[0].state === 'done', 'v2271/B2a: 配了 API 后第一步转 done');
  a(b2.steps[0].detail.configured.indexOf('default') >= 0, 'v2271/B2b: 明细指出哪个通道配好了');
  a(b2.cold === false, 'v2271/B2c: 第一步做完后不再是冷启动');
  a(b2.pendingId === 'tier', 'v2271/B2d: 下一步推进到第二格');

  // 构造「玩家切过档」这一事实。**为什么不用 applyTier**：capability-tier 的 applyTier
  //   要枚举全部引擎并逐个真写开关，而本锁是**精简装载**（只 require 几个模块，
  //   没有完整 LOAD 清单）⇒ mechanisms 为 0、granted 永远空，那是测试环境的局限
  //   而不是产品缺陷。故这里直接写设置族构造**结果**（tier 变成 standard），
  //   判据本身（probeTier 读 getSettings）没有被绕开。
  (function () {
    // 键名**从模块源码读**，不手写 —— 第一版凭记忆写了 'worldaxis_capability_tier_v1'，
    //   而真名是 'worldaxis_capability_tier_settings_v1'（少了 _settings）：写错键
    //   不会报错，shadow 只会静默不生效，判据于是恒定红。这类「凭记忆写字面量」的
    //   失败在守卫眼里与「实现错了」同形，故这里一律从真源码取。
    seedTier({ tier: 'standard', granted: ['probe-a'], history: [] });
  })();
  const b3 = FR.build();
  a(b3.steps[1].state === 'done', 'v2271/B3a: 切了档位后第二步转 done');
  a(b3.pendingId === 'talk', 'v2271/B3b: 下一步推进到第三格');
  a(b3.doneCount === 2, 'v2271/B3c: 完成计数为 2');

  WA.store.transact(function (d) { d.lastInjection = { at: 1, injected: true, len: 10, round: 1, sources: [] }; });
  const b4 = FR.build();
  a(b4.steps[2].state === 'done', 'v2271/B4a: 说过话后第三步转 done');
  a(b4.doneCount === 3, 'v2271/B4b: 三步全完成');
  a(b4.pendingId === null, 'v2271/B4c: 没有待办');
  a(b4.visible === false, 'v2271/B4d: 三步做完且未要求保留 ⇒ 不再可见');
  a(b4.line.indexOf('三步都做完了') >= 0, 'v2271/B4e: line 说明做完了');
  const b4b = FR.build({ showWhenDone: true });
  a(b4b.visible === true, 'v2271/B4f: 要求保留时仍可见');

  // B5 第三条通路：只有 evolution.round 也能判「说过话」
  WA.store.transact(function (d) { delete d.lastInjection; d.evolution.round = 3; });
  a(FR.build().steps[2].state === 'done', 'v2271/B5a: 仅 evolution.round>0 也算说过话（两条通路都要真）');
  WA.store.transact(function (d) { d.evolution.round = 0; });
  a(FR.build().steps[2].state === 'todo', 'v2271/B5b: 两条通路都不成立时转回 todo');

  // B6 cannot-tell 三态（把上游整个摘掉）
  {
    const kR = WA.apiRouter;
    WA.apiRouter = undefined;
    const c1 = FR.build();
    a(c1.steps[0].state === 'cannot-tell', 'v2271/B6a: 缺 apiRouter ⇒ cannot-tell（不折成 todo）');
    a(c1.steps[0].why2 === 'no-api-router', 'v2271/B6b: 判不出的原因带出来');
    a(c1.steps[0].manualAllowed === true, 'v2271/B6c: 判不出时手勾可用');
    WA.apiRouter = kR;
    const kT = WA.capabilityTier;
    WA.capabilityTier = undefined;
    a(FR.build().steps[1].state === 'cannot-tell', 'v2271/B6d: 缺 capabilityTier ⇒ cannot-tell');
    WA.capabilityTier = kT;
    const kS = WA.store;
    WA.store = undefined;
    a(FR.build().steps[2].state === 'cannot-tell', 'v2271/B6e: 缺 store ⇒ cannot-tell');
    WA.store = kS;
  }

  // B7 手勾只兜 cannot-tell；环境判得出时拒绝
  {
    const mk1 = FR.mark('api', true);
    a(mk1.ok === false && mk1.reason === 'env-decides', 'v2271/B7a: 环境判得出时手勾被拒（不许覆盖真读数）');
    // 归一之后 envState 落在三态域里：配了 API 时是 done，没配是 todo ——
  //   此处断言「回报的是归一后的环境态」（不再出现 unconfigured 这种模块专有词）。
  a(mk1.state === 'done' || mk1.state === 'todo', 'v2271/B7b: 拒绝时如实回报归一后的环境态（实 ' + mk1.state + '）');
    const kR = WA.apiRouter;
    WA.apiRouter = undefined;
    const mk2 = FR.mark('api', true);
    a(mk2.ok === true && mk2.marked === true, 'v2271/B7c: 判不出时手勾生效');
    WA.apiRouter = kR;
    // 手勾生效后再看：环境仍是 cannot-tell ⇒ 手勾把它兜成 done
    WA.apiRouter = undefined;
    const c2 = FR.build();
    a(c2.steps[0].state === 'done' && c2.steps[0].source === 'manual', 'v2271/B7d: 手勾把 cannot-tell 兜成 done 并标明来源');
    WA.apiRouter = kR;
    const mk3 = FR.mark('__nope__', true);
    a(mk3.ok === false && mk3.reason === 'unknown-step', 'v2271/B7e: 未知步骤被拒');
    // 手勾不许影响环境判得出的步
    seedTier({ tier: 'lite', granted: [], history: [] });
    FR.mark('tier', true);
    const c3 = FR.build();
    a(c3.steps[1].state === 'todo', 'v2271/B7f: 环境判得出 todo 时手勾不生效（真读数优先）');
    FR.resetAll();
  }

  // B8 出口（只给动作，不替玩家动手）
  const nx = FR.next('tier');
  a(nx && nx.id === 'tier' && nx.do === 'applyTier' && nx.arg === 'standard', 'v2271/B8a: next 给出真动作与参数');
  a(FR.next() !== null, 'v2271/B8b: 无参时给当前待办的出口');

  // B9 dismiss / resume 只写设置族
  FR.dismiss();
  const d1 = FR.build();
  a(d1.dismissed === true && d1.visible === false, 'v2271/B9a: 点「知道了」后不再可见');
  FR.resume();
  a(FR.build().visible === true, 'v2271/B9b: 恢复后重新可见');

  // B10 关闭态
  FR.setSettings({ enabled: false });
  const off = FR.build();
  a(off.ok === false && off.reason === 'disabled', 'v2271/B10a: 关闭态报 disabled');
  a(off.steps.length === 0, 'v2271/B10b: 关闭态不给步骤');
  FR.setSettings({ enabled: true });

  // B11 stat 面（含 cannot-tell 计数）
  const st = FR.stat();
  a(st.sources.apiRouter === true, 'v2271/B11a: stat 报 apiRouter 在位');
  a(st.sources.capabilityTier === true, 'v2271/B11b: stat 报 capabilityTier 在位');
  a(st.sources.store === true, 'v2271/B11c: stat 报 store 在位');
  a(st.apiCannotTell >= 1, 'v2271/B11d: cannot-tell 计数真在涨（不是恒 0）');
  a(typeof st.lastState === 'string' && st.lastState.length > 0, 'v2271/B11e: lastState 记最近一次判决');

  // ── C 零写盘不变式（进度只落设置族）───────────────────────────────────
  const snapBefore = j(WA.store.get());
  for (let i = 0; i < 5; i++) { FR.build(); FR.build().line; FR.stat(); FR.next(); FR.dismiss(); FR.resume(); }
  const snapAfter = j(WA.store.get());
  a(snapBefore === snapAfter, 'v2271/C1: 引导全程零写盘（dismiss/resume 也不碰世界）');
  a(cnt(rd('engines/first-run.js'), 'store.transact(') === 0, 'v2271/C2: 源码里没有任何 store 写调用');

  // ── N 真源码破坏 + 两向自证 ────────────────────────────────────────────
  function loadBroken(srco) {
    const sandboxWA = {
      store: WA.store, settingsBus: WA.settingsBus,
      apiRouter: WA.apiRouter, capabilityTier: WA.capabilityTier,
      registerModule: function () {}
    };
    const G2 = { WorldAxis: sandboxWA };
    const fn = new Function('window', 'global', srco);
    fn(G2, G2);
    return sandboxWA;
  }

  // N1 破坏「缺 apiRouter ⇒ cannot-tell」⇒ 判不到被写成「你没做」
  {
    const bad = Ec.replace(ANCHOR.pvApiCannot,
      "return { state: 'todo', why: 'no-api-router', detail: null };");
    a(bad !== Ec, 'v2271/N1a: N1 源码破坏成功（锚点命中）');
    // ⚠ 顺序要紧：先把上游摘掉，**再**建破坏副本 —— 反过来的话沙箱在建立时就捕获了
    //   真 apiRouter 的引用，`WA.apiRouter = undefined` 只改了外层，副本里照样读得到，
    //   负控制当场假绿（首跑正是这么红的）。
    const kR = WA.apiRouter;
    WA.apiRouter = undefined;
    const w = loadBroken(bad);
    a(FR.build().steps[0].state === 'cannot-tell', 'v2271/N1b: 原版上缺口 ⇒ cannot-tell（两向自证正向半边）');
    a(w.firstRun.build().steps[0].state === 'todo', 'v2271/N1c: 破坏副本上「没量到」长成「你没做」');
    WA.apiRouter = kR;
  }

  // N2 破坏手勾门槛 ⇒ 手勾能覆盖「环境判得出」的步（假绿：点过勾就当作已完成）
  //   现场必须造出**真的 cannot-tell**（摘掉 capabilityTier），否则环境给的是 todo，
  //   两条路径都会拒绝 —— 那样测不出门槛存不存在（首跑踩过的正是这个坑）。
  {
    const bad = Ec.replace(ANCHOR.pvManualGate, 'if (true) {');
    a(bad !== Ec, 'v2271/N2a: N2 源码破坏成功（锚点命中）');
    const kT = WA.capabilityTier;
    WA.capabilityTier = undefined;
    const w = loadBroken(bad);
    a(FR.build().steps[1].state === 'cannot-tell',
      'v2271/N2b: 原版上摘掉模块 ⇒ cannot-tell（两向自证正向半边）');
    seedTier({ tier: 'lite', granted: [], history: [] });
    FR.mark('tier', true);
    a(FR.build().steps[1].state === 'done' && FR.build().steps[1].source === 'manual',
      'v2271/N2c: 原版上手勾把 cannot-tell 兜成 done（这一档本来就该允许手勾）');
    FR.resetAll();
    seedTier({ tier: 'lite', granted: [], history: [] });
    FR.mark('tier', true);
    a(w.firstRun.build().steps[1].state === 'done', 'v2271/N2d: 破坏副本上手勾照旧生效（对照）');
    FR.resetAll();
    WA.capabilityTier = kT;
  }

  // N3 破坏 mark() 的环境优先守卫 ⇒ 环境判得出时仍写入手勾
  {
    const bad = Ec.replace(ANCHOR.pvEnvDecides,
      "return { ok: true, reason: 'env-decides', state: s.envState,");
    a(bad !== Ec, 'v2271/N3a: N3 源码破坏成功（锚点命中）');
    const w = loadBroken(bad);
    seedTier({ tier: 'lite', granted: [], history: [] });
    FR.resetAll();
    const rv = FR.mark('tier', true);
    a(rv.ok === false, 'v2271/N3b: 原版上拒绝写入（两向自证正向半边）');
    const rb = w.firstRun.mark('tier', true);
    a(rb.ok === true, 'v2271/N3c: 破坏副本上「环境判得出」也照写手勾');
    FR.resetAll();
  }

  // N4 破坏「说过话」的第二条通路 ⇒ 只跑过一轮但没注入快照的人被判成没开口
  {
    const bad = Ec.replace(ANCHOR.pvTalkTwo, "const said = !!li || false;");
    a(bad !== Ec, 'v2271/N4a: N4 源码破坏成功（锚点命中）');
    const w = loadBroken(bad);
    WA.store.transact(function (d) { delete d.lastInjection; d.evolution.round = 5; });
    a(FR.build().steps[2].state === 'done', 'v2271/N4b: 原版上 round>0 也算（两向自证正向半边）');
    a(w.firstRun.build().steps[2].state === 'todo', 'v2271/N4c: 破坏副本上第二条通路失效');
    WA.store.transact(function (d) { d.evolution.round = 0; });
  }

  // N5 破坏「env 优先」赋值 ⇒ 手勾来源被抹平（source 恒 env，玩家看不出是手勾兜的）
  {
    const bad = Ec.replace(ANCHOR.pvEnvFirst, "let finalState = 'done', source = 'env';");
    a(bad !== Ec, 'v2271/N5a: N5 源码破坏成功（锚点命中）');
    const w = loadBroken(bad);
    const kR = WA.apiRouter;
    WA.apiRouter = undefined;
    FR.resetAll();
    const rv = FR.build();
    a(rv.steps[0].state === 'cannot-tell' && rv.steps[0].source === 'none',
      'v2271/N5b: 原版上未手勾的判不出步保持原态（两向自证正向半边）');
    const rb = w.firstRun.build();
    a(rb.steps[0].state === 'done', 'v2271/N5c: 破坏副本上全部被强判成 done');
    WA.apiRouter = kR;
    FR.resetAll();
  }

  // N6 负控制全程未改真源码与真设置
  a(rd(ENG_FR) === Ec, 'v2271/N6a: 负控制后引擎源码逐字未变');
  a(j(FR.getSettings().enabled) === 'true', 'v2271/N6b: 负控制后真设置逐字未变');

  console.log('EXV6-7 first-run-v2271: 全部通过');
  return true;
}
// 挂载面：tests/run.js 用 runLock('./first-run-v2271.js','runAll') 调它；
//   缺这一行时全量回归会记 NO runAll（独立跑绿、回归记红的假红）。
module.exports = { runAll: runAll };
if (require.main === module) {
  runAll();
}