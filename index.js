/**
 * 世界枢轴 WorldAxis v0.1.0
 * 缝合：世界背面 / DlSNlGHT World / st-beat-tracker / SevenDaysCal / story-oracle(+outline)
 *       st-direct-event / SoulLink / choice / EW-Assistant / st-theater / Veridis-Rewrite
 *       WNE引擎 / TH-剧情推进 / 创世工坊 等资产
 * 骨架：单拦截器调度内核 + 工作流节点注册表 + 世界演算底座 + 分源注入 + 主面板
 */
(function () {
  'use strict';

  const MODULE = 'worldAxis';
  const VERSION = '2.35.0';
  const LOG = '[世界枢轴]';

  // 防止重复加载
  if (window.__WORLD_AXIS_LOADED__) return;
  window.__WORLD_AXIS_LOADED__ = true;

  // 主窗口引用（TH脚本blob iframe场景下需要parent）
  const mainWin = (() => {
    try { return window.parent && window.parent !== window ? window.parent : window; }
    catch (e) { return window; }
  })();
  const mainDoc = mainWin.document || document;

  // ── 命名空间 ─────────────────────────────────────────────
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.4.0: `WA.VERSION` 此前在 `const WA` 声明**之前**赋值 —— 严格模式命中 TDZ
  //   （ReferenceError: Cannot access 'WA' before initialization），入口文件抛错即崩、
  //   扩展整体无法装载。旧键 WS.VERSION 由 tool-diag 消费（`WA.VERSION || WA.version`），
  //   故在命名空间建立后补回，避免消费端读空。tests/run.js 跳过 index.js，故长期未被回归发现。
  WA.VERSION = VERSION;
  WA.version = VERSION;
  WA.mainWin = mainWin;
  WA.mainDoc = mainDoc;
  // v2.15.0: 时间源单一出口（决策时间进存档/参与判定，测量时间只进内存台账与日志）。
  //   注意：本文件里一律用**内联三目**而非局部 helper——run.js 会把 loadScriptOnce 这
  //   段源码切片出来在独立沙箱里重编译，helper 不在切片内，用 helper 会在 CDN 回退路径上炸。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  // v2.0.0: 模块注册表契约已下沉至 core/store.js（注册表必须在所有加载路径下存在，
  // 而非仅在入口文件）——此处保留转发兜底，防旧加载顺序下未定义。
  if (typeof WA.registerModule !== 'function') {
    WA.modules = WA.modules || {};
    WA.registerModule = function (name, meta) {
      if (!name) return null;
      const rec = { name: name, at: (WA.clock ? WA.clock.now('index.module') : Date.now()), ver: (meta && meta.ver) || VERSION, kind: (meta && meta.kind) || 'engine' };
      WA.modules[name] = rec;
      return rec;
    };
  }
  if (typeof WA.moduleRegistry !== 'function') WA.moduleRegistry = function () { return Object.keys(WA.modules || {}).sort(); };
  WA.eventLog = [];     // 轻量运行日志（内存环形，最多300条，info/warn/error 混装）
  WA.errorLog = [];    // v0.1.53: error 专属子环（最多50条）——info 噪音挤掉混合环也不丢关键故障证据
  const ERROR_LOG_MAX = 50;
  // v0.4.0: 诊断环自适应——上限按存储水位动态收紧/放宽。
  // 压力来源：① 当前聊天诊断占比超预算（diagBudget.exceeded）② 全库 worldaxis 键总体积越水位。
  // 收紧后既省体积又不静默丢证据：裁剪量进 logTrimStat 可观测。
  const LOG_ADAPT = {
    baseEvent: 300, baseError: 50,       // 常规上限
    tightEvent: 120, tightError: 30,     // 紧张时上限
    minuteEvent: 60, minuteError: 20,    // 危急时上限
    bytesSoft: 4 * 1024 * 1024,          // 软水位 4MB（worldaxis_* 全体）
    bytesHard: 8 * 1024 * 1024           // 硬水位 8MB
  };
  const __logTrimStat = { eventTrims: 0, errorTrims: 0, lastAt: 0, level: 'normal' };
  function logCaps() {
    let level = 'normal', why = [];
    try {
      if (WA.store && WA.store.diagBudget) {
        const db = WA.store.diagBudget();
        if (db && db.exceeded) { level = 'tight'; why.push('diagPct=' + db.diagPct + '%>' + db.maxPct + '%'); }
      }
      if (WA.store && WA.store.storageStat) {
        const st = WA.store.storageStat();
        const tot = (st && st.totalBytes) || 0;
        if (tot > LOG_ADAPT.bytesHard) { level = 'minute'; why.push('totalBytes>' + LOG_ADAPT.bytesHard); }
        else if (tot > LOG_ADAPT.bytesSoft && level === 'normal') { level = 'tight'; why.push('totalBytes>' + LOG_ADAPT.bytesSoft); }
      }
    } catch (e) {}
    __logTrimStat.level = level;
    const ev = level === 'minute' ? LOG_ADAPT.minuteEvent : level === 'tight' ? LOG_ADAPT.tightEvent : LOG_ADAPT.baseEvent;
    const er = level === 'minute' ? LOG_ADAPT.minuteError : level === 'tight' ? LOG_ADAPT.tightError : LOG_ADAPT.baseError;
    return { level: level, event: ev, error: er, why: why };
  }
  function logTrimStatView() {
    const caps = logCaps();
    return { eventTrims: __logTrimStat.eventTrims, errorTrims: __logTrimStat.errorTrims, lastAt: __logTrimStat.lastAt, level: caps.level, eventCap: caps.event, errorCap: caps.error, why: caps.why };
  }
  let __logSaveTimer = null;
  let __logSaveChat = null;   // v0.2.1: 挂起日志所属聊天（防抖窗口内切聊天时写错目标）
  const LOG_SAVE_DEBOUNCE_MS = 500;
  function persistEventLog(chatId) {
    try {
      const cid = chatId || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
      mainWin.localStorage.setItem('worldaxis_event_log_' + cid, JSON.stringify(WA.eventLog.slice(-300)));
      mainWin.localStorage.setItem('worldaxis_error_log_' + cid, JSON.stringify(WA.errorLog.slice(-ERROR_LOG_MAX)));
    } catch (e) {}
  }
  // v0.2.1: 防抖批量落盘——高频 info 日志合并窗口内只写一次，error 立即落盘保关键证据
  function scheduleLogSave(immediate) {
    if (immediate) {
      const target = __logSaveChat || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
      if (__logSaveTimer) { clearTimeout(__logSaveTimer); __logSaveTimer = null; }
      persistEventLog(target); __logSaveChat = null;
      return;
    }
    if (!__logSaveChat) __logSaveChat = (WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default';
    if (__logSaveTimer) return;
    __logSaveTimer = setTimeout(function () {
      const target = __logSaveChat; __logSaveTimer = null; __logSaveChat = null;
      persistEventLog(target);
    }, LOG_SAVE_DEBOUNCE_MS);
  }
  WA.log = function (level, msg, data) {
    const entry = { t: clockNow('index.log'), level, msg, data: data === undefined ? null : String(data).slice(0, 500) };
    WA.eventLog.push(entry);
    // v0.4.0: 按存储水位动态裁剪（常规 300 / 紧张 120 / 危急 60）
    const caps = logCaps();   // 函数声明提升：加载期调用也安全
    if (WA.eventLog.length > caps.event) {
      const drop = WA.eventLog.length - caps.event;
      WA.eventLog.splice(0, drop);
      __logTrimStat.eventTrims += drop; __logTrimStat.lastAt = clockWall();
    }
    if (level === 'error') {
      WA.errorLog.push(entry);
      if (WA.errorLog.length > caps.error) {
        const dropE = WA.errorLog.length - caps.error;
        WA.errorLog.splice(0, dropE);
        __logTrimStat.errorTrims += dropE; __logTrimStat.lastAt = clockWall();
      }
    }
    scheduleLogSave(level === 'error');   // v0.2.1: error 立即落盘；info/warn 走防抖窗口
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(LOG, msg, data ?? '');
  };
  WA.logCaps = logCaps;          // v0.4.0: 当前诊断环动态上限（供测试/诊断消费）
  WA.logTrimStat = logTrimStatView;
  // v0.2.1: 恢复/清理日志（v0.1.53: 同步恢复/清理 error 子环）
  //          切换聊天/清理前先冲刷挂起的防抖写入，防止未落盘日志丢失
  WA.flushLog = function () {
    if (!__logSaveTimer) return;   // v0.2.1: 无挂起写入 = 全部已落盘，不得动磁盘（防用已切换的内存覆盖已持久化数据）
    clearTimeout(__logSaveTimer); __logSaveTimer = null;
    const target = __logSaveChat || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
    __logSaveChat = null;
    persistEventLog(target);
  };
  // v2.11.0: 宿主级读失败投递（与各模块同口径——单一台账、多模块投递）
  function reportHostReadFail(source, key, err) {
    try { if (WA.store && typeof WA.store.reportReadFail === 'function') WA.store.reportReadFail(source, key, err); } catch (e) {}
  }
  WA.loadEventLog = function (chatId) {
    try {
      WA.flushLog();   // 先落盘当前聊天挂起日志
      const cid = chatId || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
      // v2.11.0: 两处日志载入此前共用一个空 catch ⇒ 读失败表现为「本会话没有历史日志」，
      //   而日志正是排查其它故障的唯一证据面——它自己读不出来时必须是可见的。
      let raw = null;
      try { raw = mainWin.localStorage.getItem('worldaxis_event_log_' + cid); }
      catch (eH) { reportHostReadFail('eventLog', 'worldaxis_event_log_' + cid, eH); }
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) WA.eventLog = arr.slice(-LOG_ADAPT.baseEvent);
      }
      let rawErr = null;
      try { rawErr = mainWin.localStorage.getItem('worldaxis_error_log_' + cid); }
      catch (eH2) { reportHostReadFail('errorLog', 'worldaxis_error_log_' + cid, eH2); }
      if (rawErr) {
        const arrErr = JSON.parse(rawErr);
        if (Array.isArray(arrErr)) WA.errorLog = arrErr.slice(-ERROR_LOG_MAX);
      }
    } catch (e) {}
  };
  WA.clearEventLog = function (chatId) {
    WA.eventLog = [];
    WA.errorLog = [];
    // v0.2.1: 取消挂起的防抖写入，防止已清空日志被定时器复活写回
    if (__logSaveTimer) { clearTimeout(__logSaveTimer); __logSaveTimer = null; }
    __logSaveChat = null;
    try {
      const cid = chatId || ((WA.store && WA.store.chatId) ? WA.store.chatId() : 'wa_default');
      // v2.9.0: 走 store 的受控删除出口（此前裸调 removeItem）。清除日志的语义是「清空」——
      //   删失败时防抖写入已取消、内存也清了，而磁盘上的旧日志会在下次 loadEventLog 时
      //   整段复活：用户看到「已清空」，重启后又回来了，且没有任何线索。
      if (WA.store && typeof WA.store.removeVerified === 'function') {
        WA.store.removeVerified('worldaxis_event_log_' + cid);
        WA.store.removeVerified('worldaxis_error_log_' + cid);
      }
    } catch (e) {}
  };

  // ── 加载子模块（按依赖顺序）─────────────────────────────
  // 使用扩展自身URL推导base路径（兼容 third-party 目录）
  function getBaseUrl() {
    const scripts = mainDoc.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src || '';
      const idx = src.indexOf('/index.js');
      if (idx > 0 && src.includes('WorldAxis')) return src.slice(0, idx);
    }
    // 回退：从 import.meta 不可用（非模块），用扩展目录惯例
    return '/scripts/extensions/third-party/WorldAxis';
  }
  WA.baseUrl = getBaseUrl();
  WA.loadScript = loadScript;

  const LOAD_ORDER = [
    'core/clock.js',           // v2.15.0: 时间源单一出口（决策时间可冻结 / 测量时间不受影响）——须最先装载
    'core/rand.js',            // v2.14.0: 随机源单一出口（决策流可复现 / 标识流不混流）
    'core/settings-bus.js',
    'core/store.js',
    'core/evict.js',          // v2.13.0: 挤出侧单一出口（必须先于各引擎装载）
    'core/api-router.js',
    'core/undo.js',           // v2.30.0: 参数编辑撤销栈（P0-2；须在 store 之后、UI 之前装载）
    'core/workflow.js',
    'core/settle-guard.js',
    'core/interceptor.js',
    'engines/backstage.js',
    'engines/evolution.js',
    'engines/enemies.js',
    'engines/regional.js',
    'engines/parallel-world.js', // v2.34.0: 平行世界（主线之外独立推演，缝合自狐神抚 V19.5）
     'engines/horizon.js',
     'engines/digest.js',
     'engines/limits.js',
'engines/worldbook.js', 'engines/ledger.js', 'engines/timeline.js', 'engines/entities.js', 'engines/preset.js', 'engines/chatcache.js', 'engines/pmem.js', 'engines/rules.js', 'engines/summarizer.js',
    'engines/chapters.js',
    'engines/direct-event.js',
    'engines/editor-faction.js',
    'engines/editor-events.js',
    'engines/inspector-state.js',
    'engines/tool-snapshot.js',
    'engines/tool-analyzer.js',
    'engines/tool-import.js',
    'engines/inject-inspector.js',
    'engines/inject-budget.js',
    'engines/tool-diag.js',
    'engines/contract-audit.js',
    'engines/memory-sampler.js',
    'engines/sampler-check.js',
    'engines/inject-channel.js',
    'engines/inject-slot-audit.js',
    'engines/proactive.js',
    'engines/wb-inject.js',
    'engines/calendar.js',
    'engines/memory.js',
    'engines/opinion.js',
    // v2.16.0: 对外只读互操作桥（worldaxis_bridge_v1）。须在 store/settingsBus/interceptor/workflow
    //   之后装载——它读 store、写设置走 settingsBus、订阅总线、并在 after 链注册发布节点。
    'engines/bridge.js',
    // v2.17.0: 记忆桥消费面（读 window.lonsha_memory_bridge_v1）。须在 core/store 之后装载
    //   ——它读 store.clock 做对账；与 bridge.js（对外的**供货**面）互为镜像：桥发得出去、
    //   也读得进来，这套互操作才算通了整条。
    'engines/lonsha-reader.js',
    'actors/registry.js',
    'actors/monologue.js',
    'actors/observe.js',
    'actors/profile.js',
    'direction/oracle.js',
    'direction/tags.js',
    'direction/choices.js',
    'render/inject.js',
    'render/theater.js',
    'render/purifier.js',
    'compat/host.js',
    'compat/mvu.js',
    'compat/th-helper.js',
    'ui/panel.js',
    'ui/settings.js',
    'ui/assistant.js',
  ];

  // v0.1.16: 多源容灾——主源（本地扩展目录）失败时依次回退 jsDelivr 三域，每源 12s 闸刀
  const CDN_BASES = [
    'https://cdn.jsdelivr.net/gh/LonSha/world-axis@main',
    'https://fastly.jsdelivr.net/gh/LonSha/world-axis@main',
    'https://testingcf.jsdelivr.net/gh/LonSha/world-axis@main',
  ];
  const SCRIPT_TIMEOUT_MS = 12000;
  const CDN_COOLDOWN_MS = 60000;
  const loadedScripts = new Map();
  const failedCdnAt = new Map();
  function loadScriptOnce(src, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const done = (r) => { if (!settled) { settled = true; resolve(r); } };
      let timer = null;
      try {
        const s = mainDoc.createElement('script');
        s.src = src;
        s.onload = () => { if (timer) clearTimeout(timer); done({ ok: true, src: src }); };
        s.onerror = (e) => { if (timer) clearTimeout(timer); done({ ok: false, src: src, error: 'onerror' }); };
        timer = setTimeout(() => {
          try { if (s.parentNode) s.parentNode.removeChild(s); } catch (e) {}
          done({ ok: false, src: src, error: 'timeout' });
        }, timeoutMs || SCRIPT_TIMEOUT_MS);
        mainDoc.head.appendChild(s);
      } catch (e) { done({ ok: false, src: src, error: String(e && (e.message || e)) }); }
    });
  }
  function loadScript(rel) {
    return (async () => {
      if (!WA.__loaderState) WA.__loaderState = { loaded: new Map(), failedCdnAt: new Map(), failed: new Map() };
      const loaded = WA.__loaderState.loaded;
      const failed = WA.__loaderState.failedCdnAt;
      const cooldownMs = 60000;
      const tag = '?v=' + VERSION;
      const localSrc = WA.baseUrl + '/' + rel + tag;
      const cacheKey = rel + '@' + VERSION;
      const state = WA.__loaderState;
      if (state.loaded.has(cacheKey)) return state.loaded.get(cacheKey);
      const r0 = await loadScriptOnce(localSrc);
      if (r0.ok) {
        const result = { rel: rel, ok: true, src: r0.src };
        state.loaded.set(cacheKey, result);
        try { state.failed.delete(rel); } catch (e) {}
        return result;
      }
      for (let i = 0; i < CDN_BASES.length; i++) {
        const base = CDN_BASES[i];
        const lastFail = state.failedCdnAt.get(base) || 0;
        if ((WA.clock ? WA.clock.now('index.cdnCooldown') : Date.now()) - lastFail < cooldownMs) continue;
        const cdnSrc = base + '/' + rel + tag;
        const r = await loadScriptOnce(cdnSrc);
        if (r.ok) {
          const result = { rel: rel, ok: true, src: r.src, fallback: base };
          state.loaded.set(cacheKey, result);
          try { state.failed.delete(rel); } catch (e) {}
          WA.log('warn', '模块走 CDN 容灾加载成功: ' + rel + ' <- ' + base);
          return result;
        }
        state.failedCdnAt.set(base, (WA.clock ? WA.clock.now('index.cdnCooldown') : Date.now()));
      }
      WA.log('error', '模块全部源加载失败: ' + rel);
      try { state.failed.set(rel, { at: (WA.clock ? WA.clock.now('index.cdnFail') : Date.now()), sourcesTried: 1 + CDN_BASES.length }); } catch (e) {}
      return { rel: rel, ok: false, failed: true };
    })();
  }
  WA.loaderStatus = function () { return { loaded: Array.from((WA.__loaderState&&WA.__loaderState.loaded||new Map()).values()), cdnFailures: Array.from((WA.__loaderState&&WA.__loaderState.failedCdnAt||new Map()).entries()), failedModules: Array.from((WA.__loaderState&&WA.__loaderState.failed||new Map()).entries()).map(function (e) { return { rel: e[0], at: e[1].at, sourcesTried: e[1].sourcesTried }; }) }; };

  // ── 主初始化 ────────────────────────────────────────────
  async function init() {
    WA.log('info', '世界枢轴 v' + VERSION + ' 启动，base=' + WA.baseUrl);
    for (const rel of LOAD_ORDER) {
      await loadScript(rel); // 串行保证依赖顺序
    }
    // v0.1.25: 启动完整性审计——加载失败的模块显式点名并计数（不再静默）
    try {
      const failedList = WA.loaderStatus ? WA.loaderStatus().failedModules : [];
      if (failedList.length) {
        WA.loadFailures = failedList.slice();
        WA.log('error', '启动审计：' + failedList.length + ' 个模块加载失败：' + failedList.map(function (f) { return f.rel; }).join('、'));
      } else {
        WA.loadFailures = [];
        WA.log('info', '启动审计：全部模块加载成功');
      }
    } catch (e) {}
    // 模块全部加载后：初始化store、注册拦截器、建UI
    try { WA.store && WA.store.init && WA.store.init(); } catch (e) { WA.log('error', 'store初始化失败', e); }
    try { WA.interceptor && WA.interceptor.install && WA.interceptor.install(); } catch (e) { WA.log('error', '拦截器安装失败', e); }
    // [v2.19.0/v2.20.0] 启动接线：
    //   · injectInspector.init：订阅 prompt-ready 事件 → 注入自检抓最终 prompt 快照。
    //     这是**面板与 tool-diag 实际消费的那个**（getLastSnapshot/statusText/flatten）。
    //   · chatcache.init：包裹 store.save → 驱动「跨设备同步」与「自动备份」两条链路；
    //     与同步/备份开关（def.syncToChat / def.autoBackup，v2.19.0 补声明）配合生效。
    //   两者均幂等（自持已挂载标记，重复调用返回 false）。
    //   · [v2.20.0] 移除 v2.19.0 加入的 `WA.inspector.init()` 接线——其前提为误判：
    //     经实测，engines/inspector.js（WA.inspector）与 engines/inject-inspector.js
    //     （WA.injectInspector）订阅**同一批**宿主 prompt-ready 事件；而 injectInspector 是
    //     前者的严格超集（多 memory 作用域、MISSING/SKIPPED_REROLL/SUCCESS_SLOTS_ONLY 状态、
    //     订阅重试、快照 clone 隔离、flatten/safe），且只有它被面板/诊断消费
    //     （WA.inspector 的全部导出零消费、也未登记进 MODULE_EXPORTS）。故「注入自检从未订阅」
    //     不成立——真实代价仅是每次生成多挂一个无人读取的 handler。该重复模块已一并删除。
    const __inited = [];
    try { if (WA.injectInspector && typeof WA.injectInspector.init === 'function' && WA.injectInspector.init() === true) __inited.push('injectInspector'); } catch (e) { WA.log('warn', '注入自检初始化失败', e); }
    try { if (WA.chatcache && typeof WA.chatcache.init === 'function' && WA.chatcache.init() === true) __inited.push('chatcache'); } catch (e) { WA.log('warn', '酒馆缓存同步初始化失败', e); }
    WA.__inited = __inited;
    try { WA.ui && WA.ui.mount && WA.ui.mount(); } catch (e) { WA.log('error', 'UI挂载失败', e); }
    // v2.0.0: 装载审计——「已加载 / 已注册 / 清单声明」三方对齐，注册表不再空转
    try {
      const failedRels = (WA.loadFailures || []).map(function (f) { return f.rel; });
      const loadedRels = LOAD_ORDER.filter(function (rel) { return failedRels.indexOf(rel) < 0; });
      loadedRels.forEach(function (rel) {
        const kind = rel.indexOf('core/') === 0 ? 'core' : (rel.indexOf('ui/') === 0 ? 'ui' : (rel.indexOf('compat/') === 0 ? 'compat' : 'engine'));
        WA.registerModule(rel, { kind: kind, ver: VERSION });
      });
      WA.__loadOrder = LOAD_ORDER.slice();
      WA.__loadFailed = failedRels.slice();
      WA.log('info', '世界枢轴初始化完成。已注册模块 ' + Object.keys(WA.modules).length + '/' + LOAD_ORDER.length
        + (failedRels.length ? '（失败 ' + failedRels.length + '：' + failedRels.join('、') + '）' : ''));
    } catch (e) { WA.log('warn', '模块注册审计异常', e); }
    // v2.0.0: 兼容层激活——此前 compatMvu.sync / compatTH.expose 定义了却无人调用（能力死代码）
    try {
      if (WA.compatMvu && WA.compatMvu.init) WA.compatMvu.init();
      if (WA.compatTH && WA.compatTH.init) WA.compatTH.init();
    } catch (e) { WA.log('warn', '兼容层初始化失败', e); }
  }

  // SillyTavern APP_READY 后再初始化（保证宿主事件源可用）
  function whenReady(fn) {
    const ctx = mainWin.SillyTavern && mainWin.SillyTavern.getContext && mainWin.SillyTavern.getContext();
    if (ctx && ctx.eventSource && ctx.eventTypes) {
      if (ctx.eventTypes.APP_READY) {
        ctx.eventSource.on(ctx.eventTypes.APP_READY, fn);
        return;
      }
    }
    // 回退：DOM ready + 延迟
    if (mainDoc.readyState === 'complete' || mainDoc.readyState === 'interactive') setTimeout(fn, 800);
    else mainDoc.addEventListener('DOMContentLoaded', () => setTimeout(fn, 800));
  }

  whenReady(init);
})();
