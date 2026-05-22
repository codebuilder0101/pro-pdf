import fs from 'fs';
const s = fs.readFileSync('page3_orig.bin', 'latin1');
const re = /\(([^()\\]{1,20})\)\s*Tj/g;
let m, count = 0;
while ((m = re.exec(s)) !== null && count < 30) {
  const back = s.slice(Math.max(0, m.index - 80), m.index);
  console.log('  parens: ' + JSON.stringify(m[1]) + '  context-back: ' + back.replace(/\n/g, '|'));
  count++;
}
