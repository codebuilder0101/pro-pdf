// Direct TTF -> CID-keyed CFF converter. Produces a CIDFontType0C-compatible CFF.
// Outputs Connections-Regular-CIDCFF.cff that can be embedded in PDF via:
//   /FontFile3 + /Subtype /CIDFontType0C
// while the parent CIDFont's Subtype changes from /CIDFontType2 to /CIDFontType0.
import fs from 'fs';
import * as fontkit from 'fontkit';

const ttfPath = process.argv[2] || '../ConnectionsRegular.ttf';
const outPath = process.argv[3] || 'Connections-Regular-CIDCFF.cff';
const ttfBuf = fs.readFileSync(ttfPath);
const font = fontkit.create(ttfBuf);
console.log('Source:', font.postscriptName, 'numGlyphs:', font.numGlyphs);

const N = font.numGlyphs;

// --- Build Type 2 charstrings for each glyph ---
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

function buildCharstring(g) {
  const parts = [];
  const width = Math.round(g.advanceWidth);
  // width relative to nominalWidthX (=0)
  parts.push(encNum(width));
  const path = g.path;
  const cmds = path && path.commands ? path.commands : [];
  let curX = 0, curY = 0;
  for (const c of cmds) {
    const cmd = c.command;
    const a = c.args;
    if (cmd === 'moveTo') {
      const [x, y] = a;
      const dx = Math.round(x - curX), dy = Math.round(y - curY);
      if (dy === 0 && dx !== 0) { parts.push(encNum(dx)); parts.push(encOp(OP.HMOVETO)); }
      else if (dx === 0 && dy !== 0) { parts.push(encNum(dy)); parts.push(encOp(OP.VMOVETO)); }
      else { parts.push(encNum(dx)); parts.push(encNum(dy)); parts.push(encOp(OP.RMOVETO)); }
      curX = Math.round(x); curY = Math.round(y);
    } else if (cmd === 'lineTo') {
      const [x, y] = a;
      const dx = Math.round(x - curX), dy = Math.round(y - curY);
      if (dy === 0) { parts.push(encNum(dx)); parts.push(encOp(OP.HLINETO)); }
      else if (dx === 0) { parts.push(encNum(dy)); parts.push(encOp(OP.VLINETO)); }
      else { parts.push(encNum(dx)); parts.push(encNum(dy)); parts.push(encOp(OP.RLINETO)); }
      curX = Math.round(x); curY = Math.round(y);
    } else if (cmd === 'bezierCurveTo' || cmd === 'curveTo') {
      const [x1, y1, x2, y2, x, y] = a;
      const dx1 = Math.round(x1 - curX), dy1 = Math.round(y1 - curY);
      const dx2 = Math.round(x2 - x1), dy2 = Math.round(y2 - y1);
      const dx3 = Math.round(x  - x2), dy3 = Math.round(y  - y2);
      parts.push(encNum(dx1), encNum(dy1), encNum(dx2), encNum(dy2), encNum(dx3), encNum(dy3));
      parts.push(encOp(OP.RRCURVETO));
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
      parts.push(encNum(dx1), encNum(dy1), encNum(dx2), encNum(dy2), encNum(dx3), encNum(dy3));
      parts.push(encOp(OP.RRCURVETO));
      curX = Math.round(x); curY = Math.round(y);
    }
    // closePath ('Z') is implicit in CFF Type 2 — no operator needed
  }
  parts.push(encOp(OP.ENDCHAR));
  return Buffer.concat(parts);
}

const charstrings = [];
for (let i = 0; i < N; i++) charstrings.push(buildCharstring(font.getGlyph(i)));

// --- Build CFF INDEX ---
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
// Standard CFF strings are SIDs 0..390 predefined; user strings start at 391.
const STANDARD_COUNT = 391;
const strings = [];
function addString(s) {
  let i = strings.indexOf(s);
  if (i < 0) { strings.push(s); i = strings.length - 1; }
  return STANDARD_COUNT + i;
}
const fontName = font.postscriptName || 'Connections';
const cidFontName = addString(fontName);  // for FontName in FontDict (CID)
const sidAdobe = addString('Adobe');
const sidIdentity = addString('Identity');

// --- Top DICT (CID-keyed) ---
function enc32(n) { const b = Buffer.alloc(5); b[0] = 29; b.writeInt32BE(n, 1); return b; }

function buildTopDict(off) {
  const parts = [];
  // ROS (12 30): Registry Ordering Supplement
  parts.push(encNum(sidAdobe), encNum(sidIdentity), encNum(0), encOp(0x0c1e));
  // CIDFontVersion / Revision / Type / Count
  parts.push(encNum(0), encOp(0x0c1f));
  parts.push(encNum(0), encOp(0x0c20));
  parts.push(encNum(0), encOp(0x0c21));
  parts.push(encNum(N), encOp(0x0c22));
  // FontBBox
  const bb = font.bbox;
  parts.push(encNum(Math.floor(bb.minX)), encNum(Math.floor(bb.minY)), encNum(Math.ceil(bb.maxX)), encNum(Math.ceil(bb.maxY)));
  parts.push(encOp(5));
  // Offset operators — fixed 32-bit so size predictable
  parts.push(enc32(off.charset),     encOp(15));
  parts.push(enc32(off.charStrings), encOp(17));
  parts.push(enc32(off.fdSelect),    encOp(0x0c25));  // 12 37
  parts.push(enc32(off.fdArray),     encOp(0x0c24));  // 12 36
  return Buffer.concat(parts);
}

