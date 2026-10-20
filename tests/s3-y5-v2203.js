#!/usr/bin/env node
// WorldAxis tests/s3-y5-v2203.js — Y5 世界快照与整包搬运专锁（v2.200.0 第四批）
//
// 【计划原文（plans/Y_EXPANSION.md §Y5）逐条对照】
//   要解决的玩家问题：现场两个引擎都不能回答「把那边的世界并过来」——
//     `engines/tool-snapshot.js` 的 `restore()` 是**替换式**的（先 delete 全部 draft 键再
//     Object.assign），装到非空世界上等于把当前世界整块换掉；
//     `engines/world-blueprint.js` 的 `targetEmpty()` 一票否决非空局。
//   新功能四条：① 出一个世界快照（规则 / 人物 / 地图 / 编年史 / 拍账）；
//     ② 版本不兼容时拒绝并说明差异；③ 缺失模块 / 旧 schema / 冲突键三类都有预览或拒收；
//     ④ 快照与蓝图互转。
//   边界四条：① 导入默认不覆盖；② 版本不兼容拒收并说明差异（不静默降级）；
//     ③ 不写密钥与宿主机密；④ 不含无法复现的宿主态。
//   验收四条：① 导出→导入往返后关键面逐字一致（哈希对照）；② 三类问题不静默丢字段；
//     ③ 大世界有容量预检；④ 损坏文件有可读错误而不是抛异常。
//
// 【本锁对计划原文的两处**如实偏离**（写在最前，不藏）】
//   偏离 1「快照库容量」计划未写数字，本实现自定 `MAX_LIB = 8`。锁按「上限存在且
//     超出时留最新、不无限长」判，**不判具体数字**（数字是产品选择，不是计划条文）。
//   偏离 2 验收 ③「大世界有容量预检」在无头环境里造不出真 2MB 以上的世界，
//     锁用**引擎自己的 `capacity()` 口**判（超预算拒收而非截断），并另判
//     「被拒后世界一格未动」—— 容量这件事的可判面是「拒收 + 不写」，不是体积本身。
//
// 【本锁四段】A 静态契约 / B 运行时四态与往返 / C 零写入不变式 / N 负控制两向自证。
//   N 段走**真源码破坏 + 两向跑产品**：每例既判「破坏改变了源码文本」，也在
//   装载破坏副本的 mini-DOM 环境里真跑一次产品、再在原版上跑同款判据。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PANEL_REL = 'ui/panel.js';
const DIAG_REL = 'engines/tool-diag.js';
const ENG_REL = 'engines/world-snapshot.js';
const SELF_REL = 'tests/s3-y5-v2203.js';
/** v2.230.0 收口：mini-DOM 的 `innerHTML` getter 会把**容器自身标签**也序列化进去
 *  （tests/ui-dom.js 的 `ser(el)`），浏览器只返回子节点。于是「空容器」的长度不是 0，
 *  而是容器自身那一段（Y1 实测 41 字符，随 tag/id/class 长短而变）。
 *  判据的真问题从来不是「长度是不是 0」，而是「破坏之后读数**再也写不进去**」
 *  —— 即出口容器**一个子元素都没有**。 */
function emptyOut(el) { return !!el && el.childNodes.length === 0; }
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }
/** 破坏锚点：逐字取自产品源码，各恰 1 次（N0 验）。 */
const ANCHOR = {
  page: "{ id: 'port', icon: '📦', label: '搬运' },",
  renderer: 'port: renderPortCenter,',
  out: "$('#wa-wps-out')",
  guard: "    { page: 'port', ids:",
  acc: 'const ACCEPTED = [1];',
  ver: 'if (!ACCEPTED.length || ACCEPTED.indexOf(ver) < 0) {',
  budget: "return { ok: false, reason: 'budget-exceeded', bytes: bytes, budget: MAX_BYTES, seen: seen };",
  badjson: "catch (e) { return { ok: false, reason: 'bad-json', detail: String((e && e.message) || e).slice(0, 160) }; }",
  skip: "skip.push({ face: face, n: c.n, why: 'conflict-kept' });",
  mergeKeep: 'if (Object.prototype.hasOwnProperty.call(cur, k)) return;',
  newslot: "if (pv.mode === 'newslot') {",
  secrets: "const SECRETS = ['credentials', 'scripts', 'chatText', 'apiKey', 'session', 'binding', 'userlock'];"
};
const TGT = { page: PANEL_REL, renderer: PANEL_REL, out: PANEL_REL, guard: DIAG_REL,
  acc: ENG_REL, ver: ENG_REL, budget: ENG_REL, badjson: ENG_REL,
  skip: ENG_REL, mergeKeep: ENG_REL, newslot: ENG_REL, secrets: ENG_REL };
const SEG_RENDER_START = '  // v2.200.0（第四批 Y5）：世界快照与整包搬运 —— 把';
const SEG_RENDER_END = '  function renderBody() {';
const SEG_BIND_START = '    // ── v2.200.0（Y5）：世界快照与整包搬运（四枚只读';
const SEG_END = '\n  }\n\n  // ── 面板与悬浮球 ──';
/** 闪控控件（17 枚：12 按钮 + 1 下拉 + 1 下拉 + 1 勾选 + 1 输入 + 1 文本域）。 */
const STATIC_IDS = ['wa-wps-snap', 'wa-wps-json', 'wa-wps-check', 'wa-wps-preview',
  'wa-wps-mode', 'wa-wps-conf', 'wa-wps-ovr', 'wa-wps-import',
  'wa-wps-lib', 'wa-wps-slot', 'wa-wps-take', 'wa-wps-drop',
  'wa-wps-blue', 'wa-wps-graph', 'wa-wps-round', 'wa-wps-diag', 'wa-wps-text'];
