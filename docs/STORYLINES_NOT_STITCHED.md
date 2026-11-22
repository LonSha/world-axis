# 事件线（storylines）为什么不缝：ST-SevenDaysCal 考古结论

> 起因：用户提出「我们做的暗流面板，学习过的 ST-SevenDaysCal 不是有吗，为什么没有缝入」。
> 本文是回答，全部结论都有现场命令与文件行号可复算。

## 一、先回答「缝了没有」

**缝了 12 个文件，但没有一个来自 `business/lines/`。**

```
$ grep -rln 'SevenDaysCal' engines/ core/ | while read f; do printf '%-34s %s\n' "$f" "$(wc -l < $f)"; done
core/store.js                      4910
engines/calendar-custom.js         141
engines/calendar.js                149
engines/coordinate.js              275
engines/memory-tiers.js            211
engines/plan.js                    727
engines/reasoning.js               172
engines/stale-guard.js             161
engines/story-tone.js              149
engines/storyclock.js              124
engines/word-budget.js             113
engines/world-clock.js             231
--- 合计 7363 行
```

缝合面是**世界钟 / 历法 / 坐标 / 记忆分层 / 计划复核 / 推理边界 / 时间纪律 / 词预算**，
与 `docs/attribution.md:44` 的声明逐字一致：

```
| 3 | `ST-SevenDaysCal` | 世界钟 / 日历推进 | 已声明 | `未核对` | 读其 LICENSE |
```

也就是说：**上游有两条完全不同的产品线，我们只缝了其中一条。**

| 上游面 | 目录 | 本仓状态 |
|---|---|---|
| 世界钟 / 历法 / 时间纪律 | `business/calendar` 等 | ✅ 缝了 12 文件 / 7363 行 |
| 事件线（storylines） | `business/lines/`（27 个源文件） | ❌ **一个都没缝** |

## 二、为什么说「没缝」是硬的（三条实证）

### 证据一：命名面零命中

```
$ grep -rn 'storylines_widget\|storylines' --include=*.js engines/ ui/ core/ render/ index.js | grep -v '.bak' | wc -l
0
```

### 证据二：五段 stage 词表逐个查

上游的线阶段是封闭五段 `起线 / 延展 / 成形 / 收束 / 淡出`（`schema.js` 的 `LINE_STAGES`）。

```
起线: 0 文件
延展: 0 文件
成形: 1 文件   ← engines/reject-recovery.js 的注释「运行期才成形」，与剧情阶段无关
收束: 14 文件  ← 全是伏笔/长线/张力等「叙事收束」语义
淡出: 1 文件   ← ui/cyberpunk-animations.js 的动画名
```

### 证据三：历史记录里主动删过同名的死存储

`ITERATION_LOG.md:6126`（v1.4.0）记着当年删掉零读零写的 `chapters.storylines/relations`。
「storylines」这个命名面在本仓的历史判断里**不是待补缺口，是已被评估过不需要的容器**。

## 三、为什么「缝不进来」也是硬的（两个结构性障碍）

### 障碍一：暗流（currents）的真源不是 SevenDaysCal

本仓暗流的真源是 **world-backstage**：

- 写入：`engines/backstage.js:725-750`（头注第 4 行「移植自 world-backstage」）
- schema：`core/store.js:67` → `{id,title,summary,visibility,public_trace,causes,participants,stage,createdAt,updatedAt,branchId}`
- 容量：`cap 40`（`core/store.js:1615`）
- 注入：`render/inject.js:29` 的 `SOURCES` 含 `currents`（默认 `true`），`backstage.js:227` 取未结算前 10 条

而 `ITERATION_LOG.md:661` 已经写明：**`world-backstage 2.5.8` 明确不进引擎（UI/宿主适配）**。
两侧的 stage 词表**完全不相交**——这是要害。

本仓 `engines/undercurrent-calendar.js`（v2.268.0，EXV6-4）的 `STAGE_WINDOWS` 有 23 个键：
`高潮/爆发/临界/climax/peak`、`激化/逼近/失控/escalating/urgent`、`发展/蔓延/推进/developing/spreading`、
`萌芽/潜伏/酝酿/seed/emerging`、`收尾/退潮/subsiding`。

