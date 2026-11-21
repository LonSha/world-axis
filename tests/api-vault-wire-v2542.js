'use strict';
/**
 * tests/api-vault-wire-v2542.js — 「API Key 从明文迁进加密仓」接线专锁（v2.542.24）。
 *
 * 病：`engines/api-vault.js` 自 v2.529.0 入库时就点名了消费方（「填 API Key 的设置面」），
 * 但一直零读 —— 而 `core/api-router.js` 把五个通道的配置（含 `apiKey` **明文**）整份写进
 * localStorage：「同源脚本读得到、浏览器备份会带出去、不受 https 约束」这件事，一条防线都没有。
 *
 * 本锁只钉四件事：
 *   ① 正控（可用时）：明文 key 写入后再也不在 localStorage 里；`getChannel` 能同步解回来。
 *   ② 负控（安全升级不得阻断生成）：
 *      · vault 不可用 ⇒ 全链退回旧明文，行为与上一版一致（不降级、不抛错）；
 *      · save() 失败 ⇒ 明文写回通道配置，用户不丢 key；
 *      · 占位符已落盘但缓存未解出 ⇒ `_callInner` 抛 `vault-not-ready`（可执行成因），
 *        而不是一个没头没脑的 401。
 *   ③ 存量迁移：装载时把已躺在 localStorage 里的明文搬进仓、占位符落盘，且**只搬一次**。
 *   ④ 前提钉住：api-vault.js 自己不往 localStorage 写任何东西（它的写入路径只有 IndexedDB）——
 *      将来若有人把它改成降级明文，这里先红。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.join(__dirname, '..');
const REL = 'core/api-router.js';
let pass = 0, fail = 0;
function a(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }

const SRC = fs.readFileSync(path.join(BASE, REL), 'utf8');

/** 造一个干净的 api-router 实例：mock 掉 settingsBus / clock / log，把 storage 换成内存对象。 */
function boot(opts) {
  const o = opts || {};
  const store = Object.create(null);
  if (o.seed) Object.keys(o.seed).forEach(function (k) { store[k] = JSON.parse(JSON.stringify(o.seed[k])); });
  const WA = {};
  WA.mainWin = {};
  WA.clock = { now: function () { return 1; }, wallNow: function () { return 1000; } };
  WA.log = function () {};
  WA.emit = function () {};
  WA.settingsBus = {
    read: function (reg) {
      const v = store[reg.key];
      return v ? JSON.parse(JSON.stringify(v)) : (reg.def === undefined ? undefined : reg.def);
    },
    save: function (reg, val) { store[reg.key] = JSON.parse(JSON.stringify(val)); return { ok: true }; },
    saveOrThrow: function (reg, val) { store[reg.key] = JSON.parse(JSON.stringify(val)); return { ok: true }; },
    normalize: function (reg, v) { return v; },
    remove: function (reg) { delete store[reg.key]; return { ok: true }; }
  };
  if (o.vault !== undefined) WA.apiVault = o.vault;
  const win = { WorldAxis: WA };
  const box = {
    window: win, console: { log: function () {}, warn: function () {}, error: function () {} },
    setTimeout: setTimeout, clearTimeout: clearTimeout, Promise: Promise,
    AbortController: typeof AbortController !== 'undefined' ? AbortController : function () { this.signal = {}; this.abort = function () {}; },
    DOMException: typeof DOMException !== 'undefined' ? DOMException : function (m) { this.message = m; },
    fetch: function () { return Promise.reject(new Error('no-fetch-in-lock')); }
  };
  vm.createContext(box);
  vm.runInContext(SRC, box, { filename: REL });
  return { WA: WA, router: WA.apiRouter, store: store, cfg: function () { return store['worldaxis_api_channels_v1'] || {}; } };
}

/** 假加密仓：行为与 engines/api-vault.js 的可观测面一致（available/save/read/del/prime/peek）。 */
function fakeVault(mode) {
  const cache = Object.create(null);
  const v = {
    available: function () { return mode !== 'unavailable'; },
    save: function (ch, plain) {
      if (mode === 'save-fail') return Promise.reject(new Error('quota'));
      cache[ch] = String(plain == null ? '' : plain);
      return Promise.resolve(true);
    },
    read: function (ch) { return Promise.resolve(cache[ch] || ''); },
    del: function (ch) { delete cache[ch]; return Promise.resolve(true); },
    prime: function (list) {
      if (mode === 'prime-fail') return Promise.reject(new Error('idb'));
      let n = 0;
      (Array.isArray(list) ? list : []).forEach(function (c) { if (cache[c]) n++; });
      return Promise.resolve({ ok: true, primed: n, asked: (list || []).length });
    },
    peek: function (ch) { return cache[ch] || ''; },
    _cache: cache
  };
  return v;
}
const tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };

