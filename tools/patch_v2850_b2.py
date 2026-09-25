# -*- coding: utf-8 -*-
"""WorldAxis v2.85.0 B2 —— 地域层级 + 交通通行量（engines/world.js）

纪律（本仓库既有）：
  · 锚点在真源码里必须**恰中 1 次**，否则整体放弃（不做部分改写）；
  · 改完 node --check；先跑既有锁确认兼容，再上新锁。

本版**零新增导出、零新增容器、零新增设置键**——所以 FROZEN2800 / 成员数 /
骨架 / evict SITES / __BOUNDED_CAPS 全部不变：
  · 层级落在 place 行的 `parent` 字段（复用 places 容器）；
  · 通行量落在 road 行的 `cap` 字段（复用 roads 容器）；
  · 拒绝走既有 stat.faults 总线（road-crowded / unknown-parent / self-parent /
    parent-cycle / parent-locked）。

【两处流程纪律（写作过程中被既有锁逼出来的修正）】
  1 所有层级校验放在写事务**之前**（只读）：这样拒收分支根本不在 transact 回调里，
    「拒收却照样提交 / 推进 rev」这种缝隙在结构上不存在
    —— 这是 v2.79.0 立的规矩（side-effect-lock-v2790 会扫「拒收后裸 return」）。
  2 环检测**不能**放在事务前：那里读到的还是「补全前」的旧图，A∈B、B∈A 这种
    成环只发生在**补全**的一瞬，事务前判它等于写一段永不触发的代码（死代码冒充把关）。
    故环检测落在事务内、补全之前，且以 return false 透明中止（不落盘、不推进 rev）。
"""
import io, os, sys

REL = 'engines/world.js'
PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), REL)

# ── (1) addPlace：父级校验（事务前，只读） ──
A1 = """    const kind = clean(item && item.kind, 12);
    if (kind && PLACE_KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-kind', kinds: PLACE_KINDS.slice() };
    let out = null;"""
B1 = """    const kind = clean(item && item.kind, 12);
    if (kind && PLACE_KINDS.indexOf(kind) < 0) return { ok: false, reason: 'bad-kind', kinds: PLACE_KINDS.slice() };
    // v2.85.0 地域层级（B2）。父级**必须先登记**：没登记的「属于某地」不是「大概同城」，而是拒收。
    //   全部分支都判在写事务**之前**（只读）——拒收分支不进事务，
    //   「拒收却推进 rev / 半条记录落盘」就没有立足点（v2.79.0 立的规矩）。
    const parent = clean(item && item.parent, 40);
    if (parent) {
      if (parent === name) return { ok: false, reason: 'self-parent', name: name };
      if (!placeByName(parent)) return { ok: false, reason: 'unknown-parent', parent: parent };
      // 已有归属不得被**冲突改写**（x→y 拒收并写明现有归属）。
      //   「无 → 有」是补全缺失事实，不是改写已登记事实 —— 允许，且只允许一次（补后即锁）。
      //   若把补全也拒掉，一次误登记就永久锁死；本仓库禁的是「静默改写」，不是「不得改写」。
      const ex0 = placeByName(name);
      const cur0 = ex0 ? clean(ex0.parent, 40) : '';
      if (cur0 && parent !== cur0) return { ok: false, reason: 'parent-locked', name: name, parent: cur0 };
    }
    let out = null;"""

# ── (2) addPlace：写 parent 字段 + 补全前判环（事务内） ──
A2 = """      const hit = draft.world.places.filter(function (x) { return x && x.name === name; })[0];
      if (hit) { out = { ok: true, id: hit.id, name: name, existed: true }; return; }
      const row = { id: 'pl_' + name, name: name, kind: kind || 'public',"""
