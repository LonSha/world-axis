#!/usr/bin/env node
// WorldAxis tests/rel-contract-v2590.js —— 推演输出契约 ⇄ 引擎字段表 双向锁（v2.59.0）
//
// 【它治的病】关系量值有七个字段，其中两个**只在引擎侧存在**：
//   · `actors/registry.js` 的 `REL_NUM_FIELDS` 收 `attachment`、`REL_STR_FIELDS` 收
//     `relationship_aftereffect`；`engines/backstage.js` 的入账点也确实接这两个键；
//   · `engines/rules.js` 的 `<relation>` 明文两条纪律都建立在它们之上——
//     「[字段分离] 亲密度≠信任度≠敌对度≠警戒度≠**依恋**」
//     「[修复] 受损关系可以修复……是否留下长期**后遗症**由事件严重度、五骰与后续行为共同决定」；
//   · 唯独**输出契约**（backstage.buildPrompt 的 `"relation_update"` 那行）从没要求模型给它们。
//   后果：模型按契约必然不给 ⇒ 两轴恒 `undefined`，**由构造即死**；而引擎侧一切正常、
//   静态锁全绿——没有任何一条既有判据会因此变红。属「声明面承认、契约面缺席」，
//   与 v2.37.0 抓到的「实体清单只进不出」（buildEntitiesBlock 从不进提示词）同型。
//
// 【为什么不写成两份字段清单的对比】那样锁在「新增字段」时仍然不知道——
//   与本锁要治的病同型（对照 v2.58.0 的方法名由探测得出、v2.42.0 的 UI 文件面动态发现）。
//   故本锁的字段集**从引擎自己的声明口读出**（`const REL_NUM_FIELDS/REL_STR_FIELDS = [...]`），
//   契约侧**从真实提示词读**（buildPrompt 的产物，不是源码字面量）。
//   读不到即抛「判据失效」——绝不在空集合上恒真。
//
// 【判据】
//   A  引擎承认的每个关系字段，都必须出现在真实提示词的 relation_update 契约行里。
//   A2 两向耦合：A 要求的每个字段还必须**行为上真能落地**（喂进 applyResult → flush →
//      getRelation 读得到）。否则 A 会变成「要求模型给一个引擎根本不收的字段」。
//   B  反向：契约行里声明的字段都必须是引擎收得下的（含 name/target 两个行键）——防幻影字段。
//   C  覆盖度前提：引擎字段表必须 ≥7 项，否则判据在子集上恒真。
//   D  真实提示词里 relation_update 行必须**逐字**含关键片段（防有人把行删了但留个空壳）。
//
// 【负控制】破坏一律是「真源码破坏 → 装载破坏副本 → 在副本上重跑**同款**判据」：
//   N1 判据纯度：把修复前的契约行原文（历史缺陷形态，逐字）喂给同款判据，必须报出
//      恰好缺 attachment + relationship_aftereffect 两项 —— 证明判据对这两个字段真敏感。
//   N2 同一判据在当前契约行上必须通过（两向自证，不是把判据写死成常量）。
//   N3 逐字段敏感：从当前行删掉 intimacy，判据必须现形（不是只盯着新增的两项）。
//   N4 空行不得通过（判据非恒真）。
//   N5 端到端破坏：把 registry 声明删掉 attachment 后，A 必须跟着变红
//      （证明锁挂在引擎声明口上，而不是挂在写死的清单上）。
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

