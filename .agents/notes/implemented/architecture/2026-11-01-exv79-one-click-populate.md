# Agent Note: EXV7-9 一键播种（本仓第一处批量写面）
Status: implemented

## Problem
V7 立项的硬读数里最疼的一条是「带 `buildBlock` 的引擎 109 个 → 空世界非空产出 4 → 真实开局 14」。
那 4 个里还有几个需要至少一个人或一处地点才出内容。玩家从零开一局时必须先在面板上一格一格
点十几分钟才能得到一个「有内容的世界」——**空世界最痛的不是没机制，是没数据**。前八项（EXV7-1～8）
都是只读投影，答「世界现在怎么样」；没有一个答「怎么把世界从零点到能用」。

## Decision
新增 `engines/populate.js`，导出七口
（`getSettings / setSettings / plan / seed / view / stat / reset`）。`plan()` 纯读、只算「要几个 vs
真能写几个」；`seed()` 按「地区 → 地点 → 道路 → 人物 → 势力 → 名册 → 关系 → 目标 → 资源」九步真播，
逐笔记账。

**这是 V7 九项里唯一带写面的一项**，因此四条边界先写进文件头再写代码：

1. **只走真写口**。本仓**没有** `addPerson` 之类的写口（`grep` 零命中），人物建档的唯一写者是
   `actors/registry.js:140` 的 `ensurePerson(draft, id, name, via)`。所以引擎里那唯一一处
   `WA.store.transact` 只是把 draft **委托**给 `registry.ensurePerson` 与 `editorFaction.add`
   —— 这两口内部不开事务，嵌在别人的事务里会死锁。源码零 `draft.X =` 直写。
2. **容量现场复读 `WA.evict.siteDecls()`**。绝不写死 48 / 24 / 40 / 16 / 24 这五个数字：写死就是
   第二真源，改一处漏一处的那天会把玩家填的真人挤掉而调用方拿 `{ok:true}`。读不到上限就
   `writes-absent` 整口拒收 —— 「读不到上限 ≠ 上限无限」。
3. **满则如实拒收 `no-room`**。绝不「按要的数目硬写」让 `evict` 静默挤掉既有的人。
4. **不替作者做剧情判断**。关系型一律 `平行共存`（六型里语义承诺最弱）；职阶一律 `novice`
   （`need:0` 那一档，`chief` 要 `need:120`，凭空给就是编履历）。

## 一处必须显式讨论的边界：播种 vs「不编必填值」
`intake-dispatch` 的纪律是「不编必填值」。播种必然要落具体人名/地名，看上去正撞在枪口上。
两者的分野在**值从哪来**：`intake-dispatch` 禁的是把**推演契约里没有的值**编出来冒充推演结果
（那是伪造事实）；播种是从零造世界，落具体人/地名本来就是它要做的事。因此本模块建四张
**常量表**（`SURNAME×GIVEN` 16×12 / `REGION` 6 名 / `PLACE_SEEDS` 19 处 / `FACTION_SEEDS` 4 家 +
`PILLARS` 5 根），并要求**每一个实词都能追到表里或已落地的名字** —— 专锁逐词核对这一条。
目标句式 `在{place}站住脚` 的 `{place}` 只许取本批已建地点或既有地区名。

## 被专锁抓出的两处真缺陷（都在引擎里，不是判据问题）
1. `plan()` 的 `disabled` 备注说「这不是世界已经满了」，而 `seed()` 同一个码只说「关着（设置页可开）」
   —— 同一个码两处口径不一致。补齐（判据 D2 咬的就是这个）。
2. **满世界被报成「能播 1 处」**：地区根要占一个 `world.places` 名额，`will.places` 于是记了个 1，
   而容器其实 24/24。末尾那条「五容器全空」的守卫看见 `will.places = 1` 就放行 ⇒ `ok:true`。
   修法是在扣名额前先问「还装得下吗」，装不下直接 `no-room`。
   **这条尤其值得记**：本项存在的理由就是治「容器满了还报 ok:true」，而它在自家引擎里以另一种
   形态复发了 —— 判据要从**容器余量**出发写，不能从「计划里有没有东西」出发写。

## 契约面与记账面
- `stat` 首跑**缺席**（`export-contract` 只收敛出 6 个成员）：导出了却没人读。处置不是改账本，
  而是让诊断节先试 `WA.populate.stat()` 再回带（`view` 答此刻能不能播、`stat` 答此前播过几次；
  混在一处之后「还没播过」与「播了但没记」同形）。二跑 7/7。
- **拒收码要三面齐走**：`REJECT_FACE` 快照 + `tests/reject-v2780.js` 的可执行见证 + `disabled`
  留在 `NEUTRAL_FACE`。只补快照不补见证不够 —— 门禁认的是 `witness.expect`（trip 真跑出来的码）；
  把 `disabled` 塞进拒收面则两面相交（A9 首跑即红）。
- **O8 咬出一条过期登记**：`rand.seeded` 原登记为「无消费者的仅程序化接口」，而 `populate.seedInfo()`
  读它决定 `reproducible` ⇒ 已有真调用方，登记变 `stale-entry`。处置是**摘掉登记**而不是补理由
  ——「登记不是豁免」这条判据正是为此存在。

## Consequences
- 空世界实测：`{people:0,places:0,roads:0,factions:0,bonds:0}` → `seed()` 60 笔写入零拒笔 →
  `{people:8,places:7,roads:5,factions:2,bonds:14}`（7 处地点 = 1 个地区根 + 6 处子地点）。
- 已知上限（如实记，不当缺陷修）：`plan()` 会消耗随机序列（它现场抽一份给你看），这是随机源的
  正常行为，已在文件头与 `reproducible` 说破；`REGION` 只有 6 个名字，全占时如实拒收而不编第七个。
- 未做：不做「按名字模板生成势力履历」「按剧情生成关系强度」——那些是替作者做判断。
## Alternatives considered
- **Direct writes to `draft.X` containers from the UI handler**: rejected — every write must go
  through the owning engine's public API (`registry.ensurePerson` / `editorFaction.add`), otherwise
  the write-contract becomes decorative and the reject-recovery layer never sees the笔. The
  nine-step真写 path exists precisely so one button cannot bypass per-engine guards.
- **Accept `seed()` on a full world with a partial report**: rejected — "容器满还报 ok:true" is
  the exact failure mode EXV7-9 was created to kill (see the v2.289.0 postmortem above). Hence
  the region-root slot guard in `plan()` and the `no-room` reject code: a full world must be
  reported as a refusal, never as a success with fewer writes.
- **Registering `rand.seeded` as an accepted no-consumer export** in the O8 ledger: rejected —
  the consumer exists (`populate.seedInfo()` reads it for `reproducible`), so the correct fix was
  to delete the stale registration, not to bless the ledger entry. "登记不是豁免".