B2 = """      const hit = draft.world.places.filter(function (x) { return x && x.name === name; })[0];
      if (hit) {
        const cur = clean(hit.parent, 40);
        // 复核（正常路径已在事务外挡下）：不一致即**透明中止**，不留半条记录。
        if (parent && cur && parent !== cur) return false;
        if (parent && !cur) {
          // 环检测必须落在这里：只有**补全**这一瞬才可能出现 A∈B、B∈A
          //   （事务前读的是补全前的旧图，判它等于写一段永不触发的代码）。
          let c = parent, guard = 0, loop = false;
          while (c && guard++ < 64) {
            if (c === name) { loop = true; break; }
            const u = placeByName(c);
            c = u ? clean(u.parent, 40) : '';
          }
          if (loop) { out = { ok: false, reason: 'parent-cycle', name: name, parent: parent }; return false; }
          hit.parent = parent;
        }
        out = { ok: true, id: hit.id, name: name, existed: true, parent: clean(hit.parent, 40) }; return;
      }
      const row = { id: 'pl_' + name, name: name, kind: kind || 'public', parent: parent,"""

# ── (3) addRoad：通行量参数与校验 ──
A3 = """  function addRoad(a, b, minutes) {
    const x = clean(a, 40), y = clean(b, 40), mins = Number(minutes);
    if (!x || !y) return { ok: false, reason: 'missing-fields' };
    if (x === y) return { ok: false, reason: 'self-road' };
    if (!isFinite(mins) || mins <= 0) return { ok: false, reason: 'bad-minutes' };"""
B3 = """  function addRoad(a, b, minutes, cap) {
    const x = clean(a, 40), y = clean(b, 40), mins = Number(minutes);
    if (!x || !y) return { ok: false, reason: 'missing-fields' };
    if (x === y) return { ok: false, reason: 'self-road' };
    if (!isFinite(mins) || mins <= 0) return { ok: false, reason: 'bad-minutes' };
    // v2.85.0 通行量（交通网络的一面）：缺省/0 = 不限；正整数 = 同一时刻这段路最多几个在途者。
    //   为什么落在路段行而不是另开一张表：容量是**路段自己的属性**；
    //   另立并行表就要回答「谁是真源、改了甲忘了乙怎么办」——那是双真源，本仓库零容忍。
    const lim = (cap === undefined || cap === null || cap === '') ? 0 : Number(cap);
    if (!isFinite(lim) || lim < 0 || Math.floor(lim) !== lim) return { ok: false, reason: 'bad-cap' };"""

# ── (4) addRoad：容量进 road 行 ──
A4 = """      if (hit) { hit.minutes = Math.round(mins); out = { ok: true, id: hit.id, existed: true, minutes: hit.minutes }; return; }
      const row = { id: 'rd_' + x + '_' + y, a: x, b: y, minutes: Math.round(mins), at: clockNow('world') };"""
B4 = """      if (hit) {
        // 耗时是这条路的既定属性，重登记即更新；容量则**只在显式给出时才改**——
        //   缺省参数不是「把容量改成不限」，那会让一次「改个耗时」顺带抹掉通行量。
        const explicitCap = !(cap === undefined || cap === null || cap === '');
        hit.minutes = Math.round(mins);
        if (explicitCap) hit.cap = lim; else if (!isFinite(hit.cap)) hit.cap = 0;
        out = { ok: true, id: hit.id, existed: true, minutes: hit.minutes, cap: hit.cap };
        return;
      }
      const row = { id: 'rd_' + x + '_' + y, a: x, b: y, minutes: Math.round(mins), cap: lim, at: clockNow('world') };"""

# ── (5) 段级占用查询 ──
A5 = """  function activeJourney(who) {"""
B5 = """  /** 某段路登记的容量 + 当前在途人数。容量按**段**算：
   *  「甲乙都要过同一座桥」才是拥挤，各走各的相邻路段不是。 */
  function roadCapOf(a, b) {
    const hit = roads().filter(function (r) { return r && ((r.a === a && r.b === b) || (r.a === b && r.b === a)); })[0];
    return (hit && isFinite(hit.cap)) ? Number(hit.cap) : 0;
  }
  function roadUsage(a, b) {
    let n = 0;
    journeys().forEach(function (j) {
      if (!j || j.status !== 'in-transit' || !Array.isArray(j.path)) return;
      for (let i = 0; i + 1 < j.path.length; i++) {
        if ((j.path[i] === a && j.path[i + 1] === b) || (j.path[i] === b && j.path[i + 1] === a)) { n++; break; }
      }
    });
    return n;
  }
  function activeJourney(who) {"""

