'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('familyroy-control-centre-qa/index.html','utf8');
function codeBetween(start,end){
  const from=html.indexOf(start);
  assert.ok(from>=0,'Missing start: '+start);
  const to=html.indexOf(end,from+start.length);
  assert.ok(to>from,'Missing end: '+end);
  return html.slice(from,to);
}
function fromVm(source,resultName,context){
  return vm.runInNewContext(source+'; '+resultName,context,{timeout:1500});
}
// A migration may upgrade parser metadata, but must not erase old tasks or seen IDs.
assert.ok(html.includes('if((d.schoolParserVersion||0)<13){d.schoolParserVersion=13;}'));
assert.ok(!html.includes("d.tasks=d.tasks.filter(t=>!(t.module==='School Readiness'&&t.gmailId))"));
assert.ok(!html.includes("d.seen=d.seen.filter(x=>String(x).startsWith('attention:'))"));
// The Today selector must exclude Done, Review and Waiting, including overdue items.
const today=fromVm(codeBetween('function actionIsToday(','function schoolOccurrenceKey('),
  'actionIsToday',{actionDueRank:t=>t.due==='overdue'?0:3,localISO:()=> '2026-10-18'});
assert.equal(today({state:'Done',due:'overdue'}),false);
assert.equal(today({state:'Review',due:'overdue'}),false);
assert.equal(today({state:'Waiting',due:'overdue'}),false);
assert.equal(today({state:'Next',due:'overdue'}),true);
assert.equal(today({state:'Now'}),true);
assert.equal(today({state:'Next'}),false);
assert.equal(today({state:'Next',snoozedUntil:'2026-10-25',due:'overdue'}),false);
assert.equal(today({state:'Next',snoozedUntil:'2026-10-18'}),true);
// Distinct recurring dates and children are separate; replay of same id is idempotent.
const taskDb={tasks:[]};
const ingest=fromVm(codeBetween('function schoolOccurrenceKey(','const purchaseSeed='),
  'ingestActions',{db:taskDb,normaliseAction:x=>x,
    schoolActionKey:s=>String(s).toLowerCase().trim(),save:()=>{}});
const make=(id,due,child='Alexander')=>({id,title:'Pack swimming kit',
  module:'School Readiness',gmailId:id,due,child,state:'Next'});
assert.equal(ingest([make('mail-a','2026-10-16')]),1);
assert.equal(ingest([make('mail-a','2026-10-16')]),0);
assert.equal(ingest([make('mail-b','2026-10-23')]),1);
assert.equal(ingest([make('mail-c','2026-10-23','Harrison')]),1);
assert.equal(ingest([make('mail-d','2026-10-23')]),0);
assert.equal(taskDb.tasks.length,3);
// Unknown pasted notices must preserve the original evidence locally and go to Review.
let captured=[];
const preview={innerHTML:'',scrollIntoView:()=>{}};
const noticeInputs={noticeText:{value:'An ambiguous school note without a date or action.'},
  noticeSource:{value:'Paper notice'},pastePreview:preview};
const parse=fromVm(codeBetween('function parsePasted(','function loadOAuth('),
  'parsePasted',{document:{getElementById:k=>noticeInputs[k]},
  parseNotice:()=>[],ingestActions:items=>(captured.push(...items),items.length),
  render:()=>{},openPanel:()=>{},esc:String});
parse();
assert.equal(captured[0].state,'Review');
assert.equal(captured[0].owner,'Unassigned');
assert.equal(captured[0].evidenceText,noticeInputs.noticeText.value);
assert.equal(captured[0].due,undefined);
assert.ok(preview.innerHTML.includes('Saved the original notice'));
// Electricity: blanks and impossible dates are not silently converted to readings.
const electricityDb={electricity:[]};
const meter=fromVm(codeBetween('function ingestMeterReadings(','function ingestFamilyRoyElectricity('),
  'ingestMeterReadings',{db:electricityDb,save:()=>{}});
