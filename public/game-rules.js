export const COLORS = ['yellow','pink','orange','red','blue','green'];
export const SUBJECTS = {mathematics:['yellow','pink'],agriculture:['orange','red'],science:['blue','green']};
export function viewerAccess({isHost=false,adminPlaying=false,playerId=null}={}){
  const observer=Boolean(isHost&&!adminPlaying);
  return {observer,player:!observer,viewerId:observer?null:(playerId||null)};
}
export const WILD_ROLE_DEFINITIONS = Object.freeze({
  bounty:{label:'Bounty',timing:'one-time'},
  extremist:{label:'Extremist',timing:'one-time'},
  conservationist:{label:'Conservationist',timing:'one-time'},
  moderate:{label:'Moderate',timing:'one-time'},
  disruptor:{label:'Disruptor',timing:'one-time'},
  loner:{label:'Loner',timing:'one-time'},
  oddball:{label:'Oddball',timing:'one-time'},
  numerologist:{label:'Numerologist',timing:'one-time'},
  wrapper:{label:'Wrapper',timing:'one-time'}
});
export const WILD_ROLE_IDS = Object.freeze(Object.keys(WILD_ROLE_DEFINITIONS));
export const MAX_WILD_PLAYERS = WILD_ROLE_IDS.length+2;

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

export function wildRoleComposition(playerCount,enabled=false){
  const composition=roleComposition(playerCount);
  const wilds=enabled?Math.min(composition.civilians,WILD_ROLE_IDS.length-1):0;
  return {...composition,civilians:composition.civilians-wilds,wilds};
}

function randomItem(items,random=Math.random){
  if(!items.length) return undefined;
  const value=Number(random());
  const index=Math.max(0,Math.min(items.length-1,Math.floor((Number.isFinite(value)?value:0)*items.length)));
  return items[index];
}

function createWildRole({wildRole,player,players,roles,dials,random}){
  const definition=WILD_ROLE_DEFINITIONS[wildRole];
  const wildData={};
  if(wildRole==='bounty'){
    const targets=players.filter(candidate=>candidate.id!==player.id&&!['police','wallfacer'].includes(roles[candidate.id]?.kind));
    const firstTarget=randomItem(targets,random);
    const secondTarget=randomItem(targets.filter(candidate=>candidate.id!==firstTarget?.id),random);
    wildData.targetIds=[firstTarget?.id,secondTarget?.id].filter(Boolean);
  }
  if(wildRole==='extremist'){
    const wallfacer=Object.values(roles).find(role=>role?.kind==='wallfacer'&&role.plan?.values);
    const outsidePlan=COLORS.filter(color=>!Object.hasOwn(wallfacer?.plan?.values||{},color));
    const eligible=outsidePlan.length?outsidePlan:COLORS;
    const distanceFromCenter=color=>Math.abs(Number(dials[color])-4.5);
    const greatestDistance=Math.max(...eligible.map(distanceFromCenter));
    const mostExtreme=eligible.filter(color=>distanceFromCenter(color)===greatestDistance);
    const color=randomItem(mostExtreme,random);
    const startingValue=clampDial(Number(dials[color]));
    Object.assign(wildData,{color,startingValue,targetValue:startingValue<=4?9:0});
  }
  return {kind:'wild',team:'loyal',label:definition.label,wildRole,wildData};
}

