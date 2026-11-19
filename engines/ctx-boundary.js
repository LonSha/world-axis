/**
 * WorldAxis engines/ctx-boundary.js (v2.530.0) — 上下文边界剔除：把「写给人看的块」从回卷文本里剥掉
 *
 * 缝合来源：酒馆脚本「工作流助手」（contextBoundary / stripInjectedBlocks / boundaryRules）。
 *
 * 病：世界后台会把「后台推演 / 系统指令 / 幕后摘要」包成带起止标记的块塞进注入文本。
 *   这些块一旦被回卷（历史重读、存档导出、再喂回模型），就会被当成**正文**再读一遍：
 *   模型据此把幕后当成已发生、把指令当成剧情，而产品面没有任何出口能说「这段不该在这儿」。
 *   三个方向都错：该剥的不剥（越滚越长，还污染关键词匹配）、半截的也剥（把用户正文吃掉了）、
 *   剥完行号变了（楼层映射错位，读回时对不上原楼层）。
 *
 * 判据（四条，缺一不可）：
 *   ① **只有配对的块才剥**：找不到收尾标记的一律原样保留，并在 `unmatched` 里点名位置
 *      （半截块剥掉等于吃掉正文 —— 比不剥坏得多）；
 *   ② **行数守恒**：剥掉的内容换成等量换行，剥前剥后 `\n` 个数逐个相等（楼层 / 行号映射不变）；
 *   ③ **幂等**：`scrub(scrub(x))` 与 `scrub(x)` 逐字相等（重复回卷不会逐步蚕食）；
 *   ④ **坏规则不猜**：起止为空、起止相同、超长一律进 `rejected`，不参与剥离也不静默忽略。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const MAX_MARK_LEN = 32;
  const DEFAULTS = { maxMarkLen: MAX_MARK_LEN };

  /** 规则三种写法：`'name|open|close'` / `{name, open, close}` / `[name, open, close]`。非法返回 null。 */
  function parseRule(x) {
    let name = '', open = null, close = null;
    if (typeof x === 'string') {
      const p = x.split('|');
      if (p.length !== 3) return null;
      name = p[0].trim(); open = p[1]; close = p[2];
    } else if (Array.isArray(x)) {
      if (x.length !== 3) return null;
      name = String(x[0] || '').trim(); open = x[1]; close = x[2];
    } else if (x && typeof x === 'object') {
      name = String(x.name || '').trim(); open = x.open; close = x.close;
    } else {
      return null;
    }
    if (typeof open !== 'string' || typeof close !== 'string') return null;
    if (!open || !close) return null;                       // 空标记会匹配任意位置 —— 不猜
    if (open === close) return null;                        // 起止相同则「配对」无意义
    if (open.length > MAX_MARK_LEN || close.length > MAX_MARK_LEN) return null;
    return { name: name || open, open: open, close: close };
  }

  /** 一段被剥掉的文本换算成等量换行（判据②：剥前剥后 `\n` 逐个相等）。 */
  function blankLines(s) {
    const n = s.split('\n').length - 1;
    return n > 0 ? new Array(n + 1).join('\n') : '';
  }

  /**
   * 剥离。返回 {text, removed, charsSaved, lines[], unmatched[], matchedRules[], rejected[]}
   *   removed     —— 剥掉几块（可复算）
   *   charsSaved  —— 净省下的字符数（块长 - 换行占位，正是判据②的代价）
   *   lines       —— [剥前行数, 剥后行数]（必须相等，否则判据②破了）
   *   unmatched   —— 有起无收的块：{rule, at}
   *   rejected    —— 坏规则：原样回吐，不参与剥离
   * 文本入参非串时按空串处理（调用方拿到的是空文本，不是异常）。
   */
  function scrub(text, rules) {
    let cur = typeof text === 'string' ? text : '';
    const before = cur.split('\n').length;
    const out = {
      removed: 0, charsSaved: 0, lines: [before, before],
      unmatched: [], matchedRules: [], rejected: []
    };
    // 单条规则也收（只收不猜：非法的那一条会进 rejected，而不是被当成「没给规则」静默跳过）
    const list = rules === undefined || rules === null ? [] : (Array.isArray(rules) ? rules : [rules]);
    list.forEach(function (x) {
      const R = parseRule(x);
      if (!R) { out.rejected.push(typeof x === 'string' ? x.slice(0, MAX_MARK_LEN) : String(x)); return; }
      let res = '', i = 0, touched = false;
      while (i < cur.length) {
        const at = cur.indexOf(R.open, i);
        if (at < 0) { res += cur.slice(i); break; }
        const end = cur.indexOf(R.close, at + R.open.length);
        if (end < 0) {
          // 判据①：有起无收 —— 原样留着，但必须点名（静默跳过＝以后没人知道这里漏了）
          out.unmatched.push({ rule: R.name, at: at });
          res += cur.slice(i);
          break;
        }
        const block = cur.slice(at, end + R.close.length);
        const blank = blankLines(block);
        res += cur.slice(i, at) + blank;
        out.removed++;
        out.charsSaved += block.length - blank.length;
        i = end + R.close.length;
        touched = true;
      }
      if (touched) out.matchedRules.push(R.name);
      cur = res;
    });
    out.text = cur;
    out.lines = [before, cur.split('\n').length];
    return out;
  }

  /** 只读读数：这套规则能剥什么（给诊断/设置页用）。不碰文本。 */
  function stat(rules) {
    const ok = [], bad = [];
    (Array.isArray(rules) ? rules : []).forEach(function (x) {
      const R = parseRule(x);
      if (R) ok.push({ name: R.name, open: R.open, close: R.close });
      else bad.push(typeof x === 'string' ? x.slice(0, MAX_MARK_LEN) : String(x));
    });
    return { valid: ok, rejected: bad, count: ok.length };
  }

  WA.ctxBoundary = {
    parseRule: parseRule, scrub: scrub, stat: stat, blankLines: blankLines,
    DEFAULTS: Object.assign({}, DEFAULTS)
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/ctx-boundary.js', { kind: 'engine', ver: '2.530.0' });
})();