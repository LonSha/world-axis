# WorldAxis 幽灵引用治理 · 收尾报告（v2.381.0）

> 范围：`/home/user/wa_opt1`（SillyTavern 扩展，LOAD_ORDER 440 条、`window.WorldAxis` 顶层 456 命名空间、
> `WA.engines` 下 44 引擎、全仓 1130 个 `.js`）。
> 目标：把「调用了不存在的成员」这类**完全静默**的缺陷找出来、修掉、并固化成会一直红下去的门禁。

---

## 一、为什么不靠肉眼看

这类缺陷的杀相是三重静默：

1. **语法合法** —— `node --check` 全过；
2. **既有测试全绿** —— 测试里自己塞了桩，桩上有那个成员就测得过；
3. **运行不报错** —— 调用点普遍写成 `WA.x.foo && typeof WA.x.foo === 'function'`，成员不存在 ⇒ 判定恒假 ⇒ 整条分支**从未执行**。

所以判据只能有一个：**按 LOAD_ORDER 真的把 440 个模块装载起来，取 `Object.keys()` 当唯一真源**，
再拿它去核全仓每一处 `WA.<ns>.<member>` 读引用。正则解析源码下结论是不算数的。

## 二、修了什么（全部产品侧，均已行为级验证）

### 1. `ui/panel.js`「四大空间物理引擎」四按钮（8 个幽灵引用 → 0）

原按钮回调调用的成员在对应引擎上**一个都不存在**，四个按钮点了只会静默无反应。

| 按钮 | 原（幽灵） | 现（真源） |
|---|---|---|
| 拓扑推演 | `buildTopologyFeed` / `currentIntensity` 等 | `getState()` + `registerNode/importNodes/connect` + `canTraverse` + `getHierarchy` |
| 通勤调度 | `planRoute`（不存在） | `planCommute(distanceKm, currentHour, envMod)` → `.options.foot/transit/direct`；`arbitrateStranded(name, {...})` |
| 声学遮蔽 | 读 `.clarityLabel`（返回体里没有此字段） | `canSee(observerLoc, targetLoc)` + `auditAcoustic(type, src, listener, {...})`，输出用 `.desc` |
| 痕迹调查 | `buildTraceFeed` | `getState()` + `leaveTrace(nodeId, type, {...})` + `inspectTraces(nodeId, hour)`（`currentStrength` 0–1 即百分比） |

验证方式：`tests/` 内的运行时校验器真装载 4 引擎，从 panel.js 用括号配平状态机**提取每个按钮的回调体**，
`vm.compile` 后真执行，断言输出非空且不含 `undefined`/`NaN`/`[object Object]`。
四个按钮实测分别产出 372 / 538 / 591 / 481 字符的真实引擎文本（含「门禁锁止·portal_locked·需钥匙:vip_key_01」
「雨天徒步 52分钟 体力消耗 37」「深夜电车 [停运拦截·out_of_service]」这类真值）。

> 教训：首次验证红，是因为测试装置误用 `global.WA`——引擎注册在 `global.WorldAxis`。
> **宿主根是 `WorldAxis`，`WA` 只是模块内的别名**，这一点在测试夹具里同样成立。

### 2. `metabolismClock.accumulateFatigue`（3 处调用，成员从未存在）

`cascade-bus`（昼夜疲劳）、`environmental-hazard`（危害暴露疲劳）、`spatial-conflict`（搏斗体力消耗）
都按 `(characterId, points, reason)` 调用，是真缺口。补齐后经真机验证：
`20→40(weary)→+60→100(exhausted)→clamp→100→-30→70`，空 id / NaN 安全拒收。

### 3. 第七批：11 补丁 / 9 文件（A 改写 5 组、B 删死枝 6 组、C 自引用 2 处）

| 文件 | 原 | 现 |
|---|---|---|
| `action-cost-feedback` | `difficulty.costMultiplier` | `difficulty.effective().cost`（easy 0.5 / normal 1 / hard 2） |
| `motive-arbitration` | `survival.rowOf` | `survival.read(id).stamina.value`（`statusOf` 是布尔收口、`rowOf` 未导出） |
| `tactical-combat` | `personalInventory.view` | `getInventory(actorId)` → `{cash, pockets, bag}` |
| `cascade-bus` | `getProfile` / `healTrauma` | `getActorPsyche(id)` + `soothePsyche(id, power, method)` |
| `financial-contagion` | `events.emit`（无此原语） | `events.schedule` 一次 once 事件 |
| `action-desk` | `weather.advance`（死枝） | 直走 `WA.world.advance(minutes)` |
| `stage-presence` | 读 `WA.stagePresence.__customSettings`（该函数定义在注册行之前，恒 undefined） | 模块闭包 `_customSettings` + `defineProperty` 读写同源 |
| `spatial-topology` | 缺 `setTransitLock`（灾难疏散靠它封锁灾区） | 补 `setTransitLock(nodeId, locked, reason)`：压 `prevStatus`、幂等、解封逐条还原原状态 |
| `inject-collector` | 两段恒不可达的 else-if 回退 | 收掉 |

