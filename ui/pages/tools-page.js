/**
 * WorldAxis ui/pages/tools-page.js (2.401.0) — 工具页（OPV23-2，原 ui/panel.js 3469-3912 行）
 *
 * ── 它治什么 ────────────────────────────────────────────────────
 *   `renderTools` 444 行，19 个专家段（存档槽 / 种子库 / 蓝图 / 世界实验 / 依赖体检 /
 *   规则包 / 维护 / 配置 / 结算 / 兼容 / 工作流 …）全部走 `foldSec` 折叠 ——
 *   折叠＝收起态**不构建那段 DOM**（v2.225.0 Q8 的契约，ui/panel-fold.js 的封闭表）。
 *
 * ── 口径 ────────────────────────────────────────────────────────
 *   1 **零世界写**：本段只读既有读口，零 transact、零 draft 赋值。
 *   2 **零模块作用域**：同 ui/pages/overview-main.js 的契约（自挂 `WA.<ns>`）。
 *   3 **外部依赖只走注入**：只有两个 —— `esc` 与 `foldSec`。`foldSec` 的**实现**留在
 *      ui/panel.js（它读 `WA.panelFold.isCollapsed`，是本文件之外的一块基建），
 *      此处只接收注入，不复制。
 *
 * ── 为什么 `foldSec` 不一起搬走 ──────────────────────────────────
 *   它是**全页共用**的折叠壳（其它页也在调），搬进工具页会让其余页反向依赖本文件，
 *   把「拆段」变成「换一根更细的绳子」。零依赖的那一段才搬 —— 这是本批的取舍。
 */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  let esc = function (s) { return String(s == null ? '' : s); };
  let foldSec = function (page, sec, label, body) { return String(body == null ? '' : body); };
  function bind(ctx) {
    if (!ctx) return API;
    if (typeof ctx.esc === 'function') esc = ctx.esc;
    if (typeof ctx.foldSec === 'function') foldSec = ctx.foldSec;
    return API;
  }
  // ══ 段体开始（原 ui/panel.js 3469-3912 行，逐字搬迁，一个字符未改）══
  function renderTools() {
    // v2.231.0（优化 OPT-9）：**折叠区按展开惰性求值**。
    //   现场实测（/tmp/probe_opt9.js ②）：收起态下切到工具页，7 个专家段的读数**照读**
    //   （worldSeed / worldBlueprint / capacityAudit / perfBaseline / depCheck / rulePack /
    //   worldLab 各 1 次、kinds 2 次），读数占整页渲染 4.1 ms / 54.6 ms。
    //   真因：那些 `const xxxOn = …getSettings().enabled` 写在函数入口，**每次渲染都执行** ——
    //   而它们服务的段体在收起态根本不会被拼接。
    //   修法：`lazy(fn)` 包一层，段体里以 `xxxOn()` 取值；`foldSec` 的 body 传函数。
    //   取值**按需一次**（memo）：同一次渲染里多处引用不会重复读。
    //   注意：**只包折叠表里的段**。下面 checkpoints 的读数不包 —— 存档槽那一段不在折叠表里，
    //   常驻渲染，惰性化它只会让读数变成一个「看运气」的量。
    const lazy = function (fn) { let done = false, v = null; return function () { if (!done) { done = true; v = fn(); } return v; }; };
    // v2.155.0（RX8 世界种子库）：读数在「工具」页常驻，开关状态进渲染（
    //   「库是空的」与「这一面被关掉了」在界面上必须分得开 —— 与 v2.154.0 同一句纪律）。
    const wsCfgL = lazy(function () { return (WA.worldSeed && WA.worldSeed.getSettings) ? WA.worldSeed.getSettings() : null; });
    const wsOn = lazy(function () { const c = wsCfgL(); return !!(c && c.enabled); });
    // v2.164.0（TX5 世界蓝图）：同款读数常驻（「库是空的」与「这一面被关掉了」必须分得开）。
    const bpCfgL = lazy(function () { return (WA.worldBlueprint && WA.worldBlueprint.getSettings) ? WA.worldBlueprint.getSettings() : null; });
    const bpOn = lazy(function () { const c = bpCfgL(); return !!(c && c.enabled); });
    // v2.281.0（V7 OPV7-6）：开局播种的开关常驻读数 —— 同 v2.164.0 起的惯例，
    //   「还没播过」与「这一面被关掉了」必须分得开（关着时 seed() 直接回 disabled，
    //   台账一直空；那与「装了蓝图但一行都没播」不是一回事）。
    const seedCfgL = lazy(function () { return (WA.playableSeed && WA.playableSeed.getSettings) ? WA.playableSeed.getSettings() : null; });
    const seedOn = lazy(function () { const c = seedCfgL(); return !!(c && c.enabled); });
    // v2.182.0（O4 / O3）：同款读数常驻 ——「清点是空的」与「这一面被关掉了」必须分得开。
    const capCfgL = lazy(function () { return (WA.capacityAudit && WA.capacityAudit.getSettings) ? WA.capacityAudit.getSettings() : null; });
    const capOn = lazy(function () { const c = capCfgL(); return !!(c && c.enabled); });
    const pblCfgL = lazy(function () { return (WA.perfBaseline && WA.perfBaseline.getSettings) ? WA.perfBaseline.getSettings() : null; });
    const pblOn = lazy(function () { const c = pblCfgL(); return !!(c && c.enabled); });
    // v2.257.0（OPV6-1 / OPV6-2）：能力档位与启用面的读数。
    //   分工是**引擎算、面板显示**：档位引擎只答「三档各多大 / 现在跑几台 / 能退回几步」，
    //   审计引擎只答「关着的那些为什么关着」。纪律同 v2.164.0 起：**「读不到」与「关着」分开**。
    const tierViewL = lazy(function () {
      try { return (WA.capabilityTier && typeof WA.capabilityTier.view === 'function') ? WA.capabilityTier.view() : null; }
      catch (e) { return null; }
    });
    const capAuditCfgL = lazy(function () {
      return (WA.capabilityAudit && WA.capabilityAudit.getSettings) ? WA.capabilityAudit.getSettings() : null;
    });
    const capSummaryOn = lazy(function () { const c = capAuditCfgL(); return !!(c && c.showSummary === true); });
    // v2.274.0：capability 段的两个读数改为**模板外 lazy 辅助**（与上面 pblOn / capSummaryOn 同惯例）。
    //   为什么不能留在段体内：那两段读数要在模板里做三元与字符串拼接，写成段体内局部量就得
    //   用语句块（箭头函数直接花括号 + const + return），收尾形态变成「分号 + 三闭合符」，
    //   与其余 13 段不同形 —— 而按「反引号紧跟右括号右花括号」计数的门禁（q8 B1d
    //   「每段都有模板收尾」）在本段只数到 13/14，那条纪律于是**在本段空转**。
    //   移到模板外后：段体是纯模板字面量，形态统一；惰性不变（lazy 只在段体求值时被调用）。
    /** standard 档点开几个世界机制；tv 读不到或没有 standard 档 ⇒ null（渲染成「读不到」）。 */
    const stdSizeL = lazy(function () {
      const tv = tierViewL();
      if (!tv) return null;
      const std = (tv.tiers || []).filter(function (t) { return t.name === 'standard'; })[0];
      if (!std || std.size === undefined) return null;
      return std.size;
    });
    /** 「此刻」那一格：档位 / 在跑台数 / 可退回步数；读不到档位引擎时如实说读不到。 */
    const tierLiveHTMLL = lazy(function () {
      const tv = tierViewL();
      if (!tv) return '读不到档位引擎';
      return esc(String(tv.tier))
        + '　在跑世界机制 ' + tv.running + ' / ' + tv.mechanisms + ' 台（关着 ' + tv.dormant + ' 台）'
        + '　可退回 ' + tv.rollbackDepth + ' / ' + tv.rollbackCap + ' 步';
    });
    // v2.184.0（E3）：存档槽的开关与三个容量参数常驻读数 ——
    //   「库是空的」与「这一面被关掉了」必须分得开（同 v2.164.0/v2.182.0 的惯例）。
    const ckcfg = (WA.checkpoints && WA.checkpoints.getSettings) ? WA.checkpoints.getSettings() : null;
    const ckOn = !!(ckcfg && ckcfg.enabled);
    // v2.187.0（E8）：依赖体检与迁移助手的开关常驻读数 ——
    //   「还没体检过」与「这一面被关掉了」必须分得开（同 v2.164.0/v2.182.0/v2.184.0 的惯例）。
    const dcCfgL = lazy(function () { return (WA.depCheck && WA.depCheck.getSettings) ? WA.depCheck.getSettings() : null; });
    const dcOn = lazy(function () { const c = dcCfgL(); return !!(c && c.enabled); });
    // v2.188.0（E7 / E9）：规则包与世界实验室的开关（+ 实验室的动作词表）常驻读数 ——
    //   「还没存过包 / 还没跑过实验」与「这一面被关掉了」必须分得开（同 v2.164.0 起的惯例）。
    //   动作词表**逐字取自 rehearsal**（本模块不自带副本）：读不到时如实渲染「读不到」，
    //   不列一份本模块自己编的词表出来（那会让玩家填的动作在跑的时候全被拒成 unknown-kind）。
    const rpCfgL = lazy(function () { return (WA.rulePack && WA.rulePack.getSettings) ? WA.rulePack.getSettings() : null; });
    const rpOn = lazy(function () { const c = rpCfgL(); return !!(c && c.enabled); });
    const wlCfgL = lazy(function () { return (WA.worldLab && WA.worldLab.getSettings) ? WA.worldLab.getSettings() : null; });
    const wlOn = lazy(function () { const c = wlCfgL(); return !!(c && c.enabled); });
    //   ⚠ 本行此前把 `kinds()` **调了两次**（一次判真、一次取值）—— 读数调用不该按次计费两次，
    //     且第二次的返回值未必等于第一次（引擎侧可以是活的）。本版收成一次取值 + 一次判空。
    const wlKinds = lazy(function () {
      if (!WA.worldLab || typeof WA.worldLab.kinds !== 'function') return null;
      const k = WA.worldLab.kinds();
      return k || null;
    });
    return `
      <div data-omniscient>
      <div class="wa-sec">世界态势分析（纯只读体检）</div>
      <button class="wa-btn" id="wa-an-run">立即分析</button>
      <div id="wa-an-out" class="wa-out"></div>
      <div class="wa-sec">状态快照导出 / 恢复</div>
      <div class="wa-row"><button class="wa-btn" id="wa-snap-dl" title="导全量快照（剔除运行期脏字段，可归档/传给别人/跨聊天移植）">导出 JSON</button><button class="wa-btn" id="wa-snap-up" title="从快照文件恢复（先校验格式/schema/字段完整性，通过才写入）">导入 JSON</button><input type="file" id="wa-snap-file" aria-label="要导入的快照文件" accept=".json" style="display:none"/></div>
      <div class="wa-dim">导出剔除运行时脏字段；导入先校验（格式/schema/字段完整性），通过才写入并自动留恢复点。</div>
      <div class="wa-row"><input id="wa-snap-faces" class="wa-input" placeholder="面名，逗号分隔（如 people,world,weather）"/><button class="wa-btn" id="wa-snap-subset" title="只导出点名的顶层面；不识别的名字进 dropped 清单，不静默带上">导出子集</button></div>
      <div id="wa-snap-out" class="wa-out"></div>
      <div class="wa-sec">存档槽（世界状态槽 · 可命名 / 载入 / 分叉）</div>
      <div class="wa-dim">与上面「全量快照」的<b>分工</b>：这里是<b>世界状态槽</b>——存在独立 localStorage 键里
        （<b>不在世界状态里</b>，故载入世界不动库），用于「存一版、试试另一条路、不满意再回来」；
        上面那个是<b>可移植归档</b>（导出 JSON、可传给别人、跨聊天）。两者不做彼此的替代品：
        存档槽不承担聊天存档的职责。<br/>
        自动快照的开关是 <code>autoEvery</code>（每 N 轮一份），<b>不是</b>下面这个总开关 ——
        开了自动却忘开总开关时自动档照存（那是刻意的：静默不存比多存一份更坏）。
        此刻：总开关 <b>${ckOn ? '开' : '关'}</b>，手动上限 <b>${ckcfg ? ckcfg.maxSlots : '?'}</b>，
        自动每次保留 <b>${ckcfg ? ckcfg.autoSlots : '?'}</b>，节奏 <b>${ckcfg && ckcfg.autoEvery > 0 ? ('每 ' + ckcfg.autoEvery + ' 轮') : '关'}</b>。</div>
      <label class="wa-row"><input id="wa-ck-enabled" type="checkbox" ${ckOn ? 'checked' : ''}/> 启用存档槽</label>
      <div class="wa-row">
        <input id="wa-ck-name" class="wa-input" placeholder="存档名（必填）"/>
        <button class="wa-btn" id="wa-ck-save" title="命名保存当前世界状态（关着时拒收 —— 拒收原因与「存满了」不是一回事）">保存</button>
        <button class="wa-btn" id="wa-ck-list" title="列出全部存档（最新在前，含自动档）；列表不回传世界状态本体">列表</button>
      </div>
      <div class="wa-row">
        <input id="wa-ck-id" class="wa-input" placeholder="存档 id（从列表里抄）"/>
        <button class="wa-btn" id="wa-ck-read" title="读一个槽位：回带元信息与状态深拷贝（读面不回传库内活引用）">读</button>
        <button class="wa-btn" id="wa-ck-restore" title="载入：整份替换世界状态（快照里没有的顶层键不该留在世界里）。载入不触碰库本身">载入</button>
        <button class="wa-btn" id="wa-ck-remove" title="删除这个槽位（唯一合法的「这档我不要了」入口；库读不出时拒收，不覆盖写）">删除</button>
      </div>
      <div class="wa-row">
        <input id="wa-ck-cmp" class="wa-input" placeholder="比较：两个 id，逗号分隔（如 ck1,ck2）"/>
        <button class="wa-btn" id="wa-ck-compare" title="按顶层键粒度比较两个存档：差异量级是「哪几块不同」，不是几千行字节差">比较</button>
        <input id="wa-ck-branch" class="wa-input" placeholder="分叉名（从上面 id 分出新档）"/>
        <button class="wa-btn" id="wa-ck-fork" title="从该存档分叉：先把世界恢复到它，再另存一份带父指针的新档（原档逐字不变）">分叉</button>
      </div>
      <div class="wa-row">
        <input id="wa-ck-newkey" class="wa-input" placeholder="新世界顶层键（留空=只算名，不搬内容）"/>
        <button class="wa-btn" id="wa-ck-plan" title="另开一世界（只读计划）：不碰当前世界、不碰拍账，只算「新线叫什么」+「把父档搬进哪个新键」。要两个世界并存必须给新键（独立键 = 独立世界）">另开计划</button>
      </div>
      <div class="wa-row">
        <input id="wa-ck-max" class="wa-input" placeholder="手动上限（1–24）"/>
        <input id="wa-ck-every" class="wa-input" placeholder="自动节奏（0=关，最多 100）"/>
        <input id="wa-ck-auton" class="wa-input" placeholder="自动保留（0–12）"/>
        <button class="wa-btn" id="wa-ck-cfg" title="写容量参数：越界值被夹到区间上界，未写的子键保持默认">存参数</button>
      </div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-ck-export" title="导出单档（带信封 + 校验和 + 格式号；格式号是迁移判定的唯一来源）">导出单档</button>
        <button class="wa-btn" id="wa-ck-import" title="导入单档：先判信封、后判开关（反过来的话「关着时丢进垃圾」会报成 disabled，用户会以为打开就能导入）">导入单档</button>
        <button class="wa-btn" id="wa-ck-stat" title="自证面：库可读性 / 手动与自动水位 / 逐项计数">诊断</button>
      </div>
      <textarea id="wa-ck-text" class="wa-ta" placeholder="导出结果出现在下面；导入时把单档 JSON 粘到这里再点「导入单档」…"></textarea>
      <div id="wa-ck-out" class="wa-out"></div>
      <div class="wa-sec">外部数据导入（自动识别类型）</div>
      <div class="wa-row"><button class="wa-btn" id="wa-imp-pick">选择 JSON 文件</button><input type="file" id="wa-imp-file" aria-label="要导入的 JSON 文件" accept=".json" style="display:none"/></div>
      <div class="wa-dim">支持：全量存档 / 区域事件 / 势力清单 / 事件链清单 / 人物主观记忆 / 世界书条目组（自动判别）</div>
      <textarea id="wa-imp-text" class="wa-ta" placeholder="或直接粘贴 JSON 内容…"></textarea>
      <button class="wa-btn" id="wa-imp-run" title="自动识别粘贴/文件内容的类型（存档/区域事件/势力/事件链/主观记忆），校验失败零写入">预检并导入</button>
      <div id="wa-imp-out" class="wa-out"></div>
      ${foldSec('tools', 'selfcheck', '扩展自检（模块/注入/UI/运行环境）', () => `
      <div class="wa-sec">诊断与体检<span class="wa-dim">（只读，不改世界状态）</span></div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-diag-run" title="立即体检：模块装载/上轮注入/UI 绑定/视图开关/API 通道">立即自检</button>
        <button class="wa-btn" id="wa-diag-dl" title="把体检结果导出为 JSON 诊断包（不含聊天正文与密钥）">导出诊断包</button>
        <button class="wa-btn" id="wa-audit-copy" title="复制内存/持久化用量审计报告">复制内存审计</button>
        <button class="wa-btn" id="wa-maintain" title="健康巡视：逐站点扫描容量、陈旧、孤立数据">健康巡视</button>
      </div>
      `)}
      ${foldSec('tools', 'storage', '存储与现场<span class="wa-dim">（看磁盘上真实存了什么）</span>', () => `
      <div class="wa-row">
        <button class="wa-btn" id="wa-key-check" title="存储键体检：列出本扩展写过的所有键与占用">存储键体检</button>
        <button class="wa-btn" id="wa-quar-view" title="隔离现场：读取损坏而被隔离的原始数据">隔离现场</button>
        <button class="wa-btn" id="wa-conf-view" title="冲突现场：多标签页并发写导致的冲突快照">冲突现场</button>
        <button class="wa-btn" id="wa-mirror-view" title="镜像视图：聊天 metadata 镜像与 localStorage 的回落台账">镜像视图</button>
        <button class="wa-btn" id="wa-orphan-view" title="设置键：未登记却已落盘的幽灵设置">设置键</button>
        <button class="wa-btn" id="wa-cfg-view" title="配置包：整包导出/导入设置家族键，含 schema 版本、备份环与失败不污染">配置包</button>
        <button class="wa-btn" id="wa-settle-view" title="结算守卫：同一楼层是否被重复结算">结算守卫</button>
        <button class="wa-btn" id="wa-claim-view" title="异步写回票据：摘要/记忆/档案/舆情的迟到结果被放行还是拒收，以及拒收归因（只看已发生的读数）">写回票据</button>
        <button class="wa-btn" id="wa-compat-view" title="宿主兼容层：当前宿主提供了哪些能力、缺哪些">宿主兼容层</button>
        <button class="wa-btn" id="wa-net-view" title="跨插件互操作：宿主能力 / 上游证据读取 / 手机侧交互执行，三伙伴五态分列（只读，不驱动对方重建快照）">跨插件面</button>
        <button class="wa-btn" id="wa-net-freeze" title="协议冻结面：三座桥的 id 与契约版本、诊断节键、拒收码词表——外部读者认的就是这些字符串">协议冻结面</button>
        <button class="wa-btn" id="wa-perf-view" title="性能面：分层耗时 P50/P95、四个耗时分列、脏集与复用计数（只念已发生的读数，不触发基准）">性能面</button>
        <button class="wa-btn" id="wa-perf-bench" title="基准面：真跑冷启（四面各一遍）与热启（按脏集复用），并复核复用值是否等于现算值">基准面</button>
        <button class="wa-btn" id="wa-perf-partial" title="增量面：按每一面自己的输入（世界步进 stateRev）决定重算还是复用——同一世界步进下重复读取应为 0 重算；改过世界再点则如实重算">增量面</button>
        <button class="wa-btn" id="wa-perf-band" title="档位面：短 / 中 / 长 / lowend 四档并排，本地与宿主 API 分列（每档取本档前后的差值，不是全局累计）；lowend 为同机放大估计，不参与判定">档位面</button>
      </div>
      `)}
      ${foldSec('tools', 'audit', '审计取证<span class="wa-dim">（谁改过世界——把一段事实带出会话）</span>', () => `
      <div class="wa-row">
        <button class="wa-btn" id="wa-audit-vol" title="导出一卷审计事实（纯读：不挤出、不清环、不改计数）——这一节会话里世界被谁改过，只有把它带出去才答得上">导出审计</button>
        <button class="wa-btn" id="wa-audit-vol-check" title="核对一卷从别处拿来的审计（序号链 + 时间链），零状态触碰：不并入环、不改序号、不写盘">带外核对</button>
      </div>
      <textarea id="wa-audit-vol-text" class="wa-ta" placeholder="把一卷审计（JSON）粘在这里再点「带外核对」——上一节会话导出的那种。本侧无卷时照实说「先导出一卷」，不假装核对过"></textarea>
      <div id="wa-audit-vol-out" class="wa-out"></div>
      `)}
      ${foldSec('tools', 'recovery', '恢复与撤销<span class="wa-dim">（改错了能退回去）</span>', () => `
      <div class="wa-row">
        <button class="wa-btn" id="wa-recovery-dl" title="导出当前状态的恢复点文件">导出恢复点</button>
        <button class="wa-btn" id="wa-recovery-view" title="列出已留存的恢复点">存档恢复点</button>
        <button class="wa-btn" id="wa-undo-btn" title="回退最近一次面板编辑（参数/背景/事实/伏笔等）">撤销编辑</button>
      </div>
      `)}
      ${foldSec('tools', 'sampler', '记忆采样预览<span class="wa-dim">（buildBlock 实时输出）</span>', () => `
      <div class="wa-row"><button class="wa-btn" id="wa-samp-preview" title="调用 memorySampler.buildBlock 查看当前会注入的记忆采样文本">预览采样</button><button class="wa-btn wa-mini" id="wa-samp-copy" disabled>复制</button></div>
      <div id="wa-samp-out" class="wa-out"></div>
      `)}
      ${foldSec('tools', 'traces', '运行痕迹<span class="wa-dim">（只清计量，不动世界状态）</span>', () => `
      <div class="wa-row">
        <button class="wa-btn" id="wa-stat-reset" title="仅重置各种计数器，世界状态与存档不受影响">清零计量</button>
        <button class="wa-btn" id="wa-gauge-reset" title="清零八台读数仪的进程态计量（世界日记/人物动线/关系温度/暗流日历/单轮成本/存档体检/开局引导/一键交班）。只清计量，不动存档、不改配置">清零读数仪</button>
        <button class="wa-btn" id="wa-wf-reset" title="清空工作流运行历史与失败台账">清空运行痕迹</button>
      </div>
      <div class="wa-dim">只读体检：模块装载完整性、上轮注入是否真进 prompt、面板控件绑定、视图开关、工作流与API通道。不含聊天正文与密钥。</div>

      `)}
      ${foldSec('tools', 'playerarchive', '世界作品与带离包 · 每5轮归档作品（作者侧私密归档）', () => `
      <div class="wa-dim">含秘密与情报持有人，请勿公开分发。周期作品保存在本机当前聊天；带离包请自行复制备份。自传仅作来源附件，不移植为目标局历史。</div>
      <label><input id="wa-par-enabled" type="checkbox" ${WA.playerArchive && WA.playerArchive.getSettings().enabled ? 'checked' : ''}/> 每${WA.playerArchive ? WA.playerArchive.getSettings().every : 5}轮归档作品（默认关闭）</label>
      <label><input id="wa-events-auto" type="checkbox" ${WA.events && WA.events.getSettings().autoFulfill ? 'checked' : ''}/> 自动归档到期排期标题（默认关闭，需同时启用事件模块；不代判条件）</label>
      <label>作品周期<input class="wa-input" type="number" id="wa-par-every" min="1" max="50" value="${WA.playerArchive ? WA.playerArchive.getSettings().every : 5}"/></label>
      <label>保留份数<input class="wa-input" type="number" id="wa-par-max" min="1" max="24" value="${WA.playerArchive ? WA.playerArchive.getSettings().maxWorks : 12}"/></label>
      <div class="wa-row"><button class="wa-btn" id="wa-par-export">导出当期投影JSON</button><button class="wa-btn" id="wa-par-view">周期作品</button><button class="wa-btn" id="wa-par-seed">保存自传新局包</button><label>续接归档轮号<input type="number" min="1" id="wa-par-round" value="5"/></label><button class="wa-btn" id="wa-par-continue">导出该归档末态续接包</button></div>
      <textarea class="wa-input" id="wa-par-input" placeholder="目标空新聊天粘贴自传新局包或末态续接包"></textarea><button class="wa-btn" id="wa-par-import">导入新局／续接包</button>
      <div id="wa-par-out" class="wa-out"></div>
      `)}
      ${foldSec('tools', 'seedlib', '世界种子库（把这一局的格局存下来，换一局再开）', () => `
      <div class="wa-dim">种子存的是<b>骨头</b>：势力格局 / 人物关系网 / 地理 / 时代背景。它<b>不含</b>编年史 / 暗流 / 回声 / 章节 ——
        存了进度就不是新局，是同一个世界的续集。签名的输入只有结构面，故<b>换个名字存同一格局仍会被去重</b>。
        <b>播种只返回计划、不写世界</b>：真去重开一局是宿主（/reset、新对话）的动作 ——
        一个「自己会开新局」的引擎在长局里不可接受。此刻：<b>${wsOn() ? '开' : '关'}</b>（关闭时提取／保存／播种一并拒收，
        读数会一直空 —— 这与「还没存过种子」不是一回事）。</div>
      <label class="wa-row"><input id="wa-ws-enabled" type="checkbox" ${wsOn() ? 'checked' : ''}/> 启用世界种子库</label>
      <div class="wa-row"><input id="wa-ws-name" class="wa-input" placeholder="种子名（如：三足鼎立·第一次）"/><input id="wa-ws-tags" class="wa-input" placeholder="标签，逗号分隔（三国鼎立 / 都市商战 / 田园 / 门派 / other）"/><button class="wa-btn" id="wa-ws-save" title="写口：把上一次提取的种子存进库（一次 transact、只写 worldSeed.library）。同结构不存两份（duplicate-seed 带已有 id）、库满拒收 library-full —— 不静默挤掉旧种子。去重靠签名不靠名字">保存种子</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-ws-extract" title="纯读：从当前世界提取结构种子（势力/关系网/地理/时代）。四张表全空时拒收 nothing-to-extract —— 不产空种子">提取种子</button><button class="wa-btn" id="wa-ws-list" title="只读：库内清单（名字/标签/签名/各面条数）">种子清单</button><button class="wa-btn" id="wa-ws-stat" title="只读：提取/保存/播种次数、库上限与拒收归因">台账</button></div>
      <div class="wa-row"><input id="wa-ws-id" class="wa-input" placeholder="种子 id（如 ws_1a2b3c4d_5e6f）"/><button class="wa-btn" id="wa-ws-get" title="只读：取一个种子（含结构面与签名）">取种子</button><button class="wa-btn" id="wa-ws-drop" title="写口：从库内删掉一个种子（只动 worldSeed.library 这一格）">删种子</button></div>
      <div class="wa-row"><input id="wa-ws-variance" class="wa-input" placeholder="变异度 0–100（留空=0）"/><button class="wa-btn" id="wa-ws-sow" title="只读推导：给一个种子的播种计划（骨头 + 进度归零）。变异度越界拒收 bad-value（不静默夹住）—— 「你要的变异度」与「真发生的变异度」长得一样是最坏的读数">播种计划</button></div>
      <!-- v2.158.0（S3 + SP6）：种子转移与初始化四控件（转移包 / 包粘贴 / 导入 / 预览 / 确认）。 -->
      <div class="wa-row"><button class="wa-btn" id="wa-ws-pack" title="转移包：把库里一颗种子打包成可跨聊天转移的 JSON（带格式版本/来源/结构签名/容量界限）。全选复制到目标聊天的「导入转移包」即可">打转移包</button><input id="wa-ws-packin" class="wa-input" placeholder="粘贴转移包 JSON（目标聊天导入用）"/><button class="wa-btn" id="wa-ws-import" title="写口：白名单校验接收转移包（bad-pack-ver / bad-seed-keys / duplicate-seed / library-full 四道门，整批交付或整批拒收）">导入转移包</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-ws-init" title="初始化预览：把种子映射到现有状态字段（id 映射 + 引用完整性 + 保留层级说明）。变异在此生成一次，确认应用同一份（不重抽）">初始化预览</button><button class="wa-btn" id="wa-ws-confirm" title="写口（大）：一次事务装完整结构（势力/关系网/地名/时代），进度归零，写 meta.initFrom。只作用于空新局 —— 非空目标拒收 not-empty">初始化确认</button></div>

      <div id="wa-ws-out" class="wa-out"></div>

      `)}
      ${foldSec('tools', 'blueprint', '世界蓝图（把这一局的世界原样搬走 / 搬来）', () => `
      <div class="wa-dim">蓝图存的是<b>结构</b>：人物稳定 ID 与别名、方向化关系、势力权重、地点（含归属与开关时刻）、
        <b>道路端点</b>与时长容量、时代与日历起点、受支持的静态人设与机制开关。
        它<b>不含</b>人物私密记忆 / 聊天文本 / 已完成事件 / 编年史 / 暗流 / 回声 / 事实 / 外部凭据与脚本 ——
        蓝图搬的是「这个世界长什么样」，不是「这一局发生过什么」。与种子库的分水岭：种子<b>只有显示名</b>
        （两个同名人物会被合并），蓝图给每个实体一个<b>稳定 ID</b>（同一份输入永远得到同一个 key，同名不合并）。
        安装只作用于<b>空新局</b>：非空目标拒收 not-empty，不覆盖既有存档。此刻：<b>${bpOn() ? '开' : '关'}</b>
        （关闭时导出／保存／预览／安装一并拒收，读数会一直空 —— 这与「还没导出过」不是一回事）。</div>
      <label class="wa-row"><input id="wa-bp-enabled" type="checkbox" ${bpOn() ? 'checked' : ''}/> 启用世界蓝图</label>
      <div class="wa-row"><input id="wa-bp-name" class="wa-input" placeholder="蓝图名（如：三足鼎立·完整版）"/><input id="wa-bp-tags" class="wa-input" placeholder="标签，逗号分隔（三国鼎立 / 都市商战 / 田园）"/><button class="wa-btn" id="wa-bp-save" title="写口：把上一次导出的蓝图存进库（一次 transact、只写 blueprint.library）。同结构不存两份（duplicate-blueprint 带已有 id）、库满拒收 library-full —— 不静默挤掉旧蓝图。去重靠签名不靠名字">保存蓝图</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-bp-export" title="纯读：从当前世界导出完整结构蓝图（白名单提取）。四张表全空时拒收 empty-blueprint —— 不产空蓝图。导出后当场自检引用完整性，悬空即报 dangling-ref（问题出在导出侧而非导入侧）">导出蓝图</button><button class="wa-btn" id="wa-bp-list" title="只读：库内清单（名字/标签/签名/各面条数）">蓝图清单</button><button class="wa-btn" id="wa-bp-stat" title="只读：导出/保存/预览/安装次数、库上限与拒收归因">台账</button></div>
      <div class="wa-row"><input id="wa-bp-id" class="wa-input" placeholder="蓝图 id（如 bp_1a2b3c4d_5e6f）"/><button class="wa-btn" id="wa-bp-get" title="只读：取一张蓝图（含结构与签名）">取蓝图</button><button class="wa-btn" id="wa-bp-drop" title="写口：从库内删掉一张蓝图（只动 blueprint.library 这一格）">删蓝图</button></div>
      <div class="wa-row"><button class="wa-btn" id="wa-bp-check" title="纯读：对库内一张蓝图跑引用完整性三判据（重复 ID / 悬空引用 / 未知顶层键）—— 这是安装前的**独立**校验口，与安装侧共用同一份判据，不另写一套">校验蓝图</button><button class="wa-btn" id="wa-bp-empty" title="纯读：当前世界是不是空新局（12 项逐格清点：人物/地点/道路/势力/轮次/纪事/暗流/回声/事实/货品/初始化来源/蓝图安装留痕）。答的是「现在能不能装」，不是「装过没有」">目标空局检查</button></div>
      <div class="wa-row"><input id="wa-bp-keep" class="wa-input" placeholder="保留层级 structure / roster / mech（留空=roster）"/><button class="wa-btn" id="wa-bp-preview" title="纯读预览：把库内一张蓝图映射到现有状态字段（六道门：版本/形状/白名单键/重复 ID/悬空引用/容量 + 目标非空）。预览只做一次映射，确认应用同一份">导入预览</button><button class="wa-btn" id="wa-bp-import" title="写口（大）：一次事务装完整结构（势力/人物/关系/地点/道路/时代），进度归零，写 blueprint.installed。只作用于空新局 —— 非空目标拒收 not-empty；无预览拒收 no-preview">安装蓝图</button></div>
      <div id="wa-bp-out" class="wa-out"></div>
      <!-- v2.281.0（V7 OPV7-6）：开局即喂。装完蓝图会自动播种，这里给的是
           「播了什么／有几行取不到实词」的读数与一个补播入口（补播为幂等）。 -->
      <!-- v2.282.0：本段原先直接挂在「世界蓝图」折叠区里，没有自己的分区标题 ——
           v2.57.0 的分区锁当场打红两面：[A] 开关所在标题须含模块名（实为「世界蓝图…」）、
           [B] 两模块不得共用同一分区标题（「世界蓝图」下同时有 世界蓝图 + 开局播种）。
           缺标题的代价是玩家答不出「这一排开关属于哪个模块」—— 正是该锁要防的那一类。 -->
      <div class="wa-sec">开局播种（装完蓝图就把这一局喂起来）</div>
      <div class="wa-dim">播种把蓝图里的结构面读成可执行的行：人物的目标与日程、方向化的关系、
        势力归属。它只写这几类结构化位，不写聊天文本、不编词 —— 取不到实词的行如实报「不播」，
        绝不填一句话进去凑数。与「世界蓝图」的分界：蓝图搬的是世界长什么样，
        播种是把这个世界**喂给机制**，让第一轮就有内容可读。</div>
      <label class="wa-row"><input id="wa-seed-enabled" type="checkbox" ${seedOn() ? 'checked' : ''}/> 启用开局播种（关掉时「补播」直接回 disabled，读数一直空 —— 这与「装了蓝图但一行都没播」不是一回事）</label>
      <div class="wa-dim" id="wa-seed-line"></div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-seed-replay" title="补播：按当前已安装的玩法蓝图再播一次结构化位（目标 / 日程 / 关系 / 势力归属）。幂等 —— 已有的行不会重复写；取不到实词的行不播并如实报，绝不编一句填进去">补播</button>
        <button class="wa-btn" id="wa-seed-view" title="只读：要播几行、各是哪一类、有没有取不到实词的行、逐条拒因是什么">播种读数</button>
      </div>
      <div id="wa-seed-out" class="wa-out"></div>
      `)}
      ${foldSec('tools', 'depcheck', '依赖体检与迁移助手</div><div class="wa-dim">（运行环境与依赖完整性检查）', () => `
      <div class="wa-dim">蓝图 / 种子 / 转移包 / 存档信封四类可搬物，粘进来逐项体检：<b>缺什么</b>（外部依赖 / 机制开关 / 配方真源）、
        <b>会降级什么</b>（损失面<b>逐字取自各导入侧真源</b>，本面不重写）、<b>能不能迁移</b>（走 checkpoints 的迁移链）。
        三态分列：<code>present</code>（在）/ <code>absent</code>（确实缺）/ <code>unknown</code>（<b>探不出</b>）。
        <code>unknown</code> 与 <code>absent</code> 处置相反 —— 「不知道有没有」要你去核实，「没有」要你去找那份依赖。
        对<b>所有</b>可搬物都一样的探不出（本仓无媒体资产登记面）另归 <code>envLimited</code>，不参与总判。
        <b>本面是纯读的</b>：零 store 写、零文件写，也<b>不驱动任何模块干活</b> —— 迁移助手只出<b>计划</b>，
        原文件一个字不动（回带源指纹可核对）。此刻：<b>${dcOn() ? '开' : '关'}</b>（关闭时体检与计划一并拒收，
        读数一直空 —— 这与「还没体检过」不是一回事）。</div>
      <label class="wa-row"><input id="wa-dc-enabled" type="checkbox" ${dcOn() ? 'checked' : ''}/> 启用依赖体检</label>
      <div class="wa-row">
        <input id="wa-dc-kind" class="wa-input" placeholder="体裁（留空=自动判：blueprint / seed / pack / checkpoint）"/>
        <button class="wa-btn" id="wa-dc-catalog" title="只读：可体检的四类体裁、三类依赖、三种状态与四种总判的封闭集（念的就是引擎那一份，不另写一遍）">体检口径</button>
      </div>
      <div class="wa-row">
        <textarea id="wa-dc-in" class="wa-input" rows="3" placeholder="粘贴可搬物 JSON（蓝图 / 种子 / 转移包 / 存档信封）"></textarea>
      </div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-dc-use" title="把「最近一次导出/取出的可搬物」装进输入框（蓝图库内那一张、或上一次导出的蓝图）—— 省去手工拷一大段 JSON">取最近一次</button>
        <button class="wa-btn" id="wa-dc-check" title="依赖体检（纯读）：体裁判定 / 格式版本 / 依赖三项态 / 机制开关落差 / 降级损失 / 可迁移性 / 总判 + 判定依据">开始体检</button>
      </div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-dc-plan" title="迁移助手（纯读）：只出计划，不动原文件。不能迁移时报 not-migratable 并回带源指纹">迁移计划</button>
        <button class="wa-btn" id="wa-dc-diag" title="自证面：四处版本真源各读得到吗、迁移链现状、体检台账（四种总判计数 + 拒收归因）">诊断</button>
      </div>
      <div id="wa-dc-out" class="wa-out"></div>
      `)}
      ${foldSec('tools', 'rulepack', '规则包与自动化模板</div><div class="wa-dim">（保存当前规则设定与自动化动作模板）', () => `
      <div class="wa-dim">把<b>当前规则面</b>（你启用的题材与相关设置）存成一个<b>命名包</b>：换一局、换一个人设时一键切回，
        也能导出给别人。<b>本面只记录设置与启用面，一个字都不改世界状态</b> ——
        写盘唯一走 <code>settingsBus</code>（与题材 / 预设 / 配方同一条路）。<br/>
        自动化模板是<b>封闭词表</b>：动作只能是那五口已存在的<b>只读</b>读口，模板声明<b>预算</b>与<b>失败策略</b>，
        跑满即停、被拒如实带回执。<b>不执行任何脚本</b>（零依赖仓库不跑用户脚本）。
        此刻：<b>${rpOn() ? '开' : '关'}</b>（关闭时保存 / 切换 / 导入 / 跑模板一并拒收，
        读数一直空 —— 这与「还没存过包」不是一回事）。</div>
      <label class="wa-row"><input id="wa-rp-enabled" type="checkbox" ${rpOn() ? 'checked' : ''}/> 启用规则包</label>
      <div class="wa-row">
        <input id="wa-rp-name" class="wa-input" placeholder="包名（如：悬疑·高难）"/>
        <button class="wa-btn" id="wa-rp-save" title="写口（设置族）：把当前规则面存成命名包。同名覆盖会明确报 replaced —— 不静默顶掉旧包">存当前规则面</button>
        <button class="wa-btn" id="wa-rp-list" title="只读：包清单（名字 / 键数 / 指纹 / 是否导入来的）">包清单</button>
      </div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-rp-apply" title="写口（设置族）：切到某个包。逐键经 settingsBus 写回，部分成功会如实报 partial（不谎报「切干净了」）">切到这个包</button>
        <button class="wa-btn" id="wa-rp-drop" title="写口（设置族）：删掉一个包（只动包清单，不碰世界）">删包</button>
        <button class="wa-btn" id="wa-rp-export" title="纯读：把一个包导出成可搬运 JSON（带格式版本与源指纹）">导出包</button>
        <button class="wa-btn" id="wa-rp-import" title="写口（设置族）：导入一个包（格式 / 版本 / 键登记三道门；未知键如实列出、不进包 —— 不静默丢弃）">导入包</button>
      </div>
      <div class="wa-row">
        <textarea id="wa-rp-tpl" class="wa-input" rows="3" placeholder="模板 JSON 数组，如 [{'id':'t1','action':'pending.sweep','every':3,'budget':2,'failPolicy':'skip'}]"></textarea>
        <button class="wa-btn" id="wa-rp-tpl-list" title="只读：已登记模板（动作 / 每 N 轮 / 已用次数 / 预算 / 失败策略）">模板清单</button>
        <button class="wa-btn" id="wa-rp-tpl-run" title="写口：按预算跑一轮（在**设置面**上登记模板，动作只调既有只读读口；预算跑满即停并如实报 budget-exhausted）">设模板</button>
         <button class="wa-btn" id="wa-rp-catalog" title="只读：封闭集口径（可进包的模块 / 五口动作及其真读口 / 失败策略 / 容量区间）">口径</button>
         <button class="wa-btn" id="wa-rp-diag" title="自证面：settingsBus / inputGuard / 各相关引擎在不在、词表逐口现场核对结果、台账（保存/切换/导入/模板次数 + 拒收归因）">诊断</button>
       </div>
       <div class="wa-dim">v2.203.0（Y8）四件事：<b>给包写一句说明</b>（随包导出/导入，覆盖同名时沿用旧说明）、
         <b>查冲突</b>（同键两处写 / 两条政策互斥 / 两题材叠加 —— <b>只报不判</b>，不做「后启用的赢」）、
         <b>开档定档</b>（规则包 + 预设世界配起来是什么样，<b>纯读</b>）、
         <b>回滚一步</b>（栈里只装规则面键值，一条世界键都进不来；写回经 <code>settingsBus</code>，
         回滚前后世界摘要一致是<b>实测</b>的）。</div>
       <div class="wa-row">
         <input id="wa-rp-note" class="wa-input" placeholder="包说明（人读的一行，如：悬疑局用的那套）"/>
         <button class="wa-btn" id="wa-rp-check" title="只读：查冲突。三类逐条带理由；判不了的那一类单独标出来（engine-absent ≠ 没有冲突）。名称框留空则比「当前面 vs 当前面」">查冲突</button>
         <button class="wa-btn" id="wa-rp-compose" title="只读：开档定档 —— 规则包 + 预设世界配起来是什么样（不切规则、不种世界）">开档定档</button>
       </div>
       <div class="wa-row">
         <button class="wa-btn" id="wa-rp-admit" title="只读：这一包现在切得进去吗（写盘之前先问一句）—— 有冲突即拒并指出是哪两条">能不能启用</button>
         <button class="wa-btn" id="wa-rp-force" title="强制启用（明知有冲突）：仅你明说这么配时才走。判据不变 —— 回执里逐条带回冲突，不做「后启用的赢」">强制启用</button>
         <button class="wa-btn" id="wa-rp-rollback" title="写口（设置族）：把栈顶那一份规则面写回。写的是键值而不是「切到某个包」，故上一次切换前的手改值也回得去">回滚一步</button>
         <button class="wa-btn" id="wa-rp-history" title="只读：回滚栈（深度 / 上限 / 每步是从哪来的、几键、指纹）—— 只报形状不报值">回滚栈</button>
       </div>
       <div id="wa-rp-out" class="wa-out"></div>
      `)}
      ${foldSec('tools', 'worldlab', '世界实验室与反事实对比</div><div class="wa-dim">（分支沙盘实验与平行可能性推演）', () => `
      <div class="wa-dim">在<b>隔离副本</b>上把三条路径各跑一遍：<code>hold</code>（什么都不做）、<code>选 A</code>、<code>选 B</code>，
        然后逐项摆差异（准入结论 / 账目 / 因果落地），每一项都标<b>来源</b>。<br/>
        <b>实验绝不写 live 存档</b>：「跑前跑后世界摘要一致」是<b>实测</b>出来的（不是一句声明）。
        指纹缺失一律标 <code>unknown</code>（不冒充「相同」也不冒充「不同」）；世界变了这份实验就<b>过期</b>，
        读它会被标出来（要当前结论就重跑）。路径写法：每行一步，<code>动作|谁|参数</code>，
        动作只在 ${wlKinds() ? esc(wlKinds().join(' / ')) : '<b>读不到</b>（rehearsal 缺席）'} 里选。
        此刻：<b>${wlOn() ? '开' : '关'}</b>。</div>
      <label class="wa-row"><input id="wa-wl-enabled" type="checkbox" ${wlOn() ? 'checked' : ''}/> 启用世界实验室</label>
      <div class="wa-row">
        <textarea id="wa-wl-a" class="wa-input" rows="2" placeholder="选 A 的路径，如：reroute|李明|码头|车站"></textarea>
        <textarea id="wa-wl-b" class="wa-input" rows="2" placeholder="选 B 的路径，如：notify|李明|货到了"></textarea>
      </div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-wl-run" title="跑一次实验（纯读 world）：三条路径落在同一份起点上，全部在隔离副本里跑。跑前跑后各取一次 live 摘要自证零写入">跑三条路径</button>
        <button class="wa-btn" id="wa-wl-arms" title="只读：逐臂读数（步数 / 跑成与被拒 / 副本事务数 / 因果落地 / 指纹）。过期会标出来">逐臂读数</button>
        <button class="wa-btn" id="wa-wl-diff" title="只读：逐项差异，标 same / diff / unknown 并带来源。三臂全缺可比读数时报 not-comparable（不回一个「全相同」）">差异对比</button>
      </div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-wl-export" title="纯读：把**起点世界**导出为一份真蓝图（交依赖体检核）。蓝图里不含任何反事实结果 —— 那份副本从来不是真世界">导出起点为蓝图</button>
        <button class="wa-btn" id="wa-wl-discard" title="丢弃读数（副本本来就不落任何地方，故无残留可清）。本模块没有任何一条把副本写回 live 的路径">丢弃实验</button>
         <button class="wa-btn" id="wa-wl-catalog" title="只读：三条路径 / 差异行及各自来源 / 动作词表（逐字取自 rehearsal）/ 边界口径">口径</button>
         <button class="wa-btn" id="wa-wl-diag" title="自证面：rehearsal / exec / store / blueprint 在不在、当前实验是否过期、live 有没有被改到、台账">诊断</button>
       </div>
       <div class="wa-dim">v2.203.0（Y9）四件事：<b>沙盒推进</b>（在<b>同一份</b>副本上连着往前推 N 轮 —— 第 3 轮看到的是第 1、2 轮改过的那份世界），
         <b>结果报告</b>（每处变化拆成一条带来源的原因；无变化的轮如实记 <code>no-change</code>，不编原因）、
         <b>选择性采纳</b>（把报告里<b>某一条</b>落成真世界事件，走 U2 统一提交 ——
         这是全模块<b>唯一</b>的写世界路径，且来源与批准点写在那一条事实自己身上）、
         <b>拍引擎联动</b>（跑拍引擎的推演而<b>不落拍</b>：拍账摘要前后逐字一致是实测的）。</div>
       <div class="wa-row">
         <input id="wa-wl-rounds" class="wa-input" placeholder="推几轮（默认 3，上限 12；超限会夹住并回带 clamped）"/>
         <button class="wa-btn" id="wa-wl-sim" title="沙盒推进（纯读 world）：在同一份隔离副本上累积推进 N 轮。跑前跑后各取一次 live 摘要自证零写入">沙盒推进</button>
         <button class="wa-btn" id="wa-wl-report" title="只读：结果报告 —— 每一处变化拆成一条原因并标来源；无法落成事实的空轮不在「可采纳」之列">结果报告</button>
       </div>
       <div class="wa-row">
         <input id="wa-wl-index" class="wa-input" placeholder="采纳第几条（报告里可采纳条目的序号，从 0 起）"/>
         <button class="wa-btn" id="wa-wl-adopt" title="写口（世界事实 · 走 U2 统一提交）：把报告里那一条落成真世界事件。只追加**一条** worldFacts；失败则世界一格不动">采纳这一条</button>
         <button class="wa-btn" id="wa-wl-beats" title="只读：拍引擎推演 —— 当前结构下给的是只读投影（拍引擎族一律直调 store.transact、不走 exec），不落拍由拍账摘要实测">拍引擎推演</button>
       </div>
       <div class="wa-row">
         <button class="wa-btn" id="wa-wl-adapters" title="只读:逐模块隔离判定 —— 在**真副本**上把这一类真调一次(哨兵拦下直写、副本承接 exec 写)。四档处置:supported 能推进 / read-only 只观测 / skipped-absent 缺席或缺主体 / skipped-unsafe 隔离不可用。范围只是本模块**声明的** 5 类,不冒充「扫过全仓引擎」">适配器表</button>
         <input id="wa-wl-advrounds" class="wa-input" placeholder="推几轮(默认 3,上限 12;超限会夹住并回带 clamped)"/>
         <button class="wa-btn" id="wa-wl-advance" title="只读 world:同一份副本按**声明顺序**累积推进 supported 的推进类;未支持的逐条如实处置。live 零写与种子前后一致两栏都是**实测差**">多引擎推进</button>
       </div>

       <div id="wa-wl-out" class="wa-out"></div>
      `)}
      ${foldSec('tools', 'capacity', '存储压力面与义务清点</div><div class="wa-dim">（O4：仓库还剩多少、哪些不能丢、能不能搬走）', () => `
      <div class="wa-dim">区分<b>可回收历史</b>与<b>不可丢义务</b>（在途货物 / 待履约条款 / 未结阶段 / 回执去重索引）——
        义务不静默挤出。水位来自 <code>store.sizeCaps()</code>（唯一真源），与「容量」页同源不另起一份。
        此刻：<b>${capOn() ? '开' : '关'}</b>（关闭时四栏一并拒收，读数一直空 —— 这与「还没跑过清点」不是一回事）。</div>
      <label class="wa-row"><input id="wa-cap-enabled" type="checkbox" ${capOn() ? 'checked' : ''}/> 启用存储压力面</label>
      <div class="wa-row">
        <button class="wa-btn" id="wa-cap-oblig" title="义务清点：十二源的未完成项（读口优先 —— 各模块自己的 pending()/overdue() 才是真源）">义务清点</button>
        <button class="wa-btn" id="wa-cap-water" title="水位栏：逐容器实占 / 声明上限 / 占比 / 站点。capDeclared 缺登记时如实报 null，不猜一个上限出来">水位</button>
        <button class="wa-btn" id="wa-cap-reclaim" title="可回收面：哪些容器里的行可以被挤出（历史类），哪些不行（义务类/在途/幂等真源）。只报不改">可回收</button>
        <button class="wa-btn" id="wa-cap-migrate" title="迁移预检：格式版本、未知顶层键、必填键缺失、陈旧站点 —— 只报不改，不改存档">迁移预检</button>
        <button class="wa-btn" id="wa-cap-diag" title="自证面：store / sizeCaps / evict / storageForecast 四源是否齐备">诊断</button>
      </div>
      <div id="wa-cap-out" class="wa-out"></div>
      `)}
      ${foldSec('tools', 'perfbase', '性能基线面与三档</div><div class="wa-dim">（O3：这一局属于哪一档、离冻结预算多远）', () => `
      <div class="wa-dim">档位<b>只认现场字节读数</b>（存档字节 + 已满容器数），不拍阈值 —— 拍出来的档位会与字节读数必然漂移。
        预算表是装载时对宿主 <code>perfTrace.CLASS_DEF</code> 的深拷贝，<b>每次读都比一次</b>（冻结不是抄一份），漂移当场可见。
        <b>实机采样栏一律留空</b>并列出必测项：把同机放大估计填进实测栏，下一个读者就再也分不出「手机上 60ms」与「桌上机估算 60ms」。
        此刻：<b>${pblOn() ? '开' : '关'}</b>。</div>
      <label class="wa-row"><input id="wa-pbl-enabled" type="checkbox" ${pblOn() ? 'checked' : ''}/> 启用性能基线面</label>
      <div class="wa-row">
        <button class="wa-btn" id="wa-pbl-bands" title="三档定义与当前档位：判据串一并与现场读数作对照，判不出时如实报 no-bytes（不默认成小局）">当前档位</button>
        <button class="wa-btn" id="wa-pbl-budget" title="冻结预算表：逐档预算与重复次数，并与装载时的冻结值逐项比对（drift 计数即漂移量）">预算表</button>
        <button class="wa-btn" id="wa-pbl-readings" title="未测面：哪些分层还没有现场样本（window=0 是「没测过」，不是「测了是 0」）">未测面</button>
        <button class="wa-btn" id="wa-pbl-gap" title="实机缺口：无头环境结构上测不到的那些项，逐条列出（不留估算占位）">实机缺口</button>
        <button class="wa-btn" id="wa-pbl-diag" title="自证面：store / perfTrace / perfLedger / renderPerf 四源是否齐备">诊断</button>
      </div>
      <div id="wa-pbl-out" class="wa-out"></div>
      <div id="wa-diag-out" class="wa-out"></div>
      `)}
      ${foldSec('tools', 'capability', '能力档位与启用面</div><div class="wa-dim">（自由选择启用模块与功能启用状态说明）', () => `
        // 读数在**段体内部**求值（OPT-9 的惰性约定）：收起态下这一整段不拼接，也就不读。
        // v2.274.0：段体改为**纯模板字面量**（与其余 13 段同形）。原先这里是语句块
        //   （箭头函数直接花括号 + 两条 const + return），语法正确但收尾是多一个闭合符，
        //   与另外 13 段不同形 ⇒ 按形态计数的门禁（q8 B1d）在本段只数到 13/14，
        //   那条「每段都有模板收尾」的纪律在本段等于空转。
        //   两条读数已上移到模板外做 lazy 辅助（stdSizeL / tierLiveHTMLL，见上文），
        //   故这里只剩模板本身。惰性不变：收起态整段不求值，两个辅助也就不会被调用。      <div class="wa-dim">三档的定义是<b>「这一档要求哪些引擎开着」</b>，不是「这一档有多强」：
        <b>lite</b> 一个都不额外开（只有出厂默认那几台在跑）；<b>standard</b> 按<b>静态白名单</b>逐名点开（${stdSizeL() === null ? '读不到' : stdSizeL()} 个世界机制）；<b>full</b> 承诺<b>「开得起来的世界」</b>：点开所有有驱动 WorldAxis 机制（运行时探测，已排除 35 个需手动录入数据的悬空机制）。
        <br>边界：档位<b>只收回自己开过的</b>（granted）。玩家自己手动开的，切档不会被关掉；出厂就开着的，永远不在 granted 里 —— 因此切回 lite 不会把出厂能力误关（这是本模块最容易写错的一处，已在源码里留注）。
        <br>此刻：<span id="wa-ct-live"><b>${tierLiveHTMLL()}</b></span></div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-ct-lite" title="一个都不额外开：只留出厂默认在跑的那几台。档位只收回自己开过的 —— 玩家手动开的不会被关掉">lite｜只留出厂</button>
        <button class="wa-btn" id="wa-ct-standard" title="静态白名单逐名点开：每一个都会真写一次并回读确认，开不动的不静默算成功，逐条列进 notEffective">standard｜常用一套</button>
        <button class="wa-btn" id="wa-ct-full" title="承诺开得起来的世界：点开所有有驱动的世界机制；下调移除需手动录入数据的悬空机制">full｜开得起来</button>
        <button class="wa-btn" id="wa-ct-rollback" title="退回上一档：栈里只装「启用面」的变更（不含玩家手动操作），最多 12 步，与规则包同规格">退回上一档</button>
      </div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-ct-view" title="只读：三档各自的名单规模与当前开着的个数，以及下一档还差几步（gap 是「离下一档还差几个要开的」，不是「离下一档有多远」这种模糊说法）">档位总览</button>
        <button class="wa-btn" id="wa-ct-list" title="只读：谁在跑 / 谁没跑 / 关着但有 buildBlock 的是哪些（点开会有内容的那些）">清单</button>
        <button class="wa-btn" id="wa-ca-audit" title="只读：关着的每一个为什么关着，三档归因 —— 出厂就没开 / 你自己关的 / 压根没有 buildBlock。判据直接读磁盘落盘原值，不经过 def 合并（否则「没表过态」与「表过态 false」分不开）">为什么关着</button>
        <button class="wa-btn" id="wa-ca-dormant" title="只读：关着、但开了会有内容的那批（不含 no-builder）—— 这是「你还能加多少能力」的实际可加量">可加能力</button>
      </div>
      <div class="wa-row">
        <button class="wa-btn" id="wa-ca-preview" title="只读：摘要长什么样 —— 勾上「带一行摘要」之后，每轮注入末尾会多这一行。先看再决定占不占额度">摘要预览</button>
        <button class="wa-btn" id="wa-ct-stat" title="自证面：两个引擎各自被调了多少次、失败几次、写了多少次盘 —— 这些数由引擎自己数，面板只转述（面板不另算一份）">引擎自证</button>
      </div>
      <label class="wa-row"><input id="wa-ca-summary" type="checkbox" ${capSummaryOn() ? 'checked' : ''}/> 在每轮注入末尾带一行启用面摘要<span class="wa-dim">（默认关 —— 摘要本身也占上下文，占不占由你定）</span></label>
      <div id="wa-ct-out" class="wa-out"></div>
      `)}
      </div>`;
  }
  // ══ 段体结束 ══
  const API = {
    renderTools: renderTools,
    bind: bind,
    ver: '2.401.0'
  };
  WA.panelToolsPage = API;
  if (typeof WA.registerModule === 'function') {
    WA.registerModule('ui/pages/tools-page.js', { kind: 'ui', ver: '2.401.0' });
  }
})();
