/* Private Drive appData snapshot transport for Control Centre QA.
 * No secrets or refresh tokens are saved here. This is user-invoked transfer,
 * deliberately NOT background sync or an automatic multi-writer merge.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ControlCentreCloud=api;
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const SCOPE='https://www.googleapis.com/auth/drive.appdata';
  const FORMAT='familyroy-control-centre-cloud-snapshot';
  const PREFIX='control-centre-qa-snapshot-';
  const MAX_BYTES=4*1024*1024;
  const MAX_LIST_PAGES=10;
  const API='https://www.googleapis.com/drive/v3/files';
  const UPLOAD='https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,createdTime';
  function validData(data){
    return !!data&&typeof data==='object'&&!Array.isArray(data)&&
      Array.isArray(data.tasks)&&data.tasks.length<=20000&&
      data.tasks.every(t=>t&&typeof t==='object'&&!Array.isArray(t)&&
        typeof t.id==='string'&&t.id.length>0&&t.id.length<=300);
  }
  function safeSnapshot(snapshot){
    if(!snapshot||snapshot.format!==FORMAT||snapshot.version!==1||
       !validData(snapshot.data)||typeof snapshot.savedAt!=='string'||
       !Number.isFinite(Date.parse(snapshot.savedAt)))throw new Error('Unrecognised or incomplete Control Centre cloud copy');
    return snapshot;
  }
  function authorizeHeaders(token){
    if(!token||typeof token!=='string')throw new Error('Google Drive authorisation is required');
    return {Authorization:'Bearer '+token};
  }
  async function requestJson(fetchImpl,url,{token,method='GET',headers={},body}={}){
    if(typeof fetchImpl!=='function')throw new Error('Missing request transport');
    const response=await fetchImpl(url,{method,headers:{...authorizeHeaders(token),...headers},...(body===undefined?{}:{body})});
    if(!response||!response.ok)throw new Error('Private Google Drive request failed ('+(response?.status||'network')+')');
    try{return await response.json()}catch{throw new Error('Google Drive returned invalid JSON')}
  }
  async function listCopies(fetchImpl,token){
    let copies=[],cursor='',pages=0;
    do{
      if(++pages>MAX_LIST_PAGES)throw new Error('Too many cloud copies; refusing to assume which is latest');
      const url=new URL(API);url.searchParams.set('spaces','appDataFolder');
      url.searchParams.set('pageSize','100');
      url.searchParams.set('fields','nextPageToken,files(id,name,mimeType,createdTime,size)');
      if(cursor)url.searchParams.set('pageToken',cursor);
      const result=await requestJson(fetchImpl,url.href,{token});
      if(!Array.isArray(result.files))throw new Error('Google Drive returned no file listing');
      copies.push(...result.files.filter(f=>typeof f.id==='string'&&
        typeof f.name==='string'&&f.name.startsWith(PREFIX)&&
        f.name.endsWith('.json')&&f.mimeType==='application/json'));
      cursor=result.nextPageToken||'';
      if(cursor&&typeof cursor!=='string')throw new Error('Invalid Google Drive pagination');
    }while(cursor);
    copies.sort((a,b)=>String(b.createdTime||'').localeCompare(String(a.createdTime||''))||b.name.localeCompare(a.name));
    return copies;
  }
  async function readCopy(fetchImpl,token,file){
    if(!file||typeof file.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(file.id)||
       typeof file.name!=='string'||!file.name.startsWith(PREFIX))throw new Error('Untrusted Google Drive file');
    const result=await requestJson(fetchImpl,API+'/'+encodeURIComponent(file.id)+'?alt=media',{token});
    return safeSnapshot(result);
  }
  async function createCopy(fetchImpl,token,data,{now=new Date(),nonce}={}){
    if(!validData(data))throw new Error('Invalid local action collection; nothing uploaded');
    if(!nonce||!/^[a-zA-Z0-9-]{8,100}$/.test(nonce))throw new Error('Secure unique copy identifier required');
    const savedAt=now.toISOString();
    const snapshot={format:FORMAT,version:1,savedAt,data};
    const encoded=JSON.stringify(snapshot);
    if(encoded.length>MAX_BYTES)throw new Error('Local data is too large for the safe cloud-copy limit');
    const name=PREFIX+savedAt.replace(/[:.]/g,'-')+'-'+nonce+'.json';
    const boundary='ccsync-'+nonce.replace(/-/g,'');
    const metadata={name,parents:['appDataFolder'],mimeType:'application/json'};
    const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+
      JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+
      encoded+'\r\n--'+boundary+'--';
    const created=await requestJson(fetchImpl,UPLOAD,{token,method:'POST',
      headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
    if(!created||typeof created.id!=='string'||created.name!==name)throw new Error('Google Drive could not confirm creation');
    return {id:created.id,name:created.name,savedAt,taskCount:data.tasks.length};
  }
  return{SCOPE,FORMAT,PREFIX,MAX_BYTES,validData,safeSnapshot,listCopies,readCopy,createCopy};
});