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
