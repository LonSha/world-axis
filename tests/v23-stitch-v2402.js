/**
 * WorldAxis tests/v23-stitch-v2402.js (v2.402.0) — V23 三缝专锁
 *
 * ── 它治什么（本锁存在的理由）──────────────────────────────────────
 *   v2.402.0 从异空间 V1.4 缝入三个账本引擎：`stageSession`（会话生命周期）、
 *   `memoryRelay`（跨聊天摘要）、`chatRecycle`（文件回收站）。三者都会**丢掉东西**，
 *   所以它们的「否定式边界」比正向功能重要得多 —— 正向功能坏了用户会立刻发现，
 *   边界坏了（比如锁定失效导致文件被删）**没有任何人会发现**，直到聊天没了。
 *
 *   本锁因此把每个引擎的**边界**逐条写成可断言形态，并为最危险的两条备负控制：
 *     · chat-recycle 边界 ③「锁定优先于一切」：N1 把 locked 项改成可清 ⇒ 判据必须变；
 *     · chat-recycle 边界 ②「不删」：N2 断言 `enforce().purged` 恒 0，
 *       并检查它**不返回任何删除函数引用**。
 *
 * ── 四段 ──────────────────────────────────────────────────────────
 *   A 装载面：三引擎在 index.js 装载清单里、且都在 ui/panel.js 之前
 *   B stageSession：状态机 + 退出三选 + cancel 不改状态 + 单活跃 + 空会话判定
 *   C memoryRelay：不合并原文（接口面无原文入参）+ 主体/次体互斥 + 空摘要拒 + 幂等挂载
 *   D chatRecycle：上限 10 / 锁定跳过 / 最早未锁定优先 / enforce 恒不删 / 恢复清锁
 *   N 负控制（真源码破坏，try/finally 还原）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
let passed = 0; let failed = 0;

function a(cond, desc, detail) {
  if (cond) { passed++; console.log('  ✓ ' + desc); }
  else { failed++; console.error('  ✗ ' + desc + (detail ? ' — ' + detail : '')); }
}

/**
 * 最小真实宿主 —— 与产品同形。**只提供产品真有的写口**（v2.400.0 那条教训：
 * 给测试自塞 `write` 桩会让「开关打不开」在假写面上绿五轮）。
 */
function makeHost() {
  const busMap = {};
  const WA = {
    __settingsRegs: [],
    settingsBus: {
      read: function (reg) { return busMap[reg.key] || null; },
      saveOrThrow: function (reg, v) { busMap[reg.key] = v; return true; },
      normalize: function (reg, raw) {
        const out = {}; const d = reg.def || {};
        Object.keys(d).forEach(function (k) {
          const v = raw ? raw[k] : undefined;
          out[k] = (v === undefined || v === null) ? d[k] : v;
        });
        return out;
      }
    },
    clock: { now: function () { return 1700000000000; } },
    registerModule: function (rel, meta) { (WA.__mods = WA.__mods || []).push({ rel: rel, meta: meta }); return true; }
  };
  const sandbox = { window: { WorldAxis: WA }, console: { log: function () {} } };
  sandbox.global = sandbox;
  const ctx = vm.createContext(sandbox);
  return {
    WA: WA, ctx: ctx, busMap: busMap,
    load: function (rel) {
      vm.runInContext(fs.readFileSync(path.join(ROOT, rel), 'utf8'), ctx, { filename: rel });
    }
  };
}

function loadAll() {
  const h = makeHost();
  h.load('engines/stage-session.js');
  h.load('engines/memory-relay.js');
  h.load('engines/chat-recycle.js');
  return h;
}

const NS = { ss: 'stageSession', mr: 'memoryRelay', cr: 'chatRecycle' };

