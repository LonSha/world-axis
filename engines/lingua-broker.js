/**
 * WorldAxis engines/lingua-broker.js (v2.400.0) — EXV22-8 方言隔阂、译语掮客与误译后果
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G3 实测：「方言 / 译语」在产品源码里 **0 命中**（interpretation 那 9 次是别处词义）。
 *   后果：**跨方言谈判没有任何沟通成本** —— 一个幽州商人和一个岭南土司
 *   在本仓说起话来和邻居一样顺。误译要能产生真实外交后果，谈判才有多重结局。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `linguaBroker.converse` 让两个说不同方言的人谈一次：先看有没有**掮客**
 *   （broker），再按「双方方言距离 × 掮客可信度 × 话题敏感度」算出
 *   **误译概率**，并把误译折算成真实后果（条款偏差）。
 *   链：方言隔阂 → 有没有译语人 → 误译概率 → 条款偏差 → 外交后果。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① **不碰 store**：谁与谁说、说的什么由调用方给。外交后果落账仍走 diplomacy 侧。
 *   ② **误译不静默**：误译必须报出来（`misread` + 偏差幅度），
 *      并且**只在真的判出误译时**才报 —— 不为了「有戏」而随机制造误会。
 *   ③ **判据确定性**：不用 Math.random，改用「发言内容哈希 + 方言距离」决定误译，
 *      同一句话同一场合必须得到同一结论（否则判据不可重放）。
 *   ④ **拒收码只用 `disabled`**，其余走 hint。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_lingua_broker_settings_v1';
  const DEF = {
    enabled: false,
    /** 双方方言距离（0=同语，1=毫不相通）折算成误译的基础概率系数。 */
    misreadPerDistance: 0.55,
    /** 有掮客时误译概率打折（掮客水平越高折越狠）。 */
    brokerRelief: 0.75,
    /** 误译一旦发生，条款偏差的基准幅度。 */
    deviationBase: 0.3
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'linguaBroker' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { talks: 0, misreads: 0, refused: 0, lastReason: '' };

  /** 方言 → 所属语族。"same family" 距离近，跨族距离远。 */
  const TONGUE = {
    'guanzhong': 'zhongyuan', 'heluo': 'zhongyuan', 'yanyun': 'zhongyuan',
    'jiangnan': 'wuyue', 'lingnan': 'wuyue', 'bashu': 'xinan',
    'xiongnu': 'beidi', 'tujue': 'beidi', 'tufan': 'xiyu', 'huyu': 'xiyu'
  };
  function tongueFamily(t) { return TONGUE[t] || null; }

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function str(v) { return String(v == null ? '' : v).trim(); }

  /** 稳定的字符串哈希（FNV-1a 32 位截断），用于「把随机换成可复算」。 */
  function hash32(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /**
   * 谈一次。
   * @param {object} spec { speaker, listener, tongueA, tongueB, broker:{ tongue, skill }, topic, text }
   */
  function converse(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const tongueA = str(s.tongueA);
    const tongueB = str(s.tongueB);
    if (!tongueA || !tongueB) {
      stat.refused++; stat.lastReason = 'missing-tongue';
      return { ok: false, hint: 'missing-tongue：必须给双方方言（tongueA / tongueB），不然算不出隔阂' };
    }
    const famA = tongueFamily(tongueA);
    const famB = tongueFamily(tongueB);
    if (!famA || !famB) {
      stat.refused++; stat.lastReason = 'unknown-tongue';
      return {
        ok: false,
        hint: 'unknown-tongue：' + (!famA ? tongueA : tongueB) + ' 不在方言表内（' + Object.keys(TONGUE).join('/') + '）'
      };
    }
    const text = str(s.text);

    // 方言距离：同语 0；同族不同语 0.35；跨族 1.0。
    let distance;
    if (tongueA === tongueB) distance = 0;
    else if (famA === famB) distance = 0.35;
    else distance = 1.0;

    // 掮客：说了才算。掮客自己也得会说其中一边，否则他也是在猜。
    const broker = s.broker && typeof s.broker === 'object' ? s.broker : null;
    let brokerSkill = 0;
    let brokerUsable = false;
    if (broker) {
      const bt = str(broker.tongue);
      const bfam = tongueFamily(bt);
      if (bfam && (bfam === famA || bfam === famB)) {
        brokerSkill = num(broker.skill) === null ? 0.6 : Math.max(0, Math.min(1, num(broker.skill)));
        brokerUsable = true;
      }
    }

    let misreadProb = distance * cfg.misreadPerDistance;
    if (brokerUsable) misreadProb = misreadProb * (1 - brokerSkill * cfg.brokerRelief);
    // 话题敏感度：越敏感的话，误译越致命（只抬后果，不抬概率）。
    const sensitivity = num(s.sensitivity) === null ? 1 : Math.max(0, num(s.sensitivity));

    // 确定性判定：把「掷骰子」换成「哈希落在概率区间内」。
    //   为什么必须这样：判据要能重放。Math.random 会让同一条断言时而红时而绿。
    const seed = hash32(tongueA + '>' + tongueB + '|' + (text || '(空)'));
    const roll = (seed % 10000) / 10000;
    const misread = roll < misreadProb;

    stat.talks++;
    if (misread) stat.misreads++;
    const deviation = misread
      ? Math.round(cfg.deviationBase * sensitivity * (distance === 1 ? 1.5 : 1) * 100) / 100
      : 0;
    return {
      ok: true,
      //   成功路径用 outcome，不用 reason（口径见 engines/celestial-omens.js 同位置注释）：
      //   reason 是**拒收专用字段**（tests/reject-code-gate.js 按 `reason: '<code>'` 收集码面）。
      //   本行初版写的是 `reason: misread ? 'misread' : 'understood'`，因为是拼接写法，
      //   逃过了首轮的逐字替换，被 D3/D7 当场逮住 —— 这正是「拼接写法的码面不稳定」
      //   那条既有裁决（reject-code-gate 头注第 39 行）在本仓的另一次现场。
      outcome: misread ? 'misread' : 'understood',
      tongueA: tongueA, tongueB: tongueB,
      distance: distance,
      brokerUsed: brokerUsable,
      brokerSkill: brokerUsable ? brokerSkill : null,
      misreadProbability: Math.round(misreadProb * 10000) / 10000,
      roll: Math.round(roll * 10000) / 10000,
      misread: misread,
      // 误译不是「听不懂」，是「听成了别的」—— 偏差幅度才是外交要处理的东西。
      deviation: deviation,
      sensitivity: sensitivity
    };
  }

  function view() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled,
      misreadPerDistance: cfg.misreadPerDistance,
      brokerRelief: cfg.brokerRelief,
      deviationBase: cfg.deviationBase,
      tongues: Object.keys(TONGUE),
      families: Object.keys(TONGUE).map(function (k) { return TONGUE[k]; })
        .filter(function (v, i, a) { return a.indexOf(v) === i; }),
      stat: Object.assign({}, stat)
    };
  }

  function setSettings(patch) {
    if (!WA.settingsBus) return { ok: false, hint: 'settingsBus 不可用' };
    const merged = Object.assign({}, settings(), patch && typeof patch === 'object' ? patch : {});
    //   ⚠ 写盘走 `saveOrThrow`，不是想当然的 `write`（v2.400.0 修）。
    //   本处初版写的是 `try { WA.settingsBus.write(__REG, merged); } catch (e) {...}`，
    //   而 `settingsBus` **根本没有 write 这个成员**（真源 core/settings-bus.js 的导出面：
    //   read / normalize / save / saveOrThrow / remove / 各类 stat）。后果不是「写失败」，而是
    //   **开关永远打不开**：每次 setSettings 都招一个 TypeError，被 catch 吞成
    //   `{ok:false, hint:'write-threw：WA.settingsBus.write is not a function'}`，而调用方只看
    //   ok 就以为「开关没开」。实测（真产品 LOAD 装载面）：八个引擎
    //   **全部** setSettings 返回 ok:false、enabled 恒为 false —— 就是说「出厂即关」
    //   在实际使用上变成了「**永远关着**」。
    //   为什么专锁没抓到：tests/exv22-v2400.js 的宿主 `makeHost()` 自带一个
    //   `write` 桩（当时是照着引擎的调用写的），于是 B4/B5 在假写面上绿了。
    //   这正是本仓反复点名的「测试里自塞了桩就测得过」。
    //   现在走与其余 12 个引擎逐字同形的真写口（如 engines/act.js:72）：
    //   `saveOrThrow(reg, normalize(reg, 合并后的字典))` —— 写不进去就抛，由本处转成可读的 hint。
    try { WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged)); } catch (e) {
      return { ok: false, hint: 'write-threw：' + (e && e.message ? e.message : '未知') };
    }
    //   写完回读：「写进去」不等于「存住了」（本仓 save 头注同语）。
    const back = settings();
    if (back.enabled !== merged.enabled) {
      return { ok: false, hint: 'write-verify：写后回读不一致（enabled ' + String(merged.enabled) + ' → ' + String(back.enabled) + '）' };
    }
    return { ok: true, settings: back };
  }

  function reset() {
    stat.talks = 0; stat.misreads = 0; stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }

  WA.linguaBroker = {
    converse: converse,
    view: view,
    setSettings: setSettings,
    getSettings: settings,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/lingua-broker.js', { kind: 'engine', ver: '2.400.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/lingua-broker 已加载（2.400.0）');
  }
})();