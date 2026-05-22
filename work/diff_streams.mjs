// Diff page 3's content stream byte-by-byte between original and rebuilt
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function getStream(file, objNum) {
  const text = fs.readFileSync(file, 'latin1');
  const buf  = fs.readFileSync(file);
  const objRe = new RegExp('\\b' + objNum + ' \\d+ obj\\b');
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

const orig = getStream('normalized.pdf', 19);
const newP = getStream(path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf'), 19);
console.log('orig len:', orig.length, 'new len:', newP.length);

// Strategy: walk through original, find each /C2_* ... <hex> ... and look for matching position in new.
// Easier: track the LCS or use a moving alignment.
// For now: find the FIRST and LAST difference.
const minLen = Math.min(orig.length, newP.length);
let firstDiff = -1;
for (let i = 0; i < minLen; i++) if (orig[i] !== newP[i]) { firstDiff = i; break; }
console.log('first diff at orig index:', firstDiff);
if (firstDiff >= 0) {
  const ctx = 200;
  console.log('  ORIG context:', orig.slice(Math.max(0, firstDiff-100), firstDiff+ctx).toString('latin1').replace(/[\x00-\x08\x0b-\x1f]/g, ch=>'\\x'+ch.charCodeAt(0).toString(16).padStart(2,'0')));
  console.log('   NEW context:', newP.slice(Math.max(0, firstDiff-100), firstDiff+ctx).toString('latin1').replace(/[\x00-\x08\x0b-\x1f]/g, ch=>'\\x'+ch.charCodeAt(0).toString(16).padStart(2,'0')));
}

// Look for /T1_2 ... text segments in both. Are the (parenthesized strings) for /T1_2 different?
const sOrig = orig.toString('latin1');
const sNew  = newP.toString('latin1');

// Search /T1_2 ... Tf, then look at next 200 chars
function findFirstT1(s) {
  const m = s.match(/\/T1_2\s+[\-\d.]+\s+Tf/);
  if (!m) return null;
  return { idx: m.index, len: m[0].length };
}
const o1 = findFirstT1(sOrig);
const n1 = findFirstT1(sNew);
console.log('\nFirst /T1_2 in ORIG at', o1?.idx, 'in NEW at', n1?.idx);
if (o1) console.log('  ORIG:', sOrig.slice(o1.idx, o1.idx + 300));
if (n1) console.log('   NEW:', sNew.slice(n1.idx, n1.idx + 300));
