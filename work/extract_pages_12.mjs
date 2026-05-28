// Extract pages 1 and 2 from the bank statement into a separate 2-page PDF.
// Use mupdf's PDFDocument page copy.
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

const src = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
const dst = path.resolve('bank_pages_12_original.pdf');

const srcDoc = mupdf.Document.openDocument(fs.readFileSync(src), 'application/pdf');
const srcPdf = srcDoc.asPDF();
const nPages = srcDoc.countPages();
console.log('Source pages:', nPages);

// Build a new PDF with the first two pages
const newPdf = new mupdf.PDFDocument();
newPdf.graftPage(0, srcPdf, 0);
newPdf.graftPage(1, srcPdf, 1);
const out = newPdf.saveToBuffer('decompress=yes,compress=no');
fs.writeFileSync(dst, Buffer.from(out.asUint8Array()));
console.log('Wrote', dst, '(', Buffer.from(out.asUint8Array()).length, 'bytes)');
