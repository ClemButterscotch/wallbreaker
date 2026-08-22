export const COLORS = ['yellow','pink','orange','red','blue','green'];
export const SUBJECTS = {mathematics:['yellow','pink'],agriculture:['orange','red'],science:['blue','green']};
export const MATHBREAKER_FIELDS = {
  yellow:'Panopticon Theory',
  pink:'Far Lands Theory',
  orange:'Logic',
  red:'Algebra',
  blue:'Lemon Theory',
  green:'Game Theory'
};
export const MATHBREAKER_THRESHOLD = 7;

export function clampDial(value){
  return Math.max(0,Math.min(9,value));
}

export function roleComposition(playerCount){
  const count=Math.max(0,Number(playerCount)||0);
  if(count<2) return {wallfacers:0,wallbreakers:0,police:0,civilians:count};
  const wallfacers=1;
  const wallbreakers=1;
  const remaining=Math.max(0,count-wallfacers-wallbreakers);
  const police=remaining>0?1:0;
  return {wallfacers,wallbreakers,police,civilians:remaining-police};
}

export function mathbreakerRoleComposition(playerCount){
  const count=Math.max(0,Number(playerCount)||0);
  return {
    wallfacers:count>=1?1:0,
    wallbreakers:count>=2?1:0,
    specialists:Math.max(0,count-2),
    police:0
  };
}

export function mathbreakerDecayBudget(playerCount){
  return Math.max(0,(Number(playerCount)||0)-1);
}

export function createMathbreakerDials(random=Math.random){
  const values=Object.fromEntries(COLORS.map(color=>[color,2]));
  for(let remaining=5;remaining>0;remaining--){
    const available=COLORS.filter(color=>values[color]<4);
    const index=Math.min(available.length-1,Math.floor(random()*available.length));
    values[available[index]]++;
  }
  return values;
}

export function mathbreakerEffectFor(role,color){
  if(!COLORS.includes(color)) return null;
  if(role?.kind==='wallfacer') return 1;
  if(role?.kind==='specialist') return role.specialty===color?2:1;
  return null;
}

export function isLegalMathbreakerAdvancement(role,selection){
  if(!role||!selection||!COLORS.includes(selection.color)) return false;
  return selection.effect===mathbreakerEffectFor(role,selection.color);
}

export function isLegalMathbreakerDecay(selection,budget){
  return Array.isArray(selection?.decays)
    && selection.decays.length===budget
    && selection.decays.every(color=>COLORS.includes(color));
}

export function resolveMathbreakerAdvancement({dials,selections,players,roles,round}){
  const before={...dials};
  const advancementNet=Object.fromEntries(COLORS.map(color=>[color,0]));
  const actions=[];
  for(const player of players){
    const role=roles[player.id];
    if(role?.kind==='wallbreaker') continue;
    const selection=selections[player.id]||{};
    if(selection.systemSkipped){
      actions.push({playerId:player.id,name:player.name,kind:role?.kind,action:{type:'skipped'}});
      continue;
    }
    if(!isLegalMathbreakerAdvancement(role,selection)) throw new Error(`Illegal Mathbreaker advancement for ${player.id}`);
    advancementNet[selection.color]+=selection.effect;
    actions.push({playerId:player.id,name:player.name,kind:role.kind,action:{type:'advance',color:selection.color,effect:selection.effect}});
  }
  const after=Object.fromEntries(COLORS.map(color=>[color,clampDial(before[color]+advancementNet[color])]));
  return {before,after,advancementNet,actions,round};
}

export function resolveMathbreakerDecay({dials,decays,budget,round}){
  if(!isLegalMathbreakerDecay({decays},budget)) throw new Error('Illegal Mathbreaker decay assignment');
  const before={...dials};
  const decayNet=Object.fromEntries(COLORS.map(color=>[color,0]));
  for(const color of decays) decayNet[color]--;
  const after=Object.fromEntries(COLORS.map(color=>[color,clampDial(before[color]+decayNet[color])]));
  return {before,after,decayNet,decays:[...decays],round};
}

export function isMathbreakerPlanComplete(dials,fields,threshold=MATHBREAKER_THRESHOLD){
  return Array.isArray(fields)&&fields.length===3&&fields.every(field=>COLORS.includes(field)&&dials[field]>=threshold);
}

export function mathbreakerGuessKey(fields){
  if(!Array.isArray(fields)||fields.length!==3||new Set(fields).size!==3||!fields.every(field=>COLORS.includes(field))) return null;
  return [...fields].sort().join(',');
}

export function isMathbreakerGuessWindowOpen({mode,phase,paused,lastGuessRound,round}){
  return mode==='mathbreaker'
    && phase==='playing'
    && !paused
    && lastGuessRound!==round;
}

export function validateMathbreakerGuess({planFields,guessFields,previousGuessKeys=[],lastGuessRound,round}){
  const key=mathbreakerGuessKey(guessFields);
  if(!key) return {valid:false,correct:false,error:'Choose exactly three different fields.'};
  if(lastGuessRound===round) return {valid:false,correct:false,error:'Only one guess is allowed each turn.'};
  if(previousGuessKeys.includes(key)) return {valid:false,correct:false,error:'That combination has already been guessed.'};
  return {valid:true,correct:key===mathbreakerGuessKey(planFields),key};
}

export function maxEffectFor(role,color){
  if(role?.kind==='wallfacer'||role?.kind==='wallbreaker'||role?.kind==='police') return 1;
  if(role?.kind==='civilian'&&!SUBJECTS[role.profession]?.includes(color)) return 1;
  return 2;
}

