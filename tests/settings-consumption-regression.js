'use strict';
// Behavioral checks: change real settings, execute public engines, inspect committed state.
const a = require('assert');
require('./mock.js');
const W = require('./ui-gate-sync.js').fresh().WA;
W.store.init();
let checks = 0;
function check(cond, label) { a.ok(cond, label); checks++; }
function config(module, patch) {
  const r = W.settingsBus.registry().find(r => r.module === module);
  a.ok(r, module + ' registered');
  W.settingsBus.saveOrThrow(r, Object.assign({}, r.def, patch));
}
function seed(key, value) { W.store.transact(d => { d[key] = value; }); }
// Caps reject a new identity but permit an existing identity at capacity.
[
  ['ecosystemCascade','maxRegions','registerEcoRegion','ecosystemCascade','regions',{}],
  ['dungeonHazardMesh','maxDungeons','generateDungeon','dungeons','meshes',{}],
  ['engineeringBlueprint','maxWorkshops','registerWorkshop','engineeringWorkshop','workshops',{}],
  ['bloodlineHeritage','maxLineages','registerClan','bloodlines','clans',{}],
  ['incarcerationJailbreak','maxPrisoners','admitPrisoner','prisonSystem','inmates',{}],
  ['regimentTactics','maxRegiments','registerRegiment','regiments','roster',{headcount:100}],
  ['theologyCult','maxSects','registerSect','theologySects','sects',{}],
].forEach(([mod,key,method,root,collection,spec]) => {
  config(mod,{[key]:2});
  check(W[mod][method]('cap-a',spec).ok,mod+' first');
  check(W[mod][method]('cap-b',spec).ok,mod+' second');
  check(!W[mod][method]('cap-c',spec).ok,mod+' rejects overflow');
  check(W[mod][method]('cap-a',spec).ok,mod+' allows existing at cap');
  check(Object.keys(W.store.get()[root][collection]).length === 2,mod+' committed cap');
});
config('courtIntrigue',{maxCourts:1});
check(W.courtIntrigue.registerCourt('cap-a').ok,'court first');
check(!W.courtIntrigue.registerCourt('cap-b').ok,'court cap');
check(W.courtIntrigue.registerCourt('cap-a').ok,'court existing');
config('sanctuaryScramble',{maxSanctuaries:1});
seed('sanctuaries',{}); seed('sanctuaryOccupants',{});
check(W.sanctuaryScramble.scramble({sanctuaryId:'batch-a',applicants:[{actorId:'a'}]}).ok,'sanctuary batch first');
check(!W.sanctuaryScramble.scramble({sanctuaryId:'batch-b',applicants:[{actorId:'b'}]}).ok,'sanctuary batch cap');
check(W.sanctuaryScramble.scramble({sanctuaryId:'single-a',actorId:'a'}).ok,'sanctuary single first');
check(!W.sanctuaryScramble.scramble({sanctuaryId:'single-b',actorId:'b'}).ok,'sanctuary single cap');
config('maritimeNavigation',{maxVessels:4,drainEfficiencyPerPumping:10,maxVoyageLogs:8,stormDamageFactor:0.5});
seed('maritimeVessels',[]);
for(let i=0;i<4;i++) check(W.maritimeNavigation.registerVessel({vesselId:'v'+i,bilgeWater:70}).ok,'vessel registration');
check(!W.maritimeNavigation.registerVessel({vesselId:'v4'}).ok,'vessel cap');
const p = W.maritimeNavigation.navigateVoyage({vesselId:'v0',action:'pumpBilge'});
check(p.drainedPct === 10,'configured pump power');
const storm = W.maritimeNavigation.navigateVoyage({vesselId:'v1',action:'tack',env:{stormLevel:6,waveMeters:0}});
check(storm.hullIntegrity === 94,'configured storm multiplier');
for(let i=0;i<12;i++) W.maritimeNavigation.navigateVoyage({vesselId:'v2',action:'repairHull'});
check(W.maritimeNavigation.getVessel('v2').logs.length === 8,'configured voyage log retention');
config('stealthInfiltration',{maxGuards:4,baseViewDistance:65,distractRadius:5,stealthSuccessThreshold:90});
seed('stealthTactics',{guards:[],infiltrators:{},logs:[]});
for(let i=0;i<4;i++) check(W.stealthInfiltration.registerGuard({guardId:'g'+i}).ok,'guard registration');
check(!W.stealthInfiltration.registerGuard({guardId:'g4'}).ok,'guard cap');
check(W.store.get().stealthTactics.guards[0].viewDistance === 65,'configured guard view distance');
check(!W.stealthInfiltration.executeInfiltration('a',{tactic:'distractStone',guardId:'g0',distance:6}).ok,'configured distraction radius');
const melt = W.stealthInfiltration.executeInfiltration('a',{tactic:'shadowMelt',guardId:'g0',shadowFactor:70,footstepDb:20,inSight:true});
check(melt.detected,'configured stealth threshold');
config('alchemyToxicology',{maxPatients:4,neutralizeRate:15,maxToxinTypes:4});
seed('toxicologyLedger',{cases:{},recipes:[]});
const toxin = W.alchemyToxicology.brewOrTestToxin({action:'counterToxin',patientId:'a',severity:60});
check(toxin.currentSeverity === 45,'configured neutralization');
for(let i=0;i<6;i++) W.alchemyToxicology.brewOrTestToxin({action:'brewToxin',name:'tox'+i});
check(W.store.get().toxicologyLedger.recipes.length === 4,'configured toxin retention');
for(let i=1;i<4;i++) W.alchemyToxicology.brewOrTestToxin({action:'counterToxin',patientId:'a'+i});
check(!W.alchemyToxicology.brewOrTestToxin({action:'counterToxin',patientId:'overflow'}).ok,'toxicology patient cap');
config('surgicalTriage',{maxPatients:4}); seed('surgicalPatients',{});
for(let i=0;i<4;i++) W.surgicalTriage.admitPatient('p'+i,{});
check(!W.surgicalTriage.admitPatient('p4',{}).ok,'surgical patient cap');
check(W.surgicalTriage.admitPatient('p0',{}).ok,'surgical update at cap');
config('blackmarketUsury',{defaultLaunderDiscount:0.6,dailyInterestRate:0.25});
const launder = W.blackmarketUsury.transactBlackMarket({subType:'launderContraband',nominalValue:100});
check(launder.launderedCash === 60,'configured laundry discount');
const loan = W.blackmarketUsury.transactBlackMarket({subType:'takeLoan',principal:100});
check(W.store.get().blackmarketAccounts.loans.find(x=>x.loanId===loan.loanId).interestRate === 0.25,'configured loan rate');
config('humanRealism',{grudgeDecayPerRound:2});
const g = W.humanRealism.recordGrudge({who:'decay-a',target:'b',reason:'unpaid debt',intensity:50});
W.humanRealism.consumeRoutine('decay-a',{rounds:3});
const after = W.humanRealism.listGrudges().find(x=>x.id===g.grudge.id);
check(after.intensity === 44 && after.roundsHeld === 3 && !after.settled,'configured decay does not imply forgiveness');
config('spatialAcoustics',{baseWallDamping:0,baseScreenDamping:1});
W.spatialAcoustics.whisper({roomId:'sound-a',content:'test message',volume:'shout'});
W.spatialAcoustics.registerPartition('sound-a','sound-b',{type:'wall'});
W.spatialAcoustics.registerPartition('sound-a','sound-c',{type:'screen'});
check(W.spatialAcoustics.eavesdrop({targetRoomId:'sound-a',listenerRoomId:'sound-b'}).clarity === 'clear','configured wall damping');
check(W.spatialAcoustics.eavesdrop({targetRoomId:'sound-a',listenerRoomId:'sound-c'}).clarity === 'inaudible','configured screen damping');
console.log('settings consumption behavioral checks: PASS ('+checks+')');
