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

const sNew = getStream(path.resolve('../asset/BANK-p3-Type1.pdf'), 3).toString('latin1');
const sOrig = getStream('bank_p3_original.pdf', 3).toString('latin1');
console.log('NEW len:', sNew.length, 'ORIG len:', sOrig.length);

const idxN = sNew.indexOf('/C2_2');
const idxO = sOrig.indexOf('/C2_2');
console.log('/C2_2 NEW at', idxN, '  ORIG at', idxO);

if (idxN >= 0) {
  console.log('\n--- NEW around C2_2 (1500 chars) ---');
  console.log(sNew.slice(idxN, idxN + 1500));
}
if (idxO >= 0) {
  console.log('\n--- ORIG around C2_2 (1500 chars) ---');
  console.log(sOrig.slice(idxO, idxO + 1500));
}
