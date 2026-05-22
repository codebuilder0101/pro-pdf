import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
function getStream(file, objNum) {
  const text = fs.readFileSync(file, 'latin1');
  const buf  = fs.readFileSync(file);
  const re = new RegExp('\\b' + objNum + ' \\d+ obj\\b');
  const m = text.match(re);
  if (!m) return null;
  const start = m.index + m[0].length;
  const sIdx = text.indexOf('stream', start);
  const dict = text.slice(start, sIdx);
  const lm = dict.match(/\/Length\s+(\d+)/);
  let s = sIdx + 'stream'.length;
  if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
  const data = buf.slice(s, s + parseInt(lm[1]));
  return /\/Filter\s+\/FlateDecode/.test(dict) ? zlib.inflateSync(data) : data;
}
const newPdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const sOrig = getStream('normalized.pdf', 33).toString('latin1');
const sNew  = getStream(newPdf, 33).toString('latin1');
console.log('orig len:', sOrig.length, 'new len:', sNew.length);
console.log('streams match:', sOrig === sNew);
// Print byte ranges around 690 mentions
const re = /690\.5|690\.0|690\b|640\.1|640\.0|664\.9|664\.3|639\.1/g;
let m;
console.log('\nORIGINAL "y around 690":');
const matches = [...sOrig.matchAll(re)].slice(0, 6);
for (const m of matches) console.log('  at', m.index, ':', sOrig.slice(Math.max(0, m.index - 80), m.index + 200));
