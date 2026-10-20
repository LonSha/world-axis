/**
 * WorldAxis engines/solo-voice.js (v2.230.0) — 独白推演
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓 `dream`（长梦长卷）与 `rehearsal` 走的是**场面**，但**「一个人的内心」
 *   没有被单独推演过**：现场实测 `独白` / `monologue` / `个人视角推演` 在
 *   engines|core|actors|direction|render|ui **零命中**。
 *   后果：NPC 的内心状态只能靠主模型顺手带过 —— 她不知道的事她会"知道"，
 *   她的偏见会被写成客观事实，追问式推动（"你确定吗"）反客为主。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 Rosa9527/SoulLink 的 prompts/roleplaySystem.txt（单人视角推演）：
 *     · **只输出这一段内心**：不出现任何字段名与标签，形态是"心里的一段嘀咕"；
 *     · **只用这个角色的眼睛看世界**：她不知道的事不让她知道，她认定的事顺着她的
 *       认定往下推（`information_stance`：会记错、夸大、曲解，版本有差异）；
 *     · **人性优先于人设**：行为/用词约 70% 循普通人常识，至多 30% 显性格标签
 *       （标签只在部分场景里体现倾向，不"表演"标签）；
 *     · **不把决定权推回去**：默认信息够用，按自身经验补白，**不靠反问停下**
 *       （一段里最多一句疑问，且问完立刻转下一步）；
 *     · **有长度上限**（上游 400 字），不写冗长内容。
 *   本模块只取其中**可判定的那一层**（单视角封闭 / 不越界知情 / 标签比例 /
 *   反问上限 / 长度上限 / 输出形态）；真正的模型调用由调用方做。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · dream —— 「长梦长卷（场面与卷）」,本模块不写卷；
 *   · perspective-lock —— 「谁在视角里」，本模块不改它；
 *   · 本模块 —— **单视角封闭 + 知情闸 + 比例与上限 + 形态校验**。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时 `brief` 一律 `disabled`。
 *   ② **视角封闭**：`knows` 之外的角色名出现在草稿里 ⇒ `leaked-knowledge` 具名报出
 *      （她不该知道的事不能出现在她的心里）。
 *   ③ **不知情不猜**：`unknown` 里列的名字若出现在草稿 ⇒ 同样 `leaked-knowledge`。
 *   ④ **标签比例有闸**：字数估算的"标签味"超过 `labelRatio`（默认 0.3）⇒
 *      `label-heavy`（人设标签盖过常识）。
 *   ⑤ **反问上限**：疑问句超过 `maxQuestions`（默认 1）⇒ `too-many-questions`。
 *   ⑥ **长度上限**：超出 `maxChars`（默认 400）⇒ `too-long`。
 *   ⑦ **不吐字段名/标签**：草稿里出现 `字段名:` 结构或 XML 标签 ⇒ `has-markup`。
 *   ⑧ 不落盘、不跨会话、零模型调用（**只出 brief 与校验**）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_solo_voice_settings_v1';
  const DEF = { enabled: false, maxChars: 400, maxQuestions: 1, labelRatio: 0.3, maxCast: 32 };
  const __REG = { key: LS_KEY, def: DEF, module: 'soloVoice',
    bounds: { maxChars: [40, 8000], maxQuestions: [0, 8], maxCast: [0, 512] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const FORM = '[姓名]的内心独白: ____';
  const LABEL_WORDS = ['理性者', '科学家', '法官', '教师', '医生', '警察', '总裁', '教授',
    '工程师', '特工', '将军', '圣女', '魔女', '杀手', '管家', '会长', '班长', '社长'];
  const GUIDELINES = [
    '只输出这一段内心，不出现任何字段名与标签。',
    '全程第一人称，只用这个角色的眼睛看世界：她不知道的事不让她知道。',
    '先立起点：我是谁、我此刻处境如何、我如何看待眼前这场面。',
    '人性优先于人设：约七成循普通人常识与惯性，至多三成显性格或职业标签。',
    '她认定的事就顺着她的认定往下推；可以记错、夸大、曲解。',
    '不把决定权推给反问：默认信息已够，按自身经验补白，问完立刻转下一步。',
  ];

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))) : Object.assign({}, DEF, next || {});
  }

  const stat = { briefs: 0, checked: 0, leaked: 0, overlong: 0, questions: 0, labelHeavy: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 60); }
  function nameList(v, cap) {
    const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
    return arr.map(function (x) { return clean(x, 60); }).filter(Boolean).slice(0, cap);
  }
  /**
   * 出推演任务书：给哪个角色、她已知什么、她不知道什么。
   * 只出任务书，不做任何模型调用。
   */
  function brief(character, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const who = clean(character, 60);
    if (!who) return refuse('no-character');
    const o = opts || {};
    const knows = nameList(o.knows, cfg.maxCast);
    const unknown = nameList(o.unknown, cfg.maxCast);
    if (knows.length > cfg.maxCast || unknown.length > cfg.maxCast) return refuse('cast-too-large');
    const overlap = knows.filter(function (n) { return unknown.indexOf(n) >= 0; });
    if (overlap.length) return refuse('cast-conflict');
    const scene = clean(o.scene, 300);
    stat.briefs++;
    return { ok: true, reason: 'ok', character: who, scene: scene || null,
      knows: knows, unknown: unknown, guidelines: GUIDELINES.slice(),
      form: FORM, maxChars: cfg.maxChars, maxQuestions: cfg.maxQuestions, labelRatio: cfg.labelRatio,
      drives: ['信息局限', '性欲', '逐利', '情感', '生活', '嫉妒', '选择性外向'],
      note: '她不知道的事不让她知道；她认定的事顺着她的认定推' };
  }
  function countQuestions(text) {
    const t = String(text == null ? '' : text);
    const q = (t.match(/[?？]/g) || []).length;
    const probes = (t.match(/(?:你确定|可是|那如果|所以你的意思|真的吗|是吗)/g) || []).length;
    return { questions: q, probes: probes, total: q + probes };
  }
  function labelWeight(text) {
    const t = String(text == null ? '' : text);
    let hits = 0; const found = [];
    LABEL_WORDS.forEach(function (w) { if (t.indexOf(w) >= 0) { hits++; found.push(w); } });
    return { hits: hits, found: found };
  }
  /** 校验草稿是否符合本模块的硬边界（纯文本判定）。 */
  function check(draft, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const t = String(draft == null ? '' : draft);
    if (!t.trim()) return refuse('empty-draft');
    const o = opts || {};
    const knows = nameList(o.knows, cfg.maxCast);
    const unknown = nameList(o.unknown, cfg.maxCast);
    const chars = t.replace(/\s+/g, '').length;
    const issues = [];
    // ⑦ 形态：不吐字段名与标签
    if (/<[A-Za-z][^>]{0,40}>/.test(t)) issues.push({ why: 'has-markup' });
    if (/(?:^|\n)\s*[A-Za-z_\u4e00-\u9fff]{2,10}\s*[:：]/.test(t)) issues.push({ why: 'fielded' });
    // ②③ 视角封闭
    const leaked = [];
    unknown.forEach(function (n) { if (t.indexOf(n) >= 0) leaked.push({ name: n, why: 'unknown-list' }); });
    if (knows.length) {
      // 出现在「我知道的人」之外的具名角色，由调用方用 strangers 提供
      nameList(o.strangers, cfg.maxCast).forEach(function (n) {
        if (t.indexOf(n) >= 0) leaked.push({ name: n, why: 'not-in-knows' });
      });
    }
    if (leaked.length) { issues.push({ why: 'leaked-knowledge', names: leaked }); stat.leaked++; }
    // ⑤ 反问上限
    const q = countQuestions(t);
    if (q.total > cfg.maxQuestions) { issues.push({ why: 'too-many-questions', count: q.total, limit: cfg.maxQuestions }); stat.questions++; }
    // ⑥ 长度上限
    if (chars > cfg.maxChars) { issues.push({ why: 'too-long', chars: chars, limit: cfg.maxChars }); stat.overlong++; }
    // ④ 标签比例（按命中标签词的字符占比估）
    const lw = labelWeight(t);
    const labelChars = lw.found.reduce(function (a, w) { return a + w.length; }, 0);
    const ratio = chars ? labelChars / chars : 0;
    if (ratio > cfg.labelRatio) { issues.push({ why: 'label-heavy', ratio: Math.round(ratio * 100) / 100, limit: cfg.labelRatio, labels: lw.found }); stat.labelHeavy++; }
    stat.checked++;
    if (issues.length) {
      const first = issues[0];
      noteFault(first.why);
      return { ok: false, reason: first.why, issues: issues, chars: chars, questions: q, labelRatio: ratio,
        leaked: leaked, notes: '草稿不合硬边界，先改再交给主模型' };
    }
    return { ok: true, reason: 'ok', chars: chars, questions: q, labelRatio: ratio, issues: [],
      hasForm: t.indexOf('的内心独白') >= 0, note: '单视角封闭、比例与上限均通过' };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, maxChars: cfg.maxChars, maxQuestions: cfg.maxQuestions,
      labelRatio: cfg.labelRatio, maxCast: cfg.maxCast, form: FORM,
      labelWords: LABEL_WORDS.slice(), guidelines: GUIDELINES.slice(),
      semantics: '单视角封闭 / 知情闸 / 标签比例 / 反问上限 / 长度上限 / 不吐字段名' };
  }
  function resetStat() {
    stat.briefs = 0; stat.checked = 0; stat.leaked = 0; stat.overlong = 0; stat.questions = 0; stat.labelHeavy = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.soloVoice = {
    getSettings: settings, setSettings: saveSettings, view: view,
    brief: brief, check: check, countQuestions: countQuestions, labelWeight: labelWeight,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    FORM: FORM, GUIDELINES: GUIDELINES, LABEL_WORDS: LABEL_WORDS,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/solo-voice.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'soloVoice 已加载（2.230.0）');
})();