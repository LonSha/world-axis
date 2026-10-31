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
| B 跨节状态污染 | ~34 | 单跑必绿、全量必红（「靠顺序活着」） | 改挂载面或补清理 | ✅ 已修 → 全量 34 条全绿（提交 `6998c19`） |
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
### 根因已定位并修复（提交 `6998c19`）—— 靠**写时拦截**抓到现场栈

上面两条排除是对的，但结论下错了方向：问题既不在快照，也不在 `lsSnap2740` 本身，
而在**没人给它覆盖到的那一段**。

**方法教训（比结论更值钱）**：静态扫「谁写了这个键」没有产出（前 18 把锁里只有
`causal-v2620` 碰 `setSettings`，且动的是 causal 不是 world）；逐个真跑前 18 把锁，
9 次读数全是「on=27 无漂移」—— **假设被证伪**；二分插桩发现 S44 就已经脏了，
说明污染在 v2.44 之前，二分成本过高。最终改用**写时拦截**：包装 `LS.setItem`，
只抓「键名 == `worldaxis_world_settings_v1` 且值含 `"enabled":true`」的第一次写入并打印堆栈，
一次命中。**当「谁写的」无法靠读代码回答时，在写入点拦一层拿栈比逐段二分快得多。**

```
at LS.setItem (tests/run.js:53:62)
at lsWrite (core/settings-bus.js:627:10)
at Object.save (core/settings-bus.js:1809:21)
at Object.saveOrThrow (core/settings-bus.js:1731:23)
at saveSettings (engines/world.js:78:27)
at setSettings (engines/world.js:1307:67)
at turnOn (engines/capability-tier.js:174:19)
at engines/capability-tier.js:258:43      ← applyTier 的 forEach
at Array.forEach (<anonymous>)
```

栈落在 `■ G18 控件可点性` 这一块（`tests/run.js:13643`）。

**完整链路**：`tests/ui-gate-sync.js:140` 的 `checkClickable` 逐页把 `body` 里每个
`button,input,select,textarea` **真点一遍**（实测 **1574** 个），其中就有
`ui/panel.js:3698-3700` 的 `#wa-ct-lite/standard/full` 三档按钮。点 `full` →
`applyTier('full')` → `turnOn()` → `engines/world.js` 的 `setSettings` →
`core/settings-bus.js` 的 `lsWrite`，把 `worldaxis_world_settings_v1` 写成
`{"enabled":true,...}`。**该探针原本零收尾**，脏值就此留在 localStorage，
后续每把锁 `fresh()` 重装引擎时都读到它 —— 这就是 `world-v2630 / shadow-v2630 /
threads-v2630` 那些「[1] 默认关闭（实 true）」单跑必绿、全量必红的确切原因。

**为什么 v2.274.0 的 `lsSnap2740` 治不住（两条独立原因，缺一不可）**：
1. 它挂在 `runLock` 里，而 G18 是 `run.js` 的**内联块**，整段不经过 `runLock`，
   没有任何快照保护；
2. 更根本的是——即便收尾了 localStorage，`fresh()` 会把**同一个** `global.WorldAxis`
   上的引擎重新求值，**读到的是磁盘上那份刚被改脏的值**，污染照样向下传。

故修复点必须落在「**探针不许改变世界**」上，而不是「多包一层快照」。

### 修法与读数

**改动一 · `tests/ui-gate-sync.js`（`checkClickable` 自带收卷）**
点击前遍历 `WA` 上所有同时具备 `getSettings`/`setSettings` 且 settings 含 `enabled` 键的模块，
记一份 `{key: boolean}` 快照（`__swSnap`）；`finally` 里逐个比对现值，
只写回不一致的，并累计 `out.restored`。**点击循环本身一字未改。**

实测判别力未削弱：`controls=1574 / thrown=0 / rejections=0 / restored=36`；
点击后 `world.enabled=false`、全局 on 27→27、**再 `fresh()` 一次仍为 false**
（污染不再跨节存活，而不是靠全量跑一遍猜）。

**改动二 · `tests/capability-tier-v2257.js`（测试面净场）**
全量里本文件读到 187→188 个开关、`BASE_ON` 变 27（单跑稳定 187/26）。差别同样在
`global.WorldAxis` 是**同一个对象**：`ui-gate-sync.fresh()` 会把 `ui/render-perf.js` 的
`renderPerf` 装进来，而本文件 `fresh()` **只重装 `LOAD`、不装载却也不清除**。
修法：装 `LOAD` 前把 `WA` 上残存成员逐个摘掉，使本测试面真的只有 `LOAD` 的东西。

