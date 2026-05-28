import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';
const p = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const d = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
const pageIdx = parseInt(process.argv[2] || '2');
const pix = d.loadPage(pageIdx).toPixmap(mupdf.Matrix.scale(1.2, 1.2), mupdf.ColorSpace.DeviceRGB, false, true);
fs.writeFileSync(path.resolve(`../check_p${pageIdx+1}.png`), pix.asPNG());
console.log('rendered page', pageIdx+1);
