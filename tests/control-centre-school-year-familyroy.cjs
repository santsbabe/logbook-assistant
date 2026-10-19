'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const School=require('../familyroy-control-centre-qa/school-year-registry.js');
function status(text,sourceDate='2026-10-05',source='PNPS'){
 return School.resolve({text,source,sourceDate:new Date(sourceDate+'T12:00:00Z'),registry:School.defaults()});
}
assert.deepEqual(status('Grade 2 homework: revise klanke. Bring library bag Friday.').children,['Harrison']);
assert.deepEqual(status('2M classroom: bring books on Friday').children,['Harrison']);
assert.deepEqual(status('2D class: pack swimming kit').children,['Harrison']);
assert.equal(status('2E class: bring a library bag').status,'ignore');
assert.deepEqual(status('Grade R: Bring reading folder').children,['Alexander']);
assert.deepEqual(status('Grade R: Bring reading folder','2026-10-05','Red Roots').children,['Alexander']);
assert.deepEqual(status('Bring bag for school','2026-10-05','Red Roots').children,['Alexander'],
 'Keep established 2026 Red Roots school-only learner inference');
assert.deepEqual(status('Bring backpack for school','2026-10-05','100 Acre Wood').children,['Imogen'],
 'Keep established 2026 100 Acre Wood school-only learner inference');
assert.equal(status('Bring bag for school','2027-01-10','Red Roots').status,'review',
 'Do not project historic preschool affiliation into unconfirmed future years');
assert.deepEqual(status('Grade 3 homework: spelling','2027-02-03').children,['Harrison']);
assert.deepEqual(status('Grade 1 library bag','2027-02-03').children,['Alexander']);
assert.deepEqual(status('2027 Grade 3 homework','2026-12-06').children,['Harrison']);
assert.deepEqual(status('2026 Grade 2 homework','2027-02-03').children,['Harrison']);
assert.deepEqual(status('Whole-school PNPS: Please bring hats').children,['Harrison','Alexander']);
assert.deepEqual(status('Harrison and Alexander must bring hats').children,['Harrison','Alexander']);
assert.equal(status('School homework: practice reading','2026-09-01','Unknown academy').status,'review');
assert.equal(status('Grade 2 homework','2027-02-03').status,'review');
assert.equal(status('Grade 2 homework','2026-02-03','Unknown school').status,'review');
assert.equal(status('Grade 2 homework for Alexander').status,'review','A conflicting named child requires Review');
assert.deepEqual(status('Grade 2 and Grade R homework').children,['Harrison','Alexander']);
assert.deepEqual(status('2M and 2D: bring books Friday').children,['Harrison'],
 'Known 2M and 2D share Harrison without a spurious conflict');
assert.deepEqual(status('2M and 2E: bring books Friday').children,['Harrison'],
 'Ignore the excluded 2E class without discarding 2M');
assert.equal(status('2B class: bring books Friday').status,'review',
 'Unknown class 2B cannot inherit a generic Grade 2 assignment');
assert.deepEqual(status('2027 Grade 1 and Grade 3: bring books Friday','2026-11-05').children,['Alexander','Harrison']);
assert.equal(status('2E classroom homework for Harrison').status,'matched','Explicit named child takes precedence over default ignored class');
assert.equal(status('No grade context for this PNPS newsletter').status,'review');
const start=School.defaults();
assert.equal(School.annualRequired(start,2026),true,'Do not invent user confirmation');
let confirmed=School.confirm(start,2026,new Date('2026-01-03'));
assert.equal(School.annualRequired(confirmed,2026),false);
assert.equal(School.annualRequired(confirmed,2027),true);
const updated=School.change(confirmed,{year:2027,child:'Alexander',school:'PNPS',grade:'1',classCode:'1A'},new Date('2027-01-04'));
assert.equal(School.annualRequired(updated,2026),false);
assert.deepEqual(School.resolve({text:'2026 Grade 2 homework',source:'PNPS',sourceDate:new Date('2027-03-01'),registry:updated}).children,['Harrison']);
const previous=updated.records.find(x=>x.year===2027&&x.grade==='1'&&x.child==='Alexander');
const amended=School.change(updated,{originalId:previous.id,year:2027,child:'Alexander',school:'PNPS',grade:'1',classCode:'1B'},new Date('2027-01-05'));
assert.ok(amended.history.some(x=>x.change==='amend'&&x.previous.id===previous.id));
assert.equal(School.annualRequired(amended,2027),true);
const removed=School.remove(amended,previous.id);
assert.ok(removed.history.some(x=>x.change==='remove'&&x.previous.id===previous.id));
assert.deepEqual(School.resolve({text:'Grade 2 homework',source:'PNPS',sourceDate:new Date('2026-05-01'),registry:removed}).children,['Harrison']);

