// Parse PDF directly to find Font objects and FontDescriptors
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const pdfPath = path.resolve('../DUMMY.pdf');
const buf = fs.readFileSync(pdfPath);
const text = buf.toString('latin1');

// Find all "obj" markers and their content
const objRe = /(\d+) (\d+) obj\b([\s\S]*?)endobj/g;
const objs = new Map();
let m;
while ((m = objRe.exec(text)) !== null) {
  const num = m[1] + ' ' + m[2];
  const body = m[3];
  objs.set(num, body);
}
console.log('Total objects:', objs.size);

// Find all objects that are Font dictionaries
for (const [num, body] of objs) {
  if (/\/Type\s*\/Font\b/.test(body)) {
    // It's a Font object
    const subtype = (body.match(/\/Subtype\s*\/(\w+)/) || [])[1];
    const baseFont = (body.match(/\/BaseFont\s*\/([\w+,\-\.]+)/) || [])[1];
    const encoding = (body.match(/\/Encoding\s*\/(\w+)/) || [])[1];
    const descRef = (body.match(/\/FontDescriptor\s+(\d+ \d+) R/) || [])[1];
    const descendant = (body.match(/\/DescendantFonts\s*\[\s*(\d+ \d+) R/) || [])[1];
    const toUnicode = (body.match(/\/ToUnicode\s+(\d+ \d+) R/) || [])[1];
    console.log(`Object ${num}: Font  Subtype=${subtype}  BaseFont=${baseFont}  Enc=${encoding}  Desc=${descRef}  DescendantFonts=${descendant}  ToUnicode=${toUnicode}`);
  }
}

console.log('\n--- FontDescriptors ---');
for (const [num, body] of objs) {
  if (/\/Type\s*\/FontDescriptor\b/.test(body)) {
    const fname = (body.match(/\/FontName\s*\/([\w+,\-\.]+)/) || [])[1];
    const flags = (body.match(/\/Flags\s+(\d+)/) || [])[1];
    const ff1 = (body.match(/\/FontFile\s+(\d+ \d+) R/) || [])[1];
    const ff2 = (body.match(/\/FontFile2\s+(\d+ \d+) R/) || [])[1];
    const ff3Match = body.match(/\/FontFile3\s+(\d+ \d+) R/);
    const ff3 = ff3Match ? ff3Match[1] : null;
    console.log(`Object ${num}: FontDescriptor FontName=${fname} Flags=${flags} FontFile=${ff1} FontFile2=${ff2} FontFile3=${ff3}`);
  }
}
