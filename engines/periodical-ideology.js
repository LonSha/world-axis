/**
 * WorldAxis engines/periodical-ideology.js (v2.304.0) — OPV13-8 世界内期刊舆论发酵与社会思潮推动
 *
 * ── 核心业务职责 ──────────────────────────────────────────
 *   1. 媒体言论与思潮指数沉淀（publishIdeologyArticle）：
 *      报刊按阶层受众（commoners 平民、artisans 工匠、merchants 商会、nobles 贵族）
 *      定向投放言论，改变全城各阶层的思潮倾向（如 anti_monopoly, traditionalism, reformist）；
 *   2. 舆论极化与思潮沸腾检定（assessSocialTide）：
 *      当某一社会思潮指数超过临界阈值（默认 70），社会进入沸腾态（fever）；
 *   3. 集体行动引发政策剧变（triggerCollectiveAction）：
 *      在思潮沸腾时触发全市性请愿、罢工抗税或立法变革，直接改写城市治安等级与商贸规则。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) {
    try { return WA.clock.now(site); } catch (e) { return Date.now(); }
  };

  const LS_KEY = 'worldaxis_periodical_ideology_settings_v1';
  const DEF = { enabled: true, maxArticles: 50 };
  const __REG = { key: LS_KEY, def: DEF, module: 'periodicalIdeology', bounds: {} };

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return Object.assign({}, DEF, raw || {});
  }

  function clean(v, max) {
    return WA.inputGuard ? WA.inputGuard.text(v, max || 80) : String(v == null ? '' : v).slice(0, max || 80);
  }

  function state() {
    return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
  }

  function ensure(draft) {
    draft.socialIdeology = draft.socialIdeology && typeof draft.socialIdeology === 'object' && !Array.isArray(draft.socialIdeology)
      ? draft.socialIdeology : { articles: [], classIndices: {}, collectiveActions: [] };
    if (!Array.isArray(draft.socialIdeology.articles)) draft.socialIdeology.articles = [];
    if (!draft.socialIdeology.classIndices || typeof draft.socialIdeology.classIndices !== 'object') draft.socialIdeology.classIndices = {};
    if (!Array.isArray(draft.socialIdeology.collectiveActions)) draft.socialIdeology.collectiveActions = [];
    return draft.socialIdeology;
  }

  const _stat = {
    articlesPublished: 0,
    tidesAssessed: 0,
    actionsTriggered: 0,
    refused: 0,
    lastReason: ''
  };

  /**
   * 1. 刊发影响社会思潮的社论
   */
  function publishIdeologyArticle(spec) {
    const s = spec || {};
    const aid = clean(s.articleId || s.id, 50);
    const periodical = clean(s.periodicalName || s.periodical || '黑水晨报', 60);
    const headline = clean(s.headline || s.title, 100);
    const targetClass = clean(s.targetClass || 'artisans', 40); // commoners, artisans, merchants, nobles
    const ideologyTopic = clean(s.ideologyTopic || 'anti_monopoly', 50);
    const shiftDelta = typeof s.shiftDelta === 'number' ? s.shiftDelta : 25;

    if (!aid || !headline) {
      _stat.refused++;
      _stat.lastReason = 'missing-article-fields';
      return { ok: false, reason: 'missing-article-fields' };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const now = clockNow('periodicalIdeology');

      const article = {
        articleId: aid,
        periodical: periodical,
        headline: headline,
        targetClass: targetClass,
        ideologyTopic: ideologyTopic,
        shiftDelta: shiftDelta,
        publishedAt: now
      };
      bag.articles.push(article);

      // 累加对应阶层的思潮指数
      bag.classIndices[targetClass] = bag.classIndices[targetClass] || {};
      const current = bag.classIndices[targetClass][ideologyTopic] || 0;
      const nextScore = Math.max(0, current + shiftDelta);
      bag.classIndices[targetClass][ideologyTopic] = nextScore;

      out = {
        ok: true,
        articleId: aid,
        targetClass: targetClass,
        ideologyTopic: ideologyTopic,
        scoreAfter: nextScore,
        message: '期刊社论【' + headline + '】发表，激化【' + targetClass + '】阶层【' + ideologyTopic + '】思潮至 ' + nextScore + '点！'
      };
      return true;
    }, 'periodicalIdeology:publishIdeologyArticle');

    if (out && out.ok) {
      _stat.articlesPublished++;
      _stat.lastReason = 'article_published';
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  /**
   * 2. 评估当前舆论思潮是否沸腾
   */
  function assessSocialTide(targetClass, ideologyTopic) {
    const cls = clean(targetClass, 40);
    const top = clean(ideologyTopic, 50);
    _stat.tidesAssessed++;

    const bag = ensure(state());
    const scores = (bag.classIndices && bag.classIndices[cls]) ? bag.classIndices[cls] : {};
    const score = scores[top] || 0;

    let status = 'calm';
    if (score >= 70) status = 'fever';
    else if (score >= 40) status = 'fermenting';

    _stat.lastReason = 'assessed:' + status;
    return {
      ok: true,
      targetClass: cls,
      ideologyTopic: top,
      score: score,
      status: status,
      isFever: status === 'fever',
      threshold: 70
    };
  }

  /**
   * 3. 触发集体行动（罢工/请愿/反垄断抗争）
   */
  function triggerCollectiveAction(actionSpec) {
    const s = actionSpec || {};
    const actId = clean(s.actionId || s.id, 50);
    const cls = clean(s.targetClass, 40);
    const top = clean(s.ideologyTopic, 50);
    const demand = clean(s.demand || s.description, 150);

    const tide = assessSocialTide(cls, top);
    if (!tide.isFever && s.force !== true) {
      return {
        ok: false,
        reason: 'tide-not-fever',
        currentScore: tide.score,
        requiredScore: tide.threshold,
        detail: '当前阶层思潮指数尚未达到沸腾态（' + tide.score + '/70），无法发动全市集体行动！'
      };
    }

    let out = null;
    WA.store.transact(function (draft) {
      const bag = ensure(draft);
      const now = clockNow('periodicalIdeology');

      const record = {
        actionId: actId,
        targetClass: cls,
        ideologyTopic: top,
        demand: demand,
        impact: clean(s.impact || 'guild_strike', 50),
        triggeredAt: now
      };
      bag.collectiveActions.push(record);

      out = {
        ok: true,
        actionId: actId,
        targetClass: cls,
        ideologyTopic: top,
        demand: demand,
        status: 'mobilized',
        message: '【' + cls + '】思潮沸腾（' + tide.score + '点），正式发动全市性集体行动：' + demand
      };
      return true;
    }, 'periodicalIdeology:triggerCollectiveAction');

    if (out && out.ok) {
      _stat.actionsTriggered++;
      _stat.lastReason = 'collective_action_triggered';
    }
    return out || { ok: false, reason: 'store-unavailable' };
  }

  function stat() {
    return Object.assign({}, _stat);
  }

  WA.periodicalIdeology = {
    publishIdeologyArticle: publishIdeologyArticle,
    assessSocialTide: assessSocialTide,
    triggerCollectiveAction: triggerCollectiveAction,
    stat: stat
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/periodical-ideology.js', { kind: 'engine', ver: '2.304.0' });
  }
})();
