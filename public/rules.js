import {eyeSvg,roleSvg,wildRoleSvg} from './icons.js';
import {WILD_ROLE_DEFINITIONS} from './game-rules.js';

const deck=document.querySelector('[data-rules-deck]');
const slides=[...document.querySelectorAll('.rules-slide')];
const stage=document.querySelector('#rulebook');
const previousButton=document.querySelector('#rules-prev');
const nextButton=document.querySelector('#rules-next');
const progress=document.querySelector('.rules-progress');
const progressBar=document.querySelector('#rules-progress-bar');
const slideNumber=document.querySelector('#rules-slide-number');
const progressTitle=document.querySelector('#rules-progress-title');
const currentTitle=document.querySelector('#rules-current-title');
const announcer=document.querySelector('#rules-announcer');
const menuButton=document.querySelector('#rules-menu');
const menuClose=document.querySelector('#rules-menu-close');
const menuScrim=document.querySelector('#rules-scrim');
const toc=document.querySelector('#rules-toc');
const tocLinks=document.querySelector('#rules-toc-links');
const fullscreenButton=document.querySelector('#rules-fullscreen');
const printButton=document.querySelector('#rules-print');
let currentIndex=0;
let touchStart=null;

const RULE_DIAL_GROUPS=[
  {name:'Mathematics',colors:['yellow','pink']},
  {name:'Science',colors:['blue','green']},
  {name:'Agriculture',colors:['orange','red']},
];
const RULE_DIAL_VALUES={yellow:1,pink:7,blue:3,green:4,orange:5,red:1};
const RULE_PLAN_TARGETS={yellow:6,blue:2,red:8};

function dialValueHtml(value){
  const above=Math.min(9,value+1);
  const below=Math.max(0,value-1);
  return `<div class="value-window dial-flat"><span class="dial-delta dial-delta-up">+1</span><div class="value-reel"><span class="reveal-adjacent">${above}</span><span class="value">${value}</span><span class="reveal-adjacent">${below}</span></div><span class="dial-delta dial-delta-down">-1</span></div>`;
}

function dialCardHtml(color,{observer=false,targets=false,effects=[1,-1],selection=null,locked=false}={}){
  const selected=selection?.color===color;
  const target=targets?RULE_PLAN_TARGETS[color]:undefined;
  const orderedEffects=effects.length===4?[2,1,-1,-2]:[1,-1];
  const actions=observer?'':`<div class="dial-actions action-count-${orderedEffects.length}">${orderedEffects.map(effect=>`<button class="dial-action adjust ${selected&&selection.effect===effect?'selected-action':''}" type="button" data-rule-dial-action data-color="${color}" data-effect="${effect}" aria-label="${effect<0?'Decrease':'Increase'} ${color} by ${Math.abs(effect)}" ${locked?'disabled':''}>${effect>0?'+':''}${effect}</button>`).join('')}</div>`;
  const marker=target===undefined?'':`<span class="plan-target-marker"><i></i>Target ${target}</span>`;
  const arrows=locked&&selected?`<span class="lock-arrows ${selection.effect>0?'up':'down'}" aria-hidden="true">${selection.effect>0?'↑':'↓'}</span>`:'';
  return `<div class="dial ${color} dial-card standard-dial-card ${observer?'observer-dial':''} ${selected?'selected':''} ${locked&&selected?'locked-preview':''} ${target===undefined?'':'plan-target'}"><div class="dial-face"><div class="dial-select" aria-label="${color}, value ${RULE_DIAL_VALUES[color]}"><span class="name">${color}</span>${dialValueHtml(RULE_DIAL_VALUES[color])}</div>${marker}</div>${actions}${arrows}</div>`;
}

function dialBoardHtml({observer=false,targets=false,specialty=null,selection=null,locked=false}={}){
  return `<div class="dial-board rules-live-dial-board">${RULE_DIAL_GROUPS.map(group=>`<section class="dial-group ${specialty===group.name?'is-specialty':''}"><div class="group-label">${group.name}${specialty===group.name?' · specialty':''}</div><div class="dials">${group.colors.map(color=>dialCardHtml(color,{observer,targets,effects:specialty===group.name?[2,1,-1,-2]:[1,-1],selection,locked})).join('')}</div></section>`).join('')}</div>`;
}

