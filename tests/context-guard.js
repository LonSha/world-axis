// WorldAxis tests/context-guard.js (v2.84.0) — 测试上下文隔离（宿主面跨块泄漏）
//
// 缺口（它治什么）：
//   tests/run.js 是一个**单进程顺序脚本**：约 60 个 section 共享同一个 `global`，
//   而若干 section 会重装产品模块、装载 UI 层（tests/ui-gate-sync.js 的 fresh()）、
//   写入自己的 localStorage 夹具。这些写入**从不回收**，于是后面的 section 看到的
//   宿主面取决于「前面谁跑过」——这正是一条只在无人显式观测时才增长的静默面。
//
// 实测（v2.84.0 探针 /tmp/_probe_ctx.js，只读量测四个 section 的宿主面差值）：
//   causal-v2620.js   : WA 命名空间 +9（ui / uiSettings / assistant + mini-DOM 六个内部名）
//                       、window 监听器条数变化
//   world-v2630.js    : window 监听器条数变化
//   style-craft-v2510.js : window 监听器条数变化
//   evict-meta-v2610.js  : localStorage +2（worldaxis_error_log_test_chat_001
//                       、worldaxis_event_log_test_chat_001）、枚举序变化、监听器条数变化
//   即：4/4 个 section 都留下了痕迹，其中「产品命名空间被永久留下」与「storage 键被永久留下」
//   是**可判定的错**——fresh() 存在的意义是「每个用例一个独立上下文」，它却把上下文留在了外面。
//   最直接的后果：export 面口径里 `OPTIONAL = ['ui','uiSettings','assistant']` 的
//   「UI 未装载」前提，在 causal-v2620 之后的任何 section 里**已经不成立**。
//
// 两条纪律：
//   ① 只回收**本 section 新增**的东西（差值口径），不重置整块宿主面——
//      run.js 里存在被注释明确记录的跨块夹具（如靠前 section 把 mockCtx.chat 换成别的形状
//      「且不还原」，ui-gate 依赖该事实并自行复位）。把宿主整体复位会打断它们。
//   ② 回收面**收窄到 UI 装载面**，且理由来自实测而不是口味：
//      首版曾把「本 section 新增的全部 storage 键」也一并回收，实测（r5）直接把 4 个用例
//      打破：观测切片生成 / 突发事件生成 / 突发事件激活(3轮) / 当前轮小纸条 ——
//      它们复用前面 section 已写下的 `worldaxis_state_test_chat_001` / `worldaxis_writer_id`
//      / `worldaxis_api_channels_v1`。也就是说 run.js 的 storage 夹具是**跨 section 共享的
//      既成事实**，不是泄漏；把「共享」当「脏」回收，等于用判据去改被测行为。
//      故：
//        硬回收（UI 装载面）：ui / uiSettings / assistant 三个命名空间，mini-DOM 内部 `__*` 名，
//          以及这三个命名空间内部新增的成员。**这一面才是可判定的错**——
//          tests/export-contract.js 的 `OPTIONAL = ['ui','uiSettings','assistant']` 之所以成立，
//          靠的正是「无头环境不装载 UI」；fresh() 把它们留在共享 global 上，前提就没了。
//        只报告（不回退）：storage 键、枚举序、其他 WA 命名空间与成员的增删、全局顶层新增键、
//          window 监听器条数、script 元素数。它们里既有真泄漏也有设计使然，不做自动回退。
'use strict';

// 硬回收面（UI 装载面）：ui / uiSettings / assistant 三个命名空间，以及 mini-DOM 留下的**对象壳**
//   （`__uiDoc` / `__uiWin` / `__qsa` … 这种值本身是对象/函数、且名字以 `__` 开头的）。
//   为什么把 `__` 面收得这么窄：实测（r6 全量）首版用 `/^__/` 一把抓，结果把两样**不属于 UI 装载**的
//   东西也算成硬痕迹并企图回收：
//     · `__settingsRegs`：产品模块注册表（所有模块无条件向它追加），它在装载期就该存在；
//     · `__loaderState`：index.js 的 loadScript 状态壳（本版某个 section 新建的）。
//   判断标准因此写成「**值形状**」而不是「名字前缀」：mini-DOM 的壳是对象/函数，而注册表是数组。
//   但即便如此仍不够——**本 block 新增**的名字一律不回收（见下方 fileLocal 规则），
//   因为「谁新增谁负责」这句在共享宿主上并不总成立（数组注册表就是反例）。
const UI_FACE_NS = ['ui', 'uiSettings', 'assistant'];
const isUiFaceNs = function (ns) {
  if (UI_FACE_NS.indexOf(ns) >= 0) return true;
  if (!/^__/.test(ns)) return false;
  let v; try { v = global.WorldAxis[ns]; } catch (e) { return false; }
  return !!v && (typeof v === 'object' || typeof v === 'function') && !Array.isArray(v);
};
const isUiFaceMemberNs = function (ns) { return UI_FACE_NS.indexOf(ns) >= 0; };
/** 产品文件在装载期**自己定义**的成员名（含 `WA.__settingsRegs = …` 这类内部壳）。
 *  它们不是任何 section 的泄漏：装载时没有它们，装载后才有，差值口径会把它算到
 *  「触发装载的那一节」头上。故先按源码算一份白名单，硬面判定时排除。
 *  （实测 r6：不排除会让首版 `/^__/` 判据把 __settingsRegs / __loaderState 当成要回收的东西。） */
