import { eyeSvg, roleSvg, wildRoleSvg } from './icons.js';
import { WILD_ROLE_DEFINITIONS, describeWildRoleType } from './game-rules.js';

const lab=document.querySelector('#preview-lab');
const modalRoot=document.querySelector('#preview-modal-root');
const COLORS=['yellow','pink','orange','red','blue','green'];
const GROUPS=[{name:'Group 1',colors:['yellow','pink']},{name:'Group 2',colors:['orange','red']},{name:'Group 3',colors:['blue','green']}];
const VALUES={yellow:4,pink:6,orange:3,red:6,blue:5,green:2};
const TARGETS={yellow:6,red:8,blue:2};
let activeTab='plans';
let phone=false;
let roundDemo={round:4,role:'wallfacer',selection:null,locked:false};
let wildDemo='loner';
let wildComplete=false;
const WILD_PREVIEWS={
  bounty:{label:'Bounty',objective:'Get both Ava Wen and Sam Rao arrested at least once each.'},
  extremist:{label:'Extremist',objective:'Get Green to its opposite extreme, 9, at least once.'},
  conservationist:{label:'Conservationist',objective:'On round 4 or later, finish a round with the total of all six dials exactly equal to its starting total.'},
  moderate:{label:'Moderate',objective:'Have all six dials in the inclusive 3–7 range at the same time. The starting board can qualify.'},
  disruptor:{label:'Disruptor',objective:'Make an uncancelled wrong-way move on each of the three hidden plan dials.'},
  loner:{label:'Loner',objective:'Complete four rounds as the only player choosing your dial. Arrested rounds do not count.'},
  oddball:{label:'Oddball',objective:'Finish any completed round with at least five of the six dials showing odd numbers.'},
  numerologist:{label:'Numerologist',objective:'Get three different dials to finish the same completed round showing the same number.'},
  wrapper:{label:'Wrapper',objective:'When your uncancelled move touches a dial, it can wrap past 0 or 9 that round. Use this power to wrap three different dials; the power remains afterward.'}
};

function targetMarker(value,label='Target'){
  return `<span class="preview-target-marker"><i></i>${label} ${value}</span>`;
}

function dial(color){
  const target=TARGETS[color];
  const relevant=target!==undefined;
  return `<div class="preview-dial dial ${color} ${relevant?'is-plan-dial':''}"><span>${color}</span><strong>${VALUES[color]}</strong>${relevant?targetMarker(target):''}</div>`;
}

function board(){
  return `<div class="preview-board">${COLORS.map(dial).join('')}</div>`;
}

function planIdeas(){
  return `<section class="preview-panel" data-panel="plans"><div class="preview-section-heading"><div><span>Selected treatment</span><h2>Plan targets live directly on their dials.</h2></div><p>“Show role” stays limited to the role name. The three relevant dials remain outlined and each exact target gets a white notch in place.</p></div><article class="preview-idea preview-selected-plan"><div class="preview-idea-head"><span>03</span><div><h3>Target marker</h3><b>Selected · live now</b></div></div>${board()}<p>A white target notch sits inside each outlined dial without covering its main value.</p></article></section>`;
}

function actionRail(effects,locked=false){
  return `<div class="preview-control-dial dial blue ${locked?'is-locked':''}"><div class="preview-control-face"><span>Blue</span><strong>5</strong>${locked?'<em>Locked +2</em>':''}</div><div class="preview-action-zones count-${effects.length}">${effects.map(effect=>`<button ${locked?'disabled':''} class="${locked&&effect===2?'chosen':''}">${effect>0?'+':''}${effect}</button>`).join('')}</div></div>`;
}

function lockPanel(){
  return `<section class="preview-panel" data-panel="controls"><div class="preview-section-heading"><div><span>Touch and commitment</span><h2>The entire dial is the hit target.</h2></div><p>For a two-action role, any point in the top half chooses +1 and any point in the bottom half chooses −1. Four-action dials use four equal quarters.</p></div><div class="preview-control-grid"><article><h3>Standard role · two halves</h3>${actionRail([1,-1])}<p>Each action owns 50% of the complete dial surface.</p></article><article><h3>Specialist · four quarters</h3>${actionRail([2,1,-1,-2])}<p>Each action owns 25%, including the visible number area.</p></article><article><h3>After lock</h3>${actionRail([2,1,-1,-2],true)}<p>The chosen segment stays highlighted while every segment is disabled.</p></article></div></section>`;
}

