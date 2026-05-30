import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const NEW = path.resolve('../asset/bank document.pdf');
const ORIG = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');

console.log('FILE:', NEW);
console.log('Exists:', fs.existsSync(NEW), ' Size:', fs.statSync(NEW).size, 'bytes\n');

// 1. Font audit
const doc = mupdf.Document.openDocument(fs.readFileSync(NEW), 'application/pdf');
const pdfDoc = doc.asPDF();
const N = pdfDoc.countObjects();
let total=0, type1=0, bad=0, connCount=0;
const badList=[];
for (let i=1;i<N;i++){
  let o; try{o=pdfDoc.newIndirect(i,0).resolve();}catch{continue;}
  if(!o||!o.isDictionary())continue;
  if(o.get('Type')?.asName?.()!=='Font')continue;
  total++;
  const st=o.get('Subtype')?.asName?.();
  const bfName=o.get('BaseFont')?.asName?.()||'';
  if(st==='Type1'||st==='MMType1')type1++; else {bad++;badList.push(`obj${i} ${st} ${bfName}`);}
  if(/(^|\+)Connections$/.test(bfName))connCount++;
}
console.log('1) FONT TYPES');
console.log('   Total font objects :', total);
console.log('   Type1              :', type1);
console.log('   NON-Type1          :', bad, bad?('-> '+badList.join('; ')):'');
console.log('   "Connections" objects:', connCount, connCount===1?'(exactly ONE ✓)':'(SHOULD BE 1 ✗)');
console.log('   Pages              :', doc.countPages());

// 2. Render every page (proves no broken page)
console.log('\n2) RENDER ALL PAGES (mupdf)');
for(let i=0;i<doc.countPages();i++){
  const pix=doc.loadPage(i).toPixmap(mupdf.Matrix.scale(1,1),mupdf.ColorSpace.DeviceRGB,false,true);
  console.log(`   page ${i+1}: ${pix.getWidth()}x${pix.getHeight()} OK`);
}

// 3. Text extraction match vs original (all pages)
async function getText(p){
  const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(p)),useSystemFonts:false}).promise;
  const lines=[];
  for(let i=1;i<=pdf.numPages;i++){
    const pg=await pdf.getPage(i);
    const tc=await pg.getTextContent();
    tc.items.map(it=>({y:it.transform[5],x:it.transform[4],s:it.str})).filter(z=>z.s&&z.s.trim()).sort((a,b)=>b.y-a.y||a.x-b.x).forEach(z=>lines.push(`p${i} ${z.s}`));
  }
  return lines;
}
const o=await getText(ORIG), nw=await getText(NEW);
let diffs=0;
for(let i=0;i<Math.max(o.length,nw.length);i++) if(o[i]!==nw[i])diffs++;
console.log('\n3) TEXT EXTRACTION vs ORIGINAL');
console.log('   original lines:',o.length,' converted lines:',nw.length,' mismatches:',diffs, diffs===0?'(IDENTICAL ✓)':'(✗)');

console.log('\n=================================');
console.log(bad===0 && connCount===1 && diffs===0
  ? 'ALL CHECKS PASSED ✅  — file is correct and ready to send.'
  : 'SOME CHECK FAILED ✗');
