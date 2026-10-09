# TX6: 多阶段委托、交付核验与资源履约 — engines/commission.js

**版本**: v2.169.0
**日期**: 2026-10-07
**模块**: `engines/commission.js` (277 行, 12 exports)
**命名空间**: `WA.commission`

## 解决的缺口
opportunity 有窗口、liaison 有约定、org 有项目/债务/支付。但「多阶段委托」没有一条链。commission 补的就是这一层——协调者，不替代。

## 八条否定式边界
1. 默认关 2. 不自动付钱 3. 检查预算 4. receiptId 去重 5. 复用 liaison 6. 托管退回 7. 超期不默认恶意 8. 不凭空造回执/资源/阶段

## 注入链七点（显示名「委托履约」rank 5）
SOURCES/__REG.def/SRC_NAME/SRC_MOD_SETTING/注入分支/VIS_NAMES/PRIORITY+ACCOUNTS

## 门禁结果
专锁 49/0 + 冒烟 13/13 + reject-code 4 码（死表 29->33）+ 12 门禁全绿

## 教训
1. EXPORT_COUNT 设 11 实际 12（reset 遗漏）
2. tool-diag 模块映射行在 Python 批量编辑 assert 失败时未保存
