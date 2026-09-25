'use strict';
const path = require('path');
const gate = require(path.join(__dirname, '..', 'tests', 'ui-gate-sync.js'));
const WA = gate.fresh({}).WA;
function show(k, v) { console.log(k, JSON.stringify(v)); }
show('hasStateView', typeof WA.causal.stateView);
show('empty', WA.causal.stateView());
show('stat0', WA.causal.stat());
WA.causal.setSettings({ enabled: true });
// 造一条已知原因
WA.store.transact(function (d) { d.worldFacts = [{ id: 'wf1', key: '下雨', value: '是' }]; }, 'b6:fact');
const r1 = WA.causal.addChain({ cause: '下雨', action: '带伞', immediate: '出门' });
show('add1', r1);
const r2 = WA.causal.addChain({ cause: '下雨', action: '关窗' });
show('add2', r2);
show('view1', WA.causal.stateView());
show('stat1', WA.causal.stat());
// 取消一条
const c = WA.causal.cancel(r1.id, '不想了');
show('cancel', c);
show('view2', WA.causal.stateView());
// 只读：stateView 不改累计
const before = JSON.stringify(WA.causal.stat());
WA.causal.stateView();
show('statUnchanged', JSON.stringify(WA.causal.stat()) === before);
// tool-diag 消费
const sm = WA.toolDiag.secCausal();
show('diagNow', sm.now);
show('diagAdds', sm.adds);
