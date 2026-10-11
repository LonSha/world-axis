/**
 * WorldAxis engines/reject-recovery.js (v2.192.0) — 拒收码 → 恢复动作的统一映射（计划 U5）
 *
 * ── 它治什么（计划 U5 现状原文）──────────────────────────────────
 *   拒收码已 800+（v2.189.0 收口轮实测 804），三面已治理（分类 / 见证 / 覆盖率），
 *   但「**拒收之后该干什么**」不是统一契约。新拍引擎尤其明显：
 *   `adjust` / `setup` / `reject` / `bad-round` / `hard-cut` / `landed-immutable`
 *   都可拒收，但处置方向**相反** —— 前两个补因，后四个才要回滚或重写。
 *   没有这份映射时，每个消费方（诊断面 / 面板面 / 日志面）只能各自猜一句人话，
 *   于是同一件事在三个面上有三种说法，其中至少两种是错的。
 *
 * ── 先纠一件事：那 804 个不是「拒收码」，是「`reason:` 字面量面」──────────
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
  const RULES = [
    ['rollback', ['landed', 'written', 'hard-cut', 'immutable', 'stale', 'baseline', 'conflict',
      'divergent', 'tamper', 'closed', 'locked', 'order', 'overwrite', 'drift', 'mismatch',
      'changed', 'mutated', 'frozen', 'sealed', 'snapshot', 'already', 'cycle', 'ahead-of-head',
      'revoked', 'stage-skip', 'orphaned-epoch', 'reuse', 'overdrawn', 'retroactive', 'rewind',
      'superseded', 'obsolete', 'durable', 'monotonic', 'backward', 'nonmonotonic']],
    ['request-setup', ['missing', 'absent', 'empty', 'unknown', 'nothing', 'need', 'no', 'unset',
      'unbound', 'undefined', 'not-found', 'unregistered', 'undeclared', 'noop', 'none', 'null',
      'blank', 'uninitialized', 'unopened', 'pending', 'awaiting', 'unconfirmed', 'incomplete',
      'unmet', 'unexplained', 'ungrounded', 'unreciprocated', 'shortfall', 'threshold', 'premature',
      'one-sided', 'occupied', 'inflight', 'in-transit', 'tape', 'recording', 'open', 'unmatched',
      'unpaired', 'unread', 'untracked', 'uncovered', 'unscheduled', 'prerequisite', 'duty',
      'fidelity', 'enabled', 'setup', 'source', 'sources', 'target', 'act', 'step', 'chain',
      'office', 'holder', 'registered', 'table']],
    ['adjust-input', ['bad', 'not', 'too', 'short', 'long', 'full', 'invalid', 'wrong', 'negative',
      'over', 'under', 'out', 'range', 'limit', 'exceed', 'insufficient', 'partial', 'duplicate',
      'self', 'deep', 'many', 'few', 'weak', 'thin', 'low', 'high', 'small', 'large', 'zero',
      'overflow', 'type', 'format', 'shape', 'kind', 'name', 'title', 'text', 'key', 'keys',
      'round', 'steps', 'action', 'actor', 'role', 'amount', 'value', 'field', 'non-finite',
      'malformed', 'unbalanced', 'unexpected', 'trailing', 'budget', 'crowded', 'anonymous',
      'unappliable', 'attenuated', 'narrative-only', 'recorded', 'contrast', 'scope', 'payload',
      'tag', 'label', 'slot', 'index', 'offset', 'count', 'size', 'length', 'depth', 'width',
      'path', 'url', 'date', 'time', 'score', 'weight', 'clash', 'word', 'flat', 'rung', 'dup',
      'dedup', 'overlap', 'capacity', 'cap', 'band', 'slots', 'crowd', 'identical', 'distorted',
      'omniscient', 'unparseable', 'unreachable', 'eye', 'face', 'outfit', 'same', 'quiet',
      'emotion', 'stage', 'top-stage', 'source-cap', 'quota']],
    ['retry-same-input', ['throw', 'threw', 'failed', 'fail', 'busy', 'race', 'timeout', 'retry',
      'transient', 'throttle', 'deferred', 'unsettled', 'interrupted', 'aborted', 'storage',
      'unavailable', 'backpressure', 'concurrent', 'reentrant', 'latency', 'retryable']],
    ['permanent-reject', ['reject', 'void', 'forbid', 'disabled', 'unsupported', 'impossible',
      'blocked', 'gated', 'off', 'denied', 'refused', 'banned', 'prohibited', 'never', 'exhausted',
      'verify', 'verified', 'valid', 'end', 'terminal']]
  ];
  /** 拒收面里规则判不了的残余 —— **逐条显式登记**（边界 ③：未登记即红）。
   *  本表**只**登记拒收面。写之前必须实测它真是拒收面 —— v2.192.0 首轮我曾凭印象写了
   *  `halted` / `restore-failed` / `on-duty` / `damaged` / `unavailable` / `dice` / `trace` / `seed`
   *  八条，实测：`halted` 是成功面、`restore-failed` 与 `on-duty` 是判不出面
   *  （已在 NEUTRAL_REVIEW）、其余四条不在扫描面，**全部移除** ——
   *  工具侧 `coverage()` 的 stale 判据就是为了让这类凭印象登记当场现形。 */
  const OVERRIDES = {
    'unreadable': { kind: 'manual-review', why: '读不到：机器无从判断内容是否可用' },
    'lib-unreadable': { kind: 'manual-review', why: '依赖库读不到，同上' },
    'fault-handled': { kind: 'manual-review', why: '故障已被吞掉处理，结果不明确' },
    'pre-violation': { kind: 'manual-review', why: '违规前置态，需人确认是否已发生' },
    'tries-exhausted': { kind: 'permanent-reject', why: '重试次数已用尽，别再试' },
    'cannot-afford': { kind: 'request-setup', why: '资源不够：先补资源再提交' },
    // ── v2.192.0 首轮分面后补登的 33 条（拒收面规则表判不了，逐条显式登记）──
    'aftermath-wait': { kind: 'retry-same-input', why: '章间冷却期未过：等窗口过去同输入再来' },
    'ahead-of-head': { kind: 'rollback', why: '客户端序号超过服务端头，说明这份状态不该落' },
    'all-rejected': { kind: 'adjust-input', why: '导入的项被逐条剔除，一个都没收：得改导入内容' },
    'backup-corrupt': { kind: 'manual-review', why: '备份已损坏：自动分支判不了该修还是该弃' },
    'bottom': { kind: 'adjust-input', why: '已到底，不能再往下：改方向而不是重试' },
    'burst': { kind: 'adjust-input', why: '同一轮重复次数超限：改输入节奏' },
    'claimed-by-other': { kind: 'retry-same-input', why: '被别的会话占着：等对方释放后同输入再来' },
    'coalesced': { kind: 'retry-same-input', why: '本次触发被并入上一次：等下一窗口再来' },
    'conflicts-unresolved': { kind: 'request-setup', why: '还有未解冲突：先解掉再走这条' },
    'dangling-ref': { kind: 'request-setup', why: '引用悬空：先把被引的对象补上' },
    'error': { kind: 'manual-review', why: '泛化错误，机器分不出病因' },
    'exists': { kind: 'rollback', why: '该对象已存在：不能原地重来，要按新状态改写' },
    'finished': { kind: 'permanent-reject', why: '这局已结束：只能重开，不能续推' },
    'foreign-chat': { kind: 'request-setup', why: '这份数据不属于当前对话：先切到对的对话' },
    'future-event': { kind: 'request-setup', why: '事件时间还没到：等到点再走' },
    'hard-cut': { kind: 'rollback', why: '硬切已生效：只能回头改写，不能原地重试' },
    'in-replay': { kind: 'retry-same-input', why: '正在重放：等重放结束同输入再来' },
    'in-transit': { kind: 'retry-same-input', why: '在途未回：等在途落地后同输入再来' },
    'major-gate': { kind: 'request-setup', why: '大闸未过：先满足大闸条件' },
    'manual-mode': { kind: 'request-setup', why: '手动模式下不自动推演：先切自动' },
    'migration-loop': { kind: 'manual-review', why: '迁移打转超限：结构有问题，得人看' },
    'non-finite': { kind: 'adjust-input', why: '数值非有限：改成一个有限数' },
    'non-positive-delta': { kind: 'adjust-input', why: '增量非正：要加就加正数' },
    'one-sided': { kind: 'request-setup', why: '只给了一边：把另一边补上' },
    'orphaned-epoch': { kind: 'rollback', why: '纪元已孤立：该状态不属当前线，不能落' },
    'preview-rejected': { kind: 'adjust-input', why: '预览被拒：按预览驳回的理由改输入' },
    'scheduled-elsewhere': { kind: 'rollback', why: '已被安排到别处：原地重试会双写' },
    'staged-still-present': { kind: 'rollback', why: '暂存项还在被引用：先摘引用再移除' },
    'still-in-transit': { kind: 'retry-same-input', why: '仍在途：等在途结束同输入再来' },
    'thrown': { kind: 'retry-same-input', why: '调用抛异常，属瞬时' },
    'top': { kind: 'adjust-input', why: '已到顶，不能再往上：改方向而不是重试' },
    'write': { kind: 'retry-same-input', why: '写盘失败：同输入再写一次（store 已自带重试）' }
  };
  /** 词法碎片（**不是码**）：`reason: 'store-' + String(err)` 这类拼接写法，
   *  扫描面的词法视角只能看到前缀，真码运行期才成形（`store-unavailable` 等）。
   *  如实登记，**不猜它该给什么恢复动作**。 */
  const ARTIFACTS = {
    'store-': "拼接式 reason（`'store-' + String((r2 && r2.error) || '?')`）：词法面只能看到前缀，真码在运行期成形"
  };
  /** 判不出面（源码里那个对象不带 `ok`）的**逐条人工判定**。
   *  语义机器判不出来：决策理由（`{action:'pause',reason:'crisis'}`）、
   *  治理计划（`{key:k,reason:'diag-idle'}`）、内部触发（`refresh({reason:'after-reply'})`）。
   *  两种合法登记：给一个档（`kind`），或明说它不在这份契约里（`out:true` + why）。
   *  **未登记的判不出面码一律算缺口**（边界 ③）。 */
  const NEUTRAL_REVIEW = {
    'after-reply': { out: true, why: 'bridge 刷新触发理由，不是调用被拒' },
    'already-done': { kind: 'rollback', why: '该步已完成：不能原地重来，要按新状态改写' },
    'already-json': { out: true, why: '设置复活机制的结论「已是 JSON、无需复活」，非拒收' },
    'already-running': { kind: 'retry-same-input', why: '该步在跑：等它结束同输入再来' },
    'bridge-threw': { kind: 'retry-same-input', why: '桥接抛异常，属瞬时' },
    'budget': { kind: 'retry-same-input', why: '本轮预算用完被顺延，下刻同输入可再来' },
    'climate-throw': { kind: 'retry-same-input', why: '气候面抛异常，属瞬时' },
    'commitment': { out: true, why: 'life 决策理由（action=keep），不是拒收' },
    'commitment-fulfilled': { out: true, why: '承诺已履行，属决策理由' },
    'condition-unmet': { kind: 'request-setup', why: '条件未满足：先把条件做出来' },
    'corrupt-overflow': { out: true, why: '存储治理的移除理由，不是调用被拒' },
    'crisis': { out: true, why: '决策理由（action=pause）' },
    'diag-idle': { out: true, why: '诊断数据 idled 的清理理由' },
    'distorted': { kind: 'manual-review', why: '传闻链已知受损（faithful:false），损到哪一步要人看' },
    'duty-off': { kind: 'request-setup', why: '无人在岗：先把值班补上再问' },
    'empty-string': { out: true, why: '「空串不复活」的正当结论，非拒收' },
    'faithful': { out: true, why: 'faithful:true —— 这是成功面在无 ok 对象里的形态' },
    'fidelity-off': { kind: 'request-setup', why: '保真度开关关着：先开开关再看' },
    'folded_too_small': { out: true, why: '注入折叠的丢弃理由，不是调用被拒' },
    'high-vigilance': { out: true, why: '决策理由（action=hide）' },
    'length-or-empty': { kind: 'adjust-input', why: '输入条目超长或为空，被登记进 rejected' },
    'manual': { out: true, why: '后台任务排队理由（ok:true, queued:true）' },
    'missing-target': { kind: 'adjust-input', why: '目标为空，被登记进 rejected' },
    'narrative-only': { out: true, why: '组织数值只有叙事档，是命中结果不是拒收' },
    'no-act-row': { kind: 'request-setup', why: '找不到对应 act 行：先把该行动登记上' },
    'no-stale-subkeys': { out: true, why: 'changed:false —— 无事可做，非拒收' },
    // v2.195.0（U2 批次⑤）：`no-step` 从判不出面**迁到拒收面** —— 批次③ 给
    //   engines/agency.js 加了一处带 `ok:false` 的同码返回（plan.advance 的显式拒收），
    //   而括号配对判据是「只要有**一处**落在 ok:false 对象里即拒收面」，故它此刻已是拒收码。
    //   它在拒收面上由规则表归 `request-setup`（token `no` / `step` 命中该档词表），
    //   本条登记随之撤销 —— 留在判不出面会让 A7（快照与登记键集逐一对应）当场报红。
    'no-act-id': { kind: 'request-setup', why: '回执连 id 都没有：先把该行动登记成行再送结算' },
    'step-threw': { kind: 'retry-same-input', why: '某一步抛错（世界未提交）：异常多为瞬时，同输入再来一次' },
    'no_sources': { kind: 'adjust-input', why: 'valid:false，一个引用源都没有' },
    'not-enabled': { out: true, why: '复活机制未启用，属内部开关态' },
    'not-in-office': { out: true, why: 'known:true 的裁决结果：人不在岗' },
    'not-on-chain': { kind: 'adjust-input', why: '该人不在传闻链上：先核对传的人对不对' },
    'nothing-recorded': { out: true, why: '组织数值无记录，是查询结论' },
    'off-duty': { out: true, why: 'known:true 的裁决结果：在岗但下班' },
    'on-duty': { out: true, why: 'known:true, onDuty:true —— 成功裁决' },
    'orphan-recovery': { out: true, why: '存储治理的移除理由（孤儿恢复档）' },
    'over_budget': { out: true, why: '注入折叠登记，不是调用被拒' },
    'pending_dropped': { out: true, why: 'horizon 掉线的结果登记（fired:false）' },
    'pinned_over_budget': { out: true, why: '注入折叠登记' },
    'plan-unavailable': { kind: 'request-setup', why: '计划面不可用：先确认计划已载入' },
    'prerequisite-open': { kind: 'request-setup', why: '决策 action=wait，前置还开着' },
    'ready': { out: true, why: '决策 action=advance —— 这是可推进的成功结论' },
    'recorded': { out: true, why: '组织数值命中 precise 档，是结论' },
    'registry-missing': { kind: 'request-setup', why: '注册表没装/方法缺：先确认产品面装配齐' },
    'resource-missing': { out: true, why: '决策理由（action=seek）' },
    'restore-failed': { kind: 'manual-review', why: '审计日志恢复失败，需人看' },
    'revivable': { out: true, why: 'revived:true —— 成功结论' },
    'schedule': { out: true, why: '决策理由（action=keep）' },
    'step-not-running': { kind: 'rollback', why: '该步不在运行态：回执对应的步态已被改写' },
    'stringify-failed': { out: true, why: '序列化试探失败即「不复活」，属机制结论' },
    'trusted-person': { out: true, why: '决策理由（action=ask）' },
    'unconfirmed': { kind: 'manual-review', why: '明确没有内置确认器：得人确认' },
    'unreciprocated': { out: true, why: '决策理由（action=wait）' },
    'unregistered-setting': { out: true, why: '存储治理：未注册设置项的清理理由' }
  };
