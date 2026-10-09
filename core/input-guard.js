/**
 * WorldAxis core/input-guard.js (v2.84.0)
 * 统一输入边界层：**所有**来自外部的值（模型输出、导入文件、UI 输入、兼容层）在进入
 * 世界状态之前，都必须先过这里。
 *
 * 为什么需要它（两族都是实测出来的，不是"想当然该防"）：
 *
 *   ① 字符串化兜底把非法值**静默升格**。
 *      约 28 个引擎各写了一份同款 `clean(v, max) = String(v == null ? '' : v).replace(...)`，
 *      于是 NaN 被升格成字面量 `'NaN'`、对象被升格成 `'[object Object]'`：
 *      实测 `survival.set('甲', NaN)` 建出一条全 null 的读数记录并报 ok；
 *      `temporalLock.lock(NaN)` 上锁成功且 label='NaN'；`threads.open(NaN)` 立出一桩
 *      名叫「NaN」的悬案。一次「参数传错」被记成了「世界里真发生了这件事」。
 *
 *   ② 同一段兜底对**带敌意 toString 的对象**直接抛。
 *      `String({toString(){throw ...}})` 会抛出，而调用它的多是扫描 localStorage 的巡检路径
 *      （sweep 垃圾回收 / 体积审计 / 孤儿盘点）——一个抛会打断**整轮巡检**，
 *      于是「巡检没查出问题」与「巡检没跑完」在读数上完全不可分。
 *
 * 设计边界（三条）：
 *   1 **不抛**：任何输入都返回结果对象/兜底值。本模块是巡检路径的安全网，
 *     它自己抛一次，安全网就变成了新的断点。
 *   2 **不作主**：不猜意图。NaN 不会被当成 0、对象不会被 JSON 化——
 *     非法就是非法，返回空值交给调用方按既有 `missing-fields` 一类码拒收。
 *   3 **单一真源**：形态判定只写在这里；各引擎不再自备一份 `String(...)` 兜底。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  /**
   * 安全取文本。非法值一律给空串（**绝不**产出 'NaN' / '[object Object]'）。
   * @param {*} v 任意值
   * @param {number} [max] 截断长度
   * @returns {string} 合法文本或 ''
   */
  function text(v, max) {
    const s = rawText(v);
    const t = s.replace(/\s+/g, ' ').trim();
    return max ? t.slice(0, max) : t;
  }
  /** 只做「取出字符串」，不做空白归一（归一后的形态由 text 负责）。 */
  function rawText(v) {
    if (v == null) return '';
    const tp = typeof v;
    if (tp === 'string') return v;
    // 数字/布尔是**合法**输入（调用方常传 count/flag），但只接受有限数：
    //   NaN 与 ±Infinity 不是「世界的属性」，它们升格成字面量就会污染状态。
    if (tp === 'number') return isFinite(v) ? String(v) : '';
    if (tp === 'boolean') return v ? 'true' : 'false';
    // 对象/数组/函数：**不做**隐式字符串化（那是升格的来源，也是抛的来源）。
    return '';
  }
  /** 有限数或兜底。NaN/±Infinity/不可转换一律回落到 fallback。 */
  function num(v, fallback) {
    const n = typeof v === 'number' ? v : Number(rawText(v));
    return isFinite(n) ? n : (isFinite(Number(fallback)) ? Number(fallback) : 0);
  }
  /** 非负整数或 0（用于计数、序号一类）。 */
  function count(v, fallback) {
    const n = num(v, 0);
    return Math.max(0, Math.floor(n));
  }
  /** 值是否落在给定枚举里（大小写不敏感，两侧归一）。 */
  function oneOf(v, list, fallback) {
    const s = text(v, 40).toLowerCase();
    const arr = Array.isArray(list) ? list : [];
    for (let i = 0; i < arr.length; i++) {
      if (text(arr[i], 40).toLowerCase() === s && s) return arr[i];
    }
    return fallback === undefined ? '' : fallback;
  }
  /** 是否是「可用的标识符」：非空、有限、且不含控制字符。 */
  // isId 曾作为导出面的一员，但**外部零引用**（只有本文件的 check 路径用得上）——
  //   按本仓库纪律「导出即有承诺」，没有消费方的口不该挂在导出面上（dead-export-gate 会判 self-only）。
  //   保留为内部函数：将来真出现消费方时再显式提升为导出，届时门禁会要求它就是一次有意的承诺。
  function isId(v) {
    const s = text(v, 120);
    if (!s) return false;
    return !/[\u0000-\u001f\u007f]/.test(s);
  }
  /**
   * 体检：给调用方一个**可读的拒收依据**，而不是让它自己猜「为什么空了」。
   * @returns {{ok:boolean, value:string, reason:string}}
   */
  function check(v, max) {
    const s = text(v, max);
    if (s) return { ok: true, value: s, reason: '' };
    if (v == null) return { ok: false, value: '', reason: 'missing' };
    const tp = typeof v;
    if (tp === 'number') return { ok: false, value: '', reason: 'non-finite' };
    if (tp === 'string') return { ok: false, value: '', reason: 'blank' };
    return { ok: false, value: '', reason: 'not-a-string' };
  }
  /**
   * 结构体检：数组 → 逐项文本 + 去空 + 上限；非法容器给空数组。
   * 用于 persons/keys 一类的列表入参（原实现散落各处 `persons.map(clean).filter(Boolean)`）。
   */
  function list(v, max, eachMax) {
    if (!Array.isArray(v)) return [];
    const out = [];
    for (let i = 0; i < v.length; i++) {
      const s = text(v[i], eachMax || 40);
      if (s && out.indexOf(s) < 0) out.push(s);
      if (max && out.length >= max) break;
    }
    return out;
  }

  // 导出面只留**有消费方**的口（消费方见括号）：
  //   text   —— 39 个引擎的统一兜底（各 clean 都委托到它）
  //   num    —— karma.record 的金额
  //   count  —— hazard.bump 的计数
  //   oneOf  —— karma.record 的枚举归一
  //   check  —— tool-import.detect 的入界文本体检
  //   list   —— parallel-events.add 的人员列表
  // rawText / isId 保持**内部函数**：它们是这两个分工里的实现细节，外部零引用。
  WA.inputGuard = { text: text, num: num, count: count,
    oneOf: oneOf, check: check, list: list };
  WA.__inputGuardInternal = { rawText: rawText, isId: isId };   // 供专锁直接测内核，不进接口承诺
})();
