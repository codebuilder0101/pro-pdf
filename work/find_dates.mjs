import fs from 'fs';
import zlib from 'zlib';
const text = fs.readFileSync('bank_all_grafted.pdf', 'latin1');
const buf = fs.readFileSync('bank_all_grafted.pdf');
function getObj(num) {
  const re = new RegExp('\\b' + num + ' 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n');
  const m = text.match(re);
  if (!m) return null;
  const dict = m[1];
  const lenM = dict.match(/\/Length\s+(\d+)/);
  let s = m.index + m[0].length;
  let data = buf.slice(s, s + parseInt(lenM[1]));
  return /FlateDecode/.test(dict) ? zlib.inflateSync(data).toString('latin1') : data.toString('latin1');
}
// Find the page 3 content stream. Page 3 is the 3rd page. Let me find all page objects.
const pageObjs = [];
const re2 = /(\d+) 0 obj\s*<<([\s\S]*?)>>/g;
let m;
while ((m = re2.exec(text)) !== null) {
  if (/\/Type\s*\/Page\b/.test(m[2]) && !/\/Type\s*\/Pages\b/.test(m[2])) {
    const cm = m[2].match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    pageObjs.push({ page: m[1], contents: cm ? cm[1] : null });
  }
}
console.log('Pages:', pageObjs.map(p => `${p.page}->c${p.contents}`).join(' '));
// Page 3 = pageObjs[2]
const c = getObj(pageObjs[2].contents);
if (c) {
  // Find date '04/08/26' hex = 00130017001200130018001200150019
  const dateHex = '00130017001200130018001200150019';
  const i = c.indexOf(dateHex);
  console.log('Date 04/08/26 hex at offset', i, 'in content obj', pageObjs[2].contents);
  if (i >= 0) {
    // Find preceding BT and Tf
    const bt = c.lastIndexOf('BT', i);
    const sect = c.slice(bt, i + dateHex.length + 10);
    const safe = sect.replace(/[\x00-\x1f]/g, ch => '\\x' + ch.charCodeAt(0).toString(16).padStart(2,'0'));
    console.log(safe);
  } else {
    // Maybe parens. Search for WIRE = octal escapes
    console.log('Hex not found. Content sample:');
    console.log(c.slice(0, 300).replace(/[\x00-\x1f]/g, ch => '\\x' + ch.charCodeAt(0).toString(16).padStart(2,'0')));
  }
}
