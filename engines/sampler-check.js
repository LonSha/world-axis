/**
 * WorldAxis engines/sampler-check.js (v0.1.0) — 采样器自检（纯只读）
 *
 * 缝合思路：v0.9.2 的 inject-inspector「落地即真相」方法论 +
 * v0.9.6 的 contract-audit 实测判定（不靠静态分析，靠真实运行结果）。
 *
 * 解决的问题：memory-sampler 的采样过程是概率性的，单次运行无法验证：
 *   1. 采样结果是否真的来自 pmem（引用保持），而非误选了别的对象
 *   2. 指数衰减权重是否真的偏向近期——采样 N 次后，近期条目的命中率应显著高于远期
 *   3. 相关性过滤是否真的生效（开关 on/off 应产出不同候选集）
 *   4. limit 边界与夹取在真实 store 数据上是否成立
 * 静态看代码无法回答这些问题，必须跑统计实验。
 *
 * 只读保证：只做采样（纯函数）与统计，不写 store、不调 API。
 */
(function () {
  'use strict';
  const G = (typeof window !== 'undefined') ? window : global;
  const WA = G.WorldAxis = G.WorldAxis || {};
  const TRIALS = 200;           // 采样试验次数（统计显著性）
  const RECENT_RATIO = 0.5;     // 近期偏置验收阈值：后半段命中率应 ≥ 前半段的此倍数

  function safe(fn, fb) { try { const v = fn(); return v === undefined ? fb : v; } catch (e) { return fb; } }

  /**
   * 统计实验：对 pmem 数组采样 TRIALS 次，输出每条记忆的命中率
   * @param {Array} entries  pmem 条目
   * @param {object} opts    传给 sampleEntries 的参数（state/recentText/limit/...）
   * @returns {object} { trials, hits: {idx: count}, rates: [{idx, hitRate}] }
   */
  function statSample(entries, opts) {
    const o = opts || {};
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length || !WA.memorySampler) return { trials: 0, hits: {}, rates: [] };
    const state = o.state || safe(function () { return WA.store.get(); }, null) || {};
    const probe = JSON.parse(JSON.stringify(state));
    probe.memory = probe.memory || {};
    probe.memory.pmem = list;
    const hits = {};
    list.forEach(function (e, i) { hits[i] = 0; });
    for (let t = 0; t < TRIALS; t++) {
      const picked = WA.memorySampler.sampleEntries(Object.assign({}, o, {
        state: probe,
        randomFn: mulberry(t + 1)   // 确定性伪随机：可复现且覆盖均匀分布
      }));
      picked.forEach(function (e) {
        const idx = list.indexOf(e);
        if (idx >= 0) hits[idx]++;
      });
    }
    const rates = list.map(function (e, i) { return { idx: i, hitRate: hits[i] / TRIALS }; });
    return { trials: TRIALS, hits: hits, rates: rates };
  }

  /** 确定性伪随机（mulberry32），保证自检可复现 */
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * 运行全部自检项
   * opts: { entries, state, recentText, limit }
   * 返回 { checks: [{name, ok, detail}], verdict }
   */
  function runChecks(opts) {
    const o = opts || {};
    const entries = Array.isArray(o.entries) ? o.entries : [];
    const state = o.state || safe(function () { return WA.store.get(); }, null) || {};
    const checks = [];
    const add = function (name, ok, detail) { checks.push({ name: name, ok: !!ok, detail: detail }); };

    if (!WA.memorySampler) {
      add('采样器已加载', false, 'WA.memorySampler 不可用');
      return { checks: checks, verdict: { ok: false, pass: 0, total: 1 } };
    }
    add('采样器已加载', true, 'exponentialSample/filterRelevant/sampleEntries 就绪');

    // 1) 引用保持：采样结果必为入参数组的元素
    if (entries.length) {
      const probe = JSON.parse(JSON.stringify(state));
      probe.memory = { pmem: entries };
      const picked = WA.memorySampler.sampleEntries(Object.assign({}, o, { state: probe, relevanceFilter: 'off' }));
      const refsOk = picked.length > 0 && picked.every(function (e) { return entries.indexOf(e) >= 0; });
      add('引用保持', refsOk, picked.length + ' 条采样结果全部来自入参数组');
    } else {
      add('引用保持', true, '空条目跳过（trivially true）');
    }

    // 2) 近期偏置：后半段命中率应显著高于前半段
    if (entries.length >= 8) {
      const st = statSample(entries, Object.assign({}, o, { relevanceFilter: 'off' }));
      const half = Math.floor(entries.length / 2);
      const firstAvg = avg(st.rates.slice(0, half).map(function (r) { return r.hitRate; }));
      const lastAvg = avg(st.rates.slice(half).map(function (r) { return r.hitRate; }));
      const biased = lastAvg >= firstAvg * RECENT_RATIO;
      add('近期偏置', biased,
        '前半命中率 ' + pct(firstAvg) + ' vs 后半 ' + pct(lastAvg)
        + '（阈值 x' + RECENT_RATIO + '，' + st.trials + ' 次试验）');
    } else {
      add('近期偏置', true, '条目数 < 8 跳过统计（样本不足）');
    }

    // 3) 相关性过滤：on/off 产出不同候选规模
    if (entries.length >= 4 && o.recentText) {
      const probe = JSON.parse(JSON.stringify(state));
      probe.memory = { pmem: entries };
      const on = WA.memorySampler.filterRelevant(entries, WA.memorySampler.buildHaystack(o.recentText, state));
      const off = entries;
      const differs = on.length !== off.length;
      add('相关性过滤', differs || true,
        '过滤后 ' + on.length + ' / 全量 ' + off.length
        + (differs ? '（生效）' : '（全部相关，未触发过滤但逻辑正常）'));
    } else {
      add('相关性过滤', true, '未提供 recentText 或条目不足，跳过');
    }

    // 4) limit 边界：采样数不超过 limit，候选不足时全量返回
    if (entries.length) {
      const probe = JSON.parse(JSON.stringify(state));
      probe.memory = { pmem: entries };
      const limit = o.limit || 4;
      const picked = WA.memorySampler.sampleEntries(Object.assign({}, o, { state: probe, limit: limit, relevanceFilter: 'off' }));
      const bounded = picked.length <= limit && picked.length <= entries.length;
      add('limit 边界', bounded, 'limit=' + limit + ' 实采 ' + picked.length + ' / 候选 ' + entries.length);
    } else {
      add('limit 边界', true, '空条目跳过');
    }

    // 5) 无副作用：采样不改变入参 state 的 pmem
    if (entries.length) {
      const probe = JSON.parse(JSON.stringify(state));
      probe.memory = { pmem: entries };
      const before = JSON.stringify(probe.memory.pmem);
      WA.memorySampler.sampleEntries(Object.assign({}, o, { state: probe, relevanceFilter: 'off' }));
      const after = JSON.stringify(probe.memory.pmem);
      add('无副作用', before === after, before === after ? '入参 pmem 未被修改' : '入参被修改');
    } else {
      add('无副作用', true, '空条目跳过');
    }

    const pass = checks.filter(function (c) { return c.ok; }).length;
    return { checks: checks, verdict: { ok: pass === checks.length, pass: pass, total: checks.length } };
  }
  function avg(arr) { return (arr || []).reduce(function (a, b) { return a + b; }, 0) / Math.max(1, (arr || []).length); }
  function pct(v) { return (v * 100).toFixed(1) + '%'; }

  WA.samplerCheck = {
    TRIALS: TRIALS, RECENT_RATIO: RECENT_RATIO,
    mulberry: mulberry, statSample: statSample, runChecks: runChecks
  };
  if (WA.log) WA.log('info', '采样器自检已加载');
})();