export function legalEffectsFor(role,color){
  return maxEffectFor(role,color)===2?[-2,-1,0,1,2]:[-1,0,1];
}

export function isLegalSelection(role,selection,players,playerId){
  if(!role||!selection) return false;
  if(role.kind==='wallbreaker'){
    if(selection.sophonMode==='see') return selection.color==null&&selection.effect==null;
    if(selection.sophonMode!=='affect') return false;
  }
  if(role.kind==='police'){
    if(selection.policeMode==='arrest') return selection.color==null&&selection.effect==null&&Boolean(selection.arrestTarget&&players.some(player=>player.id===selection.arrestTarget&&player.id!==playerId));
    if(selection.policeMode!=='affect') return false;
  }
  if(!COLORS.includes(selection.color)) return false;
  return legalEffectsFor(role,selection.color).includes(selection.effect);
}

export function tryLockSelection(selections,playerId,selection,validator=()=>true){
  if(selections[playerId]||!validator(selection)) return false;
  selections[playerId]=selection;
  return true;
}

export function resolveRoundState({dials,selections,players,roles,round}){
  const before={...dials};
  const entries=Object.entries(selections);
  const arrest=entries.map(([,selection])=>selection).find(selection=>selection?.policeMode==='arrest');
  const arrested={};
  if(arrest?.arrestTarget&&players.some(player=>player.id===arrest.arrestTarget)) arrested[arrest.arrestTarget]=true;
  const net=Object.fromEntries(COLORS.map(color=>[color,0]));
  for(const [playerId,selection] of entries){
    if(selection.color&&!arrested[playerId]) net[selection.color]+=selection.effect;
  }
  const after=Object.fromEntries(COLORS.map(color=>[color,clampDial(before[color]+net[color])]));
  const actions=players.map(player=>{
    const selection=selections[player.id]||{};
    const action=selection.systemSkipped
      ? {type:'skipped'}
      : selection.sophonMode==='see'
        ? {type:'spy',targetId:roles[player.id]?.targetId}
        : selection.policeMode==='arrest'
          ? {type:'arrest',targetId:selection.arrestTarget}
          : {type:'move',color:selection.color,effect:selection.effect};
    return {playerId:player.id,name:player.name,kind:roles[player.id]?.kind,arrested:!!arrested[player.id],action};
  });
  return {before,after,net,arrested,record:{round,before,after:{...after},net:{...net},actions}};
}

export function isPlanFieldGuess(planValues,guessColors){
  if(!Array.isArray(guessColors)||guessColors.length!==3||new Set(guessColors).size!==3||!guessColors.every(color=>COLORS.includes(color))) return false;
  const guessed=[...guessColors].sort().join(',');
  const actual=Object.keys(planValues||{}).sort().join(',');
  return guessed===actual;
}

export function privateArrestOutcome(playerId,role,players,arrested,history=[]){
  const outcome={arrested:Boolean(arrested?.[playerId])};
  if(role?.kind!=='police') return outcome;
  const policeAction=history.at(-1)?.actions?.find(item=>item.playerId===playerId)?.action;
  if(policeAction?.type!=='arrest') return outcome;
  outcome.arrestedPlayerName=players.find(player=>player.id===policeAction.targetId)?.name||'Unknown player';
  return outcome;
}

function privateHistoryForViewer(history,roles,viewerId){
  return (history||[]).map(entry=>{
    const policeAction=entry.actions?.find(item=>roles[item.playerId]?.kind==='police');
    if(!policeAction||viewerId===policeAction.playerId||(policeAction.action?.type==='arrest'&&viewerId===policeAction.action.targetId)) return entry;
    return {
      ...entry,
      actions:entry.actions.map(item=>({
        ...item,
        arrested:false,
        action:roles[item.playerId]?.kind==='police'?{type:'private'}:item.action
      }))
    };
  });
}

export function buildPostgameDisclosure(phase,players,roles,history,finalGuess,recap,viewerId=null){
  if(phase!=='ended'||recap?.active!==true) return undefined;
  const completedRounds=history||[];
  const roundIndex=Math.max(0,Math.min(Number(recap.roundIndex)||0,Math.max(0,completedRounds.length-1)));
  const complete=completedRounds.length===0||roundIndex===completedRounds.length-1;
  return {
    roles:players.map(player=>{
      const role=roles[player.id]||{};
      return {playerId:player.id,name:player.name,kind:role.kind,label:role.label,profession:role.profession,specialty:role.specialty,plan:role.plan,targetId:role.targetId};
    }),
    history:completedRounds[roundIndex]?[completedRounds[roundIndex]]:[],
    finalGuess:complete?(finalGuess||null):null,
    recap:{roundIndex,totalRounds:completedRounds.length,complete}
  };
}

export function buildTutorialDisclosure(mode,players,roles,selections,tutorialReady,history=[],viewerId=null){
  if(mode!=='tutorial') return undefined;
  return {
    readyPlayerIds:Object.keys(tutorialReady||{}),
    roles:players.map(player=>{
      const role=roles[player.id]||{};
      return {playerId:player.id,name:player.name,kind:role.kind,label:role.label,profession:role.profession,plan:role.plan,targetId:role.targetId};
    }),
    lockedMoves:players.filter(player=>selections[player.id]&&(roles[player.id]?.kind!=='police'||player.id===viewerId)).map(player=>({
      playerId:player.id,
      name:player.name,
      selection:{...selections[player.id]}
    })),
    lastRound:privateHistoryForViewer(history,roles,viewerId).at(-1)||null
  };
}
