// Extract text from each page of two PDFs and diff per page.
import fs from 'fs';
import {createRequire} from 'module';
const require = createRequire(import.meta.url);

async function extract(path) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(path));
  const doc = await pdfjs.getDocument({data, useSystemFonts: false, disableFontFace: true}).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const p = await doc.getPage(i);
    const tc = await p.getTextContent();
    pages.push(tc.items.map(it => it.str).join(''));
  }
  return pages;
}

const a = await extract('input_one_connections.pdf');
const b = await extract('bank_one_connections.pdf');
console.log('Pages A:', a.length, 'Pages B:', b.length);
let ok = 0, bad = 0;
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] === b[i]) { console.log(`page ${i+1}: IDENTICAL (${a[i].length} chars)`); ok++; }
  else {
    bad++;
    console.log(`page ${i+1}: DIFFER  Asize=${a[i]?.length} Bsize=${b[i]?.length}`);
    // show first difference
    const la = a[i] || '', lb = b[i] || '';
    let diffPos = 0;
    while (diffPos < Math.min(la.length, lb.length) && la[diffPos] === lb[diffPos]) diffPos++;
    console.log('  first diff @', diffPos);
    console.log('  A:', JSON.stringify(la.slice(Math.max(0,diffPos-20), diffPos+40)));
    console.log('  B:', JSON.stringify(lb.slice(Math.max(0,diffPos-20), diffPos+40)));
  }
}
console.log(`\nSummary: ${ok} identical, ${bad} different`);
