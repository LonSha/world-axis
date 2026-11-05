# V12 全文件最终处置审计账

状态：338/338 文件完成静态行为审计；6 个疑似入口已完成人工入口复核。
本账给出当前处置，不把每个文件都强行改造；只有实际产生玩家收益或跨引擎闭环价值的文件进入实现批次。

## 最终结论

1. 338 个文件全部有明确处置，不存在基于当前证据可以直接删除的文件。
2. `core/fault-context.js`、`core/interceptor.js`、`core/schema.js` 均属于真实宿主/核心生命周期，不是孤岛。
3. 三个赛博 UI 文件由 `index.js` 加载，并被主题切换、诊断和模块门禁消费，不是孤岛。
4. V12 的主要改造对象不是“补齐所有文件”，而是让既有写口沿场景合同形成跨域闭环。
5. 诊断、只读、主题和基础设施文件默认不新增玩法；它们只在主线需要时适配消费者。

## 18 项处置方向

| 项 | 当前结论 | 首批真实实现范围 | 依赖 |
|---|---|---|---|
| OPV12-1 | 融合既有人物生活与行动链 | `life`, `agency`, `plan`, `motive-arbitration`, `relation-temp`, `agenda` | OPV12-9 |
| OPV12-2 | 融合事件、因果、伏笔和调查链 | `events`, `causal`, `aftermath`, `foreshadow`, `investigation` | OPV12-1 |
| OPV12-3 | 融合经济、生产、运输和组织链 | `economy`, `production`, `freight`, `labor-schedule`, `diplomacy`, `credit-ledger` | OPV12-1/2 |
| OPV12-4 | 融合时间、地点和远方推进 | `clock`, `playtime`, `geo-tracker`, `farfield`, `horizon`, `region` | OPV12-2/3 |
| OPV12-5 | 统一证据、认知、记忆和传播消费 | `intel`, `epistemic-view`, `pmem`, `rumor`, `memory`, `periodicals` | OPV12-2 |
| OPV12-6 | 让叙事只消费已结算状态 | `backstage`, `scene-narrative`, `beat-*`, `ensemble`, `reasoning*` | OPV12-1/2/5 |
| OPV12-7 | 统一行动回执、成本、风险和成长 | `act`, `action-methods`, `training`, `success-grade`, `story-choice` | OPV12-1/2 |
| OPV12-8 | 将开局蓝图转为可玩的冲突网络 | `playable-blueprint`, `playable-seed`, `first-run`, `periodicals` | OPV12-1/2/3 |
| OPV12-9 | 建立场景协同和玩家工作台消费面 | `liaison`, `workflow`, `intake-dispatch`, `pending-center`, `ui/panel` | 全部 OPV |
| EXV12-1 | 适配为导演意图层，不新造状态 | `stage`, `story-tone`, `tempo`, `theme`, `rule-pack` | OPV12-9 |
| EXV12-2 | 复用共享证据包生成多视角 | `epistemic-view`, `observation-projection`, `periodicals` | OPV12-2/5 |
| EXV12-3 | 让地点沉积反哺人物、组织和事件 | `sediment`, `aftermath`, `community-note`, `region` | OPV12-2/3/4 |
| EXV12-4 | 统一承诺、债务、关系和外交履约 | `life`, `agenda`, `credit-ledger`, `relation-graph`, `diplomacy` | OPV12-1/3 |
| EXV12-5 | 把多解路线统一为可结算场景 | `diplomacy`, `contest`, `ruling`, `investigation`, `story-choice` | OPV12-2/7 |
| EXV12-6 | 让慢变量改变阶段和玩法条件 | `era-cycle`, `phase-transition`, `institutional-inertia`, `tech-lineage` | OPV12-3/4/5 |
| EXV12-7 | 让信息渠道成为玩家行动入口 | `periodicals`, `intel`, `rumor`, `opinion`, `history-search` | OPV12-5/9 |
| EXV12-8 | 让题材包产出目标、关系和冲突 | `preset-world`, `recipe`, `playable-blueprint`, `stage` | OPV12-8 |
| EXV12-9 | 隔离分支并解释后果链 | `checkpoints`, `branch-tree`, `branch-diff`, `rehearsal`, `parallel-world` | OPV12-2/9 |

