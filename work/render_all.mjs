import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const newPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const oldPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
for (const [p, label] of [[newPdf, 'type1'], [oldPdf, 'original']]) {
  const d = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
  for (let i = 0; i < d.countPages(); i++) {
    const pix = d.loadPage(i).toPixmap(mupdf.Matrix.scale(1.2, 1.2), mupdf.ColorSpace.DeviceRGB, false, true);
    fs.writeFileSync(path.resolve(`../bank_${label}_p${i+1}.png`), pix.asPNG());
  }
}
console.log('done');
