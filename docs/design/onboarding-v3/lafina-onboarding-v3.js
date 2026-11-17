(() => {
  const root = document.getElementById('lafina-onboarding-preview');
  const screen = root.querySelector('#lf-screen');
  const config = {theme:'system',motion:true,width:360};
  const safe = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initialDraft = () => ({loaded:false,student:'Alex Dela Cruz',campus:'Cagayan de Oro',program:'BS Information Technology',year:'2nd year',section:'IT2A',term:'Sample semester · AY 2026–2027',start:'2026-11-16',end:'2027-03-20',studentOK:false,academicOK:false,termOK:false,acknowledged:[],courses:[
    {sourceCode:'SE101',code:'SE101',title:'Software Engineering',units:'3',included:true,reviewed:false,tba:false,meetings:[{days:['Mon'],start:'09:00',end:'10:30',room:'302',faculty:'M. Reyes',section:'IT2A',reviewed:false},{days:['Wed'],start:'13:00',end:'16:00',room:'Lab 3',faculty:'M. Reyes',section:'IT2A',reviewed:false}]},
    {sourceCode:'DB201',code:'DB201',title:'Database Systems',units:'3',included:true,reviewed:false,tba:false,meetings:[{days:['Tue'],start:'',end:'',room:'204',faculty:'J. Santos',section:'IT2A',reviewed:false}]},
    {sourceCode:'CAP200',code:'CAP200',title:'Capstone Project',units:'2',included:true,reviewed:false,tba:false,meetings:[{days:['Mon'],start:'09:00',end:'10:00',room:'201',faculty:'R. Cruz',section:'IT2A',reviewed:false}]},
    {sourceCode:'PE204',code:'PE204',title:'Physical Education',units:'1',included:true,reviewed:false,tba:true,meetings:[]}
  ]});
  const state={version:3,stage:'details',studentMode:'unselected',page:1,view:'upload',c:0,m:0,keyboard:false,focusField:'',error:'',sourceReturn:null,memoryPart:null,ready:false,exploring:false,draftSaved:false,saved:null,previousSaved:null,name:'Alex',tone:'casual',goal:'deadlines',campus:'',program:'',year:'',wake:'07:00',sleep:'22:00',study:['Evening'],response:'balanced',lead:'15',memory:true,remember:{identity:true,academic:true,study:true,style:true},draft:initialDraft()};
  const history=[];
  const navKeys=['stage','page','view','c','m','memoryPart','ready','exploring'];
  const snap=()=>Object.fromEntries(navKeys.map(k=>[k,state[k]]));
  const course=()=>state.draft.courses[state.c];
  const meeting=()=>course()?.meetings[state.m];
  const displayName=()=>{const first=state.name.trim().split(/\s+/)[0];return first&&first.length<=18?first:'there';};
  const brand='<div class="lf-brand"><span class="lf-brand-mark">✦</span>LAFINA</div>';
  const dots=(count,page)=>'<div class="lf-dots" aria-label="Page '+(page+1)+' of '+count+'">'+Array.from({length:count},(_,i)=>'<span class="'+(i===page?'active':'')+'"></span>').join('')+'</div>';
  const primary=(label,action='next')=>'<button type="button" class="lf-primary" data-action="'+action+'"><span>'+label+'</span><span aria-hidden="true">→</span></button>';
  const tag=(text,tone='')=>'<span class="lf-tag '+tone+'">'+safe(text)+'</span>';
  const note=text=>text?'<div class="lf-note"><span class="lf-note-mark">◇</span><span>'+text+'</span></div>':'';
  const button=(label,action,cls='lf-secondary')=>'<button type="button" class="'+cls+'" data-action="'+action+'">'+label+'</button>';
  const field=(label,key,value,type='text',max=80)=>'<div class="'+(state.focusField===key?'lf-focus-field':'')+'"><label class="lf-label" for="lf-'+key+'">'+label+'</label><input id="lf-'+key+'" class="lf-input" data-field="'+key+'" value="'+safe(value)+'" type="'+type+'" '+(type==='text'?'maxlength="'+max+'"':'')+' autocomplete="off"></div>';
  const choice=(label,key,value,selected)=>'<button type="button" class="lf-choice" data-choice="'+key+'" data-value="'+safe(value)+'" aria-pressed="'+selected+'">'+label+'</button>';
  const error=()=>state.error?'<div class="lf-error" role="alert">'+safe(state.error)+'</div>':'';
  const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const timeLabel=t=>{if(!t)return 'Needs time';const [h,m]=t.split(':').map(Number);return (h%12||12)+':'+String(m).padStart(2,'0')+' '+(h>=12?'PM':'AM');};
  const validMeeting=m=>Boolean(m&&m.days.length&&m.start&&m.end&&m.end>m.start);
  const courseReady=c=>!c.included||(c.reviewed&&c.code.trim()&&c.title.trim()&&(c.tba||c.meetings.length>0)&&c.meetings.every(m=>m.reviewed&&validMeeting(m)));
  function conflicts(){const a=[];state.draft.courses.forEach((c,ci)=>{if(c.included)c.meetings.forEach((m,mi)=>{if(validMeeting(m))a.push({c,ci,m,mi});});});const pairs=[];for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const x=a[i],y=a[j];if(x.m.days.some(d=>y.m.days.includes(d))&&x.m.start<y.m.end&&y.m.start<x.m.end){const key=JSON.stringify([x.ci,x.mi,x.m.days,x.m.start,x.m.end,y.ci,y.mi,y.m.days,y.m.start,y.m.end]);if(!state.draft.acknowledged.includes(key))pairs.push({x,y,key});}}return pairs;}
  const pending=()=>state.draft.courses.filter(c=>!courseReady(c)).length;
  const countMeetings=()=>state.draft.courses.filter(c=>c.included).reduce((n,c)=>n+c.meetings.length,0);
  const canCommit=()=>isUstp()&&state.draft.loaded&&state.draft.studentOK&&state.draft.academicOK&&state.draft.termOK&&!pending()&&!conflicts().length;
  function persist(){window.openai?.setWidgetState?.({modelContent:{version:3,stage:state.stage,page:state.page,view:state.view,studentMode:state.studentMode},privateContent:{version:3,...snap(),studentMode:state.studentMode}})?.catch(()=>{});}
  function go(update,remember=true){if(remember)history.push(snap());Object.assign(state,{keyboard:false,focusField:'',error:'',memoryPart:null,exploring:false},update);render();persist();}
  function back(){if(state.keyboard){state.keyboard=false;render();return;}if(history.length){Object.assign(state,{error:'',keyboard:false},history.pop());render();persist();return;}if(state.stage==='cor')go({stage:'details',page:2},false);else if(state.page>0)go({page:state.page-1},false);else go({stage:'intro',page:0},false);}
  function wrap(title,copy,body,actionLabel='Continue',action='next',secondary='Skip for now',secondaryAction='next',opts={}){
    if(state.error)state.keyboard=false;
    const cor=state.stage==='cor';const head=opts.head||(cor?'COR review · '+(opts.step||'Draft'):'Make it yours · '+(state.page+1)+' of 8');
    body=state.error?body.replace(/<div class="lf-error">.*?<\/div>/g,''):body;
    const canSource=cor&&!['gated','upload','scanerror','success','saveerror','source','draftsaved'].includes(state.view);
    return '<div class="lf-setup lf-enter '+(state.keyboard?'lf-keyboard-open':'')+'"><header class="lf-top">'+button('←','back','lf-text-btn lf-back')+'<span class="lf-step-label">'+safe(head)+'</span>'+(canSource?button('Source','source','lf-text-btn lf-source-top'):'<span style="width:48px"></span>')+'</header><div class="lf-progress" aria-label="Progress">'+Array.from({length:cor?5:8},(_,i)=>'<span class="'+(i<=(cor?(opts.progress??1):state.page)?'active':'')+'"></span>').join('')+'</div><main class="lf-form-main lf-compact"><h2>'+title+'</h2><p class="lf-copy">'+copy+'</p><div class="lf-fields">'+body+error()+'</div>'+note(opts.note||'')+'</main><footer class="lf-footer">'+primary(actionLabel,action)+button(secondary,secondaryAction,'lf-center-link')+'</footer>'+(state.keyboard?keyboard():'')+'</div>';
  }
  // INSERT_ACCEPTED_INTRO
  introPages.splice(2,0,{eye:'YOUR USTP HANDBOOK, WITH YOU',title:'Ask anything<br>about USTP.',copy:'USTP handbook answers, even offline.<br>With sources you can check.',demo:'<div class="lf-handbook-demo"><div class="lf-handbook-question">How does the grading system work?</div><div class="lf-handbook-answer">'+tag('Offline · Handbook','good')+'<p>Grades use 0.25 increments from 1 to 5. A grade of 1 is highest; 3 is the lowest passing grade.</p>'+button('2023 Handbook · Ch. 14 · Art. 1 · p. 50 ↗','handbook-source','lf-source-cite')+'</div></div>'});
  function handbookSource(){return wrap('A source you<br>can check.','USTP Student Handbook · 2023 Edition','<div class="lf-paper-excerpt"><span class="lf-mini-muted">CHAPTER 14 · GRADES · PAGE 50</span><p><strong>Art. 1. Grading System</strong></p><p>The grading system uses number grades in multiples of 0.25 from 1 to 5, where 1 is highest and 3 is the lowest passing grade.</p></div><div class="lf-notice">From the 2023 handbook. Check newer university notices for updates.</div>','Back to introduction','close-source','Continue introduction','intro-continue',{head:'Handbook source'});}
  const schoolEnabled=()=>state.studentMode==='ustp'&&Boolean(state.saved?.studentOK&&state.saved?.academicOK&&state.saved?.termOK&&state.saved.courses.every(courseReady));
  const isUstp=()=>state.studentMode==='ustp';
  const readonlyValue=(label,value)=>'<div class="lf-readonly-field"><span class="lf-label">'+safe(label)+'</span><div class="lf-readonly-value">'+safe(value||'Not detected · replace COR')+'</div></div>';
  function affiliationPage(){
    if(state.studentMode==='other')return wrap('Scheduling,<br>just for you.','Your plans work without USTP school features.','<div class="lf-tag-row">'+tag('Scheduling mode','good')+'</div><div class="lf-slim-row">Calendar & tasks<span>Available</span></div><div class="lf-slim-row">Reminders<span>Available</span></div><div class="lf-slim-row">USTP handbook & profile<span>Unavailable</span></div>','Continue with scheduling','next','I’m a USTP student','choose-ustp',{note:'No campus, program, or COR needed.'});
    if(schoolEnabled())return wrap('Your USTP details,<br>from your COR.','These details come from your confirmed document.',readonlyValue('Campus',state.saved.campus)+readonlyValue('Program',state.saved.program)+'<div class="lf-tag-row">'+tag('COR reviewed by you','good')+tag('USTP handbook available','good')+'</div>','Continue','next','Review my COR','cor');
    return wrap('Start with<br>your USTP COR.','Campus and program come from your COR.','<div class="lf-import-box"><div class="lf-document" aria-hidden="true"><span></span><span></span><span></span></div><span class="lf-import-title">Your USTP student setup</span><p class="lf-copy" style="font-size:13px">Add your COR, check the detected details, and confirm your schedule.</p></div>'+button('I’ll add my COR later','defer-cor','lf-cancel-note'),'Set up my USTP COR','choose-ustp','I’m not a USTP student','choose-other',{note:isUstp()?'COR pending. Scheduling works; USTP features stay unavailable.':'USTP handbook features become available after COR confirmation.'});
  }
  function schoolGate(){
    const other=state.studentMode==='other';
    return wrap(other?'Your scheduling<br>space is ready.':'Finish your<br>USTP setup. ',other?'USTP school features are not part of this mode.':'Confirm your COR to use USTP school features.','<div class="lf-tag-row">'+tag(other?'Scheduling mode':'COR setup pending')+'</div><div class="lf-slim-row">Calendar, tasks & reminders<span>Available</span></div><div class="lf-slim-row">USTP offline handbook<span>Unavailable</span></div><div class="lf-notice">'+(other?'No campus or program is requested. You can change your student setup later.':'Campus and program are read from your COR. Continue scheduling while setup is pending.')+'</div>',other?'Continue scheduling':'Set up my COR',other?'return-scheduling':'choose-ustp',other?'I’m a USTP student':'Schedule for now',other?'choose-ustp':'return-scheduling',{head:'Student setup'});
  }
  function chooseAffiliation(mode){
    state.studentMode=mode;
    if(mode==='other'){
      if(state.goal==='handbook')state.goal='schedule';
      state.remember.academic=false;
      return go({stage:'details',page:1,view:'',ready:false,memoryPart:null});
    }
    return go({stage:'cor',page:0,view:state.saved?'final':state.draft.loaded?'subjects':'upload',ready:false});
  }

  function details(){
    if(state.ready)return wrap((state.name.length<=18?'You’re ready,<br>'+safe(state.name||'student')+'.':'Your space is ready.'),'Your space is ready. Let’s show you around.','<div class="lf-ready-illustration">✓</div><div class="lf-slim-row">Experience<span>'+(state.studentMode==='other'?'Scheduling only':schoolEnabled()?'COR reviewed and added':'COR setup pending')+'</span></div><div class="lf-slim-row">Personal memory<span>'+(state.memory?'Your selected facts':'Off')+'</span></div><div class="lf-slim-row">Your preferences<span>Ready to use</span></div>','Take a quick tour','tour','Explore on my own','explore',{head:'All set'});
    if(state.memoryPart!==null)return memoryDetail();
    if(state.page===0)return wrap('First, what should<br>we call you?','A small introduction, so this feels like you.',field('Preferred name · optional','name',state.name,'text',60)+'<div class="lf-tone-field"><span class="lf-label">How should LAFINA talk?</span><div class="lf-choice-row">'+choice('Casual','tone','casual',state.tone==='casual')+choice('Professional','tone','professional',state.tone==='professional')+'</div></div>','Continue','next','Skip for now','next',{note:'You’ll choose what LAFINA remembers at the end.'});
    if(state.page===2)return wrap('What would help<br>you most?','Choose a starting point. You can use everything.','<div class="lf-list">'+[['deadlines','D','Keep up with deadlines','Start with a reminder'],['schedule','S','Organize my day','Start with my schedule'],['handbook','U','Understand USTP policies','Start with a handbook question']].filter(([v])=>v!=='handbook'||schoolEnabled()).map(([v,s,t,d])=>'<button type="button" class="lf-option" data-choice="goal" data-value="'+v+'" aria-pressed="'+(state.goal===v)+'"><span class="lf-option-symbol">'+s+'</span><span class="lf-option-text">'+t+'<small>'+d+'</small></span><span class="lf-radio"></span></button>').join('')+'</div>','Continue','next','Choose later','next');
    if(state.page===1)return affiliationPage();
    if(state.page===3)return wrap('A day that works<br>around you.','Choose when your day usually starts and ends.','<div class="lf-time-row"><span class="lf-time-name">Wake up<small>Your usual start</small></span><input type="time" data-field="wake" aria-label="Wake-up time" value="'+state.wake+'"></div><div class="lf-time-row"><span class="lf-time-name">Wind down<small>Your usual bedtime</small></span><input type="time" data-field="sleep" aria-label="Bedtime" value="'+state.sleep+'"></div>','Continue','next','Use defaults','next',{note:'A preference for planning, not a fixed rule.'});
    if(state.page===4)return wrap((state.studentMode==='other'?'When does focus<br>feel easiest?':'When does studying<br>feel easiest?'),'Choose any that fit, or keep it flexible.','<div class="lf-reminder-options">'+['Morning','Afternoon','Evening','Night'].map(v=>choice(v,'study',v,state.study.includes(v))).join('')+'</div>'+choice('Flexible · no preference','study','Flexible',state.study.includes('Flexible'))+'<div class="lf-goal-note">Your timetable shows class gaps. You decide whether those gaps are free time.</div>','Continue','next','Choose later','skip-study');
    if(state.page===5)return wrap('Answers that<br>feel right for you.','How much detail would you usually like?','<div class="lf-list">'+[['short','Short & direct','The essentials first'],['balanced','A helpful balance','A clear answer with some context'],['detailed','Explain it step by step','More detail when a topic needs it']].map(([v,t,d])=>'<button type="button" class="lf-option" data-choice="response" data-value="'+v+'" aria-pressed="'+(state.response===v)+'"><span class="lf-option-text">'+t+'<small>'+d+'</small></span><span class="lf-radio"></span></button>').join('')+'</div>','Continue','next','Use a helpful balance','default-response');
    if(state.page===6)return wrap('A little heads-up.','When would you like your reminders?','<div class="lf-reminder-options">'+[['0','At the time'],['15','15 min before'],['30','30 min before'],['60','1 hour before']].map(([v,l])=>choice(l,'lead',v,state.lead===v)).join('')+'</div><div class="lf-sample"><div class="lf-sample-heading">Example · Assignment due at 6 PM</div><div class="lf-sample-title">Reminder at '+({'0':'6:00 PM','15':'5:45 PM','30':'5:30 PM','60':'5:00 PM'}[state.lead])+'</div><div class="lf-sample-body">Notification access comes when you enable it.</div></div>','Continue','next','Use 15 minutes','default-lead');
    return memoryOverview();
  }
  const memoryLabels={identity:'Name & conversation tone',academic:'Academic profile',study:state.studentMode==='other'?'Focus preferences':'Study preferences',style:'Goals & answer style'};
  function memoryOverview(){return wrap('Make memory yours.','Stored locally; used with online AI when enabled.','<label class="lf-check-row lf-memory-master"><input type="checkbox" data-memory-master '+(state.memory?'checked':'')+'><span><strong>Personal memory</strong><small>Your calendar still works.</small></span></label><div>'+Object.entries(memoryLabels).filter(([k])=>k!=='academic'||schoolEnabled()).map(([k,label])=>'<div class="lf-memory-row"><label class="lf-check-row"><input type="checkbox" data-memory="'+k+'" '+(state.remember[k]?'checked':'')+' '+(!state.memory?'disabled':'')+'><span>'+(k==='study'&&state.studentMode==='other'?'Focus preferences':label)+'</span></label><button type="button" data-memory-view="'+k+'">Review</button></div>').join('')+'</div>','Save preferences','setup-finish','Keep memory off','memory-off',{note:'No student ID, age, or gender in AI memory.'});}
  function memoryDetail(){const key=state.memoryPart;if(key==='academic'&&!schoolEnabled())return schoolGate();const facts={identity:'Call me '+(state.name||'student')+'. Use a '+state.tone+' tone.',academic:schoolEnabled()?state.saved.program+' · '+state.saved.year+' · '+state.saved.campus:'No USTP academic memory',study:state.study.length?'Preferred study time: '+state.study.join(', ')+'.':'No study-time preference saved.',style:({deadlines:'Help me keep up with deadlines.',schedule:'Help me organize my academic day.',handbook:schoolEnabled()?'Help me understand USTP policies.':'Help me organize my schedule.'}[state.goal]||'No goal selected.')+' Answer style: '+state.response+'.'};return wrap('Your memory,<br>your choice.',safe(memoryLabels[key]),'<div class="lf-fact">'+safe(facts[key])+'</div><label class="lf-check-row"><input type="checkbox" data-memory="'+key+'" '+(state.remember[key]&&state.memory?'checked':'')+' '+(!state.memory?'disabled':'')+'><span>Remember this for conversations</span></label><div class="lf-notice">'+(state.memory?'You can remove this later in Profile.':'Memory is off. This fact will not be saved as memory.')+'</div>','Back to memory review','memory-back','Edit these details','memory-edit',{head:'Memory review'});}
  function cor(){
    if(!isUstp())return schoolGate();
    const d=state.draft,c=course(),m=meeting();const opts={step:'Draft',note:'',progress:1};
    if(state.view==='upload')return wrap('Your COR.<br>Your say.','Try the review with a fictional sample document.','<div class="lf-import-box"><div class="lf-document" aria-hidden="true"><span></span><span></span><span></span></div><span class="lf-import-title">Sample USTP COR</span><p class="lf-copy" style="font-size:13px">A PDF or a clear screenshot in the app.</p>'+tag('Preview only · No file uploaded')+'</div>','Use sample COR','load-cor','Add later','leave-cor',{...opts,progress:0,note:'Nothing enters Calendar until you confirm.'});
    if(state.view==='scanerror')return wrap('Let’s try<br>a clearer copy.','We couldn’t read the schedule in this sample.','<div class="lf-error" role="alert">The class table is unclear. Your current schedule has not changed.</div><div class="lf-notice">Try another PDF or a sharper screenshot, or continue scheduling while COR setup is pending.</div>','Try sample again','load-cor','Set up my COR later','defer-cor',{progress:0});
    if(state.view==='document')return wrap('First, check<br>what we found.','Detection is a draft. You’ll verify every meeting.','<div class="lf-detected"><div class="lf-mini-title">Sample COR · Alex Dela Cruz</div><div class="lf-tag-row">'+tag(d.courses.length+' subjects')+tag(countMeetings()+' weekly meetings')+tag('1 TBA subject')+'</div><div class="lf-slim-row">Unclear time<span>DB201</span></div><div class="lf-slim-row">Possible overlap<span>SE101 / CAP200</span></div></div><div class="lf-notice">Check the source if something looks missing. You can add a subject or another meeting.</div>','Check student details','student','Replace sample file','replace-cor',opts);
    if(state.view==='student')return wrap('Is this<br>your COR?','Confirm the student and campus.',field('Name on COR','cor-student',d.student)+readonlyValue('Campus · from COR',d.campus)+'<div class="lf-notice">Your preferred name stays '+safe(state.name||'unchanged')+'. Wrong campus? Replace the COR.</div>','Confirm student details','student-confirm','This is not my COR','replace-cor',{...opts,step:'Student · 1 of 2'});
    if(state.view==='academic')return wrap('Check your<br>academic details.','Check the COR. Replace it if the program is wrong.',readonlyValue('Program · from COR',d.program)+field('Year level','cor-year',d.year)+field('Section','cor-section',d.section),'Confirm academic details','academic-confirm','Save draft for later','save-draft',{...opts,step:'Student · 2 of 2'});
    if(state.view==='term')return wrap('When should<br>classes repeat?','These example dates need your confirmation.',field('Term / academic year','cor-term',d.term)+'<div class="lf-field-pair">'+field('First class date','cor-start',d.start,'date')+field('Last class date','cor-end',d.end,'date')+'</div><div class="lf-goal-note">Repeat weekly within these dates. Confirm against your semester schedule.</div>','Confirm term dates','term-confirm','Save draft for later','save-draft',{...opts,progress:2,step:'Term dates'});
    if(state.view==='subjects')return wrap('Review your<br>subjects.','Open each subject to check every meeting.','<div>'+d.courses.slice(state.listPage*4,state.listPage*4+4).map((x,i)=>'<button type="button" class="lf-course-row" data-course="'+(state.listPage*4+i)+'"><span>'+safe(x.code)+'<small>'+safe(x.title)+' · '+(x.tba?'TBA':x.meetings.length+' meeting(s)')+'</small></span>'+tag(!x.included?'Excluded':courseReady(x)?'Reviewed':'Review',courseReady(x)&&x.included?'good':'')+'</button>').join('')+'</div><div class="lf-inline-actions">'+button('+ Missing subject','add-course')+(d.courses.length>4?button('Next subjects →','list-next'):'')+'</div>','Continue review','subjects-next','Save draft for later','save-draft',{...opts,progress:2,step:'Subjects · '+(state.listPage+1)});
    if(state.view==='subject')return wrap('Check the<br>subject details.',safe(c.code||'New subject')+' · '+(state.c+1)+' of '+d.courses.length,field('Subject code','course-code',c.code,'text',20)+field('Subject title','course-title',c.title)+field('Credit units','course-units',c.units,'number'),'Confirm subject','subject-confirm',c.included?'Exclude this subject':'Include this subject','toggle-course',{...opts,progress:2,step:'Subject details'});
    if(state.view==='meeting')return wrap('Check days<br>and times.',safe(c.code)+' · Meeting '+(state.m+1)+' of '+c.meetings.length,'<div><span class="lf-label">Class days</span><div class="lf-days">'+days.map(day=>'<button type="button" data-day="'+day+'" aria-pressed="'+m.days.includes(day)+'" aria-label="'+({Mon:'Monday',Tue:'Tuesday',Wed:'Wednesday',Thu:'Thursday',Fri:'Friday',Sat:'Saturday',Sun:'Sunday'}[day])+'">'+day.slice(0,2)+'</button>').join('')+'</div></div><div class="lf-field-pair">'+field('Start time','meeting-start',m.start,'time')+field('End time','meeting-end',m.end,'time')+'</div>'+(!validMeeting(m)?'<div class="lf-error">Confirm days and AM/PM. The detected time may be incomplete.</div>':'<div class="lf-goal-note">'+safe(m.days.join(', '))+' · '+timeLabel(m.start)+'–'+timeLabel(m.end)+'</div>')+'<div class="lf-day-caption"><span>Compare with the source above.</span>'+button('Use sample times','sample-time','lf-cancel-note')+'</div>','Check room & instructor','meeting-next','Save draft for later','save-draft',{...opts,progress:3,step:'Meeting · 1 of 2'});
    if(state.view==='location')return wrap('The right place.<br>The right class.',safe(c.code)+' · Meeting '+(state.m+1)+' of '+c.meetings.length,field('Room / location','meeting-room',m.room)+field('Instructor · optional','meeting-faculty',m.faculty)+field('Section','meeting-section',m.section),'Confirm this meeting','meeting-confirm','Remove this meeting','remove-meeting',{...opts,progress:3,step:'Meeting · 2 of 2'});
    if(state.view==='course-done')return wrap('One subject, checked.',safe(c.code)+' · Your reviewed selections','<div class="lf-tag-row">'+tag(c.tba?'Kept without a timed block':c.meetings.filter(x=>x.reviewed).length+' meetings reviewed','good')+'</div><div class="lf-slim-row">Credit units<span>'+safe(c.units)+'</span></div><div class="lf-slim-row">Calendar status<span>'+(c.included?'Included':'Excluded')+'</span></div><div class="lf-inline-actions">'+button('Edit subject','edit-subject')+button('+ Meeting','add-meeting')+'</div>','Next subject','next-course','Back to subject list','subjects',{...opts,progress:3,step:'Reviewed by you'});
    if(state.view==='tba')return wrap('No time<br>listed yet.','This subject can stay without a Calendar block.','<div class="lf-fact"><strong>'+safe(c.code)+'</strong><br>'+safe(c.title)+'<div class="lf-tag-row">'+tag('TBA / flexible')+'</div></div><div class="lf-notice">We won’t guess a day or time. Add a meeting now if you know the correct details.</div>','Keep as subject only','keep-tba','Add a timed meeting','add-meeting',{...opts,progress:3,step:'Unscheduled subject'});
    if(state.view==='conflicts'){
      const pair=conflicts()[0];if(!pair)return wrap('No unresolved<br>overlaps.','Your reviewed meetings are ready for a final check.','<div class="lf-ready-illustration">✓</div>','Final import review','final','Back to subjects','subjects',{progress:4,step:'Overlap review'});
      const block=x=>'<div class="lf-detected"><strong style="font-size:14px">'+safe(x.c.code)+' · '+safe(x.c.title)+'</strong><div class="lf-event-desc">'+safe(x.m.days.join(', '))+' · '+timeLabel(x.m.start)+'–'+timeLabel(x.m.end)+'</div></div>';
      return wrap('These meetings<br>overlap.','Check the source before changing class times.',block(pair.x)+block(pair.y)+'<div class="lf-inline-actions">'+button('Edit '+safe(pair.y.c.code),'conflict-edit')+button('Exclude '+safe(pair.y.c.code),'conflict-exclude')+'</div>','Keep both · I checked','conflict-keep','Back to subjects','subjects',{progress:4,step:'Overlap review'});
    }
    if(state.view==='final'){
      const included=d.courses.filter(x=>x.included).length;const ready=canCommit();
      return wrap('Confirm your schedule.','Review what will change on this phone.','<div class="lf-tag-row">'+tag(ready?'Reviewed by you':'Review still needed',ready?'good':'attention')+'</div><button type="button" class="lf-slim-row lf-summary-edit" data-action="subjects">Subjects<span>'+included+' included · '+(d.courses.length-included)+' excluded ↗</span></button><div class="lf-slim-row">Weekly meetings<span>'+countMeetings()+'</span></div><button type="button" class="lf-slim-row lf-summary-edit" data-action="term">Repeat dates<span>'+safe(d.start)+' → '+safe(d.end)+' ↗</span></button><div class="lf-slim-row">Pending review<span>'+pending()+' subjects · '+conflicts().length+' overlaps</span></div>',''+(ready?'Confirm & add schedule':'Review pending items'),ready?'commit':'pending','Save draft for later','save-draft',{progress:4,step:'Final confirmation',note:'Confirm each item before adding it to Calendar.'});
    }
    if(state.view==='saveerror')return wrap('Your draft<br>is still here.','Example save failure · nothing was added.','<div class="lf-error" role="alert">Couldn’t save the import. Your existing schedule is unchanged.</div><div class="lf-notice">Your corrections are kept in this preview. Retry after resolving the issue.</div>','Try again','commit','Back to final review','final',{progress:4,step:'Save failed'});
    if(state.view==='draftsaved')return wrap('Pick up<br>where you left off.','Your review progress is kept in this preview.','<div class="lf-fact">'+pending()+' subjects still need review.<br>Nothing has been added to Calendar.</div>','Resume COR review','subjects','Continue setup without import','leave-cor',{progress:2,step:'Draft retained'});
    if(state.view==='success')return wrap('Your schedule,<br>reviewed and ready.','Only the confirmed draft was added to this preview.','<div class="lf-ready-illustration">✓</div><div class="lf-slim-row">Subjects<span>'+state.saved.courses.filter(x=>x.included).length+'</span></div><div class="lf-slim-row">Weekly meetings<span>'+state.saved.courses.filter(x=>x.included).reduce((n,x)=>n+x.meetings.length,0)+'</span></div><div class="lf-notice">You can edit classes later. Reconfirming this same draft won’t create duplicates.</div>','Return to personalization','return-setup','Undo this preview import','undo-import',{progress:4,step:'Import complete'});
    if(state.view==='source')return sourceView();
    return '';
  }
  function sourceView(){
    const c=course();let body='';const from=state.sourceReturn?.view;
    if(['subject','meeting','location','course-done','tba','conflicts'].includes(from)){
      const original={SE101:'SE101 · Software Engineering · 3 units<br>Mon 9:00–10:30 AM · Room 302<br>Wed 1:00–4:00 PM · Lab 3<br>M. Reyes · IT2A',DB201:'DB201 · Database Systems · 3 units<br>Tue 11:00 AM–12:00 PM · Room 204<br>J. Santos · IT2A',CAP200:'CAP200 · Capstone Project · 2 units<br>Tue 2:00–3:00 PM · Room 201<br>R. Cruz · IT2A',PE204:'PE204 · Physical Education · 1 unit<br>Schedule: TBA / flexible'};
      body=original[c?.sourceCode]||'No original excerpt for a manually added subject.<br>Enter the details you know and verify them.';
    }else body='SAMPLE CERTIFICATE OF REGISTRATION<br><br>Alex Dela Cruz<br>Cagayan de Oro · BS Information Technology<br>2nd year · IT2A<br><br>4 subjects · 9 credit units<br>Term dates must be confirmed separately.';
    return wrap('Compare with<br>the source.','Fictional sample COR excerpt.','<div class="lf-paper-excerpt">'+body+'</div><div class="lf-notice">Viewing the source does not confirm your draft.</div>','Back to editing','close-source','Return to editing','close-source',{head:'Original comparison',progress:2});
  }
  // INSERT_ACCEPTED_TOUR
  const detailsNames=['Name & tone','Student setup','Your main goal','Daily routine','Study preferences','Answer style','Reminder timing','Memory review'];
  const corViews=[['upload','Choose COR'],['document','Extraction summary'],['student','Student & campus'],['academic','Program, year & section'],['term','Term dates'],['subjects','Subject review list'],['subject','Edit subject'],['meeting','Edit days & times'],['location','Room & instructor'],['tba','Unscheduled subject'],['conflicts','Resolve overlaps'],['final','Final confirmation'],['scanerror','Unreadable COR'],['saveerror','Save failure'],['draftsaved','Resume draft']];
  function render(){
    if(state.goal==='handbook'&&!schoolEnabled())state.goal='schedule';
    if(state.stage==='cor'&&!isUstp())state.view='gated';
    state.c=Math.max(0,Math.min(state.c,state.draft.courses.length-1));state.m=Math.max(0,Math.min(state.m,Math.max(0,course().meetings.length-1)));state.listPage=state.listPage||0;
    root.style.colorScheme=config.theme==='system'?'light dark':config.theme;root.style.setProperty('--lf-phone-width',config.width+'px');root.dataset.motion=config.motion?'on':'off';
    screen.innerHTML=state.stage==='intro'?(state.page===2&&state.studentMode==='other'?schoolGate():state.view==='handbook-source'?handbookSource():intro()):state.stage==='details'?details():state.stage==='cor'?cor():tour();
    if(state.exploring){screen.querySelector('.lf-coach')?.remove();screen.querySelector('.lf-tour-dim')?.remove();}
    root.querySelectorAll('[data-stage]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.stage===state.stage)));
    const stageLabel={intro:'Introduction',details:'Personalization',cor:'COR verification',tour:'Walkthrough'}[state.stage];root.querySelector('#lf-preview-label').textContent=root.querySelector('.lf-phone').clientWidth+' × 640 · '+stageLabel;
    const keyToggle=root.querySelector('#lf-keyboard-toggle');keyToggle.hidden=!screen.querySelector('input[type=text]');keyToggle.textContent=state.keyboard?'Hide keyboard':'Show keyboard';keyToggle.setAttribute('aria-pressed',String(state.keyboard));
    root.querySelector('#lf-page-label').textContent=state.stage==='intro'?'Meet LAFINA · '+(state.page+1)+' of 4':state.stage==='details'?(state.ready?'Setup complete':detailsNames[state.page]+' · '+(state.page+1)+' / 8'):state.stage==='cor'?'COR · '+(corViews.find(x=>x[0]===state.view)?.[1]||state.view):'Quick tour · '+(state.page+1)+' of 3';
    root.querySelector('#lf-prev').disabled=state.stage==='intro'&&state.page===0&&state.view!=='handbook-source';
    const jump=root.querySelector('#lf-jump');const options=state.stage==='intro'?introPages.map((p,i)=>[String(i),['Meet LAFINA','Say it. Plan it.','Ask about USTP','On your phone'][i]]):state.stage==='details'?detailsNames.map((x,i)=>[String(i),x]):state.stage==='cor'?(isUstp()?corViews:[['gated','School features unavailable']]):tourInfo.map((p,i)=>[String(i),p.tab+' walkthrough']);
    jump.innerHTML=options.map(([v,l])=>'<option value="'+v+'">'+safe(l)+'</option>').join('');jump.value=state.stage==='cor'?state.view:String(state.page);
    if(globalThis.lucide)lucide.createIcons({attrs:{width:20,height:20}});
  }
  function next(){
    if(state.stage==='intro'){if(state.page<3)go({page:state.page+1,view:''});else go({stage:'details',page:0,view:''});}
    else if(state.stage==='details'){if(state.ready)go({stage:'tour',page:0});else if(state.page<7)go({page:state.page+1});else go({ready:true});}
    else if(state.stage==='tour'){if(state.page<2)go({page:state.page+1});else explore();}
    else corNext();
  }
  function explore(){go({stage:'tour',page:state.goal==='schedule'?1:state.goal==='handbook'?2:0,exploring:true});}
  function ensureLoaded(){state.draft.loaded=true;}
  function corGo(view,extra={}){ensureLoaded();go({stage:'cor',view,...extra});}
  function reviewNext(){const i=state.draft.courses.findIndex(c=>!courseReady(c));if(i>=0)corGo('subject',{c:i,m:0});else corGo(conflicts().length?'conflicts':'final');}
  function validateTerm(){const d=state.draft;if(!d.term.trim()||!d.start||!d.end||d.end<d.start){state.error='Choose a term and an end date on or after the start date.';render();return false;}return true;}
  function corNext(){const map={upload:'load-cor',document:'student',student:'student-confirm',academic:'academic-confirm',term:'term-confirm',subjects:'subjects-next',subject:'subject-confirm',meeting:'meeting-next',location:'meeting-confirm','course-done':'next-course',tba:'keep-tba',conflicts:'conflict-keep',final:canCommit()?'commit':'pending',saveerror:'commit',success:'return-setup',scanerror:'load-cor',draftsaved:'subjects',source:'close-source'};action(map[state.view]||'subjects');}
  function action(a){
    if(a==='choose-other')return chooseAffiliation('other');
    if(a==='choose-ustp')return chooseAffiliation('ustp');
    if(a==='return-scheduling')return go({stage:'details',page:2,view:'',ready:false});
    if(a==='defer-cor'){state.studentMode='ustp';return go({stage:'details',page:2,view:'',ready:false});}
    if(['load-cor','commit','pending','student','academic','term','subjects','conflicts','final'].includes(a)&&!isUstp())return go({stage:'cor',view:'gated'});
    if(a==='next')return next();if(a==='back')return back();
    if(a==='details')return go({stage:'details',page:0,view:''});if(a==='tour')return go({stage:'tour',page:0});if(a==='explore')return explore();
    if(a==='account'||a==='signin')return go({stage:'details',page:0,view:''});
    if(a==='handbook-source'&&!schoolEnabled())return go({stage:'cor',view:'gated'});
    if(a==='handbook-source'){state.sourceReturn=snap();return go({view:'handbook-source'});}
    if(a==='intro-continue')return go({stage:'intro',view:'',page:3});
    if(a==='close-source'){const previous=state.sourceReturn;state.sourceReturn=null;if(previous)return go(previous);return back();}
    if(a==='source'){state.sourceReturn=snap();return corGo('source');}
    if(a==='skip-study'){state.study=[];return next();}if(a==='default-response'){state.response='balanced';return next();}if(a==='default-lead'){state.lead='15';return next();}
    if(a==='memory-off'){state.memory=false;return go({ready:true});}if(a==='setup-finish')return go({ready:true});if(a==='memory-back')return go({memoryPart:null});
    if(a==='memory-edit'){const page={identity:0,academic:1,study:4,style:5}[state.memoryPart];return go({page,memoryPart:null});}
    if(a==='cor'&&!isUstp())return go({stage:'details',page:1,view:'',ready:false});
    if(a==='cor')return go({stage:'cor',view:state.saved?'final':state.draft.loaded?'subjects':'upload',c:0,m:0});
    if(a==='load-cor'){state.draft=initialDraft();state.draft.loaded=true;return corGo('document',{c:0,m:0,listPage:0});}
    if(a==='replace-cor')return go({stage:'cor',view:'upload'});
    if(a==='leave-cor'||a==='return-setup')return go({stage:'details',page:1,view:''});
    if(a==='manual')return action('defer-cor');
    if(['student','academic','term','subjects','conflicts','final'].includes(a))return corGo(a);
    if(a==='student-confirm'){if(!state.draft.student.trim()||!state.draft.campus.trim()){state.error='Check the student name. If campus is missing, replace this COR.';return render();}state.draft.studentOK=true;return corGo('academic');}
    if(a==='academic-confirm'){if(!state.draft.program.trim()||!state.draft.year.trim()){state.error='Confirm the year level. If program is missing, replace this COR.';return render();}state.draft.academicOK=true;return corGo('term');}
    if(a==='term-confirm'){if(!validateTerm())return;state.draft.termOK=true;return corGo('subjects');}
    if(a==='subjects-next'||a==='pending'){if(!state.draft.studentOK)return corGo('student');if(!state.draft.academicOK)return corGo('academic');if(!state.draft.termOK)return corGo('term');return reviewNext();}
    if(a==='subject-confirm'){const c=course();if(!c.code.trim()||!c.title.trim()||!Number.isFinite(Number(c.units))||Number(c.units)<0){state.error='Enter a subject code, title, and valid credit units.';return render();}c.included=true;c.reviewed=true;state.m=0;return corGo(c.meetings.length?'meeting':'tba');}
    if(a==='toggle-course'){course().included=!course().included;return corGo('subjects');}
    if(a==='meeting-next'){if(!validMeeting(meeting())){state.error='Choose class days and valid start/end times, including AM/PM.';return render();}return corGo('location');}
    if(a==='meeting-back')return corGo('meeting');
    if(a==='remove-meeting'){course().meetings.splice(state.m,1);course().reviewed=false;course().tba=course().meetings.length===0;return corGo('subject',{m:0});}
    if(a==='meeting-confirm'){if(!validMeeting(meeting()))return corGo('meeting');meeting().reviewed=true;course().tba=false;if(state.m+1<course().meetings.length)return corGo('meeting',{m:state.m+1});return corGo('course-done');}
    if(a==='next-course'){if(state.c+1<state.draft.courses.length)return corGo('subject',{c:state.c+1,m:0});return corGo(conflicts().length?'conflicts':'final');}
    if(a==='edit-subject')return corGo('subject');
    if(a==='sample-time'){const m=meeting();if(course().sourceCode==='DB201'){m.start='11:00';m.end='12:00';}else if(course().sourceCode==='CAP200'){m.days=['Tue'];m.start='14:00';m.end='15:00';}else{m.start='09:00';m.end='10:00';}m.reviewed=false;state.error='';return render();}
    if(a==='keep-tba'){course().reviewed=true;course().tba=true;return corGo('course-done');}
    if(a==='add-meeting'){course().meetings.push({days:[],start:'',end:'',room:'',faculty:'',section:state.draft.section,reviewed:false});course().tba=false;return corGo('meeting',{m:course().meetings.length-1});}
    if(a==='add-course'){state.draft.courses.push({code:'',title:'',units:'0',included:true,reviewed:false,tba:false,meetings:[]});return corGo('subject',{c:state.draft.courses.length-1,m:0});}
    if(a==='list-next'){state.listPage=(state.listPage+1)%Math.ceil(state.draft.courses.length/4);return render();}
    if(a?.startsWith('conflict-')){const pair=conflicts()[0];if(!pair)return corGo('final');if(a==='conflict-edit')return corGo('meeting',{c:pair.y.ci,m:pair.y.mi});if(a==='conflict-exclude')state.draft.courses[pair.y.ci].included=false;if(a==='conflict-keep')state.draft.acknowledged.push(pair.key);return corGo(conflicts().length?'conflicts':'final');}
    if(a==='save-draft'){state.draftSaved=true;return corGo('draftsaved');}
    if(a==='commit'){if(!canCommit())return action('pending');if(JSON.stringify(state.saved)!==JSON.stringify(state.draft))state.previousSaved=state.saved;state.saved=JSON.parse(JSON.stringify(state.draft));state.campus=state.saved.campus;state.program=state.saved.program;state.year=state.saved.year;return corGo('success');}
    if(a==='undo-import'){state.saved=state.previousSaved;state.previousSaved=null;return corGo('final');}
  }
  function setField(key,value){
    if(['campus','program','cor-campus','cor-program'].includes(key))return;
    if(!isUstp()&&(key.startsWith('cor-')||key.startsWith('course-')||key.startsWith('meeting-')))return;
    if(key.startsWith('cor-')){const k=key.slice(4);state.draft[k]=value;if(['student','campus'].includes(k))state.draft.studentOK=false;else if(['program','year','section'].includes(k))state.draft.academicOK=false;else state.draft.termOK=false;}
    else if(key.startsWith('course-')){course()[key.slice(7)]=value;course().reviewed=false;}
    else if(key.startsWith('meeting-')){meeting()[key.slice(8)]=value;meeting().reviewed=false;}
    else state[key]=value;state.error='';
  }
  root.addEventListener('input',e=>{if(e.target.dataset.field)setField(e.target.dataset.field,e.target.value);});
  root.addEventListener('change',e=>{
    const el=e.target;
    if(el.id==='lf-jump'){if(state.stage==='cor'){ensureLoaded();go({view:el.value,c:el.value==='meeting'?1:el.value==='tba'?3:0,m:0});}else go({page:Number(el.value),view:'',ready:false});return;}
    if(el.id==='lf-width'){config.width=Number(el.value);return render();}
    if(el.hasAttribute('data-memory-master')){state.memory=el.checked;return render();}
    if(el.dataset.memory){state.remember[el.dataset.memory]=el.checked;return render();}
    if(el.dataset.field){setField(el.dataset.field,el.value);if(el.type!=='text')render();}
  });
  root.addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.stage==='cor'&&!isUstp())return go({stage:'details',page:1,view:'',ready:false});
    if(b.dataset.stage)return go({stage:b.dataset.stage,page:0,view:b.dataset.stage==='cor'?(state.draft.loaded?'subjects':'upload'):'',ready:false});
    if(b.id==='lf-prev')return back();if(b.id==='lf-next')return next();
    if(b.id==='lf-keyboard-toggle'){state.keyboard=!state.keyboard;if(state.keyboard){const f=screen.querySelector('input[type=text]');state.focusField=f?.dataset.field||'';}return render();}
    if(b.dataset.memoryView)return go({memoryPart:b.dataset.memoryView});
    if(b.dataset.course!==undefined)return corGo('subject',{c:Number(b.dataset.course),m:0});
    if(b.dataset.day){const d=b.dataset.day;const m=meeting();m.days=m.days.includes(d)?m.days.filter(x=>x!==d):[...m.days,d];m.reviewed=false;state.error='';return render();}
    if(b.dataset.choice){const k=b.dataset.choice,v=b.dataset.value;if(k==='goal'&&v==='handbook'&&!schoolEnabled())return go({stage:'cor',view:'gated'});if(k==='study'){state.study=v==='Flexible'?['Flexible']:state.study.includes(v)?state.study.filter(x=>x!==v):[...state.study.filter(x=>x!=='Flexible'),v];}else state[k]=v;return render();}
    if(b.dataset.tourtab){const i=['Home','Schedule','AI'].indexOf(b.dataset.tourtab);if(i>=0)return go({stage:'tour',page:i});return;}
    action(b.dataset.action);
  });
  const stored=window.openai?.widgetState?.privateContent;
  if(stored?.version===3&&['intro','details','cor','tour'].includes(stored.stage)){Object.assign(state,stored);if(state.stage==='cor')state.draft.loaded=true;}
  window.addEventListener('openai:set_globals',e=>{const s=e.detail?.globals?.widgetState?.privateContent;if(s?.version===3&&['intro','details','cor','tour'].includes(s.stage)){Object.assign(state,s);if(state.stage==='cor')state.draft.loaded=true;render();}});
  render();
  if(globalThis.Tweak){const tweak=new Tweak({container:root,onChange:render});tweak.addSelect(config,'theme',{label:'Appearance',options:['system','light','dark']});tweak.addToggle(config,'motion',{label:'Motion'});}
  window.lafinaMockReview={schoolEnabled,isUstp,state,render,config,action,setField,initialDraft,canCommit,conflicts,courseReady,validMeeting};
})();
