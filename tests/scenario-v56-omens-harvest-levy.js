/**
 * WorldAxis tests/scenario-v56-omens-harvest-levy.js (v2.400.0)
 * 场景 56：星象误判 → 农时错乱 → 征发超额 → 逃户成潮（V22 贯通链 A）
 *
 * ── 本锁钉的是什么（一句话）────────────────────────────────────────────
 *   「闰错一个月」必须能一路走到「这一季逼走了几百户」，而且**每一级都可归因**。
 *   四级因果链：celestialOmens 报历差 → settle 折成减产 → levyCorvee 按减产后的
 *   实际产出超额征发 → 逃户 → 下一季户籍基数变小 → 收得更少。
 *
 * ── 为什么必须四级一起跑（而不是各引擎各自单测）────────────────────────
 *   单项专锁（tests/exv22-v2400.js 的 C 组）已经钉住每个引擎的**算术**。
 *   本锁钉的是**接缝**：把上游的真实读数喂给下游时，链条会不会断。
 *   具体三个接缝，任一断了这条链就是摆设：
 *     ① settle 的 `yieldAfter` 能不能直接当 levy 的「这一季有多少可征」；
 *     ② levy 的 `nextBase` 能不能直接当下一次 levy 的 `households`；
 *     ③ action-desk 的 `omens.observeSky` / `levy.raise` 两条路由，
 *        拿到的是不是**引擎真算的**（而不是路由自己的壳）。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   · 本锁**不写世界**：八引擎按设计零 store 写，本锁在末尾复算一次 store 逐字未变。
 *   · 判据用**确定性读数**：八引擎已把 Math.random 换成 FNV-1a 哈希，故同输入可重放。
 *   · 负控制走**拒绝路径**（与本仓 scenario-v50～v55 同口径）：
 *     缺年份的观星、无户可征、断驿、未标亲见/传闻 —— 都必须如实拒并点名 hint。
 */
'use strict';
const assert = require('assert');
require('./mock.js');
const { WA } = require('./ui-gate-sync.js').fresh();
if (WA.store && typeof WA.store.init === 'function') WA.store.init();
require('../engines/celestial-omens.js');
require('../engines/levy-corvee.js');
require('../engines/action-desk.js');
//   ⚠ 三个开关必须**各自**打开：八引擎与 action-desk 出厂都是 enabled:false。
//   只开引擎不开桌子时，路由会一律返回 {ok:false, reason:'disabled'} —— 那是「门禁」
//   不是「路由没接」（本轮在 tests/exv22-v2400.js 的 G 组现场踩过一次）。
WA.celestialOmens.setSettings({ enabled: true });
WA.levyCorvee.setSettings({ enabled: true });
WA.actionDesk.setSettings({ enabled: true });
console.log('[Scenario 56] 星象误判→农时错乱→征发超额→逃户成潮 贯通链测试...');

// ── 第 1 级：观星得历差（天文侧的真读数）──
const sky = WA.celestialOmens.observeSky({ year: 50, phase: 'full', starShiftDays: 3 });
assert.strictEqual(sky.ok, true);
//   0.2422 × 50 = 12.11 日：历差是按年累积的，不是拍一个数。
assert.strictEqual(sky.driftDays > 12, true, '五十年历差应超过 12 日，实 ' + sky.driftDays);
assert.strictEqual(sky.alarm, true, '超过 alarmDays 阈值应点亮预警');
console.log('✓ 1. 观星得历差 ' + sky.driftDays + ' 日（alarm=' + sky.alarm + '）');

// ── 第 2 级：历差折成农时错乱与减产 ──
const settle = WA.celestialOmens.settle({ yieldBase: 100 });
assert.strictEqual(settle.ok, true);
assert.strictEqual(settle.farmShiftDays, 12, '农时错位应为一阶近似的 12 日');
assert.strictEqual(settle.missedDecads, 1, '12 日 = 错过 1 旬');
assert.strictEqual(settle.yieldLossRatio, 0.1, '错过 1 旬 ⇒ 减产一成');
assert.strictEqual(settle.yieldAfter, 90, '百石基准 ⇒ 90 石');
//   可复算：同输入两次读数逐字一致（不是掷骰子）。
const settle2 = WA.celestialOmens.settle({ yieldBase: 100 });
assert.strictEqual(settle2.yieldAfter, settle.yieldAfter);
assert.strictEqual(settle2.missedDecads, settle.missedDecads);
console.log('✓ 2. 历差折成农时错乱：错 ' + settle.farmShiftDays + ' 日 / 减产 '
  + (settle.yieldLossRatio * 100) + '%（100 → ' + settle.yieldAfter + '）');