const html=fs.readFileSync('familyroy-control-centre-qa/index.html','utf8');
function codeBetween(start,end){
 const i=html.indexOf(start),j=html.indexOf(end,i+start.length);
 assert.ok(i>=0&&j>i,'Parser anchors missing: '+start+' -> '+end);return html.slice(i,j);
}
const context={Date,ControlCentreSchoolRegistry:School,
 db:{tasks:[],schoolRegistry:School.defaults()},normText:s=>String(s||'').toLowerCase(),
 actionDueRank:({due})=>due<'2026-10-18'?0:due==='2026-10-18'?1:due==='2026-10-19'?2:3};
vm.createContext(context);
vm.runInContext(codeBetween('function schoolNeed(','function ingestFamilyRoyReadiness('),context,{timeout:5000});
const parsed=vm.runInContext('parseNotice',context);
const ready=vm.runInContext('familyRoyReadinessItems',context);
const mixed='PNPS Grade 2 homework: revise klanke. Bring library bag on Friday.';
const entries=parsed(mixed,'PNPS', 'mail-test',new Date('2026-10-18T10:00:00Z'));
assert.equal(entries.length,2);
assert.deepEqual(Array.from(entries.map(x=>x.child)),['Harrison','Harrison']);
assert.deepEqual(Array.from(entries.map(x=>x.schoolKind)),['homework','readiness']);
assert.equal(entries[0].due,'');
assert.equal(entries[1].due,'2026-10-23');
assert.equal(entries[0].morning,false);
assert.equal(entries[1].morning,true);
assert.ok(entries.every(x=>x.evidenceText===mixed));
const id='a'.repeat(64);
context.ingestActions=items=>items.length;
context.save=()=>false;
context.render=()=>{};
context.storageReadOnly=false;
vm.runInContext(codeBetween('function ingestFamilyRoyReadiness(','function parsePasted('),context,{timeout:3000});
const ingestFamily=vm.runInContext('ingestFamilyRoyReadiness',context);

function handoff(text,{year='2026',school='PNPS',children=[],sourceTimestamp=year+'-10-18T08:00:00+02:00',evidence=[{sha256:'evidence-hash',mime_type:'image/jpeg'}]}={}){
 return{source_id:id,route:'control_centre.school_readiness',payload:{
  text,school,children,source_timestamp:sourceTimestamp,source_type:'ios_share',
  source_chat:'PNPS Parents',sender:'Teacher',evidence}};
}

assert.throws(()=>ingestFamily([handoff(mixed)]),/NOT acknowledged/,'A local storage failure must not acknowledge the upstream handoff');
context.save=()=>true;
const accepted=ingestFamily([handoff(mixed)]);
assert.equal(accepted.persistence,'local-device-only','Local ACK is not evidence of cloud synchronisation');
assert.equal(accepted.added,1);
const replayedIds=ready(handoff(mixed)).map(x=>x.id);
assert.equal(new Set(replayedIds).size,replayedIds.length);

const readiness=ready(handoff(mixed));
assert.equal(readiness.length,1,'Readiness handoff does not also import homework');
assert.equal(readiness[0].child,'Harrison');
assert.equal(readiness[0].schoolYear,2026);
assert.equal(readiness[0].schoolKind,'readiness');
assert.equal(readiness[0].familyRoySourceId,id);
assert.equal(readiness[0].originalSender,'Teacher');
assert.equal(readiness[0].originalSourceTimestamp,'2026-10-18T08:00:00+02:00');
assert.equal(readiness[0].familyRoyEvidence[0].sha256,'evidence-hash');
assert.equal(readiness[0].evidenceText,mixed);
assert.equal(ready(handoff('2E class: Bring library bag Friday')).length,0);
assert.equal(ready(handoff('2027 Grade 3 bring library bag',{sourceTimestamp:'2026-12-02T09:00:00+02:00'}))[0].child,'Harrison');
assert.equal(ready(handoff('Whole-school PNPS: Bring caps for gala Friday')).length,2);
const unknown=ready(handoff('Grade 2: bring library bag',{school:'Unknown school'}));
assert.equal(unknown.length,1);
assert.equal(unknown[0].state,'Review');
assert.equal(unknown[0].owner,'Unassigned');
assert.equal(unknown[0].child,'','Unknown child remains explicitly unassigned');
assert.ok(unknown[0].reviewReason);
assert.equal(unknown[0].due,'','Unknown due date must not be invented');
assert.ok(html.includes('id="schoolYearRegistryCard"'));
assert.ok(html.includes('id="schoolYearAlert"'));
assert.ok(html.includes('Confirm this year&#39;s assignments')||html.includes("Confirm this year's assignments"));
const parsed2027=parsed('Grade 1: bring hats','PNPS','review-other',new Date('2027-01-12T12:00:00Z'));
assert.equal(parsed2027[0].child,'Alexander');
assert.equal(parsed2027[0].schoolYear,2027);

