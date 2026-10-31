# 113 条红项归因分类（v2.274.0 全量回归真读数）

> 读数来源：`/tmp/worldaxis-regression-COBwJJ`（第三轮，`WA_REGRESSION_TIMEOUT_MS=7200000`）
> `status: assertion-failed` · `code: 1` · `signal: null` · `stopping: null` · `unchanged: true`
> 权威总账行唯一：`136954:通过 23188 / 失败 113`
> 日志内 `^  ✗` 计 116（多 3 条为子门禁自行打印，不进总账）

## 一、这份文档要回答的问题

前两轮全量回归都不可用：第一轮被 SIGKILL 截断、第二轮是假绿灯（`process.exit` 杀掉 worker，
只跑到 v2.265.0 就报「通过 57 / 失败 0」，其后 200 多节一条没跑）。第三轮拿到真读数后，
**113 条红到底是「产品真的坏了」、「本批改出来的」还是「测试自己写错了」**，
必须先分类再决定修不修 —— 否则会拿测试缺陷当产品缺陷去改代码。

## 二、总分类

| 类 | 条数 | 性质 | 处置 | 现状 |
|---|---|---|---|---|
| A 测试自身缺陷 | 6 | 判据前提失效，产品侧是对的 | 改测试 | ✅ 已修 → `60 pass / 0 fail` |
| B 跨节状态污染 | ~34 | 单跑必绿、全量必红（「靠顺序活着」） | 改挂载面或补清理 | ⬜ 未定位，下一轮第一优先 |
| C 读数漂移 | 5 | 实为**测试跨面取数**（UI 面 27 / 产品面 26），产品无缺陷 | 改测试登记点 | ✅ 已修 → `89 pass / 0 fail` |
| D 存量红（未逐条归因） | ~67 | 分布于 20+ 老块 | 待分批 | ⬜ 待考古 |

> 本表在 A/C 两类修完后已更新。原文曾把 A 类记 7 条、C 类记「产品读数漂移需二选一」，
> 两处均以本轮真读数校正（详见第三、五节）。

## 三、A 类：测试自身缺陷（实为 6 条，已修完 → 60 pass / 0 fail）

**证据链完整，已确认产品侧无问题。已修复并入库（提交 `7d5efe2`）。**

失败项实跑 `FAIL 6 / 60`：`v2257UI: [A2]` / `[A3]` / `[A4][前置]` / `[A4]` / `[C1]` / `[N4]`，外加一条标为 `undefined: [D2]` 的连锁项。
（本文档初版记为「7 条」，是本轮以真读数校正的口径差异 —— 60 项里红 6 条，修复后 60/0。）

探针 `/tmp/probe_cap_ui2.js`（复用测试自带的 `toolsHtml(env)` helper）实测：

```
tools tab found=true
html 长度=28842
含 能力档位=true
含 wa-ct-lite=true
含 tools:capability=true
foldt 列表(14) 末项 = tools:capability
capability 折叠按钮=1
文案 = ▾ 能力档位与启用面      ← ▾ 表示展开态
```

点一次折叠按钮后再渲染：`html 长度=26692`、含wa-ct-lite=false。

产品侧口径（两处互相印证）：
- `ui/panel-fold.js:33` 明写「**不改默认态（默认全展开）**」
- `ui/panel.js:4804` 的 `foldSec()` 在 `known=false` 时直接渲染 body（不惰性）

测试侧病灶：`tests/capability-ui-v2257.js` 的 `judgeRender` 里写着
「折叠段收起态下段体不拼接（OPT-9 惰性）——先展开再查控件」，
然后**无条件点了一次**折叠按钮。在默认展开态下，这一次点击反而把段收起，
于是 A2（十控件不在产物里）→ A3（DOM 树 0/10）→ A4（读数节点不在树）→
C1（引擎缺席不明说）→ N4 → D2 全部连锁变红。

**修法：改测试，不是改产品。** 先判当前态（读按钮文案前缀 ▾ / ▸）再决定是否点击。

