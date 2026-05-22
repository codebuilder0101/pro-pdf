// Audit fonts via mupdf, which reports the same details Acrobat shows under File>Properties>Fonts
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

function listFonts(pdfPath, label) {
  console.log(`\n=== ${label}: ${pdfPath} ===`);
  const data = fs.readFileSync(pdfPath);
  const doc = mupdf.Document.openDocument(data, 'application/pdf');
  // mupdf has a method to enumerate fonts on a page
  const page = doc.loadPage(0);
  const dev = new mupdf.Device({});
  // Walk the page operator list to find font definitions — easiest: scan via PDFObject
  // mupdf PDFDocument
  const pdfDoc = doc.asPDF();
  const xrefLen = pdfDoc.countObjects();
  console.log('xref entries:', xrefLen);
  const fonts = [];
  for (let i = 1; i < xrefLen; i++) {
    let obj;
    try { obj = pdfDoc.newIndirect(i, 0).resolve(); } catch { continue; }
    if (!obj || !obj.isDictionary()) continue;
    const type = obj.get('Type');
    if (!type || type.asName() !== 'Font') continue;
    const subtype  = obj.get('Subtype')?.asName?.();
    const baseFont = obj.get('BaseFont')?.asName?.();
    const enc      = obj.get('Encoding');
    let encName = null;
    if (enc) {
      if (enc.isName()) encName = enc.asName();
      else if (enc.isDictionary()) encName = enc.get('BaseEncoding')?.asName?.() || '<custom>';
    }
    fonts.push({ obj: i, subtype, baseFont, enc: encName });
  }
  for (const f of fonts) {
    console.log(`  obj ${String(f.obj).padStart(3)}: Subtype=${(f.subtype||'').padEnd(15)} BaseFont=${(f.baseFont||'').padEnd(50)} Encoding=${f.enc || ''}`);
  }
}

listFonts(path.resolve('../DUMMY.pdf'),       'ORIGINAL');
listFonts(path.resolve('../DUMMY-Type1.pdf'), 'REBUILT WITH TYPE 1');
