// Inspect the 2-page extracted PDF: find all CID/Type0 fonts and what content streams reference them.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const SRC = 'bank_pages_12_original.pdf';
const text = fs.readFileSync(SRC, 'latin1');
const buf  = fs.readFileSync(SRC);

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

// Find Type 0 / CIDFontType2 fonts whose BaseFont matches Connections (regular)
const allFonts = {};
for (const [num, body] of objs) {
  if (/\/Type\s*\/Font\b/.test(body)) {
    const subtype = (body.match(/\/Subtype\s*\/([A-Za-z0-9]+)/) || [])[1];
    const baseFont = (body.match(/\/BaseFont\s*\/([\w+,\-\.]+)/) || [])[1];
    allFonts[num] = { num, subtype, baseFont };
  }
}
console.log('\nAll fonts:');
for (const f of Object.values(allFonts)) {
  console.log(`  obj ${String(f.num).padStart(3)}: ${(f.subtype||'').padEnd(15)} ${f.baseFont}`);
}

// List pages
console.log('\nPages:');
for (const [num, body] of objs) {
  if (/\/Type\s*\/Page\b/.test(body) && !/\/Type\s*\/Pages\b/.test(body)) {
    const contents = body.match(/\/Contents\s+(\d+)\s+\d+\s+R/) || body.match(/\/Contents\s*\[/);
    console.log(`  page obj ${num}: contents=${contents ? contents[0].slice(0, 50) : 'none'}`);
  }
}