把上游五段喂进去实测（`/tmp/probe_uc4.js`，真引擎 + 真 store 桩）：

```
起线   -> etaDays=2 urgency=medium name=持续推演   <<< 兜底
延展   -> etaDays=2 urgency=medium name=暗中推进
成形   -> etaDays=2 urgency=medium name=持续推演   <<< 兜底
收束   -> etaDays=2 urgency=medium name=持续推演   <<< 兜底
淡出   -> etaDays=2 urgency=medium name=持续推演   <<< 兜底
   已结束  -> (被 CLOSED_STAGES 过滤掉，不进视界)
逼近   -> etaDays=1 urgency=high   name=即将撞上
高潮   -> etaDays=0 urgency=critical name=临界爆发
萌芽   -> etaDays=3 urgency=low    name=潜伏酝酿
激化   -> etaDays=1 urgency=high   name=即将撞上
发展   -> etaDays=2 urgency=medium name=暗中推进
```

**五段里有四段走兜底**（`{etaDays:2, turns:'2-3轮', urgency:'medium', name:'持续推演', windowText:'态势未定'}`）。
即便把上游的线数据原样灌进本仓暗流容器，暗流日历也只会把它判成「2 天后、medium、持续推演」——
**玩家看不到任何阶段差异**。这不是「差一个字段」，是两个不同的阶段模型。

### 障碍二：本仓没有楼内渲染面，上游最核心的那半无处安放

上游 lines 的高价值部分，一半在**消息落楼之后就地渲染**：

- `debug-sessions/2026-07-10-storylines-feature.md`：每条 AI 消息后挂一个 `<details>` 折叠块（`▶ 事件线 N条活跃`）
- `widget.js`（92 行）：处理 `<storylines_widget>` 内联块的增删改 + `locator` 防误改
- `render.js`：`<article data-line-idx><h3>name</h3><p>desc</p><p>next</p></article>`

本仓侧：

```
$ grep -rn 'MESSAGE_RENDERED\|CHARACTER_MESSAGE_RENDERED\|messageTemplate\|insertMessage' --include=*.js . | grep -v node_modules | wc -l
0
```

`render/` 目录只有 `inject.js / purifier.js / map-viewport.js / theater.js` 四个文件，全是**注入面**，
没有一个是**渲染面**。`<details>` 只用在 `ui/panel.js:184/461` 的概览折叠壳（v2.254.0）。

也就是说：上游「每条消息后挂折叠块」在本仓**连承载骨架都没有**。要缝它，先得从零建一套消息渲染管线——
那是另一个工程，不是「补一个模块」。

## 四、那么本仓的暗流面板与上游事件线，到底差在哪

| 维度 | 上游 `business/lines/` | 本仓 `currents`（暗流） |
|---|---|---|
| 真源 | SevenDaysCal 自建 `lines-*` 容器 | world-backstage 的 `currents` |
| 阶段模型 | 五段 `起线/延展/成形/收束/淡出` + 31 条别名归一 | 23 键 `STAGE_WINDOWS`（高潮/激化/发展/萌芽/收尾…） |
| 行结构 | `{name,stage,when,agency,stall,pin,adult,desc,next,cue}` | `{id,title,summary,visibility,stage,causes,participants,...}` |
| 推进机制 | `createAdvanceStrategy({mode:'turns'|'days'|'manual'})` 自动推进 | **无推进器**，靠推演结算改写 stage |
| 面板 | 线 Tab（第四个）+ 阶段色板 + 点级 `●●○○` | `ui/panel.js:1227` 一行列表：徽章+标题+stage+120 字摘要 |
| 玩家编辑 | `<storylines_widget>` 内联增删改 + locator 防误改 | **零入口**（`grep 'editorCurrents\|cur-edit\|cur-add\|cur-del'` 零命中） |
| 楼内渲染 | 每条消息后 `<details>` 折叠块 | **无渲染面** |
| 自动生成 | `linesEnabled` 独立开关，`AUTO_LINE_CAPACITY=8` 仅首次生成限制 | 无自动生成，全由推演写 |
| Prompt 硬口径 | 四条（Next 是待发生方向 / 旧 Desc 不能证明已发生 / 人物自主 / 输出前复核） | 无对应条目 |