const PRODUCT_DEFINED = (function () {
  const out = {};
  try {
    const fs = require('fs'), path = require('path');
    const BASE = path.join(__dirname, '..');
    require('./product-files.js').productFiles(BASE).forEach(function (rel) {
      const src = require('./test-surface-gate.js').stripComments(fs.readFileSync(path.join(BASE, rel), 'utf8'));
      const re = /(?:^|[^.\w])WA\s*\.\s*([A-Za-z_$][\w$]*)\s*=/g;
      let m;
      while ((m = re.exec(src)) !== null) { if (!/^__/.test(m[1])) continue; out[m[1]] = rel; }
    });
  } catch (e) { /* 拿不到白名单时不影响主判据：白名单只用于**排除**，取不到就退化为不排除 */ }
  return out;
})();

/** localStorage 枚举序（浏览器语义：key(i) 按插入序；mock 用 KEY_ORDER 复刻） */
function keyOrder() {
  const out = [];
  try {
    for (let i = 0; ; i++) {
      const k = global.localStorage.key(i);
      if (!k) break;
      out.push(k);
    }
  } catch (e) { return ['<unavailable>']; }
  return out;
}
function lsKeys() {
  try {
    const d = global.localStorage._dump ? global.localStorage._dump() : {};
    return Object.keys(d).sort();
  } catch (e) { return []; }
}
function handlerCounts() {
  const h = global.__winHandlers || {};
  const out = {};
  Object.keys(h).sort().forEach(function (k) { out[k] = Array.isArray(h[k]) ? h[k].length : 0; });
  return out;
}
/** WorldAxis 面：命名空间 → 成员名单（逐名，用于回收新增成员而不是整表重建） */
function waFace() {
  const WA = global.WorldAxis;
  const out = {};
  if (!WA) return out;
  Object.keys(WA).forEach(function (ns) {
    let v;
    try { v = WA[ns]; } catch (e) { return; }
    if (v && (typeof v === 'object' || typeof v === 'function')) {
      let ks = [];
      try { ks = Object.keys(v); } catch (e) { ks = []; }
      out[ns] = ks.sort();
    } else {
      out[ns] = [];   // 标量成员：只登记存在性
    }
  });
  return out;
}

/** 宿主面快照。廉价（全枚举 + 计数），section 边界调用频率下无压力。 */
function snap() {
  const wh = handlerCounts();
  return {
    at: Date.now(),
    globalKeys: Object.keys(global).sort(),
    wa: waFace(),
    ls: lsKeys(),
    order: keyOrder(),
    handlers: wh,
    handlerTotal: Object.keys(wh).reduce(function (a, k) { return a + wh[k]; }, 0),
    scripts: (global.__scriptEls || []).length
  };
}

