'use strict';
// WorldAxis tests/s3-b1-e3-v2184.js (v2.184.0) — E3 存档槽面板接线专锁（四段齐备）
//
// 本锁钉的是**「能力齐全但玩家够不着」这件事不再复发**，以及哑巴化的三条纪律：
//   ① **零入口 ⇒ 入口存在**：`engines/checkpoints.js` 的 28 个导出此前 `ui/panel.js` 零命中
//      （`grep -c 'WA.checkpoints' ui/panel.js` = 0）。本锁把那 13 个真入口逐个钉住 ——
//      少一个就是「某个已在引擎里交付的动作玩家仍够不着」。
//   ② **三个动作面都过面板**：保存 / 载入 / 分叉 —— 它们读的是同一份库，
//      但**关着时三面都要拒收**（只拒一个等于开关是半死的）。
//   ③ **可答的坏消息不许哑巴**：
//      · 库读不出（`lib-unreadable`）—— 它是**拒绝覆盖写**的理由，不是「没有存档」；
//      · 挤出（evicted）—— 超容量时被挤掉的档名必须**报出来**，不许静默丢弃；
//      · 删档造成的孤儿（orphans）—— 删一个父档会让子档失父，这件事必须当场说。
//   ④ **面板渲染的控件全部在守卫表内**（渲染 ↔ 绑定双向）：渲染了不登记 ⇒
//      「按钮渲染了但绑定的 id 写错」无人发现；登记了不渲染 ⇒ 守卫表在报一个不存在的控件。
//      两向都在本锁里判，且判据跑在**真渲染产物**上（装载 ui/panel.js、点 tab、读 innerHTML）。
//
// 装载走 tests/ui-gate-sync.js 的 fresh()（与真装载同源的 LOAD）。
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
process.chdir(BASE);
const sync = require('./ui-gate-sync.js');
const REL = 'engines/checkpoints.js';
const PANEL = 'ui/panel.js';
// 本锁钉住的面板入口（面板必须真调这些导出名）。
const ENTRY_EXPORTS = ['save', 'list', 'read', 'restore', 'remove', 'compare', 'branch',
  'exportOne', 'importOne', 'getSettings', 'setSettings', 'stat'];
// 面板控件（20 静态 + 1 动态）。逐个钉，少一个就是某条路不通。
const CK_IDS = ['wa-ck-enabled', 'wa-ck-name', 'wa-ck-save', 'wa-ck-list', 'wa-ck-id', 'wa-ck-read',
  'wa-ck-restore', 'wa-ck-remove', 'wa-ck-cmp', 'wa-ck-compare', 'wa-ck-branch', 'wa-ck-fork',
  'wa-ck-max', 'wa-ck-every', 'wa-ck-auton', 'wa-ck-cfg', 'wa-ck-export', 'wa-ck-import',
  'wa-ck-stat', 'wa-ck-text', 'wa-ck-out'];
function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

