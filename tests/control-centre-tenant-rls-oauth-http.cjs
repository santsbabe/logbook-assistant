'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {Pool}=require('pg');
const {createServer,request:requestHttp}=require('node:http');
const {randomBytes,generateKeyPairSync,sign}=require('node:crypto');
const {withTenantTransaction,createTenantScopedStateStore}=require('../services/control-centre/tenant-db.cjs');
const {createGmailPostgres}=require('../services/control-centre/postgres-gmail.cjs');
const {createPostgresOAuthStates}=require('../services/control-centre/gmail-oauth.cjs');
const {createGmailRoutes,retryPendingRevocations,REVOKE_URL}=require('../services/control-centre/gmail-routes.cjs');
const {tenantFromSubject,GOOGLE_CERTS}=require('../services/control-centre/identity.cjs');
const url=new URL(process.env.PG_TEST_URL||'');
assert.equal(url.hostname,'127.0.0.1');
assert.equal(url.pathname,'/control_centre_ci');
const pool=new Pool({connectionString:url.href,ssl:false,max:8});
const cipherKey=randomBytes(32),pepper='local-CI-tenant-pepper-over-32-characters',aud='local-ci.apps.googleusercontent.com';
const A=tenantFromSubject('account-A',pepper),B=tenantFromSubject('account-B',pepper);
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...pair.publicKey.export({format:'jwk'}),kid:'test-key',alg:'RS256',use:'sig'};
const when=Date.now();
function token(subject){
 const head=Buffer.from(JSON.stringify({kid:jwk.kid,alg:'RS256'})).toString('base64url');
 const payload=Buffer.from(JSON.stringify({iss:'https://accounts.google.com',aud,sub:subject,
  iat:Math.floor(when/1000),exp:Math.floor(when/1000)+3600})).toString('base64url');
 const source=head+'.'+payload;
 return source+'.'+sign('RSA-SHA256',Buffer.from(source),pair.privateKey).toString('base64url');
}
const secret='fake-gmail-refresh-token-just-for-CI';
let providerStatus=503,exchangeSubject='account-A';
const fetchImpl=async endpoint=>{
 if(endpoint===GOOGLE_CERTS)return{ok:true,json:async()=>({keys:[jwk]})};
 if(endpoint==='https://oauth2.googleapis.com/token')
  return{ok:true,json:async()=>({id_token:token(exchangeSubject),refresh_token:secret,
    scope:'openid email https://www.googleapis.com/auth/gmail.readonly'})};
 if(endpoint===REVOKE_URL)return{ok:providerStatus===200,status:providerStatus};
 throw Error('Unknown network endpoint in isolated test');
};
async function http(base,method,path,authorization,origin,host){
 const dest=new URL(base+path);
 const headers={...(authorization?{Authorization:'Bearer '+authorization}:{}),
   ...(origin?{Origin:origin}:{}),
   ...(host?{Host:host}:{})};
 const result=await new Promise((resolve,reject)=>{
  const req=requestHttp({hostname:dest.hostname,port:dest.port,path:dest.pathname+dest.search,
    method,headers},res=>{
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>resolve({status:res.statusCode,rawHeaders:res.headers,
        text:Buffer.concat(chunks).toString('utf8')}));
  });
  req.on('error',reject);req.end();
 });
 let body=result.text;try{body=JSON.parse(body)}catch{}
 return{status:result.status,body,headers:{get:key=>result.rawHeaders[key.toLowerCase()]}};
}