# ── (6) depart：逐段占用校验（落盘之前） ──
A6 = """    const m = move(who, from, to, at);
    if (!m.ok) return m;
    if (m.minutes === 0) return { ok: false, reason: 'already-there', person: who, place: m.to };
    let out = null;"""
B6 = """    const m = move(who, from, to, at);
    if (!m.ok) return m;
    if (m.minutes === 0) return { ok: false, reason: 'already-there', person: who, place: m.to };
    // v2.85.0：路走得通 ≠ 现在走得动。占用检查必须在**写行程之前**——
    //   先落一条行程再回头删，等于「被拒的也留下了痕迹」，而拒绝本应不落盘。
    for (let i = 0; i + 1 < m.path.length; i++) {
      const sa = m.path[i], sb = m.path[i + 1];
      const lim2 = roadCapOf(sa, sb);
      if (lim2 > 0 && roadUsage(sa, sb) >= lim2) {
        stat.blocked++;
        return { ok: false, reason: 'road-crowded', person: who, from: sa, to: sb, cap: lim2, on: roadUsage(sa, sb) };
      }
    }
    let out = null;"""

# ── (7) buildBlock：地点带归属 ──
A7 = """      lines.push('地点：' + ps.map(function (p) { return p.name + '（' + p.kind + '）'; }).join('｜'));"""
B7 = """      lines.push('地点：' + ps.map(function (p) {
        const pa = clean(p.parent, 40);
        return p.name + '（' + p.kind + '）' + (pa ? '∈' + pa : '');
      }).join('｜'));"""
A8 = """    lines.push('时空约束：未登记的地点不存在、未登记的道路走不通——不得据此推断「大概很近」。');"""
B8 = """    lines.push('时空约束：未登记的地点不存在、未登记的道路走不通——不得据此推断「大概很近」。');
    lines.push('地点层级（A∈B 表示 A 属于 B）只说明归属，**不说明可达**：父子之间没有登记道路时同样走不通。');"""

# ── (9) 顶部设计边界 ──
A9 = """ *   5 共同日程不得被读成「所有人都在场」：在场者只来自**证据**（人物自己的日程安排），
 *      不得由「办了一场集市」推出「全城人都到了」。
 */"""
B9 = """ *   5 共同日程不得被读成「所有人都在场」：在场者只来自**证据**（人物自己的日程安排），
 *      不得由「办了一场集市」推出「全城人都到了」。
 *   ── v2.85.0 追加（B2 地域与交通深化，全是否定式）──
 *   6 地域层级只说明**归属**，不说明可达：A∈B 不得被读成「A 走得到 B」（第 3 条的复发）。
 *     父级须先登记（unknown-parent）、不得自指（self-parent）、不得成环（parent-cycle）；
 *     已有归属不得被冲突改写（parent-locked），补全缺失归属则只许一次。
 *   7 路走得通 ≠ 现在走得动：路段容量满时**拒收并归因**（road-crowded），且拒收发生在落盘之前。
 */"""

EDITS = [
    (A1, B1, 'addPlace 父级校验（事务前）'),
    (A2, B2, 'addPlace 补全 + 环检测（事务内）'),
    (A3, B3, 'addRoad 通行量参数'),
    (A4, B4, 'addRoad 容量进行'),
    (A5, B5, '段级占用查询'),
    (A6, B6, 'depart 占用校验'),
    (A7, B7, 'buildBlock 地点归属'),
    (A8, B8, 'buildBlock 层级语义行'),
    (A9, B9, '设计边界追加 6/7'),
]


def main():
    src = io.open(PATH, encoding='utf-8').read()
    for i, (a, _b, name) in enumerate(EDITS, 1):
        n = src.count(a)
        if n != 1:
            print('中止：锚点 %d（%s）命中 %d 次（须为 1）' % (i, name, n))
            return 1
    out = src
    for i, (a, b, name) in enumerate(EDITS, 1):
        out = out.replace(a, b)
        print('  ✓ %d %s' % (i, name))
    io.open(PATH, 'w', encoding='utf-8').write(out)
    print('已写入 %s（%d → %d 字节）' % (REL, len(src.encode('utf-8')), len(out.encode('utf-8'))))
    return 0


if __name__ == '__main__':
    sys.exit(main())