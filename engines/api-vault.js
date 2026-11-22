/**
 * WorldAxis engines/api-vault.js (v2.529.0) — 设备本地加密密钥仓
 *
 * 缝合来源：nekotools core/apivault.js（106 行，AES-GCM + 不可导出 CryptoKey）。
 *
 * ── 它治什么（现场事实）─────────────────────────────────
 *   core/api-router.js 把五个通道的配置整份写进 localStorage
 *   （`worldaxis_api_channels_v1`），其中 `apiKey` 是**明文**。localStorage 会被
 *   同源脚本读到、会随浏览器备份/导出流出去、也不受 https 约束。
 *   全仓 `indexedDB` / `crypto.subtle` 零命中 —— 也就是说「密钥至少不要明文躺着」
 *   这件事，此前一条防线都没有。
 *
 * ── 本模块只做三件事 ──────────────────────────────────
 *   ① 把密钥加密后存 IndexedDB；密钥本身是 **不可导出** 的 AES-GCM CryptoKey；
 *   ② `prime()` 把解密结果放进内存缓存，`peek(channel)` 供 api-router **同步**取用；
 *   ③ `stat()` 报计数（保存/读取/解密失败），失败**不抛给生成链**。
 *
 * ── 边界（全是否定式）──────────────────────────────────
 *   1 绝不把明文写回 localStorage（写入路径只有 IndexedDB）；
 *   2 绝不导出 CryptoKey（`generateKey(..., false, ...)` 的第三个 false 是硬约束）；
 *   3 非安全上下文（http 且非 localhost）直接拒绝保存并说明原因，不降级成明文；
 *   4 解密失败按「没有」返回（api-router 回落旧配置），不打断这一轮生成。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const DB_NAME = 'worldaxis_api_vault';
  const STORE = 'vault';
  const KEY_ID = 'device-aes-key';
  const _stat = { saves: 0, reads: 0, dels: 0, decryptFail: 0, unavailable: 0, primes: 0, lastError: '' };
  const cache = Object.create(null);
  let keyPromise = null;
  let dbPromise = null;

  function win() { return WA.mainWin || window; }

  /** 能不能用：三件事都得有（IndexedDB / 安全上下文 / WebCrypto）。 */
  function available() {
    const w = win();
    try {
      return !!(w.indexedDB && w.isSecureContext && w.crypto && w.crypto.subtle);
    } catch (e) { return false; }
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const w = win();
      if (!w.indexedDB) { reject(new Error('当前浏览器不支持 IndexedDB')); return; }
      const req = w.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('打开本地加密仓库失败')); };
    }).catch(function (e) { dbPromise = null; throw e; });
    return dbPromise;
  }

  function loadOrCreateKey() {
    const w = win();
    if (keyPromise) return keyPromise;
    keyPromise = (async function () {
      if (!available()) throw new Error('API Key 需要 https 或 localhost 才能保存（当前不是安全上下文）');
      const db = await openDb();
      const existing = await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(KEY_ID);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
      if (existing) return existing;
      // 第三个参数 false = 不可导出：插件拿得到句柄，导不出原始字节
      const key = await w.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(key, KEY_ID);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
      return key;
    })().catch(function (e) { keyPromise = null; _stat.lastError = String(e && e.message || e); throw e; });
    return keyPromise;
  }

  async function save(channel, plain) {
    if (!channel) throw new Error('api-vault: 缺少通道名');
    if (!available()) { _stat.unavailable++; throw new Error('api-vault: 当前不是安全上下文，拒绝保存（不降级成明文）'); }
    const w = win();
    const key = await loadOrCreateKey();
    const iv = w.crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(String(plain == null ? '' : plain));
    const enc = await w.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, data);
    const db = await openDb();
    await new Promise(function (resolve, reject) {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ iv: Array.from(iv), data: Array.from(new Uint8Array(enc)) }, 'secret:' + channel);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
    cache[channel] = String(plain == null ? '' : plain);
    _stat.saves++;
    return true;
  }

  async function read(channel) {
    if (!channel) return '';
    _stat.reads++;
    try {
      const w = win();
      const key = await loadOrCreateKey();
      const db = await openDb();
      const rec = await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get('secret:' + channel);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
      if (!rec) return '';
      const dec = await w.crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(rec.iv) }, key, new Uint8Array(rec.data));
      const text = new TextDecoder().decode(dec);
      cache[channel] = text;
      return text;
    } catch (e) {
      // 解密失败按「没有」返回：不打断生成链，但记一笔
      _stat.decryptFail++;
      _stat.lastError = String(e && e.message || e);
      return '';
    }
  }

  async function del(channel) {
    if (!channel) return false;
    try {
      const db = await openDb();
      await new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete('secret:' + channel);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
      delete cache[channel];
      _stat.dels++;
      return true;
    } catch (e) { _stat.lastError = String(e && e.message || e); return false; }
  }

  /** 把若干通道的密钥预热进内存缓存（调用方在启动/切通道时调一次）。 */
  async function prime(channels) {
    if (!available()) return { ok: false, reason: 'not-secure-context' };
    const list = Array.isArray(channels) ? channels : [];
    let n = 0;
    for (const ch of list) {
      const v = await read(ch);
      if (v) n++;
    }
    _stat.primes++;
    return { ok: true, primed: n, asked: list.length };
  }

  /** 同步取（api-router 的调用链是同步的）：缓存没有就返回 ''，回落顺序由调用方定。 */
  function peek(channel) {
    const v = cache[channel];
    return typeof v === 'string' ? v : '';
  }

  function stat() {
    return Object.assign({}, _stat, { available: available(), cached: Object.keys(cache).length });
  }

  WA.apiVault = {
    available: available, save: save, read: read, del: del,
    prime: prime, peek: peek, stat: stat
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/api-vault.js', { kind: 'engine', ver: '2.529.0' });
})();
