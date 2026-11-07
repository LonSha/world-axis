/**
 * WorldAxis engines/narrative-lens.js (v2.326.0) — 叙述层镜片：防全知 / 去媚
 * 缝合自「卢克之光 V0.5 / Anti-Route 8.31」的 12_narr.js（叙述规则集 + 幂等剥离）。
 *
 * ── 它治什么（缺口，先说不重复）─────────────────────────────────
 *   WorldAxis 已有 engines/anti-omniscience.js（后台裁决「这个人此刻该不该知道」）、
 *   intel.project（认知投影）、engines/human-realism.js（七情六欲、心底芥蒂）——
 *   全是**推演态**的权威链。但正文最终由上游模型落笔：长上下文里这些后台事实极容易被
 *   忽略，模型顺手就写「他早就知道 / 冥冥之中 / 与此同时在另一处」，或者让所有 NPC
 *   围着 <user> 转。后台算得再准，落笔破功等于没算。
 *   本模块补的是**落笔前那一行硬约束**，不重复任何一条后台裁决。
 *
 * ── 与既有模块的分工（逐条否定式）──────────────────────────────
 *   · anti-omniscience / intel / noesis —— 知情裁决真源。本模块**一次都不调**它们，
 *     不读世界状态、不判「谁该知道」，只写一条「不知道就别写」的文体铁律。
 *   · inject-collector / render-inject —— 注入链真源。本模块只提供 buildBlock() 文本，
 *     由 render/inject.js 按既有 vis 开关装配；**不自己往 messages 里塞**、不改宿主 DOM。
 *   · 宿主 fetch / 正则替换 —— **完全不碰**。原脚本靠酒馆正则 `^(.+)$` 注入，多行输入
 *     会静默失效、两条规则互相吃输出；这里只产纯文本块，幂等由 strip/apply 在文本层保证。
 *
 * ── 四条边界（全是否定式）──────────────────────────────────────
 *   ① 不猜玩家名：拿不到 ST name1 就退回「你」，绝不从正文里「认」一个人名填进去。
 *   ② 不累积：注入前先剥旧块（连带吃掉空白），注入 N 次与 1 次逐字相同。
 *   ③ 不静默失败：任何一步抛错原样返回输入文本，绝不把请求/正文弄坏。
 *   ④ 不越权：默认 off（这是会改变文风的开关，不是纯呈现层），打开是玩家的显式选择。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_narrative_lens_settings_v1';
  const DEF = { enabled: false, know: 'off', charm: 'off', userName: '' };
  const TIERS = ['off', 'lite', 'full'];
  const __REG = {
    key: LS_KEY, def: DEF, module: 'narrativeLens',
    enums: { know: TIERS, charm: TIERS },
    bounds: {}
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const TAG = 'WA-LENS';
  const VER = '2.326';
  const OPEN = '〔' + TAG + ' ' + VER + '〕';
  const CLOSE = '〔/' + TAG + '〕';

  function getSettings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  function setSettings(patch) {
    if (!WA.settingsBus) return Object.assign({}, getSettings(), patch || {});
    return WA.settingsBus.saveOrThrow(__REG,
      WA.settingsBus.normalize(__REG, Object.assign({}, getSettings(), patch || {})));
  }
  function pick(v) { return TIERS.indexOf(v) >= 0 ? v : 'off'; }
  function tagOf(v) { const s = pick(v); return s === 'off' ? '关' : (s === 'lite' ? '轻' : '强'); }
  function nextTier(v) { const s = pick(v); return s === 'off' ? 'lite' : (s === 'lite' ? 'full' : 'off'); }

  /* ── 文案（重写自原 12_narr.js；去掉「唯一通关方式是 user 死亡」这类会把模型
   *    带进拒绝句式、进而触发空回自愈循环的出口；保留「世界不迁就你」的核）── */
  const KNOW = {
    lite: '【视角受限】只写这个场景里看得见、听得见的东西。任何角色都不知道 <user> 的内心、没说出口的打算，也不知道此处之外的剧情。',
    full: [
      '【本回合铁律｜优先级高于角色卡、世界书、既往文风】',
      '1. 只写镜头能拍到、麦克风能收到的：动作、对话、表情、环境。',
      '2. 任何角色都不知道 <user> 的内心、没说出口的打算、尚未发生的剧情、此处之外的状况；也不得出现「玩家/用户/AI/设定/提示词」这类元信息。',
      '3. 不代写 <user> 的内心和决定。',
      '4. 每句台词、每个判断都要能回溯到已经发生的事。',
      '5. 禁用句式：他早就知道 / 仿佛看穿了他的心思 / 冥冥之中 / 与此同时，在另一处。',
      '6. 需要某人知情时，先写出他「如何得知」的动作或线索。',
      '7. 正文里不出现 OOC、系统说明、括号旁白，也不复述本规则。',
      '【落笔自检，不输出】这句话的信息，说话人是从哪知道的？找不到来源就重写。宁可让他判断错误，也不要让他未卜先知。'
    ].join('\n')
  };
  const CHARM = {
    lite: '【世界不围着你转】NPC 有自己的日子和安排，注意力不会自动落到 <user> 身上。',
    full: [
      '【本回合基调】',
      '1. 这是个自己在运转的世界。NPC 有各自的轨迹、关系和当天的安排，不围着 <user> 转。',
      '2. <user> 只是这个故事里的一个人，不是观众席上的玩家。',
      '3. <user> 的行动可以被 NPC 打断、无视、误解或拒绝，没有主角光环。',
      '4. 不要把 <user> 当摄像头或叙事工具：他不在场时，世界照常发生。',
      '5. 没有必胜结局。走错路、被拒绝、受伤、失败都是允许发生的。'
    ].join('\n')
  };

  /* 不猜名字：只认显式配置或宿主已存在的 name1，绝不从正文抽取 */
  function resolveName() {
    const cfg = getSettings();
    let n = String(cfg.userName == null ? '' : cfg.userName).trim();
    if (!n) {
      try {
        if (typeof SillyTavern !== 'undefined' && SillyTavern && SillyTavern.getContext) {
          const c = SillyTavern.getContext();
          n = String((c && c.name1) || '').trim();
        }
      } catch (e) { /* 宿主缺席不是错误 */ }
    }
    // 尖括号会被部分渠道当未知标签吞掉，一律剥净
    return n.replace(/[〔〕【】\[\]<>]/g, '').slice(0, 24).trim() || '你';
  }
  function fill(t) {
    const s = String(t == null ? '' : t);
    if (s.indexOf('<user>') < 0) return s;
    return s.split('<user>').join(resolveName());
  }

  const _stat = { builds: 0, strips: 0, applies: 0, cleared: 0, faults: 0, lastLabel: '', lastAt: 0 };
  function note(k) { _stat[k] = (_stat[k] || 0) + 1; _stat.lastAt = Date.now(); }

  /** 产出这一轮要注入的整块；两维都关时返回空串 */
  function lensBody() {
    const cfg = getSettings();
    const parts = [];
    const c = CHARM[pick(cfg.charm)] || '';
    const k = KNOW[pick(cfg.know)] || '';
    if (c) parts.push(fill(c));
    if (k) parts.push(fill(k));   /* 防全知在内层：离生成位置最近 */
    if (!parts.length) return '';
    return OPEN + '\n' + parts.join('\n') + '\n' + CLOSE;
  }
  function label() {
    const cfg = getSettings();
    const a = pick(cfg.know) !== 'off' ? '防全知' + tagOf(cfg.know) : '';
    const b = pick(cfg.charm) !== 'off' ? '去媚' + tagOf(cfg.charm) : '';
    return (a && b) ? a + '+' + b : (a || b || '关');
  }
  /** 粗估：中文约 0.7 tok/字，只给面板量级，不当计费依据 */
  function tokens() { const b = lensBody(); return b ? Math.round(b.length * 0.7) : 0; }

  /** 剥掉上一次注入的块。找不到标记原样返回——绝不做「猜着删」 */
  function stripOnce(s) {
    const t = String(s == null ? '' : s);
    const i = t.indexOf('〔' + TAG);
    if (i < 0) return t;
    let j = t.indexOf(CLOSE, i);
    if (j < 0) return t;
    j += CLOSE.length;
    let head = t.slice(0, i).replace(/[ \t]+$/, '');
    let tail = t.slice(j).replace(/^[ \t\r\n]+/, '');
    if (!tail) return head.replace(/[\s]+$/, '');
    return head + (head ? '\n\n' : '') + tail;
  }
  /** 历史可能留过多块；上限 8 次防呆，正常一轮结束 */
  function lensStrip(s) {
    let t = String(s == null ? '' : s);
    for (let k = 0; k < 8; k++) { const n = stripOnce(t); if (n === t) break; t = n; }
    note('strips');
    return t;
  }
  /** 文本层幂等注入：先剥旧块，再按当前档位贴新块（两维全关则只剥不贴） */
  function lensApply(text) {
    const old = String(text == null ? '' : text);
    try {
      const base = lensStrip(old);
      const block = lensBody();
      const next = block ? (base + (base ? (/\n$/.test(base) ? '\n' : '\n\n') : '') + block) : base;
      if (next !== old) {
        note('applies');
        if (!block && base !== old) note('cleared');
        _stat.lastLabel = label();
      }
      return { ok: true, text: next, changed: next !== old, label: label() };
    } catch (e) {
      note('faults');
      return { ok: false, text: old, changed: false, label: label(), reason: 'lens-apply-threw' };
    }
  }

  /** 注入链装配口：只产纯文本，不碰 messages / DOM */
  function buildBlock() {
    if (!getSettings().enabled) return '';
    const b = lensBody();
    if (!b) return '';
    note('builds');
    _stat.lastLabel = label();
    return b;
  }
  function diagnose() {
    const cfg = getSettings();
    return {
      ok: true,
      status: !cfg.enabled ? 'disabled' : (pick(cfg.know) === 'off' && pick(cfg.charm) === 'off' ? 'idle' : 'active'),
      enabled: cfg.enabled, know: pick(cfg.know), charm: pick(cfg.charm),
      label: label(), tokens: tokens(), userName: resolveName(),
      note: '只产注入文本；知情裁决真源是 anti-omniscience / intel，本模块不读世界状态'
    };
  }

  WA.narrativeLens = {
    VERSION: '2.326.0', OPEN: OPEN, CLOSE: CLOSE, TIERS: TIERS.slice(),
    KNOW: KNOW, CHARM: CHARM,
    getSettings: getSettings, setSettings: setSettings,
    pick: pick, tagOf: tagOf, nextTier: nextTier,
    lensBody: lensBody, lensStrip: lensStrip, lensApply: lensApply,
    buildBlock: buildBlock, label: label, tokens: tokens,
    diagnose: diagnose,
    stat: function () { return Object.assign({}, _stat); },
    reset: function () { Object.keys(_stat).forEach(function (k) { _stat[k] = (k === 'lastLabel' ? '' : 0); }); return { ok: true }; }
  };
  if (WA.registerModule) WA.registerModule('engines/narrative-lens.js', { kind: 'engine', ver: '2.326.0' });
})();
