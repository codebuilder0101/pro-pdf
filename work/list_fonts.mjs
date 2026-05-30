import fs from 'fs'; import path from 'path'; import * as mupdf from 'mupdf';
const p=path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
const doc=mupdf.Document.openDocument(fs.readFileSync(p),'application/pdf');
const pd=doc.asPDF();const N=pd.countObjects();
const rows=new Map();        // (name+encoding) -> count  (what Acrobat shows as lines)
const distinct=new Set();    // unique font name (the real fonts)
for(let i=1;i<N;i++){let o;try{o=pd.newIndirect(i,0).resolve();}catch{continue;}if(!o||!o.isDictionary())continue;if(o.get('Type')?.asName?.()!=='Font')continue;const sub=o.get('Subtype')?.asName?.();if(sub==='CIDFontType0'||sub==='CIDFontType2')continue;const bf=(o.get('BaseFont')?.asName?.()||'').replace(/^[A-Z]{6}\+/,'');const enc=o.get('Encoding');let e='built-in';if(enc){if(enc.isName())e=enc.asName();else if(enc.isDictionary())e='Custom';}
  let typ=sub; // Type0 means composite (TrueType CID here)
  rows.set(bf+'  ['+e+']  '+typ,(rows.get(bf+'  ['+e+']  '+typ)||0)+1);
  distinct.add(bf);}
console.log('=== ORIGINAL document: lines Acrobat shows in the Fonts panel ===');
[...rows.keys()].sort().forEach(k=>console.log('  '+k));
console.log('\nTotal lines (what you see) :',rows.size);
console.log('Actual DISTINCT fonts      :',distinct.size);
console.log('\n=== The distinct fonts really used ===');
[...distinct].sort().forEach(n=>console.log('  - '+n));