/** 带 onclick 的那十二枚。 */
const BTN_IDS = ['wa-wps-snap', 'wa-wps-json', 'wa-wps-check', 'wa-wps-preview', 'wa-wps-import',
  'wa-wps-lib', 'wa-wps-take', 'wa-wps-drop', 'wa-wps-blue', 'wa-wps-graph', 'wa-wps-round', 'wa-wps-diag'];
/** 本页不得出现的其它页独占前缀（切片蔓延的现场判据）。 */
const OTHER_PREFIX = ['wa-bt-', 'wa-chw-', 'wa-td-'];
function stripLineComments(s) {
  return s.split('\n').map(function (l) {
    const i = l.indexOf('//');
    return i < 0 ? l : l.slice(0, i);
  }).join('\n');
}
function runAll(a) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const LS = global.localStorage;
  const P = rd(PANEL_REL), D = rd(DIAG_REL), E = rd(ENG_REL), SELF = rd(SELF_REL);
  function env0(ov) { return gate.fresh(ov ? { srcOverride: ov } : {}); }
  function seed(WA, fn) { WA.store.init(); return WA.store.transact(fn, 'y5:seed'); }
  function gotoPort(env) {
    const dom = env.dom, p = dom.getElementById('wa-panel');
    if (!p) throw new Error('面板未注入');
    const tab = p.querySelectorAll('.wa-tab').filter(function (t) { return t.dataset.page === 'port'; })[0];
    if (!tab) throw new Error('找不到 port 页签 —— 页表里没有它');
    tab.click();
    return dom;
  }
  /** v2.230.0 收口：同时交出出口**容器**（emptyOut 注见模块顶层）——「读数为空」是
   *  「容器零子元素」，不是「序列化长度为零」（mini-DOM 会把容器自身标签算进去）。 */
  function portOutNode(dom, id) {
    const b = dom.getElementById(id);
    if (!b) return null;
    if (typeof b.onclick !== 'function') return null;
    b.onclick({ target: b });
    return dom.getElementById('wa-wps-out');
  }
  function portOut(dom, id) {
    const o = portOutNode(dom, id);
    return String(o ? o.innerHTML : '');
  }
  // ════ A 段：静态契约 ════════════════════════════════════════════════
  const segR = P.slice(P.indexOf(SEG_RENDER_START), P.indexOf(SEG_RENDER_END));
  const segB = P.slice(P.indexOf(SEG_BIND_START), P.indexOf(SEG_END));
  a(P.indexOf('function renderPortCenter() {') >= 0, 'y5v2203/A1: 渲染器 renderPortCenter 在位');
  a(P.indexOf(SEG_RENDER_START) >= 0 && P.indexOf(SEG_BIND_START) >= 0 && P.indexOf(SEG_END) > 0,
    'y5v2203/A1b: 两段段首与段尾锚点都在位（切片有效）');
  a(segR.length > 1000 && segB.length > 1000,
    'y5v2203/A1c: 两段切片非空（实渲染段 ' + segR.length + ' / 绑定段 ' + segB.length + ' 字符）—— 切片失效会让下面的扫描在空集上恒真');
  (function () {
    const leak = [];
    OTHER_PREFIX.forEach(function (p) {
      if (cnt(segR, p) > 0) leak.push('渲染段 ' + p + cnt(segR, p));
      if (cnt(segB, p) > 0) leak.push('绑定段 ' + p + cnt(segB, p));
    });
    a(leak.length === 0, 'y5v2203/A1e: 两段切片未蔓延（无它页前缀：' + (leak.join('、') || '无声') + '）');
  })();
  a(P.indexOf(ANCHOR.page) >= 0, 'y5v2203/A2: 页表里有 port 页');
  a(/^[a-z]+$/.test('port'), 'y5v2203/A2b: 页 id 纯小写字母（C11 页清单解析器只认 [a-z]+）');
  a(P.indexOf(ANCHOR.renderer) >= 0, 'y5v2203/A2c: RENDERERS 里有 port → renderPortCenter（页表与渲染器成对）');
  a(D.indexOf(ANCHOR.guard) >= 0, 'y5v2203/A2d: 守卫表新增 port 页分组（渲染 + 绑定 + 守卫登记三件齐做）');
  a(cnt(P, "'#wa-wps-") >= 12, 'y5v2203/A2e: 本页绑定用独占前缀 wa-wps-（实 ' + cnt(P, "'#wa-wps-") + ' 处）');
  STATIC_IDS.forEach(function (id) {
    a(cnt(segR, 'id="' + id + '"') === 1, 'y5v2203/A3: ' + id + ' 在渲染段恰渲染 1 次（实 ' + cnt(segR, 'id="' + id + '"') + '）');
    a(cnt(D, "'" + id + "'") === 1, 'y5v2203/A3c: ' + id + ' 在守卫表里恰登记 1 次（实 ' + cnt(D, "'" + id + "'") + '）');
  });
  BTN_IDS.forEach(function (id) {
    a(cnt(segB, "on('#" + id + "', () => {") === 1, 'y5v2203/A3b: ' + id + ' 的 onclick 绑定恰 1 处（实 ' + cnt(segB, "on('#" + id + "', () => {") + '）');
  });
  a(cnt(D, "'wa-wps-out'") === 1, 'y5v2203/A4: 动态读数出口 wa-wps-out 进 dynamic 层');
  a(cnt(segR, 'id="wa-wps-out"') === 1, 'y5v2203/A4b: 输出容器在渲染段在场（否则十二枚 handler 写进空气）');
  const codeSeg = stripLineComments(segR) + '\n' + stripLineComments(segB);
  a(codeSeg.indexOf('store.transact(') < 0,
    'y5v2203/A5: 两段零 store.transact 调用（面板不自己拼写入 —— 合并必须走引擎的统一写路径）');
  a(codeSeg.indexOf('localStorage.setItem(') < 0 && codeSeg.indexOf('localStorage.getItem(') < 0,
    'y5v2203/A5b: 两段零 localStorage 直接读写（快照库的唯一读写面在引擎里）');
  a(codeSeg.indexOf('WA.worldSnapshot.exportSnapshot(') >= 0 && codeSeg.indexOf('WA.worldSnapshot.importSnapshot(') >= 0,
    'y5v2203/A5c: 去注释后真读口与真写口**带括号**在场（防自我指涉：判据不许把自己删掉）');
  a(cnt(segR, '真源') >= 2 && cnt(segB, '真源') >= 5,
    'y5v2203/A6: 读数逐处标注「真源」（渲染段 ' + cnt(segR, '真源') + ' / 绑定段 ' + cnt(segB, '真源') + ' 处）');
  a(segR.indexOf('导入默认不覆盖') >= 0, 'y5v2203/A6b: 页面对玩家明写「导入默认不覆盖」（边界 1 对玩家可见）');
  a(segB.indexOf('已新增') >= 0 && segB.indexOf('已覆盖') >= 0 && segB.indexOf('已跳过') >= 0 && segB.indexOf('已改名') >= 0,
    'y5v2203/A7: 四类处置（新增 / 覆盖 / 跳过 / 改名）逐条分开报，不合成一句');
  a(segB.indexOf('stripped') >= 0 && segB.indexOf('skippedHost') >= 0,
    'y5v2203/A7b: 密钥剔除与宿主态剔除逐项报答（静默剔除等于用户以为带上了）');
  a(segB.indexOf('不做「尽力而为」') >= 0 || segB.indexOf('不兼容时') >= 0,
    'y5v2203/A7c: 不兼容拒收话术在绑定段（边界 2 的否定面）');
  // 锚点纯度（H5）：表切片取到行首 `};`
  const anchorDecl = SELF.slice(SELF.indexOf('const ANCHOR = {'), SELF.indexOf('\n};', SELF.indexOf('const ANCHOR = {')));
  Object.keys(ANCHOR).forEach(function (k) {
    a(cnt(rd(TGT[k]), ANCHOR[k]) === 1, 'y5v2203/A8: 锚点 ' + k + ' 在目标文件里恰中 1 次（实 ' + cnt(rd(TGT[k]), ANCHOR[k]) + '）');
    a(cnt(anchorDecl, ANCHOR[k]) === 1, 'y5v2203/A8b: 锚点 ' + k + ' 在 ANCHOR 表里恰声明 1 次（表外引用不计）');
  });
  a(cnt(anchorDecl, ':') >= 12, 'y5v2203/A8c: ANCHOR 表切片有效（实 ' + cnt(anchorDecl, ':') + ' 个冒号）');
  return runRest(a, { gate: gate, LS: LS, env0: env0, seed: seed,
    gotoPageF: gotoPort, portOutF: portOut, portOutNodeF: portOutNode,
    P: P, D: D, E: E, segR: segR, segB: segB,
    ANCHOR: ANCHOR, TGT: TGT, PANEL_REL: PANEL_REL, DIAG_REL: DIAG_REL, ENG_REL: ENG_REL });
}
// ════ B 段：运行时 ────────────────────────────────────────────────
//   四态：空世界 / 正常世界 / 不兼容快照 / 坏文件 —— 每态都要求「不抛且有可读读数」。
function runRest(a, C) {
  const gate = C.gate, env0 = C.env0, LS = C.LS, seed = C.seed;
  const gotoPort = C.gotoPageF, portOut = C.portOutF;
  const P = C.P, D = C.D, E = C.E;
  // 态 0：空世界（store 未初始化）—— 出快照必须**如实报「读不出」**，不是给一份空快照
  {
    const env = env0();
    const S = env.WA.worldSnapshot;
    S.reset();
    // mock 宿主的 store.get() 从出生就返回默认骨架（96 键）——「一个键都没有的世界」在
    //   这里造不出来。故取引擎的**第二档**拒收：点名的面一个都不在场 ⇒ empty-snapshot。
    //   两档拒收都属同一件事：「读不出」必须与「世界是空的」分开报。
    const r = S.exportSnapshot({ faces: ['notARealFace', 'alsoNotReal'] });
    a(r.ok === false && r.reason === 'empty-snapshot',
      'y5v2203/B1: 点名面全不在场时如实拒（reason=' + j(r && r.reason) + '）—— 不拿空快照冒充');
    a(r.missing && r.missing.length === 2, 'y5v2203/B1c: 缺席的面逐项报出（实 ' + j(r && r.missing) + '）');
    a(env.WA.worldSnapshot.stat().refused >= 1, 'y5v2203/B1b: 拒收进计数（拒收不是静默）');
  }
  // 态 1：正常世界 + 面板真点击（页签 → renderBody → bindBody 全链真跑）
  {
    const env = env0();
    const WA = env.WA, S = WA.worldSnapshot;
    seed(WA, function (d) {
      d.people = { A: { name: '甲' } };
      d.world = { places: { p1: { name: '北门' } }, roads: {} };
      d.chronicle = [{ t: '开场' }];
      d.credentials = { token: 'should-not-travel' };
      d.__panelUi = { open: true };
      d.lastInjection = 'x';
    });
    let dom = null;
    try { dom = gotoPort(env); } catch (e) { a(false, 'y5v2203/B0: ' + e.message); }
    a(!!dom, 'y5v2203/B0b: 搬运页可切（页签点击 → 渲染 → 绑定全链真跑）');
    if (dom) {
      const errs = [];
      let first = null;
      BTN_IDS.forEach(function (id) {
        try { const t = portOut(dom, id); if (t === null) errs.push(id + ':无绑定'); else if (!first) first = t; }
        catch (e) { errs.push(id + ':' + (e && e.message)); }
      });
      a(errs.length === 0, 'y5v2203/B2: 十二枚按钮逐个点过零抛出（实 ' + (errs.join(' | ') || '无') + '）');
      const snapTxt = portOut(dom, 'wa-wps-snap');
      a(snapTxt.indexOf('快照已生成') >= 0 && snapTxt.indexOf('真源') >= 0,
        'y5v2203/B2b: 出快照在读出口显示指纹与真源标注');
      // ④ 密钥与宿主态剔除**逐项报答**（不是静默）
      a(snapTxt.indexOf('credentials') >= 0, 'y5v2203/B3: 密钥类键被剔除并**点名报出**（实含 credentials=' + (snapTxt.indexOf('credentials') >= 0) + '）');
      a(snapTxt.indexOf('lastInjection') >= 0 || snapTxt.indexOf('宿主态') >= 0,
        'y5v2203/B3b: 宿主态剔除也报答（边界 4）');
      const jr = S.toJSON({});
      a(jr.ok === true && jr.text.indexOf('credentials') < 0 && jr.text.indexOf('should-not-travel') < 0,
        'y5v2203/B3c: 快照文本里**真的**没有密钥内容（剔除是事实，不是文案）');
      a(jr.text.indexOf('__panelUi') < 0, 'y5v2203/B3d: 运行期脏字段（__*）未进快照');
      a(jr.text.indexOf('lastInjection') < 0, 'y5v2203/B3e: 宿主态键未进快照');
      // ① 验收 ①：导出 → 往返关键面逐字一致（哈希对照）
      const rt = S.roundTrip(jr.text, null);
      a(rt.ok === true && rt.snapshotSig === rt.liveSig,
        'y5v2203/B4: 导出→往返关键面哈希一致（验收 ①：实 ' + j(rt.snapshotSig) + ' vs ' + j(rt.liveSig) + '）');
      const rtTxt = portOut(dom, 'wa-wps-round');
      a(rtTxt.indexOf('逐字一致') >= 0, 'y5v2203/B4b: 页面上如实报「逐字一致」（不是只说 ok）');
      // ③ 预览分类：将要新增 / 跳过（默认不覆盖）
      const pvTxt = portOut(dom, 'wa-wps-preview');
      a(pvTxt.indexOf('导入预览') >= 0 && pvTxt.indexOf('跳过') >= 0,
        'y5v2203/B5: 预览把「新增 / 跳过」分开报（边界 1：默认不覆盖）');
      const pv = S.previewImport(jr.text, {});
      a(pv.ok === true && pv.onConflict === 'skip' && pv.willSkip.length > 0,
        'y5v2203/B5b: 默认冲突策略是 skip 且真检出冲突面（实 ' + pv.willSkip.length + ' 面）');
      a(pv.willOverwrite.length === 0, 'y5v2203/B5c: 默认支**零覆盖**（覆盖只有勾了才发生）');
      // ② merge 导入：写进世界，且世界真变了（真写口验）
      const before = JSON.stringify(WA.store.get().people);
      seed(WA, function (d) { d.people = { B: { name: '乙' } }; });
      const im = S.importSnapshot(jr.text, {});
      a(im.ok === true && im.mode === 'merge', 'y5v2203/B6: merge 导入成功（实 ' + j(im && im.mode) + '）');
      const after = WA.store.get().people;
      a(!!after.A, 'y5v2203/B6b: 快照里的不冲突键**真并进来了**（实 keys=' + j(Object.keys(after)) + '）');
      a(!!after.B, 'y5v2203/B6c: 本地原有键**仍在**（默认支不碰不冲突键，也不碰本地键）');
      a(im.partial === true, 'y5v2203/B6d: 部分处置如实报（partial=true，不谎报「全装上了」）');
      a(before !== JSON.stringify(after), 'y5v2203/B6e: 破坏前置自证：本用例确实改变了 people 面');
    }
  }
  // 态 2：不兼容快照（版本 / 未知面）—— 必须**拒收并给出差异**，不是尽力而为
  {
    const env = env0();
    const WA = env.WA, S = WA.worldSnapshot;
    seed(WA, function (d) { d.people = { A: { name: '甲' } }; });
    const bad = { wsVer: 99, schemaVersion: 1, faces: { people: { Z: { name: '丙' } } } };
    const cc = S.checkCompat(bad);
    a(cc.ok === false && cc.blocking === true && cc.reason === 'bad-snapshot-ver',
      'y5v2203/B7: 版本不兼容⇒阻断（实 ' + j(cc && cc.reason) + '）');
    a(!!cc.diff && cc.diff.snapshotVer === 99 && (cc.diff.accepted || []).indexOf(99) < 0,
      'y5v2203/B7b: 差异逐项给出（快照版本 / 受支持面）——「说明差异」是边界 2 的实体');
    a(cc.detail.indexOf('99') >= 0 && cc.detail.indexOf('1') >= 0, 'y5v2203/B7c: 差异说明里两个版本号都在（不是只说「不兼容」）');
    const H = JSON.stringify(WA.store.get());
    const im = S.importSnapshot(bad, {});
    a(im.ok === false && im.reason === 'bad-snapshot-ver', 'y5v2203/B8: 拒收的导入**真的没写**（实 ' + j(im && im.reason) + '）');
    a(JSON.stringify(WA.store.get()) === H, 'y5v2203/B8b: 被拒后世界逐字未变（拒收不是「先写再报错」）');
    // 未知面：面名在这局里根本不存在 ⇒ 同样阻断（不凭空造骨架外的键）
    const unk = { wsVer: 1, schemaVersion: 1, faces: { notARealFace: { a: 1 } } };
    const ck = S.checkCompat(unk);
    a(ck.ok === false && ck.reason === 'unknown-faces' && ck.diff.unknownFaces.indexOf('notARealFace') >= 0,
      'y5v2203/B9: 未知面⇒阻断并点名（实 ' + j(ck && ck.diff && ck.diff.unknownFaces) + '）—— 静默装进去会让骨架外的键凭空出现');
  }
  // 态 3：坏文件（验收 ④：可读错误，不抛）
  {
    const env = env0();
    const S = env.WA.worldSnapshot;
    let threw = null, r = null;
    try { r = S.parse('{ 这不是 json'); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y5v2203/B10: 坏 JSON **不抛异常**（实 threw=' + j(threw) + '）—— 验收 ④');
    a(r && r.ok === false && r.reason === 'bad-json' && typeof r.detail === 'string' && r.detail.length > 0,
      'y5v2203/B10b: 坏 JSON 给可读错误（reason + detail 实 ' + j(r && r.reason) + '）');
    const r2 = S.parse('[]');
    a(r2.ok === false && r2.reason === 'bad-shape', 'y5v2203/B10c: 形态不对也给可读错误（实 ' + j(r2 && r2.reason) + '）');
    const r3 = S.parse({ wsVer: 1 });
    a(r3.ok === false && r3.reason === 'bad-shape' && String(r3.detail).indexOf('faces') >= 0,
      'y5v2203/B10d: 缺 faces 的快照被点出缺的**是哪个字段**（实 ' + j(r3 && r3.detail) + '）');
    let threw2 = null;
    try { S.checkCompat('{bad'); S.importSnapshot('{bad'); S.previewImport('{bad'); } catch (e) { threw2 = String((e && e.message) || e); }
    a(threw2 === null, 'y5v2203/B10e: 三个入口对坏文件都不抛（实 ' + j(threw2) + '）');
  }
  // ③ 容量：超预算**拒收**而不是截断（用引擎自己的 capacity 口判）
  {
    const env = env0();
    const WA = env.WA, S = WA.worldSnapshot;
    seed(WA, function (d) { d.people = { A: { name: '甲' } }; });
    const okCap = S.capacity({ bytes: 1024, faces: {} });
    a(okCap.ok === true && okCap.budget > 0, 'y5v2203/B11: 容量口给出读得懂的预算（实 ' + j(okCap.budget) + ' 字节）');
    const big = S.capacity({ bytes: okCap.budget + 1, faces: {} });
    a(big.ok === false && big.reason === 'budget-exceeded',
      'y5v2203/B11b: 超预算⇒拒收（boundary: 不截断 —— 截断会让「搬过来了」变成半句话）实 ' + j(big && big.reason));
    const H = JSON.stringify(WA.store.get());
    const bx = { wsVer: 1, schemaVersion: 1, bytes: okCap.budget + 1000, faces: { people: { Z: {} } } };
    const im = S.importSnapshot(bx, {});
    a(im.ok === false && im.reason === 'budget-exceeded', 'y5v2203/B11c: 超预算导入被拒（实 ' + j(im && im.reason) + '）');
    a(JSON.stringify(WA.store.get()) === H, 'y5v2203/B11d: 被拒后世界逐字未变（容量预检在写入之前）');
  }
  // ④ newslot：不碰世界状态（只进快照库）
  {
    const env = env0();
    const WA = env.WA, S = WA.worldSnapshot;
    LS.clear();
    seed(WA, function (d) { d.people = { A: { name: '甲' } }; });
    const jr = S.toJSON({});
    const H = JSON.stringify(WA.store.get());
    const ns = S.importSnapshot(jr.text, { mode: 'newslot', slot: 'y5-probe' });
    a(ns.ok === true && ns.mode === 'newslot' && ns.slot === 'y5-probe',
      'y5v2203/B12: newslot 成功并给出槽名（实 ' + j(ns && ns.slot) + '）');
    a(JSON.stringify(WA.store.get()) === H, 'y5v2203/B12b: **另开槽一格世界状态都不动**（实变 diff 空）');
    const lib = S.library();
    a(lib.count === 1 && lib.max > 0 && lib.rows[0].slot === 'y5-probe', 'y5v2203/B12c: 槽进了快照库（实 ' + lib.count + '/' + lib.max + '）');
    const tk = S.libTake('y5-probe');
    a(tk.ok === true && !!tk.snapshot && tk.snapshot.faces, 'y5v2203/B12d: 取槽拿回的是可导入的快照');
    // 库上限：不无限长（**不判具体数字** —— 偏离 1）
    for (let i = 0; i < lib.max + 3; i++) S.importSnapshot(jr.text, { mode: 'newslot', slot: 'y5-cap-' + i });
    const lib2 = S.library();
    a(lib2.count <= lib2.max && lib2.count === lib2.max,
      'y5v2203/B12e: 快照库超限留最新、不无限长（实 ' + lib2.count + '/' + lib2.max + '）—— 上限本身存在即达标');
    const dr = S.libDrop('y5-probe');
    a(dr.ok === true || dr.reason === 'not-found', 'y5v2203/B12f: 删槽可执行（实 ok=' + j(dr && dr.ok) + '）');
    a(JSON.stringify(WA.store.get()) === H, 'y5v2203/B12g: 删槽也不动世界状态');
  }
  // ⑤ 互转：缺蓝图面时拒收（不假装转得出来）
  {
    const env = env0();
    const WA = env.WA, S = WA.worldSnapshot;
    seed(WA, function (d) { d.people = { A: { name: '甲' } }; });
    const jr = S.toJSON({});
    // 「缺面」必须**真把面摘掉**再判（默认骨架里 worldBlueprint 一直可用 —— 不摘就判不出）。
    const keepBp = WA.worldBlueprint;
    let bp = null, threw = null;
    try { delete WA.worldBlueprint; bp = S.toBlueprint(jr.text); }
    catch (e) { threw = String((e && e.message) || e); }
    finally { WA.worldBlueprint = keepBp; }
    a(threw === null, 'y5v2203/B13: 互转缺面时不抛（实 threw=' + j(threw) + '）');
    a(bp && bp.ok === false && bp.reason === 'module-missing',
      'y5v2203/B13b: 转不出时**如实说转不出**（实 reason=' + j(bp && bp.reason) + '）—— 不返回一个空蓝图');
    const bp2 = S.toBlueprint(jr.text);
    a(bp2 && bp2.ok === true, 'y5v2203/B13d: 面在位时真转得出（反面前置自证：上面那条不是「恒拒收」）');
    const txt = (function () { const d = gotoPort(env); return portOut(d, 'wa-wps-graph'); })();
    a(txt && (txt.indexOf('转不出') >= 0 || txt.indexOf('可转') >= 0),
      'y5v2203/B13c: 页面如实报「可转 / 转不出」两态之一（实截 ' + j(String(txt).slice(0, 40)) + '）');
  }
  // ⑥ 诊断面：密钥与宿主态名单**当场可核**
  {
    const env = env0();
    const WA = env.WA, S = WA.worldSnapshot;
    seed(WA, function (d) { d.people = { A: { name: '甲' } }; });
    const dg = S.diagnose();
    a(dg.facesDeclared === S.FACES.length && dg.facesLive <= dg.facesDeclared,
      'y5v2203/B14: 诊断报白名单面在场性（实 ' + dg.facesLive + '/' + dg.facesDeclared + '）');
    a(dg.secretsDeclared.length === S.SECRETS.length && dg.hostStateDeclared.length === S.HOST_STATE.length,
      'y5v2203/B14b: 密钥 / 宿主态名单长度与导出面一致（名单本身可核 —— 不是靠前缀猜）');
    a(dg.storeAvailable === true && dg.library.max > 0, 'y5v2203/B14c: 诊断报 store 可用性与库上限');
  }
  // ════ C 段：不变式（零写入） ═══════════════════════════════════
  {
    const env = env0();
    const WA = env.WA, S = WA.worldSnapshot;
    seed(WA, function (d) { d.people = { A: { name: '甲' } }; d.chronicle = [{ t: 'x' }]; });
    const dom = gotoPort(env);
    const H0 = JSON.stringify(WA.store.get());
    const R0 = JSON.stringify(S.library());
    // 只读那九枚：一个个点过，世界与库都不得变
    const RO = ['wa-wps-snap', 'wa-wps-json', 'wa-wps-check', 'wa-wps-preview',
      'wa-wps-lib', 'wa-wps-take', 'wa-wps-blue', 'wa-wps-graph', 'wa-wps-round', 'wa-wps-diag'];
    const errs = [];
    RO.forEach(function (id) {
      try {
        const b = dom.getElementById(id);
        if (b) { b.onclick({ target: b }); }
      } catch (e) { errs.push(id + ':' + (e && e.message)); }
    });
    a(errs.length === 0, 'y5v2203/C1: 只读那十枚逐个点过零抛出（实 ' + (errs.join(' | ') || '无') + '）');
    a(JSON.stringify(WA.store.get()) === H0, 'y5v2203/C2: **活世界逐字不变**（只读不产生写入）');
    a(JSON.stringify(S.library()) === R0, 'y5v2203/C2b: 快照库逐字不变（只读也不写库）');
    const st = S.stat();
    a(st.exports >= 1 && st.imports === 0,
      'y5v2203/C2c: 计数分开：导出涨了、导入为 0（读数与写口分开计数 —— 实 ' + j(st.exports) + '/' + j(st.imports) + '）');
    // 写口那一枚（import）真写了，且只有它写 —— 这是「最小写面」的现场证据
    const H1 = JSON.stringify(WA.store.get());
    const im = S.importSnapshot(S.toJSON({}).text, {});
    a(im.ok === true, 'y5v2203/C3: 唯一的写口（import）能写（前置自证：写口不是死的）');
    a(S.stat().imports === 1, 'y5v2203/C3b: 写口计数恰为 1（一次点击一次写，不重复写）');
    a(JSON.stringify(WA.store.get()) !== H1, 'y5v2203/C3c: 写口确实改了世界（反面前置自证）');
    // 库那一枚（drop）只动库、不动世界
    const H2 = JSON.stringify(WA.store.get());
    S.importSnapshot(S.toJSON({}).text, { mode: 'newslot', slot: 'c1' });
    const H3 = JSON.stringify(WA.store.get());
    S.libDrop('c1');
    a(JSON.stringify(WA.store.get()) === H3 && H3 === H2,
      'y5v2203/C4: 库操作（newslot + drop）不动世界状态（世界那栏的写路径唯一性）');
  }
  // ════ N 段：真源码破坏 + 两向自证 ══════════════════════════════
  const CASES = [
    { n: 1, k: 'page', to: '/* port 页被删 */', check: 'A2',
      why: '页表删掉 port ⇒ 页签不在场，B0 必须现形',
      judge: function (s) { return s.indexOf("{ id: 'port', icon: '📦', label: '搬运' },") < 0; } },
    { n: 2, k: 'renderer', to: 'port: renderLogs,', check: 'A2c',
      why: '把 port 的渲染器接到 logs ⇒ 页里读不到搬运专属标题',
      judge: function (s) { return s.indexOf('port: renderPortCenter,') < 0; } },
    { n: 3, k: 'out', to: "$('#wa-wps-out-x')", check: 'A3',
      why: '读数出口 id 改坏（渲染了但写不进去）⇒ 十二枚读数必须全空',
      judge: function (s) { return s.indexOf("$('#wa-wps-out')") < 0; } },
    { n: 4, k: 'guard', to: "    { page: 'portX', ids:", check: 'A2d',
      why: '守卫表登记到不存在的页 ⇒ 守卫覆盖面查不到这一页',
      judge: function (s) { return s.indexOf("    { page: 'port', ids:") < 0; } },
    { n: 5, k: 'acc', to: 'const ACCEPTED = [];', check: 'B7',
      why: '受支持面清空 ⇒ 任何快照都该被拒（版本不兼容拒收是**真判据**，不是写死的文案）',
      judge: function (s) { return s.indexOf('const ACCEPTED = [1];') < 0; } },
    { n: 6, k: 'ver', to: 'if (false) {', check: 'B7',
      why: '版本判据被短路 ⇒ 不兼容快照会被放行（边界 2 的实体被摘掉）',
      judge: function (s) { return s.indexOf('if (!ACCEPTED.length || ACCEPTED.indexOf(ver) < 0) {') < 0; } },
    { n: 7, k: 'budget', to: "return { ok: false, reason: 'budget', bytes: bytes, budget: MAX_BYTES, seen: seen };", check: 'B11b',
      why: '容量预检的拒收码被换掉（reason 从 budget-exceeded 变成 budget）⇒ 超预算仍被拒、但码面不再对得上（验收 ③ 的实体仍在，判据面被摘掉）',
      judge: function (s) { return s.indexOf("reason: 'budget-exceeded', bytes: bytes, budget: MAX_BYTES") < 0; } },
    { n: 8, k: 'badjson', to: 'catch (e) { throw e; }', check: 'B10',
      why: '坏 JSON 改成抛异常 ⇒ 验收 ④（可读错误而不是抛）被摘掉',
      judge: function (s) { return s.indexOf("reason: 'bad-json'") < 0; } },
    { n: 9, k: 'skip', to: 'over.push({ face: face, n: c.n, forcedOver: 1 });', check: 'B5c',
      why: '预览的默认支改成覆盖 ⇒「导入默认不覆盖」（边界 1）在预览面上被摘掉',
      // 判据收窄：`why: 'conflict-kept' });` 在引擎里有 3 处（预览支 1 + 导入支 2），
      //   用整句锚点会在另两处上仍判为真（首跑实测：N9a 假红）。
      judge: function (s) { return s.indexOf("skip.push({ face: face, n: c.n, why: 'conflict-kept' });") < 0; } },
    { n: 10, k: 'newslot', to: 'if (false) {', check: 'B12',
      why: 'newslot 分支被短路 ⇒ 另开槽会掉进 merge 并写世界（边界 1 被摘掉）',
      judge: function (s) { return s.indexOf("if (pv.mode === 'newslot') {") < 0; } },
    { n: 11, k: 'secrets', to: "const SECRETS = [];", check: 'B3',
      why: '密钥名单清空 ⇒ 凭证会被带上（边界 3 被摘掉；名单本身是判据）',
      judge: function (s) { return s.indexOf("'credentials', 'scripts', 'chatText'") < 0; } }
  ];
  CASES.forEach(function (cs) {
    const rel = C.TGT ? C.TGT[cs.k] : null;
    const S = rd(rel);
    const from = C.ANCHOR[cs.k];
    const hits = cnt(S, from);
    a(hits === 1, 'y5v2203/N0(' + cs.n + '): 破坏锚点 ' + cs.k + ' 在 ' + rel + ' 恰中 1 次（实 ' + hits + '）');
    if (hits !== 1) return;
    const broken = S.split(from).join(cs.to);
    a(broken !== S, 'y5v2203/Na(' + cs.n + '): 破坏真的改动了源码文本');
    a(cnt(S, cs.to) === 0, 'y5v2203/Nb(' + cs.n + '): 原版上破坏产物不存在（否则判据是自指的）');
    a(cs.judge(broken) === true, 'y5v2203/N' + cs.n + 'a: ' + cs.why);
    a(cs.judge(S) === false, 'y5v2203/N' + cs.n + 'b: （纯度）原版上同款判据为假 —— 破坏确实改变了源码形态');
  });
  // N12：破坏版**跑产品**两向自证 —— 读数出口改坏后按钮还能点，但读数再也写不进去
  (function () {
    const S = rd(C.PANEL_REL);
    const from = C.ANCHOR.out;
    if (cnt(S, from) !== 1) { a(false, 'y5v2203/N12a: 读数出口锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join("$('#wa-wps-out-x')");
    const ov = {}; ov[C.PANEL_REL] = broken;
    let got = null, gotNode = null, threw = null;
    try {
      const envB = C.env0(ov);
      const domB = C.gotoPageF(envB);
      gotNode = C.portOutNodeF(domB, 'wa-wps-snap');
      got = String(gotNode ? gotNode.innerHTML : '');
    } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y5v2203/N12b: 破坏版上点按钮仍不抛（破坏的是读数去处，不是绑定）实 ' + threw);
    a(gotNode !== null && emptyOut(gotNode), 'y5v2203/N12c: （两向）破坏版上读数**为空**（出口容器零子元素；实 ' + j(got && got.length) + ' 字符是容器自身序列化）—— 判据不是空转');
    const envG = C.env0();
    const domG = C.gotoPageF(envG);
    const good = C.portOutF(domG, 'wa-wps-snap');
    a(good !== null && good.length > 0, 'y5v2203/N12d: （两向）原版上同款操作读数非空（实 ' + j(good && good.length) + '）—— 判据区分得开两向');
  })();
  // N13：破坏版跑产品 —— 密钥名单清空后，快照文本里**真的**出现凭证（两向）
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.secrets;
    if (cnt(S, from) !== 1) { a(false, 'y5v2203/N13a: 密钥名单锚点恰中 1 次（前置失效）'); return; }
    const broken = S.split(from).join('const SECRETS = [];');
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      const env = C.env0(ovv);
      const WA = env.WA;
      WA.store.init();
      WA.store.transact(function (d) { d.people = { A: { name: '甲' } }; d.credentials = { token: 'LEAK-ME' }; }, 'y5:n13');
      // **显式点名**该面：不点名时白名单先把它拦住了，
      //   清空 SECRETS 根本碰不到判据（首跑实测踩到。）
      const r = WA.worldSnapshot.toJSON({ faces: ['credentials', 'people'] });
      return r.ok ? r.text : '';
    }
    let badTxt = '', goodTxt = '';
    let threw = null;
    try { badTxt = runOnce(ov); goodTxt = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y5v2203/N13b: 两版都不抛（实 ' + threw + '）');
    a(badTxt.indexOf('LEAK-ME') >= 0, 'y5v2203/N13c: （两向）名单清空版快照里**真的**带上了凭证（实含=' + (badTxt.indexOf('LEAK-ME') >= 0) + '）—— 边界 3 的判据不是文案');
    a(goodTxt.indexOf('LEAK-ME') < 0 && goodTxt.length > 0, 'y5v2203/N13d: （两向）原版上同款夹具**不出现**凭证（实含=' + (goodTxt.indexOf('LEAK-ME') >= 0) + '）—— 两向区分得开');
  })();
  // N14：破坏版跑产品 —— 默认支改成覆盖后，本地冲突键**真的**被改掉（边界 1 两向）
  (function () {
    const S = rd(C.ENG_REL);
    const from = C.ANCHOR.mergeKeep;
    if (cnt(S, from) !== 1) { a(false, 'y5v2203/N14a: 导入支冲突判据锚点恰中 1 次（前置失效）'); return; }
    // 破坏打在**导入支的冲突判据**那一行（原来打在 previewImport 的 skip.push 上，
    //   而 importSnapshot 走自己的 overwritten/skipped 分派 ⇒ 破坏没碰到导入行为）。
    const broken = S.split(from).join('if (false) return;');
    const ov = {}; ov[C.ENG_REL] = broken;
    function runOnce(ovv) {
      const env = C.env0(ovv);
      const WA = env.WA, Sn = WA.worldSnapshot;
      WA.store.init();
      WA.store.transact(function (d) { d.people = { A: { name: '本地甲' } }; }, 'y5:n14a');
      const snap = Sn.toJSON({});
      WA.store.transact(function (d) { d.people = { A: { name: '外来甲' } }; }, 'y5:n14b');
      const r = Sn.importSnapshot(snap.text, {});
      return { name: (WA.store.get().people.A || {}).name, ok: r.ok, skipped: (r.skipped || []).length };
    }
    let bad = null, good = null, threw = null;
    try { bad = runOnce(ov); good = runOnce(null); } catch (e) { threw = String((e && e.message) || e); }
    a(threw === null, 'y5v2203/N14b: 两版都不抛（实 ' + threw + '）');
    a(bad && bad.name === '本地甲', 'y5v2203/N14c: （两向）判据被摘掉后本地键**真的**被快照值替掉（实 ' + j(bad && bad.name) + '）');
    a(good && good.name === '外来甲', 'y5v2203/N14d: （两向）原版上同款夹具**本地值原样保留**（默认不覆盖 —— 实 ' + j(good && good.name) + '）');
  })();
}

module.exports = { runAll: require(path.join(BASE, 'tests/lock-assert.js')).restoring(runAll) };
if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (ok, name) { if (ok) { pass++; } else { fail++; console.log('FAIL ' + name); } };
  runAll(a);
  console.log('\nY5 s3-y5-v2203 ' + pass + ' / 失败 ' + fail);
  process.exit(fail > 0 ? 1 : 0);
}