function roundEffects(color){
  return roundDemo.role==='specialist'&&['blue','green'].includes(color)?[2,1,-1,-2]:[1,-1];
}

function roundDial(color){
  const effects=roundEffects(color);
  const isTarget=roundDemo.role==='wallfacer'&&TARGETS[color]!==undefined;
  const selected=roundDemo.selection?.color===color;
  return `<div class="preview-round-dial dial ${color} ${isTarget?'is-plan-dial':''} ${selected?'is-selected':''} ${roundDemo.locked&&selected?'is-locked':''}"><div class="preview-round-face"><span>${color}</span><strong>${VALUES[color]}</strong>${isTarget?targetMarker(TARGETS[color]):''}</div><div class="preview-action-zones count-${effects.length}">${effects.map(effect=>`<button data-round-action data-color="${color}" data-effect="${effect}" aria-label="${effect>0?'Increase':'Decrease'} ${color} by ${Math.abs(effect)}" aria-pressed="${selected&&roundDemo.selection.effect===effect}" class="${selected&&roundDemo.selection.effect===effect?'chosen':''}" ${roundDemo.locked?'disabled':''}>${effect>0?'+':''}${effect}</button>`).join('')}</div></div>`;
}

function roundPanel(){
  const selection=roundDemo.selection?`${roundDemo.selection.color} ${roundDemo.selection.effect>0?'+':''}${roundDemo.selection.effect}`:'Choose a dial segment';
  const lockLabel=roundDemo.locked?`Locked · ${selection}`:'Lock selection';
  const lockedCount=roundDemo.locked?4:3;
  return `<section class="preview-panel preview-game-panel" data-panel="round"><div class="preview-game-topbar"><div><span class="brand">wallbreaker · round ${roundDemo.round}</span><p>Room PREVIEW · Interactive player view</p></div><div class="preview-role-switch" aria-label="Preview role"><button class="secondary ${roundDemo.role==='wallfacer'?'active':''}" data-round-role="wallfacer" ${roundDemo.locked?'disabled':''}>Wallfacer</button><button class="secondary ${roundDemo.role==='specialist'?'active':''}" data-round-role="specialist" ${roundDemo.locked?'disabled':''}>Science specialist</button></div></div><div class="preview-game-layout"><div class="preview-round-board">${GROUPS.map(group=>`<section class="preview-round-group"><div class="group-label">${group.name}</div><div class="preview-round-dials">${group.colors.map(roundDial).join('')}</div></section>`).join('')}</div><aside class="preview-game-sidebar"><div class="preview-move-summary"><span>Your move</span><strong>${roundDemo.locked?`Locked · ${selection}`:selection}</strong></div><button data-round-lock ${!roundDemo.selection||roundDemo.locked?'disabled':''}>${lockLabel}</button><button class="secondary" data-round-reset ${!roundDemo.selection&&!roundDemo.locked?'disabled':''}>${roundDemo.locked?'Preview next round':'Clear selection'}</button><div class="preview-game-actions"><button class="secondary" data-demo-modal="role">Show role</button><button class="danger" data-demo-modal="guess">Guess combination</button></div><div class="preview-lock-list"><div><span class="chat-avatar">AW</span><b>Ava</b><em>Locked</em></div><div><span class="chat-avatar">ML</span><b>Mara</b><em>Locked</em></div><div><span class="chat-avatar">SR</span><b>Sam</b><em>Locked</em></div><div><span class="chat-avatar">YU</span><b>You</b><em class="${roundDemo.locked?'ready':''}">${roundDemo.locked?'Locked':'Choosing'}</em></div></div><div class="small">${lockedCount}/4 locked</div></aside></div></section>`;
}

function modalPanel(){
  return `<section class="preview-panel" data-panel="modals"><div class="preview-section-heading"><div><span>Private moments</span><h2>Short, focused, dismissible modals</h2></div><p>Use the buttons to preview the role, final guess, arrest, Sophon, and Police target experiences.</p></div><div class="preview-modal-buttons"><button data-demo-modal="role">Show role</button><button class="danger" data-demo-modal="guess">Guess combination</button><button data-demo-modal="arrest">Arrest result</button><button data-demo-modal="sophon">Sophon result</button><button data-demo-modal="picker">Arrest picker</button></div><article class="preview-main-action"><div><span>Moved out of Show role</span><h3>Wallbreaker actions stay in the game screen.</h3></div><button class="danger" data-demo-modal="guess">Guess combination</button></article></section>`;
}

