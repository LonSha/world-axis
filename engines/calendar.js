/** WorldAxis engines/calendar.js (v0.2) — 世界钟/日历推进（缝合 SevenDaysCal） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  WA.calendar = {
    /** 设定世界时间（自由标签或ISO） */
    setClock(label, opts) {
      opts = opts || {};
      WA.store.transact(d => {
        d.clock.label = label;
        d.clock.source = opts.source || 'user';
        d.clock.iso = opts.iso || d.clock.iso || '';
        if (opts.dayIndex != null) d.clock.dayIndex = opts.dayIndex;
      });
      WA.emit('clock:changed', label);
    },
    /** 推进一天 */
    advanceDay() {
      const s = WA.store.get();
      const next = (s.clock.dayIndex || 0) + 1;
      this.setClock('第' + next + '日', { source: 'engine', dayIndex: next });
    },
    /** 解析正文中的时间词并建议推进（骨架：只做常见模式） */
    suggestAdvance(text) {
      const t = String(text == null ? '' : text);
      if (/次日|第二天|翌日|天亮|隔日/.test(t)) return 'day';
      if (/黄昏|傍晚|入夜|夜幕/.test(t)) return 'evening';
      if (/黎明|清晨|破晓/.test(t)) return 'dawn';
      return null;
    },
    /** v2.1.0: 时段标签（suggestAdvance 的返回值 → 世界钟可读标签） */
    partLabel(part) {
      return ({ dawn: '清晨', evening: '入夜' })[part] || '黄昏';
    },
    /** v2.1.0: 时段推进（不跨日；dawn 视作已进入新的一天） */
    advancePart(part) {
      const s = WA.store.get();
      const day = (s.clock.dayIndex || 0) + (part === 'dawn' ? 1 : 0);
      this.setClock('第' + day + '日·' + this.partLabel(part), { source: 'text', dayIndex: day });
      return day;
    },
    /**
     * v2.1.0: 自动推进（此前 suggestAdvance 零消费 = 世界钟功能整体失效）
     *   - 仅当本轮正文确实出现时间词才推进（无时间词不动，避免噪声推进）
     *   - 同文本不重复推进（去重：重掷/重复通知不双计）
     *   - 可在面板关闭（worldaxis_calendar_settings_v1.auto）
     *   返回 {ok, kind, label, dayIndex, reason}
     */
    autoAdvance(text, opts) {
      const o = opts || {};
      const t = String(text == null ? '' : text);
      __calStat.runs++;
      __calStat.lastAt = Date.now();
      if (o.force !== true && loadSettings().auto === false) { __calStat.skipped++; return { ok: false, reason: 'disabled' }; }
      const kind = this.suggestAdvance(t);
      if (!kind) { __calStat.noSignal++; return { ok: false, reason: 'no-time-word' }; }
      const sig = kind + ':' + __hash(t);
      if (sig === __calStat.lastSig) { __calStat.deduped++; return { ok: false, reason: 'dedup', kind: kind }; }
      __calStat.lastSig = sig;
      let label;
      if (kind === 'day') {
        // 跳日：保留原时段信息（『第1日·黄昏』→『第2日·黄昏』），source 记为 text
        const cur = WA.store.get();
        const prev = String((cur.clock && cur.clock.label) || '');
        const part = prev.indexOf('·') >= 0 ? prev.split('·')[1] : '';
        const day = (cur.clock.dayIndex || 0) + 1;
        this.setClock('第' + day + '日' + (part ? '·' + part : ''), { source: 'text', dayIndex: day });
        label = WA.store.read('clock.label', '');
      } else { this.advancePart(kind); label = WA.store.read('clock.label', ''); }
      __calStat.advanced++;
      __calStat.lastKind = kind;
      __calStat.lastLabel = label;
      WA.log('info', '世界钟自动推进（正文时间词：' + kind + '）→ ' + label);
      return { ok: true, kind: kind, label: label, dayIndex: WA.store.read('clock.dayIndex', 0) };
    },
    /** v2.1.0: 自动推进观测（此前零消费，接入后必须能回答「到底推没推」） */
    stat() {
      return { runs: __calStat.runs, advanced: __calStat.advanced, deduped: __calStat.deduped,
        noSignal: __calStat.noSignal, skipped: __calStat.skipped,
        lastKind: __calStat.lastKind, lastLabel: __calStat.lastLabel, lastAt: __calStat.lastAt,
        auto: loadSettings().auto !== false };
    },
    getSettings: loadSettings,
    setSettings(obj) {
      const s = Object.assign(loadSettings(), obj || {});
      // v2.6.0: 此前返回的是「将要保存的值」（恒为真值），调用方无法据此判断写没写进去。
      //   改为返回写入结果（{ok, reason}）——与 backstage/opinion/horizon/evolution 口径一致。
      return saveSettings(s);
    }
  };
  // v2.1.0: 自动推进观测对象
  const __calStat = { runs: 0, advanced: 0, deduped: 0, noSignal: 0, skipped: 0, lastKind: null, lastLabel: '', lastAt: 0, lastSig: '' };
  function __hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h.toString(36);
  }
  // v2.1.0: 设置（auto 默认开——世界钟自动推进是「世界模拟引擎」的应有行为）
  const __REG = { key: 'worldaxis_calendar_settings_v1', def: { auto: true }, module: 'calendar' };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);
  // v2.6.0: 内联的第二份默认值已删除。`read()` 自 v2.3.0 起已按键回落 `__REG.def`，
  //   此处再 `Object.assign({ auto: true }, ...)` 是同一条默认值的**第二份声明**——
  //   与 v2.4.0 修的「模块内联默认值」同型：def 一旦改动，这里不会跟着变，且
  //   read 的返回不再严格等于登记声明（v2.3.0 的「单源不变量」断言对 calendar 会失效）。
  function loadSettings() {
    try { if (WA.settingsBus) return WA.settingsBus.read(__REG); } catch (e) {}
    return { auto: true };   // 仅 settingsBus 尚未装载（加载早期）时的降级，非第二份真源
  }
  function saveSettings(v) {
    // v2.6.0: 写入侧审计修正——本模块此前是**唯一**给 settingsBus.save 包 try/catch 的调用方，
    //   却也把写失败吞成了静默成功（面板无论如何都报「✓ 已保存」）。改为回传结果，
    //   供调用方（面板）据此回显「未落盘」——写失败不得再被当成成功。
    try { if (WA.settingsBus) return WA.settingsBus.saveOrThrow(__REG, v); } catch (e) { return { ok: false, reason: String((e && e.message) || e) }; }
    return { ok: false, reason: 'settingsBus 未装载' };
  }
  // v2.1.0: after 链节点——order 12，先于演化/记忆（时间推进影响后续所有引擎的「今天」）
  if (WA.workflow && WA.workflow.register) {
    WA.workflow.register({
      id: 'calendar.autoAdvance', chain: 'after', order: 12, label: '世界钟·正文时间词推进',
      async run(ctx) {
        const chat = (ctx && ctx.chat) || [];
        const last = chat.length ? chat[chat.length - 1] : null;
        const text = (last && !last.is_user && last.mes) || '';
        if (text) WA.calendar.autoAdvance(text);
      }
    });
  }
})();