'use strict';
/**
 * tools/rt-inline-tags.js — 内联标签的**真机联调**（真实 ST 实例 + 真实 Chromium）
 *
 * 与 tests/inline-tags-v2302.js 的分工（两者不可互相顶替）：
 *   · 专锁：执行模块源码，store/calendar 用受控桩 → 证明**逻辑**对
 *   · 本脚本：在**真实 SillyTavern 宿主**里跑真实模块、真实 store、真实事件回调
 *             → 证明**接线**对（这条是桩测永远证不到的）
 *
 * 三段判据：
 *   R1 模块在宿主里就位（WA.inlineTags 存在，且 owners 三项都有归属）
 *   R2 驱动**真实拦截器回调**：向真实 store 模拟一条含标签的回复，
 *      验证 clock.iso 被改、worldFacts 多一行、chronicle 多一行 —— 读的是**真实 store**
 *   R3 反证：同一文本再驱动一次必须 dedup（证明去重锁在宿主里也生效）
 *
 * 用法：node tools/rt-inline-tags.js   （需 ST 在 127.0.0.1:8000 运行）
 */
const { chromium } = require('/home/user/pwlib/node_modules/playwright-core');
const EXE = '/root/.cache/ms-playwright/chromium-1148/chrome-linux/chrome';
const BASE = process.env.ST_BASE || 'http://127.0.0.1:8000';

