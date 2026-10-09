# TX7: 线索调查、证据核验与秘密揭示 — engines/investigation.js
**版本**: v2.170.0
**模块**: engines/investigation.js (320 行, 12 exports)
**命名空间**: WA.investigation

## 解决的缺口
intel 有来源/等级/核验，enigma 有秘密知情名单，rumor 有转述链，noesis 有知情边界。但调查作为玩法没有一条链。investigation 补的就是这一层。

## 八条否定式边界
1. 默认关 2. 传闻不是事实 3. 不存在保持 unknown 4. 不自动全知 5. 面板不露未发现秘密 6. 无法确认保持待业务 7. receiptId 去重 8. 不凭空造线索/证据/揭示

## 注入链七点（显示名「线索调查」rank 5）
SOURCES/__REG.def/SRC_NAME/SRC_MOD_SETTING/注入分支/VIS_NAMES/PRIORITY+ACCOUNTS

## 门禁结果
专锁 44/0 + 冒烟 13/13 + reject-code 4 码（死表 33->37）+ 14 门禁全绿
