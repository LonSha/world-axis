/**
 * plans/V26_MASTER_PLAN.md (v2.517.0) — V26 模型可观测性批（一个大版本做完）
 *
 * ── 批次来源（用户口径，2026-11-16 会话）──────────────────────────────
 *   「想要确认模型是否被路由，还有是否被降低智力，以及 tps 之类的」
 *   「再加一点其他线，这一版更新还是太小了，即使 0.1 都算不上」
 *   ⇒ 版本号 +0.1（2.417.0 → 2.517.0），一个版本做完，不再按小版本切片。
 *
 * ── 既有事实（开工前实测，全部 grep 复核）────────────────────────────
 *   ① core/api-router.js 是全仓模型调用唯一出口（6 渠道），callLedger 已记
 *      count/ok/errors/lastMs/avgMs —— 但只记请求侧。
 *   ② 响应体里的 data.model（服务端实际用哪个模型服务了你）与 data.usage
 *      （prompt/completion tokens）被 _callInner 直接丢弃 ⇒ 「是否被降智」
 *      与「TPS」现在全库答不出（grep 'usage|data.model' core/api-router.js = 0 命中）。
 *   ③ 后台常驻引擎（backstage/periodicals/ensemble/…）无人问津时也在烧 token
 *      与窗口，无任何总量视角（grep tokenBudget: 0 命中）。
 *   ④ longCall 探针把探针自身占用与真后台推演混在一个数值里（注释自认的已知缺口）。
 *
 * ── 本批四项（每项真缺口先专锁后实现）────────────────────────────────
 *   OPV26-1  engines/model-receipt.js   WA.modelReceipt —— 响应回执账：
 *            record() 由 api-router 成功路径盖章 {channel, reqModel, respModel,
 *            usage, ms, tps}；漂移判据 respModel && reqModel && 不相等 ⇒
 *            drift:true 且计数（对证「是否被降智」——服务端回执是唯一可对证的凭据）；
 *            list/stats/drifters 三读；环形上限防涨（maxRows）。
 *   OPV26-2  core/api-router.js 接线 —— _callInner 成功路径（opts.json 分支之前）
 *            盖章：record({channel, reqModel: cfg.model, respModel: data.model,
 *            usage: data.usage, ms, at})；record 故障绝不阻断真调用（try/catch 收住，
 *            与 requestViewer.capture 同纪律）。回执 model 缺席（部分兼容端不回）
 *            ⇒ 如实记 respModel:null，不猜。
 *   OPV26-3  engines/token-budget.js    WA.tokenBudget —— 用量/延迟分位视图：
 *            observe({channel, kind, promptTokens, completionTokens, ms, at})
 *            由 OPV26-2 顺路喂 + 供后台常驻引擎显式上报；按渠道聚合计数与
 *            tokens 总量，ms 分位 P50/P95（环形样本上限 maxSamples，重置过期，
 *            超窗样本不进分位——过期读数会污染决策）；debt 视图点名只登记未喂账的渠道。
 *   OPV26-4  收口面 —— tool-diag MODULE_EXPORTS 双登记；action-desk 路由
 *            （modelReceipt.* 8 条 + tokenBudget.* 4 条）；ui/panel.js 可观测块
 *            一行展示（漂移计数 + 昨 Tokens，UI 只读引擎、不自算）；
 *            tests/scenario-v70-v26-observability.js 场景 70 专锁
 *            （合法因果贯通 + ≥2 条真源码负控制 + 路由全覆盖）。
 *
 * ── 铁律（沿 V25 全套，逐字沿用）────────────────────────────────────
 *   · 无源不入账、无写不落盘、无验不上线；
 *   · 写口统一收拢 ActionDesk；UI 只读引擎；
 *   · 每项真缺口先专锁后实现；真源码负控制必须「破坏真代码后拒收码现形」；
 *   · 新持久键在 core/evict.js SITES 登记站点容量（modelReceipt 环形账、
 *     tokenBudget 环形样本都要有 cap 且 trim 实测）；
 *   · 版本四件套同批升 2.517.0（index VERSION / run.js __wantPin293 /
 *     manifest / module-registry-ledger）；s3 专锁白名单与 minor 段跟位（417→517）；
 *     export-contract 重冻结；收口提交后回填 BUILD_ID。
 *
 * ── 同名异义排除（不立账）────────────────────────────────────────────
 *   · 「模型回执」≠ requestViewer（那是请求报文账，捕获于 fetch 之前；
 *     本批是响应凭据账，解析于 res.json() 之后）——互补不重叠。
 *   · 「用量台账」≠ callLedger（后者只有次数与耗时，无 tokens）——前者是它的 token 维度补全。
 */
