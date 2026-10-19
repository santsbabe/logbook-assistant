'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const School=require('../familyroy-control-centre-qa/school-year-registry.js');
const html=fs.readFileSync('familyroy-control-centre-qa/index.html','utf8');
function between(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Missing source boundary '+start);
 return html.slice(a,b);
}

const snapshotCtx={document:{getElementById:()=>null}};
vm.createContext(snapshotCtx);
vm.runInContext(between('function validateLocalSnapshot(','function load(){'),snapshotCtx);
const durable=new Map();
let rejectPrimary=false;
const storage={
 getItem:key=>durable.has(key)?durable.get(key):null,
 setItem:(key,value)=>{
   if(rejectPrimary&&key==='familyroy_local_ci')throw Error('QuotaExceededError');
   durable.set(key,String(value));
 }
};
snapshotCtx.writeLocalSnapshot(storage,'familyroy_local_ci',{tasks:[{id:'previous',state:'Now'}]});
rejectPrimary=true;
assert.throws(()=>snapshotCtx.writeLocalSnapshot(storage,'familyroy_local_ci',{
 tasks:[{id:'previous',state:'Now'},{id:'candidate',state:'Review'}]}),/QuotaExceededError/);
assert.equal(snapshotCtx.readLocalSnapshot(storage,'familyroy_local_ci').status,'ok');
assert.deepEqual(JSON.parse(storage.getItem('familyroy_local_ci')).tasks.map(t=>t.id),['previous'],
 'A failed primary localStorage write must not masquerade as a committed candidate');
rejectPrimary=false;
snapshotCtx.writeLocalSnapshot(storage,'familyroy_local_ci',{
 tasks:[{id:'previous',state:'Now'},{id:'candidate',state:'Review'}]});
assert.deepEqual(JSON.parse(storage.getItem('familyroy_local_ci')).tasks.map(t=>t.id),
 ['previous','candidate'],'Retry after storage recovery must save the candidate');

