# 注释指路面裁决（PTH-1）

> 版本：v2.609.0（R284）
> 锁：`tests/path-face-v2609.js`（24 条判据）
> 复算：`node tests/path-face-v2609.js`

## 一、结论先行

注释里写一个路径，读者就该能找得到那个文件。全库量过之后只有 **4 处指不出去**，其中
**3 处是错名**（改真名即可）、**1 处是历史引用**（补「已删除」标记即可）。

| 事实 | 数量 |
| --- | --- |
| 产品面注释里带目录前缀的路径引用 | **1652** |
| 其中指向真文件 | 1637 |
| 指向**上游项目**（nekotools / st-beat-tracker / pilulier / CanonEngine …） | 12 |
| 占位示例（`engines/xxx.js`） | 1 |
| 历史引用（已删除 / 从未存在） | 2 |
| **指向一个本该存在的本仓文件却找不到** | **0**（本轮改出来的） |

一句话：**这一面几乎全是干净的 —— 而这正是值得记一笔的地方：干净是有理由的，理由要写下来。**

## 二、四处改动

表内行号是 R284 的历史位置。B2 以源文件和完整目标路径定位注释：同一文件中必须恰有一处引用，再核对其分类。把行号从 890 改成 897 只能修好这一次漂移；在全仓找同名引用又会让别处的注释掩盖原处缺失。

| 位置 | 原文 | 真名 / 处理 | 依据 |
| --- | --- | --- | --- |
| `core/clock.js:48` | 「回放台（`core/replay.js`）」 | `core/rand.js` 的 `replay()`；跨会话先经 `engines/tape-store.js` 取卷 | `core/rand.js:488 function replay` / `:772 replay: replay`；`engines/tape-store.js` 边界 3 明写「回放仍走 rand.replay，本模块只是仓库」 |
| `engines/reject-recovery-tables.js:890` | 「`engines/continuation.js` 等续接面」 | `engines/player-archive.js` | 18 个续接拒收码的发射方（`bad-continuation-pack` / `stale-continuation` / `archive-tail-unavailable` 都在 player-archive） |
| `engines/inspector-state.js:5` | 「与 `engines/inspector.js` 的区别」 | 「与 `engines/inject-inspector.js` 的区别」 | 该模块 v2.20.0 已删除，职责由 inject-inspector 承接（`index.js:2260-2266` 原文记着这件事） |
| `index.js:2261` | 「`engines/inspector.js`（`WA.inspector`）」 | 补「v2.20.0 已删除」 | 同一段的 2266 行才说到删除，读者读到 2261 会先去找文件 |

四处全部是注释行内的改动，**零行代码**。

## 三、为什么 12 条上游引用不算缺口

`缝合来源：nekotools core/worldindex.js::buildBriefs（39-94 行）` 这类句子里的 `core/worldindex.js`
**不是本仓的路径**，是上游项目的路径。把它当成本仓缺口去「修」，下一步就会有人去建一个空文件，
或者把注释改成 `core/mixed-index.js` —— 那才是真正的错。

R282 在这件事上定的口径是「借名必须写主体」；本面把它变成判据（B3）：**上游引用只要带项目名就合格，
而且要逐条复算它还在原位、还带着那个项目名。** 12 条全部通过 —— 也就是说，本仓的缝合注释一直守这个约。

## 四、这一面不做什么

1 **不改上游项目的任何东西**，也不把它们的文件拷进来（拷贝会把「引用」变成「分叉」，两份必然漂）。
2 **不删历史引用**：「当时那个文件存在」是事实，删掉句子等于抹掉事实；要补的是「后来删了」。
3 **不把裸文件名纳入**（`rand.js`）：它既可能指本仓也可能指上游，判不出就不报 —— 宁可窄。

## 五、门禁这轮做了什么

`tests/path-face-v2609.js`（24 条）：

- **A 扫描面**：产品文件 ≥ 600 且与 `product-files.js` 同真源；引用 ≥ 1200（防零命中恒真）；在位 ≥ 1500（防「靠找不到吃饭」）。
- **B 归类与台账**：`BASE_STALE` 为空 ⇔ 现场 0 条（两向）；**B2 四处校正逐个复算**（要么指向真文件、要么带历史标记）；
  **B3 12 条上游引用逐条在位且带主体词**；B4 占位 1 条；B5 历史 2 条。
- **C 自证**：合成缺失必报（C1）/ 上游不报（C2）/ 占位不报（C3）/ 历史不报（C4）/ 正文不报（C5）/ 存在不报（C6）/ 裸文件名不报（C7）；行号移动允许、换文件或缺失必报（C8）；重复引用或丢失历史分类必报（C9）。
- **D 零写**：四处文件哈希前后一致；不写盘、不起子进程；**D3 裁决文档在位**（三处真名 + 复算命令）。
- **E 读数**：`指路面：引用 1652 · 在位 1637 · 上游 12 · 占位 1 · 历史 2 · 缺失 0`。
- **F 口径边界**：目录前缀只收仓内五个目录 + `tools/plans/docs`（F1）；`BASE` 为空、四处无重复（F2）。

## 六、复算命令

```bash
# 1. 现场读数（应当：缺失 0）
node tests/path-face-v2609.js

# 2. 三处真名各自存在
test -f core/rand.js && test -f engines/player-archive.js && test -f engines/inject-inspector.js && echo names-ok

# 3. 回放确实在 rand（不是在新造的文件里）
grep -n 'function replay' core/rand.js

# 4. 18 个续接码的发射方确实在 player-archive
grep -c "continuation\|archive-tail" engines/player-archive.js
```

## 七、与邻座的关系

| 面 | 管什么 | 与本面的分界 |
| --- | --- | --- |
| `promise-face-v2605`（GNS） | 注释点名的**函数名**在代码面零出现 | 那边管「名字有没有实现」，本面管「路径走不走得到」 |
| `default-face-v2608`（DFC） | 注释声明的**默认值**与 `DEF.enabled` 相反 | 那边管数值，本面管指向 |
| `orphan-engine-adjudication` | 引擎**接线** | 接线与指路正交：一个路指错的文件可以接得好好的 |

## 八、改判记录

| 版本 | 改了什么 | 触发原因 |
| --- | --- | --- |
| v2.609.0（R284 PTH-1） | 首次成面：1652 处引用里 4 处指不出去，3 处改真名 + 1 处补「已删除」；12 条上游引用升为判据 | 上一轮把「文档落后于实现」追到默认值，本轮追到**指路**：读者按注释去找文件，找不到时不会怀疑注释 |
