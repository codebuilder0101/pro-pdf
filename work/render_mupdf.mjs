// Render both PDFs to PNG using MuPDF.js
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

async function renderPdf(pdfPath, outPath, label) {
  const data = fs.readFileSync(pdfPath);
  const doc = mupdf.Document.openDocument(data, 'application/pdf');
  console.log(`${label}: pages=${doc.countPages()}`);
  // Dump font info using mupdf
  const page = doc.loadPage(0);
  // Render
  const matrix = mupdf.Matrix.scale(2, 2);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  const pngBuf = pixmap.asPNG();
  fs.writeFileSync(outPath, pngBuf);
  console.log(`  wrote ${outPath} (${pngBuf.length} bytes, ${pixmap.getWidth()}x${pixmap.getHeight()})`);
  // Extract text
  const text = page.toStructuredText().asJSON();
  return text;
}

await renderPdf(path.resolve('../DUMMY.pdf'),       path.resolve('../render_original.png'), 'ORIGINAL  ');
await renderPdf(path.resolve('../DUMMY-Type1.pdf'), path.resolve('../render_type1.png'),    'REBUILT T1');
console.log('Done.');
