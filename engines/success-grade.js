/**
 * WorldAxis engines/success-grade.js (v2.251.0) — 成功等级分档（判定结果的粒度）
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   `engines/fate.js:340-341` 把判定结果压成两个布尔：`crit` 与 `fumble`。
 *   现场于是只剩「极好 / 极坏 / 其余全部一样」三种可读状态 ——
 *   掷 01 与掷 34（目标 35）在返回值里完全同形，叙事方只能自己再拍一层，
 *   而那一层不被记录、也不可复现。
 *   现场缺口实测：`极难` / `困难成功` / `success_level` 在 core 与 engines 命中 1 处、
 *   且是 engines/archive-hide.js 里与判定无关的修饰词。**分档这一层是空的。**
 *
 *   （同名形状已被 C 系跑团工具独立验证过：coc-kp-host `scripts/roll.py:39-49` 的
 *   `success_level(roll, value)` 给出五档：掷 1 大成功；过值时「掷点≥9、6 且目标<50」
 *   或掷 100 大失败，否则失败；命中目标则按 ≤值//5 / ≤值//2 分极难 / 困难，其余普通成功。
 *   本模块把同一梯级搬到本仓的 low 制上，并把它做成可审的纯函数。）
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   `grade(roll, target)` 吃一个骰点与一个目标，回 `{grade, rank, band}`。
 *   它是**纯判据**：不掷骰、不读 store、不改任何状态，骰点由 core/rand 给、结果由调用方落账。
 *
 * ── 缝合边界（否定式，每条都有判据咬）───────────────���──────────────
 *   ① 总开关默认关闭。关闭时只回 `pass/fail` 两档（rank 1/0），不假装分档。
 *   ② 入参一律严校：骰点与目标必须是 1..100 的整数，否则带码拒收
 *      `bad-roll` / `bad-target`；**不隐式取整、不夹取**。
 *   ③ 大失败只有两条路（掷满 `fumbleAt`，或「骰点≥`fumbleHighMin` 且目标<`lowTargetCut`」），
 *      目标很高时骰 97 仍只算失败 —— 不把高技能者当侥幸。
 *   ④ 分档**对目标单调**：目标越低，同一个骰点的档不得更高（`ladder()` 可整表核）。
 *   ⑤ 分档阈值全走 settingsBus 注册且有 bounds；除 `extremeAt`（必为 1）外都可改。
 *   ⑥ 高目标下的分档退化为线性（1/2、1/5 小到不可达时自然落到普通成功），不篡改骰点。
 *   ⑦ `rank` 是给排序用的整数（大失败 -1 … 大成功 5），`band` 是给叙事用的原文，两不相混。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_successgrade_settings_v1';
  const DEF = { enabled: false, extremeDiv: 5, hardDiv: 2, lowTargetCut: 50,
    fumbleHighMin: 96, fumbleAt: 100 };
  const __REG = { key: LS_KEY, def: DEF, module: 'successGrade',
    bounds: { extremeDiv: [2, 20], hardDiv: [2, 10], lowTargetCut: [1, 100], fumbleHighMin: [90, 100], fumbleAt: [95, 100] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  let shadow = null;
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF, shadow || {});
    const raw = WA.settingsBus.read(__REG);
    const m = WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    // 整除下限不变量：extremeDiv 必须 ≥ hardDiv，否则「极难」比「困难」还松
    if (m.extremeDiv < m.hardDiv) m.extremeDiv = m.hardDiv;
    if (m.fumbleAt < m.fumbleHighMin) m.fumbleAt = m.fumbleHighMin;
    return m;
  }
  function saveSettings(next) {
    const val = Object.assign({}, DEF, next || {});
    if (!WA.settingsBus) { shadow = val; return val; }
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, val));
  }
  const stat = { graded: 0, unknown: 0, badInput: 0, lastReason: '', lastBand: '' };
  const RANK = { '大失败': -1, '失败': 0, '普通成功': 1, '困难成功': 2, '极难成功': 3, '大成功': 5 };

  /**
   * v2.302.0 (OPV13-7): 五档非二元行动检定与代价/启发计算 (Non-binary cost/insight)
   * 结果光谱：
   *   - critical_success: 完美突破，无代价大成功
   *   - costly_success: 成功但付出代价（工具损耗、隐秘暴露、额外耗费）
   *   - partial_progress: 部分推进（目标未竟但取得阶段性位移）
   *   - insightful_failure: 失败但获得关键启发（后续同类检定难度降低）
   *   - catastrophic_failure: 灾难性大失败（局势恶化、物理重伤或触发警报）
   */
  function evaluateSpectrum(roll, target, opts) {
    opts = opts || {};
    const g = grade(roll, target);
    if (!g.ok) return g;
    const basePass = g.pass;
    const rank = g.rank;
    let spectrum = 'partial_progress';
    let cost = null;
    let insight = null;

    if (rank >= 3) {
      spectrum = 'critical_success';
      insight = { bonus: 15, tag: 'mastery_momentum', desc: '势如破竹，下一行动获得+15加成' };
    } else if (rank === 2) {
      spectrum = 'costly_success';
      cost = { type: opts.costType || 'durability_or_resource', severity: 'minor', desc: '成功达成目标，但消耗了额外工具磨损或产生微弱动静' };
    } else if (rank === 1) {
      // 普通成功边缘或根据入参判定代价
      if (roll >= target * 0.8) {
        spectrum = 'costly_success';
        cost = { type: opts.costType || 'gear_strain', severity: 'moderate', desc: '勉强成功，装备或耐力承受中度负荷' };
      } else {
        spectrum = 'partial_progress';
      }
    } else if (rank === 0) {
      // 失败：若接近目标 (差值 <= 15) 判定为有益失败 (insightful_failure)
      const diff = roll - target;
      if (diff <= 15) {
        spectrum = 'insightful_failure';
        insight = { bonus: 10, targetDiscount: 10, tag: 'flaw_observed', desc: '行动受挫但洞悉了破绽，下次检定阈值放宽 10 点' };
      } else {
        spectrum = 'costly_failure';
        cost = { type: 'stalled_time', severity: 'minor', desc: '行动失败且白白耗费了宝贵窗口' };
      }
    } else if (rank <= -1) {
      spectrum = 'catastrophic_failure';
      cost = { type: 'critical_hazard', severity: 'severe', desc: '严重失误，招致致命反扑、装备损毁或惊动全场' };
    }

    return {
      ok: true,
      roll: roll,
      target: target,
      grade: g.grade,
      rank: g.rank,
      pass: basePass,
      spectrum: spectrum,
      cost: cost,
      insight: insight,
      at: (WA.clock && typeof WA.clock.now === 'function') ? WA.clock.now('successGrade') : Date.now()
    };
  }
  function isInt100(v) { return typeof v === 'number' && isFinite(v) && (v | 0) === v && v >= 1 && v <= 100; }

  /**
   * 给一次判定分档（low 制：骰点越低越好）。
   * @param {number} roll 骰点 1..100
   * @param {number} target 目标值 1..100
   * @returns {{ok:boolean, reason?:string, grade?:string, rank?:number, band?:number, pass?:boolean, target?:number, roll?:number}}
   */
  function grade(roll, target) {
    const cfg = settings();
    if (!isInt100(roll)) { stat.badInput++; stat.lastReason = 'bad-roll'; return { ok: false, reason: 'bad-roll', roll: roll }; }
    if (!isInt100(target)) { stat.badInput++; stat.lastReason = 'bad-target'; return { ok: false, reason: 'bad-target', target: target }; }
    if (!cfg.enabled) {
      const pass = roll <= target;
      stat.graded++; stat.lastReason = 'plain'; stat.lastBand = pass ? '普通成功' : '失败';
      return { ok: true, reason: 'plain', grade: pass ? '普通成功' : '失败', rank: pass ? 1 : 0,
        band: 0, pass: pass, roll: roll, target: target };
    }
    let name;
    if (roll === 1) name = '大成功';
    else if (roll > target) {
      // ③ 大失败只有两条路：掷满，或「骰点很高且目标本身不高」
      if (roll === cfg.fumbleAt || (roll >= cfg.fumbleHighMin && target < cfg.lowTargetCut)) name = '大失败';
      else name = '失败';
    } else if (roll <= Math.floor(target / cfg.extremeDiv)) name = '极难成功';
    else if (roll <= Math.floor(target / cfg.hardDiv)) name = '困难成功';
    else name = '普通成功';
    stat.graded++; stat.lastReason = 'graded'; stat.lastBand = name;
    return { ok: true, reason: 'graded', grade: name, rank: RANK[name],
      band: 0, pass: RANK[name] >= 1, roll: roll, target: target };
  }

  /** 整表梯级：给一个目标，列出 1..100 每一骰点的档（判据④的可核形态）。 */
  function ladder(target) {
    const cfg = settings();
    if (!isInt100(target)) return { ok: false, reason: 'bad-target', target: target };
    const rows = [];
    for (let r = 1; r <= 100; r++) rows.push({ roll: r, grade: grade(r, target).grade });
    return { ok: true, target: target, enabled: cfg.enabled, rows: rows };
  }

  /** 纯判据的单调性自检：目标递减时，同骰点的 rank 不得上升。 */
  function checkMonotonic() {
    const t = settings().enabled ? [] : [];
    const prev = {};
    const bad = [];
    for (let target = 100; target >= 1; target--) {
      for (let r = 1; r <= 100; r++) {
        const g = grade(r, target);
        const p = prev[r];
        if (p !== undefined && g.rank > p) bad.push({ roll: r, target: target, was: p, now: g.rank });
        prev[r] = g.rank;
      }
    }
    return { ok: bad.length === 0, violations: bad.slice(0, 8), count: bad.length, _t: t.length };
  }

  function statOf() { return Object.assign({}, stat); }
  WA.successGrade = { grade: grade, ladder: ladder, checkMonotonic: checkMonotonic,
    evaluateSpectrum: evaluateSpectrum,
    stat: statOf, settings: settings, saveSettings: saveSettings, REG: __REG, DEF: DEF, RANK: RANK };
})();