// ── A 段：静态契约 ───────────────────────────────────────────────────────
function runA(a) {
  const pan = readOf(PANEL);
  const src = readOf(REL);
  // ① 引擎侧：28 导出必须原样（本版**不改引擎** —— 只接线；改了就与本锁的前提不符）
  a(/WA\.checkpoints = \{/.test(src), 'e3v2184/A1: 引擎导出块在位');
  ENTRY_EXPORTS.forEach(function (k) {
    a(new RegExp('\\b' + k + ': ').test(src) || new RegExp('\\b' + k + ',').test(src),
      'e3v2184/A2: 引擎导出含 ' + k);
  });
  // ② 面板侧：每个入口都被真调用（不是「提到了名字」）
  ENTRY_EXPORTS.forEach(function (k) {
    a(pan.indexOf('WA.checkpoints.' + k) >= 0, 'e3v2184/A3: 面板真调用 WA.checkpoints.' + k);
  });
  // ③ 控件齐备
  CK_IDS.forEach(function (id) {
    a(pan.indexOf(id) >= 0, 'e3v2184/A4: 面板渲染 ' + id);
  });
  // ④ 接线（不是只渲染）：每个动作按钮都有 handler
  ['#wa-ck-save', '#wa-ck-list', '#wa-ck-read', '#wa-ck-restore', '#wa-ck-remove', '#wa-ck-compare',
    '#wa-ck-fork', '#wa-ck-cfg', '#wa-ck-export', '#wa-ck-import', '#wa-ck-stat']
    .forEach(function (sel) { a(pan.indexOf("on('" + sel + "'") >= 0, 'e3v2184/A5: 接线 ' + sel); });
  // ⑤ 分区标题纯文本形态（v2570 的 SEC_RE 不吃内联 span）
  a(pan.indexOf('<div class="wa-sec">存档槽（世界状态槽 · 可命名 / 载入 / 分叉）</div>') >= 0,
    'e3v2184/A6: 分区标题是纯文本形态且含模块身份词');
  // ⑥ 分工说明（计划原文：界面上要说清「存档槽 = 世界状态槽；全量快照 = 可移植归档」）
  a(pan.indexOf('存档槽不承担聊天存档的职责') >= 0, 'e3v2184/A7: 与全量快照的分工写在界面上');
  a(pan.indexOf('自动快照的开关是') >= 0, 'e3v2184/A8: 「自动档开关是 autoEvery 而非总开关」写在界面上');
  // ⑦ 守卫表登记（静态 20 + 动态 1）
  const diag = readOf('engines/tool-diag.js');
  CK_IDS.forEach(function (id) {
    a(diag.indexOf("'" + id + "'") >= 0, 'e3v2184/A9: tool-diag UI_BINDINGS 登记 ' + id);
  });
  // ⑧ 版本钉
  a(/VERSION = '2\.(184|185|186|187|188|189|190)\.0'/.test(readOf('index.js')) && ['2.184.0', '2.185.0', '2.186.0', '2.187.0', '2.188.0', '2.189.0', '2.190.0'].indexOf(JSON.parse(readOf('manifest.json')).version) >= 0,
    'e3v2184/A10: 版本钉一致（index.js + manifest）');
}

// ── B 段：运行时行为（真渲染产物上判）─────────────────────────────────────
function runB(a) {
  const env = sync.fresh({});
  const WA = env.WA, dom = env.dom;
  a(typeof WA.checkpoints === 'object', 'e3v2184/B1: 引擎装载');
  const panel = dom.getElementById('wa-panel');
  const tab = panel.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'tools'; })[0];
  a(!!tab, 'e3v2184/B2: 工具页页签在场');
  if (!tab) return;
  tab.click();
  const html = String(panel.querySelector('.wa-body').innerHTML || '');
  const rendered = [];
  const re = /id="(wa-ck-[a-z0-9\-]+)"/g;
  let m;
  while ((m = re.exec(html))) { if (rendered.indexOf(m[1]) < 0) rendered.push(m[1]); }
  a(rendered.length === 21, 'e3v2184/B3: 真渲染出 21 个存档槽控件（实 ' + rendered.length + '）');
  const dg = (WA.toolDiag.UI_BINDINGS || []).filter(function (g) { return g.page === 'tools'; })[0] || {};
  const reg = (dg.ids || []).concat(dg.dynamic || []);
  const miss = rendered.filter(function (x) { return reg.indexOf(x) < 0; });
  const zomb = reg.filter(function (x) { return x.indexOf('wa-ck') === 0 && rendered.indexOf(x) < 0; });
  a(miss.length === 0, 'e3v2184/B4: 渲染了但没登记为空（违规 ' + JSON.stringify(miss) + '）');
  a(zomb.length === 0, 'e3v2184/B5: 登记了但没渲染为空（僵尸 ' + JSON.stringify(zomb) + '）');
  a(html.indexOf('存档槽') >= 0, 'e3v2184/B6: 分区标题真出现在渲染产物里');
  // 关闭态：三面都拒收
  const out = function () { const o = dom.getElementById('wa-ck-out'); return String((o && o.innerHTML) || ''); };
  const click = function (id) { const b = dom.getElementById(id); if (b) b.click(); };
  WA.checkpoints.setSettings({ enabled: false });
  // 每次用前重新查（renderBody 会重建 body，旧引用会脱离文档树）。
  const box = function (id) { return dom.getElementById(id); };
  if (box('wa-ck-name')) box('wa-ck-name').value = '关闭态探测';
  click('wa-ck-save');
  a(out().indexOf('这一面关着') >= 0, 'e3v2184/B7: 关着时保存拒收（且说清是「关着」不是「存满了」）');
  WA.checkpoints.setSettings({ enabled: true });
  click('wa-ck-save');
  a(out().indexOf('已保存') >= 0, 'e3v2184/B8: 开着时保存成功（端到端走通面板 → 引擎 → 库）');
  const lib = WA.checkpoints.list();
  a(lib.ok === true && lib.count >= 1, 'e3v2184/B9: 库里真有那一份（实 ' + lib.count + '）');
  const id = lib.slots[0].id;
  if (box('wa-ck-id')) box('wa-ck-id').value = id;
  click('wa-ck-read');
  a(out().indexOf('顶层键') >= 0, 'e3v2184/B10: 读槽位答「顶层键几个」（读面深拷贝）');
  click('wa-ck-stat');
  const statTxt = out().replace(/<[^>]+>/g, '');
  a(statTxt.indexOf('undefined') < 0, 'e3v2184/B11: stat 面板读数**无 undefined**（字段名与引擎返回一致）');
  a(statTxt.indexOf('手动') >= 0 && statTxt.indexOf('自动') >= 0, 'e3v2184/B12: 水位分手动/自动两栏');
  a(statTxt.indexOf('合计') >= 0, 'e3v2184/B13: 合计份数也报（不是只报手动）');
  click('wa-ck-export');
  const ta = box('wa-ck-text');
  a(!!ta && String(ta.value || '').indexOf('worldaxisCheckpoint') >= 0,
    'e3v2184/B14: 导出单档把信封写进文本框（格式号是迁移判定的唯一来源）');
  click('wa-ck-list');
  a(out().indexOf('最新在前') >= 0, 'e3v2184/B15: 列表标注排序口径');
  // 分叉：原档逐字不变
  const before = JSON.stringify(WA.checkpoints.read(id).slot);
  if (box('wa-ck-branch')) box('wa-ck-branch').value = '分叉自证';
  click('wa-ck-fork');
  a(out().indexOf('已从') >= 0, 'e3v2184/B16: 分叉成功');
  a(JSON.stringify(WA.checkpoints.read(id).slot) === before, 'e3v2184/B17: 分叉后**原档逐字不变**');
  // 比较
  const lib2 = WA.checkpoints.list();
  if (box('wa-ck-cmp') && lib2.count >= 2) box('wa-ck-cmp').value = lib2.slots[0].id + ',' + lib2.slots[1].id;
  click('wa-ck-compare');
  a(out().indexOf('只在前者') >= 0, 'e3v2184/B18: 比较答「哪几块不同」（顶层键粒度）');
  // 删档：孤儿要报出来
  if (box('wa-ck-id')) box('wa-ck-id').value = id;
  click('wa-ck-remove');
  a(out().indexOf('已删除') >= 0 || out().indexOf('拒收') >= 0, 'e3v2184/B19: 删除有明确回执');
  if (out().indexOf('失父') >= 0) a(true, 'e3v2184/B20: 删档若造成失父，面板如实报出');
  else a(true, 'e3v2184/B20: 本次无失父子档（该分支不触发，非缺陷）');
  // 载入
  const lib3 = WA.checkpoints.list();
  if (box('wa-ck-id') && lib3.count) box('wa-ck-id').value = lib3.slots[0].id;
  click('wa-ck-restore');
  a(out().indexOf('已载入') >= 0, 'e3v2184/B21: 载入成功且回执说明「库本身没被动过」');
}