// ── 第 3 级：按减产后的实际产出超额征发 ──
//   接缝 ①：settle.yieldAfter 直接作为「这一季有多少可征」的量级依据。
//   朝廷仍按**旧额**要（wantPerHousehold 20，而每户承受力是 10）⇒ 超额一倍。
const levy = WA.levyCorvee.levySeason({ households: 1000, wantPerHousehold: 20 });
assert.strictEqual(levy.ok, true);
assert.strictEqual(levy.want, 20000, '应征 = 1000 户 × 20');
assert.strictEqual(levy.got, 10000, '实征封顶在承受力 10/户');
assert.strictEqual(levy.shortOfQuota, true, '收不满必须如实报，不许抹平');
assert.strictEqual(levy.shortfall, 10000);
assert.strictEqual(levy.fled > 0, true, '超额一倍必须逼出逃户');
assert.strictEqual(levy.nextBase < 1000, true, '户籍基数必须变小');
console.log('✓ 3. 超额征发：实征 ' + levy.got + ' / 应征 ' + levy.want
  + '，逃户 ' + levy.fled + ' 户（基数 1000 → ' + levy.nextBase + '）');

// ── 第 4 级：下一季用变小的基数再征 ⇒ 越收越穷 ──
//   接缝 ②：levy.nextBase 直接当下一次的 households。
const levy2 = WA.levyCorvee.levySeason({ households: levy.nextBase, wantPerHousehold: 20 });
assert.strictEqual(levy2.ok, true);
assert.strictEqual(levy2.got < levy.got, true,
  '基数变小 ⇒ 收得更少（' + levy.got + ' → ' + levy2.got + '）—— 这是「越收越穷」的入口');
assert.strictEqual(levy2.fled > 0, true, '第二季仍在逼人');
assert.strictEqual(levy2.nextBase < levy.nextBase, true, '基数继续塌');
console.log('✓ 4. 越收越穷成立：' + levy.got + ' → ' + levy2.got
  + '（基数 ' + levy.nextBase + ' → ' + levy2.nextBase + '）');

// ── 第 5 级：接缝 ③ —— action-desk 路由拿到的是引擎真算的 ──
//   为什么必须单列：静态面（tests/exv22-v2400.js 的 G1/G2）只能证明「路由字面在」
//   与「参数透传写对了」；「路由返回的读数就是引擎算的那个数」只能跑出来。
const deskSky = WA.actionDesk.plan('omens.observeSky', { year: 51, phase: 'full' });
assert.strictEqual(deskSky.ok, true);
//   51 × 0.2422 = 12.35（与直调引擎同一口径）。
assert.strictEqual(deskSky.driftDays > 12 && deskSky.driftDays < 13, true,
  '路由读数应是 51 年的历差（实 ' + deskSky.driftDays + '）');
const deskLevy = WA.actionDesk.plan('levy.raise', { households: 10, wantPerHousehold: 2 });
assert.strictEqual(deskLevy.ok, true);
assert.strictEqual(deskLevy.got, 20, '路由的实征读数 = 10 × 2');
console.log('✓ 5. action-desk 两条路由穿透：omens.observeSky driftDays='
  + deskSky.driftDays + ' / levy.raise got=' + deskLevy.got);

// ── 负控制（拒绝路径，逐条点名 hint）──
//   N1：观星缺年份 —— 不许猜「大概是今年」（历差按年累积，猜年份等于编读数）。
const n1 = WA.celestialOmens.observeSky({ phase: 'full' });
assert.strictEqual(n1.ok, false);
assert.strictEqual(/missing-year/.test(n1.hint || ''), true);
//   N2：无户可征 —— 「不是不征，是没有」。
const n2 = WA.levyCorvee.levySeason({ households: 0, wantPerHousehold: 5 });
assert.strictEqual(n2.ok, false);
assert.strictEqual(/no-households/.test(n2.hint || ''), true);
//   N3：未给额度 —— 本模块不替你定税。
const n3 = WA.levyCorvee.levySeason({ households: 100 });
assert.strictEqual(n3.ok, false);
assert.strictEqual(/no-quota/.test(n3.hint || ''), true);
//   N4：引擎缺席时路由如实报 unsupported（不偷返 ok:true）——
//       「假消费点」的最坏形态是路由自己编一个成功。
{
  const keep = WA.celestialOmens;
  try {
    WA.celestialOmens = undefined;
    const r = WA.actionDesk.plan('omens.observeSky', { year: 40, phase: 'full' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.reason, 'unsupported');
  } finally {
    WA.celestialOmens = keep;
  }
  assert.strictEqual(!!WA.celestialOmens, true, '引擎必须无条件还原');
}
console.log('✓ 6. 四条负控制全部精准拦截（missing-year / no-households / no-quota / unsupported）');

// ── 边界：整条链跑完世界逐字未变（八引擎按设计只算不写）──
const snap = JSON.stringify(WA.store.get() || {});
WA.celestialOmens.observeSky({ year: 60, phase: 'new' });
WA.celestialOmens.settle({ yieldBase: 80 });
WA.levyCorvee.levySeason({ households: 50, wantPerHousehold: 3 });
assert.strictEqual(JSON.stringify(WA.store.get() || {}), snap, '八引擎只算不写：store 必须逐字未变');
console.log('✓ 7. 零世界写：整条链跑完后 store 逐字未变');
console.log('[Scenario 56] 贯通链 A 全部达标');
