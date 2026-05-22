// Dump page 3's content stream from the REBUILT PDF
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';

const pdf = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const text = fs.readFileSync(pdf, 'latin1');
const buf = fs.readFileSync(pdf);

const objRe = /(\d+) (\d+) obj\b/g;
const objs = new Map();
let m;
while ((m = objRe.exec(text)) !== null) {
  objs.set(parseInt(m[1]), { start: m.index + m[0].length, num: parseInt(m[1]) });
}
const o = objs.get(19);
const streamIdx = text.indexOf('stream', o.start);
const dictText = text.slice(o.start, streamIdx);
const lenMatch = dictText.match(/\/Length\s+(\d+)/);
let s = streamIdx + 'stream'.length;
if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
const data = buf.slice(s, s + parseInt(lenMatch[1]));
let content = data;
if (/\/Filter\s+\/FlateDecode/.test(dictText)) content = zlib.inflateSync(data);

const orig = content.toString('latin1');
console.log('REBUILT Page 3 content stream length:', orig.length);

// Find /C2_0 .. /C2_3 Tj entries
const re = /\/(C2_\d+)\s+[\-\d.]+\s+Tf[\s\S]*?<([0-9A-Fa-f]+)>\s*Tj/g;
let count = 0;
let mm;
while ((mm = re.exec(orig)) !== null && count < 10) {
  console.log(`  /${mm[1]} <${mm[2]}>`);
  count++;
}

// Also look for TJ operators (with arrays)
console.log('\nLooking for TJ operators with /C2_*:');
const tjRe = /\/(C2_\d+)\s+[\-\d.]+\s+Tf[\s\S]{0,2000}?\[([^\]]+)\]\s*TJ/g;
count = 0;
while ((mm = tjRe.exec(orig)) !== null && count < 5) {
  console.log(`  /${mm[1]}:`);
  console.log(`    ${mm[2].slice(0, 200)}`);
  count++;
}

// Also find any 4-hex-digit groups remaining that should have been collapsed
console.log('\nRemaining 4-hex-digit hex strings near C2_*:');
const remRe = /\/C2_\d+\s+[\-\d.]+\s+Tf[\s\S]{0,200}?<((?:[0-9A-Fa-f]{2}){2,})>/g;
count = 0;
while ((mm = remRe.exec(orig)) !== null && count < 5) {
  const h = mm[1];
  // Check if any "00" high bytes appear at even positions
  console.log(`  hex="${h}" (len ${h.length})`);
  count++;
}
