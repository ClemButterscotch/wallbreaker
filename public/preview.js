import { eyeSvg, roleSvg } from './icons.js';

const lab=document.querySelector('#preview-lab');
const modalRoot=document.querySelector('#preview-modal-root');
const COLORS=['yellow','pink','orange','red','blue','green'];
const GROUPS=[{name:'Group 1',colors:['yellow','pink']},{name:'Group 2',colors:['orange','red']},{name:'Group 3',colors:['blue','green']}];
const VALUES={yellow:4,pink:7,orange:3,red:6,blue:5,green:2};
const TARGETS={yellow:6,red:8,blue:2};
let activeTab='plans';
let phone=false;
let roundDemo={round:4,role:'wallfacer',selection:null,locked:false};

function targetMarker(value,label='Target'){
  return `<span class="preview-target-marker"><i></i>${label} ${value}</span>`;
}

function dial(color,variant){
  const target=TARGETS[color];
  const relevant=target!==undefined;
  const badge=variant==='badge'&&relevant?`<span class="preview-target-badge">Target ${target}</span>`:'';
  const marker=variant==='marker'&&relevant?targetMarker(target):'';
  return `<div class="preview-dial dial ${color} ${relevant?'is-plan-dial':''}">${badge}<span>${color}</span><strong>${VALUES[color]}</strong>${marker}</div>`;
}

function board(variant){
  const strip=variant==='strip'?`<div class="preview-mission-strip"><span>Secret targets</span>${Object.entries(TARGETS).map(([color,value])=>`<b class="${color}">${color} ${value}</b>`).join('')}</div>`:'';
  return `<div class="preview-board">${COLORS.map(color=>dial(color,variant)).join('')}</div>${strip}`;
}

function planIdeas(){
  const ideas=[
    {variant:'badge',number:'01',title:'Target badge',label:'Fastest scan',copy:'The exact target rides on its outlined dial. It is quick to read, but adds another pill-shaped label to each target.'},
    {variant:'strip',number:'02',title:'Mission strip',label:'Calmest board',copy:'The three dials still get a white outline, while one compact strip keeps all target values together.'},
    {variant:'marker',number:'03',title:'Target marker',label:'Selected · live now',copy:'A white target notch sits inside each outlined dial without covering its main value. This is now the production Wallfacer treatment.'}
  ];
  return `<section class="preview-panel" data-panel="plans"><div class="preview-section-heading"><div><span>Show-role redesign</span><h2>Three ways to keep the plan on the board</h2></div><p>“Show role” stays limited to the role name. The selected design outlines the three relevant dials and marks each exact target in place.</p></div><div class="preview-ideas">${ideas.map(idea=>`<article class="preview-idea ${idea.variant==='marker'?'is-selected-idea':''}"><div class="preview-idea-head"><span>${idea.number}</span><div><h3>${idea.title}</h3><b>${idea.label}</b></div></div>${board(idea.variant)}<p>${idea.copy}</p></article>`).join('')}</div></section>`;
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
  return `<section class="preview-panel" data-panel="system"><div class="preview-section-heading"><div><span>Reusable element shelf</span><h2>Role icons and reconnection state</h2></div><p>This area can grow as a reference for future game elements.</p></div><div class="preview-system-grid"><article><h3>Role icon set</h3><div class="preview-role-row"><div>${roleSvg('wallfacer')}<span>Wallfacer</span></div><div>${roleSvg('wallbreaker')}<span>Wallbreaker</span></div><div class="police">${roleSvg('police')}<span>Shi Qiang</span></div><div>${roleSvg('civilian')}<span>Specialist</span></div></div></article><article><h3>Reconnecting</h3><div class="preview-reconnect"><div class="reconnect-spinner"></div><strong>Reconnecting…</strong><p>Looking for the room and restoring your seat.</p><button class="secondary">Give up and return home</button></div></article></div></section>`;
}

function modalHtml(type){
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
  return rolePanel();
}

function render(){
  lab.className=phone?'is-phone':'';
  const tabs=[['plans','Plan designs'],['round','Six-dial round'],['controls','Touch & lock'],['modals','Modals'],['system','Roles & reconnect']];
  lab.innerHTML=`<header class="preview-header"><div><a href="/host">← Back to host</a><div class="brand">wallbreaker</div><h1>Game UI preview lab</h1><p>Compare secret-plan treatments and inspect reusable game states without starting a room.</p></div><button class="secondary" id="viewport-toggle">${phone?'Use wide preview':'Use phone preview'}</button></header><nav class="preview-tabs" aria-label="Preview categories">${tabs.map(([id,label])=>`<button class="${activeTab===id?'active':''}" data-tab="${id}" aria-pressed="${activeTab===id}">${label}</button>`).join('')}</nav><div class="preview-stage">${currentPanel()}</div>`;
  lab.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{ activeTab=button.dataset.tab; render(); }));
  lab.querySelector('#viewport-toggle')?.addEventListener('click',()=>{ phone=!phone; render(); });
  lab.querySelectorAll('[data-demo-modal]').forEach(button=>button.addEventListener('click',()=>openModal(button.dataset.demoModal)));
  lab.querySelectorAll('[data-round-action]').forEach(button=>button.addEventListener('click',()=>{ roundDemo.selection={color:button.dataset.color,effect:Number(button.dataset.effect)}; render(); }));
  lab.querySelector('[data-round-lock]')?.addEventListener('click',()=>{ if(roundDemo.selection&&!roundDemo.locked){ roundDemo.locked=true; render(); } });
  lab.querySelector('[data-round-reset]')?.addEventListener('click',()=>{ if(roundDemo.locked) roundDemo.round+=1; roundDemo.selection=null; roundDemo.locked=false; render(); });
  lab.querySelectorAll('[data-round-role]').forEach(button=>button.addEventListener('click',()=>{ if(roundDemo.locked) return; roundDemo.role=button.dataset.roundRole; roundDemo.selection=null; render(); }));
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
