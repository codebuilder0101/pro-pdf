import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const newPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const oldPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
for (const [p, label] of [[newPdf, 'new'], [oldPdf, 'old']]) {
  const d = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
  const page = d.loadPage(2);
  const pix = page.toPixmap(mupdf.Matrix.scale(3, 3), mupdf.ColorSpace.DeviceRGB, false, true);
  fs.writeFileSync(path.resolve(`../zoom_${label}_p3.png`), pix.asPNG());
}
console.log('done');
