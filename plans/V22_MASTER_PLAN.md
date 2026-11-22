# WorldAxis V22 总纲领：天文时序、驿传律法与生命礼俗大系

> 共 18 项：OPV22-1～9（优化）+ EXV22-1～9（拓展）
> 根目录 `/home/user/wa_opt1`
> 前序基准：commit `ef184d5`
> 基线 `v2.380.0` / 391 引擎 / 534 测试
> 目标 `v2.400.0` / 401+ 引擎 / 544+ 测试 / 场景 56～61

---

## 零、立项依据（全部现场实测）

每条缺口都有可复算命令。指不到下表的条目不进计划。

| 编号 | 缺口（实测读数） | 复算 | 归属 |
| :--- | :--- | :--- | :--- |
| G1 | **总线声明 6 层、只实现 4 层**。`LAYERS` 含 tactical/epochal，但 `dispatchTick()` 只有 Layer 1～4，`dispatchEvent` 只调 4 次。订阅后两层的监听者收不到 tick | `grep -n "── Layer" engines/cascade-bus.js` | OPV22-1 |
| G2 | **ActionDesk 702 条路由只覆盖 106/391 引擎**（27.1%）。V21 纲领声称 100% 全覆盖 | 附录 A | OPV22-2 |
| G3 | **7 个功能域零覆盖**（含中文近义词）：天文 0、丧葬 0、服饰 0、婚约 1、舆图 0、徭役 1、驿传 1 | 附录 B | EXV22-1～7 |
| G4 | **q9-evidence-ledger 3 条红**：B9b counts 不符 / C6 stale 11 条 / C6b 未登记 3 条。根因：上轮改源码后未重建账本 | `node tests/q9-evidence-ledger-v2226.js` | OPV22-9 |
| G5 | **opt8-lexicon C2 红**（economy 出口面契约四段不一致），同源欠账 | `node tests/opt8-lexicon-v2231.js` | OPV22-9 |
| G6 | **module-cycle-gate 报 35 个零读 ns**（archiveHide/binding/compactTiming/fieldWriters/followupGate/lensCulling/purifyScope/weightedDraw/writeGate …） | `node tests/module-cycle-gate.js` | OPV22-3 |
| G7 | **超长文件**：tests/run.js 25995 行 / ui/panel.js 17420 行 / tests/reject-v2780.js 8599 行 / engines/tool-diag.js 8127 行 | `wc -l` | OPV22-4 |
| G8 | **docs/gates.md 读数表停在 v2.134.0**（当前 2.380.0）：dead 751 实测已 1440、产品文件 162 实测 426 —— 人读面成了过期副本 | 对比 dead-export-gate | OPV22-8 |

---

## 一、优化提升线（OPV22-1 ～ OPV22-9）

| 编号 | 机制名称 | 落盘模块 | 治哪个缺口 / 现场断言 |
| :--- | :--- | :--- | :--- |
| **OPV22-1** | 总线六层全实现：补 tactical 与 epochal 两个 tick 段，消除声明-实现漂移 | `engines/cascade-bus.js` | **G1**。判据：dispatchEvent 调用点 === LAYERS.length === 6；report 键集与 LAYERS 逐字相同；grep Layer 恰 6 行。负控制：删任一层段 ⇒ 判据点名缺哪层 |
| **OPV22-2** | ActionDesk 路由覆盖治理：106 → ≥200，并把「有路由」变成可复算读数 | `engines/action-desk.js` + `tools/desk-coverage.js`（新） | **G2**。不承诺 100%（285 个里大量是纯读面，本就不该有写路由）。改三档读数 routable / readonly-only / orphan，恒等式成立。负控制：把有 transact 的引擎挪进 readonly-only ⇒ 报警 |
| **OPV22-3** | 零读 ns 消解：35 个「导出了无人读」逐条定性 wired / readonly-api / stale | `tests/module-cycle-gate.js` + `tests/ns-consumer-ledger.json`（新） | **G6**。不许改判据放行。有点就销账，没点就补消费点或标 readonly-api 并写清为何只有程序化消费者 |
| **OPV22-4** | 巨型文件拆分：tests/run.js 与 ui/panel.js 各抽可独跑段落 | `tests/segments/*.js` + `ui/pages/*.js` | **G7**。硬约束：不改变任何一条判据语义。拆前判据数 === 拆后判据数，且每条仍在跑。负控制：故意漏挂一段 ⇒ test-surface-gate 报孤儿 |
| **OPV22-5** | 总线拓扑图：把六层实际执行路径做成可断言静态图 | `tools/bus-topology.js`（新） | **G1/G2 通用护栏**。现在「总线铺了哪些引擎」只能人读 800 行。改抽 WA.X 读点，输出「层→引擎→调用口」三列图。只报不改，不做门禁 |
| **OPV22-6** | REJECT_FACE 与现场自动对账：把「人记得同步」换成「跑一次就知」 | `tools/reject-recovery.js` | 该形态已是本仓**第八次**复发（v2.203/209/221/222/231/全量体检/v2.380/上轮）。已有 audit() 现场复算，缺的是让它成默认动作：加 --watch 输出「快照 1538 / 现场 1538 / 差额 0」，并挂进 tools/smoke.js 快档 |
| **OPV22-7** | 设置面总账：__settingsRegs 全量对齐与默认值审计 | `core/settings-bus.js` + `tools/settings-audit.js`（新） | 391 个引擎各自 concat([__REG])，**没有读口回答「一共几个设置面、几个默认开启」**。既有教训：externalReads 是进程级累计计数、enabled:false 是出厂默认 —— 这类默认值必须有账 |
| **OPV22-8** | docs/gates.md 读数表从手写快照改为现场生成 | `tools/gen-gates-doc.js`（新） | **G8**。表停在 2.134.0 而实测已翻倍，属本仓反复治过的第二真源病。改为跑门禁回填读数，留 --check 判过期 |
| **OPV22-9** | 清偿上轮自留的 4 条红灯（证据账本 3 + 出口契约 1） | `tests/evidence-ledger.json` + `tests/reject-code-ledger.json` | **G4/G5**。根因：上轮改了 tools/anchor-scan.js、tests/run.js、engines/reject-recovery.js、两个 anchor-scan-* 测试后没重建账本。修法：重建 + 复核 sha，**不改判据** |

