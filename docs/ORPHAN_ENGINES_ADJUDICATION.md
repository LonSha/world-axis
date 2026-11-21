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

`tests/orphan-engine-adjudication-v2550.js`：A/B/C/D/E 五组，共 21 段。

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

# 裁决锁
node tests/orphan-engine-adjudication-v2550.js    # ⇒ pass (21 段)
```

## 六、与 `ns-consumer-ledger` 的关系

这五台仍在零读账本的 `entries` 里，分类不变。本文不注销任何条目——
**注销需要读点，而本文的结论正是「现在没有合法读点」**。
两者的分工是：账本说「它零读」，本文说「为什么零读是对的、什么条件下不再对」。

`autoHide` 另有一层关系：它已被 `engines/narrow-consumers.js` 的窄消费者台账登记
（12 台之一），那份台账的档位是「有没有运行时数据」，本文的档位是「故事面有没有人读」——
两个问题不同，所以两处都不注销。