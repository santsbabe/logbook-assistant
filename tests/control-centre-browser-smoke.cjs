'use strict';
// Chromium renders the ACTUAL QA HTML and local supporting scripts; no Netlify or paid browser SaaS.
const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {readFileSync,statSync,mkdirSync}=require('node:fs');
const {resolve,join,extname,sep}=require('node:path');
const {spawnSync,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const execFileAsync=promisify(execFile);
const root=process.cwd();
const executable=['google-chrome','chromium','chromium-browser'].find(cmd=>{
  const r=spawnSync('which',[cmd],{encoding:'utf8'});
  return r.status===0;
});
assert.ok(executable,'Chromium/Chrome is required for real browser smoke testing');
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.json':'application/json','.css':'text/css'};
const server=createServer((req,res)=>{
  let u=new URL(req.url,'http://127.0.0.1');
  let input=decodeURIComponent(u.pathname);
  let file=resolve(root,'.'+input);
  if(!(file===root||file.startsWith(root+sep))){res.writeHead(403);res.end('Forbidden');return}
  try{
    if(statSync(file).isDirectory())file=join(file,'index.html');
    const body=readFileSync(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});
    res.end(body);
  }catch(e){res.writeHead(404);res.end('Missing')}
});
(async()=>{
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const port=server.address().port;
  const url='http://127.0.0.1:'+port+'/familyroy-control-centre-qa/';
  mkdirSync('/tmp/cc-browser-qa',{recursive:true});
  for(const spec of [{name:'desktop',size:'1280,900'},{name:'phone-width',size:'390,844'}]){
    const file='/tmp/cc-browser-qa/'+spec.name+'.png';
    const args=['--headless=new','--no-sandbox','--disable-dev-shm-usage',
      '--disable-gpu','--hide-scrollbars','--window-size='+spec.size,
      '--virtual-time-budget=4000','--screenshot='+file,'--dump-dom',url];
    const {stdout}=await execFileAsync(executable,args,{timeout:40000,maxBuffer:16*1024*1024});
    // These are runtime DOM fragments, not present in initial HTML markup.
    assert.match(stdout,/id="kpis">\s*<button[^>]*statusFilter/);
    assert.match(stdout,/id="capabilityList">\s*<div class="task"/);
    assert.match(stdout,/id="meterHistory">\s*<div class="task"/);
    assert.match(stdout,/id="privateCloudBackup"/);
    assert.match(stdout,/id="cloudRestoreBtn"/);
    assert.match(stdout,/cloud-sync\.js/);
    assert.match(stdout,/id="authenticatedBackendSync"/);
    assert.match(stdout,/data-api-state="disabled"/);
    assert.match(stdout,/Try a conflict example/);
    assert.match(stdout,/backend-sync-ui\.js/);
    assert.match(stdout,/id="beforeList">/);
    assert.match(stdout,/id="nowList">/);
    const bytes=statSync(file).size;
    assert.ok(bytes>10000,'Rendered screenshot was unexpectedly empty');
    console.log('PASS '+spec.name+': task metrics, capabilities and electricity rendered; PNG '+bytes+' bytes');
  }
  const designUrl='http://127.0.0.1:'+port+'/familyroy-control-centre-qa/design-preview.html';
  const previewFile='/tmp/cc-browser-qa/whimsical-design-preview.png';
  const previewArgs=['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
    '--window-size=390,844','--virtual-time-budget=2000','--screenshot='+previewFile,
    '--dump-dom',designUrl];
  const preview=await execFileAsync(executable,previewArgs,{timeout:40000,maxBuffer:16*1024*1024});
  assert.match(preview.stdout,/DESIGN PREVIEW — NOT THE LIVE APP/);
  assert.match(preview.stdout,/Inbox of possibilities/);
  assert.match(preview.stdout,/aria-selected="true"/);
  assert.match(preview.stdout,/library bag on Friday/i);
  assert.ok(statSync(previewFile).size>10000,'Whimsical preview screenshot is missing');
  console.log('PASS: standalone whimsical preview renders at iPhone width');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
