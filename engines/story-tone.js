/**
 * WorldAxis engines/story-tone.js (v2.130.0) — 按角色的剧情倾向档（缝 C2）
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   本仓的长期走向由 `engines/life.js` 的 `goals` 推：但 `life.goals` 只有
 *   单格 `goal.next`，且不区分「命运往哪边倾」。用户想告诉模型的「这本戏
 *   要走温暖向好、不要老往悲剧里推」这类**总体倾向**，全库零实现。
 *   结果是：模型每楼都“合理”，连起来却是一本走向不受控的书。
 *
 *   缝合来源：ST-SevenDaysCal 的「路线倾向」设置——原文口径是「命运走向
 *   分档，存于角色级，每轮注进上下文」。
 *
 * ── 本模块只做三件事，每件一个硬条件 ─────────────────────────
 *   ① `set(person, tone)` —— 把某个角色（或全局 `*`）的倾向档写进世界状态；
 *   ② `get(person)` —— 读该角色的**生效档**（角色级优先于全局）；
 *   ③ `buildBlock()` —— 把当前生效的档写成一段注入文本（受两个闸：总开关与源开关）。
 *
 * ── 边界（全是否定式）────────────────────────────────────────
 *   1 总开关默认关闭。关闭时 `buildBlock()` 返回空串（零 token 占用）。
 *   2 档位是**有限枚举**（`natural` 自然发展 / `warm` 温暖向好 / `conflict` 冲突增强
 *      / `tragic` 悲剧倾向）。写档位时给枚举外的值一律拒收（`bad-value`）——
 *      静默回落会让用户以为设了自己要的档。
 *   3 **倾向是约束不是剧透**：`buildBlock` 只报档位与它的含义，
 *      绝不写出「接下来会发生什么」（那会把「倾向」变成「预告」）。
 *   4 写路径全走 `store.transact`（受权限闸与“授权在变更之前”约束）；
 *      行数组写后接 `evict.array`（站点 `storyTone.rows`）——无挤出登记就是无限膨胀。
 *   5 同人重复设档是**覆盖不是追加**（同一个人只有一档）；但同时保留
 *      “什么时候谁改成了什么”的最近记录供面板查。
 *   6 `natural` 是**默认值也是可显式设的值**，但它与「没设过」不同：
 *      `get` 会带 `explicit:true/false` 区分两者（否则面板无法区分“用户选的”与“引擎默认的”）。
 *   7 不参与数值结算：本模块不加减任何好感 / 命运值，只注入一段文字约束。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const LS_KEY = 'worldaxis_storytone_settings_v1';
  const TONES = ['natural', 'warm', 'conflict', 'tragic'];
  const TONE_LABEL = { natural: '自然发展', warm: '温暖向好', conflict: '冲突增强', tragic: '悲剧倾向' };
  const TONE_LINE = {
    natural: '不预设倾向：该暖的时候暖、该狠的时候狠，怎么合理就怎么走。',
    warm: '总体倾向偏向温暖：冲突要有，但走向不得滑向无情与绝望；留出和解、共处与转机。',
    conflict: '总体倾向偏向冲突：矛盾要真、代价要付，允许愈演愈烈，不得提前和稀泥。',
    tragic: '总体倾向偏向悲剧：好事不反悔，代价不可逆，允许失去与错过成为主调。'
  };
  const DEF = { enabled: false, maxRows: 64 };
  const __REG = { key: LS_KEY, def: DEF, module: 'storyTone', bounds: { maxRows: [4, 256] } };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  const stat = { sets: 0, reads: 0, blocks: 0, blocked: 0, lastReason: '', faults: {} };
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.blocked++; stat.lastReason = reason; }
  function clean(v, max) { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }

  function bucket(draft) {
    if (!draft.storyTone || typeof draft.storyTone !== 'object' || Array.isArray(draft.storyTone)) draft.storyTone = { rows: [], seq: 0 };
    const b = draft.storyTone;
    if (!Array.isArray(b.rows)) b.rows = [];
    if (typeof b.seq !== 'number') b.seq = 0;
    return b;
  }
  function rows() {
    const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    return (s.storyTone && Array.isArray(s.storyTone.rows)) ? s.storyTone.rows : [];
  }
  function keyOf(person) { const k = clean(person, 60); return k || '*'; }
  function findRow(k) { const rs = rows(); for (let i = 0; i < rs.length; i++) if (rs[i] && rs[i].person === k) return rs[i]; return null; }

  /** 设档。person 省略即全局（`*`）。 */
  function set(person, tone) {
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const k = keyOf(person);
    const t = clean(tone, 20).toLowerCase();
    if (TONES.indexOf(t) < 0) { noteFault('bad-value'); return { ok: false, reason: 'bad-value', known: TONES.slice() }; }
    let hit = false;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      const i = b.rows.map(function (x) { return x && x.person; }).indexOf(k);
      const row = { person: k, tone: t, at: clockNow('storyTone') };
      if (i >= 0) b.rows[i] = row; else b.rows.push(row);
      b.seq++;
      if (WA.evict) WA.evict.array(b.rows, 'storyTone.rows', settings().maxRows);
      hit = true;
      return true;
    }, 'storyTone:set') : null;
    if (!hit || !r || r.ok !== true) { noteFault('store-unavailable'); return { ok: false, reason: 'store-unavailable' }; }
    stat.sets++; stat.lastReason = t;
    return { ok: true, person: k, tone: t, label: TONE_LABEL[t] };
  }

  /** 读生效档：角色级优先于全局；都没设则回落 natural（`explicit:false`）。 */
  function get(person) {
    stat.reads++;
    const k = keyOf(person);
    const own = findRow(k);
    if (own) return { person: k, tone: own.tone, label: TONE_LABEL[own.tone], explicit: true, from: 'person' };
    const g = findRow('*');
    if (g && k !== '*') return { person: k, tone: g.tone, label: TONE_LABEL[g.tone], explicit: true, from: 'global' };
    return { person: k, tone: 'natural', label: TONE_LABEL.natural, explicit: false, from: 'default' };
  }

  function clear(person) {
    const k = keyOf(person);
    let found = false;
    const r = (WA.store && WA.store.transact) ? WA.store.transact(function (d) {
      const b = bucket(d);
      const i = b.rows.map(function (x) { return x && x.person; }).indexOf(k);
      if (i < 0) return false;
      b.rows.splice(i, 1); found = true; return true;
    }, 'storyTone:clear') : null;
    if (!found || !r || r.ok !== true) { noteFault('not-found'); return { ok: false, reason: 'not-found', person: k }; }
    return { ok: true, person: k };
  }

  /** 只列已经**显式**设过的档（不把默认值当作已设）。 */
  function list() {
    return rows().map(function (r) { return { person: r.person, tone: r.tone, label: TONE_LABEL[r.tone] || r.tone, at: r.at }; });
  }

  function buildBlock() {
    const cfg = settings();
    if (!cfg.enabled) { stat.blocked++; stat.lastReason = 'disabled'; return ''; }
    const ls = list();
    if (!ls.length) return '';
    const lines = ls.map(function (r) {
      const who = r.person === '*' ? '全体' : r.person;
      return '· ' + who + '：' + r.label + ' —— ' + (TONE_LINE[r.tone] || '');
    });
    stat.blocks++; stat.lastReason = 'issued';
    return '[剧情倾向] 下列走向倾向已由用户设定，长线推演**不得偏离**（没列的按自然发展）：\n'
      + lines.join('\n')
      + '\n倾向是方向不是预告：只约束「往哪边走」，不得据此提前写出尚未发生的情节。\n';
  }

  WA.storyTone = {
    TONES: TONES.slice(), LABELS: Object.assign({}, TONE_LABEL),
    getSettings: settings,
    setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    set: set, get: get, clear: clear, list: list, buildBlock: buildBlock,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/story-tone.js', { kind: 'engine', ver: '2.130.0' });
})();
