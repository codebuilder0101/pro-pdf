// Simulate Acrobat's Fonts panel: group font objects by (BaseFont name + embedded program object).
// Acrobat shows ONE row per unique embedded font program / name.
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

const p = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const doc = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
const pdfDoc = doc.asPDF();
const N = pdfDoc.countObjects();

const byName = new Map();      // baseFont name -> Set of FontFile3 object numbers
for (let i = 1; i < N; i++) {
  let o; try { o = pdfDoc.newIndirect(i, 0).resolve(); } catch { continue; }
  if (!o || !o.isDictionary()) continue;
  if (o.get('Type')?.asName?.() !== 'Font') continue;
  const baseFont = o.get('BaseFont')?.asName?.() || '(none)';
  // find FontFile3 object number via FontDescriptor
  let fd = o.get('FontDescriptor');
  if (fd) { try { fd = fd.resolve(); } catch {} }
  let ffNum = '-';
  if (fd && fd.isDictionary()) {
    const ff = fd.get('FontFile3');
    if (ff && ff.isIndirect && ff.isIndirect()) ffNum = ff.asIndirect();
  }
  if (!byName.has(baseFont)) byName.set(baseFont, new Set());
  byName.get(baseFont).add(ffNum);
}

console.log('=== What Acrobat Fonts panel shows (unique font names) ===');
const names = [...byName.keys()].sort();
for (const nm of names) {
  const programs = [...byName.get(nm)];
  console.log(`  ${nm.padEnd(42)}  embedded-program-objs: ${programs.join(',')}`);
}
console.log('\nTotal distinct font names:', names.length);

// Specifically the plain "Connections" (no _CZEX suffix)
const plainConn = names.filter(n => /(^|\+)Connections$/.test(n));
console.log('Plain "Connections" entries:', plainConn);
console.log(plainConn.length === 1
  ? '✅ "Connections" appears as ONE single font.'
  : '⚠️ "Connections" appears ' + plainConn.length + ' times.');
