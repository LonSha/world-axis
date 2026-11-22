/**
 * WorldAxis engines/kaleidoscope.js (v2.46.0) — 万花筒
 * 变量取值派生面：世界状态 → 派生量 → 按变量值确定性注入正文
 *
 * 缺口（它治什么）：
 *   世界引擎此前对「世界状态 → 注入文本」这一段只有**硬编码的固定块**（记忆块 / 演化块 /
 *   账本 / 推演叙事 / 仇敌块）。用户若想让「某个数值过阈值就换一段正文」——比如声望跌进
 *   「声名狼藉」时给模型一句不同的世界基调、某个 NPC 的敌对度超过 80 时提醒「此人已不可交涉」
 *   ——只能去写世界书**关键词**条目，而关键词匹配的是**文本**、不读**变量**。于是同一件事
 *   在用户侧要手写两遍（一次进状态、一次进正文），且两边会漂移：状态改了、关键词条目没改。
 *
 * 机制（三条，全是纯读）：
 *   ① 派生量 derive：从世界状态取一个路径的值，经 map（区间→标签）/ range（归一化到 0..100）/
 *      formula（受限算术）派生成一个新量；formula 可用 `$id` 引用其它派生量（可链式）。
 *   ② 条件注入 rule：`when`（派生量比较式，支持 and/or）命中时把 `text` 按 order 拼进注入块；
 *      `text` 支持 `{派生id}` 占位符插值，于是「标签」这类非数值派生量有用武之地。
 *   ③ 三态如实：每个求值结果必落在 ok / missing（路径不存在）/ invalid（规则或取值非法）之一，
 *      **绝不相同形**。本仓主线（absent 与 nullish 必须分得开）在本模块第一次成立：
 *      `evolution.regionalIncident` 的 null 是「真值就是 null」，不是「这个键没有」。
 *
 * 与 entryRouter 的分工：entryRouter 用副模型判「哪些**世界书条目**该上场」（概率、有网络）；
 *   本模块按**变量值**决定「哪段**正文**该出现」（确定、无网络、无随机）。两者都在 before 链、
 *   都失败放行——一个是模型判定、一个是纯函数求值，不可互相替代。
 *
 * 硬约束（写进断言的边界，不是注释里的愿望）：
 *   · 无 eval / 无 new Function：formula 与 when 走自写 tokenizer + 递归下降。这两个字段是
 *     本模块唯一接触**用户可写文本**的地方，一旦接上 eval，用户一行公式就能执行任意代码。
 *   · 无副作用：求值只在 store.get() 的**快照**上进行（只读遍历），断言「求值前后 store 深比较相等」。
 *   · 无随机、无时钟：同输入同输出（可复现），故 rand 与 clock 都不接。
 *     at 字段只进内存台账（面板展示），按 v2.15.0 语义属**测量时间**，故走 clockWall。
 *   · 失败降级：任何异常 → 本回合不注入 + lastFailure 留痕，不卡住一次生成。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };

  const OPS = ['map', 'range', 'formula'];
  const MAX_DERIVES = 40;
  const MAX_RULES = 40;
  const MAX_EXPR_LEN = 400;      // 用户表达式长度闸：公式是给「一条判定」用的，不是给整份 prompt 用的
  const RANGE_LO = 0, RANGE_HI = 100;
  // 引用名（`$xxx`）的**终止字符集**：算符、比较符、括号、逗号、空白。
  //   除此之外的字符（含中文、'-'、'.'）都算引用名的一部分——派生量 id 由用户命名。
  //   由此得到的边界：`$a - 1` 与 `($a)+1` 都合法，而 `$a-1` 会被读成一个叫 `a-1` 的引用
  //   （回归里两条断言把这个界限钉死，免得后人以为它「应该」能当减法用）。
  const REF_STOP = ' \t\n\r+-*/()<>=!,';

  let derives = [];              // { id, path, op, args }
  let rules = [];                // { id, when, text, order }
  let routeFailure = null;       // 最近一次失败（降级必须留痕，不静默）
  let lastEvalResult = null;     // 最近一次完整求值视图

  // ── 快照：只读取数面 ─────────────────────────────────────
  // 为什么不直接操作 store：本模块的全部语义是「读世界、算派生、出文本」——
  //   任何写动作都会破坏「同输入同输出」这条可复现性前提（也会让断言无法自证无副作用）。
  function snapshotState() {
    try { return (WA.store && typeof WA.store.get === 'function') ? WA.store.get() : null; }
    catch (e) { return null; }
  }

  /**
   * 路径取值。三态在这一层就必须分开：
   *   ok       → 键存在（值为 null / 0 / '' / false 都算**存在**）
   *   missing  → 链路中某一级不存在（键没有）
   *   bad-path → 路径本身非法（空、非字符串）
   * 把 null 与「键没有」写成同一个回退值，会让「世界还没走到这一步」与「这条规则写错了路径」
   * 在面板上完全同形——本仓在 mirrorHits/Misses/Errors、absent/nullish 上已经吃过这个亏。
   */
  function resolvePath(root, path) {
    if (typeof path !== 'string' || !path.trim()) return { ok: false, reason: 'bad-path', detail: '路径为空' };
    if (root === null || typeof root !== 'object') return { ok: false, reason: 'missing', detail: '世界状态不可读' };
    const segs = path.trim().split('.');
    let node = root;
    for (let i = 0; i < segs.length; i++) {
      if (node === null || typeof node !== 'object') {
        return { ok: false, reason: 'missing', detail: '在 ' + segs.slice(0, i).join('.') + ' 处断链（值不是容器）' };
      }
      if (!Object.prototype.hasOwnProperty.call(node, segs[i])) {
        return { ok: false, reason: 'missing', detail: '键 ' + segs.slice(0, i + 1).join('.') + ' 不存在' };
      }
      node = node[segs[i]];
    }
    return { ok: true, value: node };
  }

  // ── 词法 ────────────────────────────────────────────────
  // 只认四种东西：数字、$引用、运算符、and/or 关键字。其它一律 bad-char/bad-word——
  // 与其「尽量理解用户输入」，不如让不合法输入**当场显形**（这正是本模块存在的理由）。
  function tokenize(src) {
    const s = String(src == null ? '' : src);
    if (s.length > MAX_EXPR_LEN) return { ok: false, reason: 'expr-too-long', detail: '表达式超过 ' + MAX_EXPR_LEN + ' 字符' };
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      if ((c >= '0' && c <= '9') || (c === '.' && s[i + 1] >= '0' && s[i + 1] <= '9')) {
        let j = i;
        while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === '.')) j++;
        const slice = s.slice(i, j);
        // 只接受「一个点」的十进制写法：1.2.3 这种在 Number() 下是 NaN，必须显式拒绝
        if ((slice.match(/\./g) || []).length > 1) return { ok: false, reason: 'bad-number', detail: slice };
        const num = Number(slice);
        if (!isFinite(num)) return { ok: false, reason: 'bad-number', detail: slice };
        out.push({ t: 'num', v: num });
        i = j;
        continue;
      }
      if (c === '$') {
        let j = i + 1;
        // 引用名的字符集 = 「不是算符/括号/空白」。**刻意允许中文等非 ASCII 字符**：
        //   派生量 id 是用户自己起的名字，要求必须写英文缩写是没道理的（面板的示例就写着
        //   「声望档」）。代价是 `$a-1` 会被读成引用 `a-1`（而不是 a 减 1）——故规则写明：
        //   **引用与算符之间用空格（或括号）分隔**。这条界限由回归里的 `$a - 1` / `($a)+1`
        //   两条断言钉住，不是只写在注释里。
        while (j < s.length && REF_STOP.indexOf(s[j]) < 0) j++;
        const name = s.slice(i + 1, j);
        if (!name) return { ok: false, reason: 'bad-ref', detail: '`$` 后没有名字' };
        out.push({ t: 'ref', v: name });
        i = j;
        continue;
      }
      if (c === '>' || c === '<' || c === '=' || c === '!') {
        const two = s.slice(i, i + 2);
        if (two === '>=' || two === '<=' || two === '==' || two === '!=') { out.push({ t: 'op', v: two }); i += 2; continue; }
        if (c === '>') { out.push({ t: 'op', v: '>' }); i++; continue; }
        if (c === '<') { out.push({ t: 'op', v: '<' }); i++; continue; }
        return { ok: false, reason: 'bad-char', detail: c + '（单写的 = 或 ! 不是比较符；要用 == / !=）' };
      }
      if (c === '+' || c === '-' || c === '*' || c === '/' || c === '(' || c === ')') { out.push({ t: c }); i++; continue; }
      if (/[A-Za-z_]/.test(c)) {
        let j = i;
        while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++;
        const w = s.slice(i, j);
        if (w === 'and' || w === 'or') { out.push({ t: 'kw', v: w }); i = j; continue; }
        return { ok: false, reason: 'bad-word', detail: w + '（变量引用要写 $名字）' };
      }
      return { ok: false, reason: 'bad-char', detail: c };
    }
    return { ok: true, tokens: out };
  }

  // ── 递归下降解析器（算术 + 比较 + 布尔）───────────────
  // resolveRef 是注入进来的取值函数：算术式与条件式共用同一套解析，彼此只差「语法根」。
  function makeParser(tokens, resolveRef) {
    let p = 0;
    function peek() { return tokens[p]; }
    function eat(t) { if (tokens[p] && tokens[p].t === t) { p++; return true; } return false; }

    function parseArith() {
      let left = parseTerm();
      if (!left.ok) return left;
      for (;;) {
        if (eat('+')) { const r = parseTerm(); if (!r.ok) return r; left = { ok: true, v: left.v + r.v }; }
        else if (eat('-')) { const r = parseTerm(); if (!r.ok) return r; left = { ok: true, v: left.v - r.v }; }
        else return left;
      }
    }
    function parseTerm() {
      let left = parseFactor();
      if (!left.ok) return left;
      for (;;) {
        if (eat('*')) { const r = parseFactor(); if (!r.ok) return r; left = { ok: true, v: left.v * r.v }; }
        else if (eat('/')) {
          const r = parseFactor();
          if (!r.ok) return r;
          if (r.v === 0) return { ok: false, reason: 'div-zero', detail: '除以 0' };
          left = { ok: true, v: left.v / r.v };
        } else return left;
      }
    }
    function parseFactor() {
      const tk = peek();
      if (!tk) return { ok: false, reason: 'unexpected-end', detail: '表达式不完整' };
      if (tk.t === '-') { p++; const r = parseFactor(); if (!r.ok) return r; return { ok: true, v: -r.v }; }
      if (tk.t === 'num') { p++; return { ok: true, v: tk.v }; }
      if (tk.t === 'ref') {
        p++;
        const rv = resolveRef(tk.v);
        if (!rv.ok) return rv;
        if (typeof rv.v !== 'number' || !isFinite(rv.v)) {
          return { ok: false, reason: 'not-a-number', detail: '$' + tk.v + ' 不是数值（' + typeof rv.v + '）' };
        }
        return { ok: true, v: rv.v };
      }
      if (tk.t === '(') {
        p++;
        const r = parseArith();
        if (!r.ok) return r;
        if (!eat(')')) return { ok: false, reason: 'unbalanced-paren', detail: '括号不配对' };
        return r;
      }
      return { ok: false, reason: 'unexpected-token', detail: String(tk.t) };
    }

    function parseOperand() {
      const tk = peek();
      if (!tk) return { ok: false, reason: 'unexpected-end', detail: '比较式缺操作数' };
      if (tk.t === 'num') { p++; return { ok: true, v: tk.v }; }
      if (tk.t === '-' && tokens[p + 1] && tokens[p + 1].t === 'num') { p += 2; return { ok: true, v: -tokens[p - 1].v }; }
      if (tk.t === 'ref') {
        p++;
        const rv = resolveRef(tk.v);
        if (!rv.ok) return rv;
        if (typeof rv.v !== 'number' || !isFinite(rv.v)) {
          return { ok: false, reason: 'not-a-number', detail: '$' + tk.v + ' 不是数值（' + typeof rv.v + '）——标签型派生量不能参与比较' };
        }
        return { ok: true, v: rv.v };
      }
      return { ok: false, reason: 'unexpected-token', detail: String(tk.t) };
    }
    function parseCmp() {
      const a = parseOperand();
      if (!a.ok) return a;
      const tk = peek();
      if (!tk || tk.t !== 'op') return { ok: false, reason: 'missing-operator', detail: '比较式缺少比较符' };
      p++;
      const b = parseOperand();
      if (!b.ok) return b;
      const v = tk.v;
      let r;
      if (v === '>=') r = a.v >= b.v;
      else if (v === '<=') r = a.v <= b.v;
      else if (v === '>') r = a.v > b.v;
      else if (v === '<') r = a.v < b.v;
      else if (v === '==') r = a.v === b.v;
      else if (v === '!=') r = a.v !== b.v;
      else return { ok: false, reason: 'bad-operator', detail: v };
      return { ok: true, flag: r };
    }
    function parseAnd() {
      let left = parseCmp();
      if (!left.ok) return left;
      for (;;) {
        if (tokens[p] && tokens[p].t === 'kw' && tokens[p].v === 'and') {
          p++;
          const r = parseCmp();
          if (!r.ok) return r;
          left = { ok: true, flag: left.flag && r.flag };
        } else return left;
      }
    }
    function parseCond() {
      let left = parseAnd();
      if (!left.ok) return left;
      for (;;) {
        if (tokens[p] && tokens[p].t === 'kw' && tokens[p].v === 'or') {
          p++;
          const r = parseAnd();
          if (!r.ok) return r;
          left = { ok: true, flag: left.flag || r.flag };
        } else return left;
      }
    }
    return {
      arith: function () { const r = parseArith(); if (!r.ok) return r; return p >= tokens.length ? r : { ok: false, reason: 'trailing-token', detail: '表达式尾部有多余内容' }; },
      cond: function () { const r = parseCond(); if (!r.ok) return r; return p >= tokens.length ? r : { ok: false, reason: 'trailing-token', detail: '条件尾部有多余内容' }; }
    };
  }

  // ── 派生求值 ────────────────────────────────────────────
  function findDerive(id) { return derives.find(function (d) { return d.id === id; }) || null; }

  function applyMap(raw, args) {
    const segs = (args && Array.isArray(args.segments)) ? args.segments : null;
    if (!segs || !segs.length) return { ok: false, reason: 'bad-segments', detail: 'map 需要 segments 数组' };
    if (typeof raw !== 'number' || !isFinite(raw)) return { ok: false, reason: 'not-a-number', detail: 'map 的输入不是数值' };
    for (let i = 0; i < segs.length; i++) {
      const sg = segs[i] || {};
      if (sg.max === undefined || sg.max === null || sg.max === '') return { ok: true, label: String(sg.label == null ? '' : sg.label) };
      if (typeof sg.max !== 'number') return { ok: false, reason: 'bad-segments', detail: '第 ' + (i + 1) + ' 段 max 不是数值' };
      if (raw <= sg.max) return { ok: true, label: String(sg.label == null ? '' : sg.label) };
    }
    return { ok: true, label: String((args && args.overflow) == null ? '未知' : args.overflow) };
  }

  function applyRange(raw, args) {
    if (typeof raw !== 'number' || !isFinite(raw)) return { ok: false, reason: 'not-a-number', detail: 'range 的输入不是数值' };
    const a = args || {};
    const lo = Number(a.min), hi = Number(a.max);
    if (!isFinite(lo) || !isFinite(hi)) return { ok: false, reason: 'bad-range', detail: 'range 需要 min/max 数值' };
    if (hi <= lo) return { ok: false, reason: 'bad-range', detail: 'max 必须大于 min（实 ' + lo + '→' + hi + '）' };
    let v = (raw - lo) / (hi - lo) * (RANGE_HI - RANGE_LO) + RANGE_LO;
    if (v < RANGE_LO) v = RANGE_LO;
    if (v > RANGE_HI) v = RANGE_HI;
    return { ok: true, value: Math.round(v * 10) / 10 };
  }

  /**
   * 求值一个派生量。memo 缓存 + visiting 检环：`$a` 引 `$b`、`$b` 引 `$a` 时必须报 cycle，
   *   而不是栈溢出或静默取到 undefined。环是用户手写规则时最容易犯的错，必须给出**具名**结论。
   */
  function evalDerive(id, memo, visiting) {
    if (Object.prototype.hasOwnProperty.call(memo, id)) return memo[id];
    const d = findDerive(id);
    if (!d) return { id: id, ok: false, reason: 'unknown-derive', detail: '引用了不存在的派生量 ' + id };
    if (visiting[id]) return { id: id, ok: false, reason: 'cycle', detail: '派生量引用成环（涉及 ' + id + '）' };
    visiting[id] = true;
    const out = computeDerive(d, memo, visiting);
    delete visiting[id];
    out.id = id;
    memo[id] = out;
    return out;
  }

  function computeDerive(d, memo, visiting) {
    const args = d.args || {};
    const refValue = function (refId) {
      const r = evalDerive(refId, memo, visiting);
      if (!r.ok) return { ok: false, reason: r.reason, detail: r.detail };
      return { ok: true, v: r.raw };
    };
    // formula 不读 path：它的输入面就是表达式本身（引用别的派生量）
    if (d.op === 'formula') {
      const tk = tokenize(args.expr);
      if (!tk.ok) return { ok: false, reason: tk.reason, detail: tk.detail };
      const pr = makeParser(tk.tokens, refValue).arith();
      if (!pr.ok) return { ok: false, reason: pr.reason, detail: pr.detail };
      //三态如实：溢出得到的 Infinity / NaN 不是「一个数」。
      //   算术链上每一处都用 isFinite 定义「是数值」（参考量 parseFactor/parseOperand、
      //   applyRange/applyMap 的入口），只有这里漏了一步——于是 「999...9 * 999...9」算出
      //   Infinity 后被归进 ok：snapshot 报 invalid=0，而 buildBlock 把字面量
      //   `Infinity` 直接写进注入段（模型看到的是一个不是数的数）。
      //   同一份结论在 JSON 里显示为 null、在注入面显示为 Infinity，两面互相矛盾。
      //   命名依据：与 div-zero 同族——「运算结果不合法」是独立根因，不应并进 not-a-number
      //   （后者专指「引用到的量不是数值」），否则两个根因在诊断面不可分。
      if (!isFinite(pr.v)) return { ok: false, reason: 'overflow', detail: 'formula 结果不是有限数（' + pr.v + '）' };
      return { ok: true, raw: pr.v, value: pr.v, kind: 'number' };
    }
    const snap = snapshotState();
    const hit = resolvePath(snap, d.path);
    if (!hit.ok) return { ok: false, reason: hit.reason, detail: hit.detail };
    if (d.op === 'map') {
      const m = applyMap(hit.value, args);
      if (!m.ok) return { ok: false, reason: m.reason, detail: m.detail };
      // map 的 value 是**标签**、raw 保留原始数值：标签用于文本插值，raw 用于需要数值时继续算。
      // 二者不可互换——用标签参与比较会在 parseOperand 里被 not-a-number 拦下（断言覆盖）。
      return { ok: true, raw: hit.value, value: m.label, kind: 'label' };
    }
    if (d.op === 'range') {
      const g = applyRange(hit.value, args);
      if (!g.ok) return { ok: false, reason: g.reason, detail: g.detail };
      return { ok: true, raw: hit.value, value: g.value, kind: 'number' };
    }
    return { ok: false, reason: 'bad-op', detail: '未知算子 ' + d.op };
  }

  // ── 候选集管理 ──────────────────────────────────────────
  function listDerives() {
    return derives.map(function (d) { return { id: d.id, path: d.path, op: d.op, args: d.args }; });
  }

  /**
   * id 合法性：非空、不含空白与花括号。
   *   为什么要拦：id 是**双向**契约——`$id` 引用与 `{id}` 占位符都要靠它匹配。
   *   含空格的 id 写进去能存、但用 `$` 与 `{}` 两种写法都取不出来（引用名到空格即止），
   *   于是用户看到的是「派生量明明在列表里、规则却说它不存在」。与其事后解释，
   *   不如在写入时直接拒收并说清原因（本仓一贯口径：写进去读不出来 = 缺陷）。
   */
  function idProblem(id) {
    if (!id) return 'id 不能为空';
    if (/[\s{}]/.test(id)) return 'id 不能含空格或花括号（含了就无法被 $引用 或 {占位符} 取到）';
    return '';
  }

  function setDerive(rec) {
    try {
      rec = rec || {};
      const id = String(rec.id == null ? '' : rec.id).trim();
      const badId = idProblem(id);
      if (badId) return { ok: false, reason: 'bad-id', detail: badId };
      if (OPS.indexOf(rec.op) < 0) return { ok: false, reason: 'bad-op', detail: '算子须为 ' + OPS.join(' / ') };
      if (rec.op !== 'formula' && (typeof rec.path !== 'string' || !rec.path.trim())) {
        return { ok: false, reason: 'bad-path', detail: rec.op + ' 需要 path' };
      }
      const idx = derives.findIndex(function (d) { return d.id === id; });
      if (idx < 0 && derives.length >= MAX_DERIVES) return { ok: false, reason: 'too-many', detail: '派生量上限 ' + MAX_DERIVES + '（超限会让注入面失控）' };
      const item = { id: id, path: rec.op === 'formula' ? '' : String(rec.path).trim(), op: rec.op, args: rec.args || {} };
      if (idx >= 0) derives[idx] = item; else derives.push(item);
      return { ok: true, id: id, replaced: idx >= 0 };
    } catch (e) { return { ok: false, reason: 'threw', detail: String((e && e.message) || e) }; }
  }

  function removeDerive(id) {
    const before = derives.length;
    derives = derives.filter(function (d) { return d.id !== id; });
    return derives.length !== before;
  }

  function clearDerives() { derives = []; }

  function listRules() {
    return rules.map(function (r) { return { id: r.id, when: r.when, text: r.text, order: r.order }; });
  }

  function setRule(rec) {
    try {
      rec = rec || {};
      const id = String(rec.id == null ? '' : rec.id).trim();
      const badId = idProblem(id);
      if (badId) return { ok: false, reason: 'bad-id', detail: badId };
      const text = String(rec.text == null ? '' : rec.text);
      if (!text.trim()) return { ok: false, reason: 'bad-text', detail: '规则 text 不能为空（空文本注入等于白占 token）' };
      const idx = rules.findIndex(function (r) { return r.id === id; });
      if (idx < 0 && rules.length >= MAX_RULES) return { ok: false, reason: 'too-many', detail: '规则上限 ' + MAX_RULES };
      const item = {
        id: id,
        when: String(rec.when == null ? '' : rec.when).trim(),   // 空 = 恒真（无条件注入）
        text: text,
        order: Number.isFinite(Number(rec.order)) ? Number(rec.order) : 10
      };
      if (idx >= 0) rules[idx] = item; else rules.push(item);
      return { ok: true, id: id, replaced: idx >= 0 };
    } catch (e) { return { ok: false, reason: 'threw', detail: String((e && e.message) || e) }; }
  }

  function removeRule(id) {
    const before = rules.length;
    rules = rules.filter(function (r) { return r.id !== id; });
    return rules.length !== before;
  }

  function clearRules() { rules = []; }

  // ── 求值总入口 ──────────────────────────────────────────
  /**
   * 一次完整求值：派生量逐个求值（三态分开记账）+ 规则逐条判定 + 文本插值。
   * 返回值是**诊断面与注入面共用的同一份**结论——两处各算一遍必然漂移。
   */
  function evaluate() {
    const memo = {};
    const okList = [], missingList = [], invalidList = [];
    derives.forEach(function (d) {
      const r = evalDerive(d.id, memo, {});
      if (r.ok) okList.push({ id: r.id, value: r.value, raw: r.raw, kind: r.kind });
      else if (r.reason === 'missing' || r.reason === 'bad-path') missingList.push({ id: r.id, path: d.path, reason: r.reason, detail: r.detail });
      else invalidList.push({ id: r.id, op: d.op, reason: r.reason, detail: r.detail });
    });
    const unresolved = [];
    const hits = [], skipped = [];
    rules.slice().sort(function (a, b) {
      if (a.order !== b.order) return a.order - b.order;
      return rules.indexOf(a) - rules.indexOf(b);   // 同 order 按加入顺序（稳定），不靠 sort 的实现细节
    }).forEach(function (r) {
      let passed = true, reason = '';
      if (r.when) {
        const tk = tokenize(r.when);
        if (!tk.ok) { passed = false; reason = tk.reason + '：' + (tk.detail || ''); }
        else {
          const pr = makeParser(tk.tokens, function (refId) {
            const d = findDerive(refId);
            if (!d) return { ok: false, reason: 'unknown-derive', detail: '引用了不存在的派生量 ' + refId };
            const rr = evalDerive(refId, memo, {});
            if (!rr.ok) return { ok: false, reason: rr.reason, detail: rr.detail };
            return { ok: true, v: rr.raw };
          }).cond();
          if (!pr.ok) { passed = false; reason = pr.reason + '：' + (pr.detail || ''); }
          else passed = pr.flag === true;
        }
      }
      if (passed) hits.push({ id: r.id, text: r.text, order: r.order });
      else skipped.push({ id: r.id, reason: reason || '条件为假' });
    });
    // 文本插值：`{派生id}` → 该派生量的显示值（标签型给标签、数值型给数值）。
    // 找不到的占位符**原样保留**并记账——静默替换成空串会让用户以为「规则没生效」，
    // 而实际是拼错了派生量名字（两件事的处置相反）。
    const rendered = hits.map(function (hit) {
      const text = String(hit.text).replace(/\{([^{}]+)\}/g, function (m, id) {
        const r = memo[id];
        if (!r || !r.ok) { if (unresolved.indexOf(id) < 0) unresolved.push(id); return m; }
        return String(r.value);
      });
      return { id: hit.id, text: text, order: hit.order };
    });
    return {
      ok: okList, missing: missingList, invalid: invalidList,
      hits: rendered, skipped: skipped, unresolved: unresolved,
      at: clockWall()
    };
  }

  /**
   * 注入块。纯确定性：同状态同规则 ⇒ 逐字同块（无随机、无时钟、无模型）。
   * 无命中时返回空串——**空块不进 ctx.injections**，0 token。
   */
  function buildBlock() {
    try {
      const ev = evaluate();
      lastEvalResult = ev;
      routeFailure = null;
      if (!ev.hits.length) return '';
      return '<world_axis_kaleidoscope>\n[变量驱动条款]\n'
        + ev.hits.map(function (h) { return '- ' + h.text; }).join('\n')
        + '\n</world_axis_kaleidoscope>';
    } catch (e) {
      routeFailure = { message: String((e && e.message) || e), kind: 'build-failed', at: clockWall() };
      WA.log('warn', '万花筒求值失败，本回合不注入：' + routeFailure.message);
      return '';
    }
  }

  function lastFailure() { return routeFailure; }
  function lastEval() { return lastEvalResult; }

  function snapshot() {
    const ev = lastEvalResult || evaluate();
    return {
      derives: ev.ok.length, missing: ev.missing.length, invalid: ev.invalid.length,
      rules: rules.length, hit: ev.hits.length, skipped: ev.skipped.length,
      unresolved: ev.unresolved.slice(), at: ev.at
    };
  }

  WA.kaleidoscope = {
    listDerives: listDerives, setDerive: setDerive, removeDerive: removeDerive, clearDerives: clearDerives,
    listRules: listRules, setRule: setRule, removeRule: removeRule, clearRules: clearRules,
    evaluate: evaluate, buildBlock: buildBlock, snapshot: snapshot,
    lastFailure: lastFailure, lastEval: lastEval,
    OPS: OPS, MAX_DERIVES: MAX_DERIVES, MAX_RULES: MAX_RULES
  };

  // ── 工作流节点 ──
  // before 链 order 22：落在 enemies(19) 之后、proactive(25) 之前。
  // 为什么不是更靠后：这一段是「世界状态→正文」的最终成文，越靠后越贴近 render.inject 的
  //   主块拼装，可读性（面板上「本回合注入了什么」）越差；22 让它在演化/章节/仇敌都已注入
  //   之后成文，同时仍早于主动拉动与独白。
  WA.workflow.register({
    id: 'kaleidoscope.inject', chain: 'before', order: 22, label: '变量驱动条款',
    async run(ctx) {
      if (!derives.length && !rules.length) return;
      const block = buildBlock();
      if (block) ctx.injections.push({ source: '变量驱动', position: 'after_last_user', depth: 3, content: block });
    }
  });
})();
