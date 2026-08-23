const ROLE_COPY={
  wallfacer:{label:'Wallfacer',team:'Loyal',mark:'WF'},
  wallbreaker:{label:'Wallbreaker',team:'Saboteur',mark:'WB'},
  police:{label:'Shi Qiang',team:'Loyal',mark:'SQ'},
  civilian:{label:'Specialist',team:'Loyal',mark:'SP'}
};

const slides=[
  {
    eyebrow:'01 · OBJECTIVE',
    title:'Complete the Wallfacer’s secret plan exactly.',
    copy:'The plan identifies three of the six colored dials and gives an exact target value for each. The Loyal team wins if all three values match after a round resolves.',
    art:`<div class="tutorial-dial-rig"><div class="mini-dial yellow"><span>YELLOW</span><strong>3</strong></div><div class="mini-dial pink"><span>PINK</span><strong>7</strong></div><div class="mini-dial blue"><span>BLUE</span><strong>1</strong></div><div class="plan-beacon"><span>SECRET PLAN</span><b>?</b><b>?</b><b>?</b></div></div>`,
    facts:['Every dial remains between 0 and 9; changes stop at those limits.','Yellow and pink are Mathematics, blue and green are Science, and orange and red are Agriculture.','The Wallfacer must not announce the three plan colors because the Wallbreaker can win by guessing them.','The host is a neutral observer and authoritative referee.']
  },
  {
    eyebrow:'02 · ROLES',
    title:'A standard game always uses the same core roles.',
    copy:'There is one Wallfacer, one Wallbreaker, and one Shi Qiang. Every remaining player is a Specialist.',
    art:`<div class="tutorial-role-orbit"><div class="orbit-card loyal"><b>WF</b><span>Wallfacer</span></div><div class="orbit-card danger"><b>WB</b><span>Wallbreaker</span></div><div class="orbit-card loyal"><b>SQ</b><span>Shi Qiang</span></div><div class="orbit-card loyal"><b>SP</b><span>Specialist</span></div></div>`,
    facts:['The Wallfacer knows the complete plan and must change one dial by −1 or +1.','The Wallbreaker must change a dial by −1 or +1, or use the Sophon to observe the Wallfacer’s move.','Shi Qiang must change a dial by −1 or +1, or secretly arrest one other player for the round.','Each Specialist independently receives a random subject. Duplicates are allowed. They may use −2, −1, +1, or +2 on that subject’s two dials, but only −1 or +1 elsewhere.']
  },
  {
    eyebrow:'03 · EACH ROUND',
    title:'Every player locks one action before resolution.',
    copy:'Players may discuss the board first. Each player then chooses a legal action privately and locks it. A locked action cannot be changed during that round.',
    art:`<div class="tutorial-flow"><div><b>1</b><span>Discuss</span></div><i>→</i><div><b>2</b><span>Choose</span></div><i>→</i><div><b>3</b><span>Lock</span></div><i>→</i><div class="flow-live"><b>4</b><span>Resolve</span></div></div>`,
    facts:['The host waits until every player is locked, then adds all legal effects together before revealing the result.','On one dial, +2 and +1 produce a public change of +3. A +1 and a −1 produce 0, even though both players had to act.','The public reveal shows only each dial’s net change, not the individual actions that produced it.','Passing and zero-effect moves are not legal. Optional messaging is private between each player and the observer.']
  },
  {
    eyebrow:'04 · SPECIAL ACTIONS',
    title:'The Wallbreaker and Shi Qiang each choose between two actions.',
    copy:'Using the Sophon or making an arrest replaces that player’s dial move for the round.',
    art:`<div class="power-split"><div class="power-card sophon"><span class="power-orb"></span><strong>SOPHON</strong><p>See the target Wallfacer’s locked move after resolution.</p></div><div class="power-card arrest"><span class="power-ring">×</span><strong>ARREST</strong><p>Cancel one player’s dial effect for this round.</p></div></div>`,
    facts:['The Wallbreaker either affects one dial or uses the Sophon to observe the Wallfacer’s locked move after resolution.','The observation result is shown only to the Wallbreaker.','Shi Qiang either affects one dial or arrests one other player.','An arrest removes the target’s dial effect from the total. Only the arrested player is notified; the arrest is not public during play.']
  },
  {
    eyebrow:'05 · HOW IT ENDS',
    title:'The game ends in one of four ways.',
    copy:'The game checks the plan after every round. The Wallbreaker may also make a final guess during play.',
    art:`<div class="ending-map"><div class="ending loyal"><span>LOYAL WIN</span><strong>Plan completed</strong></div><div class="ending breaker"><span>WALLBREAKER WIN</span><strong>Three colors guessed</strong></div><div class="ending loyal"><span>LOYAL WIN</span><strong>Wrong guess</strong></div><div class="ending breaker"><span>WALLBREAKER WIN</span><strong>Round limit reached</strong></div></div>`,
    facts:['If the plan’s three dials exactly match their target values after resolution, the Loyal team wins immediately.','The Wallbreaker may guess which three dial colors are in the plan. The values are not part of the guess.','A correct guess wins for the Wallbreaker. An incorrect guess immediately wins for the Loyal team.','If the final configured round ends without the plan being completed, the Wallbreaker wins.']
  },
  {
    eyebrow:'06 · OPEN-BOOK PRACTICE',
    title:'Guided practice reveals information that is normally private.',
    copy:'The practice game uses the standard rules, locks, and win conditions, but exposes hidden information so the group can learn the system.',
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
  return `<div class="tutorial-shell"><div class="tutorial-aurora" aria-hidden="true"></div><header class="tutorial-header"><div><div class="brand">WALLBREAKER</div><div class="meta">Guided rules · Room ${esc(state.code)}</div></div><button class="tutorial-exit" id="leave">${isHost?'End game':'Leave game'}</button></header><main class="tutorial-stage" aria-live="polite"><section class="tutorial-copy"><div class="tutorial-eyebrow">${slide.eyebrow}</div><h1>${slide.title}</h1><p class="tutorial-lede">${slide.copy}</p><ul>${slide.facts.map(fact=>`<li>${fact}</li>`).join('')}</ul></section><section class="tutorial-art" aria-label="Illustration for ${esc(slide.title)}">${slide.art}</section></main><footer class="tutorial-controls"><button class="tutorial-back" id="tutorial-prev" ${index===0?'disabled':''}>← Back</button><div class="tutorial-dots">${dots}</div>${index<slides.length-1?'<button class="tutorial-primary" id="tutorial-next">Continue →</button>':`<div class="tutorial-final-action">${finalAction}</div>`}</footer>${index===slides.length-1?`<aside class="tutorial-ready-roster"><strong>${isHost?'Briefing status':'Your group'}</strong><div>${roster}</div></aside>`:''}</div>`;
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
  if(action.type==='private') return 'Private Police action';
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
    return `<article class="tutorial-intel-card ${copy.team==='Saboteur'?'is-saboteur':'is-loyal'}"><span class="intel-mark">${copy.mark}</span><div><strong>${esc(role.name)}</strong><span>${esc(role.kind==='civilian'&&role.profession?`${role.profession} Specialist`:copy.label)} · ${copy.team}</span><small>${esc(roleDetail(role,names))}</small></div></article>`;
  }).join('');
  const locks=disclosure.lockedMoves.map(move=>`<div class="tutorial-lock"><span>${esc(move.name)}</span><strong>${esc(selectionText(move.selection,names))}</strong></div>`).join('')||'<div class="tutorial-empty-locks">No one has locked an action yet.</div>';
  const lastRound=disclosure.lastRound;
  const replay=lastRound?`<div class="tutorial-resolution"><h3>Why Round ${lastRound.round} changed</h3><div class="tutorial-lock-list">${lastRound.actions.map(item=>`<div class="tutorial-lock ${item.arrested?'cancelled':''}"><span>${esc(item.name)}</span><strong>${esc(resolvedActionText(item.action,names))}${item.arrested?' · cancelled':''}</strong></div>`).join('')}</div></div>`:'';
  return `<section class="tutorial-intel"><div class="tutorial-intel-heading"><div><span>OPEN-BOOK PRACTICE</span><h2>The hidden layer</h2></div><p>Visible only in tutorial games. Standard players never receive this panel’s data.</p></div><div class="tutorial-intel-grid"><div><h3>Who is who</h3><div class="tutorial-role-grid">${roles}</div></div><div><h3>Live locked actions</h3><div class="tutorial-lock-list">${locks}</div><p class="tutorial-intel-note">Locks are write-once. When everyone is ready, the host resolves them together and the public board shows only the net result.</p>${replay}</div></div></section>`;
}
