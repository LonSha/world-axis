# Agent Note: 缝 World Chronicle 的内联状态回报标签 + 真机联调工具链
Status: implemented
用户授权把 github.com/wojiaoxiaojiuli-blip/WorldChronicle 的能力缝进本仓。对接清单先做减法再复核归属：刊物（periodicals）、音乐（bgm）、卡内嵌剧本、正文内联标签四类里，前三类本仓要么已有等价物（agenda 聚合、api-router 多通道、worldFacts 世界事实），要么缺音频通道不该假缝；唯一真缺口是**模型没有任何轻量通道把时间/抉择/事实直接告诉引擎**。选择只缝 tags.js 语义，并把三类落点全部接回既有真源（clock.iso / store.chronicle / store.worldFacts），拒绝新建第二套日期或事实容器。真机联调同时在真实 ST + 真实 Chromium 里跑通，并实测出两件产品既有行为。
## Problem
本仓全部世界状态由引擎从正文推断：时间靠 `calendar.suggestAdvance` 匹配「次日/黄昏」这类中文时间词，抉择只能由玩家在面板点，世界事实只能由面板或引擎写。模型侧零回报通道（`<time>`/`<choice>`/`<flag>` 全仓 0 命中）。模棱两可的时间词正是世界钟误推进的来源，而「模型说这一轮走了哪天」这件事此前完全无法表达。
## Decision
新增 `engines/inline-tags.js`（v2.302.0），只做解析与落账，不做显示改写：`<time>` → `clock.iso`（既有字段，走 `calendar.setClock`）、`<choice>` → `store.chronicle`（`kind:'inline-choice'`，归档历史真源）、`<flag>` → `store.worldFacts`（`scope:'flag'`，按 key 去重只更新 at）。`<bgm>` 只解析不落账，`owners.bgm` 诚实为 null。特地**不**用 `storyChoice.present`：它的语义是「引擎呈现一个待选点」，把已发生的抉择塞进去等于伪造待选项。拦截器里解析排在净化链**之前**且用**原文**，避免读数依赖另一条链。空状态（未开聊天）不补默认世界钟，而是分开记 `timeNoClock`/`noStore`/`fault` 三种「没写」。
## Consequences
`tests/inline-tags-v2302.js` 56 项（含三条反向自证：破坏去重锁、让日期兜底、让 bgm 落账都必须变红），已挂进 `tests/run.js`。`tools/rt-inline-tags.js` 在真实宿主跑到 20/0。真机联调还实测出两条**产品既有**行为并留了探针：裸 `store.transact` 与裸 `store.save()` 在没有聊天存档的宿主里都会长时间不返回（`tools/rt-probe-transact.js` / `tools/rt-probe-save.js`），所以真机验「落盘」必须先在真实聊天里跑；`rt-inline-tags` 因此只用写口监听验「接线与 payload 正确」，并在输出里标明这不等同落盘证据。任何人给本模块加写口都必须继续走 `writeBounded()`，否则消息接收回调会被写口拖住。

## Alternatives considered
1) 把 WC 的 `date.js` 一起搬来 —— 否决：会造第二套日期真源，与 `store.clock`（label + dayIndex）和 `chrono` 三处并存。2) 用 `pack.flags` 存 `<flag>` —— 否决：本仓没有 pack 概念，世界事实真源是 `worldFacts`。3) 顺手把 periodicals（独立出刊小报）也缝进来 —— 暂缓而非否决：它确属缺口（本仓 0 命中），但依赖「按日排期 + 另起 AI 调用 + 周刊渲染」三件配套，属于独立版本量级，塞进本次缝合会把两件事混在一起。4) 真机脚本坚持跑完整 store 写入 —— 否决：会被 save 阻塞拖死，且那是产品行为不是本模块问题，硬跑等于用一个错误判据卡住正确代码。