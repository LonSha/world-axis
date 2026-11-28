/** WorldAxis engines/calendar.js (v0.2) — 世界钟/日历推进（缝合 SevenDaysCal） */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  // v2.15.0: 时间源单一出口。决策时间（进存档/参与判定）走 clockNow；测量时间（耗时/内存台账）走 clockWall。
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  // Leave floating story time floating. Never let Date.parse choose the device zone.
  function instant(iso) {
    const m = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d)(:\d\d(?:\.\d{1,3})?)?(Z|[+-]\d\d:\d\d)?$/.exec(iso || '');
    if (!m) return null;
    const wall = Date.parse(m[1]+'T'+m[2]+(m[3]||':00')+'Z');
    const ms = Date.parse(iso + (m[4] ? '' : 'Z'));
    if (!Number.isFinite(ms) || !Number.isFinite(wall) || new Date(wall).toISOString().slice(0,16)!==iso.slice(0,16)) return null;
    return {ms, offset:wall-ms, suffix:m[4]||''};
  }
  function shifted(iso, minutes) {
    if (minutes%1440===0 && /^\d{4}-\d{2}-\d{2}$/.test(iso||'')) {
      const civil=instant(iso+'T00:00Z'); if (civil) return new Date(civil.ms+minutes*60000).toISOString().slice(0,10);
    }
    const t = instant(iso); if (!t) return '';
    return new Date(t.ms+t.offset+minutes*60000).toISOString().replace(/\.000Z$|Z$/,'')+t.suffix;
  }
  function localTime(iso, zone) {
    const t=instant(iso); if (!t) return null;
    if (!zone) return iso.slice(0,16);
    if (!t.suffix) return null;
    try {
      const fmt=new Intl.DateTimeFormat('en-GB',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
      const p=Object.fromEntries(fmt.formatToParts(t.ms).map(v=>[v.type,v.value]));
      return p.year+'-'+p.month+'-'+p.day+'T'+p.hour+':'+p.minute;
    } catch (_) { return null; }
  }
  // All text-derived clock writes use the same factual sentences, including day/part labels.
  function narratedFacts(text) {
    const body = String(text ?? '').replace(/<!--[\s\S]*?(?:-->|$)|「[^」]*(?:」|$)|『[^』]*(?:』|$)|“[^”]*(?:”|$)|‘[^’]*(?:’|$)|"[^"]*(?:"|$)/g, ' ');
    return body.replace(/[^。！？!?；;\n]*[?？]/g, '').split(/[。！!；;\n]/).map(s => s.trim()).filter(s => s &&
      !/如果|假如|假设|只要|要是|预计|预定|约定|计划|打算|准备|可能|应该|将会|将于|还要|还需|本来|原定|昨天|昨日|上次|回忆|想起|曾经|刚才|方才|平时|通常|往往|每天|提前|延后|推迟|尚未|没有|还没|是否|据说|听说|提醒|等到|问[：:]|[「『“”」』"]/.test(s));
  }
  function completesHere(s, event, world) {
    if (/(?:不|没|未|险些|差点|盼|要|想|等到|之后|之前|听|问|说)/.test(s)) return false;
    if (['结束了','结束','按时结束','正式结束','顺利结束'].some(end => s === event.title + end)) return true;
    if (!s.endsWith(event.title)) return false;
    const prefix = s.slice(0, -event.title.length);
    // A simple named subject can be checked against its journey. Do not treat a whole clause as a name.
    const m = /^([^，,：:在]{1,30}?)(?:在([^，,：:]+))?(上完了|完成了|做完了)$/.exec(prefix);
    if (!m || (m[2] && m[2] !== event.place)) return false;
    const position = world.where(m[1] === '我' ? '你' : m[1]);
    return position.reason === 'no-journey' || position.place === event.place;
  }
  function repeatsWalk(sentence, minutes, st) {
    if (st.clock?.source !== 'travel') return false;
    const trip = (st.world?.journeys || []).slice().reverse().find(j => j.person === '你');
    if (trip?.status !== 'arrived' || trip.total !== minutes) return false;
    return ['', '我', '你'].some(who => ['到','走到','步行到'].some(v => ['花了','用了'].some(cost =>
      sentence.startsWith(who + '从' + trip.from + v + trip.to + cost))));
  }
  function elapsedAction(facts, st) {
    const E = WA.elapsedEvidence;
    if (!E || !E.settings().enabled) return 0;
    const clock = instant(st.clock?.iso), world = WA.world;
    if (clock?.suffix && world?.getSettings().enabled) {
      const pos = world.where('你');
      const here = pos.arrived ? pos.place : pos.reason === 'no-journey' && st.region?.currentPlace;
      const due = here ? world.eventsBetween(clock.ms, clock.ms + 1).filter(e => e.place === here && e.status !== 'done' && e.start <= clock.ms && facts.some(s => completesHere(s, e, world))) : [];
      if (due.length === 1) {
        const remaining = (due[0].end - clock.ms) / 60000;
        if (Number.isInteger(remaining) && remaining > 0 && remaining <= E.settings().maxMinutes) return {minutes:remaining, eventId:due[0].id};
      }
    }
    const spans = [];
    for (const fact of facts) {
      // Only an explicit self-correction replaces a disputed duration; unrelated spans stay ambiguous.
      const corrected = /^.+[，,]不对[，,]实际(只?(?:用了|花了).+)$/.exec(fact);
      const s = corrected ? corrected[1] : fact;
      if (/不到|差点|差一点|还剩|往往|通常|每天|以往|之前|曾|说|问|告诉|写着|意味着|[?？]/.test(s)) continue;
      const p = E.parse(s);
      if (!p.ok || !p.minutes || p.minutes > E.settings().maxMinutes || repeatsWalk(s, p.minutes, st)) continue;
      const a = s.indexOf(p.anchor), before = s.slice(0,a), after = s.slice(a+p.anchor.length);
      if ((!before && /^(?:之?后)(?:[，,、]|$)/.test(after)) ||
          (/(?:持续了|过去了|经过了|练了|学了|等了|工作了|训练了|休息了|睡了|花了|用了)$/.test(before) && !/^(?:前|内|之|以|的|后才会)/.test(after))) spans.push(p.minutes);
    }
    // Several durations can overlap or describe the same action. Do not silently sum them.
    return spans.length === 1 ? {minutes:spans[0]} : null;
  }
  function suggestPart(facts) {
    if (facts.some(s => /次日|第二天|翌日|天亮|隔日/.test(s))) return 'day';
    if (facts.some(s => /黄昏|傍晚|入夜|夜幕/.test(s))) return 'evening';
    if (facts.some(s => /黎明|清晨|破晓/.test(s))) return 'dawn';
    return null;
  }
  function writeClock(label, opts, finishedEvent) {
    opts = opts || {};
    WA.store.transact(d => {
      d.clock.label = label;
      delete d.clock.relative;
      d.clock.source = opts.source || 'user';
      d.clock.iso = opts.iso || (instant(label) || (/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(label) && instant(label+'T00:00Z')) ? label : '') || d.clock.iso || '';
      if (finishedEvent) {
        const row = d.world?.events?.find(e => e.id === finishedEvent);
        if (row && row.end === instant(opts.iso)?.ms) row.status = 'done';
      }
      if (opts.dayIndex != null) d.clock.dayIndex = opts.dayIndex;
    });
    WA.emit('clock:changed', label);
  }
  WA.calendar = {
    localTime,
    applyTravel(clock, minutes) {
      if (!clock || !(minutes>0) || !instant(clock.iso)) return;
      const next=shifted(clock.iso,minutes); if (!next) return;
      const days=(Date.parse(next.slice(0,10))-Date.parse(clock.iso.slice(0,10)))/86400000;
      clock.iso=next; clock.dayIndex=(clock.dayIndex||0)+days;
      clock.label=next.slice(0,16).replace('T',' '); clock.source='travel';
    },
    /** 设定世界时间（自由标签或ISO） */
    setClock(label, opts) { writeClock(label, opts); },
    /**
     * 推进一天（整日推进入口）。
     *
     * v2.11.0: 本函数此前**全库零调用**——而 `autoAdvance` 的 `kind==='day'` 分支里
     *   另写了一份「跳日」逻辑（保留原时段 `第1日·黄昏` → `第2日·黄昏`），两份实现必然漂移：
     *   面板「下一日」按钮（本版上线）走这里、正文时间词走 autoAdvance，同样的语义会写出
     *   两种标签（一个丢时段、一个留时段）。现收敛为**单一实现**：autoAdvance 的 day 分支
     *   改为调用本函数（带 keepPart），标签口径由本函数一处决定。
     * @param {{keepPart?:boolean, source?:string}} [opts] keepPart=true 保留原时段后缀
     * @returns {number} 推进后的 dayIndex（-1 表示世界钟缺失，未推进）
     */
    advanceDay(opts) {
      const o = opts || {};
      const st = WA.store.get();
      const clock = (st && st.clock) || null;
      if (!clock) return -1;                      // 世界钟结构缺失：明确返回哨兵，不静默推一天
      const prev = String(clock.label || '');
      const part = (o.keepPart && prev.indexOf('·') >= 0) ? prev.split('·')[1] : '';
      const day = (clock.dayIndex || 0) + 1;
      this.setClock('第' + day + '日' + (part ? '·' + part : ''), { source: o.source || 'engine', dayIndex: day, iso:shifted(clock.iso,1440) });
      // v2.11.0: 计量放在**单一实现**里（autoAdvance 的 day 分支不再自己 ++，否则同一件事计两次）
      try { __calStat.dayAdvances++; } catch (e) { /* 计量失败不影响推进 */ }
      return day;
    },
    /** 解析正文中的时间词并建议推进（骨架：只做常见模式） */
    suggestAdvance(text) { return suggestPart(narratedFacts(text)); },
    /** v2.1.0: 时段标签（suggestAdvance 的返回值 → 世界钟可读标签） */
    partLabel(part) {
      return ({ dawn: '清晨', evening: '入夜' })[part] || '黄昏';
    },
    /** v2.1.0: 时段推进（不跨日；dawn 视作已进入新的一天） */
    advancePart(part) {
      const s = WA.store.get();
      const day = (s.clock.dayIndex || 0) + (part === 'dawn' ? 1 : 0);
      this.setClock('第' + day + '日·' + this.partLabel(part), { source: 'text', dayIndex: day, iso:part==='dawn' ? shifted(s.clock.iso,1440) : s.clock.iso });
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
      __calStat.lastAt = clockWall();
      if (o.force !== true && loadSettings().auto === false) { __calStat.skipped++; return { ok: false, reason: 'disabled' }; }
      const st = WA.store.get();
      const facts = narratedFacts(t);
      const action = st.clock && (!st.clock.iso || instant(st.clock.iso)) && elapsedAction(facts, st);
      const minutes = action?.minutes || 0;
      const kind = minutes ? 'elapsed' : suggestPart(facts);
      if (!kind) { __calStat.noSignal++; return { ok: false, reason: 'no-time-word' }; }
      // Equivalent elapsed evidence on the same floor is one settlement, even with different prose.
      const evidence = o.floor != null && minutes ? 'm' + minutes + ':' + (action.eventId || '') : __hash(t);
      const sig = (WA.store.chatId?.() || '') + ':' + (o.floor ?? '') + ':' + evidence;
      if (sig === __calStat.lastSig) { __calStat.deduped++; return { ok: false, reason: 'dedup', kind: kind }; }
      __calStat.lastSig = sig;
      let label;
      if (kind === 'elapsed' && !st.clock.iso) {
        // No civil start time: keep a relative span, never invent midnight or a date.
        WA.store.transact(d => {
          const r = d.clock.relative || {base:d.clock.label || '场景起点', minutes:0};
          r.minutes += minutes;
          const h = Math.floor(r.minutes / 60), m = r.minutes % 60;
          label = r.base + '之后 ' + (h ? h + '小时' : '') + (m ? m + '分钟' : '');
          d.clock.relative = r; d.clock.label = label; d.clock.source = 'text';
        });
        WA.emit('clock:changed', label);
      } else if (kind === 'elapsed') {
        const next = shifted(st.clock.iso, minutes);
        const days = (Date.parse(next.slice(0,10)) - Date.parse(st.clock.iso.slice(0,10))) / 86400000;
        label = next.slice(0,16).replace('T',' ');
        writeClock(label, {iso:next, dayIndex:(st.clock.dayIndex || 0) + days, source:'text'}, action.eventId);
      } else if (kind === 'day') {
        // 跳日：保留原时段信息（『第1日·黄昏』→『第2日·黄昏』）——**收敛到 advanceDay 单一实现**
        this.advanceDay({ keepPart: true, source: 'text' });
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
        // v2.11.0: `dayAdvances` 单独计量——整日推进（面板按钮 / 正文时间词）与时段推进
        //   后果不同（跨日会推进所有按日结算的子系统），此前两者混在一个 advanced 里。
        dayAdvances: __calStat.dayAdvances || 0,
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
  const __calStat = { runs: 0, advanced: 0, deduped: 0, noSignal: 0, skipped: 0, lastKind: null, lastLabel: '', lastAt: 0, lastSig: '',
    dayAdvances: 0 };
  WA.on?.('floor:clock-restored', () => { __calStat.lastSig = ''; });
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
        if (text && !last.is_system) WA.calendar.autoAdvance(text, {floor:chat.length});
      }
    });
  }
})();
