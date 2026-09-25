#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.84.0 收口：r12 的 4 条红行，逐条修到根因。

r12 实测：通过 7396 / 失败 4（r11 是 runner-failed —— 崩在负控制裸宿主）。4 条红行：

① v2790 [C1] survival.set / threads.open 负控制打不到靶
   成因：A2 把 39 个引擎的 clean() 委托到 core/input-guard.js 之后，这两个入口的防线
   **分成两层**（入口参数守卫 + inputGuard 形态兜底）。摘掉第一层后，NaN 被 inputGuard
   挡住（`text(NaN)` → ''），缺陷不再重现。这不是判据坏了，是防线更深了 ——
   但负控制必须仍然能打到靶，故这两处改为「两层一起拆」才算拆掉防线。
   （其余 8 个入口 r12 仍能单层重现，保持不动。）

② v2830/mr 读数 113 / 105 陈旧
   成因：本版新增 core/input-guard.js ⇒ 账本已升到 命名空间 114 / 装载文件 106
   （LOAD_ORDER 109 − 3 个 ui/* = 106）。

③ context-guard 负控制 A 失败（真实缺陷）
   实测 rec = {"waNs":["__leakNs2840","ui"],"waMembers":[],"kept":[..."ns:__leakNs2840"]}
   两个根因，都在同一个纪律上：**在回收之后重算依赖当前值形状的谓词**。
     a. diff() 对**新增**的命名空间直接 return，其内部成员从不进 waAddedMembers
        ⇒ 负控制 A 打的就是这个形状（ui 命名空间 + ui.leakMember），成员读数对它瞎。
     b. restore() 末尾用 `!isUiFaceNs(ns)` 算 kept，而此刻 WA[ns] 已被删
        ⇒ 谓词必然答「非 UI 面」，同一个 ns 同时出现在 waNs（已回收）与 kept（未回收）里。
        diff() 内部早已算定 uiAddedNs/nonUiAddedNs，restore() 必须复用，不得重算。
"""
import io
import sys

BASE = '/tmp/wa_git'


def patch(rel, edits):
    p = '%s/%s' % (BASE, rel)
    src = io.open(p, encoding='utf-8').read()
    out = src
    for anchor, repl in edits:
        hits = out.count(anchor)
        if hits != 1:
            print('中止：%s 中锚点命中 %d 次（须为 1）：%s' % (rel, hits, anchor[:70].replace('\n', '\\n')))
            return False
        out = out.replace(anchor, repl)
    io.open(p, 'w', encoding='utf-8').write(out)
    print('已改写 %s（%d 处）' % (rel, len(edits)))
    return True


# ── ① context-guard：两处「回收后重算谓词」 ──
CG_OLD_DIFF = """  const waAddedNs = [], waAddedMembers = [];
  Object.keys(b.wa).forEach(function (ns) {
    if (!(ns in a.wa)) { waAddedNs.push(ns); return; }
    b.wa[ns].forEach(function (m) { if (a.wa[ns].indexOf(m) < 0) waAddedMembers.push(ns + '.' + m); });
  });"""
CG_NEW_DIFF = """  const waAddedNs = [], waAddedMembers = [];
  Object.keys(b.wa).forEach(function (ns) {
    if (!(ns in a.wa)) {
      // v2.84.0：新增命名空间的**内部成员也要登记**。
      //   首版这里直接 return，于是「成员」读数对整块新增的命名空间是瞎的 ——
      //   而负控制 A 打的正是这个形状（`WA.ui = {…}` + `WA.ui.leakMember`），
      //   实测 rec.waMembers 恒为空、断言无从成立。回收动作本来就是「整个 ns 一起删」，
      //   登记它的成员不会改变回收行为，只是让读数与动作同宽。
      waAddedNs.push(ns);
      b.wa[ns].forEach(function (m) { waAddedMembers.push(ns + '.' + m); });
      return;
    }
    b.wa[ns].forEach(function (m) { if (a.wa[ns].indexOf(m) < 0) waAddedMembers.push(ns + '.' + m); });
  });"""

CG_OLD_KEPT = """  d.lsAdded.forEach(function (k) { rec.kept.push('storage:' + k); });
  d.waAddedNs.filter(function (ns) { return !isUiFaceNs(ns); }).forEach(function (ns) { rec.kept.push('ns:' + ns); });"""
CG_NEW_KEPT = """  d.lsAdded.forEach(function (k) { rec.kept.push('storage:' + k); });
  // v2.84.0：必须复用 diff() **当时算定**的 nonUiAddedNs，不得在此处重算 isUiFaceNs ——
  //   本函数上面刚把 WA[ns] 删掉，谓词此刻读到的 `WA[ns]` 是 undefined，
  //   于是同一个 ns 会同时出现在 waNs（说「已回收」）与 kept（说「未回收」）里。
  //   实测（r12 负控制 A）：rec.kept 含 'ns:__leakNs2840'，而它明明已被回收进 waNs。
  //   这正是文件头 r7 记下的那个病（判据的输入面与结论面不同宽）在 kept 路径上的复发。
  (d.nonUiAddedNs || []).forEach(function (ns) { rec.kept.push('ns:' + ns); });"""

# ── ② settle-v2830：陈旧读数 ──
MR_OLD = """  a(led.nsCount === 113 && led.loadedCount === 105,
    'v2830/mr: 命名空间 113 / 装载文件 105（与 LOAD_ORDER 的 108 差 3 个 ui/*）');"""
MR_NEW = """  a(led.nsCount === 114 && led.loadedCount === 106,
    'v2830/mr: 命名空间 114 / 装载文件 106（与 LOAD_ORDER 的 109 差 3 个 ui/*）'
    + ' —— v2.84.0 A2 新增 core/input-guard.js（inputGuard 命名空间）');"""

# ── ③ v2790：两层防线的负控制 ──
V2790_OLD_LOOP = """    const broken = g.weaken ? g.weaken(src) : (g.breakInto ? src.split(g.anchor).join(g.breakInto) : src.split(g.anchor).join(''));
    a(broken !== src, 'v2790: [C1] ' + g.name + ' 的破坏副本与原不同（锚点真命中）');
    const WA2 = isolated(function () {
      const ov = {}; ov[g.rel] = broken;
      return fresh({ srcOverride: ov });
    });"""
V2790_NEW_LOOP = """    const broken = g.weaken ? g.weaken(src) : (g.breakInto ? src.split(g.anchor).join(g.breakInto) : src.split(g.anchor).join(''));
    a(broken !== src, 'v2790: [C1] ' + g.name + ' 的破坏副本与原不同（锚点真命中）');
    // v2.84.0：A2 统一输入边界之后，若干入口的防线**分成两层**（入口参数守卫 + inputGuard
    //   形态兜底）。单摘第一层时，NaN 已被 inputGuard 挡下（`text(NaN)` → ''），
    //   缺陷不复现 —— 这不是判据坏了，是防线更深了。这类入口必须**两层一起拆**，
    //   否则负控制打不到靶，「C1 无异常」就成了假绿。
    //   反之，仍能单层复现的入口保持单层破坏（不动），避免把判据改成「必须两层」的过度约束。
    let brokenFinal = broken;
    if (g.secondBreak) {
      const hits2 = brokenFinal.split(g.secondBreak.from).length - 1;
      a(hits2 === 1, 'v2790: [C1] ' + g.name + ' 的第二层防线锚点恰 1 次（实 ' + hits2 + '）');
      const b2 = brokenFinal.split(g.secondBreak.from).join(g.secondBreak.to);
      a(b2 !== brokenFinal, 'v2790: [C1] ' + g.name + ' 的第二层破坏确实发生（inputGuard 兜底已退回旧 String 形态）');
      brokenFinal = b2;
    }
    const WA2 = isolated(function () {
      const ov = {}; ov[g.rel] = brokenFinal;
      return fresh({ srcOverride: ov });
    });"""

V2790_SURVIVAL_OLD = """  { name: 'survival.set', rel: 'engines/survival.js',
    call: function (WA, v) { return WA.survival.set(v); },
    anchor: "    if (typeof who !== 'string' || !who.trim()) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }" },"""
V2790_SURVIVAL_NEW = """  { name: 'survival.set', rel: 'engines/survival.js',
    call: function (WA, v) { return WA.survival.set(v); },
    anchor: "    if (typeof who !== 'string' || !who.trim()) { noteFault('missing-fields'); return { ok: false, reason: 'missing-fields' }; }",
    // v2.84.0：A2 之后本入口的第二层防线是 inputGuard（`clean(NaN)` → ''，再被 `if (!w)` 拒收）。
    //   单摘守卫时缺陷不复现，故这里的破坏必须把兜底一并退回旧 String 形态。
    secondBreak: { from: "  function clean(v, max) { return WA.inputGuard.text(v, max || 40); }",
      to: "  function clean(v, max) { return String(v == null ? '' : v).replace(/\\\\s+/g, ' ').trim().slice(0, max || 40); }" } },"""

V2790_THREADS_OLD = """  { name: 'threads.open', rel: 'engines/threads.js',
    call: function (WA, v) { return WA.threads.open(v); },
    anchor: "    if (item == null || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: 'missing-question' };\" },"""
V2790_THREADS_NEW = """  { name: 'threads.open', rel: 'engines/threads.js',
    call: function (WA, v) { return WA.threads.open(v); },
    anchor: "    if (item == null || typeof item !== 'object' || Array.isArray(item)) return { ok: false, reason: 'missing-question' };",
    // 同上：A2 之后 `clean(NaN)` 由 inputGuard 挡下，两层一起拆才能重现「立一桩叫 NaN 的悬案」。
    secondBreak: { from: "  function clean(v, max) { return WA.inputGuard.text(v, max || 60); }",
      to: "  function clean(v, max) { return String(v == null ? '' : v).replace(/\\\\s+/g, ' ').trim().slice(0, max || 60); }" } },"""

PLAN = [
  ('tests/context-guard.js', [(CG_OLD_DIFF, CG_NEW_DIFF), (CG_OLD_KEPT, CG_NEW_KEPT)]),
  ('tests/settle-v2830.js', [(MR_OLD, MR_NEW)]),
  ('tests/input-boundary-v2790.js', [(V2790_OLD_LOOP, V2790_NEW_LOOP),
                                     (V2790_SURVIVAL_OLD, V2790_SURVIVAL_NEW),
                                     (V2790_THREADS_OLD, V2790_THREADS_NEW)]),
]


def main():
    for rel, edits in PLAN:
        if not patch(rel, edits):
            return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())