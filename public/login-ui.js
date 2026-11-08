import {icon} from './icons.js';

// A quieter version of Apollo's home-page mesh, mounted only while signing in.
export function mountLoginUI(root){
 const events=new AbortController(),signal=events.signal;
 const password=root.querySelector('#login-password'),toggle=root.querySelector('#login-password-toggle');
 if(password&&toggle)toggle.addEventListener('click',()=>{
  const visible=password.type==='password';
  password.type=visible?'text':'password';
  toggle.setAttribute('aria-pressed',String(visible));
  toggle.setAttribute('aria-label',visible?'Скрыть пароль':'Показать пароль');
  toggle.title=visible?'Скрыть пароль':'Показать пароль';
  toggle.innerHTML=icon(visible?'eyeOff':'eye');
 },{signal});
 const canvas=root.querySelector('.login-mesh'),ctx=canvas?.getContext('2d');
 if(!ctx)return ()=>events.abort();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let width=0,height=0,frame=0,last=0,time=0,previous=0,disposed=false;
 function draw(){
  ctx.clearRect(0,0,width,height);
  const t=time,compact=width<600,rows=compact?21:29,columns=compact?30:44;
  const point=(u,v)=>[
   width*(.5+u*(.4+v*.35)),
   height*(.59+v*.62)+Math.sin(u*2.6+v*2.2+t*.12)*height*.075-Math.cos(u*1.8)*height*.04
  ];
  const gradient=ctx.createLinearGradient(0,0,width,height*.35);
  gradient.addColorStop(0,`rgba(179,234,160,${.18+.045*Math.sin(t*.28)})`);
  gradient.addColorStop(.48,`rgba(114,209,195,${.18+.04*Math.sin(t*.28+1.5)})`);
  gradient.addColorStop(1,`rgba(112,175,224,${.21+.035*Math.cos(t*.25)})`);
  ctx.strokeStyle=gradient;ctx.lineWidth=.7;
  for(let row=0;row<rows;row++){
   ctx.beginPath();
   for(let step=0;step<=60;step++){
    const [x,y]=point(-1.6+step/60*3.2,row/rows);
    step?ctx.lineTo(x,y):ctx.moveTo(x,y);
   }
   ctx.stroke();
  }
  for(let column=0;column<=columns;column++){
   ctx.beginPath();
   for(let step=0;step<=30;step++){
    const [x,y]=point(-1.6+column/columns*3.2,step/30);
    step?ctx.lineTo(x,y):ctx.moveTo(x,y);
   }
   ctx.stroke();
  }
 }
 function tick(now){
  frame=0;if(disposed||document.hidden||reduced.matches)return;
  if(!previous)previous=now;
  time+=Math.min(now-previous,80)/1000;previous=now;
  if(now-last>=1000/30){draw();last=now;}
  frame=requestAnimationFrame(tick);
 }
 function sync(){
  if(frame)cancelAnimationFrame(frame);frame=0;previous=0;
  draw();if(!disposed&&!document.hidden&&!reduced.matches)frame=requestAnimationFrame(tick);
 }
 function resize(){
  width=root.clientWidth;height=root.clientHeight;
  const ratio=Math.min(devicePixelRatio||1,1.5);
  canvas.width=Math.round(width*ratio);canvas.height=Math.round(height*ratio);
  ctx.setTransform(ratio,0,0,ratio,0,0);draw();
 }
 const observer=new ResizeObserver(resize);observer.observe(root);
 document.addEventListener('visibilitychange',sync,{signal});
 reduced.addEventListener('change',sync,{signal});
 resize();sync();
 return ()=>{disposed=true;events.abort();observer.disconnect();if(frame)cancelAnimationFrame(frame);};
}
