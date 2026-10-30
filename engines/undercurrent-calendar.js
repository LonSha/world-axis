/**
 * WorldAxis engines/undercurrent-calendar.js (v2.268.0) — 暗流日历：未结算的事几时撞上 (EXV6-4)
 *
 * ── 它治什么（缺口）──────────────────────────────────────────
 *   世界在后台推演暗流（backstage.currents），每条暗流都有 stage（潜伏/发展/激化/高潮等）。
 *   但玩家与面板只能看到分散的暗流列表或几句零散回声：
 *     · 读者根本不知道「这几件事哪一件先爆、哪一件还早」；
 *     · 更不知道「我还有几轮窗口可以去阻止或介入」。
 *   暗流日历把未结算暗流按其真实 stage、紧迫度与剧情时间，
 *   投影为「未来三天风险日历」，直观给出距离撞上的剩余轮次与行动窗口。
 *
 * ── 铁律（零写盘、真实依据、认知边界）──────────────────────────
 *   1 纯读聚合：零 store.transact、零 settingsBus 写、零 localStorage。
 *   2 单一真源：暗流取自 store.get().currents，时间基准取自 storyclock / store.get().clock。
 *   3 认知防护：hidden 级别暗流遵循 showHidden 设置，默认不剧透具体内情，防全知作弊。
 *   4 拒绝虚构：紧迫度和剩余窗口严格由 stage 映射，绝不臆造未发生的事实。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const LS_KEY = 'worldaxis_undercurrent_calendar_settings_v1';
  const DEF = {
    enabled: true,
    horizonDays: 3,     // 视界跨度（天）：1～7，默认未来 3 天
    maxItems: 4,        // 概览最大展示条数：1～15
    showHidden: false,  // 是否透视隐藏级暗流（默认 false，维护认知边界）
    showUrgency: true   // 是否标明紧迫度等级与行动窗口
  };
  const BOUNDS = {
    horizonDays: [1, 7],
    maxItems: [1, 15]
  };

  const __REG = {
    key: LS_KEY,
    def: DEF,
    module: 'undercurrentCalendar',
    bounds: BOUNDS
  };

  function getSettings() {
    const raw = WA.settingsBus ? WA.settingsBus.read(__REG) : DEF;
    return WA.settingsBus ? WA.settingsBus.normalize(__REG, Object.assign({}, DEF, raw || {})) : Object.assign({}, DEF, raw || {});
  }

  function setSettings(patch) {
    if (!WA.settingsBus || typeof WA.settingsBus.saveOrThrow !== 'function') {
      return Object.assign(DEF, patch || {});
    }
    const cur = getSettings();
    const next = Object.assign({}, cur, patch || {});
    return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize(__REG, next));
  }

  if (Array.isArray(WA.__settingsRegs)) {
    WA.__settingsRegs.push(__REG);
  }

  const stat = {
    builds: 0,
    emptyBuilds: 0,
    itemsProjected: 0,
    hiddenShielded: 0
  };

  // 阶段 ⇄ 预计撞上窗口（天数偏差、轮数估计、紧迫度等级）
  const STAGE_WINDOWS = {
    // 临界/爆发：0天（今日）
    '高潮': { etaDays: 0, turns: '0-1轮', urgency: 'critical', name: '临界爆发', windowText: '紧急·正面碰撞' },
    '爆发': { etaDays: 0, turns: '0-1轮', urgency: 'critical', name: '临界爆发', windowText: '紧急·正面碰撞' },
    '临界': { etaDays: 0, turns: '0-1轮', urgency: 'critical', name: '临界爆发', windowText: '紧急·正面碰撞' },
    'climax': { etaDays: 0, turns: '0-1轮', urgency: 'critical', name: '临界爆发', windowText: '紧急·正面碰撞' },
    'peak': { etaDays: 0, turns: '0-1轮', urgency: 'critical', name: '临界爆发', windowText: '紧急·正面碰撞' },

    // 激化/逼近：1天（明日）
    '激化': { etaDays: 1, turns: '1-2轮', urgency: 'high', name: '即将撞上', windowText: '紧迫·明日交锋' },
    '逼近': { etaDays: 1, turns: '1-2轮', urgency: 'high', name: '即将撞上', windowText: '紧迫·明日交锋' },
    '失控': { etaDays: 1, turns: '1-2轮', urgency: 'high', name: '即将撞上', windowText: '紧迫·明日交锋' },
    'escalating': { etaDays: 1, turns: '1-2轮', urgency: 'high', name: '即将撞上', windowText: '紧迫·明日交锋' },
    'urgent': { etaDays: 1, turns: '1-2轮', urgency: 'high', name: '即将撞上', windowText: '紧迫·明日交锋' },

    // 发展/蔓延：2天（后日）
    '发展': { etaDays: 2, turns: '2-4轮', urgency: 'medium', name: '暗中推进', windowText: '观察·尚有窗口' },
    '蔓延': { etaDays: 2, turns: '2-4轮', urgency: 'medium', name: '暗中推进', windowText: '观察·尚有窗口' },
    '推进': { etaDays: 2, turns: '2-4轮', urgency: 'medium', name: '暗中推进', windowText: '观察·尚有窗口' },
    'developing': { etaDays: 2, turns: '2-4轮', urgency: 'medium', name: '暗中推进', windowText: '观察·尚有窗口' },
    'spreading': { etaDays: 2, turns: '2-4轮', urgency: 'medium', name: '暗中推进', windowText: '观察·尚有窗口' },

    // 潜伏/萌芽：3天（第3天或之后）
    '萌芽': { etaDays: 3, turns: '3-6轮', urgency: 'low', name: '潜伏酝酿', windowText: '从容·余量充裕' },
    '潜伏': { etaDays: 3, turns: '3-6轮', urgency: 'low', name: '潜伏酝酿', windowText: '从容·余量充裕' },
    '酝酿': { etaDays: 3, turns: '3-6轮', urgency: 'low', name: '潜伏酝酿', windowText: '从容·余量充裕' },
    'seed': { etaDays: 3, turns: '3-6轮', urgency: 'low', name: '潜伏酝酿', windowText: '从容·余量充裕' },
    'emerging': { etaDays: 3, turns: '3-6轮', urgency: 'low', name: '潜伏酝酿', windowText: '从容·余量充裕' },

    // 收尾/平息
    '收尾': { etaDays: 1, turns: '1轮', urgency: 'low', name: '余波整理', windowText: '收尾·接近平息' },
    '退潮': { etaDays: 1, turns: '1轮', urgency: 'low', name: '余波整理', windowText: '收尾·接近平息' },
    'subsiding': { etaDays: 1, turns: '1轮', urgency: 'low', name: '余波整理', windowText: '收尾·接近平息' }
  };

  const CLOSED_STAGES = new Set(['已结束', 'closed', '已结案', '终局', 'recycled', 'dropped']);

  /** 确定性短 id：同一条暗流（同一标题）永远得到同一个 id。
   *  为什么不用 Math.random：本模块承诺「纯读、可复算」——随机 id 会让同一份存档
   *  两次读数逐字不同，直接违反该承诺（全量回归的裸调扫描也把它判红）。
   */
  function stableId(title) {
    const t = String(title == null ? '' : title);
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 1000003;
    return 'cu_' + ('00000' + h.toString(36)).slice(-5);
  }

  function mapWindow(stage) {
    const raw = String(stage || '').trim().toLowerCase();
    for (const k of Object.keys(STAGE_WINDOWS)) {
      if (k.toLowerCase() === raw) {
        return STAGE_WINDOWS[k];
      }
    }
    // 包含式兜底
    if (raw.indexOf('激') >= 0 || raw.indexOf('急') >= 0) {
      return STAGE_WINDOWS['激化'];
    }
    if (raw.indexOf('高') >= 0 || raw.indexOf('爆') >= 0) {
      return STAGE_WINDOWS['高潮'];
    }
    if (raw.indexOf('展') >= 0 || raw.indexOf('推') >= 0) {
      return STAGE_WINDOWS['发展'];
    }
    if (raw.indexOf('萌') >= 0 || raw.indexOf('潜') >= 0 || raw.indexOf('酝') >= 0) {
      return STAGE_WINDOWS['萌芽'];
    }
    return { etaDays: 2, turns: '2-3轮', urgency: 'medium', name: '持续推演', windowText: '态势未定' };
  }

  const URGENCY_WEIGHT = {
    'critical': 4,
    'high': 3,
    'medium': 2,
    'low': 1
  };

  /** 获取当前基准故事日编号（从 1 起始）与可读标签 */
  function getBaseStoryDay(opts) {
    const o = opts || {};
    // 1. 若外部显式指定 messages，尝试 storyclock 读取
    if (Array.isArray(o.messages) && WA.storyclock && typeof WA.storyclock.readLatest === 'function') {
      try {
        const sc = WA.storyclock.readLatest(o.messages);
        if (sc && sc.ok && sc.label) {
          const m = sc.label.match(/第\s*(\d+)\s*日/);
          if (m) {
            return { day: parseInt(m[1], 10), label: sc.label, source: 'storyclock' };
          }
          return { day: 1, label: sc.label, source: 'storyclock-label' };
        }
      } catch (e) {}
    }
    // 2. 从 store.get().clock 读取
    try {
      const s = (WA.store && typeof WA.store.get === 'function') ? WA.store.get() : null;
      if (s && s.clock) {
        if (typeof s.clock.dayIndex === 'number' && s.clock.dayIndex >= 0) {
          const d = Math.floor(s.clock.dayIndex) + 1;
          return { day: d, label: s.clock.label || ('第' + d + '日'), source: 'clock-dayIndex' };
        }
        if (s.clock.label) {
          const m = String(s.clock.label).match(/第\s*(\d+)\s*日/);
          if (m) {
            return { day: parseInt(m[1], 10), label: s.clock.label, source: 'clock-label' };
          }
          return { day: 1, label: s.clock.label, source: 'clock-label-raw' };
        }
      }
    } catch (e) {}
    // 3. 兜底
    return { day: 1, label: '第1日', source: 'default' };
  }

  /**
   * 构建未来三天暗流日历（纯读聚合）
   * @param {Object} [opts] - 可选覆盖参数
   */
  function build(opts) {
    stat.builds++;
    const cfg = Object.assign({}, getSettings(), opts || {});
    if (!cfg.enabled) {
      return { ok: false, enabled: false, reason: 'disabled', items: [], days: [], baseDay: null, line: '暗流日历已停用。' };
    }

    const s = (WA.store && typeof WA.store.get === 'function') ? WA.store.get() : {};
    const currents = Array.isArray(s && s.currents) ? s.currents : [];

    const baseInfo = getBaseStoryDay(opts);
    const horizon = Math.max(1, Math.min(cfg.horizonDays || DEF.horizonDays, BOUNDS.horizonDays[1]));
    const maxItems = Math.max(1, Math.min(cfg.maxItems || DEF.maxItems, BOUNDS.maxItems[1]));

    // 过滤未结算暗流
    const active = currents.filter(function (c) {
      if (!c || !c.title) return false;
      const st = String(c.stage || '').trim();
      return !CLOSED_STAGES.has(st);
    });

    if (active.length === 0) {
      stat.emptyBuilds++;
      return {
        ok: true,
        enabled: true,
        baseDay: baseInfo,
        horizonDays: horizon,
        totalActive: 0,
        items: [],
        days: [],
        shieldedHiddenCount: 0,
        overflowCount: 0,
        line: '未来三天未发现迫近的未结算暗流，局势相对平稳。'
      };
    }

    let shieldedHidden = 0;
    const projected = [];

    active.forEach(function (c) {
      const isHidden = (c.visibility === 'hidden');
      if (isHidden && !cfg.showHidden) {
        shieldedHidden++;
        stat.hiddenShielded++;
        // 认知防护模式下，若有线索则用 public_trace，否则脱敏为模糊异动
        const win = mapWindow(c.stage);
        projected.push({
          id: c.id || stableId(c.title),
          title: c.public_trace ? ('[异动] ' + c.public_trace) : '未明深层异动',
          rawTitle: c.title,
          summary: '该暗流在暗中潜行，玩家当前视角尚未掌握核心内情。',
          stage: c.stage || '潜伏',
          visibility: 'hidden',
          isShielded: true,
          etaDays: win.etaDays,
          turns: win.turns,
          urgency: win.urgency,
          urgencyName: win.name,
          windowText: win.windowText,
          targetDay: baseInfo.day + win.etaDays,
          targetDayLabel: '第' + (baseInfo.day + win.etaDays) + '日'
        });
      } else {
        const win = mapWindow(c.stage);
        const displayTitle = (c.visibility === 'trace' && c.public_trace) ? c.title + '（迹象: ' + c.public_trace + '）' : c.title;
        projected.push({
          id: c.id || stableId(c.title),
          title: displayTitle,
          rawTitle: c.title,
          summary: c.summary || '',
          stage: c.stage || '发展',
          visibility: c.visibility || 'public',
          isShielded: false,
          etaDays: win.etaDays,
          turns: win.turns,
          urgency: win.urgency,
          urgencyName: win.name,
          windowText: win.windowText,
          targetDay: baseInfo.day + win.etaDays,
          targetDayLabel: '第' + (baseInfo.day + win.etaDays) + '日'
        });
      }
    });

    // 紧迫度排序：critical > high > medium > low；同紧迫度按 etaDays 升序
    projected.sort(function (a, b) {
      const wa = URGENCY_WEIGHT[a.urgency] || 0;
      const wb = URGENCY_WEIGHT[b.urgency] || 0;
      if (wb !== wa) return wb - wa;
      return a.etaDays - b.etaDays;
    });

    stat.itemsProjected += projected.length;

    const visibleItems = projected.slice(0, maxItems);
    const overflowCount = Math.max(0, projected.length - maxItems);

    // 按天分组构建日历 slot
    const daysMap = {};
    for (let i = 0; i < horizon; i++) {
      const dNum = baseInfo.day + i;
      let dTag = (i === 0) ? '今日' : (i === 1 ? '明日' : (i === 2 ? '后日' : ('+' + i + '天')));
      daysMap[dNum] = {
        offsetDays: i,
        day: dNum,
        label: '第' + dNum + '日（' + dTag + '）',
        tag: dTag,
        items: []
      };
    }

    visibleItems.forEach(function (item) {
      if (daysMap[item.targetDay]) {
        daysMap[item.targetDay].items.push(item);
      } else if (item.targetDay > baseInfo.day + horizon - 1) {
        // 超出视界跨度的放入最后一天或专门的远期 slot
        const lastDayNum = baseInfo.day + horizon - 1;
        if (daysMap[lastDayNum]) {
          daysMap[lastDayNum].items.push(item);
        }
      }
    });

    const daysList = Object.keys(daysMap).map(function (k) { return daysMap[k]; });

    const __segs = [];
    visibleItems.forEach(function (it) {
      const dayTag = (it.etaDays === 0) ? '今日' : (it.etaDays === 1 ? '明日' : (it.etaDays === 2 ? '后日' : ('第' + it.targetDay + '日')));
      // v2.274.0：`showUrgency` 的真消费点。这一格此前只有声明、全仓零读点 ——
      //   玩家在设置里把它关掉，人话一行一个字都不会变（死键扫描当场把它点了名）。
      //   语义就是它注释写的那句：关掉 ⇒ 只说「哪天撞上什么」，不标紧迫度等级、
      //   不给行动窗口。信息少了，但「今晚会不会爆」这件事不再被提前嚼碎。
      __segs.push(cfg.showUrgency === false
        ? ('【' + dayTag + '】' + it.title)
        : ('【' + dayTag + '·' + it.urgencyName + '】' + it.title + '（窗口:' + it.turns + ' · ' + it.windowText + '）'));
    });
    let __line = '未来三天暗流日历（基准:' + baseInfo.label + '）：' + __segs.join('；');
    if (overflowCount > 0) __line += '；另有 ' + overflowCount + ' 条远期暗流推进中';
    if (shieldedHidden > 0) __line += '（含 ' + shieldedHidden + ' 条隐秘异动）';
    return {
      ok: true,
      enabled: true,
      baseDay: baseInfo,
      horizonDays: horizon,
      totalActive: active.length,
      items: visibleItems,
      days: daysList,
      shieldedHiddenCount: shieldedHidden,
      overflowCount: overflowCount,
      line: __line
    };
  }

  function reset() {
    stat.builds = 0;
    stat.emptyBuilds = 0;
    stat.itemsProjected = 0;
    stat.hiddenShielded = 0;
  }

  WA.undercurrentCalendar = {
    DEF: DEF,
    BOUNDS: BOUNDS,
    STAGE_WINDOWS: STAGE_WINDOWS,
    getSettings: getSettings,
    setSettings: setSettings,
    build: build,
    reset: reset,
    stat: function () { return Object.assign({}, stat); }
  };

  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/undercurrent-calendar.js', { kind: 'engine', ver: '2.268.0' });
  }
})();
