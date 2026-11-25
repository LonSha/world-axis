/**
 * WorldAxis tests/attire-state-v2583.js (v2.583.0) — 服装穿着状态机 + 外貌手动标记/动态升级
 *
 * 锁什么（每条都能在修复前反向验证为红）：
 *   A 状态机结构：六键闭集 / 枚举白名单 / 六理由换装锁
 *   B 无因不改：update 无 cause 拒收；cause kind 不在白名单拒收
 *   C 连续性锁：已有一套时换装必须带六理由之一；canChange 前置询问与 establish 同口径
 *   D 视角裁剪：只减正文重复，不改已建立状态（crop 返回的 stateUnchanged 必须等于真源）
 *   E 风格防漂移：主色与版型都不继承 ⇒ 拒收；任一继承 ⇒ 放行
 *   F 外貌手动标记优先：解析得出来就用，且关系加权不再生效
 *   G 外貌动态升级：三因白名单 / 升级不得缩水 / 标记角色不吃升级
 *   N 反向：把实现打坏，判据必须变红（否则测不出东西）
 */
(function () {
  'use strict';
  const fs = require('fs');
  const path = require('path');
  const vm = require('vm');
  const ROOT = path.resolve(__dirname, '..');

  function makeWA() {
    const WA = {};
    const store = {};
    WA.settingsBus = {
      read: function (r) { return store[r.key] || null; },
      normalize: function (r, v) { return Object.assign({}, v); },
      saveOrThrow: function (r, v) { store[r.key] = v; return { ok: true }; }
    };
    WA.inputGuard = { text: function (v, m) { const s = String(v == null ? '' : v).trim(); return s.slice(0, m || 40); } };
    WA.evict = { array: function () {} };
    const db = { appearance: { rows: [] } };
    WA.store = {
      get: function () { return JSON.parse(JSON.stringify(db)); },
      transact: function (fn) {
        const draft = JSON.parse(JSON.stringify(db));
        const r = fn(draft);
        if (r !== false) Object.keys(draft).forEach(function (k) { db[k] = draft[k]; });
        return r;
      }
    };
    return WA;
  }
  function load(file) {
    const WA = makeWA();
    const ctx = { window: { WorldAxis: WA }, console: console, JSON: JSON, Math: Math, Number: Number, String: String, Object: Object, Array: Array, isFinite: isFinite, parseInt: parseInt };
    ctx.window.window = ctx.window;
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx);
    return WA;
  }

  const log = [];
  function a(cond, name) { log.push({ ok: !!cond, name: name }); }

  function runAll() {
    // ═══ A 状态机结构 ═══
    const W1 = load('engines/attire-state.js');
    const A1 = W1.attireState;
    a(!!A1, 'A1 模块已装载（WA.attireState）');
    a(A1.STATE_KEYS.length === 6, 'A2 状态六键闭集（实 ' + A1.STATE_KEYS.length + '）');
    a(A1.STATE_KEYS.join(',') === 'closure,cuffs,hem,wrinkles,fit,cleanliness', 'A3 六键名与材料一致');
    a(A1.VIEWS.length === 6, 'A4 视角六个（实 ' + A1.VIEWS.length + '）');
    a(A1.CHANGE_REASONS.length === 6, 'A5 换装理由六条（实 ' + A1.CHANGE_REASONS.length + '）');
    a(A1.CAUSE_KINDS.join(',') === 'action,env,posture,time', 'A6 变更因四类（动作/环境/姿态/时间）');
    a(typeof A1.buildBlock === 'function' && typeof A1.crop === 'function', 'A7 出口面含 buildBlock / crop');

    // ═══ B 无因不改 ═══
    const W2 = load('engines/attire-state.js');
    const A2 = W2.attireState;
    a(A2.update({ who: '甲', cause: '抬手', kind: 'action', state: { hem: 'lifted' } }).reason === 'unknown',
      'B0 未建立服装时 update 报 unknown（不凭空造状态）');
    A2.establish({ who: '甲', items: { main: '素白衫' }, palette: { main: '白' }, at: 1 });
    a(A2.update({ who: '甲', state: { cuffs: 'rolled' } }).reason === 'no-cause',
      'B1 无 cause 拒收（这是「衣服不会自己变」的唯一执行点）');
    a(A2.update({ who: '甲', cause: '热', kind: 'mood', state: { cuffs: 'rolled' } }).reason === 'bad-cause-kind',
      'B2 cause kind 不在四类白名单 ⇒ 拒收（有因但类别不对也不放行）');
    a(A2.read('甲').state.cleanliness === 'new', 'B4 新建立默认整洁=新衣（材料「穿着状态初始化」）');
    a(A2.update({ who: '甲', cause: '风', kind: 'env', state: { hem: 'flying' } }).reason === 'bad-state-value',
      'B5 枚举外的值拒收（hem 无 flying）');
    a(A2.update({ who: '甲', cause: '风', kind: 'env', state: { color: 'red' } }).reason === 'bad-state-key',
      'B6 白名单外的键拒收');
    const u = A2.update({ who: '甲', cause: '抬手拂发', kind: 'action', state: { cuffs: 'pushed' }, at: 10 });
    a(u.ok === true && u.before.cuffs === 'down' && u.after.cuffs === 'pushed',
      'B7 有因的变更落地，且报出变更前/后（可复算）');
    a(A2.read('甲').lastCause.kind === 'action' && A2.read('甲').lastCause.text === '抬手拂发',
      'B8 变更因入账（kind + 原文），不是只记「变了」');

    // ═══ C 连续性锁 ═══
    const W3 = load('engines/attire-state.js');
    const A3 = W3.attireState;
    A3.establish({ who: '乙', items: { main: '青灰比甲' }, palette: { main: '青灰' } });
    const lock = A3.establish({ who: '乙', items: { main: '红裙' } });
    a(lock.reason === 'continuity-lock', 'C1 无理由换整套 ⇒ continuity-lock');
    a(Array.isArray(lock.known) && lock.known.length === 6, 'C2 拒收时把六条合法理由一并报出（可修复）');
    a(A3.canChange({ who: '乙' }).reason === 'continuity-lock', 'C3 canChange 无理由 ⇒ 拒；与 establish 同口径');
    a(A3.canChange({ who: '乙', reason: 'bath' }).ok === true, 'C4 canChange 洗浴后更衣 ⇒ 放行');
    a(A3.canChange({ who: '新人' }).reason === 'first-establish', 'C5 首建不需要理由');
    const ch = A3.establish({ who: '乙', items: { main: '青灰亵衣' }, palette: { main: '青灰' }, reason: 'bath', at: 50 });
    a(ch.ok === true && ch.reused === true && ch.changes === 1, 'C6 带理由换装落地，changes 计数+1');

    // ═══ D 视角裁剪不改状态 ═══
    const W4 = load('engines/attire-state.js');
    const A4 = W4.attireState;
    A4.establish({ who: '丙', items: { main: '锦衣' }, palette: { main: '缂' }, at: 1 });
    A4.update({ who: '丙', cause: '坐下', kind: 'posture', state: { hem: 'pressed', wrinkles: 'crosswise' } });
    const snapBefore = JSON.stringify(A4.read('丙').state);
    const cr = A4.crop({ who: '丙', view: 'seated' });
    a(cr.ok === true && cr.parts.length === 4, 'D1 坐姿视角给出 4 处（材料表逐条）');
    a(cr.parts.indexOf('衣摆') >= 0 && cr.parts.indexOf('腰腹褶皱') >= 0, 'D2 坐姿含衣摆与腰腹褶皱');
    a(JSON.stringify(cr.stateUnchanged) === snapBefore, 'D3 裁剪不改已建立状态（材料原话：只减少正文重复）');
    a(JSON.stringify(A4.read('丙').state) === snapBefore, 'D4 裁剪后真源状态逐字未变');
    a(A4.crop({ who: '丙', view: 'bogus' }).reason === 'bad-view', 'D5 未知视角拒收（不默认给正面）');
    a(A4.crop({ who: '不存在', view: 'front' }).reason === 'unknown', 'D6 未建立服装时裁剪报 unknown');

    // ═══ E 风格防漂移 ═══
    const W5 = load('engines/attire-state.js');
    const A5 = W5.attireState;
    A5.establish({ who: '丁', items: { main: '素衫' }, palette: { main: '青灰' }, outfitStyle: '素净' });
    a(A5.establish({ who: '丁', items: { main: '华服' }, palette: { main: '丹红' }, outfitStyle: '华贵', reason: 'bath' }).reason === 'style-drift',
      'E1 主色与版型双双不继承 ⇒ style-drift');
    a(A5.establish({ who: '丁', items: { main: '青灰襦裙' }, palette: { main: '青灰' }, outfitStyle: '华贵', reason: 'bath' }).ok === true,
      'E2 主色继承（版型变）⇒ 放行');
    a(A5.establish({ who: '丁', items: { main: '丹红衫' }, palette: { main: '丹红' }, outfitStyle: '华贵', reason: 'plot-gift' }).ok === true,
      'E3 版型继承（主色变）⇒ 放行 —— 与 E2 互补，两条各验一个继承面');

    // ═══ F 手动标记优先 ═══
    const W6 = load('engines/appearance.js');
    const A6 = W6.appearance;
    a(A6.markOf('外貌等级：S') === 'S', 'F1 解析「外貌等级：S」（中文冒号）');
    a(A6.markOf('外貌等级: B') === 'B', 'F2 解析半角冒号');
    a(A6.markOf('外貌等级S级') === 'S', 'F3 解析「外貌等级X级」');
    a(A6.markOf(' C ') === 'C', 'F4 整段单档位也认');
    a(A6.markOf('这是个温柔的人') === null, 'F5 无标记返回 null（不猜）');
    a(A6.markOf('外貌等级：X') === null, 'F6 档位表外的字不认');
    a(A6.markOf(null) === null && A6.markOf('') === null, 'F7 空输入不炸');
    const m = A6.register('乙', 'C', { cover: { L1: 4, L2: 3, L3: 3, L4: 2 }, mark: 'B', weighted: ['lover'] });
    a(m.ok === true && m.tier === 'B' && m.marked === 'B', 'F8 标记盖过入参档位（C→B）');
    a(A6.read('乙').weighted === false, 'F9 标记命中时关系加权不生效（材料原话）');
    a(A6.register('丙', 'C', { cover: { L1: 1 }, mark: 'B' }).reason === 'missing-coverage',
      'F10 定档后按**该**档位要求覆盖（B 需 L1>=4）');

    // ═══ G 动态升级 ═══
    const W7 = makeWA();
    (function () {
      const ctx = { window: { WorldAxis: W7 }, console: console };
      ctx.window.window = ctx.window;
      vm.createContext(ctx);
      vm.runInContext(fs.readFileSync(path.join(ROOT, 'engines/appearance.js'), 'utf8'), ctx);
    })();
    const A7 = W7.appearance;
    a(A7.UPGRADE_CAUSES.length === 3, 'G1 升级三因白名单（实 ' + A7.UPGRADE_CAUSES.length + '）');
    const up = A7.register('丁', 'C', { cover: { L1: 4, L2: 3, L3: 3, L4: 2 }, upgrade: 'third-appearance' });
    a(up.ok === true && up.tier === 'B' && up.upgradeCause === 'third-appearance', 'G2 C + 第3次出场 ⇒ 升到 B');
    a(A7.register('戊', 'C', { cover: { L1: 1 }, upgrade: 'bad-cause' }).reason === 'bad-upgrade-cause',
      'G3 白名单外的升级因拒收');
    a(A7.register('己', 'C', { cover: { L1: 1 }, upgrade: 'new-identity' }).reason === 'missing-coverage',
      'G4 升级后须按新档位补写缺失层（L1=1 不达 B）');
    A7.register('庚', 'B', { cover: { L1: 4, L2: 3, L3: 3, L4: 2 } });
    a(A7.register('庚', 'B', { cover: { L1: 4, L2: 1, L3: 3, L4: 2 }, upgrade: 'third-appearance', mode: 'rescan' }).reason === 'downgrade-coverage',
      'G5 升级时层覆盖不得缩水（材料「不得推翻已有描写」的落点）');
    const up2 = A7.register('庚', 'B', { cover: { L1: 10, L2: 8, L3: 4, L4: 4 }, upgrade: 'third-appearance', mode: 'rescan' });
    a(up2.ok === true && up2.tier === 'A', 'G6 升级且覆盖不减 ⇒ B→A');
    const mk = A7.register('辛', 'C', { cover: { L1: 1 }, mark: 'C', upgrade: 'third-appearance' });
    a(mk.ok === true && mk.tier === 'C' && mk.upgradeCause === '',
      'G7 手动标记的角色不吃动态升级（材料：动态升级只对临时生成/无设定角色）');

    // ═══ N 反向：把实现打坏，判据必须变红 ═══
    const srcA = fs.readFileSync(path.join(ROOT, 'engines/attire-state.js'), 'utf8');
    const brokenA = srcA.replace("if (!cause) { noteFault('no-cause'); return { ok: false, reason: 'no-cause', who: who }; }", 'if (false) { }');
    a(brokenA !== srcA, 'N1 能定位到「无因拒收」那句源码（否则 N2 无从验）');
    const Wn = makeWA();
    (function () {
      const ctx = { window: { WorldAxis: Wn }, console: console };
      ctx.window.window = ctx.window;
      vm.createContext(ctx);
      vm.runInContext(brokenA, ctx);
    })();
    const An = Wn.attireState;
    An.establish({ who: '壬', items: { main: '衣' }, palette: { main: '白' } });
    a(An.update({ who: '壬', cause: '', kind: 'action', state: { cuffs: 'rolled' } }).ok === true,
      'N2 打掉「无因拒收」后，空 cause 但 kind 合法的变更真的落地（证明 B1 测的是实现，不是空气）');

    const srcB = fs.readFileSync(path.join(ROOT, 'engines/appearance.js'), 'utf8');
    const brokenB = srcB.replace('if (!marked) { weighted = weight(tier, o.weighted); effTier = weighted.tier; }', 'weighted = weight(tier, o.weighted); effTier = weighted.tier;');
    a(brokenB !== srcB, 'N3 能定位到「标记优先」那句源码');
    const Wm = makeWA();
    (function () {
      const ctx = { window: { WorldAxis: Wm }, console: console };
      ctx.window.window = ctx.window;
      vm.createContext(ctx);
      vm.runInContext(brokenB, ctx);
    })();
    const Am = Wm.appearance;
    const nm = Am.register('癸', 'C', { cover: { L1: 10, L2: 8, L3: 4, L4: 4 }, mark: 'S', weighted: ['lover'] });
    // 注意：断言的判据是**档位下降**（S→B），不是 marked 字段——marked 只是「解析到了什么」的
    //   记录，打掉优先级它照样是 'S'。把断言的判据写对，这条反向才有意义。
    a(nm.ok === true && nm.tier === 'B',
      'N4 打掉标记优先后，档位从 S 退化成 C 经加权升 B（证明 F8 测的是实现；正常实现此处应为 S）');

    return log;
  }

  const rows = runAll();
  let pass = 0;
  rows.forEach(function (r) {
    if (r.ok) { pass++; console.log('  ✓ ' + r.name); }
    else { console.log('  ✗ ' + r.name); }
  });
  console.log(rows.length === 0 ? 'NO_CASES' : ('PASS ' + pass + ' / ' + rows.length));
  if (pass !== rows.length) process.exitCode = 1;
})();
