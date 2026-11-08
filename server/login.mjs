import {handlePresentationOffice} from './presentation-office.mjs';
import {z} from 'zod';
import {handleAPI,initialState} from './api.mjs';
const COOKIE='__Host-apollo_session',DAY=86400000,now=()=>Date.now(),iso=()=>new Date().toISOString();
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''),random=()=>hex(crypto.getRandomValues(new Uint8Array(32))),digest=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const json=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const loginValue=z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9][a-z0-9._@+-]+$/),passwordValue=z.string().min(12).max(128);
async function read(request){if(Number(request.headers.get('content-length')||0)>15000)throw fail('Слишком большой запрос');const raw=await request.text();if(raw.length>15000)throw fail('Слишком большой запрос');return request.headers.get('content-type')?.includes('application/json')?JSON.parse(raw):Object.fromEntries(new URLSearchParams(raw));}
export async function passwordHash(password,salt){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',iterations:100000,salt:new TextEncoder().encode(salt)},key,256)));}
function equal(a,b){let diff=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return diff===0;}
async function verify(password,account){return equal(await passwordHash(password,account?.salt||'apollo-dummy-password-salt'),account?.password_hash||'0'.repeat(64));}
function cookie(token,expire=false){return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${expire?0:7*86400}`;}
async function session(request,db){const token=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const row=await db.prepare('SELECT a.*,s.hash AS session_hash,s.expires FROM login_sessions s JOIN login_accounts a ON a.id=s.account_id WHERE s.hash=? AND s.expires>? AND a.disabled=0').bind(await digest(token),now()).first();return row||null;}
async function limit(db,key,max){const r=await db.prepare('SELECT * FROM login_limits WHERE key=?').bind(key).first();if(r&&r.reset_at>now()&&r.attempts>=max)throw fail('Слишком много попыток. Повторите вход через 15 минут.',429);await db.prepare('INSERT INTO login_limits(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END').bind(key,now()+15*60000,now(),now()).run();const after=await db.prepare('SELECT attempts FROM login_limits WHERE key=?').bind(key).first();if(after.attempts>max)throw fail('Слишком много попыток. Повторите вход через 15 минут.',429);}
async function issue(db,account){const token=random();await db.prepare('DELETE FROM login_sessions WHERE expires<=?').bind(now()).run();await db.prepare('INSERT INTO login_sessions(hash,account_id,expires,created) VALUES(?,?,?,?)').bind(await digest(token),account.id,now()+7*DAY,now()).run();return token;}
const identity=a=>({userId:a.id,displayName:a.name,email:a.email,operator:Boolean(a.is_operator)});
const clean=a=>({id:a.id,login:a.login,name:a.name,email:a.email,isOperator:Boolean(a.is_operator),mustChange:Boolean(a.must_change)});
async function owner(db,wid,account){const m=await db.prepare('SELECT * FROM members WHERE workspace_id=? AND user_id=?').bind(wid,account.id).first();if(m?.role!=='owner')throw fail('Управлять доступом может администратор компании',403);return m;}
function setupAllowed(native,env){return Boolean(native&&env.APOLLO_OWNER_EMAIL&&native.email.toLowerCase()===env.APOLLO_OWNER_EMAIL.toLowerCase());}
async function appendPerson(db,wid,a,job,department,responsibility){for(let attempt=0;attempt<5;attempt++){const row=await db.prepare('SELECT * FROM workspaces WHERE id=?').bind(wid).first();const state=JSON.parse(row.state);if(state.people.some(x=>x.id===a.id))return;state.people.push({id:a.id,name:a.name,email:a.email,role:job||'Сотрудник',team:department||'',responsibility:responsibility||'',color:'blue'});const changed=await db.prepare('UPDATE workspaces SET state=?,revision=revision+1,updated=? WHERE id=? AND revision=?').bind(JSON.stringify(state),iso(),wid,row.revision).run();if(changed.meta.changes)return;}throw fail('Обновите список сотрудников',409);}
export async function handleRequest(request,env,nativeUser){try{
 const url=new URL(request.url),path=url.pathname.replace(/^\/api\//,''),method=request.method;
 if(['presentation-office/download','presentation-office/callback'].includes(path))return handlePresentationOffice(request,env,null);
 if(path==='health')return handleAPI(request,env,null);
 if(!env.DB)return json({error:'База данных временно недоступна'},503);const db=env.DB;
 const formLogin=path==='auth/login'&&method==='POST'&&!request.headers.get('content-type')?.includes('application/json');
 if(!['GET','HEAD'].includes(method)){const origin=request.headers.get('origin'),gateway=env.APOLLO_GATEWAY_ORIGIN;if(origin&&origin!==url.origin&&!(formLogin&&gateway&&origin===gateway))throw fail('Запрос с другого сайта запрещён',403);}
 if(['auth/companies','auth/reset-company'].includes(path))return json({error:'Подключение других компаний недоступно'},403);
 const account=await session(request,db);
 if(path==='auth/status'&&method==='GET'){const setup=setupAllowed(nativeUser,env)&&!(await db.prepare('SELECT id FROM login_accounts WHERE is_operator=1 LIMIT 1').first());return json({authenticated:Boolean(account),account:account?clean(account):null,setupAvailable:setup,recoveryAvailable:setupAllowed(nativeUser,env)&&!setup});}
 if(path==='auth/setup'&&method==='POST'){
  if(!setupAllowed(nativeUser,env))throw fail('Первичная настройка доступна только владельцу Apollo',403);if(await db.prepare('SELECT id FROM login_accounts WHERE is_operator=1 LIMIT 1').first())throw fail('Учётная запись Apollo уже настроена',409);
  const d=await read(request),login=loginValue.parse(d.login),password=passwordValue.parse(d.password),salt=random(),id=nativeUser.userId;
  await db.prepare('INSERT INTO login_accounts(id,login,password_hash,salt,name,email,is_operator,disabled,must_change,created) VALUES(?,?,?,?,?,?,1,0,0,?)').bind(id,login,await passwordHash(password,salt),salt,nativeUser.displayName||'Администратор Apollo',nativeUser.email,iso()).run();
  if(!(await db.prepare('SELECT workspace_id FROM members WHERE user_id=? LIMIT 1').bind(id).first()))await handleAPI(new Request(url.origin+'/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Моя компания'})}),env,nativeUser);
  const a=await db.prepare('SELECT * FROM login_accounts WHERE id=?').bind(id).first();return json({ok:true,account:clean(a)},201,{'Set-Cookie':cookie(await issue(db,a))});
 }
 if(path==='auth/recover'&&method==='POST'){
  if(!setupAllowed(nativeUser,env))throw fail('Доступно только владельцу Apollo',403);const a=await db.prepare('SELECT * FROM login_accounts WHERE id=? AND is_operator=1').bind(nativeUser.userId).first();if(!a)throw fail('Основной аккаунт не найден',404);const d=await read(request);if(loginValue.parse(d.login)!==a.login)throw fail('Укажите логин основного аккаунта',400);const password=passwordValue.parse(d.password),salt=random();await db.batch([db.prepare('UPDATE login_accounts SET password_hash=?,salt=?,must_change=0 WHERE id=?').bind(await passwordHash(password,salt),salt,a.id),db.prepare('DELETE FROM login_sessions WHERE account_id=?').bind(a.id)]);return json({ok:true},200,{'Set-Cookie':cookie(await issue(db,a))});
 }
 if(path==='auth/login'&&method==='POST'){
  const d=await read(request),parsed=loginValue.safeParse(d.login),login=parsed.success?parsed.data:'invalid-login';const ip=request.headers.get('cf-connecting-ip')||'local';await db.prepare('DELETE FROM login_limits WHERE reset_at<=?').bind(now()).run();await limit(db,'ip:'+await digest(ip),35);await limit(db,'login:'+await digest(login),10);
  const a=await db.prepare('SELECT * FROM login_accounts WHERE login=?').bind(login).first(),pass=typeof d.password==='string'?d.password:'';const valid=pass.length<=128&&await verify(pass,a);
  if(!parsed.success||!a||a.disabled||!valid){if(formLogin)return new Response(null,{status:303,headers:{Location:url.origin+'/?login_error=1','Cache-Control':'no-store'}});throw fail('Неверный логин или пароль',401);}
  await db.prepare('DELETE FROM login_limits WHERE key=?').bind('login:'+await digest(login)).run();const token=await issue(db,a);if(formLogin)return new Response(null,{status:303,headers:{Location:url.origin+'/','Set-Cookie':cookie(token),'Cache-Control':'no-store'}});return json({ok:true,account:clean(a)},200,{'Set-Cookie':cookie(token)});
 }
 if(!account)throw fail('Введите логин и пароль, выданные вашей компании',401);
 if(path==='auth/logout'&&method==='POST'){await db.prepare('DELETE FROM login_sessions WHERE hash=?').bind(account.session_hash).run();return json({ok:true},200,{'Set-Cookie':cookie('',true)});}
 if(path==='auth/password'&&method==='PUT'){
  const d=await read(request),next=passwordValue.parse(d.password);if(!await verify(String(d.currentPassword||''),account))throw fail('Текущий пароль указан неверно',403);if(next===d.currentPassword)throw fail('Новый пароль должен отличаться от текущего');const salt=random();await db.batch([db.prepare('UPDATE login_accounts SET password_hash=?,salt=?,must_change=0 WHERE id=?').bind(await passwordHash(next,salt),salt,account.id),db.prepare('DELETE FROM login_sessions WHERE account_id=?').bind(account.id)]);return json({ok:true},200,{'Set-Cookie':cookie(await issue(db,account))});
 }
 if(account.must_change)throw fail('Сначала замените временный пароль',428);
 if(path==='auth/accounts'&&method==='GET'){const wid=url.searchParams.get('workspace');await owner(db,wid,account);const rows=(await db.prepare('SELECT a.id,a.login,a.name,a.email,a.must_change,m.role FROM login_accounts a JOIN members m ON m.user_id=a.id WHERE m.workspace_id=? AND a.disabled=0 ORDER BY m.joined').bind(wid).all()).results;return json({accounts:rows});}
 if(path==='auth/accounts'&&method==='POST'){
  const d=await read(request);await owner(db,d.workspaceId,account);
  const login=loginValue.parse(d.login),name=z.string().trim().min(1).max(100).parse(d.name),email=d.email?z.string().email().max(150).parse(d.email):'',role=z.enum(['editor','viewer']).parse(d.role),job=z.string().max(120).parse(d.job||'Сотрудник');
  if(await db.prepare('SELECT id FROM login_accounts WHERE login=?').bind(login).first())throw fail('Этот логин уже занят',409);
  const department=z.string().max(100).parse(d.department||''),responsibility=z.string().max(3000).parse(d.responsibility||'');
  const id=crypto.randomUUID(),password='Ap!'+random().slice(0,21),salt=random(),wid=d.workspaceId,queries=[db.prepare('INSERT INTO login_accounts(id,login,password_hash,salt,name,email,is_operator,disabled,must_change,created) VALUES(?,?,?,?,?,?,0,0,1,?)').bind(id,login,await passwordHash(password,salt),salt,name,email,iso())];

  queries.push(db.prepare('INSERT INTO members(workspace_id,user_id,name,email,role,joined) VALUES(?,?,?,?,?,?)').bind(wid,id,name,email,role,iso()));await db.batch(queries);await appendPerson(db,wid,{id,name,email},job,department,responsibility);return json({workspaceId:wid,id,login,password,name,url:url.origin},201);
 }
 if(path==='auth/reset'&&method==='POST'){
  const d=await read(request);await owner(db,d.workspaceId,account);const target=await db.prepare('SELECT a.*,m.role FROM login_accounts a JOIN members m ON m.user_id=a.id WHERE m.workspace_id=? AND a.id=?').bind(d.workspaceId,d.userId).first();if(!target||target.id===account.id||target.is_operator||target.role==='owner')throw fail('Этот пароль меняет сам владелец учётной записи',403);const password='Ap!'+random().slice(0,21),salt=random();await db.batch([db.prepare('UPDATE login_accounts SET password_hash=?,salt=?,must_change=1 WHERE id=?').bind(await passwordHash(password,salt),salt,target.id),db.prepare('DELETE FROM login_sessions WHERE account_id=?').bind(target.id)]);return json({login:target.login,password,name:target.name,url:url.origin});
 }
 if(path.startsWith('presentation-office/'))return handlePresentationOffice(request,env,identity(account));
 if(path.startsWith('auth/'))return json({error:'Неизвестный маршрут'},404);
 if(path==='register'||(path==='workspace'&&method==='POST')||path==='invitations'||path==='join')throw fail('Учётные записи выдаёт Apollo или администратор компании',403);
 if(path==='bootstrap'&&!(await db.prepare('SELECT workspace_id FROM members WHERE user_id=? LIMIT 1').bind(account.id).first()))throw fail('Доступ к компании отозван. Обратитесь к администратору',403);
 const result=await handleAPI(request,env,identity(account));
 if(result.ok&&(path==='bootstrap'||path==='session')){const data=await result.json();data.account=clean(account);return json(data,result.status);}
 return result;
 }catch(error){return json({error:error instanceof z.ZodError?'Проверьте поля: логин от 3 символов (латиница, цифры, точка, дефис); пароль от 12 символов.':error.status?error.message:'Не удалось выполнить запрос. Повторите попытку.'},error.status|| (error instanceof z.ZodError?400:500));}}
