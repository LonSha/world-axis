# -*- coding: utf-8 -*-
"""v2.86.0 A5 Stage 2：42 个裸调用点包进 engineCall（**保留**源守卫原样）+ nearEvent 守卫 + 观测出口。

与 tests/inject-sources-v2560.js 共存的三条硬约束：
  [A]  源码面须仍有 `WA.<ns>.buildBlock(`      ⇒ 我们的替换文本里保留它；
  [B]  源码面须仍有 `vis.<ns>` 读取点          ⇒ 守卫 `if (vis.x && WA.x)` 一字不改；
  [A2] 不得出现 `if (WA.<ns>)` 形态             ⇒ 不新增该形态（engineCall 内部用 `WA[ns]`，不匹配该字面量）。
接口面零增删：失败台账经**既有** visibilityStat() 返回，不新增命名空间成员。
"""
import io, re, sys, ast

P = '/tmp/wa_git/render/inject.js'
s = io.open(P, encoding='utf-8').read()
before = len(s.encode('utf-8'))

# ══════════════════ 3. 42 个裸调用点 ══════════════════
STYLE_SENTINEL = '@@STYLE_OK@@'
s = s.replace("      try { return WA.style.buildBlock() || ''; }",
              "      try { return WA.style.buildBlock() || ''; }".replace('WA.style.buildBlock()', STYLE_SENTINEL))
if s.count(STYLE_SENTINEL) != 1:
    print('ABORT: style sentinel not unique'); sys.exit(2)

CALL_RE = re.compile(r"WA\.([A-Za-z_$][\w$]*)\.(buildBlock|buildMemoryBlock|buildOpinionBlock|buildLedgerText)\(\)")
hits = []
def repl(m):
    ns, meth = m.group(1), m.group(2)
    hits.append(ns)
    return "engineCall('%s', function () { return WA.%s.%s(); })" % (ns, ns, meth)

s = CALL_RE.sub(repl, s)
s = s.replace(STYLE_SENTINEL, 'WA.style.buildBlock()')
print('call sites wrapped = %d :: %s' % (len(hits), ','.join(sorted(set(hits)))))
if len(hits) != 42:
    print('ABORT: expect 42 (43 - style)'); sys.exit(3)

# ══════════════════ 4. memorySampler（带参调用） ══════════════════
MS_OLD = """      if (vis.memory && WA.memorySampler) {
        const recent = WA.pmem && WA.pmem.recentText ? WA.pmem.recentText(4) : '';
        const pb = WA.memorySampler.buildBlock({ recentText: recent });
        if (pb) items.push({ source: '主观记忆', content: pb });
      }"""
MS_NEW = """      if (vis.memory && WA.memorySampler) {
        const recent = engineCall('pmem', function () { return WA.pmem.recentText(4); }) || '';
        const pb = engineCall('memorySampler', function () { return WA.memorySampler.buildBlock({ recentText: recent }); });
        if (pb) items.push({ source: '主观记忆', content: pb });
        else { const pb2 = engineCall('pmem', function () { return WA.pmem.buildBlock(); }); if (pb2) items.push({ source: '主观记忆', content: pb2 }); }
      }"""
if s.count(MS_OLD) != 1:
    print('ABORT: memorySampler anchor hits=%d' % s.count(MS_OLD)); sys.exit(4)
s = s.replace(MS_OLD, MS_NEW)

# ══════════════════ 5. nearEvent：整体守卫（它既是读也是写） ══════════════════
NE_OLD = """      const st = WA.store.get();
      if (st && st.nextTurnInjection && st.nextTurnInjection.nearEvent) {
        const ne = st.nextTurnInjection.nearEvent;
        items.push({ source: '近端事件', content: `[突发事件] ${ne.title}${ne.urgent ? '（紧急）' : ''}：${ne.desc}` });"""
NE_NEW = """      // v2.86.0 A5：本块既是读也是**写**（一次性消费要清 nearEvent），故整体守卫。
      //   它抛错的代价与别的源不同：消费没完成 ⇒ 同一条突发事件会**每轮重复注入**，
      //   而其它源抛错只是少一块。
      try {
      const st = WA.store.get();
      if (st && st.nextTurnInjection && st.nextTurnInjection.nearEvent) {
        const ne = st.nextTurnInjection.nearEvent;
        items.push({ source: '近端事件', content: `[突发事件] ${ne.title}${ne.urgent ? '（紧急）' : ''}：${ne.desc}` });"""
if s.count(NE_OLD) != 1:
    print('ABORT: nearEvent open anchor hits=%d' % s.count(NE_OLD)); sys.exit(5)
s = s.replace(NE_OLD, NE_NEW)

NE2_OLD = """          if (empty) d.nextTurnInjection = null;
        });
      }"""
NE2_NEW = """          if (empty) d.nextTurnInjection = null;
        });
      }
      } catch (e) { noteEngineFailure('nearEvent', e); }"""
if s.count(NE2_OLD) != 1:
    print('ABORT: nearEvent close anchor hits=%d' % s.count(NE2_OLD)); sys.exit(6)
s = s.replace(NE2_OLD, NE2_NEW)

# ══════════════════ 6. 观测出口（复用既有方法，零新成员） ══════════════════
VS_OLD = "    visibilityStat() { return { sources: SOURCES.length, declared: Object.keys(__REG.def).length, filled: __visStat.filled, undeclared: __visStat.undeclared.slice(), lastAt: __visStat.lastAt, key: LS_KEY }; },"
VS_NEW = ("    visibilityStat() { return { sources: SOURCES.length, declared: Object.keys(__REG.def).length,"
          " filled: __visStat.filled, undeclared: __visStat.undeclared.slice(), lastAt: __visStat.lastAt, key: LS_KEY,"
          "\n      // v2.86.0 A5：注入链失败读数（按源显示名）——与「源产出空串」分开记，\n"
          "      //   否则「世界状态为什么没进正文」永远答不出是没内容还是坏了。\n"
          "      engineFaults: engineFailuresView(), engineFaultTotal: engineFailureCount() }; },")
if s.count(VS_OLD) != 1:
    print('ABORT: visibilityStat anchor hits=%d' % s.count(VS_OLD)); sys.exit(7)
s = s.replace(VS_OLD, VS_NEW)

io.open(P, 'w', encoding='utf-8').write(s)
print('stage2 OK  %d -> %d bytes' % (before, len(s.encode('utf-8'))))
print('DONE')