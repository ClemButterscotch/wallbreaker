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
  const padded=String(currentIndex+1).padStart(2,'0');
  const total=String(slides.length).padStart(2,'0');
  currentTitle.textContent=title;
  progressTitle.textContent=title;
  slideNumber.textContent=`${padded} / ${total}`;
  progressBar.style.width=`${((currentIndex+1)/slides.length)*100}%`;
  progress.setAttribute('aria-valuemax',String(slides.length));
  progress.setAttribute('aria-valuenow',String(currentIndex+1));
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
  if(announce) announcer.textContent=`Slide ${currentIndex+1} of ${slides.length}: ${title}`;
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

function bindStandardExample(){
  const arrestButton=document.querySelector('#example-arrest');
  const resolveButton=document.querySelector('#example-resolve');
  const resetButton=document.querySelector('#example-reset');
  const civilianRow=document.querySelector('#example-civilian-row');
  const policeCopy=document.querySelector('#example-police-copy');
  const stateLabel=document.querySelector('#example-state-label');
  const dial=document.querySelector('#standard-example-result .example-dial');
  const dialValue=document.querySelector('#example-dial-value');
  const delta=document.querySelector('#example-delta');
  const equation=document.querySelector('#example-equation');
  const explanation=document.querySelector('#example-explanation');
  if(!arrestButton||!resolveButton||!resetButton||!dial) return;
  let arrested=false;

  function resetResult(){
    stateLabel.textContent='Waiting for locks';
    dialValue.textContent='1';
    delta.textContent='?';
    equation.innerHTML='<span>+1</span><i>+</i><span>+2</span><i>+</i><span>−1</span><i>=</i><strong>?</strong>';
    explanation.textContent='The public reveal will show the combined dial movement—not who caused it.';
    dial.classList.remove('is-resolved');
  }

  function syncArrest(){
    arrestButton.setAttribute('aria-pressed',String(arrested));
    civilianRow.classList.toggle('is-arrested',arrested);
    policeCopy.textContent=arrested?'Arrest Lin':'Green +1';
    resetResult();
  }

  arrestButton.addEventListener('click',()=>{
    arrested=!arrested;
    syncArrest();
  });
  resolveButton.addEventListener('click',()=>{
    const net=arrested?0:2;
    stateLabel.textContent='Round resolved';
    dialValue.textContent=String(1+net);
    delta.textContent=net===0?'±0':`+${net}`;
    equation.innerHTML=arrested
      ? '<span>+1</span><i>+</i><span class="cancelled">+2</span><i>+</i><span>−1</span><i>=</i><strong>0</strong>'
      : '<span>+1</span><i>+</i><span>+2</span><i>+</i><span>−1</span><i>=</i><strong>+2</strong>';
    explanation.textContent=arrested
      ? 'Lin’s +2 is omitted. Ava’s +1 and Mara’s −1 cancel, so Red stays at 1.'
      : 'The three Red moves add to +2. Shi Qiang’s Green move affects a different dial.';
    dial.classList.remove('is-resolved');
    requestAnimationFrame(()=>dial.classList.add('is-resolved'));
  });
  resetButton.addEventListener('click',()=>{
    arrested=false;
    syncArrest();
  });
  syncArrest();
}

function bindGuessExample(){
  const buttons=[...document.querySelectorAll('[data-guess]')];
  const colors=[...document.querySelectorAll('[data-guess-color]')];
  const outcome=document.querySelector('#guess-outcome');
  if(!buttons.length||!colors.length||!outcome) return;
  buttons.forEach(button=>button.addEventListener('click',()=>{
    const correct=button.dataset.guess==='correct';
    const picked=new Set(correct?['yellow','blue','red']:['yellow','blue','green']);
    buttons.forEach(candidate=>candidate.classList.toggle('is-active',candidate===button));
    colors.forEach(color=>color.classList.toggle('is-picked',picked.has(color.dataset.guessColor)));
    outcome.classList.toggle('danger',correct);
    outcome.querySelector('span').textContent=correct?'All three colors match':'Green is not in the plan';
    outcome.querySelector('strong').textContent=correct?'Wallbreaker wins immediately.':'Loyal team wins immediately.';
  }));
}

function bindMathExample(){
  const next=document.querySelector('#math-example-next');
  const reset=document.querySelector('#math-example-reset');
  const dial=document.querySelector('.math-example-dial');
  const value=document.querySelector('#math-example-value');
  const change=document.querySelector('#math-example-change');
  const equation=document.querySelector('#math-example-equation');
  const copy=document.querySelector('#math-example-copy');
  const phaseLabels=[...document.querySelectorAll('[data-math-phase]')];
  if(!next||!reset||!dial||!value||!change||!equation||!copy||!phaseLabels.length) return;
  let phase=0;

  function renderPhase(animate=false){
    phaseLabels.forEach(label=>label.classList.toggle('is-active',Number(label.dataset.mathPhase)===phase));
    if(phase===0){
      value.textContent='4';
      change.textContent='Ready';
      equation.textContent='Waiting for every player to lock.';
      copy.textContent='The Wallbreaker cannot wait to see advancements before placing decay.';
      next.textContent='Reveal advancements';
    } else if(phase===1){
      value.textContent='7';
      change.textContent='+3';
      equation.textContent='4 + 1 + 2 = 7';
      copy.textContent='All good-player advancements appear together. The field touches the victory threshold—for now.';
      next.textContent='Reveal precommitted decay';
    } else {
      value.textContent='5';
      change.textContent='−2';
      equation.textContent='7 − 2 = 5';
      copy.textContent='The already-locked decay applies immediately. This field does not remain at the threshold.';
      next.textContent='Replay example';
    }
    if(animate){
      dial.classList.remove('is-changing');
      requestAnimationFrame(()=>dial.classList.add('is-changing'));
    } else dial.classList.remove('is-changing');
  }

  next.addEventListener('click',()=>{
    phase=phase===2?0:phase+1;
    renderPhase(true);
  });
  reset.addEventListener('click',()=>{
    phase=0;
    renderPhase();
  });
  renderPhase();
}

function isTypingTarget(target){
  return ['INPUT','TEXTAREA','SELECT'].includes(target.tagName)||target.isContentEditable;
}

buildToc();
deck.classList.add('is-enhanced');
showSlide(indexForHash(),{updateHash:false,announce:false});
requestAnimationFrame(()=>deck.classList.add('is-ready'));
bindStandardExample();
bindGuessExample();
bindMathExample();

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
