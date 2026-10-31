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
    // v2.275.0（D 类第 11 组）：上面补进拒收面的 3 条里，两条规则表判不出
    //   （`env-decides` 的 env/decides 与 `unusable` 都不在词表里），一条判得却**判错了档**：
    //     · unknown-step 会被 `unknown` 抢成 request-setup（「先把缺的前置补上」）——
    //       而它其实是**步骤 id 拼错**，该改的是输入，不是去补前置。故显式覆盖。
    //   OVERRIDES 的键必须都在 REJECT_FACE 里（A8 咬这一条），上面三条已同批入面快照。
    'env-decides': { kind: 'permanent-reject', why: '这一步环境判得出真读数，手动标记不许覆盖它 —— 不是重试能解决的' },
    'unknown-step': { kind: 'adjust-input', why: '步骤 id 拼错了（开局三步只有 api / tier / talk）：改 id，不是去补前置' },
    'unusable': { kind: 'manual-review', why: '交接包一块可用的都没有：修包还是弃包，机器判不了' },
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
    'write': { kind: 'retry-same-input', why: '写盘失败：同输入再写一次（store 已自带重试）' },
    // ── v2.203.0 补登：规则表判不了（分词里没有「架构/超前」语义），逐条显式登记 ──
    'schema-ahead': { kind: 'manual-review', why: '保存的世界快照版本比当前支持的更新：自动分支无法判断该降级读还是该拒读' },
    'carries-world-facts': { kind: 'adjust-input', why: '导入体顶层夹带世界事实字段：把这些字段从包里去掉（世界事实只能走世界侧入口），再导入' },
    // ── v2.209.0（优化 6）：面板导航与助手面的两条 ──
    'rec-ambiguous': { kind: 'manual-review', why: '切页后按 data-rec 定位命中 >1 条：本仓口径「不猜」（猜一条比报一句没渲染出来更坏，用户会以为定位是对的），该由人确认取哪条' },
    'channel-unconfigured': { kind: 'request-setup', why: '助手通道未配置（缺 baseUrl 或 model）：先把通道配好再问' },
    // ── v2.211.0（优化 Q1）：启动完整性闸门的拒收码 ──
    //   为什么它必须显式登记：码名分词是 ['load','integrity']，六档规则表里没有任何一个
    //   词表收这两个 token ⇒ `ruleKind()` 返回空 ⇒ 不登记就是 `via:'undecided'`
    //   （拒收面残余未登记，`explain()` 给 kind:null）。判据不是「猜个像的档」，
    //   而是按语义归：闸门拒写的原因是**关键模块缺席**（六个写链路依赖），
    //   已经明确点名缺哪几个、也已有恢复入口 `WA.loadRetry(rel)` —— 缺的是前置，不是输入错。
    //   边界（对照六档）：不是 rollback（本次写根本没发生，没有半份状态要退）、
    //   不是 adjust-input（用户改自己的输入改不出那几个模块）、
    //   不是 manual-review（机器判得很清、也点了名，不需要人来判）、
    //   不是 permanent-reject（补上文件就能恢复，本仓明言「失败必须可见、不许静默」而非「不许恢复」）。
    //   三个早退码（missing-rel / no-loader-state / not-failed）不在此登记：
    //   规则表收得住它们（missing→request-setup、no→request-setup、not→adjust-input），
    //   `explain()` 对它们走 `via:'rule'`；在此凭空再登记一份就是「同一件事两个真源」。
    // ── v2.216.0（优化 Q7）：凭据摘要面的拒收码 ──
    //   为什么必须显式登记：码名分词是 ['archived']，六档规则表里没有任何一个词表收它
    //   ⇒ `ruleKind()` 返回空 ⇒ 不登记就是 `via:'undecided'`（拒收面残余未登记）。
    //   按语义归 rollback：这一笔**已经提交过**，完整回执只是被容量挤出去了 ——
    //   处置方向与 `already-done` 同（不能原地重来，要按新状态改写），
    //   而不是 retry-same-input（重试就等于把同一件事再做一遍）。
    'archived': { kind: 'rollback', why: '这一笔已提交过，完整回执按容量环形退场、凭据仍在摘要台账：不能原地重做，要按「已做过」的新状态改写' },
    // v2.229.0（拓展 N11）：`reasoning-only`（engines/reasoning.js 的 `officialOnly`）——
    //   分词是 ['reasoning','only']，六档规则表里没有任何一个词表收它们
    //   ⇒ `ruleKind()` 返回空 ⇒ 不登记就是拒收面残余未登记。
    //   按语义归 `request-setup`：缺的是「正式产出」这一前置，重发一轮即可。
    //   边界：它与 `empty-text`（什么都没写）、`shortfall`（写了但不够长）同族，
    //   但绝不可合成一个码：「只写了思考」与「什么都没写」是两件事，
    //   合成一个即让「推理冒充产出」在读数上长得像「模型没说话」。
    'reasoning-only': { kind: 'request-setup', why: '只有思考段、没有正式产出：这一段不该落地，重发一轮要正文' },
    // ── v2.230.0（拓展 N12）：拒收面残余逐条显式登记（规则表分词收不住它们）──
    //   判据来源：tools/reject-recovery.js 的 audit() 把它们报成 via:'undecided'
    //   （拒收面残余未登记，B6 当场现红）。
    'below-min': { kind: 'adjust-input', why: '长度低于下限：改成达标的长度再提交（下限见 length-policy 的 pattern 读数）' },
    'entry-miss': { kind: 'request-setup', why: 'modelink 词表里查不到这一条：先把被查的条目登记上（want/tried 都在回执里）' },
    'reenter': { kind: 'retry-same-input', why: 'portal 本轮签名已出现过：等这一轮过去同输入再来' },
    'stray': { kind: 'adjust-input', why: '拍类目严格模式下这个 id 不在封闭集里：按 category 改成合法类目' },
    'unrepairable': { kind: 'manual-review', why: 'beat 连续修形都不成立：机器已试尽，需要人看一眼原文' },
    'unrouted': { kind: 'request-setup', why: 'lingqi 找不到能把这句话派下去的承接人：先把承接关系建上' },
    'unsafe-expr': { kind: 'adjust-input', why: '表达式没通过安全白名单：改写成允许的形式再提交' },
    'load-integrity': { kind: 'request-setup', why: '启动完整性缺口：六个写链路关键模块（clock/input-guard/settings-bus/permissions/commit/interceptor）有缺席项 ⇒ 写入被闸门挡住。先按 integrity().missing 把缺的文件补上（或对每个 rel 走 WA.loadRetry 重试装载），闸门自行重算后即恢复' },
    // ── 全量回归体检批次：拒收面残余 18 条逐条显式登记（规则表分词收不住它们，B6 当场报无档）。
    //   判据来源：tools/reject-recovery.js 的 audit() 把它们报成 via:undecided。
    //   每一条都对着源码落点核过（括号配对已确认它确实落在 ok:false 对象里），这里只补回复档。
    //   归法（**按语义，不按像谁**）：在途/被占 ⇒ retry-same-input；前置缺 ⇒ request-setup；
    //   输入形态不被接受 ⇒ adjust-input；资源耗尽/惩戒期内 ⇒ permanent-reject。
    'dnd': { kind: 'retry-same-input', why: '免打扰时段内不打扰：等时段过去同输入再来（followup-gate 的硬闸，与 GT 安静时段同规）' },
    'helper-traveling': { kind: 'retry-same-input', why: '帮手本人在途：等他回来同输入再来（family-ops）' },
    'substitute-traveling': { kind: 'retry-same-input', why: '替工本人在途：等他回来同输入再来（family-ops 两处站点同因）' },
    'person-traveling': { kind: 'retry-same-input', why: '该人物在途旅行、办不了本地事：等他回来（action-desk:1109）' },
    'strayed': { kind: 'rollback', why: '摊主已不在原地、摊已被自动收走：这份回执描述的位置不再存在，只能按新状态改写（stall.stray 的后果，不是可重试的瞬时态）' },
    'max-methods-exceeded': { kind: 'request-setup', why: '行动方法表已装满（默认 64）：先清理退役方法再登记新的，重试同输入不会腾出位置（action-methods:184）' },
    'pool-insolvent': { kind: 'permanent-reject', why: '互助池资金已耗尽：这条赔付请求在这只池上走不通了，要另立池或注资后重开（risk-pooling:198）' },
    'privilege-suspended': { kind: 'permanent-reject', why: '因违规被暂停业务预约权限、尚在惩戒期：现在重试只会再被拒一次（custom-lax:1040，回执带 penaltyId）' },
    'project-suspended': { kind: 'request-setup', why: '公共项目停工待援（缺席代工或降级未处理）：先解决停工原因再推进工单（coop 两处同因）' },
    'rule-violation': { kind: 'adjust-input', why: '违反当地规约（排班限额/资源配额）：按回执里的 ruleName 改申领量或改时间，不是重试（custom-lax 两处）' },
    'unhandled-obligations': { kind: 'request-setup', why: '还有未清义务就迁出：先把义务交接完（demographic-flow:220）' },
    'template-only': { kind: 'adjust-input', why: '首段只是复述关键词、没有展开：按 retryHint 重掷一次并给出正文（dream-settle）' },
    'unrecognized-material': { kind: 'adjust-input', why: '材质名不在环境容量表的封闭集里：改成表内的材质名（environmental-capacity:437）' },
    'unplaced': { kind: 'adjust-input', why: '坐标缺失、只给了名字：补上坐标或选一个已知地点（interest-face 的 refuse；geo-tracker 侧同名 precision 值不在此列）' },
    'unauthorized-practice': { kind: 'request-setup', why: '公开资料不等于操作许可、未获授权禁止实践：先取得授权（knowledge-practice:185）' },
    'toll-required': { kind: 'request-setup', why: '该服务点要先付费/凭通行权：先把通行费或凭证补上（service-network:571）' },
    'unauthorized-trustee': { kind: 'request-setup', why: '委托人不在受托名册上：先把受托关系登记上（social-legacy:574）' },
    'unqualified-master': { kind: 'request-setup', why: '这位师父不够资格带这一门技艺：先提升资质或换人（tech-lineage:123）' },
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
    // ── v2.275.0（D 类第 11 组）：save-health 的两条「上游读数面缺席」。
    //   为什么给档而不是 out:true —— 「模块没装上」是**可以动手补的**（装回来 / 查装载），
    //   与「这条码本来就不是被拒」不同，故走 request-setup 而不折进 out-of-contract。
    //   两条分开留（不合成一个 absent）：处置动作不同 ——
    //   forecaster-absent 去查 storageForecast，audit-absent 去查 capacityAudit。
    'audit-absent': { kind: 'request-setup', why: '容量清点面（capacityAudit）没装上：先把它装回来再看这条读数' },
    'forecaster-absent': { kind: 'request-setup', why: '存储外推面（storageForecast）没装上：先把它装回来再看趋势' },
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
    'narrative-only': { out: true, why: '组织数值只有叙事档，是命中结果不是拒收' },
    'no-act-row': { kind: 'request-setup', why: '找不到对应 act 行：先把该行动登记上' },
    'no-stale-subkeys': { out: true, why: 'changed:false —— 无事可做，非拒收' },
    // v2.195.0（U2 批次⑤）：`no-step` 从判不出面**迁到拒收面** —— 批次③ 给
    //   engines/agency.js 加了一处带 `ok:false` 的同码返回（plan.advance 的显式拒收），
    //   而括号配对判据是「只要有**一处**落在 ok:false 对象里即拒收面」，故它此刻已是拒收码。
    //   它在拒收面上由规则表归 `request-setup`（token `no` / `step` 命中该档词表），
    //   本条登记随之撤销 —— 留在判不出面会让 A7（快照与登记键集逐一对应）当场报红。
    'no-act-id': { kind: 'request-setup', why: '回执连 id 都没有：先把该行动登记成行再送结算' },
    // v2.229.0（拓展 N10）：`no-hit`（engines/retrieval.js 的 `empty-lookup` 看门读数）——
    //   它落在一个 `{tokens, reason}` 对象里（不带 `ok`），故现场面是判不出。
    //   按语义归 `out:true`：「检索没命中」是一个结论，不是调用被拒；
    //   给它编恢复动作就是造数据（与 `narrative-only` / `nothing-recorded` 同规）。
    'no-hit': { out: true, why: '检索面无命中：这是查询结论（「没查到」≠「一切正常」），不配恢复动作' },
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
    'unregistered-setting': { out: true, why: '存储治理：未注册设置项的清理理由' },
    // ── v2.230.0（拓展 N12）：engines/fate.js 的两条**丢弃理由** ──
    //   它们落在 `dropped.push({ index, label, reason })` 里（那个对象不带 `ok`），
    //   故现场面是判不出。按语义归 out:true —— 「这一项为什么没被收进命运表」
    //   是一个**结论**，不是调用被拒；给它编恢复动作就是造数据（与 `narrative-only`
    //   / `nothing-recorded` 同规）。
    'empty-label': { out: true, why: 'fate 建表时该项 label 为空被丢弃：这是筛选结论，不是拒收' },
    // ── 全量回归体检批次：判不出面补登 11 条 —— 全部按 out:true（「不是这层契约的调用被拒」）。
    //   判据不是猜：这些码的落点逐个核过源码，分三类，都不属于「一次调用被世界拒了」：
    //     ① 决策理由（engines/epistemic-view.js 的 deriveAction 四码 unaware-of-topic /
    //        belief-distorted-or-hostile / firm-belief-in-truth / tentative-belief、
    //        engines/bonds.js 的 engageDeepTalk 两码）—— `{action, reason, note}` 形状，
    //        reason 说的是「他打算怎样」，不是「请求被拒」；
    //     ② 筛选/记账结论（engines/rumor.js 的 excludedSecrets 两码、
    //        engines/custom-lax.js 的 reviews 一条）—— 「为什么这一项没被收」；
    //     ③ 已裁定结果（engines/action-desk.js 的 declined 理由 outbid-or-slots-full、
    //        ui/panel.js 的 player-cancel 传参）—— 结果已经落地，没有「再试」这一说。
    //   与 `no-hit` / `narrative-only` / `nothing-recorded` 同规：结论不配恢复动作。
    //   `missing-target` 的登记已随之**迁入拒收面**（那里由规则表按 token missing/target
    //   归 adjust-input，不再需要登记 —— 留一份就是同一件事两个真源）。
    'belief-distorted-or-hostile': { out: true, why: 'epistemic-view 决策理由（action=suspend_and_interrogate）：他信的是失真版本，不是调用被拒' },
    'dissatisfaction-threshold-reached': { out: true, why: 'custom-lax 的 reviews 记录理由（某规矩被投诉到阈值）：这是审计结论，不是调用被拒' },
    'eligible-for-deeptalk': { out: true, why: 'bonds 的 engageDeepTalk 裁决（eligible:true 的配套理由字）：这是可行性结论，不是拒收' },
    'firm-belief-in-truth': { out: true, why: 'epistemic-view 决策理由（action=cooperate_fully）' },
    'insufficient-shared-experience': { out: true, why: 'bonds 的 engageDeepTalk 裁决（eligible:false 的理由）：这是可行性结论，它自带 guidance' },
    'outbid-or-slots-full': { out: true, why: 'action-desk 的 declined 逐人理由：名次已定，理由说的是「为什么没抢到」' },
    'player-cancel': { out: true, why: 'ui/panel.js 传进 laborSchedule.cancel 的理由字：玩家主动撤销，不是被世界拒' },
    'secret-protected': { out: true, why: 'rumor 的 excludedSecrets 筛选理由：秘密受保护所以没进传闻链' },
    'secret-protected-cross-region': { out: true, why: '同上，跨区域分支' },
    'tentative-belief': { out: true, why: 'epistemic-view 决策理由（action=verify_before_commit）' },
    'unaware-of-topic': { out: true, why: 'epistemic-view 决策理由（action=investigate）：他一无所知，不是请求被拒' },
    'near-dup': { out: true, why: 'fate 建表时与已收项近似重复被丢弃（回执里带 of 指认撞的是哪条）：筛选结论' },
      // ── v2.231.0（拓展 EXP-1～EXP-7）：engines/act.js 的工作确认器读数 ──
      //   委托被取消时它返回 `{status:'failed', reason:'contract-cancelled'}` —— 那个对象
      //   **不带 ok**，故现场面是判不出。给档而不是 out:true 的理由：这条读数决定玩家
      //   下一步动作（重新立委托再走），与 `plan-unavailable` / `registry-missing` 同规；
      //   说「契约外」等于把「该怎么办」丢掉。
    'contract-cancelled': { kind: 'request-setup', why: '委托已被取消：这一步没有可结的账，先重新立委托再走' }
  };
