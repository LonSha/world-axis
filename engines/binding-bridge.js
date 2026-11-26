/**
 * WorldAxis engines/binding-bridge.js (v2.600.0) — 配置绑定的遮蔽表（BND-1）
 *
 * ── 它治什么（缺口）────────────────────────────────────────
 *   `engines/binding.js`（v2.130.0，145 行）把配置做成了「聊天 > 角色 > 默认」三级绑定，
 *   `read(key)` 会带回 `from` 说明是谁给的。可它**没有产品读者**：面板上没有任何一处告诉你
 *   「我在角色层改了那条规则，为什么没生效」—— 因为聊天层有一条同名键**把它遮住了**，
 *   而这件事只能靠人记得自己绑过什么。
 *   这正是本仓反复出现的病：**数据在，解释不在**。读值得靠一层遮蔽才能解释，
 *   而遮蔽关系从来没被任何读数说出来过。
 *
 * ── 本模块只做三件事，每件一个硬条件 ────────────────────────
 *   ① `layers()` —— 逐层列出**键名**与条数（不列值）；
 *   ② `shadow()` —— 同一键在多层都有值时，指出**谁赢、谁被遮住**；
 *   ③ `audit()` / `lineOf()` —— 一行读数。
 *
 * ── 边界（全是否定式）────────────────────────────────
 *   1 **只报键名，不报值**。绑定里可能存着接口地址、提示词片段这类东西；
 *      本面要回答的是“哪层被遮住了”，不是“值是什么”。值一个字都不进返回值。
 *   2 **零写**：不 bind / 不 unbind / 不 transact。想改请去面板。
 *   3 **优先级取自引擎的 SCOPES**，不自带一份；并检测它与 `read` 的走向是否一致
 *      （`SCOPES` 若不是 `chat,char,default` 就报 `scope-drift`，不挑一个用）。
 *   4 **开关关着时不分层**：`binding.getSettings().enabled === false` 时，`read` 只读默认层，
 *      所以“遮蔽”这个概念此刻不成立 —— 本面此时**不报遮蔽**，并在读数里写明
 *      「开关关着，分层优先级不生效」（这比报一堆“被遮住”更接近真相）。
 *   5 **读不到就说读不到**：store 里没有 `binding` 桶 ⇒ `empty`；store 不在 ⇒ `no-store`。
 *      两者都不是“没有遮蔽”，而是“没有可解释的东西”。
 *   6 **读数只一个出口**：`lineOf`。
 *
 * ── why 五值（封闭表）────────────────────────────────
 *   `ok` / `module-missing` / `no-store` / `empty` / `scope-drift`。
 */

