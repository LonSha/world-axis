# -*- coding: utf-8 -*-
import io, sys
BASE = '/tmp/wa_git/'
p = BASE + 'ITERATION_LOG.md'
s = io.open(p, encoding='utf-8').read()
ANCHOR = u'## 迭代记录' + chr(10) + '### R66'
if s.count(ANCHOR) != 1:
    print('ABORT anchor hits %d' % s.count(ANCHOR))
    sys.exit(2)
L = []
L.append(u'### R67 · 2026-09-25 · v2.87.0 导演工作台与拓宽（第四十一面：能力已经实现，但没有任何人读得到——探针只在测试里活着）')
L.append(u'')
L.append(u'- **做了什么**：三处落点，两把专锁，四个版本计划的收官版本。')
L.append(u'  **B6（`engines/causal.js`）**：抽出 `advanceChains(draft, f, cfg, only)` 作为推进的**唯一实现**（`tick()` 改为调它，只改传入 draft，不碰 store/stat/台账），在其上新增四个只读口：`stateView()`（活链/终局/按状态/按阶段/待定/延迟/已结算分列，与 `stat()` 的进程累计分列）、`previewIntervention(chainId, action, args)`（advance/cancel/settle 三动作给 allowed 与原因码，零副作用）、`rehearse(facts)`（深拷贝上跑完整一轮，dryRun:true）、`conflicts()`（只报同因同果在途链，给 a/b/both 选项，不自动消解）、`evidence()`（随机源读数与推进绑定，reproducible 仅在显式播种时为 true）。')
L.append(u'  **B7（`engines/theme.js`，新）**：五题材（都市/校园/悬疑/奇幻/经营）对 `rules.ORDER` 的**显式组合**。核心四模块（world/event/info/reputation）不入任何排除面；多题材取并集按 ORDER 原序（不引入优先级/覆盖）；`preview()` 纯计算不落设置；`apply()` 是唯一写入口，未知题材返回 `unknown-theme` 且不改状态；`rules.getAll()` 按启用题材过滤（零启用 = 全量，旧行为逐字不变）；`separation()` 报告三插件分工，缺席由 `compat.detect()` 现场探测**降级可见**。')
L.append(u'  **A5 收口（`engines/tool-import.js`）**：抽出共用字段映射 `toFaction/toEvent/toPmem`（消除两处字段名分叉）；新增 `previewPlan(raw)` 在深拷贝上跑**同一批准入函数**逐条报 willAdd/willSkip/rows；snapshot/regional/worldbook 如实给 note。')
L.append(u'  **UI 接线**：导演页新增题材规则组合区（多选/预览差异/应用/清空回全量）；事件页因果区新增因果工作台区（当前/累计/分支试演/查冲突/回放证据/干预预览）；工具页导入区 preview 与 previewPlan 并列显示。')
L.append(u'- **为什么**：B6/B7/A5 三处都是同型病——能力已经实现，但没有任何人读得到：causal 只能整体跑、不能定点，更不能先看后做；rules 只有全量/精简两档，题材无处装卸；toolImport.preview 只报 kind/size/count，而导入有副作用。')
L.append(u'- **踩过的坑**：① `theme.preview` 的「当前面」基线误用 `compose([])`（只得到 CORE 4 个模块），campus 的 deltaChars 报出 +5408 的虚假增量——**差异预览撒谎比没有预览更糟**，改为「未启用题材时当前面 = 全量 ORDER」后报 -1107；② B6-E 判据首版写错期望（rand 未播种时 seedSource 初始为 none 而非 auto），改为锚 `!== explicit && reproducible === false`；③ 首跑 `dead-export-gate` 一次报出 9 个新增死导出（B6 四个口 + A5 的 previewPlan 只有测试引用、4 个 self-only 过度导出）——处置不是刷账本，而是分两类治：四个只读口接面板、四个收回导出、一个由 `theme.separation` 接通；④ `missing-pair` 是自造的多余码，改为把空串交给 `causal.cancel` 复用其 `missing-fields` 归因。')
L.append(u'- **影响范围**：`engines/causal.js`、`engines/rules.js`、`engines/tool-import.js`、`engines/tool-diag.js`、`engines/theme.js`（新）、`ui/panel.js`、`tests/run.js`、`tests/b6-b7-v2870.js`（新）、`tests/causal-view-v2870.js`（新）、`tests/reject-v2780.js`、`tests/settle-v2830.js`、`tests/dead-export-ledger.json`、`tests/module-registry-ledger.json`、`index.js`、`manifest.json`、`README.md`、`FOUR_VERSION_PLAN.md`。')
L.append(u'- **门禁结果**：`node tests/run.js` → **通过 7596 / 失败 0**（v2.86.0 基线 **7541 / 0**，+55 = 两把专锁）；`tests/ui-gate.js` → **53 / 0**（375 控件真实点击）；`tests/ui-wire-audit.js` → **9 / 0**；出口面 `ns= 104 members= 596 chars= 7341`（已回填 FROZEN2800 与 EC2430）；`tests/dead-export-gate.js` → dead **443** / uiDead 4 / dataOnly 161 / 仅测试 291 / 证据 447；`tests/module-registry-gate.js` → pass（107 文件 / 115 命名空间）；`tests/reject-code-gate.js` → 见证 **79** / 死表 4 / 基线 211；`tests/settle-v2830.js` → **55 / 0**；`tests/inventory.js` → 四类悬空均 0（静态引用 2339 处）。')
L.append(u'')
NEW = u'\n'.join(L)
s = s.replace(ANCHOR, u'## 迭代记录\n\n' + NEW + u'### R66')
io.open(p, 'w', encoding='utf-8').write(s)
print('R67 inserted, new char length %d' % len(s))
