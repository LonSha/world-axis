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
  const VERSION = '0.1.16';
  WA.VERSION = VERSION;
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
  WA.version = VERSION;
  WA.mainWin = mainWin;
  WA.mainDoc = mainDoc;
  WA.modules = {};      // 模块注册表（引擎/UI各自登记）
  WA.eventLog = [];     // 轻量运行日志（内存环形，最多300条）
  WA.log = function (level, msg, data) {
    const entry = { t: Date.now(), level, msg, data: data === undefined ? null : String(data).slice(0, 500) };
    WA.eventLog.push(entry);
    if (WA.eventLog.length > 300) WA.eventLog.splice(0, WA.eventLog.length - 300);
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn(LOG, msg, data ?? '');
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
    'core/store.js',
    'core/api-router.js',
    'core/workflow.js',
    'core/interceptor.js',
    'engines/backstage.js',
    'engines/evolution.js',
    'engines/enemies.js',
    'engines/regional.js',
     'engines/horizon.js',
     'engines/digest.js',
     'engines/limits.js',
'engines/worldbook.js', 'engines/ledger.js', 'engines/inspector.js', 'engines/timeline.js', 'engines/entities.js', 'engines/preset.js', 'engines/chatcache.js', 'engines/pmem.js', 'engines/rules.js', 'engines/summarizer.js',
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
      const tag = '?v=' + VERSION;
      const localSrc = WA.baseUrl + '/' + rel + tag;
      const r0 = await loadScriptOnce(localSrc);
      if (r0.ok) return { rel: rel, ok: true, src: r0.src };
      for (let i = 0; i < CDN_BASES.length; i++) {
        const cdnSrc = CDN_BASES[i] + '/' + rel + tag;
        const r = await loadScriptOnce(cdnSrc);
        if (r.ok) {
          WA.log('warn', '模块走 CDN 容灾加载成功: ' + rel + ' <- ' + CDN_BASES[i]);
          return { rel: rel, ok: true, src: r.src, fallback: CDN_BASES[i] };
        }
      }
      WA.log('error', '模块全部源加载失败: ' + rel);
      return { rel: rel, ok: false };
    })();
  }

  // ── 主初始化 ────────────────────────────────────────────
  async function init() {
    WA.log('info', '世界枢轴 v' + VERSION + ' 启动，base=' + WA.baseUrl);
    for (const rel of LOAD_ORDER) {
      await loadScript(rel); // 串行保证依赖顺序
    }
    // 模块全部加载后：初始化store、注册拦截器、建UI
    try { WA.store && WA.store.init && WA.store.init(); } catch (e) { WA.log('error', 'store初始化失败', e); }
    try { WA.interceptor && WA.interceptor.install && WA.interceptor.install(); } catch (e) { WA.log('error', '拦截器安装失败', e); }
    try { WA.injectInspector && WA.injectInspector.init && WA.injectInspector.init(); } catch (e) { WA.log('warn', '注入自检初始化失败', e); }
    try { WA.ui && WA.ui.mount && WA.ui.mount(); } catch (e) { WA.log('error', 'UI挂载失败', e); }
    WA.log('info', '世界枢轴初始化完成。已注册模块: ' + Object.keys(WA.modules).join(', '));
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