export function assignWildRoles({players=[],roles={},dials={},random=Math.random}={}){
  const candidates=players.filter(player=>roles[player.id]?.kind==='civilian');
  let available=[...WILD_ROLE_IDS];
  let nextRoles={...roles};
  const assignments=[];
  for(const player of candidates.slice(0,WILD_ROLE_IDS.length-1)){
    const bountyTargets=players.filter(candidate=>candidate.id!==player.id&&!['police','wallfacer'].includes(roles[candidate.id]?.kind));
    const eligible=available.filter(roleId=>roleId!=='bounty'||bountyTargets.length>=2);
    const wildRole=randomItem(eligible,random);
    if(!wildRole) continue;
    const role=createWildRole({wildRole,player,players,roles,dials,random});
    nextRoles={...nextRoles,[player.id]:role};
    assignments.push({playerId:player.id,role});
    available=available.filter(roleId=>roleId!==wildRole);
  }
  const occupied=new Set(assignments.map(assignment=>assignment.role.wildRole));
  const unoccupied=WILD_ROLE_IDS.filter(roleId=>!occupied.has(roleId));
  const unoccupiedWildRole=randomItem(unoccupied,random);
  nextRoles=Object.fromEntries(Object.entries(nextRoles).map(([playerId,role])=>{
    if(role?.kind!=='wallbreaker') return [playerId,role];
    const {unoccupiedWildRole:previousClue,...baseRole}=role;
    return [playerId,unoccupiedWildRole?{...baseRole,unoccupiedWildRole}:baseRole];
  }));
  return {roles:nextRoles,playerIds:assignments.map(assignment=>assignment.playerId),assignments,unoccupiedWildRole:unoccupiedWildRole||null};
}

export function describeWildRoleType(roleId){
  if(roleId==='bounty') return 'Have both secret targets arrested at least once each.';
  if(roleId==='extremist') return 'Get an assigned non-plan dial to its opposite extreme at least once.';
  if(roleId==='conservationist') return 'On round 4 or later, finish a round with the six-dial total equal to its starting total.';
  if(roleId==='moderate') return 'Have all six dials in the inclusive 3–7 range at the same time.';
  if(roleId==='disruptor') return 'Make an uncancelled wrong-way move on each of the three hidden plan dials.';
  if(roleId==='loner') return 'Complete four non-arrested rounds as the only player choosing your dial.';
  if(roleId==='oddball') return 'Finish any completed round with at least five of the six dials showing odd numbers.';
  if(roleId==='numerologist') return 'Get three different dials to finish a round showing the same number.';
  if(roleId==='wrapper') return 'Use your persistent wrapping power to wrap three different dials past an endpoint.';
  return '';
}

export function isCompletedOneTimeWildRole(role,status=role?.wildStatus){
  return role?.kind==='wild'&&WILD_ROLE_DEFINITIONS[role.wildRole]?.timing==='one-time'&&status?.met===true;
}

export function describeWildRole(role,players=[]){
  if(role?.kind!=='wild'||!WILD_ROLE_DEFINITIONS[role.wildRole]) return '';
  const data=role.wildData||{};
  if(role.wildRole==='bounty'){
    const targetIds=Array.isArray(data.targetIds)?data.targetIds:data.targetId?[data.targetId]:[];
    const targets=targetIds.map(targetId=>players.find(player=>player.id===targetId)?.name||'an assigned player');
    const targetNames=targets.length>1?`${targets.slice(0,-1).join(', ')} and ${targets.at(-1)}`:targets[0]||'your assigned players';
    return `Get ${targets.length>1?'both ':''}${targetNames} arrested by Police at least once each.`;
  }
  if(role.wildRole==='extremist') return `Get the ${data.color||'assigned'} dial to the opposite extreme, ${data.targetValue??'your target'}, at least once.`;
  if(role.wildRole==='conservationist') return 'On round 4 or later, finish a round with the total of all six dials exactly equal to its starting total.';
  if(role.wildRole==='moderate') return 'Have all six dials in the inclusive 3–7 range at the same time. The starting board can qualify.';
  if(role.wildRole==='disruptor') return 'Make an uncancelled move away from the target on each of the three hidden plan dials.';
  if(role.wildRole==='loner') return 'Complete four rounds when you are not arrested and no other player chooses your dial.';
  if(role.wildRole==='oddball') return 'Finish any completed round with at least five of the six dials showing odd numbers.';
  if(role.wildRole==='numerologist') return 'Get three different dials to finish the same completed round showing the same number.';
  return 'When your uncancelled move touches a dial, that round it wraps past 0 or 9 instead of stopping. Use this power to wrap three different dials; the power remains after completion.';
}

function roundAction(entry,playerId){
  return entry.actions?.find(item=>item.playerId===playerId);
}

