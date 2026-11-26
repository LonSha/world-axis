# 五台「零故事面读点」引擎的裁决：为什么现在不接、什么条件下改判

> 起因：v2.548.0 收口时把第三梯队压到 7 台，量了一遍「有没有产品读点」——
> `preflight 0 · polish 0 · ensemble 0`（`WA.<ns>` 零引用），
> `archiveHide / autoHide` 的「有人用」经核全是**工具表 / 面板开关**，不是故事面。
> 本文回答一件事：**它们是欠债，还是它们本来就该停在这儿？**
>
> 「接上」在本仓有明确含义：**故事面**（生成流水线 / 注入装配 / 结算）里有人读它。
> 本文把这五台逐个写清：现在谁在读、为什么不能硬接下去、以及**改判触发器**。

## 一、结论先行

**五台都不是「漏接」，是「缺合法读点」。** 可达面逐项实测（v2.550.0 现场）：

| 引擎 | 命名空间 | 面板开关 | 诊断工具表 | 行动台路由 | 注册表 | 故事面 |
|---|---|---|---|---|---|---|
| `engines/rehearse.js` | `preflight` | 1 行 | 0 | 0 | 1 行 | **零** |
| `engines/polish.js` | `polish` | 1 行 | 0 | 0 | 1 行 | **零** |
| `engines/ensemble.js` | `ensemble` | 0 | 0 | 0 | 1 行 | **零** |
| `engines/archive-hide.js` | `archiveHide` | 1 行 | 0 | 0 | 1 行 | **零** |
| `engines/auto-hide.js` | `autoHide` | 0 | 11 处 | 7 条（14 处引用） | 1 行 | **零** |

四类入口全是**手动面 / 面板面**：开关要人点、工具要模型或玩家点名调、注册表只影响
自检里「模块在不在」。它们都不会在生成、注入、结算这三处被读到——

「挂在工具表里可手动调」与「已接入主链」在读数上同形，这正是本仓反复治的那类病。
所以这次不写「已接」，而是**把它们钉成可复算的裁决**，并用
`tests/orphan-engine-adjudication-v2550.js` 把「可达但零故事面」这件事锁住：
谁哪天真接进故事面，那把锁会立刻红，逼着改裁决。

## 二、开关≠读点：比「默认关着」更坏的一种状态

`ui/settings.js` 的「缝合引擎总开关」面板给 `preflight` / `polish` / `archiveHide`
各渲染了一行，而这三台的 `getSettings().enabled` **默认就是 `true`**。
也就是说：面板上它们**一开始就是勾上的**，勾掉也不改变任何注入内容——
因为全仓没有一处故事面代码读它们。

这比「默认关着、没人开」更难发现：

1. 面板读数（checked）是对的，没有「开关点了没反应」的报错；
2. `enabled: true` 让 `grep enabled` 一类粗查看起来「在用」；
3. 面板自己的注释写着「把『开关点了零效果』的真因就地标出来（模块未装载 / 注入源未勾选）」——
   而这三台的真因是第三种、且面板没写：**模块已装载、注入源也勾了，但根本没有故事面读点**。

所以本裁决的口径是：**开关是「可达」的一种，不是「读到」的一种。**
`autoHide` 连开关都没有（只有工具表 + 行动台路由），`ensemble` 连工具表都没有
（只剩注册表一行）——三者形态不同，但结论同一条：故事面零读。

## 三、逐台：为什么不能硬接

### 1. `preflight`（写前预演，`engines/rehearse.js`）

`preview(patch)` 判的是「这份候选改动会被这张卡接受几项」。它需要**一个产生候选改动的地方**。
本仓没有：`core/commit.js` 的提交是**链式操作**（opId/site/floor），不是「顶层键 patch」；
导入走 `controllability.importCheck`，而 `importCheck` **本身也只有测试在调**。

硬接的后果：为了给 `preview` 找活干，得先造一个「patch 应用面」——那是新增一条写路径，
比不接更坏（多一条能改存档的路，却没有对应的回滚与对账）。
注意它的导出名是 `WA.preflight`（不是 `WA.rehearse`）：连「按名字找读点」都会找空。

