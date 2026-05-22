import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const newPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const oldPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
async function rp(p, idx, png) {
  const d = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
  const page = d.loadPage(idx);
  const pix = page.toPixmap(mupdf.Matrix.scale(1.2, 1.2), mupdf.ColorSpace.DeviceRGB, false, true);
  fs.writeFileSync(png, pix.asPNG());
}
for (let i = 2; i < 6; i++) {
  await rp(oldPdf, i, path.resolve(`../bank_original_p${i+1}.png`));
  await rp(newPdf, i, path.resolve(`../bank_type1_p${i+1}.png`));
}
console.log('done');
