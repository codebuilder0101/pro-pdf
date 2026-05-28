import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const p = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const d = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
for (const sc of [1.0, 1.2, 1.5, 2.0, 2.5]) {
  const pix = d.loadPage(2).toPixmap(mupdf.Matrix.scale(sc, sc), mupdf.ColorSpace.DeviceRGB, false, true);
  fs.writeFileSync(path.resolve(`../p3_sc${sc}.png`), pix.asPNG());
}
