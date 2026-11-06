'use client';
import {useEffect} from 'react';
export default function WorkspaceShell(){useEffect(()=>{const script=document.createElement('script');script.type='module';script.src='/app.js';document.body.append(script);return()=>script.remove();},[]);return <><a className="skip-link" href="#main">Перейти к содержимому</a><div id="app"><div className="boot-screen"><img src="/apollo-symbol.svg" width="56" alt="Apollo"/><h1>Apollo Task</h1><p>Открываем ваше рабочее пространство…</p></div></div><div id="overlay-root"/><div id="toast-root" role="status" aria-live="polite"/></>}
