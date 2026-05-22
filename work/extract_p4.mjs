import fs from 'fs';
import path from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function dump(label, p) {
  console.log('=== ' + label + ' ===');
  const pdf = await getDocument({ data: new Uint8Array(fs.readFileSync(p)), useSystemFonts: false }).promise;
  const page = await pdf.getPage(4);
  const tc = await page.getTextContent();
  const sorted = tc.items.map(it => ({ y: it.transform[5], x: it.transform[4], s: it.str })).filter(z=>z.s && z.s.trim()).sort((a,b)=>b.y-a.y || a.x-b.x);
  for (const z of sorted.slice(0, 40)) console.log(`  y=${z.y.toFixed(1)} x=${z.x.toFixed(1)} "${z.s}"`);
}
await dump('ORIGINAL', path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf'));
console.log('');
await dump('REBUILT', path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf'));
