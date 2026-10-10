#!/usr/bin/env node
// WorldAxis tests/reject-v2780.js — 拒收码见证表（v2.78.0 第十二面）
//
// 「见证」不是声称，是可执行事实：runWitness(WA) 用产品真 API 把每个码跑出来。
//   某条若不再产出自己的码（行为被改），它会被如实记进 missing，由门禁红灯。
//
// 依赖注入：本文件不自己装产品，调用方传已装好的 WA。
'use strict';

// ── 死表：已证不可达（带可复算的前提锚点）──
//   存在但跑不到的码，要么把它变可达，要么明记为不可达并钉住它为何不可达。
//   不能静默留着——从未被观察过的码，下一次被改成别的意思也没人知道。
const DEAD = {
  // v2.119.0（拓展⑧/⑨）备查：`store-absent` 在**产品层**结构不可观测 ——
  //   它由三处 mutate 在「存储面没有 transact」时构造（world.js 的 mutate、causal /
  //   phone-bridge / act / liaison / coop 的同名出口），但**没有任何一个调用方透传这个返回值**：
  //   全仓 `return mutate(` 零命中，所有 mutate 调用点都是「事务外声明 out、事务回调里赋值」，
  //   事务失败时各自走自己的兜底码（store-unavailable / 各自的前置闸）。
  //   实测（/tmp/dbg_store6.js：保留 WA.exec、只摘掉 WA.store 的 transact）：
  //     world.dropBlock → store-unavailable（源码里的兜底字面量，不是 mutate 的）
  //     world.arrive / stop → store-unavailable
  //     world.addRoad → bad-minutes、world.addBlock → unknown-place（更早的前置闸先拦）
  //     causal.tick → ok:true nothing-to-do、phoneBridge.noteAction → store-unavailable
  //   ⇒ 那个 `{ok:false, reason:'store-absent'}` 永远进不了任何返回值，不可观测。
  //   （注：tests/perf-trace-v2102.js 锁的是 perf-trace 自己的 `kind:'store-absent'`，
  //    字段名是 kind 且在 perf-trace.js 内被直接 return —— 与这三处 mutate 无关。）
  //   不删：若将来某个调用方开始透传 mutate 的返回值，它是第一道防线；
  //   届时本门禁会以 deadLeak 提醒「该码可能复活」。
  'store-absent': {
    anchor: "      ? facade.transact(fn, opt) : { ok: false, reason: 'store-absent' };",
    why: '三处 mutate 在存储面缺 transact 时构造 store-absent，但全仓无一处透传该返回值'
      + '（`return mutate(` 零命中；调用点一律是 out 变量 + 各自兜底码）⇒ 不可观测。'
      + '实测：摘掉 store 的 transact 后，各入口给出的是 store-unavailable 或更早的前置闸。'
      + '不删：将来若有调用方开始透传 mutate 的返回值，它是第一道防线。'
  },
  // v2.119.0（拓展⑧）备查：liaison.settleDeal 的关系后果分支里 `no-relation-face` 在现设计下
  //   **结构不可达** —— 它是 `applyRelation(...)` 返回**假值**时的兜底：
  //     `out.relation = rel ? {...rel} : { ok: false, reason: 'no-relation-face' }`
  //   而 applyRelation 的所有出口都返回**真值对象**：`{ok:false, reason:'relation-absent'}`、
  //   `{ok:false, reason:'missing-person'}`、`{ok:false, reason:'no-negative-step'}`、
  //   `{ok:true, ...}`、`{ok:false, reason:'relation-threw'}`——没有一个出口返回 null/undefined/false。
  //   故 `rel ?` 恒为真，三元表达式的 else 分支永远拿不到执行权。
  //   不删：若将来 applyRelation 被改成「静默返回空」的形态，它是第一道防线；
  //   届时本门禁会以 deadLeak 提醒「该码可能复活」。
  'no-relation-face': {
    anchor: "out.relation = rel ? Object.assign({ ok: !!rel.ok }, rel) : { ok: false, reason: 'no-relation-face' };",
    why: 'liaison.settleDeal 的关系后果用一个三元兜底 `rel ? ... : no-relation-face`，'
      + '但被调的 applyRelation 五条出口（relation-absent / missing-person / no-negative-step / 成功 / relation-threw）'
      + '**每一条都返回真值对象**，无一返回假值 ⇒ `rel` 恒为真，else 分支恒不可达。'
      + '不删：将来若 applyRelation 改成可能返回空值（例如把「没人可记」静默吞掉），它是那道兜底；'
      + '届时本门禁会以 deadLeak 提醒它可能复活。'
  },
  // v2.119.0（拓展④）备查：inst.charter 的 kind-locked 在现设计下**结构不可达** ——
  //   同一入口里前一道守卫是 `if (seen && !o.replace) return 'exists'`，而 kind-locked 的
  //   条件是 `if (seen && seen.kind !== kind && !o.replace)`：凡是能走到第二道的输入，
  //   其 `seen && !o.replace` 必为真 ⇒ 第一道已经先把调用**拒掉并返回**了。
  //   即「重复建档」这一情形一律归因 exists，第二个分支永远拿不到执行权。
  //   不删：若将来把 exists 的判据放宽（例如允许同名不同 kind 并存），它是第一道防线；
  //   届时本门禁会以 deadLeak 提醒「该码可能复活」。
  'kind-locked': {
    anchor: "if (seen && seen.kind !== kind && !o.replace) {",
    why: 'inst.charter 两道守卫次序相扣：第一道 `seen && !o.replace ⇒ exists` 先返回；'
      + '第二道 `seen && seen.kind !== kind && !o.replace ⇒ kind-locked` 的输入集合是第一道的子集，'
      + '故 kind-locked 恒不可达。实测：先 charter(会甲, 公司) 再 charter(会甲, 帮派)，返回 exists 而非 kind-locked。'
      + '不删：若 exists 的判据将来放宽，它是第一道防线（届时 deadLeak 会提醒它可能复活）。'
  },
  // v2.117.0（B2）备查：单地点天气封锁这一支在现设计下结构不可达（判定链路为
  //   reach 建图 → 逐段 effectiveBlockOf → 分通道容量，路段级封锁走 road-closed /
  //   blocked-delivered），但它的源码形状是 `out.reason = 'weather-blocked'`（赋值），
  //   而扫描面的词法视角只认对象字面量 `reason: 'x'` ⇒ 它**从来不在这张表要盘的面上**。
  //   故正确处置是只把它从台账 base 回收（消除「台账冗余」），**不写进死表**：
  //   deadMissing 的判据是「死表码必须在源码里找得到」，而扫描面根本扫不到它。
  //   可达的是**路段级**封锁（`road: [甲,乙]` 落成 `甲~乙` 复合键），它在 `transit` 里以
  //   road-closed / blocked-delivered 如实归因；而 weatherBlockOf 读的是地点级的天气块，
  //   本版所有「人/货/消息能不能过」的判定都先经 reach 建图、再逐段问 effectiveBlockOf，
  //   分通道容量与路段封锁已把「这一段此刻不行」答尽 ⇒ 地点级 weather-blocked 没有入口。
  //   不删：若将来放开「按地点整体封锁」，它是第一道防线（届时 deadLeak 会提醒它可能复活）。
  'bad-operator': {
    anchor: "else return { ok: false, reason: 'bad-operator', detail: v };",
    why: 'parseCmp 的筛选形式是：取 tk，要求 tk.t === "op"，p++，v := tk.v；'
      + '而 tokenize 产 op 的分支只输出 >=/<=/==/!=/>/<，该集合恰是下面 if/else 链的全部分支，'
      + '故 else 永不取。穷举验证：6174 个长度≤3 的词法组合全跑一遍，该码零见证。'
      + '不删：若未来新增比较符，它是第一道防线（本面门禁会在那时通过 deadLeak 提醒「该码可能复活」）。'
  },
  'backup-corrupt': {
    anchor: "catch (e) { return { ok: false, reason: 'backup-corrupt', reverted: 0 }; }",
    why: 'v2.83.0（B6）cfgRollback 的备份解析出口，在当前设计下**结构上不可达**：'
      + 'cfgRollback 只在「写盘阶段中途失败」时被调用，而进入写盘阶段的前提是**导入前备份已成功写入**'
      + '（备份失败会在写盘前以 backup-failed 拒收整次导入，见 settings-bus 的写盘前置条件）。'
      + '而备份成功必然把同一个备份键覆写成合法 JSON ⇒ cfgRollback 读到的必是合法 JSON。'
      + '故要走这条分支，得先有一个「存在但不是 JSON」的备份键，同时备份写入又失败——与前置条件互斥。'
      + '不删：第三方脚本或外部工具若直接调用回滚入口（或未来备份环引入多源写入），它是第一道防线；'
      + '届时本门禁会以 deadLeak 提醒「该码可能复活」。'
  },
  'bad-draft': {
    anchor: "if (!draft || typeof draft !== 'object') return { ok: false, reason: 'bad-draft' };",
    why: 'registry.ensurePerson（v2.86.0 A3，people 条目的唯一写者）的入参守卫，在现有调用面上'
      + '结构不可达：它的调用点（life.person / intel.personRow / backstage 两处 / registry.setProfileSafe）'
      + '全部位于 store.transact(function (draft) {...}) 回调内，而 transact 保证传入骨架草稿对象。'
      + '不删：唯一写者是对外导出，越界调用时它是第一道防线；届时本门禁会以 deadLeak 提醒它可能复活。'
  },
  'end-failed': {
    anchor: "if (!tape || !tape.ok) return { ok: false, reason: 'end-failed', result: result };",
    why: 'causal.record（v2.89.0 O2）的收卷失败出口，在现有设计下**结构不可达**：'
      + '进入该分支的前提是 beginTape 成功，而 beginTape 成功必然把磁带置于 open=true；'
      + 'endTape 的拒收条件恰是“磁带不存在或已收卷”，两者互斥。唯一能造出'
      + '“begin 成功但 end 拒绝”的路径是自己先把磁带收掉，而收卷发生在 finally 里、fn 体拿不到句柄。'
      + '不删：将来若磁带面被改成可重入（外部可提前收卷），它是第一道防线；'
      + '届时本门禁会以 deadLeak 提醒它可能复活。'
  },
  'migration-loop': {
    anchor: "if (++guard > 64) return { ok: false, reason: 'migration-loop' };",
    why: 'checkpoints.migrate 的自旋防护在 FORMAT=1 期**结构上不可达**：循环条件 f < FORMAT 要求 f<1，'
      + '而唯一的迁移登记入口 registerMigration 收窄为 f<1 ⇒ missing-fields，0/-1/-2 全被拒。'
      + '故循环体内永远拿不到 step，至多转 1 圈即走 no-migration 出口，guard 永不越 64。'
      + '穷举验证（/tmp/diag7.js）：registerMigration(-2..0) 全返回 missing-fields；'
      + 'migrate({worldaxisCheckpoint:0}) 返回 no-migration。不删：将来若新增 format 2 与相应迁移，'
      + '它是第一道防线（届时本门禁会以 deadLeak 提醒「该码可能复活」）。'
  },
  'no-localStorage': {
    anchor: "const w = win(); if (!w || !w.localStorage) return { ok: false, reason: 'no-localStorage' };",
    why: 'life.turnStore（v2.132.0 O19）的「宿主没有 localStorage」出口，在现有设计下'
      + '**结构上不可达**：进入该行的前提是 `turnCfg()` 已返回 true，而 `turnCfg()` 读的是'
      + '`settingsBus.read(TURN_REG)` —— 与 `win()` 同一个真源（core/settings-bus.js 全库 10 处'
      + '统一写作 `(WA.mainWin || window).localStorage`）。宿主没有 localStorage 时，'
      + 'settingsBus 读不到盘、回落登记项的 `def`（`{ crossSession: false }`）⇒ `turnCfg()` 必为 false'
      + '⇒ `turnStore()` 在**第一行**就以 `disabled` 返回，永远走不到本码。'
      + '实测（/tmp/wa_probe_nols5.js）：把 `WA.mainWin` 换成 `{}` 后，'
      + '`settingsBus.read(life 注册项)` 由 `{enabled:true,crossSession:true}` 变为'
      + '`{enabled:false,maxPeople:4,maxItems:2}`（crossSession 键消失）；'
      + '另一探针（/tmp/wa_probe_nols4.js，先写盘开双开关再摘掉宿主存储）给出的 tick 仍是'
      + '`reason:"disabled"` —— 两向都指回同一个前置闸。'
      + '不删：它与 `write-failed` 是**两件事**（「根本没落盘能力」vs「有盘但写失败」），'
      + '将来若 `turnCfg()` 改为读缓存/内存镜像（不再依赖宿主存储），它是第一道防线；'
      + '届时本门禁会以 deadLeak 提醒「该码可能复活」。'
  },
  // v2.166.0（TX2）备查：agency.js 内部函数 5 码，在标准 boot 环境下无法直接触发。
  'no-step': {
    anchor: "if (!step) return { ready: false, reason: 'no-step' };",
    why: 'agency.checkPrereqs: plan has ok but step is null. Needs plan.current to return ok with empty step field.'
  },
  'already-running': {
    anchor: "if (step.status === 'running') return { ready: false, reason: 'already-running' };",
    why: 'agency.checkPrereqs: current step already running. Needs schedule to be called once before.'
  },
  'already-done': {
    anchor: "if (step.status === 'done') return { ready: false, reason: 'already-done' };",
    why: 'agency.checkPrereqs: current step already done. Needs processReceipts to settle step then schedule again.'
  },
  'no-act-row': {
    anchor: "if (!actRow) { out.deferred.push({ receipt: r.opId, reason: 'no-act-row' }); return; }",
    why: 'agency.processReceipts: receipt has no matching act row. Needs acts.res with receipt but acts.rows without matching id.'
  },
  'step-not-running': {
    anchor: "out.deferred.push({ receipt: r.opId, reason: 'step-not-running', person: who, seq: step ? step.seq : -1 });",
    why: 'agency.processReceipts: receipt found act but step not in running state.'
  },
  'act-unavailable': {
    anchor: "if (!WA.act || !WA.act.add || !WA.act.admit) {",
    why: 'agency.schedule: act module not loaded. Cannot trigger in standard boot (act always loaded).'
  },
  'plan-unavailable': {
    anchor: "if (!WA.plan || !WA.plan.settle) {",
    why: 'agency.processReceipts: plan module not loaded. Cannot trigger in standard boot (plan always loaded).'
  },
  // v2.167.0（TX3）：freight 拒收码 DEAD 表登记（engines/freight.js）。
  //   以下 7 码在标准 boot 环境需要复杂前置条件（需先 setup economy 数据：
  //   route + goods + 启用 freight），无法在无数据的 boot 环境直接 trip。
  'already-arrived': {
    anchor: "if (sh.status === 'arrived') { noteFault('already-arrived'); return { ok: false, reason: 'already-arrived', id: sid }; }",
    why: 'freight.arrive: shipment already arrived. Needs prior dispatch + arrive.'
  },
  'bad-state': {
    anchor: "if (sh.status !== 'transit') { noteFault('bad-state'); return { ok: false, reason: 'bad-state', id: sid, status: sh.status }; }",
    why: 'freight.arrive/cancel/reroute: shipment not in transit state. Needs prior dispatch + state change.'
  },
  'missing-dest': {
    anchor: "noteFault('missing-dest'); return { ok: false, reason: 'missing-dest', hint: '路线缺少目的地' };",
    why: 'freight.dispatch: route has no destination. Needs route without to field.'
  },
  'missing-transit-time': {
    anchor: "if (days === null || days <= 0) { noteFault('missing-transit-time'); return { ok: false, reason: 'missing-transit-time', hint: '运输时长未指定，缺少距离就拒算' }; }",
    why: 'freight.dispatch: no transit time given. Needs opts without transitDays.'
  },
  'shipments-full': {
    anchor: "if (fr.shipments.length >= cfg.maxShipments) { out = { ok: false, reason: 'shipments-full', cap: cfg.maxShipments }; return false; }",
    why: 'freight.dispatch: shipments array at capacity. Needs maxShipments prior shipments.'
  },
  'unknown-shipment': {
    anchor: "if (!sh) { noteFault('unknown-shipment'); return { ok: false, reason: 'unknown-shipment', id: sid }; }",
    why: 'freight.arrive/cancel/reroute/view: shipment not found. Needs non-existent shipment ID.'
  },
  'unknown-source': {
    anchor: "if (!g) { noteFault('unknown-source'); return { ok: false, reason: 'unknown-source', place: src, resource: res }; }",
    why: 'freight.dispatch: source goods not found. Needs place/resource not in economy.goods.'
  },
  // v2.168.0（TX4）：story-choice 拒收码 DEAD 表登记（engines/story-choice.js）。
  //   以下 6 码在标准 boot 环境需要复杂前置条件（需先 setup branchTree/rehearsal/commit 数据）。
  'already-confirmed': {
    anchor: "if (rec.choice) { noteFault('already-confirmed'); return { ok: false, reason: 'already-confirmed', id: rec.id, choice: rec.choice }; }",
    why: 'storyChoice.confirm: choice point already confirmed. Needs prior present + confirm.'
  },
  'branchtree-absent': {
    anchor: "if (!WA.branchTree || typeof WA.branchTree.fork !== 'function') { noteFault('branchtree-absent'); return { ok: false, reason: 'branchtree-absent' }; }",
    why: 'storyChoice.present/confirm: branchTree module not loaded. Cannot trigger in standard boot (branchTree always loaded).'
  },
  'choose-failed': {
    anchor: "if (!cr || !cr.ok) { noteFault('choose-failed'); return { ok: false, reason: 'choose-failed', detail: cr ? cr.reason : 'no-result' }; }",
    why: 'storyChoice.confirm: branchTree.choose returned failure. Needs branchTree to reject the choose call.'
  },
  'fork-failed': {
    anchor: "if (!fr || !fr.ok) { noteFault('fork-failed'); return { ok: false, reason: 'fork-failed', detail: fr ? fr.reason : 'no-result' }; }",
    why: 'storyChoice.present: branchTree.fork returned failure. Needs branchTree to reject the fork call.'
  },
  'preview-rejected': {
    anchor: "if (!optRec.allowed) { noteFault('preview-rejected'); return { ok: false, reason: 'preview-rejected', option: opt, rejects: (optRec.preview && optRec.preview.reject) || [] }; }",
    why: 'storyChoice.confirm: option ops failed rehearsal.preview whitelist. Needs ops that get rejected by preview.'
  },
  'no-result': {
    anchor: "detail: cr ? cr.reason : 'no-result'",
    why: 'storyChoice.confirm: branchTree.choose returned null/undefined (not ok:false). Cannot trigger in standard boot.'
  },
  // v2.169.0（TX6）: commission 拒收码 DEAD 表登记（engines/commission.js）。
  //   以下 4 码在标准 boot 环境需要复杂前置条件（需先 setup 足够多的合同或预算不足的 org）。
  'contracts-full': {
    anchor: "if (cur.length >= cfg.maxContracts) { noteFault('contracts-full'); return { ok: false, reason: 'contracts-full', cap: cfg.maxContracts }; }",
    why: 'commission.create: max contracts reached. Needs 24+ existing contracts in state.'
  },
  'no-budget': {
    anchor: "if (!aff) { noteFault('no-budget'); return { ok: false, reason: 'no-budget', principal: principal, reward: reward }; }",
    why: 'commission.create: principal cannot afford reward. Needs org.canAfford to return false.'
  },
  'no-stages': {
    anchor: "if (stages.length < 1) { noteFault('no-stages'); return { ok: false, reason: 'no-stages', have: stages.length, need: 1 }; }",
    why: 'commission.create: zero stages provided. Witnessed by passing empty stages array.'
  },
  'too-many-stages': {
    anchor: "if (stages.length > cfg.maxStages) { noteFault('too-many-stages'); return { ok: false, reason: 'too-many-stages', cap: cfg.maxStages }; }",
    why: 'commission.create: stages exceed maxStages cap. Needs >8 stages in spec.'
  },
  // v2.170.0（TX7）: investigation 拒收码 DEAD 表登记（engines/investigation.js）。
  'already-revealed': {
    anchor: "if (clue.revealedTo.indexOf(who) >= 0) { noteFault('already-revealed'); return { ok: false, reason: 'already-revealed' }; }",
    why: 'investigation.reveal: clue already revealed to this person.'
  },
  'clues-full': {
    anchor: "if (clues().length >= cfg.maxClues) { noteFault('clues-full'); return { ok: false, reason: 'clues-full', cap: cfg.maxClues }; }",
    why: 'investigation.register: max clues reached. Needs 32+ existing clues in state.'
  },
  'enigma-failed': {
    anchor: "noteFault('enigma-failed'); return { ok: false, reason: 'enigma-failed', detail: mr.reason };",
    why: 'investigation.reveal: enigma.mark failed. Needs enigma to reject the mark call.'
  },
  'insufficient-evidence': {
    anchor: "noteFault('insufficient-evidence'); return { ok: false, reason: 'insufficient-evidence', verdict: chk.verdict };",
    why: 'investigation.reveal: evidence verdict not verified/cannot-judge. Needs insufficient evidence.'
  },
  // v2.171.0（TX8）: aftermath 拒收码 DEAD 表登记（engines/aftermath.js）。
  'duplicate-event': {
    anchor: "if (findByEvent(eventId)) { noteFault('duplicate-event'); return { ok: false, reason: 'duplicate-event', eventId: eventId }; }",
    why: 'aftermath.register: same eventId already registered. Needs 2nd register with same eventId.'
  },
  'effects-full': {
    anchor: "if (effects().length >= cfg.maxEffects) { noteFault('effects-full'); return { ok: false, reason: 'effects-full', cap: cfg.maxEffects }; }",
    why: 'aftermath.register: max effects reached. Needs 48+ existing effects in state.'
  },
  // v2.172.0 (TX9): operations reject codes DEAD table (engines/operations.js)
  'duplicate-enact': {
    anchor: "if (findByDecision(decId)) { noteFault('duplicate-enact'); return { ok: false, reason: 'duplicate-enact', decisionId: decId }; }",
    why: 'operations.enact: same decisionId already enacted. Needs 2nd enact with same decisionId.'
  },
  'not-approved': {
    anchor: "if (dec.status !== 'approved') { noteFault('not-approved'); return { ok: false, reason: 'not-approved', status: dec.status }; }",
    why: 'operations.enact: decision not in approved state. Needs pending/rejected decision.'
  },
  // v2.173.0（TX4b 修复）：not-authorized 从死表移除——inst.decide 路径有真见证（L3062），
  //   不再是结构不可达。同一个 reason 码同时出现在 operations.enact（anchor 指向此处）
  //   和 inst.decide（见证 trip 跑出）两条路径上——后者可达，故整个码不是 dead。
  'projects-full': {
    anchor: "if (projects().length >= cfg.maxProjects) { noteFault('projects-full'); return { ok: false, reason: 'projects-full', cap: cfg.maxProjects }; }",
    why: 'operations.enact: max projects reached. Needs 32+ existing projects.'
  },
  'over-budget': {
    anchor: "if (rec.spent + amount > rec.budget) { noteFault('over-budget'); return { ok: false, reason: 'over-budget', spent: rec.spent, budget: rec.budget, requested: amount }; }",
    why: 'operations.disburse: spending exceeds budget. Needs disburse amount over remaining budget.'
  },
  'duplicate-settle': {
    anchor: "if (rec.cycleTag === cycleTag) { noteFault('duplicate-settle'); return { ok: false, reason: 'duplicate-settle', cycleTag: cycleTag }; }",
    why: 'operations.settle: same cycleTag already settled. Needs 2nd settle with same cycleTag.'
  },
  'not-owner': {
    anchor: "if (rec.owner !== from) { noteFault('not-owner'); return { ok: false, reason: 'not-owner', current: rec.owner, attempted: from }; }",
    why: 'operations.handover: caller is not current owner. Needs wrong fromPerson.'
  },
  'insufficient-budget': {
    anchor: "if (_factionExists && !WA.org.canAfford('faction', orgId, budgetType, budget)) { noteFault('insufficient-budget'); return { ok: false, reason: 'insufficient-budget', need: budget, type: budgetType }; }",
    why: 'operations.enact: org has insufficient resources for budget. Needs faction with low gold.'
  },
  'insufficient-funds': {
    anchor: "if (!WA.org.canAfford('faction', rec.orgId, itemType, amount)) { noteFault('insufficient-funds'); return { ok: false, reason: 'insufficient-funds', type: itemType, need: amount }; }",
    why: 'operations.disburse: org cannot afford disbursement. Needs faction with insufficient resources.'
  },
  'transfer-failed': {
    anchor: "if (!tr || !tr.ok) { noteFault('transfer-failed'); return { ok: false, reason: 'transfer-failed', detail: tr ? tr.reason : 'none' }; }",
    why: 'operations.disburse: org.transfer failed. Needs transfer to fail.'
  }
};

/**
 * 见证驱动。返回 { expect, seen, missing, unexpected }。
 *   missing：触发路径存在却跑不出该码（行为被改，防静默）；
 *   unexpected：见证中冒出来的、不在预期集合里的码（防再命名）。
 */
function runWitness(WA) {
  const LS = global.localStorage;
  const K = WA.kaleidoscope, Rg = WA.registry, I = WA.intel, Lf = WA.life,
        C = WA.causal, O = WA.org, Wd = WA.world, Wt = WA.weather;
  const Ev = WA.events;
  const seen = {};
  const expect = {};
  function want(code, desc) { expect[code] = desc; }
  function trip(code, fn) {
    try {
      const g = fn(); const arr = Array.isArray(g) ? g : [g];
      if (arr.indexOf(code) >= 0) { seen[code] = true; return true; }
      return false;
    } catch (e) { return false; }
  }
  /**
   * 深层见证：顶层读不到、但**被如实构造出来**的码。
   *   v2.117.0 有三条是这种：`opportunity.respond` 把行动侧的 `action-throw` / `no-action`
   *   包进 `actReason`，`recipe.apply` 把 `theme-throw` 包进 `themeReason` —— 它们都在
   *   返回体里，可顶层只有「外层的那个码」。不认它们，就等于把「归因被记下了」判成没发生。
   *   只把**目标码**记进 seen：`unexpected`（冒出来的新码）检测不受影响。
   */
  function tripDeep(code, fn) {
    try {
      const g = fn();
      let s = '';
      try { s = JSON.stringify(g); } catch (e2) { s = String(g); }
      if (String(s).indexOf(code) >= 0) { seen[code] = true; return true; }
      return false;
    } catch (e) { return false; }
  }
  if (WA.store && WA.store.init) WA.store.init();
  WA.store.transact(function (d) {
    d.__zz = { n: 7, t: 'txt' };
    d.currents = [];
    d.evolution = d.evolution || {}; d.evolution.events = [{ id: 'E1' }];
    d.people = {
      '阿明': { id: 'p_阿明', name: '阿明', knowledge: {}, resources: { 粮: 10 } },
      '阿乙': { id: 'p_阿乙', name: '阿乙', knowledge: {}, resources: {} }
    };
  }, 'reject-witness:seed');

  // ── core/input-guard.js（v2.84.0：统一输入边界）──
  //   这三个码是**新增**的，故必须带可执行见证（否则门禁报「未分类」）。
  //   见证走产品真 API，且每条都用**同一入口的不同坏输入**触发不同归因——
  //   这正是本模块存在的意义：把「参数传错」与「合法但空」区分开，
  //   而不是像那 28 份自备兜底一样把它们一起塌成 'NaN' / '[object Object]' / 抛出。
  {
    const Ig = WA.inputGuard;
    if (Ig && typeof Ig.check === 'function') {
      want('non-finite', '输入边界：NaN/±Infinity 不得被升格成字面量（v2.84.0 新增）');
      trip('non-finite', function () { return [Ig.check(NaN).reason, Ig.check(Infinity).reason]; });
      want('blank', '输入边界：纯空白串不是有效文本（v2.84.0 新增）');
      trip('blank', function () { return [Ig.check('   ').reason, Ig.check('').reason]; });
      want('not-a-string', '输入边界：对象/数组/函数不得被隐式字符串化（v2.84.0 新增）');
      trip('not-a-string', function () { return [Ig.check({}).reason, Ig.check([]).reason, Ig.check(function () {}).reason]; });
    }
  }

  // ── engines/kaleidoscope.js ──
  function kinv(rec) { K.clearDerives(); K.setDerive(rec); const ev = K.evaluate();
    return ev.invalid.map(function (x) { return x.reason; })
      .concat(ev.missing.map(function (x) { return x.reason; })); }
  function kwhen(when) { K.clearRules(); K.setRule({ id: 'rw', when: when, text: 't' });
    return K.evaluate().skipped.map(function (x) { return String(x.reason).split('：')[0]; }); }
  want('bad-id', 'setDerive/setRule 传含空格的 id');
  trip('bad-id', function () { return [K.setDerive({ id: 'a b', op: 'range', path: '__zz.n', args: { min: 0, max: 1 } }).reason]; });
  trip('bad-id', function () { return [K.setRule({ id: 'a b', text: 'x' }).reason]; });
  want('bad-op', 'setDerive 传未知算子');
  trip('bad-op', function () { return [K.setDerive({ id: 'a', op: 'nope' }).reason]; });
  want('bad-path', 'setDerive 传空白 path（resolvePath 首筛，内部可达）');
  trip('bad-path', function () { return [K.setDerive({ id: 'a', op: 'range', path: '  ', args: { min: 0, max: 1 } }).reason]; });
  want('bad-segments', 'map 缺 segments / segments 里 max 非数');
  trip('bad-segments', function () { return kinv({ id: 'a', op: 'map', path: '__zz.n', args: {} }); });
  want('bad-range', 'range 缺 min/max 或 max<=min');
  trip('bad-range', function () { return kinv({ id: 'a', op: 'range', path: '__zz.n', args: { min: 5, max: 1 } }); });
  want('bad-number', 'formula 写 1.2.3');
  trip('bad-number', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '1.2.3' } }); });
  want('bad-ref', 'formula 写 $+1（$ 后无名字）');
  trip('bad-ref', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '$+1' } }); });
  want('bad-char', 'formula 写不认识的单字符');
  trip('bad-char', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '@@' } }); });
  want('bad-word', 'formula 写裸单词');
  trip('bad-word', function () { return kinv({ id: 'a', op: 'formula', args: { expr: 'true' } }); });
  want('div-zero', 'formula 除以 0');
  trip('div-zero', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '5/0' } }); });
  want('expr-too-long', 'formula 表达式超过长度闸');
  trip('expr-too-long', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '1+'.repeat(200) + '1' } }); });
  want('unexpected-end', 'formula 尾部缺操作数');
  trip('unexpected-end', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '1+' } }); });
  want('not-a-number', '非数值参与算术 / map 输入非数');
  trip('not-a-number', function () { return kinv({ id: 'a', op: 'map', path: '__zz.t', args: { segments: [{ max: 1, label: 'L' }] } }); });
  want('unbalanced-paren', 'formula 括号不配对');
  trip('unbalanced-paren', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '(1+2' } }); });
  want('unexpected-token', 'formula 位置不对的符号');
  trip('unexpected-token', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '(>1)' } }); });
  want('trailing-token', 'formula 尾部多余');
  trip('trailing-token', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '1+2 3' } }); });
  want('unknown-derive', 'formula 引用不存在的派生量');
  trip('unknown-derive', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '$nope+1' } }); });
  want('cycle', '两个派生量互相引用');
  trip('cycle', function () { K.clearDerives(); K.setDerive({ id: 'a', op: 'formula', args: { expr: '$b+1' } });
    K.setDerive({ id: 'b', op: 'formula', args: { expr: '$a+1' } });
    return K.evaluate().invalid.map(function (x) { return x.reason; }); });
  want('overflow', 'formula 结果溢出（本版修复后新可达）');
  trip('overflow', function () { return kinv({ id: 'a', op: 'formula', args: { expr: '9'.repeat(190) + ' * ' + '9'.repeat(190) } }); });
  want('too-many', '派生量 / 规则超过上限');
  trip('too-many', function () { K.clearDerives();
    for (let i = 0; i < 45; i++) K.setDerive({ id: 'd' + i, op: 'range', path: '__zz.n', args: { min: 0, max: 1 } });
    return [K.setDerive({ id: 'dx', op: 'range', path: '__zz.n', args: { min: 0, max: 1 } }).reason]; });
  trip('too-many', function () { K.clearRules();
    for (let i = 0; i < 45; i++) K.setRule({ id: 'r' + i, text: 't' });
    return [K.setRule({ id: 'rx', text: 't' }).reason]; });
  want('threw', 'setDerive 内部抛出');
  trip('threw', function () { return [K.setDerive({ get id() { throw new Error('boom'); } }).reason]; });
  want('missing', 'path 指向不存在的键');
  trip('missing', function () { return kinv({ id: 'a', op: 'range', path: 'no.such.key', args: { min: 0, max: 1 } }); });
  want('missing-operator', 'when 写 $n1（比较式缺比较符）');
  K.clearDerives(); K.setDerive({ id: 'n1', op: 'range', path: '__zz.n', args: { min: 0, max: 100 } });
  trip('missing-operator', function () { return kwhen('$n1'); });
  K.clearDerives(); K.clearRules();

  // ── actors/registry.js ──
  want('missing-name', 'registry 各入口空名');
  trip('missing-name', function () { return [Rg.setProfileSafe('', { personality: ['a'] }).reason]; });
  trip('missing-name', function () { return [Rg.setPersonaDice('', {}).reason]; });
  trip('missing-name', function () { return [Rg.idClear('').reason]; });
  want('not-object', 'setProfileSafe/setPersonaDice 传非对象');
  trip('not-object', function () { return [Rg.setProfileSafe('n', 's').reason]; });
  trip('not-object', function () { return [Rg.setPersonaDice('n', 5).reason]; });
  want('bad-shape', 'setProfileSafe 传非法形态节');
  trip('bad-shape', function () { const r = Rg.setProfileSafe('n', { personality: 123 });
    return (r.rejected || []).map(function (x) { return x.reason; }); });
  want('no-sections', 'setProfileSafe 传空节（无任何变更）');
  trip('no-sections', function () { return [Rg.setProfileSafe('n', {}).reason]; });
  want('bad-slot', 'setPersonaDice 指定不存在的槽位');
  trip('bad-slot', function () { return [Rg.setPersonaDice('n2', { d1: 1, d2: 2, d3: 3, d4: 4, d5: 5 }, { slot: 'ZZ' }).reason]; });
  want('incomplete-dice', 'setPersonaDice 骰面不完整');
  trip('incomplete-dice', function () { return [Rg.setPersonaDice('n2', { d1: 1 }).reason]; });
  want('not-bound', 'idClear 清未登记 id');
  trip('not-bound', function () { return [Rg.idClear('nobody-at-all').reason]; });

  // ── engines/intel.js ──
  want('missing-fields', 'intel 必填字段缺失');
  trip('missing-fields', function () { return [I.addIntel('', {}).reason]; });
  want('self-cause', 'addLink cause === effect');
  trip('self-cause', function () { return [I.addLink({ cause: 'X1', effect: 'X1' }).reason]; });
  want('unknown-subject', 'addIntel 传未知 about 主体');
  trip('unknown-subject', function () { return [I.addIntel('阿明', { claim: 'c', source: 's', level: I.LEVELS[0], about: '未登记主体' }).reason]; });
  want('missing-route', 'addIntel 只给了路程一端');
  trip('missing-route', function () { return [I.addIntel('阿明', { claim: 'c', source: 's', level: I.LEVELS[0], from: 'A' }).reason]; });
  want('unknown-cause', 'addLink 传不存在的因');
  trip('unknown-cause', function () { return [I.addLink({ cause: '不存在的因', effect: 'E9' }).reason]; });
  want('missing-effect', 'explain 查无此后果');
  trip('missing-effect', function () { return [I.explain('不存在的后果').reason]; });
  want('unexplained', 'explain 后果存在但无可用原因');
  trip('unexplained', function () { WA.store.transact(function (d) { d.currents = [{ id: 'Z2', title: 'Z2', causes: [] }]; }, 'reject-witness:z2');
    return [I.explain('Z2').reason]; });

  // ── engines/life.js ──
  want('missing-person', 'life 各入口空人名');
  trip('missing-person', function () { return [Lf.addGoal('', { text: 'x' }).reason]; });
  want('missing-text', 'addGoal 空目标文本');
  trip('missing-text', function () { return [Lf.addGoal('__W_人间', {}).reason]; });
  want('bad-kind', 'addCommitment 传非法承诺类型');
  trip('bad-kind', function () { return [Lf.addCommitment('__W_人间', { target: 't', text: 'x', kind: 'nope' }).reason]; });
  want('bad-time', 'addSchedule end<=start');
  trip('bad-time', function () { return [Lf.addSchedule('__W_人间', { activity: 'a', start: 10, end: 5 }).reason]; });
  want('time-conflict', 'addSchedule 与已有活动重叠');
  trip('time-conflict', function () {
    Lf.addSchedule('__W_人间', { activity: '巡逻', start: 0, end: 100 });
    return [Lf.addSchedule('__W_人间', { activity: '巡逻2', start: 50, end: 150 }).reason]; });
  // v2.132.0（O19）：跨会话轮转游标的落盘失败出口 —— 新增码，故必须带可执行见证。
  //   为什么它是**现网会发生的局面**（而非死表）：配额写满 / 隐私模式下的 setItem 抛错
  //   是本仓已有先例（auditLog 的 flush-failed 走的就是这条）。
  //   打桩方式与 auditLog 段同规格：临时替换 `WA.mainWin`（`win()` 与 settingsBus 的真源
  //   都是 `(WA.mainWin || window).localStorage`），跑完**无条件还原** —— 宿主态跨 section 共享。
  //   要点：这盏桩必须**同时**让 `getItem` 读出 `crossSession:true`（否则 `turnCfg()` 为假，
  //   首行就以 disabled 返回、跑不到写分支），并让 `setItem` 抛错 —— 一个桩管住两个条件。
  want('write-failed', 'life.tick：游标落盘时 setItem 抛错 ⇒ 吞成 write-failed 并如实进返回值'
    + '（不假装落盘成功，也不让异常穿出去把调用方搞挂；v2.132.0 O19）');
  trip('write-failed', function () {
    const keepWin = WA.mainWin;
    WA.mainWin = { localStorage: {
      getItem: function (k) { return k === 'worldaxis_life_settings_v1'
        ? JSON.stringify({ enabled: true, crossSession: true }) : null; },
      setItem: function () { throw new Error('witness quota exceeded'); },
      removeItem: function () {}, key: function () { return null; }, length: 0
    } };
    try { return [Lf.tick({ now: 30 }).turn.reason]; }
    finally { WA.mainWin = keepWin; }
  });

  // ── engines/causal.js ──
  want('missing-fields', 'causal 必填字段缺失');
  trip('missing-fields', function () { return [C.settle('', '').reason]; });
  want('missing-chain', 'causal 查无此链');
  trip('missing-chain', function () { return [C.settle('无此链', 'x').reason]; });
  want('bad-args', 'defer 传 0 或非数');
  trip('bad-args', function () { return [C.defer('无此链', 0).reason]; });
  // v2.84.0（B5）：`not-acted` **不进见证表**，这是门禁自己的词法契约决定的，不是省事：
  //   本门禁只认**内联字面量** `reason: 'x'`（见 tests/reject-code-gate.js 的 CODE_RE 注释：
  //   拼接写法 `reason: 'already-' + st` 代码不定，故不归一，其稳定性由**各引擎专锁**负责）。
  //   而 `not-acted` 是 `settleBlockReason()` 的返回值，经变量进 `reason: block` —— 属拼接码。
  //   实测（v2.84.0 全量 r6）：把它放进 want() 之后，扫描面 282 里根本没有这个码，
  //   于是 `witnessed(69) + dead(3) + base(211) = 283 > total 282`，划分立刻胀出 1 项。
  //   ——「台账里的码必须真在现场」这条纪律是对的：账本不能比现实胖。
  //   它的**可达性证明**因此落在引擎专锁上（两处，都要跑）：
  //     · tests/causal-v2620.js [15]：还没发生不得结算，且行动发生后同项必须放开；
  //     · tests/reject-lock-v2780.js 的 probeNotActed：走真 API 建链 → tick(条件未足) → settle 被拒。

  // ── engines/org.js ──
  if (O && O.setSettings) O.setSettings({ enabled: true });
  want('bad-resource', 'grant/transfer 空资源名或非正数量');
  trip('bad-resource', function () { return [O.grant('person', '阿明', '', 1).reason]; });
  want('missing-holder', 'grant 持有方不存在');
  trip('missing-holder', function () { return [O.grant('person', '查无此人', '粮', 1).reason]; });
  want('insufficient', 'transfer 资源不足（须两个不同持有方）');
  trip('insufficient', function () { return [O.transfer('person', '阿明', 'person', '阿乙', '粮', 999).reason]; });

  // ── engines/world.js / weather.js ──
  want('no-journey', 'where() 某人无任何行程记录');
  trip('no-journey', function () { return [Wd.where('从未出发的人').reason]; });
  want('no-clock', 'weather.season 在无世界钟时');
  trip('no-clock', function () {
    let keep; WA.store.transact(function (d) { keep = d.clock.dayIndex; delete d.clock.dayIndex; }, 'reject-witness:noclock');
    const r = Wt.season();
    WA.store.transact(function (d) { d.clock.dayIndex = keep; }, 'reject-witness:clockback');
    return [r.reason]; });
  want('world-missing', 'travelOf 在 world 未装载时');
  trip('world-missing', function () { const keep = WA.world; WA.world = null;
    let r = null; try { r = I.addIntel('阿明', { claim: 'c', source: 's', level: I.LEVELS[0], from: 'A', to: 'B' }); } catch (e) { r = null; }
    WA.world = keep; return r ? [r.reason] : []; });

  // ── v2.78.0 本版新可达/新具名的两个码 ──
  //   bad-delta：gauge.step 此前把「delta 不是数」并进 missing-fields，且 typeof NaN === 'number'
  //     恒真使 NaN 直接落盘并进注入段。本版拆出独立码：两个根因在诊断面可分。
  //   bad-weight：rivalry.declare 此前对非数 weight 静默降级 50 ⇒ bad-weight 只在 0..100 外可达
  //     （半个不可达）。本版先判有限数再判域，该码对非数输入同样可达。
  want('bad-delta', 'gauge.step 传 NaN / ±Infinity（本版从 missing-fields 里拆出的独立根因）');
  trip('bad-delta', function () { const G = WA.gauge; const keep = G.getSettings(); G.setSettings({ enabled: true });
    G.create('__wd'); const r = G.step('__wd', NaN, 'ev'); G.setSettings(keep);
    return [r.reason]; });
  want('bad-weight', 'rivalry.declare 传非数 / 非有限 weight（本版从静默降级改为如实拒收）');
  trip('bad-weight', function () { const R2 = WA.rivalry; const keep = R2.getSettings(); R2.setSettings({ enabled: true });
    const r = R2.declare('w甲', 'w乙', 'w丙', NaN); R2.setSettings(keep);
    return [r.reason]; });
  // ── engines/events.js（v2.81.0 第十五面：排期 ≠ 触发）──
  //   为什么必须补这 6 条：它们随 v2.81.0 新引入，此前既无见证也不在基线台账里，
  //   门禁会如实报「未分类」。按第十二面口径，正解不是把码删掉而是把它真跑出来。
  //   每条见证都走**产品真 API**，且刻意经过 schedule() 的写闸（先 enabled=true），
  //   不是绕过闸门直造状态——见证的意义正是「这条拒收路径真的在现网可达」。
  //   EF 在每条之后复位事件容器：见证之间共享同一个 WA，不复位会让
  //   「同 id 仍在活动态 ⇒ duplicate」之类的串扰变成假见证（v2.81.0 专锁踩过同款坑）。
  function EF() { if (!WA.store || !WA.store.transact) return;
    WA.store.transact(function (d) { d.events = { rows: [], failQueue: [], res: [] }; }, 'reject-witness:events-reset'); }
  function ES() { const keep = (Ev && Ev.getSettings) ? Ev.getSettings() : null;
    if (Ev && Ev.setSettings) Ev.setSettings({ enabled: true }); return keep; }
  function EK(keep) { if (Ev && Ev.setSettings && keep) Ev.setSettings(keep); EF(); }
  want('bad-priority', 'events.schedule 传越界优先级 99（合法域 0..9）');
  trip('bad-priority', function () { const keep = ES();
    try { return [Ev.schedule({ id: 'z1', title: 't', priority: 99 }).reason]; } finally { EK(keep); } });
  want('bad-trigger', 'events.schedule 排期参数不成形（repeat 缺正 intervalMs / delayed 缺 at|inMs / conditional 缺 condition）');
  trip('bad-trigger', function () { const keep = ES();
    try { return [
      Ev.schedule({ id: 'z2', title: 't', kind: 'repeat' }).reason,
      Ev.schedule({ id: 'z3', title: 't', kind: 'delayed' }).reason,
      Ev.schedule({ id: 'z4', title: 't', kind: 'conditional' }).reason]; } finally { EK(keep); } });
  want('condition-unmet', 'events.claim 时不传 metConditions（世界条件未足 ⇒ 状态零变化）');
  trip('condition-unmet', function () { const keep = ES();
    try { Ev.schedule({ id: 'z5', title: 't', kind: 'conditional', condition: '城门开' });
      return Ev.claim().blocked.map(function (b) { return b.reason; }); } finally { EK(keep); } });
  want('duplicate', 'events.schedule 同 id 且仍在活动态（不静默覆盖既有排期）');
  trip('duplicate', function () { const keep = ES();
    try { Ev.schedule({ id: 'z6', title: 't' });
      return [Ev.schedule({ id: 'z6', title: 't' }).reason]; } finally { EK(keep); } });
  want('not-active', 'events.cancel/replace 打在终态行上（已结束的排期不可再动）');
  trip('not-active', function () { const keep = ES();
    try { Ev.schedule({ id: 'z7', title: 't' }); Ev.cancel('z7', '见证');
      return [Ev.cancel('z7', 'again').reason, Ev.replace('z7', {}).reason]; } finally { EK(keep); } });
  want('not-claimed', 'events.complete 对未认领的行回报（没认领不许宣称做完）');
  trip('not-claimed', function () { const keep = ES();
    try { Ev.schedule({ id: 'z8', title: 't' });
      return [Ev.complete('z8', { ok: true }).reason]; } finally { EK(keep); } });
  // ── v2.116.0（规划 01 的 A2 第二段）新增两码 ──
  want('budget', 'events.claim 本轮预算用尽 ⇒ 超额者进 deferred（显式留痕，不是静默跳过）');
  trip('budget', function () { const keep = ES();
    try { const cfg = Ev.getSettings(); Ev.setSettings({ maxClaims: 1 });
      Ev.schedule({ id: 'z9a', title: 't' }); Ev.schedule({ id: 'z9b', title: 't' });
      const out = Ev.claim(Date.now() + 1000, {});
      Ev.setSettings(cfg);
      return (out.deferred || []).map(function (x) { return x.reason; }); } finally { EK(keep); } });
  want('duplicate-receipt', 'events.complete 同一 opId 二次回报（重放不二次结算）');
  trip('duplicate-receipt', function () { const keep = ES();
    try { Ev.schedule({ id: 'z10', title: 't' }); Ev.claim(Date.now() + 1000, {});
      Ev.complete('z10', { ok: true });
      return [Ev.complete('z10', { ok: true }).reason]; } finally { EK(keep); } });
  // ── engines/checkpoints.js（v2.82.0 第十六面：快照与分支）──
  //   这 11 个码全部**可达**，故逐条补真见证（不是声称可达）。
  const Cp = WA.checkpoints;
  function cpReset(patch) {
    LS.clear(); try { WA.store.init(); } catch (e) {}
    Cp.setSettings(Object.assign({ enabled: true, maxSlots: 6, autoEvery: 0, autoSlots: 2 }, patch || {}));
  }
  want('bad-scope', 'checkpoints.resolveScope 传不在白名单里的范围');
  trip('bad-scope', function () { cpReset(); return [Cp.resolveScope('nope', []).reason]; });
  want('missing-keys', 'checkpoints 取 module/scene 范围却不给键');
  trip('missing-keys', function () { cpReset(); return [Cp.resolveScope('module', []).reason]; });
  want('unknown-keys', 'checkpoints 点名了骨架里没有的顶层键');
  trip('unknown-keys', function () { cpReset(); return [Cp.resolveScope('scene', ['__nope__']).reason]; });
  want('guarded-key', 'checkpoints 显式点名守卫键（schemaVersion）存快照');
  trip('guarded-key', function () { cpReset(); return [Cp.resolveScope('module', ['schemaVersion']).reason]; });
  want('lib-unreadable', '快照库读不出时 save/read 一律拒收（绝不覆盖写）');
  trip('lib-unreadable', function () {
    cpReset(); Cp.save('甲', { scope: 'global' });
    LS.setItem(Cp.stat().key, '{broken');
    return [Cp.save('乙', { scope: 'global' }).reason, Cp.read('c1').reason];
  });
  want('bad-format', '信封格式号非有限值 / 不是 JSON / 没有 worldaxisCheckpoint 标记');
  trip('bad-format', function () {
    cpReset();
    return [Cp.migrate({ worldaxisCheckpoint: 'x' }).reason,
      Cp.importOne('{not json').reason, Cp.importOne({ nope: 1 }).reason];
  });
  want('too-new', '信封格式号高于本引擎支持的 FORMAT');
  trip('too-new', function () { cpReset(); return [Cp.migrate({ worldaxisCheckpoint: 99 }).reason]; });
  want('no-migration', '信封版本更旧但没有登记对应迁移步骤（不猜）');
  trip('no-migration', function () { cpReset(); return [Cp.migrate({ worldaxisCheckpoint: 0 }).reason]; });
  want('checksum-mismatch', '信封校验和与正文对不上（搬运途中被改写）');
  trip('checksum-mismatch', function () {
    cpReset();
    const a = Cp.save('甲', { scope: 'global' });
    const ex = Cp.exportOne(a.id);
    const tampered = JSON.parse(ex.text);
    tampered.checksum = 'kdeadbeef';
    return [Cp.importOne(tampered).reason];
  });
  want('not-due', '自动快照开了但这一轮还没轮到（与 disabled 各自成词）');
  trip('not-due', function () {
    cpReset({ autoEvery: 3 });
    return [Cp.tick().reason];
  });
  // ── v2.85.0（B2 地域与交通 + B1 人物生活）六个新码 ──
  //   场景**必须记忆化**：这批探针会登记地点（甲/乙/丙）与人物（独1/独2），
  //   重复跑第二次时「甲已登记」「独1 已有承诺」都会改变结论——首跑才对得上，二跑就成了另一个场景。
  //   （实测：不记忆化时 trip 里第二次跑 parent-locked 会拿到 admitted，因为归属已被第一次补全。）
  let MEMO2850 = null;
  function codes2850() {
    if (MEMO2850) return MEMO2850;
    const out = {};
    const T = '__w2850_';
    // 世界织体面：层级（归属）/ 通行量（走得动）
    Wd.setSettings({ enabled: true });
    out['unknown-parent'] = Wd.addPlace({ name: T + '丁', parent: T + '不存在' }).reason;
    out['self-parent'] = Wd.addPlace({ name: T + '戊', parent: T + '戊' }).reason;
    Wd.addPlace({ name: T + '甲' });
    Wd.addPlace({ name: T + '乙', parent: T + '甲' });
    out['parent-cycle'] = Wd.addPlace({ name: T + '甲', parent: T + '乙' }).reason;
    Wd.addPlace({ name: T + '丙', parent: T + '甲' });
    out['parent-locked'] = Wd.addPlace({ name: T + '丙', parent: T + '乙' }).reason;
    Wd.addRoad(T + '甲', T + '乙', 10, 1);
    Wd.depart(T + '行甲', T + '甲', T + '乙', 0);
    out['road-crowded'] = Wd.depart(T + '行乙', T + '甲', T + '乙', 0).reason;
    // 人物生活面：单向宣布的合作 ≠ 已建立的协作
    Lf.setSettings({ enabled: true, maxPeople: 4 });
    Lf.addCommitment(T + '独1', { kind: 'cooperation', target: T + '独2', text: '合办义仓' });
    Lf.tick({ now: 20 });
    const p = (WA.store.get() || {}).people['p_' + T + '独1'];
    const d = p && p.life && p.life.lastDecision;
    out['unreciprocated'] = d ? d.reason : '';
    MEMO2850 = out;
    return out;
  }
  want('unknown-parent', '登记的父级必须已登记（v2.85.0 B2：不猜「大概同城」）');
  trip('unknown-parent', function () { return [codes2850()['unknown-parent']]; });
  want('self-parent', '地点不得以自己为父级（v2.85.0 B2）');
  trip('self-parent', function () { return [codes2850()['self-parent']]; });
  want('parent-cycle', '补全归属会让父子互相归属 ⇒ 拒收（v2.85.0 B2）');
  trip('parent-cycle', function () { return [codes2850()['parent-cycle']]; });
  want('parent-locked', '已有归属不得被冲突改写（v2.85.0 B2：无→有是补全、x→y 才是改写）');
  trip('parent-locked', function () { return [codes2850()['parent-locked']]; });
  want('road-crowded', '路段容量满 ⇒ 拒收且不落盘（v2.85.0 B2：走得通 ≠ 现在走得动）');
  trip('road-crowded', function () { return [codes2850()['road-crowded']]; });
  want('unreciprocated', '单向宣布的合作不得被当作已建立的协作（v2.85.0 B1）');
  trip('unreciprocated', function () { return [codes2850()['unreciprocated']]; });
  // v2.87.0：B6/B7 暴露的码——一律用产品真 API 跑出来，不靠声称。
  //   unknown-action：previewIntervention 的 action 不在 advance/cancel/settle 内时的出口。
  //   注意行校验在动作分发**之前**：得先有一条真链，否则先撞 missing-chain。
  want('unknown-action', '干预预览的未知动作被显式拒收（v2.87.0 B6，不静默当作 advance）');
  trip('unknown-action', function () {
    // 先让前因真实存在（addChain 只认已存在的世界事实，否则未知前因先拦）
    WA.store.transact(function (d) {
      d.worldFacts = [{ id: 'wf_v2870', key: '下雨', value: '是' }];
      d.causal = { chains: [], settled: [] };
    }, 'reject-witness:v2870-seed');
    const chain = C.addChain({ cause: '下雨', action: '带伞' });
    return [C.previewIntervention(chain.id, 'nope').reason];
  });
  //   unknown-theme：theme.apply 对未登记题材**拒收且不改状态**
  //     （v2.87.0 B7；承诺面是「未知题材不静默当空集」，故必须真跑 apply 而不是只问 known）。
  want('unknown-theme', '未知题材拒收且不改设置（v2.87.0 B7：不静默当空集）');
  trip('unknown-theme', function () { return [WA.theme.apply(['no-such-theme']).reason]; });
  // v2.147.0（W1）：因果追溯图谱暴露的码。traceGraph 对「查无此事实」如实拒答——
  //   空输入（missing-fields）与查无此事实（no-trace）是两个不同的码：前者连根都没给，
  //   后者给了根但世界里没有它。见证真跑启用态引擎（与 unknown-action 同法先置种子面）。
  want('no-trace', 'traceGraph 查无此事实如实拒答（v2.147.0 W1）');
  trip('no-trace', function () {
    C.setSettings({ enabled: true });
    return [C.traceGraph('reject-witness-v2147-no-such-fact').reason];
  });
  // v2.89.0 O2：磁带面（rand 六口 + causal 两口）暴露的码。
  //   这一段本身就是本版「取证不得靠声称」的同一把尺子用在自家新口上：
  //   12 个码逐个用真 API 跑出来，唯一跑不到的（end-failed）进死表并附可复算前提。
  const Rn = WA.rand;
  // ── v2.98.0 P2：磁带**导出**面暴露的码（本段必须落在**任何录制之前**，理由见下）──
  //   它与下面那一族（回放面）不同：那一族答「能不能拿这卷去重放」，这一条答
  //   「本侧现在有没有卷可以带出去」。两者都说「没有卷」，但一个说的是**入参不是卷**，
  //   另一个说的是**本侧根本没有卷**——混成一句，面板就只能用同一句话回答
  //   「你还没录过」与「你粘错东西了」两件完全不同的事。
  //
  //   为什么必须放在最前（本版实测踩到）：`endTape()` 会把收卷后的磁带留在 `__lastTape`，
  //   而那份留存是**只写不读不删**的（O2 立的口径：取证不得擦掉证据，`stopReplay` 也只
  //   丢走位索引用在卷）。于是一旦本进程里录过**任何**一卷，「本侧无卷」这个局面就再也
  //   不出现了——把这条见证写在录制之后，它跑出来的永远是别的码（首版正是如此：实际
  //   产出 bad-tape）。所以它的落点是「一个从没录过卷的会话」，也就是本段的位置。
  want('no-tape', 'tapeVol 在本侧无卷（无从调用的在卷、也没有留存卷）时如实拒答（v2.98.0 P2）');
  trip('no-tape', function () { return [Rn.tapeVol().reason]; });
  want('in-replay', '回放中拒绝开新卷（v2.89.0 O2：取证期间不得改被取证对象）');
  trip('in-replay', function () {
    Rn.seed(4242);
    // 先自纠一处写法：beginTape 返回的是**回执**（{ok, seed, mode}），磁带只能从
    //   endTape().tape 取。写成 `replay(beginTape(...).tape)` 会因入参 undefined 走 bad-tape，
    //   根本没进入回放态，于是这条见证看着「没跑出 in-replay」。
    Rn.beginTape(true);
    const e = Rn.endTape();
    const rr = Rn.replay(e.tape);
    const r = rr.ok ? Rn.beginTape(true) : { reason: 'replay-not-armed' };
    Rn.stopReplay();
    return [r.reason];
  });
  want('already-recording', '录制中拒绝再开一卷（防一卷覆盖一卷、前一卷静默丢失）');
  trip('already-recording', function () {
    Rn.beginTape(true);
    const r = Rn.beginTape(true);
    Rn.endTape();
    return [r.reason];
  });
  want('not-recording', '无在卷时收卷被如实拒收（不伪造一卷空磁带）');
  trip('not-recording', function () {
    Rn.stopReplay();
    const t = Rn.tape();
    if (t && t.open) Rn.endTape();
    return [Rn.endTape().reason];
  });
  want('bad-tape', 'replay 收到不是磁带的入参时如实拒收（不按空卷假装走一遍）');
  trip('bad-tape', function () { return [Rn.replay(null).reason, Rn.replay({}).reason]; });
  want('tape-open', '未收卷的磁带拒绝回放（它还在录，值不完整）');
  trip('tape-open', function () {
    Rn.beginTape(true);
    const t0 = Rn.tape();
    const r = Rn.replay({ seed: t0.seed, entries: [], open: true });
    Rn.endTape();
    return [r.reason];
  });
  want('recording', '录制中拒绝进入回放（否则这一次推进既录又放、两边都不是）');
  trip('recording', function () {
    Rn.beginTape(true);
    const r = Rn.replay({ seed: 1, entries: [], open: false });
    Rn.endTape();
    return [r.reason];
  });
  want('tape-without-values', '只记位置的磁带拒绝回放（无处取值就别假装能重放）');
  trip('tape-without-values', function () {
    return [Rn.replay({ seed: 1, entries: [{ c: 'x', k: 'd' }], noValues: true }).reason];
  });
  want('not-replaying', '未在回放时退出被如实拒收（不谎报「刚结束了一次回放」）');
  trip('not-replaying', function () {
    Rn.stopReplay();
    return [Rn.stopReplay().reason];
  });
  want('no-seed', '无种子的磁带如实拒收复核（不假装复核过）');
  trip('no-seed', function () { return [Rn.verifyTape({ seed: null, entries: [] }).reason]; });
  want('bad-seed', '非有限种子如实拒收复核（NaN/Infinity 不得被当成某个种子）');
  trip('bad-seed', function () { return [Rn.verifyTape({ seed: 'x', entries: [] }).reason]; });
  want('bad-fn', 'causal.record / replayWith 收到非函数时如实拒收');
  trip('bad-fn', function () {
    return [WA.causal.record(null).reason, WA.causal.replayWith({ seed: 1, entries: [] }, null).reason];
  });
  want('rand-absent', '随机源缺席时如实拒收（不静默降级成「录了一卷空的」）');
  trip('rand-absent', function () {
    const keep = WA.rand;
    try {
      WA.rand = undefined;
      return [WA.causal.record(function () { return 1; }).reason,
        WA.causal.replayWith({ seed: 1, entries: [] }, function () { return 1; }).reason];
    } finally { WA.rand = keep; }
  });
  // v2.90.0 O3：每轮执行解释（render.explain）暴露的两个码。
  //   与 O2 那一段同尺子——新出口的拒收必须**用真 API 跑出来**，不能只在源码里「存在」。
  //   两个码是同一入口的两种不同局面：「从没注入过」与「问的不是这一轮」，
  //   分列的意义正在于此（前者是空，后者是错坐标——不能混成一种「查不到」）。
  want('no-rotation', '未注入过时照实拒答（不编一份空解释当答案，v2.90.0 O3）');
  trip('no-rotation', function () {
    const store = WA.store;
    const keep = store.get().lastInjection;
    try {
      store.transact(function (d) { d.lastInjection = null; }, 'reject-witness:o3-clear');
      return [WA.render.explain().reason];
    } finally {
      store.transact(function (d) { d.lastInjection = keep; }, 'reject-witness:o3-restore');
    }
  });
  want('round-not-recorded', '轮次坐标不符时照实拒答（不拿上一轮的当这一轮，v2.90.0 O3）');
  trip('round-not-recorded', function () {
    const store = WA.store;
    const keep = store.get().lastInjection;
    try {
      store.transact(function (d) {
        d.lastInjection = Object.assign({}, keep || {}, { round: 3, decisions: [] });
      }, 'reject-witness:o3-round');
      return [WA.render.explain(99).reason];
    } finally {
      store.transact(function (d) { d.lastInjection = keep; }, 'reject-witness:o3-restore2');
    }
  });
  // ── v2.96.0（X3 传播与辟谣 / X6 判定面接天气）：八个新出口的拒收见证 ──
  //   同一把尺子：见证**不是声称**，用真 API 把码跑出来。
  //   X3 的四条「门」各自对应一句产品承诺，码就是承诺的可观测面：
  //     · unknown-fact  —— 没登记的事实不许有传播链（「没发生的事不该传」）；
  //     · chains-full   —— 容量满拒收不挤出（挤掉一条就等于改写了历史）；
  //     · hops-full     —— 中间跳丢了，「传到最后还是不是原来那条」就再也答不出；
  //     · suppressed-full —— 隐瞒与跳分列计数，各自有闸。
  //   X6 的两条是「不可用不回落成无影响」的三种形态里的两种：
  //     · link-off    —— 没给地点（不是「天气很好」，两者必须能分辨）；
  //     · bad-motive  —— 动机不在四值内，不按 honest 静默放过。
  //   （engine-absent 早已在 O2 段有见证：rand 缺席与 weather 缺席走的是同一条纪律。）
  {
    const Rm = WA.rumor, Hz = WA.hazard;
    if (Rm && typeof Rm.startChain === 'function') {
      const RK = '拒收见证事实';
      const keep = Rm.getSettings().enabled;
      try {
        Rm.setSettings({ enabled: true });
        WA.store.transact(function (d) {
          d.worldFacts = (Array.isArray(d.worldFacts) ? d.worldFacts : []).concat([{ key: RK, value: '三日未归', active: true }]);
        }, 'reject-witness:v2960-fact');
        // 故意不打桩：这些码全部在前置门里返回，没一条走到随机源。
        want('unknown-fact', 'rumor.startChain 点名一条没登记的事实 ⇒ 拒收（不凭空造一条链，v2.96.0 X3）');
        trip('unknown-fact', function () { return [Rm.startChain('查无此事').reason]; });
        want('bad-motive', 'rumor.relay 传四值以外的动机 ⇒ 拒收（不静默当 honest，v2.96.0 X3）');
        trip('bad-motive', function () { return [Rm.relay('rm_x', { from: '甲', to: '乙', motive: 'nope' }).reason]; });
        // 两条容量闸必须**先在链上堆到满**：空链上永远走不到满员那一支。
        want('chains-full', 'rumor.startChain 超出 maxChains ⇒ 拒收（满员拒收不挤出，v2.96.0 X3）');
        trip('chains-full', function () {
          const st = Rm.getSettings();
          const keepCap = st.maxChains;
          // 必须换一个**不同的事实**：同一事实再起一次会先撞 exists（一事实一链），
          //   那样测到的是「重复」而不是「满员」——两个码分列的意义正在于此。
          //   （本轮实测踩到：初版用同一 factKey，门序里 exists 在 chains-full 之前。）
          const RK2 = '拒收见证事实乙';
          try {
            WA.store.transact(function (d) {
              d.worldFacts = (Array.isArray(d.worldFacts) ? d.worldFacts : []).concat([{ key: RK2, value: '两日未归', active: true }]);
            }, 'reject-witness:v2960-fact2');
            Rm.setSettings({ maxChains: 1 });
            Rm.startChain(RK);
            return [Rm.startChain(RK2).reason];
          } finally { Rm.setSettings({ maxChains: keepCap }); }
        });
        want('hops-full', 'rumor.relay 超出 maxHops ⇒ 拒收（中间跳不许被挤掉，v2.96.0 X3）');
        trip('hops-full', function () {
          const st = Rm.getSettings();
          const keepHops = st.maxHops;
          try {
            Rm.setSettings({ maxHops: 1 });
            const id = 'rm_' + RK;
            Rm.relay(id, { from: '甲', to: '乙' });
            return [Rm.relay(id, { from: '乙', to: '丙' }).reason];
          } finally { Rm.setSettings({ maxHops: keepHops }); }
        });
        want('suppressed-full', 'rumor.conceal 超出 maxSuppressed ⇒ 拒收（隐瞒与跳分列计数，v2.96.0 X3）');
        trip('suppressed-full', function () {
          const st = Rm.getSettings();
          const keepSup = st.maxSuppressed;
          try {
            Rm.setSettings({ maxSuppressed: 1 });
            const id = 'rm_' + RK;
            Rm.conceal(id, { by: '甲' });
            return [Rm.conceal(id, { by: '乙' }).reason];
          } finally { Rm.setSettings({ maxSuppressed: keepSup }); }
        });
      } finally { Rm.setSettings({ enabled: keep }); }
    }
    if (Hz && typeof Hz.open === 'function' && Hz.roll) {
      const HK = '拒收见证风险', Wd = WA.world;
      const keep = WA.rand;
      try {
        Wd.addPlace('甲镇', '镇');
        WA.store.transact(function (d) {
          d.hazard = { rows: [{ key: HK, note: '', count: 0, hits: 0, pending: false, waiting: 0, at: '' }] };
        }, 'reject-witness:v2960-hazard');
        Rm && Rm.setSettings && Rm.setSettings({ enabled: true });
        // 打桩是为了**越过**前置门走到天气面：本段要见证的是天气归因（link-off），
        //   而不是随机源纪律（那一条在 O2 段已有见证，桩里也顺带把它钉住）。
        WA.rand = { dice: function (s, site) { if (site !== 'hazard') throw new Error('site 走了别的入口：' + site); return s; } };
        want('link-off', 'hazard.roll 显式给了空地点 ⇒ 天气面照实报 link-off（不给 at 时回执里连 weather 字段都没有，v2.96.0 X6）');
        trip('link-off', function () { return [((Hz.roll(HK, { at: '' }).weather) || {}).reason]; });
      } finally { WA.rand = keep; }
    }
    // ── v2.138.0（E7）：天气造灾害（X6 的反向）三个新出口的见证 ──
    //   同一把尺子：见证**不是声称**，用真 API 把码跑出来。
    //   三条各自对应一句产品承诺：
    //     · triggered     —— 天气真恶劣到阈值时**建一行账**（此前天气再坏也不会自己长账）；
    //     · already-open  —— 同地同天气**不堆行**（否则一次连阴雨会长出几十行同样的账）；
    //     · below-threshold —— 「天气没恶劣到」与「联动没打开」分得开（后者是 link-off）。
    //   三个码都可被外部输入触发（天气是宿主面写进来的），故写见证而非列死表。
    if (Hz && typeof Hz.weatherTrigger === 'function' && Wt && typeof Wt.setWeather === 'function') {
      const HP = '见证镇';
      const keepHW = { enabled: Hz.getSettings().enabled, weatherLink: Hz.getSettings().weatherLink };
      const keepWxE = Wt.getSettings().enabled;
      try {
        Wd.addPlace({ name: HP, kind: 'public' });
        Wt.setSettings({ enabled: true });
        Hz.setSettings({ enabled: true, weatherLink: true });
        Wt.setWeather(HP, 'storm');
        want('triggered', 'hazard.weatherTrigger 天气达阈值 ⇒ 自动建一行灾害账（X6 的反向，v2.138.0 E7）');
        trip('triggered', function () { return [Hz.weatherTrigger(HP).reason]; });
        // 第二次必须命中已有行：测的是「不堆行」，不是「再建一行」
        want('already-open', 'hazard.weatherTrigger 同地同天气**不堆行**（只累加触发计数，v2.138.0 E7）');
        trip('already-open', function () { return [Hz.weatherTrigger(HP).reason]; });
        Wt.setWeather(HP, 'clear');
        want('below-threshold', 'hazard.weatherTrigger 天气没恶劣到 ⇒ 不建账（与「联动没打开」的 link-off 分列，v2.138.0 E7）');
        trip('below-threshold', function () { return [Hz.weatherTrigger(HP).reason]; });
      } finally {
        Hz.setSettings({ enabled: keepHW.enabled, weatherLink: keepHW.weatherLink });
        Wt.setSettings({ enabled: keepWxE });
      }
    }
  }
  // ── v2.139.0（E9）：势力关系动态图三个新出口的见证 ──
  //   同一把尺子（见 E7 段）：见证**不是声称**，用真 API 把码跑出来。
  //   三条都不是「参数写错」，而各自对应「世界上真没有可算的东西」的**三种不同情形**：
  //     · no-factions  —— 一个势力都没有（没东西可算）；
  //     · empty-graph  —— 算出来了但零边（「算出来是空的」与「没东西可算」不是一回事）；
  //     · bad-faction  —— 自环或未知势力名（「自己跟自己」不是一条边）。
  //   三者都可由外部输入触发（势力是编辑器/导入写进世界的），故写见证而非列死表。
  //   收卷契约（本段实测踩到，与 X5 / O9 段同规格）：本段往**世界**写真势力行，
  //     写完不收回，后续锁在世界里就会多出一个势力。先留底，finally 无条件还原。
  if (WA.factionGraph && typeof WA.factionGraph.buildGraph === 'function') {
    const Fg = WA.factionGraph;
    const keepFg = Fg.getSettings();
    const keepFactions = WA.store.get().evolution ? (WA.store.get().evolution.factions || null) : null;
    try {
      WA.store.transact(function (d) { d.evolution = d.evolution || {}; d.evolution.factions = []; }, 'reject-witness:fg0');
      Fg.setSettings({ enabled: true });
      want('no-factions', 'factionGraph.buildGraph 世界无势力 ⇒ no-factions（v2.139.0 E9 新增）');
      trip('no-factions', function () { return [Fg.buildGraph().reason]; });
      WA.store.transact(function (d) {
        d.evolution = d.evolution || {};
        d.evolution.factions = [{ id: 'wg1', name: '见证势力', status: '稳固', relation: '中立', scope: '' }];
      }, 'reject-witness:fg1');
      want('empty-graph', 'factionGraph 只有一个势力 ⇒ empty-graph（算出来是空的，与 no-factions 分列，v2.139.0 E9 新增）');
      trip('empty-graph', function () { return [Fg.buildGraph().reason]; });
      want('bad-faction', 'factionGraph.edgeOf 自环 / 未知势力名 ⇒ bad-faction（v2.139.0 E9 新增）');
      trip('bad-faction', function () {
        return [Fg.edgeOf('见证势力', '见证势力').reason, Fg.edgeOf('见证势力', '查无此势力').reason];
      });
    } finally {
      Fg.setSettings(keepFg);
      WA.store.transact(function (d) { d.evolution = d.evolution || {}; d.evolution.factions = keepFactions; }, 'reject-witness:fg-restore');
    }
  }
  // ── v2.139.0（E10）：协作任务与违约四枚新码的见证 ──
  //   同一把尺子（见 E7 / E9 段）：见证**不是声称**，用真 API 把码跑出来。
  //   四枚各对应一句产品承诺，且都能被外部输入触发（人在不在名册、到没到截止、几个人）：
  //     · bad-task      —— 任务号坏 / 不存在（不是「参数写错」，是**查无此任务**）；
  //     · not-due       —— 还没到截止（「没到点」与「做没做」不是一件事）；
  //     · too-few       —— 参与人数不足 2（一个人的任务不是协作任务，它是日程）；
  //     · not-on-roster —— 罚没目标不在名册（org.penalize 的原话，转到任务面如实转述）。
  //   收卷契约（与 E9 段同规格）：本段往**世界**写势力 / 人名册 / 人手粮与任务表，
  //     写完不收回，后续锁在世界里就会多出这些行。先留底，finally 无条件还原。
  if (WA.collab && typeof WA.collab.createTask === 'function') {
    const Cb = WA.collab;
    const keepCb = Cb.getSettings();
    const keepCollab = WA.store.get().collab || null;
    const keepEvo = WA.store.get().evolution || null;
    const keepPeople = WA.store.get().people || null;
    try {
      // 造一个能建任务的最小世界：一个势力 + 名册里两个人 + 两人各有粮。
      WA.store.transact(function (d) {
        d.evolution = d.evolution || {};
        d.evolution.factions = [{ id: 'wc1', name: '见证村', status: '中立', relation: '中立',
          resources: { '粮': 100 }, roster: { '见证甲': { role: 'member' }, '见证乙': { role: 'member' } } }];
        d.people = d.people || {};
        d.people['p_见证甲'] = { name: '见证甲', resources: { '粮': 10 } };
        d.people['p_见证乙'] = { name: '见证乙', resources: { '粮': 10 } };
        d.collab = { seq: 0, sessions: [], claims: {}, queue: [], conflicts: [], tasks: [] };
      }, 'reject-witness:cb0');
      Cb.setSettings({ enabled: true });
      want('bad-task', 'collab.settle 任务号不存在 ⇒ bad-task（v2.139.0 E10 新增）');
      trip('bad-task', function () { return [Cb.settle('查无此任务').reason]; });
      const wTask = Cb.createTask([{ name: '见证甲', pledge: 1 }, { name: '见证乙', pledge: 1 }], '见证任务', Date.now() + 600000);
      want('not-due', 'collab.settle 未到截止 ⇒ not-due（v2.139.0 E10 新增）');
      trip('not-due', function () { return [Cb.settle(wTask.task).reason]; });
      want('too-few', 'collab.createTask 参与人数不足 2 ⇒ too-few（v2.139.0 E10 新增）');
      trip('too-few', function () { return [Cb.createTask(['见证甲'], '独干', Date.now() + 600000).reason]; });
      want('not-on-roster', 'collab.penalize 目标不在任务名册 ⇒ not-on-roster（v2.139.0 E10 新增）');
      trip('not-on-roster', function () { return [Cb.penalize(wTask.task, '查无此人', '粮', 1).reason]; });
    } finally {
      Cb.setSettings(keepCb);
      WA.store.transact(function (d) {
        d.collab = keepCollab;
        d.evolution = keepEvo;
        d.people = keepPeople;
      }, 'reject-witness:cb-restore');
    }
  }
  // ── v2.97.0（O9）别名表与追溯链：五个新码，各自一条真 API 见证 ──
  //   为何这些码值得有见证而不进死表：它们全都**可被外部输入触发**——
  //   旧存档里的环、外部导入的深链、面板上填错的旧名，三样都会走到这里。
  //   一个从未被观察过的码，下一次被改成别的意思也没人知道（本面存在的全部理由）。
  if (Rg && typeof Rg.bindAlias === 'function') {
    // 收卷契约（本段实测踩到）：本段往**设置面**写真实别名登记，而设置表住在 localStorage
    //   —— 写完不收回，同一进程里后续的锁读到的就不是自己的夹具（switch-matrix 的 [N1c]
    //   原版判据要求 aliasNames===1，实测读到 10，当场假失败）。
    //   与 X5 段同规格：先留底，finally 无条件还原。
    const keepAl = {};
    const alRegs = (WA.__settingsRegs || []).filter(function (r) {
      return r && (r.key === 'worldaxis_registry_alias_v1' || r.key === 'worldaxis_registry_ids_v1');
    });
    alRegs.forEach(function (r) {
      try { keepAl[r.key] = WA.settingsBus ? WA.settingsBus.read(r) : null; } catch (e) { keepAl[r.key] = null; }
    });
    try {
    want('not-bound', 'registry.bindAlias：规范名不在册（给不存在的人登记历史名 = 凭空造一个身份，v2.97.0 O9）');
    trip('not-bound', function () { return [Rg.bindAlias('谁也不是', { was: '老名' }).reason]; });
    want('alias-cycle', 'registry.bindAlias：自指登记（旧名就是现名 ⇒ 这条边没有意义，v2.97.0 O9）');
    trip('alias-cycle', function () {
      Rg.identityOf('甲');
      return [Rg.bindAlias('甲', { was: '甲' }).reason];
    });
    want('unknown-name', 'registry.aliasOf：对完全不在册的名字**不编**一个规范名（v2.97.0 O9）');
    trip('unknown-name', function () { return [Rg.aliasOf('查无此人').reason, Rg.traceOf('查无此人').reason]; });
    want('name-taken', 'registry.bindAlias：一个旧名只能有一个主人（两个主人 ⇒ 同一行解析出两种身份，v2.97.0 O9）');
    trip('name-taken', function () {
      Rg.identityOf('甲'); Rg.identityOf('乙');
      const a = Rg.bindAlias('乙', { was: '老李' });
      const b = Rg.bindAlias('甲', { was: '老李' });
      return [a.ok ? b.reason : a.reason];
    });
    want('too-deep', 'registry.bindAlias：链深超过 8 跳当场拒收（往表里放一条永远解析不出来的登记 = 在账上打个死结，v2.97.0 O9）');
    trip('too-deep', function () {
      // 造法：倒序登记 x1←x0, x2←x1 … x8←x7 ⇒ canonicalOf(x0) 恰 8 跳；
      //   再给 x0 挂一个旧名 ⇒ newDepth = 8 + 1 = 9 > 8 ⇒ too-deep。
      //   （顺序反了永远只有 1 跳：newDepth 取的是**规范名那一侧**的链长。）
      for (let i = 0; i <= 8; i++) Rg.identityOf('深' + i);
      for (let i = 0; i < 8; i++) Rg.bindAlias('深' + (i + 1), { was: '深' + i });
      return [Rg.bindAlias('深0', { was: '更早的名' }).reason];
    });
    } finally {
      // 无条件收回：两张表都要还原（只还原 alias 不还原 ids 会让「甲/乙/深0」留着）
      alRegs.forEach(function (r) {
        try { if (WA.settingsBus) WA.settingsBus.save(r, keepAl[r.key] || {}); } catch (e) {}
      });
    }
  }
  // ── v2.97.0（X5）跨插件因果桥（入站边）：五个新码 ──
  //   入站面收的是**外部插件**递来的东西，故这些码每一条都是「对方发错/发乱」的现实形态。
  if (WA.phoneBridge && typeof WA.phoneBridge.linkChain === 'function') {
    const Pb = WA.phoneBridge;
    const keepPb = Pb.getSettings();
    const keepCausal = WA.store.get().causal;
    try {
      Pb.setSettings({ enabled: true, linkCausal: true });
      const CID = 'c_reject_witness_v2970';
      const CID2 = 'c_reject_witness_v2970b';
      WA.store.transact(function (d) {
        // 两条链：一条给正常接链用，另一条是 already-linked 的**目标**——
        //   若目标链不存在，先撞的是 unknown-chain（门序：unknown-chain → no-ops → unknown-op → already-linked）。
        d.causal = { chains: [
          { id: CID, cause: '见证', action: '见证', status: 'active', stage: 'pending' },
          { id: CID2, cause: '见证乙', action: '见证乙', status: 'active', stage: 'pending' }
        ], settled: [], phoneOps: [] };
      }, 'reject-witness:v2970-causal');
      want('unknown-chain', 'phoneBridge.linkChain：链必须**已存在**（接一条不存在的链 = 用桥给世界造一条因果，v2.97.0 X5）');
      trip('unknown-chain', function () { return [Pb.linkChain('po_x', 'c_根本不存在').reason]; });
      want('unknown-op', 'phoneBridge.linkChain：台账里没有这笔操作（认不出是谁 ⇒ 不许凭空接上，v2.97.0 X5）');
      trip('unknown-op', function () { return [Pb.linkChain('po_不存在', CID).reason]; });
      want('no-ops', 'phoneBridge.linkChain：因果容器在但台账面不存在（旧存档 / 外部导入没带这一层，v2.97.0 X5）');
      trip('no-ops', function () {
        let keep = null;
        WA.store.transact(function (d) { keep = d.causal.phoneOps; delete d.causal.phoneOps; }, 'reject-witness:v2970-drop-ops');
        try { return [Pb.linkChain('po_x', CID).reason]; }
        finally { WA.store.transact(function (d) { d.causal.phoneOps = keep || []; }, 'reject-witness:v2970-restore-ops'); }
      });
      want('already-linked', 'phoneBridge.linkChain：已接过别的链**不覆盖**（静默改写会让「这条链的因」事后被换掉而没人知道，v2.97.0 X5）');
      trip('already-linked', function () {
        const n = Pb.noteAction({ opId: 'po_rej_1', act: 'block', to: '乙', chainId: CID });
        if (!n.ok) return ['note-failed:' + n.reason];
        return [Pb.linkChain('po_rej_1', CID2).reason];
      });
      want('ops-full', 'phoneBridge.noteAction：台账满 ⇒ 拒收而非静默挤掉（挤掉一笔 = 让「这条链的因」事后消失，v2.97.0 X5）');
      trip('ops-full', function () {
        const cap = Pb.stat().maxOps;
        WA.store.transact(function (d) {
          d.causal.phoneOps = [];
          for (let i = 0; i < cap; i++) {
            d.causal.phoneOps.push({ id: 'po_fill_' + i, opId: 'po_fill_' + i, act: 'message', actLabel: '回消息',
              from: '', to: '', text: '', at: 1, seq: i + 1, chainId: '' });
          }
        }, 'reject-witness:v2970-fill');
        return [Pb.noteAction({ opId: 'po_over', act: 'pin' }).reason];
      });
    } finally {
      Pb.setSettings(keepPb);
      WA.store.transact(function (d) { d.causal = keepCausal; }, 'reject-witness:v2970-restore-causal');
    }
  }
  // ── v2.99.0（第五十六面：原著幕目）：七个新码，全部走**可执行见证** ──
  //   为什么不进死表：这七条每一条都是**可被外部输入触发**的现实局面——
  //     · bad-outline  —— 面板点了「采纳大纲」但从没试算过（`__cnBuilt` 为空）；
  //     · bad-coord    —— 坐标栏随手敲了 `zz` / `A` / `从三段开始`（人写的坐标往往不是坐标）；
  //     · out-of-range —— 坐标语法对但号越界（粘来的旧大纲换过一份 ⇒ A12 现在可能不存在了）；
  //     · no-outline   —— 还没喂原著就点定位（照实说没基准，不编一份出来）；
  //     · build-throw / adopt-throw / clear-throw —— 引擎内部异常（Store 事务被打桩/被第三方
  //       插件替换是常态），它们与上面四条**分开报**：上面四条是「你给的东西不对」，
  //       这三条是「侧边坏了」——混成一句，面板就只能用同一句话回答两件完全不同的事。
  //   见证全部走产品真 API，且三处异常见证用 finally 无条件还原被打桩的 store.transact
  //   （写完不收回，同一进程里后续的锁会读到别人的手指印）。
  if (WA.canon && typeof WA.canon.buildOutline === 'function') {
    const Cn = WA.canon;
    const keepCn = Cn.getSettings();
    const keepCnTransact = WA.store.transact;
    const keepCnOutline = WA.store.get().canon;
    // 见证用的原著样张：短句 + 换行，够切出多段多点（不依赖任何外部文件）。
    const sample = '推开门，屋里没有人。窗外的雨下了一整夜。桌上放着一封没有署名的信。\n'
      + '灯还亮着。他把信拿起来，又放下了。走廊尽头传来脚步声，很轻。\n'
      + '那是谁。他没有回头，只是把那封信折起来收进内袋。';
    try {
      Cn.setSettings({ enabled: true });
      // 收卷口径同 O9/X5 两段：先清掉上一次采纳的大纲，避免「已采纳」态影响 no-outline 的判据。
      WA.store.transact(function (d) { if (d.canon) d.canon.outline = null; }, 'reject-witness:v2990-reset');
      want('no-outline', 'canon.locate：还没采纳任何大纲就按坐标定位 ⇒ 照实说「没有基准」（不编一份出来，v2.99.0）');
      trip('no-outline', function () { return [Cn.locate('A1').reason, Cn.actText(1).reason]; });
      want('bad-coord', 'canon.locate：坐标语法不对（`zz` / `A` / 空串一律照实拒收——人写的坐标往往不是坐标，v2.99.0）');
      trip('bad-coord', function () {
        const b = Cn.buildOutline(sample, {});
        if (!b.ok || !Cn.adopt(b, '见证').ok) return ['witness-setup-failed'];
        return [Cn.locate('zz').reason, Cn.locate('A').reason, Cn.locate('A1.x').reason];
      });
      want('out-of-range', 'canon.locate：坐标语法对但号越界 ⇒ 照实说「不成立」而**不夹到边界**（幕号是标出来的，v2.99.0）');
      trip('out-of-range', function () {
        const b = Cn.buildOutline(sample, {});
        if (!b.ok || !Cn.adopt(b, '见证').ok) return ['witness-setup-failed'];
        const acts = Cn.outlineView().acts;
        return [Cn.locate('A' + (acts + 5)).reason, Cn.locate('A1.9999').reason, Cn.actText(acts + 5).reason];
      });
      want('bad-outline', 'canon.adopt：收到不是大纲的东西（面板从没试算过就点采纳 / 外部传了空值，v2.99.0）');
      trip('bad-outline', function () { return [Cn.adopt(null, '见证').reason, Cn.adopt({}, '见证').reason]; });
      want('build-throw', 'canon.buildOutline：切分过程内部异常 ⇒ 与「你给的东西不对」分开报（引擎坏了是另一件事，v2.99.0）');
      trip('build-throw', function () {
        // 造法：把 settingsBus.normalize 换成会抛的桩 —— 它在 buildOutline 的 try 内被 settings() 调到。
        //   ★ 这里曾用 `perAct: Symbol('bad')` 触发，**已失效**：pick 加固后是**全域总**的
        //     （非数一律回落设置里的默认值，不再抛），于是那条路返回 ok:true，
        //     见证静默落进 missing —— 一条**假见证**（有触发路径字样，却跑不出码）。
        //     记录在此以免后人「修回去」：拿怪异输入去撞内部异常，本身就是把两类事混成一件。
        //   ★ 为什么换成打桩而不是再找一个会抛的输入：这条码的本义就不是「你给的东西不对」
        //     （那是上面四条 bad-* / no-outline / out-of-range 的活），而是「**侧边坏了**」——
        //     设置层/存储层被第三方替换或本身就是坏的，是宿主上完全正常的局面。
        //     adopt-throw / clear-throw 打桩 store.transact 是同一规格，此处打桩设置层与它们对齐。
        const keepNorm = WA.settingsBus.normalize;
        try {
          WA.settingsBus.normalize = function () { throw new Error('witness:settings-boom'); };
          return [Cn.buildOutline(sample, {}).reason];
        } finally { WA.settingsBus.normalize = keepNorm; }
      });
      want('adopt-throw', 'canon.adopt：落盘事务抛异常 ⇒ 如实归因，且**不留半份大纲**（v2.99.0）');
      trip('adopt-throw', function () {
        const b = Cn.buildOutline(sample, {});
        if (!b.ok) return ['witness-setup-failed'];
        try {
          WA.store.transact = function () { throw new Error('witness:adopt-boom'); };
          return [Cn.adopt(b, '见证').reason];
        } finally { WA.store.transact = keepCnTransact; }
      });
      want('clear-throw', 'canon.clearOutline：清空事务抛异常 ⇒ 如实归因（v2.99.0）');
      trip('clear-throw', function () {
        const b = Cn.buildOutline(sample, {});
        if (!b.ok || !Cn.adopt(b, '见证').ok) return ['witness-setup-failed'];
        try {
          WA.store.transact = function () { throw new Error('witness:clear-boom'); };
          return [Cn.clearOutline().reason];
        } finally { WA.store.transact = keepCnTransact; }
      });
    } finally {
      WA.store.transact = keepCnTransact;
      Cn.setSettings(keepCn);
      WA.store.transact(function (d) { d.canon = keepCnOutline; }, 'reject-witness:v2990-restore');
    }
  }
  // ── v2.100.0（第五十七面：原著对位）：两个新码，同样走**可执行见证** ──
  //   为什么它们必须见证而不是进死表：两条都是**外部输入就能触发的现实局面**——
  //     · no-history —— 大纲已采纳，但世界侧还没攒下任何历史（刚采纳、还没演过一轮）；
  //     · no-signal  —— 世界侧有历史，但一行都没撞上幕目题名（对位最常见的诚实结局）。
  //   它们也是最容易被顺手改掉的两个：把「没对上」改成「挑一个最像的」，
  //   在面板上看起来像功能增强，实则是把「不知道」包装成「知道」。
  //   见证要**造世界侧历史**（chronicle 是真源之一），故必须原样收回：写完不收回，
  //   同一进程里后续的锁会读到别人的手指印（本段开头先快照、finally 无条件还原）。
  if (WA.canon && typeof WA.canon.position === 'function') {
    const Cn2 = WA.canon;
    const keepSnap = WA.store.transact ? WA.store.get() : null;
    const keepChron = keepSnap ? keepSnap.chronicle : null;
    const keepCur = keepSnap ? keepSnap.currents : null;
    const keepEch = keepSnap ? keepSnap.echoes : null;
    const keepChap = keepSnap ? keepSnap.chapters : null;
    // ★ canon 也必须一起收回：本段开场会 `d.canon.outline = null` 并 adopt 一份新大纲，
    //   finally 若不还原，残留的 `canon.outline.acts` 会被后续的 sizeAudit 判成
    //   **未登记容量的世界侧数组**（v2820 [N3] 与健康分基线两处判据当场变红）。
    //   深拷贝而非活引用：transact 里的写入不得反过来污染这份基线。
    const keepCanon = (keepSnap && keepSnap.canon !== undefined && keepSnap.canon !== null)
      ? JSON.parse(JSON.stringify(keepSnap.canon)) : undefined;
    const keepCfg2 = Cn2.getSettings();
    const keepTx2 = WA.store.transact;
    const sample2 = '推开门，屋里没有人。窗外的雨下了一整夜。桌上放着一封没有署名的信。\n'
      + '灯还亮着。他把信拿起来，又放下了。走廊尽头传来脚步声，很轻。';
    try {
      Cn2.setSettings({ enabled: true });
      WA.store.transact(function (d) { if (d.canon) d.canon.outline = null; }, 'reject-witness:v2100-reset');
      const b2 = Cn2.buildOutline(sample2, {});
      if (b2.ok && Cn2.adopt(b2, '见证').ok) {
        // no-history：采纳了基准，但世界侧一片空白
        WA.store.transact(function (d) {
          d.chronicle = []; d.currents = []; d.echoes = [];
          d.chapters = { active: false, current: null, history: [], seq: 0 };
        }, 'reject-witness:v2100-empty');
        want('no-history', 'canon.position：大纲已采纳但世界侧还没历史 ⇒ 照实说「还没得对」（不编读数，v2.100.0）');
        trip('no-history', function () { return [Cn2.position({}).reason]; });
        // no-signal：有历史，但一行都没撞上幕目题名（只用无汉字填充，避免假命中）
        WA.store.transact(function (d) {
          d.chronicle = [{ id: 'w1', kind: 'event', title: 'ZZZ', summary: 'xxxx', at: 1, refs: [] }];
        }, 'reject-witness:v2100-miss');
        want('no-signal', 'canon.position：有历史但一行都没撞上幕目题名 ⇒ 照实说没信号而**不给「最接近」的坐标**（v2.100.0）');
        trip('no-signal', function () { return [Cn2.position({}).reason, Cn2.signal('完全没有交集的另一段文字').reason]; });
      }
    } finally {
      WA.store.transact = keepTx2;
      Cn2.setSettings(keepCfg2);
      WA.store.transact(function (d) {
        d.chronicle = keepChron; d.currents = keepCur; d.echoes = keepEch; d.chapters = keepChap;
        if (keepCanon !== undefined) d.canon = keepCanon;
      }, 'reject-witness:v2100-restore');
    }
  }
  // ── engines/perf-trace.js（v2.102.0 = A2/O12：性能基线与分层增量）──
  //   六个新码全部来自本模块，**一条不留死表、全部带可执行见证**：
  //   前四个是「参数给错」的入口守卫，后两个是「未知档/未知分列」的照实拒收。
  //   理由与本仓既有口径一致：能拿真 API 跑出来的码就不该躺在死表里（死表是给
  //   **结构上不可达**的防线准备的，不是给「懒得写见证」准备的）。
  {
    const Pt = WA.perfTrace;
    if (Pt && typeof Pt.mark === 'function') {
      // bad-layer-or-key：非封闭集合里的层 / 空键 —— 标记不成，如实拒收且不计数
      want('bad-layer-or-key', 'perfTrace.mark：层不在封闭集合（或键为空）⇒ 如实拒收、不计数（v2.102.0）');
      trip('bad-layer-or-key', function () {
        return [Pt.mark('ghost-layer', 'k', 1).reason, Pt.mark('inject', '', 1).reason];
      });
      // unknown-class：四档之外的档位 —— 不许「默认当成 short」跑一遍再把数字报出去
      want('unknown-class', 'perfTrace.bench：未知档位 ⇒ 拒收并报出可选档（不默认跑一档，v2.102.0）');
      trip('unknown-class', function () { return [Pt.bench('nope').reason]; });
      // unknown-span：四类耗时分列之外的名字 —— 不许静默丢进某个桶
      want('unknown-span', 'perfTrace.noteSpan：未知分列名 ⇒ 拒收并报出可选项（不静默丢桶，v2.102.0）');
      trip('unknown-span', function () { return [Pt.noteSpan('gpu', 3).reason]; });
      // ── v2.109.0（#7-#11）三个新码：同一把尺子（能跑出来的不许躺死表）──
      //   bad-factor：阈值必须是**相对倍数且 > 1** —— 否则「劣化」与「改进」不可分辨
      //     （factor <= 1 会让同一读数同时满足两边，判据自相矛盾）。
      want('bad-factor', 'perfTrace.setThresholds：factor <= 1 或非有限数 ⇒ 拒收（劣化与改进不可分辨，v2.109.0）');
      trip('bad-factor', function () { return [Pt.setThresholds({ factor: 1 }).reason, Pt.setThresholds({ factor: 'x' }).reason]; });
      //   unknown-policy：淘汰策略是封闭集合 —— 未登记的策略名不许静默按 fifo 走
      //     （那会让「我换成了 lru」这句声明变成一句没有事实的空话）。
      want('unknown-policy', 'perfTrace.setCachePolicy：未知淘汰策略 ⇒ 拒收并报出可选策略（不静默按 fifo，v2.109.0）');
      trip('unknown-policy', function () { return [Pt.setCachePolicy('nope').reason]; });
      //   unknown-format：火焰图三形态是封闭集合 —— 未知形态不许默认回一个形态
      //     （回默认值等于用「另一种图」回答「这种图给我」，读数面不可分）。
      want('unknown-format', 'perfTrace.flamegraph：未知形态 ⇒ 拒收并报出可选形态（不回默认形态，v2.109.0）');
      trip('unknown-format', function () { return [Pt.flamegraph({ format: 'nope' }).reason]; });
    }
  }
  //   另三个码的见证要造出「真的异常/缺失」，故各自打桩（打桩后无条件还原）：
  //     · produce-failed：produce 抛错 ⇒ ok:false **且不写缓存**（旧值不许连坐）
  //     · module-absent：面模块缺席 ⇒ 该面 absent（不是「跑了 0ms」）
// reuse：这一条**不是缺陷也不是守卫**，是 `ensure` 命中路径上的**正常归因**
  //       （reason:'reuse' 与 'stale'/'forced' 并列，答的是「这次为什么是它」）。
  //       它出现在源码里是**正常**的，故用真 API 跑出一次命中共证（不是「拒收」）。
  //       为什么走 `{stamp}` 而不走 `{dirty}`：dirty 模式要 `dirtyOf(L).length===0` 才命中，
  //       而见证里刚 mark 过 ⇒ 脏集非空 ⇒ 永远落在 'stale' 上（首版就这么写的，门禁报「码跑不出」）。
  //       stamp 模式只看「指纹可读且与槽位相同」，一步就能跑到命中路径。
  {
    const Pt2 = WA.perfTrace;
    if (Pt2 && typeof Pt2.ensure === 'function') {
      want('produce-failed', 'perfTrace.ensure：produce 抛错 ⇒ ok:false 且**不写缓存**（旧值不许连坐，v2.102.0）');
      trip('produce-failed', function () {
        Pt2.ensure('inject', 'witness-fail', function () { return { a: 1 }; }, { stamp: 's' });
        return [Pt2.ensure('inject', 'witness-fail', function () { throw new Error('witness boom'); }, { stamp: 's', force: true }).reason];
      });
      want('reuse', 'perfTrace.ensure：命中路径的正常归因（与 stale/forced 并列答「为什么是它」，v2.102.0）');
      trip('reuse', function () {
        Pt2.ensure('inject', 'witness-reuse', function () { return { a: 1 }; }, { stamp: 'w1' });
        return [Pt2.ensure('inject', 'witness-reuse', function () { return { a: 2 }; }, { stamp: 'w1' }).reason];
      });
      want('module-absent', 'perfTrace.runFace：面模块缺席 ⇒ 该面 absent（不是「跑了 0ms」也不编样本，v2.102.0）');
      trip('module-absent', function () {
        const keepDiag = WA.toolDiag;
        try {
          delete WA.toolDiag;
          const c = Pt2.coldStart();
          return c.rows.filter(function (r) { return r.absent; }).map(function (r) { return r.reason; });
        } finally { WA.toolDiag = keepDiag; }
      });
    }
  }
  // ── 渲染层防御式边界（v2.108.0 plan-1 #19）：`pre-violation` ──
  //   为什么需要一个**新码**而不是折进 `missing-find` / `not-found`：调用方传 `'str'`/`{}`/`123`
  //   是「调用错了」，而传 `{find:''}` 是「输入被认识了但是空的」。把两者塌在一起，就是本仓
  //   反复治的「两个根因在诊断面不可分」——前者叫用户去查自己的代码，后者叫用户去查规则内容。
  //   见证策略：同一入口喂「类型错的参数」与原来的合法空值，断两者**归因不同**（不只是「不抛」）。
  //   注：`theater.generate` 是 async，同步的 trip() 拿不到它的 Promise 结果，
  //     故其 instruction-not-string 的运行时见证放在 v2.108.0 专锁的 [B] 段（用 await 断言）。
  {
    const Pr = WA.purifier, Th = WA.theater, Rd = WA.render;
    const bad = [];
    if (Pr && typeof Pr.addRuleSafe === 'function') {
      bad.push(Pr.addRuleSafe('not-an-object').reason);        // 传字符串
      bad.push(Pr.addRuleSafe(123).reason);                     // 传数字
      bad.push(Pr.addRuleSafe([{ find: 'a' }]).reason);         // 传数组（不是朴素对象）
    }
    if (Pr && typeof Pr.removeRuleSafe === 'function') {
      bad.push(Pr.removeRuleSafe(123).reason);                  // 传数字 id
      bad.push(Pr.removeRuleSafe({ id: 'x' }).reason);          // 传对象 id
    }
    if (Th && typeof Th.send === 'function') bad.push(Th.send({}).reason);
    if (Rd && typeof Rd.uninject === 'function') bad.push(Rd.uninject(123).reason);
    want('pre-violation', '渲染层防御式边界：公开入口的参数类型错 ⇒ 明确归因（与「合法但空」的 missing-find/no-id/empty-text 分开，v2.108.0）');
    trip('pre-violation', function () { return bad; });
    // 反向共证（防「一律拒收」式的假通过）不放在这里：本函数的契约是「码 -> 真跑出来」，
    //   往 expect 里塞非码键会污染码面。故反向共证（同入口喂**合法但空**的值仍答旧码
    //   missing-find / no-id / empty-text）放在 v2.108.0 专锁的 [C] 不变式段里断言。
  }
  // ── v2.110.0（计划一 #21/#22 + 计划二 #39/#70）：三个基元模块的九个码 ──
  //   同一把尺子：见证**不是声称**，用真 API 把码跑出来。
  //   为什么这九个码必须见证而不是进死表：它们**全部由外部输入触发**——
  //   「schema 里那个字段类型错了」「没注册过的用户来问权限」都是现网每天会发生的局面，
  //   不是结构上不可达的分支。
  {
    const Fc = WA.faultContext, Sc = WA.schema, Pm = WA.permissions;
    // #21 faultContext：#成功路径**不**产码（那是反向共证，见专锁 [C] 段），
    //   这里只负责「一次失败怎么被讲清楚」的两个码。
    want('fault-handled', 'faultContext.wrap：被包装调用抛出且未声明 rethrow ⇒ 如实吞错并归因（v2.110.0 plan-1 #21）');
    trip('fault-handled', function () {
      return [Fc.wrap('witness.throw', function () { throw new Error('witness boom'); }).reason];
    });
    want('not-a-function', 'faultContext.wrap：第二参数不是函数 ⇒ 如实拒收（不是「没抛所以成功」，v2.110.0）');
    trip('not-a-function', function () {
      return [Fc.wrap('witness.nf', null).reason, Fc.wrap('witness.nf2', 123).reason];
    });

    // #22 schema：结构级拒收的两条出口（字段不合规 / 具名 schema 未注册）
    want('invalid-input', 'schema.validate：字段缺失或类型不符 ⇒ invalid-input + errors 数组（v2.110.0 plan-1 #22）');
    trip('invalid-input', function () {
      return [
        Sc.validate({ type: 'object', fields: { a: { type: 'string', required: true } } }, {}).reason,
        Sc.validate({ type: 'object', fields: { n: { type: 'number' } } }, { n: '3' }).reason,
        Sc.validate({ type: 'object', fields: { k: { type: 'enum', values: ['x'] } } }, { k: 'q' }).reason
      ];
    });
    want('unknown-schema', 'schema.validateNamed：名字没注册过 ⇒ unknown-schema（**不**按空 spec 静默放过，v2.110.0）');
    trip('unknown-schema', function () {
      return [Sc.validateNamed('witness-未注册', { x: 1 }).reason, Sc.validateNamed('', {}).reason];
    });

    // #39 / #70 permissions：四类入参缺口 + 未声明用户。这是「未声明 ≠ 允许」的码面形态。
    want('missing-user', 'permissions：用户名为空 ⇒ 如实报 missing-user（与 unknown-user 分开：前者是调用方漏参，后者是人不在册，v2.110.0 plan-2 #39/#70）');
    trip('missing-user', function () {
      return [Pm.grant('', 'gm').reason, Pm.grantDirect('', 'read').reason];
    });
    want('missing-role', 'permissions.defineRole：角色名为空 ⇒ 不注册并如实报（不静默建一个无名角色，v2.110.0）');
    trip('missing-role', function () {
      return [Pm.defineRole('', []).reason];
    });
    want('missing-perm', 'permissions.grantDirect：权限位为空 ⇒ 如实拒收（不静默授一个空位，v2.110.0）');
    trip('missing-perm', function () {
      return [Pm.grantDirect('witness-u', '').reason];
    });
    want('unknown-role', 'permissions.grant：角色名不在册 ⇒ unknown-role 并附已知名单（**不静默接受**，v2.110.0）');
    trip('unknown-role', function () {
      return [Pm.grant('witness-u', 'witness-不存在的角色').reason];
    });
    want('unknown-user', 'permissions.has：用户未注册 ⇒ unknown-user（「谁都没说不行」不等于「说了行」，v2.110.0）');
    trip('unknown-user', function () {
      return [
        Pm.has('witness-查无此人', 'read').reason,
        Pm.revoke('witness-查无此人', 'gm').reason,
        Pm.check('witness-查无此人', 'read').reason
      ];
    });
    // 复位：见证之间共享同一个 WA，把权限表留下会让后续 section 看到本段造的用户
    //   （v2.81.0 专锁踩过同款串扰）。
    if (Pm && typeof Pm.reset === 'function') Pm.reset();
  }
  // ── v2.111.0（计划二 #67 + #69）：审计日志与转义面的三个码 ──
  //   同一把尺子：见证**不是声称**，用真 API 把码跑出来。
  //   这三个码**全部由外部输入触发**，故走见证而非死表：
  //   · bad-action：调用方传空动作名 —— 「记一条没有名字的事实」不是事实（v2.98.0 起同一条纪律）；
  //   · record-failed：`record()`「从不抛」这条契约的兜底出口。用真 API 喂一个「取属性就抛」
  //     的敌意 opts：审计必须吞掉它并如实归因，而不是把调用方搞挂 —— 这就是
  //     「审计不得改产品行为」的可执行形态（「不抛」不能靠读代码相信，要靠真跑出来）；
  //   · permission-denied：人在册但没有该权限位。与 unknown-user 分开：前者答「他在这、这件
  //     不能干」，后者答「谁都没说行」——两者塌成一个码，排查时分不清该查授权还是该查人。
  {
    const Lg = WA.auditLog, Pm2 = WA.permissions;
    if (Lg && typeof Lg.record === 'function') {
      want('bad-action', 'auditLog.record：动作名为空 ⇒ 如实拒收且**不进环**（不静默记一条无名事实，v2.111.0 plan-2 #67）');
      trip('bad-action', function () { return [Lg.record('').reason, Lg.record(null).reason]; });
      want('record-failed', 'auditLog.record：连「取属性即抛」的敌意 opts 都吞成归因 ⇒ 从不抛、不改产品行为（v2.111.0 plan-2 #67）');
      trip('record-failed', function () {
        return [Lg.record('witness.hostile', null, new Proxy({}, { get: function () { throw new Error('witness hostile get'); } })).reason];
      });
    }
    if (Pm2 && typeof Pm2.grant === 'function' && typeof Pm2.has === 'function') {
      // 造一个「在册、但只有一个空角色」的用户：guest 内置角色权限集为空集，故任何位都答拒。
      Pm2.grant('witness-audit-u', 'guest');
      want('permission-denied', 'permissions.has/check：人在册但没有该权限位 ⇒ permission-denied（与 unknown-user 分开，v2.111.0 plan-2 #67）');
      trip('permission-denied', function () {
        return [Pm2.has('witness-audit-u', 'write').reason, (Pm2.check('witness-audit-u', 'write') || {}).reason];
      });
      // 复位：本段与前面的权限见证共享同一个 WA（v2.81.0 专锁踩过同款串扰）。
      if (typeof Pm2.reset === 'function') Pm2.reset();
    }
  }
  // ── v2.112.0（计划二 #31/#32/#33 + #36/#37/#38/#40）：时间与因果追踪 / 协作面的十四个码 ──
  //   同一把尺子：见证**不是声称**，用真 API 把码跑出来。
  //   为什么这十四个码必须见证而不是进死表：它们**全部由外部输入触发**——
  //   「锚点名给空了」「会话 id 不存在」「占用被别人拿着」「只改了一边」都是现网每天会发生的局面，
  //   不是结构上不可达的分支（死表是留给「结构上永不可达 + 带可复算前提」的那五条的）。
  //
  //   两个模块的开关默认都是关（`enabled:false`），故见证先显式打开、跑完**无条件还原**：
  //   本仓的模块态在 run.js 里是**跨 section 共享**的，留着开关会让下一节看到本段造的会话与层。
  {
    const Ch = WA.chrono, Cl = WA.collab;
    if (Ch && typeof Ch.record === 'function') {
      // 开关先打开：两模块默认 `enabled:false`（出厂即关，是刻意的），不开则第一条码只会得到 'disabled'。
      if (typeof Ch.setSettings === 'function') Ch.setSettings({ enabled: true });
      want('bad-anchor', 'chrono.record：锚点名为空 ⇒ 如实拒收（不记一条没有锚点的变更，v2.112.0 plan-2 #31）');
      trip('bad-anchor', function () { return [Ch.record('').reason, Ch.record(null).reason]; });
      want('bad-base', 'chrono.record：`base` 给了但归一后为空（纯空白）⇒ bad-base（**不**当成「这是根」——'
        + '「他说了有个上游」与「他说没有上游」是两件事，v2.112.0）');
      trip('bad-base', function () { return [Ch.record('witness-anchor', '   ').reason]; });
      want('no-base', 'chrono.record：`base` 指向不存在的记录 ⇒ no-base（不静默降级成根节点：'
        + '降级会把断链伪装成合法分层，v2.112.0）');
      trip('no-base', function () { return [Ch.record('witness-anchor', 'witness-查无此记录').reason]; });
      want('no-entry', 'chrono.undo：记录 id 不在图里 ⇒ no-entry（读面同样要如实归因，不返回空计划，v2.112.0）');
      trip('no-entry', function () { return [Ch.undo('witness-查无此记录').reason, Ch.simBranch('witness-查无此记录').reason]; });
      want('need-confirm', 'chrono.applyUndo：缺 `{confirm:true}` ⇒ need-confirm（「试算」与「真做」'
        + '必须分开说：默认走 undo 的 dryRun，绝不默认落地，v2.112.0 plan-2 #33）');
      trip('need-confirm', function () { return [Ch.applyUndo('witness-x').reason, Ch.applyUndo('witness-x', {}).reason]; });
      // 还原：本段把开关打开过（默认关闭），留着会让后续 section 看到非默认态。
      if (typeof Ch.setSettings === 'function') Ch.setSettings({ enabled: false });
    }
    if (Cl && typeof Cl.open === 'function') {
      if (typeof Cl.setSettings === 'function') Cl.setSettings({ enabled: true });
      want('bad-session', 'collab.open/close/claim：会话标识归一后为空 ⇒ bad-session（不建一个无名会话，v2.112.0 plan-2 #36）');
      trip('bad-session', function () { return [Cl.open('').reason, Cl.close('').reason, Cl.claim('witness-actor', '').reason]; });
      want('no-session', 'collab.close/claim：会话 id 不在册（或已关闭）⇒ no-session（**不假称成功**：'
        + '关闭一个不存在的会话若回 ok:true，调用方会以为自己关掉了什么，v2.112.0）');
      trip('no-session', function () { return [Cl.close('witness-S-查无此会话').reason, Cl.claim('witness-actor', 'witness-S-查无此会话').reason]; });
      want('bad-actor', 'collab.claim/release/noteConflict：actor 为空 ⇒ bad-actor（缺字段不猜：'
        + '不按次序编一个人名，v2.112.0 plan-2 #37）');
      trip('bad-actor', function () { return [Cl.claim('', 'witness-S1').reason, Cl.noteConflict('', 'a', 'b').reason]; });
      want('claimed-by-other', 'collab.claim：同一 actor 已被**另一个**会话占用 ⇒ claimed-by-other 并带出持有者'
        + '（不夺取、不做超时夺锁 —— 让调用方自己决定，v2.112.0 plan-2 #36）');
      trip('claimed-by-other', function () {
        const s1 = Cl.open('witness-A', { by: 'witness-A' });
        const s2 = Cl.open('witness-B', { by: 'witness-B' });
        if (!s1.ok || !s2.ok) return [];
        Cl.claim('witness-shared', s1.session);
        return [Cl.claim('witness-shared', s2.session).reason];
      });
      want('bad-strategy', 'collab.resolve：策略不在封闭集合里 ⇒ bad-strategy 并附可选策略'
        + '（**不自动裁决**：分歧怎么判必须由人显式说出，v2.112.0 plan-2 #40）');
      trip('bad-strategy', function () { return [Cl.resolve('witness-C1', 'witness-没这个策略', { confirm: true }).reason]; });
      want('bad-conflict', 'collab.resolve：冲突 id 归一后为空 ⇒ bad-conflict（与 bad-session 分开：'
        + '冲突与会话是两个对象，把前者报成后者会让排查查错表，v2.112.0）');
      trip('bad-conflict', function () { return [Cl.resolve('', 'keep-a', { confirm: true }).reason]; });
      want('no-conflict', 'collab.resolve：冲突 id 不在册 ⇒ no-conflict（不假称裁决了一条不存在的分歧，v2.112.0 plan-2 #40）');
      trip('no-conflict', function () { return [Cl.resolve('witness-C-查无此冲突', 'keep-a', { confirm: true }).reason]; });
      want('one-sided', 'collab.noteConflict：只有一侧改动 ⇒ one-sided（**单边改动不是冲突**：'
        + '把它记成冲突会让复盘时到处是「谁跟谁冲突了」的假案，v2.112.0 plan-2 #38）');
      trip('one-sided', function () {
        return [Cl.noteConflict('witness-actor', 'people.lin.mood', null).reason,
          Cl.noteConflict('witness-actor', null, null).reason];
      });
      // 还原：开关与两个模块的默认态都要回去（本仓的模块态跨 section 共享）。
      if (typeof Cl.setSettings === 'function') Cl.setSettings({ enabled: false });
    }
  }
  // ── v2.112.0（计划二 #67 收尾）：审计**落盘**面的三个码 ──
  //   同一把尺子：见证**不是声称**，用真 API 把码跑出来。
  //   三个码都在「宿主坏了」这一面上，且都**由外部输入触发**（浏览器禁用存储、
  //   配额写满、读被拒），是现网会发生的局面，故走见证而非死表。
  //   打桩方式：临时替换 `WA.mainWin`（`lsOf()` 的真源是 `(WA.mainWin || window).localStorage`），
  //   跑完**无条件还原** —— 本仓的宿主态跨 section 共享，留着桩会让下一节看到假宿主。
  {
    const Lg2 = WA.auditLog;
    if (Lg2 && typeof Lg2.flush === 'function') {
      const keepWin = WA.mainWin;
      // ① 无 localStorage：`{}.localStorage` 为 undefined ⇒ lsOf() 如实给 null。
      //    这条码存在的唯一理由就是「不许把『根本没落』说成『落盘成功』」——
      //    返回 ok:true/written:0 会让两种局面同形，故必须真跑一次证明它是 ok:false。
      want('storage-unavailable', 'auditLog.flush/restore：宿主没有 localStorage ⇒ 如实报 storage-unavailable'
        + '（**不**返回 ok:true/written:0 —— 那会让「落盘成功」与「根本没落」同形，v2.112.0）');
      trip('storage-unavailable', function () {
        WA.mainWin = {};
        try { return [Lg2.flush().reason, Lg2.restore().reason]; } finally { WA.mainWin = keepWin; }
      });
      // ② 写得进去但写失败（配额满 / 被拒）：必须归到 flush-failed，而不是让异常穿出去。
      want('flush-failed', 'auditLog.flush：setItem 抛错 ⇒ 吞成 flush-failed（落盘失败不许把调用方搞挂，'
        + '与 record() 的「从不抛」同一条纪律，v2.112.0）');
      trip('flush-failed', function () {
        WA.mainWin = { localStorage: { getItem: function () { return null; },
          setItem: function () { throw new Error('witness quota exceeded'); } } };
        try { Lg2.record('witness.flushfail'); return [Lg2.flush().reason]; } finally { WA.mainWin = keepWin; }
      });
      // ③ 读得出来但读失败（被拒 / 抛错）：必须归到 restore-failed。
      //    与 bad-format 分开：后者是「读到了但不是我认识的东西」，前者是「根本没读到」。
      want('restore-failed', 'auditLog.restore：getItem 抛错 ⇒ 吞成 restore-failed'
        + '（与 bad-format 分开：前者是「没读到」，后者是「读到了但不认识」，v2.112.0）');
      trip('restore-failed', function () {
        WA.mainWin = { localStorage: { getItem: function () { throw new Error('witness storage denied'); },
          setItem: function () {} } };
        try { return [Lg2.restore().reason]; } finally { WA.mainWin = keepWin; }
      });
    }
  }
  // ── v2.113.0（计划一 A1）：提交面的两个新语义码中的**新增**那一个 ──
  //   同一把尺子：见证**不是声称**，用真 API 把码跑出来。
  //   · orphaned-epoch：批横跨聊天纪元（批进行中发生 init/切聊天）⇒ 该批退出时既不落盘，
  //     其候选也从内存丢弃。这条路径**现网真的会发生**（切聊天就在事件回调里调 init），
  //     故走见证而不是进死表——「跨纪元批的候选从内存也丢掉」这句声明必须有可执行事实。
  //   注意：本次改动**只**新增了这一个码。`permission-denied` 是本模块**已有**的码
  //     （`core/permissions.js` 的 has/check 已见证），`transact` 返回体里出现的是同一个字符串，
  //     不构成新码（扫描面按**码**去重，不按位置计数）。
  {
    const St = WA.store;
    if (St && typeof St.batch === 'function' && typeof St.init === 'function') {
      want('orphaned-epoch', 'store.batch：批横跨聊天纪元（批进行中 init/切聊天）⇒ 该批退出不落盘、'
        + '且其候选从内存一并丢弃（声明的「已丢弃」必须同时对存储与内存成立，v2.113.0 A1）');
      trip('orphaned-epoch', function () {
        // 用**同步抛出**的批体：`batch()` 的 finally 因而同步执行，
        //   于是在本同步探针里就能读到上一次批退出的结论（无需 await）。
        const p = St.batch(function () { St.init(); throw new Error('witness:orphaned-batch'); });
        if (p && typeof p.catch === 'function') p.catch(function () {});   // 已受理：不留未处理拒绝
        const lf = St.batchStat().lastFlush || {};
        return [lf.reason];
      });
    }
  }
  // ── v2.114.0（计划二 #56 + #68）：四个新码必须带可执行见证 ──
  //   同一把尺子：见证不是声称。下面四条各自区分一对本该分开的局面：
  //   「钩子说不行」/「钩子名不存在」/「脚本自己炸了」/「跑过头了」
  //   —— 四种都是「没成功」，但修法完全不同；塌成一个字符串就再也问不出「哪一种」。
  {
    const Pl = WA.plugin, Sb = WA.sandbox;
    if (Pl && typeof Pl.register === 'function') {
      want('unknown-hook', 'plugin.fire：钩子名不在四钩子封闭集合里（init/beforeSave/afterLoad/onRender）'
        + '⇒ unknown-hook，不把拼错的钩子名当成「没人监听」（v2.114.0）');
      trip('unknown-hook', function () { return [Pl.fire('witness-bogus-hook', {}).reason]; });
      want('plugin-blocked', 'plugin.register 的 beforeSave 钩子返回 ok:false ⇒ save 前拦下（plugin-blocked）；'
        + '「钩子说不行」与「钩子没说话」必须分开（v2.114.0）');
      trip('plugin-blocked', function () {
        const nm = '__witness_block';
        Pl.register({ name: nm, hooks: { beforeSave: function () { return { ok: false, reason: 'witness' }; } } });
        try { return [Pl.fire('beforeSave', {}).reason]; } finally { WA.plugin.unregister(nm); }
      });
    }
    if (Sb && typeof Sb.run === 'function') {
      want('sandbox-throw', 'sandbox.run：脚本自己抛错 ⇒ 吞成 sandbox-throw'
        + '（沙箱口不许把调用方搞挂；与「Access denied」分列——前者是脚本坏了，后者是边界挡下了，v2.114.0）');
      trip('sandbox-throw', function () { return [Sb.run(function () { throw new Error('witness sandbox'); }, {}, []).reason]; });
      want('sandbox-timeout', 'sandbox.run：同步体跑过 timeoutMs ⇒ sandbox-timeout'
        + '（超时是读数不是崩：仍把已完成的返回值带出供调用方判，v2.114.0）');
      trip('sandbox-timeout', function () {
        const r = Sb.run(function () { const t0 = Date.now(); while (Date.now() - t0 < 40) {} return 'done'; }, {}, [], { timeoutMs: 1 });
        return [r.reason];
      });
    }
  }
  // ══ v2.117.0（计划二 B1–B6）：行动 / 通行 / 认知 / 关系经历 / 组织项目 / 机会窗口 ══
  //   这 59 条码**全部由真实局面触发**（目标被撤、资源没备齐、路段被封、还没听说就想核实……），
  //   不是结构上不可达的分支，故按台账规矩「新码一律走可执行见证，不进基线」。
  //   三条例外用 tripDeep：`action-throw` / `no-action` 被 `opportunity.respond` 如实包进
  //   `actReason`，`theme-throw` 被 `recipe.apply` 包进 `themeReason` —— 码在返回体里，
  //   顶层只有外层那一个；不认它们就等于把「归因被记下了」判成没发生。
  {
    const AC = WA.act, WD = WA.world, IT = WA.intel, SH = WA.shadow,
          OG = WA.org, OP = WA.opportunity, RC = WA.recipe;
    // 夹具：一个目标在册的人 + 一个世界事实 + 一个势力（含三种档位的项目与名册）
    WA.store.transact(function (d) {
      d.people = d.people || {};
      d.people['p_甲'] = { id: 'p_甲', name: '甲', resources: { 粮: 100 }, updatedAt: 1,
        life: { goals: [{ id: 'g1', text: '去修堤', obstacle: '', status: 'active' }] } };
      d.people['p_乙'] = { id: 'p_乙', name: '乙', resources: {}, updatedAt: 1 };
      d.worldFacts = [{ key: 'X', value: '堤已加固', at: 1 }];
      d.evolution = d.evolution || {};
      d.evolution.factions = [{ name: '会', resources: { 粮: 100 }, roster: { '甲': {} },
        projects: [
          { what: '精确档', status: 'ongoing', by: '甲', due: 0, needs: [{ item: '粮', need: 5, tier: null }],
            covered: { 粮: 5 }, startedAt: 1, updatedAt: 1 },
          { what: '缺口档', status: 'ongoing', by: '甲', due: 0, needs: [{ item: '粮', need: 100, tier: null }],
            covered: {}, startedAt: 1, updatedAt: 1 },
          { what: '已结项', status: 'done', by: '甲', due: 0, needs: [], covered: {}, startedAt: 1, updatedAt: 1 }
        ] },
        { name: '会2', resources: {}, roster: {},
          projects: [{ what: '叙事档', status: 'ongoing', by: '甲', due: 0,
            needs: [{ item: '布', need: null, tier: 'tight' }], covered: {}, startedAt: 1, updatedAt: 1 }] },
        { name: '会3', resources: {}, roster: {},
          projects: [{ what: '未知档', status: 'ongoing', by: '甲', due: 0,
            needs: [{ item: '铁', need: null, tier: null }], covered: {}, startedAt: 1, updatedAt: 1 }] }];
      d.memory = d.memory || {};
      d.memory.foreshadows = [{ id: 'W1', content: '修堤', status: 'waiting', dueAt: 1000 }];
      d.opportunity = { openings: [] };
      d.acts = { rows: [], res: [] };
      d.shadow = d.shadow || {};
    }, 'reject-witness:seed-v2117');
    if (AC && AC.setSettings) AC.setSettings({ enabled: true });
    if (WD && WD.setSettings) WD.setSettings({ enabled: true });
    if (SH && SH.setSettings) SH.setSettings({ enabled: true });
    if (OG && OG.setSettings) OG.setSettings({ enabled: true });
    if (OP && OP.setSettings) OP.setSettings({ enabled: true, maxOpen: 8, defaultWindowMs: 60000 });
    if (RC && RC.setSettings) RC.setSettings({ name: '' });

    // ── engines/act.js（B1）──
    if (AC && typeof AC.add === 'function') {
      want('missing-goal', 'act.add：没给目标 id ⇒ 行动没有来源（B1）');
      trip('missing-goal', function () { return [AC.add('甲', { kind: 'wait' }).reason]; });
      want('unknown-goal', 'act.add：目标 id 不在册或已非 active ⇒ 悬空行动不得登记（B1）');
      trip('unknown-goal', function () { return [AC.add('甲', { kind: 'wait', goalId: 'nope' }).reason]; });
      want('bad-need', 'act.add：写了资源却没给量 ⇒ 必要条件不完整（B1）');
      trip('bad-need', function () {
        return [AC.add('甲', { kind: 'wait', goalId: 'g1', need: { resource: '粮', amount: 0 } }).reason];
      });
      want('org-missing', 'act.admit：要过资源闸却没有真源（org 缺席）⇒ 不猜库存（B1）');
      trip('org-missing', function () {
        const a = AC.add('甲', { kind: 'wait', goalId: 'g1', need: { resource: '粮', amount: 1 } });
        const keep = WA.org.stockOf;
        try { WA.org.stockOf = null; return [AC.admit(a.id, 0).reason]; } finally { WA.org.stockOf = keep; }
      });
      want('need-unmet', 'act.admit：资源不够就是不够，不把负数伪装成成功（B1）');
      trip('need-unmet', function () {
        const a = AC.add('甲', { kind: 'wait', goalId: 'g1', need: { resource: '铁', amount: 5 } });
        return [AC.admit(a.id, 0).reason];
      });
      want('no-goal', 'act.admit：目标被撤销 ⇒ 挂在它下面的行动不得照常开工（B1）');
      trip('no-goal', function () {
        const a = AC.add('甲', { kind: 'wait', goalId: 'g1' });
        let r = null;
        WA.store.transact(function (d) { d.people['p_甲'].life.goals[0].status = 'done'; }, 'reject-witness:goal-off');
        try { r = AC.admit(a.id, 0).reason; }
        finally {
          WA.store.transact(function (d) { d.people['p_甲'].life.goals[0].status = 'active'; }, 'reject-witness:goal-on');
        }
        return [r];
      });
      want('not-planned', 'act.admit：已开工的行动不得二次准入（两态不可分）（B1）');
      trip('not-planned', function () {
        const a = AC.add('甲', { kind: 'wait', goalId: 'g1', duration: 10 });
        AC.admit(a.id, 0);
        return [AC.admit(a.id, 0).reason];
      });
      want('not-running', 'act.abort：只有 running 的行能被中止（否则「已结束」与「还能中止」两态不可分）（B1）');
      trip('not-running', function () {
        const p = AC.add('甲', { kind: 'wait', goalId: 'g1', duration: 10 });
        return [AC.abort(p.id, 'witness').reason];
      });
      want('unconfirmed', 'act.advance：take/tell/work 没有内置确认器 ⇒ 可见失败，不冒充完成（B1）');
      trip('unconfirmed', function () {
        // 同一时刻只允许一件事：先把本段前面留下的 running 行结算掉，否则 admit 会报 busy
        //   （行停在 planned ⇒ advance 不动它 ⇒ 这条见证会静默失效）。
        AC.advance(4000000);
        const a = AC.add('甲', { kind: 'work', goalId: 'g1', duration: 10 });
        AC.admit(a.id, 4000000);
        AC.advance(4000010);
        return (WA.store.get().acts.rows || []).map(function (x) { return x.reason; })
          .concat((WA.store.get().acts.res || []).map(function (x) { return x.reason; }));
      });
    }

    // ── engines/world.js（B2）──
    if (WD && typeof WD.addPlace === 'function') {
      // kind 必须在 PLACE_KINDS 里（home/work/market/public/wild/sacred）：写 'city' 是 bad-kind，
      //   于是后面的 addRoad / depart / transit 会连锁失败成 unknown-place。
      WD.addPlace({ name: '甲地', kind: 'public' });
      WD.addPlace({ name: '乙地', kind: 'public' });
      WD.addRoad('甲地', '乙地', 30);
      want('bad-source', 'world.addBlock：封锁来源必须是登记过的三种之一，不猜（B2）');
      trip('bad-source', function () {
        return [WD.addBlock({ place: '甲地', source: 'nope', channels: ['person'] }).reason];
      });
      want('bad-use', 'world.addUse：用途词必须在 USE_KINDS 里，不猜（B2）');
      trip('bad-use', function () { return [WD.addUse('甲地', { use: 'nope', open: 0, close: 100 }).reason]; });
      WD.addUse('甲地', { use: 'business', open: 0, close: 1000 });
      want('window-too-short', 'world.canBeAt：窗口容不下这件事 ⇒ 报短多少，不硬塞（B2）');
      trip('window-too-short', function () {
        return [WD.canBeAt('甲', '甲地', 0, 2000, 'business').reason];
      });
      want('pass', 'world.effectiveBlockOf：三层都放行时的正名（不是「没有理由」，是「可以过」）（B2）');
      trip('pass', function () { return [WD.effectiveBlockOf('乙地', 'person').reason]; });
      want('still-in-transit', 'world.arrive：还没到点 ⇒ 位置未知，不提前落点（B2）');
      trip('still-in-transit', function () {
        WD.depart('甲', '甲地', '乙地', 0);
        return [WD.arrive('甲', 1000).reason];
      });
      want('halted', 'world.where：中止过的行程位置**未知**（既不在出发地也不在目的地）（B2）');
      trip('halted', function () {
        WD.stop('甲', 2000, 'witness');
        return [WD.where('甲').reason];
      });
      want('road-closed', 'world.transit：到不了要答得出是**哪一层**断的——路段被封不是「路不存在」（B2）');
      want('blocked-delivered', 'world.effectiveBlockOf：投递层封了该通道 ⇒ 报投递层（与天气层分列）（B2）');
      WD.addBlock({ place: '甲地', source: 'hazard', channels: ['person'] });
      trip('blocked-delivered', function () { return [WD.effectiveBlockOf('甲地', 'person').reason]; });
      WD.addBlock({ road: ['甲地', '乙地'], source: 'hazard', channels: ['road'] });
      trip('road-closed', function () { return [WD.transit('person', '甲地', '乙地').reason]; });
    }

    // ── engines/act.js（B1）：在途改道 ──
    if (AC && typeof AC.replan === 'function' && WD && typeof WD.depart === 'function') {
      // 自己一对**独立地点**：上一笔 road-closed 见证把 甲地~乙地 整段封了，
      //   共用路段的话 admit 会在 reach 建图时就到不了（unreachable）⇒ 行停在 planned
      //   ⇒ replan 走「非在途」分支，in-transit 永远跑不出来（见证静默失效）。
      WD.addPlace({ name: '丙地', kind: 'public' });
      WD.addPlace({ name: '丁地', kind: 'public' });
      WD.addRoad('丙地', '丁地', 30);
      want('in-transit', 'act.replan：在途者不得改道（改道会把一段真走过的路抹成没发生）（B1）');
      trip('in-transit', function () {
        const a = AC.add('甲', { kind: 'move', goalId: 'g1', from: '丙地', to: '丁地' });
        const ad = AC.admit(a.id, 5000000);
        if (!ad || ad.ok !== true) return ['admit-failed:' + ((ad && ad.reason) || 'unknown')];
        return [AC.replan(a.id, {}, 5000010).reason];
      });
    }

    // ── engines/intel.js（B3）──
    if (IT && typeof IT.addIntel === 'function') {
      IT.addIntel('甲', { claim: '堤要塌', source: '路人', level: 'report', about: 'X' });
      want('not-entitled', 'intel.project：无资格者连「猜没猜对」都不泄露（堆数量换不来资格）（B3）');
      trip('not-entitled', function () { return [IT.project('X', '甲').reason]; });
      want('weak-evidence', 'intel.verify：弱证据不改认知 ⇒ 报 weak-evidence 且零变化（B3）');
      trip('weak-evidence', function () {
        return [IT.verify('甲', { about: 'X', level: 'report', source: '路人' }).reason];
      });
      want('nothing-to-verify', 'intel.verify：从没听说过就报 nothing-to-verify，不做「核实」旁路（B3）');
      trip('nothing-to-verify', function () {
        return [IT.verify('甲', { about: 'Y', level: 'record', source: '档册' }).reason];
      });
      want('nothing-to-correct', 'intel.correct：辟谣只对收到过该说法的人生效（B3）');
      trip('nothing-to-correct', function () {
        return [IT.correct('甲', { about: 'X', claim: '不存在', source: '路人' }).reason];
      });
    }

    // ── engines/shadow.js（B4）──
    if (SH && typeof SH.recordExperience === 'function') {
      want('bad-behavior', 'shadow.recordExperience：观察结果词必须在 NOTICE 里，不猜（B4）');
      trip('bad-behavior', function () {
        return [SH.recordExperience('甲', '乙', { what: '修堤', behavior: 'nope' }).reason];
      });
      want('not-a-party', 'shadow.recordExperience：写了不在场的当事人 ⇒ 拒收（认知不能凭空产生）（B4）');
      trip('not-a-party', function () {
        return [SH.recordExperience('甲', '乙', { what: '修堤', behavior: 'kept',
          views: { '丙': { noticed: 'kept' } } }).reason];
      });
      want('no-such-experience', 'shadow.stanceOf：查无此事 ⇒ 不回落成「没看法」（B4）');
      trip('no-such-experience', function () { return [SH.stanceOf('甲', '甲', '乙', '不存在的事').reason]; });
      SH.recordExperience('甲', '乙', { what: '修堤', behavior: 'broken', views: { '甲': { noticed: 'broken' } } });
      want('no-view', 'shadow.stanceOf：认知不对称 ⇒ 客观行为在案而此人没有看法（B4）');
      trip('no-view', function () { return [SH.stanceOf('乙', '甲', '乙', '修堤').reason]; });
      want('nothing-to-accept', 'shadow.acceptRemedy：没有待接受的补救 ⇒ 不假装收到道歉（B4）');
      trip('nothing-to-accept', function () { return [SH.acceptRemedy('甲', '甲', '乙', '修堤').reason]; });
      want('no-new-remedy', 'shadow.offerRemedy：重复同类且未被接受的补救 ⇒ 零变化（B4）');
      trip('no-new-remedy', function () {
        SH.offerRemedy('甲', '乙', { by: '乙', kind: 'explain', what: '修堤' });
        return [SH.offerRemedy('甲', '乙', { by: '乙', kind: 'explain', what: '修堤' }).reason];
      });
    }

    // ── engines/org.js（B5）──
    if (OG && typeof OG.openProject === 'function') {
      want('no-needs', 'org.parseNeeds：需求串为空 ⇒ 没有可对账的清单（B5）');
      trip('no-needs', function () { return [OG.openProject('会', { what: '空单', needs: '' }).reason]; });
      want('bad-needs', 'org.parseNeeds：档位词表外的词不猜、不回落，照实拒收（B5）');
      trip('bad-needs', function () { return [OG.openProject('会', { what: '怪单', needs: '有点紧' }).reason]; });
      want('duplicate-project', 'org.openProject：同名未结项 ⇒ 拒收（否则账面答不出货进了哪一个）（B5）');
      trip('duplicate-project', function () {
        return [OG.openProject('会', { what: '缺口档', needs: '粮10' }).reason];
      });
      want('no-such-project', 'org.deliverToProject：项目不存在 ⇒ 拒收（不新建一个空项目兜住）（B5）');
      trip('no-such-project', function () {
        return [OG.deliverToProject('会', '不存在', '甲', '粮', 1).reason];
      });
      want('project-closed', 'org.deliverToProject：已结项不得再收货（B5）');
      trip('project-closed', function () {
        return [OG.deliverToProject('会', '已结项', '甲', '粮', 1).reason,
          OG.closeProject('会', '已结项').reason];
      });
      want('not-needed', 'org.deliverToProject：只收清单上有的东西（把无关物资倒进来算进度 = 进度可伪造）（B5）');
      trip('not-needed', function () {
        return [OG.deliverToProject('会', '缺口档', '甲', '布', 1).reason];
      });
      want('already-covered', 'org.deliverToProject：精确档项收满即停 ⇒ 报 already-covered（B5）');
      trip('already-covered', function () {
        return [OG.deliverToProject('会', '精确档', '甲', '粮', 1).reason];
      });
      want('shortfall', 'org.closeProject：差一点不许写成「完成」，缺口照实报（B5）');
      trip('shortfall', function () { return [OG.closeProject('会', '缺口档').reason]; });
      want('missing-why', 'org.oweTo：没有原因的欠账日后没人答得出它是怎么来的 ⇒ 拒收（B5）');
      trip('missing-why', function () { return [OG.oweTo('会', '甲', { amount: 1 }).reason]; });
      want('not-on-roster', 'org.oweTo：不在名册上的人不能欠势力的账（B5）');
      trip('not-on-roster', function () { return [OG.oweTo('会', '乙', { amount: 1, why: '罚没' }).reason]; });
      // 这三条是 projectView 的**档位读数**：码的本义就是「这个项目的需求记到什么程度」，
      //   载体是 tierReason（tierLine 的同一个值），故按读数面见证。
      want('recorded', 'org.projectView：至少一项记了刻数 ⇒ 精确档读数（B5）');
      trip('recorded', function () { return [OG.projectView('会').tierReason]; });
      want('narrative-only', 'org.projectView：只记了档位词 ⇒ 叙事档读数（B5）');
      trip('narrative-only', function () { return [OG.projectView('会2').tierReason]; });
      want('nothing-recorded', 'org.projectView：两样都没记 ⇒ 未知档，**不给词**（B5）');
      trip('nothing-recorded', function () { return [OG.projectView('会3').tierReason]; });
    }

    // ── engines/opportunity.js（B6）──
    if (OP && typeof OP.sweep === 'function') {
      OP.sweep(700000);
      const OID = 'op:promise:W1';
      want('missing-id', 'opportunity.respond：没给机会 id ⇒ 拒收（B6）');
      trip('missing-id', function () { return [OP.respond('', 'decline', { now: 700000 }).reason, OP.view('').reason]; });
      want('unknown-opportunity', 'opportunity.respond：机会不在册 ⇒ 拒收（不替人新建一条）（B6）');
      trip('unknown-opportunity', function () {
        return [OP.respond('op:nope', 'decline', { now: 700000 }).reason, OP.view('op:nope').reason];
      });
      want('bad-choice', 'opportunity.respond：作答词必须落 take/decline/defer 之一（B6）');
      trip('bad-choice', function () { return [OP.respond(OID, 'nope', { now: 700000 }).reason]; });
      want('no-actor', 'opportunity.respond：take 必须点名谁来接（接了却没人做 = 悬空行）（B6）');
      // now 必须**显式**给：缺省是真实当前时间，而夹具窗口在 760000 就关了 ⇒
      //   那会被 window-closed 抢在前面判掉，「窗口内的作答校验」就永远照不到。
      trip('no-actor', function () { return [OP.respond(OID, 'take', { now: 700000 }).reason]; });
      want('missing-window', 'opportunity.respond：延后必须显式给新窗口（先放着与没看见可分辨）（B6）');
      trip('missing-window', function () { return [OP.respond(OID, 'defer', { actor: '甲', now: 700000 }).reason]; });
      want('window-closed', 'opportunity.respond：过窗口末刻的作答一律拒收，且这次作废真落盘（B6）');
      trip('window-closed', function () { return [OP.respond(OID, 'decline', { actor: '甲', now: 900000 }).reason]; });
      want('already-answered', 'opportunity.respond：已作废的行不得再作答（两态不可分）（B6）');
      trip('already-answered', function () {
        return [OP.respond(OID, 'decline', { actor: '甲', now: 900000 }).reason];
      });
      want('not-entitled', 'opportunity.respond：世界侧记了涉及谁 ⇒ 之外的人不受理（B6）');
      trip('not-entitled', function () {
        WA.store.transact(function (d) {
          d.people['p_甲'].knowledge = { intel: [{ id: 'I1', about: '堤', claim: '堤要塌',
            source: '路人', level: 'report', confidence: 20, status: 'active' }] };
        }, 'reject-witness:opp-intel');
        OP.sweep(950000);
        const row = (WA.store.get().opportunity.openings || []).filter(function (x) {
          return x && (x.actors || []).length;
        })[0];
        return [row ? OP.respond(row.id, 'decline', { actor: '乙', now: 951000 }).reason : ''];
      });
      want('action-refused', 'opportunity.respond：行动侧拒绝 ⇒ 回滚阶段，不留「已接但没有动作」的悬空行（B6）');
      want('no-action', 'opportunity.respond：行动侧缺席 ⇒ 把它的归因如实带进 actReason（B6）');
      want('action-throw', 'opportunity.respond：行动侧抛错 ⇒ 归因如实带出，不吞成「不可用」（B6）');
      trip('action-refused', function () {
        OP.sweep(1000000);
        const row = (WA.store.get().opportunity.openings || [])[0];
        const keep = WA.act.add;
        try {
          WA.act.add = null;
          return [OP.respond(row.id, 'take', { actor: '甲', kind: 'wait', goalId: 'g1', now: 1000000 }).reason];
        } finally { WA.act.add = keep; }
      });
      tripDeep('no-action', function () {
        OP.sweep(1100000);
        const row = (WA.store.get().opportunity.openings || [])[0];
        const keep = WA.act.add;
        try {
          WA.act.add = null;
          return OP.respond(row.id, 'take', { actor: '甲', kind: 'wait', goalId: 'g1', now: 1100000 });
        } finally { WA.act.add = keep; }
      });
      tripDeep('action-throw', function () {
        OP.sweep(1200000);
        const row = (WA.store.get().opportunity.openings || [])[0];
        const keep = WA.act.add;
        try {
          WA.act.add = function () { throw new Error('witness'); };
          return OP.respond(row.id, 'take', { actor: '甲', kind: 'wait', goalId: 'g1', now: 1200000 });
        } finally { WA.act.add = keep; }
      });
    }

    // ── engines/recipe.js（B6）──
    if (RC && typeof RC.apply === 'function') {
      want('unknown-recipe', 'recipe：未知配方拒收且不回落（回落会让「启用了」与「没启用」长得一样）（B6）');
      trip('unknown-recipe', function () {
        return [RC.preview('nope').reason, RC.apply('nope').reason, RC.seed('nope').reason];
      });
      want('theme-refused', 'recipe.apply：题材被真源拒收 ⇒ 不留半截配方名（B6）');
      want('theme-throw', 'recipe.apply：题材侧抛错 ⇒ 归因带进 themeReason，不冒充「题材不支持」（B6）');
      trip('theme-refused', function () {
        const keep = WA.theme.apply;
        try {
          // 真源在、但**拒了这组题材**。缺席不算拒收：缺席时本模块根本不委托
          //   （那是「没有题材面」，不是「题材说不」——把装载问题记成配置问题会更难查）。
          WA.theme.apply = function () { return { ok: false, reason: 'unknown-theme' }; };
          return [RC.apply('urban').reason];
        } finally { WA.theme.apply = keep; }
      });
      tripDeep('theme-throw', function () {
        const keep = WA.theme.apply;
        try {
          WA.theme.apply = function () { throw new Error('witness'); };
          return RC.apply('urban');
        } finally { WA.theme.apply = keep; }
      });
      want('no-scene', 'recipe.seed：该配方没有场景种子 ⇒ 拒收（不假装取到了一条）（B6）');
      trip('no-scene', function () {
        const keep = RC.RECIPES.urban.scenes;
        try {
          RC.RECIPES.urban.scenes = [];
          return [RC.seed('urban').reason];
        } finally { RC.RECIPES.urban.scenes = keep; }
      });
    }

    // ── ui/panel.js（B5/B6）：五个回执出口的抛错归因 ──
    //   这五条码只在面板处理器里产生（「侧边坏了」的如实回执），故见证走**真点击**：
    //   点 tab 走真实绑定 → 处理器执行 → 结果落进面板的 dataset 回执位。
    {
      const uiGate = require('./ui-gate-sync.js');
      const env = uiGate.fresh();
      const dom = env.dom, W2 = env.WA;
      const panelEl = dom.getElementById('wa-panel');
      const tabs = panelEl ? panelEl.querySelectorAll('.wa-tab') : [];
      const tab = tabs.filter(function (x) { return x.dataset && x.dataset.page === 'people'; })[0];
      if (tab) tab.click();
      const B = function (id) { return dom.getElementById(id); };
      const keep = {};
      if (W2.recipe) {
        keep.seed = W2.recipe.seed;
        W2.recipe.seed = function () { throw new Error('witness'); };
        want('seed-throw', 'panel：取场景抛错 ⇒ 回执如实报 seed-throw（不吞成「未生效」）（B6）');
        trip('seed-throw', function () {
          const b = B('wa-rec-seed'); if (!b) return []; b.click();
          return [String((panelEl.dataset || {}).recOut || '').split('：')[1]];
        });
        W2.recipe.seed = keep.seed;
        keep.pv = W2.recipe.preview;
        W2.recipe.preview = function () { throw new Error('witness'); };
        want('preview-throw', 'panel：配方预览抛错 ⇒ 回执如实报 preview-throw（B6）');
        trip('preview-throw', function () {
          const nm = B('wa-rec-name'); if (nm) nm.value = 'urban';
          const b = B('wa-rec-view'); if (!b) return []; b.click();
          return [String((panelEl.dataset || {}).recOut || '').split('：')[1]];
        });
        W2.recipe.preview = keep.pv;
      }
      if (W2.opportunity) {
        keep.sw = W2.opportunity.sweep;
        W2.opportunity.sweep = function () { throw new Error('witness'); };
        want('sweep-throw', 'panel：机会扫描抛错 ⇒ 回执如实报 sweep-throw（B6）');
        trip('sweep-throw', function () {
          const b = B('wa-opp-run'); if (!b) return []; b.click();
          return [String((panelEl.dataset || {}).recOut || '').split('：')[1]];
        });
        W2.opportunity.sweep = keep.sw;
      }
      if (W2.org) {
        keep.pj = W2.org.projectView;
        W2.org.projectView = function () { throw new Error('witness'); };
        want('project-throw', 'panel：项目读数抛错 ⇒ 回执如实报 project-throw（B5）');
        trip('project-throw', function () {
          const kd = B('wa-org-kind'); if (kd) kd.value = 'faction';
          const b = B('wa-org-proj-view'); if (!b) return []; b.click();
          return [String((panelEl.dataset || {}).orgOut || '').split('：')[1]];
        });
        W2.org.projectView = keep.pj;
        keep.db = W2.org.debtsView;
        W2.org.debtsView = function () { throw new Error('witness'); };
        want('debts-throw', 'panel：欠账读数抛错 ⇒ 回执如实报 debts-throw（B5）');
        trip('debts-throw', function () {
          const b = B('wa-org-debts'); if (!b) return []; b.click();
          return [String((panelEl.dataset || {}).orgOut || '').split('：')[1]];
        });
        W2.org.debtsView = keep.db;
      }
    }
  }
  // ══ v2.119.0（拓展计划 ③⑥）：经济与商路 / 跨地域传播 ══
  {
    const RG = WA.region;
    if (RG && typeof RG.register === 'function') {
      const keepCfg = RG.getSettings();
      RG.setSettings({ enabled: true, maxEvents: 24, maxRoutes: 8 });
      want('missing-distance', 'region.register：没给距离就算不出消息要走多久 ⇒ 如实拒收（拓展⑥）');
      trip('missing-distance', function () { return [RG.register('远方', {}).reason]; });
      want('bad-lane', 'region.register：渠道名不在表里 ⇒ 拒收并带出允许值（拓展⑥）');
      trip('bad-lane', function () {
        return [RG.register('远方', { distanceDays: 3, lane: 'nope' }).reason];
      });
      want('places-full', 'region.register：远方地区数已达上限 ⇒ 不许静默丢弃（拓展⑥）');
      trip('places-full', function () {
        RG.setSettings({ maxRoutes: 2 });
        try {
          RG.register('满一', { distanceDays: 1 });
          RG.register('满二', { distanceDays: 2 });
          return [RG.register('满三', { distanceDays: 3 }).reason];
        } finally { RG.setSettings({ maxRoutes: 8 }); }
      });
      want('unknown-event', 'region.deliver：事件 id 不在册 ⇒ 不猜一件没有的事（拓展⑥）');
      trip('unknown-event', function () { return [RG.deliver('rg_nope').reason]; });
      want('events-full', 'region.occur：传播队列已满 ⇒ 拒收并带出上限（拓展⑥）');
      trip('events-full', function () {
        RG.setSettings({ maxEvents: 4 });
        try {
          RG.register('甲地', { distanceDays: 1 });
          for (let i = 0; i < 8; i++) RG.occur('甲地', String(RG.EVENTS[0]));
          return [RG.occur('甲地', String(RG.EVENTS[0])).reason];
        } finally { RG.setSettings({ maxEvents: 24 }); }
      });
      want('too-early', 'region.deliver：还没走到就不许提前落地（带出还要等多久）（拓展⑥）');
      trip('too-early', function () {
        RG.setSettings({ maxEvents: 24 });
        RG.register('乙地', { distanceDays: 10 });
        const ev = RG.occur('乙地', String(RG.EVENTS[0]));
        return [RG.deliver(ev.id, { now: 0 }).reason];
      });
      want('already-delivered', 'region.deliver：同一件事不许落地两次（拓展⑥）');
      trip('already-delivered', function () {
        RG.register('丙地', { distanceDays: 0 });
        const ev = RG.occur('丙地', String(RG.EVENTS[0]));
        RG.deliver(ev.id, { now: ev.dueAt });
        return [RG.deliver(ev.id, { now: ev.dueAt }).reason];
      });
      want('route-blocked', 'region.deliver：路断了消息过不来 ⇒ 原地等，不许落地、也不许丢掉（拓展⑥）');
      trip('route-blocked', function () {
        RG.register('丁地', { distanceDays: 0 });
        const ev = RG.occur('丁地', String(RG.EVENTS[0]));
        RG.markLane('丁地', true, { why: '桥塌' });
        try { return [RG.deliver(ev.id, { now: ev.dueAt + 1 }).reason]; }
        finally { RG.markLane('丁地', false); }
      });
      RG.setSettings(keepCfg);
    }
  }

  // ══ v2.119.0（拓展计划 ①）：人物多步计划与受挫重决策 ══
  {
    const PL = WA.plan;
    if (PL && typeof PL.expand === 'function') {
      const keepCfg = PL.getSettings();
      PL.setSettings({ enabled: true, maxSteps: 4, maxPlans: 12, maxTries: 3 });
      WA.store.transact(function (d) {
        d.people = d.people || {};
        d.people['p_计划甲'] = { id: 'p_计划甲', name: '计划甲', resources: { 粮: 5 },
          life: { goals: [{ id: 'gg', text: '修堤', status: 'active' }] } };
        d.people['p_计划乙'] = { id: 'p_计划乙', name: '计划乙', resources: {},
          life: { goals: [{ id: 'gg', text: '修堤', status: 'done' }] } };
      }, 'reject-witness:seed-plan');
      const S1 = [{ text: '备料' }, { text: '开工' }];
      want('missing-steps', 'plan.expand：一步都没给 ⇒ 没有计划可排（拓展①）');
      trip('missing-steps', function () { return [PL.expand('计划甲', 'gg', []).reason]; });
      want('bad-step', 'plan.expand：步骤不是对象 / 没有文本 ⇒ 不猜一步空白（拓展①）');
      trip('bad-step', function () { return [PL.expand('计划甲', 'gg', [null]).reason]; });
      want('too-many-steps', 'plan.expand：步数超过上限 ⇒ 拒收并带出上限（拓展①）');
      trip('too-many-steps', function () {
        const many = [];
        for (let i = 0; i < 9; i++) many.push({ text: 's' + i });
        return [PL.expand('计划甲', 'gg', many).reason];
      });
      want('bad-after', 'plan.expand：前置步指向自己或更后面的序号 ⇒ 会成环，拒收（拓展①）');
      trip('bad-after', function () {
        return [PL.expand('计划甲', 'gg', [{ text: 'a', after: '1' }, { text: 'b' }]).reason];
      });
      want('goal-not-active', 'plan.expand：目标已不是 active ⇒ 不给它排计划（拓展①）');
      trip('goal-not-active', function () { return [PL.expand('计划乙', 'gg', S1).reason]; });
      want('plans-full', 'plan.expand：在册计划数已达上限 ⇒ 不静默丢弃（拓展①）');
      trip('plans-full', function () {
        PL.setSettings({ maxPlans: 1 });
        try {
          PL.expand('计划甲', 'gg', S1);
          WA.store.transact(function (d) {
            d.people['p_计划丙'] = { id: 'p_计划丙', name: '计划丙', resources: {},
              life: { goals: [{ id: 'gg', text: '修堤', status: 'active' }] } };
          }, 'reject-witness:plan-c');
          return [PL.expand('计划丙', 'gg', S1).reason];
        } finally { PL.setSettings({ maxPlans: 12 }); }
      });
      want('no-plan', 'plan.current：这个人没有在册计划 ⇒ 如实说没有（拓展①）');
      trip('no-plan', function () { return [PL.current('查无此人').reason]; });
      want('nothing-to-choose', 'plan.candidates：已无待选步（全 done）⇒ 没得改选（拓展①）');
      trip('nothing-to-choose', function () {
        WA.store.transact(function (d) {
          const r = d.plan.plans.filter(function (x) { return x.personId === 'p_计划甲'; })[0];
          r.status = 'active'; r.tries = 0;
          r.steps = [{ seq: 0, kind: 'step', text: 'a', status: 'done', afterSeq: undefined, need: null, fallback: '' }];
        }, 'reject-witness:plan-done');
        return [PL.candidates('计划甲').reason];
      });
      want('awaiting-after', 'plan.current：剩下的步都被前置卡住 ⇒ 如实报「等前置」，不挑一步顶上（拓展①）');
      trip('awaiting-after', function () {
        WA.store.transact(function (d) {
          const r = d.plan.plans.filter(function (x) { return x.personId === 'p_计划甲'; })[0];
          r.status = 'active'; r.tries = 0;
          // 只有一步 pending，且它的前置步 seq=0 不存在（既非 done 也不是它自己）⇒ 永不被选中。
          r.steps = [{ seq: 1, kind: 'step', text: 'b', status: 'pending', afterSeq: 0, need: null, fallback: '' }];
        }, 'reject-witness:plan-await');
        return [PL.current('计划甲').reason];
      });
      want('blocked', 'plan.current：当前步受阻 ⇒ 如实报「该决策了」（带出受阻步与原因）（拓展①）');
      trip('blocked', function () {
        PL.abandon('计划甲');
        WA.store.transact(function (d) {
          const r = d.plan.plans.filter(function (x) { return x.personId === 'p_计划甲'; })[0];
          r.status = 'blocked'; r.reason = '桥断';
          r.steps = [{ seq: 0, kind: 'step', text: 'a', status: 'blocked', reason: '桥断',
            afterSeq: undefined, need: null, fallback: '' }];
        }, 'reject-witness:plan-block');
        return [PL.current('计划甲').reason];
      });
      want('tries-exhausted', 'plan.advance：尝试次数用尽 ⇒ 停下等人决定，不无限重试（拓展①）');
      trip('tries-exhausted', function () {
        PL.setSettings({ maxTries: 1 });
        try {
          PL.abandon('计划甲');
          WA.store.transact(function (d) {
            const r = d.plan.plans.filter(function (x) { return x.personId === 'p_计划甲'; })[0];
            r.status = 'active'; r.tries = 5;
            r.steps = [{ seq: 0, kind: 'step', text: 'a', status: 'pending', afterSeq: undefined, need: null, fallback: '' }];
          }, 'reject-witness:plan-tries');
          return [PL.advance('计划甲').reason];
        } finally { PL.setSettings({ maxTries: 3 }); }
      });
      want('stale-step', 'plan.advance：交出前发现当前步已被换掉 ⇒ 不把旧步标成 running（拓展①）');
      trip('stale-step', function () {
        const keepStep = PL.current;
        try {
          PL.abandon('计划甲');
          WA.store.transact(function (d) {
            const r = d.plan.plans.filter(function (x) { return x.personId === 'p_计划甲'; })[0];
            r.status = 'active'; r.tries = 0;
            r.steps = [{ seq: 0, kind: 'step', text: 'a', status: 'pending', afterSeq: undefined, need: null, fallback: '' }];
          }, 'reject-witness:plan-stale');
          // 事务内把 seq 改掉：模拟「交出与落盘之间被改选」
          const orig = WA.store.transact;
          WA.store.transact = function (fn, why) {
            return orig.call(WA.store, function (d) {
              const r = d.plan.plans.filter(function (x) { return x.personId === 'p_计划甲'; })[0];
              if (r && r.steps[0]) r.steps[0].seq = 99;
              return fn(d);
            }, why);
          };
          try { return [PL.advance('计划甲').reason]; }
          finally { WA.store.transact = orig; }
        } finally { PL.current = keepStep; }
      });
      want('step-running', 'plan.rechoose：正在做的步没结算就改选 ⇒ 拒收（否则「做了没有」无法判定）（拓展①）');
      trip('step-running', function () {
        PL.abandon('计划甲');
        WA.store.transact(function (d) {
          const r = d.plan.plans.filter(function (x) { return x.personId === 'p_计划甲'; })[0];
          r.status = 'active'; r.tries = 0;
          r.steps = [{ seq: 0, kind: 'step', text: 'a', status: 'running', afterSeq: undefined, need: null, fallback: '' }];
        }, 'reject-witness:plan-run');
        return [PL.rechoose('计划甲', [{ text: '改走别路' }]).reason];
      });
      PL.setSettings(keepCfg);
    }
  }

  // ══ v2.119.0（拓展计划 ②）：关系修复与破裂 ══
  //   两条码由 `tripDeep` 见证：`relation-threw` / `fondness-missing` 只在**结案成功**的
  //   返回体 `relation.reason` 里（顶层是 ok:true），不认它们等于把「关系效果算失败」判成没发生。
  {
    const MD = WA.mend;
    if (MD && typeof MD.mark === 'function') {
      const keepCfg = MD.getSettings();
      MD.setSettings({ enabled: true, maxRows: 12, minProgress: 2, maxSteps: 3 });
      want('missing-hurt', 'mend.mark：没说伤的是什么事 ⇒ 记一条「为什么受伤」都答不出的账（拓展②）');
      trip('missing-hurt', function () { return [MD.mark('修复甲', { with: '修复乙' }).reason]; });
      want('bad-pair', 'mend.mark：自己和自己 ⇒ 这不是一段关系，不记这条账（拓展②）');
      trip('bad-pair', function () {
        return [MD.mark('修复丙', { with: '修复丙', hurt: '说了重话' }).reason];
      });
      const mk = MD.mark('修复甲', { with: '修复乙', hurt: '借钱没还' });
      want('not-accepted', 'mend.step：道歉对方没接受 ⇒ 这一步不算做过（拓展②）');
      trip('not-accepted', function () { return [MD.step('修复甲', mk.id, 'apology', {}).reason]; });
      want('missing-accepter', 'mend.step：接受道歉的是谁必须写明，不给「有人说可以了」（拓展②）');
      trip('missing-accepter', function () {
        return [MD.step('修复甲', mk.id, 'apology', { accepted: true }).reason];
      });
      want('no-receipt', 'mend.step：没有真实转移回执的补偿 = 口头赔偿，不接受（拓展②）');
      trip('no-receipt', function () { return [MD.step('修复甲', mk.id, 'restitution', {}).reason]; });
      want('not-kept', 'mend.step：守约要有实际守约的证据，说了不算（拓展②）');
      trip('not-kept', function () { return [MD.step('修复甲', mk.id, 'keeping', {}).reason]; });
      want('missing-guarantor', 'mend.step：担保这件事没写谁担保 ⇒ 拒收（拓展②）');
      trip('missing-guarantor', function () { return [MD.step('修复甲', mk.id, 'guarantee', {}).reason]; });
      want('bad-guarantor', 'mend.step：担保人就是当事人之一 ⇒ 第三方才叫担保（拓展②）');
      trip('bad-guarantor', function () {
        return [MD.step('修复甲', mk.id, 'guarantee', { by: '修复乙' }).reason];
      });
      want('insufficient-progress', 'mend.close：修复动作不够格就结案「好了」⇒ 条件不足不结案（拓展②）');
      trip('insufficient-progress', function () {
        return [MD.close('修复甲', mk.id, 'fulfilled', {}).reason];
      });
      want('relation-not-authorized', 'mend.close：结案要改关系必须显式授权，不代改（拓展②）');
      trip('relation-not-authorized', function () {
        MD.step('修复甲', mk.id, 'apology', { accepted: true, acceptedBy: '修复乙' });
        MD.step('修复甲', mk.id, 'keeping', { kept: true });
        return [MD.close('修复甲', mk.id, 'fulfilled', {}).reason];
      });
      want('relation-threw', 'mend.close：关系引擎抛错 ⇒ 如实记在行上（不吞成「结案成功但没人知道关系没更）」（拓展②）');
      tripDeep('relation-threw', function () {
        const keepF = WA.fondness;
        try {
          WA.fondness = { apply: function () { throw new Error('witness'); } };
          const r = MD.close('修复甲', mk.id, 'fulfilled', { applyRelation: true });
          return r;
        } finally { WA.fondness = keepF; }
      });
      want('fondness-missing', 'mend.close：关系引擎整个缺席 ⇒ 如实报 fondness-missing，不假装改过（拓展②）');
      tripDeep('fondness-missing', function () {
        const mk2 = MD.mark('修复丁', { with: '修复戊', hurt: '失约' });
        MD.step('修复丁', mk2.id, 'apology', { accepted: true, acceptedBy: '修复戊' });
        MD.step('修复丁', mk2.id, 'keeping', { kept: true });
        const keepF = WA.fondness;
        try {
          WA.fondness = null;
          return MD.close('修复丁', mk2.id, 'fulfilled', { applyRelation: true });
        } finally { WA.fondness = keepF; }
      });
      want('already-closed', 'mend.close：已经结过的案不许再结一次（不静默改判）（拓展②）');
      trip('already-closed', function () {
        return [MD.close('修复甲', mk.id, 'failed', {}).reason];
      });
      want('too-many-tries', 'mend.step：修复尝试次数用尽 ⇒ 停下（不做无上限的「努力」）（拓展②）');
      trip('too-many-tries', function () {
        const mk3 = MD.mark('修复己', { with: '修复庚', hurt: '翻旧账' });
        MD.setSettings({ maxSteps: 1 });
        try {
          MD.step('修复己', mk3.id, 'apology', { accepted: true, acceptedBy: '修复庚' });
          MD.step('修复己', mk3.id, 'keeping', { kept: true });
          return [MD.step('修复己', mk3.id, 'restitution', { receipt: true }).reason];
        } finally { MD.setSettings({ maxSteps: 3 }); }
      });
      MD.setSettings(keepCfg);
    }
  }

  // ══ v2.119.0（拓展计划 ③）：生产、消费与供需变化 ══
  {
    const EC = WA.economy;
    if (EC && typeof EC.stock === 'function') {
      const keepCfg = EC.getSettings();
      EC.setSettings({ enabled: true, maxGoods: 16, maxOrders: 12, maxRoutes: 8, spreadPct: 30 });
      WA.store.transact(function (d) {
        d.people = d.people || {};
        d.people['p_经甲'] = { id: 'p_经甲', name: '经甲', resources: { '银元': 100000000 } };
        d.people['p_经乙'] = { id: 'p_经乙', name: '经乙', resources: { '铁': 0 } };
        d.people['p_经穷'] = { id: 'p_经穷', name: '经穷', resources: { '银元': 0 } };
      }, 'reject-witness:seed-eco');
      want('bad-qty', 'economy.stock：数量不是正整数 ⇒ 不记一笔说不清的到货（拓展③）');
      trip('bad-qty', function () { return [EC.stock('经市', '米', 1.5, { base: 10 }).reason]; });
      want('missing-base', 'economy.stock：首次登记这件货却没给基础价 ⇒ 无基础价不定价（拓展③）');
      trip('missing-base', function () { return [EC.stock('经市', '米', 5, {}).reason]; });
      EC.stock('经市', '米', 100, { base: 10 });
      want('bad-price', 'economy.price：价格非正数 ⇒ 这不是一个价（拓展③）');
      trip('bad-price', function () { return [EC.price('经市', '米', -3).reason]; });
      want('price-out-of-band', 'economy.price：报价越出定价带宽 ⇒ 拒收并带出上下界（拓展③）');
      trip('price-out-of-band', function () { return [EC.price('经市', '米', 999).reason]; });
      want('goods-full', 'economy.stock：在册货品数达上限 ⇒ 不静默丢弃（拓展③）');
      trip('goods-full', function () {
        EC.setSettings({ maxGoods: 4 });
        try {
          ['货一', '货二', '货三', '货四'].forEach(function (k) { EC.stock('经市', k, 1, { base: 5 }); });
          return [EC.stock('经市', '货五', 1, { base: 5 }).reason];
        } finally { EC.setSettings({ maxGoods: 16 }); }
      });
      want('unknown-good', 'economy.buy：这件货没登记过 ⇒ 不凭空交易（拓展③）');
      trip('unknown-good', function () {
        return [EC.buy('经市', '查无此货', 1, { by: '经甲' }).reason];
      });
      want('missing-buyer', 'economy.buy：买家不在册 ⇒ 这笔交易没有付款人（拓展③）');
      trip('missing-buyer', function () {
        return [EC.buy('经市', '米', 1, { by: '查无此人' }).reason];
      });
      want('cannot-afford', 'economy.buy：钱不够就是不够 ⇒ 不把欠款伪装成成交（拓展③）');
      trip('cannot-afford', function () {
        return [EC.buy('经市', '米', 5, { by: '经穷' }).reason];
      });
      want('short-stock', 'economy.buy：库存不够 ⇒ 拒收并带出现有量（拓展③）');
      trip('short-stock', function () {
        // 买家的钱足够（否则会先被资金闸拦下）⇒ 这一条只考库存闸。
        return [EC.buy('经市', '米', 100000, { by: '经甲' }).reason];
      });
      want('orders-full', 'economy.buy：成交流水达上限 ⇒ 拒收，不静默丢单（拓展③）');
      trip('orders-full', function () {
        EC.setSettings({ maxOrders: 4, maxGoods: 16 });
        try {
          for (let i = 0; i < 4; i++) EC.buy('经市', '米', 1, { by: '经甲' });
          return [EC.buy('经市', '米', 1, { by: '经甲' }).reason];
        } finally { EC.setSettings({ maxOrders: 12 }); }
      });
      want('missing-maker', 'economy.craft：合成者不在册 ⇒ 这些原料没有主人（拓展③）');
      trip('missing-maker', function () {
        return [EC.craft('经市', '铁器', { by: '查无此人' }).reason];
      });
      want('short-input', 'economy.craft：原料不够 ⇒ 拒收并列明缺哪几样（拓展③）');
      trip('short-input', function () { return [EC.craft('经市', '铁器', { by: '经乙' }).reason]; });
      want('missing-stamp', 'economy.tick：时段戳为空 ⇒ 这次结算没有时间依据（拓展③）');
      trip('missing-stamp', function () { return [EC.tick('').reason]; });
      want('duplicate-tick', 'economy.tick：同一时段戳重复结算 ⇒ 拒收（否则一次时段被消费两遍）（拓展③）');
      trip('duplicate-tick', function () {
        EC.tick('T-1');
        return [EC.tick('T-1').reason];
      });
      want('routes-full', 'economy.route：在册商路数达上限 ⇒ 不静默丢弃（拓展③）');
      trip('routes-full', function () {
        EC.setSettings({ maxRoutes: 2 });
        try {
          EC.route('路一', { lane: 'road', cost: 1 });
          EC.route('路二', { lane: 'road', cost: 1 });
          return [EC.route('路三', { lane: 'road', cost: 1 }).reason];
        } finally { EC.setSettings({ maxRoutes: 8 }); }
      });
      want('unknown-route', 'economy.ship：商路 id 不在册 ⇒ 不猜一条不存在的路（拓展③）');
      trip('unknown-route', function () {
        return [EC.ship('查无此路', '经市', '米', 1, {}).reason];
      });
      EC.setSettings(keepCfg);
    }
  }

  // ══ v2.119.0（拓展计划 ④）：组织制度、任职权限与权力交接 ══
  {
    const IN = WA.inst;
    if (IN && typeof IN.charter === 'function') {
      const keepCfg = IN.getSettings();
      IN.setSettings({ enabled: true, maxOrgs: 8, maxPending: 12, maxBreaches: 12 });
      want('unknown-org', 'inst.post：组织还没建档 ⇒ 无组织可设职位（拓展④）');
      trip('unknown-org', function () { return [IN.post('查无此会', '会长', {}).reason]; });
      want('orgs-full', 'inst.charter：在册组织数达上限 ⇒ 不静默丢弃（拓展④）');
      trip('orgs-full', function () {
        IN.setSettings({ maxOrgs: 2 });
        try {
          IN.charter('会一', { kind: '公司' });
          IN.charter('会二', { kind: '学校' });
          return [IN.charter('会三', { kind: '家族' }).reason];
        } finally { IN.setSettings({ maxOrgs: 8 }); }
      });
      want('empty-post', 'inst.vacate：这个职位本来就没人占 ⇒ 没有可离任的人（拓展④）');
      trip('empty-post', function () {
        IN.charter('会乙', { kind: '机关' });
        IN.post('会乙', '闲差', {});
        return [IN.vacate('会乙', '闲差', { why: 'resigned' }).reason];
      });
      want('bad-reason', 'inst.vacate：离任理由不在表里 ⇒ 不给一个编不出的理由（拓展④）');
      trip('bad-reason', function () {
        IN.post('会乙', '主事', {});
        IN.assign('会乙', '主事', '人甲', {});
        return [IN.vacate('会乙', '主事', { why: '看他不顺眼' }).reason];
      });
      want('occupied', 'inst.assign：职位已有人占着 ⇒ 换人必须显式 replace（拓展④）');
      trip('occupied', function () {
        return [IN.assign('会乙', '主事', '人乙', {}).reason];
      });
      want('missing-handover', 'inst.succession：交接没写明在途项目数与旧承诺数 ⇒ 不许默认归零（拓展④）');
      trip('missing-handover', function () {
        return [IN.succession('会乙', '人甲', '人乙', {}).reason];
      });
      want('no-authority', 'inst.propose：这项决策需要的权限没人持有 ⇒ 不许挂起（挂起等于永远办不了）（拓展④）');
      trip('no-authority', function () {
        return [IN.propose('会乙', '拨一笔款', { by: '人甲', needs: 'grant' }).reason];
      });
      want('unknown-decision', 'inst.decide：决策 id 不在册 ⇒ 不猜一项没提过的事（拓展④）');
      trip('unknown-decision', function () {
        return [IN.decide('会乙', '查无此案', 'approved', { by: '人甲' }).reason];
      });
      want('missing-penalty', 'inst.breach：违约却没写罚则 ⇒ 本模块不自行判罚（拓展④）');
      trip('missing-penalty', function () {
        return [IN.breach('会乙', '人甲', '私自调货', {}).reason];
      });
      want('breaches-full', 'inst.breach：违约记录达上限 ⇒ 不静默丢弃（拓展④）');
      trip('breaches-full', function () {
        IN.setSettings({ maxBreaches: 4 });
        try {
          for (let i = 0; i < 4; i++) IN.breach('会乙', '人甲', '违约' + i, { penalty: '罚' });
          return [IN.breach('会乙', '人甲', '再违约', { penalty: '罚' }).reason];
        } finally { IN.setSettings({ maxBreaches: 12 }); }
      });
      want('missing-evidence', 'inst.settle：结案没有依据 ⇒ 不许无据结案（拓展④）');
      trip('missing-evidence', function () { return [IN.settle('会乙', 'br-x', {}).reason]; });
      want('unknown-breach', 'inst.settle：违约记录 id 不在册 ⇒ 不猜一条没登记的账（拓展④）');
      trip('unknown-breach', function () {
        return [IN.settle('会乙', 'br-nope', { evidence: '有据' }).reason];
      });
      // 造出一条真违约 → 先结案一次 → 再结第二次走 already-settled
      const br = IN.breach('会丙', '人丙', '挪用', { penalty: '退赔' });
      IN.charter('会丙', { kind: '家族' });
      const br2 = IN.breach('会丙', '人丙', '挪用', { penalty: '退赔' });
      IN.assign('会丙', '家老', '人丁', {});
      IN.settle('会丙', br2.id, { evidence: '退还清单' });
      want('already-settled', 'inst.settle：同一笔违约不许结两次（不静默改判）（拓展④）');
      trip('already-settled', function () {
        return [IN.settle('会丙', br2.id, { evidence: '又一份清单' }).reason];
      });
      // 待批决策 → 批准一次 → 第二次走 already-decided
      IN.charter('会丁', { kind: '公司' });
      IN.post('会丁', '总管', { perms: ['approve'] });
      IN.assign('会丁', '总管', '人戊', {});
      const pr = IN.propose('会丁', '开新铺', { by: '人戊', needs: 'approve' });
      IN.decide('会丁', pr.id, 'approved', { by: '人戊' });
      want('already-decided', 'inst.decide：同一项决策不许批两次（已决的案不能再决）（拓展④）');
      trip('already-decided', function () {
        return [IN.decide('会丁', pr.id, 'rejected', { by: '人戊' }).reason];
      });
      IN.setSettings(keepCfg);
    }
  }

  // ── engines/probe.js（v2.119.0 拓展⑤：调查卷宗）──
  //   这一面的纪律：支持与反驳**各自留行、不取平均**；证据不足时定「未决」而非宣布真相。
  //   故下列码里凡是「拦在半路」的（方向缺失 / 假说指错 / 本钱不够 / 卷宗表满），
  //   全部用产品真 API 跑出来，并顺手验证「被拒之后卷宗没被写脏」。
  {
    const PB = WA.probe;
    if (PB && typeof PB.open === 'function') {
      const keepCfg = PB.getSettings();
      PB.setSettings({ enabled: true, maxCases: 2, maxEvidence: 4, minSupport: 2 });
      WA.store.transact(function (d) { d.probe = { cases: [] }; }, 'reject-witness:probe-reset');

      // ① 立案的两道「这不是调查」闸：只有一个可能性 / 两条候选其实是同一个人。
      want('too-few-hypotheses', 'probe.open：单一假说（或空表）不是调查，是通知（拓展⑤）');
      trip('too-few-hypotheses', function () {
        return [PB.open('仓房失窃', ['老王']).reason, PB.open('仓房失窃', []).reason];
      });
      want('duplicate-hypothesis', 'probe.open：两条候选指向同一 id ⇒ 不把同一个人记两遍（拓展⑤）');
      trip('duplicate-hypothesis', function () {
        return [PB.open('仓房失窃', [{ id: 'h0', text: '老王' }, { id: 'h0', text: '老王' }]).reason];
      });

      // ② 容量闸：卷宗表满 ⇒ 先了结旧案，不静默挤掉。
      WA.store.transact(function (d) {
        d.probe = { cases: [
          { id: 'case_a', question: '甲案', status: 'open', hypotheses: [], evidence: [], wrongs: [] },
          { id: 'case_b', question: '乙案', status: 'open', hypotheses: [], evidence: [], wrongs: [] }] };
      }, 'reject-witness:probe-fill');
      want('cases-full', 'probe.open：卷宗表已满 ⇒ 不静默丢弃旧案（先结案再立案）（拓展⑤）');
      trip('cases-full', function () { return [PB.open('丙案', ['甲说', '乙说']).reason]; });

      // ③ 立一张真卷宗，后续举证 / 对质 / 误指都落在它上面。
      WA.store.transact(function (d) { d.probe = { cases: [] }; }, 'reject-witness:probe-reset2');
      const cid = PB.open('仓房失窃', [{ id: 'h0', text: '老王' }, { id: 'h1', text: '小李' }]).id;

      want('unknown-case', 'probe：案子不存在 ⇒ 不凭一个 id 猜出一张卷宗（举证/对质/误指同一道闸）（拓展⑤）');
      trip('unknown-case', function () {
        return [PB.addEvidence('case_nope', '听说', { level: 'report', dir: 'support', about: 'h0' }).reason,
          PB.confront('case_nope', '老王', { about: 'h0' }).reason,
          PB.wrong('case_nope', '老王', { why: '查错人了' }).reason];
      });
      want('missing-direction', 'probe.addEvidence：不说支持还是反驳的线索不进卷宗（拓展⑤）');
      trip('missing-direction', function () {
        return [PB.addEvidence(cid, '不明方向的线索', { level: 'report', about: 'h0' }).reason];
      });
      want('evidence-full', 'probe.addEvidence：本案证据已达上限 ⇒ 不静默丢弃（先定案或另立一案）（拓展⑤）');
      trip('evidence-full', function () {
        for (let i = 0; i < 4; i++) PB.addEvidence(cid, '线索' + i, { level: 'report', dir: 'support', about: 'h0' });
        return [PB.addEvidence(cid, '第五条', { level: 'report', dir: 'support', about: 'h0' }).reason];
      });
      want('unknown-hypothesis', 'probe：线索指的假说不在这张卷宗里 ⇒ 不新建一条假说兜住（拓展⑤）');
      trip('unknown-hypothesis', function () {
        return [PB.addEvidence(cid, '指错了假说', { level: 'report', dir: 'support', about: 'h9' }).reason,
          PB.confront(cid, '老王', { about: 'h9' }).reason];
      });
      want('insufficient-support', 'probe.confront：手上证据不够 minSupport 就别去对质（拓展⑤）');
      trip('insufficient-support', function () {
        return [PB.confront(cid, '小李', { about: 'h1' }).reason];
      });
      // 对质要把结论记进情报库：情报面缺席 ⇒ intel-missing；情报面抛错 ⇒ intel-threw。
      // 两者都是「不能因为下游不行就把这次对质当成没发生」，故都要留行。
      //   注意取码路径：对质**本身是成功的**（卷宗照常留行），intel 的归因挂在返回体的
      //   belief.reason 上——这正是「不能因为下游不行就把这次对质当成没发生」的形状，
      //   故这里断言的是嵌套归因，而不是顶层 reason。
      want('intel-missing', 'probe.confront：情报面（WA.intel）缺席 ⇒ 如实记 intel-missing，不假装记得（拓展⑤）');
      trip('intel-missing', function () {
        const keep = WA.intel;
        try { WA.intel = null; } catch (e) { return []; }
        let r;
        try { const o = PB.confront(cid, '小李', { about: 'h0' }); r = [o && o.belief && o.belief.reason]; }
        finally { WA.intel = keep; }
        return r;
      });
      want('intel-threw', 'probe.confront：情报面抛错不吞掉 ⇒ 记为 intel-threw（拓展⑤）');
      trip('intel-threw', function () {
        const keep = WA.intel;
        try { WA.intel = { believe: function () { throw new Error('intel down'); } }; } catch (e) { return []; }
        let r;
        try { const o = PB.confront(cid, '小李', { about: 'h0' }); r = [o && o.belief && o.belief.reason]; }
        finally { WA.intel = keep; }
        return r;
      });
      // 误指留痕同样受容量闸约束（「查错人」这一结论本身不撤销案卷）。
      want('wrongs-full', 'probe.wrong：误指留痕达上限 ⇒ 不静默丢弃（查错人也要留下痕迹）（拓展⑤）');
      trip('wrongs-full', function () {
        PB.wrong(cid, '老王', { why: '门锁其实是他弟开的' });
        PB.wrong(cid, '小李', { why: '当晚他在别处' });
        return [PB.wrong(cid, '老张', { why: '第三个错人' }).reason];
      });

      WA.store.transact(function (d) { d.probe = { cases: [] }; }, 'reject-witness:probe-clear');
      PB.setSettings(keepCfg);
    }
  }
  // ── engines/session.js（v2.119.0 拓展⑥：多座位场次）──
  //   这一面的纪律：**座位由凭证认，不由自称认**；历史窗口挤出后不许假装没漏。
  //   故下列码分三组：入座闸（票 / 容量 / 角色占用）、续传闸（序号 / 领先 / 重同步）、
  //   在座闸（不存在的座 / 已卸的座）。
  {
    const SE = WA.session;
    if (SE && typeof SE.host === 'function') {
      const keepCfg = SE.getSettings();
      SE.setSettings({ enabled: true, maxSeats: 2, maxLog: 16, windowMs: 3600000 });
      WA.store.transact(function (d) { d.session = { seats: [], log: [], seq: 0, rev: 0, host: '' }; },
        'reject-witness:session-reset');

      want('missing-token', 'session：入座必须持票 ⇒ 没票连座位都排不上（主持与加入同一道闸）（拓展⑥）');
      trip('missing-token', function () {
        return [SE.host('主持人', { role: 'GM' }).reason, SE.join('阿明', { role: '侦探' }).reason];
      });

      SE.host('主持人', { role: 'GM', token: 'tok-A' });
      want('role-taken', 'session.join：这个角色已有人在座 ⇒ 不悄悄顶掉他（要顶得显式 takeover）（拓展⑥）');
      trip('role-taken', function () {
        return [SE.join('阿丁', { role: 'GM', token: 'tok-R', perms: ['post'] }).reason];
      });
      want('seats-full', 'session：座位已满 ⇒ 不挤掉先到的人（先有人卸座再进）（拓展⑥）');
      trip('seats-full', function () {
        SE.join('阿明', { role: '侦探', token: 'tok-M', perms: ['post'] });
        return [SE.join('阿强', { role: '助手', token: 'tok-Q', perms: ['post'] }).reason];
      });

      want('bad-perms', 'session.join：申请的权限不在具名表里 ⇒ 不给他一个编不出的权限（拓展⑥）');
      trip('bad-perms', function () {
        return [SE.join('阿丁', { role: '打杂', token: 'tok-P', perms: ['post', 'godmode'] }).reason];
      });
      want('bad-token', 'session：票不对（指纹不符）⇒ 不认这张票（验票/发言/续传/卸座同一道闸）（拓展⑥）');
      trip('bad-token', function () {
        return [SE.auth('阿明', 'wrong').reason, SE.post('阿明', 'wrong', 'x').reason,
          SE.since('阿明', 'wrong', 0).reason, SE.leave('阿明', 'wrong').reason];
      });

      want('unknown-seat', 'session：座上没有这个人 ⇒ 不凭一个名字凭空发他一条言（验票/发言/续传/卸座同一道闸）（拓展⑥）');
      trip('unknown-seat', function () {
        return [SE.auth('陌生人', 'tok-Z').reason, SE.post('陌生人', 'tok-Z', '我是谁').reason,
          SE.since('陌生人', 'tok-Z', 0).reason, SE.leave('陌生人', 'tok-Z').reason];
      });
      want('out-of-order', 'session.post：楼号跳了 ⇒ 顺序是世界的一部分，不按你说的号补（拓展⑥）');
      trip('out-of-order', function () {
        return [SE.post('阿明', 'tok-M', '跳号', { seq: 99 }).reason];
      });
      want('bad-seq', 'session.since：交上来的序号不是个数 ⇒ 不猜你要哪一段（拓展⑥）');
      trip('bad-seq', function () {
        return [SE.since('阿明', 'tok-M', 'x').reason, SE.since('阿明', 'tok-M', NaN).reason];
      });
      want('ahead-of-head', 'session.since：认的序号比服务端还多 ⇒ 这份客户端不是这条线上来的（拓展⑥）');
      trip('ahead-of-head', function () {
        return [SE.since('阿明', 'tok-M', 99).reason];
      });
      want('need-resync', 'session.since：要的那段已挤出历史窗口 ⇒ 不假装没漏，先重同步（拓展⑥）');
      trip('need-resync', function () {
        for (let i = 0; i < 20; i++) SE.post('阿明', 'tok-M', 'm' + i);
        return [SE.since('阿明', 'tok-M', 0).reason];
      });
      want('revoked', 'session：座已卸但票还在手里 ⇒ 不再认这份票（不删历史，只是不再当他在座）（拓展⑥）');
      trip('revoked', function () {
        SE.leave('阿明', 'tok-M');
        return [SE.auth('阿明', 'tok-M').reason, SE.post('阿明', 'tok-M', '还在说').reason,
          SE.since('阿明', 'tok-M', 0).reason];
      });

      WA.store.transact(function (d) { d.session = { seats: [], log: [], seq: 0, rev: 0, host: '' }; },
        'reject-witness:session-clear');
      SE.setSettings(keepCfg);
    }
  }
  // ── engines/rehearsal.js（v2.117.0 B7：限定步数的试演）──
  //   这一面的纪律：**没跑成的东西不进预览**（「试演过了」不能是一句无法反驳的话）。
  //   故 run/preview/apply 三条路上的拒收都留见证，且都取出自己的码。
  {
    const RH = WA.rehearsal;
    if (RH && typeof RH.run === 'function') {
      const keepCfg = RH.getSettings();
      RH.setSettings({ enabled: true, maxSteps: 4, keepPreviews: 6, stepMs: 60000, policy: 'limited' });
      WA.store.transact(function (d) { d.rehearsal = { previews: [] }; }, 'reject-witness:rehearsal-reset');

      want('no-steps', 'rehearsal：一步都没给 ⇒ 没有什么可试演的（空步表不是「安全通过」）（B7）');
      trip('no-steps', function () {
        return [RH.run([], { now: 1000 }).reason, RH.preview([], { now: 1000 }).reason];
      });
      want('missing-preview', 'rehearsal.checkPreview：预览不存在 ⇒ 不凭一个 id 认下一份没登记过的结论（B7）');
      trip('missing-preview', function () {
        return [RH.checkPreview('rv_nope').reason,
          RH.apply('rv_nope', { steps: [{ kind: 'wait', who: '甲' }], now: 1000 }).reason];
      });
      want('missing-who', 'rehearsal.run：动作没写谁做的 ⇒ 不替任何人代办（拒绝并留痕在 trace 里）（B7）');
      tripDeep('missing-who', function () {
        return [RH.run([{ kind: 'wait' }], { now: 1000 })];
      });
      want('all-steps-refused', 'rehearsal.preview：一步都没跑成 ⇒ 不登记预览（读的人会以为它被验证过）（B7）');
      trip('all-steps-refused', function () {
        return [RH.preview([{ kind: 'wait' }], { now: 1000 }).reason];
      });
      want('exec-absent', 'rehearsal.run：执行面缺席 ⇒ 试演不做假装（没有执行面就没有「在快照上跑」）（B7）');
      trip('exec-absent', function () {
        const keep = WA.exec;
        try { WA.exec = null; } catch (e) { return []; }
        let r;
        try { r = [RH.run([{ kind: 'wait', who: '甲' }], { now: 1000 }).reason]; }
        finally { WA.exec = keep; }
        return r;
      });
      want('sandbox-failed', 'rehearsal.run：隔离快照建不起来 ⇒ 不拿真世界试演（宁可拒收）（B7）');
      trip('sandbox-failed', function () {
        const keep = WA.exec;
        try { WA.exec = { withContext: function (c, fn) { return fn(); }, cloneState: function () { return null; } }; }
        catch (e) { return []; }
        let r;
        try { r = [RH.run([{ kind: 'wait', who: '甲' }], { now: 1000 }).reason]; }
        finally { WA.exec = keep; }
        return r;
      });
      want('stale-preview', 'rehearsal.apply：世界已不是预览时的那一份 ⇒ 拒收且零变化（旧预览不得覆盖新进度）（B7）');
      trip('stale-preview', function () {
        const pv = RH.preview([{ kind: 'wait', who: '甲' }], { now: 1000 });
        WA.store.transact(function (d) { d.__waStaleProbe = (d.__waStaleProbe || 0) + 1; }, 'reject-witness:stale');
        const r = [RH.checkPreview(pv.previewId).reason,
          RH.apply(pv.previewId, { steps: [{ kind: 'wait', who: '甲' }], now: 1000 }).reason];
        WA.store.transact(function (d) { delete d.__waStaleProbe; }, 'reject-witness:stale-restore');
        return r;
      });

      WA.store.transact(function (d) { d.rehearsal = { previews: [] }; }, 'reject-witness:rehearsal-clear');
      RH.setSettings(keepCfg);
    }
  }
  // ── engines/stage.js（v2.119.0 拓展⑦：玩法包与阶段迁移）──
  //   这一面的纪律：**玩法不能凭空发明**（指标得是包声明的）、**成就不可回卷**、
  //   **换阶段不是一句宣告**（迁移清单要逐项生效）。故下面按 采纳 → 记进度 → 声明 → 换阶段
  //   四段路各取自己的码，并在同一份真状态上串起来跑。
  {
    const SG = WA.stage;
    if (SG && typeof SG.adopt === 'function') {
      const keepCfg = SG.getSettings();
      SG.setSettings({ enabled: true, maxMetrics: 4, maxTransitions: 2 });
      WA.store.transact(function (d) { d.stage = { pack: '', stage: '', metrics: {}, transitions: [] }; },
        'reject-witness:stage-reset');

      want('unknown-pack', 'stage.adopt：包名不在具名表里 ⇒ 玩法不能凭空发明（拓展⑦）');
      trip('unknown-pack', function () { return [SG.adopt('赛博朋克').reason]; });
      want('already-adopted', 'stage.adopt：已经采纳了一套玩法 ⇒ 换玩法必须显式 replace（拓展⑦）');
      trip('already-adopted', function () {
        SG.adopt('悬疑');
        return [SG.adopt('冒险').reason];
      });
      want('no-pack', 'stage：还没采纳任何玩法包 ⇒ 不凭空给一个指标记进度（记进度/声明迁移同一道闸）（拓展⑦）');
      trip('no-pack', function () {
        WA.store.transact(function (d) { d.stage = { pack: '', stage: '', metrics: {}, transitions: [] }; }, 'reject-witness:stage-nopack');
        return [SG.mark('里程', 1).reason, SG.plan({ to: '深入', metric: '里程', need: 3, changes: ['x'] }).reason];
      });

      SG.adopt('冒险', { replace: true });
      want('unknown-metric', 'stage：这个指标不是本包声明的 ⇒ 不发明一个新成就（记进度/声明迁移同一道闸）（拓展⑦）');
      trip('unknown-metric', function () {
        return [SG.mark('体重', 1).reason,
          SG.plan({ to: '深入', metric: '体重', need: 3, changes: ['x'] }).reason];
      });
      want('not-advancing', 'stage.mark：增量为零或负数 ⇒ 成就不是可以往回拧的旋钮（拓展⑦）');
      trip('not-advancing', function () {
        return [SG.mark('里程', -1).reason, SG.mark('里程', 0).reason];
      });
      want('metrics-full', 'stage.mark：指标槽已满 ⇒ 不静默挤掉别人的格子（先自己清点）（拓展⑦）');
      trip('metrics-full', function () {
        WA.store.transact(function (d) {
          d.stage = { pack: '冒险', stage: '启程', metrics: { 名望: 1, 积蓄: 1, 流水: 1, 人手: 1 }, transitions: [] };
        }, 'reject-witness:stage-fill');
        return [SG.mark('里程', 1).reason];
      });

      WA.store.transact(function (d) { d.stage = { pack: '冒险', stage: '启程', metrics: {}, transitions: [] }; },
        'reject-witness:stage-clear');
      want('missing-trigger', 'stage.plan：没写触发条件（指标 + 门槛）⇒ 没触发条件的迁移不是迁移（拓展⑦）');
      trip('missing-trigger', function () { return [SG.plan({ to: '深入' }).reason]; });
      want('missing-changes', 'stage.plan：没写迁移清单 ⇒ 不换一个没人知道要改什么的阶段（拓展⑦）');
      trip('missing-changes', function () { return [SG.plan({ to: '深入', metric: '里程', need: 3 }).reason]; });
      want('transitions-full', 'stage.plan：待换阶段清单已满 ⇒ 不静默丢弃旧迁移（先了结）（拓展⑦）');
      trip('transitions-full', function () {
        SG.plan({ to: '深入', metric: '里程', need: 3, changes: ['场景种子'] });
        SG.plan({ to: '归返', metric: '声望', need: 3, changes: ['场景种子'] });
        return [SG.plan({ to: '归返', metric: '里程', need: 3, changes: ['x'] }).reason];
      });
      want('unknown-transition', 'stage.transit：这条迁移不存在 ⇒ 不凭一个 id 换阶段（拓展⑦）');
      trip('unknown-transition', function () { return [SG.transit('tr_nope', {}).reason]; });

      WA.store.transact(function (d) { d.stage = { pack: '冒险', stage: '启程', metrics: {}, transitions: [] }; },
        'reject-witness:stage-clear2');
      const p1 = SG.plan({ to: '深入', metric: '里程', need: 3, changes: ['场景种子', '信息边界'] });
      want('threshold-unmet', 'stage.transit：门槛未达 ⇒ 带出还差多少，不硬换阶段（拓展⑦）');
      trip('threshold-unmet', function () {
        SG.mark('里程', 2);
        return [SG.transit(p1.id, { applied: ['场景种子', '信息边界'] }).reason];
      });
      want('change-not-applied', 'stage.transit：迁移清单没逐项生效 ⇒ 换阶段不是一句宣告（拓展⑦）');
      trip('change-not-applied', function () {
        SG.mark('里程', 1);
        return [SG.transit(p1.id, { applied: ['场景种子'] }).reason];
      });
      want('already-transited', 'stage.transit：同一条迁移不许换两次（阶段只能往前走一格）（拓展⑦）');
      trip('already-transited', function () {
        SG.transit(p1.id, { applied: ['场景种子', '信息边界'] });
        return [SG.transit(p1.id, { applied: ['场景种子', '信息边界'] }).reason];
      });

      WA.store.transact(function (d) { d.stage = { pack: '', stage: '', metrics: {}, transitions: [] }; },
        'reject-witness:stage-restore');
      SG.setSettings(keepCfg);
    }
  }
  // ── engines/liaison.js（v2.117.0 B8：手机侧操作 → 世界侧约定）──
  //   这一面的纪律：**登记 ≠ 送达**，五个阶段逐个表达；到期 ≠ 故意失约（好感不降）；
  //   界面动作不无条件造成关系变化。下列码按 收件 → 约定 → 推进 → 结算 → 关系 五段路取。
  {
    const LI = WA.liaison;
    if (LI && typeof LI.receive === 'function') {
      const keepCfg = LI.getSettings();
      const keepAct = WA.act.getSettings();
      const keepBrd = WA.phoneBridge.getSettings();
      WA.act.setSettings({ enabled: true, maxActs: 64 });
      WA.phoneBridge.setSettings({ enabled: true, linkCausal: true });
      LI.setSettings({ enabled: true, affectsRelation: false, maxDue: 4 });
      WA.store.transact(function (d) {
        d.people = {
          'p_甲': { id: 'p_甲', name: '甲', resources: {}, knowledge: { intel: [] },
            life: { goals: [{ id: 'g1', text: '去见乙', obstacle: '', status: 'active' }] }, schedule: [] },
          'p_乙': { id: 'p_乙', name: '乙', resources: {}, knowledge: { intel: [] },
            life: { goals: [] }, schedule: [] }
        };
        d.world = d.world && typeof d.world === 'object' ? d.world : {};
        d.world.journeys = [];
        d.acts = { rows: [], res: [] };
        d.liaison = { inbox: [], deals: [], evidence: [] };
        d.fondness = { rows: [] };
      }, 'reject-witness:liaison-reset');

      want('missing-from', 'liaison.receive：这笔操作没写谁发的 ⇒ 世界侧不认下来（拓展⑧）');
      trip('missing-from', function () {
        return [LI.receive({ opId: 'lx_nf', act: 'message', to: '乙' }).reason];
      });
      want('unknown-participant', 'liaison.receive：世界不认得这个名字 ⇒ 不放进闭环（谁的手机不代表世界的谁）（拓展⑧）');
      trip('unknown-participant', function () {
        return [LI.receive({ opId: 'lx_up', act: 'message', from: '甲', to: '陌生人' }).reason];
      });
      want('bridge-absent', 'liaison.receive：桥缺席 ⇒ 这笔只算「本侧暂存待确认」，不假装对方已收到（拓展⑧）');
      tripDeep('bridge-absent', function () {
        //   注意：桥「关闭」给出的是 disabled，absent 的真形态是**桥面整个不在**。
        const keep = WA.phoneBridge;
        try { WA.phoneBridge = null; } catch (e) { return []; }
        let r;
        try { r = [LI.receive({ opId: 'lx_ba', act: 'message', from: '甲', to: '乙' })]; }
        finally { WA.phoneBridge = keep; }
        return r;
      });
      want('bridge-threw', 'liaison.receive：桥登记时抛错 ⇒ 同样只降级为待确认，并如实报因（拓展⑧）');
      tripDeep('bridge-threw', function () {
        const keep = WA.phoneBridge;
        try { WA.phoneBridge = { noteAction: function () { throw new Error('bridge down'); } }; } catch (e) { return []; }
        let r;
        try { r = [LI.receive({ opId: 'lx_bt', act: 'message', from: '甲', to: '乙' })]; }
        finally { WA.phoneBridge = keep; }
        return r;
      });
      want('missing-with', 'liaison.createDeal：没写约定对象 ⇒ 不建一份不知道跟谁的约定（拓展⑧）');
      trip('missing-with', function () {
        return [LI.receive({ opId: 'lx_mw', act: 'message', from: '甲', dueAt: 1000 }).reason];
      });
      want('missing-owner', 'liaison.createDeal：约定算不出发起方（世界不认这个人）⇒ 不凭空造人也不凭空建目标（拓展⑧）');
      trip('missing-owner', function () {
        //   构造跨版本存档 / 外部写入的真实形态：台账里有一笔带期限、桥侧尚未登记、尚无约定任务的行，
        //   而它的发起方（from 空 ⇒ 落到对方身上）世界不认得。
        //   桥恢复后 retry 补建约定 ⇒ 拒收。这里同时钉住 v2.119.0 修的那一处：
        //   原先 retry 把 createDeal 的失败**丢在地上**（调用方读到 ok:true sent:true，
        //   而世界侧约定根本没形成）；现在它与 receive 同一条纪律：如实分列。
        WA.store.transact(function (d) {
          d.acts.rows = [];
          d.liaison.inbox = [{ id: 'lx_owner', opId: 'lx_owner', act: 'message', from: '', to: '查无此人',
            stage: 'submitted', stageLabel: '已提交到桥', bridged: false, bridgeReason: 'bridge-absent',
            dealId: '', reason: '', at: 1, seq: 1, updatedAt: 1, dueAt: 1000 }];
        }, 'reject-witness:liaison-inbox');
        return [LI.retry('lx_owner').reason];
      });
      want('deals-full', 'liaison.createDeal：约定表已满 ⇒ 不静默丢弃旧约定（先了结）（拓展⑧）');
      trip('deals-full', function () {
        WA.store.transact(function (d) {
          const rows = [];
          for (let i = 0; i < 24; i++) rows.push({ id: 'dl_f' + i, inboxId: '', opId: '', partA: '甲', partB: '乙',
            status: 'pending', dueAt: 1000, actId: '', note: '', fulfilment: '', at: 1, updatedAt: 1 });
          d.liaison.deals = rows;
          d.acts.rows = [];
        }, 'reject-witness:liaison-fill');
        return [LI.receive({ opId: 'lx_df', act: 'message', from: '甲', to: '乙', dueAt: 1000 }).reason];
      });

      WA.store.transact(function (d) { d.liaison = { inbox: [], deals: [], evidence: [] }; d.acts.rows = []; },
        'reject-witness:liaison-reset2');
      // 一条真约定：用于推进 / 结算 / 关系三段路。
      function mkDeal(opId) {
        const r = LI.receive({ opId: opId, act: 'message', from: '甲', to: '乙', dueAt: 1000 });
        return r;
      }
      want('settle-not-here', 'liaison.advance：终档不许从推进面走 ⇒ 结算只有一个出口（拓展⑧）');
      trip('settle-not-here', function () { return [LI.advance('op_x', 'settled', '想直接收尾').reason]; });
      want('stage-skip', 'liaison.advance：阶段只许逐档前言 ⇒ 不许从「已提交」跳到「对方已知晓」（拓展⑧）');
      trip('stage-skip', function () {
        mkDeal('op_skip');
        return [LI.advance('op_skip', 'known', '我猜他知道了').reason];
      });
      want('missing-deal', 'liaison.settleDeal：约定不存在（或 id 为空）⇒ 不凭一个 id 结算一笔没发生的约定（拓展⑧）');
      trip('missing-deal', function () {
        return [LI.settleDeal('', 5000).reason, LI.settleDeal('dl_nope', 5000).reason];
      });
      want('relation-off', 'liaison.settleDeal：关系后果默认关 ⇒ 界面动作不无条件造成关系变化（B8 原文点名）');
      tripDeep('relation-off', function () {
        const r = mkDeal('op_roff');
        WA.store.transact(function (d) { d.acts.rows[d.acts.rows.length - 1].status = 'done'; }, 'reject-witness:done1');
        return [LI.settleDeal(r.dealId, 5000)];
      });
      want('relation-absent', 'liaison.applyRelation：关系面缺席 ⇒ 如实回报，不假装给过一步（拓展⑧）');
      tripDeep('relation-absent', function () {
        const r = mkDeal('op_rabs');
        WA.store.transact(function (d) { d.acts.rows[d.acts.rows.length - 1].status = 'done'; }, 'reject-witness:done2');
        LI.setSettings({ affectsRelation: true });
        const keep = WA.fondness;
        try { WA.fondness = null; } catch (e) { return []; }
        let o;
        try { o = [LI.settleDeal(r.dealId, 5000)]; }
        finally { WA.fondness = keep; LI.setSettings({ affectsRelation: false }); }
        return o;
      });
      want('relation-threw', 'liaison.applyRelation：关系面抛错 ⇒ 不吞掉，如实记为 relation-threw（拓展⑧）');
      tripDeep('relation-threw', function () {
        const r = mkDeal('op_rthr');
        WA.store.transact(function (d) { d.acts.rows[d.acts.rows.length - 1].status = 'done'; }, 'reject-witness:done3');
        LI.setSettings({ affectsRelation: true });
        const keep = WA.fondness;
        try { WA.fondness = { apply: function () { throw new Error('fondness down'); } }; } catch (e) { return []; }
        let o;
        try { o = [LI.settleDeal(r.dealId, 5000)]; }
        finally { WA.fondness = keep; LI.setSettings({ affectsRelation: false }); }
        return o;
      });
      want('no-negative-step', 'liaison.applyRelation：失约只记认知与证据，好感不降（不降准则，不擅自代填负向）（拓展⑧）');
      tripDeep('no-negative-step', function () {
        const r = mkDeal('op_nneg');
        LI.setSettings({ affectsRelation: true });
        let o;
        try { o = [LI.settleDeal(r.dealId, 5000)]; }
        finally { LI.setSettings({ affectsRelation: false }); }
        return o;
      });

      WA.store.transact(function (d) { d.liaison = { inbox: [], deals: [], evidence: [] }; d.acts.rows = []; },
        'reject-witness:liaison-clear');
      LI.setSettings(keepCfg);
      WA.phoneBridge.setSettings(keepBrd);
      WA.act.setSettings(keepAct);
    }
  }
  // ── engines/coop.js（v2.118.0 B9：协作裁决面）──
  //   这一面的纪律：**确认前不标完成**；权威与提交不同人；世界改过就是改过（不做尽力应用）；
  //   任一条路径应用不到 ⇒ 整份拒收（不做部分成功）。下列码按 提议 → 裁决 → 回执 三段路取。
  {
    const CP = WA.coop;
    if (CP && typeof CP.propose === 'function') {
      const keepCfg = CP.getSettings();
      const keepCollab = WA.collab;
      CP.setSettings({ enabled: true, horizon: 0, allowSelfApprove: false, maxTries: 3, maxView: 60 });
      function seed() {
        WA.store.transact(function (d) {
          d.people = { 'p_甲': { id: 'p_甲', name: '甲' }, 'p_乙': { id: 'p_乙', name: '乙' }, 'p_丙': { id: 'p_丙', name: '丙' } };
          d.world = d.world && typeof d.world === 'object' ? d.world : {};
          d.world.places = [{ id: 'pl_A', name: '甲地' }];
          d.coop = { proposals: [], archive: [], seq: 0 };
          d.collab = { seq: 0, sessions: [], claims: {}, queue: [], conflicts: [] };
        }, 'reject-witness:coop-reset');
      }
      seed();
      if (WA.collab && typeof WA.collab.setSettings === 'function') {
        WA.collab.setSettings({ enabled: true, maxSessions: 8, maxQueue: 16, maxConflicts: 8, maxActor: 60 });
      }
      const GOPS = [{ path: 'world.places', value: [{ id: 'pl_B', name: '乙地' }] }];
      function mk(o) {
        return CP.propose(Object.assign({ opId: 'op_x', by: '甲', baseRev: CP.stamp(), ops: GOPS }, o || {}));
      }

      want('missing-actor', 'coop：没写操作者 ⇒ 不认这份提议（谁提的必须是个世界里存在的人）（拓展⑨）');
      trip('missing-actor', function () {
        return [CP.propose({ opId: 'na', baseRev: CP.stamp(), ops: GOPS }).reason,
          CP.confirm('cp_a', {}).reason, CP.reject('cp_a', { reason: 'x' }).reason, CP.retry('cp_a', {}).reason];
      });
      want('unknown-actor', 'coop.propose：提议涉及的角色世界不认得 ⇒ 不凭空建人（拓展⑨）');
      trip('unknown-actor', function () {
        return [mk({ opId: 'ua', actor: '查无此人' }).reason];
      });
      want('too-many-ops', 'coop.propose：一次改太多条（超上限）⇒ 不许一次动整个世界（拓展⑨）');
      trip('too-many-ops', function () {
        const ops = [];
        for (let i = 0; i < 25; i++) ops.push({ path: 'world.places', value: [] });
        return [mk({ opId: 'tmo', ops: ops }).reason];
      });
      want('proposals-full', 'coop.propose：待裁队列已满 ⇒ 不静默丢弃旧提议（先裁完）（拓展⑨）');
      trip('proposals-full', function () {
        WA.store.transact(function (d) {
          const rows = [];
          for (let i = 0; i < 24; i++) rows.push({ id: 'cp_f' + i, opId: 'o' + i, by: '甲', actor: '',
            baseRev: { rev: 0, keys: 0, chars: 0 }, ops: GOPS.slice(), load: 1, status: 'pending',
            statusLabel: '', note: '', tries: 0, receiptId: '', reason: '', at: 1, decidedAt: 0, decidedBy: '', updatedAt: 1 });
          d.coop = { proposals: rows, archive: [], seq: 0 };
        }, 'reject-witness:coop-fill');
        return [mk({ opId: 'pf' }).reason];
      });

      seed();
      want('bad-proposal', 'coop：提议 id 是空的 ⇒ 不凭一个空 id 裁决（确认/拒绝/重试同一道闸）（拓展⑨）');
      trip('bad-proposal', function () {
        return [CP.confirm('', { by: '乙' }).reason, CP.reject('', { by: '乙', reason: 'x' }).reason,
          CP.retry('', { by: '甲' }).reason];
      });
      want('no-proposal', 'coop：这份提议不存在（也没在归档里）⇒ 不凭一个 id 编出一次裁决（确认/拒绝/重试同一道闸）（拓展⑨）');
      trip('no-proposal', function () {
        return [CP.confirm('cp_nope', { by: '乙' }).reason, CP.reject('cp_nope', { by: '乙', reason: 'x' }).reason,
          CP.retry('cp_nope', { by: '甲' }).reason];
      });
      want('self-approve', 'coop.confirm：权威世界维护者不得是提议人自己（allowSelfApprove 可显式打开）（拓展⑨）');
      trip('self-approve', function () {
        const r = mk({ opId: 'sa' });
        return [CP.confirm(r.id, { by: '甲' }).reason];
      });
      want('stale-base', 'coop.confirm：基础版本与世界当前版本不一致 ⇒ 请基于当前版本重新提交（不自动合并）（拓展⑨）');
      trip('stale-base', function () {
        const st = CP.stamp();
        WA.store.transact(function (d) { d.world.places = [{ id: 'pl_C', name: '丙地' }]; }, 'reject-witness:coop-move');
        const r = CP.propose({ opId: 'sb', by: '甲', baseRev: st, ops: GOPS });
        return [CP.confirm(r.id, { by: '乙' }).reason];
      });
      want('unappliable', 'coop.confirm：任一条路径应用不到 ⇒ 整份拒收（不做部分成功）（拓展⑨）');
      trip('unappliable', function () {
        //   注意别顺手改世界：那会让第 ④ 步的 stale 先拦下来，看到的码就不是它了。
        seed();
        const r = mk({ opId: 'ua2', ops: [{ path: 'world.nope.deep', value: 1 }] });
        const c = CP.confirm(r.id, { by: '乙' });
        return [c.reason];
      });
      want('path-missing', 'coop.coopSetPath：路径末段那一格不存在 ⇒ 不凭空补一格出来（不代造中间层）（拓展⑨）');
      tripDeep('path-missing', function () {
        seed();
        const r = mk({ opId: 'pm', ops: [{ path: 'world.brandnew', value: 1 }] });
        return [CP.confirm(r.id, { by: '乙' })];
      });
      want('actor-claimed-by-other', 'coop.confirm：这个角色被别的会话占着 ⇒ 拒收并带出持有者（不夺取）（拓展⑨）');
      trip('actor-claimed-by-other', function () {
        seed();
        const r = mk({ opId: 'ac', actor: '丙' });
        const s = WA.collab.open('sess_claim', {});
        const sid = s && (s.session || s.id);
        //   占用必须**以「丙」的名义**声明：占的是这个角色，不是点按钮的人。
        if (sid) WA.collab.claim('丙', sid);
        const c = CP.confirm(r.id, { by: '乙' });
        return [c.reason];
      });
      want('no-receipt-face', 'coop.confirm：回执面缺席 ⇒ 不标完成（确认前不标完成的另一半）（拓展⑨）');
      trip('no-receipt-face', function () {
        seed();
        const r = mk({ opId: 'nrf' });
        try { WA.collab = null; } catch (e) { return []; }
        let c;
        try { c = CP.confirm(r.id, { by: '乙' }); }
        finally { WA.collab = keepCollab; }
        return [c.reason];
      });
      want('receipt-failed', 'coop.confirm：回执没落 ⇒ 世界写入已发生但这次确认不标完成，并把提议退回待处理（拓展⑨）');
      trip('receipt-failed', function () {
        seed();
        const r = mk({ opId: 'rf' });
        WA.collab = { enqueue: function () { return { ok: false, reason: 'witness' }; } };
        let c;
        try { c = CP.confirm(r.id, { by: '乙' }); }
        finally { WA.collab = keepCollab; }
        return [c.reason];
      });
      want('receipt-threw', 'coop.confirm：回执面抛错 ⇒ 不吞掉，如实记为 receipt-threw（拓展⑨）');
      trip('receipt-threw', function () {
        seed();
        const r = mk({ opId: 'rt' });
        WA.collab = { enqueue: function () { throw new Error('collab down'); } };
        let c;
        try { c = CP.confirm(r.id, { by: '乙' }); }
        finally { WA.collab = keepCollab; }
        return [c.reason];
      });

      seed();
      CP.setSettings(keepCfg);
    }
  }
  // ── 跨模块收尾：顺着共享入口（桥 / 制度 / 关系面）把剩下的码取出来 ──
  {
    // ① phone-bridge.noteAction：这笔操作连编号都没有 ⇒ 不收下（收下了就再也没法对账）
    want('missing-op', 'phoneBridge.noteAction：没写这笔操作的编号 ⇒ 不收下（幂等的根就是它）（B8 入口）');
    trip('missing-op', function () {
      return [WA.phoneBridge.noteAction({ act: 'message', from: '甲', to: '乙' }).reason];
    });

    // ② 制度面：职位不存在 ⇒ 不凭空挂人；批准人不在 approve 名册上 ⇒ 不让他批
    const IN = WA.inst;
    if (IN && typeof IN.charter === 'function') {
      const keepInst = IN.getSettings();
      IN.setSettings({ enabled: true });
      IN.charter('收尾会', { kind: '公司', replace: true });
      IN.post('收尾会', '总管', { perms: ['approve'] });
      want('unknown-post', 'inst.assign：这个职位不存在 ⇒ 不凭空挂一个没定义过的人上去（拓展④）');
      trip('unknown-post', function () {
        return [IN.assign('收尾会', '没有这个职位', '人甲', {}).reason,
          IN.vacate('收尾会', '没有这个职位', { why: 'resigned' }).reason];
      });
      want('not-authorized', 'inst.decide：批准人不在 approve 名册上 ⇒ 批准不是「谁点一下都行」（拓展④）');
      trip('not-authorized', function () {
        IN.assign('收尾会', '总管', '人乙', {});
        const pr = IN.propose('收尾会', '开新铺', { by: '人乙', needs: 'approve' });
        return [IN.decide('收尾会', pr.id, 'approved', { by: '人丙' }).reason];
      });
      IN.setSettings(keepInst);
    }

    // ③ 试演「改道」要交给 action 的准入面真判一次；准入面缺席 ⇒ 这一步拒收
    const RH2 = WA.rehearsal;
    if (RH2 && typeof RH2.run === 'function') {
      const keepRh = RH2.getSettings();
      RH2.setSettings({ enabled: true, maxSteps: 4, keepPreviews: 6, stepMs: 60000, policy: 'limited' });
      want('act-absent', 'rehearsal.run：改道要交给行动准入面真判 ⇒ 准入面缺席时这一步拒收（不自己算结论）（B7）');
      tripDeep('act-absent', function () {
        const keep = WA.act;
        try { WA.act = null; } catch (e) { return []; }
        let r;
        try { r = [RH2.run([{ kind: 'reroute', who: '甲', from: '甲地', to: '乙地' }], { now: 1000 })]; }
        finally { WA.act = keep; }
        return r;
      });
      RH2.setSettings(keepRh);
    }

    // ④ 约定的阶段只有五档：交上来一个不在表里的档 ⇒ 不猜你要推到哪
    const LI2 = WA.liaison;
    if (LI2 && typeof LI2.advance === 'function') {
      const keepLi = LI2.getSettings();
      LI2.setSettings({ enabled: true });
      want('unknown-stage', 'liaison.advance：阶段名不在五档表里 ⇒ 不猜你要推到哪一档（拓展⑧）');
      trip('unknown-stage', function () {
        return [LI2.advance('op_x', '乱档', '我说了算').reason];
      });
      LI2.setSettings(keepLi);
    }
  }
  // ══ v2.128.0（拓展计划 X3–X8）：本批新增的六个码，逐条配可执行见证 ══
  //   口径与既有各条一致：**走产品真 API 把码跑出来**，不往台账 base 里塞行换绿。
  //   六条各自治的那个「不可判定」见 FOUR_VERSION_PLAN.md 的 X3–X8 施工图。
  {
    // ① X3：离线推进必须**在事务里**拿到草稿 —— 没草稿时它不假装推进了零天。
    const RG = WA.region;
    if (RG && typeof RG.tickOffline === 'function') {
      const keepRg = RG.getSettings();
      RG.setSettings({ enabled: true, maxEvents: 8, maxRoutes: 6, stalenessMs: 86400000 });
      want('no-draft', 'region.tickOffline：没拿到事务草稿 ⇒ 拒收（不把「我拿不到草稿」说成「你走了零秒」）（X3）');
      trip('no-draft', function () {
        return [RG.tickOffline(null).reason, RG.tickOffline('不是草稿').reason];
      });
      RG.setSettings(keepRg);
    }
    // ② X6：认人落到写闸门（`permissions.adopt`）的两条降级路径。
    //   ③ 条是「匿名收权」（`session.identify` 验票失败时就走它）；
    //   ④ 条是「表外的人」——**不往权限表里塞人**，位为空 ⇒ 同样过不去写闸门。
    const PM = WA.permissions;
    if (PM && typeof PM.adopt === 'function') {
      want('anonymous', 'permissions.adopt：匿名即**收回**闸门当前使用者（退到未启用态），不是登记一个「什么都不许的座」（X6）');
      trip('anonymous', function () {
        return [PM.adopt('anonymous', []).reason, PM.adopt('', ['read']).reason];
      });
      want('not-in-table', 'permissions.adopt：人不在权限表 ⇒ adopted:false 且一位不授（不越权登记）（X6）');
      trip('not-in-table', function () {
        return [PM.adopt('__x6_不在表里的人__', ['read', 'write']).reason];
      });
      PM.adopt('anonymous', []);   // 复位：不留一个半开的使用者给后续见证
    }
    // ③ X7：题材差异对照的三条边界。`themeContrast` 是源级投影口，
    //   「题材面缺席 / 对照抛错 / 对照返回空」三种坏状态都必须**如实归因**，
    //   而不是静默返回一个看起来像「两侧一致」的空结果 —— 那正是 X7 要治的病。
    const RD2 = WA.render;
    if (RD2 && typeof RD2.themeContrast === 'function') {
      const keepTheme = WA.theme;
      want('theme-absent', 'render.themeContrast：题材面缺席 ⇒ 如实归因，不假装「两题材一样」（X7）');
      trip('theme-absent', function () {
        let r;
        try { WA.theme = null; r = RD2.themeContrast([], ['urban']); }
        finally { WA.theme = keepTheme; }
        return [r.reason];
      });
      want('contrast-thrown', 'render.themeContrast：模块级对照抛错 ⇒ 不吞掉，如实记为 contrast-thrown（X7）');
      want('contrast-failed', 'render.themeContrast：对照返回空 ⇒ 如实归因 contrast-failed（不把它读成「一致」）（X7）');
      trip('contrast-thrown', function () {
        let r;
        const keepTh = keepTheme && keepTheme.contrast;
        try {
          keepTheme.contrast = function () { throw new Error('contrast down'); };
          r = RD2.themeContrast([], ['urban']);
        } finally { keepTheme.contrast = keepTh; }
        return [r.reason];
      });
      trip('contrast-failed', function () {
        let r;
        const keepTh = keepTheme && keepTheme.contrast;
        try {
          keepTheme.contrast = function () { return null; };
          r = RD2.themeContrast([], ['urban']);
        } finally { keepTheme.contrast = keepTh; }
        return [r.reason];
      });
    }
  }
  // ── engines/noesis.js（v2.140.0 F1：防全知闸门）──
  //   三个新开码全部**由真实局面触发**（事实登记了但此人不在知情面 / 事实一条账都没有 /
  //   感知半径开关真关），不是结构上不可达的分支，故按台账规矩「新码一律走见证，不进基线」。
  //   三者共用同一个道理：它们是**三种不同的处置**（补账 / 划边界 / 开开关），
  //   合成一个「不知」就再也答不出该做哪一件 —— 这正是本模块最要紧的一条取舍。
  {
    const Ns = WA.noesis;
    // 本段要先有**一个确定的世界**（与 tests/noesis-v2140.js 的 seed 同规格）。
    //   本表与回归共用同一个 vm 全局与同一份世界存储，前面几十个块留下的 rumor 链
    //   / shadow 共同隐瞒 / intel 情报会让「未登记」这个词读到的不是「六源都没这条账」，
    //   而是「其中一源认定此人不知」—— 两个码当场合成一个，见证就成了假见证。
    //   实测（v2.140.0）：不清账时 not-registered 静默落进 missing，门禁报「见证缺失」。
    //   判据要的场必须自己造；环境的不确定性不是判据的一部分。
    if (WA.store && WA.store.transact) {
      WA.store.transact(function (d) {
        d.enigma = { rows: [] };
        d.rumor = { chains: [] };
        d.shadow = { rows: [] };
        d.people = d.people || {};
        Object.keys(d.people).forEach(function (k) {
          const p = d.people[k];
          if (p && p.knowledge && Array.isArray(p.knowledge.intel)) p.knowledge.intel = [];
        });
      }, 'reject-witness:noesis-reset');
    }
    if (Ns && typeof Ns.knows === 'function') {
      // ① 事实已登记、此人不在任一知情面 ⇒ 一票否决，并把否决源逐条带出。
      //   先 drop 再 mark：本表与回归共用同一份世界存储，同名的旧名单会让「甲在界外」
      //   这个前提不成立（实测：不 drop 时 deniedBy 会带出上一轮留下的源）。
      want('not-holder', 'noesis.knows：事实已登记，但此人不在任一知情面 ⇒ 答 false 并把否决源逐条带出（不取平均不投票：不知是不可逆的，六源里一源铁证就足够）');
      trip('not-holder', function () {
        if (Ns.setSettings) Ns.setSettings({ enabled: true });
        if (WA.enigma && WA.enigma.setSettings) WA.enigma.setSettings({ enabled: true });
        if (WA.enigma && WA.enigma.drop) WA.enigma.drop('见证界外事');
        if (WA.enigma && WA.enigma.mark) WA.enigma.mark('见证界外事', '乙');
        return [Ns.knows('甲', '见证界外事').reason];
      });
      // ② 这个事实在六源里一条账都没有 ⇒ known:null（**不拿「没人拦」冒充「该知道」**）。
      want('not-registered', 'noesis.knows：事实六源里一条账都没有 ⇒ known:null + not-registered（「边界还没划」与「边界划了此人在界外」是两回事，处置完全不同）');
      trip('not-registered', function () {
        if (Ns.setSettings) Ns.setSettings({ enabled: true });
        return [Ns.knows('甲', '见证无账事实-从未登记').reason];
      });
    }
    // ④ v2.141.0（F2）新开码 1/2：时点闸门 —— `premature`（时辰未到）。
    //   在此之前它**只在文件头声明里存在**（timeEnabled 三处露脸、零产生方、ERROR_CODES 无行）；
    //   本版把它接成真判据：读 intel.truthOf(about) 的 at 与决策时间比一次。
    //   造场：往 worldFacts 里放一条 at 明确在**未来**的事实（决策时间之后）。
    if (Ns && typeof Ns.knows === 'function' && WA.store && WA.store.transact) {
      want('premature', 'noesis.knows：这件事的成立时刻在决策时间之后 ⇒ 答 false + premature（「时辰未到」与「此人在界外」是两回事：一个要等，一个要拦）');
      trip('premature', function () {
        if (Ns.setSettings) Ns.setSettings({ enabled: true, timeEnabled: true });
        var futureAt = (WA.clock ? WA.clock.now('reject-witness:prem') : Date.now()) + 86400000;
        WA.store.transact(function (d) {
          d.worldFacts = Array.isArray(d.worldFacts) ? d.worldFacts : [];
          d.worldFacts = d.worldFacts.filter(function (x) { return !x || x.key !== '见证未到事'; });
          d.worldFacts.push({ id: 'wf_prem', key: '见证未到事', value: '尚未发生', scope: 'world', source: 'witness', at: futureAt });
        }, 'reject-witness:premature-set');
        return [Ns.knows('甲', '见证未到事').reason];
      });
    }
    // ⑤ v2.141.0（F2）新开码 2/2：感知第二轴 —— `attenuated`（在场但没注意到）。
    //   在此之前该模块文件头边界 7 的那句话**只在注释里成立**（人在场就直接答 present）；
    //   本版把第二轴接成可判定：在场之后再看感知容量（lifeline）与感官载荷（affect）。
    //   造场：把人放在他已登记的地点（canBeAt 为真），再经 lifeline 登记一条 heavy 限制。
    if (Ns && typeof Ns.perceive === 'function' && WA.lifeline && WA.lifeline.register) {
      want('attenuated', 'noesis.perceive：人在场但感知容量被削弱 ⇒ 报 range:impaired + attenuated（「他没注意到」与「他不在场」是两回事：一个是叫他一声，一个是走开）');
      trip('attenuated', function () {
        var keep = Ns.getSettings ? Ns.getSettings() : {};
        try {
          if (Ns.setSettings) Ns.setSettings({ enabled: true, rangeEnabled: true });
          if (WA.lifeline.setSettings) WA.lifeline.setSettings({ enabled: true });
          // 事件现场：登记一处地点，并让甲此刻可以在那里（canBeAt 为真）。
          var at = WA.clock ? WA.clock.now('reject-witness:att') : Date.now();
          WA.store.transact(function (d) {
            d.world = d.world && typeof d.world === 'object' ? d.world : { places: [], roads: [], events: [], journeys: [] };
            d.world.places = Array.isArray(d.world.places) ? d.world.places : [];
            d.world.places = d.world.places.filter(function (x) { return !x || x.name !== '见证削弱场'; });
            d.world.places.push({ id: 'pl_att', name: '见证削弱场', kind: 'room', open: 0, close: 0, at: at });
            d.people = d.people || {};
            d.people['p_甲'] = d.people['p_甲'] || { id: 'p_甲', name: '甲' };
            d.people['p_甲'].life = { goals: [], schedule: [] };
          }, 'reject-witness:attenuated-set');
          // heavy 档：三条以上感官/认知限制 ⇒ capacityOf 判 heavy ⇒ 感知削弱。
          WA.lifeline.register('甲', '见证削弱况', { kind: 'mental', limits: ['cognition', 'sensory', 'sleep'], replace: true });
          var r = Ns.perceive('甲', '见证削弱场');
          return [r.range === 'impaired' ? r.reason : (r.range + '/' + (r.reason || 'none'))];
        } finally {
          if (Ns.setSettings) Ns.setSettings({ rangeEnabled: keep.rangeEnabled !== false });
          if (WA.lifeline && WA.lifeline.setSettings) WA.lifeline.setSettings({ enabled: false });
        }
      });
    }
    // ③ 感知半径开关真关 ⇒ 如实报 unknown，**不回落成可达**（开关事与不可达事绝不同形）。
    if (Ns && typeof Ns.perceive === 'function') {
      want('range-off', 'noesis.perceive：感知半径开关关闭 ⇒ 如实报 range:unknown + range-off，不把它读成「可达」（「没开这条闸」与「人真不可达」是两回事）');
      trip('range-off', function () {
        const keep = Ns.getSettings ? Ns.getSettings() : {};
        try {
          if (Ns.setSettings) Ns.setSettings({ enabled: true, rangeEnabled: false });
          return [Ns.perceive('甲', '城南').reason];
        } finally {
          if (Ns.setSettings) Ns.setSettings({ rangeEnabled: keep.rangeEnabled !== false });
        }
      });
    }
    // ⑥ v2.143.0（F4）新开码 1/2：在岗闸门 —— `off-duty`（在职但此刻不在岗）。
    //   治的病：本仓三个零件（inst.authority 在职面 / life.schedule 日程面 /
    //   world.canBeAt 在场面）各自都对，却**没有一个函数把三者合读**，「在职 ⇒ 在岗」
    //   这句话在本仓库无法表达。判据真源不新开，只做一次合读。
    //   造场：建一个组织 + 一个在职职位（甲任「见证岗」） ⇒ 在职面为真；
    //   再给甲排一条**覆盖此刻**的日程 ⇒ 在岗面不成立。
    if (Ns && typeof Ns.duty === 'function' && WA.inst && WA.inst.charter) {
      want('off-duty', 'noesis.duty：此人在职但此刻被日程占住 ⇒ 答 onDuty:false + off-duty（「在职但不在岗」与「压根不在职」是两回事：一个改日程，一个走任职流程）');
      trip('off-duty', function () {
        var keepD = Ns.getSettings ? Ns.getSettings() : {};
        try {
          if (Ns.setSettings) Ns.setSettings({ enabled: true, dutyEnabled: true });
          if (WA.inst.setSettings) WA.inst.setSettings({ enabled: true });
          var t0 = WA.clock ? WA.clock.now('reject-witness:duty') : Date.now();
          WA.store.transact(function (d) {
            d.inst = { orgs: [] };
            d.people = d.people || {};
            d.people['p_甲'] = d.people['p_甲'] || { id: 'p_甲', name: '甲' };
            d.people['p_甲'].life = { goals: [], commitments: [], schedule: [] };
          }, 'reject-witness:duty-reset');
          WA.inst.charter('见证司', { kind: '机关', replace: true });
          WA.inst.post('见证司', '见证岗', { perms: ['approve'], replace: true });
          WA.inst.assign('见证司', '见证岗', '甲', { replace: true });
          // 覆盖此刻的日程（start 在过去、end 在未来）⇒ 在职面真、在岗面假。
          //   写前先核在职面**确实成立**：造场若不成立，本码会以「不在职」的形态
          //   落进 not-in-office —— 那是另一个码，见证会静默变成假绿。
          var auD = WA.inst.authority('见证司', '甲');
          if (!auD || auD.inOffice !== true) return [];
          WA.store.transact(function (d) {
            var p = d.people['p_甲'];
            p.life = p.life || { goals: [], commitments: [], schedule: [] };
            p.life.schedule = [{ id: 'sch_duty_witness', activity: '外出办事', start: t0 - 3600000, end: t0 + 3600000, status: 'active' }];
          }, 'reject-witness:duty-sched');
          var r = Ns.duty('甲', '见证司', t0);
          // 造场自证：在职面真 + 日程面真 ⇒ 出的必须是 off-duty（不是 not-in-office / on-duty）
          if (!(r && r.reason === 'off-duty' && r.via === 'scheduled')) return [];
          return [r.reason];
        } finally {
          if (Ns.setSettings) Ns.setSettings({ dutyEnabled: keepD.dutyEnabled !== false });
          if (WA.inst && WA.inst.setSettings) WA.inst.setSettings({ enabled: false });
        }
      });
    }
    // ⑦ v2.143.0（F4）新开码 2/2：在岗闸门 —— `not-in-office`（压根不在职）。
    //   与 off-duty 严格分开：off-duty 是「有岗没上」，not-in-office 是「没有岗」。
    //   造场：组织在册，但此题中人不任任何职位。
    if (Ns && typeof Ns.duty === 'function' && WA.inst && WA.inst.charter) {
      want('not-in-office', 'noesis.duty：此人不在该组织任任何职位 ⇒ 答 inOffice:false + not-in-office（**不回落成「在岗」**，也不与「在职但不在岗」合并）');
      trip('not-in-office', function () {
        var keepD2 = Ns.getSettings ? Ns.getSettings() : {};
        try {
          if (Ns.setSettings) Ns.setSettings({ enabled: true, dutyEnabled: true });
          if (WA.inst.setSettings) WA.inst.setSettings({ enabled: true });
          var t1 = WA.clock ? WA.clock.now('reject-witness:duty2') : Date.now();
          WA.store.transact(function (d) {
            d.inst = { orgs: [] };
            d.people = d.people || {};
            d.people['p_丙'] = d.people['p_丙'] || { id: 'p_丙', name: '丙' };
            d.people['p_丙'].life = { goals: [], commitments: [], schedule: [] };
          }, 'reject-witness:duty2-reset');
          WA.inst.charter('见证局', { kind: '机关', replace: true });
          // 席位**确实建出来了**（岗在册但无人任职）——不能靠 post 失败意外造出空岗：
          //   那样「不在职」的成因是「组织里根本没岗」，与本码要治的「有岗无人」混成一体。
          WA.inst.post('见证局', '空岗', { perms: ['approve'], replace: true });
          var auD2 = WA.inst.authority('见证局', '丙');
          if (!auD2 || auD2.ok !== true || auD2.inOffice !== false) return [];
          var vD2 = WA.inst.view ? WA.inst.view('见证局') : null;
          if (!(vD2 && vD2.ok === true && vD2.posts && vD2.posts.length === 1)) return [];
          var r = Ns.duty('丙', '见证局', t1);
          if (!(r && r.reason === 'not-in-office')) return [];
          return [r.reason];
        } finally {
          if (Ns.setSettings) Ns.setSettings({ dutyEnabled: keepD2.dutyEnabled !== false });
          if (WA.inst && WA.inst.setSettings) WA.inst.setSettings({ enabled: false });
        }
      });
    }
    // ⑧ v2.143.0（F4）：在岗闸门的两条**非否定**读数。
    //   与既有先例同规格（`omniscient` / `reuse`）：它们以同一词法形状（`reason:'x'`）出现，
    //   按台账规矩必须有归属 —— 要么见证、要么死表。二者都**不是拒收码**：
    //     · `on-duty`  正常归因（在职且此刻在岗，无话可拦）；
    //     · `duty-off` 这一轴被作者关掉（如实报缺席，不是「他不在岗」）。
    //   故走见证而不是死表：它们由真实局面触发，且行为改动必须能让门禁红灯。
    if (Ns && typeof Ns.duty === 'function' && WA.inst && WA.inst.charter) {
      want('on-duty', 'noesis.duty：在职且此刻无日程占住 ⇒ 答 onDuty:true + on-duty（**正常归因，不是拒收码**；与 omniscient 同规格：同一词法形状出现，故必须有归属）');
      trip('on-duty', function () {
        var keepD3 = Ns.getSettings ? Ns.getSettings() : {};
        try {
          if (Ns.setSettings) Ns.setSettings({ enabled: true, dutyEnabled: true });
          if (WA.inst.setSettings) WA.inst.setSettings({ enabled: true });
          var t2 = WA.clock ? WA.clock.now('reject-witness:duty3') : Date.now();
          WA.store.transact(function (d) {
            d.inst = { orgs: [] };
            d.people = d.people || {};
            d.people['p_戊'] = { id: 'p_戊', name: '戊', life: { goals: [], commitments: [], schedule: [] } };
          }, 'reject-witness:duty3-reset');
          WA.inst.charter('见证署', { kind: '机关', replace: true });
          WA.inst.post('见证署', '常驻岗', { perms: ['approve'], replace: true });
          WA.inst.assign('见证署', '常驻岗', '戊', { replace: true });
          var auD3 = WA.inst.authority('见证署', '戊');
          if (!auD3 || auD3.inOffice !== true) return [];
          var r3 = Ns.duty('戊', '见证署', t2);
          if (!(r3 && r3.reason === 'on-duty' && r3.onDuty === true)) return [];
          return [r3.reason];
        } finally {
          if (Ns.setSettings) Ns.setSettings({ dutyEnabled: keepD3.dutyEnabled !== false });
          if (WA.inst && WA.inst.setSettings) WA.inst.setSettings({ enabled: false });
        }
      });
      want('duty-off', 'noesis.duty：本轴（dutyEnabled）被作者关掉 ⇒ 如实报 duty-off（**不回落成「在岗」也不回落成「不在岗」**：「没开这条闸」与「他在不在岗」是两回事，与 range-off 同规格）');
      trip('duty-off', function () {
        var keepD4 = Ns.getSettings ? Ns.getSettings() : {};
        try {
          if (Ns.setSettings) Ns.setSettings({ enabled: true, dutyEnabled: false });
          var r4 = Ns.duty('甲', '见证司');
          if (!(r4 && r4.reason === 'duty-off' && r4.known === false)) return [];
          return [r4.reason];
        } finally {
          if (Ns.setSettings) Ns.setSettings({ dutyEnabled: keepD4.dutyEnabled !== false });
        }
      });
    }
    // ⑨ v2.144.0（F5）新开码 1/2：记忆失真面 —— `distorted`（记着 ≠ 记对）。
    //   治的病：`rumor` 早就记下了 `intact` / `tampered` / `drift` 三个读数，
    //   但它们的**消费方只有作者面**（panel 链详情 / tool-diag 计数），
    //   **裁决面（knows / gateScene / buildBlock）完全不知道「他记的是不是原版」** ——
    //   于是本闸门一路放行：只听过失真版本的人，knows 照样答 known:true。
    //   造场：起一条链 → 甲如实收到（原版）→ 乙以 distort 动机收到（失真版本）。
    //   判据真源不新开：只读 rumor 链上「**他接到的那一跳**」的 intact。
    if (Ns && typeof Ns.fidelity === 'function' && WA.rumor && WA.rumor.startChain) {
      want('distorted', 'noesis.fidelity：此人接到的是**被改写过的版本** ⇒ 答 faithful:false + distorted 并带出 drift（「他记岔了」与「他不该知道」是两回事：一个更正记录，一个拦住发言）');
      trip('distorted', function () {
        var keepF = Ns.getSettings ? Ns.getSettings() : {};
        try {
          if (Ns.setSettings) Ns.setSettings({ enabled: true, fidelityEnabled: true });
          if (WA.rumor.setSettings) WA.rumor.setSettings({ enabled: true });
          if (WA.intel && WA.intel.setSettings) WA.intel.setSettings({ enabled: true });
          // 造场：事实真源走 worldFacts 直写（rumor.factRow 的真源之一）——
          //   memory.upsertFact 需要 memory 先初始化，见证表不依赖那条前置。
          WA.store.transact(function (d) {
            d.worldFacts = [{ key: 'fid失真源', value: '甲见过乙', reason: 'witness', active: true }];
            d.rumor = { chains: [] };
          }, 'reject-witness:fid-reset');
          WA.rumor.startChain('fid失真源', '见证');
          // 第一跳：甲如实收到 ⇒ 甲手里是原版。
          var h1 = WA.rumor.relay('rm_fid失真源', { from: '源头', to: '甲', motive: 'honest' });
          if (!(h1 && h1.ok === true)) return [];
          // 第二跳：乙以 distort 收到 ⇒ 乙手里是被改写过的版本（**改写在传给他这一跳上发生**）。
          var h2 = WA.rumor.relay('rm_fid失真源', { from: '甲', to: '乙', motive: 'distort', value: '乙听说甲见过丙' });
          if (!(h2 && h2.ok === true)) return [];
          // 造场自证：链级 intact 已为假（累积值），但**甲的那一跳仍为真** ——
          //   这正是本面存在的理由：拿链级累积值答个人版本会误判。
          var rJia = Ns.fidelity('甲', 'fid失真源');
          if (!(rJia && rJia.known === true && rJia.faithful === true)) return [];
          var rYi = Ns.fidelity('乙', 'fid失真源');
          if (!(rYi && rYi.known === true && rYi.faithful === false && rYi.reason === 'distorted')) return [];
          if (!(rYi.drift && rYi.drift.to === '乙听说甲见过丙')) return [];
          return [rYi.reason];
        } finally {
          if (Ns.setSettings) Ns.setSettings({ fidelityEnabled: keepF.fidelityEnabled !== false });
          if (WA.rumor && WA.rumor.setSettings) WA.rumor.setSettings({ enabled: false });
        }
      });
      want('faithful', 'noesis.fidelity：此人接到的是**原版** ⇒ 答 faithful:true + faithful（**正常归因，不是拒收码**；与 omniscient / on-duty 同规格：同一词法形状出现，故必须有归属）');
      trip('faithful', function () {
        var keepF2 = Ns.getSettings ? Ns.getSettings() : {};
        try {
          if (Ns.setSettings) Ns.setSettings({ enabled: true, fidelityEnabled: true });
          if (WA.rumor.setSettings) WA.rumor.setSettings({ enabled: true });
          if (WA.intel && WA.intel.setSettings) WA.intel.setSettings({ enabled: true });
          WA.store.transact(function (d) {
            d.worldFacts = [{ key: 'fid原版源', value: '甲见过丁', reason: 'witness', active: true }];
            d.rumor = { chains: [] };
          }, 'reject-witness:fid2-reset');
          WA.rumor.startChain('fid原版源', '见证');
          var h3 = WA.rumor.relay('rm_fid原版源', { from: '源头', to: '庚', motive: 'honest' });
          if (!(h3 && h3.ok === true)) return [];
          var rG = Ns.fidelity('庚', 'fid原版源');
          if (!(rG && rG.known === true && rG.faithful === true && rG.reason === 'faithful')) return [];
          return [rG.reason];
        } finally {
          if (Ns.setSettings) Ns.setSettings({ fidelityEnabled: keepF2.fidelityEnabled !== false });
          if (WA.rumor && WA.rumor.setSettings) WA.rumor.setSettings({ enabled: false });
        }
      });
      want('fidelity-off', 'noesis.fidelity：本轴（fidelityEnabled）被作者关掉 ⇒ 如实报 fidelity-off（**不回落成「他记的是原版」**：「没开这条闸」与「他记对了」是两回事，与 duty-off / range-off 同规格）');
      trip('fidelity-off', function () {
        var keepF3 = Ns.getSettings ? Ns.getSettings() : {};
        try {
          if (Ns.setSettings) Ns.setSettings({ enabled: true, fidelityEnabled: false });
          var r5 = Ns.fidelity('甲', 'fid失真源');
          if (!(r5 && r5.reason === 'fidelity-off' && r5.known === false && r5.faithful === null)) return [];
          return [r5.reason];
        } finally {
          if (Ns.setSettings) Ns.setSettings({ fidelityEnabled: keepF3.fidelityEnabled !== false });
        }
      });
      want('not-on-chain', 'noesis.fidelity：此人**不在该事实的传播链上**（没接到过）⇒ 如实报 not-on-chain（问不出来不等于问出来是原版：他压根没听过这件事，谈不上「他手里是哪一版」）');
      trip('not-on-chain', function () {
        var keepF4 = Ns.getSettings ? Ns.getSettings() : {};
        try {
          if (Ns.setSettings) Ns.setSettings({ enabled: true, fidelityEnabled: true });
          if (WA.rumor.setSettings) WA.rumor.setSettings({ enabled: true });
          WA.store.transact(function (d) {
            d.worldFacts = [{ key: 'fid旁观源', value: '甲见过戊', reason: 'witness', active: true }];
            d.rumor = { chains: [] };
          }, 'reject-witness:fid3-reset');
          WA.rumor.startChain('fid旁观源', '见证');
          var h4 = WA.rumor.relay('rm_fid旁观源', { from: '源头', to: '辛', motive: 'honest' });
          if (!(h4 && h4.ok === true)) return [];
          var rZ = Ns.fidelity('壬', 'fid旁观源');
          if (!(rZ && rZ.known === false && rZ.reason === 'not-on-chain')) return [];
          return [rZ.reason];
        } finally {
          if (Ns.setSettings) Ns.setSettings({ fidelityEnabled: keepF4.fidelityEnabled !== false });
          if (WA.rumor && WA.rumor.setSettings) WA.rumor.setSettings({ enabled: false });
        }
      });
    }
  }
  //   本版四个新字面量全部**由真实局面触发**，故按台账规矩走见证、不进基线。
  //   本表与回归共用同一个 vm 全局与同一份世界存储 —— 前面几十个块留下的 perspective.rows
  //   会让「一行都没登记」这个前提当场不成立（实测首版就是这个形态：no-scene 静默落进 missing）。
  //   判据要的场必须自己造；环境的不确定性不是判据的一部分。
  {
    const Pv = WA.perspective;
    if (Pv && typeof Pv.assign === 'function') {
      if (WA.store && WA.store.transact) {
        WA.store.transact(function (d) { d.perspective = { rows: [] }; }, 'reject-witness:perspective-reset');
      }
      const keepP = Pv.getSettings ? Pv.getSettings() : {};
      if (Pv.setSettings) Pv.setSettings({ enabled: true });
      // ① 自造视角 ⇒ 拒收，并把可选表带出（自造视角等于自造判定）
      want('bad-lens', 'perspective.assign：视角名不在 LENSES 五档里 ⇒ bad-lens + allowed（自造视角等于自造判定，下一手无从接手）');
      trip('bad-lens', function () {
        return [Pv.assign('见证幕一', '上帝视角', ['甲']).reason];
      });
      // ② 一行都没登记就问「当前视角」⇒ no-scene，**不回落成全知**
      //    （「没登记」与「随便写」是两件事：前者要作者先划边界，后者是放任）
      want('no-scene', 'perspective.current：一处视角都没登记 ⇒ no-scene（不回落成全知——「没登记」与「随便写」是两件事）');
      trip('no-scene', function () {
        if (WA.store && WA.store.transact) {
          WA.store.transact(function (d) { d.perspective = { rows: [] }; }, 'reject-witness:perspective-clear');
        }
        return [Pv.current().reason];
      });
      if (typeof Pv.allows === 'function') {
        // ③ 内心闸：三条不同的 via，**不可合并** —— 三种处置完全不同
        //   （补共视角 / 换视角档 / 换取证档）
        want('interior-blocked', 'perspective.allows：内心腔只属于视角人物本人 —— 不在视角里的人写内心 / 客观镜头写内心 / 用推断档冒充心声，三者各自拒收并带 via');
        trip('interior-blocked', function () {
          if (WA.store && WA.store.transact) {
            WA.store.transact(function (d) { d.perspective = { rows: [] }; }, 'reject-witness:perspective-clear2');
          }
          const outs = [];
          Pv.assign('见证幕甲', 'first', ['甲']);
          outs.push(Pv.allows({ who: '乙', channel: 'interior', access: 'witnessed' }).reason);   // via: not-pov
          Pv.assign('见证幕乙', 'camera', [], { replace: true });
          outs.push(Pv.allows({ who: '甲', channel: 'interior', access: 'witnessed' }).reason);   // via: objective
          Pv.assign('见证幕丙', 'limited', ['甲'], { replace: true });
          outs.push(Pv.allows({ who: '甲', channel: 'interior', access: 'inferred' }).reason);    // via: access
          return outs;
        });
        // ③b 「在不在视角里」：第一/有限视角下，镜头外的人不能用叙述腔交代
        //   （**与内心闸不可合并**：内心是「渠道不许」，这里是「人不在场」——补共视角与换渠道是两种处置）
        want('out-of-lens', 'perspective.allows：此人不在本视角里（第一/有限档）⇒ out-of-lens + pov 名单（补共视角，或换一个场景视角）');
        trip('out-of-lens', function () {
          Pv.assign('见证幕外', 'first', ['甲'], { replace: true });
          return [Pv.allows({ who: '乙', channel: 'narrator', access: 'witnessed' }).reason];
        });
        // ④ 全知场景下的一笔：**正常归因**（按作者视角放行），不是拒收
        //   —— 同 v2.102.0 的 `reuse`：以同一词法形状出现，故按「有归属」处理并带见证。
        want('omniscient', 'perspective.allows：全知档下任何笔都放行 ⇒ reason:omniscient（正常归因，不是拒收码；作者视角是唯一的例外）');
        trip('omniscient', function () {
          Pv.assign('见证幕全知', 'omniscient', ['甲'], { replace: true });
          const r = Pv.allows({ who: '乙', channel: 'interior', access: 'inferred' });
          return [r.reason];
        });
      }
      if (Pv.setSettings) Pv.setSettings({ enabled: keepP.enabled !== false });
    }
  }
  // ══ v2.148.0（RP1+RP2）：性能台账与磁带仓库暴露的码 ══
  //   两个新模块的内联字面量里，有五个是**扫描面上此前没有归属**的（`type` 是共享码，
  //   但本版是它第一次被登记——此前产品面里没有任何一处内联 `reason: 'type'`）。
  //   五码全部**由真实局面触发**（参数传错 / 源数超限 / 卷版本不同 / 空卷 / 查无此号），
  //   不是结构上不可达的分支 ⇒ 按台账规矩走见证、不进基线。
  //   一条边界（本段最要紧的判断）：`tape-version-mismatch`（格式版本不同 ⇒ 不做迁移器）
  //   与 `bad-tape`（行面读不了）**绝不可合成一个「用不了」** —— 前者是「格式换代了」，
  //   后者是「这一卷本身坏了」，处置一个是等迁移器、一个是重录，合成即让两者在读数上
  //   长得一样。
  {
    const Pl = WA.perfLedger, Tp = WA.tapeStore;
    if (Pl && typeof Pl.ingest === 'function') {
      // ① 参数类型违约：批次级（非对象入参 / 非数轮次）与样本级（负数 ms / 空名）都要如实拒收。
      //   见证只走**产品导出面**（`ingest` / `stat`）——`record` 是内部实现，
      //   拿内部口去见证等于测了实现细节而不是契约（上一版见证段就因调 record 而整块静默跳过）。
      want('type', 'perfLedger 收数口的参数类型违约如实拒收并带 field（批次级与样本级同一码：同一件事不立两本账）（v2.148.0 RP1）');
      trip('type', function () {
        const out = [Pl.ingest(null).reason, Pl.ingest('x').reason,
          Pl.ingest({ 'z': { ms: 5 } }, 'z').reason];   // 批次级三态
        const t0 = (Pl.stat().skipReasons || {})['type'] || 0;
        Pl.ingest({ '负一': { ms: -1 } });              // 样本级：负数 → record 拒 → 归因表记 type
        Pl.ingest({ '': { ms: 5 } });                    // 样本级：空名
        if (((Pl.stat().skipReasons || {})['type'] || 0) - t0 === 2) out.push('type');
        return out;
      });
      // ② 源数上限：台账是**有界面**，不登记就等于允许它随世界长大而无限膨胀
      want('source-cap', 'perfLedger 源数超 CAP_KNOWN 时如实拒收（台账是有界面，不许随世界长大而膨胀）（v2.148.0 RP1）');
      trip('source-cap', function () {
        const cap = Pl.stat().caps.known;
        const free = cap - Pl.stat().sources;   // 已存在的源不占新槽
        for (let i = 0; i < free + 4; i++) Pl.ingest((function () { const o = {}; o['__cap_' + i] = { ms: 1 + i }; return o; })(), i);
        return ((Pl.stat().skipReasons || {})['source-cap'] || 0) > 0 ? ['source-cap'] : ['no-cap-hit'];
      });
    }
    if (Tp && typeof Tp.save === 'function') {
      // ③ 格式版本不同 ⇒ 如实拒收（本版不做迁移器），**且不落盘**
      want('tape-version-mismatch', 'tapeStore.save：卷的 formatVersion 与本仓不同 ⇒ 如实拒收并不落盘（本版不做迁移器；与 bad-tape「这一卷本身坏了」是两回事）（v2.148.0 RP2）');
      trip('tape-version-mismatch', function () {
        const before = Tp.list().total;
        const r = Tp.save({ format: 'worldaxis.rand.tape', formatVersion: 99, seed: 1,
          rows: [{ c: 'x', v: 1, k: 'd', n: 1, r: null, s: null }] });
        const after = Tp.list().total;
        if (!(r.ok === false && r.reason === 'tape-version-mismatch' && after === before)) return [];
        return [r.reason];
      });
      // ④ 空卷拒收：存一卷「零格」等于往仓库里塞一个查不出问题、也用不上的东西
      want('empty-tape', 'tapeStore.save：rows 为空数组 ⇒ 如实拒收（存一卷零格 = 仓库里多一个既查不出问题也用不上的东西）（v2.148.0 RP2）');
      trip('empty-tape', function () {
        const r = Tp.save({ format: 'worldaxis.rand.tape', formatVersion: 1, seed: 1, rows: [] });
        return [r.reason];
      });
      // ⑤ 查无此号：按号取回 / 按号删除都要如实答「没有这一卷」，不静默成功
      want('no-such-vol', 'tapeStore.load/drop：仓库里没有该 id ⇒ 如实拒答（不静默成功、不返回空卷）（v2.148.0 RP2）');
      trip('no-such-vol', function () {
        return [Tp.load('t0_不存在').reason, Tp.drop('t0_不存在').reason];
      });
      // ⑤b 同上两口的参数类型违约（与 perfLedger 共用一个 `type` 码：同一件事不立两本账）
      want('type', 'perfLedger 收数口与 record 的参数类型违约如实拒收并带 field（v2.148.0 RP1）');
      trip('type', function () {
        return [Tp.load(123).reason, Tp.drop(null).reason];
      });
    }
  }
  // ══ v2.150.0（RP4）：注入价值评估暴露的四个拒答码 ══
  //   四码**全部由真实局面触发**（空观测 / 无待结算读数 / 正文过短 / 轮次不符），
  //   不是结构上不可达的分支 ⇒ 按台账规矩走见证、**不进基线**。
  //   一条边界（本段最要紧的判断）：四码绝不可合成一个「没结算」——
  //     「cafe没收到注入」（empty-observation）、「这一轮压根没观察过」（no-reading）、
  //     「正文太短量不出来」（text-too-short）、「拿到的是别的轮的正文」（stale-round）
  //     四种处置互不相同：前三者分别要改注入面 / 等下一轮 / 等正文长起来，后者是程序顺序事。
  //   另一条如实边界：本模块的 stale-round 判定以 `store.lastInjection.round` 为当前轮真源（与
  //     render/inject.js 同源），`currentRound()` 读不到时返 0；而 0 在判据里是假值
  //     ⇒ 那一格下**不做比对**（宁可放行不可误报）。故见证必须先把
  //     `lastInjection.round` 置成真值，再用**显式轮次**观察，两边才会真比。
  {
    const Iv = WA.injectValue;
    if (Iv && typeof Iv.settle === 'function' && typeof Iv.observe === 'function') {
      const LONG = '北方大军压境的传闻，街上立刻安静了下来，BloodHand 的旗子升起。';
      const prevOn = (typeof Iv.getSettings === 'function' ? Iv.getSettings() : {}).enabled;
      if (Iv.setSettings) Iv.setSettings({ enabled: true });   // 关着的话四码全被 disabled 抢先
      // ① 参数类型违约（两端口）
      //   type 是共享码（perfLedger 段 v2.148.0 已登记），本段**重申声**以标明本模块的触发面：
      //   声明面重复计数会 +1（带字段 field），该计数无判据拦截（读数在 v2.107.0 段当场打出）。
      want('type', 'injectValue 观察口（items 非数组）与结算口（text 非字符串）的参数类型违约如实拒收并带 field（v2.150.0 RP4）');
      trip('type', function () {
        return [Iv.observe(null).reason, Iv.observe({}).reason, Iv.settle(123).reason, Iv.settle(null).reason];
      });
      // ② 空观测：观察面在场（items 是数组）但这一轮零源
      want('empty-observation', 'injectValue.settle：本轮观察到的源数为 0 ⇒ 如实拒答（不把「没收到东西」判成「都没被引用」）（v2.150.0 RP4）');
      trip('empty-observation', function () {
        Iv.observe({ round: 0, items: [] });
        return [Iv.settle(LONG).reason];
      });
      // ③ 无待结算读数：上一笔已被消费（此刻 _pending 为空）
      want('no-reading', 'injectValue.settle：没有待结算的观察 ⇒ 如实拒答（不拿别的轮次凑数）（v2.150.0 RP4）');
      trip('no-reading', function () { return [Iv.settle(LONG).reason]; });
      // ④ 正文过短：空读数不当判据
      want('text-too-short', 'injectValue.settle：正文短于下限 ⇒ 如实拒答（空读数不是「零引用」）（v2.150.0 RP4）');
      trip('text-too-short', function () {
        Iv.observe({ round: 0, items: [{ source: '仇敌', content: '北方大军压境 BloodHand 盘踞城东' }] });
        return [Iv.settle('短').reason];
      });
      // ⑤ 轮次不符：先把当前轮置成真值 9，再用显式轮次 5 观察 ⇒ 两边才会真比
      want('stale-round', 'injectValue.settle：观察轮次与当前轮次不符 ⇒ 如实拒答（拿别的轮的正文凑数会让每轮读数都不成立）（v2.150.0 RP4）');
      trip('stale-round', function () {
        WA.store.transact(function (d) { d.lastInjection = { round: 9, len: 0, sources: [] }; });
        Iv.observe({ round: 5, items: [{ source: '仇敌', content: '北方大军压境' }] });
        return [Iv.settle(LONG).reason];
      });
      if (Iv.setSettings) Iv.setSettings({ enabled: prevOn !== false });
    }
  }
  // ══ v2.151.0（RX2+RX3）：跨会话离线结算 + 远方脉搏新增码 ══
  //   只声明产品扫描面新增的十一个码；bad-value / missing-fields / disabled /
  //   store-unavailable / no-draft 等共享码由既有声明承担，避免重复计入恒等式。
  {
    const Ot = WA.offlineTick, Ff = WA.farfield;
    if (Ot && Ff) {
      const keepOt2151 = Ot.getSettings(), keepFf2151 = Ff.getSettings();
      Ot.setSettings(Object.assign({}, keepOt2151, { enabled: true }));
      Ff.setSettings(Object.assign({}, keepFf2151, { enabled: true }));
      want('anchors-full', 'offlineTick.anchor：活动锚达到配置上限后拒收新锚（v2.151.0 RX2）');
      trip('anchors-full', function () {
        const keep = Ot.getSettings(); Ot.setSettings(Object.assign({}, keep, { enabled: true, maxAnchors: 4 }));
        try {
          WA.store.transact(function (d) { d.offlineTick = { anchors: [], batches: [], skips: [], lastSettledAt: null, rounds: 0 }; }, 'reject-witness:v2151-offline-cap-reset');
          for (let i = 0; i < 4; i++) Ot.anchor('__rw2151_' + i, { kind: 'task' });
          return [Ot.anchor('__rw2151_over', { kind: 'pact' }).reason];
        } finally { Ot.setSettings(keep); }
      });
      want('unknown-anchor', 'offlineTick.release：释放不存在的记忆锚明确拒收（v2.151.0 RX2）');
      trip('unknown-anchor', function () { return [Ot.release('__rw2151_missing').reason]; });
      want('no-elapsed', 'offlineTick.tick：离线间隔为零时不伪装为一次结算（v2.151.0 RX2）');
      trip('no-elapsed', function () {
        Ot.setSettings(Object.assign({}, Ot.getSettings(), { enabled: true }));
        const d = { offlineTick: { anchors: [], batches: [], skips: [], lastSettledAt: 1700000000000, rounds: 0 } };
        return [Ot.tick(d, { now: 1700000000000 }).reason];
      });
      want('too-short', 'offlineTick.tick：低于 minGapMs 的短间隔与零间隔分开归因（v2.151.0 RX2）');
      trip('too-short', function () {
        const keep = Ot.getSettings(); Ot.setSettings(Object.assign({}, keep, { enabled: true, minGapMs: 1000 }));
        try { const d = { offlineTick: { anchors: [], batches: [], skips: [], lastSettledAt: 1700000000000, rounds: 0 } }; return [Ot.tick(d, { now: 1700000000500 }).reason]; }
        finally { Ot.setSettings(keep); }
      });
      want('no-batch', 'offlineTick.summary：尚无离线批次时拒绝伪造空摘要（v2.151.0 RX2）');
      trip('no-batch', function () {
        WA.store.transact(function (d) { d.offlineTick = { anchors: [], batches: [], skips: [], lastSettledAt: null, rounds: 0 }; }, 'reject-witness:v2151-offline-summary-reset');
        return [Ot.summary().reason];
      });
      want('apply-throw', 'offlineTick.tick：逐轮推演回调异常如实记入故障读数（v2.151.0 RX2）');
      trip('apply-throw', function () {
        const d = { offlineTick: { anchors: [], batches: [], skips: [], lastSettledAt: 1700000000000, rounds: 0 } };
        Ot.tick(d, { now: 1700000000000 + 3600000, apply: function () { throw new Error('controlled witness'); } });
        return Object.keys(Ot.stat().faults || {}).filter(function (k) { return k === 'apply-throw' && Ot.stat().faults[k] > 0; });
      });
      want('no-far', 'farfield.tick：没有登记远方地区时不虚构脉搏（v2.151.0 RX3）');
      trip('no-far', function () {
        const keep = Ff.getSettings(); Ff.setSettings(Object.assign({}, keep, { enabled: true }));
        try { WA.region.setSettings({ enabled: true }); WA.store.transact(function (d) { d.region = { places: [], events: [] }; }, 'reject-witness:v2151-far-reset');
          const d = { farfield: { pulses: [], pending: [], heard: [], lastTickAt: 1700000000000, rounds: 0 } };
          return [Ff.tick(d, { now: 1700000000000 + 86400000 }).reason]; }
        finally { Ff.setSettings(keep); }
      });
      want('too-early', 'farfield.deliver：未到路程推算的到期时刻不得提前送达（v2.151.0 RX3）');
      trip('too-early', function () {
        const keep = Ff.getSettings(); Ff.setSettings(Object.assign({}, keep, { enabled: true }));
        try { const d = { farfield: { pulses: [], pending: [{ id: 'rw2151', place: '远方', trend: 'war', at: 2000, dueAt: 9000, delayDays: 1, deliveredAt: 0 }], heard: [], lastTickAt: 1, rounds: 0 } }; return [Ff.deliver(d, { now: 8000 }).reason]; }
        finally { Ff.setSettings(keep); }
      });
      want('unknown-pulse', 'farfield.settlePulse：地点脉搏不存在时拒绝沉积（v2.151.0 RX3）');
      trip('unknown-pulse', function () { return [Ff.settlePulse('rw2151-no-pulse').reason]; });
      want('sediment-absent', 'farfield.settlePulse：明确挂号的沉积消费者缺席时如实拒绝（v2.151.0 RX3）');
      trip('sediment-absent', function () {
        const keep = Ff.getSettings(), old = WA.sediment; Ff.setSettings(Object.assign({}, keep, { enabled: true }));
        try { WA.store.transact(function (d) { d.farfield = { pulses: [{ id: 'rw2151-pulse', place: '远方', trend: 'war', label: '兵戈', at: 1, sedimentPending: true }], pending: [], heard: [], lastTickAt: 1, rounds: 0 }; }, 'reject-witness:v2151-sediment-seed');
          WA.sediment = null; return [Ff.settlePulse('rw2151-pulse').reason]; }
        finally { WA.sediment = old; Ff.setSettings(keep); }
      });
      want('unknown-message', 'farfield.relayToRumor：在途或不存在的消息不能转交传闻链（v2.151.0 RX3）');
      trip('unknown-message', function () { return [Ff.relayToRumor('rw2151-unheard', { factKey: 'rw2151-fact' }).reason]; });
      want('rumor-absent', 'farfield.relayToRumor：已有听闻但 rumor 消费者缺席时明确拒绝（v2.151.0 RX3）');
      trip('rumor-absent', function () {
        const keep = Ff.getSettings(), old = WA.rumor; Ff.setSettings(Object.assign({}, keep, { enabled: true }));
        try { WA.store.transact(function (d) { d.farfield = { pulses: [], pending: [], heard: [{ id: 'rw2151-heard', place: '远方', trend: 'war', at: 1, deliveredAt: 2, said: '兵戈', distorted: true }], lastTickAt: 1, rounds: 0 }; }, 'reject-witness:v2151-rumor-seed');
          WA.rumor = null; return [Ff.relayToRumor('rw2151-heard', { factKey: 'rw2151-fact' }).reason]; }
        finally { WA.rumor = old; Ff.setSettings(keep); }
      });
      Ot.setSettings(keepOt2151);
      Ff.setSettings(keepFf2151);
    }
  }

  // ══ v2.157.0（SP4 + S2）：farfield 新增的四个拒收码 ══
  //   四个都由**真实局面**触发（在途满、转移包超容量、auto 未开、世界钟未设定），
  //   按台账规矩走**可执行见证**、不进基线。桩一律在 finally 里还原；远场桶用前
  //   快照、用后还原 —— 本段跑在真 run.js 里，给后面的段留下一个被改过的世界是越界。
  {
    const Ff = WA.farfield, Rg = WA.region;
    if (Ff && typeof Ff.auto === 'function' && Rg) {
      const keepFf = Ff.getSettings(), keepRg = Rg.getSettings();
      const snap = JSON.parse(JSON.stringify((WA.store.get() || {})));
      const DAY = 86400000;
      try {
        Rg.setSettings({ enabled: true });
        // auto-off：总开关开着而自动门关着 ⇒ 两个码分列（关闭 / 自动未开）
        want('auto-off', 'farfield.auto：总开关开着而自动推进未开 ⇒ 拒收 auto-off（与 disabled 分列：一个是意图，一个是没要求）');
        trip('auto-off', function () {
          Ff.setSettings(Object.assign({}, Ff.getSettings(), { enabled: true, auto: false }));
          const d = {};
          return [Ff.auto(d, { day: 2 }).reason];
        });
        // no-clock：世界钟未设定 ⇒ 不猜日期
        want('no-clock', 'farfield.auto：世界钟未设定 ⇒ 拒收 no-clock（不拿真实时间顶替剧情时间）');
        trip('no-clock', function () {
          Ff.setSettings(Object.assign({}, Ff.getSettings(), { enabled: true, auto: true }));
          WA.store.transact(function (d) { d.clock = { iso: '', label: '', dayIndex: 0, source: 'unset' };
            d.farfield = { pulses: [], pending: [], heard: [], lastTickAt: null, rounds: 0, autoDay: null, autoAt: null, autoReason: '' }; }, 'reject-witness:v2157-noclock');
          const d = {};
          return [Ff.auto(d, {}).reason];
        });
        // 注：farfield 的在途背压用的是 skipped 里的 `why: 'pending-full'`（**不是** `reason:`），
        //   故扫描面本来就不把它算成一个内联拒收码 —— 它由专锁 sp4-s2-v2157 的行为判据锁住；
        //   而 `pending-full` 这个**字符串**另有 inst.js / spotlight.js 的真见证，见基线台账。
        // too-many：转移包整批拒收
        want('too-many', 'farfield.transferPack：一次转述包超过容量 ⇒ 整批拒收 too-many（不做部分交付）');
        trip('too-many', function () {
          Ff.setSettings(Object.assign({}, Ff.getSettings(), { enabled: true, capTransfer: 2 }));
          return [Ff.transferPack({ max: 3 }).reason];
        });
      } finally {
        Ff.setSettings(keepFf); Rg.setSettings(keepRg);
        try { WA.store.transact(function (d) { Object.keys(snap).forEach(function (k) { d[k] = snap[k]; }); }, 'reject-witness:v2157-restore'); } catch (e) {}
      }
    }
  }
  // ══ v2.152.0（RP6+RP7）：面板渲染观测 + 存储水位预测新增码 ══
  //   六个码全部由真实局面触发，按台账规矩走**可执行见证**、**不进基线**：
  //     · ui/render-perf.js（RP6）：unknown-page / pages-full；
  //     · engines/storage-forecast.js（RP7）：no-bytes / non-monotonic /
  //       insufficient-samples / flat-rounds。
  //   两条边界（本段最要紧的判断）：
  //     ① `unknown-page`（页 id 不在白名单）与 `pages-full`（页数到顶）**绝不可合成一个「收不了」**
  //       —— 前者要改调用方传的页名，后者要扩 CAP_PAGES 或分窗；合成即让两种处置在读数上长得一样。
  //     ② `insufficient-samples`（还没攒够样本）与 `flat-rounds`（样本够但解不出斜率）同理，
  //       绝不可合成一个「算不出」—— 前者要等采够，后者是数值退化（判据 `n*sxx - sx*sx === 0`），
  //       处置一个是等、一个是改采样点；合成即让「等下一轮」与「这组样本废了」不可分。
  //   一条如实口径：UI 层模块**不在 run.js 的 LOAD 里**（LOAD 刻意不含 ui/*），故 RP6 两码
  //     与 B6 那五条 UI 码同规格，走 ui-gate-sync.fresh()（真装载 ui/* + mini-DOM）；
  //     RP7 是引擎层（engines/storage-forecast.js 在 LOAD 内），直接用传入的 WA。
  {
    const Sf = WA.storageForecast;
    if (Sf && typeof Sf.sample === 'function') {
      const keepSf = Sf.getSettings();
      Sf.setSettings(Object.assign({}, keepSf, { enabled: true }));
      want('no-bytes', 'storageForecast.sample：store 的体积读数取不到 ⇒ 拒收（不把「量不出来」记成 0 字节）（RP5）');
      trip('no-bytes', function () {
        const old = WA.store;
        try { WA.store = {}; return [Sf.sample(1).reason]; }
        finally { WA.store = old; }
      });
      want('non-monotonic', 'storageForecast.sample：本轮次不大于已入环的末次轮 ⇒ 拒收（序列无序即趋势无意义）（RP5）');
      trip('non-monotonic', function () {
        Sf.reset(); Sf.sample(5);
        return [Sf.sample(3).reason];
      });
      want('insufficient-samples', 'storageForecast.forecast：样本数低于 minSamples ⇒ 拒收（绝不拿两个点外推出「还能玩一万轮」）（RP5）');
      trip('insufficient-samples', function () { Sf.reset(); return [Sf.forecast().reason]; });
      // 数值退化：样本够但最小二乘分母恰为 0（n*sxx - sx*sx === 0）。
      //   造法走**超大轮次 + 可表示步长**：轮数数量级一大，乘积项把差吃掉 ⇒ d 恰为 0。
      //   为什么不用「字节数一直不变」造：那让斜率恰为 0 而 d !== 0 ⇒ 返回 ok:true，是**假见证**
      //   （实测 base=1e16/step=2 与 base=1e15/step=2 都落到那条，只有 step>=8 才真退化）。
      want('flat-rounds', 'storageForecast.forecast：样本够但最小二乘分母为零（数值退化，解不出斜率）⇒ 拒收（RP5）');
      trip('flat-rounds', function () {
        Sf.reset();
        const base = 1e16;
        for (let i = 0; i < 8; i++) { const r = Sf.sample(base + i * 64); if (!r.ok) return []; }
        return [Sf.forecast().reason];
      });
      Sf.reset();
      Sf.setSettings(keepSf);
    }
    // ── ui/render-perf.js（RP4）：两个码只在面板渲染链上产生 ──
    {
      const uiGate2 = require('./ui-gate-sync.js');
      const W3 = uiGate2.fresh().WA;
      const Rp = W3.renderPerf;
      want('unknown-page', 'renderPerf.observe：页 id 不在 WA.ui.pages() 白名单内 ⇒ 拒收并带出允许集（RP4）');
      want('pages-full', 'renderPerf.observe：已观测页数达 CAP_PAGES 上限且是新页 ⇒ 拒收（RP4）');
      if (Rp && typeof Rp.observe === 'function') {
        const keepRp = Rp.getSettings();
        const keepPages = W3.ui && W3.ui.pages;
        Rp.setSettings(Object.assign({}, keepRp, { enabled: true }));
        trip('unknown-page', function () { return [Rp.observe('__rw2152_no_such_page', 1).reason]; });
        // 页数到顶：把页源换成 30 页的探针表 ⇒ CAP_PAGES(24) 之后的新页如实拒收。
        //   为什么打桩是正当的：白名单本来就是**运行时依赖**（WA.ui.pages()），本仓对它的口径是
        //   「读运行时真源、不存副本」——打桩改的是输入面，判据与守卫一行未动。
        trip('pages-full', function () {
          if (!(W3.ui && typeof W3.ui.pages === 'function')) return [];
          const fake = []; for (let i = 0; i < 30; i++) fake.push('__rw2152_p' + i);
          try {
            W3.ui.pages = function () { return fake.slice(); };
            Rp.reset();
            const hit = [];
            for (let i = 0; i < 30; i++) { const r = Rp.observe('__rw2152_p' + i, 1, 1); if (r.reason) hit.push(r.reason); }
            return hit;
          } finally { if (keepPages) W3.ui.pages = keepPages; Rp.reset(); }
        });
        Rp.setSettings(keepRp);
      }
    }
  }
  // ══ v2.153.0（RX5+RX6）：剧情深度仪 + 多结局分支树新增码 ══
  //   四个码全部由真实局面触发，按台账规矩走**可执行见证**、**不进基线**：
  //     · engines/plot-gauge.js（RX5）：无新增未分类码（no-signal / no-reading 已在既有面归位）；
  //     · engines/branch-tree.js（RX6）：no-options / branches-full / not-comparable / rehearsal-absent。
  //   两条边界（本段最要紧的判断）：
  //     ① `no-options`（走法不足两条）与 `branches-full`（节点数到顶）**绝不可合成一个「收不了」**
  //       —— 前者要补走法（一条走法的「分叉」是流水账），后者要扩 maxNodes 或另起一局；
  //       合成即让「这不是分叉」与「这局满了」在读数上长得一样。
  //     ② `not-comparable`（没得比）与「比出来不一样」同理：前者要先把预览钉下来，
  //       后者才是真差异；合成即让「无从判定」冒充「判定为不同」。
  {
    const Bt = WA.branchTree;
    if (Bt && typeof Bt.fork === 'function') {
      const keepBt = Bt.getSettings();
      try {
        Bt.setSettings(Object.assign({}, keepBt, { enabled: true, maxNodes: 40, maxOptions: 6 }));
        want('no-options', 'branchTree.fork：可选走法不足两条 ⇒ 拒收（一条走法的「选择」不是分叉，是流水账）（RX6）');
        trip('no-options', function () {
          return [Bt.fork({ round: 1, prompt: 'rw2153-只有一个走法', options: ['唯一'] }).reason];
        });
        want('branches-full', 'branchTree.fork：节点数达 maxNodes 上限 ⇒ 拒收（长局不许无界膨胀）（RX6）');
        trip('branches-full', function () {
          const keep2 = Bt.getSettings();
          try {
            Bt.setSettings(Object.assign({}, keep2, { enabled: true, maxNodes: 2 }));
            Bt.fork({ round: 1, prompt: 'rw2153-a', options: ['x', 'y'] });
            Bt.fork({ round: 2, prompt: 'rw2153-b', options: ['x', 'y'] });
            return [Bt.fork({ round: 3, prompt: 'rw2153-c', options: ['x', 'y'] }).reason];
          } finally { Bt.setSettings(keep2); }
        });
        want('not-comparable', 'branchTree.replay：该分叉点没有可回放的预览 ⇒ 如实报不可比（不拿旧结论冒充可以回放）（RX6）');
        trip('not-comparable', function () {
          // 不传 steps ⇒ 没有预览（这正是「零自动登记」的日常形态：分叉点记下了，但没预演过）
          const f = Bt.fork({ round: 4, prompt: 'rw2153-没预演过', options: ['甲', '乙'] });
          return [Bt.replay(f.id).reason];
        });
        want('rehearsal-absent', 'branchTree.fork：预演层缺席时如实标 rehearsal-absent（不假装预演过）（RX6）');
        trip('rehearsal-absent', function () {
          const old = WA.rehearsal;
          try {
            WA.rehearsal = null;
            const f = Bt.fork({ round: 5, prompt: 'rw2153-预演层缺席', options: ['甲', '乙'],
              steps: [{ kind: 'wait', who: '甲', ms: 1000 }] });
            return [f.preview && f.preview.reason];
          } finally { WA.rehearsal = old; }
        });
      } finally { Bt.setSettings(keepBt); }
    }
  }
  // ══ v2.154.0（RX4+RX7）：世界联网面 + 世界生态自洽审计新增码 ══
  //   本段与前面各段同规矩：新增的字面量全部由**真实局面**触发，走可执行见证、不进基线。
  //
  //   一条如实边界（本版最要紧的归类判断）：两个新引擎里的「码」其实分属**两个不同家族**——
  //     · 第一家族是**拒收码**（`return { ok:false, reason:'x' }`）：本次 10 个。它们是扫描面的
  //       词法面（`reason: 'x'`）认得的东西，故必须在这里跑出来；
  //     · 第二家族是**审计议题码**（`push('x', cat, row)` 进 issues[]）：本次 7 个
  //       （link-after / clock-backward / schedule-overlap / knowledge-beyond / cause-broken /
  //       orphan-effect / section-failed）。它们是「世界的读数」，不是「接口的拒收」：
  //       调用方拿到的是一张问题清单，其中每条自带码/类别/级别/明细。
  //       两者的处置完全不同（拒收要改调用、议题要改世界），**绝不可为了凑台账把它们合成一类**——
  //       合成就会让「你传错了参数」与「你的世界里前后对不上」在读数上长得一样。
  //       议题码由 tests/eco-audit-v2154.js 的 B7–B16 逐条可执行见证兜底，
  //       并由本版新增的反污染断言钉住「它们不得改走 reason: 通道」（否则会从扫描面漏过去）。
  {
    const Wb = WA.worldBridge;
    if (Wb && typeof Wb.exportLegends === 'function') {
      const keepWb = Wb.getSettings();
      const LEG = [{ kind: 'war', title: 'rw2154大战', summary: '两军对峙三日。', at: 3 },
        { kind: 'crime', title: 'rw2154奇案', summary: '失窃发生在夜半。', at: 5 },
        { kind: 'rise', title: 'rw2154崛起', summary: '他一年之内升到将军。', at: 2 },
        { kind: 'weather', title: '晴', summary: '今日无云。', at: 9 }];
      const putChron = function (rows) {
        WA.store.transact(function (d) {
          d.chronicle = rows;
          d.worldBridge = { legends: [], exported: [], seeds: 0, lastExportAt: null, lastImportAt: null };
        }, 'reject-witness:wb-chron');
      };
      try {
        Wb.setSettings(Object.assign({}, keepWb, { enabled: true, worldTitle: 'rw2154世界', playerName: 'rw2154玩家' }));
        // ① 身份两段缺一即不成签名：半份身份是假判据，故与「没大事可传」分开归因
        want('identity-incomplete', 'worldBridge.exportLegends：身份缺一半 ⇒ 拒收（「不知道你是谁」与「没有大事可传」是两件事）');
        trip('identity-incomplete', function () {
          const keep2 = Wb.getSettings();
          try {
            Wb.setSettings({ playerName: '' });
            return [Wb.exportLegends().reason];
          } finally { Wb.setSettings(keep2); }
        });
        // ② 编年史为空
        want('no-chronicle', 'worldBridge.exportLegends：编年史为空 ⇒ 拒收（推演几轮后才有大事可传）');
        trip('no-chronicle', function () { putChron([]); return [Wb.exportLegends().reason]; });
        // ③ 有编年史但一类大事都没有（与「一条都还没发生」分开）
        want('nothing-to-export', 'worldBridge.exportLegends：一条大事都没沾上三类 ⇒ 拒收（「没发生过大事」不是「读不到世界」）');
        trip('nothing-to-export', function () {
          putChron([{ id: 'w1', kind: 'weather', title: '晴', summary: '无云。', at: 1 }]);
          return [Wb.exportLegends().reason];
        });
        putChron(LEG);
        const pack = Wb.exportLegends().pack;
        // ④ 同签名回灌：硬拒收，**不是**「导入了 0 条」
        want('self-origin', 'worldBridge.importLegends：本世界自己的包回灌 ⇒ 硬拒收（「拒收」退化成「导入 0 条」，就与「别处刚好传了空的」长得一样）');
        trip('self-origin', function () { return [Wb.importLegends(pack).reason]; });
        // ⑤⑥⑦ 坏负载三码彼此**不可合成**：一个要改负载形态、一个要改来源、一个要改去重口径
        want('bad-payload', 'worldBridge.importLegends：legends 不是数组 ⇒ bad-payload（负载形态不对）');
        trip('bad-payload', function () { return [Wb.importLegends({ sig: 'rw2154x', legends: '不是数组' }).reason]; });
        want('no-legends', 'worldBridge.importLegends：legends 是空数组 ⇒ no-legends（来源真的什么都没传）');
        trip('no-legends', function () { return [Wb.importLegends({ sig: 'rw2154y', legends: [] }).reason]; });
        want('nothing-to-import', 'worldBridge.importLegends：整包一条都收不下（档位均不在闭集）⇒ 拒收并如实报剔除数');
        trip('nothing-to-import', function () {
          return [Wb.importLegends({ sig: 'rw2154z', legends: [{ kind: 'zzz', title: 't' }] }).reason];
        });
        // ⑧ 全重复是 ok:true 的**读数**（「都收过」≠「别处什么都没传」）
        want('all-duplicates', 'worldBridge.importLegends：同一包再收一次 ⇒ all-duplicates（ok:true / added:0 的读数，不是坏状态）');
        trip('all-duplicates', function () {
          const p2 = JSON.parse(JSON.stringify(pack));
          p2.sig = 'rw2154dup';
          Wb.setSettings({ maxLegends: 24 });
          const first = Wb.importLegends(p2);
          if (!first.ok) return [];
          return [Wb.importLegends(p2).reason];
        });
        // ⑨ 未知传说：不凭空编一条事实
        want('unknown-legend', 'worldBridge.toRumor：传说 id 不在传说链里 ⇒ 拒收（不替世界编一条事实）');
        trip('unknown-legend', function () { return [Wb.toRumor('lg_rw2154_不存在').reason]; });
      } finally { Wb.setSettings(keepWb); }
    }
  }
  {
    const Ec = WA.ecoAudit;
    if (Ec && typeof Ec.lastSweep === 'function') {
      // ⑩ 从未扫过：**不拿 0 条冒充「干净」**（「没扫」与「扫过没问题」是两件事）
      want('never-swept', 'ecoAudit.lastSweep：本会话从未扫过 ⇒ never-swept（空读数不得冒充「四类都对得上」）');
      trip('never-swept', function () { return [Ec.lastSweep().reason]; });
    }
  }
  // ══ v2.155.0（RX8）：世界生成种子库新增拒收码 ====
  //   本段与前面各段同规矩：新增字面量全部由**真实局面**触发，走可执行见证、不进基线。
  //   一条归类判断：本引擎的八个码里只有四个是**新增字面量**（其余四个 —— disabled /
  //   missing-fields / bad-value / store-unavailable —— 复用既有词表，已在前段见证过，
  //   故不在这里重列：重列会把「一个码只有一个定义处」稀释成两份口径）。
  //   「四张表全空」的见证走**内存桩**（临时把 store.get 换成空对象），
  //   而不去清真实存档 —— 见证不得给后面的段留下一个被清空的世界。
  {
    const Ws = WA.worldSeed;
    if (Ws && typeof Ws.extract === 'function') {
      const keepWs = Ws.getSettings();
      const keepGet = WA.store.get;
      try {
        Ws.setSettings({ enabled: true, libCap: 12 });
        // ① 四张结构表全空 ⇒ 不产空种子
        want('nothing-to-extract', 'worldSeed.extract：势力/关系网/地理/时代四张表全空 ⇒ 拒收（空种子播种出来的是空世界，与「还没开局」不可分）');
        trip('nothing-to-extract', function () {
          const keep = WA.store.get;
          WA.store.get = function () { return {}; };
          try { return [Ws.extract().reason]; } finally { WA.store.get = keep; }
        });
        // 清库并造一个非空榻局（只动结构面，不动进度面）
        WA.store.transact(function (d) {
          d.worldSeed = { library: [], seq: 0 };
          d.evolution = Object.assign({}, d.evolution, { factions: [
            { id: 'f1', name: 'rw2155甲势力', power: 30 }] });
          d.world = Object.assign({}, d.world, { places: [{ id: 'pl1', name: 'rw2155甲城' }], roads: [{ id: 'r1' }] });
          d.background = Object.assign({}, d.background, { text: 'rw2155乱世之初。' });
        }, 'reject-witness:ws-reset');
        Ws.extract();
        // ② 同一结构存第二次：去重靠签名、不靠名字
        want('duplicate-seed', 'worldSeed.save：同签名（换个名字仍是同一榻局）存第二次 ⇒ 拒收并给出已有 id —— 库不是存档格，重复结构再多也只是噪声');
        trip('duplicate-seed', function () {
          const first = Ws.save('rw2155甲', 'other');
          if (!first.ok) return [];
          return [Ws.save('rw2155换名同榻局', 'other').reason];
        });
        // ③ 库满：不静默挤掉旧种子
        want('library-full', 'worldSeed.save：库达上限 ⇒ 拒收并给出 cap（不静默挤掉旧种子 —— 旧种子挤掉的代价是玩家自己不知道）');
        trip('library-full', function () {
          const put = function (nm) {
            WA.store.transact(function (d) {
              d.evolution = Object.assign({}, d.evolution, { factions: [{ id: 'f1', name: nm, power: 30 }] });
            }, 'reject-witness:ws-bones2');
            Ws.extract();
            return Ws.save(nm, 'other');
          };
          Ws.setSettings({ libCap: 2 });
          const b = put('rw2155乙势力');
          if (!b.ok) return [];            // 库内 2 个，到顶
          const c = put('rw2155丙势力');
          return [c.reason];
        });
        // ④ 未知种子：不凭空造一个
        want('unknown-seed', 'worldSeed.get / drop：种子 id 不在库里 ⇒ 拒收（不凭空造一个种子出来，也不假装删掉了）');
        trip('unknown-seed', function () {
          return [Ws.get('ws_rw2155_exists_not').reason, Ws.drop('ws_rw2155_exists_not').reason];
        });
      } finally { WA.store.get = keepGet; Ws.setSettings(keepWs); }
    }
  }
  // ── v2.156.0（SP1 + S1）：playtime 与 offline-return 的**新增**拒收码 ──
  //   与前面各段同规矩：新增字面量全部由**真实局面**触发，不进基线。
  //   几条只能用内存桩造前提（「换个聊天」「存储面抛错」这类局面在单进程里造不出来），
  //   桩一律在 finally 里还原，且**批次账与注入现场用前先快照、用后还原** ——
  //   本段跑在真 run.js 的第 12 面位置，给后面的段留下一个被改过的世界是越界。
  {
    const Pt = WA.playtime, Or = WA.offlineReturn, Ot = WA.offlineTick;
    if (Pt && Or && Ot) {
      const keepLa = Pt.lastActive, keepChatId = WA.store.chatId, keepMark = Ot.markConsumed;
      const keepPtCfg = Pt.getSettings(), keepOtCfg = Ot.getSettings(), keepOrCfg = Or.getSettings();
      const snap = JSON.parse(JSON.stringify((WA.store.get() || {})));
      /** 造一批待判的账 + 本轮注入现场（用完还原）。 */
      function putBatch(consumedAt, sources) {
        WA.store.transact(function (d) {
          d.offlineTick = Object.assign({}, d.offlineTick, {
            anchors: [], skips: [], rounds: 2, lastSettledAt: 1000,
            batches: [{ from: 1, to: 2, elapsedMs: 7200000, rounds: 2, protectedRows: 0, applied: true, at: 2, consumedAt: consumedAt }]
          });
          d.lastInjection = { at: 3, sources: sources, injected: 1, len: 1, mainCount: 1 };
        }, 'reject-witness:or-batch');
      }
      try {
        Pt.setSettings({ enabled: true });
        Ot.setSettings({ enabled: true });
        Or.setSettings({ enabled: true });

        want('no-baseline', 'playtime.lastActive：这个聊天从没记过活动基准 ⇒ 拒收 no-baseline（「没记过」不等于「你走了零秒」）');
        trip('no-baseline', function () { return [Pt.lastActive('rw2156_no_such_chat').reason]; });

        want('first-baseline', 'offlineReturn.recover：没有活动基准 ⇒ 只落两本账的起点、不结算（first-baseline）');
        trip('first-baseline', function () {
          Pt.lastActive = function () { return { ok: false, reason: 'no-baseline', chatId: 'rw2156' }; };
          try { return [Or.recover({ now: Date.now() }).reason]; } finally { Pt.lastActive = keepLa; }
        });

        want('first', 'offlineReturn.recover：offlineTick 侧也没有结算点 ⇒ 只落基准（first）—— 「不知道你走了多久」≠「你走了零秒」');
        trip('first', function () {
          WA.store.transact(function (d) {
            d.offlineTick = { anchors: [], batches: [], skips: [], lastSettledAt: null, rounds: 0 };
          }, 'reject-witness:or-first');
          Pt.lastActive = function () { return { ok: true, chatId: 'rw2156', at: Date.now() - 3600000, ageMs: 3600000, updates: 1, firstAt: 0 }; };
          try { return [Or.recover({ now: Date.now() }).reason]; } finally { Pt.lastActive = keepLa; }
        });

        want('backward', 'offlineReturn.recover：now 早于活动基准（时钟回拨 / 同刻重入）⇒ 拒收 backward（不把负时长当 0）');
        trip('backward', function () {
          Pt.lastActive = function () { return { ok: true, chatId: 'rw2156', at: Date.now() + 1000, ageMs: 0, updates: 1, firstAt: 0 }; };
          try { return [Or.recover({ now: Date.now() }).reason]; } finally { Pt.lastActive = keepLa; }
        });

        want('stale-chat', 'offlineReturn.recover：进门到真跑之间换了聊天 ⇒ 拒收 stale-chat（别人的票据推不了这个世界的演）');
        trip('stale-chat', function () {
          let n = 0;
          Pt.lastActive = function () { return { ok: true, chatId: 'rw2156', at: Date.now() - 3600000, ageMs: 3600000, updates: 1, firstAt: 0 }; };
          WA.store.chatId = function () { n++; return n === 1 ? 'rw2156_A' : 'rw2156_B'; };
          try { return [Or.recover({ now: Date.now() }).reason]; }
          finally { Pt.lastActive = keepLa; WA.store.chatId = keepChatId; }
        });

        want('stale-baseline', 'offlineReturn.recover：事务内复核发现结算点已被前移（并发的第二次恢复）⇒ 拒收 stale-baseline（宁可什么都不做，也不把同一段离线推两遍）');
        trip('stale-baseline', function () {
          let inner = null;
          WA.store.transact(function (d) {
            d.offlineTick = Object.assign({}, d.offlineTick, { lastSettledAt: 1000 });
            Pt.lastActive = function () { return { ok: true, chatId: 'rw2156', at: Date.now() - 7200000, ageMs: 7200000, updates: 1, firstAt: 0 }; };
            d.offlineTick.lastSettledAt = 1001;
            try { inner = Or.recover({ now: Date.now() }); } finally { Pt.lastActive = keepLa; }
            return true;
          }, 'reject-witness:or-race');
          return [inner && inner.reason];
        });

        want('not-injected', 'offlineReturn.consume：这一轮真落地的源里没有本模块那一源 ⇒ 拒收 not-injected 且**不记消费**（宁可多注入一次，也不把没发生的事记成发生）');
        trip('not-injected', function () {
          putBatch(null, ['世界状态']);
          return [Or.consume().reason];
        });

        want('already-consumed', 'offlineReturn.consume：这一批早已经被消费过 ⇒ 幂等返回 already-consumed（重试不该把它记成两次消费）');
        trip('already-consumed', function () {
          putBatch(5, ['你不在时']);
          return [Or.consume().reason];
        });

        want('consume-failed', 'offlineReturn.consume：账口抛错 ⇒ 如实归因 consume-failed（消费面故障与被消费不该同形）');
        trip('consume-failed', function () {
          putBatch(null, ['你不在时']);
          Ot.markConsumed = function () { throw new Error('rw2156-stub'); };
          try { return [Or.consume().reason]; } finally { Ot.markConsumed = keepMark; }
        });
      } finally {
        Pt.lastActive = keepLa; WA.store.chatId = keepChatId; Ot.markConsumed = keepMark;
        Pt.setSettings(keepPtCfg); Ot.setSettings(keepOtCfg); Or.setSettings(keepOrCfg);
        WA.store.transact(function (d) {
          d.offlineTick = snap.offlineTick;
          d.lastInjection = snap.lastInjection;
        }, 'reject-witness:or-restore');
      }
    }
  }

  // ══ v2.158.0（S3）：world-seed 的转移包 / 空新局初始化新增码 ══
  //   九个码全部由**真实局面**触发（包形状坏、格式版本旧、白名单外键、空种子、签名格式坏、
  //   包超容量、目标非空、无预览、重复确认），故按台账规矩走**可执行见证**、不进基线。
  //   两条边界（本段最要紧的判断）：
  //     ① `pack-too-big` 与 `library-full` 绝不可合成一个「收不下」—— 前者要重打包（内容超限），
  //        后者要清库或扩 cap（容量到顶）；合成即让两种处置在读数上长得一样。
  //     ② `no-preview`（没预览过）与 `already`（装过了）绝不可合成一个「不能再确认」——
  //        前者要补 initPreview()，后者是幂等成功（ok:true，不是拒收）；合成会把
  //        「照做了但顺序错」与「已经成功过」变成同一个读数。
  //   本段只读/只写 worldSeed 自己那一格与 meta.initFrom；桩一律在 finally 还原。
  {
    const Ws = WA.worldSeed;
    if (Ws && typeof Ws.importPack === 'function' && typeof Ws.initPreview === 'function') {
      const keepCfg = Ws.getSettings();
      const snap = JSON.parse(JSON.stringify((WA.store.get() || {})));
      // 空新局宿主：S3 的预览/确认只作用于空世界，故先把世界清成「骨架默认」。
      function blank() {
        WA.store.transact(function (d) {
          d.people = {}; d.currents = []; d.chronicle = []; d.worldFacts = []; d.echoes = [];
          d.world = { places: [], roads: [], blocks: [] };
          d.evolution = Object.assign({}, d.evolution, { factions: [], round: 0 });
          d.meta = {}; d.background = { text: '' }; d.clock = { label: '', source: 'unset' };
          d.branch = null;
        }, 'reject-witness:v2158-blank');
      }
      // 一枚合法种子（够小，能过 pack-too-big 之前的各道门）。
      const okSeed = { ver: 1, sig: '0a0b0c0d', at: 1,
        powers: [{ name: '见证甲势力', weight: 30 }],
        network: { nodes: ['见证甲', '见证乙'], edges: [['见证甲', '见证乙', 'near']] },
        geo: { places: ['见证甲城'], roads: 1 },
        era: { title: '见证之世', label: '见证历', note: '见证乱世之初。' } };
      function packOf(sd, packVer) {
        return { packVer: packVer === undefined ? 1 : packVer, chatId: 'witness-src',
          at: 1, counts: {}, name: '见证包', tags: ['other'], seed: sd };
      }
      try {
        Ws.setSettings(Object.assign({}, keepCfg, { enabled: true, libCap: 12 }));
        blank();
        WA.store.transact(function (d) { d.worldSeed = { library: [], seq: 0 }; }, 'reject-witness:v2158-clear');

        // ── 包形状坏 ──
        want('bad-pack', 'worldSeed.importPack：包不是对象（null / 数组 / 字符串）⇒ 拒收 bad-pack（不把「不是包」当「空包」收下）');
        trip('bad-pack', function () {
          return [Ws.importPack(null).reason, Ws.importPack([]).reason, Ws.importPack('x').reason];
        });
        want('bad-pack', 'worldSeed.importPack：包是对象但缺 seed 字段 ⇒ 同一个 bad-pack（形状缺件，与「不是对象」同处置：重打包）');
        trip('bad-pack', function () { return [Ws.importPack({ packVer: 1 }).reason]; });

        // ── 格式版本旧 ──
        want('bad-pack-ver', 'worldSeed.importPack：包格式版本与支持的 PACK_VER 不符 ⇒ 拒收 bad-pack-ver（带 supported）—— 「包是好的只是旧」与「包是坏的」处置不同（等迁移器 vs 重打包）');
        trip('bad-pack-ver', function () { return [Ws.importPack(packOf(okSeed, 99)).reason]; });

        // ── 白名单外的键 ──
        want('bad-seed-keys', 'worldSeed.importPack：种子里出现白名单外的键 ⇒ 拒收 bad-seed-keys（带 extra）—— 不认识的键 = 未来格式或恶意载荷，静默收下等于把「不确定能装」伪装成「装下了」');
        trip('bad-seed-keys', function () {
          const bad = Object.assign({}, okSeed, { chronicle: [{ id: 'ch1' }] });
          return [Ws.importPack(packOf(bad)).reason];
        });

        // ── 空种子 ──
        want('empty-seed', 'worldSeed.importPack：四结构面（势力 / 节点 / 地名 / 时代标题）全空 ⇒ 拒收 empty-seed（空种子播出来的是空世界，与「还没开局」在读数上不可分）');
        trip('empty-seed', function () {
          const empty = { ver: 1, sig: '0a0b0c0d', at: 1, powers: [], network: { nodes: [], edges: [] }, geo: { places: [], roads: 0 }, era: {} };
          return [Ws.importPack(packOf(empty)).reason];
        });

        // ── 签名格式坏 ──
        want('bad-sig', 'worldSeed.importPack：签名不是 8 位十六进制 ⇒ 拒收 bad-sig（带 got）—— 签名是去重的唯一依据，格式坏即无法判重');
        trip('bad-sig', function () {
          const bad = Object.assign({}, okSeed, { sig: 'ZZZ' });
          return [Ws.importPack(packOf(bad)).reason];
        });

        // ── 包超容量（导入侧）──
        want('pack-too-big', 'worldSeed.importPack：包内任一面超过容量界限（powers 24 / nodes 60 / edges 120 / places 40）⇒ 整批拒收 pack-too-big（带 counts 与 limits）—— 不做部分交付');
        trip('pack-too-big', function () {
          const big = Object.assign({}, okSeed, { powers: new Array(25).fill(0).map(function (_, i) { return { name: 'p' + i, weight: 1 }; }) });
          return [Ws.importPack(packOf(big)).reason];
        });

        // ── 包超容量（转移侧）──
        //   为什么单独见证：导入侧的门在**包**上，转移侧的门在**库里的种子**上（防被改大 / 未来格式）。
        //   活世界造不出 >24 势力（extract 侧已 slice(0,24)），故直接往库里注入一枚超限种子。
        want('pack-too-big', 'worldSeed.transferPack：库里那枚种子任一面超限 ⇒ 拒收 pack-too-big —— 门防的是「库里的种子被改大 / 未来格式」，不是活世界（活世界在提取侧已被截断）');
        trip('pack-too-big', function () {
          WA.store.transact(function (d) {
            d.worldSeed = { library: [{ id: 'ws_witness_over', name: '超限种子', tags: [], at: 1,
              seed: { ver: 1, sig: 'aabbccdd', at: 1,
                powers: new Array(25).fill(0).map(function (_, i) { return { name: 'p' + i, weight: 1 }; }),
                network: { nodes: [], edges: [] }, geo: { places: [], roads: 0 }, era: { title: 'T' } } }], seq: 1 };
          }, 'reject-witness:v2158-over');
          return [Ws.transferPack('ws_witness_over').reason];
        });

        // ── 目标非空 ──
        want('not-empty', 'worldSeed.initPreview：目标世界非空（带 what 清单）⇒ 拒收 not-empty —— 种子初始化只作用于空新局，不覆盖既有存档');
        trip('not-empty', function () {
          WA.store.transact(function (d) {
            d.people = { p1: { id: 'p1', name: '既有的人', profile: null } };
          }, 'reject-witness:v2158-nonempty');
          return [Ws.initPreview('ws_witness_over').reason];
        });
        blank();
        WA.store.transact(function (d) { d.worldSeed = { library: [], seq: 0 }; }, 'reject-witness:v2158-clear2');
        const im = Ws.importPack(packOf(okSeed));
        if (!im.ok) throw new Error('见证前提未建立：合法包导入失败 ' + JSON.stringify(im));

        // ── 无预览 ──
        want('no-preview', 'worldSeed.initConfirm：没预览过就直接确认 ⇒ 拒收 no-preview（带 hint）—— 「没预览过」与「装过了」（already，ok:true）绝不可同形：前者要补 initPreview()，后者是幂等成功');
        trip('no-preview', function () { return [Ws.initConfirm().reason]; });

        // ── 重复确认 ──
        want('already', 'worldSeed.initConfirm：目标世界已带 meta.initFrom ⇒ 返回 already（ok:true 幂等，不是拒收）—— 确认后 _pending 已消费清空，再确认若先查 _pending 会误报 no-preview');
        trip('already', function () {
          const pv = Ws.initPreview(im.id);
          if (!pv.ok) throw new Error('见证前提未建立：预览失败 ' + JSON.stringify(pv));
          const c1 = Ws.initConfirm();
          if (!c1.ok) throw new Error('见证前提未建立：首次确认失败 ' + JSON.stringify(c1));
          return [Ws.initConfirm().reason];
        });
      } finally {
        try { Ws.setSettings(keepCfg); } catch (e0) {}
        try {
          WA.store.transact(function (d) {
            Object.keys(d).forEach(function (k) { delete d[k]; });
            Object.keys(snap).forEach(function (k) { d[k] = snap[k]; });
          }, 'reject-witness:v2158-restore');
        } catch (e2) {}
      }
    }
  }

  // ══ v2.160.0（TP4）：跨引擎提交契约 + 异步归属票据新增拒收码 ════
  //   本段与前面各段同规矩：新增字面量全部由**真实局面**触发，走可执行见证、不进基线。
  //   分两组：
  //     A 组 core/commit.js（九个新码）—— 这一层此前**零见证零基线**，属「静默新增码」，
  //       正是本面门禁要拦的形态。
  //     B 组 TP1/TP2 遗留 —— store 的异步归属票据三码 + world-seed 的票据失效码。
  //       为什么此前没有见证：TP1/TP2 落地时本门禁的 base 里没有它们，而它们又不在
  //       见证表里 ⇒ 一直是 unclassified。本轮一并补齐（不留「下一版再说」）。
  {
    const Cm = WA.commit;
    if (Cm && typeof Cm.begin === 'function') {
      // ── A1 缺参：链与副作用都必须是真对象/真函数 ──
      want('bad-chain', 'commit.commit / flush / retryEffects：链参数缺失或非对象 ⇒ 拒收 bad-chain（三条入口同一口径，不各自造一个码）');
      trip('bad-chain', function () {
        return [Cm.commit(null, function () {}).reason, Cm.flush(null).reason, Cm.retryEffects(null).reason];
      });
      want('bad-defer', 'commit.defer：副作用不是函数 ⇒ 拒收 bad-defer（登记一个不可执行的东西等于把「事务后要做什么」变成空承诺）');
      trip('bad-defer', function () { return [Cm.defer(null, 'k', null).reason]; });
      want('missing-opid', 'commit.settle / replay：操作号为空 ⇒ 拒收 missing-opid（没有 opId 就没有「这一笔」可言，凭空键去重会把不同操作认成同一笔）');
      trip('missing-opid', function () { return [Cm.settle('', {}).reason, Cm.replay('').reason]; });
      want('no-receipt', 'commit.replay：该 opId 从未提交过 ⇒ 拒收 no-receipt（「没提交过」与「提交过但归档没了」不可同形）');
      trip('no-receipt', function () { return [Cm.replay('tp4w-never-committed').reason]; });
      // ── A2 容量：副作用登记数达上限 ──
      want('deferred-full', 'commit.defer：单链副作用登记数达 LIMITS.DEFERRED ⇒ 拒收并给出 pending —— 无上限的待办列表等于把「事务后要做什么」变成不可预期的长尾');
      trip('deferred-full', function () {
        const b = Cm.begin('tp4w-deferfull');
        if (!b.ok) return [];
        for (let i = 0; i < 40; i++) Cm.defer(b.chain, 'k' + i, function () { return true; });
        return [Cm.defer(b.chain, 'overflow', function () { return true; }).reason];
      });
      // ── A3 幂等：提交过之后同键再开 ──
      want('duplicate-op', 'commit.begin：同一 opId 已有**落盘回执** ⇒ 拒收 duplicate-op 并回原回执（跨刷新可判，不靠进程态在册表）');
      trip('duplicate-op', function () {
        const b = Cm.begin('tp4w-dup');
        if (!b.ok) return [];
        const r = Cm.commit(b.chain, function (d) { d.__zz = { n: 1 }; });
        if (!r.ok) return [];
        return [Cm.begin('tp4w-dup').reason];
      });
      // ── A4 提交失败：存储面写不动 ──
      want('settle-failed', 'commit.settle：事务外补记回执时写盘失败 ⇒ 拒收 settle-failed（如实报「补账没成功」，不粉饰成 ok）');
      trip('settle-failed', function () {
        const keep = WA.store.transact;
        WA.store.transact = function () { return { ok: false, error: new Error('tp4w-write-fail') }; };
        try { return [Cm.settle('tp4w-settle', { site: 'probe' }).reason]; }
        finally { WA.store.transact = keep; }
      });
      // ── A5 嵌套：commit 被嵌在别人的 mutator 里（v2.185.0 计划 O2 补的见证）──
      want('nested-deferred', 'commit.commit：被嵌在别人的 mutator 里（transact 走嵌套分支 ⇒ deferred:true）⇒ 拒收 nested-deferred 且 written:false —— 旧版此时照报「已提交」，而它其实随外层事务，外层一被拒就什么都没落');
      trip('nested-deferred', function () {
        const b = Cm.begin('tp4w-nested');
        if (!b.ok) return [];
        let seen = null;
        WA.store.transact(function (d) {
          const r = Cm.commit(b.chain, function (dd) { dd.__zzN = { n: 1 }; });
          seen = r && r.reason;
        });
        return [seen];
      });
    }
  }
  // ── B 组：store 的异步归属票据（TP1/TP2 落地，本轮补见证）──
  {
    const St = WA.store;
    if (St && typeof St.claimAsync === 'function' && typeof St.settleAsync === 'function') {
      const host = global.SillyTavern.getContext();
      const keepChat = host.chatId, keepMeta = host.chatMetadata;
      try {
        // ── B1 跨聊天：A 取票 → 切到 B → 结算 ──
        want('foreign-chat', 'store.settleAsync：请求发出后已切换聊天 ⇒ 拒收 foreign-chat 并带出「从哪来到哪去」（A 的预览/响应不得落到 B）');
        trip('foreign-chat', function () {
          host.chatId = 'tp4w_chatA'; host.chatMetadata = {}; St.init();
          const tk = St.claimAsync('tp4w');
          if (!tk || !tk.ok) return [];
          host.chatId = 'tp4w_chatB'; host.chatMetadata = {}; St.init();
          return [St.settleAsync(tk.ticket, { site: 'tp4w' }).reason];
        });
        // ── B2 纪元：同聊天重载（store.init）后结算 ──
        want('stale-epoch', 'store.settleAsync：同聊天但纪元已推进（重载/重新 init）⇒ 拒收 stale-epoch —— 内存里那些「请求发出时的现场」已经不是同一份了');
        trip('stale-epoch', function () {
          host.chatId = 'tp4w_epoch'; host.chatMetadata = {}; St.init();
          const tk = St.claimAsync('tp4w');
          if (!tk || !tk.ok) return [];
          St.init();
          return [St.settleAsync(tk.ticket, { site: 'tp4w' }).reason];
        });
        // ── B3 读集版本：调用方显式要求严格时才拒（默认只记账 —— 见 store 常量段）──
        want('stale-rev', 'store.settleAsync（strictRev）：世界已确认读集版本被推进且调用方要求严格 ⇒ 拒收 stale-rev —— 默认只记账（「无关更新不该让所有结论饿死」），严格档是调用方的显式选择');
        trip('stale-rev', function () {
          host.chatId = 'tp4w_rev'; host.chatMetadata = {}; St.init();
          const tk = St.claimAsync('tp4w');
          if (!tk || !tk.ok) return [];
          WA.store.transact(function (d) { d.__zz = { n: 99 }; }, 'tp4w:write');
          return [St.settleAsync(tk.ticket, { site: 'tp4w', strictRev: true }).reason];
        });
      } finally {
        try { host.chatId = keepChat; host.chatMetadata = keepMeta; St.init(); } catch (e0) {}
      }
    }
  }
  // ── B4：world-seed 的票据失效码（TP1 落地，本轮补见证）──
  {
    const Ws = WA.worldSeed;
    if (Ws && typeof Ws.initPreview === 'function' && typeof Ws.initConfirm === 'function'
        && WA.store && typeof WA.store.dropAsync === 'function') {
      want('pending-mismatch', 'worldSeed.initConfirm：预览票据已不在册（过期 / 被挤出 / 已被消费）⇒ 拒收 pending-mismatch 并给出「重新预览」提示 —— 它与 no-preview（从没预览过）绝不可同形：前者要重预览，后者要补预览');
      trip('pending-mismatch', function () {
        const snap = JSON.parse(JSON.stringify(WA.store.get() || {}));
        const keepCfg = Ws.getSettings();
        try {
          Ws.setSettings({ enabled: true });
          // 造一个空新局 + 一枚可预览的种子
          WA.store.transact(function (d) {
            d.people = {}; d.currents = []; d.chronicle = []; d.worldFacts = []; d.echoes = [];
            d.world = { places: [], roads: [], blocks: [] };
            d.evolution = Object.assign({}, d.evolution, { factions: [], round: 0 });
            d.meta = {}; d.background = { text: '' }; d.clock = { label: '', source: 'unset' };
            d.branch = null;
            d.worldSeed = { library: [{ id: 'ws_tp4w', name: '票据见证种子', tags: [], at: 1,
              seed: { ver: 1, sig: 'a1b2c3d4', at: 1, powers: [{ name: '见证势力', weight: 30 }],
                network: { nodes: [], edges: [] }, geo: { places: ['见证城'], roads: 0 }, era: { title: '见证之世' } } }], seq: 1 };
          }, 'reject-witness:tp4w-seed');
          const pv = Ws.initPreview('ws_tp4w', 0);
          if (!pv.ok || !pv.ticket) return [];
          // 把票从在册表里丢掉（模拟过期/被挤出）——「计划还在，票没了」
          WA.store.dropAsync(pv.ticket);
          return [Ws.initConfirm().reason];
        } finally {
          try { Ws.setSettings(keepCfg); } catch (e1) {}
          try {
            WA.store.transact(function (d) {
              Object.keys(d).forEach(function (k) { delete d[k]; });
              Object.keys(snap).forEach(function (k) { d[k] = snap[k]; });
            }, 'reject-witness:tp4w-restore');
          } catch (e2) {}
        }
      });
    }
  }

  // ── v2.161.0（TP3）：页面恢复入口的**合并窗** ──
  //   本码的特殊之处：它的执行点在 recover 内部（页面入口与总线订阅共用同一道判定），
  //   所以见证必须经**真 API** 造出「同一次回前台连发两拍」的局面 —— 不能只调一个内部函数。
  //   第一拍刻意选**零写入**的路径（时钟回拨 ⇒ backward，早退发生在任何 base 落盘与事务之前），
  //   于是本见证不需要快照/还原世界 ——改动世界的见证要自己负责把世界放回去，此处刻意避开。
  {
    const Or = WA.offlineReturn, Pt = WA.playtime;
    if (Or && Pt && typeof Or.recover === 'function' && typeof Pt.lastActive === 'function') {
      want('coalesced', 'offlineReturn.recover：宿主对同一次回前台连发多拍 ⇒ 窗内只跑一次，后到的那拍如实拒收 coalesced。'
        + '「合并了几拍」与「那一拍后来怎么了」必须分开报：合成一个码会让宿主重复通知与通知来了但没得跑在读数上同形，而两者处置不同。');
      trip('coalesced', function () {
        const keepCfg = Or.getSettings();
        const keepLa = Pt.lastActive;
        try {
          Or.setSettings({ enabled: true });
          // 基准打桩在**未来**一秒：第一拍注入更早的时刻 ⇒ gap 为负 ⇒ backward（零写入早退）。
          const t0 = Date.now();
          Pt.lastActive = function () { return { ok: true, chatId: 'rw2161', at: t0 + 1000, ageMs: 0, updates: 1, firstAt: 0 }; };
          const a = Or.recover({ trigger: 'page-visibility', now: t0 - 5000 });
          const b = Or.recover({ trigger: 'page-pageshow' });
          // 自证：第一拍真走到判定（backward），第二拍才被合并窗拦住。
          if (!a || a.reason !== 'backward') return [];
          return [b && b.reason];
        } finally { Or.setSettings(keepCfg); Pt.lastActive = keepLa; }
      });
    }
  }

  // ── v2.162.0（TP7）：在途义务的容量裁决 ──
  //   这个码与前面那些的形态不同：它在**两个执行点**共享同一个名字 ——
  //     ① 写入侧闸（engines/world.js 的 depart / deliverGoods / sendMessage）：
  //        在途塞满 ⇒ 如实拒收，不再把「操作成功」写在面上而把在途货悄悄挤掉；
  //     ② 挤出侧豁免（core/evict.js 的 IN_TRANSIT 表）：超限存档的下一次挤出里也不丢在途行，
  //        且「在途自身就超过 cap」时**放弃截断**并回报同一个码。
  //   故见证必须经**真 API**把「在途塞满」这个局面造出来，不能只调挤出器：
  //   只测挤出器就把「用户看到的是什么」整段漏掉（原形态里用户看到的是 {ok:true}）。
  //   实测原形态（无头现场）：cap=16 而连发 24 批，24 批**全部**返回 {ok:true}，
  //   其中 8 批在途未到的货被 slice 静默挤掉，而仓库头注写着「货运回答『货在哪』」——
  //   这张表一旦按环形丢，答案就从事实变成「不知道」。
  {
    const Wd2 = WA.world;
    if (Wd2 && typeof Wd2.addPlace === 'function' && typeof Wd2.deliverGoods === 'function'
        && WA.evict && typeof WA.evict.siteDecls === 'function') {
      want('in-transit-full', 'world.deliverGoods：在途货运已达容量上限 ⇒ 写入侧如实拒收 in-transit-full，不静默挤出未完成的货'
        + '（同一码亦由 core/evict 的在途豁免回报：历史遗留的超限存档放弃截断，宁可超 cap 也不丢在途行）。'
        + '它与既有容量码绝不可同形：这里丢的不是可回收历史，而是「还没到的那批货」。');
      trip('in-transit-full', function () {
        const snap = JSON.parse(JSON.stringify(WA.store.get() || {}));
        const keepCfg = Wd2.getSettings();
        try {
          Wd2.setSettings({ enabled: true });
          // 本段前面已把 甲地~乙地 整段封锁（road-closed 见证），故另开一对**独立地点**：
          //   共用路段的话 deliverGoods 会在 transit 就失败成 road-closed，
          //   于是本见证测的是「路断了」而不是「在途满了」——那是静默失效的经典形态。
          Wd2.addPlace({ name: 'rw2162戊地', kind: 'market' });
          Wd2.addPlace({ name: 'rw2162己地', kind: 'market' });
          const rd = Wd2.addRoad('rw2162戊地', 'rw2162己地', 30);
          if (!rd || rd.ok !== true) return ['road-failed:' + ((rd && rd.reason) || 'unknown')];
          WA.store.transact(function (d) {
            d.world = (d.world && typeof d.world === 'object') ? d.world : {};
            d.world.shipments = [];   // 只清这张表：容量裁决的现场（其余世界状态本见证一概不动）
          }, 'reject-witness:tp7-seed');
          const cap = WA.evict.siteDecls()['world.shipments'].cap;
          const codes = [];
          for (let i = 0; i < cap + 8; i++) {
            const r = Wd2.deliverGoods('rw2162戊地', 'rw2162己地', '盐', 1, { at: 7000000 });
            if (r && r.reason) codes.push(r.reason);
          }
          return codes;
        } finally {
          try { Wd2.setSettings(keepCfg); } catch (e1) {}
          try {
            WA.store.transact(function (d) {
              Object.keys(d).forEach(function (k) { delete d[k]; });
              Object.keys(snap).forEach(function (k) { d[k] = snap[k]; });
            }, 'reject-witness:tp7-restore');
          } catch (e2) {}
        }
      });
    }
  }
  // ══ v2.164.0（TX5）：版本化完整世界蓝图新增拒收码 ====
  //   本段与前面各段同规矩：新增字面量全部由**真实局面**触发，走可执行见证、不进基线。
  //   归类判断：本引擎 18 个码里 8 个是**新增字面量**（bad-bp-ver / bad-blueprint /
  //   bad-bp-keys / duplicate-id / dangling-ref / empty-blueprint / duplicate-blueprint /
  //   unknown-blueprint），在本段逐一见证；其余 10 个（disabled / missing-fields /
  //   library-full / not-empty / no-preview / pending-mismatch / foreign-chat / stale-epoch /
  //   already / too-many）复用既有词表，已在前段见证过 —— 不在此重列，重列会把
  //   「一个码只有一个定义处」稀释成两份口径。
  //   全部见证走**内存桩**（临时替换 store.get / 造非空目标）而不去清真实存档 ——
  //   见证不得给后面的段留下一个被清空的世界。
  {
    const Bp = WA.worldBlueprint;
    if (Bp && typeof Bp.exportBlueprint === 'function') {
      const keepBp = Bp.getSettings();
      const snap = JSON.parse(JSON.stringify(WA.store.get() || {}));
      try {
        Bp.setSettings({ enabled: true, libCap: 8 });
        WA.store.transact(function (d) {
          d.blueprint = { library: [], seq: 0, installed: null };
          d.people = {};
          d.world = Object.assign({}, d.world, { places: [], roads: [] });
          d.evolution = Object.assign({}, d.evolution, { factions: [], round: 0 });
          d.background = Object.assign({}, d.background, { text: 'rw2164乱世之初。' });
          d.chronicle = []; d.currents = []; d.echoes = []; d.worldFacts = [];
          d.meta = Object.assign({}, d.meta, { initFrom: null });
          if (d.economy) d.economy.goods = [];
        }, 'reject-witness:bp-reset');
        // 人物必须经**唯一写者**（registry.ensurePerson）落进真实 draft —— 传 null 会被
        //   它如实拒收 bad-draft（那正是「产品面禁自塞 people 行」这条纪律的入口守卫）。
        WA.store.transact(function (d) {
          WA.registry.ensurePerson(d, 'np_rw2164a', 'rw2164甲', 'reject-witness');
          WA.registry.ensurePerson(d, 'np_rw2164b', 'rw2164乙', 'reject-witness');
        }, 'reject-witness:bp-people');
        WA.world.addPlace({ name: 'rw2164甲城', kind: 'home' });
        WA.world.addPlace({ name: 'rw2164乙城', kind: 'market' });
        WA.world.addRoad('rw2164甲城', 'rw2164乙城', 30);
        WA.store.transact(function (d) {
          d.evolution = Object.assign({}, d.evolution, { factions: [{ id: 'fa_rw2164', name: 'rw2164甲势力', power: 40 }] });
        }, 'reject-witness:bp-fa');
        want('empty-blueprint', 'worldBlueprint.exportBlueprint：人物/势力/地点/时代四张表全空 ⇒ 拒收（空蓝图装出来的是空世界，与「还没开局」不可分）');
        trip('empty-blueprint', function () {
          const keep = WA.store.get;
          WA.store.get = function () { return {}; };
          try { return [Bp.exportBlueprint().reason]; } finally { WA.store.get = keep; }
        });
        const ex = Bp.exportBlueprint();
        if (ex.ok) {
          want('bad-bp-ver', 'worldBlueprint.previewImport：bpVer 对不上 ⇒ 拒收并给出 got/supported（不按 v1 猜着收 —— 未知版本的蓝图装下去会静默污染目标存档）');
          trip('bad-bp-ver', function () {
            const bad = JSON.parse(JSON.stringify(ex.blueprint)); bad.bpVer = 999;
            return [Bp.previewImport(bad).reason];
          });
          want('bad-blueprint', 'worldBlueprint.previewImport：蓝图不是对象、或缺 ids 结构 ⇒ 拒收（形状不对就不谈内容）');
          trip('bad-blueprint', function () {
            const a = Bp.previewImport(null).reason;
            const b = (function () { const x = JSON.parse(JSON.stringify(ex.blueprint)); delete x.ids; return Bp.previewImport(x).reason; })();
            return [a, b];
          });
          want('bad-bp-keys', 'worldBlueprint.previewImport：蓝图含未知顶层键 ⇒ 拒收并列出（未来格式或恶意载荷 —— 静默收下等于把「不确定能装」伪装成「装下了」）');
          trip('bad-bp-keys', function () {
            const x = JSON.parse(JSON.stringify(ex.blueprint)); x.evil = 1;
            return [Bp.previewImport(x).reason];
          });
          want('duplicate-id', 'worldBlueprint.previewImport：同一稳定 ID 出现在两张表 / 同表两次 ⇒ 拒收（id 重复即「按 key 引用」这条地基塌了）');
          trip('duplicate-id', function () {
            const x = JSON.parse(JSON.stringify(ex.blueprint));
            if (!x.ids.people.length || !x.ids.places.length) return [];
            x.ids.places[0].key = x.ids.people[0].key;
            return [Bp.previewImport(x).reason];
          });
          want('dangling-ref', 'worldBlueprint.previewImport：关系边 / 道路端点指向不存在的 key ⇒ 拒收（悬空引用装进去就是一条指向虚空的边）');
          trip('dangling-ref', function () {
            const out = [];
            // 两条通路各证一次：关系边（若本局面有）与道路端点（必有 —— 上面刚建了路）。
            const x1 = JSON.parse(JSON.stringify(ex.blueprint));
            if (x1.relations.length) { x1.relations[0].to = 'bk_no_such_key_0'; out.push(Bp.previewImport(x1).reason); }
            const x2 = JSON.parse(JSON.stringify(ex.blueprint));
            if (x2.roads.length) { x2.roads[0].a = 'bk_no_such_key_1'; out.push(Bp.previewImport(x2).reason); }
            return out;
          });
          want('duplicate-blueprint', 'worldBlueprint.save：同签名（换个名字仍是同一结构）存第二次 ⇒ 拒收并给出已有 id —— 库不是存档格，重复结构再多也只是噪声');
          trip('duplicate-blueprint', function () {
            const first = Bp.save('rw2164甲蓝图', 'other');
            if (!first.ok) return [];
            return [Bp.save('rw2164换名同结构', 'other').reason];
          });
          want('unknown-blueprint', 'worldBlueprint.get/drop：蓝图 id 不在库内 ⇒ 拒收（不替世界编一张不存在的蓝图）');
          trip('unknown-blueprint', function () {
            return [Bp.get('bp_rw2164_不存在').reason, Bp.drop('bp_rw2164_不存在').reason];
          });
        }
      } finally {
        try { Bp.setSettings(keepBp); } catch (e1) {}
        try {
          WA.store.transact(function (d) {
            Object.keys(d).forEach(function (k) { delete d[k]; });
            Object.keys(snap).forEach(function (k) { d[k] = snap[k]; });
          }, 'reject-witness:bp-restore');
        } catch (e2) {}
      }
    }
  }

  // v2.166.0（TX2）：agency 拒收码见证（engines/agency.js）。
  //   全部通过 boot 后真实调用触发（不直调内部函数）。
  if (WA.agency) {
    want('disabled', 'agency：开关关着时调度返回 disabled（TX2）');
    trip('disabled', function () { return WA.agency.schedule('某人', Date.now()).reason; });
    WA.agency.setSettings({ enabled: true });
    want('missing-person', 'agency：空人物名返回 missing-person（TX2）');
    trip('missing-person', function () { return WA.agency.schedule('', Date.now()).reason; });
    want('no-active-goal', 'agency：无目标人物返回 no-active-goal（TX2）');
    trip('no-active-goal', function () { return WA.agency.schedule('不存在的人', Date.now()).reason; });
    want('need-steps', 'agency：有目标无计划返回 need-steps（不编步骤）（TX2）');
    if (WA.life && WA.life.addGoal) {
      try { WA.life.addGoal('rejectWitness_agency', { id: 'g1', text: '造桥', status: 'active' }); } catch (e) {}
      trip('need-steps', function () { return WA.agency.schedule('rejectWitness_agency', Date.now()).reason; });
    }
    // processReceipts 在无回执时返回 ok:true processed:0（不是拒收码，是空回执）
    // 以下 5 码在内部函数 checkPrereqs / processReceipts 中可达，
    // 但触发条件复杂（需 plan 有 running 步 + acts 台账有未消化回执等），
    // 无法在标准 boot 环境直接 trip —— 已在 reject-v2780.js DEAD 表登记，
    // reject-code-gate 会走 deadMissing 判据（源码可达 + 在 DEAD 表）。
  }

  // ── v2.182.0（第二批 E2/E5/O4/O3/O5）：五只新聚合面的拒收码见证 ────────────
  //   这一批的码与前面几批形态不同：它们**不是**「参数传错」，而是**聚合面自己承认
  //   『这一栏我读不到真源』**。可读面的诚实边界必须能被见证，否则「读不到」与
  //   「读到了是空」在读数上同形 —— 那正是本仓反复裁决过的「点了没反应」。
  {
    // ① no-story-clock（engines/agenda.js）
    //   剧情时间缺失时**整表拒算**，不拿真实时间冒充剧情日（v2.161.0 TP3 时间源分域裁决：
    //   混算过一次，代价是离线间隔被抹平）。
    if (WA.agenda) {
      want('no-story-clock', 'agenda.upcoming：剧情钟未设定 ⇒ 整表拒算，不猜日期（E2·边界5）');
      WA.agenda.setSettings({ enabled: true });   // 开关关着时先撞 disabled：两码不同因，必须分开见证
      trip('no-story-clock', function () {
        var keep = null, had = false;
        WA.store.transact(function (d) {
          d.clock = d.clock || {};
          had = Object.prototype.hasOwnProperty.call(d.clock, 'label');
          keep = d.clock.label;
          delete d.clock.label;
        }, 'reject-witness:v2182-noclock');
        try { return [WA.agenda.upcoming().reason]; }
        finally {
          WA.store.transact(function (d) {
            d.clock = d.clock || {};
            if (had) d.clock.label = keep; else delete d.clock.label;
          }, 'reject-witness:v2182-noclock-restore');
        }
      });
    }
    // ② no-store（chronicle-view / capacity-audit / world-health 三处共用的同一件东西）
    //   三个面都按「store 缺席 ⇒ 这一栏读不到」拒算。缺的是**同一件东西**，故共用同一个码
    //   （这正是拒收码门禁的用意：同因同码，不同因不同码）。
    if (WA.chronicleView || WA.capacityAudit || WA.worldHealth) {
      want('no-store', '聚合面读不到 store ⇒ 该栏如实拒算（E5 编年史 / O4 清点 / O5 健康中心共用；与「读到了是空」可分）');
      if (WA.chronicleView) WA.chronicleView.setSettings({ enabled: true });
      if (WA.capacityAudit) WA.capacityAudit.setSettings({ enabled: true });
      if (WA.worldHealth) WA.worldHealth.setSettings({ enabled: true });
      trip('no-store', function () {
        var k = WA.store, out = [];
        WA.store = null;
        try {
          if (WA.chronicleView) { try { out.push(WA.chronicleView.entries().reason); } catch (e) {} }
          if (WA.capacityAudit) { try { out.push(WA.capacityAudit.obligations().reason); } catch (e) {} }
          if (WA.worldHealth) { try { out.push(WA.worldHealth.summary().reason); } catch (e) {} }
          return out;
        } finally { WA.store = k; }
      });
    }
    // ③ no-bytes（engines/perf-baseline.js bandOf）
    //   「这一局属于哪一档」只认**现场字节读数**（saveStat().bytes 或 sizeAudit().total），
    //   两处都取不到 ⇒ 报 no-bytes，**不默认成小局**（猜档位就是把「没测过」写成「小局」）。
    //   关键差别：bytes===0 是**真读数**（不是 null），故清零字节**不会**触发本码 ——
    //   见证必须走「连读数口都没有」的形态，而不是把字节清成 0。这条差别就是本码存在的理由。
    if (WA.perfBaseline) {
      want('no-bytes', 'perfBaseline.bands：现场字节读数取不到（无 saveStat 也无 sizeAudit）⇒ 如实报 no-bytes，不默认成小局');
      WA.perfBaseline.setSettings({ enabled: true });
      trip('no-bytes', function () {
        var k = WA.store;
        WA.store = { get: function () { return {}; } };   // 有 get（故不是 no-store），但没有任何字节读数口
        try { return [WA.perfBaseline.bands().reason]; } finally { WA.store = k; }
      });
    }
    // ④ no-perf-trace（engines/perf-baseline.js budget）
    //   预算表**不自带副本**（自带副本就是第二本账）：perfTrace 缺席时如实拒算。
    if (WA.perfBaseline) {
      want('no-perf-trace', 'perfBaseline.budget：perf-trace 缺席 ⇒ 预算表无从冻结，如实拒算（不自带副本）');
      trip('no-perf-trace', function () {
        var k = WA.perfTrace;
        WA.perfTrace = null;
        try { return [WA.perfBaseline.budget().reason]; } finally { WA.perfTrace = k; }
      });
    }
    // ⑤ needs-real-device（engines/perf-baseline.js gap）
    //   这一条**不是** ok:false —— 它是 ok:true + 五条实机必测项清单 + reason:'needs-real-device'。
    //   形态本身是裁决：把「无头环境的结构性上限」与「测量失败」分开，且**不留估算值占位**
    //   （CLASS_DEF.lowend.approx===true 已写明它是同机放大估计：把估计填进实测栏，下一个读者
    //   就再也分不出「手机上 60ms」与「桌上机估算 60ms」）。故见证**经真 API 读到那个码**即可，
    //   不在无头环境里「造出实机读数」—— 后者根本不是本码的意思。
    if (WA.perfBaseline) {
      want('needs-real-device', 'perfBaseline.gap：实机采样在无头环境结构不可达 ⇒ ok:true + 必测清单 + reason:needs-real-device（不留估算占位）');
      trip('needs-real-device', function () { return [WA.perfBaseline.gap().reason]; });
    }
  }

  // ── v2.184.0（第一批 E1）：统一待办事项中心的拒收码见证 ────────────────────
  //   本模块的码全是**「这条问不出答案」**那一族，且每种「问不出」都有不同的原因。
  //   合成一个 false 就是本仓反复裁决过的「点了没反应」—— 故逐个见证、逐个不同因：
  //     missing-kind  —— 根本没说要查哪个来源（调用方漏了参数）
  //     unknown-kind  —— 说了，但本中心不认识（不编路由，不猜）
  //     not-found     —— 认得这个来源，但它此刻没有这条记录
  //     bad-shape     —— 来源在场，但它给的形状本中心归一不了（**不猜字段**）
  //   另有 source-threw：来源的 pending() 自己抛了 —— 它必须与「缺席」分开：
  //     缺席是环境事实，抛错是缺陷现场，两者在读数上必须不同。
  if (WA.pendingCenter) {
    want('missing-kind', 'pendingCenter.describe：没填类型 ⇒ 拒收（缺参数与查不到必须不同因）');
    want('unknown-kind', 'pendingCenter.describe：未知来源类型 ⇒ 拒收并回带该类型（本中心不认识的类型不编路由）');
    want('not-found', 'pendingCenter.describe：来源在场但该条记录不在它的待办里 ⇒ not-found（与 missing/unknown 分开）');
    want('bad-shape', 'pendingCenter.items：来源在场但 pending() 返回形状归一不了 ⇒ 如实进 skipped（不猜字段）');
    want('source-threw', 'pendingCenter.items：来源的 pending() 抛错 ⇒ 与「缺席」分开报（环境事实 vs 缺陷现场）');
    WA.pendingCenter.setSettings({ enabled: true });
    // 顺序即语义：先撞「没填类型」，再撞「不认识」，再撞「认得但没这条」。
    //   三码若被压成一个，后两条见证会在**同一次**里同时命中同一个码 —— 那正是判据要抓的。
    trip('missing-kind', function () { return [WA.pendingCenter.describe('').reason]; });
    trip('unknown-kind', function () { return [WA.pendingCenter.describe('no_such_source').reason]; });
    trip('not-found', function () {
      // 用一个**在场**的来源查一条不存在的记录。coop 是必装引擎（index.js LOAD_ORDER 里），
      //   故这里不需要造桩；查不到的 id 用固定串，与真记录不可能撞。
      return [WA.pendingCenter.describe('coop', 'no_such_record_zz').reason];
    });
    trip('bad-shape', function () {
      var k = WA.coop;
      WA.coop = { pending: function () { return { ok: true, items: [] }; } };   // 错形状：给对象而不是裸数组
      try { return WA.pendingCenter.items().skipped.filter(function (s) { return s.source === 'coop'; }).map(function (s) { return s.reason; }); }
      finally { WA.coop = k; }
    });
    trip('source-threw', function () {
      var k = WA.farfield;
      WA.farfield = { pending: function () { throw new Error('witness-boom'); } };
      try { return WA.pendingCenter.items().skipped.filter(function (s) { return s.source === 'farfield'; }).map(function (s) { return s.reason; }); }
      finally { WA.farfield = k; }
    });
  }
  // ── engines/campaign.js（v2.187.0 · E4 场景 / 战役层）──
  //   本版新增七个码，**逐条**走产品真 API 触发（不拿常量凑数）：
  //     disabled / no-scene / unknown-scene / blueprint-absent / unreadable / not-met / finished
  //   两条最要紧的见证是 `unreadable` 与 `not-met` **同时跑出来** ——
  //   本模块存在的第一理由就是「读不到」与「没达成」不许在读数上同形，
  //   若见证只跑出其中一个，那条边界就没有任何东西在看着它。
  if (WA.campaign && typeof WA.campaign.advance === 'function') {
    const Cp = WA.campaign;
    const keepEnabled = Cp.getSettings().enabled;
    const bp = WA.worldBlueprint;
    const keepDipl = WA.diplomacy;
    // ① disabled：关闭时开局被拒
    Cp.setSettings({ enabled: false });
    want('disabled', 'campaign.start：战役层关着时不开局（不是静默什么都不做）');
    trip('disabled', function () { return [Cp.start('blank').reason, Cp.advance().reason]; });
    // ② unknown-scene：未知场景 id
    Cp.setSettings({ enabled: true });
    want('unknown-scene', 'campaign.start：场景 id 不在蓝图 SCENES 里（本模块不兜底）');
    trip('unknown-scene', function () { return [Cp.start('绝对不存在的场景').reason]; });
    // ③ no-scene：还没开局就推进
    Cp.reset(false);
    want('no-scene', 'campaign.advance：还没开局时的推进');
    trip('no-scene', function () { return [Cp.advance().reason]; });
    want('no-campaign', 'campaign.status：没有进行中的一局（读面如实报「还没开局」）');
    trip('no-campaign', function () { return [Cp.status().reason]; });
    // ④ blueprint-absent：蓝图缺席 ⇒ 拿不到模板
    try {
      WA.worldBlueprint = undefined;
      want('blueprint-absent', 'campaign.templates：蓝图模块缺席（本模块不兜底模板）');
      trip('blueprint-absent', function () { return [Cp.templates().reason, Cp.start('blank').reason]; });
    } finally { WA.worldBlueprint = bp; }
    // ⑤ unreadable / ⑥ not-met：**两条必须同时跑出来**（本模块最要紧的那个区分）
    Cp.start('blank');
    const keepRead = WA.store.read;
    try {
      WA.store.read = function (k) { return k === 'clock.dayIndex' ? null : keepRead.call(WA.store, k); };
      want('unreadable', 'campaign.advance：判据读不到（引擎/字段不可读）—— 与「没达成」不是一回事，阶段不前进');
      trip('unreadable', function () { return [Cp.advance().reason]; });
    } finally { WA.store.read = keepRead; }
    WA.store.transact(function (d) { d.clock.dayIndex = 0; });
    want('not-met', 'campaign.advance：判据读到了但还没达成（天数不足）');
    trip('not-met', function () { return [Cp.advance().reason]; });
    // ⑦ finished：结束之后再推进
    WA.store.transact(function (d) { d.clock.dayIndex = 99; });
    Cp.advance(); Cp.advance();
    want('finished', 'campaign.advance：这一局已结束（要重开请点清进度）');
    trip('finished', function () { return [Cp.advance().reason]; });
    // ⑧ stage-out-of-range：阶段索引越过末阶段
    want('stage-out-of-range', 'campaign.advance：阶段索引已越过最后一条（数据被外部改坏时的如实归因）');
    trip('stage-out-of-range', function () {
      Cp.start('blank');
      WA.store.transact(function (d) { d.campaign.stage = 99; d.clock.dayIndex = 0; });
      return [Cp.advance().reason];
    });
    Cp.reset(false);
    Cp.setSettings({ enabled: keepEnabled });
  }
  // ── engines/perspective-lock.js（v2.186.0 · O9 全知出口闸）──
  //   本版新增两个码，都在 `outletAllowed` 的**返回体**里（不是 throw）：
  //     · 'player-view'     玩家视角下出口被拦（`allowed:false`，不是错误）；
  //     · 'module-disabled' 整个视角锁关掉 ⇒ 不设闸（如实登记「为什么放行」）。
  //   见证必须**两向**：只跑出「拦」那一码，会把「模块关掉也拦」这种错读成对的
  //   （那正是「关掉视角锁 = 连日志都复制不了」的形态）。
  if (WA.perspective && typeof WA.perspective.outletAllowed === 'function') {
    want('player-view', 'perspective.outletAllowed：玩家视角下出口拦下（ok:true / allowed:false，不是异常）');
    want('module-disabled', 'perspective.outletAllowed：视角锁关闭时不设闸（如实报「为什么放行」）');
    const Pv = WA.perspective;
    const saveViewOn = Pv.getSettings().enabled;
    Pv.setSettings({ enabled: true });
    Pv.setView('player');
    trip('player-view', function () { return [Pv.outletAllowed('clipboard').reason]; });
    Pv.setSettings({ enabled: false });
    trip('module-disabled', function () { return [Pv.outletAllowed('clipboard').reason]; });
    Pv.setSettings({ enabled: saveViewOn });
    Pv.setView('omniscient');
  }
  // ── ui/panel.js（v2.187.0 · E8 依赖体检的输入面）──
  //   本版新增**一个**码，它不在引擎里、也不在任何模块的返回体里：
  //     `bad-json` 产生于**面板的输入解析**（`#wa-dc-in` 里那一坨 JSON 没粘对）。
  //   为什么它必须自成一码、不许并进引擎的 `bad-shape`：两者处置相反 ——
  //     · `bad-json` = **粘错了**（空输入 / 语法错），要人回去改那一坨文本；
  //     · `bad-shape` = **这份东西不合规**（解析成功但形状不像可搬物），要人换一份。
  //   合成一个「收不了」，会让「我复制漏了半截」与「这类东西本模块不认」长得一样。
  //   见证走**真点击**（与上面 B5/B6 五条 UI 码同规格：点 tab 走真实绑定 → 处理器执行
  //   → 结果落进面板 dataset 回执位），**不打桩** —— 空输入是真实可发生的现场。
  {
    const uiGate3 = require('./ui-gate-sync.js');
    const env3 = uiGate3.fresh();
    const dom3 = env3.dom;
    const panelEl3 = dom3.getElementById('wa-panel');
    const tabs3 = panelEl3 ? panelEl3.querySelectorAll('.wa-tab') : [];
    const toolsTab = tabs3.filter(function (x) { return x.dataset && x.dataset.page === 'tools'; })[0];
    if (toolsTab) toolsTab.click();
    const B3 = function (id) { return dom3.getElementById(id); };
    want('bad-json', 'panel：依赖体检的输入框是空的 / JSON 语法坏 ⇒ 拒收说清是「JSON 坏了」（不并进引擎的 bad-shape）');
    trip('bad-json', function () {
      const ta = B3('wa-dc-in');
      if (ta) ta.value = '';              // ① 空输入
      const b = B3('wa-dc-check');
      if (!b) return [];
      b.click();
      const first = String((panelEl3.dataset || {}).dcOut || '').split('：')[0];
      // ② 语法坏：粘半截 JSON 也必须给同一个码（同一码面、两种坏法）
      if (ta) ta.value = '{"bpVer": 1,';
      b.click();
      const second = String((panelEl3.dataset || {}).dcOut || '').split('：')[0];
      return [first, second];
    });
  }
  // ══════════ v2.188.0（第四批 E7 + E9）：两面新模块的 14 个新码 ══════════
  //   本批不给 base 添新条目 —— 仓规是「新码必须有可执行见证」（未登记的无消费者导出即红，
  //   同理：没有见证的码＝没人真看过的码）。14 条全部用**真 API** 跑出来，探针先实测过
  //   （tools/probe_reject188.js：先跑一次看真返回，再照读数写见证）。
  //   每一条都在**同一入口的两种局面**上分列，那些分列正是这些码存在的理由。
  {
    WA.rulePack.setSettings({ enabled: true });
    // ① 空面：把设置登记面摘空 ⇒ 这一面在**真实可发生**的处境下有一个键都进不了包
    //    （不是「值没设」，而是「面本身是空的」——两者处置相反）。
    want('empty-surface', 'E7：规则面一个可读键都没有 ⇒ 如实拒收（不与「跑出个空包」混同）');
    trip('empty-surface', function () {
      const keep = WA.__settingsRegs;
      try {
        WA.__settingsRegs = [];
        return WA.rulePack.save('见证空面').reason;
      } finally { WA.__settingsRegs = keep; }
    });
    // ② 凭空输入 / ③ 键全不认识：都是「导入」这一口的两种坏法，但一个是「没给东西」，
    //    一个是「给了东西而本侧一个键都不认识」——处置相反，故分列。
    want('empty-input', 'E7：导入空文本 ⇒ empty-input（不是「解析失败」，也不是「空的包」）');
    trip('empty-input', function () { return WA.rulePack.importPack('   ').reason; });
    want('no-usable-keys', 'E7：导入的键在本侧一个都不认识 ⇒ 不写任何东西并如实点名');
    trip('no-usable-keys', function () {
      return WA.rulePack.importPack(JSON.stringify({ rulePack: 1, name: 'x', values: { 这是不存在的键: 1 } })).reason;
    });
    // ④ 存储面抛异常：`save-threw` 与 `settings-bus-absent` 是**两个不同根因**
    //    （前者「写了但写炸了」，后者「根本没有那一路写口」）—— 合成一个会让现场无法归因。
    want('save-threw', 'E7：设置写路径抛出 ⇒ 如实报 save-threw（不静默当成功）');
    trip('save-threw', function () {
      const keep = WA.settingsBus.saveOrThrow;
      try {
        WA.settingsBus.saveOrThrow = function () { throw new Error('见证：写路径抛'); };
        return WA.rulePack.save('见证抛').reason;
      } finally { WA.settingsBus.saveOrThrow = keep; }
    });
    want('settings-bus-absent', 'E7：切换包时发现写入口缺席 ⇒ 不逐键半写，先整体拒收');
    trip('settings-bus-absent', function () {
      const keepSave = WA.settingsBus.saveOrThrow;
      try {
        WA.rulePack.save('见证缺席');
        WA.settingsBus.saveOrThrow = undefined;
        return WA.rulePack.apply('见证缺席').reason;
      } finally { WA.settingsBus.saveOrThrow = keepSave; }
    });
    // ⑤ 模板三条形状闸：每个都是**独立的量**（轮次间隔 / 调用预算 / 失败策略），
    //    合成一个 bad-template 会让「改哪一处」在面板上不可分。
    want('bad-every', 'E7：模板轮次间隔非法 ⇒ bad-every（与预算分开点名）');
    trip('bad-every', function () {
      return WA.rulePack.template.set([{ id: 'w1', action: 'pending.sweep', every: 0, budget: 1 }]).reason;
    });
    want('bad-budget', 'E7：模板调用预算非法 ⇒ bad-budget（与轮次分开点名）');
    trip('bad-budget', function () {
      return WA.rulePack.template.set([{ id: 'w2', action: 'pending.sweep', every: 1, budget: 0 }]).reason;
    });
    want('bad-fail-policy', 'E7：失败策略不在封闭词表（stop/skip）⇒ 如实报出并把词表带回来');
    trip('bad-fail-policy', function () {
      return WA.rulePack.template.set([{ id: 'w3', action: 'pending.sweep', every: 1, budget: 1, failPolicy: '这是不存在的策略' }]).reason;
    });
    want('bad-round', 'E7：轮次不是有限数 ⇒ 拒收（NaN 不得被当成某一轮）');
    trip('bad-round', function () { return WA.rulePack.template.dueAt('不是数').reason; });
    // ⑥ 「一条都没配」与「配了但全跑完」是两种处境。
    want('no-templates', 'E7：模板表为空 ⇒ no-templates（不是「跑了 0 条 = 成功」）');
    trip('no-templates', function () {
      WA.rulePack.template.reset();
      return WA.rulePack.template.run({}).reason;
    });
    // ⑦ 预算跑满：**不是静默跳过** —— 该条逐条记进 trace 并说清「用了几次/上限几次」。
    want('budget-exhausted', 'E7：预算跑满 ⇒ 该条不调用并如实记 budget-exhausted（判据读的是 trace 里的现场）');
    trip('budget-exhausted', function () {
      WA.rulePack.template.reset();
      WA.rulePack.template.set([{ id: 'w4', action: 'pending.sweep', every: 1, budget: 1 }]);
      WA.rulePack.template.run({});
      const second = WA.rulePack.template.run({});
      return (second.trace[0] || {}).reason;
    });
    WA.rulePack.template.reset();
  }
  {
    WA.worldLab.setSettings({ enabled: true });
    // ⑧ 没跑过实验时三个读口各报 no-lab：**不是空数组冒充** —— 「没做」与「做了但与无」分列。
    want('no-lab', 'E9：没跑过实验时读口报 no-lab（不用空数组/空对象冒充「什么都没有」）');
    trip('no-lab', function () {
      WA.worldLab.discard();
      return [WA.worldLab.arms().reason, WA.worldLab.diff().reason, WA.worldLab.staleness().reason];
    });
    want('empty-path', 'E9：路径一行都没有 ⇒ empty-path（与「步数超限」分列）');
    trip('empty-path', function () { return WA.worldLab.parseSteps('   ', 6).reason; });
    // ⑨ 蓝图引擎的两种局面：缺席（那个口不在）与失败（对口在、导不出）——处置相反。
    want('export-failed', 'E9：蓝图导出失败 ⇒ 拒收并把失败原因原样带回（不折成「导出了一份空的」）');
    trip('export-failed', function () {
      const keep = WA.worldBlueprint;
      try {
        WA.worldBlueprint = { exportBlueprint: function () { return { ok: false, reason: '见证：导不出' }; } };
        return WA.worldLab.exportAs('blueprint').reason;
      } finally { WA.worldBlueprint = keep; }
    });
  }
  // ══════════ v2.189.0（缝 A1/A2/A3 + B1/B2）：四个新引擎的 16 个码 ══════════
  //   本批同规：**新码必须有可执行见证**（没有见证的码＝没人真看过的码）。
  //   16 条全部用**真 API** 跑出来，读数先由 tools/probe_reject189.js 实测（先跑一次看真返回，
  //   再照读数写见证）。每块都按「同一入口的两种局面分列」——那些分列正是这些码存在的理由：
  //   「没给」与「给坏了」、「没有那一刻」与「等得不够」、「还没演」与「立不住」处置相反。
  {
    // ── A1 beat-report：六码 ──
    //   「表外的档」与「表内的档却缺必填」是两件不同的事（前者是词表闸，后者是各档的硬条件），
    //   故 bad-verdict / missing-purpose / purpose-changed / missing-need / missing-round 逐条分列。
    //   （bad-round 由 E7 段已 want，本章不重复声明，但必须真跑一遍证明它在本引擎里也可达 ——
    //     实测它原先走 inputGuard.count，而 count('abc')===0 把坏输入塌成 0，于是码写得出、
    //     跑不到；本轮已修为严格判定。）
    const BRw = WA.beatReport;
    if (BRw && typeof BRw.report === 'function') {
      BRw.setSettings({ enabled: true, strikesPerChapter: 1, redesignPerChapter: 1, minGapRounds: 1 });
      want('bad-verdict', 'A1：档位不在四值白名单 ⇒ 整次拒收并带回 allowed（不做「宽容降级」）');
      trip('bad-verdict', function () { return BRw.report({ verdict: '这个档不在表里', chapterKey: 'W1' }).reason; });
      want('missing-purpose', 'A1：调整档没给出这一拍要达到的结果 ⇒ 拒收（换场合可以，丢结果不行）');
      trip('missing-purpose', function () { return BRw.report({ verdict: 'adjust', chapterKey: 'W1' }).reason; });
      want('purpose-changed', 'A1：调整档把这一拍的目的换掉了 ⇒ 拒收（那是换了一拍，必须走 reject）');
      trip('purpose-changed', function () { return BRw.report({ verdict: 'adjust', chapterKey: 'W1', purpose: '让她退让', keeps: false }).reason; });
      want('missing-need', 'A1：缺铺垫却不说缺哪一步因 ⇒ 拒收且不按住（不说缺什么＝把一拍无限期悬起来）');
      trip('missing-need', function () { return BRw.report({ verdict: 'setup', chapterKey: 'W1' }).reason; });
      want('missing-round', 'A1：驳回档要记账与间隔，却没给决策轮号 ⇒ 拒收');
      trip('missing-round', function () { return BRw.report({ verdict: 'reject', chapterKey: 'W1' }).reason; });
      want('redesign-exhausted', 'A1：同一章改篇章已到上限 ⇒ 如实拒收「再去改」，但这次计数照落（拒的是改篇章，不是「不严重」）');
      trip('redesign-exhausted', function () {
        BRw.report({ verdict: 'reject', chapterKey: 'W1', round: 10 });
        return BRw.report({ verdict: 'reject', chapterKey: 'W1', round: 12 }).reason;
      });
    }
    // ── A3 beat-ledger：四码 ──
    //   「拍序空了」与「拍标题是空的」是两个量（前者是没给本幕，后者是给了空标题）；
    //   「换场不给过渡」与「自改拍号」也是两个不同入口的硬条件。
    const BLw = WA.beatLedger;
    if (BLw && typeof BLw.plan === 'function') {
      BLw.setSettings({ enabled: true });
      want('missing-title', 'A3：拍标题必须非空 ⇒ 空标题拒收（否则「这一拍讲什么」只能靠读正文猜）');
      trip('missing-title', function () { return BLw.plan(['  ', '投宿']).reason; });
      want('landed-immutable', 'A3：已落的拍是既成事实 ⇒ 重排改写它的标题被拒收（演过的东西不得改写）');
      trip('landed-immutable', function () {
        BLw.plan(['进城', '投宿']);
        BLw.land({}); BLw.land({});
        return BLw.plan(['换个说法重演', '另一拍']).reason;
      });
      want('hard-cut', 'A3：换场不给过渡 ⇒ hard-cut（不许一句话从宿舍切到列车）');
      trip('hard-cut', function () { return BLw.transition({ from: '宿舍', to: '列车' }).reason; });
      want('beat-order-locked', 'A3：模型自报的拍号与引擎账不符 ⇒ 拒收并留痕（拍号由引擎推进，模型自改不算数）');
      trip('beat-order-locked', function () {
        // 已落的两拍保留在同样位置与标题上，补一拍 pending ⇒ 当前拍是第 3 拍。
        //   （不能用两条标题：前面那条见证已把两拍落地，重排成两条会一拍不剩，
        //     claim 会先撞上 no-pending 而轮不到本码 —— 见证自己的构造也得守「已落不可改写」。）
        BLw.plan(['进城', '投宿', '第三拍']);
        return BLw.claim(99).reason;
      });
    }
    // ── A2 plan-audit：两码 ──
    //   「拿已写过的章来复验」与「小改引入了新东西」是同模块两个不同入口，处置相反。
    const PAw = WA.planAudit;
    if (PAw && typeof PAw.audit === 'function') {
      PAw.setSettings({ enabled: true });
      want('already-written', 'A2：已写过的章不进复验面 ⇒ 拒收（它不再是可以改的东西）');
      trip('already-written', function () { return PAw.audit([{ id: 'w', title: '已写过的安排', landed: true }]).reason; });
      want('not-equivalent', 'A2：小改引入了新的人 / 新地点 / 灾变口吻 ⇒ not-equivalent 并逐类报出命中项');
      trip('not-equivalent', function () { return PAw.equivalent({ cast: ['阿明'] }, { cast: ['阿明', '查无此人甲'] }).reason; });
    }
    // ── B1+B2 gen-gate：四码（+ bad-round 复核）──
    //   四道闸门各报各的：跨线间隔(too-soon) / 上一章余波(aftermath-wait) / 新章静默期(quiet-period) /
    //   没有那一刻(no-aftermath)。把四道折成一个「不许」会让现场无法归因是哪一道卡着。
    const GGw = WA.genGate;
    if (GGw && typeof GGw.gate === 'function') {
      GGw.setSettings({ enabled: true, minGap: 3, chapterGap: 4, quietRounds: 3, interludeGap: 3 });
      want('no-aftermath', 'B1：上一章还没有收尾时刻 ⇒ 拒收（不把「没有那一刻」当成「已经等了很久」，那会让它当场放行）');
      trip('no-aftermath', function () { return GGw.gate('chapter', { round: 10 }).reason; });
      want('aftermath-wait', 'B1：收尾后余波不够 ⇒ 报哪一道闸门卡着与还要等几轮（wait 是「还要等」，不是「不许」）');
      trip('aftermath-wait', function () { return GGw.gate('chapter', { round: 10, aftermathAt: 9 }).reason; });
      want('quiet-period', 'B1：刚换章先把主线立住 ⇒ 新章静默期未过时拒插支线');
      trip('quiet-period', function () { return GGw.gate('thread', { round: 5, chapterOpenedAt: 4 }).reason; });
      want('gated-off', 'B1：总开关关闭 ⇒ gate 如实报 gated-off（不是「这一刻允许生成」）');
      trip('gated-off', function () {
        GGw.setSettings({ enabled: false });
        const r = GGw.gate('thread', { round: 1 });
        GGw.setSettings({ enabled: true });
        return r.reason;
      });
      trip('bad-round', function () { return GGw.gate('thread', { round: '不是数' }).reason; });
    }
  }
  const missing = Object.keys(expect).filter(function (c) { return !seen[c]; });
  const unexpected = Object.keys(seen).filter(function (c) { return !expect[c]; });
  return { expect: expect, seen: seen, missing: missing, unexpected: unexpected };
}

function tables() { return { DEAD: DEAD }; }
module.exports = { tables: tables, DEAD: DEAD, runWitness: runWitness };
