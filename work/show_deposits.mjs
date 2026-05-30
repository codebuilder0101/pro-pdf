import fs from 'fs';
import zlib from 'zlib';
const text = fs.readFileSync('bank_all_clean.pdf', 'latin1');
const buf = fs.readFileSync('bank_all_clean.pdf');
function getObj(num) {
  const re = new RegExp(num + ' 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n');
  const m = text.match(re);
  const dict = m[1];
  const lenM = dict.match(/\/Length\s+(\d+)/);
  let s = m.index + m[0].length;
  let data = buf.slice(s, s + parseInt(lenM[1]));
  return /FlateDecode/.test(dict) ? zlib.inflateSync(data).toString('latin1') : data.toString('latin1');
}
const c = getObj(306);
const i = c.indexOf('/C2_');
const sect = c.slice(i, i + 900);
const safe = sect.replace(/[\x00-\x08\x0b-\x1f]/g, ch => '\\x' + ch.charCodeAt(0).toString(16).padStart(2,'0'));
console.log(safe);
