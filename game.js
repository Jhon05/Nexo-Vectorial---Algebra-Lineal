(function(){
  'use strict';
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const els={
    boot:$('#bootScreen'),game:$('#gameScreen'),bootCanvas:$('#bootCanvas'),canvas:$('#gameCanvas'),mini:$('#miniCanvas'),
    name:$('#studentName'),launch:$('#launchBtn'),how:$('#howBtn'),qBody:$('#questionBody'),answers:$('#answerArea'),
    qCount:$('#questionCounter'),qBadge:$('#questionTypeBadge'),qProg:$('#questionProgress'),feedback:$('#feedbackBox'),feedbackText:$('#feedbackText'),
    hint:$('#hintBtn'),submit:$('#submitBtn'),continue:$('#continueBtn'),report:$('#reportBtn'),finish:$('#finishBtn'),score:$('#scoreText'),energy:$('#energyBars'),
    integrity:$('#integrityText'),level:$('#levelText'),xp:$('#xpText'),xpFill:$('#xpFill'),sectorName:$('#sectorName'),sectorNumber:$('#sectorNumber'),
    instruction:$('#canvasInstruction'),sectorDots:$('#sectorDots'),modal:$('#modal'),modalTitle:$('#modalTitle'),modalContent:$('#modalContent'),
    modalActions:$('#modalActions'),modalClose:$('#modalClose'),toast:$('#toast'),sound:$('#soundBtn'),gameLayout:$('#gameLayout'),
    flightHud:$('#flightHud'),flightTitle:$('#flightTitle'),flightTarget:$('#flightTarget'),flightFill:$('#flightProgressFill'),arrivalChip:$('#arrivalChip'),
    fullscreenGate:$('#fullscreenGate'),reenterFullscreen:$('#reenterFullscreenBtn'),densityText:$('#densityText'),asteroidText:$('#asteroidText'),warpText:$('#warpText'),challengeRibbon:$('#challengeRibbon')
  };
  const ctx=els.canvas.getContext('2d'),mctx=els.mini.getContext('2d'),bctx=els.bootCanvas.getContext('2d');
  let questions=[],blackHoleQuestions=[],bossQuestions=[],raf=0,selected=null,answerLocked=false,questionStart=0,audioOn=true,audioCtx=null,toastTimer=null,pendingContinueAction=null,integrityCooldownUntil=0,integrityWarningPending=false,integrityReportDownloaded=false;
  const held={left:false,right:false,up:false,down:false};
  const state={student:'',mode:'practice',seed:0,questionIndex:0,score:0,energy:5,integrity:0,xp:0,sectorProgress:[0,0,0,0],answers:[],hints:0,startedAt:null,endedAt:null,disqualified:false,completed:false,phase:'boot',phaseBeforePause:'flight',pausedAt:0,drone:{x:0,y:0,vx:0,vy:0,tilt:0},flight:null,particles:[],lastFrame:0,integrityLog:[],currentChallenge:null,blackHoleIndex:0,space:null,stats:{asteroidHits:0,asteroidsAvoided:0,blackHolesEntered:0,blackHoleSuccess:0,blackHoleFails:0,asteroidPenalty:0,blackHolePenalty:0,maxAsteroids:0,distance:0}};
  let sectorNames=['ÓRBITA DE COMPONENTES','NÚCLEO DE DIRECCIÓN','CÁMARA ORTOGONAL','FUNDICIÓN MATRICIAL','ENSAMBLADOR FILA–COLUMNA','REACTOR DEL DETERMINANTE','CARTOGRAFÍA DE SISTEMAS','NÚCLEO DE REDUCCIÓN'];

  function init(){
    NVScorm.init();
    const scormName=NVScorm.get('cmi.core.student_name');
    if(scormName) els.name.value=scormName;
    resizeAll(); drawBoot(0); bind(); renderEnergy();
    window.addEventListener('resize',resizeAll);
  }
  function bind(){
    els.launch.addEventListener('click',launchGame); els.how.addEventListener('click',showHow);
    els.hint.addEventListener('click',showHint); els.submit.addEventListener('click',submitAnswer); els.continue?.addEventListener('click',continueAfterFeedback); els.report.addEventListener('click',()=>downloadReport(false));
    els.finish.addEventListener('click',confirmFinish); els.modalClose.addEventListener('click',closeModal); els.sound.addEventListener('click',toggleSound);
    $$('.side-rail button').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
    $$('[data-move]').forEach(b=>{const d=b.dataset.move;b.addEventListener('pointerdown',()=>moveDrone(d));});
    window.addEventListener('keydown',onKey);
    document.addEventListener('contextmenu',e=>{if(state.mode==='exam'&&!state.completed){e.preventDefault();integrityStrike('Intento de menú contextual');}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='exam'&&!state.completed) integrityStrike('Cambio de pestaña o ventana');});
    window.addEventListener('blur',()=>{if(state.mode==='exam'&&!state.completed&&document.visibilityState==='visible') integrityStrike('Pérdida de foco de la evaluación');});
    document.addEventListener('fullscreenchange',handleFullscreenChange);document.addEventListener('webkitfullscreenchange',handleFullscreenChange);
    els.reenterFullscreen.addEventListener('click',reenterFullscreen);
    window.addEventListener('orientationchange',()=>setTimeout(resizeAll,250));window.visualViewport?.addEventListener('resize',()=>setTimeout(resizeAll,80));
    window.addEventListener('beforeunload',()=>saveProgress());
  }
  function onKey(e){
    if(state.mode==='exam'&&!state.completed){
      const k=e.key.toLowerCase();
      if((e.ctrlKey||e.metaKey)&&['p','s','u','c'].includes(k) || e.key==='F12' || (e.ctrlKey&&e.shiftKey&&['i','j','c'].includes(k))){e.preventDefault();integrityStrike(`Atajo bloqueado: ${e.key}`);return;}
    }
    if(!els.game.hidden){
      if(['arrowleft','a'].includes(e.key.toLowerCase())) moveDrone('left');
      if(['arrowright','d'].includes(e.key.toLowerCase())) moveDrone('right');
      if(['arrowup','w'].includes(e.key.toLowerCase())) moveDrone('up');
      if(['arrowdown','s'].includes(e.key.toLowerCase())) moveDrone('down');
      if(e.key==='Enter' && document.activeElement?.id==='numericAnswer') submitAnswer();
    }
  }
  function resizeAll(){
    [els.bootCanvas,els.canvas,els.mini].forEach(c=>{
      const r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);c.width=Math.max(1,Math.round(r.width*d));c.height=Math.max(1,Math.round(r.height*d));c._d=d;
    });
  }
  function isFullscreen(){return !!(document.fullscreenElement||document.webkitFullscreenElement);}
  async function requestGameFullscreen(){
    if(isFullscreen())return true;
    const target=document.documentElement;const request=target.requestFullscreen||target.webkitRequestFullscreen;
    if(!request)return false;
    try{const result=request.call(target,{navigationUI:'hide'});if(result?.then)await result;return true;}
    catch(_first){try{const result=request.call(target);if(result?.then)await result;return true;}catch(_second){return false;}}
  }
  async function launchGame(){
    state.student=els.name.value.trim()||NVScorm.get('cmi.core.student_name')||'Estudiante Vectorial';
    state.mode=document.querySelector('input[name="mode"]:checked').value;
    const allowed=await requestGameFullscreen();
    if(!allowed){showModal('Pantalla completa requerida','<p>Este juego funciona siempre en pantalla completa. Autoriza el permiso del navegador y vuelve a pulsar <b>Iniciar operación</b>.</p><p>En Brightspace, el recurso debe abrirse en una ventana o marco que permita pantalla completa.</p>',[{label:'REINTENTAR',action:()=>{closeModal();launchGame();},primary:true}]);return;}
    state.seed=(Date.now()^Math.floor(Math.random()*1e9))>>>0;questions=NVQuestions.build(state.seed);state.startedAt=new Date();state.phase='flight';
    document.body.classList.add('playing');els.boot.hidden=true;els.game.hidden=false;buildSectorDots();resizeAll();renderQuestion();animate(performance.now());saveProgress();
  }
  function showHow(){
    showModal('Cómo jugar',`<ol><li>La nave vuela entre 24 puntos de prueba. Durante el trayecto puedes ajustar su posición con flechas, WASD o los controles táctiles.</li><li>Al llegar a cada baliza aparece el reto matemático. Las preguntas cubren únicamente el primer corte: vectores, matrices, determinantes, sistemas y Gauss–Jordan.</li><li>Una respuesta correcta vale hasta <b>0.25</b>. Usar pista reduce la recompensa. Un error resta <b>0.05</b>.</li><li>La misión funciona siempre en pantalla completa y se pausa automáticamente si sales. En evaluación, la quinta infracción de integridad anula el intento y fija la nota en 0.00.</li><li>Al finalizar se genera un informe HTML y la nota se envía a Brightspace mediante SCORM 1.2.</li></ol>`);
  }
  function renderQuestion(){
    if(state.questionIndex>=questions.length){finishMission(false);return;}
    const q=questions[state.questionIndex];selected=null;answerLocked=true;q._hintUsed=false;q._attempts=0;
    const sec=q.sector;state.drone.x=0;state.drone.y=0;state.drone.vx=0;state.drone.vy=0;state.drone.tilt=0;
    els.sectorNumber.textContent=`SECTOR ${sec}`;els.sectorName.textContent=sectorNames[sec-1];
    els.qCount.textContent=`PREGUNTA ${state.questionIndex+1} / ${questions.length}`;els.qBadge.textContent=q.badge;renderProgress();updateHUD();
    beginFlight(q,false);saveProgress();
  }
  function beginFlight(q,departure){
    state.phase=departure?'departure':'flight';answerLocked=true;selected=null;els.gameLayout.classList.add('flight-mode');els.flightHud.hidden=false;els.arrivalChip.hidden=true;
    els.hint.disabled=true;els.submit.disabled=true;els.flightFill.style.width='0%';
    const target=getMissionTarget(q);const now=performance.now();
    state.flight={start:now,duration:departure?1250:(state.questionIndex%6===0?4300:3300),progress:0,target,departure,completed:false};
    els.flightTitle.textContent=departure?'SALIENDO DEL PUNTO DE PRUEBA':'TRAZANDO RUTA DE APROXIMACIÓN';
    els.flightTarget.textContent=departure?'Propulsores al máximo · siguiente baliza en curso':target.detail;
    els.instruction.textContent=departure?'La nave abandona el módulo y calcula la siguiente ruta.':`Vuela hacia ${target.label}. Ajusta la trayectoria con flechas, WASD o los controles táctiles.`;
    els.qBody.innerHTML='';els.answers.innerHTML='';mctx.clearRect(0,0,els.mini.width,els.mini.height);
    requestAnimationFrame(()=>{resizeAll();setTimeout(resizeAll,480);});
  }
  async function revealQuestion(){
    const q=questions[state.questionIndex];if(!q||state.completed)return;
    els.instruction.textContent=q.instruction;els.qBody.innerHTML=q.prompt;renderOptions(q);setFeedback('Selecciona o escribe una respuesta y luego pulsa Enviar.','neutral');
    await typeset();if(state.completed)return;
    state.phase='question';state.flight=null;answerLocked=false;questionStart=Date.now();els.gameLayout.classList.remove('flight-mode');els.flightHud.hidden=true;
    els.submit.disabled=false;els.hint.disabled=false;requestAnimationFrame(()=>{resizeAll();drawMini(q,performance.now());setTimeout(resizeAll,480);});saveProgress();
  }
  function completeArrival(){
    if(state.phase!=='flight'||state.flight?.completed)return;state.flight.completed=true;state.phase='arrival';els.flightFill.style.width='100%';els.arrivalChip.hidden=false;els.flightTitle.textContent='BALIZA ALCANZADA';els.flightTarget.textContent='Desplegando interfaz de prueba…';beep(880,.13);spawnBurst('good');
    setTimeout(()=>{els.arrivalChip.hidden=true;revealQuestion();},720);
  }
  function completeDeparture(){
    if(state.phase!=='departure'||state.flight?.completed)return;state.flight.completed=true;state.questionIndex++;renderQuestion();
  }
  function getMissionTarget(q){
    const v=q.visual||{};
    if(q.sector===1){const p=v.u||v.a||v.b||[(state.questionIndex%7)-3,(state.questionIndex%5)-2];const point=p;return{label:`la coordenada (${fmtCoord(point[0])}, ${fmtCoord(point[1])})`,detail:`DESTINO VECTORIAL · X ${fmtCoord(point[0])} · Y ${fmtCoord(point[1])}`,x:Number(point[0])||0,y:Number(point[1])||0,code:'VECTOR'};}
    if(q.sector===2){const names={matrixAdd:'CONSOLIDADOR A+B',matrixScale:'AMPLIFICADOR ESCALAR',matrixMultiply:'ENSAMBLADOR FILA–COLUMNA',transpose:'TRANSPOSITOR',matrixType:'CLASIFICADOR MATRICIAL'};const code=names[v.kind]||'MÓDULO MATRICIAL';return{label:code.toLowerCase(),detail:`DESTINO INDUSTRIAL · ${code}`,x:(state.questionIndex%3)-1,y:1,code};}
    if(q.sector===3){const code=v.kind==='systemLines'?'RADAR DE SISTEMAS':v.kind==='rowSwap'?'CÁMARA DE PERMUTACIÓN':'NÚCLEO DEL DETERMINANTE';return{label:code.toLowerCase(),detail:`DESTINO REACTOR · ${code}`,x:(state.questionIndex%5)-2,y:2,code};}
    const code=v.target?`PIVOTE F${v.target[0]+1}C${v.target[1]+1}`:(v.op||'NODO GAUSS–JORDAN');return{label:code.toLowerCase(),detail:`DESTINO DE COMANDO · ${code}`,x:(state.questionIndex%4)-1.5,y:3,code};
  }
  function fmtCoord(n){return Number.isInteger(Number(n))?String(Number(n)):Number(n).toFixed(1);}
  function renderOptions(q){
    els.answers.innerHTML='';els.answers.classList.toggle('six-options',Array.isArray(q.options)&&q.options.length===6);
    if(['mcq','roman','operation'].includes(q.type)){
      q.options.forEach((o,i)=>{const b=document.createElement('button');b.type='button';b.className='option-btn';b.dataset.index=i;b.innerHTML=`<span class="option-letter">${o.letter}</span><span>${o.html}</span>`;b.addEventListener('click',()=>selectOption(i));els.answers.appendChild(b);});
    }else if(q.type==='tf'){
      const wrap=document.createElement('div');wrap.className='tf-grid';['VERDADERO','FALSO'].forEach((t,i)=>{const b=document.createElement('button');b.type='button';b.className='option-btn';b.dataset.index=String(i===0);b.innerHTML=`<span>${t}</span>`;b.addEventListener('click',()=>selectOption(i===0));wrap.appendChild(b);});els.answers.appendChild(wrap);
    }else if(q.type==='numeric'){
      const wrap=document.createElement('div');wrap.innerHTML=`<div class="numeric-wrap"><input id="numericAnswer" type="text" inputmode="numeric" pattern="-?[0-9]*" aria-label="Respuesta entera" placeholder="Escribe el valor entero"/><button id="clearNumeric" type="button">BORRAR</button></div><div class="keypad">${['1','2','3','4','5','6','7','8','9','-','0'].map(x=>`<button type="button" data-key="${x}">${x}</button>`).join('')}</div>`;els.answers.appendChild(wrap);const numeric=$('#numericAnswer');numeric.addEventListener('input',()=>{let v=numeric.value.replace(/[^0-9-]/g,'');v=v.startsWith('-')?'-'+v.slice(1).replace(/-/g,''):v.replace(/-/g,'');numeric.value=v;});$('#clearNumeric').addEventListener('click',()=>numeric.value='');$$('[data-key]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.key;if(k==='-'&&numeric.value.includes('-'))return;numeric.value=k==='-'?'-'+numeric.value:numeric.value+k;}));
    }
  }
  function selectOption(value){if(answerLocked)return;selected=value;$$('.option-btn').forEach(b=>b.classList.remove('selected'));if(typeof value==='boolean'){const target=$(`.option-btn[data-index="${value}"]`);target?.classList.add('selected');}else $(`.option-btn[data-index="${value}"]`)?.classList.add('selected');beep(520,.04);}
  function submitAnswer(){
    if(answerLocked)return;const q=questions[state.questionIndex];let value=selected;
    if(q.type==='numeric'){const inp=$('#numericAnswer');if(!inp||inp.value===''){toast('Escribe una respuesta numérica.');return;}value=Number(inp.value);}
    if(value===null){toast('Selecciona una respuesta.');return;}
    q._attempts++;let correct=false;
    if(q.type==='numeric') correct=Math.abs(value-q.answerValue)<1e-9;else if(q.type==='tf') correct=value===q.answer;else correct=Number(value)===q.answer;
    if(correct){
      answerLocked=true;const reward=q._hintUsed?.18:.25;state.score=Math.min(5,Math.max(0,state.score+reward));state.xp+=q._hintUsed?80:100;state.energy=Math.min(5,state.energy+(.01));state.sectorProgress[q.sector-1]++;
      state.answers.push(recordAnswer(q,true,value,reward));setFeedback(`Correcto. ${q.explanation}`,'good');markOptions(q,true,value);beep(740,.12);spawnBurst('good');els.submit.disabled=true;els.hint.disabled=true;updateHUD();saveProgress();
      setTimeout(()=>beginFlight(q,true),1250);
    }else{
      state.score=Math.max(0,state.score-.05);state.energy=Math.max(0,state.energy-1);state.answers.push(recordAnswer(q,false,value,-.05));setFeedback(`No es correcto. ${q._hintUsed?'Revisa la pista y vuelve a intentarlo.':'Puedes volver a intentarlo o solicitar una pista.'}`,'bad');markOptions(q,false,value);beep(180,.18);spawnBurst('bad');updateHUD();saveProgress();
      if(state.energy<=0){state.energy=2;updateHUD();showModal('Recarga de emergencia','<p>La energía llegó a cero. El dron ha activado una recarga de emergencia de 2 unidades para que puedas completar la misión. La penalización de nota ya fue aplicada.</p>');}
    }
  }
  function recordAnswer(q,correct,value,delta){return {id:q.id,sector:q.sector,type:q.badge,correct,value:String(value),delta,timeSec:Math.round((Date.now()-questionStart)/1000),hint:!!q._hintUsed,prompt:stripHtml(q.prompt)};}
  function markOptions(q,correct,value){
    if(q.type==='numeric')return;
    $$('.option-btn').forEach(b=>{
      const raw=b.dataset.index;const v=q.type==='tf'?raw==='true':Number(raw);
      if(correct&&v===value)b.classList.add('correct');else if(!correct&&v===value)b.classList.add('wrong');
    });
  }
  function showHint(){const q=questions[state.questionIndex];q._hintUsed=true;state.hints++;setFeedback(q.hint,'hinting');els.hint.disabled=true;typeset();}
  function renderProgress(){els.qProg.innerHTML=questions.map((_,i)=>`<i class="${i<state.questionIndex?'done':i===state.questionIndex?'current':''}"></i>`).join('');}
  function updateHUD(){
    els.score.textContent=`${state.score.toFixed(2)} / 5.00`;els.integrity.textContent=`${state.integrity} / 5`;renderEnergy();
    const level=Math.min(12,1+Math.floor(state.xp/200));els.level.textContent=level;els.xp.textContent=`${state.xp} / ${level*600}`;els.xpFill.style.width=`${Math.min(100,(state.xp%(level*600))/(level*600)*100)}%`;
    $$('#sectorDots button').forEach((b,i)=>{b.classList.toggle('complete',state.sectorProgress[i]>=6);b.classList.toggle('active',(questions[state.questionIndex]?.sector||4)-1===i);b.title=`${sectorNames[i]}: ${state.sectorProgress[i]}/6`;});
  }
  function renderEnergy(){els.energy.innerHTML=Array.from({length:5},(_,i)=>`<i class="${i<Math.ceil(state.energy)?'on':''}"></i>`).join('');}
  function buildSectorDots(){els.sectorDots.innerHTML=sectorNames.map((_,i)=>`<button type="button" aria-label="Sector ${i+1}">${i+1}</button>`).join('');}
  function setFeedback(text,kind){els.feedback.className=`feedback-box ${kind==='neutral'?'':kind}`;els.feedbackText.innerHTML=text;typeset();}
  function typeset(){const nodes=[els.qBody,els.answers,els.feedback].filter(Boolean);if(window.MathJax?.typesetPromise){try{MathJax.typesetClear?.(nodes);}catch(_e){}return MathJax.typesetPromise(nodes).catch(err=>{console.warn('MathJax:',err);});}return Promise.resolve();}
  function saveProgress(){try{localStorage.setItem('nexoVectorialState',JSON.stringify({...state,particles:[],drone:{x:state.drone.x,y:state.drone.y,tilt:state.drone.tilt},flight:null}));}catch(_e){}NVScorm.saveProgress(state);}
  function handleFullscreenChange(){
    if(!state.startedAt||state.completed)return;
    if(!isFullscreen()){
      state.phaseBeforePause=state.phase==='paused'?state.phaseBeforePause:state.phase;state.phase='paused';state.pausedAt=performance.now();els.fullscreenGate.hidden=false;
      if(state.mode==='exam')integrityStrike('Salida de pantalla completa','Se abandonó el modo de pantalla completa mediante Escape o un control del navegador.');
    }else{
      els.fullscreenGate.hidden=true;if(state.phase==='paused'){const pause=performance.now()-state.pausedAt;if(state.flight)state.flight.start+=pause;state.phase=state.phaseBeforePause||'flight';}
      requestAnimationFrame(()=>{resizeAll();setTimeout(resizeAll,300);});
    }
  }
  async function reenterFullscreen(){
    const ok=await requestGameFullscreen();if(!ok)toast('El navegador no autorizó la pantalla completa. Revisa el permiso del sitio.');
  }

  function resumeAfterIntegrityWarning(){
    integrityWarningPending=false;els.modal.hidden=true;
    if(state.completed)return;
    if(!isFullscreen()){els.fullscreenGate.hidden=false;return;}
    if(state.phase==='paused')state.phase=state.phaseBeforePause||'flight';
    requestAnimationFrame(()=>{resizeAll();setTimeout(resizeAll,180);});
  }
  function integrityStrike(reason,detail=''){
    if(state.mode!=='exam'||state.disqualified||state.completed||!state.startedAt)return;
    const now=Date.now();
    if(now<integrityCooldownUntil)return;
    const last=state.integrityLog.at(-1);
    if(last&&now-last.time<1500)return;
    integrityCooldownUntil=now+1700;
    state.phaseBeforePause=state.phase==='paused'?(state.phaseBeforePause||'flight'):state.phase;
    state.phase='paused';Object.keys(held).forEach(k=>held[k]=false);
    state.integrity++;
    const effect=state.integrity===1?'Advertencia':state.integrity<5?'−0.05':'Intento anulado · nota 0.00';
    state.integrityLog.push({time:now,reason,detail,effect,number:state.integrity});
    if(state.integrity>=2&&state.integrity<=4)state.score=Math.max(0,state.score-.05);
    updateHUD();saveProgress();
    if(state.integrity>=5){
      integrityWarningPending=false;state.disqualified=true;state.score=0;state.completed=true;state.endedAt=new Date();
      answerLocked=true;pendingContinueAction=null;Object.keys(held).forEach(k=>held[k]=false);
      [els.hint,els.submit,els.continue,els.finish].filter(Boolean).forEach(b=>{b.disabled=true;});
      if(raf){cancelAnimationFrame(raf);raf=0;}
      NVScorm.finish(0,'failed','integrity-disqualified');
      try{localStorage.setItem('nexoVectorialIntegrityResult',JSON.stringify({student:state.student,score:0,status:'failed',location:'integrity-disqualified',integrity:state.integrity,log:state.integrityLog,endedAt:state.endedAt.toISOString()}));}catch(_e){}
      updateHUD();
      if(!integrityReportDownloaded){integrityReportDownloaded=true;setTimeout(()=>downloadReport(true),180);}
      showModal('Intento anulado por integridad',`<div class="integrity-warning"><p><strong>Se alcanzó la quinta incidencia.</strong></p><p>El quiz fue terminado inmediatamente y la nota enviada a Brightspace es <b>0.00 / 5.00</b>.</p><p><strong>Estado SCORM:</strong> failed · <strong>Ubicación:</strong> integrity-disqualified.</p><p>Último evento: ${escapeHtml(reason)}</p></div>`,[{label:'DESCARGAR INFORME NUEVAMENTE',action:()=>downloadReport(false),primary:true}]);
      return;
    }
    integrityWarningPending=true;
    const penalty=state.integrity===1?'Esta primera incidencia queda como advertencia y no descuenta nota.':`Se descontaron 0.05 puntos. Quedan ${5-state.integrity} incidencias antes de la anulación automática.`;
    showModal(`Incidencia de integridad ${state.integrity}/5`,`<div class="integrity-warning"><p><strong>${escapeHtml(reason)}</strong></p>${detail?`<p>${escapeHtml(detail)}</p>`:''}<p>${penalty}</p><span class="integrity-critical-line">RECUERDA: AL QUINTO BLOQUEO EL QUIZ SE ANULA Y LA NOTA QUEDA EN 0.00.</span><p>El estado SCORM se envía como <b>failed</b>.</p></div>`,[{label:'CONTINUAR EN PANTALLA COMPLETA',action:resumeAfterIntegrityWarning,primary:true}]);
  }
  function confirmFinish(){showModal('Finalizar misión',`<p>Has respondido ${state.answers.filter(a=>a.correct).length} retos correctamente. Tu nota actual es <b>${state.score.toFixed(2)} / 5.00</b>.</p><p>Al finalizar se enviará la nota a Brightspace y se descargará el informe HTML.</p>`,[{label:'CANCELAR',action:closeModal},{label:'FINALIZAR',action:()=>finishMission(true),primary:true}]);}
  function finishMission(manual){
    if(state.completed&&!state.disqualified)return;state.completed=true;state.endedAt=new Date();const status=state.disqualified?'failed':(state.score>=3?'passed':'failed');NVScorm.finish(state.disqualified?0:state.score,status,manual?'manual-finish':'completed');downloadReport(true);closeModal();showModal('Misión finalizada',`<p>Nota enviada: <b>${state.score.toFixed(2)} / 5.00</b></p><p>Sectores recuperados: <b>${state.sectorProgress.filter(x=>x>=6).length}/4</b></p><p>El informe HTML se descargó automáticamente.</p>`,[{label:'CERRAR',action:closeModal,primary:true}]);updateHUD();}
  function downloadReport(auto){
    const end=state.endedAt||new Date();const duration=Math.max(0,Math.round((end-(state.startedAt||end))/1000));const rows=state.answers.map((a,i)=>`<tr><td>${i+1}</td><td>${a.sector}</td><td>${escapeHtml(a.type)}</td><td>${a.correct?'Correcta':'Incorrecta'}</td><td>${a.delta>0?'+':''}${a.delta.toFixed(2)}</td><td>${a.hint?'Sí':'No'}</td><td>${a.timeSec}s</td></tr>`).join('');
    const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe Nexo Vectorial</title><style>body{font-family:Arial;margin:32px;color:#10233a}h1{color:#075985}.hero{background:#071b33;color:white;padding:24px;border-radius:14px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.m{border:1px solid #8bdcf4;padding:14px;border-radius:10px}.v{font-size:1.6rem;font-weight:bold;color:#075985}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ccdce7;text-align:left}th{background:#e9f8ff}.warn{background:#ffe3e9;border-left:5px solid #d61f4c;padding:12px}@media(max-width:700px){.metrics{grid-template-columns:1fr 1fr}}</style></head><body><div class="hero"><h1 style="color:white">Nexo Vectorial — Informe de misión</h1><p>Operación Matriz Cero · Álgebra Lineal · Corte 1</p></div>${state.disqualified?'<div class="warn"><b>Intento anulado por cinco infracciones de integridad. Nota definitiva: 0.00.</b></div>':''}<div class="metrics"><div class="m">Estudiante<div class="v">${escapeHtml(state.student)}</div></div><div class="m">Nota<div class="v">${state.score.toFixed(2)} / 5.00</div></div><div class="m">Aciertos<div class="v">${state.answers.filter(a=>a.correct).length}</div></div><div class="m">Duración<div class="v">${formatTime(duration)}</div></div></div><h2>Dominio por sector</h2><ol>${sectorNames.map((n,i)=>`<li><b>${n}</b>: ${state.sectorProgress[i]}/6 retos superados.</li>`).join('')}</ol><h2>Detalle de respuestas</h2><table><thead><tr><th>#</th><th>Sector</th><th>Tipo</th><th>Resultado</th><th>Cambio</th><th>Pista</th><th>Tiempo</th></tr></thead><tbody>${rows||'<tr><td colspan="7">Sin respuestas registradas.</td></tr>'}</tbody></table><h2>Integridad</h2><p>Eventos registrados: ${state.integrity}</p><ul>${state.integrityLog.map(x=>`<li>${new Date(x.time).toLocaleString('es-CO')}: ${escapeHtml(x.reason)}</li>`).join('')||'<li>Sin eventos.</li>'}</ul><h2>Recomendación</h2><p>${recommendation()}</p><p><small>Generado el ${end.toLocaleString('es-CO')}.</small></p></body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Informe_Nexo_Vectorial_${safeName(state.student)}_${new Date().toISOString().slice(0,10)}.html`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);if(!auto)toast('Informe HTML generado.');
  }
  function recommendation(){const min=Math.min(...state.sectorProgress),i=state.sectorProgress.indexOf(min);return min>=5?'Desempeño sólido en los contenidos del primer corte. Refuerza la explicación escrita de tus procedimientos.':`Conviene reforzar ${sectorNames[i].toLowerCase()}, especialmente mediante ejercicios breves sin pista y revisión de los errores registrados.`;}
  function openPanel(panel){
    if(panel==='mission')return;
    if(panel==='log'){const recent=state.answers.slice(-8).reverse().map(a=>`<tr><td>${a.id}</td><td>${a.correct?'✓':'✗'}</td><td>${a.delta>0?'+':''}${a.delta.toFixed(2)}</td><td>${a.timeSec}s</td></tr>`).join('');showModal('Bitácora',`<table class="progress-table"><thead><tr><th>Reto</th><th>Resultado</th><th>Puntaje</th><th>Tiempo</th></tr></thead><tbody>${recent||'<tr><td colspan="4">Aún no hay eventos.</td></tr>'}</tbody></table>`);}
    if(panel==='progress'){showModal('Progreso por sector',`<table class="progress-table"><thead><tr><th>Sector</th><th>Superados</th><th>Estado</th></tr></thead><tbody>${sectorNames.map((n,i)=>`<tr><td>${n}</td><td>${state.sectorProgress[i]}/6</td><td>${state.sectorProgress[i]>=6?'Recuperado':'En proceso'}</td></tr>`).join('')}</tbody></table><p>Nota actual: <b>${state.score.toFixed(2)} / 5.00</b></p>`);}
    if(panel==='help')showHow();
  }
  function showModal(title,content,actions=[]){els.modalTitle.textContent=title;els.modalContent.innerHTML=content;els.modalActions.innerHTML='';actions.forEach(a=>{const b=document.createElement('button');b.type='button';b.textContent=a.label;b.className=a.primary?'primary-btn':'ghost-btn';b.addEventListener('click',a.action);els.modalActions.appendChild(b);});els.modal.hidden=false;}
  function closeModal(){if(integrityWarningPending){resumeAfterIntegrityWarning();return;}els.modal.hidden=true;}
  function toast(msg){clearTimeout(toastTimer);els.toast.textContent=msg;els.toast.classList.add('show');toastTimer=setTimeout(()=>els.toast.classList.remove('show'),1800);}
  function toggleSound(){audioOn=!audioOn;els.sound.textContent=audioOn?'🔊':'🔇';}
  function beep(freq,dur){if(!audioOn)return;try{audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=freq;o.type='sine';g.gain.setValueAtTime(.04,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+dur);}catch(_e){}}
  function moveDrone(dir){if(state.phase==='paused'||state.completed)return;const n=(state.phase==='flight'||state.phase==='departure')?95:28;if(dir==='left')state.drone.vx-=n;if(dir==='right')state.drone.vx+=n;if(dir==='up')state.drone.vy-=n*.55;if(dir==='down')state.drone.vy+=n*.55;beep(340,.03);}
  function spawnBurst(kind){for(let i=0;i<32;i++)state.particles.push({x:.5,y:.52,vx:(Math.random()-.5)*.018,vy:(Math.random()-.5)*.018,life:1,kind});}

  function animate(t){if(els.game.hidden)return;const dt=Math.min(.033,(t-(state.lastFrame||t))/1000);state.lastFrame=t;const q=questions[state.questionIndex];drawScene(q,t,dt);if(state.phase==='question')drawMini(q,t);raf=requestAnimationFrame(animate);}
  function prep(c,context){const d=c._d||1;context.setTransform(d,0,0,d,0,0);return {w:c.width/d,h:c.height/d};}
  function drawBoot(t){const {w,h}=prep(els.bootCanvas,bctx);bctx.clearRect(0,0,w,h);const g=bctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#010716');g.addColorStop(.55,'#06315a');g.addColorStop(1,'#010611');bctx.fillStyle=g;bctx.fillRect(0,0,w,h);bctx.strokeStyle='rgba(32,229,255,.16)';bctx.lineWidth=1;for(let x=-h;x<w+h;x+=46){bctx.beginPath();bctx.moveTo(x,0);bctx.lineTo(x-h,h);bctx.stroke()}for(let i=0;i<90;i++){const x=(i*97)%w,y=(i*53)%h;bctx.fillStyle=`rgba(120,220,255,${.15+(i%5)*.07})`;bctx.fillRect(x,y,1.5,1.5)}const cx=w*.72,cy=h*.48;for(let r=60;r<Math.min(w,h)*.44;r+=44){bctx.strokeStyle=`rgba(32,229,255,${.16-r/3000})`;bctx.lineWidth=2;bctx.beginPath();bctx.ellipse(cx,cy,r,r*.34,0,0,Math.PI*2);bctx.stroke()}bctx.strokeStyle='rgba(32,229,255,.5)';for(let i=0;i<4;i++){const a=-.8+i*.55;bctx.beginPath();bctx.moveTo(cx,cy);bctx.lineTo(cx+Math.cos(a)*260,cy+Math.sin(a)*180);bctx.stroke()}requestAnimationFrame(drawBoot);}
  function drawScene(q,t,dt){if(!q)return;const {w,h}=prep(els.canvas,ctx);ctx.clearRect(0,0,w,h);if(state.phase==='paused'){drawFlightScene(ctx,w,h,q,t,dt,true);drawPauseVeil(ctx,w,h);return;}if(['flight','departure','arrival'].includes(state.phase)){drawFlightScene(ctx,w,h,q,t,dt,false);drawParticles(ctx,w,h,dt);return;}drawSciBackground(ctx,w,h,q.sector,t);if(q.sector===1)drawVectorScene(ctx,w,h,q.visual,t);if(q.sector===2)drawMatrixFactory(ctx,w,h,q.visual,t);if(q.sector===3)drawReactor(ctx,w,h,q.visual,t);if(q.sector===4)drawGaussRoom(ctx,w,h,q.visual,t);updateShipPhysics(w,h,dt,.35);drawShip(ctx,w/2+state.drone.x,h*.79+state.drone.y,t,state.drone.tilt,.72);drawParticles(ctx,w,h,dt);}
  function drawSciBackground(c,w,h,sector,t){const hue=[198,205,194,220][sector-1];const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,`hsl(${hue} 70% 13%)`);g.addColorStop(.5,'#061426');g.addColorStop(1,'#020711');c.fillStyle=g;c.fillRect(0,0,w,h);c.strokeStyle='rgba(44,157,255,.13)';for(let y=60;y<h;y+=42){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke()}for(let x=0;x<w;x+=54){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke()}c.fillStyle='rgba(3,8,18,.6)';c.beginPath();c.moveTo(0,0);c.lineTo(w*.18,0);c.lineTo(w*.3,h);c.lineTo(0,h);c.fill();c.beginPath();c.moveTo(w,0);c.lineTo(w*.82,0);c.lineTo(w*.7,h);c.lineTo(w,h);c.fill();c.strokeStyle='rgba(32,229,255,.22)';c.lineWidth=2;c.strokeRect(w*.08,h*.08,w*.84,h*.76);}
  function drawVectorScene(c,w,h,v,t){const ox=w*.48,oy=h*.58,scale=Math.min(w/12,h/10);drawGrid(c,ox,oy,scale,w,h);if(v.kind==='projection'){drawArrow(c,ox,oy,v.a[0]*scale,-v.a[1]*scale,'#25a1ff','a');drawArrow(c,ox,oy,v.b[0]*scale,-v.b[1]*scale,'#65f192','b');drawArrow(c,ox,oy,v.proj[0]*scale,-v.proj[1]*scale,'#ffd250','proj');c.setLineDash([6,5]);c.strokeStyle='#ffd250';c.beginPath();c.moveTo(ox+v.a[0]*scale,oy-v.a[1]*scale);c.lineTo(ox+v.proj[0]*scale,oy-v.proj[1]*scale);c.stroke();c.setLineDash([]);}else{if(v.u)drawArrow(c,ox,oy,v.u[0]*scale,-v.u[1]*scale,'#2585ff','u');if(v.v&&v.v.some(n=>n))drawArrow(c,ox,oy,v.v[0]*scale,-v.v[1]*scale,'#64ec83','v');if(v.result&&v.showResult)drawArrow(c,ox,oy,v.result[0]*scale,-v.result[1]*scale,'#ffd250','u+v');}c.fillStyle='rgba(32,229,255,.08)';c.fillRect(ox-scale*4.7,oy-scale*4.2,scale*9.4,scale*8.2);}
  function drawGrid(c,ox,oy,s,w,h){c.save();c.strokeStyle='rgba(61,161,255,.25)';c.fillStyle='#ccefff';c.font='12px Segoe UI';c.textAlign='center';for(let i=-5;i<=5;i++){c.beginPath();c.moveTo(ox+i*s,oy-4.5*s);c.lineTo(ox+i*s,oy+4*s);c.stroke();c.fillText(i,ox+i*s,oy+17);c.beginPath();c.moveTo(ox-5*s,oy+i*s);c.lineTo(ox+5*s,oy+i*s);c.stroke();if(i!==0)c.fillText(-i,ox-13,oy+i*s+4)}c.strokeStyle='#eefaff';c.lineWidth=2;c.beginPath();c.moveTo(ox-5*s,oy);c.lineTo(ox+5*s,oy);c.moveTo(ox,oy-4.5*s);c.lineTo(ox,oy+4*s);c.stroke();c.fillText('x',ox+5*s+12,oy+4);c.fillText('y',ox-8,oy-4.5*s-8);c.restore();}
  function drawArrow(c,ox,oy,dx,dy,color,label){c.save();c.strokeStyle=color;c.fillStyle=color;c.lineWidth=4;c.shadowColor=color;c.shadowBlur=10;c.beginPath();c.moveTo(ox,oy);c.lineTo(ox+dx,oy+dy);c.stroke();const a=Math.atan2(dy,dx);c.beginPath();c.moveTo(ox+dx,oy+dy);c.lineTo(ox+dx-13*Math.cos(a-.5),oy+dy-13*Math.sin(a-.5));c.lineTo(ox+dx-13*Math.cos(a+.5),oy+dy-13*Math.sin(a+.5));c.closePath();c.fill();c.font='bold 17px Segoe UI';c.shadowBlur=0;c.fillText(label,ox+dx+8,oy+dy-8);c.setLineDash([5,5]);c.lineWidth=1.5;c.beginPath();c.moveTo(ox+dx,oy);c.lineTo(ox+dx,oy+dy);c.lineTo(ox,oy+dy);c.stroke();c.restore();}
  function drawMatrixFactory(c,w,h,v,t){const beltY=h*.68;c.fillStyle='#07111f';c.fillRect(w*.12,beltY,w*.76,h*.14);for(let x=w*.14;x<w*.86;x+=42){c.strokeStyle='rgba(32,229,255,.3)';c.strokeRect(x,beltY+10,31,h*.14-20)}const pulse=(Math.sin(t/320)+1)/2;c.fillStyle=`rgba(32,229,255,${.15+pulse*.2})`;c.fillRect(w*.31,h*.18,w*.38,h*.37);c.strokeStyle='#20e5ff';c.lineWidth=2;c.strokeRect(w*.31,h*.18,w*.38,h*.37);const title=v.kind==='matrixMultiply'?'ENSAMBLADOR FILA–COLUMNA':v.kind==='transpose'?'TRANSPOSITOR':'CONSOLIDADOR MATRICIAL';c.fillStyle='#bfefff';c.font='bold 18px Segoe UI';c.textAlign='center';c.fillText(title,w*.5,h*.23);if(v.A)drawMatrix(c,v.A,w*.4,h*.37,38,'#25a1ff');if(v.B)drawMatrix(c,v.B,w*.6,h*.37,38,'#64ec83');if(v.k!==undefined){c.fillStyle='#ffd250';c.font='bold 26px Segoe UI';c.fillText(`${v.k} ×`,w*.29,h*.39)}if(v.C){c.fillStyle='#ffd250';c.font='bold 24px Segoe UI';c.fillText('→',w*.5,h*.56);drawMatrix(c,v.C,w*.5,h*.64,32,'#ffd250')}drawRobotArm(c,w*.17,h*.45,1,t);drawRobotArm(c,w*.83,h*.45,-1,t);}
  function drawMatrix(c,m,cx,cy,cell,color){if(!m)return;const rows=m.length,cols=m[0].length,W=cols*cell,H=rows*cell;c.save();c.strokeStyle=color;c.fillStyle='#e9fbff';c.shadowColor=color;c.shadowBlur=10;c.lineWidth=2;c.beginPath();c.moveTo(cx-W/2-8,cy-H/2);c.lineTo(cx-W/2-8,cy+H/2);c.moveTo(cx+W/2+8,cy-H/2);c.lineTo(cx+W/2+8,cy+H/2);c.stroke();c.shadowBlur=0;c.font=`${Math.max(13,cell*.48)}px Cambria Math,serif`;c.textAlign='center';c.textBaseline='middle';for(let i=0;i<rows;i++)for(let j=0;j<cols;j++)c.fillText(m[i][j],cx-W/2+cell*(j+.5),cy-H/2+cell*(i+.5));c.restore();}
  function drawRobotArm(c,x,y,dir,t){c.save();c.strokeStyle='#7f9db8';c.lineWidth=16;c.lineCap='round';c.beginPath();c.moveTo(x,y+120);c.lineTo(x+dir*25,y+55);c.lineTo(x+dir*(55+Math.sin(t/500)*12),y);c.stroke();c.fillStyle='#20e5ff';for(const p of [[x,y+120],[x+dir*25,y+55],[x+dir*(55+Math.sin(t/500)*12),y]]){c.beginPath();c.arc(p[0],p[1],9,0,Math.PI*2);c.fill()}c.restore();}
  function drawReactor(c,w,h,v,t){const cx=w*.5,cy=h*.48,p=(Math.sin(t/300)+1)/2;c.save();const rg=c.createRadialGradient(cx,cy,10,cx,cy,h*.28);rg.addColorStop(0,`rgba(32,229,255,${.5+p*.25})`);rg.addColorStop(.4,'rgba(37,133,255,.16)');rg.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=rg;c.beginPath();c.arc(cx,cy,h*.3,0,Math.PI*2);c.fill();c.strokeStyle='#20e5ff';c.lineWidth=3;for(let i=0;i<4;i++){c.beginPath();c.ellipse(cx,cy,h*(.09+i*.045),h*(.04+i*.018),t/1200+i*.5,0,Math.PI*2);c.stroke()}c.strokeRect(cx-h*.1,cy-h*.25,h*.2,h*.5);c.restore();if(v.kind==='systemLines'){drawLineGraphPanel(c,w*.1,h*.18,w*.32,h*.5,v.lines);}else if(v.kind==='augmented'){drawMatrix(c,v.A,w*.3,h*.42,42,'#25a1ff');drawMatrix(c,v.b.map(x=>[x]),w*.72,h*.42,42,'#64ec83');}else if(v.A){drawMatrix(c,v.A,w*.28,h*.42,43,'#25a1ff');c.fillStyle='#dff8ff';c.font='bold 24px Segoe UI';c.textAlign='center';c.fillText(`det(A) = ${v.det??'?'}`,w*.74,h*.42);}if(v.kind==='rowSwap'){drawMatrix(c,v.A,w*.25,h*.37,40,'#25a1ff');c.fillText('⇄',w*.5,h*.38);drawMatrix(c,v.B,w*.75,h*.37,40,'#ffd250');}}
  function drawLineGraphPanel(c,x,y,W,H,lines){c.save();c.fillStyle='rgba(2,13,29,.65)';c.fillRect(x,y,W,H);c.strokeStyle='rgba(32,229,255,.45)';c.strokeRect(x,y,W,H);const ox=x+W/2,oy=y+H/2,s=Math.min(W,H)/8;c.strokeStyle='rgba(125,190,255,.25)';for(let i=-4;i<=4;i++){c.beginPath();c.moveTo(ox+i*s,y);c.lineTo(ox+i*s,y+H);c.moveTo(x,oy+i*s);c.lineTo(x+W,oy+i*s);c.stroke()}c.strokeStyle='#fff';c.beginPath();c.moveTo(x,oy);c.lineTo(x+W,oy);c.moveTo(ox,y);c.lineTo(ox,y+H);c.stroke();['#25a1ff','#64ec83'].forEach((col,i)=>{const L=lines[i];c.strokeStyle=col;c.lineWidth=3;c.beginPath();const x1=-4,x2=4,y1=L.m*x1+L.b,y2=L.m*x2+L.b;c.moveTo(ox+x1*s,oy-y1*s);c.lineTo(ox+x2*s,oy-y2*s);c.stroke()});c.restore();}
  function drawGaussRoom(c,w,h,v,t){c.fillStyle='rgba(2,11,25,.74)';c.fillRect(w*.14,h*.18,w*.72,h*.52);c.strokeStyle='#20e5ff';c.lineWidth=2;c.strokeRect(w*.14,h*.18,w*.72,h*.52);c.fillStyle='#bdefff';c.textAlign='center';c.font='bold 18px Segoe UI';c.fillText('MATRIZ AUMENTADA · PROTOCOLO GAUSS–JORDAN',w*.5,h*.23);if(v.matrix)drawAugMatrix(c,v.matrix,w*.38,h*.43,44,'#25a1ff');if(v.next){c.fillStyle='#ffd250';c.font='bold 30px Segoe UI';c.fillText('→',w*.58,h*.44);drawAugMatrix(c,v.next,w*.72,h*.43,40,v.error?'#ff4f72':'#64ec83')}c.fillStyle=v.error?'#ff4f72':'#ffd250';c.font='bold 20px Segoe UI';c.fillText(v.op||'',w*.5,h*.64);if(v.target){const pulse=10+Math.sin(t/180)*4;c.strokeStyle='#ff4f72';c.lineWidth=3;c.beginPath();c.arc(w*.38+(v.target[1]-1)*44,h*.43+(v.target[0]-.5)*44,pulse,0,Math.PI*2);c.stroke();}}
  function drawAugMatrix(c,m,cx,cy,cell,color){if(!m)return;const coeff=m[0].length-1,rows=m.length,W=m[0].length*cell,H=rows*cell;c.save();c.strokeStyle=color;c.fillStyle='#e9fbff';c.lineWidth=2;c.shadowColor=color;c.shadowBlur=9;c.beginPath();c.moveTo(cx-W/2-8,cy-H/2);c.lineTo(cx-W/2-8,cy+H/2);c.moveTo(cx+W/2+8,cy-H/2);c.lineTo(cx+W/2+8,cy+H/2);c.moveTo(cx-W/2+coeff*cell,cy-H/2);c.lineTo(cx-W/2+coeff*cell,cy+H/2);c.stroke();c.shadowBlur=0;c.font=`${cell*.5}px Cambria Math,serif`;c.textAlign='center';c.textBaseline='middle';for(let i=0;i<rows;i++)for(let j=0;j<m[i].length;j++)c.fillText(m[i][j],cx-W/2+cell*(j+.5),cy-H/2+cell*(i+.5));c.restore();}
  function updateShipPhysics(w,h,dt,damping){state.drone.x+=state.drone.vx*dt;state.drone.y+=state.drone.vy*dt;state.drone.vx*=Math.pow(damping,dt*8);state.drone.vy*=Math.pow(damping,dt*8);state.drone.x=Math.max(-w*.38,Math.min(w*.38,state.drone.x));state.drone.y=Math.max(-h*.17,Math.min(h*.14,state.drone.y));state.drone.tilt+=(Math.max(-.42,Math.min(.42,state.drone.vx/220))-state.drone.tilt)*Math.min(1,dt*8);}
  function drawFlightScene(c,w,h,q,t,dt,paused){
    const f=state.flight||{start:t,duration:1,progress:0,target:getMissionTarget(q),departure:false};if(!paused){f.progress=Math.max(0,Math.min(1,(t-f.start)/f.duration));state.flight=f;els.flightFill.style.width=`${Math.round(f.progress*100)}%`;if(f.departure)els.flightTarget.textContent=`SALTO ${Math.round(f.progress*100)}% · calculando nueva baliza`;else els.flightTarget.textContent=`${f.target.detail} · DISTANCIA ${Math.max(0,Math.round((1-f.progress)*980))} m`;}
    const p=f.progress||0;const colors=['#20e5ff','#38a7ff','#5af0c0','#d46cff'];const accent=colors[q.sector-1];
    const bg=c.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#010611');bg.addColorStop(.55,'#061c36');bg.addColorStop(1,'#01040b');c.fillStyle=bg;c.fillRect(0,0,w,h);
    drawWarpStars(c,w,h,t,p,f.departure,accent);drawFlightTunnel(c,w,h,t,p,accent);drawRouteGates(c,w,h,t,p,f.target,accent,f.departure);
    updateShipPhysics(w,h,dt,.52);const cruise=f.departure?1+p*.4:.92+p*.18;const shipY=h*(f.departure?.72:.79)-p*h*(f.departure?.12:.045)+state.drone.y;drawShip(c,w/2+state.drone.x,shipY,t,state.drone.tilt,cruise);
    if(!paused&&state.phase==='flight'&&p>=1)completeArrival();if(!paused&&state.phase==='departure'&&p>=1)completeDeparture();
  }
  function drawWarpStars(c,w,h,t,p,departure,accent){const speed=departure?2.2+p*3:1.1+p*1.8;for(let i=0;i<115;i++){const seed=(i*73)%997;const phase=((t*.00011*speed)+(seed/997))%1;const depth=phase;const x=w/2+(((seed*37)%1000)/1000-.5)*w*(.18+depth*1.2);const y=h*.26+depth*h*.82;const len=2+depth*22*speed;c.strokeStyle=i%7===0?accent:`rgba(176,224,255,${.12+depth*.55})`;c.lineWidth=.6+depth*1.4;c.beginPath();c.moveTo(x,y-len);c.lineTo(x,y);c.stroke();}}
  function drawFlightTunnel(c,w,h,t,p,accent){const vx=w/2,vy=h*.23;c.save();for(let i=0;i<9;i++){const z=((i/9+t*.00018*(1.4+p))%1);const W=w*(.09+z*.92),H=h*(.055+z*.68);c.strokeStyle=`rgba(32,229,255,${.07+z*.28})`;c.lineWidth=1+z*1.6;c.beginPath();c.rect(vx-W/2,vy-H*.32,W,H);c.stroke()}c.strokeStyle='rgba(32,229,255,.18)';for(let i=-5;i<=5;i++){c.beginPath();c.moveTo(vx+i*18,vy);c.lineTo(vx+i*w*.12,h);c.stroke()}c.restore();}
  function drawRouteGates(c,w,h,t,p,target,accent,departure){const cx=w*.5-target.x*w*.012,cy=h*(.24+p*.04);for(let i=0;i<3;i++){const local=Math.max(0,Math.min(1,p*1.25-i*.18));const r=(28+i*23)+local*(55+i*20);c.save();c.translate(cx+(i-1)*target.x*5,cy+i*h*.075);c.rotate(t*.00018*(i%2?1:-1));c.strokeStyle=i===0?accent:`rgba(124,201,255,${.28+i*.12})`;c.lineWidth=2.2;c.shadowColor=accent;c.shadowBlur=10;c.beginPath();for(let k=0;k<6;k++){const a=-Math.PI/2+k*Math.PI/3;const x=Math.cos(a)*r,y=Math.sin(a)*r*.55;k?c.lineTo(x,y):c.moveTo(x,y)}c.closePath();c.stroke();c.restore()}if(!departure){c.save();c.textAlign='center';c.fillStyle='#e9fbff';c.font=`bold ${Math.max(13,Math.min(20,w/60))}px Segoe UI`;c.fillText(target.code,cx,cy+5);c.fillStyle=accent;c.font='12px Segoe UI';c.fillText('BALIZA DE PRUEBA',cx,cy+24);c.restore();}}
  function drawShip(c,x,y,t,tilt=0,scale=1){c.save();c.translate(x,y+Math.sin(t/180)*2.5);c.rotate(tilt);c.scale(scale,scale);const flame=24+Math.sin(t/52)*8;c.shadowColor='#20e5ff';c.shadowBlur=20;c.fillStyle='rgba(32,229,255,.25)';c.beginPath();c.moveTo(-12,28);c.lineTo(0,28+flame);c.lineTo(12,28);c.closePath();c.fill();c.fillStyle='#f3fbff';c.beginPath();c.moveTo(0,-46);c.lineTo(24,-4);c.lineTo(58,18);c.lineTo(20,15);c.lineTo(12,32);c.lineTo(-12,32);c.lineTo(-20,15);c.lineTo(-58,18);c.lineTo(-24,-4);c.closePath();c.fill();c.fillStyle='#6d8aa3';c.beginPath();c.moveTo(-58,18);c.lineTo(-17,4);c.lineTo(-20,24);c.closePath();c.moveTo(58,18);c.lineTo(17,4);c.lineTo(20,24);c.closePath();c.fill();const cg=c.createLinearGradient(0,-36,0,9);cg.addColorStop(0,'#d9fbff');cg.addColorStop(.4,'#24bfff');cg.addColorStop(1,'#03213c');c.fillStyle=cg;c.beginPath();c.ellipse(0,-12,12,22,0,0,Math.PI*2);c.fill();c.strokeStyle='#20e5ff';c.lineWidth=2;c.beginPath();c.moveTo(-31,11);c.lineTo(-10,16);c.moveTo(31,11);c.lineTo(10,16);c.stroke();for(const xx of [-24,0,24]){c.fillStyle='#061222';c.beginPath();c.arc(xx,27,7,0,Math.PI*2);c.fill();c.fillStyle='#20e5ff';c.beginPath();c.arc(xx,29,3.8+Math.sin(t/50+xx)*.8,0,Math.PI*2);c.fill()}c.restore();}
  function drawPauseVeil(c,w,h){c.fillStyle='rgba(0,3,10,.78)';c.fillRect(0,0,w,h);c.fillStyle='#e9fbff';c.textAlign='center';c.font=`bold ${Math.max(18,Math.min(34,w/28))}px Segoe UI`;c.fillText('MISIÓN EN PAUSA',w/2,h*.48);c.fillStyle='#93c9e8';c.font='15px Segoe UI';c.fillText('Vuelve a pantalla completa para reanudar el vuelo.',w/2,h*.54);}
  function drawParticles(c,w,h,dt){state.particles=state.particles.filter(p=>p.life>0);state.particles.forEach(p=>{p.x+=p.vx;p.y+=p.vy;p.life-=dt*.75;c.fillStyle=p.kind==='good'?`rgba(80,240,138,${p.life})`:`rgba(255,79,114,${p.life})`;c.fillRect(p.x*w,p.y*h,4,4)});}
  function drawMini(q,t){if(!q)return;const {w,h}=prep(els.mini,mctx);mctx.clearRect(0,0,w,h);mctx.fillStyle='#010916';mctx.fillRect(0,0,w,h);const v=q.visual;if(v.kind==='vectors'||v.kind==='projection'){const ox=w*.42,oy=h*.68,s=Math.min(w/10,h/6);drawMiniAxes(mctx,ox,oy,s,w,h);if(v.u)drawArrow(mctx,ox,oy,v.u[0]*s,-v.u[1]*s,'#2585ff','u');if(v.v&&v.v.some(n=>n))drawArrow(mctx,ox,oy,v.v[0]*s,-v.v[1]*s,'#64ec83','v');if(v.a)drawArrow(mctx,ox,oy,v.a[0]*s,-v.a[1]*s,'#2585ff','a');if(v.proj)drawArrow(mctx,ox,oy,v.proj[0]*s,-v.proj[1]*s,'#ffd250','proj');}
    else if(v.kind==='systemLines')drawLineGraphPanel(mctx,8,8,w-16,h-16,v.lines);
    else if(v.kind==='gauss')drawAugMatrix(mctx,v.matrix,w*.42,h*.52,Math.min(32,w/(v.matrix[0].length+2)),'#25a1ff');
    else if(v.A){drawMatrix(mctx,v.A,w*.33,h*.52,Math.min(30,w/8),'#25a1ff');if(v.B)drawMatrix(mctx,v.B,w*.7,h*.52,Math.min(30,w/8),'#64ec83');if(v.det!==undefined){mctx.fillStyle='#ffd250';mctx.font='bold 24px Segoe UI';mctx.fillText(`det = ${v.det}`,w*.7,h*.52)}}
  }
  function drawMiniAxes(c,ox,oy,s,w,h){c.strokeStyle='rgba(120,190,255,.3)';c.lineWidth=1;for(let i=-4;i<=4;i++){c.beginPath();c.moveTo(ox+i*s,8);c.lineTo(ox+i*s,h-8);c.moveTo(8,oy+i*s);c.lineTo(w-8,oy+i*s);c.stroke()}c.strokeStyle='#fff';c.lineWidth=1.5;c.beginPath();c.moveTo(8,oy);c.lineTo(w-8,oy);c.moveTo(ox,8);c.lineTo(ox,h-8);c.stroke();}
  function stripHtml(s){const d=document.createElement('div');d.innerHTML=s;return d.textContent||'';}
  function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));}
  function safeName(s){return String(s||'estudiante').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'_').slice(0,40);}
  function formatTime(sec){const m=Math.floor(sec/60),s=sec%60;return `${m} min ${s} s`;}

  /* ===== v1.2 · Vuelo jugable, asteroides y agujeros negros ===== */
  function bind(){
    els.launch.addEventListener('click',launchGame); els.how.addEventListener('click',showHow);
    els.hint.addEventListener('click',showHint); els.submit.addEventListener('click',submitAnswer); els.continue?.addEventListener('click',continueAfterFeedback); els.report.addEventListener('click',()=>downloadReport(false));
    els.finish.addEventListener('click',confirmFinish); els.modalClose.addEventListener('click',closeModal); els.sound.addEventListener('click',toggleSound);
    $$('.side-rail button').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
    $$('[data-move]').forEach(b=>{
      const d=b.dataset.move;
      b.addEventListener('pointerdown',e=>{e.preventDefault();held[d]=true;moveDrone(d);b.setPointerCapture?.(e.pointerId);});
      ['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>{held[d]=false;}));
    });
    window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);
    document.addEventListener('contextmenu',e=>{if(state.mode==='exam'&&!state.completed){e.preventDefault();integrityStrike('Intento de menú contextual');}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='exam'&&!state.completed) integrityStrike('Cambio de pestaña o ventana');});
    window.addEventListener('blur',()=>{Object.keys(held).forEach(k=>held[k]=false);if(state.mode==='exam'&&!state.completed&&document.visibilityState==='visible') integrityStrike('Pérdida de foco de la evaluación');});
    document.addEventListener('fullscreenchange',handleFullscreenChange);document.addEventListener('webkitfullscreenchange',handleFullscreenChange);
    els.reenterFullscreen.addEventListener('click',reenterFullscreen);
    window.addEventListener('orientationchange',()=>setTimeout(resizeAll,250));window.visualViewport?.addEventListener('resize',()=>setTimeout(resizeAll,80));
    window.addEventListener('beforeunload',()=>saveProgress());
  }
  function onKey(e){
    if(state.mode==='exam'&&!state.completed){
      const k=e.key.toLowerCase();
      if(((e.ctrlKey||e.metaKey)&&['p','s','u','c'].includes(k)) || e.key==='F12' || (e.ctrlKey&&e.shiftKey&&['i','j','c'].includes(k))){e.preventDefault();integrityStrike(`Atajo bloqueado: ${e.key}`);return;}
    }
    const k=e.key.toLowerCase(),map={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'up',w:'up',arrowdown:'down',s:'down'};
    if(map[k]&&!els.game.hidden){e.preventDefault();held[map[k]]=true;if(!e.repeat)moveDrone(map[k]);}
    if(e.key==='Enter' && document.activeElement?.id==='numericAnswer') submitAnswer();
  }
  function onKeyUp(e){const map={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'up',w:'up',arrowdown:'down',s:'down'};const d=map[e.key.toLowerCase()];if(d)held[d]=false;}

  async function launchGame(){
    state.student=els.name.value.trim()||NVScorm.get('cmi.core.student_name')||'Estudiante Vectorial';
    state.mode=document.querySelector('input[name="mode"]:checked').value;
    const allowed=await requestGameFullscreen();
    if(!allowed){showModal('Pantalla completa requerida','<p>La navegación espacial necesita toda la pantalla. Autoriza el permiso del navegador y vuelve a iniciar.</p><p>En Brightspace, abre el recurso en una ventana o marco con permiso de pantalla completa.</p>',[{label:'REINTENTAR',action:()=>{closeModal();launchGame();},primary:true}]);return;}
    state.seed=(Date.now()^Math.floor(Math.random()*1e9))>>>0;
    questions=NVQuestions.build(state.seed);blackHoleQuestions=NVQuestions.buildBlackHole(state.seed);
    state.startedAt=new Date();state.phase='flight';state.currentChallenge=null;state.blackHoleIndex=0;
    state.stats={asteroidHits:0,asteroidsAvoided:0,blackHolesEntered:0,blackHoleSuccess:0,blackHoleFails:0,asteroidPenalty:0,blackHolePenalty:0,maxAsteroids:0,distance:0};
    document.body.classList.add('playing');els.boot.hidden=true;els.game.hidden=false;buildSectorDots();resizeAll();renderQuestion();animate(performance.now());saveProgress();
  }
  function showHow(){
    showModal('Cómo jugar',`<ol><li><b>La nave vuela continuamente.</b> Muévela con flechas, WASD o los controles táctiles para esquivar un campo abundante de asteroides.</li><li>Cuando chocas con un asteroide, el vuelo se congela exactamente en el punto del impacto y aparece una pregunta del primer corte. Un error resta <b>0.10</b> y la nave reanuda desde ese mismo punto.</li><li>Los <b>agujeros negros</b> son rutas opcionales. Al entrar aparece un reto más complejo. Si aciertas, saltas a un corredor con menos asteroides durante 14 segundos; si fallas, pierdes <b>0.20</b> y vuelves a un campo denso.</li><li>Cada respuesta estándar correcta destruye el asteroide, suma hasta <b>0.25</b> y acerca a la recuperación del sector. Hay seis núcleos matemáticos por sector.</li><li>El juego permanece siempre en pantalla completa. En evaluación, la quinta infracción de integridad anula el intento y fija la nota en 0.00.</li></ol><p><b>Temas:</b> vectores, matrices, determinantes, sistemas lineales y Gauss–Jordan, exclusivamente del corte 1.</p>`);
  }

  function renderQuestion(){
    if(state.questionIndex>=questions.length){finishMission(false);return;}
    const q=questions[state.questionIndex],sec=q.sector;
    selected=null;answerLocked=true;q._hintUsed=false;q._attempts=0;
    els.sectorNumber.textContent=`SECTOR ${sec}`;els.sectorName.textContent=sectorNames[sec-1];
    els.qCount.textContent=`PREGUNTA ${state.questionIndex+1} / ${questions.length}`;els.qBadge.textContent=q.badge;renderProgress();updateHUD();
    if(!state.space||state.space.sector!==sec)initSpace(sec,true);
    activateFlight('CAMPO DE ASTEROIDES ACTIVADO');
  }
  function initSpace(sector,resetShip){
    const now=performance.now();
    state.space={sector,route:0,zone:'dense',safeUntil:0,asteroids:[],blackHoles:[],spawnAccumulator:0,blackHoleAt:now+6500+Math.random()*3500,invulnerableUntil:now+3200,flashUntil:0,transitionStart:0,lastW:1,lastH:1};
    if(resetShip){state.drone.x=0;state.drone.y=0;state.drone.vx=0;state.drone.vy=0;state.drone.tilt=0;}
    seedAsteroids(20+sector*3);
  }
  function seedAsteroids(count){
    if(!state.space)return;
    for(let i=0;i<count;i++)spawnAsteroid(-.65+Math.random()*1.45,true);
  }
  function spawnAsteroid(y=-.12,initial=false){
    const s=state.space;if(!s)return;
    let x=.06+Math.random()*.88;
    if(initial&&y>.55&&Math.abs(x-.5)<.18)x=x<.5?.2:.8;
    const r=.018+Math.random()*.035;
    s.asteroids.push({id:`a${Date.now()}_${Math.random()}`,x,y,r,speed:.17+Math.random()*.18+s.sector*.018,rot:Math.random()*Math.PI*2,spin:(Math.random()-.5)*1.9,seed:Math.random()*999,passed:false});
  }
  function spawnBlackHole(){
    const s=state.space;if(!s||s.blackHoles.length||performance.now()<s.safeUntil)return;
    s.blackHoles.push({id:`b${Date.now()}`,x:.18+Math.random()*.64,y:-.18,r:.062,speed:.095+Math.random()*.035,rot:Math.random()*Math.PI*2});
    s.blackHoleAt=performance.now()+13500+Math.random()*6000;
  }
  function activateFlight(message){
    const q=questions[state.questionIndex];if(!q||state.completed)return;
    state.phase='flight';state.currentChallenge=null;answerLocked=true;selected=null;
    els.gameLayout.classList.add('flight-mode');els.flightHud.hidden=false;els.arrivalChip.hidden=true;els.challengeRibbon.hidden=true;
    els.hint.disabled=true;els.submit.disabled=true;els.qBody.innerHTML='';els.answers.innerHTML='';mctx.clearRect(0,0,els.mini.width,els.mini.height);
    els.flightTitle.textContent=message||'CAMPO DE ASTEROIDES';
    els.instruction.textContent='Pilota la nave, esquiva asteroides y decide si entrar a los agujeros negros. Cada impacto activa una prueba.';
    requestAnimationFrame(()=>{resizeAll();setTimeout(resizeAll,280);});saveProgress();
  }
  function triggerCollision(kind,obj){
    if(state.phase!=='flight'||state.completed||performance.now()<(state.space?.invulnerableUntil||0))return;
    const s=state.space;s.flashUntil=performance.now()+520;
    const portalPool=blackHoleQuestions.filter(x=>x.sector===s.sector);const challengeQ=kind==='asteroid'?questions[state.questionIndex]:portalPool[state.blackHoleIndex%portalPool.length];
    state.currentChallenge={kind,objectId:obj.id,q:challengeQ,snapshot:{route:s.route,drone:{...state.drone},sector:s.sector}};
    if(kind==='asteroid'){state.stats.asteroidHits++;els.arrivalChip.textContent='IMPACTO CON ASTEROIDE';beep(150,.22);}
    else{state.stats.blackHolesEntered++;els.arrivalChip.textContent='HORIZONTE DE EVENTOS';beep(90,.38);}
    state.phase='impact';els.arrivalChip.hidden=false;spawnBurst('bad');
    setTimeout(()=>{els.arrivalChip.hidden=true;revealChallenge();},520);
  }
  async function revealChallenge(){
    const ch=state.currentChallenge,q=ch?.q;if(!q||state.completed)return;
    selected=null;answerLocked=true;q._hintUsed=false;q._attempts=0;
    els.sectorNumber.textContent=`SECTOR ${questions[state.questionIndex]?.sector||q.sector}`;els.sectorName.textContent=sectorNames[(questions[state.questionIndex]?.sector||q.sector)-1];
    els.qCount.textContent=ch.kind==='blackhole'?'PORTAL OPCIONAL · RETO AVANZADO':`PREGUNTA ${state.questionIndex+1} / ${questions.length}`;
    els.qBadge.textContent=ch.kind==='blackhole'?'AGUJERO NEGRO · PENALIZACIÓN AL FALLAR':`IMPACTO ASTEROIDE · ${q.badge}`;
    els.challengeRibbon.hidden=false;els.challengeRibbon.className=`challenge-ribbon ${ch.kind}`;
    els.challengeRibbon.textContent=ch.kind==='blackhole'?'ENTRADA AL AGUJERO NEGRO · ACIERTA PARA SALTAR AL CORREDOR SEGURO':'COLISIÓN CON ASTEROIDE · ACIERTA PARA DESTRUIRLO';
    els.instruction.textContent=ch.kind==='blackhole'?'Reto avanzado: un error devuelve la nave al campo denso y descuenta 0.20.':'El vuelo está congelado en el punto exacto del impacto. Un error descuenta 0.10.';
    els.qBody.innerHTML=q.prompt;renderOptions(q);setFeedback(ch.kind==='blackhole'?'Resuelve el reto avanzado para controlar el salto gravitacional.':'Resuelve la prueba para destruir el asteroide y continuar.','neutral');
    await typeset();if(state.completed)return;
    state.phase='question';questionStart=Date.now();els.gameLayout.classList.remove('flight-mode');els.flightHud.hidden=true;answerLocked=false;
    els.submit.disabled=false;els.hint.disabled=false;requestAnimationFrame(()=>{resizeAll();drawMini(q,performance.now());setTimeout(resizeAll,300);});saveProgress();
  }
  function submitAnswer(){
    if(answerLocked)return;const ch=state.currentChallenge,q=ch?.q;if(!q)return;let value=selected;
    if(q.type==='numeric'){const inp=$('#numericAnswer');if(!inp||inp.value===''){toast('Escribe una respuesta numérica.');return;}value=Number(inp.value);}
    if(value===null){toast('Selecciona una respuesta.');return;}
    q._attempts++;let correct=false;
    if(q.type==='numeric')correct=Math.abs(value-q.answerValue)<1e-9;else if(q.type==='tf')correct=value===q.answer;else correct=Number(value)===q.answer;
    answerLocked=true;els.submit.disabled=true;els.hint.disabled=true;
    if(ch.kind==='asteroid'){
      if(correct){
        const reward=q._hintUsed?.18:.25;state.score=clampScore(state.score+reward);state.xp+=q._hintUsed?80:100;state.energy=Math.min(5,state.energy+.1);state.sectorProgress[q.sector-1]++;
        state.answers.push(recordAnswer(q,true,value,reward,'Asteroide'));setFeedback(`Asteroide destruido. ${q.explanation}`,'good');markOptions(q,true,value);beep(760,.14);spawnBurst('good');updateHUD();saveProgress();
        setTimeout(()=>resolveAsteroid(true),1350);
      }else{
        const penalty=.10;state.score=Math.max(0,state.score-penalty);state.energy=Math.max(0,state.energy-1);state.stats.asteroidPenalty+=penalty;
        state.answers.push(recordAnswer(q,false,value,-penalty,'Asteroide'));setFeedback(`Respuesta incorrecta: pierdes 0.10. La nave reanudará desde el punto del choque y esta prueba seguirá pendiente.`,'bad');markOptions(q,false,value);beep(165,.22);spawnBurst('bad');updateHUD();saveProgress();
        setTimeout(()=>resolveAsteroid(false),1500);
      }
    }else{
      if(correct){
        const reward=q._hintUsed?.06:.10;state.score=clampScore(state.score+reward);state.xp+=120;state.stats.blackHoleSuccess++;
        state.answers.push(recordAnswer(q,true,value,reward,'Agujero negro'));setFeedback(`Salto gravitacional estabilizado. ${q.explanation}`,'good');markOptions(q,true,value);beep(980,.24);spawnBurst('good');updateHUD();saveProgress();
        setTimeout(()=>resolveBlackHole(true),1450);
      }else{
        const penalty=.20;state.score=Math.max(0,state.score-penalty);state.energy=Math.max(0,state.energy-2);state.stats.blackHolePenalty+=penalty;state.stats.blackHoleFails++;
        state.answers.push(recordAnswer(q,false,value,-penalty,'Agujero negro'));setFeedback('El portal colapsó: pierdes 0.20 y serás devuelto a una zona de asteroides de alta densidad.','bad');markOptions(q,false,value);beep(95,.36);spawnBurst('bad');updateHUD();saveProgress();
        setTimeout(()=>resolveBlackHole(false),1650);
      }
    }
    if(state.energy<=0){state.energy=2;updateHUD();showModal('Recarga de emergencia','<p>La energía llegó a cero. El sistema recuperó 2 unidades para que la misión continúe. Las penalizaciones de nota permanecen registradas.</p>');}
  }
  function resolveAsteroid(correct){
    const ch=state.currentChallenge,s=state.space;if(!ch||!s)return;
    s.asteroids=s.asteroids.filter(a=>a.id!==ch.objectId);restoreCollisionPoint(ch.snapshot);
    s.invulnerableUntil=performance.now()+2100;
    if(correct){
      const previousSector=questions[state.questionIndex]?.sector;state.questionIndex++;
      if(state.questionIndex>=questions.length){finishMission(false);return;}
      const nextSector=questions[state.questionIndex].sector;
      if(nextSector!==previousSector){beginSectorTransition(nextSector);return;}
      activateFlight('ASTEROIDE DESTRUIDO · RUTA RESTABLECIDA');
    }else{
      spawnAsteroid(-.16,false);activateFlight('REINICIO EN EL PUNTO DEL IMPACTO');
    }
  }
  function resolveBlackHole(correct){
    const ch=state.currentChallenge,s=state.space;if(!ch||!s)return;
    s.blackHoles=s.blackHoles.filter(b=>b.id!==ch.objectId);state.blackHoleIndex++;
    if(correct){
      restoreCollisionPoint(ch.snapshot);s.zone='safe';s.safeUntil=performance.now()+14000;s.invulnerableUntil=performance.now()+1800;s.route+=520;
      s.asteroids=s.asteroids.filter((_,i)=>i%4===0);while(s.asteroids.length<5)spawnAsteroid(-.4+Math.random()*.9,true);
      activateFlight('SALTO EXITOSO · CORREDOR DE BAJA DENSIDAD');
    }else{
      s.zone='dense';s.safeUntil=0;s.asteroids=[];s.blackHoles=[];restoreCollisionPoint(ch.snapshot);state.drone.x=0;state.drone.y=Math.min(0,state.drone.y);state.drone.vx=0;state.drone.vy=0;
      seedAsteroids(28+s.sector*3);s.invulnerableUntil=performance.now()+2300;s.blackHoleAt=performance.now()+11000;
      activateFlight('PORTAL FALLIDO · REGRESO AL CAMPO DENSO');
    }
  }
  function restoreCollisionPoint(snapshot){
    if(!snapshot)return;state.space.route=snapshot.route;state.drone={...state.drone,...snapshot.drone,vx:0,vy:0};
  }
  function beginSectorTransition(nextSector){
    state.phase='sector-transition';state.currentChallenge=null;answerLocked=true;els.gameLayout.classList.add('flight-mode');els.flightHud.hidden=false;els.challengeRibbon.hidden=true;
    initSpace(nextSector,true);state.space.transitionStart=performance.now();
    els.sectorNumber.textContent=`SECTOR ${nextSector}`;els.sectorName.textContent=sectorNames[nextSector-1];els.flightTitle.textContent='SECTOR RECUPERADO · SALTO INTERESTELAR';els.flightTarget.textContent=`Destino: ${sectorNames[nextSector-1]}`;els.instruction.textContent='La nave cruza una grieta espacial hacia el siguiente sector.';
    setTimeout(()=>{if(!state.completed&&state.phase==='sector-transition')activateFlight('NUEVO SECTOR · CAMPO DE ASTEROIDES');},2300);
  }
  function showHint(){const q=state.currentChallenge?.q||questions[state.questionIndex];if(!q||answerLocked)return;q._hintUsed=true;state.hints++;setFeedback(q.hint,'hinting');els.hint.disabled=true;typeset();}
  function recordAnswer(q,correct,value,delta,event='Prueba'){return {id:q.id,sector:q.sector,type:q.badge,event,correct,value:String(value),delta,timeSec:Math.round((Date.now()-questionStart)/1000),hint:!!q._hintUsed,prompt:stripHtml(q.prompt)};}

  function moveDrone(dir){
    if(state.phase==='paused'||state.completed)return;const n=state.phase==='flight'?145:38;
    if(dir==='left')state.drone.vx-=n;if(dir==='right')state.drone.vx+=n;if(dir==='up')state.drone.vy-=n*.72;if(dir==='down')state.drone.vy+=n*.72;beep(330,.025);
  }
  function updateShipPhysics(w,h,dt,damping){
    const flight=state.phase==='flight';if(flight){const a=350;if(held.left)state.drone.vx-=a*dt;if(held.right)state.drone.vx+=a*dt;if(held.up)state.drone.vy-=a*.72*dt;if(held.down)state.drone.vy+=a*.72*dt;}
    state.drone.x+=state.drone.vx*dt;state.drone.y+=state.drone.vy*dt;state.drone.vx*=Math.pow(damping,dt*7);state.drone.vy*=Math.pow(damping,dt*7);
    state.drone.x=Math.max(-w*.43,Math.min(w*.43,state.drone.x));state.drone.y=Math.max(-h*.30,Math.min(h*.10,state.drone.y));
    state.drone.tilt+=(Math.max(-.48,Math.min(.48,state.drone.vx/260))-state.drone.tilt)*Math.min(1,dt*9);
  }
  function drawScene(q,t,dt){
    if(!q)return;const {w,h}=prep(els.canvas,ctx);ctx.clearRect(0,0,w,h);if(state.space){state.space.lastW=w;state.space.lastH=h;}
    if(state.phase==='paused'){drawSpaceScene(ctx,w,h,t,0,true);drawPauseVeil(ctx,w,h);return;}
    if(['flight','impact','question','sector-transition'].includes(state.phase)){drawSpaceScene(ctx,w,h,t,dt,state.phase!=='flight');drawParticles(ctx,w,h,dt);return;}
    drawSpaceScene(ctx,w,h,t,dt,true);drawParticles(ctx,w,h,dt);
  }
  function drawSpaceScene(c,w,h,t,dt,paused){
    const s=state.space;if(!s)return;const safe=performance.now()<s.safeUntil;s.zone=safe?'safe':'dense';
    drawDeepSpace(c,w,h,t,s,safe);if(state.phase==='sector-transition'){drawSectorWarp(c,w,h,t,s);return;}
    if(!paused&&state.phase==='flight')updateSpaceObjects(w,h,dt,t,safe);
    drawSpaceLanes(c,w,h,t,safe);s.asteroids.forEach(a=>drawAsteroid(c,w,h,a,t));s.blackHoles.forEach(b=>drawBlackHole(c,w,h,b,t));
    updateShipPhysics(w,h,paused?0:dt,.58);const sx=w/2+state.drone.x,sy=h*.78+state.drone.y;drawShip(c,sx,sy,t,state.drone.tilt,.84);
    if(performance.now()<s.invulnerableUntil){c.strokeStyle=`rgba(80,240,210,${.35+.25*Math.sin(t/80)})`;c.lineWidth=3;c.beginPath();c.arc(sx,sy,54+Math.sin(t/100)*5,0,Math.PI*2);c.stroke();}
    if(s.flashUntil>performance.now()){const a=(s.flashUntil-performance.now())/520;c.fillStyle=`rgba(255,75,100,${a*.34})`;c.fillRect(0,0,w,h);}
    if(state.phase==='question'||state.phase==='impact')drawCollisionMarker(c,w,h,t);
    updateFlightHud(s,safe);
  }
  function updateSpaceObjects(w,h,dt,t,safe){
    const s=state.space,rate=safe?.72:Math.max(.13,.25-s.sector*.02),speedFactor=safe?.72:1+s.sector*.055;
    s.route+=dt*190*speedFactor;state.stats.distance+=dt*190*speedFactor;s.spawnAccumulator+=dt;
    while(s.spawnAccumulator>rate&&s.asteroids.length<48){s.spawnAccumulator-=rate;spawnAsteroid(-.12-Math.random()*.18,false);}
    if(t>s.blackHoleAt)spawnBlackHole();
    for(const a of s.asteroids){a.y+=a.speed*speedFactor*dt;a.rot+=a.spin*dt;if(a.y>1.18&&!a.passed){a.passed=true;state.stats.asteroidsAvoided++;}}
    s.asteroids=s.asteroids.filter(a=>a.y<1.25);for(const b of s.blackHoles){b.y+=b.speed*dt;b.rot+=dt*.45;}s.blackHoles=s.blackHoles.filter(b=>b.y<1.24);
    state.stats.maxAsteroids=Math.max(state.stats.maxAsteroids,s.asteroids.length);
    if(t<s.invulnerableUntil)return;
    const sx=w/2+state.drone.x,sy=h*.78+state.drone.y,shipR=Math.max(20,Math.min(w,h)*.034);
    for(const a of s.asteroids){const ax=a.x*w,ay=a.y*h,ar=a.r*Math.min(w,h);if(Math.hypot(ax-sx,ay-sy)<shipR+ar*.78){triggerCollision('asteroid',a);return;}}
    for(const b of s.blackHoles){const bx=b.x*w,by=b.y*h,br=b.r*Math.min(w,h);if(Math.hypot(bx-sx,by-sy)<shipR+br*.62){triggerCollision('blackhole',b);return;}}
  }
  function updateFlightHud(s,safe){
    const sectorAnswered=state.sectorProgress[s.sector-1]||0;els.flightFill.style.width=`${Math.min(100,sectorAnswered/6*100)}%`;
    els.flightTitle.textContent=safe?'CORREDOR WARP · BAJA DENSIDAD':`CAMPO DE ASTEROIDES · SECTOR ${s.sector}`;
    const left=Math.max(0,Math.ceil((s.safeUntil-performance.now())/1000));
    els.flightTarget.textContent=safe?`Ventana segura: ${left}s · continúa pilotando`:`Núcleos recuperados ${sectorAnswered}/6 · siguiente impacto activa la prueba pendiente`;
    els.densityText.textContent=safe?'DENSIDAD BAJA':'DENSIDAD ALTA';els.densityText.classList.toggle('safe',safe);
    els.asteroidText.textContent=`ASTEROIDES ${s.asteroids.length}`;els.warpText.textContent=safe?`SALTO ACTIVO ${left}s`:(s.blackHoles.length?'AGUJERO NEGRO DETECTADO':'PORTAL EN BÚSQUEDA');
  }
  function drawDeepSpace(c,w,h,t,s,safe){
    const g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,safe?'#031827':'#01040c');g.addColorStop(.55,safe?'#07334b':'#08142b');g.addColorStop(1,'#01030a');c.fillStyle=g;c.fillRect(0,0,w,h);
    const drift=(s.route*.006)%1;for(let i=0;i<150;i++){const seed=(i*71.37)%997,x=((seed*37)%997)/997*w,y=((seed*17)%997)/997*h;const yy=(y+(drift*h*(1+(i%5)*.12)))%h;const len=1+(i%7===0?10:3)*(safe?1.8:1);c.strokeStyle=i%11===0?(safe?'rgba(80,240,200,.72)':'rgba(100,165,255,.65)'):`rgba(205,235,255,${.12+(i%5)*.05})`;c.lineWidth=i%9===0?1.5:.7;c.beginPath();c.moveTo(x,yy-len);c.lineTo(x,yy+len);c.stroke();}
    const neb=c.createRadialGradient(w*.18,h*.28,10,w*.18,h*.28,w*.5);neb.addColorStop(0,safe?'rgba(40,210,190,.15)':'rgba(61,80,200,.16)');neb.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=neb;c.fillRect(0,0,w,h);
  }
  function drawSpaceLanes(c,w,h,t,safe){
    c.save();c.strokeStyle=safe?'rgba(80,240,190,.16)':'rgba(42,135,255,.11)';c.lineWidth=1;const vanX=w*.5,vanY=h*.12;for(let i=-6;i<=6;i++){c.beginPath();c.moveTo(vanX+i*10,vanY);c.lineTo(vanX+i*w*.11,h);c.stroke();}for(let i=0;i<8;i++){const z=((i/8+t*.00025)%1);const yy=vanY+z*z*(h-vanY),half=30+z*w*.55;c.beginPath();c.moveTo(vanX-half,yy);c.lineTo(vanX+half,yy);c.stroke();}c.restore();
  }
  function drawAsteroid(c,w,h,a,t){
    const x=a.x*w,y=a.y*h,r=a.r*Math.min(w,h);if(r<2)return;c.save();c.translate(x,y);c.rotate(a.rot);c.shadowColor='rgba(255,120,65,.35)';c.shadowBlur=10;const grad=c.createRadialGradient(-r*.3,-r*.35,r*.08,0,0,r);grad.addColorStop(0,'#d0b59a');grad.addColorStop(.32,'#806b60');grad.addColorStop(1,'#2e2730');c.fillStyle=grad;c.strokeStyle='rgba(255,190,135,.45)';c.lineWidth=Math.max(1,r*.045);c.beginPath();for(let i=0;i<12;i++){const ang=i*Math.PI*2/12,noise=.76+((Math.sin(a.seed+i*4.7)+1)*.12);const px=Math.cos(ang)*r*noise,py=Math.sin(ang)*r*noise;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();c.fill();c.stroke();c.shadowBlur=0;for(let i=0;i<4;i++){const ang=a.seed+i*1.73,cr=r*(.10+(i%2)*.045),cx=Math.cos(ang)*r*.42,cy=Math.sin(ang)*r*.35;c.fillStyle='rgba(25,20,26,.46)';c.beginPath();c.ellipse(cx,cy,cr,cr*.72,ang,0,Math.PI*2);c.fill();c.strokeStyle='rgba(220,190,160,.18)';c.stroke();}c.restore();
  }
  function drawBlackHole(c,w,h,b,t){
    const x=b.x*w,y=b.y*h,r=b.r*Math.min(w,h);c.save();c.translate(x,y);for(let i=0;i<7;i++){c.rotate((i%2?1:-1)*.22+t*.00005);c.strokeStyle=`rgba(${90+i*18},${80+i*12},255,${.16+i*.065})`;c.lineWidth=Math.max(1,7-i*.7);c.beginPath();c.ellipse(0,0,r*(1.18+i*.11),r*(.34+i*.035),i*.35,0,Math.PI*2);c.stroke();}const g=c.createRadialGradient(0,0,r*.03,0,0,r);g.addColorStop(0,'#000');g.addColorStop(.44,'#000');g.addColorStop(.62,'rgba(90,30,180,.82)');g.addColorStop(.8,'rgba(30,210,255,.38)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.beginPath();c.arc(0,0,r*1.55,0,Math.PI*2);c.fill();c.fillStyle='#d9f9ff';c.font=`bold ${Math.max(10,r*.23)}px Segoe UI`;c.textAlign='center';c.fillText('PORTAL',0,r*1.72);c.restore();
  }
  function drawCollisionMarker(c,w,h,t){
    const ch=state.currentChallenge,s=state.space;if(!ch||!s)return;let obj;if(ch.kind==='asteroid')obj=s.asteroids.find(a=>a.id===ch.objectId);else obj=s.blackHoles.find(b=>b.id===ch.objectId);if(!obj)return;const x=obj.x*w,y=obj.y*h,r=(obj.r||.04)*Math.min(w,h);c.save();c.strokeStyle=ch.kind==='blackhole'?'#d46cff':'#ff4f72';c.lineWidth=3;c.shadowColor=c.strokeStyle;c.shadowBlur=18;for(let i=0;i<3;i++){c.beginPath();c.arc(x,y,r+12+i*12+Math.sin(t/110+i)*5,0,Math.PI*2);c.stroke();}c.restore();
  }
  function drawSectorWarp(c,w,h,t,s){
    const p=Math.min(1,(t-s.transitionStart)/2200);const cx=w/2,cy=h*.47;for(let i=0;i<12;i++){const r=(1-p)*Math.max(w,h)*(.7-i*.045)+18;c.strokeStyle=`rgba(32,229,255,${.08+i*.045})`;c.lineWidth=2+i*.2;c.beginPath();c.ellipse(cx,cy,r,r*.35,t*.00025+i*.28,0,Math.PI*2);c.stroke();}drawShip(c,cx,h*.76-p*h*.24,t,state.drone.tilt,.85+p*.25);c.fillStyle='#effcff';c.textAlign='center';c.font=`bold ${Math.max(18,Math.min(34,w/30))}px Segoe UI`;c.fillText(`ENTRANDO A ${sectorNames[s.sector-1]}`,cx,h*.24);c.fillStyle='#20e5ff';c.font='14px Segoe UI';c.fillText(`${Math.round(p*100)}%`,cx,h*.29);
  }

  function handleFullscreenChange(){
    if(!state.startedAt||state.completed)return;
    if(!isFullscreen()){
      state.phaseBeforePause=state.phase==='paused'?state.phaseBeforePause:state.phase;state.phase='paused';state.pausedAt=performance.now();els.fullscreenGate.hidden=false;Object.keys(held).forEach(k=>held[k]=false);
      if(state.mode==='exam')integrityStrike('Salida de pantalla completa','Se abandonó el modo de pantalla completa mediante Escape o un control del navegador.');
    }else{
      els.fullscreenGate.hidden=true;if(state.phase==='paused'){const pause=performance.now()-state.pausedAt;if(state.space){if(state.space.safeUntil)state.space.safeUntil+=pause;if(state.space.blackHoleAt)state.space.blackHoleAt+=pause;if(state.space.invulnerableUntil)state.space.invulnerableUntil+=pause;}state.phase=state.phaseBeforePause||'flight';}
      requestAnimationFrame(()=>{resizeAll();setTimeout(resizeAll,300);});
    }
  }
  function saveProgress(){
    try{const slimSpace=state.space?{sector:state.space.sector,route:state.space.route,zone:state.space.zone,safeUntil:0}:null;localStorage.setItem('nexoVectorialState',JSON.stringify({...state,space:slimSpace,particles:[],drone:{x:state.drone.x,y:state.drone.y,tilt:state.drone.tilt},currentChallenge:null,flight:null}));}catch(_e){}NVScorm.saveProgress(state);
  }
  function confirmFinish(){showModal('Finalizar misión',`<p>Has recuperado ${state.answers.filter(a=>a.correct&&a.event==='Asteroide').length} núcleos estándar. Tu nota actual es <b>${state.score.toFixed(2)} / 5.00</b>.</p><p>Colisiones: <b>${state.stats.asteroidHits}</b> · saltos exitosos: <b>${state.stats.blackHoleSuccess}</b>.</p><p>Al finalizar se enviará la nota a Brightspace y se descargará el informe HTML.</p>`,[{label:'CANCELAR',action:closeModal},{label:'FINALIZAR',action:()=>finishMission(true),primary:true}]);}
  function downloadReport(auto){
    const end=state.endedAt||new Date(),duration=Math.max(0,Math.round((end-(state.startedAt||end))/1000));
    const rows=state.answers.map((a,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(a.event||'Prueba')}</td><td>${a.sector}</td><td>${escapeHtml(a.type)}</td><td>${a.correct?'Correcta':'Incorrecta'}</td><td>${a.delta>0?'+':''}${a.delta.toFixed(2)}</td><td>${a.hint?'Sí':'No'}</td><td>${a.timeSec}s</td></tr>`).join('');
    const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe Nexo Vectorial</title><style>body{font-family:Arial;margin:32px;color:#10233a}h1{color:#075985}.hero{background:#071b33;color:white;padding:24px;border-radius:14px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.m{border:1px solid #8bdcf4;padding:14px;border-radius:10px}.v{font-size:1.45rem;font-weight:bold;color:#075985}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ccdce7;text-align:left}th{background:#e9f8ff}.warn{background:#ffe3e9;border-left:5px solid #d61f4c;padding:12px}@media(max-width:760px){.metrics{grid-template-columns:1fr 1fr}}</style></head><body><div class="hero"><h1 style="color:white">Nexo Vectorial — Informe de vuelo</h1><p>Operación Matriz Cero · Asteroides y agujeros negros · Álgebra Lineal Corte 1</p></div>${state.disqualified?'<div class="warn"><b>Intento anulado por cinco infracciones de integridad. Nota definitiva: 0.00.</b></div>':''}<div class="metrics"><div class="m">Estudiante<div class="v">${escapeHtml(state.student)}</div></div><div class="m">Nota<div class="v">${state.score.toFixed(2)} / 5.00</div></div><div class="m">Asteroides evitados<div class="v">${state.stats.asteroidsAvoided}</div></div><div class="m">Duración<div class="v">${formatTime(duration)}</div></div><div class="m">Impactos<div class="v">${state.stats.asteroidHits}</div></div><div class="m">Portales intentados<div class="v">${state.stats.blackHolesEntered}</div></div><div class="m">Saltos exitosos<div class="v">${state.stats.blackHoleSuccess}</div></div><div class="m">Distancia<div class="v">${Math.round(state.stats.distance)} km</div></div></div><h2>Balance de penalizaciones</h2><p>Asteroides: <b>−${state.stats.asteroidPenalty.toFixed(2)}</b> · Agujeros negros: <b>−${state.stats.blackHolePenalty.toFixed(2)}</b>.</p><h2>Dominio por sector</h2><ol>${sectorNames.map((n,i)=>`<li><b>${n}</b>: ${state.sectorProgress[i]}/6 núcleos recuperados.</li>`).join('')}</ol><h2>Detalle de desafíos</h2><table><thead><tr><th>#</th><th>Evento</th><th>Sector</th><th>Tipo</th><th>Resultado</th><th>Cambio</th><th>Pista</th><th>Tiempo</th></tr></thead><tbody>${rows||'<tr><td colspan="8">Sin respuestas registradas.</td></tr>'}</tbody></table><h2>Integridad</h2><p>Eventos registrados: ${state.integrity}</p><ul>${state.integrityLog.map(x=>`<li>${new Date(x.time).toLocaleString('es-CO')}: ${escapeHtml(x.reason)}</li>`).join('')||'<li>Sin eventos.</li>'}</ul><h2>Recomendación</h2><p>${recommendation()}</p><p><small>Generado el ${end.toLocaleString('es-CO')}.</small></p></body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Informe_Nexo_Vectorial_${safeName(state.student)}_${new Date().toISOString().slice(0,10)}.html`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);if(!auto)toast('Informe HTML generado.');
  }
  function openPanel(panel){
    if(panel==='mission')return;
    if(panel==='log'){const recent=state.answers.slice(-10).reverse().map(a=>`<tr><td>${escapeHtml(a.event||'Prueba')}</td><td>${a.id}</td><td>${a.correct?'✓':'✗'}</td><td>${a.delta>0?'+':''}${a.delta.toFixed(2)}</td><td>${a.timeSec}s</td></tr>`).join('');showModal('Bitácora de vuelo',`<table class="progress-table"><thead><tr><th>Evento</th><th>Reto</th><th>Resultado</th><th>Puntaje</th><th>Tiempo</th></tr></thead><tbody>${recent||'<tr><td colspan="5">Aún no hay eventos.</td></tr>'}</tbody></table>`);}
    if(panel==='progress'){showModal('Progreso de la misión',`<table class="progress-table"><thead><tr><th>Sector</th><th>Núcleos</th><th>Estado</th></tr></thead><tbody>${sectorNames.map((n,i)=>`<tr><td>${n}</td><td>${state.sectorProgress[i]}/6</td><td>${state.sectorProgress[i]>=6?'Recuperado':'En proceso'}</td></tr>`).join('')}</tbody></table><p>Asteroides evitados: <b>${state.stats.asteroidsAvoided}</b> · Agujeros negros superados: <b>${state.stats.blackHoleSuccess}</b></p><p>Nota actual: <b>${state.score.toFixed(2)} / 5.00</b></p>`);}
    if(panel==='help')showHow();
  }


  /* ===== v1.3 · Combate láser, asteroides por tamaños y mensajes flotantes ===== */
  const fireBtn=$('#fireBtn'),laserText=$('#laserText'),destroyedText=$('#destroyedText'),laserCooldownFill=$('#laserCooldownFill'),messageKind=$('#messageKind');
  const questionPanel=document.querySelector('.question-panel');

  function bind(){
    els.launch.addEventListener('click',launchGame);els.how.addEventListener('click',showHow);
    els.hint.addEventListener('click',showHint);els.submit.addEventListener('click',submitAnswer);els.continue?.addEventListener('click',continueAfterFeedback);els.report.addEventListener('click',()=>downloadReport(false));
    els.finish.addEventListener('click',confirmFinish);els.modalClose.addEventListener('click',closeModal);els.sound.addEventListener('click',toggleSound);
    $$('.side-rail button').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
    $$('[data-move]').forEach(b=>{const d=b.dataset.move;b.addEventListener('pointerdown',e=>{e.preventDefault();held[d]=true;moveDrone(d);b.setPointerCapture?.(e.pointerId);});['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>held[d]=false));});
    fireBtn?.addEventListener('pointerdown',e=>{e.preventDefault();fireLaser();});
    els.canvas.addEventListener('pointerdown',e=>{if(state.phase==='flight'){e.preventDefault();fireLaser();}});
    window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);
    document.addEventListener('contextmenu',e=>{if(state.mode==='exam'&&!state.completed){e.preventDefault();integrityStrike('Intento de menú contextual');}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='exam'&&!state.completed)integrityStrike('Cambio de pestaña o ventana');});
    window.addEventListener('blur',()=>{Object.keys(held).forEach(k=>held[k]=false);if(state.mode==='exam'&&!state.completed&&document.visibilityState==='visible')integrityStrike('Pérdida de foco de la evaluación');});
    document.addEventListener('fullscreenchange',handleFullscreenChange);document.addEventListener('webkitfullscreenchange',handleFullscreenChange);
    els.reenterFullscreen.addEventListener('click',reenterFullscreen);
    window.addEventListener('orientationchange',()=>setTimeout(resizeAll,250));window.visualViewport?.addEventListener('resize',()=>setTimeout(resizeAll,80));
    window.addEventListener('beforeunload',()=>saveProgress());
  }
  function onKey(e){
    if(state.mode==='exam'&&!state.completed&&state.startedAt){
      const k=String(e.key||'').toLowerCase(),ctrl=e.ctrlKey||e.metaKey;
      const sensitiveShortcut=ctrl&&['c','x','a','s','p','u','w','r'].includes(k);
      const devtools=e.key==='F12'||(ctrl&&e.shiftKey&&['i','j','c','k'].includes(k));
      const refresh=e.key==='F5';
      const browserNavigation=e.altKey&&['arrowleft','arrowright'].includes(k);
      const printScreen=e.key==='PrintScreen';
      if(sensitiveShortcut||devtools||refresh||browserNavigation||printScreen){
        e.preventDefault();e.stopPropagation();
        if(printScreen){try{navigator.clipboard?.writeText('');}catch(_e){}}
        const label=printScreen?'Captura de pantalla':refresh?'Recarga de página':browserNavigation?'Navegación del navegador':`Atajo restringido: ${e.key}`;
        integrityStrike(label,'El comando fue bloqueado por el control de integridad.');return;
      }
    }
    if((e.code==='Space'||e.key===' ')&&!els.game.hidden){e.preventDefault();if(!e.repeat)fireLaser();return;}
    const k=e.key.toLowerCase(),map={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'up',w:'up',arrowdown:'down',s:'down'};
    if(map[k]&&!els.game.hidden){e.preventDefault();held[map[k]]=true;if(!e.repeat)moveDrone(map[k]);}
    if(e.key==='Enter'&&document.activeElement?.id==='numericAnswer')submitAnswer();
  }
  function onKeyUp(e){const map={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'up',w:'up',arrowdown:'down',s:'down'};const d=map[e.key.toLowerCase()];if(d)held[d]=false;}

  async function launchGame(){
    state.student=els.name.value.trim()||NVScorm.get('cmi.core.student_name')||'Estudiante Vectorial';state.mode=document.querySelector('input[name="mode"]:checked').value;
    if(state.mode==='exam'&&!integrityAcknowledged){
      showModal('Advertencia obligatoria de integridad',`<div class="integrity-warning"><p><strong>Antes de iniciar la Evaluación SCORM debes reconocer esta regla:</strong></p><p>Se registran las acciones bloqueadas, como salir de pantalla completa, cambiar de pestaña, perder el foco, usar clic derecho, copiar, recargar o ejecutar atajos restringidos.</p><span class="integrity-critical-line">AL QUINTO BLOQUEO EL QUIZ SE ANULA Y LA NOTA QUEDA EN 0.00 / 5.00</span><p>La anulación se envía inmediatamente a Brightspace con estado <b>failed</b>.</p></div>`,[
        {label:'CANCELAR',action:()=>{integrityAcknowledged=false;closeModal();}},
        {label:'ACEPTO E INICIAR EVALUACIÓN',action:()=>{integrityAcknowledged=true;closeModal();launchGame();},primary:true}
      ]);return;
    }
    const allowed=await requestGameFullscreen();if(!allowed){showModal('Pantalla completa requerida','<p>La navegación espacial necesita toda la pantalla. Autoriza el permiso del navegador y vuelve a iniciar.</p><p>En Brightspace, abre el recurso en una ventana o marco con permiso de pantalla completa.</p>',[{label:'REINTENTAR',action:()=>{closeModal();launchGame();},primary:true}]);return;}
    state.seed=(Date.now()^Math.floor(Math.random()*1e9))>>>0;questions=NVQuestions.build(state.seed);blackHoleQuestions=NVQuestions.buildBlackHole(state.seed);
    state.startedAt=new Date();state.phase='flight';state.currentChallenge=null;state.blackHoleIndex=0;state.energy=5;state.projectiles=[];state.mathShot=null;state.rewind=null;state.lastShotAt=0;
    state.stats={asteroidHits:0,asteroidsAvoided:0,asteroidsShot:0,smallDestroyed:0,mediumDestroyed:0,largeDestroyed:0,shotsFired:0,blackHolesEntered:0,blackHoleSuccess:0,blackHoleFails:0,asteroidPenalty:0,blackHolePenalty:0,maxAsteroids:0,distance:0,livesLost:0,rewinds:0};
    document.body.classList.add('playing');els.boot.hidden=true;els.game.hidden=false;buildSectorDots();resizeAll();renderQuestion();animate(performance.now());saveProgress();
  }
  function showHow(){
    showModal('Cómo jugar',`<ol><li><b>Vuela y combate:</b> usa flechas o WASD para pilotar. Dispara con <b>Espacio</b>, clic sobre el campo o el botón Fuego.</li><li>Los asteroides aparecen en tamaños <b>pequeño, mediano y grande</b>. Necesitan 1, 2 o 4 impactos de láser. Los grandes pueden fragmentarse.</li><li>Al colisionar, aparece una <b>transmisión matemática grande</b> sobre el juego. Si aciertas, la nave dispara automáticamente y destruye el asteroide de la colisión.</li><li>Si fallas una prueba de asteroide, pierdes <b>0.10</b>, una vida y retrocedes al último tramo seguro. La pregunta permanece pendiente para una nueva colisión.</li><li>Los agujeros negros ofrecen corredores con menos asteroides. Su reto es más complejo: un error resta <b>0.20</b>, consume dos vidas y devuelve la nave al campo denso.</li><li>Algunos asteroides tienen un <b>núcleo cifrado</b>: el láser común no los destruye; sirven para activar el siguiente reto del sector.</li></ol><p><b>Temas:</b> vectores, matrices, determinantes, sistemas lineales y Gauss–Jordan, exclusivamente del primer corte.</p>`);
  }
  function renderQuestion(){
    if(state.questionIndex>=questions.length){finishMission(false);return;}const q=questions[state.questionIndex],sec=q.sector;selected=null;answerLocked=true;q._hintUsed=false;q._attempts=0;
    els.sectorNumber.textContent=`SECTOR ${sec}`;els.sectorName.textContent=sectorNames[sec-1];els.qCount.textContent=`PREGUNTA ${state.questionIndex+1} / ${questions.length}`;els.qBadge.textContent=q.badge;renderProgress();updateHUD();
    if(!state.space||state.space.sector!==sec)initSpace(sec,true);activateFlight('CAMPO DE ASTEROIDES ACTIVADO');
  }
  function initSpace(sector,resetShip){
    const now=performance.now();state.space={sector,route:0,zone:'dense',safeUntil:0,asteroids:[],blackHoles:[],projectiles:[],explosions:[],spawnAccumulator:0,blackHoleAt:now+7200+Math.random()*3500,nextCoreAt:now+3600,invulnerableUntil:now+2400,flashUntil:0,transitionStart:0,lastW:1,lastH:1,checkpointRoute:0,checkpointAt:now,shieldToastAt:0,muzzleUntil:0};
    if(resetShip){state.drone.x=0;state.drone.y=0;state.drone.vx=0;state.drone.vy=0;state.drone.tilt=0;}seedAsteroids(24+sector*4);
  }
  function seedAsteroids(count){
    if(!state.space)return;
    const total=Math.max(count,76+state.space.sector*8),finalSector=state.space.sector>=5,blueTarget=finalSector?total:Math.max(30,Math.round(total*.43));
    const flags=Array.from({length:total},(_,i)=>i<blueTarget);
    for(let i=flags.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[flags[i],flags[j]]=[flags[j],flags[i]];}
    for(let i=0;i<total;i++)spawnAsteroid(-.86+Math.random()*1.66,true,flags[i]);
  }
  function spawnAsteroid(y=-.12,initial=false,forceCore=false,fragment=null){
    const s=state.space;if(!s)return null;let x=fragment?.x??(.035+Math.random()*.93);if(initial&&y>.46&&Math.abs(x-.5)<.26)x=x<.5?.14:.86;
    let size,hp,r;if(fragment){size='small';hp=1;r=.014+Math.random()*.009;}else{const roll=Math.random();size=roll<.46?'small':roll<.82?'medium':'large';hp=size==='small'?1:size==='medium'?2:4;r=size==='small'?.014+Math.random()*.011:size==='medium'?.026+Math.random()*.014:.043+Math.random()*.020;}
    if(forceCore){size='core';hp=999;r=.030+Math.random()*.014;x=.055+Math.random()*.89;state.stats.questionAsteroidsSpawned=(state.stats.questionAsteroidsSpawned||0)+1;}
    const speed=(size==='large'?.115:size==='medium'?.17:size==='core'?.145:.23)+Math.random()*.12+s.sector*.012;
    const a={id:`a${Date.now()}_${Math.random()}`,x,y,r,size,hp,maxHp:hp,speed,rot:Math.random()*Math.PI*2,spin:(Math.random()-.5)*1.9,seed:Math.random()*999,passed:false,drift:fragment?.drift??((Math.random()-.5)*.045),core:forceCore,hitFlash:0};s.asteroids.push(a);return a;
  }
  function spawnBlackHole(){const s=state.space;if(!s||s.blackHoles.length||performance.now()<s.safeUntil)return;s.blackHoles.push({id:`b${Date.now()}`,x:.18+Math.random()*.64,y:-.18,r:.062,speed:.095+Math.random()*.035,rot:Math.random()*Math.PI*2});s.blackHoleAt=performance.now()+14500+Math.random()*6000;}
  function activateFlight(message){
    const q=questions[state.questionIndex];if(!q||state.completed)return;state.phase='flight';state.currentChallenge=null;state.mathShot=null;state.rewind=null;answerLocked=true;selected=null;
    els.gameLayout.classList.add('flight-mode');els.gameLayout.classList.remove('challenge-open');questionPanel.classList.remove('blackhole-message','asteroid-message');els.flightHud.hidden=false;els.arrivalChip.hidden=true;els.challengeRibbon.hidden=true;
    els.hint.disabled=true;els.submit.disabled=true;els.qBody.innerHTML='';els.answers.innerHTML='';els.mini.hidden=true;mctx.clearRect(0,0,els.mini.width,els.mini.height);
    els.flightTitle.textContent=message||'CAMPO DE ASTEROIDES';els.instruction.textContent='Pilota, esquiva y dispara. Espacio, clic o Fuego lanzan el láser. Los núcleos cifrados activan pruebas.';
    requestAnimationFrame(()=>{resizeAll();setTimeout(resizeAll,220);});saveProgress();
  }
  function fireLaser(){
    if(state.phase!=='flight'||state.completed||!state.space)return;const now=performance.now(),cooldown=190;if(now-(state.lastShotAt||0)<cooldown)return;state.lastShotAt=now;state.space.muzzleUntil=now+110;state.stats.shotsFired++;
    const w=state.space.lastW||1,h=state.space.lastH||1,sx=(w/2+state.drone.x)/w,sy=(h*.78+state.drone.y)/h;[-.011,.011].forEach(dx=>state.space.projectiles.push({x:sx+dx,y:sy-.02,speed:1.23,life:1.2,dead:false}));beep(930,.045);updateCombatHud(now);
  }
  function updateCombatHud(now=performance.now()){const left=Math.max(0,190-(now-(state.lastShotAt||0))),ready=left<=0;laserText&&(laserText.textContent=(now<(state.weaponBoostUntil||0))?(ready?'LÁSER POTENCIADO':'POTENCIA '+Math.ceil(Math.max(0,(state.weaponBoostUntil-now))/1000)+' s'):(ready?'LÁSER LISTO':`RECARGA ${Math.ceil(left)} ms`));laserCooldownFill&&(laserCooldownFill.style.transform=`scaleX(${ready?1:Math.max(0,1-left/190)})`);destroyedText&&(destroyedText.textContent=`DESTRUIDOS ${state.stats.asteroidsShot||0}`);}
  function triggerCollision(kind,obj){
    if(state.phase!=='flight'||state.completed||performance.now()<(state.space?.invulnerableUntil||0))return;const s=state.space;s.flashUntil=performance.now()+520;
    const portalPool=blackHoleQuestions.filter(x=>x.sector===s.sector),challengeQ=kind==='asteroid'?questions[state.questionIndex]:portalPool[state.blackHoleIndex%portalPool.length];
    state.currentChallenge={kind,objectId:obj.id,q:challengeQ,snapshot:{route:s.route,drone:{...state.drone},sector:s.sector,checkpointRoute:s.checkpointRoute}};
    if(kind==='asteroid'){state.stats.asteroidHits++;els.arrivalChip.textContent='COLISIÓN · MENSAJE ENTRANTE';beep(150,.22);}else{state.stats.blackHolesEntered++;els.arrivalChip.textContent='HORIZONTE DE EVENTOS · MENSAJE ENTRANTE';beep(90,.38);}
    state.phase='impact';els.arrivalChip.className='arrival-chip';els.arrivalChip.hidden=false;spawnBurst('bad');setTimeout(()=>{els.arrivalChip.hidden=true;revealChallenge();},480);
  }
  function shouldShowMini(q,ch){if(!q?.visual)return false;if(q.type==='roman')return false;if(ch?.kind==='blackhole'&&stripHtml(q.prompt).length>170)return false;return ['vectors','projection','systemLines','gauss','matrixMultiply','matrixAdd','matrixScale','transpose','determinant','augmented'].includes(q.visual.kind);}
  async function revealChallenge(){
    const ch=state.currentChallenge,q=ch?.q;if(!q||state.completed)return;selected=null;answerLocked=true;q._hintUsed=false;q._attempts=0;
    const sec=questions[state.questionIndex]?.sector||q.sector;els.sectorNumber.textContent=`SECTOR ${sec}`;els.sectorName.textContent=sectorNames[sec-1];
    els.qCount.textContent=ch.kind==='blackhole'?'MENSAJE DEL PORTAL · RETO AVANZADO':`MENSAJE DE COLISIÓN · RETO ${state.questionIndex+1}/${questions.length}`;
    els.qBadge.textContent=ch.kind==='blackhole'?'RIESGO ALTO · ERROR: PENALIZACIÓN Y PÉRDIDA DE 2 VIDAS':`ASTEROIDE ${state.space?.asteroids.find(a=>a.id===ch.objectId)?.size?.toUpperCase()||''} · ERROR: PENALIZACIÓN Y PÉRDIDA DE 1 VIDA`;
    messageKind&&(messageKind.textContent=ch.kind==='blackhole'?'AGUJERO NEGRO':'ASTEROIDE');questionPanel.classList.toggle('blackhole-message',ch.kind==='blackhole');questionPanel.classList.toggle('asteroid-message',ch.kind==='asteroid');
    els.instruction.textContent=ch.kind==='blackhole'?'Resuelve el mensaje avanzado para autorizar el salto.':'Resuelve el mensaje para que la nave pueda disparar y destruir el asteroide de la colisión.';
    els.qBody.innerHTML=q.prompt;renderOptions(q);els.answers.classList.toggle('two-column',q.type==='tf'||q.type==='roman'||(q.options&&q.options.every(o=>stripHtml(o.html).length<38)));
    els.mini.hidden=!shouldShowMini(q,ch);setFeedback(ch.kind==='blackhole'?'El portal espera autorización matemática. Un error te devuelve al campo denso.':'La nave está inmovilizada. Una respuesta correcta activa el disparo automático.','neutral');
    await typeset();if(state.completed)return;state.phase='question';questionStart=Date.now();els.gameLayout.classList.remove('flight-mode');els.gameLayout.classList.add('challenge-open');els.flightHud.hidden=true;answerLocked=false;els.submit.disabled=false;els.hint.disabled=false;
    requestAnimationFrame(()=>{resizeAll();if(!els.mini.hidden)drawMini(q,performance.now());setTimeout(resizeAll,220);});saveProgress();
  }
  function submitAnswer(){
    if(answerLocked)return;const ch=state.currentChallenge,q=ch?.q;if(!q)return;let value=selected;if(q.type==='numeric'){const inp=$('#numericAnswer');if(!inp||inp.value===''){toast('Escribe una respuesta numérica.');return;}value=Number(inp.value);}if(value===null){toast('Selecciona una respuesta.');return;}
    q._attempts++;let correct=false;if(q.type==='numeric')correct=Math.abs(value-q.answerValue)<1e-9;else if(q.type==='tf')correct=value===q.answer;else correct=Number(value)===q.answer;answerLocked=true;els.submit.disabled=true;els.hint.disabled=true;
    if(ch.kind==='asteroid'){
      if(correct){const reward=q._hintUsed?.18:.25;state.score=clampScore(state.score+reward);state.xp+=q._hintUsed?80:100;state.sectorProgress[q.sector-1]++;state.answers.push(recordAnswer(q,true,value,reward,'Colisión con asteroide'));setFeedback(`Autorización concedida. La nave destruirá el asteroide. ${q.explanation}`,'good');markOptions(q,true,value);beep(760,.14);updateHUD();saveProgress();setTimeout(()=>resolveAsteroid(true),900);}
      else{const penalty=.10;state.score=clampScore(state.score-penalty);state.energy=Math.max(0,state.energy-1);state.stats.livesLost++;state.stats.asteroidPenalty+=penalty;state.answers.push(recordAnswer(q,false,value,-penalty,'Colisión con asteroide'));setFeedback(`Respuesta incorrecta: pierdes 0.10 y una vida. La nave retrocederá al último tramo seguro; el reto seguirá pendiente.`,'bad');markOptions(q,false,value);beep(165,.22);updateHUD();saveProgress();setTimeout(()=>resolveAsteroid(false),1150);}
    }else{
      if(correct){const reward=q._hintUsed?.06:.10;state.score=clampScore(state.score+reward);state.xp+=120;state.stats.blackHoleSuccess++;state.answers.push(recordAnswer(q,true,value,reward,'Agujero negro'));setFeedback(`Salto gravitacional autorizado. ${q.explanation}`,'good');markOptions(q,true,value);beep(980,.24);updateHUD();saveProgress();setTimeout(()=>resolveBlackHole(true),1050);}
      else{const penalty=.20;state.score=clampScore(state.score-penalty);state.energy=Math.max(0,state.energy-2);state.stats.livesLost+=2;state.stats.blackHolePenalty+=penalty;state.stats.blackHoleFails++;state.answers.push(recordAnswer(q,false,value,-penalty,'Agujero negro'));setFeedback('El portal rechazó la secuencia: pierdes 0.20 y dos vidas. Serás devuelto a una zona de alta densidad.','bad');markOptions(q,false,value);beep(95,.36);updateHUD();saveProgress();setTimeout(()=>resolveBlackHole(false),1300);}
    }
    if(state.energy<=0){state.energy=3;state.stats.rewinds++;setFeedback(`${els.feedbackText.innerHTML}<br><b>Rescate automático:</b> el blindaje se restablecerá a 3 vidas al terminar el retroceso.`,'bad');updateHUD();}
  }
  function hideChallengeForAction(){els.gameLayout.classList.add('flight-mode');els.gameLayout.classList.remove('challenge-open');els.flightHud.hidden=false;els.challengeRibbon.hidden=true;questionPanel.classList.remove('blackhole-message','asteroid-message');els.qBody.innerHTML='';els.answers.innerHTML='';els.mini.hidden=true;requestAnimationFrame(resizeAll);}
  function resolveAsteroid(correct){
    const ch=state.currentChallenge,s=state.space;if(!ch||!s)return;if(correct){hideChallengeForAction();state.phase='math-shot';state.mathShot={start:performance.now(),duration:1150,targetId:ch.objectId,snapshot:ch.snapshot,done:false};els.flightTitle.textContent='RESPUESTA CORRECTA · ARMAS AUTORIZADAS';els.flightTarget.textContent='La nave fija el objetivo y dispara automáticamente.';els.instruction.textContent='Disparo matemático en curso…';els.arrivalChip.textContent='SISTEMA DE ARMAS AUTORIZADO';els.arrivalChip.className='arrival-chip weapon';els.arrivalChip.hidden=false;setTimeout(()=>els.arrivalChip.hidden=true,620);}else beginRewind('asteroid');
  }
  function finishMathShot(){
    const shot=state.mathShot,ch=state.currentChallenge,s=state.space;if(!shot||shot.done||!ch||!s)return;shot.done=true;const target=s.asteroids.find(a=>a.id===shot.targetId);if(target)addExplosion(target.x,target.y,target.r,'math');s.asteroids=s.asteroids.filter(a=>a.id!==shot.targetId);state.stats.asteroidsShot++;state.stats.asteroidsMath=(state.stats.asteroidsMath||0)+1;restoreCollisionPoint(shot.snapshot);s.invulnerableUntil=performance.now()+1900;s.nextCoreAt=performance.now()+4300;
    const previousSector=questions[state.questionIndex]?.sector;state.questionIndex++;state.currentChallenge=null;state.mathShot=null;if(state.questionIndex>=questions.length){finishMission(false);return;}const nextSector=questions[state.questionIndex].sector;if(nextSector!==previousSector){beginSectorTransition(nextSector);return;}activateFlight('ASTEROIDE DESTRUIDO · RUTA RESTABLECIDA');
  }
  function beginRewind(kind){
    const ch=state.currentChallenge,s=state.space;if(!ch||!s)return;hideChallengeForAction();state.phase='rewind';const from=ch.snapshot.route,to=Math.max(ch.snapshot.checkpointRoute||0,from-(kind==='blackhole'?820:430));state.rewind={start:performance.now(),duration:1350,from,to,kind,done:false};state.stats.rewinds++;
    if(kind==='asteroid')s.asteroids=s.asteroids.filter(a=>a.id!==ch.objectId);else s.blackHoles=s.blackHoles.filter(b=>b.id!==ch.objectId);s.safeUntil=0;s.invulnerableUntil=performance.now()+2600;els.flightTitle.textContent=kind==='blackhole'?'PORTAL FALLIDO · RETROCESO GRAVITACIONAL':'RESPUESTA INCORRECTA · RETROCESO DE EMERGENCIA';els.flightTarget.textContent='Regresando al último tramo seguro…';els.instruction.textContent='La nave pierde distancia, recupera control y vuelve al campo de asteroides.';
  }
  function finishRewind(){const r=state.rewind,s=state.space;if(!r||r.done||!s)return;r.done=true;s.route=r.to;state.drone.x=0;state.drone.y=0;state.drone.vx=0;state.drone.vy=0;s.asteroids=[];s.blackHoles=[];seedAsteroids((r.kind==='blackhole'?38:34)+s.sector*4);s.nextCoreAt=performance.now()+1800;s.blackHoleAt=performance.now()+10500;state.currentChallenge=null;state.rewind=null;activateFlight(r.kind==='blackhole'?'REGRESO AL CAMPO DENSO':'REINTENTO · TRAMO SEGURO RESTABLECIDO');}
  function resolveBlackHole(correct){const ch=state.currentChallenge,s=state.space;if(!ch||!s)return;if(correct){hideChallengeForAction();s.blackHoles=s.blackHoles.filter(b=>b.id!==ch.objectId);state.blackHoleIndex++;restoreCollisionPoint(ch.snapshot);s.zone='safe';s.safeUntil=performance.now()+14000;s.invulnerableUntil=performance.now()+1800;s.route+=520;s.asteroids=s.asteroids.filter(a=>a.core||Math.random()<.22);while(s.asteroids.length<5)spawnAsteroid(-.4+Math.random()*.9,true,false);state.currentChallenge=null;activateFlight('SALTO EXITOSO · CORREDOR DE BAJA DENSIDAD');}else{state.blackHoleIndex++;beginRewind('blackhole');}}
  function showHint(){const q=state.currentChallenge?.q||questions[state.questionIndex];if(!q||answerLocked)return;q._hintUsed=true;state.hints++;setFeedback(q.hint,'hinting');els.hint.disabled=true;if(state.currentChallenge?.kind==='asteroid'){const reward=mainQuestionReward(q),penalty=mainQuestionPenalty(q);els.qBadge.textContent='PISTA ACTIVADA · RECOMPENSA REDUCIDA · ERROR: PIERDES 1 VIDA';}typeset();}
  function recordAnswer(q,correct,value,delta,event='Prueba'){return{id:q.id,sector:q.sector,type:q.badge,event,correct,value:String(value),delta,timeSec:Math.round((Date.now()-questionStart)/1000),hint:!!q._hintUsed,prompt:stripHtml(q.prompt)};}
  function moveDrone(dir){if(state.phase!=='flight'||state.completed)return;const n=150;if(dir==='left')state.drone.vx-=n;if(dir==='right')state.drone.vx+=n;if(dir==='up')state.drone.vy-=n*.72;if(dir==='down')state.drone.vy+=n*.72;beep(330,.025);}
  function animate(t){
    if(els.game.hidden)return;const dt=Math.min(.033,(t-(state.lastFrame||t))/1000);state.lastFrame=t;const q=questions[state.questionIndex];drawScene(q,t,dt);if(state.phase==='question'&&!els.mini.hidden)drawMini(state.currentChallenge?.q||q,t);
    if(state.phase==='math-shot'&&state.mathShot&&t-state.mathShot.start>=state.mathShot.duration)finishMathShot();if(state.phase==='rewind'&&state.rewind&&t-state.rewind.start>=state.rewind.duration)finishRewind();updateCombatHud(t);raf=requestAnimationFrame(animate);
  }
  function drawScene(q,t,dt){if(!q)return;const{w,h}=prep(els.canvas,ctx);ctx.clearRect(0,0,w,h);if(state.space){state.space.lastW=w;state.space.lastH=h;}if(state.phase==='paused'){drawSpaceScene(ctx,w,h,t,0,true);drawPauseVeil(ctx,w,h);return;}drawSpaceScene(ctx,w,h,t,dt,state.phase!=='flight');drawParticles(ctx,w,h,dt);}
  function drawSpaceScene(c,w,h,t,dt,paused){
    const s=state.space;if(!s)return;const safe=t<s.safeUntil;s.zone=safe?'safe':'dense';drawDeepSpace(c,w,h,t,s,safe);if(state.phase==='sector-transition'){drawSectorWarp(c,w,h,t,s);return;}if(!paused&&state.phase==='flight')updateSpaceObjects(w,h,dt,t,safe);
    drawSpaceLanes(c,w,h,t,safe);s.asteroids.forEach(a=>drawAsteroid(c,w,h,a,t));s.blackHoles.forEach(b=>drawBlackHole(c,w,h,b,t));drawProjectiles(c,w,h,t);drawExplosions(c,w,h,dt);
    updateShipPhysics(w,h,paused?0:dt,.58);const sx=w/2+state.drone.x,sy=h*.78+state.drone.y;drawShip(c,sx,sy,t,state.drone.tilt,.84);if(t<s.muzzleUntil)drawMuzzle(c,sx,sy,t);
    if(t<s.invulnerableUntil){c.strokeStyle=`rgba(80,240,210,${.35+.25*Math.sin(t/80)})`;c.lineWidth=3;c.beginPath();c.arc(sx,sy,54+Math.sin(t/100)*5,0,Math.PI*2);c.stroke();}
    if(s.flashUntil>t){const a=(s.flashUntil-t)/520;c.fillStyle=`rgba(255,75,100,${a*.34})`;c.fillRect(0,0,w,h);}if(state.phase==='question'||state.phase==='impact')drawCollisionMarker(c,w,h,t);if(state.phase==='math-shot')drawMathShot(c,w,h,t);if(state.phase==='rewind')drawRewind(c,w,h,t);updateFlightHud(s,safe);
  }
  function updateSpaceObjects(w,h,dt,t,safe){
    const s=state.space,rate=safe?.78:Math.max(.12,.225-s.sector*.014),speedFactor=safe?.70:1+s.sector*.045;s.route+=dt*190*speedFactor;state.stats.distance+=dt*190*speedFactor;s.spawnAccumulator+=dt;
    while(s.spawnAccumulator>rate&&s.asteroids.length<54){s.spawnAccumulator-=rate;spawnAsteroid(-.12-Math.random()*.18,false,false);}if(t>s.blackHoleAt)spawnBlackHole();if(t>s.nextCoreAt&&!s.asteroids.some(a=>a.core)){spawnAsteroid(-.18,false,true);s.nextCoreAt=t+9000;}
    if(t-s.checkpointAt>5200){s.checkpointAt=t;s.checkpointRoute=s.route;}
    for(const a of s.asteroids){a.y+=a.speed*speedFactor*dt;a.x+=a.drift*dt;a.rot+=a.spin*dt;if(a.x<.02||a.x>.98)a.drift*=-1;if(a.y>1.18&&!a.passed){a.passed=true;state.stats.asteroidsAvoided++;}}
    s.asteroids=s.asteroids.filter(a=>a.y<1.25);for(const b of s.blackHoles){b.y+=b.speed*dt;b.rot+=dt*.45;}s.blackHoles=s.blackHoles.filter(b=>b.y<1.24);
    updateProjectiles(w,h,dt,t);state.stats.maxAsteroids=Math.max(state.stats.maxAsteroids,s.asteroids.length);if(t<s.invulnerableUntil)return;
    const sx=w/2+state.drone.x,sy=h*.78+state.drone.y,shipR=Math.max(20,Math.min(w,h)*.034);for(const a of s.asteroids){const ax=a.x*w,ay=a.y*h,ar=a.r*Math.min(w,h);if(Math.hypot(ax-sx,ay-sy)<shipR+ar*.78){triggerCollision('asteroid',a);return;}}for(const b of s.blackHoles){const bx=b.x*w,by=b.y*h,br=b.r*Math.min(w,h);if(Math.hypot(bx-sx,by-sy)<shipR+br*.62){triggerCollision('blackhole',b);return;}}
  }
  function updateProjectiles(w,h,dt,t){
    const s=state.space;if(!s)return;for(const p of s.projectiles){p.y-=p.speed*dt;p.life-=dt;if(p.y<-.08||p.life<=0)p.dead=true;if(p.dead)continue;for(const a of s.asteroids){if(a._dead)continue;const ar=a.r,dx=p.x-a.x,dy=p.y-a.y;if(Math.hypot(dx*w,dy*h)<ar*Math.min(w,h)*.9+5){p.dead=true;a.hitFlash=t+130;if(a.core){addExplosion(a.x,a.y,a.r*.45,'shield');if(t>s.shieldToastAt){toast('Núcleo cifrado: debes colisionarlo y resolver el mensaje.');s.shieldToastAt=t+1800;}}else{a.hp--;addExplosion(a.x,a.y,a.r*.38,'laser');if(a.hp<=0)destroyAsteroidByLaser(a);}break;}}
    }s.projectiles=s.projectiles.filter(p=>!p.dead);
  }
  function destroyAsteroidByLaser(a){const s=state.space;if(!s||a._dead)return;a._dead=true;state.stats.asteroidsShot++;if(a.size==='small')state.stats.smallDestroyed++;if(a.size==='medium')state.stats.mediumDestroyed++;if(a.size==='large')state.stats.largeDestroyed++;state.xp+=a.size==='large'?12:a.size==='medium'?7:3;addExplosion(a.x,a.y,a.r,'laser');if(a.size==='large'){spawnAsteroid(a.y,false,false,{x:Math.max(.04,a.x-.025),drift:-.065});spawnAsteroid(a.y,false,false,{x:Math.min(.96,a.x+.025),drift:.065});}s.asteroids=s.asteroids.filter(x=>x.id!==a.id);updateHUD();}
  function addExplosion(x,y,r,kind){state.space?.explosions.push({x,y,r,kind,start:performance.now(),life:1,seed:Math.random()*10});}
  function drawProjectiles(c,w,h,t){const s=state.space;if(!s)return;c.save();c.globalCompositeOperation='lighter';for(const p of s.projectiles){const x=p.x*w,y=p.y*h;c.strokeStyle='#65f5ff';c.lineWidth=3;c.shadowColor='#20e5ff';c.shadowBlur=14;c.beginPath();c.moveTo(x,y+18);c.lineTo(x,y-10);c.stroke();c.fillStyle='#fff';c.fillRect(x-1,y-12,2,11);}c.restore();}
  function drawExplosions(c,w,h,dt){const s=state.space;if(!s)return;for(const e of s.explosions){e.life-=dt*(e.kind==='math'?.65:1.25);const p=1-e.life,r=e.r*Math.min(w,h)*(1+p*2.6),x=e.x*w,y=e.y*h;c.save();c.globalCompositeOperation='lighter';const col=e.kind==='math'?'80,240,160':e.kind==='shield'?'212,108,255':'255,150,70';c.strokeStyle=`rgba(${col},${Math.max(0,e.life)})`;c.lineWidth=2+e.life*4;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.stroke();for(let i=0;i<10;i++){const a=e.seed+i*Math.PI*2/10;c.strokeStyle=`rgba(${col},${Math.max(0,e.life*.8)})`;c.beginPath();c.moveTo(x+Math.cos(a)*r*.3,y+Math.sin(a)*r*.3);c.lineTo(x+Math.cos(a)*r*(1.2+p),y+Math.sin(a)*r*(1.2+p));c.stroke();}c.restore();}s.explosions=s.explosions.filter(e=>e.life>0);}
  function drawMuzzle(c,x,y,t){c.save();c.globalCompositeOperation='lighter';c.fillStyle='rgba(150,250,255,.85)';c.shadowColor='#20e5ff';c.shadowBlur=20;for(const dx of[-18,18]){c.beginPath();c.moveTo(x+dx,y-22);c.lineTo(x+dx-5,y-55);c.lineTo(x+dx+5,y-55);c.closePath();c.fill();}c.restore();}
  function drawMathShot(c,w,h,t){const shot=state.mathShot,s=state.space;if(!shot||!s)return;const a=s.asteroids.find(x=>x.id===shot.targetId);if(!a)return;const p=Math.min(1,(t-shot.start)/shot.duration),sx=w/2+state.drone.x,sy=h*.78+state.drone.y,tx=a.x*w,ty=a.y*h,ep=Math.min(1,p*1.65);c.save();c.globalCompositeOperation='lighter';c.strokeStyle='#7dfff1';c.lineWidth=3+6*Math.sin(Math.min(1,p)*Math.PI);c.shadowColor='#50f08a';c.shadowBlur=22;c.beginPath();c.moveTo(sx,sy-28);c.lineTo(sx+(tx-sx)*ep,sy-28+(ty-(sy-28))*ep);c.stroke();if(p>.48){const er=(p-.48)/.52;c.strokeStyle=`rgba(80,240,138,${1-er})`;for(let i=0;i<5;i++){c.beginPath();c.arc(tx,ty,(a.r*Math.min(w,h))*(.6+er*(i+1)*.55),0,Math.PI*2);c.stroke();}}c.restore();c.fillStyle='#dfffee';c.textAlign='center';c.font=`bold ${Math.max(16,Math.min(28,w/34))}px Segoe UI`;c.fillText('DISPARO MATEMÁTICO',w/2,h*.18);}
  function drawRewind(c,w,h,t){const r=state.rewind,s=state.space;if(!r||!s)return;const p=Math.min(1,(t-r.start)/r.duration),ease=p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;s.route=r.from+(r.to-r.from)*ease;c.save();c.globalCompositeOperation='lighter';for(let i=0;i<34;i++){const x=((i*83)%997)/997*w,y=((i*47+t*.65)%h);c.strokeStyle=`rgba(255,80,120,${.12+(i%5)*.08})`;c.lineWidth=1+(i%3);c.beginPath();c.moveTo(x,y);c.lineTo(x,y-70-120*p);c.stroke();}c.restore();c.fillStyle='#ffdce5';c.textAlign='center';c.font=`bold ${Math.max(16,Math.min(28,w/34))}px Segoe UI`;c.fillText('RETROCESO AL ÚLTIMO TRAMO SEGURO',w/2,h*.22);c.fillStyle='#ff6688';c.font='14px Segoe UI';c.fillText(`−${Math.round(r.from-s.route)} km`,w/2,h*.27);}
  function drawAsteroid(c,w,h,a,t){
    const x=a.x*w,y=a.y*h,r=a.r*Math.min(w,h);if(r<2)return;const comet=(state.space?.sector>=5)&&a.core;c.save();c.translate(x,y);c.rotate(a.rot);const hit=a.hitFlash>t,core=a.core;c.shadowColor=comet?'rgba(255,90,70,.95)':core?'rgba(32,229,255,.75)':hit?'rgba(255,240,150,.85)':'rgba(255,120,65,.35)';c.shadowBlur=comet?28:(core?22:hit?25:10);
    if(comet){c.save();c.rotate(-a.rot*1.35);c.globalAlpha=.88;for(let i=0;i<3;i++){c.fillStyle=i===0?'rgba(255,70,70,.40)':i===1?'rgba(255,150,60,.30)':'rgba(255,220,120,.22)';c.beginPath();c.moveTo(-r*(1.1+i*.4),0);c.lineTo(-r*(2.1+i*.7),-r*(.38+i*.07));c.lineTo(-r*(2.1+i*.7),r*(.38+i*.07));c.closePath();c.fill();}c.restore();}
    const grad=c.createRadialGradient(-r*.3,-r*.35,r*.08,0,0,r);grad.addColorStop(0,comet?'#fff1c0':core?'#bffaff':hit?'#fff4b3':'#d0b59a');grad.addColorStop(.32,comet?'#ff6f3c':core?'#286b82':'#806b60');grad.addColorStop(1,comet?'#5c120e':core?'#071827':'#2e2730');c.fillStyle=grad;c.strokeStyle=comet?'rgba(255,170,110,.85)':core?'rgba(32,229,255,.85)':'rgba(255,190,135,.45)';c.lineWidth=Math.max(1,r*.05);c.beginPath();for(let i=0;i<12;i++){const ang=i*Math.PI*2/12,noise=.76+((Math.sin(a.seed+i*4.7)+1)*.12);const px=Math.cos(ang)*r*noise,py=Math.sin(ang)*r*noise;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();c.fill();c.stroke();c.shadowBlur=0;
    for(let i=0;i<4;i++){const ang=a.seed+i*1.73,cr=r*(.10+(i%2)*.045),cx=Math.cos(ang)*r*.42,cy=Math.sin(ang)*r*.35;c.fillStyle=comet?'rgba(80,18,10,.52)':core?'rgba(1,18,30,.72)':'rgba(25,20,26,.46)';c.beginPath();c.ellipse(cx,cy,cr,cr*.72,ang,0,Math.PI*2);c.fill();}
    if(core){c.strokeStyle=comet?`rgba(255,210,120,${.55+.3*Math.sin(t/130)})`:`rgba(80,240,255,${.55+.3*Math.sin(t/130)})`;c.lineWidth=2;c.beginPath();c.arc(0,0,r*1.15+Math.sin(t/170)*3,0,Math.PI*2);c.stroke();c.fillStyle=comet?'#fff0c9':'#dffcff';c.font=`bold ${Math.max(8,r*.24)}px Segoe UI`;c.textAlign='center';c.fillText(comet?'COMETA':'PREGUNTA',0,r*1.55);}else if(a.maxHp>1){const W=r*1.25;c.fillStyle='rgba(1,7,15,.8)';c.fillRect(-W/2,r*1.12,W,4);c.fillStyle=a.hp/a.maxHp>.5?'#50f08a':'#ffd250';c.fillRect(-W/2,r*1.12,W*(a.hp/a.maxHp),4);}c.restore();
  }
  function updateFlightHud(s,safe){const sectorAnswered=state.sectorProgress[s.sector-1]||0;els.flightFill.style.width=`${Math.min(100,sectorAnswered/6*100)}%`;els.flightTitle.textContent=safe?'CORREDOR WARP · BAJA DENSIDAD':`COMBATE EN CAMPO DE ASTEROIDES · SECTOR ${s.sector}`;const left=Math.max(0,Math.ceil((s.safeUntil-performance.now())/1000));els.flightTarget.textContent=safe?`Ventana segura: ${left}s · dispara a los obstáculos restantes`:`Núcleos ${sectorAnswered}/6 · Espacio/clic para disparar · colisión activa la prueba`;els.densityText.textContent=safe?'DENSIDAD BAJA':'DENSIDAD ALTA';els.densityText.classList.toggle('safe',safe);els.asteroidText.textContent=`ASTEROIDES ${s.asteroids.length}`;els.warpText.textContent=safe?`SALTO ACTIVO ${left}s`:(s.blackHoles.length?'AGUJERO NEGRO DETECTADO':'PORTAL EN BÚSQUEDA');updateCombatHud();}
  function saveProgress(){try{const slimSpace=state.space?{sector:state.space.sector,route:state.space.route,zone:state.space.zone,safeUntil:0,checkpointRoute:state.space.checkpointRoute}:null;localStorage.setItem('nexoVectorialState',JSON.stringify({...state,space:slimSpace,particles:[],drone:{x:state.drone.x,y:state.drone.y,tilt:state.drone.tilt},currentChallenge:null,flight:null,mathShot:null,rewind:null}));}catch(_e){}NVScorm.saveProgress(state);}

  /* ===== v1.4 · Mundos, interceptores, salvavidas y jefe final ===== */
  const lifeValue=$('#lifeValue'),phaseText=$('#phaseText'),enemyText=$('#enemyText');
  const bossHud=$('#bossHud'),bossFormText=$('#bossFormText'),bossNameText=$('#bossNameText'),bossHealthFill=$('#bossHealthFill'),bossHealthText=$('#bossHealthText');
  const scorePopupLayer=$('#scorePopupLayer');
  const ACTIVE_COMBAT_PHASES=['flight','enemy-wave','boss'];
  const BOSS_HP=[44,58,74,94];

  function bind(){
    els.launch.addEventListener('click',launchGame);els.how.addEventListener('click',showHow);
    els.hint.addEventListener('click',showHint);els.submit.addEventListener('click',submitAnswer);els.continue?.addEventListener('click',continueAfterFeedback);els.report.addEventListener('click',()=>downloadReport(false));
    els.finish.addEventListener('click',confirmFinish);els.modalClose.addEventListener('click',closeModal);els.sound.addEventListener('click',toggleSound);
    $$('.side-rail button').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
    $$('[data-move]').forEach(b=>{const d=b.dataset.move;b.addEventListener('pointerdown',e=>{e.preventDefault();held[d]=true;moveDrone(d);b.setPointerCapture?.(e.pointerId);});['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>held[d]=false));});
    fireBtn?.addEventListener('pointerdown',e=>{e.preventDefault();fireLaser();});
    els.canvas.addEventListener('pointerdown',e=>{if(ACTIVE_COMBAT_PHASES.includes(state.phase)){e.preventDefault();fireLaser();}});
    window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);
    document.addEventListener('contextmenu',e=>{if(state.mode==='exam'&&!state.completed){e.preventDefault();integrityStrike('Intento de menú contextual');}});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&state.mode==='exam'&&!state.completed)integrityStrike('Cambio de pestaña o ventana');});
    window.addEventListener('blur',()=>{Object.keys(held).forEach(k=>held[k]=false);if(state.mode==='exam'&&!state.completed&&document.visibilityState==='visible')integrityStrike('Pérdida de foco de la evaluación');});
    document.addEventListener('fullscreenchange',handleFullscreenChange);document.addEventListener('webkitfullscreenchange',handleFullscreenChange);
    els.reenterFullscreen.addEventListener('click',reenterFullscreen);
    window.addEventListener('orientationchange',()=>setTimeout(resizeAll,250));window.visualViewport?.addEventListener('resize',()=>setTimeout(resizeAll,80));
    window.addEventListener('beforeunload',()=>saveProgress());
  }

  async function launchGame(){
    state.student=els.name.value.trim()||NVScorm.get('cmi.core.student_name')||'Estudiante Vectorial';
    state.mode=document.querySelector('input[name="mode"]:checked').value;
    const allowed=await requestGameFullscreen();
    if(!allowed){showModal('Pantalla completa requerida','<p>La misión necesita toda la pantalla para conservar la visibilidad del combate y de las gráficas matemáticas.</p><p>En Brightspace, abre el recurso en una ventana o marco con permiso de pantalla completa.</p>',[{label:'REINTENTAR',action:()=>{closeModal();launchGame();},primary:true}]);return;}
    state.seed=(Date.now()^Math.floor(Math.random()*1e9))>>>0;questions=NVQuestions.build(state.seed);blackHoleQuestions=NVQuestions.buildBlackHole(state.seed);
    Object.assign(state,{questionIndex:0,score:0,energy:5,integrity:0,xp:0,sectorProgress:[0,0,0,0],answers:[],hints:0,startedAt:new Date(),endedAt:null,disqualified:false,completed:false,phase:'flight',phaseBeforePause:'flight',currentChallenge:null,blackHoleIndex:0,projectiles:[],mathShot:null,rewind:null,lastShotAt:0,world:1,worldStage:'asteroids',lifesaverFlags:{},lifesaverSerial:0});
    state.stats={asteroidHits:0,asteroidsAvoided:0,asteroidsShot:0,brownDestroyed:0,smallDestroyed:0,mediumDestroyed:0,largeDestroyed:0,shotsFired:0,blackHolesEntered:0,blackHoleSuccess:0,blackHoleFails:0,asteroidPenalty:0,blackHolePenalty:0,brownAsteroidHits:0,brownPenalty:0,questionAsteroidsSpawned:0,blueCorrect:0,blueWrong:0,maxAsteroids:0,distance:0,livesLost:0,rewinds:0,enemiesDestroyed:0,enemyDamage:0,enemyShots:0,lifesavers:0,lifesaverCorrect:0,bossFormsDefeated:0,bossDefeated:false,combatScore:0};
    document.body.classList.add('playing');els.boot.hidden=true;els.game.hidden=false;buildSectorDots();resizeAll();renderQuestion();animate(performance.now());saveProgress();
  }

  function showHow(){
    showModal('Cómo jugar',`<ol>
      <li><b>Cuatro mundos:</b> cada sector comienza con un campo muy poblado. Pilota con flechas/WASD y dispara con Espacio, clic o el botón Fuego.</li>
      <li><b>Asteroides cafés:</b> aparecen en tamaños pequeño, mediano y grande; requieren 1, 2 o 4 impactos. Debes dispararles antes de que golpeen la nave. Cada choque descuenta <b>0.01</b> de la nota.</li>
      <li><b>Asteroides azules:</b> el campo mantiene decenas de asteroides de pregunta simultáneos y contiene pruebas del corte 1. Al colisionar aparece una pregunta: acertar suma <b>0.05</b>; equivocarse resta <b>0.05</b> y quita una vida.</li>
      <li><b>Pista, retroalimentación y continuación:</b> todas las preguntas incluyen pista. Después de responder se muestra la explicación completa y debes pulsar <b>Continuar en la nave</b> para regresar al vuelo.</li>
      <li><b>Fin de mundo:</b> al completar seis pruebas aparecen interceptores. Cada nave destruida suma <b>0.02</b>.</li>
      <li><b>Salvavidas y jefe final:</b> al llegar a media vida aparecen dos retos complejos; luego debes derrotar las cuatro transformaciones de la Nave Núcleo Omega.</li>
    </ol><p><b>Contenido:</b> vectores, matrices, determinantes, sistemas lineales y Gauss–Jordan, únicamente del corte 1.</p>`);
  }

  function renderQuestion(){
    if(state.completed)return;
    if(state.questionIndex>=questions.length){
      if(state.space?.stage==='enemies'||state.space?.stage==='boss')return;
      if(!state.stats.bossDefeated)startFinalBoss();
      return;
    }
    const q=questions[state.questionIndex],sec=q.sector;selected=null;answerLocked=true;q._hintUsed=false;q._attempts=0;
    state.world=sec;state.worldStage='asteroids';
    els.sectorNumber.textContent=`MUNDO ${sec}`;els.sectorName.textContent=sectorNames[sec-1];els.qCount.textContent=`PRUEBA ${state.questionIndex+1} / ${questions.length}`;els.qBadge.textContent=q.badge;renderProgress();updateHUD();
    if(!state.space||state.space.sector!==sec)initSpace(sec,true);else state.space.stage='asteroids';
    activateFlight('CAMPO DE ASTEROIDES');
  }

  function initSpace(sector,resetShip){
    const now=performance.now();state.space={sector,stage:'asteroids',route:0,zone:'dense',safeUntil:0,asteroids:[],blackHoles:[],enemies:[],projectiles:[],enemyProjectiles:[],explosions:[],scorePopups:[],spawnAccumulator:0,blackHoleAt:now+7200+Math.random()*3500,nextCoreAt:now+2200,invulnerableUntil:now+3000,flashUntil:0,transitionStart:0,lastW:1,lastH:1,checkpointRoute:0,checkpointAt:now,shieldToastAt:0,muzzleUntil:0,waveCleared:false,boss:null};
    if(resetShip){state.drone.x=0;state.drone.y=0;state.drone.vx=0;state.drone.vy=0;state.drone.tilt=0;}seedAsteroids(76+sector*8);
  }

  function activateFlight(message){
    const q=questions[state.questionIndex];if(state.completed||!state.space)return;
    state.phase='flight';state.worldStage='asteroids';state.space.stage='asteroids';state.currentChallenge=null;state.mathShot=null;state.rewind=null;answerLocked=true;selected=null;pendingContinueAction=null;if(els.continue){els.continue.hidden=true;els.continue.disabled=true;}
    hideQuestionPanel();bossHud.hidden=true;els.flightHud.hidden=false;els.arrivalChip.hidden=true;els.challengeRibbon.hidden=true;
    els.hint.disabled=true;els.submit.disabled=true;els.qBody.innerHTML='';els.answers.innerHTML='';els.mini.hidden=true;mctx.clearRect(0,0,els.mini.width,els.mini.height);
    els.flightTitle.textContent=message||'CAMPO DE ASTEROIDES';
    els.flightTarget.textContent=`PRUEBAS ${state.sectorProgress[state.space.sector-1]||0}/6`;
    els.instruction.textContent='Azules: pregunta +0.05/−0.05 · Cafés: dispara para evitar −0.01.';
    requestAnimationFrame(()=>{resizeAll();setTimeout(resizeAll,220);});saveProgress();
  }

  function hideQuestionPanel(){
    els.gameLayout.classList.add('flight-mode');els.gameLayout.classList.remove('challenge-open');
    questionPanel.classList.remove('blackhole-message','asteroid-message','lifesaver-message');
  }

  function fireLaser(){
    if(!ACTIVE_COMBAT_PHASES.includes(state.phase)||state.completed||!state.space)return;
    const now=performance.now(),boosted=now<(state.weaponBoostUntil||0),cooldown=boosted?(state.phase==='boss'?85:95):(state.phase==='boss'?130:155);if(now-(state.lastShotAt||0)<cooldown)return;
    state.lastShotAt=now;state.space.muzzleUntil=now+105;state.stats.shotsFired++;
    const w=state.space.lastW||1,h=state.space.lastH||1,sx=(w/2+state.drone.x)/w,sy=(h*.78+state.drone.y)/h;
    const spread=state.phase==='boss'?.014:.011;const power=boosted?2:1;const volley=boosted?[-spread*1.8,0,spread*1.8]:[-spread,spread];volley.forEach(dx=>state.space.projectiles.push({x:sx+dx,y:sy-.025,vx:0,vy:-1.42,life:1.35,dead:false,damage:power}));
    beep(960,.04);updateCombatHud(now);
  }

  function updateCombatHud(now=performance.now()){
    const cooldown=state.phase==='boss'?130:155,left=Math.max(0,cooldown-(now-(state.lastShotAt||0))),ready=left<=0;
    laserText&&(laserText.textContent=(now<(state.weaponBoostUntil||0))?(ready?'LÁSER POTENCIADO':'POTENCIA '+Math.ceil(Math.max(0,(state.weaponBoostUntil-now))/1000)+' s'):(ready?'LÁSER LISTO':`RECARGA ${Math.ceil(left)} ms`));
    laserCooldownFill&&(laserCooldownFill.style.transform=`scaleX(${ready?1:Math.max(0,1-left/cooldown)})`);
    const stage=state.space?.stage;
    if(stage==='asteroids'){
      destroyedText&&(destroyedText.textContent='');
      phaseText&&(phaseText.textContent=state.space?.blackHoles?.length?'PORTAL ACTIVO':'');
      enemyText&&(enemyText.textContent='');
    }else if(stage==='enemies'){
      destroyedText&&(destroyedText.textContent='');
      phaseText&&(phaseText.textContent='');
      enemyText&&(enemyText.textContent='');
    }else if(stage==='boss'){
      destroyedText&&(destroyedText.textContent='');
      phaseText&&(phaseText.textContent='');
      enemyText&&(enemyText.textContent='');
    }
  }

  function moveDrone(dir){
    if(!ACTIVE_COMBAT_PHASES.includes(state.phase)||state.completed)return;const n=165;
    if(dir==='left')state.drone.vx-=n;if(dir==='right')state.drone.vx+=n;if(dir==='up')state.drone.vy-=n*.72;if(dir==='down')state.drone.vy+=n*.72;beep(330,.022);
  }

  function updateShipPhysics(w,h,dt,damping){
    const active=ACTIVE_COMBAT_PHASES.includes(state.phase);if(active){const a=390;if(held.left)state.drone.vx-=a*dt;if(held.right)state.drone.vx+=a*dt;if(held.up)state.drone.vy-=a*.72*dt;if(held.down)state.drone.vy+=a*.72*dt;}
    state.drone.x+=state.drone.vx*dt;state.drone.y+=state.drone.vy*dt;state.drone.vx*=Math.pow(damping,dt*7);state.drone.vy*=Math.pow(damping,dt*7);
    state.drone.x=Math.max(-w*.43,Math.min(w*.43,state.drone.x));state.drone.y=Math.max(-h*.30,Math.min(h*.10,state.drone.y));
    state.drone.tilt+=(Math.max(-.48,Math.min(.48,state.drone.vx/260))-state.drone.tilt)*Math.min(1,dt*9);
  }

  function triggerCollision(kind,obj){
    if(state.phase!=='flight'||state.completed||performance.now()<(state.space?.invulnerableUntil||0))return;
    const s=state.space;s.flashUntil=performance.now()+520;
    const portalPool=blackHoleQuestions.filter(x=>x.sector===s.sector),challengeQ=kind==='asteroid'?questions[state.questionIndex]:portalPool[state.blackHoleIndex%portalPool.length];
    state.currentChallenge={kind,objectId:obj.id,q:challengeQ,snapshot:{route:s.route,drone:{...state.drone},sector:s.sector,checkpointRoute:s.checkpointRoute}};
    if(kind==='asteroid'){state.stats.asteroidHits++;els.arrivalChip.textContent='COLISIÓN · TRANSMISIÓN ENTRANTE';beep(150,.22);}else{state.stats.blackHolesEntered++;els.arrivalChip.textContent='HORIZONTE DE EVENTOS · RETO AVANZADO';beep(90,.38);}
    state.phase='impact';els.arrivalChip.className='arrival-chip';els.arrivalChip.hidden=false;spawnBurst('bad');setTimeout(()=>{els.arrivalChip.hidden=true;revealChallenge();},430);
  }

  function shouldShowMini(q){return !!q?.visual&&['vectors','projection','systemLines','gauss','matrixMultiply','matrixAdd','matrixScale','transpose','determinant','augmented','matrixType'].includes(q.visual.kind);}

  async function revealChallenge(){
    const ch=state.currentChallenge,q=ch?.q;if(!q||state.completed)return;selected=null;answerLocked=true;q._hintUsed=false;q._attempts=0;pendingContinueAction=null;if(els.continue){els.continue.hidden=true;els.continue.disabled=true;}
    const sec=ch.kind==='lifesaver'?(ch.sector||state.space?.sector||4):(questions[state.questionIndex]?.sector||q.sector);
    els.sectorNumber.textContent=`MUNDO ${sec}`;els.sectorName.textContent=sectorNames[sec-1];
    if(ch.kind==='bossgate'){
      const penalty=ch.sector>=sectorNames.length?.15:.10;
      if(correct){const reward=.05;state.score=clampScore(state.score+reward);state.weaponBoostUntil=performance.now()+20000;state.xp+=160;state.answers.push(recordAnswer(q,true,value,reward,'Cálculo del jefe'));setFeedback(`<b>Cálculo correcto.</b> El escudo del jefe se abre y tu arma queda potenciada durante veinte segundos.<br>${q.explanation}`,'good');markOptions(q,true,value);beep(980,.24);updateHUD();saveProgress();offerContinue(()=>resumeBossGate(ch.resumePhase),'CONTINUAR AL COMBATE CON ARMA POTENCIADA');}
      else{state.score=clampScore(state.score-penalty);state.energy=Math.max(0,state.energy-1);state.stats.livesLost++;state.answers.push(recordAnswer(q,false,value,-penalty,'Cálculo del jefe'));setFeedback(`<b>Resultado incorrecto: −${penalty.toFixed(2)} y −1 vida.</b> Revisa la retroalimentación y resuelve otro cálculo del jefe.<br>${q.explanation}`,'bad');markOptions(q,false,value);beep(120,.28);updateHUD();saveProgress();offerContinue(()=>retryBossGate(),'INTENTAR OTRO CÁLCULO DEL JEFE');}return;
    }
    if(ch.kind==='lifesaver'){
      els.qCount.textContent=`SALVAVIDAS · RETO ${ch.index+1} / 2`;els.qBadge.textContent='CADA ACIERTO RECUPERA VIDA';messageKind&&(messageKind.textContent='SALVAVIDAS');
    }else if(ch.kind==='blackhole'){
      els.qCount.textContent='PORTAL · RETO AVANZADO';els.qBadge.textContent='ERROR: PENALIZACIÓN Y PÉRDIDA DE 2 VIDAS';messageKind&&(messageKind.textContent='AGUJERO NEGRO');
    }else{
      els.qCount.textContent=`ASTEROIDE AZUL · PRUEBA ${state.questionIndex+1}/${questions.length}`;els.qBadge.textContent='ACIERTA: SUMA PUNTOS · ERROR: RESTA PUNTOS Y PIERDES 1 VIDA';messageKind&&(messageKind.textContent='ASTEROIDE AZUL');
    }
    questionPanel.classList.toggle('blackhole-message',ch.kind==='blackhole');questionPanel.classList.toggle('asteroid-message',ch.kind==='asteroid');questionPanel.classList.toggle('lifesaver-message',ch.kind==='lifesaver');questionPanel.classList.toggle('boss-message',ch.kind==='bossgate');
    els.instruction.textContent=ch.kind==='bossgate'?'Realiza el cálculo del jefe. Un acierto potencia el arma durante 20 segundos.':ch.kind==='lifesaver'?'Responde las dos pruebas complejas para recuperar el blindaje.':ch.kind==='blackhole'?'Autoriza el salto gravitacional.':'Una respuesta correcta activa el disparo automático contra el obstáculo de pregunta.';
    els.qBody.innerHTML=`<span class="question-prompt-label">ENUNCIADO</span><div class="question-prompt-content">${q.prompt}</div>`;
    questionPanel.scrollTop=0;
    renderOptions(q);els.answers.classList.toggle('two-column',q.type==='tf'||q.type==='roman'||(q.options&&q.options.every(o=>stripHtml(o.html).length<44)));
    els.mini.hidden=!shouldShowMini(q);setFeedback(ch.kind==='bossgate'?'El jefe ha activado un escudo matemático. Debes calcular; las preguntas de jefe no repiten las pruebas de los asteroides.':ch.kind==='lifesaver'?`Blindaje al ${state.energy.toFixed(1)}/5. Usa la pista si la necesitas; cada acierto restaura 1.25 de vida.`:ch.kind==='blackhole'?'El portal espera autorización matemática. Puedes consultar la pista antes de responder.':(sec>=5?'Cometa rojo detectado. Todos los cometas del nivel final contienen una prueba.':'Asteroide azul detectado. Consulta la pista si la necesitas y responde para activar el disparo matemático.'),'neutral');
    await typeset();if(state.completed)return;
    questionPanel.scrollTop=0;
    state.phase='question';questionStart=Date.now();els.gameLayout.classList.remove('flight-mode');els.gameLayout.classList.add('challenge-open');els.flightHud.hidden=true;answerLocked=false;els.submit.disabled=false;els.hint.disabled=false;
    requestAnimationFrame(()=>{
      questionPanel.scrollTop=0;resizeAll();if(!els.mini.hidden)drawMini(q,performance.now());
      setTimeout(()=>{questionPanel.scrollTop=0;resizeAll();if(!els.mini.hidden)drawMini(q,performance.now());},300);
    });saveProgress();
  }

  function offerContinue(action,label='CONTINUAR EN LA NAVE'){
    pendingContinueAction=action;if(!els.continue)return;els.continue.textContent=`🚀 ${label}`;els.continue.hidden=false;els.continue.disabled=false;
    requestAnimationFrame(()=>{try{els.continue.focus({preventScroll:true});}catch(_e){}});
  }
  function continueAfterFeedback(){if(!pendingContinueAction)return;const action=pendingContinueAction;pendingContinueAction=null;if(els.continue){els.continue.disabled=true;els.continue.hidden=true;}action();}

  function isCorrectAnswer(q,value){if(q.type==='numeric')return Math.abs(value-q.answerValue)<(q.answerTolerance??1e-9);if(q.type==='tf')return value===q.answer;return Number(value)===q.answer;}

  function submitAnswer(){
    if(answerLocked)return;const ch=state.currentChallenge,q=ch?.q;if(!q)return;let value=selected;
    if(q.type==='numeric'){const inp=$('#numericAnswer');if(!inp||inp.value===''){toast('Escribe una respuesta numérica.');return;}value=Number(inp.value);}if(value===null){toast('Selecciona una respuesta.');return;}
    q._attempts++;const correct=isCorrectAnswer(q,value);answerLocked=true;els.submit.disabled=true;els.hint.disabled=true;
    if(ch.kind==='bossgate'){
      const isFinalBoss=ch.resumePhase==='boss',reward=isFinalBoss?(state.grading?.finalGateValue||.05):(state.grading?.fleetGateValue||.02),penalty=Math.min(isFinalBoss?.15:.10,Math.max(.02,reward*.5));
      if(correct){
        state.score=clampScore(state.score+reward);state.weaponBoostUntil=performance.now()+20000;state.xp+=160;
        state.answers.push(recordAnswer(q,true,value,reward,isFinalBoss?'Cálculo de la nave final':'Cálculo de escuadra'));
        setFeedback(`<b>Cálculo correcto.</b> El escudo matemático se abre y tu arma queda potenciada durante veinte segundos.<br>${q.explanation}`,'good');markOptions(q,true,value);beep(980,.24);updateHUD();saveProgress();
        offerContinue(()=>resumeBossGate(ch.resumePhase),'CONTINUAR AL COMBATE CON ARMA POTENCIADA');
      }else{
        state.score=clampScore(state.score-penalty);state.energy=Math.max(0,state.energy-1);state.stats.livesLost++;
        state.answers.push(recordAnswer(q,false,value,-penalty,isFinalBoss?'Cálculo de la nave final':'Cálculo de escuadra'));
        setFeedback(`<b>Resultado incorrecto: −${penalty.toFixed(2)} y −1 vida.</b> El jefe cambia los parámetros; deberás resolver otro cálculo.<br>${q.explanation}`,'bad');markOptions(q,false,value);beep(120,.28);updateHUD();saveProgress();
        offerContinue(()=>retryBossGate(),'INTENTAR OTRO CÁLCULO DEL JEFE');
      }return;
    }
    if(ch.kind==='lifesaver'){
      const recovered=correct?1.25:0;if(correct){state.energy=Math.min(5,state.energy+recovered);state.stats.lifesaverCorrect++;if(ch.resumePhase==='boss'||ch.resumePhase==='enemy-wave'){state.weaponBoostUntil=performance.now()+20000;els.arrivalChip.textContent='ARMA POTENCIADA · 20 SEGUNDOS';els.arrivalChip.className='arrival-chip weapon';els.arrivalChip.hidden=false;setTimeout(()=>els.arrivalChip.hidden=true,900);}addScoreFloat(`VIDA +${recovered.toFixed(2)}`,.5,.44,'life');setFeedback(`<b>Correcto.</b> Recuperas ${recovered.toFixed(2)} de vida y el arma queda potenciada por 20 segundos.<br>${q.explanation}`,'good');beep(820,.16);}else{setFeedback(`<b>Respuesta incorrecta.</b> No recuperas vida en este reto.<br>${q.explanation}`,'bad');beep(170,.2);}
      state.answers.push(recordAnswer(q,correct,value,0,'Pregunta salvavidas'));markOptions(q,correct,value);updateHUD();saveProgress();offerContinue(()=>advanceLifesaver(),ch.index<1?'CONTINUAR A LA SEGUNDA PREGUNTA':'CONTINUAR EL COMBATE');return;
    }
    if(ch.kind==='asteroid'){
      const finalComet=(ch.sector||q.sector)>=sectorNames.length,eventName=finalComet?'Cometa rojo':'Asteroide azul';
      if(correct){const reward=mainQuestionReward(q);state.score=clampScore(state.score+reward);state.xp+=q._hintUsed?70:90;state.sectorProgress[q.sector-1]++;state.stats.blueCorrect=(state.stats.blueCorrect||0)+1;state.answers.push(recordAnswer(q,true,value,reward,eventName));setFeedback(`<b>Respuesta correcta.</b> ${q._hintUsed?'La pista redujo la recompensa de esta prueba. ':''}El sistema autoriza el disparo matemático.<br>${q.explanation}`,'good');markOptions(q,true,value);beep(760,.14);updateHUD();saveProgress();offerContinue(()=>resolveAsteroid(true),finalComet?'CONTINUAR Y DESTRUIR EL COMETA':'CONTINUAR Y DESTRUIR EL ASTEROIDE');}
      else{const penalty=mainQuestionPenalty(q);state.score=clampScore(state.score-penalty);state.energy=Math.max(0,state.energy-1);state.stats.livesLost++;state.stats.asteroidPenalty+=penalty;state.stats.blueWrong=(state.stats.blueWrong||0)+1;state.answers.push(recordAnswer(q,false,value,-penalty,eventName));setFeedback(`<b>Respuesta incorrecta: −${penalty.toFixed(2)} y −1 vida.</b> La nave regresará al último tramo seguro y la prueba seguirá pendiente.<br>${q.explanation}`,'bad');markOptions(q,false,value);beep(165,.22);updateHUD();saveProgress();offerContinue(()=>resolveAsteroid(false),'CONTINUAR Y REGRESAR A LA NAVE');}
    }else{
      if(correct){const reward=0;state.xp+=120;state.stats.blackHoleSuccess++;state.answers.push(recordAnswer(q,true,value,reward,'Agujero negro'));setFeedback(`<b>Salto autorizado.</b> El portal ofrece una ventaja de navegación, pero no altera la ponderación académica definida por los temas.<br>${q.explanation}`,'good');markOptions(q,true,value);beep(980,.24);updateHUD();saveProgress();offerContinue(()=>resolveBlackHole(true),'CONTINUAR AL CORREDOR SEGURO');}
      else{const penalty=.20;state.score=clampScore(state.score-penalty);state.energy=Math.max(0,state.energy-2);state.stats.livesLost+=2;state.stats.blackHolePenalty+=penalty;state.stats.blackHoleFails++;state.answers.push(recordAnswer(q,false,value,-penalty,'Agujero negro'));setFeedback(`<b>Secuencia rechazada: −0.20 y −2 vidas.</b> Regresarás al campo denso.<br>${q.explanation}`,'bad');markOptions(q,false,value);beep(95,.36);updateHUD();saveProgress();offerContinue(()=>resolveBlackHole(false),'CONTINUAR Y VOLVER AL CAMPO DENSO');}
    }
    if(state.energy<=0){state.energy=2;state.stats.rewinds++;setFeedback(`${els.feedbackText.innerHTML}<br><b>Rescate automático:</b> el blindaje quedará en 2 vidas al regresar.`,'bad');updateHUD();}
  }

  function triggerBossGate(sector,resumePhase,bossLabel){
    const pool=resumePhase==='boss'?bossQuestions:bossQuestions.filter(q=>q.sector===sector);if(!pool.length){state.phase=resumePhase;return;}
    state.bossQuestionSerial=(state.bossQuestionSerial||0)+1;const q=cloneQuestion(pool[(state.bossQuestionSerial-1)%pool.length]);
    state.currentChallenge={kind:'bossgate',sector,resumePhase,bossLabel,q};state.phase='impact';answerLocked=true;
    els.arrivalChip.textContent=bossLabel||`NIVEL ${sector} · ESCUDO MATEMÁTICO`;els.arrivalChip.className='arrival-chip boss-alert';els.arrivalChip.hidden=false;beep(410,.35);
    setTimeout(()=>{els.arrivalChip.hidden=true;revealChallenge();},520);
  }
  function retryBossGate(){
    const ch=state.currentChallenge;if(!ch||ch.kind!=='bossgate')return;const pool=ch.resumePhase==='boss'?bossQuestions:bossQuestions.filter(q=>q.sector===ch.sector);state.bossQuestionSerial=(state.bossQuestionSerial||0)+1;ch.q=cloneQuestion(pool[(state.bossQuestionSerial-1)%pool.length]);selected=null;answerLocked=true;revealChallenge();
  }
  function resumeBossGate(resumePhase){
    state.currentChallenge=null;hideChallengeForAction();state.space.invulnerableUntil=performance.now()+2200;state.phase=resumePhase;state.worldStage=resumePhase==='boss'?'boss':'enemies';els.flightHud.hidden=false;els.arrivalChip.textContent='ARMA POTENCIADA · 20 SEGUNDOS';els.arrivalChip.className='arrival-chip weapon';els.arrivalChip.hidden=false;setTimeout(()=>els.arrivalChip.hidden=true,1000);updateHUD();
  }

  function advanceLifesaver(){
    const ch=state.currentChallenge;if(!ch||ch.kind!=='lifesaver')return;
    if(ch.index<1){ch.index++;ch.q=ch.questions[ch.index];selected=null;answerLocked=true;revealChallenge();return;}
    const resume=ch.resumePhase;state.currentChallenge=null;hideChallengeForAction();state.space.invulnerableUntil=performance.now()+2300;state.phase=resume;state.worldStage=resume==='boss'?'boss':'enemies';
    els.flightHud.hidden=false;els.flightTitle.textContent='SALVAVIDAS COMPLETADO · COMBATE REANUDADO';els.flightTarget.textContent=`Blindaje disponible: ${state.energy.toFixed(1)}/5`;els.instruction.textContent='Continúa pilotando y destruye las naves enemigas.';updateHUD();
  }

  function triggerLifesaver(resumePhase){
    if(state.currentChallenge||state.completed)return;const sector=state.space?.sector||4,form=resumePhase==='boss'?(state.space?.boss?.form||1):0,key=`${sector}:${resumePhase}:${form}`;
    if(state.lifesaverFlags[key])return;state.lifesaverFlags[key]=true;state.lifesaverSerial++;state.stats.lifesavers++;
    const pool=(resumePhase==='boss'?bossQuestions:blackHoleQuestions).filter(q=>q.sector===sector);if(!pool.length)return;const first=cloneQuestion(pool[(state.stats.lifesavers-1)%pool.length]),second=cloneQuestion(pool[(state.stats.lifesavers)%pool.length]);
    state.currentChallenge={kind:'lifesaver',sector,resumePhase,index:0,questions:[first,second],q:first,correct:0};state.phase='impact';
    els.arrivalChip.textContent='BLINDAJE AL 50% · PROTOCOLO SALVAVIDAS';els.arrivalChip.className='arrival-chip weapon';els.arrivalChip.hidden=false;beep(520,.3);
    setTimeout(()=>{els.arrivalChip.hidden=true;revealChallenge();},520);
  }

  function hideChallengeForAction(){pendingContinueAction=null;if(els.continue){els.continue.hidden=true;els.continue.disabled=true;}hideQuestionPanel();els.flightHud.hidden=false;els.challengeRibbon.hidden=true;els.qBody.innerHTML='';els.answers.innerHTML='';els.mini.hidden=true;requestAnimationFrame(resizeAll);}

  function finishMathShot(){
    const shot=state.mathShot,ch=state.currentChallenge,s=state.space;if(!shot||shot.done||!ch||!s)return;shot.done=true;
    const target=s.asteroids.find(a=>a.id===shot.targetId);if(target){addExplosion(target.x,target.y,target.r,'math');addScoreFloat('ASTEROIDE AZUL DESTRUIDO',target.x,target.y,'life');}
    s.asteroids=s.asteroids.filter(a=>a.id!==shot.targetId);state.stats.asteroidsShot++;state.stats.asteroidsMath=(state.stats.asteroidsMath||0)+1;restoreCollisionPoint(shot.snapshot);s.invulnerableUntil=performance.now()+1900;s.nextCoreAt=performance.now()+2200;
    const completedSector=questions[state.questionIndex]?.sector;state.questionIndex++;state.currentChallenge=null;state.mathShot=null;
    if(state.sectorProgress[completedSector-1]>=worldTarget(completedSector)){startEnemyWave(completedSector);return;}
    activateFlight('ASTEROIDE DESTRUIDO · RUTA RESTABLECIDA');
  }

  function startEnemyWave(sector){
    const s=state.space;if(!s)return;state.world=sector;state.worldStage='enemies';state.phase='impact';s.stage='enemies';s.safeUntil=0;s.asteroids=[];s.blackHoles=[];s.projectiles=[];s.enemyProjectiles=[];s.enemies=[];s.waveCleared=false;s.invulnerableUntil=performance.now()+1700;
    const finalSector=sector>=sectorNames.length;const count=finalSector?4:2;
    s.spawnTotal=count;for(let i=0;i<count;i++)spawnEnemy(i,count,sector);
    bossHud.hidden=true;hideQuestionPanel();els.flightHud.hidden=false;els.arrivalChip.textContent=finalSector?`NIVEL 5 · ESCUADRA DE PORTALES`:`NIVEL ${sector} · NAVES ENEMIGAS`;els.arrivalChip.className='arrival-chip enemy-alert';els.arrivalChip.hidden=false;
    els.flightTitle.textContent=finalSector?'NIVEL 5 · NAVES RÁPIDAS Y ARMAS MÚLTIPLES':`NIVEL ${sector} · ESCUADRA ENEMIGA`;els.flightTarget.textContent=finalSector?'Destruye la escuadra rápida antes del combate final':'Destruye la escuadra y prepárate para asegurar la unidad del nivel';els.instruction.textContent='Cuando aciertas en un salvavidas durante el combate, tu arma queda potenciada por 20 segundos.';
    setTimeout(()=>{els.arrivalChip.hidden=true;triggerBossGate(sector,'enemy-wave',sector>=sectorNames.length?'NIVEL 5 · ESCUADRA DE PORTALES':`NIVEL ${sector} · CÁLCULO DE COMBATE`);},700);updateCombatHud();updateHUD();
  }

  function spawnEnemy(i,count,sector){
    const palettes=[{fill:'#3a1230',stroke:'#ff5aa5',core:'#ffd6f0'},{fill:'#123748',stroke:'#5cc8ff',core:'#d5f4ff'},{fill:'#173815',stroke:'#89ff71',core:'#e3ffd9'},{fill:'#4a2b11',stroke:'#ffbf52',core:'#fff0bf'},{fill:'#2d1148',stroke:'#d48cff',core:'#f2d9ff'}];
    const p=palettes[Math.min(sector-1,palettes.length-1)];
    const final=sector>=sectorNames.length;
    const slots=count===1?[.5]:count===2?[.34,.66]:count===4?[.18,.40,.62,.84]:Array.from({length:count},(_,k)=>.2+k*(.6/Math.max(1,count-1)));
    const bossLevel={id:`e${Date.now()}_${i}_${Math.random()}`,x:slots[i]??(.25+i*.2),y:-.12-i*.08,targetY:.16+(i%2)*.06,r:final?.048:.044,hp:final?3:2,maxHp:final?3:2,speed:final?.42:.27,phase:Math.random()*Math.PI*2,fireAt:performance.now()+550+Math.random()*(final?500:850),hitFlash:0,dead:false,palette:p,bossOfLevel:true,portalPhase:final,weaponMode:final?(i%2?'spread':'snipe'):'single'};
    state.space.enemies.push(bossLevel);
  }

  function startFinalBoss(){
    const s=state.space;if(!s||state.completed)return;state.world=sectorNames.length;state.worldStage='boss';state.phase='impact';s.stage='boss';s.asteroids=[];s.blackHoles=[];s.enemies=[];s.projectiles=[];s.enemyProjectiles=[];s.invulnerableUntil=performance.now()+2200;s.boss={x:.5,y:.18,r:.11,form:1,hp:BOSS_HP[0],maxHp:BOSS_HP[0],vx:.24,fireAt:performance.now()+1200,transformUntil:performance.now()+1500,hitFlash:0,dead:false};
    hideQuestionPanel();els.flightHud.hidden=false;bossHud.hidden=false;els.arrivalChip.textContent='NIVEL 5.0 · DOS JEFES FINALES';els.arrivalChip.className='arrival-chip boss-alert';els.arrivalChip.hidden=false;
    els.flightTitle.textContent='BATALLA FINAL · DOS JEFES CON PORTALES';els.flightTarget.textContent='Cada jefe tiene dos formas y se oculta mediante portales.';els.instruction.textContent='En el nivel 5.0 los jefes son más rápidos, disparan más y reaparecen por portales.';
    setTimeout(()=>{els.arrivalChip.hidden=true;triggerBossGate(sectorNames.length,'boss','JEFE FINAL ALFA · ESCUDO DE CÁLCULO');},900);updateBossHud();
  }

  function beginSectorTransition(nextSector){
    state.phase='sector-transition';state.worldStage='transition';state.currentChallenge=null;answerLocked=true;hideQuestionPanel();els.flightHud.hidden=false;bossHud.hidden=true;
    initSpace(nextSector,true);state.space.transitionStart=performance.now();state.space.stage='transition';
    els.sectorNumber.textContent=`MUNDO ${nextSector}`;els.sectorName.textContent=sectorNames[nextSector-1];els.flightTitle.textContent='MUNDO SUPERADO · SALTO INTERESTELAR';els.flightTarget.textContent=`Destino: ${sectorNames[nextSector-1]}`;els.instruction.textContent='La nave abandona el mundo y atraviesa una grieta hacia el siguiente sector.';
    setTimeout(()=>{if(!state.completed&&state.phase==='sector-transition')renderQuestion();},2400);
  }

  function animate(t){
    if(els.game.hidden)return;const dt=Math.min(.033,(t-(state.lastFrame||t))/1000);state.lastFrame=t;drawScene(questions[state.questionIndex]||questions.at(-1),t,dt);
    if(state.phase==='question'&&!els.mini.hidden)drawMini(state.currentChallenge?.q||questions[state.questionIndex],t);
    if(state.phase==='math-shot'&&state.mathShot&&t-state.mathShot.start>=state.mathShot.duration)finishMathShot();
    if(state.phase==='rewind'&&state.rewind&&t-state.rewind.start>=state.rewind.duration)finishRewind();
    updateCombatHud(t);raf=requestAnimationFrame(animate);
  }

  function drawScene(q,t,dt){
    const{w,h}=prep(els.canvas,ctx);ctx.clearRect(0,0,w,h);if(state.space){state.space.lastW=w;state.space.lastH=h;}
    if(state.phase==='paused'){drawSpaceScene(ctx,w,h,t,0,true);drawPauseVeil(ctx,w,h);return;}
    drawSpaceScene(ctx,w,h,t,dt,!ACTIVE_COMBAT_PHASES.includes(state.phase));drawParticles(ctx,w,h,dt);
  }

  function drawSpaceScene(c,w,h,t,dt,paused){
    const s=state.space;if(!s)return;const safe=t<s.safeUntil;s.zone=safe?'safe':'dense';drawDeepSpace(c,w,h,t,s,safe);
    if(state.phase==='sector-transition'){drawSectorWarp(c,w,h,t,s);return;}
    if(!paused){if(s.stage==='asteroids')updateAsteroidObjects(w,h,dt,t,safe);else if(s.stage==='enemies')updateEnemyWave(w,h,dt,t);else if(s.stage==='boss')updateBossBattle(w,h,dt,t);}
    drawSpaceLanes(c,w,h,t,safe);
    if(s.stage==='asteroids'){s.asteroids.forEach(a=>drawAsteroid(c,w,h,a,t));s.blackHoles.forEach(b=>drawBlackHole(c,w,h,b,t));}
    if(s.stage==='enemies')s.enemies.forEach(e=>drawEnemyShip(c,w,h,e,t));
    if(s.stage==='boss'&&s.boss)drawBossShip(c,w,h,s.boss,t);
    drawProjectiles(c,w,h,t);drawEnemyProjectiles(c,w,h,t);drawExplosions(c,w,h,dt);drawScorePopups(c,w,h,dt);
    updateShipPhysics(w,h,paused?0:dt,.58);const sx=w/2+state.drone.x,sy=h*.78+state.drone.y;drawShip(c,sx,sy,t,state.drone.tilt,.84);if(t<s.muzzleUntil)drawMuzzle(c,sx,sy,t);
    if(t<s.invulnerableUntil){c.strokeStyle=`rgba(80,240,210,${.35+.25*Math.sin(t/80)})`;c.lineWidth=3;c.beginPath();c.arc(sx,sy,54+Math.sin(t/100)*5,0,Math.PI*2);c.stroke();}
    if(s.flashUntil>t){const a=(s.flashUntil-t)/520;c.fillStyle=`rgba(255,75,100,${a*.34})`;c.fillRect(0,0,w,h);}
    if(state.phase==='question'||state.phase==='impact')drawCollisionMarker(c,w,h,t);if(state.phase==='math-shot')drawMathShot(c,w,h,t);if(state.phase==='rewind')drawRewind(c,w,h,t);updateFlightHud(s,safe);
  }

  function updateAsteroidObjects(w,h,dt,t,safe){
    const s=state.space,finalSector=s.sector>=5,rate=safe?.54:(finalSector?.062:Math.max(.072,.132-s.sector*.008)),speedFactor=safe?.70:(finalSector?1.28:1+s.sector*.045);s.route+=dt*190*speedFactor;state.stats.distance+=dt*190*speedFactor;s.spawnAccumulator+=dt;
    let blueCount=s.asteroids.reduce((n,a)=>n+(a.core?1:0),0);
    while(s.spawnAccumulator>rate&&s.asteroids.length<128){
      s.spawnAccumulator-=rate;
      const makeBlue=finalSector?true:(!safe&&blueCount<48&&Math.random()<.44);
      spawnAsteroid(-.12-Math.random()*.30,false,makeBlue);
      if(makeBlue)blueCount++;
    }
    if(!finalSector&&t>s.blackHoleAt)spawnBlackHole();
    if(t>s.nextCoreAt&&blueCount<(finalSector?44:30)){
      const add=Math.min(finalSector?8:6,(finalSector?44:30)-blueCount);
      for(let i=0;i<add;i++)spawnAsteroid(-.18-i*.075,false,true);
      s.nextCoreAt=t+(finalSector?1700:2300);
    }
    if(t-s.checkpointAt>5200){s.checkpointAt=t;s.checkpointRoute=s.route;}
    for(const a of s.asteroids){a.y+=a.speed*speedFactor*dt;a.x+=a.drift*dt;a.rot+=a.spin*dt;if(a.x<.02||a.x>.98)a.drift*=-1;if(a.y>1.18&&!a.passed){a.passed=true;state.stats.asteroidsAvoided++;}}
    s.asteroids=s.asteroids.filter(a=>a.y<1.25);for(const b of s.blackHoles){b.y+=b.speed*dt;b.rot+=dt*.45;}s.blackHoles=s.blackHoles.filter(b=>b.y<1.24);
    updateProjectiles(w,h,dt,t);state.stats.maxAsteroids=Math.max(state.stats.maxAsteroids,s.asteroids.length);if(t<s.invulnerableUntil)return;
    const sx=w/2+state.drone.x,sy=h*.78+state.drone.y,shipR=Math.max(20,Math.min(w,h)*.034);
    for(const a of s.asteroids){const ax=a.x*w,ay=a.y*h,ar=a.r*Math.min(w,h);if(Math.hypot(ax-sx,ay-sy)<shipR+ar*.78){if(a.core)triggerCollision('asteroid',a);else{state.score=clampScore(state.score-.01);state.stats.brownAsteroidHits=(state.stats.brownAsteroidHits||0)+1;state.stats.brownPenalty=(state.stats.brownPenalty||0)+.01;addScoreFloat('ASTEROIDE CAFÉ −0.01',a.x,a.y,'damage');a._dead=true;addExplosion(a.x,a.y,a.r,'laser');s.asteroids=s.asteroids.filter(x=>x!==a);s.invulnerableUntil=t+760;beep(145,.12);updateHUD();saveProgress();}return;}}
    for(const b of s.blackHoles){const bx=b.x*w,by=b.y*h,br=b.r*Math.min(w,h);if(Math.hypot(bx-sx,by-sy)<shipR+br*.62){triggerCollision('blackhole',b);return;}}
  }

  function updateEnemyWave(w,h,dt,t){
    const s=state.space,shipX=(w/2+state.drone.x)/w,shipY=(h*.78+state.drone.y)/h;s.route+=dt*120;state.stats.distance+=dt*120;
    for(const e of s.enemies){
      if(e.y<e.targetY)e.y+=e.speed*dt;else{const chase=(shipX-e.x)*(0.42+s.sector*.08);e.x+=chase*dt+Math.sin(t*.0015+e.phase)*.035*dt;e.y=e.targetY+Math.sin(t*.0018+e.phase)*.035;}
      if(e.portalPhase&&t>(e.portalAt||0)){e.x=.18+Math.random()*.64;e.y=.12+Math.random()*.16;e.portalAt=t+1000+Math.random()*700;e.hiddenUntil=t+220;}
      e.x=Math.max(.05,Math.min(.95,e.x));if(t>e.fireAt&&e.y>.04){spawnEnemyShot(e,shipX,shipY,false);e.fireAt=t+(e.portalPhase?420:720)+Math.random()*(e.portalPhase?320:760)-s.sector*55;}
    }
    updateProjectiles(w,h,dt,t);updateEnemyBullets(w,h,dt,t);checkEnemyCollisions(w,h,t);
    if(!s.enemies.length&&!s.waveCleared){s.waveCleared=true;if(s.sector<sectorNames.length)lockClearedLevel(s.sector);els.flightTitle.textContent=s.sector<sectorNames.length?'ESCUADRA DESTRUIDA · UNIDAD ASEGURADA':'ESCUADRA FINAL DESTRUIDA';els.flightTarget.textContent=s.sector<sectorNames.length?'Preparando el siguiente salto…':'Aparecen los dos jefes finales…';setTimeout(()=>{if(state.completed)return;if(s.sector<sectorNames.length)beginSectorTransition(s.sector+1);else startFinalBoss();},1500);}
  }

  function spawnEnemyShot(source,shipX,shipY,boss){
    const s=state.space,dx=shipX-source.x,dy=shipY-source.y,len=Math.hypot(dx,dy)||1,speed=boss?.48:(source.weaponMode==='snipe'?.55:.42);
    s.enemyProjectiles.push({x:source.x,y:source.y+(source.r||.03),vx:dx/len*speed,vy:dy/len*speed,r:boss?.007:.005,damage:boss?.75:(source.weaponMode==='snipe'?.7:.5),life:3,kind:boss?'boss':'enemy'});
    if(!boss&&source.weaponMode==='spread'){for(const off of[-.12,.12])s.enemyProjectiles.push({x:source.x,y:source.y+(source.r||.03),vx:dx/len*.22+off,vy:dy/len*.34+.04,r:.005,damage:.45,life:3,kind:'enemy'});state.stats.enemyShots+=2;}
    state.stats.enemyShots++;
  }

  function updateEnemyBullets(w,h,dt,t){
    const s=state.space,sx=(w/2+state.drone.x)/w,sy=(h*.78+state.drone.y)/h,shipR=Math.max(18,Math.min(w,h)*.031);
    for(const p of s.enemyProjectiles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;if(p.life<=0||p.x<-.05||p.x>1.05||p.y<-.08||p.y>1.1){p.dead=true;continue;}if(t<s.invulnerableUntil)continue;if(Math.hypot((p.x-sx)*w,(p.y-sy)*h)<shipR+p.r*Math.min(w,h)){p.dead=true;damagePlayer(p.damage,p.kind==='boss'?'Disparo de Omega':'Disparo interceptor');}}
    s.enemyProjectiles=s.enemyProjectiles.filter(p=>!p.dead);
  }

  function checkEnemyCollisions(w,h,t){
    const s=state.space;if(t<s.invulnerableUntil)return;const sx=(w/2+state.drone.x)/w,sy=(h*.78+state.drone.y)/h;
    for(const e of s.enemies){if(Math.hypot((e.x-sx)*w,(e.y-sy)*h)<(e.r+.032)*Math.min(w,h)){damagePlayer(1,'Colisión con interceptor');e.dead=true;addExplosion(e.x,e.y,e.r,'laser');s.enemies=s.enemies.filter(x=>x!==e);return;}}
  }

  function updateBossBattle(w,h,dt,t){
    const s=state.space,b=s.boss;if(!b||b.dead)return;const shipX=(w/2+state.drone.x)/w,shipY=(h*.78+state.drone.y)/h;
    if(t>b.transformUntil){b.x+=b.vx*dt*(1+(b.form-1)*.22);if(b.x<.12||b.x>.88){b.vx*=-1;b.x=Math.max(.12,Math.min(.88,b.x));}b.y=.15+Math.sin(t*.0014*b.form)*(.025+.008*b.form);if(b.form>=3&&t>(b.portalAt||0)){b.x=.18+Math.random()*.64;b.y=.12+Math.random()*.18;b.portalAt=t+1200+Math.random()*800;b.hiddenUntil=t+240;}if(t>b.fireAt){spawnBossPattern(b,shipX,shipY);b.fireAt=t+Math.max(280,820-b.form*140);}}
    updateProjectiles(w,h,dt,t);updateEnemyBullets(w,h,dt,t);if(t>s.invulnerableUntil&&Math.hypot((b.x-shipX)*w,(b.y-shipY)*h)<(b.r+.034)*Math.min(w,h)){damagePlayer(1.25,'Embestida de Omega');s.invulnerableUntil=t+1700;}
  }

  function spawnBossPattern(b,shipX,shipY){
    const s=state.space;spawnEnemyShot(b,shipX,shipY,true);
    const count=b.form+1,spread=.10+.025*b.form;for(let i=0;i<count;i++){const offset=(i-(count-1)/2)*spread;s.enemyProjectiles.push({x:b.x,y:b.y+b.r*.55,vx:offset,vy:.38+.035*b.form,r:.0065,damage:.55+.05*b.form,life:3.2,kind:'boss'});}state.stats.enemyShots+=count;
  }

  function updateProjectiles(w,h,dt,t){
    const s=state.space;if(!s)return;
    for(const p of s.projectiles){p.x+=(p.vx||0)*dt;p.y+=(p.vy||-1.3)*dt;p.life-=dt;if(p.y<-.08||p.life<=0){p.dead=true;continue;}
      if(s.stage==='asteroids')for(const a of s.asteroids){if(a._dead)continue;if(Math.hypot((p.x-a.x)*w,(p.y-a.y)*h)<a.r*Math.min(w,h)*.9+5){p.dead=true;a.hitFlash=t+130;if(a.core){addExplosion(a.x,a.y,a.r*.45,'shield');if(t>s.shieldToastAt){toast('Núcleo cifrado: colisiónalo para abrir la prueba.');s.shieldToastAt=t+1800;}}else{a.hp--;addExplosion(a.x,a.y,a.r*.38,'laser');if(a.hp<=0)destroyAsteroidByLaser(a);}break;}}
      if(p.dead)continue;
      if(s.stage==='enemies')for(const e of s.enemies){if(e.dead)continue;if(Math.hypot((p.x-e.x)*w,(p.y-e.y)*h)<(e.r+.006)*Math.min(w,h)){p.dead=true;e.hp--;e.hitFlash=t+120;addExplosion(e.x,e.y,e.r*.32,'laser');if(e.hp<=0)destroyEnemy(e);break;}}
      if(p.dead)continue;
      if(s.stage==='boss'&&s.boss&&!s.boss.dead&&t>s.boss.transformUntil){const b=s.boss;if(Math.hypot((p.x-b.x)*w,(p.y-b.y)*h)<(b.r+.008)*Math.min(w,h)){p.dead=true;b.hp-=p.damage||1;b.hitFlash=t+100;addExplosion(p.x,p.y,.012,'laser');if(b.hp<=0)defeatBossForm();updateBossHud();}}
    }
    s.projectiles=s.projectiles.filter(p=>!p.dead);
  }

  function destroyAsteroidByLaser(a){
    const s=state.space;if(!s||a._dead)return;a._dead=true;state.stats.asteroidsShot++;state.stats.brownDestroyed=(state.stats.brownDestroyed||0)+1;if(a.size==='small')state.stats.smallDestroyed++;if(a.size==='medium')state.stats.mediumDestroyed++;if(a.size==='large')state.stats.largeDestroyed++;state.xp+=a.size==='large'?12:a.size==='medium'?7:3;
    addScoreFloat('ASTEROIDE CAFÉ DESTRUIDO',a.x,a.y,'');addExplosion(a.x,a.y,a.r,'laser');if(a.size==='large'){spawnAsteroid(a.y,false,false,{x:Math.max(.04,a.x-.025),drift:-.065});spawnAsteroid(a.y,false,false,{x:Math.min(.96,a.x+.025),drift:.065});}s.asteroids=s.asteroids.filter(x=>x.id!==a.id);updateHUD();
  }

  function destroyEnemy(e){
    const s=state.space;if(!s||e.dead)return;e.dead=true;state.stats.enemiesDestroyed++;state.xp+=16;const reward=state.grading?.shipValue||.02;awardCombatScore(reward,`NAVE +${formatPoints(reward)}`,e.x,e.y,'enemy');addExplosion(e.x,e.y,e.r*1.3,'laser');s.enemies=s.enemies.filter(x=>x.id!==e.id);updateHUD();
  }

  function defeatBossForm(){
    const s=state.space,b=s?.boss;if(!b||b.dead)return;state.stats.bossFormsDefeated++;const formReward=state.grading?.bossFormValue||.10;awardCombatScore(formReward,`FORMA FINAL +${formReward.toFixed(2)}`,b.x,b.y,'life');addExplosion(b.x,b.y,b.r*1.4,'math');
    if(b.form<4){b.form++;b.maxHp=BOSS_HP[b.form-1];b.hp=b.maxHp;b.r=.11+.012*(b.form-1);b.transformUntil=performance.now()+1900;b.vx=(b.vx<0?-1:1)*(.30+.07*b.form);s.enemyProjectiles=[];s.invulnerableUntil=performance.now()+1800;els.arrivalChip.textContent=b.form===3?'JEFE BETA EMERGE POR PORTAL':`REGENERACIÓN · FASE ${b.form}/4`;els.arrivalChip.className='arrival-chip boss-alert';els.arrivalChip.hidden=false;setTimeout(()=>{els.arrivalChip.hidden=true;const labels={2:'JEFE FINAL ALFA · SEGUNDO CÁLCULO',3:'JEFE FINAL BETA · PRIMER CÁLCULO',4:'JEFE FINAL BETA · SEGUNDO CÁLCULO'};triggerBossGate(sectorNames.length,'boss',labels[b.form]||`JEFE FINAL · CÁLCULO FASE ${b.form}`);},900);beep(210+b.form*110,.3);updateBossHud();return;}
    b.dead=true;state.stats.bossDefeated=true;s.enemyProjectiles=[];bossHud.hidden=true;state.phase='victory';lockClearedLevel(sectorNames.length);els.flightTitle.textContent='NÚCLEO OMEGA DESTRUIDO';els.flightTarget.textContent='Todos los mundos seleccionados han sido liberados.';els.instruction.textContent='Misión completada. Preparando el informe y el envío SCORM.';beep(1040,.45);setTimeout(()=>finishMission(false),1700);
  }

  function damagePlayer(amount,source){
    if(state.completed||!state.space)return;state.energy=Math.max(0,state.energy-amount);state.stats.enemyDamage+=amount;state.stats.livesLost+=amount;state.space.flashUntil=performance.now()+430;state.space.invulnerableUntil=performance.now()+780;addScoreFloat(`VIDA −${amount.toFixed(2)}`,.5,.72,'damage');beep(120,.16);updateHUD();
    const combatPhase=state.space.stage==='boss'?'boss':'enemy-wave';if((state.space.stage==='enemies'||state.space.stage==='boss')&&state.energy<=2.5&&!state.currentChallenge){setTimeout(()=>{if(!state.currentChallenge&&state.energy<=2.5&&ACTIVE_COMBAT_PHASES.includes(state.phase))triggerLifesaver(combatPhase);},300);}
    if(state.energy<=0){state.score=clampScore(state.score-.20);state.energy=2;state.space.enemyProjectiles=[];state.space.invulnerableUntil=performance.now()+2200;toast(`Reinicio de emergencia por ${source}: −0.20 y 2 vidas restauradas.`);updateHUD();}
  }

  function awardCombatScore(delta,label,x=.5,y=.5,kind=''){
    state.score=clampScore(state.score+delta);state.stats.combatScore+=delta;addScoreFloat(label,x,y,kind);updateHUD();
  }

  function addScoreFloat(text,x,y,kind=''){state.space?.scorePopups.push({text,x,y,kind,life:1});}
  function drawScorePopups(c,w,h,dt){const s=state.space;if(!s)return;for(const p of s.scorePopups){p.life-=dt*.8;p.y-=dt*.055;c.save();c.globalAlpha=Math.max(0,p.life);c.textAlign='center';c.font=`bold ${Math.max(13,Math.min(22,w/48))}px Segoe UI`;c.fillStyle=p.kind==='damage'?'#ff8fa9':p.kind==='life'?'#8bffd1':'#ffe39a';c.shadowColor=c.fillStyle;c.shadowBlur=12;c.fillText(p.text,p.x*w,p.y*h);c.restore();}s.scorePopups=s.scorePopups.filter(p=>p.life>0);}

  function drawEnemyShip(c,w,h,e,t){
    if(e.hiddenUntil&&t<e.hiddenUntil)return;
    const x=e.x*w,y=e.y*h,r=e.r*Math.min(w,h),p=e.palette||{fill:'#48220a',stroke:'#ffbe4a',core:'#ff5f53'};c.save();c.translate(x,y);const hit=e.hitFlash>t;c.shadowColor=hit?'#fff2a8':p.stroke;c.shadowBlur=hit?24:14;c.fillStyle=hit?'#fff4b8':p.fill;c.strokeStyle=p.stroke;c.lineWidth=2;c.beginPath();c.moveTo(0,r);c.lineTo(-r*1.1,-r*.65);c.lineTo(-r*.35,-r*.45);c.lineTo(0,-r);c.lineTo(r*.35,-r*.45);c.lineTo(r*1.1,-r*.65);c.closePath();c.fill();c.stroke();c.fillStyle=p.core;c.beginPath();c.ellipse(0,-r*.12,r*.25,r*.35,0,0,Math.PI*2);c.fill();c.fillStyle='#ffd66d';c.fillRect(-r*.75,-r*.36,r*.24,r*.12);c.fillRect(r*.51,-r*.36,r*.24,r*.12);const W=r*1.55;c.fillStyle='rgba(1,7,15,.8)';c.fillRect(-W/2,r*1.15,W,4);c.fillStyle=p.stroke;c.fillRect(-W/2,r*1.15,W*(e.hp/e.maxHp),4);c.restore();
  }

  function drawBossShip(c,w,h,b,t){
    if(b.hiddenUntil&&t<b.hiddenUntil)return;
    const x=b.x*w,y=b.y*h,r=b.r*Math.min(w,h),form=b.form;c.save();c.translate(x,y);const pulse=.7+.3*Math.sin(t/90),hit=b.hitFlash>t;c.shadowColor=hit?'#fff':'#ff5dcb';c.shadowBlur=hit?36:24+form*4;c.rotate(Math.sin(t*.0015)*.08);
    const colors=['#4d174f','#43145e','#261a70','#5a0d35'];c.fillStyle=hit?'#fff4ff':colors[form-1];c.strokeStyle=['#ff87dd','#b975ff','#61a6ff','#ff456c'][form-1];c.lineWidth=3;c.beginPath();
    const points=8+form*2;for(let i=0;i<points;i++){const a=-Math.PI/2+i*Math.PI*2/points,rr=r*(i%2?1:.56+form*.04),px=Math.cos(a)*rr,py=Math.sin(a)*rr*.65;i?c.lineTo(px,py):c.moveTo(px,py);}c.closePath();c.fill();c.stroke();
    c.fillStyle=`rgba(255,${70+form*28},220,${pulse})`;c.beginPath();c.arc(0,0,r*.28,0,Math.PI*2);c.fill();c.strokeStyle='rgba(255,255,255,.45)';for(let i=0;i<form+1;i++){c.beginPath();c.ellipse(0,0,r*(.42+i*.13),r*(.18+i*.05),t*.0005*(i%2?1:-1),0,Math.PI*2);c.stroke();}c.restore();
  }

  function drawEnemyProjectiles(c,w,h){const s=state.space;if(!s)return;c.save();c.globalCompositeOperation='lighter';for(const p of s.enemyProjectiles){const x=p.x*w,y=p.y*h;c.fillStyle=p.kind==='boss'?'#ff5dcb':'#ffba4a';c.shadowColor=c.fillStyle;c.shadowBlur=12;c.beginPath();c.arc(x,y,Math.max(3,p.r*Math.min(w,h)),0,Math.PI*2);c.fill();}c.restore();}

  function updateBossHud(){
    const b=state.space?.boss;if(!b){bossHud.hidden=true;return;}bossHud.hidden=false;bossFormText.textContent=`JEFE FINAL · FORMA ${b.form}/4`;bossNameText.textContent=['JEFE ALFA · VECTORIAL','JEFE ALFA · MATRICIAL','JEFE BETA · DETERMINANTE','JEFE BETA · GAUSS–JORDAN'][b.form-1];const pct=Math.max(0,b.hp/b.maxHp);bossHealthFill.style.transform=`scaleX(${pct})`;bossHealthText.textContent=`${Math.ceil(pct*100)}%`;
  }

  function updateFlightHud(s,safe){
    const sectorAnswered=state.sectorProgress[s.sector-1]||0;
    const blueCount=s.asteroids?.reduce((n,a)=>n+(a.core?1:0),0)||0;
    const brownCount=Math.max(0,(s.asteroids?.length||0)-blueCount);
    if(s.stage==='asteroids'){
      const left=Math.max(0,Math.ceil((s.safeUntil-performance.now())/1000));const finalSector=s.sector>=5,target=worldTarget(s.sector);
      els.flightFill.style.width=`${Math.min(100,sectorAnswered/target*100)}%`;
      els.flightTitle.textContent=safe?'CORREDOR SEGURO':(finalSector?'CAMPO DE COMETAS':'CAMPO DE ASTEROIDES');
      els.flightTarget.textContent=`PRUEBAS ${sectorAnswered}/${target}`;
      els.densityText.textContent=safe?`SEGURO ${left}s`:`MUNDO ${s.sector}`;
      els.asteroidText.textContent=finalSector?`COMETAS ${blueCount}`:`AZULES ${blueCount}`;
      els.warpText.textContent=finalSector?'COMETAS CON FUEGO':`CAFÉS ${brownCount}`;
      destroyedText&&(destroyedText.textContent=`DESTRUIDOS ${state.stats.asteroidsShot||0}`);
      phaseText&&(phaseText.textContent=s.blackHoles.length?'PORTAL ACTIVO':'PORTAL EN BÚSQUEDA');
      enemyText&&(enemyText.textContent='');
    }
    else if(s.stage==='enemies'){
      const total=Math.max(1,s.spawnTotal||s.enemies.length),left=s.enemies.length;
      els.flightFill.style.width=`${Math.max(0,(total-left)/total*100)}%`;
      els.flightTitle.textContent=s.sector>=sectorNames.length?'NAVES RÁPIDAS':'NAVES ENEMIGAS';
      els.flightTarget.textContent=`RESTAN ${left}`;
      els.densityText.textContent=`MUNDO ${s.sector}`;
      els.asteroidText.textContent=s.sector>=sectorNames.length?'ARMAS MÚLTIPLES':'+0.02 CADA NAVE';
      els.warpText.textContent=`VIDA ${state.energy.toFixed(1)}/5`;
      destroyedText&&(destroyedText.textContent=`DESTRUIDOS ${state.stats.enemiesDestroyed||0}`);
      phaseText&&(phaseText.textContent='PERSECUCIÓN');
      enemyText&&(enemyText.textContent='');
    }
    else if(s.stage==='boss'){
      const b=s.boss;
      els.flightFill.style.width=`${b?Math.max(0,(1-b.hp/b.maxHp)*100):100}%`;
      els.flightTitle.textContent='DOS JEFES FINALES';
      els.flightTarget.textContent=b?`FORMA ${b.form}/4 · VIDA ${Math.ceil(b.hp)}/${b.maxHp}`:'NÚCLEO DESTRUIDO';
      els.densityText.textContent='NIVEL 5.0';
      els.asteroidText.textContent=`REGENERA ${Math.max(0,4-(b?.form||4))}`;
      els.warpText.textContent=`VIDA ${state.energy.toFixed(1)}/5`;
      destroyedText&&(destroyedText.textContent='');
      phaseText&&(phaseText.textContent='AMENAZA OMEGA');
      enemyText&&(enemyText.textContent='');
      updateBossHud();
    }
    updateCombatHud();
  }

  function renderEnergy(){
    els.energy.innerHTML=Array.from({length:5},(_,i)=>`<i class="${i<Math.ceil(state.energy)?'on':''}"></i>`).join('');els.energy.title=`Vida: ${state.energy.toFixed(2)} de 5`;if(lifeValue)lifeValue.textContent=`${state.energy.toFixed(1)}/5`;
  }

  function updateHUD(){
    els.score.textContent=`${state.score.toFixed(2)} / 5.00`;els.integrity.textContent=`${state.integrity} / 5`;renderEnergy();
    const level=Math.min(12,1+Math.floor(state.xp/200));els.level.textContent=level;els.xp.textContent=`${state.xp} / ${level*600}`;els.xpFill.style.width=`${Math.min(100,(state.xp%(level*600))/(level*600)*100)}%`;
    $$('#sectorDots button').forEach((b,i)=>{const target=worldTarget(i+1);b.classList.toggle('complete',state.sectorProgress[i]>=target);b.classList.toggle('active',(state.space?.sector||questions[state.questionIndex]?.sector||5)-1===i);b.title=`${sectorNames[i]}: ${state.sectorProgress[i]}/${target}`;});updateCombatHud();
  }

  function drawMiniAxes(c,ox,oy,s,w,h){
    c.save();c.font='12px Segoe UI';c.textAlign='center';c.textBaseline='middle';for(let i=-5;i<=5;i++){c.strokeStyle=i===0?'rgba(255,255,255,.9)':'rgba(120,190,255,.24)';c.lineWidth=i===0?1.8:1;c.beginPath();c.moveTo(ox+i*s,8);c.lineTo(ox+i*s,h-8);c.moveTo(8,oy+i*s);c.lineTo(w-8,oy+i*s);c.stroke();if(i!==0){c.fillStyle='#bfe7ff';c.fillText(String(i),ox+i*s,oy+14);c.fillText(String(-i),ox-15,oy+i*s);}}c.fillStyle='#fff';c.font='bold 14px Segoe UI';c.fillText('x',w-14,oy-12);c.fillText('y',ox+12,14);c.restore();
  }

  function confirmFinish(){showModal('Finalizar misión',`<p>Tu nota actual es <b>${state.score.toFixed(2)} / 5.00</b>.</p><p>Asteroides destruidos: <b>${state.stats.asteroidsShot||0}</b> · interceptores destruidos: <b>${state.stats.enemiesDestroyed||0}</b> · fases de los jefes finales derrotadas: <b>${state.stats.bossFormsDefeated||0}/4</b>.</p><p>La finalización manual enviará el resultado actual a Brightspace.</p>`,[{label:'CANCELAR',action:closeModal},{label:'FINALIZAR',action:()=>finishMission(true),primary:true}]);}

  function saveProgress(){try{const slimSpace=state.space?{sector:state.space.sector,stage:state.space.stage,route:state.space.route,zone:state.space.zone,checkpointRoute:state.space.checkpointRoute}:null;localStorage.setItem('nexoVectorialState',JSON.stringify({...state,space:slimSpace,particles:[],drone:{x:state.drone.x,y:state.drone.y,tilt:state.drone.tilt},currentChallenge:null,flight:null,mathShot:null,rewind:null}));}catch(_e){}NVScorm.saveProgress(state);}


  function openPanel(panel){
    if(panel==='mission')return;
    if(panel==='log'){
      const recent=state.answers.slice(-12).reverse().map(a=>`<tr><td>${escapeHtml(a.event||'Prueba')}</td><td>${a.id}</td><td>${a.correct?'✓':'✗'}</td><td>${a.delta>0?'+':''}${a.delta.toFixed(2)}</td><td>${a.timeSec}s</td></tr>`).join('');
      showModal('Bitácora de misión',`<table class="progress-table"><thead><tr><th>Evento</th><th>Reto</th><th>Resultado</th><th>Puntaje</th><th>Tiempo</th></tr></thead><tbody>${recent||'<tr><td colspan="5">Aún no hay eventos.</td></tr>'}</tbody></table>`);
    }
    if(panel==='progress'){
      showModal('Progreso por mundos',`<table class="progress-table"><thead><tr><th>Mundo</th><th>Pruebas</th><th>Estado</th></tr></thead><tbody>${sectorNames.map((n,i)=>`<tr><td>${i+1}. ${n}</td><td>${state.sectorProgress[i]}/${worldTarget(i+1)}</td><td>${state.sectorProgress[i]>=worldTarget(i+1)?'Campo superado':'En curso'}</td></tr>`).join('')}</tbody></table><p>Asteroides cafés destruidos: <b>${state.stats.brownDestroyed||0}</b> · impactos cafés: <b>${state.stats.brownAsteroidHits||0}</b> (−${(state.stats.brownPenalty||0).toFixed(2)})</p><p>Interceptores destruidos: <b>${state.stats.enemiesDestroyed||0}</b> (+${((state.stats.enemiesDestroyed||0)*.02).toFixed(2)})</p><p>Formas de Omega derrotadas: <b>${state.stats.bossFormsDefeated||0}/4</b> · Salvavidas activados: <b>${state.stats.lifesavers||0}</b></p><p>Nota actual: <b>${state.score.toFixed(2)} / 5.00</b></p>`);
    }
    if(panel==='help')showHow();
  }

  function downloadReport(auto){
    const end=state.endedAt||new Date(),duration=Math.max(0,Math.round((end-(state.startedAt||end))/1000));
    const rows=state.answers.map((a,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(a.event||'Prueba')}</td><td>${a.sector}</td><td>${escapeHtml(a.type)}</td><td>${a.correct?'Correcta':'Incorrecta'}</td><td>${a.delta>0?'+':''}${a.delta.toFixed(2)}</td><td>${a.hint?'Sí':'No'}</td><td>${a.timeSec}s</td></tr>`).join('');
    const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe Nexo Vectorial</title><style>body{font-family:Arial;margin:32px;color:#10233a}h1{color:#075985}.hero{background:#071b33;color:white;padding:24px;border-radius:14px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.m{border:1px solid #8bdcf4;padding:14px;border-radius:10px}.v{font-size:1.4rem;font-weight:bold;color:#075985}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ccdce7;text-align:left}th{background:#e9f8ff}.warn{background:#ffe3e9;border-left:5px solid #d61f4c;padding:12px}@media(max-width:760px){.metrics{grid-template-columns:1fr 1fr}}</style></head><body><div class="hero"><h1 style="color:white">Nexo Vectorial — Informe de misión</h1><p>Operación Matriz Cero · Mundos temáticos, interceptores y jefe final · Álgebra Lineal Corte 1</p></div>${state.disqualified?'<div class="warn"><b>Intento anulado por cinco infracciones de integridad. Nota definitiva: 0.00.</b></div>':''}<div class="metrics"><div class="m">Estudiante<div class="v">${escapeHtml(state.student)}</div></div><div class="m">Nota<div class="v">${state.score.toFixed(2)} / 5.00</div></div><div class="m">Duración<div class="v">${formatTime(duration)}</div></div><div class="m">Distancia<div class="v">${Math.round(state.stats.distance||0)} km</div></div><div class="m">Cafés destruidos<div class="v">${state.stats.brownDestroyed||0}</div></div><div class="m">Interceptores<div class="v">${state.stats.enemiesDestroyed||0}</div></div><div class="m">Omega<div class="v">${state.stats.bossFormsDefeated||0}/4</div></div><div class="m">Salvavidas<div class="v">${state.stats.lifesaverCorrect||0}/${(state.stats.lifesavers||0)*2}</div></div></div><h2>Balance de combate</h2><p>Asteroides azules correctos: <b>${state.stats.blueCorrect||0}</b> (+${((state.stats.blueCorrect||0)*.05).toFixed(2)}) · incorrectos: <b>${state.stats.blueWrong||0}</b> (−${((state.stats.blueWrong||0)*.05).toFixed(2)}) · impactos con asteroides cafés: <b>${state.stats.brownAsteroidHits||0}</b> (−${(state.stats.brownPenalty||0).toFixed(2)}) · interceptores: <b>+${((state.stats.enemiesDestroyed||0)*.02).toFixed(2)}</b>.</p><h2>Dominio por mundo</h2><ol>${sectorNames.map((n,i)=>`<li><b>${n}</b>: ${state.sectorProgress[i]}/6 pruebas superadas.</li>`).join('')}</ol><h2>Detalle de desafíos</h2><table><thead><tr><th>#</th><th>Evento</th><th>Mundo</th><th>Tipo</th><th>Resultado</th><th>Cambio</th><th>Pista</th><th>Tiempo</th></tr></thead><tbody>${rows||'<tr><td colspan="8">Sin respuestas registradas.</td></tr>'}</tbody></table><h2>Daño y recuperación</h2><p>Daño recibido de naves: <b>${(state.stats.enemyDamage||0).toFixed(2)}</b> · vidas perdidas totales: <b>${Number(state.stats.livesLost||0).toFixed(2)}</b> · respuestas salvavidas correctas: <b>${state.stats.lifesaverCorrect||0}</b>.</p><h2>Integridad</h2><p>Eventos registrados: ${state.integrity}</p><ul>${state.integrityLog.map(x=>`<li>${new Date(x.time).toLocaleString('es-CO')}: ${escapeHtml(x.reason)}</li>`).join('')||'<li>Sin eventos.</li>'}</ul><p><small>Generado el ${end.toLocaleString('es-CO')}.</small></p></body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Informe_Nexo_Vectorial_${safeName(state.student)}_${new Date().toISOString().slice(0,10)}.html`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);if(!auto)toast('Informe HTML generado.');
  }



  /* ===== v2.2 · Banco progresivo por 5 niveles ===== */
  const WORLD_DEFINITIONS=[
    {id:1,name:'NIVEL 1 · VECTORES 2D',scene:1,questions:8,topics:[{id:'v2d-ops',label:'Operaciones y aplicaciones en R²'},{id:'v2d-geometry',label:'Norma, ángulo, dirección y proyecciones'}]},
    {id:2,name:'NIVEL 2 · VECTORES 3D',scene:1,questions:8,topics:[{id:'v3d-ops',label:'Operaciones y distancia en R³'},{id:'v3d-dot',label:'Norma, producto punto y ortogonalidad 3D'}]},
    {id:3,name:'NIVEL 3 · MATRICES 2×2 Y 3×3',scene:2,questions:8,topics:[{id:'m22-ops',label:'Matrices 2×2: operaciones y productos'},{id:'m33-ops',label:'Matrices rectangulares y 3×3'}]},
    {id:4,name:'NIVEL 4 · DETERMINANTES Y SISTEMAS',scene:3,questions:8,topics:[{id:'m22-systems',label:'Determinantes y sistemas 2×2'},{id:'m33-systems',label:'Determinantes, sistemas 3×3 y Gauss–Jordan'}]},
    {id:5,name:'NIVEL 5 · NÚCLEO FINAL',scene:4,questions:10,topics:[{id:'mixed-boss',label:'Retos mixtos multi-etapa'},{id:'gauss-boss',label:'Gauss–Jordan, modelación y jefes finales'}]}
  ];

  function selectedTopicSet(){return new Set($$('.topic-check:checked').map(x=>x.value));}
  function worldTarget(sector){return Number(state.worldQuestionTotals?.[sector-1]||WORLD_DEFINITIONS[sector-1]?.questions||8);}
  function securedUnits(){return Math.max(0,Math.min(5,state.securedUnits||0));}
  function clampScore(value){return Math.max(securedUnits(),Math.min(5,value));}
  function lockClearedLevel(level){
    const previous=securedUnits(),earnedSinceLock=Math.max(0,state.score-previous),securedThisLevel=Math.min(1,earnedSinceLock),next=Math.min(5,previous+securedThisLevel);
    state.securedLevels=Math.max(state.securedLevels||0,level);state.securedUnits=next;state.score=clampScore(state.score);
    toast(`Nivel ${level} superado: aseguras ${securedThisLevel.toFixed(2)} de un máximo de 1.00. Piso acumulado: ${next.toFixed(2)}.`);updateHUD();saveProgress();
  }
  function plannedEnemyCount(sector,totalWorlds){return sector>=totalWorlds?12:Math.min(10,5+sector);}
  function buildGradingPlan(mission,activeDefs,selected){
    const topicPool=4.00,fleetPool=.40,finalBossPool=.60;
    const mainTopicCount=Math.max(1,activeDefs.length),perTopic=topicPool/mainTopicCount;
    const worldCounts={};mission.forEach(q=>{const key=String(q.sourceWorld||q.sector);worldCounts[key]=(worldCounts[key]||0)+1;});
    const questionValues={};mission.forEach(q=>{const key=String(q.sourceWorld||q.sector);questionValues[q.id]=perTopic/Math.max(1,worldCounts[key]||1);});
    const totalShips=activeDefs.reduce((sum,_def,index)=>sum+plannedEnemyCount(index+1,activeDefs.length),0);
    return{
      total:5,topicPool,fleetPool,finalBossPool,selectedTopicCount:mainTopicCount,perTopic,
      selectedMainTopicIds:activeDefs.map(def=>def.id),worldCounts,questionValues,totalShips,
      fleetGateValue:.10/Math.max(1,activeDefs.length),shipValue:.30/Math.max(1,totalShips),
      finalGateValue:.20/4,bossFormValue:.40/4
    };
  }
  function mainQuestionValue(q){return Number(state.grading?.questionValues?.[q.id]||.05);}
  function mainQuestionReward(q){const base=mainQuestionValue(q);return q._hintUsed?base*.75:base;}
  function mainQuestionPenalty(q){return Math.min(.05,Math.max(.01,mainQuestionValue(q)*.25));}
  function formatPoints(value){return Number(value)<.01?Number(value).toFixed(3):Number(value).toFixed(2);}
  function gradingText(){const g=state.grading;if(!g)return'';return `${g.selectedTopicCount} tema${g.selectedTopicCount===1?'':'s'} principal${g.selectedTopicCount===1?'':'es'} · ${g.perTopic.toFixed(2)} por tema principal · preguntas ${g.topicPool.toFixed(2)} · naves ${g.fleetPool.toFixed(2)} · nave final ${g.finalBossPool.toFixed(2)}`;}
  function updateTopicSelectionUI(){
    const selected=selectedTopicSet();let worlds=0,tests=0;
    $$('.topic-world-card').forEach(card=>{const active=[...card.querySelectorAll('.topic-check')].some(x=>x.checked);card.classList.toggle('active-world',active);card.classList.toggle('inactive-world',!active);if(active){worlds++;tests+=Number(card.dataset.questions||8);}});
    const summary=$('#topicSummary');if(summary)summary.textContent=`${selected.size} tema${selected.size===1?'':'s'} seleccionado${selected.size===1?'':'s'} · ${worlds} nivel${worlds===1?'':'es'} activo${worlds===1?'':'s'} · ${tests} pruebas principales`;
    const perTopic=selected.size?4/selected.size:0,perTopicEl=$('#gradingPerTopic'),explanation=$('#gradingExplanation');
    if(perTopicEl)perTopicEl.textContent=selected.size?`${perTopic.toFixed(2)} por tema seleccionado`:'Selecciona al menos un tema';
    if(explanation)explanation.textContent=selected.size?`Los ${selected.size} temas comparten 4.00 puntos. Las escuadras valen 0.40 y la nave grande final 0.60; ambas aparecen siempre.`:'Selecciona temas para calcular la ponderación. Las naves y la nave grande final seguirán siendo obligatorias.';
  }
  function cloneQuestion(q){return JSON.parse(JSON.stringify(q));}
  function seededShuffle(items,seed){const a=[...items];let s=seed|0;for(let i=a.length-1;i>0;i--){s=(Math.imul(s^s>>>16,0x45d9f3b)+0x9e3779b9)|0;const j=Math.abs(s)%(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;}
  function progressivePick(pool,count,seed){
    const groups=new Map();pool.forEach(q=>{const d=q.difficulty||1;if(!groups.has(d))groups.set(d,[]);groups.get(d).push(q);});
    const ordered=[];[...groups.keys()].sort((a,b)=>a-b).forEach(d=>ordered.push(...seededShuffle(groups.get(d),seed+d*7919)));
    if(!ordered.length)return[];const out=[];for(let i=0;i<count;i++)out.push(cloneQuestion(ordered[i%ordered.length]));return out;
  }
  function buildConfiguredMission(seed,selected){
    const activeDefs=WORLD_DEFINITIONS.filter(def=>def.topics.some(topic=>selected.has(topic.id)));
    const bank=NVQuestions.build(seed),hardBank=NVQuestions.buildBlackHole(seed^0x6D2B79F5),bossBank=NVQuestions.buildBoss(seed^0x9E3779B9);
    const mission=[],hardMission=[],bossMission=[];let nextId=1;
    activeDefs.forEach((def,index)=>{
      const seq=index+1,activeTopicIds=def.topics.filter(topic=>selected.has(topic.id)).map(topic=>topic.id);
      let pool=bank.filter(q=>q.level===def.id&&activeTopicIds.includes(q.topic));
      if(!pool.length)pool=bank.filter(q=>q.level===def.id);
      const chosen=progressivePick(pool,def.questions,seed+def.id*1013);
      chosen.forEach(q=>{q.sourceId=q.id;q.sourceWorld=def.id;q.scene=def.scene;q.sector=seq;q.id=nextId++;q.topicLabel=def.topics.filter(x=>activeTopicIds.includes(x.id)).map(x=>x.label).join(' · ');mission.push(q);});
      let hard=hardBank.filter(q=>q.level===def.id&&(activeTopicIds.includes(q.topic)||!q.topic));if(!hard.length)hard=hardBank.filter(q=>q.level===def.id);
      progressivePick(hard,Math.max(2,hard.length),seed+def.id*2039).forEach((q,i)=>{q.sourceId=q.id;q.sourceWorld=def.id;q.scene=def.scene;q.sector=seq;q.id=1000+seq*20+i;hardMission.push(q);});
      const bossCount=def.id===5?4:3;const bosses=progressivePick(bossBank.filter(q=>q.level===def.id),bossCount,seed+def.id*4079);
      bosses.forEach((q,i)=>{q.sourceId=q.id;q.sourceWorld=def.id;q.scene=def.scene;q.sector=seq;q.id=2000+seq*20+i;bossMission.push(q);});
    });
    return{activeDefs,mission,hardMission,bossMission};
  }

  function bind(){
    els.launch.addEventListener('click',launchGame);els.how.addEventListener('click',showHow);
    els.hint.addEventListener('click',showHint);els.submit.addEventListener('click',submitAnswer);els.continue?.addEventListener('click',continueAfterFeedback);els.report.addEventListener('click',()=>downloadReport(false));
    els.finish.addEventListener('click',confirmFinish);els.modalClose.addEventListener('click',closeModal);els.sound.addEventListener('click',toggleSound);
    $$('.side-rail button').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
    $$('[data-move]').forEach(b=>{const d=b.dataset.move;b.addEventListener('pointerdown',e=>{e.preventDefault();held[d]=true;moveDrone(d);b.setPointerCapture?.(e.pointerId);});['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>held[d]=false));});
    fireBtn?.addEventListener('pointerdown',e=>{e.preventDefault();fireLaser();});els.canvas.addEventListener('pointerdown',e=>{if(state.phase==='flight'){e.preventDefault();fireLaser();}});
    window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);
    $('#selectAllTopics')?.addEventListener('click',()=>{$$('.topic-check').forEach(x=>x.checked=true);updateTopicSelectionUI();});
    $('#clearTopics')?.addEventListener('click',()=>{$$('.topic-check').forEach(x=>x.checked=false);updateTopicSelectionUI();});
    $$('.topic-check').forEach(x=>x.addEventListener('change',updateTopicSelectionUI));
    const evaluationActive=()=>state.mode==='exam'&&!!state.startedAt&&!state.completed;
    document.addEventListener('contextmenu',e=>{if(!state.startedAt||state.completed)return;e.preventDefault();if(evaluationActive())integrityStrike('Intento de clic derecho','Se bloqueó el menú contextual dentro de la evaluación.');});
    document.addEventListener('copy',e=>{if(!evaluationActive())return;e.preventDefault();integrityStrike('Intento de copiar contenido','Se bloqueó la copia de texto o fórmulas durante la evaluación.');});
    document.addEventListener('cut',e=>{if(!evaluationActive())return;e.preventDefault();integrityStrike('Intento de cortar contenido','Se bloqueó la extracción de contenido durante la evaluación.');});
    document.addEventListener('selectstart',e=>{if(!evaluationActive())return;const tag=String(e.target?.tagName||'').toUpperCase();if(!['INPUT','TEXTAREA'].includes(tag))e.preventDefault();});
    document.addEventListener('dragstart',e=>{if(!evaluationActive())return;e.preventDefault();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&evaluationActive())integrityStrike('Cambio de pestaña o minimización','La página de evaluación dejó de estar visible.');});
    window.addEventListener('blur',()=>{Object.keys(held).forEach(k=>held[k]=false);if(evaluationActive()&&document.visibilityState==='visible')integrityStrike('Pérdida de foco de la ventana','La ventana del juego dejó de ser la ventana activa.');});
    document.addEventListener('fullscreenchange',handleFullscreenChange);document.addEventListener('webkitfullscreenchange',handleFullscreenChange);els.reenterFullscreen.addEventListener('click',reenterFullscreen);
    const responsive=()=>{resizeAll();if(state.phase==='question'){const q=state.currentChallenge?.q||questions[state.questionIndex];fitMiniCanvas(q);setTimeout(()=>{resizeAll();if(q&&!els.mini.hidden)drawMini(q,performance.now());},40);}};
    window.addEventListener('resize',responsive);window.addEventListener('orientationchange',()=>setTimeout(responsive,250));window.visualViewport?.addEventListener('resize',()=>setTimeout(responsive,80));window.addEventListener('beforeunload',()=>saveProgress());
    document.querySelectorAll('input[name="mode"]').forEach(r=>r.addEventListener('change',()=>{integrityAcknowledged=false;}));
    updateTopicSelectionUI();
  }

  async function launchGame(){
    const selected=selectedTopicSet();if(!selected.size){showModal('Selecciona los temas','<p>Debes activar al menos un tema del primer corte para construir la misión.</p>');return;}
    state.student=els.name.value.trim()||NVScorm.get('cmi.core.student_name')||'Estudiante Vectorial';state.mode=document.querySelector('input[name="mode"]:checked').value;
    const allowed=await requestGameFullscreen();if(!allowed){showModal('Pantalla completa requerida','<p>La misión necesita toda la pantalla para conservar la visibilidad del combate y de las gráficas matemáticas.</p><p>En Brightspace, abre el recurso en una ventana o marco con permiso de pantalla completa.</p>',[{label:'REINTENTAR',action:()=>{closeModal();launchGame();},primary:true}]);return;}
    state.seed=(Date.now()^Math.floor(Math.random()*1e9))>>>0;const configured=buildConfiguredMission(state.seed,selected);if(!configured.mission.length){toast('No fue posible construir preguntas con esa selección.');return;}
    questions=configured.mission;blackHoleQuestions=configured.hardMission;bossQuestions=configured.bossMission;sectorNames=configured.activeDefs.map(x=>x.name);
    const grading=buildGradingPlan(questions,configured.activeDefs,selected);questions.forEach(q=>q.gradeValue=grading.questionValues[q.id]);
    Object.assign(state,{questionIndex:0,score:0,energy:5,integrity:0,xp:0,sectorProgress:Array(sectorNames.length).fill(0),worldQuestionTotals:configured.activeDefs.map(x=>x.questions||4),selectedTopics:[...selected],selectedMainTopics:configured.activeDefs.map(x=>mainTopicTitle(x)),selectedWorlds:configured.activeDefs.map(x=>x.id),answers:[],hints:0,startedAt:new Date(),endedAt:null,disqualified:false,completed:false,phase:'flight',phaseBeforePause:'flight',currentChallenge:null,blackHoleIndex:0,projectiles:[],mathShot:null,rewind:null,lastShotAt:0,world:1,worldStage:'asteroids',lifesaverFlags:{},lifesaverSerial:0,weaponBoostUntil:0,securedUnits:0,securedLevels:0,bossQuestionSerial:0,grading});
    state.stats={asteroidHits:0,asteroidsAvoided:0,asteroidsShot:0,brownDestroyed:0,smallDestroyed:0,mediumDestroyed:0,largeDestroyed:0,shotsFired:0,blackHolesEntered:0,blackHoleSuccess:0,blackHoleFails:0,asteroidPenalty:0,blackHolePenalty:0,brownAsteroidHits:0,brownPenalty:0,questionAsteroidsSpawned:0,blueCorrect:0,blueWrong:0,maxAsteroids:0,distance:0,livesLost:0,rewinds:0,enemiesDestroyed:0,enemyDamage:0,enemyShots:0,lifesavers:0,lifesaverCorrect:0,bossFormsDefeated:0,bossDefeated:false,combatScore:0};
    document.body.classList.add('playing');els.boot.hidden=true;els.game.hidden=false;buildSectorDots();resizeAll();renderQuestion();animate(performance.now());saveProgress();
  }

  function showHow(){showModal('Cómo jugar',`<ol><li><b>Calificación configurable:</b> los temas principales seleccionados comparten 4.00 puntos en partes iguales. Cada pregunta recibe un valor proporcional al tema principal al que pertenece.</li><li><b>Combate obligatorio:</b> sin importar cuántos temas elijas, después de cada mundo aparece una escuadra de naves. Todas las escuadras juntas valen 0.40.</li><li><b>Nave grande final:</b> siempre aparece al terminar el último mundo seleccionado. Sus cuatro cálculos y cuatro formas valen 0.60.</li><li><b>Pistas:</b> una respuesta correcta con pista conserva el 75% del valor de la pregunta. Los errores descuentan una fracción proporcional, con máximo de 0.05.</li><li><b>Unidad asegurada:</b> al superar una escuadra, aseguras una unidad correspondiente al nivel superado; esa base no disminuye en los niveles posteriores.</li><li><b>Jefes:</b> sus escudos activan cálculos propios, distintos y más complejos que los asteroides o cometas.</li><li><b>Integridad en evaluación:</b> se bloquean clic derecho, copiar/cortar, cambio de pestaña, pérdida de foco, salida de pantalla completa, recarga, navegación y atajos restringidos. La quinta incidencia anula inmediatamente el quiz, fija la nota en 0.00 y la envía a Brightspace.</li></ol><p><b>Total:</b> temas 4.00 + naves 0.40 + nave grande final 0.60 = 5.00.</p>`);}

  function renderQuestion(){
    if(state.completed)return;if(state.questionIndex>=questions.length){if(state.space?.stage==='enemies'||state.space?.stage==='boss')return;if(!state.stats.bossDefeated)startFinalBoss();return;}
    const q=questions[state.questionIndex],sec=q.sector;selected=null;answerLocked=true;q._hintUsed=false;q._attempts=0;state.world=sec;state.worldStage='asteroids';
    els.sectorNumber.textContent=`MUNDO ${sec}`;els.sectorName.textContent=sectorNames[sec-1];els.qCount.textContent=`PRUEBA ${state.questionIndex+1} / ${questions.length}`;els.qBadge.textContent=q.badge;renderProgress();updateHUD();
    if(!state.space||state.space.sector!==sec)initSpace(sec,true);else state.space.stage='asteroids';activateFlight(sec>=sectorNames.length?'CAMPO DE COMETAS ROJOS':'CAMPO DE ASTEROIDES');
  }

  function activateFlight(message){
    const q=questions[state.questionIndex];if(state.completed||!state.space)return;state.phase='flight';state.worldStage='asteroids';state.space.stage='asteroids';state.currentChallenge=null;state.mathShot=null;state.rewind=null;answerLocked=true;selected=null;pendingContinueAction=null;if(els.continue){els.continue.hidden=true;els.continue.disabled=true;}
    hideQuestionPanel();bossHud.hidden=true;els.flightHud.hidden=false;els.arrivalChip.hidden=true;els.challengeRibbon.hidden=true;els.hint.disabled=true;els.submit.disabled=true;els.qBody.innerHTML='';els.answers.innerHTML='';els.mini.hidden=true;mctx.clearRect(0,0,els.mini.width,els.mini.height);
    const finalSector=state.space.sector>=5,qValue=q?mainQuestionValue(q):0;els.flightTitle.textContent=message||(finalSector?'CAMPO DE COMETAS ROJOS':'CAMPO DE ASTEROIDES');els.flightTarget.textContent=`PRUEBAS ${state.sectorProgress[state.space.sector-1]||0}/${worldTarget(state.space.sector)}`;els.instruction.textContent=finalSector?`Cometas rojos: todos activan preguntas. Próxima prueba hasta +${qValue.toFixed(2)}.`:`Azules: valor según tema, próxima hasta +${qValue.toFixed(2)} · Cafés: evita −0.01.`;requestAnimationFrame(()=>{resizeAll();setTimeout(resizeAll,220);});saveProgress();
  }

  async function revealChallenge(){
    const ch=state.currentChallenge,q=ch?.q;if(!q||state.completed)return;selected=null;answerLocked=true;q._hintUsed=false;q._attempts=0;pendingContinueAction=null;if(els.continue){els.continue.hidden=true;els.continue.disabled=true;}
    const sec=(ch.sector||questions[state.questionIndex]?.sector||q.sector||state.space?.sector||sectorNames.length);els.sectorNumber.textContent=`MUNDO ${sec}`;els.sectorName.textContent=sectorNames[sec-1];
    if(ch.kind==='bossgate'){const finalGate=ch.resumePhase==='boss',reward=finalGate?(state.grading?.finalGateValue||.05):(state.grading?.fleetGateValue||.02),penalty=Math.min(finalGate?.15:.10,Math.max(.02,reward*.5));els.qCount.textContent=ch.bossLabel||`JEFE · CÁLCULO ${state.bossQuestionSerial||1}`;els.qBadge.textContent='ACIERTA: POTENCIA EL ARMA · ERROR: PENALIZACIÓN Y PÉRDIDA DE 1 VIDA';messageKind&&(messageKind.textContent='DESAFÍO DEL JEFE');}
    else if(ch.kind==='lifesaver'){els.qCount.textContent=`SALVAVIDAS · RETO ${ch.index+1} / 2`;els.qBadge.textContent='CADA ACIERTO RECUPERA VIDA';messageKind&&(messageKind.textContent='SALVAVIDAS');}
    else if(ch.kind==='blackhole'){els.qCount.textContent='PORTAL · RETO AVANZADO';els.qBadge.textContent='ERROR: PENALIZACIÓN Y PÉRDIDA DE 2 VIDAS';messageKind&&(messageKind.textContent='AGUJERO NEGRO');}
    else{const finalComet=sec>=sectorNames.length,reward=mainQuestionReward(q),penalty=mainQuestionPenalty(q);els.qCount.textContent=`${finalComet?'COMETA ROJO':'ASTEROIDE AZUL'} · PRUEBA ${state.questionIndex+1}/${questions.length}`;els.qBadge.textContent='ACIERTA: POTENCIA EL ARMA · ERROR: PENALIZACIÓN Y PÉRDIDA DE 1 VIDA';messageKind&&(messageKind.textContent=finalComet?'COMETA DE PREGUNTA':'ASTEROIDE AZUL');}
    questionPanel.classList.toggle('blackhole-message',ch.kind==='blackhole');questionPanel.classList.toggle('asteroid-message',ch.kind==='asteroid');questionPanel.classList.toggle('lifesaver-message',ch.kind==='lifesaver');questionPanel.classList.toggle('boss-message',ch.kind==='bossgate');
    els.instruction.textContent=ch.kind==='bossgate'?'Resuelve un cálculo multi-etapa del jefe. Un acierto potencia el arma durante 20 segundos.':ch.kind==='lifesaver'?'Responde las dos pruebas complejas para recuperar el blindaje.':ch.kind==='blackhole'?'Autoriza el salto gravitacional.':'Una respuesta correcta activa el disparo automático contra el obstáculo de pregunta.';
    els.qBody.innerHTML=`<span class="question-prompt-label">ENUNCIADO</span><div class="question-prompt-content">${q.prompt}</div>`;questionPanel.scrollTop=0;renderOptions(q);els.answers.classList.toggle('two-column',q.type==='tf'||q.type==='roman'||(q.options&&q.options.every(o=>stripHtml(o.html).length<52)));
    els.mini.hidden=!shouldShowMini(q);setFeedback(ch.kind==='bossgate'?'El jefe ha activado un escudo matemático. Estas preguntas son diferentes y más complejas que las de los asteroides.':ch.kind==='lifesaver'?`Blindaje al ${state.energy.toFixed(1)}/5. Usa la pista si la necesitas; cada acierto restaura 1.25 de vida.`:ch.kind==='blackhole'?'El portal espera autorización matemática. Puedes consultar la pista antes de responder.':(sec>=sectorNames.length?'Cometa rojo detectado. Todos los cometas del nivel final contienen una prueba.':'Asteroide azul detectado. Consulta la pista si la necesitas y responde para activar el disparo matemático.'),'neutral');
    await typeset();if(state.completed)return;fitMiniCanvas(q);questionPanel.scrollTop=0;state.phase='question';questionStart=Date.now();els.gameLayout.classList.remove('flight-mode');els.gameLayout.classList.add('challenge-open');els.flightHud.hidden=true;answerLocked=false;els.submit.disabled=false;els.hint.disabled=false;
    requestAnimationFrame(()=>{questionPanel.scrollTop=0;fitMiniCanvas(q);resizeAll();if(!els.mini.hidden)drawMini(q,performance.now());setTimeout(()=>{questionPanel.scrollTop=0;fitMiniCanvas(q);resizeAll();if(!els.mini.hidden)drawMini(q,performance.now());},260);});saveProgress();
  }
  function finishMathShot(){
    const shot=state.mathShot,ch=state.currentChallenge,s=state.space;if(!shot||shot.done||!ch||!s)return;shot.done=true;const target=s.asteroids.find(a=>a.id===shot.targetId);if(target){addExplosion(target.x,target.y,target.r,'math');addScoreFloat('ASTEROIDE AZUL DESTRUIDO',target.x,target.y,'life');}
    s.asteroids=s.asteroids.filter(a=>a.id!==shot.targetId);state.stats.asteroidsShot++;state.stats.asteroidsMath=(state.stats.asteroidsMath||0)+1;restoreCollisionPoint(shot.snapshot);s.invulnerableUntil=performance.now()+1900;s.nextCoreAt=performance.now()+2200;
    const completedSector=questions[state.questionIndex]?.sector;state.questionIndex++;state.currentChallenge=null;state.mathShot=null;if(state.sectorProgress[completedSector-1]>=worldTarget(completedSector)){startEnemyWave(completedSector);return;}activateFlight('ASTEROIDE DESTRUIDO · RUTA RESTABLECIDA');
  }

  function updateEnemyWave(w,h,dt,t){
    const s=state.space,shipX=(w/2+state.drone.x)/w,shipY=(h*.78+state.drone.y)/h;s.route+=dt*120;state.stats.distance+=dt*120;
    for(const e of s.enemies){
      if(e.y<e.targetY)e.y+=e.speed*dt;else{const chase=(shipX-e.x)*(0.42+Math.min(s.sector,5)*.08);e.x+=chase*dt+Math.sin(t*.0015+e.phase)*.035*dt;e.y=e.targetY+Math.sin(t*.0018+e.phase)*.035;}
      if(e.portalPhase&&t>(e.portalAt||0)){e.x=.12+Math.random()*.76;e.y=.10+Math.random()*.22;e.portalAt=t+900+Math.random()*650;e.hiddenUntil=t+200;}
      e.x=Math.max(.04,Math.min(.96,e.x));if(t>e.fireAt&&e.y>.04){spawnEnemyShot(e,shipX,shipY,false);e.fireAt=t+(e.portalPhase?390:680)+Math.random()*(e.portalPhase?330:720)-Math.min(s.sector,5)*45;}
    }
    updateProjectiles(w,h,dt,t);updateEnemyBullets(w,h,dt,t);checkEnemyCollisions(w,h,t);
    if(!s.enemies.length&&!s.waveCleared){s.waveCleared=true;if(s.sector<sectorNames.length)lockClearedLevel(s.sector);els.flightTitle.textContent=s.sector<sectorNames.length?'ESCUADRA DESTRUIDA · UNIDAD ASEGURADA':'ESCUADRA FINAL DESTRUIDA';els.flightTarget.textContent=s.sector<sectorNames.length?'Preparando el siguiente salto…':'Los dos jefes finales aparecen simultáneamente…';setTimeout(()=>{if(state.completed)return;if(s.sector<sectorNames.length)beginSectorTransition(s.sector+1);else startFinalBoss();},1500);}
  }

  function startEnemyWave(sector){
    const s=state.space;if(!s)return;state.world=sector;state.worldStage='enemies';state.phase='impact';s.stage='enemies';s.safeUntil=0;s.asteroids=[];s.blackHoles=[];s.projectiles=[];s.enemyProjectiles=[];s.enemies=[];s.waveCleared=false;s.invulnerableUntil=performance.now()+1700;
    const finalSector=sector>=sectorNames.length,count=plannedEnemyCount(sector,sectorNames.length);s.spawnTotal=count;for(let i=0;i<count;i++)spawnEnemy(i,count,sector);
    bossHud.hidden=true;hideQuestionPanel();els.flightHud.hidden=false;els.arrivalChip.textContent=finalSector?'NIVEL 5 · ESCUADRA DE PORTALES':`NIVEL ${sector} · NAVES ENEMIGAS`;els.arrivalChip.className='arrival-chip enemy-alert';els.arrivalChip.hidden=false;
    els.flightTitle.textContent=finalSector?'NIVEL 5 · NAVES RÁPIDAS Y ARMAS MÚLTIPLES':`NIVEL ${sector} · ESCUADRA ENEMIGA`;els.flightTarget.textContent=finalSector?`Destruye ${count} naves rápidas antes de los dos jefes finales`:`Destruye ${count} naves antes del jefe del nivel`;els.instruction.textContent='Antes del combate debes superar un cálculo del jefe. Un acierto potencia el arma durante 20 segundos.';
    setTimeout(()=>{els.arrivalChip.hidden=true;triggerBossGate(sector,'enemy-wave',finalSector?'NIVEL 5 · CÁLCULO DE LA ESCUADRA':`NIVEL ${sector} · CÁLCULO DEL JEFE`);},700);updateCombatHud();updateHUD();
  }

  function startFinalBoss(){
    const s=state.space;if(!s||state.completed)return;state.world=sectorNames.length;state.worldStage='boss';state.phase='impact';s.stage='boss';s.asteroids=[];s.blackHoles=[];s.enemies=[];s.projectiles=[];s.enemyProjectiles=[];s.invulnerableUntil=performance.now()+2200;s.boss={x:.5,y:.18,r:.11,form:1,hp:BOSS_HP[0],maxHp:BOSS_HP[0],vx:.28,fireAt:performance.now()+1100,transformUntil:performance.now()+1500,hitFlash:0,dead:false,portalAt:performance.now()+1600};
    hideQuestionPanel();els.flightHud.hidden=false;bossHud.hidden=false;els.arrivalChip.textContent='NIVEL 5.0 · DOS JEFES FINALES';els.arrivalChip.className='arrival-chip boss-alert';els.arrivalChip.hidden=false;els.flightTitle.textContent='BATALLA FINAL · JEFES ALFA Y BETA';els.flightTarget.textContent='Cada jefe posee dos formas, dispara y reaparece mediante portales.';els.instruction.textContent='Los cálculos de los jefes son multi-etapa y diferentes a los de los cometas.';
    setTimeout(()=>{els.arrivalChip.hidden=true;triggerBossGate(sectorNames.length,'boss','JEFE FINAL ALFA · ESCUDO DE CÁLCULO');},900);updateBossHud();
  }

  function triggerLifesaver(resumePhase){
    if(state.currentChallenge||state.completed)return;const sector=state.space?.sector||sectorNames.length,form=resumePhase==='boss'?(state.space?.boss?.form||1):0,key=`${sector}:${resumePhase}:${form}`;if(state.lifesaverFlags[key])return;state.lifesaverFlags[key]=true;state.lifesaverSerial++;state.stats.lifesavers++;
    let pool=(resumePhase==='boss'?bossQuestions:blackHoleQuestions).filter(q=>q.sector===sector);if(!pool.length)pool=resumePhase==='boss'?bossQuestions:blackHoleQuestions;if(!pool.length)return;
    const first=cloneQuestion(pool[(state.stats.lifesavers-1)%pool.length]),second=cloneQuestion(pool[(state.stats.lifesavers)%pool.length]||first);first.sector=sector;second.sector=sector;state.currentChallenge={kind:'lifesaver',sector,resumePhase,index:0,questions:[first,second],q:first,correct:0};state.phase='impact';els.arrivalChip.textContent='BLINDAJE AL 50% · PROTOCOLO SALVAVIDAS';els.arrivalChip.className='arrival-chip weapon';els.arrivalChip.hidden=false;beep(520,.3);setTimeout(()=>{els.arrivalChip.hidden=true;revealChallenge();},520);
  }

  function updateFlightHud(s,safe){
    const sectorAnswered=state.sectorProgress[s.sector-1]||0,target=worldTarget(s.sector),left=Math.max(0,Math.ceil((s.safeUntil-performance.now())/1000)),blueCount=s.asteroids?.reduce((n,a)=>n+(a.core?1:0),0)||0,brownCount=(s.asteroids?.length||0)-blueCount,finalSector=s.sector>=sectorNames.length;
    if(s.stage==='asteroids'){els.flightFill.style.width=`${Math.min(100,sectorAnswered/target*100)}%`;els.flightTitle.textContent=safe?'CORREDOR SEGURO':(finalSector?'CAMPO DE COMETAS ROJOS':'CAMPO DE ASTEROIDES');els.flightTarget.textContent=`PRUEBAS ${sectorAnswered}/${target}`;els.densityText.textContent=safe?`SEGURO ${left}s`:`NIVEL ${s.sector}`;els.asteroidText.textContent=finalSector?`COMETAS ${blueCount}`:`AZULES ${blueCount}`;els.warpText.textContent=finalSector?'TODOS SON PREGUNTA':`CAFÉS ${brownCount}`;destroyedText&&(destroyedText.textContent=`DESTRUIDOS ${state.stats.asteroidsShot||0}`);phaseText&&(phaseText.textContent=finalSector?'FUEGO Y COMETAS':(s.blackHoles.length?'PORTAL ACTIVO':'PORTAL EN BÚSQUEDA'));enemyText&&(enemyText.textContent='');}
    else if(s.stage==='enemies'){const total=Math.max(1,s.spawnTotal||s.enemies.length),leftEnemies=s.enemies.length;els.flightFill.style.width=`${Math.max(0,(total-leftEnemies)/total*100)}%`;els.flightTitle.textContent=finalSector?'NAVES RÁPIDAS DE PORTAL':'NAVES ENEMIGAS';els.flightTarget.textContent=`RESTAN ${leftEnemies}`;els.densityText.textContent=`NIVEL ${s.sector}`;els.asteroidText.textContent=finalSector?'ARMAS MÚLTIPLES':`+${formatPoints(state.grading?.shipValue||.02)} CADA NAVE`;els.warpText.textContent=`VIDA ${state.energy.toFixed(1)}/5`;destroyedText&&(destroyedText.textContent=`DESTRUIDOS ${state.stats.enemiesDestroyed||0}`);phaseText&&(phaseText.textContent=finalSector?'APARECEN Y DESAPARECEN':'PERSECUCIÓN');enemyText&&(enemyText.textContent='');}
    else if(s.stage==='boss'){const b=s.boss;els.flightFill.style.width=`${b?Math.max(0,(1-b.hp/b.maxHp)*100):100}%`;els.flightTitle.textContent='JEFES FINALES ALFA Y BETA';els.flightTarget.textContent=b?`FASE ${b.form}/4 · VIDA ${Math.ceil(b.hp)}/${b.maxHp}`:'JEFES DESTRUIDOS';els.densityText.textContent='NIVEL 5.0';els.asteroidText.textContent=`REGENERACIONES ${Math.max(0,4-(b?.form||4))}`;els.warpText.textContent=`VIDA ${state.energy.toFixed(1)}/5`;destroyedText&&(destroyedText.textContent='');phaseText&&(phaseText.textContent='PORTALES Y ARMAS');enemyText&&(enemyText.textContent='');updateBossHud();}updateCombatHud();
  }

  function updateHUD(){
    els.score.textContent=`${state.score.toFixed(2)} / 5.00`;els.integrity.textContent=`${state.integrity} / 5`;renderEnergy();const level=Math.min(12,1+Math.floor(state.xp/200));els.level.textContent=level;els.xp.textContent=`${state.xp} / ${level*600}`;els.xpFill.style.width=`${Math.min(100,(state.xp%(level*600))/(level*600)*100)}%`;
    $$('#sectorDots button').forEach((b,i)=>{b.classList.toggle('complete',state.sectorProgress[i]>=worldTarget(i+1));b.classList.toggle('active',(state.space?.sector||questions[state.questionIndex]?.sector||sectorNames.length)-1===i);b.title=`${sectorNames[i]}: ${state.sectorProgress[i]}/${worldTarget(i+1)}`;});updateCombatHud();
  }

  function finishMission(manual){
    if(state.completed&&!state.disqualified)return;state.completed=true;state.endedAt=new Date();const status=state.disqualified?'failed':(state.score>=3?'passed':'failed');NVScorm.finish(state.disqualified?0:state.score,status,manual?'manual-finish':'completed');downloadReport(true);closeModal();const recovered=state.sectorProgress.filter((x,i)=>x>=worldTarget(i+1)).length;showModal('Misión finalizada',`<p>Nota enviada: <b>${state.score.toFixed(2)} / 5.00</b></p><p>Mundos superados: <b>${recovered}/${sectorNames.length}</b> · Puntaje asegurado: <b>${securedUnits().toFixed(2)}</b></p><p><b>Esquema aplicado:</b> ${gradingText()}</p><p>Las escuadras y la nave grande final se incluyeron aunque la selección temática fuera parcial.</p><p>El informe HTML se descargó automáticamente.</p>`,[{label:'CERRAR',action:closeModal,primary:true}]);updateHUD();
  }

  function recommendation(){const ratios=state.sectorProgress.map((x,i)=>x/worldTarget(i+1)),min=Math.min(...ratios),i=ratios.indexOf(min);return min>=.8?'Desempeño sólido en los temas seleccionados. Refuerza la explicación escrita de tus procedimientos.':`Conviene reforzar ${sectorNames[i].toLowerCase()}, especialmente mediante ejercicios breves sin pista y revisión de los errores registrados.`;}

  function openPanel(panel){
    if(panel==='mission')return;if(panel==='log'){const recent=state.answers.slice(-12).reverse().map(a=>`<tr><td>${escapeHtml(a.event||'Prueba')}</td><td>${a.id}</td><td>${a.correct?'✓':'✗'}</td><td>${a.delta>0?'+':''}${a.delta.toFixed(2)}</td><td>${a.timeSec}s</td></tr>`).join('');showModal('Bitácora de misión',`<table class="progress-table"><thead><tr><th>Evento</th><th>Reto</th><th>Resultado</th><th>Puntaje</th><th>Tiempo</th></tr></thead><tbody>${recent||'<tr><td colspan="5">Aún no hay eventos.</td></tr>'}</tbody></table>`);}
    if(panel==='progress'){
      const rows=sectorNames.map((n,i)=>{const done=state.sectorProgress[i]>=worldTarget(i+1),active=(state.space?.sector||1)===i+1;return `<tr class="${done?'world-complete':active?'world-active':''}"><td><strong>Mundo ${i+1}</strong><br><small>${escapeHtml(mainTopicTitle({name:n}))}</small></td><td>${state.sectorProgress[i]}/${worldTarget(i+1)}</td><td>${done?'Superado':active?'En curso':'Pendiente'}</td></tr>`;}).join('');
      showModal(`Progreso · ${sectorNames.length} mundos seleccionados`,`<div class="selected-world-count"><strong>${sectorNames.length}</strong><span>mundos de la campaña</span></div><table class="progress-table selected-world-progress"><thead><tr><th>Mundo seleccionado</th><th>Pruebas</th><th>Estado</th></tr></thead><tbody>${rows}</tbody></table><p>La campaña muestra únicamente los <b>${sectorNames.length} temas principales elegidos</b>. Los demás temas no aparecen en este intento.</p><p><b>Calificación:</b> ${gradingText()}</p><p>Puntaje asegurado: <b>${securedUnits().toFixed(2)}</b> · Nota actual: <b>${state.score.toFixed(2)} / 5.00</b></p>`);
    }
    if(panel==='help')showHow();
  }

  function fitMiniCanvas(q){
    if(!q||els.mini.hidden)return;const panelH=questionPanel.clientHeight||window.innerHeight*.8;const headerH=[questionPanel.querySelector('.transmission-strip'),questionPanel.querySelector('.question-head'),els.qBody,els.answers,questionPanel.querySelector('.question-actions'),els.feedback].reduce((sum,el)=>sum+(el&&!el.hidden?el.getBoundingClientRect().height:0),0);let target=Math.max(170,Math.min(430,panelH-headerH-72));
    if(q.visual?.kind==='vectors'||q.visual?.kind==='projection')target=Math.max(target,Math.min(430,panelH*.38));if(innerHeight<720)target=Math.min(target,250);els.mini.style.height=`${Math.round(target)}px`;
  }

  function niceStep(range){const raw=Math.max(.5,range/8),power=Math.pow(10,Math.floor(Math.log10(raw))),n=raw/power;return(n<=1?1:n<=2?2:n<=5?5:10)*power;}
  function drawAdaptiveArrow(c,ox,oy,dx,dy,color,label,w,h){c.save();c.strokeStyle=color;c.fillStyle=color;c.lineWidth=Math.max(2,Math.min(4,w/320));c.shadowColor=color;c.shadowBlur=9;c.beginPath();c.moveTo(ox,oy);c.lineTo(ox+dx,oy+dy);c.stroke();const a=Math.atan2(dy,dx),head=Math.max(8,Math.min(14,w/70));c.beginPath();c.moveTo(ox+dx,oy+dy);c.lineTo(ox+dx-head*Math.cos(a-.48),oy+dy-head*Math.sin(a-.48));c.lineTo(ox+dx-head*Math.cos(a+.48),oy+dy-head*Math.sin(a+.48));c.closePath();c.fill();c.shadowBlur=0;c.font=`bold ${Math.max(12,Math.min(17,w/65))}px Segoe UI`;c.textAlign=dx>=0?'left':'right';c.textBaseline=dy>=0?'top':'bottom';const tx=Math.max(10,Math.min(w-10,ox+dx+(dx>=0?8:-8))),ty=Math.max(10,Math.min(h-10,oy+dy+(dy>=0?7:-7)));c.fillText(label,tx,ty);c.setLineDash([5,5]);c.lineWidth=1;c.globalAlpha=.7;c.beginPath();c.moveTo(ox+dx,oy);c.lineTo(ox+dx,oy+dy);c.lineTo(ox,oy+dy);c.stroke();c.restore();}
  function drawAdaptiveAxes(c,w,h,points){
    const pad={l:54,r:30,t:26,b:38};let minX=0,maxX=0,minY=0,maxY=0;points.forEach(p=>{if(!p)return;minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);});const spanX=Math.max(2,maxX-minX),spanY=Math.max(2,maxY-minY),mx=Math.max(1,spanX*.18),my=Math.max(1,spanY*.18);minX-=mx;maxX+=mx;minY-=my;maxY+=my;const scale=Math.min((w-pad.l-pad.r)/(maxX-minX),(h-pad.t-pad.b)/(maxY-minY)),ox=pad.l-minX*scale,oy=pad.t+maxY*scale,step=niceStep(Math.max(maxX-minX,maxY-minY));
    c.save();c.font=`${Math.max(10,Math.min(13,w/100))}px Segoe UI`;c.textAlign='center';c.textBaseline='top';for(let x=Math.ceil(minX/step)*step;x<=maxX+1e-9;x+=step){const px=ox+x*scale;c.strokeStyle=Math.abs(x)<1e-9?'rgba(255,255,255,.92)':'rgba(120,190,255,.23)';c.lineWidth=Math.abs(x)<1e-9?1.8:1;c.beginPath();c.moveTo(px,pad.t);c.lineTo(px,h-pad.b);c.stroke();if(Math.abs(x)>1e-9){c.fillStyle='#bfe7ff';c.fillText(Number(x.toFixed(2)),px,Math.min(h-pad.b+7,h-18));}}
    c.textAlign='right';c.textBaseline='middle';for(let y=Math.ceil(minY/step)*step;y<=maxY+1e-9;y+=step){const py=oy-y*scale;c.strokeStyle=Math.abs(y)<1e-9?'rgba(255,255,255,.92)':'rgba(120,190,255,.23)';c.lineWidth=Math.abs(y)<1e-9?1.8:1;c.beginPath();c.moveTo(pad.l,py);c.lineTo(w-pad.r,py);c.stroke();if(Math.abs(y)>1e-9){c.fillStyle='#bfe7ff';c.fillText(Number(y.toFixed(2)),Math.max(pad.l-7,ox-8),py);}}
    c.fillStyle='#fff';c.font=`bold ${Math.max(12,Math.min(16,w/90))}px Segoe UI`;c.textAlign='right';c.fillText('x',w-pad.r,h-pad.b-12);c.textAlign='left';c.fillText('y',Math.min(w-pad.r-14,ox+9),pad.t+2);c.restore();return{ox,oy,scale};
  }
  function drawMini(q,t){
    if(!q)return;const {w,h}=prep(els.mini,mctx);mctx.clearRect(0,0,w,h);mctx.fillStyle='#010916';mctx.fillRect(0,0,w,h);const v=q.visual;if(!v)return;
    if(v.kind==='vectors'||v.kind==='projection'){const points=[[0,0],v.u,v.v,v.a,v.b,v.proj,v.result].filter(p=>Array.isArray(p)&&p.length>=2),fit=drawAdaptiveAxes(mctx,w,h,points);if(v.u)drawAdaptiveArrow(mctx,fit.ox,fit.oy,v.u[0]*fit.scale,-v.u[1]*fit.scale,'#2585ff','u',w,h);if(v.v&&v.v.some(n=>n))drawAdaptiveArrow(mctx,fit.ox,fit.oy,v.v[0]*fit.scale,-v.v[1]*fit.scale,'#64ec83','v',w,h);if(v.a)drawAdaptiveArrow(mctx,fit.ox,fit.oy,v.a[0]*fit.scale,-v.a[1]*fit.scale,'#2585ff','a',w,h);if(v.b)drawAdaptiveArrow(mctx,fit.ox,fit.oy,v.b[0]*fit.scale,-v.b[1]*fit.scale,'#64ec83','b',w,h);if(v.proj)drawAdaptiveArrow(mctx,fit.ox,fit.oy,v.proj[0]*fit.scale,-v.proj[1]*fit.scale,'#ffd250','proj',w,h);if(v.result&&v.showResult)drawAdaptiveArrow(mctx,fit.ox,fit.oy,v.result[0]*fit.scale,-v.result[1]*fit.scale,'#ffd250','r',w,h);}
    else if(v.kind==='systemLines')drawLineGraphPanel(mctx,12,12,w-24,h-24,v.lines);
    else if(v.kind==='gauss'){const cell=Math.max(21,Math.min(42,(w-80)/(v.matrix[0].length+2),(h-55)/(v.matrix.length+1)));drawAugMatrix(mctx,v.matrix,w*.42,h*.52,cell,'#25a1ff');if(v.next)drawAugMatrix(mctx,v.next,w*.73,h*.52,cell*.86,'#64ec83');}
    else if(v.A){const rows=v.A.length,cols=v.A[0].length,cell=Math.max(20,Math.min(44,(w*.38)/(cols+1),(h-50)/(rows+1)));drawMatrix(mctx,v.A,w*.3,h*.52,cell,'#25a1ff');if(v.B)drawMatrix(mctx,v.B,w*.68,h*.52,cell,'#64ec83');if(v.det!==undefined){mctx.fillStyle='#ffd250';mctx.font=`bold ${Math.max(18,Math.min(28,w/45))}px Segoe UI`;mctx.textAlign='center';mctx.fillText(`det(A) = ${v.det}`,w*.72,h*.52);}}
  }


  /* ===== v2.4 · Informe HTML autónomo estilo Conquista Integral ===== */
  function reportClone(value){try{return JSON.parse(JSON.stringify(value));}catch(_e){return null;}}
  function reportOptionHtml(q,index){
    const option=Array.isArray(q?.options)?q.options[Number(index)]:null;
    if(!option)return escapeHtml(String(index??''));
    const letter=option.letter?`<b>${escapeHtml(option.letter)}.</b> `:'';
    return `<span class="choice-mx">${letter}${option.html}</span>`;
  }
  function reportResponseHtml(q,value){
    if(q?.type==='numeric')return `<span class="choice-mx">\\(${escapeHtml(String(value))}\\)</span>`;
    if(q?.type==='tf')return `<span class="choice-mx">${value===true?'Verdadero':'Falso'}</span>`;
    return reportOptionHtml(q,value);
  }
  function reportCorrectHtml(q){
    if(q?.type==='numeric')return `<span class="choice-mx">\\(${escapeHtml(String(q.answerValue))}\\)</span>`;
    if(q?.type==='tf')return `<span class="choice-mx">${q.answer===true?'Verdadero':'Falso'}</span>`;
    return reportOptionHtml(q,q?.answer);
  }
  function recordAnswer(q,correct,value,delta,event='Prueba'){
    return{
      id:q.id,sourceId:q.sourceId||q.id,sector:q.sector,world:sectorNames[q.sector-1]||`Nivel ${q.sector}`,
      topicId:q.topic||'',topic:q.topicLabel||q.topic||sectorNames[q.sector-1]||'Álgebra lineal',
      type:q.badge,questionType:q.type,event,correct,value:String(value),delta,
      timeSec:Math.round((Date.now()-questionStart)/1000),hint:!!q._hintUsed,
      prompt:stripHtml(q.prompt),promptHtml:q.prompt,hintHtml:q.hint||'',explanationHtml:q.explanation||'',
      responseHtml:reportResponseHtml(q,value),correctHtml:reportCorrectHtml(q),visual:reportClone(q.visual),
      gradeValue:Number(q.gradeValue||0),attempts:Number(q._attempts||1)
    };
  }
  function reportMatrixTex(matrix,augmented=false){
    if(!Array.isArray(matrix)||!matrix.length)return'';
    const cols=matrix[0].length,body=matrix.map(row=>row.join('&')).join('\\\\');
    if(augmented&&cols>1)return `\\left[\\begin{array}{${'c'.repeat(cols-1)}|c}${body}\\end{array}\\right]`;
    return `\\begin{bmatrix}${body}\\end{bmatrix}`;
  }
  function reportArrowSvg(x1,y1,x2,y2,color,label){
    const angle=Math.atan2(y2-y1,x2-x1),size=11;
    const p1=[x2-size*Math.cos(angle-.48),y2-size*Math.sin(angle-.48)],p2=[x2-size*Math.cos(angle+.48),y2-size*Math.sin(angle+.48)];
    return `<g stroke="${color}" fill="${color}" stroke-width="4" stroke-linecap="round"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><path d="M${x2},${y2} L${p1[0]},${p1[1]} L${p2[0]},${p2[1]} Z"/><text x="${x2+9}" y="${y2-9}" stroke="none" font-family="Arial" font-size="17" font-weight="800">${escapeHtml(label)}</text></g>`;
  }
  function reportVectorGraphic(v){
    const vectors=[['u',v.u,'#1769d2'],['v',v.v,'#15945f'],['a',v.a,'#1769d2'],['b',v.b,'#15945f'],['proy',v.proj,'#d49a12'],['r',v.result,'#9a42d6']].filter(x=>Array.isArray(x[1])&&x[1].length>=2);
    if(!vectors.length)return'';
    let minX=0,maxX=0,minY=0,maxY=0;vectors.forEach(([,p])=>{minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minY=Math.min(minY,p[1]);maxY=Math.max(maxY,p[1]);});
    const margin=1.3,spanX=Math.max(2,maxX-minX+2*margin),spanY=Math.max(2,maxY-minY+2*margin),W=720,H=360,pad=42,scale=Math.min((W-2*pad)/spanX,(H-2*pad)/spanY),ox=pad+(-minX+margin)*scale,oy=H-pad-( -minY+margin)*scale;
    let grid='';const x0=Math.floor(minX-margin),x1=Math.ceil(maxX+margin),y0=Math.floor(minY-margin),y1=Math.ceil(maxY+margin);
    for(let x=x0;x<=x1;x++){const px=ox+x*scale;grid+=`<line x1="${px}" y1="${pad/2}" x2="${px}" y2="${H-pad/2}"/>`;if(x!==0)grid+=`<text x="${px}" y="${Math.min(H-8,oy+19)}">${x}</text>`;}
    for(let y=y0;y<=y1;y++){const py=oy-y*scale;grid+=`<line x1="${pad/2}" y1="${py}" x2="${W-pad/2}" y2="${py}"/>`;if(y!==0)grid+=`<text x="${Math.max(15,ox-14)}" y="${py+4}" text-anchor="end">${y}</text>`;}
    const arrows=vectors.map(([label,p,color])=>reportArrowSvg(ox,oy,ox+p[0]*scale,oy-p[1]*scale,color,label)).join('');
    return `<figure class="question-graphic"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Representación cartesiana de los vectores"><rect width="100%" height="100%" fill="#fbfdff"/><g stroke="#dce9f7" stroke-width="1">${grid}</g><g stroke="#173a67" stroke-width="2"><line x1="${pad/2}" y1="${oy}" x2="${W-pad/2}" y2="${oy}"/><line x1="${ox}" y1="${pad/2}" x2="${ox}" y2="${H-pad/2}"/></g><g fill="#526984" font-family="Arial" font-size="12" text-anchor="middle">${arrows}</g></svg><figcaption>Representación vectorial asociada a la pregunta.</figcaption></figure>`;
  }
  function reportLinesGraphic(lines){
    if(!Array.isArray(lines)||!lines.length)return'';const W=720,H=360,ox=W/2,oy=H/2,s=42;let grid='';for(let i=-7;i<=7;i++){grid+=`<line x1="${ox+i*s}" y1="18" x2="${ox+i*s}" y2="342"/><line x1="18" y1="${oy+i*s}" x2="702" y2="${oy+i*s}"/>`;}
    const colors=['#1769d2','#e27a2e','#15945f'];const paths=lines.map((L,i)=>{const xa=-8,xb=8,ya=L.m*xa+L.b,yb=L.m*xb+L.b;return `<line x1="${ox+xa*s}" y1="${oy-ya*s}" x2="${ox+xb*s}" y2="${oy-yb*s}" stroke="${colors[i%colors.length]}" stroke-width="4"/>`;}).join('');
    return `<figure class="question-graphic"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Interpretación geométrica del sistema"><rect width="100%" height="100%" fill="#fbfdff"/><g stroke="#dce9f7">${grid}</g><g stroke="#173a67" stroke-width="2"><line x1="18" y1="${oy}" x2="702" y2="${oy}"/><line x1="${ox}" y1="18" x2="${ox}" y2="342"/></g>${paths}</svg><figcaption>Interpretación geométrica del sistema lineal.</figcaption></figure>`;
  }
  function reportVisualHtml(v){
    if(!v)return'';
    if(v.kind==='vectors'||v.kind==='projection')return reportVectorGraphic(v);
    if(v.kind==='systemLines')return reportLinesGraphic(v.lines);
    const blocks=[];
    if(v.A)blocks.push(`<div class="math-display-shell math-display-compact">\\[A=${reportMatrixTex(v.A)}\\]</div>`);
    if(v.B)blocks.push(`<div class="math-display-shell math-display-compact">\\[B=${reportMatrixTex(v.B)}\\]</div>`);
    if(v.C)blocks.push(`<div class="math-display-shell math-display-compact">\\[C=${reportMatrixTex(v.C)}\\]</div>`);
    if(v.matrix)blocks.push(`<div class="math-display-shell">\\[${reportMatrixTex(v.matrix,true)}\\]</div>`);
    if(v.next)blocks.push(`<div class="math-display-shell">\\[${reportMatrixTex(v.next,true)}\\]</div>`);
    if(v.det!==undefined)blocks.push(`<div class="math-display-shell math-display-compact">\\[\\det(A)=${escapeHtml(String(v.det))}\\]</div>`);
    return blocks.length?`<div class="report-visual-math">${blocks.join('')}</div>`:'';
  }
  function reportFormulaData(topicId){
    const map={
      'v2d-ops':{title:'Operaciones y aplicaciones en R²',formula:'\\mathbf u+\\mathbf v=(u_1+v_1,u_2+v_2)',result:'Las operaciones vectoriales se ejecutan componente a componente.',method:'Identifica componentes, conserva el orden y verifica la interpretación geométrica.',error:'Intercambiar componentes o perder el signo de una coordenada.'},
      'v2d-geometry':{title:'Norma, ángulo, dirección y proyecciones',formula:'\\|\\mathbf u\\|=\\sqrt{u_1^2+u_2^2},\\qquad \\operatorname{proj}_{\\mathbf v}(\\mathbf u)=\\frac{\\mathbf u\\cdot\\mathbf v}{\\|\\mathbf v\\|^2}\\mathbf v',result:'La norma mide longitud y el producto punto controla ángulos y proyecciones.',method:'Calcula primero producto punto y normas; simplifica al final.',error:'Dividir por \\(\\|\\mathbf v\\|\\) en lugar de \\(\\|\\mathbf v\\|^2\\).'},
      'v3d-ops':{title:'Operaciones y distancia en R³',formula:'d(P,Q)=\\sqrt{(q_1-p_1)^2+(q_2-p_2)^2+(q_3-p_3)^2}',result:'La geometría euclidiana se extiende a tres componentes.',method:'Forma primero el vector desplazamiento \\(\\overrightarrow{PQ}=Q-P\\).',error:'Sumar coordenadas cuando debe calcularse una diferencia.'},
      'v3d-dot':{title:'Norma, producto punto y ortogonalidad 3D',formula:'\\mathbf u\\cdot\\mathbf v=u_1v_1+u_2v_2+u_3v_3=\\|\\mathbf u\\|\\,\\|\\mathbf v\\|\\cos\\theta',result:'La ortogonalidad equivale a producto punto cero.',method:'Organiza los tres productos antes de sumar y controla los signos.',error:'Omitir la tercera componente o confundir producto punto con producto cruz.'},
      'm22-ops':{title:'Matrices 2×2: operaciones y productos',formula:'(AB)_{ij}=\\sum_k a_{ik}b_{kj},\\qquad (AB)^T=B^TA^T',result:'El producto matricial combina filas de la primera matriz con columnas de la segunda.',method:'Comprueba dimensiones antes de calcular cada entrada.',error:'Multiplicar entrada con entrada o asumir que \\(AB=BA\\).'},
      'm33-ops':{title:'Matrices rectangulares y 3×3',formula:'A_{m\\times n}B_{n\\times p}\\in M_{m\\times p}',result:'Las dimensiones internas deben coincidir y las externas determinan el resultado.',method:'Escribe las dimensiones sobre cada factor antes de operar.',error:'Confundir \\(A^TB\\) con \\(AB^T\\) o invertir el orden.'},
      'm22-systems':{title:'Determinantes y sistemas 2×2',formula:'\\det\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}=ad-bc',result:'Un determinante no nulo garantiza solución única en un sistema cuadrado.',method:'Usa el determinante para anticipar el tipo de solución y luego verifica.',error:'Cambiar el orden de \\(ad-bc\\) o ignorar proporcionalidad entre ecuaciones.'},
      'm33-systems':{title:'Determinantes, sistemas 3×3 y Gauss–Jordan',formula:'[A\\mid\\mathbf b]\\xrightarrow{\\text{operaciones elementales}}\\operatorname{rref}[A\\mid\\mathbf b]',result:'La forma reducida permite leer solución única, infinitas soluciones o inconsistencia.',method:'Registra cada operación y crea pivotes con ceros arriba y abajo.',error:'Operar solo una parte de la fila o interpretar incorrectamente una fila nula.'},
      'mixed-boss':{title:'Retos mixtos multi-etapa',formula:'\\text{modelo}\\;\\longrightarrow\\;A\\mathbf x=\\mathbf b\\;\\longrightarrow\\;\\text{cálculo}\\;\\longrightarrow\\;\\text{interpretación}',result:'Los problemas integradores exigen traducir, calcular y explicar.',method:'Separa datos, variables, ecuaciones y conclusión antes de comenzar.',error:'Dar un resultado numérico sin unidades ni interpretación.'},
      'gauss-boss':{title:'Gauss–Jordan, modelación y jefes finales',formula:'R_i\\leftrightarrow R_j,\\qquad cR_i,\\qquad R_i+cR_j',result:'Las operaciones elementales preservan el conjunto solución.',method:'Elige el pivote que reduzca el trabajo y evita fracciones prematuras.',error:'Aplicar una operación a una sola entrada en vez de a todo el renglón.'}
    };
    return map[topicId]||{title:topicId,formula:'A\\mathbf x=\\mathbf b',result:'Contenido evaluado durante la misión.',method:'Revisa el procedimiento registrado en cada tarjeta.',error:'Omitir la verificación del resultado.'};
  }
  function reportTopicRows(selectedTopics,answers){
    return selectedTopics.map(topic=>{
      const attempts=answers.filter(a=>a.topicId===topic.id),correct=attempts.filter(a=>a.correct).length,total=attempts.length,pct=total?Math.round(correct/total*100):0,points=attempts.reduce((s,a)=>s+Number(a.delta||0),0);
      return{...topic,correct,total,pct,points};
    });
  }
  function reportIntegrityEffect(index){if(index===0)return'Advertencia';if(index<4)return'−0.05';return'<strong>Intento anulado · nota 0.00</strong>';}
  function reportQuestionCard(a,index){
    const status=a.correct?'ok':'bad',hintClass=a.hint?'used':'unused';
    return `<article class="question-card"><div class="qtop"><span>${index+1}</span><div><h3>${escapeHtml(a.topic||a.type||'Álgebra lineal')}</h3><p>${escapeHtml(a.event||'Prueba')} · ${escapeHtml(a.world||`Mundo ${a.sector}`)} · ${escapeHtml(a.type||'Pregunta')}</p></div><b class="${status}">${a.correct?'Correcto':'Incorrecto'}</b></div><div class="latex question-prompt-report"><div class="math-rich-text">${a.promptHtml||escapeHtml(a.prompt||'')}</div></div>${reportVisualHtml(a.visual)}<div class="answer-comparison twocol"><div class="solution"><h4>Respuesta registrada</h4><div class="latex">${a.responseHtml||escapeHtml(a.value||'')}</div></div><div class="solution"><h4>Respuesta correcta</h4><div class="latex">${a.correctHtml||'No disponible'}</div></div></div><div class="hint-report ${hintClass}"><strong>${a.hint?'Pista consultada durante la partida.':'Pista no consultada durante la partida.'}</strong> ${a.hintHtml||'No se registró una pista para esta pregunta.'}</div><div class="solution"><h4>Retroalimentación y procedimiento</h4><div class="latex">${a.explanationHtml||'Revisa el procedimiento y comprueba el resultado sustituyendo en los datos originales.'}</div></div><div class="question-footer-grid"><span><strong>Efecto en nota:</strong> ${Number(a.delta)>0?'+':''}${Number(a.delta||0).toFixed(2)}</span><span><strong>Tiempo:</strong> ${Number(a.timeSec||0)} s</span><span><strong>ID:</strong> ${escapeHtml(String(a.sourceId||a.id))}</span><span><strong>Formato:</strong> ${escapeHtml(a.questionType||a.type||'')}</span></div></article>`;
  }

  async function downloadReport(auto){
    const end=state.endedAt||new Date(),duration=Math.max(0,Math.round((end-(state.startedAt||end))/1000));
    const selectedTopics=WORLD_DEFINITIONS.flatMap(d=>d.topics).filter(t=>state.selectedTopics?.includes(t.id));
    const topicRows=reportTopicRows(selectedTopics,state.answers),academic=state.answers.filter(a=>!String(a.event||'').toLowerCase().includes('nave')),correct=academic.filter(a=>a.correct).length,accuracy=academic.length?Math.round(correct/academic.length*100):0;
    const topicTable=topicRows.map(t=>`<tr><td>${escapeHtml(t.label)}</td><td>${t.correct}/${t.total}</td><td>${t.total?t.pct+'%':'Sin preguntas'}</td><td>${t.points>=0?'+':''}${t.points.toFixed(2)}</td></tr>`).join('');
    const topicBars=topicRows.filter(t=>t.total).map(t=>`<div class="report-bar-row"><div class="report-bar-label"><b>${escapeHtml(t.label)}</b><span>${t.correct}/${t.total} · ${t.pct}%</span></div><div class="report-bar"><i style="width:${t.pct}%"></i></div></div>`).join('');
    const formulas=selectedTopics.map(t=>{const f=reportFormulaData(t.id);return `<article class="formula-block"><h3>${escapeHtml(f.title)}</h3><div class="latex formula-latex">\\[${f.formula}\\]</div><ul><li><strong>Resultado central:</strong> ${f.result}</li><li><strong>Método recomendado:</strong> ${f.method}</li><li><strong>Error frecuente:</strong> ${f.error}</li></ul></article>`;}).join('');
    const integrityRows=state.integrityLog.map((x,i)=>`<tr><td>${i+1}</td><td>${new Date(x.time).toLocaleString('es-CO')}</td><td><strong>${escapeHtml(x.reason||'Incidencia')}</strong>${x.detail?`<br><span class="report-muted">${escapeHtml(x.detail)}</span>`:''}</td><td>${escapeHtml(x.effect||'')||reportIntegrityEffect(i)}</td></tr>`).join('');
    const weakest=[...topicRows].filter(t=>t.total).sort((a,b)=>a.pct-b.pct)[0],insight=state.disqualified?'<div class="report-insight critical"><strong>Lectura rápida:</strong> el intento fue anulado al alcanzar la quinta incidencia de integridad.</div>':weakest&&weakest.pct<70?`<div class="report-insight warning"><strong>Prioridad de mejora:</strong> ${escapeHtml(weakest.label)} presenta ${weakest.pct}% de precisión. Conviene repetir los procedimientos sin pista y verificar cada resultado.</div>`:'<div class="report-insight positive"><strong>Fortaleza:</strong> los temas evaluados muestran un desempeño global sólido. Mantén la práctica y explica cada procedimiento por escrito.</div>';
    const cards=state.answers.map(reportQuestionCard).join('');
    const gradingFormula=`\\[\\text{Nota}=\\underbrace{4.00}_{\\text{temas seleccionados}}+\\underbrace{0.40}_{\\text{escuadras}}+\\underbrace{0.60}_{\\text{jefes finales}},\\qquad 0\\leq \\text{Nota}\\leq 5.00.\\]`;
    let mathjaxSource='';try{const response=await fetch('mathjax-tex-svg.js');if(response.ok)mathjaxSource=(await response.text()).split('</script').join('<\\/script');}catch(_e){}
    const mathLoader=mathjaxSource?`<script>${mathjaxSource}<\/script>`:'<script defer src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-svg-full.js"><\/script>';
    const css=`*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#eef4fc;color:#10243d;font-family:Georgia,"Times New Roman",serif;line-height:1.58}.standalone-report-shell{width:min(1080px,calc(100% - 28px));margin:22px auto 58px}.standalone-report-note{margin:0 0 14px;padding:11px 15px;border-radius:14px;background:#0c3b73;color:#fff;text-align:center;font:800 13px/1.4 Arial,sans-serif}.standalone-report-tools{position:sticky;top:8px;z-index:20;display:flex;justify-content:flex-end;gap:10px;margin:0 0 14px;padding:10px;border:1px solid #c9d9ee;border-radius:16px;background:rgba(247,251,255,.94);backdrop-filter:blur(8px);box-shadow:0 8px 24px rgba(8,35,74,.08)}.standalone-report-tools button{border:0;border-radius:12px;padding:9px 14px;background:#082d76;color:#fff;font-family:Arial,sans-serif;font-weight:800;cursor:pointer}.standalone-report-tools button.secondary{background:#e4edf9;color:#143a72}.adventure-report{width:100%;margin:0 auto}.adventure-report *{box-sizing:border-box;max-width:100%}.adventure-hero,.adventure-section,.question-card{background:#fff;border:1px solid #dfe8f5;border-radius:22px;padding:24px;margin:20px 0;box-shadow:0 10px 28px rgba(8,35,74,.07)}.adventure-hero{background:linear-gradient(145deg,#031327,#073d72 58%,#087f95);color:#fff;text-align:center}.hero-icon{font-size:58px}.adventure-hero h1{margin:8px 0;color:#6ff4ff;font-size:clamp(2rem,5vw,4rem)}.adventure-hero p{margin:5px 0;font-weight:700}.adventure-report h2{margin:0 0 16px;color:#062f8a;border-bottom:3px solid #dfe8f5;padding-bottom:8px;font-size:clamp(1.45rem,3vw,2rem)}.adventure-report h3,.adventure-report h4{color:#0a357d}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:12px 0 16px}.metric{background:#082d76;color:#fff;border-radius:16px;padding:16px}.metric b{display:block;font-size:1.7rem;color:#6ff4ff}.metric span{font-family:Arial,sans-serif;font-size:.86rem;font-weight:800}.report-insight{margin-top:14px;padding:13px 15px;border-radius:14px;border-left:6px solid #50709c;background:#eef4fb}.report-insight.positive{border-color:#15945f;background:#e8f8f0}.report-insight.warning{border-color:#d49a12;background:#fff7da}.report-insight.critical{border-color:#c92c4c;background:#ffecef}.adventure-report table{width:100%;border-collapse:collapse;background:#fff;border-radius:14px;overflow:hidden}.adventure-report td,.adventure-report th{border-bottom:1px solid #e7edf5;padding:10px;text-align:left;vertical-align:top}.adventure-report th{background:#062f8a;color:#fff;font-family:Arial,sans-serif}.topic-progress-list{display:grid;gap:11px;margin-top:18px}.report-bar-label{display:flex;justify-content:space-between;gap:12px;font-family:Arial,sans-serif}.report-bar{height:14px;border-radius:999px;background:#dce7f4;overflow:hidden}.report-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#0d6fe8,#20ad71)}.formula-grid,.twocol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.formula-block{background:#fbfdff;border:1px solid #dfe8f5;border-top:4px solid #1769d2;border-radius:16px;padding:14px}.latex,.solution,.hint-report{background:#f7fbff;border:1px solid #dfe8f5;border-radius:14px;padding:13px;margin:10px 0;overflow-x:auto}.hint-report{background:#fff8d5;border-color:#e5c760}.hint-report.used{border-left:6px solid #d5a625}.hint-report.unused{background:#f7f9fc;border-color:#ccd8e6;border-left:6px solid #879bb5}.solution{background:#f4f9ff;border-left:6px solid #1769d2}.qtop{display:flex;gap:12px;align-items:center}.qtop>span{width:42px;height:42px;min-width:42px;border-radius:50%;display:grid;place-items:center;background:#062f8a;color:#fff;font-family:Arial,sans-serif;font-weight:900}.qtop>div{min-width:0;flex:1}.qtop h3{margin:0}.qtop p{margin:2px 0 0;color:#5c6f8c}.qtop>b{margin-left:auto;padding:8px 13px;border-radius:999px;white-space:nowrap;font-family:Arial,sans-serif}.qtop .ok{background:#e4f8ee;color:#0b754f}.qtop .bad{background:#ffe7ed;color:#a80f32}.question-footer-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px}.question-footer-grid span{padding:10px 12px;background:#eef4ff;border-radius:12px}.question-prompt-report{font-size:1.08rem}.question-graphic{margin:12px auto;width:100%;max-width:780px;border:2px solid #7eaee5;border-radius:18px;background:#fff;overflow:hidden;box-shadow:0 10px 24px rgba(31,83,148,.1)}.question-graphic svg{display:block;width:100%;height:auto}.question-graphic figcaption{padding:8px 12px;background:#eff6ff;color:#174a88;text-align:center;font:800 .8rem/1.35 Arial,sans-serif}.math-display-shell{display:block;width:100%;margin:.65rem 0;padding:.72rem 1rem;border:1px solid #bfd4ef;border-left:6px solid #1769d2;border-radius:14px;background:linear-gradient(180deg,#fbfdff,#edf5ff);overflow-x:auto;text-align:center}.math-display-compact{padding:.55rem .78rem;border-left-width:4px}.choice-mx{display:flex;min-height:2rem;align-items:center;justify-content:center;text-align:center}.adventure-report mjx-container{font-size:116%!important;color:#061f43!important;max-width:100%;overflow-x:auto;overflow-y:hidden}.formula-latex mjx-container{font-size:132%!important}.question-prompt-report mjx-container{font-size:124%!important}mjx-container[jax="SVG"]>svg{overflow:visible;max-width:100%;height:auto;shape-rendering:geometricPrecision}.adventure-footer{text-align:right;color:#667;margin:20px 4px}@media(max-width:780px){.standalone-report-shell{width:calc(100% - 16px);margin-top:8px}.standalone-report-tools{position:static;display:grid;grid-template-columns:1fr 1fr}.metrics,.twocol,.formula-grid,.question-footer-grid{grid-template-columns:1fr}.adventure-hero,.adventure-section,.question-card{padding:16px}.qtop{align-items:flex-start;flex-wrap:wrap}.qtop>b{margin-left:54px}}@media print{@page{size:auto;margin:13mm}body{background:#fff}.standalone-report-shell{width:100%;margin:0}.standalone-report-note,.standalone-report-tools{display:none!important}.adventure-hero,.adventure-section,.question-card{box-shadow:none!important}.adventure-report h2,.qtop{break-after:avoid}.formula-block,.question-graphic{break-inside:avoid}}`;
    const mathConfig=`<script>const __b=String.fromCharCode(92);window.MathJax={tex:{inlineMath:[[__b+'(',__b+')']],displayMath:[[__b+'[',__b+']']],processEscapes:true,processEnvironments:true,packages:{'[+]':['ams']},tags:'none',maxBuffer:40960},svg:{fontCache:'local',scale:1.14,minScale:.78,mtextInheritFont:false,merrorInheritFont:true,displayAlign:'center',internalSpeechTitles:false},options:{enableMenu:false,skipHtmlTags:['script','noscript','style','textarea','pre','code'],renderActions:{addMenu:[]}},startup:{typeset:false}};<\/script>`;
    const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>Informe final · ${escapeHtml(state.student)} · Nexo Vectorial</title><style>${css}</style>${mathConfig}${mathLoader}</head><body><main class="standalone-report-shell"><div class="standalone-report-note">Informe HTML autónomo generado por Nexo Vectorial · MathJax SVG local · Compatible con impresión y guardado como PDF.</div><nav class="standalone-report-tools"><button type="button" onclick="window.print()">Imprimir / Guardar PDF</button><button type="button" class="secondary" onclick="window.scrollTo({top:0,behavior:'smooth'})">Volver al inicio</button></nav><div class="adventure-report"><section class="adventure-hero"><div class="hero-icon">🚀∥A∥</div><h1>Informe Nexo Vectorial</h1><p>Operación Matriz Cero · Álgebra Lineal · Corte 1</p><p>${end.toLocaleString('es-CO')}</p></section><section class="adventure-section"><h2>Resumen de misión</h2><div class="metrics"><div class="metric"><b>${state.score.toFixed(2)}</b><span>Nota final / 5.00</span></div><div class="metric"><b>${securedUnits().toFixed(2)}</b><span>Puntaje asegurado</span></div><div class="metric"><b>${correct}/${academic.length}</b><span>Aciertos académicos</span></div><div class="metric"><b>${accuracy}%</b><span>Precisión académica</span></div><div class="metric"><b>${state.integrity}</b><span>Incidencias de integridad</span></div><div class="metric"><b>${formatTime(duration)}</b><span>Duración</span></div></div><p><strong>Estudiante:</strong> ${escapeHtml(state.student)} · <strong>Estado:</strong> ${state.disqualified?'Intento anulado por integridad':state.score>=3?'Misión aprobada':'Misión no aprobada'} · <strong>SCORM:</strong> nota enviada a Brightspace al finalizar.</p><p><strong>Temas principales seleccionados:</strong> ${(state.selectedMainTopics||[]).map(escapeHtml).join(', ')||'Ninguno registrado'}.</p><p><strong>Subtemas incluidos:</strong> ${selectedTopics.map(t=>escapeHtml(t.label)).join(', ')||'Ninguno registrado'}.</p><p><strong>Combate:</strong> ${state.stats.brownDestroyed||0} asteroides cafés destruidos · ${state.stats.enemiesDestroyed||0} naves destruidas · ${state.stats.bossFormsDefeated||0}/4 fases finales superadas · ${state.stats.astrosCorrect||0} astros brillantes superados (${state.stats.astroQuestionsAdvanced||0} pruebas equivalentes).</p>${insight}</section><section class="adventure-section"><h2>Esquema de calificación</h2><p>${escapeHtml(gradingText())}. La ponderación académica se ajustó automáticamente a los temas seleccionados, pero las escuadras y la nave grande final fueron obligatorias.</p><div class="latex formula-latex">${gradingFormula}</div><div class="twocol"><div class="formula-block"><h3>Distribución</h3><ul><li><strong>Temas:</strong> ${Number(state.grading?.topicPool||4).toFixed(2)} puntos.</li><li><strong>Escuadras:</strong> ${Number(state.grading?.fleetPool||.4).toFixed(2)} puntos.</li><li><strong>Jefes finales:</strong> ${Number(state.grading?.finalBossPool||.6).toFixed(2)} puntos.</li></ul></div><div class="formula-block"><h3>Reglas</h3><ul><li>Una pista conserva el 75% del valor de la pregunta.</li><li>Cada nivel puede asegurar hasta una unidad acumulada.</li><li>La quinta incidencia de integridad anula el intento.</li></ul></div></div></section><section class="adventure-section"><h2>Integridad de la sesión</h2><p>El registro identifica salidas de pantalla completa, cambios de pestaña o minimización, pérdida de foco, clic derecho, copia/corte, recarga, navegación del navegador, captura y atajos restringidos.</p><table><thead><tr><th>#</th><th>Fecha y hora</th><th>Incidencia</th><th>Efecto</th></tr></thead><tbody>${integrityRows||'<tr><td colspan="4">Sin incidencias registradas.</td></tr>'}</tbody></table>${state.disqualified?'<div class="report-insight critical"><strong>Resultado:</strong> el intento fue anulado automáticamente en la quinta incidencia y la nota final quedó en 0.00.</div>':'<div class="report-insight positive"><strong>Resultado:</strong> no se alcanzó el umbral de anulación.</div>'}</section><section class="adventure-section"><h2>Desempeño por tema</h2><table><thead><tr><th>Tema evaluado</th><th>Aciertos</th><th>Porcentaje</th><th>Balance de puntos</th></tr></thead><tbody>${topicTable||'<tr><td colspan="4">Sin temas registrados.</td></tr>'}</tbody></table><div class="topic-progress-list">${topicBars}</div></section><section class="adventure-section"><h2>Plan de mejora</h2>${insight}<p>${recommendation()}</p></section><section class="adventure-section"><h2>Formulario teórico en LaTeX</h2><p>Las fórmulas corresponden a los temas seleccionados y permiten reconstruir los procedimientos de las preguntas.</p><div class="formula-grid">${formulas}</div></section><section class="adventure-section"><h2>Indicadores de misión</h2><div class="twocol"><div class="formula-block"><h3>Desempeño académico</h3><ul><li><strong>Precisión:</strong> ${accuracy}%.</li><li><strong>Pistas utilizadas:</strong> ${state.answers.filter(a=>a.hint).length}.</li><li><strong>Balance académico:</strong> ${state.answers.reduce((s,a)=>s+Number(a.delta||0),0).toFixed(2)} puntos registrados.</li></ul></div><div class="formula-block"><h3>Combate espacial</h3><ul><li><strong>Disparos:</strong> ${state.stats.shotsFired||0}.</li><li><strong>Naves enemigas:</strong> ${state.stats.enemiesDestroyed||0}.</li><li><strong>Daño recibido:</strong> ${Number(state.stats.enemyDamage||0).toFixed(2)}.</li><li><strong>Salvavidas correctos:</strong> ${state.stats.lifesaverCorrect||0}.</li></ul></div></div></section><section class="adventure-section"><h2>Preguntas y retroalimentación</h2><p>Cada tarjeta conserva el enunciado original, la respuesta registrada, la respuesta correcta, la pista, el procedimiento, la gráfica o matriz asociada y el efecto en la nota.</p></section>${cards||'<section class="adventure-section"><p>No se registraron preguntas respondidas.</p></section>'}<footer class="adventure-footer">Nexo Vectorial v3.1 · Informe generado el ${end.toLocaleString('es-CO')}</footer></div></main><script>(function(){const render=()=>{if(!(window.MathJax&&MathJax.startup)){setTimeout(render,60);return;}MathJax.startup.promise.then(()=>{try{MathJax.typesetClear([document.body]);}catch(e){}return MathJax.typesetPromise([document.querySelector('.adventure-report')]);}).then(()=>document.documentElement.classList.add('math-ready')).catch(e=>console.error('MathJax del informe:',e));};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();})();<\/script></body></html>`;
    const blob=new Blob([html],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`Informe_Nexo_Vectorial_${safeName(state.student)}_${new Date().toISOString().replace(/[:.]/g,'-')}.html`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);if(!auto)toast('Informe HTML completo generado.');
  }



  /* ===== v3.0 · Selección y progreso por mundos principales ===== */
  function topicCatalog(){return WORLD_DEFINITIONS.flatMap(def=>def.topics.map(topic=>({...topic,world:def.id,worldName:def.name})));}
  function selectedMainDefinitions(){
    const selected=selectedTopicSet();
    return WORLD_DEFINITIONS.filter(def=>def.topics.some(topic=>selected.has(topic.id)));
  }
  function selectedTopicLabels(){const selected=selectedTopicSet(),catalog=topicCatalog();return catalog.filter(t=>selected.has(t.id));}
  function mainTopicTitle(def){return def.name.replace(/^NIVEL\s+\d+\s*·\s*/i,'');}
  function updateTopicSelectionUI(){
    const main=selectedMainDefinitions(),compact=$('#selectedTopicsCompact'),chips=$('#selectedTopicChips'),launch=$('#launchBtn');
    const valid=main.length>=2&&main.length<=3;
    if(compact)compact.textContent=valid?`${main.length} mundos seleccionados`:`Faltan ${Math.max(0,2-main.length)} mundo${Math.max(0,2-main.length)===1?'':'s'}`;
    if(chips)chips.innerHTML='';
    if(launch){launch.disabled=!valid;launch.setAttribute('aria-disabled',String(!valid));launch.title=valid?'Iniciar con los mundos seleccionados':'Debes elegir como mínimo 2 temas principales';}
  }
  function openTopicSelector(){
    const current=new Set(selectedMainDefinitions().map(def=>String(def.id)));
    const cards=WORLD_DEFINITIONS.map(def=>{
      const details=def.topics.map(topic=>`<li>${escapeHtml(topic.label)}</li>`).join('');
      return `<label class="main-topic-choice"><input type="checkbox" data-modal-main-topic="${def.id}" ${current.has(String(def.id))?'checked':''}><span class="main-topic-choice-copy"><strong>${escapeHtml(mainTopicTitle(def))}</strong><small>Incluye:</small><ul>${details}</ul></span></label>`;
    }).join('');
    showModal('Elegir mundos',`<p class="topic-choice-intro">Cada tema principal se convierte en un mundo completo. Debes elegir <strong>mínimo 2 y máximo 3 mundos</strong>.</p><div id="topicModalGrid" class="topic-modal-grid main-topic-grid">${cards}</div><div id="topicModalStatus" class="topic-modal-status"><span>Selección actual</span><strong>0 / 3</strong></div>`,[
      {label:'CANCELAR',action:closeModal},
      {label:'GUARDAR MUNDOS',action:saveTopicSelection,primary:true}
    ]);
    const boxes=$$('[data-modal-main-topic]'),status=$('#topicModalStatus'),saveButton=$('#modalActions .primary-btn, #modalActions button:last-child');
    const refresh=()=>{
      const count=boxes.filter(b=>b.checked).length,atMax=count>=3,valid=count>=2&&count<=3;
      boxes.forEach(b=>{b.disabled=!b.checked&&atMax;b.closest('.main-topic-choice')?.classList.toggle('disabled-choice',b.disabled);b.closest('.main-topic-choice')?.classList.toggle('selected-choice',b.checked);});
      if(status){status.classList.toggle('invalid',!valid);status.innerHTML=`<span>${count<2?'Debes seleccionar al menos 2 mundos':count===2?'2 mundos seleccionados':'3 mundos seleccionados'}</span><strong>${count} / 3</strong>`;}
      if(saveButton){saveButton.disabled=!valid;saveButton.setAttribute('aria-disabled',String(!valid));}
    };
    boxes.forEach(b=>b.addEventListener('change',()=>{if(boxes.filter(x=>x.checked).length>3){b.checked=false;toast('Solo puedes seleccionar hasta 3 temas principales.');}refresh();}));
    refresh();
  }
  function saveTopicSelection(){
    const chosen=$$('[data-modal-main-topic]:checked').map(x=>Number(x.dataset.modalMainTopic));
    if(chosen.length<2||chosen.length>3){toast('Debes seleccionar mínimo 2 y máximo 3 mundos.');return;}
    const enabledSubtopics=new Set(WORLD_DEFINITIONS.filter(def=>chosen.includes(def.id)).flatMap(def=>def.topics.map(topic=>topic.id)));
    $$('.topic-check').forEach(input=>input.checked=enabledSubtopics.has(input.value));
    updateTopicSelectionUI();closeModal();
  }

  bind=function(){
    els.launch.addEventListener('click',launchGame);els.how.addEventListener('click',showHow);$('#chooseTopicsBtn')?.addEventListener('click',openTopicSelector);
    els.hint.addEventListener('click',showHint);els.submit.addEventListener('click',submitAnswer);els.continue?.addEventListener('click',continueAfterFeedback);els.report.addEventListener('click',()=>downloadReport(false));
    els.finish.addEventListener('click',confirmFinish);els.modalClose.addEventListener('click',closeModal);els.sound.addEventListener('click',toggleSound);
    $$('.side-rail button').forEach(b=>b.addEventListener('click',()=>openPanel(b.dataset.panel)));
    $$('[data-move]').forEach(b=>{const d=b.dataset.move;b.addEventListener('pointerdown',e=>{e.preventDefault();held[d]=true;moveDrone(d);b.setPointerCapture?.(e.pointerId);});['pointerup','pointercancel','pointerleave'].forEach(ev=>b.addEventListener(ev,()=>held[d]=false));});
    fireBtn?.addEventListener('pointerdown',e=>{e.preventDefault();fireLaser();});els.canvas.addEventListener('pointerdown',e=>{if(state.phase==='flight'){e.preventDefault();fireLaser();}});
    window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);
    const evaluationActive=()=>state.mode==='exam'&&!!state.startedAt&&!state.completed;
    document.addEventListener('contextmenu',e=>{if(!state.startedAt||state.completed)return;e.preventDefault();if(evaluationActive())integrityStrike('Intento de clic derecho','El menú contextual fue bloqueado.');});
    document.addEventListener('copy',e=>{if(!evaluationActive())return;e.preventDefault();integrityStrike('Intento de copiar contenido','La copia de contenido fue bloqueada.');});
    document.addEventListener('cut',e=>{if(!evaluationActive())return;e.preventDefault();integrityStrike('Intento de cortar contenido','La extracción de contenido fue bloqueada.');});
    document.addEventListener('selectstart',e=>{if(!evaluationActive())return;const tag=String(e.target?.tagName||'').toUpperCase();if(!['INPUT','TEXTAREA'].includes(tag))e.preventDefault();});
    document.addEventListener('dragstart',e=>{if(!evaluationActive())return;e.preventDefault();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&evaluationActive())integrityStrike('Cambio de pestaña o minimización','La evaluación dejó de estar visible.');});
    window.addEventListener('blur',()=>{Object.keys(held).forEach(k=>held[k]=false);if(evaluationActive()&&document.visibilityState==='visible')integrityStrike('Cambio de foco','La ventana del juego dejó de estar activa.');});
    document.addEventListener('fullscreenchange',handleFullscreenChange);document.addEventListener('webkitfullscreenchange',handleFullscreenChange);els.reenterFullscreen.addEventListener('click',reenterFullscreen);
    const responsive=()=>{resizeAll();if(state.phase==='question'){const q=state.currentChallenge?.q||questions[state.questionIndex];fitMiniCanvas(q);setTimeout(()=>{resizeAll();if(q&&!els.mini.hidden)drawMini(q,performance.now());},45);}};
    window.addEventListener('resize',responsive);window.addEventListener('orientationchange',()=>setTimeout(responsive,220));window.visualViewport?.addEventListener('resize',()=>setTimeout(responsive,70));window.addEventListener('beforeunload',()=>saveProgress());
    updateTopicSelectionUI();
  };

  launchGame=async function(){
    const selected=selectedTopicSet(),selectedMain=selectedMainDefinitions();
    if(selectedMain.length<2||selectedMain.length>3){showModal('Selecciona los mundos','<p>Antes de iniciar debes elegir <b>mínimo 2 y máximo 3 temas principales</b>. Cada tema será un mundo de la campaña.</p>',[{label:'ELEGIR TEMAS',action:()=>{closeModal();openTopicSelector();},primary:true}]);return;}
    state.student=els.name.value.trim()||NVScorm.get('cmi.core.student_name')||'Estudiante Vectorial';state.mode='exam';
    if(!state.integrityAccepted){
      showModal('Regla de integridad',`<div class="integrity-warning"><p>Durante el quiz se cuentan los intentos de captura de pantalla detectables, clic derecho, cambios de pestaña o foco, salida de pantalla completa y atajos restringidos.</p><span class="integrity-critical-line">AL QUINTO BLOQUEO EL QUIZ SE ANULA, LA NOTA QUEDA EN 0.00 Y SE DESCARGA EL INFORME.</span></div>`,[
        {label:'CANCELAR',action:closeModal},
        {label:'ENTENDIDO · INICIAR',action:()=>{state.integrityAccepted=true;closeModal();launchGame();},primary:true}
      ]);return;
    }
    const allowed=await requestGameFullscreen();if(!allowed){showModal('Pantalla completa requerida','<p>Autoriza la pantalla completa para iniciar y conservar visibles el vuelo, las preguntas y las gráficas.</p>',[{label:'REINTENTAR',action:()=>{closeModal();launchGame();},primary:true}]);return;}
    state.seed=(Date.now()^Math.floor(Math.random()*1e9))>>>0;const configured=buildConfiguredMission(state.seed,selected);if(!configured.mission.length){toast('No fue posible construir preguntas con esa selección.');return;}
    questions=configured.mission;blackHoleQuestions=configured.hardMission;bossQuestions=configured.bossMission;sectorNames=configured.activeDefs.map(x=>x.name);
    const grading=buildGradingPlan(questions,configured.activeDefs,selected);questions.forEach(q=>q.gradeValue=grading.questionValues[q.id]);
    Object.assign(state,{questionIndex:0,score:0,energy:5,integrity:0,integrityLog:[],xp:0,sectorProgress:Array(sectorNames.length).fill(0),worldQuestionTotals:configured.activeDefs.map(x=>x.questions||8),selectedTopics:[...selected],selectedWorlds:configured.activeDefs.map(x=>x.id),selectedMainTopics:configured.activeDefs.map(x=>mainTopicTitle(x)),activeWorldLabels:configured.activeDefs.map((x,i)=>`Mundo ${i+1} · ${mainTopicTitle(x)}`),answers:[],hints:0,startedAt:new Date(),endedAt:null,disqualified:false,completed:false,phase:'flight',phaseBeforePause:'flight',currentChallenge:null,blackHoleIndex:0,projectiles:[],mathShot:null,rewind:null,lastShotAt:0,world:1,worldStage:'asteroids',lifesaverFlags:{},lifesaverSerial:0,weaponBoostUntil:0,securedUnits:0,securedLevels:0,bossQuestionSerial:0,grading});
    integrityReportDownloaded=false;integrityCooldownUntil=0;
    state.stats={asteroidHits:0,asteroidsAvoided:0,asteroidsShot:0,brownDestroyed:0,smallDestroyed:0,mediumDestroyed:0,largeDestroyed:0,shotsFired:0,blackHolesEntered:0,blackHoleSuccess:0,blackHoleFails:0,asteroidPenalty:0,blackHolePenalty:0,brownAsteroidHits:0,brownPenalty:0,questionAsteroidsSpawned:0,blueCorrect:0,blueWrong:0,maxAsteroids:0,distance:0,livesLost:0,rewinds:0,enemiesDestroyed:0,enemyDamage:0,enemyShots:0,lifesavers:0,lifesaverCorrect:0,bossFormsDefeated:0,bossDefeated:false,combatScore:0};
    document.body.classList.add('playing');els.boot.hidden=true;els.game.hidden=false;buildSectorDots();resizeAll();renderQuestion();animate(performance.now());saveProgress();
  };

  showHow=function(){showModal('Cómo jugar',`<ol><li><b>Elige mínimo 2 y máximo 3 temas principales</b>. Cada tema elegido se convierte en un mundo y el progreso muestra solamente esos mundos.</li><li>Pilota con flechas o WASD y dispara con Espacio, clic o el botón Fuego.</li><li>Los obstáculos de pregunta detienen la nave. Responde, revisa la retroalimentación y pulsa <b>Continuar</b>.</li><li>Las pistas reducen el valor del acierto. Las preguntas se vuelven más difíciles conforme avanzas.</li><li>Al final de cada nivel aparecen naves enemigas y un jefe. La nave grande final siempre aparece.</li><li>La nota se redistribuye entre los temas seleccionados. Cada nivel superado conserva el puntaje asegurado.</li><li><b>Integridad:</b> cada bloqueo muestra el conteo. Al quinto, el quiz se anula en 0.00 y el informe se descarga automáticamente.</li></ol><p><b>Controles bloqueados:</b> captura de pantalla detectable por el navegador, clic derecho, cambio de pestaña o foco, salida de pantalla completa y atajos restringidos.</p>`);};

  const baseOnKeyUp=onKeyUp;
  onKeyUp=function(e){
    if(state.mode==='exam'&&state.startedAt&&!state.completed&&e.key==='PrintScreen'){
      e.preventDefault();try{navigator.clipboard?.writeText('');}catch(_e){}integrityStrike('Intento de captura de pantalla','Se detectó la tecla de captura de pantalla.');return;
    }
    baseOnKeyUp(e);
  };

  integrityStrike=function(reason,detail=''){
    if(state.mode!=='exam'||state.disqualified||state.completed||!state.startedAt)return;
    const now=Date.now();if(now<integrityCooldownUntil)return;const last=state.integrityLog.at(-1);if(last&&now-last.time<1350)return;integrityCooldownUntil=now+1450;
    state.phaseBeforePause=state.phase==='paused'?(state.phaseBeforePause||'flight'):state.phase;state.phase='paused';Object.keys(held).forEach(k=>held[k]=false);state.integrity++;
    const effect=state.integrity===1?'Advertencia':state.integrity<5?'−0.05':'Quiz anulado · nota 0.00';state.integrityLog.push({time:now,reason,detail,effect,number:state.integrity});
    if(state.integrity>=2&&state.integrity<=4)state.score=Math.max(0,state.score-.05);updateHUD();saveProgress();
    if(state.integrity>=5){
      integrityWarningPending=false;state.disqualified=true;state.score=0;state.completed=true;state.endedAt=new Date();answerLocked=true;pendingContinueAction=null;Object.keys(held).forEach(k=>held[k]=false);[els.hint,els.submit,els.continue,els.finish].filter(Boolean).forEach(b=>b.disabled=true);if(raf){cancelAnimationFrame(raf);raf=0;}NVScorm.finish(0,'failed','integrity-disqualified');updateHUD();if(!integrityReportDownloaded){integrityReportDownloaded=true;setTimeout(()=>downloadReport(true),160);}
      showModal('Quiz anulado · 5/5',`<div class="integrity-warning"><p><strong>Se alcanzó el quinto bloqueo.</strong></p><p>La partida terminó, la nota quedó en <b>0.00 / 5.00</b> y el informe se descargará automáticamente.</p><p>Último bloqueo: ${escapeHtml(reason)}</p></div>`,[{label:'DESCARGAR INFORME',action:()=>downloadReport(false),primary:true}]);return;
    }
    integrityWarningPending=true;const remaining=5-state.integrity,penalty=state.integrity===1?'Este primer bloqueo queda como advertencia.':`Se descontaron 0.05 puntos.`;
    showModal(`Bloqueo ${state.integrity}/5`,`<div class="integrity-warning"><p><strong>${escapeHtml(reason)}</strong></p>${detail?`<p>${escapeHtml(detail)}</p>`:''}<p>${penalty} Quedan <b>${remaining}</b> antes de anular el quiz.</p><span class="integrity-critical-line">5 BLOQUEOS = QUIZ ANULADO Y NOTA 0.00</span></div>`,[{label:'CONTINUAR',action:resumeAfterIntegrityWarning,primary:true}]);
  };

  fitMiniCanvas=function(q){
    if(!q||els.mini.hidden)return;const ph=Math.max(320,questionPanel.clientHeight||innerHeight*.78),pw=questionPanel.clientWidth||innerWidth;const numeric=q.type==='numeric',many=(q.options?.length||0)>=6,longPrompt=stripHtml(q.prompt||'').length>180;questionPanel.classList.toggle('numeric-question',numeric);questionPanel.classList.toggle('many-options',many);questionPanel.classList.toggle('long-question',longPrompt);
    let ratio=numeric?.25:many?.30:.36;if(longPrompt)ratio-=.06;if(innerHeight<720)ratio-=.07;if(pw<620)ratio-=.04;let target=Math.round(ph*ratio);target=Math.max(innerHeight<620?92:110,Math.min(target,innerHeight<720?190:340));els.mini.style.setProperty('--mini-question-height',`${target}px`);els.mini.style.height=`${target}px`;
  };


  buildSectorDots=function(){
    const total=sectorNames.length;
    els.sectorDots.setAttribute('aria-label',`Progreso de ${total} mundos seleccionados`);
    els.sectorDots.dataset.worldCount=String(total);
    els.sectorDots.innerHTML=sectorNames.map((name,i)=>{
      const shortName=mainTopicTitle({name});
      return `<button type="button" class="world-progress-dot" aria-label="Mundo ${i+1} de ${total}: ${escapeHtml(shortName)}" title="Mundo ${i+1}: ${escapeHtml(shortName)}"><span>${i+1}</span><small>${escapeHtml(shortName)}</small></button>`;
    }).join('');
  };


  /* ===== v3.1 · Astros brillantes, brújula y recompensa múltiple ===== */
  const astroCompass=$('#astroCompass'),astroCompassArrow=$('#astroCompassArrow'),astroCompassName=$('#astroCompassName'),astroCompassDistance=$('#astroCompassDistance'),astroMessageText=$('#astroMessageText');
  const MATHEMATICIAN_ASTROS=[
    'GAUSS','EULER','NOETHER','RAMANUJAN','CAYLEY','CRAMER','HAMILTON','JACOBI','HIPATIA','KOVALEVSKAYA','FIBONACCI','LAGRANGE'
  ];

  function hideGuidedAstroUI(){
    if(astroCompass)astroCompass.hidden=true;
    if(astroMessageText)astroMessageText.hidden=true;
  }
  function remainingWorldQuestions(sector){return Math.max(0,worldTarget(sector)-(state.sectorProgress[sector-1]||0));}
  function astroQuestionPool(sector,multiplier){
    let pool=(multiplier>=3?bossQuestions:blackHoleQuestions).filter(q=>q.sector===sector);
    if(!pool.length)pool=(multiplier>=3?bossQuestions:blackHoleQuestions);
    if(!pool.length)pool=questions.filter(q=>q.sector===sector);
    return pool;
  }
  function spawnGuidedAstro(t=performance.now()){
    const s=state.space;if(!s||s.stage!=='asteroids'||s.guidedAstro||remainingWorldQuestions(s.sector)<2)return;
    const multiplier=remainingWorldQuestions(s.sector)>=3&&Math.random()<.48?3:2;
    const serial=(s.astrosSpawned||0)+(s.sector-1)*3;
    const name=MATHEMATICIAN_ASTROS[serial%MATHEMATICIAN_ASTROS.length];
    s.guidedAstro={id:`astro_${Date.now()}_${Math.random()}`,name,multiplier,x:.14+Math.random()*.72,y:-.13,r:.055+Math.random()*.012,speed:.072+Math.min(5,s.sector)*.006,phase:Math.random()*Math.PI*2,bornAt:t,passed:false};
    s.astrosSpawned=(s.astrosSpawned||0)+1;s.nextAstroAt=t+17000+Math.random()*7000;
    state.stats.astrosSpawned=(state.stats.astrosSpawned||0)+1;
    els.arrivalChip.textContent=`ASTRO ${name} DETECTADO · VALE ${multiplier} PRUEBAS`;els.arrivalChip.className='arrival-chip astro-alert';els.arrivalChip.hidden=false;beep(720,.20);setTimeout(()=>{if(els.arrivalChip.textContent.includes(name))els.arrivalChip.hidden=true;},1200);
  }
  function selectAstroQuestion(sector,multiplier){
    const pool=astroQuestionPool(sector,multiplier);if(!pool.length)return null;
    state.astroQuestionSerial=(state.astroQuestionSerial||0)+1;
    const q=cloneQuestion(pool[(state.astroQuestionSerial-1)%pool.length]);q.sector=sector;q.badge=`ASTRO BRILLANTE · VALOR ${multiplier} PRUEBAS`;q.id=`ASTRO-${sector}-${state.astroQuestionSerial}`;return q;
  }
  function updateGuidedAstro(w,h,dt,t){
    const s=state.space;if(!s||s.stage!=='asteroids'){hideGuidedAstroUI();return;}
    if(!s.guidedAstro&&state.phase==='flight'&&t>(s.nextAstroAt||Infinity)&&(s.astrosSpawned||0)<3&&remainingWorldQuestions(s.sector)>=2)spawnGuidedAstro(t);
    const a=s.guidedAstro;if(!a){hideGuidedAstroUI();return;}
    if(state.phase==='flight'){
      a.y+=a.speed*dt;a.x+=Math.sin(t*.0014+a.phase)*.022*dt;a.x=Math.max(.08,Math.min(.92,a.x));
      if(a.y>1.18){state.stats.astrosMissed=(state.stats.astrosMissed||0)+1;s.guidedAstro=null;s.nextAstroAt=t+11000+Math.random()*5000;hideGuidedAstroUI();return;}
      if(t>=(s.invulnerableUntil||0)){
        const sx=w/2+state.drone.x,sy=h*.78+state.drone.y,shipR=Math.max(20,Math.min(w,h)*.034),ax=a.x*w,ay=a.y*h,ar=a.r*Math.min(w,h);
        if(Math.hypot(ax-sx,ay-sy)<shipR+ar*.72){triggerCollision('astro',a);return;}
      }
    }
    updateGuidedAstroUI(w,h,a);
  }
  function updateGuidedAstroUI(w,h,a){
    if(!a||state.phase!=='flight'||state.space?.stage!=='asteroids'){hideGuidedAstroUI();return;}
    const sx=(w/2+state.drone.x)/w,sy=(h*.78+state.drone.y)/h,dx=(a.x-sx)*w,dy=(a.y-sy)*h,angle=Math.atan2(dy,dx)*180/Math.PI,distance=Math.max(0,Math.round(Math.hypot(dx,dy)*1.6));
    if(astroCompass){astroCompass.hidden=false;astroCompassArrow.style.transform=`rotate(${angle}deg)`;}
    if(astroCompassName)astroCompassName.textContent=`ASTRO ${a.name}`;
    if(astroCompassDistance)astroCompassDistance.textContent=`DISTANCIA ${distance} · VALE ${a.multiplier} PRUEBAS`;
    if(astroMessageText){astroMessageText.hidden=false;astroMessageText.textContent=`ASTRO ${a.name} A ${distance} · VALE ${a.multiplier} PRUEBAS`;}
  }
  function drawGuidedAstro(c,w,h,a,t){
    if(!a)return;const x=a.x*w,y=a.y*h,r=a.r*Math.min(w,h),pulse=.82+.18*Math.sin(t/95);c.save();c.translate(x,y);c.globalCompositeOperation='lighter';
    const halo=c.createRadialGradient(0,0,r*.12,0,0,r*2.8);halo.addColorStop(0,'rgba(255,255,240,.95)');halo.addColorStop(.22,'rgba(255,223,108,.72)');halo.addColorStop(.55,'rgba(255,152,38,.24)');halo.addColorStop(1,'rgba(255,160,20,0)');c.fillStyle=halo;c.beginPath();c.arc(0,0,r*2.8*pulse,0,Math.PI*2);c.fill();
    c.rotate(t*.00045);for(let i=0;i<12;i++){const ang=i*Math.PI/6;c.strokeStyle=i%2?'rgba(255,210,85,.55)':'rgba(255,244,184,.82)';c.lineWidth=i%2?2:3;c.beginPath();c.moveTo(Math.cos(ang)*r*.7,Math.sin(ang)*r*.7);c.lineTo(Math.cos(ang)*r*(1.65+.25*Math.sin(t/120+i)),Math.sin(ang)*r*(1.65+.25*Math.sin(t/120+i)));c.stroke();}
    const core=c.createRadialGradient(-r*.25,-r*.3,r*.05,0,0,r);core.addColorStop(0,'#fffef0');core.addColorStop(.38,'#ffe075');core.addColorStop(1,'#b85608');c.fillStyle=core;c.shadowColor='#ffd75d';c.shadowBlur=24;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.shadowBlur=0;c.rotate(-t*.00045);c.fillStyle='#fff8cf';c.textAlign='center';c.font=`900 ${Math.max(9,r*.25)}px Segoe UI`;c.fillText(a.name,0,r*1.58);c.fillStyle='#ffd65f';c.font=`800 ${Math.max(8,r*.19)}px Segoe UI`;c.fillText(`×${a.multiplier} PREGUNTAS`,0,r*1.98);c.restore();
  }
  function coveredQuestionsForAstro(sector,multiplier){
    const out=[];for(let i=state.questionIndex;i<questions.length&&out.length<multiplier;i++){if(questions[i].sector!==sector)break;out.push(questions[i]);}return out;
  }
  function resolveGuidedAstro(correct){
    const ch=state.currentChallenge,s=state.space;if(!ch||ch.kind!=='astro'||!s)return;const sector=ch.sector;
    if(correct){
      const a=s.guidedAstro;if(a){addExplosion(a.x,a.y,a.r*1.5,'math');addScoreFloat(`ASTRO ${a.name} SUPERADO`,a.x,a.y,'life');}
      s.guidedAstro=null;s.nextAstroAt=performance.now()+18000+Math.random()*7000;restoreCollisionPoint(ch.snapshot);s.invulnerableUntil=performance.now()+2100;state.currentChallenge=null;hideChallengeForAction();hideGuidedAstroUI();
      if(state.sectorProgress[sector-1]>=worldTarget(sector)){startEnemyWave(sector);return;}
      activateFlight(`ASTRO ${ch.astroName} SUPERADO · AVANCE ×${ch.advance}`);
    }else{
      s.guidedAstro=null;s.route=s.checkpointRoute||0;s.asteroids=[];s.blackHoles=[];seedAsteroids(76+s.sector*8);s.nextCoreAt=performance.now()+2100;s.nextAstroAt=performance.now()+15000;s.blackHoleAt=performance.now()+10500;s.invulnerableUntil=performance.now()+2700;state.drone.x=0;state.drone.y=0;state.drone.vx=0;state.drone.vy=0;state.currentChallenge=null;hideChallengeForAction();hideGuidedAstroUI();activateFlight(`ASTRO FALLIDO · REINICIO EN PUNTO SEGURO`);
    }
  }

  const baseInitSpaceV31=initSpace;
  initSpace=function(sector,resetShip){baseInitSpaceV31(sector,resetShip);const s=state.space,now=performance.now();s.guidedAstro=null;s.nextAstroAt=now+8500+Math.random()*5000;s.astrosSpawned=0;};

  const baseUpdateAsteroidObjectsV31=updateAsteroidObjects;
  updateAsteroidObjects=function(w,h,dt,t,safe){baseUpdateAsteroidObjectsV31(w,h,dt,t,safe);if(state.phase==='flight')updateGuidedAstro(w,h,dt,t);else updateGuidedAstroUI(w,h,state.space?.guidedAstro);};

  const baseDrawSpaceSceneV31=drawSpaceScene;
  drawSpaceScene=function(c,w,h,t,dt,paused){baseDrawSpaceSceneV31(c,w,h,t,dt,paused);if(state.space?.stage==='asteroids'&&state.space?.guidedAstro)drawGuidedAstro(c,w,h,state.space.guidedAstro,t);};

  const baseTriggerCollisionV31=triggerCollision;
  triggerCollision=function(kind,obj){
    if(kind!=='astro')return baseTriggerCollisionV31(kind,obj);
    if(state.phase!=='flight'||state.completed||performance.now()<(state.space?.invulnerableUntil||0))return;
    const s=state.space,q=selectAstroQuestion(s.sector,obj.multiplier);if(!q)return;
    state.currentChallenge={kind:'astro',objectId:obj.id,astroName:obj.name,multiplier:obj.multiplier,sector:s.sector,q,snapshot:{route:s.route,drone:{...state.drone},sector:s.sector,checkpointRoute:s.checkpointRoute}};
    state.stats.astrosReached=(state.stats.astrosReached||0)+1;s.flashUntil=performance.now()+520;state.phase='impact';hideGuidedAstroUI();els.arrivalChip.textContent=`ASTRO ${obj.name} ALCANZADO · RETO ×${obj.multiplier}`;els.arrivalChip.className='arrival-chip astro-alert';els.arrivalChip.hidden=false;beep(840,.28);spawnBurst('good');setTimeout(()=>{els.arrivalChip.hidden=true;revealChallenge();},470);
  };

  const baseRevealChallengeV31=revealChallenge;
  revealChallenge=async function(){
    const isAstro=state.currentChallenge?.kind==='astro';await baseRevealChallengeV31();if(!isAstro||state.completed)return;const ch=state.currentChallenge;if(!ch)return;
    questionPanel.classList.add('astro-message');questionPanel.classList.remove('asteroid-message','blackhole-message','boss-message','lifesaver-message');
    els.qCount.textContent=`ASTRO ${ch.astroName} · RETO ESPECIAL`;els.qBadge.textContent=`ACIERTA: AVANZA ${ch.multiplier} PRUEBAS · ERROR: REINICIO EN PUNTO SEGURO`;messageKind&&(messageKind.textContent=`ASTRO ${ch.astroName}`);els.instruction.textContent=`Resuelve el reto avanzado del astro ${ch.astroName}. Equivale a ${ch.multiplier} preguntas de asteroide azul.`;
    setFeedback(`Has alcanzado el astro <b>${ch.astroName}</b>. La pregunta es más compleja y puede reemplazar ${ch.multiplier} pruebas normales del mundo.`,'neutral');await typeset();
  };

  const baseSubmitAnswerV31=submitAnswer;
  submitAnswer=function(){
    const ch=state.currentChallenge;if(ch?.kind!=='astro')return baseSubmitAnswerV31();if(answerLocked)return;const q=ch.q;let value=selected;
    if(q.type==='numeric'){const inp=$('#numericAnswer');if(!inp||inp.value===''){toast('Escribe una respuesta numérica.');return;}value=Number(inp.value);}if(value===null){toast('Selecciona una respuesta.');return;}
    q._attempts++;const correct=isCorrectAnswer(q,value);answerLocked=true;els.submit.disabled=true;els.hint.disabled=true;
    if(correct){
      const covered=coveredQuestionsForAstro(ch.sector,ch.multiplier),advance=Math.max(1,covered.length),factor=q._hintUsed?.75:1,reward=covered.reduce((sum,item)=>sum+mainQuestionValue(item),0)*factor;
      ch.advance=advance;state.score=clampScore(state.score+reward);state.sectorProgress[ch.sector-1]=Math.min(worldTarget(ch.sector),(state.sectorProgress[ch.sector-1]||0)+advance);state.questionIndex+=advance;state.xp+=advance*130;state.stats.astrosCorrect=(state.stats.astrosCorrect||0)+1;state.stats.astroQuestionsAdvanced=(state.stats.astroQuestionsAdvanced||0)+advance;
      state.answers.push(recordAnswer(q,true,value,reward,`Astro ${ch.astroName} · avance ×${advance}`));markOptions(q,true,value);setFeedback(`<b>Reto correcto.</b> El astro ${ch.astroName} concede el avance equivalente a <b>${advance} preguntas de asteroide azul</b>${q._hintUsed?' con la reducción correspondiente por uso de pista':''}.<br>${q.explanation}`,'good');beep(1040,.30);updateHUD();saveProgress();offerContinue(()=>resolveGuidedAstro(true),`CONTINUAR · ABSORBER EL ASTRO ${ch.astroName}`);
    }else{
      state.energy=Math.max(0,state.energy-1);if(state.energy<=0)state.energy=2;state.stats.livesLost++;state.stats.astrosWrong=(state.stats.astrosWrong||0)+1;state.answers.push(recordAnswer(q,false,value,0,`Astro ${ch.astroName} · reinicio`));markOptions(q,false,value);setFeedback(`<b>Reto incorrecto.</b> No obtienes avance, pierdes una vida y el mundo se reiniciará desde el último punto seguro.<br>${q.explanation}`,'bad');beep(100,.34);updateHUD();saveProgress();offerContinue(()=>resolveGuidedAstro(false),'CONTINUAR · REINICIAR DESDE EL PUNTO SEGURO');
    }
  };

  const baseActivateFlightV31=activateFlight;
  activateFlight=function(message){baseActivateFlightV31(message);if(state.space?.guidedAstro){const a=state.space.guidedAstro;els.instruction.textContent=`La brújula señala el astro ${a.name}. Alcánzalo: vale ${a.multiplier} preguntas normales.`;}else hideGuidedAstroUI();};

  const baseHideQuestionPanelV31=hideQuestionPanel;
  hideQuestionPanel=function(){baseHideQuestionPanelV31();questionPanel.classList.remove('astro-message');};

  const baseStartEnemyWaveV31=startEnemyWave;
  startEnemyWave=function(sector){if(state.space)state.space.guidedAstro=null;hideGuidedAstroUI();baseStartEnemyWaveV31(sector);};
  const baseStartFinalBossV31=startFinalBoss;
  startFinalBoss=function(){if(state.space)state.space.guidedAstro=null;hideGuidedAstroUI();baseStartFinalBossV31();};
  const baseBeginSectorTransitionV31=beginSectorTransition;
  beginSectorTransition=function(nextSector){hideGuidedAstroUI();baseBeginSectorTransitionV31(nextSector);};

  const baseLaunchGameV31=launchGame;
  launchGame=async function(){await baseLaunchGameV31();if(state.startedAt&&!state.completed&&state.stats){Object.assign(state.stats,{astrosSpawned:0,astrosReached:0,astrosCorrect:0,astrosWrong:0,astrosMissed:0,astroQuestionsAdvanced:0});state.astroQuestionSerial=0;}};

  const baseShowHowV31=showHow;
  showHow=function(){showModal('Cómo jugar',`<ol><li><b>Elige mínimo 2 y máximo 3 temas principales.</b> Cada tema elegido se convierte en un mundo.</li><li>Pilota con flechas o WASD y dispara con Espacio, clic o el botón Fuego.</li><li>Los asteroides azules activan las preguntas normales. Esquivarlos no da nota y la prueba sigue pendiente.</li><li><b>Astros brillantes:</b> aparecen periódicamente con nombres de matemáticos como Gauss, Euler, Noether o Ramanujan. La brújula y la banda superior indican su dirección, distancia y valor.</li><li>Llegar a un astro activa una pregunta más compleja. Un acierto equivale a <b>2 o 3 preguntas normales</b>; un error reinicia el vuelo desde el último punto seguro.</li><li>Al final de cada mundo aparecen naves enemigas y siempre hay una batalla final.</li><li><b>Integridad:</b> cada bloqueo muestra el conteo. Al quinto, el quiz se anula en 0.00 y se descarga el informe.</li></ol>`);};

  const baseDownloadReportV31=downloadReport;
  downloadReport=function(auto){baseDownloadReportV31(auto);};


  init();
})();
