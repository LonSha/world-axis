/**
 * WorldAxis tests/opv27-rest-lock.js (v2.524.0)
 * V27 优化线剩余六项专锁：OPV27-3 / 5 / 6 / 7 / 8 / 9
 *
 * 本锁钉六件事（每件都先立「现场读数」，再钉「不许编」）：
 *   OPV27-3 存档曲线：采样只读不写档 · 两点才谈增长 · 空/无审计时如实说不
 *   OPV27-5 窄消费：12 台分档（runtime / static / no-reader）· 静态词表不进正文
 *   OPV27-6 设置索引：363 组可搜可查 · 中文名缺失如实标 · 只读不写设置
 *   OPV27-7 拒收话术：五簇命中给动作句 · 未覆盖原样甩码不编 · 覆盖率不得 100%
 *   OPV27-8 老档体检：缺键清单带 path/impact · dry-run 不改入参 · loadStat 投影不漏
 *   OPV27-9 信息增量：逐源唯一/重复 · 查无此源不编理由 · measure 不改入参
 *
 * ── 真源码负控制（六条，各自把「编」的那一行拆掉） ──────────────────
 *   ① inject-delta：不登记 seen ⇒ 重复率永远 0（虚报「全是新信息」）
 *   ② reject-phrase：未命中簇也返回 ok ⇒ 943 条全「覆盖」
 *   ③ settings-index：offEffect 恒 false ⇒ enabled 组不再说明停用后果
 *   ④ save-curve：bytes 写死 0 ⇒ 曲线好看但与存档无关
 *   ⑤ narrow-consumers：静态词表判成 runtime ⇒ 星期表进正文
 *   ⑥ store：ensureShape 不 push 清单 ⇒ 「补了但列不出」
 */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('./mock.js');
const sync = require('./ui-gate-sync.js');

