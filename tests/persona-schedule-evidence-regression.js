'use strict';
const assert = require('assert');
require('./mock.js');
const W = require('./ui-gate-sync.js').fresh().WA;
W.store.init();
W.personaAnchor.setSettings({enabled:true});
W.personaAnchor.registerAnchor('甲',{coreTraits:['谨慎'],forbiddenBehaviors:['无脑倒贴'],resistance:0.95});
for (const majorEvent of [{intensity:100},{intensity:100,evidence:'   '},{intensity:100,evidence:{}},{intensity:'100',evidence:'发生转折'}]) {
  assert.strictEqual(W.personaAnchor.evaluateDrift('甲',{deltaTrait:'无脑倒贴'},{majorEvent}).allowed,false);
  assert.strictEqual(W.personaAnchor.auditGeneratedContent('甲','无脑倒贴',{majorEvent}).compliant,false);
}
const majorEvent={intensity:100,evidence:'叙事中明确发生的转折'};
assert.strictEqual(W.personaAnchor.auditGeneratedContent('甲','无脑倒贴',{majorEvent}).compliant,true);
W.life.setSettings({enabled:true});
function check(iso,start,end,now,expected) {
  const d={clock:{iso},people:{a:{name:'甲',life:{goals:[],commitments:[],schedule:[{status:'active',start,end}],lastDecision:null}}}};
  W.life.tickDraft(d,{now});
  assert.strictEqual(!!d.people.a.life.lastDecision,expected,JSON.stringify({iso,start,end,now}));
}
check('2026-11-06T09:30:00+08:00',8,12,1790000000000,true);
check('2026-11-06T12:00:00+08:00',8,12,1790000000000,false);
check('',8,12,1790000000000,false);
check('',1790000000000,1790000002000,1790000001000,true);
console.log('persona/schedule evidence regression: PASS');
