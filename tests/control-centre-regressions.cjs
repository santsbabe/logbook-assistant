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
  'actionIsToday',{actionDueRank:t=>t.due==='overdue'?0:3});
assert.equal(today({state:'Done',due:'overdue'}),false);
assert.equal(today({state:'Review',due:'overdue'}),false);
assert.equal(today({state:'Waiting',due:'overdue'}),false);
assert.equal(today({state:'Next',due:'overdue'}),true);
assert.equal(today({state:'Now'}),true);
assert.equal(today({state:'Next'}),false);
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
console.log('PASS: no-loss migration, occurrence dedupe, Today, review fallback, meter and recovery gates');
