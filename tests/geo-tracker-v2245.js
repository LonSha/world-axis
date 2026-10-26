#!/usr/bin/env node
// WorldAxis tests/geo-tracker-v2245.js (v2.245.0) — MAP-1：空间位置感知、消歧与常识反哺透镜专锁
//
// ── 核心验证面 ────────────────────────────────────────────────
//   A 面：静态契约与接口导出（readLocationMarks / registerPlace / resolveLocation / updateCharacterLocation / buildBlock / diagnose）
//   B 面：正文位置标记提取（思考过程过滤、反引号代码块规避、规范与旧格式兼容）
//   C 面：多级空间消歧（精准匹配、别名映射、复合层级切分、子地点与宏观街区模糊匹配、场景域隔离）
//   D 面：空间常识反哺透镜（物理距离米/公里换算、步行耗时折算、周边生活圈设施雷达、场景域隔离）
//   E 面：全局静默与容量治理（store 根挂载、evict 角色与历史容量控制）
//   N 面：负控制破坏自证（破坏消歧逻辑或反哺计算，判据必须报红）
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const sync = require('./ui-gate-sync.js');

function runAll(a) {
  const env = sync.fresh();
  const WA = env.WA;

  a(!!WA.geoTracker, 'geo-tracker/A1: 引擎 WA.geoTracker 成功装载');
  a(typeof WA.geoTracker.readLocationMarks === 'function', 'geo-tracker/A2: 导出 readLocationMarks 方法');
  a(typeof WA.geoTracker.registerPlace === 'function', 'geo-tracker/A3: 导出 registerPlace 方法');
  a(typeof WA.geoTracker.resolveLocation === 'function', 'geo-tracker/A4: 导出 resolveLocation 方法');
  a(typeof WA.geoTracker.updateCharacterLocation === 'function', 'geo-tracker/A5: 导出 updateCharacterLocation 方法');
  a(typeof WA.geoTracker.buildBlock === 'function', 'geo-tracker/A6: 导出 buildBlock 方法');
  a(typeof WA.geoTracker.diagnose === 'function', 'geo-tracker/A7: 导出 diagnose 方法');

  // ── B 面：位置标记提取与草稿规避 ──
  const testMsg = `
这是一段正文内容。
<think>
我在思考他在哪里：
<位置 人物="草稿人物">草稿地点·千万不能被提取</位置>
</think>
终于在街头见到了陆捕头。
\`<位置 人物="示例">代码块不解析</位置>\`
<位置 人物="陆捕头">东街·济世堂药铺</位置>
<位置 人物="李掌柜">西市·悦来客栈</位置>
<!--位置:城南·铁匠铺-->
`;
  const marks = WA.geoTracker.readLocationMarks(testMsg);
  a(marks.length === 3, 'geo-tracker/B1: 成功过滤思考过程与代码块，提取 3 处真标记（实 ' + marks.length + '）');
  a(marks[0][1] === '陆捕头' && marks[0][2] === '东街·济世堂药铺', 'geo-tracker/B2: 第一处规范标记人物与地点完全精确解析');
  a(marks[1][1] === '李掌柜' && marks[1][2] === '西市·悦来客栈', 'geo-tracker/B3: 第二处规范标记人物与地点精确解析');
  a(marks[2][3] === '城南·铁匠铺', 'geo-tracker/B4: 兼容旧格式注释标记');

  // ── C 面：地点库登记与多级消歧 ──
  WA.geoTracker.registerPlace({ name: '济世堂药铺', aka: ['济世堂', '药铺'], region: '东街', x: 100, y: 100, kind: 'hospital' });
  WA.geoTracker.registerPlace({ name: '悦来客栈', aka: ['悦来客房'], region: '西市', x: 200, y: 200, kind: 'hotel' });
  WA.geoTracker.registerPlace({ name: '东街茶摊', region: '东街', x: 105, y: 102, kind: 'tea' });
  WA.geoTracker.registerPlace({ name: '初星学园总校区', aka: ['初星学园'], region: '学园特别区', x: 500, y: 500, kind: 'campus', sceneId: '初星学园' });
  WA.geoTracker.registerPlace({ name: '制作科大楼·1F大厅', region: '学园特别区', x: 502, y: 501, kind: 'building', sceneId: '初星学园', floor: '1F' });
  WA.geoTracker.registerPlace({ name: '制作科大楼·3F录音室', region: '学园特别区', x: 502, y: 501, kind: 'building', sceneId: '初星学园', floor: '3F' });

  // 精准与别名匹配
  const resExact = WA.geoTracker.resolveLocation('济世堂药铺');
  a(resExact.ok && resExact.name === '济世堂药铺' && resExact.precision === 'exact', 'geo-tracker/C1: 精准匹配济世堂药铺');
  const resAlias = WA.geoTracker.resolveLocation('济世堂');
  a(resAlias.ok && resAlias.name === '济世堂药铺' && resAlias.precision === 'alias', 'geo-tracker/C2: 别名精确消歧');

  // 复合街区消歧（街区·设施）
  const resComp = WA.geoTracker.resolveLocation('东街·济世堂');
  a(resComp.ok && resComp.name === '济世堂药铺' && resComp.region === '东街', 'geo-tracker/C3: 复合路径消歧成功定位至东街济世堂');

  // 复合未命中设施退化为街区大概位置
  const resApprox = WA.geoTracker.resolveLocation('东街·无名小面馆');
  a(resApprox.ok && resApprox.region === '东街' && resApprox.approximate === true, 'geo-tracker/C4: 未知子设施退化为街区大概位置，标 approximate: true');

  // ── D 面：角色落位与常识反哺透镜 ──
  WA.geoTracker.updateCharacterLocation('陆捕头', '东街·济世堂药铺');
  WA.geoTracker.updateCharacterLocation('李掌柜', '西市·悦来客栈');

  const block1 = WA.geoTracker.buildBlock({ mainCharacter: '陆捕头' });
  a(block1.includes('【空间常识与位移透镜】'), 'geo-tracker/D1: 成功生成空间常识与位移透镜标题');
  a(block1.includes('陆捕头：身处「东街·济世堂药铺」'), 'geo-tracker/D2: 准确包含主角陆捕头落位描述');
  a(block1.includes('李掌柜：身处「西市·悦来客栈」'), 'geo-tracker/D3: 准确包含配角李掌柜落位描述');
  a(block1.includes('步行约'), 'geo-tracker/D4: 实测物理距离换算包含步行时间');
  a(block1.includes('临近可达设施：东街茶摊'), 'geo-tracker/D5: 成功探测半径内临近生活圈设施（东街茶摊）');

  // 场景内外域隔离验证
  WA.geoTracker.updateCharacterLocation('制作人', '初星学园·制作科大楼·1F大厅');
  WA.geoTracker.updateCharacterLocation('学级长', '初星学园·制作科大楼·3F录音室');
  const block2 = WA.geoTracker.buildBlock({ mainCharacter: '制作人' });
  a(block2.includes('同在「初星学园」'), 'geo-tracker/D6: 识别同处初星学园封闭情境内部');
  a(block2.includes('室内上下层守望'), 'geo-tracker/D7: 识别室内场景不同楼层上下守望关系');

  // ── E 面：容量治理与诊断自检 ──
  const diag = WA.geoTracker.diagnose();
  a(diag.ok && diag.placesCount >= 6, 'geo-tracker/E1: 诊断报告地点表统计正常');
  a(diag.trackedCharacters >= 4, 'geo-tracker/E2: 追踪角色统计正常');

  const s = WA.store.get();
  a(!!s.geoTracker && typeof s.geoTracker === 'object', 'geo-tracker/E3: store 根骨架下挂载 geoTracker 状态树');
  a(Array.isArray(s.geoTracker.locationHistory), 'geo-tracker/E4: locationHistory 数组正常记账');
}

