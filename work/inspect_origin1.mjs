// Inspect normalized origin1.pdf
import fs from 'fs';

const path = 'origin1_normalized.pdf';
const text = fs.readFileSync(path, 'latin1');

const objRe = /(\d+) 0 obj\s*([\s\S]*?)\s*endobj/g;
const objs = new Map();
let m;
while ((m = objRe.exec(text)) !== null) {
  objs.set(parseInt(m[1]), { start: m.index, body: m[2] });
}
console.log('Objects:', objs.size);

// Pages count
const pageObjs = [];
for (const [num, o] of objs) {
  if (/\/Type\s*\/Page\b/.test(o.body) && !/\/Type\s*\/Pages\b/.test(o.body)) pageObjs.push(num);
}
console.log('Pages:', pageObjs.length);

// All font dicts
console.log('\n=== ALL FONT DICTS ===');
for (const [num, o] of objs) {
  const body = o.body;
  if (!/\/Type\s*\/Font\b/.test(body)) continue;
  const sub = (body.match(/\/Subtype\s*\/(\w+)/) || [])[1] || '?';
  const bf  = (body.match(/\/BaseFont\s*\/([\w+,.\-]+)/) || [])[1] || '?';
  const enc = (body.match(/\/Encoding\s*\/(\w+(?:-\w+)?)/)) ? body.match(/\/Encoding\s*\/(\w+(?:-\w+)?)/)[1] :
              /\/Encoding\s*<<[\s\S]*?\/Differences/.test(body) ? 'Custom(inline)' :
              /\/Encoding\s+\d+\s+0\s+R/.test(body) ? 'Custom(ref)' : '—';
  const fd  = (body.match(/\/FontDescriptor\s+(\d+)\s+0\s+R/) || [])[1] || '—';
  const dfont = (body.match(/\/DescendantFonts\s*\[\s*(\d+)\s+0\s+R/) || [])[1] || '—';
  console.log(`  obj ${num.toString().padStart(4)}  ${sub.padEnd(13)} ${bf.padEnd(50)} enc=${enc.padEnd(20)} FD=${fd.padEnd(4)} desc=${dfont}`);
}

// FontDescriptors -> FontFile info
console.log('\n=== FONT DESCRIPTORS ===');
for (const [num, o] of objs) {
  if (!/\/Type\s*\/FontDescriptor/.test(o.body)) continue;
  const fn = (o.body.match(/\/FontName\s*\/([\w+,.\-]+)/) || [])[1] || '?';
  const ff = (o.body.match(/\/FontFile(\d?)\s+(\d+)\s+0\s+R/) || []);
  const ffType = ff[1] ? `FontFile${ff[1]}` : (ff[0] ? 'FontFile' : '—');
  const ffObj = ff[2] || '—';
  console.log(`  obj ${num}  FontName=/${fn}  ${ffType}=${ffObj}`);
}

// Unique Acrobat-style rows
console.log('\n=== Acrobat-style unique rows ===');
const rows = new Map();
for (const [num, o] of objs) {
  const body = o.body;
  if (!/\/Type\s*\/Font\b/.test(body)) continue;
  const sub = (body.match(/\/Subtype\s*\/(\w+)/) || [])[1] || '?';
  if (sub === 'CIDFontType2' || sub === 'CIDFontType0') continue;
  const bf  = (body.match(/\/BaseFont\s*\/([\w+,.\-]+)/) || [])[1] || '?';
  let enc;
  if (/\/Encoding\s*\/Identity-H\b/.test(body)) enc = 'Identity-H';
  else if (/\/Encoding\s*\/MacRomanEncoding\b/.test(body)) enc = 'Roman';
  else if (/\/Encoding\s*\/WinAnsiEncoding\b/.test(body)) enc = 'Ansi';
  else if (/\/Encoding\s+\d+\s+0\s+R/.test(body)) enc = 'Custom';
  else if (/\/Encoding\s*<<[\s\S]*?\/Differences/.test(body)) enc = 'Custom';
  else enc = '—';
  let type = sub;
  if (sub === 'Type0') type = 'TrueType (CID)'; // assume CIDFontType2 descendant — will check
  if (sub === 'Type1') type = 'Type 1';
  const k = `${bf}  [${enc}]  ${type}`;
  rows.set(k, (rows.get(k)||0)+1);
}
[...rows.entries()].sort().forEach(([k,c]) => console.log(`  ${k}  (×${c} dict${c>1?'s':''})`));
console.log(`Total unique rows: ${rows.size}`);
