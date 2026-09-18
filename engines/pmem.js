/**
 * WorldAxis engines/pmem.js (v0.8.2)
 * 人物主观记忆：某人物记得/相信/怀疑/误解的内容（认知与客观事实分离）
 * 缝合来源：DlSNlGHT World —— memory-engine.js + memory-engine-prompt.js
 *
 * 机制：
 *  - personal_memory 只存主观认知；上帝视角事实走实体/账本，不进这里
 *  - 同一人物同一时间同一主题必须合并为一条高层记忆（先聚类再提取）
 *  - 保留认知强度：怀疑仍是怀疑，推测仍是推测，不升级成确信
 *  - known_by 只在正文明确"知晓/见证/听到"时填写，本地自动补持有者
 *  - 相对时间禁原样入档：只有能唯一换算成绝对故事时间时才填，否则留空
 *  - 每人每批≤3条、整批≤8条，宁缺毋滥；memory≤50字
 *  - 去重：同持有者+同归一化文本 → 跳过；每人上限6条，全局上限60
 *  - 实体更新走 entities.applyEntityUpdates（description空=不覆盖，event累积）
 *  - 注入块：只给近期活跃认知，防止模型把人物写成"全知"
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const CAP_TOTAL = 60;
  const CAP_PER_PERSON = 6;
  const BATCH_MAX = 8;

  const clean = v => String(v == null ? '' : v).trim();
  const normalized = v => clean(v).toLocaleLowerCase();
  const strArray = v => (Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]))
    .map(clean).filter(Boolean);

  function ensureState(draft) {
    if (!draft.memory) draft.memory = {};
    if (!Array.isArray(draft.memory.pmem)) draft.memory.pmem = [];
    return draft.memory.pmem;
  }

  // ── 提取提示词（忠实压缩源码规则）─────────────────────
  const SYSTEM_PROMPT = `你是"记忆引擎"的记忆提取器。从给定对话中同时提取人物主观记忆与世界实体更新。

人物主观记忆是某个人物记得、相信、怀疑、误解、感受到或确信的内容，同一件事在不同人物心中可以不同。实体更新记录对话明确建立或改变的组织、物件、能力与地点。

【人物主观记忆规则】
1. personal_memory 只提取人物的主观认知；不得把上帝视角事实、剧情总结、写作建议或未来预测放入。客观实体状态只能进 entity_updates。
2. 只记录具有持续意义的内容：可能影响人物此后认知、情绪、关系、立场、目标、恐惧、信任或决策的。生活流水账与无后续影响的琐事一律忽略。
3. 输出"最少且足够"的核心记忆，不是逐句摘要。同一人物同一时间围绕同一计划/事件/判断/态度的内容必须合并成一条高层记忆；只有彼此无关、会分别影响未来行为的事项才拆开。
4. name 是字符串数组，只放明确指向记忆持有者的姓名、称号或别名；不要把被记住的人放进 name。
5. known_by 只填正文明确表明知晓、亲眼见证或亲耳听到这条信息的其他人物；仅被提到或关系密切不算知情。没有则返回空数组。
6. memory 必须写出持有者、第三人称完整句，最多50字；超了压缩措辞或拆条，禁止残句。
7. time 是记忆所指事件的绝对故事时间（如"第12日 22:30"）。禁止原样写入"昨晚/三天前/刚才/宴会之后"等相对时间；只有输入提供了当前故事时间且能唯一换算时才转换，否则留空。
8. 不因已有记忆与新内容冲突而修改或删除任何一方；只提取本批新形成或被明确唤起的主观记忆。
9. 每个人物本批最多3条，整批最多8条；超过按"未来影响最大、最能改变人物行为"取舍，宁缺毋滥。
10. 保留原文认知强度：怀疑仍是怀疑，推测仍是推测，不能改成确信。
11. 没有值得记录的内容时返回空数组。

【实体更新规则】
1. entity_updates 是扁平数组，每项只允许 type、name、aliases、description、event、time。
2. type 只能是 organization（组织/政权/门派/帮派/家族/机构）、object（可持续识别的具体物件/装备/文书/材料）、ability（可掌握/增强/封印/失去的稳定能力/技能/术法/科技）、location（有持续空间身份的地点/建筑/区域/遗迹）四者之一；临时人群、种族、社会阶层、一次动作、情绪、职位、货币数值都不是实体。
3. name 优先沿用【已知实体】中的既有规范名称，不要把同一实体拆成近义名称；aliases 只放正文明确指向同一实体的别名。
4. description 是本批对实体当前状态的描述更新（≤200字），必须是状态摘要而非事件列表；本批没有描述变化时返回空字符串（空=不更新本地描述）。
5. event 只记录本批实际发生、直接涉及该实体、值得长期保留的故事事件（≤50字完整客观陈述）。组织成立/解散/合并/领导权变化、物件制造/转移/遗失/损坏/修复/销毁、能力获得/觉醒/增强/削弱/封印/失去、地点发现/建立/占领/易主/封锁/毁坏属于重要事件；"本批首次提到""被看见"等叙述行为不是故事事件。
6. time 只对应 event；event 为空时 time 必须为空。
7. 同一实体多条独立事件可返回多项，每项只带一条 event 且使用相同的 description 值；每实体本批最多3项，全部合计最多8项。
8. 不得为了保留旧描述把【已知实体】的 description 原样带回。
9. 没有值得记录的实体更新时返回空数组。

【输出格式】
只输出一个合法JSON对象：
{"personal_memory":[{"name":["人物名"],"known_by":["知情人"],"memory":"≤50字主观记忆","time":"绝对故事时间或空串"}],"entity_updates":[{"type":"organization|object|ability|location","name":"实体名","aliases":["别名"],"description":"当前描述或空串","event":"本批新增重要事件或空串","time":"event对应时间或空串"}]}
没有对应内容时数组返回 []。不得增加其他字段。`;

  function buildUserPrompt(o) {
    o = o || {};
    const people = strArray(o.knownPeople);
    const knownEntities = Array.isArray(o.knownEntities) ? o.knownEntities.filter(e => e && e.name).map(e =>
      `- [${clean(e.type) || 'entity'}] ${clean(e.name)}${(e.aliases || []).length ? ' / ' + e.aliases.join(' / ') : ''}${clean(e.desc) ? '：' + String(e.desc).slice(0, 80) : ''}`
    ) : [];
    const sections = [
      `【当前绝对故事时间】\n${clean(o.currentStoryTime) || '未提供；不得换算任何相对时间'}`,
      `【已知人物】\n${people.length ? people.map(p => '- ' + p).join('\n') : '未提供；仅使用对话中明确出现的称呼'}`,
      `【已知实体】\n${knownEntities.length ? knownEntities.join('\n') : '未提供；仅提取对话中明确命名且符合分类定义的实体'}`,
      `【待提取对话】\n${clean(o.conversation) || '（空）'}`,
      '请严格按照系统规则，只返回一个 JSON 对象。'
    ];
    if (clean(o.referenceContext)) {
      sections.splice(3, 0, `【只读辅助参考】\n${clean(o.referenceContext)}\n\n只用于识别人物、指代与前因；不得把参考内容重新提取为本轮新增记忆或实体更新。`);
    }
    return sections.join('\n\n');
  }

  // ── 入账 ──────────────────────────────────────────────
  function applyPersonalMemory(draft, list) {
    if (!Array.isArray(list)) return { added: 0, skipped: 0 };
    const pmem = ensureState(draft);
    let added = 0, skipped = 0;
    for (const raw of list.slice(0, BATCH_MAX)) {
      if (!raw) { skipped++; continue; }
      const holders = strArray(raw.name).slice(0, 4);
      const text = clean(raw.memory);
      if (!holders.length || text.length < 4) { skipped++; continue; }
      const knownBy = strArray(raw.known_by);
      // 本地自动补持有者（源码语义）
      const allKnowers = Array.from(new Set([...holders, ...knownBy])).slice(0, 8);
      const norm = normalized(text);
      // 去重：同持有者+同归一化文本
      const dup = pmem.find(e => (e.holders || []).some(h => holders.includes(h)) && normalized(e.text) === norm);
      if (dup) { skipped++; continue; }
      // 每人上限：最旧的先摘除该持有者
      for (const h of holders) {
        const owned = pmem.filter(e => (e.holders || []).includes(h));
        if (owned.length >= CAP_PER_PERSON) {
          const victim = owned[0];
          victim.holders = (victim.holders || []).filter(x => x !== h);
          if (!victim.holders.length) pmem.splice(pmem.indexOf(victim), 1);
        }
      }
      pmem.push({
        id: 'pm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        holders, known_by: allKnowers,
        text: text.slice(0, 60),
        time: clean(raw.time).slice(0, 40),
        at: Date.now()
      });
      added++;
    }
    if (pmem.length > CAP_TOTAL) pmem.splice(0, pmem.length - CAP_TOTAL);
    return { added, skipped };
  }

  // ── 查询与注入 ────────────────────────────────────────
  // v1.1.0: 人物清单统一来源——优先读权威本体 state.people（v1.0.0 已做容量治理），
  // 兼容旧存档残留的 evolution.people（历史数据仍有值时不丢别名）。
  function peopleList(st) {
    const out = [];
    const byId = (st && st.people) || {};
    Object.keys(byId).forEach(function (k) {
      const p = byId[k];
      if (p && p.name) out.push(p);
    });
    const legacy = (st && st.evolution && st.evolution.people) || [];
    if (Array.isArray(legacy)) legacy.forEach(function (p) { if (p && p.name) out.push(p); });
    return out;
  }
  function holderSet(name) {
    // 别名感知：命中 state.people 的 name 或 aliases（v1.1.0 改读权威本体）
    const st = WA.store.get();
    const people = peopleList(st);
    const target = normalized(name);
    const out = new Set([clean(name)]);
    for (const p of people) {
      const names = [p.name, ...(p.aliases || [])].map(clean).filter(Boolean);
      if (names.some(n => normalized(n) === target)) names.forEach(n => out.add(n));
    }
    return out;
  }

  /** 该人物记得什么（含其知情的他人记忆） */
  function recall(name, limit) {
    const st = WA.store.get();
    const pmem = (st.memory && st.memory.pmem) || [];
    const set = holderSet(name);
    const hit = pmem.filter(e =>
      (e.holders || []).some(h => set.has(h)) || (e.known_by || []).some(k => set.has(k))
    );
    return hit.slice(-(limit || 6));
  }

  /** 信息不对称检查：某条记忆该人物是否知情 */
  function knows(person, memoryId) {
    const st = WA.store.get();
    const e = ((st.memory && st.memory.pmem) || []).find(x => x.id === memoryId);
    if (!e) return false;
    const set = holderSet(person);
    return (e.known_by || []).some(k => set.has(k));
  }

  function buildBlock() {
    const st = WA.store.get();
    const pmem = (st.memory && st.memory.pmem) || [];
    if (!pmem.length) return '';
    const lines = pmem.slice(-8).map(e => {
      const who = (e.holders || []).join('/');
      return '- ' + who + '：' + e.text + (e.time ? `（${e.time}）` : '');
    });
    return '【人物主观记忆】以下为人物各自的认知，可能与客观事实不符；认知强度按原文保留（怀疑≠确信），不得让任何人物"全知"：\n' + lines.join('\n');
  }

  // ── 每轮提取（工作流）─────────────────────────────────
  function recentText(n) {
    let ctx = null; try { ctx = WA.mainWin.SillyTavern.getContext(); } catch (e) {}
    const chat = (ctx && ctx.chat) || [];
    return chat.slice(Math.max(0, chat.length - (n || 4)))
      .map(m => (m.is_user ? '【玩家】' : '【正文】') + String(m.mes || '').slice(0, 700)).join('\n---\n');
  }

  function knownPeopleNames() {
    const st = WA.store.get();
    const people = peopleList(st);
    return people.map(p => p.name).filter(Boolean).slice(0, 20);
  }

  function knownEntitiesList() {
    const st = WA.store.get();
    const em = st.evolution && st.evolution.entityMemory;
    if (!em) return [];
    const out = [];
    for (const t of ['organization', 'object', 'ability', 'location']) {
      for (const e of (em[t] || []).slice(-10)) out.push({ type: t, name: e.name, aliases: e.aliases || [], desc: e.desc || '' });
    }
    return out.slice(-24);
  }

  async function extractRound() {
    const cfg = WA.apiRouter.getChannel('digest');
    if (!cfg.baseUrl || !cfg.model) return null;
    const st = WA.store.get();
    const msgs = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt({
        currentStoryTime: st.clock && st.clock.label,
        knownPeople: knownPeopleNames(),
        knownEntities: knownEntitiesList(),
        conversation: recentText(4)
      }) }
    ];
    const r = await WA.apiRouter.call('digest', msgs, { json: true, maxTokens: 900, temperature: 0.2 }).catch(() => null);
    if (!r) return null;
    const result = { added: 0, skipped: 0, entityUpdates: 0 };
    WA.store.transact(draft => {
      const pr = applyPersonalMemory(draft, r.personal_memory);
      result.added = pr.added; result.skipped = pr.skipped;
      if (WA.entities && WA.entities.applyEntityUpdates && Array.isArray(r.entity_updates)) {
        result.entityUpdates = WA.entities.applyEntityUpdates(draft, r.entity_updates);
      }
    });
    if (result.added || result.entityUpdates) WA.log('info', `主观记忆入账: 记忆+${result.added} 实体更新${result.entityUpdates}`);
    return result;
  }

  WA.pmem = {
    SYSTEM_PROMPT, buildUserPrompt,
    applyPersonalMemory, recall, knows, buildBlock, extractRound, holderSet,
    // v2.8.0: `recentText` 此前是**内部函数**（extractRound 自用），未导出。
    //   而 render/inject.js 自 v0.9.8 起就在写 `WA.pmem.recentText(4)`，用三元守卫兜底——
    //   于是「取近期正文当召回 haystack 分量」这件事**从未真正发生**：haystack 里
    //   永远没有当前对话正文，memorySampler 的『上下文相关召回』实际只按世界状态匹配。
    //   属纯漏导出（实现一直在用），非功能缺失；但静态看是悬空引用、行为上看是静默降级。
    recentText,
    knownPeopleNames, peopleList,   // v1.1.0: 导出人物清单（别名可达性 + 测试/调试）
    CAP_TOTAL, CAP_PER_PERSON, BATCH_MAX
  };

  WA.workflow.register({
    id: 'pmem.extract', chain: 'after', order: 45, label: '人物主观记忆提取（含实体更新）',
    async run() { await WA.pmem.extractRound(); }
  });
})();