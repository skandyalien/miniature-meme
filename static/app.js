(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const base = location.protocol === 'file:' ? 'http://127.0.0.1:8000' : '';
  const storage = {get(key){try{return localStorage.getItem(key);}catch{return null;}},set(key,value){try{localStorage.setItem(key,value);}catch{}}};
  const state = {
    document: null, selectedFile: null, aiReady: false,
    count: 10, difficulty: 'Balanced', includeDiagrams: true,
    quiz: [], answers: [], index: 0, hintCount: 0, isDemo: false,
    timerHandle: null, secondsLeft: 0, busy: false, controller: null,
    startedAt: null, elapsedHandle: null, chatBusy: false, finishedBatches: 0, totalBatches: 1,
    filename: 'Sample quiz'
  };
  const sample = [
    {id:'sample-1', topic:'PSYCHOPHARMACOLOGY', question:'Which neurotransmitter system is directly enhanced by benzodiazepines?',options:['Dopaminergic signalling at D₂ receptors','GABA-mediated inhibition at GABA-A receptors','Serotonin reuptake inhibition','NMDA receptor activation'],answer_index:1,hint:'Think of the principal inhibitory transmitter in the CNS.',explanation:'Benzodiazepines are positive allosteric modulators of GABA-A receptors. In the presence of GABA, they increase the frequency of chloride-channel opening, promoting neuronal inhibition. They do not directly block serotonin reuptake or activate NMDA receptors.',source_page:1,diagram_page:-1},
    {id:'sample-2', topic:'CLINICAL PSYCHIATRY',question:'Which finding is most consistent with a panic attack?',options:['Progressive memory decline over years','Abrupt intense fear with palpitations and dyspnoea','Persistently elevated mood for two weeks','Fixed false belief without anxiety'],answer_index:1,hint:'Think about onset, peak intensity, and autonomic symptoms.',explanation:'Panic attacks are abrupt surges of intense fear or discomfort, frequently accompanied by palpitations, shortness of breath, sweating, trembling, or fear of dying. They typically peak within minutes. The other options describe syndromes with different core features.',source_page:1,diagram_page:null},
    {id:'sample-3', topic:'PSYCHOPATHOLOGY',question:'A patient believes their neighbours are plotting to harm them despite clear contrary evidence. Which term best describes this?',options:['Obsession','Persecutory delusion','Depersonalisation','Illusion'],answer_index:1,hint:'This is a fixed belief about being targeted.',explanation:'A persecutory delusion involves a fixed false belief that another person or group intends harm, surveillance, harassment, or persecution. An obsession is typically experienced as intrusive and unwanted, while depersonalisation describes a sense of detachment from oneself.',source_page:1,diagram_page:null},
    {id:'sample-4', topic:'COGNITION',question:'Which brain structure has a central role in forming new episodic memories?',options:['Primary visual cortex','Hippocampus','Medulla oblongata','Primary motor cortex'],answer_index:1,hint:'Think of the medial temporal lobe.',explanation:'The hippocampus and nearby medial temporal structures support the encoding and consolidation of new declarative, including episodic, memories. The occipital cortex chiefly processes visual information, and the primary motor cortex is responsible for voluntary motor output.',source_page:1,diagram_page:null},
    {id:'sample-5', topic:'LEARNING SCIENCE',question:'Which approach typically improves long-term retention more than simply rereading a passage?',options:['Retrieval practice with feedback','Highlighting every sentence','Avoiding difficult questions','Cramming only on the last day'],answer_index:0,hint:'Try recalling knowledge before seeing the answer.',explanation:'Active retrieval strengthens the ability to access material later. Feedback corrects errors, and spaced retrieval helps consolidate learning over time. Repeated rereading can feel familiar without ensuring that information can actually be recalled.',source_page:1,diagram_page:null}
  ];

  function showToast(message, ms=4100) {
    const node=document.createElement('div'); node.className='toast';node.setAttribute('role','status');node.textContent=message;
    $('toastContainer').appendChild(node);window.setTimeout(()=>node.remove(),ms);
  }
  function scrollToActive(section='quizView') {
    const compact=window.matchMedia('(max-width:930px)').matches;
    const target=compact&&section!=='welcomeView'?Math.max(0,$('mainArea').getBoundingClientRect().top+window.scrollY-6):0;
    window.scrollTo({top:target,behavior:'instant'});
  }
  function show(section) {
    ['welcomeView','loadingView','quizView','summaryView'].forEach(id=>$(id).classList.toggle('hidden',id!==section));
    if(section!=='loadingView')stopElapsed();
    scrollToActive(section);
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme=theme;
    document.body.dataset.theme=theme;
    storage.set('lumiquiz-theme',theme);
    $('themeIcon').querySelector('use').setAttribute('href',theme==='dark'?'#i-sun':'#i-moon');
    $('themeBtn').setAttribute('aria-label',theme==='dark'?'Switch to light mode':'Switch to dark mode');
  }
  setTheme(storage.get('lumiquiz-theme')==='dark'?'dark':'light');
  $('themeBtn').addEventListener('click',()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));

  async function status() {
    try {
      const response=await fetch(base+'/api/status');if(!response.ok)throw Error('No backend');
      const data=await response.json();state.aiReady=Boolean(data.ai_ready);
      $('aiStatusLabel').textContent=state.aiReady?'AI connected':'Demo mode · add API key';
      $('aiStatus').classList.toggle('ready',state.aiReady);
    } catch { state.aiReady=false;$('aiStatusLabel').textContent='Demo available'; }
  }
  status();

  function countChanged(value) {
    state.count=Math.min(40,Math.max(5,Number(value)||10));
    $('countSlider').value=String(state.count);$('countOutput').textContent=String(state.count);
    $('countSlider').style.setProperty('--range-percent',((state.count-5)/35*100)+'%');
  }
  $('countSlider').addEventListener('input',e=>countChanged(e.target.value));countChanged(10);
  document.querySelectorAll('[data-difficulty]').forEach(btn=>btn.addEventListener('click',()=>{
    state.difficulty=btn.dataset.difficulty;
    document.querySelectorAll('[data-difficulty]').forEach(x=>x.classList.toggle('active',x===btn));
  }));
  $('timerToggle').addEventListener('change',()=>{$('timeRow').classList.toggle('hidden',!$('timerToggle').checked);});
  $('diagramToggle').addEventListener('change',()=>{state.includeDiagrams=$('diagramToggle').checked;});

  async function uploadPDF(file) {
    if(!file || state.busy)return;
    if(!file.name.toLowerCase().endsWith('.pdf'))return showToast('Choose a PDF file.');
    if(file.size>18*1024*1024)return showToast('Maximum PDF size is 18 MB.');
    state.document=null;state.selectedFile=file;state.busy=true;
    $('generateBtn').disabled=true;$('uploadPlaceholder').classList.add('hidden');
    $('filePresent').classList.remove('hidden');$('fileName').textContent=file.name;
    $('fileMeta').textContent='Uploading and checking PDF…';
    try {
      const form=new FormData();form.append('file',file);
      const response=await fetch(base+'/api/upload',{method:'POST',body:form});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(data.detail||'PDF upload failed');
      state.document=data;state.filename=data.filename;
      $('fileMeta').textContent=`${data.pages} pages · ${(data.size/1024/1024).toFixed(2)} MB · ready`;
      $('generateBtn').disabled=false;
      if(!data.has_text)showToast('This appears to be a scanned PDF; visual AI reading will be used during generation.',5800);
      else showToast('PDF ready. Choose your settings and generate your test.');
    }catch(err){
      $('fileMeta').textContent='Upload failed · click to retry';
      showToast(err.message||'Start the backend to upload PDFs.',5700);
    }finally{state.busy=false;$('pdfInput').value='';}
  }
  $('pdfInput').addEventListener('change',e=>uploadPDF(e.target.files?.[0]));
  $('uploadZone').addEventListener('click',e=>{if(e.target!==$('pdfInput'))$('pdfInput').click();});
  $('uploadZone').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();$('pdfInput').click();}});
  ['dragenter','dragover'].forEach(type=>$('uploadZone').addEventListener(type,e=>{e.preventDefault();$('uploadZone').classList.add('dragover');}));
  ['dragleave','drop'].forEach(type=>$('uploadZone').addEventListener(type,e=>{e.preventDefault();$('uploadZone').classList.remove('dragover');}));
  $('uploadZone').addEventListener('drop',e=>uploadPDF(e.dataTransfer?.files?.[0]));
  $('heroUploadBtn').addEventListener('click',()=>{$('pdfInput').click();});

  const timeString=(n)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
  function startElapsed() {
    stopElapsed();state.startedAt=Date.now();state.finishedBatches=0;state.totalBatches=Math.ceil(state.count/10);
    $('loadingBar').style.width='0%';$('loadingPercent').textContent='0% complete';
    $('loadingElapsed').textContent='Elapsed 00:00';
    $('loadingEta').textContent='Estimating time after the first completed batch…';
    state.elapsedHandle=setInterval(()=>{
      const elapsed=Math.floor((Date.now()-state.startedAt)/1000);
      $('loadingElapsed').textContent='Elapsed '+timeString(elapsed);
      if(state.finishedBatches>0){
        const remaining=Math.max(0,Math.ceil((elapsed/state.finishedBatches)*(state.totalBatches-state.finishedBatches)));
        $('loadingEta').textContent=state.finishedBatches===state.totalBatches?'Finishing your test…':`Approx. ${timeString(remaining)} remaining · may vary`;
      }
    },1000);
  }
  function stopElapsed(){if(state.elapsedHandle){clearInterval(state.elapsedHandle);state.elapsedHandle=null;}}
  function loadingProgress(phase, completed=0, total=1, finishedBatches=null) {
    const steps=document.querySelectorAll('.loading-steps span');
    steps.forEach((x,i)=>x.classList.toggle('step-on',i===(phase==='reading'?0:phase==='crafting'?1:2)));
    const words={reading:'Preparing your PDF for question generation…',crafting:`Creating questions from your PDF · batch ${Math.min(completed+1,total)} of ${total}`,reviewing:`Created ${completed} questions. Preparing the next batch…`};
    $('loadingMessage').textContent=words[phase]||'Getting your quiz ready…';
    if(Number.isInteger(finishedBatches)){
      state.finishedBatches=finishedBatches;state.totalBatches=total;
      const percentage=Math.round(100*finishedBatches/Math.max(total,1));
      $('loadingBar').style.width=percentage+'%';
      $('loadingPercent').textContent=percentage+'% complete';
    }
  }
  function cancelGeneration(){if(state.controller)state.controller.abort();state.controller=null;state.busy=false;show('welcomeView');showToast('Generation cancelled in the browser.');}
  $('cancelBtn').addEventListener('click',cancelGeneration);
  async function generate() {
    if(state.busy)return;
    if(!state.document)return showToast('Upload a PDF first, or explore the demo.');
    if(!state.aiReady)return showToast('AI requires OPENAI_API_KEY configured on the Python server. The sample quiz works without it.',5800);
    state.busy=true;state.controller=new AbortController();show('loadingView');startElapsed();loadingProgress('reading');
    try{
      const res=await fetch(base+'/api/quiz/stream',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({document_id:state.document.document_id,count:state.count,difficulty:state.difficulty,include_diagrams:$('diagramToggle').checked}),
        signal:state.controller.signal
      });
      if(!res.ok){const data=await res.json().catch(()=>({}));throw Error(data.detail||'Could not generate questions');}
      if(!res.body)throw Error('Your browser does not support streaming responses.');
      const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='',quizData=null;
      while(true){
        const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});
        let i;while((i=buffer.indexOf('\n'))>=0){
          const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);if(!line)continue;
          const event=JSON.parse(line);
          if(event.type==='progress')loadingProgress('crafting',event.completed,event.total_batches||1);
          if(event.type==='batch_complete')loadingProgress('reviewing',event.completed,event.total_batches||1,event.finished_batches??Math.ceil(event.completed/10));
          if(event.type==='result')quizData=event;
          if(event.type==='error')throw Error(event.message||'AI question generation failed');
        }
      }
      if(!quizData?.questions?.length)throw Error('No questions were returned. Try again or choose fewer questions.');
      state.filename=quizData.document_name||state.filename;
      startQuiz(quizData.questions,false);
      if(quizData.questions.length!==state.count)showToast(`Created ${quizData.questions.length} valid questions (requested ${state.count}).`);
    }catch(err){
      if(err.name!=='AbortError'){show('welcomeView');showToast(err.message||'Generation could not be completed.',6500);}
    }finally{state.busy=false;state.controller=null;stopElapsed();}
  }
  $('generateBtn').addEventListener('click',generate);

  function demo(){state.filename='Sample psychiatry quiz';startQuiz(sample.map(q=>({...q,options:[...q.options]})),true);}
  $('demoBtn').addEventListener('click',demo);
  $('heroDemoBtn').addEventListener('click',demo);

  function stopTimer(){if(state.timerHandle){clearInterval(state.timerHandle);state.timerHandle=null;}}
  function startTimer(){
    stopTimer();if(!$('timerToggle').checked){$('timerPill').classList.add('hidden');return;}
    $('timerPill').classList.remove('hidden');state.secondsLeft=Number($('timerSelect').value)||60;
    $('timeLeft').textContent=timeString(state.secondsLeft);$('timerPill').classList.remove('urgent');
    state.timerHandle=setInterval(()=>{
      if(state.answers[state.index]!==undefined){stopTimer();return;}
      state.secondsLeft=Math.max(0,state.secondsLeft-1);$('timeLeft').textContent=timeString(state.secondsLeft);
      $('timerPill').classList.toggle('urgent',state.secondsLeft<=10);
      if(state.secondsLeft===0)answer(null,'timeout');
    },1000);
  }
  function startQuiz(items,isDemo){
    stopTimer();state.quiz=items;state.index=0;state.answers=Array(items.length).fill(undefined);
    state.hintCount=0;state.isDemo=isDemo;show('quizView');renderQuestion();
  }
  function correctCount(){return state.answers.reduce((n,a,i)=>n+(a===state.quiz[i].answer_index?1:0),0);}
  function renderQuestion(){
    const q=state.quiz[state.index];if(!q)return;
    $('quizSource').textContent=state.isDemo?'SAMPLE PRACTICE TEST':state.filename;
    $('quizTitle').textContent=state.isDemo?'Psychiatry essentials':'Your personalised practice test';
    $('questionCount').textContent=`Question ${state.index+1} of ${state.quiz.length}`;
    $('progressBar').style.width=`${100*(state.index+1)/state.quiz.length}%`;
    $('topicChip').textContent='✦ '+(q.topic||'KEY CONCEPT');
    $('pageChip').textContent=state.isDemo?'Demo practice':`PDF · page ${q.source_page||1}`;
    $('qNumber').textContent=String(state.index+1).padStart(2,'0');
    $('questionText').textContent=q.question;
    $('hintBox').classList.add('hidden');$('hintText').textContent=q.hint||'Look for a clue in the question.';
    $('feedback').className='result-feedback hidden';$('feedback').replaceChildren();
    $('explanationBox').classList.add('hidden');$('explanationText').textContent='';
    $('hintBtn').disabled=false;$('skipBtn').disabled=false;$('nextBtn').classList.add('hidden');
    $('nextBtn').innerHTML=state.index===state.quiz.length-1?'See results <svg class="icon"><use href="#i-arrow"/></svg>':'Next question <svg class="icon"><use href="#i-arrow"/></svg>';
    const options=$('optionsGrid');options.replaceChildren();
    q.options.forEach((text,index)=>{
      const b=document.createElement('button');b.className='option-btn';b.type='button';
      const key=document.createElement('span');key.className='option-letter';key.textContent='ABCD'[index];
      const label=document.createElement('span');label.textContent=text;
      b.append(key,label);b.addEventListener('click',()=>answer(index,'manual'));options.appendChild(b);
    });
    const hasImage=(state.isDemo&&q.diagram_page===-1)||(!state.isDemo&&Number.isInteger(q.diagram_page)&&q.diagram_page>0&&state.document);
    $('diagramContainer').classList.toggle('hidden',!hasImage);
    if(hasImage){
      if(state.isDemo){
        $('diagramImage').src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 580 190"><rect width="580" height="190" rx="12" fill="#f0edff"/><path d="M25 100h530" stroke="#c0b5e2" stroke-width="9"/><rect x="222" y="38" width="130" height="126" rx="32" fill="#987def"/><rect x="276" y="39" width="23" height="125" rx="11" fill="#faf9ff"/><circle cx="160" cy="48" r="20" fill="#74cdb3"/><path d="M180 57l42 35" stroke="#57a593" stroke-width="4" stroke-dasharray="9 5"/><text x="123" y="25" font-family="Arial" font-size="17" fill="#493577">GABA</text><text x="385" y="65" font-family="Arial" font-size="17" fill="#493577">Cl⁻ channel</text><path d="M383 75l-88 31" stroke="#6553b6" stroke-width="2"/></svg>');
        $('diagramLabel').textContent='Illustrative sample diagram';
      }else{
        $('diagramImage').src=`${base}/api/documents/${encodeURIComponent(state.document.document_id)}/pages/${q.diagram_page}/preview`;
        $('diagramLabel').textContent=`Original PDF · page ${q.diagram_page}`;
      }
    }else $('diagramImage').removeAttribute('src');
    startTimer();
  }
  $('diagramImage').addEventListener('error',()=>{$('diagramContainer').classList.add('hidden');showToast('Could not render the original PDF page.');});
  function answer(choice,reason='manual'){
    if(state.answers[state.index]!==undefined)return;
    const q=state.quiz[state.index];if(!q)return;
    state.answers[state.index]=choice;stopTimer();const correct=choice===q.answer_index;
    Array.from($('optionsGrid').children).forEach((b,i)=>{
      b.disabled=true;
      if(i===q.answer_index)b.classList.add('correct');
      if(i===choice && !correct)b.classList.add('incorrect');
      if(i===q.answer_index || i===choice){const tick=document.createElement('strong');tick.style.marginLeft='auto';tick.textContent=i===q.answer_index?'✓':'✕';b.append(tick);}
    });
    const feedback=$('feedback');feedback.classList.remove('hidden');feedback.classList.toggle('good',correct);feedback.classList.toggle('bad',!correct);
    const title=document.createElement('span');title.textContent=correct?'✓ Correct!':reason==='timeout'?'⏱ Time is up':reason==='skip'?'↪ Skipped — learn the answer':'✕ Not quite — keep learning';
    const detail=document.createElement('span');detail.textContent=` Correct answer: ${'ABCD'[q.answer_index]} · ${q.options[q.answer_index]}`;feedback.append(title,detail);
    $('explanationText').textContent=q.explanation||'Review this concept in the source document.';
    $('explanationBox').classList.remove('hidden');$('hintBtn').disabled=true;$('skipBtn').disabled=true;$('nextBtn').classList.remove('hidden');
  }
  $('hintBtn').addEventListener('click',()=>{
    if(state.answers[state.index]!==undefined)return;
    if($('hintBox').classList.contains('hidden')){state.hintCount++;$('hintBox').classList.remove('hidden');}
  });
  $('skipBtn').addEventListener('click',()=>answer(null,'skip'));
  $('nextBtn').addEventListener('click',()=>{
    if(state.answers[state.index]===undefined)return;
    if(state.index>=state.quiz.length-1)return finishQuiz();
    state.index++;renderQuestion();scrollToActive('quizView');
  });
  $('quitBtn').addEventListener('click',()=>{
    if(confirm('End the quiz and view your results?'))finishQuiz();
  });
  function saveResult(result){
    try {const h=JSON.parse(localStorage.getItem('lumiquiz-history')||'[]');h.unshift(result);localStorage.setItem('lumiquiz-history',JSON.stringify(h.slice(0,25)));}catch{}
  }
  function finishQuiz(){
    stopTimer();if(!state.quiz.length)return;
    const answered=state.answers.filter(x=>x!==undefined&&x!==null).length;
    const correct=correctCount(),skipped=state.quiz.length-answered,incorrect=answered-correct;
    const pct=Math.round(100*correct/state.quiz.length);
    $('scorePercent').textContent=pct+'%';$('correctCount').textContent=String(correct);
    $('incorrectCount').textContent=String(incorrect);$('skippedCount').textContent=String(skipped);
    document.querySelector('.score-circle').style.setProperty('--score',pct+'%');
    $('reviewCaption').textContent=`${state.quiz.length} question${state.quiz.length===1?'':'s'} · ${state.hintCount} hints used`;
    const list=$('reviewList');list.replaceChildren();
    state.quiz.forEach((q,i)=>{
      const row=document.createElement('div');row.className='review-entry';
      const badge=document.createElement('span');badge.className='review-status';badge.textContent=state.answers[i]===q.answer_index?'✓ Correct':state.answers[i]===null||state.answers[i]===undefined?'– Skipped':'✕ Incorrect';
      const title=document.createElement('strong');title.textContent=`${i+1}. ${q.question}`;
      const p=document.createElement('p');p.textContent=`Answer: ${'ABCD'[q.answer_index]}. ${q.options[q.answer_index]} — ${q.explanation}`;
      row.append(badge,title,p);list.append(row);
    });
    saveResult({name:state.filename,date:new Date().toISOString(),correct,incorrect,skipped,total:state.quiz.length,percent:pct,hints:state.hintCount});
    show('summaryView');
  }
  $('retakeBtn').addEventListener('click',()=>startQuiz(state.quiz.map(q=>({...q,options:[...q.options]})),state.isDemo));
  $('newQuizBtn').addEventListener('click',()=>show('welcomeView'));
  $('exportBtn').addEventListener('click',()=>{
    const payload={document:state.filename,exported_at:new Date().toISOString(),hints_used:state.hintCount,questions:state.quiz.map((q,i)=>({...q,selected_answer_index:state.answers[i]??null,correct:state.answers[i]===q.answer_index}))};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='lumiquiz-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
  });

  function openChat(){
    $('drawerScrim').classList.remove('hidden');$('chatDrawer').classList.add('open');
    $('chatDrawer').setAttribute('aria-hidden','false');$('chatInput').focus();
  }
  function closeChat(){
    $('drawerScrim').classList.add('hidden');$('chatDrawer').classList.remove('open');
    $('chatDrawer').setAttribute('aria-hidden','true');
  }
  $('askTopBtn').addEventListener('click',openChat);
  $('questionAskBtn').addEventListener('click',openChat);
  $('drawerScrim').addEventListener('click',closeChat);
  $('closeChatBtn').addEventListener('click',closeChat);
  document.addEventListener('keydown',e=>{if(e.key==='Escape') {closeChat();closeImage();}});
  function addChatMessage(text,role){
    const chat=$('chatHistory');const el=document.createElement('div');
    if(role==='user'){el.className='user-bubble';el.textContent=text;}
    else{el.className='assistant-bubble';const avatar=document.createElement('span');avatar.className='chat-avatar';avatar.textContent='✦';const content=document.createElement('div');content.textContent=text;el.append(avatar,content);}
    chat.appendChild(el);chat.scrollTop=chat.scrollHeight;
    return role==='user'?el:el.lastElementChild;
  }
  async function askTutor(message){
    if(state.chatBusy || !message.trim())return;
    state.chatBusy=true;$('sendChatBtn').disabled=true;$('chatInput').value='';
    addChatMessage(message,'user');const output=addChatMessage('Thinking through your question…','ai');
    const q=state.quiz[state.index];
    if(!state.aiReady){
      output.textContent=q?`The AI tutor needs an API key. This question's built-in explanation is:\n\n${q.explanation}\n\nTo get interactive follow-ups, configure OPENAI_API_KEY on your server.`:'To ask the AI tutor about your PDF, configure OPENAI_API_KEY on the server and start a quiz.';
      state.chatBusy=false;$('sendChatBtn').disabled=false;return;
    }
    try {
      const response=await fetch(base+'/api/ask',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({question:q?.question||'Study guidance',answer:q?q.options[q.answer_index]:'',explanation:q?.explanation||'',user_message:message,document_id:state.isDemo?null:state.document?.document_id||null,source_page:q?.source_page||1})
      });
      const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.detail||'Tutor connection failed');
      output.textContent=data.answer||'No explanation returned.';
    }catch(err){output.textContent=`Unable to contact AI: ${err.message}`;}
    finally{state.chatBusy=false;$('sendChatBtn').disabled=false;$('chatHistory').scrollTop=$('chatHistory').scrollHeight;}
  }
  $('chatForm').addEventListener('submit',e=>{e.preventDefault();askTutor($('chatInput').value.trim());});
  $('chatQuick').querySelectorAll('[data-quick]').forEach(b=>b.addEventListener('click',()=>askTutor(b.dataset.quick)));
  $('openChatGPTBtn').addEventListener('click',()=>window.open('https://chatgpt.com/','_blank','noopener,noreferrer'));

  function closeImage(){$('imageModal').classList.add('hidden');}
  $('expandDiagram').addEventListener('click',()=>{
    $('imageModalImg').src=$('diagramImage').src;
    $('imageModal').classList.remove('hidden');
  });
  $('closeImageModal').addEventListener('click',closeImage);
  $('imageModal').addEventListener('click',e=>{if(e.target===$('imageModal'))closeImage();});

  const tilt=document.querySelector('.visual-card');
  if(tilt){
    tilt.addEventListener('pointermove',event=>{
      if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
      const box=tilt.getBoundingClientRect();
      const x=(event.clientX-box.left)/box.width-.5,y=(event.clientY-box.top)/box.height-.5;
      tilt.style.transform=`rotateY(${(x*9).toFixed(1)}deg) rotateX(${(-y*7).toFixed(1)}deg) translateY(-5px)`;
    });
    tilt.addEventListener('pointerleave',()=>{tilt.style.transform='';});
  }
  document.addEventListener('pointermove',event=>{
    const shell=$('siteShell');if(shell){shell.style.setProperty('--pointer-x',event.clientX+'px');shell.style.setProperty('--pointer-y',event.clientY+'px');}
  },{passive:true});
  show('welcomeView');
})();
