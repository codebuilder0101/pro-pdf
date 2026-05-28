import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
function getStream(file, objNum) {
  const text = fs.readFileSync(file, 'latin1');
  const buf  = fs.readFileSync(file);
  const re = new RegExp('\b' + objNum + ' \d+ obj\b');
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
// Page 3 = obj 18, contents = obj 19
const sNew = getStream(newPdf, 19).toString('latin1');
const idx = sNew.indexOf('/C2_2');
console.log('NEW len:', sNew.length, '/C2_2 at', idx);
if (idx >= 0) console.log(sNew.slice(idx, idx + 1500));
