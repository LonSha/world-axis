#!/bin/bash
# v2.230.0 收尾：建立干净 HEAD 基线（红集差集判定用）
set -u
cd /home/user/wa_git
git worktree remove --force /tmp/wa_base 2>/dev/null
rm -rf /tmp/wa_base
git worktree add --detach /tmp/wa_base HEAD 2>&1 | tail -2
echo "=== 基线 HEAD ==="
git -C /tmp/wa_base log --oneline -1
grep -n "const VERSION" /tmp/wa_base/index.js | head -1
echo "=== 基线跑 6 道门禁 ==="
cd /tmp/wa_base
for g in tests/dead-export-gate.js tests/module-registry-gate.js tests/dup-decl-gate.js tests/field-liveness-gate.js tests/version-surface-gate-v2185.js tools/doc-gate.js; do
  n=$(basename $g .js)
  timeout 180 node $g > /tmp/base_$n.log 2>&1
  echo "$g EXIT=$? | $(tail -1 /tmp/base_$n.log)"
done
echo DONE