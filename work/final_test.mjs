import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const p = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
// Just RENDER page 3 directly from the current file
const d = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
const pix = d.loadPage(2).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false, true);
fs.writeFileSync(path.resolve('../final_p3.png'), pix.asPNG());
console.log('rendered. PDF size:', fs.statSync(p).size);
