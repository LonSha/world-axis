/**
 * WorldAxis engines/timeline.js (v0.8)
 * 记忆时间链：来源身份/哈希校验/引用审计
 * 缝合来源：DlSNlGHT World —— memory-engine-timeline.js
 *
 * 机制：
 *  - 为每条聊天楼层生成稳定来源ID（写入message.extra，随聊天持久化）
 *  - FNV双哈希：正文变化检测（用户编辑/重roll导致内容变化 → hash变化）
 *  - sourceRef：{chatId, messageId, layer, role, swipeId, hash}
 *  - captureRange：捕获楼层区间的引用集
 *  - auditRefs：审计引用集在当前聊天中的有效性（valid/changed/missing）
 *  - digestRefs：引用集指纹（同源校验）
 *  - refsToConversation：把引用集还原为对话文本（喂给摘要/巩固）
 *  - unionRefs：多组引用并集去重
 *
 * 与原版差异：不实现 syncHidden（隐藏楼层涉及 /hide 命令副作用，WorldAxis记忆层
 * 不做楼层隐藏，正文保持原样——遵循「正文事实优先不篡改正文」原则）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;

  const SOURCE_ID_KEY = 'worldaxis_source_id';
  // v2.14.0: idCounter 已随消息 id 迁移到 WA.rand.id（时间戳+递变计数在其内部）
  let saveTimer = null;

  const clean = v => String(v == null ? '' : v).trim();
  const clone = v => v == null ? v : JSON.parse(JSON.stringify(v));

  function getCtx() { try { return mainWin.SillyTavern.getContext(); } catch (e) { return null; } }
  function chat() { try { return (getCtx() && getCtx().chat) || []; } catch (e) { return []; } }
  // v0.8.0: chatId 归属必须是「稳定聊天id」，而非楼层级 currentBranchId（m{index}_s{swipe}）。
  // 旧实现导致同一聊天内旧 refs 的 chatId 随末楼漂移 → auditRefs 全判 inherited 跳过审计（refs.missing 不可达）。
  function chatId() { try { return WA.store.chatId ? WA.store.chatId() : 'default'; } catch (e) { return 'default'; } }

  // FNV-1a双哈希：仅用于变化检测
  function hashText(value) {
    const text = String(value == null ? '' : value);
    let first = 0x811c9dc5, second = 0x9e3779b9;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      first ^= code;
      first = Math.imul(first, 0x01000193) >>> 0;
      second ^= code + ((second << 6) >>> 0) + (second >>> 2);
      second >>>= 0;
    }
    return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
  }

  function messageHash(message) {
    return hashText(JSON.stringify({
      role: message && message.is_user ? 'user' : 'assistant',
      name: clean(message && message.name),
      mes: String((message && message.mes) || '')
    }));
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const ctx = getCtx();
      try {
        if (ctx && typeof ctx.saveChatConditional === 'function') ctx.saveChatConditional();
        else if (ctx && typeof ctx.saveChat === 'function') ctx.saveChat();
      } catch (e) { /* 保存失败不阻断记忆流程 */ }
    }, 250);
  }

  function ensureMessageId(message) {
    if (!message) return '';
    if (!message.extra || typeof message.extra !== 'object' || Array.isArray(message.extra)) message.extra = {};
    let id = clean(message.extra[SOURCE_ID_KEY]);
    if (!id) {
      id = WA.rand.id('wax_', 6, 'id');   // v2.14.0: 标识流（时间戳+递变计数+噪声，唯一且可读）
      message.extra[SOURCE_ID_KEY] = id;
      scheduleSave();
    }
    return id;
  }

  function sourceRef(message, layer, sourceChatId) {
    if (!message) return null;
    return {
      chatId: clean(sourceChatId || chatId()),
      messageId: ensureMessageId(message),
      layer: Number(layer) || 0,
      role: message.is_user ? 'user' : 'assistant',
      swipeId: Number.isFinite(Number(message.swipe_id)) ? Number(message.swipe_id) : 0,
      hash: messageHash(message)
    };
  }

  function captureRange(startLayer, endLayer) {
    const all = chat(), start = Math.max(0, Number(startLayer) || 0);
    const end = Math.min(all.length - 1, Math.max(start, Number(endLayer) || 0));
    const refs = [];
    for (let i = start; i <= end; i++) {
      const ref = sourceRef(all[i], i);
      if (ref) refs.push(ref);
    }
    return refs;
  }

  function digestRefs(refs) {
    return hashText((refs || []).map(ref => [
      clean(ref.chatId), clean(ref.messageId), Number(ref.swipeId) || 0, clean(ref.hash)
    ].join(':')).join('|'));
  }

  function currentMessageMap() {
    const map = new Map(), all = chat();
    all.forEach((message, layer) => {
      const id = ensureMessageId(message);
      if (id) map.set(id, { message, layer });
    });
    return map;
  }

  /**
   * 审计引用集：missing=楼层已删、changed=内容被编辑/重roll。
   * valid=全部来源仍原样存在。
   */
  function auditRefs(refs) {
    const source = Array.isArray(refs) ? refs : [];
    if (!source.length) return { valid: false, reason: 'no_sources', refs: [], changed: [], missing: [] };
    if (source.every(ref => ref && ref.synthetic === true)) {
      return { valid: true, synthetic: true, refs: clone(source), changed: [], missing: [] };
    }
    const currentChatId = chatId();
    if (source.every(ref => clean(ref.chatId) && clean(ref.chatId) !== currentChatId)) {
      return { valid: true, inherited: true, refs: clone(source), changed: [], missing: [] };
    }
    const map = currentMessageMap(), current = [], changed = [], missing = [];
    for (const oldRef of source) {
      if (clean(oldRef.chatId) !== currentChatId) { missing.push(oldRef); continue; }
      const found = map.get(clean(oldRef.messageId));
      if (!found) { missing.push(oldRef); continue; }
      const next = sourceRef(found.message, found.layer, currentChatId);
      current.push(next);
      if (clean(next.hash) !== clean(oldRef.hash) || Number(next.swipeId) !== Number(oldRef.swipeId)) {
        changed.push({ before: oldRef, after: next });
      }
    }
    current.sort((a, b) => a.layer - b.layer);
    return {
      valid: missing.length === 0 && changed.length === 0,
      inherited: false, refs: current, changed, missing,
      startLayer: current.length ? current[0].layer : null,
      endLayer: current.length ? current[current.length - 1].layer : null
    };
  }

  /** 引用集→对话文本（失效楼层跳过） */
  function refsToConversation(refs) {
    const audit = auditRefs(refs);
    const map = currentMessageMap(), ctx = getCtx();
    return audit.refs.map(ref => {
      const found = map.get(clean(ref.messageId));
      if (!found) return '';
      const message = found.message;
      const fallback = message && message.is_user ? ((ctx && ctx.name1) || '用户') : ((ctx && ctx.name2) || '角色');
      return `[楼层 ${found.layer}]【${clean(message && message.name) || fallback}】\n${clean(message && message.mes)}`;
    }).filter(Boolean).join('\n\n');
  }

  function unionRefs(groups) {
    const seen = new Set(), result = [];
    for (const ref of (groups || []).flatMap(g => Array.isArray(g) ? g : [])) {
      const key = `${clean(ref.chatId)}:${clean(ref.messageId)}`;
      if (!clean(ref.messageId) || seen.has(key)) continue;
      seen.add(key);
      result.push(clone(ref));
    }
    return result.sort((a, b) => Number(a.layer) - Number(b.layer));
  }

  WA.timeline = {
    SOURCE_ID_KEY, hashText, messageHash, ensureMessageId, sourceRef,
    captureRange, digestRefs, auditRefs, refsToConversation, unionRefs, chatId
  };
})();