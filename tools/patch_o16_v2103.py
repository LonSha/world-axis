#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.103.0 (A3 = O16) — run.js 十处 jsdom 静默跳过 → 零依赖替身真跑。

治的病：`try{require('jsdom')}catch{null}` + `if(!JSDOM){ console.log('⚠ 跳过') }`
       ⇒ 缺依赖时端到端一条不跑，回归照绿。本仓零 npm 依赖，替身（tests/ui-dom.js
       的 JSDOMShim）才是可持续的覆盖来源。

做法：**只加两行**，块体逐字不动 —— 最小侵入、可逐块对照。
      ① `if (!V) V = require('./ui-dom.js').JSDOMShim;`
      ② 把「静默跳过」分支改成 `assert(false, ...)`（防御最后防线：连替身都没了才算缺陷）
"""
import re
import sys

P = '/tmp/wa_git/tests/run.js'
src = open(P, encoding='utf-8').read()

pat = re.compile(
    r"try \{ (\w+) = require\('jsdom'\)\.JSDOM; \} catch \(e\) \{ try \{ \1 = require\('/tmp/node_modules/jsdom'\)\.JSDOM; \} catch \(e2\) \{ \1 = null; \} \}\n"
    r"( *)if \(!\1\) \{\n"
    r" *console\.log\('  (?:\\{1,2}u26a0) jsdom 不可用[^\n]*\n"
    r" *\} else \{"
)

hits = []


def repl(m):
    var, ind = m.group(1), m.group(2)
    hits.append(var)
    return (
        "try { %s = require('jsdom').JSDOM; } catch (e) { try { %s = require('/tmp/node_modules/jsdom').JSDOM; } catch (e2) { %s = null; } }\n"
        "%s// v2.103.0（A3 = O16）：缺 jsdom 时**不再静默跳过** —— 改走仓库自带的零依赖替身\n"
        "%s//   （tests/ui-dom.js 的 JSDOMShim，与 jsdom 同形：new JSDOM(html,{url}) → {window:{document,Node}}）。\n"
        "%s//   「缺依赖 ⇒ 静默少跑 ⇒ 回归照绿」让门禁结论与覆盖范围脱钩；本仓零 npm 依赖，替身才是可持续来源。\n"
        "%sif (!%s) %s = require('./ui-dom.js').JSDOMShim;\n"
        "%sif (!%s) {\n"
        "%s  assert(false, '端到端依赖与替身同时不可用 ⇒ 必须报红（不许静默跳过）');\n"
        "%s} else {"
        % (var, var, var, ind, ind, ind, ind, var, var, ind, var, ind + '  ', ind)
    )


out, n = pat.subn(repl, src)
print('命中替换数 =', n)
print('命中变量 =', hits)
print('剩余裸回退 =', len(re.findall(r"jsdom 不可用", out)))

if n != 10:
    print('!! 期望 10 处，实际 %d —— 整体放弃，不写半套' % n)
    sys.exit(1)

open(P, 'w', encoding='utf-8').write(out)
print('已写回', P)
