'use strict';
// v2.411.0 (R251 缝合批)：人体结构契约引擎自带锁。
// 覆盖：左右映射四朝向全表、朝向一致（facing-contradiction）、单一锚点（multi-anchor）、
//       头只有一个（head-count）、无足不立（no-support）、肢体容量（over-capacity）、
//       体型禁令（veto-hit）、可及判定、开关缺省、注入块形态与逐字口径行。
const a = require('assert');
require('./mock.js');
const W = require('./ui-gate-sync.js').fresh().WA;
W.store.init();
const B = W.bodyAnatomy;
a(B, 'bodyAnatomy 命名空间已装载');

// ── ① 总开关默认关：register 返回 disabled 不记账，buildBlock 返回空串 ──
a.strictEqual(B.getSettings().enabled, false);
const dis = B.register('甲', { anchor: '桌边' });
a.strictEqual(dis.ok, true);
a.strictEqual(dis.reason, 'disabled');
a.strictEqual(B.buildBlock(), '', '总开关关闭时注入块必须为空串');
a.strictEqual(B.stat().regs, 0);

// ── ② 开启后：左右映射四朝向全表（地基表，错一处整场镜像全错）──
B.setSettings({ enabled: true });
a.strictEqual(B.mirror('front', 'left').bodySide, 'right');
a.strictEqual(B.mirror('front', 'right').bodySide, 'left');
a.strictEqual(B.mirror('back', 'left').bodySide, 'left');
a.strictEqual(B.mirror('back', 'right').bodySide, 'right');
a.strictEqual(B.mirror('left', 'left').bodySide, 'front');
a.strictEqual(B.mirror('left', 'right').bodySide, 'back');
a.strictEqual(B.mirror('right', 'left').bodySide, 'back');
a.strictEqual(B.mirror('right', 'right').bodySide, 'front');
a.strictEqual(B.mirror('front', 'left').bodySideLabel, '角色右');
a(B.mirror('up', 'left').ok === false && B.mirror('front', 'up').ok === false, '表外朝向/侧别必须拒收');

// ── ③ 登记：正常路径 ──
const r1 = B.register('甲', { tier: 'slim', facing: 'front', anchor: '桌边', holding: ['茶杯'], scene: '茶室' });
a(r1.ok && r1.reason === 'registered', '首次登记成功');
const v1 = B.read('甲');
a.strictEqual(v1.tier, 'slim');
a.strictEqual(v1.capacity.free, 1, '双手持一物 = 空手 1');
a.strictEqual(v1.facingLabel, '面向读者');

// ── ④ 头只有一个 / 无足不立 / 容量上限 ──
a.strictEqual(B.register('乙', { anchor: '门口', heads: 2 }).reason, 'head-count');
a.strictEqual(B.register('乙', { anchor: '门口', legs: 0 }).reason, 'no-support');
a.strictEqual(B.register('乙', { anchor: '门口', arms: 2, holding: ['剑', '盾', '灯'] }).reason, 'over-capacity');
a.strictEqual(B.register('乙', { anchor: '' }).reason, 'missing-anchor');
a(B.register('乙', { anchor: '门口', tier: '不存在' }).ok === false, '表外体型拒收');
const cap = B.capacityOf('甲');
a.strictEqual(cap.arms, 2); a.strictEqual(cap.free, 1);

// ── ⑤ 单一锚点：换锚须 move ──
a.strictEqual(B.register('甲', { tier: 'slim', anchor: '窗边' }).reason, 'multi-anchor');
a.strictEqual(B.register('甲', { tier: 'slim', anchor: '窗边', move: '窗边' }).reason, 'updated', '显式 move 放行换锚');

// ── ⑥ 朝向一致：换向须 turn ──
a.strictEqual(B.register('甲', { tier: 'slim', anchor: '窗边', facing: 'back' }).reason, 'facing-contradiction');
a.strictEqual(B.register('甲', { tier: 'slim', anchor: '窗边', facing: 'back', turn: 'about' }).reason, 'updated', '显式 turn 放行换向');
a(B.register('甲', { tier: 'slim', anchor: '窗边', turn: '斜转' }).ok === false, '表外转身码拒收');

