import { BRAND, hostModeForPath as modeForHostPath, hostStorageName, storageKey } from './brand.js';
import { eyeSvg, roleSvg, wildRoleSvg } from './icons.js';
import { COLORS, SUBJECTS, WILD_ROLE_DEFINITIONS, MAX_WILD_PLAYERS, viewerAccess, clampDial, roleComposition, wildRoleComposition, knownWallfacerNames, victoryRevealStage, assignWildRoles, describeWildRoleType, isCompletedOneTimeWildRole, describeWildRole, evaluateWildRole, legalEffectsFor, isLegalSelection as selectionIsLegal, tryLockSelection, resolveRoundState, isPlanFieldGuess, isStandardPlanComplete, privateArrestOutcome, buildPostgameDisclosure, buildTutorialDisclosure } from './game-rules.js';

const DIAL_GROUPS = [{name:'Mathematics',colors:['yellow','pink']},{name:'Science',colors:['blue','green']},{name:'Agriculture',colors:['orange','red']}];
const EFFECTS = [-2,-1,1,2];
const MAX_ROUNDS = 10;

const app = document.querySelector('#app');
const query = new URLSearchParams(location.search);
function hostModeForPath(){ return modeForHostPath(location.pathname); }
function isHostRoute(){ return Boolean(hostModeForPath()); }
function hostStorageKey(){ return storageKey(hostStorageName(location.pathname)); }
function localAccess(){ return viewerAccess({isHost,adminPlaying:game.adminPlaying===true,playerId:myPlayerId}); }
let peer = null;
let hostConn = null;
let conns = new Map();
let clientId = localStorage.getItem(storageKey('client-id')) || crypto.randomUUID?.() || `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
localStorage.setItem(storageKey('client-id'), clientId);
let isHost = false;
let myName = query.get('name') || '';
let myPlayerId = null;
function freshPendingSelection(){ return {color:null,effect:null,sophonMode:'affect',policeMode:'affect',arrestTarget:null}; }
let pendingSelection = freshPendingSelection();
let reconnecting = false;
let noticeQueue = [];
const shownNoticeKeys = new Set();
let chatMessages = [];
let chatReplyTo = null;
let chatUnread = {};
let audioContext = null;
let lastCountdownSound = null;
let revealAnimationTimer = null;
let countdownTimer = null;
let victoryRevealTimer = null;
let tutorialUI = null;
let tutorialLoadPromise = null;
let localView = { screen:isHostRoute() ? 'host' : 'home', state:null, role:null, error:'', modal:null, revealKey:'', revealAnimationPending:false, tutorialStep:0 };

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
function clearSession(){ localStorage.removeItem(storageKey('session')); }
function clearHostSession(){
  localStorage.removeItem(hostStorageKey());
  if(hostModeForPath()==='standard') localStorage.removeItem(storageKey('host'));
}
function saveHost(){ localStorage.setItem(hostStorageKey(),JSON.stringify({code:game.code,game})); }
function broadcast(){
  if(isHost) saveHost();
  for(const [pid,conn] of conns){
    const player = game.players.find(p=>p.id===pid);
    send(conn,{type:'state', state:publicState(pid), role:roleFor(player)});
  }
  const access=localAccess();
  const previousRound=localView.state?.round;
  const nextState=publicState(access.viewerId);
  const nextRevealKey=`${nextState.round}:${JSON.stringify(nextState.revealed)}`;
  if(nextState.revealed && nextRevealKey!==localView.revealKey){
    localView.revealKey=nextRevealKey; localView.revealAnimationPending=true;
    clearTimeout(revealAnimationTimer);
    revealAnimationTimer=setTimeout(()=>{ localView.revealAnimationPending=false; render(); },3000);
  }
  if(previousRound!==nextState.round&&nextState.phase==='playing') pendingSelection=freshPendingSelection();
  localView.state = nextState;
  localView.role = access.player?roleFor(game.players.find(p=>p.id===access.viewerId)):null;
  if(nextState.phase==='victory-reveal'){ localView.modal=null; noticeQueue=[]; }
  queueOutcomeModals(nextState,localView.role);
  render();
}
function publicState(viewerId=null){
  const state={
    code:game.code, mode:game.mode||'standard', phase:game.phase, countdown:game.countdown||0, round:game.round, maxRounds:game.maxRounds, dials:game.dials, playerCount:game.players.length, wallfacerCount:game.wallfacerCount, includeMessaging:game.includeMessaging===true, wildRolesEnabled:game.wildRolesEnabled===true,
    players:game.players.map(p=>({id:p.id,name:p.name,ready:!!game.selections[p.id],connected:Boolean(conns.get(p.id)?.open)||(game.adminPlaying===true&&p.id===myPlayerId)})),
    adminPlaying:game.adminPlaying, paused:game.paused, breakerName:game.breakerName,
    revealed:game.revealed, revealedBefore:game.revealedBefore, wrappedColors:game.wrappedColors||[], winner:game.winner, reason:game.reason
  };
  if(game.phase==='victory-reveal') state.victoryReveal={stage:victoryRevealStage(game.victoryReveal)};
  state.wallfacerNames=knownWallfacerNames(game.players,game.roles);
  const lockedSelection=viewerId?game.selections[viewerId]:null;
  if(lockedSelection) state.lockedSelection={...lockedSelection};
  if(game.phase==='ended') state.recap={active:game.recap?.active===true,roundIndex:game.recap?.roundIndex||0,totalRounds:game.history?.length||0};
  const planValues=Object.values(game.roles).find(role=>role?.kind==='wallfacer')?.plan?.values||{};
  state.postgame=buildPostgameDisclosure(game.phase,game.players,game.roles,game.history,game.finalGuess,game.recap,viewerId,{initialDials:game.initialDials||game.dials,finalDials:game.dials,planValues,winner:game.winner});
  if(!state.postgame) delete state.postgame;
  if(game.mode==='tutorial') state.tutorial=buildTutorialDisclosure(game.mode,game.players,game.roles,game.selections,game.tutorialReady,game.history,viewerId);
  return state;
}
function roleFor(player){
  if(!player || !game.roles[player.id]) return null;
  const r=game.roles[player.id];
  const arrestOutcome=privateArrestOutcome(player.id,r,game.players,game.arrested,game.history);
  if(r.kind==='wallfacer') return {...r,...arrestOutcome};
  if(r.kind==='wallbreaker'){
    const target=game.players.find(p=>p.id===r.targetId);
    return {...r,...arrestOutcome,targetName:target?.name||'Unknown'};
  }
  if(r.kind==='wild'){
    const planValues=Object.values(game.roles).find(role=>role?.kind==='wallfacer')?.plan?.values||{};
    const wildStatus=evaluateWildRole({role:r,playerId:player.id,players:game.players,history:game.history,initialDials:game.initialDials||game.dials,finalDials:game.dials,planValues,winner:game.winner});
    return {...r,...arrestOutcome,wildObjective:describeWildRole(r,game.players),wildStatus};
  }
  return {...r,...arrestOutcome};
}
let game = freshGame();
function randomDials(){ return Object.fromEntries(COLORS.map(c=>[c,Math.floor(Math.random()*10)])); }
function freshGame(){ return {code:'',mode:'standard',phase:'lobby',round:1,maxRounds:MAX_ROUNDS,wallfacerCount:1,includeMessaging:false,wildRolesEnabled:false,initialDials:null,dials:randomDials(),players:[],roles:{},selections:{},arrested:{},history:[],finalGuess:null,recap:{active:false,roundIndex:0},victoryReveal:null,tutorialReady:{},adminPlaying:true,paused:false,breakerName:'',revealed:null,revealedBefore:null,wrappedColors:[],winner:null,reason:''}; }

function beginGoalVictory(winner,reason){
  const now=Date.now();
  game.winner=winner;
  game.reason=reason;
  game.phase='victory-reveal';
  game.victoryReveal={lightAt:now+3000,endsAt:now+4400};
  scheduleVictoryReveal();
}
function scheduleVictoryReveal(){
  if(!isHost||game.phase!=='victory-reveal'||victoryRevealTimer) return;
  const stage=victoryRevealStage(game.victoryReveal);
  if(stage==='ended'){
    game.phase='ended';
    game.victoryReveal=null;
    broadcast();
    return;
  }
  const boundary=stage==='dials'?game.victoryReveal.lightAt:game.victoryReveal.endsAt;
  victoryRevealTimer=setTimeout(()=>{
    victoryRevealTimer=null;
    if(game.phase!=='victory-reveal') return;
    if(victoryRevealStage(game.victoryReveal)==='ended'){
      scheduleVictoryReveal();
      return;
    }
    broadcast();
    scheduleVictoryReveal();
  },Math.max(0,boundary-Date.now()));
}

function createPlan(){
  const values={};
  for(const c of [...COLORS].sort(()=>Math.random()-.5).slice(0,3)) values[c]=Math.floor(Math.random()*10);
  return {values};
}
function assignRoles(){
  const players=[...game.players];
  if(players.length<3) throw new Error('At least 3 players are required so Police is always included.');
  const composition=roleComposition(players.length);
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
  shuffled.slice(wallfacerCount*2+(police?1:0)).forEach(p=>{ game.roles[p.id]={kind:'civilian',label:'Specialist',profession:civilianKinds[Math.floor(Math.random()*civilianKinds.length)]}; });
  if(game.mode==='standard'&&game.wildRolesEnabled===true){
    const assignment=assignWildRoles({players:game.players,roles:game.roles,dials:game.initialDials||game.dials});
    game.roles=assignment.roles;
  }
}
function checkWallfacerWin(){
  for(const p of game.players){
    const r=game.roles[p.id];
    if(r?.kind==='wallfacer'){
      const ok=isStandardPlanComplete(game.dials,r.plan.values);
      if(ok){ beginGoalVictory('Loyal team',`${p.name} completed the plan.`); return true; }
    }
  }
  return false;
}
function resolveRound(){
  const entries=Object.entries(game.selections);
  if(entries.length!==game.players.length) return;
  const roundSelections=game.selections;
  const resolution=resolveRoundState({dials:game.dials,selections:roundSelections,players:game.players,roles:game.roles,round:game.round});
  game.arrested=resolution.arrested;
  game.dials=resolution.after;
  game.revealed=resolution.net;
  game.revealedBefore=resolution.before;
  game.wrappedColors=[...new Set(resolution.wraps.map(item=>item.color))];
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
  if(game.round>=game.maxRounds){ game.winner='Wallbreaker'; game.reason=`Round ${game.maxRounds} ended without the Wallfacer completing the plan.`; game.phase='ended'; }
  else game.round++;
  broadcast();
}
function attemptBreak(playerId, colors){
  const role=game.roles[playerId];
  if(role?.kind!=='wallbreaker') return;
  const targetRole=game.roles[role.targetId];
  const plan=targetRole.plan;
  const guessColors=Array.isArray(colors)?[...colors]:[];
  const correct=isPlanFieldGuess(plan.values,guessColors);
  game.finalGuess={playerId,targetId:role.targetId,colors:guessColors,correct};
  game.winner=correct?'Wallbreaker':'Loyal team';
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
    const pendingHostSeat=game.adminPlaying===true&&!game.players.some(player=>player.id===clientId);
    if(game.mode==='standard'&&game.wildRolesEnabled===true&&game.players.length+(pendingHostSeat?1:0)>=MAX_WILD_PLAYERS){ send(conn,{type:'error',message:`Wild Roles games are capped at ${MAX_WILD_PLAYERS} players.`}); return; }
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
  if(msg.type==='breakGuess' && game.phase==='playing') attemptBreak(msg.playerId,msg.colors);
  if(msg.type==='chat' && game.includeMessaging===true && typeof msg.text==='string'){
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
    const wasPlaying=localView.state?.phase==='playing';
    const previousRound=localView.state?.round;
    if(msg.state.phase==='countdown' && msg.state.countdown!==lastCountdownSound){ lastCountdownSound=msg.state.countdown; playTung(); }
    const nextRevealKey=`${msg.state.round}:${JSON.stringify(msg.state.revealed)}`;
    if(msg.state.revealed && nextRevealKey!==localView.revealKey){
      localView.revealKey=nextRevealKey; localView.revealAnimationPending=true;
      clearTimeout(revealAnimationTimer);
      revealAnimationTimer=setTimeout(()=>{ localView.revealAnimationPending=false; render(); },3000);
    }
    if(previousRound!==msg.state.round&&msg.state.phase==='playing') pendingSelection=freshPendingSelection();
    localView.state=msg.state; localView.role=msg.role; localView.error=''; localView.screen=['lobby','countdown'].includes(msg.state.phase)?'lobby':'game'; saveClientSession();
    if(msg.state.phase==='victory-reveal'){ localView.modal=null; noticeQueue=[]; }
    if(msg.state.mode==='tutorial') loadTutorialUI();
    if(msg.state.phase==='playing'&&!wasPlaying) localView.modal='role';
    queueOutcomeModals(msg.state,msg.role);
    render();
  }
  if(msg.type==='error'){ localView.error=msg.message; render(); }
  if(msg.type==='removed'){
    clearSession(); peer?.destroy?.();
    localView={screen:'home',state:null,role:null,error:msg.message||'You were removed from the room.',modal:null};
    render();
  }
  if(msg.type==='chat' && localView.state?.includeMessaging===true && typeof msg.text==='string'){
    chatMessages.push({from:msg.from||'Observer',text:msg.text}); render();
  }
}

function syncHostPlayerName(rawName,{required=false}={}){
  if(!isHost||game.adminPlaying!==true) return true;
  const name=String(rawName||'').trim();
  const existing=game.players.find(player=>player.id===clientId);
  if(!name){
    if(existing) game.players=game.players.filter(player=>player.id!==clientId);
    myPlayerId=clientId; myName='';
    if(required) localView.error='Enter your name to play as a normal player.';
    return false;
  }
  if(game.players.some(player=>player.id!==clientId&&player.name.toLowerCase()===name.toLowerCase())){
    localView.error='That name is already being used by another player.';
    return false;
  }
  myPlayerId=clientId; myName=name;
  if(existing) existing.name=name;
  else game.players.push({id:clientId,name});
  localView.error='';
  return true;
}

function setHostParticipation(role){
  if(!isHost||game.phase!=='lobby'||!['player','observer'].includes(role)) return;
  const playing=role==='player';
  const joiningAsPlayer=playing&&!game.players.some(player=>player.id===clientId);
  if(joiningAsPlayer&&game.mode==='standard'&&game.wildRolesEnabled===true&&game.players.length>=MAX_WILD_PLAYERS){
    localView.error=`Wild Roles games are capped at ${MAX_WILD_PLAYERS} players.`; render(); return;
  }
  game.adminPlaying=playing;
  game.includeMessaging=!playing;
  if(playing){
    myPlayerId=clientId;
    syncHostPlayerName(myName);
  } else {
    game.players=game.players.filter(player=>player.id!==clientId);
    delete game.roles[clientId]; delete game.selections[clientId];
    myPlayerId=null;
  }
  pendingSelection=freshPendingSelection(); localView.role=null; localView.modal=null; localView.error='';
  broadcast();
}

async function createRoom(){
  myName=document.querySelector('#name')?.value.trim() || '';
  localView.error=''; const code=fourDigit();
  try{
    await setupPeerAsHost(code); isHost=true; game=freshGame(); game.code=code; game.mode=hostModeForPath()||'standard'; myPlayerId=clientId;
    syncHostPlayerName(myName);
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
  if((isHost?game.includeMessaging:localView.state?.includeMessaging)!==true) return;
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
function chatInitials(name=''){ return name.split(/\s+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2).toUpperCase()||'?'; }
function chatHtml(){
  if((isHost?game.includeMessaging:localView.state?.includeMessaging)!==true) return '';
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
  const currentSaved=localStorage.getItem(hostStorageKey());
  const legacySaved=hostModeForPath()==='standard'?localStorage.getItem(storageKey('host')):null;
  const saved=JSON.parse(currentSaved||legacySaved||'null');
  if(!saved?.code||!saved.game) return;
  if((saved.game.mode||'standard')!==hostModeForPath()) return;
  try {
    await setupPeerAsHost(saved.code); isHost=true; game=saved.game; game.mode ||= 'standard'; game.wallfacerCount=1; game.maxRounds ||= MAX_ROUNDS; game.adminPlaying=game.adminPlaying===true; game.includeMessaging=!game.adminPlaying; game.wildRolesEnabled=game.mode==='standard'&&game.wildRolesEnabled===true; game.initialDials ||= game.phase==='lobby'?null:{...game.dials}; game.history ||= []; game.finalGuess ||= null; game.recap ||= {active:false,roundIndex:0}; game.victoryReveal ||= null; game.tutorialReady ||= {};
    const legacyWildRoles={doomsayer:['extremist','Extremist'],curator:['moderate','Moderate'],contrarian:['disruptor','Disruptor'],hermit:['loner','Loner']};
    Object.values(game.roles||{}).forEach(role=>{ const migrated=role?.kind==='wild'?legacyWildRoles[role.wildRole]:null; if(migrated){ [role.wildRole,role.label]=migrated; } });
    myPlayerId=game.adminPlaying?clientId:null;
    if(game.adminPlaying) myName=game.players.find(player=>player.id===clientId)?.name||myName;
    if(!currentSaved){ saveHost(); localStorage.removeItem(storageKey('host')); }
    localView.screen=['lobby','countdown'].includes(game.phase)?'lobby':'game'; localView.state=publicState(); if(game.mode==='tutorial') loadTutorialUI(); render();
    if(game.phase==='countdown') beginCountdown();
    if(game.phase==='victory-reveal') scheduleVictoryReveal();
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
  if(!saved?.code||!saved.name||isHostRoute()) return;
  myName=saved.name; document.querySelector('#name')?.setAttribute('value',myName); localView.error='';
  try { await setupPeerAsClient(); attachClientConnection(peer.connect(roomPeerId(saved.code),{reliable:true})); localView.screen='connecting'; render(); } catch { localView.error='Unable to reconnect yet. Retrying…'; localView.screen='connecting'; render(); retryClientConnection(1500); }
}
function giveUpReconnection(){
  reconnecting=false;
  hostConn?.close?.(); hostConn=null;
  peer?.destroy?.(); peer=null;
  clearSession(); myPlayerId=null;
  pendingSelection=freshPendingSelection(); noticeQueue=[];
  localView={screen:'home',state:null,role:null,error:'',modal:null,revealKey:'',revealAnimationPending:false,tutorialStep:0};
  render();
}
function leaveGame(){ if(isHost){ peer?.destroy(); clearHostSession(); location.href=location.pathname; return; } send(hostConn,{type:'leave',playerId:myPlayerId}); peer?.destroy(); clearSession(); localView={screen:'home',state:null,role:null,error:'',modal:null}; render(); }
function startPostgameRecap(){
  if(!isHost||game.phase!=='ended'||game.recap?.active) return;
  game.recap={active:true,roundIndex:0};
  broadcast();
}
function advancePostgameRecap(){
  if(!isHost||game.phase!=='ended'||game.recap?.active!==true) return;
  const lastIndex=Math.max(0,(game.history?.length||0)-1);
  if(game.recap.roundIndex>=lastIndex) return;
  game.recap.roundIndex++;
  broadcast();
}
function returnToLobby(){
  if(!isHost||game.phase!=='ended') return;
  const room={code:game.code,mode:game.mode,players:game.players,wallfacerCount:game.wallfacerCount,maxRounds:game.maxRounds,includeMessaging:game.includeMessaging,wildRolesEnabled:game.wildRolesEnabled,adminPlaying:game.adminPlaying};
  game=Object.assign(freshGame(),room);
  pendingSelection=freshPendingSelection();
  localView.screen='lobby'; localView.role=null; localView.modal=null; localView.error='';
  broadcast();
}
function resetGameStart(mode){
  game.mode=mode; game.round=1; game.selections={}; game.arrested={}; game.history=[]; game.finalGuess=null; game.recap={active:false,roundIndex:0}; game.victoryReveal=null; game.revealed=null; game.revealedBefore=null; game.wrappedColors=[]; game.winner=null; game.reason=''; game.tutorialReady={}; game.paused=false;
  game.initialDials={...game.dials};
  pendingSelection=freshPendingSelection(); localView.modal=null; localView.tutorialStep=0; noticeQueue=[]; shownNoticeKeys.clear();
}
function startGame(){
  const mode=game.mode||'standard';
  try{
    if(game.adminPlaying===true){
      const enteredName=document.querySelector('#host-player-name')?.value??myName;
      if(!syncHostPlayerName(enteredName,{required:true})) throw new Error(localView.error);
    }
    if(game.players.length<3) throw new Error('At least 3 players are required so Police is always included.');
    if(mode==='standard'&&game.wildRolesEnabled===true&&game.players.length<4) throw new Error('Wild Roles requires at least 4 players so at least one Wild Role can be assigned.');
    if(mode==='standard'&&game.wildRolesEnabled===true&&game.players.length>MAX_WILD_PLAYERS) throw new Error(`Wild Roles games are capped at ${MAX_WILD_PLAYERS} players so one Wild Role always remains unoccupied.`);
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
    if(game.countdown===0){ assignRoles(); game.phase='playing'; delete game.countdown; clearInterval(countdownTimer); countdownTimer=null; localView.modal=localAccess().player?'role':null; }
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
  const selection=role?.kind==='wallbreaker'&&sophonMode==='see' ? {sophonMode:'see'} : role?.kind==='police'&&policeMode==='arrest' ? {policeMode:'arrest',arrestTarget:pendingSelection.arrestTarget} : {color,effect,sophonMode:'affect',policeMode:'affect'};
  if(!isLegalSelection(myPlayerId,selection)) return;
  if(isHost){
    if(!tryLockSelection(game.selections,myPlayerId,selection,item=>isLegalSelection(myPlayerId,item))) return;
    if(Object.keys(game.selections).length===game.players.length) resolveRound(); else broadcast();
  } else send(hostConn,{type:'lockSelection',playerId:myPlayerId,selection});
}
function pauseForBreak(){ localView.modal='break'; render(); }
function sendBreak(){
  const colors=[...document.querySelectorAll('.break-dial:checked')].map(input=>input.value);
  if(colors.length!==3){ alert('Choose exactly three dial colors.'); return; }
  if(isHost) attemptBreak(myPlayerId,colors); else send(hostConn,{type:'breakGuess',playerId:myPlayerId,colors});
  localView.modal=null; render();
}
function queueOutcomeModals(state,role){
  if(!localAccess().player||!state||!role||state.phase==='victory-reveal') return;
  const candidates=[];
  if(role.arrested||role.arrestedPlayerName){
    candidates.push({type:'arrest-outcome',key:`arrest:${state.round}:${role.arrested?'target':role.arrestedPlayerName}`});
  }
  if(role.kind==='wallbreaker'&&role.sophonResult){
    candidates.push({type:'sophon-result',key:`sophon:${state.round}:${JSON.stringify(role.sophonResult)}`});
  }
  for(const candidate of candidates){
    if(shownNoticeKeys.has(candidate.key)) continue;
    shownNoticeKeys.add(candidate.key);
    noticeQueue.push(candidate.type);
  }
  if(!localView.modal&&noticeQueue.length) localView.modal=noticeQueue.shift();
}
function dismissModal(){
  localView.modal=null;
  if(noticeQueue.length) localView.modal=noticeQueue.shift();
  render();
}
function arrestOutcomeModal(role){
  if(localView.modal!=='arrest-outcome') return '';
  const arrested=role?.arrested;
  const title=arrested?'You were arrested':'Arrest confirmed';
  const copy=arrested
    ? 'Police arrested you last round. Your locked dial effect was cancelled.'
    : `You arrested ${escapeHtml(role?.arrestedPlayerName||'that player')} last round. Their locked dial effect was cancelled.`;
  return `<div class="modal outcome-modal" role="dialog" aria-modal="true" aria-labelledby="arrest-outcome-title"><div class="modal-card stack"><div class="modal-icon danger-icon">${roleSvg('police')}</div><div><div class="eyebrow">Private result</div><h2 class="role-title" id="arrest-outcome-title">${title}</h2></div><p>${copy}</p><button id="close-modal">Dismiss</button></div></div>`;
}
function sophonResultModal(role){
  if(localView.modal!=='sophon-result'||!role?.sophonResult) return '';
  const result=role.sophonResult;
  const observed=result.systemSkipped?'No move · disconnected':`${escapeHtml(result.color)} ${result.effect>0?'+':''}${result.effect}`;
  return `<div class="modal outcome-modal" role="dialog" aria-modal="true" aria-labelledby="sophon-result-title"><div class="modal-card stack"><div class="modal-icon sophon-icon">${eyeSvg()}</div><div><div class="eyebrow">Sophon observation</div><h2 class="role-title" id="sophon-result-title">The Wallfacer locked</h2></div><div class="observed-result">${observed}</div><button id="close-modal">Dismiss</button></div></div>`;
}
function arrestPickerModal(state){
  if(localView.modal!=='arrest-picker') return '';
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="arrest-picker-title"><div class="modal-card stack"><div class="role-heading">${roleSvg('police')}<div><div class="eyebrow">Private action</div><h2 class="role-title" id="arrest-picker-title">Who will you arrest?</h2></div></div><p class="small">Choose one player. Their locked dial effect will be cancelled when the round resolves.</p><div class="arrest-choices">${state.players.filter(player=>player.id!==myPlayerId).map(player=>`<button class="arrest-target ${pendingSelection.arrestTarget===player.id?'selected':''}" data-arrest-target="${escapeHtml(player.id)}"><span class="chat-avatar">${chatInitials(player.name)}</span><span>${escapeHtml(player.name)}</span>${pendingSelection.arrestTarget===player.id?'<strong>Selected</strong>':''}</button>`).join('')}</div><button class="secondary" id="close-modal">Cancel</button></div></div>`;
}
function outcomeModalsHtml(state,role){
  return arrestOutcomeModal(role)||sophonResultModal(role)||arrestPickerModal(state);
}

