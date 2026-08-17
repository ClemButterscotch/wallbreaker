import { BRAND, storageKey } from './brand.js';
import { COLORS, SUBJECTS, MATHBREAKER_FIELDS, MATHBREAKER_THRESHOLD, clampDial, roleComposition, mathbreakerDecayBudget, createMathbreakerDials, mathbreakerEffectFor, isLegalMathbreakerAdvancement, isLegalMathbreakerDecay, resolveMathbreakerAdvancement, resolveMathbreakerDecay, isMathbreakerPlanComplete, validateMathbreakerGuess, legalEffectsFor, isLegalSelection as selectionIsLegal, tryLockSelection, resolveRoundState, isExactPlanGuess, buildPostgameDisclosure, buildTutorialDisclosure } from './game-rules.js';

const DIAL_GROUPS = [{name:'Mathematics',colors:['yellow','pink']},{name:'Science',colors:['blue','green']},{name:'Agriculture',colors:['orange','red']}];
const DIAL_SYMBOLS = {yellow:'△',pink:'○',orange:'□',red:'◆',blue:'✦',green:'⬡'};
const EFFECTS = [-2,-1,0,1,2];
const MAX_ROUNDS = 10;

const app = document.querySelector('#app');
const query = new URLSearchParams(location.search);
let peer = null;
let hostConn = null;
let conns = new Map();
let clientId = localStorage.getItem(storageKey('client-id')) || crypto.randomUUID();
localStorage.setItem(storageKey('client-id'), clientId);
let isHost = false;
let myName = query.get('name') || '';
let myPlayerId = null;
let pendingSelection = {color:null,effect:null,sophonMode:'affect',policeMode:'affect',arrestTarget:null,decays:[]};
let reconnecting = false;
let chatMessages = [];
let chatReplyTo = null;
let chatUnread = {};
let audioContext = null;
let lastCountdownSound = null;
let revealAnimationTimer = null;
let countdownTimer = null;
let mathRevealTimer = null;
let highContrast = localStorage.getItem(storageKey('high-contrast'))==='true';
let tutorialUI = null;
let tutorialLoadPromise = null;
let localView = { screen:location.pathname === '/host' ? 'host' : 'home', state:null, role:null, error:'', modal:null, revealKey:'', revealAnimationPending:false, tutorialStep:0 };

function roomPeerId(code){ return `${BRAND.peerNamespace}-${code}`; }
function fourDigit(){ return String(Math.floor(100000 + Math.random()*900000)); }
function escapeHtml(s=''){ return s.replace(/[&<>'"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c])); }
function playTung(){
  try{
    audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
    const now=audioContext.currentTime;
    const oscillator=audioContext.createOscillator();
    const gain=audioContext.createGain();
    oscillator.type='sine'; oscillator.frequency.setValueAtTime(220,now); oscillator.frequency.exponentialRampToValueAtTime(110,now+.32);
    gain.gain.setValueAtTime(.0001,now); gain.gain.exponentialRampToValueAtTime(.18,now+.015); gain.gain.exponentialRampToValueAtTime(.0001,now+.38);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(now); oscillator.stop(now+.4);
  }catch{}
}
function send(conn, msg){
  if(!conn) return;
  if(conn.open) conn.send(msg);
  else conn.once?.('open',()=>{ if(conn.open) conn.send(msg); });
}
function saveClientSession(){ const code=localView.state?.code||game.code; if(code&&myName) localStorage.setItem(storageKey('session'),JSON.stringify({code,name:myName})); }
function clearSession(){ localStorage.removeItem(storageKey('session')); localStorage.removeItem(storageKey('host')); }
function saveHost(){ localStorage.setItem(storageKey('host'),JSON.stringify({code:game.code,game})); }
function broadcast(){
  if(isHost) saveHost();
  for(const [pid,conn] of conns){
    const player = game.players.find(p=>p.id===pid);
    send(conn,{type:'state', state:publicState(), role:roleFor(player)});
  }
  const nextState=publicState();
  const nextRevealKey=`${nextState.round}:${JSON.stringify(nextState.revealed)}`;
  if(nextState.revealed && nextRevealKey!==localView.revealKey){
    localView.revealKey=nextRevealKey; localView.revealAnimationPending=true;
    clearTimeout(revealAnimationTimer);
    revealAnimationTimer=setTimeout(()=>{ localView.revealAnimationPending=false; render(); },3000);
  }
  localView.state = nextState;
  localView.role = roleFor(game.players.find(p=>p.id===myPlayerId));
  render();
}
function publicState(){
  const state={
    code:game.code, mode:game.mode||'standard', phase:game.phase, countdown:game.countdown||0, round:game.round, maxRounds:game.maxRounds, dials:game.dials, playerCount:game.players.length, wallfacerCount:game.wallfacerCount, policeEnabled:game.policeEnabled,
    players:game.players.map(p=>({id:p.id,name:p.name,ready:!!game.selections[p.id],connected:Boolean(conns.get(p.id)?.open)})),
    adminPlaying:game.adminPlaying, paused:game.mode==='mathbreaker'?false:game.paused, breakerName:game.mode==='mathbreaker'?'':game.breakerName,
    revealed:game.revealed, winner:game.winner, reason:game.reason
  };
  if(game.mode==='mathbreaker'){
    state.mathThreshold=game.mathThreshold;
    state.mathReveal=game.mathReveal?{
      stage:game.mathReveal.stage,
      round:game.mathReveal.round,
      advancementNet:{...game.mathReveal.advancementNet},
      ...(game.mathReveal.stage==='decay'?{decayNet:{...game.mathReveal.decayNet},decays:[...game.mathReveal.decays]}:{})
    }:null;
    state.goodPlayerCount=mathbreakerDecayBudget(game.players.length);
  }
  state.postgame=buildPostgameDisclosure(game.phase,game.players,game.roles,game.history,game.finalGuess);
  if(!state.postgame) delete state.postgame;
  if(game.mode==='tutorial') state.tutorial=buildTutorialDisclosure(game.mode,game.players,game.roles,game.selections,game.tutorialReady,game.history);
  return state;
}
function roleFor(player){
  if(!player || !game.roles[player.id]) return null;
  const r=game.roles[player.id];
  if(r.kind==='wallfacer') return {...r,arrested:!!game.arrested?.[player.id],otherWallfacers:game.players.filter(p=>p.id!==player.id&&game.roles[p.id]?.kind==='wallfacer').map(p=>p.name),mathBreakPending:game.mode==='mathbreaker'&&game.mathBreakPending?{kind:'wallfacer'}:null};
  if(r.kind==='wallbreaker'){
    const target=game.players.find(p=>p.id===r.targetId);
    const pending=game.mode==='mathbreaker'&&game.mathBreakPending?.breakerId===player.id?{kind:'wallbreaker',targetName:target?.name||'Unknown',fields:[...game.mathBreakPending.fields]}:null;
    return {...r,targetName:target?.name||'Unknown',arrested:!!game.arrested?.[player.id],mathBreakPending:pending};
  }
  return {...r,arrested:!!game.arrested?.[player.id]};
}
function roleSvg(kind){
  const icon = kind==='wallfacer' ? '<path d="M12 3 4.5 6v5.2c0 4.4 3.1 7.6 7.5 9.8 4.4-2.2 7.5-5.4 7.5-9.8V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>' : kind==='wallbreaker' ? '<path d="m5 4 14 8-14 8 3-8-3-8Z"/><path d="M10 12h8"/>' : '<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>';
  return `<svg class="role-svg" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
}
function eyeSvg(){ return '<svg class="eye-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>'; }

let game = freshGame();
function randomDials(){ return Object.fromEntries(COLORS.map(c=>[c,Math.floor(Math.random()*10)])); }
function freshGame(){ return {code:'',mode:'standard',phase:'lobby',round:1,maxRounds:MAX_ROUNDS,wallfacerCount:1,policeEnabled:true,dials:randomDials(),players:[],roles:{},selections:{},arrested:{},history:[],finalGuess:null,tutorialReady:{},mathThreshold:MATHBREAKER_THRESHOLD,mathReveal:null,mathBreakPending:null,adminPlaying:false,paused:false,breakerName:'',revealed:null,winner:null,reason:''}; }

function createPlan(){
  const values={};
  for(const c of [...COLORS].sort(()=>Math.random()-.5).slice(0,3)) values[c]=Math.floor(Math.random()*10);
  return {values};
}
function assignRoles(){
  const players=[...game.players];
  if(players.length<2) throw new Error('At least 2 players are required.');
  if(game.mode==='mathbreaker'){
    if(players.length<3) throw new Error('Mathbreaker requires at least 3 players.');
    const shuffled=[...players].sort(()=>Math.random()-.5);
    const wallfacer=shuffled[0];
    const wallbreaker=shuffled[1];
    const fields=[...COLORS].sort(()=>Math.random()-.5).slice(0,3);
    const specialties=[...COLORS].sort(()=>Math.random()-.5);
    game.roles={
      [wallfacer.id]:{kind:'wallfacer',label:'Wallfacer',plan:{fields,threshold:game.mathThreshold}},
      [wallbreaker.id]:{kind:'wallbreaker',label:'Wallbreaker',targetId:wallfacer.id,mathGuessKeys:[],lastGuessRound:null,mathGuessResult:null}
    };
    shuffled.slice(2).forEach((player,index)=>{ game.roles[player.id]={kind:'specialist',label:'Specialist',specialty:specialties[index%specialties.length]}; });
    return;
  }
  const composition=roleComposition(players.length,game.wallfacerCount,game.policeEnabled);
  const wallfacerCount=composition.wallfacers;
  const shuffled=[...players].sort(()=>Math.random()-.5);
  const wallfacers=shuffled.slice(0,wallfacerCount);
  const wallbreakers=shuffled.slice(wallfacerCount,wallfacerCount*2);
  const police=composition.police?shuffled[wallfacerCount*2]:null;
  game.roles={};
  wallfacers.forEach(p=>{ game.roles[p.id]={kind:'wallfacer',label:'Wallfacer',plan:createPlan()}; });
  wallbreakers.forEach((p,i)=>{ game.roles[p.id]={kind:'wallbreaker',label:'Wallbreaker',targetId:wallfacers[i % wallfacers.length].id,sophonResult:null}; });
  const civilianKinds=Object.keys(SUBJECTS);
  if(police) game.roles[police.id]={kind:'police',label:'Shi Qiang'};
  shuffled.slice(wallfacerCount*2+(police?1:0)).forEach(p=>{ game.roles[p.id]={kind:'civilian',label:'Civilian',profession:civilianKinds[Math.floor(Math.random()*civilianKinds.length)]}; });
}
function checkWallfacerWin(){
  for(const p of game.players){
    const r=game.roles[p.id];
    if(r?.kind==='wallfacer'){
      const ok=Object.entries(r.plan.values).every(([c,v])=>game.dials[c]===v);
      if(ok){ game.winner='Loyal team'; game.reason=`${p.name} completed a Wallfacer plan.`; game.phase='ended'; return true; }
    }
  }
  return false;
}
function resolveRound(){
  if(game.mode==='mathbreaker'){ resolveMathbreakerRound(); return; }
  const entries=Object.entries(game.selections);
  if(entries.length!==game.players.length) return;
  const roundSelections=game.selections;
  const resolution=resolveRoundState({dials:game.dials,selections:roundSelections,players:game.players,roles:game.roles,round:game.round});
  game.arrested=resolution.arrested;
  game.dials=resolution.after;
  game.revealed=resolution.net;
  for(const p of game.players){
    const role=game.roles[p.id];
    if(role?.kind==='wallbreaker'){
      const mode=roundSelections[p.id]?.sophonMode||'affect';
      if(mode==='see') role.sophonResult=roundSelections[role.targetId]||null;
      else role.sophonResult=null;
    }
  }
  game.history||=[];
  game.history.push(resolution.record);
  game.selections={};
  if(checkWallfacerWin()){ broadcast(); return; }
  if(game.round>=game.maxRounds){ game.winner='Wallbreakers'; game.reason=`Round ${game.maxRounds} ended without a Wallfacer completing a plan.`; game.phase='ended'; }
  else game.round++;
  broadcast();
}

function resolveMathbreakerRound(){
  if(game.phase!=='playing'||Object.keys(game.selections).length!==game.players.length) return;
  const breaker=game.players.find(player=>game.roles[player.id]?.kind==='wallbreaker');
  const breakerSelection=game.selections[breaker?.id];
  const decayBudget=breakerSelection?.systemSkipped?0:mathbreakerDecayBudget(game.players.length);
  const decays=breakerSelection?.systemSkipped?[]:breakerSelection?.decays;
  if(!breaker||!isLegalMathbreakerDecay({decays},decayBudget)) return;
  const advancement=resolveMathbreakerAdvancement({dials:game.dials,selections:game.selections,players:game.players,roles:game.roles,round:game.round});
  const decay=resolveMathbreakerDecay({dials:advancement.after,decays,budget:decayBudget,round:game.round});
  game.mathReveal={stage:'advancement',round:game.round,before:advancement.before,afterAdvancement:advancement.after,after:decay.after,advancementNet:advancement.advancementNet,decayNet:decay.decayNet,decays:decay.decays,actions:advancement.actions};
  game.dials=advancement.after;
  game.revealed=advancement.advancementNet;
  game.phase='math-reveal';
  broadcast();
  scheduleMathbreakerDecayReveal();
}

function scheduleMathbreakerDecayReveal(delay=1600){
  if(!isHost||game.mode!=='mathbreaker'||game.phase!=='math-reveal'||mathRevealTimer) return;
  mathRevealTimer=setTimeout(()=>{
    mathRevealTimer=null;
    if(game.mode!=='mathbreaker'||game.phase!=='math-reveal'||!game.mathReveal) return;
    const reveal=game.mathReveal;
    game.dials={...reveal.after};
    game.revealed={...reveal.decayNet};
    reveal.stage='decay';
    game.history.push({round:reveal.round,before:{...reveal.before},afterAdvancement:{...reveal.afterAdvancement},after:{...reveal.after},advancementNet:{...reveal.advancementNet},decayNet:{...reveal.decayNet},decays:[...reveal.decays],actions:[...reveal.actions]});
    game.selections={};
    const wallfacer=game.players.find(player=>game.roles[player.id]?.kind==='wallfacer');
    const plan=wallfacer&&game.roles[wallfacer.id]?.plan;
    if(plan&&isMathbreakerPlanComplete(game.dials,plan.fields,plan.threshold)){
      game.winner='Loyal team';
      game.reason=`${wallfacer.name}'s three fields reached the advancement threshold.`;
      game.phase='ended';
    } else {
      game.round++;
      game.phase='playing';
    }
    broadcast();
  },delay);
}

