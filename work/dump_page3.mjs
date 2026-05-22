// Dump page 3's content stream (original and rewritten) to diagnose
import fs from 'fs';
import zlib from 'zlib';

const text = fs.readFileSync('normalized.pdf', 'latin1');
const buf = fs.readFileSync('normalized.pdf');

// Object 19 is page 3's content
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
console.log('Page 3 original content stream length:', orig.length);

// Find a couple of /C2_0, /C2_1, /C2_2, /C2_3 Tj sections
let count = 0;
const re = /\/(C2_\d+)\s+[\-\d.]+\s+Tf[\s\S]*?<([0-9A-Fa-f]+)>\s*Tj/g;
let mm;
while ((mm = re.exec(orig)) !== null && count < 10) {
  const font = mm[1], hex = mm[2];
  const len = hex.length;
  // Decode as 2-byte CIDs
  const cids = [];
  for (let i = 0; i + 4 <= len; i += 4) cids.push(parseInt(hex.substr(i, 4), 16));
  console.log(`  /${font} <${hex}> (len=${len}): cids = ${cids.map(c=>c.toString(16).padStart(4,'0')).join(' ')}`);
  count++;
}

console.log('\nLook for TJ ops with /G1 (which would use C2_*):');
const tjRe = /\/(C2_\d+)\s+[\-\d.]+\s+Tf[\s\S]{0,200}?\[([^\]]+)\]\s*TJ/g;
count = 0;
while ((mm = tjRe.exec(orig)) !== null && count < 5) {
  console.log(`  /${mm[1]} [...${mm[2].slice(0,200)}...] TJ`);
  count++;
}
