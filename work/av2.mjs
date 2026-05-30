import fs from 'fs'; import path from 'path'; import * as mupdf from 'mupdf';
const doc=mupdf.Document.openDocument(fs.readFileSync(path.resolve('../asset/bank document.pdf')),'application/pdf');
const pd=doc.asPDF();const N=pd.countObjects();const seen=new Map();let total=0,t1=0,bad=0;
for(let i=1;i<N;i++){let o;try{o=pd.newIndirect(i,0).resolve();}catch{continue;}if(!o||!o.isDictionary())continue;if(o.get('Type')?.asName?.()!=='Font')continue;const sub=o.get('Subtype')?.asName?.();if(sub==='CIDFontType0'||sub==='CIDFontType2')continue;total++;if(sub==='Type1')t1++;else bad++;const bf=(o.get('BaseFont')?.asName?.()||'').replace(/^[A-Z]{6}\+/,'');const enc=o.get('Encoding');let e='built-in';if(enc){if(enc.isName())e=enc.asName();else if(enc.isDictionary())e='Custom';}const k=bf+' ['+e+'] '+sub;seen.set(k,(seen.get(k)||0)+1);}
console.log('Distinct font rows Acrobat will show:',seen.size);
[...seen.keys()].sort().forEach(k=>console.log('  '+(seen.get(k))+'x  '+k));
console.log('\nSimple-font dicts:',total,' Type1:',t1,' non-Type1:',bad);