---

## 二、拓展创新线（EXV22-1 ～ EXV22-9）

全部落在 G3 实测的零覆盖域。共同边界：**不编必填值** —— 推演契约里没有的值，不许编出来冒充推演结果。

| 编号 | 机制名称 | 落盘模块 | 现场缺口与设计边界 |
| :--- | :--- | :--- | :--- |
| **EXV22-1** | 天文星象、历法误差与农时预兆引擎 | `engines/celestial-omens.js` | 天文词 **0 命中**。补「星图→历法漂移→农时误判→饥荒压力」链，让「闰错一个月」变成真实后果而非背景描述。写口：celestialOmens.observeSky / sky.observeSky |
| **EXV22-2** | 驿传网络、驿马接力与军情时延引擎 | `engines/postal-relay.js` | 「驿站/驿马」**1 命中**（仅注释）。现有 courier-dispatch 只有发-收二元，无中继节点、换马耗时、驿路断毁。军情延误必须有拓扑解释。写口：postalRelay.dispatchByRelay / relay.dispatchByRelay |
| **EXV22-3** | 税制徭役、征发额度与逃户流亡引擎 | `engines/levy-corvee.js` | 「徭役/税率」**1 命中**（仅 taxRate 一词）。economy 只有价格与订单，无单向征发。超额征发→逃户→户籍流失，才解释得了「国库越收越穷」。写口：levyCorvee.levySeason / levy.levySeason |
| **EXV22-4** | 丧葬儀式、服丧期与遗产清算引擎 | `engines/mortuary-rites.js` | 「丧葬/儀式」**0 命中**。family.inherit 只分财产，不处理服丧期禁令（不得婚娶/赴宴/上任）。链断了死亡就没有社会成本。写口：mortuaryRites.holdFuneral / rite.holdFuneral |
| **EXV22-5** | 服饰规制、僭越与身份识别引擎 | `engines/sartorial-regalia.js` | 「服饰/礼服」**2 命中**，仅是 rules.js 一句禁令与 stealth-infiltration 的伪装加成。缺制度性穿着：僭越穿龙纹可被定罪，伪装官差可骗过城门。写口：sartorialRegalia.attireAs / attire.attireAs |
| **EXV22-6** | 婚约聘娶、妆匛与门第联姻引擎 | `engines/betrothal-alliance.js` | 「婚约/聘礼」**1 命中**（elsewhere.js 状态枚举 betroth）。缺谈判过程：门第差、妆匛议价、悔婚代价、联姻的势力绑定。写口：betrothalAlliance.proposeMatch / match.proposeMatch |
| **EXV22-7** | 舆图测绘、疆域精度与迷雾认知引擎 | `engines/cartography-survey.js` | 「舆图/测绘」**2 命中**，都是 playable-blueprint 里的职业名 cartographer。缺精度分层：谁画的图、误差多大、哪些标注是猜的——直接决定行军与商队会不会走错路。写口：cartographySurvey.chartRegion / map.chartRegion |
| **EXV22-8** | 方言隔阂、译语掮客与误译后果引擎 | `engines/lingua-broker.js` | 「方言/译语」**0 命中**（interpretation 那 9 次是别处词义）。缺沟通成本：跨方言谈判必须有误译概率，误译要能产生真实外交后果。写口：linguaBroker.converse / tongue.converse |
| **EXV22-9** | V22 全景控制中心与六层总线可视化 | `ui/panel.js`（V22 扩展） | 八项新机制读数同屏可读：星象漂移、驿传时延、征发额度、服丧禁令、僭越风险、联姻绑定、地图精度、误译概率。原生折叠仪表，不引新依赖。写口：panel.renderV22OmensHub / #wa-omens-hub-v22 |

---

## 三、贯通场景专锁矩阵（场景 56～61）

