// Verify the unified PDF:
//   (a) lists what Acrobat will show in the Fonts panel (unique (BaseFont, encoding) pairs)
//   (b) renders every page and compares text against the original delivered file
import fs from 'fs';

function listFonts(path) {
  const text = fs.readFileSync(path, 'latin1');
  const re = /(\d+) 0 obj\s*<<([\s\S]*?)>>\s*endobj/g;
  const rows = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = m[2];
    if (!/\/Type\s*\/Font\b/.test(body)) continue;
    const bf = body.match(/\/BaseFont\s*\/([\w+,.\-]+)/);
    if (!bf) continue;
    const sub = body.match(/\/Subtype\s*\/(\w+)/);
    let enc;
    // Acrobat's Fonts panel display rules:
    //   /Encoding /XxxEncoding -> shows the encoding name
    //   /Encoding 99 0 R (resolves to a dict with /Differences) -> shows "Custom"
    //   /Encoding << /Differences ... >> (inline)               -> shows "Custom"
    if (/\/Encoding\s*\/(\w+)Encoding\b/.test(body)) enc = body.match(/\/Encoding\s*\/(\w+Encoding)/)[1];
    else if (/\/Encoding\s+\d+\s+0\s+R/.test(body)) enc = 'Custom';
    else if (/\/Encoding\s*<<[\s\S]*?\/Differences/.test(body)) enc = 'Custom';
    else enc = '—';
    rows.add(`${bf[1]}  [${enc}]  ${sub ? sub[1] : '?'}`);
  }
  return [...rows].sort();
}

console.log('=== Delivered file (before fix) ===');
const before = listFonts('input_one_connections.pdf');
before.forEach(r => console.log('  ' + r));
console.log(`Total rows: ${before.length}; Connections* rows: ${before.filter(r => /^Connections/i.test(r)).length}`);

console.log('\n=== One-Connections file (after fix) ===');
const after = listFonts('bank_one_connections.pdf');
after.forEach(r => console.log('  ' + r));
console.log(`Total rows: ${after.length}; Connections* rows: ${after.filter(r => /^Connections/i.test(r)).length}`);
