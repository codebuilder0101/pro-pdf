// Inspect the normalized PDF — all objects are now visible directly
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const pdfPath = path.resolve('normalized.pdf');
const buf = fs.readFileSync(pdfPath);
const text = buf.toString('latin1');
console.log('Size:', buf.length);

const objRe = /(\d+) (\d+) obj\b/g;
const objs = new Map();
let m;
while ((m = objRe.exec(text)) !== null) {
  const num = parseInt(m[1]);
  const start = m.index + m[0].length;
  const end = text.indexOf('endobj', start);
  if (end < 0) continue;
  objs.set(num, text.slice(start, end));
}
console.log('Objects:', objs.size);

// Identify all Type 0 fonts and their CID descendants
const type0Fonts = [];
const cidFontsByObj = {};
const fontDescriptors = {};
const allFonts = [];

for (const [num, body] of objs) {
  if (/\/Type\s*\/Font\b/.test(body)) {
    const subtype = (body.match(/\/Subtype\s*\/([A-Za-z0-9]+)/) || [])[1];
    const baseFont = (body.match(/\/BaseFont\s*\/([\w+,\-\.]+)/) || [])[1];
    const desc = (body.match(/\/FontDescriptor\s+(\d+)\s+\d+\s+R/) || [])[1];
    // DescendantFonts may be inline-array OR an indirect reference to an array object
    let descendant = null;
    const inlineArr = body.match(/\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/);
    if (inlineArr) descendant = parseInt(inlineArr[1]);
    else {
      const refMatch = body.match(/\/DescendantFonts\s+(\d+)\s+\d+\s+R/);
      if (refMatch) {
        const arrObj = objs.get(parseInt(refMatch[1]));
        if (arrObj) {
          const inner = arrObj.match(/\[\s*(\d+)\s+\d+\s+R/);
          if (inner) descendant = parseInt(inner[1]);
        }
      }
    }
    const toUnicode = (body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/) || [])[1];
    const enc = (body.match(/\/Encoding\s*\/([A-Za-z0-9-]+)/) || [])[1];
    allFonts.push({ num, subtype, baseFont, desc, descendant, toUnicode, enc, body: body.slice(0,500) });
    if (subtype === 'Type0') {
      type0Fonts.push({ num, baseFont, descendant, toUnicode });
    } else if (subtype === 'CIDFontType2') {
      cidFontsByObj[num] = { num, baseFont, desc };
    }
  } else if (/\/Type\s*\/FontDescriptor\b/.test(body)) {
    const fname = (body.match(/\/FontName\s*\/([\w+,\-\.]+)/) || [])[1];
    const ff2 = (body.match(/\/FontFile2\s+(\d+)\s+\d+\s+R/) || [])[1];
    const ff3 = (body.match(/\/FontFile3\s+(\d+)\s+\d+\s+R/) || [])[1];
    fontDescriptors[num] = { num, fname, ff2: ff2 ? parseInt(ff2) : null, ff3: ff3 ? parseInt(ff3) : null };
  }
}

console.log('\n=== All Type 0 (CID) fonts that need conversion ===');
for (const f of type0Fonts) {
  const cid = cidFontsByObj[f.descendant];
  if (!cid) { console.log(`  obj ${f.num}: NO CID DESCENDANT FOUND (desc=${f.descendant})`); continue; }
  const fd = fontDescriptors[cid.desc];
  console.log(`  Type0 obj=${f.num} BaseFont=${f.baseFont} ToUni=${f.toUnicode} -> CID obj=${cid.num} -> FD obj=${cid.desc} FontFile2=${fd ? fd.ff2 : '?'}`);
}
console.log('\nTotal Type 0 fonts to convert:', type0Fonts.length);

// Save the parsed font map for the rewriter
const mapping = type0Fonts.map(f => {
  const cid = cidFontsByObj[f.descendant];
  const fd = cid ? fontDescriptors[cid.desc] : null;
  return {
    type0Obj: f.num,
    baseFont: f.baseFont,
    toUniObj: f.toUnicode ? parseInt(f.toUnicode) : null,
    cidFontObj: cid ? cid.num : null,
    fontDescriptorObj: cid ? cid.desc : null,
    fontFile2Obj: fd ? fd.ff2 : null,
  };
});
fs.writeFileSync('font_mapping.json', JSON.stringify(mapping, null, 2));
console.log('Wrote font_mapping.json');