const originalDb={tasks:[],schoolRegistry:School.defaults()};
let writes=0,shouldFail=false,rendered=0,storageReadOnly=false;
const ctx={
 Date,URL,ControlCentreSchoolRegistry:School,db:originalDb,
 normText:x=>String(x||'').toLowerCase(),
 ACTION_SCHEMA:1,actionDueRank:({due})=>due==='2026-10-23'?3:99,
 save:()=>{writes++;return !shouldFail},
 render:()=>{rendered++},
 get storageReadOnly(){return storageReadOnly},set storageReadOnly(v){storageReadOnly=v},
 document:{getElementById:()=>null},
 esc:s=>String(s||'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch))
};
vm.createContext(ctx);
for(const segment of [
 between('function normaliseAction(','function actionDueRank('),
 between('function schoolOccurrenceKey(','// Keep each Friday distinct;'),
 between('function schoolNeed(','function parsePasted('),
 between('function familyRoyEvidenceHtml(','function renderCapabilities(')
])vm.runInContext(segment,ctx,{timeout:5000});
const makeItem=(sourceId,text='PNPS Grade 2: Bring library bag on Friday.',who='Class office')=>
 ({source_id:sourceId,route:'control_centre.school_readiness',payload:{
   source_id:sourceId,route:'control_centre.school_readiness',source_type:'ios_share',
   source_chat:'PNPS Parents',sender:who,school:'PNPS',children:[],
   source_timestamp:'2026-10-18T08:00:00+02:00',
   text,evidence:[{name:'school.png',mime_type:'image/png',sha256:'photo-'+sourceId.slice(0,8)}]}});
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
const first=makeItem(A),sameOther=makeItem(B,undefined,'Second teacher');
assert.equal(ctx.db.tasks.length,0);
shouldFail=true;
assert.throws(()=>ctx.ingestFamilyRoyReadiness([first]),/NOT acknowledged/);
assert.equal(ctx.db.tasks.length,0,'Failed save must restore original in-memory task array');
assert.equal(writes,1,'A failed batch must attempt one persistence only');
shouldFail=false;
let imported=ctx.ingestFamilyRoyReadiness([first]);
assert.equal(imported.added,1);
assert.equal(imported.persistence,'local-device-only');
assert.equal(ctx.db.tasks.length,1);
assert.equal(ctx.db.tasks[0].child,'Harrison');
assert.equal(ctx.db.tasks[0].familyRoySourceId,A);
assert.equal(ctx.db.tasks[0].familyRoyEvidence[0].sha256,'photo-aaaaaaaa');
const preserved=JSON.stringify(ctx.db.tasks[0]);
let replay=ctx.ingestFamilyRoyReadiness([first]);
assert.equal(replay.added,0);
assert.equal(ctx.db.tasks.length,1);
assert.equal(JSON.stringify(ctx.db.tasks[0]),preserved,'Replay may not replace existing action or its Review decision');
shouldFail=true;
assert.throws(()=>ctx.ingestFamilyRoyReadiness([sameOther]),/NOT acknowledged/);
assert.equal(ctx.db.tasks[0].corroboratingSources,undefined,
 'Failed duplicate-source save must not append uncommitted evidence');
shouldFail=false;
const fromOther=ctx.ingestFamilyRoyReadiness([sameOther]);
assert.equal(fromOther.added,0);
assert.equal(ctx.db.tasks.length,1);
assert.equal(ctx.db.tasks[0].corroboratingSources.length,1);
assert.equal(ctx.db.tasks[0].corroboratingSources[0].sourceId,B);
assert.equal(ctx.db.tasks[0].corroboratingSources[0].sender,'Second teacher');
assert.equal(ctx.db.tasks[0].corroboratingSources[0].evidence[0].sha256,'photo-bbbbbbbb');
ctx.ingestFamilyRoyReadiness([sameOther]);
assert.equal(ctx.db.tasks[0].corroboratingSources.length,1,'Replay cannot duplicate provenance');
const taskHtml=ctx.taskHtml(ctx.db.tasks[0]);
assert.match(taskHtml,/Source ID: aaaaaaaaaa/);
assert.match(taskHtml,/Source ID: bbbbbbbbbb/);
assert.match(taskHtml,/Original date: 2026/);
assert.match(taskHtml,/photo-bbbbbbbb/);
assert.doesNotMatch(taskHtml,/Open source email/,'FamilyRoy IDs must never become Gmail URLs');
const xss=ctx.taskHtml({...ctx.db.tasks[0],evidenceText:'<img src=x onerror=alert(1)>',originalSender:'<script>alert(1)</script>'});
assert.doesNotMatch(xss,/<script>|<img/,'Source text is HTML-escaped');
assert.match(xss,/&lt;script&gt;/);
assert.throws(()=>ctx.ingestFamilyRoyReadiness([{...first,route:'homework_quest'}]),/invalid/);
assert.throws(()=>ctx.ingestFamilyRoyReadiness([{...first,payload:null}]),/invalid/);
assert.equal(ctx.db.tasks.length,1,'Rejected handoffs never create tasks');

// Unassigned learner must be actively chosen for Add now/Add later;
// dismissal is permitted without inventing an assignment.
const unknown=makeItem(C,'PNPS: bring library bag tomorrow');
unknown.payload.school='Unknown School';
const result=ctx.ingestFamilyRoyReadiness([unknown]);
assert.equal(result.added,1);
const row=ctx.db.tasks.find(t=>t.familyRoySourceId===C);
assert.equal(row.state,'Review');
assert.equal(row.child,'');
assert.equal(row.owner,'Unassigned');
assert.equal(row.due,'');
assert.equal(row.familyRoyEvidence[0].sha256,'photo-cccccccc');
const unknownCard=ctx.taskHtml(row);
assert.match(unknownCard,/Choose learner/);
assert.match(unknownCard,/Add now/);
assert.match(unknownCard,/Add later/);
assert.match(unknownCard,/Dismiss/);
assert.equal((unknownCard.match(/<button\b/g)||[]).length,3);
assert.doesNotMatch(unknownCard,/mail\.google\.com/);
ctx.document.getElementById=id=>id.startsWith('review-child-')?{value:''}: {textContent:''};
assert.equal(ctx.reviewFamilyRoyTask(row.id,'Now'),false,'Unknown learner cannot enter Now without decision');
assert.equal(ctx.db.tasks.find(t=>t.id===row.id).state,'Review');
ctx.document.getElementById=id=>id.startsWith('review-child-')?{value:'Alexander'}:{textContent:''};
shouldFail=true;
assert.equal(ctx.reviewFamilyRoyTask(row.id,'Now'),false,'Save failure must roll back Review state and learner');
assert.equal(ctx.db.tasks.find(t=>t.id===row.id).state,'Review');
assert.equal(ctx.db.tasks.find(t=>t.id===row.id).child,'');
shouldFail=false;
assert.equal(ctx.reviewFamilyRoyTask(row.id,'Now'),true);
let now=ctx.db.tasks.find(t=>t.id===row.id);
assert.equal(now.child,'Alexander');
assert.equal(now.state,'Now');
assert.equal(now.reviewDecision.decision,'Add now');
assert.equal(now.reviewDecision.sourceId,C);
assert.ok(now.evidenceText.includes('bring library bag'));
const another={...row,id:'review-later-'+C,child:'',state:'Review',familyRoySourceId:C};
ctx.db.tasks.push(another);
ctx.document.getElementById=id=>id.startsWith('review-child-')?{value:'Harrison'}:{textContent:''};
assert.equal(ctx.reviewFamilyRoyTask(another.id,'Next'),true);
assert.equal(ctx.db.tasks.find(t=>t.id===another.id).reviewDecision.decision,'Add later');
const dismissal={...row,id:'review-dismiss-'+C,child:'',state:'Review',familyRoySourceId:C};
ctx.db.tasks.push(dismissal);
ctx.document.getElementById=()=>null;
assert.equal(ctx.reviewFamilyRoyTask(dismissal.id,'Dismiss'),true);
assert.equal(ctx.db.tasks.find(t=>t.id===dismissal.id).resolution,'Dismissed');
assert.equal(ctx.db.tasks.find(t=>t.id===dismissal.id).reviewDecision.decision,'Dismissed');

// Exercise the actual browser-to-FamilyRoy handoff state machine with synthetic
// GET/redeemed, POST/ack, network timeout, recovery, and an already-consumed source.
const cap='A'.repeat(43), endpoint='https://familyroy-ci.example';
let requests=[],failAck=false,remoteStatus='redeemed',payload=first.payload;
const fetchImpl=async(url,opts)=>{
 requests.push({url,method:opts.method,redirect:opts.redirect,cache:opts.cache,headers:opts.headers,body:opts.body});
 assert.equal(url,endpoint+'/handoff');
 if(opts.method==='GET')return{ok:true,status:200,json:async()=>({ok:true,status:remoteStatus,
  source_id:A,route:'control_centre.school_readiness',payload:remoteStatus==='redeemed'?payload:undefined})};
 if(failAck)throw Error('offline');
 return{ok:true,status:200,json:async()=>({ok:true,status:'acknowledged'})};
};
async function testHandoff(){
 let passed=false;
 try{
  await ctx.consumeFamilyRoyReadinessHandoff({endpoint,capability:cap,fetchImpl,approvedOrigins:[]});
 }catch(e){passed=/not yet been authorised/.test(e.message)}
 assert.equal(passed,true);
 assert.equal(requests.length,0,'Unapproved origin must not receive capability token');
 for(const unsafe of ['http://familyroy-ci.example','https://evil.example','https://user:pass@familyroy-ci.example',
  'https://familyroy-ci.example/bad','https://familyroy-ci.example/?x=1']){
  await assert.rejects(()=>ctx.consumeFamilyRoyReadinessHandoff({endpoint:unsafe,
   capability:cap,fetchImpl,approvedOrigins:[endpoint]}));
 }

 // The previously accepted source remains idempotent across ordinary handoff retries.
 requests=[];failAck=true;
 await assert.rejects(()=>ctx.consumeFamilyRoyReadinessHandoff({endpoint,capability:cap,fetchImpl,
  approvedOrigins:[endpoint]}),/saved on this device, but upstream acknowledgement failed/);
 assert.deepEqual(requests.map(r=>r.method),['GET','POST']);
 assert.equal(ctx.db.tasks.filter(t=>t.familyRoySourceId===A).length,1);
 requests=[];failAck=false;
 const done=await ctx.consumeFamilyRoyReadinessHandoff({endpoint,capability:cap,fetchImpl,
  approvedOrigins:[endpoint]});
 assert.equal(done.added,0);
 assert.equal(done.acknowledged,true);
 assert.deepEqual(requests.map(r=>r.method),['GET','POST']);
 assert.ok(requests.every(x=>x.redirect==='error'&&x.cache==='no-store'));
 assert.equal(JSON.parse(requests[1].body).source_id,A);
 const bearer=requests[0].headers.Authorization;
 assert.equal(bearer,'Handoff '+cap);
 requests=[];remoteStatus='acknowledged';
 const acknowledged=await ctx.consumeFamilyRoyReadinessHandoff({endpoint,capability:cap,fetchImpl,
  approvedOrigins:[endpoint]});
 assert.equal(acknowledged.alreadyAcknowledged,true);
 assert.equal(acknowledged.persistence,'upstream-already-acknowledged');
 assert.equal(requests.length,1,'Already acknowledged handoff must not POST or create empty Review records');
 requests=[];remoteStatus='redeemed';payload={...first.payload,source_id:B};
 await assert.rejects(()=>ctx.consumeFamilyRoyReadinessHandoff({endpoint,capability:cap,fetchImpl,
  approvedOrigins:[endpoint]}),/payload failed validation/);
 assert.equal(requests.length,1,'Source mismatch must never issue POST acknowledgement');
 console.log('PASS FamilyRoy duplicate/replay, second-source evidence, local failure rollback, audited parent decisions and strict capability handoff retry');
}
testHandoff().catch(e=>{console.error(e);process.exitCode=1});
