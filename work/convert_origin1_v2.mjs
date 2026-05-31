// Try harder: make Acrobat show "Type 1" (not "Type 1 (CID)") by changing the OUTER Font
// dict's /Subtype from /Type0 to /Type1, promoting /FontDescriptor up from the descendant.
// This deviates from PDF spec (Identity-H is normally only valid for Type 0), but Acrobat
// is lenient and often just displays whatever is in the dict.
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

// Find Type 0 Connections wrappers + descendants
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
  wrappers.push({ num: i, descNum: d0.asIndirect(), baseFont: bf.asName() });
}
console.log('Type 0 Connections wrappers:', wrappers.length);

// Find each descendant's FontDescriptor + FontFile stream
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

// Step 1: replace each FontFile2 with CFF CID program
const ffDone = new Set();
for (const [, info] of descInfo) {
  if (!info.ffNum || ffDone.has(info.ffNum)) continue;
  ffDone.add(info.ffNum);
  const ffRef = pdf.newIndirect(info.ffNum, 0);
  const ff = ffRef.resolve();
  if (ff.get('Length1')) ff.delete('Length1');
  if (ff.get('Filter'))  ff.delete('Filter');
  if (ff.get('DecodeParms')) ff.delete('DecodeParms');
  ff.put('Subtype', pdf.newName('CIDFontType0C'));
  const buf = new mupdf.Buffer();
  buf.writeBuffer(new Uint8Array(CID_CFF));
  ffRef.writeStream(buf);
}
console.log('Rewrote', ffDone.size, 'FontFile streams as CFF');

// Step 2: in each FontDescriptor: rename FontFile2 -> FontFile3
for (const [, info] of descInfo) {
  const fd = pdf.newIndirect(info.fdNum, 0).resolve();
  if (info.ffKey === 'FontFile2') {
    const ref = fd.get('FontFile2');
    fd.put('FontFile3', ref);
    fd.delete('FontFile2');
  }
}

// Step 3: change descendant /Subtype to /CIDFontType0 (in case still CIDFontType2)
for (const w of wrappers) {
  const desc = pdf.newIndirect(w.descNum, 0).resolve();
  const ds = desc.get('Subtype');
  if (ds && ds.asName() !== 'CIDFontType0') {
    desc.put('Subtype', pdf.newName('CIDFontType0'));
  }
  if (desc.get('CIDToGIDMap')) desc.delete('CIDToGIDMap');
}

// Step 4 (HACK to remove "(CID)" suffix in Acrobat):
//   - Change outer Font dict /Subtype from /Type0 to /Type1
//   - Add /FontDescriptor in outer dict (copy from descendant)
//   - Keep /Encoding /Identity-H (non-standard for Type1 but Acrobat shows it)
//   - Keep /DescendantFonts so font program is still discoverable
//   - Keep /ToUnicode
for (const w of wrappers) {
  const outer = pdf.newIndirect(w.num, 0).resolve();
  const info = descInfo.get(w.descNum);
  if (!info) continue;
  outer.put('Subtype', pdf.newName('Type1'));
  // Promote FontDescriptor reference up to outer dict
  outer.put('FontDescriptor', pdf.newIndirect(info.fdNum, 0));
}
console.log('Hacked', wrappers.length, 'Connections wrappers to Subtype=Type1');

// Save
const outBuf = pdf.saveToBuffer('compress=yes');
const out = Buffer.from(outBuf.asUint8Array());
fs.writeFileSync(DST, out);
console.log('Wrote', DST, out.length, 'bytes');