/* 拒收面冻结快照（v2.197.0 现场实测 723 条）：至少在 `ok:false` 对象里出现过 ——
   *  只有这一面**才配恢复动作**。与现场的逐条一致性由 tests/reject-recovery-lock-v2192.js 核对。
   *  v2.196.0 收口时本快照**漏同步**（新码 need-receipt / enqueue-threw 未入，三条已随路径删除的
   *  旧码 no-receipt-face / receipt-failed / receipt-threw 未出）—— 快照 723 条与现场 722 条
   *  不符，reject-recovery 专锁 B3/B4/C4 三处自 v2.196.0 起一直是红的（每版都被无头回归现形，
   *  当时只跑了定向锁故未察觉）。本版一并补齐：删三条、加三条（含 Y3 的 slots-full）。
   *  三条新码的恢复档不写 OVERRIDES —— 规则表已按 token 归好（need-receipt→request-setup /
   *  enqueue-threw→retry-same-input / slots-full→adjust-input），重复登记会让 A8 与规则表打架。 */
  const REJECT_FACE = [
    'act-absent', 'act-unavailable', 'action-refused', 'action-throw', 'actor-claimed-by-other', 'adopt-throw',
    'aftermath-wait', 'ahead-of-head', 'alias-cycle', 'all-rejected', 'all-steps-refused', 'already-',
    'already-abandoned', 'already-adopted', 'already-answered', 'already-arrived', 'already-closed', 'already-confirmed',
    'already-covered', 'already-decided', 'already-delivered', 'already-in-transit', 'already-linked', 'already-locked',
    'already-pending', 'already-recording', 'already-resolved', 'already-revealed', 'already-settled', 'already-terminal',
    'already-there', 'already-transited', 'already-written', 'anchors-full', 'api-fail', 'apply-throw',
    'auto-off', 'awaiting-after', 'backup-corrupt', 'backward', 'bad-action', 'bad-actor',
    'bad-after', 'bad-amount', 'bad-anchor', 'bad-args', 'bad-axis', 'bad-base',
    'bad-behavior', 'bad-blueprint', 'bad-bp-keys', 'bad-bp-ver', 'bad-budget', 'bad-cap',
    'bad-chain', 'bad-channel', 'bad-char', 'bad-choice', 'bad-conflict', 'bad-coord',
    'bad-cost', 'bad-countdown', 'bad-defer', 'bad-delta', 'bad-draft', 'bad-due',
    'bad-effect', 'bad-enum', 'bad-env', 'bad-every', 'bad-faction', 'bad-factor', 'bad-fail-policy',
    'bad-fallback', 'bad-fn', 'bad-form', 'bad-format', 'bad-gear', 'bad-guarantor',
    'bad-id', 'bad-json', 'bad-kind', 'bad-lane', 'bad-layer-or-key', 'bad-lens',
    'bad-level', 'bad-load', 'bad-method', 'bad-minutes', 'bad-motive', 'bad-name',
    'bad-need', 'bad-needs', 'bad-number', 'bad-op', 'bad-operator', 'bad-order',
    'bad-outcome', 'bad-outline', 'bad-pack', 'bad-pack-ver', 'bad-pair', 'bad-patch',
    'bad-path', 'bad-payload', 'bad-perms', 'bad-polarity', 'bad-pool', 'bad-price',
    'bad-priority', 'bad-proposal', 'bad-qty', 'bad-range', 'bad-reason', 'bad-ref',
    'bad-reliability', 'bad-resource', 'bad-response', 'bad-role', 'bad-round', 'bad-rows',
    'bad-rungs', 'bad-scope', 'bad-seed', 'bad-seed-keys', 'bad-segments', 'bad-seq',
    'bad-session', 'bad-shape', 'bad-sig', 'bad-slot', 'bad-source', 'bad-span',
    'bad-stakes', 'bad-state', 'bad-step', 'bad-strategy', 'bad-tape', 'bad-task',
    'bad-text', 'bad-tier', 'bad-time', 'bad-token', 'bad-trigger', 'bad-trust',
    'bad-type', 'bad-use', 'bad-value', 'bad-verdict', 'bad-version', 'bad-volume',
    'bad-weight', 'bad-who', 'bad-word', 'band-cap', 'beat-order-locked', 'below-threshold',
    'blank', 'blocked', 'blocked-delivered', 'blueprint-absent', 'bottom', 'branches-full',
    'branchtree-absent', 'breaches-full', 'bridge-absent', 'budget-exhausted', 'build-throw', 'burst',
    'busy', 'cannot-afford', 'capacity', 'cases-full', 'chain-effects-full', 'chain-nested', 'chain-terminal', 'chains-full',
    'change-not-applied', 'checksum-mismatch', 'choose-failed', 'claimed-by-other', 'clear-throw', 'closed',
    'clues-full', 'coalesced', 'conflicts-unresolved', 'consume-failed', 'contract-mismatch', 'contracts-full',
    'contrast-failed', 'contrast-thrown', 'crowd', 'cycle', 'dangling-ref', 'deals-full',
    'debts-throw', 'dedup', 'deferred-full', 'disabled', 'div-zero', 'dup-rung',
    'dup-text', 'duplicate', 'duplicate-blueprint', 'duplicate-enact', 'duplicate-event', 'duplicate-hypothesis',
    'duplicate-id', 'duplicate-op', 'duplicate-project', 'duplicate-receipt', 'duplicate-seed', 'duplicate-settle',
    'duplicate-tick', 'effects-full', 'emotion-word', 'empty', 'empty-blueprint', 'empty-goal',
    'empty-graph', 'empty-input', 'empty-observation', 'empty-path', 'empty-post', 'empty-response',
    'empty-roster', 'empty-round', 'empty-seed', 'empty-surface', 'empty-tape', 'empty-text',
    'end-failed', 'engine-absent', 'enigma-failed', 'enqueue-threw', 'error', 'events-full', 'evidence-full',
    'evolve-key-mismatch', 'evolve-needs-single-key', 'exec-absent', 'exists', 'export-failed', 'export-throw',
    'expr-too-long', 'eye-face-clash', 'fault-handled', 'finished', 'flat-rounds', 'flush-failed',
    'fondness-missing', 'foreign-chat', 'fork-failed', 'frozen', 'future-event', 'gated-off',
    'goal-not-active', 'goods-full', 'guarded-key', 'hard-cut', 'hops-full', 'identical',
    'identity-incomplete', 'in-replay', 'in-transit', 'in-transit-full', 'incomplete-dice', 'insufficient',
    'insufficient-budget', 'insufficient-contrib', 'insufficient-evidence', 'insufficient-funds', 'insufficient-progress', 'insufficient-samples',
    'insufficient-support', 'intel-missing', 'intel-threw', 'invalid-actors', 'invalid-input', 'judge-not-configured',
    'kind-locked', 'knowers-full', 'landed-immutable', 'ledger-throw', 'lib-unreadable', 'library-full',
    'link-off', 'locked', 'major-gate', 'manual-mode', 'metrics-full', 'migration-loop',
    'missing', 'missing-accepter', 'missing-actor', 'missing-answer', 'missing-base', 'missing-buyer',
    'missing-cause', 'missing-chain', 'missing-changes', 'missing-claim', 'missing-coverage', 'missing-deal',
    'missing-delayed', 'missing-dest', 'missing-direction', 'missing-distance', 'missing-effect', 'missing-event',
    'missing-evidence', 'missing-fields', 'missing-find', 'missing-foreshadow', 'missing-from', 'missing-goal',
    'missing-guarantor', 'missing-handover', 'missing-holder', 'missing-hurt', 'missing-id', 'missing-key',
    'missing-keys', 'missing-kind', 'missing-maker', 'missing-name', 'missing-need', 'missing-op',
    'missing-operator', 'missing-opid', 'missing-owner', 'missing-penalty', 'missing-perm', 'missing-person',
    'missing-preview', 'missing-purpose', 'missing-question', 'missing-reason', 'missing-role', 'missing-round',
    'missing-route', 'missing-source', 'missing-span', 'missing-stamp', 'missing-steps', 'missing-text',
    'missing-thread', 'missing-title', 'missing-token', 'missing-transit-time', 'missing-trigger', 'missing-user',
    'missing-what', 'missing-who', 'missing-why', 'missing-window', 'missing-with', 'module-absent',
    'module-missing', 'name-taken', 'need-confirm', 'need-receipt', 'need-resync', 'need-steps', 'need-unmet',
    'negative-span', 'nested-deferred', 'never-swept', 'no-action', 'no-active-goal', 'no-actor',
    'no-aftermath', 'no-authority', 'no-base', 'no-baseline', 'no-basis', 'no-batch',
    'no-budget', 'no-bytes', 'no-campaign', 'no-candidates', 'no-capacity', 'no-change',
    'no-channel', 'no-chat', 'no-chronicle', 'no-clock', 'no-companion', 'no-conflict',
    'no-debt', 'no-draft', 'no-entry', 'no-factions', 'no-goal', 'no-history',
    'no-host', 'no-id', 'no-input-el', 'no-journey', 'no-lab', 'no-legends',
    'no-localStorage', 'no-merit', 'no-migration', 'no-name', 'no-needs', 'no-negative-step',
    'no-new-remedy', 'no-ops', 'no-options', 'no-outline', 'no-pack', 'no-pending',
    'no-perf-trace', 'no-plan', 'no-preview', 'no-proposal', 'no-reading', 'no-receipt',
    'no-relation-face', 'no-result', 'no-rotation', 'no-rules', 'no-scene',
    'no-sections', 'no-seed', 'no-session', 'no-shadow', 'no-signal', 'no-snapshot',
    'no-stages', 'no-step', 'no-steps', 'no-storage', 'no-store', 'no-story-clock', 'no-such-experience',
    'no-such-project', 'no-such-vol', 'no-tape', 'no-templates', 'no-th', 'no-time-word',
    'no-trace', 'no-usable-keys', 'no-view', 'no-volume', 'non-finite', 'non-monotonic',
    'non-positive-delta', 'none', 'not-a-function', 'not-a-number', 'not-a-party', 'not-a-string',
    'not-accepted', 'not-active', 'not-advancing', 'not-approved', 'not-array', 'not-assigned',
    'not-at-cap', 'not-authorized', 'not-bound', 'not-claimed', 'not-comparable', 'not-due',
    'not-empty', 'not-entitled', 'not-equivalent', 'not-found', 'not-injected', 'not-kept',
    'not-met', 'not-mounted', 'not-needed', 'not-object', 'not-on-roster', 'not-open',
    'not-owner', 'not-pending', 'not-planned', 'not-recording', 'not-replaying', 'not-resolved',
    'not-running', 'not-undoable', 'nothing-to-accept', 'nothing-to-choose', 'nothing-to-correct', 'nothing-to-export',
    'nothing-to-extract', 'nothing-to-import', 'nothing-to-offset', 'nothing-to-verify', 'occupied', 'off-step',
    'one-sided', 'ops-full', 'orders-full', 'org-missing', 'orgs-full', 'orphaned-epoch',
    'out-of-order', 'out-of-range', 'outfit-clash', 'over-budget', 'over-cap', 'over-pace',
    'overflow', 'overlap', 'pack-too-big', 'pages-full', 'parent-cycle', 'parent-locked',
    'parse-fail', 'path-missing', 'payroll-throw', 'pending-full', 'pending-mismatch', 'permission-denied',
    'places-full', 'plans-full', 'plugin-blocked', 'pool-full', 'pre-violation', 'preview-rejected',
    'preview-throw', 'price-out-of-band', 'probe-threw', 'produce-failed', 'project-closed', 'project-throw',
    'projects-full', 'proposals-full', 'purpose-changed', 'quiet-period', 'rand-absent', 'rand-unavailable',
    'read-back-failed', 'read-failed', 'readback-failed', 'reconcile-throw',
    'record-failed', 'recording', 'redesign-exhausted', 'refund-failed', 'rehearsal-absent', 'relation-absent', 'relation-not-authorized',
    'relation-off', 'relation-threw', 'remove-threw', 'revoked', 'road-closed', 'road-crowded',
    'role-taken', 'roster-throw', 'round-not-recorded', 'route-blocked', 'routes-full', 'rows-full',
    'rumor-absent', 'same-gear', 'same-layer', 'same-person', 'sandbox-failed', 'sandbox-throw',
    'sandbox-timeout', 'save-threw', 'scheduled-elsewhere', 'seats-full', 'sediment-absent', 'seed-throw',
    'self-approve', 'self-cause', 'self-origin', 'self-pair', 'self-parent', 'self-road',
    'settings-bus-absent', 'settle-failed', 'settle-not-here', 'settle-throw', 'shadow-closed', 'shipments-full',
    'short-input', 'short-stock', 'shortfall', 'slots-exhausted', 'slots-full', 'source-cap', 'source-threw',
    'stage-off', 'stage-out-of-range', 'stage-skip', 'staged-still-present', 'stale', 'stale-base',
    'stale-baseline', 'stale-chat', 'stale-epoch', 'stale-event', 'stale-preview', 'stale-proposal',
    'stale-rev', 'stale-round', 'stale-step', 'step-running', 'steps-full', 'step-too-large', 'still-in-transit',
    'storage-unavailable', 'store-', 'store-absent', 'store-fail', 'store-unavailable', 'suppressed-full',
    'sweep-throw', 'tape-open', 'tape-version-mismatch', 'tape-without-values', 'text-too-short', 'theme-absent',
    'theme-refused', 'theme-throw', 'thread-terminal', 'threshold-unmet', 'threw', 'throw',
    'thrown', 'time-conflict', 'too-deep', 'too-early', 'too-few', 'too-few-hypotheses',
    'too-long', 'too-many', 'too-many-coverage', 'too-many-ops', 'too-many-stages', 'too-many-steps',
    'too-many-tries', 'too-new', 'too-short', 'too-soon', 'top', 'top-role',
    'top-stage', 'trailing-token', 'transfer-failed', 'transitions-full', 'tries-exhausted', 'type',
    'unappliable', 'unbalanced-paren', 'unexpected-end', 'unexpected-token', 'unexplained', 'unknown-action',
    'unknown-actor', 'unknown-anchor', 'unknown-basis', 'unknown-blueprint', 'unknown-breach', 'unknown-case',
    'unknown-cause', 'unknown-chain', 'unknown-class', 'unknown-decision', 'unknown-derive', 'unknown-event',
    'unknown-fact', 'unknown-format', 'unknown-goal', 'unknown-good', 'unknown-hook', 'unknown-hypothesis',
    'unknown-keys', 'unknown-kind', 'unknown-legend', 'unknown-message', 'unknown-metric', 'unknown-name',
    'unknown-op', 'unknown-opportunity', 'unknown-org', 'unknown-pack', 'unknown-page', 'unknown-parent',
    'unknown-participant', 'unknown-place', 'unknown-policy', 'unknown-post', 'unknown-pulse', 'unknown-recipe',
    'unknown-role', 'unknown-route', 'unknown-scene', 'unknown-schema', 'unknown-seat', 'unknown-seed',
    'unknown-shipment', 'unknown-site', 'unknown-source', 'unknown-span', 'unknown-stage', 'unknown-subject',
    'unknown-theme', 'unknown-transition', 'unknown-user', 'unparseable', 'unreachable', 'unreadable',
    'verify', 'weak-evidence', 'window-closed', 'window-too-short', 'world-missing', 'write',
    'write-fail', 'write-failed', 'wrongs-full'
  ];
  /** 成功面冻结快照（v2.192.0 现场实测 34 条）。
   *  它们**只**出现在 `ok:true` 对象里 —— 不配恢复动作，`explain()` 对它们给 `kind:null`。
   *  与现场的逐条一致性由 tests/reject-recovery-lock-v2192.js 核对（多一条少一条都红）。 */
  const SUCCESS_FACE = ['absent', 'all-duplicates', 'already', 'already-consumed', 'already-open',
    'anonymous', 'applied', 'attenuated', 'checked', 'clean', 'first', 'first-baseline',
    'halted', 'interior-blocked', 'module-disabled', 'needs-real-device', 'no-elapsed', 'no-far',
    'not-holder', 'not-in-table', 'not-registered', 'ok', 'omniscient', 'out-of-lens', 'pass',
    'player-view', 'premature', 'range-off', 'reuse', 'same-day', 'trigger-fired', 'triggered',
    'unlocked', 'within-lock'];
  /** 判不出面冻结快照（v2.192.0 现场实测 53 条），与 NEUTRAL_REVIEW 的键集**必须逐字相同**。 */
  const NEUTRAL_FACE = ['after-reply', 'already-done', 'already-json', 'already-running',
    'bridge-threw', 'budget', 'climate-throw', 'commitment', 'commitment-fulfilled',
    'condition-unmet', 'corrupt-overflow', 'crisis', 'diag-idle', 'distorted', 'duty-off',
    'empty-string', 'faithful', 'fidelity-off', 'folded_too_small', 'high-vigilance',
    'length-or-empty', 'manual', 'missing-target', 'narrative-only', 'no-act-row',
    'no-act-id', 'no-stale-subkeys', 'no_sources', 'not-enabled', 'not-in-office', 'not-on-chain', 'step-threw',
    'nothing-recorded', 'off-duty', 'on-duty', 'orphan-recovery', 'over_budget', 'pending_dropped',
    'pinned_over_budget', 'plan-unavailable', 'prerequisite-open', 'ready', 'recorded',
    'registry-missing', 'resource-missing', 'restore-failed', 'revivable', 'schedule',
    'step-not-running', 'stringify-failed', 'trusted-person', 'unconfirmed', 'unreciprocated',
    'unregistered-setting'];
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
    } else {
      const k = ruleKind(c);
      if (k) out = { code: c, face: face, kind: k, action: KIND_ACTION[k], via: 'rule',
        why: '按码名形态归入「' + k + '」' };
      else if (has(OVERRIDES, c)) {
        const r2 = OVERRIDES[c];
        out = { code: c, face: face, kind: r2.kind, action: KIND_ACTION[r2.kind], why: r2.why, via: 'override' };
      } else out = { code: c, face: face, kind: null, action: null, via: 'undecided', why: '拒收面残余未登记' };
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
      ok: !bad.length, version: '2.195.0', checks: checks, failed: bad,
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
    WA.registerModule('engines/reject-recovery.js', { kind: 'engine', ver: '2.195.0' });
  }
})();