**如实记录的待决项**：`tactical-combat` 修复后 `inv` 从恒 `null` 变成**真实行囊数据对象**，但该对象上
仍无 `consumeItem` ⇒「战斗耗材自动消耗」这一子联动**依旧关闭**（引擎缺消耗 API）。这属于引擎能力缺口，
不是引用错误，不假装已修。

## 三、结果：产品侧越界归零

- LOAD_ORDER 440 装载 440 成功；核对全仓 **24021 处** `WA.<ns>.<member>` 读引用。
- **产品代码（`engines/` `ui/` `core/`）：13 种 / 27 处 → 0 种 / 0 处。**
- 剩余 **31 种 / 47 处**全在 `tests/` 与 `tools/`，经三重定性：
  - 32 处是**带守卫的合法探测**（`?` / `&&` / `typeof`），如 `WA.affect.set ? … : 'no set'`；
  - 8 处是**负向断言或字面量**（专测「成员不存在」、禁用键数组里的字符串、测试直接写对象）；
  - **1 处真裸调用** → 本轮已修：`tools/v7probes/p_count_audit.js:41` 的 `WA.driverLedger.build()`。
    `build` 是模块内私有函数，从未挂到命名空间（真源导出面只有 `getSettings/setSettings/view/why/summaryText/stat`）。
    后果不是"读数不准"，而是**整个探针从该行起一行都跑不到**（直接 TypeError）——
    也就是说这份探针此前的"分层核对结论"没有一次是真算出来的。改用 `view()` 后实测
    `total=127`、`counts 合计 = 127 ✓ 平`、`名单合计 = 127 ✓`。
    同时补了 `maxList` 截断的显式提示：**名单被截断 ≠ 归属不符**，不允许把前者读成后者。

## 四、四道常驻门禁（`node tests/gates.js`，约 5 秒全绿）

| 门禁 | 守什么 | 当前 |
|---|---|---|
| `settings-bus-api-gate.js` | `settingsBus` 34 成员接口面 + 全仓调用 | ✓ |
| `engines-ns-gate.js` | `WA.engines.<name>` 双层注册缺口 | ✓ |
| `member-surface-gate.js` | 全仓成员级（LOAD_ORDER 真装载 → `Object.keys` → 词法剥离 → 只认全限定形态） | ✓ |
| `linkage-verify.js` | 8 条「原本静默失效的联动现在真的动了」 | ✓ |

`linkage-verify.js` 存在的理由：**「没报错」不等于「生效」**。它给每条修复提供物理证据，例如
`soothePsyche` 使 `traumaLevel 60 → 59.3`；`setTransitLock` 封锁后 `canTraverse` 返回 `portal_sealed`，
解封后该门**还原为 `portal_locked`（需钥匙）而不是误放行 `open`**，持钥匙 `k1` 可通行。

### 门禁的可信度靠负向自检背书

每个门禁都必须经过「注入违规 → 必红 → 还原 → 必绿」才算数。本轮修 `engines-ns-gate` 时正是这样发现的：
它**不剥注释**，把 `tests/gates.js` 注释里的 `WA.engines.*` 当成了真实引用。已补上与
`member-surface-gate` 同口径的 `strip()`（注释/字符串/模板串置空、**保留换行**⇒行号仍对齐），
并新增 `tests/gate-selftests/engines-ns-strip-selftest.sh` 三段自检：

- 注释形态 → 必须**仍绿**（证明剥离了注释）；
- 同一段落改成真实读引用 → 必须**变红且点名 `ghostEngine`**（证明没把代码一起吞掉）；
- 还原 → 必须复绿。

第二段不可省：只有「红过」才能排除「门禁干脆什么都没扫」这种稳定绿的假通过。

> 该自检首版按 JSON 解析 stdout ⇒ `UNPARSED`，因为本门禁在 `--json` 下仍先打装载日志。
> 这是**测试装置的错**，改用退出码判定（退出码才是真信号）。

## 五、零回归证据链