**一句话**：本仓的「暗流」是**世界侧的事实账**（谁在暗中做什么、什么时候撞上），
上游的「事件线」是**叙事侧的伏笔管理**（这条线索走到哪一步、下回合往哪推、玩家看得见几成）。
两者都在回答「未结算的事」，但一个站在**结算面**，一个站在**叙事面**。

## 五、结论与建议

### 「没缝」是判据的产物，不是遗漏

三条依据叠起来看，是**三个各自独立的阻断**，任一条都足以让这次缝合不成立：

1. **缝合面声明**：`attribution.md` 把 SevenDaysCal 的缝合面逐字写成「世界钟 / 日历推进」，
   没有 lines。这不是事后找补，是当年缝合时就划定的边界。
2. **阶段模型不相交**：本仓 `STAGE_WINDOWS` 与上游 `LINE_STAGES` 实测五段里四段走兜底。
   缝数据不缝模型 = 玩家看不到差异。
3. **渲染面缺席**：上游一半价值在楼内折叠块，本仓零消息渲染管线。

再叠上 `ITERATION_LOG.md:5374 / 5938 / 5958` 的既有判据（「上游的界面与配置面不缝」
「等级/经验/战斗结算系数属推演结算面不收」「破限头部/NSFW 款/混淆长文/伪闭合标签一律不进引擎」）——
**上游的界面面本来就在不收之列**，而 lines 的高价值部分恰好在界面面。

### 若确实要补，最小可行路径（不是照搬）

不要缝整个 `business/lines/`（27 文件），只取**三块不进界面、只进结算**的部分：

| 优先级 | 取什么 | 落到哪 | 为什么值得 |
|---|---|---|---|
| 高 | `prompt.js` 的四条硬口径 | 折进 `engines/backstage.js` 的暗流注入前缀 | 纯文本约束，零渲染面依赖，能立刻提升暗流质量 |
| 高 | `schema.js` 的 31 条别名归一 | 扩 `undercurrent-calendar.js` 的 `STAGE_WINDOWS`（补 起线/延展/成形/收束/淡出 五键） | 消除「四段走兜底」这个真缺陷 |
| 中 | `strategy.js` 的 `createAdvanceStrategy` | 新 `engines/storyline-advance.js`（按轮/按日推进） | 本仓暗流目前**无推进器**，全被动等推演写；这是真实缺口 |

**明确不建议缝**：`widget.js`（内联块增删改）、`render.js`（`<article>` 渲染）、
`inline.js` / `dashed.js` / `glyph.js`（视觉层）——本仓无消息渲染管线，缝进来是死代码。

## 附：本文所有现场命令

```bash
# 缝合面清点
grep -rln 'SevenDaysCal' engines/ core/ | xargs wc -l | tail -1        # 7363
sed -n '44p' docs/attribution.md                                        # 第 3 行声明

# 没缝的三条实证
grep -rn 'storylines_widget\|storylines' --include=*.js engines/ ui/ core/ render/ index.js | wc -l   # 0
for s in 起线 延展 成形 收束 淡出; do printf '%s: ' $s; grep -rl "$s" --include=*.js engines/ ui/ core/ render/ | wc -l; done
grep -rn 'MESSAGE_RENDERED\|messageTemplate' --include=*.js . | grep -v node_modules | wc -l          # 0

# 阶段模型不相交（实测）
node /tmp/probe_uc4.js

# 暗流真源
grep -n 'currents' render/inject.js | head -3                           # SOURCES 含 currents
grep -n 'slice(-40)\|cap: 40' core/store.js engines/backstage.js        # 容量
```