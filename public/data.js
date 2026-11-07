export const STORAGE_KEY = 'apollo-task.v1';
export let ME = 'pending-user';
export function setCurrentUser(id){ME=id;}
export function escapeHTML(value) { return String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function uid(prefix='id') { return `${prefix}-${globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2)}`; }
export function localDay(offset=0) {const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
export function dueLabel(value) {if(!value)return 'Без срока';if(value===localDay())return 'Сегодня';if(value===localDay(1))return 'Завтра';return new Date(value+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'short'});}
export function isOverdue(task) {return Boolean(task.due && task.due<localDay() && task.status!=='done');}
export function transitionTask(tasks,id,status) {if(!['todo','progress','done'].includes(status))throw new Error('Unknown task status');return tasks.map(t=>t.id===id?{...t,status}:t);}
export function searchRecords(state,query) {const q=query.toLocaleLowerCase('ru').trim();if(!q)return [];const plain=s=>String(s).replace(/<[^>]*>/g,' ');return [
  ...state.pages.filter(p=>`${p.title} ${plain(p.content)} ${p.excerpt} ${p.documentCode||''} ${(p.tags||[]).join(' ')} ${p.documentType||''}`.toLocaleLowerCase('ru').includes(q)).map(p=>({kind:'page',id:p.id,title:p.title,subtitle:state.spaces.find(s=>s.id===p.space)?.name||'База знаний',icon:p.icon})),
  ...state.tasks.filter(t=>t.title.toLocaleLowerCase('ru').includes(q)).map(t=>({kind:'task',id:t.id,title:t.title,subtitle:'Задача',icon:'task'})),
  ...state.people.filter(p=>`${p.name} ${p.role} ${p.responsibility}`.toLocaleLowerCase('ru').includes(q)).map(p=>({kind:'person',id:p.id,title:p.name,subtitle:p.role,icon:'users'}))
];}
export function validateState(s) {
  if(!s||s.version!==1||!['pages','spaces','people','tasks','activity'].every(k=>Array.isArray(s[k])))throw new Error('Неподдерживаемый формат данных');
  if(s.pages.length>2000||s.tasks.length>5000||s.people.length>1000||s.spaces.length>200)throw new Error('Слишком большой файл');
  const ids=new Set();for(const space of s.spaces){if(typeof space.id!=='string'||typeof space.name!=='string'||!['blue','purple','green','orange'].includes(space.color))throw new Error('Некорректное пространство');if(ids.has(space.id))throw new Error('Повторяющиеся пространства');ids.add(space.id);}
  const peopleIds=new Set();for(const p of s.people){if(typeof p.id!=='string'||typeof p.name!=='string'||typeof p.role!=='string'||typeof p.responsibility!=='string'||!['blue','purple','green','orange','pink'].includes(p.color)||peopleIds.has(p.id))throw new Error('Некорректный сотрудник');peopleIds.add(p.id);}
  if(!peopleIds.has(ME))throw new Error('В данных отсутствует текущий пользователь');
  const pageIds=new Set();for(const p of s.pages){if(typeof p.id!=='string'||typeof p.title!=='string'||typeof p.content!=='string'||!ids.has(p.space)||!peopleIds.has(p.owner)||!Array.isArray(p.comments)||!Array.isArray(p.versions)||pageIds.has(p.id))throw new Error('Некорректная страница');pageIds.add(p.id);for(const c of p.comments){if(typeof c.text!=='string'||!peopleIds.has(c.author)||typeof c.at!=='string')throw new Error('Некорректный комментарий');}for(const v of p.versions){if(typeof v.content!=='string'||typeof v.title!=='string'||typeof v.at!=='string')throw new Error('Некорректная версия');}}
  const taskIds=new Set();for(const t of s.tasks){if(typeof t.id!=='string'||typeof t.title!=='string'||!['todo','progress','done'].includes(t.status)||!peopleIds.has(t.assignee)||!ids.has(t.space)||(t.page&&!pageIds.has(t.page))||!['low','normal','high'].includes(t.priority)||!/^$|^\d{4}-\d{2}-\d{2}$/.test(t.due)||taskIds.has(t.id))throw new Error('Некорректная задача');taskIds.add(t.id);}
  if(s.activity.some(a=>typeof a.text!=='string'||typeof a.at!=='string'||!peopleIds.has(a.person)))throw new Error('Некорректное событие');
  return s;
}
export function seed(){return {version:1,workspace:'',spaces:[],people:[],pages:[],tasks:[],activity:[],boards:[],databases:[],folders:[],links:[],projects:[],reviews:[],favorites:[],dismissedWelcome:true,notificationsRead:true};}
export const templates=[
  {id:'blank',title:'Пустая страница',description:'Начните с чистого листа',icon:'file',color:'blue',content:'<p>Добавьте контекст, основные детали и следующий шаг.</p>'},
  {id:'project',title:'План проекта',description:'Цели, команда и этапы работы',icon:'rocket',color:'purple',content:'<p class="lead">Коротко опишите проект и пользу, которую он принесёт.</p><h2>Цель проекта</h2><p>Какой результат хотим получить и как поймём, что цель достигнута?</p><h2>Команда и ответственность</h2><p>Кто координирует работу, выполняет задачи и принимает результат?</p><h2>Этапы</h2><ol><li>Подготовка</li><li>Реализация</li><li>Проверка и запуск</li></ol><h2>Договорённости</h2><p>Зафиксируйте ограничения и принятые решения.</p>'},
  {id:'meeting',title:'Заметки встречи',description:'Повестка, решения и следующие шаги',icon:'message',color:'green',content:'<h2>Участники</h2><p>Кто участвовал во встрече?</p><h2>Что обсудили</h2><ul><li>Первый вопрос</li></ul><h2>Принятые решения</h2><p>О чём договорились и почему?</p><h2>Следующие шаги</h2><p>Укажите действия, ответственных и сроки.</p>'},
  {id:'process',title:'Рабочая инструкция',description:'Понятный порядок действий',icon:'task',color:'orange',content:'<p class="lead">Когда и кому нужна эта инструкция?</p><h2>Перед началом</h2><p>Необходимые доступы, материалы и условия.</p><h2>Порядок действий</h2><ol><li>Первый шаг</li><li>Второй шаг</li><li>Проверка результата</li></ol><h2>Кто поможет</h2><p>К кому обращаться с вопросами и кто обновляет инструкцию?</p>'},
  {id:'onboarding',title:'Первый день в команде',description:'Помогите новичку освоиться',icon:'users',color:'blue',content:'<p class="lead">Добро пожаловать! Здесь твой маршрут знакомства с командой.</p><h2>Знакомство</h2><ul><li>Познакомиться с руководителем и коллегами</li><li>Прочитать о компании</li></ul><h2>Рабочие инструменты</h2><p>Какие доступы нужно получить и у кого?</p><h2>Первая задача</h2><p>Какой результат ждём и кто поможет?</p>'},
  {id:'idea',title:'Предложение и идея',description:'Проблема, решение и ожидаемая польза',icon:'spark',color:'purple',content:'<h2>Какую проблему решаем</h2><p>Опишите конкретную ситуацию и кого она затрагивает.</p><h2>Что предлагаем</h2><p>Как может работать решение?</p><h2>Ожидаемая польза</h2><p>Что изменится и как это проверить?</p><h2>Решение по предложению</h2><p>Кто рассмотрит идею и когда вернётся с ответом?</p>'}
];
