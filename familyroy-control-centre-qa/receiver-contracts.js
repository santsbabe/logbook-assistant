// Pure browser-side receiver validation; no credentials or user records are stored here.
(function(root){
 "use strict";
 function schoolActionIdentity(action={},canonicalTitle){
   const title=typeof canonicalTitle==="function"?canonicalTitle(action.title||""):String(action.title||"").toLowerCase().trim();
   const child=String(action.child||"Children").toLowerCase().replace(/\s+/g," ").trim();
   const due=String(action.due||"").slice(0,10);
   const source=String(action.familyRoySourceId||action.gmailId||action.source||"");
   return [title,child,due||"undated:"+source].join("|");
 }
 function endpointAllowed(endpoint){
   try{
     const u=new URL(String(endpoint||""));
     return u.protocol==="https:"&&u.port===""&&u.pathname==="/"&&u.search===""&&u.hash===""&&
       /^(?:familyroy-intake|deploy-preview-[0-9]+--familyroy-intake)\.netlify\.app$/.test(u.hostname);
   }catch{return false;}
 }
 root.FamilyRoyReceiverContracts=Object.freeze({schoolActionIdentity,endpointAllowed});
})(globalThis);