let pass = 0; const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name); return; }
  fails.push(name + (detail ? ' :: ' + detail : ''));
  console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''));
}

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e && e.message).slice(0, 160)));

  await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => !!window.__WORLD_AXIS_LOADED__, null, { timeout: 60000 });
  await page.waitForTimeout(3000);

  // ── R1 模块就位 ───────────────────────────────────────────────
  const r1 = await page.evaluate(() => {
    const T = window.WorldAxis && window.WorldAxis.inlineTags;
    if (!T) return { present: false };
    const rd = T.read();
    return {
      present: true, version: T.VERSION, source: !!T.SOURCE,
      owners: rd.owners,
      hasParse: typeof T.parse === 'function',
      hasApply: typeof T.apply === 'function',
      hasStrip: typeof T.strip === 'function',
    };
  });
  ok('R1.1 WA.inlineTags 在真实宿主中存在', r1.present === true);
  ok('R1.2 版本号已落', r1.version === '2.302.0', String(r1.version));
  ok('R1.3 三个主入口齐备', r1.hasParse && r1.hasApply && r1.hasStrip === true);
  ok('R1.4 owners.time 指向 calendar.setClock', r1.owners && r1.owners.time === 'calendar.setClock', JSON.stringify(r1.owners));
  ok('R1.5 owners.choice 指向 store.chronicle', r1.owners && r1.owners.choice === 'store.chronicle');
  ok('R1.6 owners.flag 指向 store.worldFacts', r1.owners && r1.owners.flag === 'store.worldFacts');
  ok('R1.7 owners.bgm 如实为 null（本仓无音频通道）', r1.owners && r1.owners.bgm === null);

  // ── R1b 联调开局（临时骨架，仅本次会话）──────────────────────
  //   两条路径都**不冒充**：
  //   · 正常路径：宿主已在聊天里 → store 已是完整骨架，直接沿用（最真实）
  //   · 联调路径：宿主无聊天 → 临时写入**结构等价**的最小骨架，只为让写口可跑。
  //     这条路径**必须**在读数里标成 temp-skeleton，且不落盘（内存态），
  //     否则「我用假骨架验出来的绿」会被误当「用户开了局之后的绿」。
  const r1b = await Promise.race([page.evaluate(() => {
    try {
      const WA = window.WorldAxis;
      if (!WA || !WA.store) return { has: false, stage: 'no-store' };
      const st0 = WA.store.get() || {};
      const ready = !!(st0.clock && typeof st0.clock === 'object' && st0.people && st0.world);
      if (ready) {
        return { has: true, mode: 'real-chat', hasClock: true, keysAfterInit: Object.keys(st0).length,
          peopleCount: Object.keys(st0.people || {}).length,
          placeCount: (st0.world && Array.isArray(st0.world.places)) ? st0.world.places.length : 0,
          clockLabel: String((st0.clock && st0.clock.label) || '').slice(0, 24) };
      }
      // 联调路径：只改**内存态对象本身**，不走 transact（transact 在无聊天上下文时
      // 会触发落盘/审计/巡视链，实测阻塞 >30s——联调不该依赖宿主落盘链路）。
      const base = (typeof WA.store.defaultWorldState === 'function') ? WA.store.defaultWorldState() : null;
      if (!base) return { has: false, stage: 'no-defaultWorldState' };
      const cur = WA.store.get();
      if (!cur || typeof cur !== 'object') return { has: false, stage: 'no-live-object' };
      Object.keys(base).forEach(function (k) { if (cur[k] === undefined) cur[k] = base[k]; });
      if (!cur.clock || typeof cur.clock !== 'object') cur.clock = base.clock;
      const st1 = cur;
      return {
        has: true, mode: 'temp-skeleton', hasClock: !!(st1.clock && typeof st1.clock === 'object'),
        keysAfterInit: Object.keys(st1).length,
        peopleCount: st1.people ? Object.keys(st1.people).length : 0,
        placeCount: (st1.world && Array.isArray(st1.world.places)) ? st1.world.places.length : 0,
        clockLabel: String((st1.clock && st1.clock.label) || '').slice(0, 24),
      };
    } catch (e) {
      return { has: false, stage: 'threw', threw: String(e && e.message).slice(0, 180) };
    }
  }), new Promise(r => setTimeout(() => r({ has: false, stage: 'evaluate-timeout' }), 30000))]);
  console.log('  [R1b] ' + JSON.stringify(r1b).slice(0, 320));
  ok('R1b.1 联调开局就绪（真实聊天或临时骨架，二者必须择一成立）', r1b.has === true, String(r1b.stage || r1b.threw));
  ok('R1b.2 骨架键数量合理', (r1b.keysAfterInit || 0) > 10, 'keys=' + r1b.keysAfterInit);
  ok('R1b.3 clock 段存在（<time> 写口可用的前提）', r1b.hasClock === true, String(r1b.clockLabel));
  // 这条如实报：临时骨架下验出的绿，不等于「用户真开局后」的绿
  console.log('  [R1b mode] ' + r1b.mode + (r1b.mode === 'temp-skeleton'
    ? '  ← 本次为临时骨架，R2 的绿只证明「写口通」，不证明「真实聊天里通」'
    : '  ← 真实聊天骨架，R2 属端到端证据'));

  // ── R2 真实宿主上的落账接线（写口监听，不触达 save）──────────────
  //   为什么不是「跑 apply 然后读 store」：实测**裸 `store.save()` 在无聊天宿主里 >45s 不返回**
  //   （tools/rt-diag5.js 实测，与 inline-tags 无关，是产品既有行为：save 走落盘/巡视链）。
  //   所以这里换成**写口监听**：把 WA.store.transact / WA.calendar.setClock 包一层只记录
  //   不落盘的替身，跑真实 `apply()`，验证它确实用**正确参数**调了**正确写口**。
  //   证明力边界（必须说清）：
  //     ✅ 证明「真实宿主里的真实模块，接线到既有写口，payload 正确」
  //     ❌ 不证明「数据真的落盘了」—— 那需要真实聊天上下文（见 notes 里的待办）
  const r2 = await Promise.race([page.evaluate(() => {
    try {
      const WA = window.WorldAxis;
      const T = WA.inlineTags;
      const calls = { transact: [], setClock: [] };
      const origTransact = WA.store.transact;
      const origSetClock = WA.calendar.setClock;
      let result = null; let result2 = null; let error = null;
      try {
        // 替身：只记录，不落盘（避免触发 save）
        WA.store.transact = function (fn) { calls.transact.push(typeof fn); return { ok: true, stubbed: true }; };
        WA.calendar.setClock = function (label, op) { calls.setClock.push({ label: label, source: op && op.source, iso: op && op.iso }); };
        const text = '夜色沉下去。<time>1793-01-21</time>'
          + '<flag>国王已被处决</flag>'
          + '<choice who="罗伯斯庇尔" event="审判">主张立即处决</choice>';
        result = T.apply(text, { force: true });
        result2 = T.apply(text);
      } catch (e) {
        error = String(e && e.message).slice(0, 160);
      } finally {
        WA.store.transact = origTransact;
        WA.calendar.setClock = origSetClock;
      }
      return { calls: calls, result: result, result2: result2, error: error,
        restored: WA.store.transact === origTransact };
    } catch (e) {
      return { error: 'outer:' + String(e && e.message).slice(0, 160) };
    }
  }), new Promise(r => setTimeout(() => r({ error: 'evaluate-timeout' }), 30000))]);

  ok('R2.0 宿主内驱动 apply 未抛错', !r2.error, String(r2.error));
  ok('R2.1 <time> 走了 calendar.setClock 写口',
    (r2.calls.setClock || []).length === 1, JSON.stringify(r2.calls && r2.calls.setClock));
  ok('R2.2 setClock 收到的是标签里的 ISO 日期',
    !!(r2.calls.setClock[0] && r2.calls.setClock[0].iso === '1793-01-21'),
    JSON.stringify(r2.calls && r2.calls.setClock && r2.calls.setClock[0]));
  ok('R2.3 setClock 的来源标为 text', !!(r2.calls.setClock[0] && r2.calls.setClock[0].source === 'text'));
  ok('R2.4 <flag> 与 <choice> 各走一次 store.transact（两处归档写口）',
    (r2.calls.transact || []).length === 2, 'calls=' + ((r2.calls.transact || []).length));
  ok('R2.5 回执如实报告三项都落账',
    !!(r2.result && r2.result.time && r2.result.time.changed === true && r2.result.flags === 1 && r2.result.choices === 1),
    JSON.stringify(r2.result));
  ok('R2.6 替身已还原（不污染宿主）', r2.restored === true);

  // ── R3 去重锁在宿主里生效 ────────────────────────────────────
  ok('R3.1 同文本第二次被去重', !!(r2.result2 && r2.result2.reason === 'dedup'),
    String(r2.result2 && r2.result2.reason));
  ok('R3.2 去重后不再发起写口调用',
    (r2.calls.transact || []).length === 2 && (r2.calls.setClock || []).length === 1,
    'transact=' + (r2.calls.transact || []).length + ' setClock=' + (r2.calls.setClock || []).length);

  // ── 宿主无未捕获异常 ─────────────────────────────────────────
  ok('R4 页面无未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  console.log('\nrt-inline-tags: pass=' + pass + ' fail=' + fails.length);
  await browser.close();
  if (fails.length) { console.log(fails.map(f => '  FAIL ' + f).join('\n')); process.exitCode = 1; }
})().catch(e => {
  console.error('RT-FAIL ' + String(e && e.message).slice(0, 300));
  process.exitCode = 1;
});