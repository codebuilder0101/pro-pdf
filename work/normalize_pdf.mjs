// Step 1: use mupdf to "normalize" the PDF — decompress object streams,
// flatten xref streams, so that a regex-based rewriter can see every object.
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

const srcPath = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
const dstPath = path.resolve('normalized.pdf');

const data = fs.readFileSync(srcPath);
const doc = mupdf.Document.openDocument(data, 'application/pdf');
const pdfDoc = doc.asPDF();

const out = pdfDoc.saveToBuffer('decompress=yes,compress=no,pretty=yes,ascii=no');
const buf = Buffer.from(out.asUint8Array());
fs.writeFileSync(dstPath, buf);
console.log('Wrote', dstPath, '(', buf.length, 'bytes from', data.length, ')');
