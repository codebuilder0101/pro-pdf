// Inspect the client's page 1.pdf and page 2.pdf to see what fonts they contain
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

function audit(label, p) {
  console.log(`\n=== ${label}: ${p} ===`);
  const data = fs.readFileSync(p);
  console.log('Size:', data.length);
  const doc = mupdf.Document.openDocument(data, 'application/pdf');
  const pdfDoc = doc.asPDF();
  const N = pdfDoc.countObjects();
  console.log('xref:', N, 'pages:', doc.countPages());
  const fonts = [];
  const fontDescs = [];
  for (let i = 1; i < N; i++) {
    let obj;
    try { obj = pdfDoc.newIndirect(i, 0).resolve(); } catch { continue; }
    if (!obj || !obj.isDictionary()) continue;
    const type = obj.get('Type')?.asName?.();
    if (type === 'Font') {
      const subtype = obj.get('Subtype')?.asName?.();
      const baseFont = obj.get('BaseFont')?.asName?.();
      fonts.push({ obj: i, subtype, baseFont });
    } else if (type === 'FontDescriptor') {
      const fname = obj.get('FontName')?.asName?.();
      const ff1 = obj.get('FontFile')?.isStream?.() || obj.get('FontFile')?.isIndirect?.();
      const ff2 = obj.get('FontFile2')?.isStream?.() || obj.get('FontFile2')?.isIndirect?.();
      const ff3 = obj.get('FontFile3');
      let ff3sub = null;
      if (ff3 && ff3.isIndirect()) {
        const r = ff3.resolve();
        if (r && r.isStream()) ff3sub = r.get('Subtype')?.asName?.();
      }
      fontDescs.push({ obj: i, fname, ff1, ff2, ff3: !!ff3, ff3sub });
    }
  }
  console.log('\nFonts:');
  for (const f of fonts) console.log(`  obj ${String(f.obj).padStart(3)}: ${(f.subtype||'').padEnd(16)} ${f.baseFont}`);
  console.log('\nFontDescriptors:');
  for (const d of fontDescs) console.log(`  obj ${String(d.obj).padStart(3)}: ${d.fname}  FontFile=${d.ff1} FontFile2=${d.ff2} FontFile3=${d.ff3} (${d.ff3sub||'-'})`);
}

audit('page 1.pdf', path.resolve('../asset/page 1.pdf'));
audit('page 2.pdf', path.resolve('../asset/page 2.pdf'));
