/**
 * WorldAxis engines/branch-continuity.js (v2.407.0) — 分支连续性 / 原子提交判据
 *
 *  外部资料主线 B 的落地（AVS V3.2/V4PROD 的架构纪律 + GM变量 V2.50 的快照重放语义）：
 *   · uid307 Atomic Commit  新状态先在工作副本生成，过 Schema/Evidence/连续性/硬规则
 *                           校验；全过才一次性提交，任一失败丢弃副本、恢复 Canonical，
 *                           **不允许半更新**。
 *   · uid306 Evidence       SET/CLEAR/RESTORE 必须可追溯；KEEP 表连续；UNKNOWN 只在
 *                           取证后仍无法确定时使用；explicit/canon 优先于 context/designed。
 *   · uid325 楼层绑定       状态按楼层 + swipe 变体绑定；切回旧分支直接恢复已建立的现实，
 *                           不重新猜，其它分支不污染当前。
 *   · GM 变量 V2.50         gm_turn 快照 / gmReplay / gmProject / 删楼层回退 / 聊天指纹。
 *
 *  ── 七条否定式边界 ──────────────────────────────────────────────
 *   ① 本模块**不实现提交**：不写 store、不调 transact、不接管 core/commit.js。
 *      它只提供「该不该提交 / 为什么拒」的确定性判据；真正落库仍由宿主唯一写者做。
 *   ② 总开关默认关闭；关闭时全部判据如实报 disabled。
 *   ③ 零模型、零落盘、零 localStorage；工作副本只在内存里，函数返回即失效。
 *   ④ 不编造分支 id：宿主没有稳定 branchId 字段，就用 floor+swipe 的现有签名，
 *      不另造一套树。
 *   ⑤ 校验不过一律 whole-reject：不返回「部分通过」的提交许可，避免半更新。
 *   ⑥ 证据缺失不猜：无 evidence 的 SET/CLEAR/RESTORE 一律 refused，不补「未知来源」。
 *   ⑦ 压下项必须可见：所有被拒校验连同 reason 一并返回。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const LS_KEY = 'worldaxis_branch_continuity_settings_v1';
  const DEF = { enabled: false, maxChecks: 16, requireEvidenceFor: true };
  const __REG = { key: LS_KEY, def: DEF, module: 'branchContinuity' };
  const __stat = { committed: 0, rejected: 0, lastReason: '', lastAt: 0 };

  function settings() {
    if (!WA.settingsBus) return Object.assign({}, DEF);
    try { return WA.settingsBus.normalize(__REG, Object.assign({}, DEF, WA.settingsBus.read(__REG) || {})); }
    catch (e) { return Object.assign({}, DEF); }
  }
  function now() { return WA.clock && WA.clock.now ? WA.clock.now('branch-continuity') : Date.now(); }

  // ── 证据分级（AVS uid306 的 WorldAxis 版）────────────────────────────
  // 优先级：explicit > canon > context > designed > entailed > unknown。
  // 「entailed」只在动作与空间关系必然推出时成立；不得无证据猜心理。
  const PRIORITY = { explicit: 6, canon: 5, context: 4, designed: 3, entailed: 2, unknown: 1 };
  function evidenceRank(kind) { return PRIORITY[String(kind || 'unknown')] || 0; }
  function evidence(op) {
    if (!op || typeof op !== 'object') return { ok: false, reason: 'bad-op' };
    const act = String(op.action || '').toUpperCase();
    if (act === 'KEEP') return { ok: true, action: 'KEEP', rank: 0, why: 'KEEP 表连续，无需新证据（uid306）' };
    if (!['SET', 'CLEAR', 'TEMP_ABSENT', 'RESTORE'].includes(act)) return { ok: false, reason: 'unknown-action', action: act };
    const e = op.evidence;
    if (!e || typeof e !== 'object') return { ok: false, reason: 'evidence-missing', action: act, hint: 'SET/CLEAR/TEMP_ABSENT/RESTORE 必须可追溯到证据（uid306）' };
    const kind = String(e.kind || 'unknown');
    const rank = evidenceRank(kind);
    if (!rank) return { ok: false, reason: 'bad-evidence-kind', kind: kind };
    const src = String(e.source || '').trim();
    if (!src) return { ok: false, reason: 'evidence-no-source', hint: '不补「未知来源」（边界⑥）' };
    // explicit/canon 优先于 context/designed：低优先级不得覆盖高优先级事实。
    const base = op.canonical ? evidenceRank(op.canonical.kind) : 0;
    if (base && rank < base) return { ok: false, reason: 'lower-priority-overrides-canonical', have: kind, need: op.canonical.kind };
    return { ok: true, action: act, rank: rank, kind: kind, source: src, why: e.why || '' };
  }

  // ── 分支签名（不编造分支 id）────────────────────────────────────────
  // 与 store.floorSig()/currentBranchId() 同构：floor + swipe。
  function branchSig(anchor) {
    if (!anchor || typeof anchor.floor !== 'number') return '';
    return 'm' + anchor.floor + '_s' + (anchor.swipe || 0);
  }
  // 同一 swipe 族（跨楼层复用）；不同族互不污染（uid325）。
  function familyOf(anchor) {
    if (!anchor || typeof anchor.floor !== 'number') return '';
    return 's' + (anchor.swipe || 0);
  }
  // 切回旧楼层/旧 swipe 时：直接恢复该签名已建立的现实，不重新猜。
  function restore(snapshot, sig) {
    const sn = snapshot || {};
    const bySig = sn.bySig || {};
    if (!sig) return { ok: false, reason: 'missing-signature' };
    if (!Object.prototype.hasOwnProperty.call(bySig, sig)) return { ok: false, reason: 'no-established-state', signature: sig, hint: '该楼层没有已建立状态，按信息不足处理，不猜测' };
    return { ok: true, outcome: 'restored', signature: sig, state: bySig[sig], family: familyOf({ floor: Number(String(sig).replace(/^m/, '').split('_')[0]), swipe: Number(String(sig).split('_s')[1]) || 0 }) };
  }

  // ── 原子提交判据：工作副本 → 四道校验 → whole-accept / whole-reject ────
  // 注意：本函数**不落库**。它只回答「这份工作副本能不能一次性提交」。
  // 调用方（宿主唯一写者）拿到 verdict='accept' 后才自行 transact；拒绝时丢弃副本。
  function evaluate(req) {
    if (!settings().enabled) return { ok: false, verdict: 'disabled', reason: 'disabled' };
    const r = req || {};
    const ops = Array.isArray(r.ops) ? r.ops : [];
    const checks = [];
    function chk(name, ok, why) { checks.push({ name: name, ok: !!ok, why: why || '' }); }
    // ① Schema：工作副本必须是对象，且 ops 是数组。
    chk('schema', r.draft && typeof r.draft === 'object' && Array.isArray(r.ops), 'draft 缺失或 ops 不是数组');
    // ② Evidence：每个变更都要可追溯（KEEP 豁免）。
    let evFail = 0;
    ops.forEach(function (op) { const e = evidence(op); if (!e.ok) evFail++; });
    chk('evidence', evFail === 0, evFail ? (evFail + ' 个变更缺证据/证据优先级不足') : '全部变更可追溯');
    // ③ Continuity：不得 ClearAll；目标槽位必须显式；不同族不得串写。
    let clearAll = 0, noSlot = 0, crossFamily = 0;
    const fam = familyOf(r.anchor || {});
    ops.forEach(function (op) {
      if (!op) return;
      if (String(op.action || '').toUpperCase() === 'CLEARALL') clearAll++;
      if (String(op.action || '').toUpperCase() !== 'KEEP' && !op.slot) noSlot++;
      if (op.family && fam && op.family !== fam) crossFamily++;
    });
    chk('continuity', !clearAll && !noSlot && !crossFamily,
      clearAll ? '禁止 ClearAll（uid309：事件只改目标槽位）' : (noSlot ? '变更缺目标槽位' : (crossFamily ? '其它 swipe 族试图写入当前分支（uid325）' : '无跨族/无 ClearAll/槽位齐全')));
    // ④ Hard rules：签名必须存在；校验数不超上限（防注入面绕过）。
    const sig = r.signature || branchSig(r.anchor || {});
    chk('hard-rules', !!sig && checks.length <= (Number(settings().maxChecks) || DEF.maxChecks),
      sig ? '签名存在且校验数在上限内' : '缺楼层签名，无法绑定');
    const failed = checks.filter(function (c) { return !c.ok; });
    const at = now();
    if (failed.length) {
      __stat.rejected++; __stat.lastReason = failed[0].name; __stat.lastAt = at;
      return { ok: false, verdict: 'reject', reason: 'whole-reject', at: at, signature: sig,
        checks: checks, failed: failed, hint: '任一校验失败：丢弃工作副本、恢复 Canonical，不允许半更新（uid307）' };
    }
    __stat.committed++; __stat.lastAt = at;
    return { ok: true, verdict: 'accept', at: at, signature: sig, family: fam,
      checks: checks, failed: [], hint: '校验全过：可由宿主唯一写者一次性提交；本模块不落库' };
  }

  // ── 快照重放读侧（GM V2.50 语义的只读投影，不写回任何状态）──────────
  function replay(snapshot, sigs) {
    const list = Array.isArray(sigs) ? sigs : [];
    const rows = [];
    list.forEach(function (sg) {
      const x = restore(snapshot, sg);
      rows.push({ signature: sg, ok: x.ok, reason: x.ok ? 'restored' : x.reason,
        state: x.ok ? x.state : null, family: x.ok ? x.family : '' });
    });
    return { ok: true, rows: rows, count: rows.length, restored: rows.filter(function (r) { return r.ok; }).length,
      note: '只读投影：不写回 store、不产生新状态；缺失签名按信息不足处理' };
  }

  // ── buildBlock：注入面（默认空串；只出纪律，不出裁决细节到叙事）──────
  function buildBlock() {
    if (!settings().enabled) return '';
    return '【连续性纪律】已确立的稳定事实不因本轮未提及而消失；切换楼层或滑动变体时恢复该分支已建立的现实，不重新猜测；其它分支的状态不进入当前主线。状态变更须有可追溯依据，无依据按信息不足处理。';
  }

  function view() {
    return { settings: settings(), stat: Object.assign({}, __stat), priority: Object.assign({}, PRIORITY) };
  }

  WA.branchContinuity = {
    evaluate: evaluate, evidence: evidence, evidenceRank: evidenceRank,
    branchSig: branchSig, familyOf: familyOf, restore: restore, replay: replay,
    buildBlock: buildBlock, view: view,
    getSettings: function () { return settings(); },
    setSettings: function (patch) {
      if (!WA.settingsBus) return { ok: false, reason: 'settings-bus-absent' };
      try {
        const next = WA.settingsBus.normalize(__REG, Object.assign({}, DEF, settings(), patch || {}));
        WA.settingsBus.saveOrThrow(__REG, next);
        return { ok: true, settings: settings() };
      } catch (e) { return { ok: false, reason: 'save-failed', error: String(e && e.message || e) }; }
    },
    stat: function () { return Object.assign({}, __stat); }
  };
  if (typeof WA.registerModule === 'function') WA.registerModule('engines/branch-continuity.js', { kind: 'engine', ver: '2.407.0' });
  if (typeof console !== 'undefined' && console.log) console.log('[WorldAxis] engines/branch-continuity 已加载（2.407.0）');
})();