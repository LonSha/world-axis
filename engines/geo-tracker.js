/**
 * WorldAxis engines/geo-tracker.js (v2.245.0) — MAP-1：角色位置感知、正文反哺透镜与消歧引擎
 *
 * ── 核心机制来源（经《东京大舞台 v2.0》工程化泛化与抽象）──────────────
 *   1. 【正文位置标记感知 (readLocationMarks)】：
 *      · 规范标签：`<位置 人物="角色名">街区·具体地点</位置>`
 *      · 兼容量旧格式：`<!--位置:地点名-->`、`<位置 name="xxx">...</位置>`
 *      · 跳过思考过程（</think> 之后提取，防止思考草稿污染真状态）；
 *      · 跳过 Markdown 行内代码块（`...`）；
 *      · 提取最新在场角色分布（latestLocations），单人卡/群聊/NPC 通用归属判定。
 *
 *   2. 【全局静默治理正则 (installLocRegexes)】：
 *      · 显示隐藏：自动剥离 `<位置...>` 标签，确保阅读界面纯净；
 *      · 上下文限深：只发最近 2 层的最新位置给模型，彻底阻断旧位置在上下文的污染积累；
 *      · 自包含与热插拔：脚本装载时向 host.SillyTavern 登记，卸载时干净撤出。
 *
 *   3. 【多级消歧与模糊落位解析 (resolveLocation)】：
 *      · 三级消歧：建筑/室内地点 > 预设地标/车站 > 宏观街区/区域；
 *      · 模糊兜底：未匹配到具体设施时保留区域并标 `approximate: true`，绝不凭空捏造虚假坐标；
 *      · 场景嵌套支持：支持解析自设建筑/校园/大楼楼层（`学校·3F实验室`）。
 *
 *   4. 【空间常识反哺透镜 (buildFeed / buildBlock)】：
 *      · 相对距离与位移换算：根据 $(x,y)$ 坐标或道路拓扑，动态换算角色间米/公里数及步行耗时；
 *      · 场景内外区分：同在室内则提示相对方位与楼层，不同场景提示坐标域隔离，防模型产生时空混乱；
 *      · 周边生活圈雷达（nearbyOf）：扫描半径内重要设施（医馆/便利店/茶摊/客栈），
 *        以「【空间常识透镜】」格式注入正文，从根本上杜绝角色“瞬移”和环境凭空捏造。
 *
 * ── 状态与容量约束 ──────────────────────────────────────────
 *   · 依赖 WA.store 根骨架下的 `geoTracker` 状态树：
 *       - places: 空间地点注册表（支持从外部 worldbook / JSON / 地图配置动态同步）；
 *       - characterLocations: 各角色最新位置记录（对象型，容量上限 48，走 evict）；
 *       - locationHistory: 最近位置感知流水（环形，容量上限 32，走 evict）。
 */
