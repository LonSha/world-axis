/**
 * WorldAxis engines/reject-recovery-tables.js (v2.529.0) — 拒收码 → 恢复动作映射的**冻结表**
 *
 * 这七块表原本长在 engines/reject-recovery.js 里（行 70–1231，1162 行 / 占全文 84%），
 * 它们是**产品承诺**（快照 + 规则表 + 人工判定），与算法无关：
 *   RULES            码名分词 → 六档的规则表（按 token 归类）
 *   OVERRIDES        规则表收不住的例外（逐条写 why）
 *   ARTIFACTS        词法碎片（`'store-' + String(err)` 这类拼接式 reason，**不是码**）
 *   NEUTRAL_REVIEW   判不出面（所属对象不带 ok）的逐条人工判定，`out:true` 表示不在这份契约里
 *   REJECT_FACE      拒收面冻结快照（至少在 `ok:false` 对象里出现过）
 *   SUCCESS_FACE     成功面冻结快照（只出现在 `ok:true` 对象里 —— 给它们编恢复动作就是造数据）
 *   NEUTRAL_FACE     判不出面冻结快照
 *
 * 为什么单独成文件（OPV29-09）：
 *   ① 140K 的文件里 84% 是数据，改一行判据要在 1162 行快照里翻；
 *   ② 快照与现场的一致性由 tools/reject-recovery.js 复算、tests/reject-recovery-lock-v2192.js 钉住，
 *      核对时也只需要这几张表 —— 表与算法分开后，核对面就是这个小文件；
 *   ③ 差额口径（拒收面 / 成功面 / 判不出面 = 1903 / 957 / 52）**不因搬家而变**：
 *      表条目一条没删没加，专锁 B3/B4/C4 与 A8 逐条比对拆段前后一致。
 *
 * 本文件**零算法**：没有具名函数、没有 fs / store，只有一个 IIFE 外壳挂表。
 * 缺表或空表由 engines/reject-recovery.js 求值期当场抛错（空表会让「表外码不落进任何
 * 默认档」静默失效：所有码都变成 kind:null，看着像「都判不出」，其实是表没装上）。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};

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
    // ── v2.295.0（V9 十八项）：续接链路两条分词判不出档的新码（词表收不住，逐条显式登记）。
    'continuation-tail-required': { kind: 'request-setup', why: '续接前须先回放尾巴：先补齐尾巴前置，再重发同一次续接' },
    'dangling-continuation-relation': { kind: 'manual-review', why: '续接指向的关系已悬空：修边还是弃续接，机器判不了' },
    // ── v2.407.0（三缝 + 主线 A/B/C/E/F/G）：新引擎里**规则表判不出档**的两条 ──
    //   其余 15 条新码都被规则表收住了（via:'rule'），这两条不是：
    //     · lower-priority-overrides-canonical —— 分词 lower/priority/overrides/canonical
    //       一个都不在六档词表里。它是**证据分级**判据：本次写入用 context/designed 级证据
    //       去覆盖一条 explicit/canon 级的既有事实，所以被拒。该改的是输入（换更高优先级的
    //       证据来源），不是去补前置，也不是同输入重试 ⇒ adjust-input。
    //     · store-unreadable —— 分词 store/unreadable，`unreadable` 虽在词表里但不在恰当的
    //       档（与既有的 `unreadable` / `lib-unreadable` 同规：读不到就没法判断内容是否可用，
    //       机器判不了）⇒ manual-review。刻意与 `unreadable` 逐字同档，不另立一种口径。
    //   ⚠ 两条都已在 REJECT_FACE 快照里（A8 要求），故此处只是补档、不改面。
    'lower-priority-overrides-canonical': { kind: 'adjust-input', why: '本次写入的证据优先级低于既有 canonical 事实（context/designed 想覆盖 explicit/canon）：换成更高优先级的证据来源再写' },
    // v2.542.1：engines/api-vault.js 的 prime() 在非安全上下文下明拒（ok:false）——它一直是
    //   拒收面的一员，却没进快照，于是 B3/B4/C4 自 v2.28x 起恒红（同「新码没进快照」旧账）。
    //   档位选 request-setup：这不是输入错，也不是重试能好，是**运行环境不满足前提**。
    'not-secure-context': { kind: 'request-setup', why: '非安全上下文（页面不是 https / localhost）下浏览器禁用该能力：把 SillyTavern 用 https 或本地回环地址打开再试' },
    'store-unreadable': { kind: 'manual-review', why: '存档读不到（不冒充空世界）：机器无从判断内容是否可用，需人先修存档再重跑诊断' },
    // ── v2.583.0（R254）：attire-state 里**规则表收不住档**的两条（逐条读源码定因，不按词根猜）──
    //     · continuity-lock —— 分词 continuity/lock，`locked` 在 rollback 词表里但 `lock` 不在，
    //       `continuity` 更是没有 ⇒ 判不出。它不是「状态落不了」，而是**改输入**：
    //       已有服装的人要换装，必须给六个理由之一（换装/卸下/沐浴/跳时/剧情赠予/天气骤变）。
    //       补齐理由再提交即通过 —— 同输入重试永远还是它。
    //     · downgrade-coverage —— 分词 downgrade/coverage，两个都不在六档词表里。
    //       病因是「动态升级会推翻已有描写」（材料原文『升级后补写缺失层且不得推翻已有描写』）：
    //       该改的仍是输入（换一条不缩覆盖的升级依据，或先补齐缺失层），不是重试。
    //       ⚠ 两条都已在 REJECT_FACE 快照里（A8 要求），故此处只是补档、不改面。
    'continuity-lock': { kind: 'adjust-input', why: '已有服装的人要换装却没给六个理由之一（换装/卸下/沐浴/跳时/剧情赠予/天气骤变）：补齐理由再提交，同输入重试永远是它' },
    'downgrade-coverage': { kind: 'adjust-input', why: '这条动态升级会推翻已有描写（已登记覆盖子项变少）：换一条不缩覆盖的升级依据、或先补齐缺失层再升' },
    // ── v2.192.0 首轮分面后补登的 33 条（拒收面规则表判不了，逐条显式登记）──
    'aftermath-wait': { kind: 'retry-same-input', why: '章间冷却期未过：等窗口过去同输入再来' },
    'ahead-of-head': { kind: 'rollback', why: '客户端序号超过服务端头，说明这份状态不该落' },
    'all-rejected': { kind: 'adjust-input', why: '导入的项被逐条剔除，一个都没收：得改导入内容' },
    'backup-corrupt': { kind: 'manual-review', why: '备份已损坏：自动分支判不了该修还是该弃' },
    'bottom': { kind: 'adjust-input', why: '已到底，不能再往下：改方向而不是重试' },
    'burst': { kind: 'adjust-input', why: '同一轮重复次数超限：改输入节奏' },
    'claimed-by-other': { kind: 'retry-same-input', why: '被别的会话占着：等对方释放后同输入再来' },
    // v2.294.0（V8 收口）：events.fulfillDue 的 foreign-owner —— 排期行已被别的执行器认领
    //   （engines/events.js 的 status==='claimed' && owner!=='events.archive'）。
    //   与 claimed-by-other 同病因同恢复动作：等对方释放后同输入再来，不是改输入也不是回滚。
    'foreign-owner': { kind: 'retry-same-input', why: '该排期已被别的执行器认领：等它释放后同输入再来' },
    // ── v2.294.0（V8 收口）：11 个新拒收码的恢复档（逐条读源码定因，不按词根猜）──
    'archive-failed': { kind: 'manual-review', why: '归档写失败：机器分不清该重试还是该弃，看一眼' },
    'archive-too-big': { kind: 'adjust-input', why: '归档体积超上限：要减少内容，不是重试' },
    'archive-write-failed': { kind: 'request-setup', why: '存储写被拒（配额满/隐私模式）：先修存储再归档' },
    'bridge-missing': { kind: 'request-setup', why: '归档桥（backstage.archiveScheduled）没装上：先把它装回来' },
    'contract-unavailable': { kind: 'request-setup', why: '契约面读不到：先把契约面恢复再来' },
    'control-usage-unavailable': { kind: 'manual-review', why: '控件使用读数取不到：机器判不了该不该动它' },
    'engine-missing': { kind: 'request-setup', why: '该引擎没装载：先把它装回来' },
    'not-on-desk': { kind: 'adjust-input', why: '该动作不在当前台面上：换一个可用动作' },
    'panel-yield-unavailable': { kind: 'manual-review', why: '面板让出读数取不到：需人看一眼当前面板态' },
    'projection-failed': { kind: 'manual-review', why: '投影失败：机器判不了该修数据还是该弃这份投影' },
    'ui-not-loaded': { kind: 'request-setup', why: 'UI 面没装载：先把面板装起来再操作' },
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

    // ── v2.380.0（幽灵引用治理批次⑦）：拒收面残余 31 条逐条显式登记。
    //   判据来源：`tools/reject-recovery.js` 的 audit() 把它们报成 via:undecided（B6 当场报无档）。
    //   为什么规则表收不住这批 —— 两类原因，都不是「表太窄」而是「这类码本来就不该按形态归」：
    //     ① **下划线命名**（24 条）：`ruleKind` 按 `-` 分词（契约如此，换成 `[-_]` 需先过 A2 与
    //        六档语义复核）。实测把分词换成 `[-_]` 会把 `closed_hours` 归成 rollback ——
    //        正确处置是「等开门再试」，不是「回头改写」。形态归类在 snake_case 上会**判错档**，
    //        所以这批必须逐条给理由，不能扩分词了事。
    //     ② **连字符命名但词表语义相反**（7 条）：如 `backstage-running` 的 running 不在任何
    //        词表里、`ample-supplies-cannot-collapse` 的 supplies 也不在 —— 它们的拒收理由
    //        恰恰是「条件太充足」而不是「条件不足」，按 missing/short 一类的词族归会归反。
    //   归法沿用既有口径（**按语义，不按像谁**）：在途/被占/时段未到 ⇒ retry-same-input；
    //   前置缺/授权缺 ⇒ request-setup；输入形态或数值不被接受 ⇒ adjust-input；
    //   状态已变只能按新态改写 ⇒ rollback；底层没给出更具体原因 ⇒ manual-review；
    //   这件事本身不被允许/对象根本不成立 ⇒ permanent-reject。
    'actor_possesses_stoic_sage_or_psychic_immunity': { kind: 'permanent-reject', why: '该角色对精神创伤享有苦修/贤者/灵能免疫：这类创伤对他本就不成立，重试同输入不会产生效果（psyche-trauma:98）' },
    'character_not_found': { kind: 'request-setup', why: '代谢时钟里查不到该角色：先把角色建上（metabolism-clock:118/223 两处同因）' },
    'closed_hours': { kind: 'retry-same-input', why: '该地点当前已打烊：等开门时段同输入再来（spatial-topology:148，回执带 openHour/closeHour）' },
    'container_full': { kind: 'adjust-input', why: '容器已装满：先腾出空间或换容器再放（personal-inventory:76，回执带 currentSize/capacity）' },
    'direct_observation_rejects_illusion': { kind: 'permanent-reject', why: '被直接目视观察时幻象不成立：这个把戏在此刻这件事上不成立，换手段（perception-manipulation:55）' },
    'insufficient_cosmic_or_geological_disturbance': { kind: 'request-setup', why: '纪元潮汐要求的天象/地质扰动不够：先把扰动做出来（epoch-tide:64）' },
    'insufficient_funds': { kind: 'adjust-input', why: '现金不够这笔：改金额或先筹钱（personal-inventory:117，回执带 balance/required）' },
    'invalid_target': { kind: 'adjust-input', why: '库存记录或物品对不上：按回执指出的那一项改（personal-inventory:69）' },
    'no_inventory': { kind: 'request-setup', why: '该角色还没有库存面：先建档（personal-inventory:110）' },
    'nodeList-must-be-array': { kind: 'adjust-input', why: '传进来的节点清单不是数组：改成数组形态再提交（spatial-topology:91）' },
    'physical_anchor_permanently_lost': { kind: 'permanent-reject', why: '悬念的物理依托已永久失去：这条张力在这件依托上立不起来了，换依托重开（dramatic-tension:95）' },
    'platitude_blocked': { kind: 'adjust-input', why: '这句是套话、被文气闸挡下：按 retryHint 改写具体内容（subtext-tension:140/143）' },
    'portal_locked': { kind: 'request-setup', why: '门被反锁、缺对应钥匙或凭证：先取钥匙/凭证（spatial-topology:165，回执带 keyId）' },
    'portal_sealed': { kind: 'permanent-reject', why: '通道已被物理封死：这条路走不通了，改走别的路（spatial-topology:160）' },
    'preset-unconfigured': { kind: 'request-setup', why: '排程预设还没配：先把 preset 配上（routine-pacing:179）' },
    'rational-immunity-contentment': { kind: 'permanent-reject', why: '该对象安于现状、理性免疫这套宣传：这条叙事对他不成立，换对象或换角度（ideology-memetics:95）' },
    'rational-immunity-enlightened': { kind: 'permanent-reject', why: '该对象已通达、理性免疫这套宣传：同上，对他不成立（ideology-memetics:87）' },
    'receipt-unrelated': { kind: 'adjust-input', why: '回执与这笔交易不相关：换成对应的那张回执（liaison:561）' },
    'sated-beasts-repelled-by-fire': { kind: 'permanent-reject', why: '兽群已饱食、又被火逼退：这一次捕猎不成立，换个时机或猎物（ecosystem-predation:109）' },
    'sufficient_resources_or_alternative_path_exists': { kind: 'permanent-reject', why: '资源充足或另有出路 ⇒ 这场道德困境不成立：不该在这里做两难抉择，走正当途径（moral-dilemma:49）' },
    'taboo_violated': { kind: 'permanent-reject', why: '触犯城中禁忌：这件事本身不被允许，换做法（city-folklore:137/141）' },
    'transaction-rejected': { kind: 'manual-review', why: '结对交易的底层结算没成，且底层没给出更具体的原因：要人看这笔结算（liaison:436/510，另有人类写实/台下生活/排程三处同码）' },
    'unaware-blindspot-cannot-parry': { kind: 'request-setup', why: '当事人没察觉这个盲区、格挡不了：先让他察觉（tactical-combat:118）' },
    'uncontrolled-hemorrhage-stabilization-required': { kind: 'request-setup', why: '大出血没控制住、必须先做止血稳定：先止血再做后面的处置（surgical-triage:207/210）' },
    'ample-supplies-cannot-collapse': { kind: 'permanent-reject', why: '补给充足 ⇒ 围城崩溃不成立：不靠饿城这条路（siege-attrition:97）' },
    'backstage-running': { kind: 'retry-same-input', why: '后台正跑着别的回合：等它结束同输入再来（act:922 / agency:570 两处同因，回执带 deferred:true）' },
    'cannot-distort-in-current-status': { kind: 'rollback', why: '该悬念处于的状态不允许再扭曲：只能按新状态改写，不能原地重来（foreshadow-tree:183，回执带 currentStatus）' },
    'compromised-cover-detected': { kind: 'permanent-reject', why: '掩护已被识破：这个身份在这条线上作废了，换身份或撤离（covert-espionage:254/257）' },
    'disarmed-or-keyed-cannot-detonate': { kind: 'request-setup', why: '机关已被卸除或被钥匙卡住：先恢复机关或取走钥匙（ruin-mechanism:100）' },
    'exempted-from-grudge': { kind: 'permanent-reject', why: '该角色享有超然/构造体豁免、不滋生凡俗记恨：这条记恨对他不成立（human-realism:313）' },
    'exempted-from-outburst': { kind: 'permanent-reject', why: '该角色豁免情绪失控与爆发：这条爆发对他不成立（human-realism:436）' },

    // ── v2.400.0（V22 第 4 批 EXV22-4）：丧葬禁令的恢复档（**必须显式覆盖，不交给规则表**）──
    //   为什么不交给规则表：规则表按码名形态把它归成 `permanent-reject`
    //   （「这件事本身不被允许：换做法，不要重试」）—— 那是**误判**。
    //   本码的真实语义是「现在不行、期满就行」，C4d 判据（tests/exv22-v2400.js）
    //   已经实证：同一 mourner、同一 marry 动作，`at = until + 1` 时返回
    //   `ok:true + outcome:'mourning-over'`。若按 permanent-reject 处置，玩家会被
    //   建议「换个做法别重试」，而正确动作是**等**（与本文件既有 aftermath-wait 同型）。
    //   给档不给 out:true 的理由：这是真的 ok:false（带 reportable 可告发），
    //   不是筛选结论，调用方确实需要一句「该怎么办」。
    //   ⚠ 踩坑记录：本段第一次编辑插到了 **NEUTRAL_REVIEW** 的末尾（与第 434 行上方
    //   那批 out:true 条目同尾），于是 explain 仍走规则表、探针读数照旧是 permanent-reject。
    //   这与文件下方 v2.380.0 段已记过的「插错数组、读数翻倍」是同一个坑，第二次踩到。
    'mourning-prohibited': { kind: 'retry-same-input', why: '服丧期内禁婚娶/宴饮/出仕：期满后同一动作即可放行（不是永久禁止，别换做法）' },
    // ── v2.411.0（R251 缝合批）：body-anatomy 三条**规则表判不出档**的码（逐条显式登记）──
    //   为什么判不出：分词 token contradiction / anchor / veto 一个都不在六档词表里，
    //   规则表收到 difference 兜底档 —— 而兜底档**不是档**（B6 会如实报「无档」）。
    //   ⚠ 我此前在面快照段写「9 条全部由规则表收住」是**未跑探针的臆断**，实测三条无档；
    //   注释已同批改正，不留一句与现场不符的话。
    //   三条的处置方向都是**改输入**：给的是两套朝向 / 两套锚点 / 触碰了该档禁写词，
    //   改的是这一次的输入，重试与补前置都不是解法。
    'facing-contradiction': { kind: 'adjust-input', why: '同场同人给了两个朝向：补一次显式 turn（或改回原朝向）再提交，不是换做法' },
    'multi-anchor': { kind: 'adjust-input', why: '同场同人给了两个锚点：补一次显式 move（或改回原锚点）再提交，别指望两边都对' },
    'veto-hit': { kind: 'adjust-input', why: '描写触了该档体型的禁写词：改写这一句（换掉禁令词），不是换个引擎绕过去' },
    // v2.517.0（V26 批）：分词精确匹配收不住的两条（'rejected'≠'reject' / 'duplicated'≠'duplicate'），
    //   按现场 hint 逐字登记：失主说不通 → 交给叙事（人工复核）；重复回合 → 换滑动才是新回合（改输入）。
    'claim-rejected': { kind: 'manual-review', why: '登记的失主与认领人对不上：凭据已留痕、交给叙事裁定，机器不代判' },
    'duplicated': { kind: 'adjust-input', why: '这一回合已经走过（同签名重放）：换一次新的滑动/输入才是新回合，不是原地重放' },
    // ── v2.524.0（V27 收口）：现场复算发现**四条拒收码没有任何档**（tools/reject-recovery.js
    //   的 --json 输出：problems 里这四条既不进 RULES 也不进 OVERRIDES ⇒ explain() 只能答 unknown，
    //   面板会给玩家一个空动作）。分词表收不住它们，故逐条显式登记：
    'cross-venue': { kind: 'adjust-input', why: '两端不在同一个会场（local-grid 拒绝跨会场算距离）：把目标换到同会场再提交，不是重试' },
    'cross-zone': { kind: 'adjust-input', why: '两端不在同一个区（跨区不许直算）：把目标换到同区再提交，不是重试' },
    'zone-unsolved': { kind: 'request-setup', why: '方位还没解出来（要先 getZone / preheat）：先把定位补上再算距离' },
    'unserializable': { kind: 'manual-review', why: '存档里有值无法序列化（函数/循环引用/非有限数等）：要人看一眼是哪个写入方塞进去的，机器判不出该改哪一处' },
    // ── v2.524.0（V28 批一）：分词表判不出档的两条，逐条显式登记 ——
    //   hidden-leak：玩家的认知边界被越过（把不该看见的暗线标成了阶梯态）。
    //     不是重试能解决的：重发还是越界，改的是「拿哪一条线来标」。
    //   irreversible：不可逆的选择不许撤回。改的同样不是输入，是别再想撤。
    'hidden-leak': { kind: 'adjust-input', why: '要标的线玩家本不该看见：换成玩家已经知道的那条线，别硬标' },
    'irreversible': { kind: 'permanent-reject', why: '这条后果是不可逆档：没有撤回这条路，接受它或改选择' },
    // v2.524.0（V28 批一·补）：`unheard` 词表判不出档 ——
    //   它说的是「你问的这个人没听过这件事」（不是他忘了，也不是世界没这件事）。
    //   处置是换一个真听过的人问，或者先去把这件事弄到手，故 adjust-input。
    'unheard': { kind: 'adjust-input', why: '这个人物没听见过这件事：换一个真听过的听者，或先让他有渠道' },
    // v2.524.0（V28 批二）：`leak` 词表判不出档 ——
    //   它说的是「这一句引用了这场里没人知道的事」（插曲的知识越界）。
    //   处置不是重试：重发还是越界 —— 要么删掉这句，要么先把这条消息送到他们手上。
    'leak': { kind: 'adjust-input', why: '插曲里说出了他们不可能知道的事：删掉这句，或先把消息真送到' },
    // v2.524.0（V28 批三·续）：`still-live` 词表判不出档 ——
    //   它说的是「这条线还开着，接着跟就行」，不是拒收一次写入，是**换一个动作**。
    'still-live': { kind: 'adjust-input', why: '这条线还在跑：直接从当前阶段接着跟，不走「拾回」' },
  };
  /** 词法碎片（**不是码**）：`reason: 'store-' + String(err)` 这类拼接写法，
   *  扫描面的词法视角只能看到前缀，真码运行期才成形（`store-unavailable` 等）。
   *  如实登记，**不猜它该给什么恢复动作**。 */
  const ARTIFACTS = {
    // v2.566.0：engines/dream.js:219 的 `reason: 'settle-' + (g.reason || 'unknown')` 同款拼接式。
    //   扫描面只看到前缀 `settle-`，真码在运行期成形（settle-*）—— 不是码，不猜恢复动作。
    'settle-': "拼接式 reason（`'settle-' + (g.reason || 'unknown')`，engines/dream.js 梦卷结算）：词法面只能看到前缀",
    'store-': "拼接式 reason（`'store-' + String((r2 && r2.error) || '?')`）：词法面只能看到前缀，真码在运行期成形"
  };
  /** 判不出面（源码里那个对象不带 `ok`）的**逐条人工判定**。
   *  语义机器判不出来：决策理由（`{action:'pause',reason:'crisis'}`）、
   *  治理计划（`{key:k,reason:'diag-idle'}`）、内部触发（`refresh({reason:'after-reply'})`）。
   *  两种合法登记：给一个档（`kind`），或明说它不在这份契约里（`out:true` + why）。
   *  **未登记的判不出面码一律算缺口**（边界 ③）。 */
  const NEUTRAL_REVIEW = {
    // v2.524.0（V27 收口）：与上方 NEUTRAL_FACE 同批补的两条，都走 out:true ——
    //   它们是**决策/治理理由**（注入记账说「这条已落地」；宿主没有 console 时说「归档口不可用」），
    //   不是玩家做错了什么；硬塞进六档任何一档都会教玩家去修没坏的东西。
    'landed': { out: true, why: '注入预算账里的「已落地」标记（hits 里的决策理由，不是一次调用失败）—— 不在这份恢复契约里' },
    'no-console': { out: true, why: '宿主没有可用的 console（启动归档口因此关掉）—— 环境缺件，不是某次操作被拒' },
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
    'contract-cancelled': { kind: 'request-setup', why: '委托已被取消：这一步没有可结的账，先重新立委托再走' },

    // ── v2.380.0（同上批次）：判不出面新增 10 条（键集与 NEUTRAL_FACE 逐字相同，见 A7）。
    //   全部是**记录 / 读数理由**：写在账本条目、通缉名录、记恨列表、嫌疑列表、可用性读数里，
    //   所在对象不带 `ok` —— 给它们配恢复动作就是造数据（与 after-reply / commitment 同一条边界）。
    'cascade_bus_tick': { out: true, why: '级联总线的拍点标签（engine/cascade-bus:269 写进 bridge 快照的 reason），不是调用被拒' },
    'collateral-default': { out: true, why: '违约登记里记的失信理由（collateral-rupture:93 写进 socialBlacklist），不是调用被拒' },
    'compact': { out: true, why: '注入预算的折叠理由（inject-budget:712 的 folded 行），不是调用被拒' },
    'contraband_smuggling_caught': { out: true, why: '通缉名录里记的查获理由（contraband-pipeline:105 的 wantedLedger），不是调用被拒' },
    'debt-breach': { out: true, why: '记恨条目里记的违约理由（collateral-rupture:109 的 grudges），不是调用被拒' },
    'different_venues': { out: true, why: '视线隔离读数（environmental-occlusion:83 的 visible:false 对象不带 ok），不是调用被拒' },
    'forgery-detected': { out: true, why: '目标心里记下的识破理由（cognitive-poisoning:116 的 suspicions），不是调用被拒' },
    'intercepted-by-physiological-circuit-breaker': { out: true, why: '动机裁决里被剔掉选项的理由（motive-arbitration:165 的 forsaken 行），不是调用被拒' },
    'out_of_service': { out: true, why: '出行方式的可用性读数（transit-scheduler:108 的 available:false 对象不带 ok），不是调用被拒' },
    'room_partition': { out: true, why: '遮挡读数（environmental-occlusion:80，与 different_venues 同形），不是调用被拒' },
    // ── v2.407.0：chat-recycle 的清理顺序依据 ──
    //   `plan()` 返回的 victims 每行都带 `reason:'earliest-unlocked'`，说的是「这一项为什么
    //   该先被清」（最早移入且未锁定）。它是**清理清单的排序依据**，不是一次拒收：
    //   调 plan() 本身返回 ok:true，被点名的文件也还没被删。故 out:true 而非给档 ——
    //   给它配恢复动作等于教玩家去「修」一件本就没坏的事（与 after-reply / compact 同一条边界）。
    'earliest-unlocked': { out: true, why: '回收清单里被选中项的排序依据（最早移入且未锁定），plan 本身返回 ok:true，不是一次拒收' },
    // ── v2.410.0：elapsed-evidence 的证据定位两态（与 NEUTRAL_FACE 同批，键集逐字同）。
    // ── v2.524.0（V28 批一）：`no-evidence` **迁出**判不出面 —— misbelief.correct 与
    //   consequence-schedule.settle 都把它作为调用方拒收（ok:false）返回：'没给证据'从
    //   「一片读数的内部态」变成了「这次结算不成立」的真归因，故入拒收面、离开本表。（elapsed-evidence 侧的那处内部读数仍在，只是不再是它的唯一去处。）
    'not-in-text': { out: true, why: '时间证据定位读数的「证据不在正文」内部态（elapsed-evidence:165，出口拼成 evidence-not-in-text 面世），不是调用被拒' },
    // ── v2.542.8（叙事脊柱 L1–L4 判据面收口）：四台新引擎带出的五条判不出面码 ──
    //   它们出现在 `skipped[]` 的 reason 里、或不带 ok 的读数对象里，**没有任何一处**落在
    //   `ok:false` 的调用返回体上，故是判不出面。键集与 NEUTRAL_FACE 逐字同（A7 咬这一条）。
    //   档位分开写（不合成一个 absent）：
    //     · empty-scene / none-developing / no-text —— 正常局面（开局空场 / 本幕没埋线在长 /
    //       本回合没有可比文本），配恢复动作等于教玩家去修没坏的东西 ⇒ out:true。
    //     · no-field / no-line —— **画像缺件**（人物卡没写该字段 / 没写底线），是可以动手补的
    //       ⇒ request-setup，与 audit-absent / forecaster-absent 同一条边界。
    'empty-scene': { out: true, why: '注入分档时场景里没有地点/在场人可注入（inject-tier:87 的 skipped 理由）—— 开局空场是正常局面' },
    'none-developing': { out: true, why: '本幕没有正在发展的埋线（scene-intent:90 的 skipped 理由）—— 不是一次调用被拒' },
    'no-text': { out: true, why: '触碰判定时本回合没有可比文本（character-drive:113 的 hit:false 读数）' },
    'no-field': { kind: 'request-setup', why: '人物画像里没有该字段（character-drive:73-75 的三面 / group-refuse:80）—— 去补人物卡的对应字段再看' },
    'no-line': { kind: 'request-setup', why: '人物画像里没写行为底线（character-drive:111）—— 先给这个角色写一条底线，再谈触碰' },
    // ── v2.542.18：engines/time-ledger.js 的四种「读不到」（与 NEUTRAL_FACE 同批，键集逐字同）──
    //   四条都是「读数这一格没成」，不是「调用被拒」⇒ 分档不合成一个 absent：
    //     · no-stamp / storyclock-disabled —— 真没写 / 总开关关：正常局面，配恢复动作等于教人去修没坏的东西 ⇒ out:true；
    //     · no-messages / no-storyclock —— 拿不到楼层 / storyclock 未装载：**环境缺件**，
    //       与 audit-absent / forecaster-absent 同一条边界，也是 out:true（本仓不替宿主装依赖）。
    //   为什么都不给 request-setup：玩家能动的是「正文里写出时间标签」，那是叙事动作；
    //   把「没写标签」登记成可修的请求面，会让恢复建议变成「去补一条你没打算写的时间」。
    'no-stamp': { out: true, why: 'time-ledger:63 扫过楼层但正文没写时间标签（`{known:false, reason:"no-stamp", scanned:n}`）—— 是「本来就没有」，不是调用被拒' },
    'storyclock-disabled': { out: true, why: 'time-ledger: 注桩总开关关着（storyclock 未启用）—— 关掉的功能不出读数，不是失败' },
    'no-messages': { out: true, why: 'time-ledger:57 拿不到楼层（无头环境 / 宿主未就绪）—— 算不出来，环境缺件而非玩家该动手' },
    'no-storyclock': { out: true, why: 'time-ledger: storyclock 未装载（依赖缺席）—— 本仓不替宿主装依赖' },
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
    // ── v2.292.0（V7 EXV7-8）：本批按现场复算一次收敛 —— 10 条现场有、快照里没有的码。
    //   同一形态本仓已栽过五次（v2.203.0 的 17 条 / v2.209.0 的 14 条 / v2.221.0 的 3 条 /
    //   v2.222.0 的 3 条 / v2.231.0 的 49 条）。本轮 B3/B4/C4 首跑即红，差异是：
    //     · 3 条本版新码（世界自传三路源故障）—— 四种不同坏法不能合成一条，
    //       否则「没装」「装了但坏了」「装好了但关着」在恢复建议里同形；
    //     · 7 条**历史欠账**（bonds-disabled / no-blueprint / no-plan-engine /
    //       noesis-missing / seed-threw / unknown-engine / unknown-method /
    //       unknown-namespace 中的后七条）—— 它们各自在上一个版本就已落进 ok:false，
    //       但那时没人跑这条锁，于是没人发现快照落后了。本轮一并补上，逐条不改档。
    //   ⚠ `disabled` 不在此列：它是全仓数百处共用的关闭态码，早已登记在**判不出面**
    //   （NEUTRAL_FACE 与 NEUTRAL_REVIEW 键集必须逐字相同），把它塞进拒收面会让两面相交
    //   （A9 首跑即红，本轮实测）。
    // v2.293.0 (V7 EXV7-9): three new codes of yi-jian-bo-zhong, witnessed.
    'no-room', 'writes-absent',
    'no-core-person', 'write-threw',
    'chrono-absent', 'chrono-threw', 'chronicle-refused',
    'bonds-disabled', 'no-plan-engine', 'noesis-missing', 'unknown-engine',
    'unknown-method', 'unknown-namespace', 'no-blueprint', 'seed-threw',
    'aftermath-wait', 'ahead-of-head', 'alias-cycle', 'all-rejected', 'all-steps-refused', 'already-',
    'already-abandoned', 'already-adopted', 'already-answered', 'already-arrived', 'already-closed', 'already-confirmed',
    // v2.529.0：信件判送幂等码改名（'already-arrived' 是 freight 那条**不可达**死码的码名，
    //   同一个码名不能既可达又不可达 ⇒ 信件侧改用自有码名，两条各归各家）。
    'already-judged',
    // v2.529.0：V28 拒收侧原先把「已经做过了」写成通用码 'already'，与 success 侧的
    //   coordinate / world-blueprint / world-seed 的 'already' 同名 ⇒ 面判定无法把同一个
    //   码名同时放进两面（audit 当场报 missing/stale 一对）。拒收侧改用 'already-handled'
    //   （loose-ends 已交代 / world-bounds 已定住 / posthumous 三处 / reputation-after /
    //   livelihood / exit-rite 共 8 处），success 侧保留 'already' 不动。
    'already-handled',
    // ── v2.518.0：故事回应窗口（engines/story-window.js）的两条拒收码。
    //   现场复算：两条都落在 ok:false 返回体里（choose/settle 的拒收路径）⇒ 拒收面；
    //   不写 OVERRIDES（规则表已收），与 v2.203/209/221/222/231/292 同一处置。
    //   ⚠ `already-chosen` 不能靠 'already-' 前缀命中：快照比对是**逐字相等**，
    //     'already-' 是它自己那条码（见上方），不构成前缀匹配。
    'already-chosen', 'window-missing',
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
    'fondness-missing', 'foreign-chat', 'foreign-owner', 'fork-failed', 'frozen', 'future-event', 'gated-off',
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
    // ── v2.294.0（V8 收口）：本批 11 个新拒收码。它们此前只在码面口径里（能扫到、门禁有归属），
    //   但没进本快照 —— 与本仓已栽过四次的同形态（v2.203.0 / v2.209.0 / v2.221.0 / v2.222.0）。
    //   两侧比对前都会 sort，故追加在末尾不改任何既有位置（见 tools/reject-recovery.js:129）。
    'archive-failed', 'archive-too-big', 'archive-write-failed', 'bridge-missing',
    'contract-unavailable', 'control-usage-unavailable', 'engine-missing', 'not-on-desk',
    'panel-yield-unavailable', 'projection-failed', 'ui-not-loaded',
    // ── v2.295.0（V9 十八项）：本批 18 个续接链路新拒收码（engines/world-seed.js /
    //   engines/continuation.js 等续接面）。此前只在码面口径里，没进本快照 —— 与本仓
    //   已栽过六次的同形态（v2.203.0 / v2.209.0 / v2.221.0 / v2.222.0 / v2.231.0 / 体检批次）。
    //   两侧比对前都会 sort，故追加在末尾不改任何既有位置。
    //   恢复档：16 条由规则表词族收住（bad-* / stale-* / missing / changed / nothing-to-* /
    //   *-failed / *-rewound 等分词，实测 via:'rule'），不写 OVERRIDES（重复登记会让 A8 与
    //   规则表打架）；仅 2 条分词判不出档，在 OVERRIDES 显式登记：
    //     · continuation-tail-required：续接需要先回放尾巴 —— 是「补前置」而非改输入；
    //     · dangling-continuation-relation：续接指向的关系已悬空 —— 机器判不了该修边
    //       还是该弃这条续接，降级人工。
    'archive-tail-unavailable', 'bad-continuation', 'bad-continuation-current',
    'bad-continuation-pack', 'bad-continuation-person', 'bad-continuation-relation',
    'bad-enabled', 'chat-changed', 'continuation-seed-mismatch', 'continuation-tail-required',
    'current-missing', 'dangling-continuation-relation', 'nothing-to-continue',
    'owner-missing', 'round-rewound', 'stale-continuation', 'transaction-failed',
    'unsupported-stage',
    // ── v2.380.0（幽灵引用治理批次⑦）：按 tools/reject-recovery.js 的现场复算一次性补齐快照。
    //   此前本数组 1224 条、现场拒收面 1531 条 —— 差 341 条（这是本仓同一形态的第七次，
    //   前六次记在 v2.203.0 / v2.209.0 / v2.221.0 / v2.222.0 / v2.231.0 / 全量回归体检批次）。
    //   口径与前六次完全一致：**逐条照抄现场分面结果** —— 面的判据是「有没有一处落在 ok:false
    //   对象里」（tools 侧括号配对算出来的），不是人读出来的；这里不改档、不猜语义。
    //   这批码的来源是 v2.263.0 ~ v2.380.0 之间落地的引擎（personal-inventory / spatial-topology /
    //   human-realism / covert-espionage / subconscious 等 60+ 个新模块的 ok:false 站点），
    //   以及一批 snake_case 命名的 reason（引擎确实在输出下划线形态，见 OVERRIDES 段说明）。
    'actionCostFeedback-unavailable', 'actor-already-enqueued', 'actor-has-no-exposure-records', 'actor-not-in-shelter', 'actor-routine-not-registered', 'actor-unconfigured',
    'actor_possesses_stoic_sage_or_psychic_immunity', 'alchemyToxicology-unavailable', 'already-exists', 'already-fully-confessed', 'ample-supplies-cannot-collapse', 'anomalyMutation-unavailable',
    'autoHide-unavailable', 'autobiographyEpiphany-unavailable', 'backstage-running', 'backstageTone-unavailable', 'bad-borrower', 'bad-cat',
    'bad-places', 'bad-spec', 'bad-time-domain', 'beatFacade-unavailable', 'blackmarketUsury-unavailable', 'board-threw',
    'branch-not-found', 'branch-not-simulated', 'branchTransplant-unavailable', 'branchTree-unavailable', 'bridge-unavailable', 'bureaucracyAscension-unavailable',
    'butterflyCascade-unavailable', 'cannot-clash-self', 'cannot-conflict-with-self', 'cannot-distort-in-current-status', 'cannot-encounter-self', 'careChain-unavailable',
    'cascadeBus-unavailable', 'cataclysmHazard-unavailable', 'character-not-found', 'character_not_found', 'chokepoint-not-found', 'cityFolklore-unavailable',
    'civilizationRelic-unavailable', 'closed_hours', 'cognitivePoisoning-unavailable', 'collateralRupture-unavailable', 'commonsGovernance-unavailable', 'communityNote-unavailable',
    'compromised-cover-detected', 'confirm-threw', 'conspiracyWeaver-unavailable', 'container_full', 'contraband-unavailable', 'contrabandPipeline-unavailable',
    'counterfactualEcho-unavailable', 'counterfactualSandbox-unavailable', 'courierDispatch-unavailable', 'covenantSanction-unavailable', 'coverBallistics-unavailable', 'covertEspionage-unavailable',
    'crowdPanic-unavailable', 'demand-below-threshold', 'demographicFlow-unavailable', 'dilemmaBargain-unavailable', 'direct_observation_rejects_illusion', 'disarmed-or-keyed-cannot-detonate',
    'disaster-not-found', 'disaster-not-found-or-inactive', 'dispatch-not-found', 'dramaticTension-unavailable', 'eccentricThreads-unavailable', 'economy-unavailable',
    'ecosystemPredation-unavailable', 'empty-applicants', 'empty-content', 'empty-fake-claim', 'empty-reply', 'empty-rumor-text',
    'entryRouter-unavailable', 'environmentInterference-unavailable', 'epidemicContagion-unavailable', 'epochTide-unavailable', 'epochalTransition-unavailable', 'evidenceBoard-unavailable',
    'exempted-from-grudge', 'exempted-from-outburst', 'factionChronicle-unavailable', 'factionSchism-unavailable', 'floorChanges-unavailable', 'foreshadowGermination-unavailable',
    'gearWear-unavailable', 'geoTracker-unavailable', 'group-disabled', 'groupGuard-unavailable', 'gun-already-fired', 'hazard-below-threshold',
    'hazard-not-active-in-place', 'hazard-record-not-found', 'healthPreflight-unavailable', 'humanRealism-unavailable', 'identityMatch-unavailable', 'ideologyMemetics-unavailable',
    'inlineTags-unavailable', 'institutionalSchism-unavailable', 'insufficient-centrifugal-force', 'insufficient-evidence-cannot-execute', 'insufficient-merit-rejected', 'insufficient-weight-for-prime-directive',
    'insufficient_cosmic_or_geological_disturbance', 'insufficient_funds', 'interestFace-unavailable', 'interrogationTell-unavailable', 'invalid-arbitration-input', 'invalid-bribe-amount',
    'invalid-capacity', 'invalid-conflict-intent', 'invalid-default-amount', 'invalid-definition', 'invalid-disaster-kind', 'invalid-duration',
    'invalid-hazard-type', 'invalid-kind', 'invalid-layer', 'invalid-participants', 'invalid-recovery-points', 'invalid-status-transition',
    'invalid-subtext-pack', 'invalid-throughput', 'invalid_target', 'judicialInquest-unavailable', 'knowledgePractice-unavailable', 'lens-apply-threw',
    'liaison-unavailable', 'livingWorld-unavailable', 'maritimeNavigation-unavailable', 'metabolism-unavailable', 'microclimatePhase-unavailable', 'missing-action-key',
    'missing-action-or-spyId', 'missing-actor-a', 'missing-actor-b', 'missing-actor-id', 'missing-actor-name', 'missing-actors',
    'missing-article-fields', 'missing-borrower', 'missing-candidate-actor', 'missing-charName', 'missing-characterId', 'missing-chokepoint-id',
    'missing-combatants', 'missing-destination', 'missing-deviation-kind', 'missing-disaster-id', 'missing-disinformation-params', 'missing-divergent-action',
    'missing-epicenter', 'missing-epiphany-fields', 'missing-event-id', 'missing-fact', 'missing-fork-node', 'missing-fortress-id',
    'missing-from-place', 'missing-from-region', 'missing-id-or-title', 'missing-intent', 'missing-lead-text', 'missing-location',
    'missing-node-id', 'missing-nodeId', 'missing-nodeId-or-type', 'missing-org-id', 'missing-parameters', 'missing-params',
    'missing-parent-faction', 'missing-participants', 'missing-party-a', 'missing-party-b', 'missing-path-summary', 'missing-patient-id',
    'missing-patient-or-procedure', 'missing-place-id', 'missing-planter', 'missing-rebel-leader', 'missing-receipt', 'missing-recipient',
    'missing-reform-type', 'missing-region-id', 'missing-relic-id', 'missing-resolution', 'missing-resource-kind', 'missing-route-id',
    'missing-rumor-key', 'missing-sanctuary-id', 'missing-scene', 'missing-seed-id', 'missing-shelter-id', 'missing-sound-event',
    'missing-source-branch', 'missing-spy-identity', 'missing-subtext-fields', 'missing-suspect-id', 'missing-taboo-fields', 'missing-target-actor',
    'missing-target-asset', 'missing-target-room', 'missing-trace-item', 'missing-warrant-id', 'modelink-unavailable', 'moodGlide-unavailable',
    'moralDilemma-unavailable', 'mundane-environment-no-corruption', 'name-required', 'no-active-conversation', 'no-actors-in-scene', 'no-archive-found',
    'no-available-shelters-with-capacity', 'no-combat-clash-data', 'no-conclusion', 'no-doc', 'no-epoch-store', 'no-hazard-store',
    'no-infection-source', 'no-items', 'no-message', 'no-offstage-record', 'no-outbreak', 'no-send-el',
    'no-story-context', 'no_inventory', 'nodeList-must-be-array', 'not-blocked', 'not-offstage', 'not-secure-context', 'oath-not-found',
    'observeSlice-unavailable', 'offstageLife-unavailable', 'parallelEvents-unavailable', 'pending-threw', 'pendingCenter-unavailable', 'perceptionManipulation-unavailable',
    'periodicalIdeology-unavailable', 'personalInventory-unavailable', 'phaseTransition-unavailable', 'physical_anchor_permanently_lost', 'place-not-registered', 'plan-missing',
    'platitude_blocked', 'portal_locked', 'portal_sealed', 'powerAnchor-unavailable', 'preset-unconfigured', 'probe-build-threw',
    'probe-disabled', 'probe-judge-threw', 'psycheTrauma-unavailable', 'pyroTelecom-unavailable', 'rational-immunity-contentment', 'rational-immunity-enlightened',
    'receipt-capacity', 'receipt-not-terminal', 'receipt-unrelated', 'region-missing', 'relationGraph-unavailable', 'relic-not-found',
    'researchClosure-unavailable', 'riskPooling-unavailable', 'ruin-already-collapsed', 'ruinMechanism-unavailable', 'rumorCognition-unavailable', 'same-borrower-guarantor',
    'same-party', 'same-planter-target', 'sanctuaryScramble-unavailable', 'sated-beasts-repelled-by-fire', 'scene-capacity', 'sceneNarrative-unavailable',
    'sceneSlice-unavailable', 'schedule-threw', 'sediment-unavailable', 'seed-not-matured', 'send-threw', 'serviceNetwork-unavailable',
    'severity-out-of-range', 'sharedAwareness-unavailable', 'shelter-not-found', 'siegeAttrition-unavailable', 'socialEncounter-unavailable', 'socialLegacy-unavailable',
    'spatialAcoustics-unavailable', 'spatialConflict-unavailable', 'spatialTrace-unavailable', 'spy-captured-cannot-act', 'spy-not-found', 'stable-supply-no-shock',
    'stage-unavailable', 'stagePresence-unavailable', 'stealthInfiltration-unavailable', 'story-choice-unavailable', 'storyChoice-unavailable', 'storyLoop-unavailable',
    'storyTone-unavailable', 'storylineAdvance-unavailable', 'stress-below-threshold', 'subtextTension-unavailable', 'sufficient_resources_or_alternative_path_exists', 'supplyChain-unavailable',
    'supplyChoke-unavailable', 'surgicalTriage-unavailable', 'taboo_violated', 'tacticalCombat-unavailable', 'tempo-unavailable', 'temporalLock-unavailable',
    'terrainHazard-unavailable', 'theme-unavailable', 'thread-not-found', 'tide-not-fever', 'time-unconfigured', 'toxicMetabolism-unavailable',
    'transact-failed', 'transaction-rejected', 'travelDesk-unavailable', 'tree-not-found', 'unaware-blindspot-cannot-parry', 'uncontrolled-hemorrhage-stabilization-required',
    'undercurrentCalendar-unavailable', 'universalRoutine-unavailable', 'unknown-group', 'unsubstantiated-bluff-refused', 'unsupported-procedure', 'unsupported-spy-action',
    'veracityArbitration-unavailable', 'warrant-not-active', 'warrant-not-found', 'whisperBackchannel-unavailable', 'worldChanges-unavailable', 'worldClock-unavailable',
    'worldGraph-unavailable', 'worldHealth-unavailable', 'worldLab-unavailable', 'worldSnapshot-unavailable', 'writeDesk-unavailable',
    // ── v2.383.0（补漏）：上一批（v2.380.0）按现场复算收敛时**漏掉**的七条容量类拒收码。
    //   来源是 v2.322.0 ~ v2.380.0 之间落地的九把引擎的 `ok:false` 站点：
    //     capacity-reached                        ← bloodline-heritage / dungeon-hazard-mesh / ecosystem-cascade
    //     court-capacity                          ← court-intrigue
    //     patient-capacity                        ← alchemy-toxicology / surgical-triage
    //     sanctuary-capacity                      ← sanctuary-scramble
    //     settlement-capacity                     ← epidemic-contagion
    //     vessel-capacity-or-store-unavailable    ← maritime-navigation
    //     guard-capacity-or-store-unavailable     ← stealth-infiltration
    //   口径与同批逐字一致：**逐条照抄现场分面结果**，不改档、不猜语义。
    //   探针实测七条**全部**由规则表收住（`via:'rule'`、`kind:'adjust-input'`、无档 0 条）
    //   ⇒ 一条都不写 OVERRIDES（重复登记会让 A8 与规则表打架）。
    //   病根：这七条此前**只进码面口径、没进本快照**，于是
    //     `tools/reject-recovery.js` 现场拒收面 1538 条 vs 本数组 1531 条，
    //     `reject-recovery-lock-v2192.js` 的 B3/B4/C4 自那时起一直红着。
    //   同一形态本仓已记过七次（v2.203.0 / v2.209.0 / v2.221.0 / v2.222.0 / v2.231.0 /
    //   全量回归体检批次 / v2.380.0）—— 本版是第八次。判据不是「人读一遍」，
    //   而是 tools/reject-recovery.js 的现场复算；补完 A9 三面不相交仍成立。
    'capacity-reached', 'court-capacity', 'guard-capacity-or-store-unavailable', 'patient-capacity',
    'sanctuary-capacity', 'settlement-capacity', 'vessel-capacity-or-store-unavailable',
    // ── v2.400.0（V22 OPV22-2 + 验收纪律 3）：本批 21 条新路由带出的 20 条拒收码 ──
    //   来历：action-desk.ROUTES 补 21 条真写口路由时，每条都带一个
    //   `<ns>-unavailable` 的 owner 缺席分支（与本表既有风格一致：先判 owner 在不在，
    //   不在就如实报缺席，而不是让 TypeError 飞到调用栈）。现场复算因此涨 20 条，
    //   而本快照没有 ⇒ tools/reject-recovery.js --check 差额 20。
    //
    //   为什么必须逐条进快照（而不是让 --check 宽容）：OPV22-6 刚把对账挂成默认动作，
    //   它的全部价值就在「差额非零即红」。为了让红变绿去放宽判据，等于把刚装的门禁
    //   一次拆掉 —— 这正是本仓反复拒绝的做法。
    //
    //   为什么**不**写 OVERRIDES：这 20 条的形状是 `X-unavailable`，与规则表的
    //   `*-unavailable` 词法同族（探针实测 via:'rule'、无档 0 条）。重复登记会让 A8
    //   （OVERRIDES 键必须在 REJECT_FACE 里且与规则表不打架）出现两处真源。
    //
    //   三条面同批落定：REJECT_FACE 收这 20 条；SUCCESS_FACE / NEUTRAL_FACE 不动
    //   （它们既不是成功回执，也不是「判不出」）。
    //   ⚠ 踩坑记录：本批第一次编辑把这段追加到了 **NEUTRAL_FACE** 的末尾
    //   （两数组只隔 5 行，且都以「v2.380.0 同上批次」那一段注释收尾）。
    //   结果差额不是 20 而是 **40** —— 拒收面缺 20（现场有快照没有）+ 判不出面多 20
    //   （快照有现场没有），两类各报一遍。数组位置选错时读数会**翻倍**而不是「少补一点」，
    //   这正好说明 `--check` 报的是逐条差集而不是计数差。
    //   第 21 条 humanRealism-unavailable 已在码面口径内（human-realism.js 早有同形码
    //   的既有站点），本条不重复登记。
    'affect-unavailable', 'aftermathImpact-unavailable', 'beatLedger-unavailable',
    'beatReport-unavailable', 'bonds-unavailable', 'coordinate-unavailable',
    'digest-unavailable', 'dream-unavailable', 'elsewhere-unavailable',
    'foreshadow-unavailable', 'gauge-unavailable', 'horizon-unavailable',
    'ledger-unavailable', 'oneShotMod-unavailable', 'pathEcho-unavailable',
    'personaAnchor-unavailable', 'rehearsal-unavailable', 'survival-unavailable',
    'vitals-unavailable', 'weather-unavailable',
    // ── v2.400.0（V22 第 4 批 EXV22-4）：丧葬禁令的一条真拒收码 ──
    //   本仓同一形态已栽过六次（v2.203.0 的 17 条 / v2.209.0 的 14 条 / v2.221.0 的 3 条 /
    //   v2.222.0 的 3 条 / v2.231.0 的 49 条 / v2.292.0 的 10 条）。本轮的差异是：
    //   它**不是**「历史欠账」，而是本批新引擎 legitimately 新增的一条真拒收码，
    //   且 reject-code-gate 已通过见证（tests/reject-v2780.js 的 v2.400.0 段真跑过
    //   holdFuneral → checkProhibition）。此处差额 1 条是同一件事的另一面：
    //   码面口径与**产品快照面**是两个独立真源，新码必须两边都落。
    //
    //   为什么不写 OVERRIDES：见下方探针读数（本段落定后 explain 给出的 via）。
    'mourning-prohibited',
    // ── v2.407.0（三缝 + 主线 A/B/C/E/F/G）：五个新引擎带出的 17 条拒收码 ──
    //   来历与上一条 mourning-prohibited 同型：**本批新引擎新增的真拒收码**，不是历史欠账。
    //   reject-code-gate 已经用真 API 调用把它们逐条跑出来了（tests/reject-v2780.js 的
    //   v2.407.0 见证段，unseen 0 / expected 827），但「有见证」与「产品快照认得它是拒收」
    //   是两个真源 —— 前者管可达性，后者管 explain() 能不能独立答出这个码是什么面。
    //   现场复算读数：新引擎把 reason 字面量面从 1749 抬到 1766（拒收 1558→1575），
    //   而本数组没动 ⇒ tools/reject-recovery.js --check 报 16 条 missing-snapshot。
    //
    //   为什么必须逐条进快照（而不是靠规则表兜）：explain() 的面判定只认注入面 /
    //   三张冻结快照 / 显式登记，**绝不拿规则表当默认档**（边界 ③）。快照缺一条，
    //   产品就只能答 unknown —— 「这个码是什么面」这件事在运行时是答不出来的。
    //
    //   归属（逐条读源码站点，不按码名猜测）：
    //     summarizer-adapter（三缝②）：bad-doc / empty-source / missing-provenance /
    //       relay-absent / relay-threw / attach-threw —— 摘要格式与挂载的六种失败。
    //     branch-continuity（主线 D）：evidence-missing / bad-evidence-kind /
    //       evidence-no-source / lower-priority-overrides-canonical / missing-signature /
    //       no-established-state / whole-reject —— 四道校验里 schema/evidence/continuity
    //       三道的具体驳回理由，加上「任一校验失败整体拒绝」。
    //     reading-bookmark（三缝①）：missing-anchor / rewind-denied / transact-no-output
    //       —— 无锚可推进 / 回退被拒（只前进不后退）/ 事务没给回执。
    //     fact-continuity（主线 G）：store-unreadable —— 存档读不到，**不冒充空世界**。
    //
    //   为什么不写 OVERRIDES：先按规则表跑，判不出档的再单独登记（见下方 v2.407.0 段）。
    //   一次写死两种归类方式会让 A8（OVERRIDES 与规则表不得打架）失去意义。
    'attach-threw', 'bad-doc', 'bad-evidence-kind', 'empty-source', 'evidence-missing',
    'evidence-no-source', 'lower-priority-overrides-canonical', 'missing-anchor',
    'missing-provenance', 'missing-signature', 'no-established-state', 'relay-absent',
    'relay-threw', 'rewind-denied', 'store-unreadable', 'transact-no-output', 'whole-reject',
    // ── v2.411.0（R251 缝合批）：engines/body-anatomy.js 的 9 条拒收码 ──
    //   同一形态本仓已栽过八次（v2.203.0 的 17 条一路数到 v2.407.0 的 2 条）。本版按现场
    //   复算一次收敛：6 条由规则表收住（探针实测 via:'rule'，故不重复登记 —— 会让 A8 与
    //   规则表打架）；另 3 条（facing-contradiction / multi-anchor / veto-hit）分词都不在
    //   六档词表里，实测落到 difference 兜底档 ⇒ **无档**，已在 OVERRIDES 逐条显式登记。
    //   两条成功面（mapped / registered）已同批进 SUCCESS_FACE。
    'bad-facing', 'bad-side', 'bad-turn', 'facing-contradiction', 'head-count',
    'multi-anchor', 'no-support', 'over-capacity', 'veto-hit',
    // ── v2.517.0（V26 全开策略批）：模型调用链五引擎（model-receipt / model-pin /
    //   call-timeline / model-catalog / player-knowledge）+ lost-and-found /
    //   advance-idempotence 的 10 条现场新码，快照欠账一次收敛（第 9 次，v2.203.0 起）。
    //   全部由规则表收住（探针实测 via:'rule'，故不写 OVERRIDES —— 会让 A8 打架）：
    //     · missing-channel/missing-model → request-setup（missing/no 分词）
    //     · unknown-round → request-setup（unknown 分词；'round' 在 adjust-input 但
    //       首段优先级在前，实测裁决 request-setup，与 unknown-step 同档）
    //     · bad-sample → adjust-input（bad 分词）
    //     · not-pinned → request-setup（not 分词）
    //     · model-drift → rollback（drift 分词）
    //     · no-cache/fetch-failed → request-setup（no） / retry-same-input（failed）
    //     · claim-rejected → permanent-reject（rejected 分词）
    //     · duplicated → adjust-input（duplicate 分词）
    'bad-sample', 'claim-rejected', 'duplicated', 'fetch-failed', 'missing-channel',
    'missing-model', 'model-drift', 'no-cache', 'not-pinned', 'unknown-round',
    // ── v2.524.0（V27 收口）：本快照一次性补 31 条「现场有、快照没有」的拒收码。
    //   两类来源，都是同一件病的复发（只加码不跟快照）：
    //     ① 15 条本批新增（V27 的 OPV27-3/5/6/7/8/9 六项与五台新模块）：
    //        bad-items / empty-query / landed / no-audit / no-boot / no-console / no-phrase /
    //        no-reader / no-source / no-such-group / not-loaded / over-quota / read-threw /
    //        too-few-samples / unserializable。
    //     ② 16 条空间/拓扑批的欠账（local-grid / spatial-bridge / topology 一带）：
    //        activeScenes-full / cross-venue / cross-zone / local-grid-absent / missing-endpoint /
    //        missing-venue / missing-zone / nodes-full / portals-full / relate-absent / store-threw /
    //        topology-absent / unknown-spot / unknown-venue / unknown-zone / zone-unsolved。
    //   判据口径没动：这 31 条由 `node tools/reject-recovery.js` 的现场复算逐条点名，
    //   本条只把它们写进快照；其中 4 条分词表收不住（cross-venue / cross-zone /
    //   zone-unsolved / unserializable）已在 OVERRIDES 里逐条登记档位，其余由规则表收住。
    //   纪律：以后**加码的同批**就要改这里，否则 B3/B4/C4 会照旧红（本仓已栽过五次）。
    'activeScenes-full', 'bad-items', 'cross-venue', 'cross-zone', 'empty-query', 'local-grid-absent', 'missing-endpoint', 'missing-venue', 'missing-zone', 'no-audit', 'no-boot', 'no-phrase', 'no-reader', 'no-source', 'no-such-group', 'nodes-full', 'not-loaded', 'over-quota', 'portals-full', 'read-threw', 'relate-absent', 'store-threw', 'too-few-samples', 'topology-absent', 'unknown-spot', 'unknown-venue', 'unknown-zone', 'unserializable', 'zone-unsolved',
    // ── v2.524.0（V28 批一）：九台新引擎（offstage-queue / act-step / trace-post / misbelief /
    //   thread-sprout / dormant-ladder / consequence-schedule / appointment / time-ledger）的
    //   现场复算新增码。判据口径没动：这 28 条由 `node tools/reject-recovery.js` 逐条点名，
    //   本条只把它们写进快照。两条分词表收不住（hidden-leak / irreversible）已在 OVERRIDES
    //   逐条登记档位；too-many-open 由成功面**迁入**拒收面（consequence-schedule 的 ok:false
    //   站点命中括号配对判据「只要一处落在 ok:false 即拒收面」）；no-evidence 同批从判不出面迁入。
    //   纪律：以后**加码的同批**就要改这里，否则 B3/B4/C4 会照旧红（本仓已栽过六次）。
    'actor-missing', 'belief-not-found', 'duplicate-source', 'entry-missing', 'hidden-leak', 'irreversible', 'missing-about', 'missing-action', 'missing-aftermath', 'missing-belief', 'missing-choice', 'missing-content', 'missing-cost', 'missing-hook', 'missing-rounds', 'missing-source-ref', 'missing-verdict', 'need-cost', 'need-two-ids', 'no-evidence', 'no-settings-bus', 'per-choice-cap', 'rumor-missing', 'seed-missing', 'too-many-candidates', 'too-many-open', 'unknown-state', 'unknown-verdict',
    // v2.524.0（V28 批一·补）：hearsay-ledger（听来的 / 拼出来的）的现场新增拒收码 ——
    //   版本缺事件/缺听者、版本堆顶、按听者读不到、对质指向不存在的版本、
    //   碎片缺主题/缺内容/缺维度、碎片堆顶。逐条由 reject-v2780 的真跑见证点名。
    'missing-dimension', 'missing-listener', 'missing-shard', 'missing-topic', 'too-many-shards', 'too-many-versions', 'unheard', 'version-missing',
    // v2.524.0（V28 批二）：far-account（别处也在走）与 interlude（镜头之外）的现场新增拒收码 ——
    //   异地：地点不在册 / 两地没路；插曲：缺戏名、缺在场人、缺「他们知道什么」、
    //   写一句越界（leak）、段不存在、句数到顶、空段收戏。逐条由 reject-v2780 真跑见证点名。
    'empty-interlude', 'interlude-missing', 'leak', 'lines-full', 'missing-cast', 'missing-knows', 'no-path', 'place-missing',
    // v2.524.0（V28 批三）：letter-post（信）的现场新增拒收码 ——
    //   没说要送给谁 / 判一封不存在的信 / 没收到就回 / 同一封回两次。
    'already-replied', 'letter-missing', 'missing-to', 'not-received',
    // v2.524.0（V28 批三·续）：thread-sprout.recover（拾回只给后果）的两条拒绝 ——
    //   still-live（线还开着，接着跟就行）/ no-consequence（当初没写下「放着不管会怎样」）。
    'still-live', 'no-consequence',
    // v2.524.0（V28 批四）：world-brief（世界简报）的现场新增拒收码 ——
    //   没碎片就开板（no-shards）/ 没记录就说近况（no-readings）/
    //   年表条目说不出谁做的（no-owner）/ 还没发生就想进年表（not-happened）。
    //   四条都出现在 ok:false 对象里，逐条由 reject-v2780 真跑见证点名。
    'no-shards', 'no-readings', 'no-owner', 'not-happened',
    // v2.542.8（叙事脊柱 L1–L4 判据面收口）：四台新引擎的**调用级**拒收 —— 全部是 ok:false
    //   的返回体（scene-intent:182 no-agenda / inject-tier:148 apply-not-implemented /
    //   arc-phase:95 no-tension / character-drive:63 no-such-person）。
    //   恢复档不写 OVERRIDES：分词本就被规则表收住（no-* 与 *-implemented 都落 adjust-input，
    //   与 no-shards / unknown-page 同一条），重复登记会和 A8 打架。
    'apply-not-implemented', 'no-agenda', 'no-such-person', 'no-tension',
    // v2.566.0：core/store.js:5608 的 `type-conflict`（同一路径上旧值类型与写入值冲突，
    //   写入已被拒、状态未动）。它是 ok:false 的真拒收，此前漏进面快照。
    'type-conflict',
    // v2.566.0：`settle-` 是 ARTIFACTS 登记的词法碎片（dream.js 拼接前缀），
    //   而 A8 要求 ARTIFACTS 的键必须在拒收面快照里（它确实出现在 ok:false 对象里）。
    'settle-',
    // ── v2.583.0（R254）：新引擎 engines/attire-state.js 的七条**拒收面**码 ──
    //   它们都是 `ok:false` 的真拒收（衣服不会自己变 / 已有服装者换装缺理由 /
    //   主色与版型双双不继承 / 枚举越界 / 无档升级），此前只进了码面口径、没进本快照，
    //   于是 reject-recovery 专锁的 B3（三面快照）/B4（problems 面）/C4（审计问题面）
    //   三条齐红 —— 同一形态本仓已栽过八次（tools/smoke.js:82 那行注就是为此设的）。
    //   恢复档：`unknown` / `bad-*` 四条与 `style-drift` 都被规则表收住（via:'rule'，
    //   实测 5 条无档 0）；`continuity-lock` 与 `downgrade-coverage` 词表收不住 ⇒ 见 OVERRIDES。
    'bad-cause-kind', 'bad-upgrade-cause', 'bad-view', 'continuity-lock',
    'downgrade-coverage', 'style-drift', 'unknown',
    // ── v2.584.0（引擎深度）：`cause-scope` —— 有 cause 但原因解释不了被改的键。
    //   它**不是** bad-cause-kind（那是不在四类白名单内），也不是 no-cause（那是压根没给）；
    //   这一类是「原因给了、类别也合法，但这一类碰不到那个键」（姿态改整洁度）。
    //   分词 cause/scope 正好被规则表收在 adjust-input（`scope` 在词表里）⇒ 不写 OVERRIDES。
    'cause-scope',
    // ── v2.585.0（R261）：外貌名单级拒收**没有新增码** —— `unknown-item` / `missing-item`
    //   早已存在（gear.js 与 followup-gate.js 就在用），本版只是把同一对码用在**外貌名单**上，
    //   语义不变（名单外 / 该级必盖项没盖）。故本快照不动：往这里加两条会把 1697 抬成 1699，
    //   而现场仍是 1697 —— reject-recovery 专锁 B3 当场报「快照与现场不一致」（本轮实测）。
    //   「新用途 ≠ 新码」：码面记账按**码**，不按**调用点**。
  ];
  /** 成功面冻结快照（v2.192.0 现场实测 34 条）。
   *  它们**只**出现在 `ok:true` 对象里 —— 不配恢复动作，`explain()` 对它们给 `kind:null`。
   *  与现场的逐条一致性由 tests/reject-recovery-lock-v2192.js 核对（多一条少一条都红）。 */
  const SUCCESS_FACE = ['absent', 'all-duplicates', 'already', 'already-consumed', 'already-open',
    // v2.518.0：story-window 的 `wait` 入口在没有 act 写口可委托时，返回 ok:true 并把窗口挂在
    //   deferred 上（不产生任何完成事实）—— 它是成功面，不是拒收面。
    'waiting-window-held',
    'anonymous', 'applied', 'attenuated', 'checked', 'clean', 'first', 'first-baseline',
    'halted', 'interior-blocked', 'module-disabled', 'needs-real-device', 'no-elapsed', 'no-far',
    'not-in-table', 'ok', 'omniscient', 'out-of-lens', 'pass',
    // ── v2.568.0（引擎深度两条主线）：metabolismClock.worldTick 的三条**成功面**返回。
    //   判据同本表：三条只出现在 `ok:true` 对象里（缺钟/未推进/首次基准都是「如实摇头」，
    //   不是拒收）—— 给它们编恢复动作就是造数据。
    'advanced', 'first-tick', 'no-advance',
    'player-view', 'premature', 'range-off', 'reuse', 'same-day', 'trigger-fired', 'triggered',
    'unlocked', 'within-lock',
    // v2.517.0（V26 批）：engines/player-knowledge.js 的新成功返回（known:false + reason:'not-recorded'，
    //   ok:true 侧），同批迁入成功面；'recorded' 分词在 adjust-input 词表，但成功面快照优先裁决。
    'not-recorded',
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
    // ── v2.380.0（同上批次）：成功面补齐 23 条。全部实测**只**落在 ok:true 对象里：
    //   credit-ledger 的三态（good-standing / overdue-present / too-many-open）尤其要看清 ——
    //   它们返回 `ok:true, allowed:false`：调用没被拒，只是**信用不够**，那是查询的结论，
    //   给它配恢复动作就是教玩家去「修」一件本就没坏的事（与 built / quiet 同一条边界）。
    'already_unmasked', 'choke-triggered', 'cost-applied', 'counterfactual-echo-evoked', 'dispatched', 'faction-split-enacted',
    'foreshadow-erupted', 'good-standing', 'memory-transplanted', 'no-characters', 'no-idiosyncrasies', 'occluded-in-secret-pocket-or-hidden-layer',
    'out-of-earshot', 'overdue-present', 'pending-dispatched', 'projected', 'reform-enacted', 'room-empty-or-quiet',
    'routine-disrupted-sheltered', 'rupture-enacted', 'scramble-completed', 'threshold-not-met', 
    // ── v2.411.0（R251 缝合批）：engines/body-anatomy.js 的两条**成功面** ──
    //   为什么成功面也要进快照：这两条都返回 ok:true（镜像算好了 / 首次登记落账了）。
    //   快照缺了它们，explain() 只能答 unknown，面板会给「做成了」配一个恢复动作
    //   —— 正是本面存在要挡住的那类教玩家修没坏的东西（与 built / quiet 同一条边界）。
    'mapped', 'registered',
    // v2.524.0（V28 批一）：`ok:true` 的**回执码**（接上了 / 记下了 / 标上了 / 结算了）。
    //   它们不是「没拒收」，而是「确实做成了一件事」，故归成功面，不进恢复档。
    'already-live', 'collided', 'corrected', 'cost-recorded', 'dropped', 'hooked', 'jump-noted', 'marked', 'no-calendar', 'no-schedule', 'no-story-round', 'planted', 'settled', 'slot-unknown',
    // v2.524.0（V28 批一·补）：拼图的三个 `ok:true` 回执 ——
    //   need-more（块不够不下结论）/ assembled（维度够才拼）/ overturned（一条反证整块作废）。
    'assembled', 'need-more', 'overturned',
    // v2.524.0（V28 批二）：异地与插曲的 `ok:true` 回执 ——
    //   路径三答（same-place / road / two-hops）、没走账（no-account）、写下一句（lined）。
    'lined', 'no-account', 'road', 'same-place', 'two-hops',
    // v2.524.0（V28 批三）：信的 `ok:true` 回执 —— 收到之后回了一封。
    'replied',
    // v2.524.0（V28 批三·续）：拾回的回执 —— 只拿到后果，且明说不能回到那个岔口。
    'recovered',
    // v2.524.0（V28 批四）：世界简报的两个 `ok:true` 回执 ——
    //   `ok-empty`（这 5 轮没有值得说的事：安静是合法结果，不是错误）/
    //   `listed`（年表收下一条：有 owner、已发生）。两者都不配恢复动作。
    'ok-empty', 'listed',
    // v2.566.0：engines/spotlight.js:209 的 `followup-hold`（轻提静默闸：本轮先按住、
    //   等下一轮再说）—— 它是 ok:true 的**成功回执**，不是被拒，故归成功面、不配恢复档。
    'followup-hold',
    // ── v2.583.0（R254）：attire-state 的两条**成功面**回执 ──
    //   判据同本表：两条只出现在 `ok:true` 对象里（缺快照 ⇒ explain() 只能答 unknown，
    //   面板会给「做成了」配一个恢复动作 —— 正是本面存在要挡住的那类假动作）。
    //     · allowed：换装**获准**（`{ok:true, allowed:true}`）。它容易被当成「拒收被撤销」，
    //       其实是查询结论 —— 与 v2.380.0 的 good-standing 同一条边界（ok:true, allowed:false
    //       在那边是成功面，这边 allowed:true 更是）。
    //     · first-establish：首次建档落账（这套衣着第一次被登记）。
    'allowed', 'first-establish',
  ];
  /** 判不出面冻结快照（v2.192.0 现场实测 53 条），与 NEUTRAL_REVIEW 的键集**必须逐字相同**。 */
  const NEUTRAL_FACE = ['after-reply', 'already-done', 'already-json', 'already-running',
    // v2.524.0（V27 收口）：两条现场落在判不出面的新码 —— 它们所在的对象**不带 ok**
    //   （`hits.push({outcome:'kept', reason:'landed'})` / boot-report 的归档口在没有 console 时
    //   返回 `{reason:'no-console'}`），故既不是拒收也不是成功。按现场归属收在这里，不按名字猜。
    'landed', 'no-console',
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
    // ── v2.380.0（同上批次）：判不出面补齐 10 条（对象不带 ok 的记录/读数理由）。
    //   键集与 NEUTRAL_REVIEW 必须逐字相同（A7），故下方登记表同批补入同样 10 条。
    'cascade_bus_tick', 'collateral-default', 'compact', 'contraband_smuggling_caught', 'debt-breach', 'different_venues',
    'forgery-detected', 'intercepted-by-physiological-circuit-breaker', 'out_of_service', 'room_partition',
    // ── v2.407.0：engines/chat-recycle.js 的 plan() 给「待清项」标的清理依据 ──
    //   它落在 `{ file, title, at, seq, reason:'earliest-unlocked' }` 这个**不带 ok** 的对象里
    //   （那是 victims 数组的一行，不是调用返回体）⇒ 现场面判不出，按契约逐条登记。
    //   键集必须与 NEUTRAL_REVIEW 逐字相同（A7 咬这一条），故下方登记表同批补入。
    'earliest-unlocked',
    // ── v2.410.0：engines/elapsed-evidence.js 的证据定位两态（现场对账漏同步，本版补齐）──
    //   `no-evidence`（:213 autoMinutes 出口，模型没给 timeEvidence）/ `not-in-text`（:165
    //   locate() 内部定位码，出口拼成 evidence-not-in-text 再面世）—— 两条都出现在
    //   **不带 ok 的定位读数对象**里（`{ found:false, clause:'', reason:'…' }`），
    //   语义是「证据找不到」这一事实记录，不是调用被拒 ⇒ 判不出面（与 cascade_bus_tick 同规）。
    //   这两条在 v2.409.0 跨参照物批带出后未同步进快照（clean HEAD 复跑同红，非本版引入）。
    'not-in-text',
    // ── v2.542.8（叙事脊柱 L1–L4 判据面收口）：与本期 NEUTRAL_REVIEW 同批的五条 ——
    //   键集必须逐字相同（A7 咬这一条），故两处只能同批改。
    'empty-scene', 'no-field', 'no-line', 'no-text', 'none-developing',
    // ── v2.542.18：engines/time-ledger.js 「正文时间」读面的四种「读不到」（现场对账漏同步，本版补齐）──
    //   四个码都出现在 `read().story` / `read().reconcile` 这类**不带 ok 的读数对象**里
    //   （`{ known:false, reason:'no-stamp', scanned:n }`），语义是「这一格读不出来 / 本来就没有」，
    //   而不是「调用被拒」⇒ 判不出面。
    //   `no-messages`（拿不到楼层 = 算不出来）/ `no-stamp`（扫过了，正文真没写标签）/ `no-storyclock`（依赖缺席）/ `storyclock-disabled`（总开关关）四态分离。
    //   为什么进快照而不进 REJECT_FACE：它们的产品出口是**读数**，生成链不会因为「算不出时间」而拒收。
    'no-messages', 'no-stamp', 'no-storyclock', 'storyclock-disabled',
  ];

  WA.rejectRecoveryTables = {
    RULES: RULES, OVERRIDES: OVERRIDES, ARTIFACTS: ARTIFACTS,
    NEUTRAL_REVIEW: NEUTRAL_REVIEW, REJECT_FACE: REJECT_FACE,
    SUCCESS_FACE: SUCCESS_FACE, NEUTRAL_FACE: NEUTRAL_FACE
  };
  if (WA.log) WA.log('info', '拒收恢复冻结表已加载');
  // OPV29-09：表文件也是模块（有自己的命名空间 `rejectRecoveryTables`），
  // 尾调 registerModule 让它进账本 —— 否则命名空间只存在于静态提供方面，
  // module-cycle-gate 的 B6 会把它记成「static-only 漂移」（实测 2 条正是这两个表）。
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('engines/reject-recovery-tables.js', { kind: 'data', ver: '2.529.0' });
  }
})();
