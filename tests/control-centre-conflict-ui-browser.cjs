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
  console.log('PASS real Chromium mobile UI: feature flag off, explicit conflict selection, focus restoration, no writes or remote traffic');
 }finally{
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>srv.close());
