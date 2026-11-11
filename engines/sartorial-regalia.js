/**
 * WorldAxis engines/sartorial-regalia.js (v2.400.0) — EXV22-5 服饰规制、僭越与身份识别
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────────
 *   G3 实测：「服饰 / 礼服」在产品源码里只有 **2 命中**，且只是 rules.js 一句禁令
 *   与 stealth-infiltration 的伪装加成 —— 都是**散点**，不是制度。
 *   缺的是**制度性穿着**：僭越穿龙纹会被定罪（不是「不允许」四个字），
 *   伪装官差能骗过城门（也不是「有加成」四个字）。
 *
 * ── 机制（一句说完）──────────────────────────────────────────────────
 *   `sartorialRegalia.attireAs` 让某人穿上某套规制，按「这套规制要求的身份」
 *   与「此人真实身份」算出**僭越风险**（0..1）；`sartorialRegalia.identifyAtGate`
 *   在城门这类识别点回答「这套穿着能不能骗过盘查」。
 *   链：规制表（什么身份穿什么） → 僭越（风险几成） → 识别（骗得过 / 骗不过） → 定罪。
 *
 * ── 边界 ────────────────────────────────────────────────────────────
 *   ① **不碰 store**：谁穿什么、真实身份由调用方给。定罪与罚则仍走 rules / law 侧。
 *   ② **风险是读数不是判决**：`attireAs` 只报风险与被识破的可能，**不自动定罪** ——
 *      「穿了不该穿的衣服」与「已经被判了僭越」是两件事。
 *   ③ **拒收码只用 `disabled`**，其余走 hint。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_sartorial_regalia_settings_v1';
  const DEF = {
    enabled: false,
    /** 城门这类盘查点的默认识破力（0..1）。0 = 谁都能过，不叫盘查。 */
    gateScrutiny: 0.45,
    /** 每高一等级，风险加成（等级差 × 该值）。 */
    riskPerRankGap: 0.35
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'sartorialRegalia' };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { attires: 0, identifications: 0, passed: 0, caught: 0, refused: 0, lastReason: '' };

  /**
   * 规制表：每套穿着要求的**最低身份等级**与允许的纹样。
   * 等级越高越尊贵（9 = 天子，1 = 庶民）。穿高于自己等级的规制即僭越。
   */
  const REGALIA = {
    'dragon-robe':   { minRank: 9, patterns: ['dragon'], label: '龙纹袍' },
    'court-robe':    { minRank: 7, patterns: ['python', 'cloud'], label: '朝服' },
    'official-cap':  { minRank: 5, patterns: ['cloud'], label: '官帽' },
    'scholar-robe':  { minRank: 3, patterns: ['bamboo'], label: '儒衫' },
    'common-cloth':  { minRank: 1, patterns: [], label: '布衣' }
  };

  /** 身份名 → 等级。称呼与等级脱钩时会露馅（这是识别的原料）。 */
  const RANK_OF = {
    'emperor': 9, 'prince': 8, 'minister': 7, 'magistrate': 5,
    'scholar': 3, 'merchant': 2, 'commoner': 1, 'servant': 1
  };

  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function str(v) { return String(v == null ? '' : v).trim(); }

  const WORN = {};   // personId -> { set, realRank, claimedRank, risk }

  /**
   * 让某人穿上某套规制。
   * @param {object} spec { personId, set, realIdentity, claimedIdentity }
   */
  function attireAs(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const personId = str(s.personId);
    const setName = str(s.set);
    if (!personId || !setName) {
      stat.refused++; stat.lastReason = 'missing-args';
      return { ok: false, hint: 'missing-args：需要 personId 与 set（规制名）' };
    }
    const set = REGALIA[setName];
    if (!set) {
      stat.refused++; stat.lastReason = 'unknown-set';
      return { ok: false, hint: 'unknown-set：' + setName + ' 不在规制表内（' + Object.keys(REGALIA).join('/') + '）' };
    }
    const realId = str(s.realIdentity);
    const realRank = RANK_OF[realId];
    if (realRank === undefined) {
      stat.refused++; stat.lastReason = 'unknown-identity';
      return { ok: false, hint: 'unknown-identity：真实身份 ' + (realId || '(空)') + ' 不在等级表内，无法判僭越' };
    }
    const claimedId = str(s.claimedIdentity) || realId;
    const claimedRank = RANK_OF[claimedId] === undefined ? realRank : RANK_OF[claimedId];

    // 僭越风险只看「这套规制要求的等级 - 此人真实等级」，与自称无关：
    //   自称能骗人，但骗不了自己身上那件衣服的规格。
    const gap = set.minRank - realRank;
    const risk = gap > 0 ? Math.min(1, gap * cfg.riskPerRankGap) : 0;
    const rec = {
      set: setName, label: set.label, requiredRank: set.minRank,
      realIdentity: realId, realRank: realRank,
      claimedIdentity: claimedId, claimedRank: claimedRank,
      risk: Math.round(risk * 100) / 100,
      usurping: gap > 0
    };
    WORN[personId] = rec;
    stat.attires++;
    return Object.assign({ ok: true, outcome: 'attired', personId: personId }, rec);
  }

  /**
   * 在识别点（城门 / 关卡）盘查某人。
   * @param {object} spec { personId, scrutiny }
   */
  function identifyAtGate(spec) {
    const cfg = settings();
    if (!cfg.enabled) { stat.refused++; stat.lastReason = 'disabled'; return { ok: false, reason: 'disabled' }; }
    const s = spec && typeof spec === 'object' ? spec : {};
    const personId = str(s.personId);
    if (!personId) {
      stat.refused++; stat.lastReason = 'missing-person';
      return { ok: false, hint: 'missing-person：要盘查谁？' };
    }
    const rec = WORN[personId];
    if (!rec) {
      stat.refused++; stat.lastReason = 'not-attired';
      return { ok: false, hint: 'not-attired：这个人还没 attireAs，没有穿着就无从盘查' };
    }
    const scrutiny = num(s.scrutiny) === null ? cfg.gateScrutiny : num(s.scrutiny);
    stat.identifications++;
    // ── 被识破的概率：两条**各自独立**的发现通道，任一成立即被识破 ──────────
    //   ① 明显度：僭越本身就是刺眼的（庶民穿龙袍不需要任何人仔细看）；
    //   ② 盘查力：城门有多上心。
    // 初版写成 `risk × scrutiny`，实测暴露一个必须记下来的错：
    //   庶民穿龙袍 risk=1，城门默认 scrutiny=0.45，乘积恒为 0.45 —— **最高僭越
    //   在任何盘查力下都低于 0.5 阈值，永远抓不到**。乘法把「刺眼」压成了
    //   「像别人一样需要被发现」，于是最该被抓的那一件反而抓不到。
    // 现在用「至少一条通道成立」：1 - (1-风险)(1-盘查)。risk=1 ⇒ 必被抓，
    //   与盘查力无关；risk=0 且不撒谎 ⇒ 概率恰等于盘查力。
    const claimMismatch = rec.claimedRank > rec.realRank ? 0.15 : 0;
    // 撒谎把自己的「表观风险」抬高：越把自己说高，越容易被对上号。
    const effectiveRisk = Math.min(1, rec.risk + claimMismatch);
    const caughtProb = 1 - (1 - effectiveRisk) * (1 - scrutiny);
    // 判据用**确定性阈值**而不是随机：同一场面同一读数必须可复算。
    //   （随机会让"这一趟被识破"变成掷骰子，判据就不可重放了。）
    const caught = caughtProb >= 0.5;
    if (caught) stat.caught++; else stat.passed++;
    return {
      ok: true,
      //   ── 成功路径写 `outcome`，不写 `reason`（v2.400.0 修）──────────────────
      //   本行初版是 `reason: caught ? 'caught' : 'passed'`。两件事同时错：
      //   ① `reason` 在本仓是**拒收专用字段**（tests/reject-code-gate.js 按
      //      `reason: '<code>'` 收集码面并要求每个码有见证或死表）；盘查通过
      //      不是拒收，把结果塞进 reason 就是在污染拒收码面。
      //   ② 这里还是**三元拼接**，于是那个字面正则连「它污染了码面」都看不见 ——
      //      与 lingua-broker 第 138 行同型（同一批里出现的第二次）。
      //   处置：换成 outcome（消费方读 outcome 即可；不读也不影响，它不是判据输入）。
      outcome: caught ? 'caught' : 'passed',
      personId: personId,
      set: rec.set,
      usurping: rec.usurping,
      risk: rec.risk,
      scrutiny: Math.round(scrutiny * 100) / 100,
      caughtProbability: Math.round(caughtProb * 100) / 100,
      caught: caught
    };
  }

  function view() {
    const cfg = settings();
    return {
      enabled: !!cfg.enabled,
      gateScrutiny: cfg.gateScrutiny,
      riskPerRankGap: cfg.riskPerRankGap,
      sets: Object.keys(REGALIA),
      identities: Object.keys(RANK_OF),
      worn: Object.keys(WORN).map(function (k) {
        return { id: k, set: WORN[k].set, risk: WORN[k].risk, usurping: WORN[k].usurping };
      }),
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
    Object.keys(WORN).forEach(function (k) { delete WORN[k]; });
    stat.attires = 0; stat.identifications = 0; stat.passed = 0; stat.caught = 0;
    stat.refused = 0; stat.lastReason = '';
    return { ok: true };
  }

  WA.sartorialRegalia = {
    attireAs: attireAs,
    identifyAtGate: identifyAtGate,
    view: view,
    setSettings: setSettings,
    getSettings: settings,
    reset: reset
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/sartorial-regalia.js', { kind: 'engine', ver: '2.400.0' });
  }
  if (typeof console !== 'undefined' && console.log) {
    console.log('[WorldAxis] engines/sartorial-regalia 已加载（2.400.0）');
  }
})();