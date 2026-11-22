# Agent Note: V11 页面浏览器渲染证据与事务探针边界

Status: implemented

## Problem
V11 矩阵的 UI 项仅含源码级检查，无法证明真实宿主能够渲染。期刊真实存储探针超时也缺少具体阶段。

## Decision
tools/rt-v11-pages.js 在真实 ST 与 Chromium 中初始化世界骨架，逐页打开 boot/health/drive/todo/inject/tools，检查导航返回与面板非空。该证据仅为渲染，不替代业务按钮验收。期刊存储探针记录 init 前后及 transact 前日志，仍保留 25 秒预算。

## Alternatives considered
直接把 V11 矩阵源码级标记改成浏览器验收最省维护，但页面渲染并未覆盖每项业务行为，因此保持原矩阵声明。把超时归因保存链容易误导维护者，因此只记录实际观察到的阶段，不推测根因。

## Consequences
六页渲染均通过。真实存储探针显示 init 完成、第一次 transact 未返回；未取得保存与重载证据。V11 专项矩阵运行超过本轮 60 秒命令预算被终止，没有完整结果，不能报告通过。未执行全量回归。该记录与期刊笔记部分重叠：后者负责产品设计，本篇负责新增浏览器探针及证据边界。

## 覆盖率扫描成本
推进 API 覆盖率锁在同一 callSites 调用中先按文件剥除注释与字面量，再复用结果匹配各 API，避免按 API 重复处理整库文本。缓存仅属于本次调用，不跨 runAll/runNegative，因此负控制修改源码后仍会重新扫描。保留全部既有正反判据；没有采用跨调用缓存，因为它可能遮蔽负控制的源码变化。

## 写权与拒收码复验
inline-tags 的 worldFacts 按 key 合并写入在 field-writers 中登记为 merge。测试宿主 LOAD 同步加载 inline-tags 与 periodicals，使拒收码见证能真实调用期刊配置拒收口；新增 no-story-context、invalid-definition 两条见证，临时聊天读口在 finally 中恢复，手册由生成器同步。字段写权正反控制 19/19，生成器分类为见证 749、死表 52、基线 550。完整矩阵仍以最终复跑为准。
