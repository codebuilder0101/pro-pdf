import fs from 'fs';
import zlib from 'zlib';
function getStream(file, objNum) {
  const text = fs.readFileSync(file, 'latin1');
  const buf  = fs.readFileSync(file);
  const re = new RegExp('\b' + objNum + ' \d+ obj\b');
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
const s = getStream('bank_p3_original.pdf', 3).toString('latin1');
// Find Td or Tm operations near y=632 and y=581
const lines = s.split('\n');
let cumY = 0, lastTm = null;
let inText = false;
let curFont = null, curFontSize = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('BT')) { inText = true; cumY = 0; }
  if (line.includes('ET')) { inText = false; }
  if (!inText) continue;
  // Look for Tm
  const tmM = line.match(/([\-\d.]+\s+){5}([\-\d.]+)\s+Tm/);
  if (tmM) lastTm = parseFloat(tmM[2]);
  // Look for Tf
  const tfM = line.match(/\/([A-Za-z][\w]*)\s+([\-\d.]+)\s+Tf/);
  if (tfM) { curFont = tfM[1]; curFontSize = parseFloat(tfM[2]); }
  // Look for Tj/TJ
  if (line.includes('Tj') || line.includes('TJ')) {
    if (lastTm && (Math.abs(lastTm - 632) < 5 || Math.abs(lastTm - 581) < 5)) {
      console.log(`  y=${lastTm} font=${curFont} size=${curFontSize}: ${line.slice(0, 200)}`);
    }
  }
}
