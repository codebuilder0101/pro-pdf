import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const src = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
const dst = path.resolve('bank_all_clean.pdf');
const srcDoc = mupdf.Document.openDocument(fs.readFileSync(src), 'application/pdf');
const srcPdf = srcDoc.asPDF();
const newPdf = new mupdf.PDFDocument();
for (let i = 0; i < srcDoc.countPages(); i++) {
  newPdf.graftPage(i, srcPdf, i);
}
// Save with clean+decompress
const out = newPdf.saveToBuffer('decompress=yes,compress=no,clean=yes,garbage=yes');
fs.writeFileSync(dst, Buffer.from(out.asUint8Array()));
console.log('saved', dst);
