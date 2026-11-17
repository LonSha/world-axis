'use strict';
// v2.522.0 spatialBridge：空间缝合层回归
//   钉的是**坐标域**：两套坐标系可以同屏对照，但绝不允许出现它们的算术结果。
const h = require('./v8-harness.js');
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  <' + extra + '>' : '')); }
}
function eq(name, a, b) { ok(name, a === b, 'want ' + b + ' got ' + a); }
console.log('\n[spatialBridge v2.522.0]');

function seed(W) {
  const LG = W.localGrid;
  LG.saveSettings({ enabled: true });
  LG.registerVenue({ name: '本乡公寓楼', region: '东京都文京区' });
  LG.registerZone({ venue: '本乡公寓楼', zone: '三层' });
  LG.registerSpot({ venue: '本乡公寓楼', zone: '三层', name: '走廊尽头', x: 0, y: 0 });
  LG.registerSpot({ venue: '本乡公寓楼', zone: '三层', name: '301室', x: 3, y: 0 });
  LG.registerSpot({ venue: '本乡公寓楼', zone: '三层', name: '302室', x: 0, y: 2 });
  LG.registerVenue({ name: '自建宅院', region: '埼玉县所泽市' });
  LG.registerZone({ venue: '自建宅院', zone: '一层' });
  LG.registerSpot({ venue: '自建宅院', zone: '一层', name: '厨房', x: 1, y: 1 });
  LG.registerVenue({ name: '旧公寓', region: '东京都文京区' });
  LG.registerZone({ venue: '旧公寓', zone: '一层' });
  LG.registerSpot({ venue: '旧公寓', zone: '一层', name: '厨房', x: 0, y: 0 });
  return LG;
}

// ── 1 默认关闭 ──
(function () {
  const W = h.load();
  const B = W.spatialBridge;
  eq('default disabled', B.settings().enabled, false);
  eq('version', B.version, '2.522.0');
  eq('buildBlock off = 空串', B.buildBlock({ venue: 'x' }), '');
  eq('mirror off = disabled', B.mirrorVenue('x').reason, 'disabled');
  // 只读诊断在关闭时仍可用（它们不是注入面）
  ok('whereIs 关闭时仍可查', B.whereIs('x').ok === false, 'unknown-name');
})();

// ── 2 whereIs：两套坐标系分列，domain 说清是哪套 ──
(function () {
  const W = h.load();
  const LG = seed(W);
  const B = W.spatialBridge;
  const r1 = B.whereIs('厨房');
  eq('local 命中数（同名多地）', r1.local.length, 2);
  eq('domain = local', r1.domain, 'local');
  eq('world 缺席时是 null（不补默认坐标）', r1.world, null);
  ok('local 项带 venue', r1.local[0].venue === '自建宅院' || r1.local[1].venue === '自建宅院');
  // 加世界系坐标后 → domain both，两套各在自己的字段里
  W.geoTracker.registerPlace({ name: '厨房', x: 12, y: 30, region: '埼玉县所泽市', kind: 'room' });
  const r2 = B.whereIs('厨房');
  eq('domain = both', r2.domain, 'both');
  eq('world.x 来自地理轨', r2.world.x, 12);
  ok('local 项不含世界坐标字段', r2.local[0].x === undefined && r2.local[0].world === undefined);
  ok('world 项不含场所字段', r2.world.venue === undefined && r2.world.zone === undefined);
  eq('unknown → unknown-name', B.whereIs('不存在的地方').reason, 'unknown-name');
  eq('空名 → missing-name', B.whereIs('').reason, 'missing-name');
  LG.saveSettings({ enabled: true });
})();

// ── 3 nearby：只读、不求解、跨域拒绝 ──
(function () {
  const W = h.load();
  seed(W);
  const B = W.spatialBridge;
  const r0 = B.nearby({ venue: '本乡公寓楼', zone: '三层', name: '走廊尽头' });
  eq('未求解不给方位', r0.reason, 'zone-unsolved');
  eq('nearby 不触发求解', JSON.stringify(W.localGrid._root().solved || {}), '{}');
  W.localGrid.getZone('本乡公寓楼', '三层');
  const r1 = B.nearby({ venue: '本乡公寓楼', zone: '三层', name: '走廊尽头' });
  eq('nearby ok', r1.ok, true);
  eq('同平面邻居数', r1.others.length, 2);
  eq('最近的邻居是 302室', r1.others[0].name, '302室');
  ok('方位非空', r1.others[0].dir.length > 0, r1.others[0].dir);
  ok('用格不用米', r1.others[0].text.indexOf('格') >= 0 && r1.others[0].text.indexOf('米') < 0, r1.others[0].text);
  eq('跨 zone 不混算（这里同 zone 全通过）', r1.rejected, 0);
  eq('缺 venue → missing-venue', B.nearby({ zone: 'z', name: 'n' }).reason, 'missing-venue');
  eq('缺 name → missing-name', B.nearby({ venue: 'v', zone: 'z' }).reason, 'missing-name');
  eq('unknown-venue', B.nearby({ venue: '没有这里', zone: 'z', name: 'n' }).reason, 'unknown-venue');
})();

