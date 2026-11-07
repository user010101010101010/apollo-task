import {handleAttachments} from './attachments.mjs';
import {handleCompanyMedia} from './media.mjs';
import {z} from 'zod';
import {agencyWorkspace} from '../public/agency-data.js';
import {str,person,validateWorkspace,sidebarSchema,dashboardSchema} from './schema.mjs';
const now=()=>new Date().toISOString(),id=()=>crypto.randomUUID();
const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const hash=async v=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))).map(x=>x.toString(16).padStart(2,'0')).join('');
const fail=(message,status)=>Object.assign(new Error(message),{status});
function requireEditor(member){if(!member||member.role==='viewer')throw fail('У вас доступ только для просмотра',403);}
function requireOwner(member){if(member?.role!=='owner')throw fail('Нужны права владельца пространства',403);}
async function body(request){if(Number(request.headers.get('content-length')||0)>8000000)throw fail('Слишком большой запрос',413);if(!request.headers.get('content-type')?.includes('application/json'))throw fail('Ожидается JSON',415);const text=await request.text();if(text.length>8000000)throw fail('Слишком большой запрос',413);return JSON.parse(text);}
async function membership(db,wid,userId){const row=await db.prepare('SELECT * FROM members WHERE workspace_id=? AND user_id=?').bind(wid,userId).first();if(!row)throw fail('Нет доступа к этому пространству',403);return row;}
async function load(db,wid){const row=await db.prepare('SELECT * FROM workspaces WHERE id=?').bind(wid).first();if(!row)throw fail('Пространство не найдено',404);return {...row,state:JSON.parse(row.state)};}
async function roster(db,wid){return (await db.prepare('SELECT user_id,name,email,role,joined FROM members WHERE workspace_id=? ORDER BY joined').bind(wid).all()).results;}
async function userWorkspaces(db,userId){return (await db.prepare('SELECT w.id,w.name,m.role FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.created').bind(userId).all()).results;}
export function initialState(user,name){return validateWorkspace(agencyWorkspace({id:user.userId,name:user.displayName||user.email,email:user.email,agency:name,role:'Администратор компании'}));}
async function createWorkspace(db,user,name,role){const wid=id(),s=role?validateWorkspace(agencyWorkspace({id:user.userId,name:user.displayName||user.email,email:user.email,agency:name,role})):initialState(user,name);delete s.favorites;delete s.dismissedWelcome;delete s.notificationsRead;await db.batch([db.prepare('INSERT INTO workspaces(id,name,state,revision,created,updated) VALUES(?,?,?,1,?,?)').bind(wid,name,JSON.stringify(s),now(),now()),db.prepare('INSERT INTO members(workspace_id,user_id,name,email,role,joined) VALUES(?,?,?,?,?,?)').bind(wid,user.userId,user.displayName||user.email,user.email,'owner',now())]);return wid;}
export async function handleAPI(request,env,user){try{
  if(new URL(request.url).pathname==='/api/health'&&request.method==='GET'){if(!env.DB)return response({ok:false,database:false},503);await env.DB.prepare('SELECT 1 AS ok').first();return response({ok:true,database:true,files:Boolean(env.BUCKET),version:'0.8.0'});}
  if(!user)return response({error:'Войдите через ChatGPT, чтобы открыть рабочее пространство',code:'SIGN_IN_REQUIRED'},401);
  if(!env.DB)return response({error:'База данных временно недоступна'},503);
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\//,''),method=request.method,db=env.DB;
  if(!['GET','HEAD'].includes(method)){const origin=request.headers.get('origin');if(origin&&origin!==url.origin)throw fail('Запрос с другого сайта запрещён',403);}
  if(['profile','company','media'].includes(path)){const result=await handleCompanyMedia(request,env,user,path);if(result)return result;}
  if(path==='session'&&method==='GET')return response({user:{id:user.userId,name:user.displayName||user.email,email:user.email},workspaces:await userWorkspaces(db,user.userId)});
  if(path==='register'&&method==='POST'){const d=await body(request),name=str(100).min(1).parse(d.name?.trim()),agency=str(80).min(1).parse(d.agency?.trim()),role=str(120).min(1).parse(d.role?.trim());const existing=await userWorkspaces(db,user.userId);if(existing.some(w=>w.name===agency&&w.role==='owner'))return response({workspaceId:existing.find(w=>w.name===agency&&w.role==='owner').id});return response({workspaceId:await createWorkspace(db,{...user,displayName:name},agency,role)},201);}
  if(path==='bootstrap'&&method==='GET'){
    let list=await userWorkspaces(db,user.userId),wid=url.searchParams.get('workspace')||list[0]?.id;
    if(!wid){wid=await createWorkspace(db,user,'Моя компания');list=await userWorkspaces(db,user.userId);}
    const member=await membership(db,wid,user.userId),data=await load(db,wid),prefs=await db.prepare('SELECT json FROM preferences WHERE workspace_id=? AND user_id=?').bind(wid,user.userId).first();
    return response({user:{id:user.userId,name:member.name,email:member.email,role:member.role},workspaceId:wid,revision:data.revision,state:data.state,preferences:prefs?JSON.parse(prefs.json):{},workspaces:list,members:await roster(db,wid)});
  }
  if(path==='workspace'&&method==='POST'){const data=await body(request),name=str(80).min(1).parse(data.name?.trim());return response({workspaceId:await createWorkspace(db,user,name,'Администратор компании')},201);}
  if(path==='workspace'&&method==='PUT'){
    const data=await body(request),wid=person.parse(data.workspaceId),member=await membership(db,wid,user.userId);requireEditor(member);
    let parsed;try{parsed=validateWorkspace(data.state);}catch{throw fail('Некорректная структура данных пространства',400);}const old=await load(db,wid);if(old.revision!==data.revision)return response({error:'Пространство изменено другим участником. Обновите данные перед сохранением.',code:'CONFLICT',revision:old.revision,state:old.state},409);
    if(JSON.stringify(parsed.company?.logo)!==JSON.stringify(old.state.company?.logo)||parsed.people.some(p=>p.photo!==old.state.people.find(x=>x.id===p.id)?.photo))throw fail('Изображения изменяются через загрузку в профиле или компании',403);
    if(member.role!=='owner'&&JSON.stringify(parsed.company)!==JSON.stringify(old.state.company))throw fail('Настройки компании меняет администратор',403);
    if(member.role!=='owner'&&parsed.workspace!==old.name)throw fail('Только владелец может менять название пространства',403);
    for(const m of await roster(db,wid))if(!parsed.people.some(p=>p.id===m.user_id))throw fail('Нельзя удалить карточку участника с действующим доступом',400);
    validateReviews(old.state,parsed,user.userId,await roster(db,wid));
    const result=await db.prepare('UPDATE workspaces SET name=?,state=?,revision=revision+1,updated=? WHERE id=? AND revision=?').bind(parsed.workspace,JSON.stringify(parsed),now(),wid,data.revision).run();
    if(!result.meta.changes)return response({error:'Данные изменились. Перезагрузите пространство.',code:'CONFLICT'},409);return response({revision:data.revision+1});
  }
  if(path==='preferences'&&method==='PUT'){const d=await body(request);await membership(db,d.workspaceId,user.userId);const prefs=z.object({favorites:z.array(str(100)).max(2000),dismissedWelcome:z.boolean(),notificationsRead:z.boolean(),theme:z.enum(['dark','light']).optional(),sidebar:sidebarSchema.optional(),dashboard:dashboardSchema.optional(),recentSearch:z.array(z.object({kind:z.enum(['page','task','person','project','board','database','folder','link','template']),id:str(100)})).max(8).optional()}).parse(d.preferences);await db.prepare('INSERT INTO preferences(workspace_id,user_id,json) VALUES(?,?,?) ON CONFLICT(workspace_id,user_id) DO UPDATE SET json=excluded.json').bind(d.workspaceId,user.userId,JSON.stringify(prefs)).run();return response({ok:true});}

  if(path==='invitations'&&method==='POST'){const d=await body(request);requireOwner(await membership(db,d.workspaceId,user.userId));const role=z.enum(['editor','viewer']).parse(d.role),email=d.email?z.string().email().max(150).parse(d.email.toLowerCase().trim()):null,token=id()+id(),expires=new Date(Date.now()+7*86400000).toISOString();await db.prepare('INSERT INTO invitations(hash,workspace_id,role,email,expires,created_by) VALUES(?,?,?,?,?,?)').bind(await hash(token),d.workspaceId,role,email,expires,user.userId).run();return response({url:`${url.origin}/?invite=${encodeURIComponent(token)}`,expires},201);}
  if(path==='join'&&method==='POST'){const d=await body(request),token=str(100).parse(d.token),inv=await db.prepare('SELECT * FROM invitations WHERE hash=?').bind(await hash(token)).first();if(!inv||inv.expires<now()||(inv.used_by&&inv.used_by!==user.userId))throw fail('Приглашение недействительно или уже использовано',410);if(inv.email&&inv.email!==user.email.toLowerCase())throw fail('Приглашение выдано другому адресу',403);
    const used=await db.prepare('UPDATE invitations SET used_by=? WHERE hash=? AND (used_by IS NULL OR used_by=?)').bind(user.userId,inv.hash,user.userId).run();if(!used.meta.changes)throw fail('Приглашение уже использовано',410);
    await db.prepare('INSERT INTO members(workspace_id,user_id,name,email,role,joined) VALUES(?,?,?,?,?,?) ON CONFLICT(workspace_id,user_id) DO NOTHING').bind(inv.workspace_id,user.userId,user.displayName||user.email,user.email,inv.role,now()).run();
    for(let attempt=0;attempt<4;attempt++){const row=await load(db,inv.workspace_id);if(row.state.people.some(p=>p.id===user.userId))break;row.state.people.push({id:user.userId,name:user.displayName||user.email,email:user.email,role:'Участник команды',team:'Команда',responsibility:'Добавьте вашу зону ответственности в профиле.',color:'blue'});const r=await db.prepare('UPDATE workspaces SET state=?,revision=revision+1,updated=? WHERE id=? AND revision=?').bind(JSON.stringify(row.state),now(),row.id,row.revision).run();if(r.meta.changes)break;if(attempt===3)throw fail('Повторите открытие пространства',409);}return response({workspaceId:inv.workspace_id});
  }
  if(path==='members'&&method==='PUT'){const d=await body(request);requireOwner(await membership(db,d.workspaceId,user.userId));if(d.userId===user.userId)throw fail('Нельзя изменить собственный доступ',400);const role=z.enum(['editor','viewer']).parse(d.role);await db.prepare('UPDATE members SET role=? WHERE workspace_id=? AND user_id=? AND role!=?').bind(role,d.workspaceId,d.userId,'owner').run();return response({ok:true});}
  if(path==='members'&&method==='DELETE'){const d=await body(request);requireOwner(await membership(db,d.workspaceId,user.userId));if(d.userId===user.userId)throw fail('Нельзя удалить свой доступ',400);await db.prepare('DELETE FROM members WHERE workspace_id=? AND user_id=? AND role!=?').bind(d.workspaceId,d.userId,'owner').run();return response({ok:true});}
  if(path==='attachments'||path.startsWith('files/')){const result=await handleAttachments(request,env,user,path);if(result)return result;}
  return response({error:'Неизвестный маршрут'},404);
}catch(err){if(err instanceof z.ZodError)return response({error:'Проверьте заполнение полей'},400);return response({error:err.status?err.message:'Не удалось выполнить запрос. Попробуйте ещё раз.'},err.status||500);}}

