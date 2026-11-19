/**
 * WorldAxis engines/arc-guide.js (v2.532.0) — 引导弧：多拍长线引导的注入窗口与关键词登记
 *
 * 缝合来源：story-oracle (github.com/namelessone88/story-oracle) 的两条机制 ——
 *   ① 「多拍长线引导 + 注入深度」：长线引导由若干**拍**组成，每拍有自己的关键词与起始楼层，
 *      某一拍只在它起始后的一段楼层窗口里参与注入（depth），出窗即退场；
 *   ② 「引导关键词要注册进世界书扫描」：拍的关键词必须能被世界书扫描面看见，
 *      否则「玩家这句话踩到了第二拍」永远触发不了。
 *
 * 病（现场可查）：本仓有 `foreshadow`（长线伏笔）、`motif`（母题）、`rhythm-loop`（节奏环），
 *   但没有「一拍一拍往下推的引导线」这个概念：谁在第几拍、这一拍还该不该注入、
 *   它的关键词有没有进扫描面 —— 三件事都没有出口。后果是两个方向都错：
 *   · 该退场的拍一直注入（长线引导变成永久提示，注入预算被它吃掉，节奏由它决定）；
 *   · 该在场的拍没人注入（关键词也没登记 ⇒ 世界书扫描读不到它，玩家永远踩不到）。
 *
 * 判据（四条，缺一不可）：
 *   ① **不猜**：缺当前楼层 / 这一弧没有任何 `at` / 楼层在首拍之前 —— 一律 `why` 点名并回空注入单，
 *      **绝不**默认「就当第一拍在场」（猜出来的在场比缺席更坏：它会悄悄改写叙事节奏）；
 *   ② **窗口单向**：`inject` 只收 `floor - depth < at <= floor` 的拍，按拍号升序；
 *      `expired` 是 `at <= floor - depth` 的条数（可复算，不是估计）；
 *   ③ **关键词登记去重保序**：同一关键词在多拍出现只登记一次（记首个出处），空 key 不进表 ——
 *      世界书扫描面拿到的是一张没有重复项的登记表；
 *   ④ **纯函数**：`plan` / `keysOf` / `stat` 都不改入参、不读 store、不写任何东西；
 *      同输入同输出（拍按拍号稳定排序）。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const MAX_ARCS = 32;
  const MAX_BEATS = 64;
  const MAX_KEY_LEN = 48;
  const MAX_DEPTH = 20;
  const DEFAULTS = { depth: 3 };

  /** 一拍：`{no, key, at?, text?}`。坏形态返回 `{fault}`（不猜、不兜底）。 */
  function parseBeat(raw, i) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { fault: { at: i, code: 'bad-beat' } };
    const no = Number(raw.no);
    if (!isFinite(no) || Math.floor(no) !== no || no < 1) return { fault: { at: i, code: 'bad-no' } };
    const key = typeof raw.key === 'string' ? raw.key.trim() : '';
    if (!key) return { fault: { at: i, code: 'bad-key' } };
    if (key.length > MAX_KEY_LEN) return { fault: { at: i, code: 'bad-key' } };
    const atRaw = raw.at === undefined || raw.at === null ? null : Number(raw.at);
    if (atRaw !== null && (!isFinite(atRaw) || Math.floor(atRaw) !== atRaw || atRaw < 0)) {
      return { fault: { at: i, code: 'bad-at' } };
    }
    return { beat: { no: no, key: key, at: atRaw, text: typeof raw.text === 'string' ? raw.text : '' } };
  }

  /** 一条弧：`{id, depth?, beats:[...]}`。坏一拍 ⇒ **整弧拒**（不做部分接收）。 */
  function parseArc(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    if (!id) return null;
    const beatsRaw = Array.isArray(raw.beats) ? raw.beats : null;
    if (!beatsRaw || !beatsRaw.length || beatsRaw.length > MAX_BEATS) return null;
    const beats = [];
    const seen = {};
    for (let i = 0; i < beatsRaw.length; i++) {
      const r = parseBeat(beatsRaw[i], i);
      if (r.fault) return null;                       // ① 坏一拍整弧拒
      if (seen[r.beat.no]) return null;              // 拍号重复 = 弧的写法本身错了
      seen[r.beat.no] = 1;
      beats.push(r.beat);
    }
    beats.sort(function (a, b) { return a.no - b.no; });   // ④ 稳定排序：与入参顺序无关
    const depthRaw = raw.depth === undefined || raw.depth === null ? DEFAULTS.depth : Number(raw.depth);
    if (!isFinite(depthRaw) || Math.floor(depthRaw) !== depthRaw || depthRaw < 1 || depthRaw > MAX_DEPTH) return null;
    return { id: id, depth: depthRaw, beats: beats };
  }

  /** 一批弧：坏弧只进 `rejected`，好弧照常收下（与 ctx-boundary 的坏规则同款口径）。 */
  function parseArcs(raws) {
    const list = raws === undefined || raws === null ? [] : (Array.isArray(raws) ? raws : [raws]);
    const arcs = [];
    const rejected = [];
    if (list.length > MAX_ARCS) return { arcs: [], rejected: [{ at: -1, code: 'too-many-arcs', actual: String(list.length) }] };
    for (let i = 0; i < list.length; i++) {
      const A = parseArc(list[i]);
      if (A) arcs.push(A);
      else rejected.push({ at: i, code: 'bad-arc' });
    }
    return { arcs: arcs, rejected: rejected };
  }

  /**
   * 注入单：给当前楼层，答「这一弧现在该注入哪几拍」。
   * opts：`{ floor }`
   */
  function plan(arcs, opts) {
    const list = parseArcs(arcs);
    const floorRaw = opts && typeof opts === 'object' ? Number(opts.floor) : NaN;
    const hasFloor = isFinite(floorRaw) && Math.floor(floorRaw) === floorRaw;
    const rows = [];
    list.arcs.forEach(function (A) {
      const row = { id: A.id, depth: A.depth, active: null, inject: [], expired: 0, upcoming: null, why: '' };
      if (!hasFloor) { row.why = 'no-floor'; rows.push(row); return; }      // ① 缺楼层不猜
      const withAt = A.beats.filter(function (b) { return b.at !== null; });
      if (!withAt.length) { row.why = 'no-beat-at'; rows.push(row); return; }   // ① 没有起始楼层就不猜在场
      const lo = floorRaw - A.depth;
      withAt.forEach(function (b) {
        if (b.at <= floorRaw && b.at > lo) row.inject.push(b.no);          // ② 窗口单向
        if (b.at <= lo) row.expired++;
        if (b.at > floorRaw && row.upcoming === null) row.upcoming = b.no;
        if (b.at <= floorRaw) row.active = b.no;
      });
      row.inject.sort(function (a, b) { return a - b; });
      if (row.active === null) row.why = 'before-first-beat';              // ① 还没开始，不当作第一拍在场
      rows.push(row);
    });
    return {
      floor: hasFloor ? floorRaw : null,
      rows: rows,
      rejected: list.rejected,
      injectCount: rows.reduce(function (n, r) { return n + r.inject.length; }, 0)
    };
  }

  /**
   * 关键词登记表（给世界书扫描面）：`{rows:[{key, arc, no}], keys:[...]}`。
   * ③ 同一关键词只登记一次，出处取首个（按「弧顺序 + 拍号」扫描）。
   */
  function keysOf(arcs) {
    const list = parseArcs(arcs);
    const rows = [];
    const seen = {};
    list.arcs.forEach(function (A) {
      A.beats.forEach(function (b) {
        if (seen[b.key]) return;
        seen[b.key] = 1;
        rows.push({ key: b.key, arc: A.id, no: b.no });
      });
    });
    return {
      rows: rows,
      keys: rows.map(function (r) { return r.key; }),
      rejected: list.rejected
    };
  }

  /** 只读读数（给面板 / 诊断面）：弧数、拍数、关键词数。 */
  function stat(arcs) {
    const list = parseArcs(arcs);
    const K = keysOf(arcs);
    return {
      arcs: list.arcs.length,
      beats: list.arcs.reduce(function (n, A) { return n + A.beats.length; }, 0),
      keys: K.keys.length,
      rejected: list.rejected.length
    };
  }

  WA.arcGuide = {
    parseBeat: parseBeat, parseArc: parseArc, parseArcs: parseArcs,
    plan: plan, keysOf: keysOf, stat: stat,
    DEFAULTS: Object.assign({}, DEFAULTS),
    MAX_ARCS: MAX_ARCS, MAX_BEATS: MAX_BEATS, MAX_DEPTH: MAX_DEPTH
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/arc-guide.js', { kind: 'engine', ver: '2.532.0' });
})();