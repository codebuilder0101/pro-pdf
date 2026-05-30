import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const src = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const doc = mupdf.Document.openDocument(fs.readFileSync(src), 'application/pdf');
const pdfDoc = doc.asPDF();
const out = pdfDoc.saveToBuffer('garbage=deduplicate,clean=yes,compress=yes');
const dst = path.resolve('../asset/bank document.pdf');
fs.writeFileSync(dst, Buffer.from(out.asUint8Array()));
console.log('wrote', dst, fs.statSync(dst).size, 'bytes');

// Count Acrobat-style rows
const d2 = mupdf.Document.openDocument(fs.readFileSync(dst), 'application/pdf');
const pd = d2.asPDF();
const N = pd.countObjects();
const rows = new Map();
for (let i=1;i<N;i++){
  let o; try{o=pd.newIndirect(i,0).resolve();}catch{continue;}
  if(!o||!o.isDictionary())continue;
  if(o.get('Type')?.asName?.()!=='Font')continue;
  const sub=o.get('Subtype')?.asName?.();
  if(sub==='CIDFontType0'||sub==='CIDFontType2')continue;
  const bf=(o.get('BaseFont')?.asName?.()||'').replace(/^[A-Z]{6}\+/,'');
  const enc=o.get('Encoding');
  let e='built-in'; if(enc){if(enc.isName())e=enc.asName();else if(enc.isDictionary())e='Custom';}
  let fd=o.get('FontDescriptor'); if(fd){try{fd=fd.resolve();}catch{}}
  let prog='-'; if(fd&&fd.isDictionary()){const ff=fd.get('FontFile3');if(ff&&ff.isIndirect&&ff.isIndirect())prog=ff.asIndirect();}
  rows.set(`${bf} [${e}] prog=${prog}`, (rows.get(`${bf} [${e}] prog=${prog}`)||0)+1);
}
console.log('Distinct (name,encoding,program) rows Acrobat would show:', rows.size);
[...rows.keys()].sort().forEach(k=>console.log('  '+k));
