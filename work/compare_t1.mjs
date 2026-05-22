// Compare a Type 1 (T1_*) font stream in normalized.pdf vs the rebuilt PDF
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function parseObjs(file) {
  const text = fs.readFileSync(file, 'latin1');
  const buf = fs.readFileSync(file);
  const objRe = /(\d+) (\d+) obj\b/g;
  const objs = new Map();
  let m;
  while ((m = objRe.exec(text)) !== null) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endobj', start);
    const body = text.slice(start, end);
    const sIdx = text.indexOf('stream', start);
    let dict, sData = null;
    if (sIdx >= 0 && sIdx < end) {
      dict = text.slice(start, sIdx);
      const lm = dict.match(/\/Length\s+(\d+)/);
      if (lm) {
        let s = sIdx + 'stream'.length;
        if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
        sData = buf.slice(s, s + parseInt(lm[1]));
      }
    } else dict = body;
    objs.set(parseInt(m[1]), { num: parseInt(m[1]), dict, sData, body });
  }
  return objs;
}

const origObjs = parseObjs('normalized.pdf');
const newObjs  = parseObjs(path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf'));

// Look at a few font program streams (FontFile3 referenced from non-Connections Type 1 fonts)
// Find Type 1 font descriptors that aren't object 168
const t1Descriptors = [];
for (const [num, o] of origObjs) {
  if (/\/Type\s*\/FontDescriptor\b/.test(o.body)) {
    const ffm = o.body.match(/\/FontFile3\s+(\d+)/);
    const name = (o.body.match(/\/FontName\s*\/([\w+,\-\.]+)/) || [])[1];
    if (ffm && num !== 168) t1Descriptors.push({ num, fname: name, ff3: parseInt(ffm[1]) });
  }
}
console.log('Type 1 descriptors (not 168) and their FontFile3 stream sizes:');
for (const d of t1Descriptors.slice(0, 8)) {
  const oOrig = origObjs.get(d.ff3);
  const oNew  = newObjs.get(d.ff3);
  if (!oOrig || !oNew) { console.log(`  ${d.fname}: stream ${d.ff3} missing in one`); continue; }
  const origLen = oOrig.sData ? oOrig.sData.length : 0;
  const newLen = oNew.sData ? oNew.sData.length : 0;
  const origInflated = /\/Filter\s+\/FlateDecode/.test(oOrig.dict) ? zlib.inflateSync(oOrig.sData) : oOrig.sData;
  let newInflated = null;
  try { newInflated = /\/Filter\s+\/FlateDecode/.test(oNew.dict) ? zlib.inflateSync(oNew.sData) : oNew.sData; } catch (e) { newInflated = null; }
  const sameContent = newInflated && Buffer.compare(origInflated, newInflated) === 0;
  console.log(`  ${d.fname}: orig=${origInflated.length}b new=${newInflated ? newInflated.length : 'ERR'}b ${sameContent ? '✓ identical' : '✗ DIFFERENT'}`);
  console.log(`    orig dict: ${oOrig.dict.trim().slice(0,200)}`);
  console.log(`    new dict:  ${oNew.dict.trim().slice(0,200)}`);
}