/** 从引擎源码读出它**自己声明**的字段表（不复制副本；读不到即判据失效） */
function engineRelFieldsFrom(src) {
  const grab = function (name) {
    const re = new RegExp('const ' + name + '\\s*=\\s*\\[([^\\]]*)\\]');
    const m = src.match(re);
    if (!m) throw new Error('判据失效：读不到 ' + name + '（引擎声明口被改名/挪走？）');
    return m[1].split(',').map(function (s) { return s.trim().replace(/^['"]|['"]$/g, ''); }).filter(Boolean);
  };
  const num = grab('REL_NUM_FIELDS');
  const str = grab('REL_STR_FIELDS');
  return { num: num, str: str, all: num.concat(str) };
}
function engineRelFields() {
  return engineRelFieldsFrom(fs.readFileSync(path.join(BASE, 'actors/registry.js'), 'utf8'));
}

/** 从真实提示词（buildPrompt 的产物）里抽出 relation_update 契约行 */
function contractLineOf(WA) {
  const msgs = WA.backstage.buildPrompt({ idx: 1 }, '');
  const sys = (((msgs || [])[0] || {}).content) || '';
  const line = sys.split('\n').filter(function (l) { return l.indexOf('"relation_update"') >= 0; })[0] || '';
  return { sys: sys, line: line };
}

/** 契约行里声明的字段名（只认 JSON 键形态，注释文本里提到不算） */
function declaredFields(line) {
  return (line.match(/"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:/g) || [])
    .map(function (s) { return s.replace(/["\s:]/g, ''); })
    .filter(function (f) { return f !== 'relation_update'; });
}

/** 单一判据（纯函数，供正向与负控制共用）：给定契约行，返回引擎字段里缺席的那些 */
function missingInContract(line, fields) {
  return fields.filter(function (f) { return line.indexOf('"' + f + '"') < 0; });
}

/** A2：把字段喂进真实入账链，看它是否真能落地到 getRelation */
function landsInStore(WA, fields) {
  const out = {};
  WA.registry.register('__rc_probe');
  fields.forEach(function (f, i) {
    const target = '__rc_t' + i;
    const row = { name: '__rc_probe', target: target };
    row[f] = (f === 'boundary_status' || f === 'relationship_aftereffect') ? '__rc_str' : 30;
    WA.store.transact(function (d) { WA.backstage.applyResult(d, { relation_update: [row] }, { idx: 1 }); });
    WA.backstage.flushPersonaChannels();          // applyResult 只入队；落库在事务之后的这个口
    const gv = WA.registry.getRelation('__rc_probe', target);
    out[f] = gv && gv[f] !== undefined;
  });
  return out;
}

function runAll(a) {
  const gate = require('./ui-gate-sync.js');
  const env = gate.fresh();
  const WA = env.WA;
  const eng = engineRelFields();
  const c = contractLineOf(WA);

  // C 面（先判覆盖度，防在空集合上恒真）
  a(eng.all.length >= 7, 'v2590: [C] 引擎关系字段表覆盖 ' + eng.all.length + ' 项（≥7，判据不在子集上恒真）');
  a(c.line.length > 0, 'v2590: [D] 真实提示词里有 relation_update 契约行（行非空）');
  a(c.sys.indexOf('【输出契约】') >= 0, 'v2590: [D] 提示词确为推演输出契约块（buildPrompt 产物）');

  // A 面：契约 ⊇ 引擎
  const miss = missingInContract(c.line, eng.all);
  a(miss.length === 0, 'v2590: [A] 引擎承认的关系字段都写进了输出契约（缺: ' + (miss.join(',') || '无') + '）');

  // A2 面：A 要求的字段必须行为上真能落地（否则是让模型白给）
  const land = landsInStore(WA, eng.all);
  const notLanding = eng.all.filter(function (f) { return !land[f]; });
  a(notLanding.length === 0, 'v2590: [A2] 契约要求的字段引擎确实收得下（收不下: ' + (notLanding.join(',') || '无') + '）');

  // B 面：契约 ⊆ 引擎（含两个行键）——防幻影字段
  const decl = declaredFields(c.line);
  const allowed = eng.all.concat(['name', 'target']);
  const phantom = decl.filter(function (f) { return allowed.indexOf(f) < 0; });
  a(phantom.length === 0, 'v2590: [B] 契约行声明的字段都是引擎收得下的（幻影: ' + (phantom.join(',') || '无') + '）');
  a(decl.indexOf('name') >= 0 && decl.indexOf('target') >= 0, 'v2590: [B] 契约行保留了 name/target 两个行键');

  // 耦合守卫：契约块所在的函数必须仍是 _runInference 实际调用的那个（防「判了没人用」）
  const bs = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
  a(bs.indexOf('const messages = this.buildPrompt(') >= 0, 'v2590: [D] _runInference 仍走 buildPrompt（契约块与推演同源）');
}

function runNegative(a) {
  const gate = require('./ui-gate-sync.js');

  // 修复前的契约行片段（v2.59.0 之前的**真实**形态，逐字）
  const OLD_SPEC = '"vigilance":0-100,"boundary_status":"..."';
  const NEW_SPEC = '"vigilance":0-100,"attachment":0-100,"boundary_status":"...","relationship_aftereffect":"..."';
  const bs = fs.readFileSync(path.join(BASE, 'engines/backstage.js'), 'utf8');
  const nAnchor = bs.split(NEW_SPEC).length - 1;
  a(nAnchor === 1, 'v2590: [N1] 破坏锚点在真源码中恰中 1 次（实 ' + nAnchor + ' 次）');

  const env = gate.fresh();
  const eng = engineRelFields();
  const good = contractLineOf(env.WA).line;

  // N1 判据纯度：历史缺陷形态喂进同款判据 —— 必须报出恰好这两项
  const oldLine = good.replace(NEW_SPEC, OLD_SPEC);
  const missOld = missingInContract(oldLine, eng.all);
  a(missOld.length === 2 && missOld.indexOf('attachment') >= 0 && missOld.indexOf('relationship_aftereffect') >= 0,
    'v2590: [N1] 修复前的契约行在同款判据下现形（缺 ' + missOld.join(',') + '）');

  // N2 两向自证：当前契约行必须通过同一判据
  a(missingInContract(good, eng.all).length === 0, 'v2590: [N2] 当前契约行在同款判据下通过');

  // N3 逐字段敏感
  const noIntimacy = good.replace('"intimacy":0-100,', '');
  a(missingInContract(noIntimacy, eng.all).indexOf('intimacy') >= 0, 'v2590: [N3] 删掉 intimacy 时判据现形（逐字段敏感）');

  // N4 非恒真
  a(missingInContract('', eng.all).length === eng.all.length, 'v2590: [N4] 空行不通过（判据非恒真）');

  // N5 端到端破坏：往**引擎声明口**追加一个新字段，A 必须跟着变红
  //   （证明锁挂在引擎声明上，而不是挂在写死清单上——写死清单就是「新增字段时锁不知道」，
  //    与本锁要治的病同型）。这里破坏的是声明本身，故用「追加」而非「删除」：
  //    删除只会让判据无事可报（字段不再被要求），追加才能看出判据对声明真敏感。
  const regSrc = fs.readFileSync(path.join(BASE, 'actors/registry.js'), 'utf8');
  const brokenReg = regSrc.replace("'attachment'", "'attachment', '__rc_newaxis'");
  a(brokenReg !== regSrc, 'v2590: [N5] 引擎声明口破坏确实发生');
  const engBroken = engineRelFieldsFrom(brokenReg);
  a(engBroken.num.indexOf('__rc_newaxis') >= 0, 'v2590: [N5] 破坏副本的字段表确已含新声明的 __rc_newaxis');
  const missBroken = missingInContract(good, engBroken.all);
  a(missBroken.indexOf('__rc_newaxis') >= 0,
    'v2590: [N5] 引擎声明新增字段时 A 会现形（锁挂在声明口，不在写死清单上）；实报 ' + missBroken.join(','));
}

if (require.main === module) {
  let pass = 0, fail = 0;
  const a = function (cond, name) {
    if (cond) { pass++; }
    else { fail++; console.log('  ✗ ' + name); }
  };
  try {
    runAll(a);
    runNegative(a);
  } catch (e) {
    fail++; console.log('  ✗ 判据失效：' + (e && e.message));
  }
  if (fail) { console.log('REL-CONTRACT-V2590: FAIL ' + fail + ' / ' + (pass + fail)); process.exit(1); }
  console.log('REL-CONTRACT-V2590: pass（' + pass + ' 项）');
}

module.exports = { runAll: runAll, runNegative: runNegative, engineRelFields: engineRelFields,
  engineRelFieldsFrom: engineRelFieldsFrom, contractLineOf: contractLineOf,
  declaredFields: declaredFields, missingInContract: missingInContract, landsInStore: landsInStore };