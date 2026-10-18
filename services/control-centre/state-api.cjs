'use strict';
/*
 * HTTPS-only host-agnostic private API handler (not a deployed HTTP server).
 * Client must supply a real, short-lived Google ID token — NOT a Gmail OAuth
 * access token. Every request verifies the signature and derives tenant from sub.
 */
const {verifyGoogleIdToken,tenantFromSubject,parseBearer}=require('./identity.cjs');
const {validState,MAX_JSON_BYTES}=require('./conflict-merge.cjs');
const MAX_BODY=MAX_JSON_BYTES+8192;
const ALLOWED_METHODS='GET, PUT, OPTIONS';
function json(res,status,payload){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}
function createStateApi({store,googleClientId,tenantPepper,allowedOrigins,fetchImpl,rateLimiter,now}={}){
  if(!store||typeof store.read!=='function'||typeof store.compareAndSwap!=='function'||
     !googleClientId||!tenantPepper||typeof fetchImpl!=='function'||
     !rateLimiter||typeof rateLimiter.allow!=='function'||
     !Array.isArray(allowedOrigins)||!allowedOrigins.length||
     !allowedOrigins.every(o=>/^https:\/\/[^/]+$/.test(o)))throw Error('Private API configuration incomplete');
  const origins=new Set(allowedOrigins);
  return async function handle(req,res){
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Vary','Origin');
    const origin=req.headers?.origin;
    if(origin&&!origins.has(origin))return json(res,403,{error:'Origin not permitted'});
    if(origin){res.setHeader('Access-Control-Allow-Origin',origin)}
    if(req.method==='OPTIONS'){
      if(!origin)return json(res,403,{error:'Origin required'});
      res.setHeader('Access-Control-Allow-Methods',ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age','600');
      res.statusCode=204;return res.end();
    }
    let pathname;
    try{pathname=new URL(req.url,'https://private-control-centre.invalid').pathname}
    catch{return json(res,404,{error:'Not found'})}
    if(pathname!=='/v1/state')return json(res,404,{error:'Not found'});
    if(!['GET','PUT'].includes(req.method))return json(res,405,{error:'Method not allowed'});
    let subject;
    try{
      const token=parseBearer(req.headers?.authorization);
      const identity=await verifyGoogleIdToken(token,{clientId:googleClientId,fetchImpl,now:now?.()??Date.now()});
      subject=identity.subject;
    }catch{return json(res,401,{error:'Valid Google sign-in required'})}
    let id;
    try{id=tenantFromSubject(subject,tenantPepper)}
    catch{return json(res,503,{error:'Private account storage unavailable'})}
    try{
      if(!await rateLimiter.allow(id,req.method))return json(res,429,{error:'Request rate limit exceeded'});
      if(req.method==='GET'){
        const current=await store.read(id);
        return json(res,200,{revision:current.revision,data:current.data});
      }
      if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers?.['content-type']||'')){
        return json(res,415,{error:'JSON required'});
      }
      if(Number(req.headers['content-length']||0)>MAX_BODY)return json(res,413,{error:'State too large'});
      let bytes=0,chunks=[];
      for await(const chunk of req){
        bytes+=chunk.length;
        if(bytes>MAX_BODY)return json(res,413,{error:'State too large'});
        chunks.push(chunk);
      }
      let body;
      try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}
      catch{return json(res,400,{error:'Invalid JSON'})}
      if(!Number.isSafeInteger(body?.expectedRevision)||body.expectedRevision<0||
         !validState(body?.data))return json(res,400,{error:'Invalid state or revision'});
      const outcome=await store.compareAndSwap(id,body.expectedRevision,body.data);
      if(outcome.applied)return json(res,200,{revision:outcome.revision,updated:true});
      const latest=await store.read(id);
      return json(res,409,{error:'Concurrent edit: fetch current state and reconcile before saving',currentRevision:latest.revision});
    }catch{return json(res,503,{error:'Private storage temporarily unavailable'})}
  };
}
module.exports={createStateApi};
