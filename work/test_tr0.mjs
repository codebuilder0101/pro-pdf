// Take the converted PDF, force all text render mode to 0 (fill only) on page 3, render.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as mupdf from 'mupdf';

const p = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const text = fs.readFileSync(p, 'latin1');
const buf = fs.readFileSync(p);

// Extract obj 19 (page 3 content)
const idx = text.indexOf('\n19 0 obj');
const start = idx + 1 + '19 0 obj'.length;
const sIdx = text.indexOf('stream', start);
const dict = text.slice(start, sIdx);
const lm = dict.match(/\/Length\s+(\d+)/);
let s = sIdx + 'stream'.length;
if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
const data = buf.slice(s, s + parseInt(lm[1]));
let c = zlib.inflateSync(data).toString('latin1');

// Count Tr operators
const trOps = [...c.matchAll(/(\d+)\s+Tr/g)];
console.log('Tr operators:', trOps.map(m=>m[1]));
const tzOps = [...c.matchAll(/([\d.]+)\s+Tz/g)];
console.log('Tz operators:', tzOps.map(m=>m[1]));
const tcOps = [...c.matchAll(/([\-\d.]+)\s+Tc/g)];
console.log('Tc operators:', tcOps.map(m=>m[1]));
// Count cm operators with scaling
const cmOps = [...c.matchAll(/([\-\d.]+)\s+0\s+0\s+([\-\d.]+)\s+[\-\d.]+\s+[\-\d.]+\s+cm/g)];
console.log('cm scale operators (first 10):', cmOps.slice(0,10).map(m=>`${m[1]}x${m[2]}`));

// Force "2 Tr" -> "0 Tr", re-deflate, splice into a copy of the PDF, render
const c2 = c.replace(/2\s+Tr/g, '0 Tr');
const newComp = zlib.deflateSync(Buffer.from(c2, 'latin1'));
// Rebuild obj 19 with new stream — simple byte splice
const before = buf.slice(0, s);
const after = buf.slice(s + parseInt(lm[1]));
// Need to update /Length in dict. Easier: write to a temp and re-render via mupdf clean
// Instead, just write a modified content and use mupdf to render by replacing object.
import('mupdf').then(async (mupdf) => {
  const doc = mupdf.Document.openDocument(buf, 'application/pdf');
  const pdfDoc = doc.asPDF();
  // Replace obj 19 stream
  const obj19 = pdfDoc.newIndirect(19, 0);
  const resolved = obj19.resolve();
  resolved.writeStream(mupdf.Buffer.fromString ? mupdf.Buffer.fromString(c2) : c2);
  // mupdf may need raw write — try writeRawStream
  const pix = doc.loadPage(2).toPixmap(mupdf.Matrix.scale(1.2,1.2), mupdf.ColorSpace.DeviceRGB, false, true);
  fs.writeFileSync(path.resolve('../test_tr0.png'), pix.asPNG());
  console.log('rendered test_tr0.png');
});
