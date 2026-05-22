// Decompress the page content stream(s) and see how each font is used
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const pdfPath = path.resolve('../DUMMY.pdf');
const buf = fs.readFileSync(pdfPath);
const text = buf.toString('latin1');

// Parse objects
const objRe = /(\d+) (\d+) obj\b/g;
const objs = new Map();
let m;
while ((m = objRe.exec(text)) !== null) {
  const num = parseInt(m[1]);
  const start = m.index;
  // Find endobj
  const end = text.indexOf('endobj', start);
  objs.set(num, { start, end, dictText: text.slice(m.index + m[0].length, end) });
}

// Object 3 is the content stream
function getStream(objNum) {
  const o = objs.get(objNum);
  if (!o) return null;
  // Find stream
  const streamIdx = buf.indexOf(Buffer.from('stream'), o.start);
  const endstreamIdx = buf.indexOf(Buffer.from('endstream'), streamIdx);
  if (streamIdx < 0 || endstreamIdx < 0) return null;
  // Get length
  const lenMatch = o.dictText.match(/\/Length\s+(\d+)/);
  const filterMatch = o.dictText.match(/\/Filter\s+\/(\w+)/);
  if (!lenMatch) return null;
  let dataStart = streamIdx + 'stream'.length;
  if (buf[dataStart] === 0x0d) dataStart++;
  if (buf[dataStart] === 0x0a) dataStart++;
  const data = buf.slice(dataStart, dataStart + parseInt(lenMatch[1]));
  if (filterMatch && filterMatch[1] === 'FlateDecode') {
    return zlib.inflateSync(data);
  }
  return data;
}

const content = getStream(3);
console.log('Content stream length:', content.length);

// Save for inspection
fs.writeFileSync('content_stream.txt', content);

// Look for /G1 usage (the Type0 Connections font reference)
const txt = content.toString('latin1');
const lines = txt.split('\n');
let inText = false;
let currentFont = null;
const fontUsage = {};

// Simple scan
const fontPattern = /\/([A-Z][\w]*)\s+([\-\d.]+)\s+Tf/g;
const matches = [...txt.matchAll(fontPattern)];
console.log(`\nFont operations (/<name> <size> Tf) — total ${matches.length}:`);
for (const mm of matches) {
  const name = mm[1], size = mm[2];
  fontUsage[name] = (fontUsage[name] || 0) + 1;
}
console.log(fontUsage);

// Find lines that contain /G1
console.log('\nLines mentioning /G1:');
const idx = txt.indexOf('/G1');
if (idx >= 0) {
  // Print 300 chars around each occurrence
  let pos = 0;
  while (true) {
    const i = txt.indexOf('/G1 ', pos);
    if (i < 0) break;
    console.log('---');
    console.log(txt.slice(Math.max(0, i - 50), Math.min(txt.length, i + 400)).replace(/[\x00-\x08\x0b-\x1f\x7f-\xff]/g, ch => '\\x' + ch.charCodeAt(0).toString(16).padStart(2,'0')));
    pos = i + 1;
  }
} else {
  console.log('  /G1 not directly referenced in content stream');
}
