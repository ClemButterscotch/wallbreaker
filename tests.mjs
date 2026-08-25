import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hostModeForPath, hostStorageName } from './public/brand.js';
import {
  COLORS,
  MATHBREAKER_THRESHOLD,
  viewerAccess,
  clampDial,
  roleComposition,
  wildRoleComposition,
  WILD_ROLE_DEFINITIONS,
  WILD_ROLE_IDS,
  MAX_WILD_PLAYERS,
  assignWildRoles,
  describeWildRoleType,
  wildRoleTimingLabel,
  describeWildRole,
  evaluateWildRole,
  buildWildRoleResults,
  mathbreakerRoleComposition,
  knownWallfacerNames,
  mathbreakerDecayBudget,
  createMathbreakerDials,
  mathbreakerEffectFor,
  isLegalMathbreakerAdvancement,
  isLegalMathbreakerDecay,
  resolveMathbreakerAdvancement,
  resolveMathbreakerDecay,
  isMathbreakerPlanComplete,
  isMathbreakerGuessWindowOpen,
  validateMathbreakerGuess,
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

test('the rulebook ends with Wild Role primers and one slide per role',()=>{
  const wildSlideIds=[...rulebookHtml.matchAll(/id="rules-slide-wild-([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(wildSlideIds,['overview','unlock','information',...WILD_ROLE_IDS]);
  assert.doesNotMatch(rulebookHtml,/id="rules-slide-(?:example|observer)"/);
  const standardEnding=rulebookHtml.indexOf('id="rules-slide-finish"');
  assert.ok(wildSlideIds.every(slideId=>rulebookHtml.indexOf(`id="rules-slide-wild-${slideId}"`)>standardEnding));
  assert.match(rulebookHtml,/Wild Roles · On/);
  assert.match(rulebookHtml,/4–9 players/);
  assert.match(rulebookHtml,/it does not give Wild players their win/);
  assert.match(rulebookHtml,/Bounty · Extremist · Disruptor · Loner/);
  assert.match(rulebookHtml,/Conservationist · Moderate/);
  assert.doesNotMatch(rulebookHtml,/Doomsayer|Curator|Contrarian|Hermit|Must remain/i);
  assert.match(rulebookHtml,/Wild players never see the Wallfacer’s plan/);
  assert.doesNotMatch(rulebookHtml,/Wallfacer plan revealed|Plan targets revealed|See the exact Wallfacer plan/i);
  assert.doesNotMatch(rulebookHtml,/Combination unlocked/i);
});

test('host subpages select and isolate their game modes',()=>{
  assert.equal(hostModeForPath('/host'),'standard');
  assert.equal(hostModeForPath('/tutorial/host'),'tutorial');
  assert.equal(hostModeForPath('/mathbreaker/host'),'mathbreaker');
  assert.equal(hostModeForPath('/mathbreaker'),null);
  assert.notEqual(hostStorageName('/host'),hostStorageName('/tutorial/host'));
  assert.notEqual(hostStorageName('/host'),hostStorageName('/mathbreaker/host'));
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
  assert.deepEqual(wildRoleComposition(10,true),{wallfacers:1,wallbreakers:1,police:1,civilians:1,wilds:6});
  assert.deepEqual(WILD_ROLE_IDS,['bounty','extremist','conservationist','moderate','disruptor','loner']);
  assert.equal(MAX_WILD_PLAYERS,9);
});

test('Wild Role assignment preserves every core role and deals unique roles to every Specialist',()=>{
  const specialists=Array.from({length:6},(_,index)=>({id:`specialist${index+1}`,name:`Specialist ${index+1}`}));
  const players=[{id:'wf',name:'Wen'},{id:'wb',name:'Bo'},{id:'police',name:'Shi'},...specialists];
  const roles={
    wf:{kind:'wallfacer',label:'Wallfacer',plan:{values:{yellow:4,orange:6,blue:2}}},
    wb:{kind:'wallbreaker',label:'Wallbreaker',targetId:'wf'},
    police:{kind:'police',label:'Shi Qiang'},
    ...Object.fromEntries(specialists.map(player=>[player.id,{kind:'civilian',label:'Specialist',profession:'science'}]))
  };
  const dials=Object.fromEntries(COLORS.map(color=>[color,5]));
  const assignment=assignWildRoles({players,roles,dials,random:()=>0});
  assert.equal(assignment.assignments.length,6);
  assert.deepEqual(new Set(assignment.assignments.map(item=>item.role.wildRole)),new Set(WILD_ROLE_IDS));
  assert.ok(assignment.assignments.every(item=>item.role.team==='loyal'));
  assert.equal(Object.values(assignment.roles).filter(role=>role.kind==='wild').length,6);
  const bounty=assignment.assignments.find(item=>item.role.wildRole==='bounty');
  assert.equal(bounty.role.wildData.targetIds.length,2);
  assert.ok(bounty.role.wildData.targetIds.every(targetId=>!['police','wallfacer'].includes(roles[targetId].kind)));
  assert.deepEqual(assignment.roles.wf,roles.wf);
  assert.deepEqual(assignment.roles.wb,roles.wb);
  assert.deepEqual(assignment.roles.police,roles.police);
  assert.ok(specialists.every(player=>roles[player.id].kind==='civilian'),'assignment must not mutate the default role map');

  const fourPlayerRoles={wf:roles.wf,wb:roles.wb,police:roles.police,specialist1:roles.specialist1};
  const fourPlayerAssignment=assignWildRoles({players:players.slice(0,4),roles:fourPlayerRoles,dials,random:()=>0});
  assert.equal(fourPlayerAssignment.assignments.length,1);
  assert.notEqual(fourPlayerAssignment.assignments[0].role.wildRole,'bounty','Bounty must not be dealt when two valid non-Wallfacer targets do not exist');

  const noSpecialist=assignWildRoles({players:players.slice(0,3),roles:{wf:roles.wf,wb:roles.wb,police:roles.police},dials,random:()=>0});
  assert.deepEqual(noSpecialist.playerIds,[]);
  assert.equal(noSpecialist.roles.wf.kind,'wallfacer');
});

test('the public Wild Role guide describes every role without private setup data',()=>{
  assert.deepEqual(WILD_ROLE_IDS.filter(roleId=>WILD_ROLE_DEFINITIONS[roleId].timing==='one-time'),['bounty','extremist','disruptor','loner']);
  assert.deepEqual(WILD_ROLE_IDS.filter(roleId=>WILD_ROLE_DEFINITIONS[roleId].timing==='end-state'),['conservationist','moderate']);
  assert.equal(wildRoleTimingLabel('bounty'),'Happens once');
  assert.equal(wildRoleTimingLabel('extremist'),'Happens once');
  assert.equal(wildRoleTimingLabel('conservationist'),'At finish');
  assert.ok(WILD_ROLE_IDS.every(roleId=>describeWildRoleType(roleId).length>20));
  assert.ok(WILD_ROLE_IDS.every(roleId=>!/unlock/i.test(describeWildRoleType(roleId))));
  assert.doesNotMatch(describeWildRoleType('bounty'),/Ava|Wen|targetIds/);
  assert.doesNotMatch(appSource,/unlockedWildPlan|\bwildPlan\b/,'the active player UI must have no Wild plan payload or rendering path');
  assert.match(appSource,/role\?\.kind==='wallfacer'\?role\.plan\?\.values:null/,'dial target markers must be exclusive to Wallfacers');
});

test('Mathbreaker always assigns one Wallfacer, one Wallbreaker, and no Police',()=>{
  assert.deepEqual(mathbreakerRoleComposition(2),{wallfacers:1,wallbreakers:1,specialists:0,police:0});
  assert.deepEqual(mathbreakerRoleComposition(7),{wallfacers:1,wallbreakers:1,specialists:5,police:0});
  assert.equal(mathbreakerDecayBudget(7),6,'the Wallfacer counts as good and only the Wallbreaker is excluded');
});

test('the public identity list reveals only Wallfacers',()=>{
  const players=[{id:'wf',name:'Ava'},{id:'wb',name:'Mara'},{id:'sq',name:'Shi'}];
  const roles={wf:{kind:'wallfacer',plan:{values:{red:4}}},wb:{kind:'wallbreaker',targetId:'wf'},sq:{kind:'police'}};
  assert.deepEqual(knownWallfacerNames(players,roles),['Ava']);
});

test('Mathbreaker boards start between two and four with exactly seventeen points',()=>{
  for(const random of [()=>0,()=>0.999,()=>0.42]){
    const dials=createMathbreakerDials(random);
    assert.equal(Object.values(dials).reduce((sum,value)=>sum+value,0),17);
    assert.ok(Object.values(dials).every(value=>value>=2&&value<=4));
  }
});

test('Mathbreaker advancement respects Wallfacer and Specialist limits',()=>{
  const wallfacer={kind:'wallfacer'};
  const specialist={kind:'specialist',specialty:'blue'};
  assert.equal(mathbreakerEffectFor(wallfacer,'blue'),1);
  assert.equal(mathbreakerEffectFor(specialist,'blue'),2);
  assert.equal(mathbreakerEffectFor(specialist,'red'),1);
  assert.equal(isLegalMathbreakerAdvancement(wallfacer,{color:'blue',effect:1}),true);
  assert.equal(isLegalMathbreakerAdvancement(wallfacer,{color:'blue',effect:2}),false);
  assert.equal(isLegalMathbreakerAdvancement(specialist,{color:'blue',effect:2}),true);
  assert.equal(isLegalMathbreakerAdvancement(specialist,{color:'red',effect:2}),false);
});

test('Mathbreaker advancements resolve together before any precommitted decay',()=>{
  const players=[{id:'wf',name:'Wen'},{id:'wb',name:'Bo'},{id:'s',name:'Sal'}];
  const roles={wf:{kind:'wallfacer'},wb:{kind:'wallbreaker'},s:{kind:'specialist',specialty:'blue'}};
  const dials=Object.fromEntries(COLORS.map(color=>[color,3]));
  const result=resolveMathbreakerAdvancement({dials,selections:{wf:{color:'blue',effect:1},wb:{decays:['blue','blue']},s:{color:'blue',effect:2}},players,roles,round:1});
  assert.equal(result.after.blue,6);
  assert.equal(result.advancementNet.blue,3);
  assert.equal(dials.blue,3,'Mathbreaker advancement must not mutate its input board');
});

test('Mathbreaker decay uses the good-player count and can stack on one field',()=>{
  assert.equal(isLegalMathbreakerDecay({decays:['blue','blue','red']},3),true);
  assert.equal(isLegalMathbreakerDecay({decays:['blue','red']},3),false);
  const dials=Object.fromEntries(COLORS.map(color=>[color,6]));
  const result=resolveMathbreakerDecay({dials,decays:['blue','blue','red'],budget:3,round:1});
  assert.equal(result.after.blue,4);
  assert.equal(result.after.red,5);
  assert.equal(result.decayNet.blue,-2);
  assert.equal(dials.blue,6,'Mathbreaker decay must not mutate its input board');
});

test('Mathbreaker requires all three plan fields to remain at the threshold after decay',()=>{
  const dials={yellow:7,pink:8,orange:2,red:7,blue:4,green:3};
  assert.equal(isMathbreakerPlanComplete(dials,['yellow','pink','red'],MATHBREAKER_THRESHOLD),true);
  assert.equal(isMathbreakerPlanComplete({...dials,red:6},['yellow','pink','red'],MATHBREAKER_THRESHOLD),false);
});

test('Mathbreaker guesses are private candidates that cannot repeat or occur twice in a turn',()=>{
  const planFields=['yellow','blue','green'];
  const wrong=validateMathbreakerGuess({planFields,guessFields:['yellow','pink','green'],previousGuessKeys:[],lastGuessRound:null,round:2});
  assert.equal(wrong.valid,true);
  assert.equal(wrong.correct,false);
  const repeated=validateMathbreakerGuess({planFields,guessFields:['green','yellow','pink'],previousGuessKeys:[wrong.key],lastGuessRound:null,round:3});
  assert.equal(repeated.valid,false);
  const sameTurn=validateMathbreakerGuess({planFields,guessFields:planFields,previousGuessKeys:[],lastGuessRound:2,round:2});
  assert.equal(sameTurn.valid,false);
  const correct=validateMathbreakerGuess({planFields,guessFields:['green','yellow','blue'],previousGuessKeys:[],lastGuessRound:1,round:2});
  assert.equal(correct.valid,true);
  assert.equal(correct.correct,true);
});

test('Mathbreaker guessing stays available after decay is locked',()=>{
  const turn={mode:'mathbreaker',phase:'playing',paused:false,lastGuessRound:null,round:4};
  assert.equal(isMathbreakerGuessWindowOpen({...turn,decayLocked:true}),true,'decay locking is independent from guessing');
  assert.equal(isMathbreakerGuessWindowOpen({...turn,lastGuessRound:4}),false,'the second guess in a turn remains blocked');
  assert.equal(isMathbreakerGuessWindowOpen({...turn,phase:'math-reveal'}),false,'guessing closes once resolution begins');
});

test('role-specific dial limits are enforced',()=>{
  assert.equal(maxEffectFor({kind:'wallfacer'},'yellow'),1);
  assert.equal(maxEffectFor({kind:'wallbreaker'},'yellow'),1);
  assert.equal(maxEffectFor({kind:'police'},'yellow'),1);
  assert.equal(maxEffectFor({kind:'wild',wildRole:'loner'},'yellow'),1);
  assert.equal(maxEffectFor({kind:'wild',wildRole:'moderate',wildData:{colors:['pink','red','green']}},'red'),2);
  assert.equal(maxEffectFor({kind:'wild',wildRole:'moderate',wildData:{colors:['pink','red','green']}},'blue'),1);
  assert.equal(maxEffectFor({kind:'civilian',profession:'mathematics'},'yellow'),2);
  assert.equal(maxEffectFor({kind:'civilian',profession:'mathematics'},'blue'),1);
  assert.deepEqual(legalEffectsFor({kind:'civilian',profession:'mathematics'},'yellow'),[-2,-1,1,2]);
  assert.deepEqual(legalEffectsFor({kind:'wallfacer'},'yellow'),[-1,1]);
  assert.deepEqual(legalEffectsFor({kind:'wild',wildRole:'loner'},'yellow'),[-1,1]);
  assert.deepEqual(legalEffectsFor({kind:'wild',wildRole:'moderate',wildData:{colors:['pink','red','green']}},'pink'),[-2,-1,1,2]);
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

test('Moderate assignment derives exactly the three dials outside the Wallfacer plan',()=>{
  const players=[{id:'wf',name:'Wen'},{id:'wb',name:'Bo'},{id:'police',name:'Shi'},{id:'specialist',name:'Miao'}];
  const roles={
    wf:{kind:'wallfacer',plan:{values:{yellow:4,orange:6,blue:2}}},
    wb:{kind:'wallbreaker',targetId:'wf'},
    police:{kind:'police'},
    specialist:{kind:'civilian',profession:'science'}
  };
  const randomValues=[0.5];
  const assignment=assignWildRoles({players,roles,dials:Object.fromEntries(COLORS.map(color=>[color,5])),random:()=>randomValues.shift()??0});
  const role=assignment.assignments[0].role;
  assert.equal(role.wildRole,'moderate');
  assert.deepEqual(role.wildData.colors,['pink','red','green']);
  assert.match(describeWildRole(role,players),/pink, red, green/);
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

test('Conservationist and Moderate are evaluated from the board at the finish',()=>{
  const players=[{id:'wild',name:'Miao'}];
  const board=(overrides={})=>Object.fromEntries(COLORS.map(color=>[color,overrides[color]??5]));
  const conservationist={kind:'wild',label:'Conservationist',wildRole:'conservationist',wildData:{}};
  assert.equal(evaluateWildRole({role:conservationist,playerId:'wild',players,initialDials:board(),finalDials:board({green:8})}).met,false,'the starting board does not satisfy the goal before a round completes');
  const withinThree={round:1,after:board({green:8}),actions:[]};
  const conservationMovedOut=evaluateWildRole({role:conservationist,playerId:'wild',players,history:[withinThree],initialDials:board(),finalDials:board({green:9})});
  assert.equal(conservationMovedOut.reachedOnce,true);
  assert.equal(conservationMovedOut.met,false,'the final total must still be inside the range');
  assert.equal(conservationMovedOut.progress,4);
  assert.equal(conservationMovedOut.details.qualifyingRound,1);
  assert.match(conservationMovedOut.evidence,/must return/);
  assert.equal(evaluateWildRole({role:conservationist,playerId:'wild',players,history:[withinThree],initialDials:board(),finalDials:board({green:8})}).met,true);
  assert.equal(evaluateWildRole({role:conservationist,playerId:'wild',players,history:[{round:1,after:board({green:9}),actions:[]}],initialDials:board(),finalDials:board({green:9})}).met,false);

  const moderate={kind:'wild',label:'Moderate',wildRole:'moderate',wildData:{colors:['pink','red','green']}};
  assert.equal(evaluateWildRole({role:moderate,playerId:'wild',players,initialDials:board(),finalDials:board({pink:4,red:5,green:6})}).met,false,'Moderate requires at least one completed round');
  const inRangeRound={round:2,after:board({pink:4,red:5,green:6}),actions:[]};
  const moderateMovedOut=evaluateWildRole({role:moderate,playerId:'wild',players,history:[inRangeRound],initialDials:board(),finalDials:board({pink:3,red:5,green:6})});
  assert.equal(moderateMovedOut.reachedOnce,true);
  assert.equal(moderateMovedOut.met,false,'all three Moderate dials must be in range at the finish');
  assert.equal(evaluateWildRole({role:moderate,playerId:'wild',players,history:[inRangeRound],initialDials:board(),finalDials:board({pink:4,red:5,green:6})}).met,true);
  const missed=evaluateWildRole({role:moderate,playerId:'wild',players,history:[{round:1,after:board({pink:3,red:5,green:6}),actions:[]}],initialDials:board(),finalDials:board({pink:3,red:5,green:6})});
  assert.equal(missed.met,false);
  assert.equal(missed.progress,2);
  assert.equal(missed.goal,3);
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

test('Wild players win only when their goal qualifies and the Wallfacer completes the plan',()=>{
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
  assert.equal(buildWildRoleResults(players,roles,{history,planValues,finalDials:incomplete,winner:'Loyal team'})[0].won,false,'a Loyal result from an incorrect Wallbreaker guess is not enough');
  assert.equal(buildWildRoleResults(players,roles,{history,planValues,finalDials:complete,winner:'Loyal team'})[0].won,true);
  assert.equal(buildWildRoleResults(players,roles,{history:history.slice(0,3),planValues,finalDials:complete,winner:'Loyal team'})[0].won,false);
});

test('at-finish goals can be reached earlier but are decided by the final board',()=>{
  const board=(overrides={})=>Object.fromEntries(COLORS.map(color=>[color,overrides[color]??5]));
  const players=[{id:'wild',name:'Miao'}];
  const role={kind:'wild',team:'loyal',label:'Conservationist',wildRole:'conservationist',wildData:{}};
  const roles={wild:role};
  const history=[{round:1,after:board({green:8}),actions:[]}];
  const planValues={yellow:5,red:5,blue:5};
  const movedOut=buildWildRoleResults(players,roles,{history,initialDials:board(),finalDials:board({green:9}),planValues})[0];
  assert.equal(movedOut.reachedOnce,true);
  assert.equal(movedOut.met,false);
  assert.equal(movedOut.won,false);
  const restored=buildWildRoleResults(players,roles,{history,initialDials:board(),finalDials:board({green:8}),planValues})[0];
  assert.equal(restored.met,true);
  assert.equal(restored.won,true);
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
    wb:{kind:'wallbreaker',label:'Wallbreaker',targetId:'wf'},
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
  const bountyResult=disclosure.wildResults.find(result=>result.roleId==='bounty');
  assert.equal(bountyResult.met,false);
  assert.equal(bountyResult.won,false);
  assert.equal(bountyResult.name,'Miao');
  assert.equal(buildWildRoleResults(players,roles,{history,...context}).length,2);
});

test('Mathbreaker plans and specialties stay private until the game ends',()=>{
  const players=[{id:'wf',name:'Wen'},{id:'s',name:'Ada'}];
  const roles={
    wf:{kind:'wallfacer',label:'Wallfacer',plan:{fields:['yellow','blue','green'],threshold:7}},
    s:{kind:'specialist',label:'Specialist',specialty:'blue'}
  };
  assert.equal(buildPostgameDisclosure('playing',players,roles,[],null),undefined);
  const disclosure=buildPostgameDisclosure('ended',players,roles,[],null,{active:true,roundIndex:0});
  assert.deepEqual(disclosure.roles[0].plan.fields,['yellow','blue','green']);
  assert.equal(disclosure.roles[1].specialty,'blue');
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
