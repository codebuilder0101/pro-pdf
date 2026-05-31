// Convert all TrueType (CID) Connections fonts in origin1.pdf to Type 1 (CIDFontType0)
// while preserving the Type 0 wrapper + Identity-H encoding so Acrobat displays them as
// "Connections [Identity-H] Type 1".
//
// Strategy:
//   1. Use mupdf to open origin1.pdf, traverse all indirect objects.
//   2. Identify every CIDFontType2 descendant font with BaseFont containing "Connections".
//   3. For each:
//        - change /Subtype /CIDFontType2 -> /CIDFontType0
//        - in its FontDescriptor: rename /FontFile2 -> /FontFile3 and add /Subtype /CIDFontType0C to the stream dict
//        - replace the TrueType stream bytes with the prebuilt CID CFF program
//   4. Keep all Type 0 wrapper dicts untouched (each one's BaseFont, Encoding, ToUnicode unchanged).
//   5. Save to C:/output/result1.pdf.
import fs from 'fs';
import * as mupdf from 'mupdf';

const SRC = '../asset/origin1.pdf';
const DST = 'C:/output/result1.pdf';
const CID_CFF = fs.readFileSync('Connections-Regular-CID.cff'); // 32552 bytes

const data = fs.readFileSync(SRC);
const doc = mupdf.Document.openDocument(data, 'application/pdf');
const pdf = doc.asPDF();

const xrefLen = pdf.countObjects();
console.log('Total objects:', xrefLen);

// First pass: find CIDFontType2 Connections descendants and their FontDescriptor refs
const cidDescDicts = []; // [{num, fontDescNum}]
for (let i = 1; i < xrefLen; i++) {
  let obj;
  try { obj = pdf.newIndirect(i, 0).resolve(); } catch { continue; }
  if (!obj || !obj.isDictionary()) continue;
  // Check /Type = Font, /Subtype = CIDFontType2, /BaseFont containing "Connections"
  const t = obj.get('Type');
  const st = obj.get('Subtype');
  const bf = obj.get('BaseFont');
  if (!t || !st || !bf) continue;
  if (t.asName() !== 'Font') continue;
  if (st.asName() !== 'CIDFontType2') continue;
  if (!/Connections/i.test(bf.asName())) continue;
  const fd = obj.get('FontDescriptor');
  if (!fd || !fd.isIndirect()) continue;
  cidDescDicts.push({ num: i, baseFont: bf.asName(), fontDescNum: fd.asIndirect() });
}
console.log('CIDFontType2 Connections descendants found:', cidDescDicts.length);
cidDescDicts.forEach(d => console.log(`  obj ${d.num}  BaseFont=${d.baseFont}  FD=${d.fontDescNum}`));

// Collect unique FontDescriptor numbers and their FontFile2 stream nums
const fdToFF = new Map(); // fdNum -> { ffNum }
for (const d of cidDescDicts) {
  if (fdToFF.has(d.fontDescNum)) continue;
  const fd = pdf.newIndirect(d.fontDescNum, 0).resolve();
  const ff2 = fd.get('FontFile2');
  if (ff2 && ff2.isIndirect()) {
    fdToFF.set(d.fontDescNum, { ffNum: ff2.asIndirect() });
  }
}
console.log('Unique FontDescriptors:', fdToFF.size);
for (const [fdNum, info] of fdToFF) console.log(`  FD ${fdNum} -> FontFile2 ${info.ffNum}`);

// --- Apply transformations ---
// 1) Change CIDFontType2 -> CIDFontType0 in each descendant
for (const d of cidDescDicts) {
  const obj = pdf.newIndirect(d.num, 0).resolve();
  obj.put('Subtype', pdf.newName('CIDFontType0'));
  // CIDToGIDMap may be present; for CIDFontType0 it's not used and may even confuse readers.
  if (obj.get('CIDToGIDMap')) obj.delete('CIDToGIDMap');
}
console.log('Rewrote', cidDescDicts.length, 'descendant Subtypes -> CIDFontType0');

// 2) Change FontFile2 -> FontFile3 in each FontDescriptor
for (const [fdNum, info] of fdToFF) {
  const fd = pdf.newIndirect(fdNum, 0).resolve();
  // Copy the FontFile2 reference value to FontFile3, delete FontFile2
  const ref = fd.get('FontFile2');
  fd.put('FontFile3', ref);
  fd.delete('FontFile2');
}
console.log('Rewrote', fdToFF.size, 'FontDescriptors  FontFile2 -> FontFile3');

// 3) Replace each FontFile2 stream's bytes with CID CFF, and add /Subtype /CIDFontType0C
for (const [fdNum, info] of fdToFF) {
  const ffRef = pdf.newIndirect(info.ffNum, 0);
  const ff = ffRef.resolve();
  // Update dict: set /Subtype /CIDFontType0C, remove TrueType-specific /Length1,
  // remove any existing /Filter so mupdf can apply its own on save.
  ff.put('Subtype', pdf.newName('CIDFontType0C'));
  if (ff.get('Length1')) ff.delete('Length1');
  if (ff.get('Filter'))  ff.delete('Filter');
  if (ff.get('DecodeParms')) ff.delete('DecodeParms');
  // writeStream sets the DECODED (uncompressed) bytes; mupdf handles Filter/Length on save.
  const newStream = new mupdf.Buffer();
  newStream.writeBuffer(new Uint8Array(CID_CFF));
  ffRef.writeStream(newStream);
}
console.log('Replaced', fdToFF.size, 'FontFile3 stream bytes with CID CFF');

// Save
const outBuf = pdf.saveToBuffer('compress=yes');
const buf = Buffer.from(outBuf.asUint8Array());
fs.writeFileSync(DST, buf);
console.log('Wrote', DST, buf.length, 'bytes');
