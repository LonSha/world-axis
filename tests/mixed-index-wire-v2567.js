#!/usr/bin/env node
/**
 * v2.567.0 专锁：常驻混合索引（mixedIndex）接进注入主链
 *
 * ── 治什么病 ─────────────────────────────────────────────────────────────
 *  engines/mixed-index.js 自 v2.529.0 入库起**全仓零读**：它只有 `build(entries, opts)`，
 *  条目要由调用方喂，而「谁喂」这一层从来没写 —— 于是零读是必然，不是设计。
 *  病在两端，且两端都静默：
 *    · 开关点了没反应：只加分支不加源表（或反之）⇒ 勾了不注入 / 没勾也注入；
 *    · 没开也凭空多出约束：常驻文本每轮都在，默认值取 true 会让从没开过这个设置面的
 *      老用户多出一段长期约束，而他们看不到它是哪来的（worldAutobiography 同一笔学费）。
 *
 * ── 判据纪律 ─────────────────────────────────────────────────────────────
 *  A 面：buildBlock 三态返空（无 worldbook / 抛错 / 空表 / 全是非常驻项）—— 不产空块白吃 token；
 *  B 面：真数据驱动 —— 常驻项才进索引、简报 40 字夹断、结构化块剥净、段落按 SEC_ORDER；
 *  C 面：四处登记静态对账（SOURCES / def 默认 false / SRC_NAME / 分支 + panel VIS_NAMES）；
 *  D 面：负控 —— 同一函数换数据必须翻面（常驻→非常驻 立刻返空），否则「永远返空」也能过；
 *  E 面：不写盘（peekEntries 返回值调用前后逐字相等）、同输入同输出、原 build() 契约不回退。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const BASE = path.join(__dirname, '..');

function readOf(rel) { return fs.readFileSync(path.join(BASE, rel), 'utf8'); }

function runAll(assertFn) {
  require(path.join(BASE, 'tests/mock.js'));
  const gate = require(path.join(BASE, 'tests/ui-gate-sync.js'));
  const env = gate.fresh({});
  const WA = env.WA;
  WA.store.init();
  require(path.join(BASE, 'engines/mixed-index.js'));

  let pass = 0, fail = 0;
  const fails = [];
  const a = function (ok, name) {
    if (ok) { pass++; } else { fail++; fails.push(name); }
    if (typeof assertFn === 'function') assertFn(ok, name);
  };
  const MI = WA.mixedIndex;
  const savedWb = WA.worldbook;

  // ── A 面：三态返空（都不许产空块） ──
  delete WA.worldbook;
  a(MI.buildBlock() === '', 'A1 无 worldbook 模块 ⇒ 空串（不产空索引占位）');

  WA.worldbook = { peekEntries: function () { throw new Error('read exploded'); } };
  a(MI.buildBlock() === '', 'A2 peekEntries 抛错 ⇒ 空串（索引是增益面，不打断注入）');

  WA.worldbook = { peekEntries: function () { return []; } };
  a(MI.buildBlock() === '', 'A3 空条目表 ⇒ 空串');

  WA.worldbook = {
    peekEntries: function () {
      return [{ comment: '北门集市', content: '人很多。', constant: false, selective: true }];
    }
  };
  a(MI.buildBlock() === '', 'A4 全是非常驻项 ⇒ 空串（非常驻走按需激活，不占常驻位）');

  WA.worldbook = { peekEntries: function () { return [{ constant: true }]; } };
  a(MI.buildBlock() === '', 'A5 常驻但无名（title/comment/key 全空）⇒ 空串（不产「（）」空壳）');

  // ── B 面：真数据（常驻才进、简报夹断、结构化块剥净、段落有序） ──
  const longContent = '盐引专卖自前朝起就是官府的命脉，凡持引者可在指定盐场支盐，私盐查缉归巡检司，' +
    '这条规矩在边镇尤其紧，因为盐价一涨军心就散。';
  WA.worldbook = {
    peekEntries: function () {
      return [
        { comment: '盐引', content: longContent, constant: true, section: '道具' },
        { comment: '巡检司', content: '掌私盐查缉与夜禁巡更。', constant: true, section: '角色' },
        { comment: '边镇风声', content: '<ws_note>这是结构化块</ws_note>粮价又涨了三成。', constant: true, section: '地点' },
        { comment: '不该出现的条目', content: '非常驻。', constant: false, selective: true }
      ];
    }
  };
  const block = MI.buildBlock();
  a(typeof block === 'string' && block.length > 0, 'B1 真常驻条目 ⇒ 产块（非空）');
  a(block.indexOf('盐引') >= 0 && block.indexOf('巡检司') >= 0, 'B2 常驻项名字进索引');
  a(block.indexOf('不该出现的条目') < 0, 'B3 非常驻项**不进**索引（这是本源的边界）');
  a(/盐引[^、]*（[^）]*…）/.test(block), 'B4 简报按 40 字夹断，末尾加省略号（不是整段照抄）');
  // B5 口径修正（本轮实测踩到）：brief() 剥的是**标签**（<[^>]{0,200}>），标签**里的正文要留**——
  //   「<ws_note>这是结构化块</ws_note>粮价又涨了三成」剥后是「这是结构化块粮价又涨了三成」。
  //   所以本条咬的是「标签不许漏进模型面」，不是「标签内文字要删掉」（后者会把真内容一起吃掉）。
  a(block.indexOf('<ws_') < 0, 'B5 简报剥净结构化标签（不给模型看 <ws_*>，但标签内正文保留）');
  a(block.indexOf('粮价又涨了三成') >= 0, 'B6 剥标签后正文保留（不是整条丢掉）');
  const iRole = block.indexOf('【角色】'); const iItem = block.indexOf('【道具】'); const iPlace = block.indexOf('【地点】');
  a(iRole >= 0 && iItem > iRole && iPlace > iItem, 'B7 段落按 SEC_ORDER 排（角色→道具→地点）');

  // ── C 面：四处登记静态对账 ──
  const inj = readOf('render/inject.js');
  const panel = readOf('ui/panel.js');
  a(/const SOURCES = \[[\s\S]*?'mixedIndex'\]/.test(inj), 'C1 源表 SOURCES 末项含 mixedIndex');
  a(/narrowConsumers: true, mixedIndex: false \}/.test(inj), 'C2 def 默认 **false**（常驻文本不给老用户凭空多约束）');
  a(/mixedIndex: '常驻索引'/.test(inj), 'C3 SRC_NAME 显示名逐字登记');
  a(/if \(vis\.mixedIndex && WA\.mixedIndex\) \{/.test(inj), 'C4 注入分支受可见性开关守卫（不是只判模块在不在）');
  a(/WA\.mixedIndex\.buildBlock\(\)/.test(inj), 'C5 分支真调 buildBlock（真消费点，不是注释自述）');
  a(/mixedIndex: '常驻索引',/.test(panel), 'C6 面板 VIS_NAMES 有显示名（开关不裸露英文键）');
  a(readOf('index.js').indexOf("'engines/mixed-index.js'") >= 0, 'C7 LOAD_ORDER 装载位在（引擎真被装上）');

  // ── D 面：负控（同一函数换数据必须翻面） ──
  WA.worldbook = {
    peekEntries: function () {
      return [{ comment: '盐引', content: longContent, constant: false, selective: true }];
    }
  };
  a(MI.buildBlock() === '', 'D1 负控：把常驻改成非常驻 ⇒ 立刻返空（不是永远返空，也不是永远产块）');
  a(MI.isResident({ constant: true }) === true && MI.isResident({ selective: false }) === true
    && MI.isResident({}) === false, 'D2 isResident 三态判据不变（constant / selective===false / 其余）');
  a(MI.brief('', 40) === '', 'D3 brief 空内容 ⇒ 空串（不产空括号）');

  // ── E 面：只读 / 确定性 / 原契约不回退 ──
  const snapshot = [
    { comment: '盐引', content: longContent, constant: true, section: '道具' },
    { comment: '巡检司', content: '掌私盐查缉与夜禁巡更。', constant: true, section: '角色' }
  ];
  const before = JSON.stringify(snapshot);
  WA.worldbook = { peekEntries: function () { return snapshot; } };
  const b1 = MI.buildBlock();
  const b2 = MI.buildBlock();
  a(JSON.stringify(snapshot) === before, 'E1 buildBlock 只读：peekEntries 返回值逐字未变（不改条目、不写盘）');
  a(b1 === b2 && b1.length > 0, 'E2 同输入同输出（确定性，无时钟/随机参与）');
  const r = MI.build(snapshot, {});
  a(typeof r.text === 'string' && Array.isArray(r.sections) && typeof r.residentEntries === 'number'
    && typeof r.names === 'number' && typeof r.skipped === 'number', 'E3 原 build() 契约字段齐全（不回退）');
  a(r.names === 2 && r.skipped === 0, 'E4 build() 计数如实（names 2 / skipped 0）');

  if (savedWb === undefined) delete WA.worldbook; else WA.worldbook = savedWb;
  return { pass, fail, fails };
}

if (require.main === module) {
  const r = runAll(null);
  if (r.fail === 0) { console.log('通过 ' + r.pass + ' / 失败 0'); process.exit(0); }
  console.error('通过 ' + r.pass + ' / 失败 ' + r.fail);
  r.fails.forEach(function (f) { console.error('  ✗ ' + f); });
  process.exit(1);
}
module.exports = { runAll: runAll };