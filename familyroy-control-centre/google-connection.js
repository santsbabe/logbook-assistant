window.FamilyRoyGoogle=(function(){
const CID='familyroy_google_client_id',DEFAULT_CLIENT_ID='3411436553-jfmu0dls32bcgovgcicmh5pglrgiq063.apps.googleusercontent.com';let tokenClient=null,accessToken=null;
function clientId(){return localStorage.getItem(CID)||DEFAULT_CLIENT_ID}
function setClientId(id){if(id)localStorage.setItem(CID,id);else localStorage.removeItem(CID)}
function token(){return accessToken}
function init(callback){let id=clientId();if(!id||!window.google?.accounts?.oauth2)return false;tokenClient=google.accounts.oauth2.initTokenClient({client_id:id,scope:'https://www.googleapis.com/auth/gmail.readonly',callback:r=>{if(r.error){callback&&callback(r);return}accessToken=r.access_token;callback&&callback(r)}});return true}
function request(callback){if(!clientId()){callback&&callback({error:'missing_client_id'});return}if(!tokenClient&&!init(callback)){callback&&callback({error:'google_not_ready'});return}tokenClient.callback=r=>{if(!r.error)accessToken=r.access_token;callback&&callback(r)};tokenClient.requestAccessToken({prompt:'consent'})}
async function gmail(path){if(!accessToken)throw new Error('Gmail is not connected.');let r=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/'+path,{headers:{Authorization:'Bearer '+accessToken}});if(!r.ok)throw new Error(await r.text());return r.json()}
return{clientId,setClientId,token,init,request,gmail};
})();