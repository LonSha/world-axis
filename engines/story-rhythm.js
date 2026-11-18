/**
 * WorldAxis engines/story-rhythm.js (v2.524.0) — OPV28-31 ~ OPV28-36
 *   叙事节奏六件：重复叙述 / 信息释放节奏 / 视角一致 / 语气一致 /
 *   选项同质化 / 伏笔回收率
 *
 * ── 它治的病 ─────────────────────────────────────────────────────
 *   世界变丰富之后，**正文本身反而容易变懒**：
 *     · 同一个事实连着三轮被复述一遍（读起来像卡带）；
 *     · 一次把三条新事实全抖完，悬念当场用尽；
 *     · NPC 说了他不可能知道的话（与连续性闸同源，这里管**台词**）；
 *     · 走向每楼自由发挥，五轮之内情绪翻三次；
 *     · 三个选项其实一个选项（后果一样），玩家却在认真挑；
 *     · 埋了没收的伏笔越攒越多，谁也不再提。
 *
 * ── 纪律（每条都有判据咬）────────────────────────────────────────
 *   ① 重复只**量**不删：给出重复度并建议降级，正文由调用方改写。
 *   ② 一次只给「够用」的量：单轮新事实 ≤ 上限，其余**延后**（`deferred`），不丢。
 *   ③ 台词越界一律 `leak`（与 `continuity-guard.knowledge` 同一口径，不另立标准）。
 *   ④ 语气看现场有没有 `storyTone`：没有就说 `available:false`，不假装判过。
 *   ⑤ 选项同质化按**后果差集**判定：差集为空就 `too-few`，并说清「其实只有一个」。
 *   ⑥ 回收率只报**账上**的：埋几条、收几条、放弃几条且为什么，不美化。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const VERSION = '2.524.0';
  const LS_KEY = 'worldaxis_storyrhythm_settings_v1';
  const DEF = { enabled: true, maxRepeat: 60, maxFactsPerRound: 3, recentRounds: 3, toneJump: 2 };
  const __REG = { key: LS_KEY, def: DEF, module: 'storyRhythm',
    bounds: { maxRepeat: [20, 100], maxFactsPerRound: [1, 8], recentRounds: [1, 10], toneJump: [1, 5] } };
  const stat = { repeats: 0, releases: 0, pov: 0, tones: 0, options: 0, payback: 0, refused: 0, lastReason: '' };
  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {}));
  }
  if (WA.settingsBus) WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  function draft() { try { return WA.store && WA.store.get ? (WA.store.get() || {}) : {}; } catch (e) { return {}; } }
  function rows() { const d = draft(); return Array.isArray(d.chronicle) ? d.chronicle : []; }
  function refuse(reason, extra) { stat.refused++; stat.lastReason = reason; return Object.assign({ ok: false, reason: reason }, extra || {}); }
  function clean(v, n) { return typeof v === 'string' ? v.slice(0, n || 80) : ''; }
  function bigrams(t) {
    const out = {};
    const s = String(t || '').replace(/\s+/g, '');
    for (let i = 0; i < s.length - 1; i++) out[s.slice(i, i + 2)] = true;
    return out;
  }
  function overlap(a, b) {
    const A = bigrams(a), B = bigrams(b);
    const ka = Object.keys(A);
    if (!ka.length) return 0;
    let hit = 0;
    ka.forEach(function (k) { if (B[k]) hit++; });
    return Math.round(hit * 100 / ka.length);
  }

  /** OPV28-31 重复叙述检测：给出重复度，重复时建议降级（不删正文）。 */
  function repetition(text) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const t = clean(text, 400);
    if (!t) return refuse('missing-fields', { field: 'text' });
    const recent = rows().slice(-cfg.recentRounds * 6).filter(function (x) { return x && (x.text || x.what); });
    let best = 0, bestRef = '';
    recent.forEach(function (x) {
      const s = overlap(t, x.text || x.what);
      if (s > best) { best = s; bestRef = clean(x.id, 40); }
    });
    stat.repeats++;
    const repeated = best >= cfg.maxRepeat;
    return { ok: true, reason: 'ok', ratio: best, threshold: cfg.maxRepeat, repeated: repeated,
      against: bestRef, degrade: repeated,
      line: repeated ? ('和 ' + (bestRef || '前文') + ' 重复了 ' + best + '%：这段该换个说法或换成推进')
        : ('重复度 ' + best + '%，可以照写') };
  }

  /** OPV28-32 信息释放节奏：单轮新事实 ≤ 上限，其余延后不丢。 */
  function release(facts) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const arr = Array.isArray(facts) ? facts.filter(function (x) { return !!x; }) : [];
    if (!arr.length) return refuse('missing-fields', { field: 'facts' });
    const now = arr.slice(0, cfg.maxFactsPerRound);
    const later = arr.slice(cfg.maxFactsPerRound);
    let queue = [];
    try { const d = draft(); queue = Array.isArray(d.factQueue) ? d.factQueue.slice() : []; } catch (e) { queue = []; }
    const next = queue.concat(later).slice(0, 40);
    try {
      if (WA.store && WA.store.transact) WA.store.transact(function (d) { d.factQueue = next; return true; }, 'rhythm:release');
    } catch (e) { /* 排队失败不伪造 */ }
    stat.releases++;
    return { ok: true, reason: 'ok', released: now, deferred: later.length, cap: cfg.maxFactsPerRound,
      backlog: next.length,
      note: later.length ? ('这一轮只给 ' + now.length + ' 条，剩下 ' + later.length + ' 条延后（悬念不被一次抖完）') : '这一轮的量为上限内' };
  }

  /** OPV28-33 视角一致：台词不许说出他不知道的事（与连续性闸同标准）。 */
  function pov(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const who = clean(s.who, 40);
    const line = clean(s.text || s.line, 200);
    if (!who) return refuse('missing-fields', { field: 'who' });
    if (!line) return refuse('missing-fields', { field: 'text' });
    const facts = Array.isArray(s.facts) ? s.facts.filter(function (x) { return typeof x === 'string'; }) : [];
    const bad = [];
    facts.forEach(function (f) {
      const hit = line.indexOf(f) >= 0;
      if (!hit) return;
      let okToSay = false;
      try {
        if (WA.continuityGuard && WA.continuityGuard.knowledge) {
          const k = WA.continuityGuard.knowledge({ who: who, fact: f, present: s.present === true, heard: s.heard === true });
          okToSay = !!(k && k.ok);
        }
      } catch (e) { okToSay = false; }
      if (!okToSay) bad.push(f);
    });
    if (bad.length) return refuse('leak', { who: who, facts: bad.slice(0, 4),
      why: '这句台词提到了他不可能知道的事' });
    stat.pov++;
    return { ok: true, reason: 'ok', who: who, checked: facts.length, line: line };
  }

  /** OPV28-34 语气一致：看现场有没有 story-tone，没有就不假装判过。 */
  function tone(spec) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const s = spec && typeof spec === 'object' ? spec : {};
    const dir = Number.isFinite(s.direction) ? s.direction : null;
    if (dir === null) return refuse('missing-fields', { field: 'direction' });
    // v2.529.0: 此处曾探测 `storyTone.current` / `storyTone.view`——两个成员从来不存在
    //   （story-tone 的真实读面只有 `get()`），于是 has 恒为 false：装了 story-tone 也照样说
    //   「现场没有 story-tone」，是一条假判据。改为探真实成员 get。
    const has = !!(WA.storyTone && typeof WA.storyTone.get === 'function');
    if (!has) return { ok: true, reason: 'ok', available: false, abrupt: false,
      line: '现场没有 story-tone：语气一致这一条此刻判不了，不假装判过' };
    const d = draft();
    const hist = Array.isArray(d.toneTrail) ? d.toneTrail.slice() : [];
    hist.push(dir);
    while (hist.length > cfg.recentRounds) hist.shift();
    const avg = hist.reduce(function (n, x) { return n + x; }, 0) / hist.length;
    const abrupt = Math.abs(dir - avg) > cfg.toneJump && hist.length >= cfg.recentRounds;
    try {
      if (WA.store && WA.store.transact) WA.store.transact(function (dd) { dd.toneTrail = hist; return true; }, 'rhythm:tone');
    } catch (e) { /* 记不下就少一条历史 */ }
    stat.tones++;
    return { ok: true, reason: 'ok', available: true, direction: dir, avg: Math.round(avg * 100) / 100, abrupt: abrupt,
      line: abrupt ? ('走向突变：这一条 ' + dir + '，近几轮平均 ' + Math.round(avg * 100) / 100 + ' —— 该给个转折的理由') : '走向与近几轮一致' };
  }

  /** OPV28-35 选项同质化：按后果差集判定。 */
  function options(list) {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const arr = Array.isArray(list) ? list : [];
    if (arr.length < 2) return refuse('too-few', { count: arr.length, why: '少于两个就不叫选项' });
    const sigs = arr.map(function (o) {
      const x = o && typeof o === 'object' ? o : { text: String(o || '') };
      const cons = x.consequence !== undefined ? x.consequence : (x.costs || x.effect || x.after || '');
      return { text: clean(x.text || x.title, 50), sig: JSON.stringify(cons) };
    });
    const distinct = {};
    sigs.forEach(function (s) { distinct[s.sig] = true; });
    const uniq = Object.keys(distinct).length;
    stat.options++;
    if (uniq === 1) return refuse('too-few', { count: arr.length, distinct: uniq,
      why: '三个选项的后果完全一样 —— 这其实是一个选项', texts: sigs.map(function (s) { return s.text; }) });
    return { ok: true, reason: 'ok', count: arr.length, distinct: uniq,
      options: sigs, note: uniq < arr.length ? ('有 ' + (arr.length - uniq) + ' 个选项的后果与别人重合，可以合并或改写') : '每个选项都有不同的后果' };
  }

  /** OPV28-36 伏笔回收率：埋几条、收几条、放弃几条且为什么。 */
  function payback() {
    const cfg = settings();
    if (!cfg.enabled) return refuse('disabled');
    const d = draft();
    let planted = 0, paid = 0, abandoned = 0;
    const abandonedWhy = [];
    const chr = rows();
    chr.forEach(function (x) {
      if (!x) return;
      if (x.kind === 'foreshadow' || x.kind === 'sprout') {
        planted++;
        if (x.paidAt || x.paid === true) paid++;
        else if (x.droppedAt || x.stage === '噪点') {
          abandoned++;
          abandonedWhy.push({ id: clean(x.id, 40), why: clean(x.dropReason || '没给理由', 60) });
        }
      }
    });
    const open = planted - paid - abandoned;
    const rate = planted ? Math.round(paid * 100 / planted) : 0;
    stat.payback++;
    return { ok: true, reason: 'ok', planted: planted, paid: paid, abandoned: abandoned, open: open,
      rate: rate, abandonedWhy: abandonedWhy.slice(0, 6),
      line: planted ? ('埋了 ' + planted + ' 条，收了 ' + paid + ' 条（' + rate + '%），放弃 ' + abandoned + ' 条，还开着 ' + open + ' 条')
        : '账上还没有埋下的伏笔（回收率无从谈起）' };
  }

  function view() {
    return { enabled: settings().enabled, stat: Object.assign({}, stat) };
  }

  WA.storyRhythm = {
    getSettings: settings,
    setSettings: function (p) { return WA.settingsBus ? WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, settings(), p || {}))) : { ok: false, reason: 'no-settings-bus' }; },
    repetition: repetition, release: release, pov: pov, tone: tone, options: options, payback: payback,
    view: view, stat: function () { return Object.assign({}, stat); }
  };
  if (WA.registerModule) WA.registerModule('engines/story-rhythm.js', { kind: 'engine', ver: VERSION });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/story-rhythm 已加载（' + VERSION + '）');
})();