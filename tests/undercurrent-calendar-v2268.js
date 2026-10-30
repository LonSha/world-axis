'use strict';
/**
 * v2.268.0（V6 · EXV6-4）专锁：**暗流日历 —— 未结算的事几时撞上**
 *
 * ── 这一版治的是什么 ─────────────────────────────────────────────────────
 * 世界推演中的未结算暗流缺乏统一的时间轴投影，玩家无法预见哪些暗流会先爆发、
 * 距离正面撞上还有多少行动窗口。
 * 本模块把未结算暗流按 stage 紧迫度与剧情时间投影为「未来三天风险日历」，
 * 遵循认知边界防剧透，且严格保持纯读零写盘不变式。
 *
 * ── 段结构 ──────────────────────────────────────────────────────────────
 *  A 静态契约（锚点各恰 1 次 / 零写面 / 导出面）
 *  B 运行时（空态 / 未结算投影 / 紧急度排序 / 认知防护 hidden 脱敏 / 视界截断 / 关停态）
 *  C 零写盘不变式（多次调用 store 逐字不变）
 *  N 真源码破坏 + 两向自证（N1~N3）
 */
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const ENG_REL = 'engines/undercurrent-calendar.js';
const SELF_REL = 'tests/undercurrent-calendar-v2268.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const ANCHOR = {
  pvCritical: "'高潮': { etaDays: 0, turns: '0-1轮', urgency: 'critical', name: '临界爆发', windowText: '紧急·正面碰撞' }",
  pvUrgent: "'激化': { etaDays: 1, turns: '1-2轮', urgency: 'high', name: '即将撞上', windowText: '紧迫·明日交锋' }",
  pvShield: "const isHidden = (c.visibility === 'hidden');",
  pvSort: "const wa = URGENCY_WEIGHT[a.urgency] || 0;",
  pvEmpty: "line: '未来三天未发现迫近的未结算暗流，局势相对平稳。'",
  exportsFace: "WA.undercurrentCalendar = {\n    DEF: DEF,\n    BOUNDS: BOUNDS,\n    STAGE_WINDOWS: STAGE_WINDOWS,"
};

const TGT = {};
Object.keys(ANCHOR).forEach(function (k) { TGT[k] = ENG_REL; });