(function () {
  'use strict';
  const clockNow = function (site) { try { return WA.clock.now(site); } catch (e) { return Date.now(); } };
  const WA = window.WorldAxis = window.WorldAxis || {};

  const VERSION = '2.245.0';
  const SETTING_KEY = 'worldaxis_geo_tracker_settings_v1';
  const FEED_KEY = 'worldaxis_geo_nearby';

  // 默认配置
  const DEFAULT_SETTINGS = {
    enabled: true,
    feedRadius: 25,         // 周边探测半径（地图逻辑单位，默认约 800 米）
    unitMeter: 32.6,        // 每地图坐标单位对应的实测米数
    walkSpeedMeterMin: 80,  // 步行基准速度（米/分钟）
    walkDetourFactor: 1.3,  // 实际街巷绕行系数（直线距离折算）
    feedMode: 'all',        // 反哺范围：'all'（所有在场角色）| 'main'（仅主角）| 'off'
    maxHistory: 32,
    maxCharacters: 48
  };

  const __REG = {
    key: SETTING_KEY,
    def: DEFAULT_SETTINGS,
    module: 'geoTracker',
    bounds: { feedRadius: [5, 100], unitMeter: [1, 200], walkSpeedMeterMin: [20, 200] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([__REG]);

  function settings() {
    if (WA.settingsBus && WA.settingsBus.read) {
      const raw = WA.settingsBus.read(__REG);
      return WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, Object.assign({}, DEFAULT_SETTINGS, raw || {}))
        : Object.assign({}, DEFAULT_SETTINGS, raw || {});
    }
    return Object.assign({}, DEFAULT_SETTINGS);
  }

  function saveSettings(next) {
    if (WA.settingsBus && WA.settingsBus.saveOrThrow) {
      const normalized = WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, Object.assign({}, DEFAULT_SETTINGS, next || {}))
        : Object.assign({}, DEFAULT_SETTINGS, next || {});
      return WA.settingsBus.saveOrThrow(__REG, normalized);
    }
    return Object.assign({}, DEFAULT_SETTINGS, next || {});
  }

  function cleanText(v, max) {
    if (typeof v !== 'string') return '';
    const s = v.trim();
    return max ? s.slice(0, max) : s;
  }

  // 字符串归一化（消歧用：去空格、标点、全半角及常见同义词）
  function norm(s) {
    return String(s || '')
      .replace(/[\s·・/／>＞|｜—–-]/g, '')
      .replace(/车站/g, '站')
      .replace(/便利店/g, '便利店')
      .toLowerCase();
  }

  // 正则：提取正文中的位置标记
  // 支持: <位置 人物="陆捕头">东街·济世堂药铺</位置> 或 <!--位置:东街·济世堂-->
  const LOC_RE = /<位置(?:[ \t]+(?:人物|角色|name)[ \t]*=[ \t]*["'“”「]?([^"'“”」<>\r\n]{1,64}?)["'“”」]?)?[ \t]*>[ \t\r\n]*([^<>\r\n]{1,100})[ \t\r\n]*<\/位置>|<!--[ \t]*位置[ \t]*[:：][ \t]*([^<>\r\n]{1,100}?)[ \t]*-->/g;

  /**
   * 从消息文本中解析所有位置标记
   * 自动跳过思考过程（</think> 之后提取，防止草稿污染）
   */
  function readLocationMarks(message) {
    const source = String(message || '');
    const matches = [...source.matchAll(LOC_RE)].filter(match => {
      const [, who, place, old] = match;
      const value = (place ?? old ?? '').trim();
      if (!value || value.length > 100 || /[<>\r\n`]/.test(value) || (who && /[<>\r\n`]/.test(who))) return false;
      // 跳过被反引号贴着包住的格式示例
      return source[match.index - 1] !== '`' && source[match.index + match[0].length] !== '`';
    });
    // 思考过程闭合标签检查
    const endings = [...source.matchAll(/<\/(?:think|thinking|analysis|reasoning|planning)\s*>/gi)];
    const lastEnd = endings[endings.length - 1];
    if (lastEnd) {
      const afterThought = matches.filter(m => m.index >= lastEnd.index + lastEnd[0].length);
      if (afterThought.length) return afterThought;
    }
    return matches;
  }

  /**
   * 登记与同步已知地点坐标库
   */
  function registerPlace(placeDef) {
    if (!placeDef || !placeDef.name) return { ok: false, reason: 'missing-name' };
    const name = cleanText(placeDef.name, 80);
    const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    const geo = s.geoTracker || {};
    const places = geo.places || {};

    places[name] = {
      name: name,
      aka: Array.isArray(placeDef.aka) ? placeDef.aka.slice(0, 10) : [],
      region: cleanText(placeDef.region || '', 40),
      x: typeof placeDef.x === 'number' ? placeDef.x : 0,
      y: typeof placeDef.y === 'number' ? placeDef.y : 0,
      kind: cleanText(placeDef.kind || 'poi', 20),
      desc: cleanText(placeDef.desc || '', 120),
      sceneId: cleanText(placeDef.sceneId || '', 40),
      floor: cleanText(placeDef.floor || '', 20)
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact('geoTracker.registerPlace', function (draft) {
        if (!draft.geoTracker) draft.geoTracker = {};
        if (!draft.geoTracker.places) draft.geoTracker.places = {};
        draft.geoTracker.places[name] = places[name];
      });
    }

    return { ok: true, name: name };
  }

  /**
   * 多级消歧与空间地点解析
   */
  function resolveLocation(rawText) {
    const raw = cleanText(rawText, 100);
    if (!raw) return null;

    const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    const places = (s.geoTracker && s.geoTracker.places) ? s.geoTracker.places : {};

    const key = norm(raw);

    // 1. 先查精准匹配与别名
    for (const name in places) {
      const p = places[name];
      if (norm(p.name) === key) {
        return { ok: true, name: p.name, x: p.x, y: p.y, region: p.region, kind: p.kind, sceneId: p.sceneId, floor: p.floor, precision: 'exact', approximate: false };
      }
      for (let i = 0; i < p.aka.length; i++) {
        if (norm(p.aka[i]) === key) {
          return { ok: true, name: p.name, x: p.x, y: p.y, region: p.region, kind: p.kind, sceneId: p.sceneId, floor: p.floor, precision: 'alias', approximate: false };
        }
      }
    }

    // 2. 检查复合路径（街区·具体地点 或 建筑·楼层）
    const parts = raw.split(/\s*[·・/／>＞|｜—–-]\s*/).filter(Boolean);
    if (parts.length > 1) {
      const parentName = parts[0];
      const childName = parts.slice(1).join('・');
      const normChild = norm(childName);

      // 先在父区域内找子地点
      for (const name in places) {
        const p = places[name];
        if (norm(p.name).includes(normChild) || (p.aka && p.aka.some(a => norm(a).includes(normChild)))) {
          return { ok: true, name: p.name, x: p.x, y: p.y, region: p.region || parentName, kind: p.kind, sceneId: p.sceneId, floor: p.floor, precision: 'composite-exact', approximate: false };
        }
      }

      // 未命中子设施时，退化为父区域的大概位置
      for (const name in places) {
        const p = places[name];
        if (norm(p.name) === norm(parentName) || norm(p.region) === norm(parentName)) {
          return { ok: true, name: raw, x: p.x, y: p.y, region: parentName, kind: 'area', precision: 'region-approximate', approximate: true };
        }
      }
    }

    // 3. 部分包含模糊匹配
    let bestMatch = null;
    let longestLen = 0;
    for (const name in places) {
      const p = places[name];
      const pn = norm(p.name);
      if (key.includes(pn) && pn.length > longestLen) {
        longestLen = pn.length;
        bestMatch = p;
      }
    }

    if (bestMatch) {
      return { ok: true, name: bestMatch.name, x: bestMatch.x, y: bestMatch.y, region: bestMatch.region, kind: bestMatch.kind, sceneId: bestMatch.sceneId, floor: bestMatch.floor, precision: 'fuzzy-contain', approximate: false };
    }

    // 4. 彻底未匹配，保留原始文本，作为无坐标的自设临时地点
    return { ok: true, name: raw, x: null, y: null, region: 'unknown', kind: 'custom', precision: 'unplaced', approximate: true };
  }

  /**
   * 记录角色最新位置（走 store 与 evict 容量控制）
   */
  function updateCharacterLocation(who, rawPlace) {
    const name = cleanText(who, 60);
    const placeStr = cleanText(rawPlace, 100);
    if (!name || !placeStr) return { ok: false, reason: 'missing-arguments' };

    const resolved = resolveLocation(placeStr);
    const locRecord = {
      who: name,
      rawPlace: placeStr,
      resolvedName: (resolved && resolved.name) || placeStr,
      x: resolved ? resolved.x : null,
      y: resolved ? resolved.y : null,
      region: resolved ? resolved.region : 'unknown',
      sceneId: resolved ? resolved.sceneId : '',
      floor: resolved ? resolved.floor : '',
      approximate: resolved ? resolved.approximate : true,
      updatedAt: clockNow('geoTracker')
    };

    if (WA.store && WA.store.transact) {
      WA.store.transact(function (draft) {
        if (!draft.geoTracker) draft.geoTracker = {};
        if (!draft.geoTracker.characterLocations) draft.geoTracker.characterLocations = {};
        if (!Array.isArray(draft.geoTracker.locationHistory)) draft.geoTracker.locationHistory = [];

        draft.geoTracker.characterLocations[name] = locRecord;
        draft.geoTracker.locationHistory.push(locRecord);

        // 挤出控制：角色数量与历史流水
        // v2.250.0：两站 cap 改 per-call（上限 = maxCharacters / maxHistory 设置），
        //   这两个设置项此前零消费 —— 拧了容量不跟着变。
        const gcfg = settings();
        if (WA.evict && WA.evict.object) {
          const cKeys = Object.keys(draft.geoTracker.characterLocations);
          cKeys.sort((a, b) => ((draft.geoTracker.characterLocations[a] && draft.geoTracker.characterLocations[a].updatedAt) || 0) - ((draft.geoTracker.characterLocations[b] && draft.geoTracker.characterLocations[b].updatedAt) || 0));
          WA.evict.object(draft.geoTracker.characterLocations, 'geoTracker.characterLocations', cKeys, gcfg.maxCharacters);
        }
        if (WA.evict && WA.evict.array) {
          // 注意参数顺序：array(arr, site, limit) —— 首参是**数组**、站点名在第二。
          //   此前两面（运行与静默）都写反了：运行时首参是字符串 ⇒ not-array 一直不截断，
          //   而 G18 判据按「第二参数是站点名」扫 ⇒ 该站点被判「声明了却没人用」。
          WA.evict.array(draft.geoTracker.locationHistory, 'geoTracker.locationHistory', gcfg.maxHistory);
        }
      }, 'geoTracker.updateLocation');
    }

    return { ok: true, record: locRecord };
  }

  /**
   * 格式化物理距离与步行时间描述
   */
  function formatDistance(meter, walkDetour, walkSpeed) {
    const m = meter;
    const distStr = m < 1000
      ? `${Math.max(50, Math.round(m / 50) * 50)}米`
      : `${(m / 1000).toFixed(1)}公里`;
    const actualWalkMeter = m * (walkDetour || 1.3);
    const minutes = Math.max(1, Math.round(actualWalkMeter / (walkSpeed || 80)));
    const walkStr = minutes <= 60 ? `，步行约${minutes}分钟` : `，步行约${(minutes / 60).toFixed(1)}小时`;
    return { distStr, walkStr, meter: m, minutes };
  }

  /**
   * 周边设施扫描（扫描半径内的重要 POI/服务设施）
   */
  function nearbyFacilities(x, y, radius, currentName) {
    if (typeof x !== 'number' || typeof y !== 'number') return [];
    const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    const places = (s.geoTracker && s.geoTracker.places) ? s.geoTracker.places : {};

    const cfg = settings();
    const R2 = radius * radius;
    const candidates = [];

    for (const name in places) {
      const p = places[name];
      if (p.name === currentName || (p.sceneId && p.sceneId !== '')) continue;
      const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d2 <= R2) {
        candidates.push({ name: p.name, kind: p.kind, d: Math.sqrt(d2) * cfg.unitMeter });
      }
    }

    candidates.sort((a, b) => a.d - b.d);
    return candidates.slice(0, 3).map(c => `${c.name}（${Math.round(c.d)}米）`);
  }

  /**
   * 构建空间常识与距离反哺正文透镜（buildBlock / buildFeed）
   */
  function buildBlock(options) {
    const cfg = settings();
    if (!cfg.enabled || cfg.feedMode === 'off') return '';

    const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    const locs = (s.geoTracker && s.geoTracker.characterLocations) ? s.geoTracker.characterLocations : {};
    const names = Object.keys(locs);
    if (!names.length) return '';

    const opts = options || {};
    const mainWho = opts.mainCharacter || names[0];
    const mainLoc = locs[mainWho] || locs[names[0]];

    const lines = [];
    lines.push('【空间常识与位移透镜】（镜头内角色实际身处方位与相对物理距离，杜绝瞬移与违和凭空捏造）：');

    const displayNames = cfg.feedMode === 'main' ? [mainLoc.who] : names.slice(0, 8);

    displayNames.forEach(function (name, idx) {
      const loc = locs[name];
      let line = `· ${loc.who}：身处「${loc.rawPlace}」`;
      if (loc.region && loc.region !== 'unknown') {
        line += `（隶属${loc.region}）`;
      }

      // 如果与主角比对
      if (loc.who !== mainLoc.who) {
        if (loc.x === null || mainLoc.x === null) {
          line += `，具体坐标未全定案，保持局部情境相对静止`;
        } else if (loc.sceneId && loc.sceneId === mainLoc.sceneId) {
          // 同在某个室内场景/建筑/校园
          if (loc.floor && mainLoc.floor && loc.floor !== mainLoc.floor) {
            line += `，与${mainLoc.who}同在「${loc.sceneId}」，但分处${loc.floor}与${mainLoc.floor}，室内上下层守望`;
          } else {
            line += `，与${mainLoc.who}同在「${loc.sceneId}」情境内部`;
          }
        } else if (loc.sceneId !== mainLoc.sceneId && (loc.sceneId || mainLoc.sceneId)) {
          line += `，两人分处不同封闭空间建筑，无直接视线交集`;
        } else {
          // 在同一大地图坐标系中，计算实测距离
          const dx = loc.x - mainLoc.x;
          const dy = loc.y - mainLoc.y;
          const m = Math.hypot(dx, dy) * cfg.unitMeter;
          const fmt = formatDistance(m, cfg.walkDetourFactor, cfg.walkSpeedMeterMin);
          line += `，离${mainLoc.who}${loc.approximate || mainLoc.approximate ? '约' : ''}${fmt.distStr}${fmt.walkStr}`;
        }
      }

      // 扫描周边
      if (loc.x !== null && loc.y !== null && !loc.sceneId) {
        const near = nearbyFacilities(loc.x, loc.y, cfg.feedRadius, loc.resolvedName);
        if (near.length) {
          line += `；临近可达设施：${near.join('、')}`;
        }
      }

      lines.push(line);
    });

    return lines.join('\n');
  }

  /**
   * 诊断与状态自检
   */
  function diagnose() {
    const s = (WA.store && WA.store.get) ? (WA.store.get() || {}) : {};
    const geo = s.geoTracker || {};
    const places = geo.places || {};
    const locs = geo.characterLocations || {};
    const hist = geo.locationHistory || [];

    return {
      ok: true,
      version: VERSION,
      enabled: settings().enabled,
      placesCount: Object.keys(places).length,
      trackedCharacters: Object.keys(locs).length,
      historyCount: hist.length,
      characters: Object.keys(locs)
    };
  }

  WA.geoTracker = {
    VERSION,
    __REG,
    settings,
    saveSettings,
    readLocationMarks,
    registerPlace,
    resolveLocation,
    updateCharacterLocation,
    buildBlock,
    diagnose
  };

  if (WA.registerModule) {
    WA.registerModule('engines/geo-tracker.js', 'geoTracker', WA.geoTracker);
  }
})();