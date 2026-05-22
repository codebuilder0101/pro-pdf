import fs from 'fs';
import path from 'path';
const text = fs.readFileSync(path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf'), 'latin1');
const objRe = /(\d+) (\d+) obj\b/g;
let m;
while ((m = objRe.exec(text)) !== null) {
  if (parseInt(m[1]) === 95) {
    const start = m.index + m[0].length;
    const end = text.indexOf('endobj', start);
    console.log(text.slice(start, end).slice(0, 2000));
    break;
  }
}