## 338 文件逐项处置

| 文件 | 行数 | 现有行为分类 | 事务 | 跨文件调用 | UI消费者 | V12主归属 | 最终处置 |
|---|---:|---|---:|---:|---:|---|---|
| `engines/act.js` | 5 | behavior-wired | 0 | 9 | 1 | OPV12-7 | 融合现有链路后升级 |
| `engines/action-desk.js` | 1 | behavior-wired | 5 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/action-methods.js` | 1 | read-consumer | 0 | 3 | 0 | OPV12-7 | 保留为消费面并复核实际收益 |
| `engines/activity.js` | 5 | behavior-wired | 16 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/affect.js` | 5 | behavior-wired | 3 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/aftermath-impact.js` | 1 | behavior-wired | 5 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/aftermath.js` | 2 | behavior-wired | 3 | 7 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/agency.js` | 4 | behavior-wired | 3 | 5 | 1 | OPV12-1 | 融合现有链路后升级 |
| `engines/agenda.js` | 1 | read-consumer | 0 | 4 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/anti-omniscience.js` | 3 | read-consumer | 0 | 4 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/appearance.js` | 5 | behavior-wired | 1 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/archive-hide.js` | 1 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/atlas.js` | 1 | behavior-wired | 0 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/auto-hide.js` | 1 | behavior-wired | 0 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/backstage-tone.js` | 2 | behavior-wired | 2 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/backstage.js` | 11 | behavior-wired | 4 | 16 | 2 | OPV12-6 | 融合现有链路后升级 |
| `engines/beast-bond.js` | 5 | behavior-wired | 3 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/beat-facade.js` | 2 | behavior-wired | 0 | 3 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/beat-ledger.js` | 3 | behavior-wired | 4 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/beat-mask.js` | 4 | behavior-wired | 3 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/beat-report.js` | 3 | behavior-wired | 1 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/beat.js` | 1 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/binding.js` | 1 | behavior-wired | 2 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/bonds.js` | 5 | behavior-wired | 1 | 10 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/branch-diff.js` | 1 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/branch-tree.js` | 1 | behavior-wired | 2 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/bridge.js` | 1 | behavior-wired | 0 | 7 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/calendar-custom.js` | 1 | behavior-wired | 2 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/calendar.js` | 1 | behavior-wired | 1 | 7 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/campaign.js` | 1 | behavior-wired | 1 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/canon.js` | 4 | behavior-wired | 2 | 8 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/capability-audit.js` | 1 | read-consumer | 0 | 5 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/capability-tier.js` | 1 | behavior-wired | 0 | 7 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/capacity-audit.js` | 1 | behavior-wired | 0 | 6 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/care-chain.js` | 1 | behavior-wired | 5 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/causal.js` | 6 | behavior-wired | 0 | 10 | 1 | OPV12-2 | 融合现有链路后升级 |
| `engines/chapters.js` | 4 | behavior-wired | 2 | 2 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/chatcache.js` | 1 | read-consumer | 0 | 1 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/checkpoints.js` | 6 | behavior-wired | 1 | 8 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/chronicle-view.js` | 1 | read-consumer | 0 | 5 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/chrono.js` | 3 | behavior-wired | 1 | 8 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/collab.js` | 1 | behavior-wired | 11 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/commission.js` | 2 | behavior-wired | 3 | 8 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/commons-governance.js` | 1 | behavior-wired | 7 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/community-note.js` | 1 | behavior-wired | 0 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/compact-timing.js` | 1 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/compare.js` | 8 | behavior-wired | 0 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/contest.js` | 4 | behavior-wired | 8 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/contract-audit.js` | 6 | behavior-wired | 1 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/coop.js` | 1 | behavior-wired | 2 | 5 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/coordinate.js` | 2 | behavior-wired | 2 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/credit-ledger.js` | 1 | behavior-wired | 1 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/custom-lax.js` | 1 | behavior-wired | 19 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/day-route.js` | 1 | behavior-wired | 0 | 5 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/deep-clean.js` | 4 | behavior-wired | 0 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/defer-token.js` | 1 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/demographic-flow.js` | 1 | behavior-wired | 6 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/dep-check.js` | 1 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/difficulty.js` | 6 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/digest.js` | 2 | behavior-wired | 1 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/diplomacy.js` | 1 | behavior-wired | 6 | 7 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/direct-event.js` | 9 | behavior-wired | 3 | 1 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/dream-settle.js` | 2 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/dream.js` | 2 | behavior-wired | 3 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/driver-ledger.js` | 1 | behavior-wired | 0 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/eco-audit.js` | 1 | read-consumer | 0 | 5 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/economy.js` | 1 | behavior-wired | 8 | 15 | 1 | OPV12-3 | 融合现有链路后升级 |
| `engines/editor-events.js` | 3 | behavior-wired | 0 | 3 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/editor-faction.js` | 3 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/elsewhere.js` | 3 | behavior-wired | 4 | 5 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/enemies.js` | 4 | behavior-wired | 0 | 3 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/enigma.js` | 5 | behavior-wired | 3 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/ensemble.js` | 1 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/entities.js` | 3 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/entry-router.js` | 12 | read-consumer | 0 | 1 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/environmental-capacity.js` | 1 | behavior-wired | 7 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/ephemeral-scrub.js` | 6 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/epistemic-view.js` | 1 | behavior-wired | 4 | 3 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/era-cycle.js` | 5 | behavior-wired | 2 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/events.js` | 8 | behavior-wired | 5 | 7 | 1 | OPV12-2 | 融合现有链路后升级 |
| `engines/evidence-board.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/evolution.js` | 4 | behavior-wired | 6 | 25 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/faction-graph.js` | 1 | read-consumer | 0 | 6 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/family-ops.js` | 1 | behavior-wired | 7 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/family.js` | 6 | behavior-wired | 8 | 5 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/farfield.js` | 1 | behavior-wired | 1 | 8 | 1 | OPV12-4 | 融合现有链路后升级 |
| `engines/fate.js` | 1 | behavior-wired | 0 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/field-writers.js` | 1 | behavior-wired | 0 | 0 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/first-run.js` | 1 | behavior-wired | 0 | 5 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/floor-changes.js` | 1 | behavior-wired | 0 | 3 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/floor-settle.js` | 1 | behavior-wired | 4 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/floor-snapshot.js` | 2 | read-consumer | 0 | 4 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/followup-gate.js` | 1 | behavior-wired | 1 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/fondness.js` | 8 | behavior-wired | 8 | 5 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/foreshadow.js` | 1 | behavior-wired | 4 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/freight.js` | 1 | behavior-wired | 5 | 8 | 1 | OPV12-3 | 融合现有链路后升级 |
| `engines/gauge.js` | 2 | behavior-wired | 2 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/gear.js` | 1 | behavior-wired | 8 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/gen-gate.js` | 3 | read-consumer | 0 | 4 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/gen-timing.js` | 3 | behavior-wired | 2 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/geo-tracker.js` | 9 | behavior-wired | 2 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/group-refuse.js` | 1 | read-consumer | 0 | 2 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/handoff-pack.js` | 1 | behavior-wired | 0 | 4 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/hazard.js` | 5 | behavior-wired | 7 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/health-preflight.js` | 6 | behavior-wired | 0 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/history-search.js` | 1 | behavior-wired | 0 | 2 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/horizon.js` | 2 | behavior-wired | 6 | 6 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/host-wb-trace.js` | 2 | read-consumer | 0 | 4 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/identity-match.js` | 1 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/inject-budget.js` | 14 | behavior-wired | 0 | 7 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/inject-channel.js` | 2 | read-consumer | 0 | 1 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/inject-collector.js` | 10 | behavior-wired | 0 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/inject-inspector.js` | 1 | read-consumer | 0 | 4 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/inject-slot-audit.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/inject-value.js` | 2 | read-consumer | 0 | 7 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/inline-tags.js` | 4 | behavior-wired | 2 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/inspector-state.js` | 1 | behavior-wired | 0 | 2 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/inst.js` | 1 | behavior-wired | 9 | 8 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/institutional-inertia.js` | 1 | behavior-wired | 6 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/intake-dispatch.js` | 1 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/intel.js` | 4 | behavior-wired | 7 | 12 | 1 | OPV12-5 | 融合现有链路后升级 |
| `engines/intent-board.js` | 1 | behavior-wired | 0 | 7 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/interest-face.js` | 1 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/interop.js` | 1 | behavior-wired | 0 | 2 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/investigation.js` | 2 | behavior-wired | 3 | 8 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/kaleidoscope.js` | 7 | behavior-wired | 0 | 1 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/karma.js` | 5 | behavior-wired | 3 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/knowledge-practice.js` | 1 | behavior-wired | 5 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/l3-registry.js` | 1 | read-consumer | 0 | 1 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/labor-schedule.js` | 1 | behavior-wired | 10 | 9 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/ladder.js` | 5 | behavior-wired | 4 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/ledger-timeline.js` | 1 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/ledger.js` | 3 | behavior-wired | 3 | 3 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/length-policy.js` | 2 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/liaison.js` | 1 | behavior-wired | 0 | 2 | 0 | OPV12-9 | 融合现有链路后升级 |
| `engines/life.js` | 4 | behavior-wired | 4 | 11 | 1 | OPV12-1 | 融合现有链路后升级 |
| `engines/lifeline.js` | 1 | behavior-wired | 2 | 9 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/limits.js` | 1 | read-consumer | 0 | 1 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/lingqi.js` | 2 | read-consumer | 0 | 4 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/living-world.js` | 2 | behavior-wired | 11 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/longline.js` | 1 | behavior-wired | 1 | 7 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/lonsha-reader.js` | 1 | behavior-wired | 0 | 3 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/marginal.js` | 5 | behavior-wired | 6 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/masks.js` | 5 | behavior-wired | 2 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/memory-sampler.js` | 4 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/memory-tiers.js` | 2 | behavior-wired | 0 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/memory.js` | 9 | behavior-wired | 4 | 5 | 1 | OPV12-5 | 融合现有链路后升级 |
| `engines/mend.js` | 1 | behavior-wired | 3 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/modelink.js` | 5 | behavior-wired | 3 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/mood-glide.js` | 3 | behavior-wired | 4 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/motif.js` | 5 | behavior-wired | 4 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/motive-arbitration.js` | 1 | read-consumer | 0 | 1 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/narrative-deduction.js` | 1 | behavior-wired | 1 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/noesis.js` | 2 | behavior-wired | 0 | 12 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/observation-projection.js` | 1 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/observe-slice.js` | 2 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/offline-return.js` | 1 | behavior-wired | 1 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/offline-tick.js` | 1 | behavior-wired | 3 | 7 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/one-shot-mod.js` | 3 | behavior-wired | 4 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/operations.js` | 2 | behavior-wired | 4 | 7 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/opinion.js` | 5 | behavior-wired | 2 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/opportunity.js` | 1 | behavior-wired | 3 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/org.js` | 4 | behavior-wired | 12 | 14 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/outline-inject.js` | 1 | read-consumer | 0 | 4 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/output-guard.js` | 4 | read-consumer | 0 | 4 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/parallel-events.js` | 5 | behavior-wired | 2 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/parallel-world.js` | 28 | behavior-wired | 7 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/path-echo.js` | 1 | behavior-wired | 1 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/pending-center.js` | 1 | behavior-wired | 0 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/perf-baseline.js` | 1 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/perf-ledger.js` | 1 | read-consumer | 0 | 10 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/perf-trace.js` | 1 | behavior-wired | 0 | 3 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/periodicals.js` | 1 | behavior-wired | 2 | 2 | 1 | OPV12-8 | 融合现有链路后升级 |
| `engines/persona-anchor.js` | 3 | behavior-wired | 1 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/perspective-lock.js` | 1 | behavior-wired | 1 | 6 | 3 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/phase-transition.js` | 1 | behavior-wired | 8 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/phone-bridge.js` | 1 | behavior-wired | 0 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/plan-audit.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/plan.js` | 1 | behavior-wired | 5 | 8 | 1 | OPV12-1 | 融合现有链路后升级 |
| `engines/playable-blueprint.js` | 1 | behavior-wired | 3 | 3 | 1 | OPV12-8 | 融合现有链路后升级 |
| `engines/playable-seed.js` | 1 | behavior-wired | 0 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/player-archive.js` | 1 | read-consumer | 0 | 5 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/playtime.js` | 1 | behavior-wired | 0 | 12 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/plot-gauge.js` | 1 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/pmem.js` | 16 | behavior-wired | 1 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/polish.js` | 8 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/populate.js` | 1 | behavior-wired | 2 | 5 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/portal.js` | 1 | behavior-wired | 0 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/power-anchor.js` | 5 | behavior-wired | 2 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/prefilter-gate.js` | 1 | behavior-wired | 0 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/preset-world.js` | 1 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/preset.js` | 1 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/proactive.js` | 5 | behavior-wired | 1 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/probe.js` | 1 | behavior-wired | 5 | 7 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/production.js` | 1 | behavior-wired | 13 | 5 | 1 | OPV12-3 | 融合现有链路后升级 |
| `engines/public-agenda.js` | 1 | behavior-wired | 5 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/purify-scope.js` | 1 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/push-api-registry.js` | 1 | read-consumer | 0 | 1 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/quota.js` | 5 | behavior-wired | 3 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/reasoning-strip.js` | 1 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/reasoning.js` | 1 | behavior-wired | 0 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/recipe.js` | 1 | behavior-wired | 0 | 7 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/redact-layer.js` | 3 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/refine.js` | 1 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/region.js` | 1 | behavior-wired | 4 | 8 | 1 | OPV12-4 | 融合现有链路后升级 |
| `engines/regional.js` | 1 | behavior-wired | 2 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/rehearsal.js` | 1 | behavior-wired | 1 | 5 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/rehearse.js` | 1 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/reject-recovery.js` | 1 | read-consumer | 0 | 2 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/relation-graph.js` | 1 | behavior-wired | 5 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/relation-temp.js` | 1 | read-consumer | 0 | 5 | 2 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/request-viewer.js` | 9 | read-consumer | 0 | 4 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/research-closure.js` | 1 | behavior-wired | 1 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/research.js` | 5 | behavior-wired | 5 | 7 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/retrieval.js` | 6 | behavior-wired | 0 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/rewriter.js` | 4 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/rhythm-loop.js` | 3 | behavior-wired | 2 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/risk-pooling.js` | 1 | behavior-wired | 5 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/rivalry.js` | 2 | behavior-wired | 3 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/role-conflict.js` | 1 | behavior-wired | 4 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/round-cost.js` | 1 | behavior-wired | 0 | 5 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/round-drivers.js` | 1 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/rule-pack.js` | 1 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/rules.js` | 6 | read-consumer | 0 | 6 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/ruling.js` | 5 | behavior-wired | 8 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/rumor.js` | 5 | behavior-wired | 3 | 10 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/sampler-check.js` | 1 | read-consumer | 0 | 1 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/save-health.js` | 1 | behavior-wired | 0 | 5 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/scene-budget.js` | 1 | behavior-wired | 1 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/scene-narrative.js` | 1 | behavior-wired | 0 | 2 | 0 | OPV12-6 | 融合现有链路后升级 |
| `engines/scene-slice.js` | 2 | behavior-wired | 1 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/scope-tag.js` | 1 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/sediment.js` | 1 | behavior-wired | 1 | 7 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/service-network.js` | 1 | behavior-wired | 11 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/session.js` | 1 | behavior-wired | 4 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/shadow.js` | 4 | behavior-wired | 8 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/shared-awareness.js` | 1 | behavior-wired | 5 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/social-legacy.js` | 1 | behavior-wired | 14 | 1 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/solo-voice.js` | 2 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/spotlight.js` | 3 | behavior-wired | 2 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/stage.js` | 1 | behavior-wired | 4 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/stale-guard.js` | 1 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/stall.js` | 1 | behavior-wired | 10 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/storage-forecast.js` | 1 | read-consumer | 0 | 8 | 2 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/story-choice.js` | 2 | behavior-wired | 2 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/story-loop.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/story-tone.js` | 5 | behavior-wired | 2 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/storyclock.js` | 6 | read-consumer | 0 | 4 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/storyline-advance.js` | 3 | behavior-wired | 0 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/style.js` | 45 | behavior-wired | 0 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/success-grade.js` | 1 | behavior-wired | 0 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/summarizer.js` | 14 | behavior-wired | 2 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/supply-chain.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/survey.js` | 4 | behavior-wired | 11 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/survival.js` | 5 | behavior-wired | 1 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/tape-store.js` | 1 | read-consumer | 0 | 4 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/tech-lineage.js` | 1 | behavior-wired | 13 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/temperament.js` | 5 | behavior-wired | 1 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/tempo.js` | 3 | behavior-wired | 1 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/temporal-lock.js` | 4 | behavior-wired | 2 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/theme.js` | 1 | behavior-wired | 0 | 12 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/threads.js` | 4 | behavior-wired | 5 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/timeline.js` | 4 | behavior-wired | 0 | 9 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/tolerance.js` | 5 | behavior-wired | 4 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/tool-analyzer.js` | 1 | read-consumer | 0 | 1 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/tool-diag.js` | 2 | behavior-wired | 0 | 2 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/tool-import.js` | 1 | behavior-wired | 4 | 1 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/tool-snapshot.js` | 1 | behavior-wired | 1 | 2 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/training.js` | 1 | behavior-wired | 3 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/travel-desk.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/undercurrent-calendar.js` | 1 | read-consumer | 0 | 3 | 2 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/userlock.js` | 5 | behavior-wired | 3 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/vitals.js` | 3 | behavior-wired | 8 | 4 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/warrant.js` | 5 | behavior-wired | 2 | 3 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/wb-inject.js` | 4 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/wb-search.js` | 1 | read-consumer | 0 | 2 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/weather.js` | 6 | behavior-wired | 1 | 7 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/weighted-draw.js` | 1 | behavior-wired | 0 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/word-budget.js` | 1 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/world-autobiography.js` | 2 | read-consumer | 0 | 7 | 2 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/world-blueprint.js` | 2 | behavior-wired | 2 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/world-bridge.js` | 2 | behavior-wired | 2 | 10 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/world-briefing.js` | 1 | behavior-wired | 0 | 8 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/world-changes.js` | 3 | read-consumer | 0 | 6 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/world-clock.js` | 3 | read-consumer | 0 | 3 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/world-diary.js` | 1 | behavior-wired | 0 | 6 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/world-graph.js` | 1 | read-consumer | 0 | 2 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/world-health.js` | 1 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/world-lab.js` | 2 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/world-seed.js` | 2 | behavior-wired | 2 | 5 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/world-snapshot.js` | 1 | behavior-wired | 1 | 1 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/world.js` | 4 | behavior-wired | 0 | 14 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/worldbook.js` | 4 | behavior-wired | 0 | 6 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `engines/write-contract.js` | 2 | read-consumer | 0 | 5 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `engines/write-desk.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `actors/monologue.js` | 17 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `actors/observe.js` | 9 | behavior-wired | 1 | 1 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `actors/profile.js` | 8 | read-consumer | 0 | 1 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `actors/registry.js` | 3 | behavior-wired | 1 | 13 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `core/api-router.js` | 1 | behavior-wired | 0 | 21 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `core/audit-log.js` | 1 | behavior-wired | 0 | 4 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `core/clock.js` | 1 | read-consumer | 0 | 100 | 4 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `core/commit.js` | 1 | behavior-wired | 0 | 13 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `core/evict.js` | 1 | behavior-wired | 0 | 100 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `core/exec.js` | 1 | read-consumer | 0 | 1 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `core/fault-context.js` | 2 | entry-needed | 0 | 0 | 0 | 按覆盖账归属 | 保留并纳入真实入口复核 |
| `core/input-guard.js` | 1 | read-consumer | 0 | 100 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `core/interceptor.js` | 1 | entry-needed | 1 | 0 | 0 | 按覆盖账归属 | 保留并纳入真实入口复核 |
| `core/permissions.js` | 1 | read-consumer | 0 | 6 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `core/plugin.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `core/rand.js` | 1 | read-consumer | 0 | 62 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `core/sandbox.js` | 1 | behavior-wired | 0 | 2 | 0 | 按覆盖账归属 | 融合现有链路后升级 |
| `core/sanitize.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `core/schema.js` | 1 | entry-needed | 0 | 0 | 0 | 按覆盖账归属 | 保留并纳入真实入口复核 |
| `core/settings-bus.js` | 1 | read-consumer | 0 | 100 | 5 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `core/settle-guard.js` | 1 | behavior-wired | 1 | 3 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `core/store.js` | 2 | behavior-wired | 0 | 100 | 2 | OPV12-9 | 融合现有链路后升级 |
| `core/undo.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `core/unified-pending.js` | 1 | read-consumer | 0 | 0 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `core/workflow.js` | 1 | behavior-wired | 0 | 35 | 1 | OPV12-9 | 融合现有链路后升级 |
| `render/inject.js` | 11 | behavior-wired | 3 | 12 | 2 | 按覆盖账归属 | 融合现有链路后升级 |
| `render/map-viewport.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `render/purifier.js` | 1 | read-consumer | 0 | 5 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `render/theater.js` | 8 | read-consumer | 0 | 1 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `ui/assistant.js` | 6 | read-consumer | 0 | 1 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `ui/cyberpunk-animations.js` | 1 | ui-or-host-entry | 0 | 0 | 0 | 按覆盖账归属 | 保留并纳入真实入口复核 |
| `ui/cyberpunk-components.js` | 1 | read-consumer | 0 | 2 | 2 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `ui/cyberpunk-dashboard.js` | 1 | ui-or-host-entry | 0 | 0 | 0 | 按覆盖账归属 | 保留并纳入真实入口复核 |
| `ui/cyberpunk-logs.js` | 1 | read-consumer | 0 | 0 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `ui/cyberpunk-people.js` | 1 | read-consumer | 0 | 0 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `ui/cyberpunk-responsive.js` | 1 | ui-or-host-entry | 0 | 0 | 0 | 按覆盖账归属 | 保留并纳入真实入口复核 |
| `ui/cyberpunk-theme.js` | 1 | read-consumer | 0 | 7 | 7 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `ui/panel-fold.js` | 1 | read-consumer | 0 | 3 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `ui/panel-nav.js` | 1 | read-consumer | 0 | 1 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `ui/panel.js` | 144 | behavior-wired | 12 | 7 | 4 | OPV12-9 | 融合现有链路后升级 |
| `ui/render-perf.js` | 1 | read-consumer | 0 | 4 | 1 | 按覆盖账归属 | 保留为消费面并复核实际收益 |
| `ui/settings.js` | 1 | behavior-wired | 0 | 1 | 1 | 按覆盖账归属 | 融合现有链路后升级 |
| `ui/theme-switch.js` | 1 | read-consumer | 0 | 2 | 0 | 按覆盖账归属 | 保留为消费面并复核实际收益 |

## 证据边界

- 本账基于源码静态行为和入口文件人工复核，不等于所有运行时分支已经执行。
- 外部模型供应商生成、宿主全部配置组合和动态字符串调用仍需在对应产品链验收。
- 下一阶段按 OPV12-9 场景协同合同开始实施，再贯通人物/因果/认知和城镇短缺场景。
