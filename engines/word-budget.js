/**
 * WorldAxis engines/word-budget.js (v2.130.0) — 字数闭环（缝 B2）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓对正文长度只有 `maxTokens` 一个**上限**，没有下限。模型写短了、
 *   写半句就收尾，全库无一处会发现——用户看到的是「这一楼怎么这么短」，
 *   而世界状态照常结算（等于把一次没写完的推演当成写完的收了）。
 *
 *   缝合来源：st-theater —— 原文口径是「核字数，九成为判断线，不足则续写」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `count(text)` —— 数正文的**有效字数**（剥掉结构标签与空白，纯函数）；
 *   ② `verdict(text)` —— 答「够不够」：`shortfall` / `null`（放行），
 *      判断线取目标的 **九成**（不是十成——那会把“略短”也判成不合格）；
 *   ③ `stat()` —— 记几个数（核了几次、判过几次）。
 *
 *   ② 是**闸门**不是**续写器**：本模块不调 API、不续写，只回答
 *   「这段该不该就这样收」。续写由调用方决定。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `verdict` 一律放行（不因关开关而把正文判成不合格）。
 *   2 **九成线是显式的**：`threshold = target * ratio`（`ratio` 默认 0.9，
 *      可设但上界锁 1）——不允许把“略短”与“差一半”判成同一档。
 *   3 `count` **剥标签不剥内容**：剥 `<!-- -->` 注释、围栏标记与首尾空白，
 *      但**不**剥正文里的标点与换行（标点也是正文）。
 *   4 中英文一起算：中文按**字符**、连续的拉丁数字按**词**——两套口径分开记，
 *      不混成一个数（混了之后“500 字”在英文卡上会得出完全不同的结论）。
 *   5 目标为 0 / 未设时**不判**（返回 `null`）：没定标准就没有不合格。
 *   6 非字符串入参拒收（`bad-type`），不当作空串（那会让所有调用点都变成“太短”）。
 *   7 不写 store、不进 `SOURCES`：它是一次**文本度量**，不是世界状态。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_wordbudget_settings_v1';
  const DEF = { enabled: false, targetChars: 800, ratio: 0.9 };
  const __REG = { key: LS_KEY, def: DEF, module: 'wordBudget', bounds: { targetChars: [0, 20000], ratio: [0.1, 1] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const m = WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
    if (m.ratio > 1) m.ratio = 1;
    return m;
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { counts: 0, verdicts: 0, short: 0, pass: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }

  /**
   * 数有效字数。剥注释与围栏标记，**不剥正文标点**（边界 3）。
   * @returns {chars, cjk, words, total} —— total = cjk + words（两套口径分开记）
   */
  function count(text) {
    stat.counts++;
    if (text === undefined || text === null) { noteFault('empty-text'); return { chars: 0, cjk: 0, words: 0, total: 0, reason: 'empty-text' }; }
    if (typeof text !== 'string') { noteFault('bad-type'); return { chars: 0, cjk: 0, words: 0, total: 0, reason: 'bad-type' }; }
    const body = text.replace(/<!--[\s\S]*?-->/g, '').replace(/```/g, '').trim();
    const chars = body.replace(/\s+/g, '').length;
    const cjk = (body.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
    const words = (body.match(/[A-Za-z0-9]+/g) || []).length;
    return { chars: chars, cjk: cjk, words: words, total: cjk + words };
  }

  /**
   * 判断线闸门。返回 `null` = 放行；非 null = 拒收体（`shortfall`）。
   */
  function verdict(text) {
    stat.verdicts++;
    if (text === undefined || text === null) { noteFault('empty-text'); return { ok: false, reason: 'empty-text' }; }
    if (typeof text !== 'string') { noteFault('bad-type'); return { ok: false, reason: 'bad-type' }; }
    const cfg = settings();
    if (!cfg.enabled) return null;
    if (!(cfg.targetChars > 0)) return null;                      // 没定标准就不判（边界 5）
    const c = count(text);
    const line = Math.floor(cfg.targetChars * cfg.ratio);
    if (c.total >= line) { stat.pass++; stat.lastReason = 'pass'; return null; }
    stat.short++; stat.lastReason = 'shortfall';
    const ratio = cfg.targetChars ? (c.total / cfg.targetChars) : 0;
    return { ok: false, reason: 'shortfall', total: c.total, cjk: c.cjk, words: c.words,
      target: cfg.targetChars, line: line, reached: Math.round(ratio * 100) / 100,
      detail: '正文 ' + c.total + ' 字（目标 ' + cfg.targetChars + '，判断线 ' + line + '）——不足九成，建议续写后再落地' };
  }

  WA.wordBudget = {
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    count: count, verdict: verdict,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/word-budget.js', { kind: 'engine', ver: '2.130.0' });
})();
