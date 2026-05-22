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
// Page 4 is page object 32 with content 33
const sNew = getStream(newPdf, 33).toString('latin1');
console.log('Page 4 content stream length:', sNew.length);

// Find "04/08/26": GIDs 0x13 0x17 0x12 0x13 0x18 0x12 0x15 0x19
// Hex string after my conversion: "1317121318121519"
const dateHex = '1317121318121519';
const idx = sNew.indexOf('<' + dateHex);
console.log('Found <date> at offset:', idx);
if (idx >= 0) console.log(sNew.slice(Math.max(0, idx - 200), idx + 300));

// Search ORIGINAL too
const sOrig = getStream('normalized.pdf', 33).toString('latin1');
const idx2 = sOrig.indexOf('00130017001200130018001200150019');
console.log('\nFound original date hex at offset:', idx2);
if (idx2 >= 0) console.log(sOrig.slice(Math.max(0, idx2 - 200), idx2 + 200));
