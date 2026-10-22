'use strict';
// WorldAxis tests/exp16-tech-lineage-v2232.js (v2.231.0)
// IN-5 活的技术谱系专锁：文献与默会分立、师承代际接续、断代休眠与地方变体取舍。
const fs = require('fs');
const path = require('path');
const PR = 'engines/tech-lineage.js', BASE = path.join(__dirname, '..');

function env(ov) {
  require('./mock.js');
  if (global.localStorage) global.localStorage.clear();
  const W = require('./ui-gate-sync.js').fresh({ srcOverride: ov || {} }).WA;
  W.store.init();
  W.actionDesk.setSettings({ enabled: true });
  W.store.transact(function (d) {
    d.people = d.people || {};
    ['master_liu', 'apprentice_wang', 'scholar_sun'].forEach(function (name) {
      d.people['p_' + name] = { id: 'p_' + name, name: name };
    });
    return true;
  }, 'exp16:seed');
  return W;
}

async function runAll(a) {
  const W = env();
  a(!!W.techLineage, 'techLineage 存在于 WA');

  // 1. 声明技术谱系：纺织工艺，含手稿与两地变体
  const def = {
    name: '古代机织法',
    documents: ['doc_textile_scroll'],
    requiredSkill: 'weaving',
    requiredMinStage: 2,
    variants: {
      mountain_hemp: {
        name: '山地麻织',
        envRequirements: { mountainClimate: true, hempAvailable: true },
        cost: 1.2,
        durability: 1.8,
        efficiency: 0.8
      },
      water_silk: {
        name: '水乡丝织',
        envRequirements: { waterNetwork: true, silkAvailable: true },
        cost: 2.0,
        durability: 1.1,
        efficiency: 1.5
      }
    }
  };
  const decl = W.techLineage.declareTradition('tr_textile', def);
  a(decl.ok === true, '技术传统声明成功');

  // 注册老师傅
  W.techLineage.registerMaster('tr_textile', 'master_liu', 3);

  // 2. 只有手稿、从未受训的书生（scholar_sun）不能直接熟练生产
  const canScholar = W.techLineage.canProduce('tr_textile', 'scholar_sun', { hasDocument: true });
  a(canScholar.ok === true && canScholar.can === false, '手握手稿未受训者不得直接熟练生产');
  a(canScholar.reason === 'unskilled-reader', '原因为 unskilled-reader');

  // 3. 师傅传授学徒（apprentice_wang）
  const teach1 = W.techLineage.teach('tr_textile', 'master_liu', 'apprentice_wang');
  a(teach1.ok === true && teach1.newStage === 1 && !teach1.graduated, '学徒第一次训练达到 stage 1，未出师');
  const canApp1 = W.techLineage.canProduce('tr_textile', 'apprentice_wang');
  a(canApp1.can === false, '未达到 stage 2 仍不能独立生产');

  // 第二次教学 -> 出师
  const teach2 = W.techLineage.teach('tr_textile', 'master_liu', 'apprentice_wang');
  a(teach2.ok === true && teach2.newStage === 2 && teach2.graduated, '学徒第二次训练达到 stage 2，顺利出师');
  const canApp2 = W.techLineage.canProduce('tr_textile', 'apprentice_wang');
  a(canApp2.can === true, '出师后具备独立生产资格');

  // 4. 师傅离开（depart）后，受训出师学徒可独立续作
  const depRes = W.techLineage.departPractitioner('tr_textile', 'master_liu');
  a(depRes.ok === true && depRes.traditionStatus === 'active', '师傅离开后传统依然 active');
  const canAppPostDepart = W.techLineage.canProduce('tr_textile', 'apprentice_wang');
  a(canAppPostDepart.can === true, '学徒作为新 master 独立续作');

  // 5. 学徒也离开后，技术进入断代休眠（dormant），但文献依然存在
  W.techLineage.departPractitioner('tr_textile', 'apprentice_wang');
  const tradDormant = W.techLineage.getTradition('tr_textile');
  a(tradDormant.status === 'dormant', '无实践者时技术传统休眠（dormant）');
  a(tradDormant.documents.indexOf('doc_textile_scroll') >= 0, '文献手稿未被销毁');

  // 6. 两地材料条件下确认变体（各有取舍）
  const confMountain = W.techLineage.confirmVariant('tr_textile', 'mountain_hemp', { mountainClimate: true, hempAvailable: true });
  a(confMountain.ok === true, '山地麻织变体在符合环境时确认成功');
  a(confMountain.tradeOff.durability === 1.8, '山地变体具备高耐用度取舍');

  const confWaterFail = W.techLineage.confirmVariant('tr_textile', 'water_silk', { mountainClimate: true });
  a(confWaterFail.ok === false && confWaterFail.reason === 'unmet-env-conditions', '水网条件未满足时水乡变体确认被拒');

  // 7. 行动桌路由
  W.techLineage.registerMaster('tr_textile', 'master_liu', 3);
  const deskTeach = W.actionDesk.plan('lineage.teach', {
    traditionId: 'tr_textile',
    master: 'master_liu',
    apprentice: 'scholar_sun'
  });
  a(deskTeach.ok === true, '行动桌 lineage.teach 路由执行成功');
}

const mutations = [
  [
    'unskilled-reader-bypass',
    "if (hasDoc) {\n        return {\n          ok: true,\n          can: false,\n          reason: 'unskilled-reader',",
    "if (hasDoc) {\n        return {\n          ok: true,\n          can: true,\n          reason: 'unskilled-reader',",
    function (W) {
      W.techLineage.declareTradition('t_mut', { documents: ['d1'], requiredMinStage: 2 });
      const res = W.techLineage.canProduce('t_mut', 'nobody', { hasDocument: true });
      return res.can === false;
    }
  ],
  [
    'env-condition-bypass',
    'if (missing.length > 0) {',
    'if (false) {',
    function (W) {
      W.techLineage.declareTradition('t_mut2', {
        variants: { v1: { envRequirements: { water: true } } }
      });
      const res = W.techLineage.confirmVariant('t_mut2', 'v1', { water: false });
      return res.ok === false;
    }
  ]
];

async function runNegative(a) {
  for (const [name, anchor, replacement, criterion] of mutations) {
    const source = fs.readFileSync(path.join(BASE, PR), 'utf8');
    a(criterion(env()), name + ': 原版真判据通过');
    if (source.split(anchor).length < 2) throw new Error(name + ': nonunique mutation anchor');
    const ov = {}; ov[PR] = source.replace(anchor, replacement);
    a(!criterion(env(ov)), name + ': 变异后判据必捕获失败');
    a(fs.readFileSync(path.join(BASE, PR), 'utf8') === source, name + ': 源码文件保持未变');
  }
}

module.exports = { runAll, runNegative };

if (require.main === module) (async function () {
  let pass = 0, fail = 0;
  const a = (ok, name) => {
    if (ok) pass++;
    else { fail++; console.log('FAIL ' + name); }
  };
  try {
    await runAll(a);
    await runNegative(a);
  } catch (e) {
    fail++;
    console.log(e.stack);
  }
  console.log('EXP16-IN5: ' + pass + ' / 失败 ' + fail);
  process.exitCode = fail ? 1 : 0;
})();