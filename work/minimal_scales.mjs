import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const d = mupdf.Document.openDocument(fs.readFileSync('minimal.pdf'), 'application/pdf');
for (const sc of [1.0, 1.2, 1.5]) {
  const pix = d.loadPage(0).toPixmap(mupdf.Matrix.scale(sc, sc), mupdf.ColorSpace.DeviceRGB, false, true);
  fs.writeFileSync(path.resolve(`../minimal_sc${sc}.png`), pix.asPNG());
}
console.log('done');
