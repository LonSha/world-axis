# -*- coding: utf-8 -*-
"""v2.86.0 A3 补片：backstage.js 两处 people 创建收敛到 registry.ensurePerson。"""
import io, sys, ast
BASE = '/tmp/wa_git/'
REL = 'engines/backstage.js'
s = io.open(BASE + REL, encoding='utf-8').read()


def swap(src, old, new, tag):
    n = src.count(old)
    if n != 1:
        print('ABORT: anchor hits=%d (must be 1) :: %s' % (n, tag))
        sys.exit(2)
    return src.replace(old, new)


# 处 1：人物入账（applyResult 里的 people 合并）——这里是**读旧值再合并**，
#   旧形态的 `|| { id, name, knowledge: {} }` 只是给 Object.assign 一个空基座，
#   仍属「生成条目」的分散写法 ⇒ 一并收敛。
old1 = "        const old = draft.people[id] || { id, name: p.name, knowledge: {} };"
new1 = ("        // v2.86.0 A3：空基座也走唯一写者（本处原本只是一行兜底，\n"
        "        //   但它是「条目从哪来」这条链上的第二个入口，一并收敛）。\n"
        "        const old = draft.people[id] || (WA.registry && WA.registry.ensurePerson\n"
        "          ? (WA.registry.ensurePerson(draft, id, p.name, 'backstage').row || { id, name: p.name, knowledge: {} })\n"
        "          : (draft.people[id] = { id, name: p.name, knowledge: {}, createdVia: 'backstage:fallback', createdAt: Date.now() }));")
s = swap(s, old1, new1, 'backstage-merge')

# 处 2：认知边界入账
old2 = "        const person = draft.people[id] = draft.people[id] || { id, name: k.person, knowledge: {} };"
new2 = ("        // v2.86.0 A3：创建走唯一写者。\n"
        "        const person = draft.people[id] || ((WA.registry && WA.registry.ensurePerson)\n"
        "          ? (WA.registry.ensurePerson(draft, id, k.person, 'backstage').row || draft.people[id])\n"
        "          : (draft.people[id] = { id, name: k.person, knowledge: {}, createdVia: 'backstage:fallback', createdAt: Date.now() }));")
s = swap(s, old2, new2, 'backstage-knowledge')

io.open(BASE + REL, 'w', encoding='utf-8').write(s)
print('OK %s  size=%d' % (REL, len(s.encode('utf-8'))))
print('DONE')