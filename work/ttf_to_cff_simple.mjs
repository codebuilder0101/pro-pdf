// Build a NON-CID CFF (for use as /FontFile3 /Subtype /Type1C in a simple Type 1 PDF font).
// Same outline-conversion engine as ttf_to_cidcff.mjs but with non-CID Top DICT.
//
// Produces Connections-Regular-Simple.cff
import fs from 'fs';
import * as fontkit from 'fontkit';

const ttfPath = process.argv[2] || '../ConnectionsRegular.ttf';
const outPath = process.argv[3] || 'Connections-Regular-Simple.cff';
const font = fontkit.create(fs.readFileSync(ttfPath));
const N = font.numGlyphs;
console.log('Source:', font.postscriptName, 'numGlyphs:', N);

// --- Number / operator encoders ---
function encNum(n) {
  n = Math.round(n);
  if (n >= -107 && n <= 107) return Buffer.from([n + 139]);
  if (n >= 108 && n <= 1131) { n -= 108; return Buffer.from([(n >> 8) + 247, n & 0xff]); }
  if (n >= -1131 && n <= -108) { n = -n - 108; return Buffer.from([(n >> 8) + 251, n & 0xff]); }
  if (n >= -32768 && n <= 32767) { const b = Buffer.alloc(3); b[0] = 28; b.writeInt16BE(n, 1); return b; }
  const b = Buffer.alloc(5); b[0] = 29; b.writeInt32BE(n, 1); return b;
}
function encOp(op) { if (op < 256) return Buffer.from([op]); return Buffer.from([12, op & 0xff]); }
const OP = { RMOVETO: 21, HMOVETO: 22, VMOVETO: 4, RLINETO: 5, HLINETO: 6, VLINETO: 7, RRCURVETO: 8, ENDCHAR: 14 };

// --- Type 2 charstring builder ---
// Every charstring starts with the width as the first operand (defaultWidthX=0, nominalWidthX=0).
function buildCharstring(g) {
  const parts = [];
  const width = Math.round(g.advanceWidth);
  parts.push(encNum(width));
  let curX = 0, curY = 0;
  const cmds = g.path && g.path.commands ? g.path.commands : [];
  for (const c of cmds) {
    const cmd = c.command, a = c.args;
    if (cmd === 'moveTo') {
      const [x, y] = a;
      const dx = Math.round(x - curX), dy = Math.round(y - curY);
      if (dy === 0 && dx !== 0) { parts.push(encNum(dx), encOp(OP.HMOVETO)); }
      else if (dx === 0 && dy !== 0) { parts.push(encNum(dy), encOp(OP.VMOVETO)); }
      else { parts.push(encNum(dx), encNum(dy), encOp(OP.RMOVETO)); }
      curX = Math.round(x); curY = Math.round(y);
    } else if (cmd === 'lineTo') {
      const [x, y] = a;
      const dx = Math.round(x - curX), dy = Math.round(y - curY);
      if (dy === 0) { parts.push(encNum(dx), encOp(OP.HLINETO)); }
      else if (dx === 0) { parts.push(encNum(dy), encOp(OP.VLINETO)); }
      else { parts.push(encNum(dx), encNum(dy), encOp(OP.RLINETO)); }
      curX = Math.round(x); curY = Math.round(y);
    } else if (cmd === 'bezierCurveTo' || cmd === 'curveTo') {
      const [x1, y1, x2, y2, x, y] = a;
      const dx1 = Math.round(x1 - curX), dy1 = Math.round(y1 - curY);
      const dx2 = Math.round(x2 - x1), dy2 = Math.round(y2 - y1);
      const dx3 = Math.round(x  - x2), dy3 = Math.round(y  - y2);
      parts.push(encNum(dx1), encNum(dy1), encNum(dx2), encNum(dy2), encNum(dx3), encNum(dy3), encOp(OP.RRCURVETO));
      curX = Math.round(x); curY = Math.round(y);
    } else if (cmd === 'quadraticCurveTo') {
      const [x1, y1, x, y] = a;
      const c1x = curX + (2/3) * (x1 - curX);
      const c1y = curY + (2/3) * (y1 - curY);
      const c2x = x   + (2/3) * (x1 - x);
      const c2y = y   + (2/3) * (y1 - y);
      const dx1 = Math.round(c1x - curX), dy1 = Math.round(c1y - curY);
      const dx2 = Math.round(c2x - c1x), dy2 = Math.round(c2y - c1y);
      const dx3 = Math.round(x  - c2x), dy3 = Math.round(y  - c2y);
      parts.push(encNum(dx1), encNum(dy1), encNum(dx2), encNum(dy2), encNum(dx3), encNum(dy3), encOp(OP.RRCURVETO));
      curX = Math.round(x); curY = Math.round(y);
    }
    // closePath ('Z') is implicit in CFF Type 2 — no operator needed
  }
  parts.push(encOp(OP.ENDCHAR));
  return Buffer.concat(parts);
}

const charstrings = [];
for (let i = 0; i < N; i++) charstrings.push(buildCharstring(font.getGlyph(i)));

// --- CFF INDEX builder ---
function buildIndex(entries) {
  if (entries.length === 0) return Buffer.from([0, 0]);
  const offsets = [1];
  for (const e of entries) offsets.push(offsets[offsets.length - 1] + e.length);
  const max = offsets[offsets.length - 1];
  let offSize;
  if (max < 0x100) offSize = 1;
  else if (max < 0x10000) offSize = 2;
  else if (max < 0x1000000) offSize = 3;
  else offSize = 4;
  const head = Buffer.alloc(3 + offSize * offsets.length);
  head.writeUInt16BE(entries.length, 0);
  head[2] = offSize;
  let p = 3;
  for (const o of offsets) {
    let v = o;
    for (let i = offSize - 1; i >= 0; i--) { head[p + i] = v & 0xff; v >>= 8; }
    p += offSize;
  }
  return Buffer.concat([head, ...entries]);
}