function disruptorAwayMoves(playerId,history=[],planValues={}){
  return history.flatMap(entry=>{
    const own=roundAction(entry,playerId);
    if(own?.arrested||own?.action?.type!=='move') return [];
    const target=Number(planValues?.[own.action.color]);
    const before=Number(entry.before?.[own.action.color]);
    const correctDirection=Math.sign(target-before);
    const ownDirection=Math.sign(Number(own.action.effect||0));
    if(!Number.isFinite(target)||!Number.isFinite(before)||correctDirection===0||ownDirection!==-correctDirection) return [];
    return [{round:entry.round,color:own.action.color,effect:own.action.effect}];
  });
}

function lonerRounds(playerId,history=[]){
  return history.filter(entry=>{
    const own=roundAction(entry,playerId);
    if(own?.arrested||own?.action?.type!=='move') return false;
    return !(entry.actions||[]).some(item=>item.playerId!==playerId&&item.action?.type==='move'&&item.action.color===own.action.color);
  }).length;
}

export function evaluateWildRole({role,playerId,players=[],history=[],initialDials={},finalDials={},planValues={},winner=''}={}){
  if(role?.kind!=='wild'||!WILD_ROLE_DEFINITIONS[role.wildRole]) return null;
  const objective=describeWildRole(role,players);
  const data=role.wildData||{};
  let met=false;
  let progress=0;
  let goal=null;
  let evidence='';
  let details={};
  let reachedOnce=false;
  if(role.wildRole==='bounty'){
    const targetIds=Array.isArray(data.targetIds)?data.targetIds:data.targetId?[data.targetId]:[];
    const targets=targetIds.map(targetId=>{
      const arrest=history.find(entry=>(entry.actions||[]).some(item=>item.action?.type==='arrest'&&item.action.targetId===targetId));
      return {targetId,arrested:Boolean(arrest),round:arrest?.round??null};
    });
    progress=targets.filter(target=>target.arrested).length;
    goal=targetIds.length||2;
    met=targetIds.length>0&&progress===targetIds.length;
    reachedOnce=met;
    details={targets};
    evidence=met?(targetIds.length===1?'The assigned player was arrested.':'Both assigned players were arrested.'):`${progress} of ${goal} assigned players were arrested.`;
  } else if(role.wildRole==='extremist'){
    const boards=[initialDials,...history.map(entry=>entry.after),finalDials].filter(Boolean);
    const reachedIndex=boards.findIndex(board=>Number(board?.[data.color])===Number(data.targetValue));
    reachedOnce=reachedIndex>=0;
    met=reachedOnce;
    progress=reachedOnce?1:0;
    goal=1;
    const current=finalDials?.[data.color];
    details={color:data.color,startingValue:data.startingValue,targetValue:data.targetValue,current,reachedRound:reachedIndex>0?history[reachedIndex-1]?.round??null:null};
    evidence=met
      ? `${data.color} reached its required extreme of ${data.targetValue}${details.reachedRound?` in round ${details.reachedRound}`:''}; the goal is complete.`
      : `${data.color} began at ${data.startingValue}; required extreme ${data.targetValue}; current ${current??'unknown'}.`;
  } else if(role.wildRole==='conservationist'){
    const initial=COLORS.reduce((sum,color)=>sum+Number(initialDials?.[color]||0),0);
    const final=COLORS.reduce((sum,color)=>sum+Number(finalDials?.[color]||0),0);
    const qualifying=history.find(entry=>Number(entry.round)>=4&&COLORS.reduce((sum,color)=>sum+Number(entry.after?.[color]||0),0)===initial);
    met=Boolean(qualifying);
    reachedOnce=met;
    progress=met?1:0;
    goal=1;
    details={initial,current:final,qualifyingRound:qualifying?.round??null};
    evidence=met?`The dial total returned to ${initial} after round ${qualifying.round}; the goal is complete.`:history.some(entry=>Number(entry.round)>=4)?`No eligible completed round has matched the starting total of ${initial}. Current total: ${final}.`:`The first eligible check is round 4. Starting total: ${initial}; current total: ${final}.`;
  } else if(role.wildRole==='moderate'){
    const qualifying=[{round:null,after:initialDials},...history].find(entry=>COLORS.every(color=>{
      const value=Number(entry.after?.[color]);
      return value>=3&&value<=7;
    }));
    met=Boolean(qualifying);
    reachedOnce=met;
    progress=met?1:0;
    goal=1;
    details={qualifyingRound:qualifying?.round??null};
    evidence=met?`All six dials were in the 3–7 range ${qualifying.round===null?'on the starting board':`after round ${qualifying.round}`}; the goal is complete.`:'All six dials have not yet been in the 3–7 range at the same time.';
  } else if(role.wildRole==='disruptor'){
    const qualifyingMoves=disruptorAwayMoves(playerId,history,planValues);
    const firstMoveByColor=new Map();
    qualifyingMoves.forEach(move=>{ if(!firstMoveByColor.has(move.color)) firstMoveByColor.set(move.color,move); });
    progress=Math.min(firstMoveByColor.size,3);
    goal=3;
    met=progress===goal;
    reachedOnce=met;
    details={qualifyingDials:[...firstMoveByColor.values()]};
    evidence=met?'A wrong-way move has qualified on all three hidden plan dials.':`${progress} of 3 hidden plan dials have a qualifying wrong-way move.`;
  } else if(role.wildRole==='loner'){
    progress=lonerRounds(playerId,history);
    goal=4;
    met=progress>=4;
    reachedOnce=met;
    evidence=`${Math.min(progress,goal)} of ${goal} qualifying solitary rounds.`;
  } else if(role.wildRole==='oddball'){
    const qualifying=history.map(entry=>{
      const oddColors=COLORS.filter(color=>{
        const value=Number(entry.after?.[color]);
        return Number.isFinite(value)&&Math.abs(value%2)===1;
      });
      return {round:entry.round,oddColors};
    }).find(item=>item.oddColors.length>=5);
    met=Boolean(qualifying);
    reachedOnce=met;
    progress=met?1:0;
    goal=1;
    details={qualifyingRound:qualifying?.round??null,oddColors:qualifying?.oddColors||[]};
    evidence=met?`${qualifying.oddColors.length} dials were odd after round ${qualifying.round}; the goal is complete.`:'No completed round has ended with at least five odd dials.';
  } else if(role.wildRole==='numerologist'){
    const qualifying=history.map(entry=>{
      const groups=new Map();
      COLORS.forEach(color=>{
        const value=Number(entry.after?.[color]);
        if(!Number.isFinite(value)) return;
        groups.set(value,[...(groups.get(value)||[]),color]);
      });
      const [number,colors]=[...groups.entries()].sort((a,b)=>b[1].length-a[1].length)[0]||[null,[]];
      return {round:entry.round,number,colors};
    }).find(item=>item.colors.length>=3);
    progress=qualifying?1:0;
    goal=1;
    met=Boolean(qualifying);
    reachedOnce=met;
    details={qualifyingRound:qualifying?.round??null,number:qualifying?.number??null,colors:qualifying?.colors||[]};
    evidence=met?`${qualifying.colors.length} dials showed ${qualifying.number} after round ${qualifying.round}; the goal is complete.`:'No completed round has ended with three dials showing the same number.';
  } else if(role.wildRole==='wrapper'){
    const qualifyingByColor=new Map();
    history.flatMap(entry=>entry.wraps||[]).filter(item=>item.playerId===playerId).forEach(item=>{
      if(!qualifyingByColor.has(item.color)) qualifyingByColor.set(item.color,item);
    });
    const qualifyingDials=[...qualifyingByColor.values()];
    progress=Math.min(qualifyingDials.length,3);
    goal=3;
    met=progress===goal;
    reachedOnce=met;
    details={qualifyingDials};
    evidence=met?'Your power has wrapped three different dials; the goal is complete and the power remains active.':`${progress} of 3 different dials have wrapped using your power.`;
  }
  return {roleId:role.wildRole,label:role.label,timing:WILD_ROLE_DEFINITIONS[role.wildRole].timing,met,reachedOnce,progress,goal,objective,evidence,details};
}

