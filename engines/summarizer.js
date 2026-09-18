/**
 * WorldAxis engines/summarizer.js (v0.8.3)
 * 双层叙事摘要管线：小纪要（阶段事件记录）→ 大总述（可独立使用的阶段史）
 * 缝合来源：DlSNlGHT World —— memory-engine-small/big-summary-prompt.js + memory-engine.js 编排
 *
 * 与 memory.js 的 L0-L3 区别：
 *  - L0-L3 是"逐轮摘要→巩固→章节→长线"的时间压缩阶梯，面向世界状态
 *  - 本管线是"连续对话→纪要→阶段史"的两级文本压缩，面向剧情叙事记忆
 *  - 纪要记录"谁—做了什么—作用于谁—造成什么结果"的可还原事件（50-200字）
 *  - 总述把多条纪要编成脱离原文可独立使用的阶段纪事（≥500字，禁空壳句）
 *  - 二者都以"事实/认知分离、不预测、不补写"为铁律
 *
 * 机制：
 *  - 按楼层区间(startLayer-endLayer)管理，避免重复压缩同一段
 *  - 每积满 SMALL_BATCH 条纪要触发一次总述，总述消费其覆盖的纪要
 *  - 注入优先大总述（信息密度高），无总述时回退近期纪要
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const SMALL_BATCH = 4;      // 攒4条纪要→1条总述
  const CAP_SMALL = 24;
  const CAP_BIG = 8;
  const SMALL_ROUNDS = 3;     // 每次纪要压缩最近3条已定稿对话

  const clean = v => String(v == null ? '' : v).trim();

  const SMALL_SYSTEM = `你是世界进程的纪要记录员。你的工作不是评价剧情，而是留下以后可以据此还原现场的事件记录。
阅读给定的连续对话，只记录这一阶段实际发生、被明确说出、被确认或发生变化的内容。
每个事件尽量写清"谁—做了什么或说了什么—作用于谁/什么—造成什么结果"，关键对话保留核心意思；避免只写"双方发生冲突""关系有所变化""局势得到推进"这类没有动作和结果的空泛概括。
优先保留：改变人物处境的具体行动及结果；获得、失去、交付或使用的重要物品与关键数值；明确的决定、承诺、命令、拒绝和威胁；新发现的事实与线索；关系或立场的可验证变化；新产生的待办、悬念，以及它们被完成、取消、失败或揭晓的结果。一个事项若在本段内被提出后又了结，必须同时写明提出与最终结果，不能留下已经失效的半截任务。
按事件实际发生顺序叙述。原文给出具体时间、地点、人名、物品名或数值时应保留；没有给出时不要推算。情绪、动机和关系变化只有在原文明确陈述或有直接言行足以确认时才能记录，并保留"怀疑、猜测、声称"等原有确定性，不把人物认知改写成客观事实。
只依据待总结对话，不补写其后的动作，不预测未来。历史参考只用于识别人物、指代与前因，纪要只能记录本段新发生或明确变化的内容，不得把历史重新抄入。忽略寒暄、重复表达、写作指令、纯修辞和不影响后续的枝节。
使用紧凑、客观、可独立理解的中文正文，不加标题或列表。输出正文50—200字。只输出JSON：{"small_summary":"..."}，没有可记录内容时返回 {"small_summary":""}。`;

  const BIG_SYSTEM = `你是世界进程的总述编纂者。你要把一组按时间排列的纪要编成一段可以脱离原文独立使用的阶段史，而不是再列一遍纪要，也不是写主题评论。
先在内部辨认本阶段的主线、支线和转折，再按实际先后把事件串联起来。写清关键行动如何引出后果、人物为何改变目标或立场、冲突如何升级或收束，以及发现、决定、承诺和损失怎样影响后续。允许合并重复信息和压缩过渡过程，但不得把具体事件抽象成"局势变化""关系加深""经历了一系列事件"等空壳句。
必须保留：决定阶段走向的行动与结果；关键人物的目标、阵营、关系和处境变化；重大冲突及其结局；重要发现、物品、地点与关键数值；持续有效的约定、任务、威胁与悬念；已经完成、取消、失败、作废或揭晓的事项。事项的建立与了结具有同等重要性，禁止只保留建立而遗漏结局，导致已结束的线索看起来仍然悬而未决。
时间、地点和因果关系只能来自输入纪要。原文确定到什么程度就写到什么程度，不自行补日期、动机或隐藏联系；人物的怀疑、误解、谎言和主张仍按人物认知表述，不能升级成世界事实。只依据输入，不补写未发生的情节，不预测未来。
成文应像一篇冷静、密实的阶段纪事：以连贯段落组织，不使用标题、列表、点评或元叙事。正文至少500字、最多不超过本批全部纪要正文总字数的一半（若该值小于500则按500执行），不得靠重复空话凑字或生硬截断。
只输出JSON：{"big_summary":"..."}。`;

  function ensureState(draft) {
    if (!draft.memory) draft.memory = {};
    if (!Array.isArray(draft.memory.smallSummaries)) draft.memory.smallSummaries = [];
    if (!Array.isArray(draft.memory.bigSummaries)) draft.memory.bigSummaries = [];
  }

  function recentRounds(n) {
    let ctx = null; try { ctx = WA.mainWin.SillyTavern.getContext(); } catch (e) {}
    const chat = (ctx && ctx.chat) || [];
    const from = Math.max(0, chat.length - n);
    const text = chat.slice(from).map(m => (m.is_user ? '【玩家】' : '【正文】') + String(m.mes || '').slice(0, 900)).join('\n---\n');
    return { text, startLayer: from, endLayer: chat.length - 1 };
  }

  // ── 小纪要 ────────────────────────────────────────────
  async function makeSmallSummary(cfgOverride) {
    const cfg = cfgOverride || WA.apiRouter.getChannel('digest');
    if (!cfg.baseUrl || !cfg.model) return null;
    const s = WA.store.get();
    ensureState(s);
    const lastEnd = (s.memory.smallSummaries.slice(-1)[0] || {}).endLayer;
    // 跳过已压缩区间
    let ctxLen = 0; try { ctxLen = (WA.mainWin.SillyTavern.getContext().chat || []).length; } catch (e) {}
    if (typeof lastEnd === 'number' && ctxLen - lastEnd <= 1) return null;
    const range = recentRounds(SMALL_ROUNDS);
    if (!range.text) return null;
    const msgs = [
      { role: 'system', content: SMALL_SYSTEM },
      { role: 'user', content: `【待总结对话】\n${range.text}\n\n请只返回 JSON。` }
    ];
    const r = await WA.apiRouter.call('digest', msgs, { json: true, maxTokens: 400, temperature: 0.3 }).catch(() => null);
    if (!r || !clean(r.small_summary)) return null;
    WA.store.transact(draft => {
      ensureState(draft);
      draft.memory.smallSummaries.push({
        startLayer: range.startLayer, endLayer: range.endLayer,
        content: clean(r.small_summary).slice(0, 220), at: clockNow('summarizer'), used: false
      });
      // v2.13.0: 纪要与总述此前是**登记表盲区**（全库唯一两条被 sizeAudit 报 unbounded 的容器），
      //   而代码其实一直在静默 slice(-N)：既被误判为无界，裁剪也无人知晓。补登 + 接台账一并修。
      if (WA.evict) WA.evict.array(draft.memory.smallSummaries, 'memory.smallSummary');
      else draft.memory.smallSummaries = draft.memory.smallSummaries.slice(-CAP_SMALL);
    });
    WA.log('info', '纪要入账');
    return r.small_summary;
  }

  // ── 大总述 ────────────────────────────────────────────
  async function makeBigSummary() {
    const s = WA.store.get();
    ensureState(s);
    const pending = (s.memory.smallSummaries || []).filter(x => !x.used);
    if (pending.length < SMALL_BATCH) return false;
    const cfg = WA.apiRouter.getChannel('digest');
    if (!cfg.baseUrl || !cfg.model) return false;
    const batch = pending.slice(-SMALL_BATCH);
    const sourceLen = batch.reduce((t, x) => t + x.content.length, 0);
    const maxLen = Math.max(500, Math.ceil(sourceLen / 2));
    const msgs = [
      { role: 'system', content: BIG_SYSTEM },
      { role: 'user', content: `【本次篇幅】\n总述正文不少于500字、不超过${maxLen}字。\n\n【待整理的阶段纪要】\n` + batch.map((x, i) => `${i + 1}. [楼层 ${x.startLayer}-${x.endLayer}] ${x.content}`).join('\n') }
    ];
    const r = await WA.apiRouter.call('digest', msgs, { json: true, maxTokens: 1200, temperature: 0.4 }).catch(() => null);
    if (!r || !clean(r.big_summary)) return false;
    WA.store.transact(draft => {
      ensureState(draft);
      const lo = Math.min(...batch.map(b => b.startLayer));
      const hi = Math.max(...batch.map(b => b.endLayer));
      draft.memory.bigSummaries.push({ startLayer: lo, endLayer: hi, content: clean(r.big_summary), at: clockNow('summarizer') });
      if (WA.evict) WA.evict.array(draft.memory.bigSummaries, 'memory.bigSummary');   // v2.13.0
      else draft.memory.bigSummaries = draft.memory.bigSummaries.slice(-CAP_BIG);
      const ids = new Set(batch.map(b => b.at));
      draft.memory.smallSummaries.forEach(x => { if (ids.has(x.at)) x.used = true; });
    });
    WA.log('info', '总述入账');
    return true;
  }

  // ── 注入块：优先总述，回退纪要 ────────────────────────
  function buildBlock() {
    const s = WA.store.get();
    if (!s.memory) return '';
    const big = (s.memory.bigSummaries || []).slice(-1)[0];
    if (big) return '【前情阶段史】\n' + big.content;
    const fresh = (s.memory.smallSummaries || []).filter(x => !x.used).slice(-3);
    if (fresh.length) return '【近期纪要】\n' + fresh.map(x => x.content).join('\n');
    return '';
  }

  WA.summarizer = { SMALL_SYSTEM, BIG_SYSTEM, makeSmallSummary, makeBigSummary, buildBlock, ensureState, SMALL_BATCH, CAP_SMALL, CAP_BIG };

  WA.workflow.register({
    id: 'summarizer.run', chain: 'after', order: 46, label: '双层叙事摘要（纪要→总述）',
    async run() { await WA.summarizer.makeSmallSummary(); await WA.summarizer.makeBigSummary(); }
  });
})();