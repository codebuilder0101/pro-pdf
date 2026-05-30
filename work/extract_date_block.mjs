import fs from 'fs';
import zlib from 'zlib';
const text = fs.readFileSync('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf', 'latin1');
const buf = fs.readFileSync('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
// obj 19 = page 3 content
const idx = text.indexOf('\n19 0 obj');
const start = idx + 1 + '19 0 obj'.length;
const sIdx = text.indexOf('stream', start);
const dict = text.slice(start, sIdx);
const lm = dict.match(/\/Length\s+(\d+)/);
let s = sIdx + 'stream'.length;
if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
const data = buf.slice(s, s + parseInt(lm[1]));
const c = zlib.inflateSync(data).toString('latin1');

// The date "04/08/26" after collapse = bytes 0x13 0x17 0x12 0x13 0x18 0x12 0x15 0x19
// As hex in content: <1317121318121519>
const dateHex = '1317121318121519';
const i = c.indexOf(dateHex);
console.log('date hex at', i);
if (i >= 0) {
  // Find enclosing BT...ET
  const bt = c.lastIndexOf('BT', i);
  const et = c.indexOf('ET', i);
  console.log('=== BT block containing date ===');
  console.log(c.slice(bt, et + 2));
}
// Also find the WIRE TYPE description block (row 1 desc that was CLEAN vs row 2 that was MANGLED)
// Row 1 desc starts with W=0x3A I=0x2C R=0x35 E=0x28: <3A2C3528>
console.log('\n\n=== First few WIRE blocks ===');
let pos = 0, cnt = 0;
while (cnt < 3) {
  const j = c.indexOf('3A2C3528', pos);
  if (j < 0) break;
  const bt = c.lastIndexOf('BT', j);
  const et = c.indexOf('ET', j);
  console.log('--- WIRE block', cnt, '---');
  console.log(c.slice(bt, Math.min(et + 2, bt + 400)));
  pos = j + 8;
  cnt++;
}