async function familyroy(){
 const dir=path.resolve('familyroy-fixture/netlify/functions/core.mjs');
 if(!fs.existsSync(dir)){
  console.log('FamilyRoy cross-repo checkout absent; registry and handoff regressions passed. Pinned checkout required in CI.');
  return;
 }
 const {buildRecord,ROUTES}=await import(pathToFileURL(dir).href);
 const notice={source_type:'ios_share',source_chat:'PNPS',source_timestamp:'2026-10-18T08:00:00+02:00',
  text:mixed,attachments:[{name:'school.jpg',mime_type:'image/jpeg',sha256:'evidence-hash',size:123}]};
 const record=buildRecord(notice);
 assert.equal(record.extracted.school,'PNPS');
 assert.deepEqual(record.extracted.children,[],'School without child name should not be treated as unknown learner');
 for(const kind of [ROUTES.SCHOOL_HOMEWORK,ROUTES.SCHOOL_READINESS,ROUTES.EVENTS])
  assert.ok(record.routes.includes(kind),'Expected independent '+kind+' route');
 assert.ok(!record.routes.includes(ROUTES.PETS));
 assert.equal(record.route_payloads[ROUTES.SCHOOL_READINESS].source_id,record.source_id);
 assert.equal(record.route_payloads[ROUTES.EVENTS].source_id,record.source_id);
 const imported=ready({source_id:record.source_id,route:ROUTES.SCHOOL_READINESS,
  payload:record.route_payloads[ROUTES.SCHOOL_READINESS]});
 assert.equal(imported.length,1);
 assert.equal(imported[0].child,'Harrison');
 assert.equal(imported[0].familyRoyEvidence[0].sha256,'evidence-hash');
 assert.equal(imported[0].schoolKind,'readiness');
 assert.ok(imported.every(x=>x.module!=='School Homework'&&x.module!=='School Calendar Candidate'));
 const repeat=ready({source_id:record.source_id,route:ROUTES.SCHOOL_READINESS,
  payload:record.route_payloads[ROUTES.SCHOOL_READINESS]});
 assert.deepEqual(Array.from(repeat.map(x=>x.id)),Array.from(imported.map(x=>x.id)),'Idempotent source and item IDs');
 const mystery=buildRecord({source_type:'ios_share',text:'Grade 2 homework: multiplication. Bring library bag Friday',
  attachments:[{name:'school.jpg',mime_type:'image/jpeg',sha256:'mystery',size:42}],
  ocr_text_present:true});
 assert.deepEqual(mystery.routes,[ROUTES.REVIEW],
  'Image OCR cannot assume school from grade alone');
 const multiplication=buildRecord({source_chat:'PNPS',text:'Grade 2: practise multiplication. Bring library bag Friday'});
 assert.ok(!multiplication.routes.includes(ROUTES.PETS),
  'Multiplication must never trigger Pet Care');
 const gala=buildRecord({source_chat:'PNPS',text:'Gala on Friday'});
 assert.ok(gala.routes.includes(ROUTES.EVENTS));
 assert.ok(!gala.routes.includes(ROUTES.SCHOOL_READINESS),
  'Informational event must not become a packing task');
 const homework=buildRecord({source_chat:'PNPS',text:'Grade 2 homework: practise spelling words'});
 assert.ok(homework.routes.includes(ROUTES.SCHOOL_HOMEWORK));
 assert.ok(!homework.routes.includes(ROUTES.SCHOOL_READINESS));
 const class2e=buildRecord({source_chat:'PNPS',text:'2E class: Bring hats Friday'});
 if(class2e.routes.includes(ROUTES.SCHOOL_READINESS))
  assert.equal(ready({source_id:class2e.source_id,route:ROUTES.SCHOOL_READINESS,
   payload:class2e.route_payloads[ROUTES.SCHOOL_READINESS]}).length,0);
 console.log('PASS cross-repository FamilyRoy OCR routing, unchanged source IDs, PNPS 2026 Grade 2 -> Harrison, 2E ignore, event/homework/readiness separation and no Pet Care');
}
familyroy().catch(e=>{console.error(e);process.exitCode=1});