> ⚠ **顺序不可换：清空必须在 `require(mock.js)` 之前。** `tests/mock.js:173` 是
> `const WA = global.WorldAxis = global.WorldAxis || {}` —— 它复用同一对象、
> 只把自己那组基础设施桩（`log` / `eventLog` / `flushLog` / `on` / `emit`…）挂上去。
> 本轮第一版把清空写在 `require` 之后，**把宿主桩一起摘掉了**，实测后果是全量里
> `capability-ui-v2257` 三条 `WA.log is not a function`（产品模块装载第一句就打日志），
> 而单跑因 require 缓存命中、旧的 `log` 还活着而看不见 —— 又一处「靠顺序活着」。
> 已按「先清残留 → 再 require mock → 再装 LOAD」修正并复验为 0 条。
>
> 明确**不采用**「把 `BASE_ON` 改成全量时 27」—— 那等于让判据随跑的顺序变值。
> 本测试面的定义是「只装 LOAD」，它就必须真的只有 LOAD。

**全量读数（`/tmp/worldaxis-regression-nQu3OG`，`unchanged: true`）**：

| | 上轮 `gVRfN8` | 本轮 `nQu3OG` |
|---|---|---|
| 断言 | 通过 23168 / 失败 69 | **通过 23237 / 失败 67** |
| B 类（六个 v26x0 文件） | 0（上上轮 34 条已清） | **0（保持）** |
| `capability-tier` B0b/B6d2/B8/B8b | 0 | **0**（全量实读 26 / 26 / 26·95 / 121，89 条全绿） |
| `WA.log is not a function` | 3（本轮第一版引入） | **0（已修）** |

在污染环境中自证：先跑 `ui-gate-sync.fresh()`（`WA` 成员 352、`renderPerf` 在场），
再调 `capability-tier.runAll` → **79 pass / 0 fail**（修复前该面读到 27 而基线是 26）。

**剩余红项差异核对**：本轮相对上轮唯一「新露出」的是
`undefined: [D2] 三档按钮 + 退回按钮都渲染（缺 wa-set-tier-rollback）`。
核对更早两轮日志（`COBwJJ` / `QWfouZ` 均已有该条）⇒ **存量债，不是本轮引入**；
它在上一轮被 `WA.log` 抛出遮蔽，`WA.log` 修掉后重新露出来。

### 纪律沉淀

**取证不得改变被取证对象。** 任何「逐控件真点」的探针，只要面板上存在会改全局状态的
按钮（今天是能力档位，明天可能是别的），就必须**自带收尾**；把收尾责任散落到各个调用方
（G18 已有一处对折叠态的收尾）迟早再漏一份 —— 故修在**探针本体**上。

### 已排除的两个假设（保留，避免重复劳动）


1. **不是 localStorage 快照/还原的问题。**
   `/tmp/probe_ls_restore.js` 实测：`WA.mainWin.localStorage === global.localStorage`（同一对象），
   `world.worldsetSettings` 写盘后 `getItem` 能读到，`restore(s0)` 后该键回到 `null`，
   再 `fresh()` 得到 `enabled=false`。**还原链路本身是对的。**

2. **不是 v2.274.0 新加的 `lsSnap2740` 失效。**
   该机制在 `tests/run.js:274-305`，快照/还原逻辑与探针实现逐字等价。

### 「未定位」记录的更正（保留原文以便对照）

上文「污染源没找到」是**当时**的诚实记录，现已由见上一节的写时拦截结论取代。
本轮在此处付出的两次无效路径值得留账：

- **静态扫前 18 把锁**：只有 `causal-v2620` 出现 `setSettings({enabled:...})`，
  但它动的是 causal 而非 world —— 读代码找写者**没有产出**。
- **逐个真跑前 18 把锁**：9 次读数全是「on=27 无漂移」，**证伪了自己最初的假设**。
- **二分插桩**：S44 就已经脏了，污染在 v2.44 之前，二分成本过高。

破局点是**写时拦截**（包装 `LS.setItem` 打栈），一次命中，见上一节。

另附本轮新增的两条工程障碍（都是环境层，不是判据红）：

1. **`isolated-runner.js` 不自跑**：它只导出 `launch`，`node tests/isolated-runner.js`
   会零输出退出（我第一趟误以为它在跑）。正确入口是
   `require('./tests/isolated-runner.js').launch(root, { timeoutMs })`。
   选区参数 `--only-v-section` 从 `process.argv` 读，直接当 `launch(root, {argv})` 传
   **不会转发**（实测白跑一趟全量）。
2. **本环境全量跑不完的真实原因分两类**，必须分开归因，不能一律记成「判据红」：
   - `ENOSYS: function not implemented` + `node::ResetStdio` 断言（proot 系统调用层偶发），
     日志停在崩溃点、`result.json` 仍为 `running`；
   - 单纯 SIGKILL（内存压力：峰值 used 8.1G / 11G、swap 已用 4G），无任何报错。
   故本轮以 `--max-old-space-size=6144` 起跑，并把「后台启动一律 `setsid` + 输出落盘」
   当作固定做法（会话回收会带走普通 `nohup &` 的进程组，留下陈旧锁）。

