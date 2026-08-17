import assert from 'node:assert/strict';
import {
  COLORS,
  MATHBREAKER_THRESHOLD,
  clampDial,
  roleComposition,
  mathbreakerRoleComposition,
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
  isExactPlanGuess,
  buildPostgameDisclosure,
  buildTutorialDisclosure
} from './public/game-rules.js';

const test=(name,fn)=>{
  try { fn(); console.log(`✓ ${name}`); }
  catch(error){ console.error(`✗ ${name}`); throw error; }
};

test('dial values clamp to the zero-to-nine board',()=>{
  assert.equal(clampDial(-2),0);
  assert.equal(clampDial(11),9);
  assert.equal(clampDial(5),5);
});

test('role composition accounts for every player and optional Police',()=>{
  assert.deepEqual(roleComposition(0,1,true),{wallfacers:0,wallbreakers:0,police:0,civilians:0});
  assert.deepEqual(roleComposition(2,1,true),{wallfacers:1,wallbreakers:1,police:0,civilians:0});
  assert.deepEqual(roleComposition(7,2,true),{wallfacers:2,wallbreakers:2,police:1,civilians:2});
  assert.deepEqual(roleComposition(7,2,false),{wallfacers:2,wallbreakers:2,police:0,civilians:3});
  assert.deepEqual(roleComposition(4,99,true),{wallfacers:2,wallbreakers:2,police:0,civilians:0});
});

test('Mathbreaker always assigns one Wallfacer, one Wallbreaker, and no Police',()=>{
  assert.deepEqual(mathbreakerRoleComposition(2),{wallfacers:1,wallbreakers:1,specialists:0,police:0});
  assert.deepEqual(mathbreakerRoleComposition(7),{wallfacers:1,wallbreakers:1,specialists:5,police:0});
  assert.equal(mathbreakerDecayBudget(7),6,'the Wallfacer counts as good and only the Wallbreaker is excluded');
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
  assert.equal(maxEffectFor({kind:'civilian',profession:'mathematics'},'yellow'),2);
  assert.equal(maxEffectFor({kind:'civilian',profession:'mathematics'},'blue'),1);
  assert.deepEqual(legalEffectsFor({kind:'civilian',profession:'mathematics'},'yellow'),[-2,-1,0,1,2]);
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

test('disconnected no-op selections appear explicitly in replay history',()=>{
  const players=[{id:'p1',name:'Offline'}];
  const result=resolveRoundState({dials:Object.fromEntries(COLORS.map(color=>[color,4])),selections:{p1:{systemSkipped:true}},players,roles:{p1:{kind:'civilian'}},round:1});
  assert.deepEqual(result.record.actions[0].action,{type:'skipped'});
  assert.ok(COLORS.every(color=>result.after[color]===4));
});

test('wall-break guesses require the exact three dials and values',()=>{
  const plan={orange:2,blue:7,red:5};
  assert.equal(isExactPlanGuess(plan,{orange:2,blue:7,red:5}),true);
  assert.equal(isExactPlanGuess(plan,{orange:2,blue:6,red:5}),false);
  assert.equal(isExactPlanGuess(plan,{orange:2,blue:7,red:5,green:1}),false);
});

test('roles and history stay private until the game ends',()=>{
  const players=[{id:'wf',name:'Wen'}];
  const roles={wf:{kind:'wallfacer',label:'Wallfacer',plan:{values:{red:4}}}};
  assert.equal(buildPostgameDisclosure('playing',players,roles,[],null),undefined);
  const disclosure=buildPostgameDisclosure('ended',players,roles,[{round:1}],null);
  assert.equal(disclosure.roles[0].plan.values.red,4);
  assert.equal(disclosure.history[0].round,1);
});

test('Mathbreaker plans and specialties stay private until the game ends',()=>{
  const players=[{id:'wf',name:'Wen'},{id:'s',name:'Ada'}];
  const roles={
    wf:{kind:'wallfacer',label:'Wallfacer',plan:{fields:['yellow','blue','green'],threshold:7}},
    s:{kind:'specialist',label:'Specialist',specialty:'blue'}
  };
  assert.equal(buildPostgameDisclosure('playing',players,roles,[],null),undefined);
  const disclosure=buildPostgameDisclosure('ended',players,roles,[],null);
  assert.deepEqual(disclosure.roles[0].plan.fields,['yellow','blue','green']);
  assert.equal(disclosure.roles[1].specialty,'blue');
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