function gameTopbarHtml({wallbreaker=false,label='ROUND 1/10'}={}){
  return `<div class="topbar rules-live-topbar"><div><div class="brand">${label}</div><div class="meta">Room 173451</div></div><div class="row">${wallbreaker?`<div class="sophon-inventory"><span class="sophon-count">SOPHON · CHOOSE 1</span></div>`:''}<button class="secondary" type="button" disabled>Show role</button></div></div>`;
}

function movePanelHtml({role='wallfacer',selection=null,locked=false,playersLocked=3,totalPlayers=6}={}){
  const isWallbreaker=role==='wallbreaker';
  const isPolice=role==='police';
  const special=selection?.kind;
  const chosen=special==='sophon'?"Spy on Wallfacer's move":special==='arrest'?(selection.target?`Arrest ${selection.target}`:'Choose a player'):selection?.color?`${selection.color} ${selection.effect>0?'+':''}${selection.effect}`:'Select a dial and adjustment';
  const hasChoice=Boolean(special==='sophon'||(special==='arrest'&&selection.target)||selection?.color);
  const spy=isWallbreaker?`<button class="spy-choice ${special==='sophon'?'selected':''}" type="button" data-rule-sophon aria-pressed="${special==='sophon'}" ${locked?'disabled':''}>${eyeSvg()}<span>Spy on Wallfacer's move</span></button>`:'';
  const arrest=isPolice?`<button class="spy-choice ${special==='arrest'?'selected':''}" type="button" data-rule-arrest aria-pressed="${special==='arrest'}" ${locked?'disabled':''}>${roleSvg('police')}<span>${selection?.target?`Arrest ${selection.target}`:'Arrest someone for this turn'}</span></button>`:'';
  const guess=isWallbreaker?'<button class="danger" type="button" data-rule-open-guess>Guess combination</button>':'';
  return `<section class="panel stack move-panel"><div class="move-summary"><strong>Your move</strong><span>${locked?`Locked in · ${chosen}`:chosen}</span></div>${spy}${arrest}<button type="button" data-rule-lock ${locked||!hasChoice?'disabled':''}>${locked?`Locked in · ${chosen}`:'Lock selection'}</button>${guess}<div class="small">${locked?playersLocked+1:playersLocked}/${totalPlayers} locked</div></section>`;
}

function mountStaticScreens(){
  const teamUi=document.querySelector('#rules-team-ui');
  if(teamUi) teamUi.innerHTML=`<article class="panel stack team-role-card wallfacer-team-ui"><div class="eyebrow">Wallfacer team</div><div class="role-only">${roleSvg('wallfacer')}<h2 class="role-title">The Wallfacer</h2></div><p class="small">Leads Shi Qiang and the Specialists.</p></article><article class="panel stack team-role-card wallbreaker-team-ui"><div class="eyebrow">Wallbreaker team</div><div class="role-only">${roleSvg('wallbreaker')}<h2 class="role-title">The Wallbreaker</h2></div><p class="small">Plays alone.</p></article>`;

  ['#rules-cover-board','#rules-public-board'].forEach(selector=>{
    const target=document.querySelector(selector);
    if(target) target.innerHTML=`${gameTopbarHtml({label:'ROUND 1/10'})}${dialBoardHtml({observer:true})}`;
  });

  const planScreen=document.querySelector('#rules-wallfacer-plan-screen');
  if(planScreen) planScreen.innerHTML=`${gameTopbarHtml({label:'ROUND 1/10'})}${dialBoardHtml({targets:true})}`;

  const arrestedScreen=document.querySelector('#rules-arrested-screen');
  if(arrestedScreen) arrestedScreen.innerHTML=`${gameTopbarHtml({label:'ROUND 2/10'})}${dialBoardHtml({observer:true})}<div class="modal rules-embedded-modal rules-arrested-outcome" role="dialog" aria-modal="true" aria-labelledby="rules-arrested-title"><div class="modal-card stack"><div class="modal-icon danger-icon">${roleSvg('police')}</div><div><div class="eyebrow">Private result</div><h2 class="role-title" id="rules-arrested-title">You were arrested</h2></div><p>Police arrested you last round. Your locked dial effect was cancelled.</p><button type="button" tabindex="-1">Dismiss</button></div></div>`;

}

