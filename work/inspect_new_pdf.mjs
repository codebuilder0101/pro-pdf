// Inspect the new PDF and identify all font objects (TrueType vs Type 1)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const pdfPath = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2.pdf');
const buf = fs.readFileSync(pdfPath);
const text = buf.toString('latin1');
console.log('File size:', buf.length, 'bytes');

// Parse all objects (also handle compressed object streams / xref streams)
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
console.log('Parsed', objs.size, 'objects');

// Find font / font descriptor / object streams
console.log('\n=== Font objects ===');
for (const [num, body] of objs) {
  if (/\/Type\s*\/Font\b/.test(body)) {
    const subtype = (body.match(/\/Subtype\s*\/([A-Za-z0-9]+)/) || [])[1];
    const baseFont = (body.match(/\/BaseFont\s*\/([\w+,\-\.]+)/) || [])[1];
    const desc = (body.match(/\/FontDescriptor\s+(\d+ \d+) R/) || [])[1];
    const descendant = (body.match(/\/DescendantFonts\s*\[?\s*(\d+ \d+) R/) || [])[1];
    const enc = (body.match(/\/Encoding\s*\/([A-Za-z0-9-]+)/) || [])[1];
    console.log(`  obj ${String(num).padStart(3)}: Subtype=${(subtype||'?').padEnd(15)} BaseFont=${(baseFont||'').padEnd(50)} Desc=${desc} Desc.Fonts=${descendant} Enc=${enc}`);
  }
}

console.log('\n=== FontDescriptors ===');
for (const [num, body] of objs) {
  if (/\/Type\s*\/FontDescriptor\b/.test(body)) {
    const fname = (body.match(/\/FontName\s*\/([\w+,\-\.]+)/) || [])[1];
    const ff1 = (body.match(/\/FontFile\s+(\d+ \d+) R/) || [])[1];
    const ff2 = (body.match(/\/FontFile2\s+(\d+ \d+) R/) || [])[1];
    const ff3Match = body.match(/\/FontFile3\s+(\d+ \d+) R/);
    const ff3 = ff3Match ? ff3Match[1] : null;
    console.log(`  obj ${String(num).padStart(3)}: ${fname} FontFile=${ff1} FontFile2=${ff2} FontFile3=${ff3}`);
  }
}

// Check for object streams (PDF 1.5+ compressed object containers)
console.log('\n=== Object streams ===');
for (const [num, body] of objs) {
  if (/\/Type\s*\/ObjStm\b/.test(body)) {
    console.log(`  obj ${num}: ObjStm found`);
  }
}

// Check PDF version
const verMatch = text.match(/^%PDF-(\d\.\d)/);
console.log('\nPDF version:', verMatch ? verMatch[1] : '?');
