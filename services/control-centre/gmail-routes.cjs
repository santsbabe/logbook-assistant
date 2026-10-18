'use strict';
/* Staged HTTPS-only private Gmail routes. No public server is started here. */
const {verifyGoogleIdToken,tenantFromSubject,parseBearer}=require('./identity.cjs');
const {beginGmailConsent,completeGmailConsent}=require('./gmail-oauth.cjs');
const REVOKE_URL='https://oauth2.googleapis.com/revoke';
function response(res,status,body,kind='json'){
  res.statusCode=status;
  if(kind==='html'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>Control Centre Google connection</title><p>'+body+'</p>');
  }
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
async function revokeProvider(fetchImpl,token){
  if(typeof token!=='string'||!token)return false;
  try{
    const result=await fetchImpl(REVOKE_URL,{method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({token}).toString(),redirect:'error'});
    return result?.status===200;
  }catch{return false}
}
async function retryPendingRevocations({vault,fetchImpl,maxAccounts=10}={}){
  if(!vault||typeof vault.listRevocationsPending!=='function'||typeof vault.getRevocationToken!=='function'||
     typeof vault.revoke!=='function'||typeof fetchImpl!=='function'||
     !Number.isInteger(maxAccounts)||maxAccounts<1||maxAccounts>30)throw Error('Private revocation dependencies unavailable');
  const entries=await vault.listRevocationsPending();
  if(!Array.isArray(entries))throw Error('Invalid revocation queue');
  let revoked=0,pending=0;
  for(const entry of entries.slice(0,maxAccounts)){
    const tenant=entry?.tenantId;
    if(typeof tenant!=='string'||!/^[a-f0-9]{64}$/.test(tenant)){pending++;continue}
    const token=await vault.getRevocationToken(tenant);
    if(!token){await vault.revoke(tenant);revoked++;continue}
    if(await revokeProvider(fetchImpl,token)){await vault.revoke(tenant);revoked++}
    else pending++;
  }
  return{revoked,pending,more:entries.length>maxAccounts};
}
function createGmailRoutes({vault,oauthStates,googleClientId,googleClientSecret,tenantPepper,
  redirectUri,frontendOrigin,fetchImpl,now=()=>Date.now(),rateLimiter}={}){
  if(!vault||typeof vault.disableGmail!=='function'||typeof vault.getRevocationToken!=='function'||
    typeof vault.revoke!=='function'||!oauthStates||typeof oauthStates.save!=='function'||
    typeof oauthStates.consume!=='function'||typeof fetchImpl!=='function'||!googleClientId||
    !googleClientSecret||!tenantPepper||!/^https:\/\/[^/]+\/v1\/gmail\/callback$/.test(redirectUri||'')||
    !/^https:\/\/[^/]+$/.test(frontendOrigin||'')||
    !rateLimiter||typeof rateLimiter.allow!=='function')
    throw Error('Private Gmail OAuth runtime not configured');
  const privateOrigin=new URL(redirectUri).origin;
  return async function handler(req,res){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Content-Security-Policy',"default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Vary','Origin');
    let url;
    try{url=new URL(req.url,privateOrigin)}
    catch{return response(res,404,{error:'Not found'})}
    if(url.pathname==='/v1/gmail/callback'&&req.method==='GET'){
      if(url.toString().length>6000||req.headers?.host!==new URL(redirectUri).host)
        return response(res,400,'Google authorisation could not be verified.','html');
      const codes=url.searchParams.getAll('code'),states=url.searchParams.getAll('state');
      if(url.searchParams.has('error')||codes.length!==1||states.length!==1)
        return response(res,400,'Google connection was cancelled or invalid.','html');
      try{
        await completeGmailConsent({
          state:states[0],code:codes[0],store:oauthStates,vault,
          clientId:googleClientId,clientSecret:googleClientSecret,
          redirectUri,tenantPepper,fetchImpl,now:now()
        });
        return response(res,200,'Google Gmail connection confirmed. You may close this window.','html');
      }catch{
        return response(res,400,'Google connection could not be completed. Reopen Control Centre to try again.','html');
      }
    }
    if(!['/v1/gmail/start','/v1/gmail/disconnect'].includes(url.pathname)||req.method!=='POST')
      return response(res,404,{error:'Not found'});
    const origin=req.headers?.origin;
    if(origin!==frontendOrigin)return response(res,403,{error:'Unapproved browser origin'});
    res.setHeader('Access-Control-Allow-Origin',frontendOrigin);
    let tenant;
    try{
      const idToken=parseBearer(req.headers?.authorization);
      const verified=await verifyGoogleIdToken(idToken,{clientId:googleClientId,fetchImpl,now:now()});
      tenant=tenantFromSubject(verified.subject,tenantPepper);
    }catch{return response(res,401,{error:'Valid Google sign-in required'})}
    if(!await rateLimiter.allow(tenant,req.method))return response(res,429,{error:'Too many requests'});
    if(url.pathname==='/v1/gmail/start'){
      try{
        const started=await beginGmailConsent({tenantId:tenant,store:oauthStates,clientId:googleClientId,
          redirectUri,now:now()});
        return response(res,200,{authorizationUrl:started.authorizationUrl,
          expiresInSeconds:started.expiresInSeconds});
      }catch{return response(res,503,{error:'Google authorisation unavailable'})}
    }
    try{
      // Disable locally FIRST, even if Google is unreachable or times out.
      await vault.disableGmail(tenant);
      const token=await vault.getRevocationToken(tenant);
      if(!token){await vault.revoke(tenant);return response(res,200,{disabled:true,providerRevoked:true})}
      const remoteDone=await revokeProvider(fetchImpl,token);
      if(remoteDone){await vault.revoke(tenant);return response(res,200,{disabled:true,providerRevoked:true})}
      return response(res,202,{disabled:true,providerRevoked:false,
        message:'Gmail stopped locally; provider revocation queued for retry'});
    }catch{
      return response(res,503,{error:'Gmail disconnection could not be confirmed'});
    }
  };
}
module.exports={createGmailRoutes,revokeProvider,retryPendingRevocations,REVOKE_URL};
