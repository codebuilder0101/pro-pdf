// Inspect new PDF using mupdf (which handles object streams transparently)
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

const pdfPath = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
const data = fs.readFileSync(pdfPath);
const doc = mupdf.Document.openDocument(data, 'application/pdf');
const pdfDoc = doc.asPDF();
const N = pdfDoc.countObjects();
console.log('xref entries:', N, '  pages:', doc.countPages());

const fontObjs = [];
const fontDescs = [];
const streams = [];

for (let i = 1; i < N; i++) {
  let obj;
  try { obj = pdfDoc.newIndirect(i, 0).resolve(); } catch { continue; }
  if (!obj || !obj.isDictionary()) continue;
  const type = obj.get('Type')?.asName?.();
  if (type === 'Font') {
    const subtype = obj.get('Subtype')?.asName?.();
    const baseFont = obj.get('BaseFont')?.asName?.();
    const enc = obj.get('Encoding');
    let encName = null;
    if (enc) {
      if (enc.isName()) encName = enc.asName();
      else if (enc.isDictionary()) encName = '<dict>';
    }
    const fd = obj.get('FontDescriptor');
    const desc = obj.get('DescendantFonts');
    fontObjs.push({ obj: i, subtype, baseFont, enc: encName, hasDescendants: !!(desc && desc.isArray()) });
  } else if (type === 'FontDescriptor') {
    const fname = obj.get('FontName')?.asName?.();
    const ff1 = obj.get('FontFile');
    const ff2 = obj.get('FontFile2');
    const ff3 = obj.get('FontFile3');
    let ff3Subtype = null;
    if (ff3 && ff3.isStream()) {
      ff3Subtype = ff3.get('Subtype')?.asName?.();
    } else if (ff3 && ff3.isIndirect()) {
      const r = ff3.resolve();
      ff3Subtype = r.get('Subtype')?.asName?.();
    }
    fontDescs.push({ obj: i, fname, hasFF1: !!ff1, hasFF2: !!ff2, hasFF3: !!ff3, ff3Subtype });
  }
}

console.log('\n=== Fonts ===');
for (const f of fontObjs) {
  console.log(`  obj ${String(f.obj).padStart(3)}: Subtype=${(f.subtype||'').padEnd(16)} BaseFont=${(f.baseFont||'').padEnd(50)} Encoding=${f.enc || ''} desc=${f.hasDescendants}`);
}
console.log('\n=== FontDescriptors ===');
for (const d of fontDescs) {
  console.log(`  obj ${String(d.obj).padStart(3)}: ${d.fname}  FontFile=${d.hasFF1} FontFile2=${d.hasFF2} FontFile3=${d.hasFF3} ff3Subtype=${d.ff3Subtype}`);
}
