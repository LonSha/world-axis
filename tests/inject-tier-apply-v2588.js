#!/usr/bin/env node
// WorldAxis tests/inject-tier-apply-v2588.js (v2.588.0) — L2-apply 专锁：注入分档的落地面
//
// 【它治什么】
//   `engines/inject-tier.js` 此前只会「算」不会「改」：`mode:'apply'` 一律报
//   `apply-not-implemented`。于是分档永远停在读数面，而读数面最容易被当成已经生效 ——
//   这正是本仓反复治的那类病（「能算但没人叫它算」）。
//   本版补上 `tierUp(items)` 这个落地口，并用本锁钉住**六条不许动的性质**：
//
//   ① 默认 `enabled:false` ⇒ **原引用原样返回**（连拷贝都不做，零行为变化可逐字验证）；
//   ② `mode:'shadow'`（默认）即使开着也**不裁** —— 影子就是影子；
//   ③ 只裁 `off` 档：`focus`（本幕相关 / PRIORITY 底座）与 `backdrop` 一律保留；
//   ④ **不改传入数组**（原数组长度与元素引用都不变）；
//   ⑤ 一条没裁时**仍返回原引用**（不让上游误以为「换了一批」）；
//   ⑥ 裁掉的每一条进 `stat().lastDropped`（源名 / 理由 / 静止轮数 / 字数），可核可复算。
//
//   还有一条**可逆性**（D 组）：内容一变，下轮就不再判 off ⇒ 被裁的源自回归队。
//   分档不是删除，是「这一轮不必重复喂」。
//
// 【四段结构】A 静态契约 / B 默认零变化 / C 落地语义 / D 可逆与可核
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
const PR = 'engines/inject-tier.js';
const INJ = 'render/inject.js';
function rd(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }
function cnt(s, n) { return s.split(n).length - 1; }

// 一个**不在 PRIORITY 里**的源名：这样它只能靠「静止轮数」判 off，不会被底座豁免干扰。
const PLAIN = '锁测试源·无优先级';

function W() {
  const WA = (typeof global !== 'undefined' && global.WorldAxis) || (global.window && global.window.WorldAxis);
  if (!WA || !WA.injectTier) throw new Error('需要真产品环境（global.WorldAxis.injectTier）');
  return WA;
}
/** 把轮次设成 want：优先走 evolution.roundOf 的真源，取不到就直接写 evolution.round。 */
function setRound(WA, want) {
  try {
    WA.store.transact(function (d) {
      d.evolution = d.evolution || {};
      d.evolution.round = want;
      return true;
    }, 'tierapply:round');
  } catch (e) { /* 存档不可写时下面的断言会如实红 */ }
}
function itemsOf(n) {
  const out = [];
  for (let i = 0; i < (n || 3); i++) out.push({ source: PLAIN + i, content: '这一源的内容' + i });
  return out;
}

