# -*- coding: utf-8 -*-
"""v2.86.0 落点 A3：事实唯一写者（people 条目只能由一个地方创建）

【病灶（扫面实测）】people 的「凭空建人」内联写法散在 5 处：
    engines/life.js:82    draft.people[id] || (draft.people[id] = {...})   写目标/日程就造人
    engines/intel.js:89   （情报到期入账）
    engines/intel.js:138  （addIntel）
    engines/backstage.js:533 / 570
    actors/registry.js:431（本文件自己也是调用方之一）
  同库 registry 是**人设的官方落点**（setProfileSafe 有分节剪裁与准入），
  而上面每一处都绕开它、各自拼一个最小壳。

【本版口径】创建收敛到一个函数 registry.ensurePerson(draft, id, name, via)：
  只保证「有一条合法的最小壳」，已存在则原样返回（**不覆盖**）；每次**新建**打
  createdVia / createdAt ⇒ 「这条人物条目是谁建出来的」从此可查。观测出口 personOriginStat()。

【为什么不是「禁止创建」】各调用点的创建是既有契约（life-v2520 / settle-v2650 /
  evict-meta-v2610 都以「写入即建条目」为前提）。本版治理的是**发散**，不是**创建**：
  语义不变、行为不变，变的是「创建只有一个地方、且每次创建都可归因」。

【兼容】合成宿主桩（手写 WA 桩）里没有 registry ⇒ 各调用点保留等价兜底并打
  `<via>:fallback` 标签，使「产品运行时是否真走了唯一写者」可由专锁断言。
"""
import io, sys, ast

BASE = '/tmp/wa_git/'


def read(p):
    return io.open(BASE + p, encoding='utf-8').read()


def write(p, s):
    io.open(BASE + p, 'w', encoding='utf-8').write(s)


def swap(src, old, new, tag, rel):
    n = src.count(old)
    if n != 1:
        print('ABORT: anchor hits=%d (must be 1) :: %s :: %s' % (n, rel, tag))
        sys.exit(2)
    return src.replace(old, new)


# ══════════════════ 1. actors/registry.js：唯一写者 ══════════════════
REL = 'actors/registry.js'
s = read(REL)

CORE_ANCHOR = "  function idClear(name) {"
CORE = '''  /** 本轮进程内「按来源计的新建次数」（内存态：诊断「这条链真的在用唯一写者吗」） */
  const __created = {};
  /**
   * v2.86.0 A3（事实唯一写者）：**people 条目的唯一创建点**。
   *
   * 修前：五个模块各自内联 `draft.people[id] = draft.people[id] || { id, name, knowledge: {} }`
   *   （life/intel 各若干处、backstage 两处、本文件一处）。五种写法、四处分散，
   *   于是「这个人是怎么出现的」在状态里**没有任何痕迹**——写一条承诺就凭空多一个人，
   *   还占掉 cap 48 的名额。
   *
   * 现口径：创建只此一处，每次**新建**都打来源标签（createdVia / createdAt）。
   *   已存在的条目原样返回，**绝不覆盖**既有字段——本函数只解决「有没有」，
   *   不解决「内容是什么」（那是 setProfileSafe 的事）。
   */
  function ensurePerson(draft, id, name, via) {
    if (!draft || typeof draft !== 'object') return { ok: false, reason: 'bad-draft' };
    const key = String(id == null ? '' : id);
    if (!key || key === 'p_') return { ok: false, reason: 'missing-name' };
    if (!draft.people || typeof draft.people !== 'object') draft.people = {};
    const row = draft.people[key];
    if (row && typeof row === 'object') return { ok: true, created: false, reason: 'exists', row: row };
    const nm = String(name == null ? key.replace(/^p_/, '') : name).trim().slice(0, 60);
    const p = { id: key, name: nm, knowledge: {} };
    p.createdVia = String(via || 'unknown').slice(0, 40);
    p.createdAt = clockNow('registry');
    draft.people[key] = p;
    __created[p.createdVia] = (__created[p.createdVia] || 0) + 1;
    return { ok: true, created: true, reason: 'created', row: p };
  }
  /**
   * v2.86.0 A3 观测出口：人物条目来源分布 + **未标注行**。
   *   unlabeledCount > 0 只有两种可能：旧存档（本版之前建的条目），
   *   或有人又绕过了唯一写者。两种都需要被看见——这就是本出口存在的理由。
   */
  function personOriginStat() {
    let s = {};
    try { s = (WA.store && WA.store.get ? (WA.store.get() || {}) : {}); } catch (e) { s = {}; }
    const rows = Object.keys(s.people || {}).filter(function (k) {
      const p = s.people[k];
      return p && typeof p === 'object';
    });
    const unlabeled = rows.filter(function (k) { return !s.people[k].createdVia; });
    const byVia = {};
    rows.forEach(function (k) {
      const v = s.people[k].createdVia || '(未标注)';
      byVia[v] = (byVia[v] || 0) + 1;
    });
    return {
      rows: rows.length, byVia: byVia,
      unlabeledCount: unlabeled.length, unlabeled: unlabeled.slice(0, 12),
      createdThisRun: Object.assign({}, __created)
    };
  }
'''
s = swap(s, CORE_ANCHOR, CORE + CORE_ANCHOR, 'ensurePerson', REL)

