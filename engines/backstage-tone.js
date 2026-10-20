/* backstage-tone.js —— 题材·口吻·笔记·时辰引擎（WA.backstageTone）
 *
 * 治什么：世界的调子不能被单楼反噬。
 *   - 通讯生态：按正则加权判定本世界的题材底色（现代/历史/科幻/低技术/超自然），
 *     让通信方式（手机/信鸽/通讯器）不串味。
 *   - 口吻守卫：识别社交提示词式口吻，检出越界口吻（与角色人设不符）。
 *   - 社区笔记：楼内众口相传的短笔记，有上限、去重、不覆盖主叙事。
 *   - 传统时辰：十二时辰与刻（一刻 15 分钟），中文数字解析。
 *
 * 缝合来源：world-backstage（communication-ecology.js、communication-voice-guard.js、
 *   community-note.js、traditional-time.js）
 *
 * 与邻座分工：chrono/calendar 管时间轴与服务年历，story-tone 管叙事语气；
 *   backstage 只管「这个世界用什么方式说话、什么声音算越界、碎评论怎么收、时辰怎么报」。
 *
 * 边界（否定式）：
 *   1. 题材判定只给分数与排序，不作最终裁决；分差不足时给 tie，不硬拗。
 *   2. 口吻守卫只标记，不改写正文。
 *   3. 社区笔记不覆盖他人笔记，同 id 不进（dup-id）。
 *   4. 时辰换算不涉闰月、不涉节气（那些是 calendar 的事）。
 *   5. 一刻固定 15 分钟（上游常数），不随朝代变。
 *   6. 中文数字只解 0-99 区间，超大数按 bad-num 拒。
 *   7. 不联网、不外部词表，一切正则在仓内声明。
 *   8. 不写正文、不占注入块的正文位（只出标签行）。
 *   9. 不代替 story-tone 做整体语气裁决。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** v2.230.0：决策时间统一出口（裸调 Date.now 会绕过冻结，回放对不上时只能全库通读）。 */
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_backstage_tone_settings_v1';
  const DEF = { enabled: false, maxNotes: 48, voiceGuard: true, strictVoice: false };
  const __REG = { key: LS_KEY, def: DEF, module: 'backstageTone',
    bounds: { maxNotes: [8, 256] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  const ERAS = ['modern', 'historical', 'scifi', 'lowtech', 'supernatural'];
  const ERA_LABEL = { modern: '现代', historical: '历史', scifi: '科幻', lowtech: '低技术', supernatural: '超自然' };
  const SCORE_RULES = [
    { era: 'modern', w: 2, re: /手机|微信|快递|外卖|地铁|电梯|驾照|信号|充电|短信|通话|直播|视频/ },
    { era: 'modern', w: 1, re: /奶茶|便利店|物业|楼盘|群聊|朋友圈/ },
    { era: 'historical', w: 2, re: /圣旨|衙门|奏折|将军|妾室|老爷|知府|朝堂|太监|太爷|里正/ },
    { era: 'historical', w: 1, re: /轿子|祖宅|祠堂|绸缎|私塾|绣楼/ },
    { era: 'scifi', w: 2, re: /机甲|星舰|神经链接|飞船|殖民地|量子|义体|能量护盾|虫洞|母炋/ },
    { era: 'scifi', w: 1, re: /终端|数据流|全息|接口|基因调制/ },
    { era: 'lowtech', w: 2, re: /信鸽|驿站|狼烟|牛车|水井|煤油灯|挑担|山寨/ },
    { era: 'lowtech', w: 1, re: /烛台|磨坊|油灯|扁担|土灶/ },
    { era: 'supernatural', w: 2, re: /法力|灵宝|诅咒|妖气|灵气|阴阳眼|天师|符箓|魇|鬼魅/ },
    { era: 'supernatural', w: 1, re: /神庙|香火|巫祝|天命|转世/ }
  ];
  const TIE_MARGIN = 2;
  const VOICE_OPEN_TAG = '<world_backstage_character_voice>';
  const SOCIAL_HINTS = ['作为AI', '作为ai', 'as an ai', '我是一个语言模型', '以下是我', '好的，我', '首先，我'];
  const NOTE_KINDS = ['gossip', 'rumor', 'fact', 'milestone', 'warning'];
  const NOTE_KIND_LABEL = { gossip: '闲聊', rumor: '流言', fact: '事实', milestone: '里程碑', warning: '警戒' };
  const QUARTER_MINUTES = 15;
  const SHICHEN = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
  const SHICHEN_FULL = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时'];
  const ZH_DIGITS = { '〇': 0, '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  const stat = { era: 0, ties: 0, voice: 0, flagged: 0, notes: 0, times: 0, refused: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function refuse(reason) { stat.refused++; noteFault(reason); return { ok: false, reason: reason }; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 120) : String(v == null ? '' : v).slice(0, max || 120); }
  function state() { return (WA.store && WA.store.get) ? (WA.store.get() || {}) : {}; }
  function bucket(draft) {
    const r = draft || state();
    if (!r.backstageTone || typeof r.backstageTone !== 'object' || Array.isArray(r.backstageTone)) r.backstageTone = { notes: [] };
    if (!Array.isArray(r.backstageTone.notes)) r.backstageTone.notes = [];
    return r.backstageTone;
  }
  function notes() { return bucket().notes; }
  /** 题材判定：加权求和。分差不足 TIE_MARGIN 时给 tie（不硬拗）。 */
  function era(text) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const raw = String(text == null ? '' : text);
    if (!raw.trim()) return refuse('empty-text');
    const scores = {};
    ERAS.forEach(function (e) { scores[e] = 0; });
    const hits = {};
    SCORE_RULES.forEach(function (r) {
      const m = raw.match(new RegExp(r.re.source, 'g'));
      if (m && m.length) { scores[r.era] += r.w * m.length; if (!hits[r.era]) hits[r.era] = []; hits[r.era].push(m[0]); }
    });
    const ranked = ERAS.map(function (e) { return { era: e, score: scores[e] }; }).sort(function (a, b) { return b.score - a.score; });
    const top = ranked[0], total = ranked.reduce(function (n, x) { return n + x.score; }, 0);
    if (total === 0) { stat.ties++; return { ok: true, reason: 'tie', era: null, tie: true, scores: scores, ranked: ranked, hits: hits }; }
    const tie = ranked.length > 1 && (top.score - ranked[1].score) < TIE_MARGIN;
    if (tie) stat.ties++;
    stat.era++;
    return { ok: true, reason: tie ? 'tie' : 'ok', era: top.era, eraLabel: ERA_LABEL[top.era],
      score: top.score, total: total, tie: tie, second: ranked[1] ? ranked[1].era : null,
      scores: scores, ranked: ranked, hits: hits };
  }
  /** 口吻守卫：找社交提示词式越界口吻。只标记，不改写。 */
  function voiceCheck(text, opts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    if (!cfg.voiceGuard) return refuse('guard-off');
    const raw = String(text == null ? '' : text);
    if (!raw.trim()) return refuse('empty-text');
    const o = opts || {};
    const need = Array.isArray(o.need) ? o.need.slice() : [];
    const flagged = [];
    SOCIAL_HINTS.forEach(function (h) { if (raw.indexOf(h) >= 0) flagged.push({ kind: 'social', hit: h }); });
    const wired = (raw.match(new RegExp(VOICE_OPEN_TAG.replace(/[<>\/]/g, '\\$&'), 'g')) || []).length;
    if (!wired && o.requireTag) flagged.push({ kind: 'missing-tag', hit: VOICE_OPEN_TAG });
    need.forEach(function (k) { if (raw.indexOf(k) < 0) flagged.push({ kind: 'missing-required', hit: k }); });
    stat.voice++;
    if (flagged.length) stat.flagged += flagged.length;
    const strict = cfg.strictVoice;
    return { ok: !(strict && flagged.length), reason: flagged.length ? 'flagged' : 'ok',
      flagged: flagged, count: flagged.length, hasTag: wired > 0, tag: VOICE_OPEN_TAG, required: need, strict: strict };
  }
  function socialHint(text) { const raw = String(text == null ? '' : text); return SOCIAL_HINTS.filter(function (h) { return raw.indexOf(h) >= 0; }); }
  /** 社区笔记：入册（同 id 不进）。不覆盖他人笔记。 */
  function noteAdd(rec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const r = rec && typeof rec === 'object' ? rec : {};
    const body = clean(r.body || r.text, 200);
    if (!body) return refuse('empty-body');
    const id = clean(r.id, 40) || ('nt_' + (WA.rand && WA.rand.id ? WA.rand.id('', 6, 'id') : String(clockNow('backstageTone'))));
    if (notes().filter(function (n) { return n && n.id === id; })[0]) return refuse('dup-id');
    const kind = NOTE_KINDS.indexOf(clean(r.kind, 20)) >= 0 ? clean(r.kind, 20) : 'gossip';
    const row = { id: id, kind: kind, body: body, who: clean(r.who, 40), at: clean(r.at, 40) || null, ts: clockNow('backstageTone') };
    let out = null;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const capped = b.notes.length + 1 > cfg.maxNotes ? b.notes.slice(b.notes.length + 1 - cfg.maxNotes) : b.notes;
      b.notes = (WA.evict && WA.evict.array ? WA.evict.array(capped.concat([row]), 'backstageTone.notes') : capped.concat([row]));
      out = { ok: true, reason: 'ok', id: id, kind: kind, kindLabel: NOTE_KIND_LABEL[kind] };
      return true;
    }, 'backstageTone:noteAdd');
    if (out && out.ok) stat.notes++;
    return out || refuse('tx-failed');
  }
  function noteList(opts) {
    const o = opts || {};
    const k = clean(o.kind, 20);
    const list = k ? notes().filter(function (n) { return n && n.kind === k; }) : notes();
    return { ok: true, reason: 'ok', count: list.length, notes: list.slice(-24) };
  }
  function noteClear(kind) {
    const k = clean(kind, 20);
    let removed = 0;
    WA.store.transact(function (draft) {
      const b = bucket(draft);
      const before = b.notes.length;
      b.notes = k ? b.notes.filter(function (n) { return n && n.kind !== k; }) : [];
      removed = before - b.notes.length;
      return true;
    }, 'backstageTone:noteClear');
    return { ok: true, reason: 'ok', removed: removed };
  }
  /** 中文数字解析（0-99）。超大或不可解按 bad-num 拒。 */
  function zhNum(text) {
    const s = clean(text, 20);
    if (!s) return { ok: false, reason: 'bad-num' };
    if (/^[0-9]+$/.test(s)) {
      const n = parseInt(s, 10);
      return n <= 99 ? { ok: true, reason: 'ok', value: n } : { ok: false, reason: 'bad-num' };
    }
    let total = 0, cur = 0, any = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '十') { cur = (cur === 0 ? 1 : cur) * 10; total += cur; cur = 0; any = true; continue; }
      if (Object.prototype.hasOwnProperty.call(ZH_DIGITS, c)) { cur = ZH_DIGITS[c]; any = true; continue; }
      return { ok: false, reason: 'bad-num' };
    }
    const v = total + cur;
    if (!any || v > 99) return { ok: false, reason: 'bad-num' };
    return { ok: true, reason: 'ok', value: v };
  }
  /** 时辰换算：h 0-23。返回时辰名与刻（一刻 15 分钟）。 */
  function shichen(h, m) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const hh = Math.floor(Number(h)), mm = Math.floor(Number(m) || 0);
    if (!Number.isFinite(hh) || hh < 0 || hh > 23) return refuse('bad-hour');
    if (!Number.isFinite(mm) || mm < 0 || mm > 59) return refuse('bad-minute');
    const idx = Math.floor(((hh + 1) % 24) / 2);
    const minutesInto = ((hh % 2 === 1 ? mm : mm + 60) % 120);
    const quarter = Math.floor(minutesInto / QUARTER_MINUTES) + 1;
    stat.times++;
    return { ok: true, reason: 'ok', hour: hh, minute: mm, index: idx,
      name: SHICHEN[idx], full: SHICHEN_FULL[idx], quarter: quarter,
      label: SHICHEN_FULL[idx] + (quarter > 1 ? ' 第' + numToZh(quarter) + '刻' : ' 初刻'), quarterMinutes: QUARTER_MINUTES };
  }
  function numToZh(n) {
    if (n <= 10) return ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][n];
    if (n < 20) return '十' + ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][n - 10];
    const t = Math.floor(n / 10), r = n % 10;
    return ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][t] + '十' + (r ? ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][r] : '');
  }
  /** 时辰反向：'子时' → 23 点起。 */
  function parseShichen(text, quarterText) {
    const s = clean(text, 10).replace(/时$/, '');
    const idx = SHICHEN.indexOf(s);
    if (idx < 0) return refuse('bad-shichen');
    const q = quarterText == null ? 1 : (zhNum(quarterText).ok ? zhNum(quarterText).value : 1);
    const qq = Math.min(Math.max(1, q), 8);
    const startHour = (idx * 2 + 23) % 24;
    const addMin = (qq - 1) * QUARTER_MINUTES;
    const totalMin = (startHour * 60 + addMin) % 1440;
    return { ok: true, reason: 'ok', index: idx, full: SHICHEN_FULL[idx], quarter: qq,
      hour: Math.floor(totalMin / 60), minute: totalMin % 60 };
  }
  function view() {
    const cfg = settings();
    return { enabled: cfg.enabled, voiceGuard: cfg.voiceGuard, strictVoice: cfg.strictVoice, maxNotes: cfg.maxNotes,
      eras: ERAS.slice(), noteKinds: NOTE_KINDS.slice(), rules: SCORE_RULES.length, quarters: QUARTER_MINUTES, shichen: SHICHEN.slice() };
  }
  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) return '';
    const ns = notes();
    const e = ERA_LABEL;
    return ['【幕后风物】', '· 题材底色：' + ERAS.map(function (x) { return e[x]; }).join('/') + '（以当前场景用词为准）']
      .concat(ns.length ? ['· 众口：' + ns.slice(-8).map(function (n) { return NOTE_KIND_LABEL[n.kind] + '「' + n.body + '」'; }).join('；')] : [])
      .join('\n');
  }
  function reset() {
    stat.era = 0; stat.ties = 0; stat.voice = 0; stat.flagged = 0; stat.notes = 0; stat.times = 0;
    stat.refused = 0; stat.blocked = 0; stat.lastReason = ''; stat.faults = {};
    return { ok: true };
  }
  WA.backstageTone = {
    getSettings: settings, setSettings: saveSettings, view: view,
    era: era, voiceCheck: voiceCheck, socialHint: socialHint,
    noteAdd: noteAdd, noteList: noteList, noteClear: noteClear,
    zhNum: zhNum, numToZh: numToZh, shichen: shichen, parseShichen: parseShichen,
    buildBlock: buildBlock, stat: function () { return JSON.parse(JSON.stringify(stat)); }, reset: reset,
    ERAS: ERAS, ERA_LABEL: ERA_LABEL, SCORE_RULES: SCORE_RULES, TIE_MARGIN: TIE_MARGIN,
    VOICE_OPEN_TAG: VOICE_OPEN_TAG, SOCIAL_HINTS: SOCIAL_HINTS,
    NOTE_KINDS: NOTE_KINDS, NOTE_KIND_LABEL: NOTE_KIND_LABEL,
    QUARTER_MINUTES: QUARTER_MINUTES, SHICHEN: SHICHEN, SHICHEN_FULL: SHICHEN_FULL,
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/backstage-tone.js', { kind: 'engine', ver: '2.230.0' });
  if (WA.log) WA.log('info', 'backstageTone 已加载（2.230.0）');
})();