function rolePanel(){
  return `<section class="preview-panel" data-panel="system"><div class="preview-section-heading"><div><span>Reusable element shelf</span><h2>Roles, public reference, and reconnection</h2></div><p>The Wild Role guide lists the complete nine-role bank without revealing who received which role.</p></div><div class="preview-system-grid"><article><h3>Role icon set</h3><div class="preview-role-row"><div>${roleSvg('wallfacer')}<span>Wallfacer</span></div><div>${roleSvg('wallbreaker')}<span>Wallbreaker</span></div><div class="police">${roleSvg('police')}<span>Shi Qiang</span></div><div>${roleSvg('civilian')}<span>Specialist</span></div></div></article><article><h3>Reconnecting</h3><div class="preview-reconnect"><div class="reconnect-spinner"></div><strong>Reconnecting…</strong><p>Looking for the room and restoring your seat.</p><button class="secondary">Give up and return home</button></div></article><article class="preview-guide-shelf"><h3>Public Wild Role reference</h3><div class="preview-guide-buttons"><button data-demo-modal="wild-guide">Open Wild Roles</button></div></article></div></section>`;
}

function segments(value,max=3){
  return `<div class="preview-wild-segments" style="grid-template-columns:repeat(${max},1fr)" aria-label="${value} of ${max} complete">${Array.from({length:max},(_,index)=>`<i class="${index<value?'complete':''}"></i>`).join('')}</div>`;
}

function rangeScale({min=0,max=9,low,high,current,label=''}){
  const left=(low-min)/(max-min)*100;
  const width=(high-low)/(max-min)*100;
  const marker=(current-min)/(max-min)*100;
  return `<div class="preview-range-scale"><div class="preview-range-labels"><span>${min}</span><strong>${label||`${low}–${high} wins`}</strong><span>${max}</span></div><div class="preview-range-track"><i style="left:${left}%;width:${width}%"></i><b style="left:${marker}%"></b></div><div class="preview-range-current">Current · ${current}</div></div>`;
}

function wildCompactVisual(role,variant='default'){
  if(role==='bounty') return `<div class="preview-bounty-targets"><div class="preview-bounty-target arrested"><span class="chat-avatar">AW</span><strong>Ava Wen</strong><span class="preview-target-arrest-x" aria-hidden="true">×</span></div><div class="preview-bounty-target"><span class="chat-avatar">SR</span><strong>Sam Rao</strong></div></div>`;
  if(role==='extremist') return '';
  if(role==='conservationist') return `<div class="preview-total-readout"><div><span>Starting total</span><strong>30</strong></div><div><span>Current total</span><strong>26</strong></div></div><div class="preview-wild-status">Round 6 can complete the goal</div>`;
  if(role==='moderate') return '';
  if(role==='disruptor') return `<div class="preview-subtle-progress"><span>Wrong-way dials</span><strong>1/3</strong></div>${segments(1,3)}`;
  if(role==='oddball'||role==='numerologist') return '';
  if(role==='wrapper') return `<div class="preview-subtle-progress"><span>Wrapped dials</span><strong>1/3</strong></div>${segments(1,3)}`;
  return `<div class="preview-subtle-progress"><span>Solitary rounds</span><strong>3/4</strong></div>${segments(3,4)}`;
}

function wildRoundDial(color,roleId,variant,completed=false){
  const extremistTarget=!completed&&roleId==='extremist'&&color==='green';
  const extremistClass=extremistTarget?`preview-extremist-target preview-extremist-${variant} preview-extremist-up`:'';
  const wrapperWrapped=!completed&&roleId==='wrapper'&&color==='yellow';
  const wrapperMarker=wrapperWrapped?`<span class="preview-wrapper-marker" aria-hidden="true">${wildRoleSvg('wrapper')}</span>`:'';
  const effects=[1,-1];
  return `<div class="preview-round-dial dial ${color} ${extremistClass} ${wrapperWrapped?'preview-wrapper-wrapped':''}"><div class="preview-round-face"><span>${color}</span><strong>${VALUES[color]}</strong></div><div class="preview-action-zones count-${effects.length}">${effects.map(effect=>`<button aria-label="${effect>0?'Increase':'Decrease'} ${color} by ${Math.abs(effect)}">${effect>0?'+':''}${effect}</button>`).join('')}</div>${wrapperMarker}</div>`;
}

