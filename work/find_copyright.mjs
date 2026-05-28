// Find the copyright © character in page 2 of the ORIGINAL and check which GID it uses
import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import * as mupdf from 'mupdf';

function getStreamByObj(file, objNum) {
  const text = fs.readFileSync(file, 'latin1');
  const buf  = fs.readFileSync(file);
  const re = new RegExp('\\b' + objNum + ' \\d+ obj\\b');
  const m = text.match(re);
  if (!m) return null;
  const start = m.index + m[0].length;
  const sIdx = text.indexOf('stream', start);
  const dict = text.slice(start, sIdx);
  const lm = dict.match(/\/Length\s+(\d+)/);
  let s = sIdx + 'stream'.length;
  if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
  const data = buf.slice(s, s + parseInt(lm[1]));
  return /\/Filter\s+\/FlateDecode/.test(dict) ? zlib.inflateSync(data) : data;
}

// Read 2-page original
const origPdf = path.resolve('bank_pages_12_original.pdf');
// Find page 2 (object 100), get content stream
const text = fs.readFileSync(origPdf, 'latin1');
const buf  = fs.readFileSync(origPdf);
// Find content stream of obj 71
const c = getStreamByObj(origPdf, 71).toString('latin1');
fs.writeFileSync('page2_orig_content.txt', c);

// Look for any "k" or "©" related text — search around "2026 Bank of America"
// First, find /C2_* Tj operations near the bottom of the page (y around 100)
console.log('Length:', c.length);
const tjMatches = [...c.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g)];
console.log('Total Tj ops:', tjMatches.length);

// Look for short hex strings that could contain ©
// CID 0xA9 (169) is © in Unicode but in CID Identity-H, it's just the GID
// Looking for hex sequences with bytes likely in CID range for ©
for (const m of tjMatches) {
  const hex = m[1].replace(/\s+/g, '');
  // Check if it's 4-hex-digit CIDs
  if (hex.length % 4 !== 0) continue;
  // Decode CIDs
  const cids = [];
  for (let i = 0; i < hex.length; i += 4) cids.push(parseInt(hex.substr(i, 4), 16));
  // Print if any CID is > 0x60 (looking for special characters)
  if (cids.length < 30 && cids.some(c => c > 200)) {
    console.log('  Tj at', m.index, '#cids=' + cids.length, 'cids=' + cids.map(c => '0x' + c.toString(16)).join(','));
  }
}

// Also find ToUnicode CMap for one of these fonts
// Page 2 uses /C2_0 (obj 74) and /C2_1 (obj 82)
console.log('\nLooking at ToUnicode CMaps for Type 0 fonts:');
const tu81 = getStreamByObj(origPdf, 81);
const tu84 = getStreamByObj(origPdf, 84);
if (tu81) {
  console.log('--- obj 81 ToUnicode (for obj 74 TILBPG+Connections) ---');
  console.log(tu81.toString('latin1'));
}
if (tu84) {
  console.log('--- obj 84 ToUnicode (for obj 82 XDZZTY+Connections) ---');
  console.log(tu84.toString('latin1'));
}
