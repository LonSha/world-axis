# WA284-A1 子agent审查记录

状态：已完成首轮API委派与主agent审阅；尚未实施，不属于版本交付。
模型：接口目录 deepseek-v4.1-flash；响应模型 deepseek/deepseek-v4.1-flash。
任务：回归隔离设计审查；只传工程摘要，未传凭据或完整仓库。
调用结果：HTTP 200，finish_reason=stop。此前调用存在HTTP 500，不能据此认定稳定可用。
本次成功审查响应usage：prompt_tokens=130，completion_tokens=994，total_tokens=1124（包含reasoning_tokens=843）。不代表全部尝试的账单。

## 子agent建议摘要
- 用git archive HEAD导出基线，避免复制.git/config与共享可写Git目录。
- 独立临时目录、进程组、超时及信号清理；强杀遗留由后续清扫。
- 工作区副本无法解决同进程global、require.cache、单例泄漏，需另行隔离。

## 主agent审查：不能照搬的缺口
1. git archive不带.git；直接在副本执行旧锁git show HEAD:file会失败。必须构造独立Git对象基线，或显式改造旧锁的基线入口并保留独立验证；不可悄悄回到原仓库。
2. 只导出HEAD会漏掉本轮未提交代码。应将历史HEAD基线与当前待测工作区分别采集，后者作为实际测试内容。
3. 不接受单靠时间/属主删除临时目录：还需任务标识、进程存活/身份核验，防误删仍在运行的任务。
4. SIGKILL无法执行finally或trap；隔离保证主树不变，不代表清理一定完成。
5. 目录副本不是安全沙箱，不能执行未经审核的子agent代码；补丁需人工审查、语法校验及正反门禁后才运行。

后续分工：子agent提交方案、受限文件补丁与测试候选；主agent负责完整相关源码读取、冲突裁决、应用补丁、回归、实机验收、提交推送。密钥不写入任务文件、日志或Git。