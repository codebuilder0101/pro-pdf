// Exhaustive font check on the delivered PDF.
// For EVERY font object: report Subtype, BaseFont, and how its glyph program is embedded
// (FontFile / FontFile2 / FontFile3 + stream Subtype). Flags anything that is NOT Type 1.
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

const p = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const doc = mupdf.Document.openDocument(fs.readFileSync(p), 'application/pdf');
const pdfDoc = doc.asPDF();
const N = pdfDoc.countObjects();

const fonts = [];
let cidLike = 0, trueType = 0, type1 = 0, other = 0;

for (let i = 1; i < N; i++) {
  let o;
  try { o = pdfDoc.newIndirect(i, 0).resolve(); } catch { continue; }
  if (!o || !o.isDictionary()) continue;
  if (o.get('Type')?.asName?.() !== 'Font') continue;

  const subtype = o.get('Subtype')?.asName?.();
  const baseFont = o.get('BaseFont')?.asName?.() || '';

  // Resolve where the glyph program lives
  let embed = '-';
  let fd = o.get('FontDescriptor');
  // For Type0, the real program is on the descendant CIDFont's descriptor
  let desc = o.get('DescendantFonts');
  if (desc && desc.isArray()) {
    const cid = desc.get(0)?.resolve?.();
    if (cid) fd = cid.get('FontDescriptor');
  }
  if (fd) { try { fd = fd.resolve(); } catch {} }
  if (fd && fd.isDictionary()) {
    if (fd.get('FontFile') && !fd.get('FontFile').isNull?.()) embed = 'FontFile (Type1 classic)';
    else if (fd.get('FontFile2') && !fd.get('FontFile2').isNull?.()) embed = 'FontFile2 (TrueType)';
    else if (fd.get('FontFile3')) {
      let ff3 = fd.get('FontFile3'); try { ff3 = ff3.resolve(); } catch {}
      const sub = ff3?.get?.('Subtype')?.asName?.();
      embed = 'FontFile3 (' + (sub || '?') + ')';
    }
  }

  fonts.push({ obj: i, subtype, baseFont, embed });
  if (subtype === 'Type1' || subtype === 'MMType1') type1++;
  else if (subtype === 'TrueType') trueType++;
  else if (subtype === 'Type0' || /^CIDFontType/.test(subtype)) cidLike++;
  else other++;
}

console.log('=== Every font object in the delivered PDF ===');
for (const f of fonts) {
  const flag = (f.subtype === 'Type1') ? 'OK ' : '!! ';
  console.log(`${flag}obj ${String(f.obj).padStart(3)}  Subtype=${(f.subtype||'').padEnd(14)} embed=${(f.embed).padEnd(26)} ${f.baseFont}`);
}
console.log('\n=== Totals ===');
console.log('Total font objects :', fonts.length);
console.log('Type1              :', type1);
console.log('TrueType           :', trueType);
console.log('Type0/CIDFont*     :', cidLike);
console.log('Other              :', other);

// Also check: any TrueType program (FontFile2) still embedded ANYWHERE?
let ff2count = 0, cidStreams = 0;
for (let i = 1; i < N; i++) {
  let o;
  try { o = pdfDoc.newIndirect(i, 0).resolve(); } catch { continue; }
  if (!o || !o.isDictionary()) continue;
  if (o.get('Type')?.asName?.() === 'FontDescriptor') {
    if (o.get('FontFile2') && !o.get('FontFile2').isNull?.()) ff2count++;
  }
}
console.log('\nFontDescriptors still pointing to FontFile2 (TrueType):', ff2count);
console.log(cidLike === 0 && trueType === 0 && ff2count === 0
  ? '\nRESULT: ✅ Every font is Type 1. No Type 0, no TrueType, no CID fonts remain.'
  : '\nRESULT: ⚠️ Non-Type-1 fonts still present (see above).');
