/**
 * WorldAxis engines/reject-recovery.js (v2.192.0) — 拒收码 → 恢复动作的统一映射（计划 U5）
 *
 * ── 它治什么（计划 U5 现状原文）──────────────────────────────────
 *   拒收码已 800+（v2.189.0 收口轮实测 804；v2.380.0 现场 1721 条字面量 / 拒收面 1531），
 *   三面已治理（分类 / 见证 / 覆盖率），
 *   但「**拒收之后该干什么**」不是统一契约。新拍引擎尤其明显：
 *   `adjust` / `setup` / `reject` / `bad-round` / `hard-cut` / `landed-immutable`
 *   都可拒收，但处置方向**相反** —— 前两个补因，后四个才要回滚或重写。
 *   没有这份映射时，每个消费方（诊断面 / 面板面 / 日志面）只能各自猜一句人话，
 *   于是同一件事在三个面上有三种说法，其中至少两种是错的。
 *
 * ── 先纠一件事：那 804 个（今日 1721）不是「拒收码」，是「`reason:` 字面量面」──────────
 *   源码扫描面的词法是 `reason: 'x'` 的**内联字面量**，它不管这个 reason 写在
 *   成功返回里还是失败返回里。按「每次命中所属的对象字面量是否带 `ok:false`」分面，
 *   实测（v2.192.0，tools/reject-recovery.js `faces()` 复算）：
 *
 *     拒收面 717   至少在 `ok:false` 对象里出现过 → 真·拒收，**才配恢复动作**
 *     成功面 34    只出现在 `ok:true` 对象里（`clean` / `checked` / `applied` / `ok` …）
 *                  → 给它们编「恢复动作」是**造数据**：它根本不需要恢复，
 *                    它是「做成了」的说法。本模块对它们 `kind:null`、`why` 如实说明。
 *     判不出面 53  所属对象不带 `ok`（决策 `{action:'pause',reason:'crisis'}`、
 *                  治理计划 `{key:k,reason:'diag-idle'}`、内部触发 `refresh({reason:'after-reply'})`）
 *                  → 机器判不出来「它算不算拒收」，**不许猜**：逐条在 NEUTRAL_REVIEW 登记。
 *
 * ── 六档（处置方向）──────────────────────────────────────────────
 *   retry-same-input  同一输入再试一次（瞬时 / 可重放：忙、竞态、IO 暂不可用）
 *   request-setup     还差前置条件，得先把因补上（缺字段、未初始化、条件未满足）
 *   adjust-input      输入本身不合格，改输入（超范围、超预算、形态不合、重复）
 *   rollback          这一步已经落过 / 顺序不许，必须回滚或改写（落地不可变、顺序锁、陈旧）
 *   manual-review     机器判不了，得人来（读不到、只处理了一半、语义含糊）
 *   permanent-reject  永久拒绝：这件事本身不被允许，别试了
 *
 * ── 边界（计划 U5 原文，逐条落到代码上）──────────────────────────
 *   ① 不把可重试与可忽略合成一档 —— 六档里**没有** `ignore`（那是静默降级）。
 *   ② 恢复建议不得暗示「忽略即可」：KIND_ACTION 的六句话全是「你要做什么」，
 *      源码里不出现「可以不管」「忽略」这类字样（专锁 A 段静态判据）。
 *   ③ 表外码不落进任何默认档：`explain()` 对未登记的码返回 `kind:null`，**绝不兜底**。
 *   ④ 恢复语义不写 store：本模块**零 fs / 零 store / 零 localStorage**，只有三张冻结表
 *      与一个纯函数。它不产生状态，也就没有「恢复建议本身又被写坏」的可能。
 *
 * ── 单一真源与它的核对 ────────────────────────────────────────
 *   三张表（RULES / OVERRIDES / NEUTRAL_REVIEW）与两张面快照（SUCCESS_FACE / NEUTRAL_FACE）
 *   是**产品承诺**。它们与现场的一致性由 `tools/reject-recovery.js` 复算并逐条核对：
 *   快照多一条、少一条、或某条的面变了，都当场报红（`tests/reject-recovery-lock-v2192.js` 钉这条）。
 *   为什么快照要冻结在产品里而不是现场算：现场算要读 `core/` `engines/` `render/` 全量源码，
 *   产品面不做文件 IO（第 ④ 条）。冻结 + 门禁核对，与 `engines/interop.js` 的
 *   `rejectCodes` 承诺清单是同一种做法。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  /** 六档。**没有** `ignore` —— 那是静默降级（边界 ①）。 */
  const KINDS = ['retry-same-input', 'request-setup', 'adjust-input',
    'rollback', 'manual-review', 'permanent-reject'];
  /** 每档给玩家的**可执行**一句话（写给诊断面 / 面板面 / 日志面复用的，不是散文）。
   *  措辞一律是「你要做什么」，**不出现「可以不管它」这类说法**（边界 ②）。 */
  const KIND_ACTION = {
    'retry-same-input': '同一输入再试一次即可（这是瞬时状态，不是你写错了）',
    'request-setup': '先把缺的前置补上再重来（缺什么看码名后半段）',
    'adjust-input': '输入本身要改：按码名指出的那一项改完再提交',
    'rollback': '这一步已经落过或顺序不许 —— 要回头改写，不能原地重试',
    'manual-review': '机器判不了，需要人看一眼（读不到 / 只处理了一半 / 语义含糊）',
    'permanent-reject': '这件事本身不被允许：换做法，不要重试'
  };
  // ── 有序规则表（先命中先归；**只对拒收面**）──────────────────────────
  //   顺序**敏感**：`landed-immutable` 必须先命中 rollback 的 `landed`，
  //   否则会被 `immutable` / `missing` 之类别的表抢走 —— 这正是「处置方向相反」的来源。
  //   判据形态：把码按 `-` 分词，任一 token 命中本表词表即归该档（先到先得）。
  // OPV29-09：表在 engines/reject-recovery-tables.js（1162 行纯数据）。求值期先取表，
  // 缺表 / 空表**当场抛错**：空表会让「表外码不落进任何默认档」（边界 ③）静默失效 ——
  // 所有码都返回 kind:null，看着像「都判不出」，其实是表没装上。宁可不启动也不静默错。
  const __TB = WA.rejectRecoveryTables;
  if (!__TB || !Array.isArray(__TB.RULES) || !__TB.OVERRIDES || !__TB.ARTIFACTS ||
      !__TB.NEUTRAL_REVIEW || !Array.isArray(__TB.REJECT_FACE) ||
      !Array.isArray(__TB.SUCCESS_FACE) || !Array.isArray(__TB.NEUTRAL_FACE) ||
      __TB.RULES.length === 0 || __TB.REJECT_FACE.length === 0) {
    throw new Error('reject-recovery: 冻结表未装载或为空（engines/reject-recovery-tables.js 必须先于 engines/reject-recovery.js 装载）');
  }
  const RULES = __TB.RULES;
  const OVERRIDES = __TB.OVERRIDES;
  const ARTIFACTS = __TB.ARTIFACTS;
  const NEUTRAL_REVIEW = __TB.NEUTRAL_REVIEW;
  const REJECT_FACE = __TB.REJECT_FACE;
  const SUCCESS_FACE = __TB.SUCCESS_FACE;
  const NEUTRAL_FACE = __TB.NEUTRAL_FACE;

  /** 三快照查表 → 面。未命中即 `unknown`（**判不出就是判不出**，不拿规则表兜）。 */
  function frozenFace(c) {
    if (REJECT_FACE.indexOf(c) >= 0) return 'reject';
    if (SUCCESS_FACE.indexOf(c) >= 0) return 'success';
    if (NEUTRAL_FACE.indexOf(c) >= 0) return 'neutral';
    return 'unknown';
  }
  const stat = { asks: 0, matched: 0, unknown: 0, byKind: {}, lastCode: '', lastKind: '' };
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function bump(k) { if (k) stat.byKind[k] = (stat.byKind[k] || 0) + 1; }
  /**
   * 单码 → 恢复语义。**判不出返回 `kind:null`**（边界 ③：绝不兜底成某一档）。
   *   返回 `{code, face, kind, action, why, via}`：
   *     face   reject / success / neutral / unknown —— 它在源码里长哪一种
   *     kind   六档之一，或 null（不配恢复动作 / 未登记）
   *     action 给玩家的一句话（有 kind 时取 KIND_ACTION，否则 null）
   *     via    rule / override / neutral-review / out-of-contract / face-success / artifact / undecided
   *   opt.face  可注入面（`{code: 'reject'|...}`）—— 门禁在 Node 里注入实测面复算，
   *             产品运行时不给它，只按两张冻结快照判（这才是不读源码的做法）。
   */
  function explain(code, opt) {
    const o = opt || {};
    const c = String(code == null ? '' : code);
    stat.asks += 1;
    stat.lastCode = c;
    const live = o.face || null;
    // 面判定优先序（**顺序即判据**）：
    //   ① 注入面（门禁在 Node 里给的实测面）—— 唯一权威；
    //   ② 产品侧两张冻结快照 —— 成功面 / 判不出面，逐字名单；
    //   ③ 已有显式登记（OVERRIDES / ARTIFACTS / NEUTRAL_REVIEW）⇒ 拒收面；
    //   ④ 否则 **unknown** —— 这里**不能**拿规则表当兜底。
    //      曾经写成 `|| ruleKind(c)`，后果是任意字符串（`zzz-not-a-code`）都被
    //      规则表「形态像什么」兜成一档 —— 那正是边界 ③ 要禁的默认档：
    //      规则表是「已知拒收码的归类器」，不是「任意输入的分类器」。
    //      规则表只在**已确认为拒收面**的码上跑（见下方 else 分支）。
    //      这也是拒收面要冻结成 REJECT_FACE 的原因：产品要能独立答出「这个码是不是拒收」，
    //      而不必现场读源码，也不能靠规则表反推（反推会把任意字符串说成某一档）。
    const face = live ? (live[c] || 'unknown') : frozenFace(c);
    let out;
    if (face === 'success') {
      out = { code: c, face: face, kind: null, action: null, via: 'face-success',
        why: '成功分支的理由，不需要恢复动作' };
    } else if (face === 'unknown') {
      out = { code: c, face: face, kind: null, action: null, via: 'undecided',
        why: '这个码不在登记面上 —— 可能是新码、也可能是非 reason 字段的值' };
    } else if (has(ARTIFACTS, c)) {
      out = { code: c, face: face, kind: null, action: null, via: 'artifact', why: ARTIFACTS[c] };
    } else if (face === 'neutral') {
      const r = NEUTRAL_REVIEW[c];
      if (!r) out = { code: c, face: face, kind: null, action: null, via: 'undecided', why: '判不出面未登记' };
      else if (r.out) out = { code: c, face: face, kind: null, action: null, via: 'out-of-contract', why: r.why };
      else out = { code: c, face: face, kind: r.kind, action: KIND_ACTION[r.kind], why: r.why, via: 'neutral-review' };
    } else if (has(OVERRIDES, c)) {
      //   ⚠ 显式登记**必须先于**规则表（v2.400.0 修）。
      //   本行原先是 `const k = ruleKind(c); if (k) {...} else if (has(OVERRIDES, c)) {...}` ——
      //   于是只要码名形态被规则表认得，OVERRIDES 就**永远轮不到**，显式登记形同注释。
      //   这不是「顺序可商榷」，是**与文件自己的意图冲突**：
      //     · 上方 OVERRIDES 表头（第 103 行）写的是「规则判不了的**残余**」；但
      //     · 表内 v2.275.0 段（第 111-113 行）明确举了反例：`unknown-step` 会被
      //       `unknown` 抢成 request-setup，而它其实是步骤 id 拼错 ⇒「**故显式覆盖**」。
      //       —— 若规则优先，那句「故显式覆盖」根本无法成立。
      //   现场读数（v2.400.0 实测）：OVERRIDES 共 119 条，被规则表抢走 14 条，
      //   其中 **9 条档位被真改写**（unknown-step / archive-failed / archive-write-failed /
      //   contract-unavailable / control-usage-unavailable / panel-yield-unavailable /
      //   projection-failed / ui-not-loaded / mourning-prohibited）。也就是说：
      //   这些码对调用方给出的「该怎么办」一直是**错的**，而既有专锁看不见 ——
      //   因为它的 DIRECTIONS 样本五条恰好都不在 OVERRIDES 里（判定对，所以不红）。
      //   这正是本仓反复点名的形态：**判据的输入面比事实窄**。
      const r2 = OVERRIDES[c];
      out = { code: c, face: face, kind: r2.kind, action: KIND_ACTION[r2.kind], why: r2.why, via: 'override' };
    } else {
      const k = ruleKind(c);
      if (k) out = { code: c, face: face, kind: k, action: KIND_ACTION[k], via: 'rule',
        why: '按码名形态归入「' + k + '」' };
      else out = { code: c, face: face, kind: null, action: null, via: 'undecided', why: '拒收面残余未登记' };
    }
    if (out.kind) { stat.matched += 1; bump(out.kind); } else if (face === 'reject') stat.unknown += 1;
    stat.lastKind = out.kind || '';
    return out;
  }
  /** 码名形态 → 档（有序表，先命中先归）。判不出返回 `''`。 */
  function ruleKind(code) {
    const toks = String(code || '').split('-');
    for (let i = 0; i < RULES.length; i += 1) {
      const ws = RULES[i][1];
      for (let j = 0; j < toks.length; j += 1) if (ws.indexOf(toks[j]) >= 0) return RULES[i][0];
    }
    return '';
  }
  /** 三面总览（诊断面 / 面板面读这一个数，不再各自数）。 */
  function counts() {
    return {
      kinds: KINDS.length, rules: RULES.length,
      overrides: Object.keys(OVERRIDES).length,
      neutralReview: Object.keys(NEUTRAL_REVIEW).length,
      neutralOut: Object.keys(NEUTRAL_REVIEW).filter(function (k) { return !!NEUTRAL_REVIEW[k].out; }).length,
      artifacts: Object.keys(ARTIFACTS).length,
      rejectFace: REJECT_FACE.length,
      successFace: SUCCESS_FACE.length, neutralFace: NEUTRAL_FACE.length
    };
  }
  /** 自证面（**只读**）：表自洽 + 快照与登记表的一对一。 */
  function diagnose() {
    const c = counts();
    const checks = {};
    checks['六档无 ignore'] = KINDS.indexOf('ignore') < 0;
    checks['六档都有动作句'] = KINDS.every(function (k) { return typeof KIND_ACTION[k] === 'string' && KIND_ACTION[k].length > 0; });
    checks['动作句不出现「忽略」'] = KINDS.every(function (k) { return KIND_ACTION[k].indexOf('忽略') < 0; });
    checks['判不出面快照 = 登记表键集'] =
      NEUTRAL_FACE.slice().sort().join('|') === Object.keys(NEUTRAL_REVIEW).sort().join('|');
    checks['三面两两不相交'] =
      REJECT_FACE.every(function (k) { return SUCCESS_FACE.indexOf(k) < 0 && NEUTRAL_FACE.indexOf(k) < 0; })
      && SUCCESS_FACE.every(function (k) { return NEUTRAL_FACE.indexOf(k) < 0; });
    checks['拒收面快照 ⊇ 显式登记键'] =
      Object.keys(OVERRIDES).every(function (k) { return REJECT_FACE.indexOf(k) >= 0; })
      && Object.keys(ARTIFACTS).every(function (k) { return REJECT_FACE.indexOf(k) >= 0; });
    checks['规则表档名全在六档内'] =
      RULES.every(function (r) { return KINDS.indexOf(r[0]) >= 0; });
    checks['登记表档名全在六档内'] =
      Object.keys(OVERRIDES).every(function (k) { return KINDS.indexOf(OVERRIDES[k].kind) >= 0; })
      && Object.keys(NEUTRAL_REVIEW).every(function (k) { return NEUTRAL_REVIEW[k].out || KINDS.indexOf(NEUTRAL_REVIEW[k].kind) >= 0; });
    checks['每条登记都带 why'] =
      Object.keys(OVERRIDES).every(function (k) { return !!OVERRIDES[k].why; })
      && Object.keys(NEUTRAL_REVIEW).every(function (k) { return !!NEUTRAL_REVIEW[k].why; })
      && Object.keys(ARTIFACTS).every(function (k) { return !!ARTIFACTS[k]; });
    const bad = Object.keys(checks).filter(function (k) { return !checks[k]; });
    return {
      ok: !bad.length, version: '2.203.0', checks: checks, failed: bad,
      counts: c,
      lines: [
        '六档各配一句可执行的话（无 ignore、不出现「忽略」说法）',
        '三面快照两两不相交（一个码只能是一种面）',
        '判不出面快照与 NEUTRAL_REVIEW 键集必须逐字相同（多一条少一条都红）',
        '拒收面快照必须覆盖每一条显式登记（登记了却不在这面上 = 面判错了）',
        '每条显式登记必须带 why —— 防止「登记了但没人知道为什么」'
      ]
    };
  }
  WA.rejectRecovery = {
    KINDS: KINDS.slice(),
    KIND_ACTION: Object.assign({}, KIND_ACTION),
    RULES: RULES.map(function (r) { return [r[0], r[1].slice()]; }),
    OVERRIDES: Object.assign({}, OVERRIDES),
    ARTIFACTS: Object.assign({}, ARTIFACTS),
    NEUTRAL_REVIEW: Object.assign({}, NEUTRAL_REVIEW),
    REJECT_FACE: REJECT_FACE.slice(),
    SUCCESS_FACE: SUCCESS_FACE.slice(),
    NEUTRAL_FACE: NEUTRAL_FACE.slice(),
    ruleKind: ruleKind, explain: explain, counts: counts,
    diagnose: diagnose,
    stat: function () {
      return Object.assign({}, stat, { byKind: Object.assign({}, stat.byKind) });
    }
  };
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/reject-recovery.js', { kind: 'engine', ver: '2.209.0' });
  }
})();