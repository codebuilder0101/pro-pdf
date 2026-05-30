import fs from 'fs'; import path from 'path'; import * as mupdf from 'mupdf';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const NEW=path.resolve('../asset/bank document.pdf');
const ORIG=path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
console.log('FILE: bank document.pdf  size:', fs.statSync(NEW).size, 'bytes\n');
const doc=mupdf.Document.openDocument(fs.readFileSync(NEW),'application/pdf');
const pd=doc.asPDF();const N=pd.countObjects();
const groups=new Map();let t1=0,bad=0;
for(let i=1;i<N;i++){let o;try{o=pd.newIndirect(i,0).resolve();}catch{continue;}if(!o||!o.isDictionary())continue;if(o.get('Type')?.asName?.()!=='Font')continue;const sub=o.get('Subtype')?.asName?.();if(sub==='CIDFontType0'||sub==='CIDFontType2')continue;if(sub==='Type1')t1++;else bad++;const bf=(o.get('BaseFont')?.asName?.()||'').replace(/^[A-Z]{6}\+/,'');const enc=o.get('Encoding');let e='built-in';if(enc){if(enc.isName())e=enc.asName();else if(enc.isDictionary())e='Custom';}groups.set(bf+' ['+e+']',(groups.get(bf+' ['+e+']')||0)+1);}
console.log('1) FONTS ACROBAT WILL LIST (one row each):');
[...groups.keys()].sort().forEach(k=>console.log('   - '+k+'  Type1'));
console.log('   Distinct rows:',groups.size,'| non-Type1:',bad);
const conn=[...groups.keys()].filter(k=>/^Connections \[/.test(k));
console.log('   "Connections" rows:',conn.length, conn.length===1?'(ONE ✓)':'(✗)');
console.log('\n2) RENDER:');
for(let i=0;i<doc.countPages();i++){const px=doc.loadPage(i).toPixmap(mupdf.Matrix.scale(1,1),mupdf.ColorSpace.DeviceRGB,false,true);process.stdout.write(' p'+(i+1)+':OK');}
console.log('');
async function txt(p){const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(p)),useSystemFonts:false}).promise;const a=[];for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const tc=await pg.getTextContent();a.push(tc.items.map(it=>it.str).join('').replace(/\s+/g,''));}return a;}
const o=await txt(ORIG),n=await txt(NEW);let ok=true;for(let i=0;i<o.length;i++)if(o[i]!==n[i])ok=false;
console.log('\n3) TEXT vs ORIGINAL:', ok?'100% IDENTICAL ✓':'DIFFERENT ✗');
console.log('\n'+(groups.size>0&&bad===0&&conn.length===1&&ok?'ALL GOOD ✅':'CHECK ✗'));
