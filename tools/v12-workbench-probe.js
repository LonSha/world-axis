#!/usr/bin/env node
'use strict';
require('../tests/mock.js');
const W=require('../tests/ui-gate-sync.js').fresh().WA;
W.store.init();W.liaison.setSettings({enabled:true});W.actionDesk.setSettings({enabled:true});
W.store.transact(d=>{d.people={p_甲:{id:'p_甲',name:'甲',location:'东市'},p_乙:{id:'p_乙',name:'乙',location:'西市'}};return true;},'probe:people');
function open(opId,shared,people,place){const r=W.liaison.sceneOpen({opId,shared,people,place,intent:opId});if(!r.ok)throw Error(JSON.stringify(r));return r.sceneId;}
const publicId=open('shared-local',true,['甲','乙'],'东市');
open('private-local',false,['甲'],'东市');open('shared-away',true,['甲'],'西市');open('other-viewer',true,['乙'],'东市');
const before=JSON.stringify(W.store.get());
const projection=W.actionDesk.sceneFlow({who:'甲',place:'东市'});
if(!projection.ok||projection.coordination.length!==1||projection.coordination[0].id!==publicId)throw Error('coordination scope: '+JSON.stringify(projection));
if(JSON.stringify(W.store.get())!==before)throw Error('read projection writes');
projection.coordination[0].intent='changed';if(W.liaison.sceneView(publicId).scene.intent!=='shared-local')throw Error('projection alias');
console.log(JSON.stringify({ok:true,scenario:'workbench-shared-participant-place-isolation'}));
const inferred=W.actionDesk.sceneFlow({who:'甲'});
if(!inferred.ok||inferred.coordination.some(x=>x.intent==='shared-away'))throw Error('inferred place leaks distant contract');
console.log(JSON.stringify({ok:true,scenario:'inferred-place-isolation'}));




// Check actionDesk ROUTES route dispatching for sceneOpen & sceneResolve
const openRes = W.actionDesk.plan('liaison.sceneOpen', { opId: 'probe-open-routes', place: '东市', intent: '协商商路', people: ['甲', '乙'], shared: true });
if (!openRes || !openRes.ok || !openRes.scene || !openRes.scene.id) throw new Error('plan(liaison.sceneOpen) failed: ' + JSON.stringify(openRes));
// Create a real done act to resolve against (act engine uses 'person' for owner)
W.store.transact(d => {
  d.acts = d.acts || { rows: [] };
  d.acts.rows.push({ id: 'act_done_probe', person: '甲', status: 'done', title: '协商完毕' });
  return true;
}, 'probe:act');
const resolveRes = W.actionDesk.plan('liaison.sceneResolve', { sceneId: openRes.scene.id, receipt: { ref: 'act:act_done_probe' } });
if (!resolveRes || !resolveRes.ok) throw new Error('plan(liaison.sceneResolve) failed: ' + JSON.stringify(resolveRes));
console.log(JSON.stringify({ ok: true, scenario: 'workbench-routes-scene-contracts', sceneId: openRes.scene.id, receipts: resolveRes.receipts }));
