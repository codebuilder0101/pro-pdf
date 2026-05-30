import fs from 'fs'; import path from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
const NEW=path.resolve('../asset/bank document.pdf');const ORIG=path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
async function txt(p){const pdf=await getDocument({data:new Uint8Array(fs.readFileSync(p)),useSystemFonts:false}).promise;const per=[];for(let i=1;i<=pdf.numPages;i++){const pg=await pdf.getPage(i);const tc=await pg.getTextContent();per.push(tc.items.map(it=>it.str).join('').replace(/\s+/g,''));}return per;}
const o=await txt(ORIG),n=await txt(NEW);let allok=true;
for(let i=0;i<o.length;i++){const s=o[i]===n[i];if(!s)allok=false;console.log(`page ${i+1}: ${s?'IDENTICAL':'DIFFERENT'}`);}
console.log(allok?'\nTEXT 100% IDENTICAL ✓':'\nTEXT DIFFERS ✗');
