// Find every GID used by /G1 in the content stream
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const pdfPath = path.resolve('../DUMMY.pdf');
const buf = fs.readFileSync(pdfPath);
const text = buf.toString('latin1');

// Re-parse content stream of obj 3
const objStart = text.indexOf('3 0 obj');
const streamStart = buf.indexOf(Buffer.from('stream'), objStart);
const dictText = text.slice(objStart, streamStart);
const lenMatch = dictText.match(/\/Length\s+(\d+)/);
let dataStart = streamStart + 'stream'.length;
if (buf[dataStart] === 0x0d) dataStart++;
if (buf[dataStart] === 0x0a) dataStart++;
const data = buf.slice(dataStart, dataStart + parseInt(lenMatch[1]));
const content = zlib.inflateSync(data).toString('latin1');

// Find all /G1 ... <hex> Tj sequences
const usedGids = new Set();
const gidRanges = new Set();
const re = /\/G1[\s\S]*?<([0-9A-Fa-f\s]+)>\s*Tj/g;
let m;
let count = 0;
let firstStrings = [];
while ((m = re.exec(content)) !== null) {
  const hex = m[1].replace(/\s+/g, '');
  // Each glyph is 2 bytes (4 hex chars)
  for (let i = 0; i + 4 <= hex.length; i += 4) {
    const gid = parseInt(hex.substr(i, 4), 16);
    usedGids.add(gid);
  }
  count++;
  if (firstStrings.length < 8) firstStrings.push(hex);
}
console.log(`Found ${count} /G1 Tj operations`);
console.log(`Unique GIDs used by /G1: ${usedGids.size}`);
const sorted = [...usedGids].sort((a,b)=>a-b);
console.log('Min GID :', sorted[0]);
console.log('Max GID :', sorted[sorted.length-1]);
console.log('All GIDs:', sorted.map(g => g.toString(16).padStart(4,'0')).join(' '));
console.log('\nFirst few strings:');
for (const s of firstStrings) console.log('  ', s);

// Check if there is a ToUnicode CMap we can use to label glyphs
// ToUnicode for the Type0 font is at object 45.
const cmapMarker = '45 0 obj';
const ci = text.indexOf(cmapMarker);
if (ci >= 0) {
  const cs = buf.indexOf(Buffer.from('stream'), ci);
  const dt = text.slice(ci, cs);
  const ml = dt.match(/\/Length\s+(\d+)/);
  let ds = cs + 'stream'.length;
  if (buf[ds] === 0x0d) ds++;
  if (buf[ds] === 0x0a) ds++;
  const cm = buf.slice(ds, ds + parseInt(ml[1]));
  const cmText = (dt.includes('FlateDecode') ? zlib.inflateSync(cm) : cm).toString('latin1');
  fs.writeFileSync('toUnicode_45.cmap', cmText);
  console.log('\n--- ToUnicode CMap (object 45) ---');
  console.log(cmText.split('\n').slice(0, 80).join('\n'));
}