1. **场景 56：星象误判→农时错乱→征发超额→逃户成潮** (`tests/scenario-v56-omens-harvest-levy.js`)
   - 历法漂移 → celestialOmens 报预兆失真 → 农时错判减产 → levyCorvee 超额征发 → 逃户率上升。四级因果链闭合，逐级可归因。
2. **场景 57：驿路断毁→军情延误→战机错失** (`tests/scenario-v57-relay-delay-battle.js`)
   - postalRelay 中继断点 → 时延叠加 → regimentTactics 收到过期情报 → 阵形错配。**延误不得静默变成「没发生」**。
3. **场景 58：僭越服饰→门禁盘查→身份败露** (`tests/scenario-v58-regalia-checkpoint.js`)
   - 穿着越制 → 城门盘查 → identity-match 比对失败 → 通缉升级。
4. **场景 59：联姻谈判→妆匛议价→悔婚反噬** (`tests/scenario-v59-betrothal-dowry-feud.js`)
   - 门第门槛、妆匛议价区间、悔婚代价与势力关系断裂。
5. **场景 60：地图误差→行军错位→地形伏击** (`tests/scenario-v60-cartography-ambush.js`)
   - 精度分层 → 行军落点偏差 → terrainHazard 伏击判定。
6. **场景 61：V22 跨域大融合专锁** (`tests/scenario-v61-v22-grand-convergence.js`)
   - 误译致盟约破裂 → 悔婚 → 服丧期禁令冲突 → 征发激化逃户 → 驿路被断 → 星象被用来造谣 → 舆图失真致援军走错 → 全景中心读数与真值逐项一致。

---

## 四、验收纪律（六条，不许例外）

1. **每项必须有专锁，且带真源码破坏负控制**：改坏产品源码 ⇒ 判据现形；原版同判据仍真。只有正向断言的锁不计完成。
2. **新导出必须有真实生产消费点**，否则进 dead-export-ledger.json 受控核减。**禁止改账本销账**。
3. **新拒收码三面齐走**：REJECT_FACE 快照 + tests/reject-v2780.js 可执行见证 + docs/ERROR_CODES.md 重新生成。缺一面即红。
4. **版本面统一**：index.js / manifest.json / 五本账 / s3-* 白名单全部跟上 2.400.0，version-surface-gate 必须绿。
5. **账本随改动重建**，并在 ITERATION_LOG.md 逐条写读数。
6. **全量回归只在双计划收口后跑一次**（本仓纪律 12）。中途以定向专锁为唯一尺度。

---

## 五、交付批次

| 批次 | 内容 | 交付物 |
| :--- | :--- | :--- |
| 第 1 批（先清偿） | OPV22-9 | 4 条红灯归零，账本重建 |
| 第 2 批（骨架） | OPV22-1 / 5 / 6 / 8 | 六层总线补齐 + 拓扑图 + 快照对账 + 文档生成 |
| 第 3 批（治理） | OPV22-2 / 3 / 7 / 4 | 路由分档 + 零读定性 + 设置总账 + 拆文件 |
| 第 4 批（新引擎） | EXV22-1 ～ EXV22-8 | 八个引擎 + 路由 + 消费方 |
| 第 5 批（贯通） | EXV22-9 + 场景 56～61 | 全景中心 + 六把场景锁 |
| 第 6 批（收口） | 版本面 / 账本 / 日志 / 全量回归 | v2.400.0 |

---

## 附录 A：G2 复算脚本

```js
const fs=require("fs"),path=require("path");
const desk=fs.readFileSync("engines/action-desk.js","utf8");
const routes=new Set([...desk.slice(desk.indexOf("const ROUTES = {"))
  .matchAll(/^\s{4}'([a-zA-Z0-9_.]+)':/gm)].map(x=>x[1]));
const ns=new Set([...routes].map(k=>k.split(".")[0]));
const files=fs.readdirSync("engines").filter(f=>f.endsWith(".js"));
let hit=[],miss=[];
for(const f of files){
  const src=fs.readFileSync(path.join("engines",f),"utf8");
  const objs=[...src.matchAll(/WA\.(?:engines\.)?([A-Za-z0-9_]+)\s*=/g)].map(x=>x[1]);
  (objs.some(o=>ns.has(o))?hit:miss).push(f.replace(".js",""));
}
console.log("with route:",hit.length,"without:",miss.length);
```

## 附录 B：G3 复算命令

```bash
for p in 'astronom|星象' 'station|驿站' 'tribute|徭役' 'funeral|丧葬' \
         'attire|服饰' 'cartograph|舆图' 'betroth|婚约'; do
  printf '%-30s %s\n' "$p" "$(grep -rhoE "$p" --include=*.js engines/ core/ ui/ render/ | wc -l)"
done
```

> **踩坑记录**：必须用 `grep -E`。若用默认 BRE 写 `'a\|b'`，`\|` 不是 alternation，七个领域会**全部报 0**，看上去「到处都是缺口」。本轮第一次扫描就踩了这个坑，用近义词旁证（驿站单独 37 命中）才识破。**判据写错却报出更戏剧化的读数，是最危险的一种错。**