// ── 4 atlasSlice：宏观 × 微观对照 ──
(function () {
  const W = h.load();
  seed(W);
  const B = W.spatialBridge;
  W.geoTracker.registerPlace({ name: '本乡公寓楼', x: 5, y: 8, region: '东京都文京区', kind: 'building' });
  const r = B.atlasSlice('本乡公寓楼');
  eq('atlasSlice ok', r.ok, true);
  eq('世界系街区', r.world.region, '东京都文京区');
  eq('微观平面数', r.planes.length, 1);
  eq('平面 source = raw（未求解）', r.planes[0].source, 'raw');
  ok('atlas 读数在场', r.atlas !== null);
  eq('unknown-venue', B.atlasSlice('没有这里').reason, 'unknown-venue');
})();

// ── 5 mirror / unmirror：投影进拓扑树，且绝不动别人的节点 ──
(function () {
  const W = h.load();
  seed(W);
  const B = W.spatialBridge, ST = W.spatialTopology;
  B.saveSettings({ enabled: true });
  // 假装外部世界书先写了一个同名 venue 节点
  ST.registerNode('某世界书:本乡公寓楼', { name: '外部节点', level: 'venue' });
  const m1 = B.mirrorVenue('本乡公寓楼');
  eq('mirror ok', m1.ok, true);
  eq('节点前缀', m1.venueNode, 'lg:本乡公寓楼');
  eq('投影了 1 个 zone', m1.zones, 1);
  ok('有通道', m1.portalsTotal >= 1, m1.portalsTotal);
  // v2.522.0：spatialTopology 已进 store 骨架 ⇒ 投影落在 memCache.spatialTopology 里，
  //   persisted 必须如实翻成 true（此前硬编码 false 是「当时确实存不下来」的诚实读法）。
  eq('投影随存档持久化（persisted 为真）', m1.persisted, true);
  eq('引擎自报状态来源 = store', W.spatialTopology.stateSource(), 'store');
  ok('投影真的落在 store 骨架键里',
    !!(W.store.get().spatialTopology && W.store.get().spatialTopology.nodes && W.store.get().spatialTopology.nodes['lg:本乡公寓楼']));
  // 落盘证据：save() 之后 localStorage 里必须出现那个节点 id —— 这是「重启还在」的充分读数。
  //   注意：localStorage 在 VM 沙箱里（harness 不往 Node global 上装），故经 __testContext 取。
  W.store.save();
  const LS = W.__testContext && W.__testContext.localStorage;
  let hits = 0;
  if (LS) {
    for (let i = 0; i < LS.length; i++) {
      const k = LS.key(i);
      if (String(LS.getItem(k) || '').indexOf('lg:\u672c\u4e61\u516c\u5bd3\u697c') >= 0) hits++;
    }
  }
  ok('save() 后存档 payload 含 lg: 节点（真落盘，不只在内存）', hits >= 1, 'hits=' + hits);
  const st1 = B.mirrorStatus();
  eq('我的节点 2 个（venue + 1 zone）', st1.nodes, 2);
  eq('外部节点未被吞', st1.foreignNodes, 1);
  eq('venues 计数', st1.venues, 1);
  // 幂等：再投影一次节点数不变
  B.mirrorVenue('本乡公寓楼');
  eq('二次 mirror 不重复建节点', B.mirrorStatus().nodes, 2);
  // whereIs 里能看到拓扑层级
  const wi = B.whereIs('301室');
  ok('已镜像 → 带拓扑路径', wi.mirrored && wi.mirrored.path.length >= 1, JSON.stringify(wi.mirrored));
  // 撤投影：只撤自己的
  const u = B.unmirrorVenue('本乡公寓楼');
  eq('撤掉 2 个节点', u.removedNodes, 2);
  eq('撤后我的节点 0', B.mirrorStatus().nodes, 0);
  eq('外部节点仍在', B.mirrorStatus().foreignNodes, 1);
  ok('外部节点本体还在字典里', !!ST.getState().nodes['某世界书:本乡公寓楼']);
})();

// ── 6 buildBlock：场所系方位 + 世界系街区，且不给米数 ──
(function () {
  const W = h.load();
  seed(W);
  const B = W.spatialBridge;
  B.saveSettings({ enabled: true });
  W.localGrid.getZone('本乡公寓楼', '三层');
  W.geoTracker.registerPlace({ name: '本乡公寓楼', x: 5, y: 8, region: '东京都文京区', kind: 'building' });
  const b = B.buildBlock({ venue: '本乡公寓楼', zone: '三层', spot: '走廊尽头' });
  ok('含世界系一句', b.indexOf('【世界系】') >= 0, b.slice(0, 60));
  ok('含街区', b.indexOf('东京都文京区') >= 0);
  ok('不出现「N 米」这种读数', !/[0-9０-９]+\s*米/.test(b), b);
  ok('明说不折算', b.indexOf('不折算') >= 0);
})();

// ── 7 diagnose：四引擎在场 + 只读取数面齐全 ──
(function () {
  const W = h.load();
  seed(W);
  const d = W.spatialBridge.diagnose();
  eq('diagnose ok', d.ok, true);
  eq('localGrid 在场', d.present.localGrid, true);
  eq('spatialTopology 在场', d.present.spatialTopology, true);
  eq('geoTracker 在场', d.present.geoTracker, true);
  eq('atlas 在场', d.present.atlas, true);
  eq('只读取数面齐全（peekVenue + relatePeek）', d.noLocalGridRead, true);
  eq('版本', d.version, '2.522.0');
})();

console.log('\n[spatialBridge] pass=' + pass + ' fail=' + fail);
if (fail) process.exitCode = 1;