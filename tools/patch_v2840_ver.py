#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v2.84.0 版本升档：入口 / 清单 / 回归断言字面量。

为什么要有这个脚本（而不是手改）：
  「2.83.0」在 tests/run.js 里有 8 处**断言字面量**（入口版本锚点），另有若干处
  历史注释与之同形。逐处手改既会漏，也会把注释一起替换掉。本脚本按锚点精确替换，
  并在替换后**复算命中数**——命中数不等于期望值就整体放弃（不做半途而废的替换）。
"""
import io
import sys

BASE = '/tmp/wa_git'

# (文件, [(锚点, 替换, 期望命中数)])
PLAN = [
    ('index.js', [("const VERSION = '2.83.0';", "const VERSION = '2.84.0';", 1)]),
    ('manifest.json', [('"version": "2.83.0"', '"version": "2.84.0"', 1)]),
    ('tests/run.js', [
        # 8 处「入口版本 == 当前版本」的断言字面量（v2500/v2600/v2800/v2900/v2100v/v2110 各套件）
        ("=== '2.83.0'", "=== '2.84.0'", 8),
        # 同 8 处的**可读文案**（失败时给人看的那一行也会跟着过时）
        ('入口版本为 2.83.0', '入口版本为 2.84.0', 5),
        ('入口 VERSION = 2.83.0', '入口 VERSION = 2.84.0', 1),
    ]),
]


def main():
    total = 0
    for rel, edits in PLAN:
        p = '%s/%s' % (BASE, rel)
        src = io.open(p, encoding='utf-8').read()
        out = src
        for anchor, repl, expect in edits:
            hits = out.count(anchor)
            if anchor.startswith('==='):
                # 「=== '2.83.0'」是前缀式锚点：命中数须与期望值逐字相等
                if hits != expect:
                    print('中止：%s 中 %r 命中 %d 次（期望 %d）' % (rel, anchor, hits, expect))
                    return 2
            elif hits != expect:
                print('中止：%s 中 %r 命中 %d 次（期望 %d）' % (rel, anchor, hits, expect))
                return 2
            out = out.replace(anchor, repl)
            total += hits
        if out != src:
            io.open(p, 'w', encoding='utf-8').write(out)
            print('已改写 %s' % rel)
    print('替换总数：%d' % total)
    return 0


if __name__ == '__main__':
    sys.exit(main())