**已落地的修法**：新增 `isFoldedBtn(btn)` helper，判 `String((btn && (btn.textContent || btn.innerHTML)) || '').indexOf('\u25b8') === 0`
（`▸` = 收起态）。共 7 处点击点改为「仅当按钮处于收起态时才点」：
`judgeRender`（原 108 行）、`judgeClick`（原 141 行）、`judgeDegrade`（原 254 行）三处正向判据，
以及 4 处负控制（原 406 / 425 / 449 行的 `foldB`、原 468 行的 `foldOk`）。
**判据与断言一个字未改，改的只是「点不点」这个前置动作。**
修复后实测 `capability-ui-v2257: 60 pass / 0 fail`，rc=0。

## 四、B 类：跨节状态污染（~34 条）

**这一类是本轮最值得注意的发现：判据是对的，错的是前序节留下的状态。**

形态高度统一，全部报「本该 disabled，实际是 true / 实际接受了」：

| 块 | 条数 | 典型失败项 |
|---|---|---|
| `v2.63.0 world-fabric` | 2 | `[1] 默认关闭（实 true）` / `[1] 关闭时 tick 不推演（归因 disabled）` |
| `v2.63.0 social-vortex` | 3 | `[1] 默认关闭（实 true）` 等 |
| `v2.63.0 cold-case` | 3 | `[1] 默认关闭（实 true）` 等 |
| `v2.65.0 settlement` | 7 | `[1] disabled depart is refused` / `[4] weather defaults off` / `[N2]` / `[N3]` |
| `v2.66.0 affect-channel` | 6 | `[1] disabled channel says so` / `[6] disabled read says so` / `[N2]`×2 / `[N3]`×2 |
| `v2.67.0 temporal-lock` | 7 | `[3] disabled read says so` / `[4] disabled apply says so` / `[N2]`×2 / `[N3]`×2 |
| `v2.69.0 appearance-contract` | 6 | `[1] disabled appearance says so` / `[N2]` / `[N3]` |
| `v2.70.0 scene-slice` | 4 | `[1] disabled sceneSlice says so` / `[N2]` / `[N3]` |

**关键交叉验证：把这几把锁单独跑，全部通过。**

```
node tests/world-v2630.js        → pass（63 项）
node tests/settle-v2650.js       → pass（75 项）
```

同一把锁、同一份源码，单跑绿、全量红 —— 这正是本仓点名的「靠顺序活着」。
判据的成立与否取决于前序节留下了什么，而不是产品行为。

### 已经排除的两个假设

排查过程记录在案，避免下一轮重复劳动：

1. **不是 localStorage 快照/还原的问题。**
   `/tmp/probe_ls_restore.js` 实测：`WA.mainWin.localStorage === global.localStorage`（同一对象），
   `world.worldsetSettings` 写盘后 `getItem` 能读到，`restore(s0)` 后该键回到 `null`，
   再 `fresh()` 得到 `enabled=false`。**还原链路本身是对的。**

2. **不是 v2.274.0 新加的 `lsSnap2740` 失效。**
   该机制在 `tests/run.js:274-305`，快照/还原逻辑与探针实现逐字等价。

### 仍未定位的部分（诚实记录）

污染源没找到。插桩尝试（在 `runLock` 的 `finally` 后打印
`worldaxis_world_settings_v1` 的值、并在 world-v2630 之后截断）因终端会话异常
（Node worker 的 `process.exit` 在 stdio 已被关闭时触发 libuv 断言
`Assertion failed: ((*__errno_location ())) == (9)`）而中断，
run.log 停在 7514 行、`result.json` 仍为 `running`。

插桩已完全回滚（`tests/run.js` 回到基线 `d036f464a56992559a9d394efa9b32c5`，
`grep -c 'PROBE-CUT-HERE-DONE\|\[WL\]'` = 0，`node --check` 通过）。

