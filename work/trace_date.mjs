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
const c = getObj(101); // page 3 content

// Tokenize, tracking current font; collect Tj/TJ with their font and string bytes.
// Find a date-like sequence (digits and slash).
// Decode a paren string into bytes
function decodeParen(body) {
  const bytes = [];
  let p = 0;
  while (p < body.length) {
    if (body[p] === '\\') {
      const n = body[p+1];
      if (/[0-7]/.test(n)) {
        let oct = n; p += 2;
        if (p < body.length && /[0-7]/.test(body[p])) { oct += body[p]; p++; }
        if (oct.length < 3 && p < body.length && /[0-7]/.test(body[p])) { oct += body[p]; p++; }
        bytes.push(parseInt(oct, 8) & 0xff);
      } else if (n === 'n') { bytes.push(10); p+=2; }
      else if (n === 'r') { bytes.push(13); p+=2; }
      else if (n === 't') { bytes.push(9); p+=2; }
      else { bytes.push(body.charCodeAt(p+1)); p += 2; }
    } else { bytes.push(body.charCodeAt(p)); p++; }
  }
  return bytes;
}

// Walk, find /C2_ or /T1_ Tf, then strings
const tfRe = /\/([A-Za-z][\w]*)\s+[\d.]+\s+Tf/g;
let curFont = null;
let lastIdx = 0;
const events = [];
// Simple linear scan
let i = 0;
function readToken() {}
// Instead, find all Tf and string positions
const tfs = [...c.matchAll(/\/([A-Za-z][\w]*)\s+[\d.]+\s+Tf/g)].map(m => ({pos:m.index, font:m[1]}));
function fontAt(pos) {
  let f = null;
  for (const t of tfs) { if (t.pos <= pos) f = t.font; else break; }
  return f;
}
// Find all parenthesized strings followed by Tj
const strRe = /\(((?:\\.|[^()\\])*)\)\s*Tj/g;
let m;
let count = 0;
while ((m = strRe.exec(c)) !== null && count < 60) {
  const font = fontAt(m.index);
  if (!/^C2_/.test(font || '')) continue;  // only C2 fonts
  const bytes = decodeParen(m[1]);
  // decode as 2-byte CIDs
  let decoded = '';
  for (let k = 0; k+1 < bytes.length; k += 2) {
    const cid = (bytes[k]<<8)|bytes[k+1];
    decoded += cid.toString(16).padStart(4,'0') + ' ';
  }
  console.log(font, ':', decoded.slice(0, 80));
  count++;
}
