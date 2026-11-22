#!/bin/bash
# 负向验证：临时注入一个非法 settingsBus.write 调用，看门禁是否报警，然后还原
set -u
cd /home/user/wa_opt1 || exit 1
cp engines/court-intrigue.js /tmp/ci.bak || exit 1

python3 -c "
import io
p='engines/court-intrigue.js'
s=io.open(p,encoding='utf-8').read()
a='    return merged;\n  }\n'
b='    WA.settingsBus.write(__REG, merged);\n    return merged;\n  }\n'
assert s.count(a)==1, s.count(a)
io.open(p,'w',encoding='utf-8').write(s.replace(a,b,1))
print('[inject] ok')
"

echo "--- 注入后 grep ---"
grep -n 'settingsBus.write' engines/court-intrigue.js
echo ""
echo "--- gate 应当报警 ---"
node tests/settings-bus-api-gate.js
NEG=$?
echo "NEG_EXIT=$NEG"

cp /tmp/ci.bak engines/court-intrigue.js
echo ""
echo "--- 还原后 gate 应当通过 ---"
node tests/settings-bus-api-gate.js
POS=$?
echo "POS_EXIT=$POS"

if [ "$NEG" = "1" ] && [ "$POS" = "0" ]; then
  echo "RESULT=SELF_TEST_PASS (判据双向有效)"
else
  echo "RESULT=SELF_TEST_FAIL"
fi