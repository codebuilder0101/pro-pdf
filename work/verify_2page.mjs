// Verify the 2-page converted PDF:
//  1. Font audit — every font should show Subtype Type1
//  2. Render both pages and compare to original
//  3. Text extraction via pdf.js should be clean
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const newPdf = path.resolve('../asset/BANK-pages-1-2-Type1.pdf');
const origFull = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');

function audit(label, p, onlyFirstNPages) {
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
  const counts = {};
  for (const f of fonts) counts[f.subtype] = (counts[f.subtype] || 0) + 1;
  console.log('Total fonts:', fonts.length, 'by subtype:', counts);
  const nonType1 = fonts.filter(f => f.subtype !== 'Type1');
  console.log('Non-Type1 fonts:', nonType1.length);
  for (const f of nonType1) console.log(`  obj ${f.obj}: ${f.subtype} ${f.baseFont}`);
  return doc;
}

audit('ORIGINAL 8-page', origFull);
audit('REBUILT 2-page', newPdf);

// ----- Render -----
async function renderPage(p, pageIdx, outPng) {
  const d = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
  const page = d.loadPage(pageIdx);
  const pix = page.toPixmap(mupdf.Matrix.scale(1.2, 1.2), mupdf.ColorSpace.DeviceRGB, false, true);
  fs.writeFileSync(outPng, pix.asPNG());
  console.log('Wrote', outPng);
}
await renderPage(origFull, 0, path.resolve('../verify_orig_p1.png'));
await renderPage(origFull, 1, path.resolve('../verify_orig_p2.png'));
await renderPage(newPdf,   0, path.resolve('../verify_t1_p1.png'));
await renderPage(newPdf,   1, path.resolve('../verify_t1_p2.png'));

// ----- Text extraction -----
async function dumpText(label, p, pageIdx) {
  console.log(`\n=== TEXT ${label} page ${pageIdx+1} ===`);
  const pdf = await getDocument({ data: new Uint8Array(fs.readFileSync(p)), useSystemFonts: false }).promise;
  const page = await pdf.getPage(pageIdx + 1);
  const tc = await page.getTextContent();
  const sorted = tc.items
    .map(it => ({y: it.transform[5], x: it.transform[4], s: it.str}))
    .filter(z => z.s && z.s.trim())
    .sort((a,b) => b.y-a.y || a.x-b.x);
  for (const z of sorted.slice(0, 30)) console.log(`  y=${z.y.toFixed(1).padStart(6)} "${z.s}"`);
}
await dumpText('ORIG', origFull, 0);
await dumpText('NEW',  newPdf,   0);