function knownWallfacerHtml(state){
  const names=state?.wallfacerNames||[];
  if(!names.length) return '';
  const label=names.length===1?'Wallfacer':'Wallfacers';
  return `<div class="known-wallfacer" role="status">${label}: ${names.map(escapeHtml).join(' · ')}</div>`;
}
function wildSegmentsHtml(value,goal){
  const safeGoal=Math.max(1,Number(goal)||1);
  const safeValue=Math.max(0,Math.min(Number(value)||0,safeGoal));
  return `<div class="wild-progress-segments" style="--wild-goal:${safeGoal}" aria-label="${safeValue} of ${safeGoal} complete">${Array.from({length:safeGoal},(_,index)=>`<i class="${index<safeValue?'complete':''}"></i>`).join('')}</div>`;
}
function wildProgressHtml(role,status,state=localView.state){
  if(!status) return '';
  const details=status.details||{};
  const evidence=`<div class="small wild-progress-evidence">${escapeHtml(status.evidence)}</div>`;
  if(role.wildRole==='bounty'){
    const targetIds=Array.isArray(role.wildData?.targetIds)?role.wildData.targetIds:role.wildData?.targetId?[role.wildData.targetId]:[];
    const targetStatus=new Map((details.targets||[]).map(target=>[target.targetId,target]));
    return `<div class="wild-bounty-targets">${targetIds.map(targetId=>{
      const target=state?.players?.find(player=>player.id===targetId);
      const name=target?.name||'Assigned player';
      const arrested=targetStatus.get(targetId)?.arrested===true;
      return `<div class="wild-bounty-target ${arrested?'arrested':''}"><span class="chat-avatar">${escapeHtml(chatInitials(name))}</span><strong>${escapeHtml(name)}</strong>${arrested?'<span class="wild-target-arrest-x" aria-hidden="true">×</span><span class="sr-only">Arrested</span>':''}</div>`;
    }).join('')}</div>`;
  }
  if(role.wildRole==='extremist') return '';
  if(role.wildRole==='conservationist'){
    const eligible=Number(state?.round)>=4;
    return `<div class="wild-total-readout" aria-label="Starting dial total ${escapeHtml(String(details.initial))}; current dial total ${escapeHtml(String(details.current))}"><div><span>Starting total</span><strong>${escapeHtml(String(details.initial))}</strong></div><div><span>Current total</span><strong>${escapeHtml(String(details.current))}</strong></div></div><div class="small wild-progress-evidence">${eligible?'This round can complete your goal.':'Your first eligible round is round 4.'}</div>`;
  }
  const value=Math.max(0,Math.min(Number(status.progress)||0,status.goal));
  const label=role.wildRole==='disruptor'?'wrong-way dials':role.wildRole==='numerologist'?'matching dials':role.wildRole==='wrapper'?'wrapped dials':'solitary rounds';
  return `<div class="wild-subtle-progress"><span>${label}</span><strong>${value}/${status.goal}</strong></div>${wildSegmentsHtml(value,status.goal)}`;
}
function wildMissionPanelHtml(role,state=localView.state){
  if(!localAccess().player||role?.kind!=='wild'||isCompletedOneTimeWildRole(role)||['extremist','moderate','oddball','numerologist'].includes(role.wildRole)) return '';
  return `<section class="panel wild-status-panel ${['disruptor','loner','oddball','numerologist','wrapper'].includes(role.wildRole)?'subtle':''}" aria-label="${escapeHtml(role.label)} progress">${wildProgressHtml(role,role.wildStatus,state)}</section>`;
}
function wildRoleGuideModal(){
  if(localView.modal!=='wild-guide') return '';
  const cards=Object.entries(WILD_ROLE_DEFINITIONS).map(([roleId,definition])=>`<article class="wild-guide-role">${wildRoleSvg(roleId)}<div><strong>${escapeHtml(definition.label)}</strong><p>${escapeHtml(describeWildRoleType(roleId))}</p></div></article>`).join('');
  return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="wild-guide-title"><div class="modal-card stack wild-guide-modal"><div><div class="eyebrow">Public reference</div><h2 class="role-title" id="wild-guide-title">Wild Roles</h2></div><p class="small">Complete your Wild goal and help the Wallfacer team win. A completed goal stays complete. Wild players never see the Wallfacer's plan. The Wallbreaker privately knows one unoccupied role they can claim as a cover.</p><div class="wild-guide-grid">${cards}</div><button class="secondary" id="close-modal">Close</button></div></div>`;
}
function roleHtml(role,state=localView.state){
  if(!role) return '<p>No role assigned.</p>';
  const name=role.kind==='police'?'Shi Qiang'
    : role.kind==='civilian'?`${role.profession} Specialist`
      : role.kind==='wallbreaker'?'Wallbreaker'
        : role.kind==='wild'?role.label:'Wallfacer';
  const oneTimeComplete=isCompletedOneTimeWildRole(role);
  const quietBinaryGoal=['moderate','oddball','numerologist'].includes(role.wildRole);
  const wildObjective=role.kind==='wild'?`<section class="wild-role-objective ${oneTimeComplete?'goal-complete':''}"><div class="eyebrow">Wild goal · Loyal${oneTimeComplete?' · Goal achieved':''}</div><p>${escapeHtml(role.wildObjective||'Complete your private Wild goal and help the Wallfacer team win.')}</p>${oneTimeComplete?'<div class="wild-goal-achieved-callout">Goal achieved · Help the Wallfacer team win</div>':quietBinaryGoal?'':wildProgressHtml(role,role.wildStatus,state)}</section>`:'';
  const wallbreakerWildIntel=role.kind==='wallbreaker'&&role.unoccupiedWildRole&&WILD_ROLE_DEFINITIONS[role.unoccupiedWildRole]
    ? `<section class="wallbreaker-wild-intel">${wildRoleSvg(role.unoccupiedWildRole)}<div><div class="eyebrow">Wild Roles clue</div><p><strong>${escapeHtml(WILD_ROLE_DEFINITIONS[role.unoccupiedWildRole].label)}</strong> is not in this game.</p></div></section>`:'';
  const icon=role.kind==='wild'?wildRoleSvg(role.wildRole):roleSvg(role.kind);
  return `<div class="role-only"><div class="eyebrow">Your role</div>${icon}<h2 class="role-title">${escapeHtml(name)}</h2></div>${wildObjective}${wallbreakerWildIntel}${knownWallfacerHtml(state)}`;
}
function omniscientHtml(state){
  if(!localAccess().observer) return '';
  return `<section class="panel stack omniscient"><div class="section-title">${roleSvg('omniscient')}<div><strong>Observer view</strong><div class="small">Roles and plans are visible; private arrest outcomes stay hidden.</div></div></div><div class="role-grid">${state.players.map(p=>{ const r=game.roles[p.id]; const plan=r?.plan?.values; const wildDetail=r?.kind==='wild'?describeWildRole(r,game.players):''; const icon=r?.kind==='wild'?wildRoleSvg(r.wildRole):roleSvg(r?.kind); return `<div class="role-card">${icon}<div class="role-card-copy"><div class="player-name-line"><strong>${escapeHtml(p.name)}</strong>${connectionBadgeHtml(p)}</div><div class="small">${escapeHtml(r?.label||'Unassigned')}${r?.targetId?` · targets ${escapeHtml(game.players.find(x=>x.id===r.targetId)?.name||'Unknown')}`:''}</div>${wildDetail?`<div class="small">${escapeHtml(wildDetail)}</div>`:''}${plan?`<div class="small">${Object.entries(plan).map(([c,v])=>`${c} ${v}`).join(' · ')}</div>`:''}${!p.connected&&!p.ready&&state.phase==='playing'?`<button class="skip-player" data-skip-player="${escapeHtml(p.id)}">Resolve as no move</button>`:''}</div></div>`; }).join('')}</div></section>`;
}
function hostOperationsHtml(state){
  if(!isHost||localAccess().observer||state.phase!=='playing') return '';
  const disconnected=state.players.filter(player=>!player.connected&&!player.ready);
  if(!disconnected.length) return '';
  return `<section class="panel stack"><div><strong>Host controls</strong><div class="small">Connection status only—no private roles or moves.</div></div><div class="players">${disconnected.map(player=>`<div class="player"><div class="player-name-line"><span>${escapeHtml(player.name)}</span>${connectionBadgeHtml(player)}</div><button class="skip-player" data-skip-player="${escapeHtml(player.id)}">Resolve as no move</button></div>`).join('')}</div></section>`;
}
function currentRoleFor(playerId){
  return isHost ? game.roles[playerId] : localView.role;
}
function isLegalSelection(playerId,selection){
  const role=currentRoleFor(playerId);
  const players=isHost?game.players:(localView.state?.players||[]);
  return selectionIsLegal(role,selection,players,playerId);
}
function dialCardHtml(c,state,role){
  const locked=state.players.find(p=>p.id===myPlayerId)?.ready;
  const selection=locked&&state.lockedSelection?state.lockedSelection:pendingSelection;
  const selected=selection.color===c&&selection.sophonMode!=='see'&&selection.policeMode!=='arrest';
  const effects=legalEffectsFor(role,c);
  const orderedEffects=effects.length===4?[2,1,-1,-2]:[1,-1];
  const button=(effect)=>`<button class="dial-action adjust ${selected&&selection.effect===effect?'selected-action':''}" data-color="${c}" data-effect="${effect}" aria-label="${effect<0?'Decrease':'Increase'} ${c} by ${Math.abs(effect)}" ${locked||state.paused?'disabled':''}>${effect>0?'+':''}${effect}</button>`;
  const lockEffect=locked&&selected?selection.effect:null;
  const arrows=lockEffect?`<span class="lock-arrows ${lockEffect>0?'up':'down'}" style="--lock-speed:${Math.abs(lockEffect)===2?'.55s':'1.1s'}" aria-hidden="true">${lockEffect>0?'↑':'↓'}</span>`:'';
  const visiblePlan=role?.kind==='wallfacer'?role.plan?.values:null;
  const planValue=visiblePlan?.[c];
  const planTarget=planValue!==undefined?`<span class="plan-target-marker"><i></i>Target ${planValue}</span>`:'';
  const oneTimeComplete=isCompletedOneTimeWildRole(role);
  const extremistTarget=!oneTimeComplete&&role?.kind==='wild'&&role.wildRole==='extremist'&&role.wildData?.color===c;
  const extremistDirection=extremistTarget?(Number(role.wildData?.targetValue)===0?'down':'up'):'';
  const extremistIndicator=extremistTarget?`<span class="extremist-edge-indicator ${extremistDirection}" aria-hidden="true"></span>`:'';
  const wrapperWrapped=!oneTimeComplete&&role?.kind==='wild'&&role.wildRole==='wrapper'&&(role.wildStatus?.details?.qualifyingDials||[]).some(item=>item.color===c);
  const wrapperIndicator=wrapperWrapped?`<span class="wrapper-dial-indicator" aria-hidden="true">${wildRoleSvg('wrapper')}</span>`:'';
  const dialLabel=`${c}, value ${state.dials[c]}${planValue!==undefined?`, Loyal target ${planValue}`:''}${extremistTarget?`, Extremist target ${role.wildData.targetValue}`:''}${wrapperWrapped?', already wrapped for Wrapper goal':''}`;
  return `<div class="dial ${c} dial-card standard-dial-card ${selected?'selected':''} ${lockEffect?'locked-preview':''} ${planValue!==undefined?'plan-target':''} ${extremistTarget?`extremist-target extremist-${extremistDirection}`:''} ${wrapperWrapped?'wrapper-goal-dial':''} ${dialRevealClass(state,c)}" ${dialRevealStyle(state,c)}><div class="dial-face"><div class="dial-select" aria-label="${dialLabel}"><span class="name">${c}</span>${dialValueHtml(c,state)}</div>${planTarget}</div><div class="dial-actions action-count-${orderedEffects.length}">${orderedEffects.map(button).join('')}</div>${arrows}${extremistIndicator}${wrapperIndicator}</div>`;
}
function observerDialCardHtml(c,state){
  return `<div class="dial ${c} dial-card standard-dial-card observer-dial ${dialRevealClass(state,c)}" ${dialRevealStyle(state,c)}><div class="dial-face"><div class="dial-select"><span class="name">${c}</span>${dialValueHtml(c,state)}</div></div></div>`;
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
  const prior=Number.isFinite(Number(state.revealedBefore?.[c]))?Number(state.revealedBefore[c]):clampDial(final-total);
  const direction=total>0?'dial-up':total<0?'dial-down':'dial-flat';
  const wrapped=state.wrappedColors?.includes(c)?'<span class="dial-wrapped-badge">Wrapped</span>':'';
  return `<div class="value-window ${direction}"><span class="dial-delta dial-delta-up ${total>0?'active':''}">+1</span><div class="value-reel"><span class="reveal-adjacent">${total>0?final:prior}</span><span class="value">${prior}</span><span class="reveal-adjacent">${total<0?final:prior}</span></div><span class="dial-delta dial-delta-down ${total<0?'active':''}">-1</span></div>${wrapped}`;
}
function movePanelHtml(state,role,current){
  const selection=current&&state.lockedSelection?state.lockedSelection:pendingSelection;
  const chosen=selection.sophonMode==='see'?"Spy on Wallfacer's move":selection.color?`${selection.color} ${selection.effect>0?'+':''}${selection.effect}`:'Select a dial and adjustment';
  const spy=role?.kind==='wallbreaker'?`<button class="spy-choice ${selection.sophonMode==='see'?'selected':''}" id="spy-choice" aria-pressed="${selection.sophonMode==='see'}" ${current?'disabled':''}>${eyeSvg()}<span>Spy on Wallfacer's move</span></button>`:'';
  const arrest=role?.kind==='police'?`<button class="spy-choice ${selection.policeMode==='arrest'?'selected':''}" id="arrest-choice" aria-pressed="${selection.policeMode==='arrest'}" ${current?'disabled':''}>${roleSvg('police')}<span>${selection.arrestTarget?'Arrest selected player':'Arrest someone for this turn'}</span></button>`:'';
  const hasChoice=role?.kind==='wallbreaker' ? selection.sophonMode==='see'||(selection.color&&EFFECTS.includes(selection.effect)) : role?.kind==='police' ? selection.policeMode==='arrest'?Boolean(selection.arrestTarget):(selection.color&&EFFECTS.includes(selection.effect)) : Boolean(selection.color&&EFFECTS.includes(selection.effect));
  const summary=role?.kind==='police'&&selection.policeMode==='arrest'?(selection.arrestTarget?'Arrest selected player':'Choose a player'):chosen;
  const lockedLabel=role?.kind==='wallbreaker'&&selection.sophonMode==='see'?'Locked in · spying':role?.kind==='police'&&selection.policeMode==='arrest'?`Locked in · arrest selected player`:`Locked in · ${chosen}`;
  const guess=role?.kind==='wallbreaker'?'<button class="danger" id="break-now">Guess combination</button>':'';
  return `<section class="panel stack move-panel"><div class="move-summary"><strong>Your move</strong><span>${current?lockedLabel:summary}</span></div>${spy}${arrest}<button id="submit" ${state.paused||current||!hasChoice?'disabled':''}>${current?lockedLabel:'Lock selection'}</button>${guess}<div class="small">${state.players.filter(p=>p.ready).length}/${state.players.length} locked</div></section>`;
}
function productBrandHtml(){ return `<div class="product-brand"><img class="brand-mark" src="/logo.svg" alt="" width="28" height="28"><div class="brand">${BRAND.name}</div></div>`; }
function home(){ const inviteCode=new URLSearchParams(location.search).get('room')?.match(/^\d{6}$/)?.[0]||''; return `<div class="shell"><div class="topbar">${productBrandHtml()}<a class="secondary-link" href="/rules">How to play →</a></div><section class="panel stack"><h2>Join game</h2><input id="name" placeholder="Name" value="${escapeHtml(myName)}"><input id="code" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="6" placeholder="6-digit room code" value="${inviteCode}"><button id="join">Join room</button></section>${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`; }
function hostPage(){
  const mode=hostModeForPath()||'standard';
  const title=mode==='tutorial'?'Host the tutorial':'Host Wallbreaker';
  const description=mode==='tutorial'?'Create a guided Wallbreaker teaching room.':'Create a room for the Wallfacer, the Wallbreaker, Shi Qiang, and any additional Specialists.';
  const navigation=mode==='standard'?`<div class="host-mode-links"><a href="/tutorial/host">Host the guided tutorial</a><a href="/preview">Open the UI preview lab</a></div>`:`<a class="secondary-link" href="/host">← Back to Wallbreaker hosting</a>`;
  return `<div class="shell"><div class="topbar">${productBrandHtml()}<a class="secondary-link" href="/rules">How to play →</a></div><section class="panel stack"><span class="mode-kicker">${mode==='tutorial'?'GUIDED':'MAIN GAME'}</span><h2>${title}</h2><p class="small">${description}</p><button id="create">Create room</button>${navigation}</section>${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`;
}
function connectionBadgeHtml(player){
  return `<span class="connection-badge ${player.connected?'connected':'disconnected'}"><span aria-hidden="true"></span>${player.connected?'Connected':'Disconnected'}</span>`;
}
function lobby(state){
  const wildPackActive=state.mode==='standard'&&state.wildRolesEnabled===true;
  const shownComposition=wildRoleComposition(state.players.length,wildPackActive);
  const civilianLabel='Specialist';
  const civilianCount=shownComposition.civilians;
  const wildComposition=wildPackActive?`<div><strong>${shownComposition.wilds}</strong><span>Wild Role${shownComposition.wilds===1?'':'s'}</span></div>`:'';
  const compositionHtml=`<div class="composition" aria-label="Planned role composition"><div><strong>${shownComposition.wallfacers}</strong><span>Wallfacer${shownComposition.wallfacers===1?'':'s'}</span></div><div><strong>${shownComposition.wallbreakers}</strong><span>Wallbreaker${shownComposition.wallbreakers===1?'':'s'}</span></div><div><strong>${shownComposition.police}</strong><span>Police</span></div><div><strong>${civilianCount}</strong><span>${civilianLabel}${civilianCount===1?'':'s'}</span></div>${wildComposition}</div>`;
  const countdown=state.phase==='countdown'?`<div class="countdown" role="status" aria-live="polite">Starting in <strong>${state.countdown}</strong>…</div>`:'';
  const playerRows=state.players.map(p=>`<div class="player"><div class="player-name-line"><span>${escapeHtml(p.name)}${isHost&&p.id===myPlayerId?' · You':''}</span>${connectionBadgeHtml(p)}</div>${isHost&&p.id!==myPlayerId?`<button class="secondary remove-player" data-player-id="${escapeHtml(p.id)}">Remove</button>`:''}</div>`).join('')||'<div class="small">Waiting for players…</div>';
  const selectedMode=state.mode||'standard';
  const pendingHostSeat=state.adminPlaying===true&&!state.players.some(player=>player.id===myPlayerId);
  const potentialPlayerCount=state.players.length+(pendingHostSeat?1:0);
  const canStart=potentialPlayerCount>=3&&(!wildPackActive||(potentialPlayerCount>=4&&potentialPlayerCount<=MAX_WILD_PLAYERS))&&state.phase==='lobby';
  const modeName=selectedMode==='tutorial'?'Wallbreaker tutorial':'Wallbreaker';
  const roundChoices=`<div class="discrete-setting"><strong>Round limit</strong><div class="choice-pills" aria-label="Round limit">${[6,8,10,12].map(rounds=>`<button class="secondary round-choice ${state.maxRounds===rounds?'selected':''}" data-round-limit="${rounds}" aria-pressed="${state.maxRounds===rounds}">${rounds}</button>`).join('')}</div></div>`;
  const hostPlaying=state.adminPlaying===true;
  const participationSetting=`<div class="participation-setting"><div class="role-toggle" role="group" aria-label="Your role in this game"><button class="secondary ${hostPlaying?'selected':''}" type="button" data-host-role="player" aria-pressed="${hostPlaying}" ${state.phase!=='lobby'?'disabled':''}>I want to play as a normal player</button><button class="secondary ${hostPlaying?'':'selected'}" type="button" data-host-role="observer" aria-pressed="${!hostPlaying}" ${state.phase!=='lobby'?'disabled':''}>I want to play as observer</button></div>${hostPlaying?`<input id="host-player-name" autocomplete="name" aria-label="Your player name" placeholder="Your name" value="${escapeHtml(myName)}" ${state.phase!=='lobby'?'disabled':''} required>`:''}</div>`;
  const wildSetting=selectedMode==='standard'?`<label class="toggle-setting"><input id="wild-roles" type="checkbox" ${wildPackActive?'checked':''} ${state.phase!=='lobby'?'disabled':''}><strong>Wild Roles</strong></label>`:'';
  const standardRoleCopy=wildPackActive?`The three core roles stay fixed; every Specialist seat becomes a different Loyal Wild Role. Maximum ${MAX_WILD_PLAYERS} players, leaving one role unoccupied for the Wallbreaker to bluff.`:'One Wallfacer, one Wallbreaker, one Shi Qiang, and a Specialist in every remaining seat.';
  const standardSettings=`<div class="setting-heading"><div><strong>Fixed standard roles</strong><div class="small">${standardRoleCopy}</div></div></div>${compositionHtml}${roundChoices}`;
  const startControl=state.phase==='countdown'?'<button disabled>Starting…</button>':`<button class="start-selected-mode" id="start-game" ${canStart?'':'disabled'}>Start ${modeName}</button>`;
  const settings=isHost?`<div class="selected-mode-readout"><span class="mode-kicker">HOSTING</span><strong>${modeName}</strong></div><div class="lobby-settings">${standardSettings}${wildSetting}${participationSetting}</div><button class="secondary" id="copy-invite">Copy invite link</button>${startControl}<button class="secondary" id="leave">End game</button>`:`<div class="selected-mode-readout"><span class="mode-kicker">SELECTED MODE</span><strong>${modeName}</strong></div>${compositionHtml}<button class="secondary" id="leave">Leave game</button>`;
  return `<div class="shell"><div class="topbar"><div>${productBrandHtml()}<div class="meta">Room · ${state.playerCount} players</div></div><div class="code">${state.code}</div></div><section class="panel stack">${countdown}<div class="players">${playerRows}</div>${settings}</section>${chatHtml()}${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`;
}
function postgameRoleDetail(role,names){
  if(role.kind==='wallfacer') return `Plan · ${Object.entries(role.plan?.values||{}).map(([color,value])=>`${color} ${value}`).join(' · ')}`;
  if(role.kind==='wallbreaker'){
    const absentRole=WILD_ROLE_DEFINITIONS[role.unoccupiedWildRole]?.label;
    return `Targeted ${names.get(role.targetId)||'Unknown'}${absentRole?` · knew ${absentRole} was unoccupied`:''}`;
  }
  if(role.kind==='civilian') return `Specialist · ${role.profession||'Unknown specialty'}`;
  if(role.kind==='police') return 'Police';
  if(role.kind==='wild') return describeWildRole(role,[...names].map(([id,name])=>({id,name})));
  return role.label||'Unknown role';
}
function postgameActionText(action,names){
  if(action.type==='spy') return `used the Sophon to observe ${names.get(action.targetId)||'their target'}`;
  if(action.type==='arrest') return `arrested ${names.get(action.targetId)||'a player'}`;
  if(action.type==='private') return 'kept their action private';
  if(action.type==='skipped') return 'was resolved as no move while disconnected';
  return `${action.color||'unknown'} ${signed(Number(action.effect||0))}`;
}
function postgameActionsHtml(state){
  if(!isHost){
    const message=state.recap?.active?'The host is guiding the recap.':'Waiting for the host to choose what happens next.';
    return `<section class="panel postgame-waiting"><div class="eyebrow">Observer controls</div><strong>${message}</strong></section>`;
  }
  if(!state.recap?.active){
    return `<section class="panel stack postgame-menu"><div><div class="eyebrow">What next?</div><h2>Choose the ending.</h2></div><div class="postgame-menu-actions"><button class="danger" id="leave">End game</button><button id="start-recap">See recap</button><button class="secondary" id="return-lobby">Return to lobby</button></div></section>`;
  }
  const recap=state.postgame?.recap;
  const advance=recap&&!recap.complete?`<button id="advance-recap">Show round ${recap.roundIndex+2}</button>`:'';
  return `<section class="panel stack postgame-menu"><div><div class="eyebrow">Host controls</div><strong>${recap?.complete?'Recap complete':'Advance when everyone is ready.'}</strong></div><div class="postgame-menu-actions ${advance?'':'two-actions'}">${advance}<button class="danger" id="leave">End game</button><button class="secondary" id="return-lobby">Return to lobby</button></div></section>`;
}
function postgameHtml(state){
  const outcome=`<section class="panel stack outcome"><div class="eyebrow">Game over</div><div class="win">${escapeHtml(state.winner)} win</div><div>${escapeHtml(state.reason)}</div></section>`;
  if(!state.recap?.active) return `${outcome}${postgameActionsHtml(state)}`;
  const postgame=state.postgame||{roles:[],history:[],finalGuess:null,recap:{roundIndex:0,totalRounds:0,complete:true}};
  const names=new Map(postgame.roles.map(role=>[role.playerId,role.name]));
  const roleCards=postgame.roles.map(role=>`<article class="reveal-role-card">${role.kind==='wild'?wildRoleSvg(role.wildRole):roleSvg(role.kind)}<div><strong>${escapeHtml(role.name)}</strong><div class="reveal-role-name">${escapeHtml(role.label||role.kind||'Unknown')}</div><div class="small">${escapeHtml(postgameRoleDetail(role,names))}</div></div></article>`).join('');
  const rounds=postgame.history.map(entry=>{
    const dials=COLORS.map(color=>{ const before=Number(entry.before?.[color]||0); const after=Number(entry.after?.[color]||0); const wrapped=(entry.wraps||[]).some(item=>item.color===color); const change=wrapped?`${signed(Number(entry.net?.[color]||0))} · wrapped`:signed(after-before); return `<div class="history-dial ${color}"><span>${escapeHtml(color)}</span><strong>${before} → ${after}</strong><small>${escapeHtml(change)}</small></div>`; }).join('');
    const actions=entry.actions.map(item=>`<div class="history-action ${item.arrested?'cancelled':''}"><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.kind||'')}</span></div><div>${escapeHtml(postgameActionText(item.action,names))}${item.arrested?' · cancelled by arrest':''}</div></div>`).join('');
    return `<article class="history-round recap-round"><div class="recap-round-heading"><span>Round ${entry.round}</span><span>${entry.actions.length} actions</span></div><div class="history-dials">${dials}</div><div class="history-actions">${actions}</div></article>`;
  }).join('');
  const finalGuess=postgame.finalGuess;
  const guessDescription=finalGuess?.colors?.join(' · ')||'';
  const guessHtml=finalGuess?`<section class="panel stack final-guess"><strong>Final wall break</strong><div>${escapeHtml(names.get(finalGuess.playerId)||'A Wallbreaker')} guessed ${escapeHtml(guessDescription)}.</div><div class="${finalGuess.correct?'guess-correct':'guess-wrong'}">${finalGuess.correct?'The plan was identified.':'The guess was incorrect.'}</div></section>`:'';
  const wildResults=postgame.wildResults||[];
  const wildResultsHtml=wildResults.length?`<section class="postgame-section"><div class="postgame-heading"><div><div class="eyebrow">Loyal specialists</div><h2>Wild Role results</h2></div><div class="small">A Wild player wins if their goal is satisfied and the Wallfacer team wins.</div></div><div class="wild-result-grid">${wildResults.map(result=>`<article class="panel wild-result ${result.won?'met':'missed'}">${wildRoleSvg(result.roleId)}<div><strong>${escapeHtml(result.name)} · ${escapeHtml(result.label)}</strong><div class="reveal-role-name">${result.won?'Goal satisfied · Wallfacer team won':result.met?'Goal satisfied · Wallfacer team lost':'Goal not completed'}</div><p class="small">${escapeHtml(result.objective)}</p><div class="small">${escapeHtml(result.evidence)}</div></div></article>`).join('')}</div></section>`:'';
  const roundLabel=postgame.recap.totalRounds?`Round ${postgame.recap.roundIndex+1} of ${postgame.recap.totalRounds}`:'No completed rounds';
  return `${outcome}${postgameActionsHtml(state)}<section class="postgame-section"><div class="postgame-heading"><div><div class="eyebrow">The truth</div><h2>Role reveal</h2></div><div class="small">Every identity and special assignment is now public.</div></div><div class="reveal-role-grid">${roleCards}</div></section>${wildResultsHtml}<section class="postgame-section"><div class="postgame-heading"><div><div class="eyebrow">Recap</div><h2>${roundLabel}</h2></div><div class="small">The host advances each round for the room.</div></div><div class="history-list">${rounds||'<div class="panel small">No round was completed before the final guess.</div>'}</div></section>${guessHtml}`;
}
function victoryRevealHtml(state){
  if(state.phase!=='victory-reveal') return '';
  if(state.victoryReveal?.stage!=='light') return '<div class="sr-only" role="status" aria-live="assertive">The final dials are resolving.</div>';
  return `<div class="victory-light" role="status" aria-live="assertive"><div><span>Goal achieved</span><strong>${escapeHtml(state.reason)}</strong></div></div>`;
}
function gameScreen(state,role){
  const access=localAccess();
  const mine=state.players.find(p=>p.id===myPlayerId);
  const current=mine?.ready;
  const sophonHeader=role?.kind==='wallbreaker'?`<div class="sophon-inventory" aria-label="Choose one Sophon action each round"><span class="sophon-count">SOPHON · CHOOSE 1</span></div>`:'';
  const tutorialAids=state.mode==='tutorial'&&tutorialUI?tutorialUI.tutorialAidHtml({state,role,myPlayerId,isHost}):'';
  const oneTimeComplete=access.player&&isCompletedOneTimeWildRole(role);
  if(state.phase==='ended') return `<div class="shell postgame-shell"><div class="topbar"><div>${productBrandHtml()}<div class="meta">Room ${state.code}</div></div>${isHost?'':`<button class="secondary" id="leave">Leave game</button>`}</div>${postgameHtml(state)}${outcomeModalsHtml(state,role)}${chatHtml()}</div>`;
  return `<div class="shell ${state.mode==='tutorial'?'tutorial-game-shell':''} ${oneTimeComplete?'wild-goal-complete-shell':''} ${state.phase==='victory-reveal'?`goal-victory-stage-${state.victoryReveal?.stage||'dials'}`:''}"><div class="topbar"><div><div class="brand">ROUND ${state.round}/${state.maxRounds}</div><div class="meta">Room ${state.code}${state.mode==='tutorial'?' · Guided practice':''}</div></div><div class="row">${sophonHeader}${state.wildRolesEnabled?'<button class="secondary" id="show-wild-guide">Wild roles</button>':''}${access.player&&state.phase==='playing'?'<button class="secondary" id="show-role">Show role</button>':''}<button class="secondary" id="leave">${isHost?'End game':'Leave game'}</button></div></div>
  <div class="sr-only" role="status" aria-live="polite">${current?'Your move is locked.':`${state.players.filter(player=>player.ready).length} of ${state.players.length} players locked.`}</div>
  ${localView.error?`<div class="notice connection-notice">${escapeHtml(localView.error)}</div>`:''}
  ${state.paused?`<div class="notice">Game paused: ${escapeHtml(state.breakerName)} is attempting to break the wall.</div>`:''}
  ${knownWallfacerHtml(state)}
  ${access.player&&state.phase==='playing'?movePanelHtml(state,role,current):''}
  ${wildMissionPanelHtml(role,state)}
  <div class="dial-board">${DIAL_GROUPS.map(group=>`<section class="dial-group"><div class="group-label">${group.name}</div><div class="dials">${group.colors.map(c=>access.observer?observerDialCardHtml(c,state):dialCardHtml(c,state,role)).join('')}</div></section>`).join('')}</div>
  ${tutorialAids}
  ${omniscientHtml(state)}
  ${hostOperationsHtml(state)}
  ${state.revealed?`<section class="panel stack"><strong>Last reveal</strong>${COLORS.map(c=>`<div class="card-line">${c.toUpperCase()}: ${signed(revealTotal(state.revealed,c))}</div>`).join('')}</section>`:''}
  ${localView.modal==='role'?`<div class="modal"><div class="modal-card">${roleHtml(role)}<hr><button class="secondary" id="close-modal">Close</button></div></div>`:''}
  ${wildRoleGuideModal()}
  ${localView.modal==='break'?breakModal():''}
  ${outcomeModalsHtml(state,role)}
  ${victoryRevealHtml(state)}
  ${chatHtml()}
  </div>`;
}
function breakModal(){ return `<div class="modal"><div class="modal-card stack"><h2 class="role-title">Guess the plan</h2><p class="small">Choose the three dial colors in the Wallfacer's plan. You do not guess their values. A correct guess wins; an incorrect guess gives the Loyal team the win.</p><div class="math-guess-grid standard-guess-grid">${COLORS.map(color=>`<label class="${color}"><input class="break-dial" type="checkbox" value="${color}"><span>${color}</span></label>`).join('')}</div><button class="danger" id="send-break">Submit final guess</button><button class="secondary" id="close-modal">Cancel</button></div></div>`; }
function legalNotice(){ return '<footer class="legal">Unofficial, noncommercial fan project. Not affiliated with or endorsed by the rights holders of <em>The Three-Body Problem</em>.</footer>'; }
function loadTutorialUI(){
  if(tutorialUI||tutorialLoadPromise) return tutorialLoadPromise;
  tutorialLoadPromise=import('./tutorial.js').then(module=>{ tutorialUI=module; render(); return module; }).catch(()=>{ localView.error='The tutorial could not be loaded. Refresh and try again.'; render(); });
  return tutorialLoadPromise;
}
function tutorialScreen(state){
  if(!tutorialUI){ loadTutorialUI(); return '<div class="shell"><section class="panel">Loading the guided rules…</section></div>'; }
  return tutorialUI.briefingHtml({state,step:localView.tutorialStep,isHost,isPlayer:localAccess().player,myPlayerId});
}
function setTutorialStep(step){
  if(!tutorialUI) return;
  localView.tutorialStep=Math.max(0,Math.min(tutorialUI.TUTORIAL_STEP_COUNT-1,step)); render();
}
function markTutorialReady(){
  if(localView.state?.phase!=='tutorial'||!localAccess().player) return;
  if(isHost){ game.tutorialReady[myPlayerId]=true; broadcast(); }
  else send(hostConn,{type:'tutorialReady',playerId:myPlayerId});
}
function render(){
  const s=localView.state;
  app.classList.toggle('host-view',isHost || isHostRoute());
  if(localView.screen==='home') app.innerHTML=home();
  else if(localView.screen==='host') app.innerHTML=hostPage();
  else if(localView.screen==='connecting') app.innerHTML=`<div class="shell reconnect-shell"><section class="panel stack"><div class="reconnect-spinner" aria-hidden="true"></div><div><h2>Reconnecting…</h2><p class="small">${escapeHtml(localView.error||'Looking for the room and restoring your seat.')}</p></div>${localStorage.getItem(storageKey('session'))?'<button class="secondary" id="give-up-reconnect">Give up and return home</button>':''}</section></div>`;
  else if(localView.screen==='lobby') app.innerHTML=lobby(s);
  else if(s?.phase==='tutorial') app.innerHTML=tutorialScreen(s);
  else app.innerHTML=gameScreen(s,localView.role);
  app.insertAdjacentHTML('beforeend',legalNotice());
  bind();
}
function bind(){
  document.querySelector('#create')?.addEventListener('click',createRoom);
  document.querySelector('#join')?.addEventListener('click',joinRoom);
  document.querySelector('#start-game')?.addEventListener('click',startGame);
  document.querySelector('#tutorial-prev')?.addEventListener('click',()=>setTutorialStep(localView.tutorialStep-1));
  document.querySelector('#tutorial-next')?.addEventListener('click',()=>setTutorialStep(localView.tutorialStep+1));
  document.querySelector('#tutorial-ready')?.addEventListener('click',markTutorialReady);
  document.querySelector('#begin-tutorial-practice')?.addEventListener('click',beginTutorialPractice);
  document.querySelectorAll('[data-tutorial-step]').forEach(element=>element.addEventListener('click',()=>setTutorialStep(Number(element.dataset.tutorialStep))));
  document.querySelectorAll('[data-round-limit]').forEach(element=>element.addEventListener('click',()=>{ game.maxRounds=Number(element.dataset.roundLimit); broadcast(); }));
  document.querySelector('#wild-roles')?.addEventListener('change',event=>{
    if(!isHost||game.mode!=='standard'||game.phase!=='lobby') return;
    if(event.target.checked&&game.players.length>MAX_WILD_PLAYERS){ localView.error=`Remove players until the room has ${MAX_WILD_PLAYERS} or fewer before enabling Wild Roles.`; render(); return; }
    game.wildRolesEnabled=event.target.checked; localView.error=''; broadcast();
  });
  document.querySelectorAll('[data-host-role]').forEach(element=>element.addEventListener('click',()=>setHostParticipation(element.dataset.hostRole)));
  document.querySelector('#host-player-name')?.addEventListener('change',event=>{ if(syncHostPlayerName(event.target.value)) broadcast(); else render(); });
  document.querySelector('#host-player-name')?.addEventListener('keydown',event=>{ if(event.key==='Enter'){ event.preventDefault(); event.currentTarget.blur(); } });
  document.querySelector('#submit')?.addEventListener('click',submitSelection);
  document.querySelectorAll('.dial-action.adjust').forEach(el=>el.addEventListener('click',()=>{ if(localView.state?.players.find(player=>player.id===myPlayerId)?.ready) return; pendingSelection.color=el.dataset.color; pendingSelection.effect=Number(el.dataset.effect); pendingSelection.sophonMode='affect'; pendingSelection.policeMode='affect'; render(); }));
  document.querySelector('#spy-choice')?.addEventListener('click',()=>{ if(localView.state?.players.find(player=>player.id===myPlayerId)?.ready) return; pendingSelection.color=null; pendingSelection.effect=null; pendingSelection.sophonMode='see'; pendingSelection.policeMode='affect'; render(); });
  document.querySelector('#arrest-choice')?.addEventListener('click',()=>{ if(localView.state?.players.find(player=>player.id===myPlayerId)?.ready) return; pendingSelection.color=null; pendingSelection.effect=null; pendingSelection.sophonMode='affect'; pendingSelection.policeMode='arrest'; localView.modal='arrest-picker'; render(); });
  document.querySelectorAll('.arrest-target').forEach(el=>el.addEventListener('click',()=>{ if(localView.state?.players.find(player=>player.id===myPlayerId)?.ready) return; pendingSelection.arrestTarget=el.dataset.arrestTarget||null; dismissModal(); }));
  document.querySelector('#show-role')?.addEventListener('click',()=>{localView.modal='role';render();});
  document.querySelector('#show-wild-guide')?.addEventListener('click',()=>{localView.modal='wild-guide';render();});
  document.querySelector('#close-modal')?.addEventListener('click',dismissModal);
  document.querySelector('#break-now')?.addEventListener('click',()=>{ localView.modal='break'; render(); });
  document.querySelector('#send-break')?.addEventListener('click',sendBreak);
  document.querySelector('#start-recap')?.addEventListener('click',startPostgameRecap);
  document.querySelector('#advance-recap')?.addEventListener('click',advancePostgameRecap);
  document.querySelector('#return-lobby')?.addEventListener('click',returnToLobby);
  document.querySelector('#leave')?.addEventListener('click',leaveGame);
  document.querySelector('#give-up-reconnect')?.addEventListener('click',giveUpReconnection);
  document.querySelector('#copy-invite')?.addEventListener('click',copyInvite);
  document.querySelectorAll('.remove-player').forEach(el=>el.addEventListener('click',event=>{ event.stopPropagation(); removePlayer(el.dataset.playerId); }));
  document.querySelectorAll('.skip-player').forEach(el=>el.addEventListener('click',()=>skipDisconnectedPlayer(el.dataset.skipPlayer)));
  document.querySelector('#chat-send')?.addEventListener('click',sendChat);
  document.querySelector('#chat-input')?.addEventListener('keydown',event=>{ if(event.key==='Enter') sendChat(); });
  document.querySelectorAll('.chat-contact').forEach(el=>el.addEventListener('click',()=>{ chatReplyTo=el.dataset.chatContact||null; if(chatReplyTo) delete chatUnread[chatReplyTo]; render(); }));
  document.querySelector('.modal')?.addEventListener('click',event=>{ if(event.target===event.currentTarget) dismissModal(); });
  app.onkeydown=event=>{ if(event.key==='Escape'&&localView.modal){ event.preventDefault(); dismissModal(); } };
}
render();
if(isHostRoute()) resumeHost(); else resumeClient();