function wildPlayerScreen(roleId,variant='default'){
  const completed=wildComplete&&WILD_ROLE_DEFINITIONS[roleId].timing==='one-time';
  const subtle=['disruptor','loner','oddball','numerologist','wrapper'].includes(roleId);
  const status=completed||['extremist','moderate','oddball','numerologist'].includes(roleId)?'':`<section class="preview-wild-status-panel ${subtle?'subtle':''}">${wildCompactVisual(roleId,variant)}</section>`;
  return `<div class="preview-wild-player-shell ${completed?'goal-complete':''}"><div class="preview-wild-topbar"><div><span class="brand">ROUND 6/10</span><p>Room PREVIEW</p></div><div><button class="secondary" data-demo-modal="wild-guide">Wild roles</button><button class="secondary" data-wild-show-role>Show role</button><button class="secondary">Leave game</button></div></div><section class="preview-wild-move-panel"><div><strong>Your move</strong><span>Select a dial and adjustment</span></div><button disabled>Lock selection</button><small>3/4 locked</small></section>${status}<div class="preview-round-board preview-wild-board">${[
    {name:'Mathematics',colors:['yellow','pink']},
    {name:'Science',colors:['blue','green']},
    {name:'Agriculture',colors:['orange','red']}
  ].map(group=>`<section class="preview-round-group"><div class="group-label">${group.name}</div><div class="preview-round-dials">${group.colors.map(color=>wildRoundDial(color,roleId,variant,completed)).join('')}</div></section>`).join('')}</div><button class="preview-chat-launch" aria-label="Open messages">•••</button></div>`;
}

function wildRolesPanel(){
  const variants=wildDemo==='extremist'
      ? [
          {id:'edge',number:'01',label:'Edge glow + destination',copy:'The selected live treatment: a glowing edge, upward arrows, and 9 mark the destination.'},
          {id:'cap',number:'02',label:'Endpoint cap',copy:'A compact endpoint marker labels the target value without adding a separate panel.'},
          {id:'chevrons',number:'03',label:'Direction chevrons',copy:'Purple arrows inside the dial emphasize direction while leaving the edge unchanged.'}
        ]
      : [{id:'default',number:'',label:'',copy:''}];
  const screens=variants.map(variant=>`<article class="preview-wild-context-option">${variant.label?`<div class="preview-context-option-heading"><span>${variant.number}</span><div><h3>${variant.label}</h3><p>${variant.copy}</p></div></div>`:''}${wildPlayerScreen(wildDemo,variant.id)}</article>`).join('');
  const comparisonTitle=variants.length===3?`Three ${WILD_PREVIEWS[wildDemo].label} treatments`:variants.length===4?`Four ${WILD_PREVIEWS[wildDemo].label} treatments`:'The complete Wild Role player screen';
  const canComplete=WILD_ROLE_DEFINITIONS[wildDemo].timing==='one-time';
  return `<section class="preview-panel preview-wild-screen-panel" data-panel="wild"><div class="preview-section-heading"><div><span>Full player context</span><h2>${comparisonTitle}</h2></div><div class="preview-wild-state-control"><p>Switch roles to inspect each private objective in the same screen context it occupies during a round.</p>${canComplete?`<button class="secondary ${wildComplete?'active':''}" data-wild-complete aria-pressed="${wildComplete}">${wildComplete?'Show in-progress screen':'Preview achieved screen'}</button>`:''}</div></div><div class="preview-wild-role-picker" aria-label="Wild Role preview">${Object.entries(WILD_PREVIEWS).map(([id,item])=>`<button class="secondary ${wildDemo===id?'active':''}" data-wild-role="${id}" aria-pressed="${wildDemo===id}">${wildRoleSvg(id)}<span>${item.label}</span></button>`).join('')}</div><div class="preview-wild-context-options">${screens}</div></section>`;
}