// ── ⑦ 体型禁令：slim 不许虎背熊腰，heavy 不许身轻如燕 ──
const veto1 = B.checkVeto('slim', ['他虎背熊腰，往门口一站']);
a(veto1.ok === false && veto1.hits[0].word === '虎背熊腰');
const veto2 = B.checkVeto('heavy', ['她身轻如燕']);
a(veto2.ok === false && veto2.hits[0].word === '身轻如燕');
a(B.checkVeto('slim', ['他身形清瘦，眉目疏朗']).ok === true, '未触禁令放行');
a.strictEqual(B.register('丙', { anchor: '床沿', tier: 'tiny', claims: ['她与成人平视'] }).reason, 'veto-hit');
a(B.vetoOf('tall').pins.indexOf('踮脚') >= 0, '禁令层只读视图');

// ── ⑧ 可及判定：按 TIER_REACH 表，不按「一臂之遥」 ──
const reach = B.canReach('甲', 0.7);
a(reach.ok && reach.reason === 'reachable' && reach.reach === 0.72, 'slim 单臂 0.72m');
a.strictEqual(B.canReach('甲', 1.2).reason, 'out-of-reach');

// ── ⑨ 注入块形态：逐行带锚点/持物/禁令 + 口径行 ──
const block = B.buildBlock();
a(block.indexOf('[人体结构]') === 0, '块头口径');
a(block.indexOf('甲（清瘦）背向读者 · 锚点「窗边」') > 0, '行格式：体型 + 朝向 + 锚点');
a(block.indexOf('禁写：') > 0, '每行带禁令层');
a(block.indexOf('面向读者时画面左 = 角色右') > 0, '左右映射口径行逐字在块内');
a(block.indexOf('头只有一个') > 0, '单一锚点/头只有一个口径行在块内');

// ── ⑩ 关回去：块归空 ──
B.setSettings({ enabled: false });
a.strictEqual(B.buildBlock(), '');
const st = B.stat();
a(st.regs >= 2 && st.blocked >= 5, 'stat 双计数有账：regs=' + st.regs + ' blocked=' + st.blocked);

// ── ⑪ 注入链接线：SOURCES / vis 默认值 / SRC_NAME / SRC_MOD_SETTING 四处同批 ──
const injSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'render', 'inject.js'), 'utf8');
a(injSrc.indexOf("'bodyAnatomy'") >= 0, 'SOURCES 源表已登记');
a(injSrc.indexOf('bodyAnatomy: true') >= 0, 'vis 默认值已登记');
a(injSrc.indexOf("bodyAnatomy: '人体结构'") >= 0, 'SRC_NAME 显示名已登记');
a(injSrc.indexOf('worldaxis_body_anatomy_settings_v1') >= 0, 'SRC_MOD_SETTING 已登记');
a(injSrc.indexOf("engineCall('bodyAnatomy'") >= 0, '注入分支真消费点已接线');
a(injSrc.indexOf("{ source: '人体结构', content: bab }") >= 0, '注入项 source 名与 SRC_NAME / VIS_NAMES 逐字一致');
const pnlSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'ui', 'panel.js'), 'utf8');
a(pnlSrc.indexOf("bodyAnatomy: '人体结构'") >= 0, 'panel VIS_NAMES 同批登记');
const idxSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.js'), 'utf8');
a(idxSrc.indexOf("'engines/body-anatomy.js'") >= 0, 'index.js LOAD_ORDER 已登记');
const runSrc = require('fs').readFileSync(__filename.replace(/[^/]*$/, 'run.js'), 'utf8');
a(runSrc.indexOf("'engines/body-anatomy.js'") >= 0, 'tests/run.js LOAD 同序登记');

console.log('body-anatomy v2.411.0: mirror table / facing / anchor / head-count / capacity / veto / reach / inject wiring: PASS');
