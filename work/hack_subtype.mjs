// Hack: in result1.pdf (already converted to CIDFontType0), try changing each Connections
// descendant's Subtype to /Type1. This makes the PDF technically invalid but may convince
// Acrobat to display "Type 1" without "(CID)" suffix in the Fonts panel.
import fs from 'fs';
import * as mupdf from 'mupdf';

const SRC = '../asset/origin1.pdf';
const DST = 'C:/output/result1.pdf';
const CID_CFF = fs.readFileSync('Connections-Regular-CID.cff');

const data = fs.readFileSync(SRC);
const doc = mupdf.Document.openDocument(data, 'application/pdf');
const pdf = doc.asPDF();
const N = pdf.countObjects();
console.log('Total objects:', N);

const wrappers = [];
for (let i = 1; i < N; i++) {
  let o;
  try { o = pdf.newIndirect(i, 0).resolve(); } catch { continue; }
  if (!o || !o.isDictionary()) continue;
  const t = o.get('Type'); if (!t || t.asName() !== 'Font') continue;
  const st = o.get('Subtype'); if (!st || st.asName() !== 'Type0') continue;
  const bf = o.get('BaseFont'); if (!bf || !/Connections/i.test(bf.asName())) continue;
  const desc = o.get('DescendantFonts');
  if (!desc || !desc.isArray()) continue;
  const d0 = desc.get(0);
  if (!d0 || !d0.isIndirect()) continue;
  wrappers.push({ num: i, descNum: d0.asIndirect() });
}
console.log('Type 0 Connections wrappers:', wrappers.length);

const descInfo = new Map();
for (const w of wrappers) {
  if (descInfo.has(w.descNum)) continue;
  const desc = pdf.newIndirect(w.descNum, 0).resolve();
  const fd = desc.get('FontDescriptor');
  if (!fd || !fd.isIndirect()) continue;
  const fdNum = fd.asIndirect();
  const fdDict = pdf.newIndirect(fdNum, 0).resolve();
  let ffNum = null, ffKey = null;
  for (const key of ['FontFile2', 'FontFile3', 'FontFile']) {
    const ref = fdDict.get(key);
    if (ref && ref.isIndirect()) { ffNum = ref.asIndirect(); ffKey = key; break; }
  }
  descInfo.set(w.descNum, { fdNum, ffNum, ffKey });
}

// Replace FontFile2 with CID CFF
const done = new Set();
for (const [, info] of descInfo) {
  if (!info.ffNum || done.has(info.ffNum)) continue;
  done.add(info.ffNum);
  const ffRef = pdf.newIndirect(info.ffNum, 0);
  const ff = ffRef.resolve();
  if (ff.get('Length1')) ff.delete('Length1');
  if (ff.get('Filter'))  ff.delete('Filter');
  if (ff.get('DecodeParms')) ff.delete('DecodeParms');
  ff.put('Subtype', pdf.newName('CIDFontType0C'));
  const b = new mupdf.Buffer();
  b.writeBuffer(new Uint8Array(CID_CFF));
  ffRef.writeStream(b);
}

// Rename FontFile2 -> FontFile3
for (const [, info] of descInfo) {
  const fd = pdf.newIndirect(info.fdNum, 0).resolve();
  if (info.ffKey === 'FontFile2') {
    const ref = fd.get('FontFile2');
    fd.put('FontFile3', ref);
    fd.delete('FontFile2');
  }
}

// HACK: change descendant Subtype from CIDFontType2 to /Type1 (not CIDFontType0).
// Acrobat may display this as "Type 1" without "(CID)" suffix.
for (const w of wrappers) {
  const desc = pdf.newIndirect(w.descNum, 0).resolve();
  desc.put('Subtype', pdf.newName('Type1'));
  if (desc.get('CIDToGIDMap')) desc.delete('CIDToGIDMap');
}
console.log('Set', wrappers.length, 'descendants Subtype=/Type1 (HACK)');

const outBuf = pdf.saveToBuffer('compress=yes');
const buf = Buffer.from(outBuf.asUint8Array());
fs.writeFileSync(DST, buf);
console.log('Wrote', DST, buf.length, 'bytes');
