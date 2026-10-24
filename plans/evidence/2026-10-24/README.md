# 2026-10-24 规划证据与交付检查

对应 [现场基线与排程](../../WORLD_PLAY_BASELINE_2026-10-24.md)。代码调查基线为 `319356e0cb8e5f2d869819780d0b87f580698342`；这些附件不是当前产品质量的永久断言。

## 附件

- [behavior-probes.cjs](behavior-probes.cjs)：五组补充业务观察，可在仓库任意工作目录启动，不需要安装依赖。仅可选第二参数指定新 JSON 输出位置；默认只输出日志，不覆盖旧证据。
- [observed-baseline.json](observed-baseline.json)：初次调查的原始结果；`observed` 表示缺口被复现，不是功能验收成功。
- [note-tree-baseline.txt](note-tree-baseline.txt)、[note-format-baseline.txt](note-format-baseline.txt)：改新文档前的既有笔记失败。没有在本轮批量修改它们。

## 本次收口检查（2026-10-24）

1. **六专项复跑**：35/0、38/0、20/0、21/0、26/0、32/0，合计 172/0；六个独立进程退出码均为 0。完整命令与局限见现场基线，不把无头通过解释为宿主通过。
2. **五组观察复跑**：脚本语法检查通过；五组均 observed，进程退出码 0。没有修改实现来消除这些缺口。
3. **文档结构**：WP-1～9、WX-1～9 连续唯一，共十八项；每项均有工作包、玩家路径、结项下限、依赖/边界/估算；E01～E18 证据锚点完整。
4. **预算核对**：逐项提取工时，WP 94–140、WX 120–182，合计 214–322；A 84–126、B 66–98、C 64–98，加和一致。WP-9 分两包但只计一次。
5. **文件与链接**：新文件及历史文件新增行中的相对文件链接/锚点全部有效；无截断标记或新增乱码；新文档为 UTF-8；历史 NEXT_PLAN 原文完整保留，ITERATION_LOG 原字节未重编码。
6. **笔记技能校验**：原 tree/format 脚本各退出 1；修改前后错误日志逐字节一致，未新增错误，新笔记无格式报错。**全树未全绿**。
7. **范围与敏感内容**：改动仅计划、历史入口标识、决策关联、日志与证据附件；产品目录、原测试、工具、index/manifest/style 与调查基线无差异；新增文本未检出凭据形态。

尚未运行全量回归、真实宿主或手机验收；十八项功能尚未实施。提交与远端上传结果在实际执行后另行报告，不在这里预写成功。

## 复算方法

从仓库根运行：

```sh
node --check plans/evidence/2026-10-24/behavior-probes.cjs
node plans/evidence/2026-10-24/behavior-probes.cjs /tmp/wa-plan-probes-new.json
```

笔记校验使用本机已安装的 write-notes-like-deepseek 脚本（不是本仓依赖）：

```sh
node /sdcard/Download/Operit/skills/write-notes-like-deepseek/scripts/verify-agent-note-tree.ts
node /sdcard/Download/Operit/skills/write-notes-like-deepseek/scripts/verify-agent-note-format.ts
```

文档检查使用仓库外一次性校验，不引入新守卫框架：读取两份计划的二级标题确认编号，按下一二级标题划定每项边界，提取单项估算求和，逐个解析新增 Markdown 链接与显式锚点，再用 Git 比较产品目录和历史字节。修改后的文件另以 `git diff --check` / `git diff --cached --check` 检查空白错误。
