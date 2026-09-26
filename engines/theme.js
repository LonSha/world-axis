/**
 * WorldAxis engines/theme.js (v2.87.0) — 题材规则组合（B7）
 *
 * 治的病：**题材无处安放**。
 *   engines/rules.js 有 16 个规则模块（world/event/faction/wind/…/protocol），
 *   backstage.buildPrompt 只有两档：全量（getAll）或精简（coreSummary）。
 *   于是「我这一局是都市恋爱，不要奇幻模块」只能靠人肉改源码或整局忍受。
 *   本模块把题材做成对 ORDER 的**显式组合**：装/卸题材只改顺序表，不改任何正文。
 *
 * 三条口径：
 *   ① **组合是叠加的**：多个题材可同时启用（都市 + 悬疑），模块取并集并按 ORDER 原序。
 *      不引入优先级、不做「后者覆盖前者」——覆盖式合并会让「谁赢了」不可预测。
 *   ② **预览不覆盖**：preview() 纯计算（模块数 / 字数 / 相对当前的差异），不写设置。
 *      用户看到结果才决定 apply，预览本身不留任何痕迹。
 *   ③ **未知题材不静默**：enable(name) 对不认识的题材返回 false + reason，
 *      不当作空集悄悄接受（空集会让「启用了」与「没启用」长得一样）。
 *
 * 职责分离（B7 第三项）：见 separation()。三插件各司其职，缺席时**降级可见**。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_theme_settings_v1';
  const DEF = { themes: [] };
  const __REG = { key: LS_KEY, def: DEF, module: 'theme', bounds: {} };
  // 题材 = 模块的显式组合。核模块（world/event/info/reputation）不入任何题材的排除面，
  //   它们是「世界非中心化」的承重墙，卸掉就没有世界可言。
  const CORE = ['world', 'event', 'info', 'reputation'];
  const THEMES = {
    urban: { label: '都市', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'enemy', 'regional', 'persona', 'relation', 'craft', 'protocol'] },
    campus: { label: '校园', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'persona', 'relation', 'craft', 'protocol'] },
    mystery: { label: '悬疑', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'enemy', 'blackbox', 'regional', 'persona', 'relation', 'craft', 'protocol'] },
    fantasy: { label: '奇幻', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'enemy', 'regional', 'blackbox', 'trends', 'persona', 'relation', 'craft', 'protocol'] },
    business: { label: '经营', modules: ['world', 'event', 'faction', 'wind', 'influence', 'info', 'reputation', 'economy', 'regional', 'trends', 'persona', 'relation', 'craft', 'protocol'] }
  };
  const stat = { applies: 0, previews: 0, rejects: 0, lastTheme: '', lastReason: '' };
  function settings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }
  function saveSettings(next) {
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, Object.assign({}, DEF, next || {})));
  }
  function list() {
    return Object.keys(THEMES).map(function (k) {
      return { key: k, label: THEMES[k].label, modules: THEMES[k].modules.slice() };
    });
  }
  function known(name) { return !!THEMES[String(name || '')]; }
  /** 题材列表 -> 模块集合（并按 ORDER 原序返回；核心模块永远在场） */
  function compose(names) {
    const order = (WA.rules && Array.isArray(WA.rules.ORDER)) ? WA.rules.ORDER : [];
    const picked = {};
    CORE.forEach(function (k) { picked[k] = true; });
    (Array.isArray(names) ? names : []).forEach(function (n) {
      const t = THEMES[String(n || '')];
      if (!t) return;
      t.modules.forEach(function (k) { picked[k] = true; });
    });
    const mods = order.filter(function (k) { return picked[k] === true; });
    return { modules: mods, dropped: order.filter(function (k) { return picked[k] !== true; }) };
  }
  /**
   * 预览：题材组合对注入面的影响。**纯计算，不落设置**（预览不覆盖）。
   */
  function preview(names) {
    stat.previews++;
    const cur = settings().themes || [];
    // v2.87.0 自纠：未启用题材时「当前面」是**全量 ORDER**，不是 compose([])（那只有 CORE 4 个）。
    //   实测：用 compose([]) 当基线，campus 的 deltaChars 报 +5408（假的增量，
    //   实际是「从 16 模块减到 12」）。差异预览撒谎比没有预览更糟。
    const order = (WA.rules && Array.isArray(WA.rules.ORDER)) ? WA.rules.ORDER : [];
    const a = cur.length ? compose(cur) : { modules: order.slice(), dropped: [] };
    const b = compose(names);
    const chars = function (mods) {
      if (!WA.rules || typeof WA.rules.getModule !== 'function') return 0;
      return mods.reduce(function (n, k) { return n + (WA.rules.getModule(k) || '').length; }, 0);
    };
    const added = b.modules.filter(function (k) { return a.modules.indexOf(k) < 0; });
    const removed = a.modules.filter(function (k) { return b.modules.indexOf(k) < 0; });
    return { ok: true, current: cur.slice(), next: (Array.isArray(names) ? names.slice() : []),
      modules: b.modules.slice(), moduleCount: b.modules.length,
      chars: chars(b.modules), currentChars: chars(a.modules), deltaChars: chars(b.modules) - chars(a.modules),
      added: added, removed: removed, droppedModules: b.dropped.slice(), previewOnly: true };
  }
  /** 应用（唯一写入口）：未知题材一律拒收，不静默当空集 */
  function apply(names) {
    const arr = Array.isArray(names) ? names.slice() : [];
    const bad = arr.filter(function (n) { return !known(n); });
    if (bad.length) {
      stat.rejects++; stat.lastReason = 'unknown-theme';
      return { ok: false, reason: 'unknown-theme', unknown: bad, known: Object.keys(THEMES) };
    }
    const r = saveSettings({ themes: arr });
    stat.applies++; stat.lastTheme = arr.join('+'); stat.lastReason = 'applied';
    return { ok: true, themes: arr.slice(), modules: compose(arr).modules, saved: r };
  }
  /** 当前生效的模块（rules 侧注入按它过滤；未启用题材时 = 全量，保持旧行为不变） */
  function activeModules() {
    const t = settings().themes || [];
    if (!t.length) return null;   // null = 未启用题材 => 全量（绝不悄悄改变既有注入）
    return compose(t).modules;
  }
  function statView() {
    const t = settings().themes || [];
    return { themes: t.slice(), active: activeModules(), applies: stat.applies,
      previews: stat.previews, rejects: stat.rejects, lastTheme: stat.lastTheme, lastReason: stat.lastReason,
      available: Object.keys(THEMES) };
  }
  /**
   * B7 第三项：三插件职责分离（事实结算 / 证据读取 / 交互执行）。
   *   缺席**降级可见**：读 compat.detect()/lonshaReader 的现场探测结果，
   *   而不是写死「已接入」。谁的活谁干——本扩展只做事实结算面。
   */
  function separation() {
    const d = (WA.compat && typeof WA.compat.detect === 'function') ? (function () { try { return WA.compat.detect(); } catch (e) { return null; } })() : null;
    const lr = WA.lonshaReader;
    // ★ v2.101.0（O11）修正：此处原读 `s.state`，而 lonshaSource() 从不返回该字段
    //   （它回的是 mounted / sourceState / lastError / hasSnapshot / reason）⇒
    //   无论上游在不在、版本对不对，读数一律 `unknown`。改为读**真源字段**，
    //   并把「不在」与「探不出」分开：不在报 not-mounted，探针抛错报 thrown。
    const lonState = (function () {
      if (!lr || typeof lr.lonshaSource !== 'function') return 'consumer-missing';
      try {
        const s = lr.lonshaSource(lr.LONSHA_BRIDGE_ID);
        if (!s || s.mounted !== true) return (s && s.reason) || 'not-mounted';
        return s.reason || 'unknown';
      } catch (e) { return 'thrown'; }
    })();
    // ★ v2.101.0（O11）修正：`present` 原为**写死 false**（RubyPhone 那一行永远说「未接入」）。
    //   改为看**入站桥现场**：桥在且相位不是 disabled ⇒ 这条边是通的。
    //   缺席与「已关闭」分开：disabled 由用户在面板关的，不是对方不在。
    const phone = (function () {
      const pb = WA.phoneBridge;
      if (!pb || typeof pb.phaseOf !== 'function') return { present: false, state: 'absent', note: '入站桥未加载；缺席不降级事实结算面' };
      try {
        const ph = pb.phaseOf();
        const phase = String((ph && ph.phase) || 'unknown');
        if (phase === 'disabled') return { present: false, state: 'disabled', note: '入站桥已关闭（用户关闭 ≠ 对方不在）：手机侧操作不会进世界台账' };
        return { present: true, state: phase, note: (ph && ph.note) || '' };
      } catch (e) { return { present: false, state: 'thrown', note: '入站桥探针抛错' }; }
    })();
    return {
      roles: [
        { owner: 'WorldAxis', duty: '事实结算', owns: ['causal', 'world', 'evolution', 'intel'], present: true },
        { owner: 'LonSha', duty: '证据读取', owns: ['lonshaReader'], present: !!d && d.tavernHelper === true, state: lonState },
        { owner: 'RubyPhone', duty: '交互执行', owns: ['phoneBridge'], present: phone.present, state: phone.state, note: phone.note }
      ],
      host: d ? { sillyTavern: d.sillyTavern, tavernHelper: d.tavernHelper, variables: d.variables, worldbook: d.worldbook } : null,
      // 去重/隔离/来源版本的现状：如实报告，不宣称「已实现」
      dedupe: 'chatcache 按 chatId 隔离快照',
      chatIsolation: 'store 按 chatId 分键',
      sourceVersion: 'lonshaReader 契约版本只拦显式不匹配（缺失视为旧版放行）',
      absentPolicy: '缺席降级可见：engine-absent / engine-empty / thrown 三态分开'
    };
  }
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // v2.87.0：known()/compose() 是本文件内部自用口（preview/apply/activeModules 消费，
  //   外部零引用 = 过度导出），故不进导出面。题材能力对外由 list/preview/apply/
  //   activeModules/statView/separation 六个有真消费方的口表达。
  WA.theme = { THEMES, CORE, list: list, preview: preview,
    apply: apply, activeModules: activeModules, statView: statView, separation: separation };
  if (WA.log) WA.log('info', '题材规则组合已加载');
})();
