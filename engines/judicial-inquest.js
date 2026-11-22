/**
 * WorldAxis engines/judicial-inquest.js (v2.340.0)
 * EXV18-7: 司法公审断狱与赏金猎人追捕追凶引擎 (Judicial Inquest & Bounty Enforcement)
 *
 * 核心架构哲学（Genre-Neutral Architecture）：
 * 通用司法审判与赏金捕快执行闭环模型。不拘泥于特定时代，不论是古代大堂升堂问斩、
 * 赛博都市赏金猎人追猎逃犯、西方中世纪宗教裁判所审判、还是星际联邦公堂裁决：
 *  1. 司法通缉令 (Bounty Warrant):
 *     - targetActorId: 通缉犯标识;
 *     - crimeKind: 罪行 ('murder', 'treason', 'theft', 'heresy');
 *     - bountyReward: 赏金积分/金银 (100~100000);
 *     - warrantStatus: 'active' (追捕中) -> 'captured' (羁押归案) -> 'executed' (服刑伏诛) -> 'exonerated' (无罪平反);
 *  2. 证据链条 (Evidence Chain Matrix):
 *     - physicalEvidence: 凶器/物证;
 *     - witnessTestimony: 证人证词;
 *     - confession: 口供记录 (来自 interrogation-tell).
 *  3. 公堂断狱判决裁决 (Judicial Verdicts):
 *     - 'capital_execution' (死刑极刑，秋后问斩/斩立决);
 *     - 'penal_labor' (刺字发配/流放苦役);
 *     - 'fined_and_pilloried' (杖责游街示众);
 *     - 'acquitted' (证据不足/无罪释放).
 *  4. 连带戏剧因果:
 *     - 劫法场或买通越狱风险与通缉升级.
 */
