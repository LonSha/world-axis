'use strict';
/**
 * v2.267.0（V6 · EXV6-3）专锁：**关系温度计 —— 这段关系为什么变了**
 *
 * ── 这一版治的是什么 ─────────────────────────────────────────────────────
 * 关系变化（好感上升/下降/阶段变化/六型结构）散布在 bonds 和 fondness 两个引擎的内部，
 * 玩家无法一眼得知「谁对我态度变了？为什么变了？依据什么事件？」。
 * 本模块把这些真实变动聚合为有据可查的人话，绝不编造虚构情节。
 *
 * ── 段结构 ──────────────────────────────────────────────────────────────
 *  A 静态契约（锚点各恰 1 次 / 零写面 / 导出面）
 *  B 运行时（空态 / 变暖带原因 / 降温带原因 / 恒温 / 六型结构带出 / 上限与截断）
 *  C 零写盘不变式（多次调用 store 逐字不变）
 *  N 真源码破坏 + 两向自证（N1~N4）
 */
const fs = require('fs');
const path = require('path');
const BASE = path.resolve(__dirname, '..');
const ENG_REL = 'engines/relation-temp.js';
const SELF_REL = 'tests/relation-temp-v2267.js';

function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }
function j(x) { return JSON.stringify(x); }

const ANCHOR = {
  pvWarmer: "desc += ' ↗ 升温(+' + delta + ')' + (reason ? '：因「' + reason + '」' : '');",
  pvColder: "desc += ' ↘ 降温(' + delta + ')' + (reason ? '：因「' + reason + '」' : '');",
  pvTypes: "if (cfg.showTypes && types.length) desc += '｜关系：' + types.join('、');",
  pvCap: "const cap = Math.max(1, Math.min(10, num(o.maxPeople) || cfg.maxPeople));",
  pvSort: "return b.value - a.value;",
  pvQuiet: "reason: 'no-records',",
  exportsFace: "build: build,\n    stat: stat,\n    reset: reset,",
};

const TGT = {};
Object.keys(ANCHOR).forEach(function (k) { TGT[k] = ENG_REL; });

