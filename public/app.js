import { BRAND, storageKey } from './brand.js';

const COLORS = ["yellow", "pink", "orange", "red", "blue", "green"];
const SUBJECTS = { mathematics: ["yellow", "pink"], agriculture: ["orange", "red"], science: ["blue", "green"] };
const DIAL_GROUPS = [{name:'Mathematics',colors:['yellow','pink']},{name:'Science',colors:['blue','green']},{name:'Agriculture',colors:['orange','red']}];
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
let pendingSelection = {color:null,effect:null,sophonMode:'affect'};
let reconnecting = false;
let chatMessages = [];
let chatReplyTo = null;
let revealAnimationTimer = null;
let localView = { screen:location.pathname === '/host' ? 'host' : 'home', state:null, role:null, error:'', modal:null, revealKey:'', revealAnimationPending:false };

function roomPeerId(code){ return `${BRAND.peerNamespace}-${code}`; }
function fourDigit(){ return String(Math.floor(100000 + Math.random()*900000)); }
function clamp(n){ return Math.max(0, Math.min(9, n)); }
function escapeHtml(s=''){ return s.replace(/[&<>'"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c])); }
function send(conn, msg){
  if(!conn) return;
  if(conn.open) conn.send(msg);
  else conn.once?.('open',()=>{ if(conn.open) conn.send(msg); });
}
function saveClientSession(){ if(game.code&&myName) localStorage.setItem(storageKey('session'),JSON.stringify({code:game.code,name:myName})); }
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
  return {
    code:game.code, phase:game.phase, round:game.round, dials:game.dials, playerCount:game.players.length, wallfacerCount:game.wallfacerCount,
    players:game.players.map(p=>({id:p.id,name:p.name,ready:!!game.selections[p.id]})),
    adminPlaying:game.adminPlaying, paused:game.paused, breakerName:game.breakerName,
    revealed:game.revealed, winner:game.winner, reason:game.reason
  };
}
function roleFor(player){
  if(!player || !game.roles[player.id]) return null;
  const r=game.roles[player.id];
  if(r.kind==='wallfacer') return {...r};
  if(r.kind==='wallbreaker'){
    const target=game.players.find(p=>p.id===r.targetId);
    return {...r,targetName:target?.name||'Unknown'};
  }
  return {...r};
}
function roleSvg(kind){
  const icon = kind==='wallfacer' ? '<path d="M12 3 4.5 6v5.2c0 4.4 3.1 7.6 7.5 9.8 4.4-2.2 7.5-5.4 7.5-9.8V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>' : kind==='wallbreaker' ? '<path d="m5 4 14 8-14 8 3-8-3-8Z"/><path d="M10 12h8"/>' : '<circle cx="12" cy="12" r="8"/><path d="M8 12h8M12 8v8"/>';
  return `<svg class="role-svg" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
}
function eyeSvg(){ return '<svg class="eye-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>'; }

let game = freshGame();
function randomDials(){ return Object.fromEntries(COLORS.map(c=>[c,Math.floor(Math.random()*10)])); }
function freshGame(){ return {code:'',phase:'lobby',round:1,wallfacerCount:1,dials:randomDials(),players:[],roles:{},selections:{},adminPlaying:false,paused:false,breakerName:'',revealed:null,winner:null,reason:''}; }

function createPlan(){
  const values={};
  for(const c of [...COLORS].sort(()=>Math.random()-.5).slice(0,3)) values[c]=Math.floor(Math.random()*10);
  return {values};
}
function assignRoles(){
  const players=[...game.players];
  const wallfacerCount=Math.max(1,Math.min(game.wallfacerCount,Math.floor(players.length/2)));
  if(players.length<2) throw new Error('At least 2 players are required.');
  const shuffled=[...players].sort(()=>Math.random()-.5);
  const wallfacers=shuffled.slice(0,wallfacerCount);
  const wallbreakers=shuffled.slice(wallfacerCount,wallfacerCount*2);
  game.roles={};
  wallfacers.forEach(p=>{ game.roles[p.id]={kind:'wallfacer',label:'Wallfacer',plan:createPlan()}; });
  wallbreakers.forEach((p,i)=>{ game.roles[p.id]={kind:'wallbreaker',label:'Wallbreaker',targetId:wallfacers[i % wallfacers.length].id,sophonResult:null}; });
  const civilianKinds=Object.keys(SUBJECTS);
  shuffled.slice(wallfacerCount*2).forEach(p=>{ game.roles[p.id]={kind:'civilian',label:'Civilian',profession:civilianKinds[Math.floor(Math.random()*civilianKinds.length)]}; });
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
  const entries=Object.entries(game.selections);
  if(entries.length!==game.players.length) return;
  const roundSelections=game.selections;
  const revealed=Object.fromEntries(COLORS.map(c=>[c,0]));
  for(const [,sel] of entries) if(sel.color) revealed[sel.color]+=sel.effect;
  for(const c of COLORS){
    game.dials[c]=clamp(game.dials[c]+revealed[c]);
  }
  game.revealed=revealed;
  for(const p of game.players){
    const role=game.roles[p.id];
    if(role?.kind==='wallbreaker'){
      const mode=roundSelections[p.id]?.sophonMode||'affect';
      if(mode==='see') role.sophonResult=roundSelections[role.targetId]||null;
      else role.sophonResult=null;
    }
  }
  game.selections={};
  if(checkWallfacerWin()){ broadcast(); return; }
  if(game.round>=MAX_ROUNDS){ game.winner='Wallbreakers'; game.reason='Round 10 ended without a Wallfacer completing a plan.'; game.phase='ended'; }
  else game.round++;
  broadcast();
}
function attemptBreak(playerId, guess){
  const role=game.roles[playerId];
  if(role?.kind!=='wallbreaker') return;
  const targetRole=game.roles[role.targetId];
  const plan=targetRole.plan;
  const named=Object.keys(guess).sort().join(',');
  const actual=Object.keys(plan.values).sort().join(',');
  let correct=named===actual;
  if(correct) correct=Object.entries(plan.values).every(([c,v])=>guess[c]===v);
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
        if(entry && conns.get(entry[0])===conn) conns.delete(entry[0]);
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
      send(conn,{type:'state',state:publicState(),role:roleFor(existing)});
      return;
    }
    if(game.phase!=='lobby'){ send(conn,{type:'error',message:'Game already started.'}); return; }
    if(game.players.some(p=>p.name.toLowerCase()===msg.name.toLowerCase())){ send(conn,{type:'error',message:'Name already used.'}); return; }
    const id=msg.clientId;
    conns.set(id,conn); game.players.push({id,name:msg.name});
    send(conn,{type:'joined',playerId:id}); saveHost();
    broadcast();
  }
  if(msg.type==='leave'){ conns.delete(msg.playerId); game.players=game.players.filter(p=>p.id!==msg.playerId); delete game.roles[msg.playerId]; delete game.selections[msg.playerId]; broadcast(); }
  if(msg.type==='removePlayer' && game.phase==='lobby'){
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
    if(!game.players.some(p=>p.id===msg.playerId) || game.selections[msg.playerId]) return;
    if(!isLegalSelection(msg.playerId,msg.selection)) return;
    game.selections[msg.playerId]=msg.selection;
    if(Object.keys(game.selections).length===game.players.length) resolveRound(); else broadcast();
  }
  if(msg.type==='breakGuess' && game.phase==='playing') attemptBreak(msg.playerId,msg.guess);
  if(msg.type==='chat' && typeof msg.text==='string'){
    const player=game.players.find(p=>p.id===msg.playerId);
    if(!player || !msg.text.trim()) return;
    chatMessages.push({from:player.name,text:msg.text.trim(),playerId:player.id});
    render();
  }
}
function handleClientMessage(msg){
  if(msg.type==='joined'){ myPlayerId=msg.playerId; }
  if(msg.type==='state'){
    const wasPlaying=localView.state?.phase==='playing';
    const nextRevealKey=`${msg.state.round}:${JSON.stringify(msg.state.revealed)}`;
    if(msg.state.revealed && nextRevealKey!==localView.revealKey){
      localView.revealKey=nextRevealKey; localView.revealAnimationPending=true;
      clearTimeout(revealAnimationTimer);
      revealAnimationTimer=setTimeout(()=>{ localView.revealAnimationPending=false; render(); },3000);
    }
    localView.state=msg.state; localView.role=msg.role; localView.screen=msg.state.phase==='lobby'?'lobby':'game'; saveClientSession();
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
function chatHtml(){
  const messages=chatMessages.length?chatMessages.map(m=>{
    const mine=m.from==='You'||(isHost&&m.from==='Observer');
    const selected=isHost&&chatReplyTo&&m.playerId===chatReplyTo;
    const bubble=`<div class="chat-bubble"><div class="chat-author">${escapeHtml(m.from)}</div><div class="chat-text">${escapeHtml(m.text)}</div></div>`;
    return isHost
      ? `<button class="chat-message ${mine?'mine':'theirs'} ${selected?'selected':''}" data-chat-player="${escapeHtml(m.playerId||'')}" aria-label="Reply to ${escapeHtml(m.from)}">${bubble}</button>`
      : `<div class="chat-message ${mine?'mine':'theirs'}">${bubble}</div>`;
  }).join(''):'<div class="chat-empty">No messages yet.</div>';
  const placeholder=isHost?(chatReplyTo?'Reply to selected player...':'Select a player message to reply'):'Ask the observer a question...';
  return `<section class="panel chat-panel"><div class="chat-header"><strong>${isHost?'Private player messages':'Message the observer'}</strong>${isHost&&chatReplyTo?`<span>Replying</span>`:''}</div><div class="chat-messages">${messages}</div><div class="chat-composer"><input id="chat-input" placeholder="${placeholder}" ${isHost&&!chatReplyTo?'disabled':''}><button id="chat-send" ${isHost&&!chatReplyTo?'disabled':''}>Send</button></div></section>`;
}
async function resumeHost(attempt=0){
  const saved=JSON.parse(localStorage.getItem(storageKey('host'))||'null');
  if(!saved?.code||!saved.game) return;
  try {
    await setupPeerAsHost(saved.code); isHost=true; game=saved.game; game.wallfacerCount ||= 1;
    localView.screen=game.phase==='lobby'?'lobby':'game'; localView.state=publicState(); render();
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
function startGame(){
  try{ assignRoles(); game.phase='playing'; game.round=1; game.selections={}; game.revealed=null; pendingSelection={color:null,effect:null,sophonMode:'affect'}; localView.modal=null; localView.screen='game'; broadcast(); }
  catch(e){ localView.error=e.message; render(); }
}
function submitSelection(){
  const role=currentRoleFor(myPlayerId);
  const color=pendingSelection.color;
  const effect=pendingSelection.effect;
  const sophonMode=pendingSelection.sophonMode || 'affect';
  if(localView.state?.players.find(p=>p.id===myPlayerId)?.ready) return;
  const selection=role?.kind==='wallbreaker'&&sophonMode==='see' ? {sophonMode:'see'} : {color,effect,sophonMode:'affect'};
  if(!isLegalSelection(myPlayerId,selection)) return;
  if(isHost){
    if(game.selections[myPlayerId]) return;
    game.selections[myPlayerId]=selection;
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

function roleHtml(role){
  if(!role) return '<p>No role assigned.</p>';
  if(role.kind==='civilian') return `<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">${escapeHtml(role.profession)}</h2><p>Subject area: ${SUBJECTS[role.profession].join(' and ')}. Adjust one of these by 1 or 2, or any other dial by 1.</p></div></div>`;
  if(role.kind==='wallbreaker') return `<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">Wallbreaker</h2><p>You may adjust a dial by 1. Each round, choose whether the Sophon affects one dial by 1 or reveals the Wallfacer's move.</p></div><button class="danger" id="break-now">Guess the complete plan</button>${role.sophonResult?`<div class="card-list"><strong>Observed move</strong><div class="card-line">${role.sophonResult.color} ${role.sophonResult.effect>0?'+':''}${role.sophonResult.effect}</div></div>`:''}`;
  const rows=Object.entries(role.plan.values).map(([c,v])=>`<div class="card-line">${c.toUpperCase()} = ${v}</div>`).join('');
  return `<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">Wallfacer</h2><p>Adjust a dial by 1 while completing this configuration:</p></div></div><div class="card-list">${rows}</div>`;
}
function omniscientHtml(state){
  if(!isHost) return '';
  return `<section class="panel stack omniscient"><div class="section-title">${roleSvg('omniscient')}<div><strong>Observer view</strong><div class="small">All hidden information is visible to the host.</div></div></div><div class="role-grid">${state.players.map(p=>{ const r=game.roles[p.id]; const plan=r?.plan?.values; return `<div class="role-card">${roleSvg(r?.kind)}<div><strong>${escapeHtml(p.name)}</strong><div class="small">${escapeHtml(r?.label||'Unassigned')}${r?.targetId?` · targets ${escapeHtml(game.players.find(x=>x.id===r.targetId)?.name||'Unknown')}`:''}</div>${plan?`<div class="small">${Object.entries(plan).map(([c,v])=>`${c} ${v}`).join(' · ')}</div>`:''}</div></div>`; }).join('')}</div></section>`;
}
function maxEffectFor(role,color){
  if(role?.kind==='wallfacer'||role?.kind==='wallbreaker') return 1;
  if(role?.kind==='civilian'&&!SUBJECTS[role.profession].includes(color)) return 1;
  return 2;
}
function legalEffectsFor(role,color){
  const max=maxEffectFor(role,color);
  return max===2 ? [-2,-1,0,1,2] : [-1,0,1];
}
function currentRoleFor(playerId){
  return isHost ? game.roles[playerId] : localView.role;
}
function isLegalSelection(playerId,selection){
  const role=currentRoleFor(playerId);
  if(!role || !selection) return false;
  if(role.kind==='wallbreaker' && selection.sophonMode==='see') return true;
  if(!COLORS.includes(selection.color)) return false;
  return legalEffectsFor(role,selection.color).includes(selection.effect);
}
function dialCardHtml(c,state,role){
  const selected=pendingSelection.color===c;
  const effects=legalEffectsFor(role,c);
  const button=(effect)=>effects.includes(effect)?`<button class="dial-action adjust" data-color="${c}" data-effect="${effect}" aria-label="${effect<0?'Decrease':'Increase'} ${c} by ${Math.abs(effect)}">${effect>0?'+':''}${effect}</button>`:'';
  return `<div class="dial ${c} dial-card ${selected?'selected':''} ${dialRevealClass(state,c)}" ${dialRevealStyle(state,c)}><div class="adjust-row">${button(-2)}${button(-1)}</div><button class="dial-action dial-select" data-color="${c}" aria-label="Select ${c} with no change"><span class="name">${c}</span>${dialValueHtml(c,state)}</button><div class="adjust-row">${button(1)}${button(2)}</div></div>`;
}
function observerDialCardHtml(c,state){
  return `<div class="dial ${c} dial-card observer-dial ${dialRevealClass(state,c)}" ${dialRevealStyle(state,c)}><div></div><div class="dial-select"><span class="name">${c}</span>${dialValueHtml(c,state)}</div><div></div></div>`;
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
  const prior=clamp(final-total);
  const delta=total>0?`+${total}`:String(total);
  const direction=total>0?'dial-up':total<0?'dial-down':'dial-flat';
  return `<div class="value-window ${direction}"><div class="value-reel"><span class="reveal-adjacent">${total>0?final:prior}</span><span class="value">${prior}</span><span class="reveal-adjacent">${total<0?final:prior}</span></div>${total?`<span class="dial-delta">${delta}</span>`:''}</div>`;
}
function movePanelHtml(state,role,current){
  const chosen=pendingSelection.sophonMode==='see'?"Spy on Wallfacer's move":pendingSelection.color?`${pendingSelection.color} ${pendingSelection.effect>0?'+':''}${pendingSelection.effect}`:'Select a dial and adjustment';
  const spy=role?.kind==='wallbreaker'?`<button class="spy-choice ${pendingSelection.sophonMode==='see'?'selected':''}" id="spy-choice" aria-pressed="${pendingSelection.sophonMode==='see'}">${eyeSvg()}<span>Spy on Wallfacer's move</span></button>`:'';
  const hasChoice=role?.kind==='wallbreaker' ? pendingSelection.sophonMode==='see'||(pendingSelection.color&&EFFECTS.includes(pendingSelection.effect)) : Boolean(pendingSelection.color&&EFFECTS.includes(pendingSelection.effect));
  const observed=role?.kind==='wallbreaker'&&role.sophonResult?`<div class="observed-move"><div class="observed-label">Wallfacer move observed</div><strong>${role.sophonResult.color} ${role.sophonResult.effect>0?'+':''}${role.sophonResult.effect}</strong></div>`:'';
  return `<section class="panel stack move-panel"><div class="move-summary"><strong>Your move</strong><span>${current?'Locked':chosen}</span></div>${observed}${spy}<button id="submit" ${state.paused||current||!hasChoice?'disabled':''}>${current?'Locked in':'Lock selection'}</button><div class="small">${state.players.filter(p=>p.ready).length}/${state.players.length} locked</div></section>`;
}
function home(){ const inviteCode=new URLSearchParams(location.search).get('room')?.match(/^\d{6}$/)?.[0]||''; return `<div class="shell"><div class="topbar"><div class="brand">WALLFACERS</div></div><section class="panel stack"><h2>Join game</h2><input id="name" placeholder="Name" value="${escapeHtml(myName)}"><input id="code" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="6" placeholder="6-digit room code" value="${inviteCode}"><button id="join">Join room</button></section>${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`; }
function hostPage(){ return `<div class="shell"><div class="topbar"><div class="brand">WALLFACERS</div></div><section class="panel stack"><h2>Start a game</h2><p class="small">Create a room, then choose the role balance after players join.</p><button id="create">Create room</button></section>${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`; }
function lobby(state){
  const maxRoles=Math.max(1,Math.floor(state.players.length/2));
  return `<div class="shell"><div class="topbar"><div><div class="brand">WALLFACERS</div><div class="meta">Room · ${state.playerCount} players</div></div><div class="code">${state.code}</div></div><section class="panel stack"><div class="players">${state.players.map(p=>`<div class="player"><span>${escapeHtml(p.name)}</span><span>${isHost?`<button class="secondary remove-player" data-player-id="${escapeHtml(p.id)}">Remove</button>`:(p.ready?'✓':'')}</span></div>`).join('')||'<div class="small">Waiting for players…</div>'}</div>${isHost?`<button class="secondary" id="copy-invite">Copy invite link</button><label>Wallfacers and Wallbreakers: <strong>${Math.min(state.wallfacerCount,maxRoles)}</strong><input id="role-count" type="range" min="1" max="${maxRoles}" value="${Math.min(state.wallfacerCount,maxRoles)}" ${state.players.length<2?'disabled':''}></label><button id="start" ${state.players.length>=2?'':'disabled'}>Start game (${state.players.length} players)<\/button><button class="secondary" id="leave">End game</button>`:`<button class="secondary" id="leave">Leave game</button>`}</section>${chatHtml()}${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`;
}
function gameScreen(state,role){
  const mine=state.players.find(p=>p.id===myPlayerId);
  const current=mine?.ready;
  const selected= isHost ? game.selections[myPlayerId] : null;
  const sophonHeader=role?.kind==='wallbreaker'?`<div class="sophon-inventory" aria-label="Sophon choice each round"><span class="sophon-count">SOPHON</span></div>`:'';
  return `<div class="shell"><div class="topbar"><div><div class="brand">ROUND ${state.round}/${MAX_ROUNDS}</div><div class="meta">Room ${state.code}</div></div><div class="row">${sophonHeader}<button class="secondary" id="show-role">Show role</button><button class="secondary" id="leave">${isHost?'End game':'Leave game'}</button></div></div>
  ${state.winner?`<section class="panel stack"><div class="win">${escapeHtml(state.winner)} win</div><div>${escapeHtml(state.reason)}</div></section>`:''}
  ${state.paused&&!state.winner?`<div class="notice">Game paused: ${escapeHtml(state.breakerName)} is attempting to break the wall.</div>`:''}
  <div class="dial-board">${DIAL_GROUPS.map(group=>`<section class="dial-group"><div class="group-label">${group.name}</div><div class="dials">${group.colors.map(c=>isHost?observerDialCardHtml(c,state):dialCardHtml(c,state,role)).join('')}</div></section>`).join('')}</div>
  ${omniscientHtml(state)}
  ${!state.winner&&!isHost?movePanelHtml(state,role,current):''}
  ${state.revealed?`<section class="panel stack"><strong>Last reveal</strong>${COLORS.map(c=>`<div class="card-line">${c.toUpperCase()}: ${signed(revealTotal(state.revealed,c))}</div>`).join('')}</section>`:''}
  ${localView.modal==='role'?`<div class="modal"><div class="modal-card">${roleHtml(role)}<hr><button class="secondary" id="close-modal">Close</button></div></div>`:''}
  ${localView.modal==='break'?breakModal():''}
  ${chatHtml()}
  </div>`;
}
function breakModal(){ return `<div class="modal"><div class="modal-card stack"><h2 class="role-title">Break the wall</h2><p class="small">Choose exactly three dials and guess each target.</p>${COLORS.map(c=>`<div class="row"><label style="min-width:110px"><input class="break-dial" type="checkbox" value="${c}" style="width:auto"> ${c}</label><input id="guess-${c}" type="number" min="0" max="9" value="5" style="max-width:100px"></div>`).join('')}<button class="danger" id="send-break">Submit final guess</button><button class="secondary" id="close-modal">Cancel</button></div></div>`; }
function legalNotice(){ return '<footer class="legal">Unofficial, noncommercial fan project. Not affiliated with or endorsed by the rights holders of <em>The Three-Body Problem</em>.</footer>'; }
function render(){
  const s=localView.state;
  app.classList.toggle('host-view',isHost || location.pathname==='/host');
  if(localView.screen==='home') app.innerHTML=home();
  else if(localView.screen==='host') app.innerHTML=hostPage();
  else if(localView.screen==='connecting') app.innerHTML='<div class="shell"><div class="panel">Connecting…</div></div>';
  else if(localView.screen==='lobby') app.innerHTML=lobby(s);
  else app.innerHTML=gameScreen(s,localView.role);
  app.insertAdjacentHTML('beforeend',legalNotice());
  bind();
}
function bind(){
  document.querySelector('#create')?.addEventListener('click',createRoom);
  document.querySelector('#join')?.addEventListener('click',joinRoom);
  document.querySelector('#start')?.addEventListener('click',startGame);
  document.querySelector('#role-count')?.addEventListener('input',e=>{ game.wallfacerCount=Number(e.target.value); broadcast(); });
  document.querySelector('#submit')?.addEventListener('click',submitSelection);
  document.querySelectorAll('.dial-select').forEach(el=>el.addEventListener('click',()=>{ pendingSelection.color=el.dataset.color; pendingSelection.effect=0; pendingSelection.sophonMode='affect'; render(); }));
  document.querySelectorAll('.dial-action.adjust').forEach(el=>el.addEventListener('click',()=>{ pendingSelection.color=el.dataset.color; pendingSelection.effect=Number(el.dataset.effect); pendingSelection.sophonMode='affect'; render(); }));
  document.querySelector('#spy-choice')?.addEventListener('click',()=>{ pendingSelection.color=null; pendingSelection.effect=null; pendingSelection.sophonMode='see'; render(); });
  document.querySelector('#show-role')?.addEventListener('click',()=>{localView.modal='role';render();});
  document.querySelector('#close-modal')?.addEventListener('click',()=>{localView.modal=null;render();});
  document.querySelector('#break-now')?.addEventListener('click',pauseForBreak);
  document.querySelector('#send-break')?.addEventListener('click',sendBreak);
  document.querySelector('#leave')?.addEventListener('click',leaveGame);
  document.querySelector('#copy-invite')?.addEventListener('click',copyInvite);
  document.querySelectorAll('.remove-player').forEach(el=>el.addEventListener('click',event=>{ event.stopPropagation(); removePlayer(el.dataset.playerId); }));
  document.querySelector('#chat-send')?.addEventListener('click',sendChat);
  document.querySelector('#chat-input')?.addEventListener('keydown',event=>{ if(event.key==='Enter') sendChat(); });
  document.querySelectorAll('.chat-message').forEach(el=>el.addEventListener('click',()=>{ chatReplyTo=el.dataset.chatPlayer||null; render(); }));
}
render();
if(location.pathname==='/host') resumeHost(); else resumeClient();
