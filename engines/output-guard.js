/**
 * WorldAxis engines/output-guard.js (v2.250.0) — OG-1 伪造玩家发言拦截
 *
 * ── 它治什么（本仓唯一一处「代玩家说话」没有人管）──────────────────
 *   `purifier` 剥格式、`healthPreflight` 查技术标签、`personaAnchor` 查性格漂移、
 *   `antiOmniscience` 查越界知情 —— 全都只看**角色侧**。
 *   而正文里最容易撒谎的位置恰恰在**玩家侧**：
 *     「你点点头说『那就这么办』」—— 玩家其实什么都没说；
 *     「你笑道『我早就想去了』」—— 上一轮玩家只回了「嗯」。
 *   玩家一读觉得别扭，却很难指认哪里不对（他也记不清自己说没说），于是这类伪造长期存活。
 *   托管推进本身合法（AVG 式自动过场），问题只在于**假引述冒充真引述**。
 *
 * ── 判据（三层，全部只用文本，不读文件、不碰 store 以外的输入）────
 *   ① 抽取：从正文里抠出「说话人标记 + 引号内容」的句子（标记表见 SPEAK_MARKS）；
 *   ② 核对：引号内容与**近期玩家发言**做字符二元组重合度比对（`threshold` 以下算未命中）；
 *      玩家发言里出现过的，判 `verified`；找不到的，判 `fabricated`；
 *   ③ 判定：`block` 档把 fabricated 的句子退回改写建议；`warn` 档只记账。
 *
 * ── 八条否定式边界（承重，一条都不许松）────────────────────────────
 *   ① 不碰没引号的句子。玩家旁白（「你推门进来」）**不判**——那本来就是叙述，不是引述。
 *   ② 只判「玩家说话标记 + 引号」的组合。角色说「你」的时候（「他说：你走吧」）不会被误判。
 *   ③ 短引述（`minQuoteLen` 字以下）**放行**：「嗯」「好」这类重合度天然失真。
 *   ④ 只在 `lookback` 条玩家发言内找。找得越远越像「圆回来」，与「引述」不是一回事。
 *   ⑤ 悬浮引述：正文里同一句既可能被上一轮玩家说过、也可能没有 ⇒ 命中即 `verified`，不重复计分。
 *   ⑥ 阈值可调（`threshold` 0.2–1）。调到 1 是「逐字相同才算真」。
 *   ⑦ `strict` 开着时 fabricated 一句即 `ok:false`；关着时只有全句伪造才拦
 *      —— 「一句半是编的」在长篇里正常，不该整段退回。
 *   ⑧ 本模块**不改正文**（无 purifier 式写回），只出裁定与改写建议：
 *      退回去改是人的决定，静默改写会让玩家连「模型编过」这件事都不知道。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_output_guard_settings_v1';
  const DEF = {
    enabled: true,
    mode: 'warn',            // warn=只记账 / block=判 ok:false 并给改写建议
    threshold: 0.5,          // 字符二元组重合度下限（低于即未命中）
    minQuoteLen: 3,          // 引述短于此长度放行
    lookback: 6,             // 只在最近几条玩家发言里找
    strict: false,           // 一句伪造即拦
    maxReport: 8             // 报告最多列几条
  };
  const __REG = { key: LS_KEY, def: DEF, module: 'outputGuard', enums: { mode: ['warn', 'block'] }, bounds: { threshold: [0.2, 1], minQuoteLen: [1, 12], lookback: [1, 20], maxReport: [1, 20] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    const merged = Object.assign({}, DEF, raw || {});
    if (WA.settingsBus && WA.settingsBus.normalize) return WA.settingsBus.normalize(__REG, merged);
    return merged;
  }
  function saveSettings(next) {
    const merged = Object.assign({}, settings(), next || {});
    if (!WA.settingsBus || !WA.settingsBus.saveOrThrow) return { ok: false, reason: 'no-bus' };
    try { return { ok: true, settings: WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, merged)) }; }
    catch (e) { return { ok: false, reason: 'save-failed', detail: e && e.message }; }
  }

  // 玩家说话标记（**只收指向玩家第二人称的**；「他说」「她说」指向角色，不在本表）
  const SPEAK_MARKS = ['你说', '你笑', '你问', '你答', '你喊', '你叫', '你低声道', '你小声道', '你大声道', '你开口', '你回', '你嘟囔', '你咕哝', '你喃喃', '你应道', '你补了一句'];
  const QUOTE_OPEN = ['「', '“', '"', '『'];
  const QUOTE_CLOSE = { '「': '」', '“': '”', '"': '"', '『': '』' };
  const stat = { checked: 0, quotes: 0, verified: 0, fabricated: 0, blocked: 0, faults: {} };
  function noteFault(r) { stat.faults[r] = (stat.faults[r] || 0) + 1; }
  function norm(s) { return String(s || '').replace(/[\s，。、！？；：,.!?;:…—～~「」“”『』"']/g, ''); }

  /** 字符二元组集合（中文短句上比「整串子串」稳：一字之差不会全盘不命中） */
  function bigrams(s) {
    const t = norm(s);
    const out = {};
    for (let i = 0; i < t.length - 1; i++) out[t.slice(i, i + 2)] = 1;
    if (t.length === 1) out[t] = 1;
    return Object.keys(out);
  }

  /** 重合度：引述的二元组有多少比例在玩家发言里出现过（分母取引述侧，不被长发言虚抬） */
  function overlap(quote, haystacks) {
    const qg = bigrams(quote);
    if (!qg.length) return 0;
    const hay = bigrams(haystacks.join('\n'));
    if (!hay.length) return 0;
    const set = {};
    hay.forEach(function (g) { set[g] = 1; });
    let hit = 0;
    qg.forEach(function (g) { if (set[g]) hit++; });
    return hit / qg.length;
  }

  /**
   * 从正文里抽「玩家说话 + 引号内容」。
   * 返回 [{ mark, quote, at }]。**不抽没引号的句子**（旁白不判）。
   */
  function extract(text) {
    const src = String(text || '');
    const out = [];
    const re = /(你[^\s，。！？；：,\.!\?;:]{0,6})([「“『"])/g;
    let m;
    while ((m = re.exec(src))) {
      const mark = m[1];
      const open = m[2];
      const close = QUOTE_CLOSE[open];
      const startQ = m.index + m[0].length;
      const endQ = src.indexOf(close, startQ);
      if (endQ < 0) continue;
      const quote = src.slice(startQ, endQ).trim();
      // 标记必须是本表里的词或至少带「你」+ 说话动词（防「你的「」」这类误抽）
      const known = SPEAK_MARKS.some(function (k) { return mark === k || mark.indexOf(k) === 0; });
      // 兜底：标记里**含**说话动作即可，不要求动词紧跟「你」。中文极常写
      //   「你点点头说」「你愣了一下才开口」—— 要求相邻会把最常见的说法全丢掉，
      //   而丢掉的后果是「抽不出来 ⇒ 不判 ⇒ 伪造反被放过」（放水的方向）。
      if (!known && !/你[^\s]{0,6}(说|问|答|喊|叫|道|笑|开口|回|应|嘟囔|咕哝|喃喃|补)/.test(mark)) continue;
      out.push({ mark: mark, quote: quote, at: m.index });
    }
    return out;
  }

  /**
   * 核对一段生成正文里对玩家的引述。
   * @param {string} text 生成的正文
   * @param {string[]} userMessages 近期玩家发言（新的在末尾；顺序不敏感）
   * @returns {{ok:boolean, mode:string, quotes:number, fabricated:object[], suggestions:string[], reason?:string}}
   */
  function check(text, userMessages) {
    const cfg = settings();
    const out = { ok: true, mode: cfg.mode, quotes: 0, verified: 0, fabricated: [], suggestions: [] };
    if (!cfg.enabled) { out.reason = 'disabled'; return out; }
    const body = String(text || '');
    if (!body) { out.reason = 'empty-text'; return out; }
    stat.checked++;

    const hay = (Array.isArray(userMessages) ? userMessages : [])
      .filter(function (x) { return typeof x === 'string' && x; })
      .slice(-Math.max(1, cfg.lookback));
    const found = extract(body);
    if (!found.length) { out.reason = 'no-user-quote'; return out; }

    found.forEach(function (it) {
      if (norm(it.quote).length < cfg.minQuoteLen) return;   // 短引述放行
      out.quotes++;
      stat.quotes++;
      if (!hay.length) { stat.fabricated++; out.fabricated.push({ mark: it.mark, quote: it.quote, overlap: 0, why: 'no-user-message' }); return; }
      const score = overlap(it.quote, hay);
      if (score >= cfg.threshold) { out.verified++; stat.verified++; return; }
      stat.fabricated++;
      out.fabricated.push({ mark: it.mark, quote: it.quote, overlap: Math.round(score * 1000) / 1000, why: 'not-in-recent-user-messages' });
    });

    if (!out.quotes) { out.reason = 'all-quotes-too-short'; return out; }
    if (!out.fabricated.length) { out.reason = 'all-verified'; return out; }

    out.fabricated.slice(0, cfg.maxReport).forEach(function (f) {
      out.suggestions.push('「' + f.mark + '「' + f.quote + '」」在近 ' + cfg.lookback + ' 条玩家发言里没找到（重合 ' + Math.round(f.overlap * 100) + '%）—— 要么改成旁白（不提说什么），要么让玩家先说。');
    });

    const allFake = out.fabricated.length >= out.quotes;
    if (cfg.mode === 'block' && (cfg.strict || allFake)) { out.ok = false; stat.blocked++; out.reason = 'fabricated-user-quote'; }
    else out.reason = 'fabricated-user-quote';
    return out;
  }

  /** 只读：把最近一次裁定交出去（诊断/面板用；本模块不落 store） */
  let __last = null;
  function checkAndRemember(text, userMessages) {
    const r = check(text, userMessages);
    __last = { at: Date.now(), mode: r.mode, quotes: r.quotes, fabricated: r.fabricated.length, reason: r.reason };
    return r;
  }

  function read() {
    const cfg = settings();
    return {
      enabled: cfg.enabled, mode: cfg.mode, threshold: cfg.threshold,
      minQuoteLen: cfg.minQuoteLen, lookback: cfg.lookback, strict: cfg.strict,
      last: __last ? Object.assign({}, __last) : null,
      marks: SPEAK_MARKS.slice()
    };
  }

  /** 注入块：把判据口径写给模型看（正文不在这时候生成，只能提前立规矩） */
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const lines = [];
    lines.push('[代玩家说话的规矩]');
    lines.push('可以托管推进（写玩家做了什么、走过去、坐下），但**引述玩家说过的话必须真说过**。');
    lines.push('近 ' + cfg.lookback + ' 条玩家发言里没有的内容，别写成「你说『……』」——改成旁白，或让玩家自己开口。');
    if (cfg.mode === 'block') lines.push('当前为拦停档：伪造的引述会被退回。');
    lines.push('口径：写「你推门进来」不算伪造；写「你说『我早想去了』」而玩家只回了「嗯」才算。');
    return lines.join('\n') + '\n';
  }

  WA.outputGuard = {
    getSettings: settings,
    setSettings: function (patch) { const r = saveSettings(patch); return r.ok ? r.settings : r; },
    check: check, checkAndRemember: checkAndRemember, extract: extract,
    overlap: overlap, read: read, buildBlock: buildBlock,
    SPEAK_MARKS: SPEAK_MARKS.slice(),
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };

  if (typeof WA.registerModule === 'function') WA.registerModule('engines/output-guard.js', { kind: 'engine', ver: '2.250.0' });
  if (WA.log) WA.log('info', 'engines/output-guard 已加载（2.250.0）');
})();