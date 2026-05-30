import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as mupdf from 'mupdf';

const p = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const buf = fs.readFileSync(p);
const doc0 = mupdf.Document.openDocument(buf, 'application/pdf');
const pdfDoc0 = doc0.asPDF();
const obj19 = pdfDoc0.newIndirect(19, 0);
const cur = Buffer.from(obj19.readStream().asUint8Array());
let content;
try { content = zlib.inflateSync(cur).toString('latin1'); } catch { content = cur.toString('latin1'); }

// Split into ET-delimited segments
const segs = content.split(/(?<=ET)/);
console.log('Total ET segments:', segs.length);

// Render with first K segments only, for K = 25%, 50%, 75%, 100%
for (const frac of [0.25, 0.5, 0.75, 1.0]) {
  const k = Math.floor(segs.length * frac);
  const truncated = segs.slice(0, k).join('');
  const doc = mupdf.Document.openDocument(buf, 'application/pdf');
  const pd = doc.asPDF();
  pd.newIndirect(19,0).writeStream(new mupdf.Buffer(truncated));
  const pix = doc.loadPage(2).toPixmap(mupdf.Matrix.scale(1.2,1.2), mupdf.ColorSpace.DeviceRGB, false, true);
  fs.writeFileSync(path.resolve(`../bisect_${Math.round(frac*100)}.png`), pix.asPNG());
  console.log('rendered', frac);
}
