import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const newPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const d = mupdf.Document.openDocument(fs.readFileSync(newPdf), 'application/pdf');
const page = d.loadPage(2);
const pix = page.toPixmap(mupdf.Matrix.scale(4, 4), mupdf.ColorSpace.DeviceRGB, false, true);
fs.writeFileSync(path.resolve('../zoom_top_p3.png'), pix.asPNG());
