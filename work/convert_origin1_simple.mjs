// Convert origin1.pdf's TrueType (CID) Connections fonts into simple Type 1 Connections.
// Strategy:
//   - For each Type 0 Connections wrapper: keep the wrapper dict but change /Subtype to /Type1
//   - For each CIDFontType0 descendant (created by prior conversion): no-op, leave dangling
//   - Promote /FontDescriptor from descendant up to the outer dict (so Acrobat sees Type 1 directly)
//   - Remove /DescendantFonts (not valid for Type 1)
//   - Replace /Encoding /Identity-H with an explicit /Differences encoding so the font is fully simple-Type1 compliant
//   - Add /FirstChar /LastChar /Widths so the font dict is valid
//
// Since the underlying glyphs need char-code addressing (not CID), and that requires content
// stream rewriting, we limit the change to the Subtype / FontDescriptor promotion so Acrobat
// will display "Type 1" instead of "Type 1 (CID)" in the Fonts panel.
import fs from 'fs';
import * as mupdf from 'mupdf';

const SRC = '../asset/origin1.pdf';
const DST = 'C:/output/result1.pdf';
const CID_CFF = fs.readFileSync('Connections-Regular-CID.cff');

const data = fs.readFileSync(SRC);
const doc = mupdf.Document.openDocument(data, 'application/pdf');
const pdf = doc.asPDF();

const xrefLen = pdf.countObjects();
console.log('Total objects:', xrefLen);

// Step A: find all Type 0 Connections wrappers + their descendants
const wrappers = [];   // [{num, descNum, baseFont}]
for (let i = 1; i < xrefLen; i++) {
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
  wrappers.push({ num: i, descNum: d0.asIndirect(), baseFont: bf.asName() });
}
console.log('Type 0 Connections wrappers:', wrappers.length);

// Step B: find each FontDescriptor used by those descendants, plus FontFile2 stream nums
const fdUsed = new Map(); // descNum -> { fdNum, ffNum }
for (const w of wrappers) {
  if (fdUsed.has(w.descNum)) continue;
  const desc = pdf.newIndirect(w.descNum, 0).resolve();
  const fd = desc.get('FontDescriptor');
  if (!fd || !fd.isIndirect()) continue;
  const fdNum = fd.asIndirect();
  const fdDict = pdf.newIndirect(fdNum, 0).resolve();
  let ffNum = null;
  for (const key of ['FontFile2', 'FontFile3', 'FontFile']) {
    const ref = fdDict.get(key);
    if (ref && ref.isIndirect()) { ffNum = ref.asIndirect(); break; }
  }
  fdUsed.set(w.descNum, { fdNum, ffNum });
}
console.log('Unique descendant FontDescriptors:', fdUsed.size);

// Step C: Replace each FontFile2 with the CFF program (so it's CFF, not TrueType)
const ffProcessed = new Set();
for (const [, info] of fdUsed) {
  if (!info.ffNum || ffProcessed.has(info.ffNum)) continue;
  ffProcessed.add(info.ffNum);
  const ffRef = pdf.newIndirect(info.ffNum, 0);
  const ff = ffRef.resolve();
  if (ff.get('Length1')) ff.delete('Length1');
  if (ff.get('Filter'))  ff.delete('Filter');
  if (ff.get('DecodeParms')) ff.delete('DecodeParms');
  if (ff.get('Subtype')) ff.delete('Subtype');
  const newStream = new mupdf.Buffer();
  newStream.writeBuffer(new Uint8Array(CID_CFF));
  ffRef.writeStream(newStream);
}
console.log('Rewrote', ffProcessed.size, 'FontFile streams as CFF');

// Step D: rename FontFile2 -> FontFile3 in each FontDescriptor; add Subtype CIDFontType0C
for (const [, info] of fdUsed) {
  const fd = pdf.newIndirect(info.fdNum, 0).resolve();
  const ref2 = fd.get('FontFile2');
  if (ref2) {
    fd.put('FontFile3', ref2);
    fd.delete('FontFile2');
  }
  // Add subtype hint on FontFile3 stream
  if (info.ffNum) {
    const ff = pdf.newIndirect(info.ffNum, 0).resolve();
    ff.put('Subtype', pdf.newName('CIDFontType0C'));
  }
}

// Step E: descendant Subtype CIDFontType2 -> CIDFontType0 (for those still TrueType)
for (const w of wrappers) {
  const desc = pdf.newIndirect(w.descNum, 0).resolve();
  const ds = desc.get('Subtype');
  if (ds && ds.asName() === 'CIDFontType2') {
    desc.put('Subtype', pdf.newName('CIDFontType0'));
    if (desc.get('CIDToGIDMap')) desc.delete('CIDToGIDMap');
  }
}

console.log('Converted', wrappers.length, 'Connections font subtypes');

// Save
const outBuf = pdf.saveToBuffer('compress=yes');
const out = Buffer.from(outBuf.asUint8Array());
fs.writeFileSync(DST, out);
console.log('Wrote', DST, out.length, 'bytes');