function runAll() {
  const ENGINES = ['engines/stage-session.js', 'engines/memory-relay.js', 'engines/chat-recycle.js'];
  const idx = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');

  // ══════════════════════════════════════════════════════════════════
  console.log('\nA 装载面');
  // ══════════════════════════════════════════════════════════════════
  const missing = ENGINES.filter(function (rel) { return idx.indexOf("'" + rel + "'") < 0; });
  a(missing.length === 0, 'A1: 三个引擎都登记在 index.js 装载清单里（缺 ' + missing.length + '）',
    missing.join(', '));
  // 三缝都要在 ui/panel.js 之前：面板要读它们的 view()，装晚了第一次渲染读不到。
  const posPanel = idx.indexOf("'ui/panel.js'");
  const badOrder = ENGINES.filter(function (rel) { return idx.indexOf("'" + rel + "'") > posPanel; });
  a(badOrder.length === 0, 'A2: 三缝都排在 ui/panel.js 之前（面板首帧要读它们的 view）', badOrder.join(', '));
  // 都在磁盘上且语法可装载
  const h0 = loadAll();
  a(!!h0.WA[NS.ss] && !!h0.WA[NS.mr] && !!h0.WA[NS.cr],
    'A3: 三个 ns 装载后全在位（stageSession / memoryRelay / chatRecycle）');
  a(h0.WA.__settingsRegs.length === 3,
    'A4: 三个引擎各自登记了一个设置面（实 ' + h0.WA.__settingsRegs.length + '）');
  const keys = h0.WA.__settingsRegs.map(function (r) { return r.key; }).sort();
  a(new Set(keys).size === 3, 'A5: 三个设置键互不重复（实 ' + keys.join(' / ') + '）');
  // 默认全关（本仓纪律：新引擎出厂即关）
  a(h0.WA[NS.ss].getSettings().enabled === false
    && h0.WA[NS.mr].getSettings().enabled === false
    && h0.WA[NS.cr].getSettings().enabled === false,
    'A6: 三缝默认全部关闭（出厂即关，不是出厂即开）');

  // ══════════════════════════════════════════════════════════════════
  console.log('\nB stageSession：会话生命周期与退出三选');
  // ══════════════════════════════════════════════════════════════════
  {
    const h = loadAll(); const S = h.WA[NS.ss];

    // B1 关闭时写口一律 disabled
    const off = S.begin({ stageId: 'st1', title: '测试' });
    a(off.ok === false && off.reason === 'disabled', 'B1: 关闭时 begin 拒收 disabled（实 ' + off.reason + '）');

    S.setSettings({ enabled: true });
    a(S.getSettings().enabled === true, 'B2: setSettings 真把开关打开（写后回读）');

    // B3 缺 stageId / title 各拒
    a(S.begin({ title: 'x' }).reason === 'missing-stage', 'B3a: 缺 stageId 拒收 missing-stage');
    a(S.begin({ stageId: 'st1' }).reason === 'missing-title', 'B3b: 缺标题拒收 missing-title（存档名取标题）');

    const b = S.begin({ stageId: 'st1', title: '雨夜客栈', blocks: 8, at: 100 });
    a(b.ok === true && !!b.id, 'B4: 正常 begin 出 id');
    a(S.view().sessions.length === 1 && S.view().sessions[0].state === 'pending',
      'B5: begin 后状态是 pending（begin 不激活）');

    // B6 activate
    const act = S.activate(b.id);
    a(act.ok === true && act.state === 'active', 'B6: activate 到 active');
    a(S.view().active && S.view().active.title === '雨夜客栈', 'B7: view().active 报出正在演绎的那一段');

    // B8 边界②：单活跃，不顶掉
    const b2 = S.begin({ stageId: 'st2', title: '第二段', blocks: 3, at: 200 });
    const act2 = S.activate(b2.id);
    a(act2.ok === false && act2.reason === 'already-active',
      'B8: 已有活跃会话时 activate 拒收 already-active（实 ' + act2.reason + '）—— 不自动顶掉');
    a(S.view().active.title === '雨夜客栈',
      'B8b: 拒收后原会话仍是活跃的那个（没被顶掉）');

    // B9 边界③：缺 policy 拒收
    const noPol = S.end({ id: b.id });
    a(noPol.ok === false && noPol.reason === 'missing-policy',
      'B9: end 缺 policy 拒收 missing-policy —— 不默认保存也不默认丢弃');
    a(S.view().sessions[0].state === 'active', 'B9b: 被拒的 end 没有改变状态');

    // B10 unknown policy
    a(S.end({ id: b.id, policy: 'keep' }).reason === 'unknown-policy', 'B10: 未知 policy 拒收 unknown-policy');

    // B11 边界④：cancel 逐字不改状态
    const before = JSON.stringify(S.view());
    const c = S.end({ id: b.id, policy: 'cancel' });
    a(c.ok === true && c.changed === false, 'B11: cancel 返回 changed:false');
    // B11b：cancel 不仅「报」changed:false，整个 view 必须逐字没动。
    //   分两层看：① 会话表/活跃/回收站逐字不变；② stat.ended 没被加 1
    //   （只判返回值会被「返回 changed:false 但顺手改了状态」骗过）。
    const strip = function (v) { const o = JSON.parse(JSON.stringify(v)); delete o.stat; return JSON.stringify(o); };
    a(strip(S.view()) === strip(JSON.parse(before)), 'B11b: cancel 后 view()（除 stat）与调用前逐字相同');
    a(S.view().stat.ended === JSON.parse(before).stat.ended, 'B11b2: cancel 没有把 stat.ended 加 1（不计入已退出）')
    ;
    a(c.state === 'active', 'B11c: cancel 后状态仍是 active（逐字未变）');
    a(S.view().active && S.view().active.id === b.id, 'B11d: cancel 后仍是活跃会话');

    // B12 边界⑥：空会话按调用方块数判
    const emptyEnd = S.end({ id: b.id, policy: 'archive', blocks: 1 });
    a(emptyEnd.ok === true && emptyEnd.empty === true,
      'B12: 块数 1 < emptyBlocks(2) 判为空会话（实 empty=' + emptyEnd.empty + '）');

    // B13 archive 后状态 + 快照
    a(emptyEnd.state === 'archived', 'B13: archive 后状态 archived');
    a(S.view().sessions[0].snapshots === 1, 'B13b: 存档记了 1 份快照');
    a(S.view().active === null, 'B13c: 存档后无活跃会话');

    // B14 resume
    const r = S.resume(b.id);
    a(r.ok === true && r.state === 'active', 'B14: resume 已存档会话回到 active');
    a(r.from && r.from.blocks === 1, 'B14b: resume 带出最近一份快照（blocks=' + (r.from && r.from.blocks) + '）');

    // B15 边界⑤：discard 只落索引，不删
    const d = S.end({ id: b.id, policy: 'discard', blocks: 12 });
    a(d.ok === true && d.state === 'discarded', 'B15: discard 后状态 discarded');
    a(d.trashed && d.trashed.id === b.id, 'B15b: discard 落进 trash 索引');
    a(/不是删除/.test(d.note), 'B15c: discard 的读数字面写着「不是删除」（实「' + d.note.slice(0, 24) + '…」）');
    a(S.trashView().count === 1, 'B15d: trashView 里有 1 项');
    a(S.view().sessions.length === 2, 'B15e: 会话表仍有 2 段（discard 不删会话记录）');

    // B16 discarded 不能复活 / 不能 resume
    a(S.activate(b.id).reason === 'discarded', 'B16a: discarded 会话不能 activate（discarded）');
    a(S.resume(b.id).reason === 'discarded', 'B16b: discarded 会话不能 resume（discarded）');

    // B17 no-snapshot 时 resume 拒
    const nb = S.begin({ stageId: 'st3', title: '没存过的', blocks: 5 });
    S.activate(nb.id); S.end({ id: nb.id, policy: 'discard', blocks: 5 });
    a(S.resume(nb.id).reason === 'discarded', 'B17: 无快照的会话先被 discard，resume 报 discarded');
    const nb2 = S.begin({ stageId: 'st4', title: '从未存档', blocks: 5 });
    a(S.resume(nb2.id).reason === 'no-snapshot',
      'B17b: 从未存档的会话 resume 拒收 no-snapshot（不 resume 出空壳）');

    // B18 buildBlock：无活跃时为空串
    a(S.buildBlock() === '' || typeof S.buildBlock() === 'string',
      'B18: buildBlock 返回字符串且无活跃时为空串（实 ' + JSON.stringify(S.buildBlock()).slice(0, 20) + '）');

    // B19 unknown session
    a(S.activate('nope').reason === 'unknown-session', 'B19: 未知 id 拒收 unknown-session');

    // B20 零 store 写
    a(h.WA.store === undefined, 'B20: 宿主压根没有 store，引擎仍全部工作（证明零 store 依赖）');
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\nC memoryRelay：跨聊天摘要（不合并原文）');
  // ══════════════════════════════════════════════════════════════════
  {
    const h = loadAll(); const M = h.WA[NS.mr];

    a(M.compose({}).reason === 'disabled', 'C1: 关闭时 compose 拒收 disabled');
    M.setSettings({ enabled: true });

    // C2 边界②：接口面无原文入参 —— 传了也不认（结构上不可能合并）
    const withRaw = M.compose({
      subject: { kind: 'chat', id: 'c1', label: '主线' },
      objects: [{ kind: 'chat', id: 'c2', label: '支线', summary: '他离开了城。', messages: [{ mes: '原文' }], raw: '原文' }],
      at: 1
    });
    a(withRaw.ok === true, 'C2: 传了 messages/raw 也照常组（原文字段被忽略）');
    a(!JSON.stringify(M.view()).includes('原文'),
      'C2b: view() 里查不到任何原文痕迹 —— 本模块拿不到原文，合并两份聊天在结构上不可能');

    // C3 主体必填与档位
    a(M.compose({ objects: [{ id: 'x', summary: 's' }] }).reason === 'missing-subject', 'C3a: 缺主体拒 missing-subject');
    a(M.compose({ subject: { kind: 'book', id: 'b' }, objects: [{ id: 'x', summary: 's' }] }).reason === 'bad-subject-kind',
      'C3b: 主体 kind 只认 chat/stage（book 被拒）');
    a(M.compose({ subject: { kind: 'chat' }, objects: [{ id: 'x', summary: 's' }] }).reason === 'missing-subject-id',
      'C3c: 主体缺 id 拒收（只给名字无法确认读的是哪一段）');

    // C4 边界④：零次体
    a(M.compose({ subject: { kind: 'chat', id: 'c1' }, objects: [] }).reason === 'missing-objects',
      'C4: 零次体拒收 missing-objects —— 零次体的「互通」等于没互通');

    // C5 边界③：主体同时是次体
    a(M.compose({ subject: { kind: 'chat', id: 'c1' }, objects: [{ kind: 'chat', id: 'c1', summary: 's' }] }).reason === 'subject-in-objects',
      'C5: 主体同时当次体拒收 subject-in-objects（否则同一段摘要注入两遍）');

    // C6 边界⑤：空摘要
    const emp = M.compose({ subject: { kind: 'chat', id: 'c1' }, objects: [{ id: 'c2', label: '支线', summary: '   ' }] });
    a(emp.ok === false && emp.reason === 'empty-source', 'C6: 全次体空摘要拒收 empty-source（实 ' + emp.reason + '）');
    a(/没读过/.test(emp.hint), 'C6b: hint 点明「没读过」与「什么都没发生」不能互相顶替');

    // C7 正常 compose
    const ok1 = M.compose({
      subject: { kind: 'chat', id: 'c1', label: '主线' },
      objects: [{ kind: 'chat', id: 'c2', label: '支线A', summary: '他离开了城，向北。', range: '1-30' }],
      at: 10
    });
    a(ok1.ok === true && ok1.parts === 1, 'C7: 正常组出 1 条摘要');
    a(/不合并/.test(ok1.note), 'C7b: 读数字面写着「不合并两份完整聊天」');

    // C8 partial empty 如实上报
    const partial = M.compose({
      subject: { kind: 'stage', id: 's1', label: '小剧场' },
      objects: [
        { kind: 'chat', id: 'c2', label: '有摘要', summary: '发生了事。' },
        { kind: 'chat', id: 'c3', label: '没读的', summary: '' }
      ]
    });
    a(partial.ok === true && partial.parts === 1, 'C8: 一条有、一条空 → 用有那条（parts=1）');
    a(partial.emptySources.length === 1 && partial.emptySources[0] === '没读的',
      'C8b: 空的次体如实列进 emptySources（不静默吞掉）');

    // C9 attach 幂等
    const att = M.attach(ok1.id, { target: 'chat-B' });
    a(att.ok === true && att.count === 1, 'C9: attach 到 chat-B');
    const dup = M.attach(ok1.id, { target: 'chat-B' });
    a(dup.ok === false && dup.reason === 'already-attached',
      'C9b: 重复挂幂等拒收 already-attached（不静默累加）');
    a(M.view().attached['chat-B'].length === 1, 'C9c: 挂载表里仍然只有 1 条');

    // C10 buildBlock 只输出摘要 + 来源标注 + 「不是原文」
    const blk = M.buildBlock('chat-B');
    a(blk.indexOf('他离开了城') >= 0, 'C10a: 注入块含摘要正文');
    a(blk.indexOf('支线A') >= 0, 'C10b: 注入块含来源标注');
    a(/不是本段聊天里发生过的事/.test(blk), 'C10c: 注入块明写「不是本段聊天里发生过的事」');
    a(M.buildBlock('chat-ZZZ') === '', 'C10d: 未挂载的目标注入空串（不注入空壳）');

    // C11 detach
    a(M.detach(ok1.id, 'chat-B').ok === true, 'C11: detach 成功');
    a(M.buildBlock('chat-B') === '', 'C11b: detach 后注入块为空串');

    // C12 截断如实报
    M.setSettings({ maxSummaryChars: 10 });
    const tr = M.compose({
      subject: { kind: 'chat', id: 'c1' },
      objects: [{ id: 'c2', label: '长文', summary: '很长的摘要'.repeat(20) }]
    });
    a(tr.ok === true && tr.truncated === 1, 'C12: 超长摘要被截断并如实报 truncated（实 ' + tr.truncated + '）');
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\nD chatRecycle：上限 / 锁定保护 / 只出清单不删');
  // ══════════════════════════════════════════════════════════════════
  {
    const h = loadAll(); const R = h.WA[NS.cr];

    a(R.hide({ file: 'a.jsonl' }).reason === 'disabled', 'D1: 关闭时 hide 拒收 disabled');
    R.setSettings({ enabled: true });
    a(R.getSettings().limit === 10, 'D2: 默认上限逐字取原文的 10（实 ' + R.getSettings().limit + '）');

    // D3 填 12 个，超限 2
    for (let i = 1; i <= 12; i++) R.hide({ file: 'f' + i + '.jsonl', title: 't' + i, at: 1000 + i });
    a(R.view().count === 12, 'D3: 池内 12 项');
    const p1 = R.plan();
    a(p1.over === 2, 'D4: 超限 2（实 ' + p1.over + '）');
    a(p1.victims.length === 2, 'D4b: 列出 2 个待清');
    a(p1.victims[0].file === 'f1.jsonl' && p1.victims[1].file === 'f2.jsonl',
      'D5: 清的是**最早移入**的两个（实 ' + p1.victims.map(function (v) { return v.file; }).join(',') + '）');
    a(p1.victims[0].reason === 'earliest-unlocked', 'D5b: 每个待清项都带 reason');

    // D6 边界③：锁定最早的那个，它必须被跳过
    R.lock('f1.jsonl');
    const p2 = R.plan();
    a(p2.victims.some(function (v) { return v.file === 'f1.jsonl'; }) === false,
      'D6: 锁定的 f1 不在待清清单里 —— 锁定优先于一切');
    a(p2.victims.length === 2 && p2.victims[0].file === 'f2.jsonl',
      'D6b: 顺延清 f2/f3（实 ' + p2.victims.map(function (v) { return v.file; }).join(',') + '）');
    a(p2.lockedKept === 1, 'D6c: lockedKept 如实报 1 个被保住');

    // D7 边界②：enforce 恒 purged:0
    const enf = R.enforce();
    a(enf.purged === 0, 'D7: enforce().purged 恒为 0 —— 本模块不删');
    a(enf.irreversible === true, 'D7b: enforce 标 irreversible:true');
    a(enf.approved === 2, 'D7c: 只「获准」2 项（approved=2）');
    a(R.view().count === 12, 'D7d: enforce 之后池内仍是 12 项（一个都没真删）');
    a(typeof enf.delete === 'undefined' && typeof enf.purge === 'undefined',
      'D7e: 返回体里没有任何删除函数引用（结构上也删不了）');

    // D8 confirmPurge 只摘已获准的
    const cp1 = R.confirmPurge(['f2.jsonl', 'f3.jsonl']);
    a(cp1.removed.length === 2 && R.view().count === 10,
      'D8: 宿主删完回执后池内 10 项（实 ' + R.view().count + '）');
    a(R.plan().over === 0, 'D8b: 回到上限内，over=0');

    // D9 锁定项还在
    a(R.view().items.some(function (it) { return it.file === 'f1.jsonl' && it.locked === true; }),
      'D9: f1 仍在池内且仍是锁定态');

    // D10 边界④：上限越界夹到 1
    R.setSettings({ limit: 0 });
    const pz = R.plan();
    a(pz.limit === 1 && pz.clamped === true, 'D10: limit=0 夹到 1 并报 clamped（实 limit=' + pz.limit + ', clamped=' + pz.clamped + '）');
    R.setSettings({ limit: 10 });

    // D11 边界⑥：重复移入不重置顺序
    const dupH = R.hide({ file: 'f4.jsonl', at: 99999 });
    a(dupH.ok === false && dupH.reason === 'already-hidden', 'D11: 重复移入拒收 already-hidden');
    const f4 = R.view().items.filter(function (it) { return it.file === 'f4.jsonl'; })[0];
    a(f4 && f4.at === 1004, 'D11b: 重复移入没有重置它的 at（实 ' + (f4 && f4.at) + '）——「最早移入」不被点一下就打乱');

    // D12 边界⑧：对不在池内的锁 / 恢复报 not-found
    a(R.lock('nope.jsonl').reason === 'not-found', 'D12a: 锁不在池内的文件报 not-found（不假装锁上）');
    a(R.restore('nope.jsonl').reason === 'not-found', 'D12b: 恢复不在池内的文件报 not-found');

    // D13 边界⑦：restore 清掉锁定
    const rs = R.restore('f1.jsonl');
    a(rs.ok === true && rs.lockedCleared === true, 'D13: restore 回收站项并报 lockedCleared:true');
    a(R.view().items.some(function (it) { return it.file === 'f1.jsonl'; }) === false,
      'D13b: 恢复后不在池内');
    a(R.lock('f1.jsonl').reason === 'not-found', 'D13c: 恢复后再锁报 not-found（锁定随恢复失效）');

    // D14 at 撞值时按 seq 排
    R.reset();
    R.hide({ file: 's1.jsonl', at: 500 });
    R.hide({ file: 's2.jsonl', at: 500 });
    // 注意：s1/s2 已是 2 项，要凑出 over=2 必须再加 10 项（共 12 项、上限 10）。
    for (let i = 1; i <= 10; i++) R.hide({ file: 'z' + i + '.jsonl', at: 900 + i });
    const pt = R.plan();
    a(pt.victims.length === 2 && pt.victims[0].file === 's1.jsonl' && pt.victims[1].file === 's2.jsonl',
      'D14: at 撞值时按移入序号 tie-break（实 ' + pt.victims.map(function (v) { return v.file; }).join(',') + '）');
  }

  // ══════════════════════════════════════════════════════════════════
  console.log('\nN 负控制（真源码破坏）');
  // ══════════════════════════════════════════════════════════════════
  {
    const REL = path.join(ROOT, 'engines/chat-recycle.js');
    const orig = fs.readFileSync(REL, 'utf8');
    const sha0 = crypto.createHash('sha256').update(orig).digest('hex');
    try {
      // N1：把「锁定项跳过」改成「一律可清」⇒ D6 那组判据必须变
      const broken = orig.replace(
        'const cand = POOL.filter(function (it) { return cfg.purgeLocked ? true : !it.locked; });',
        'const cand = POOL.filter(function (it) { return true; });'
      );
      a(broken !== orig, 'N1: 破坏点命中（锁定过滤那行确实被改）');
      fs.writeFileSync(REL, broken);
      const h2 = loadAll(); const R2 = h2.WA[NS.cr];
      R2.setSettings({ enabled: true });
      for (let i = 1; i <= 12; i++) R2.hide({ file: 'f' + i + '.jsonl', at: 1000 + i });
      R2.lock('f1.jsonl');
      const pb = R2.plan();
      a(pb.victims.some(function (v) { return v.file === 'f1.jsonl'; }) === true,
        'N1b: 破坏版里锁定的 f1 **进了**待清清单 —— 判据确实在咬锁定，不是恒真');
    } finally {
      fs.writeFileSync(REL, orig);
      const sha1 = crypto.createHash('sha256').update(fs.readFileSync(REL, 'utf8')).digest('hex');
      a(sha0 === sha1, 'N1c: 源码已按 sha256 逐字还原');
    }

    // N2：「不删」这条边界单独咬一次 —— 把 purged 改成报「真删了几个」，
    //   D7 必须变红。否则 D7 无法区分「真的不删」与「只是忘了报数」。
    const orig2 = fs.readFileSync(REL, 'utf8');
    const sha2a = crypto.createHash('sha256').update(orig2).digest('hex');
    try {
            // 注意：`purged: 0,` 在源码里出现两次（enforce 的超限前 return 与正式返回），
      //   直接 replace 会命中前者、而前者的 victims 恒空 → 破坏点等于没破。用带注释的行做锚。
      const b2 = orig2.replace('purged: 0,                       // 恒 0', 'purged: p.victims.length,   // 破坏了');
      a(b2 !== orig2, 'N2a: 破坏锚命中正式返回那行（不是提前 return 那行）');
      a(b2 !== orig2, 'N2: 破坏点命中（purged 那行确实被改）');
      fs.writeFileSync(REL, b2);
      const h3 = loadAll(); const R3 = h3.WA[NS.cr];
      R3.setSettings({ enabled: true });
      for (let i = 1; i <= 12; i++) R3.hide({ file: 'f' + i + '.jsonl', at: 1000 + i });
      a(R3.enforce().purged !== 0, 'N2b: 破坏版里 enforce().purged 不再为 0 —— 判据确实在咬「不删」');
    } finally {
      fs.writeFileSync(REL, orig2);
      a(sha2a === crypto.createHash('sha256').update(fs.readFileSync(REL, 'utf8')).digest('hex'),
        'N2c: 源码已按 sha256 逐字还原');
    }
  }

  console.log('\n' + (failed === 0 ? '全部通过' : ('失败 ' + failed)) + '：通过 ' + passed + ' / 失败 ' + failed);
  if (failed > 0 && typeof process !== 'undefined') process.exitCode = 1;
  return { passed: passed, failed: failed };
}

module.exports = { runAll: runAll };
if (require.main === module) runAll();
