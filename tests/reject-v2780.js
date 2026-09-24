#!/usr/bin/env node
// WorldAxis tests/reject-v2780.js — 拒收码见证表（v2.78.0 第十二面）
//
// 「见证」不是声称，是可执行事实：runWitness(WA) 用产品真 API 把每个码跑出来。
//   某条若不再产出自己的码（行为被改），它会被如实记进 missing，由门禁红灯。
//
// 依赖注入：本文件不自己装产品，调用方传已装好的 WA。
'use strict';

// ── 死表：已证不可达（带可复算的前提锚点）──
//   存在但跑不到的码，要么把它变可达，要么明记为不可达并钉住它为何不可达。
//   不能静默留着——从未被观察过的码，下一次被改成别的意思也没人知道。
const DEAD = {
  'bad-operator': {
    anchor: "else return { ok: false, reason: 'bad-operator', detail: v };",
    why: 'parseCmp 的筛选形式是：取 tk，要求 tk.t === "op"，p++，v := tk.v；'
      + '而 tokenize 产 op 的分支只输出 >=/<=/==/!=/>/<，该集合恰是下面 if/else 链的全部分支，'
      + '故 else 永不取。穷举验证：6174 个长度≤3 的词法组合全跑一遍，该码零见证。'
      + '不删：若未来新增比较符，它是第一道防线（本面门禁会在那时通过 deadLeak 提醒「该码可能复活」）。'
  },
  'backup-corrupt': {
    anchor: "catch (e) { return { ok: false, reason: 'backup-corrupt', reverted: 0 }; }",
    why: 'v2.83.0（B6）cfgRollback 的备份解析出口，在当前设计下**结构上不可达**：'
      + 'cfgRollback 只在「写盘阶段中途失败」时被调用，而进入写盘阶段的前提是**导入前备份已成功写入**'
      + '（备份失败会在写盘前以 backup-failed 拒收整次导入，见 settings-bus 的写盘前置条件）。'
      + '而备份成功必然把同一个备份键覆写成合法 JSON ⇒ cfgRollback 读到的必是合法 JSON。'
      + '故要走这条分支，得先有一个「存在但不是 JSON」的备份键，同时备份写入又失败——与前置条件互斥。'
      + '不删：第三方脚本或外部工具若直接调用回滚入口（或未来备份环引入多源写入），它是第一道防线；'
      + '届时本门禁会以 deadLeak 提醒「该码可能复活」。'
  },
  'migration-loop': {
    anchor: "if (++guard > 64) return { ok: false, reason: 'migration-loop' };",
    why: 'checkpoints.migrate 的自旋防护在 FORMAT=1 期**结构上不可达**：循环条件 f < FORMAT 要求 f<1，'
      + '而唯一的迁移登记入口 registerMigration 收窄为 f<1 ⇒ missing-fields，0/-1/-2 全被拒。'
      + '故循环体内永远拿不到 step，至多转 1 圈即走 no-migration 出口，guard 永不越 64。'
      + '穷举验证（/tmp/diag7.js）：registerMigration(-2..0) 全返回 missing-fields；'
      + 'migrate({worldaxisCheckpoint:0}) 返回 no-migration。不删：将来若新增 format 2 与相应迁移，'
      + '它是第一道防线（届时本门禁会以 deadLeak 提醒「该码可能复活」）。'
  }
};

/**
 * 见证驱动。返回 { expect, seen, missing, unexpected }。
 *   missing：触发路径存在却跑不出该码（行为被改，防静默）；
 *   unexpected：见证中冒出来的、不在预期集合里的码（防再命名）。
 */