export function buildWildRoleResults(players=[],roles={},context={}){
  const wallfacerTeamWon=context.wallfacerTeamWon===true||['Loyal team','Wallfacer team'].includes(context.winner);
  return players.flatMap(player=>{
    const result=evaluateWildRole({role:roles[player.id],playerId:player.id,players,...context});
    return result?[{playerId:player.id,name:player.name,...result,won:result.met&&wallfacerTeamWon}]:[];
  });
}

export function knownWallfacerNames(players=[],roles={}){
  return players.filter(player=>roles[player.id]?.kind==='wallfacer').map(player=>player.name);
}

export function victoryRevealStage(reveal,now=Date.now()){
  if(!reveal) return null;
  if(now>=Number(reveal.endsAt)) return 'ended';
  if(now>=Number(reveal.lightAt)) return 'light';
  return 'dials';
}

export function maxEffectFor(role,color){
  if(role?.kind==='wild') return 1;
  if(role?.kind==='wallfacer'||role?.kind==='wallbreaker'||role?.kind==='police') return 1;
  if(role?.kind==='civilian'&&!SUBJECTS[role.profession]?.includes(color)) return 1;
  return 2;
}

export function legalEffectsFor(role,color){
  return maxEffectFor(role,color)===2?[-2,-1,1,2]:[-1,1];
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
  const wrappersByColor=new Map();
  for(const [playerId,selection] of entries){
    if(selection.color&&!arrested[playerId]){
      net[selection.color]+=selection.effect;
      if(roles[playerId]?.kind==='wild'&&roles[playerId]?.wildRole==='wrapper'){
        wrappersByColor.set(selection.color,[...(wrappersByColor.get(selection.color)||[]),playerId]);
      }
    }
  }
  const wraps=[];
  const after=Object.fromEntries(COLORS.map(color=>{
    const raw=before[color]+net[color];
    const wrapperIds=wrappersByColor.get(color)||[];
    if(wrapperIds.length&&(raw<0||raw>9)){
      const value=((raw%10)+10)%10;
      wrapperIds.forEach(playerId=>wraps.push({playerId,color,from:before[color],to:value,net:net[color]}));
      return [color,value];
    }
    return [color,clampDial(raw)];
  }));
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
  return {before,after,net,wraps,arrested,record:{round,before,after:{...after},net:{...net},wraps:wraps.map(item=>({...item})),actions}};
}