**下一步排查建议**（成本从低到高）：
1. 读 `tests/world-v2630.js` 的 `isolated()` —— 它在 `finally` 里 `restoreLS(snap)`，
   但 `judge()` 内部是先 `fresh()` 再读 cfg。若前序节把**引擎实例**留在 `global.WorldAxis` 上，
   `fresh()` 重装模块时闭包捕获的是旧实例的设置缓存，`restoreLS` 动不到它。
2. 二分法：从 world-v2630 往前逐节注释掉，用 `--only-v-section` 不行（该节 `shared: ["runLock("]`，
   属「共享上下文」会被 refuse），只能手工裁剪 `tests/run.js` 的调用序列。
3. 直接给 `runLock` 加「引擎实例快照」维度：除 localStorage 外，把 `global.WorldAxis` 上
   各引擎的 `getSettings()` 结果一并快照、跑完还原。

## 五、C 类：读数漂移（5 条）—— 已定案：测试跨面取数，产品无缺陷（已修 → 89 pass / 0 fail）

`tests/capability-tier-v2257.js` 单跑原为 `81 pass / 5 fail`：

| 失败项 | 台账写的 | 现场实际 |
|---|---|---|
| `B6d: 出厂 18 个开关全部完好` | 18 | **27** |
| `B8: 出厂 summary 读数 18 开 / 95 可开` | 18 / 95 | **27 / 95** |
| `B8b: full 后 running 真涨到 113` | 113 | **122** |
| `B8d` | 同 B8 | 同 B8 |
| `N2: 换回初版 granted 写法后切回 lite 出厂开关只剩 22 个（<18）` | <18 | 22（不满足） |

### 查证第一步：27 是不是有意的？

`engines/capability-tier.js:130` 的 `allSwitches()` 是**动态探测** —— `Object.keys(WA).forEach`
逐个问 `shapeOf(k)`（有 `getSettings` + 返回对象里真有 `enabled` 子键），
故开关数随新引擎落地自然增长，不存在写死名单。

探针 `/tmp/probe_tier27.js` 实测（走 `ui-gate-sync.fresh()`）：

```
总开关数（有 enabled 子键的引擎）: 188
出厂 enabled===true 的:           27
有 buildBlock 的:                 100   ← = view().mechanisms
出厂开 且有 buildBlock 的:          5   ← = view().running（B1d 那条绿判据）
出厂开 但无 buildBlock 的:         22   ← 观测型（perfLedger/injectValue/plotGauge/...）
```

得出两条结构恒等式：

- `running（某档合计）= 出厂开关数 + 可开数`：`18 + 95 = 113` 与 `27 + 95 = 122` 同构
- `full 后 running = MECH + (BASE_ON − RUNNING0)`：`100 + (27 − 5) = 122`

明细清单里 27 个出厂开启的引擎，最后 9 个正是 V6 批次交付的
（worldDiary / dayRoute / relationTemp / undercurrentCalendar / roundCost / saveHealth /
firstRun / handoffPack / renderPerf），18 + 9 = 27 完全对得上。
**结论：有意增长，改测试期望值，不改产品。**

### 查证第二步（本轮最硬的一节）：为什么改完还是差 1？

按 27 打上基线后反而从 5 红变 4 红，其中三条是「实 26 / 实 121」——**少 1**。
先证明产品侧清白：探针 `/tmp/probe_tier_seq.js` 走与测试完全相同的序列

```
fresh on=27 → ON0=27 → standard on=61 turnedOn=34 → standard(noop) on=61
→ full on=122 turnedOn=61 → rollback→standard on=61 → lite on=27 turnedOff=34
逐名比对：丢了(出厂有现在没)=[]  多了(出厂没现在有)=[]
```

**产品侧「档位只收回自己开过的」这条边界是真的，零丢失零多余。**
于是把嫌疑锁定在「测试自己在 B6 之前动了什么」，给 `B6d` 插入 `[DBG-B6d]` 诊断，
实测输出 `on=26 ON0=26 丢=[] 多=[]` —— **ON0 取快照时就已经是 26**，
不是「某步关掉了一个」，而是这个测试面本来就只有 26。