/* 拒收面冻结快照（v2.203.0 现场实测 740 条）：至少在 `ok:false` 对象里出现过 ——
   *  只有这一面**才配恢复动作**。与现场的逐条一致性由 tests/reject-recovery-lock-v2192.js 核对。
   *  v2.196.0 收口时本快照**漏同步**（新码 need-receipt / enqueue-threw 未入，三条已随路径删除的
   *  旧码 no-receipt-face / receipt-failed / receipt-threw 未出）—— 快照 723 条与现场 722 条
   *  不符，reject-recovery 专锁 B3/B4/C4 三处自 v2.196.0 起一直是红的（每版都被无头回归现形，
   *  当时只跑了定向锁故未察觉）。本版一并补齐：删三条、加三条（含 Y3 的 slots-full）。
   *  三条新码的恢复档不写 OVERRIDES —— 规则表已按 token 归好（need-receipt→request-setup /
   *  enqueue-threw→retry-same-input / slots-full→adjust-input），重复登记会让 A8 与规则表打架。
   *  v2.203.0（第四批 Y8/Y9 收口）：快照 723 → 740（+17）。四条线（Y6 world-snapshot /
   *  Y7 world-graph / Y8 rule-pack / Y9 world-lab）的新码此前**只进码面口径、没进本快照**，
   *  专锁 B3/B4/C4 因此各自自其版次起一直红着 —— 本版一并补齐（逐条不改档）。
   *  其中 schema-ahead 的恢复档不能靠规则表（分词里没有「架构/超前」语义），故另在
   *  OVERRIDES 显式登记（manual-review：新快照该降级读还是该拒读，机器判不了）
   *  v2.209.0（优化 6）：快照 740 → 754（+14）· 成功面 34 → 35（+1）。
   *  ui/panel-nav.js（新）与 ui/panel.js 的拒收码此前**只进码面口径、没进本快照**，
   *  且 ui/assistant.js 的四条（E1 批 v2.208.0 遗留）同样漏同步 —— 探针实测：
   *  现场 754/35/54 vs 快照 740/34/54，差额全部落在 ui 层。本版一并补齐。
   *  其中 `rec-ambiguous`（>1 处命中，本仓口径「不猜」）另在 OVERRIDES 显式登记
   *  （manual-review：定位到多条同名记录时机器判不了该取哪条）；
   *  `channel-unconfigured`（助手通道未配 baseUrl/model）登记为 request-setup。
   *  v2.221.0（拓展 N3）：现场实测 772 / 快照 769 ⇒ 差 3，三条**全部**不在拒收面快照里：
   *   两条是 v2.220.0（拓展 N2 自动采用面）的新码 —— `auto-adopt-off`（开关默认关）、
   *   `adopt-budget-exhausted`（每轮预算用尽），都在 `engines/plan.js` 的 `ok:false` 分支上；
   *   第三条 `not-registered` 是**同一码两处站点**：`engines/noesis.js` 报 `ok:true, known:null`
   *   （事实没登记过 ⇒ 查询结论，成功面），而 v2.220.0 新加的 `engines/plan.js:193` 把它
   *   当成前置依赖的拒收理由（`ok:false`）—— 括号配对判据是「只要**一处**落在 ok:false 对象里
   *   即拒收面」（与 v2.195.0 的 `no-step` 同一条判据），故它此刻是拒收码，从成功面**迁入**本面。
   *   三码的恢复档均不写 OVERRIDES：码名分词本就被规则表收住 ——
   *   `auto-adopt-off` 的 `off` 收在 permanent-reject 档、`adopt-budget-exhausted` 的 `budget`
   *   收在 adjust-input 档、`not-registered` 的 `not` 收在 adjust-input 档（三者实测 via:'rule'），
   *   再登记一份就是「同一件事两个真源」。
   *  v2.222.0（拓展 N4）：现场实测 775 / 快照 772 ⇒ 差 3，三条**全部**来自新引擎
   *   `engines/evidence-board.js`，且是同一件事的三张面孔 —— 编排面把**来源模块**的口调崩时，
   *   如实记下是哪个来源抛的（`rumor` / `investigation` / `noesis` 三条路各自成码），
   *   不吞成「没发生」、也不折成编排层自造码。分列而不合成一个 `threw` 的理由：
   *   现场据此决定去哪一侧排障（链面 / 线索面 / 知情面），合成一栏就再也答不出。
   *   （同族的 `probe-threw` / `intel-threw` 早已在本面，本条只是把另外三条补齐。）
   *   三码的恢复档同样不写 OVERRIDES：分词里的 `threw` 本就被规则表收在 retry-same-input 档
   *   （与 `report-threw` / `settle-threw` 同一条规则，实测 via:'rule'）。    *  v2.225.0(优化 Q8 面板减负):现场实测 777 / 快照 775 ⇒ 差 2,两条全部来自本版新面。
   *   1 `unknown-section`(ui/panel-fold.js):段名认得、页名认得,只有段 id 拼错 ——
   *     与 `unknown-page` **分开报**(前者改段 id,后者改页名,处置不同)。
   *   2 `fold-module-missing`(ui/panel.js 绑定层):折叠模块缺席时如实报出,
   *     不静默当展开 —— 那会让「模块没装上」与「用户就是展开着」长得一样。
   *   两条都不进死表与基线:模块缺席(扩展目录被部分同步)与段 id 拼错都是真会发生的局面,
   *   见证由 tests/q8-panel-fold-v2225.js 的 B3/B3b/B3c 三段真跑。
   *   恢复档均不写 OVERRIDES:`unknown-*` 的分词本就被规则表收在 adjust-input 档。
   */
  const REJECT_FACE = [
    // ── v2.231.0（拓展 EXP-1～EXP-7）：本批七个新引擎（training / gear / production /
    //   survey / contest / ruling / activity）新增的 49 条拒收码 —— 它们此前**只进码面口径、
    //   没进本快照**，reject-recovery 专锁 B3/B4/C4 自本批起一直红着（同一形态本仓已栽过
    //   四次：v2.203.0 的 17 条、v2.209.0 的 14 条、v2.221.0 的 3 条、v2.222.0 的 3 条）。
    //   本版按现场复算一次收敛，逐条不改档：探针实测 49 条**全部**由规则表收住
    //   （via:'rule'、无档 0 条）⇒ 一条都不写 OVERRIDES（重复登记会让 A8 与规则表打架）。
    //   三条面迁移同批落定（见下方 SUCCESS_FACE / NEUTRAL_FACE / NEUTRAL_REVIEW 的对应段）：
    //     · not-holder：engines/gear.js 的三处 ok:false 站点（v2.231.0 新引擎）使它
    //       从成功面**迁入**拒收面 —— 括号配对判据是「只要**一处**落在 ok:false 对象里
    //       即拒收面」（与 v2.195.0 的 no-step、v2.221.0 的 not-registered 同一条判据）。
    //     · anchored / scope：engines/vitals.js 与 engines/floor-settle.js 的新成功返回
    //       （ok:true）⇒ 迁入成功面。
    //     · contract-cancelled：engines/act.js 的工作确认器（那个对象不带 ok）⇒ 判不出面，
    //       并同批在 NEUTRAL_REVIEW 登记（A7 要求快照与登记键集逐字相同）。
    'abilities-full', 'all-conflict', 'already-refunded', 'attrs-empty', 'attrs-off',
    'bad-phase', 'case-closed', 'case-not-ruled', 'entity-absent', 'entity-unavailable',
    'exhibits-full', 'facilities-full', 'items-full', 'jobs-full', 'message-missing',
    'missing-end', 'mode-mismatch', 'no-book', 'no-economy', 'no-grounds',
    'no-judge', 'no-new-grounds', 'no-penalty', 'no-such-activity', 'no-such-case',
    'no-such-scene', 'no-such-spot', 'no-such-stage', 'not-done', 'not-equipped',
    'not-holder', 'order-closed', 'order-delivered', 'penalties-full', 'rulings-full',
    'scene-closed', 'scenes-full', 'scout-closed', 'short-cost', 'short-fine',
    'short-material', 'short-supply', 'slot-taken', 'spots-full', 'unknown-item',
    'unknown-order', 'unknown-party', 'unknown-scout', 'worn-out',
    'act-absent', 'act-unavailable', 'action-refused', 'action-throw', 'actor-claimed-by-other', 'add-chain-threw', 'adopt-budget-exhausted',
     'adopt-throw', 'auto-adopt-off',
    'aftermath-wait', 'ahead-of-head', 'alias-cycle', 'all-rejected', 'all-steps-refused', 'already-',
    'already-abandoned', 'already-adopted', 'already-answered', 'already-arrived', 'already-closed', 'already-confirmed',
    'already-covered', 'already-decided', 'already-delivered', 'already-in-transit', 'already-linked', 'already-locked',
    'already-pending', 'already-recording', 'already-resolved', 'already-revealed', 'already-settled', 'already-terminal',
    'already-there', 'already-transited', 'already-written', 'anchors-full', 'api-fail', 'apply-throw',
    // v2.216.0（优化 Q7）：凭据摘要面的拒收码 —— 提交过、完整回执已被环形挤出。
    //   它不是结构不可达：长局里回执台账超过 cap 64 就会真落到它（见证由
    //   tests/reject-v2780.js 真跑：连提 71 笔后 replay 首笔）。
    'archived', 'auto-off', 'awaiting-after', 'backup-corrupt', 'backward', 'bad-action', 'bad-actor',
    'bad-after', 'bad-amount', 'bad-anchor', 'bad-args', 'bad-axis', 'bad-base',
    'bad-behavior', 'bad-blueprint', 'bad-bp-keys', 'bad-bp-ver', 'bad-budget', 'bad-cap',
    'bad-chain', 'bad-channel', 'bad-char', 'bad-choice', 'bad-conflict', 'bad-coord',
    'bad-cost', 'bad-countdown', 'bad-defer', 'bad-delta', 'bad-diff', 'bad-draft', 'bad-due',
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
    'clues-full', 'coalesced', 'conflicts-unresolved', 'consume-failed', 'consumer-missing', 'contract-mismatch', 'contracts-full',
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
    // v2.225.0(Q8 面板减负):面板专家的折叠面 —— 面板侧在折叠模块缺席时如实报出
    //   (不静默当展开:那会让「模块没装上」与「用户就是展开着」长得一样)。
    'fold-module-missing',
    'fondness-missing', 'foreign-chat', 'fork-failed', 'frozen', 'future-event', 'gated-off',
    'goal-not-active', 'goods-full', 'guarded-key', 'hard-cut', 'hops-full', 'identical',
    'identity-incomplete', 'in-replay', 'in-transit', 'in-transit-full', 'inbound-bridge-missing', 'incomplete-dice', 'insufficient',
    'insufficient-budget', 'insufficient-contrib', 'insufficient-evidence', 'insufficient-funds', 'insufficient-progress', 'insufficient-samples',
    'insufficient-support', 'intel-missing', 'intel-threw', 'invalid-actors', 'invalid-input',
    // v2.222.0（拓展 N4）：调查证据工作台的三个来源抛错码（见上段沿革）。
    'investigation-threw', 'judge-not-configured', 'noesis-threw', 'rumor-threw',
    'kind-locked', 'knowers-full', 'landed-immutable', 'ledger-throw', 'lib-unreadable', 'library-full',
    'link-off', 'link-threw', 'locked', 'major-gate', 'manual-mode', 'metrics-full', 'migration-loop',
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
    'no-budget', 'no-bytes', 'no-campaign', 'no-candidates', 'no-capacity', 'no-cause', 'no-change',
    'no-channel', 'no-chat', 'no-chronicle', 'no-clock', 'no-companion', 'no-conflict',
    'no-debt', 'no-draft', 'no-entry', 'no-factions', 'no-goal', 'no-history',
    'no-host', 'no-id', 'no-input-el', 'no-journey', 'no-lab', 'no-legends',
    'no-localStorage', 'no-merit', 'no-migration', 'no-name', 'no-needs', 'no-negative-step',
    'no-new-remedy', 'no-ops', 'no-options', 'no-outline', 'no-pack', 'no-pending',
    'no-perf-trace', 'no-plan', 'no-preview', 'no-proposal', 'no-reading', 'no-receipt',
    'no-relation-face', 'no-result', 'no-rotation', 'no-rules', 'no-scene',
    'no-sections', 'no-seed', 'no-session', 'no-shadow', 'no-signal', 'no-snapshot',
    'no-stages', 'no-step', 'no-steps', 'no-storage', 'no-store', 'no-story-clock', 'no-subject', 'no-such-experience',
    'no-such-project', 'no-such-vol', 'no-tape', 'no-templates', 'no-th', 'no-time-word',
    'no-trace', 'no-usable-keys', 'no-view', 'no-volume', 'non-finite', 'non-monotonic',
    'non-positive-delta', 'none', 'not-a-function', 'not-a-number', 'not-a-party', 'not-a-string',
    'not-accepted', 'not-active', 'not-advancing', 'not-approved', 'not-array', 'not-assigned',
    'not-at-cap', 'not-authorized', 'not-bound', 'not-claimed', 'not-comparable', 'not-due',
    'not-empty', 'not-entitled', 'not-equivalent', 'not-found', 'not-injected', 'not-kept',
    'not-met', 'not-mounted', 'not-needed', 'not-object', 'not-on-roster', 'not-open',
     'not-registered',
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
    'read-back-failed', 'read-failed', 'readback-failed', 'reasoning-only', 'reconcile-throw',
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
    // v2.225.0(Q8 面板减负):段名认得、页名认得,只有段 id 拼错 ——
    //   与 unknown-page 分开报(前者要改段 id,后者要改页名,处置不同)。
    'unknown-section',
    'unknown-shipment', 'unknown-site', 'unknown-source', 'unknown-span', 'unknown-stage', 'unknown-subject',
    'unknown-theme', 'unknown-transition', 'unknown-user', 'unparseable', 'unreachable', 'unreadable',
    'verify', 'weak-evidence', 'window-closed', 'window-too-short', 'world-missing', 'write',
    'write-fail', 'write-failed', 'wrongs-full',
    // ── v2.203.0 补登：四条线的拒收面新码（此前只进码面口径、没进本快照）──
    'ambiguous-label', 'bad-edge-kind', 'bad-snapshot-ver', 'budget-exceeded', 'empty-snapshot',
    'empty-world', 'ls-write-failed', 'schema-ahead', 'source-absent',
    'carries-world-facts', 'conflict', 'preset-world-absent',
    'causal-absent', 'no-report', 'stale-report', 'commit-absent', 'beat-ledger-absent',
    // ── v2.209.0（优化 6）：面板导航协议（ui/panel-nav.js）与助手面（ui/assistant.js）的拒收码 ──
    //   现场实测 754 / 快照 740 ⇒ 差 14。其中本批 11 条由 panel-nav（9）与 panel（2）报出，
    //   另 3 条（channel-unconfigured / empty-question / no-search-face）属 ui/assistant.js
    //   的既有欠债（E1 批 v2.208.0 遗留），一并补齐 —— 探针 probe11 逐条对照过「只在现场」的清单。
    'bad-page', 'empty-rec', 'empty-target', 'nav-module-missing',
    'no-back', 'no-body', 'no-page', 'no-page-table', 'rec-not-rendered', 'ui-module-missing',
    'rec-ambiguous', 'channel-unconfigured', 'empty-question', 'no-search-face',
    // ── v2.211.0（优化 Q1）：同版加载与启动完整性闸门的四条 ──
    //   现场实测 758 / 快照 754 ⇒ 差 4，四条全来自本版新写的入口侧：
    //   `load-integrity`（写侧闸门拒收，core/store.js 与 index.js 各报一处）、
    //   `missing-rel` / `no-loader-state` / `not-failed`（恢复入口 `loadRetry` 的三个早退分支）。
    //   这四条**都不是结构不可达**：扩展目录被部分同步、清理工具删掉文件、用户手改目录
    //   都会真触发它们 —— 故进快照与恢复档，不进死表（见证由 tests/reject-v2780.js 真跑）。
    'load-integrity', 'missing-rel', 'no-loader-state', 'not-failed',
    // ── v2.275.0（全量回归排红 · D 类第 11 组）：现场复算面比快照多 9 条，
    //   其中 3 条属拒收面。它们由 v2.263.0 ~ v2.274.0 之间落地的模块带出来，
    //   一直**只进码面口径、没进本快照** —— 专锁 B3/B4/B6/C4 因此长期红着
    //   （同一形态本仓已栽过五次：v2.203.0 / v2.209.0 / v2.221.0 / v2.222.0 / v2.231.0）。
    //   逐条说清为什么是拒收面（三者都出现在 ok:false 对象里）：
    //     · env-decides（engines/first-run.js）：开局引导「手动标记」被拒 ——
    //       那一步环境判得出（done/todo），手勾不许覆盖真读数。这是拒收，不是决策理由。
    //     · unknown-step（engines/first-run.js）：要标记的 stepId 不在三步里（拼错）。
    //     · unusable（engines/handoff-pack.js）：交接包 verify() 判「一块都没有」，
    //       restore 直接拒收 —— 与 partial（部分可用）分开报，处置不同。
    'env-decides', 'unknown-step', 'unusable',
    // ── v2.211.0(优化 Q2):快照改名导入的身份完整性 ──
    //   现场实测 759 / 快照 758 ⇒ 差 1。该码来自 engines/world-snapshot.js 的
    //   `importSnapshot` 改名支:快照里人物记录的 `id` 与**自身键**不一致时如实拒收
    //   (改名会把这份自相矛盾搬进新世界)⇒ `{ ok: false, reason: 'rename-unsupported' }`。
    //   不是结构不可达:任何手工编辑过、或被外部工具改写过 people 键的存档都真会落到它;
    //   见证由 tests/reject-v2780.js 真跑(本地先有一个同名的人,再拿 id 与键不一致的快照改名导入)。
    'rename-unsupported',
    // ── v2.212.0(优化 Q3):中断落盘的两个失败归因(core/commit.js)──
    //   现场实测 761 / 快照 759 ⇒ 差 2。两条都在 `persistResume` 的落盘支上:
    //   `resume-write-threw`(store.transact **抛错**)与 `resume-write-failed`(transact
    //   返回未提交)。它们**不是结构不可达**:配额已满、存储被禁、并发写冲突都会真落到这两条;
    //   见证由 tests/reject-v2780.js 真跑(trip 把 transact 换成抛错 / 换成 ok:false,再读
    //   `resumeStat().faults` 逐条对上)。
    //   不在此写 OVERRIDES:码名分词 ['resume','write','threw'] / ['resume','write','failed']
    //   里的 `threw` / `failed` 都收在 retry-same-input 词表内 ⇒ `explain()` 走 `via:'rule'`,
    //   再登记一份就是「同一件事两个真源」(与 loadRetry 三码同一判据)。
    'resume-write-failed', 'resume-write-threw',
    // ── v2.217.0（拓展 N6）：schedule.* 持久调度面的两码 ──
    //   现场实测 766 / 快照 764 ⇒ 差 2。`already-ran`（同轮重复事件不多跑，lastRound 落盘
    //   去重）与 `no-round`（轮次读不到 ⇒ 拒收，**绝不退回墙上时间**——拿墙钟当轮次会让
    //   「每 3 轮」变「每 3 秒」，而两者在读数上长得一样）。均带可执行见证（reject-v2780.js
    //   rulePack 段真跑）；不写 OVERRIDES：`already` 收在 already-* 词族、`no-round` 分词
    //   里的 `round` 本就在词表内 ⇒ explain() 走 via:rule。
    'already-ran', 'no-round',
    // ── v2.218.0（拓展 N1）：可编辑战役层新增五码 ──
    //   现场实测 769 / 快照 766 ⇒ 差 5。`bad-plan`（传进来的不是对象）、
    //   `bad-plan-id`（空 id 的删除）、`invalid-plan`（计划机械校验不过，整批拒收）、
    //   `plan-cap`（自定义计划数已满，不静默丢最旧）、`failed`（失败条件触发，
    //   **不是** not-met —— 「这一局输了」与「还没做到」同形会让复盘答不出哪一件）。
    //   五码均带可执行见证（reject-v2780.js campaign 段真跑）。
    //   OVERRIDES 只补判不了的两条：`invalid-plan`（改计划内容，不是重试同输入）
    //   与 `failed`（终态，只能重开）；`bad-plan`/`bad-plan-id` 分词收在 bad-* 词族、
    //   `plan-cap` 收在 cap 词族 ⇒ explain() 走 via:rule。
    'bad-plan', 'bad-plan-id', 'invalid-plan', 'plan-cap', 'failed',
    // v2.230.0（拓展 N12）：按 tools/reject-recovery.js 的现场复算补齐下面这批拒收码。
    //   它们都是本轮之后新增模块带出来的真拒收面返回（length-policy / modelink / portal /
    //   beat / lingqi / fate 等），既不在死表、也不在基线 —— 是快照自己落后于现场。
    'bad-anchor-json', 'bad-floor', 'bad-message', 'bad-num', 'bad-risk', 'bad-skill', 'bad-syntax',
    'below-min', 'closed-thread', 'dup-thread', 'empty-dc', 'empty-deviation', 'empty-formula', 'empty-name',
    'empty-state', 'empty-step', 'empty-transition', 'entry-miss', 'eval-failed', 'flow-incomplete',
    'formula-off', 'no-progress', 'no-signature', 'reenter', 'repair-limit', 'self-loop-or-missing-end',
    'stray', 'strip-empty', 'tie-conflict', 'unknown-attr', 'unknown-draft', 'unknown-floor', 'unknown-key',
    'unknown-person', 'unknown-thread', 'unknown-volume', 'unrepairable', 'unrouted', 'unsafe-expr',
    // ── 全量回归体检批次：按 tools/reject-recovery.js 的现场复算一次性补齐快照。
    //   此前本数组停在 873 条，而现场拒收面已是 1142 条 —— 差 269 条全部是「新引擎带出的
    //   真 ok:false 返回」。同一形态本仓已栽过五次（v2.203.0 的 17 条、v2.209.0 的 14 条、
    //   v2.221.0 的 3 条、v2.222.0 的 3 条、v2.231.0 的 49 条），这是第六次、也是最大的一次。
    //   口径不变：**逐条按现场分面结果照抄**，不改档、不猜语义 —— 面的判据是「有没有一处
    //   落在 ok:false 对象里」，那是括号配对算出来的，不是人读出来的。
    //   同批 `missing-target` 从判不出面**迁入**本面：engines/care-chain.js 的 ok:false 站点
    //   使它成为真拒收码，而旧快照把它记在判不出面（面错了，恢复档就一定错）。
    'actFromScene-missing', 'already-awarded', 'already-defaulted', 'already-dismantled', 'already-fulfilled', 'already-in-phase',
    'already-in-target-layout', 'already-laid', 'already-proposed', 'already-redressed', 'already-today', 'anchor-not-found',
    'asset-already-exists', 'asset-failing-unavailable', 'asset-not-found', 'bad-audience', 'bad-callback', 'bad-candidate-name',
    'bad-governance-model', 'bad-idle', 'bad-key', 'bad-layout-type', 'bad-legacy-type', 'bad-projection',
    'bad-resource-type', 'bad-roll', 'bad-rule-type', 'bad-service-type', 'bad-status', 'bad-target',
    'bad-target-layout', 'bad-user-relation', 'blueprint-not-installed', 'booking-not-found', 'branchDiff-unavailable', 'cancel-unavailable',
    'candidate-not-found', 'capacity-exhausted', 'chapters-engine-unavailable', 'charter-already-exists', 'charter-not-found', 'checkpoint-blocked',
    'checkpoints-unavailable', 'claim-not-found', 'commitment-not-found', 'conflict-existing-world', 'conflict-not-found', 'daily-bookings-full',
    'deceased-not-found', 'destination-capacity-exhausted', 'dnd', 'empty-candidates', 'empty-oplog', 'empty-pool',
    'empty-shares', 'empty-signature', 'entry-not-found', 'epistemic-leak-blocked', 'evidence-not-found', 'facility-not-found',
    'facility-out-of-service', 'facility-unavailable-degraded', 'favor-not-found', 'gear-engine-unavailable', 'gear-not-ready', 'group-distrust-blocked',
    'guarantee-not-active', 'guarantee-not-found', 'hand-edited-conflict', 'handover-closed', 'handover-not-found', 'health-capacity-prohibited',
    'helper-schedule-conflict', 'helper-traveling', 'housing-capacity-exhausted', 'id-already-registered', 'incident-not-found', 'inst-not-available',
    'inst-proposal-failed', 'insufficient-basis', 'insufficient-contribution-priority', 'insufficient-debt', 'insufficient-occurrences', 'insufficient-scrap',
    'insufficient-skill', 'insufficient-treasury', 'interrupt-unavailable', 'invalid-amount', 'invalid-claim-amount', 'invalid-data',
    'invalid-favored-group', 'invalid-flow-type', 'invalid-outcome', 'invalid-path', 'invalid-ratio-sum', 'invalid-slot',
    'invalid-solution', 'invalid-stance', 'invalid-task-def', 'knowledge-already-exists', 'knowledge-not-found', 'laborSchedule-missing',
    'layout-not-declared', 'legacy-not-found', 'lifecycle-missing', 'listing-short', 'max-methods-exceeded', 'method-not-available',
    'migration-not-found', 'missing-anchor-relation', 'missing-arguments', 'missing-asset-id', 'missing-baseline', 'missing-caregiver',
    'missing-charter-id', 'missing-claim-id', 'missing-claimant', 'missing-commitment-id', 'missing-compensation', 'missing-conflict-id',
    'missing-contributor', 'missing-core-traits', 'missing-delta', 'missing-effect-id', 'missing-failure-evidence', 'missing-gate-proof',
    'missing-gear-id', 'missing-group', 'missing-group-id', 'missing-handover-id', 'missing-incident-id', 'missing-item',
    'missing-knowledge-id', 'missing-leader', 'missing-material-id', 'missing-materials', 'missing-opposing-groups', 'missing-place',
    'missing-plaintiff', 'missing-pool-id', 'missing-practitioner', 'missing-prerequisites', 'missing-proposal-id', 'missing-provider',
    'missing-purse', 'missing-region', 'missing-remedy-cost', 'missing-required-engines', 'missing-schedule-slot', 'missing-source-evidence',
    'missing-source-or-nodes', 'missing-specs', 'missing-substitute', 'missing-target', 'missing-violator', 'missing-ward',
    'missing-worker', 'need-two-participants', 'no-active-chapter', 'no-bids', 'no-bus', 'no-dual-obligation',
    'no-estate-to-inherit', 'no-mark', 'no-prior-memory-in-group', 'no-seat', 'no-slot-available', 'no-such-unit',
    'not-a-participant', 'not-a-practitioner', 'not-approved-by-inst', 'not-available', 'not-defaulted', 'not-enrolled-prior-to-disaster',
    'not-in-progress', 'not-interrupted', 'not-proposed', 'not-seated', 'not-under-review', 'nothing-scored',
    'opportunity-closed', 'opportunity-not-found', 'order-not-found', 'owner-unavailable', 'pact-not-found', 'passage-blocked',
    'permit-missing', 'person-already-traveling', 'person-not-found', 'person-traveling', 'pick-failed', 'place-not-found',
    'pool-already-exists', 'pool-closed', 'pool-insolvent', 'pool-not-found', 'precedent-not-found', 'privilege-suspended',
    'project-already-exists', 'project-not-active', 'project-not-found', 'project-suspended', 'project-terminal', 'promise-not-found',
    'promise-not-found-or-inactive', 'proposal-already-exists', 'proposal-not-found', 'queue-full', 'record-not-found', 'recoverAction-missing',
    'reschedule-conflict', 'resource-not-found', 'resume-slot-conflict', 'resume-unavailable', 'retrieval-unavailable', 'retrofit-not-found',
    'route-threw', 'rule-not-active', 'rule-not-found', 'rule-violation', 'same-origin-destination', 'sample-not-found',
    'save-failed', 'sceneFlow-missing', 'schedule-engine-unavailable', 'self-guarantee-invalid', 'self-transfer', 'service-not-provided',
    'situation-unavailable', 'slot-conflict', 'slot-full', 'split-target-conflict', 'split-unavailable', 'stalls-full',
    'strayed', 'substitute-conflict', 'substitute-traveling', 'target-already-full', 'target-entry-missing-on-rollback', 'target-has-conflict',
    'target-not-found', 'target-order-not-found', 'target-order-paused', 'template-only', 'tension-insufficient', 'toll-required',
    'too-many-listings', 'too-small', 'tradition-not-found', 'training-engine-unavailable', 'tx-failed', 'ui-missing',
    'unauthorized-practice', 'unauthorized-trustee', 'unhandled-obligations', 'unit-not-found', 'unknown-prereq-type', 'unknown-rank',
    'unknown-solution', 'unknown-task', 'unmet-env-conditions', 'unplaced', 'unqualified-master', 'unrecognized-material',
    'unsupported', 'unsupported-format-rejected', 'variant-not-found', 'vital-exhaustion-blocked', 'wear-failed',
  ];
  /** 成功面冻结快照（v2.192.0 现场实测 34 条）。
   *  它们**只**出现在 `ok:true` 对象里 —— 不配恢复动作，`explain()` 对它们给 `kind:null`。
   *  与现场的逐条一致性由 tests/reject-recovery-lock-v2192.js 核对（多一条少一条都红）。 */
  const SUCCESS_FACE = ['absent', 'all-duplicates', 'already', 'already-consumed', 'already-open',
    'anonymous', 'applied', 'attenuated', 'checked', 'clean', 'first', 'first-baseline',
    'halted', 'interior-blocked', 'module-disabled', 'needs-real-device', 'no-elapsed', 'no-far',
    'not-in-table', 'ok', 'omniscient', 'out-of-lens', 'pass',
    'player-view', 'premature', 'range-off', 'reuse', 'same-day', 'trigger-fired', 'triggered',
    'unlocked', 'within-lock',
    // v2.209.0（优化 6）：ui/assistant.js 的 `no-terms`（未检索到词条时如实返回 ok:false 之外
    //   的成功面返回）—— 现场实测 success 35 / 快照 34 ⇒ 差 1，属 E1 批既有欠债。
    'no-terms',
    // v2.230.0（拓展 N12）：同上口径补齐成功面（ok:true 侧的返回）。
    'already-cleared', 'disabled-passthrough', 'fallback', 'frame-evicted', 'lenient', 'merged', 'no-edge',
    'nothing-held', 'passthrough', 'replaced', 'same-tier', 'tie', 'unbound', 'unspecified', 'updated',
    // ── v2.231.0（拓展 EXP-1～EXP-7）：两条新成功返回（ok:true）迁入本面；
    //   同批 `not-holder` 因 engines/gear.js 的新 ok:false 站点迁出（见拒收面段）。
    'anchored', 'scope',
    // ── 全量回归体检批次：成功面同样落后现场 33 条。
    //   成功面的判据是「每一处出现都在 ok:true 对象里」—— 这批码的共同点是只出现在成功
    //   返回里，没被任何失败分支复用。快照缺它们的后果与拒收面同型：产品无法独立答出
    //   「这个码是什么面」，只能答 unknown。
    'all-idle-in-scene', 'already-away', 'already-back', 'audit-skipped', 'below-floor', 'busy-scene',
    'cleared', 'compliant', 'evidence-too-weak', 'facility-degraded', 'forbidden-behavior-without-major-event', 'graded',
    'inertia-suppressed', 'last-one', 'no-anchor', 'no-anchor-registered', 'no-declared-compatibility', 'no-idle-characters',
    'no-knowledge-or-skill', 'not-queued', 'persona-drift-detected', 'plain', 'replay', 'same-cell',
    'same-sign', 'schedule-busy', 'target-traveling', 'two-too-close', 'unaware-of-outcome', 'uninformed',
    'unjustified-flattery-blocked', 'unskilled-reader', 'variant-unconfirmed',
    // ── v2.275.0（同上，D 类第 11 组）：4 条成功面。共同点：**都是 ok:true 的空态答案**，
    //   而空态恰恰最容易被当成「失败」写错 —— 它们必须是成功面，
    //   否则 explain() 会给「这一次没内容」配一个恢复动作（= 教玩家去修一件本就正常的事）。
    //     · built（engines/world-diary.js）：日记拼成了（哪怕只有一行）。
    //     · no-people（engines/day-route.js）：人物面还没有生活记录 ——
    //       它自己带 hint 说清「不是今天谁都没动」。与 quiet（真的没人动）分开报。
    //     · no-records（engines/relation-temp.js）：关系变化暂未结算 —— 同上，带 quiet:true。
    //     · quiet（engines/farfield.js）：这一段时长里没有该推的窗口（正常态）。
    'built', 'no-people', 'no-records', 'quiet',
  ];
  /** 判不出面冻结快照（v2.192.0 现场实测 53 条），与 NEUTRAL_REVIEW 的键集**必须逐字相同**。 */
  const NEUTRAL_FACE = ['after-reply', 'already-done', 'already-json', 'already-running',
    'bridge-threw', 'budget', 'climate-throw', 'commitment', 'commitment-fulfilled',
    'condition-unmet', 'corrupt-overflow', 'crisis', 'diag-idle', 'distorted', 'duty-off',
    'empty-string', 'faithful', 'fidelity-off', 'folded_too_small', 'high-vigilance',
    'length-or-empty', 'manual', 'narrative-only', 'no-act-row',
    'no-act-id', 'no-hit', 'no-stale-subkeys', 'no_sources', 'not-enabled', 'not-in-office', 'not-on-chain', 'step-threw',
    'nothing-recorded', 'off-duty', 'on-duty', 'orphan-recovery', 'over_budget', 'pending_dropped',
    'pinned_over_budget', 'plan-unavailable', 'prerequisite-open', 'ready', 'recorded',
    'registry-missing', 'resource-missing', 'restore-failed', 'revivable', 'schedule',
    'step-not-running', 'stringify-failed', 'trusted-person', 'unconfirmed', 'unreciprocated',
    'unregistered-setting',
    // v2.230.0（拓展 N12）：同上口径补齐判不出面（源码里那个对象不带 ok）。
    'empty-label', 'near-dup',
    // ── v2.231.0（拓展 EXP-1～EXP-7）：engines/act.js 的工作确认器读数（对象不带 ok）。
    'contract-cancelled',
    // ── 全量回归体检批次：判不出面补齐 11 条。它们全是**决策理由 / 筛选结论**（对象不带 ok，
    //   也不在 err 分支），不是调用被拒 —— 给它们编恢复动作就是造数据。
    //   同批摘除 `missing-target`（已迁入拒收面，见该段说明）。
    'belief-distorted-or-hostile', 'dissatisfaction-threshold-reached', 'eligible-for-deeptalk', 'firm-belief-in-truth', 'insufficient-shared-experience', 'outbid-or-slots-full',
    'player-cancel', 'secret-protected', 'secret-protected-cross-region', 'tentative-belief', 'unaware-of-topic',
    // ── v2.275.0（同上，D 类第 11 组）：2 条判不出面 —— engines/save-health.js 的
    //   「上游读数面没装上」两态。它们出现在**不带 ok 的读数对象**里
    //   （`trend: { available:false, reason:'forecaster-absent' }`），既不是调用被拒、
    //   也不是成功返回，故归判不出面，并在 NEUTRAL_REVIEW 逐条给档（键集必须逐字相同）。
    'audit-absent', 'forecaster-absent',
  ];
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