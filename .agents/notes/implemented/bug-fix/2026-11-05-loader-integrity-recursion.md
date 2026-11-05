# Agent Note: 启动失败表回读避免完整性递归

Status: implemented

## Problem
真实 ST 中首次 store.transact 超过 25 秒不返回。请求源码插桩显示进入 gateLoadIntegrity 后停滞。失败投影未发布时 loaderFailureRels 调 loaderStatus，后者调用 loaderIntegrity 再进 store.integrity/loadGap，形成递归。

## Decision
投影数组优先；投影未发布则直接读取入口 __loaderState.failed 的键，不再调用包含完整性诊断的 loaderStatus。原始表也不可读时保持 unknown 收紧语义。没有入口时仍不适用。

## Alternatives considered
只等启动完成可以规避部分时间窗，但不能保护早期合法写入。将未知一律放行虽能恢复写入却违反关键模块缺失时拒写契约，因此不采用。

## Consequences
失败表读取不再依赖其正在服务的 store 完整性判定。专锁 5 项、既有 Q1 64 项通过。真实隔离上下文的事务/期刊保存/重载通过；原生 ST 自带角色聊天中 persisted:true，期刊保存后调用宿主 saveChat/reloadCurrentChat，正文仍存在。模型响应受控替换，未验证外部供应商。原生验收会在本地自带角色聊天中保留 native-acceptance 测试刊物。