(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

  const VERSION = '2.600.0';
  const ORDER = ['chat', 'char', 'default'];
  const WHY = ['ok', 'module-missing', 'no-store', 'empty', 'scope-drift'];
  let _stat = { audits: 0, shadows: 0, last: null };

  function clean(v, max) {
    try { return WA.inputGuard ? WA.inputGuard.text(v, max || 60) : String(v == null ? '' : v).slice(0, max || 60); }
    catch (e) { return String(v == null ? '' : v).slice(0, max || 60); }
  }
  function engine() {
    const B = WA.binding;
    return (B && Array.isArray(B.SCOPES) && typeof B.list === 'function') ? B : null;
  }
  function store() {
    try { return (WA.store && typeof WA.store.get === 'function') ? (WA.store.get() || null) : null; }
    catch (e) { return null; }
  }

  /** 引擎的三层顺序是否与 read 的走向一致（chat > char > default）。 */
  function driftOf(B) {
    return B.SCOPES.join(',') !== ORDER.join(',');
  }

  /** 逐层列键名（**不含值**）。 */
  function layers() {
    const B = engine();
    const out = { ok: false, why: 'module-missing', rows: [], total: 0, drift: null, enabled: null };
    if (!B) return out;
    let cfg = null;
    try { cfg = (typeof B.getSettings === 'function') ? B.getSettings() : null; } catch (e) { cfg = null; }
    out.enabled = !!(cfg && cfg.enabled === true);
    out.drift = driftOf(B);
    ORDER.forEach(function (sc) {
      let arr = [];
      try { arr = B.list(sc) || []; } catch (e) { arr = []; }
      out.rows.push({ scope: sc, count: arr.length, keys: arr.map(function (r) { return clean(r && r.key, 60); }) });
    });
    out.total = out.rows.reduce(function (n, r) { return n + r.count; }, 0);
    out.ok = true; out.why = 'ok';
    return out;
  }

  /**
   * 遮蔽表：同一键在多层都有值 ⇒ 只列“谁赢、谁被遮”。
   *   键集是三层键名的并集（排序后逐键判），所以输出稳定可比。
   */
  function shadow() {
    const B = engine();
    const out = { ok: false, why: 'module-missing', rows: [], keys: 0, shadowed: 0, enabled: null };
    if (!B) return out;
    const L = layers();
    out.enabled = L.enabled;
    const all = {};
    L.rows.forEach(function (r) {
      r.keys.forEach(function (k) { if (k) all[k] = true; });
    });
    const keys = Object.keys(all).sort();
    out.keys = keys.length;
    keys.forEach(function (k) {
      const inLayers = [];
      L.rows.forEach(function (r) { if (r.keys.indexOf(k) >= 0) inLayers.push(r.scope); });
      if (inLayers.length < 2) return;
      const winner = inLayers[0];                 // 顺序即优先级（chat > char > default）
      out.rows.push({ key: k, in: inLayers.slice(), winner: winner,
        hidden: inLayers.slice(1), effective: L.enabled });
    });
    out.shadowed = out.rows.length;
    out.ok = true; out.why = 'ok';
    return out;
  }

  /** 体检：把三层与遮蔽合一份结论。 */
  function audit(opts) {
    const B = engine();
    if (!B) return { ok: false, version: VERSION, why: 'module-missing', layers: null, shadow: null,
      verdict: { total: 0, keys: 0, shadowed: 0, enabled: false, drift: null } };
    if (!store()) return { ok: false, version: VERSION, why: 'no-store', layers: null, shadow: null,
      verdict: { total: 0, keys: 0, shadowed: 0, enabled: false, drift: null } };
    const L = layers();
    const S = shadow();
    const verdict = { total: L.total, keys: S.keys, shadowed: S.shadowed,
      enabled: L.enabled, drift: L.drift,
      counts: L.rows.map(function (r) { return r.scope + ':' + r.count; }).join(' ') };
    let why = 'ok';
    if (L.drift === true) why = 'scope-drift';
    else if (L.total === 0) why = 'empty';
    _stat.audits++;
    _stat.last = { why: why, total: L.total, shadowed: S.shadowed, enabled: L.enabled };
    void opts;
    return { ok: why === 'ok', version: VERSION, why: why, layers: L, shadow: S, verdict: verdict };
  }

  /** 单键视图：这个键在几层有值、谁生效、有没有被遮。 */
  function view(key) {
    const nm = clean(key, 60);
    const S = shadow();
    const row = S.rows.filter(function (r) { return r.key === nm; })[0];
    _stat.shadows++;
    if (!row) {
      const L = layers();
      const hit = L.rows.filter(function (r) { return r.keys.indexOf(nm) >= 0; })[0];
      if (!nm) return { ok: false, why: 'unknown-key', key: nm, line: '键名是空的' };
      if (!hit) return { ok: false, why: 'unknown-key', key: nm, line: '键 ' + nm + ' 三层都没有绑定' };
      return { ok: true, why: 'single', key: nm, row: null,
        line: '键 ' + nm + ' 只在 ' + hit.scope + ' 一层有值 —— 没有遮蔽' };
    }
    const how = row.effective
      ? '生效的是 ' + row.winner + ' 层，' + row.hidden.join(' 与 ') + ' 层的同名值被遮住'
      : '开关关着，此时只读默认层（分层优先级不生效）';
    return { ok: true, why: 'shadowed', key: nm, row: row, line: '键 ' + nm + ' 在 ' + row.in.join('/') + ' 三层都有值 —— ' + how };
  }

  function whyText(why) {
    const w = clean(why, 32);
    if (w === 'ok') return '可读';
    if (w === 'module-missing') return 'binding 不在装载面';
    if (w === 'no-store') return 'store 读不到';
    if (w === 'empty') return '三层都没有绑定';
    if (w === 'scope-drift') return '三层顺序与 read 的走向不一致';
    return '未登记：' + w;
  }

  /** 读数**唯一出口**。只写键数与层名，不写任何值。 */
  function lineOf(a) {
    if (!a) return '绑定面：没有体检结果';
    const v = a.verdict || {};
    if (a.why === 'module-missing') return '绑定面：binding 不在装载面 —— 分层绑定读不到，本读数不可用';
    if (a.why === 'no-store') return '绑定面：store 读不到 —— 不是“没有绑定”，是量不了';
    if (a.why === 'scope-drift') return '绑定面：引擎的三层顺序与 read 的走向不一致 —— 同一件事两套顺序，先对齐再谈遮蔽';
    if (a.why === 'empty') return '绑定面：三层都没有绑定（' + (v.counts || '') + '）—— 这是“真的没有”，不是读不到';
    const head = '绑定面：' + (v.counts || '') + ' · 共 ' + v.keys + ' 键 · 被遮住的 ' + v.shadowed + ' 键';
    if (!v.enabled) return head + '；开关关着 —— 此时只读默认层，分层优先级不生效（所以“被遮”此刻不算数）';
    if (!v.shadowed) return head + ' —— 没有同键多层，配置来源就是它自己那层';
    const first = (a.shadow && a.shadow.rows[0]) || null;
    return head + (first ? '（如 ' + first.key + '：' + first.winner + ' 遮盖 ' + first.hidden.join('/') + '）' : '')
      + '；被遮住的那层改了不会生效 —— 这正是“我明明改了”的由来';
  }

  function summaryText(a) {
    const l = lineOf(a || audit({}));
    return l || ('绑定面：' + whyText(a && a.why));
  }

  function diagnose(opts) {
    const a = audit(opts);
    const out = [lineOf(a)];
    if (a.layers) a.layers.rows.forEach(function (r) { out.push('· ' + r.scope + ' 层：' + r.count + ' 键'); });
    if (a.shadow) a.shadow.rows.slice(0, 8).forEach(function (r) {
      out.push('· 遮蔽 ' + r.key + '：' + r.in.join(' > ') + '（生效 ' + r.winner + '，被遮 ' + r.hidden.join('/') + '）');
    });
    return { ok: a.ok, why: a.why, lines: out, verdict: a.verdict };
  }

  function stat() {
    return { version: VERSION, audits: _stat.audits, shadows: _stat.shadows, last: _stat.last ? Object.assign({}, _stat.last) : null };
  }
  function __reset() { _stat = { audits: 0, shadows: 0, last: null }; return true; }

  WA.bindingBridge = {
    version: VERSION,
    ORDER: ORDER.slice(),
    WHY: WHY.slice(),
    layers: layers,
    shadow: shadow,
    view: view,
    audit: audit,
    lineOf: lineOf,
    summaryText: summaryText,
    diagnose: diagnose,
    whyText: whyText,
    stat: stat,
    __reset: __reset
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/binding-bridge.js', { kind: 'engine', ver: VERSION });
})();
