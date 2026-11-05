'use strict';
// 决定性测试：在真实宿主里量 transact 本身的耗时。若它本身就慢，则「慢」是产品既有行为，
// 不是 inline-tags 引入的；若它快，则慢在我这边的调用方式。
const { chromium } = require('/home/user/pwlib/node_modules/playwright-core');
const EXE = '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8000', { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__WORLD_AXIS_LOADED__, null, { timeout: 60000 });
  await page.waitForTimeout(3000);

  const r = await Promise.race([
    page.evaluate(() => {
      const WA = window.WorldAxis;
      const out = {};
      // ① 裸 transact 一次（不带任何 inline-tags 代码）
      try {
        const t0 = performance.now();
        WA.store.transact(function (d) { d.__probe = 1; });
        out.rawTransactMs = Math.round(performance.now() - t0);
      } catch (e) { out.rawTransactErr = String(e && e.message).slice(0, 120); }
      // ② 第二次（看是否只有首次慢，例如懒初始化）
      try {
        const t0 = performance.now();
        WA.store.transact(function (d) { d.__probe = 2; });
        out.secondTransactMs = Math.round(performance.now() - t0);
      } catch (e) { out.secondTransactErr = String(e && e.message).slice(0, 120); }
      // ③ clock 段是否存在
      const st = WA.store.get() || {};
      out.hasClock = !!(st.clock && typeof st.clock === 'object');
      out.keys = Object.keys(st).length;
      return out;
    }),
    new Promise(r => setTimeout(() => r({ __timeout: true }), 60000)),
  ]);

  console.log(JSON.stringify(r));
  await browser.close();
})().catch(e => { console.error('F ' + e.message.slice(0, 200)); process.exitCode = 1; });