function modalHtml(type){
  if(type==='wild-role'){
    const role=WILD_PREVIEWS[wildDemo];
    const completed=wildComplete&&WILD_ROLE_DEFINITIONS[wildDemo].timing==='one-time';
    return `<div class="modal preview-demo-modal"><div class="modal-card"><div class="role-only"><div class="eyebrow">Your role</div>${wildRoleSvg(wildDemo)}<h2 class="role-title">${role.label}</h2></div><section class="wild-role-objective ${completed?'goal-complete':''}"><div class="eyebrow">Wild goal · Loyal${completed?' · Goal achieved':''}</div><p>${role.objective}</p>${completed?'<div class="wild-goal-achieved-callout">Goal achieved · Help the Wallfacer team win</div>':''}</section><hr><button class="secondary" data-close-demo>Close</button></div></div>`;
  }
  if(type==='wild-guide'){
    const cards=Object.entries(WILD_PREVIEWS).map(([roleId,role])=>`<article class="wild-guide-role">${wildRoleSvg(roleId)}<div><strong>${role.label}</strong><p>${describeWildRoleType(roleId)}</p></div></article>`).join('');
    return `<div class="modal preview-demo-modal"><div class="modal-card stack wild-guide-modal"><div><div class="eyebrow">Public reference</div><h2 class="role-title">Wild Roles</h2></div><p class="small">Complete your Wild goal and help the Wallfacer team win. A completed goal stays complete. Wild players never see the Wallfacer's plan. The Wallbreaker privately knows one unoccupied role they can claim as a cover.</p><div class="wild-guide-grid">${cards}</div><button class="secondary" data-close-demo>Close</button></div></div>`;
  }
  if(type==='role') return `<div class="modal preview-demo-modal"><div class="modal-card"><div class="role-only"><div class="eyebrow">Your role</div>${roleSvg(roundDemo.role==='specialist'?'civilian':'wallfacer')}<h2 class="role-title">${roundDemo.role==='specialist'?'Science Specialist':'Wallfacer'}</h2></div><hr><button class="secondary" data-close-demo>Close</button></div></div>`;
  if(type==='guess') return `<div class="modal preview-demo-modal"><div class="modal-card stack"><div><div class="eyebrow">Final action</div><h2 class="role-title">Guess the plan</h2></div><p class="small">Choose the three dial colors in the Wallfacer's plan. A correct guess wins; an incorrect guess gives the Loyal team the win.</p><div class="math-guess-grid standard-guess-grid">${COLORS.map(color=>`<label class="${color}"><input class="preview-break-dial" type="checkbox" value="${color}"><span>${color}</span></label>`).join('')}</div><div class="small" id="preview-guess-count" aria-live="polite">0 of 3 selected</div><button class="danger" data-submit-demo-guess disabled>Submit final guess</button><button class="secondary" data-close-demo>Cancel</button></div></div>`;
  if(type==='arrest') return `<div class="modal preview-demo-modal"><div class="modal-card stack"><div class="modal-icon danger-icon">${roleSvg('police')}</div><div><div class="eyebrow">Private result</div><h2 class="role-title">You were arrested</h2></div><p>Police arrested you last round. Your locked dial effect was cancelled.</p><button data-close-demo>Dismiss</button></div></div>`;
  if(type==='sophon') return `<div class="modal preview-demo-modal"><div class="modal-card stack"><div class="modal-icon sophon-icon">${eyeSvg()}</div><div><div class="eyebrow">Sophon observation</div><h2 class="role-title">The Wallfacer locked</h2></div><div class="observed-result">Blue +1</div><button data-close-demo>Dismiss</button></div></div>`;
  return `<div class="modal preview-demo-modal"><div class="modal-card stack"><div class="role-heading">${roleSvg('police')}<div><div class="eyebrow">Private action</div><h2 class="role-title">Who will you arrest?</h2></div></div><div class="arrest-choices"><button class="arrest-target"><span class="chat-avatar">AW</span><span>Ava Wen</span></button><button class="arrest-target"><span class="chat-avatar">ML</span><span>Mara Lin</span></button><button class="arrest-target"><span class="chat-avatar">SR</span><span>Sam Rao</span></button></div><button class="secondary" data-close-demo>Cancel</button></div></div>`;
}

