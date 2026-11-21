/**
 * WorldAxis engines/save-audit.js (v2.533.0) — 存档体检：只说话，不动手
 *
 * 缝合来源：story-oracle (github.com/namelessone88/story-oracle) 的「检查存档」机制 ——
 *   读档前先跑一遍体检，把「这份存档有什么问题」讲清楚，再决定读不读。
 *
 * 病（现场可查）：本仓有 `save-migrate`（它**改**存档：迁移旧版本、补默认值、丢坏字段），
 *   但没有一个「只报告、不改动」的口子。后果是每次读档出问题都只有两种回声：
 *   · 迁移器自己修好了 —— 于是「这份存档本来是坏的」这件事永久消失（谁也不知道有人丢过字段）；
 *   · 迁移器修不好 —— 抛一个来自很深处的异常，读档者拿不到「哪一层缺了什么」。
 *   换句话说：一个既负责诊断又负责治疗的器官，等于没有诊断。
 *
 * 判据（四条，缺一不可）：
 *   ① **只读不修**：不 mutate 入参、不补默认值、不迁移版本、不写 store。
 *      缺字段就报缺 —— 绝不「顺手填一个」，那会让体检报告与真实存档对不上；
 *   ② **缺 ≠ 坏**：缺必填键报 `missing`，类型不对报 `bad-type`，两者**分开**；
 *      而且缺的键**不再**报类型错（同一个病因只报一次，否则读数会虚高）；
 *   ③ **版本不猜**：版本号不在已知列表 ⇒ `unknown-version`，既不静默接受也不替它升级；
 *   ④ **可复算**：`problems` 按 `path` 字典序稳定排序，`counts` 现算（顶层键数 + 序列化长度），
 *      同输入同输出。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const MAX_PROBLEMS = 64;
  const counter = { calls: 0, ok: 0, rejected: 0, lastCode: '' };

  function typeOf(v) {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
  }

  function four(path, code, expected, actual) {
    return { path: path, code: code, expected: expected, actual: actual };
  }

  /**
   * 体检。
   * spec：`{ require:[键], forbid:[键], types:{键:类型名}, versionKey:'version', knownVersions:[...] }`
   * 返回：`{ ok, problems:[{path,code,expected,actual}], counts:{keys,bytes}, version }`
   */
  function audit(blob, spec) {
    counter.calls++;
    const s = spec && typeof spec === 'object' ? spec : {};
    const need = Array.isArray(s.require) ? s.require : [];
    const forbid = Array.isArray(s.forbid) ? s.forbid : [];
    const types = s.types && typeof s.types === 'object' ? s.types : {};
    const versionKey = typeof s.versionKey === 'string' && s.versionKey ? s.versionKey : '';
    const known = Array.isArray(s.knownVersions) ? s.knownVersions : null;

    if (!blob || typeof blob !== 'object' || Array.isArray(blob)) {
      counter.rejected++;
      counter.lastCode = 'bad-blob';
      const one = four('', 'bad-blob', '一个对象存档', typeOf(blob));
      return { ok: false, problems: [one], counts: { keys: 0, bytes: 0 }, version: null };
    }

    const has = function (k) { return Object.prototype.hasOwnProperty.call(blob, k); };
    const problems = [];
    // v2.553.0：**明细可截断，归因不可截断**。
    //   现场：一份缺 235 个键的旧档，problemCount=237，但 problems 被 MAX_PROBLEMS 截到 64 条，
    //   而 missing 是**先**推入的 ⇒ 排在后面的 bad-type / unknown-version 被整体挤出统计。
    //   后果：store.init 的载入体检会如实报「237 项」，却把归因读成「全是缺键」，
    //   于是「版本未知」这个最需要人看一眼的结论**在读数里消失**——正是本仓反复治的那种失真。
    //   故：codeCounts 在全量上计，problems 仍按上限截断（明细是给人看的，统计是给判据用的）。
    const codeCounts = {};
    // 注意：这里的 problems.push 是**唯一**一处直接推入（包装器自己必须直推，
    //   否则会变成自递归——本批第一次批量替换时真踩到了，锁里因此有一条 N 段钉它）。
    const push = function (p) { const c = String(p.code || 'unknown'); codeCounts[c] = (codeCounts[c] || 0) + 1; problems.push(p); };
    const missingSet = {};   // ② 同一个病因只报一次：这里记下「已按 missing 报过」的键

    // ② 缺必填键 ⇒ missing（缺的键此后不再报类型）
    need.forEach(function (k) {
      if (!has(k)) { missingSet[String(k)] = 1; push(four(String(k), 'missing', '必填顶层键', 'absent')); }
    });

    // ② 类型面：只查「在的键」，缺的已由 missing 说过一遍
    Object.keys(types).forEach(function (k) {
      if (!has(k)) return;
      const want = String(types[k]);
      const got = typeOf(blob[k]);
      if (want !== got) push(four(k, 'bad-type', want, got));
    });

    // 禁用键：存在即说明存档来自别处（不猜它为什么在）
    forbid.forEach(function (k) {
      if (has(k)) push(four(String(k), 'forbidden', '不含该键', 'present'));
    });

    // ③ 版本不猜
    let version = null;
    if (versionKey) {
      if (!has(versionKey)) {
        // 版本键若已在 require 面报过 missing，就不再报第二条（缺 ≠ 坏，也不许一病两报）
        if (!missingSet[versionKey]) push(four(versionKey, 'missing-version', '带版本号', 'absent'));
      } else {
        version = blob[versionKey];
        if (known && known.indexOf(version) < 0) {
          push(four(versionKey, 'unknown-version', known.join('|'), String(version)));
        }
      }
    }

    // ④ 现算读数
    const keys = Object.keys(blob);
    let bytes = 0;
    try {
      bytes = JSON.stringify(blob).length;
    } catch (e) {
      bytes = -1;
      push(four('', 'unserializable', '可序列化', String((e && e.message) || e)));
    }

    problems.sort(function (a, b) { return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0); });
    const capped = problems.length > MAX_PROBLEMS ? problems.slice(0, MAX_PROBLEMS) : problems;
    const ok = problems.length === 0;
    if (ok) counter.ok++;
    else { counter.rejected++; counter.lastCode = problems[0].code; }
    return {
      ok: ok,
      problems: capped,
      problemCount: problems.length,
      // v2.553.0：全量归因（与 problemCount 恒等：各码计数之和 === problemCount）
      codeCounts: codeCounts,
      truncated: problems.length > capped.length,
      counts: { keys: keys.length, bytes: bytes },
      version: version
    };
  }

  /** 只读读数（面板 / 诊断面）：体检跑过几次、最近一次的结论码。 */
  function stat() {
    return { calls: counter.calls, ok: counter.ok, rejected: counter.rejected, lastCode: counter.lastCode, maxProblems: MAX_PROBLEMS };
  }

  WA.saveAudit = { audit: audit, stat: stat, typeOf: typeOf, MAX_PROBLEMS: MAX_PROBLEMS };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/save-audit.js', { kind: 'engine', ver: '2.533.0' });
})();