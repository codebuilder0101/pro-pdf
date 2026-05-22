import fs from 'fs';
import zlib from 'zlib';
function getStream(file, objNum) {
  const text = fs.readFileSync(file, 'latin1');
  const buf  = fs.readFileSync(file);
  const re = new RegExp('\\b' + objNum + ' \\d+ obj\\b');
  const m = text.match(re);
  const start = m.index + m[0].length;
  const sIdx = text.indexOf('stream', start);
  const dict = text.slice(start, sIdx);
  const lm = dict.match(/\/Length\s+(\d+)/);
  let s = sIdx + 'stream'.length;
  if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
  const data = buf.slice(s, s + parseInt(lm[1]));
  return /\/Filter\s+\/FlateDecode/.test(dict) ? zlib.inflateSync(data) : data;
}
const s = getStream('normalized.pdf', 33).toString('latin1');

// Tokenize: track current font (per Tf and q/Q), find every <hex>Tj
const tfRe = /\/([A-Za-z][\w]*)\s+([\-\d.]+)\s+Tf/g;
const tjRe = /<([0-9A-Fa-f\s]+)>\s*Tj/g;
const qRe = /(?<=\W|^)([qQ])(?=\W|$)/g;

// Collect all events
const events = [];
let m;
tfRe.lastIndex = 0;
while ((m = tfRe.exec(s)) !== null) events.push({ pos: m.index, kind: 'Tf', font: m[1] });
tjRe.lastIndex = 0;
while ((m = tjRe.exec(s)) !== null) events.push({ pos: m.index, kind: 'Tj', hex: m[1].replace(/\s+/g,'').slice(0,40) });
qRe.lastIndex = 0;
while ((m = qRe.exec(s)) !== null) events.push({ pos: m.index, kind: m[1] });
events.sort((a,b)=>a.pos-b.pos);

const fontStack = [null];
let curFont = null;
for (const e of events) {
  if (e.kind === 'q') { fontStack.push(curFont); continue; }
  if (e.kind === 'Q') { curFont = fontStack.pop() ?? null; continue; }
  if (e.kind === 'Tf') { curFont = e.font; console.log('  [Tf]', e.pos, 'curFont=' + curFont); }
  else if (e.kind === 'Tj') console.log('  [Tj]', e.pos, 'font=' + curFont, 'hex=' + e.hex);
}
