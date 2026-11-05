'use strict';
// 定位 transact 阻塞点：分别量 save() 与 裸 transact 内部各段。
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
      // 量 save() 本身（transact 内部唯一的重活候选）
      try {
        const t0 = performance.now();
        const ok = WA.store.save(WA.store.get());
        out.saveMs = Math.round(performance.now() - t0);
        out.saveOk = ok;
      } catch (e) { out.saveErr = String(e && e.message).slice(0, 140); }
      // 量 chatId
      try { out.chatId = String(WA.store.chatId()).slice(0, 40); } catch (e) { out.chatIdErr = String(e.message).slice(0, 80); }
      return out;
    }),
    new Promise(r => setTimeout(() => r({ __timeout: true }), 45000)),
  ]);
  console.log(JSON.stringify(r));
  await browser.close();
})().catch(e => { console.error('F ' + e.message.slice(0, 200)); process.exitCode = 1; });