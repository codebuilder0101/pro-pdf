import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

const newPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const doc = mupdf.Document.openDocument(fs.readFileSync(newPdf), 'application/pdf');
const pdfDoc = doc.asPDF();
// Get obj 79
const f79 = pdfDoc.newIndirect(79, 0).resolve();
console.log('Obj 79 keys:', f79.keys?.());
const widths = f79.get('Widths');
if (widths && widths.isArray()) {
  console.log('Widths length:', widths.length);
  const arr = [];
  for (let i = 0; i < Math.min(30, widths.length); i++) arr.push(widths.get(i)?.asNumber?.());
  console.log('First 30 widths:', arr);
}

// Also try to use font metrics from mupdf
console.log('\n\nNow let\'s see if there is a /Widths key on the font');
const fontObj = pdfDoc.newIndirect(79, 0);
console.log('Is obj 79 a font?', fontObj.isFont?.());
