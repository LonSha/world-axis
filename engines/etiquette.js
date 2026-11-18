/**
 * WorldAxis engines/etiquette.js (v2.524.0) — EXV29-05 忌讳与失礼
 *
 * ── 它治什么（缺口，开工前先看现场）────────────────────────────────
 *   现场读数：`忌讳|禁忌` 命中 15 文件，但**全是"禁止做某事"的静默过滤**——
 *   踩了要么被拦下（拒收），要么干脆没发生。而真实世界里踩忌讳是有**后果**的：
 *   对方变了脸色、桌上安静下来、这顿饭吃不成了。缺的不是"禁止表"，是"失礼的代价"。
 *
 * ── 机制（一句说完）────────────────────────────────────────────────
 *   按**场合**（乡野 / 城里 / 庙堂 / 军中 / 江湖）各有一份忌讳表：
 *   `breach({who,act,scope})` 判这次有没有踩到，踩到就回**后果**（`cool` 场面冷一冷 /
 *   `changed` 对方变了脸色 / `break` 当场翻脸），并回**是哪一条忌讳**（可归因）。
 *   `learn()` 让"不知者"从别人的反应里学到——学到之后再见这条忌讳，判据会如实说"他知道"。
 *
 * ── 缝合边界（否定式，每条都有判据咬）─────────────────────────────
 *   ① 不是报错：踩了忌讳 `ok:true`（事情照样发生了），**后果**才是判据；没踩也 `ok:true`。
 *   ② 后果必可归因：`hit:true` 一定带 `taboo`（哪一条）与 `line`（当场的样子），空串必红。
 *   ③ 不知者可以学到：`learn` 之前 `knewIt:false`，之后同一条 `knewIt:true`（不改后果强度，只改"知不知道"）。
 *   ④ 没这个场合不猜：`scope` 不在表里 ⇒ `bad-scope`（不按"乡野"默认硬套）；
 *      后果档写错 ⇒ `bad-tier`。两者都是**成功面已登记的拒收码**，不新增面分类。
 *   ⑤ 有界：`etiquette` 最多 64 条自定义/已学；`etiquetteHits` 最近 16 次。
 *   ⑥ 只给后果不给台词：本模块**不写正文**，只回一句"场面变成什么样"，措辞由叙事层决定。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const CUSTOM_KEY = 'etiquette';
  const HITS_KEY = 'etiquetteHits';
  const CAP = 64;
  const HIT_CAP = 16;
  const SCOPES = ['乡野', '城里', '庙堂', '军中', '江湖'];
  const SEV = ['cool', 'changed', 'break'];
  const SEV_CN = { cool: '场面冷一冷', changed: '对方变了脸色', break: '当场翻脸' };
  const TABLE = {
    乡野: [
      { act: '踩门槛', severity: 'cool', why: '门槛是家的界，踩了是压人一头', line: '屋里的话头停了一瞬，老人才接着往下说。' },
      { act: '筷子插饭', severity: 'changed', why: '那是给死人的摆法', line: '对面的人把碗往旁边挪了挪，脸沉下来了。' },
      { act: '夜里吹口哨', severity: 'changed', why: '招不该来的东西', line: '有人低低骂了一句，屋里几个都不作声了。' },
      { act: '把鱼翻过来', severity: 'break', why: '船家的大忌，翻鱼就是翻船', line: '船老大的筷子"啪"地压在桌上：这顿饭到此为止。' }
    ],
    城里: [
      { act: '当众问月钱', severity: 'changed', why: '当众问进项等于当众扒衣裳', line: '他笑还在，眼睛里那点热没了。' },
      { act: '替人拂袖', severity: 'cool', why: '替人整衣裳是长辈或仆役的事', line: '他把袖子抽回去，客气了一句就转身。' }
    ],
    庙堂: [
      { act: '越次进言', severity: 'break', why: '越过品级说话，是当众打上官的脸', line: '堂上一下子静得能听见呼吸，执事的手已经抬起来了。' },
      { act: '直视上官', severity: 'changed', why: '目光压人，礼数上是犯上', line: '上官把茶盏搁下，慢慢抬眼看你，不说话。' }
    ],
    军中: [
      { act: '饮酒误更', severity: 'break', why: '误更就是拿全营的命赌', line: '军法官站起来："拿下。"' },
      { act: '提家乡', severity: 'changed', why: '营里不许说家乡，说了就有人跑', line: '旁边老兵低声一句："别说了。"' }
    ],
    江湖: [
      { act: '打听人根脚', severity: 'changed', why: '问根脚就是问人短处', line: '对方把杯子扣了，抬手叫结账。' },
      { act: '白吃白喝', severity: 'break', why: '吃江湖的饭要还江湖的情', line: '掌柜的挡在门口，几个跑堂的围了上来。' }
    ]
  };
  const stat = { breached: 0, hit: 0, missed: 0, learned: 0, badInput: 0 };
  let shadow = null;

  function refuse(code, extra) {
    stat.badInput++;
    return Object.assign({ ok: false, reason: code }, extra || {});
  }
  function readCustom() {
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      const m = all[CUSTOM_KEY];
      return (m && typeof m === 'object' && !Array.isArray(m)) ? m : (shadow || {});
    } catch (e) { return shadow || {}; }
  }
  function writeCustom(m) {
    try {
      if (!WA.store || !WA.store.transact) { shadow = m; return false; }
      WA.store.transact(function (d) { d[CUSTOM_KEY] = m; return true; }, 'etiquette:custom');
      return true;
    } catch (e) { shadow = m; return false; }
  }
  function readHits() {
    try {
      const all = WA.store && typeof WA.store.get === 'function' ? (WA.store.get() || {}) : {};
      const h = all[HITS_KEY];
      return Array.isArray(h) ? h : [];
    } catch (e) { return []; }
  }
  function pushHit(row) {
    const h = readHits();
    h.push(row);
    while (h.length > HIT_CAP) h.shift();
    try {
      if (WA.store && WA.store.transact) WA.store.transact(function (d) { d[HITS_KEY] = h; return true; }, 'etiquette:hit');
    } catch (e) { /* 留痕失败不影响判据 */ }
    return h;
  }
  function clean(v, max) {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s.slice(0, max || 24);
  }
  function nowAt() {
    try { return (function () { try { return WA.clock.now('etiquette'); } catch (e) { return Date.now(); } })(); }
    catch (e) { return Date.now(); }
  }
  function capIt(m) {
    const ks = Object.keys(m);
    if (ks.length <= CAP) return m;
    ks.sort(function (a, b) { return (m[a].at || 0) - (m[b].at || 0); });
    ks.slice(0, ks.length - CAP).forEach(function (k) { delete m[k]; });
    return m;
  }

  /** 内置表 + 自定义表合并查一条忌讳。 */
  function findTaboo(scope, act) {
    const a = clean(act, 24);
    const built = (TABLE[scope] || []).filter(function (t) { return t.act === a; })[0];
    if (built) return built;
    const c = readCustom()['c|' + scope + '|' + a];
    return c ? { act: c.act, severity: c.severity, why: c.why, line: c.line } : null;
  }

  /** 加一条自定义忌讳（某个场合的某件事，后果多严重，为什么）。 */
  function register(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const scope = clean(src.scope, 12);
    const act = clean(src.act, 24);
    const severity = clean(src.severity, 12);
    const missing = [];
    if (!scope) missing.push('scope');
    if (!act) missing.push('act');
    if (missing.length) return refuse('missing-fields', { missing: missing });
    if (SCOPES.indexOf(scope) < 0) return refuse('bad-scope', { field: 'scope', got: scope, allowed: SCOPES.slice() });
    if (SEV.indexOf(severity) < 0) return refuse('bad-tier', { field: 'severity', got: severity, allowed: SEV.slice() });
    const m = readCustom();
    const k = 'c|' + scope + '|' + act;
    const existed = !!m[k];
    m[k] = { scope: scope, act: act, severity: severity,
      why: clean(src.why, 60) || '（未写明缘由）',
      line: clean(src.line, 80) || (SEV_CN[severity] + '。'),
      at: nowAt() };
    writeCustom(capIt(m));
    return { ok: true, reason: 'ok', scope: scope, act: act, severity: severity, severityCN: SEV_CN[severity],
      created: !existed, note: existed ? '这条忌讳已存在：本次覆盖后果与缘由' : '忌讳已加进这个场合的表' };
  }

  /** 判一次：`who` 在 `scope` 场合做了 `act`。踩了给后果，没踩什么都不发生。 */
  function breach(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const who = clean(src.who, 24) || '无名';
    const act = clean(src.act, 24);
    const scope = clean(src.scope, 12);
    const missing = [];
    if (!act) missing.push('act');
    if (!scope) missing.push('scope');
    if (missing.length) return refuse('missing-fields', { missing: missing });
    if (SCOPES.indexOf(scope) < 0) return refuse('bad-scope', { field: 'scope', got: scope, allowed: SCOPES.slice() });
    stat.breached++;
    const t = findTaboo(scope, act);
    if (!t) {
      stat.missed++;
      return { ok: true, reason: 'ok', hit: false, who: who, act: act, scope: scope,
        note: '这个场合没有这条忌讳：事情照常发生，什么都没变' };
    }
    const learned = !!readCustom()['l|' + who + '|' + scope + '|' + act];
    stat.hit++;
    pushHit({ who: who, act: act, scope: scope, severity: t.severity, at: nowAt() });
    return {
      ok: true, reason: 'ok', hit: true, who: who, act: act, scope: scope,
      taboo: t.act, severity: t.severity, severityCN: SEV_CN[t.severity],
      why: t.why, line: t.line, knewIt: learned,
      note: (learned ? '他知道这犯了忌讳，还是做了：' : '他不知道，踩了：') + SEV_CN[t.severity]
    };
  }

  /** 从别人的反应里学到一条忌讳（不知道 → 知道；不改后果强度，只改 `knewIt`）。 */
  function learn(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const who = clean(src.who, 24);
    const act = clean(src.act, 24);
    const scope = clean(src.scope, 12);
    const missing = [];
    if (!who) missing.push('who');
    if (!act) missing.push('act');
    if (!scope) missing.push('scope');
    if (missing.length) return refuse('missing-fields', { missing: missing });
    if (SCOPES.indexOf(scope) < 0) return refuse('bad-scope', { field: 'scope', got: scope, allowed: SCOPES.slice() });
    const t = findTaboo(scope, act);
    if (!t) return { ok: false, reason: 'not-happened', who: who, act: act, scope: scope, note: '这个场合本来就没这条忌讳：学不到东西' };
    const m = readCustom();
    const k = 'l|' + who + '|' + scope + '|' + act;
    const existed = !!m[k];
    m[k] = { who: who, scope: scope, act: act, at: nowAt() };
    writeCustom(capIt(m));
    stat.learned++;
    return { ok: true, reason: 'ok', who: who, act: act, scope: scope, severity: t.severity, created: !existed,
      note: existed ? '这条他已经知道' : '他从别人的反应里学到了：' + t.why };
  }

  function knows(o) {
    const src = (o && typeof o === 'object') ? o : {};
    const who = clean(src.who, 24);
    const act = clean(src.act, 24);
    const scope = clean(src.scope, 12);
    if (!who || !act || !scope) return refuse('missing-fields', { missing: [!who ? 'who' : null, !act ? 'act' : null, !scope ? 'scope' : null].filter(Boolean) });
    const t = findTaboo(scope, act);
    if (!t) return { ok: false, reason: 'not-happened', note: '这个场合没有这条忌讳' };
    return { ok: true, reason: 'ok', who: who, act: act, scope: scope, knows: !!readCustom()['l|' + who + '|' + scope + '|' + act] };
  }

  function recent() {
    const h = readHits();
    if (!h.length) return { ok: true, reason: 'ok', empty: true, rows: [] };
    return { ok: true, reason: 'ok', empty: false, rows: h.slice().reverse().slice(0, 6), total: h.length, cap: HIT_CAP };
  }

  function table(scope) {
    const s = clean(scope, 12);
    if (s && SCOPES.indexOf(s) < 0) return refuse('bad-scope', { field: 'scope', got: s, allowed: SCOPES.slice() });
    const out = {};
    SCOPES.forEach(function (sc) {
      if (s && sc !== s) return;
      out[sc] = (TABLE[sc] || []).map(function (t) { return { act: t.act, severity: t.severity, why: t.why }; });
    });
    return { ok: true, reason: 'ok', scopes: s ? [s] : SCOPES.slice(), table: out };
  }

  function statOf() { return Object.assign({}, stat); }
  /** 注入面：只有在"刚有人踩了忌讳、且后果不小"时才说话（cool 级不占 token）。 */
  function buildBlock() {
    const r = recent();
    if (r.empty) return '';
    const top = r.rows.filter(function (x) { return x.severity !== 'cool'; })[0];
    if (!top) return '';
    return '【失礼】' + top.who + '在' + top.scope + '犯了「' + top.act + '」（' + SEV_CN[top.severity] + '）：这口气还没过去。';
  }

  WA.etiquette = {
    SCOPES: SCOPES.slice(), SEV: SEV.slice(), SEV_CN: Object.assign({}, SEV_CN),
    CAP: CAP, HIT_CAP: HIT_CAP,
    register: register, breach: breach, learn: learn, knows: knows,
    recent: recent, table: table, buildBlock: buildBlock, stat: statOf
  };
})();