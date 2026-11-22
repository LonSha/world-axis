#!/bin/bash
# tests/engines-ns-gate.js 的词法剥离自检（v2.381.0）
#
# 为什么要这一步：
#   本轮修 engines-ns-gate 的「不剥注释」缺陷时，必须先证明**修好了**，
#   而不是「恰好现在仓库里没有那种写法」。判据只有一条：同一段文本，
#   放在注释里不许红，放在代码里必须红。二者缺一，剥离就是假的。
#
#   ① NEG 注释型：往一个**真实被扫的文件**里塞注释 `WA.engines.ghostEngine.foo`
#      → 期望门禁仍然绿（说明注释被剥离）。
#   ② POS 代码型：同一段落改成真实读引用
#      → 期望门禁变红并且**点名 ghostEngine**（说明剥离没有把真引用一起吞掉）。
#   ③ 还原 → 期望重新变绿。
#   ②③ 合起来才排除了「门禁干脆什么都没扫」这种"稳定绿"的假通过。
#
# 判据用**退出码**不解析 stdout：本门禁在 --json 下仍会先打装载日志，混进 JSON 会解析失败
#   （首版按 JSON 解析 ⇒ UNPARSED，属测试装置的错，不是门禁的错）。退出码才是真信号。
cd "$(dirname "$0")/../.." || exit 1
ROOT="$(pwd)"
TARGET="$ROOT/engines/court-intrigue.js"
BAK="$(mktemp /tmp/engines-ns-selftest.XXXXXX.bak)"
cp "$TARGET" "$BAK"
trap 'cp "$BAK" "$TARGET"; rm -f "$BAK"' EXIT

run_gate() { node tests/engines-ns-gate.js 2>&1 | grep -v '^\[WorldAxis\]' > /tmp/ens.out; return "${PIPESTATUS[0]}"; }

echo '--- 0) 基线（期望 exit 0）---'
run_gate; BASE=$?
echo "exit=$BASE"
if [ "$BASE" -ne 0 ]; then echo "SELFTEST_FAIL(基线不是绿的，无法判断增量)"; sed -n '1,5p' /tmp/ens.out; exit 1; fi

echo '--- 1) NEG：注入注释形态（必须仍 exit 0）---'
printf '\n// SELFTEST-NEG: 这里只是注释 WA.engines.ghostEngine.foo 不该被当引用\n' >> "$TARGET"
run_gate; NEG=$?
echo "exit=$NEG"
if [ "$NEG" -ne 0 ]; then echo "SELFTEST_FAIL(注释被当成代码：剥离注释失效)"; grep 'ghost' /tmp/ens.out | head -3; exit 1; fi
cp "$BAK" "$TARGET"

echo '--- 2) POS：注入真实读引用（必须非 0 且点名）---'
printf '\nfunction __selftestPosHook__(){ return WA.engines.ghostEngine.foo; }\n' >> "$TARGET"
run_gate; POS=$?
echo "exit=$POS"
if [ "$POS" -eq 0 ]; then echo "SELFTEST_FAIL(真引用没被抓到：剥离把代码一起吞了)"; exit 1; fi
if ! grep -q 'ghostEngine' /tmp/ens.out; then echo "SELFTEST_FAIL(红了但没点名 ghostEngine)"; exit 1; fi
grep 'ghostEngine' /tmp/ens.out | head -2

echo '--- 3) 还原后必须复绿（exit 0）---'
cp "$BAK" "$TARGET"
run_gate; AFTER=$?
echo "exit=$AFTER"
if [ "$AFTER" -ne 0 ]; then echo "SELFTEST_FAIL(还原后未复绿)"; exit 1; fi

echo "ENGINES_NS_STRIP_SELFTEST_PASS"