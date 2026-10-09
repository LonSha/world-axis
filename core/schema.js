/**
 * WorldAxis core/schema.js (v2.110.0) — 公开入口的输入 schema（计划一 #22）
 *
 * ── 病灶（它治什么）────────────────────────────────────────────────────
 *   `core/input-guard.js` 治的是「单个值的形态」（text/num/count/oneOf/list），
 *   它回答不了**结构**上的问题：`store.save()` 收下一个 `{actors:'x'}`、
 *   `tool-import` 收下一个字段名拼错的 JSON —— 两者都会被下游当成合法输入往下走，
 *   然后在**很深的地方**炸开，或者更糟：安静地写进世界。
 *   本仓的拒收码体系（v2.78.0）要求「拒收要趁早、要带名字」，而**结构不对**此前
 *   没有任何统一入口可拒 —— 每个引擎自己 `if (!Array.isArray(x))` 一遍，形态各不相同。
 *
 * ── 三条设计边界 ───────────────────────────────────────────────────────
 *   ① **不抛**（与 input-guard 同）：任何输入、任何 spec 都返回结果对象。
 *      schema 自己抛一次，它就从「早拒」变成了新的崩溃点。
 *   ② **不猜意图**：类型不对就是不对 —— `'3'` 不是 `3`、`[]` 不是 `{}`。
 *      允不允许字符串化的数字由 spec 显式声明（`coerce:true`），默认不允许。
 *   ③ **错误可读且稳定**：`errors` 恒为**数组**，每条 `{field, expected, actual}`；
 *      只有一条时也走数组（调用方不必写两种取法）。`expected` 用人读得懂的形式：
 *      枚举写 `a|b|c`（与产品拒收码的写法一致），不写 `enum`。
 *
 * ── 与既有模块的分工 ───────────────────────────────────────────────────
 *   · `input-guard`  = 值级（一个字段长什么样）
 *   · `schema`       = 结构级（一组字段该不该同时在、类型对不对、范围越没越界）
 *   · `reject-code`  = 归属级（拒收码有没有见证人）
 *   三者顺序即「值 → 结构 → 归属」，互不重复。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const TYPES = ['string', 'number', 'int', 'boolean', 'array', 'object', 'enum', 'oneOf', 'any'];
  const MAX_ERRORS = 24;          // 错误列表上限：报前 24 条足够定位，再多只是噪声
  const REGISTRY = {};            // name -> {name, spec, at}
  /** 墙钟守卫（与仓库其余 130 处同形：先试产品时钟、异常回落 Date.now ——
   *  形态刻意与 core/store.js 的 clockWall 逐字同构：tests/run.js 的 v2.20.0 段用一对
   *  「声明数 == 兜底数」的判据抄这一族，**函数名与写法都在判据的观察面上**）。 */
  const clockWall = function () { try { return WA.clock.wallNow(); } catch (e) { return Date.now(); } };
  let _checks = 0, _rejected = 0, _passed = 0;

  function txt(v, max) {
    try { return WA.inputGuard ? WA.inputGuard.text(v, max) : String(v == null ? '' : v).slice(0, max || 0); }
    catch (e) { return ''; }
  }
  /** actual 的**可读形态**：枚举/短串给原文，对象给类名，数组给长度。 */
  function actualOf(v) {
    try {
      if (v === null) return 'null';
      if (v === undefined) return 'undefined';
      const t = typeof v;
      if (t === 'string') return v.length > 40 ? v.slice(0, 40) + '…' : v;
      if (t === 'number' || t === 'boolean') return String(v);
      if (Array.isArray(v)) return 'array(' + v.length + ')';
      if (t === 'object') return 'object(' + Object.keys(v).length + ')';
      return t;
    } catch (e) { return '(unreadable)'; }
  }
  /** expected 的可读形态：枚举写 `a|b|c`。 */
  function expectedOf(def) {
    const t = def.type || 'any';
    if (t === 'enum' || t === 'oneOf') {
      const vs = Array.isArray(def.values) ? def.values : [];
      return vs.map(function (x) { return String(x); }).join('|');
    }
    if (t === 'int') return 'integer';
    if (t === 'number') {
      const lo = (def.min !== undefined), hi = (def.max !== undefined);
      if (lo || hi) return 'number[' + (lo ? def.min : '-inf') + ',' + (hi ? def.max : '+inf') + ']';
      return 'number';
    }
    if (t === 'string') {
      if (def.pattern) return 'string(/' + String(def.pattern) + '/)';
      if (def.maxLength) return 'string<=' + def.maxLength;
      return 'string';
    }
    if (t === 'array') return 'array';
    if (t === 'object') return 'object';
    return t;
  }

  /** 单字段校验：返回 null（通过）或 `{field, expected, actual}`。 */
  function fieldError(path, def, v) {
    const d = def || {};
    const t = d.type || 'any';
    const present = !(v === undefined || v === null || v === '');
    if (d.required && !present) return { field: path, expected: expectedOf(d) + '（必填）', actual: actualOf(v) };
    if (!present) return null;                                  // 非必填 + 缺席 ⇒ 不判
    if (t === 'any') return null;
    if (t === 'string') {
      if (typeof v !== 'string') return { field: path, expected: expectedOf(d), actual: actualOf(v) };
      const s = d.trim === false ? v : v.trim();
      if (d.minLength && s.length < d.minLength) return { field: path, expected: 'string>=' + d.minLength, actual: actualOf(v) };
      if (d.maxLength && v.length > d.maxLength) return { field: path, expected: 'string<=' + d.maxLength, actual: actualOf(v) };
      if (d.pattern) {
        let re = null;
        try { re = new RegExp(String(d.pattern)); } catch (e) { re = null; }
        if (re && !re.test(v)) return { field: path, expected: expectedOf(d), actual: actualOf(v) };
      }
      return null;
    }
    if (t === 'number' || t === 'int') {
      let n = v;
      if (typeof n !== 'number') {
        if (!d.coerce) return { field: path, expected: expectedOf(d), actual: actualOf(v) };
        n = Number(v);
      }
      if (!isFinite(n)) return { field: path, expected: expectedOf(d), actual: actualOf(v) };
      if (t === 'int' && Math.floor(n) !== n) return { field: path, expected: 'integer', actual: actualOf(v) };
      if (d.min !== undefined && n < d.min) return { field: path, expected: expectedOf(d), actual: actualOf(v) };
      if (d.max !== undefined && n > d.max) return { field: path, expected: expectedOf(d), actual: actualOf(v) };
      return null;
    }
    if (t === 'boolean') return (typeof v === 'boolean') ? null : { field: path, expected: 'boolean', actual: actualOf(v) };
    if (t === 'array') {
      if (!Array.isArray(v)) return { field: path, expected: 'array', actual: actualOf(v) };
      if (d.maxItems && v.length > d.maxItems) return { field: path, expected: 'array<=' + d.maxItems, actual: actualOf(v) };
      if (d.itemType) {
        for (let i = 0; i < v.length; i++) {
          const e = fieldError(path + '[' + i + ']', { type: d.itemType, values: d.values }, v[i]);
          if (e) return e;
        }
      }
      return null;
    }
    if (t === 'object') return (v && typeof v === 'object' && !Array.isArray(v)) ? null : { field: path, expected: 'object', actual: actualOf(v) };
    if (t === 'enum' || t === 'oneOf') {
      const vs = Array.isArray(d.values) ? d.values : [];
      const hit = vs.some(function (x) { return x === v || (typeof x === 'string' && typeof v === 'string' && x.toLowerCase() === v.toLowerCase()); });
      return hit ? null : { field: path, expected: expectedOf(d), actual: actualOf(v) };
    }
    return null;
  }

  /**
   * 结构校验。
   *   `spec.type==='object'` 时逐 `spec.fields` 校验，`required:true` 的缺席即错；
   *   `spec.unknown` 为 `'reject'` 时，未声明字段也算错（默认 `'keep'`：本仓纪律
   *   「未知字段保留不执行」，故默认**不**因多字段而拒）。
   */
  function validate(spec, input) {
    _checks++;
    const out = { ok: false, reason: 'invalid-input', errors: [], checked: 0 };
    try {
      const sp = spec || {};
      if ((sp.type || 'object') !== 'object') {
        const e = fieldError(sp.field || 'value', sp, input);
        out.checked = 1;
        if (e) { out.errors.push(e); _rejected++; return out; }
        out.ok = true; out.value = input; _passed++; return out;
      }
      const fields = sp.fields || {};
      const keys = Object.keys(fields);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        const e = fieldError(k, fields[k], input && typeof input === 'object' ? input[k] : undefined);
        out.checked++;
        if (e) { out.errors.push(e); if (out.errors.length >= MAX_ERRORS) break; }
      }
      if (sp.unknown === 'reject' && input && typeof input === 'object' && out.errors.length < MAX_ERRORS) {
        Object.keys(input).forEach(function (k) {
          if (!Object.prototype.hasOwnProperty.call(fields, k)) {
            out.errors.push({ field: k, expected: '（未声明字段）', actual: actualOf(input[k]) });
          }
        });
      }
      // 跨字段：`sp.requireAny` 里任一组至少出现一个
      if (Array.isArray(sp.requireAny) && input && typeof input === 'object') {
        sp.requireAny.forEach(function (grp) {
          const g = Array.isArray(grp) ? grp : [grp];
          const hit = g.some(function (k) { return input[k] !== undefined && input[k] !== null && input[k] !== ''; });
          if (!hit && out.errors.length < MAX_ERRORS) {
            out.errors.push({ field: g.join('|'), expected: '至少其一（必填）', actual: '全缺' });
          }
        });
      }
      out.ok = out.errors.length === 0;
      if (out.ok) { out.value = input; _passed++; } else { _rejected++; out.first = out.errors[0]; }
      return out;
    } catch (e) {
      // 校验器自己炸了 —— 如实报成「校验未完成」，绝不假装通过
      _rejected++;
      out.errors = [{ field: '(validator)', expected: '可完成的校验', actual: String((e && e.message) || e).slice(0, 80) }];
      out.first = out.errors[0];
      out.reason = 'validator-threw';
      return out;
    }
  }

  /** 注册具名 schema（供多处复用；不注册也能直接 validate）。 */
  function define(name, spec) {
    const n = txt(name, 60);
    if (!n) return { ok: false, reason: 'missing-name' };
    REGISTRY[n] = { name: n, spec: spec || {}, at: clockWall() };
    return { ok: true, name: n };
  }
  function get(name) { const r = REGISTRY[txt(name, 60)]; return r ? r.spec : null; }
  /** 按名校验；未注册一律 `{ok:false, reason:'unknown-schema'}`（不静默按空 spec 放过）。 */
  function validateNamed(name, input) {
    const n = txt(name, 60);
    if (!REGISTRY[n]) return { ok: false, reason: 'unknown-schema', errors: [{ field: '(schema)', expected: '已注册的 schema 名', actual: n || '(空)' }], checked: 0 };
    return validate(REGISTRY[n].spec, input);
  }
  function list() { return Object.keys(REGISTRY).sort().map(function (k) { return { name: k, fields: Object.keys(REGISTRY[k].spec.fields || {}).length }; }); }
  function stat() { return { checks: _checks, passed: _passed, rejected: _rejected, registered: Object.keys(REGISTRY).length, maxErrors: MAX_ERRORS }; }
  function reset() { _checks = 0; _passed = 0; _rejected = 0; }

  /** 产物形态统一器：把一次校验结果折进调用方自己的返回体（避免各处自造摘要）。 */
  function attach(result, r) {
    const base = (result && typeof result === 'object') ? result : {};
    base.schemaOk = !!(r && r.ok);
    base.schemaErrors = (r && r.errors) ? r.errors.slice(0, 8) : [];
    return base;
  }

  WA.schema = {
    validate: validate, validateNamed: validateNamed, define: define, get: get,
    list: list, stat: stat, reset: reset, attach: attach,
    TYPES: TYPES.slice(), MAX_ERRORS: MAX_ERRORS
  };
})();