/** 快照差值。判定与报告共用同一份判据（避免「门禁一套、日志另一套」）。 */
function diff(a, b) {
  const waAddedNs = [], waAddedMembers = [];
  Object.keys(b.wa).forEach(function (ns) {
    if (!(ns in a.wa)) {
      // v2.84.0：新增命名空间的**内部成员也要登记**。
      //   首版这里直接 return，于是「成员」读数对整块新增的命名空间是瞎的 ——
      //   而负控制 A 打的正是这个形状（`WA.ui = {…}` + `WA.ui.leakMember`），
      //   实测 rec.waMembers 恒为空、断言无从成立。回收动作本来就是「整个 ns 一起删」，
      //   登记它的成员不会改变回收行为，只是让读数与动作同宽。
      waAddedNs.push(ns);
      b.wa[ns].forEach(function (m) { waAddedMembers.push(ns + '.' + m); });
      return;
    }
    b.wa[ns].forEach(function (m) { if (a.wa[ns].indexOf(m) < 0) waAddedMembers.push(ns + '.' + m); });
  });
  const waGoneNs = Object.keys(a.wa).filter(function (ns) { return !(ns in b.wa); });
  // **硬/软面在此刻算定，且只算这一次**。
  //   为什么不能事后再问 `isUiFaceNs(ns)`：那个谓词要看 `WA[ns]` 的**当前值形状**，
  //   而回收动作本身会把值删掉——于是同一件事在「回收前」判为 UI 面、在「回收后」判为非 UI 面。
  //   实测（r7 全量）：负控制 A 里 `__leakNs2840` 明明被回收了（进了 waNs），
  //   却又被记进 kept（非 UI 面），两个结论互相矛盾 —— 判据的输入面与结论面不同宽。
  const uiAddedNs = [], nonUiAddedNs = [];
  waAddedNs.forEach(function (ns) {
    if (isUiFaceNs(ns) && !isProductShell(ns)) uiAddedNs.push(ns);
    else nonUiAddedNs.push(ns);
  });
  const lsAdded = b.ls.filter(function (k) { return a.ls.indexOf(k) < 0; });
  const lsGone = a.ls.filter(function (k) { return b.ls.indexOf(k) < 0; });
  const globalAdded = b.globalKeys.filter(function (k) { return a.globalKeys.indexOf(k) < 0; });
  return {
    waAddedNs: waAddedNs.sort(),
    waAddedMembers: waAddedMembers.sort(),
    uiAddedNs: uiAddedNs.sort(),
    nonUiAddedNs: nonUiAddedNs.sort(),
    waGoneNs: waGoneNs.sort(),
    lsAdded: lsAdded.sort(),
    lsGone: lsGone.sort(),
    globalAdded: globalAdded.sort(),
    orderChanged: a.order.join('|') !== b.order.join('|'),
    handlerTotalDelta: b.handlerTotal - a.handlerTotal,
    scriptsDelta: b.scripts - a.scripts
  };
}

/** 该差值里有没有**硬**痕迹（收窄口径：只看 UI 装载面，见头部纪律②） */
function hardSignals(d) {
  // 只用 diff 那一刻**算定**的 uiAddedNs（见 diff 里的说明：谓词依赖当前值形状，事后重算会自相矛盾）
  const uiNs = (d.uiAddedNs || []).length;
  const uiMembers = d.waAddedMembers.filter(function (full) {
    return isUiFaceMemberNs(full.slice(0, full.indexOf('.')));
  }).length;
  return uiNs + uiMembers;
}
/** 产品装载期自建的内部壳（见 PRODUCT_DEFINED）：不算任何 section 的痕迹 */
function isProductShell(ns) { return Object.prototype.hasOwnProperty.call(PRODUCT_DEFINED, ns); }
/** 只报告不计错的面（含被移出硬面的那些——见头部纪律②，不得静默丢弃） */
function softSignals(d) {
  const out = [];
  // 被移出硬面的痕迹必须逐条登记：口径收窄不等于这些痕迹不存在
  const otherNs = d.waAddedNs.filter(function (ns) { return !isProductShell(ns); });
  const otherMembers = d.waAddedMembers.filter(function (full) { return !isUiFaceMemberNs(full.slice(0, full.indexOf('.'))); });
  if (otherNs.length) out.push('WA 命名空间+' + JSON.stringify(otherNs));
  if (otherMembers.length) out.push('WA 成员+' + JSON.stringify(otherMembers.slice(0, 8)) + (otherMembers.length > 8 ? '(+' + (otherMembers.length - 8) + ')' : ''));
  if (d.waGoneNs.length) out.push('WA 命名空间-' + JSON.stringify(d.waGoneNs));
  if (d.lsAdded.length) out.push('storage+' + JSON.stringify(d.lsAdded));
  if (d.lsGone.length) out.push('storage-' + JSON.stringify(d.lsGone));
  if (d.globalAdded.length) out.push('global+' + JSON.stringify(d.globalAdded));
  if (d.orderChanged) out.push('storage-order-changed');
  if (d.handlerTotalDelta) out.push('winHandlers ' + (d.handlerTotalDelta > 0 ? '+' : '') + d.handlerTotalDelta);
  if (d.scriptsDelta) out.push('scriptEls ' + (d.scriptsDelta > 0 ? '+' : '') + d.scriptsDelta);
  return out;
}

/**
 * 把快照 a 之后新增的 UI 装载面收回去。返回实际回收清单（供日志与断言复核）。
 * 只处理 UI 面（见头部纪律②）：其他面一律只报告，避免用判据改掉跨 section 共享的夹具。
 * 删不动（冻结/只读/不可配置）时如实记进 skipped，不静默吞。
 */
