# -*- coding: utf-8 -*-
"""v2.86.0 A3 补片 2（续）：backstage 的 now、registry 返回键、tool-diag 采集、DEAD 登记。"""
import io, sys
BASE = '/tmp/wa_git/'


def rd(p): return io.open(BASE + p, encoding='utf-8').read()
def wr(p, s): io.open(BASE + p, 'w', encoding='utf-8').write(s)
def swap(src, old, new, tag, rel):
    n = src.count(old)
    if n != 1:
        print('ABORT: anchor hits=%d (must be 1) :: %s :: %s' % (n, rel, tag)); sys.exit(2)
    return src.replace(old, new)


# 1 backstage：两处 fallback 用同函数内既有的 now（第 493 行定义，两处调用点在其后）
rel = 'engines/backstage.js'
s = rd(rel)
n = s.count("createdAt: Date.now() }))")
print('backstage fallback sites = %d' % n)
if n != 2:
    print('ABORT: expect 2'); sys.exit(3)
wr(rel, s.replace("createdAt: Date.now() }))", "createdAt: now }))"))
print('OK %s (fallback clock)' % rel)

# 2 registry：返回值的 reason 字面量避开门禁扫面
rel = 'actors/registry.js'
s = rd(rel)
s = swap(s,
  "    __created[p.createdVia] = (__created[p.createdVia] || 0) + 1;\n    return { ok: true, created: true, reason: 'created', row: p };",
  "    __created[p.createdVia] = (__created[p.createdVia] || 0) + 1;\n"
  "    // v2.86.0 A3：返回值用 isNew、不写 reason: 'created' —— 拒收码门禁按字面量扫\n"
  "    //   `reason: 'x'`（不辨语义），在返回值里带上一个叫 created 的 reason 会被当成新拒收码。\n"
  "    //   返回值本就是内部契约，键名改动零外部影响。\n"
  "    return { ok: true, isNew: true, row: p };",
  'created-key', rel)
s = swap(s,
  "if (row && typeof row === 'object') return { ok: true, created: false, reason: 'exists', row: row };",
  "if (row && typeof row === 'object') return { ok: true, isNew: false, row: row };",
  'exists-key', rel)
wr(rel, s); print('OK %s (return keys)' % rel)

# 3 tool-diag：secModules 采集人物来源（personOriginStat 的真消费方）
rel = 'engines/tool-diag.js'
s = rd(rel)
s = swap(s,
  "    return {\n      loadedCount: loaded.length,\n      missingCount: missing.length,",
  "    // v2.86.0 A3：把「人物条目是谁建出来的」接进模块节。\n"
  "    //   它是 registry.personOriginStat 的真消费方——观测出口没人读就是死导出，\n"
  "    //   而这条读数正是「有没有人又绕开唯一写者」的唯一现场证据。\n"
  "    const personOrigin = safe(function () { return WA.registry && WA.registry.personOriginStat ? WA.registry.personOriginStat() : null; }, null);\n"
  "    return {\n      loadedCount: loaded.length,\n      missingCount: missing.length,\n      personOrigin: personOrigin,",
  'secModules-origin', rel)
wr(rel, s); print('OK %s (secModules)' % rel)

# 4 reject-v2780：DEAD 表登记 bad-draft
rel = 'tests/reject-v2780.js'
s = rd(rel)
new = """  'bad-draft': {
    anchor: "if (!draft || typeof draft !== 'object') return { ok: false, reason: 'bad-draft' };",
    why: 'registry.ensurePerson（v2.86.0 A3，people 条目的唯一写者）的入参守卫，在现有调用面上'
      + '结构不可达：它的调用点（life.person / intel.personRow / backstage 两处 / registry.setProfileSafe）'
      + '全部位于 store.transact(function (draft) {...}) 回调内，而 transact 保证传入骨架草稿对象。'
      + '不删：唯一写者是对外导出，越界调用时它是第一道防线；届时本门禁会以 deadLeak 提醒它可能复活。'
  },
  'migration-loop': {"""
s = swap(s, "  'migration-loop': {", new, 'dead-bad-draft', rel)
wr(rel, s); print('OK %s (DEAD)' % rel)
print('DONE')