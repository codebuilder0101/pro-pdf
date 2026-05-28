import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const p = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const d = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
const pdfDoc = d.asPDF();
const out = pdfDoc.saveToBuffer('clean=yes,garbage=yes,compress=yes');
const buf = Buffer.from(out.asUint8Array());
fs.writeFileSync(p, buf);
console.log('clean-saved', buf.length);

const d2 = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
const pix = d2.loadPage(2).toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
fs.writeFileSync(path.resolve('../check_p3_cleaned.png'), pix.asPNG());