**改判触发器**：出现任何一个「按顶层键 patch 写存档」的产品面（导入合并 / 批量修复 / 外部同步），
且它落地前需要预演。届时 `preflight.preview` 直接挂上去，不需要改判据。

### 2. `polish`（输入润色，`engines/polish.js`）

它把玩家的短输入（「去码头看看」）扩成多个可演版本。这在**玩家输入侧**是危险的：
玩家写的话被改写之后，`storyWindow` 的「玩家引述核对」、`inputGuard` 的白名单、
以及「玩家拥有最终解释权」这条纪律全部失去基准——玩家的原话没了。

面板那行标题写「把一句话润色成多个版本供选；选中后才进主链」，读起来像已接；
实测「选中」这个动作在产品里不存在（没有消费者读 `pick`）。

**改判触发器**：出现「玩家显式要求润色」的入口（一个按钮 / 一条命令，玩家点了才润色），
且润色结果**以独立字段保存**（原文不动）。那时它是「建议」不是「改写」，可以接。

### 3. `ensemble`（多模型并发推演与仲裁，`engines/ensemble.js`）

它的成本模型是「一次推演花 N 次调用」。本仓没有任何一处判据回答
「这一次值不值得多花 N−1 次调用」。没有这条判据，接进主链就是**无条件变贵**。

它是五台里入口最少的一台：没有面板开关、没有工具表、没有行动台路由，
只有 `tool-diag-tables` 里一行「文件 → 命名空间」注册（那行只影响自检报不报 missing）。

**改判触发器**：出现「这一次推演必须多解」的可判定场景（例如玩家主动要求「给我三种可能」，
或某个高风险抉择点由 `choiceBoard` 标记为 `needs-branches`）。届时按场景接，不按轮次接。

### 4. `archiveHide`（归档楼层隐藏，`engines/archive-hide.js`）
### 5. `autoHide`（自动隐去，`engines/auto-hide.js`）

两台做的是同一件事的两半：`archiveHide.plan` 出「该隐藏哪些楼」的建议集（纯函数），
`autoHide` 记账并声明「真正的 `/hide` 由宿主做」。它们的共同前置是**宿主侧的隐藏动作**，
而本仓从未落地那一步——`engines/timeline.js` 的注释写得很直白：
「不实现 syncHidden（隐藏楼层涉及 /hide 命令副作用）」。

也就是说：这里缺的不是判据，是**宿主动作**。在没有宿主动作之前把它们接进注入装配，
只会得到「计划藏了但没藏」的假读数——`autoHide` 已经有了 11 处工具表 + 7 条行动台路由，
读数看起来最「热」，恰恰最容易掩盖这一点。

**改判触发器**：宿主提供可编程的隐藏 API（或本仓决定用 `is_system` 之外的等价落地方式），
且该动作**可逆**（能一键恢复）。届时 `autoHide` 先接（它已经管记账），
`archiveHide` 并入或退役。

## 四、这把锁锁了什么

`tests/orphan-engine-adjudication-v2550.js`：A/B/C/D/E 五组（21 段）+ F 组（第二批，14 段），共 35 段。

- **A 定义面**（A0–A3）五台都在 `WA` 上、关键方法在场、`WA.<ns> = {` 在各自文件里恰 1 处、
  `getSettings().enabled` 均为 `true`（把「默认开着」也钉住：改成默认关要回来改本文）。
- **B 可达面**（B0–B4）四类入口的**精确计数**：开关行数、工具表 `WA.<ns>.` 出现次数、
  行动台路由数、注册行数。数字变了 = 入口变了 = 裁决要重看，锁必须红；
  `ensemble` 三项全 0 是结论的一部分，不是漏测。
- **C 故事面**（C0 + 五段）除自身文件、`tool-diag*`、`narrow-consumers`、`action-desk-routes`
  之外，全库源码不得出现 `WA.<ns>`。**这是主判据。**
- **D 文档面**（D0–D2）本文在位，五台名字与文件路径都在，且含「改判触发器」「开关≠读点」
  「复算命令」三个锚点，以及排除项与锁文件名（防止文档与锁各说各话）。
- **E 非空转**（E0–E2）合成样本 `WA.polish` 必须被判红、`WA.polishExtra` 不误伤、
  三个排除面确实存在、`autoHide` 仍在窄消费者台账里（本裁决不新增也不注销条目）。