// --- Private DICT (referenced from FDArray) ---
function buildPrivate(subrsOff) {
  // Minimal Private DICT. Keys:
  //   19 = Subrs (offset)
  //   20 = defaultWidthX
  //   21 = nominalWidthX
  // BlueValues etc. are optional (default to none).
  const parts = [];
  parts.push(encNum(0), encOp(20));  // defaultWidthX = 0
  parts.push(encNum(0), encOp(21));  // nominalWidthX = 0
  // Subrs offset MUST be encoded last, with fixed 32-bit so we can lay out
  parts.push(enc32(subrsOff), encOp(19));
  return Buffer.concat(parts);
}

// --- Sub-FontDict (entry in FDArray) ---
function buildFontDict(privSize, privOffset) {
  const parts = [];
  // FontName (12 38)
  parts.push(encNum(cidFontName), encOp(0x0c26));
  // Private (size, offset): force 32-bit
  parts.push(enc32(privSize), enc32(privOffset), encOp(18));
  return Buffer.concat(parts);
}

// --- Charset (format 2, identity GID == CID) ---
// Format 2: byte(2) + (uint16 first, uint16 nLeft) ranges.
// For Identity: one range covering GIDs 1..N-1, CIDs 1..N-1.
const charsetBuf = Buffer.alloc(1 + 4);
charsetBuf[0] = 2;
charsetBuf.writeUInt16BE(1, 1);
charsetBuf.writeUInt16BE(N - 2, 3);  // nLeft

// --- FDSelect format 3 ---
const fdSelectBuf = Buffer.alloc(1 + 2 + 5 + 2);
fdSelectBuf[0] = 3;
fdSelectBuf.writeUInt16BE(1, 1);  // nRanges
fdSelectBuf.writeUInt16BE(0, 3);  // first = 0
fdSelectBuf[5] = 0;               // FD index = 0
fdSelectBuf.writeUInt16BE(N, 6);  // sentinel

// --- Build CFF ---
// Layout:
//   0: header (4 bytes)
//   1: Name INDEX
//   2: Top DICT INDEX (placeholder, then re-emit with real offsets)
//   3: String INDEX
//   4: Global Subr INDEX (empty)
//   5: charset
//   6: FDSelect
//   7: CharStrings INDEX
//   8: FDArray (Font DICT INDEX)
//   9: Private DICT
//  10: Local Subrs (empty)

const header = Buffer.from([1, 0, 4, 4]);
const nameINDEX = buildIndex([Buffer.from(fontName, 'latin1')]);
const stringINDEX = buildIndex(strings.map(s => Buffer.from(s, 'latin1')));
const globalSubrs = buildIndex([]);
const charStringsBuf = buildIndex(charstrings);
const localSubrs = buildIndex([]);

// Pass 1: Top DICT with dummy offsets to compute its size
let topDictBytes = buildTopDict({ charset: 0, charStrings: 0, fdSelect: 0, fdArray: 0 });
const topDictINDEX_size = buildIndex([topDictBytes]).length;

// Compute layout offsets
let pos = header.length + nameINDEX.length;
const topDictOff = pos; pos += topDictINDEX_size;
pos += stringINDEX.length;
pos += globalSubrs.length;
const charsetOff = pos; pos += charsetBuf.length;
const fdSelectOff = pos; pos += fdSelectBuf.length;
const charStringsOff = pos; pos += charStringsBuf.length;
const fdArrayOff = pos;
// FDArray contains a sub-FontDict that references Private DICT
// Private DICT size includes "Subrs" operator
// Let's compute Private DICT size first
const privateBytesPlaceholder = buildPrivate(0);
// Private DICT immediately followed by Local Subrs
const privSize = privateBytesPlaceholder.length;
// FDArray INDEX = INDEX[ sub-font-dict ]
const subFontDict_placeholder = buildFontDict(privSize, 0);
const fdArrayLen = buildIndex([subFontDict_placeholder]).length;
pos += fdArrayLen;
const privateOff = pos;
const localSubrsOff = privateOff + privSize;  // local subrs immediately after Private DICT
pos += privSize + localSubrs.length;

// Pass 2: rebuild with real offsets
topDictBytes = buildTopDict({ charset: charsetOff, charStrings: charStringsOff, fdSelect: fdSelectOff, fdArray: fdArrayOff });
const topDictINDEX = buildIndex([topDictBytes]);
if (topDictINDEX.length !== topDictINDEX_size) throw new Error('Top DICT size mismatch');

const subFontDict = buildFontDict(privSize, privateOff);
const fdArrayINDEX = buildIndex([subFontDict]);
if (fdArrayINDEX.length !== fdArrayLen) throw new Error('FDArray size mismatch');

// Local Subrs offset is RELATIVE to the Private DICT start
const subrsRelativeOff = localSubrsOff - privateOff;
const privateBytes = buildPrivate(subrsRelativeOff);
if (privateBytes.length !== privSize) throw new Error('Private size mismatch');

const cff = Buffer.concat([
  header,
  nameINDEX,
  topDictINDEX,
  stringINDEX,
  globalSubrs,
  charsetBuf,
  fdSelectBuf,
  charStringsBuf,
  fdArrayINDEX,
  privateBytes,
  localSubrs,
]);
console.log('CID-keyed CFF size:', cff.length, 'bytes');
fs.writeFileSync(outPath, cff);
console.log('Wrote', outPath);

// Sanity check: re-open via fontkit
const reFont = fontkit.create(cff);
console.log('Re-opened: numGlyphs =', reFont.numGlyphs, 'name =', reFont.postscriptName);
