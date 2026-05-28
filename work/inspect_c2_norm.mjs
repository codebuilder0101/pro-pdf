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

const re = /\/C2_(\d+)\s+([\d.]+)\s+Tf([\s\S]{0,500})/g;
let m;
let count = 0;
while ((m = re.exec(c)) !== null && count < 3) {
  console.log('--- /C2_' + m[1] + ' ' + m[2] + ' Tf ---');
  const safe = m[3].slice(0, 400).replace(/[\x00-\x08\x0b-\x1f]/g, ch => '\\x' + ch.charCodeAt(0).toString(16).padStart(2,'0'));
  console.log(safe);
  count++;
}