负控：在 `render/inject.js` 里加一行 `WA.polish` 引用 ⇒ C 段立刻红并点名该文件；删掉即绿。

## 四点五、第二批（v2.588.0 / R264）：又七台「定义面完整、故事面零读」

> 起因：R264 盘「项目最欠缺」时按 `tests/ns-consumer-ledger.json` 逐条复算，
> 发现零读名单里除上面五台，还有七台处于同一状态（合计约 1,188 行）。
> 本轮**不接线**，只把裁决补齐 —— 否则账本说「零读」、本文说「五台」，
> 第八台起就没有任何地方回答「为什么它有定义面却没人读」。

这七台的形态与前五台不同，所以**不塞进同一张表**：其中三台（`observationProjection` /
`unifiedPending` / `fieldWriters`）根本没有设置面，硬套「`getSettings().enabled` 必为 true」
会要求它们凭空长出一个设置面 —— 那是为了迁就锁而改产品。

| 引擎 | 命名空间 | 文件 | 面板开关 | 工具表 | 行动台 | 注册行 | 故事面 |
|---|---|---|---|---|---|---|---|
| 输入润色与合并 | `refine` | `engines/refine.js` | 1 行 | 0 | 0 | 1 行 | **零** |
| 观察面投影 | `observationProjection` | `engines/observation-projection.js` | 0 | 0 | 0 | 1 行 | **零** |
| 作用域绑定 | `binding` | `engines/binding.js` | 1 行 | 0 | 0 | 1 行 | **零** |
| 自定义历法规划 | `calendarPlan` | `engines/calendar-custom.js` | 1 行 | 0 | 0 | 1 行 | **零** |
| 净域保护 | `purifyScope` | `engines/purify-scope.js` | 1 行 | 0 | 0 | 1 行 | **零** |
| 统一待办聚合器 | `unifiedPending` | `core/unified-pending.js` | 0 | 0 | 0 | 1 行 | **零** |
| 字段写者登记 | `fieldWriters` | `engines/field-writers.js` | 0 | 0 | 0 | 1 行 | **零** |

逐个的「为什么现在不接」与改判触发器：

- **`refine`（`engines/refine.js`，与 `polish` 同族）** —— 它与 `polish` 真正的区别是
  `merge` / `condense`：把多段玩家输入合并、压缩成一段。缺的是同一件事：
  **一个「玩家要求改写原话」的显式入口**。没有它，接进输入侧就是把玩家原话改掉。
  改判触发器：与 `polish` 共用一条（显式按钮 + 原文独立保存），且合并/压缩的行为要**分别**
  给玩家开关（合并与润色不是一回事，一条开关盖两项是另一类假读数）。
- **`observationProjection`（`engines/observation-projection.js`）** ——
  `project` / `sole` 判的是「同一个观察被几个视角提到、哪些视角是唯一来源」。
  这需要一份**观察者维度**的上下文，而本仓的注入装配是按「楼层 + 角色」组织的，
  没有「这条信息是谁看到的」这个坐标。硬接的后果：所有观察被投影成同一个来源，
  读数看起来有值，实际全是恒定值。
  改判触发器：`engines/geo-tracker.js` 之外出现第二个「视角/在场」坐标系（例如
  某个场景锁开始按在场者筛信息），届时投影才有输入。
- **`binding`（`engines/binding.js`）** —— `bind` / `read` / `unbind` 是**作用域级**的
  变量绑定（`SCOPES` 是常量表），与 `corridor` / `变量驱动条款` 有交集但语义更宽。
  缺的是「谁在什么作用域里写变量」这条纪律落地 —— 本仓的变量写点目前是扁平的。
  先接它会得到「绑定表能查，但没人绑」的空表。
  改判触发器：`ui/pages` 出现「按作用域编辑变量」的编辑面，或注入层开始按作用域取变量。
- **`calendarPlan`（`engines/calendar-custom.js`）** —— 自定义历法（`setMonths` / `getMonths`）
  需要玩家先定一套历，然后全仓按它算日期。而 `engines/clock.js` 已是时间唯一真源，
  两者并存必须先回答「谁覆盖谁」，否则同一天会有两种读法（这是本仓治过多次的
  「同形不可分辨」）。
  改判触发器：历法成为**clock 的一个可配置字段**（而不是第二条时间真源）时，本台并入 clock 或退役。
