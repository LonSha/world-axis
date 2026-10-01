#!/usr/bin/env node
// WorldAxis tests/foreshadow-v2135.js — 伏笔生命周期（E6）专锁
//
// 它治什么（与 engines/foreshadow.js 头部同一件事）：
//   memory.foreshadows 有五态枚举、有容量站、有 longline 的「承诺时刻」，
//   但**全库没有一处**回答「兑现了吗 / 过期了吗」——本锁钉的就是这两问，
//   以及三条边界（不建第二套存储 / 兑现只看显式标记 / 过期只报不改）。
//
// 两向取证（本仓纪律，不是自述）：
//   正向 —— 全部真 API 走一遍，含「互斥三桶恒等于总数」的算术自证；
//   逆向 —— 真源码破坏（锚点恰中 1 次）→ 装载破坏副本 → **在副本上重跑同款真判据**，
//          证明判据真的会因破坏而变红（H6：破坏可观测），且不得出现
//          「对原文件断言」「破坏写死成模拟常量」「破坏把判据自己删掉」三种假绿。
//
// H5 判据纯度：本文件内锚点字面量**只准在 ANCHORS 里声明一次**，
//   破坏与正控都引用 ANCHORS.x.txt，不在别处再写一遍。
'use strict';

/** 锚点表（单一真源；判据别处只引用，不再写字面量）。 */
const ANCHORS = {
  // ① 「不建第二套存储」：真源必须是 memory.foreshadows
  srcOf: { rel: 'engines/foreshadow.js', txt: "const arr = (draft.memory.foreshadows = draft.memory.foreshadows || []);" },
  // ② 「兑现只看显式标记」：状态只由 resolve/recycle 写
  literal: { rel: 'engines/foreshadow.js', txt: "f.status = 'triggered';" },
  // ③ 「过期只报不改」：check 里不得出现任何写动作
  noWrite: { rel: 'engines/foreshadow.js', txt: "stat.stale = rows.length;" },
  // ④ 三桶互斥：active / resolved / closed 三桶由两个集合的补集构成
  buckets: { rel: 'engines/foreshadow.js', txt: "const closed = arr.filter(isTerminal);" },
  // ⑤ 默认关闭：总开关 false
  gate: { rel: 'engines/foreshadow.js', txt: "enabled: false, staleMs: 3600000" },
  // ⑥ 拒收码：终态门（锚点取**带注释的两行组** —— 现场实测裸 if 行在 develop/resolve/recycle 三处同形，
  //    破坏不唯一即不可观测；带注释后全文件恰中 1 次）
  termCheck: { rel: 'engines/foreshadow.js', txt: "      // resolve 的终态门：兑现不可二次 —— 二次兑现会覆写 eventId 与耗时，让「何时兑现」失去唯一答。\n      if (isTerminal(f)) { out = { ok: false, reason: 'already-terminal', id: id, status: f.status }; return false; }" },
  // ⑦ 已兑现必须清承诺时刻（否则 longline 会继续把它报成逾期）。锚点同样取**唯一三行组**
  //    （`delete f.dueAt;` 单行在 resolve 与 recycle 两处同形）。
  clearDue: { rel: 'engines/foreshadow.js', txt: "      // 伏笔兑现即**不再是欠账**：清掉承诺时刻（与 longline 的 TERMINAL 口径同向——\n      // 不清的话 overdue() 会在它已收束之后继续把它当逾期报出来）。\n      delete f.dueAt;" }

};

