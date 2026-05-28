import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const p = path.resolve('../asset/BANK-p3-Type1.pdf');
const d = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
const pix = d.loadPage(0).toPixmap(mupdf.Matrix.scale(1.2, 1.2), mupdf.ColorSpace.DeviceRGB, false, true);
fs.writeFileSync(path.resolve('../check_p3_alone.png'), pix.asPNG());