function bindActionScreen({selector,role='wallfacer',targets=false,specialty=null,initialSelection=null,initialArrestPickerOpen=false}={}){
  const screen=document.querySelector(selector);
  if(!screen) return;
  let selection=initialSelection;
  let locked=false;
  let arrestPickerOpen=initialArrestPickerOpen;

  function render(){
    screen.innerHTML=`${gameTopbarHtml({wallbreaker:role==='wallbreaker'})}<div class="rules-live-game-body">${movePanelHtml({role,selection,locked})}${dialBoardHtml({targets,specialty,selection,locked})}</div>${arrestPickerOpen?`<div class="modal rules-embedded-modal" role="dialog" aria-modal="true" aria-label="Choose a player to arrest"><div class="modal-card stack"><div class="role-heading">${roleSvg('police')}<div><div class="eyebrow">Private action</div><h2 class="role-title">Who will you arrest?</h2></div></div><p class="small">Their locked dial effect will not count this round.</p><div class="arrest-choices">${['Ava','Mara','Lin'].map(name=>`<button class="arrest-target ${selection?.target===name?'selected':''}" type="button" data-rule-arrest-target="${name}"><span class="chat-avatar">${name.slice(0,2).toUpperCase()}</span><span>${name}</span>${selection?.target===name?'<strong>Selected</strong>':''}</button>`).join('')}</div><button class="secondary" type="button" data-rule-close-arrest>Cancel</button></div></div>`:''}`;

    screen.querySelectorAll('[data-rule-dial-action]').forEach(button=>button.addEventListener('click',()=>{
      if(locked) return;
      selection={kind:'dial',color:button.dataset.color,effect:Number(button.dataset.effect)};
      arrestPickerOpen=false;
      render();
    }));
    screen.querySelector('[data-rule-sophon]')?.addEventListener('click',()=>{
      if(locked) return;
      selection={kind:'sophon'};
      render();
    });
    screen.querySelector('[data-rule-arrest]')?.addEventListener('click',()=>{
      if(locked) return;
      selection={kind:'arrest',target:selection?.kind==='arrest'?selection.target:null};
      arrestPickerOpen=true;
      render();
    });
    screen.querySelectorAll('[data-rule-arrest-target]').forEach(button=>button.addEventListener('click',()=>{
      selection={kind:'arrest',target:button.dataset.ruleArrestTarget};
      arrestPickerOpen=false;
      render();
    }));
    screen.querySelector('[data-rule-close-arrest]')?.addEventListener('click',()=>{
      arrestPickerOpen=false;
      if(selection?.kind==='arrest'&&!selection.target) selection=null;
      render();
    });
    screen.querySelector('[data-rule-lock]')?.addEventListener('click',()=>{
      if(!selection) return;
      locked=true;
      render();
    });
    screen.querySelector('[data-rule-open-guess]')?.addEventListener('click',()=>{
      const guessIndex=slides.findIndex(slide=>slide.id==='rules-slide-guess');
      if(guessIndex>=0) showSlide(guessIndex);
    });
  }

  render();
}

function mountGameScreens(){
  mountStaticScreens();
  bindActionScreen({selector:'#rules-wallfacer-action-screen',role:'wallfacer',targets:true,initialSelection:{kind:'dial',color:'blue',effect:1}});
  bindActionScreen({selector:'#rules-wallbreaker-action-screen',role:'wallbreaker',initialSelection:{kind:'dial',color:'blue',effect:-1}});
  bindActionScreen({selector:'#rules-police-action-screen',role:'police',initialSelection:{kind:'arrest',target:null},initialArrestPickerOpen:true});
  bindActionScreen({selector:'#rules-specialist-screen',role:'specialist',specialty:'Mathematics',initialSelection:{kind:'dial',color:'yellow',effect:2}});
}

function mountWildRuleSlides(){
  const infoIcons=document.querySelector('#rules-wild-info-icons');
  if(infoIcons) infoIcons.innerHTML=Object.keys(WILD_ROLE_DEFINITIONS).map(wildRoleSvg).join('');
  document.querySelectorAll('[data-rule-wild-icon]').forEach(target=>{
    target.innerHTML=wildRoleSvg(target.dataset.ruleWildIcon);
  });
}

function slideHash(slide){
  return slide.id.replace('rules-slide-','');
}

