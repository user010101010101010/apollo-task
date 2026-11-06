import {readFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const assets=['index.html','app.js','data.js','icons.js','styles.css','favicon.svg'];
for(const file of assets)await access(new URL(`../dist/${file}`,import.meta.url));
for(const file of ['app.js','data.js','icons.js'])execFileSync(process.execPath,['--check',new URL(`../dist/${file}`,import.meta.url).pathname],{stdio:'inherit'});
const html=await readFile(new URL('../dist/index.html',import.meta.url),'utf8');
if(!html.includes('lang="ru"')||!html.includes('Apollo Task'))throw new Error('Missing application metadata');
console.log('Apollo Task: static application verified. Deploy dist/.');