- **`purifyScope`（`engines/purify-scope.js`）** —— `protect` / `restore` 是「某些文本
  不该被注入净化掉」的白名单机制。它的前提是**已有一条会误伤的净化路径**；本仓的
  净化是逐条显式规则（`PATTERNS`），没有「先净化再恢复」的两段式。
  改判触发器：出现「批量净化 + 事后回滚」的真实需求（例如导入既有世界后统一清洗）。
- **`unifiedPending`（`core/unified-pending.js`）** —— 这是**最可惜的一台**：它把
  `todo` / `beat` / `chapter` / `intel` 四处的「待办」合并成一份视图
  （`collect` 返回 total / high / hands / skipped），正是「待办中心」页最该读的东西，
  而待办页读的是分散的各家读口。它的 3 处 `WA.unifiedPending` 全在同一文件里，
  其中 2 处在**文档注释**里 —— 这正是它「看起来定义面完整、实际无人读」的成因。
  改判触发器：`ui/pages` 的待办页（`todo`）改读 `collect()` 一次成表；这条改动**可以现在做**，
  但它会改一页的读面，必须与那一页的专锁同批（不在本裁决的范围内）。
- **`fieldWriters`（`engines/field-writers.js`）** —— `conflicts` / `undeclaredConflicts`
  判的是「同一个字段被两个写者写过」，是一把**静态审计**刀，天然该由 `tool-diag` 侧消费，
  而不是故事面。它零读的结论与 `autoHide` 同型：**它不是欠接，是它本来就该停在工具面**。
  改判触发器：若它被接进故事面（例如写前查冲突），那时它不是「审计」而是「闸」，
  本裁决应改判为「已接」并改锁。

### 与零读账本的关系（第二批）

七台全部仍在 `tests/ns-consumer-ledger.json` 的 `entries` 里，分类不变；
本裁决**不注销任何条目**——同一句话再说一遍：注销需要读点。

台账里 `fieldWriters` 与 `unifiedPending` 的档位是「程序或宿主消费」，本文的档位是
「故事面有没有人读」。两个问题不同，所以两处都不注销。

## 五、复算命令

