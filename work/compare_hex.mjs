import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
function getStream(file, objNum) {
  const text = fs.readFileSync(file, 'latin1');
  const buf  = fs.readFileSync(file);
  const re = new RegExp('\\b' + objNum + ' \\d+ obj\\b');
  const m = text.match(re);
  const start = m.index + m[0].length;
  const sIdx = text.indexOf('stream', start);
  const dict = text.slice(start, sIdx);
  const lm = dict.match(/\/Length\s+(\d+)/);
  let s = sIdx + 'stream'.length;
  if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
  const data = buf.slice(s, s + parseInt(lm[1]));
  return /\/Filter\s+\/FlateDecode/.test(dict) ? zlib.inflateSync(data) : data;
}
const sOrig = getStream('normalized.pdf', 33).toString('latin1');
const sNew  = getStream(path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf'), 33).toString('latin1');

const reHex = /<([0-9A-Fa-f\s]+)>/g;
const oHex = [...sOrig.matchAll(reHex)].map(m => ({ raw: m[1].replace(/\s+/g, ''), pos: m.index }));
const nHex = [...sNew.matchAll(reHex)].map(m => ({ raw: m[1].replace(/\s+/g, ''), pos: m.index }));
console.log('Orig hex strings:', oHex.length);
console.log('New hex strings:', nHex.length);
console.log();
const n = Math.min(oHex.length, nHex.length);
for (let i = 0; i < n; i++) {
  const o = oHex[i].raw, b = nHex[i].raw;
  let label = '';
  if (b.length === o.length) label = 'UNCHANGED';
  else if (b.length === o.length / 2) {
    // verify each pair maps
    let ok = true;
    for (let j = 0; j < o.length; j += 4) {
      if (o.substr(j, 2) !== '00' || o.substr(j+2, 2) !== b.substr(j/2, 2)) { ok = false; break; }
    }
    label = ok ? 'COLLAPSED' : 'MISMATCH';
  } else label = 'WEIRD';
  console.log(`[${i}] orig=${o.length}c new=${b.length}c ${label}`);
  if (label !== 'COLLAPSED' && label !== 'UNCHANGED') {
    console.log('  orig:', o.slice(0, 80));
    console.log('  new :', b.slice(0, 80));
  }
}
