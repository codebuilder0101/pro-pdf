import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const newPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const d = mupdf.Document.openDocument(fs.readFileSync(newPdf), 'application/pdf');
const page = d.loadPage(2);  // 0-indexed = page 3
const pix = page.toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
fs.writeFileSync(path.resolve('../bank_type1_p3_v2.png'), pix.asPNG());
console.log('done');