export function isPlanFieldGuess(planValues,guessColors){
  if(!Array.isArray(guessColors)||guessColors.length!==3||new Set(guessColors).size!==3||!guessColors.every(color=>COLORS.includes(color))) return false;
  const guessed=[...guessColors].sort().join(',');
  const actual=Object.keys(planValues||{}).sort().join(',');
  return guessed===actual;
}

export function isStandardPlanComplete(dials={},planValues={}){
  const entries=Object.entries(planValues||{});
  return entries.length===3&&entries.every(([color,value])=>COLORS.includes(color)&&Number(dials?.[color])===Number(value));
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

export function buildPostgameDisclosure(phase,players,roles,history,finalGuess,recap,viewerId=null,wildContext=null){
  if(phase!=='ended'||recap?.active!==true) return undefined;
  const completedRounds=history||[];
  const roundIndex=Math.max(0,Math.min(Number(recap.roundIndex)||0,Math.max(0,completedRounds.length-1)));
  const complete=completedRounds.length===0||roundIndex===completedRounds.length-1;
  return {
    roles:players.map(player=>{
      const role=roles[player.id]||{};
      return {playerId:player.id,name:player.name,kind:role.kind,label:role.label,profession:role.profession,plan:role.plan,targetId:role.targetId,wildRole:role.wildRole,wildData:role.wildData,unoccupiedWildRole:role.unoccupiedWildRole};
    }),
    history:completedRounds[roundIndex]?[completedRounds[roundIndex]]:[],
    finalGuess:complete?(finalGuess||null):null,
    wildResults:wildContext?buildWildRoleResults(players,roles,{history:completedRounds,...wildContext}):[],
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
