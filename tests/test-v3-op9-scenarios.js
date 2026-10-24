'use strict';
/**
 * WorldAxis tests/test-v3-op9-scenarios.js
 * 
 * 验证 OPV3-9 主题化新局与长期开局：
 *   1. frontier-scarcity 资源紧张的边地聚落；
 *   2. coop-pledge 承诺密集的共同生活；
 *   3. epistemic-city 信息不对称的调查城市。
 */
const assert = require("assert");
require("./mock.js");
const fresh = require("./ui-gate-sync.js").fresh;

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log("PASS " + name);
    passed++;
  } catch (err) {
    console.error("FAIL " + name, err);
    failed++;
  }
}

test("OPV3-9-1: 正确声明并列出 V3 三大主题开局", function () {
  const W = fresh().WA;
  const list = W.playableBlueprint.listSamples();
  assert.equal(list.ok, true);
  const sampleIds = list.samples.map(function (s) { return s.id; });
  assert(sampleIds.indexOf("frontier-scarcity") >= 0);
  assert(sampleIds.indexOf("coop-pledge") >= 0);
  assert(sampleIds.indexOf("epistemic-city") >= 0);
});

test("OPV3-9-2: 安装「资源紧张的边地聚落」开局，自动注入承载力赤字、带病设施与守军", function () {
  const W = fresh().WA;
  W.store.init();
  const inst = W.playableBlueprint.installSample("frontier-scarcity", { force: true });
  assert.equal(inst.ok, true);
  assert.equal(inst.sampleId, "frontier-scarcity");

  const st = W.store.get();
  // 1. 地点注入
  assert(st.world.places.some(function (p) { return p.id === "border_camp"; }));
  // 2. 初始人物
  assert(st.people["p_老工匠"] != null);
  assert(st.people["p_边塞戍卒"] != null);
  // 3. 设施带病注入
  const fac = (st.serviceNetwork.facilities || []).filter(function (f) { return f.id === "fac_border_forge"; })[0];
  assert(fac != null, "边地铁匠炉必须成功注入设施网络");
  assert.equal(fac.status, "degraded", "边地设施初始必须为带病运转");
  // 4. 承载力资源告急注入
  const res = (st.envCapacity && st.envCapacity.resources) ? st.envCapacity.resources["res_forest"] : null;
  assert(res != null, "林木资源必须已宣告");
  assert.equal(res.strain, "depleted", "林木资源初始为枯竭承载高压");
});

test("OPV3-9-3: 安装「承诺密集的共同生活」开局，自动注入地方工位规约与互助公所", function () {
  const W = fresh().WA;
  W.store.init();
  const inst = W.playableBlueprint.installSample("coop-pledge", { force: true });
  assert.equal(inst.ok, true);
  
  const st = W.store.get();
  assert(st.people["p_公所主簿"] != null);
  assert(st.people["p_营造匠师"] != null);
  // 地方规约均分则例已生效
  const rules = (st.customLax && st.customLax.rules) || [];
  const rule = rules.filter(function (r) { return r.id === "rule_equal_slot"; })[0];
  assert(rule != null, "工位均分规约必须就位");
  assert.equal(rule.dailyLimit, 1);
  assert.equal(rule.active, true);
});

test("OPV3-9-4: 安装「信息不对称的调查城市」开局，自动注入九门卫所关卡与密探", function () {
  const W = fresh().WA;
  W.store.init();
  const inst = W.playableBlueprint.installSample("epistemic-city", { force: true });
  assert.equal(inst.ok, true);

  const st = W.store.get();
  assert(st.people["p_暗访密探"] != null);
  assert(st.people["p_关防校尉"] != null);
  // 九门卫所关卡已就位
  const cps = (st.serviceNetwork && st.serviceNetwork.checkpoints) || [];
  const cp = cps.filter(function (c) { return c.id === "cp_city_gate"; })[0];
  assert(cp != null, "内城九门关卡必须就位");
  assert.equal(cp.controlType, "permit-required");
  assert.equal(cp.requiredPermit, "pass_city");
});

console.log("\n--- Summary: " + passed + " passed, " + failed + " failed ---");
if (failed > 0) {
  process.exit(1);
}
