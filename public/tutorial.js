const ROLE_COPY={
  wallfacer:{label:'Wallfacer',team:'Loyal',mark:'WF'},
  wallbreaker:{label:'Wallbreaker',team:'Saboteur',mark:'WB'},
  police:{label:'Shi Qiang',team:'Loyal',mark:'SQ'},
  civilian:{label:'Civilian',team:'Loyal',mark:'CV'}
};

const slides=[
  {
    eyebrow:'01 · THE MACHINE',
    title:'Six dials. One invisible destination.',
    copy:'Together, the table changes six numbered dials. A Wallfacer is quietly steering three of them toward an exact secret plan while a paired Wallbreaker tries to discover and stop it.',
    art:`<div class="tutorial-dial-rig"><div class="mini-dial yellow"><span>YELLOW</span><strong>3</strong></div><div class="mini-dial pink"><span>PINK</span><strong>7</strong></div><div class="mini-dial blue"><span>BLUE</span><strong>1</strong></div><div class="plan-beacon"><span>SECRET PLAN</span><b>?</b><b>?</b><b>?</b></div></div>`,
    facts:['Every dial is always between 0 and 9; changes stop at those limits.','Yellow + pink are Mathematics, blue + green are Science, orange + red are Agriculture.','The host is a neutral observer and authoritative referee.']
  },
  {
    eyebrow:'02 · HIDDEN TEAMS',
    title:'Your role changes what you know—and what you can move.',
    copy:'Roles are private in a standard game. The host chooses how many Wallfacer–Wallbreaker pairs to include; any remaining seats become Loyal specialists.',
    art:`<div class="tutorial-role-orbit"><div class="orbit-card loyal"><b>WF</b><span>Wallfacer</span></div><div class="orbit-card danger"><b>WB</b><span>Wallbreaker</span></div><div class="orbit-card loyal"><b>SQ</b><span>Shi Qiang</span></div><div class="orbit-card loyal"><b>CV</b><span>Civilian</span></div></div>`,
    facts:['There are always equal numbers of Wallfacers and Wallbreakers. The host may include one Police role when an extra seat is available; all other seats are Civilians.','Wallfacers know their own three-dial plan and the names of any other Wallfacers. They may change any dial by −1, 0, or +1.','Each Wallbreaker is assigned one Wallfacer target. They may change a dial by −1, 0, or +1—or observe that target’s move.','Each Civilian has a subject. They may use −2 through +2 on its two dials, but only −1 through +1 elsewhere.','Shi Qiang may change a dial by −1, 0, or +1—or secretly arrest one other player for the round.']
  },
  {
    eyebrow:'03 · EACH ROUND',
    title:'Choose privately. Lock once. Reveal together.',
    copy:'Every player commits exactly one action. A lock is final for that round, so talk first and click carefully.',
    art:`<div class="tutorial-flow"><div><b>1</b><span>Discuss</span></div><i>→</i><div><b>2</b><span>Choose</span></div><i>→</i><div><b>3</b><span>Lock</span></div><i>→</i><div class="flow-live"><b>4</b><span>Resolve</span></div></div>`,
    facts:['The host waits until every player is locked, then resolves all actions simultaneously.','Moves on the same dial add together. The public reveal shows the net change, not who caused it.','A 0 move is legal and can be useful for concealment.','Private player-to-observer chat is available for questions; it is not a public team channel.']
  },
  {
    eyebrow:'04 · SPECIAL ACTIONS',
    title:'Observation exposes intent. Arrest erases an effect.',
    copy:'The two special roles trade away their dial move when they use their power.',
    art:`<div class="power-split"><div class="power-card sophon"><span class="power-orb"></span><strong>SOPHON</strong><p>See the target Wallfacer’s locked move after resolution.</p></div><div class="power-card arrest"><span class="power-ring">×</span><strong>ARREST</strong><p>Cancel one player’s dial effect for this round.</p></div></div>`,
    facts:['A Wallbreaker chooses one Sophon action each round: affect one dial or observe the target Wallfacer.','An observed move appears only to that Wallbreaker after the round resolves.','Shi Qiang chooses either a normal dial move or one arrest target.','An arrest cancels the target’s dial effect; the rest of the round still resolves.']
  },
  {
    eyebrow:'05 · HOW IT ENDS',
    title:'The Wallbreakers get one dangerous accusation.',
    copy:'Victory can arrive suddenly. Watch the dials, protect the plan, and do not guess casually.',
    art:`<div class="ending-map"><div class="ending loyal"><span>LOYAL WIN</span><strong>Plan completed</strong></div><div class="ending breaker"><span>WALLBREAKER WIN</span><strong>Exact plan guessed</strong></div><div class="ending loyal"><span>LOYAL WIN</span><strong>Wrong guess</strong></div><div class="ending breaker"><span>WALLBREAKER WIN</span><strong>Survive round limit</strong></div></div>`,
    facts:['After each resolution, if any Wallfacer’s three named dials exactly match all three values, the Loyal team wins immediately.','A Wallbreaker may guess the complete plan: exactly three dial names and their exact values. A correct guess wins immediately.','An incorrect Wallbreaker guess immediately gives victory to the Loyal team.','If the configured final round ends with no completed plan, the Wallbreakers win.']
  },
  {
    eyebrow:'06 · OPEN-BOOK PRACTICE',
    title:'Now play once with the walls made of glass.',
    copy:'The practice game uses the real rules, real locks, and real win conditions. Its only advantage is extra visibility, so everyone can connect cause to effect.',
    art:`<div class="glass-wall"><div class="glass-secret"><span>ROLES</span><strong>VISIBLE</strong></div><div class="glass-secret"><span>PLANS</span><strong>VISIBLE</strong></div><div class="glass-secret"><span>LOCKS</span><strong>VISIBLE</strong></div></div>`,
    facts:['During this tutorial, everyone can inspect every role, Wallfacer plan, Wallbreaker target, and already-locked action.','The teaching panel updates live underneath the dials. Use it to explain why the board changed.','In a standard game that panel is never loaded and none of this hidden information is sent to players.','When you are ready, mark your briefing complete. The host starts the shared countdown.']
  }
];

