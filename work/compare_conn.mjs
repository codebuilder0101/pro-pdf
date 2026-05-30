import fs from 'fs'; import path from 'path'; import * as mupdf from 'mupdf';
function entries(f){
  const doc=mupdf.Document.openDocument(fs.readFileSync(path.resolve(f)),'application/pdf');
  const pd=doc.asPDF();const N=pd.countObjects();const lines=new Map();
  for(let i=1;i<N;i++){let o;try{o=pd.newIndirect(i,0).resolve();}catch{continue;}if(!o||!o.isDictionary())continue;if(o.get('Type')?.asName?.()!=='Font')continue;const sub=o.get('Subtype')?.asName?.();if(sub==='CIDFontType0'||sub==='CIDFontType2')continue;const bf=(o.get('BaseFont')?.asName?.()||'').replace(/^[A-Z]{6}\+/,'');const enc=o.get('Encoding');let e='built-in';if(enc){if(enc.isName())e=enc.asName();else if(enc.isDictionary())e='Custom';}const k=bf+'  ['+e+']  '+sub;lines.set(k,(lines.get(k)||0)+1);}
  return [...lines.keys()].sort();
}
const orig=entries('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
const conv=entries('../asset/bank document.pdf');
console.log('===  ORIGINAL  (what the client says had only one Connections)  ===');
let oc=0,oct=0; orig.forEach(k=>{const isC=/^Connections/.test(k);if(isC){oct++;}console.log((isC?' >> ':'    ')+k);oc++;});
console.log(`Lines starting with "Connections": ${oct} of ${oc} total\n`);
console.log('===  CONVERTED  (bank document.pdf)  ===');
let nc=0,nct=0; conv.forEach(k=>{const isC=/^Connections/.test(k);if(isC){nct++;}console.log((isC?' >> ':'    ')+k);nc++;});
console.log(`Lines starting with "Connections": ${nct} of ${nc} total`);
console.log('\nDifference original -> converted (only the TrueType line changed):');
for(const k of orig)if(!conv.includes(k))console.log('  REMOVED: '+k);
for(const k of conv)if(!orig.includes(k))console.log('  ADDED  : '+k);
