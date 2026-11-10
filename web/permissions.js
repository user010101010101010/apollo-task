// Job titles describe work; these per-person capabilities govern changes to shared data.
export const MEMBER_CAPABILITIES=[
 {id:'knowledge',title:'Документы и файлы',description:'Страницы, разделы, папки, доски, реестры и рабочие файлы.'},
 {id:'tasks',title:'Задачи',description:'Создание задач, исполнители, сроки и статусы.'},
 {id:'projects',title:'Проекты и заказы',description:'Сведения, этапы и сроки. Для нового проекта нужны права на документы.'},
 {id:'reviews',title:'Согласования',description:'Отправка материалов и решения по назначенным согласованиям.'},
 {id:'people',title:'Карточки сотрудников',description:'Должности, подразделения и ответственность. Доступы выдаёт только руководитель.'}
];
export function memberPermissions(member={}){return Object.fromEntries(MEMBER_CAPABILITIES.map(({id})=>[id,member.role==='owner'||(member.role==='editor'&&(member.permissions?.[id]??true))]));}
export const canMember=(member,key)=>memberPermissions(member)[key]===true;
const canonical=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const same=(a,b)=>canonical(a)===canonical(b);
export function deniedWorkspaceChange(old,next,member,uid){
 const grants=memberPermissions(member);if(member.role==='owner')return null;
 const groups={knowledge:['spaces','folders','boards','databases','links'],tasks:['tasks'],projects:['projects'],reviews:['reviews'],people:['people']};
 for(const [key,fields]of Object.entries(groups))if(!grants[key]&&fields.some(field=>!same(old[field]||[],next[field]||[])))return key;
 if(!grants.knowledge&&!same(old.pages,next.pages)){
  // Approving an assigned, saved review may update just that page's publication status.
  if(!grants.reviews||old.pages.length!==next.pages.length)return 'knowledge';
  for(let i=0;i<old.pages.length;i++){const a=old.pages[i],b=next.pages[i];if(same(a,b))continue;const {status:before,...restA}=a,{status:after,...restB}=b;if(!same(restA,restB))return 'knowledge';const review=old.reviews.find(r=>r.page===a.id&&r.reviewer===uid&&r.decision==='pending'&&r.pageUpdated===a.updated),updated=review&&next.reviews.find(r=>r.id===review.id);const outgoing=(next.reviews||[]).find(r=>!(old.reviews||[]).some(old=>old.id===r.id)&&r.page===a.id&&r.requestedBy===uid&&r.decision==='pending'&&r.pageUpdated===a.updated);if(outgoing&&after==='review')continue;if(!updated||!['approved','changes'].includes(updated.decision)||after!==(updated.decision==='approved'?'published':'review'))return 'knowledge';
  }
 }
 return null;
}