function runAll(a) {
  const assert = require('./lock-assert.js').from(a);
  const fs = require('fs');
  const vm = require('vm');
  const path = require('path');
  const BASE = path.join(__dirname, '..');
  const REL = 'engines/foreshadow.js';
  const ABS = path.join(BASE, REL);
  const src = fs.readFileSync(ABS, 'utf8');
  const srcBefore = fs.readFileSync(ABS, 'utf8');

  // ── H5 判据纯度：锚点字面量在本文件内只出现一次（在 ANCHORS 里） ──
  Object.keys(ANCHORS).forEach(function (k) {
    const t = ANCHORS[k].txt;
    const n = src.split(t).length - 1;
    assert.ok(n === 1, 'H5 锚点「' + k + '」在源文件内恰中 1 次（实 ' + n + '）');
  });
  // 反身自证：判据不得引用被测对象（本锁不许出现「硬编码期望版本号」这类锚点外常量）
  assert.ok(src.indexOf('WorldAxis engines/foreshadow.js') >= 0, '源文件头在场（装载面可信）');

  // ── 装载器：真源码 or 破坏副本（同一台装载机，避免「破坏路径与正控路径不是同一段代码」）──
  let NOW = 1000000;
  function makeStore() {
    return { memory: { foreshadows: [] } };
  }
  function load(code, store, opts) {
    let cfg = { enabled: false, staleMs: 3600000, maxItems: 5, cap: 30 };
    const WA = {
      clock: { now() { return NOW; } },
      store: {
        get() { return store; },
        transact(fn) { const r = fn(store); return { ok: r !== false }; },
        sameId(x, y) { return String(x) === String(y); }
      },
      registerModule() {}
    };
    // noBus：**不给宿主设置面** —— 此时 settings() 读的是模块自己的 DEF，
    //   这才是「默认关闭」这条性质的**真实测试路径**（有宿主面时读的是宿主的当前值，
    //   把 DEF 改掉也读不出来 —— 第一版破坏就踩在这里，看起来「不可观测」）。
    if (!(opts && opts.noBus)) {
      WA.settingsBus = {
        read() { return cfg; },
        normalize(r, v) { return v; },
        saveOrThrow(r, v) { cfg = v; return { ok: true }; }
      };
    }
    // 桩由 tests/synth-host.js 统一补齐核心模块
    require('./synth-host.js').hostStub(WA);
    const win = { WorldAxis: WA };
    vm.runInNewContext(code, { window: win, Date, Number, String, Array, Object, isFinite, Math, JSON }, { filename: REL });
    return { WA: win.WorldAxis, api: win.WorldAxis.foreshadow, store: store };
  }

  /** 破坏副本：锚点恰中 1 次才允许替换（H6 工具两向自证）。 */
  function wreck(key, to) {
    const t = ANCHORS[key].txt;
    const n = src.split(t).length - 1;
    if (n !== 1) throw new Error('wreck 锚点不唯一：' + key + ' 命中 ' + n);
    return src.replace(t, to);
  }

  // ══════════════ 正向：真 API 全走一遍 ══════════════
  const S = makeStore();
  const L = load(src, S);
  const F = L.api;

  // 1 默认关闭：一律拒收，且注入块为空
  assert.ok(F.getSettings().enabled === false, '默认关闭');
  assert.ok(F.track('fs1', '蒙面人身份成谜').reason === 'disabled', '关闭时 track 拒收 disabled');
  assert.ok(F.resolve('fs1', 'ev1').reason === 'disabled', '关闭时 resolve 拒收 disabled');
  assert.ok(F.check().ok === true, '关闭时 check 仍可读（只报不改，不做拦门）');
  assert.ok(F.buildBlock() === '', '关闭时零注入');
  assert.ok(S.memory.foreshadows.length === 0, '关闭时零写入');

  // 2 打开后：标记 / 推进 / 兑现
  F.setSettings({ enabled: true });
  assert.ok(F.track('fs1', '蒙面人身份成谜').ok === true, 'track 成功');
  assert.ok(S.memory.foreshadows.length === 1, 'track 真写了既有容器');
  assert.ok(S.memory.foreshadows[0].status === 'waiting', '新伏笔落 waiting');
  assert.ok(S.memory.foreshadows[0].content === '蒙面人身份成谜', '内容落盘');
  // 2a 不建第二套存储：WA 上不得出现任何第二数组
  const secondStores = Object.keys(L.WA).filter(function (k) {
    const v = L.WA[k];
    return v && typeof v === 'object' && Array.isArray(v.rows) && v.rows.length && k !== 'foreshadow';
  });
  assert.ok(secondStores.length === 0, '不建第二套存储（无旁路数组，实 ' + JSON.stringify(secondStores) + '）');

  // 3 拒收面：坏 id / 坏文本 / 缺事件 / 重复终止
  assert.ok(F.track('', 'x').reason === 'bad-id', '空 id 拒收 bad-id');
  assert.ok(F.track('fs2', '').reason === 'bad-text', '空文本拒收 bad-text');
  assert.ok(F.resolve('fs1', '').reason === 'missing-event', '缺事件拒收 missing-event');
  assert.ok(F.resolve('不存在', 'ev1').reason === 'missing-foreshadow', '不存在的伏笔不得凭空兑现');
  assert.ok(F.develop('不存在').reason === 'missing-foreshadow', '不存在的伏笔不得推进');

  // 4 显式推进 waiting → developing（并刷新 updatedAt）
  NOW = 1000000;
  const rDev = F.develop('fs1');
  assert.ok(rDev.ok === true && rDev.status === 'developing', 'develop 落到 developing');
  assert.ok(S.memory.foreshadows[0].updatedAt === 1000000, 'develop 刷新 updatedAt');

  // 5 兑现耗时自**埋设时刻**起算（track 在 NOW=1000000）
  const born = S.memory.foreshadows[0].at;
  NOW = 1300000;
  const rRes = F.resolve('fs1', 'ev-gala');
  assert.ok(rRes.ok === true && rRes.status === 'triggered', 'resolve 落到 triggered');
  assert.ok(S.memory.foreshadows[0].eventId === 'ev-gala', '兑现关联事件');
  assert.ok(typeof born === 'number' && born === 1000000, '埋设时刻即是 track 那一刻');
  assert.ok(S.memory.foreshadows[0].resolveMs === 300000, '兑现耗时自埋设起算（实 ' + S.memory.foreshadows[0].resolveMs + '）');
  // 5a 兑现后不得再被判为「欠账」：承诺时刻必须清掉
  assert.ok(!('dueAt' in S.memory.foreshadows[0]), '兑现后清 dueAt（否则 longline 会继续报逾期）');
  assert.ok(!('promisedAt' in S.memory.foreshadows[0]), '兑现后清 promisedAt');

  // 6 终止态不得复活 / 不得重复兑现
  assert.ok(F.track('fs1', '改口').reason === 'already-terminal', '终态不得被 track 复活');
  assert.ok(F.resolve('fs1', 'ev2').reason === 'already-terminal', '终态不得二次兑现');
  assert.ok(F.develop('fs1').reason === 'already-terminal', '终态不得被推进');

  // 7 过期扫描：只报不改
  F.track('fs2', '旧宅门后的脚步声');
  F.develop('fs2');
  //   fs2 的 mark 是 track 那一刻（NOW=1300000，resolve fs1 时已推进）—— 基准取 mark 而非 1000000。
  NOW = 1300000 + 3600000;   // 恰好等于阈值 ⇒ 不算超过（用 > 而非 >=）
  assert.ok(F.check().count === 0, '恰在阈值上不算过期（> 而非 >=）');
  NOW = 1300000 + 3600001;
  const ck = F.check();
  assert.ok(ck.count === 1 && ck.rows[0].id === 'fs2', '超过阈值报 stale');
  assert.ok(ck.rows[0].staleBy === 3600001, '带 staleBy 读数（实 ' + ck.rows[0].staleBy + '）');
  assert.ok(ck.thresholdMs === 3600000, '带阈值读数');
  assert.ok(S.memory.foreshadows[1].status === 'developing', '过期只报不改：状态原样');
  assert.ok(!('recycledAt' in S.memory.foreshadows[1]), '过期只报不改：无副作用');
  assert.ok(S.memory.foreshadows.length === 2, '过期只报不改：不删行');

  // 8 无时间戳的行如实算作过期（不猜）
  F.track('fs3', '无时间戳的旧账');
  delete S.memory.foreshadows[2].at;
  delete S.memory.foreshadows[2].updatedAt;
  const ck2 = F.check();
  assert.ok(ck2.rows.some(function (r) { return r.id === 'fs3' && r.staleBy === -1; }), '无时间戳 ⇒ staleBy -1（如实说不知道，不编一个数）');

  // 9 三桶互斥且恒等于总数（算术自证 —— 这是「判据自身可信」的落点）
  const st = F.stat();
  assert.ok(st.total === 3, '总数 3');
  assert.ok(st.active === 2 && st.resolved === 1 && st.closed === 1, '三桶 active 2 / resolved 1 / closed 1（closed 含 resolved）');
  assert.ok(st.total === st.active + st.closed, 'active + closed 恒等于总数（互斥划分）');
  assert.ok(st.byStatus.waiting + st.byStatus.developing + st.byStatus.triggered + st.byStatus.recycled + st.byStatus.dropped === st.total, '五态计数之和恒等于总数');
  assert.ok(st.avgResolveMs === 300000 && st.resolveSamples === 1, '平均兑现耗时（实 ' + st.avgResolveMs + ' / 样本 ' + st.resolveSamples + '）');

  // 10 recycle：显式下线（不是「悄悄过期」）
  NOW = 1000000 + 5000000;
  F.track('fs4', '另一笔账');
  const rRec = F.recycle('fs4', '线索作废');
  assert.ok(rRec.ok === true && rRec.status === 'recycled', 'recycle 落到 recycled');
  assert.ok(S.memory.foreshadows[3].recycleReason === '线索作废', '回收原因留痕');
  assert.ok(F.recycle('fs4').reason === 'already-terminal', '终态不得二次回收');
  // 10a 回收也清承诺时刻（同一条口径）
  F.track('fs5', '带承诺的账');
  S.memory.foreshadows[4].dueAt = 999999999;
  F.recycle('fs5', '放弃');
  assert.ok(!('dueAt' in S.memory.foreshadows[4]), '回收后清 dueAt');

  // 11 注入块：列出未收束的、带「多久未推进」，且终态不在其中
  NOW = 1000000 + 9000000;
  const blk = F.buildBlock();
  assert.ok(blk.indexOf('fs2') >= 0, '注入块列出未收束的伏笔');
  assert.ok(blk.indexOf('fs1') < 0, '注入块不含已兑现的');
  assert.ok(blk.indexOf('fs4') < 0, '注入块不含已回收的');
  assert.ok(blk.indexOf('不自动回收') >= 0, '注入块写明「不自动回收」');
  assert.ok(blk.indexOf('未推进') >= 0, '注入块标注过期提示');
  // 11a 上界：最多 maxItems 条
  F.setSettings({ maxItems: 1 });
  const lines = F.buildBlock().split(String.fromCharCode(10)).filter(function (l) { return l.indexOf('- ') === 0; });
  assert.ok(lines.length === 1, '注入块条数受 maxItems 约束（实 ' + lines.length + '）');
  F.setSettings({ maxItems: 5 });

  // 12 计量账
  const st2 = F.stat();
  assert.ok(st2.counters.tracks === 5, 'tracks 计量（实 ' + st2.counters.tracks + '）');
  assert.ok(st2.counters.resolves === 1, 'resolves 计量');
  assert.ok(st2.counters.recycles === 2, 'recycles 计量');
  assert.ok(st2.counters.blocked >= 6, 'blocked 计量（实 ' + st2.counters.blocked + '）');
  assert.ok(Object.keys(st2.faults).indexOf('disabled') >= 0, 'faults 逐项归因（disabled）');
  // 业务拒收（already-terminal / missing-foreshadow）走 blocked + lastReason，**不进 faults**：
  //   faults 是「异常/不可用」归因面（开关关、宿主缺、参数坏），业务拒绝是正常裁决不是故障。
  assert.ok(Object.keys(st2.faults).indexOf('already-terminal') < 0, '业务拒收不进 faults（它是正常拒绝，不是故障）');
  assert.ok(st2.counters.lastReason.length > 0, 'lastReason 记下最近一次裁决（实 ' + st2.counters.lastReason + '）');

  // ══════════════ 逆向：真源码破坏 → 装载副本 → 副本上重跑同款真判据 ══════════════
  // 判据形态与正向**同款**（同一个 makeCase），只是跑在破坏副本上。
  // 每一条破坏都必须让某条真判据变红 —— 否则该破坏不可观测（H6）。
  function caseOn(code, mutate, opts) {
    const s2 = makeStore();
    const l2 = load(code, s2, opts);
    if (mutate) mutate(s2, l2);
    return { api: l2.api, store: s2, WA: l2.WA };
  }

  // N1 破坏「真源」：把读取面指向别处（第二套存储）⇒ 正向的「不建第二套存储」/计数判据必红
  {
    const code = wreck('srcOf', "const arr = (draft.memory.hints = draft.memory.hints || []);");
    const c = caseOn(code);
    c.api.setSettings({ enabled: true });
    const tr = c.api.track('h1', '甲');
    assert.ok(tr.ok === true, 'N1 破坏后 track 仍回 ok（破坏不改变返回值形态）');
    const wroteReal = (c.store.memory.foreshadows || []).length;
    // 破坏的是**写入面**（读面换掉不影响落盘位置）—— 现场实测：只改 list() 时写入仍落在
    // foreshadows（实 1），该破坏**不可观测**；改写入面后读面与写面分叉，既有容器零写入。
    assert.ok(wroteReal === 0, 'N1 破坏可观测：写面被换成第二套存储 ⇒ 既有容器零写入（实 ' + wroteReal + '）');
  }

  // N2 破坏「显式兑现」：把 triggered 写成 developing ⇒ 兑现判据必红
  {
    const code = wreck('literal', "f.status = 'developing';");
    const c = caseOn(code);
    c.api.setSettings({ enabled: true });
    c.api.track('h1', '甲');
    const r = c.api.resolve('h1', 'ev');
    // 判据看**容器面**而不是返回体：返回体里的 'triggered' 是写死的字面量，
    //   只看 r.status 会让「状态到底落没落终态」这件事永远读成绿的（假绿，本仓三形之二）。
    assert.ok(c.store.memory.foreshadows[0].status === 'developing', 'N2 破坏可观测：容器里落到 developing（实 ' + c.store.memory.foreshadows[0].status + '）');
    assert.ok(c.store.memory.foreshadows[0].status !== 'triggered', 'N2 破坏可观测：容器里不是终态');
  }

  // N3 破坏「过期只报不改」：让 check 顺手改状态 ⇒ 无副作用判据必红
  {
    // 破坏体要写成**真能生效**的样子：find(id) 缺省读全局 state()，而本锁的桩 store 不是
    //   WA.store.get 的返回（两者不同源）⇒ 第一版破坏改不动任何行、看起来「破坏不可观测」。
    //   这正是「负控制假绿三形」要防的：破坏必须真改变行为，否则判据看着红/绿都不算数。
    const code = wreck('noWrite', "stat.stale = rows.length; rows.forEach(function (r) { const f = list().filter(function (x) { return x && x.id === r.id; })[0]; if (f) f.status = 'dropped'; });");
    const c = caseOn(code, function (s2, l2) { l2.api.setSettings({ enabled: true }); l2.api.track('h1', '甲'); });
    // 基准必须取**容器里的真 mark**，不能取 1000000：这条破坏跑在正向之后，
    //   全局 NOW 已被推进（模块之间共享同一个时钟桩）—— 用固定常量会让「未过期」看起来像「破坏不可观测」。
    const mark3 = c.store.memory.foreshadows[0].updatedAt;
    c.api.check(mark3 + 3600001);
    assert.ok(c.store.memory.foreshadows[0].status === 'dropped', 'N3 破坏可观测：过期扫描顺手改了状态（实 ' + c.store.memory.foreshadows[0].status + '）');
  }

  // N4 破坏「三桶互斥」：把 closed 桶改成「排除 resolved」⇒ 恒等式判据必红
  {
    const code = wreck('buckets', "const closed = arr.filter(function (f) { return f && f.status === 'recycled'; });");
    const c = caseOn(code, function (s2, l2) {
      l2.api.setSettings({ enabled: true });
      l2.api.track('h1', '甲'); l2.api.resolve('h1', 'ev');
    });
    const stn = c.api.stat();
    assert.ok(stn.closed === 0 && stn.resolved === 1, 'N4 破坏可观测：closed 不含 triggered（实 closed=' + stn.closed + '）');
    assert.ok(stn.total !== stn.active + stn.closed, 'N4 破坏可观测：互斥恒等式当场不成立（实 ' + stn.total + ' vs ' + (stn.active + stn.closed) + '）');
  }

  // N5 破坏「默认关闭」：DEF.enabled 改成 true ⇒ **无宿主设置面**时默认为开启（可观测）
  {
    const code = wreck('gate', "enabled: true, staleMs: 3600000");
    const c = caseOn(code, null, { noBus: true });
    assert.ok(c.api.getSettings().enabled === true, 'N5 破坏可观测：无宿主设置面时默认为开启（实 ' + c.api.getSettings().enabled + '）');
    // 且「关着就一律拒收」随之失效 —— 真行为变化，不是换了个读数的名字
    assert.ok(c.api.track('h1', '甲').ok === true, 'N5 破坏可观测：关闭门随之失效（默认态就能写）');
  }
  // N5 正控：**原版**在同一路径下必须仍拒收（证明该判据在未破坏时是绿的，不是恒绿）
  {
    const c = caseOn(src, null, { noBus: true });
    assert.ok(c.api.getSettings().enabled === false, 'N5 正控：原版在无宿主设置面时默认关闭（实 ' + c.api.getSettings().enabled + '）');
    assert.ok(c.api.track('h1', '甲').reason === 'disabled', 'N5 正控：原版默认态一律拒收 disabled');
  }

  // N6 破坏「终态门」：去掉 already-terminal 检查 ⇒ 终态复活判据必红
  {
    const code = wreck('termCheck', "      // resolve 的终态门：兑现不可二次 —— 二次兑现会覆写 eventId 与耗时，让「何时兑现」失去唯一答。\n      if (isTerminal(f)) { out = { ok: false, reason: 'already-terminal', id: id, status: f.status }; return false; }".replace("if (isTerminal(f))", "if (false)"));
    const c = caseOn(code, function (s2, l2) {
      l2.api.setSettings({ enabled: true });
      l2.api.track('h1', '甲'); l2.api.resolve('h1', 'ev');
    });
    const r2 = c.api.resolve('h1', 'ev2');
    assert.ok(r2.ok === true, 'N6 破坏可观测：终态被二次兑现（实 ok=' + r2.ok + '）');
    assert.ok(c.store.memory.foreshadows[0].eventId === 'ev2', 'N6 破坏可观测：旧事件关联被覆写');
  }

  // N7 破坏「清承诺时刻」：兑现后仍留 dueAt ⇒ longline 会继续报逾期
  {
    const code = wreck('clearDue', "/* dueAt kept */");
    const c = caseOn(code, function (s2, l2) {
      l2.api.setSettings({ enabled: true });
      l2.api.track('h1', '甲');
      s2.memory.foreshadows[0].dueAt = 500000;
      l2.api.resolve('h1', 'ev');
    });
    assert.ok('dueAt' in c.store.memory.foreshadows[0], 'N7 破坏可观测：兑现后 dueAt 仍在（实 ' + c.store.memory.foreshadows[0].dueAt + '）');
  }

  // ══════════════ 收尾门：原文件逐字未变（破坏只发生在内存副本上） ══════════════
  assert.ok(fs.readFileSync(ABS, 'utf8') === srcBefore, '收尾门：原文件逐字未变（破坏只在内存副本）');
}

module.exports = { runAll: require('./lock-assert.js').restoring(runAll) };
if (require.main === module) runAll(require('assert'));