```bash
# 五台的故事面引用（应全为 0；工具表 / 窄台账 / 行动台路由不算故事面）
for n in preflight polish ensemble archiveHide autoHide; do
  printf '%-12s ' "$n"
  grep -rn "WA\.$n\b" --include=*.js engines core render ui actors direction index.js \
    | grep -vE 'tool-diag|narrow-consumers|action-desk-routes' | wc -l
done

# 可达面四类入口的计数（对照本文第一节表格）
for n in preflight polish ensemble archiveHide autoHide; do
  printf '%-12s switch=%s toolTable=%s deskRoute=%s\n' "$n" \
    "$(grep -c "data-sw-ns=\"$n\"" ui/settings.js)" \
    "$(grep -c "WA\.$n\." engines/tool-diag-tables.js)" \
    "$(grep -c "WA\.$n\." engines/action-desk-routes.js)"
done

# 宿主隐藏动作是否存在（预期：只有注释提到 /hide，没有调用）
grep -rnE 'hideMessage|/hide' --include=*.js core render ui engines | wc -l

# 第二批七台的零读复算（应全为 0；行尾注释里提到的 `WA.x = {...}` 不算读点）
for n in refine observationProjection binding calendarPlan purifyScope unifiedPending fieldWriters; do
  printf '%-22s ' "$n"
  grep -rn "WA\.$n" --include=*.js engines core render ui actors direction index.js     | grep -vE 'tool-diag|narrow-consumers|action-desk-routes' | wc -l
done

# 第二批的「行首 `WA.<ns> = {`」恰一处（`unifiedPending` 有 2 处在注释里，故不能用全文 grep -c）
for f in engines/refine.js engines/observation-projection.js engines/binding.js          engines/calendar-custom.js engines/purify-scope.js core/unified-pending.js engines/field-writers.js; do
  printf '%-40s %s
' "$f" "$(grep -cE '^[[:space:]]*WA\.[A-Za-z]+ = \{' "$f")"
done

# 裁决锁
node tests/orphan-engine-adjudication-v2550.js    # ⇒ pass (35 段)
```

## 五点五、改判记录（v2.590.0 → v2.594.0）：四台已出列

本文第五节的口径是「零读是对的」，一旦出现真读点，裁决就被推翻 —— 推翻必须留痕，
**不能只改锁**。下面四台已从「第二批零故事面读点」名单出列，读点逐条列在这里。
出列后锁不再要求「零命中」，而是要求**命中集恰等于下表**（多一处/少一处都红）。

| 命名空间 | 文件 | 出列版本 | 故事面读点 | 为什么这算是真读点 |
|---|---|---|---|---|
| `unifiedPending` | `core/unified-pending.js` | **v2.590.0**（PBS-1） | `engines/pending-recon.js`、`ui/panel.js` | 对读面真调 `collect()` 把两套聚合器的分歧摆出来，面板段消费该读数 |
| `refine` | `engines/refine.js` | **v2.592.0**（RFA-1） | `engines/refine-bridge.js` | 精编预览真调 `merge` / `condense`，工具页把「能省几条」显示出来 |
| `fieldWriters` | `engines/field-writers.js` | **v2.593.0**（FWR-1） | `ui/pages/tools-page.js` | 「字段写权与覆盖冲突」段真读 `view()`，面板不另算一份写权表 |
| `observationProjection` | `engines/observation-projection.js` | **v2.594.0**（OPJ-1） | `engines/projection-bridge.js` | 把信念账的行装箱成 `(shared, holders)` 交给 `project()` 划座 |

**本期自查（如实记）**：前两台出列时只改了产品与零读账本，没改本文与锁 ⇒ 裁决锁
红了 4 轮没人看见（锁是独立脚本，不在快门禁批次里）。接线三件套 = 产品读点 / 零读账本注销 /
**本文改判 + 锁跟位**，缺一件就是潜伏红。本版一次性补上，并在锁里新增 G 段把「出列」
也变成可复算的：`G1` 查命中集恰等于上表、`G3` 查本文真的写了改判记录。

复算（应逐台打印出上表的读点，不多不少）：

```bash
for n in unifiedPending refine fieldWriters observationProjection; do
  printf '%-24s ' "$n"
  grep -rln "WA\.$n\b" --include=*.js engines core render ui actors direction index.js \
    | grep -vE 'tool-diag|narrow-consumers|action-desk-routes' | tr '\n' ' '; echo
done
```

## 五点六、改判记录（v2.597.0 / v2.600.0）：又两台出列

同上节口径：出列不是「忘了这一座」，是裁决真的被推翻了。这两台的推翻理由与前四台不同 ——
前四台是**功能被接上**，这两台是**读数本身成了产品**：原先没有任何地方能回答的问题，
现在有了一个只读的回答者。两座桥都不代它做事，只把它已经能算的东西说出来。

| 命名空间 | 文件 | 出列版本 | 故事面读点 | 为什么这算是真读点 |
|---|---|---|---|---|
| `ensemble` | `engines/ensemble.js` | **v2.597.0**（ENS-1） | `engines/ensemble-bridge.js` | 仲裁面体检：读 `getSettings` / `STRATEGIES` / `stat`，**一次 `run` 都不发**——它量的是「两套三档表是否漂移、配好的通道是不是全是继承来的」，不替用户仲裁 |
| `binding` | `engines/binding.js` | **v2.600.0**（BND-1） | `engines/binding-bridge.js` | 配置绑定遮蔽表：逐层调 `list` 只取键名、读 `SCOPES` 与 `getSettings` 判开关，**不 bind 不 unbind**——它回答「我在角色层改的那条为什么没生效」，不替用户改 |

两条边界（与「开关≠读点」同源，写在这里防止被读成「补了个最小读点销账」）：

1. **读数面成产品 ≠ 功能面成产品。** `ensemble` 今天的读数是 `no-channel-ready` / `no-runs`，
   `binding` 今天的读数是「三层各几键、哪一键被遮住」。它们出列是因为**这两个问题现在有人回答**，
   不是因为仲裁与绑定已经真在跑。销的是「零读」，不是「无数据」。
2. **读点必须恰等于落地面。** 两台的命中集各自只有一个文件（两座桥），锁的 `G1` 逐步比对，
   多一处就红 —— 否则「出列」会变成「随便找个人引用一下」。

复算（应各只打印一行，即各自的桥）：

```bash
for n in ensemble binding; do
  printf '%-12s ' "$n"
  grep -rln "WA\.$n\b" --include=*.js engines core render ui actors direction index.js     | grep -vE 'tool-diag|narrow-consumers|action-desk-routes' | tr '\n' ' '; echo
done
```

本期自查：`ensemble` 的改判是 v2.597.0 做的产品接线，但本锁当时没跟位（与上节那两台同款病，
**第二次复发**）；`binding` 的改判则同批完成。两台一起在本版补齐，锁的 G 段从四台扩到六台。

## 五点七、改判记录（v2.601.0）：polish 出列

第三次同款改判。前两次治的分别是「两套三档表漂移」与「谁遮住了谁」，这一次治的是
**「我用的是谁」**——三个问题都不属于引擎自己的能力，而属于引擎的**配置走向**，
而配置走向此前在全仓没有任何读者。

| 命名空间 | 文件 | 出列版本 | 故事面读点 | 为什么这算是真读点 |
|---|---|---|---|---|
| `polish` | `engines/polish.js` | **v2.601.0**（PLS-1） | `engines/polish-bridge.js` | 润色通道归位表：读 `CHANNEL` / `getSettings` / `stat`，**一次 `variants` 都不调**（那会真发一次模型请求）——它回答「润色到底用的是哪个模型」，不替用户润色 |

这台为什么必须出列，写清楚缘由：

1. **注释里写了边界，实现层没兑现，而读数为零。** `engines/polish.js` 的边界 4 写着
   「只走 `rewrite` 通道，**不回落别的通道**：回落会让『润色』悄悄变成『推演正文』」。
   事实上 `rewrite` 不在 `core/api-router.js` 的 `CHANNELS`
   （`['default','inference','digest','judge','choices','observe']`）里，
   而 `getChannel(name)` 的实现是 `cfg[name] || cfg.default` —— 这一次调用**恒回落 default**。
   于是那条边界的实际效果是：polish 自己没写回落，router 替它回落了，落到的正是推演用的那个通道。
2. **「参数是自己的，连接是别人的」。** 桥的 `params()` 把六项分成三比三：
   温度 / 上限 / 超时由 polish 发出并**覆盖**通道里的值（`opts.temperature != null`），
   模型 / 地址 / 密钥 polish 一个字都不发、全部来自通道。用户想让润色用个便宜模型时，
   唯一的入口是改 `default` —— 那同时改掉了推演。这条不对称此前无法被任何人读到。
3. **空段会截断回落。** `cfg[name] || cfg.default` 是**真值**判定：盘上若有一段 `rewrite: {}`，
   空对象为真 ⇒ 不回落 ⇒ `baseUrl` 为空 ⇒ 调用期 `not-configured`。
   「盘上有一段空配置」与「盘上什么都没」在旧读数上完全同形，后果相反。桥把这一态单列为
   `channel-off-list-empty`（`via: 'empty-seg'`）。

边界（与前两节同源，防止被读成「补了个最小读点销账」）：

1. **读数面成产品 ≠ 功能面成产品。** 桥出列是因为「润色到底用的哪个模型」这个问题的答案是产品面的一部分，
   不是因为润色功能变了。polish 自 v2.130.0 起就在，一行未改。
2. **读点必须恰等于落地面。** 命中集只有 `engines/polish-bridge.js` 一个文件（`G1` 逐步比对）。
3. **桥零跑。** 这是三座桥里唯一一座「顺手就能产生副作用」的：`variants()` 会真发一次
   `apiRouter.call`，`pick()` / `split()` 会改 `stat.blocked`。桥的专锁 B18 用三个探针钉住
   `call` / `save` / `setSettings` 计数全 0，并断言调用前后 `polish.stat()` 逐字相等。

复算（应只打印一行）：

```bash
grep -rln "WA\.polish" --include=*.js engines core render ui actors direction index.js   | grep -vE 'tool-diag|narrow-consumers|action-desk-routes'
# → engines/polish-bridge.js
```

本期自查：这是同款病的**第三次**（v2.597.0 只改产品没改锁、v2.600.0 补齐后，v2.601.0 是提前同批做的）。
本版没有复发——接线、账本销行（44 → 43）、锁的改判、文档五节七与专锁三件同批完成。

## 五点八、改判记录（v2.602.0）：purifyScope 出列

第四次同款改判（前三次：v2.592.0 四台、v2.597.0 ensemble、v2.600.0 binding、v2.601.0 polish）。
这一次治的是**净化链的一次文本变换**，而它的失败形态比前几次更隐蔽。

| 命名空间 | 文件 | 出列版本 | 故事面读点 | 为什么这算是真读点 |
|---|---|---|---|---|
| `purifyScope` | `engines/purify-scope.js` | **v2.602.0**（PSC-1） | `engines/purify-scope-bridge.js` | 净化保护配对表：读 `kinds` / `getSettings` / `stat`，**一次 `protect` / `restore` / `applyWith` 都不调**——它回答「净化链到底有没有走过保护、走过几次、还原回来几次」 |

这台为什么必须出列：

1. **它自己的注释就写着「保护出得去回不来是比没保护更坏的结局」，而没有人能回答那天发生了哪一种。**
   `purify-scope.js` 的边界 4 逐字写着：占位符被净化规则吃掉时返回失败体，
   因为「正文会永久残留占位符」。但这个失败体只能被**调用方**看见，而调用方不存在。
2. **四种「什么都没发生」在它的自有读数上同形。** `protects` / `restored` / `blocks` 三个数
   不区分：从来没跑过（`protects === 0`）、跑了但每次无块可保（`blocks === 0`）、
   保了没还原（`restored < protects`）、实锤回不来（`faults[not-found] > 0`）。
   而这四种的处置完全不同：第一种要接线，第二种要改图案，后两种要回滚正文。
3. **cap 处是静默截断。** `if (outer.length >= cap) break` —— 第 `maxBlocks` 块之后的受保护段
   **不报错、不计数**。返回体的 `count` 只说「保护了几块」，不说「还剩几块没保」。
   这不是 bug，是判据的静默部分；它必须被写成一条读数，否则「保护全了」与「保护到上限为止」同形。

边界（与前三节同源）：

1. **读数面成产品 ≠ 功能面成产品。** 今天桥的 verdict 是 `never-run` —— 这恰恰证明
   引擎本体一行未改、链路一次没走。
2. **读点必须恰等于落地面。** 命中集只有 `engines/purify-scope-bridge.js`（`G1` 逐步比对）。
3. **桥零跑，这一条比前几台更硬。** `protect` / `restore` 都会改 `stat` 的六个计数，
   `applyWith` 还会连带调两者。专锁 B12 用三个探针钉住调用计数全 0，
   并断言调用前后 `purifyScope.stat()` 逐字相等。
4. **只报结构不报正文。** `residue()` 只回「含几个占位符」，绝不把残留文本带出来 ——
   那是楼层正文，可能含剧透。专锁 B11e 用「秘密正文」做样本，断言返回体里搜不到那四个字。

复算（应只打印一行）：

```bash
grep -rln "WA\.purifyScope\b" --include=*.js engines core render ui actors direction index.js \
  | grep -vE 'tool-diag|narrow-consumers|action-desk-routes'
# → engines/purify-scope-bridge.js
```

本期自查：接线、账本销行（43 → 42）、锁的改判、文档本节与专锁五件**同批**完成，未复发旧病。

## 六、与 `ns-consumer-ledger` 的关系

仍在本锁名下的这几台（TARGETS 3 + 第二批 1）都在零读账本的 `entries` 里，分类不变；已出列的八台里 `polish` / `purifyScope` / `binding` 已同批销行（销的是「零读」，不是「功能已完成」），`ensemble` 未在账本内，另四台的读点形态见上两节。本文不注销任何条目——
**注销需要读点，而本文的结论正是「现在没有合法读点」**。
两者的分工是：账本说「它零读」，本文说「为什么零读是对的、什么条件下不再对」。

`autoHide` 另有一层关系：它已被 `engines/narrow-consumers.js` 的窄消费者台账登记
（12 台之一），那份台账的档位是「有没有运行时数据」，本文的档位是「故事面有没有人读」——
两个问题不同，所以两处都不注销。