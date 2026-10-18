'use strict';
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {createServer}=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const puppeteer=require('puppeteer-core');
const root=process.cwd();
const browserCommand=['google-chrome','chromium','chromium-browser'].map(cmd=>{
 const which=spawnSync('which',[cmd],{encoding:'utf8'});
 return which.status===0?which.stdout.trim():null;
}).find(Boolean);
assert.ok(browserCommand,'A real local Chromium executable is required');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json'};
const srv=createServer((req,res)=>{
 let u;try{u=new URL(req.url,'http://127.0.0.1')}catch{res.writeHead(400);res.end();return}
 const file=path.resolve(root,'.'+decodeURIComponent(u.pathname));
 if(!(file===root||file.startsWith(root+path.sep))){res.writeHead(403);res.end();return}
 try{const target=fs.statSync(file).isDirectory()?path.join(file,'index.html'):file;
  res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});
  res.end(fs.readFileSync(target));
 }catch{res.writeHead(404);res.end('Not found')}
});
(async()=>{
 await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 const browser=await puppeteer.launch({executablePath:browserCommand,headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--no-first-run']});
 try{
  const page=await browser.newPage();
  await page.setViewport({width:390,height:844,deviceScaleFactor:1});
  const remoteRequests=[];
  page.on('request',request=>{
   const url=request.url();
   if(!url.startsWith('http://127.0.0.1:')&&!url.startsWith('https://accounts.google.com/')){
    if(url.includes('/v1/state'))remoteRequests.push(url);
   }
  });
  const startUrl='http://127.0.0.1:'+srv.address().port+'/familyroy-control-centre-qa/';
  await page.goto(startUrl,{waitUntil:'load',timeout:25000});
  await page.waitForFunction(()=>{
    const el=document.querySelector('#authenticatedBackendSync');
    return el&&el.textContent.includes('Secure synchronisation');
  },{timeout:15000});
  const initial=await page.evaluate(()=>{
    document.querySelector('.tab[data-p="settings"]').click();
    const entry=document.querySelector('#authenticatedBackendSync');
    return{config:window.ControlCentreBackendConfig.enabled,
      buttonText:entry.textContent,records:Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])};
  });
  assert.equal(initial.config,false,'Browser must never turn on private backend without approval');
  assert.match(initial.buttonText,/QA preview only/);
  assert.match(initial.buttonText,/Try a conflict example/);
  await page.evaluate(()=>{
    const b=[...document.querySelectorAll('#authenticatedBackendSync button')]
      .find(x=>x.textContent==='Try a conflict example');
    if(!b)throw Error('Demo button missing');
    b.click();
  });
  await page.waitForFunction(()=>document.querySelectorAll('#authenticatedBackendSync select[data-conflict-key]').length===1);
  assert.match(await page.$eval('#authenticatedBackendSync',el=>el.textContent),
    /No cloud write is possible until every difference is resolved/);
  const focus=await page.evaluate(()=>{
    const field=document.querySelector('#authenticatedBackendSync select[data-conflict-key]');
    field.value='remote';field.dispatchEvent(new Event('change',{bubbles:true}));
    return{selected:document.querySelector('#authenticatedBackendSync select[data-conflict-key]')?.value,
      focused:document.activeElement===document.querySelector('#authenticatedBackendSync select[data-conflict-key]'),
      output:document.querySelector('#authenticatedBackendSync').textContent};
  });
  assert.equal(focus.selected,'remote');
  assert.equal(focus.focused,true,'Keyboard focus should survive rerendering a conflict choice');
  assert.match(focus.output,/All differences accounted for/);
  assert.match(focus.output,/This is an example only/);
  assert.doesNotMatch(focus.output,/Back up and submit reviewed changes/);
  const finalRecords=await page.evaluate(()=>Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]));
  assert.deepEqual(finalRecords,initial.records,'Conflict preview cannot mutate saved tasks');
  assert.equal(remoteRequests.length,0,'Disabled private backend must make no private API calls');

  // The parent is prompted at the start of each calendar year, but established
  // 2026/2027 child inference works even before annual confirmation.
  const registry=await page.evaluate(()=>{
    const annual=document.querySelector('#schoolYearAlert');
    const prompted=!annual.hidden&&annual.textContent.includes('School year confirmation');
    const year=document.getElementById('schoolRegistryYear');
    year.value='2027';renderSchoolRegistry();
    const rows=db.schoolRegistry.records;
    const row=rows.find(x=>x.year===2027&&x.school==='PNPS'&&x.child==='Harrison'&&x.grade==='3');
    const edit=document.getElementById('schoolRegistryEdit');
    edit.value=row.id;loadSchoolMappingEditor();
    document.getElementById('schoolMappingClass').value='3A';
    saveSchoolMapping();
    const audit=db.schoolRegistry.history.filter(x=>x.change==='amend');
    const amended=db.schoolRegistry.records.find(x=>x.id===row.id);
    const preserved=db.schoolRegistry.records.some(x=>x.year===2026&&x.child==='Harrison'&&x.grade==='2');
    window.confirm=()=>true;
    confirmSchoolRegistryYear();
    return {prompted,preserved,amendedClass:amended.classCode,
      audited:audit.length,confirmed2027:!ControlCentreSchoolRegistry.annualRequired(db.schoolRegistry,2027),
      stillNeeds2026:ControlCentreSchoolRegistry.annualRequired(db.schoolRegistry,2026),
      history:db.schoolRegistry.history.length,
      route2026:ControlCentreSchoolRegistry.resolve({text:'Grade 2 homework',source:'PNPS',
        sourceDate:new Date('2026-04-05'),registry:db.schoolRegistry}).children.join(','),
      saved:!!localStorage.getItem(KEY)};
  });
  assert.equal(registry.prompted,true,'Show annual school-year confirmation reminder when not yet confirmed');
  assert.equal(registry.amendedClass,'3A');
  assert.ok(registry.audited>0,'Edited class retained in audit history');
  assert.equal(registry.confirmed2027,true);
  assert.equal(registry.stillNeeds2026,true);
  assert.equal(registry.preserved,true);
  assert.equal(registry.route2026,'Harrison','Historical 2026 Grade 2 child inference persists after changing 2027');
  assert.equal(registry.saved,true,'Confirmation and edits must persist on this device');
  assert.equal(remoteRequests.length,0,'School-year editing never contacts disabled private backend');

  console.log('PASS real Chromium mobile UI: conflict decisions, historical learner-year edits, annual confirmation, browser persistence and no private API traffic');
 }finally{
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>srv.close());
