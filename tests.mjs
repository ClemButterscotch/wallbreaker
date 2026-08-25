import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hostModeForPath, hostStorageName } from './public/brand.js';
import {
  COLORS,
  viewerAccess,
  clampDial,
  roleComposition,
  wildRoleComposition,
  WILD_ROLE_DEFINITIONS,
  WILD_ROLE_IDS,
  MAX_WILD_PLAYERS,
  assignWildRoles,
  describeWildRoleType,
  isCompletedOneTimeWildRole,
  describeWildRole,
  evaluateWildRole,
  buildWildRoleResults,
  knownWallfacerNames,
  victoryRevealStage,
  maxEffectFor,
  legalEffectsFor,
  isLegalSelection,
  tryLockSelection,
  resolveRoundState,
  isPlanFieldGuess,
  isStandardPlanComplete,
  privateArrestOutcome,
  buildPostgameDisclosure,
  buildTutorialDisclosure
} from './public/game-rules.js';

const test=(name,fn)=>{
  try { fn(); console.log(`✓ ${name}`); }
  catch(error){ console.error(`✗ ${name}`); throw error; }
};

const rulebookHtml=readFileSync(new URL('./rules.html',import.meta.url),'utf8');
const appSource=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');

test('the rulebook ends with one advanced Wild Role primer and one slide per role',()=>{
  const wildSlideIds=[...rulebookHtml.matchAll(/id="rules-slide-wild-([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(wildSlideIds,['overview','information',...WILD_ROLE_IDS]);
  assert.doesNotMatch(rulebookHtml,/id="rules-slide-(?:example|observer)"/);
  const standardEnding=rulebookHtml.indexOf('id="rules-slide-finish"');
  assert.ok(wildSlideIds.every(slideId=>rulebookHtml.indexOf(`id="rules-slide-wild-${slideId}"`)>standardEnding));
  assert.match(rulebookHtml,/Advanced play variant/);
  assert.match(rulebookHtml,/Wild Roles replace Specialists/);
  assert.match(rulebookHtml,/There are no Specialists in this variant/);
  assert.match(rulebookHtml,/Private task.*Shared work.*Win together/s);
  assert.match(rulebookHtml,/A Wild Role wins only if their private task is complete and the Wallfacer team wins/);
  assert.doesNotMatch(rulebookHtml,/4–11 players/);
  assert.doesNotMatch(rulebookHtml,/The host may enable Wild Roles in a standard game/);
  assert.doesNotMatch(rulebookHtml,/id="rules-wild-bank"|class="wild-pack-summary"/);
  assert.match(rulebookHtml,/Wallbreaker learns exactly one of them and may pretend to be it/);
  assert.doesNotMatch(rulebookHtml,/Happens once/i);
  assert.match(rulebookHtml,/ROUND 4 COMPLETED.*Starting total.*Round 4 total/s);
  assert.match(rulebookHtml,/wild-moderate-demo.*wild-six-dial-board/s);
  assert.match(rulebookHtml,/wild-numerologist-demo.*wild-six-dial-board/s);
  assert.match(rulebookHtml,/wild-wrapper-demo.*wild-six-dial-board/s);
  assert.match(rulebookHtml,/aria-valuemax="22"/);
  assert.doesNotMatch(rulebookHtml,/Doomsayer|Curator|Contrarian|Hermit|Must remain/i);
  assert.match(rulebookHtml,/Wild players never see the plan/);
  assert.doesNotMatch(rulebookHtml,/Wallfacer plan revealed|Plan targets revealed|See the exact Wallfacer plan/i);
  assert.doesNotMatch(rulebookHtml,/Combination unlocked/i);
});

test('host subpages select and isolate their game modes',()=>{
  assert.equal(hostModeForPath('/host'),'standard');
  assert.equal(hostModeForPath('/tutorial/host'),'tutorial');
  assert.equal(hostModeForPath('/unknown/host'),null);
  assert.notEqual(hostStorageName('/host'),hostStorageName('/tutorial/host'));
});

test('a playing host has player-only access while an observer has omniscient access',()=>{
  assert.deepEqual(viewerAccess({isHost:true,adminPlaying:true,playerId:'host'}),{observer:false,player:true,viewerId:'host'});
  assert.deepEqual(viewerAccess({isHost:true,adminPlaying:false,playerId:'host'}),{observer:true,player:false,viewerId:null});
  assert.deepEqual(viewerAccess({isHost:false,adminPlaying:false,playerId:'guest'}),{observer:false,player:true,viewerId:'guest'});
});

test('dial values clamp to the zero-to-nine board',()=>{
  assert.equal(clampDial(-2),0);
  assert.equal(clampDial(11),9);
  assert.equal(clampDial(5),5);
});

test('standard role composition always uses one Wallfacer and one Wallbreaker',()=>{
  assert.deepEqual(roleComposition(0,1),{wallfacers:0,wallbreakers:0,police:0,civilians:0});
  assert.deepEqual(roleComposition(2,1),{wallfacers:1,wallbreakers:1,police:0,civilians:0});
  assert.deepEqual(roleComposition(3,1),{wallfacers:1,wallbreakers:1,police:1,civilians:0});
  assert.deepEqual(roleComposition(7,2),{wallfacers:1,wallbreakers:1,police:1,civilians:4});
  assert.deepEqual(roleComposition(4,99),{wallfacers:1,wallbreakers:1,police:1,civilians:1});
  assert.deepEqual(roleComposition(5,99),{wallfacers:1,wallbreakers:1,police:1,civilians:2});
});

test('Wild Roles are opt-in and replace every eligible Specialist',()=>{
  assert.deepEqual(wildRoleComposition(3,false),{wallfacers:1,wallbreakers:1,police:1,civilians:0,wilds:0});
  assert.deepEqual(wildRoleComposition(4,false),{wallfacers:1,wallbreakers:1,police:1,civilians:1,wilds:0});
  assert.deepEqual(wildRoleComposition(4,true),{wallfacers:1,wallbreakers:1,police:1,civilians:0,wilds:1});
  assert.deepEqual(wildRoleComposition(8,true),{wallfacers:1,wallbreakers:1,police:1,civilians:0,wilds:5});
  assert.deepEqual(wildRoleComposition(9,true),{wallfacers:1,wallbreakers:1,police:1,civilians:0,wilds:6});
  assert.deepEqual(wildRoleComposition(10,true),{wallfacers:1,wallbreakers:1,police:1,civilians:0,wilds:7});
  assert.deepEqual(wildRoleComposition(11,true),{wallfacers:1,wallbreakers:1,police:1,civilians:0,wilds:8});
  assert.deepEqual(wildRoleComposition(12,true),{wallfacers:1,wallbreakers:1,police:1,civilians:1,wilds:8});
  assert.deepEqual(WILD_ROLE_IDS,['bounty','extremist','conservationist','moderate','disruptor','loner','oddball','numerologist','wrapper']);
  assert.equal(MAX_WILD_PLAYERS,11);
});

test('Wild Role assignment preserves every core role, stays unique, and reserves a Wallbreaker cover',()=>{
  const specialists=Array.from({length:8},(_,index)=>({id:`specialist${index+1}`,name:`Specialist ${index+1}`}));
  const players=[{id:'wf',name:'Wen'},{id:'wb',name:'Bo'},{id:'police',name:'Shi'},...specialists];
  const roles={
    wf:{kind:'wallfacer',label:'Wallfacer',plan:{values:{yellow:4,orange:6,blue:2}}},
    wb:{kind:'wallbreaker',label:'Wallbreaker',targetId:'wf'},
    police:{kind:'police',label:'Shi Qiang'},
    ...Object.fromEntries(specialists.map(player=>[player.id,{kind:'civilian',label:'Specialist',profession:'science'}]))
  };
  const dials=Object.fromEntries(COLORS.map(color=>[color,5]));
  const assignment=assignWildRoles({players,roles,dials,random:()=>0});
  assert.equal(assignment.assignments.length,8);
  assert.equal(new Set(assignment.assignments.map(item=>item.role.wildRole)).size,8);
  assert.ok(assignment.assignments.every(item=>item.role.team==='loyal'));
  assert.equal(Object.values(assignment.roles).filter(role=>role.kind==='wild').length,8);
  const bounty=assignment.assignments.find(item=>item.role.wildRole==='bounty');
  assert.equal(bounty.role.wildData.targetIds.length,2);
  assert.ok(bounty.role.wildData.targetIds.every(targetId=>!['police','wallfacer'].includes(roles[targetId].kind)));
  assert.deepEqual(assignment.roles.wf,roles.wf);
  assert.equal(assignment.roles.wb.targetId,roles.wb.targetId);
  const occupiedAtCap=new Set(assignment.assignments.map(item=>item.role.wildRole));
  assert.equal(WILD_ROLE_IDS.filter(roleId=>!occupiedAtCap.has(roleId)).length,1,'the eleven-player cap leaves exactly one role unoccupied');
  assert.equal(occupiedAtCap.has(assignment.unoccupiedWildRole),false);
  assert.equal(assignment.roles.wb.unoccupiedWildRole,assignment.unoccupiedWildRole);
  assert.deepEqual(assignment.roles.police,roles.police);
  assert.ok(specialists.every(player=>roles[player.id].kind==='civilian'),'assignment must not mutate the default role map');

  const fourPlayerRoles={wf:roles.wf,wb:roles.wb,police:roles.police,specialist1:roles.specialist1};
  const fourPlayerAssignment=assignWildRoles({players:players.slice(0,4),roles:fourPlayerRoles,dials,random:()=>0});
  assert.equal(fourPlayerAssignment.assignments.length,1);
  assert.notEqual(fourPlayerAssignment.assignments[0].role.wildRole,'bounty','Bounty must not be dealt when two valid non-Wallfacer targets do not exist');
  const fourPlayerOccupied=new Set(fourPlayerAssignment.assignments.map(item=>item.role.wildRole));
  assert.ok(WILD_ROLE_IDS.includes(fourPlayerAssignment.unoccupiedWildRole));
  assert.equal(fourPlayerOccupied.has(fourPlayerAssignment.unoccupiedWildRole),false,'the Wallbreaker clue must name an unoccupied role');
  assert.equal(fourPlayerAssignment.roles.wb.unoccupiedWildRole,fourPlayerAssignment.unoccupiedWildRole,'exactly one absent role is stored privately on the Wallbreaker role');

  const noSpecialist=assignWildRoles({players:players.slice(0,3),roles:{wf:roles.wf,wb:roles.wb,police:roles.police},dials,random:()=>0});
  assert.deepEqual(noSpecialist.playerIds,[]);
  assert.equal(noSpecialist.roles.wf.kind,'wallfacer');
});

test('the public Wild Role guide describes every role without private setup data',()=>{
  assert.deepEqual(WILD_ROLE_IDS.filter(roleId=>WILD_ROLE_DEFINITIONS[roleId].timing==='one-time'),WILD_ROLE_IDS);
  assert.deepEqual(WILD_ROLE_IDS.filter(roleId=>WILD_ROLE_DEFINITIONS[roleId].timing==='end-state'),[]);
  assert.deepEqual(WILD_ROLE_IDS.filter(roleId=>WILD_ROLE_DEFINITIONS[roleId].timing==='throughout'),[]);
  assert.equal(isCompletedOneTimeWildRole({kind:'wild',wildRole:'oddball',wildStatus:{met:true}}),true);
  assert.equal(isCompletedOneTimeWildRole({kind:'wild',wildRole:'oddball',wildStatus:{met:false}}),false);
  assert.equal(isCompletedOneTimeWildRole({kind:'wild',wildRole:'conservationist',wildStatus:{met:true}}),true);
  assert.ok(WILD_ROLE_IDS.every(roleId=>describeWildRoleType(roleId).length>20));
  assert.ok(WILD_ROLE_IDS.every(roleId=>!/unlock/i.test(describeWildRoleType(roleId))));
  assert.doesNotMatch(describeWildRoleType('bounty'),/Ava|Wen|targetIds/);
  assert.doesNotMatch(appSource,/unlockedWildPlan|\bwildPlan\b/,'the active player UI must have no Wild plan payload or rendering path');
  assert.match(appSource,/role\?\.kind==='wallfacer'\?role\.plan\?\.values:null/,'dial target markers must be exclusive to Wallfacers');
  assert.match(appSource,/wild-goal-complete-shell/,'completed one-time goals tint and simplify the player screen');
  assert.match(appSource,/wrapper-dial-indicator/,'Wrapper can identify dials already wrapped for its goal');
  assert.doesNotMatch(appSource,/Happens once|wild-timing-label/i,'standard Wild completion timing is not repeated on individual roles');
});

test('the public identity list reveals only Wallfacers',()=>{
  const players=[{id:'wf',name:'Ava'},{id:'wb',name:'Mara'},{id:'sq',name:'Shi'}];
  const roles={wf:{kind:'wallfacer',plan:{values:{red:4}}},wb:{kind:'wallbreaker',targetId:'wf'},sq:{kind:'police'}};
  assert.deepEqual(knownWallfacerNames(players,roles),['Ava']);
});

test('goal victories show dial movement, then light up, then end',()=>{
  const reveal={lightAt:4000,endsAt:5400};
  assert.equal(victoryRevealStage(reveal,3999),'dials');
  assert.equal(victoryRevealStage(reveal,4000),'light');
  assert.equal(victoryRevealStage(reveal,5399),'light');
  assert.equal(victoryRevealStage(reveal,5400),'ended');
  assert.equal(victoryRevealStage(null,5400),null);
});

test('role-specific dial limits are enforced',()=>{
  assert.equal(maxEffectFor({kind:'wallfacer'},'yellow'),1);
  assert.equal(maxEffectFor({kind:'wallbreaker'},'yellow'),1);
  assert.equal(maxEffectFor({kind:'police'},'yellow'),1);
  assert.equal(maxEffectFor({kind:'wild',wildRole:'loner'},'yellow'),1);
  assert.equal(maxEffectFor({kind:'wild',wildRole:'moderate',wildData:{}},'red'),1);
  assert.equal(maxEffectFor({kind:'wild',wildRole:'moderate',wildData:{}},'blue'),1);
  assert.equal(maxEffectFor({kind:'civilian',profession:'mathematics'},'yellow'),2);
  assert.equal(maxEffectFor({kind:'civilian',profession:'mathematics'},'blue'),1);
  assert.deepEqual(legalEffectsFor({kind:'civilian',profession:'mathematics'},'yellow'),[-2,-1,1,2]);
  assert.deepEqual(legalEffectsFor({kind:'wallfacer'},'yellow'),[-1,1]);
  assert.deepEqual(legalEffectsFor({kind:'wild',wildRole:'loner'},'yellow'),[-1,1]);
  assert.deepEqual(legalEffectsFor({kind:'wild',wildRole:'moderate',wildData:{}},'pink'),[-1,1]);
  assert.equal(isLegalSelection({kind:'wallfacer'},{color:'yellow',effect:0},[],'wf'),false,'passing with a zero move is illegal');
});

test('the simple Sophon rule permits exactly one action',()=>{
  const players=[{id:'breaker'},{id:'target'}];
  const role={kind:'wallbreaker',targetId:'target'};
  assert.equal(isLegalSelection(role,{sophonMode:'see'},players,'breaker'),true);
  assert.equal(isLegalSelection(role,{sophonMode:'affect',color:'blue',effect:1},players,'breaker'),true);
  assert.equal(isLegalSelection(role,{sophonMode:'see',color:'blue',effect:1},players,'breaker'),false);
  assert.equal(isLegalSelection(role,{sophonMode:'both',color:'blue',effect:1},players,'breaker'),false);
  assert.equal(isLegalSelection(role,{sophonMode:'affect',color:'blue',effect:2},players,'breaker'),false);
});

test('Police arrests require another real player and exclude a dial move',()=>{
  const players=[{id:'police'},{id:'target'}];
  const role={kind:'police'};
  assert.equal(isLegalSelection(role,{policeMode:'arrest',arrestTarget:'target'},players,'police'),true);
  assert.equal(isLegalSelection(role,{policeMode:'arrest',arrestTarget:'police'},players,'police'),false);
  assert.equal(isLegalSelection(role,{policeMode:'arrest',arrestTarget:'target',color:'red',effect:1},players,'police'),false);
});

test('selection locks are write-once',()=>{
  const selections={};
  assert.equal(tryLockSelection(selections,'p1',{color:'red',effect:1}),true);
  assert.equal(tryLockSelection(selections,'p1',{color:'blue',effect:-1}),false);
  assert.deepEqual(selections.p1,{color:'red',effect:1});
  assert.equal(tryLockSelection(selections,'p2',{color:'green',effect:9},selection=>Math.abs(selection.effect)<=2),false);
});

test('round resolution applies arrests, clamps dials, and records every action',()=>{
  const players=[{id:'wf',name:'Wen'},{id:'wb',name:'Bo'},{id:'police',name:'Shi'},{id:'civilian',name:'Miao'}];
  const roles={wf:{kind:'wallfacer'},wb:{kind:'wallbreaker',targetId:'wf'},police:{kind:'police'},civilian:{kind:'civilian',profession:'science'}};
  const dials=Object.fromEntries(COLORS.map(color=>[color,color==='blue'?9:5]));
  const selections={
    wf:{color:'yellow',effect:1,sophonMode:'affect',policeMode:'affect'},
    wb:{sophonMode:'see'},
    police:{policeMode:'arrest',arrestTarget:'wf'},
    civilian:{color:'blue',effect:2,sophonMode:'affect',policeMode:'affect'}
  };
  const result=resolveRoundState({dials,selections,players,roles,round:3});
  assert.equal(result.net.yellow,0);
  assert.equal(result.net.blue,2);
  assert.equal(result.after.blue,9);
  assert.equal(result.arrested.wf,true);
  assert.equal(result.record.round,3);
  assert.equal(result.record.actions.length,4);
  assert.deepEqual(result.record.actions.find(action=>action.playerId==='wb').action,{type:'spy',targetId:'wf'});
  assert.equal(dials.blue,9,'resolution must not mutate its input board');
});

test('Wrapper makes its touched dial wrap and keeps the power after three distinct wraps',()=>{
  const players=[{id:'wrapper',name:'Rae'},{id:'helper',name:'Miao'}];
  const roles={wrapper:{kind:'wild',team:'loyal',label:'Wrapper',wildRole:'wrapper',wildData:{}},helper:{kind:'civilian',profession:'mathematics'}};
  const board=(overrides={})=>Object.fromEntries(COLORS.map(color=>[color,overrides[color]??5]));
  const resolve=(round,dials,color,wrapperEffect,helperEffect)=>resolveRoundState({
    dials,players,roles,round,
    selections:{wrapper:{color,effect:wrapperEffect},helper:{color,effect:helperEffect}}
  });
  const low=resolve(1,board({yellow:0}),'yellow',-1,-2);
  assert.equal(low.net.yellow,-3);
  assert.equal(low.after.yellow,7,'0 − 3 wraps to 7 when Wrapper touches the dial');
  assert.deepEqual(low.wraps,[{playerId:'wrapper',color:'yellow',from:0,to:7,net:-3}]);
  const high=resolve(2,board({blue:9}),'blue',1,1);
  assert.equal(high.after.blue,1,'9 + 2 wraps to 1');
  const third=resolve(3,board({red:0}),'red',-1,-1);
  const result=evaluateWildRole({role:roles.wrapper,playerId:'wrapper',players,history:[low.record,high.record,third.record]});
  assert.equal(result.met,true);
  assert.equal(result.progress,3);
  assert.deepEqual(result.details.qualifyingDials.map(item=>item.color),['yellow','blue','red']);
  const afterCompletion=resolve(4,board({orange:9}),'orange',1,1);
  assert.equal(afterCompletion.after.orange,1,'the wrapping power remains active after the personal goal is complete');
  assert.equal(afterCompletion.wraps.length,1);

  const arrestedPlayers=[...players,{id:'police',name:'Shi'}];
  const arrestedRoles={...roles,police:{kind:'police'}};
  const arrested=resolveRoundState({dials:board({green:0}),players:arrestedPlayers,roles:arrestedRoles,round:5,selections:{
    wrapper:{color:'green',effect:-1},
    helper:{color:'green',effect:-2},
    police:{policeMode:'arrest',arrestTarget:'wrapper'}
  }});
  assert.equal(arrested.after.green,0,'a cancelled Wrapper move does not activate wrapping');
  assert.deepEqual(arrested.wraps,[]);
});

test('Moderate assignment carries no plan-derived dial data',()=>{
  const players=[{id:'wf',name:'Wen'},{id:'wb',name:'Bo'},{id:'police',name:'Shi'},{id:'specialist',name:'Miao'}];
  const roles={
    wf:{kind:'wallfacer',plan:{values:{yellow:4,orange:6,blue:2}}},
    wb:{kind:'wallbreaker',targetId:'wf'},
    police:{kind:'police'},
    specialist:{kind:'civilian',profession:'science'}
  };
  const randomValues=[0.25];
  const assignment=assignWildRoles({players,roles,dials:Object.fromEntries(COLORS.map(color=>[color,5])),random:()=>randomValues.shift()??0});
  const role=assignment.assignments[0].role;
  assert.equal(role.wildRole,'moderate');
  assert.deepEqual(role.wildData,{});
  assert.match(describeWildRole(role,players),/all six dials.*3–7/i);
});

test('Extremist receives the most extreme non-plan dial and its opposite endpoint',()=>{
  const players=[{id:'wf',name:'Wen'},{id:'wb',name:'Bo'},{id:'police',name:'Shi'},{id:'specialist',name:'Miao'}];
  const roles={
    wf:{kind:'wallfacer',plan:{values:{yellow:4,orange:6,blue:2}}},
    wb:{kind:'wallbreaker',targetId:'wf'},
    police:{kind:'police'},
    specialist:{kind:'civilian',profession:'science'}
  };
  const assign=(dials)=>{
    const randomValues=[0,0];
    return assignWildRoles({players,roles,dials,random:()=>randomValues.shift()??0}).assignments[0].role;
  };
  const high=assign({yellow:0,pink:3,orange:9,red:8,blue:0,green:6});
  assert.equal(high.wildRole,'extremist');
  assert.deepEqual(high.wildData,{color:'red',startingValue:8,targetValue:0});
  assert.match(describeWildRole(high,players),/opposite extreme, 0/);
  const low=assign({yellow:9,pink:1,orange:0,red:6,blue:9,green:5});
  assert.deepEqual(low.wildData,{color:'pink',startingValue:1,targetValue:9});
});

test('Bounty and Extremist evaluate from authoritative round history',()=>{
  const players=[{id:'wild',name:'Miao'},{id:'target',name:'Wen'},{id:'target2',name:'Bo'},{id:'police',name:'Shi'}];
  const board=(overrides={})=>Object.fromEntries(COLORS.map(color=>[color,overrides[color]??5]));
  const arrestRound={round:2,after:board(),actions:[
    {playerId:'police',kind:'police',action:{type:'arrest',targetId:'target'},arrested:false},
    {playerId:'target',action:{type:'move',color:'red',effect:1},arrested:true},
    {playerId:'wild',action:{type:'move',color:'blue',effect:-1},arrested:false}
  ]};
  const secondArrestRound={round:5,after:board(),actions:[
    {playerId:'police',kind:'police',action:{type:'arrest',targetId:'target2'},arrested:false},
    {playerId:'target2',action:{type:'move',color:'green',effect:1},arrested:true}
  ]};
  const bountyRole={kind:'wild',label:'Bounty',wildRole:'bounty',wildData:{targetIds:['target','target2']}};
  const incompleteBounty=evaluateWildRole({role:bountyRole,playerId:'wild',players,history:[arrestRound],initialDials:board(),finalDials:board(),winner:'Loyal team'});
  assert.equal(incompleteBounty.met,false);
  assert.equal(incompleteBounty.progress,1);
  assert.equal(incompleteBounty.goal,2);
  const bounty=evaluateWildRole({role:bountyRole,playerId:'wild',players,history:[arrestRound,secondArrestRound],initialDials:board(),finalDials:board(),winner:'Loyal team'});
  assert.equal(bounty.met,true);
  assert.equal(bounty.progress,2);
  assert.equal(bounty.goal,2);
  assert.match(bounty.objective,/both Wen and Bo/);
  assert.deepEqual(bounty.details.targets.map(target=>target.arrested),[true,true]);

  const quietRound={round:3,after:board(),actions:[
    {playerId:'police',kind:'police',action:{type:'move',color:'yellow',effect:1},arrested:false},
    {playerId:'wild',action:{type:'move',color:'green',effect:1},arrested:false}
  ]};
  const extremistRole={kind:'wild',label:'Extremist',wildRole:'extremist',wildData:{color:'green',startingValue:2,targetValue:9}};
  const extremeRound={round:4,after:board({green:9}),actions:[]};
  const extremistMovedAway=evaluateWildRole({role:extremistRole,playerId:'wild',players,history:[extremeRound],initialDials:board({green:2}),finalDials:board({green:7}),winner:'Loyal team'});
  assert.equal(extremistMovedAway.reachedOnce,true);
  assert.equal(extremistMovedAway.met,true,'Extremist stays complete after reaching the endpoint once, even if the dial later moves away');
  assert.equal(extremistMovedAway.progress,1);
  assert.equal(evaluateWildRole({role:extremistRole,playerId:'wild',players,history:[extremeRound],initialDials:board({green:2}),finalDials:board({green:9}),winner:'Loyal team'}).met,true);
  const wrongExtreme={round:4,after:board({green:0}),actions:[]};
  assert.equal(evaluateWildRole({role:extremistRole,playerId:'wild',players,history:[wrongExtreme],initialDials:board({green:2}),finalDials:board({green:0}),winner:'Loyal team'}).met,false,'the starting-side endpoint is not the Extremist target');
  assert.equal(evaluateWildRole({role:extremistRole,playerId:'wild',players,history:[quietRound],initialDials:board(),finalDials:board(),winner:'Wallbreaker'}).met,false);
});

test('Conservationist and Moderate latch after a qualifying board state',()=>{
  const players=[{id:'wild',name:'Miao'}];
  const board=(overrides={})=>Object.fromEntries(COLORS.map(color=>[color,overrides[color]??5]));
  const conservationist={kind:'wild',label:'Conservationist',wildRole:'conservationist',wildData:{}};
  assert.equal(evaluateWildRole({role:conservationist,playerId:'wild',players,initialDials:board(),finalDials:board(),history:[]}).met,false,'the starting board does not count');
  const earlyMatches=[1,2,3].map(round=>({round,after:board(),actions:[]}));
  assert.equal(evaluateWildRole({role:conservationist,playerId:'wild',players,history:earlyMatches,initialDials:board(),finalDials:board()}).met,false,'matching totals in the first three rounds do not count');
  const missesRoundFour={round:4,after:board({green:6}),actions:[]};
  assert.equal(evaluateWildRole({role:conservationist,playerId:'wild',players,history:[...earlyMatches,missesRoundFour],initialDials:board(),finalDials:missesRoundFour.after}).met,false,'an eligible round must match the total exactly');
  const matchesRoundFour={round:4,after:board(),actions:[]};
  const conservationCompleted=evaluateWildRole({role:conservationist,playerId:'wild',players,history:[...earlyMatches,matchesRoundFour,{round:5,after:board({green:9}),actions:[]}],initialDials:board(),finalDials:board({green:9})});
  assert.equal(conservationCompleted.met,true,'the goal stays complete after a later board moves away');
  assert.equal(conservationCompleted.progress,1);
  assert.equal(conservationCompleted.goal,1);
  assert.equal(conservationCompleted.details.qualifyingRound,4);

  const moderate={kind:'wild',label:'Moderate',wildRole:'moderate',wildData:{}};
  const outOfRange={round:1,after:board({yellow:2}),actions:[]};
  const startingMatch=evaluateWildRole({role:moderate,playerId:'wild',players,initialDials:board(),finalDials:board(),history:[]});
  assert.equal(startingMatch.met,true,'the starting board qualifies when all six values are in range');
  assert.equal(startingMatch.details.qualifyingRound,null);
  const inRange={round:2,after:board({yellow:3,pink:4,orange:5,red:6,blue:7,green:3}),actions:[]};
  const moderateCompleted=evaluateWildRole({role:moderate,playerId:'wild',players,history:[outOfRange,inRange,{round:3,after:board({green:8}),actions:[]}],initialDials:outOfRange.after,finalDials:board({green:8})});
  assert.equal(moderateCompleted.met,true,'all six dials being in range once permanently completes the goal');
  assert.equal(moderateCompleted.progress,1);
  assert.equal(moderateCompleted.goal,1);
  assert.equal(moderateCompleted.details.qualifyingRound,2);
  const missed=evaluateWildRole({role:moderate,playerId:'wild',players,history:[outOfRange],initialDials:outOfRange.after,finalDials:outOfRange.after});
  assert.equal(missed.met,false);
  assert.equal(missed.progress,0,'Moderate has no partial progress');
  assert.equal(missed.goal,1);
});

test('Disruptor needs a wrong-way move on each of the three hidden plan dials',()=>{
  const players=[{id:'wild',name:'Miao'}];
  const board=(overrides={})=>Object.fromEntries(COLORS.map(color=>[color,overrides[color]??5]));
  const attempt=(round,{color='red',before=5,effect=-1,arrested=false}={})=>({round,before:board({[color]:before}),after:board({[color]:before+effect}),actions:[
    {playerId:'wild',arrested,action:{type:'move',color,effect}}
  ]});
  const role={kind:'wild',label:'Disruptor',wildRole:'disruptor',wildData:{}};
  const planValues={red:7,blue:2,yellow:6};
  const result=evaluateWildRole({role,playerId:'wild',players,planValues,history:[
    attempt(1,{effect:1}),
    attempt(2,{color:'green',effect:-1}),
    attempt(3,{before:5,effect:-1}),
    attempt(4,{before:4,effect:-1}),
    attempt(5,{color:'blue',before:5,effect:1,arrested:true}),
    attempt(6,{color:'blue',before:5,effect:1}),
    attempt(7,{color:'yellow',before:5,effect:-1})
  ]});
  assert.equal(result.met,true);
  assert.equal(result.progress,3);
  assert.equal(result.goal,3);
  assert.deepEqual(result.details.qualifyingDials.map(move=>move.color),['red','blue','yellow']);
  const repeated=evaluateWildRole({role,playerId:'wild',players,planValues,history:[attempt(1,{before:5,effect:-1}),attempt(2,{before:4,effect:-1})]});
  assert.equal(repeated.met,false);
  assert.equal(repeated.progress,1,'repeating a wrong-way move on the same dial does not add progress');
  assert.equal(evaluateWildRole({role,playerId:'wild',players,planValues,history:[attempt(1,{effect:1}),attempt(2,{color:'green',effect:-1})]}).met,false,'toward-target and off-plan guesses do not add progress');
});

test('Loner needs four solitary rounds and cannot progress when arrested',()=>{
  const players=[{id:'wild',name:'Miao'},{id:'other',name:'Wen'}];
  const round=(number,ownColor,otherColor,{ownArrested=false,otherArrested=false}={})=>({round:number,actions:[
    {playerId:'wild',arrested:ownArrested,action:{type:'move',color:ownColor,effect:1}},
    {playerId:'other',arrested:otherArrested,action:{type:'move',color:otherColor,effect:-1}}
  ]});
  const role={kind:'wild',label:'Loner',wildRole:'loner',wildData:{}};
  const result=evaluateWildRole({role,playerId:'wild',players,history:[
    round(1,'blue','red'),round(2,'green','red'),round(3,'yellow','blue'),round(4,'pink','blue'),
    round(5,'orange','red',{ownArrested:true}),round(6,'red','red',{otherArrested:true})
  ]});
  assert.equal(result.met,true);
  assert.equal(result.progress,4,'an arrest of the Loner does not count, and a matching choice blocks progress even when the other move is cancelled');
  assert.equal(result.goal,4);
  assert.equal(evaluateWildRole({role,playerId:'wild',players,history:[round(1,'blue','red'),round(2,'green','red'),round(3,'yellow','blue')]}).met,false);
});

test('Oddball completes once after a resolved round has at least five odd dials',()=>{
  const players=[{id:'wild',name:'Miao'}];
  const board=values=>Object.fromEntries(COLORS.map((color,index)=>[color,values[index]]));
  const fiveOdd=board([1,3,5,7,9,0]);
  const fourOdd=board([1,3,5,7,8,0]);
  const sixOdd=board([1,3,5,7,9,1]);
  const role={kind:'wild',team:'loyal',label:'Oddball',wildRole:'oddball',wildData:{}};
  assert.equal(evaluateWildRole({role,playerId:'wild',players,initialDials:fiveOdd,finalDials:fiveOdd,history:[]}).met,false,'the untouched starting board does not count');
  const missed=evaluateWildRole({role,playerId:'wild',players,history:[{round:1,after:fourOdd,actions:[]}],finalDials:fourOdd});
  assert.equal(missed.met,false);
  assert.equal(missed.progress,0,'four odd dials are not partial progress');
  assert.equal(missed.goal,1);
  const completed=evaluateWildRole({role,playerId:'wild',players,history:[
    {round:1,after:fiveOdd,actions:[]},
    {round:2,after:fourOdd,actions:[]}
  ]});
  assert.equal(completed.met,true,'the one-time goal remains complete after the board moves away');
  assert.equal(completed.progress,1);
  assert.equal(completed.details.qualifyingRound,1);
  assert.deepEqual(completed.details.oddColors,['yellow','pink','orange','red','blue']);
  assert.match(completed.evidence,/goal is complete/);
  assert.equal(evaluateWildRole({role,playerId:'wild',players,history:[{round:1,after:sixOdd,actions:[]}]}).met,true,'six odd dials also satisfies at least five');
});

test('Numerologist completes once after any resolved board has three matching dials',()=>{
  const players=[{id:'wild',name:'Miao'}];
  const board=(overrides={})=>Object.fromEntries(COLORS.map((color,index)=>[color,overrides[color]??index]));
  const role={kind:'wild',team:'loyal',label:'Numerologist',wildRole:'numerologist',wildData:{}};
  const matching=board({yellow:5,pink:5,green:5});
  assert.equal(evaluateWildRole({role,playerId:'wild',players,initialDials:matching,finalDials:matching,history:[]}).met,false,'the untouched starting board does not count');
  const missed=evaluateWildRole({role,playerId:'wild',players,history:[{round:1,after:board({yellow:7,pink:7}),actions:[]}],finalDials:board({yellow:7,pink:7})});
  assert.equal(missed.met,false);
  assert.equal(missed.progress,0,'a two-way match is not partial progress');
  assert.equal(missed.goal,1);
  const completed=evaluateWildRole({role,playerId:'wild',players,history:[
    {round:1,after:matching,actions:[{playerId:'wild',arrested:true,action:{type:'move',color:'red',effect:1}}]},
    {round:2,after:board(),actions:[]}
  ],finalDials:board()});
  assert.equal(completed.met,true,'who acted and whether Numerologist was arrested do not affect a resolved-board match');
  assert.equal(completed.progress,1);
  assert.equal(completed.goal,1);
  assert.equal(completed.details.qualifyingRound,1);
  assert.equal(completed.details.number,5);
  assert.deepEqual(completed.details.colors,['yellow','pink','green']);
  assert.match(completed.evidence,/goal is complete/);
});

test('Wild players win iff their goal qualifies and the Wallfacer team wins',()=>{
  const players=[{id:'wild',name:'Miao'}];
  const role={kind:'wild',team:'loyal',label:'Loner',wildRole:'loner',wildData:{}};
  const roles={wild:role};
  const round=number=>({round:number,actions:[{playerId:'wild',arrested:false,action:{type:'move',color:COLORS[number-1],effect:1}}]});
  const history=[1,2,3,4].map(round);
  const planValues={yellow:2,red:7,blue:4};
  const incomplete=Object.fromEntries(COLORS.map(color=>[color,5]));
  const complete={...incomplete,...planValues};
  assert.equal(isStandardPlanComplete(incomplete,planValues),false);
  assert.equal(isStandardPlanComplete(complete,planValues),true);
  assert.equal(buildWildRoleResults(players,roles,{history,planValues,finalDials:incomplete,winner:'Loyal team'})[0].won,true,'an incorrect Wallbreaker guess gives a goal-qualified Wild player the Wallfacer-team co-win');
  assert.equal(buildWildRoleResults(players,roles,{history,planValues,finalDials:incomplete,winner:'Wallfacer team'})[0].won,true);
  assert.equal(buildWildRoleResults(players,roles,{history,planValues,finalDials:complete,winner:'Loyal team'})[0].won,true);
  assert.equal(buildWildRoleResults(players,roles,{history,planValues,finalDials:complete,winner:'Wallbreaker'})[0].won,false,'goal completion is not enough when the Wallfacer team loses');
  assert.equal(buildWildRoleResults(players,roles,{history,planValues,finalDials:complete})[0].won,false,'plan state alone cannot substitute for the Wallfacer-team result');
  assert.equal(buildWildRoleResults(players,roles,{history:history.slice(0,3),planValues,finalDials:complete,winner:'Loyal team'})[0].won,false);
});

test('Conservationist completion persists after the board moves away',()=>{
  const board=(overrides={})=>Object.fromEntries(COLORS.map(color=>[color,overrides[color]??5]));
  const players=[{id:'wild',name:'Miao'}];
  const role={kind:'wild',team:'loyal',label:'Conservationist',wildRole:'conservationist',wildData:{}};
  const roles={wild:role};
  const history=[
    {round:1,after:board({green:6}),actions:[]},
    {round:2,after:board({green:7}),actions:[]},
    {round:3,after:board({green:8}),actions:[]},
    {round:4,after:board(),actions:[]},
    {round:5,after:board({green:9}),actions:[]}
  ];
  const planValues={yellow:5,red:5,blue:5};
  const result=buildWildRoleResults(players,roles,{history,initialDials:board(),finalDials:board({green:9}),planValues,winner:'Loyal team'})[0];
  assert.equal(result.reachedOnce,true);
  assert.equal(result.met,true);
  assert.equal(result.won,true);
});

test('disconnected no-op selections appear explicitly in replay history',()=>{
  const players=[{id:'p1',name:'Offline'}];
  const result=resolveRoundState({dials:Object.fromEntries(COLORS.map(color=>[color,4])),selections:{p1:{systemSkipped:true}},players,roles:{p1:{kind:'civilian'}},round:1});
  assert.deepEqual(result.record.actions[0].action,{type:'skipped'});
  assert.ok(COLORS.every(color=>result.after[color]===4));
});

test('wall-break guesses require only the plan\'s three dial colors',()=>{
  const plan={orange:2,blue:7,red:5};
  assert.equal(isPlanFieldGuess(plan,['orange','blue','red']),true);
  assert.equal(isPlanFieldGuess(plan,['orange','blue','green']),false);
  assert.equal(isPlanFieldGuess(plan,['orange','blue']),false);
  assert.equal(isPlanFieldGuess(plan,['orange','blue','red','green']),false);
  assert.equal(isPlanFieldGuess(plan,['orange','blue','blue']),false);
});

test('roles and history stay private until the game ends',()=>{
  const players=[{id:'wf',name:'Wen'}];
  const roles={wf:{kind:'wallfacer',label:'Wallfacer',plan:{values:{red:4}}}};
  assert.equal(buildPostgameDisclosure('playing',players,roles,[],null),undefined);
  assert.equal(buildPostgameDisclosure('ended',players,roles,[{round:1}],null,{active:false}),undefined);
  const disclosure=buildPostgameDisclosure('ended',players,roles,[{round:1}],null,{active:true,roundIndex:0});
  assert.equal(disclosure.roles[0].plan.values.red,4);
  assert.equal(disclosure.history[0].round,1);
});

test('Wild Role setup and outcome stay private until the host begins the postgame reveal',()=>{
  const players=[{id:'wild',name:'Miao'},{id:'wf',name:'Wen'},{id:'wb',name:'Bo'},{id:'loner',name:'Yun'}];
  const roles={
    wild:{kind:'wild',team:'loyal',label:'Bounty',wildRole:'bounty',wildData:{targetIds:['wb','loner']}},
    wf:{kind:'wallfacer',label:'Wallfacer',plan:{values:{red:4}}},
    wb:{kind:'wallbreaker',label:'Wallbreaker',targetId:'wf',unoccupiedWildRole:'extremist'},
    loner:{kind:'wild',team:'loyal',label:'Loner',wildRole:'loner',wildData:{}}
  };
  const dials=Object.fromEntries(COLORS.map(color=>[color,5]));
  const history=[{round:1,before:dials,after:dials,actions:[{playerId:'wild',name:'Miao',kind:'wild',arrested:false,action:{type:'move',color:'blue',effect:1}}]}];
  const context={initialDials:dials,finalDials:dials,planValues:{red:4},winner:'Loyal team'};
  assert.equal(buildPostgameDisclosure('playing',players,roles,history,null,{active:false},'wf',context),undefined);
  assert.equal(buildPostgameDisclosure('ended',players,roles,history,null,{active:false},'wf',context),undefined);
  const disclosure=buildPostgameDisclosure('ended',players,roles,history,null,{active:true,roundIndex:0},'wf',context);
  assert.equal(disclosure.roles[0].wildRole,'bounty');
  assert.deepEqual(disclosure.roles[0].wildData.targetIds,['wb','loner']);
  assert.equal(disclosure.roles.find(role=>role.playerId==='wb').unoccupiedWildRole,'extremist');
  const bountyResult=disclosure.wildResults.find(result=>result.roleId==='bounty');
  assert.equal(bountyResult.met,false);
  assert.equal(bountyResult.won,false);
  assert.equal(bountyResult.name,'Miao');
  assert.equal(buildWildRoleResults(players,roles,{history,...context}).length,2);
});

test('postgame recap discloses only the host-selected round',()=>{
  const players=[{id:'wf',name:'Wen'}];
  const roles={wf:{kind:'wallfacer',label:'Wallfacer',plan:{values:{red:4}}}};
  const history=[{round:1,actions:[]},{round:2,actions:[]},{round:3,actions:[]}];
  const first=buildPostgameDisclosure('ended',players,roles,history,{correct:true},{active:true,roundIndex:0});
  assert.deepEqual(first.history.map(entry=>entry.round),[1]);
  assert.equal(first.finalGuess,null);
  assert.equal(first.recap.complete,false);
  const last=buildPostgameDisclosure('ended',players,roles,history,{correct:true},{active:true,roundIndex:2});
  assert.deepEqual(last.history.map(entry=>entry.round),[3]);
  assert.equal(last.finalGuess.correct,true);
  assert.equal(last.recap.complete,true);
});

test('arrest outcomes stay private during play but are revealed in the postgame recap',()=>{
  const players=[{id:'police',name:'Shi'},{id:'target',name:'Wen'},{id:'other',name:'Bo'}];
  const roles={police:{kind:'police'},target:{kind:'wallfacer'},other:{kind:'wallbreaker',targetId:'target'}};
  const history=[{
    round:1,
    actions:[
      {playerId:'police',name:'Shi',kind:'police',arrested:false,action:{type:'arrest',targetId:'target'}},
      {playerId:'target',name:'Wen',kind:'wallfacer',arrested:true,action:{type:'move',color:'red',effect:1}},
      {playerId:'other',name:'Bo',kind:'wallbreaker',arrested:false,action:{type:'move',color:'blue',effect:-1}}
    ]
  }];
  assert.deepEqual(privateArrestOutcome('target',roles.target,players,{target:true},history),{arrested:true});
  assert.deepEqual(privateArrestOutcome('police',roles.police,players,{target:true},history),{arrested:false,arrestedPlayerName:'Wen'});
  assert.deepEqual(privateArrestOutcome('other',roles.other,players,{target:true},history),{arrested:false});

  const recap={active:true,roundIndex:0};
  const policeView=buildPostgameDisclosure('ended',players,roles,history,null,recap,'police');
  const targetView=buildPostgameDisclosure('ended',players,roles,history,null,recap,'target');
  const otherView=buildPostgameDisclosure('ended',players,roles,history,null,recap,'other');
  const observerView=buildPostgameDisclosure('ended',players,roles,history,null,recap,null);
  assert.equal(policeView.history[0].actions[0].action.targetId,'target');
  assert.equal(targetView.history[0].actions[0].action.targetId,'target');
  assert.equal(otherView.history[0].actions[0].action.targetId,'target');
  assert.equal(otherView.history[0].actions[1].arrested,true);
  assert.equal(observerView.history[0].actions[0].action.targetId,'target');

  const policeMoveHistory=[{round:2,actions:[{playerId:'police',name:'Shi',kind:'police',arrested:false,action:{type:'move',color:'green',effect:1}}]}];
  const revealedPoliceMove=buildPostgameDisclosure('ended',players,roles,policeMoveHistory,null,recap,'other');
  assert.deepEqual(revealedPoliceMove.history[0].actions[0].action,{type:'move',color:'green',effect:1});

  const selections={police:{policeMode:'arrest',arrestTarget:'target'},other:{color:'blue',effect:-1}};
  const targetTutorial=buildTutorialDisclosure('tutorial',players,roles,selections,{},history,'target');
  const policeTutorial=buildTutorialDisclosure('tutorial',players,roles,selections,{},history,'police');
  const otherTutorial=buildTutorialDisclosure('tutorial',players,roles,selections,{},history,'other');
  assert.equal(targetTutorial.lockedMoves.some(move=>move.playerId==='police'),false,'target learns only after resolution');
  assert.equal(policeTutorial.lockedMoves.some(move=>move.playerId==='police'),true);
  assert.equal(targetTutorial.lastRound.actions[0].action.targetId,'target');
  assert.deepEqual(otherTutorial.lastRound.actions[0].action,{type:'private'});
});

test('tutorial disclosures are isolated from standard games',()=>{
  const players=[{id:'wf',name:'Wen'},{id:'wb',name:'Bo'}];
  const roles={
    wf:{kind:'wallfacer',label:'Wallfacer',plan:{values:{red:4,blue:2,pink:8}}},
    wb:{kind:'wallbreaker',label:'Wallbreaker',targetId:'wf'}
  };
  const selections={wb:{sophonMode:'see'}};
  assert.equal(buildTutorialDisclosure('standard',players,roles,selections,{}),undefined);
  const disclosure=buildTutorialDisclosure('tutorial',players,roles,selections,{wf:true},[{round:1,actions:[]}]);
  assert.equal(disclosure.roles[0].plan.values.red,4);
  assert.equal(disclosure.roles[1].targetId,'wf');
  assert.deepEqual(disclosure.readyPlayerIds,['wf']);
  assert.deepEqual(disclosure.lockedMoves,[{playerId:'wb',name:'Bo',selection:{sophonMode:'see'}}]);
  assert.equal(disclosure.lastRound.round,1);
});

console.log('\nAll regression groups passed');
