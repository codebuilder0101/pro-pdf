import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const newPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const d = mupdf.Document.openDocument(fs.readFileSync(newPdf), 'application/pdf');
const pdfDoc = d.asPDF();
// Save and re-open
const out = pdfDoc.saveToBuffer('compress=yes,clean=yes,garbage=yes');
fs.writeFileSync(path.resolve('../bank_cleaned.pdf'), Buffer.from(out.asUint8Array()));
console.log('cleaned size:', Buffer.from(out.asUint8Array()).length);

// Re-render page 3
const d2 = mupdf.Document.openDocument(fs.readFileSync(path.resolve('../bank_cleaned.pdf')), 'application/pdf');
const pix = d2.loadPage(2).toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
fs.writeFileSync(path.resolve('../bank_cleaned_p3.png'), pix.asPNG());
console.log('done');
