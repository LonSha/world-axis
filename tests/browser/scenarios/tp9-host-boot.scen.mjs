/* ============================================================
 * tests/browser/scenarios/tp9-host-boot.scen.mjs
 * TP9「真实宿主」栏 —— 装载链与真 DOM 冒烟 [L4]
 * ------------------------------------------------------------
 * 本场景回答的问题，全部是**无头回归结构性答不了**的那几个：
 *
 *   B1 baseUrl 取自 DOM        —— `index.js` 的 getBaseUrl() 有两条路：
 *                                 ① 从含 `WorldAxis/index.js` 的 script src 上切；
 *                                 ② 回退到写死的扩展目录惯例。
 *                                 无头 vm 里没有 script 标签 ⇒ 永远走②，
 *                                 于是「①能不能取到真值」这一条从来没有读数。
 *   B2 模块真被网络装载         —— 模块经 loadScriptOnce() 插 `<script src>` 装载，
 *                                 失败是**静默 onerror**。进程侧读 served[] 台账，
 *                                 于是「模块图是否真被拉下来」可读。
 *   B3 真 DOM 挂载              —— ui/panel.js 的 mount() 走 createElement/innerHTML/
 *                                 querySelector，并在真排版下产出有宽高的盒子。
 *   B4 注入通道存在             —— render/inject 落地走 ctx.setExtensionPrompt；
 *                                 本场景验证宿主桩确实收到调用（通道可写）。
 *   B5 越权宿主访问             —— 桩的 Proxy 记录「读了宿主上不存在的键」。
 *                                 真宿主上那就是 undefined ⇒ 功能静默失效。
 *
 * 判据纪律（本仓既有）：每条判据都带**非零下限或真值比对**，不做「抽到 0 也全绿」。
 *   场景未执行由驱动层如实报 exit 2（不得计通过）。
 * ============================================================ */
/* ★ import 用**页内根绝对路径**，不是相对路径。
 *   场景体被塞进页面的 `<script type="module">`，其相对路径按**页面 URL** 解析
 *   （即 `/`），`'../host-stub.mjs'` 会变成 `/host-stub.mjs` ⇒ 404 ⇒ 整张模块图
 *   加载失败 ⇒ 页内 0 条读数、驱动 exit 2。首轮就是这么撞的。 */
import { installHostStub } from '/tests/browser/host-stub.mjs';

const EXT_MOUNT = '/scripts/extensions/third-party/WorldAxis';

function ok(name, cond, detail) {
  report({ name, ok: !!cond, detail: String(detail == null ? '' : detail) });
}

async function waitFor(fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (fn()) return true; } catch (_e) { /* 尚未就绪 */ }
    await window.__sleep(50);
  }
  return false;
}

/* 版本的**真值源**是 manifest.json（不是本文件里写的常量）。
 *   为什么：本仓有「版本三级同源」纪律（index.js 的 VERSION / manifest.json 的
 *   version / 台账 version 必须同批前进）。场景里写死一个版本号，会在每次版本前进时
 *   变成一条假红（甚至被顺手改成新值而失去判据意义）；拉真值比对才是真判据。
 *   顺带它还给出一条本层独有的读面：**manifest 真被网络拉到过**。 */
const MANIFEST = await (await fetch('/manifest.json')).json();
const EXPECT_VERSION = String(MANIFEST && MANIFEST.version || '');

/* ── 0. 宿主桩：与真 ST 同序落地（扩展脚本执行前 getContext 已可用）── */
const host = installHostStub({ chatId: 'l4_tp9_001', userName: '玩家', charName: '测试角色' });
window.__l4Host = host;

/* ── 1. 宿主装载扩展：与真 ST 完全同路径的 script 标签 ──
 *   注意 src 必须长成宿主那个形态，否则被测的 getBaseUrl() 第①条路不会命中，
 *   本场景就退化成「自己造了个宿主不存在的环境」。 */
const s = document.createElement('script');
s.src = `${EXT_MOUNT}/index.js?v=${EXPECT_VERSION}`;
document.head.appendChild(s);

const booted = await waitFor(() => !!window.WorldAxis, 30000);
ok('B0 扩展脚本已装载', booted, 'window.WorldAxis ' + (window.WorldAxis ? '在场' : '缺席'));
if (!booted) {
  /* 装载都没起来 ⇒ 后面的判据全是空转。如实报一条并收束，不做「零读数全绿」。 */
  ok('B0b 装载失败即止', false, '扩展未装载，后续判据不予执行（未执行不得计通过）');
  done();
}

const WA = window.WorldAxis;

/* ── 2. baseUrl（B1）：判据是**真值逐字比对**，不是「非空」 ──
 *   真值推演：`getBaseUrl()` 取 script.src 的 `indexOf('/index.js')` 前段。
 *   script.src 在 DOM 里是**绝对 URL**（含 origin），故切出来的是
 *   `location.origin + EXT_MOUNT`，而**不是**裸的 EXT_MOUNT。
 *   这条判据同时排掉了「走了回退分支」——回退值恰好是裸 EXT_MOUNT，
 *   于是「等于 origin+EXT_MOUNT」与「不等于裸 EXT_MOUNT」是同一枚硬币的两面。 */
ok('B1 baseUrl 取自 DOM script 标签（非回退分支）',
  WA.baseUrl === (location.origin + EXT_MOUNT) && WA.baseUrl !== EXT_MOUNT,
  '实 ' + JSON.stringify(WA.baseUrl) + ' / 期望 ' + JSON.stringify(location.origin + EXT_MOUNT)
  + ' / 裸回退值应被排除：' + String(WA.baseUrl !== EXT_MOUNT));
