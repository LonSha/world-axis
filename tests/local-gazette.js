'use strict';
const assert = require('node:assert/strict');
function seed(W) {
  const agenda = W.publicAgenda;
  W.world.setSettings({enabled:true});
  for (const name of ['东市','渡口']) W.world.addPlace({name});
  const put = (id, groupName, title, supportWeight, isSecret=false) => agenda.submitProposal({id,placeId:'东市',groupName,title,supportWeight,isSecret,sourceEvidence:'议事簿'});
  agenda.setAgendaCapacity('东市',1);
  put('lamps','船工会','修渡灯',8); put('booths','摊主','增摊位',3); put('private','隐名','密议底价',1,true);
  agenda.scheduleAgenda('东市'); agenda.scheduleAgenda('东市');
  W.periodicalIdeology.publishIdeologyArticle({id:'edition',periodicalName:'东市旬刊',headline:'摊税该不该减',publicPlace:'东市'});
  W.periodicalIdeology.publishIdeologyArticle({id:'unknown',headline:'不明发行地'});
  W.theologyCult.registerSect('lantern',{name:'守灯会',creed:'内部戒律',publicTeaching:'不问来路，夜行皆可借灯',publicPlace:'渡口'});
  W.store.transact(d => {W.backstage.applyResult(d,{currents:[{title:'幕后换印',summary:'幕后内应',visibility:'trace',public_trace:'票据换了印色',publicPlace:'东市'},{title:'暗室密谈',visibility:'hidden',public_trace:'不可见信号',publicPlace:'东市'}]},{idx:4,swipe:0});});
}
module.exports = {seed};
if (require.main === module) {
  const W = require('./ui-gate-sync').fresh().WA; seed(W);
  W.world.addRoad('东市','渡口',14);
  const read = () => W.atlas.localGazette().places;
  const town = () => read().find(p => p.name === '东市');
  const ferry = () => read().find(p => p.name === '渡口');
  const before = JSON.stringify(W.store.get());
  assert.equal(town().roads[0].minutes,14);
  assert.equal(town().items.find(i=>i.title==='修渡灯').text,'船工会 · 已排期');
  assert.equal(town().items.find(i=>i.title==='增摊位').text,'摊主 · 候议');
  assert.ok(town().items.some(i=>i.text==='票据换了印色'));
  assert.ok(town().items.some(i=>i.title==='摊税该不该减'));
  assert.equal(ferry().items.length,1); assert.equal(ferry().items[0].title,'守灯会');
  const html = W.panelMapPage.render();
  for (const secret of ['隐名','密议底价','幕后换印','幕后内应','暗室密谈','不可见信号','内部戒律','不明发行地']) assert.ok(!html.includes(secret),secret);
  assert.equal(JSON.stringify(W.store.get()),before);
  assert.equal(W.publicAgenda.enactAgendaTopic({proposalId:'booths'}).reason,'not-on-agenda');
  assert.ok(W.publicAgenda.enactAgendaTopic({proposalId:'lamps'}).ok); W.publicAgenda.scheduleAgenda('东市');
  assert.equal(town().items.find(i=>i.title==='增摊位').text,'摊主 · 已排期');
  W.store.transact(d=>{W.backstage.applyResult(d,{currents:[{title:'幕后换印',public_trace:'传来新的迹象'}]},{idx:5,swipe:0});});
  assert.ok(!town().items.some(i=>i.kind==='暗流'));
  console.log('PASS local gazette: local evidence, seat turnover, hidden rows, read isolation');
}