function attemptMathbreakerGuess(playerId,fields){
  if(game.mode!=='mathbreaker'||game.phase!=='playing'||game.paused||game.selections[playerId]) return {ok:false,error:'The guess window for this turn has closed.'};
  const role=game.roles[playerId];
  if(role?.kind!=='wallbreaker') return {ok:false,error:'Only the Wallbreaker can guess the plan.'};
  const targetRole=game.roles[role.targetId];
  const result=validateMathbreakerGuess({planFields:targetRole?.plan?.fields,guessFields:fields,previousGuessKeys:role.mathGuessKeys||[],lastGuessRound:role.lastGuessRound,round:game.round});
  if(!result.valid) return {ok:false,error:result.error};
  role.mathGuessKeys||=[];
  role.mathGuessKeys.push(result.key);
  role.lastGuessRound=game.round;
  role.mathGuessResult={round:game.round,correct:result.correct,fields:[...fields]};
  if(result.correct){
    game.mathBreakPending={breakerId:playerId,wallfacerId:role.targetId,fields:[...targetRole.plan.fields]};
    game.paused=true;
  }
  broadcast();
  return {ok:true,correct:result.correct};
}

function confirmMathbreakerDeclaration(playerId){
  const pending=game.mathBreakPending;
  if(game.mode!=='mathbreaker'||!pending||pending.breakerId!==playerId) return;
  game.finalGuess={playerId,targetId:pending.wallfacerId,fields:[...pending.fields],correct:true};
  game.winner='Wallbreakers';
  game.reason=`${game.players.find(player=>player.id===playerId)?.name||'The Wallbreaker'} revealed the secret fields.`;
  game.phase='ended'; game.paused=false; game.mathBreakPending=null;
  broadcast();
}
function attemptBreak(playerId, guess){
  const role=game.roles[playerId];
  if(role?.kind!=='wallbreaker') return;
  const targetRole=game.roles[role.targetId];
  const plan=targetRole.plan;
  const correct=isExactPlanGuess(plan.values,guess);
  game.finalGuess={playerId,targetId:role.targetId,guess:{...guess},correct};
  game.winner=correct?'Wallbreakers':'Loyal team';
  game.reason=correct?`${game.players.find(p=>p.id===playerId).name} correctly broke the wall.`:`${game.players.find(p=>p.id===playerId).name} guessed incorrectly.`;
  game.phase='ended'; game.paused=false;
  broadcast();
}