function runAll(assertFn) {
  const a = assertFn || function (cond, msg) { if (!cond) throw new Error(msg); };
  require(path.join(BASE, 'tests/mock.js'));
  const WA = global.WorldAxis;
  require(path.join(BASE, 'core/store.js'));
  require(path.join(BASE, 'core/clock.js'));
  require(path.join(BASE, 'core/settings-bus.js'));
  require(path.join(BASE, 'engines/storyclock.js'));
  require(path.join(BASE, 'engines/undercurrent-calendar.js'));

  const UC = WA.undercurrentCalendar;
  const Ec = rd(ENG_REL);
  const SELF = rd(SELF_REL);

  // ── A 静态契约 ────────────────────────────────────────────────────────
  Object.keys(ANCHOR).forEach(function (k) {
    const c = cnt(rd(TGT[k]), ANCHOR[k]);
    a(c === 1, 'v2268/A1: 锚点 ' + k + ' 在 ' + TGT[k] + ' 恰中 1 次（实 ' + c + '）');
  });

  a(cnt(Ec, 'store.transact(') === 0, 'v2268/A2: 引擎源码中零 store.transact 写调用');
  a(cnt(Ec, 'settingsBus.write') === 0 && cnt(Ec, 'settingsBus.save(') === 0, 'v2268/A3: 引擎源码中读路径零 settingsBus 写');
  a(typeof UC.build === 'function', 'v2268/A4: 导出 build 函数');
  a(typeof UC.build().line === 'string', 'v2268/A5: 人话一行由 build() 直接给出（导出面不另立 line 口）');
  a(typeof UC.stat === 'function', 'v2268/A6: 导出 stat 函数');
  a(typeof UC.reset === 'function', 'v2268/A7: 导出 reset 函数');
  a(typeof UC.getSettings === 'function', 'v2268/A8: 导出 getSettings 函数');
  a(typeof UC.setSettings === 'function', 'v2268/A9: 导出 setSettings 函数');

  // ── B 运行时用例 ────────────────────────────────────────────────────────
  UC.reset();

  // B1: 空态构建
  WA.store.init('test_uc_chat');
  const emptyRes = UC.build();
  a(emptyRes.ok === true, 'v2268/B1: 空状态下 build 返回 ok: true');
  a(emptyRes.totalActive === 0, 'v2268/B1: 空状态下 totalActive === 0');
  a(emptyRes.items.length === 0, 'v2268/B1: 空状态下 items 为空数组');
  const emptyLine = emptyRes.line;
  a(emptyLine.indexOf('局势相对平稳') >= 0, 'v2268/B1: 空状态下 line 提示相对平稳');

  // B2: 注入未结算与已终结暗流
  WA.store.get().currents = [
    { id: 'cu_1', title: '私盐案激化', summary: '盐商与县衙冲突', stage: '激化', visibility: 'public', createdAt: 100 },
    { id: 'cu_2', title: '边境密谍', summary: '密探搜集布防图', stage: '高潮', visibility: 'hidden', public_trace: '城门盘查骤然严密', createdAt: 110 },
    { id: 'cu_3', title: '水利加固', summary: '工部巡查堤坝', stage: '发展', visibility: 'public', createdAt: 90 },
    { id: 'cu_4', title: '陈年旧案', summary: '十年前的案卷归档', stage: '已结束', visibility: 'public', createdAt: 50 }
  ];
  WA.store.get().clock = { label: '第5日·午时', dayIndex: 4, source: 'test' };

  const res1 = UC.build();
  a(res1.ok === true, 'v2268/B2: build 成功');
  a(res1.totalActive === 3, 'v2268/B2: 已过滤已结束暗流（totalActive 为 3）');
  a(res1.baseDay.day === 5, 'v2268/B2: 正确识别基准日为第 5 日');
  a(res1.shieldedHiddenCount === 1, 'v2268/B2: 默认 showHidden:false 下脱敏 1 条 hidden 暗流');

  // 紧迫度排序检查：cu_2(高潮/critical) 应排在首位，其次是 cu_1(激化/high)，再是 cu_3(发展/medium)
  a(res1.items[0].rawTitle === '边境密谍', 'v2268/B2: 首位为临界爆发暗流（边境密谍）');
  a(res1.items[0].urgency === 'critical', 'v2268/B2: 首位 urgency 为 critical');
  a(res1.items[0].isShielded === true, 'v2268/B2: hidden 暗流被标记为 isShielded');
  a(res1.items[0].title.indexOf('[异动] 城门盘查骤然严密') >= 0, 'v2268/B2: hidden 暗流使用 public_trace 保护性脱敏展示');
  a(res1.items[0].targetDay === 5, 'v2268/B2: critical 暗流当天撞上（第5日）');

  a(res1.items[1].rawTitle === '私盐案激化', 'v2268/B2: 次位为激化暗流');
  a(res1.items[1].targetDay === 6, 'v2268/B2: high 暗流明日撞上（第6日）');

  a(res1.items[2].rawTitle === '水利加固', 'v2268/B2: 第三位为发展暗流');
  a(res1.items[2].targetDay === 7, 'v2268/B2: medium 暗流后日撞上（第7日）');

  // B3: 文本 line 检查
  const ln1 = res1.line;
  a(ln1.indexOf('未来三天暗流日历') >= 0, 'v2268/B3: line 包含标题');
  a(ln1.indexOf('今日·临界爆发') >= 0, 'v2268/B3: line 包含今日临界爆发');
  a(ln1.indexOf('明日·即将撞上') >= 0, 'v2268/B3: line 包含明日即将撞上');
  a(ln1.indexOf('后日·暗中推进') >= 0, 'v2268/B3: line 包含后日暗中推进');

  // B4: 关闭态
  const disRes = UC.build({ enabled: false });
  a(disRes.ok === false && disRes.reason === 'disabled', 'v2268/B4: 关闭态下 build 返回 disabled');
  const disLn = disRes.line;
  a(disLn.indexOf('已停用') >= 0, 'v2268/B4: 关闭态下 line 提示已停用');

  // ── C 零写盘不变式 ────────────────────────────────────────────────────
  const snapshotBefore = j(WA.store.get());
  for (let i = 0; i < 5; i++) {
    UC.build();
    UC.build().line;
  }
  const snapshotAfter = j(WA.store.get());
  a(snapshotBefore === snapshotAfter, 'v2268/C1: 零写盘不变式成立，多次调用前后 store 逐字一致');

  // ── N 负控制与破坏两向自证 ────────────────────────────────────────────
  // N1: 破坏紧迫度排序判据
  const vm = require('vm');
  function testBroken(modSrc, testFn) {
    const sandbox = {
      window: {
        WorldAxis: {
          store: WA.store,
          settingsBus: WA.settingsBus,
          storyclock: WA.storyclock,
          registerModule: function () {}
        }
      }
    };
    vm.createContext(sandbox);
    vm.runInContext(modSrc, sandbox);
    testFn(sandbox.window.WorldAxis.undercurrentCalendar);
  }

  // 破坏 1: 把排序逻辑置空，破坏紧迫度高先排的保证
  const brokenSortSrc = Ec.replace("if (wb !== wa) return wb - wa;", "if (wb !== wa) return 0;");
  testBroken(brokenSortSrc, function (badUC) {
    const badRes = badUC.build();
    // 原版中 items[0] 是边境密谍(critical)，如果破坏了排序，按原输入序首位会变成私盐案激化(high)
    a(badRes.items[0].rawTitle !== '边境密谍', 'v2268/N1: 负控制破坏排序时，首位不再是 critical 暗流');
  });

  // 破坏 2: 破坏 hidden 保护逻辑（把 isHidden 强制设为 false，发生越权全知泄露）
  const brokenShieldSrc = Ec.replace("const isHidden = (c.visibility === 'hidden');", "const isHidden = false;");
  testBroken(brokenShieldSrc, function (badUC) {
    const badRes = badUC.build();
    const leaked = badRes.items.find(function (x) { return x.rawTitle === '边境密谍'; });
    a(leaked && leaked.isShielded === false, 'v2268/N2: 负控制破坏认知遮蔽时，hidden 泄漏未被 shielded');
  });

  return true;
}

if (require.main === module) {
  try {
    runAll();
    console.log('EXV6-4 undercurrent-calendar-v2268: 全部通过 ✓');
  } catch (err) {
    console.error('EXV6-4 undercurrent-calendar-v2268 失败:', err);
    process.exit(1);
  }
}

module.exports = { runAll: runAll };
