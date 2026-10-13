#!/usr/bin/env node
'use strict';
/**
 * tools/hosted_smoke.js —— **真宿主（SillyTavern）冒烟**：拿一个真酒馆 URL 跑 `runLiveHosted`。
 *
 * 用法：node tools/hosted_smoke.js <url>
 *   例：node tools/hosted_smoke.js http://127.0.0.1:8000
 *
 * 为什么要有它（优化 3 的口径）：
 *   · 「真实宿主验收」必须**当场可复跑**，而不是只留一份一次性读数；
 *   · 真宿主缺席时**如实未执行**（退非零并打理由），不静默、也不拿桩顶替；
 *   · 桩面（`runLive`）与真宿主面（`runLiveHosted`）**分报**，本冒烟只报后者。
 */
const LIVE = require('./../tests/ui-live.js');

const url = process.argv[2];
if (!url) {
  console.log('HOSTED-SMOKE: 未给 URL ⇒ 未执行（用法：node tools/hosted_smoke.js <url>）');
  process.exit(2);
}

LIVE.runLiveHosted({ url: url }).then(function (o) {
  console.log('=== 真宿主冒烟读数');
  console.log('  tier=' + o.tier + ' driver=' + o.driver);
  console.log('  host=' + o.host + ' hostVersion=' + o.hostVersion);
  console.log('  url=' + o.url);
  console.log('  loadPath=' + o.loadPath + '（host=宿主自己装载 / manual-script=退到真 DOM 装载链）');
  console.log('  waLoaded=' + o.waLoaded + ' waVersion=' + o.waVersion + ' panelMounted=' + o.panelMounted);
  console.log('  pages=' + o.pages + ' controls=' + o.controls + ' waitedMs=' + o.waitedMs);
  console.log('  thrown=' + o.thrown.length + ' rej=' + (o.rejections || []).length
    + ' pageErr=' + o.pageErrors.length + ' consoleErr=' + o.consoleErrors.length);
  console.log('  loadErrors=' + JSON.stringify((o.loadErrors || []).slice(0, 5)));
  console.log('  errors=' + JSON.stringify((o.errors || []).slice(0, 5)));
  console.log('  roundtrip=' + JSON.stringify(o.roundtrip && o.roundtrip.ok));
  if (o.thrown.length) console.log('  抛出样本=' + JSON.stringify(o.thrown.slice(0, 3)));
  if (o.pageErrors.length) console.log('  页错样本=' + JSON.stringify(o.pageErrors.slice(0, 3)));

  // 环境类页错单列（**不**算产品失败）：headless Chromium 默认拒 `navigator.clipboard.writeText`
  //   （无用户手势 + 未授权）⇒ 面板的「复制」按钮会抛 `NotAllowedError`。
  //   真机上用户点击**就是**手势，该错误不会出现。把它算成产品缺陷会掩盖真正的产品页错 ——
  //   故按类分流：`envNotes` 如实登记，`pageErrors` 只留非环境类。
  const ENV_PAGE_ERR = /NotAllowedError|Clipboard|writeText|permission denied/i;
  const envPageErrs = o.pageErrors.filter(function (m) { return ENV_PAGE_ERR.test(m); });
  const realPageErrs = o.pageErrors.filter(function (m) { return !ENV_PAGE_ERR.test(m); });
  if (envPageErrs.length) console.log('  环境类页错（非产品缺陷，' + envPageErrs.length + '）: '
    + JSON.stringify(envPageErrs.slice(0, 2)));

  const ok = o.host === 'sillytavern' && o.waLoaded && o.panelMounted
    && o.thrown.length === 0 && (o.loadErrors || []).length === 0 && realPageErrs.length === 0;
  console.log('HOSTED-SMOKE: ' + (ok ? 'PASS' : 'FAIL')
    + '（真宿主=' + o.host + ' 装载路径=' + o.loadPath + ' 面板=' + o.panelMounted
    + ' 页数=' + o.pages + ' 控件=' + o.controls
    + ' 产品页错=' + realPageErrs.length + ' 环境页错=' + envPageErrs.length + '）');
  process.exit(ok ? 0 : 1);
}).catch(function (e) {
  console.error('HOSTED-SMOKE 异常: ' + ((e && e.stack) || e));
  process.exit(3);
});