**下一步排查建议**（原三条已全部作废，替换为）：
1. 剩余 67 条**全部**落在 D 类存量债，按 `docs/REGRESSION_TRIAGE_113.md` 的 D 类分批表推进；
   优先拿 `v2820/cp [N3]`、`v2850/C1`×2 这类「守卫键/优先级声明」成组红项开刀。
2. 任何新增的「逐控件真点 / 逐引擎真写」探针，先问一句「它会不会改变世界」，
   会，就必须自带收尾（本轮 `checkClickable` 的教训）。
3. 全量重跑前先跑 `node -e "require('./tests/isolated-runner.js').inspectLock(<lock>)"`，
   各锁目录逐个查 `stale` / `no-owner` 后 `recoverLock`，避免被陈旧锁挡住。

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
- **B 类 ~34 条已闭环**（提交 `6998c19`）：根因是 `ui-gate-sync.js` 的 `checkClickable`
  逐控件真点（1574 个）时点到了能力档位三档按钮，`full` 把 100 个引擎真写盘且**探针零收尾**。
  证据来自**写时拦截**（包装 `LS.setItem` 打栈），不是推断。
  修法两条：探针自带收卷（`__swSnap` 快照 + `finally` 写回）、测试面净场（装 `LOAD` 前清 `WA` 残留）。
  全量 34 条全绿并保持（`nQu3OG`: 23237/67，B 类 0 条）。
  **当时认为「污染走内存实例不走磁盘」，实测只对了一半**：磁盘上的脏值确实是入口，
  而内存里的 `WA.renderPerf` 残留是另一条独立通路（`capability-tier` 的 27 vs 26），
  两条都必须断。
- **C 类 5 条已定案并修完**：不是产品漂移，是测试跨面取数（27 来自 UI 面、26 才是产品面）。
  → `capability-tier-v2257: 89 pass / 0 fail`，并顺手修掉让整个 N 段静默跳过的作用域 bug。
- **D 类 ~67 条是存量债**，需分批考古，不适合一次性处理。

**修 B 类时自己踩出来的一个真教训**（已修，但要留账）：`tests/mock.js:173` 是
`const WA = global.WorldAxis = global.WorldAxis || {}` —— mock 复用同一对象挂基础设施桩。
第一版把「清残留」写在 `require(mock.js)` 之后，把 `WA.log` 一起摘掉了，
全量里立刻长出 3 条 `WA.log is not a function`，而单跑看不见（require 缓存让旧 `log` 还活着）。
**这说明「顺序依赖」不只存在于被测对象，也存在于修法本身**：改挂载顺序时，
必须同时确认「谁在被摘之后重新提供了它」。

**最重要的一条（已修订）**：B 类解决之后，「全量绿」才重新有资格当终态证据。
在此之前它不可靠 —— 因为把红项跑绿的方式可能只是「换了个顺序」。
第三轮的真读数（23188 通过 / 113 失败）仍是本仓里程碑式的一次：它没有被任何一把锁提前 exit 掉。
本轮读数 **23237 通过 / 67 失败**，67 条**全部**是 D 类存量债（逐条差异已核）。

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

# 本轮（B 类闭环）新增 —— 全量读数以 nQu3OG 为准
/tmp/worldaxis-regression-gVRfN8    第一版修复后（B 类清零，但引入 WA.log 3 条）23168/69
/tmp/worldaxis-regression-nQu3OG    **权威读数** 23237/67，unchanged:true
/tmp/worldaxis-regression-A3akEQ    ENOSYS+ResetStdio 崩溃（proot 层，作废）
/tmp/worldaxis-regression-WHNEPE    同上（ENOSYS，作废）
/tmp/worldaxis-regression-6nLr1e    误用 `node tests/isolated-runner.js` 的空白趟（作废）
/tmp/probe_cross_section.js         跨节自证：ui-gate-sync.fresh() 污染后 capability-tier 仍 79/0
/tmp/probe_fix_verify.js            checkClickable 收卷读数（1574 控件 / restored=36 / 再 fresh 仍 false）
/tmp/run_full_v2275.js              全量驱动（正确入口 launch，非直接跑 isolated-runner.js）
/tmp/run_cap_only.js                定向跑试探（结论：这两节被门禁 refuse，只能全量验）
```

现场状态（本文档更新时）：
```
HEAD  6998c19 fix(regression): B 类跨节污染根治（探针收卷 + 测试面净场）
工作区 干净（除本文件本轮改动）
```
`tests/run.js` 无改动（插桩已回滚，仍为基线 `d036f464`）。
