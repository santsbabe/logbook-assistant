'use strict';
/*
 * Google identity boundary for a future private Control Centre API.
 * A Google OAuth access token or caller-supplied account ID is NOT identity.
 * Verify the signed ID token against Google's public keys, pinned issuer,
 * configured client audience and short-lived timestamp before deriving tenant.
 */
const {createPublicKey,verify,createHmac}=require('node:crypto');
const GOOGLE_CERTS='https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS=new Set(['accounts.google.com','https://accounts.google.com']);
const SAFE_KID=/^[a-zA-Z0-9._-]{1,180}$/;
function decodePart(part){
  if(!part||!(/^[A-Za-z0-9_-]+$/).test(part)||part.length>8000)throw Error('Invalid identity token');
  let decoded=Buffer.from(part,'base64url').toString('utf8');
  try{return JSON.parse(decoded)}catch{throw Error('Invalid identity token')}
}
function claimString(x){return typeof x==='string'&&x.length>0&&x.length<512}
async function fetchGoogleKeys(fetchImpl){
  if(typeof fetchImpl!=='function')throw Error('Identity verification unavailable');
  let response;
  try{response=await fetchImpl(GOOGLE_CERTS,{headers:{Accept:'application/json'}})}
  catch{throw Error('Identity verification unavailable')}
  if(!response?.ok)throw Error('Identity verification unavailable');
  let body;
  try{body=await response.json()}catch{throw Error('Identity verification unavailable')}
  if(!Array.isArray(body?.keys)||body.keys.length>40)throw Error('Identity verification unavailable');
  return body.keys;
}
async function verifyGoogleIdToken(token,{clientId,keys,fetchImpl,now=Date.now()}={}){
  if(!claimString(clientId)||typeof token!=='string'||token.length>12000)throw Error('Identity verification failed');
  let parts=token.split('.');
  if(parts.length!==3||parts.some(p=>!p))throw Error('Identity verification failed');
  try{
    const header=decodePart(parts[0]),claims=decodePart(parts[1]);
    if(header.alg!=='RS256'||!SAFE_KID.test(header.kid||''))throw Error('Invalid signature parameters');
    if(!ISSUERS.has(claims.iss)||claims.aud!==clientId||!claimString(claims.sub)||
       typeof claims.exp!=='number'||typeof claims.iat!=='number'||
       claims.exp*1000<=now||claims.iat*1000>now+60000||
       claims.exp-claims.iat>86400||claims.exp-claims.iat<=0)throw Error('Invalid identity claims');
    if(claims.nbf!==undefined&&(typeof claims.nbf!=='number'||claims.nbf*1000>now+60000))throw Error('Invalid identity time');
    const entries=keys||await fetchGoogleKeys(fetchImpl);
    if(!Array.isArray(entries))throw Error('Invalid key source');
    const match=entries.find(j=>j.kid===header.kid&&j.kty==='RSA'&&j.alg==='RS256'&&
      (j.use===undefined||j.use==='sig')&&j.n&&j.e);
    if(!match)throw Error('Missing Google signing key');
    const key=createPublicKey({key:{kty:'RSA',n:match.n,e:match.e},format:'jwk'});
    if(!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),key,Buffer.from(parts[2],'base64url')))throw Error('Signature mismatch');
    return{subject:claims.sub,issuedAt:claims.iat,expiresAt:claims.exp};
  }catch{throw Error('Identity verification failed')}
}
function tenantFromSubject(subject,pepper){
  if(!claimString(subject)||typeof pepper!=='string'||pepper.length<32)throw Error('Account isolation unavailable');
  return createHmac('sha256',pepper).update('control-centre:user:'+subject).digest('hex');
}
function parseBearer(value){
  if(typeof value!=='string'||!/^Bearer [A-Za-z0-9_.-]+$/.test(value)||value.length>14000)
    throw Error('Authorisation required');
  return value.slice(7);
}
module.exports={verifyGoogleIdToken,tenantFromSubject,parseBearer,GOOGLE_CERTS};
