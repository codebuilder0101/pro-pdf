// Verify the rebuilt PDF: re-scan font objects, and try to render with pdfjs-dist
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const pdfPath = path.resolve('../DUMMY-Type1.pdf');
const buf = fs.readFileSync(pdfPath);
const text = buf.toString('latin1');
console.log('--- DUMMY-Type1.pdf ---');
console.log('Size:', buf.length, 'bytes\n');

const objRe = /(\d+) (\d+) obj\b([\s\S]*?)endobj/g;
const objs = new Map();
let m;
while ((m = objRe.exec(text)) !== null) {
  objs.set(parseInt(m[1]), m[3]);
}
console.log('Number of objects:', objs.size);

// Show font objects
console.log('\n=== Fonts in rebuilt PDF ===');
for (const [num, body] of objs) {
  if (/\/Type\s*\/Font\b/.test(body)) {
    const subtype = (body.match(/\/Subtype\s*\/(\w+)/) || [])[1];
    const baseFont = (body.match(/\/BaseFont\s*\/([\w+,\-\.]+)/) || [])[1];
    const desc = (body.match(/\/FontDescriptor\s+(\d+ \d+) R/) || [])[1];
    console.log(`Obj ${num}: ${subtype.padEnd(20)} BaseFont=${baseFont}  Desc=${desc}`);
  }
}
console.log('\n=== FontDescriptors ===');
for (const [num, body] of objs) {
  if (/\/Type\s*\/FontDescriptor\b/.test(body)) {
    const fname = (body.match(/\/FontName\s*\/([\w+,\-\.]+)/) || [])[1];
    const ff1 = (body.match(/\/FontFile\s+(\d+ \d+) R/) || [])[1];
    const ff2 = (body.match(/\/FontFile2\s+(\d+ \d+) R/) || [])[1];
    const ff3 = (body.match(/\/FontFile3\s+(\d+ \d+) R/) || [])[1];
    console.log(`Obj ${num}: ${fname}  FontFile=${ff1} FontFile2=${ff2} FontFile3=${ff3}`);
  }
}

// Show Object 48 subtype
console.log('\n=== Object 48 (was TTF, now CFF) ===');
console.log(objs.get(48).slice(0, 300));

// Now try opening with pdfjs to ensure it renders
console.log('\n=== pdf.js round-trip check ===');
const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(buf);
const pdf = await getDocument({ data, useSystemFonts: false }).promise;
console.log('pdf.js opened. Pages:', pdf.numPages);
const page = await pdf.getPage(1);
const txt = await page.getTextContent();
const strings = txt.items.map(it => it.str).filter(s => s && s.trim());
console.log('Extracted', strings.length, 'text items');
console.log('First 30 items:');
strings.slice(0, 30).forEach((s, i) => console.log(`  [${i}] "${s}"`));
