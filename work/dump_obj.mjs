// Dump specific objects to see exact format
import fs from 'fs';
const text = fs.readFileSync('normalized.pdf', 'latin1');

const objRe = /(\d+) (\d+) obj\b/g;
const objs = new Map();
let m;
while ((m = objRe.exec(text)) !== null) {
  const num = parseInt(m[1]);
  const start = m.index + m[0].length;
  const end = text.indexOf('endobj', start);
  if (end < 0) continue;
  objs.set(num, text.slice(start, end));
}

for (const num of [1, 8, 18, 126]) {
  console.log(`\n=== Object ${num} ===`);
  const b = objs.get(num);
  if (!b) { console.log('NOT FOUND'); continue; }
  console.log(b.slice(0, 800));
}
