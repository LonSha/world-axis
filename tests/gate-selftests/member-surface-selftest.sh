#!/bin/bash
# 成员面门禁负向自检 (v2.381.0)
# 目的：证明门禁真的能抓到「产品代码调用了不存在的成员」，而不是恒绿。
# 做法：向 engines/ 注入一处真实形态的非法调用 → 门禁必须判红且指出该文件；
#       还原 → 门禁必须回到绿。
set -u
cd /home/user/wa_opt1 || exit 2

TARGET="engines/court-intrigue.js"
BAK="/tmp/mgs_selftest.bak"
cp "$TARGET" "$BAK" || { echo "备份失败"; exit 2; }

restore() { cp "$BAK" "$TARGET"; }
trap restore EXIT

echo "=== [1] 基线：门禁应为绿 ==="
node tests/member-surface-gate.js >/tmp/mgs_base.out 2>&1
BASE_EXIT=$?
echo "BASE_EXIT=$BASE_EXIT"
tail -1 /tmp/mgs_base.out
if [ $BASE_EXIT -ne 0 ]; then
  echo "✗ 基线不是绿的，自检无意义"
  exit 1
fi

echo ""
echo "=== [2] 注入产品侧非法成员调用 ==="
python3 - <<'PY'
import io
p = 'engines/court-intrigue.js'
s = io.open(p, encoding='utf-8').read()
anchor = '  WA.engines.courtIntrigue = courtIntrigue;'
assert s.count(anchor) == 1, 'anchor=%d' % s.count(anchor)
inject = ('  // selftest: \u6545\u610f\u8c03\u7528\u4e00\u4e2a\u4e0d\u5b58\u5728\u7684\u6210\u5458\n'
          '  courtIntrigue.__gateSelfTestProbe = function () {\n'
          '    return WA.events.thisMemberDoesNotExistAtAll(1);\n'
          '  };\n' + anchor)
s = s.replace(anchor, inject)
io.open(p, 'w', encoding='utf-8').write(s)
print('injected')
PY

echo "--- 门禁输出（应判红并点名 court-intrigue.js）---"
node tests/member-surface-gate.js >/tmp/mgs_neg.out 2>&1
NEG_EXIT=$?
echo "NEG_EXIT=$NEG_EXIT"
grep -E 'thisMemberDoesNotExistAtAll|门禁失败|产品侧越界' /tmp/mgs_neg.out | head -8

echo ""
echo "=== [3] 还原后应回到绿 ==="
restore
node tests/member-surface-gate.js >/tmp/mgs_pos.out 2>&1
POS_EXIT=$?
echo "POS_EXIT=$POS_EXIT"
tail -1 /tmp/mgs_pos.out

echo ""
echo "=== 裁定 ==="
if [ $NEG_EXIT -ne 0 ] && [ $POS_EXIT -eq 0 ]; then
  echo "RESULT=SELF_TEST_PASS"
  exit 0
else
  echo "RESULT=SELF_TEST_FAIL (neg=$NEG_EXIT pos=$POS_EXIT)"
  exit 1
fi