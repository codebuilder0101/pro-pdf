import fs from 'fs';
const text = fs.readFileSync('normalized.pdf', 'latin1');
const buf = fs.readFileSync('normalized.pdf');
const idx = text.indexOf('\n19 0 obj');
const start = idx + 1 + '19 0 obj'.length;
const sIdx = text.indexOf('stream', start);
const dict = text.slice(start, sIdx);
const lm = dict.match(/\/Length\s+(\d+)/);
let s = sIdx + 'stream'.length;
if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
const c = buf.slice(s, s + parseInt(lm[1])).toString('latin1');
console.log('Content length:', c.length);
const m = c.match(/\/C2_2/);
console.log('/C2_2 at offset', m ? m.index : -1);
if (m) {
  const sect = c.slice(m.index, m.index + 1500);
  const safe = sect.replace(/[\x00-\x08\x0b-\x1f]/g, ch => '\\x' + ch.charCodeAt(0).toString(16).padStart(2,'0'));
  console.log(safe);
}
