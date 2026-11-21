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

    /**
     * 与 `run` 同一队列，但**不吞调用方的异常**。
     *
     * `run` 的行为是把失败吞成 `undefined`（队列必须继续，这一点是对的）；但它同时让
     *   调用方**无法区分**「fn 返回了 undefined」与「fn 抛了」。批量任务能用返回值表达失败时
     *   这没问题；而「读-改-写」这类事务必须让失败抛出去 —— 否则调用方会把异常路径静默
     *   当成成功（照本仓口径：「没报错」≠「写成了」）。
     *
     * 做法：队列尾巴只等「这一步什么时候结束」，不看结果（`tail = step.then(noop, noop)`）；
     *   记账挂在这条尾巴上；交给调用方的仍是 fn 自己的 promise（照常可抛）。
     * 队列本身**永不断**：前一项失败不卡后一项，lastError 照记 —— 与 `run` 同一纪律。
     */
    function runStrict(fn) {
      pending++;
      const step = tail.then(function () {
        return Promise.resolve().then(fn);
      });
      // 队列尾巴：成功/失败都往下走，且**先记账再放行** —— 这样 await idle() 之后
      //   读 stat() 一定已经是「这一步结束」的账，不会出现 pending 还挂在 1 的错觉。
      tail = step.then(function (v) {
        done++; pending--;
        return v;
      }, function (e) {
        failed++; pending--;
        lastError = { at: new Date().toISOString(), message: String(e && e.message ? e.message : e) };
        return undefined;
      });
      return step;
    }
    function idle() {
      return tail;
    }
    return { run: run, runStrict: runStrict, stat: stat, idle: idle };
  }
  /**
   * 按名取**同一条**队列实例。
   *
   * ⓐ 为什么必须有这一层：`createSerial(name)` **每次都新建一条队列**。两个调用方各自
   *   `createSerial('wb')` 拿到的是两条互不相干的队列 —— 串行在读数上「已启用」，在行为上
   *   完全失效。本引擎治的病恰恰是「两处同时写」，所以「按名共享」不是便利，是判据的一部分。
   *
   * ⓑ 名字即唯一键：同一本书必须用同一个 key（约定 `wb:<书名>`）；不同书之间**不互相排队**
   *   —— 两本书的写入本来就互不干扰，单条全局队列只会让不相干的书互相拖慢，还会把
   *   「谁慢了」在读数上搅成一团。
   *
   * ⓒ 本函数返回的是**缓存里的那一个**，因此调用方**不许**在它上面另建状态：要加统计就改
   *   `createSerial` 内部的记账（单点），不要在调用点自己数一遍 —— 两个计数点必然对不上。
   */
  const SERIALS = new Map();
  function serial(name) {
    const key = String(name == null || name === '' ? 'default' : name);
    let s = SERIALS.get(key);
    if (!s) { s = createSerial(key); SERIALS.set(key, s); }
    return s;
  }
  /** 队列清单读数（诊断面用）：每个 key 各积压多少、各失败几次。只读，不改任何状态。 */
  function serials() {
    const out = [];
    SERIALS.forEach(function (s, k) { out.push(s.stat()); });
    out.sort(function (a, b) { return String(a.name) < String(b.name) ? -1 : 1; });
    return out;
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
    // v2.551.0（写回收口批）：按名共享的队列入口 + 队列清单读数。
    //   加这两个的理由见 serial() 的 ⓐⓑⓒ：`createSerial` 每次新建一条队列，
    //   而本引擎治的病是「两处同时写」—— 没有共享入口，串行在行为上不可能生效。
    serial: serial,
    serials: serials,
    configEntry: configEntry,
    isConfigEntry: isConfigEntry,
    auditBook: auditBook,
    patchEntry: patchEntry
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/write-serial.js', { kind: 'engine', ver: '2.551.0' });
})();