import fs from 'fs'; import path from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const NEW=path.resolve('../asset/bank document.pdf');
const ORIG=path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
async function txt(p){const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(p)),useSystemFonts:false}).promise;const per=[];for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const tc=await pg.getTextContent();const s=tc.items.map(it=>it.str).join('').replace(/\s+/g,'');per.push(s);}return per;}
const o=await txt(ORIG),n=await txt(NEW);
for(let i=0;i<o.length;i++){
  const same=o[i]===n[i];
  console.log(`page ${i+1}: ${same?'IDENTICAL ✓':'DIFFERENT ✗'} (orig ${o[i].length} chars, new ${n[i].length} chars)`);
  if(!same){
    // find first difference
    let k=0;while(k<Math.min(o[i].length,n[i].length)&&o[i][k]===n[i][k])k++;
    console.log('   first diff at char '+k+':\n   ORIG ...'+o[i].slice(Math.max(0,k-20),k+30)+'\n   NEW  ...'+n[i].slice(Math.max(0,k-20),k+30));
  }
}
