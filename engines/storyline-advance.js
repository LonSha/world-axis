/** V9: opt-in five-stage scheduling. Stage writes remain owned by backstage. */
(function () {
  'use strict';
  const WA = window.WorldAxis = window.WorldAxis || {};
  const REG = {key:'worldaxis_storyline_advance_settings_v1',module:'storylineAdvance',def:{enabled:false,turnsPerStage:3},bounds:{turnsPerStage:[1,30]}};
  WA.__settingsRegs = (WA.__settingsRegs || []).concat([REG]);
  function settings(){return WA.settingsBus.normalize(REG,Object.assign({},REG.def,WA.settingsBus.read(REG)));}
  const stats={runs:0,moved:0,skipped:0,failed:0};
  function tick(){
    const c=settings();if(!c.enabled)return {ok:false,reason:'disabled'};
    stats.runs++;
    if(!WA.backstage || !WA.backstage.advanceManagedCurrents){stats.failed++;return {ok:false,reason:'owner-missing'};}
    const r=WA.backstage.advanceManagedCurrents({round:WA.evolution.roundOf(),turnsPerStage:c.turnsPerStage});
    if(r&&r.ok){stats.moved+=r.moved;stats.skipped+=r.skipped;}else stats.failed++;
    return r;
  }
  function buildBlock(){
    if(!settings().enabled)return '';
    const round=WA.evolution.roundOf(),rows=(WA.store.get().currents||[]).filter(c=>c&&c.autoAdvance===true&&c.advanceLast&&c.advanceLast.round===round);
    const lines=rows.filter(c=>c.visibility==='known'||c.visibility==='direct'||c.visibility==='public').map(c=>'- '+String(c.title).slice(0,100)+'：'+c.advanceLast.from+'→'+c.advanceLast.to+'（仅阶段推进，具体事件尚待叙事确认）');
    // Never copy hidden titles, summaries or public_trace into this general prompt source.
    return lines.length?'[暗流阶段推进]\n'+lines.join('\n'):'';
  }
  WA.storylineAdvance={getSettings:settings,setSettings:p=>WA.settingsBus.saveOrThrow(REG,WA.settingsBus.normalize(REG,Object.assign({},settings(),p||{}))),tick,buildBlock,stat:()=>Object.assign({},stats)};
  if(WA.registerModule)WA.registerModule('engines/storyline-advance.js',{kind:'engine',ver:'2.295.0'});
})();
