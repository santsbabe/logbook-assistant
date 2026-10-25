/* Rewards Radar — isolated, browser-local extension to FamilyRoy Shopping Radar.
   No third-party sends, background location access, or modification of familyroy_cc_live_v1. */
(function (root) {
  'use strict';
  const STORAGE_KEY = 'familyroy_rewards_radar_v1';
  const MEDIA_DB = 'familyroy_rewards_media_v1';
  const FIRST_REWARD = Object.freeze({
    id:'mugg-bean-hot-drink-2026', title:'Free hot drink', retailer:'Mugg & Bean',
    slug:'mugg-and-bean', mode:'anyBranch', branch:'',
    expiryAt:'2026-11-06T23:59:00+02:00', redeemed:false,
    sourceUrl:'', createdAt:'2026-10-25'
  });
  const clone = r => ({...r});
  function slug(value) {
    return String(value || '').toLowerCase().trim().replace(/&/g,'and')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  }
  function parseExpiry(date,time='23:59') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time))) {
      throw Error('Enter a valid expiry date and time.');
    }
    const at=date+'T'+time+':00+02:00';
    const ms=Date.parse(at);
    if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10) === 'Invalid') throw Error('Invalid expiry date.');
    const parts=date.split('-').map(Number);
    const utc=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
    if (utc.getUTCFullYear()!==parts[0] || utc.getUTCMonth()!==parts[1]-1 || utc.getUTCDate()!==parts[2]) {
      throw Error('Invalid expiry date.');
    }
    return at;
  }
  function status(reward,now=Date.now()) {
    if (reward.redeemed) return 'redeemed';
    const end=Date.parse(reward.expiryAt);
    if (!Number.isFinite(end) || now>=end+60000) return 'expired';
    const remaining=end+60000-now;
    return remaining<=3*86400000?'urgent':remaining<=7*86400000?'soon':'active';
  }
  function matches(reward,shop='',branch='') {
    const retailer=slug(shop),storeBranch=slug(branch);
    if (retailer && slug(reward.slug||reward.retailer)!==retailer) return false;
    if (reward.mode==='specific' && retailer) {
      return !!storeBranch && slug(reward.branch)===storeBranch;
    }
    return true;
  }
  function visible(rewards,query='',now=Date.now()) {
    const params=new URLSearchParams(String(query).replace(/^\?/,'')), quick=params.has('shop');
    const shop=params.get('shop') || '', branch=params.get('branch') || '';
    return rewards.filter(r => matches(r,shop,branch) && (!quick || !['expired','redeemed'].includes(status(r,now))))
      .sort((a,b) => {
        const score=x=>x.redeemed?2:status(x,now)==='expired'?1:0;
        return score(a)-score(b) || Date.parse(a.expiryAt)-Date.parse(b.expiryAt);
      });
  }
  function read(storage) {
    const raw=storage.getItem(STORAGE_KEY);
    if (raw===null) return [clone(FIRST_REWARD)]; // starter metadata; no code/photo or auto-write
    const payload=JSON.parse(raw);
    if (!payload || payload.version!==1 || !Array.isArray(payload.items)) {
      throw Error('Rewards data is unreadable. Nothing has been overwritten.');
    }
    return payload.items.map(clone);
  }
  function save(storage,rewards) {
    storage.setItem(STORAGE_KEY,JSON.stringify({version:1,items:rewards.map(clone)}));
  }
  function add(storage,fields) {
    if (!String(fields.title||'').trim() || !String(fields.retailer||'').trim()) throw Error('Enter the reward and retailer.');
    if (fields.mode==='specific' && !String(fields.branch||'').trim()) throw Error('Enter the eligible branch.');
    const expiryAt=parseExpiry(fields.date,fields.time || '23:59');
    let sourceUrl=String(fields.sourceUrl || '').trim();
    if (sourceUrl && !/^https:\/\/[^\s<>]+$/i.test(sourceUrl)) throw Error('Offer link must start with https://');
    const items=read(storage);
    const id='reward-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
    items.push({id,title:fields.title.trim(),retailer:fields.retailer.trim(),
      slug:slug(fields.retailer),mode:fields.mode==='specific'?'specific':'anyBranch',
      branch:fields.mode==='specific'?fields.branch.trim():'',
      expiryAt,redeemed:false,sourceUrl,createdAt:new Date().toISOString().slice(0,10)});
    save(storage,items);
    return id;
  }
  function mark(storage,id,value) {
    const items=read(storage),item=items.find(x=>x.id===id);
    if (!item) throw Error('Reward no longer exists.');
    item.redeemed=!!value;
    save(storage,items);
  }
  function remove(storage,id) {
    const items=read(storage);
    if (!items.some(x=>x.id===id)) return false;
    save(storage,items.filter(x=>x.id!==id));
    return true;
  }
  const api={STORAGE_KEY,FIRST_REWARD,slug,parseExpiry,status,matches,visible,read,save,add,mark,remove};
  if (typeof module!=='undefined' && module.exports) module.exports=api;
  root.RewardsRadar=api;
  if (!root.document) return;

  const elem=id=>document.getElementById(id);
  const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  const msg=s=>{for(const id of ['rewardMessage','rewardToast']){const e=elem(id);if(e)e.textContent=s;}};
  const offerDate=iso=>new Intl.DateTimeFormat('en-ZA',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Africa/Johannesburg'}).format(new Date(iso));
  function render() {
    const host=elem('rewardsRadarRoot'); if (!host) return;
    try {
      const items=read(localStorage),search=location.search;
      const results=visible(items,search),quick=new URLSearchParams(search).has('shop');
      const badge={urgent:'Use soon',soon:'This week',active:'Available',expired:'Expired',redeemed:'Redeemed'};
      const count=results.filter(x=>!['redeemed','expired'].includes(status(x))).length;
      host.innerHTML='<div id="rewardToast" class="muted" role="status" aria-live="polite"></div><div class="shopHead"><div><h2>🎟️ Rewards Radar</h2><div class="muted">Expiry-aware rewards for this visit</div></div><div class="shopCount">'+count+' active</div></div>'
        +'<div class="rewardCards">'+(results.map(x=>{
          const s=status(x),where=x.mode==='specific'?'Only at '+x.branch:'Participating '+x.retailer+' branches';
          const eligibleNote=quick && !new URLSearchParams(search).get('shop') && x.mode==='specific'?
            '<div class="tiny">Check the eligible branch before travelling.</div>':'';
          const safeId=/^[a-z0-9-]+$/i.test(x.id)?x.id:'';
          const href=x.sourceUrl && /^https:\/\//i.test(x.sourceUrl)?'<a class="btn" href="'+escapeHtml(x.sourceUrl)+'" target="_blank" rel="noopener noreferrer">Offer source</a>':'';
          return '<div class="task rewardItem"><div class="rewardTop"><span class="pill reward-'+s+'">'+badge[s]+'</span><span class="tiny">'+escapeHtml(x.retailer)+'</span></div>'
            +'<strong>'+escapeHtml(x.title)+'</strong><div class="rewardExpiry">Expires '+escapeHtml(offerDate(x.expiryAt))+' SAST</div>'
            +'<div class="tiny">'+escapeHtml(where)+'</div>'+eligibleNote
            +'<div class="row" style="margin-top:10px"><button class="btn primary" onclick="showRewardImage(\''+safeId+'\')">Show voucher</button>'
            +href+'<button class="btn" onclick="setRewardRedeemed(\''+safeId+'\','+(!x.redeemed)+')">'+(x.redeemed?'Undo redeemed':'Redeemed ✓')+'</button></div>'
            +(!quick?'<div class="row rewardManage"><button class="btn" onclick="rewardPickImage(\''+safeId+'\',true)">Take photo</button><button class="btn" onclick="rewardPickImage(\''+safeId+'\',false)">Choose photo</button><button class="btn" onclick="removeReward(\''+safeId+'\')">Remove</button></div>':'')
            +'</div>';
        }).join('')||'<div class="shopEmpty">No active rewards for this location.</div>')+'</div>'
        +'<div class="tiny rewardPrivacy">Saved only in this browser. No voucher codes or images are uploaded to GitHub.</div>';
    } catch(err) {
      host.innerHTML='<div class="status bad">Rewards data could not be read. It has not been changed. '+escapeHtml(err.message)+'</div>';
    }
  }
  root.renderRewardsRadar=render;
  root.addRadarReward=function(){
    const fields={title:elem('rewardTitle').value,retailer:elem('rewardRetailer').value,
      date:elem('rewardExpiryDate').value,time:elem('rewardExpiryTime').value||'23:59',
      mode:elem('rewardMode').value,branch:elem('rewardBranch').value,
      sourceUrl:elem('rewardSource').value};
    try{add(localStorage,fields);for(const id of ['rewardTitle','rewardRetailer','rewardExpiryDate','rewardBranch','rewardSource'])elem(id).value='';render();msg('Reward saved on this device. Use Take photo or Choose photo to attach your voucher.');}
    catch(err){msg(err.message);}
  };
  root.setRewardRedeemed=function(id,value){
    try{mark(localStorage,id,value);render();msg(value?'Reward marked redeemed.':'Reward restored.');}
    catch(err){msg(err.message);}
  };
  root.removeReward=function(id){
    if (!confirm('Remove this reward from this browser?')) return;
    try {remove(localStorage,id);openMedia().then(db=>{const tx=db.transaction('photos','readwrite');tx.objectStore('photos').delete(id);tx.oncomplete=()=>db.close();}).catch(()=>{});render();msg('Reward removed.');}
    catch(err){msg(err.message);}
  };
  let pendingImageId='',currentPreview='';
  root.rewardPickImage=function(id,camera){
    pendingImageId=id;
    const input=elem(camera?'rewardCamera':'rewardUpload');
    if(input){input.value='';input.click();}
  };
  const openMedia=()=>new Promise((resolve,reject)=>{
    if(!root.indexedDB){reject(Error('Photo storage is unavailable in this browser.'));return;}
    const request=indexedDB.open(MEDIA_DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('photos');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||Error('Cannot access photo storage.'));
  });
  root.rewardAttachFromInput=async function(input) {
    const file=input.files&&input.files[0], id=pendingImageId;
    if(!file)return;
    if (!/^image\/(png|jpeg|webp|heic|heif)$/i.test(file.type)) {msg('Choose a JPG, PNG, WEBP or HEIC image.');return;}
    if (file.size>8*1024*1024){msg('Image is over 8 MB. Choose a smaller photo.');return;}
    try {
      const db=await openMedia();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('photos','readwrite');
        tx.objectStore('photos').put(file,id);
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Image could not be saved.'));
      });
      db.close();msg('Voucher image saved privately in this browser.');
    }catch(err){msg('Could not save voucher image: '+err.message);}
  };
  root.showRewardImage=async function(id){
    try{
      const db=await openMedia();
      const blob=await new Promise((resolve,reject)=>{
        const tx=db.transaction('photos','readonly'),r=tx.objectStore('photos').get(id);
        r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error('Cannot read voucher image.'));
      });
      db.close();
      if(!blob){msg('No voucher image saved yet. Open the regular Shopping Radar view to add a photo.');return;}
      if(currentPreview)URL.revokeObjectURL(currentPreview);
      currentPreview=URL.createObjectURL(blob);
      elem('rewardImage').src=currentPreview;
      elem('rewardImagePanel').hidden=false;
      elem('rewardImagePanel').scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(err){msg(err.message);}
  };
  root.closeRewardImage=function(){
    elem('rewardImagePanel').hidden=true;elem('rewardImage').removeAttribute('src');
    if(currentPreview){URL.revokeObjectURL(currentPreview);currentPreview='';}
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
