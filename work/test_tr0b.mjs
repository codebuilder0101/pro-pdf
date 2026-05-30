import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as mupdf from 'mupdf';
const p = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const buf = fs.readFileSync(p);
const doc = mupdf.Document.openDocument(buf, 'application/pdf');
const pdfDoc = doc.asPDF();
const obj19 = pdfDoc.newIndirect(19, 0);
// Read current stream
const cur = obj19.readStream().asUint8Array();
let c = Buffer.from(cur).toString('latin1');
// It may be compressed — check
let decoded;
try { decoded = zlib.inflateSync(Buffer.from(cur)).toString('latin1'); } catch { decoded = c; }
const c2 = decoded.replace(/2\s+Tr/g, '0 Tr');
obj19.writeStream(mupdf.Buffer.from ? new mupdf.Buffer(c2) : c2);
const pix = doc.loadPage(2).toPixmap(mupdf.Matrix.scale(1.2,1.2), mupdf.ColorSpace.DeviceRGB, false, true);
fs.writeFileSync(path.resolve('../test_tr0.png'), pix.asPNG());
console.log('done; Tr count in stream:', (decoded.match(/Tr/g)||[]).length);