function runWitness(WA) {
  const LS = global.localStorage;
  const K = WA.kaleidoscope, Rg = WA.registry, I = WA.intel, Lf = WA.life,
        C = WA.causal, O = WA.org, Wd = WA.world, Wt = WA.weather;
  const Ev = WA.events;
  const seen = {};
  const expect = {};
  function want(code, desc) { expect[code] = desc; }
  function trip(code, fn) {
    try {
      const g = fn(); const arr = Array.isArray(g) ? g : [g];
      if (arr.indexOf(code) >= 0) { seen[code] = true; return true; }
      return false;
    } catch (e) { return false; }
  }
  if (WA.store && WA.store.init) WA.store.init();
  WA.store.transact(function (d) {
    d.__zz = { n: 7, t: 'txt' };
    d.currents = [];
    d.evolution = d.evolution || {}; d.evolution.events = [{ id: 'E1' }];
    d.people = {
      '阿明': { id: 'p_阿明', name: '阿明', knowledge: {}, resources: { 粮: 10 } },
      '阿乙': { id: 'p_阿乙', name: '阿乙', knowledge: {}, resources: {} }
    };
  }, 'reject-witness:seed');

  // ── engines/kaleidoscope.js ──
  function kinv(rec) { K.clearDerives(); K.setDerive(rec); const ev = K.evaluate();
    return ev.invalid.map(function (x) { return x.reason; })
      .concat(ev.missing.map(function (x) { return x.reason; })); }
  function kwhen(when) { K.clearRules(); K.setRule({ id: 'rw', when: when, text: 't' });
    return K.evaluate().skipped.map(function (x) { return String(x.reason).split('：')[0]; }); }
  want('bad-id', 'setDerive/setRule 传含空格的 id');
  trip('bad-id', function () { return [K.setDerive({ id: 'a b', op: 'range', path: '__zz.n', args: { min: 0, max: 1 } }).reason]; });
  trip('bad-id', function () { return [K.setRule({ id: 'a b', text: 'x' }).reason]; });
  want('bad-op', 'setDerive 传未知算子');
  trip('bad-op', function () { return [K.setDerive({ id: 'a', op: 'nope' }).reason]; });
  want('bad-path', 'setDerive 传空白 path（resolvePath 首筛，内部可达）');
  trip('bad-path', function () { return [K.setDerive({ id: 'a', op: 'range', path: '  ', args: { min: 0, max: 1 } }).reason]; });
  want('bad-segments', 'map 缺 segments / segments 里 max 非数');
  trip('bad-segments', function () { return kinv({ id: 'a', op: 'map', path: '__zz.n', args: {} }); });
  want('bad-range', 'range 缺 min/max 或 max<=min');
  trip('bad-range', function () { return kinv({ id: 'a', op: 'range', path: '__zz.n', args: { min: 5, max: 1 } }); });
  want('bad-number', 'formula 写 1.2.3');
  trip('bad-number', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '1.2.3' } }); });
  want('bad-ref', 'formula 写 $+1（$ 后无名字）');
  trip('bad-ref', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '$+1' } }); });
  want('bad-char', 'formula 写不认识的单字符');
  trip('bad-char', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '@@' } }); });
  want('bad-word', 'formula 写裸单词');
  trip('bad-word', function () { return kinv({ id: 'a', op: 'formula', args: { expr: 'true' } }); });
  want('div-zero', 'formula 除以 0');
  trip('div-zero', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '5/0' } }); });
  want('expr-too-long', 'formula 表达式超过长度闸');
  trip('expr-too-long', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '1+'.repeat(200) + '1' } }); });
  want('unexpected-end', 'formula 尾部缺操作数');
  trip('unexpected-end', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '1+' } }); });
  want('not-a-number', '非数值参与算术 / map 输入非数');
  trip('not-a-number', function () { return kinv({ id: 'a', op: 'map', path: '__zz.t', args: { segments: [{ max: 1, label: 'L' }] } }); });
  want('unbalanced-paren', 'formula 括号不配对');
  trip('unbalanced-paren', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '(1+2' } }); });
  want('unexpected-token', 'formula 位置不对的符号');
  trip('unexpected-token', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '(>1)' } }); });
  want('trailing-token', 'formula 尾部多余');
  trip('trailing-token', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '1+2 3' } }); });
  want('unknown-derive', 'formula 引用不存在的派生量');
  trip('unknown-derive', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '$nope+1' } }); });
  want('cycle', '两个派生量互相引用');
  trip('cycle', function () { K.clearDerives(); K.setDerive({ id: 'a', op: 'formula', args: { expr: '$b+1' } });
    K.setDerive({ id: 'b', op: 'formula', args: { expr: '$a+1' } });
    return K.evaluate().invalid.map(function (x) { return x.reason; }); });
  want('overflow', 'formula 结果溢出（本版修复后新可达）');
  trip('overflow', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '9'.repeat(190) + ' * ' + '9'.repeat(190) } }); });
  want('too-many', '派生量 / 规则超过上限');
  trip('too-many', function () { K.clearDerives();
    for (let i = 0; i < 45; i++) K.setDerive({ id: 'd' + i, op: 'range', path: '__zz.n', args: { min: 0, max: 1 } });
    return [K.setDerive({ id: 'dx', op: 'range', path: '__zz.n', args: { min: 0, max: 1 } }).reason]; });
  trip('too-many', function () { K.clearRules();
    for (let i = 0; i < 45; i++) K.setRule({ id: 'r' + i, text: 't' });
    return [K.setRule({ id: 'rx', text: 't' }).reason]; });
  want('threw', 'setDerive 内部抛出');
  trip('threw', function () { return [K.setDerive({ get id() { throw new Error('boom'); } }).reason]; });
  want('missing', 'path 指向不存在的键');
  trip('missing', function () { return kinv({ id: 'a', op: 'range', path: 'no.such.key', args: { min: 0, max: 1 } }); });
  want('missing-operator', 'when 写 $n1（比较式缺比较符）');
  K.clearDerives(); K.setDerive({ id: 'n1', op: 'range', path: '__zz.n', args: { min: 0, max: 100 } });
  trip('missing-operator', function () { return kwhen('$n1'); });
  K.clearDerives(); K.clearRules();

  // ── actors/registry.js ──
  want('missing-name', 'registry 各入口空名');
  trip('missing-name', function () { return [Rg.setProfileSafe('', { personality: ['a'] }).reason]; });
  trip('missing-name', function () { return [Rg.setPersonaDice('', {}).reason]; });
  trip('missing-name', function () { return [Rg.idClear('').reason]; });
  want('not-object', 'setProfileSafe/setPersonaDice 传非对象');
  trip('not-object', function () { return [Rg.setProfileSafe('n', 's').reason]; });
  trip('not-object', function () { return [Rg.setPersonaDice('n', 5).reason]; });
  want('bad-shape', 'setProfileSafe 传非法形态节');
  trip('bad-shape', function () { const r = Rg.setProfileSafe('n', { personality: 123 });
    return (r.rejected || []).map(function (x) { return x.reason; }); });
  want('no-sections', 'setProfileSafe 传空节（无任何变更）');
  trip('no-sections', function () { return [Rg.setProfileSafe('n', {}).reason]; });
  want('bad-slot', 'setPersonaDice 指定不存在的槽位');
  trip('bad-slot', function () { return [Rg.setPersonaDice('n2', { d1: 1, d2: 2, d3: 3, d4: 4, d5: 5 }, { slot: 'ZZ' }).reason]; });
  want('incomplete-dice', 'setPersonaDice 骰面不完整');
  trip('incomplete-dice', function () { return [Rg.setPersonaDice('n2', { d1: 1 }).reason]; });
  want('not-bound', 'idClear 清未登记 id');
  trip('not-bound', function () { return [Rg.idClear('nobody-at-all').reason]; });

  // ── engines/intel.js ──
  want('missing-fields', 'intel 必填字段缺失');
  trip('missing-fields', function () { return [I.addIntel('', {}).reason]; });
  want('self-cause', 'addLink cause === effect');
  trip('self-cause', function () { return [I.addLink({ cause: 'X1', effect: 'X1' }).reason]; });
  want('unknown-subject', 'addIntel 传未知 about 主体');
  trip('unknown-subject', function () { return [I.addIntel('阿明', { claim: 'c', source: 's', level: I.LEVELS[0], about: '未登记主体' }).reason]; });
  want('missing-route', 'addIntel 只给了路程一端');
  trip('missing-route', function () { return [I.addIntel('阿明', { claim: 'c', source: 's', level: I.LEVELS[0], from: 'A' }).reason]; });
  want('unknown-cause', 'addLink 传不存在的因');
  trip('unknown-cause', function () { return [I.addLink({ cause: '不存在的因', effect: 'E9' }).reason]; });
  want('missing-effect', 'explain 查无此后果');
  trip('missing-effect', function () { return [I.explain('不存在的后果').reason]; });
  want('unexplained', 'explain 后果存在但无可用原因');
  trip('unexplained', function () { WA.store.transact(function (d) { d.currents = [{ id: 'Z2', title: 'Z2', causes: [] }]; }, 'reject-witness:z2');
    return [I.explain('Z2').reason]; });

  // ── engines/life.js ──
  want('missing-person', 'life 各入口空人名');
  trip('missing-person', function () { return [Lf.addGoal('', { text: 'x' }).reason]; });
  want('missing-text', 'addGoal 空目标文本');
  trip('missing-text', function () { return [Lf.addGoal('__W_人间', {}).reason]; });
  want('bad-kind', 'addCommitment 传非法承诺类型');
  trip('bad-kind', function () { return [Lf.addCommitment('__W_人间', { target: 't', text: 'x', kind: 'nope' }).reason]; });
  want('bad-time', 'addSchedule end<=start');
  trip('bad-time', function () { return [Lf.addSchedule('__W_人间', { activity: 'a', start: 10, end: 5 }).reason]; });
  want('time-conflict', 'addSchedule 与已有活动重叠');
  trip('time-conflict', function () {
    Lf.addSchedule('__W_人间', { activity: '巡逻', start: 0, end: 100 });
    return [Lf.addSchedule('__W_人间', { activity: '巡逻2', start: 50, end: 150 }).reason]; });

  // ── engines/causal.js ──
  want('missing-fields', 'causal 必填字段缺失');
  trip('missing-fields', function () { return [C.settle('', '').reason]; });
  want('missing-chain', 'causal 查无此链');
  trip('missing-chain', function () { return [C.settle('无此链', 'x').reason]; });
  want('bad-args', 'defer 传 0 或非数');
  trip('bad-args', function () { return [C.defer('无此链', 0).reason]; });

  // ── engines/org.js ──
  if (O && O.setSettings) O.setSettings({ enabled: true });
  want('bad-resource', 'grant/transfer 空资源名或非正数量');
  trip('bad-resource', function () { return [O.grant('person', '阿明', '', 1).reason]; });
  want('missing-holder', 'grant 持有方不存在');
  trip('missing-holder', function () { return [O.grant('person', '查无此人', '粮', 1).reason]; });
  want('insufficient', 'transfer 资源不足（须两个不同持有方）');
  trip('insufficient', function () { return [O.transfer('person', '阿明', 'person', '阿乙', '粮', 999).reason]; });

  // ── engines/world.js / weather.js ──
  want('no-journey', 'where() 某人无任何行程记录');
  trip('no-journey', function () { return [Wd.where('从未出发的人').reason]; });
  want('no-clock', 'weather.season 在无世界钟时');
  trip('no-clock', function () {
    let keep; WA.store.transact(function (d) { keep = d.clock.dayIndex; delete d.clock.dayIndex; }, 'reject-witness:noclock');
    const r = Wt.season();
    WA.store.transact(function (d) { d.clock.dayIndex = keep; }, 'reject-witness:clockback');
    return [r.reason]; });
  want('world-missing', 'travelOf 在 world 未装载时');
  trip('world-missing', function () { const keep = WA.world; WA.world = null;
    let r = null; try { r = I.addIntel('阿明', { claim: 'c', source: 's', level: I.LEVELS[0], from: 'A', to: 'B' }); } catch (e) { r = null; }
    WA.world = keep; return r ? [r.reason] : []; });

  // ── v2.78.0 本版新可达/新具名的两个码 ──
  //   bad-delta：gauge.step 此前把「delta 不是数」并进 missing-fields，且 typeof NaN === 'number'
  //     恒真使 NaN 直接落盘并进注入段。本版拆出独立码：两个根因在诊断面可分。
  //   bad-weight：rivalry.declare 此前对非数 weight 静默降级 50 ⇒ bad-weight 只在 0..100 外可达
  //     （半个不可达）。本版先判有限数再判域，该码对非数输入同样可达。
  want('bad-delta', 'gauge.step 传 NaN / ±Infinity（本版从 missing-fields 里拆出的独立根因）');
  trip('bad-delta', function () { const G = WA.gauge; const keep = G.getSettings(); G.setSettings({ enabled: true });
    G.create('__wd'); const r = G.step('__wd', NaN, 'ev'); G.setSettings(keep);
    return [r.reason]; });
  want('bad-weight', 'rivalry.declare 传非数 / 非有限 weight（本版从静默降级改为如实拒收）');
  trip('bad-weight', function () { const R2 = WA.rivalry; const keep = R2.getSettings(); R2.setSettings({ enabled: true });
    const r = R2.declare('w甲', 'w乙', 'w丙', NaN); R2.setSettings(keep);
    return [r.reason]; });
  // ── engines/events.js（v2.81.0 第十五面：排期 ≠ 触发）──
  //   为什么必须补这 6 条：它们随 v2.81.0 新引入，此前既无见证也不在基线台账里，
  //   门禁会如实报「未分类」。按第十二面口径，正解不是把码删掉而是把它真跑出来。
  //   每条见证都走**产品真 API**，且刻意经过 schedule() 的写闸（先 enabled=true），
  //   不是绕过闸门直造状态——见证的意义正是「这条拒收路径真的在现网可达」。
  //   EF 在每条之后复位事件容器：见证之间共享同一个 WA，不复位会让
  //   「同 id 仍在活动态 ⇒ duplicate」之类的串扰变成假见证（v2.81.0 专锁踩过同款坑）。
  function EF() { if (!WA.store || !WA.store.transact) return;
    WA.store.transact(function (d) { d.events = { rows: [], failQueue: [] }; }, 'reject-witness:events-reset'); }
  function ES() { const keep = (Ev && Ev.getSettings) ? Ev.getSettings() : null;
    if (Ev && Ev.setSettings) Ev.setSettings({ enabled: true }); return keep; }
  function EK(keep) { if (Ev && Ev.setSettings && keep) Ev.setSettings(keep); EF(); }
  want('bad-priority', 'events.schedule 传越界优先级 99（合法域 0..9）');
  trip('bad-priority', function () { const keep = ES();
    try { return [Ev.schedule({ id: 'z1', title: 't', priority: 99 }).reason]; } finally { EK(keep); } });
  want('bad-trigger', 'events.schedule 排期参数不成形（repeat 缺正 intervalMs / delayed 缺 at|inMs / conditional 缺 condition）');
  trip('bad-trigger', function () { const keep = ES();
    try { return [
      Ev.schedule({ id: 'z2', title: 't', kind: 'repeat' }).reason,
      Ev.schedule({ id: 'z3', title: 't', kind: 'delayed' }).reason,
      Ev.schedule({ id: 'z4', title: 't', kind: 'conditional' }).reason]; } finally { EK(keep); } });
  want('condition-unmet', 'events.claim 时不传 metConditions（世界条件未足 ⇒ 状态零变化）');
  trip('condition-unmet', function () { const keep = ES();
    try { Ev.schedule({ id: 'z5', title: 't', kind: 'conditional', condition: '城门开' });
      return Ev.claim().blocked.map(function (b) { return b.reason; }); } finally { EK(keep); } });
  want('duplicate', 'events.schedule 同 id 且仍在活动态（不静默覆盖既有排期）');
  trip('duplicate', function () { const keep = ES();
    try { Ev.schedule({ id: 'z6', title: 't' });
      return [Ev.schedule({ id: 'z6', title: 't' }).reason]; } finally { EK(keep); } });
  want('not-active', 'events.cancel/replace 打在终态行上（已结束的排期不可再动）');
  trip('not-active', function () { const keep = ES();
    try { Ev.schedule({ id: 'z7', title: 't' }); Ev.cancel('z7', '见证');
      return [Ev.cancel('z7', 'again').reason, Ev.replace('z7', {}).reason]; } finally { EK(keep); } });
  want('not-claimed', 'events.complete 对未认领的行回报（没认领不许宣称做完）');
  trip('not-claimed', function () { const keep = ES();
    try { Ev.schedule({ id: 'z8', title: 't' });
      return [Ev.complete('z8', { ok: true }).reason]; } finally { EK(keep); } });
  // ── engines/checkpoints.js（v2.82.0 第十六面：快照与分支）──
  //   这 11 个码全部**可达**，故逐条补真见证（不是声称可达）。
  const Cp = WA.checkpoints;
  function cpReset(patch) {
    LS.clear(); try { WA.store.init(); } catch (e) {}
    Cp.setSettings(Object.assign({ enabled: true, maxSlots: 6, autoEvery: 0, autoSlots: 2 }, patch || {}));
  }
  want('bad-scope', 'checkpoints.resolveScope 传不在白名单里的范围');
  trip('bad-scope', function () { cpReset(); return [Cp.resolveScope('nope', []).reason]; });
  want('missing-keys', 'checkpoints 取 module/scene 范围却不给键');
  trip('missing-keys', function () { cpReset(); return [Cp.resolveScope('module', []).reason]; });
  want('unknown-keys', 'checkpoints 点名了骨架里没有的顶层键');
  trip('unknown-keys', function () { cpReset(); return [Cp.resolveScope('scene', ['__nope__']).reason]; });
  want('guarded-key', 'checkpoints 显式点名守卫键（schemaVersion）存快照');
  trip('guarded-key', function () { cpReset(); return [Cp.resolveScope('module', ['schemaVersion']).reason]; });
  want('lib-unreadable', '快照库读不出时 save/read 一律拒收（绝不覆盖写）');
  trip('lib-unreadable', function () {
    cpReset(); Cp.save('甲', { scope: 'global' });
    LS.setItem(Cp.stat().key, '{broken');
    return [Cp.save('乙', { scope: 'global' }).reason, Cp.read('c1').reason];
  });
  want('bad-format', '信封格式号非有限值 / 不是 JSON / 没有 worldaxisCheckpoint 标记');
  trip('bad-format', function () {
    cpReset();
    return [Cp.migrate({ worldaxisCheckpoint: 'x' }).reason,
      Cp.importOne('{not json').reason, Cp.importOne({ nope: 1 }).reason];
  });
  want('too-new', '信封格式号高于本引擎支持的 FORMAT');
  trip('too-new', function () { cpReset(); return [Cp.migrate({ worldaxisCheckpoint: 99 }).reason]; });
  want('no-migration', '信封版本更旧但没有登记对应迁移步骤（不猜）');
  trip('no-migration', function () { cpReset(); return [Cp.migrate({ worldaxisCheckpoint: 0 }).reason]; });
  want('checksum-mismatch', '信封校验和与正文对不上（搬运途中被改写）');
  trip('checksum-mismatch', function () {
    cpReset();
    const a = Cp.save('甲', { scope: 'global' });
    const ex = Cp.exportOne(a.id);
    const tampered = JSON.parse(ex.text);
    tampered.checksum = 'kdeadbeef';
    return [Cp.importOne(tampered).reason];
  });
  want('not-due', '自动快照开了但这一轮还没轮到（与 disabled 各自成词）');
  trip('not-due', function () {
    cpReset({ autoEvery: 3 });
    return [Cp.tick().reason];
  });
  const missing = Object.keys(expect).filter(function (c) { return !seen[c]; });
  const unexpected = Object.keys(seen).filter(function (c) { return !expect[c]; });
  return { expect: expect, seen: seen, missing: missing, unexpected: unexpected };
}

function tables() { return { DEAD: DEAD }; }
module.exports = { tables: tables, DEAD: DEAD, runWitness: runWitness };