ok('B1b 版本常量与 manifest.json 同源', !!EXPECT_VERSION && WA.VERSION === EXPECT_VERSION,
  'WA.VERSION=' + String(WA.VERSION) + ' / manifest=' + JSON.stringify(EXPECT_VERSION));

/* ── 3. 宿主派发 APP_READY —— 与真 ST 同序：先装载、后派发 ── */
const readyFired = (function () { try { host.appReady(); return true; } catch (e) { return String(e && e.message); } })();
ok('B2 APP_READY 已派发且无异常', readyFired === true, String(readyFired));

/* ── 4. init 跑完：等 __loadFailed 落位（它在 init 末尾才写）── */
const inited = await waitFor(() => WA.__loadFailed !== undefined && WA.__loadOrder !== undefined, 120000);
ok('B3 init 走完（装载审计已落位）', inited,
  'loadOrder=' + (WA.__loadOrder ? WA.__loadOrder.length : 'n/a')
  + ' loadFailed=' + (WA.__loadFailed ? JSON.stringify(WA.__loadFailed) : 'n/a'));

/* ── 5. 模块图真被装载：注册数 == 装载清单数，且两者都非零 ── */
const regCount = Object.keys(WA.modules || {}).length;
const orderLen = (WA.__loadOrder || []).length;
ok('B4 模块真装载：注册数 == 装载清单数 且非零',
  orderLen > 100 && regCount === orderLen,
  '注册 ' + regCount + ' / 清单 ' + orderLen);
ok('B4b 零装载失败', (WA.__loadFailed || []).length === 0,
  '失败清单 ' + JSON.stringify((WA.__loadFailed || []).slice(0, 8)));

/* ── 6. 真 DOM 挂载（B3）── */
const mounted = await waitFor(() => WA.ui && WA.ui.mounted === true, 15000);
ok('B5 UI 已挂载（WA.ui.mounted）', mounted, 'mounted=' + (WA.ui ? String(WA.ui.mounted) : 'n/a'));

const panel = document.getElementById('wa-panel');
ok('B6 主面板根元素在场', !!panel, panel ? ('#' + panel.id) : '#wa-panel 缺席');

/* 打开面板：真 ST 里由悬浮球触发；本处直调同一入口。 */
try { if (WA.ui && typeof WA.ui.open === 'function') WA.ui.open(); } catch (_e) { /* 下面用读数判 */ }
const opened = await waitFor(() => panel && !panel.classList.contains('wa-hidden'), 8000);
ok('B7 面板可打开（wa-hidden 已摘）', opened,
  panel ? ('class=' + panel.className) : '无面板');

/* ── 7. 真排版：有宽高的盒子（无头 vm 里恒为 0，这是本层独有读数）── */
if (panel) {
  const r = panel.getBoundingClientRect();
  ok('B8 面板有真实盒模型', r.width > 0 && r.height > 0,
    JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) }));
  const btns = panel.querySelectorAll('button');
  const tabs = panel.querySelectorAll('[data-page]');
  ok('B9 面板控件成树', btns.length >= 5 && tabs.length >= 5,
    'button=' + btns.length + ' data-page=' + tabs.length);
  /* 控件可点性：真命中测试（元素零尺寸/被覆盖只有真排版能暴露） */
  let hit = null;
  for (const b of btns) {
    const br = b.getBoundingClientRect();
    if (br.width > 0 && br.height > 0) {
      const el = document.elementFromPoint(br.left + br.width / 2, br.top + br.height / 2);
      hit = (el === b || (el && b.contains(el))) ? 'hit' : ('missed:' + (el ? (el.tagName + '#' + el.id) : 'null'));
      break;
    }
  }
  ok('B10 至少一枚控件真命中（elementFromPoint）', hit === 'hit', String(hit));
  /* 样式确实生效（style.css 真加载的读面）：面板须有非默认定位 */
  const cs = getComputedStyle(panel);
  ok('B11 style.css 真生效', cs.position === 'fixed' || cs.position === 'absolute',
    'position=' + cs.position + ' z-index=' + cs.zIndex);
}

/* ── 8. 注入通道（B4）：render/inject 的落地口必须可写 ── */
const injBefore = host.ledger.extensionPrompt.length;
let injErr = '';
try {
  host.ctx.setExtensionPrompt('WorldAxis', '[l4-probe]', 1, 0, false);
} catch (e) { injErr = String(e && e.message); }
ok('B12 注入通道可写（setExtensionPrompt）',
  host.ledger.extensionPrompt.length === injBefore + 1 && !injErr,
  '调用 ' + host.ledger.extensionPrompt.length + ' 次' + (injErr ? ' 错误 ' + injErr : ''));
ok('B13 注入值原样落地', String(host.injectedText('WorldAxis')).indexOf('[l4-probe]') >= 0,
  JSON.stringify(String(host.injectedText('WorldAxis')).slice(0, 120)));

/* ── 9. 宿主订阅面：扩展应当按名订阅了宿主事件 ── */
const subKeys = Object.keys(host.ledger.listeners);
ok('B14 已按名订阅宿主事件', subKeys.length >= 1, JSON.stringify(host.ledger.listeners));

/* ── 10. 越权访问探针：读了宿主上不存在的键 = 真宿主上就是 undefined ── */
ok('B15 无越权宿主访问（读不存在的键）', host.ledger.unknown.length === 0,
  host.ledger.unknown.length
    ? JSON.stringify(host.ledger.unknown.slice(0, 4).map((u) => u.at))
    : '零命中');

/* ── 11. 面板页清单非空（UI 结构已建成）── */
ok('B16 面板页清单非空', (WA.ui && typeof WA.ui.pages === 'function' && WA.ui.pages().length >= 5),
  WA.ui && typeof WA.ui.pages === 'function' ? JSON.stringify(WA.ui.pages()) : 'n/a');

done();