1. **定向回归 9/9**（真实退出码判定）：exp14-motive-arbitration、motive-preview-regression、
   scenario-v26/32/38/48、test-inventory-metabolism、scenario-v14-grand-cascade、scenario-v31。全 `exit 0`。
2. **80 个测试快速扫出的失败，逐项证明是既有**：把改动备份还原成改动前版本重跑同一批，
   **9 个照样全败**；再逐一对比前后失败计数，全部 `SAME`（act-b1 1/1、capability-ui 9/9、
   day-route-ui 13/13、evict-meta 3/3、contract-scan 1/1、anchor-2126 1/1、anchor-2133 1/1、exp10 1/1）。
3. 本轮另外**修掉了两个既有失败**（不是绕过）：
   - `exp10-action-desk-v2232` 的 `Object.keys(W.actionDesk).length === 14`：
     V21 给 actionDesk 加了 6 个成员，引擎真源自带 `EXPORT_COUNT = 16` 自校验 ⇒ 该断言**从此恒假**，
     它红的原因不是「API 没装载」而是「数字过期」。已改为逐项点名成员类型 + 与引擎 `EXPORT_COUNT` 对齐的
     枚举面断言。实测 `36 / 失败 0`。**没有放宽**：改为验「本测试要用到的成员都在且类型对」。
   - `probe_v21.js` 的 `WA.settingsBus = { get, set }`：这两个成员在 34 成员真源里**都不存在**，
     而 8 个 V21 引擎用的是 `read(__REG)` ⇒ 桩导致每个引擎 `settings()` 直接抛，探针读到的全是残缺结果。
     已换成同签名桩（`read` 直接返回配置值而非 `{ok,value}`；`saveOrThrow` 无 key 必抛）。
     换后 8 引擎全部 `LOADED`、`buildBlock` 空态返回空串、无参操作口按 `ok:false + refusal` 收口。

## 六、已知边界（如实声明，不掩盖）

1. **`member-surface-gate` 会跳过未装载命名空间**：注入「虚构命名空间 + 虚构成员」**不会**触发。
   这是设计使然（无法与宿主注入区分），不是漏检。当前如实打印 15 个此类命名空间。
   故其负向自检必须用「**真实命名空间 + 虚构成员**」。
2. `member-surface-gate` 的 `isProd` 只认 `^(engines|ui|core)/`；`tests/`、`tools/` 侧默认告警，
   `--strict` 才判红（那 31 种属存量性质，不宜让它们卡住产品侧门禁）。
3. 全量回归锁的语义要看清：`tests/run.js` 用 `isolated-runner` 在候选树里跑。
   本次三次"锁不可用"的**真因不是锁损坏**，而是 `nohup` 启动的父进程随会话被杀 ⇒
   子 worker 检测到 `parent-gone` 后按设计自杀（现场留下 `orphan.json`）。
   改用 `setsid` 脱离会话进程组后一次成功。这条值得记：**长跑任务要 setsid，不是 nohup**。
4. `engines-ns-gate` 的剥离是本轮新增；`settings-bus-api-gate` 是否也需要同等剥离尚未核。
5. DOM 类既有失败（`capability-ui` 8/61、`day-route-ui` 13 处等）属历史欠账，不在本任务范围。

## 七、操作备忘（环境约束）

- `create_file` 直接写 `/home/user` 会失败 ⇒ 一律写 `/sdcard` 再 `cp` 进仓；`create_file` 需 `new` 参数。
- 终端 heredoc 会拆坏多行中文 ⇒ 复杂逻辑写成脚本文件再跑。
- bash 双引号内 `!` 触发 history expansion ⇒ 含 `!` 的逻辑不要内联。
- 引擎装载会刷 `[WorldAxis] ... 已加载` ⇒ 统一 `grep -v '^\[WorldAxis\]'` 过滤。
- 大批量跑测试会撞前台超时 ⇒ `setsid ... &` + 轮询，判据用**退出码**而非文本。

---

## 八、给下一个人的第一件事

```bash
cd /home/user/wa_opt1
node tests/gates.js            # 四道门禁，约 5 秒；红了先看它点名哪个文件哪一行
bash tests/gate-selftests/engines-ns-strip-selftest.sh   # 门禁自身是否还可信
```

加新引擎时，两条一起做：**注册要双层**（`WA.x` 与 `WA.engines.x`），**设置键要登记进 `__settingsRegs`**。
本轮 `court-intrigue` 正是全仓唯一漏登记项——而这类漏项不会报错，只会让 `ghostScan` /
`applyDefaults` / `verifyDefaults` 全部对它视而不见。