function setupPeerAsHost(code){
  return new Promise((resolve,reject)=>{
    peer = new Peer(roomPeerId(code));
    peer.on('open',resolve);
    peer.on('error',err=>reject(err));
    peer.on('connection',conn=>{
      conn.on('data',msg=>handleHostMessage(conn,msg));
      conn.on('close',()=>{
        const entry=[...conns].find(([,c])=>c===conn);
        // A reloaded client can replace its old connection before that old
        // connection emits close. Never remove the replacement.
        if(entry && conns.get(entry[0])===conn){ conns.delete(entry[0]); broadcast(); }
      });
      conn.on('error',()=>{});
    });
  });
}
function setupPeerAsClient(){
  return new Promise((resolve,reject)=>{
    peer=new Peer(undefined,{debug:0}); peer.on('open',resolve); peer.on('error',reject);
  });
}
function attachClientConnection(conn){
  hostConn=conn;
  conn.on('open',()=>send(conn,{type:'join',name:myName,clientId}));
  conn.on('data',handleClientMessage);
  conn.on('close',()=>{
    // An older connection may close after a replacement has already opened.
    // Only the currently active connection is allowed to trigger recovery.
    if(hostConn!==conn) return;
    localView.error='Connection to the host was lost. Reconnecting…';
    render();
    retryClientConnection();
  });
  conn.on('error',e=>{
    if(hostConn!==conn) return;
    localView.error=`Connection failed: ${peerError(e)} Reconnecting…`;
    render();
    retryClientConnection();
  });
}
function retryClientConnection(delay=700){
  if(reconnecting || isHost || !localStorage.getItem(storageKey('session'))) return;
  reconnecting=true;
  setTimeout(async()=>{
    reconnecting=false;
    if(isHost || !localStorage.getItem(storageKey('session'))) return;
    const oldConn=hostConn;
    hostConn=null;
    oldConn?.close?.();
    peer?.destroy?.();
    await resumeClient();
  },delay);
}
function handleHostMessage(conn,msg){
  if(msg._transportClientId) {
    msg.clientId ||= msg._transportClientId;
    msg.playerId ||= msg._transportClientId;
  }
  if(msg.type==='join'){
    const existing=game.players.find(p=>p.id===msg.clientId);
    if(existing){
      const previous=conns.get(msg.clientId);
      if(previous && previous!==conn) previous.close?.();
      conns.set(msg.clientId,conn);
      send(conn,{type:'joined',playerId:msg.clientId});
      broadcast();
      return;
    }
    if(game.phase!=='lobby'){ send(conn,{type:'error',message:'Game already started.'}); return; }
    if(game.players.some(p=>p.name.toLowerCase()===msg.name.toLowerCase())){ send(conn,{type:'error',message:'Name already used.'}); return; }
    const id=msg.clientId;
    conns.set(id,conn); game.players.push({id,name:msg.name});
    send(conn,{type:'joined',playerId:id}); saveHost();
    broadcast();
  }
  if(msg.type==='leave'){
    conns.delete(msg.playerId);
    if(game.phase==='lobby'){
      game.players=game.players.filter(player=>player.id!==msg.playerId);
      delete game.roles[msg.playerId]; delete game.selections[msg.playerId];
    }
    broadcast();
  }
  if(msg.type==='removePlayer' && !conn && game.phase==='lobby'){
    const playerId=msg.playerId;
    const connToRemove=conns.get(playerId);
    send(connToRemove,{type:'removed',message:'The host removed you from the room.'});
    connToRemove?.close?.();
    conns.delete(playerId);
    game.players=game.players.filter(p=>p.id!==playerId);
    delete game.roles[playerId]; delete game.selections[playerId];
    broadcast();
  }
  if(msg.type==='lockSelection' && game.phase==='playing' && !game.paused){
    // A lock is write-once for the current round. This prevents late retries,
    // duplicate WebSocket deliveries, and stale UI events from changing an
    // answer after it has been committed.
    if(!game.players.some(p=>p.id===msg.playerId)) return;
    if(!tryLockSelection(game.selections,msg.playerId,msg.selection,selection=>isLegalSelection(msg.playerId,selection))) return;
    if(Object.keys(game.selections).length===game.players.length) resolveRound(); else broadcast();
  }
  if(msg.type==='skipPlayer' && !conn && game.phase==='playing'){
    const player=game.players.find(candidate=>candidate.id===msg.playerId);
    if(!player||conns.get(player.id)?.open||game.selections[player.id]) return;
    game.selections[player.id]={systemSkipped:true};
    if(Object.keys(game.selections).length===game.players.length) resolveRound(); else broadcast();
  }
  if(msg.type==='tutorialReady' && game.mode==='tutorial' && game.phase==='tutorial'){
    if(!game.players.some(player=>player.id===msg.playerId)) return;
    game.tutorialReady[msg.playerId]=true;
    broadcast();
  }
  if(msg.type==='breakGuess' && game.mode!=='mathbreaker' && game.phase==='playing') attemptBreak(msg.playerId,msg.guess);
  if(msg.type==='mathbreakerGuess' && game.mode==='mathbreaker' && game.phase==='playing'){
    const result=attemptMathbreakerGuess(msg.playerId,msg.fields);
    if(!result.ok) send(conn,{type:'error',message:result.error});
  }
  if(msg.type==='mathbreakerDeclaration' && game.mode==='mathbreaker') confirmMathbreakerDeclaration(msg.playerId);
  if(msg.type==='chat' && typeof msg.text==='string'){
    const player=game.players.find(p=>p.id===msg.playerId);
    if(!player || !msg.text.trim()) return;
    chatMessages.push({from:player.name,text:msg.text.trim(),playerId:player.id});
    if(chatReplyTo!==player.id) chatUnread[player.id]=(chatUnread[player.id]||0)+1;
    render();
  }
}
function handleClientMessage(msg){
  if(msg.type==='joined'){ myPlayerId=msg.playerId; }
  if(msg.type==='state'){
    const wasPlaying=['playing','math-reveal'].includes(localView.state?.phase);
    if(msg.state.phase==='countdown' && msg.state.countdown!==lastCountdownSound){ lastCountdownSound=msg.state.countdown; playTung(); }
    const nextRevealKey=`${msg.state.round}:${JSON.stringify(msg.state.revealed)}`;
    if(msg.state.revealed && nextRevealKey!==localView.revealKey){
      localView.revealKey=nextRevealKey; localView.revealAnimationPending=true;
      clearTimeout(revealAnimationTimer);
      revealAnimationTimer=setTimeout(()=>{ localView.revealAnimationPending=false; render(); },3000);
    }
    localView.state=msg.state; localView.role=msg.role; localView.error=''; localView.screen=['lobby','countdown'].includes(msg.state.phase)?'lobby':'game'; saveClientSession();
    if(msg.state.mode==='tutorial') loadTutorialUI();
    if(msg.state.phase==='playing'&&!wasPlaying) localView.modal='role';
    render();
  }
  if(msg.type==='error'){ localView.error=msg.message; render(); }
  if(msg.type==='removed'){
    clearSession(); peer?.destroy?.();
    localView={screen:'home',state:null,role:null,error:msg.message||'You were removed from the room.',modal:null};
    render();
  }
  if(msg.type==='chat' && typeof msg.text==='string'){
    chatMessages.push({from:msg.from||'Observer',text:msg.text}); render();
  }
}

