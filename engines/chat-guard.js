/**
 * WorldAxis engines/chat-guard.js (v2.529.0) — 存档防覆盖守卫
 *
 * 缝合来源：RedBird-Tools src/core/chatGuard.ts（83 行，带 7 组单测）。
 *
 * 病（宿主侧的真实数据丢失路径）：酒馆读聊天失败时（网络断一下、请求超时、读卡片失败、
 *   下载到一半断了），它会把这个存档**当成新聊天**，放上开场白，然后**存回原文件名** ——
 *   整档只剩开场白。玩家没刷新、接着聊，之后的每次保存也都写在这个空壳上。
 *   本仓有 `ctx.saveChat()` 调用点（engines/chatcache.js、engines/timeline.js），
 *   也会在净化后改写楼层：一旦宿主处于「读失败」状态，我们的一次保存就可能把空壳钉死。
 *
 * 判据（四条，全部是「宁可这次不存」的取向）：
 *   ① 读失败后到重新读成功之前，保存一律拦；除非磁盘上本来最多 1 条（真新聊天），
 *      或者要存的这份确实是从磁盘那份接着聊下来的（sameChat）。
 *   ② 没记到读失败，但要存的只有开场白且没有防覆盖校验码，而磁盘那份更长 ⇒ 也拦。
 *   ③ 读不到磁盘条数 ⇒ 按「更长」处理。
 *   ④ 群聊口径更粗：读失败过且 not sameChat 就拦（群聊会放上每个成员的开场白）。
 * 边界：**纯判定**，不写盘、不调宿主；拦不拦由调用方执行。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /** 要存几条、有没有防覆盖校验码。chat[0] 是文件头（chat_metadata）。 */
  function describeSave(chat) {
    if (!Array.isArray(chat) || !chat.length) return { messages: 0, hasIntegrity: false };
    const header = chat[0] || {};
    const meta = header.chat_metadata;
    return { messages: chat.length - 1, hasIntegrity: !!(meta && meta.integrity) };
  }

  /** 读聊天的回复算不算「读成功」：数组算；空对象 {} 算（服务器对没有聊天文件夹的卡这么回，= 0 条）；其他算失败。 */
  function readOk(parsed) {
    if (Array.isArray(parsed)) return true;
    return !!parsed && typeof parsed === 'object' && Object.keys(parsed).length === 0;
  }

  /** 读回来的那份有几条（去掉文件头）。{} = 0 条；读不懂返回 null（null 要当「更长」处理）。 */
  function messagesIn(parsed) {
    if (Array.isArray(parsed)) {
      const head = parsed[0];
      const hasHeader = !!(head && typeof head === 'object' && 'chat_metadata' in head);
      return Math.max(0, parsed.length - (hasHeader ? 1 : 0));
    }
    return readOk(parsed) ? 0 : null;
  }

  /** 要存的这份是不是从磁盘那份接着聊下来的：有一条消息 `send_date|name` 在磁盘上也有。 */
  function sameChat(saving, disk) {
    if (!Array.isArray(saving) || !Array.isArray(disk)) return false;
    const key = function (m) {
      if (!m || typeof m !== 'object') return null;
      const d = m.send_date;
      if (!d) return null;   // 没有发送时间的老存档证明不了，不算
      return String(d) + '|' + String(m.name == null ? '' : m.name);
    };
    const onDisk = Object.create(null);
    disk.forEach(function (m) { const k = key(m); if (k) onDisk[k] = 1; });
    return saving.some(function (m) { const k = key(m); return !!k && !!onDisk[k]; });
  }

  /** 值不值得去磁盘核对一次（不值得就别多发一个请求）。 */
  function worthChecking(check) {
    const c = check || {};
    if (c.loadFailed) return true;
    const d = describeSave(c.chat);
    return d.messages <= 1 && !d.hasIntegrity;
  }

  /** 拦不拦。disk 是刚从磁盘读回来的那份（读不到传 null）。 */
  function shouldBlockSave(check, disk) {
    const c = check || {};
    if (!worthChecking(c)) return false;
    const onDisk = messagesIn(disk);
    if (onDisk === null) return true;                       // ③ 读不到 ⇒ 按更长处理
    if (c.loadFailed) return onDisk > 1 && !sameChat(c.chat, disk);   // ①
    return onDisk > describeSave(c.chat).messages;           // ②
  }

  /** 群聊：只看「刚才读取失败过」，证明不了是接着聊下来的就拦。 */
  function shouldBlockGroupSave(loadFailed, saving, disk) {
    if (!loadFailed) return false;
    const onDisk = messagesIn(disk);
    if (onDisk === null) return true;
    return onDisk > 1 && !sameChat(saving, disk);
  }

  WA.chatGuard = {
    describeSave: describeSave, readOk: readOk, messagesIn: messagesIn,
    sameChat: sameChat, worthChecking: worthChecking,
    shouldBlockSave: shouldBlockSave, shouldBlockGroupSave: shouldBlockGroupSave
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/chat-guard.js', { kind: 'engine', ver: '2.529.0' });
})();