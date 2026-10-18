'use strict';
// Runs ONLY against an ephemeral, local Postgres integration database.
// Never use an account's real database or credentials here.
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {createServer}=require('node:http');
const {generateKeyPairSync,sign,randomBytes}=require('node:crypto');
const {Pool}=require('pg');
const identity=require('../services/control-centre/identity.cjs');
const {createPostgresStateStore}=require('../services/control-centre/postgres-state.cjs');
const {createStateApi}=require('../services/control-centre/state-api.cjs');
const {createGmailPostgres,createPgLeaseProvider}=require('../services/control-centre/postgres-gmail.cjs');
const {mergeThreeWay}=require('../services/control-centre/conflict-merge.cjs');
const {createPostgresOAuthStates}=require('../services/control-centre/gmail-oauth.cjs');
const {importGmailQueue}=require('../services/control-centre/gmail-review.cjs');
const SERVER_DATE=Date.parse('2026-10-18T15:00:00Z');
const ORIGIN='https://santsbabe.github.io';
const AUDIENCE='control-centre-ci.example.apps.googleusercontent.com';
const PEPPER='control-centre-integration-non-production-hmac-secret';
const PG_URL=process.env.PG_TEST_URL||'';
const dbUrl=new URL(PG_URL);
assert.equal(dbUrl.hostname,'127.0.0.1','Test must never contact a remote PostgreSQL host');
assert.equal(dbUrl.pathname,'/control_centre_ci','Test requires an isolated disposable database');
const pool=new Pool({connectionString:PG_URL,max:8,connectionTimeoutMillis:3000,ssl:false});
const dataKey=randomBytes(32);
const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const JWK={...publicKey.export({format:'jwk'}),kid:'ci-g-signing-key',alg:'RS256',use:'sig'};
function jwt(sub){
 const head=Buffer.from(JSON.stringify({kid:JWK.kid,alg:'RS256'})).toString('base64url');
 const body=Buffer.from(JSON.stringify({sub,iss:'https://accounts.google.com',
   aud:AUDIENCE,iat:Math.floor(SERVER_DATE/1000),
   exp:Math.floor(SERVER_DATE/1000)+3600})).toString('base64url');
 const unsigned=head+'.'+body;
 return unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),privateKey).toString('base64url');
}
async function request(base,method,token,payload,origin=ORIGIN){
 const headers={Origin:origin};
 if(token)headers.Authorization='Bearer '+token;
 if(payload!==undefined)headers['Content-Type']='application/json';
 const response=await fetch(base+'/v1/state',{method,headers,
   ...(payload!==undefined?{body:JSON.stringify(payload)}:{})});
 let body=null;try{body=await response.json()}catch{}
 return{status:response.status,headers:response.headers,body};
}
(async()=>{
 let server=null;
 try{
  await pool.query(readFileSync('services/control-centre/schema/001_private_backend.sql','utf8'));
  const store=createPostgresStateStore({db:pool,encryptionKey:dataKey});
  const userA=identity.tenantFromSubject('test-family-A',PEPPER);
  const userB=identity.tenantFromSubject('test-family-B',PEPPER);
  const tokenA=jwt('test-family-A'),tokenB=jwt('test-family-B');
  const googleKeys=async url=>{
   assert.equal(url,identity.GOOGLE_CERTS);
   return{ok:true,json:async()=>({keys:[JWK]})};
  };
  const handler=createStateApi({store,googleClientId:AUDIENCE,
    tenantPepper:PEPPER,allowedOrigins:[ORIGIN],fetchImpl:googleKeys,
    rateLimiter:{allow:async()=>true},now:()=>SERVER_DATE});
  server=createServer((req,res)=>{handler(req,res).catch(()=>{
    res.statusCode=500;res.end('private API failed');
  })});
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const base='http://127.0.0.1:'+server.address().port;
  const initial=await request(base,'GET',tokenA);
  assert.equal(initial.status,200);
  assert.deepEqual(initial.body,{revision:0,data:{tasks:[]}});
  assert.equal((await request(base,'GET',tokenB)).body.revision,0);
  assert.equal((await request(base,'GET',null)).status,401);
  assert.equal((await request(base,'GET',tokenA,undefined,'https://attacker.example')).status,403);
  const tasks1={tasks:[{id:'PNPS-1',title:'Bring library bag',state:'Review'}]};
  const writes=await Promise.all(Array.from({length:8},(_,i)=>
    request(base,'PUT',tokenA,{expectedRevision:0,
      data:{tasks:[{id:'PNPS-1',title:'Bring library bag',state:'Now',attempt:i}]}})));
  assert.equal(writes.filter(r=>r.status===200).length,1,'PostgreSQL CAS must admit a single simultaneous winner');
  assert.equal(writes.filter(r=>r.status===409).length,7,'Every other concurrent write must explicitly conflict');
  const latest=await request(base,'GET',tokenA);
  assert.equal(latest.status,200);
  assert.equal(latest.body.revision,1);
  const inserted=await pool.query('SELECT revision,encrypted_snapshot FROM control_centre_state WHERE tenant_id=$1',[userA]);
  assert.equal(inserted.rows.length,1);
  assert.equal(inserted.rows[0].revision.toString(),'1');
  assert.ok(!JSON.stringify(inserted.rows[0]).includes('Bring library bag'),'Private database must contain no plaintext task details');
  const update=await request(base,'PUT',tokenA,{expectedRevision:1,data:tasks1});
  assert.equal(update.status,200);
  assert.equal(update.body.revision,2);
  assert.equal((await request(base,'GET',tokenB)).body.data.tasks.length,0,'An authorised second identity must not see first tenant records');
  assert.equal((await request(base,'GET',tokenA)).body.data.tasks[0].state,'Review');
  const stale=await request(base,'PUT',tokenA,{expectedRevision:1,data:{tasks:[]}});
  assert.equal(stale.status,409);
  assert.equal(stale.body.currentRevision,2);
  // A malformed encrypted record must fail shut rather than appear as an empty or reset account.
  const encrypted=await pool.query('SELECT encrypted_snapshot FROM control_centre_state WHERE tenant_id=$1',[userA]);
  const payload=structuredClone(encrypted.rows[0].encrypted_snapshot);
  await pool.query('UPDATE control_centre_state SET encrypted_snapshot=$2::jsonb WHERE tenant_id=$1',
    [userA,JSON.stringify({...payload,ciphertext:'Zm9yZ2Vk'})]);
  const damaged=await request(base,'GET',tokenA);
  assert.equal(damaged.status,503,'Tampered ciphertext must not be served or overwritten');
  await pool.query('UPDATE control_centre_state SET encrypted_snapshot=$2::jsonb WHERE tenant_id=$1',
    [userA,JSON.stringify(payload)]);
  assert.equal((await request(base,'GET',tokenA)).status,200);
  assert.equal((await request(base,'GET',tokenB)).status,200);
  const gmail=createGmailPostgres({db:pool,dataKey});
  const sink=await gmail.forTenant(userA);
  const key=userA+':gmail:pnpsMail12345';
  const envelope={key,sourceId:'pnpsMail12345',subject:'PNPS notice',
    sender:'School office',plainText:'Reminder without a confirmed date'};
  await sink.deliver(envelope);
  await sink.deliver(envelope);
  const dbInbox=await pool.query('SELECT encrypted_envelope FROM cc_gmail_inbox WHERE tenant_id=$1',[userA]);
  assert.equal(dbInbox.rows.length,1);
  assert.ok(!JSON.stringify(dbInbox.rows[0]).includes('School office'));
  assert.equal((await gmail.pending(userB,10)).length,0);
  const imported=await importGmailQueue({tenantId:userA,queue:gmail,stateStore:store});
  assert.equal(imported.imported,1);
  const rows=await pool.query('SELECT reviewed_at FROM cc_gmail_inbox WHERE tenant_id=$1',[userA]);
  assert.ok(rows.rows[0].reviewed_at,'Acknowledgement must occur after canonical state commit');
  const read=await store.read(userA);
  assert.equal(read.data.tasks.filter(t=>t.gmailId==='pnpsMail12345').length,1);
  assert.equal(read.data.tasks.find(t=>t.gmailId==='pnpsMail12345').state,'Review');
  assert.equal((await importGmailQueue({tenantId:userA,queue:gmail,stateStore:store})).imported,0);
  const leases=createPgLeaseProvider(pool);
  let unlock1,unlock2;
  const firstLease=leases.withLease('gmail:'+userA,async()=>{
    const skipped=await leases.withLease('gmail:'+userA,async()=>{throw Error('Second lease must never run')});
    assert.equal(skipped,null);
    unlock1=true;
  });
  await firstLease;
  await leases.withLease('gmail:'+userA,async()=>{unlock2=true});
  assert.equal(unlock1,true);assert.equal(unlock2,true);
  const states=createPostgresOAuthStates({db:pool,encryptionKey:dataKey});
  const hash='a'.repeat(64);
  await states.save({stateHash:hash,tenantId:userA,verifier:'pkce-verifier-ci',expiresAt:new Date(Date.now()+600000).toISOString()});
  assert.equal((await states.consume(hash)).verifier,'pkce-verifier-ci');
  assert.equal(await states.consume(hash),null,'OAuth CSRF state must be atomic and single-use in real Postgres');
  const merge=mergeThreeWay({tasks:[{id:'school',state:'Next'}]},
    {tasks:[{id:'school',state:'Now'}]},
    {tasks:[{id:'school',state:'Waiting'}]});
  assert.equal(merge.merged,null);assert.equal(merge.conflicts.length,1);
  console.log('PASS real loopback HTTP + disposable PostgreSQL: signed Google identities, eight competing writes/409, encrypted state and recovery, tenant isolation, encrypted Gmail Review, leases and one-time OAuth state');
 }finally{
  if(server)await new Promise(resolve=>server.close(resolve));
  await pool.end();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