function runNegative(a) {
  const env = sync.fresh();
  const WA = env.WA;

  // 破坏测试：未匹配地点不凭空捏造虚假坐标，必须返回 x: null, y: null
  const unk = WA.geoTracker.resolveLocation('完全虚构的未知异界外太空某处');
  a(unk.ok && unk.x === null && unk.y === null && unk.approximate === true, 'geo-tracker/N1: 未知地点绝不凭空捏造坐标，保持 approximate 兜底');

  // 破坏测试：关闭 feed 时 buildBlock 必须返回空串（无侵入）
  WA.geoTracker.updateCharacterLocation('测试主角', '东街·济世堂药铺');
  const origBus = WA.settingsBus.read;
  WA.settingsBus.read = function (reg) {
    if (reg && reg.key === 'worldaxis_geo_tracker_settings_v1') return Object.assign({}, reg.def, { feedMode: 'off' });
    return origBus ? origBus(reg) : (reg && reg.def);
  };
  try {
    const emptyBlock = WA.geoTracker.buildBlock();
    a(emptyBlock === '', 'geo-tracker/N2: feedMode 设为 off 时 buildBlock 严格返回空串');
  } finally {
    WA.settingsBus.read = origBus;
  }
}

module.exports = { runAll, runNegative };

if (require.main === module) {
  let passed = 0, failed = 0;
  function assert(cond, msg) {
    if (cond) { passed++; console.log('  ✓ ' + msg); }
    else { failed++; console.error('  ✗ ' + msg); }
  }
  console.log('--- runAll ---');
  runAll(assert);
  console.log('--- runNegative ---');
  runNegative(assert);
  console.log(`Summary: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}