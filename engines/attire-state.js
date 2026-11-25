/**
 * WorldAxis engines/attire-state.js (v2.583.0) — 服装穿着状态机
 *
 * ── 它治什么（缺口，开工前实测）──────────────────────────────────────
 *   全仓 `衣摆` / `褶皱` / `贴合度` / `整洁度` / `换装` / `衣橱` / `穿着状态` 均 **0 命中**；
 *   `开合` 与 `袖口` 在 engines/ 与 render/ 里同样 **0 命中**（只在 docs/plans 出现过）。
 *   已有的两个邻域引擎都不是它：
 *     · `gear-wear.js` 管**武器装备**的耐久（pristine→dull→cracked→shattered）；
 *     · `sartorial-regalia.js` 管**制度性穿着**的僭越与城门识别；
 *     · `appearance.js` 管「这人出场该写多细」（分级 × 覆盖核验），不管「衣服现在什么样」。
 *   于是「这人坐着时衣摆堆在右腿边、袖口扰到小臂、肩头沾了雨」这类**连续状态**
 *   此前无刻度：模型每段各写一套，读起来像每幕都换了新衣。
 *
 * ── 缝合来源与取舍（《五官构建》Layer3「服装高级生成引擎」，R254 缝合批）──
 *   缝入（能落成「登记→核验→拒收」的）：
 *     ① 状态机六键（开合/袖口/衣摆/褶皱/贴合度/整洁度）与各自枚举；
 *     ② **变更必须有因**：无 cause 的 update 拒收（材料「禁止角色在没有动作或环境变化时
 *        衣服自行改变」）；
 *     ③ 连续性锁：只有换装/脱换/洗浴/时间跳跃/剧情给衣/天气剧变才允许新服装；
 *     ④ 视角裁剪：按视角给出「该写哪几处」；且裁剪**只减正文重复，不改已建立状态**；
 *     ⑤ 风格防漂移：换衣服可以，主色系与版型习惯必须有继承。
 *   不缝：配色美学/材质搭配的**正面词库**、款式词表、「先判为什么穿」的创作推理——
 *     这些是创作层，留给预设（沿 R50 取舍口径）。
 *
 * ── 边界（全是否定式）───────────────────────
 *   1 不碰 store：整套服装与状态由调用方给，本模块只在内存记「最近建立的那一套」，
 *     与 gear-wear / sartorial-regalia 同型；清理靠 reset。
 *   2 不替写任何描写，只回答「此刻这套衣服是什么状态、能不能换、这一视角该写哪几处」。
 *   3 不拿设备墙钟：at 由调用方给（故事时间），缺 at 时只记 0，不编造。
 *   4 总开关默认**开启**（DEF.enabled）。关闭时写路径返回 reason:'disabled' 且不记账，
 *      buildBlock 返回空串（零 token）。拒收一律带码，不抛错。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_attire_state_settings_v1';
  const DEF = { enabled: true, maxRows: 24 };
  const __REG = { key: LS_KEY, def: DEF, module: 'attireState', bounds: { maxRows: [4, 64] } };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {}));
    } catch (e) { return Object.assign({}, DEF); }
  }
  function saveSettings(next) {
    if (!WA.settingsBus) return { ok: true };
    try { return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {}))); }
    catch (e) { return { ok: false, reason: 'save-failed' }; }
  }

  const stat = { establishes: 0, updates: 0, refusals: 0, changes: 0, lastReason: '', faults: {} };
  let __block = null;
  Object.defineProperty(stat, 'block', {
    enumerable: true, configurable: true,
    get: function () { return __block ? JSON.parse(JSON.stringify(__block)) : null; },
    set: function (v) { __block = v || null; }
  });
  function noteFault(reason) { stat.faults[reason] = (stat.faults[reason] || 0) + 1; stat.refusals++; }

  function str(v, max) {
    const s = String(v == null ? '' : v).trim();
    const m = Number(max) > 0 ? Number(max) : 40;
    return s.length > m ? s.slice(0, m) : s;
  }

  // ── 状态机六键：键名固定，值必须在该键的枚举里 ────────────────────────
  //   为什么是枚举而不是自由文本：自由文本没法核验。材料里这六个键本来写的就是闭集
  //   （「扣紧/半开/敞开」这类），落成枚举不是收窄，是把原本就存在的边界写死。
  const STATE_KEYS = ['closure', 'cuffs', 'hem', 'wrinkles', 'fit', 'cleanliness'];
  const STATE_LABELS = {
    closure: '开合', cuffs: '袖口', hem: '衣摆',
    wrinkles: '褶皱', fit: '贴合度', cleanliness: '整洁度'
  };
  const STATE_VALUES = {
    closure: ['firm', 'half', 'open'],
    cuffs: ['down', 'rolled', 'pushed', 'carried'],
    hem: ['hanging', 'swaying', 'lifted', 'pressed', 'wet', 'dusty'],
    wrinkles: ['none', 'crosswise', 'crease', 'tension', 'settled'],
    fit: ['loose', 'natural', 'taut', 'settled'],
    cleanliness: ['new', 'daily', 'slight-mess', 'rain-worn', 'long-activity']
  };
  const STATE_VALUE_LABELS = {
    closure: { firm: '扣紧', half: '半开', open: '敞开' },
    cuffs: { down: '放下', rolled: '挽起', pushed: '推至小臂', carried: '被动作带动' },
    hem: { hanging: '垂落', swaying: '摆动', lifted: '被风撅起', pressed: '被坐姿压住', wet: '沾水', dusty: '沾尘' },
    wrinkles: { none: '无', crosswise: '横向褶皱', crease: '折痕', tension: '拉紧', settled: '局部压痕' },
    fit: { loose: '宽松', natural: '自然贴合', taut: '暂时绷紧', settled: '回落' },
    cleanliness: { new: '新衣', daily: '日常', 'slight-mess': '轻微凌乱', 'rain-worn': '受雨受风', 'long-activity': '久活动后' }
  };

  // ── 变更原因白名单：无因的 update 一律拒收 ──────────────────────────
  //   材料原话：「禁止角色在没有动作或环境变化时衣服自行改变」。
  //   这里是这条禁令的**唯一**落点：state 只在 update 里变，update 必须有 cause。
  const CAUSE_KINDS = ['action', 'env', 'posture', 'time'];

  // ── 换装的合法理由（连续性锁）：不在这六条里的换装一律拒收 ──────────
  const CHANGE_REASONS = ['wardrobe-change', 'undress', 'bath', 'time-skip', 'plot-gift', 'weather-shift'];
  const CHANGE_REASON_LABELS = {
    'wardrobe-change': '明确换装', undress: '脱换', bath: '回家/洗浴后更衣',
    'time-skip': '足够长的时间跳跃', 'plot-gift': '剧情给了新衣', 'weather-shift': '天气/活动要求换装'
  };

  // ── 视角 → 该写哪几处（材料「视角裁剪」表，一条不多一条不少）────────
  const VIEWS = ['front', 'side', 'back', 'seated', 'moving', 'close'];
  const VIEW_PARTS = {
    front: ['领口', '前襟', '主色', '上装', '腰线', '下装前侧', '鞋面'],
    side: ['肩线', '腰部轮廓', '衣摆', '裤腿/裙摆侧面'],
    back: ['后领', '肩背', '外套后摆', '背部装饰'],
    seated: ['衣摆', '腰腹褶皱', '裤腿/裙摆堆叠', '鞋履位置'],
    moving: ['最明显的动态衣物'],
    close: ['材质', '针脚', '纽扣', '纹样', '磨损']
  };
  const VIEW_LABELS = { front: '正面', side: '侧面', back: '背面', seated: '坐姿', moving: '运动中', close: '近距离' };

  // 内存表：who -> 一套服装（与 sartorial-regalia 的 WORN / gear-wear 的内存台账同型）
  const WARDROBE = {};
  const ORDER = [];
  const MAX_ROWS = 48;

  function rowOf(who) { return WARDROBE[who] || null; }
  function alive() {
    // 谁最后被改动谁算新——与 appearance 的 pickRows 同一口径（按 at 新→旧）。
    return ORDER.filter(function (w) { return !!WARDROBE[w]; }).slice();
  }
  function clipRows() {
    while (ORDER.length > MAX_ROWS) {
      const dead = ORDER.shift();
      if (dead) delete WARDROBE[dead];
    }
  }
  function normState(raw) {
    // 只收白名单键与枚举值；未知键/未知值返回带 out 的拒收（不静默吞掉）。
    const out = {};
    const bad = [];
    const src = raw && typeof raw === 'object' ? raw : {};
    Object.keys(src).forEach(function (k) {
      if (STATE_KEYS.indexOf(k) < 0) { bad.push({ key: k, why: 'bad-state-key' }); return; }
      const v = String(src[k] == null ? '' : src[k]);
      if (STATE_VALUES[k].indexOf(v) < 0) { bad.push({ key: k, why: 'bad-state-value', got: v }); return; }
      out[k] = v;
    });
    return { state: out, bad: bad };
  }
  function clone(o) { return o ? JSON.parse(JSON.stringify(o)) : null; }

  /**
   * 建立整套服装。items/palette/memory 由调用方给（本模块不生成衣饰内容）。
   * @param {{who, scene, items, palette, material, memory, outfitStyle, state, at}} spec
   * @returns {{ok, reason?, who?, reused?}}
   */
  function establish(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    const who = str(s.who, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const prev = rowOf(who);
    // 已有一套时，establish 等于「换装」：必须带那条六理由之一，否则是连续性锁拒收。
    if (prev) {
      const why = str(s.reason, 32);
      if (CHANGE_REASONS.indexOf(why) < 0) {
        noteFault('continuity-lock');
        return { ok: false, reason: 'continuity-lock', who: who, known: CHANGE_REASONS.slice(), got: why };
      }
    }
    const ns = normState(s.state);
    if (ns.bad.length) {
      noteFault(ns.bad[0].why);
      return { ok: false, reason: ns.bad[0].why, who: who, bad: ns.bad };
    }
    const row = {
      who: who,
      scene: str(s.scene, 40),
      items: s.items && typeof s.items === 'object' ? clone(s.items) : {},
      palette: s.palette && typeof s.palette === 'object' ? clone(s.palette) : {},
      material: str(s.material, 40),
      memory: str(s.memory, 60),
      outfitStyle: str(s.outfitStyle, 24),
      state: Object.assign({}, DEF_STATE(), ns.state),
      at: Number(s.at) > 0 ? Number(s.at) : 0,
      changes: prev ? (prev.changes || 0) + 1 : 0
    };
    if (!row.items || !Object.keys(row.items).length) {
      // 没有主件就谈不上「整套服装」——只报字段缺，不造一份空衣服。
      noteFault('missing-fields');
      return { ok: false, reason: 'missing-fields', who: who, field: 'items' };
    }
    // 风格防漂移：同一个人换衣时，主色系/版型习惯必须有继承（材料第八条）。
    if (prev) {
      const sameColor = row.palette && prev.palette && row.palette.main && row.palette.main === prev.palette.main;
      const sameStyle = !!row.outfitStyle && row.outfitStyle === prev.outfitStyle;
      if (!sameColor && !sameStyle && (prev.palette && prev.palette.main) && (row.palette && row.palette.main)) {
        noteFault('style-drift');
        return { ok: false, reason: 'style-drift', who: who,
          prevMain: prev.palette.main, nextMain: row.palette.main };
      }
    }
    WARDROBE[who] = row;
    if (ORDER.indexOf(who) >= 0) ORDER.splice(ORDER.indexOf(who), 1);
    ORDER.push(who);
    clipRows();
    stat.establishes++;
    if (prev) stat.changes++;
    stat.lastReason = prev ? 'changed' : 'established';
    return { ok: true, who: who, reused: !!prev, changes: row.changes };
  }

  /** 全新一套的默认状态：材料「穿着状态初始化」的落点（整洁=新衣，其余取中性档）。 */
  function DEF_STATE() {
    return { closure: 'firm', cuffs: 'down', hem: 'hanging', wrinkles: 'none', fit: 'natural', cleanliness: 'new' };
  }

  /**
   * 更新穿着状态。**必须带 cause**（action / env / posture / time）；
   * 无 cause 拒收 no-cause —— 这是「衣服不会自己变」的唯一执行点。
   */
  function update(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    const who = str(s.who, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const row = rowOf(who);
    if (!row) { noteFault('unknown'); return { ok: false, reason: 'unknown', who: who }; }
    const cause = str(s.cause, 24);
    const kind = str(s.kind, 16);
    if (!cause) { noteFault('no-cause'); return { ok: false, reason: 'no-cause', who: who }; }
    if (CAUSE_KINDS.indexOf(kind) < 0) {
      noteFault('bad-cause-kind');
      return { ok: false, reason: 'bad-cause-kind', who: who, known: CAUSE_KINDS.slice(), got: kind };
    }
    const ns = normState(s.state);
    if (!Object.keys(ns.state).length && !ns.bad.length) {
      noteFault('missing-fields'); return { ok: false, reason: 'missing-fields', who: who, field: 'state' };
    }
    if (ns.bad.length) {
      noteFault(ns.bad[0].why);
      return { ok: false, reason: ns.bad[0].why, who: who, bad: ns.bad };
    }
    const before = clone(row.state);
    Object.assign(row.state, ns.state);
    row.at = Number(s.at) > 0 ? Number(s.at) : row.at;
    row.lastCause = { kind: kind, text: cause, at: row.at };
    stat.updates++;
    stat.lastReason = 'updated';
    return { ok: true, who: who, before: before, after: clone(row.state), cause: row.lastCause };
  }

  /** 只读：此刻这套衣服的状态与整套构成。 */
  function read(who) {
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    const w = str(who, 40);
    if (!w) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const row = rowOf(w);
    if (!row) { noteFault('unknown'); return { ok: false, reason: 'unknown', who: who }; }
    return {
      ok: true, who: row.who, scene: row.scene, at: row.at,
      items: clone(row.items), palette: clone(row.palette),
      material: row.material, memory: row.memory, outfitStyle: row.outfitStyle,
      state: clone(row.state), stateText: stateText(row.state),
      lastCause: clone(row.lastCause) || null, changes: row.changes,
      reason: 'applied'
    };
  }

  /** 状态 → 一行中文（注入与面板共用的唯一措辞源）。 */
  function stateText(st) {
    const s = st || {};
    const parts = [];
    STATE_KEYS.forEach(function (k) {
      const v = s[k];
      if (!v) return;
      const lb = STATE_VALUE_LABELS[k] && STATE_VALUE_LABELS[k][v];
      if (lb) parts.push(STATE_LABELS[k] + ':' + lb);
    });
    return parts.join(' / ');
  }

  /**
   * 视角裁剪：回答「在这个视角下该写哪几处」。
   * 关键判据（材料原话）：裁剪**只减少正文重复，不改变已建立状态**
   * ⇒ 返回里必须同时给出「裁剪后的部位表」与「未被裁剪的状态快照」，两者不可互相影响。
   */
  function crop(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    const who = str(s.who, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const view = str(s.view, 16);
    if (VIEWS.indexOf(view) < 0) {
      noteFault('bad-view');
      return { ok: false, reason: 'bad-view', who: who, known: VIEWS.slice(), got: view };
    }
    const row = rowOf(who);
    if (!row) { noteFault('unknown'); return { ok: false, reason: 'unknown', who: who }; }
    return {
      ok: true, who: who, view: view, viewLabel: VIEW_LABELS[view],
      parts: VIEW_PARTS[view].slice(),
      // 不被裁剪影响的真源：调用方写正文时参照它，裁剪只决定「这一眼先写哪」
      stateUnchanged: clone(row.state),
      changes: row.changes
    };
  }

  /** 换装判定（只回答能不能换，不动状态）：给 UI/调用方一个前置询问口。 */
  function canChange(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    if (!settings().enabled) return { ok: true, reason: 'disabled' };
    const who = str(s.who, 40);
    if (!who) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }
    const row = rowOf(who);
    const why = str(s.reason, 32);
    if (!row) return { ok: true, who: who, had: false, reason: 'first-establish' };
    if (CHANGE_REASONS.indexOf(why) < 0) {
      noteFault('continuity-lock');
      return { ok: false, who: who, had: true, reason: 'continuity-lock', known: CHANGE_REASONS.slice(), got: why };
    }
    return { ok: true, who: who, had: true, reason: 'allowed', why: why, whyLabel: CHANGE_REASON_LABELS[why] };
  }

  /** 注入块：只写「此刻已建立的、发生变化的那几件」，不重述整套（材料第六条）。 */
  function buildBlock() {
    if (!settings().enabled) return '';
    const cap = (function () {
      const n = Math.floor(Number(settings().maxRows));
      return isFinite(n) && n >= 1 ? Math.min(64, n) : 24;
    })();
    const list = alive();
    if (!list.length) {
      stat.block = { candidates: 0, picked: 0, quota: cap, hidden: 0, mode: 'empty' };
      return '';
    }
    // 新→旧：ORDER 尾部最新，反序取（与 appearance 的 pickRows 同一口径）。
    const newest = list.slice().reverse();
    const picked = newest.slice(0, cap);
    const hidden = Math.max(0, newest.length - cap);
    stat.block = { candidates: newest.length, picked: picked.length, quota: cap, hidden: hidden,
      mode: newest.length > cap ? 'newest-first' : 'all-fit' };
    const lines = picked.map(function (w) {
      const r = WARDROBE[w];
      if (!r) return '';
      const main = (r.items && (r.items.outer || r.items.main)) ? (r.items.outer || r.items.main) : '';
      return '· ' + r.who + (main ? '｜' + main : '') + '｜' + stateText(r.state)
        + (r.memory ? '｜记忆点' + r.memory : '');
    }).filter(Boolean);
    let out = '[穿着状态]\n' + lines.join('\n') + '\n'
      + '状态只由动作/环境影响而变，无因不改；' + CHANGE_REASONS.length + ' 种理由之外不换整套；'
    out += '正文只写这一视角该写的那几处。';
    if (hidden > 0) out += '\n（本面名额：' + picked.length + '/' + newest.length + ' 条，按时间新→旧取；另有 ' + hidden + ' 条未列出，仍在账上）';
    return out;
  }

  function reset() {
    Object.keys(WARDROBE).forEach(function (k) { delete WARDROBE[k]; });
    ORDER.length = 0;
    __block = null;
  }
  function resetStat() {
    stat.establishes = 0; stat.updates = 0; stat.refusals = 0; stat.changes = 0;
    stat.lastReason = ''; stat.faults = {}; __block = null;
  }

  WA.attireState = {
    STATE_KEYS: STATE_KEYS, STATE_LABELS: STATE_LABELS, STATE_VALUES: STATE_VALUES,
    VIEWS: VIEWS, VIEW_PARTS: VIEW_PARTS,
    CHANGE_REASONS: CHANGE_REASONS, CAUSE_KINDS: CAUSE_KINDS,
    establish: establish, update: update, read: read, crop: crop, canChange: canChange,
    buildBlock: buildBlock, stateText: stateText,
    getSettings: settings, setSettings: function (patch) { return saveSettings(Object.assign(settings(), patch || {})); },
    reset: reset, resetStat: resetStat,
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, stat.faults) }); }
  };
})();
