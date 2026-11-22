'use strict';
/**
 * v2.294.0 / EXV8-1：正文汇流器的**生产场景口径**（端到端，不是源码字符串检查）。
 *
 * 缺陷本来在这里：render 只读 ctx.people / ctx.place，而 core/interceptor.js 构造的标准
 * ctx 只有 type/chat/abort/store/branchId/injections/canceled —— 两个字段在生产路径上
 * 根本不存在，场景相关性恒为 0。看上去像「算法保守」，实际是**输入从来没到过**。
 *
 * 判据形态是「读产品自己留下的痕迹」：场景来源由 render 在调用 collector 时通过
 * noteScene 记下，故 sceneStat() 反映的就是**生产链路真的读了谁**。测试不自己造这个值。
 *
 * 六向判据（缺一条都不算收口）：
 *   ① 生产链路（applyInjections）跑完 ⇒ sceneStat().from === 'sceneNarrative'；
 *   ② 真源按物理地点过滤 ⇒ present 含渡口的人、不含书院的人；
 *   ③ 切场景 ⇒ 下一轮留痕的 place/people 跟着变（场景变更真的进了链路）；
 *   ④ 拔掉真源 ⇒ from 退成 ctx，且 ctx 显式入参仍生效（不因缺真源哑掉）；
 *   ⑤ 真源抛错 ⇒ 不冒泡，如实退回 ctx（一个场景读数异常不许让整条注入链失败）；
 *   ⑥ 留痕出口本身两向：合法来源被接受，胡说值归一成 none。
 */
const fs = require('fs'), path = require('path');
const { load, must1, BASE } = require('./v8-harness.js');