function currentPanel(){
  if(activeTab==='plans') return planIdeas();
  if(activeTab==='round') return roundPanel();
  if(activeTab==='controls') return lockPanel();
  if(activeTab==='modals') return modalPanel();
  if(activeTab==='wild') return wildRolesPanel();
  return rolePanel();
}

function render(){
  lab.className=phone?'is-phone':'';
  const tabs=[['plans','Plan design'],['round','Six-dial round'],['controls','Touch & lock'],['modals','Modals'],['wild','Wild Roles'],['system','Roles & reconnect']];
  lab.innerHTML=`<header class="preview-header"><div><a href="/host">← Back to host</a><div class="brand">wallbreaker</div><h1>Game UI preview lab</h1><p>Inspect the selected plan treatment, each complete Wild Role player screen, and reusable game states without starting a room.</p></div><button class="secondary" id="viewport-toggle">${phone?'Use wide preview':'Use phone preview'}</button></header><nav class="preview-tabs" aria-label="Preview categories">${tabs.map(([id,label])=>`<button class="${activeTab===id?'active':''}" data-tab="${id}" aria-pressed="${activeTab===id}">${label}</button>`).join('')}</nav><div class="preview-stage">${currentPanel()}</div>`;
  lab.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{ activeTab=button.dataset.tab; render(); }));
  lab.querySelector('#viewport-toggle')?.addEventListener('click',()=>{ phone=!phone; render(); });
  lab.querySelectorAll('[data-demo-modal]').forEach(button=>button.addEventListener('click',()=>openModal(button.dataset.demoModal)));
  lab.querySelectorAll('[data-wild-show-role]').forEach(button=>button.addEventListener('click',()=>openModal('wild-role')));
  lab.querySelectorAll('[data-round-action]').forEach(button=>button.addEventListener('click',()=>{ roundDemo.selection={color:button.dataset.color,effect:Number(button.dataset.effect)}; render(); }));
  lab.querySelector('[data-round-lock]')?.addEventListener('click',()=>{ if(roundDemo.selection&&!roundDemo.locked){ roundDemo.locked=true; render(); } });
  lab.querySelector('[data-round-reset]')?.addEventListener('click',()=>{ if(roundDemo.locked) roundDemo.round+=1; roundDemo.selection=null; roundDemo.locked=false; render(); });
  lab.querySelectorAll('[data-round-role]').forEach(button=>button.addEventListener('click',()=>{ if(roundDemo.locked) return; roundDemo.role=button.dataset.roundRole; roundDemo.selection=null; render(); }));
  lab.querySelectorAll('[data-wild-role]').forEach(button=>button.addEventListener('click',()=>{ wildDemo=button.dataset.wildRole; wildComplete=false; render(); }));
  lab.querySelector('[data-wild-complete]')?.addEventListener('click',()=>{ wildComplete=!wildComplete; render(); });
}

function openModal(type){
  modalRoot.innerHTML=modalHtml(type);
  const close=()=>{ modalRoot.innerHTML=''; };
  modalRoot.querySelectorAll('[data-close-demo],.arrest-target').forEach(button=>button.addEventListener('click',close));
  modalRoot.querySelector('.modal')?.addEventListener('click',event=>{ if(event.target===event.currentTarget) close(); });
  if(type==='guess'){
    const inputs=[...modalRoot.querySelectorAll('.preview-break-dial')];
    const count=modalRoot.querySelector('#preview-guess-count');
    const submit=modalRoot.querySelector('[data-submit-demo-guess]');
    inputs.forEach(input=>input.addEventListener('change',()=>{
      let checked=inputs.filter(item=>item.checked);
      if(checked.length>3){ input.checked=false; checked=inputs.filter(item=>item.checked); }
      count.textContent=`${checked.length} of 3 selected`;
      submit.disabled=checked.length!==3;
    }));
    submit.addEventListener('click',()=>{
      const selected=inputs.filter(input=>input.checked).map(input=>input.value);
      count.textContent=`Preview guess ready · ${selected.join(' · ')}`;
      count.className='guess-correct';
      inputs.forEach(input=>{ input.disabled=true; });
      submit.textContent='Combination selected';
      submit.disabled=true;
    });
  }
}

document.addEventListener('keydown',event=>{ if(event.key==='Escape') modalRoot.innerHTML=''; });
render();