async function createRoom(){
  myName=document.querySelector('#name')?.value.trim() || '';
  localView.error=''; const code=fourDigit();
  try{
    await setupPeerAsHost(code); isHost=true; game=freshGame(); game.code=code; game.adminPlaying=false;
    saveHost();
    localView.screen='lobby'; localView.state=publicState(); render();
  }catch(e){ peer?.destroy(); localView.error=`Could not create room: ${peerError(e)}`; render(); }
}
function peerError(e){ const code=e?.type||e?.code; return code==='unavailable-id'?'That room code is already in use. Create another room.':code==='network'?'PeerJS signaling is unavailable right now.':code==='browser-incompatible'?'This browser does not support the required WebRTC features.':'check the room code and try again'; }
async function joinRoom(){
  myName=document.querySelector('#name').value.trim(); const code=document.querySelector('#code').value.trim() || new URLSearchParams(location.search).get('room')?.trim();
  if(!myName || !/^\d{6}$/.test(code)){ localView.error='Enter a name and six-digit room code.'; render(); return; }
  try{
    await setupPeerAsClient(); attachClientConnection(peer.connect(roomPeerId(code),{reliable:true}));
    setTimeout(()=>{ if(!hostConn?.open && localView.screen==='connecting'){ peer?.destroy(); localView.screen='home'; localView.error='Connection timed out. Make sure the host is already in the room and the code is correct.'; render(); } },12000);
    localView.screen='connecting'; render();
  }catch{ localView.error='Could not connect.'; render(); }
}
async function copyInvite(){
  const link=`${location.origin}/?room=${encodeURIComponent(game.code)}`;
  try { await navigator.clipboard.writeText(link); localView.error='Invite link copied.'; }
  catch { localView.error=link; }
  render();
}
function sendChat(){
  const input=document.querySelector('#chat-input');
  const text=input?.value.trim(); if(!text) return;
  if(isHost){
    const conn=chatReplyTo&&conns.get(chatReplyTo); if(!conn) return;
    send(conn,{type:'chat',from:'Observer',text});
    chatMessages.push({from:'Observer',text,playerId:chatReplyTo});
  } else {
    send(hostConn,{type:'chat',playerId:myPlayerId,text});
    chatMessages.push({from:'You',text});
  }
  input.value=''; render();
}
function removePlayer(playerId){
  if(!isHost || !playerId) return;
  handleHostMessage(null,{type:'removePlayer',playerId});
}
function skipDisconnectedPlayer(playerId){
  if(!isHost||!playerId) return;
  handleHostMessage(null,{type:'skipPlayer',playerId});
}
function toggleHighContrast(){
  highContrast=!highContrast;
  localStorage.setItem(storageKey('high-contrast'),String(highContrast));
  render();
}
function chatInitials(name=''){ return name.split(/\s+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'?'; }
function chatHtml(){
  if(isHost){
    const players=game.players;
    const active=chatReplyTo||players[0]?.id||null;
    if(active && chatReplyTo!==active) chatReplyTo=active;
    const player=players.find(p=>p.id===active);
    const messages=chatMessages.filter(m=>m.playerId===active).map(m=>{
      const mine=m.from==='Observer';
      const bubble=`<div class="chat-bubble"><div class="chat-author">${escapeHtml(m.from)}</div><div class="chat-text">${escapeHtml(m.text)}</div></div>`;
      return `<div class="chat-message ${mine?'mine':'theirs'}">${bubble}</div>`;
    }).join('')||'<div class="chat-empty">No messages in this conversation.</div>';
    const contacts=players.map(p=>`<button class="chat-contact ${p.id===active?'selected':''}" data-chat-contact="${escapeHtml(p.id)}" aria-label="Open messages with ${escapeHtml(p.name)}"><span class="chat-avatar">${chatInitials(p.name)}</span><span class="chat-contact-name">${escapeHtml(p.name)}</span>${chatUnread[p.id]?`<span class="chat-unread">${chatUnread[p.id]>9?'9+':chatUnread[p.id]}</span>`:''}</button>`).join('');
    return `<section class="panel chat-panel"><div class="chat-header"><strong>Private player messages</strong>${player?`<span>${escapeHtml(player.name)}</span>`:''}</div><div class="chat-contacts">${contacts||'<div class="chat-empty">No players yet.</div>'}</div><div class="chat-messages">${messages}</div><div class="chat-composer"><input id="chat-input" placeholder="${player?'Message '+escapeHtml(player.name)+'...':'Select a player'}" ${player?'':'disabled'}><button id="chat-send" ${player?'':'disabled'}>Send</button></div></section>`;
  }
  const messages=chatMessages.length?chatMessages.map(m=>{
    const mine=m.from==='You'||(isHost&&m.from==='Observer');
    const selected=isHost&&chatReplyTo&&m.playerId===chatReplyTo;
    const bubble=`<div class="chat-bubble"><div class="chat-author">${escapeHtml(m.from)}</div><div class="chat-text">${escapeHtml(m.text)}</div></div>`;
    return isHost
      ? `<button class="chat-message ${mine?'mine':'theirs'} ${selected?'selected':''}" data-chat-player="${escapeHtml(m.playerId||'')}" aria-label="Reply to ${escapeHtml(m.from)}">${bubble}</button>`
      : `<div class="chat-message ${mine?'mine':'theirs'}">${bubble}</div>`;
  }).join(''):'<div class="chat-empty">No messages yet.</div>';
  return `<section class="panel chat-panel"><div class="chat-header"><strong>Message the observer</strong></div><div class="chat-messages">${messages}</div><div class="chat-composer"><input id="chat-input" placeholder="Ask the observer a question..."><button id="chat-send">Send</button></div></section>`;
}
async function resumeHost(attempt=0){
  const saved=JSON.parse(localStorage.getItem(storageKey('host'))||'null');
  if(!saved?.code||!saved.game) return;
  try {
    await setupPeerAsHost(saved.code); isHost=true; game=saved.game; game.mode ||= 'standard'; game.wallfacerCount ||= 1; game.maxRounds ||= MAX_ROUNDS; game.policeEnabled ??= true; game.history ||= []; game.finalGuess ||= null; game.tutorialReady ||= {}; game.mathThreshold ||= MATHBREAKER_THRESHOLD; game.mathReveal ||= null; game.mathBreakPending ||= null;
    localView.screen=['lobby','countdown'].includes(game.phase)?'lobby':'game'; localView.state=publicState(); if(game.mode==='tutorial') loadTutorialUI(); render();
    if(game.phase==='countdown') beginCountdown();
    if(game.phase==='math-reveal') scheduleMathbreakerDecayReveal(500);
  } catch {
    peer?.destroy?.();
    if(attempt<12){
      localView.screen='connecting'; localView.error='Reclaiming the room after reload…'; render();
      setTimeout(()=>resumeHost(attempt+1),Math.min(1000+attempt*500,5000));
    } else {
      localView.screen='host'; localView.error='Could not reclaim the room. Try refreshing once more.'; render();
    }
  }
}
async function resumeClient(){
  const saved=JSON.parse(localStorage.getItem(storageKey('session'))||'null');
  if(!saved?.code||!saved.name||location.pathname==='/host') return;
  myName=saved.name; document.querySelector('#name')?.setAttribute('value',myName); localView.error='';
  try { await setupPeerAsClient(); attachClientConnection(peer.connect(roomPeerId(saved.code),{reliable:true})); localView.screen='connecting'; render(); } catch { localView.error='Unable to reconnect yet. Retrying…'; localView.screen='connecting'; render(); retryClientConnection(1500); }
}
function leaveGame(){ if(isHost){ peer?.destroy(); clearSession(); location.href='/host'; return; } send(hostConn,{type:'leave',playerId:myPlayerId}); peer?.destroy(); clearSession(); localView={screen:'home',state:null,role:null,error:'',modal:null}; render(); }
function resetGameStart(mode){
  game.mode=mode; game.round=1; game.selections={}; game.arrested={}; game.history=[]; game.finalGuess=null; game.revealed=null; game.winner=null; game.reason=''; game.tutorialReady={}; game.mathThreshold=MATHBREAKER_THRESHOLD; game.mathReveal=null; game.mathBreakPending=null; game.paused=false;
  if(mode==='mathbreaker') game.dials=createMathbreakerDials();
  pendingSelection={color:null,effect:null,sophonMode:'affect',policeMode:'affect',arrestTarget:null,decays:[]}; localView.modal=null; localView.tutorialStep=0;
}
function startGame(mode='standard'){
  try{
    if(game.players.length<2) throw new Error('At least 2 players are required.');
    if(mode==='mathbreaker'&&game.players.length<3) throw new Error('Mathbreaker requires at least 3 players.');
    resetGameStart(mode);
    if(mode==='tutorial'){
      game.phase='tutorial'; localView.screen='game'; loadTutorialUI(); broadcast(); return;
    }
    startCountdown();
  }
  catch(e){ localView.error=e.message; render(); }
}
function startCountdown(){
  game.phase='countdown'; game.countdown=3; localView.screen='lobby'; lastCountdownSound=3; playTung(); broadcast(); beginCountdown();
}
function beginTutorialPractice(){
  if(!isHost||game.mode!=='tutorial'||game.phase!=='tutorial') return;
  startCountdown();
}
function beginCountdown(){
  if(!isHost || countdownTimer) return;
  countdownTimer=setInterval(()=>{
    if(game.phase!=='countdown'){ clearInterval(countdownTimer); countdownTimer=null; return; }
    game.countdown=Math.max(0,(game.countdown||0)-1);
    if(game.countdown>0) playTung();
    if(game.countdown===0){ assignRoles(); game.phase='playing'; delete game.countdown; clearInterval(countdownTimer); countdownTimer=null; localView.modal='role'; }
    broadcast();
  },1000);
}
function submitSelection(){
  const role=currentRoleFor(myPlayerId);
  const color=pendingSelection.color;
  const effect=pendingSelection.effect;
  const sophonMode=pendingSelection.sophonMode || 'affect';
  const policeMode=pendingSelection.policeMode || 'affect';
  if(localView.state?.players.find(p=>p.id===myPlayerId)?.ready) return;
  const selection=localView.state?.mode==='mathbreaker'
    ? role?.kind==='wallbreaker'?{decays:[...pendingSelection.decays]}:{color,effect:mathbreakerEffectFor(role,color)}
    : role?.kind==='wallbreaker'&&sophonMode==='see' ? {sophonMode:'see'} : role?.kind==='police'&&policeMode==='arrest' ? {policeMode:'arrest',arrestTarget:pendingSelection.arrestTarget} : {color,effect,sophonMode:'affect',policeMode:'affect'};
  if(!isLegalSelection(myPlayerId,selection)) return;
  if(isHost){
    if(!tryLockSelection(game.selections,myPlayerId,selection,item=>isLegalSelection(myPlayerId,item))) return;
    if(Object.keys(game.selections).length===game.players.length) resolveRound(); else broadcast();
  } else send(hostConn,{type:'lockSelection',playerId:myPlayerId,selection});
}
function pauseForBreak(){ localView.modal='break'; render(); }
function sendBreak(){
  const checks=[...document.querySelectorAll('.break-dial:checked')].map(x=>x.value);
  if(checks.length!==3){ alert('Choose exactly three dials.'); return; }
  const guess={}; for(const c of checks){ guess[c]=Number(document.querySelector(`#guess-${c}`).value); }
  if(isHost) attemptBreak(myPlayerId,guess); else send(hostConn,{type:'breakGuess',playerId:myPlayerId,guess});
  localView.modal=null; render();
}
function sendMathbreakerGuess(){
  const fields=[...document.querySelectorAll('.math-guess-field:checked')].map(element=>element.value);
  if(fields.length!==3){ localView.error='Choose exactly three fields.'; render(); return; }
  if(isHost) attemptMathbreakerGuess(myPlayerId,fields); else send(hostConn,{type:'mathbreakerGuess',playerId:myPlayerId,fields});
  localView.modal=null; render();
}
function confirmMathbreakerReveal(){
  if(isHost) confirmMathbreakerDeclaration(myPlayerId); else send(hostConn,{type:'mathbreakerDeclaration',playerId:myPlayerId});
}

function roleHtml(role){
  if(!role) return '<p>No role assigned.</p>';
  if(localView.state?.mode==='mathbreaker'){
    if(role.kind==='wallfacer') return `<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">Wallfacer</h2><p>Advance any one field by +1 each turn. Guide the Specialists without exposing the plan.</p></div></div><div class="card-list"><strong>Your three fields · reach ${role.plan.threshold}</strong>${role.plan.fields.map(field=>`<div class="card-line">${escapeHtml(mathFieldName(field))}</div>`).join('')}</div>`;
    if(role.kind==='wallbreaker') return `<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">Wallbreaker</h2><p>Assign ${Math.max(0,(localView.state?.playerCount||0)-1)} decay effects each turn, then privately test one unused three-field combination.</p></div></div><button class="danger" id="break-now" ${role.lastGuessRound===localView.state?.round?'disabled':''}>${role.lastGuessRound===localView.state?.round?'Guess used this turn':'Guess the three fields'}</button>`;
    if(role.kind==='specialist') return `<div class="role-heading">${roleSvg('civilian')}<div><h2 class="role-title">${escapeHtml(mathFieldName(role.specialty))} Specialist</h2><p>Advance your specialty by +2, or advance any other field by +1. Discover and support the Wallfacer’s plan.</p></div></div>`;
  }
  const arrested=role.arrested?'<div class="arrest-notice">You were arrested this turn. Your dial effect did not happen.</div>':'';
  if(role.kind==='police') return `${arrested}<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">Shi Qiang</h2><p>You are Police. Each round, choose whether to affect a dial by 1 or secretly arrest one player.</p></div></div>`;
  if(role.kind==='civilian') return `${arrested}<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">${escapeHtml(role.profession)}</h2><p>Subject area: ${SUBJECTS[role.profession].join(' and ')}. Adjust one of these by 1 or 2, or any other dial by 1.</p></div></div>`;
  if(role.kind==='wallbreaker') return `${arrested}<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">Wallbreaker</h2><p>Each round, choose one Sophon action: adjust one dial by -1, 0, or +1, or observe your target Wallfacer's move.</p></div><button class="danger" id="break-now">Guess the complete plan</button>${role.sophonResult?`<div class="card-list"><strong>Observed move</strong><div class="card-line">${role.sophonResult.systemSkipped?'No move · disconnected':`${role.sophonResult.color} ${role.sophonResult.effect>0?'+':''}${role.sophonResult.effect}`}</div></div>`:''}`;
  const rows=Object.entries(role.plan.values).map(([c,v])=>`<div class="card-line">${c.toUpperCase()} = ${v}</div>`).join('');
  const otherWallfacers=role.otherWallfacers?.length?`<div class="known-wallfacers"><strong>Other Wallfacers</strong><div>${role.otherWallfacers.map(name=>`<div class="card-line">${escapeHtml(name)}</div>`).join('')}</div></div>`:'';
  return `${arrested}<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">Wallfacer</h2><p>Adjust a dial by 1 while completing this configuration.</p></div></div>${otherWallfacers}<div class="card-list">${rows}</div>`;
}
function omniscientHtml(state){
  if(!isHost) return '';
  return `<section class="panel stack omniscient"><div class="section-title">${roleSvg('omniscient')}<div><strong>Observer view</strong><div class="small">All hidden information is visible to the host.</div></div></div><div class="role-grid">${state.players.map(p=>{ const r=game.roles[p.id]; const plan=r?.plan?.values; const mathPlan=r?.plan?.fields; return `<div class="role-card">${roleSvg(r?.kind)}<div class="role-card-copy"><div class="player-name-line"><strong>${escapeHtml(p.name)}</strong>${connectionBadgeHtml(p)}</div><div class="small">${escapeHtml(r?.label||'Unassigned')}${r?.targetId?` · targets ${escapeHtml(game.players.find(x=>x.id===r.targetId)?.name||'Unknown')}`:''}${r?.specialty?` · ${escapeHtml(mathFieldName(r.specialty))}`:''}</div>${plan?`<div class="small">${Object.entries(plan).map(([c,v])=>`${c} ${v}`).join(' · ')}</div>`:''}${mathPlan?`<div class="small">${mathPlan.map(mathFieldName).map(escapeHtml).join(' · ')} · threshold ${r.plan.threshold}</div>`:''}${!p.connected&&!p.ready&&state.phase==='playing'?`<button class="skip-player" data-skip-player="${escapeHtml(p.id)}">Resolve as no move</button>`:''}</div></div>`; }).join('')}</div></section>`;
}
function currentRoleFor(playerId){
  return isHost ? game.roles[playerId] : localView.role;
}
function isLegalSelection(playerId,selection){
  const role=currentRoleFor(playerId);
  if(game.mode==='mathbreaker'||localView.state?.mode==='mathbreaker'){
    if(role?.kind==='wallbreaker') return isLegalMathbreakerDecay(selection,mathbreakerDecayBudget(game.players?.length||localView.state?.playerCount||0));
    return isLegalMathbreakerAdvancement(role,selection);
  }
  const players=isHost?game.players:(localView.state?.players||[]);
  return selectionIsLegal(role,selection,players,playerId);
}
function dialCardHtml(c,state,role){
  const selected=pendingSelection.color===c;
  const locked=state.players.find(p=>p.id===myPlayerId)?.ready;
  const effects=legalEffectsFor(role,c);
  const button=(effect)=>effects.includes(effect)?`<button class="dial-action adjust" data-color="${c}" data-effect="${effect}" aria-label="${effect<0?'Decrease':'Increase'} ${c} by ${Math.abs(effect)}">${effect>0?'+':''}${effect}</button>`:'';
  const lockEffect=locked&&selected&&pendingSelection.sophonMode==='affect'?pendingSelection.effect:null;
  const arrows=lockEffect?`<span class="lock-arrows ${lockEffect>0?'up':'down'}" style="--lock-speed:${Math.abs(lockEffect)===2?'.55s':'1.1s'}" aria-hidden="true">${lockEffect>0?'↑':'↓'}</span>`:'';
  return `<div class="dial ${c} dial-card ${selected?'selected':''} ${lockEffect?'locked-preview':''} ${dialRevealClass(state,c)}" ${dialRevealStyle(state,c)}><div class="adjust-row">${button(2)}${button(1)}</div><button class="dial-action dial-select" data-color="${c}" aria-label="Select ${c}, symbol ${DIAL_SYMBOLS[c]}, with no change"><span class="name"><span aria-hidden="true">${DIAL_SYMBOLS[c]}</span> ${c}</span>${dialValueHtml(c,state)}</button><div class="adjust-row">${button(-1)}${button(-2)}</div>${arrows}</div>`;
}
function observerDialCardHtml(c,state){
  return `<div class="dial ${c} dial-card observer-dial ${dialRevealClass(state,c)}" ${dialRevealStyle(state,c)}><div></div><div class="dial-select"><span class="name"><span aria-hidden="true">${DIAL_SYMBOLS[c]}</span> ${c}</span>${dialValueHtml(c,state)}</div><div></div></div>`;
}
function mathFieldName(color){ return MATHBREAKER_FIELDS[color]||color; }
function mathbreakerDialCardHtml(color,state,role){
  const selected=pendingSelection.color===color;
  const locked=state.players.find(player=>player.id===myPlayerId)?.ready;
  const effect=mathbreakerEffectFor(role,color);
  const interactive=!locked&&state.phase==='playing'&&effect;
  const arrows=locked&&selected?`<span class="lock-arrows up" style="--lock-speed:${effect===2?'.55s':'1.1s'}" aria-hidden="true">↑</span>`:'';
  return `<div class="dial ${color} dial-card math-dial-card ${selected?'selected':''} ${locked&&selected?'locked-preview':''} ${dialRevealClass(state,color)}" ${dialRevealStyle(state,color)}><div class="adjust-row">${interactive?`<button class="dial-action math-advance" data-math-advance="${color}" aria-label="Advance ${escapeHtml(mathFieldName(color))} by ${effect}">+${effect}</button>`:''}</div><button class="dial-action dial-select" ${interactive?`data-math-advance="${color}"`:'disabled'} aria-label="${escapeHtml(mathFieldName(color))}, value ${state.dials[color]}"><span class="name"><span aria-hidden="true">${DIAL_SYMBOLS[color]}</span> ${escapeHtml(mathFieldName(color))}</span>${dialValueHtml(color,state)}</button><div></div>${arrows}</div>`;
}
function mathbreakerObserverDialCardHtml(color,state){
  return `<div class="dial ${color} dial-card math-dial-card observer-dial ${dialRevealClass(state,color)}" ${dialRevealStyle(state,color)}><div></div><div class="dial-select"><span class="name"><span aria-hidden="true">${DIAL_SYMBOLS[color]}</span> ${escapeHtml(mathFieldName(color))}</span>${dialValueHtml(color,state)}</div><div></div></div>`;
}
function revealTotal(revealed,color){
  const value=revealed?.[color];
  return Array.isArray(value) ? value.reduce((a,b)=>a+b,0) : Number(value||0);
}
function signed(n){ return n>0?`+${n}`:String(n); }
function dialRevealClass(state,color){
  return state.revealed&&localView.revealAnimationPending ? `dial-revealed ${revealTotal(state.revealed,color)===0?'dial-steady':'dial-turning'}` : '';
}
function dialRevealStyle(state,color){
  if(!state.revealed) return '';
  const total=revealTotal(state.revealed,color);
  const degrees=total===0 ? 18 : Math.max(-720,Math.min(720,total*90));
  return `style="--turn:${degrees}deg"`;
}
function dialValueHtml(c,state){
  const total=revealTotal(state.revealed,c);
  const final=state.dials[c];
  const prior=clampDial(final-total);
  const direction=total>0?'dial-up':total<0?'dial-down':'dial-flat';
  return `<div class="value-window ${direction}"><span class="dial-delta dial-delta-up ${total>0?'active':''}">+1</span><div class="value-reel"><span class="reveal-adjacent">${total>0?final:prior}</span><span class="value">${prior}</span><span class="reveal-adjacent">${total<0?final:prior}</span></div><span class="dial-delta dial-delta-down ${total<0?'active':''}">-1</span></div>`;
}
function movePanelHtml(state,role,current){
  const chosen=pendingSelection.sophonMode==='see'?"Spy on Wallfacer's move":pendingSelection.color?`${pendingSelection.color} ${pendingSelection.effect>0?'+':''}${pendingSelection.effect}`:'Select a dial and adjustment';
  const spy=role?.kind==='wallbreaker'?`<button class="spy-choice ${pendingSelection.sophonMode==='see'?'selected':''}" id="spy-choice" aria-pressed="${pendingSelection.sophonMode==='see'}">${eyeSvg()}<span>Spy on Wallfacer's move</span></button>`:'';
  const arrest=role?.kind==='police'?`<button class="spy-choice ${pendingSelection.policeMode==='arrest'?'selected':''}" id="arrest-choice" aria-pressed="${pendingSelection.policeMode==='arrest'}">${roleSvg('police')}<span>Arrest someone for this turn</span></button>${pendingSelection.policeMode==='arrest'?`<div class="arrest-choices"><div class="small">Choose one player. Their locked dial effect will be cancelled privately.</div>${state.players.filter(p=>p.id!==myPlayerId).map(p=>`<button class="arrest-target ${pendingSelection.arrestTarget===p.id?'selected':''}" data-arrest-target="${escapeHtml(p.id)}"><span class="chat-avatar">${chatInitials(p.name)}</span><span>${escapeHtml(p.name)}</span>${pendingSelection.arrestTarget===p.id?'<strong>Selected</strong>':''}</button>`).join('')}</div>`:''}`:'';
  const hasChoice=role?.kind==='wallbreaker' ? pendingSelection.sophonMode==='see'||(pendingSelection.color&&EFFECTS.includes(pendingSelection.effect)) : role?.kind==='police' ? pendingSelection.policeMode==='arrest'?Boolean(pendingSelection.arrestTarget):(pendingSelection.color&&EFFECTS.includes(pendingSelection.effect)) : Boolean(pendingSelection.color&&EFFECTS.includes(pendingSelection.effect));
  const observed=role?.kind==='wallbreaker'&&role.sophonResult?`<div class="observed-move"><div class="observed-label">Wallfacer move observed</div><strong>${role.sophonResult.systemSkipped?'No move':`${role.sophonResult.color} ${role.sophonResult.effect>0?'+':''}${role.sophonResult.effect}`}</strong></div>`:'';
  const summary=role?.kind==='police'&&pendingSelection.policeMode==='arrest'?(pendingSelection.arrestTarget?'Arrest selected player':'Choose a player'):chosen;
  const lockedLabel=role?.kind==='wallbreaker'&&pendingSelection.sophonMode==='see'?'Locked in · spying':role?.kind==='police'&&pendingSelection.policeMode==='arrest'?`Locked in · arrest${pendingSelection.arrestTarget?' selected':''}`:`Locked in · ${chosen}`;
  return `<section class="panel stack move-panel"><div class="move-summary"><strong>Your move</strong><span>${current?lockedLabel:summary}</span></div>${observed}${spy}${arrest}<button id="submit" ${state.paused||current||!hasChoice?'disabled':''}>${current?lockedLabel:'Lock selection'}</button><div class="small">${state.players.filter(p=>p.ready).length}/${state.players.length} locked</div></section>`;
}
function mathbreakerMovePanelHtml(state,role,current){
  if(role?.kind==='wallbreaker'){
    const budget=state.goodPlayerCount;
    const counts=Object.fromEntries(COLORS.map(color=>[color,pendingSelection.decays.filter(item=>item===color).length]));
    const total=pendingSelection.decays.length;
    const assignments=COLORS.map(color=>`<div class="decay-assignment"><span>${escapeHtml(mathFieldName(color))}</span><div><button class="secondary decay-remove" data-decay-remove="${color}" ${current||counts[color]===0?'disabled':''} aria-label="Remove decay from ${escapeHtml(mathFieldName(color))}">−</button><strong>${counts[color]}</strong><button class="secondary decay-add" data-decay-add="${color}" ${current||total>=budget?'disabled':''} aria-label="Add decay to ${escapeHtml(mathFieldName(color))}">+</button></div></div>`).join('');
    const guessed=role.lastGuessRound===state.round;
    const guessResult=guessed&&!role.mathGuessResult?.correct?'<div class="math-guess-result">That combination is not the plan. It cannot be guessed again.</div>':'';
    return `<section class="panel stack move-panel mathbreaker-move"><div class="move-summary"><strong>Assign decay</strong><span>${current?'Locked':`${total}/${budget} assigned`}</span></div><p class="small">Choose all ${budget} decay effects now. They lock simultaneously with every advancement and may stack on one field.</p><div class="decay-grid">${assignments}</div><button id="submit" ${current||total!==budget||state.phase!=='playing'?'disabled':''}>${current?'Decay locked':'Lock decay'}</button><button class="secondary" id="math-guess-now" ${current||guessed||state.phase!=='playing'?'disabled':''}>${guessed?'Guess used this turn':'Privately guess the plan'}</button>${guessResult}<div class="small">${state.players.filter(player=>player.ready).length}/${state.players.length} locked</div></section>`;
  }
  const effect=pendingSelection.color?mathbreakerEffectFor(role,pendingSelection.color):null;
  const chosen=pendingSelection.color?`${mathFieldName(pendingSelection.color)} +${effect}`:'Choose a field to advance';
  return `<section class="panel stack move-panel mathbreaker-move"><div class="move-summary"><strong>Your advancement</strong><span>${current?`Locked · ${chosen}`:chosen}</span></div><button id="submit" ${current||!pendingSelection.color||state.phase!=='playing'?'disabled':''}>${current?'Advancement locked':'Lock advancement'}</button><div class="small">${state.players.filter(player=>player.ready).length}/${state.players.length} locked</div></section>`;
}
function home(){ const inviteCode=new URLSearchParams(location.search).get('room')?.match(/^\d{6}$/)?.[0]||''; return `<div class="shell"><div class="topbar"><div class="brand">${BRAND.name}</div></div><section class="panel stack"><h2>Join game</h2><input id="name" placeholder="Name" value="${escapeHtml(myName)}"><input id="code" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="6" placeholder="6-digit room code" value="${inviteCode}"><button id="join">Join room</button></section>${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`; }
function hostPage(){ return `<div class="shell"><div class="topbar"><div class="brand">${BRAND.name}</div></div><section class="panel stack"><h2>Start a game</h2><p class="small">Create a room, then choose the role balance after players join.</p><button id="create">Create room</button></section>${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`; }
function connectionBadgeHtml(player){
  return `<span class="connection-badge ${player.connected?'connected':'disconnected'}"><span aria-hidden="true"></span>${player.connected?'Connected':'Disconnected'}</span>`;
}
function lobby(state){
  const maxRoles=Math.max(1,Math.floor(state.players.length/2));
  const recommended=Math.max(1,Math.min(Math.floor(state.players.length/4)||1,maxRoles));
  const composition=roleComposition(state.players.length,state.wallfacerCount,state.policeEnabled);
  const compositionHtml=`<div class="composition" aria-label="Planned role composition"><div><strong>${composition.wallfacers}</strong><span>Wallfacer${composition.wallfacers===1?'':'s'}</span></div><div><strong>${composition.wallbreakers}</strong><span>Wallbreaker${composition.wallbreakers===1?'':'s'}</span></div><div><strong>${composition.police}</strong><span>Police</span></div><div><strong>${composition.civilians}</strong><span>Civilian${composition.civilians===1?'':'s'}</span></div></div>`;
  const countdown=state.phase==='countdown'?`<div class="countdown" role="status" aria-live="polite">Starting in <strong>${state.countdown}</strong>…</div>`:'';
  const playerRows=state.players.map(p=>`<div class="player"><div class="player-name-line"><span>${escapeHtml(p.name)}</span>${connectionBadgeHtml(p)}</div>${isHost?`<button class="secondary remove-player" data-player-id="${escapeHtml(p.id)}">Remove</button>`:''}</div>`).join('')||'<div class="small">Waiting for players…</div>';
  const canStart=state.players.length>=2&&state.phase==='lobby';
  const canStartMathbreaker=state.players.length>=3&&state.phase==='lobby';
  const startChoices=state.phase==='countdown'?'<button disabled>Starting…</button>':`<div class="game-mode-grid"><button class="game-mode-card" id="start" ${canStart?'':'disabled'}><span class="mode-kicker">WALLBREAKER</span><strong>Start the game</strong><small>Exact plans, configurable roles, Police, and a round limit.</small></button><button class="game-mode-card mathbreaker-mode-card" id="start-mathbreaker" ${canStartMathbreaker?'':'disabled'}><span class="mode-kicker">MATHBREAKER</span><strong>Advance the fields</strong><small>One Wallfacer, one Wallbreaker, specialists, and no round limit. Requires 3 players.</small></button><button class="game-mode-card tutorial-mode-card" id="start-tutorial" ${canStart?'':'disabled'}><span class="mode-kicker">GUIDED</span><strong>Wallbreaker tutorial</strong><small>Interactive briefing and open-book practice.</small></button></div>`;
  const settings=isHost?`<div class="lobby-settings"><div class="setting-heading"><div><strong>Role balance</strong><div class="small">The same number of Wallfacers and Wallbreakers.</div></div><button class="secondary compact" id="recommended-balance" ${state.phase!=='lobby'?'disabled':''}>Recommended · ${recommended}</button></div><label>Wallfacers and Wallbreakers: <strong>${Math.min(state.wallfacerCount,maxRoles)}</strong><input id="role-count" type="range" min="1" max="${maxRoles}" value="${Math.min(state.wallfacerCount,maxRoles)}" ${state.players.length<2||state.phase!=='lobby'?'disabled':''}></label>${compositionHtml}${state.wallfacerCount!==recommended&&state.players.length>=4?'<div class="balance-warning">Custom balance selected. Expect a more chaotic match.</div>':''}<div class="setting-row"><label class="toggle-setting"><input id="police-enabled" type="checkbox" ${state.policeEnabled?'checked':''} ${state.phase!=='lobby'?'disabled':''}><span>Include Police when a slot is available</span></label><label>Round limit<select id="round-limit" ${state.phase!=='lobby'?'disabled':''}><option value="6" ${state.maxRounds===6?'selected':''}>6 · quick</option><option value="8" ${state.maxRounds===8?'selected':''}>8</option><option value="10" ${state.maxRounds===10?'selected':''}>10 · standard</option><option value="12" ${state.maxRounds===12?'selected':''}>12 · long</option></select></label></div></div><button class="secondary" id="copy-invite">Copy invite link</button>${startChoices}<button class="secondary" id="leave">End game</button>`:`${compositionHtml}<button class="secondary" id="leave">Leave game</button>`;
  return `<div class="shell"><div class="topbar"><div><div class="brand">${BRAND.name}</div><div class="meta">Room · ${state.playerCount} players</div></div><div class="code">${state.code}</div></div><section class="panel stack">${countdown}<div class="players">${playerRows}</div>${settings}</section>${chatHtml()}${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`;
}
function postgameRoleDetail(role,names){
  if(role.kind==='wallfacer'&&role.plan?.fields) return `Plan · ${role.plan.fields.map(mathFieldName).join(' · ')} · threshold ${role.plan.threshold}`;
  if(role.kind==='wallfacer') return `Plan · ${Object.entries(role.plan?.values||{}).map(([color,value])=>`${color} ${value}`).join(' · ')}`;
  if(role.kind==='wallbreaker') return `Targeted ${names.get(role.targetId)||'Unknown'}`;
  if(role.kind==='specialist') return `Specialist · ${mathFieldName(role.specialty)}`;
  if(role.kind==='civilian') return `Civilian · ${role.profession||'Unknown profession'}`;
  if(role.kind==='police') return 'Police';
  return role.label||'Unknown role';
}
function postgameActionText(action,names){
  if(action.type==='spy') return `used the Sophon to observe ${names.get(action.targetId)||'their target'}`;
  if(action.type==='arrest') return `arrested ${names.get(action.targetId)||'a player'}`;
  if(action.type==='skipped') return 'was resolved as no move while disconnected';
  if(action.type==='advance') return `advanced ${mathFieldName(action.color)} ${signed(Number(action.effect||0))}`;
  return `${action.color||'unknown'} ${signed(Number(action.effect||0))}`;
}
function postgameHtml(state){
  const postgame=state.postgame||{roles:[],history:[],finalGuess:null};
  const names=new Map(postgame.roles.map(role=>[role.playerId,role.name]));
  const roleCards=postgame.roles.map(role=>`<article class="reveal-role-card">${roleSvg(role.kind)}<div><strong>${escapeHtml(role.name)}</strong><div class="reveal-role-name">${escapeHtml(role.label||role.kind||'Unknown')}</div><div class="small">${escapeHtml(postgameRoleDetail(role,names))}</div></div></article>`).join('');
  const rounds=postgame.history.map(entry=>{
    const dials=COLORS.map(color=>{ const before=Number(entry.before?.[color]||0); const after=Number(entry.after?.[color]||0); return `<div class="history-dial ${color}"><span><span aria-hidden="true">${DIAL_SYMBOLS[color]}</span> ${escapeHtml(state.mode==='mathbreaker'?mathFieldName(color):color)}</span><strong>${before} → ${after}</strong><small>${signed(after-before)}</small></div>`; }).join('');
    const actions=entry.actions.map(item=>`<div class="history-action ${item.arrested?'cancelled':''}"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.kind||'')}</span></div><div>${escapeHtml(postgameActionText(item.action,names))}${item.arrested?' · cancelled by arrest':''}</div></div>`).join('');
    const decayAction=state.mode==='mathbreaker'&&entry.decays?.length?`<div class="history-action"><div><strong>Wallbreaker</strong><span>decay</span></div><div>${COLORS.filter(color=>entry.decays.includes(color)).map(color=>`${mathFieldName(color)} ${signed(-entry.decays.filter(item=>item===color).length)}`).join(' · ')}</div></div>`:'';
    return `<details class="history-round" ${entry.round===postgame.history.length?'open':''}><summary><span>Round ${entry.round}</span><span>${entry.actions.length+(decayAction?1:0)} actions</span></summary><div class="history-dials">${dials}</div><div class="history-actions">${actions}${decayAction}</div></details>`;
  }).join('');
  const finalGuess=postgame.finalGuess;
  const guessDescription=finalGuess?.fields?finalGuess.fields.map(mathFieldName).join(' · '):Object.entries(finalGuess?.guess||{}).map(([color,value])=>`${color} ${value}`).join(' · ');
  const guessHtml=finalGuess?`<section class="panel stack final-guess"><strong>Final wall break</strong><div>${escapeHtml(names.get(finalGuess.playerId)||'A Wallbreaker')} guessed ${escapeHtml(guessDescription)}.</div><div class="${finalGuess.correct?'guess-correct':'guess-wrong'}">${finalGuess.correct?'The plan was identified.':'The guess was incorrect.'}</div></section>`:'';
  return `<section class="panel stack outcome"><div class="eyebrow">Game over</div><div class="win">${escapeHtml(state.winner)} win</div><div>${escapeHtml(state.reason)}</div></section><section class="postgame-section"><div class="postgame-heading"><div><div class="eyebrow">The truth</div><h2>Role reveal</h2></div><div class="small">Every identity is now public.</div></div><div class="reveal-role-grid">${roleCards}</div></section>${guessHtml}<section class="postgame-section"><div class="postgame-heading"><div><div class="eyebrow">Replay</div><h2>Round by round</h2></div><div class="small">Open a round to see every move.</div></div><div class="history-list">${rounds||'<div class="panel small">No round was completed before the final guess.</div>'}</div></section>`;
}
function gameScreen(state,role){
  if(state.mode==='mathbreaker') return mathbreakerGameScreen(state,role);
  const mine=state.players.find(p=>p.id===myPlayerId);
  const current=mine?.ready;
  const sophonHeader=role?.kind==='wallbreaker'?`<div class="sophon-inventory" aria-label="Choose one Sophon action each round"><span class="sophon-count">SOPHON · CHOOSE 1</span></div>`:'';
  const tutorialAids=state.mode==='tutorial'&&tutorialUI?tutorialUI.tutorialAidHtml({state,role,myPlayerId,isHost}):'';
  if(state.winner) return `<div class="shell postgame-shell"><div class="topbar"><div><div class="brand">${BRAND.name}</div><div class="meta">Room ${state.code}</div></div><button class="secondary" id="leave">${isHost?'End game':'Leave game'}</button></div>${postgameHtml(state)}${chatHtml()}</div>`;
  return `<div class="shell ${state.mode==='tutorial'?'tutorial-game-shell':''}"><div class="topbar"><div><div class="brand">ROUND ${state.round}/${state.maxRounds}</div><div class="meta">Room ${state.code}${state.mode==='tutorial'?' · Guided practice':''}</div></div><div class="row">${sophonHeader}<button class="secondary" id="show-role">Show role</button><button class="secondary" id="leave">${isHost?'End game':'Leave game'}</button></div></div>
  <div class="sr-only" role="status" aria-live="polite">${current?'Your move is locked.':`${state.players.filter(player=>player.ready).length} of ${state.players.length} players locked.`}</div>
  ${localView.error?`<div class="notice connection-notice">${escapeHtml(localView.error)}</div>`:''}
  ${state.paused?`<div class="notice">Game paused: ${escapeHtml(state.breakerName)} is attempting to break the wall.</div>`:''}
  ${!isHost?movePanelHtml(state,role,current):''}
  <div class="dial-board">${DIAL_GROUPS.map(group=>`<section class="dial-group"><div class="group-label">${group.name}</div><div class="dials">${group.colors.map(c=>isHost?observerDialCardHtml(c,state):dialCardHtml(c,state,role)).join('')}</div></section>`).join('')}</div>
  ${tutorialAids}
  ${omniscientHtml(state)}
  ${state.revealed?`<section class="panel stack"><strong>Last reveal</strong>${COLORS.map(c=>`<div class="card-line">${c.toUpperCase()}: ${signed(revealTotal(state.revealed,c))}</div>`).join('')}</section>`:''}
  ${localView.modal==='role'?`<div class="modal"><div class="modal-card">${roleHtml(role)}<hr><button class="secondary" id="close-modal">Close</button></div></div>`:''}
  ${localView.modal==='break'?breakModal():''}
  ${chatHtml()}
  </div>`;
}
function breakModal(){ return `<div class="modal"><div class="modal-card stack"><h2 class="role-title">Break the wall</h2><p class="small">Choose exactly three dials and guess each target.</p>${COLORS.map(c=>`<div class="row"><label style="min-width:110px"><input class="break-dial" type="checkbox" value="${c}" style="width:auto"> ${c}</label><input id="guess-${c}" type="number" min="0" max="9" value="5" style="max-width:100px"></div>`).join('')}<button class="danger" id="send-break">Submit final guess</button><button class="secondary" id="close-modal">Cancel</button></div></div>`; }
function mathbreakerGuessModal(role){
  const used=new Set(role?.mathGuessKeys||[]);
  return `<div class="modal"><div class="modal-card stack"><div class="eyebrow">Private guess · Round ${localView.state?.round}</div><h2 class="role-title">Which three fields matter?</h2><p class="small">This guess is private. You may guess once this turn, and an incorrect combination cannot be repeated.</p><div class="math-guess-grid">${COLORS.map(color=>`<label><input class="math-guess-field" type="checkbox" value="${color}"><span>${escapeHtml(mathFieldName(color))}</span></label>`).join('')}</div><div class="small">${used.size} of 20 combinations tested.</div><button class="danger" id="send-math-guess">Submit private guess</button><button class="secondary" id="close-modal">Cancel</button></div></div>`;
}
function mathbreakerDeclarationHtml(role){
  const pending=role?.mathBreakPending;
  if(!pending) return '';
  if(pending.kind==='wallbreaker') return `<div class="modal math-break-reveal"><div class="modal-card stack"><div class="eyebrow">The wall is broken</div><h2 class="role-title">Stand up and reveal yourself.</h2><p>Read this aloud before pressing the button:</p><blockquote>“${escapeHtml(pending.targetName)}, I am your Wallbreaker.”</blockquote><p>Then reveal the plan:</p><div class="card-list">${pending.fields.map(field=>`<div class="card-line">${escapeHtml(mathFieldName(field))}</div>`).join('')}</div><button class="danger" id="confirm-math-declaration">I read the line and revealed the plan</button></div></div>`;
  return `<div class="modal math-break-reveal"><div class="modal-card stack"><div class="eyebrow">Your wall has been broken</div><h2 class="role-title">The Wallbreaker identified your plan.</h2><p>Wait for them to stand, address you, and reveal the three fields aloud.</p></div></div>`;
}
function mathbreakerGameScreen(state,role){
  const current=state.players.find(player=>player.id===myPlayerId)?.ready;
  if(state.winner) return `<div class="shell postgame-shell mathbreaker-shell"><div class="topbar"><div><div class="brand">mathbreaker</div><div class="meta">Room ${state.code}</div></div><button class="secondary" id="leave">${isHost?'End game':'Leave game'}</button></div>${postgameHtml(state)}${chatHtml()}</div>`;
  const reveal=state.mathReveal;
  const revealNotice=state.phase==='math-reveal'?`<div class="notice math-reveal-notice"><strong>${reveal?.stage==='decay'?'Decay revealed':'Advancements revealed'}</strong><span>${reveal?.stage==='decay'?'The precommitted decay now takes effect.':'The Wallbreaker’s precommitted decay follows immediately.'}</span></div>`:'';
  const board=COLORS.map(color=>isHost?mathbreakerObserverDialCardHtml(color,state):mathbreakerDialCardHtml(color,state,role)).join('');
  const lastReveal=state.revealed?`<section class="panel stack"><strong>${reveal?.stage==='advancement'?'Advancement reveal':'Decay reveal'}</strong>${COLORS.map(color=>`<div class="card-line">${escapeHtml(mathFieldName(color))}: ${signed(revealTotal(state.revealed,color))}</div>`).join('')}</section>`:'';
  return `<div class="shell mathbreaker-shell"><div class="topbar"><div><div class="brand">mathbreaker · round ${state.round}</div><div class="meta">Room ${state.code} · Reach ${state.mathThreshold}</div></div><div class="row"><button class="secondary" id="show-role">Show role</button><button class="secondary" id="leave">${isHost?'End game':'Leave game'}</button></div></div>${revealNotice}${!isHost?mathbreakerMovePanelHtml(state,role,current):''}<div class="dial-board mathbreaker-board">${board}</div>${omniscientHtml(state)}${lastReveal}${localView.modal==='role'?`<div class="modal"><div class="modal-card">${roleHtml(role)}<hr><button class="secondary" id="close-modal">Close</button></div></div>`:''}${localView.modal==='math-guess'?mathbreakerGuessModal(role):''}${mathbreakerDeclarationHtml(role)}${chatHtml()}</div>`;
}
function legalNotice(){ return '<footer class="legal">Unofficial, noncommercial fan project. Not affiliated with or endorsed by the rights holders of <em>The Three-Body Problem</em>.</footer>'; }
function accessibilityControl(){ return `<button class="accessibility-control" id="toggle-contrast" aria-pressed="${highContrast}" title="Toggle high contrast">${highContrast?'Standard contrast':'High contrast'}</button>`; }
function loadTutorialUI(){
  if(tutorialUI||tutorialLoadPromise) return tutorialLoadPromise;
  tutorialLoadPromise=import('./tutorial.js').then(module=>{ tutorialUI=module; render(); return module; }).catch(()=>{ localView.error='The tutorial could not be loaded. Refresh and try again.'; render(); });
  return tutorialLoadPromise;
}
function tutorialScreen(state){
  if(!tutorialUI){ loadTutorialUI(); return '<div class="shell"><section class="panel">Loading the mission briefing…</section></div>'; }
  return tutorialUI.briefingHtml({state,step:localView.tutorialStep,isHost,myPlayerId});
}
function setTutorialStep(step){
  if(!tutorialUI) return;
  localView.tutorialStep=Math.max(0,Math.min(tutorialUI.TUTORIAL_STEP_COUNT-1,step)); render();
}
function markTutorialReady(){
  if(isHost||localView.state?.phase!=='tutorial') return;
  send(hostConn,{type:'tutorialReady',playerId:myPlayerId});
}
function render(){
  const s=localView.state;
  app.classList.toggle('host-view',isHost || location.pathname==='/host');
  app.classList.toggle('high-contrast',highContrast);
  if(localView.screen==='home') app.innerHTML=home();
  else if(localView.screen==='host') app.innerHTML=hostPage();
  else if(localView.screen==='connecting') app.innerHTML='<div class="shell"><div class="panel">Connecting…</div></div>';
  else if(localView.screen==='lobby') app.innerHTML=lobby(s);
  else if(s?.phase==='tutorial') app.innerHTML=tutorialScreen(s);
  else app.innerHTML=gameScreen(s,localView.role);
  app.insertAdjacentHTML('beforeend',accessibilityControl()+legalNotice());
  bind();
}
function bind(){
  document.querySelector('#create')?.addEventListener('click',createRoom);
  document.querySelector('#join')?.addEventListener('click',joinRoom);
  document.querySelector('#start')?.addEventListener('click',()=>startGame('standard'));
  document.querySelector('#start-tutorial')?.addEventListener('click',()=>startGame('tutorial'));
  document.querySelector('#start-mathbreaker')?.addEventListener('click',()=>startGame('mathbreaker'));
  document.querySelector('#tutorial-prev')?.addEventListener('click',()=>setTutorialStep(localView.tutorialStep-1));
  document.querySelector('#tutorial-next')?.addEventListener('click',()=>setTutorialStep(localView.tutorialStep+1));
  document.querySelector('#tutorial-ready')?.addEventListener('click',markTutorialReady);
  document.querySelector('#begin-tutorial-practice')?.addEventListener('click',beginTutorialPractice);
  document.querySelectorAll('[data-tutorial-step]').forEach(element=>element.addEventListener('click',()=>setTutorialStep(Number(element.dataset.tutorialStep))));
  document.querySelector('#role-count')?.addEventListener('input',e=>{ game.wallfacerCount=Number(e.target.value); broadcast(); });
  document.querySelector('#recommended-balance')?.addEventListener('click',()=>{ game.wallfacerCount=Math.max(1,Math.min(Math.floor(game.players.length/4)||1,Math.floor(game.players.length/2))); broadcast(); });
  document.querySelector('#police-enabled')?.addEventListener('change',e=>{ game.policeEnabled=e.target.checked; broadcast(); });
  document.querySelector('#round-limit')?.addEventListener('change',e=>{ game.maxRounds=Number(e.target.value); broadcast(); });
  document.querySelector('#submit')?.addEventListener('click',submitSelection);
  document.querySelectorAll('.dial-select').forEach(el=>el.addEventListener('click',()=>{ pendingSelection.color=el.dataset.color; pendingSelection.effect=0; pendingSelection.sophonMode='affect'; pendingSelection.policeMode='affect'; render(); }));
  document.querySelectorAll('.dial-action.adjust').forEach(el=>el.addEventListener('click',()=>{ pendingSelection.color=el.dataset.color; pendingSelection.effect=Number(el.dataset.effect); pendingSelection.sophonMode='affect'; pendingSelection.policeMode='affect'; render(); }));
  document.querySelectorAll('[data-math-advance]').forEach(el=>el.addEventListener('click',()=>{ const color=el.dataset.mathAdvance; pendingSelection.color=color; pendingSelection.effect=mathbreakerEffectFor(localView.role,color); render(); }));
  document.querySelectorAll('.decay-add').forEach(el=>el.addEventListener('click',()=>{ if(pendingSelection.decays.length<(localView.state?.goodPlayerCount||0)){ pendingSelection.decays.push(el.dataset.decayAdd); render(); } }));
  document.querySelectorAll('.decay-remove').forEach(el=>el.addEventListener('click',()=>{ const index=pendingSelection.decays.lastIndexOf(el.dataset.decayRemove); if(index>=0){ pendingSelection.decays.splice(index,1); render(); } }));
  document.querySelector('#spy-choice')?.addEventListener('click',()=>{ pendingSelection.color=null; pendingSelection.effect=null; pendingSelection.sophonMode='see'; render(); });
  document.querySelector('#arrest-choice')?.addEventListener('click',()=>{ pendingSelection.color=null; pendingSelection.effect=null; pendingSelection.policeMode='arrest'; render(); });
  document.querySelectorAll('.arrest-target').forEach(el=>el.addEventListener('click',()=>{ pendingSelection.arrestTarget=el.dataset.arrestTarget||null; render(); }));
  document.querySelector('#show-role')?.addEventListener('click',()=>{localView.modal='role';render();});
  document.querySelector('#close-modal')?.addEventListener('click',()=>{localView.modal=null;render();});
  document.querySelector('#break-now')?.addEventListener('click',()=>{ localView.modal=localView.state?.mode==='mathbreaker'?'math-guess':'break'; render(); });
  document.querySelector('#math-guess-now')?.addEventListener('click',()=>{ localView.modal='math-guess'; render(); });
  document.querySelector('#send-break')?.addEventListener('click',sendBreak);
  document.querySelector('#send-math-guess')?.addEventListener('click',sendMathbreakerGuess);
  document.querySelector('#confirm-math-declaration')?.addEventListener('click',confirmMathbreakerReveal);
  document.querySelector('#leave')?.addEventListener('click',leaveGame);
  document.querySelector('#copy-invite')?.addEventListener('click',copyInvite);
  document.querySelectorAll('.remove-player').forEach(el=>el.addEventListener('click',event=>{ event.stopPropagation(); removePlayer(el.dataset.playerId); }));
  document.querySelectorAll('.skip-player').forEach(el=>el.addEventListener('click',()=>skipDisconnectedPlayer(el.dataset.skipPlayer)));
  document.querySelector('#toggle-contrast')?.addEventListener('click',toggleHighContrast);
  document.querySelector('#chat-send')?.addEventListener('click',sendChat);
  document.querySelector('#chat-input')?.addEventListener('keydown',event=>{ if(event.key==='Enter') sendChat(); });
  document.querySelectorAll('.chat-contact').forEach(el=>el.addEventListener('click',()=>{ chatReplyTo=el.dataset.chatContact||null; if(chatReplyTo) delete chatUnread[chatReplyTo]; render(); }));
}
render();
if(location.pathname==='/host') resumeHost(); else resumeClient();
