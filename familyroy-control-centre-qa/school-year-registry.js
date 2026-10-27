/* Year-specific school/grade/class mapping. Browser + Node tests share identical rules.
 * The initial entries are user-established routing rules, NOT annual confirmations.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.ControlCentreSchoolRegistry=api;
})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const YEARS=[2026,2027];
 const SEED=[
  {year:2026,school:'PNPS',grade:'2',classCode:'',child:'Harrison'},
  {year:2026,school:'PNPS',grade:'2',classCode:'2M',child:'Harrison'},
  {year:2026,school:'PNPS',grade:'2',classCode:'2D',child:'Harrison'},
  {year:2026,school:'PNPS',grade:'R',classCode:'',child:'Alexander'},
  {year:2026,school:'Red Roots',grade:'R',classCode:'',child:'Alexander'},
  {year:2026,school:'Red Roots',grade:'',classCode:'',child:'Alexander'},
  {year:2026,school:'100 Acre Wood',grade:'',classCode:'',child:'Imogen'},
  {year:2027,school:'PNPS',grade:'3',classCode:'',child:'Harrison'},
  {year:2027,school:'PNPS',grade:'1',classCode:'',child:'Alexander'}
 ];
 const PEOPLE=['Harrison','Alexander','Imogen'];
 const schoolName=s=>{let x=String(s||'').toLowerCase().replace(/[\r\n\t.,:;/\\-]+/g,' ').replace(/\s+/g,' ');
  if(/\bpnps\b|\bpinelands\s+north\s+primary(?:\s+school)?\b/.test(x))return'PNPS';
  if(/\bred\s+roots\b/.test(x))return'Red Roots';
  if(/\b100\s*acre\s*wood\b/.test(x))return'100 Acre Wood';
  return null;
 };
 const canonicalSchool=s=>schoolName(s)||String(s||'').trim().replace(/\s+/g,' ').slice(0,85);
 const gradeCode=s=>{let x=String(s||'').trim().toUpperCase().replace(/^GRADE\s*/,'').replace(/^GR\s*/,'');
  return ['R','1','2','3','4','5','6','7','8','9','10','11','12'].includes(x)?x:'';
 };
 const classCode=s=>String(s||'').trim().toUpperCase().replace(/\s+/g,'').slice(0,10);
 function defaults(){return{version:1,records:SEED.map((v,i)=>({...v,id:'initial-'+i})),
  confirmations:[],history:[]}}
 function validRow(row){return row&&Number.isInteger(Number(row.year))&&Number(row.year)>=2000&&Number(row.year)<=2100&&
  typeof row.school==='string'&&row.school.length>0&&row.school.length<=85&&
  (gradeCode(row.grade)!==''||(row.grade===''&&row.classCode===''))&&PEOPLE.includes(row.child)&&
  typeof row.classCode==='string'&&row.classCode.length<=10&&/^[A-Z0-9]*$/.test(row.classCode);}
 function ensure(snapshot){
  if(!snapshot||!Array.isArray(snapshot.records))return defaults();
  return{version:1,records:snapshot.records.filter(validRow).map(x=>({...x,year:Number(x.year),
    school:canonicalSchool(x.school),grade:gradeCode(x.grade),classCode:classCode(x.classCode)})),
   confirmations:Array.isArray(snapshot.confirmations)?snapshot.confirmations.slice(0,1000):[],
   history:Array.isArray(snapshot.history)?snapshot.history.slice(0,5000):[]};
 }
 function annualRequired(registry,year){
  return !ensure(registry).confirmations.some(x=>Number(x.year)===Number(year)&&x.confirmed===true);
 }
 function confirm(registry,year,when=new Date()){
  if(!Number.isInteger(Number(year))||Number(year)<2026||Number(year)>2100)throw Error('Invalid school year');
  const d=ensure(registry);
  if(!d.records.some(r=>r.year===Number(year)))throw Error('Enter the learners for this school year before confirming');
  d.confirmations=[...d.confirmations.filter(x=>Number(x.year)!==Number(year)),
   {year:Number(year),confirmed:true,confirmedAt:when.toISOString()}];
  d.history.push({change:'confirm',year:Number(year),at:when.toISOString()});return d;
 }
 function change(registry,{originalId='',year,school,grade,classCode:className='',child},when=new Date()){
  const d=ensure(registry);
  const value={year:Number(year),school:canonicalSchool(school),grade:gradeCode(grade),
    classCode:classCode(className),child};
  if(!validRow(value))throw Error('Choose a valid school year, school, grade and child');
  if(value.classCode&&value.grade!=='R'&&!value.classCode.startsWith(value.grade))
    throw Error('Class code must belong to the selected grade');
  if(originalId&&d.records.every(r=>r.id!==originalId))throw Error('Mapping no longer exists');
  const old=originalId?d.records.find(r=>r.id===originalId):null;
  if(d.records.some(r=>r.id!==originalId&&r.year===value.year&&r.school===value.school&&
     r.grade===value.grade&&r.classCode===value.classCode&&r.child===value.child))
    throw Error('This child already has this school year and class mapping');
  // Append audit trail rather than rewriting/deleting the historical evidence.
  if(old)d.history.push({change:'amend',previous:{...old},at:when.toISOString()});
  const record={...value,id:old?.id||('custom-'+value.year+'-'+
    d.history.length+'-'+String(when.getTime()))};
  if(originalId)d.records=d.records.map(r=>r.id===originalId?record:r);
  else d.records.push(record);
  const affectedYears=new Set([value.year,...(old?[old.year]:[])]);
  d.confirmations=d.confirmations.filter(x=>!affectedYears.has(Number(x.year)));
  d.history.push({change:'set',value:{...record},at:when.toISOString()});
  return d;
 }
 function remove(registry,id,when=new Date()){
  const d=ensure(registry),row=d.records.find(r=>r.id===id);
  if(!row)throw Error('School mapping no longer exists');
  d.history.push({change:'remove',previous:{...row},at:when.toISOString()});
  d.records=d.records.filter(r=>r.id!==id);
  d.confirmations=d.confirmations.filter(x=>Number(x.year)!==row.year);
  return d;
 }
 function relevantYear(text,sourceDate=new Date()){
  const raw=String(text||'');
  const matches=[...raw.matchAll(/\b20(?:2[0-9]|3[0-9])\b/g)].map(x=>Number(x[0]));
  const explicit=[...new Set(matches)];
  if(explicit.length>1)return{year:null,reason:'Notice contains conflicting school years'};
  if(explicit.length===1)return{year:explicit[0],reason:'Explicit notice year'};
  const parsed=sourceDate instanceof Date?sourceDate:new Date(sourceDate);
  if(!Number.isFinite(parsed.getTime()))return{year:null,reason:'Notice date is unknown'};
  return{year:parsed.getFullYear(),reason:'Source timestamp year'};
 }
 function inferGrade(text){
  const t=String(text||'');
  const explicit=[...t.matchAll(/\b(?:grade|gr\.?)\s*(R|[1-9]|1[0-2])\b/ig)]
    .map(x=>x[1].toUpperCase());
  const cls=[...t.matchAll(/\b(?:class\s*)?(2M|2D|2E|[1-9][A-Z])\b/ig)].map(x=>x[1].toUpperCase());
  const classes=[...new Set(cls)];
  const grades=[...new Set([...explicit,...classes.map(x=>x.slice(0,-1))])];
  return{grade:grades.length===1?grades[0]:'',grades,
    classCode:classes.length===1?classes[0]:'',classes,conflict:false};
 }
 function mentionedChildren(text,sourceChildren=[]){
  const source=String(text||'');
  const names=[];
  if(/\bharrison\b/i.test(source))names.push('Harrison');
  if(/\balexander\b|\balex\b/i.test(source))names.push('Alexander');
  if(/\bimogen\b/i.test(source))names.push('Imogen');
  // Source route children are existing explicit extraction, not a new inference.
  for(const person of sourceChildren||[])if(PEOPLE.includes(person)&&!names.includes(person))names.push(person);
  return names;
 }
 function wholeSchool(text){
  return /\b(?:whole[\s-]*school|school[\s-]*wide|all[\s-]*(?:pupils|learners|students|grades|pnps)|entire[\s-]*school|all[\s-]*school[\s-]*families)\b/i.test(String(text||''));
 }
 function resolve({text='',source='',school='',sourceChildren=[],sourceDate=new Date(),registry}={}){
  const d=ensure(registry),context=String(text||'')+'\n'+String(source||'');
  const institution=canonicalSchool(school)||schoolName(context);
  const {year,reason:yearReason}=relevantYear(text,sourceDate);
  const children=mentionedChildren(text,sourceChildren);
  const level=inferGrade(text+'\n'+source);
  if(!year)return{status:'review',school:institution||null,year,children:[],reason:yearReason};
  if(children.length){
    if(institution==='PNPS'&&level.grades.length===1&&!wholeSchool(text)){
      const known=d.records.filter(r=>r.year===year&&r.school==='PNPS'&&r.grade===level.grades[0]&&
        (!level.classes.length?!r.classCode:level.classes.includes(r.classCode)));
      if(known.length&&children.some(c=>!known.some(r=>r.child===c)))
        return{status:'review',school:institution,year,children,reason:'Explicit learner conflicts with school-year registry'};
    }
    return{status:'matched',school:institution||null,year,children,reason:'Explicit named learners'};
  }
  if(!institution)return{status:'review',school:null,year,children:[],reason:'School not identified'};
  if(institution==='PNPS'&&wholeSchool(text))return{status:'matched',school:institution,year,
    children:['Harrison','Alexander'],reason:'Whole-school PNPS notice'};
  if(institution==='PNPS'&&level.classes.length&&level.classes.every(c=>c==='2E'))
    return{status:'ignore',school:institution,year,children:[],reason:'PNPS class 2E excluded by confirmed rule'};
  if(!level.grades.length){
    const schoolOnly=[...new Set(d.records.filter(r=>r.year===year&&r.school===institution&&
      r.grade===''&&r.classCode==='').map(r=>r.child))];
    if(schoolOnly.length===1)return{status:'matched',school:institution,year,
      children:schoolOnly,reason:'Verified '+year+' school-only affiliation'};
    return{status:'review',school:institution,year,children:[],
      reason:schoolOnly.length>1?'Conflicting school-only learner records':'No learner grade or class; confirm the intended children'};
  }
  const targets=[],unknown=[];
  for(const grade of level.grades){
    const classes=level.classes.filter(c=>c.slice(0,-1)===grade&&!(institution==='PNPS'&&c==='2E'));
    const onlyExcluded=institution==='PNPS'&&level.classes.some(c=>c==='2E'&&grade==='2')&&classes.length===0;
    if(onlyExcluded)continue;
    const matches=classes.length?classes.map(code=>d.records.filter(r=>r.year===year&&r.school===institution&&
      r.grade===grade&&r.classCode===code)):
      [d.records.filter(r=>r.year===year&&r.school===institution&&r.grade===grade&&!r.classCode)];
    for(const records of matches){
      const names=[...new Set(records.map(r=>r.child))];
      if(names.length!==1)unknown.push(grade);
      else targets.push(names[0]);
    }
  }
  if(unknown.length)return{status:'review',school:institution,year,children:[],
    reason:'Unknown or conflicting learner mapping for grade '+[...new Set(unknown)].join(', ')};
  const unique=[...new Set(targets)];
  if(unique.length)return{status:'matched',school:institution,year,children:unique,
    reason:'Verified '+year+' '+institution+' grade/class registry'};
  return{status:'ignore',school:institution,year,children:[],reason:'Only excluded PNPS class 2E targeted'};
 }
 return{YEARS,PEOPLE,SEED,defaults,ensure,validRow,annualRequired,confirm,change,remove,
  schoolName,canonicalSchool,gradeCode,classCode,relevantYear,inferGrade,mentionedChildren,resolve};
});
