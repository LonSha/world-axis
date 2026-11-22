#!/bin/bash
# engines-ns-gate 双向自检
set -u
cd /home/user/wa_opt1 || exit 1
F=engines/cascade-bus.js
cp "$F" /tmp/cb.bak || exit 1

cat > /tmp/inject_ns.py <<'PY'
import io
p = 'engines/cascade-bus.js'
s = io.open(p, encoding='utf-8').read()
marker = u'  let _tickCounter = 0;'
i = s.index(marker)
# 在 tick 函数体开头插入一个恒假探测
j = s.index(chr(10), i) + 1
ins = u'\n    if (WA.engines.__bogusNsProbe__) { /* selftest */ }'
s = s[:j] + ins + s[j:]
io.open(p, 'w', encoding='utf-8').write(s)
print('[inject] ok at tick()')
PY

python3 /tmp/inject_ns.py || { cp /tmp/cb.bak "$F"; exit 1; }

echo "--- gate 应报警 ---"
timeout 300 node tests/engines-ns-gate.js > /tmp/neg.log 2>&1
NEG=$?
tail -6 /tmp/neg.log | grep -v WorldAxis

cp /tmp/cb.bak "$F"
echo ""
echo "--- 还原后应通过 ---"
timeout 300 node tests/engines-ns-gate.js > /tmp/pos.log 2>&1
POS=$?
tail -3 /tmp/pos.log | grep -v WorldAxis

echo ""
echo "NEG_EXIT=$NEG  POS_EXIT=$POS"
if [ "$NEG" = "1" ] && [ "$POS" = "0" ]; then
  echo "RESULT=SELF_TEST_PASS"
else
  echo "RESULT=SELF_TEST_FAIL"
fi