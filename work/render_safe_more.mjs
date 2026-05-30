import fs from 'fs'; import path from 'path'; import * as mupdf from 'mupdf';
const d=mupdf.Document.openDocument(fs.readFileSync(path.resolve('../asset/bank document.pdf')),'application/pdf');
for(const i of [2,3]){const pix=d.loadPage(i).toPixmap(mupdf.Matrix.scale(1.2,1.2),mupdf.ColorSpace.DeviceRGB,false,true);fs.writeFileSync(path.resolve(`../safe_p${i+1}.png`),pix.asPNG());}
console.log('done');
