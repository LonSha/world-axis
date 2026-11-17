/**
 * WorldAxis engines/reject-phrase.js (v2.523.0)
 * OPV27-7 拒收码话术：把「engine 甩出一个英文码」翻成「玩家能做什么」。
 *
 * 立项事实：`tests/reject-code-ledger.json` 的 base 已到 **943** 条，而「哪些码能翻成一句
 *   人话、哪些只会甩裸码」从没有读数。玩家看到 `unknown-owner` / `pending` 的第一反应
 *   不是「哦我超出时序了」，而是「这游戏坏了」。
 *
 * 本轮只补**最常撞的五簇**（容量 / 权限 / 缺参 / 时序 / 归属），其余如实记为「未覆盖」：
 *   1 覆盖率是读数，不是目标——把 943 条硬凑成 100% 只会写出 943 句没人看的模板话。
 *   2 一族一个模式，匹配的是码的**语义簇**，不是逐条查表；逐条查表在下一批新码加入时必然漂移。
 *   3 未覆盖的码**原样返回码本身**，不编一句「操作失败，请重试」——那种话术等于把问题藏起来。
 *
 * 边界（否定式）：
 *   1 不改 action-desk 的拒收判定，只在已有拒收上挂一句人话。
 *   2 不新造拒收码，不覆盖原有 reason（码是机器判据，话术是给人看的，两栏并存）。
 *   3 查不到簇时返回 ok:false + reason:'no-phrase'，调用方据此显示裸码。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_reject_phrase_settings_v1';
  const DEF = { enabled: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'rejectPhrase' };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : null;
    const base = Object.assign({}, DEF);
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign(base, raw || {}))
      : Object.assign(base, raw || {});
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  /**
   * 五簇：一条正则 + 一句「玩家能做什么」。
   * 话术刻意写成**动作句**（先…再…），不是道歉句（"抱歉，操作失败"）——玩家要的是下一步。
   */
  const CLUSTERS = [
    {
      id: 'capacity', label: '容量/上限',
      re: /(cap(acity)?|limit|too-?many|overflow|exceed|max-?rows|full|budget|quota)/i,
      phrase: '这件事已经到上限了：先把旧的清掉（或调高上限）再试。'
    },
    {
      id: 'permission', label: '权限/开关',
      re: /(denied|permission|forbidden|disabled|not-?allowed|unauthor|no-?access|blocked|gate)/i,
      phrase: '这条被权限或开关挡住了：先确认对应功能是开着的，且你有这个身份。'
    },
    {
      id: 'missing', label: '缺少信息',
      re: /(missing|absent|bad-|invalid|malformed|empty|required|no-?arg|mismatch)/i,
      phrase: '信息没给全（缺人 / 缺地点 / 缺数量）：把这几个补齐再提一次。'
    },
    {
      id: 'timing', label: '时序/冷却',
      re: /(pending|cooldown|busy|not-?yet|expired|stale|too-?early|too-?late|inflight|in-?flight|locked)/i,
      phrase: '时机不对（还没到 / 已经过了 / 上一件还没完）：等一等，或换个时点。'
    },
    {
      id: 'owner', label: '归属/未知',
      re: /(unknown|not-?found|no-?owner|no-?such|unregistered|orphan|nobody|unresolved)/i,
      phrase: '找不到这件事的对象（人或物不存在 / 没登记）：先把它立起来，或换一个对象。'
    }
  ];

  const stat = { asks: 0, covered: 0, noPhrase: 0, lastCode: '', lastCluster: '' };
  const memo = {};

  /** 分类：返回命中的簇（按 CLUSTERS 顺序，第一个命中为准）。 */
  function classify(code) {
    const c = String(code == null ? '' : code);
    if (memo[c] !== undefined) return memo[c];
    let hit = null;
    for (let i = 0; i < CLUSTERS.length; i++) {
      if (CLUSTERS[i].re.test(c)) { hit = CLUSTERS[i]; break; }
    }
    memo[c] = hit ? { ok: true, cluster: hit.id, label: hit.label, phrase: hit.phrase } : { ok: false, reason: 'no-phrase' };
    return memo[c];
  }

  /** 一行话术：命中给「码 → 人话」，未命中如实说「还没有人话」。 */
  function phraseOf(code) {
    stat.asks++;
    const c = String(code == null ? '' : code);
    const k = classify(c);
    stat.lastCode = c;
    if (!k.ok) {
      stat.noPhrase++;
      return { ok: false, code: c, reason: 'no-phrase',
        text: '这条拒收码还没有人话话术（原样显示码本身）：' + c };
    }
    stat.covered++; stat.lastCluster = k.cluster;
    return { ok: true, code: c, cluster: k.cluster, label: k.label,
      text: '「' + c + '」→ ' + k.phrase };
  }

  /**
   * 覆盖率读数：传一组码（如 reject-code-ledger 的 base）→ 覆盖几条 / 百分比 / 未覆盖清单。
   * text 一行可供面板与诊断直接显示。
   */
  function coverage(codes, opts) {
    const o = opts || {};
    const list = Array.isArray(codes) ? codes : [];
    const total = list.length;
    let covered = 0;
    const byCluster = {};
    CLUSTERS.forEach(function (c) { byCluster[c.id] = 0; });
    const missing = [];
    list.forEach(function (code) {
      const k = classify(typeof code === 'string' ? code : (code && code.code));
      if (k.ok) { covered++; byCluster[k.cluster]++; }
      else if (missing.length < (o.maxMissing || 40)) missing.push(String(typeof code === 'string' ? code : (code && code.code)));
    });
    const percent = total ? Math.round((covered / total) * 1000) / 10 : 0;
    return {
      ok: true, at: clockNow('rejectPhrase'),
      total: total, covered: covered, uncovered: total - covered,
      percent: percent, byCluster: byCluster,
      missing: missing, missingTotal: total - covered,
      text: '拒收码话术覆盖：' + covered + '/' + total + '（' + percent + '%）；'
        + CLUSTERS.map(function (c) { return c.label + ' ' + byCluster[c.id]; }).join(' · ')
        + '；未覆盖 ' + (total - covered) + ' 条仍原样甩码'
    };
  }

  WA.rejectPhrase = {
    phraseOf: phraseOf, classify: classify, coverage: coverage,
    clusters: function () { return CLUSTERS.map(function (c) { return { id: c.id, label: c.label, phrase: c.phrase }; }); },
    settings: settings,
    stat: function () { return Object.assign({}, stat); }
  };
  // 装载面登记与自述行：与全部引擎同形态（少这两行会在装载汇报里被算成「未自述」，
  //   而 module-registry 的装载期边也要靠 registerModule 才能记到这台）。
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/reject-phrase.js', { kind: 'engine', ver: '2.523.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/reject-phrase 已加载（2.523.0）');
})();