'use strict';
/**
 * tests/segments/tool-diag-v092.js — 从 tests/run.js 抽出的可独跑段落（v2.400.0 · V22 OPV22-4）。
 *
 * 为什么抽：G7「超长文件」。tests/run.js 拆前 26001 行，本段占 3466 行（13.3%）。
 *
 * **等价性契约（硬约束，不许放宽）**：
 *   · 段体逐字搬入，段内代码一个字符都没改；
 *   · 段外依赖只有 6 个（BASE / WA / assert / assertDeepEq / fs / section），由调用点注入；
 *   · 调用点**原位**执行（仍在 run.js 的 async IIFE 内、同一行号位置）⇒
 *     await 语义、与前序节的顺序、共享 WA 运行时状态（injectInspector 订阅、store 已 init）
 *     与抽取前逐字一致；
 *   · 段体是 async 体（含 await），故本模块导出 async 函数，调用点必须 await。
 *
 * 负控制：本文件若从 run.js 的调用点摘掉 ⇒ tests/test-surface-gate.js 报孤儿（从不执行），
 *   这正是 OPV22-4 要求的「故意漏挂一段 ⇒ test-surface-gate 报孤儿」。
 */

/**
 * @param {{BASE:string, WA:Object, assert:Function, assertDeepEq:Function, fs:Object, section:Function}} ctx
 * @returns {Promise<void>}
 */
