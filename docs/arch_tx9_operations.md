# TX9: engines/operations.js — 权限批准、组织项目与运营结算

## 版本
v2.172.0 (R158)

## 缺口
inst 有提案/批准/违约核验，org 有资源/项目/薪酬/债务。但「批准→执行→结算」这条链没有一条线：批准通过后谁创建项目？资源拨付走哪条回执？周期结算怎么和 org 的 payroll/debt 衔接？人员交接后项目归谁？operations 补的就是这一层。

## 设计
- **协调者，不替代**：enact 只调 inst.authority + org.canAfford 的只读面，disburse 只调 org.transfer 的写入面，不复制状态
- **inst org vs faction**：inst.charter 创建的组织在 state().inst.orgs 中，不是 evolution.factions。org.grant/canAfford 只查 faction/person。operations 在检查预算时先判断 orgId 是否在 factions 中——faction 存在则检查 org 资源，不存在则走内部预算跟踪（budget/spent 在项目记录上）
- **store.transact 后重读**：find() 返回的对象在 transact 后可能是旧引用，settle/disburse 返回值必须重读 find() 获取最新状态

## 14 导出
getSettings/setSettings + enact/disburse/settle/handover + active/pending/view/cancel + buildBlock/diagnose/stat/reset

## 八条否定式边界
1. 默认关（enabled:false）
2. 批准通过≠项目完成——enact 检查 inst.decide 返回 approved 才创建
3. 不能把私人人际关系当批准权——authority 走 inst 的 holdersOf
4. 无权提案不能拨款——disburse 检查 inst.authority
5. 资源不足保留明确阻塞——org.canAfford 失败时拒收不半写
6. 同一周期不重复结算——settle 用 cycleTag 去重
7. 调职/离任不静默清空旧债——handover 移交项目引用，旧义务保留
8. 不凭空造批准/造项目/造资源/造结算

## 拒收码
disabled/duplicate-enact/not-approved/not-authorized/projects-full/over-budget/insufficient-budget/insufficient-funds/transfer-failed/duplicate-settle/not-owner/unknown-decision/unknown-org/not-found/not-active/missing-fields

## 注入链
render/inject.js 5 点 + ui/panel.js + inject-budget.js + index.js + manifest.json + tests/run.js + tool-diag 4 点

## 测试
- 专锁 tests/s3-tx9-v2172.js: 46/0
- 冒烟 tools/tx9_smoke.js: 16/0
- 台账: module-registry 188/196/90/0/178, dead-export 824/3, export-contract 重生成
- 门禁钉: settle-v2830 pass(55), module-cycle-gate-v2107 pass(65)
- reject-code: 757 = 见证 481 / 死表 49 / 基线 228
- 版本钉: TX2/TX3/TX4/TX6/TX7/TX8 全部接受 2.172.0