function runAll(a) {
  /* ============ A 静态契约 ============ */
  const S = rd(PR);
  const I = rd(INJ);
  a(S.indexOf('function tierUp(items)') >= 0, 'A1: 落地面是一个独立函数 tierUp(items)');
  a(S.indexOf('    tierUp: tierUp,') >= 0, 'A2: tierUp 在导出面上');
  a(cnt(I, 'WA.injectTier.tierUp(finalItems)') === 1,
    'A3: render/inject.js 里恰一处接线（接两次 = 裁两遍，读数会翻倍）');
  const iBudget = I.indexOf('finalItems = WA.injectBudget.apply(items, planInfo);');
  const iTier = I.indexOf('WA.injectTier.tierUp(finalItems)');
  a(iBudget > 0 && iTier > 0 && iBudget < iTier,
    'A4: 接线在**预算裁决之后**（先按预算删，再按分档删；反过来会打乱预算的字节账）');
  a(S.indexOf('enabled: false') >= 0, 'A5: 出厂 enabled 是 false（默认关，这是本口能上线的唯一前提）');
  a(S.indexOf("mode: 'shadow'") >= 0, 'A6: 出厂 mode 是 shadow（第二道保险：开着也还是影子）');
  a(S.indexOf('if (!cfg.enabled) return list;') >= 0, 'A7: 未启用分支 return list（原引用）');
  a(S.indexOf("if (String(cfg.mode) !== 'apply') return list;") >= 0, 'A8: 非 apply 分支 return list');
  a(S.indexOf('if (!dropped.length) return list;') >= 0, 'A9: 零裁剪分支 return list（不做无意义拷贝）');

  /* ============ B 默认零变化（本口能上线的证明） ============ */
  const WA = W();
  const T = WA.injectTier;
  const keep = T.getSettings();
  try {
    T.__reset();
    T.setSettings({ enabled: false, mode: 'shadow' });
    // B1 出厂默认：原引用
    (function () {
      const it = itemsOf(3);
      const out = T.tierUp(it);
      a(out === it, 'B1a: 默认设置下 tierUp 返回**同一个数组引用**（零拷贝、零变化）');
      a(out.length === 3, 'B1b: 条数不变');
      a(T.stat().tiered === 0, 'B1c: 默认下落地计数为 0');
    })();
    // B2 开着但仍 shadow：原引用
    (function () {
      T.setSettings({ enabled: true, mode: 'shadow' });
      const it = itemsOf(3);
      const out = T.tierUp(it);
      a(out === it, 'B2a: enabled 但 mode=shadow ⇒ 仍是原引用（影子不许偷偷落地）');
      a(T.stat().tiered === 0, 'B2b: 影子档落地计数仍为 0');
    })();
    // B3 observe 在 apply 下仍如实报「只读口做不到落地」（这条旧语义没被本版改掉）
    (function () {
      T.setSettings({ enabled: true, mode: 'apply' });
      const rep = T.observe(itemsOf(2));
      a(rep.ok === false && rep.reason === 'apply-not-implemented',
        'B3a: observe 拿到 apply 仍报 apply-not-implemented（落地不是它的职责，实 '
        + rep.ok + '/' + rep.reason + '）');
      a(rep.shadow === true, 'B3b: observe 的返回值仍标 shadow:true（不许被读成落地读数）');
    })();

    /* ============ C 落地语义 ============ */
    // C1 off 档被裁、backdrop 保留、focus 保留
    (function () {
      T.__reset();
      T.setSettings({ enabled: true, mode: 'apply', offRounds: 2 });
      setRound(WA, 1);
      const it = itemsOf(3);
      const first = T.tierUp(it);
      a(first === it, 'C1a: 首次观测一律视为「刚变」⇒ 一条也不裁（原引用）');
      setRound(WA, 5);            // 静止 4 轮 ≥ 阈值 2
      const second = T.tierUp(it);
      a(Array.isArray(second) && second !== it, 'C1b: 第二轮起 off 档被裁（返回新数组）');
      a(second.length === 0, 'C1c: 三条零交集的静止源全部进 off（实剩 ' + second.length + '）');
      a(it.length === 3, 'C1d: 传入数组**未被修改**（仍 3 条）');
      a(second !== it && it[0] && it[0].source === PLAIN + '0', 'C1e: 原数组元素引用未被替换');
      const st = T.stat();
      a(st.tiered === 1, 'C1f: stat().tiered 计 1 次落地（实 ' + st.tiered + '）');
      a(st.droppedRows === 3, 'C1g: stat().droppedRows 计 3 行（实 ' + st.droppedRows + '）');
      a(st.lastDropped.length === 3 && st.lastDropped[0].source === PLAIN + '0',
        'C1h: lastDropped 逐条可核（首条 ' + (st.lastDropped[0] && st.lastDropped[0].source) + '）');
      a(st.lastDropped[0].chars === '这一源的内容0'.length, 'C1i: 每条带字数（字节账可复算）');
    })();

    // C2 PRIORITY 底座永不裁（rank ≤ 2）
    (function () {
      T.__reset();
      T.setSettings({ enabled: true, mode: 'apply', offRounds: 2 });
      const TB = WA.injectBudgetTables;
      const PRI = TB && TB.PRIORITY ? TB.PRIORITY : null;
      if (!PRI) { a(true, 'C2: 无 PRIORITY 表，跳过（如实跳过，不装作验过）'); return; }
      const key = Object.keys(PRI).filter(function (k) { return PRI[k] && PRI[k].rank <= 2; })[0];
      if (!key) { a(true, 'C2: PRIORITY 里没有 rank≤2 的源，跳过'); return; }
      const it = [{ source: key, content: '这条源是底座，内容不含本幕实体' }];
      setRound(WA, 1); T.tierUp(it);
      setRound(WA, 9);
      const out = T.tierUp(it);
      a(out === it, 'C2: PRIORITY rank≤2 的底座永不判 off（源 ' + key + '，仍是原引用）');
    })();

    // C3 静止未到阈值 ⇒ backdrop 保留
    (function () {
      T.__reset();
      T.setSettings({ enabled: true, mode: 'apply', offRounds: 6 });
      const it = itemsOf(2);
      setRound(WA, 1); T.tierUp(it);
      setRound(WA, 3);            // 只静止 2 轮 < 6
      const out = T.tierUp(it);
      a(out === it, 'C3: 未到 offRounds 阈值 ⇒ 一律 backdrop，原引用返回（不提前裁）');
    })();

    // C4 轮次不可用（round=0）⇒ 不判 off
    (function () {
      T.__reset();
      T.setSettings({ enabled: true, mode: 'apply', offRounds: 2 });
      setRound(WA, 0);
      const it = itemsOf(2);
      T.tierUp(it);
      const out = T.tierUp(it);
      a(out === it, 'C4: round=0 时不做 off 判定（推不出静止轮数就不猜，原引用返回）');
    })();

    /* ============ D 可逆与可核 ============ */
    // D1 内容一变，下轮自回归队
    (function () {
      T.__reset();
      T.setSettings({ enabled: true, mode: 'apply', offRounds: 2 });
      const it = itemsOf(2);
      setRound(WA, 1); T.tierUp(it);
      setRound(WA, 5);
      const cut = T.tierUp(it);
      a(cut.length === 0, 'D1a: 前置——静止源被裁空（实 ' + cut.length + '）');
      // 内容变了
      it[0].content = '内容变了：有人推门进来';
      const back = T.tierUp(it);
      a(back.length === 1 && back[0].source === PLAIN + '0',
        'D1b: 内容一变即回队（分档不是删除，实回 ' + back.length + ' 条）');
    })();

    // D2 关掉开关立刻回到原引用（无残留）
    (function () {
      T.setSettings({ enabled: false, mode: 'apply' });
      const it = itemsOf(2);
      const out = T.tierUp(it);
      a(out === it, 'D2: 关掉 enabled 后即使 mode 还是 apply 也不裁（原引用）');
    })();

    // D3 空输入与非法输入不抛
    (function () {
      T.setSettings({ enabled: true, mode: 'apply' });
      a(T.tierUp([]) .length === 0, 'D3a: 空数组不抛，返回空');
      a(T.tierUp(null).length === 0, 'D3b: null 当成空（不抛）');
      const weird = [null, { source: 'x' }, { content: 'y' }];
      const out = T.tierUp(weird);
      a(Array.isArray(out) && out.length === 3, 'D3c: 缺字段的项不被误裁（读不到内容就不判 off）');
    })();
  } finally {
    try { T.__reset(); } catch (e) { /* 复位失败不许掩盖真判据 */ }
    try { T.setSettings(keep); } catch (e) { /* 设置还原失败同样不许掩盖 */ }
  }

  return { ok: true };
}

module.exports = { runAll: runAll };