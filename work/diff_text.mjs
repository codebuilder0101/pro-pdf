// Compare pdf.js text extraction between original and rebuilt for all pages
import fs from 'fs';
import path from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function getText(p) {
  const pdf = await getDocument({ data: new Uint8Array(fs.readFileSync(p)), useSystemFonts: false }).promise;
  const lines = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const items = tc.items.map(it => ({y: it.transform[5], x: it.transform[4], s: it.str})).filter(z=>z.s && z.s.trim()).sort((a,b)=>b.y-a.y || a.x-b.x);
    for (const z of items) lines.push(`p${i} y=${z.y.toFixed(1)} "${z.s}"`);
  }
  return lines;
}
const orig = await getText(path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf'));
const newL = await getText(path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf'));
console.log('orig lines:', orig.length, 'new lines:', newL.length);
let diffs = 0;
for (let i = 0; i < Math.min(orig.length, newL.length); i++) {
  if (orig[i] !== newL[i]) {
    diffs++;
    if (diffs < 30) console.log('  ORIG:', orig[i], '\n  NEW :', newL[i]);
  }
}
console.log('Total mismatches:', diffs);