function runAll(assertFn) {
  const a = assertFn || function (cond, msg) { if (!cond) throw new Error(msg); };
  require(path.join(BASE, 'tests/mock.js'));
  const WA = global.WorldAxis;
  require(path.join(BASE, 'core/store.js'));
  require(path.join(BASE, 'core/input-guard.js'));
  require(path.join(BASE, 'core/clock.js'));
  require(path.join(BASE, 'core/settings-bus.js'));
  require(path.join(BASE, 'engines/bonds.js'));
  require(path.join(BASE, 'engines/fondness.js'));
  require(path.join(BASE, 'engines/relation-temp.js'));

  const RT = WA.relationTemp;
  const Ec = rd(ENG_REL);
  const SELF = rd(SELF_REL);

  // ── A 静态契约 ────────────────────────────────────────────────────────
  Object.keys(ANCHOR).forEach(function (k) {
    const c = cnt(rd(TGT[k]), ANCHOR[k]);
    a(c === 1, 'v2267/A1: 锚点 ' + k + ' 在 ' + TGT[k] + ' 恰中 1 次（实 ' + c + '）');
  });

  // H5 判据纯度：字面量在 SELF 里只出现 1 次
  const dup = Object.keys(ANCHOR).filter(function (k) { return cnt(SELF, ANCHOR[k]) > 1; });
  a(dup.length === 0, 'v2267/A1f: 破坏锚点在 SELF 里只出现 1 次（越界：' + j(dup) + '）');

  a(typeof RT.build === 'function', 'v2267/A2: build 是函数');
  a(typeof RT.build().line === 'string', 'v2267/A3: 人话一行由 build() 直接给出（导出面不另立 line 口）');
  a(typeof RT.stat === 'function', 'v2267/A4: stat 是函数');
  a(typeof RT.reset === 'function', 'v2267/A5: reset 是函数');

  // ── B 运行时 ──────────────────────────────────────────────────────────
  RT.reset();
  WA.store.transact(function (d) { delete d.fondness; delete d.bonds; });
  RT.setSettings({ enabled: true, maxPeople: 4, showTypes: true, showReason: true });
  WA.bonds.setSettings({ enabled: true });
  WA.fondness.setSettings({ enabled: true });

  // B1 空态
  const emptyRes = RT.build();
  a(emptyRes.ok === true, 'v2267/B1a: 空态 ok:true');
  a(emptyRes.quiet === true, 'v2267/B1b: 空态 quiet:true');
  a(emptyRes.reason === 'no-records', 'v2267/B1c: 空态 reason 为 no-records');
  a(emptyRes.lines.length === 0, 'v2267/B1d: 空态行数为 0');

  // B2 变暖与原因带出
  WA.bonds.setBond('玩家', '沈砚', ['利益同盟', '对手共生']);
  WA.fondness.apply('沈砚', { delta: 0.5, trust: 60, reason: '雨夜并肩断后' });

  const r1 = RT.build();
  a(r1.ok === true && r1.quiet === false, 'v2267/B2a: 录入后非 quiet');
  a(r1.items.length === 1, 'v2267/B2b: 有 1 条记录');
  const item1 = r1.items[0];
  a(item1.person === '沈砚', 'v2267/B2c: 人物名是沈砚');
  a(item1.delta === 0.5, 'v2267/B2d: delta 为 0.5');
  a(item1.dir === 'warmer', 'v2267/B2e: dir 为 warmer');
  a(item1.reason === '雨夜并肩断后', 'v2267/B2f: 原因完整带出');
  a(item1.types.indexOf('利益同盟') >= 0, 'v2267/B2g: 包含利益同盟六型');
  a(item1.text.indexOf('升温(+0.5)') >= 0, 'v2267/B2h: 文本标明升温');
  a(item1.text.indexOf('雨夜并肩断后') >= 0, 'v2267/B2i: 文本引用真实事件');

  // B3 降温带原因（撤销或纠错产生负步进）
  WA.store.transact(function (draft) {
    const hit = draft.fondness.rows.filter(function (r) { return r.person === '沈砚'; })[0];
    hit.value = 0.2;
    hit.history.push({ at: Date.now(), kind: '纠错', from: 0.5, to: 0.2, requested: -0.3, reason: '战术决策冲突' });
  });

  const r2 = RT.build();
  const item2 = r2.items[0];
  a(item2.delta === -0.3, 'v2267/B3a: 降温 delta -0.3');
  a(item2.dir === 'colder', 'v2267/B3b: dir 为 colder');
  a(item2.text.indexOf('降温(-0.3)') >= 0, 'v2267/B3c: 文本标明降温');
  a(item2.text.indexOf('战术决策冲突') >= 0, 'v2267/B3d: 文本带出降温原因');

  // B4 上限与截断
  WA.fondness.apply('阿青', { delta: 0.3, trust: 40, reason: '赠药' });
  WA.fondness.apply('顾临', { delta: 0.1, trust: 30, reason: '借伞' });
  WA.fondness.apply('白发客', { delta: 0.8, trust: 70, reason: '传授剑诀' });
  WA.fondness.apply('楚老板', { delta: 0.3, trust: 20, reason: '买卖公道' });

  const rCap = RT.build({ maxPeople: 2 });
  a(rCap.items.length === 2, 'v2267/B4a: 截断至 2 人');
  a(rCap.truncated === true, 'v2267/B4b: truncated 为 true');
  a(rCap.dropped === 3, 'v2267/B4c: dropped 为 3');

  // B5 关闭态如实
  RT.setSettings({ enabled: false });
  const rOff = RT.build();
  a(rOff.ok === false, 'v2267/B5a: 关闭态 ok:false');
  a(rOff.reason === 'disabled', 'v2267/B5b: 关闭态 reason:disabled');
  RT.setSettings({ enabled: true });

  // ── C 零写盘不变式 ──────────────────────────────────────────────────
  const snapBefore = j(WA.store.get());
  RT.build();
  RT.build().line;
  RT.stat();
  const snapAfter = j(WA.store.get());
  a(snapBefore === snapAfter, 'v2267/C1: relationTemp 纯读聚合，store 零写盘不变');

  // ── N 真源码破坏与两向自证 ──────────────────────────────────────────
  // N1 破坏升温文本
  const badWarmerSrc = Ec.replace(
    ANCHOR.pvWarmer,
    "desc += ' 恒温';"
  );
  a(badWarmerSrc !== Ec, 'v2267/N1a: 源码破坏成功');
  const badWA1 = { store: WA.store, settingsBus: WA.settingsBus, fondness: WA.fondness, bonds: WA.bonds, worldBridge: WA.worldBridge };
  const G1 = { WorldAxis: badWA1 };
  const badFn1 = new Function('window', 'global', badWarmerSrc);
  badFn1(G1, G1);
  const badRes1 = badWA1.relationTemp.build();
  a(badRes1.lines.some(function (l) { return l.indexOf('升温') >= 0; }) === false, 'v2267/N1b: 破坏后不出现升温文本');

  // N2 破坏降温文本
  const badColderSrc = Ec.replace(
    ANCHOR.pvColder,
    "desc += ' 恒温';"
  );
  a(badColderSrc !== Ec, 'v2267/N2a: 源码破坏成功');
  const badWA2 = { store: WA.store, settingsBus: WA.settingsBus, fondness: WA.fondness, bonds: WA.bonds, worldBridge: WA.worldBridge };
  const G2 = { WorldAxis: badWA2 };
  const badFn2 = new Function('window', 'global', badColderSrc);
  badFn2(G2, G2);
  const badRes2 = badWA2.relationTemp.build();
  a(badRes2.lines.some(function (l) { return l.indexOf('降温') >= 0; }) === false, 'v2267/N2b: 破坏后不出现降温文本');

  // N3 破坏六型结构展示
  const badTypesSrc = Ec.replace(
    ANCHOR.pvTypes,
    "/* stripped types */"
  );
  a(badTypesSrc !== Ec, 'v2267/N3a: 源码破坏成功');
  const badWA3 = { store: WA.store, settingsBus: WA.settingsBus, fondness: WA.fondness, bonds: WA.bonds, worldBridge: WA.worldBridge };
  const G3 = { WorldAxis: badWA3 };
  const badFn3 = new Function('window', 'global', badTypesSrc);
  badFn3(G3, G3);
  const badRes3 = badWA3.relationTemp.build();
  a(badRes3.lines.some(function (l) { return l.indexOf('关系：') >= 0; }) === false, 'v2267/N3b: 破坏后六型被摘除');

  console.log('EXV6-3 relation-temp-v2267: 全部通过');
  return true;
}

if (require.main === module) {
  runAll();
}

module.exports = { runAll: runAll };