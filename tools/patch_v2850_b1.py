# -*- coding: utf-8 -*-
"""WorldAxis v2.85.0 B1 —— 人物自主生活：推演名单与协作对称性（engines/life.js）

两处真缺陷（都是行为面，不是存在面）：

  B1-1 推演名单按**插入序**截断。
       旧：Object.keys(draft.people).slice(0, cfg.maxPeople)
       ⇒ 「谁被推演」取决于谁先进场。有目标有计划的人插在第 5 位之后，就
         **永远轮不到**（依据齐全却被静默跳过），而调用方看不到任何迹象。
       新：有依据者优先（依据条数多者先），无依据者**不占名额**；
         名额不足时按确定性顺序取，且**可观测**（stat.skipped）。

  B1-2 单方面宣布的合作被当作已建立的协作。
       kind='cooperation' 的承诺若对方没有一行指向此人的同事项合作，
       那就是**单方面宣布**——不得据此推进（对齐 shadow.js「共同隐瞒必须双方各持一行」）。
       处置：wait / unreciprocated（可观测），**不删承诺本身**（事实存在过，要留痕）。

零新增导出、零新增容器、零新增设置键 ⇒ FROZEN2800 的 `life:` 段不变。
"""
import ast, io, os, sys

REL = 'engines/life.js'
PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), REL)

# ── (1) stat 增两个可观测面 ──
A1 = "  const stat = { ticks: 0, changed: 0, blocked: 0, lastAt: 0, lastReason: '' };"
B1 = """  const stat = { ticks: 0, changed: 0, blocked: 0, lastAt: 0, lastReason: '',
    // v2.85.0 B1：两个「本可以推演却没推演」的原因必须分开计数——
    //   名额不足（skipped）与协作未被回应（unreciprocated）是两件事：
    //   前者是资源约束，后者是**依据不足**。合成一个数就再也答不出该加名额还是该等对方。
    skipped: 0, unreciprocated: 0 };"""

# ── (2) 协作对偶检查（放在 commitmentAction 之前） ──
A2 = "  function commitmentAction(item, facts) {"
B2 = """  /**
   * v2.85.0 B1：协作必须**对称持有**。
   *   kind='cooperation' 的承诺只有在对方也持有一行指向此人的同事项合作时才成立。
   *   单方面宣布的合作不是合作——否则「我说了我们要一起做」就等价于「我们一起做」。
   *   注意：本函数**只读**，不修改任何一方（拒收/降级不得顺手删掉事实）。
   */
  function reciprocated(draft, person, cmt) {
    const other = (draft.people || {})[personId(cmt.target)];
    const lf = other && other.life;
    if (!lf || !Array.isArray(lf.commitments)) return false;
    const me = clean(person.name, 60) || String(person.id || '').replace(/^p_/, '');
    return lf.commitments.some(function (x) {
      return x && x.status === 'active' && x.kind === 'cooperation'
        && clean(x.target, 60) === me && clean(x.text, 80) === clean(cmt.text, 80);
    });
  }
  function commitmentAction(item, facts) {"""

# ── (3) 推演名单：有依据者优先（不再是插入序前 N） ──
A3 = """    const f = facts || {}; let changed = 0;
    WA.store.transact(function (draft) {
      Object.keys(draft.people || {}).slice(0, cfg.maxPeople).forEach(function (id) {
        const p = draft.people[id]; if (!p || !p.life) return;"""
B3 = """    const f = facts || {}; let changed = 0, skipped = 0, unrecip = 0;
    WA.store.transact(function (draft) {
      // v2.85.0 B1：名单不再按插入序截断。旧口径 `Object.keys(...).slice(0, maxPeople)`
      //   让「谁被推演」取决于谁先进场——有依据的人插在第 5 位之后就永远轮不到。
      //   现口径：**有依据者优先**（依据条数多者先，同依据按下标稳定），无依据者不占名额。
      const basisOf = function (id) {
        const p0 = draft.people[id], lf = p0 && p0.life;
        if (!lf || typeof lf !== 'object') return 0;
        let n = 0;
        if (Array.isArray(lf.goals) && lf.goals.some(function (x) { return x && x.status === 'active'; })) n++;
        if (Array.isArray(lf.commitments) && lf.commitments.some(function (x) { return x && x.status === 'active'; })) n++;
        if (Array.isArray(lf.schedule) && lf.schedule.some(function (x) { return x && x.status === 'active'; })) n++;
        return n;
      };
      const ranked = Object.keys(draft.people || {}).map(function (id, i) {
        return { id: id, n: basisOf(id), i: i };
      }).filter(function (r) { return r.n > 0; })
        .sort(function (a, b) { return (b.n - a.n) || (a.i - b.i); });
      // 名额不足时**必须留痕**：静默少推演一个人，与「他本来没事可做」在读数上长得一样。
      skipped = Math.max(0, ranked.length - cfg.maxPeople);
      ranked.slice(0, cfg.maxPeople).forEach(function (row) {
        const id = row.id;
        const p = draft.people[id]; if (!p || !p.life) return;"""

# ── (4) 决策链：单向协作降级为 wait / unreciprocated（而不是当作可依承诺） ──
A4 = """        let decision = fulfilled ? { action: 'keep', reason: 'commitment-fulfilled' } : (supplied ? supplied : (goal ? decide(goal, p, f) : (commitment ? { action: commitmentAction(commitment, f), reason: 'commitment' } : (active ? { action: 'keep', reason: 'schedule' } : null))));"""
B4 = """        // v2.85.0 B1：单向协作**不得**被当作可依承诺。
        //   位置刻意放在「有目标的人走目标路径」之后：协作被回应与否，不该拦下一个本来
        //   就有自己目标的人；它只影响「除了这条协作之外别无依据」的那种人。
        const lone = !!(commitment && commitment.kind === 'cooperation' && !reciprocated(draft, p, commitment));
        if (lone) unrecip++;
        let decision = fulfilled ? { action: 'keep', reason: 'commitment-fulfilled' }
          : (supplied ? supplied
            : (goal ? decide(goal, p, f)
              : (lone ? { action: 'wait', reason: 'unreciprocated' }
                : (commitment ? { action: commitmentAction(commitment, f), reason: 'commitment' }
                  : (active ? { action: 'keep', reason: 'schedule' } : null)))));"""

# ── (5) 读数与返回 ──
A5 = """    stat.ticks++; stat.changed += changed; if (!changed) stat.blocked++; stat.lastReason = changed ? 'updated' : 'nothing-to-do';
    return { ok: true, changed: changed, reason: stat.lastReason };"""
B5 = """    stat.ticks++; stat.changed += changed; if (!changed) stat.blocked++;
    stat.skipped += skipped; stat.unreciprocated += unrecip;
    stat.lastReason = changed ? 'updated' : 'nothing-to-do';
    // skipped 与 unreciprocated 进返回值：调用方要能当场看见「没被推演」的原因，
    //   而不是只能事后从 stat 里猜。
    return { ok: true, changed: changed, reason: stat.lastReason, skipped: skipped, unreciprocated: unrecip };"""

EDITS = [
    (A1, B1, 'stat 增 skipped / unreciprocated'),
    (A2, B2, 'reciprocated 对偶检查'),
    (A3, B3, '推演名单改有依据者优先'),
    (A4, B4, '单向协作降级 wait'),
    (A5, B5, '读数进返回值'),
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