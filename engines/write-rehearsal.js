/**
 * WorldAxis engines/write-rehearsal.js (v2.531.0) — 写前预演：结构先过一遍，再决定落不落盘
 *
 * 缝合来源：story-oracle (github.com/namelessone88/story-oracle) 的「schema 预演式写入」
 *   —— 它把「先按 schema 演一遍、确认能落下，再真写」当成写入口的固定两步。
 *
 * 病（现场可查）：`core/schema.js` 自 v2.110.0 起实体在场（validate / validateNamed /
 *   define / list），产品面**零读者**（`grep -rn 'WA.schema' --include=*.js .` 只命中
 *   schema.js 自己）。结构校验只有测试在叫；真正的写入口（导入、面板补丁、结算回写）
 *   各自 `if (!Array.isArray(x))` 一遍，形态互不相同 —— 于是「字段名拼错」「数组写成对象」
 *   这类结构错一路往下走，在很深的地方炸开，或者更糟：安静地写进世界。
 *
 * 与既有模块的分工：`input-guard` 管值的形态、`schema` 管结构、`reject-code` 管归属；
 *   本模块**只管顺序**：把结构校验挪到「落盘之前」这一步，并且不碰存储。
 *
 * 判据（四条，缺一不可）：
 *   ① **预演不落盘**：`rehearse(plan, opts)` 只吃入参、只回结果 —— 不读 store、不写 store、
 *      不把世界状态缓存进模块（模块内只有计数器，与 inline-tags 的 stat 同款）；
 *   ② **拒收要带名字**：每条问题恒为四栏 `{path, code, expected, actual}`，`path` 用点号
 *      路径（`state.actors.0.name` 这种取法由调用方给，本模块只透传不猜）；
 *   ③ **未知 schema 名不猜**：给了 `opts.known` 而 schema 名不在其中 ⇒ 整单拒
 *      `unknown-schema`；没有 validator ⇒ 整单拒 `no-validator`（宁可拒，不许静默放行）；
 *   ④ **可复算**：同输入同输出 —— `rejected` 按 `path` 字典序稳定排序，`accepted` 保持
 *      入参原序；同一次预演跑两遍结果逐字相同。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const MAX_OPS = 64;
  const MAX_PATH_LEN = 96;
  const MAX_DEPTH = 8;
  const PATH_RE = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/;
  const counter = { calls: 0, ok: 0, rejected: 0, lastCode: '' };

  /** `{path, value}` / `['a.b', v]` → 统一形态；其余返回 null（不猜、不兜底）。 */
  function parseOp(op) {
    if (Array.isArray(op)) {
      if (op.length !== 2) return null;
      return { path: op[0], value: op[1] };
    }
    if (op && typeof op === 'object') {
      if (typeof op.path !== 'string') return null;
      return { path: op.path, value: op.value };
    }
    return null;
  }

  /** 路径只收点号形态的标识符串：空 / 超长 / 非标识符 / 过深一律不合格。 */
  function checkPath(p) {
    if (typeof p !== 'string') return 'bad-path';
    if (!p || p.length > MAX_PATH_LEN) return 'bad-path';
    if (!PATH_RE.test(p)) return 'bad-path';
    if (p.split('.').length > MAX_DEPTH) return 'bad-path';
    return '';
  }

  function four(path, code, expected, actual) {
    return { path: path, code: code, expected: expected, actual: actual };
  }

  /** 整单拒：只出一条问题（问题出在「这一单本身」，不在某条 op 上）。 */
  function wholeReject(code, expected, actual) {
    counter.rejected++;
    counter.lastCode = code;
    const one = four('', code, expected, actual);
    return { ok: false, dryRun: true, schema: '', ops: 0, accepted: [], rejected: [one], problems: [one] };
  }

  /**
   * 预演一单写入。
   * plan 形态：`{ schema:'actor', ops:[{path,value}, ...] }`
   *            或 `{ schema:'actor', path:'state.actor', value:{...} }`（单条）
   * opts：`{ validate:fn(name,value)->{ok,errors[]}, known:fn(name)->bool, maxOps }`
   */
  function rehearse(plan, opts) {
    counter.calls++;
    const o = opts && typeof opts === 'object' ? opts : {};
    if (!plan || typeof plan !== 'object') return wholeReject('bad-plan', '一个对象', String(plan));
    const schema = typeof plan.schema === 'string' ? plan.schema.trim() : '';
    if (!schema) return wholeReject('no-schema', 'schema 名', JSON.stringify(plan.schema === undefined ? null : plan.schema));

    const single = plan.ops === undefined && Object.prototype.hasOwnProperty.call(plan, 'value');
    let ops;
    if (single) {
      ops = [{ path: typeof plan.path === 'string' && plan.path.trim() ? plan.path.trim() : schema, value: plan.value }];
    } else {
      ops = Array.isArray(plan.ops) ? plan.ops : null;
    }
    if (!ops) return wholeReject('bad-ops', 'ops 数组', typeof plan.ops);
    if (!ops.length) return wholeReject('no-ops', '至少一条 op', '0');
    const maxOps = typeof o.maxOps === 'number' && o.maxOps > 0 ? Math.min(o.maxOps, MAX_OPS) : MAX_OPS;
    if (ops.length > maxOps) {
      return wholeReject('too-many-ops', '≤' + maxOps + ' 条', String(ops.length));   // 超限整单拒，不静默截断
    }

    const validate = typeof o.validate === 'function' ? o.validate : null;
    if (!validate) return wholeReject('no-validator', '一个 validate 函数', 'missing');
    const known = typeof o.known === 'function' ? o.known : null;
    if (known && !known(schema)) return wholeReject('unknown-schema', '已登记的 schema 名', schema);

    const accepted = [];
    const rejected = [];
    for (let i = 0; i < ops.length; i++) {
      const op = parseOp(ops[i]);
      if (!op) {
        rejected.push(four('#' + i, 'bad-op', '{path,value} 或 [path,value]', typeof ops[i]));
        continue;
      }
      const pErr = checkPath(op.path);
      if (pErr) {
        rejected.push(four(typeof op.path === 'string' ? op.path : '#' + i, pErr, 'a.b 形态路径（≤' + MAX_DEPTH + ' 段）', String(op.path)));
        continue;
      }
      let r;
      try {
        r = validate(schema, op.value);
      } catch (e) {
        r = { __threw: String((e && e.message) || e) };
      }
      if (r && r.__threw) {
        rejected.push(four(op.path, 'validator-threw', 'validate 不抛', r.__threw));
        continue;
      }
      if (!r || typeof r !== 'object') {
        rejected.push(four(op.path, 'bad-verdict', '{ok,errors[]} 形态', String(r)));
        continue;
      }
      if (r.ok === true) {
        accepted.push(op.path);
        continue;
      }
      const errs = Array.isArray(r.errors) ? r.errors : [];
      if (!errs.length) {
        // 拒了却不说原因 —— 本仓的拒收纪律要求「拒收要带名字」，所以这本身是一条问题。
        rejected.push(four(op.path, 'reject-without-name', 'errors[] 至少一条', ':none'));
        continue;
      }
      const head = errs[0] || {};
      const field = typeof head.field === 'string' ? head.field : '';
      rejected.push({
        path: field ? op.path + '.' + field : op.path,
        code: typeof head.code === 'string' && head.code ? head.code : 'schema-reject',
        expected: typeof head.expected === 'string' ? head.expected : '',
        actual: typeof head.actual === 'string' ? head.actual : String(head.actual),
        errors: errs.slice(0, 8)
      });
    }
    rejected.sort(function (x, y) { return x.path < y.path ? -1 : (x.path > y.path ? 1 : 0); });   // ④ 稳定可复算
    const ok = rejected.length === 0 && accepted.length > 0;
    if (ok) counter.ok++; else { counter.rejected++; counter.lastCode = rejected.length ? rejected[0].code : 'empty'; }
    return {
      ok: ok, dryRun: true, schema: schema, ops: ops.length,
      accepted: accepted, rejected: rejected, problems: rejected.slice()
    };
  }

  /** 只读读数（模块内存计数器，不是世界状态）。 */
  function stat() {
    return {
      calls: counter.calls, ok: counter.ok, rejected: counter.rejected,
      lastCode: counter.lastCode, maxOps: MAX_OPS, maxDepth: MAX_DEPTH
    };
  }

  WA.writeRehearsal = {
    rehearse: rehearse, parseOp: parseOp, checkPath: checkPath, stat: stat,
    MAX_OPS: MAX_OPS, MAX_PATH_LEN: MAX_PATH_LEN, MAX_DEPTH: MAX_DEPTH
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/write-rehearsal.js', { kind: 'engine', ver: '2.531.0' });
})();