export const TUTORIAL_STEP_COUNT=slides.length;

function esc(value=''){
  return String(value).replace(/[&<>'"]/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':'&quot;'}[character]));
}

export function briefingHtml({state,step,isHost,myPlayerId}){
  const index=Math.max(0,Math.min(slides.length-1,Number(step)||0));
  const slide=slides[index];
  const ready=new Set(state.tutorial?.readyPlayerIds||[]);
  const amReady=ready.has(myPlayerId);
  const dots=slides.map((_,dot)=>`<button class="tutorial-dot ${dot===index?'active':''}" data-tutorial-step="${dot}" aria-label="Go to chapter ${dot+1}" aria-current="${dot===index?'step':'false'}"></button>`).join('');
  const roster=state.players.map(player=>`<div class="tutorial-ready-person ${ready.has(player.id)?'ready':''}"><span>${ready.has(player.id)?'✓':'·'}</span>${esc(player.name)}</div>`).join('');
  const finalAction=isHost
    ? `<button id="begin-tutorial-practice" class="tutorial-primary">Begin guided practice</button><span>${ready.size}/${state.players.length} players ready</span>`
    : `<button id="tutorial-ready" class="tutorial-primary" ${amReady?'disabled':''}>${amReady?'Ready — waiting for host':'I understand — ready'}</button>`;
  return `<div class="tutorial-shell"><div class="tutorial-aurora" aria-hidden="true"></div><header class="tutorial-header"><div><div class="brand">WALLBREAKER</div><div class="meta">Guided mission briefing · Room ${esc(state.code)}</div></div><button class="tutorial-exit" id="leave">${isHost?'End game':'Leave game'}</button></header><main class="tutorial-stage" aria-live="polite"><section class="tutorial-copy"><div class="tutorial-eyebrow">${slide.eyebrow}</div><h1>${slide.title}</h1><p class="tutorial-lede">${slide.copy}</p><ul>${slide.facts.map(fact=>`<li>${fact}</li>`).join('')}</ul></section><section class="tutorial-art" aria-label="Illustration for ${esc(slide.title)}">${slide.art}</section></main><footer class="tutorial-controls"><button class="tutorial-back" id="tutorial-prev" ${index===0?'disabled':''}>← Back</button><div class="tutorial-dots">${dots}</div>${index<slides.length-1?'<button class="tutorial-primary" id="tutorial-next">Continue →</button>':`<div class="tutorial-final-action">${finalAction}</div>`}</footer>${index===slides.length-1?`<aside class="tutorial-ready-roster"><strong>${isHost?'Briefing status':'Your group'}</strong><div>${roster}</div></aside>`:''}</div>`;
}

