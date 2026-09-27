#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把 v2.107.0 的 R91 段写入 ITERATION_LOG.md（插在 R90 之前），并把 v2.107.0 条目写入 FOUR_VERSION_PLAN.md（插在「## 完成纪律」之前）。"""
import io, sys

ROOT = '/tmp/wa_git/'

def read(p):
    with io.open(p, encoding='utf-8') as f:
        return f.read()

def write(p, s):
    with io.open(p, 'w', encoding='utf-8') as f:
        f.write(s)

# ---- ITERATION_LOG：R91 插在 R90 之前 ----
LOG = ROOT + 'ITERATION_LOG.md'
log = read(LOG)
if '### R91 ·' in log:
    print('SKIP ITERATION_LOG：已含 R91')
else:
    anchor = '### R90 · 2026-09-27'
    if log.count(anchor) != 1:
        print('ABORT：ITERATION_LOG 锚点命中 %d 次' % log.count(anchor)); sys.exit(1)
    seg = read('/tmp/r91_section.md').rstrip('\n') + '\n'
    log2 = log.replace(anchor, seg + '\n' + anchor)
    assert log2 != log
    write(LOG, log2)
    print('OK ITERATION_LOG +%d chars' % (len(log2) - len(log)))

# ---- FOUR_VERSION_PLAN：v2.107.0 条目插在「## 完成纪律」之前 ----
PLAN = ROOT + 'FOUR_VERSION_PLAN.md'
plan = read(PLAN)
if '## v2.107.0 ' in plan:
    print('SKIP FOUR_VERSION_PLAN：已含 v2.107.0')
else:
    anchor = '## 完成纪律'
    if plan.count(anchor) != 1:
        print('ABORT：FOUR_VERSION_PLAN 锚点命中 %d 次' % plan.count(anchor)); sys.exit(1)
    seg = read('/tmp/plan_v2107.md').rstrip('\n') + '\n\n'
    plan2 = plan.replace(anchor, seg + anchor)
    assert plan2 != plan
    write(PLAN, plan2)
    print('OK FOUR_VERSION_PLAN +%d chars' % (len(plan2) - len(plan)))