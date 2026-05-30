import fs from 'fs'; import path from 'path'; import * as mupdf from 'mupdf';
const d=mupdf.Document.openDocument(fs.readFileSync(path.resolve('../asset/bank document.pdf')),'application/pdf');
const pix=d.loadPage(0).toPixmap(mupdf.Matrix.scale(1.3,1.3),mupdf.ColorSpace.DeviceRGB,false,true);
fs.writeFileSync(path.resolve('../safe_p1.png'),pix.asPNG());
console.log('rendered safe page 1');
