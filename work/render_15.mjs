import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const p = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const d = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
const pix = d.loadPage(2).toPixmap(mupdf.Matrix.scale(1.5, 1.5), mupdf.ColorSpace.DeviceRGB, false, true);
fs.writeFileSync(path.resolve('../p3_at_1_5.png'), pix.asPNG());
