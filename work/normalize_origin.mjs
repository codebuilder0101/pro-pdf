// Normalize origin.pdf: decompress object streams so regex-based rewriting can see every object.
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

const srcPath = path.resolve('../asset/origin.pdf');
const dstPath = path.resolve('origin_normalized.pdf');

const data = fs.readFileSync(srcPath);
const doc = mupdf.Document.openDocument(data, 'application/pdf');
const pdfDoc = doc.asPDF();

const out = pdfDoc.saveToBuffer('decompress=yes,compress=no,pretty=yes,ascii=no');
const buf = Buffer.from(out.asUint8Array());
fs.writeFileSync(dstPath, buf);
console.log('Wrote', dstPath, '(', buf.length, 'bytes from', data.length, ')');