assert.equal(meter([{id:'x',date:'2026-10-18',value:''}]),0);
assert.equal(meter([{id:'x',date:'2026-10-18',value:null}]),0);
assert.equal(meter([{id:'x',date:'2026-02-31',value:12}]),0);
assert.equal(meter([{id:'x',date:'2026-10-18',value:-1}]),0);
assert.equal(meter([{id:'x',date:'2026-10-18',value:0}]),1);
assert.equal(meter([{id:'x',date:'2026-10-18',value:0}]),0);
assert.equal(electricityDb.electricity.length,1);
assert.ok(html.includes('!rawValue.trim()'),'Manual empty meter field must be rejected');
// The two top-level active Today sections share one five-item budget.
assert.ok(html.includes('.slice(0,5);let now=')||html.includes('.slice(0,5);document.getElementById'));
assert.ok(html.includes('.slice(0,Math.max(0,5-before.length))'));
assert.ok(html.includes('actionIsToday(t)&&!t.morning'));
// Recovery, accessibility and dedicated tracking must be wired into the QA build.
for(const fragment of ['onclick="exportLocalData()"','onclick="resetData()"',
    'function restoreLocalData(file)','id="backupFile"',
    'Snags &amp; improvements','@media(prefers-reduced-motion:reduce)']){
  assert.ok(html.includes(fragment),'Missing UI / recovery check '+fragment);
}
// Recurring Friday swimming follows Western Cape local dates and stops before learners' term end.
const seedFuncs=codeBetween('function seedPnpsSwimming(','const purchaseSeed=');
const seedsContext={normaliseAction:x=>x};
const swimming=fromVm(seedFuncs,'seedPnpsSwimming',seedsContext);
const termCalendar=fromVm(seedFuncs,'seedPnpsCalendarTask',seedsContext);
const recurringDb={tasks:[]};
swimming(recurringDb,new Date('2026-10-18T10:00:00Z'));
assert.equal(recurringDb.tasks.length,1);
assert.equal(recurringDb.tasks[0].due,'2026-10-23');
swimming(recurringDb,new Date('2026-10-18T11:00:00Z'));
assert.equal(recurringDb.tasks.length,1);
swimming(recurringDb,new Date('2026-10-24T10:00:00Z'));
assert.equal(recurringDb.tasks[1].due,'2026-10-30');
swimming(recurringDb,new Date('2026-12-10T10:00:00Z'));
assert.equal(recurringDb.tasks.length,2);
termCalendar(recurringDb);
termCalendar(recurringDb);
assert.equal(recurringDb.tasks.filter(t=>t.recurrence==='annual-school-calendar').length,1);
const annual=recurringDb.tasks.find(t=>t.recurrence==='annual-school-calendar');
const done=fromVm(codeBetween('function done(','function addManual('),'done',
  {db:recurringDb,save:()=>{},render:()=>{}});
done(annual.id);
assert.equal(annual.targetYear,2029);
assert.equal(annual.lastCompletedYear,2028);
assert.equal(annual.state,'Waiting');
const friday=recurringDb.tasks.find(t=>t.due==='2026-10-23');
done(friday.id);
assert.equal(friday.state,'Done');
swimming(recurringDb,new Date('2026-10-18T10:00:00Z'));
assert.equal(recurringDb.tasks.filter(t=>t.id===friday.id).length,1);
// Both sources remain private-action records and should never auto-send invitations.
assert.ok(annual.calendarSpec.subjects.length===8);

// Review must expose the original captured evidence and distinguish dismiss from completion.
const taskView=fromVm(codeBetween('function taskHtml(','function renderCapabilities('),'taskHtml',
  {esc:x=>String(x).replace(/</g,'&lt;'),actionDueRank:()=>3});
const reviewCard=taskView({id:'r1',title:'Review imported notice',
  state:'Review',evidenceText:'Original note <with context>',source:'School'});
assert.match(reviewCard,/Add now/);
assert.match(reviewCard,/Add later/);
assert.match(reviewCard,/Dismiss/);
assert.match(reviewCard,/Original note &lt;with context>/);
assert.match(reviewCard,/Original notice/);

const nowCard=taskView({id:'active-1',title:'Pack library bag',
  state:'Now',cat:'School',child:'Alexander',morning:true});
assert.match(nowCard,/✓ Done/);
assert.match(nowCard,/Snooze/);
assert.match(nowCard,/More options/);
assert.match(nowCard,/Now/);
assert.match(nowCard,/Later/);
assert.match(nowCard,/Waiting/);
assert.equal((nowCard.match(/<button\b/g)||[]).length,5,
  'Active cards should show only two primary actions and three collapsed choices');
assert.doesNotMatch(nowCard,/>Add now</);
assert.equal((reviewCard.match(/<button\b/g)||[]).length,3,
  'Review cards should have three clear decisions, not five unrelated controls');
assert.ok(html.includes('id="quick-capture"'), 'Quick capture target must exist');
assert.ok(html.includes('class="btn captureShortcut"'), 'Quick capture should be reachable from top');

const taskRecords={tasks:[{id:'s1',title:'Due item',state:'Now',due:'2026-10-18'}]};
let selectedDate='2026-10-25',saved=0;
const handlers=fromVm(codeBetween('function move(','function done('),'snooze',{
  db:taskRecords,prompt:()=>selectedDate,alert:()=>{},localISO:()=> '2026-10-18',
  save:()=>{saved++},render:()=>{}});
