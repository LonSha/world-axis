'use strict';
const assert = require('node:assert/strict');
const W=require('./ui-gate-sync').fresh().WA, C=W.calendar;
const iso=()=>W.store.get().clock.iso;
let floor=0;const say=text=>C.autoAdvance(text,{floor:++floor});
C.setClock('序章');say('训练持续了两个小时。');assert.equal(iso(),'');assert.equal(W.store.get().clock.label,'序章之后 2小时');
say('十分钟后，春回到座位。');assert.equal(W.store.get().clock.label,'序章之后 2小时10分钟');
C.setClock('2026-04-28T23:30:00+09:00',{dayIndex:1});
const msg='两小时后，春收好器材，结束了实验。';say(msg);assert.equal(iso(),'2026-04-29T01:30:00+09:00');assert.equal(W.store.get().clock.dayIndex,2);assert.equal(C.autoAdvance(msg,{floor}).ok,false);
for(const t of ['“两小时后，我们再来。”','她打算训练两小时。','他昨天练了三小时。','实验持续了两小时吗？','两人开始训练。','甲练了两小时。与此同时，乙等了两小时。']) {assert.equal(say(t).ok,false,t);assert.equal(iso(),'2026-04-29T01:30:00+09:00');}
say('训练持续了90分钟。');assert.equal(iso(),'2026-04-29T03:00:00+09:00');
const G=W.world;G.setSettings({enabled:true});G.addPlace({name:'学校'});W.store.transact(d=>{d.region=Object.assign({},d.region,{currentPlace:'学校'});});
const stamp=h=>'2026-04-29T'+h+':00+09:00';
G.addEvent({title:'物理实验课',place:'学校',start:Date.parse(stamp('09:00')),end:Date.parse(stamp('11:00'))});C.setClock(stamp('09:30'));
for(const t of ['春开始整理器材。','春想上完了物理实验课再走。','老师说：“物理实验课结束了。”'])assert.equal(say(t).ok,false,t);
G.addEvent({title:'社团活动',place:'学校',start:Date.parse(stamp('09:00')),end:Date.parse(stamp('11:00'))});
say('春上完了物理实验课。');assert.deepEqual(Array.from(W.store.get().world.events,e=>e.status),['done','planned']);assert.equal(iso(),stamp('11:00'));say('物理实验课按时结束。');assert.equal(iso(),stamp('11:00'));
C.setClock(stamp('09:00'),{dayIndex:1});
for (const text of ['现在是第二天了吗？','还没天亮。','<!-- 第二天 -->门没动。','她描述昨天的黄昏。','平时训练持续了两小时。']) {
  const before=JSON.stringify(W.store.get().clock); assert.equal(say(text).ok,false,text); assert.equal(JSON.stringify(W.store.get().clock),before,text);
}
say('第二天，春到校了。');assert.equal(iso(),'2026-04-30T09:00:00+09:00');
C.setClock(stamp('09:00'));assert.ok(G.addPlace({name:'宿舍'}).ok);assert.ok(G.addRoad('学校','宿舍',15).ok);
assert.ok(G.depart('春','学校','宿舍').ok);G.advance(15);assert.ok(G.depart('你','宿舍','学校').ok);G.advance(15);
say('刚才从宿舍到学校花了十五分钟。');say('从宿舍到学校用了十五分钟。');assert.equal(iso(),stamp('09:15'));
say('到校后又等了十五分钟。');assert.equal(iso(),stamp('09:30'));
for(const text of ['春在宿舍完成了社团活动。','春完成了社团活动。']) {assert.equal(say(text).ok,false,text);assert.equal(iso(),stamp('09:30'));}
assert.equal(G.where('春').place,'宿舍');assert.equal(W.store.get().world.events[1].status,'planned');
assert.ok(G.depart('春','宿舍','学校').ok);say('春完成了社团活动。');assert.equal(iso(),stamp('09:30'));
G.advance(15);assert.equal(G.where('春').place,'学校');say('春在学校完成了社团活动。');assert.equal(iso(),stamp('11:00'));assert.equal(W.store.get().world.events[1].status,'done');
C.setSettings({auto:false});assert.equal(say(msg).reason,'disabled');assert.equal(iso(),stamp('11:00'));
console.log('PASS action duration: narrative, relative clock, midnight, plans, quotes, parallel, scheduled remainder');