function restore(a) {
  const before = snap();
  const d = diff(a, before);
  const rec = { waNs: [], waMembers: [], lsKeys: [], kept: [], weakNames: [], skipped: [] };
  const WA = global.WorldAxis;
  d.waAddedMembers.filter(function (full) { return isUiFaceMemberNs(full.slice(0, full.indexOf('.'))); })
    .forEach(function (full) {
      const i = full.indexOf('.');
      const ns = full.slice(0, i), mem = full.slice(i + 1);
      try {
        const o = WA[ns];
        if (o && o[mem] !== undefined) { delete o[mem]; rec.waMembers.push(full); }
        else { rec.skipped.push(full); }
      } catch (e) { rec.skipped.push(full); }
    });
  d.waAddedNs.filter(function (ns) { return (d.uiAddedNs || []).indexOf(ns) >= 0; }).forEach(function (ns) {
    try {
      if (WA[ns] !== undefined) {
        delete WA[ns];
        if (WA[ns] === undefined) rec.waNs.push(ns);
        else { rec.weakNames.push(ns); rec.skipped.push(ns); }   // 可枚举仍可见/删不掉 ⇒ 如实登记
      } else { rec.skipped.push(ns); }
    } catch (e) { rec.skipped.push(ns); }
  });
  // 其余面：登记为 kept（只报告不回退）
  d.lsAdded.forEach(function (k) { rec.kept.push('storage:' + k); });
  // v2.84.0：必须复用 diff() **当时算定**的 nonUiAddedNs，不得在此处重算 isUiFaceNs ——
  //   本函数上面刚把 WA[ns] 删掉，谓词此刻读到的 `WA[ns]` 是 undefined，
  //   于是同一个 ns 会同时出现在 waNs（说「已回收」）与 kept（说「未回收」）里。
  //   实测（r12 负控制 A）：rec.kept 含 'ns:__leakNs2840'，而它明明已被回收进 waNs。
  //   这正是文件头 r7 记下的那个病（判据的输入面与结论面不同宽）在 kept 路径上的复发。
  (d.nonUiAddedNs || []).forEach(function (ns) { rec.kept.push('ns:' + ns); });
  return rec;
}

/** 一处基线 + 边界回收器：run.js 的 section() 直接消费（唯一接线点） */
function boundary() {
  let mark = snap();
  let sections = 0;
  const log = [];
  return {
    /** 关掉上一节：回收 UI 装载面，返回该节的痕迹报告（无痕迹时返回 null） */
    close: function (title) {
      if (!title) { mark = snap(); return null; }
      sections++;
      const observed = diff(mark, snap());     // 回收**之前**的痕迹（报告用的就是它）
      const rec = restore(mark);
      const left = diff(mark, snap());         // 回收**之后**的残留（只有 UI 面算硬）
      mark = snap();
      const hard = hardSignals(left);
      const soft = softSignals(observed);
      const row = { title: title, reclaimed: rec, residualHard: hard, soft: soft };
      if (rec.waNs.length || rec.waMembers.length || rec.weakNames.length || rec.skipped.length
        || hard || soft.length) log.push(row);
      return row;
    },
    /** 全部节结束后：与最开始的基线对账（应当零硬残留） */
    audit: function () {
      const live = diff(mark, snap());         // 现存的未回收痕迹
      // 还要回答「回收**有没有发生**」：边界是在各 section **跑完之后**才采样的，
      //   所以过程里被回收掉的东西在最终对账里已经看不见了。本函数把历史记录的
      //   「已回收」与「现存残留」一起给出——前者证明回收口真在工作，后者证明它收干净了。
      const everReclaimed = { waNs: [], waMembers: [] };
      log.forEach(function (r) {
        (r.reclaimed.waNs || []).forEach(function (n) { if (everReclaimed.waNs.indexOf(n) < 0) everReclaimed.waNs.push(n); });
        (r.reclaimed.waMembers || []).forEach(function (n) { if (everReclaimed.waMembers.indexOf(n) < 0) everReclaimed.waMembers.push(n); });
      });
      return { sections: sections, residual: live, hard: hardSignals(live), soft: softSignals(live),
        everReclaimed: everReclaimed, log: log };
    },
    mark: function () { return mark; },
    total: function () { return sections; }
  };
}

module.exports = { snap: snap, diff: diff, restore: restore, boundary: boundary,
  hardSignals: hardSignals, softSignals: softSignals, waFace: waFace, keyOrder: keyOrder };