// --- Strings ---
const STANDARD_COUNT = 391;
const strings = [];
function addString(s) {
  let i = strings.indexOf(s);
  if (i < 0) { strings.push(s); i = strings.length - 1; }
  return STANDARD_COUNT + i;
}
const fontName = font.postscriptName || 'Connections';

// Standard CFF Standard Strings list — for glyph names, we want to MATCH the names
// the PDF /Differences uses. fontkit returns standard PostScript names. Many of these
// are in the Standard Strings table (SIDs 0..390) so we can reference them directly.
// For glyphs not in the standard table, we add to the String INDEX.

// Always add to String INDEX (no Standard-SID optimization). Safer — no risk of wrong SID.
function sidFor(glyphName) {
  return addString(glyphName);
}

// --- Charset (non-CID, format 0): GID 1..N-1 each maps to a SID ---
// Format 0: byte(0) + N-1 uint16 SIDs (GID 0 is implicit .notdef = SID 0)
const charsetEntries = [];
for (let gid = 1; gid < N; gid++) {
  const g = font.getGlyph(gid);
  const name = g.name || ('gid' + gid);
  charsetEntries.push(sidFor(name));
}
const charsetBuf = Buffer.alloc(1 + 2 * charsetEntries.length);
charsetBuf[0] = 0;
for (let i = 0; i < charsetEntries.length; i++) charsetBuf.writeUInt16BE(charsetEntries[i], 1 + i * 2);

// --- Top DICT (non-CID) ---
function enc32(n) { const b = Buffer.alloc(5); b[0] = 29; b.writeInt32BE(n, 1); return b; }

function buildTopDict(off) {
  const parts = [];
  // FontBBox
  const bb = font.bbox;
  parts.push(encNum(Math.floor(bb.minX)), encNum(Math.floor(bb.minY)),
             encNum(Math.ceil(bb.maxX)),  encNum(Math.ceil(bb.maxY)));
  parts.push(encOp(5));
  // Offset operators — fixed 32-bit so size predictable
  parts.push(enc32(off.charset),     encOp(15));
  parts.push(enc32(off.charStrings), encOp(17));
  // Private (size, offset)
  parts.push(enc32(off.privateSize), enc32(off.privateOffset), encOp(18));
  return Buffer.concat(parts);
}

// --- Private DICT ---
function buildPrivate(subrsOff) {
  const parts = [];
  parts.push(encNum(0), encOp(20));  // defaultWidthX = 0
  parts.push(encNum(0), encOp(21));  // nominalWidthX = 0
  parts.push(enc32(subrsOff), encOp(19));  // Subrs (relative offset)
  return Buffer.concat(parts);
}

// --- Header / sections ---
const header = Buffer.from([1, 0, 4, 4]);
const nameINDEX = buildIndex([Buffer.from(fontName, 'latin1')]);
const charStringsBuf = buildIndex(charstrings);
const globalSubrs = buildIndex([]);
const localSubrs = buildIndex([]);

// Iterate to find stable layout. String INDEX depends on whatever strings got added by sidFor.
// (We've called sidFor for all glyph names already, so newStrings is now stable.)
const stringINDEX = buildIndex(strings.map(s => Buffer.from(s, 'latin1')));

// Pass 1: dummy Top DICT to know its size
let topDictBytes = buildTopDict({ charset: 0, charStrings: 0, privateSize: 0, privateOffset: 0 });
const topDictINDEX_size = buildIndex([topDictBytes]).length;

// Layout:
//   header
//   Name INDEX
//   Top DICT INDEX
//   String INDEX
//   Global Subr INDEX
//   charset
//   CharStrings INDEX
//   Private DICT
//   Local Subrs

let pos = header.length + nameINDEX.length;
pos += topDictINDEX_size;
pos += stringINDEX.length;
pos += globalSubrs.length;
const charsetOff = pos; pos += charsetBuf.length;
const charStringsOff = pos; pos += charStringsBuf.length;
const privateOff = pos;
const privateBytesPlaceholder = buildPrivate(0);
const privSize = privateBytesPlaceholder.length;
const localSubrsOff = privateOff + privSize;
pos += privSize + localSubrs.length;

// Pass 2: real offsets
topDictBytes = buildTopDict({
  charset:       charsetOff,
  charStrings:   charStringsOff,
  privateSize:   privSize,
  privateOffset: privateOff,
});
const topDictINDEX = buildIndex([topDictBytes]);
if (topDictINDEX.length !== topDictINDEX_size) throw new Error('Top DICT size mismatch');

const subrsRel = localSubrsOff - privateOff;
const privateBytes = buildPrivate(subrsRel);
if (privateBytes.length !== privSize) throw new Error('Private size mismatch');

const cff = Buffer.concat([
  header, nameINDEX, topDictINDEX, stringINDEX, globalSubrs,
  charsetBuf, charStringsBuf, privateBytes, localSubrs,
]);
console.log('Simple (non-CID) CFF size:', cff.length, 'bytes');
fs.writeFileSync(outPath, cff);
console.log('Wrote', outPath);

// Dump some sample widths / glyph names for sanity
console.log('\nSample glyphs:');
for (const gid of [0, 3, 19, 36, 68, 122]) {
  const g = font.getGlyph(gid);
  console.log(`  gid ${gid}: name="${g.name}", width=${g.advanceWidth}, sid=${gid === 0 ? 0 : charsetEntries[gid - 1]}`);
}