old = "        const p = draft.people[id] = draft.people[id] || { id: id, name: nm, knowledge: {} };\n        p.profile = merged;"
new = ("        // v2.86.0 A3：创建走唯一写者（本文件自己也是调用方之一，不搞双重标准）。\n"
       "        ensurePerson(draft, id, nm, 'registry');\n"
       "        const p = draft.people[id];\n"
       "        p.profile = merged;")
s = swap(s, old, new, 'setProfileSafe', REL)

old = "    identityOf: identityOf,\n    idStat: idStat,\n    idClear: idClear,"
s = swap(s, old, "    identityOf: identityOf,\n    idStat: idStat,\n    idClear: idClear,\n    // v2.86.0 A3：people 条目的唯一写者 + 来源观测口（消费方：life/intel/backstage + 诊断）\n    ensurePerson: ensurePerson,\n    personOriginStat: personOriginStat,", 'export', REL)
write(REL, s)
print('OK %s  size=%d' % (REL, len(s.encode('utf-8'))))

# ══════════════════ 2. engines/life.js ══════════════════
REL = 'engines/life.js'
s = read(REL)
old = """  function person(draft, name) {
    const id = personId(name);
    return draft.people[id] || (draft.people[id] = { id: id, name: clean(name, 60), knowledge: {} });
  }"""
new = """  /**
   * v2.86.0 A3（事实唯一写者）：本函数**不再自己造人**，改为委托 registry.ensurePerson。
   *
   * 修前 `draft.people[id] || (draft.people[id] = {...})` 是一个「方便」的取值器，
   *   顺手把自己变成了创建者：写一条目标/承诺/日程就凭空多出一个人（占 cap 48 名额、
   *   把真在场上的人物挤出去），且条目上没有留下任何痕迹。
   *
   * 现口径：创建统一走 registry（唯一写者 + createdVia 标签）。
   *   合成宿主桩里没有 registry，此时保留**等价兜底**并打 `life:fallback` ——
   *   于是「产品运行时到底走没走唯一写者」可以由专锁断言，而不是靠读代码相信。
   */
  function person(draft, name) {
    const id = personId(name);
    if (!id) return null;
    const reg = WA.registry;
    if (reg && typeof reg.ensurePerson === 'function') {
      const r = reg.ensurePerson(draft, id, clean(name, 60), 'life');
      return r && r.row ? r.row : null;
    }
    return draft.people[id] || (draft.people[id] = { id: id, name: clean(name, 60), knowledge: {}, createdVia: 'life:fallback', createdAt: Date.now() });
  }"""
s = swap(s, old, new, 'person', REL)
write(REL, s)
print('OK %s  size=%d' % (REL, len(s.encode('utf-8'))))

# ══════════════════ 3. engines/intel.js（两处） ══════════════════
REL = 'engines/intel.js'
s = read(REL)
HELPER_ANCHOR = "  function clean(v, max) { return WA.inputGuard.text(v, max || 80); }"
HELPER = '''  /**
   * v2.86.0 A3（事实唯一写者）：创建委托 registry；无 registry 的合成桩走等价兜底。
   *   本模块此前两处各自内联建人（情报到期入账 / addIntel），现在都经这里。
   */
  function personRow(draft, id, name, via) {
    const reg = WA.registry;
    if (reg && typeof reg.ensurePerson === 'function') {
      const r = reg.ensurePerson(draft, id, name, via);
      return r && r.row ? r.row : null;
    }
    return draft.people[id] || (draft.people[id] = { id: id, name: name, knowledge: {}, createdVia: String(via) + ':fallback', createdAt: Date.now() });
  }
'''
s = swap(s, HELPER_ANCHOR, HELPER + HELPER_ANCHOR, 'personRow', REL)

old = "          const p = draft.people[id] || (draft.people[id] = { id: id, name: x.person, knowledge: {} });"
new = "          const p = personRow(draft, id, x.person, 'intel:release');\n          if (!p) { keep.push(x); return; }"
s = swap(s, old, new, 'releaseDue-row', REL)

old = "      const p = draft.people[id] || (draft.people[id] = { id: id, name: who, knowledge: {} });"
new = "      const p = personRow(draft, id, who, 'intel:add');"
s = swap(s, old, new, 'addIntel-row', REL)
write(REL, s)
print('OK %s  size=%d' % (REL, len(s.encode('utf-8'))))
print('DONE')