'use strict';
(function () {
  const root = typeof window !== 'undefined' ? window : global;
  const WA = root.WorldAxis = root.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  WA.engines = WA.engines || {};
  const VERSION = '2.340.0';

  const VALID_CRIMES = Object.freeze(['murder', 'treason', 'theft', 'heresy']);
  const VALID_VERDICTS = Object.freeze(['capital_execution', 'penal_labor', 'fined_and_pilloried', 'acquitted']);

  // 通缉与司法卷宗表: Map<warrantId, WarrantRecord>
  const _warrants = new Map();

  function _clamp(n, min, max) {
    const num = Number(n);
    if (!isFinite(num)) return min;
    return Math.max(min, Math.min(max, num));
  }

  function _cleanStr(s, max) {
    if (typeof s !== 'string') return '';
    return s.trim().slice(0, max || 60);
  }

  function issueWarrant(warrantId, opts) {
    const id = _cleanStr(warrantId, 48);
    if (!id) return { ok: false, reason: 'missing-warrant-id' };
    const opt = opts || {};
    const state = {
      warrantId: id,
      targetActorId: _cleanStr(opt.targetActorId, 48) || 'unknown_fugitive',
      crimeKind: VALID_CRIMES.includes(opt.crimeKind) ? opt.crimeKind : 'murder',
      bountyReward: _clamp(opt.bountyReward || 1000, 50, 1000000),
      evidenceChain: Array.isArray(opt.evidenceChain) ? opt.evidenceChain.slice() : [],
      status: 'active',
      verdict: null,
      captorId: null,
      judgeId: null,
      updatedAt: clockNow('judicial-inquest')
    };
    _warrants.set(id, state);
    return { ok: true, warrant: JSON.parse(JSON.stringify(state)) };
  }

  function getWarrant(warrantId) {
    const id = _cleanStr(warrantId, 48);
    if (!id || !_warrants.has(id)) return null;
    return JSON.parse(JSON.stringify(_warrants.get(id)));
  }

  /**
   * 赏金猎人/捕快跨图缉拿归案
   */
  function captureFugitive(warrantId, captorId) {
    const wid = _cleanStr(warrantId, 48);
    const cid = _cleanStr(captorId, 48) || 'bounty_hunter';
    if (!wid || !_warrants.has(wid)) return { ok: false, reason: 'warrant-not-found' };
    const w = _warrants.get(wid);
    if (w.status !== 'active') return { ok: false, reason: 'warrant-not-active' };

    w.status = 'captured';
    w.captorId = cid;
    w.updatedAt = clockNow('judicial-inquest');
    return {
      ok: true,
      warrantId: wid,
      targetActorId: w.targetActorId,
      captorId: cid,
      summary: `赏金猎人 ${cid} 沿途追索数日，成功将通缉犯 ${w.targetActorId} 生擒押赴官署羁押！`
    };
  }

  /**
   * 司法大堂升堂公审断狱
   * @param {object} spec
   *   warrantId, judgeId, evidenceChain (Array of string/obj), hasConfession (boolean), bribeAttempt (boolean)
   */
  function conductInquest(spec) {
    const s = spec || {};
    const wid = _cleanStr(s.warrantId, 48);
    if (!wid) return { ok: false, reason: 'missing-warrant-id' };

    let w = _warrants.get(wid);
    if (!w) {
      issueWarrant(wid, { targetActorId: s.targetActorId });
      w = _warrants.get(wid);
    }

    const judge = _cleanStr(s.judgeId, 48) || 'magistrate';
    const evidenceList = Array.isArray(s.evidenceChain) ? s.evidenceChain : w.evidenceChain;
    const hasConfession = !!s.hasConfession;

    // 负控制铁律：无任何物证且无口供（evidenceList 为空且 hasConfession 为 false），断言绝不允许判处死刑极刑
    if (evidenceList.length === 0 && !hasConfession && s.demandedVerdict === 'capital_execution') {
      return { ok: false, reason: 'insufficient-evidence-cannot-execute' };
    }

    const result = {
      ok: true,
      warrantId: wid,
      targetActorId: w.targetActorId,
      judgeId: judge,
      verdict: 'acquitted',
      evidenceScore: evidenceList.length * 30 + (hasConfession ? 50 : 0),
      sentenceDesc: '',
      summary: ''
    };

    w.judgeId = judge;

    // 司法量刑裁决
    if (result.evidenceScore >= 80) {
      result.verdict = 'capital_execution';
      w.status = 'executed';
      result.sentenceDesc = '证据确凿口供画押，判处斩立决，即刻验明正身押赴刑场！';
      result.summary = `法官 ${judge} 拍惊堂木掷签定案：${w.targetActorId} 犯铁证重罪，判处斩刑明正典刑！`;
    } else if (result.evidenceScore >= 40) {
      result.verdict = 'penal_labor';
      w.status = 'executed';
      result.sentenceDesc = '重罪难逃，判处杖责四十并刺配三千里极恶之地充军苦役！';
      result.summary = `堂上公审宣判：${w.targetActorId} 刺配充军，服苦役十年。`;
    } else if (result.evidenceScore > 0) {
      result.verdict = 'fined_and_pilloried';
      w.status = 'executed';
      result.sentenceDesc = '微瑕有疑，判处枷号示众三日并罚没银钱充公。';
      result.summary = `证词存疑，${w.targetActorId} 判处枷号示众，以儆效尤。`;
    } else {
      result.verdict = 'acquitted';
      w.status = 'exonerated';
      result.sentenceDesc = '无凭无据栽赃诬告，当堂无罪开释，平反昭雪！';
      result.summary = `证据彻底匮乏，法官 ${judge} 宣判 ${w.targetActorId} 当堂无罪开释！`;
    }

    w.verdict = result.verdict;
    w.updatedAt = clockNow('judicial-inquest');
    return result;
  }

  function resetAll() {
    _warrants.clear();
  }

  function diagnose() {
    return {
      ok: true,
      version: VERSION,
      warrantsCount: _warrants.size,
      crimes: VALID_CRIMES,
      verdicts: VALID_VERDICTS
    };
  }

  const exportObj = {
    issueWarrant: issueWarrant,
    getWarrant: getWarrant,
    captureFugitive: captureFugitive,
    conductInquest: conductInquest,
    resetAll: resetAll,
    diagnose: diagnose
  };

  WA.judicialInquest = exportObj;
  WA.engines.judicialInquest = exportObj;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/judicial-inquest.js', { kind: 'engine', ver: VERSION });
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exportObj;
  }
})();