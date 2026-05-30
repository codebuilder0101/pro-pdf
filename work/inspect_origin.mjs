// Inspect origin.pdf — list pages, all fonts with their attributes.
import fs from 'fs';
import zlib from 'zlib';

const path = 'origin_normalized.pdf';
const buf = fs.readFileSync(path);
const text = buf.toString('latin1');

// Parse all objects
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

// List fonts with their type + descriptor info
console.log('\n=== ALL FONT DICTS ===');
const fontRows = new Map(); // key -> count
for (const [num, o] of objs) {
  const body = o.body;
  if (!/\/Type\s*\/Font\b/.test(body)) continue;
  const sub = (body.match(/\/Subtype\s*\/(\w+)/) || [])[1] || '?';
  const bf  = (body.match(/\/BaseFont\s*\/([\w+,.\-]+)/) || [])[1] || '?';
  const enc = (body.match(/\/Encoding\s*\/(\w+)/)) ? body.match(/\/Encoding\s*\/(\w+)/)[1] :
              /\/Encoding\s*<<[\s\S]*?\/Differences/.test(body) ? 'Custom(inline)' :
              /\/Encoding\s+\d+\s+0\s+R/.test(body) ? 'Custom(ref)' : '—';
  const fd  = (body.match(/\/FontDescriptor\s+(\d+)\s+0\s+R/) || [])[1] || '—';
  const dfont = (body.match(/\/DescendantFonts\s*\[\s*(\d+)\s+0\s+R/) || [])[1] || '—';
  const key = `${sub.padEnd(8)} ${bf.padEnd(50)} enc=${enc.padEnd(20)} FD=${fd.padEnd(4)} CID=${dfont}`;
  fontRows.set(key, (fontRows.get(key)||0) + 1);
  console.log(`  obj ${num.toString().padStart(4)}  ${key}`);
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

// Unique Acrobat-display rows
console.log('\n=== Acrobat-style unique rows ===');
const acroRows = new Map();
for (const [num, o] of objs) {
  const body = o.body;
  if (!/\/Type\s*\/Font\b/.test(body)) continue;
  const sub = (body.match(/\/Subtype\s*\/(\w+)/) || [])[1] || '?';
  const bf  = (body.match(/\/BaseFont\s*\/([\w+,.\-]+)/) || [])[1] || '?';
  let encDisplay;
  if (/\/Encoding\s*\/(\w+Encoding)/.test(body)) encDisplay = body.match(/\/Encoding\s*\/(\w+Encoding)/)[1];
  else if (/\/Encoding\s*\/Identity-H/.test(body)) encDisplay = 'Identity-H';
  else if (/\/Encoding\s+\d+\s+0\s+R/.test(body)) encDisplay = 'Custom';
  else if (/\/Encoding\s*<<[\s\S]*?\/Differences/.test(body)) encDisplay = 'Custom';
  else encDisplay = '—';
  const k = `${bf}  [${encDisplay}]  ${sub}`;
  acroRows.set(k, (acroRows.get(k)||0)+1);
}
[...acroRows.entries()].sort().forEach(([k,c]) => console.log(`  ${k}  (×${c} dict${c>1?'s':''})`));
console.log(`Total unique rows: ${acroRows.size}`);
console.log(`Connections-family unique rows: ${[...acroRows.keys()].filter(k => /Connections/i.test(k)).length}`);
