import {invoiceDocument,invoiceIssues,invoiceColumnWidths} from './invoice-model.js';

export async function invoicePDF(p,{regularBytes,boldBytes,logo}={}){
 if(invoiceIssues(p).length)throw Error('Заполните обязательные поля счёта');
 const [{PDFDocument,rgb},{default:fontkit}]=await Promise.all([import('./viewer-assets/pdf-lib.js'),import('./viewer-assets/fontkit.js')]);
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 async function fontBytes(name,bytes){if(bytes)return bytes;const r=await fetch(new URL(name,import.meta.url));if(!r.ok)throw Error('Не удалось загрузить шрифт PDF');return new Uint8Array(await r.arrayBuffer());}
 const regular=await doc.embedFont(await fontBytes('manrope-400.woff',regularBytes),{subset:true}),bold=await doc.embedFont(await fontBytes('manrope-600.woff',boldBytes),{subset:true});
 const d=invoiceDocument(p),W=595.28,H=841.89,M=34,CW=W-2*M,BOTTOM=48,ink=rgb(0,0,0);let page,y;
 doc.setTitle(d.heading);doc.setLanguage('ru-RU');doc.setCreator('Apollo Task');
 const clean=value=>String(value??'').replace(/[\u0000-\u0008\u000b-\u001f]/g,'').replaceAll('\t',' ');
 function wrap(value,width,font=regular,size=9){const lines=[];for(const para of clean(value).split('\n')){if(!para){lines.push('');continue;}let line='';for(const word of para.split(/\s+/)){if(font.widthOfTextAtSize(word,size)>width){if(line){lines.push(line);line='';}let part='';for(const char of Array.from(word)){if(part&&font.widthOfTextAtSize(part+char,size)>width){lines.push(part);part='';}part+=char;}line=part;}else if(line&&font.widthOfTextAtSize(line+' '+word,size)>width){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);}return lines;}
 function newPage(){page=doc.addPage([W,H]);y=H-M;}
 function ensure(height){if(y-height<BOTTOM)newPage();}
 function drawLines(lines,x,top,{font=regular,size=9,lh=size*1.4,width=CW,align='left'}={}){lines.forEach((line,i)=>{if(!line)return;const dx=align==='right'?width-font.widthOfTextAtSize(line,size):align==='center'?(width-font.widthOfTextAtSize(line,size))/2:0;page.drawText(line,{x:x+dx,y:top-size-i*lh,font,size,color:ink});});}
 function text(value,{size=9,font=regular,gap=8,x=M,width=CW}={}){const lines=wrap(value,width,font,size),lh=size*1.4;for(const line of lines){ensure(lh);drawLines([line],x,y,{font,size,lh,width});y-=lh;}y-=gap;}
 function rule(top,x=M,width=CW,weight=.65){page.drawLine({start:{x,y:top},end:{x:x+width,y:top},thickness:weight,color:ink});}
 function box(x,top,width,height){page.drawRectangle({x,y:top-height,width,height,borderWidth:.5,borderColor:ink});}
 newPage();
 // A standard payment-order block, with the optional logo in its own left column.
 const withLogo=!!(p.useLogo&&logo),logoSpace=withLogo?92:0,bx=M+logoSpace,bw=CW-logoSpace,left=bw*.54,right=bw-left,labelW=34,b=d.bank;
 const bankLines=wrap(b.name,left-10,regular,8.5),recipientLines=wrap(b.recipient,left-10,regular,8.5),bankH=Math.max(42,bankLines.length*11.5+19),idH=19,recipientH=Math.max(37,recipientLines.length*11.5+19),bankTop=y,bankHeight=bankH+idH+recipientH;
 box(bx,y,left,bankH);drawLines(bankLines,bx+5,y-4,{size:8.5,lh:11.5,width:left-10});drawLines(['Банк получателя'],bx+5,y-bankH+12,{size:7,lh:9});
 const bankCell=(label,value,top,height)=>{box(bx+left,top,labelW,height);box(bx+left+labelW,top,right-labelW,height);drawLines(wrap(label,labelW-8,regular,8),bx+left+4,top-4,{size:8,lh:10});drawLines(wrap(value,right-labelW-10,regular,8.5),bx+left+labelW+5,top-4,{size:8.5,lh:11});};
 bankCell('БИК',b.bik,y,21);bankCell('Сч. №',b.correspondent,y-21,bankH-21);
 const idY=y-bankH;if(b.kpp){const half=left*.55;box(bx,idY,half,idH);box(bx+half,idY,left-half,idH);drawLines(['ИНН '+b.inn],bx+5,idY-4,{size:8,width:half-10});drawLines(['КПП '+b.kpp],bx+half+5,idY-4,{size:8,width:left-half-10});}else{box(bx,idY,left,idH);drawLines(['ИНН '+b.inn],bx+5,idY-4,{size:8});}
 box(bx,idY-idH,left,recipientH);drawLines(recipientLines,bx+5,idY-idH-4,{size:8.5,lh:11.5,width:left-10});drawLines(['Получатель'],bx+5,idY-idH-recipientH+12,{size:7});bankCell('Сч. №',b.account,idY,idH+recipientH);
 if(withLogo){const image=await doc.embedPng(logo.bytes),scale=Math.min(78/image.width,70/image.height);page.drawImage(image,{x:M+(78-image.width*scale)/2,y:bankTop-(bankHeight+image.height*scale)/2,width:image.width*scale,height:image.height*scale});}
 y-=bankHeight+18;
 const heading=wrap(d.heading,CW,bold,15);ensure(heading.length*20+16);drawLines(heading,M,y,{font:bold,size:15,lh:20});y-=heading.length*20+10;rule(y);y-=12;
 for(const [label,value]of [[d.sellerRole,d.seller],[d.buyerRole,d.buyer],...(d.basis?[['Основание',d.basis]]:[])]){const labelLines=wrap(label+':',76,regular,9),valueLines=wrap(value,CW-88,bold,9),lh=12.6,height=Math.max(labelLines.length,valueLines.length)*lh;ensure(height+10);drawLines(labelLines,M,y,{size:9,lh,width:76});drawLines(valueLines,M+88,y,{font:bold,size:9,lh,width:CW-88});y-=height+10;}
 y-=3;
 const widths=invoiceColumnWidths(d,CW),size=8.2,lh=11.5,pad=4;
 function itemSegment(lines,start,count,header=false){const height=count*lh+pad*2;let x=M;for(let i=0;i<widths.length;i++){box(x,y,widths[i],height);drawLines(lines[i].slice(start,start+count),x+pad,y-pad,{font:header?bold:regular,size,lh,width:widths[i]-2*pad,align:header||i===0||i===3?'center':i>1?'right':'left'});x+=widths[i];}y-=height;}
 function itemHeader(){const lines=d.headers.map((v,i)=>wrap(v,widths[i]-2*pad,bold,size)),count=Math.max(...lines.map(l=>l.length));ensure(count*lh+2*pad);itemSegment(lines,0,count,true);}
 const initialHeaderHeight=Math.max(...d.headers.map((v,i)=>wrap(v,widths[i]-2*pad,bold,size).length))*lh+2*pad,firstRowHeight=Math.max(...d.rows[0].map((v,i)=>wrap(v,widths[i]-2*pad,regular,size).length))*lh+2*pad;
 ensure(initialHeaderHeight+Math.min(firstRowHeight,H-M-BOTTOM-initialHeaderHeight));
 itemHeader();
 for(const row of d.rows){const lines=row.map((v,i)=>wrap(v,widths[i]-2*pad,regular,size)),count=Math.max(...lines.map(l=>l.length)),height=count*lh+2*pad;if(height<=H-M-BOTTOM-50&&y-height<BOTTOM){newPage();itemHeader();}let start=0;while(start<count){let room=Math.floor((y-BOTTOM-2*pad)/lh);if(room<1){newPage();itemHeader();room=Math.floor((y-BOTTOM-2*pad)/lh);}const take=Math.min(count-start,room);itemSegment(lines,start,take);start+=take;if(start<count){newPage();itemHeader();}}}
 y-=10;
 const totalsHeight=d.totals.length*16,summaryHeight=wrap(d.count,CW,regular,9).length*12.6+wrap(d.words,CW,bold,9).length*12.6+16;ensure(totalsHeight+summaryHeight);
 for(const [i,[label,value]]of d.totals.entries()){const font=i===d.totals.length-1?bold:regular;drawLines([label+':'],M+CW*.40,y,{font,size:9,lh:16,width:CW*.38,align:'right'});drawLines([value],M+CW*.80,y,{font:bold,size:9,lh:16,width:CW*.20,align:'right'});y-=16;}
 y-=5;text(d.count,{size:9,gap:3});text(d.words,{font:bold,size:9,gap:12});
 if(d.deadline)text(d.deadline,{font:bold,size:9,gap:6});
 if(d.conditions)text(d.conditions,{size:8.5,gap:14});
 if(d.signers.length){const gap=28,sw=(CW-gap*(d.signers.length-1))/d.signers.length,parts=d.signers.map(([role,name])=>({role:wrap(role,sw,bold,9),name:wrap(name,sw,regular,9)})),roleH=Math.max(...parts.map(v=>v.role.length))*12.6,nameH=Math.max(...parts.map(v=>v.name.length))*12.6,height=roleH+nameH+39;ensure(height);rule(y);y-=15;const top=y;parts.forEach((part,i)=>{const x=M+i*(sw+gap);drawLines(part.role,x,top,{font:bold,size:9,lh:12.6,width:sw});const nameTop=top-roleH-9;drawLines(part.name,x,nameTop,{size:9,lh:12.6,width:sw,align:'right'});const lineY=nameTop-nameH-3;rule(lineY,x,sw,.5);drawLines(['Подпись / расшифровка подписи'],x,lineY-4,{size:6.5,lh:9,width:sw});});y-=height;}
 const pages=doc.getPages();pages.forEach((pg,i)=>{if(pages.length<2)return;const label=`Страница ${i+1} из ${pages.length}`;pg.drawText(label,{x:W-M-regular.widthOfTextAtSize(label,7),y:24,size:7,font:regular,color:ink});});
 return doc.save();
}