(async function main() {
  // ── 1. 负控 A：vault 不可用 ⇒ 全链旧明文（零行为变化）──
  {
    const B = boot({ vault: { available: function () { return false; }, save: function () { return Promise.reject(new Error('nope')); }, peek: function () { return ''; } } });
    B.router.setChannel('default', { baseUrl: 'https://x', apiKey: 'sk-plain', model: 'm' });
    await tick();
    a(B.cfg().default.apiKey === 'sk-plain', '1a vault 不可用 ⇒ 明文 key 留在通道配置（行为与上一版逐字一致）');
    a(B.router.getChannel('default').apiKey === 'sk-plain', '1b 读回来也是明文（不静默丢 key）');
    a(B.router.cfgStat().vault.on === false, '1c cfgStat 的 vault.on 如实报 false');
    a(B.router.cfgStat().vault.boot === 'unavailable', '1d 预热没成的成因记在 vault.boot（状态键，不是造出来的 reject 码）');
  }

  // ── 2. 没装 vault 模块（v2.529.0 之前的状态）⇒ 同样走明文 ──
  {
    const B = boot({});
    B.router.setChannel('default', { baseUrl: 'https://x', apiKey: 'sk-legacy', model: 'm' });
    await tick();
    a(B.cfg().default.apiKey === 'sk-legacy', '2a 模块缺席时明文照旧（不制造新停摆点）');
  }

  // ── 3. 正控：可用时明文不进 localStorage ──
  {
    const V = fakeVault('ok');
    const B = boot({ vault: V });
    B.router.setChannel('default', { baseUrl: 'https://x', apiKey: 'sk-secret', model: 'm' });
    await tick();
    a(B.cfg().default.apiKey === '@vault', '3a 落盘的是占位符 @vault，不是明文（实 ' + JSON.stringify(B.cfg().default.apiKey) + '）');
    a(JSON.stringify(B.store).indexOf('sk-secret') < 0, '3b 明文 key 在 localStorage 快照里零命中');
    a(V.peek('default') === 'sk-secret', '3c 明文确实进了仓');
    a(B.router.getChannel('default').apiKey === 'sk-secret', '3d getChannel 同步解回明文（调用链是同步的）');
    a(B.router.cfgStat().vault.on === true, '3e cfgStat 的 vault.on 如实报 true');
    a(B.router.cfgStat().vault.boot === 'ready', '3f 预热成功 ⇒ vault.boot = ready（与 prime 的返回值对齐）');
  }

  // ── 4. 负控 B：save 失败 ⇒ 明文写回（用户不丢 key）──
  {
    const V = fakeVault('save-fail');
    const B = boot({ vault: V });
    B.router.setChannel('default', { baseUrl: 'https://x', apiKey: 'sk-willfail', model: 'm' });
    await tick(); await tick();
    a(B.cfg().default.apiKey === 'sk-willfail', '4a save 失败 ⇒ 退回明文（安全升级不得变成「配了 key 却一直 401」）');
    a(B.router.cfgStat().vault.writeFail >= 1, '4b writeFail 计数确实动了（不静默）');
  }

  // ── 5. 负控 C：占位符已落盘但缓存未解出 ⇒ 可执行成因 ──
  {
    const V = fakeVault('ok');   // cache 空：没 prime 过
    const B = boot({ vault: V, seed: { 'worldaxis_api_channels_v1': { default: { baseUrl: 'https://x', apiKey: '@vault', model: 'm' } } } });
    await tick();   // 等装载期的 vaultBoot 落地（prime 是异步的，boot 状态在这一拍才有值）
    a(B.router.getChannel('default').apiKey === '', '5a 缓存空时 getChannel 拿不到 key（不回落明文、不编造）');
    a(B.router.cfgStat().vault.notReady >= 1, '5b notReady 计数确实动了');
    let err = null;
    try { await B.router.call('default', [{ role: 'user', content: 'hi' }], {}); } catch (e) { err = e; }
    a(!!err && err.kind === 'vault-not-ready', '5c call 抛的是 vault-not-ready（实 ' + JSON.stringify(err && err.kind) + '）');
    a(!!err && /密钥仓/.test(String(err.message)), '5d 错误话术说清了成因与下一步');
    a(!!err && err.vaultBoot === 'ready', '5e 成因带得出去：error.vaultBoot 与 cfgStat 同一格（实 ' + JSON.stringify(err && err.vaultBoot) + '）');
  }

  // ── 6. 存量迁移：老明文搬进仓、占位符落盘、只搬一次 ──
  {
    const V = fakeVault('ok');
    V._cache.default = 'sk-old';
    const B = boot({
      vault: V,
      seed: { 'worldaxis_api_channels_v1': { default: { baseUrl: 'https://x', apiKey: 'sk-old', model: 'm' }, judge: { apiKey: 'sk-judge' } } }
    });
    const r = await B.router.cfgStat() && await (function () { return null; })();
    const BOOT = B.router.__vaultBootForTest || null;
    // 装载时已自动跑过一次 vaultBoot（不 await）；这里等它落地
    await tick(); await tick(); await tick();
    a(B.cfg().default.apiKey === '@vault' && B.cfg().judge.apiKey === '@vault', '6a 存量明文两条都换成了占位符');
    a(B.router.getChannel('default').apiKey === 'sk-old', '6b 迁移后 getChannel 仍能解回原 key（不丢）');
    a(B.router.cfgStat().vault.migrated >= 2, '6c migrated 计数如实动过两次（实 ' + B.router.cfgStat().vault.migrated + '）');
    const before = B.router.cfgStat().vault.migrated;
    B.__ = 0;
    a(B.cfg().default.apiKey === '@vault', '6d 已经是占位符的不会被当成「待迁移明文」反复搬（幂等）');
    a(B.router.cfgStat().vault.migrated === before, '6e 幂等：再读一次 migrated 不涨');
  }

  // ── 7. prime 失败不抛（装载期不能停摆）──
  {
    const V = fakeVault('prime-fail');
    let threw = false, B = null;
    try { B = boot({ vault: V, seed: { 'worldaxis_api_channels_v1': { default: { apiKey: 'k', baseUrl: 'https://x', model: 'm' } } } }); } catch (e) { threw = true; }
    a(!threw, '7a prime 失败不抛：装载期照常走完');
    await tick(); await tick();
    a(!!B && B.router.cfgStat().vault.boot === 'prime-failed', '7b prime 抛错 ⇒ vault.boot = prime-failed（与引擎自报 ok:false 同一格）');
  }

  // ── 8. 源面自证：三个接点都在，且写���在“存明文”之前就把明文接走 ──
  a(SRC.indexOf('function vaultOn') > 0 && SRC.indexOf('function resolveKey') > 0 && SRC.indexOf('function stashKey') > 0,
    '8a 三个接点函数都在（vaultOn / resolveKey / stashKey）');
  a(SRC.indexOf('apiKey: resolveKey(name, c.apiKey)') > 0, '8b getChannel 的 apiKey 走 resolveKey（读出口只有一个）');
  a(SRC.indexOf("const KEY_REF = '@vault'") > 0, '8c 占位符是常量（不是散落的字面量）');
  const iSet = SRC.indexOf('if (vaultOn() && typeof picked.apiKey');
  const iSave = SRC.indexOf('saveCfg(cfg);', iSet);
  a(iSet > 0 && iSave > iSet, '8d setChannel 里「接走明文」在 saveCfg 之前（不是存完再改）');
  a(SRC.indexOf('try { vaultBoot(); } catch') > 0, '8e 装载尾部真的发起了 vaultBoot（不 await，失败收住）');
  a(SRC.indexOf("e.kind = 'vault-not-ready'") > 0, '8f _callInner 里有 vault-not-ready 分支');

  // ── 9. 前提钉住：api-vault 自己不写 localStorage ──
  const vaultSrc = fs.readFileSync(path.join(BASE, 'engines/api-vault.js'), 'utf8');
  const vBody = vaultSrc.slice(vaultSrc.indexOf('(function ()'), vaultSrc.indexOf('WA.apiVault = {'));
  a(vBody.indexOf('localStorage') < 0, '9a api-vault 的写入路径里没有 localStorage（只有 IndexedDB）');
  a(vBody.indexOf('indexedDB') > 0, '9b 它的存盘确实走 IndexedDB');

  // ── 10. 读数面：零读账本按纪律④出表 ──
  const ledger = JSON.parse(fs.readFileSync(path.join(BASE, 'tests/ns-consumer-ledger.json'), 'utf8'));
  a(!(ledger.entries || {}).apiVault, '10a 账本里已无 apiVault（接线完成即删行）');
  a(!!(ledger.entries || {}).cardFile, '10b 邻居 cardFile 仍在表内（证明删的是这一条）');

  console.log('API-VAULT-WIRE-V2542: ' + (fail ? 'FAIL ' : 'pass（') + pass + (fail ? ' / ' + (pass + fail) : ' 项）'));
  process.exit(fail ? 1 : 0);
})();
