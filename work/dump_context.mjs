// Find every Tj/TJ in page 3's ORIGINAL content stream and print the
// current font, the operator type, and the actual string.
import fs from 'fs';
import zlib from 'zlib';

const text = fs.readFileSync('normalized.pdf', 'latin1');
const buf  = fs.readFileSync('normalized.pdf');

const objRe = /(\d+) (\d+) obj\b/g;
const objs = new Map();
let m;
while ((m = objRe.exec(text)) !== null) {
  objs.set(parseInt(m[1]), { start: m.index + m[0].length });
}
const o = objs.get(19);
const streamIdx = text.indexOf('stream', o.start);
const dictText = text.slice(o.start, streamIdx);
const lenMatch = dictText.match(/\/Length\s+(\d+)/);
let s = streamIdx + 'stream'.length;
if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
const data = buf.slice(s, s + parseInt(lenMatch[1]));
const content = /\/Filter\s+\/FlateDecode/.test(dictText) ? zlib.inflateSync(data) : data;

const stream = content.toString('latin1');
fs.writeFileSync('page3_orig.bin', content);
console.log('Length:', stream.length);

// Scan font usage and string ops.
// We do a tiny tokenizer: track current font from /name N Tf, find string operators
let curFont = null;
let i = 0;
const events = [];
while (i < stream.length) {
  const ch = stream[i];
  // Skip comments
  if (ch === '%') { while (i < stream.length && stream[i] !== '\n') i++; continue; }
  // Detect /<name> ... Tf
  if (ch === '/') {
    let j = i + 1;
    while (j < stream.length && /[A-Za-z0-9_]/.test(stream[j])) j++;
    const name = stream.slice(i+1, j);
    // Look ahead for "Tf"
    let k = j;
    // skip up to ~50 chars looking for Tf or other op
    let foundTf = false;
    let sav = stream.slice(j, j + 100);
    if (/^\s+[\-\d.]+\s+Tf\b/.test(sav)) {
      curFont = name;
      foundTf = true;
    }
    i = j;
    continue;
  }
  // Hex string
  if (ch === '<' && stream[i+1] !== '<') {
    const end = stream.indexOf('>', i);
    if (end < 0) { i++; continue; }
    const hex = stream.slice(i+1, end).replace(/\s+/g, '');
    // Look ahead for Tj/TJ (string may be inside array)
    let k = end + 1;
    while (k < stream.length && /\s/.test(stream[k])) k++;
    if (stream.substr(k, 2) === 'Tj' || stream.substr(k, 2) === 'TJ') {
      events.push({ kind: stream.substr(k,2), font: curFont, str: hex, type: 'hex' });
    }
    i = end + 1;
    continue;
  }
  // Parenthesized string
  if (ch === '(') {
    // Find matching ) accounting for escapes and nesting
    let depth = 1, j = i + 1;
    while (j < stream.length && depth > 0) {
      if (stream[j] === '\\') j += 2;
      else if (stream[j] === '(') { depth++; j++; }
      else if (stream[j] === ')') { depth--; j++; }
      else j++;
    }
    const raw = stream.slice(i+1, j-1);
    // Decode escapes — collect actual bytes
    const bytes = [];
    let p = 0;
    while (p < raw.length) {
      if (raw[p] === '\\') {
        const n = raw[p+1];
        if (n === 'n') { bytes.push(0x0a); p += 2; }
        else if (n === 'r') { bytes.push(0x0d); p += 2; }
        else if (n === 't') { bytes.push(0x09); p += 2; }
        else if (n === 'b') { bytes.push(0x08); p += 2; }
        else if (n === 'f') { bytes.push(0x0c); p += 2; }
        else if (n === '(' || n === ')' || n === '\\') { bytes.push(raw.charCodeAt(p+1)); p += 2; }
        else if (/[0-7]/.test(n)) {
          let oct = n;
          if (/[0-7]/.test(raw[p+2])) { oct += raw[p+2]; if (/[0-7]/.test(raw[p+3])) { oct += raw[p+3]; p += 4; } else { p += 3; } } else { p += 2; }
          bytes.push(parseInt(oct, 8));
        } else { bytes.push(raw.charCodeAt(p+1)); p += 2; }
      } else {
        bytes.push(raw.charCodeAt(p)); p++;
      }
    }
    let k = j;
    // Skip whitespace and numbers (kerning amounts in TJ)
    while (k < stream.length && /\s|\-|\d|\./.test(stream[k]) && !/\[/.test(stream[k])) k++;
    if (stream.substr(k, 2) === 'Tj' || stream.substr(k, 2) === 'TJ') {
      events.push({ kind: stream.substr(k,2), font: curFont, str: bytes.map(b=>b.toString(16).padStart(2,'0')).join(''), type: 'paren' });
    } else {
      // Probably inside a TJ array — defer search outside
      events.push({ kind: 'inArr', font: curFont, str: bytes.map(b=>b.toString(16).padStart(2,'0')).join(''), type: 'paren' });
    }
    i = j;
    continue;
  }
  i++;
}

// Show font usage stats
const byFont = {};
const parenByFont = {};
for (const e of events) {
  byFont[e.font] = (byFont[e.font] || 0) + 1;
  if (e.type === 'paren') parenByFont[e.font] = (parenByFont[e.font] || 0) + 1;
}
console.log('\nString op counts by font:', byFont);
console.log('Parenthesized-string counts by font:', parenByFont);

// Print first few events for /C2_* fonts
console.log('\nFirst 10 events for /C2_* fonts:');
let shown = 0;
for (const e of events) {
  if (!/^C2_/.test(e.font || '')) continue;
  console.log(`  ${e.font} (${e.type}) ${e.kind}: ${e.str.slice(0, 100)}`);
  shown++;
  if (shown >= 12) break;
}