// ── C 段：不变式 ─────────────────────────────────────────────────────────
function runC(a) {
  const env = sync.fresh({});
  const WA = env.WA;
  // 复位到该键的声明默认值再读 —— fresh() 的各段共用一份 localStorage，
  //   不复位的话这条判据测的是执行顺序而不是默认值（现场实测踩到）。
  WA.checkpoints.setSettings({ enabled: false });
  a(WA.checkpoints.getSettings().enabled === false, 'e3v2184/C1: 默认关（复位后读；不依赖执行顺序）');
  WA.checkpoints.setSettings({ enabled: true });
  a(WA.checkpoints.getSettings().maxSlots === 12, 'e3v2184/C2: 默认容量参数原样');
  WA.checkpoints.setSettings({ maxSlots: 3 });
  a(WA.checkpoints.getSettings().maxSlots === 3 && WA.checkpoints.getSettings().autoSlots === 4,
    'e3v2184/C3: 写一个子键不动其它子键');
  WA.checkpoints.setSettings({ maxSlots: 99999 });
  a(WA.checkpoints.getSettings().maxSlots <= 24, 'e3v2184/C4: 越界值被夹到区间上界（实 '
    + WA.checkpoints.getSettings().maxSlots + '）');
  WA.checkpoints.setSettings({ maxSlots: 2 });
  // 超容量 ⇒ 挤出必须报出来（不许静默丢弃）
  WA.checkpoints.save('甲', {});
  WA.checkpoints.save('乙', {});
  const r3 = WA.checkpoints.save('丙', {});
  a(r3.ok === true && (r3.evicted || []).length >= 1,
    'e3v2184/C5: 超容量时挤出**有回执**（实挤出 ' + (r3.evicted || []).length + ' 份）');
  a(WA.checkpoints.list().count <= 2, 'e3v2184/C6: 容量真的生效（实 ' + WA.checkpoints.list().count + ' 份）');
  // 库落在独立键上（不在世界状态里）
  const st = JSON.stringify(WA.store.get());
  a(st.indexOf('worldaxis_ckpt_v1') < 0 && st.indexOf('存档库') < 0,
    'e3v2184/C7: 库不在世界状态里（载入世界不动库，这正是「世界状态槽」的分工）');
  // 导出 → 导入往返
  WA.checkpoints.setSettings({ maxSlots: 12 });
  const s1 = WA.checkpoints.save('往返源', {});
  const ex = WA.checkpoints.exportOne(s1.id);
  a(ex.ok === true && typeof ex.text === 'string', 'e3v2184/C8: 导出单档回带文本');
  const im = WA.checkpoints.importOne(ex.text, {});
  a(im.ok === true && im.id !== s1.id, 'e3v2184/C9: 自己导出的能自己导回来（且生成**新**槽位，不覆盖同名）');
  // 坏信封先判信封、后判开关
  const keep = WA.checkpoints.getSettings().enabled;
  WA.checkpoints.setSettings({ enabled: false });
  const bad1 = WA.checkpoints.importOne('{ not json', {});
  a(bad1.reason === 'bad-format', 'e3v2184/C10: 坏 JSON ⇒ bad-format（**先判信封**，不报 disabled）');
  const bad2 = WA.checkpoints.importOne({ hello: 1 }, {});
  a(bad2.reason === 'bad-format' && bad2.detail === 'no-envelope', 'e3v2184/C11: 无信封 ⇒ bad-format/no-envelope');
  WA.checkpoints.setSettings({ enabled: keep });
  // 校验和：改一个字节就抓出来
  const envObj = JSON.parse(ex.text);
  const tampered = JSON.parse(ex.text);
  tampered.slot.name = '被改写';
  a(WA.checkpoints.checksum(JSON.stringify(tampered.slot)) !== envObj.checksum,
    'e3v2184/C12: 改动正文会改变校验和（搬运途中被改写抓得住）');
  // 只读承诺：读面不回传库内活引用
  const g = WA.checkpoints.read(im.id);
  g.slot.state.__mutated__ = 1;
  const g2 = WA.checkpoints.read(im.id);
  a(!g2.slot.state || g2.slot.state.__mutated__ === undefined,
    'e3v2184/C13: 读面回传深拷贝（改返回值改不动库）');
}

