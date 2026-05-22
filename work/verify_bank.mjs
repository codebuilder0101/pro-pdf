// Verify the converted bank PDF
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const newPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const oldPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');

function audit(label, p) {
  console.log(`\n=== ${label}: ${p} ===`);
  const data = fs.readFileSync(p);
  console.log('Size:', data.length);
  const doc = mupdf.Document.openDocument(data, 'application/pdf');
  const pdfDoc = doc.asPDF();
  const N = pdfDoc.countObjects();
  const fonts = [];
  for (let i = 1; i < N; i++) {
    let obj;
    try { obj = pdfDoc.newIndirect(i, 0).resolve(); } catch { continue; }
    if (!obj || !obj.isDictionary()) continue;
    const type = obj.get('Type')?.asName?.();
    if (type !== 'Font') continue;
    const subtype = obj.get('Subtype')?.asName?.();
    const baseFont = obj.get('BaseFont')?.asName?.();
    fonts.push({ obj: i, subtype, baseFont });
  }
  // group by subtype
  const counts = {};
  for (const f of fonts) {
    counts[f.subtype] = (counts[f.subtype] || 0) + 1;
  }
  console.log('Total fonts:', fonts.length);
  console.log('By subtype:', counts);
  // list any non-Type1
  const nonType1 = fonts.filter(f => f.subtype !== 'Type1');
  console.log('Non-Type1 fonts:', nonType1.length);
  for (const f of nonType1) console.log(`  obj ${f.obj}: ${f.subtype} ${f.baseFont}`);
  console.log('Pages:', doc.countPages());
}

audit('ORIGINAL', oldPdf);
audit('REBUILT',  newPdf);

// Render both
async function renderPage(p, pageIdx, outPng) {
  const doc = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
  const page = doc.loadPage(pageIdx);
  const pix = page.toPixmap(mupdf.Matrix.scale(1.2, 1.2), mupdf.ColorSpace.DeviceRGB, false, true);
  fs.writeFileSync(outPng, pix.asPNG());
  console.log('Wrote', outPng);
}

await renderPage(oldPdf, 0, path.resolve('../bank_original_p1.png'));
await renderPage(newPdf, 0, path.resolve('../bank_type1_p1.png'));
await renderPage(oldPdf, 1, path.resolve('../bank_original_p2.png'));
await renderPage(newPdf, 1, path.resolve('../bank_type1_p2.png'));

// Quick text extraction check on page 1
const pdf = await getDocument({ data: new Uint8Array(fs.readFileSync(newPdf)), useSystemFonts: false }).promise;
console.log('\npdf.js opened rebuilt PDF, pages =', pdf.numPages);
const p = await pdf.getPage(1);
const tc = await p.getTextContent();
console.log('Page 1 text items:', tc.items.length);
const items = tc.items.map(i => i.str).filter(s => s && s.trim());
console.log('First 20 items:');
for (const s of items.slice(0, 20)) console.log('  "' + s + '"');
