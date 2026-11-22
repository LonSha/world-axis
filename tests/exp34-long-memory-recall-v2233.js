/**
 * WorldAxis tests/exp34-long-memory-recall-v2233.js (v2.233.0)
 * OPV4-7｜长局记忆整理与按需回忆 专有契约与功能测试
 *
 * 核心验证：
 * 1. 契约自洽：retrieval candidates 支持 promises 承诺与 pmem 主观认知召回；
 * 2. 真实场景相关：相关旧承诺（customLax.promises）可按需召回、无关历史不挤占上下文；
 * 3. 严格区分主观与客观：memory.facts（客观事实）与 memory.pmem（主观认知）在候选与结构中明确区分 memoryKind；
 * 4. 更正与版本保留：全版本链回溯，被更正旧值与当前值共存，当前值不抹杀历史；
 * 5. 纯读零写入：10 次连续调用 actionDesk.plan / retrieval.candidates 对全局 store 与 localStorage 零改写；
 * 6. 真源码变异负控制：破坏承诺检索逻辑，断言召回失败，原版与破坏版双向自证。
 */

const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');
require(path.join(BASE, 'tests/mock.js'));

let pass = 0, fail = 0;
function a(cond, desc) {
  if (cond) {
    pass++;
  } else {
    fail++;
    console.error('FAIL: ' + desc);
  }
}

