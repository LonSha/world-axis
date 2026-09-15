/**
 * WorldAxis engines/wb-inject.js (v0.1.14) — 世界书变量镜像注入通道
 * 缝合来源：附本生成器（wb 槽位 → EJS 变量镜像 → 配套世界书条目读取）
 *
 * 为什么需要第三条注入通道：
 *  setExtensionPrompt（v0.1.1 槽位路由）把所有约束类注入挤在同一 position 的槽位里互相覆盖；
 *  wb 通道把约束写进【聊天变量】，由配套世界书条目用 EJS 在精确 order 位置读取——
 *  order 支持 1~1000 任意整数（可插进 212/213/214 密集位置），空变量时 @@if 排除 = 0 token。
 *
 * 与 inject-channel 的关系：正交。wb 通道负责「持久约束类」，槽位路由负责「即时渲染类」。
 * 落点冲突由 inject.js 的主块过滤保证（wb 接管的项不再进 setExtensionPrompt 主块）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const mainWin = WA.mainWin || window;

  const VAR_PREFIX = 'waslot_';        // 镜像变量前缀（与附本生成器 wbslot_ 同构，改前缀避免命名冲突）
  const ORDER_MIN = 1, ORDER_MAX = 1000;
  const WB_NAME_MATCH = 'WorldAxis';   // 配套世界书名匹配关键词

  function getTH() {
    try { return (typeof TavernHelper !== 'undefined') ? TavernHelper : (mainWin.TavernHelper || null); }
    catch (e) { return null; }
  }
  function getCtx() {
    try { return mainWin.SillyTavern && mainWin.SillyTavern.getContext ? mainWin.SillyTavern.getContext() : null; }
    catch (e) { return null; }
  }
  function enabled() {
    try { return WA.backstage && WA.backstage.getSettings ? WA.backstage.getSettings().wbInject !== false : true; }
    catch (e) { return true; }   // 默认开
  }

  /** order → 补零到 4 位的变量名 */
  function orderKey(order) {
    return VAR_PREFIX + String(order).padStart(4, '0');
  }
  function validOrder(o) { return Number.isInteger(o) && o >= ORDER_MIN && o <= ORDER_MAX; }

  /** 读聊天变量（EJS 条目侧也会读，这里读是为了 sync 时做差分） */
  function getVars() {
    const TH = getTH();
    if (!TH || !TH.getVariables) return {};
    try { return TH.getVariables({ type: 'chat' }) || {}; }
    catch (e) { return {}; }
  }
  /** 整表替换写回——必须用 replaceVariables 不能用 insertOrAssignVariables（深度合并会让被删的 key 复活） */
  function replaceVars(all) {
    const TH = getTH();
    if (!TH || !TH.replaceVariables) return false;
    try { TH.replaceVariables(all, { type: 'chat' }); return true; }
    catch (e) { return false; }
  }

  /**
   * 同步一个 order 的镜像变量：把所有指定该 order 的注入项拼接后写入 waslot_NNNN。
   * items = [{ source, content, order }]，同 order 项按数组顺序拼接。
   * 空结果写空串（世界书 @@if 排除 = 0 token），不是删除变量——删除走 clearOrder。
   */
  function syncOrder(order, items) {
    if (!validOrder(order)) return { ok: false, reason: 'bad-order' };
    if (!enabled()) return { ok: false, reason: 'disabled' };
    const parts = (Array.isArray(items) ? items : [])
      .filter(i => i && i.content && String(i.content).trim())
      .map(i => String(i.content).trim());
    const key = orderKey(order);
    const all = getVars();
    all[key] = parts.join('\n\n');
    if (!replaceVars(all)) return { ok: false, reason: 'write-failed' };
    return { ok: true, key: key, chars: all[key].length };
  }

  /** 清空一个 order 的镜像变量（写空串，非删除——EJS 侧 @@if 判空） */
  function clearOrder(order) {
    if (!validOrder(order)) return { ok: false, reason: 'bad-order' };
    const key = orderKey(order);
    const all = getVars();
    if (!(key in all)) return { ok: true, reason: 'absent' };
    all[key] = '';
    if (!replaceVars(all)) return { ok: false, reason: 'write-failed' };
    return { ok: true, key: key };
  }

  /** 批量同步：items 自身携带 order 字段时按 order 分组，逐组 sync */
  function syncAll(items) {
    if (!enabled()) return { ok: false, reason: 'disabled' };
    const groups = {};
    (Array.isArray(items) ? items : []).forEach(function (i) {
      if (!i || !i.content || !validOrder(i.order)) return;
      const k = String(i.order);
      (groups[k] = groups[k] || []).push(i);
    });
    const results = {};
    let anyFail = false;
    Object.keys(groups).forEach(function (k) {
      const r = syncOrder(Number(k), groups[k]);
      results[k] = r;
      if (!r.ok && r.reason !== 'disabled') anyFail = true;
    });
    return { ok: !anyFail, orders: Object.keys(results), results: results };
  }

  /**
   * 确保配套世界书里有读取该 order 的 EJS 条目；没有则创建（创了就留，不自动删）。
   * 需宿主支持 TavernHelper.getWorldbook / createWorldbookEntries，否则降级为「仅写变量」。
   */
  function wbEntryContent(order) {
    const k = orderKey(order);
    return '@@if ((typeof variables!==\'undefined\'&&variables.' + k + ')||(typeof getvar!==\'undefined\'&&getvar(\'' + k + '\')))\n'
      + '<% var _v = (typeof variables !== \'undefined\' && variables.' + k + ') || (typeof SillyTavern !== \'undefined\' && SillyTavern.TavernHelper && SillyTavern.TavernHelper.getVariables({type:\'chat\'}).' + k + ') || \'\'; %><%- _v %>';
  }

  async function ensureEntry(order) {
    if (!validOrder(order)) return { ok: false, reason: 'bad-order' };
    const TH = getTH();
    if (!TH || !TH.getWorldbook || !TH.createWorldbookEntries) return { ok: false, reason: 'no-th' };
    const wbName = findCompanionName();
    if (!wbName) return { ok: false, reason: 'no-companion' };
    try {
      const entries = await TH.getWorldbook(wbName);
      const exists = (entries || []).some(e => e && e.position && e.position.type === 'before_character_definition' && Number(e.position.order) === order);
      if (exists) return { ok: true, reason: 'exists' };
      await TH.createWorldbookEntries(wbName, [{
        name: 'WorldAxis 槽位 ' + order,
        enabled: true,
        strategy: { type: 'constant', keys: [], keys_secondary: { logic: 'and_any', keys: [] } },
        position: { type: 'before_character_definition', order: order, depth: 4 },
        content: wbEntryContent(order),
        probability: 100,
        recursion: { prevent_incoming: true, prevent_outgoing: true, delay_until: null }
      }]);
      // 创建后复查（防静默失败）
      const after = await TH.getWorldbook(wbName);
      const ok2 = (after || []).some(e => e && e.position && e.position.type === 'before_character_definition' && Number(e.position.order) === order);
      return { ok: ok2, reason: ok2 ? 'created' : 'create-verify-failed' };
    } catch (e) {
      return { ok: false, reason: 'error', error: e };
    }
  }

  /** 找配套世界书名（容忍改名，含关键词即视为配套） */
  function findCompanionName() {
    const ctx = getCtx();
    const names = (ctx && ctx.worldInfoSettings && Array.isArray(ctx.worldInfoSettings.world_names)) ? ctx.worldInfoSettings.world_names : [];
    if (names.indexOf(WB_NAME_MATCH) >= 0) return WB_NAME_MATCH;
    for (let i = 0; i < names.length; i++) if (String(names[i]).indexOf(WB_NAME_MATCH) >= 0) return names[i];
    return null;
  }

  WA.wbInject = {
    VAR_PREFIX: VAR_PREFIX, ORDER_MIN: ORDER_MIN, ORDER_MAX: ORDER_MAX,
    orderKey: orderKey, validOrder: validOrder, wbEntryContent: wbEntryContent,
    syncOrder: syncOrder, syncAll: syncAll, clearOrder: clearOrder,
    ensureEntry: ensureEntry, findCompanionName: findCompanionName,
    isEnabled: enabled
  };

  if (WA.log) WA.log('info', '世界书变量镜像注入通道已加载');
})();