### 定案：跨面取数（这才是根因）

两个 `fresh()` 装载面不同，登记基线的必须是**本测试面**的真值：

| 装载入口 | 装什么 | 开关键数 | 出厂开 | 多出来的那个 |
|---|---|---|---|---|
| `tests/capability-tier-v2257.js` 自带 `fresh()` | 只装 `tests/run.js` 的 `LOAD`（**纯产品层**） | **187** | **26** | — |
| `tests/ui-gate-sync.js` 的 `fresh()` | 多装 UI 层 | 188 | 27 | **`renderPerf`** |

`renderPerf` 的文件在 `ui/render-perf.js`，是 **UI 层模块，不在 `LOAD` 里**。
分进程各写一份开关表 `diff` 只有一行：`< renderPerf=ON`。

故 `BASE_ON` 在本文件里必须登记 **26**，恒等式变成 `100 + (26 − 5) = 121`，
与实测 121 严丝合缝。**产品侧一直是对的，错的是我在 UI 面取数、拿到产品面去比。**

### 附带修掉的作用域 bug

`BASE_ON` 曾被定义在 `runB()` 函数体内，而 `runNegative()` 是另一个顶层函数，
访问不到 → 抛 `ReferenceError: BASE_ON is not defined` → **整个 N 段（十条负控制）被跳过**。
这正是判据总数从 86 掉到 81 的原因。基线常量已提到文件顶层共用。

修后实测：`capability-tier-v2257: 89 pass / 0 fail`，
分节核实 A13 / B37 / C14 / D15 / N10 五段**全部真实执行**（N 段负控制没有被静默跳过）。

### 沉淀下来的口径（防复发）

1. **登记基线时必须写清「哪个装载面」** —— 同一个仓库里 `fresh()` 有两种，读数差 1。
2. 引擎出厂态变了只改登记点一处；`B1d/B6b` 的 5 → `RUNNING0`、
   `B8b` 的写死数 → `FULL_RUNNING = MECH + BASE_ON - RUNNING0`、`N2` 的 `< 18` → `< BASE_ON`。
3. 新增 `B0b`：断言 `ON0` 快照长度 === `BASE_ON`，
   让「登记值与本面实测不自杀」这件事自己有条判据，而不是靠人肉核对。

## 六、D 类：存量红（~67 条，未逐条归因）

`块=` 聚类 top（第三轮日志）：

```
 8  v2.192.0 第二批·U5 拒收码→恢复动作
 8  v2.150.0 RP4+RP5 注入价值评估
 7  v2.121.0 取证持久化审计卷
 3  v2.82.0 checkpoints
 3  v2.269.0 EXV6-5 单轮成本卡
 3  v2.226.0 Q9
 3  v2.190.0 U9
 3  v2.128.0 X3–X8
 2  v2.211.0 Q2 快照改名
 2  v2.166.0 TX2
 2  v2.153.0 RX5+RX6
 1  v2.77.0 fondness / v2.231.0 OPT-8 ...
散落（`块=` 未命中）6 条
```

已抽样验证的：
- `first-run-ui-v2271` 单跑 `通过 71 / 失败 0` —— 全量红属 B 类污染
- `round-cost-ui-v2269` 单跑 `通过 45 / 失败 3`（N4 diagState 恰 1 次、N7a、N7b）—— 存量
- `v2121`（取证持久化审计卷）的 7 条全部是 `B1/B2/N1/N2` 读数对不上（条数如实 4、
  卷首与自称一致、原版照搬被挤出后的真实序号 46 等）—— 存量，需单独考古

`v2192`（U5 拒收码）的 8 条形态最值得注意：
```
B3 reject 面：产品快照与现场逐条一致（1145 条）   ← 快照过期，不是判据坏
B4 核对器整体为真（problems 9 / undecided 2 / tainted 0）
```
是「产品改了、快照没同步」的典型，属台账维护欠债。