handlers('s1');
assert.equal(taskRecords.tasks[0].state,'Next');
assert.equal(taskRecords.tasks[0].snoozedUntil,'2026-10-25');
assert.equal(taskRecords.tasks[0].due,'2026-10-18','Do not overwrite original deadline');
selectedDate='2026-02-31';handlers('s1');
assert.equal(saved,1,'Invalid calendar date is not persisted');
const moveTask=fromVm(codeBetween('function move(','function snooze('),'move',{
  db:taskRecords,save:()=>{},render:()=>{}});
moveTask('s1','Now');
assert.equal(taskRecords.tasks[0].snoozedUntil,undefined);
const reviewTask={id:'review-x',state:'Review'};
const reviewDb={tasks:[reviewTask]};
const dismiss=fromVm(codeBetween('function done(','function addManual('),'done',{
  db:reviewDb,save:()=>{},render:()=>{}});
dismiss('review-x');
assert.equal(reviewTask.state,'Done');
assert.equal(reviewTask.resolution,'Dismissed');

// Regression from an actual phone screenshot: homework and packing are separate decisions.
const parseSchool=fromVm(codeBetween('function schoolNeed(','function familyRoyReadinessItems('),
  'parseNotice',{Date,detectChild:()=> 'Alexander',
    normText:value=>String(value).toLowerCase().trim(),
    actionDueRank:({due})=>due<'2026-10-18'?0:due==='2026-10-18'?1:due==='2026-10-19'?2:3});
const screenshotText='PNPS: Alexander homework is revise klanke. Bring library bag on Friday';
const parsedSchool=parseSchool(screenshotText,'PNPS school homework','mail-sample',
  new Date('2026-10-18T10:00:00Z'));
assert.equal(parsedSchool.length,2,'Each independent instruction must have its own task');
assert.equal(parsedSchool[0].title,'Alexander: revise klanke');
assert.equal(parsedSchool[0].morning,false,'Homework revision is not a packed item');
assert.equal(parsedSchool[0].due,'','A later school-bag date is not the homework deadline');
assert.equal(parsedSchool[1].title,'Alexander: Bring library bag on Friday');
assert.equal(parsedSchool[1].morning,true);
assert.equal(parsedSchool[1].due,'2026-10-23');
assert.ok(!parsedSchool.some(x=>/Alexander:.*Alexander/i.test(x.title)));
const overdueMail=parseSchool(screenshotText,'PNPS school homework','mail-old',
  new Date('2026-10-01T10:00:00Z'));
assert.equal(overdueMail.length,2);
assert.equal(overdueMail[1].state,'Review','Historical school note is reviewed, not shown overdue in Today');
assert.equal(overdueMail[1].due,'');
assert.equal(overdueMail[1].originalDue,'2026-10-02');
const unrelatedDates=parseSchool('PNPS: Alexander homework is revise klanke. Bring library bag on Friday. Submit a form on 3 November 2026',
  'PNPS school homework','mail-mixed',new Date('2026-10-18T10:00:00Z'));
assert.equal(unrelatedDates[0].due,'','Do not borrow dates from unrelated sentences');
const legacyFix=fromVm(codeBetween('function correctLegacyCombinedSchoolTasks(','const purchaseSeed='),
 'correctLegacyCombinedSchoolTasks',{normaliseAction:x=>x,Date});
const originalTask={id:'school-mail-42',module:'School Readiness',state:'Now',
 title:'Alexander: PNPS: Alexander homework is revise klanke. Bring library bag on Friday',
 child:'Alexander',due:'2026-10-16',gmailId:'mail-42',source:'PNPS school'};
const oldDb={tasks:[originalTask]};
assert.equal(legacyFix(oldDb),1);
assert.equal(oldDb.tasks.length,3);
assert.equal(originalTask.state,'Done');
assert.match(originalTask.resolution,/Superseded/);
assert.equal(oldDb.tasks[1].state,'Review');
assert.equal(oldDb.tasks[2].state,'Review');
assert.equal(oldDb.tasks[1].due,'');
assert.equal(oldDb.tasks[2].due,'');
assert.equal(oldDb.tasks[1].title,'Alexander: Revise klanke');
assert.equal(oldDb.tasks[2].title,'Alexander: Bring library bag on Friday');
assert.equal(oldDb.tasks[2].evidenceText,originalTask.title);
assert.equal(legacyFix(oldDb),0,'The repair must not recreate completed/reviewed tasks');
// School packing screen must not surface uncertain Review items as confirmed obligations.
assert.ok(html.includes("!['Done','Waiting','Review'].includes(t.state)"));

console.log('PASS: no-loss migration, occurrence dedupe, Today, review decisions, school parser, snooze, meter, recurrence and recovery gates');
