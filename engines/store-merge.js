/**
 * WorldAxis engines/store-merge.js (v2.529.0) — 设置文件合并（每条谁新留谁 + 墓碑）
 *
 * 缝合来源：RedBird-Tools src/core/store.ts（59 行，带 store.test.ts）。
 *
 * 病（宿主侧的真实覆盖路径）：酒馆保存设置是**整份覆盖** settings.json。开着的旧页面
 *   （另一个标签页、手机端没刷新）用它内存里的旧快照写回，就把新数据盖掉了；
 *   而「删除」在纯数据里**无法表达** —— 合并时被删掉的条目会从另一份副本里复活。
 *
 * 判据（三条，缺一不可）：
 *   ① 逐条比时间戳，新的赢；时间戳相同**保留 local**（不猜，宁可不动自己手里这份）；
 *   ② 墓碑（删除时间）>= 该条最后修改时间 ⇒ 这条算删掉，不复活；
 *   ③ 墓碑只在「可能还有副本持有它」时有意义：超过 TOMBSTONE_DAYS 且两边都没有这条，才清。
 *   另外：SECTIONS 是**白名单**，不在表里的分区会被静默丢弃 —— 所以加分区必须同时加进表。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const SECTIONS = ['cards', 'profiles', 'regexOwners', 'presetInfo', 'pluginInfo', 'worldSources', 'themeInfo'];
  const TOMBSTONE_DAYS = 30;
  const DAY_MS = 86400000;
  // 时间源单一出口（v2.529.0 收口）：墓碑老化用「当前时间」，必须走测量时钟而不是裸 Date.now()
  //   ——裸调绕过冻结，回放对不上时只能全库通读（同 v2.22.0 块的全库口径）。
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  function stampOf(section, rec) {
    if (!rec || typeof rec !== 'object') return '';
    let v;
    if (section === 'profiles') v = rec.updatedAt != null ? rec.updatedAt : rec.savedAt;
    else if (section === 'regexOwners') v = rec.at;
    else v = rec.updatedAt;
    return typeof v === 'string' ? v : '';
  }

  function keysOf(o) {
    return o && typeof o === 'object' ? Object.keys(o) : [];
  }

  /** 合并两份快照。返回新对象，两个入参都不改。nowMs 只用于墓碑老化（默认取当前时间）。 */
  function mergeStores(local, remote, nowMs) {
    const a0 = local && typeof local === 'object' ? local : {};
    const b0 = remote && typeof remote === 'object' ? remote : {};
    const aData = a0.data || {};
    const bData = b0.data || {};
    const aDel = a0.deleted || {};
    const bDel = b0.deleted || {};
    const data = {};
    const deleted = {};
    const now = typeof nowMs === 'number' ? nowMs : clockWall();
    const cutoff = new Date(now - TOMBSTONE_DAYS * DAY_MS).toISOString();

    for (let si = 0; si < SECTIONS.length; si++) {
      const sec = SECTIONS[si];
      const a = aData[sec] || {};
      const b = bData[sec] || {};
      const ta = aDel[sec] || {};
      const tb = bDel[sec] || {};
      // ① 墓碑取两边更晚的那个删除时间
      const tomb = {};
      const tk = keysOf(tb);
      for (let i = 0; i < tk.length; i++) tomb[tk[i]] = tb[tk[i]];
      const ak = keysOf(ta);
      for (let i = 0; i < ak.length; i++) {
        const k = ak[i];
        if (!tomb[k] || ta[k] > tomb[k]) tomb[k] = ta[k];
      }
      // ② 逐条选新的；③ 被删的挡住
      const out = {};
      const seen = {};
      const all = [];
      const bk = keysOf(b);
      const ak2 = keysOf(a);
      for (let i = 0; i < ak2.length; i++) { if (!seen[ak2[i]]) { seen[ak2[i]] = 1; all.push(ak2[i]); } }
      for (let i = 0; i < bk.length; i++) { if (!seen[bk[i]]) { seen[bk[i]] = 1; all.push(bk[i]); } }
      for (let i = 0; i < all.length; i++) {
        const k = all[i];
        const ra = a[k];
        const rb = b[k];
        let pick;
        if (!ra) pick = rb;
        else if (!rb) pick = ra;
        else pick = stampOf(sec, rb) > stampOf(sec, ra) ? rb : ra;
        if (!pick) continue;
        if (tomb[k] && tomb[k] >= stampOf(sec, pick)) continue;
        out[k] = pick;
      }
      // ④ 墓碑老化
      const tk2 = keysOf(tomb);
      for (let i = 0; i < tk2.length; i++) {
        const k = tk2[i];
        if (tomb[k] < cutoff && !(k in a) && !(k in b)) delete tomb[k];
      }
      data[sec] = out;
      deleted[sec] = tomb;
    }
    return { data: data, deleted: deleted };
  }

  /** 便宜的比较：合并有没有改变数据面（墓碑变化不算改变——它不影响显示内容）。 */
  function sameStore(a, b) {
    try {
      return JSON.stringify((a && a.data) || {}) === JSON.stringify((b && b.data) || {});
    } catch (e) {
      return false; // 序列化不了就当不同，宁可多写一次也不许漏写
    }
  }

  /** 记一条删除。返回新的 deleted 表（不改入参）。 */
  function markDeleted(snapshot, section, key, atIso) {
    const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const deleted = {};
    const src = snap.deleted || {};
    const sk = keysOf(src);
    for (let i = 0; i < sk.length; i++) {
      const sec = sk[i];
      deleted[sec] = {};
      const ks = keysOf(src[sec]);
      for (let j = 0; j < ks.length; j++) deleted[sec][ks[j]] = src[sec][ks[j]];
    }
    if (SECTIONS.indexOf(section) < 0) return { data: snap.data || {}, deleted: deleted }; // 不认识的区：什么都不记
    if (!deleted[section]) deleted[section] = {};
    deleted[section][key] = String(atIso || new Date().toISOString());
    const data = {};
    const dk = keysOf(snap.data);
    for (let i = 0; i < dk.length; i++) {
      const sec = dk[i];
      const rec = {};
      const ks = keysOf(snap.data[sec]);
      for (let j = 0; j < ks.length; j++) if (!(sec === section && ks[j] === key)) rec[ks[j]] = snap.data[sec][ks[j]];
      data[sec] = rec;
    }
    if (!data[section]) data[section] = {};
    return { data: data, deleted: deleted };
  }

  WA.storeMerge = {
    SECTIONS: SECTIONS,
    TOMBSTONE_DAYS: TOMBSTONE_DAYS,
    stampOf: stampOf,
    mergeStores: mergeStores,
    sameStore: sameStore,
    markDeleted: markDeleted
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/store-merge.js', { kind: 'engine', ver: '2.529.0' });
})();
