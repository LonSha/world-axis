/**
 * WorldAxis engines/observe-slice.js (v2.230.0) — 观测切片
 *
 * ── 它治什么（缺口，现场实测）────────────────────────────────────────
 *   本仓 `perspective-lock` 管**视角口径**（谁能进正文），但**「这一刻谁看见谁」
 *   没有切片**：现场实测 `观测切片` / `observationSlice` / `感知切片` 在
 *   engines|core|actors|direction|render|ui **零命中**。
 *   后果：同一时刻下多人同时在场时，**「A 到底看没看见 B 干了什么」全靠主模型猜**；
 *   结果是远处的角色"听见了"、背对的人"看到了"，认知边界当场失效。
 *
 * ── 缝合来源（显式写明，不冒称原创）──────────────────────────────────
 *   来源是 h675786161-prog/world-backstage 的 observation-scene-overlap.js
 *   （观测窗口与场景重叠）：
 *     · **本次只有一个观测主体**（「本次唯一观测主体是"某人"」），多主体即拒收；
 *     · **切片只作一致性边界，不作角色知识**：切片里写下的东西**本身不是知识**
 *       （场景关系约束只作一致性边界）；
 *     · **感知要有动作证据**：`actionProvesPerception` —— 动作里必须**引用到对方**
 *       （id 或名字）才算"感知成立"，否则只是"同在"；
 *     · **微场景是一份地点白名单**（卧室/客厅/厨房/走廊/车厢/包厢…），
 *       不在白名单里的地点**不算微场景**（可能是广场、城外 —— 那里看到不等于知道）。
 *   本模块只取其中**可判定的那一层**（唯一主体 / 动作证据 / 地点白名单 / 只读边界 /
 *   观测锚 JSON 提取）；渲染与注入由调用方做。
 *
 * ── 与既有模块的分工（三者不读写对方）────────────────────────────────
 *   · perspective-lock —— 「视角口径」，本模块不改它；
 *   · rumor / opinion —— 内容面，本模块不读；
 *   · 本模块 —— **唯一主体 + 动作证据 + 地点白名单 + 只读切片**（纯判定）。
 *
 * ── 八条否定式边界（本模块存在的全部理由）────────────────────────────
 *   ① 总开关默认关闭。关闭时 `slice` 一律 `disabled`。
 *   ② **唯一主体**：主体缺失 ⇒ `no-subject`；出现两个主体 ⇒ `multi-subject`（不猜）。
 *   ③ **感知要有动作证据**：动作里引不到对方 ⇒ `no-perception`（同在 ≠ 看见）。
 *   ④ **地点白名单**：不在微场景白名单里 ⇒ `not-micro-scene`（大场上不算知道）。
 *   ⑤ **切片只读**：`slice` 恒 `writes:0`，切片内容**不写进任何角色知识**。
 *   ⑥ **锚 JSON 只取一格**：`场景关系约束（…）：{...}` 只取**最前面那一个**完整
 *      JSON 对象；解析失败 ⇒ `bad-anchor-json`，**不半解析**。
 *   ⑦ **有硬上限**：参与人数与切片数由 settings 定，超限拒收并具名。
 *   ⑧ 不落盘、不跨会话、不碰 DOM（观测窗是当场派生物）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_observe_slice_settings_v1';
  const DEF = { enabled: false, maxCast: 32, maxSlices: 64, requireAction: true, requireMicroScene: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'observeSlice',
    bounds: { maxCast: [1, 512], maxSlices: [1, 512] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const MARKER = '你是“世界背面”的人物即时观测器。';
  const SUBJECT_RE = /本次唯一观测主体是[“"]([^”"]{1,80})[”"]/;
  const ANCHOR_RE = /场景关系约束（只作一致性边界，不是角色知识）：(\{[^\n\r]+\})/;
  const MICRO_SCENE_RE = /(?:卧室|客厅|厨房|书房|办公室|会议室|病房|教室|包厢|包间|车厢|驾驶舱|舰桥|电梯|走廊|楼梯间|阳台|浴室|卫生间|柜台|吧台|站台|候诊室|审讯室|仓库|房间|屋内|室内|门口|床边|桌边|座位|卡座|诊室|休息室|更衣室|储物间)$/;

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))) : Object.assign({}, DEF, next || {});
  }

  const stat = { slices: 0, perceived: 0, coPresent: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; stat.blocked++; stat.lastReason = r; }
  function refuse(r) { stat.refused++; noteFault(r); return { ok: false, reason: r }; }
  function clean(v, max) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max || 200); }
  function norm(v) { return clean(v, 220).toLowerCase(); }
  function normLoc(v) { return norm(v).replace(/\s+/g, '').replace(/[，,。；;、·|｜/\\]+/g, ''); }

  function isMicroScene(loc) {
    const t = normLoc(loc);
    if (!t) return false;
    return MICRO_SCENE_RE.test(t);
  }
  /** 动作是否引用了对方（id 或名字）⇒ 感知成立。 */
  function actionProvesPerception(actor, counterpart) {
    if (!actor || !counterpart) return false;
    const src = clean(actor.action || actor.currentAction || actor.current_action, 600);
    if (!src) return false;
    const refs = [counterpart.id, counterpart.name].map(norm).filter(Boolean);
    if (!refs.length) return false;
    const hay = norm(src);
    return refs.some(function (r) { return hay.indexOf(r) >= 0; });
  }
  /** 从提示词文本里抽观测锚：先认 JSON 锚，再退到人读的抬头。 */
  function extractAnchor(source) {
    const text = String(source == null ? '' : source).slice(0, 100000);
    const j = ANCHOR_RE.exec(text);
    if (j && j[1]) {
      try {
        const parsed = JSON.parse(j[1]);
        return { ok: true, reason: 'ok', by: 'json',
          personId: clean(parsed && parsed.personId, 120), userId: clean(parsed && parsed.userId, 120),
          personName: clean(parsed && parsed.personName, 80) };
      } catch (e) {
        return { ok: false, reason: 'bad-anchor-json' };
      }
    }
    const m = SUBJECT_RE.exec(text);
    if (m) return { ok: true, reason: 'ok', by: 'header', personId: '', userId: '', personName: clean(m[1], 80) };
    return { ok: false, reason: 'no-subject' };
  }
  /**
   * 切片：给定观测主体与在场各方的动作，判定「谁真正感知到了对方」。
   * 只出切片，恒 `writes:0`（切片不写进任何角色知识）。
   */
  function slice(subject, people, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const o = opts || {};
    const subjName = clean((subject && subject.name) || subject, 80);
    const subjId = clean((subject && subject.id) || o.subjectId, 120);
    if (!subjName && !subjId) return refuse('no-subject');
    const list = Array.isArray(people) ? people : [];
    if (!list.length) return refuse('empty-cast');
    if (list.length > cfg.maxCast) return refuse('cast-too-large');
    // ② 唯一主体：名单里不能出现第二个自认主体
    const subjects = list.filter(function (p) { return p && (p.isSubject === true || p.subject === true); });
    if (subjects.length > 1) return refuse('multi-subject');
    const loc = clean(o.location || (subject && subject.location), 120);
    const micro = isMicroScene(loc);
    if (cfg.requireMicroScene && !micro) return refuse('not-micro-scene');
    const subj = { name: subjName, id: subjId };
    const rows = []; let perceived = 0; let coPresent = 0;
    list.forEach(function (p) {
      const row = p || {};
      const name = clean(row.name, 80); const id = clean(row.id, 120);
      if (!name && !id) return;
      if (subjId && id && id === subjId) return;         // 自己不算观测对象
      if (!subjId && subjName && name === subjName) return;
      const hasAction = !!clean(row.action || row.currentAction || row.current_action, 600);
      const proves = actionProvesPerception(row, subj) || actionProvesPerception(subj, row);
      const state = proves ? 'perceived' : (cfg.requireAction && !hasAction ? 'silent' : 'co-present');
      if (proves) perceived++; else coPresent++;
      rows.push({ name: name, id: id, state: state, stateLabel: state === 'perceived' ? '感知成立' : (state === 'silent' ? '无声同处' : '同在未证'),
        actionRefsSubject: proves, hasAction: hasAction });
    });
    if (rows.length > cfg.maxSlices) return refuse('too-many-slices');
    stat.slices++; stat.perceived += perceived; stat.coPresent += coPresent;
    return { ok: true, reason: 'ok', subject: subj, location: loc || null, microScene: micro,
      rows: rows, count: rows.length, perceived: perceived, coPresent: coPresent,
      perceivedNames: rows.filter(function (r) { return r.state === 'perceived'; }).map(function (r) { return r.name || r.id; }),
      writes: 0, asKnowledge: false,
      note: '切片只作一致性边界，不写进任何角色知识；同在 ≠ 看见' };
  }
  /** 检测一段提示词是不是观测器提示词（用于接线时识别）。 */
  function isObservationPrompt(value, depth) {
    const d = depth || 0;
    if (d > 7 || value == null) return false;
    if (typeof value === 'string') return value.indexOf(MARKER) >= 0;
    if (Array.isArray(value)) return value.some(function (v) { return isObservationPrompt(v, d + 1); });
    if (typeof value !== 'object') return false;
    return Object.keys(value).some(function (k) { return isObservationPrompt(value[k], d + 1); });
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, maxCast: cfg.maxCast, maxSlices: cfg.maxSlices,
      requireAction: cfg.requireAction, requireMicroScene: cfg.requireMicroScene,
      marker: MARKER, microScenePattern: String(MICRO_SCENE_RE),
      states: { perceived: '感知成立', silent: '无声同处', 'co-present': '同在未证' },
      semantics: '唯一主体 / 感知需动作证据 / 微场景白名单 / 切片只读不入知识' };
  }
  function resetStat() {
    stat.slices = 0; stat.perceived = 0; stat.coPresent = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }

  WA.observeSlice = {
    getSettings: settings, setSettings: saveSettings, view: view,
    slice: slice, extractAnchor: extractAnchor, isMicroScene: isMicroScene,
    actionProvesPerception: actionProvesPerception, isObservationPrompt: isObservationPrompt,
    stat: function () { return JSON.parse(JSON.stringify(stat)); }, resetStat: resetStat,
    MARKER: MARKER,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/observe-slice.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'observeSlice 已加载（2.230.0）');
})();