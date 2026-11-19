/**
 * WorldAxis engines/write-serial.js (v2.529.0) — 世界书写回串行队列 + 配置条目纪律
 *
 * 缝合来源：nekotools core/worldcfg.js（99 行）与 st_bridge.js 的写入路径纪律。
 *
 * 病（两条，都是真实的丢数据路径）：
 *   ① 世界书的读写接口是「读整本 → 改一条 → 写整本」。两处代码同时改不同的条目时，
 *      后写的那个用的是**读到时的旧整本**，把先写的那条悄悄覆盖掉。
 *      并发生成（双开、扩展自检、面板保存同时发生）就是这个形态。
 *   ② 配置类数据（白名单/黑名单/索引）被塞进世界书条目里，靠 `disable: true` 保证永不注入。
 *      只要有人同时设了 `constant: true`（常驻），条目就**每轮都进提示词** ——
 *      配置被当成正文发给模型，读数上完全看不出异常。
 *
 * 判据：
 *   - 所有写回**必须**经过同一个串行队列：前一个 promise 结束（成功或失败）才轮到下一个；
 *   - 某一项失败**不许**卡死队列（否则一次 500 就永久停止写盘），但错误必须记进 lastError，
 *     下一个调用者能看见——「静默吞掉失败」比卡死更坏；
 *   - 配置条目形态固定：`{ comment: 标题, content, disable: true }`，且**不许**带 constant；
 *     auditBook 会把「disable + constant」这种自相矛盾的条目点名报出来。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /** 串行队列。run(fn) 返回该项自己的 promise；队列本身永不断。 */
  function createSerial(name) {
    let tail = Promise.resolve();
    let pending = 0;
    let done = 0;
    let failed = 0;
    let lastError = null;
    const stats = { name: String(name || 'serial') };

    function run(fn) {
      pending++;
      const step = tail.then(function () {
        return Promise.resolve().then(fn);
      }).then(function (v) {
        done++;
        pending--;
        return v;
      }, function (e) {
        failed++;
        pending--;
        lastError = { at: new Date().toISOString(), message: String(e && e.message ? e.message : e) };
        // 不抛：队列必须继续。调用方从 stat() 里看失败。
        return undefined;
      });
      tail = step;
      return step;
    }

    function stat() {
      return { name: stats.name, pending: pending, done: done, failed: failed, lastError: lastError };
    }

    function idle() {
      return tail;
    }

    return { run: run, stat: stat, idle: idle };
  }

  /** 配置条目形态：永不注入。故意不带 constant —— 由调用方漏写，而不是由这里「顺手加」。 */
  function configEntry(title, content) {
    return { comment: String(title == null ? '' : title), content: String(content == null ? '' : content), disable: true };
  }

  /** 这条是不是配置条目（disable:true）。 */
  function isConfigEntry(e) {
    return !!(e && e.disable === true);
  }

  /**
   * 体检一本书：返回问题清单（不抛）。
   *   - disable + constant：自相矛盾（配置会被注入）
   *   - disable 但 content 看起来是正文（长度 > 4000 且没有配置标记）：多半是把正文藏进了配置条目
   *   - 没有 comment 且 disable：认不出是哪一项配置（后续改它只能按内容猜）
   */
  function auditBook(book) {
    const out = [];
    const entries = book && book.entries;
    let list = [];
    if (Array.isArray(entries)) list = entries;
    else if (entries && typeof entries === 'object') {
      const ks = Object.keys(entries);
      for (let i = 0; i < ks.length; i++) list.push(entries[ks[i]]);
    }
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || typeof e !== 'object') continue;
      const title = String(e.comment == null ? '' : e.comment);
      if (e.disable === true && e.constant === true) {
        out.push({ title: title, code: 'CONFIG_INJECTED', text: '配置条目同时设了 constant（常驻）—— 会被当正文注入' });
      }
      if (e.disable === true && !title) {
        out.push({ title: '', code: 'CONFIG_UNNAMED', text: '配置条目没有标题：改它只能按内容猜' });
      }
      if (e.disable === true && typeof e.content === 'string' && e.content.length > 4000) {
        out.push({ title: title, code: 'CONFIG_TOO_BIG', text: '配置条目内容 > 4000 字：像是把正文藏进了配置' });
      }
    }
    return out;
  }

  /** 写回一本里的某条：读 → 改 → 写，整段进串行队列。缺任一能力就当场报「能力缺失」，不半途改。 */
  function patchEntry(serial, io, title, patch) {
    if (!serial || typeof serial.run !== 'function') return Promise.resolve({ ok: false, reason: '没有串行队列（写回会丢数据，拒绝执行）' });
    const i = io || {};
    if (typeof i.read !== 'function' || typeof i.write !== 'function') {
      return Promise.resolve({ ok: false, reason: '读写能力不全（read/write 都要给）' });
    }
    return serial.run(function () {
      return Promise.resolve(i.read()).then(function (book) {
        if (!book || typeof book !== 'object') return { ok: false, reason: '读不到世界书' };
        const entries = book.entries;
        if (!entries || typeof entries !== 'object') return { ok: false, reason: '世界书没有 entries' };
        const keys = Object.keys(entries);
        let target = null;
        for (let k = 0; k < keys.length; k++) {
          const e = entries[keys[k]];
          if (e && String(e.comment == null ? '' : e.comment) === String(title)) { target = keys[k]; break; }
        }
        if (target == null) return { ok: false, reason: '条目不存在: ' + title };
        const e0 = entries[target] || {};
        const next = {};
        const ek = Object.keys(e0);
        for (let k = 0; k < ek.length; k++) next[ek[k]] = e0[ek[k]];
        const pk = Object.keys(patch || {});
        for (let k = 0; k < pk.length; k++) next[pk[k]] = patch[pk[k]];
        entries[target] = next;
        return Promise.resolve(i.write(book)).then(function (r) {
          return { ok: true, key: target, wrote: true, result: r };
        });
      }, function (e) {
        return { ok: false, reason: '读失败: ' + String(e && e.message ? e.message : e) };
      });
    });
  }

  WA.writeSerial = {
    createSerial: createSerial,
    configEntry: configEntry,
    isConfigEntry: isConfigEntry,
    auditBook: auditBook,
    patchEntry: patchEntry
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/write-serial.js', { kind: 'engine', ver: '2.529.0' });
})();