function roleDetail(role,names){
  if(role.kind==='wallfacer') return `Plan: ${Object.entries(role.plan?.values||{}).map(([color,value])=>`${color} ${value}`).join(' · ')}`;
  if(role.kind==='wallbreaker') return `Target: ${names.get(role.targetId)||'Unknown'}`;
  if(role.kind==='civilian') return `Subject: ${role.profession||'Unknown'}`;
  if(role.kind==='police') return 'May move or arrest';
  return 'Role pending';
}

function selectionText(selection,names){
  if(selection.systemSkipped) return 'Skipped after disconnect';
  if(selection.sophonMode==='see') return 'Sophon: observe target';
  if(selection.policeMode==='arrest') return `Arrest ${names.get(selection.arrestTarget)||'a player'}`;
  const effect=Number(selection.effect||0);
  return `${selection.color||'No dial'} ${effect>0?'+':''}${effect}`;
}

function resolvedActionText(action,names){
  if(action.type==='spy') return `Observed ${names.get(action.targetId)||'the target'}`;
  if(action.type==='arrest') return `Arrested ${names.get(action.targetId)||'a player'}`;
  if(action.type==='skipped') return 'Skipped after disconnect';
  const effect=Number(action.effect||0);
  return `${action.color||'No dial'} ${effect>0?'+':''}${effect}`;
}

export function tutorialAidHtml({state}){
  const disclosure=state.tutorial;
  if(!disclosure) return '';
  const names=new Map(disclosure.roles.map(role=>[role.playerId,role.name]));
  const roles=disclosure.roles.map(role=>{
    const copy=ROLE_COPY[role.kind]||{label:role.label||'Unknown',team:'',mark:'?'};
    return `<article class="tutorial-intel-card ${copy.team==='Saboteur'?'is-saboteur':'is-loyal'}"><span class="intel-mark">${copy.mark}</span><div><strong>${esc(role.name)}</strong><span>${esc(role.kind==='civilian'&&role.profession?role.profession:copy.label)} · ${copy.team}</span><small>${esc(roleDetail(role,names))}</small></div></article>`;
  }).join('');
  const locks=disclosure.lockedMoves.map(move=>`<div class="tutorial-lock"><span>${esc(move.name)}</span><strong>${esc(selectionText(move.selection,names))}</strong></div>`).join('')||'<div class="tutorial-empty-locks">No one has locked an action yet.</div>';
  const lastRound=disclosure.lastRound;
  const replay=lastRound?`<div class="tutorial-resolution"><h3>Why Round ${lastRound.round} changed</h3><div class="tutorial-lock-list">${lastRound.actions.map(item=>`<div class="tutorial-lock ${item.arrested?'cancelled':''}"><span>${esc(item.name)}</span><strong>${esc(resolvedActionText(item.action,names))}${item.arrested?' · cancelled':''}</strong></div>`).join('')}</div></div>`:'';
  return `<section class="tutorial-intel"><div class="tutorial-intel-heading"><div><span>OPEN-BOOK PRACTICE</span><h2>The hidden layer</h2></div><p>Visible only in tutorial games. Standard players never receive this panel’s data.</p></div><div class="tutorial-intel-grid"><div><h3>Who is who</h3><div class="tutorial-role-grid">${roles}</div></div><div><h3>Live locked actions</h3><div class="tutorial-lock-list">${locks}</div><p class="tutorial-intel-note">Locks are write-once. When everyone is ready, the host resolves them together and the public board shows only the net result.</p>${replay}</div></div></section>`;
}
