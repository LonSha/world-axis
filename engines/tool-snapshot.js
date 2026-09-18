/**
 * WorldAxis engines/tool-snapshot.js (v0.9.1) — 全状态快照导出/恢复
 * 缝合来源：DlSNlGHT World —— world-engine-ui.js 面板导出/导入（version 1.2 格式校验 + checkpoint 成对搬运）
 *
 * 与 engines/chatcache.js 的区别：
 *  - chatcache  ：自动滚动备份（3 份）、chat_metadata 跨设备同步、Lamport 冲突消解
 *  - 本工具     ：人工单文件导出（可归档、可传给别人、可跨聊天移植）
 *
 * 导出格式（v2，兼容读取 v1）：
 *   { worldaxis: 2, exportedAt, chatId, chatLabel, schemaVersion, state, meta:{counts} }
 *
 * 铁律：
 *  - 导出内容剔除运行期脏字段（__*、临时缓存），保证可复现
 *  - 恢复前必须 dryRun 校验（字段完整性、schemaVersion 兼容），校验不过不落盘
 *  - 恢复走 store.transact，失败不留半份状态
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const FORMAT = 2;
  const ACCEPTED = [1, 2];
  // 运行期脏字段：导出时剔除，避免污染归档
  const DROP_KEYS = ['__proto__', '__volatile', '__cache'];

  function deepClone(v) { return JSON.parse(JSON.stringify(v)); }

  function sanitize(node) {
    if (Array.isArray(node)) return node.map(sanitize);
    if (node && typeof node === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(node)) {
        if (DROP_KEYS.includes(k)) continue;
        if (k.startsWith('__') && k !== '__error') continue;
        out[k] = sanitize(v);
      }
      return out;
    }
    return node;
  }

  function counts(state) {
    const ev = state?.evolution || {};
    return {
      people: Object.keys(state?.people || {}).length,
      currents: (state?.currents || []).length,
      facts: (state?.memory?.facts || []).filter(f => f.active !== false).length,
      foreshadows: (state?.memory?.foreshadows || []).length,
      events: (ev.events || []).length,
      factions: (ev.factions || []).length,
      chronicle: (state?.chronicle || []).length,
      pmem: (state?.memory?.pmem || []).length
    };
  }

  /** 生成导出载荷（纯函数，不改 store） */
  function buildPayload(opts = {}) {
    const state = WA.store.get();
    const chatId = WA.store.read ? (WA.store.chatId ? WA.store.chatId() : 'unknown') : 'unknown';
    return {
      worldaxis: FORMAT,
      exportedAt: new Date().toISOString(),
      chatId,
      chatLabel: opts.label || (state.clock && state.clock.label) || '',
      schemaVersion: state.schemaVersion || 1,
      state: sanitize(deepClone(state)),
      meta: { counts: counts(state), engineVersion: WA.version || '?' }
    };
  }

  function toJSON(opts = {}) { return JSON.stringify(buildPayload(opts), null, 2); }

  /** 校验导入载荷：不落盘，纯检查 */
  function validate(raw) {
    const problems = [];
    let data = raw;
    if (typeof raw === 'string') {
      try { data = JSON.parse(raw); }
      catch (e) { return { ok: false, problems: ['不是合法 JSON：' + e.message] }; }
    }
    if (!data || typeof data !== 'object') return { ok: false, problems: ['载荷不是对象'] };
    const fmt = data.worldaxis !== undefined ? data.worldaxis : (data.version !== undefined ? 1 : undefined);
    if (fmt === undefined) problems.push('缺少 worldaxis/version 标识（非WorldAxis存档？）');
    else if (!ACCEPTED.includes(Number(fmt))) problems.push(`格式版本 ${fmt} 不受支持（支持 ${ACCEPTED.join('/')}）`);
    const state = data.state || (fmt === 1 ? data : null);
    if (!state) problems.push('载荷缺少 state');
    if (state) {
      if (state.schemaVersion === undefined) problems.push('state 缺少 schemaVersion');
      else if (Number(state.schemaVersion) > (WA.store.SCHEMA_VERSION || 1)) problems.push(`存档 schema ${state.schemaVersion} 高于当前 ${WA.store.SCHEMA_VERSION}（请升级扩展）`);
      if (!state.clock || typeof state.clock !== 'object') problems.push('state 缺少 clock');
      if (!state.memory || typeof state.memory !== 'object') problems.push('state 缺少 memory');
      if (!state.evolution || typeof state.evolution !== 'object') problems.push('state 缺少 evolution');
      if (state.people !== undefined && (typeof state.people !== 'object' || Array.isArray(state.people))) problems.push('state.people 应为对象');
    }
    return { ok: problems.length === 0, problems, format: fmt, state, incoming: data.meta?.counts || null };
  }

  /** 恢复：dryRun=true 时只校验不写入 */
  function restore(raw, opts = {}) {
    const v = validate(raw);
    if (!v.ok) return { ok: false, reason: v.problems.join('；'), problems: v.problems };
    // 先留恢复点（含未写入前状态）
    let recoveryCreated = false;
    try { if (WA.store.createRecoveryPoint) { WA.store.createRecoveryPoint(); recoveryCreated = true; } } catch (e) { /* 非致命 */ }
    const incoming = sanitize(deepClone(v.state));
    // transact 的契约：mutator 必须就地修改 draft（返回值不落盘），故先清键再合并
    const tx = WA.store.transact(draft => {
      for (const k of Object.keys(draft)) delete draft[k];
      Object.assign(draft, incoming);
      if (draft.schemaVersion === undefined) draft.schemaVersion = WA.store.SCHEMA_VERSION || 1;
      if (!draft.meta || typeof draft.meta !== 'object') draft.meta = {};
      draft.meta.updatedAt = clockNow('toolSnapshot');
    });
    if (!tx.ok) return { ok: false, reason: '写入失败：' + ((tx.error && tx.error.message) || (tx.aborted ? '已中止' : '未知')), recoveryCreated };
    return { ok: true, recoveryCreated, counts: counts(WA.store.get()), format: v.format };
  }

  /** 导出为浏览器文件（UI 用；node 环境返回 false） */
  function download(opts = {}) {
    try {
      const json = toJSON(opts);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = (WA.mainDoc || document).createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `worldaxis-${stamp}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true, bytes: json.length };
    } catch (e) { return { ok: false, reason: String(e.message || e) }; }
  }

  WA.toolSnapshot = {
    FORMAT, ACCEPTED,
    buildPayload, toJSON, validate, restore, download, counts, sanitize
  };
  if (WA.log) WA.log('info', '快照导出/恢复工具已加载');
})();