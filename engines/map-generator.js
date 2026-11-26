/**
 * WorldAxis engines/map-generator.js (v2.588.0) — MAP-4：底图不预设，按角色卡/世界书现场生成
 *
 * ── 它治什么（缺口）──────────────────────────────────────────────
 *   v2.587.0 缝进的是「地图编辑器的功能」（engines/map-editor.js：几何/图层/撤销/检查/导入导出），
 *   以及一个能按文档画五层的渲染分支（render/map-viewport.js 的 `opts.doc`）。但产品侧**没有底图**：
 *   要么手工导入一张 JSON，要么这张图根本不存在。而要求是明确的：
 *     「地图也不预设，按照角色卡内，到时候去生成。」
 *   于是本文件补的是**源头那一格**：把角色卡 / 世界书里的文字读出来，抽出地名与共现关系，
 *   再落成编辑器能认的一批几何。
 *
 * ── 为什么「生成」不另起一个文档（本文件最重要的一个取舍）──────────
 *   如果生成器自己持有一份 map 文档，就会立刻出现第二份几何真源：编辑面改的是 A、渲染面画的是 B，
 *   而「哪份是真的」只能靠约定维持 —— 本仓已经为「两份同源数据」付过多次学费。
 *   所以生成**不产出文档**：它把结果表达成**一批编辑操作**（addPoly / addRect / addRoad / addPoi），
 *   逐条走 `WA.mapEditor.apply()`。于是生成天然继承 map-editor 已钉死的纪律：
 *     1. 失败不污染 —— 任何一条被拒，`exportJSON()` 逐字不变（单条 op 自己回滚）；
 *     2. 撤销可核 —— 生成之后 `undo()` 一次回到生成前（fresh 模式下是空文档）；
 *     3. 检查是纯函数 —— 生成完可以 `check()`，而 check 不改文档；
 *     4. id 单调不复用 —— 生成拿到的 id 与手工编辑拿到的 id 同一编号空间，不会撞；
 *     5. 不猜单位 —— 生成只写世界坐标，`unitMeter` 仍是 0，`span().meters` 仍报 null。
 *   换句话说：**生成是这个引擎的调用方，不是第二个引擎**。
 *
 * ── 素材不足时怎么办（不许凭空造图）──────────────────────────────
 *   没有世界书条目、条目里抽不出地名 —— 如实报 `no-source` / `no-place-names`，
 *   并给出「怎么补素材」的下一步。与 playable-seed 空蓝图报 `no-blueprint` 同规：
 *   一张凭空的底图比一张没有底图更坏，因为它看起来像有据可依。
 *
 * ── 布局是确定性的（同一份素材两次生成，几何逐字相同）────────────
 *   不用 Math.random：随机布局会让「换个时间点再生成一次」得到另一张图，
 *   于是同一份设定下的两次对话对不上同一个路口。所有偏移都从**名字的哈希**派生。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const VERSION = '2.588.0';
  const SETTINGS_KEY = 'worldaxis_map_generator_settings_v1';
  const DEFAULT_SETTINGS = {
    enabled: true,
    width: 1600,       // 生成画布（世界单位）。未定标 ⇒ 与米无关，只是坐标尺度
    height: 1200,
    maxEntries: 40,    // 一次最多读多少条世界书条目（避免整包世界书拖死面板）
    maxPlaces: 120     // 一次最多落多少个地名（超出的如实计入 dropped）
  };
  const __REG = {
    key: SETTINGS_KEY, def: DEFAULT_SETTINGS, module: 'mapGenerator',
    bounds: { width: [200, 20000], height: [200, 20000], maxEntries: [1, 500], maxPlaces: [4, 2000] }
  };
  WA.__settingsRegs = (WA.__settingsRegs || []).filter(function (r) {
    return !r || r.key !== SETTINGS_KEY;   // 幂等：同键重建，不叠加
  }).concat([__REG]);

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
      return WA.settingsBus.saveOrThrow(__REG, WA.settingsBus.normalize
        ? WA.settingsBus.normalize(__REG, Object.assign({}, settings(), next || {}))
        : Object.assign({}, settings(), next || {}));
    }
    return { ok: false, reason: 'no-bus' };
  }

  const stat = { runs: 0, generated: 0, opsApplied: 0, opsRejected: 0, reverts: 0, plans: 0, sourceReads: 0 };
  const faults = {};
  function noteFault(k) { faults[k] = (faults[k] || 0) + 1; }

  function num(v) { const n = Number(v); return isFinite(n) ? n : null; }
  function clean(v, n) {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001f]/g, '').trim().slice(0, n || 80);
  }
  /** 名字哈希（FNV-1a 32 位）。确定性布局的唯一随机源 —— 绝不用 Math.random。 */
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h * 16777619) >>> 0;
    }
    return h >>> 0;
  }
  /** 由名字 + 盐派生 [0,1) 的确定性小数。 */
  function frac(name, salt) {
    const h = (hashStr(name + '|' + salt) >>> 0) / 4294967296;
    return h;
  }

  // ── 后缀词表：一个地名的后缀决定它落哪一层 ──────────────────────
  //   顺序即优先级（长的在前），正则 alternation 由它生成 —— 同一张表既是字典也是正则，
  //   不维护第二份「哪些后缀算路」的清单。
  const SUFFIXES = [
    { s: '大道', kind: 'road', type: 'arterial', width: 16 },
    { s: '大街', kind: 'road', type: 'street', width: 12 },
    { s: '大路', kind: 'road', type: 'arterial', width: 14 },
    { s: '码头', kind: 'poi', type: 'dock' },
    { s: '广场', kind: 'poi', type: 'square' },
    { s: '运河', kind: 'terrain', type: 'water' },
    { s: '水库', kind: 'terrain', type: 'water' },
    { s: '路', kind: 'road', type: 'street', width: 8 },
    { s: '街', kind: 'sub', type: 'street' },
    { s: '巷', kind: 'sub', type: 'lane' },
    { s: '弄', kind: 'sub', type: 'lane' },
    { s: '坊', kind: 'sub', type: 'block' },
    { s: '里', kind: 'sub', type: 'block' },
    { s: '桥', kind: 'poi', type: 'bridge' },
    { s: '河', kind: 'terrain', type: 'water' },
    { s: '江', kind: 'terrain', type: 'water' },
    { s: '湖', kind: 'terrain', type: 'water' },
    { s: '海', kind: 'terrain', type: 'water' },
    { s: '湾', kind: 'terrain', type: 'water' },
    { s: '溪', kind: 'terrain', type: 'water' },
    { s: '潭', kind: 'terrain', type: 'water' },
    { s: '渠', kind: 'terrain', type: 'water' },
    { s: '城', kind: 'region', type: 'city' },
    { s: '镇', kind: 'region', type: 'town' },
    { s: '区', kind: 'region', type: 'district' },
    { s: '州', kind: 'region', type: 'province' },
    { s: '府', kind: 'region', type: 'seat' },
    { s: '郡', kind: 'region', type: 'county' },
    { s: '岛', kind: 'region', type: 'island' },
    { s: '港', kind: 'region', type: 'port' },
    { s: '馆', kind: 'poi', type: 'hall' },
    { s: '楼', kind: 'poi', type: 'tower' },
    { s: '塔', kind: 'poi', type: 'tower' },
    { s: '寺', kind: 'poi', type: 'temple' },
    { s: '庙', kind: 'poi', type: 'temple' },
    { s: '站', kind: 'poi', type: 'station' },
    { s: '场', kind: 'poi', type: 'yard' },
    { s: '院', kind: 'poi', type: 'court' },
    { s: '宅', kind: 'poi', type: 'house' },
    { s: '堂', kind: 'poi', type: 'hall' },
    { s: '阁', kind: 'poi', type: 'pavilion' },
    { s: '仓', kind: 'poi', type: 'depot' },
    { s: '园', kind: 'poi', type: 'garden' },
    { s: '苑', kind: 'poi', type: 'garden' },
    { s: '庄', kind: 'poi', type: 'manor' },
    { s: '厅', kind: 'poi', type: 'hall' },
    { s: '门', kind: 'poi', type: 'gate' },
    { s: '寨', kind: 'poi', type: 'camp' },
    { s: '堡', kind: 'poi', type: 'fort' },
    { s: '营', kind: 'poi', type: 'camp' },
    { s: '观', kind: 'poi', type: 'temple' }
  ];
  const SUFFIX_BY_S = (function () {
    const m = {};
    SUFFIXES.forEach(function (x) { m[x.s] = x; });
    return m;
  })();
  // 「结构类后缀字」集合：用来判断「这一段是不是更长名字的第二段」（「南市坊里」的「里」）。
  //   ⚠ **不含地形类**（江/河/湖/海/湾/溪/潭/渠）：地形字是名字的组成部分，
  //   「望江楼」的「江」不能被当成一个独立地名把「楼」吃掉（实测过这一版：抽出了「望江」，
  //   而「望江楼」整个丢了）。结构字则相反：「坊里」「街口」几乎总是两段。
  const SUFFIX_CHARS = (function () {
    const m = {};
    SUFFIXES.forEach(function (d) {
      if (d.kind === 'terrain') return;
      for (let i = 0; i < d.s.length; i++) m[d.s.charAt(i)] = 1;
    });
    return m;
  })();
  // 虚词头：从候选名的开头裁掉（「有一座叫青石桥」里抽出的「座叫青石」要裁干净）
  // ── 名字边界（中文没有空格，只能靠「名字左边不会出现什么」来切）─────────
  //   前三版都在正则上打补丁（前缀 2–5 字、虚词头清洗、黑名单），实测一律漏：
  //     「有一条青石巷」抽出「一条青石巷」、「口是望江楼」抽出「口是望江楼」。
  //   根因是「前缀+后缀」是一次**贪心匹配**，它不知道名字从哪里开始。
  //   改成**从后缀往左扫**：遇到边界字就停。停在哪，名字就从哪开始。
  //   边界字 = 标点 / 虚词 / 量词 / 方位动词 —— 全是「名字里不会出现、名字左边常出现」的字。
  const BOUNDARY = '的了在是和与把被给对从向往到去来说走看叫有不就都还又再很最更太吗呢吧啊，。、；：！？,.;:!?（）()「」“”\'" \t\n\r一二两三四五六七八九十百千万半几多每各某这那哪条座个家处块片间所栋幢排段沿到过经距靠';
  function isBoundary(ch) { return BOUNDARY.indexOf(ch) >= 0; }
  const PREFIX_BLACK = [
    '这个', '那个', '一个', '两个', '什么', '整个', '这里', '那里', '每个', '哪个',
    '几个', '很多', '某个', '任何', '所有', '附近', '周围', '一条', '两条', '三条',
    '本次', '当地', '外地', '主要', '其他', '另外', '以及', '方向', '地方', '城市',
    '街上', '路上', '城里', '镇里', '区里', '门口', '路口', '桥上', '河边'
  ];

  /**
   * 纯函数：一堆文本 ⇒ 地名与共现关系。不改任何状态。
   * @param {{origin:string,text:string}[]} texts
   * @param {{maxPlaces:number}} opt
   */
  function harvest(texts, opt) {
    const o = opt || {};
    const cap = num(o.maxPlaces) || settings().maxPlaces;
    const byName = {};
    const order = [];
    const edgeMap = {};
    let chars = 0;
    const list = Array.isArray(texts) ? texts : [];

    list.forEach(function (t) {
      const body = clean(t && t.text, 20000);
      if (!body) return;
      chars += body.length;
      const seenHere = [];
      const seenSet = {};
      let i = 0;
      while (i < body.length) {
        // ① 当前位置是不是一个后缀？长的优先（「码头」先于「头」、「大街」先于「街」）——
        //    SUFFIXES 的书写顺序就是优先级，不另维护第二张表。
        let def = null;
        for (let k = 0; k < SUFFIXES.length; k++) {
          if (body.substr(i, SUFFIXES[k].s.length) === SUFFIXES[k].s) { def = SUFFIXES[k]; break; }
        }
        if (!def) { i++; continue; }
        // ② 前一个字也是后缀字 ⇒ 这一段属于更长名字（「南市坊里」的「里」不该单独成点）
        if (i > 0 && SUFFIX_CHARS[body.charAt(i - 1)]) { i += def.s.length; continue; }
        // ③ 向左扫，遇边界停；最多 4 个字（再长就不是地名，是整句话）
        let j = i;
        while (j > 0 && (i - j) < 4 && !isBoundary(body.charAt(j - 1))) j--;
        const head = body.slice(j, i);
        i += def.s.length;
        // 多字后缀可以自身成名（「过运河」的「运河」是完整水名），单字后缀不行
        //   （「是路」「的桥」——那是句子，不是地名）。
        if (!head.length && def.s.length < 2) continue;
        if (head.length && PREFIX_BLACK.indexOf(head) >= 0) continue;   // 「城市区」「附近路」
        const name = head + def.s;
        if (!byName[name]) {
          byName[name] = { name: name, kind: def.kind, type: def.type, width: def.width || 0, count: 0, first: order.length, origin: clean(t && t.origin, 40) };
          order.push(name);
        }
        byName[name].count++;
        if (!seenSet[name]) { seenSet[name] = 1; seenHere.push(name); }
      }
      // 同一条文本内两两共现 ⇒ 一条边（用于「谁挨着谁」的布局判据）
      for (let i = 0; i < seenHere.length; i++) {
        for (let j = i + 1; j < seenHere.length; j++) {
          const a = seenHere[i], b = seenHere[j];
          const k = a < b ? (a + '\u0001' + b) : (b + '\u0001' + a);
          if (!edgeMap[k]) edgeMap[k] = { a: a, b: b, w: 0 };
          edgeMap[k].w++;
        }
      }
    });

    const all = order.map(function (n) { return byName[n]; });
    const kept = all.slice(0, cap);
    const keptSet = {};
    kept.forEach(function (p) { keptSet[p.name] = 1; });
    const edges = [];
    Object.keys(edgeMap).forEach(function (k) {
      const e = edgeMap[k];
      if (keptSet[e.a] && keptSet[e.b]) edges.push(e);
    });
    edges.sort(function (x, y) { return y.w - x.w || (x.a < y.a ? -1 : 1); });

    return {
      ok: true,
      places: kept,
      dropped: all.length - kept.length,
      edges: edges.slice(0, 400),
      scanned: chars,
      distinct: all.length
    };
  }

  // ── 布局 + 操作序列（纯函数：给定素材与画布，产出要执行的 ops）────────
  /**
   * @param {{places:Array,edges:Array}} hv
   * @param {{width:number,height:number}} dims
   */
  function plan(hv, dims) {
    stat.plans++;
    const W = num(dims && dims.width), H = num(dims && dims.height);
    if (!(W > 0) || !(H > 0)) return { ok: false, reason: 'bad-size' };
    const places = (hv && Array.isArray(hv.places)) ? hv.places : [];
    if (!places.length) return { ok: false, reason: 'no-place-names' };

    const pad = Math.max(16, Math.round(Math.min(W, H) * 0.06));
    const waters = places.filter(function (p) { return p.kind === 'terrain'; });
    const regions = places.filter(function (p) { return p.kind === 'region'; });
    const subs = places.filter(function (p) { return p.kind === 'sub'; });
    const roads = places.filter(function (p) { return p.kind === 'road'; });
    const pois = places.filter(function (p) { return p.kind === 'poi'; });
    const ops = [];

    // ① 地形（水）：沿画布横向切带。带宽由数量均分，顶点带一点确定性扰动 ——
    //    水是**背景**，它先落，后面所有区/街区压在它上面（渲染层序也是这个顺序）。
    const wBand = (H - 2 * pad) / (waters.length + 1);
    waters.forEach(function (p, i) {
      const y0 = pad + wBand * (i + 1);
      const dy = Math.round((frac(p.name, 'w') - 0.5) * wBand * 0.5);
      const inset = Math.round(W * 0.04);
      ops.push({
        op: 'addPoly', layer: 'terrains', name: p.name, type: 'water',
        points: [
          [inset, y0 - wBand * 0.22 + dy],
          [Math.round(W * 0.35), y0 - wBand * 0.30 + dy],
          [Math.round(W * 0.7), y0 - wBand * 0.18 + dy],
          [W - inset, y0 - wBand * 0.26 + dy],
          [W - inset, y0 + wBand * 0.26 + dy],
          [Math.round(W * 0.7), y0 + wBand * 0.18 + dy],
          [Math.round(W * 0.35), y0 + wBand * 0.30 + dy],
          [inset, y0 + wBand * 0.22 + dy]
        ]
      });
    });

    // ② 区：网格。区是「面」的骨架，其余层都挂到它上面找位置。
    const cell = { x: 0, y: 0, w: 0, h: 0 };
    const regionBox = {};
    if (regions.length) {
      const cols = Math.max(1, Math.ceil(Math.sqrt(regions.length)));
      const rows = Math.ceil(regions.length / cols);
      cell.w = (W - 2 * pad) / cols;
      cell.h = (H - 2 * pad) / rows;
      regions.forEach(function (p, i) {
        const cx = i % cols, cy = Math.floor(i / cols);
        const bx = Math.round(pad + cx * cell.w), by = Math.round(pad + cy * cell.h);
        const bw = Math.max(16, Math.round(cell.w * 0.86)), bh = Math.max(16, Math.round(cell.h * 0.86));
        regionBox[p.name] = { x: bx, y: by, w: bw, h: bh };
        ops.push({ op: 'addRect', layer: 'regions', name: p.name, type: p.type || 'district', x: bx, y: by, w: bw, h: bh });
      });
    } else {
      regionBox[''] = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };
    }
    const regionNames = regions.map(function (p) { return p.name; });
    const wholeBox = { x: pad, y: pad, w: W - 2 * pad, h: H - 2 * pad };

    // 共现索引：name → 与之共现过的区（权重最高者）
    const nearRegion = {};
    (hv.edges || []).forEach(function (e) {
      const pairs = [[e.a, e.b], [e.b, e.a]];
      pairs.forEach(function (pr) {
        const me = pr[0], other = pr[1];
        if (regionNames.indexOf(other) < 0) return;
        if (!nearRegion[me] || nearRegion[me].w < e.w) nearRegion[me] = { name: other, w: e.w };
      });
    });
    function boxFor(p, idx) {
      const nr = nearRegion[p.name];
      if (nr && regionBox[nr.name]) return regionBox[nr.name];
      if (regionNames.length) return regionBox[regionNames[idx % regionNames.length]];
      return wholeBox;
    }

    // ③ 街区：在所属区内按格子铺，格子数由该区里街区数量决定（先分组再铺，位置才不抖）
    const subsByRegion = {};
    subs.forEach(function (p, i) {
      const box = boxFor(p, i);
      const key = box.x + ':' + box.y;
      (subsByRegion[key] = subsByRegion[key] || []).push({ p: p, box: box });
    });
    Object.keys(subsByRegion).forEach(function (key) {
      const group = subsByRegion[key];
      const box = group[0].box;
      const n = group.length;
      const sc = Math.max(1, Math.ceil(Math.sqrt(n)));
      const sw = Math.max(12, Math.round((box.w * 0.78) / sc));
      const sh = Math.max(12, Math.round((box.h * 0.78) / sc));
      group.forEach(function (g, j) {
        const gx = j % sc, gy = Math.floor(j / sc);
        const x = Math.round(box.x + box.w * 0.08 + gx * sw);
        const y = Math.round(box.y + box.h * 0.08 + gy * sh);
        ops.push({
          op: 'addRect', layer: 'subs', name: g.p.name, type: g.p.type || 'block',
          x: x, y: y, w: Math.max(12, sw - 6), h: Math.max(12, sh - 6)
        });
      });
    });

    // ④ 路：优先连「共现过的两个区」，其次横贯画布。路是线，只要两端点不同即可。
    roads.forEach(function (p, i) {
      let a = null, b = null;
      if (regionNames.length >= 2) {
        const r1 = regionBox[regionNames[i % regionNames.length]];
        const r2 = regionBox[regionNames[(i + 1) % regionNames.length]];
        a = [Math.round(r1.x + r1.w * 0.5), Math.round(r1.y + r1.h * 0.5)];
        b = [Math.round(r2.x + r2.w * 0.5), Math.round(r2.y + r2.h * 0.5)];
      } else {
        const y = Math.round(pad + (i + 1) * ((H - 2 * pad) / (roads.length + 1)));
        a = [pad, y];
        b = [W - pad, y];
      }
      if (a[0] === b[0] && a[1] === b[1]) b = [b[0] + 1, b[1]];   // 两点重合 ⇒ 退化，挪一格
      const cls = (p.type === 'arterial' || p.type === 'highway') ? p.type : 'street';
      const w = num(p.width) > 0 ? p.width : (cls === 'arterial' ? 14 : 8);
      ops.push({ op: 'addRoad', name: p.name, class: cls, width: w, points: [a, b] });
    });

    // ⑤ 点：在自己所属区里按确定性偏移散开（同一个名字两次生成落在同一个位置）
    pois.forEach(function (p, i) {
      const box = boxFor(p, i);
      const fx = 0.18 + frac(p.name, 'px') * 0.64;
      const fy = 0.18 + frac(p.name, 'py') * 0.64;
      ops.push({
        op: 'addPoi', name: p.name, type: p.type || 'poi',
        x: Math.round(box.x + box.w * fx),
        y: Math.round(box.y + box.h * fy),
        desc: '来自素材' + (p.origin ? ('：' + p.origin) : '') + (p.count > 1 ? ('（提及 ' + p.count + ' 次）') : '')
      });
    });

    return {
      ok: true, ops: ops,
      counts: { terrains: waters.length, regions: regions.length, subs: subs.length, roads: roads.length, pois: pois.length },
      covered: { waters: waters.length, regions: regions.length, subs: subs.length, roads: roads.length, pois: pois.length }
    };
  }

  // ── 素材读取（世界书 / 显式文本）────────────────────────────────
  /**
   * 读素材。显式传 texts 时不碰世界书（测试与手工喂料走这一路）。
   * @param {{texts?:string[]|{origin:string,text:string}[], entries?:Array, maxEntries?:number}} o
   */
  function readSources(o) {
    const opt = o || {};
    stat.sourceReads++;
    const cap = num(opt.maxEntries) || settings().maxEntries;

    // ① 显式文本
    if (Array.isArray(opt.texts)) {
      const texts = opt.texts.map(function (t, i) {
        if (typeof t === 'string') return { origin: 'inline-' + i, text: t };
        return { origin: clean(t && t.origin, 40) || ('inline-' + i), text: String((t && t.text) || '') };
      }).slice(0, cap);
      if (!texts.length) return { ok: false, reason: 'no-source', why: '传进来的 texts 是空的', hint: '把角色卡/世界书正文传进来，或先在世界书面板勾选条目' };
      return { ok: true, texts: texts, entries: texts.length, kind: 'inline', selected: 0 };
    }

    // ② 显式条目
    if (Array.isArray(opt.entries)) {
      const texts = opt.entries.map(function (e, i) {
        const head = clean(e && (e.name || e.comment || e.key), 60);
        const body = String((e && (e.content || e.text)) || '');
        return { origin: head || ('entry-' + i), text: (head ? (head + '\n') : '') + body };
      }).slice(0, cap);
      if (!texts.length) return { ok: false, reason: 'no-source', why: '传进来的 entries 是空的', hint: '把角色卡条目传进来，或先在世界书面板勾选条目' };
      return { ok: true, texts: texts, entries: texts.length, kind: 'entries', selected: 0 };
    }

    // ③ 世界书（默认路径：角色卡附带的世界书就是「卡内素材」）
    const wb = WA.worldbook;
    if (!wb || typeof wb.peekEntries !== 'function') {
      return { ok: false, reason: 'no-source', why: '世界书模块未装载（engines/worldbook.js）', hint: '先让世界书模块装载，或直接传 texts / entries' };
    }
    const all = wb.peekEntries() || [];
    if (!all.length) {
      return { ok: false, reason: 'no-source', why: '世界书缓存为空（还没有读当前聊天的条目）', hint: '在世界书面板里读一次/勾选条目，再回来生成' };
    }
    let ids = [];
    try { ids = (typeof wb.getSelectedIds === 'function') ? (wb.getSelectedIds() || []) : []; } catch (e) { ids = []; }
    const idSet = {};
    ids.forEach(function (x) { idSet[String(x)] = 1; });
    const picked = ids.length ? all.filter(function (e) { return idSet[String(e && (e.id != null ? e.id : e.uid))]; }) : all;
    const use = (picked.length ? picked : all).slice(0, cap);
    const texts = use.map(function (e, i) {
      const head = clean(e && (e.name || e.comment), 60);
      const body = String((e && (e.content || e.text)) || '');
      return { origin: head || ('entry-' + i), text: (head ? (head + '\n') : '') + body };
    });
    const nonEmpty = texts.filter(function (t) { return clean(t.text, 20000).length > 0; });
    if (!nonEmpty.length) {
      return { ok: false, reason: 'no-source', why: '选中的世界书条目里没有正文（' + use.length + ' 条全空）', hint: '选一些有正文的条目，或直接传 texts' };
    }
    return { ok: true, texts: nonEmpty, entries: nonEmpty.length, kind: 'worldbook', selected: ids.length, cached: all.length };
  }

  // ── 落地：把 ops 逐条交给 map-editor ────────────────────────────
  /**
   * 生成一张底图。
   * @param {{mode?:'fresh'|'append', width?:number, height?:number, texts?:Array, entries?:Array, dryRun?:boolean, maxEntries?:number, maxPlaces?:number}} o
   */
  function generate(o) {
    const opt = o || {};
    if (!settings().enabled) { noteFault('disabled'); return { ok: false, reason: 'disabled' }; }
    const ed = WA.mapEditor;
    if (!ed || typeof ed.apply !== 'function') return { ok: false, reason: 'no-document', why: '地图编辑器未装载（engines/map-editor.js）' };
    stat.runs++;

    const src = readSources(opt);
    if (!src.ok) { noteFault(src.reason || 'no-source'); return src; }

    const hv = harvest(src.texts, { maxPlaces: num(opt.maxPlaces) || settings().maxPlaces });
    if (!hv.places.length) {
      noteFault('no-place-names');
      return {
        ok: false, reason: 'no-place-names', entries: src.entries,
        scanned: hv.scanned,
        hint: '素材里没有可识别的地名（后缀词表见 map-generator 的 SUFFIXES：城/镇/区/街/巷/路/河/馆/楼/桥…）。补几条带地名的设定，或直接传 texts'
      };
    }

    const mode = (opt.mode === 'append') ? 'append' : 'fresh';
    const W = num(opt.width) || settings().width;
    const H = num(opt.height) || settings().height;

    // ⚠ 预演必须**不碰文档**：dryRun 走的是同一份 plan，但不能 newDoc ——
    //   否则「点一下预演」就把用户手里的底图清空了（一次只读操作变成破坏性操作）。
    if (opt.dryRun === true) {
      const plDry = plan(hv, { width: W, height: H }, opt);
      if (!plDry.ok) { noteFault(plDry.reason || 'no-place-names'); return plDry; }
      return {
        ok: true, dryRun: true, mode: mode, ops: plDry.ops, counts: plDry.counts,
        places: hv.places.length, dropped: hv.dropped, edges: hv.edges.length,
        entries: src.entries, sourceKind: src.kind, scanned: hv.scanned,
        note: '预演不落任何东西：文档版本、fingerprint、撤销栈全都没动'
      };
    }

    let created = null;
    if (mode === 'fresh') {
      const nd = ed.newDoc(W, H);
      if (!nd || nd.ok !== true) return { ok: false, reason: 'no-document', detail: nd && nd.reason };
      created = true;
    }
    const doc = ed.doc && ed.doc();
    const dims = { width: (doc && doc.width) || W, height: (doc && doc.height) || H };

    const pl = plan(hv, dims, opt);
    if (!pl.ok) { noteFault(pl.reason || 'no-place-names'); return pl; }

    const applied = [];
    const rejected = [];
    pl.ops.forEach(function (op) {
      const r = ed.apply(op);
      if (r && r.ok === true) {
        applied.push({ op: op.op, id: r.id, layer: r.layer, name: op.name });
        stat.opsApplied++;
      } else {
        rejected.push({ op: op.op, name: op.name, reason: (r && r.reason) || 'unknown' });
        stat.opsRejected++;
      }
    });
    if (applied.length) stat.generated++;

    const fp = (typeof ed.fingerprint === 'function') ? ed.fingerprint() : null;
    return {
      ok: applied.length > 0,
      mode: mode, created: !!created,
      applied: applied, rejected: rejected,
      appliedCount: applied.length, rejectedCount: rejected.length,
      counts: (typeof ed.counts === 'function') ? ed.counts() : null,
      places: hv.places.length, dropped: hv.dropped, edges: hv.edges.length,
      entries: src.entries, sourceKind: src.kind, scanned: hv.scanned,
      fingerprint: fp,
      hint: rejected.length ? ('有 ' + rejected.length + ' 条几何被编辑器拒收（见 rejected 的 reason）；像素级位置可以再手工调') : ''
    };
  }

  /** 撤回一次生成：把本批新增的 id 逆序 remove（走 apply，可核、可再 undo）。 */
  function revert(result) {
    const ed = WA.mapEditor;
    if (!ed || typeof ed.apply !== 'function') return { ok: false, reason: 'no-document' };
    const applied = (result && Array.isArray(result.applied)) ? result.applied : [];
    if (!applied.length) return { ok: false, reason: 'undo-empty' };
    let removed = 0;
    const failed = [];
    for (let i = applied.length - 1; i >= 0; i--) {
      const r = ed.apply({ op: 'remove', id: applied[i].id });
      if (r && r.ok === true) removed++;
      else failed.push({ id: applied[i].id, reason: (r && r.reason) || 'unknown' });
    }
    stat.reverts++;
    return { ok: removed > 0, removed: removed, failed: failed, counts: (typeof ed.counts === 'function') ? ed.counts() : null };
  }

  function diagnose() {
    return {
      ok: true, version: VERSION, enabled: !!settings().enabled,
      settings: settings(),
      deps: {
        mapEditor: !!(WA.mapEditor && typeof WA.mapEditor.apply === 'function'),
        worldbook: !!(WA.worldbook && typeof WA.worldbook.peekEntries === 'function'),
        viewport: !!(WA.mapViewport && typeof WA.mapViewport.renderSvgScene === 'function'),
        settingsBus: !!WA.settingsBus
      },
      suffixes: SUFFIXES.length,
      stat: Object.assign({}, stat),
      faults: Object.assign({}, faults)
    };
  }

  WA.mapGenerator = {
    readSources: readSources, harvest: harvest, plan: plan,
    generate: generate, revert: revert,
    getSettings: settings, setSettings: function (patch) { return saveSettings(patch); },
    stat: function () { return Object.assign({}, stat, { faults: Object.assign({}, faults) }); },
    diagnose: diagnose
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/map-generator.js', { kind: 'engine', ver: VERSION });
})();