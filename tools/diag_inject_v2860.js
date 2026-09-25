'use strict';
// 决定性实验：单个源 buildBlock 抛异常 ⇒ 注入链其余部分是否完好？
const gate = require('/tmp/wa_git/tests/ui-gate-sync.js');

function productText(WA) {
  let snap = '', inj = '';
  try { snap = String(WA.render.buildWorldSnapshot() || ''); } catch (e) { snap = '<<snap-throw:' + e.message + '>>'; }
  try {
    global.__lastExtensionPrompt = null;
    WA.render.applyInjections({ injections: [] });
    inj = String((global.__lastExtensionPrompt && global.__lastExtensionPrompt.text) || '');
  } catch (e) { inj = '<<apply-throw:' + (e && e.message) + '>>'; }
  return snap + '\n' + inj;
}

// 装哨兵：让每个源都产出可辨识文本
function armAll(WA) {
  const tags = {};
  const restores = [];
  (WA.render.SOURCES || []).forEach(function (k) {
    const tag = '<<SENT-' + k + '>>';
    tags[k] = tag;
    const mod = WA[k];
    if (!mod) return;
    const method = (typeof mod.buildBlock === 'function') ? 'buildBlock'
      : (typeof mod.buildMemoryBlock === 'function') ? 'buildMemoryBlock'
      : (typeof mod.buildOpinionBlock === 'function') ? 'buildOpinionBlock'
      : (typeof mod.buildLedgerText === 'function') ? 'buildLedgerText' : null;
    if (!method) return;
    const keep = mod[method];
    mod[method] = function () { return tag; };
    restores.push(function () { mod[method] = keep; });
  });
  return { tags: tags, restore: function () { restores.forEach(function (f) { f(); }); } };
}

function setAll(WA, on) { (WA.render.SOURCES || []).forEach(function (k) { WA.render.setVisibility(k, !!on); }); }

// 实验 1：全部正常 ⇒ 全部哨兵在场
const WA1 = gate.fresh({}).WA;
const a1 = armAll(WA1);
setAll(WA1, true);
const t1 = productText(WA1);
const present1 = Object.keys(a1.tags).filter(function (k) { return t1.indexOf(a1.tags[k]) >= 0; });
a1.restore();
console.log('[1] 全开 · 哨兵在场 = ' + present1.length + ' / ' + Object.keys(a1.tags).length);

// 实验 2：让 bonds 抛异常 ⇒ 其余源是否仍在场？
const WA2 = gate.fresh({}).WA;
const a2 = armAll(WA2);
setAll(WA2, true);
const keepBonds = WA2.bonds.buildBlock;
WA2.bonds.buildBlock = function () { throw new Error('__bonds_boom__'); };
const t2 = productText(WA2);
WA2.bonds.buildBlock = keepBonds;
const present2 = Object.keys(a2.tags).filter(function (k) { return t2.indexOf(a2.tags[k]) >= 0; });
const lost2 = Object.keys(a2.tags).filter(function (k) { return t2.indexOf(a2.tags[k]) < 0; });
a2.restore();
console.log('[2] bonds 抛异常 · 哨兵仍在场 = ' + present2.length + ' / ' + Object.keys(a2.tags).length);
console.log('    丢失 = ' + (lost2.join(',') || '无'));
console.log('    产物是否含 apply-throw = ' + (t2.indexOf('apply-throw') >= 0));
const at = t2.indexOf('apply-throw');
if (at >= 0) console.log('    异常头: ' + t2.slice(at, at + 90).replace(/\n/g, ' '));

// 实验 3：让 world（排在很前）抛异常
const WA3 = gate.fresh({}).WA;
const a3 = armAll(WA3);
setAll(WA3, true);
const keepW = WA3.world.buildBlock;
WA3.world.buildBlock = function () { throw new Error('__world_boom__'); };
const t3 = productText(WA3);
WA3.world.buildBlock = keepW;
const present3 = Object.keys(a3.tags).filter(function (k) { return t3.indexOf(a3.tags[k]) >= 0; }).length;
a3.restore();
console.log('[3] world 抛异常 · 哨兵仍在场 = ' + present3 + ' / ' + Object.keys(a3.tags).length);

// 实验 4：默认关模块打开后，脏行是否真让 buildBlock 抛（真 API 路径）
const WA4 = gate.fresh({}).WA;
const b = WA4.bonds;
const r = b.read ? null : null;
let dirty = null;
try {
  // 直接往 store 塞一行缺 types 的 bonds 行（模拟模型输出少字段）
  WA4.store.transact(function (d) { d.bonds = d.bonds || {}; d.bonds.rows = [{ key: '甲·乙', types: undefined, at: 1 }]; });
  b.setSettings({ enabled: true });
  dirty = String(b.buildBlock());
} catch (e) { dirty = '<<throw:' + e.message + '>>'; }
console.log('[4] bonds 脏行（缺 types）· buildBlock = ' + dirty.slice(0, 70));

const WA5 = gate.fresh({}).WA;
let dirty5 = null;
try {
  WA5.store.transact(function (d) { d.ladder = d.ladder || {}; d.ladder.rows = [{ who: '甲', kind: 'k', idx: 0, rungs: undefined, at: 1 }]; });
  WA5.ladder.setSettings({ enabled: true });
  dirty5 = String(WA5.ladder.buildBlock());
} catch (e) { dirty5 = '<<throw:' + e.message + '>>'; }
console.log('[5] ladder 脏行（缺 rungs）· buildBlock = ' + dirty5.slice(0, 70));

const WA6 = gate.fresh({}).WA;
let dirty6 = null;
try {
  WA6.store.transact(function (d) { d.shadow = d.shadow || {}; d.shadow.rows = [{ holders: undefined, kind: 'k', stakes: 's', severity: 1, status: 'active', at: 1 }]; });
  WA6.shadow.setSettings({ enabled: true });
  dirty6 = String(WA6.shadow.buildBlock());
} catch (e) { dirty6 = '<<throw:' + e.message + '>>'; }
console.log('[6] shadow 脏行（缺 holders）· buildBlock = ' + dirty6.slice(0, 70));