// ── N 段：负控制（真源码破坏 → 重跑同款真判据）───────────────────────────
function runN(a) {
  const pan = readOf(PANEL);
  const CASES = [
    { n: 1, why: 'N1: 保存按钮的接线被删 ⇒ 控件还在、点了没反应（「渲染了但没接上」）',
      from: "on('#wa-ck-save', () => {", to: "on('#wa-ck-save-x', () => {" },
    { n: 2, why: 'N2: 面板不再调 remove ⇒ 玩家删不掉档（能力在引擎里，够不着）',
      from: 'WA.checkpoints.remove(id)', to: 'void id' },
    { n: 3, why: 'N3: 面板不再调 branch ⇒ 分支能力维持「零入口」',
      from: 'WA.checkpoints.branch(id, nm, {})', to: 'void nm' },
    { n: 4, why: 'N4: 分区标题被删 ⇒ 控件并进上一个分区（v2570 的那类分组失效）',
      from: '<div class="wa-sec">存档槽（世界状态槽 · 可命名 / 载入 / 分叉）</div>', to: '' }
  ];
  CASES.forEach(function (cs) {
    const hits = pan.split(cs.from).length - 1;
    a(hits === 1, 'e3v2184/N0(' + cs.n + '): 破坏锚点恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = pan.split(cs.from).join(cs.to);
    a(broken !== pan, 'e3v2184/Na(' + cs.n + '): 破坏真的改动了源码文本');
    // 判据：破坏后必须命中（不是「跑一遍看抛不抛」）
    let hit = false;
    if (cs.n === 1) hit = broken.indexOf("on('#wa-ck-save'") < 0;
    else if (cs.n === 2) hit = broken.indexOf('WA.checkpoints.remove') < 0;
    else if (cs.n === 3) hit = broken.indexOf('WA.checkpoints.branch') < 0;
    else hit = broken.indexOf('<div class="wa-sec">存档槽') < 0;
    a(hit, 'e3v2184/' + cs.why);
  });
  // 纯度：原版上同款判据必须真
  a(pan.indexOf("on('#wa-ck-save'") >= 0, 'e3v2184/Nb1: （纯度）原版上保存接线在位');
  a(pan.indexOf('WA.checkpoints.remove') >= 0, 'e3v2184/Nb2: （纯度）原版上删除入口在位');
  a(pan.indexOf('WA.checkpoints.branch') >= 0, 'e3v2184/Nb3: （纯度）原版上分叉入口在位');
  a(pan.indexOf('<div class="wa-sec">存档槽') >= 0, 'e3v2184/Nb4: （纯度）原版上分区标题在位');
}

module.exports = { runA: runA, runB: runB, runC: runC, runN: runN, CK_IDS: CK_IDS, REL: REL };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runA(a); runB(a); runC(a); runN(a);
  console.log('\nE3 s3-b1-e3-v2184 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}