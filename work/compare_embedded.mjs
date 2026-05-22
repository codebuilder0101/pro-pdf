// Compare the embedded TTF (object 142) in the bank PDF vs ConnectionsRegular.ttf
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as fontkit from 'fontkit';

const text = fs.readFileSync('normalized.pdf', 'latin1');
const buf = fs.readFileSync('normalized.pdf');

const objRe = /(\d+) (\d+) obj\b/g;
const objs = new Map();
let m;
while ((m = objRe.exec(text)) !== null) {
  const num = parseInt(m[1]);
  const start = m.index + m[0].length;
  const end = text.indexOf('endobj', start);
  if (end < 0) continue;
  objs.set(num, { start, end, body: text.slice(start, end) });
}

// Extract object 142 stream
const obj142 = objs.get(142);
const streamIdx = text.indexOf('stream', obj142.start);
const dictText = text.slice(obj142.start, streamIdx);
const lenMatch = dictText.match(/\/Length\s+(\d+)/);
let s = streamIdx + 'stream'.length;
if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
const streamData = buf.slice(s, s + parseInt(lenMatch[1]));
let ttfData = streamData;
if (/\/Filter\s+\/FlateDecode/.test(dictText)) {
  ttfData = zlib.inflateSync(streamData);
}
console.log('Embedded TTF length:', ttfData.length, 'bytes');
fs.writeFileSync('bank_embedded.ttf', ttfData);

const embedded = fontkit.create(ttfData);
const original = fontkit.create(fs.readFileSync('../ConnectionsRegular.ttf'));
console.log('\n--- Embedded (object 142) ---');
console.log('  PS Name :', embedded.postscriptName);
console.log('  numGlyphs:', embedded.numGlyphs);
console.log('  unitsPerEm:', embedded.unitsPerEm);
console.log('  Copyright:', embedded.copyright);

console.log('\n--- Original ConnectionsRegular.ttf ---');
console.log('  PS Name :', original.postscriptName);
console.log('  numGlyphs:', original.numGlyphs);
console.log('  unitsPerEm:', original.unitsPerEm);

// Compare glyph names per GID
console.log('\nGID-by-GID comparison:');
const N = Math.min(embedded.numGlyphs, original.numGlyphs);
let mismatches = 0;
for (let i = 0; i < N; i++) {
  const eg = embedded.getGlyph(i);
  const og = original.getGlyph(i);
  const eName = eg.name || '?', oName = og.name || '?';
  const eAdv = eg.advanceWidth, oAdv = og.advanceWidth;
  if (eName !== oName || eAdv !== oAdv) {
    if (mismatches < 30) console.log(`  GID ${i}: embedded="${eName}" adv=${eAdv} | original="${oName}" adv=${oAdv}`);
    mismatches++;
  }
}
console.log('Total mismatches:', mismatches, 'out of', N);