let passed = 0;
function ok(cond, label) { assert.ok(cond, label); passed += 1; console.log('  \u2713 ' + label); }
function eq(a, b, label) {
  assert.strictEqual(a, b, label + '（实 ' + a + ' / 期 ' + b + '）');
  passed += 1; console.log('  \u2713 ' + label);
}
function rd(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function must1(src, anchor) {
  const n = src.split(anchor).length - 1;
  assert.strictEqual(n, 1, '负控制锚点在真源码须恰 1 次：' + anchor.slice(0, 40) + '（实 ' + n + '）');
}

const { WA } = sync.fresh({});
const ledger = require('./reject-code-ledger.json');

// ══ OPV27-9 注入信息增量账 ═══════════════════════════════════════════
console.log('\n【OPV27-9】注入信息增量账');
{
  const id = WA.injectDelta;
  ok(!!id && typeof id.measure === 'function', 'injectDelta.measure 已导出');
  const items = [
    { source: '世界状态', content: '盐价涨了三成。市集闭坊。' },
    { source: '叙事摘要', content: '盐价涨了三成。夜里换了更夫。' }
  ];
  const snapshot = JSON.stringify(items);
  const r = id.measure(items);
  eq(r.totalSegs, 4, '两源共 4 段');
  eq(r.uniqueSegs, 3, '唯一 3 段（同一句「盐价涨了三成」算重复）');
  eq(r.dupSegs, 1, '重复 1 段');
  eq(JSON.stringify(items), snapshot, 'measure 不改入参（体检面不许污染被体检对象）');
  ok(r.worst && r.worst.dupWith.length > 0, '重复最重项带「与谁重复」');

  const ex = id.explain('叙事摘要');
  ok(ex.ok && ex.text.indexOf('世界状态') > 0, 'explain 说得出「与哪节重复」');
  const exNo = id.explain('根本不存在的源');
  eq(exNo.ok, false, '查无此源如实 ok:false');
  eq(exNo.reason, 'no-source', '查无此源 reason=no-source（不编被裁理由）');
  ok(exNo.text.indexOf('压根') < 0 && exNo.text.indexOf('没有') >= 0, '查无此源的文案是「没有它」而不是「它被裁了」');

  // 负控制①：不登记 seen ⇒ 重复率永远 0
  const src = rd('engines/inject-delta.js');
  const anchor = 'if (owner === undefined) { seen[n] = src; uniq++; }';
  must1(src, anchor);
  const broken = src.replace(anchor, 'if (owner === undefined) { uniq++; }');
  const b = sync.fresh({ srcOverride: { 'engines/inject-delta.js': broken } });
  const br = b.WA.injectDelta.measure(items);
  eq(br.dupSegs, 0, '负控制①：不登记 seen ⇒ 重复段数 0（虚报「全是新信息」现形）');
  eq(br.dupRate, 0, '负控制①：重复率虚报为 0%');
}

// ══ OPV27-7 拒收码话术 ═══════════════════════════════════════════════
console.log('\n【OPV27-7】拒收码五簇话术与覆盖率');
{
  const rp = WA.rejectPhrase;
  ok(!!rp && typeof rp.phraseOf === 'function', 'rejectPhrase.phraseOf 已导出');
  const hit = rp.phraseOf('unknown-owner');
  ok(hit.ok && hit.cluster === 'owner', 'unknown-owner 归到「归属/未知」簇');
  ok(hit.text.indexOf('先把它立起来') > 0, '命中簇给的是**动作句**（玩家下一步做什么）');

  const miss = rp.phraseOf('zzz-token');
  eq(miss.ok, false, '未覆盖码如实 ok:false');
  eq(miss.reason, 'no-phrase', '未覆盖码 reason=no-phrase');
  ok(miss.text.indexOf('zzz-token') > 0, '未覆盖时**原样带出码本身**（不编「操作失败请重试」）');

  const cov = rp.coverage(ledger.base);
  eq(cov.total, ledger.base.length, '覆盖率读数的分母 = 台账条数');
  ok(cov.covered > 0, '五簇确实覆盖到了一部分码（实 ' + cov.covered + '）');
  ok(cov.percent < 100, '覆盖率**不是** 100%（943 条里还有没归簇的，不硬凑）');
  const cov2 = rp.coverage(ledger.base);
  eq(cov2.covered, cov.covered, '同输入两次覆盖率逐字相同（读数可复跑）');
  // 十七簇逐簇给命中数。v2.584.0 前是十六簇（五簇 + already/unavailable/threw + failed/
  //   conflict/closed/off-target/switched-off/unconfigured/absent/unmet 八簇）；本轮新增 `attire`
  //   一簇（穿着状态的两个新码 cause-scope / downgrade-coverage），故 +1。簇表是判据，不是数字：
  //   这里只跟位数，簇的语义边界（为什么必须逐名登记、不按词根猜）见 engines/reject-phrase.js 原注释。
  ok(cov.byCluster && Object.keys(cov.byCluster).length === 17, '十七簇逐簇给出命中数（v2.584.0 三批：五簇 + 上述八簇 + attire 一簇）');

  // 负控制②：未命中簇也返回 ok ⇒ 943 条全「覆盖」
  const src = rd('engines/reject-phrase.js');
  const anchor = "memo[c] = hit ? { ok: true, cluster: hit.id, label: hit.label, phrase: hit.phrase } : { ok: false, reason: 'no-phrase' };";
  must1(src, anchor);
  const broken = src.replace(anchor,
    "memo[c] = hit ? { ok: true, cluster: hit.id, label: hit.label, phrase: hit.phrase } : { ok: true, cluster: 'other', label: '其它', phrase: '操作没成功，请重试' };");
  const b = sync.fresh({ srcOverride: { 'engines/reject-phrase.js': broken } });
  const bcov = b.WA.rejectPhrase.coverage(ledger.base);
  eq(bcov.percent, 100, '负控制②：未命中也算覆盖 ⇒ 覆盖率虚报 100%（判据现形）');
}

// ══ OPV27-6 设置面索引 ═══════════════════════════════════════════════
console.log('\n【OPV27-6】设置面中文索引 / 搜索 / 分组');
{
  const si = WA.settingsIndex;
  ok(!!si && typeof si.build === 'function', 'settingsIndex.build 已导出');
  const idx = si.build();
  ok(idx.total >= 300, '索引覆盖 ≥300 组设置（实 ' + idx.total + '）');
  ok(idx.named >= 1, '有中文名的组 ≥1（实 ' + idx.named + '）');
  eq(idx.named + idx.nameMissing, idx.total, '「有中文名 + 未登记」= 总数（不漏算）');

  const s1 = si.search('warrant');
  ok(s1.ok && s1.hitCount >= 1, '按引擎英文名能搜到（warrant）');
  const s2 = si.search('通缉');
  ok(s2.ok && s2.hitCount >= 1, '按中文名能搜到（通缉）');
  const s3 = si.search('绝对不存在的设置组名');
  eq(s3.hitCount, 0, '搜不存在的组返回 0 命中（不硬凑结果）');

  const e = si.entry('warrant');
  ok(e.ok && e.keys.some(function (k) { return k.key === 'enabled'; }), '单组问答给出 enabled 当前值');
  ok(typeof e.off === 'string' && e.off.indexOf('整块功能停用') >= 0, '「关掉会怎样」对 enabled 有确定答复');
  const eNo = si.entry('没这个组');
  eq(eNo.ok, false, '查无此组如实 ok:false');

  // 只读自证：索引前后 warrant 设置值不变
  const before = JSON.stringify(WA.settingsBus.read({ key: 'worldaxis_warrant_settings_v1' }) || null);
  si.build(); si.search('enabled'); si.entry('warrant');
  const after = JSON.stringify(WA.settingsBus.read({ key: 'worldaxis_warrant_settings_v1' }) || null);
  eq(after, before, '索引/搜索/问答全过程不写设置（只读自证）');

  // 负控制③：offEffect 恒 false ⇒ enabled 组不再说明停用后果
  const src = rd('engines/settings-index.js');
  const anchor = "const has = reg.def && Object.prototype.hasOwnProperty.call(reg.def, 'enabled');";
  must1(src, anchor);
  const b = sync.fresh({ srcOverride: { 'engines/settings-index.js': src.replace(anchor, 'const has = false;') } });
  const be = b.WA.settingsIndex.entry('warrant');
  ok(be.off.indexOf('整块功能停用') < 0, '负控制③：恒 false ⇒ 不再回答「整块功能停用」（判据现形）');
}

// ══ OPV27-3 存档体积曲线 ═════════════════════════════════════════════
console.log('\n【OPV27-3】存档体积四点曲线与容器增长');
{
  const sc = WA.saveCurve;
  ok(!!sc && typeof sc.sample === 'function', 'saveCurve.sample 已导出');
  sc.reset();
  const beforeBytes = (WA.store.saveStat() || {}).bytes || 0;
  const p0 = sc.sample('空局', { rounds: 0 });
  ok(p0.ok, '空局采样成功');
  eq(p0.row.rounds, 0, '轮数由调用方给（不猜）');
  eq((WA.store.saveStat() || {}).bytes || 0, beforeBytes, '采样本身不写存档（采样前后落盘字节相同）');
  ok(Array.isArray(p0.row.top), '采样带容器 TOP 清单');

  const g1 = sc.growth();
  eq(g1.ok, false, '只有一个点时不谈增长（ok:false）');
  eq(g1.reason, 'too-few-samples', '单点原因如实为 too-few-samples');

  // 造第二个点：走产品同一写口 archiveScheduled（真实纪事归档）
  for (let i = 1; i <= 5; i++) {
    WA.store.transact(function (d) { WA.backstage.archiveScheduled(d, '巡查第' + i + '次', 'ev' + i, 'op' + i); });
  }
  const p1 = sc.sample('第5轮', { rounds: 5 });
  ok(p1.ok, '第二点采样成功');
  const g2 = sc.growth();
  ok(g2.ok, '两点后增长可算');
  ok(g2.rows.some(function (r) { return r.path === 'chronicle' && r.delta > 0; }), 'chronicle 增长被点名（归档 5 条）');

  // 真裁剪自证：archiveScheduled 不再写恒空的 summary/refs
  const last = (WA.store.read('chronicle') || []).slice(-1)[0] || {};
  ok(!Object.prototype.hasOwnProperty.call(last, 'summary'), 'OPV27-3 真裁剪：归档纪事不再存恒空 summary');
  ok(!Object.prototype.hasOwnProperty.call(last, 'refs'), 'OPV27-3 真裁剪：归档纪事不再存恒空 refs');
  ok(typeof last.title === 'string' && last.title, '裁剪后必需字段仍在（title）');

  // 负控制④：bytes 写死 0 ⇒ 曲线好看但与存档无关
  const src = rd('engines/save-curve.js');
  const anchor = "bytes: (typeof st.bytes === 'number') ? st.bytes : 0,";
  must1(src, anchor);
  const b = sync.fresh({ srcOverride: { 'engines/save-curve.js': src.replace(anchor, 'bytes: 0,') } });
  b.WA.saveCurve.reset();
  for (let i = 1; i <= 5; i++) {
    b.WA.store.transact(function (d) { b.WA.backstage.archiveScheduled(d, '巡查' + i, 'ev' + i, 'op' + i); });
  }
  const bp = b.WA.saveCurve.sample('第5轮', { rounds: 5 });
  eq(bp.row.bytes, 0, '负控制④：bytes 写死 ⇒ 有 5 条纪事却报 0B（读数变假现形）');
}

// ══ OPV27-5 窄消费引擎分档 ═══════════════════════════════════════════
console.log('\n【OPV27-5】窄消费引擎 12 台分档与正文收敛');
{
  const nc = WA.narrowConsumers;
  ok(!!nc && typeof nc.board === 'function', 'narrowConsumers.board 已导出');
  eq(nc.registry().length, 12, '登记 12 台（不多不少）');
  const bd = nc.board();
  eq(bd.total, 12, '总览覆盖 12 台');
  ok(bd.rows.every(function (r) { return typeof r.kind === 'string'; }), '每台都给档位（runtime / static / no-reader 之一）');
  ok(Object.keys(bd.byKind).length >= 3, '档位分布按三类分开报（实 ' + JSON.stringify(bd.byKind) + '）');
  ok(bd.byKind.static >= 1, '实测有「只有静态词表」的台（实 ' + bd.byKind.static + '）');

  const block = nc.buildBlock();
  ok(typeof block === 'string', 'buildBlock 返回字符串');
  ok(block.indexOf('静态词表') < 0, '静态词表不进正文（不印星期表）');
  ok(!/weekdays|eras|shichen/.test(block), '正文里不出现静态表的键名');

  // 负控制⑤：静态词表判成 runtime ⇒ 静态表进正文
  const src = rd('engines/narrow-consumers.js');
  const anchor = "return { kind: 'static', text: k + ' ' + v[k].length + '（静态词表）' };";
  must1(src, anchor);
  const b = sync.fresh({ srcOverride: { 'engines/narrow-consumers.js': src.replace(anchor, "return { kind: 'runtime', text: k + ' ' + v[k].length + '（静态词表）' };") } });
  const bb = b.WA.narrowConsumers.buildBlock();
  ok(bb.indexOf('静态词表') > 0, '负控制⑤：静态表被判 runtime ⇒ 星期表进了正文（判据现形）');
}

// ══ OPV27-8 老档缺键体检 ═════════════════════════════════════════════
console.log('\n【OPV27-8】老档缺键清单与 dry-run');
{
  ok(typeof WA.store.shapeAudit === 'function', 'store.shapeAudit 已导出');
  const empty = {};
  const beforeKeys = Object.keys(empty).length;
  const sa = WA.store.shapeAudit(empty, { maxRows: 5 });
  ok(sa.ok, '空档体检返回 ok');
  ok(sa.filled > 100, '空档缺键计数 ≥100（实 ' + sa.filled + '）');
  eq(sa.missing.length, 5, 'maxRows=5 时清单最多 5 条');
  ok(sa.missingTotal >= sa.missing.length, '清单条数 ≤ 总数（截断如实标）');
  ok(sa.missing.every(function (m) { return typeof m.path === 'string' && typeof m.impact === 'string'; }),
    '每条缺键都带 path 与 impact（谁写/补齐影响）');
  eq(Object.keys(empty).length, beforeKeys, 'dry-run 不改入参（空对象仍是空对象）');

  const lf = (WA.store.loadStat() || {}).lastFix || {};
  ok(Object.prototype.hasOwnProperty.call(lf, 'missing'), 'loadStat().lastFix 投影带 missing（存了必须看得见）');
  ok(Object.prototype.hasOwnProperty.call(lf, 'missingTotal'), 'loadStat().lastFix 投影带 missingTotal');

  // 负控制⑥：ensureShape 不 push 清单 ⇒ 「补了但列不出」
  const src = rd('core/store.js');
  const anchor = 'sink.push({ path: path, kind: dArr0 ? \'array\' : (dObj0 ? \'object\' : \'value\') });';
  must1(src, anchor);
  const b = sync.fresh({ srcOverride: { 'core/store.js': src.replace(anchor, '/* 不 push */') } });
  const bsa = b.WA.store.shapeAudit({}, { maxRows: 5 });
  ok(bsa.filled > 100, '负控制⑥：破坏版仍然补了（filled 不降）');
  eq(bsa.missing.length, 0, '负控制⑥：补了却列不出任何一条（「存了看不见」现形）');
}

// ══ 接线面：六项都真被诊断节读 ═══════════════════════════════════════
console.log('\n【接线】六项读数真被诊断节消费');
{
  const diag = rd('engines/tool-diag.js');
  ok(diag.indexOf('out.v27 = (function ()') > 0, 'tool-diag 有 out.v27 读数节');
  ['saveCurve', 'narrowConsumers', 'settingsIndex', 'rejectPhrase', 'injectDelta', 'loadStat'].forEach(function (k) {
    ok(diag.indexOf(k) > 0, '诊断节真读 ' + k);
  });
  const inj = rd('render/inject.js');
  ok(inj.indexOf('WA.injectDelta.measure(finalItems)') > 0, '注入链真调 injectDelta.measure');
  ok(inj.indexOf('WA.narrowConsumers.buildBlock()') > 0, '注入链真调 narrowConsumers.buildBlock');
  const ad = rd('engines/action-desk.js');
  ok(ad.indexOf('res.phrase = p.text') > 0, 'action-desk 玩家面真挂 phrase');
  const idx = rd('index.js');
  ['engines/inject-delta.js', 'engines/reject-phrase.js', 'engines/settings-index.js',
    'engines/save-curve.js', 'engines/narrow-consumers.js'].forEach(function (f) {
    ok(idx.indexOf(f) > 0, 'index.js LOAD_ORDER 收 ' + f);
  });
}

console.log('\n=== V27 剩余六项专锁全绿：' + passed + ' 项断言 ===');