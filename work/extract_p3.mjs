import fs from 'fs';
import path from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function dump(label, p) {
  console.log(`=== ${label} ===`);
  const pdf = await getDocument({ data: new Uint8Array(fs.readFileSync(p)), useSystemFonts: false }).promise;
  const page = await pdf.getPage(3);
  const tc = await page.getTextContent();
  const items = tc.items.map(i => i.str).filter(s => s && s.trim());
  for (const s of items.slice(0, 25)) console.log('  "' + s + '"');
}
await dump('ORIGINAL', path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf'));
await dump('REBUILT', path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf'));