export function validateReviews(old,s,userId,members){
 const validMember=id=>members.some(m=>m.user_id===id&&m.role!=='viewer');
 for(const r of s.reviews){const previous=(old.reviews||[]).find(x=>x.id===r.id),p=s.pages.find(p=>p.id===r.page);if(!previous){if(r.requestedBy!==userId||r.decision!=='pending'||!validMember(r.reviewer)||r.pageUpdated!==p.updated)throw fail('Проверьте получателя и версию согласования',400);}else if(JSON.stringify(previous)!==JSON.stringify(r)){if(r.page!==previous.page||r.reviewer!==previous.reviewer||r.requestedBy!==previous.requestedBy||r.pageUpdated!==previous.pageUpdated||r.project!==previous.project||r.created!==previous.created)throw fail('Нельзя менять данные существующего согласования',403);if(previous.decision!=='pending'||r.reviewer!==userId||!validMember(userId))throw fail('Решение принимает назначенный проверяющий',403);if(r.pageUpdated!==p.updated)throw fail('Материал изменился. Запросите новое согласование',409);if(r.decision==='changes'&&!r.comment.trim())throw fail('Опишите необходимые правки',400);}}
 for(const r of old.reviews||[])if(!s.reviews.some(x=>x.id===r.id)&&s.pages.some(p=>p.id===r.page))throw fail('История согласований сохраняется',400);
 for(const p of s.projects)if(p.stage==='done'&&(old.projects||[]).find(x=>x.id===p.id)?.stage!=='done'){const tasks=s.tasks.filter(t=>t.project===p.id),reviews=s.reviews.filter((r,i,a)=>r.project===p.id&&!a.slice(i+1).some(x=>x.page===r.page));if(tasks.some(t=>t.status!=='done')||reviews.some(r=>r.decision!=='approved'||r.pageUpdated!==s.pages.find(x=>x.id===r.page)?.updated))throw fail('Сначала закройте задачи и согласования проекта',400);}
}