function indexForHash(hash=location.hash){
  const normalized=decodeURIComponent(hash.replace(/^#/,'')).replace(/^rules-slide-/,'');
  const index=slides.findIndex(slide=>slideHash(slide)===normalized);
  return index>=0?index:0;
}

function showSlide(index,{updateHash=true,announce=true}={}){
  const nextIndex=Math.max(0,Math.min(slides.length-1,Number(index)||0));
  currentIndex=nextIndex;
  slides.forEach((slide,slideIndex)=>{
    const isCurrent=slideIndex===currentIndex;
    slide.classList.toggle('is-current',isCurrent);
    slide.classList.toggle('was-before',slideIndex<currentIndex);
    slide.setAttribute('aria-hidden',String(!isCurrent));
    if(isCurrent) slide.removeAttribute('inert');
    else slide.setAttribute('inert','');
    if(isCurrent) slide.scrollTop=0;
  });
  const slide=slides[currentIndex];
  const title=slide.dataset.title||`Slide ${currentIndex+1}`;
  const ruleCount=Math.max(0,slides.length-1);
  const ruleNumber=currentIndex;
  const padded=String(ruleNumber).padStart(2,'0');
  const total=String(ruleCount).padStart(2,'0');
  currentTitle.textContent=title;
  progressTitle.textContent=title;
  slideNumber.textContent=currentIndex===0?'INTRO':`${padded} / ${total}`;
  progressBar.style.width=`${ruleCount?(ruleNumber/ruleCount)*100:0}%`;
  progress.setAttribute('aria-valuemax',String(ruleCount));
  progress.setAttribute('aria-valuenow',String(ruleNumber));
  previousButton.disabled=currentIndex===0;
  nextButton.disabled=currentIndex===slides.length-1;
  nextButton.querySelector('b').textContent=currentIndex===slides.length-2?'Finish':'Next';
  document.title=`${title} · ${deck.dataset.rulesLabel||'wallbreaker rules'}`;
  [...tocLinks.children].forEach((link,linkIndex)=>{
    link.classList.toggle('is-current',linkIndex===currentIndex);
    link.setAttribute('aria-current',linkIndex===currentIndex?'page':'false');
  });
  if(updateHash){
    const nextHash=`#${slideHash(slide)}`;
    if(location.hash!==nextHash) history.replaceState(null,'',nextHash);
  }
  if(announce) announcer.textContent=currentIndex===0?`Introduction: ${title}`:`Rule ${ruleNumber} of ${ruleCount}: ${title}`;
}

function changeSlide(delta){
  showSlide(currentIndex+delta);
}

function buildToc(){
  const fragment=document.createDocumentFragment();
  slides.forEach((slide,index)=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='rules-toc-link';
    button.innerHTML=`<span>${String(index+1).padStart(2,'0')}</span><b>${slide.dataset.title||`Slide ${index+1}`}</b>`;
    button.addEventListener('click',()=>{
      showSlide(index);
      closeMenu();
      stage.focus({preventScroll:true});
    });
    fragment.append(button);
  });
  tocLinks.append(fragment);
}

function openMenu(){
  deck.classList.add('toc-open');
  menuButton.setAttribute('aria-expanded','true');
  toc.setAttribute('aria-hidden','false');
  menuClose.focus();
}

function closeMenu({restoreFocus=true}={}){
  deck.classList.remove('toc-open');
  menuButton.setAttribute('aria-expanded','false');
  toc.setAttribute('aria-hidden','true');
  if(restoreFocus) menuButton.focus();
}

function toggleFullscreen(){
  if(document.fullscreenElement) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.();
}

function syncFullscreenButton(){
  const active=Boolean(document.fullscreenElement);
  fullscreenButton.setAttribute('aria-label',active?'Exit fullscreen':'Enter fullscreen');
}

function bindGuessExample(){
  const checkboxes=[...document.querySelectorAll('.rules-break-dial')];
  const submit=document.querySelector('#rules-submit-guess');
  const reset=document.querySelector('#rules-reset-guess');
  const feedback=document.querySelector('#rules-guess-feedback');
  if(!checkboxes.length||!submit||!reset||!feedback) return;

  function selected(){
    return checkboxes.filter(checkbox=>checkbox.checked).map(checkbox=>checkbox.value);
  }

  function sync(){
    const picked=selected();
    checkboxes.forEach(checkbox=>{
      checkbox.disabled=!checkbox.checked&&picked.length>=3;
    });
    submit.disabled=picked.length!==3;
    feedback.hidden=true;
  }

  checkboxes.forEach(checkbox=>checkbox.addEventListener('change',sync));
  submit.addEventListener('click',()=>{
    const picked=selected().sort();
    const correct=picked.join(',')===['blue','red','yellow'].sort().join(',');
    feedback.className=`notice ${correct?'wallbreaker-team-feedback':'wallfacer-team-feedback'}`;
    feedback.innerHTML=`<strong>${correct?'Wallbreaker team wins.':'Wallfacer team wins.'}</strong><span>${correct?'The three colors match the plan.':'The final guess contains the wrong set of colors.'}</span>`;
    feedback.hidden=false;
  });
  reset.addEventListener('click',()=>{
    checkboxes.forEach(checkbox=>{ checkbox.checked=false; checkbox.disabled=false; });
    sync();
  });
  sync();
}

function bindWallbreakerChoiceExample(){
  const buttons=[...document.querySelectorAll('[data-wallbreaker-choice]')];
  const title=document.querySelector('#wallbreaker-choice-title');
  const copy=document.querySelector('#wallbreaker-choice-copy');
  if(!buttons.length||!title||!copy) return;

  function select(choice){
    buttons.forEach(button=>{
      const selected=button.dataset.wallbreakerChoice===choice;
      button.classList.toggle('is-selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    if(choice==='sophon'){
      title.textContent='Use Sophon observation';
      copy.textContent='No dial is moved. After resolution, the Wallbreaker privately sees the action the Wallfacer locked.';
    } else {
      title.textContent='Affect Blue by −1';
      copy.textContent='Blue would move from 3 to 2. Sophon observation is not used this round.';
    }
  }

  buttons.forEach(button=>button.addEventListener('click',()=>select(button.dataset.wallbreakerChoice)));
}

function bindPoliceChoiceExample(){
  const buttons=[...document.querySelectorAll('[data-police-choice]')];
  const title=document.querySelector('#police-choice-title');
  const copy=document.querySelector('#police-choice-copy');
  const notice=document.querySelector('#police-private-notice');
  if(!buttons.length||!title||!copy||!notice) return;

  function select(choice){
    buttons.forEach(button=>{
      const selected=button.dataset.policeChoice===choice;
      button.classList.toggle('is-selected',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    if(choice==='arrest'){
      title.textContent='Arrest Lin';
      copy.textContent='Lin’s dial effect is omitted. Shi Qiang does not move a dial this round.';
      notice.hidden=false;
    } else {
      title.textContent='Affect Green by +1';
      copy.textContent='Green would move from 4 to 5. No player is arrested this round.';
      notice.hidden=true;
    }
  }

  buttons.forEach(button=>button.addEventListener('click',()=>select(button.dataset.policeChoice)));
}

function isTypingTarget(target){
  return ['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable;
}

mountGameScreens();
mountWildRuleSlides();
buildToc();
deck.classList.add('is-enhanced');
showSlide(indexForHash(),{updateHash:false,announce:false});
requestAnimationFrame(()=>deck.classList.add('is-ready'));
bindGuessExample();
bindWallbreakerChoiceExample();
bindPoliceChoiceExample();

previousButton.addEventListener('click',()=>changeSlide(-1));
nextButton.addEventListener('click',()=>changeSlide(1));
document.querySelectorAll('[data-rules-next]').forEach(button=>button.addEventListener('click',()=>changeSlide(1)));
menuButton.addEventListener('click',openMenu);
menuClose.addEventListener('click',()=>closeMenu());
menuScrim.addEventListener('click',()=>closeMenu());
fullscreenButton.addEventListener('click',toggleFullscreen);
printButton?.addEventListener('click',()=>window.print());
document.addEventListener('fullscreenchange',syncFullscreenButton);
window.addEventListener('hashchange',()=>showSlide(indexForHash(),{updateHash:false}));

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&deck.classList.contains('toc-open')){
    event.preventDefault();
    closeMenu();
    return;
  }
  if(isTypingTarget(event.target)) return;
  if(event.key==='ArrowRight'||event.key==='PageDown'){ event.preventDefault(); changeSlide(1); }
  if(event.key==='ArrowLeft'||event.key==='PageUp'){ event.preventDefault(); changeSlide(-1); }
  if(event.key==='Home'){ event.preventDefault(); showSlide(0); }
  if(event.key==='End'){ event.preventDefault(); showSlide(slides.length-1); }
});

stage.addEventListener('touchstart',event=>{
  const touch=event.changedTouches[0];
  touchStart={x:touch.clientX,y:touch.clientY};
},{passive:true});
stage.addEventListener('touchend',event=>{
  if(!touchStart) return;
  const touch=event.changedTouches[0];
  const dx=touch.clientX-touchStart.x;
  const dy=touch.clientY-touchStart.y;
  touchStart=null;
  if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.25) changeSlide(dx<0?1:-1);
},{passive:true});