## 七、结论：这 113 条该不该修

- **A 类 6 条已修完**（成本低，且不改会让下一轮继续误报）→ `capability-ui-v2257: 60 pass / 0 fail`。
- **B 类 ~34 条是本轮最有价值的缺陷**：它证明「全量绿」这个信号本身不可靠 ——
  判据的成立取决于跑的顺序。这不是某一把锁的问题，是挂载面的架构问题。
  v2.274.0 已经试图用 localStorage 快照治它，实测**不够**（因为污染走的是内存实例，不是磁盘）。
  **仍未定位，仍是下一轮第一优先。**
- **C 类 5 条已定案并修完**：不是产品漂移，是测试跨面取数（27 来自 UI 面、26 才是产品面）。
  → `capability-tier-v2257: 89 pass / 0 fail`，并顺手修掉让整个 N 段静默跳过的作用域 bug。
- **D 类 ~67 条是存量债**，需分批考古，不适合一次性处理。

**最重要的一条**：在 B 类解决之前，任何一轮「全量回归通过」都不能当作终态证据 ——
因为把红项跑绿的方式可能只是「换了个顺序」。这也是为什么第三轮的真读数
（23188 通过 / 113 失败）反而是本仓至今最可信的一次：它没有被任何一把锁提前 exit 掉。

## 八、附录：本轮用到的探针与证据文件

```
/tmp/worldaxis-regression-sxmAr3    第一轮（SIGKILL 截断，作废）
/tmp/worldaxis-regression-qIrTvG    第二轮（假绿灯，只跑 196/427 节）
/tmp/worldaxis-regression-COBwJJ    第三轮（真读数 23188/113）
/tmp/worldaxis-regression-kIAtgy    插桩排查（进程异常中断，作废）

/tmp/probe_exit.js                  复现 process.exit 杀掉 worker
/tmp/probe_cap_ui2.js               证明 capability-ui 的 6 条是测试前提失效
/tmp/probe_ls_ident.js              证明 mainWin.localStorage === global.localStorage
/tmp/probe_ls_restore.js            证明快照/还原链路本身正确
/tmp/probe_seq.js                   按顺序重放 12 把锁（探针，未跑出污染）
/tmp/bak_run.js                     tests/run.js 基线 d036f464（插桩回滚源）
/tmp/bak_v2265.js / bak_v2266.js    两把锁修复前的 md5 备份

# 本轮（C 类定案）新增
/tmp/probe_tier27.js                27 的构成拆解（188/27/100/5/22）
/tmp/probe_tier26.js                fresh→standard→full→lite 单次读数
/tmp/probe_tier_seq.js              走测试完整序列，逐名比对零丢失零多余
/tmp/probe_fresh_diff.js            两个 fresh() 的开关表对比（差 renderPerf 一行）
/tmp/probe_fresh_diff2.js           可复现性确认（两次 vm fresh 完全一致）
/tmp/probe_uigate.js / probe_vm.js  分进程各写一份开关表供 diff
/tmp/probe_tier_sections.js         分节核实 A13/B37/C14/D15/N10 五段全部执行
/tmp/bak_cap_ui.js                  capability-ui 修前备份（812b324d…）
/tmp/bak_cap_tier.js                capability-tier 修前备份
tools/patch_a_class_capui.py        A 类修复脚本（.gitignore 的 tools/*.py，不入库）
tools/patch_c_class_tier.py         C 类修复脚本（同上）
```

现场状态（本文档更新时）：
```
HEAD  7d5efe2 fix(tests): 修三条测试自身缺陷（A 类折叠态、C 类跨面基线、假绿灯 exit）
 M plans/V6_MASTER_PLAN.md
?? docs/STORYLINES_NOT_STITCHED.md
?? docs/REGRESSION_TRIAGE_113.md   ← 本文档
```
`tests/run.js` 无改动（插桩已回滚，仍为基线 `d036f464`）。
