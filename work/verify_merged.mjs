import fs from 'fs'; import path from 'path';
import * as mupdf from 'mupdf';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const NEW=path.resolve('../asset/bank document.pdf');
const ORIG=path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
// render all pages new
const d=mupdf.Document.openDocument(fs.readFileSync(NEW),'application/pdf');
for(let i=0;i<d.countPages();i++){const pix=d.loadPage(i).toPixmap(mupdf.Matrix.scale(1.2,1.2),mupdf.ColorSpace.DeviceRGB,false,true);fs.writeFileSync(path.resolve(`../bankdoc_p${i+1}.png`),pix.asPNG());}
console.log('rendered',d.countPages(),'pages');
// text compare
async function gt(p){const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(p)),useSystemFonts:false}).promise;const L=[];for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const tc=await pg.getTextContent();tc.items.map(it=>({y:it.transform[5],x:it.transform[4],s:it.str})).filter(z=>z.s&&z.s.trim()).sort((a,b)=>b.y-a.y||a.x-b.x).forEach(z=>L.push('p'+i+' '+z.s));}return L;}
const o=await gt(ORIG),nw=await gt(NEW);
let diff=0;const samples=[];
for(let i=0;i<Math.max(o.length,nw.length);i++)if(o[i]!==nw[i]){diff++;if(samples.length<15)samples.push('  ORIG: '+(o[i]||'')+'\n  NEW : '+(nw[i]||''));}
console.log('orig lines:',o.length,'new lines:',nw.length,'mismatches:',diff);
if(diff)console.log(samples.join('\n'));
