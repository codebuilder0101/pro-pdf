import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

function getStream(file, objNum) {
  const text = fs.readFileSync(file, 'latin1');
  const buf  = fs.readFileSync(file);
  const objRe = new RegExp('\b' + objNum + ' \d+ obj\b');
  const m = text.match(objRe);
  if (!m) return null;
  const start = m.index + m[0].length;
  const end = text.indexOf('endobj', start);
  const sIdx = text.indexOf('stream', start);
  if (sIdx < 0 || sIdx > end) return null;
  const dict = text.slice(start, sIdx);
  const lm = dict.match(/\/Length\s+(\d+)/);
  let s = sIdx + 'stream'.length;
  if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
  const data = buf.slice(s, s + parseInt(lm[1]));
  if (/\/Filter\s+\/FlateDecode/.test(dict)) return zlib.inflateSync(data);
  return data;
}

const sOrig = getStream('normalized.pdf', 19).toString('latin1');
const sNew  = getStream(path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf'), 19).toString('latin1');

// Search for "632.2" or "632.0" in both
const dateAreas = [];
function find(s, label) {
  console.log(`=== ${label} ===`);
  let idx = 0;
  let count = 0;
  while (count < 4) {
    const i = s.indexOf('632.', idx);
    if (i < 0) break;
    // print 600 char window from previous newline
    const prev = s.lastIndexOf('\n', i - 100);
    const after = s.indexOf('\n', i + 100);
    console.log('  --- around 632 #' + count + ' ---');
    console.log(s.slice(prev + 1, after).replace(/[\x00-\x08\x0b-\x1f]/g, ch=>'\x'+ch.charCodeAt(0).toString(16).padStart(2,'0')));
    idx = i + 5;
    count++;
  }
}
find(sOrig, 'ORIGINAL page 3');
console.log('\n');
find(sNew, 'REBUILT page 3');