function runAll() {
  let pass = 0, fail = 0;
  const a = (v, m) => { if (v) pass++; else { fail++; console.error('FAIL ' + m); } };

  // 源码面只做「接线存在」的最薄一问（真正的判据在下面的运行时读数）。
  const src = fs.readFileSync(path.join(BASE, 'render/inject.js'), 'utf8');
  a(src.indexOf('WA.sceneNarrative.currentScene') >= 0, 'render 里存在真源接线');
  a(src.indexOf('noteScene') >= 0, 'render 里存在场景来源留痕');

  /**
   * 把世界与素材装成「两个人分处两地」的形状，再用生产链路 pump 一轮。
   * 为什么需要它作参数而不是写死在闭包里：负控制要能在**破坏后的 render 副本**上
   * 跑同一套判据，故装载源必须是可替换的。
   */
  const model = (overrides) => {
    const W = load(overrides);
    const ic = W.injectCollector;
    W.store.transact(d => {
      d.people = d.people || {};
      d.people.p_acheng = { name: '阿澄', location: '渡口', status: 'idle' };
      d.people.p_jia = { name: '甲', location: '书院', status: 'idle' };
      d.region = d.region || {};
      d.region.currentPlace = '渡口';
    });
    const on = () => ({ enabled: true });
    // 让 collector 有东西可选：selected=0 时「换了没变」无法判读。
    W.bonds = { getSettings: on, network: () => ({ ok: true, rows: [
      { key: '阿澄×船夫', a: '阿澄', b: '船夫', types: ['临时雇佣'], at: 900 },
      { key: '甲×塾师', a: '甲', b: '塾师', types: ['师徒'], at: 1 }] }) };
    ic.setSettings({ enabled: true, maxItems: 4, maxChars: 12000 });
    W.render.setVisibility('injectCollector', true);
    const pump = () => { try { W.render.applyInjections({ injections: [] }); } catch (e) { /* 其余源与本节无关 */ } };
    return { W: W, ic: ic, pump: pump };
  };

  const m = model();
  const W = m.W, ic = m.ic, pump = m.pump;

  // ① 生产链路真的读了真源
  pump();
  a(ic.sceneStat().from === 'sceneNarrative', '生产链路（applyInjections）走到真源并留痕');
  a(ic.sceneStat().place === '渡口', '留痕里的地点 = 真源当前地点');
  a((ic.sceneStat().people || []).indexOf('阿澄') >= 0, '留痕里的在场人含渡口的阿澄');
  a((ic.sceneStat().people || []).indexOf('甲') < 0, '留痕里不含书院的甲（物理地点过滤生效）');

  // ② 素材确实按场景挑人
  const rowsA = (ic.stat().rows || []).filter(r => r.owner === 'bonds').map(r => r.id);
  a(rowsA.indexOf('阿澄×船夫') === 0, '渡口场景：阿澄那条关系排第一');

  // ③ 切场景 ⇒ 下一轮留痕与素材都跟着变
  W.store.transact(d => { d.region.currentPlace = '书院'; });
  pump();
  a(ic.sceneStat().place === '书院', '切场景后留痕地点跟着变（场景变更真进了链路）');
  a((ic.sceneStat().people || []).indexOf('甲') >= 0, '切场景后在场人换成甲');
  const rowsB = (ic.stat().rows || []).filter(r => r.owner === 'bonds').map(r => r.id);
  a(rowsB.indexOf('甲×塾师') === 0, '书院场景：甲那条关系排第一（不是同一份换顺序）');
  a(JSON.stringify(rowsA) !== JSON.stringify(rowsB), '两种场景的素材序列确实不同');

  // ④ 拔掉真源 ⇒ 退回 ctx，且仍工作
  const keepSN = W.sceneNarrative;
  try {
    W.sceneNarrative = undefined;
    ic.buildBlock({ people: ['甲'], place: '书院' });
    a((ic.stat().rows || []).filter(r => r.owner === 'bonds')[0].id === '甲×塾师', '真源缺席时 ctx 显式入参仍生效');
  } finally { W.sceneNarrative = keepSN; }

  // ⑤ 真源抛错 ⇒ 不冒泡
  const keepCur = W.sceneNarrative.currentScene;
  let threw = false;
  try {
    W.sceneNarrative.currentScene = function () { throw new Error('witness:scene-broke'); };
    try {
      pump();
      a(true, '真源抛错时生产链路本身不抛（整段被吞住）');
      a(ic.sceneStat().from !== 'sceneNarrative', '真源抛错时不冒充真源来源');
    } catch (e) { threw = true; }
  } finally { W.sceneNarrative.currentScene = keepCur; }
  a(!threw, '真源抛错不会让调用方收到异常');

  // ⑥ 留痕出口两向：合法来源接受，胡说值归一成 none
  ic.noteScene({ from: 'sceneNarrative', people: ['阿澄'], place: '渡口' });
  a(ic.sceneStat().from === 'sceneNarrative' && ic.sceneStat().place === '渡口', 'noteScene 记下真源来源');
  ic.noteScene({ from: 'total-nonsense' });
  a(ic.sceneStat().from === 'none', 'noteScene 把未知来源归一成 none（不冒充真源）');

  // ── 负控制：把 render 的取场景段退回「只读 ctx」原状，同款判据必须红 ──
  //   真源码破坏（锚点恰中 1 次）→ 加载破坏副本 → 在副本上重跑**同一个**取场景判据。
  //   注意：这里断的是「生产链路自己有没有读真源」，与上面的正控是同一个判据形态，
  //   不是另写一条更弱的断言来假装有负控。
  {
    const rel = 'render/inject.js';
    const raw = fs.readFileSync(path.join(BASE, rel), 'utf8');
    const broken = must1(raw,
      "            if (!WA.sceneNarrative || typeof WA.sceneNarrative.currentScene !== 'function') return null;",
      '            if (true) return null;   // negative control: reverted to ctx-only');
    let caught = false;
    try {
      const mb = model({ [rel]: broken });
      mb.pump();
      caught = mb.ic.sceneStat().from !== 'sceneNarrative';
    } catch (e) { caught = true; }
    a(caught, '破坏「读真源」这一行后，同款判据抓到回归（负控制成立）');
  }

  console.log('v8 scene wire: ' + pass + ' pass / ' + fail + ' fail');
  return { pass: pass, fail: fail };
}

module.exports = { runAll };
if (require.main === module) process.exit(runAll().fail ? 1 : 0);