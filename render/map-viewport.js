/**
 * WorldAxis render/map-viewport.js (v2.246.0) — MAP-2：SVG 画布平滑飞行漫游、动态避让与同地聚类引擎
 *
 * ── 核心功能 ──────────────────────────────────────────────────────────
 *   1. 视口与平滑漫游计算（flyTo / computeFlyInterpolation）：
 *      - 视口矩阵状态管理：x, y, width, height, zoom, currentSceneId, currentFloor
 *      - 基于三次方缓动曲线（cubic-bezier）计算两点之间的视口过渡轨迹帧
 *   2. 同地点多角色聚类与徽章聚合（clusterCharacters）：
 *      - 汲取 General_Map 精华：同一地标或视口距离 < 阈值（默认 18 单位）的角色自动聚类
 *      - 展现主次：前 3 名角色展示完整徽章，多出角色折叠为 +N 计数器
 *   3. 动态地标标签避让（declutterLabels）：
 *      - 根据当前缩放层级与包围盒重叠判定，宏观视角折叠次要设施、微观视角展开详图
 *   4. 室内分层下钻与场景切换（drillDown / filterScenePlaces）：
 *      - 支持初星学园、大楼、校园等封闭场景的场景过滤与楼层（1F/2F/3F）切换
 *   5. SVG 渲染管线装配（renderSvgScene）：
 *      - 纯函数生成干净规范的 SVG 节点字符串（地图网格、区域底色、道路折线、地标图标、角色徽章）
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const VERSION = '2.246.0';
  const SETTING_KEY = 'worldaxis_map_viewport_settings_v1';

  // 默认视口与渲染配置
  const DEFAULT_SETTINGS = {
    enabled: true,
    viewWidth: 800,
    viewHeight: 600,
    minZoom: 0.4,
    maxZoom: 3.5,
    defaultZoom: 1.0,
    clusterDistance: 18,    // 聚类阈值（逻辑坐标单位）
    maxClusterAvatars: 3,   // 聚类徽章最多展开的角色数
    animationDurationMs: 400,
    declutterPadding: 8
  };

  const __REG = {
    key: SETTING_KEY,
    def: DEFAULT_SETTINGS,
    module: 'mapViewport',
    bounds: { viewWidth: [400, 2400], viewHeight: [300, 1800], clusterDistance: [5, 50], minZoom: [0.1, 1], maxZoom: [1, 8], defaultZoom: [0.1, 8], animationDurationMs: [80, 2000], maxClusterAvatars: [1, 8], declutterPadding: [0, 40] }
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

  /**
   * 三次方缓动插值函数（Cubic Ease Out）
   */
  function easeOutCubic(t) {
    const p = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - p, 3);
  }

  /**
   * 计算从起始视口平滑过渡到目标点的轨迹关键帧状态
   */
  function computeFlyInterpolation(fromView, target, progress) {
    // v2.250.0：zoom 三旋钮此前只被 diagnose/settings 读回来，插值算法本身不消费它们
    //   —— 滑块拧到底画面不变，属「点了没效果的开关」。这里把 min/max 夹紧、把
    //   defaultZoom 用作起点缺省值（原先是硬写的 1.0，与设置里的 defaultZoom 两套真源）。
    const vcfg = settings();
    const zMin = isFinite(vcfg.minZoom) ? vcfg.minZoom : 0.4;
    const zMax = isFinite(vcfg.maxZoom) ? vcfg.maxZoom : 2.4;
    const zDef = isFinite(vcfg.defaultZoom) ? vcfg.defaultZoom : 1.0;
    const clampZoom = function (z) { return Math.max(zMin, Math.min(zMax, z)); };
    // v2.250.0（滞后一步）：animationDurationMs 此前同样只被 diagnose 读回。
    //   进度若按毫秒给出（progress 可能是累计毫秒），先除以时长归一；超时即停在终点。
    //   这样时长滑块真正改变滑行速度，而不是只在设置里呆着。
    const durMs = isFinite(vcfg.animationDurationMs) ? Math.max(1, vcfg.animationDurationMs) : 400;
    const rawP = (typeof progress === 'number' && isFinite(progress)) ? progress : 1;
    // 两种口径并存：0..1 是归一进度（既有调用方与判据），>1 是累计毫秒。
    //   只认两者之一会让任一侧静默变形 —— 归一进度除以 400ms 会永远停在起点。
    const normP = rawP > 1 ? rawP / durMs : rawP;
    const t = easeOutCubic(Math.max(0, Math.min(1, normP)));

    const startX = fromView.x;
    const startY = fromView.y;
    const startZoom = clampZoom(fromView.zoom || zDef);

    const targetX = target.x;
    const targetY = target.y;
    const targetZoom = target.zoom !== undefined ? clampZoom(target.zoom) : startZoom;

    const curZoom = startZoom + (targetZoom - startZoom) * t;
    const curX = startX + (targetX - startX) * t;
    const curY = startY + (targetY - startY) * t;

    const w = (fromView.width || 800) / curZoom;
    const h = (fromView.height || 600) / curZoom;

    return {
      x: curX,
      y: curY,
      zoom: curZoom,
      viewBox: `${curX - w / 2} ${curY - h / 2} ${w} ${h}`,
      sceneId: target.sceneId !== undefined ? target.sceneId : fromView.sceneId,
      floor: target.floor !== undefined ? target.floor : fromView.floor
    };
  }

  /**
   * 将在场角色按物理位置就近聚类（汲取 General_Map 同地点合并机制）
   * @param {Array} characters [{ who, x, y, rawPlace, floor, ... }]
   * @param {number} threshold 距离阈值
   * @param {number} maxAvatars 展开名额
   */
  function clusterCharacters(characters, threshold, maxAvatars) {
    const th = (threshold !== undefined) ? threshold : settings().clusterDistance;
    const maxA = (maxAvatars !== undefined) ? maxAvatars : settings().maxClusterAvatars;
    const th2 = th * th;

    const validChars = (characters || []).filter(c => c && c.x !== null && c.y !== null && isFinite(c.x) && isFinite(c.y));
    const clusters = [];

    validChars.forEach(char => {
      let matchedCluster = null;
      for (let i = 0; i < clusters.length; i++) {
        const cl = clusters[i];
        // 场景与楼层必须一致才聚类
        if ((char.sceneId || '') !== (cl.sceneId || '') || (char.floor || '') !== (cl.floor || '')) {
          continue;
        }
        const d2 = (char.x - cl.x) ** 2 + (char.y - cl.y) ** 2;
        if (d2 <= th2) {
          matchedCluster = cl;
          break;
        }
      }

      if (matchedCluster) {
        matchedCluster.members.push(char);
        // 质心平滑微调
        const count = matchedCluster.members.length;
        matchedCluster.x = (matchedCluster.x * (count - 1) + char.x) / count;
        matchedCluster.y = (matchedCluster.y * (count - 1) + char.y) / count;
      } else {
        clusters.push({
          id: `cluster_${char.who}_${WA.rand.id('', 4, 'id')}`,
          x: char.x,
          y: char.y,
          sceneId: char.sceneId || '',
          floor: char.floor || '',
          members: [char]
        });
      }
    });

    // 格式化输出：拆分展示项与折叠项
    return clusters.map(cl => {
      const display = cl.members.slice(0, maxA);
      const extraCount = Math.max(0, cl.members.length - maxA);
      return {
        id: cl.id,
        x: cl.x,
        y: cl.y,
        sceneId: cl.sceneId,
        floor: cl.floor,
        total: cl.members.length,
        displayMembers: display,
        extraCount: extraCount,
        hasOverflow: extraCount > 0
      };
    });
  }

  /**
   * 动态地标标签避让算法（declutterLabels）
   * 避免高密地点文字重叠
   */
  function declutterLabels(places, zoom, padding) {
    const pad = (padding !== undefined) ? padding : settings().declutterPadding;
    const curZoom = zoom || 1.0;
    const sorted = (places || []).slice().sort((a, b) => {
      // 优先级：有场景域/地标 > 区域 > 普通地点
      const prioA = (a.kind === 'landmark' ? 3 : (a.kind === 'campus' ? 2 : 1));
      const prioB = (b.kind === 'landmark' ? 3 : (b.kind === 'campus' ? 2 : 1));
      return prioB - prioA;
    });

    const accepted = [];
    const boxes = [];

    sorted.forEach(p => {
      if (p.x === null || p.y === null || !isFinite(p.x) || !isFinite(p.y)) return;
      // 估算文字包围盒（逻辑单位，随 zoom 缩放）
      const textLen = (p.name || '').length;
      const boxW = (textLen * 10 + 16) / curZoom + pad;
      const boxH = 18 / curZoom + pad;
      const left = p.x - boxW / 2;
      const top = p.y - boxH / 2;
      const right = left + boxW;
      const bottom = top + boxH;

      let collides = false;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (!(left > b.right || right < b.left || top > b.bottom || bottom < b.top)) {
          collides = true;
          break;
        }
      }

      if (!collides || curZoom >= 2.0) { // 高倍缩放豁免强制展示
        boxes.push({ left, top, right, bottom });
        accepted.push(Object.assign({}, p, { showLabel: true }));
      } else {
        accepted.push(Object.assign({}, p, { showLabel: false }));
      }
    });

    return accepted;
  }

  /**
   * 按场景和楼层过滤可见地点（室内下钻场景）
   */
  function filterScenePlaces(places, sceneId, floor) {
    const list = places || [];
    if (!sceneId) {
      // 宏观大地图模式：展示无 sceneId 的外部地点以及场景的核心代表点（如校门/总校区）
      return list.filter(p => !p.sceneId || p.kind === 'campus' || p.kind === 'landmark');
    }
    // 室内/场景下钻模式：展示限定 sceneId 下的设施
    return list.filter(p => {
      if (p.sceneId !== sceneId) return false;
      if (floor && p.floor && p.floor !== floor) return false;
      return true;
    });
  }

  /**
   * 纯函数渲染完整的 SVG 场景字符串
   */
  function renderSvgScene(options) {
    const opts = options || {};
    const width = opts.width || 800;
    const height = opts.height || 600;
    const viewBox = opts.viewBox || `0 0 ${width} ${height}`;
    const sceneId = opts.sceneId || '';
    const floor = opts.floor || '';
    // 过滤场景与楼层
    const places = filterScenePlaces(opts.places || [], sceneId, floor);
    const clusters = opts.clusters || [];

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%" class="wa-map-svg">`;
    
    // 背景与网格
    svg += '<defs>';
    svg += '<pattern id="wa-map-grid" width="40" height="40" patternUnits="userSpaceOnUse">';
    svg += '<path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>';
    svg += '</pattern>';
    svg += '</defs>';
    svg += `<rect x="-2000" y="-2000" width="6000" height="6000" fill="#141824"/>`;
    svg += `<rect x="-2000" y="-2000" width="6000" height="6000" fill="url(#wa-map-grid)"/>`;

    // 场景标题水印
    if (sceneId) {
      svg += `<text x="20" y="35" fill="rgba(255,255,255,0.25)" font-size="18" font-weight="bold">【情境域】${sceneId}${floor ? ' · ' + floor : ''}</text>`;
    }

    // 地点图钉与文字
    places.forEach(p => {
      const isL = p.kind === 'landmark' || p.kind === 'campus';
      const color = isL ? '#ffb74d' : '#64b5f6';
      svg += `<g class="wa-map-pin" transform="translate(${p.x},${p.y})">`;
      svg += `<circle r="${isL ? 6 : 4}" fill="${color}" stroke="#0d1117" stroke-width="2"/>`;
      if (p.showLabel !== false) {
        svg += `<text y="${isL ? -10 : -8}" fill="#e6edf3" font-size="${isL ? 12 : 10}" text-anchor="middle" filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.8))">${p.name}</text>`;
      }
      svg += `</g>`;
    });

    // 角色聚类徽章（带头像首字及 +N 数量气泡）
    clusters.forEach(cl => {
      svg += `<g class="wa-map-cluster" transform="translate(${cl.x},${cl.y})">`;
      // 波纹扩散光圈
      svg += `<circle r="16" fill="rgba(100, 181, 246, 0.25)" class="wa-pulse-ring"/>`;
      svg += `<circle r="12" fill="#1e88e5" stroke="#ffffff" stroke-width="2"/>`;
      
      // 成员名字首字或主成员显示
      if (cl.displayMembers.length === 1) {
        const who = cl.displayMembers[0].who;
        svg += `<text y="4" fill="#ffffff" font-size="11" font-weight="bold" text-anchor="middle">${who.slice(0, 1)}</text>`;
        svg += `<text y="24" fill="#64b5f6" font-size="11" font-weight="bold" text-anchor="middle" filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.8))">${who}</text>`;
      } else {
        svg += `<text y="4" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">${cl.total}</text>`;
        const names = cl.displayMembers.map(m => m.who).join('、') + (cl.extraCount > 0 ? ` +${cl.extraCount}` : '');
        svg += `<text y="24" fill="#64b5f6" font-size="10" font-weight="bold" text-anchor="middle" filter="drop-shadow(0px 1px 2px rgba(0,0,0,0.8))">${names}</text>`;
      }
      svg += `</g>`;
    });

    svg += '</svg>';
    return svg;
  }

  /**
   * 诊断自检
   */
  function diagnose() {
    const cfg = settings();
    return {
      ok: true,
      version: VERSION,
      enabled: cfg.enabled,
      viewWidth: cfg.viewWidth,
      viewHeight: cfg.viewHeight,
      clusterDistance: cfg.clusterDistance,
      maxClusterAvatars: cfg.maxClusterAvatars
    };
  }

  WA.mapViewport = {
    VERSION,
    __REG,
    settings,
    saveSettings,
    computeFlyInterpolation,
    clusterCharacters,
    declutterLabels,
    renderSvgScene,
    diagnose
  };

  if (WA.registerModule) {
    WA.registerModule('render/map-viewport.js', 'mapViewport', WA.mapViewport);
  }
})();
