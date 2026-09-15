/**
 * WorldAxis engines/proactive.js (v0.1.13) — 语义枯竭检测与主动拉动
 * 缝合来源：NPC.json 世界书「引擎_主动拉动机制」
 *
 * 机制（把提示词层法则下沉为 before 链注入节点）：
 *  - 检测 user 最近回复是否「语义枯竭」：敷衍/犹豫/无实质动作/对话自然结束
 *  - 命中时以 NPC 视角注入一条主动拉动约束，强制把互动拽回当前场景
 *  - 触发词表 + 短回复阈值双判定，路人 NPC 即用即弃不占长期记忆（该法则在 worldbook 侧）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  // 敷衍/枯竭触发词（源自 NPC.json 引擎_主动拉动机制的 key 词表）
  const DRAIN_WORDS = ['嗯', '哦', '随便', '不知道', '行吧', '好', '沉默', '好吧', '算了', '没', '无事'];
  const MIN_LEN = 2;        // 回复短于此字数才进入枯竭判定
  const MAX_LEN = 12;       // 但太长肯定不是敷衍——上限
  const COOLDOWN_ROUNDS = 3; // 同一 NPC 连续拉动的冷却轮数，避免每轮都拽
  const MODULE = 'proactive';

  function settings() {
    try { return WA.backstage && WA.backstage.getSettings ? WA.backstage.getSettings() : {}; }
    catch (e) { return {}; }
  }
  function enabled() { return settings().proactive !== false; }   // 默认开

  /** 取最近一条 user 消息文本 */
  function lastUserText(chat) {
    if (!Array.isArray(chat)) return '';
    for (let i = chat.length - 1; i >= 0; i--) {
      const m = chat[i];
      if (m && m.role === 'user') return String(m.mes != null ? m.mes : (m.content || '')).trim();
    }
    return '';
  }

  /** 语义枯竭判定：触发词命中 或 极短无实质回复 */
  function isDrained(text) {
    if (!text) return true;                        // 空回复视为枯竭
    const t = text.replace(/\s+/g, '');
    if (t.length < MIN_LEN) return true;
    if (t.length > MAX_LEN) return false;
    for (let i = 0; i < DRAIN_WORDS.length; i++) {
      if (t.indexOf(DRAIN_WORDS[i]) >= 0) return true;
    }
    return false;
  }

  /** 冷却检查：距上次拉动不足 COOLDOWN_ROUNDS 轮则跳过 */
  function cooldownOk(state) {
    const st = state || {};
    const last = st.proactiveLastRound;
    const round = st.round != null ? st.round : 0;
    return last == null || (round - last) >= COOLDOWN_ROUNDS;
  }

  const proactive = WA.proactive = {
    DRAIN_WORDS: DRAIN_WORDS,
    isDrained: isDrained,
    /** 供设置页/诊断调用 */
    isEnabled: enabled,
    /** 手动标记一次拉动（重置冷却计时） */
    markPulled() {
      try {
        WA.store.transact(d => {
          d.proactiveLastRound = d.round != null ? d.round : 0;
        });
      } catch (e) { /* 非致命 */ }
    }
  };

  // before 链：语义枯竭时注入主动拉动约束
  WA.workflow.register({
    id: 'proactive.pull', chain: 'before', order: 25, label: '主动拉动（语义枯竭时）',
    async run(ctx) {
      if (!enabled()) return;
      if (!ctx || !Array.isArray(ctx.chat) || !ctx.chat.length) return;
      const st = ctx.store || (WA.store ? WA.store.get() : null) || {};
      if (!cooldownOk(st)) return;                  // 冷却中不重复拉
      const text = lastUserText(ctx.chat);
      if (!isDrained(text)) return;                 // 回复有实质内容，不需要拉
      // 记冷却
      try { WA.proactive.markPulled(); } catch (e) {}
      ctx.injections.push({
        source: '主动拉动',
        position: 'after_last_user', depth: 0,
        content: '<active_engagement>\n【语义枯竭已检出】{{user}} 的回复（' + JSON.stringify(text) + '）表现出敷衍、犹豫或缺少实质动作。\n【强制执行】绝不能像木头人一样等待指令或顺着敷衍结束对话。必须以当前 NPC 的视角，主动抛出一个符合其人设与当前烦恼的轻量级话题（如抱怨天气、分享刚听说的八卦、寻求帮助），强制拉动互动。\n【约束】话题必须紧贴当前场景与 NPC 烦恼，不得跳切场景，不得代写 {{user}} 的言行。\n</active_engagement>'
      });
    }
  });

  if (WA.log) WA.log('info', '主动拉动引擎已加载（语义枯竭检测）');
})();
