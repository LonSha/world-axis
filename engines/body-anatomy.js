/**
 * WorldAxis engines/body-anatomy.js (v2.411.0)
 * 人体结构契约：左右映射 × 朝向一致 × 单一锚点 × 肢体容量 × 体型禁令。
 *
 * 缝合来源：《人体纠正》《体型指导》《身体空间与肢体描写》世界书（R251 缝合批）。
 *
 * 取舍口径（R251 裁决表）：
 *   缝入 = 左右映射修正、角色空间与肢体约束（可判定层）、人体纠正里的单一锚点/朝向一致/
 *         头只有一个、体型指导的禁令层；
 *   不缝 = NPC 交锋调度、群像均衡、时间推进模拟器、欢迎你的世界 —— 属调度层与创作层，不进引擎；
 *   体型指导的正面词库（肩宽背阔、腰细腿长一类）同样是创作词库，留给预设。
 *
 * 本模块不替写任何身体描写，只核验「写出来的身体站不站得住」：
 *   1 总开关默认关闭。关闭时 register() 返回 reason:'disabled'，不记账。
 *   2 左右映射：画面左/右是读者视角，角色左/右是角色自身视角。面向读者时画面左 = 角色右，
 *     背向读者时画面左 = 角色左，侧身时画面左 = 角色身前或身后（由朝向决定）。
 *   3 朝向一致：同场同人只允许一个朝向，换朝向必须显式给 turn，否则拒收 facing-contradiction。
 *   4 单一锚点：同场同人只允许一个空间锚点，换锚点必须显式给 move，否则拒收 multi-anchor。
 *   5 头只有一个：heads 必须为 1（拒收 head-count）；无足站不住（拒收 no-support）。
 *   6 肢体容量：手臂数决定同时持物上限，超上限拒收 over-capacity。
 *   7 体型禁令：六档各带禁令词，描述里触碰禁令即拒收 veto-hit（只取禁令层，不取正面词库）。
 *
 * 与 appearance.js 的分工：appearance 管「这人出场时外貌该写多细」（分级 × 覆盖核验），
 * 本模块管「这具身体此刻在空间里怎么站着、够得着什么、不许写成什么」，两本账不串。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_body_anatomy_settings_v1';
  const DEF = { enabled: true, maxRows: 24 };
  const __REG = { key: LS_KEY, def: DEF, module: 'bodyAnatomy', bounds: { maxRows: [4, 48] } };
  function settings() {
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG)));
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  // 朝向：读者看到的四个面。front/back 是正背，left/right 是角色面朝画面左/右的侧身。
  const FACINGS = ['front', 'back', 'left', 'right'];
  const FACING_LABELS = { front: '面向读者', back: '背向读者', left: '侧身面朝画面左', right: '侧身面朝画面右' };
  const SIDES = ['left', 'right'];
  const BODY_SIDE_LABELS = { left: '角色左', right: '角色右', front: '角色身前', back: '角色身后' };
  // 左右映射表：画面侧 → 角色自身侧。这是整个模块的地基，错一处整场镜像全错。
  const MIRROR = {
    front: { left: 'right', right: 'left' },
    back: { left: 'left', right: 'right' },
    left: { left: 'front', right: 'back' },
    right: { left: 'back', right: 'front' }
  };
  const TURNS = ['left', 'right', 'about'];

  const TIERS = ['tiny', 'slim', 'normal', 'athletic', 'heavy', 'tall'];
  const TIER_LABELS = { tiny: '幼小', slim: '清瘦', normal: '普通', athletic: '健硕', heavy: '壮硕', tall: '高挑' };
  // 单臂可及半径（米）。距离判据只认这一条表，不认描写里的「一臂之遥」。
  const TIER_REACH = { tiny: 0.55, slim: 0.72, normal: 0.8, athletic: 0.9, heavy: 1.0, tall: 1.1 };

  // 体型禁令层：该档体型**不许**写成什么。正面词库（该怎么写）不在本模块。
  const BODY_VETO = {
    tiny: ['俯视全场', '单手提起', '一步三阶', '长腿阔步', '与成人平视'],
    slim: ['肌肉虬结', '虎背熊腰', '熊腰虎背', '一掌拍碎', '碗口粗', '肩宽如门'],
    normal: ['力大无穷', '铜浇铁铸', '刀枪不入', '举起马车'],
    athletic: ['瘦弱', '纸片', '纤细如柳', '轻若无骨', '一推就倒'],
    heavy: ['轻若无物', '飘然', '身轻如燕', '纤细腰身', '一阵风就吹走'],
    tall: ['仰头看人', '踮脚', '小鸟依人', '缩在角落', '矮了半头']
  };

  const stat = { regs: 0, mirrors: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; }
  function clean(v, max) { return WA.inputGuard.text(v, max || 40); }
  function state() { return WA.store.get() || {}; }
  function rows() { const m = state().bodyAnatomy; return (m && Array.isArray(m.rows)) ? m.rows : []; }
  function rowOf(who) { return rows().filter(function (r) { return r && r.who === who; })[0] || null; }
  function claimList(claims) {
    return (Array.isArray(claims) ? claims : (claims ? [claims] : [])).map(function (c) { return clean(c, 60); }).filter(Boolean);
  }

  /**
   * 左右映射：把读者视角的画面侧翻成角色自身侧。
   * 面向读者时画面左 = 角色右；背向读者时画面左 = 角色左；
   * 侧身时画面左 = 角色身前或身后 —— 侧身没有左右之分，只有前后。
   */
  function mirror(facing, sceneSide) {
    const f = clean(facing, 8);
    const s = clean(sceneSide, 8);
    if (FACINGS.indexOf(f) < 0) { noteFault('bad-facing'); return { ok: false, reason: 'bad-facing', got: facing }; }
    if (SIDES.indexOf(s) < 0) { noteFault('bad-side'); return { ok: false, reason: 'bad-side', got: sceneSide }; }
    const bodySide = MIRROR[f][s];
    stat.mirrors++;
    return { ok: true, reason: 'mapped', facing: f, facingLabel: FACING_LABELS[f],
      sceneSide: s, bodySide: bodySide, bodySideLabel: BODY_SIDE_LABELS[bodySide] };
  }

  /** 体型禁令核验：claims 是一组描写片段，命中该档禁令词即拒收。 */
  function checkVeto(tier, claims) {
    const t = TIERS.indexOf(tier) >= 0 ? tier : 'normal';
    const pins = BODY_VETO[t];
    const list = claimList(claims);
    const hits = [];
    list.forEach(function (c) {
      pins.forEach(function (p) { if (c.indexOf(p) >= 0) hits.push({ claim: c, word: p }); });
    });
    return { ok: hits.length === 0, tier: t, tierLabel: TIER_LABELS[t], pins: pins.slice(), hits: hits };
  }

  function vetoOf(tier) {
    const t = TIERS.indexOf(tier) >= 0 ? tier : 'normal';
    return { tier: t, tierLabel: TIER_LABELS[t], pins: BODY_VETO[t].slice() };
  }

  function capacity(row) {
    const arms = row.arms;
    const holding = row.holding.length;
    return { arms: arms, holding: holding, free: arms - holding };
  }

  /**
   * 登记一具身体在场面里的站法与持有物。
   * opts：tier / facing / anchor（必填，单一锚点）/ heads / arms / legs / holding / claims /
   *       turn（换朝向的理由码）/ move（换锚点的目标锚点）/ scene
   * 同场同人只许一个朝向、一个锚点；头只有一个。
   */
  function register(who, opts) {
    const w = clean(who, 40);
    const o = opts || {};
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    const tier = o.tier || 'normal';
    if (TIERS.indexOf(tier) < 0) { noteFault('bad-tier'); return { ok: false, reason: 'bad-tier', got: o.tier }; }
    const facing = o.facing || 'front';
    if (FACINGS.indexOf(facing) < 0) { noteFault('bad-facing'); return { ok: false, reason: 'bad-facing', got: o.facing }; }
    const heads = typeof o.heads === 'number' ? o.heads : 1;
    if (heads !== 1) { noteFault('head-count'); return { ok: false, reason: 'head-count', got: heads }; }
    const arms = typeof o.arms === 'number' ? o.arms : 2;
    const legs = typeof o.legs === 'number' ? o.legs : 2;
    if (legs < 1) { noteFault('no-support'); return { ok: false, reason: 'no-support', got: legs }; }
    const holding = claimList(o.holding);
    if (holding.length > arms) {
      noteFault('over-capacity');
      return { ok: false, reason: 'over-capacity', arms: arms, holding: holding.length };
    }
    const anchor = clean(o.anchor, 40);
    if (!anchor) { noteFault('missing-anchor'); return { ok: false, reason: 'missing-anchor', who: w }; }
    const turn = clean(o.turn, 8);
    if (turn && TURNS.indexOf(turn) < 0) { noteFault('bad-turn'); return { ok: false, reason: 'bad-turn', got: o.turn }; }
    const veto = checkVeto(tier, o.claims);
    if (!veto.ok) { noteFault('veto-hit'); return { ok: false, reason: 'veto-hit', who: w, hits: veto.hits }; }

    let out = null;
    WA.store.transact(function (draft) {
      draft.bodyAnatomy = draft.bodyAnatomy && typeof draft.bodyAnatomy === 'object' && !Array.isArray(draft.bodyAnatomy) ? draft.bodyAnatomy : { rows: [] };
      draft.bodyAnatomy.rows = Array.isArray(draft.bodyAnatomy.rows) ? draft.bodyAnatomy.rows : [];
      const prev = draft.bodyAnatomy.rows.filter(function (r) { return r && r.who === w; })[0];
      if (prev && prev.facing !== facing && !turn) {
        out = { ok: false, reason: 'facing-contradiction', who: w, was: prev.facing, now: facing };
        return false;
      }
      if (prev && prev.anchor !== anchor && !clean(o.move, 16)) {
        out = { ok: false, reason: 'multi-anchor', who: w, was: prev.anchor, now: anchor };
        return false;
      }
      const row = {
        who: w, tier: tier, tierLabel: TIER_LABELS[tier], facing: facing, facingLabel: FACING_LABELS[facing],
        anchor: anchor, heads: heads, arms: arms, legs: legs, holding: holding,
        turn: turn, move: clean(o.move, 16), scene: clean(o.scene, 40),
        claims: claimList(o.claims), at: WA.clock.now('bodyAnatomy')
      };
      if (prev) {
        draft.bodyAnatomy.rows[draft.bodyAnatomy.rows.indexOf(prev)] = row;
        out = { ok: true, reason: 'updated', who: w, facing: facing, anchor: anchor };
      } else {
        draft.bodyAnatomy.rows.push(row);
        if (WA.evict) WA.evict.array(draft.bodyAnatomy.rows, 'bodyAnatomy.rows');
        out = { ok: true, reason: 'registered', who: w, facing: facing, anchor: anchor };
      }
    }, 'bodyAnatomy:register');

    if (out && out.ok) { stat.regs++; stat.lastReason = out.reason; } else noteFault(out.reason);
    return out;
  }

  /** 读一具身体的现场契约（注入与推演方的只读视图）。 */
  function read(who) {
    if (!settings().enabled) return { ok: true, who: who, reason: 'disabled' };
    const w = clean(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const hit = rowOf(w);
    if (!hit) { noteFault('missing'); return { ok: false, reason: 'missing', who: who }; }
    const caps = capacity(hit);
    return { ok: true, reason: 'applied', who: hit.who, tier: hit.tier, tierLabel: hit.tierLabel,
      facing: hit.facing, facingLabel: hit.facingLabel, anchor: hit.anchor, scene: hit.scene,
      heads: hit.heads, arms: hit.arms, legs: hit.legs, holding: hit.holding.slice(),
      capacity: caps, turn: hit.turn, move: hit.move };
  }

  /** 可及判定：距离（米）是否落在该档体型的单臂可及半径内。 */
  function canReach(who, distance) {
    const body = read(who);
    if (!body.ok) return { ok: false, reason: body.reason, who: who };
    const reach = TIER_REACH[body.tier];
    const d = typeof distance === 'number' ? distance : parseFloat(distance);
    return { ok: d <= reach, reason: d <= reach ? 'reachable' : 'out-of-reach',
      who: body.who, tier: body.tier, reach: reach, distance: d };
  }

  /** 持有容量只读视图：手臂数、已持件数、空手数。 */
  function capacityOf(who) {
    const body = read(who);
    if (!body.ok) return { ok: false, reason: body.reason, who: who };
    return { ok: true, who: body.who, tier: body.tier, arms: body.capacity.arms,
      holding: body.capacity.holding, free: body.capacity.free, items: body.holding };
  }

  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const list = rows().slice(-Math.max(1, cfg.maxRows));
    if (!list.length) return '';
    const lines = list.map(function (r) {
      const caps = capacity(r);
      const pins = BODY_VETO[r.tier];
      return '· ' + r.who + '（' + r.tierLabel + '）' + r.facingLabel + ' · 锚点「' + r.anchor + '」 · 头' +
        r.heads + ' 手' + r.arms + ' 足' + r.legs + ' · 空手' + caps.free +
        (caps.holding ? '（持 ' + r.holding.join('、') + '）' : '') +
        ' · 禁写：' + pins.join('/');
    });
    return '[人体结构]\n' + lines.join('\n') +
      '\n左右映射：画面左/右是读者视角，角色左/右是角色自身视角 —— 面向读者时画面左 = 角色右，背向读者时画面左 = 角色左，侧身时画面左 = 角色身前或身后。同场同人朝向与锚点各只允许一个（换向须转身，换位须移动），头只有一个；可及距离与持物件数按上表算，不按「一臂之遥」算。\n';
  }

  WA.bodyAnatomy = {
    FACINGS: FACINGS, FACING_LABELS: FACING_LABELS, SIDES: SIDES, BODY_SIDE_LABELS: BODY_SIDE_LABELS,
    TURNS: TURNS, TIERS: TIERS, TIER_LABELS: TIER_LABELS, TIER_REACH: TIER_REACH, BODY_VETO: BODY_VETO,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    mirror: mirror, register: register, read: read, canReach: canReach, checkVeto: checkVeto,
    vetoOf: vetoOf, capacityOf: capacityOf, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };

  WA.registerModule('engines/body-anatomy.js', { kind: 'engine', ver: '2.411.0' });
})();
