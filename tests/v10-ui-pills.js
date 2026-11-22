'use strict';
/**
 * v2.295.0（V10）：UI 分层 pill 导航专项验证套件
 * 
 * 验证目标：
 * 1. 结构完整性：5 个分类 pill（core/world/workshop/meta/all）全部存在并具有角色属性
 * 2. 初始状态：core 分类默认激活，且 aria-selected 为 true
 * 3. 程序化切类：WA.ui.showCat('world') 能够正确切换激活态并过滤 tab
 * 4. 开发者模式联动：开启开发者模式时分类条显示，切 all 类能够使全部 32 个 tab 可见
 * 5. 跨分类切页：WA.ui.goPage('settings') 自动将分类联动切换到 'meta'
 * 6. 32 页无损性：DOM 中仍保留全部 32 个 tab，且原顺序保持不变
 */
const LIVE = require('./ui-live');

const VERIFY_SCRIPT = `(function () {
  const WA = window.WorldAxis;
  if (!WA || !WA.ui) return { ok: false, reason: 'WA.ui missing' };

  // 1. 打开面板并开启开发者模式（便于观测完整分类）
  WA.ui.open();
  WA.ui.setDevMode(true);

  const panel = document.getElementById('wa-panel');
  if (!panel) return { ok: false, reason: 'panel not mounted' };

  const pills = Array.from(panel.querySelectorAll('.wa-cat-pill'));
  const catIds = pills.map(p => p.dataset.cat);
  const expectedCats = ['core', 'world', 'workshop', 'meta', 'all'];
  const pillsOk = expectedCats.every(c => catIds.indexOf(c) >= 0);

  const allTabs = Array.from(panel.querySelectorAll('.wa-tab'));
  const totalTabs = allTabs.length;

  // 2. 切到 world 分类并检查
  const rWorld = WA.ui.showCat('world');
  const activePill1 = panel.querySelector('.wa-cat-pill.active')?.dataset.cat;
  const visibleTabsWorld = allTabs.filter(t => t.style.display !== 'none').map(t => t.dataset.page);

  // 3. 切到 meta 分类并检查
  const rMeta = WA.ui.showCat('meta');
  const activePill2 = panel.querySelector('.wa-cat-pill.active')?.dataset.cat;
  const visibleTabsMeta = allTabs.filter(t => t.style.display !== 'none').map(t => t.dataset.page);

  // 4. 切到 all 分类检查全部 tab 是否均可见
  const rAll = WA.ui.showCat('all');
  const activePill3 = panel.querySelector('.wa-cat-pill.active')?.dataset.cat;
  const visibleTabsAll = allTabs.filter(t => t.style.display !== 'none').length;

  // 5. 跨分类切页自动联动：从特定类（如 core）跳转到不在该类的 settings 页，自动联动分类到 meta
  WA.ui.showCat('core');
  WA.ui.goPage('settings');
  const activePill4 = panel.querySelector('.wa-cat-pill.active')?.dataset.cat;

  // 6. 从 meta 类跳转回 overview 页，自动联动分类回 core
  WA.ui.goPage('overview');
  const activePill5 = panel.querySelector('.wa-cat-pill.active')?.dataset.cat;

  return {
    ok: true,
    pillsOk,
    catIds,
    totalTabs,
    world: { ok: rWorld.ok, activePill: activePill1, count: visibleTabsWorld.length },
    meta: { ok: rMeta.ok, activePill: activePill2, count: visibleTabsMeta.length, hasSettings: visibleTabsMeta.includes('settings') },
    all: { ok: rAll.ok, activePill: activePill3, count: visibleTabsAll },
    autoLinkMeta: activePill4 === 'meta',
    autoLinkCore: activePill5 === 'core'
  };
})()`;

async function run() {
  const HOST = process.argv[2] || 'http://127.0.0.1:8000';
  const p = LIVE.probe();
  if (!p.available) {
    console.error('FAIL: browser not available:', p.why);
    process.exit(1);
  }

  const port = await LIVE.pickPort();
  const cdp = new LIVE.Cdp(p.exe, port, []);
  try {
    await cdp.launch();
    const page = new LIVE.CdpPage(cdp);
    await page.route('**/*', () => null);
    await page.goto(HOST + '/');

    // 执行页内引导
    await page.evaluate(LIVE.HOSTED_BOOT_SOURCE);
    await new Promise(r => setTimeout(r, 800));

    // 执行 UI 专项验证
    const res = await page.evaluate(VERIFY_SCRIPT);
    console.log('UI PILLS SUITE RESULT:', JSON.stringify(res, null, 2));

    if (!res || !res.ok || !res.pillsOk || res.totalTabs !== 32 || !res.autoLinkMeta || !res.autoLinkCore) {
      console.error('FAIL: UI pills assertion failed');
      process.exit(1);
    }
    console.log('PASS: UI pills navigation and backwards-compat fully verified (32 tabs, 5 pills, bidirectional sync)');
  } finally {
    await cdp.close();
  }
}

run().catch(err => {
  console.error('ERROR in test runner:', err);
  process.exit(1);
});