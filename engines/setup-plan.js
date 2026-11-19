/**
 * WorldAxis engines/setup-plan.js (v2.529.0) — 进卡 / 离卡的设置计划（全局 vs 本卡专用）
 *
 * 缝合来源：RedBird-Tools src/core/setup.ts（97 行，带 setup.test.ts）。
 *
 * 病：本仓「进卡时换了哪些设置」这件事**只在内存里**，没有 before/after 台账。
 *   于是离卡时无法回答三个必答题：
 *     ① 哪些该换回去？（进卡时换过、玩家没动过）
 *     ② 哪些是玩家在卡里改的、应该记进这张卡？（动过，且这项本来就是本卡专用）
 *     ③ 哪些是玩家改的全局？（动过，但不是本卡专用 —— 不许悄悄恢复，那会吃掉玩家的改动）
 *   没有这三条，任何「角色切换」都会要么丢玩家设置，要么把一张卡的专用设置泄漏成全局。
 *
 * 判据：
 *   leavePlan 只对 live 里还存在的键下判断；「和进卡时换上的值相等」⇒ 换回 before；
 *   「不相等且在专用清单里」⇒ 记进 save 并且**也**换回 before；「不相等且不是专用」⇒ 两个都不动。
 *   少一条分支都会造成静默丢数据，所以三条分支都在这里，一个都不能删。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const UNNAMED_REGEX = '(未命名正则)';

  function unnamedRegex(name) {
    const s = String(name == null ? '' : name).trim();
    return s || UNNAMED_REGEX;
  }

  function has(o, k) {
    return o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
  }

  /** 是否是「旧格式」（整份清单：globalWorlds / globalRegexEnabled / 甚至只有 savedAt）。 */
  function isLegacyProfile(p) {
    if (!p || typeof p !== 'object') return false;
    return p.globalWorlds != null || p.globalRegexEnabled != null || p.savedAt !== undefined;
  }

  /**
   * 旧格式 → 本卡专用开/关。进卡结果与旧版一致：清单里的 = 开；
   * 现在开着但不在清单里的 = 关。正则按名字找 id（同名的都算）。
   */
  function migrateProfile(p, live) {
    if (!isLegacyProfile(p)) return p;
    const src = p || {};
    const worldsOn = (live && Array.isArray(live.worldsOn)) ? live.worldsOn : [];
    const regexLive = (live && Array.isArray(live.regex)) ? live.regex : [];
    const out = {};
    const keys = Object.keys(src);
    for (let i = 0; i < keys.length; i++) out[keys[i]] = src[keys[i]];

    if (Array.isArray(src.globalWorlds)) {
      const worlds = {};
      const w0 = src.worlds || {};
      const wk = Object.keys(w0);
      for (let i = 0; i < wk.length; i++) worlds[wk[i]] = w0[wk[i]];
      for (let i = 0; i < src.globalWorlds.length; i++) worlds[src.globalWorlds[i]] = true;
      for (let i = 0; i < worldsOn.length; i++) {
        if (src.globalWorlds.indexOf(worldsOn[i]) < 0) worlds[worldsOn[i]] = false;
      }
      if (Object.keys(worlds).length) out.worlds = worlds;
    }
    if (Array.isArray(src.globalRegexEnabled)) {
      const regex = {};
      const r0 = src.regex || {};
      const rk = Object.keys(r0);
      for (let i = 0; i < rk.length; i++) regex[rk[i]] = r0[rk[i]];
      for (let i = 0; i < regexLive.length; i++) {
        const r = regexLive[i] || {};
        const want = src.globalRegexEnabled.indexOf(unnamedRegex(r.name)) >= 0;
        if (want) regex[r.id] = true;
        else if (r.on) regex[r.id] = false;
      }
      if (Object.keys(regex).length) out.regex = regex;
    }
    delete out.globalWorlds;
    delete out.globalRegexEnabled;
    delete out.savedAt;
    return out;
  }

  /** 这本书在这张卡上默认开不开：全局的开，但「别的卡的书」进卡时自动停用。 */
  function worldDefault(book, facts) {
    const f = facts || {};
    const global = f.global instanceof Set ? f.global : new Set(f.global || []);
    const others = f.others instanceof Set ? f.others : new Set(f.others || []);
    const mine = f.mine instanceof Set ? f.mine : new Set(f.mine || []);
    return global.has(book) && !(others.has(book) && !mine.has(book));
  }

  /**
   * 0.6.19 口径：worlds 从「全局书在这张卡开/关」改成「与默认不同的才记」。
   * - 记着开、但不是全局书 ⇒ 这条其实是只给这张卡用的书，挂成附加（attach），删记录；
   * - 与默认一致 ⇒ 删记录；
   * - 书已经不存在（exists 给了才查）⇒ 删记录；
   * - 其余保留。
   */
  function migrateWorlds(worlds, facts, exists) {
    const out = {};
    const attach = [];
    const src = worlds || {};
    const keys = Object.keys(src);
    const ex = exists instanceof Set ? exists : (Array.isArray(exists) ? new Set(exists) : null);
    const f = facts || {};
    const mine = f.mine instanceof Set ? f.mine : new Set(f.mine || []);
    const global = f.global instanceof Set ? f.global : new Set(f.global || []);
    for (let i = 0; i < keys.length; i++) {
      const w = keys[i];
      const on = !!src[w];
      if (ex && !ex.has(w)) continue;
      if (on && !global.has(w)) {
        if (!mine.has(w)) attach.push(w);
        continue;
      }
      if (on === worldDefault(w, f)) continue;
      out[w] = on;
    }
    return { worlds: out, attach: attach };
  }

  /**
   * 离卡计划。items: key → {before, after}（进卡时记的）；live: 现在的值；
   * overridden: 本来就是本卡专用的键；same(key,a,b): 值比较（调用方定，比如带容差的数值比较）。
   * 返回 {restore, save}。
   */
  function leavePlan(items, live, overridden, same) {
    const restore = {};
    const save = {};
    const it = items || {};
    const lv = live || {};
    const ov = overridden instanceof Set ? overridden : new Set(overridden || []);
    const eq = typeof same === 'function' ? same : function (k, a, b) { return a === b; };
    const keys = Object.keys(it);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!has(lv, key)) continue; // live 里没有这项：不判断（不凭空造值）
      const rec = it[key] || {};
      const now = lv[key];
      if (eq(key, now, rec.after)) {
        restore[key] = rec.before; // 玩家没动过 ⇒ 换回去
      } else if (ov.has(key)) {
        save[key] = now; // 玩家动过、且是本卡专用 ⇒ 记进卡，同时也换回去
        restore[key] = rec.before;
      }
      // 玩家动过、但不是本卡专用：当全局改动处理，两个都不动
    }
    return { restore: restore, save: save };
  }

  /** 计划有没有实际动作（界面用来决定要不要提示「离卡会改动 N 项」）。 */
  function planSize(plan) {
    const p = plan || {};
    return { restore: Object.keys(p.restore || {}).length, save: Object.keys(p.save || {}).length };
  }

  WA.setupPlan = {
    UNNAMED_REGEX: UNNAMED_REGEX,
    unnamedRegex: unnamedRegex,
    isLegacyProfile: isLegacyProfile,
    migrateProfile: migrateProfile,
    worldDefault: worldDefault,
    migrateWorlds: migrateWorlds,
    leavePlan: leavePlan,
    planSize: planSize
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/setup-plan.js', { kind: 'engine', ver: '2.529.0' });
})();