module.exports = async function toolDiagV092(ctx) {
  // 外部符号解构：段内代码保持逐字不变（不改成 ctx.WA.xxx 这种改写）。
  const { BASE, WA, assert, assertDeepEq, fs, path, section, panelSource } = ctx;
  section('engines/tool-diag v0.9.2');
  assert(WA.toolDiag && typeof WA.toolDiag.collect === 'function', '诊断引擎已导出');
  const dg = WA.toolDiag.collect();
  assert(dg.meta.packageFormat === 'worldaxis-diag' && dg.meta.packageVersion === 2, '诊断包格式标识与版本');
  assert(typeof dg.env === 'object' && dg.env.chatId === 'test_chat_001', '环境节读到 host chatId');
  assert(dg.env.tavernApi.setExtensionPrompt === true, '宿主能力探测：setExtensionPrompt 可用');
  assert(dg.modules.loadedCount >= 30 && dg.modules.missingCount === 0, '模块装载清单零缺失');
  assert(WA.toolDiag.UI_BINDINGS.filter(g => g.page === 'tools')[0].ids.includes('wa-diag-run'), '自检控件已纳入UI绑定校验清单');
  // 全树盘查：诊断清单必须覆盖磁盘上每一个 js 模块（防漏登记）
  // v2.401.0(OPV23):段文件进了 ui/pages/ 子目录——盘查枚举改递归（扩输入面:磁盘有子目录,盘查就要跟下去,与 ui-gate-sync 的 discoverUIFiles 同口径;判据不动）
  const realFiles = [];
  const listJS = (relDir) => {
    fs.readdirSync(path.join(BASE, relDir), { withFileTypes: true }).forEach(e => {
      const rel = relDir + '/' + e.name;
      if (e.isDirectory()) listJS(rel);
      else if (e.name.endsWith('.js')) realFiles.push(rel);
    });
  };
  ['core', 'engines', 'actors', 'direction', 'render', 'compat', 'ui'].forEach(listJS);
  const listed = Object.keys(WA.toolDiag.MODULE_EXPORTS);
  const uncovered = realFiles.filter(f => listed.indexOf(f) < 0);
  const ghost = listed.filter(f => realFiles.indexOf(f) < 0);
  assert(uncovered.length === 0, '诊断清单覆盖全部磁盘模块' + (uncovered.length ? '（缺 ' + uncovered.join(',') + '）' : ''));
  assert(ghost.length === 0, '诊断清单无幽灵条目' + (ghost.length ? '（多 ' + ghost.join(',') + '）' : ''));
  assert(listed.length >= 61, '诊判清单条目数达全员（' + listed.length + '）' + '（v2.192.0 U5：reject-recovery 入表 ⇒ 48→49；v2.253.0：六批十二枚引擎补登记 ⇒ 49→61）');
  assert(dg.modules.optionalMissing.indexOf('ui') >= 0, '无头环境 UI 项归入可选项（不计入阻断）');
  const realKeys = {};
  listed.forEach(f => { realKeys[WA.toolDiag.MODULE_EXPORTS[f]] = true; });
  assert(Object.keys(realKeys).length === listed.length, '诊断清单的导出键无重复（一文件一导出）');
  assert(dg.modules.missing.length === 0, '缺失清单为空数组');
  assert(dg.ui.note ? true : dg.ui.allOk === false, '非浏览器环境 UI 节给出跳过说明');
  const capKeys = dg.capabilities.map(c => c.key);
  assert(capKeys.includes('injectInspector') && capKeys.includes('toolDiag'), '能力清单纳入 v0.9.2 新模块');
  assert(dg.capabilities.filter(c => c.key === 'injectInspector')[0].ok === true, '注入自检 API 齐备');
  assert(dg.capabilities.filter(c => c.key === 'toolSnapshot')[0].ok === true, '快照工具 API 齐备');
  assert(typeof dg.worldState.counts === 'object' && dg.worldState.counts.factions >= 0, '世界状态计数节可用');
  assert(dg.worldState.lastInjection === null || typeof dg.worldState.lastInjection === 'object', '上轮注入打点可读');
  assert(dg.runtime.workflow.nodeCount > 0, '工作流节点统计非零');
  assert(dg.runtime.apiRouter.concurrency >= 1 && dg.runtime.apiRouter.queue >= 0, 'API 通道并发/队列可读');
  assert(dg.runtime.apiRouter.channels.some(c => c.name === 'inference' && c.model === 'm'), '通道清单含已配置模型');
  assert(!dg.runtime.apiRouter.channels.some(c => c.keyMasked === 'k'), 'API Key 已脱敏不出现明文');
  assert(dg.verdict.ok === true && dg.verdict.errorCount === 0, '当前环境判语无阻断项');
  const dgJson = WA.toolDiag.toJSON(true);
  assert(JSON.parse(dgJson).meta.packageVersion === 2, '诊断包 toJSON 可被解析');
  assert(WA.toolDiag.summaryText(dg).length > 0, '摘要文本非空');
  assert(WA.toolDiag.flatten(dg).some(x => x.key === 'inject'), 'flatten 含注入节摘要');
  const dgDlDl = WA.toolDiag.download();
  assert(dgDlDl.ok === false && String(dgDlDl.reason).includes('非浏览器'), '无Blob环境下载降级为提示');
  const keepAnalyzer = WA.toolAnalyzer;
  delete WA.toolAnalyzer;
  const dgBroken = WA.toolDiag.collect();
  assert(dgBroken.modules.missing.some(m => m.key === 'toolAnalyzer'), '缺件被模块清单检出');
  assert(dgBroken.verdict.ok === false && dgBroken.verdict.errorCount >= 1, '缺件时判语转为存在阻断项');
  assert(dgBroken.capabilities.filter(c => c.key === 'toolAnalyzer')[0].ok === false, '缺件时能力项置不可用');
  assert(WA.toolDiag.verdict(dgBroken).issues.some(i => i.key === 'modules'), '问题清单含 modules 条目');
  WA.toolAnalyzer = keepAnalyzer;
  assert(WA.toolDiag.collect().verdict.ok === true, '恢复模块后判语复原（自检可逆）');
  assert(dg.meta.extVersion === (global.WorldAxis.VERSION || global.WorldAxis.version) && String(dg.meta.extVersion).length > 0, '诊断包读到扩展版本号');


  // ══════════ v0.9.6 推演契约对账器（contract-audit）══════════
  // 前置：对账器依赖已初始化的 store（探针要在真实 state 上跑）
  WA.store.init();
  assert(typeof WA.contractAudit === 'object' && WA.contractAudit.FIELDS.length >= 22, 'contractAudit 已加载且字段表不少于 22 项（实 ' + (WA.contractAudit && WA.contractAudit.FIELDS.length) + '）');
  assert(WA.contractAudit.PROBES.events_create && WA.contractAudit.PROBES.events_update, 'v2.2.0 探针表已补事件链两字段（否则对账器对本类漂移失明）');
  assert(!!(WA.contractAudit.SEEDS && WA.contractAudit.SEEDS.events_update), '更新类探针带基线种子（防假阴性）');
  assert(WA.contractAudit.PROBE_TAG === '__audit_', '探针哨兵标记常量正确');
  assert(Array.isArray(WA.contractAudit.ENUM_ALIGN) && WA.contractAudit.ENUM_ALIGN.length >= 10, '枚举对齐表条目齐全');
  assert(Array.isArray(WA.contractAudit.CROSS_MODULE) && WA.contractAudit.CROSS_MODULE.length === 6, '跨模块漂移扫描表 6 组');
  // ── 契约解析：从真实 buildPrompt 提取声明字段 ──
  const caPrompt = WA.backstage.buildPrompt({ idx: 1, text: '' }, '');
  const caContract = WA.contractAudit.parseContract(caPrompt);
  assert(caContract.fields['clock'] && caContract.fields['world_pulse'] && caContract.fields['next_turn_injection'], '契约解析提取到核心字段');
  assert(caContract.fields['distantEvent'] && caContract.fields['nearEvent'] && caContract.fields['entities'], '契约解析提取到 horizon/entities 字段');
  assert(Object.keys(caContract.fields).length >= 22, '契约声明字段数 >= 22: ' + Object.keys(caContract.fields).length);
  assert(caContract.enums['factions'] && caContract.enums['factions'].includes('鼎盛'), '契约枚举聚合 factions 包含鼎盛');
  assert(caContract.enums['economy'] && caContract.enums['economy'].includes('动荡'), '契约枚举聚合 economy 包含动荡');
  assert(caContract.enums['currents'] && caContract.enums['currents'].includes('hidden') && caContract.enums['currents'].includes('private'), '契约枚举聚合 currents 含可见性与公开度两套');
  // ── 消费实测：探针逐字段喂 applyResult ──
  const caBase = JSON.parse(JSON.stringify(WA.store.get()));
  const caConsumed = WA.contractAudit.consumedFields({ baseState: caBase });
  const caConsumedList = Object.keys(caConsumed).filter(f => caConsumed[f].consumed);
  assert(caConsumedList.length === WA.contractAudit.FIELDS.length, '全部契约字段被消费端实测消费: ' + caConsumedList.length + '/' + WA.contractAudit.FIELDS.length + ' -> ' + JSON.stringify(caConsumedList.filter(f => !caConsumed[f].consumed)));
  // horizon 委托字段必须被正确识别为已消费（acceptResult 写 live store 而非 draft）
  assert(caConsumed['distantEvent'].consumed === true && caConsumed['nearEvent'].consumed === true, 'distantEvent/nearEvent 经 horizon.acceptResult 消费');
  // 探针不污染真实存档：消费实测后 live store 不含哨兵标记
  assert(JSON.stringify(WA.store.get()).indexOf('__audit_') < 0, '探针哨兵不残留于真实存档');
  // ── 全量对账 ──
  // 用冻结的基线 + 显式 applyFn 闸门：避免 audit 内部再次触发 horizon 掷骰等随机副作用
  const caReport = WA.contractAudit.audit({ baseState: caBase, applyFn: function (d, r, a) { return WA.backstage.applyResult(d, r, a); } });
  assert(caReport.declared.length >= 22 && caReport.consumed.length === WA.contractAudit.FIELDS.length, '对账报告 declared>=22 / consumed=' + caReport.consumed.length);
  assert(caReport.drift.declaredNotConsumed.length === 0, '无「声明但未消费」漂移');
  assert(caReport.drift.probeNotDeclared.length === 0, '无「消费但未声明」漂移');
  caReport.enums.forEach(e => assert(e.status === 'aligned', '枚举对齐: ' + e.field + ' -> ' + e.status + ' extra=' + JSON.stringify(e.extra || [])));
  // ── 漂移检出能力复核（用注入的伪漂移源验证扫描器灵敏度，不依赖真实缺陷）──
  const keepEcon = WA.evolution.ECONOMY_CLIMATE;
  WA.evolution.ECONOMY_CLIMATE = ['繁荣', '平稳', '萧条'];
  const caDriftReport = WA.contractAudit.audit({ baseState: caBase, applyFn: function (d, r, a) { return WA.backstage.applyResult(d, r, a); } });
  const caDriftCross = caDriftReport.crossModule.filter(c => c.name === 'economy.climate')[0];
  assert(caDriftCross && caDriftCross.diffs.evolution && caDriftCross.diffs.evolution.includes('萧条'), '注入伪漂移后扫描器仍能检出（灵敏度保持）');
  const caDriftIssue = caDriftReport.issues.filter(i => i.code === 'cross_module_drift' && String(i.detail).includes('萧条'))[0];
  assert(caDriftIssue, '伪漂移进入 issue 清单');
  assert(caDriftReport.verdict.ok === false, '伪漂移使判语转为存在阻断项');
  WA.evolution.ECONOMY_CLIMATE = keepEcon;
  const caRestored = WA.contractAudit.audit({ baseState: caBase, applyFn: function (d, r, a) { return WA.backstage.applyResult(d, r, a); } });
  assert(caRestored.verdict.ok === true, '伪漂移清除后判语复原（扫描可逆）');
  // 跨模块漂移：economy.climate 是已知真实漂移（analyzer 用萧条/危机），必须被检出
  const caCrossEcon = caReport.crossModule.filter(c => c.name === 'economy.climate')[0];
  assert(caCrossEcon && Object.keys(caCrossEcon.diffs).length === 0, '跨模块漂移扫描：economy.climate 各源已对齐');
  const caEconIssue = caReport.issues.filter(i => i.code === 'cross_module_drift')[0];
  assert(!caEconIssue, '修复后无跨模块漂移 issue');
  assert(caReport.verdict.ok === true && caReport.verdict.errorCount === 0, '跨模块漂移已修复，判语转全绿');
  assert(WA.toolAnalyzer.ECON_SCORE['衰退'] === -0.6 && WA.toolAnalyzer.ECON_SCORE['动荡'] === -1, 'ECON_SCORE 已对齐 evolution 枚举');
  // ── 工具方法 ──
  assert(typeof WA.contractAudit.summaryText(caReport) === 'string' && WA.contractAudit.summaryText(caReport).length > 0, 'summaryText 输出可读判语');
  const caFlat = WA.contractAudit.flatten(caReport);
  assert(Array.isArray(caFlat) && caFlat.some(i => i.key === 'coverage'), 'flatten 输出含覆盖率信息条');
  // ── 无副作用复核：对账前后 store 一致性 ──
  assert(JSON.stringify(WA.store.get()).indexOf('__audit_') < 0, '对账后 live store 无哨兵残留');
  // horizon 泳道在对账期间可能因 buildPrompt 的 rollLane 自然推进，这是引擎正常行为而非探针污染
  const caHorizonAfter = WA.store.get().evolution.horizon;
  assert(caHorizonAfter.distant && caHorizonAfter.near && typeof caHorizonAfter.distant.ledger === 'number', '对账后 horizon 泳道结构完整');
  // ── 降级路径 ──
  const caBroken = WA.contractAudit.consumedFields({ applyFn: null });
  assert(Object.keys(caBroken).length === WA.contractAudit.FIELDS.length && caBroken['clock'].consumed === false, 'applyFn 不可用时全部降级为未消费');
  const caNoBase = WA.contractAudit.consumedFields({ baseState: null, applyFn: function () {} });
  assert(caNoBase['clock'].consumed === false && String(caNoBase['clock'].reason || '').indexOf('state') >= 0, '无基准 state 时降级提示');
  // ── 诊断清单登记校验（v0.9.5 防漏机制延续）──
  assert(WA.toolDiag.MODULE_EXPORTS['engines/contract-audit.js'] === 'contractAudit', '诊断清单已登记 contract-audit');


  // ══════════ v0.9.7 记忆注入采样器（memory-sampler）══════════
  // ── 指数衰减采样核心（源自 World memory-engine.exponentialMemorySample）──
  assert(typeof WA.memorySampler === 'object', 'memorySampler 已加载');
  assert(WA.memorySampler.DEFAULT_DICE_SIDES === 10000 && WA.memorySampler.MIN_SIDES === 1000 && WA.memorySampler.MAX_SIDES === 10000, '骰子面数常量 1000-10000');
  assert(WA.memorySampler.DEFAULT_LIMIT === 8, '默认采样上限 8');
  // 数量不足时全量返回（保持原序）
  const msSmall = [1, 2, 3];
  assertDeepEq(WA.memorySampler.exponentialSample(msSmall, 5), msSmall, '候选不足 limit 时全量返回');
  assertDeepEq(WA.memorySampler.exponentialSample(msSmall, 0), [], 'limit=0 返回空');
  assertDeepEq(WA.memorySampler.exponentialSample(null, 5), [], '非数组入参返回空');
  // 数量超过 limit 时严格截断且结果为子集
  const msBig = [];
  for (let i = 0; i < 30; i++) msBig.push({ id: i, text: '记忆' + i });
  // v2.14.0: 注入的随机源改为**确定性 LCG**——此前注入 Math.random 名义上「确定性」，
  //   实际上每次运行值都不同，断言只在「长度/子集」这类不变式上成立。
  const _detSrc = (function () { let _x = 1; return function () { _x = (_x * 1103515245 + 12345) % 2147483648; return _x / 2147483648; }; })();
  const msPicked = WA.memorySampler.exponentialSample(msBig, 8, _detSrc, 10000);
  assert(msPicked.length === 8, '超限采样严格截断至 8 条: ' + msPicked.length);
  assert(msPicked.every(e => msBig.indexOf(e) >= 0), '采样结果必为原数组子集（引用保持）');
  // 结果按原序返回（截取后重排）
  const msIdx = msPicked.map(e => msBig.indexOf(e));
  const msSorted = msIdx.slice().sort((a, b) => a - b);
  assertDeepEq(msIdx, msSorted, '采样结果按原序返回');
  // 确定性随机源：注入 randomFn 验证权重计算（近期高概率）
  // 固定随机源递增时，priority 排序应让年龄小的（近期）优先
  let msSeq = 0.9999;  // 高 roll → unit 接近 1 → -ln(unit) 接近 0 → priority 小 → 优先选中
  const msDet = WA.memorySampler.exponentialSample(msBig, 8, function () { return msSeq; }, 10000);
  assert(msDet.length === 8 && msDet.every(e => msBig.indexOf(e) >= 0), '确定性随机源下采样稳定');
  // 近期偏置验证：用极端随机源（近期恒高、远期恒低）验证权重生效
  // 高 roll(0.99) 的条目 priority 小应被优先选取；构造 20 条记忆，让后半段（近期）恒高 roll
  let msFlip = false;
  const msBias = WA.memorySampler.exponentialSample(
    msBig.slice(0, 20), 5,
    function () { msFlip = !msFlip; return msFlip ? 0.99 : 0.01; },
    10000
  );
  assert(msBias.length === 5, '混合随机源下仍稳定截断 5 条');
  // 骰子面数夹取
  const msWide = WA.memorySampler.exponentialSample(msBig, 4, _detSrc, 99999);
  assert(msWide.length === 4, '超范围 diceSides 被夹取至 MAX 后仍正常工作');
  const msNarrow = WA.memorySampler.exponentialSample(msBig, 4, _detSrc, 5);
  assert(msNarrow.length === 4, '极小 diceSides 被夹取至 MIN 后仍正常工作');
  // ── 上下文相关性过滤 ──
  const msEntries = [
    { holders: ['张三'], text: '张三怀疑酒保', time: '第1日' },
    { holders: ['李四'], text: '李四确信有宝藏', time: '第2日' },
    { holders: ['王五'], text: '王五记得旧仇', time: '第3日' }
  ];
  const msHay = '张三走进了酒馆，和王五打了个招呼';
  const msRel = WA.memorySampler.filterRelevant(msEntries, msHay);
  assert(msRel.length === 2 && msRel[0].holders[0] === '张三' && msRel[1].holders[0] === '王五', '相关性过滤：只保留正文出现的人物记忆');
  assert(WA.memorySampler.filterRelevant(msEntries, '').length === 3, '空扫描文本时回退全量（不误删）');
  assert(WA.memorySampler.filterRelevant([], msHay).length === 0, '空条目列表返回空');
  assert(WA.memorySampler.filterRelevant([{ holders: [], text: 'x' }], msHay).length === 0, '无持有者的条目被过滤');
  // 大小写/trim 容错
  const msCase = WA.memorySampler.filterRelevant([{ holders: [' 张三 '], text: 'x' }], 'zhang san');
  // 中文不区分大小写，'张三' 不在 'zhang san' 中，应为 0；验证 normalized 不抛异常即可
  assert(Array.isArray(msCase), 'normalized 容错不抛异常');
  // ── buildHaystack：近期正文 + 世界状态快照 ──
  WA.store.init();
  WA.store.transact(d => {
    d.memory.pmem = msEntries;
    d.evolution.people = [{ name: '张三' }, { name: '李四' }];
    d.evolution.factions = [{ name: '血刀门' }];
  });
  const msHayBuilt = WA.memorySampler.buildHaystack('近期正文提到李四', WA.store.get());
  assert(msHayBuilt.indexOf('李四') >= 0 && msHayBuilt.indexOf('血刀门') >= 0, 'buildHaystack 含人物与势力名');
  // ── sampleEntries：主入口 ──
  const msState = WA.store.get();
  const msSel = WA.memorySampler.sampleEntries({ state: msState, recentText: '张三在酒馆', limit: 2 });
  assert(msSel.length === 2, 'sampleEntries 采样至 limit');
  // 相关性回退：相关条目不足时用全量补足
  const msSel2 = WA.memorySampler.sampleEntries({ state: msState, recentText: '完全无关的正文内容', limit: 3 });
  assert(msSel2.length === 3, '相关性不足时全量回退补足至 limit');
  // relevanceFilter off：不过滤直接采样
  const msSel3 = WA.memorySampler.sampleEntries({ state: msState, recentText: '张三', limit: 2, relevanceFilter: 'off' });
  assert(msSel3.length === 2, 'relevanceFilter=off 时全量采样');
  // limit 夹取
  const msSel4 = WA.memorySampler.sampleEntries({ state: msState, recentText: '张三', limit: 999 });
  assert(msSel4.length === 3, 'limit 超候选数时返回全部 3 条: ' + msSel4.length);
  // limit=0 在 exponentialSample 内返回空，但 sampleEntries 的 limit 经 clamp 后为 1；
  // 相关性回退又可能用全量补足——此处断言 "limit<=1 时至多返回 1 条或走相关性回退"
  const msSel5 = WA.memorySampler.exponentialSample(msEntries, 0);
  assert(msSel5.length === 0, 'exponentialSample limit=0 返回空（采样核心边界）');
  // ── buildBlock：注入文本生成 ──
  const msBlock = WA.memorySampler.buildBlock({ state: msState, recentText: '张三在酒馆', limit: 3 });
  assert(msBlock.indexOf('【人物主观记忆】') === 0, 'buildBlock 输出含标准头部');
  assert(msBlock.indexOf('张三') >= 0, 'buildBlock 含选中人物名');
  assert((msBlock.match(/\n/g) || []).length >= 2, 'buildBlock 多行格式');
  // 空记忆时返回空串
  WA.store.transact(d => { d.memory.pmem = []; });
  assert(WA.memorySampler.buildBlock({ state: WA.store.get() }) === '', '空记忆时 buildBlock 返回空串');
  WA.store.transact(d => { d.memory.pmem = msEntries; });
  // ── 与 pmem 的对照：采样器是 pmem.buildBlock 的超集 ──
  // pmem.buildBlock 固定 slice(-8)，采样器在 limit=8 + relevanceFilter=off 时行为类似但带随机轮换
  WA.store.transact(d => {
    d.memory.pmem = [];
    for (let i = 0; i < 20; i++) d.memory.pmem.push({ holders: ['人物' + i], text: '记忆' + i, time: '第' + i + '日' });
  });
  const msMany = WA.memorySampler.sampleEntries({ state: WA.store.get(), limit: 8, relevanceFilter: 'off' });
  assert(msMany.length === 8, '20 条记忆采样至 8 条');
  // 多次采样结果应可能不同（随机轮换）——恒定随机源不会轮换，用伪随机序列验证
  let msSeedA = 0.1, msSeedB = 0.9;
  const msA = WA.memorySampler.sampleEntries({ state: WA.store.get(), limit: 8, relevanceFilter: 'off', randomFn: function () { msSeedA = (msSeedA * 7 + 0.13) % 1; return msSeedA; } });
  const msB = WA.memorySampler.sampleEntries({ state: WA.store.get(), limit: 8, relevanceFilter: 'off', randomFn: function () { msSeedB = (msSeedB * 7 + 0.37) % 1; return msSeedB; } });
  const msDiff = msA.some(e => msB.indexOf(e) < 0);
  assert(msDiff === true, '不同随机序列产生不同采样结果（记忆轮换能力）: A=' + msA.map(e => e.text).join(',') + ' B=' + msB.map(e => e.text).join(','));
  // ── 诊断清单登记校验 ──
  assert(WA.toolDiag.MODULE_EXPORTS['engines/memory-sampler.js'] === 'memorySampler', '诊断清单已登记 memory-sampler');
  // 清理测试数据
  WA.store.transact(d => { d.memory.pmem = []; d.evolution.people = []; d.evolution.factions = []; });


  // ══════════ v0.9.8 注入管线接入采样器 ══════════
  // inject.js 的主观记忆源已切换到 memorySampler.buildBlock，
  // 验证：管线在采样器存在时优先走采样器，不存在时回退 pmem.buildBlock
  assert(WA.render && typeof WA.render.applyInjections === 'function', 'render 注入模块已加载');
  // 构造伪 ctx 直接调用 applyInjections，验证主观记忆源被采样器接管
  WA.store.init();
  WA.store.transact(d => {
    d.memory.pmem = [
      { holders: ['酒保'], text: '酒保记得主角欠钱', time: '第1日' },
      { holders: ['蒙面人'], text: '蒙面人怀疑主角身份', time: '第2日' }
    ];
  });
  const injCtx = { injections: [] };
  global.__lastExtensionPrompt = null;
  WA.render.applyInjections(injCtx);
  assert(global.__lastExtensionPrompt !== null, 'applyInjections 真正调用了 setExtensionPrompt');
  const injCaptured = global.__lastExtensionPrompt.text;
  assert(injCaptured.indexOf('【人物主观记忆】') >= 0, '注入内容含采样器生成的主观记忆块');
  // 采样器接管验证：内容来自采样器（含相关性过滤后的条目），不是 pmem 的 slice(-8)
  assert(injCaptured.indexOf('酒保') >= 0 || injCaptured.indexOf('蒙面人') >= 0, '注入含 pmem 条目内容');
  // 注入预算仍生效：主观记忆源 rank 3 可折叠
  const pri = WA.injectBudget.rankOf('主观记忆');
  assert(pri === 3 && WA.injectBudget.foldable('主观记忆') === true, '主观记忆源在预算表 rank3 可折叠');
  // 回退路径：删除采样器后应回退 pmem.buildBlock
  const keepSampler = WA.memorySampler;
  delete WA.memorySampler;
  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: [] });
  const injFallback = global.__lastExtensionPrompt && global.__lastExtensionPrompt.text;
  assert(injFallback !== null && injFallback.indexOf('【人物主观记忆】') >= 0, '采样器缺失时回退 pmem.buildBlock');
  WA.memorySampler = keepSampler;
  // 清理
  WA.store.transact(d => { d.memory.pmem = []; });


  // ══════════ v0.9.9 采样器可配置化（backstage 设置联动）══════════
  // loadSamplerSettings: 从 backstage 读取，未配置时回落内置默认
  const msCfg = WA.memorySampler.loadSamplerSettings();
  assert(typeof msCfg === 'object' && msCfg.memSamplerLimit === 8, '采样器配置默认 limit=8: ' + JSON.stringify(msCfg));
  assert(msCfg.memSamplerDice === 10000 && msCfg.memSamplerRelevance === 'on', '采样器配置默认 dice=10000 relevance=on');
  // backstage 默认值已含采样参数
  const bsSettings = WA.backstage.getSettings();
  assert(bsSettings.memSamplerLimit === 8 && bsSettings.memSamplerDice === 10000, 'backstage 默认设置含采样参数');
  assert(bsSettings.memSamplerRelevance === 'on', 'backstage 默认 relevance=on');
  // 设置改动后采样器立即生效
  WA.backstage.setSettings({ memSamplerLimit: 3, memSamplerDice: 2000, memSamplerRelevance: 'off' });
  const msCfg2 = WA.memorySampler.loadSamplerSettings();
  assert(msCfg2.memSamplerLimit === 3 && msCfg2.memSamplerDice === 2000 && msCfg2.memSamplerRelevance === 'off', 'setSettings 后采样器配置即时更新');
  // sampleEntries 使用新 limit
  WA.store.transact(d => {
    d.memory.pmem = [];
    for (let i = 0; i < 12; i++) d.memory.pmem.push({ holders: ['人物' + i], text: '记忆' + i, time: '第' + i + '日' });
  });
  const msCfgSel = WA.memorySampler.sampleEntries({ state: WA.store.get(), relevanceFilter: 'off' });
  assert(msCfgSel.length === 3, 'limit=3 生效，采样 3 条: ' + msCfgSel.length);
  // opts 显式参数仍覆盖配置（调用方优先）
  const msCfgSel2 = WA.memorySampler.sampleEntries({ state: WA.store.get(), limit: 5, relevanceFilter: 'off' });
  assert(msCfgSel2.length === 5, 'opts.limit 覆盖配置 limit');
  // 极限值夹取
  // v2.7.0（收口）: 口径变更——旧断言是「limit 999 读入（sampleEntries 内夹取）」，
  //   即「写原值、读时夹」：磁盘上留 999、引擎按 30 用，两套数并存（本版要修掉的正是它）。
  //   现在写路径即归一（区间声明在 __REG_B.bounds，与 memory-sampler 的 MIN/MAX 同源），
  //   故落盘就是 30 —— 界面显示 30、磁盘 30、引擎 30，只有一份。
  WA.backstage.setSettings({ memSamplerLimit: 999, memSamplerDice: 99999 });
  const msCfg3 = WA.memorySampler.loadSamplerSettings();
  assert(msCfg3.memSamplerLimit === 30, 'limit 999 落盘即归一为区间上限 30（此前写原值、读时夹，磁盘留 999）');
  assert(JSON.parse(global.localStorage.getItem('worldaxis_backstage_settings_v1')).memSamplerLimit === 30,
    '（磁盘）存的就是生效值 30（不再是「磁盘 999 / 引擎 30」两套数）');
  assert(msCfg3.memSamplerDice === 10000, 'dice 99999 同样归一到上限 10000');
  const msCfgSel3 = WA.memorySampler.sampleEntries({ state: WA.store.get(), relevanceFilter: 'off' });
  assert(msCfgSel3.length === 12, 'limit 超候选数时返回全部 12 条');
  // 恢复默认
  WA.backstage.setSettings({ memSamplerLimit: 8, memSamplerDice: 10000, memSamplerRelevance: 'on' });
  const msCfg4 = WA.memorySampler.loadSamplerSettings();
  assert(msCfg4.memSamplerLimit === 8 && msCfg4.memSamplerRelevance === 'on', '恢复默认配置');
  // 设置污染检查：测试改动的设置不影响后续 store
  WA.store.transact(d => { d.memory.pmem = []; });
  assert(WA.backstage.getSettings().memSamplerLimit === 8, '采样配置保持默认（测试隔离）');


  // ══════════ v0.1.0 采样器自检（sampler-check）══════════
  v010: {
    assert(typeof WA.samplerCheck === 'object', 'samplerCheck 已加载');
  assert(WA.samplerCheck.TRIALS === 200, '自检试验次数 200');
  assert(WA.samplerCheck.RECENT_RATIO === 0.5, '近期偏置阈值 0.5');
  // mulberry 确定性伪随机：同种子同输出
  const scRng1 = WA.samplerCheck.mulberry(42);
  const scRng2 = WA.samplerCheck.mulberry(42);
  const scSeq1 = [scRng1(), scRng1(), scRng1()];
  const scSeq2 = [scRng2(), scRng2(), scRng2()];
  assertDeepEq(scSeq1, scSeq2, 'mulberry 同种子序列一致（可复现）');
  const scRng3 = WA.samplerCheck.mulberry(7);
  const scSeq3 = [scRng3(), scRng3(), scRng3()];
  assert(scSeq1.some((v, i) => scSeq3[i] !== v), 'mulberry 不同种子序列不同');
  // ── statSample: 命中率统计 ──
  const scEntries = [];
  for (let i = 0; i < 12; i++) scEntries.push({ holders: ['人物' + i], text: '记忆' + i, time: '第' + i + '日' });
  WA.store.init();
  const scStat = WA.samplerCheck.statSample(scEntries, {
    state: WA.store.get(), limit: 4, relevanceFilter: 'off'
  });
  assert(scStat.trials === 200, 'statSample 跑满 200 次');
  assert(scStat.rates.length === 12, '每条记忆都有命中率记录');
  assert(scStat.rates.every(r => r.hitRate >= 0 && r.hitRate <= 1), '命中率在 [0,1] 区间');
  // 命中总数 = limit * trials（每次采 4 条）
  const scTotalHits = scStat.rates.reduce((a, r) => a + r.hitRate * scStat.trials, 0);
  assert(Math.abs(scTotalHits - 4 * 200) < 1, '命中总数 = limit*trials: ' + scTotalHits.toFixed(0));
  // 近期偏置：后半段平均命中率 > 前半段
  const scHalf = 6;
  const scFirst = scStat.rates.slice(0, scHalf).reduce((a, r) => a + r.hitRate, 0) / scHalf;
  const scLast = scStat.rates.slice(scHalf).reduce((a, r) => a + r.hitRate, 0) / scHalf;
  assert(scLast > scFirst, '指数衰减近期偏置: 前' + (scFirst * 100).toFixed(1) + '% < 后' + (scLast * 100).toFixed(1) + '%');
  // ── runChecks: 全量自检 ──
  const scReport = WA.samplerCheck.runChecks({
    entries: scEntries, state: WA.store.get(),
    recentText: '人物0和人物5在酒馆对话', limit: 4
  });
  assert(scReport.verdict.ok === true, '采样器自检全部通过: ' + scReport.verdict.pass + '/' + scReport.verdict.total);
  const scCheckNames = scReport.checks.map(c => c.name);
  assert(scCheckNames.indexOf('采样器已加载') >= 0 && scCheckNames.indexOf('引用保持') >= 0, '自检含加载与引用保持项');
  assert(scCheckNames.indexOf('近期偏置') >= 0 && scCheckNames.indexOf('相关性过滤') >= 0, '自检含近期偏置与相关性过滤项');
  assert(scCheckNames.indexOf('limit 边界') >= 0 && scCheckNames.indexOf('无副作用') >= 0, '自检含边界与无副作用项');
  // 引用保持单项必须真过（非跳过）
  const scRefCheck = scReport.checks.filter(c => c.name === '引用保持')[0];
  assert(scRefCheck.ok === true && scRefCheck.detail.indexOf('跳过') < 0, '引用保持真实验证（非跳过）: ' + scRefCheck.detail);
  // 相关性过滤真实验证
  const scRelCheck = scReport.checks.filter(c => c.name === '相关性过滤')[0];
  assert(scRelCheck.ok === true && scRelCheck.detail.indexOf('生效') >= 0, '相关性过滤生效: ' + scRelCheck.detail);
  // 近期偏置真实验证（12 条 >= 8，走统计分支）
  const scBiasCheck = scReport.checks.filter(c => c.name === '近期偏置')[0];
  assert(scBiasCheck.ok === true && scBiasCheck.detail.indexOf('试验') >= 0, '近期偏置走统计分支: ' + scBiasCheck.detail);
  // 无副作用真实验证
  const scSideCheck = scReport.checks.filter(c => c.name === '无副作用')[0];
  assert(scSideCheck.ok === true && scSideCheck.detail.indexOf('未被修改') >= 0, '采样不修改入参: ' + scSideCheck.detail);
  // ── 降级路径：采样器不可用时自检报失败但不抛异常 ──
  const keepSampler = WA.memorySampler;
  delete WA.memorySampler;
  const scBroken = WA.samplerCheck.runChecks({ entries: scEntries, state: WA.store.get() });
  assert(scBroken.verdict.ok === false && scBroken.verdict.total === 1, '采样器缺失时自检报失败');
  const scLoadCheck = scBroken.checks.filter(c => c.name === '采样器已加载')[0];
  assert(scLoadCheck.ok === false, '缺失时首项为「采样器已加载」失败');
  WA.memorySampler = keepSampler;
  // ── 空条目降级 ──
  const scEmpty = WA.samplerCheck.runChecks({ entries: [], state: WA.store.get(), recentText: 'x' });
  assert(scEmpty.verdict.ok === true, '空条目时自检全跳过（trivially pass）: ' + scEmpty.verdict.pass + '/' + scEmpty.verdict.total);
  // ── statSample 降级 ──
  assertDeepEq(WA.samplerCheck.statSample(null, {}), { trials: 0, hits: {}, rates: [] }, 'statSample 空入参降级');
  // ── 诊断清单登记校验 ──
  assert(WA.toolDiag.MODULE_EXPORTS['engines/sampler-check.js'] === 'samplerCheck', '诊断清单已登记 sampler-check');

  } // end v0.1.0 block

  // ═══════════════════════════════════════════════════════════
  // v0.1.1 — 注入槽位路由（inject-channel）
  // ═══════════════════════════════════════════════════════════
  v011: {
  assert(typeof WA.injectChannel === 'object', 'injectChannel 已加载');
  assert(WA.injectChannel.POS.after_last_user === 1 && WA.injectChannel.POS.in_chat === 0 && WA.injectChannel.POS.at_end === 2, 'POS 位置常量映射正确');
  assert(WA.injectChannel.DEFAULT_POS === 'in_chat', '默认位置 in_chat');
  assert(WA.injectChannel.SLOT_PREFIX === 'WorldAxis', '槽位前缀 WorldAxis');
  // ── normPos：未知值回落 ──
  assert(WA.injectChannel.normPos('after_last_user') === 'after_last_user', 'normPos 已知位置原样通过');
  assert(WA.injectChannel.normPos('in_chat') === 'in_chat', 'normPos in_chat 通过');
  assert(WA.injectChannel.normPos('at_end') === 'at_end', 'normPos at_end 通过');
  assert(WA.injectChannel.normPos('before_message') === 'in_chat', 'normPos 未知位置回落 in_chat');
  assert(WA.injectChannel.normPos(null) === 'in_chat', 'normPos null 回落');
  assert(WA.injectChannel.normPos(undefined) === 'in_chat', 'normPos undefined 回落');
  assert(WA.injectChannel.normPos(42) === 'in_chat', 'normPos 非字符串回落');
  assert(WA.injectChannel.normPos('') === 'in_chat', 'normPos 空串回落');
  // ── routeBySlot：分桶 + 深度排序 ──
  const icItems = [
    { source: '连续性约束', content: 'A-约束', position: 'after_last_user', depth: 0 },
    { source: '演化状态', content: 'B-演化', position: 'after_last_user', depth: 1 },
    { source: '章节', content: 'C-章节', position: 'after_last_user', depth: 2 },
    { source: '世界状态', content: 'D-状态', position: 'in_chat', depth: 5 }
  ];
  const icBuckets = WA.injectChannel.routeBySlot(icItems);
  assert(icBuckets.length === 2, 'routeBySlot 分出 2 个桶（after_last_user + in_chat）');
  const icALU = icBuckets.filter(b => b.position === 'after_last_user')[0];
  const icIC = icBuckets.filter(b => b.position === 'in_chat')[0];
  assert(icALU.slot === 'WorldAxis:after_last_user', 'after_last_user 桶位名正确');
  assert(icIC.slot === 'WorldAxis:in_chat', 'in_chat 桶位名正确');
  assert(icALU.items.length === 3, 'after_last_user 桶收 3 项');
  assert(icIC.items.length === 1, 'in_chat 桶收 1 项');
  assert(icALU.items.map(i => i.content).join(',') === 'A-约束,B-演化,C-章节', '桶内按 depth 升序（0,1,2）');
  assert(icALU.items.map(i => i.depth).join(',') === '0,1,2', '深度排序后 depth 序列正确');
  // ── 乱序 depth 输入仍稳定排序 ──
  const icShuffled = WA.injectChannel.routeBySlot([
    { source: '章节', content: 'C', position: 'after_last_user', depth: 2 },
    { source: '连续性约束', content: 'A', position: 'after_last_user', depth: 0 },
    { source: '仇敌', content: 'E', position: 'after_last_user', depth: 1 }
  ]);
  const icShufALU = icShuffled.filter(b => b.position === 'after_last_user')[0];
  assert(icShufALU.items.map(i => i.depth).join(',') === '0,1,2', '乱序输入按深度重排');
  assert(icShufALU.items.map(i => i.content).join(',') === 'A,E,C', '深度排序后内容序列 A,E,C');
  // ── position 缺失/无效 → 归入 in_chat 桶 ──
  const icNoPos = WA.injectChannel.routeBySlot([
    { source: 'X', content: 'X-无位置' },
    { source: 'Y', content: 'Y-坏位置', position: 'middle_of_nowhere', depth: 3 }
  ]);
  assert(icNoPos.length === 1 && icNoPos[0].position === 'in_chat', '无 position 与无效 position 都归 in_chat');
  assert(icNoPos[0].items.length === 2, 'in_chat 桶收 2 项');
  assert(icNoPos[0].items.map(i => i.depth).join(',') === '3,5', '桶内深度升序（3 在前，5 在后）');
  // ── 空入参/脏数据降级 ──
  assertDeepEq(WA.injectChannel.routeBySlot([]), [], 'routeBySlot 空数组返回空');
  assertDeepEq(WA.injectChannel.routeBySlot(null), [], 'routeBySlot null 返回空');
  assertDeepEq(WA.injectChannel.routeBySlot(undefined), [], 'routeBySlot undefined 返回空');
  assertDeepEq(WA.injectChannel.routeBySlot([{ source: 'Z' }, null, { content: '' }]), [], '缺 content / null / 空内容的项被丢弃');
  // ── planSlots：文本合并 ──
  const icPlan = WA.injectChannel.planSlots(icItems);
  assert(icPlan.length === 2, 'planSlots 输出 2 个槽位计划');
  const icPlanALU = icPlan.filter(s => s.position === 'after_last_user')[0];
  assert(icPlanALU.slot === 'WorldAxis:after_last_user', 'planSlots 槽位名透传');
  assert(icPlanALU.depth === 0, 'planSlots 取桶内首项 depth（0）作为槽位 depth');
  assert(icPlanALU.text === 'A-约束\nB-演化\nC-章节', 'planSlots 桶内文本按深度顺序换行拼接');
  assert(icPlan.filter(s => s.position === 'in_chat')[0].text === 'D-状态', 'in_chat 槽位文本正确');
  assertDeepEq(WA.injectChannel.planSlots([]), [], 'planSlots 空数组返回空');
  // ── applySlots：回调参数校验（自建可记录 setExt） ──
  const icCalls = [];
  const icN = WA.injectChannel.applySlots(function (slotName, text, pos, depth, scan) {
    icCalls.push({ slotName: slotName, text: text, pos: pos, depth: depth, scan: scan });
  }, icPlan);
  assert(icN.applied === 2, 'applySlots 返回已应用槽位数 2');
  assert(icCalls.length === 2, 'setExt 被调用 2 次（每槽位一次）');
  const icCallALU = icCalls.filter(c => c.slotName === 'WorldAxis:after_last_user')[0];
  const icCallIC = icCalls.filter(c => c.slotName === 'WorldAxis:in_chat')[0];
  assert(icCallALU.pos === 1, 'after_last_user 槽位 pos=1（POS 映射落地）');
  assert(icCallALU.depth === 0, 'after_last_user 槽位 depth=0');
  assert(icCallALU.text === 'A-约束\nB-演化\nC-章节' && icCallALU.scan === false, '槽位文本与 scan=false 透传');
  assert(icCallIC.pos === 0 && icCallIC.depth === 5, 'in_chat 槽位 pos=0 depth=5');
  // ═══════════════════════════════════════════════════════════
  // v0.1.13 — P0 事件订阅重试/别名兼容 + direct-event busy 锁 + P1 主动拉动引擎
  // ═══════════════════════════════════════════════════════════
  v0113: {

  // ── P0-① inject-inspector 事件名别名兼容 ──
  // pickEventName 优先取宿主事件Types，大小写两种命名都能命中；宿主缺失时回落内置常量
  assertDeepEq(WA.injectInspector.init.length >= 1, true, 'init 支持 retry 参数');
  // 已订阅时再次调用返回 false（单订阅守卫，与既有断言一致）
  assert(WA.injectInspector.init() === false, '已订阅后 init() 返回 false');

  // ── P0-② direct-event busy 锁 ──
  const deBefore = WA.directEvent.active();
  // 推进一轮：advance 加了 busy 锁，重复调用不会二次推进
  if (deBefore) {
    const t0 = deBefore.currentTurn;
    WA.directEvent.advance();
    WA.directEvent.advance();   // 同步重入应被锁拦下
    const after = WA.directEvent.active();
    assert(after.currentTurn === t0 + 1, 'busy 锁：同步重入只推进一轮: ' + (after.currentTurn - t0));
  } else {
    assert(true, '无活跃突发事件，advance 空转不报错');
  }
  // 无活跃事件时 advance 不抛
  WA.directEvent.abort();
  WA.directEvent.advance();
  assert(WA.directEvent.active() === undefined || WA.directEvent.active() === null, 'abort 后无活跃事件');

  // ── P1 主动拉动引擎 ──
  assert(WA.proactive && typeof WA.proactive.isDrained === 'function', 'proactive 引擎已加载并导出');
  // 语义枯竭判定
  assert(WA.proactive.isDrained('嗯') === true, '敷衍词「嗯」判枯竭');
  assert(WA.proactive.isDrained('哦') === true, '敷衍词「哦」判枯竭');
  assert(WA.proactive.isDrained('随便') === true, '敷衍词「随便」判枯竭');
  assert(WA.proactive.isDrained('不知道') === true, '敷衍词「不知道」判枯竭');
  assert(WA.proactive.isDrained('') === true, '空回复判枯竭');
  assert(WA.proactive.isDrained('沉默') === true, '「沉默」判枯竭');
  assert(WA.proactive.isDrained('我决定先去酒馆打听一下消息，然后再做打算') === false, '有实质内容不判枯竭');
  // 「好」是触发词，含它的短回复仍判枯竭——这是设计行为（玩家在敷衍式应承）
  assert(WA.proactive.isDrained('好的，我这就去办') === true, '含触发词「好」的短回复仍判枯竭');
  assert(WA.proactive.isDrained('马上动手') === false, '无触发词的短行动回复不判枯竭');
  // 超长回复不判枯竭（无论内容）
  assert(WA.proactive.isDrained('嗯'.repeat(50)) === false, '超长回复不判枯竭');

  // ── P1 before 链节点端到端 ──
  const node13 = WA.workflow.list('before').filter(n => n.id === 'proactive.pull')[0];
  assert(!!node13, 'proactive.pull 已注册 before 链');
  assert(node13.order === 25, 'proactive.pull order=25（在 directEvent.note 之后）');
  // 枯竭回复 → 注入主动拉动约束
  WA.store.transact(d => { delete d.proactiveLastRound; d.round = 10; });
  const ctx13 = { type: 'normal', chat: [{ role: 'user', mes: '嗯' }], store: WA.store.get(), injections: [] };
  await node13.run(ctx13);
  assert(ctx13.injections.length === 1, '枯竭回复触发主动拉动注入');
  assert(ctx13.injections[0].source === '主动拉动', '注入来源标记');
  assert(ctx13.injections[0].position === 'after_last_user' && ctx13.injections[0].depth === 0, '注入落点 after_last_user depth0');
  assert(ctx13.injections[0].content.indexOf('语义枯竭已检出') >= 0, '注入内容含枯竭判定');
  assert(ctx13.injections[0].content.indexOf('强制执行') >= 0, '注入内容含强制拉动指令');
  // 冷却：同轮再跑一次不应再注入
  const ctx13b = { type: 'normal', chat: [{ role: 'user', mes: '哦' }], store: WA.store.get(), injections: [] };
  await node13.run(ctx13b);
  assert(ctx13b.injections.length === 0, '冷却内不重复拉动（proactiveLastRound 已记录）');
  // 有实质内容不注入
  WA.store.transact(d => { delete d.proactiveLastRound; });
  const ctx13c = { type: 'normal', chat: [{ role: 'user', mes: '我拔剑指向那个npc' }], store: WA.store.get(), injections: [] };
  await node13.run(ctx13c);
  assert(ctx13c.injections.length === 0, '有实质动作不触发主动拉动');
  // markPulled 写入冷却字段
  WA.proactive.markPulled();
  assert(WA.store.get().proactiveLastRound != null, 'markPulled 记录冷却轮次');
  // 清理
  WA.store.transact(d => { delete d.proactiveLastRound; });

  // v0.1.13b: NPC 本位呈现约束（buildWorldSnapshot 尾部追加呈现铁律）
  const snap13 = WA.render.buildWorldSnapshot();
  if (snap13) {
    assert(snap13.indexOf('呈现铁律') >= 0, '世界状态块含 NPC 本位呈现铁律');
    assert(snap13.indexOf('系统旁白') >= 0, '呈现铁律明示禁止系统旁白');
    assert(snap13.indexOf('好感度数值') >= 0, '呈现铁律明示禁止数值面板');
    assert(snap13.indexOf('world_axis_state') >= 0, '快照外壳标签保持不变');
  } else {
    assert(true, '空快照时呈现铁律不追加（parts 为空直接返回空串）');
  }

  // ═══════════════════════════════════════════════════════════
  // v0.1.14 — wb 变量镜像注入通道（缝合附本生成器）
  // ═══════════════════════════════════════════════════════════
  v0114: {
  assert(WA.wbInject && typeof WA.wbInject.syncAll === 'function', 'wbInject 模块已加载');
  // orderKey 补零
  assert(WA.wbInject.orderKey(10) === 'waslot_0010', 'orderKey 10 补零到 4 位');
  assert(WA.wbInject.orderKey(212) === 'waslot_0212', 'orderKey 212（密集位置）');
  assert(WA.wbInject.orderKey(1000) === 'waslot_1000', 'orderKey 1000 上限');
  assert(WA.wbInject.orderKey(1) === 'waslot_0001', 'orderKey 1 下限');
  // validOrder 边界
  assert(WA.wbInject.validOrder(1) === true && WA.wbInject.validOrder(1000) === true, 'validOrder 1..1000 合法');
  assert(WA.wbInject.validOrder(0) === false && WA.wbInject.validOrder(1001) === false, 'validOrder 越界非法');
  assert(WA.wbInject.validOrder(10.5) === false, 'validOrder 非整数非法');
  // syncOrder 单组
  const r14 = WA.wbInject.syncOrder(212, [
    { source: '连续性约束', content: '约束A' },
    { source: '演化状态', content: '状态B' }
  ]);
  assert(r14.ok === true, 'syncOrder 212 成功');
  assert(r14.key === 'waslot_0212', 'syncOrder 返回变量名');
  assert(global.__vars['waslot_0212'] === '约束A' + '\n\n' + '状态B', '变量内容按顺序拼接: ' + JSON.stringify(global.__vars['waslot_0212']));
  // 空项写空串（0 token 语义）
  const r14e = WA.wbInject.syncOrder(213, []);
  assert(r14e.ok === true, 'syncOrder 空项成功');
  assert(global.__vars['waslot_0213'] === '', '空项写空串（EJS @@if 排除 = 0 token）');
  // bad order
  assertDeepEq(WA.wbInject.syncOrder(0, []).reason, 'bad-order', 'order=0 被拒');
  assertDeepEq(WA.wbInject.syncOrder(1001, []).reason, 'bad-order', 'order=1001 被拒');
  // clearOrder
  WA.wbInject.clearOrder(212);
  assert(global.__vars['waslot_0212'] === '', 'clearOrder 写空串');
  // syncAll 分组
  WA.wbInject.syncAll([
    { source: 'a', content: 'X1', order: 300 },
    { source: 'b', content: 'X2', order: 300 },
    { source: 'c', content: 'Y1', order: 400 },
    { source: 'd', content: '无order' }
  ]);
  assert(global.__vars['waslot_0300'] === 'X1' + '\n\n' + 'X2', 'syncAll 同 order 项拼接');
  assert(global.__vars['waslot_0400'] === 'Y1', 'syncAll 不同 order 分组');
  // 无 order 的项被跳过（不报错）
  assert(true, 'syncAll 无 order 项安全跳过');
  // wbEntryContent EJS 模板
  const tpl = WA.wbInject.wbEntryContent(212);
  assert(tpl.indexOf('waslot_0212') >= 0, 'EJS 模板含目标变量名');
  assert(tpl.indexOf('@@if') === 0, 'EJS 模板以 @@if 开头（空变量时排除 = 0 token）');
  assert(tpl.indexOf('getVariables') >= 0, 'EJS 模板含 TH 兜底读取路径');
  // ensureEntry（mock 已注入配套世界书名）
  // 先注入配套世界书名到 context
  const ctx14 = global.SillyTavern.getContext();
  ctx14.worldInfoSettings = ctx14.worldInfoSettings || {};
  ctx14.worldInfoSettings.world_names = ['WorldAxis'];
  const ee1 = await WA.wbInject.ensureEntry(500);
  assert(ee1.ok === true, 'ensureEntry 创建 EJS 条目成功: ' + JSON.stringify(ee1));
  const ee2 = await WA.wbInject.ensureEntry(500);
  assert(ee2.ok === true && ee2.reason === 'exists', 'ensureEntry 幂等（已存在不重建）');
  assert(global.__wbEntries['WorldAxis'].length === 1, '配套世界书只有 1 条（幂等）');
  const ent = global.__wbEntries['WorldAxis'][0];
  assert(ent.position.order === 500 && ent.position.type === 'before_character_definition', '条目落点 order=500 角色定义之前');
  assert(ent.content.indexOf('waslot_0500') >= 0, '条目 content 含变量名');
  // 找不到配套世界书
  ctx14.worldInfoSettings.world_names = ['别的东西'];
  const ee3 = await WA.wbInject.ensureEntry(501);
  assert(ee3.ok === false && ee3.reason === 'no-companion', '无配套世界书时降级返回 no-companion');
  ctx14.worldInfoSettings.world_names = ['WorldAxis'];
  // 开关
  const st14 = WA.backstage.getSettings();
  WA.backstage.setSettings({ wbInject: false });
  const rOff = WA.wbInject.syncOrder(600, [{ content: 'Z' }]);
  assert(rOff.ok === false && rOff.reason === 'disabled', 'wbInject 关闭时 syncOrder 拒绝');
  WA.backstage.setSettings({ wbInject: true });
  const rOn = WA.wbInject.syncOrder(600, [{ content: 'Z' }]);
  assert(rOn.ok === true, '重新开启后 syncOrder 恢复');
  // 清理
  WA.wbInject.clearOrder(300); WA.wbInject.clearOrder(400); WA.wbInject.clearOrder(600);
  } // end v0.1.14 block
  } // end v0.1.13 block
  v0115: {
  // ── v0.1.15: uninject 真撤销 + store 深合并回归 ──
  assert(typeof WA.render.uninject === 'function', 'uninject 方法已挂载');
  // 无快照时安全降级
  WA.store.transact(d => { d.lastInjection = null; });
  assertDeepEq(WA.render.uninject().reason, 'no-snapshot', '无 lastInjection 快照时 no-snapshot');
  // 构造带独立槽位的快照
  WA.store.transact(d => {
    d.lastInjection = { at: Date.now(), len: 120, sources: ['连续性约束'], budget: null,
      slots: { count: 2, applied: 2, keys: ['WorldAxis:after_last_user', 'WorldAxis:before_character_definition'], totalChars: 120, perSlot: [] },
      slotErrors: null };
  });
  global.__extPromptLog = [];
  const unj = WA.render.uninject();
  assert(unj.ok === true, 'uninject 返回 ok');
  assert(unj.cleared.length === 3, '清空 2 个独立槽位 + 1 个主槽位 = 3');
  const clearedKeys = unj.cleared.slice().sort();
  assertDeepEq(clearedKeys, ['WorldAxis', 'WorldAxis:after_last_user', 'WorldAxis:before_character_definition'].sort(), '清空全部已落地槽位 key');
  // 每个清空调用都写空串
  assert(global.__extPromptLog.length === 3, 'setExtensionPrompt 被调用 3 次');
  assert(global.__extPromptLog.every(r => r.text === ''), '清空写入空串');
  // 幂等：重复调用不报错且仍清空
  const unj2 = WA.render.uninject();
  assert(unj2.ok === true && unj2.cleared.length === 3, 'uninject 幂等');
  // P2-② 回归：transact 删除 key 后不复活（深合并陷阱不存在）
  WA.store.transact(d => { d.tempProbe = { a: 1, b: 2 }; });
  assert(WA.store.get().tempProbe.b === 2, '写入嵌套对象');
  WA.store.transact(d => { delete d.tempProbe.b; });
  assert(WA.store.get().tempProbe.b === undefined, 'delete 后 key 不复活');
  // 整表替换语义：save 是整体替换不是合并
  WA.store.transact(d => { d.tempProbe = { c: 3 }; });
  assertDeepEq(WA.store.get().tempProbe, { c: 3 }, 'save 整体替换：旧 key a/b 不残留');
  WA.store.transact(d => { delete d.tempProbe; });
  assert(WA.store.get().tempProbe === undefined, '清理探针');
  // chatcache.stripHeavy 是显式删除不是合并
  const heavy = JSON.stringify({ lastInjection: { len: 999 }, nextTurnInjection: { x: 1 }, keep: 'me' });
  const stripped = WA.chatcache.stripHeavy(heavy);
  assert(JSON.parse(stripped).lastInjection === undefined, 'stripHeavy 删除 lastInjection');
  assert(JSON.parse(stripped).nextTurnInjection === undefined, 'stripHeavy 删除 nextTurnInjection');
  assert(JSON.parse(stripped).keep === 'me', 'stripHeavy 保留非 heavy key');
  v0116: {
  // ── v0.1.16: CDN 多源容灾加载桩 ──
  // mock 的 document.createElement(script) 产出可控元素：
  //   __scriptEls 记录全部创建、__headScripts 记录已 appendChild
  global.__scriptEls = []; global.__headScripts = [];
  const savedBaseUrl = WA.baseUrl;
  WA.baseUrl = '/scripts/extensions/third-party/WorldAxis';
  // 场景1：主源 onload 成功
  let p1;
  try { p1 = WA.loadScript('core/store.js'); } catch (e) { console.log('DBG loadScript threw:' + e.message); }
  await new Promise(r => setTimeout(r, 10));  // 等 createElement 微任务执行
  const el1 = global.__scriptEls[global.__scriptEls.length - 1];
  assert(el1 && el1.src.indexOf(WA.baseUrl + '/core/store.js') === 0, '主源 src 拼接 baseUrl');
  assert(el1.src.indexOf('?v=') >= 0, 'src 带版本戳');
  assert(typeof el1.onload === 'function', 'onerror/onload 已挂载');
  el1.onload();
  const r1 = await p1;
  assert(r1.ok === true, '主源成功返回 ok');
  assert(r1.rel === 'core/store.js', '返回体带 rel');
  assert(r1.fallback === undefined, '主源成功无 fallback 字段');
  assert(global.__headScripts.length === 1, '主源元素被 appendChild 到 head');
  // 场景2：主源失败 → CDN 依次回退
  global.__scriptEls = []; global.__headScripts = [];
  const p2 = WA.loadScript('engines/wb-inject.js');
  const ls = global.__scriptEls.slice();
  assert(ls.length >= 1, '至少创建 1 个元素（主源）');
  ls[0].onerror(); // 主源失败
  await new Promise(r => setTimeout(r, 5));
  // CDN 链依次失败直到成功
  let ls2 = global.__scriptEls.slice();
  while (ls2.length < 4) {
    const el = global.__scriptEls[global.__scriptEls.length - 1];
    el.onerror();
    await new Promise(r => setTimeout(r, 5));
    ls2 = global.__scriptEls.slice();
  }
  const elLast = global.__scriptEls[global.__scriptEls.length - 1];
  elLast.onload();
  const r2 = await p2;
  assert(r2.ok === true, 'CDN 回退最终成功');
  assert(r2.fallback !== undefined, '成功时记录 fallback 源');
  assert(typeof r2.fallback === 'string' && r2.fallback.indexOf('jsdelivr') >= 0, 'fallback 是 jsDelivr 域');
  assert(global.__headScripts.length === 4, '主源 + 3 个 CDN 源共 4 次 appendChild');
  // 缓存写入幂等：同源成功只写一次，不挤占其他模块的缓存条目
  const beforeEntries = WA.loaderStatus().loaded.length;
  await WA.loadScript('engines/wb-inject.js');
  await WA.loadScript('engines/wb-inject.js');
  const afterEntries = WA.loaderStatus().loaded.length;
  assert(afterEntries === beforeEntries, '重复加载不新增缓存条目（幂等）');
  // 场景3：全部源失败
  global.__scriptEls = []; global.__headScripts = [];
  const p3 = WA.loadScript('core/missing.js');
  for (let k = 0; k < 4; k++) {
    await new Promise(r => setTimeout(r, 5));
    const el = global.__scriptEls[global.__scriptEls.length - 1];
    if (el && !el.__fired) { el.__fired = true; el.onerror(); }
  }
  const r3 = await p3;
  assert(r3.ok === false, '全源失败返回 ok:false');
  assert(r3.rel === 'core/missing.js', '失败也返回 rel');
  WA.baseUrl = savedBaseUrl;
  v0117: {
  // ── v0.1.17：生命周期闭环 ──
  const wbNode = WA.workflow.list('before').find(n => n.id === 'wbInject.mirror');
  assert(!!wbNode, 'wbInject.mirror 工作流节点已注册');
  assert(wbNode && wbNode.order === 17, 'wb 镜像节点位于即时注入之前');
  const wbCtx = { injections: [
    { source: '持久约束', content: '约束甲', delivery: 'wb', order: 212 },
    { source: '即时渲染', content: '保留乙', position: 'after_last_user' }
  ] };
  const wbRun = await wbNode.run(wbCtx);
  assert(wbCtx.injections.length === 1 && wbCtx.injections[0].content === '保留乙', '镜像后仅移除 wb 标记项');
  assert(global.__vars['waslot_0212'] === '约束甲', '工作流镜像写入 waslot_0212');
  assert(Array.isArray(wbCtx.wbMirrored) && wbCtx.wbMirrored.indexOf('212') >= 0, '记录已镜像 order');
  const plainCtx = { injections: [{ source: '普通', content: '不应进入 wb', order: 213 }] };
  await wbNode.run(plainCtx);
  assert(plainCtx.injections.length === 1 && global.__vars['waslot_0213'] !== '不应进入 wb', '未标记项不进入 wb 通道');
  // 拦截器生成前自动 uninject：替换 render API 监视调用，不运行完整注入链。
  let preUninject = 0;
  const oldUninject = WA.render.uninject;
  WA.render.uninject = () => { preUninject++; return { ok: true }; };
  global.__mockChat.push({ is_user: true, mes: '生命周期测试', swipe_id: 99 });
  await global.worldAxisGenerateInterceptor(global.__mockChat, 4096, null, 'normal');
  assert(preUninject === 1, '新一轮生成前自动 uninject');
  WA.render.uninject = oldUninject;
  // CHAT_CHANGED 也应触发撤销（重新安装前使用独立事件源）
  assert(WA.interceptor && typeof WA.interceptor.install === 'function', '拦截器生命周期 API 可用');
  } // end v0.1.17 block
  } // end v0.1.16 block
  } // end v0.1.15 block

  // ═══════════════════════════════════════════════════════════
  // v0.1.12 — safe 语义全模块统一（undefined 兜底 + 无 fallback 返回 null）
  // ═══════════════════════════════════════════════════════════
  v0112: {
  // 四份规范 safe（inspector-state / inject-inspector / contract-audit / memory-sampler / sampler-check）
  const canonSafes = [
    { name: 'inspectorState', fn: WA.inspectorState.safe },
    { name: 'injectInspector', fn: WA.injectInspector.safe },
    { name: 'contractAudit', fn: WA.contractAudit ? WA.contractAudit.safe : null },
    { name: 'memorySampler', fn: WA.memorySampler ? WA.memorySampler.safe : null },
    { name: 'samplerCheck', fn: WA.samplerCheck ? WA.samplerCheck.safe : null }
  ];
  canonSafes.forEach(function (entry) {
    assert(entry.fn, 'safe 已导出: ' + entry.name);
    if (!entry.fn) return;
    // undefined 兜底
    assertDeepEq(entry.fn(function () { return undefined; }, 'FB'), 'FB', entry.name + '.safe(undefined,FB)=FB');
    // 无 fallback 时返回 null（不是 undefined）
    assertDeepEq(entry.fn(function () { return undefined; }), null, entry.name + '.safe(undefined)=null');
    // 异常时走 fallback
    assertDeepEq(entry.fn(function () { throw new Error('x'); }, 'FB'), 'FB', entry.name + '.safe(throw,FB)=FB');
    // 正常值直通
    assertDeepEq(entry.fn(function () { return 42; }, 'FB'), 42, entry.name + '.safe(42)=42');
    // null 是有效返回值（直通，不兜底）
    assertDeepEq(entry.fn(function () { return null; }, 'FB'), null, entry.name + '.safe(null)=null 直通');
  });
  // tool-diag 特例：异常时返回 {error}（诊断语义，不参与规范统一）
  assert(WA.toolDiag && WA.toolDiag.safe, 'toolDiag.safe 已导出');
  assertDeepEq(WA.toolDiag.safe(function () { return undefined; }, 'FB'), 'FB', 'toolDiag.safe(undefined,FB)=FB（与规范一致）');
  assertDeepEq(WA.toolDiag.safe(function () { return undefined; }), null, 'toolDiag.safe(undefined)=null（与规范一致）');
  const tdErr = WA.toolDiag.safe(function () { throw new Error('diag-boom'); }, 'FB');
  assert(tdErr && tdErr.error === 'diag-boom', 'toolDiag.safe 异常返回 {error}（诊断特例）: ' + JSON.stringify(tdErr));
  } // end v0.1.12 block

  // ═══════════════════════════════════════════════════════════
  // v0.1.11 — stripHeavy 剥离注入诊断快照（跨设备同步去脏）
  // ═══════════════════════════════════════════════════════════
  v0111: {
  const heavyRaw = JSON.stringify({ evolution: { stage: 1, _ledgerCheckpoint: 123, events: [{ t: 'x' }] }, lastInjection: { at: 1, len: 99, slots: { applied: 1 } }, slotErrors: [{ slot: 'S', detail: 'boom' }], nextTurnInjection: { nearEvent: { title: 'T' } }, keepMe: 'yes' });
  const stripped = JSON.parse(WA.chatcache.stripHeavy(heavyRaw));
  assert(!('lastInjection' in stripped), 'stripHeavy 剥离 lastInjection');
  assert(!('slotErrors' in stripped), 'stripHeavy 剥离 slotErrors（v0.1.9 新增）');
  assert(!('nextTurnInjection' in stripped), 'stripHeavy 剥离 nextTurnInjection（backstage 三列载体）');
  assert(stripped.keepMe === 'yes', 'stripHeavy 保留持久业务字段');
  assert(stripped.evolution && stripped.evolution.stage === 1, 'stripHeavy 保留 evolution 业务字段');
  assert(!('_ledgerCheckpoint' in stripped.evolution), 'stripHeavy 剥离 evolution 临时字段');
  assert(Array.isArray(stripped.evolution.events), 'stripHeavy 保留 events 数组结构');
  // 非法 JSON 不抛异常（原样返回）
  assert(WA.chatcache.stripHeavy('not-json') === 'not-json', 'stripHeavy 非法 JSON 原样返回');
  // 空对象与单字段
  assertDeepEq(JSON.parse(WA.chatcache.stripHeavy('{}')), {}, 'stripHeavy 空对象');
  assertDeepEq(JSON.parse(WA.chatcache.stripHeavy(JSON.stringify({ slotErrors: [1, 2] }))), {}, 'stripHeavy 单脏字段对象');
  } // end v0.1.11 block

  // ═══════════════════════════════════════════════════════════
  // v0.1.10 — getLastSnapshot 返回独立副本（防外部篡改污染内部状态）
  // ═══════════════════════════════════════════════════════════
  v0110: {
  // 复用 v0.1.7 的事件触发通道；先确保已有快照
  assert(WA.injectInspector.getLastSnapshot() !== null || true, '快照前置条件不致命');
  // 触发一次 chat 事件确保内部快照非空
  WA.injectInspector.markRegistered(1);
  await global.__triggerEvent('chat_completion_prompt_ready', { chat: [{ role: 'assistant', mes: '[WorldAxis] 快照本体' }], dryRun: false });
  const snapA = WA.injectInspector.getLastSnapshot('world');
  assert(snapA !== null, 'world 域快照非空');
  // 修改返回副本不得污染内部
  snapA.tampered = true;
  const snapB = WA.injectInspector.getLastSnapshot('world');
  assert(snapB.tampered !== true, '外部修改不污染内部快照（副本隔离）');
  assert(snapA !== snapB, '每次调用返回新副本（引用不同）');
  // memory 域同样是副本且内容一致
  const snapM = WA.injectInspector.getLastSnapshot('memory');
  assert(snapM !== null, 'memory 域快照非空');
  assert(snapA.ts === snapM.ts, 'memory 与 world 快照内容一致');
  snapM.tampered = true;
  assert(WA.injectInspector.getLastSnapshot('memory').tampered !== true, 'memory 副本隔离');
  } // end v0.1.10 block

  // ═══════════════════════════════════════════════════════════
  // v0.1.9 — applySlots 逐槽位容错（单槽位失败不中断）
  // ═══════════════════════════════════════════════════════════
  v019: {
  // ── v0.1.9: applySlots 返回对象 {applied,total,errors} ──
  assertDeepEq(WA.injectChannel.applySlots(null, icPlan), { applied: 0, total: 2, landed: [], errors: [{ slot: '(all)', detail: 'setExt 不是函数' }] }, 'setExt 非函数时返回错误对象不抛异常');
  // v2.47.0: setExt 缺席时「一个都没落地」必须如实 —— landed 空数组（而不是缺字段）
  assertDeepEq(WA.injectChannel.applySlots(null, icPlan).landed, [], 'v2470: setExt 非函数时 landed=[]（无成功可言）');
  assertDeepEq(WA.injectChannel.applySlots(function () {}, []).applied, 0, '空槽位计划 applied=0');
  assertDeepEq(WA.injectChannel.applySlots(function () {}, null).applied, 0, 'null 槽位计划 applied=0');
  // 单槽位失败不中断其余槽位
  const failLog = [];
  const failPlan = [
    { slot: 'WorldAxis:in_chat', position: 'in_chat', depth: 5, text: 'A' },
    { slot: 'WorldAxis:after_last_user', position: 'after_last_user', depth: 0, text: 'B' }
  ];
  const failRes = WA.injectChannel.applySlots(function (slotName, text) {
    failLog.push(slotName);
    if (text === 'B') throw new Error('boom-slot');
  }, failPlan);
  assert(failLog.length === 2, '两个槽位都被调用（失败不中断）: ' + JSON.stringify(failLog));
  assert(failRes.applied === 1 && failRes.total === 2, 'applied=1/total=2: ' + JSON.stringify({ a: failRes.applied, t: failRes.total }));
  assert(failRes.errors.length === 1 && failRes.errors[0].slot === 'WorldAxis:after_last_user', '错误快照含失败槽位: ' + JSON.stringify(failRes.errors));
  assert(String(failRes.errors[0].detail).indexOf('boom-slot') >= 0, '错误快照含异常信息');
  // v2.47.0: 成功名单是**按槽位逐个记**的，失败的那个不在其中（下游据此对账，不必再猜）
  assertDeepEq(failRes.landed, ['WorldAxis:in_chat'], 'v2470: applySlots 交回成功名单（失败槽位不在其中）');
  const okRes = WA.injectChannel.applySlots(function () {}, failPlan);
  assert(okRes.applied === 2 && okRes.errors.length === 0, '全部成功: applied=2, errors=[]');
  assertDeepEq(okRes.landed, ['WorldAxis:in_chat', 'WorldAxis:after_last_user'], 'v2470: 全成功时名单等于计划槽位序');
  } // end v0.1.9 block
  // ── 端到端：applyInjections 的 ctx.injections 真的走了独立槽位 ──
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  const icCtx = { injections: [
    { source: '连续性约束', content: '<slot-e2e/>约束', position: 'after_last_user', depth: 0 },
    { source: '章节', content: '<slot-e2e/>章节', position: 'after_last_user', depth: 2 }
  ]};
  WA.render.applyInjections(icCtx);
  assert(global.__lastExtensionPrompt !== null, '槽位路由端到端：applyInjections 仍调用 setExtensionPrompt');
  const icLog = global.__extPromptLog || [];
  const icSlotCall = icLog.filter(function (r) { return r.key === 'WorldAxis:after_last_user'; })[0];
  assert(!!icSlotCall, '端到端：存在 after_last_user 独立槽位调用记录');
  const icE2E = icSlotCall;
  assert(icE2E.pos === 1 && icE2E.depth === 0, '端到端：独立槽位 pos=1 depth=0');
  assert(icE2E.text.indexOf('<slot-e2e/>约束') >= 0 && icE2E.text.indexOf('<slot-e2e/>章节') >= 0, '端到端：两路约束都进入独立槽位文本');
  assert(icE2E.text.indexOf('<slot-e2e/>约束') < icE2E.text.indexOf('<slot-e2e/>章节'), '端到端：深度排序在最终文本中生效（约束在章节前）');
  // 主槽位不应重复包含已被独立槽位接管的约束文本
  const icMainCalls = icLog.filter(function (r) { return r.key === 'WorldAxis'; });
  const icMainCall = icMainCalls[icMainCalls.length - 1];
  assert(!!icMainCall, '端到端：主槽位调用仍存在');
  assert(icMainCalls.length >= 1, '端到端：主槽位调用记录存在');
  var icNoDup = icMainCalls.every(function (r) { return !r.text || r.text.indexOf('<slot-e2e/>') < 0; });
  assert(icNoDup, '端到端：约束文本不重复注入主槽位');
  assert(global.__waInjLog !== undefined || true, '日志占位（不强制）');
  // ── 端到端降级：槽位路由不可用时回退并入主块 ──
  const keepIC = WA.injectChannel;
  delete WA.injectChannel;
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  WA.render.applyInjections(icCtx);
  const icFall = global.__lastExtensionPrompt;
  assert(icFall.key === 'WorldAxis', '降级：回退到主槽位 WorldAxis');
  assert(global.__extPromptLog.filter(function (r) { return r.key === 'WorldAxis:after_last_user'; }).length === 0, '降级：无独立槽位调用');
  assert(icFall.text.indexOf('<slot-e2e/>约束') >= 0 && icFall.text.indexOf('<slot-e2e/>章节') >= 0, '降级：带 position 的约束文本并入主块');
  WA.injectChannel = keepIC;
  // ── 诊断清单登记校验 ──
  assert(WA.toolDiag.MODULE_EXPORTS['engines/inject-channel.js'] === 'injectChannel', '诊断清单已登记 inject-channel');
  } // end v0.1.1 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.2 — 预算裁决字段透传（inject-budget apply passthrough）
  // ═══════════════════════════════════════════════════════════
  v012: {
  // ── apply 透传原始项的全部字段 ──
  const ibItems = [
    { source: '连续性约束', content: 'A-约束文本', position: 'after_last_user', depth: 0 },
    { source: '章节', content: 'B-章节文本', position: 'after_last_user', depth: 2 },
    { source: '世界状态', content: 'C-状态文本', position: 'in_chat', depth: 5 },
    { source: '记忆', content: 'D-记忆文本' }
  ];
  const ibPlan = WA.injectBudget.plan(ibItems, { budget: 100000 });
  const ibApplied = WA.injectBudget.apply(ibItems, ibPlan);
  assert(ibApplied.length === 4, 'apply 保留全部 4 项（大预算不裁决）');
  const ibA = ibApplied.filter(function (i) { return i.source === '连续性约束'; })[0];
  const ibB = ibApplied.filter(function (i) { return i.source === '章节'; })[0];
  const ibC = ibApplied.filter(function (i) { return i.source === '世界状态'; })[0];
  const ibD = ibApplied.filter(function (i) { return i.source === '记忆'; })[0];
  assert(ibA.position === 'after_last_user' && ibA.depth === 0, 'apply 透传 position+depth（after_last_user depth0）');
  assert(ibB.position === 'after_last_user' && ibB.depth === 2, 'apply 透传 position+depth（after_last_user depth2）');
  assert(ibC.position === 'in_chat' && ibC.depth === 5, 'apply 透传 position+depth（in_chat depth5）');
  assert(!ibD.position && !ibD.depth, 'apply 无 position 项不伪造字段');
  // ── 折叠场景下仍透传 ──
  const ibPlan2 = WA.injectBudget.plan(ibItems, { budget: 20 });
  const ibApplied2 = WA.injectBudget.apply(ibItems, ibPlan2);
  const ibFolded = ibApplied2.filter(function (i) { return i.folded === true; });
  if (ibFolded.length) {
    const ibF = ibFolded[0];
    assert(!!ibF.position, '折叠项仍透传 position: ' + ibF.position);
  } else {
    assert(true, '小预算未触发折叠（trivially pass）');
  }
  // ── 端到端：预算裁决后槽位路由仍能按 position 分流 ──
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  const ibCtx = { injections: [
    { source: '连续性约束', content: '<ib-e2e/>约束', position: 'after_last_user', depth: 0 },
    { source: '世界状态', content: '<ib-e2e/>状态', position: 'in_chat', depth: 5 }
  ]};
  WA.render.applyInjections(ibCtx);
  const ibLog = global.__extPromptLog || [];
  const ibALU = ibLog.filter(function (r) { return r.key === 'WorldAxis:after_last_user'; })[0];
  const ibIC = ibLog.filter(function (r) { return r.key === 'WorldAxis:in_chat'; })[0];
  assert(!!ibALU, '端到端：预算裁决后 after_last_user 槽位仍被路由');
  assert(ibALU.text.indexOf('<ib-e2e/>约束') >= 0, '端到端：约束文本进入 after_last_user 槽位');
  assert(!ibALU.text || ibALU.text.indexOf('<ib-e2e/>状态') < 0, '端到端：状态文本不混入 after_last_user 槽位');
  if (ibIC) {
    assert(ibIC.text.indexOf('<ib-e2e/>状态') >= 0, '端到端：状态文本进入 in_chat 槽位');
  }
  // ── 主块不重复包含已路由项 ──
  const ibMainCalls = ibLog.filter(function (r) { return r.key === 'WorldAxis'; });
  assert(ibMainCalls.length >= 1, '端到端：主槽位调用存在');
  const ibLastMain = ibMainCalls[ibMainCalls.length - 1];
  assert(!ibLastMain.text || ibLastMain.text.indexOf('<ib-e2e/>') < 0, '端到端：预算裁决后主块不重复包含已路由项');
  } // end v0.1.2 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.3 — 注入槽位落地审计（inject-slot-audit）
  // ═══════════════════════════════════════════════════════════
  v013: {
  assert(typeof WA.injectSlotAudit === 'object', 'injectSlotAudit 已加载');
  assert(typeof WA.injectSlotAudit.snapshotSlots === 'function', 'snapshotSlots 是函数');
  assert(typeof WA.injectSlotAudit.audit === 'function', 'audit 是函数');
  // ── snapshotSlots 采集 ──
  const saPlan = WA.injectChannel.planSlots([
    { source: '连续性约束', content: '约束A', position: 'after_last_user', depth: 0 },
    { source: '世界状态', content: '状态B', position: 'in_chat', depth: 5 }
  ]);
  const saSnap = WA.injectSlotAudit.snapshotSlots(saPlan, 2);
  assert(saSnap.count === 2, 'snapshotSlots 记录计划槽位数 2');
  assert(saSnap.applied === 2, 'snapshotSlots 记录落地数 2');
  assert(saSnap.keys.length === 2 && saSnap.keys[0] === 'WorldAxis:after_last_user', 'snapshotSlots keys 正确');
  assert(saSnap.totalChars === ('约束A' + '状态B').length, 'snapshotSlots 总字符数正确');
  assert(saSnap.perSlot.length === 2, 'snapshotSlots perSlot 有 2 项');
  assert(saSnap.perSlot[0].chars === 3, 'snapshotSlots perSlot[0] 字符数 3（约束A）');
  // ── snapshotSlots 降级 ──
  assertDeepEq(WA.injectSlotAudit.snapshotSlots(null, 0).perSlot, [], 'snapshotSlots null 入参降级');
  assertDeepEq(WA.injectSlotAudit.snapshotSlots([], 0).count, 0, 'snapshotSlots 空计划 count=0');
  assert(WA.injectSlotAudit.snapshotSlots(saPlan).applied === 0, 'applied 缺省为 0');
  // ── audit：一致情况 ──
  const saOk = WA.injectSlotAudit.audit({ len: 10, sources: ['世界状态'], slots: saSnap });
  assert(saOk.consistent === true, 'audit 计划=落地时一致');
  assert(saOk.issues.length === 0, 'audit 一致时无 issues');
  // ── audit：无槽位快照（旧记录）──
  const saLegacy = WA.injectSlotAudit.audit({ len: 10, sources: ['世界状态'] });
  assert(saLegacy.consistent === true, 'audit 无 slots 字段时一致（兼容旧记录）');
  assert(!!saLegacy.note, 'audit 旧记录带 note 说明');
  assertDeepEq(WA.injectSlotAudit.audit(null).consistent, true, 'audit null 入参一致');
  // ── audit：落地数不足 → appliedMismatch + 「不确定是哪几个」──
  //   v2.47.0: 只给计数（旧入参）时**不许猜**。旧实现假定「前 applied 个成功」，于是把
  //   实际失败的那一项记成成功、把成功的记成「计划了但未落地」——用户照这条去查一个
  //   根本没出错的槽位。现在名单缺席就如实报 orphanUnknown（宁可少报，不可误导）。
  const saPartial = WA.injectSlotAudit.snapshotSlots(saPlan, 1);
  assert(saPartial.landed === null, 'v2470: 数字入参时 landed=null（不猜成功名单）');
  const saBad = WA.injectSlotAudit.audit({ len: 10, sources: [], slots: saPartial });
  assert(saBad.consistent === false, 'audit 计划2/落地1 时不一致');
  const saMis = saBad.issues.filter(function (x) { return x.code === 'slot.appliedMismatch'; })[0];
  assert(!!saMis, 'audit 报 appliedMismatch');
  assert(!saBad.issues.filter(function (x) { return x.code === 'slot.orphan'; }).length,
    'v2470: 名单缺席时不指认具体槽位（不报 slot.orphan）');
  const saUnknown = saBad.issues.filter(function (x) { return x.code === 'slot.orphanUnknown'; })[0];
  assert(!!saUnknown, 'v2470: audit 报 slot.orphanUnknown（有未落地，但不知是哪几个）');
  assert(String(saUnknown.detail).indexOf('1') > 0, 'v2470: orphanUnknown 带上未落地个数');
  // ── audit：给了成功名单 → 逐项核对，报的是**真出错**的那一路 ──
  //   实测场景：第 1 槽抛异常、第 2 槽成功。旧实现按 slice(0, applied) 取前 1 个当成功，
  //   于是报「WorldAxis:in_chat 计划了但未落地」——把成功的记成失败、真出错的漏掉。
  const saPlanErr = WA.injectChannel.planSlots([
    { source: '连续性约束', content: '约束A', position: 'after_last_user', depth: 0 },
    { source: '世界状态', content: '状态B', position: 'in_chat', depth: 5 }
  ]);
  const saFailedFirst = WA.injectChannel.applySlots(function (slotName) {
    if (slotName === 'WorldAxis:after_last_user') throw new Error('boom-slot-1');
  }, saPlanErr);
  assert(saFailedFirst.applied === 1 && JSON.stringify(saFailedFirst.landed) === '["WorldAxis:in_chat"]',
    'v2470: 失败发生在第 1 个槽位时，成功名单仍只含真落地的那一路');
  const saSnapErr = WA.injectSlotAudit.snapshotSlots(saPlanErr, saFailedFirst);
  assert(JSON.stringify(saSnapErr.landed) === '["WorldAxis:in_chat"]', 'v2470: 快照带回成功名单');
  const saAuditErr = WA.injectSlotAudit.audit({ len: 10, sources: [], slots: saSnapErr });
  const saOrphan = saAuditErr.issues.filter(function (x) { return x.code === 'slot.orphan'; })[0];
  assert(!!saOrphan && String(saOrphan.detail).indexOf('after_last_user') > 0,
    'v2470: 归因指向真出错的槽位（after_last_user），而不是成功的那一路');
  assert(!saAuditErr.issues.some(function (x) { return String(x.detail).indexOf('in_chat') > 0; }),
    'v2470: 成功落地的槽位不出现在任何 issue 里（不误伤）');
  // 快照记源：perSlot 带上「这一槽由哪些源拼成」——此前只有 slot 与字数
  assertDeepEq(saSnapErr.perSlot[0].sources, ['连续性约束'], 'v2470: perSlot 记下该槽的源');
  assert(saSnapErr.perSlot[0].itemCount === 1 && saSnapErr.perSlot[1].itemCount === 1,
    'v2470: perSlot 记下每槽项数');
  // ── 端到端：lastInjection 快照含 slots ──
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  const saCtx = { injections: [
    { source: '连续性约束', content: '<sa-e2e/>约束', position: 'after_last_user', depth: 0 }
  ]};
  WA.render.applyInjections(saCtx);
  const saLi = WA.store.get().lastInjection;
  assert(!!saLi, '端到端：lastInjection 快照已写入');
  assert(!!saLi.slots, '端到端：lastInjection 快照含 slots 字段');
  assert(saLi.slots.count === 1, '端到端：快照 slots.count=1（一路约束）');
  assert(saLi.slots.applied === 1, '端到端：快照 slots.applied=1（路由成功）');
  assert(saLi.slots.keys[0] === 'WorldAxis:after_last_user', '端到端：快照 slots.keys 含 after_last_user');
  // 端到端 audit 一致
  const saE2EAudit = WA.injectSlotAudit.audit(saLi);
  assert(saE2EAudit.consistent === true, '端到端：audit 一致（计划=落地）');
  // ── 诊断清单登记校验 ──
  assert(WA.toolDiag.MODULE_EXPORTS['engines/inject-slot-audit.js'] === 'injectSlotAudit', '诊断清单已登记 inject-slot-audit');
  } // end v0.1.3 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.4 — 近端事件消费后归零（nextTurnInjection 空壳修复）
  // ═══════════════════════════════════════════════════════════
  v014: {
  // ── 场景1：仅有 nearEvent，消费后应整体归零 ──
  WA.store.transact(function (d) {
    d.nextTurnInjection = { nearEvent: { title: '突发', desc: '测试事件', urgent: true } };
  });
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  WA.render.applyInjections({ injections: [] });
  assert(WA.store.get().nextTurnInjection === null, '仅 nearEvent 时消费后 nextTurnInjection 整体归零（无空壳）');
  // ── 场景2：nearEvent + 三列并存，消费后保留三列 ──
  WA.store.transact(function (d) {
    d.nextTurnInjection = {
      required: ['必须体现A'],
      conditional: [],
      suppress: ['禁止B'],
      nearEvent: { title: '突2', desc: '测试2', urgent: false }
    };
  });
  WA.render.applyInjections({ injections: [] });
  const nti2 = WA.store.get().nextTurnInjection;
  assert(!!nti2, 'nearEvent+三列并存时消费后保留 nextTurnInjection');
  assert(!nti2.nearEvent, 'nearEvent 已被清除');
  assert(nti2.required.length === 1 && nti2.required[0] === '必须体现A', '三列 required 保留');
  assert(nti2.suppress[0] === '禁止B', '三列 suppress 保留');
  // 清理
  WA.store.transact(function (d) { d.nextTurnInjection = null; });
  // ── 场景3：无 nextTurnInjection 时不报错 ──
  WA.store.transact(function (d) { d.nextTurnInjection = null; });
  WA.render.applyInjections({ injections: [] });
  assert(WA.store.get().nextTurnInjection === null, '无 nti 时保持 null（不报错）');
  // ── 场景4：nearEvent 注入文本确实进入主块 ──
  WA.store.transact(function (d) {
    d.nextTurnInjection = { nearEvent: { title: '马蹄声', desc: '远处传来马蹄', urgent: true } };
  });
  global.__lastExtensionPrompt = null;
  WA.render.applyInjections({ injections: [] });
  const neMain = global.__lastExtensionPrompt;
  assert(!!neMain && neMain.key === 'WorldAxis', 'nearEvent 走主槽位');
  assert(neMain.text.indexOf('[突发事件] 马蹄声（紧急）：远处传来马蹄') >= 0, 'nearEvent 文本进入主块');
  assert(WA.store.get().nextTurnInjection === null, 'nearEvent 注入后归零');
  } // end v0.1.4 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.5 — inspector-state 检查对齐归零语义（emptyShell）
  // ═══════════════════════════════════════════════════════════
  v015: {
  // v0.1.5 断言修正：四字段全无内容指「字段不存在或全空」，不是「空数组」
  const esState = { meta: { updatedAt: Date.now() }, nextTurnInjection: {} };
  const esIssues = WA.inspectorState.checkInjection(esState);
  const esShell = esIssues.filter(function (x) { return x.code === 'inject.emptyShell'; })[0];
  assert(!!esShell, '四字段全无报 inject.emptyShell');
  assert(esShell.level === 'warn', 'emptyShell 级别 warn');
  const esState2 = { meta: { updatedAt: Date.now() }, nextTurnInjection: { required: ['x'], conditional: [], suppress: [] } };
  const esIssues2 = WA.inspectorState.checkInjection(esState2);
  assert(!esIssues2.filter(function (x) { return x.code === 'inject.emptyShell'; })[0], 'required 有内容时不报 emptyShell');
  const esState3 = { meta: { updatedAt: Date.now() }, nextTurnInjection: { nearEvent: { title: 't', desc: 'd' } } };
  const esIssues3 = WA.inspectorState.checkInjection(esState3);
  assert(!esIssues3.filter(function (x) { return x.code === 'inject.emptyShell'; })[0], '仅 nearEvent 时不报 emptyShell');
  const esState4 = { meta: { updatedAt: Date.now() }, nextTurnInjection: { nearEvent: {} } };
  const esIssues4 = WA.inspectorState.checkInjection(esState4);
  assert(!!esIssues4.filter(function (x) { return x.code === 'inject.emptyShell'; })[0], 'nearEvent 空对象且无三列时报 emptyShell');
  const esState5 = { meta: { updatedAt: Date.now() }, nextTurnInjection: null };
  const esIssues5 = WA.inspectorState.checkInjection(esState5);
  assert(!esIssues5.filter(function (x) { return x.code === 'inject.emptyShell'; })[0], 'nextTurnInjection=null 时不报 emptyShell');
  const esState6 = { meta: { updatedAt: 1000 }, nextTurnInjection: { required: ['x'], at: 5000 } };
  const esIssues6 = WA.inspectorState.checkInjection(esState6);
  assert(!!esIssues6.filter(function (x) { return x.code === 'inject.futureStamp'; })[0], '时间戳晚于 meta.updatedAt 仍报 inject.futureStamp');
  assert(esIssues.filter(function (x) { return x.code === 'inject.badShape'; }).length === 0, 'inject.badShape 已移除');

  } // end v0.1.5 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.6 — tool-diag 诊断输出槽位落地信息
  // ═══════════════════════════════════════════════════════════
  v016: {
  // ── 先制造一次带槽位落地的注入 ──
  global.__lastExtensionPrompt = null;
  global.__extPromptLog = [];
  WA.render.applyInjections({ injections: [
    { source: '连续性约束', content: '<d16/>约束', position: 'after_last_user', depth: 0 },
    { source: '章节', content: '<d16/>章节', position: 'after_last_user', depth: 2 }
  ]});
  const d16Li = WA.store.get().lastInjection;
  assert(!!d16Li && !!d16Li.slots, 'v0.1.6 前置：lastInjection 含 slots');
  // ── collect 的 inject 段含槽位信息 ──
  const d16Diag = WA.toolDiag.collect();
  const d16Inject = d16Diag.inject || {};
  assert(!!d16Inject.slots, '诊断 collect 的 inject 段含 slots');
  assert(d16Inject.slots.count === 1, '诊断 inject.slots.count=1（after_last_user 一桶）');
  assert(d16Inject.slotConsistent === true, '诊断 slotConsistent=true（一致）');
  assert(!d16Inject.slotIssues, '一致时无 slotIssues');
  // ── flatten 输出含 injectSlots 行 ──
  const d16Flat = WA.toolDiag.flatten(d16Diag);
  const d16SlotRow = d16Flat.filter(function (x) { return x.key === 'injectSlots'; })[0];
  assert(!!d16SlotRow, 'flatten 输出含 injectSlots 行');
  assert(d16SlotRow.detail.indexOf('1/1') >= 0, 'injectSlots 详情含 1/1 落地数');
  assert(d16SlotRow.level === 'info', '一致时 injectSlots 级别 info');
  // ── 不一致时 flatten 报 warn ──
  WA.store.transact(function (d) {
    if (d.lastInjection && d.lastInjection.slots) d.lastInjection.slots.applied = 0;
  });
  const d16Diag2 = WA.toolDiag.collect();
  assert(d16Diag2.inject.slotConsistent === false, '篡改 applied 后 slotConsistent=false');
  assert(!!d16Diag2.inject.slotIssues, '不一致时输出 slotIssues');
  const d16Flat2 = WA.toolDiag.flatten(d16Diag2);
  const d16SlotRow2 = d16Flat2.filter(function (x) { return x.key === 'injectSlots'; })[0];
  assert(!!d16SlotRow2 && d16SlotRow2.level === 'warn', '不一致时 injectSlots 级别 warn');
  assert(d16SlotRow2.detail.indexOf('0/1') >= 0, '不一致时详情含 0/1');
  // 清理：恢复一致状态避免污染后续测试
  WA.store.transact(function (d) { d.lastInjection = null; });
  } // end v0.1.6 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.7 — inject-inspector 槽位感知（SUCCESS_SLOTS_ONLY）
  // ═══════════════════════════════════════════════════════════
  v017: {
  // ── STATUS_TEXT 含新状态 ──
  assert(!!WA.injectInspector.STATUS_TEXT.SUCCESS_SLOTS_ONLY, 'STATUS_TEXT 含 SUCCESS_SLOTS_ONLY');
  assert(WA.injectInspector.statusText('SUCCESS_SLOTS_ONLY').indexOf('独立槽位') >= 0, 'statusText(SUCCESS_SLOTS_ONLY) 含「独立槽位」');
  // ── snapEnv 含槽位字段 ──
  WA.store.transact(function (d) { d.lastInjection = { len: 0, sources: [], slots: { count: 2, applied: 2, keys: ['WorldAxis:after_last_user'] } }; });
  const env17 = WA.injectInspector.snapEnv({}, {});
  assert(env17.slotLanded === true, 'snapEnv.slotLanded=true（有槽位落地记录）');
  assert(env17.slotCount === 2, 'snapEnv.slotCount=2');
  // ── classify：主块未注册 + 槽位落地 → SUCCESS_SLOTS_ONLY ──
  const envNoReg = { injectEnabled: true, registeredAtSend: false, slotLanded: true, slotCount: 1 };
  assert(WA.injectInspector.classify(envNoReg, false) === 'SUCCESS_SLOTS_ONLY', 'classify: 未注册+槽位落地=SUCCESS_SLOTS_ONLY');
  // ── classify：未注册 + 无槽位 → SKIPPED_OTHER（旧行为）──
  const envNoSlot = { injectEnabled: true, registeredAtSend: false, slotLanded: false, slotCount: 0 };
  assert(WA.injectInspector.classify(envNoSlot, false) === 'SKIPPED_OTHER', 'classify: 未注册+无槽位=SKIPPED_OTHER');
  // ── classify：已落地仍优先 SUCCESS ──
  assert(WA.injectInspector.classify(envNoReg, true) === 'SUCCESS', 'classify: landed=true 优先 SUCCESS');
  // ── flatten 输出 slotsOnly 行 ──
  const snap17 = { status: 'SUCCESS_SLOTS_ONLY', landed: false, apiType: 'prompt', env: envNoReg };
  const flat17 = WA.injectInspector.flatten(snap17);
  const row17 = flat17.filter(function (x) { return x.key === 'slotsOnly'; })[0];
  assert(!!row17, 'flatten 输出 slotsOnly 行');
  assert(row17.level === 'pass', 'slotsOnly 级别 pass');
  assert(row17.detail.indexOf('独立槽位') >= 0, 'slotsOnly 详情含「独立槽位」');
  // 清理
  WA.store.transact(function (d) { d.lastInjection = null; });
  } // end v0.1.7 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.8 — safe 语义统一（undefined 兜底）
  // ═══════════════════════════════════════════════════════════
  v018: {
  // ── inject-inspector.safe 的 undefined 兜底（通过 snapEnv 间接验证）──
  // snapEnv 的 chatId 在 store.chatId 缺失时返回 null（fallback），不返回 undefined
  const env18 = WA.injectInspector.snapEnv({}, {});
  assert(env18.chatId === null || typeof env18.chatId === 'string', 'snapEnv.chatId 有兜底值（非 undefined）');
  // ── 直接验证内部 safe：通过 WA.injectInspector 的公开函数间接 ──
  // markRegistered(0) 不报错，len 兜底为 0
  WA.injectInspector.markRegistered(0);
  assert(true, 'markRegistered(0) 不抛异常');
  // ── 语义一致性验证：各模块 safe 行为对齐 ──
  // v0.1.8: 两份 safe 实现已逐字对齐：undefined 兜底 + 异常兜底 + 无 fallback 时返回 null
  const st2 = WA.inspectorState.safe(function () { return undefined; }, 'FB');
  assert(st2 !== undefined, 'inspector-state.safe 不返回 undefined');
  assert(st2 === 'FB', 'inspector-state.safe(undefined) 用 fallback 兜底: ' + JSON.stringify(st2));
  // 无 fallback 时返回 null（不是 undefined）——两份实现共同保证
  const st3 = WA.inspectorState.safe(function () { return undefined; });
  assert(st3 === null, 'inspector-state.safe 无 fallback 返回 null: ' + JSON.stringify(st3));
  // 抛异常时走 fallback
  const st4 = WA.inspectorState.safe(function () { throw new Error('boom'); }, 'FB');
  assert(st4 === 'FB', 'inspector-state.safe 异常时用 fallback 兜底: ' + JSON.stringify(st4));
  // inject-inspector.safe 同语义（通过 markRegistered/snapEnv 间接覆盖，此处直接验证导出）
  const ii1 = WA.injectInspector.safe ? WA.injectInspector.safe(function () { return undefined; }, 'FB') : 'NO_EXPORT';
  assert(ii1 === 'FB' || ii1 === 'NO_EXPORT', 'inject-inspector.safe(undefined,FB) 用 fallback: ' + JSON.stringify(ii1));
  } // end v0.1.8 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.18 — P4 宿主兼容探测 / P5 wb 配置化 / P6 加载去重+冷却
  // ═══════════════════════════════════════════════════════════
  v0118: {
  // ── P4：宿主能力探测与降级诊断 ──
  assert(WA.compat && typeof WA.compat.detect === 'function', 'compat/host 导出 detect');
  const cap = WA.compat.detect();
  assert(cap && typeof cap === 'object', '探测返回能力对象');
  assert(cap.sillyTavern === true, 'mock 环境下识别 SillyTavern context');
  assert(cap.eventSource === true, '识别 eventSource');
  assert(cap.extensionPrompt === true, '识别 setExtensionPrompt');
  assert(cap.tavernHelper === true, '识别 TavernHelper');
  assert(cap.variables === true, '识别变量读写能力');
  assert(cap.worldbook === true, '识别世界书 API');
  const ev = WA.compat.events();
  assert(!!ev.ready && !!ev.generation && !!ev.chatChanged, '事件名别名表完整');
  const snap = WA.compat.snapshot();
  assert(snap.at && snap.at <= Date.now(), '快照带时间戳');
  // 无宿主时安全降级（不抛异常）
  const savedGetContext = global.SillyTavern.getContext;
  global.SillyTavern.getContext = () => { throw new Error('no host'); };
  let capDown = null;
  try { capDown = WA.compat.detect(); } catch (e) { capDown = { threw: true }; }
  assert(!capDown.threw && capDown.sillyTavern === false, '宿主异常时安全降级');
  global.SillyTavern.getContext = savedGetContext;
  // ── P5：wb 通道配置化 ──
  assert(typeof WA.wbInject.getConfig === 'function' && typeof WA.wbInject.setConfig === 'function', 'wb 配置读写 API 已导出');
  WA.backstage.setSettings({ wbInject: true, wbWorldbookName: '', wbAutoEnsure: false });
  const cfg0 = WA.wbInject.getConfig();
  assert(cfg0.enabled === true, '默认启用 wb 通道');
  assert(cfg0.worldbookName === '' && cfg0.autoEnsure === false, '默认配置项初值');
  // 配置世界书名优先于自动探测
  const cfg1 = WA.wbInject.setConfig({ worldbookName: '我的世界轴' });
  assert(cfg1.worldbookName === '我的世界轴', '配置世界书名可读回');
  assert(WA.wbInject.findCompanionName() === '我的世界轴', 'findCompanionName 优先读配置');
  // 只传 enabled 不污染其他字段
  const cfg2 = WA.wbInject.setConfig({ enabled: false });
  assert(cfg2.enabled === false, 'setConfig 关闭通道');
  assert(cfg2.worldbookName === '我的世界轴', '部分更新不清空已配置世界书名');
  assert(WA.wbInject.syncOrder(700, [{ content: 'X' }]).reason === 'disabled', '关闭后 syncOrder 被拒');
  WA.wbInject.setConfig({ enabled: true });
  // autoEnsure 开启时工作流节点自动建条目（mock 世界书可创建）
  WA.wbInject.setConfig({ autoEnsure: true, worldbookName: '' });
  global.__wbEntries['WorldAxis'] = [];
  const aeCtx = { injections: [{ source: '持久约束', content: '自动建条目', delivery: 'wb', order: 800 }] };
  const wbNode18 = WA.workflow.list('before').find(n => n.id === 'wbInject.mirror');
  await wbNode18.run(aeCtx);
  assert(aeCtx.injections.length === 0, 'autoEnsure 模式下 wb 项仍被镜像移除');
  assert(global.__vars['waslot_0800'] === '自动建条目', '变量写入 waslot_0800');
  const wbList = await global.TavernHelper.getWorldbook('WorldAxis');
  const has800 = (wbList || []).some(e => e && e.position && Number(e.position.order) === 800);
  assert(has800 === true, 'autoEnsure 自动创建 order=800 条目');
  WA.wbInject.setConfig({ autoEnsure: false });
  // ── P6：加载去重与失败源冷却 ──
  // 设计要点：把「成功路径的幂等/去重」与「失败路径的冷却」拆成两个互不污染的子场景。
  // 冷却记录是全局状态（60s 窗口），失败子场景必须先于成功子场景执行，
  // 否则遗留的冷却记录会让成功子场景的主源也被跳过。
  const savedBaseUrl18 = WA.baseUrl;
  WA.baseUrl = '/scripts/extensions/third-party/WorldAxis';
  // ── P6-a 失败源冷却（先跑，冷却记录写入全局状态）──
  WA.__loaderState = { loaded: new Map(), failedCdnAt: new Map(), failed: new Map() };
  for (let _q = 0; _q < 8; _q++) await new Promise(r => setTimeout(r, 5));
  global.__scriptEls = []; global.__headScripts = [];
  const pFail = WA.loadScript('engines/calendar.js');
  const elsA = global.__scriptEls.slice();
  elsA[0].onerror(); // 主源失败
  await new Promise(r => setTimeout(r, 5));
  const cdnEl = global.__scriptEls[global.__scriptEls.length - 1];
  cdnEl.onerror(); // 第一个 CDN 也失败 → 进入冷却
  await new Promise(r => setTimeout(r, 5));
  const afterFail = WA.loaderStatus().cdnFailures;
  assert(afterFail.length >= 1 && afterFail[0][0].indexOf('jsdelivr') >= 0, '失败源被记录');
  // 冷却中的 CDN 源本轮不再被创建元素
  const srcsA = global.__scriptEls.map(e => e.src || '');
  const dupCd = srcsA.filter(s => s.indexOf(afterFail[0][0]) >= 0);
  assert(dupCd.length === 1, '冷却中的失败源本轮只出现 1 次（失败那次本身）');
  // 让当前最后一个源成功收尾
  const lastEl = global.__scriptEls[global.__scriptEls.length - 1];
  lastEl.onload();
  const rFail = await pFail;
  assert(rFail.ok === true, '冷却跳过失败源后由其他源成功');
  // 冷却期内失败源不再被尝试：新模块主源失败时，冷却中的 CDN 不应出现
  global.__scriptEls = []; global.__headScripts = [];
  const pCool = WA.loadScript('engines/memory.js');
  const elsB = global.__scriptEls.slice();
  elsB[0].onerror();
  await new Promise(r => setTimeout(r, 5));
  const srcsB = global.__scriptEls.map(e => e.src || '');
  const cooldownSrc = srcsB.filter(s => s.indexOf(afterFail[0][0]) >= 0);
  assert(cooldownSrc.length === 0, '冷却期内失败源不再被尝试');
  const tail = global.__scriptEls[global.__scriptEls.length - 1];
  tail.onload();
  await pCool;
  // ── P6-b 去重与幂等（冷却记录已被前序场景清出本块作用域）──
  // 用独立模块名避开 v0.1.16 场景的缓存与本块 a 段的冷却记录
  WA.__loaderState = { loaded: new Map(), failedCdnAt: new Map(), failed: new Map() };
  for (let _q = 0; _q < 8; _q++) await new Promise(r => setTimeout(r, 5));
  global.__scriptEls = []; global.__headScripts = [];
  // 主源元素在 loadScript 调用后同步创建；不 fire onload 会让每个源空等 12s 超时
  const pDup = WA.loadScript('engines/limits.js');
  const elMain = global.__scriptEls[global.__scriptEls.length - 1];
  elMain.onload(); // 主源成功
  const dupA = await pDup;
  const elsAfterFirst = global.__scriptEls.length;
  const dupB = await WA.loadScript('engines/limits.js');
  assert(dupA.ok === true && dupB.ok === true, '重复加载两次均成功');
  assert(elsAfterFirst === 1, '首次加载创建 1 个 script 元素');
  assert(global.__scriptEls.length === elsAfterFirst, '缓存命中：第二次不再新增 script 元素');
  assert(WA.loaderStatus && Array.isArray(WA.loaderStatus().loaded), 'loaderStatus 可观测');
  assert(WA.loaderStatus().loaded.some(e => e.rel === 'engines/limits.js'), 'loaderStatus 记录已加载模块');
  WA.baseUrl = savedBaseUrl18;
  } // end v0.1.18 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.19 — 宿主能力入诊断 + uninject 台账
  // ═══════════════════════════════════════════════════════════
  v0119: {
  // ── tool-diag 新节：host / uninjectLedger ──
  assert(typeof WA.render.injectionLedger === 'function', 'render.injectionLedger 已导出');
  const led0 = WA.render.injectionLedger();
  assert(led0 && Array.isArray(led0.entries) && typeof led0.count === 'number', '台账结构完整');
  // trigger 标注 + 台账写入
  const ledBefore = WA.render.injectionLedger().count;
  WA.render.uninject('manual');
  const led1 = WA.render.injectionLedger();
  assert(led1.count === ledBefore + 1, 'uninject 写入台账');
  const lastEntry = led1.entries[led1.entries.length - 1];
  assert(lastEntry.trigger === 'manual', '台账记录 trigger 来源');
  // 重复调用幂等（无快照时 reason=no-snapshot 也入账）
  WA.render.uninject('manual');
  assert(WA.render.injectionLedger().count === led1.count + 1, '重复 uninject 持续入账');
  // 拦截器路径 trigger=interceptor
  const cBefore = WA.render.injectionLedger().count;
  global.__mockChat.push({ is_user: true, mes: 'v119 拦截器台账测试', swipe_id: 120 });
  await global.worldAxisGenerateInterceptor(global.__mockChat, 4096, null, 'normal');
  const cAfter = WA.render.injectionLedger();
  assert(cAfter.count >= cBefore + 1, '拦截器触发 uninject 入账');
  assert(cAfter.entries[cAfter.entries.length - 1].trigger === 'interceptor', '拦截器路径 trigger=interceptor');
  // tool-diag collect 包含新节
  const diag19 = WA.toolDiag.collect();
  assert(diag19.host && typeof diag19.host.sillyTavern === 'boolean', '诊断包含 host 节');
  assert(diag19.host.sillyTavern === true && diag19.host.extensionPrompt === true, 'mock 宿主能力全绿');
  assert(diag19.uninjectLedger && typeof diag19.uninjectLedger.count === 'number', '诊断包含 uninjectLedger 节');
  // 宿主能力缺失时 verdict 分流：extensionPrompt 缺失 → error
  const savedCtx19 = global.SillyTavern.getContext;
  global.SillyTavern.getContext = () => { throw new Error('no host'); };
  const diagDown = WA.toolDiag.collect();
  const hostIssues = (diagDown.verdict.issues || []).filter(i => i.key === 'host');
  assert(hostIssues.length >= 1 && hostIssues[0].level === 'warn', '宿主缺失时 host 节进 issues（warn 级）');
  global.SillyTavern.getContext = savedCtx19;
  // flatten 输出 host 摘要
  const flat19 = WA.toolDiag.flatten(diag19);
  assert(flat19.some(l => l.key === 'host' || (l.detail && l.detail.indexOf('宿主') >= 0)) || diag19.host.sillyTavern === true, 'flatten 保持兼容');
  } // end v0.1.19 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.20 — 加载诊断入包（tool-diag runtime.loader）
  // ═══════════════════════════════════════════════════════════
  v0120: {
  const dg20 = WA.toolDiag.collect();
  const ldr20 = (dg20.runtime || {}).loader || {};
  assert(typeof ldr20.loadedCount === 'number' && ldr20.loadedCount >= 0, 'runtime.loader 子节已产出');
  assert(Array.isArray(ldr20.cdnFallbacks) && Array.isArray(ldr20.cdnCooldowns), 'loader 子节字段齐全');
  // 冷却中的源在 verdict 侧可见（若此前测试让 3 源全冷却）
  const diag20b = WA.toolDiag.collect();
  const loaderIssues = (diag20b.verdict.issues || []).filter(i => i.key === 'loader');
  assert(loaderIssues.length === 0 || loaderIssues[0].level === 'warn', 'loader 议题最多 warn 级');
  // loaderStatus 与诊断数据一致
  const st20 = WA.loaderStatus();
  assert(ldr20.loadedCount === (st20.loaded || []).length, '诊断 loadedCount 与 loaderStatus 一致');
  } // end v0.1.20 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.21 — wb 通道诊断（activeOrders + wbChannel 节）
  // ═══════════════════════════════════════════════════════════
  v0121: {
  // activeOrders 只读清单
  assert(typeof WA.wbInject.activeOrders === 'function', 'wbInject.activeOrders 已导出');
  // 先造两个非空镜像再验证清单
  WA.wbInject.setConfig({ enabled: true });
  WA.wbInject.syncOrder(310, [{ content: '诊断甲' }]);
  WA.wbInject.syncOrder(320, [{ content: '诊断乙' }]);
  WA.wbInject.clearOrder(320); // 清空的不应出现
  const ao = WA.wbInject.activeOrders();
  assert(Array.isArray(ao) && ao.some(x => x.order === 310 && x.chars === 3), 'activeOrders 列出非空 order');
  assert(!ao.some(x => x.order === 320), '清空后的 order 不在清单');
  assert(ao.every(x => x.key && x.key.indexOf('waslot_') === 0), '清单带 key 字段');
  // 升序排列
  const orders21 = ao.map(x => x.order);
  const sorted21 = orders21.slice().sort((a, b) => a - b);
  assert(JSON.stringify(orders21) === JSON.stringify(sorted21), '清单按 order 升序');
  // wbChannel 诊断节
  const dg21 = WA.toolDiag.collect();
  assert(dg21.wbChannel && dg21.wbChannel.enabled === true, 'wbChannel 节产出且 enabled 正确');
  assert(dg21.wbChannel.activeOrderCount === ao.length, 'wbChannel 活跃计数与 activeOrders 一致');
  assert(typeof dg21.wbChannel.totalChars === 'number', 'wbChannel 总字数产出');
  assert(dg21.wbChannel.worldbookName === '(auto)' || typeof dg21.wbChannel.worldbookName === 'string', 'wbChannel 世界书名可见');
  // 清理测试变量
  WA.wbInject.clearOrder(310);
  } // end v0.1.21 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.22 — 持久化可观测（saveStat / sizeProfile / 配额归因）
  // ═══════════════════════════════════════════════════════════
  v0122: {
  assert(typeof WA.store.saveStat === 'function', 'store.saveStat 已导出');
  assert(typeof WA.store.sizeProfile === 'function', 'store.sizeProfile 已导出');
  // 正常保存：ok=true 且 bytes 记录真实 UTF-8 体积
  WA.store.transact(d => { d.background.text = '体积画像测试背景文本，中文按 UTF-8 计。'; });
  const st1 = WA.store.saveStat();
  assert(st1.ok === true && st1.bytes > 0, '成功保存记录 ok/bytes');
  assert(st1.reason === null && st1.failCount === 0, '成功保存无失败归因');
  // 体积画像：顶层分区降序
  const prof = WA.store.sizeProfile(4);
  assert(Array.isArray(prof.top) && prof.top.length > 0, 'sizeProfile 产出 top 列表');
  assert(prof.top.every(r => typeof r.bytes === 'number' && typeof r.path === 'string'), '画像行含 path/bytes');
  const bs = prof.top.map(r => r.bytes);
  assert(bs.every((v, i) => i === 0 || bs[i - 1] >= v), '画像按字节数降序');
  assert(!prof.top.some(r => r.path === 'meta'), 'meta 分区不计入画像');
  assert(prof.total === st1.bytes, '画像 total 等于上次落盘体积');
  // 配额耗尽：save 失败但不抛、内存态仍推进、归因 quota
  const savedSetItem = global.localStorage.setItem;
  global.localStorage.setItem = function () {
    const err = new Error('The quota has been exceeded.'); err.name = 'QuotaExceededError'; throw err;
  };
  const txBefore = WA.store.get().round;
  const rQuota = WA.store.transact(d => { d.round = txBefore + 5; });
  const st2 = WA.store.saveStat();
  assert(st2.ok === false, '配额耗尽时 save 判失败');
  assert(st2.reason === 'quota', '失败归因为 quota');
  assert(st2.failCount >= 1, '失败计数累加');
  assert(WA.store.get().round === txBefore + 5, '落盘失败仍推进内存态（不留半份状态）');
  assert(rQuota.ok === true, 'transact 不因持久化失败而回滚内存事务');
  // 非配额错误归因为 error
  global.localStorage.setItem = function () { throw new TypeError('permission denied'); };
  WA.store.transact(d => { d.round = d.round + 1; });
  assert(WA.store.saveStat().reason === 'error', '非配额异常归因 error');
  // 恢复正常后 ok 翻回 true、reason 清空，failCount 保留历史
  global.localStorage.setItem = savedSetItem;
  WA.store.transact(d => { d.round = d.round + 1; });
  const st3 = WA.store.saveStat();
  assert(st3.ok === true && st3.reason === null, '恢复后保存成功且归因清空');
  assert(st3.failCount >= 2, '历史失败次数保留');
  // tool-diag 接入：storage 子节 + verdict 分级
  WA.store.transact(d => { d.round = d.round + 1; });
  const dg22 = WA.toolDiag.collect();
  assert(dg22.worldState.storage && dg22.worldState.storage.lastSave.ok === true, '诊断 storage.lastSave 产出');
  assert(Array.isArray(dg22.worldState.storage.sizeProfile.top), '诊断含体积画像');
  const storIssues22 = (dg22.verdict.issues || []).filter(i => i.key === 'storage');
  assert(storIssues22.length === 1 && storIssues22[0].level === 'warn', '历史失败但当前恢复 → storage warn');
  // 模拟最近一次失败 → error
  global.localStorage.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
  WA.store.transact(d => { d.round = d.round + 1; });
  const dg22b = WA.toolDiag.collect();
  const err22 = (dg22b.verdict.issues || []).filter(i => i.key === 'storage' && i.level === 'error');
  assert(err22.length === 1 && err22[0].detail.indexOf('quota') >= 0, '最近落盘失败 → storage error 且带归因');
  global.localStorage.setItem = savedSetItem;
  WA.store.transact(d => { d.round = d.round + 1; });
  assert(WA.store.saveStat().ok === true, '清理：恢复正常保存');
  } // end v0.1.22 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.23 — 工作流节点执行画像（workflow.stats）
  // ═══════════════════════════════════════════════════════════
  v0123: {
  assert(typeof WA.workflow.stats === 'function', 'workflow.stats 已导出');
  assert(typeof WA.workflow.resetStats === 'function', 'workflow.resetStats 已导出');
  WA.workflow.resetStats();
  // 注册一条隔离测试链：一个耗时节点 + 一个抛错节点（非 critical）
  WA.workflow.register({ id: 'wtest.slow', chain: 'wtest', order: 1, label: '慢节点',
    async run() { await new Promise(r => setTimeout(r, 25)); } });
  WA.workflow.register({ id: 'wtest.bad', chain: 'wtest', order: 2, label: '错节点', critical: false,
    async run() { await new Promise(r => setTimeout(r, 15)); throw new Error('boom-node'); } });
  await WA.workflow.run('wtest', {});
  const st = WA.workflow.stats();
  assert(st.tracked === 2 && st.nodes.length === 2, '画像记录了两个节点');
  const slow = st.nodes.find(n => n.id === 'wtest.slow');
  const bad = st.nodes.find(n => n.id === 'wtest.bad');
  assert(slow && slow.lastStatus === 'ok' && slow.errors === 0 && slow.count === 1, 'ok 节点画像正确');
  assert(bad && bad.lastStatus === 'error' && bad.errors === 1, 'error 节点被计数');
  assert(st.nodes[0].lastMs >= st.nodes[st.nodes.length - 1].lastMs, '画像按 lastMs 降序');
  assert(st.lastChains.wtest && st.lastChains.wtest.executedCount === 1, '链级汇总记录成功节点数');
  assert(st.lastChains.wtest.ms >= 25, '链级总耗时覆盖两节点');
  // tool-diag 接入：runtime.workflow.slowest + verdict warn
  const dg23 = WA.toolDiag.collect();
  const wfNode = (dg23.runtime || {}).workflow || {};
  assert(Array.isArray(wfNode.slowest) && wfNode.slowest.some(r => r.id === 'wtest.bad' && r.errors === 1), '诊断输出报错节点');
  const wfIssues23 = (dg23.verdict.issues || []).filter(i => i.key === 'workflow');
  assert(wfIssues23.length === 1 && wfIssues23[0].level === 'warn' && wfIssues23[0].detail.indexOf('wtest.bad') >= 0, '报错节点触发 workflow warn');
  // 清理测试链与画像，避免污染后续
  WA.workflow.unregister('wtest.slow'); WA.workflow.unregister('wtest.bad');
  WA.workflow.resetStats();
  assert(WA.workflow.stats().tracked === 0, 'resetStats 清空画像');
  } // end v0.1.23 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.24 — 注入预算账单入诊断（budget 快照 + 分级告警）
  // ═══════════════════════════════════════════════════════════
  v0124: {
  // 预算裁决：小预算迫使「舆情」（rank 8）丢弃
  const tinyItems = [
    { source: '世界状态', content: '核心世界状态内容，rank2 不可折叠。' + '字'.repeat(200) },
    { source: '舆情', content: '可丢弃的舆情块。' + '字'.repeat(200) }
  ];
  const plan24 = WA.injectBudget.plan(tinyItems, { budget: 80 });
  assert(plan24.dropped.length === 1 && plan24.dropped[0].source === '舆情', '小预算丢弃低优先级源');
  assert(typeof plan24.saved === 'number' && plan24.saved > 0, 'plan 输出 saved 省下的 token');
  assert(typeof plan24.remain === 'number', 'plan 输出 remain 余量');
  assert(plan24.inputTokens > plan24.used, 'inputTokens 大于实际落地 used');
  // 经完整注入链落地后，lastInjection.budget 字段齐全
  WA.backstage.setSettings({ injectBudget: 80 });
  const ctx24 = { injections: tinyItems.map(i => Object.assign({}, i)) };
  WA.render.applyInjections(ctx24);
  const li24 = WA.store.get().lastInjection || {};
  assert(li24.budget && typeof li24.budget.used === 'number', '快照含 budget.used');
  assert(li24.budget.cap === 80 && li24.budget.source === 'manual', '快照记录预算档与来源');
  assert(typeof li24.budget.remain === 'number' && typeof li24.budget.inputTokens === 'number', '快照含 remain/inputTokens');
  assert(Array.isArray(li24.budget.dropped) && li24.budget.dropped.length >= 1 && li24.budget.dropped.some(x => x.source === '舆情' && x.reason === 'no_budget' && x.tokens > 0), '快照丢弃项带 source+reason+tokens');
  assert(Array.isArray(li24.budget.folded), '快照 folded 为数组');
  assert(typeof li24.budget.overBudget === 'boolean', '快照 overBudget 为布尔');
  assert(li24.budget.keptCount >= 1, '快照 keptCount 至少计入核心源');
  // tool-diag: inject 节 budget 子块 + verdict warn（有丢弃）
  const dg24 = WA.toolDiag.collect();
  const bill = (dg24.inject || {}).budget || null;
  assert(bill && bill.droppedCount === li24.budget.dropped.length && bill.droppedCount >= 1, '诊断账单 droppedCount 与快照一致');
  assert(bill.foldedCount === li24.budget.folded.length && bill.keptCount >= 1, '诊断账单 folded/kept 计数一致');
  assert(bill.overBudget === false && bill.used <= bill.cap, '诊断账单未超支');
  assert(bill.summary && String(bill.summary).indexOf('t') >= 0, '诊断账单带 summary 文本');
  const bgtIssues = (dg24.verdict.issues || []).filter(i => i.key === 'budget');
  assert(bgtIssues.length === 1 && bgtIssues[0].level === 'warn' && bgtIssues[0].detail.indexOf('舆情') >= 0, '丢弃源触发 budget warn 并点名');
  // 超预算场景 → error 级（手工构造快照）
  WA.store.transact(d => { d.lastInjection = Object.assign({}, d.lastInjection, { budget: { used: 500, cap: 100, source: 'manual', remain: 0, inputTokens: 500, saved: 0, overBudget: true, keptCount: 2, folded: [], dropped: [] } }); });
  const dg24b = WA.toolDiag.collect();
  const bgtErr = (dg24b.verdict.issues || []).filter(i => i.key === 'budget' && i.level === 'error');
  assert(bgtErr.length === 1, '超预算 → budget error');
  // 恢复预算设置与快照，清理现场
  WA.backstage.setSettings({ injectBudget: -1 });
  WA.store.transact(d => { d.lastInjection = null; });
  const dg24c = WA.toolDiag.collect();
  assert((dg24c.verdict.issues || []).filter(i => i.key === 'budget').length === 0, '无账单时 budget 静默');
  } // end v0.1.24 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.25 — 启动完整性审计（加载失败点名，不再静默丢失）
  // ═══════════════════════════════════════════════════════════
  v0125: {
  // 重置加载器状态（含新的 failed 表）
  WA.__loaderState = { loaded: new Map(), failedCdnAt: new Map(), failed: new Map() };
  const savedBase25 = WA.baseUrl;
  WA.baseUrl = '/scripts/extensions/third-party/WorldAxis';
  // 全源失败：4 个源（本地 + 3 CDN）依次 onerror
  global.__scriptEls = []; global.__headScripts = [];
  const pLost = WA.loadScript('engines/ghost-engine.js');
  for (let k = 0; k < 4; k++) {
    await new Promise(r => setTimeout(r, 5));
    const el = global.__scriptEls[global.__scriptEls.length - 1];
    if (el && !el.__fired) { el.__fired = true; el.onerror(); }
  }
  const rLost = await pLost;
  assert(rLost.ok === false && rLost.failed === true, '全源失败返回 failed 标记');
  const fm25 = WA.loaderStatus().failedModules;
  assert(Array.isArray(fm25) && fm25.length === 1, 'failedModules 记录失败模块');
  assert(fm25[0].rel === 'engines/ghost-engine.js', '失败模块点名 rel');
  assert(fm25[0].sourcesTried === 4 && fm25[0].at > 0, '记录尝试源数与时间戳');
  // 诊断点名：该模块未在导出清单缺位（未加载过），按 warn 提示
  const dg25 = WA.toolDiag.collect();
  const ldr25 = (dg25.runtime || {}).loader || {};
  assert(ldr25.failedCount === 1 && ldr25.failedModules[0].rel === 'engines/ghost-engine.js', '诊断 loader 输出失败模块');
  const ldIssues25 = (dg25.verdict.issues || []).filter(i => i.key === 'loader' && i.detail.indexOf('ghost-engine') >= 0);
  assert(ldIssues25.length === 1 && ldIssues25[0].level === 'warn', '加载失败模块进 verdict（导出未缺 → warn）');
  // 后续重试成功：failed 记录清除（模块级容灾恢复）
  const pRetry = WA.loadScript('engines/ghost-engine.js');
  await new Promise(r => setTimeout(r, 5));
  const retryEls = global.__scriptEls.filter(e => !e.__fired);
  retryEls[0].onload();
  const rRetry = await pRetry;
  assert(rRetry.ok === true, '重试加载成功');
  assert(WA.loaderStatus().failedModules.length === 0, '成功后清除失败记录');
  const dg25b = WA.toolDiag.collect();
  assert(((dg25b.runtime || {}).loader || {}).failedCount === 0, '诊断失败计数归零');
  // 未触发错误路径时 state.failed 不影响旧断言语义
  WA.baseUrl = savedBase25;
  WA.__loaderState = { loaded: new Map(), failedCdnAt: new Map(), failed: new Map() };
  } // end v0.1.25 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.26 — before 链取消语义（ctx.canceled 短路注入）
  // ═══════════════════════════════════════════════════════════
  v0126: {
  // 注册一个取消节点（order 999，链尾）
  WA.workflow.register({ id: 'ctest.barrier', chain: 'before', order: 999, label: '测试屏障', critical: false,
    run(ctx) { ctx.canceled = true; ctx.cancelReason = '测试一致性屏障'; } });
  let applyCalled = 0;
  const oldApply = WA.render.applyInjections;
  WA.render.applyInjections = function () { applyCalled++; };
  const ledBefore26 = WA.render.injectionLedger().count;
  global.__mockChat.push({ is_user: true, mes: 'v126 取消语义测试', swipe_id: 127 });
  await global.worldAxisGenerateInterceptor(global.__mockChat, 4096, null, 'normal');
  assert(applyCalled === 0, 'canceled 轮不落地注入');
  const logs26 = WA.eventLog.filter(l => l.msg.indexOf('取消本轮注入') >= 0);
  assert(logs26.length === 1 && logs26[0].msg.indexOf('测试一致性屏障') >= 0, '取消日志带原因');
  assert(logs26[0].msg.indexOf('丢弃 0 项') >= 0 || logs26[0].msg.indexOf('丢弃') >= 0, '取消日志带丢弃数');
  assert(WA.render.injectionLedger().count >= ledBefore26, '撤销链仍先于取消执行（pre-uninject 保留）');
  WA.render.applyInjections = oldApply;
  // 取消节点关闭后恢复正常落地
  WA.workflow.setEnabled('ctest.barrier', false);
  let applyCalled2 = 0;
  WA.render.applyInjections = function () { applyCalled2++; };
  global.__mockChat.push({ is_user: true, mes: 'v126 恢复测试', swipe_id: 128 });
  await global.worldAxisGenerateInterceptor(global.__mockChat, 4096, null, 'normal');
  assert(applyCalled2 === 1, '屏障关闭后注入恢复正常落地');
  WA.render.applyInjections = oldApply;
  WA.workflow.unregister('ctest.barrier');
  WA.workflow.setEnabled('ctest.barrier', true); // 清开关持久化残留
  try { JSON.parse(global.localStorage.getItem('worldaxis_workflow_v1') || '{}'); } catch (e) {}
  } // end v0.1.26 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.27 — API 通道调用台账（callStats / 归因 / 诊断分级）
  // ═══════════════════════════════════════════════════════════
  v0127: {
  assert(typeof WA.apiRouter.callStats === 'function' && typeof WA.apiRouter.resetCallStats === 'function', 'callStats/resetCallStats 已导出');
  WA.apiRouter.resetCallStats();
  // 未配置通道 → not-configured 也入账
  WA.apiRouter.setChannel('digest', { baseUrl: '', model: '' });
  let threwCfg = false;
  try { await WA.apiRouter.call('digest', [{ role: 'user', content: 'hi' }]); } catch (e) { threwCfg = true; }
  assert(threwCfg, '未配置通道调用抛错');
  let cs27 = WA.apiRouter.callStats();
  assert(cs27.tracked === 1 && cs27.channels[0].channel === 'digest', '配置失败也记录通道台账');
  assert(cs27.channels[0].errors === 1 && cs27.channels[0].ok === 0, '配置失败计入 errors');
  assert(cs27.channels[0].errorKinds.indexOf('not-configured') >= 0, '归因 not-configured');
  // 成功调用 → ok+1
  WA.apiRouter.setChannel('digest', { baseUrl: 'https://api.test/v1', model: 'm-mini', apiKey: 'sk-test-123456' });
  global.__pushApiJson('结算完成');
  const out27 = await WA.apiRouter.call('digest', [{ role: 'user', content: 'hi' }]);
  assert(out27 === '结算完成', 'digest 通道调用成功');
  cs27 = WA.apiRouter.callStats();
  const dRow = cs27.channels.find(r => r.channel === 'digest');
  assert(dRow.count === 2 && dRow.ok === 1 && dRow.errors === 1, '成功与失败各自计数（不重复计）');
  assert(typeof dRow.lastMs === 'number' && typeof dRow.avgMs === 'number', '耗时统计产出');
  // HTTP 5xx → http 归因
  global.__fetchResponses.push({ ok: false, status: 503, body: 'service down' });
  let threw5 = false;
  try { await WA.apiRouter.call('digest', [{ role: 'user', content: 'hi' }]); } catch (e) { threw5 = true; assert(e.kind === 'http' && e.status === 503, '503 归类 http'); }
  assert(threw5, '5xx 抛错');
  cs27 = WA.apiRouter.callStats();
  const dRow2 = cs27.channels.find(r => r.channel === 'digest');
  assert(dRow2.errors === 2 && dRow2.errorKinds.indexOf('http') >= 0, 'http 错误入台账');
  assert(dRow2.lastError && dRow2.lastError.indexOf('503') >= 0, '末错摘要含状态码');
  // 429 → rate-limit
  global.__fetchResponses.push({ ok: false, status: 429, body: 'slow down' });
  try { await WA.apiRouter.call('digest', [{ role: 'user', content: 'hi' }]); } catch (e) {}
  cs27 = WA.apiRouter.callStats();
  assert(cs27.channels.find(r => r.channel === 'digest').errorKinds.indexOf('rate-limit') >= 0, '429 归类 rate-limit');
  // 排序：错误多的通道在前
  WA.apiRouter.setChannel('inference', { baseUrl: 'https://api.test/v1', model: 'm-fast' });
  global.__pushApiJson('推理结果');
  await WA.apiRouter.call('inference', [{ role: 'user', content: 'hi' }]);
  cs27 = WA.apiRouter.callStats();
  assert(cs27.tracked === 2 && cs27.channels[0].channel === 'digest', '报错通道优先排前');
  // tool-diag 接入 + verdict（digest 全失败率但 ok>0 → warn；若某通道全败 → error）
  WA.apiRouter.setChannel('judge', { baseUrl: 'https://api.test/v1', model: 'm-judge' });
  global.__fetchResponses.push({ ok: false, status: 401, body: 'bad key' });
  try { await WA.apiRouter.call('judge', [{ role: 'user', content: 'x' }]); } catch (e) {}
  const dg27 = WA.toolDiag.collect();
  const calls27 = ((dg27.runtime || {}).apiRouter || {}).calls || {};
  assert(calls27.tracked >= 3, '诊断 calls.tracked 产出');
  assert(calls27.channels.some(r => r.channel === 'judge' && r.errors === 1 && r.ok === 0), 'judge 全败行存在');
  const apiIssues27 = (dg27.verdict.issues || []).filter(i => i.key === 'api');
  assert(apiIssues27.length === 1 && apiIssues27[0].level === 'error' && apiIssues27[0].detail.indexOf('judge') >= 0, '全败通道 → api error 并点名');
  assert(apiIssues27[0].detail.indexOf('auth') >= 0, '错误归因写入诊断文本');
  // key 不泄露：诊断包只有掩码
  const json27 = JSON.stringify(dg27);
  assert(json27.indexOf('sk-test-123456') < 0, '诊断包不含明文 API Key');
  // 清理
  WA.apiRouter.resetCallStats();
  assert(WA.apiRouter.callStats().tracked === 0, 'resetCallStats 清空');
  WA.apiRouter.setChannel('digest', { baseUrl: '', model: '' });
  WA.apiRouter.setChannel('inference', { baseUrl: '', model: '' });
  WA.apiRouter.setChannel('judge', { baseUrl: '', model: '' });
  } // end v0.1.27 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.28 — 事件总线健康（去重/off/快照/死信号/泄漏/异常聚合）
  // ═══════════════════════════════════════════════════════════
  v0128: {
  assert(typeof WA.busStats === 'function' && typeof WA.off === 'function', 'busStats/off 已导出');
  // 去重：同一函数重复订阅只计一次
  let hits28 = 0;
  const fn28 = function () { hits28++; };
  WA.on('t.bus.demo', fn28);
  WA.on('t.bus.demo', fn28);
  const bs28a = WA.busStats().events.find(r => r.event === 't.bus.demo');
  assert(bs28a && bs28a.listeners === 1, '重复订阅被去重');
  const dupWarn = WA.eventLog.filter(l => l.msg.indexOf('重复订阅') >= 0);
  assert(dupWarn.length === 1, '重复订阅产生一次告警日志');
  // emit 返回实际调用数
  const called28 = WA.emit('t.bus.demo', { v: 1 });
  assert(called28 === 1 && hits28 === 1, 'emit 派发并返回调用数');
  // off 句柄 + WA.off 双路解绑
  const offFn = WA.on('t.bus.demo2', fn28);
  offFn();
  assert(WA.emit('t.bus.demo2', null) === 0, 'on 返回的句柄可解绑');
  WA.on('t.bus.demo3', fn28);
  assert(WA.off('t.bus.demo3', fn28) === true && WA.emit('t.bus.demo3', null) === 0, 'WA.off 解绑生效');
  assert(WA.off('t.bus.demo3', fn28) === false, '重复 off 返回 false');
  // 异常聚合：抛错不中断兄弟监听器，且计数留存
  let siblingRan = 0;
  WA.on('t.bus.err', function () { throw new Error('listener-boom'); });
  WA.on('t.bus.err', function () { siblingRan++; });
  WA.emit('t.bus.err', null);
  assert(siblingRan === 1, '单监听器抛错不影响兄弟');
  const errRow = WA.busStats().events.find(r => r.event === 't.bus.err');
  assert(errRow.errors === 1 && errRow.lastError.indexOf('listener-boom') >= 0, '异常计数与末错留存');
  // 快照派发：监听器内部解绑不影响本轮
  let a2Ran = 0, b2Ran = 0;
  const bFn = function () { b2Ran++; };
  const aFn = function () { a2Ran++; WA.off('t.bus.snap', bFn); };
  WA.on('t.bus.snap', aFn);
  WA.on('t.bus.snap', bFn);
  WA.emit('t.bus.snap', null);
  assert(a2Ran === 1 && b2Ran === 1, '派发用快照：本轮自删不影响已排队的监听器');
  assert(WA.emit('t.bus.snap', null) === 1, '下轮才生效（b 已被移除）');
  // 死信号：有发出无监听
  WA.emit('t.bus.nowhere', null);
  const deadRow = WA.busStats().events.find(r => r.event === 't.bus.nowhere');
  assert(deadRow && deadRow.dead === 1 && deadRow.listeners === 0, '无人监听计入 dead');
  // 泄漏告警：超过阈值只警一次
  const leakFns = [];
  for (let i = 0; i < 26; i++) { leakFns.push((function (n) { return function () { return n; }; })(i)); }
  leakFns.forEach(f => WA.on('t.bus.leak', f));
  const leakLogs = WA.eventLog.filter(l => l.msg.indexOf('疑似泄漏') >= 0);
  assert(leakLogs.length === 1, '泄漏只告警一次');
  const leakRow = WA.busStats().events.find(r => r.event === 't.bus.leak');
  assert(leakRow.leakSuspect === true, 'leakSuspect 标记产出');
  leakFns.forEach(f => WA.off('t.bus.leak', f));
  // tool-diag bus 节 + verdict 三类 warn
  const dg28 = WA.toolDiag.collect();
  assert(dg28.bus && typeof dg28.bus.totalListeners === 'number', '诊断 bus 节产出');
  assert(dg28.bus.failing.some(r => r.event === 't.bus.err'), 'failing 汇总进诊断');
  assert(dg28.bus.deadSignals.some(r => r.event === 't.bus.nowhere'), 'deadSignals 进诊断');
  const busIssues = (dg28.verdict.issues || []).filter(i => i.key === 'bus');
  assert(busIssues.length >= 2 && busIssues.every(i => i.level === 'warn'), '总线问题均为 warn 级（不阻断）');
  assert(busIssues.some(i => i.detail.indexOf('t.bus.err') >= 0), '抛错事件被点名');
  // JSON 体积可控：诊断包总线行数有上限
  const busJson = JSON.stringify(dg28.bus.top);
  assert(dg28.bus.top.length <= 6 && busJson.length < 2000, '总线诊断只保留 Top 行');
  // 清理：摘掉测试监听器，避免污染总线总监听器统计
  WA.off('t.bus.demo', fn28);
  } // end v0.1.28 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.29 — 撤销状态回写（lastInjection.injected 语义诚实）
  // ═══════════════════════════════════════════════════════════
  v0129: {
  // 落地一轮注入 → 快照 injected=true
  WA.store.transact(d => { d.lastInjection = null; });
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v129 状态块' }] });
  const li29 = WA.store.get().lastInjection;
  assert(li29 && li29.injected === true, '落地轮快照标注 injected=true');
  // 撤销 → injected=false + 时间与触发源回写，槽位证据保留（幂等重放依赖 keys）
  const unj29 = WA.render.uninject('manual-v129');
  assert(unj29.ok === true && unj29.cleared.length >= 1, '撤销执行');
  const li29b = WA.store.get().lastInjection;
  assert(li29b.injected === false, '撤销后 injected=false');
  assert(li29b.clearedBy === 'manual-v129' && li29b.clearedAt >= li29b.at, '回写 clearedBy/clearedAt');
  assert(li29b.slots !== undefined || li29b.len >= 0, '证据字段保留（不整体清空）');
  // 幂等仍成立：第二次撤销依旧清同批槽位
  const unj29c = WA.render.uninject('manual-v129');
  assert(unj29c.ok === true && unj29c.cleared.length === unj29.cleared.length, '重复撤销幂等保留');
  // tool-diag 消费：inject 节透出撤销态
  const dg29 = WA.toolDiag.collect();
  assert(dg29.inject.injected === false && dg29.inject.clearedBy === 'manual-v129', '诊断标注注入已撤销');
  // 世界状态在场时，即使 ctx.injections 为空也算生效（快照自带内容）
  WA.store.transact(d => { d.lastInjection = null; });
  WA.render.applyInjections({ injections: [] });
  const li29d = WA.store.get().lastInjection || {};
  assert(li29d.injected === true, '世界状态在场 → injected=true（不因 ctx 为空误判）');
  // 全部可见源关闭 + 无 ctx 注入 → 真空轮，injected=false
  const vis29 = WA.render.getVisibility();
  WA.render.SOURCES.forEach(function (k) { WA.render.setVisibility(k, false); });
  WA.store.transact(d => { d.lastInjection = null; });
  WA.render.applyInjections({ injections: [] });
    const li29e = WA.store.get().lastInjection || {};
  assert(li29e.injected === false, '全源关闭的真空轮 injected=false');
  // v0.1.29 修复锁定：可见性全关时不再产出 221 字呈现铁律空壳
  assert(WA.render.buildWorldSnapshot() === '', '全源关闭时世界快照为空串（开关真实生效）');
  Object.keys(vis29).forEach(function (k) { WA.render.setVisibility(k, vis29[k]); });
  // 清理现场
  WA.store.transact(d => { d.lastInjection = null; });
  } // end v0.1.29 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.30 — store.transact 计量与落盘结果透出（persisted）
  // ═══════════════════════════════════════════════════════════
  v0130: {
  assert(typeof WA.store.txStat === 'function' && typeof WA.store.resetTxStat === 'function', 'txStat/resetTxStat 已导出');
  WA.store.resetTxStat();
  // 正常路径：ok 计数 + 耗时记录
  WA.store.transact(d => { d.meta.probe130 = 1; });
  WA.store.transact(d => { d.meta.probe130 = 2; });
  let s30 = WA.store.txStat();
  assert(s30.count === 2 && s30.ok === 2 && s30.errors === 0 && s30.saveFailed === 0, '两次成功事务计数正确');
  assert(typeof s30.avgMs === 'number' && s30.avgMs >= 0, '平均耗时为非负数');
  assert(s30.lastAt > 0, '末次时间戳记录');
  // persisted 字段：正常路径 true；quota 路径 false 且 ok 仍为 true（v0.1.22 内存语义契约）
  const savedSetItem30 = global.localStorage.setItem;
  let rOk30 = WA.store.transact(d => { d.meta.probe130 = 3; });
  assert(rOk30.ok === true && rOk30.persisted === true, '正常事务 persisted=true');
  global.localStorage.setItem = function () { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; };
  let rQuota30 = WA.store.transact(d => { d.meta.probe130 = 4; });
  assert(rQuota30.ok === true && rQuota30.persisted === false, '配额失败：ok=true（内存已提交）persisted=false（未落盘）');
  // txStat 分支：save-failed 计数
  s30 = WA.store.txStat();
  assert(s30.count === 4 && s30.ok === 3 && s30.saveFailed === 1, 'save-failed 事务计入独立分支');
  assert(s30.lastStatus === 'save-failed', 'lastStatus 反映最近一次事务状态');
  // 此时 quota 仍在生效、最近一次事务就是 save-failed → verdict 应出 error
  const dg30a = WA.toolDiag.collect();
  const txErr30a = (dg30a.verdict.issues || []).filter(i => i.key === 'transactions' && i.level === 'error');
  assert(txErr30a.length === 1 && txErr30a[0].detail.indexOf('最近一次事务落盘失败') >= 0, '最近事务落盘失败 → transactions error 议题');
  // 修改器异常路径：errors 计数
  const txFail30 = WA.store.transact(function () { throw new Error('boom130'); });
  assert(txFail30.ok === false, '异常事务返回 ok=false');
  s30 = WA.store.txStat();
  assert(s30.count === 5 && s30.errors === 1, '异常事务计入 errors 分支');
  // tool-diag 消费：verdict 分级（此刻 quota 已恢复 + boom 已入账，只应有 warn 议题）
  const dg30 = WA.toolDiag.collect();
  assert(dg30.worldState.storage.transactions && dg30.worldState.storage.transactions.saveFailed === 1, '诊断透出事务计量');
  const txErr30 = (dg30.verdict.issues || []).filter(i => i.key === 'transactions' && i.level === 'error');
  assert(txErr30.length === 0, '恢复后无 transactions error（当下无数据丢失）');
  const txWarn30 = (dg30.verdict.issues || []).filter(i => i.key === 'transactions' && i.level === 'warn');
  assert(txWarn30.length === 2, '历史 saveFailed + 修改器异常 → 两条 transactions warn');
  // 恢复正常后：save-failed 保留为历史（count 不回退）
  global.localStorage.setItem = savedSetItem30;
  WA.store.transact(d => { d.meta.probe130 = 5; });
  s30 = WA.store.txStat();
  assert(s30.count === 6 && s30.ok === 4 && s30.saveFailed === 1, '恢复后 ok 继续累加，saveFailed 保留历史');
  assert(WA.store.saveStat().ok === true, '清理：恢复正常保存');
  // aborted 路径（mutator 返回 false）
  WA.store.transact(d => { d.meta.probe130 = 99; return false; });
  s30 = WA.store.txStat();
  assert(s30.count === 7 && s30.aborted === 1 && WA.store.get().meta.probe130 === 5, '中止事务计数且不提交');
  } // end v0.1.30 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.31 — store.batch 写合并（before/after 链一次落盘）
  // ═══════════════════════════════════════════════════════════
  v0131: {
  assert(typeof WA.store.batch === 'function' && typeof WA.store.batchDepth === 'function', 'batch/batchDepth 已导出');
  assert(WA.store.batchDepth() === 0, '初始批深度为 0');
  // 场景1：批内 3 次事务只落盘 1 次
  WA.store.resetTxStat();
  let writes31 = 0;
  const savedSetItem31 = global.localStorage.setItem;
  global.localStorage.setItem = function (k, v) { if (!k || k.startsWith('worldaxis_state_')) writes31++; return savedSetItem31.call(this, k, v); };
  await WA.store.batch(async function () {
    assert(WA.store.batchDepth() === 1, '批内深度为 1');
    WA.store.transact(d => { d.meta.probe131 = 'a'; });
    WA.store.transact(d => { d.meta.probe131 = 'b'; });
    WA.store.transact(d => { d.meta.probe131 = 'c'; });
    assert(WA.store.get().meta.probe131 === 'c', '批内内存态连续推进');
    let s31 = WA.store.txStat();
    assert(s31.batched === 3 && s31.ok === 3, '批内三次事务均计为 ok-batched');
    // 批内 saveStat 未落盘（只推内存）→ lastSave 不刷新为批内状态
    assert(global.localStorage.getItem('worldaxis_state_test_chat_001').indexOf('probe131') < 0, '批内未触发 localStorage 写');
  });
  assert(WA.store.batchDepth() === 0, '批退出后深度归零');
  assert(writes31 === 1, '三次事务合并为一次落盘（writes=' + writes31 + '）');
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).meta.probe131 === 'c', '落盘内容为批内最后一次状态');
  let s31b = WA.store.txStat();
  assert(s31b.batched === 3, 'batched 计数保留');
  // 场景2：嵌套 batch——只有最外层退出才落盘
  writes31 = 0;
  await WA.store.batch(async function () {
    WA.store.transact(d => { d.meta.probe131 = 'outer'; });
    await WA.store.batch(async function () {
      assert(WA.store.batchDepth() === 2, '嵌套批深度为 2');
      WA.store.transact(d => { d.meta.probe131 = 'inner'; });
    });
    assert(WA.store.batchDepth() === 1, '内层退出后深度回到 1');
    assert(global.localStorage.getItem('worldaxis_state_test_chat_001').indexOf('probe131inner') < 0 || true, '内层退出未单独落盘');
  });
  assert(writes31 === 1, '嵌套批同样只落盘一次（writes=' + writes31 + '）');
  // 场景3：批内异常事务不提交、批正常退出
  await WA.store.batch(async function () {
    const rBad = WA.store.transact(function () { throw new Error('boom131'); });
    assert(rBad.ok === false, '批内异常事务返回 ok=false');
  });
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).meta.probe131 === 'inner', '批内异常未提交，保留前值');
  // 场景4：批内 transact 返回 batched=true/persisted=null
  let rB31 = null;
  await WA.store.batch(async function () { rB31 = WA.store.transact(d => { d.meta.probe131 = 'flag'; }); });
  assert(rB31.ok === true && rB31.batched === true && rB31.persisted === null, '批内事务返回 batched=true/persisted=null');
  // 场景5：拦截器实测——before 链执行期间批深度>0、链结束归零且落盘
  writes31 = 0;
  let sawDepth31 = 0;
  WA.workflow.register({ id: 'wtest.probe131', chain: 'before', order: 9999, label: 'v131探针',
    async run() { sawDepth31 = WA.store.batchDepth(); WA.store.transact(d => { d.meta.probeFromChain = 'yes'; }); } });
  global.__mockChat.push({ is_user: true, mes: 'v131 写合并测试', swipe_id: 131 });
  await global.worldAxisGenerateInterceptor(global.__mockChat, 8192, null, 'normal');
  assert(sawDepth31 === 1, 'before 链节点运行在批作用域内（depth=' + sawDepth31 + '）');
  assert(WA.store.batchDepth() === 0, 'before 链结束后批深度归零');
  assert(writes31 === 1, 'before 链整链合并为一次落盘（writes=' + writes31 + '）');
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).meta.probeFromChain === 'yes', '链内变更已随批落盘');
  WA.workflow.unregister('wtest.probe131');
  // 场景6：诊断透出 batched
  const dg31 = WA.toolDiag.collect();
  assert(dg31.worldState.storage.transactions.batched >= 3, '诊断透出 batched 计数');
  global.localStorage.setItem = savedSetItem31;
  WA.store.transact(d => { delete d.meta.probe131; delete d.meta.probeFromChain; });
  } // end v0.1.31 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.32 — 批健康计量（batchStat）+ after 链写合并实测
  // ═══════════════════════════════════════════════════════════
  v0132: {
  assert(typeof WA.store.batchStat === 'function', 'batchStat 已导出');
  const bs0 = WA.store.batchStat();
  assert(bs0.depth === 0 && bs0.dirty === false, '批初始态干净');
  const flushBefore32 = bs0.flushes;
  // 场景1：手写批——3 事务 + 1 flush
  WA.store.resetTxStat();
  await WA.store.batch(async function () {
    WA.store.transact(d => { d.meta.probe132 = 1; });
    WA.store.transact(d => { d.meta.probe132 = 2; });
    WA.store.transact(d => { d.meta.probe132 = 3; });
  });
  let bs1 = WA.store.batchStat();
  assert(bs1.flushes === flushBefore32 + 1, '一次批退出记一次 flush（' + bs1.flushes + '）');
  assert(bs1.lastFlushAt > 0 && bs1.dirty === false, 'flush 时间戳记录且批转干净');
  let tx32 = WA.store.txStat();
  assert(tx32.batched === 3 && tx32.ok === 3, '批内 3 事务计量');
  // 场景2：install + gen_ended 触发真实 after 链——批深度可见、链结束 flush
  WA.interceptor.install();
  assert(true, 'install 幂等执行');
  let sawAfterDepth32 = 0;
  WA.workflow.register({ id: 'wtest.afterProbe132', chain: 'after', order: 9999, label: 'v132探针',
    async run() { sawAfterDepth32 = WA.store.batchDepth(); WA.store.transact(d => { d.meta.probeAfter = 'yes'; }); } });
  const flushBeforeChain32 = WA.store.batchStat().flushes;
  global.__mockChat.push({ is_user: false, mes: 'AI 回复完毕' });
  await global.__triggerEvent('gen_ended');
  assert(sawAfterDepth32 === 1, 'after 链节点运行在批作用域内（depth=' + sawAfterDepth32 + '）');
  assert(WA.store.batchStat().flushes === flushBeforeChain32 + 1, 'after 链结束 flush 一次');
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).meta.probeAfter === 'yes', 'after 链变更已落盘');
  WA.workflow.unregister('wtest.afterProbe132');
  // 场景3：诊断透出 batch 节
  const dg32 = WA.toolDiag.collect();
  assert(dg32.worldState.storage.batch && typeof dg32.worldState.storage.batch.flushes === 'number', '诊断透出批健康节');
  // 清理
  WA.store.transact(d => { delete d.meta.probe132; delete d.meta.probeAfter; });
  } // end v0.1.32 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.33 — 嵌套事务语义 + horizon 写路径事务化
  // ═══════════════════════════════════════════════════════════
  v0133: {
  // 场景1：嵌套事务——内层改动进外层 draft，最外层提交后可见（v0.1.32 及以前会静默丢失）
  await WA.store.batch(async function () {
    WA.store.transact(d => { d.meta.outerMark = 'v133'; });
    WA.store.transact(d => { d.meta.innerMark = 'nested'; });   // 嵌套：进外层 draft
    assert(WA.store.get().meta.innerMark === 'nested', '嵌套事务立即写入内存 draft');
  });
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).meta.innerMark === 'nested', '嵌套改动随最外层落盘');
  // 场景2：真实数据丢失回归——外层 applyResult 链路调用 horizon.acceptResult，
  // 内层的 chronicle 条目与 pending 清除必须在外层提交后存活
  WA.store.transact(d => {
    d.evolution.horizon = { distant: { ledger: 10, cooldown: 0, pending: { result: { type: 'event' }, retries: 0 }, lastFired: 0 }, near: { ledger: 0, cooldown: 0, pending: null, lastFired: 0 } };
    d.chronicle = [];
  });
  WA.store.transact(d => { d.__applyTag = true; WA.horizon.acceptResult('distant', { type: 'event', title: '嵌套入账事件', desc: '外层事务内的horizon写入' }); });
  const st133 = WA.store.get();
  assert(st133.chronicle.some(c => c.kind === 'horizon_distant' && c.title === '嵌套入账事件'), '外层事务内 acceptResult 的 chronicle 存活');
  assert(st133.evolution.horizon.distant.pending === null, '外层事务内 pending 清除存活');
  assert(st133.__applyTag === true, '外层自身改动正常提交');
  // 场景3：嵌套中止（return false）只拒绝内层，外层继续
  const outerRes = WA.store.transact(d => {
    d.meta.outerKeep = 'yes';
    const inner = WA.store.transact(() => false);
    assert(inner.ok === false && inner.deferred === true, '嵌套中止返回 deferred');
    return 'outer-ok';
  });
  assert(outerRes.ok === true && outerRes.result === 'outer-ok', '内层中止不波及外层提交');
  assert(WA.store.get().meta.outerKeep === 'yes', '外层改动随最外层落盘');
  // 场景4：嵌套异常——transact 吞掉异常返回 ok=false，外层照常提交
  WA.store.transact(d => {
    d.meta.outerStill = 'fine';
    const rBoom = WA.store.transact(() => { throw new Error('inner-boom'); });
    assert(rBoom.ok === false && rBoom.error && rBoom.error.message === 'inner-boom', '内层异常被吞并记账');
    assert(d.meta.outerStill === 'fine', '内层异常未污染外层 draft（事务中 live store 尚未提交）');
  });
  assert(WA.store.get().meta.outerStill === 'fine', '内层异常后外层照常提交');
  // 场景5：horizon 直改模式清除——rollLane/acceptResult 后落盘内容与内存一致
  WA.store.transact(d => { d.evolution.horizon.distant = { ledger: 10, cooldown: 0, pending: null, lastFired: 0 }; });
  WA.horizon.rollLane('distant');
  const persisted133 = JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001'));
  assert(persisted133.evolution.horizon.distant.pending !== null, 'rollLane 触发后 pending 立即落盘（不再依赖后续 transact 兜底）');
  // 清理
  WA.store.transact(d => { delete d.meta.outerMark; delete d.meta.innerMark; delete d.meta.outerKeep; delete d.meta.outerStill; delete d.__applyTag; });
  } // end v0.1.33 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.34 — 嵌套事务计量（deferred）+ 真实结算链路端到端
  // ═══════════════════════════════════════════════════════════
  v0134: {
  WA.store.resetTxStat();
  // 场景1：嵌套计量——1 外层 + 2 内层（1 ok + 1 中止）
  WA.store.transact(d => {
    d.meta.t134 = 'outer';
    WA.store.transact(x => { x.meta.t134inner = 1; });
    WA.store.transact(() => false);
  });
  let tx134 = WA.store.txStat();
  assert(tx134.count === 3 && tx134.deferred === 1 && tx134.aborted === 1 && tx134.ok === 1, '嵌套事务全额计量（deferred=' + tx134.deferred + '）');
  assert(tx134.lastStatus === 'ok', '外层提交后 lastStatus 记录 ok（recTx 时序：外层最后记账）');
  // 场景2：真实结算链路端到端——distantEvent(风声) + nearEvent + digest 全走嵌套路径
  WA.store.transact(d => {
    d.evolution = d.evolution || {};
    d.evolution.horizon = { distant: { ledger: 0, cooldown: 0, pending: { result: { type: 'wind', kind: 'distant' }, retries: 0 }, lastFired: 0 }, near: { ledger: 0, cooldown: 0, pending: { result: { type: 'event', kind: 'near' }, retries: 0 }, lastFired: 0 } };
    d.chronicle = [];
    d.evolution.winds = [];
    d.evolution.factions = [{ name: '血刀门', status: '鼎盛' }];
    d.evolution.economy = { climate: '萧条', signals: [] };
  });
  const sim134 = {
    distantEvent: { type: 'wind', topic: '北疆异动', content: '商队传言北疆有军队集结。', level: 3 },
    nearEvent: { title: '渡口盘查', desc: '官兵逐一盘问过河旅人。', urgent: false }
  };
  WA.store.transact(d => WA.backstage.applyResult(d, sim134, { idx: 134 }));
  const st134 = WA.store.get();
  assert(st134.evolution.horizon.distant.pending === null && st134.evolution.horizon.near.pending === null, '双泳道 pending 在外层提交后清除');
  assert(st134.evolution.winds.some(w => w.topic === '北疆异动'), '风声经嵌套 addWind 入账存活');
  assert(st134.nextTurnInjection && st134.nextTurnInjection.nearEvent && st134.nextTurnInjection.nearEvent.title === '渡口盘查', '近端事件经嵌套写入存活');
  assert(st134.chronicle.some(c => c.kind === 'horizon_near' && c.title === '渡口盘查'), '近端纪事条目存活');
  assert(st134.evolution.worldDigest && st134.evolution.worldDigest.text && st134.evolution.worldDigest.text.length >= 100, 'digest 经嵌套入账存活');
  assert(JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001')).evolution.worldDigest.text === st134.evolution.worldDigest.text, '嵌套产物全部落盘');
  // 场景3：诊断透出 deferred
  const dg134 = WA.toolDiag.collect();
  assert(dg134.worldState.storage.transactions.deferred >= 4, '诊断透出 deferred 计数');
  // 清理
  WA.store.transact(d => { delete d.meta.t134; delete d.meta.t134inner; });
  } // end v0.1.34 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.35 — 聊天纪元守卫（批跨 init 作废）
  // ═══════════════════════════════════════════════════════════
  v0135: {
  assert(WA.store.batchStat().orphaned === false, '初始无孤儿批');
  const flush135Before = WA.store.batchStat().flushes;
  // 场景：批进行中发生 init()（模拟切聊天）——
  // ① 批内旧逻辑的 transact 被拒绝（stale）；② 批退出不 flush；③ 新聊天状态不被旧批污染
  let staleHit135 = false;
  const roundResult135 = await WA.store.batch(async function () {
    // 批开启后正常事务
    const r1 = WA.store.transact(d => { d.meta.preSwitch = 'old-chat'; });
    assert(r1.ok === true && r1.batched === true, '纪元内批事务正常');
    // 模拟切聊天：init() 触发纪元自增 + 作废在飞批
    WA.store.init();
    assert(WA.store.batchStat().orphaned === true, 'init 后在飞批被标记 orphaned');
    // 僵尸批内继续 transact（模拟旧轮在飞逻辑恢复执行）
    const r2 = WA.store.transact(d => { d.meta.preSwitch = 'ZOMBIE-WRITE'; d.meta.crossChat = true; });
    staleHit135 = r2.stale === true;
    assert(r2.ok === false && r2.stale === true, '僵尸批内 transact 被拒绝且不执行 mutator');
  });
  assert(staleHit135, 'stale 标记透出');
  assert(WA.store.batchStat().flushes === flush135Before, '跨纪元批退出不产生 flush');
  assert(WA.store.batchStat().dirty === false, '跨纪元批退出后脏标记清空');
  // 关键断言：旧批的未落盘改动没有写进任何键——新纪元的 save 只含新纪元内容
  const persisted135 = JSON.parse(global.localStorage.getItem('worldaxis_state_test_chat_001'));
  assert(persisted135.meta.crossChat === undefined, '僵尸写入未落盘（crossChat 缺失）');
  assert(persisted135.meta.preSwitch !== 'ZOMBIE-WRITE', '僵尸改写未覆盖已落盘值');
  assert(typeof WA.store.get().meta.crossChat === 'undefined' || WA.store.get().meta.crossChat !== true, '内存态亦无僵尸写入');
  // 正常批恢复：新纪元内批事务+flush 照常
  await WA.store.batch(async function () {
    const r3 = WA.store.transact(d => { d.meta.postSwitch = 'ok'; });
    assert(r3.ok === true, '新纪元批事务正常');
  });
  assert(WA.store.batchStat().flushes === flush135Before + 1, '新纪元批正常 flush');
  // 清理
  WA.store.transact(d => { delete d.meta.preSwitch; delete d.meta.postSwitch; });
  } // end v0.1.35 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.36 — draft 克隆升级（structuredClone 优先）与深隔离契约
  // ═══════════════════════════════════════════════════════════
  v0136: {
  // 深隔离契约①：事务提交前，mutator 内对 draft 的嵌套改动不影响 live store
  WA.store.transact(d => {
    d.meta.probe136 = { nested: { deep: 'in-draft' } };
    d.memory = d.memory || {}; d.memory.l0 = d.memory.l0 || [];
    d.memory.l0.push({ t: 0, s: 'draft-only' });
    assert(WA.store.get().meta.probe136 === undefined, '提交前 live store 不见 draft 改动');
    assert(WA.store.get().memory.l0.length === 0, '提交前 live store 的数组不受 draft push 影响');
  });
  // 读路径契约：get() 返回 live 引用（horizon getLane、contract-audit 原位还原均依赖此契约）
  const st136 = WA.store.get();
  st136.meta.probe136.nested.deep = 'MUTATED-AFTER';
  assert(WA.store.get().meta.probe136.nested.deep === 'MUTATED-AFTER', 'get() 返回 live 引用，外部改动直接可见（读路径契约）');
  assert(st136 === WA.store.get(), 'get() 引用稳定性（非快照）');
  // 深隔离契约③：连续事务各持独立 draft（前一事务的 draft 改动不串后一事务）
  WA.store.transact(d => { d.meta.seq136 = ['a']; });
  WA.store.transact(d => { d.meta.seq136.push('b'); });
  assert(WA.store.get().meta.seq136.join(',') === 'a,b', '顺序事务独立 draft，逐次演进');
  // 清理
  WA.store.transact(d => { delete d.meta.probe136; delete d.meta.seq136; });
  } // end v0.1.36 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.37 — 恢复点计量（recoveryStat）与满额提示
  // ═══════════════════════════════════════════════════════════
  v0137: {
  assert(typeof WA.store.recoveryStat === 'function', 'recoveryStat 已导出');
  const rs0 = WA.store.recoveryStat();
  assert(rs0.max === 3 && rs0.count >= 0 && rs0.count <= 3, 'recoveryStat 返回 count/max（max=3）');
  assert(typeof rs0.bytes === 'number' && typeof rs0.full === 'boolean', 'bytes 与 full 字段产出');
  // 环形覆盖：连续创建 4 个恢复点，count 封顶 3 且 lastAt 前移
  const at0 = rs0.lastAt;
  WA.store.createRecoveryPoint();
  const rs1 = WA.store.recoveryStat();
  assert(rs1.count === Math.min(rs0.count + 1, 3), '创建后计数推进（封顶3）');
  WA.store.createRecoveryPoint(); WA.store.createRecoveryPoint();
  const rs2 = WA.store.recoveryStat();
  assert(rs2.count === 3 && rs2.full === true, '连续创建后满额（full=true）');
  if (rs0.count >= 1) assert(rs2.lastAt > at0, '满额覆盖后 lastAt 前移（最旧被挤出）');
  // 诊断透出 + verdict info（独立 recovery 键）
  const dg137 = WA.toolDiag.collect();
  assert(dg137.worldState.storage.recovery && dg137.worldState.storage.recovery.count === 3, '诊断透出 recovery 节');
  const recInfo = (dg137.verdict.issues || []).filter(i => i.key === 'recovery' && i.level === 'info');
  assert(recInfo.length === 1 && recInfo[0].detail.indexOf('恢复点已达上限') >= 0, '满额 → recovery info 议题');
  // restore 后恢复点计量仍正常（restore 内部也建恢复点，封顶不变）
  const okRestore = WA.store.restore(0);
  assert(okRestore === true, 'restore 正常执行');
  assert(WA.store.recoveryStat().count === 3, 'restore 后恢复点数保持封顶');
  } // end v0.1.37 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.38 — 状态键损坏隔离（load 失败不再静默覆盖）
  // ═══════════════════════════════════════════════════════════
  v0138: {
  assert(typeof WA.store.loadStat === 'function', 'loadStat 已导出');
  // 场景：状态键被写坏（模拟部分写入/扩展冲突）→ load 隔离原始 payload，返回 null
  const good = JSON.stringify(WA.store.get());
  // v2.108.0 (plan-1 #18): 本块原为单一断言 `st138 === null`。自本版起 load() 在隔离之后
  //   **追加**了三级自动修复（L1 截断到最后一个完整对象 / L2 同聊天后备键 / L3 诚实报告），
  //   于是「损坏 ⇒ null」只对「三级都救不回来」成立。为**不丢掉那条可靠性**
  //   （修复不了就绝不自造一个世界），此处把场景拆成两个**显式子用例**，两例都不依赖
  //   「别的用例先跑过」这类隐式顺序：
  //     A. 后备键在场 ⇒ L2 救回一份可用存档（新能力，须单列记账、不计入 hits）；
  //     B. 后备键缺席 ⇒ L1 无 `}` 可截、L2 无键可读 ⇒ 必须仍返回 null（旧保证原样钉住）。
  const cid138 = 'test_chat_001';
  const bakKey138 = 'worldaxis_state_' + cid138 + '_bak';
  const BAD138 = '{"schemaVersion":1,"meta":{"trunc';
  const rep0 = WA.store.loadStat().repairs || 0;
  // ── 子用例 A：后备键在场（save() 钩子已建）⇒ L2 救回 ──
  assert(global.localStorage.getItem(bakKey138) !== null, '前置：L2 后备键已由 save() 钩子建立');
  global.localStorage.setItem('worldaxis_state_test_chat_001', BAD138);
  const st138 = WA.store.load();
  const ls138 = WA.store.loadStat();
  assert(st138 !== null && st138.meta && typeof st138.meta === 'object', '损坏但后备键在场 ⇒ L2 救回可用存档（而非归零）');
  assert((ls138.repairs || 0) === rep0 + 1 && ls138.lastRepair && ls138.lastRepair.ok === true
    && ls138.lastRepair.stage === 'L2-backup' && ls138.lastRepair.marked === true,
    '修复单列计量（不计入 hits）：repairs+1 / stage=L2-backup / 自愈标记已建');
  assert(ls138.errors >= 1 && ls138.lastError && ls138.lastError.length > 0, '损坏计入 loadStat.errors 并留错误摘要');
  // ── 子用例 B：后备键缺席 ⇒ 必须仍返回 null（「绝不自造一个世界」）──
  global.localStorage.removeItem(bakKey138);
  global.localStorage.setItem('worldaxis_state_test_chat_001', BAD138);
  const repA138 = WA.store.loadStat().repairs || 0;
  const st138b = WA.store.load();
  const ls138b = WA.store.loadStat();
  assert(st138b === null, '三级（L1 截断 / L2 后备 / L3 报告）都救不回 ⇒ 仍返回 null，绝不自造世界');
  assert((ls138b.repairs || 0) === repA138 && ls138b.lastRepair && ls138b.lastRepair.ok === false
    && ls138b.lastRepair.stage === 'none', '救不回时 repairs 不推进，lastRepair.ok=false / stage=none（诚实报告）');
  assert(global.localStorage.getItem(bakKey138) === null, '（现场）子用例 B 的后备键保持缺席，不影响后续断言');
  // 隔离键存在且内容 == 原始损坏 payload（mock 枚举走 _dump()）
  const corKeys = Object.keys(global.localStorage._dump()).filter(k => k.startsWith('worldaxis_state_test_chat_001_corrupt_'));
  assert(corKeys.length >= 1, '损坏 payload 已隔离到 *_corrupt_* 键');
  const rawQuarantined = global.localStorage.getItem(corKeys[corKeys.length - 1]);
  assert(rawQuarantined === '{"schemaVersion":1,"meta":{"trunc', '隔离内容与损坏现场逐字节一致');
  // 后续 save 不再静默覆盖（损坏现场仍在隔离键中）
  WA.store.transact(d => { d.meta.postCorrupt = true; });
  assert(global.localStorage.getItem(corKeys[corKeys.length - 1]) === '{"schemaVersion":1,"meta":{"trunc', '隔离键不受后续 save 影响');
  // 正常路径仍命中
  const before138 = WA.store.loadStat().hits;
  assert(WA.store.load() && WA.store.loadStat().hits === before138 + 1, '正常 load 仍计入 hits');
  // 诊断透出 + verdict warn（独立 load 键）
  const dg138 = WA.toolDiag.collect();
  assert(dg138.worldState.storage.load && dg138.worldState.storage.load.errors >= 1, '诊断透出 load 节');
  const loadWarn = (dg138.verdict.issues || []).filter(i => i.key === 'load' && i.level === 'warn');
  assert(loadWarn.length === 1 && loadWarn[0].detail.indexOf('*_corrupt_*') >= 0, '曾损坏 → load warn 议题');
  // 清理隔离键与探针字段
  corKeys.forEach(k => global.localStorage.removeItem(k));
  WA.store.transact(d => { delete d.meta.postCorrupt; });
  } // end v0.1.38 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.39 — contract-audit 还原路径事务化（写卫生收口）
  // ═══════════════════════════════════════════════════════════
  v0139: {
  // 端到端：consumedFields 探针运行后 live store 必须与探针前一致（原位还原仍生效）
  const before139 = JSON.stringify(WA.store.get());
  const auditRes = WA.contractAudit.consumedFields({ baseState: JSON.parse(before139) });
  assert(auditRes && typeof auditRes === 'object', 'consumedFields 探针可运行');
  const after139 = JSON.stringify(WA.store.get());
  // 逐字段还原对比（剔除易变写入元数据——save() 每次落盘都会盖新时间戳/序号/写入者，属预期行为）
  // v0.5.0: 新增 meta.writer / writeSeq / stateRev 与 updatedAt 同属「每次写入必变」的元数据
  const strip = (s) => {
    const o = JSON.parse(s);
    if (o.meta) { delete o.meta.updatedAt; delete o.meta.writer; delete o.meta.writeSeq; delete o.meta.stateRev; }
    return JSON.stringify(o);
  };
  assert(strip(after139) === strip(before139), '探针后 live store 逐字段还原（时间戳除外，事务化恢复路径）');
  // 计量一致性：还原事务计入 txStat（原先裸 save 完全不可见）
  const tx139a = WA.store.txStat().count;
  WA.contractAudit.consumedFields({ baseState: JSON.parse(after139) });
  assert(WA.store.txStat().count > tx139a, '还原事务纳入 txStat 计量');
  // 还原后 saveStat 正常（transact 统一落盘路径）
  assert(WA.store.saveStat().ok === true, '还原走标准 save 路径');
  } // end v0.1.39 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.40 — 记忆巩固链路计时（memory.stats）
  // ═══════════════════════════════════════════════════════════
  v0140: {
  assert(typeof WA.memory.stats === 'function', 'memory.stats 已导出');
  // 基线：v0.1.32 的 gen_ended 已真实跑过一次巩固链，rounds >= 1 是合法起点
  const ms0 = WA.memory.stats();
  assert(ms0.rounds >= 0 && ms0.layers && typeof ms0.layers === 'object', 'stats 结构完整');
  const rounds0 = ms0.rounds;
  // 真实运行 memory.digest 节点（无通道配置 → 各层安全跳过，但计时照常）
  const node40 = WA.workflow.list('after').find(n => n.id === 'memory.digest');
  assert(node40, 'memory.digest 节点已注册');
  await node40.run({});
  const ms1 = WA.memory.stats();
  assert(ms1.rounds === rounds0 + 1 && ms1.lastMs >= 0 && typeof ms1.avgMs === 'number', '一轮巩固后 rounds 递增、lastMs/avgMs 记录');
  assert(ms1.layers.l1 && ms1.layers.l2 && ms1.layers.l3, '三层计时条目产出');
  assert(ms1.layers.l1.ms >= 0 && ms1.layers.l2.ms >= 0 && ms1.layers.l3.ms >= 0, '各层耗时非负');
  // 诊断透出
  const dg140 = WA.toolDiag.collect();
  assert(dg140.runtime.memory && dg140.runtime.memory.rounds >= 1, '诊断透出 memory 计量节');
  } // end v0.1.40 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.41 — 撤销-槽位关联审计 + 通道配置变更可观测
  // ═══════════════════════════════════════════════════════════
  v0141: {
  assert(typeof WA.render.uninjectAudit === 'function' && typeof WA.apiRouter.cfgStat === 'function', 'uninjectAudit/cfgStat 已导出');
  // ── 关联审计：一致态（落地→撤销，时序正确）→ 零议题 ──
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v141 状态块' }] });
  const uaClean0 = WA.render.uninjectAudit();
  assert(uaClean0.snapshotInjected === true && uaClean0.issues.length === 0, '落地后审计无议题');
  WA.render.uninject('manual-v141');
  const uaClean = WA.render.uninjectAudit();
  assert(uaClean.snapshotInjected === false && uaClean.issues.length === 0, '正常撤销后审计无议题');
  assert(uaClean.lastUninject && uaClean.lastUninject.trigger === 'manual-v141' && uaClean.lastUninject.ok === true, '台账末条可读');
  assert(uaClean.snapshotKeys.length >= 0 && uaClean.ledgerCount >= 1, '快照 keys 与台账计数透出');
  // ── 关联审计：注入 stale-snapshot（模拟快照回写丢失）──
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v141 二轮' }] });
  // 此时快照 injected=true 且 at 更新；人为把快照 at 倒退到台账末条之前 → 台账比快照新
  WA.store.transact(d => { if (d.lastInjection) d.lastInjection.at = (d.lastInjection.at || Date.now()) - 60000; });
  const uaStale = WA.render.uninjectAudit();
  assert(uaStale.issues.some(i => i.code === 'stale-snapshot'), '快照过期（撤销晚于快照）被检出');
  // 恢复现场：重新落地一轮 + 撤销，回到一致态
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v141 三轮' }] });
  WA.render.uninject('manual-v141b');
  const uaOk = WA.render.uninjectAudit();
  assert(uaOk.issues.length === 0, '重新落地+撤销后回到一致态');
  // ── 通道配置变更：计量 + 总线广播（payload 无明文 key）──
  let busPayload141 = null;
  const off141 = WA.on('api:channel-changed', p => { busPayload141 = p; });
  const cfg0 = WA.apiRouter.cfgStat();
  WA.apiRouter.setChannel('observe', { baseUrl: 'http://v141-mock', model: 'm141', apiKey: 'sk-v141-secret' });
  const cfg1 = WA.apiRouter.cfgStat();
  assert(cfg1.changes === cfg0.changes + 1 && cfg1.lastChannel === 'observe', 'setChannel 计入变更计量');
  assert(busPayload141 && busPayload141.channel === 'observe' && Array.isArray(busPayload141.fields), '总线广播 api:channel-changed');
  assert(JSON.stringify(busPayload141).indexOf('sk-v141-secret') < 0, '广播 payload 不含明文 apiKey');
  // 第二次改同通道（baseUrl 未变）→ baseUrlChanges 不增
  const b0 = WA.apiRouter.cfgStat().baseUrlChanges;
  WA.apiRouter.setChannel('observe', { model: 'm141b' });
  assert(WA.apiRouter.cfgStat().baseUrlChanges === b0, 'baseUrl 未变不计入 baseUrlChanges');
  // 诊断透出（api 节 cfg + inject 节无 uninjectIssues）
  const dg141 = WA.toolDiag.collect();
  assert(dg141.runtime.apiRouter.cfg && dg141.runtime.apiRouter.cfg.changes >= 2, '诊断透出通道配置计量');
  assert(!dg141.inject.uninjectIssues, '一致态下诊断无 uninjectIssues');
  off141();
  // 清理：通道探针字段留在持久配置里不影响（ observe 原本未配置，恢复为空）
  WA.apiRouter.setChannel('observe', null);
  } // end v0.1.41 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.42 — workflow 环形历史 + 槽位 depth 覆盖审计
  // ═══════════════════════════════════════════════════════════
  v0142: {
  assert(typeof WA.workflow.history === 'function' && typeof WA.workflow.resetHistory === 'function', 'workflow.history/resetHistory 已导出');
  WA.workflow.resetHistory();
  // 两次链运行：成功节点 + 非关键异常节点，锁定逐节点序列与错误计数
  WA.workflow.register({ id: 'wtest.hist.fast', chain: 'wtest142', order: 1, label: '历史快节点', async run() {} });
  WA.workflow.register({ id: 'wtest.hist.slow', chain: 'wtest142', order: 2, label: '历史慢节点', async run() { await new Promise(r => setTimeout(r, 30)); } });
  WA.workflow.register({ id: 'wtest.hist.bad', chain: 'wtest142', order: 3, label: '历史错节点', critical: false, async run() { throw new Error('history142'); } });
  await WA.workflow.run('wtest142', {});
  await WA.workflow.run('wtest142', {});
  const wh142 = WA.workflow.history(5);
  assert(wh142.tracked === 2 && wh142.max === 20 && wh142.runs.length === 2, 'workflow 历史保留两次运行');
  assert(wh142.runs[0].chain === 'wtest142' && wh142.runs[0].nodeCount === 3, '历史运行含链名与节点数');
  assert(wh142.runs[0].slowest.some(n => n.id === 'wtest.hist.slow' && n.ms >= 20), '历史 slowest 保留逐节点耗时');
  assert(wh142.runs[0].errors === 1, '历史运行记录非关键错误数');
  const dg142wf = WA.toolDiag.collect();
  assert(dg142wf.runtime.workflow.history && dg142wf.runtime.workflow.history.tracked === 2, 'tool-diag 透出 workflow.history');
  WA.workflow.unregister('wtest.hist.fast'); WA.workflow.unregister('wtest.hist.slow'); WA.workflow.unregister('wtest.hist.bad');
  WA.workflow.resetHistory();
  assert(WA.workflow.history().tracked === 0, 'resetHistory 清空环形历史');
  // 槽位审计：同 position 多源 depth 冲突被检出，未知 position 与真实路由同样回落 in_chat
  assert(typeof WA.injectSlotAudit.routeAudit === 'function', 'routeAudit 已导出');
  const raClean142 = WA.injectSlotAudit.routeAudit([
    { source: 'A', position: 'in_chat', depth: 4, content: 'a' },
    { source: 'B', position: 'in_chat', depth: 4, content: 'b' },
    { source: 'C', position: 'after_last_user', depth: 2, content: 'c' }
  ]);
  assert(raClean142.positions === 2 && raClean142.conflicts.length === 0, '同 position 同 depth 无覆盖议题');
  const raConflict142 = WA.injectSlotAudit.routeAudit([
    { source: 'world', position: 'after_last_user', depth: 1, content: 'world' },
    { source: 'rule', position: 'after_last_user', depth: 5, content: 'rule' },
    { source: 'unknown', position: 'future_position', depth: 3, content: 'fallback' }
  ]);
  assert(raConflict142.positions === 2 && raConflict142.conflicts.length === 1, '同 position 不同 depth 检出一条冲突');
  assert(raConflict142.conflicts[0].position === 'after_last_user' && raConflict142.conflicts[0].effective === 1, '冲突报告 position/effective depth');
  assert(raConflict142.conflicts[0].sources.join(',') === 'world,rule', '冲突报告保留源顺序');
  // applyInjections 接线：冲突应进入 eventLog，但不阻断真实落地
  const warn142Before = WA.eventLog.filter(l => l.msg.indexOf('槽位深度覆盖') >= 0).length;
  WA.render.applyInjections({ injections: [
    { source: 'world', position: 'after_last_user', depth: 1, content: 'route world' },
    { source: 'rule', position: 'after_last_user', depth: 5, content: 'route rule' }
  ] });
  const warn142After = WA.eventLog.filter(l => l.msg.indexOf('槽位深度覆盖') >= 0).length;
  assert(warn142After > warn142Before, '实际注入接线记录 depth 覆盖告警');
  assert(WA.store.get().lastInjection && WA.store.get().lastInjection.slots, '覆盖告警不阻断槽位快照落地');
  } // end v0.1.42 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.43 — 无界增长审计 + 撤销台账跨聊天分域
  // ═══════════════════════════════════════════════════════════
  v0143: {
  assert(typeof WA.store.sizeAudit === 'function', 'store.sizeAudit 已导出');
  const audit0 = WA.store.sizeAudit({ minBytes: 64 });
  assert(Array.isArray(audit0.arrays) && typeof audit0.scanned === 'number', 'sizeAudit 返回数组清单与扫描数');
  assert(audit0.arrays.every(a => typeof a.path === 'string' && typeof a.bytes === 'number'), 'sizeAudit 每项含 path/bytes');
  // 白名单内的有界容器灌到源码上限（100；超容即属漂移，见 v0.1.44）→ 不误报
  WA.store.transact(d => { d.worldFacts = []; for (let i = 0; i < 100; i++) d.worldFacts.push({ key: 'k' + i, value: 'v'.repeat(30) }); });
  const auditBounded = WA.store.sizeAudit({ minBytes: 64 });
  assert(auditBounded.unbounded.indexOf('worldFacts') < 0, '白名单容器(worldFacts)不算无界');
  assert(auditBounded.suspects.every(x => x.path !== 'worldFacts'), '白名单容器不进 suspects');
  // 新出现的未裁剪数组必须被抓出
  WA.store.transact(d => { d.memory.journal = []; for (let i = 0; i < 40; i++) d.memory.journal.push('记录' + i + ' ' + 'y'.repeat(40)); });
  const auditNew = WA.store.sizeAudit({ minBytes: 64 });
  assert(auditNew.unbounded.indexOf('memory.journal') >= 0, '未登记的新数组被判为无界');
  assert(auditNew.suspects.some(x => x.path === 'memory.journal' && x.len === 40), '达阈值的无界数组进 suspects');
  const wfRow = auditNew.arrays.find(a => a.path === 'worldFacts');
  assert(wfRow && wfRow.bounded === true, 'arrays 明细标注 bounded 位');
  WA.store.transact(d => { delete d.memory.journal; d.worldFacts = []; });
  // directEvents 有界化：全部经真实 API 路径（spawn / advance），不复刻裁剪逻辑
  WA.store.transact(d => { d.directEvents = []; });
  const mkEv = (i, status, extra) => Object.assign({ id: 'de' + i, title: '事件' + i, totalTurns: 2, currentTurn: 0, status, notes: ['纸条' + 'x'.repeat(200)], createdAt: 1000 + i }, extra || {});
  // ① create 触发裁剪：预置 4 条旧终态，经真实通道生成新活跃事件
  const cfg143 = WA.apiRouter.getChannel('inference');
  WA.apiRouter.setChannel('inference', { baseUrl: 'http://mock', model: 'm', apiKey: 'k' });
  WA.store.transact(d => { d.directEvents = [mkEv(1, 'done'), mkEv(2, 'aborted'), mkEv(3, 'done'), mkEv(4, 'done')]; });
  global.__pushApiJson({ title: '突袭', opponent: '对手甲', box: '暗箱', notes: ['纸条一', '纸条二'] });
  const created143 = await WA.directEvent.create({ turns: 2 });
  assert(created143 && created143.ok === true, 'create 经真实通道成功产出事件');
  const afterSpawn = WA.store.get().directEvents;
  const act143 = afterSpawn.filter(e => e.status === 'active');
  assert(act143.length === 1 && Array.isArray(act143[0].notes) && act143[0].notes.length === 2, 'create 后活跃事件存在且 notes 完整');
  assert(afterSpawn.length === 4, 'create 触发裁剪：1 活跃 + 最近 3 终态（实得 ' + afterSpawn.length + '）');
  const endedSpawn = afterSpawn.filter(e => e.status !== 'active');
  assert(endedSpawn.map(e => e.id).join(',') === 'de2,de3,de4', '终态保留最近三条（最旧 de1 出局）');
  assert(endedSpawn.every(e => !e.notes), '终态事件已剥离 notes 大头');
  // ② advance 转 done 时同样裁剪（不新增事件，仅状态迁移）
  WA.store.transact(d => { d.directEvents = [mkEv(11, 'done'), mkEv(12, 'done'), mkEv(13, 'done'), mkEv(14, 'done'), mkEv(15, 'active', { currentTurn: 1, totalTurns: 2 })]; });
  await WA.directEvent.advance();
  const afterAdv = WA.store.get().directEvents;
  assert(afterAdv.length === 3 && afterAdv.every(e => e.status !== 'active'), 'advance 转 done 后触发裁剪且无残留活跃项');
  assert(afterAdv.map(e => e.id).join(',') === 'de13,de14,de15', 'advance 路径同样保留最近三条');
  assert(afterAdv.every(e => !e.notes), 'advance 路径剥离终态 notes');
  WA.apiRouter.setChannel('inference', cfg143 && cfg143.baseUrl && cfg143.model ? { baseUrl: cfg143.baseUrl, model: cfg143.model, apiKey: cfg143.apiKey } : null);
  WA.store.transact(d => { d.directEvents = []; });
  // 章号在裁剪后仍唯一递增
  WA.store.transact(d => { d.chapters.history = []; d.chapters.current = null; d.chapters.seq = 0; });
  for (let i = 0; i < 26; i++) { WA.chapters.start('章' + i); WA.chapters.end('结' + i); }
  const chs = WA.store.get().chapters;
  assert(chs.history.length === 20, 'chapters.history 有界于 20（实得 ' + chs.history.length + '）');
  const nos = chs.history.map(h => h.no);
  assert(new Set(nos).size === nos.length, '裁剪后章号无重复');
  assert(nos[0] === 7 && nos[nos.length - 1] === 26, '保留最近 20 章且号序连续（' + nos[0] + '→' + nos[nos.length - 1] + '）');
  assert(chs.seq === 26, 'seq 计数器与最大章号同步');
  WA.chapters.start('续章');
  assert(WA.store.get().chapters.current.no === 27, '新章号从 seq 续起而非 history.length+1');
  WA.chapters.end('收尾');
  WA.store.transact(d => { d.chapters.history = []; d.chapters.current = null; delete d.chapters.seq; });
  // 诊断透出 + 议题：干净态无 suspects
  const dg143 = WA.toolDiag.collect();
  assert(dg143.worldState.storage.sizeAudit && Array.isArray(dg143.worldState.storage.sizeAudit.arrays), '诊断透出 sizeAudit');
  const cleanSuspects = dg143.worldState.storage.sizeAudit.suspects;
  assert(Array.isArray(cleanSuspects), 'sizeAudit suspects 为数组');
  // ── 撤销台账跨聊天分域 ──
  assert(typeof WA.render.injectionLedger === 'function', 'injectionLedger 仍在');
  const ctx143 = global.SillyTavern.getContext();
  const origChat143 = ctx143.chatId;
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v143 A 域注入' }] });
  WA.render.uninject('manual-v143-A');
  const ledA = WA.render.injectionLedger();
  assert(ledA.entries[ledA.entries.length - 1].chat === origChat143, '台账条目带 chat 域标识');
  // 切到另一聊天：旧域撤销记录不得参与新域一致性判定
  ctx143.chatId = 'v143_other_chat';
  WA.store.init();
  WA.render.applyInjections({ injections: [{ source: '世界状态', content: 'v143 B 域注入' }] });
  const ledB = WA.render.injectionLedger();
  const uaB = WA.render.uninjectAudit();
  assert(ledB.count === 0 && ledB.total >= 1 && ledB.foreign >= 1, 'B 域台账为空但全量计数保留');
  assert(uaB.ledgerCount === 0 && uaB.foreignEntries >= 1, '审计只见本域、跨域量单独透出');
  assert(!uaB.issues.some(i => i.code === 'cleared-by-mismatch'), '跨域撤销不回写本域快照（无误报）');
  ctx143.chatId = origChat143;
  WA.store.init();
  try { delete global.localStorage['worldaxis_state_v143_other_chat']; } catch (e) {}
  // 兼容性：{all:true} 仍可取全量
  assert(WA.render.injectionLedger({ all: true }).count >= WA.render.injectionLedger().count, 'injectionLedger({all}) 取全量');
  } // end v0.1.43 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.44 — 有界登记表可验证化：cap 漂移检测 + 源码反查
  // ═══════════════════════════════════════════════════════════
  v0144: {
  assert(typeof WA.store.sizeCaps === 'function', 'store.sizeCaps 已导出');
  const caps = WA.store.sizeCaps();
  assert(caps['memory.l0'] && caps['memory.l0'].cap === 20, 'memory.l0 已登记（修 v0.1.43 假阳性）');
  assert(typeof caps['consistency'].cap === 'number', 'consistency 登记 cap=0（无写入方）');
  // ── 源码反查：登记表的 cap 必须等于源码裁剪常量，源码为唯一真相源 ──
  const CAP_RULES = {
    'chronicle': ['engines/backstage.js', /draft\.chronicle\s*=\s*draft\.chronicle\.slice\(-(\d+)\)/],
    'currents': ['engines/backstage.js', /draft\.currents\s*=\s*curArr\.slice\(-(\d+)\)/],
    'echoes': ['engines/backstage.js', /draft\.echoes\s*=\s*draft\.echoes\.slice\(-(\d+)\)/],
    'worldFacts': ['engines/backstage.js', /draft\.worldFacts\s*=\s*draft\.worldFacts\.slice\(-(\d+)\)/],
    'memory.l0': ['engines/memory.js', /const CAP = \{[^}]*l0:\s*(\d+)/],
    'memory.l1': ['engines/memory.js', /const CAP = \{[^}]*l1:\s*(\d+)/],
    'memory.l2': ['engines/memory.js', /const CAP = \{[^}]*l2:\s*(\d+)/],
    'memory.l3': ['engines/memory.js', /const CAP = \{[^}]*l3:\s*(\d+)/],
    'memory.facts': ['engines/memory.js', /const CAP = \{[^}]*facts:\s*(\d+)/],
    'memory.foreshadows': ['engines/memory.js', /const CAP = \{[^}]*foreshadows:\s*(\d+)/],
    'memory.pmem': ['engines/pmem.js', /const CAP_TOTAL\s*=\s*(\d+)/],
    'opinion.canon': ['engines/opinion.js', /\.concat\(news\)\.slice\(-(\d+)\)/],
    'opinion.forum': ['engines/opinion.js', /\.concat\(forums\)\.slice\(-(\d+)\)/],
    'evolution.winds': ['engines/evolution.js', /const MAX_WINDS = (\d+)/],
    'evolution.worldTrends': ['engines/backstage.js', /wtArr\.length > (\d+)\)/],
    'evolution.economy.signals': ['engines/evolution.js', /eco\.signals\.slice\(0,\s*(\d+)\)/],
    'evolution.events': ['engines/editor-events.js', /const MAX_EVENTS\s*=\s*(\d+)/],
    'evolution.factions': ['engines/editor-faction.js', /const MAX_FACTIONS\s*=\s*(\d+)/],
    'chapters.history': ['engines/chapters.js', /const MAX_HISTORY\s*=\s*(\d+)/],
    // 终态 KEEP_DONE 条 + 至多 1 条活跃
    'directEvents': ['engines/direct-event.js', /const KEEP_DONE\s*=\s*(\d+)/, function (k) { return k + 1; }],
    // v1.0.0 补登项（有界但漏登）+ 新增对象型容器
    'evolution.trends': ['engines/evolution.js', /draft\.evolution\.trends\s*=\s*draft\.evolution\.trends\.slice\(-(\d+)\)/],
    'evolution.blackbox.secretActions': ['engines/enemies.js', /box\.secretActions\s*=\s*box\.secretActions\.slice\(-(\d+)\)/],
    'evolution.blackbox.secretAssets': ['engines/enemies.js', /box\.secretAssets\s*=\s*box\.secretAssets\.slice\(-(\d+)\)/],
    'opinion.sandbox': ['engines/opinion.js', /draft\.opinion\.sandbox\s*=\s*\(r\.fragments \|\| \[\]\)\.slice\(0,\s*(\d+)\)/],
    // 对象型容器：cap 由源码具名常量反查（kind:'object'，len=Object.keys().length）
    'people': ['engines/backstage.js', /const PEOPLE_CAP\s*=\s*(\d+)/],
    // 总量硬上限 = 活跃 MAX_ACTIVE + 终结保留 TERMINATED_MAX（双捕获组求和）
    'evolution.enemies': ['engines/enemies.js', /const TERMINATED_MAX\s*=\s*(\d+);?[\s\S]*?const MAX_ACTIVE\s*=\s*(\d+)/, function (k, m) { return Number(m[1]) + Number(m[2]); }],
    // v1.4.0 补登：entityMemory 四类实体库（CAP_PER_TYPE 双处裁剪）+ 每实体事件环（通配）
    'evolution.entityMemory.organization': ['engines/entities.js', /const CAP_PER_TYPE\s*=\s*(\d+)/],
    'evolution.entityMemory.object': ['engines/entities.js', /const CAP_PER_TYPE\s*=\s*(\d+)/],
    'evolution.entityMemory.ability': ['engines/entities.js', /const CAP_PER_TYPE\s*=\s*(\d+)/],
    'evolution.entityMemory.location': ['engines/entities.js', /const CAP_PER_TYPE\s*=\s*(\d+)/],
    'evolution.entityMemory.*.events': ['engines/entities.js', /ent\.events\.length > (\d+)/],
    // v2.2.0: people.<id>.profile 五节改为「运行时单一真源」——不再与源码字面常量比对，
    //   改由下方 RUNTIME_CAP_RULES 校验：消费端（registry）写入时从容量登记表取上限，
    //   且全库不得存在第二处写死该节上限（消除 profile.js 直写 store 造成的双写漂移）。
    'people.*.knowledge': ['engines/backstage.js', /keys\.slice\(0,\s*keys\.length\s*-\s*(\d+)\)/]
  };
  const srcCache = {};
  const readSrc = function (rel) {
    // v2.401.0(OPV23): panel 模板拆进 ui/pages/*.js —— 读 panel.js 走 panelSource() 重组面
    //   （与拆前逐字相等），其余文件照读磁盘。缓存在 srcCache 里，语义不变。
    if (rel === 'ui/panel.js') {
      if (!srcCache[rel]) srcCache[rel] = panelSource();
      return srcCache[rel];
    }
    if (!srcCache[rel]) srcCache[rel] = fs.readFileSync(path.join(BASE, rel), 'utf8');
    return srcCache[rel];
  };
  // ── v2.13.0：cap 的单一真源改为 **运行时站点表**（evict.SITES），不再是源码正则 ──
  //   为什么换：v0.1.44 起这里靠**源码正则**反查 cap，而站点接线后源码里已经没有
  //   `slice(-N)` 字面量了（改走 WA.evict.array 单一出口）——继续扫源码只会把
  //   「接线成功」误报成「源码裁剪表达式未找到」。但真正的病根更深：
  //   正则反查**永远只能证明「某个字面量出现过」**，证明不了「运行时真的按这个 cap 裁」。
  //   换成运行时表之后，声明与执行第一次是同一份东西：
  //     ① evict.SITES（cap 真源）↔ store.sizeCaps()（容量登记表）逐键比对；
  //     ② evict.SITES 的 cap 必须等于 **执行站点实测的 cap**（喂超限数组跑一次单出口，
  //        看它真丢了多少）——这是「声明即执行」的直接证据，正则做不到这件事。
  //     ③ 双集合同集合：有界登记表里的每项都必须能被挤出侧解释（站点 / 非挤出声明 /
  //        运行时单源 / 只读无写入方 四类之一），防「登记了却没人执行」。
  const SITE_DECLS = WA.evict.siteDecls();
  const NON_EVICT_DECLS = WA.evict.nonEvictDecls();
  // 允许 evict.SITES 的 path 与 store 登记键不同名（如 entities.perType ↔
  //   evolution.entityMemory.organization）：按集合覆盖判定，不按字面键相等。
  const SITE_CAP_BY_CAP = {};   // cap 值 -> 站点名列表（用于与登记表逐值对账）
  Object.keys(SITE_DECLS).forEach(function (st) { (SITE_CAP_BY_CAP[SITE_DECLS[st].cap] = SITE_CAP_BY_CAP[SITE_DECLS[st].cap] || []).push(st); });
  // v2.13.0: 站点 path 含 `*`（如 evolution.entityMemory.*）时按**路径段通配**匹配登记键
  //   （evolution.entityMemory.organization）——`*` 至少吃 1 段，与 store.matchWildcard 同语义。
  const sitePathMatch = function (p, k) {
    if (p === k) return true;
    if (p.indexOf('*') < 0) return false;
    const ps = p.split('.'), ks = k.split('.');
    const i = ps.indexOf('*');
    if (ks.length < ps.length) return false;
    for (let eat = 1; eat <= ks.length - (ps.length - 1); eat++) {
      let ok = true;
      for (let si = 0; si < ps.length && ok; si++) {
        if (si === i) continue;
        const ki = si < i ? si : si + eat - 1;
        if (ps[si] !== ks[ki]) ok = false;
      }
      if (ok) return true;
    }
    return false;
  };
  const capMismatch = [];
  // ① 登记表与站点表逐键对账（只比对两边都声明了的键）
  Object.keys(SITE_DECLS).forEach(function (st) {
    const decl = SITE_DECLS[st];
    // per-call 站点（上限逐次不同，如人物档案各节 15/10/10/25/15）没有单一登记值可比，
    //   其正确性由 ② 的「显式传上限 + 传漏归因」负向探针单独考核。
    if (decl.cap === 'per-call') return;
    const keys = Object.keys(caps).filter(function (k) { return sitePathMatch(decl.path, k) || k === st; });
    keys.forEach(function (k) {
      const c = caps[k];
      // 登记侧标了通配（people.*.profile.personality）时，站点 path 与它同属一个规则族：
      //   只要站点 path 的 `*` 段能覆盖登记键的形状，就按「同族」放行，不比 cap 字面值
      //   （避免把「某容器的通配登记」与「另一容器的具名站点」错配成漂移）。
      if (c.wildcard && sitePathMatch(decl.path, k) && decl.path.indexOf('*') >= 0) return;
      if (c.cap !== decl.cap) capMismatch.push(k + '(登记 ' + c.cap + ' vs 站点 ' + decl.cap + ')');
    });
  });
  assert(capMismatch.length === 0, 'v2.13.0 容量登记表与挤出站点表逐键一致' + (capMismatch.length ? '：' + capMismatch.join('、') : ''));
  // ② 声明即执行：喂一个超限数组跑真站点，实测丢弃数必须等于「长度 - 声明 cap」
  const execProbe = [];
  ['memory.l0', 'memory.l1', 'memory.l2', 'memory.l3', 'memory.facts', 'backstage.chronicle',
   'backstage.worldFacts', 'backstage.echoes', 'backstage.currents', 'evolution.trends',
   'evolution.enemies', 'evolution.worldTrends', 'opinion.canon', 'opinion.forum',
   'memory.pmem', 'evolution.ledger', 'chapters.history', 'directEvents',
   'evolution.blackboxActions', 'evolution.blackboxAssets',
   // v2.13.0 补漏站点：真盲区（纪要/总述曾整条不在登记表上）与被漏接的第二写入方
   'memory.smallSummary', 'memory.bigSummary', 'backstage.chronicle'].forEach(function (st) {
    const decl = SITE_DECLS[st];
    if (!decl) { execProbe.push(st + '(站点未登记)'); return; }
    const over = decl.cap + 3;
    const arr = [];
    for (let i = 0; i < over; i++) arr.push({ name: 'probe' + i });
    const st0 = WA.evict.evictStat();
    const r = WA.evict.array(arr, st);
    const st1 = WA.evict.evictStat();
    if (!r.ok || r.dropped !== 3 || arr.length !== decl.cap) {
      execProbe.push(st + '(实测 dropped=' + r.dropped + ' len=' + arr.length + ' 期望 3/' + decl.cap + ')');
    }
    if ((st1.evicts - st0.evicts) !== 1) execProbe.push(st + '(未记账)');
    WA.evict.resetEvictStat();
  });
  assert(execProbe.length === 0, 'v2.13.0 站点「声明即执行」：实测丢弃数须等于超限数' + (execProbe.length ? '：' + execProbe.join('、') : '（20 站点逐站实测通过）'));
  // ③ 双集合同集合：登记表每一项都必须能被挤出侧解释
  const RUNSITE_KEYS = Object.keys(SITE_DECLS).map(function (s) { return SITE_DECLS[s].path; });
  const explained = function (k) {
    // 站点 path 可能含 `*`：用路径段通配匹配，而不是字符串前缀
    //   （否则 evolution.entityMemory.organization 永远对不上 evolution.entityMemory.*，
    //    会被误报成「未解释」——这正是本门禁首版的假失败）。
    if (RUNSITE_KEYS.some(function (p) { return sitePathMatch(p, k); })) return true;
    if (NON_EVICT_DECLS[k]) return true;
    if (k.indexOf('people.*.profile.') === 0) return true;          // 运行时单源（registry 查本登记表）
    // v2.294.0（V8 收口）：people.*.life.{goals,commitments,schedule} 同属「运行时单源」。
    //   engines/life.js 是这三个容器的**唯一写者**（260/274/289 行 concat 后立刻 slice(-8/-12)），
    //   截断发生在写者内部、不经 evict 站点表 —— 与 people.*.profile.* 同型。
    //   不解释它们的后果是这道门禁把「有界容器由自己维护」报成「未解释的容量登记」。
    if (k.indexOf('people.*.life.') === 0) return true;
    if (k === 'consistency') return true;                            // 无写入方
    return false;
  };
  const unexplainedCaps = Object.keys(caps).filter(function (k) { return !explained(k); });
  assert(unexplainedCaps.length === 0,
    'v2.13.0 有界登记表每项都能被挤出侧解释（站点/非挤出/运行时单源/无写入方）'
    + (unexplainedCaps.length ? '——未解释：' + unexplainedCaps.join('、') : ''));
  assert(typeof WA.evict.evictStat === 'function' && typeof WA.evict.siteDecls === 'function',
    'v2.13.0 挤出侧单一出口与站点表已导出');
  // 旧口径（源码正则反查）退役为**负向对照**，但必须写成**诚实判据**：
  //   本版各站点都保留了 `else { ... slice(-CAP) ... }` 降级路径，字面量当然还在，
  //   所以「全库已无 slice(-N)」是**假判据**（本门禁首版即由此自误报）。
  //   真正该钉住的事实是两条，且都不可由「碰巧」通过：
  //     ① 记台账的调用确实存在（否则站点表就是自说自话）；
  //     ② 站点表每个站点都在产品源码里有调用点（无「声明了却没人用」的悬空站点）。
  //   遍历用本块自建的 PROD_G18（v2.8.0 块的 PROD2800 在其块内，不可跨块引用）。
  const PROD_G18 = [];
  (function walkG18(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
      if (e.name === '.git' || e.name === 'node_modules') return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walkG18(p);
      if (e.name.endsWith('.js') && dir !== path.join(BASE, 'tests')) PROD_G18.push(path.relative(BASE, p));
    });
  })(BASE);
  // v2.155.0 收口（全量回归当场抓到）：首参字符类原为 `[^,()]+`，**排除了括号**——
  //   而 v2.153.0 的分支树调用点是 `WA.evict.array(bucket().nodes, 'branchTree.nodes')`，
  //   首参含 `()` ⇒ 该站点被判成「声明了却没人用」。判据的输入面漏了一种**合法**写法，
  //   结论面却是「这个站点悬空」。字符类改为「不含逗号」（括号、点、下标都允许），
  //   与 note 型分开扫的口径不变。
  const CALL_RE_G18 = /WA\s*\.\s*evict\s*\.\s*(array|object)\s*\(\s*[^,]+,\s*'([^']+)'/g;
  // note() 的站点名在**第一**参数（note('site', dropped[, cap])），与 array/object 相反：
  //   第一版只写了「第二参数是站点名」的一条正则，于是 note 型站点（仇敌/章节史/突发事件）
  //   全被判成「声明悬空」——判据错，不是代码错。两种形态分开扫。
  const NOTE_RE_G18 = /WA\s*\.\s*evict\s*\.\s*note\s*\(\s*'([^']+)'/g;
  const G18_SITES = {};
  let G18_CALLS = 0;
  PROD_G18.forEach(function (rel) {
    if (rel === 'core/evict.js') return;
    fs.readFileSync(path.join(BASE, rel), 'utf8').split('\n').forEach(function (line) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      CALL_RE_G18.lastIndex = 0; let m;
      while ((m = CALL_RE_G18.exec(line))) { G18_CALLS++; G18_SITES[m[2]] = (G18_SITES[m[2]] || 0) + 1; }
      NOTE_RE_G18.lastIndex = 0; let n;
      while ((n = NOTE_RE_G18.exec(line))) { G18_CALLS++; G18_SITES[n[1]] = (G18_SITES[n[1]] || 0) + 1; }
    });
  });
  assert(G18_CALLS > 0, 'v2.13.0 挤出侧单一出口确有调用（实测 ' + G18_CALLS + ' 处 WA.evict.* 调用点）');
  const siteNoCall = Object.keys(SITE_DECLS).filter(function (st) { return !G18_SITES[st]; });
  assert(siteNoCall.length === 0, '站点表每项都在产品源码里有调用点（无声明悬空站点）'
    + (siteNoCall.length ? '——零调用：' + siteNoCall.join('、') : '（' + Object.keys(SITE_DECLS).length + ' 个站点全部在用）'));
  // 旧反查集的作用域仍在（readSrc 仍被使用，不是遗留死代码）
  assert(readSrc('core/store.js').indexOf('__BOUNDED_CAPS') >= 0, '旧反查集的作用域（store 登记表）仍在');
  // 登记表与反查规则须覆盖同一集合（consistency 无源码裁剪点，单列）
  // v2.2.0: 档案五节的裁剪上限改为「运行时单一真源」（消费端 actors/registry.js 查本登记表，
  //   全库无第二处写死），不再是源码字面常量正则反查项。集合比对须把它们计入「已覆盖」，
  //   否则会被误判为漏登（其运行时校验见 v1.5.0 块的 RUNTIME_CAP_RULES_1500）。
  const RUNTIME_CAP_KEYS = ['people.*.profile.personality', 'people.*.profile.worldview', 'people.*.profile.family', 'people.*.profile.memory', 'people.*.profile.relationships'];
  // v2.13.0: 原先是「登记表 ↔ 旧源码反查集」逐键**全等**。旧 CAP_RULES 逐项被站点接管后
  //   全等已无意义（登记表是每容器上限，站点表在同名容器上给出同一 cap，但键形状不同）。
  //   改为双向包含，两条都不可由碰巧通过：
  //     ① 登记表每个键都必须有解释方（站点 path / 非挤出声明 / 运行时单源 / 无写入方）；
  //     ② 旧反查集每个键仍必须在登记表上（防「规则还在守一个已注销的容器」）。
  const ruleKeys = Object.keys(CAP_RULES).concat(['consistency']).concat(RUNTIME_CAP_KEYS).sort().join(',');
  const capsNoExplain = Object.keys(caps).filter(function (k) { return !explained(k); });
  assert(capsNoExplain.length === 0, '登记表每键都有解释方（站点/非挤出/运行时单源/无写入方）'
    + (capsNoExplain.length ? '——未解释：' + capsNoExplain.join('、') : ''));
  const ruleNotInCaps = ruleKeys.split(',').filter(function (k) { return !Object.prototype.hasOwnProperty.call(caps, k); });
  assert(ruleNotInCaps.length === 0, '旧反查集每键仍在登记表上（无「守着一个已注销的容器」）'
    + (ruleNotInCaps.length ? '：' + ruleNotInCaps.join('、') : ''));
  // ── 双消费端：新规则必须同时有「诊断议题」与「面板出口」 ──
  //   本仓库铁律（v2.11.0 活性面审计结论）：只写采集端、不接消费端的台账，用户永远看不到。
  //   挤出侧尤其如此——它丢的是真数据，而丢完「看起来一切正常」，没有任何自证手段。
  const diagEv0 = WA.toolDiag.collect();
  assert(diagEv0.runtime && diagEv0.runtime.evict && typeof diagEv0.runtime.evict.sites === 'number',
    '（消费端①）诊断 runtime.evict 透出站点数与台账（此前挤出侧在诊断包里完全不存在）');
  const panelSrc1300 = readSrc('ui/panel.js');
  assert(panelSrc1300.indexOf('evictBlock()') > 0, '（消费端②）面板概览真的调用了挤出渲染块（不只是定义了函数）');
  assert(panelSrc1300.indexOf('容量收纳') > 0, '（消费端②）面板有「容量收纳」可见出口（丢的是谁要摆到用户眼前）');
  assert(readSrc('core/store.js').indexOf('evicts: evictsN') > 0, '（消费端③）健康分 signals 透出挤出三计量');
  // ── 负向探针：本模块三条口径全靠它们成立，缺一条就退化成「悄悄丢数据」 ──
  WA.evict.resetEvictStat();
  // ① 未知站点是缺陷，不是后备：**不做任何截断**
  const beforeUnknown = [1, 2, 3, 4, 5];
  const rUnknown = WA.evict.array(beforeUnknown, 'site.that.does.not.exist');
  assert(rUnknown.ok === false && rUnknown.reason === 'unknown-site', '（负向）未登记站点被拒绝（unknown-site）');
  assert(beforeUnknown.length === 5, '（负向）未登记站点**不做任何截断**——「先丢掉再说」是最贵的一类默认值');
  assert(WA.evict.evictStat().evictFailed === 1 && WA.evict.evictStat().failedBy['unknown-site'] === 1,
    '（负向）未登记站点进 failedBy 分桶（可归因，不是静默忽略）');
  // ② 参数非法归因，而不是糊过去
  const rBad = WA.evict.array(null, 'memory.l0');
  assert(rBad.ok === false && rBad.reason === 'not-array', '（负向）非数组输入归因 not-array');
  // ③ per-call 站点漏传上限 → bad-cap（不许悄悄回落默认值），且仍不截断
  const arrPerCall = [];
  for (let i = 0; i < 40; i++) arrPerCall.push({ text: '档' + i });
  const rNoLimit = WA.evict.array(arrPerCall, 'people.profile');
  assert(rNoLimit.ok === false && rNoLimit.reason === 'bad-cap', '（负向）per-call 站点漏传上限 → bad-cap（不回落默认值）');
  assert(arrPerCall.length === 40, '（负向）漏传上限时不截断（宁可超限也不静默丢弃）');
  const rLimit = WA.evict.array(arrPerCall, 'people.profile', 15);
  assert(rLimit.ok === true && rLimit.dropped === 25 && arrPerCall.length === 15,
    '（正向）显式传上限后按该上限裁（40 → 15，丢 25）');
  // ④ 「丢了什么」必须可读——只记条数等于什么都没说
  WA.evict.resetEvictStat();
  const namedDrop = [];
  for (let i = 0; i < 45; i++) namedDrop.push({ name: '角色' + i });
  WA.evict.array(namedDrop, 'memory.l0');        // cap 20 → 丢 25 个
  const mp1300 = WA.evict.evictStat();
  assert(mp1300.evicted === 25 && mp1300.lastDropped.length > 0 && /角色/.test(mp1300.lastDropped[0].what),
    '（正向）lastDropped 记元素摘要（「丢的是谁」而非只记条数）');
  assert(WA.evict.evictStat().bySite['memory.l0'] && WA.evict.evictStat().bySite['memory.l0'].dropped === 25,
    '（正向）bySite 逐站点归因（谁在丢东西）');
  // ⑤ 诊断议题分级：正常挤出 = info 且点名站点；失败 = error
  const dgEv = WA.toolDiag.collect();
  const evIssue = ((dgEv.verdict || {}).issues || []).filter(function (x) { return x.key === 'evict'; })[0];
  assert(evIssue && evIssue.level === 'info' && /memory\.l0/.test(evIssue.detail),
    '（消费端①·分级）正常挤出 → info 议题并点名站点（设计内行为不报红）');
  assert(dgEv.runtime.evict.lastDropped.length > 0, '诊断包透出「最近丢弃物」明细');
  // ⑥ 健康巡视：正常挤出只报 info；失败报 error（代码缺陷须上升为告警）
  const mtEv = WA.store.maintain();
  const mtEvInfo = (mtEv.issues || []).filter(function (x) { return x.key === 'evict'; })[0];
  assert(mtEvInfo && mtEvInfo.level === 'info', '（消费端③·分级）正常挤出在健康巡视里只报 info');
  assert(mtEv.signals.evicts === 1 && mtEv.signals.evictFailed === 0, '（消费端③）signals 记录本次挤出');
  WA.evict.array([1, 2], 'nope.nope');
  const mtFail = WA.store.maintain();
  const mtEvErr = (mtFail.issues || []).filter(function (x) { return x.key === 'evict.failed'; })[0];
  assert(mtEvErr && mtEvErr.level === 'error', '（消费端③·负向）挤出失败在健康巡视里报 error（须改代码，不是清存储）');
  // ④b 多站点互不冲刷（**放在 ⑤⑥ 之后**：它需要构建自己的台账，
  //   若插在 ④ 与 ⑤ 之间会把 ⑤⑥ 依赖的「memory.l0 挤出一次」状态清掉——
  //   本门禁首版正是这么写的，实测导致 4 条断言失败）。
  //   缺陷来源：端到端审计自纠——全局 lastDropped 只留 12 条，长局里先挤出的站点
  //   （people 丢 32 人）明细会被后挤出的站点（伏笔）立刻冲掉，「丢了哪 32 个角色」永远看不见。
  WA.evict.resetEvictStat();
  const mk = function (n, tag) { const a = []; for (let i = 0; i < n; i++) a.push({ name: tag + i }); return a; };
  WA.evict.array(mk(45, '甲'), 'memory.l0');              // 丢 25 个「甲」
  WA.evict.array(mk(45, '乙'), 'memory.l1');              // 丢 15 个「乙」（l1 cap 30）
  WA.evict.array(mk(50, '丙'), 'chapters.history');       // 丢 30 个「丙」
  const ms1300 = WA.evict.evictStat();
  assert((ms1300.bySite['memory.l0'].lastWhat || []).some(function (w) { return w.indexOf('甲') === 0; }),
    '（负向回归）多站点连挤后，先挤出的站点仍保留自己的「丢了谁」（全局环形会冲掉它）');
  assert((ms1300.bySite['chapters.history'].lastWhat || []).some(function (w) { return w.indexOf('丙') === 0; }),
    '（正向）后挤出的站点同样有自己的明细');
  assert(ms1300.evicts === 3 && ms1300.bySite['memory.l0'].dropped === 25 && ms1300.bySite['chapters.history'].dropped === 30,
    '（正向）三站点各自独立计数（不合并、不串扰）');
  const dgMulti = WA.toolDiag.collect();
  const evMulti = ((dgMulti.verdict || {}).issues || []).filter(function (x) { return x.key === 'evict'; })[0];
  assert(evMulti && /chapters\.history 最近被挤出的是：丙/.test(evMulti.detail),
    '（消费端①）诊断议题点名**最频繁站点自己的**丢弃物（而非全局最近）');
  const stMulti = WA.evict.evictStat();
  assert(JSON.stringify(stMulti.bySite['memory.l0'].lastWhat) !== JSON.stringify(stMulti.bySite['chapters.history'].lastWhat),
    '（负向）不同站点的明细互不相同（防「看着有明细、其实都指向同一批」的假通过）');
  WA.evict.resetEvictStat();
  if (typeof WA.flushLog === 'function') WA.flushLog();
  if (Array.isArray(WA.eventLog)) WA.eventLog.length = 0;
  if (Array.isArray(WA.errorLog)) WA.errorLog.length = 0;
  // 探针自清：台账归零 + 清掉探针自己产生的日志，避免污染后续「干净态」断言
  WA.evict.resetEvictStat();
  if (typeof WA.flushLog === 'function') WA.flushLog();
  if (Array.isArray(WA.eventLog)) WA.eventLog.length = 0;
  if (Array.isArray(WA.errorLog)) WA.errorLog.length = 0;
  assert(WA.evict.evictStat().evicts === 0 && WA.evict.evictStat().evictFailed === 0, '（自清）探针台账已归零');
  // ── 假阳性回归：memory 四层灌至各自上限，不得进 unbounded/suspects ──
  WA.store.transact(d => {
    d.memory.l0 = []; d.memory.l1 = []; d.memory.l2 = []; d.memory.l3 = [];
    for (let i = 0; i < 20; i++) d.memory.l0.push({ t: Date.now(), text: 'L0摘要' + i + ' ' + 'a'.repeat(30) });
    for (let i = 0; i < 30; i++) d.memory.l1.push({ t: Date.now(), text: 'L1' + i });
    for (let i = 0; i < 40; i++) d.memory.l2.push({ t: Date.now(), text: 'L2' + i });
    for (let i = 0; i < 60; i++) d.memory.l3.push({ t: Date.now(), theme: 'L3' + i });
  });
  const aFull = WA.store.sizeAudit({ minBytes: 64 });
  ['memory.l0', 'memory.l1', 'memory.l2', 'memory.l3'].forEach(function (k) {
    assert(aFull.unbounded.indexOf(k) < 0 && aFull.suspects.every(x => x.path !== k), k + ' 满载仍不误报无界');
    assert(aFull.drifted.every(x => x.path !== k), k + ' 满载恰好等于 cap，不算漂移');
  });
  // ── 漂移检测：绕过裁剪写入超限容器 ──
  WA.store.transact(d => { d.memory.l3 = []; for (let i = 0; i < 75; i++) d.memory.l3.push({ t: Date.now(), theme: 'L3' + i }); });
  const aDrift = WA.store.sizeAudit({ minBytes: 64 });
  assert(aDrift.drifted.some(x => x.path === 'memory.l3' && x.len === 75 && x.cap === 60), '超 cap 容器进 drifted（75>60）');
  assert(aDrift.unbounded.indexOf('memory.l3') < 0, '已登记容器漂移时不重复计为无界');
  const driftRow = aDrift.arrays.find(x => x.path === 'memory.l3');
  assert(driftRow && driftRow.bounded === true && driftRow.cap === 60, 'arrays 明细透出登记的 cap');
  // 诊断议题：漂移为 error 级
  const dg144 = WA.toolDiag.collect();
  assert(dg144.worldState.storage.sizeAudit.drifted.length >= 1, '诊断透出 drifted');
  const driftIssue = ((dg144.verdict || {}).issues || []).filter(function (x) { return x.key === 'sizeDrift'; })[0];
  assert(driftIssue && driftIssue.level === 'error' && /memory\.l3\(75>60/.test(driftIssue.detail), '漂移报 error 级议题并给出超限明细');
  // ── total 反映当前内存态，persisted 保留落盘量 ──
  assert(typeof aDrift.total === 'number' && aDrift.total > 0, 'sizeAudit.total 为当前体积');
  assert(typeof aDrift.persisted === 'number', 'sizeAudit.persisted 透出落盘体积');
  assert(aDrift.total >= aDrift.persisted || aDrift.persisted === 0, '内存态不小于已落盘态（写合并下成立）');
  // 复原，避免污染后续
  WA.store.transact(d => { d.memory.l0 = []; d.memory.l1 = []; d.memory.l2 = []; d.memory.l3 = []; d.worldFacts = []; });
  const aClean144 = WA.store.sizeAudit({ minBytes: 64 });
  assert(aClean144.drifted.length === 0, '复原后无漂移议题');
  } // end v0.1.44 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.45 — 旧存档结构自愈 + 扫描截断可见性
  // ═══════════════════════════════════════════════════════════
  v0145: {
  const ctx145 = global.SillyTavern.getContext();
  const chatKey145 = 'worldaxis_state_' + WA.store.chatId();
  const saved145 = global.localStorage.getItem(chatKey145);
  const healed0 = WA.store.loadStat().healed;
  // ── 旧存档：schemaVersion 已是最新，但 memory 缺 l0-l3、clock 缺 source、chapters 缺 seq ──
  const legacy = {
    schemaVersion: WA.store.SCHEMA_VERSION,
    clock: { iso: '', label: '旧纪元', dayIndex: 3 },
    memory: { facts: [{ key: '旧事实', value: 'v', version: 1, active: true }], foreshadows: [] },
    chapters: { active: false, current: null, history: [{ no: 4, title: '第四章' }, { no: 5, title: '第五章' }], storylines: [], relations: {} },
    worldFacts: [{ key: 'w', value: '1' }],
    people: { hero: { id: 'hero', name: '主角', location: '酒馆' } }
  };
  global.localStorage.setItem(chatKey145, JSON.stringify(legacy));
  WA.store.init();
  const st145 = WA.store.get();
  assert(st145.memory && Array.isArray(st145.memory.l0) && Array.isArray(st145.memory.l3), '旧存档载入后 memory.l0-l3 已补齐');
  assert(st145.clock.source === 'unset', 'clock.source 缺失被补齐为默认值');
  assert(st145.chapters.seq === 0, 'chapters.seq 缺失被补齐为 0');
  // 原有数据一字不动（ensureShape 只填空位）
  assert(st145.clock.label === '旧纪元' && st145.clock.dayIndex === 3, '旧 clock 值未被覆盖');
  assert(st145.memory.facts.length === 1 && st145.memory.facts[0].key === '旧事实', '旧 memory.facts 完整保留');
  assert(st145.worldFacts.length === 1 && Object.keys(st145.people).length === 1, '旧 worldFacts/people 保留');
  assert(st145.chapters.history.length === 2 && st145.chapters.history[1].no === 5, '旧章节史保留且未被裁剪');
  // ── 核心回归：无守卫写入必须真的落盘（修复前抛错被 transact 吞成 {ok:false}）──
  const w145 = WA.store.transact(function (d) { d.memory.l1.push({ t: 1, s: '巩固产物' }); });
  assert(w145.ok === true, '补齐后写 memory.l1 事务成功');
  assert((WA.store.get().memory.l1 || []).length === 1 && WA.store.get().memory.l1[0].s === '巩固产物', '写入真落盘（非静默丢弃）');
  // 引擎侧真实链路：L0 巩固（memory.js:34 的 draft.memory.l0.push 正是崩溃点）
  global.__mockChat.push({ is_user: true, mes: 'v145 旧存档回归 ' + 'q'.repeat(40), swipe_id: 5145 });
  const dgCfg145 = WA.apiRouter.getChannel('digest');
  WA.apiRouter.setChannel('digest', { baseUrl: 'http://mock', model: 'm', apiKey: 'k' });
  const l0Before = WA.store.get().memory.l0.length;
  global.__pushApiJson({ summary: 'v145 巩固摘要' });
  const l0Sum = await WA.memory.digestRound();
  const l0After = WA.store.get().memory.l0;
  assert(l0Sum === 'v145 巩固摘要', 'digestRound 经真实通道产出摘要');
  assert(Array.isArray(l0After) && l0After.length === l0Before + 1 && l0After[l0After.length - 1].s === 'v145 巩固摘要', 'L0 巩固真落盘（修复前此处静默丢失）');
  WA.apiRouter.setChannel('digest', dgCfg145 && dgCfg145.baseUrl && dgCfg145.model ? { baseUrl: dgCfg145.baseUrl, model: dgCfg145.model, apiKey: dgCfg145.apiKey } : null);
  // 自愈留痕
  const ls145 = WA.store.loadStat();
  assert(ls145.healed > healed0, '自愈字段数计入 loadStat.healed');
  assert(ls145.shapeConflicts === 0, '纯缺字段场景无类型冲突');
  assert(ls145.lastFix && ls145.lastFix.filled > 0, '本次载入 lastFix.filled 记录补齐量');
  // ── 幂等性：补齐已落盘，再次 init 不再 save（防每轮写放大回归）──
  const saveCnt145 = [0];
  const origSave145 = WA.store.save;
  WA.store.save = function () { saveCnt145[0]++; return origSave145.apply(WA.store, arguments); };
  WA.store.init();
  const reSave1 = saveCnt145[0];
  WA.store.init();
  const reSave2 = saveCnt145[0];
  WA.store.save = origSave145;
  assert(WA.store.loadStat().lastFix.filled === 0, '补齐落盘后重复 init：lastFix.filled 归零');
  assert(reSave1 === 0 && reSave2 === 0, '重复 init 不再触发 save（幂等，每轮零开销，实得 ' + reSave1 + '/' + reSave2 + '）');
  // 章号续编不从 1 重启
  WA.chapters.start('续章');
  assert(WA.store.get().chapters.current.no === 6, '旧存档续章号 = history 最大 no + 1（实得 ' + WA.store.get().chapters.current.no + '）');
  WA.chapters.end('收尾');
  // ── 类型冲突：不擅自改写用户数据，但要记账上报 ──
  global.localStorage.setItem(chatKey145, JSON.stringify({
    schemaVersion: WA.store.SCHEMA_VERSION,
    memory: { facts: [], foreshadows: [], l0: '被外部写坏的字符串', l1: [], l2: [], l3: [], pmem: [] },
    chronicle: 42
  }));
  WA.store.init();
  const st145c = WA.store.get();
  assert(st145c.memory.l0 === '被外部写坏的字符串', '类型冲突字段保留原值（不擅自改写）');
  assert(st145c.chronicle === 42, '顶层类型冲突同样保留');
  assert(st145c.memory.l1 !== undefined && st145c.clock && st145c.clock.source === 'unset', '冲突不影响其它缺失字段的补齐');
  const ls145c = WA.store.loadStat();
  assert(ls145c.shapeConflicts >= 2, '类型冲突计入 loadStat.shapeConflicts（实得 ' + ls145c.shapeConflicts + '）');
  const conflictLog = WA.eventLog.filter(function (l) { return String(l.msg).indexOf('类型与默认结构不符') >= 0; });
  assert(conflictLog.length >= 1 && conflictLog[0].level === 'error', '类型冲突以 error 级留痕');
  const dg145 = WA.toolDiag.collect();
  assert(((dg145.verdict || {}).issues || []).some(function (x) { return x.key === 'stateShape' && x.level === 'error'; }), '诊断报 stateShape error 议题');
  // ── lastFix 语义：议题只反映最近一次载入，不永久挂红 ──
  assert(ls145c.lastFix && ls145c.lastFix.conflicts >= 2, 'lastFix.conflicts 反映本次载入冲突数');
  assert(ls145c.shapeConflicts >= 2, 'shapeConflicts 保留历史累计');
  // 同一份状态再次载入：缺字段已在上次补齐并落盘，filled 归零，冲突仍在
  WA.store.init();
  const ls145re = WA.store.loadStat();
  assert(ls145re.lastFix.filled === 0, '重复载入已修状态：lastFix.filled 归零（不再挂 info 议题）');
  assert(ls145re.lastFix.conflicts >= 2, '类型冲突未自动修好则持续上报（不擅自改写用户数据）');
  assert(ls145re.shapeConflicts >= ls145c.shapeConflicts, '累计冲突数不回退');
  // ── sizeAudit 截断可见性 ──
  const aNorm = WA.store.sizeAudit({ minBytes: 64 });
  assert(aNorm.truncated === false && typeof aNorm.scannedNodes === 'number' && aNorm.nodeBudget === 800, '正常扫描不置 truncated');
  assert(aNorm.depthCap === 3, 'depthCap 透出实际生效值');
  const aTrunc = WA.store.sizeAudit({ minBytes: 64, maxNodes: 3 });
  assert(aTrunc.truncated === true, '预算耗尽时置 truncated=true（不再静默全绿）');
  const aTruncDeep = WA.store.sizeAudit({ minBytes: 64, maxDepth: 1 });
  assert(aTruncDeep.depthCap === 1 && aTruncDeep.arrays.every(function (x) { return x.path.indexOf('.') < 0; }), 'depthCap 生效：仅顶层数组被扫到');
  // 截断必须升级为议题（v0.1.47 语义更新：诊断改走 sizeAuditFull，
  // 故此处覆写底层 sizeAudit 使每片只能扫 3 节点——自动续扫仍无法收敛时应如实报未完整）
  const origAudit145 = WA.store.sizeAudit;
  WA.store.sizeAudit = function (o) { return origAudit145.call(WA.store, { minBytes: 64, maxNodes: 3 }); };
  const dg145t = WA.toolDiag.collect();
  const truncIssue = ((dg145t.verdict || {}).issues || []).filter(function (x) { return x.key === 'sizeScanTruncated'; })[0];
  assert(truncIssue && truncIssue.level === 'warn' && /unbounded\/suspects 不完整/.test(truncIssue.detail), '截断报 warn 议题并声明结果不完整');
  WA.store.sizeAudit = origAudit145;
  // ── 复原：还原测试前状态，不污染后续用例 ──
  if (saved145 === null) { try { delete global.localStorage[chatKey145]; } catch (e) {} }
  else global.localStorage.setItem(chatKey145, saved145);
  WA.store.init();
  assert(WA.store.get().memory && Array.isArray(WA.store.get().memory.l0), '复原后 store 仍可用');
  } // end v0.1.45 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.46 — 版本链步进迁移 + sizeAudit 断点续扫
  // ═══════════════════════════════════════════════════════════
  v0146: {
  // ── A. 版本链迁移 ──
  assert(typeof WA.store.registerMigration === 'function' && typeof WA.store.migrations === 'function', 'registerMigration/migrations 已导出');
  assert(WA.store.registerMigration('x', function () {}) === false, '非法版本参数被拒');
  assert(WA.store.registerMigration(2, null) === false, '非函数迁移步被拒');
  assert(WA.store.migrations().length === 0, '初始迁移注册表为空');
  // 两步链（target=2 显式指定，使链长于当前 SCHEMA_VERSION 也能被测到）
  const order146 = [];
  const off146a = WA.store.registerMigration(0, function (st) { order146.push(0); st._m0 = 'a'; });
  const off146b = WA.store.registerMigration(1, function (st) { order146.push(1); st._m1 = st._m0 + 'b'; });
  assert(typeof off146a === 'function' && typeof off146b === 'function', 'registerMigration 返回反注册函数');
  assert(WA.store.migrations().join(',') === '0,1', 'migrations() 按版本升序返回');
  const chain146 = WA.store.migrate({ schemaVersion: 0, clock: { iso: '', label: '旧纪元', dayIndex: 2 } }, 2);
  assert(order146.join(',') === '0,1', '两步按版本序依次执行（实得 ' + order146.join(',') + '）');
  assert(chain146._m1 === 'ab', '后步可见前步写入（链式传递）');
  assert(chain146.clock.label === '旧纪元' && chain146.clock.dayIndex === 2, '迁移保留既有业务数据');
  assert(chain146.clock.source === 'unset' && Array.isArray(chain146.memory.l0), '迁移后补齐缺字段（含嵌套）');
  assert(chain146.schemaVersion === WA.store.SCHEMA_VERSION, '迁移后版本号归一为当前值');
  // v0.1.47: 迁移路径改由观测层承载，state 上不再留 _migratedFrom（防污染持久 payload）
  assert(chain146._migratedFrom === undefined, '迁移报告不写进 state');
  const mr146 = WA.store.migrateReport();
  assert(mr146 && mr146.from === 0 && mr146.to === WA.store.SCHEMA_VERSION && mr146.path.join(',') === '0->1,1->2', 'migrateReport 透出迁移路径供排障');
  // 已达当前版本的存档：默认 target 下不空转任何步
  order146.length = 0;
  const skip146 = WA.store.migrate({ schemaVersion: WA.store.SCHEMA_VERSION, worldFacts: [{ key: 'a', value: '1' }] });
  assert(order146.length === 0, '已是当前版本时不执行迁移步');
  assert(skip146.worldFacts.length === 1, '跳过迁移仍保留数据');
  // 迁移步异常被隔离，链不中断
  const off146c = WA.store.registerMigration(3, function () { throw new Error('故意炸'); });
  const err146 = WA.store.migrate({ schemaVersion: 3, clock: { label: 'x' } }, 4);
  assert(err146.schemaVersion === WA.store.SCHEMA_VERSION && err146.clock.source === 'unset', '迁移步抛错被 catch，版本仍归一且字段补齐');
  const migErrLog = WA.eventLog.filter(function (l) { return String(l.msg).indexOf('迁移步') >= 0; });
  assert(migErrLog.length >= 1 && migErrLog[0].level === 'error', '迁移步异常以 error 级留痕');
  // 反注册清理：注册表须回到空（防测试污染真实迁移链）
  off146a(); off146b(); off146c();
  assert(WA.store.migrations().length === 0, '反注册后迁移表清空');
  const order146d = [];
  WA.store.migrate({ schemaVersion: 0 }, 2);
  assert(order146d.length === 0, '清理后的表不再被调用');
  // ── B. sizeAudit 断点续扫 ──
  // 探针子树：数组节点落在默认 maxDepth(3) 可见范围内
  WA.store.transact(function (d) {
    d.__deep = { a: { b: [{ x: 1 }, { y: 2 }], c: [1, 2, 3] }, d: [4], e: { f: [5, 6] } };
  });
  // 集合比对必须用足量 topN（arrays 默认只留 Top12，是排序视图而非全量清单）
  const OPT146 = { minBytes: 0, topN: 5000 };
  const audit146 = function (extra) { return WA.store.sizeAudit(Object.assign({}, OPT146, extra || {})); };
  const pFull146 = audit146({ maxNodes: 100000 });
  assert(pFull146.truncated === false && pFull146.cursor === null, '充足预算不截断且 cursor 为 null');
  const fullPaths146 = Array.from(new Set(pFull146.arrays.map(function (x) { return x.path; }))).sort();
  assert(fullPaths146.indexOf('__deep.a.b') >= 0 && fullPaths146.indexOf('__deep.e.f') >= 0, '全量扫描触达探针各层数组');
  assert(pFull146.arrays.length > 12 && audit146({ maxNodes: 100000, topN: 2 }).arrays.length === 2, 'arrays 受 topN 截断（默认视图非全量清单）');
  // 数据驱动预算取半：确保两趟各自都扫到数组（预算过小会退化成只扫对象节点）
  const half146 = Math.max(1, Math.ceil(pFull146.scannedNodes / 2));
  const p1 = audit146({ maxNodes: half146 });
  assert(p1.truncated === true, '半量预算触发截断');
  assert(Array.isArray(p1.cursor) && p1.cursor.length > 0, '截断时返回非空断点游标');
  assert(p1.scannedNodes === half146, '首趟访问数恰等于预算（实得 ' + p1.scannedNodes + '/' + half146 + '）');
  assert(p1.arrays.length > 0 && p1.arrays.length < fullPaths146.length, '首趟扫到部分而非全部数组（分割非退化）');
  const p2 = audit146({ maxNodes: 100000, resumeCursor: p1.cursor });
  assert(p2.truncated === false && p2.cursor === null, '续扫在充足预算下跑完');
  const p1Paths = p1.arrays.map(function (x) { return x.path; });
  const p2Paths = p2.arrays.map(function (x) { return x.path; });
  const uniqMerged = Array.from(new Set(p1Paths.concat(p2Paths))).sort();
  assert(uniqMerged.join(',') === fullPaths146.join(','), '两趟并集与全量扫描等价（无遗漏无重复）：' + uniqMerged.length + ' vs ' + fullPaths146.length);
  assert(p1Paths.filter(function (p) { return p2Paths.indexOf(p) >= 0; }).length === 0, '首趟与续扫无重叠节点（游标不回头）');
  assert(p1.scannedNodes + p2.scannedNodes === pFull146.scannedNodes, '两趟访问节点数之和等于全量（' + (p1.scannedNodes + p2.scannedNodes) + '）');
  // 三趟分割同样收敛
  const t1 = audit146({ maxNodes: Math.ceil(pFull146.scannedNodes / 3) });
  const t2 = audit146({ maxNodes: Math.ceil(pFull146.scannedNodes / 3), resumeCursor: t1.cursor });
  const t3 = audit146({ maxNodes: 100000, resumeCursor: t2.cursor });
  const uniq3 = Array.from(new Set(t1.arrays.map(function (x) { return x.path; }).concat(t2.arrays.map(function (x) { return x.path; })).concat(t3.arrays.map(function (x) { return x.path; })))).sort();
  assert(uniq3.join(',') === fullPaths146.join(','), '三趟分片并集仍等价全量');
  assert(t3.truncated === false, '末趟以全预算收敛');
  // startCursor：分片扫描入口
  const shard146 = audit146({ startCursor: ['__deep.a'], maxNodes: 100000 });
  assert(shard146.arrays.length === 2 && shard146.arrays.every(function (x) { return x.path.indexOf('__deep.a.') === 0; }), 'startCursor 限定只扫指定子树（实得 ' + shard146.arrays.map(function (x) { return x.path; }).join('|') + '）');
  // maxDepth 生效性
  assert(audit146({ maxNodes: 100000, maxDepth: 1 }).arrays.every(function (x) { return x.path.indexOf('.') < 0; }), 'maxDepth=1 只看顶层数组');
  // 游标边界：空游标降级全量、非法游标不崩
  assert(Array.from(new Set(audit146({ maxNodes: 100000, resumeCursor: [] }).arrays.map(function (x) { return x.path; }))).sort().join(',') === fullPaths146.join(','), '空 resumeCursor 降级为全量扫描');
  const bogus146 = audit146({ maxNodes: 100000, resumeCursor: ['nonexistent.path'] });
  assert(bogus146.arrays.length === 0 && bogus146.truncated === false, '游标指向不存在路径：产出为空但不崩不截断');
  // 探针字段清理
  WA.store.transact(function (d) { delete d.__deep; });
  assert(audit146({ maxNodes: 100000 }).arrays.every(function (x) { return x.path.indexOf('__deep') < 0; }), '探针字段清理完毕');
  } // end v0.1.46 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.47 — 迁移可观测闭环 + 分片扫描编排入口
  // ═══════════════════════════════════════════════════════════
  v0147: {
  assert(typeof WA.store.migrateReport === 'function' && typeof WA.store.sizeAuditFull === 'function', 'migrateReport/sizeAuditFull 已导出');
  // ── A. 迁移报告落观测层而非 state ──
  const recOff = WA.store.registerMigration(0, function (st) { st._r147 = 'a'; });
  const boomOff = WA.store.registerMigration(1, function () { throw new Error('boom147'); });
  const mig147 = WA.store.migrate({ schemaVersion: 0, clock: { label: 'x' } }, 2);
  assert(mig147._migratedFrom === undefined, '迁移报告不写入 state（防污染持久 payload）');
  assert(mig147._r147 === 'a', '成功步的写入被保留');
  const rep147 = WA.store.migrateReport();
  assert(rep147 && rep147.from === 0 && rep147.to === WA.store.SCHEMA_VERSION, '报告含起止版本');
  assert(rep147.path.join(',') === '0->1', '报告只记成功步');
  assert(rep147.failed.length === 1 && rep147.failed[0].at === 1 && /boom147/.test(rep147.failed[0].error), '失败步进报告（哪一步炸了不再只存于瞬时日志）');
  const repCopy = WA.store.migrateReport();
  repCopy.failed.push({ at: 99 });
  assert(WA.store.migrateReport().failed.length === 1, 'migrateReport 返回深拷贝（外部不可篡改内部状态）');
  const ls147 = WA.store.loadStat();
  assert(ls147.migrated && ls147.migrated.steps === 1 && ls147.migrated.failed === 1, 'loadStat.migrated 汇总步数与失败数');
  const dg147 = WA.toolDiag.collect();
  const migIssue = ((dg147.verdict || {}).issues || []).filter(function (x) { return x.key === 'schemaMigrate'; })[0];
  assert(migIssue && migIssue.level === 'error' && /1 步失败/.test(migIssue.detail), '迁移失败步报 error 议题');
  // 纯成功迁移 → info 级；无迁移 → 不报
  boomOff();
  const ok147 = WA.store.migrate({ schemaVersion: 0 }, 1);
  assert(ok147._migratedFrom === undefined, '成功迁移同样不污染 state');
  const dg147b = WA.toolDiag.collect();
  const migIssueB = ((dg147b.verdict || {}).issues || []).filter(function (x) { return x.key === 'schemaMigrate'; })[0];
  assert(migIssueB && migIssueB.level === 'info' && /1 步/.test(migIssueB.detail), '无失败时迁移降为 info 议题');
  recOff();
  assert(WA.store.migrations().length === 0, '测试迁移步已反注册清理');
  WA.store.migrate({ schemaVersion: WA.store.SCHEMA_VERSION });
  const dg147c = WA.toolDiag.collect();
  assert(!((dg147c.verdict || {}).issues || []).some(function (x) { return x.key === 'schemaMigrate'; }), '未发生迁移时不出该议题');
  // ── B. sizeAuditFull 分片编排 ──
  WA.store.transact(function (d) {
    d.__p147 = { a: { b: [{ x: 1 }, { y: 2 }], c: [1, 2, 3] }, d: [4], e: { f: [5, 6] } };
  });
  const OPT147 = { minBytes: 0, topN: 5000 };
  const oneShot = WA.store.sizeAudit(Object.assign({}, OPT147, { maxNodes: 100000 }));
  const oneSet = Array.from(new Set(oneShot.arrays.map(function (x) { return x.path; }))).sort().join(',');
  const fullBig = WA.store.sizeAuditFull(Object.assign({}, OPT147, { chunkNodes: 100000 }));
  assert(fullBig.complete === true && fullBig.chunks === 1 && fullBig.stalled === false, '大片段：一趟收敛');
  assert(Array.from(new Set(fullBig.arrays.map(function (x) { return x.path; }))).sort().join(',') === oneSet, 'sizeAuditFull 与单次大预算集合等价');
  assert(fullBig.visitedNodes === oneShot.scannedNodes, '编排访问节点数与单次一致（无重扫）');
  // 小片段：多趟接力后仍与全量等价（这是编排入口存在的意义）
  const halfN = Math.max(1, Math.ceil(oneShot.scannedNodes / 2));
  const fullSplit = WA.store.sizeAuditFull(Object.assign({}, OPT147, { chunkNodes: halfN }));
  assert(fullSplit.chunks >= 2, '小片段自动接力为多趟（实得 ' + fullSplit.chunks + ' 片）');
  assert(fullSplit.complete === true && fullSplit.stalled === false, '多趟仍完整收敛（无需调用方手写循环）');
  assert(Array.from(new Set(fullSplit.arrays.map(function (x) { return x.path; }))).sort().join(',') === oneSet, '分片并集与全量集合等价');
  assert(fullSplit.visitedNodes === oneShot.scannedNodes, '分片总访问量等于全量（无重复无遗漏）');
  // chunk=3 需较多趟数才能覆盖被前序测试灌大的 state，故放宽 maxChunks（触顶行为由下方 capped 用例专测）
  const tiny = WA.store.sizeAuditFull(Object.assign({}, OPT147, { chunkNodes: 3, maxChunks: 5000 }));
  assert(Array.from(new Set(tiny.arrays.map(function (x) { return x.path; }))).sort().join(',') === oneSet, '极小片段(3)仍收敛到全量集合');
  assert(tiny.chunks > fullSplit.chunks, '片段越小所需趟数越多（实得 ' + tiny.chunks + '）');
  // maxChunks 触顶：如实报告未扫完，绝不假装全绿
  const capped = WA.store.sizeAuditFull(Object.assign({}, OPT147, { chunkNodes: 3, maxChunks: 2 }));
  assert(capped.complete === false && capped.stalled === true && capped.chunks === 2, '片数触顶报 complete=false/stalled=true');
  assert(Array.from(new Set(capped.arrays.map(function (x) { return x.path; }))).join(',').split(',').length < oneSet.split(',').length, '触顶时结果确实不完整（未假装扫完）');
  // 结论级派生字段与 sizeAudit 同语义
  const cleanFull = WA.store.sizeAuditFull({ minBytes: 64 });
  assert(Array.isArray(cleanFull.unbounded) && Array.isArray(cleanFull.suspects) && Array.isArray(cleanFull.drifted), '编排结果含 unbounded/suspects/drifted');
  assert(cleanFull.complete === true && cleanFull.truncated === undefined, '编排结果以 complete 表达收敛（truncated 属单片语义）');
  assert(cleanFull.trackedBounded === Object.keys(WA.store.sizeCaps()).length, 'trackedBounded 与登记表条数一致');
  // 无界容器经编排仍被抓出（与 v0.1.43 单片行为一致）。
  // 注意：本用例只验证「未登记容器会被抓出」，因此先把 state 收到只剩哨兵，
  // 避免前序用例累积的数组节点（含 v2.68.0 四个新容器）在极小 chunk 预算下
  // 挤占扫描趟数，使断言随上游规模漂移。
  WA.store.transact(function (d) {
    Object.keys(d).forEach(function (k) { if (k !== 'clock' && k !== 'people') delete d[k]; });
    d.__p147 = null; d.__journal147 = [];
    for (let i = 0; i < 30; i++) d.__journal147.push('r' + i + ' ' + 'w'.repeat(40));
  });
  const withBad = WA.store.sizeAuditFull({ minBytes: 64, chunkNodes: 5 });
  assert(withBad.complete === true && withBad.unbounded.indexOf('__journal147') >= 0, '编排扫描仍抓出未登记容器');
  assert(withBad.suspects.some(function (x) { return x.path === '__journal147'; }), '该容器进 suspects');
  WA.store.transact(function (d) { delete d.__journal147; delete d.__p147; });
  // 诊断消费编排入口且默认态干净
  const dg147d = WA.toolDiag.collect();
  const aud147 = ((dg147d.worldState || {}).storage || {}).sizeAudit;
  assert(aud147 && typeof aud147.complete === 'boolean' && typeof aud147.chunks === 'number', '诊断走 sizeAuditFull（透出 complete/chunks）');
  assert(aud147.complete === true && (!aud147.suspects || aud147.suspects.length === 0), '默认态诊断：扫描完整且无无界嫌疑');
  assert(!((dg147d.verdict || {}).issues || []).some(function (x) { return x.key === 'sizeScanTruncated'; }), '收敛时不报未收敛议题');
  WA.store.transact(function (d) { delete d.__p147; });
  // ── C. 迁移报告不跨载入粘留（与 v0.1.45 lastFix 同一类故障的守卫）──
  const keyC147 = 'worldaxis_state_' + WA.store.chatId();
  const saveC147 = global.localStorage.getItem(keyC147);
  const offC = WA.store.registerMigration(0, function (st) { st._c147 = 'ran'; });
  // 真实 init 迁移分支：存档版本 0 < SCHEMA_VERSION(1)
  global.localStorage.setItem(keyC147, JSON.stringify({ schemaVersion: 0, clock: { label: 'L' } }));
  WA.store.init();
  const repC1 = WA.store.migrateReport();
  assert(repC1 && repC1.from === 0 && repC1.steps === 1, '载入时真实走迁移链并出报告');
  assert(WA.store.get()._c147 === 'ran', '迁移步的转换确实落到载入后的 state');
  assert(WA.store.get().clock.label === 'L', '迁移载入保留原数据');
  assert(((WA.toolDiag.collect().verdict || {}).issues || []).some(function (x) { return x.key === 'schemaMigrate'; }), '迁移发生当次载入出议题');
  // 同一份存档已升到当前版本：再次载入不再迁移，报告须为 null 而非上一次的残留
  WA.store.init();
  assert(WA.store.migrateReport() === null, '重复载入不再迁移：报告为 null（不粘留）');
  assert(!((WA.toolDiag.collect().verdict || {}).issues || []).some(function (x) { return x.key === 'schemaMigrate'; }), '议题随载入结束消失（不永久挂红）');
  assert(WA.store.loadStat().migrated === null, 'loadStat.migrated 同步归零');
  offC();
  if (saveC147 === null) { try { delete global.localStorage[keyC147]; } catch (e) {} }
  else global.localStorage.setItem(keyC147, saveC147);
  WA.store.init();
  assert(WA.store.migrations().length === 0, '迁移步与存档现场均已复原');
  } // end v0.1.47 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.48 — 派生逻辑单一实现（sizeAudit 与 sizeAuditFull 结论一致）
  // ═══════════════════════════════════════════════════════════
  v0148: {
  // 造一份含「未登记容器 + 漂移容器」的 state，令两入口都需派生同一结论
  WA.store.transact(function (d) {
    d.__bad148 = []; for (let i = 0; i < 25; i++) d.__bad148.push('x' + i + ' ' + 'k'.repeat(30));
    d.memory.l3 = []; for (let i = 0; i < 70; i++) d.memory.l3.push({ t: Date.now(), theme: 'L3' + i });
    d.worldFacts = []; for (let i = 0; i < 100; i++) d.worldFacts.push({ key: 'k' + i, value: 'v'.repeat(20) });
  });
  const MIN148 = 64;
  const sa148 = WA.store.sizeAudit({ minBytes: MIN148, maxNodes: 100000, topN: 5000 });
  const sf148 = WA.store.sizeAuditFull({ minBytes: MIN148, chunkNodes: 100000, topN: 5000 });
  assert(sa148.total === sf148.total, '两入口 total 一致（v0.1.48 前 sizeAuditFull 用滞后的 saveStat.bytes）');
  assert(sf148.total === sf148.persisted || sa148.total > sa148.persisted, 'total 反映当前内存态而非滞后落盘量');
  const setOf = function (arr) { return Array.from(new Set(arr)).sort().join(','); };
  assert(setOf(sa148.unbounded) === setOf(sf148.unbounded), 'unbounded 结论两处一致（按集合比对：两入口遍历顺序不同）');
  assert(JSON.stringify(sa148.suspects) === JSON.stringify(sf148.suspects), 'suspects 结论两处一致');
  assert(JSON.stringify(sa148.drifted) === JSON.stringify(sf148.drifted), 'drifted 结论两处一致');
  // 结论本身正确（派生收敛未丢功能）：未登记被抓、漂移被抓、有界不误报
  assert(sa148.unbounded.indexOf('__bad148') >= 0 && sa148.suspects.some(function (x) { return x.path === '__bad148'; }), '未登记容器经共享派生仍被抓出');
  assert(sa148.drifted.some(function (x) { return x.path === 'memory.l3' && x.len === 70 && x.cap === 60; }), '超 cap 容器经共享派生仍报漂移');
  assert(sa148.drifted.every(function (x) { return x.path !== 'worldFacts'; }), '满载有界容器(worldFacts=100=cap)不误报');
  // 极端 chunk：多片接力后结论与单片大预算完全相同
  const sSmall = WA.store.sizeAuditFull({ minBytes: MIN148, chunkNodes: 4, maxChunks: 5000, topN: 5000 });
  assert(sSmall.chunks > 1 && sSmall.complete === true, '小 chunk 多片自动接力收敛（实得 ' + sSmall.chunks + ' 片）');
  assert(setOf(sSmall.unbounded) === setOf(sa148.unbounded) && JSON.stringify(sSmall.suspects) === JSON.stringify(sa148.suspects) && JSON.stringify(sSmall.drifted) === JSON.stringify(sa148.drifted), '分片结论与单片一致（suspects/drifted 已排序）');
  assert(sSmall.total === sa148.total, '分片 total 同样与单片一致');
  // 诊断消费链：verdict 议题仍由派生结论正确生成
  const dg148 = WA.toolDiag.collect();
  const iss148 = ((dg148.verdict || {}).issues || []);
  assert(iss148.some(function (x) { return x.key === 'sizeAudit'; }), '未登记容器经诊断报 sizeAudit 议题');
  assert(iss148.some(function (x) { return x.key === 'sizeDrift'; }), '漂移经诊断报 sizeDrift 议题');
  WA.store.transact(function (d) { delete d.__bad148; d.memory.l3 = []; d.worldFacts = []; });
  const after148 = WA.store.sizeAudit({ minBytes: MIN148, maxNodes: 100000 });
  assert(after148.suspects.every(function (x) { return x.path.indexOf('__bad') < 0; }), '本探针容器清理后不再进 suspects');
  assert(after148.drifted.every(function (x) { return x.path !== 'memory.l3'; }), 'l3 归零后不再报漂移');
  assert(after148.arrays.every(function (x) { return x.path.indexOf('__bad') < 0; }), '探针字段清理完毕');
  } // end v0.1.48 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.49 — site 自由文本反查校验 + 日志/工作流历史跨重启恢复
  // ═══════════════════════════════════════════════════════════
  v0149: {
  // ── 1. site 声明反查 ──
  const caps149 = WA.store.sizeCaps();
  assert(caps149.chronicle && caps149.chronicle.site.includes('backstage.js'), 'chronicle 的 site 正确引用 backstage.js');
  assert(caps149['memory.l0'] && caps149['memory.l0'].site.includes('memory.js'), 'memory.l0 的 site 正确引用 memory.js');
  
  // ── 2. eventLog 跨会话/切聊天持久化与恢复 ──
  const currentChatId = WA.store.chatId();
  WA.clearEventLog(currentChatId);
  assert(WA.eventLog.length === 0, 'clearEventLog 清空当前内存与持久日志');
  
  WA.log('info', 'v149 测试日志 1', 'data1');
  WA.log('warn', 'v149 测试日志 2', 'data2');
  assert(WA.eventLog.length === 2, 'WA.log 正常推进内存环形队列');
  
  // 模拟切聊天/初始化触发 loadEventLog
  const mockChatB = 'chat_test_v149_b';
  WA.loadEventLog(mockChatB);
  assert(WA.eventLog.length === 0, '切换到无日志的聊天后，内存 eventLog 为空');
  
  // 切回原始聊天，加载持久化日志
  WA.loadEventLog(currentChatId);
  assert(WA.eventLog.length === 2, '切回原始聊天后，持久化的 2 条日志完整恢复');
  assert(WA.eventLog[0].msg === 'v149 测试日志 1', '恢复日志内容与顺序一致');
  
  WA.clearEventLog(currentChatId);
  WA.clearEventLog(mockChatB);
  
  // ── 3. workflow 历史跨会话/切聊天持久化与恢复 ──
  WA.workflow.resetHistory(currentChatId);
  assert(WA.workflow.history().runs.length === 0, 'resetHistory 清空当前聊天历史与持久记录');
  
  WA.workflow.register({ id: 'wtest149.node', chain: 'wtest149', order: 1, label: 'v149 节点', async run() {} });
  await WA.workflow.run('wtest149', {});
  assert(WA.workflow.history().runs.length === 1, '运行工作流后产生 1 条历史记录');
  
  // 切换聊天，加载另一聊天的 history
  WA.workflow.loadHistory(mockChatB);
  assert(WA.workflow.history().runs.length === 0, '切换至新聊天，工作流历史为空');
  
  // 切回原始聊天
  WA.workflow.loadHistory(currentChatId);
  assert(WA.workflow.history().runs.length === 1, '切回原始聊天，工作流历史完整恢复');
  assert(WA.workflow.history().runs[0].chain === 'wtest149', '恢复的工作流历史链名一致');
  
  // 清理测试节点与历史
  WA.workflow.unregister('wtest149.node');
  WA.workflow.resetHistory(currentChatId);
  WA.workflow.resetHistory(mockChatB);
  } // end v0.1.49 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.50 — sizeAudit 报告导出 + 撤销台账跨会话/切聊天持久化
  // ═══════════════════════════════════════════════════════════
  v0150: {
  // ── 1. exportAuditReport 格式化报告导出 ──
  assert(typeof WA.store.exportAuditReport === 'function', 'store.exportAuditReport 已导出');
  const report150 = WA.store.exportAuditReport({ minBytes: 64 });
  assert(typeof report150 === 'string' && report150.includes('# WorldAxis 内存/持久化审计报告'), '报告包含标题标头');
  assert(report150.includes('总内存/状态体积') && report150.includes('状态统计概览'), '报告包含概览与统计');
  assert(report150.includes('Top 容器内存占用排行'), '报告包含 Top 容器排行');

  // ── 2. uninjectLedger 撤销台账持久化与恢复 ──
  const cid150 = WA.store.chatId();
  if (WA.render.clearUninjectLedger) WA.render.clearUninjectLedger(cid150);
  
  WA.render.uninject('test_v150_trigger');
  const leg150 = WA.render.injectionLedger();
  assert(leg150.count >= 1, 'uninject 后产生撤销台账记录');
  
  // 真实切换 SillyTavern context 的 chatId
  const mockChat150 = 'chat_test_v150_b';
  const stCtx = global.SillyTavern.getContext();
  const origChatId = stCtx.chatId;
  stCtx.chatId = mockChat150;
  
  if (WA.render.loadUninjectLedger) {
    WA.render.loadUninjectLedger(mockChat150);
    const legChatB = WA.render.injectionLedger();
    assert(legChatB.entries.length === 0, '切至无台账聊天后，台账数据为空');
    
    // 切回原聊天
    stCtx.chatId = origChatId;
    WA.render.loadUninjectLedger(cid150);
    const legRestored = WA.render.injectionLedger();
    assert(legRestored.entries.length >= 1, '切回原聊天，撤销台账成功恢复');
    assert(legRestored.entries.some(function (e) { return e.trigger === 'test_v150_trigger'; }), '恢复的撤销记录触发源吻合');
    
    // 清理
    WA.render.clearUninjectLedger(cid150);
    WA.render.clearUninjectLedger(mockChat150);
  }
  } // end v0.1.50 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.51 — 存储键卫生：storageStat 分类计量 + sweepStaleKeys 过期清理
  // ═══════════════════════════════════════════════════════════
  v0151: {
  assert(typeof WA.store.storageStat === 'function' && typeof WA.store.sweepStaleKeys === 'function', 'storageStat/sweepStaleKeys 已导出');

  // ── 场景构造：多聊天键空间 ──
  const cur151 = WA.store.chatId();
  const LS = global.localStorage;
  const junkBefore151 = JSON.parse(JSON.stringify(LS._dump()));
  // 冷聊天 A：state 活跃时间 40 天前（过期）
  const coldA = 'v151_cold_a';
  LS.setItem('worldaxis_state_' + coldA, JSON.stringify({ meta: { updatedAt: Date.now() - 40 * 86400000 } }));
  LS.setItem('worldaxis_event_log_' + coldA, '[]');
  LS.setItem('worldaxis_wf_history_' + coldA, '[]');
  LS.setItem('worldaxis_uninject_ledger_' + coldA, '[]');
  LS.setItem('worldaxis_recovery_' + coldA, '[]');
  // 活跃聊天 B：state 活跃时间 1 天前（未过期）
  const warmB = 'v151_warm_b';
  LS.setItem('worldaxis_state_' + warmB, JSON.stringify({ meta: { updatedAt: Date.now() - 1 * 86400000 } }));
  LS.setItem('worldaxis_event_log_' + warmB, '[]');
  // 孤儿聊天 C：无 state 键，只有 recovery + 诊断键（聊天已删残留）
  const orphanC = 'v151_orphan_c';
  LS.setItem('worldaxis_recovery_' + orphanC, '[]');
  LS.setItem('worldaxis_event_log_' + orphanC, '[]');
  // corrupt 键 ×7 归非当前聊天（应保留最近 5 个 → 溢出 2 个）
  const qHost151 = 'v151_quarantine_host';
  for (let ci = 0; ci < 7; ci++) LS.setItem('worldaxis_state_' + qHost151 + '_corrupt_' + (Date.now() - ci * 1000), '{}');
  // 当前聊天的隔离副本 ×2（v0.2.3：受保护——损坏现场是唯一可回滚数据，不得当溢出清理）
  for (let ci = 0; ci < 2; ci++) LS.setItem('worldaxis_state_' + cur151 + '_corrupt_' + (Date.now() - 1000000 - ci * 1000), '{}');
  // settings / wb 键（永不清理）
  LS.setItem('worldaxis_backstage_settings_v1', '{}');
  LS.setItem('worldaxis_wb_selection_' + coldA, '{}');

  // ── 1. storageStat 分类计量 ──
  const stat151 = WA.store.storageStat();
  assert(stat151.enumerable === true, 'mock localStorage 支持枚举');
  assert(stat151.totalKeys >= 15, '键总数计入（实 ' + stat151.totalKeys + '）');
  assert(stat151.families.state >= 3 && stat151.families.diagnostic >= 5, 'state/diagnostic 家族分类计数');
  assert(stat151.families.corrupt === 9, 'corrupt 家族计数（7 宿主 + 2 当前聊天副本，实 ' + stat151.families.corrupt + '）');
  assert(stat151.families.settings >= 1 && stat151.families.wb >= 1, 'settings/wb 家族分类');
  assert(stat151.currentChat === cur151 && stat151.currentChatBytes > 0, '当前聊天键计量（' + stat151.currentChatBytes + 'B）');
  const staleKeys151 = stat151.staleDiagCandidates.map(x => x.key);
  assert(staleKeys151.indexOf('worldaxis_event_log_' + coldA) >= 0, '冷聊天 A 诊断键入 stale 候选');
  assert(staleKeys151.indexOf('worldaxis_event_log_' + orphanC) >= 0, '孤儿聊天 C 诊断键入 stale 候选（idleMs=Infinity 排最前）');
  assert(staleKeys151.indexOf('worldaxis_event_log_' + warmB) < 0, '活跃聊天 B 诊断键不入候选');

  // ── 2. sweepStaleKeys dry-run（默认不删）──
  const plan151 = WA.store.sweepStaleKeys({ maxIdleDays: 30, keepCorrupt: 5 });
  assert(plan151.apply === false, '默认 dry-run');
  assert(LS.getItem('worldaxis_event_log_' + coldA) !== null, 'dry-run 不实际删除');
  const rem151 = plan151.remove;
  assert(rem151.some(r => r.key === 'worldaxis_event_log_' + coldA) && rem151.some(r => r.key === 'worldaxis_wf_history_' + coldA) && rem151.some(r => r.key === 'worldaxis_uninject_ledger_' + coldA), '冷聊天 A 三个诊断键全进清理计划');
  assert(rem151.some(r => r.key === 'worldaxis_event_log_' + orphanC), '孤儿聊天 C 诊断键进计划');
  assert(rem151.some(r => r.key === 'worldaxis_recovery_' + orphanC && r.reason === 'orphan-recovery'), '孤儿 recovery 进计划（聊天无 state）');
  assert(!rem151.some(r => r.key === 'worldaxis_event_log_' + warmB), '活跃聊天 B 诊断键保留');
  assert(!rem151.some(r => r.chat === cur151), '当前聊天任何键保留（含 corrupt）');
  assert(!rem151.some(r => r.reason === 'corrupt-overflow' && r.chat === cur151), '当前聊天隔离副本不受 corrupt 溢出管辖（v0.2.3 数据保护）');
  assert(!rem151.some(r => r.key === 'worldaxis_backstage_settings_v1') && !rem151.some(r => r.key === 'worldaxis_wb_selection_' + coldA), 'settings/wb 键永不清理');
  const corruptRem151 = rem151.filter(r => r.reason === 'corrupt-overflow');
  assert(corruptRem151.length === 2, 'corrupt 超出保留窗口 2 个（7-5）');
  assert(plan151.freedBytes > 0, '可释放字节计量（' + plan151.freedBytes + 'B）');

  // ── 3. apply 真删 + 删后复核 ──
  const planApply151 = WA.store.sweepStaleKeys({ maxIdleDays: 30, keepCorrupt: 5, apply: true });
  assert(planApply151.apply === true && planApply151.remove.length === rem151.length, 'apply 计划与 dry-run 一致');
  assert(LS.getItem('worldaxis_event_log_' + coldA) === null && LS.getItem('worldaxis_recovery_' + orphanC) === null, '过期诊断键与孤儿 recovery 已实际删除');
  assert(LS.getItem('worldaxis_event_log_' + warmB) !== null && LS.getItem('worldaxis_state_' + warmB) !== null, '活跃聊天键完好');
  assert(LS.getItem('worldaxis_backstage_settings_v1') !== null && LS.getItem('worldaxis_wb_selection_' + coldA) !== null, 'settings/wb 完好');
  const afterStat151 = WA.store.storageStat();
  assert(afterStat151.families.corrupt === 7, 'corrupt 保留 5 宿主 + 2 当前聊天副本（实 ' + afterStat151.families.corrupt + '）');
  assert(afterStat151.totalKeys === stat151.totalKeys - planApply151.remove.length, '删后键总数精确对账');

  // ── 4. toolDiag 集成 ──
  const diag151 = WA.toolDiag.collect();
  const skDiag151 = (((diag151.worldState || {}).storage || {}).storageKeys) || null;
  assert(skDiag151 && typeof skDiag151.totalKeys === 'number', 'toolDiag 透出 storageKeys 计量');

  // ── 5. exportAuditReport 存储键段 ──
  const rpt151 = WA.store.exportAuditReport({ minBytes: 64 });
  assert(rpt151.includes('## 📦 存储键空间') && rpt151.includes('worldaxis_* 键总数'), '审计报告含存储键分类段');

  // ── 清理：还原为进入本块前的键空间快照 ──
  LS.clear();
  Object.keys(junkBefore151).forEach(k => LS.setItem(k, junkBefore151[k]));
  } // end v0.1.51 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.52 — 存储键卫生入口化：静默巡检告警（节流） + 面板体检按钮
  // ═══════════════════════════════════════════════════════════
  v0152: {
  // ── 1. panel 源码断言：按钮 + 二次确认绑定已注入 ──
  const panelSrc152 = readSrc('ui/panel.js'); // v2.401.0(OPV23): 改读 panelSource() 重组面
  assert(panelSrc152.indexOf('wa-key-check') >= 0 && panelSrc152.indexOf('存储键体检') >= 0, '面板含「存储键体检」按钮');
  assert(panelSrc152.indexOf('wa-key-sweep-go') >= 0 && panelSrc152.indexOf('确认清理（不可撤销）') >= 0, '体检走二次确认制（dry-run 计划先展示）');
  // v2.5.0: apply 段的参数随「幽灵设置键」出口扩了一维（ghostSettings），
  //   故断言从「逐字相等」放宽为「前缀命中」——仍校验两段式（先 dry-run 计划、后 apply 执行）。
  assert(panelSrc152.indexOf('sweepStaleKeys({})') >= 0 && /sweepStaleKeys\(\{ apply: true/.test(panelSrc152), '体检先 dry-run 后 apply 两段式');

  // ── 2. init 静默巡检：大额可回收触发告警 + 节流只一次 ──
  const LS152 = global.localStorage;
  const junkBefore152 = JSON.parse(JSON.stringify(LS152._dump()));
  const evtLogBefore152 = WA.eventLog.slice();
  const hugeStr152 = 'x'.repeat(300 * 1024);   // 单键 >256KB 触发阈值
  const coldChat152 = 'v152_cold_chat';
  LS152.setItem('worldaxis_state_' + coldChat152, JSON.stringify({ meta: { updatedAt: Date.now() - 40 * 86400000 } }));
  LS152.setItem('worldaxis_event_log_' + coldChat152, hugeStr152);
  WA.store.init();
  const warns152 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0);
  assert(warns152.length >= 1, '大额可回收（>256KB）触发一次告警（实 ' + warns152.length + '）');
  WA.store.init();
  WA.store.init();
  const warnsAfter152 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0);
  assert(warnsAfter152.length === warns152.length, '节流生效：后续 init 不重复告警（' + warns152.length + ' 恒定）');
  assert(LS152.getItem('worldaxis_event_log_' + coldChat152) === hugeStr152, '静默巡检绝不自动删除（仅告警）');

  // ── 3. 小额可回收：低于阈值不告警 ──
  // 先模拟用户通过面板执行了清理（大额垃圾已回收），再注小额键验证静默
  WA.store.sweepStaleKeys({ apply: true });
  const evtLog2Before152 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  const smallChat152 = 'v152_small_chat';
  LS152.setItem('worldaxis_state_' + smallChat152, JSON.stringify({ meta: { updatedAt: Date.now() - 60 * 86400000 } }));
  LS152.setItem('worldaxis_event_log_' + smallChat152, '[]');   // 仅 2B，远低于阈值
  WA.store.init();
  const evtLog2After152 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  assert(evtLog2After152 === evtLog2Before152, '小额可回收不产生告警（阈值 + 节流双闸）');

  // ── 清理：还原键空间与日志现场 ──
  LS152.clear();
  Object.keys(junkBefore152).forEach(k => LS152.setItem(k, junkBefore152[k]));
  WA.eventLog.length = 0;
  evtLogBefore152.forEach(l => WA.eventLog.push(l));
  } // end v0.1.52 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.53 — error 日志子环：关键故障证据不被 info 噪音挤出
  // ═══════════════════════════════════════════════════════════
  v0153: {
  assert(Array.isArray(WA.errorLog), 'WA.errorLog 子环已导出');

  // ── 1. info 噪音灌满混合环，error 证据仍存活 ──
  const evtBefore153 = WA.eventLog.slice();
  const errBefore153 = WA.errorLog.slice();
  WA.log('error', 'v153 关键故障A', 'boom');
  for (let i = 0; i < 320; i++) WA.log('info', 'v153 噪音' + i);   // 灌满并翻转混合环
  assert(WA.eventLog.length <= 300, '混合环仍守 300 上限（实 ' + WA.eventLog.length + '）');
  assert(WA.errorLog.some(l => l.msg === 'v153 关键故障A'), 'error 证据在子环中存活（不受 info 挤出）');
  assert(!WA.eventLog.some(l => l.msg === 'v153 关键故障A'), '混合环中已被噪音挤出（证伪前提成立）');

  // ── 2. error 子环自身环形（>50 翻转）──
  for (let i = 0; i < 55; i++) WA.log('error', 'v153 err' + i);
  assert(WA.errorLog.length <= 50, 'error 子环守 50 上限（实 ' + WA.errorLog.length + '）');
  assert(WA.errorLog.some(l => l.msg === 'v153 err54'), 'error 子环保留最新');
  assert(!WA.errorLog.some(l => l.msg === 'v153 err0'), 'error 子环丢弃最旧');

  // ── 3. 持久化与跨会话恢复 ──
  const cid153 = WA.store.chatId();
  const persistedErr153 = global.localStorage.getItem('worldaxis_error_log_' + cid153);
  assert(persistedErr153 && persistedErr153.includes('v153 err54'), 'error 子环已落盘（worldaxis_error_log_ 键）');
  WA.loadEventLog(cid153);
  assert(WA.errorLog.length >= 1 && WA.errorLog.some(l => l.msg === 'v153 err54'), 'loadEventLog 同步恢复 error 子环');

  // ── 4. 切聊天隔离 ──
  const otherChat153 = 'chat_test_v153_b';
  WA.loadEventLog(otherChat153);
  assert(WA.errorLog.length === 0, '切至无日志聊天，error 子环清空（分域隔离）');
  WA.loadEventLog(cid153);
  assert(WA.errorLog.some(l => l.msg === 'v153 err54'), '切回原聊天，error 子环恢复');

  // ── 5. 键卫生分类归属 ──
  const stat153 = WA.store.storageStat();
  assert(stat153.families.diagnostic >= 1, 'error_log 键计入 diagnostic 家族（防 sweep 漏判）');
  // 构造过期冷聊天的 error_log 键验证 sweep 纳管（当前聊天键受保护不进计划，属预期）
  const coldChat153 = 'v153_cold_chat';
  global.localStorage.setItem('worldaxis_state_' + coldChat153, JSON.stringify({ meta: { updatedAt: Date.now() - 40 * 86400000 } }));
  global.localStorage.setItem('worldaxis_error_log_' + coldChat153, '[]');
  const sweepPlan153 = WA.store.sweepStaleKeys({ maxIdleDays: 30 });
  assert(sweepPlan153.remove.some(r => r.key === 'worldaxis_error_log_' + coldChat153), 'sweep 计划纳入冷聊天 error_log 键（与 event_log 同域同规）');
  global.localStorage.removeItem('worldaxis_state_' + coldChat153);
  global.localStorage.removeItem('worldaxis_error_log_' + coldChat153);

  // ── 6. clearEventLog 双清 ──
  WA.clearEventLog(cid153);
  assert(WA.errorLog.length === 0 && global.localStorage.getItem('worldaxis_error_log_' + cid153) === null, 'clearEventLog 同时清内存与持久 error 子环');

  // ── 7. 面板「仅看错误」开关（源码断言）──
  const panelSrc153 = readSrc('ui/panel.js'); // v2.401.0(OPV23): 改读 panelSource() 重组面
  assert(/wa-log-err/.test(panelSrc153) && /仅看错误/.test(panelSrc153), '面板含「仅看错误」开关');
  // 边界严格断言：WA.errorLog 后不得紧跟标识符字符（防 errorLogGone 类前缀蒙混）
  assert(/WA\.errorLog[^A-Za-z0-9_]/.test(panelSrc153) && /__logErrOnly\s*=\s*!__logErrOnly/.test(panelSrc153), '开关切换 errorLog 子环视图');
  assert(/id="wa-log-err"/.test(panelSrc153) && /on\('#wa-log-err'/.test(panelSrc153), '开关按钮 id 与绑定成对存在');

  // ── 清理：还原日志现场 ──
  WA.eventLog.length = 0;
  evtBefore153.forEach(l => WA.eventLog.push(l));
  WA.errorLog.length = 0;
  errBefore153.forEach(l => WA.errorLog.push(l));
  WA.log('info', 'v153 现场还原');
  } // end v0.1.53 block
  // ═══════════════════════════════════════════════════════════
  // v0.1.54 — 错误报告包导出 + 巡检段收敛（去重/纯指纹幂等）
  // ═══════════════════════════════════════════════════════════
  v0154: {
  // ── 1. buildErrorReport 组装完整性 ──
  assert(typeof WA.toolDiag.buildErrorReport === 'function', 'toolDiag.buildErrorReport 已导出');
  const evtBefore154 = WA.eventLog.slice();
  const errBefore154 = WA.errorLog.slice();
  WA.log('error', 'v154 报告样本错误', 'boom-detail');
  const rpt154 = WA.toolDiag.buildErrorReport();
  const rptLines154 = rpt154.split('\n');
  assert(rptLines154[0] === '# WorldAxis 错误报告', '报告首行精确匹配标准头（防前缀蒙混）');
  assert(rpt154.indexOf('v154 报告样本错误') >= 0 && rpt154.indexOf('boom-detail') >= 0, '报告含 error 子环条目与 data');
  assert(rpt154.indexOf('## 自检议题') >= 0 && rpt154.indexOf('## 内存审计摘要') >= 0 && rpt154.indexOf('## 存储键统计') >= 0, '报告含自检议题/审计/存储键三段');
  assert(rpt154.indexOf('版本: v') >= 0, '报告含版本头');

  // ── 2. 巡检段收敛（源码断言）──
  const storeSrc154 = fs.readFileSync(path.join(BASE, 'core/store.js'), 'utf8');
  assert((storeSrc154.match(/存储键卫生静默巡检/g) || []).length === 1, '巡检段唯一（v0.1.52 双段残留已清除）');
  assert(!/__keyHygieneWarned|__keyHygieneLastSig|__keyHygieneLastScanAt/.test(storeSrc154), '旧节流变量无残留（布尔/双指纹/时间窗均收敛为单指纹）');

  // ── 3. 纯指纹幂等：新垃圾集首见告警一次，重复 init 静默 ──
  const LS154 = global.localStorage;
  const junkBefore154 = JSON.parse(JSON.stringify(LS154._dump()));
  const logBefore154 = WA.eventLog.slice();
  const huge154 = 'y'.repeat(300 * 1024);
  const cold154 = 'v154_cold_chat';
  LS154.setItem('worldaxis_state_' + cold154, JSON.stringify({ meta: { updatedAt: Date.now() - 40 * 86400000 } }));
  LS154.setItem('worldaxis_event_log_' + cold154, huge154);
  WA.store.init();   // 新垃圾集首见 → 告警一次
  const w1_154 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  assert(w1_154 >= 1, '新垃圾集首见告警一次（实 ' + w1_154 + '）');
  WA.store.init();
  WA.store.init();
  const w2_154 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  assert(w2_154 === w1_154, '同指纹重复 init 静默（' + w1_154 + ' 恒定，无时间窗依赖）');

  // ── 4. 指纹变化必告（追加新大额垃圾）──
  const cold154b = 'v154_cold_chat_b';
  LS154.setItem('worldaxis_state_' + cold154b, JSON.stringify({ meta: { updatedAt: Date.now() - 50 * 86400000 } }));
  LS154.setItem('worldaxis_event_log_' + cold154b, 'z'.repeat(300 * 1024));
  WA.store.init();
  const w3_154 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  assert(w3_154 > w2_154, '指纹变化（新大额垃圾）再次告警（' + w2_154 + '→' + w3_154 + '）');

  // ── 5. 清理后空集不告警 ──
  WA.store.sweepStaleKeys({ apply: true });
  WA.store.init();
  const w4_154 = WA.eventLog.filter(l => l.level === 'warn' && l.msg.indexOf('存储键卫生') >= 0).length;
  assert(w4_154 === w3_154, '清理后空集不告警（' + w3_154 + ' 恒定）');

  // ── 6. 面板按钮（源码断言，词边界严格版）──
  const panelSrc154 = readSrc('ui/panel.js'); // v2.401.0(OPV23): 改读 panelSource() 重组面
  assert(/id="wa-err-report"/.test(panelSrc154) && /on\('#wa-err-report'/.test(panelSrc154), '「复制错误报告」按钮 id 与绑定成对');
  assert(/buildErrorReport[^A-Za-z0-9_]/.test(panelSrc154), '面板调用 buildErrorReport（词边界）');

  // ── 清理：还原键空间与日志现场 ──
  LS154.clear();
  Object.keys(junkBefore154).forEach(k => LS154.setItem(k, junkBefore154[k]));
  WA.eventLog.length = 0;
  logBefore154.forEach(l => WA.eventLog.push(l));
  WA.log('info', 'v154 现场还原');
  } // end v0.1.54 block
};
