/* Staged private-client workflow, no deployed backend required for review demo.
 * Browser auth token remains in memory and is never written to localStorage.
 */
(function(root,factory){
  const api=factory(root.ControlCentreSync);
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./authenticated-sync.js'));
  else root.ControlCentreBackendUI=api;
})(typeof window==='undefined'?globalThis:window,function(Sync){
  'use strict';
  function createController({config,fetchImpl,getLocal,saveLocal,exportBackup}={}){
    if(!Sync||typeof getLocal!=='function'||typeof saveLocal!=='function'||typeof exportBackup!=='function')
      throw Error('Local recovery dependencies missing');
    const available=config?.enabled===true;
    const client=available?Sync.createClient({config,fetchImpl}):null;
    let token=null,remote=null,base=null,choices=Object.create(null),review=null;
    let localProof=null,serverRevision=null,lastCommit=null;
    function currentLocal(){
      const data=getLocal();
      if(!Sync.validData(data))throw Error('Local tasks need repair before cloud sync');
      return data;
    }
    function compute(){
      if(!remote)throw Error('Connect to a private server first');
      const local=currentLocal();
      localProof=JSON.stringify(local);
      review=Sync.planMerge(base,local,remote.data,choices);
      serverRevision=remote.revision;
      return review;
    }
    async function connect(idToken){
      if(!available)throw Error('Private backend is not deployed. Review-only demo is available');
      if(typeof idToken!=='string'||idToken.length<100)throw Error('Valid Google ID sign-in required');
      token=idToken;
      try{remote=await client.read(token);base=null;choices=Object.create(null);return compute()}
      catch(e){token=null;remote=null;throw e}
    }
    function choose(key,side){
      if(!review||!review.conflicts.some(c=>c.key===key))throw Error('Unknown conflict');
      if(!['local','remote'].includes(side))throw Error('Choose this device or server explicitly');
      choices[key]=side;return compute();
    }
    async function refresh(){
      if(!token||!remote)throw Error('Sign in to inspect the server');
      const latest=await client.read(token);
      if(latest.revision!==remote.revision){
        remote=latest;choices=Object.create(null);
      }
      return compute();
    }
    async function commit(){
      if(!available||!token||!remote||!review)throw Error('Private server sign-in required');
      if(!review.ready||!review.candidate)throw Error('Resolve every conflict first');
      if(JSON.stringify(currentLocal())!==localProof)throw Error('Device data changed; re-review before upload');
      const fresh=await client.read(token);
      if(fresh.revision!==serverRevision){
        remote=fresh;choices=Object.create(null);compute();
        return{saved:false,reason:'remote-changed',review};
      }
      // Do not proceed if a modified device appeared while we were comparing.
      if(JSON.stringify(currentLocal())!==localProof)throw Error('Device data changed during review');
      await exportBackup(); // Explicit downloadable safety copy BEFORE remote write
      const candidate=review.candidate;
      const response=await client.write(token,fresh.revision,candidate);
      if(response.conflict){
        remote=await client.read(token);choices=Object.create(null);compute();
        return{saved:false,reason:'concurrent-write',review};
      }
      remote={revision:response.revision,data:JSON.parse(JSON.stringify(candidate))};
      base=JSON.parse(JSON.stringify(candidate));
      choices=Object.create(null);
      lastCommit=response.revision;
      // Remote is already committed. If local write fails, leave the server
      // record intact and report precisely that this device requires recovery.
      const result=await saveLocal(candidate);
      if(result!==true)return{saved:true,localSaved:false,revision:response.revision};
      compute();
      return{saved:true,localSaved:true,revision:response.revision};
    }
    function demo(){
      const baseDemo={tasks:[
        {id:'school',title:'Pack library bag',state:'Next'},
        {id:'friday',title:'Friday swimming',state:'Next'}
      ],shopping:[]};
      const local={tasks:[
        {id:'school',title:'Pack library bag',state:'Done'},
        {id:'friday',title:'Friday swimming',state:'Next'}
      ],shopping:[]};
      const cloud={tasks:[
        {id:'school',title:'Pack library bag',state:'Waiting'},
        {id:'friday',title:'Friday swimming',state:'Next'},
        {id:'new',title:'School notice to review',state:'Review'}
      ],shopping:[]};
      return{base:baseDemo,local,cloud};
    }
    function reviewDemo(choices={}){
      const {base,local,cloud}=demo();
      return Sync.planMerge(base,local,cloud,choices);
    }
    function signOut(){token=null;remote=null;base=null;choices=Object.create(null);review=null;localProof=null;serverRevision=null}
    return{available,connect,refresh,choose,commit,reviewDemo,signOut,
      get review(){return review},get connected(){return !!token&&!!remote},
      get remoteRevision(){return remote?.revision??null},get lastCommit(){return lastCommit}};
  }
  function mount({config,fetchImpl,google,getLocal,saveLocal,exportBackup,container}={}){
    if(!container||!container.ownerDocument)throw Error('Private sync UI container unavailable');
    const document=container.ownerDocument;
    const ctl=createController({config,fetchImpl,getLocal,saveLocal,exportBackup});
    const append=(parent,tag,text,cls)=>{
      const node=document.createElement(tag);
      if(text!==undefined&&text!==null)node.textContent=String(text);
      if(cls)node.className=cls;parent.appendChild(node);return node;
    };
    append(container,'h2','Secure synchronisation ✨');
    const intro=append(container,'p',ctl.available?
      'Sign in with Google to review changes. Nothing is uploaded or replaced automatically.':
      'Private backend not deployed. You can explore the conflict workflow without connecting or changing your tasks.','muted');
    intro.setAttribute('data-api-state',ctl.available?'staged-enabled':'disabled');
    const status=append(container,'div',ctl.available?
      'Not signed in. No cloud changes made.':'QA preview only — real cloud synchronisation is disabled.','status');
    status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const controls=append(container,'div',null,'row');
    const panel=append(container,'div',null,'conflict-panel');
    let demoChoices=Object.create(null),demonstrating=false,busy=false,confirmedRevision=null;
    function makeButton(parent,label,handler,kind=''){
      const b=append(parent,'button',label,'btn'+(kind?' '+kind:''));
      b.type='button';b.addEventListener('click',handler);return b;
    }
    async function safeAction(fn){
      if(busy)return;busy=true;
      try{await fn()}catch(e){status.textContent=e.message||'Could not finish the operation'}
      finally{busy=false}
    }
    function showPlan(plan,{isDemo=false}={}){
      while(panel.firstChild)panel.removeChild(panel.firstChild);
      append(panel,'h3',isDemo?'Example: two devices changed the same task':'Review before synchronising');
      append(panel,'p',plan.remoteTasks+' cloud tasks · '+plan.localTasks+
        ' device tasks · '+plan.unresolved.length+' decisions outstanding.','muted');
      if(plan.firstConnection&&!isDemo)
        append(panel,'p','First connection: no trustworthy common baseline. Differences require review; neither device wins automatically.','muted');
      for(const conflict of plan.conflicts){
        const card=append(panel,'div',null,'task');
        append(card,'strong',conflict.kind==='task'?'Task: '+String(conflict.id):'Data section: '+String(conflict.id));
        function describe(value){
          if(value===undefined)return 'Not present on this side (choosing it removes the item)';
          if(conflict.kind==='task')return (value.title||value.id||'Unnamed task')+' · '+(value.state||'Uncategorised');
          return 'Existing '+conflict.id+' data; choosing this side replaces the other version';
        }
        append(card,'p','This device: '+describe(conflict.local),'muted');
        append(card,'p','Cloud: '+describe(conflict.remote),'muted');
        const select=append(card,'select');
        select.setAttribute('aria-label','Resolve '+conflict.kind+' '+conflict.id);
        select.setAttribute('data-conflict-key',conflict.key);
        for(const [value,label]of [['','Choose which version to keep'],['local','Keep this device'],['remote','Keep cloud version']]){
          const option=append(select,'option',label);option.value=value;
        }
        select.value=conflict.selection||'';
        select.addEventListener('change',()=>{
          if(isDemo){
            if(select.value)demoChoices[conflict.key]=select.value;else delete demoChoices[conflict.key];
            showPlan(ctl.reviewDemo(demoChoices),{isDemo:true});
            const target=Array.from(panel.querySelectorAll('select')).find(x=>x.getAttribute('data-conflict-key')===conflict.key);
            if(target)target.focus();
          }else if(select.value){
            try{showPlan(ctl.choose(conflict.key,select.value));
              const target=Array.from(panel.querySelectorAll('select')).find(x=>x.getAttribute('data-conflict-key')===conflict.key);
              if(target)target.focus();}
            catch(e){status.textContent=e.message}
          }
        });
      }
      if(plan.ready){
        append(panel,'p','All differences accounted for. The merged result retains '+plan.candidate.tasks.length+' tasks.','muted');
        const before=getLocal();
        const ids=new Map((before.tasks||[]).map(t=>[t.id,t]));
        const after=new Map(plan.candidate.tasks.map(t=>[t.id,t]));
        const removed=[...ids.keys()].filter(id=>!after.has(id)).length;
        const altered=[...ids.keys()].filter(id=>after.has(id)&&JSON.stringify(ids.get(id))!==JSON.stringify(after.get(id))).length;
        const added=[...after.keys()].filter(id=>!ids.has(id)).length;
        const sections=Object.keys(before).filter(k=>k!=='tasks'&&JSON.stringify(before[k])!==JSON.stringify(plan.candidate[k])).length;
        const summary=removed+' tasks removed · '+altered+' changed · '+added+' added · '+sections+' other data sections affected.';
        const consequence=append(panel,'p',summary,'muted');
        consequence.setAttribute('role','status');
        if(removed||altered||sections)append(panel,'p',
          'Warning: choosing a different version can replace or remove existing household data. Save a backup and inspect the decisions before proceeding.','status warn');
        if(isDemo){
          append(panel,'p','This is an example only; no device or cloud data will be changed.','muted');
        }else{
          const acknowledgment=append(panel,'label',null,'row');
          const checked=document.createElement('input');
          checked.type='checkbox';checked.checked=false;
          checked.style.width='auto';checked.style.minWidth='20px';
          acknowledgment.appendChild(checked);
          append(acknowledgment,'span','I have reviewed the changes and understand what this save will replace.');
          const submit=makeButton(panel,'Back up and submit reviewed changes',()=>safeAction(async()=>{
            if(!checked.checked)throw Error('Confirm the reviewed changes first');
            const result=await ctl.commit();
            if(result.saved&&result.localSaved){
              status.textContent='Private cloud and this device saved at revision '+result.revision+'.';
              showPlan(ctl.review);
            }else if(result.saved){
              status.textContent='Cloud was saved, but this device could not save locally. Download and restore from the cloud before editing.';
            }else{
              status.textContent='Cloud changed while you reviewed. Your original data remains intact; review the new conflicts.';
              showPlan(result.review);
            }
          }),'primary');
          submit.disabled=true;
          checked.addEventListener('change',()=>{submit.disabled=!checked.checked});
        }
      }else{
        append(panel,'p','No cloud write is possible until every difference is resolved.','muted');
      }
    }
    makeButton(controls,'Try a conflict example',()=>{
      demoChoices=Object.create(null);demonstrating=true;
      showPlan(ctl.reviewDemo(),{isDemo:true});
      status.textContent='Example only — no tasks changed.';
    });
    if(ctl.available){
      const signIn=append(controls,'div',null);
      signIn.id='backendGoogleButton';
      if(!google?.accounts?.id||!config.googleClientId){
        status.textContent='Google identity script or approved web OAuth client is missing. Backend remains disconnected.';
      }else{
        google.accounts.id.initialize({client_id:config.googleClientId,
          callback:reply=>safeAction(async()=>{
            const token=reply?.credential;
            if(typeof token!=='string')throw Error('Google did not provide an identity token');
            const plan=await ctl.connect(token);demonstrating=false;confirmedRevision=ctl.remoteRevision;
            status.textContent='Signed in. Server revision '+ctl.remoteRevision+' inspected. No data changed.';
            showPlan(plan);
          })});
        google.accounts.id.renderButton(signIn,{theme:'outline',size:'large',text:'signin_with'});
      }
      makeButton(controls,'Refresh server snapshot',()=>safeAction(async()=>{
        const plan=await ctl.refresh();demonstrating=false;
        status.textContent='Latest server revision inspected. No local changes applied.';
        showPlan(plan);
      }));
      makeButton(controls,'Disconnect',()=>{ctl.signOut();demonstrating=false;
        while(panel.firstChild)panel.removeChild(panel.firstChild);
        status.textContent='Disconnected. No token stored.';});
    }
    return{controller:ctl,status,panel,showPlan};
  }
  return{createController,mount};
});