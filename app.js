const COLORS = ["orange", "yellow", "blue", "red"];
const EFFECTS = [-2,-1,0,1,2];
const MAX_ROUNDS = 10;
const PLAYER_COUNTS = {5:{wallfacers:1,wallbreakers:1},6:{wallfacers:2,wallbreakers:2},7:{wallfacers:2,wallbreakers:2}};

const app = document.querySelector('#app');
let peer = null;
let hostConn = null;
let conns = new Map();
let clientId = localStorage.getItem('wallfacers-client-id') || crypto.randomUUID();
localStorage.setItem('wallfacers-client-id', clientId);
let isHost = false;
let myName = '';
let myPlayerId = null;
let pendingSelection = {color:null,effect:null};
let localView = { screen:location.pathname === '/host' ? 'host' : 'home', state:null, role:null, error:'', modal:null };

function roomPeerId(code){ return `wallfacers-${code}`; }
function fourDigit(){ return String(Math.floor(1000 + Math.random()*9000)); }
function clamp(n){ return Math.max(0, Math.min(9, n)); }
function escapeHtml(s=''){ return s.replace(/[&<>'"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[c])); }
function send(conn, msg){ if(conn?.open) conn.send(msg); }
function saveClientSession(){ if(game.code&&myName) localStorage.setItem('wallfacers-session',JSON.stringify({code:game.code,name:myName})); }
function clearSession(){ localStorage.removeItem('wallfacers-session'); localStorage.removeItem('wallfacers-host'); }
function saveHost(){ localStorage.setItem('wallfacers-host',JSON.stringify({code:game.code,game})); }
function broadcast(){
  if(isHost) saveHost();
  for(const [pid,conn] of conns){
    const player = game.players.find(p=>p.id===pid);
    send(conn,{type:'state', state:publicState(), role:roleFor(player)});
  }
  localView.state = publicState();
  localView.role = roleFor(game.players.find(p=>p.id===myPlayerId));
  render();
}
function publicState(){
  return {
    code:game.code, phase:game.phase, round:game.round, dials:game.dials, playerCount:game.playerCount,
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

let game = freshGame();
function freshGame(){ return {code:'',phase:'lobby',round:1,playerCount:7,dials:{orange:5,yellow:5,blue:5,red:5},players:[],roles:{},selections:{},adminPlaying:false,paused:false,breakerName:'',revealed:null,winner:null,reason:''}; }

function createPlan(){
  const ignored = COLORS[Math.floor(Math.random()*COLORS.length)];
  const values={};
  for(const c of COLORS) if(c!==ignored) values[c]=Math.floor(Math.random()*10);
  return {ignored,values};
}
function assignRoles(){
  const players=[...game.players];
  const setup=PLAYER_COUNTS[game.playerCount];
  if(!setup || players.length!==game.playerCount) throw new Error(`Exactly ${game.playerCount} players are required.`);
  const shuffled=[...players].sort(()=>Math.random()-.5);
  const wallfacers=shuffled.slice(0,setup.wallfacers);
  const wallbreakers=shuffled.slice(setup.wallfacers,setup.wallfacers+setup.wallbreakers);
  game.roles={};
  wallfacers.forEach(p=>{ game.roles[p.id]={kind:'wallfacer',label:'Wallfacer',plan:createPlan()}; });
  wallbreakers.forEach((p,i)=>{ game.roles[p.id]={kind:'wallbreaker',label:'Wallbreaker',targetId:wallfacers[i % wallfacers.length].id}; });
  for(const p of shuffled.slice(setup.wallfacers+setup.wallbreakers)) game.roles[p.id]={kind:'loyal',label:'Loyal'};
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
  const revealed={orange:[],yellow:[],blue:[],red:[]};
  for(const [,sel] of entries) revealed[sel.color].push(sel.effect);
  game.revealed=revealed;
  for(const c of COLORS){
    const total=revealed[c].reduce((a,b)=>a+b,0);
    game.dials[c]=clamp(game.dials[c]+total);
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
  if(correct) correct=Object.entries(plan.values).every(([c,v])=>Math.abs(guess[c]-v)<=1);
  game.winner=correct?'Wallbreakers':'Loyal team';
  game.reason=correct?`${game.players.find(p=>p.id===playerId).name} correctly broke the wall.`:`${game.players.find(p=>p.id===playerId).name} guessed incorrectly.`;
  game.phase='ended'; game.paused=false;
  broadcast();
}

function setupPeerAsHost(code){
  return new Promise((resolve,reject)=>{
    peer = new Peer(roomPeerId(code));
    peer.on('open',resolve);
    peer.on('error',reject);
    peer.on('connection',conn=>{
      conn.on('data',msg=>handleHostMessage(conn,msg));
      conn.on('close',()=>{ const id=[...conns].find(([,c])=>c===conn)?.[0]; if(id){conns.delete(id);} });
    });
  });
}
function setupPeerAsClient(){
  return new Promise((resolve,reject)=>{
    peer=new Peer(); peer.on('open',resolve); peer.on('error',reject);
  });
}
function handleHostMessage(conn,msg){
  if(msg.type==='join'){
    if(game.phase!=='lobby'){ send(conn,{type:'error',message:'Game already started.'}); return; }
    const existing=game.players.find(p=>p.id===msg.clientId);
    if(existing){ conns.set(msg.clientId,conn); send(conn,{type:'joined',playerId:msg.clientId}); send(conn,{type:'state',state:publicState(),role:roleFor(existing)}); return; }
    if(game.players.some(p=>p.name.toLowerCase()===msg.name.toLowerCase())){ send(conn,{type:'error',message:'Name already used.'}); return; }
    const id=msg.clientId;
    conns.set(id,conn); game.players.push({id,name:msg.name});
    send(conn,{type:'joined',playerId:id}); saveHost();
    broadcast();
  }
  if(msg.type==='leave'){ conns.delete(msg.playerId); game.players=game.players.filter(p=>p.id!==msg.playerId); delete game.roles[msg.playerId]; delete game.selections[msg.playerId]; broadcast(); }
  if(msg.type==='select' && game.phase==='playing' && !game.paused){ game.selections[msg.playerId]=msg.selection; if(Object.keys(game.selections).length===game.players.length) resolveRound(); else broadcast(); }
  if(msg.type==='pauseBreak' && game.phase==='playing'){
    const role=game.roles[msg.playerId]; if(role?.kind!=='wallbreaker') return;
    game.paused=true; game.breakerName=game.players.find(p=>p.id===msg.playerId)?.name||'';
    broadcast();
  }
  if(msg.type==='breakGuess' && game.paused) attemptBreak(msg.playerId,msg.guess);
}
function handleClientMessage(msg){
  if(msg.type==='joined'){ myPlayerId=msg.playerId; }
  if(msg.type==='state'){
    const wasPlaying=localView.state?.phase==='playing';
    localView.state=msg.state; localView.role=msg.role; localView.screen=msg.state.phase==='lobby'?'lobby':'game'; saveClientSession();
    if(msg.state.phase==='playing'&&!wasPlaying) localView.modal='role';
    render();
  }
  if(msg.type==='error'){ localView.error=msg.message; render(); }
}

async function createRoom(){
  myName=document.querySelector('#name')?.value.trim() || '';
  const playerCount=Number(document.querySelector('#player-count').value);
  localView.error=''; const code=fourDigit();
  try{
    await setupPeerAsHost(code); isHost=true; game=freshGame(); game.code=code; game.playerCount=playerCount; game.adminPlaying=false;
    saveHost();
    localView.screen='lobby'; localView.state=publicState(); render();
  }catch(e){ localView.error='Could not create room. Try again.'; render(); }
}
async function joinRoom(){
  myName=document.querySelector('#name').value.trim(); const code=document.querySelector('#code').value.trim() || new URLSearchParams(location.search).get('room')?.trim();
  if(!myName || !/^\d{4}$/.test(code)){ localView.error='Enter a name and four-digit code.'; render(); return; }
  try{
    await setupPeerAsClient(); hostConn=peer.connect(roomPeerId(code),{reliable:true});
    hostConn.on('open',()=>send(hostConn,{type:'join',name:myName,clientId}));
    hostConn.on('data',handleClientMessage); hostConn.on('error',()=>{localView.error='Connection failed.';render();});
    localView.screen='connecting'; render();
  }catch{ localView.error='Could not connect.'; render(); }
}
async function copyInvite(){
  const link=`${location.origin}/?room=${encodeURIComponent(game.code)}`;
  try { await navigator.clipboard.writeText(link); localView.error='Invite link copied.'; }
  catch { localView.error=link; }
  render();
}
async function resumeHost(){
  const saved=JSON.parse(localStorage.getItem('wallfacers-host')||'null');
  if(!saved?.code||!saved.game) return;
  try { await setupPeerAsHost(saved.code); isHost=true; game=saved.game; localView.screen=game.phase==='lobby'?'lobby':'game'; localView.state=publicState(); render(); }
  catch { clearSession(); }
}
async function resumeClient(){
  const saved=JSON.parse(localStorage.getItem('wallfacers-session')||'null');
  if(!saved?.code||!saved.name||location.pathname==='/host') return;
  myName=saved.name; document.querySelector('#name')?.setAttribute('value',myName); localView.error='';
  try { await setupPeerAsClient(); hostConn=peer.connect(roomPeerId(saved.code),{reliable:true}); hostConn.on('open',()=>send(hostConn,{type:'join',name:myName,clientId})); hostConn.on('data',handleClientMessage); hostConn.on('error',()=>{clearSession(); localView.error='Reconnect failed. Join the room again.'; localView.screen='home'; render();}); localView.screen='connecting'; render(); } catch { clearSession(); }
}
function leaveGame(){ if(isHost){ peer?.destroy(); clearSession(); location.href='/host'; return; } send(hostConn,{type:'leave',playerId:myPlayerId}); peer?.destroy(); clearSession(); localView={screen:'home',state:null,role:null,error:'',modal:null}; render(); }
function startGame(){
  try{ assignRoles(); game.phase='playing'; game.round=1; game.selections={}; game.revealed=null; pendingSelection={color:null,effect:null}; localView.modal=null; broadcast(); }
  catch(e){ localView.error=e.message; render(); }
}
function submitSelection(){
  const color=pendingSelection.color || document.querySelector('input[name="dial"]:checked')?.value;
  const effect=pendingSelection.effect ?? Number(document.querySelector('input[name="effect"]:checked')?.value);
  if(!color || !EFFECTS.includes(effect)) return;
  if(isHost){ game.selections[myPlayerId]={color,effect}; if(Object.keys(game.selections).length===game.players.length) resolveRound(); else broadcast(); }
  else send(hostConn,{type:'select',playerId:myPlayerId,selection:{color,effect}});
}
function pauseForBreak(){ if(isHost){ game.paused=true; game.breakerName=myName; broadcast(); } else send(hostConn,{type:'pauseBreak',playerId:myPlayerId}); localView.modal='break'; render(); }
function sendBreak(){
  const checks=[...document.querySelectorAll('.break-dial:checked')].map(x=>x.value);
  if(checks.length!==3){ alert('Choose exactly three dials.'); return; }
  const guess={}; for(const c of checks){ guess[c]=Number(document.querySelector(`#guess-${c}`).value); }
  if(isHost) attemptBreak(myPlayerId,guess); else send(hostConn,{type:'breakGuess',playerId:myPlayerId,guess});
  localView.modal=null; render();
}

function roleHtml(role){
  if(!role) return '<p>No role assigned.</p>';
  if(role.kind==='loyal') return `<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">Loyal</h2><p>Help either Wallfacer complete a plan.</p></div></div>`;
  if(role.kind==='wallbreaker') return `<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">Wallbreaker</h2><p>Your assigned Wallfacer is <strong>${escapeHtml(role.targetName)}</strong>.</p></div><button class="danger" id="break-now">Break the wall</button>`;
  const rows=Object.entries(role.plan.values).map(([c,v])=>`<div class="card-line">${c.toUpperCase()} = ${v}</div>`).join('');
  return `<div class="role-heading">${roleSvg(role.kind)}<div><h2 class="role-title">Wallfacer</h2><p>Complete this configuration:</p></div></div><div class="card-list">${rows}</div><p class="small">${role.plan.ignored.toUpperCase()} is irrelevant.</p>`;
}
function omniscientHtml(state){
  if(!isHost) return '';
  return `<section class="panel stack omniscient"><div class="section-title">${roleSvg('omniscient')}<div><strong>Observer view</strong><div class="small">All hidden information is visible to the host.</div></div></div><div class="role-grid">${state.players.map(p=>{ const r=game.roles[p.id]; const plan=r?.plan?.values; return `<div class="role-card">${roleSvg(r?.kind)}<div><strong>${escapeHtml(p.name)}</strong><div class="small">${escapeHtml(r?.label||'Unassigned')}${r?.targetId?` · targets ${escapeHtml(game.players.find(x=>x.id===r.targetId)?.name||'Unknown')}`:''}</div>${plan?`<div class="small">${Object.entries(plan).map(([c,v])=>`${c} ${v}`).join(' · ')}</div>`:''}</div></div>`; }).join('')}</div></section>`;
}
function home(){ const inviteCode=new URLSearchParams(location.search).get('room')?.match(/^\d{4}$/)?.[0]||''; return `<div class="shell"><div class="topbar"><div class="brand">WALLFACERS</div></div><section class="panel stack"><h2>Join game</h2><input id="name" placeholder="Name" value="${escapeHtml(myName)}"><input id="code" inputmode="numeric" maxlength="4" placeholder="4-digit room code" value="${inviteCode}"><button id="join">Join room</button></section>${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`; }
function hostPage(){ return `<div class="shell"><div class="topbar"><div class="brand">WALLFACERS</div></div><section class="panel stack"><h2>Start a game</h2><label>Players<select id="player-count"><option value="5">5 players · 1 Wallfacer</option><option value="6">6 players · 2 Wallfacers</option><option value="7" selected>7 players · 2 Wallfacers</option></select></label><button id="create">Create room</button></section>${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`; }
function lobby(state){
  return `<div class="shell"><div class="topbar"><div><div class="brand">WALLFACERS</div><div class="meta">Room · ${state.playerCount} players</div></div><div class="code">${state.code}</div></div><section class="panel stack"><div class="players">${state.players.map(p=>`<div class="player"><span>${escapeHtml(p.name)}</span><span>${p.ready?'✓':''}</span></div>`).join('')||'<div class="small">Waiting for players…</div>'}</div>${isHost?`<button class="secondary" id="copy-invite">Copy invite link</button><button id="start" ${state.players.length===state.playerCount?'':'disabled'}>Start game (${state.players.length}/${state.playerCount})<\/button><button class="secondary" id="leave">End game</button>`:`<button class="secondary" id="leave">Leave game</button>`}</section>${localView.error?`<p class="notice">${escapeHtml(localView.error)}</p>`:''}</div>`;
}
function gameScreen(state,role){
  const mine=state.players.find(p=>p.id===myPlayerId);
  const current=mine?.ready;
  const selected= isHost ? game.selections[myPlayerId] : null;
  return `<div class="shell"><div class="topbar"><div><div class="brand">ROUND ${state.round}/${MAX_ROUNDS}</div><div class="meta">Room ${state.code}</div></div><div class="row"><button class="secondary" id="show-role">Show role</button><button class="secondary" id="leave">${isHost?'End game':'Leave game'}</button></div></div>
  ${state.winner?`<section class="panel stack"><div class="win">${escapeHtml(state.winner)} win</div><div>${escapeHtml(state.reason)}</div></section>`:''}
  ${state.paused&&!state.winner?`<div class="notice">Game paused: ${escapeHtml(state.breakerName)} is attempting to break the wall.</div>`:''}
  <div class="dials">${COLORS.map(c=>`<div class="dial ${c}"><div class="name">${c}</div><div class="value">${state.dials[c]}</div></div>`).join('')}</div>
  ${omniscientHtml(state)}
  ${!state.winner&&!isHost?`<section class="panel stack"><div><strong>Choose your move</strong></div><div class="choice-grid">${COLORS.map(c=>`<label class="choice-card dial ${c} ${pendingSelection.color===c?'selected':''}"><input type="radio" name="dial" value="${c}" ${pendingSelection.color===c?'checked':''}> <span>${c}</span></label>`).join('')}</div><div><strong>Change</strong></div><div class="effect-grid">${EFFECTS.map(e=>`<label class="choice-card ${pendingSelection.effect===e?'selected':''}"><input type="radio" name="effect" value="${e}" ${pendingSelection.effect===e?'checked':''}> <span>${e>0?'+':''}${e}</span></label>`).join('')}</div><button id="submit" ${state.paused?'disabled':''}>${current?'Update selection':'Lock selection'}</button><div class="small">${state.players.filter(p=>p.ready).length}/${state.players.length} committed</div></section>`:''}
  ${state.revealed?`<section class="panel stack"><strong>Last reveal</strong>${COLORS.map(c=>`<div class="card-line">${c.toUpperCase()}: ${state.revealed[c].map(v=>v>0?`+${v}`:v).join(', ')||'—'}</div>`).join('')}</section>`:''}
  ${localView.modal==='role'?`<div class="modal"><div class="modal-card">${roleHtml(role)}<hr><button class="secondary" id="close-modal">Close</button></div></div>`:''}
  ${localView.modal==='break'?breakModal():''}
  </div>`;
}
function breakModal(){ return `<div class="modal"><div class="modal-card stack"><h2 class="role-title">Break the wall</h2><p class="small">Choose exactly three dials and guess each target.</p>${COLORS.map(c=>`<div class="row"><label style="min-width:110px"><input class="break-dial" type="checkbox" value="${c}" style="width:auto"> ${c}</label><input id="guess-${c}" type="number" min="0" max="9" value="5" style="max-width:100px"></div>`).join('')}<button class="danger" id="send-break">Submit final guess</button><button class="secondary" id="close-modal">Cancel</button></div></div>`; }
function render(){
  const s=localView.state;
  if(localView.screen==='home') app.innerHTML=home();
  else if(localView.screen==='host') app.innerHTML=hostPage();
  else if(localView.screen==='connecting') app.innerHTML='<div class="shell"><div class="panel">Connecting…</div></div>';
  else if(localView.screen==='lobby') app.innerHTML=lobby(s);
  else app.innerHTML=gameScreen(s,localView.role);
  bind();
}
function bind(){
  document.querySelector('#create')?.addEventListener('click',createRoom);
  document.querySelector('#join')?.addEventListener('click',joinRoom);
  document.querySelector('#start')?.addEventListener('click',startGame);
  document.querySelector('#submit')?.addEventListener('click',submitSelection);
  document.querySelectorAll('input[name="dial"]').forEach(el=>el.addEventListener('change',()=>{ pendingSelection.color=el.value; render(); }));
  document.querySelectorAll('input[name="effect"]').forEach(el=>el.addEventListener('change',()=>{ pendingSelection.effect=Number(el.value); render(); }));
  document.querySelector('#show-role')?.addEventListener('click',()=>{localView.modal='role';render();});
  document.querySelector('#close-modal')?.addEventListener('click',()=>{localView.modal=null;render();});
  document.querySelector('#break-now')?.addEventListener('click',pauseForBreak);
  document.querySelector('#send-break')?.addEventListener('click',sendBreak);
  document.querySelector('#leave')?.addEventListener('click',leaveGame);
  document.querySelector('#copy-invite')?.addEventListener('click',copyInvite);
}
render();
if(location.pathname==='/host') resumeHost(); else resumeClient();
