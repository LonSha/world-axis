/**
 * WorldAxis engines/bureaucracy-ascension.js (v2.340.0)
 * EXV18-6: 功勋考绩与宗门/官僚派系推举引擎 (Bureaucracy Ascension & Meritocracy Dynamics)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用社会阶层晋升与组织考绩体系。不论是宗门外门内门真传道子晋升、
 * 朝廷科举与吏部铨选考课、财阀合伙人晋级、还是军团军衔升迁：
 *  1. 晋升四要素考评矩阵:
 *     - meritPoints: 实打实的功勋/斩妖积分/税赋贡献 (0~10000);
 *     - factionBacking: 组织高层/派系首领背书好感度 (-100~100);
 *     - reputationScore: 道德名望与声誉四维评价 (0~100);
 *     - vacancyQuota: 目标职位当期空缺配额 (>=1).
 *  2. 阶层固化阻力与潜规则 (Institutional Resistance):
 *     - nepotismBias: 权贵裙带保护主义系数 (0~100);
 *     - rivalSabotage: 竞争对手党同伐异弹劾与抹黑阻挠.
 *  3. 考评决议输出 (Ascension Verdict):
 *     - 'promoted' (顺利晋升授印)
 *     - 'suppressed' (功勋被压制/顶替冒领)
 *     - 'rejected' (功绩或资格不足驳回)
 *     - 'exceptional_bypass' (立下不世之功/圣意特批破格拔擢)
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};
  const VERSION = '2.340.0';

  const VALID_VERDICTS = Object.freeze(['promoted', 'suppressed', 'rejected', 'exceptional_bypass']);

  // 组织阶位表: Map<orgId, OrgTierRoster>
  const _orgs = new Map();

  function _clamp(n, min, max) {
    const num = Number(n);
    if (!isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
  }

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function registerOrg(orgId, opts) {
    const id = _cleanStr(orgId, 48);
    if (!id) return { ok: false, reason: 'missing-org-id' };
    const opt = opts || {};
    const state = {
      orgId: id,
      nepotismBias: _clamp(opt.nepotismBias || 20, 0, 100),
      tiers: opt.tiers || {
        apprentice: { minMerit: 0, title: '初级/外门' },
        adept: { minMerit: 100, title: '中坚/内门' },
        elite: { minMerit: 500, title: '骨干/真传执事' },
        master: { minMerit: 2000, title: '宗师/长老' }
      },
      candidates: new Map(),
      updatedAt: clockNow('bureaucracy-ascension')
    };
    _orgs.set(id, state);
    return { ok: true, org: { orgId: id, nepotismBias: state.nepotismBias } };
  }

  function getOrg(orgId) {
    const id = _cleanStr(orgId, 48);
    if (!id || !_orgs.has(id)) return null;
    const org = _orgs.get(id);
    return { orgId: org.orgId, nepotismBias: org.nepotismBias, tiers: org.tiers };
  }

  /**
   * 考绩与晋升决议推演
   * @param {object} spec
   *   orgId, candidateId, targetTier, meritPoints, factionBacking (-100~100),
   *   reputationScore, sponsorId, hasExceptionalFeat
   */
  function evaluateAscension(spec) {
    const s = spec || {};
    const orgId = _cleanStr(s.orgId, 48);
    const candId = _cleanStr(s.candidateId, 48);
    if (!orgId || !candId) return { ok: false, reason: 'missing-parameters' };

    let org = _orgs.get(orgId);
    if (!org) {
      registerOrg(orgId, {});
      org = _orgs.get(orgId);
    }

    const targetTierKey = _cleanStr(s.targetTier, 32) || 'adept';
    const tierDef = org.tiers[targetTierKey] || { minMerit: 100, title: targetTierKey };
    const merit = _clamp(s.meritPoints || 0, 0, 100000);
    const backing = _clamp(s.factionBacking !== undefined ? s.factionBacking : 0, -100, 100);
    const rep = _clamp(s.reputationScore !== undefined ? s.reputationScore : 50, 0, 100);
    const exceptional = !!s.hasExceptionalFeat;

    // 负控制铁律：功勋严重不足（< 门槛 50%）且无不世之功特批，断言直接驳回
    if (merit < tierDef.minMerit * 0.5 && !exceptional) {
      return { ok: false, reason: 'insufficient-merit-rejected' };
    }

    const result = {
      ok: true,
      orgId: orgId,
      candidateId: candId,
      targetTier: targetTierKey,
      verdict: 'rejected',
      meritProvided: merit,
      meritRequired: tierDef.minMerit,
      summary: ''
    };

    // 1. 不世奇功特批
    if (exceptional) {
      result.verdict = 'exceptional_bypass';
      result.summary = `${candId} 凭借立下逆天奇功破格拔擢！朝野震动，破格晋升为 [${tierDef.title}]！`;
    }
    // 2. 正常功勋达标，但遭遇裙带打压与党同伐异
    else if (merit >= tierDef.minMerit && (backing < -30 || (org.nepotismBias > 60 && backing < 20))) {
      result.verdict = 'suppressed';
      result.summary = `${candId} 虽然考绩功勋达标，但因得罪掌权派系且无权贵背书，战功遭恶意压制冒领！`;
    }
    // 3. 功勋与人脉双重达标
    else if (merit >= tierDef.minMerit && backing >= 0 && rep >= 40) {
      result.verdict = 'promoted';
      result.summary = `${candId} 考绩功勋卓著且众望所归，正式授印晋升为 [${tierDef.title}]！`;
    }
    // 4. 勉强达标但人望缺失
    else {
      result.verdict = 'rejected';
      result.summary = `${candId} 虽有微功但资历名望尚浅，经长老会商议暂缓晋升。`;
    }

    org.updatedAt = clockNow('bureaucracy-ascension');
    return result;
  }

  function resetAll() {
    _orgs.clear();
  }

  function diagnose() {
    return {
      ok: true,
      version: VERSION,
      orgsCount: _orgs.size,
      verdicts: VALID_VERDICTS
    };
  }

  const exportObj = {
    registerOrg: registerOrg,
    getOrg: getOrg,
    evaluateAscension: evaluateAscension,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.bureaucracyAscension = exportObj;
  WA.engines.bureaucracyAscension = exportObj;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/bureaucracy-ascension.js', { kind: 'engine', ver: VERSION });
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
})();