(async()=>{
 let server;
 try{
  await pool.query(fs.readFileSync('services/control-centre/schema/001_private_backend.sql','utf8'));
  await pool.query(fs.readFileSync('services/control-centre/schema/002_tenant_rls.sql','utf8'));
  await pool.query('CREATE ROLE cc_rls_ci_role NOLOGIN NOBYPASSRLS');
  await pool.query('GRANT USAGE ON SCHEMA public TO cc_rls_ci_role');
  await pool.query('GRANT SELECT,INSERT,UPDATE ON control_centre_state TO cc_rls_ci_role');
  await pool.query('GRANT SELECT,INSERT,UPDATE ON cc_gmail_inbox TO cc_rls_ci_role');
  const scopedPool={connect:async()=>{
   const client=await pool.connect();
   return{query:async(sql,args)=>{
    if(sql==='BEGIN'){await client.query('BEGIN');await client.query('SET LOCAL ROLE cc_rls_ci_role');return}
    return client.query(sql,args);
   },release:()=>client.release()};
  }};
  const state=createTenantScopedStateStore({pool:scopedPool,encryptionKey:cipherKey});
  assert.equal((await state.compareAndSwap(A,0,{tasks:[{id:'a',state:'Now'}]})).applied,true);
  assert.equal((await state.compareAndSwap(B,0,{tasks:[{id:'b',state:'Next'}]})).applied,true);
  assert.equal((await state.compareAndSwap(A,1,{tasks:[{id:'a',state:'Done'}]})).revision,2);
  assert.equal((await state.read(A)).data.tasks[0].id,'a');
  assert.equal((await state.read(B)).data.tasks[0].id,'b');
  const cross=await withTenantTransaction(scopedPool,B,db=>
   db.query('SELECT tenant_id FROM control_centre_state WHERE tenant_id=$1',[A]));
  assert.equal(cross.rows.length,0,'Postgres RLS must prevent cross-account read');
  await assert.rejects(()=>withTenantTransaction(scopedPool,B,db=>
   db.query('INSERT INTO control_centre_state(tenant_id,revision,encrypted_snapshot) VALUES($1,7,$2::jsonb)',
    [A,JSON.stringify({ciphertext:'forged'})])),/row-level security/);
  await assert.rejects(()=>withTenantTransaction(scopedPool,A,db=>
   db.query('SELECT * FROM cc_gmail_credentials')),/permission denied/);
  await assert.rejects(()=>withTenantTransaction(scopedPool,A,db=>
   db.query('SELECT * FROM cc_oauth_states')),/permission denied/);
  const gmail=createGmailPostgres({db:pool,dataKey:cipherKey});
  const oauthStates=createPostgresOAuthStates({db:pool,encryptionKey:cipherKey});
  const redirectUri='https://private.example/v1/gmail/callback';
  const frontendOrigin='https://santsbabe.github.io';
  const route=createGmailRoutes({vault:gmail,oauthStates,googleClientId:aud,
   googleClientSecret:'ci-client-secret',tenantPepper:pepper,
   redirectUri,frontendOrigin,fetchImpl,now:()=>when,rateLimiter:{allow:async()=>true}});
  server=createServer((req,res)=>route(req,res).catch(()=>{res.statusCode=500;res.end('internal failure')}));
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const base='http://127.0.0.1:'+server.address().port;
  const preflight=await http(base,'OPTIONS','/v1/gmail/start',null,frontendOrigin);
  assert.equal(preflight.status,204);
  assert.equal(preflight.headers.get('access-control-allow-origin'),frontendOrigin);
  assert.equal((await http(base,'OPTIONS','/v1/gmail/start',null,'https://evil.example')).status,403);
  assert.equal((await http(base,'POST','/v1/gmail/start',null,frontendOrigin)).status,401);
  assert.equal((await http(base,'POST','/v1/gmail/start',token('account-A'),'https://evil.example')).status,403);
  const started=await http(base,'POST','/v1/gmail/start',token('account-A'),frontendOrigin);
  assert.equal(started.status,200);
  const authorise=new URL(started.body.authorizationUrl);
  assert.equal(authorise.searchParams.get('code_challenge_method'),'S256');
  const stateParam=authorise.searchParams.get('state'),callback='/v1/gmail/callback?state='+stateParam+'&code=test-authorisation';
  assert.equal((await http(base,'GET',callback,null,null,'evil.example')).status,400);
  const success=await http(base,'GET',callback,null,null,'private.example');
  assert.equal(success.status,200,success.body);
  assert.equal(success.headers.get('referrer-policy'),'no-referrer');
  assert.ok(!success.body.includes(stateParam)&&!success.body.includes(secret));
  assert.equal((await http(base,'GET',callback,null,null,'private.example')).status,400);
  assert.equal(await gmail.getRefreshToken(A),secret);
  const otherStart=await http(base,'POST','/v1/gmail/start',token('account-B'),frontendOrigin);
  const otherState=new URL(otherStart.body.authorizationUrl).searchParams.get('state');
  assert.equal((await http(base,'GET','/v1/gmail/callback?state='+otherState+'&code=test-authorisation',null,null,'private.example')).status,400);
  assert.equal(await gmail.getRefreshToken(B),null);
  const disconnect=await http(base,'POST','/v1/gmail/disconnect',token('account-A'),frontendOrigin);
  assert.equal(disconnect.status,202);
  assert.equal(disconnect.body.disabled,true);
  assert.equal(await gmail.getRefreshToken(A),null,'Gmail polling must stop immediately');
  assert.equal(await gmail.getRevocationToken(A),secret,'Encrypted credential retained for provider retry');
  assert.equal((await retryPendingRevocations({vault:gmail,fetchImpl})).pending,1);
  providerStatus=200;
  assert.equal((await retryPendingRevocations({vault:gmail,fetchImpl})).revoked,1);
  assert.equal(await gmail.getRevocationToken(A),null);
  assert.equal((await http(base,'POST','/v1/gmail/disconnect',token('account-A'),frontendOrigin)).status,200);
  console.log('PASS forced PostgreSQL RLS, role restrictions, real signed OAuth HTTP callback, one-time state and Gmail revocation retry');
 }finally{
  if(server)await new Promise(ok=>server.close(ok));
  await pool.end();
 }
})().catch(e=>{console.error(e);process.exitCode=1});
