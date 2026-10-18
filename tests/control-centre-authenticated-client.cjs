'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Sync=require('../familyroy-control-centre-qa/authenticated-sync.js');
const UI=require('../familyroy-control-centre-qa/backend-sync-ui.js');
const token='e'.repeat(200);
const config={enabled:true,endpoint:'https://private.example/',googleClientId:'test-google'};
function state(tasks=[],extra={}){return{tasks,...extra}}
function task(id,status,title='Example'){return{id,title,state:status}}
const base=state([task('one','Next'),task('two','Next')],{shopping:[]});
const local=state([task('one','Done'),task('two','Next')],{shopping:[]});
const remote=state([task('one','Now'),task('two','Next'),task('three','Review')],{shopping:[]});
(async()=>{
 assert.equal(Sync.validData(base),true);
 assert.equal(Sync.validData(state([task('x','Next'),task('x','Done')])),false);
 assert.equal(Sync.validData(state([{}])),false);
 const invalid=JSON.parse('{"tasks":[],"__proto__":{"polluted":true}}');
 assert.equal(Sync.validData(invalid),false);
 const sameDevice=Sync.planMerge(base,local,base);
 assert.equal(sameDevice.ready,true);
 assert.equal(sameDevice.candidate.tasks[0].state,'Done');
 const disjoint=Sync.planMerge(base,local,state([task('one','Next'),task('two','Done')],{shopping:[]}));
 assert.equal(disjoint.ready,true);
 assert.equal(disjoint.candidate.tasks[0].state,'Done');
 assert.equal(disjoint.candidate.tasks[1].state,'Done');
 const conflict=Sync.planMerge(base,local,remote);
 assert.equal(conflict.ready,false);
 assert.equal(conflict.unresolved.length,1);
 assert.equal(conflict.conflicts[0].kind,'task');
 const chosen=Sync.planMerge(base,local,remote,{[conflict.conflicts[0].key]:'remote'});
 assert.equal(chosen.ready,true);
 assert.equal(chosen.candidate.tasks.find(x=>x.id==='one').state,'Now');
 assert.ok(chosen.candidate.tasks.find(x=>x.id==='three'));
 assert.equal(Sync.planMerge(base,local,remote,{[conflict.conflicts[0].key]:'untrusted'}).ready,false);
 const deleted=Sync.planMerge(base,local,state([task('one','Next')],{shopping:[]}));
 assert.equal(deleted.ready,false);
 const restored=Sync.planMerge(base,local,state([task('one','Next')],{shopping:[]}),
   {[deleted.conflicts[0].key]:'local'});
 assert.ok(restored.candidate.tasks.find(x=>x.id==='two'));
 const both=Sync.planMerge(base,
   {...local,shopping:[{id:'fruit',done:true}]},
   {...remote,shopping:[{id:'fruit',done:'maybe'}]});
 assert.ok(both.conflicts.some(x=>x.kind==='section'&&x.id==='shopping'));
 const first=Sync.planMerge(null,local,remote);
 assert.equal(first.firstConnection,true);
 assert.equal(first.ready,false);
 const selectedFirst={};
 for(const decision of first.conflicts)selectedFirst[decision.key]='local';
 assert.equal(Sync.planMerge(null,local,remote,selectedFirst).ready,true);
 assert.ok(Sync.planMerge(null,state([task('local','Now')]),state([task('cloud','Now')])).candidate.tasks.length===2);
 assert.throws(()=>Sync.createClient({config:{enabled:false,endpoint:'https://private.example/'},fetchImpl:async()=>{}}),/not enabled/);
 assert.throws(()=>Sync.createClient({config:{enabled:true,endpoint:'http://private.example/'},fetchImpl:async()=>{}}),/HTTPS/);
 assert.throws(()=>Sync.createClient({config:{enabled:true,endpoint:'https://santsbabe.github.io/'},fetchImpl:async()=>{}}),/HTTPS/);
 const calls=[];
 let server={revision:0,data:state([], {shopping:[]})};
 const fetchImpl=async(url,init)=>{
   calls.push({url,init});
   assert.equal(url,'https://private.example/v1/state');
   assert.equal(init.headers.Authorization,'Bearer '+token);
   assert.equal(init.cache,'no-store');
   if(init.method==='GET')return{ok:true,status:200,json:async()=>structuredClone(server)};
   const body=JSON.parse(init.body);
   if(body.expectedRevision!==server.revision)return{ok:false,status:409,json:async()=>({currentRevision:server.revision})};
   server={revision:server.revision+1,data:body.data};
   return{ok:true,status:200,json:async()=>({revision:server.revision,updated:true})};
 };
 const api=Sync.createClient({config,fetchImpl});
 assert.equal((await api.read(token)).revision,0);
 assert.equal((await api.write(token,0,state([task('test','Next')]))).revision,1);
 assert.equal((await api.write(token,0,state([task('test','Next')]))).conflict,true);
 assert.ok(calls.every(x=>!x.url.includes('access_token')));
 let localState=state([task('school','Now')],{shopping:[]}),backupCount=0,saveCount=0;
 server={revision:0,data:state([],{shopping:[]})};
 const ctl=UI.createController({config,fetchImpl,getLocal:()=>structuredClone(localState),
   exportBackup:async()=>{backupCount++},saveLocal:async data=>{localState=structuredClone(data);saveCount++;return true}});
 assert.equal((await ctl.connect(token)).ready,true);
 assert.equal(ctl.connected,true);
 const publish=await ctl.commit();
 assert.equal(publish.saved,true);
 assert.equal(server.revision,1);
 assert.equal(localState.tasks.length,1);
 assert.equal(saveCount,1);
 assert.equal(backupCount,1);
 // A later local edit should flow on latest known ancestor.
 localState.tasks[0].state='Done';
 assert.equal((await ctl.refresh()).ready,true);
 assert.equal((await ctl.commit()).saved,true);
 assert.equal(server.data.tasks[0].state,'Done');
 // If the source changes after review, upload must be refused.
 await ctl.refresh();
 localState.tasks[0].state='Waiting';
 await assert.rejects(()=>ctl.commit(),/Device data changed/);
 assert.equal(server.data.tasks[0].state,'Done');
 await ctl.refresh();
 // A simultaneous remote edit invalidates the old review; no remote write follows.
 const previousBackups=backupCount;
 server={revision:server.revision+1,data:state([task('school','Next')],{shopping:[]})};
 const stale=await ctl.commit();
 assert.equal(stale.saved,false);
 assert.equal(stale.reason,'remote-changed');
 assert.equal(backupCount,previousBackups);
 assert.equal(server.data.tasks[0].state,'Next');

 // A simultaneous write between latest GET and PUT must force a fresh review.
 let concurrent={revision:0,data:state([],{shopping:[]})},raceSaved=0,raceBackup=0;
 const raceFetch=async(url,init)=>{
   if(init.method==='GET')return{ok:true,json:async()=>structuredClone(concurrent)};
   concurrent={revision:1,data:state([task('server','Now')],{shopping:[]})};
   return{ok:false,status:409,json:async()=>({currentRevision:1})};
 };
 const race=UI.createController({config,fetchImpl:raceFetch,
   getLocal:()=>state([task('device','Now')],{shopping:[]}),
   saveLocal:async()=>{raceSaved++;return true},
   exportBackup:async()=>{raceBackup++}});
 await race.connect(token);
 const collisionResult=await race.commit();
 assert.equal(collisionResult.saved,false);
 assert.equal(collisionResult.reason,'concurrent-write');
 assert.equal(raceSaved,0);
 assert.equal(raceBackup,1);
 assert.ok(collisionResult.review.candidate.tasks.some(t=>t.id==='server'));
 assert.ok(collisionResult.review.candidate.tasks.some(t=>t.id==='device'));
 // If the cloud write succeeds but local storage is full, report partial
 // persistence and never pretend the device matches the server.
 let partialServer={revision:0,data:state([],{shopping:[]})};
 const partialFetch=async(url,init)=>{
   if(init.method==='GET')return{ok:true,json:async()=>structuredClone(partialServer)};
   partialServer={revision:partialServer.revision+1,data:JSON.parse(init.body).data};
   return{ok:true,json:async()=>({revision:partialServer.revision,updated:true})};
 };
 const partial=UI.createController({config,fetchImpl:partialFetch,
   getLocal:()=>state([task('device','Now')],{shopping:[]}),
   saveLocal:async()=>false,exportBackup:async()=>true});
 await partial.connect(token);
 const partialResult=await partial.commit();
 assert.equal(partialResult.saved,true);
 assert.equal(partialResult.localSaved,false);
 assert.equal(partialServer.data.tasks.length,1);

 ctl.signOut();
 assert.equal(ctl.connected,false);
 assert.equal(UI.createController({config:{enabled:false},getLocal:()=>local,saveLocal:async()=>true,
   exportBackup:async()=>true}).available,false);
 // UI is disabled without a backend, but a fully local conflict example is still actionable.
 const demo=UI.createController({config:{enabled:false},getLocal:()=>local,
   saveLocal:async()=>true,exportBackup:async()=>true});
 const preview=demo.reviewDemo();
 assert.equal(preview.ready,false);
 assert.equal(demo.reviewDemo({[preview.unresolved[0]]:'remote'}).ready,true);
 await assert.rejects(()=>demo.connect(token),/not deployed/);
 // Real browser QA module config is deliberately hard-coded off. Never log tokens or data.
 const configSource=fs.readFileSync('familyroy-control-centre-qa/backend-config.js','utf8');
 const configCtx={window:{}};
 vm.runInNewContext(configSource,configCtx);
 assert.equal(configCtx.window.ControlCentreBackendConfig.enabled,false);
 assert.equal(configCtx.window.ControlCentreBackendConfig.endpoint,null);
 const uiHtml=fs.readFileSync('familyroy-control-centre-qa/index.html','utf8');
 assert.ok(uiHtml.includes('id="authenticatedBackendSync"'));
 assert.ok(uiHtml.includes('src="./backend-sync-ui.js"'));
 assert.ok(uiHtml.includes('src="./authenticated-sync.js"'));
 assert.ok(!uiHtml.includes('localStorage.setItem("google_id_token"'));
 console.log('PASS: disabled backend, isolated API client, three-way conflict choices, safe CAS, failed concurrent writes, explicit QA UI and no token persistence');
})().catch(e=>{console.error(e);process.exitCode=1});