function runAll() {
  console.log('\n=== exp34-long-memory-recall-v2233: OPV4-7 长局记忆整理与按需回忆 ===');
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const W = env.WA;

  // 1. 初始状态与设置
  W.retrieval.setSettings({ enabled: true, windowMs: 30 * 24 * 3600 * 1000 });
  W.actionDesk.setSettings({ enabled: true });

  // 2. 注入多模态数据：客观事实（含多版本更正）、主观记忆（pmem）、旧承诺（customLax promises）
  const t0 = Date.now() - 50 * 24 * 3600 * 1000; // 50 天前（超窗旧事）
  const t1 = Date.now() - 10 * 24 * 3600 * 1000; // 10 天前（窗内事实）

  W.store.transact(function (d) {
    d.memory = d.memory || {};
    d.memory.facts = d.memory.facts || [];
    // 客观事实全版本链：旧版本更正
    d.memory.facts.push({ key: '粮仓储备', value: '五百石', version: 1, active: false, reason: '更正：遭鼠患损耗', at: t0 });
    d.memory.facts.push({ key: '粮仓储备', value: '三百石', version: 2, active: true, reason: '盘点确认', at: t1 });

    // 主观记忆：角色个人认知
    d.memory.pmem = d.memory.pmem || [];
    d.memory.pmem.push({
      id: 'pmem_audit_01',
      holders: ['李管事'],
      text: '李管事私下怀疑赵账房在粮仓账目上做了手脚',
      time: t1
    });

    // 地方规约与民间承诺：旧承诺（履行中、已违约、已补救）
    d.customLax = d.customLax || {};
    d.customLax.promises = d.customLax.promises || [];
    d.customLax.promises.push({
      id: 'p_grain_loan',
      promiser: '赵账房',
      beneficiary: '李管事',
      subject: '秋收后借粮一百石周转',
      status: 'defaulted',
      defaultReason: '旱灾无收，无力按期偿还',
      createdAt: t0
    });
    d.customLax.promises.push({
      id: 'p_tool_return',
      promiser: '铁匠',
      beneficiary: '木匠',
      subject: '借用墨斗与刨子三日后归还',
      status: 'fulfilled',
      createdAt: t1
    });
  }, 'exp34:seed');

  // 3. 验收 1：无关输入不召回旧承诺（避免挤占长局上下文）
  const cUnrelated = W.retrieval.candidates({ text: '今天天气晴朗万里无云' });
  a(cUnrelated.ok === true, '无关查询正常返回');
  a(!cUnrelated.rows.some(r => r.key === 'promise:p_grain_loan'), '无关输入绝不召回借粮旧承诺，防止挤占长局上下文');

  // 4. 验收 2：输入无回忆词且超窗时不挤占，含回忆词（按需回忆）时精准越窗召回旧承诺
  const cPlain = W.retrieval.candidates({ text: '今日查账赵账房借粮情况' });
  a(!cPlain.rows.some(r => r.key === 'promise:p_grain_loan'), '无回忆词且超窗的旧承诺不挤占日常上下文');

  const cPromiseRecall = W.retrieval.candidates({ text: '当初赵账房借粮的缘由是什么' });
  a(cPromiseRecall.ok === true, '带回忆词查询候选返回成功');
  const promiseRow = cPromiseRecall.rows.find(r => r.key === 'promise:p_grain_loan');
  a(!!promiseRow, '借粮旧承诺成功被按需召回');
  a(promiseRow.memoryKind === 'promise', '召回条目标注明确类别 memoryKind: promise');
  a(promiseRow.recalled === true, '超窗旧承诺标明 recalled: true');
  a(promiseRow.text.indexOf('违约原因：旱灾无收') >= 0, '违约承诺包含具体原因细节');

  // 窗内承诺在正常相关时也能够召回
  const cToolRecall = W.retrieval.candidates({ text: '铁匠借用工具归还了没' });
  const toolRow = cToolRecall.rows.find(r => r.key === 'promise:p_tool_return');
  a(!!toolRow && toolRow.text.indexOf('fulfilled') >= 0, '窗内履行承诺正常相关时顺利召回');

  // 5. 验收 3：严格区分客观事实与主观记忆（pmem）
  const cPmemRecall = W.retrieval.candidates({ text: '李管事对粮仓账目有什么看法' });
  a(cPmemRecall.ok === true, '主观记忆查询返回成功');
  const pmemRow = cPmemRecall.rows.find(r => r.key.startsWith('pmem:'));
  a(!!pmemRow, '主观认知成功被召回');
  a(pmemRow.memoryKind === 'subjective', '主观记忆标明 memoryKind: subjective');
  a(pmemRow.text.indexOf('【李管事的主观记忆】') >= 0, '主观认知文本包含明确视角归属标记，杜绝与客观事实混淆');

  // 6. 验收 4：更正保留版本，当前值不抹杀历史
  const cFactRecall = W.retrieval.candidates({ text: '粮仓储备到底是多少' });
  const factRow = cFactRecall.rows.find(r => r.key === 'fact:粮仓储备');
  a(!!factRow, '客观事实成功召回');
  a(factRow.reverted === true, '更正版本链标识 reverted 为 true');
  a(factRow.oldValues && factRow.oldValues.length === 1 && factRow.oldValues[0].value === '五百石', '旧版本数据完整保留在 oldValues 中');

  // 7. 验收 5：actionDesk 记忆整理路由（retrieval.tidyMemory 与 retrieval.recall）与行动桌联动
  const deskRecall = W.actionDesk.plan('retrieval.recall', { text: '当初赵账房借粮' });
  a(deskRecall.ok === true && deskRecall.rows.some(r => r.key === 'promise:p_grain_loan'), 'actionDesk.plan 支持 retrieval.recall 统一调度');

  const tidyRes = W.actionDesk.plan('retrieval.tidyMemory', {});
  a(tidyRes.ok === true, 'actionDesk.plan 支持 retrieval.tidyMemory 记忆盘点整理');
  a(tidyRes.stats.objectiveFacts >= 2, '统计报出客观事实数量');
  a(tidyRes.stats.subjectivePmems >= 1, '统计报出主观认知条数');
  a(tidyRes.stats.customPromises >= 2, '统计报出民间承诺总数');
  a(tidyRes.promisesSummary.some(p => p.id === 'p_grain_loan' && p.status === 'defaulted'), '承诺摘要如实包含违约承诺');

  // 8. 验收 6：纯读零写入（10 次连续调用对 store 与 localStorage 逐字节无改写）
  const snapBefore = JSON.stringify(W.store.get());
  const lsBefore = JSON.stringify(global.localStorage || {});
  for (let i = 0; i < 10; i++) {
    W.retrieval.candidates({ text: '当初赵账房借粮李管事粮仓' });
    W.actionDesk.plan('retrieval.recall', { text: '当初赵账房借粮' });
    W.actionDesk.plan('retrieval.tidyMemory', {});
  }
  const snapAfter = JSON.stringify(W.store.get());
  const lsAfter = JSON.stringify(global.localStorage || {});
  a(snapBefore === snapAfter, '10 次回忆与整理调用后 store 逐字节未变（绝对纯读）');
  a(lsBefore === lsAfter, '10 次回忆与整理调用后 localStorage 逐字节未变');

  // 9. 验收 7：负控制（Negative Control）——真源码变异，破坏承诺提取
  (function () {
    const rawCode = fs.readFileSync(path.join(BASE, 'engines/retrieval.js'), 'utf8');
    const targetAnchor = "push({ key: 'promise:' + (txt(p.id) || pSub), trigger: 'mentioned',";
    a(rawCode.indexOf(targetAnchor) >= 0, '负控制破坏锚点在 engines/retrieval.js 源码中精准存在');

    // 变异破坏：跳过 push
    const mutatedCode = rawCode.replace(targetAnchor, "/* mutated: skip promise push */ if (false) push({ key: 'promise:' + (txt(p.id) || pSub), trigger: 'mentioned',");
    a(mutatedCode !== rawCode, '负控制真源码变异成功产生副本');

    // 在隔离环境下加载变异源码
    const negEnv = gate.fresh({ srcOverride: { 'engines/retrieval.js': mutatedCode } });
    const negW = negEnv.WA;
    negW.retrieval.setSettings({ enabled: true });

    // 复制相同数据
    negW.store.transact(function (d) {
      d.customLax = d.customLax || {};
      d.customLax.promises = d.customLax.promises || [];
      d.customLax.promises.push({
        id: 'p_grain_loan',
        promiser: '赵账房',
        beneficiary: '李管事',
        subject: '秋收后借粮一百石周转',
        status: 'defaulted',
        createdAt: t0
      });
    }, 'neg:seed');

    const negRecall = negW.retrieval.candidates({ text: '当初赵账房借粮的缘由是什么' });
    const hasPromiseInMutated = negRecall.rows.some(r => r.key === 'promise:p_grain_loan');
    a(hasPromiseInMutated === false, '负控制验证：变异破坏版上承诺召回必定失效（两向自证成功）');
  })();

  console.log(`exp34-long-memory-recall-v2233 完成：通过 ${pass} / 失败 ${fail}`);
  if (fail > 0) throw new Error(`exp34-long-memory-recall-v2233 有 ${fail} 项失败`);
}

if (require.main === module) {
  runAll();
}

module.exports = { runAll };