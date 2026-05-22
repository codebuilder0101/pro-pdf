// Convert a non-CID CFF (the kind opentype.js produces) into a CID-keyed CFF,
// suitable for use as /FontFile3 /Subtype /CIDFontType0C in a PDF's
// CIDFontType0 descendant.
//
// We preserve the existing CharStrings, Global Subrs, Private DICT and Local Subrs
// from the input CFF, and just rebuild the headers (Name INDEX, Top DICT, charset,
// FDSelect, FDArray, sub-FontDict, private dict offsets, local subr offset).

import fs from 'fs';

// ------------------------------ CFF parser ------------------------------
class CFFReader {
  constructor(buf) { this.buf = buf; this.pos = 0; }
  u8() { return this.buf[this.pos++]; }
  u16() { const v = this.buf.readUInt16BE(this.pos); this.pos += 2; return v; }
  uN(n) {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 8) | this.u8();
    return v;
  }
  index() {
    const count = this.u16();
    if (count === 0) return { count: 0, offsets: [], data: Buffer.alloc(0), entries: [] };
    const offSize = this.u8();
    const offsets = [];
    for (let i = 0; i <= count; i++) offsets.push(this.uN(offSize));
    const dataStart = this.pos;
    const dataLen = offsets[offsets.length - 1] - 1;
    const data = this.buf.slice(dataStart, dataStart + dataLen);
    this.pos = dataStart + dataLen;
    const entries = [];
    for (let i = 0; i < count; i++) {
      entries.push(data.slice(offsets[i] - 1, offsets[i + 1] - 1));
    }
    return { count, offsets, data, entries };
  }
  dict(end) {
    // Parse a DICT (returns map of key -> value array)
    const map = {};
    let operands = [];
    while (this.pos < end) {
      const b0 = this.u8();
      if (b0 <= 21) {
        let op;
        if (b0 === 12) op = (12 << 8) | this.u8();
        else op = b0;
        map[op] = operands;
        operands = [];
      } else {
        // operand
        this.pos--;
        operands.push(this.readNumber());
      }
    }
    return map;
  }
  readNumber() {
    const b0 = this.u8();
    if (b0 >= 32 && b0 <= 246) return b0 - 139;
    if (b0 >= 247 && b0 <= 250) return (b0 - 247) * 256 + this.u8() + 108;
    if (b0 >= 251 && b0 <= 254) return -(b0 - 251) * 256 - this.u8() - 108;
    if (b0 === 28) {
      const hi = this.u8(), lo = this.u8();
      let v = (hi << 8) | lo;
      if (v >= 0x8000) v -= 0x10000;
      return v;
    }
    if (b0 === 29) {
      // 32-bit signed
      const a = this.u8(), b = this.u8(), c = this.u8(), d = this.u8();
      let v = (a << 24) | (b << 16) | (c << 8) | d;
      if (v >= 0x80000000) v -= 0x100000000;
      return v;
    }
    if (b0 === 30) {
      // real number (BCD)
      let s = '';
      while (true) {
        const b = this.u8();
        const n1 = b >> 4, n2 = b & 0xf;
        for (const n of [n1, n2]) {
          if (n < 10) s += String(n);
          else if (n === 10) s += '.';
          else if (n === 11) s += 'E';
          else if (n === 12) s += 'E-';
          else if (n === 14) s += '-';
          else if (n === 15) return parseFloat(s);
        }
      }
    }
    throw new Error('Bad operand byte: ' + b0);
  }
}

// ------------------------------ CFF writer ------------------------------
class CFFWriter {
  constructor() { this.parts = []; }
  push(buf) {
    if (typeof buf === 'number') this.parts.push(Buffer.from([buf]));
    else this.parts.push(buf);
  }
  build() { return Buffer.concat(this.parts); }
  static encNum(n) {
    n = Math.round(n);
    if (n >= -107 && n <= 107) return Buffer.from([n + 139]);
    if (n >= 108 && n <= 1131) { n -= 108; return Buffer.from([(n >> 8) + 247, n & 0xff]); }
    if (n >= -1131 && n <= -108) { n = -n - 108; return Buffer.from([(n >> 8) + 251, n & 0xff]); }
    if (n >= -32768 && n <= 32767) { const b = Buffer.alloc(3); b[0] = 28; b.writeInt16BE(n, 1); return b; }
    const b = Buffer.alloc(5); b[0] = 29; b.writeInt32BE(n, 1); return b;
  }
  static encOp(op) {
    if (op < 256) return Buffer.from([op]);
    return Buffer.from([12, op & 0xff]);
  }
  // Build an INDEX from an array of Buffers
  static indexFrom(entries) {
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
      for (let i = offSize - 1; i >= 0; i--) head[p + i] = o & 0xff, (function(){})();
      // hand-rolled write because Buffer.writeUInt*BE doesn't handle 3-byte
      let v = o;
      for (let i = offSize - 1; i >= 0; i--) { head[p + i] = v & 0xff; v >>= 8; }
      p += offSize;
    }
    return Buffer.concat([head, ...entries]);
  }
}

// ------------------------------ Parse source CFF ------------------------------
const src = fs.readFileSync('Connections-Regular.cff');
console.log('Source CFF:', src.length, 'bytes');

const r = new CFFReader(src);
const major = r.u8(), minor = r.u8(), hdrSize = r.u8(), offSize0 = r.u8();
console.log(`Header: ${major}.${minor}, hdrSize=${hdrSize}, offSize=${offSize0}`);
r.pos = hdrSize;

const nameIdx = r.index();
const fontName = nameIdx.entries[0].toString('latin1');
console.log('FontName:', fontName);

const topDictIdx = r.index();
const topDictPos = r.pos;
// Parse top DICT operators
const topR = new CFFReader(topDictIdx.entries[0]);
const topEnd = topDictIdx.entries[0].length;
const topDict = topR.dict(topEnd);
console.log('Top DICT operators:', Object.keys(topDict).map(k => `op${k}=${JSON.stringify(topDict[k])}`).join(' '));

const stringIdx = r.index();
const numStrings = stringIdx.count;
console.log('String INDEX:', numStrings, 'entries');
const strings = stringIdx.entries.map(e => e.toString('latin1'));

const globalSubrIdx = r.index();
console.log('Global Subrs:', globalSubrIdx.count);

// Extract offsets/lengths for charset, encoding, CharStrings, Private
// Standard CFF op codes:
//   17 CharStrings (offset)
//   15 charset (offset)
//   16 Encoding (offset)
//   18 Private (size, offset)
const charStringsOff = topDict[17] ? topDict[17][0] : null;
const charsetOff     = topDict[15] ? topDict[15][0] : null;
const privateInfo    = topDict[18] || null; // [size, offset]
console.log('Offsets: CharStrings=', charStringsOff, 'charset=', charsetOff, 'Private=', privateInfo);

// Read CharStrings INDEX
r.pos = charStringsOff;
const csIdx = r.index();
console.log('CharStrings count:', csIdx.count);

// Read Private DICT
r.pos = privateInfo[1];
const privateEnd = privateInfo[1] + privateInfo[0];
const privateRaw = src.slice(privateInfo[1], privateEnd);
const privR = new CFFReader(privateRaw);
const privateDict = privR.dict(privateRaw.length);
console.log('Private DICT operators:', Object.keys(privateDict).map(k => `op${k}=${JSON.stringify(privateDict[k])}`).join(' '));
// op 19 = Subrs offset (relative to Private DICT start)
let localSubrIdx = { count: 0, entries: [], offsets: [], data: Buffer.alloc(0) };
if (privateDict[19]) {
  const subrsOff = privateDict[19][0];
  r.pos = privateInfo[1] + subrsOff;
  localSubrIdx = r.index();
  console.log('Local Subrs:', localSubrIdx.count);
}

// ------------------------------ Build CID-keyed CFF ------------------------------
// We need to add some strings: "Adobe", "Identity" for ROS, and keep all existing strings.
// SID values:
//   0..390 = Standard Strings (predefined)
//   391+   = strings from String INDEX

// Find or add "Adobe" and "Identity"
const STANDARD_STRINGS_COUNT = 391;
const newStrings = [...strings];
function addString(s) {
  // Check if it's in standard strings (we won't bother — just always add)
  let idx = newStrings.indexOf(s);
  if (idx < 0) { newStrings.push(s); idx = newStrings.length - 1; }
  return STANDARD_STRINGS_COUNT + idx;
}
const sidAdobe    = addString('Adobe');
const sidIdentity = addString('Identity');

// Charset format 2: GID 1..N-1 mapped to CID = GID (identity).
// Format 2 stores ranges: (first_cid, n_left_uint16). For identity gid==cid:
//   first = 1, n_left = N - 2  (covers gid 1 through gid N-1)
const numGlyphs = csIdx.count;
console.log('numGlyphs:', numGlyphs);

// Charset for CID-keyed font: GID 0 is implicitly CID 0. For GIDs 1..N-1 we list CIDs.
// Format 2 = uint16 first, uint16 n_left. For identity:
const charsetBuf = Buffer.alloc(1 + 2 + 2);
charsetBuf[0] = 2; // format
charsetBuf.writeUInt16BE(1, 1);            // first CID
charsetBuf.writeUInt16BE(numGlyphs - 2, 3); // nLeft

// FDSelect format 3: 1 range covering all GIDs, all assigned to FD index 0
const fdSelectBuf = Buffer.alloc(1 + 2 + 2 + 1 + 2);
fdSelectBuf[0] = 3;                           // format
fdSelectBuf.writeUInt16BE(1, 1);              // nRanges
fdSelectBuf.writeUInt16BE(0, 3);              // first = 0
fdSelectBuf[5] = 0;                           // fd index 0
fdSelectBuf.writeUInt16BE(numGlyphs, 6);      // sentinel

// Build CharStrings INDEX (passthrough from source)
const charStringsBuf = CFFWriter.indexFrom(csIdx.entries);

// Build Global Subr INDEX (passthrough — usually empty)
const globalSubrsBuf = CFFWriter.indexFrom(globalSubrIdx.entries);

// Build Local Subr INDEX (passthrough)
const localSubrsBuf = CFFWriter.indexFrom(localSubrIdx.entries);

// Private DICT (rebuilt, keep all operators except change Subrs offset)
function buildDict(dict, subrsOffset) {
  const parts = [];
  for (const [op, vals] of Object.entries(dict)) {
    const opNum = parseInt(op);
    let v = vals;
    if (opNum === 19) { /* skip — we'll rewrite at end */ continue; }
    for (const n of v) parts.push(CFFWriter.encNum(n));
    parts.push(CFFWriter.encOp(opNum));
  }
  // Append Subrs (op 19) if applicable
  if (subrsOffset !== null) {
    parts.push(CFFWriter.encNum(subrsOffset));
    parts.push(CFFWriter.encOp(19));
  }
  return Buffer.concat(parts);
}
// We need to know Subrs offset relative to Private DICT — but we control layout.
// Let's place Local Subrs IMMEDIATELY after Private DICT.
// First build Private DICT WITHOUT Subrs operator to get its length, then add the operator with the known offset.
const privateWithoutSubrs = buildDict(privateDict, null);
// Re-build with Subrs offset = length of private DICT including Subrs operator (chicken-and-egg).
// Easier: iteratively estimate. The Subrs offset varies based on its own encoding size.
// Reasonable approach: encode subrsOffset using fixed 5-byte int (op 29) → always 6 bytes total.
function buildPrivateWithSubrs(subrsOff) {
  const parts = [];
  for (const [op, vals] of Object.entries(privateDict)) {
    const opNum = parseInt(op);
    if (opNum === 19) continue;
    for (const n of vals) parts.push(CFFWriter.encNum(n));
    parts.push(CFFWriter.encOp(opNum));
  }
  // Force 32-bit encoding for subrsOff
  const b = Buffer.alloc(5); b[0] = 29; b.writeInt32BE(subrsOff, 1);
  parts.push(b);
  parts.push(CFFWriter.encOp(19));
  return Buffer.concat(parts);
}
let estSubrsOff = privateWithoutSubrs.length + 6;
const privateBuf = buildPrivateWithSubrs(estSubrsOff);
if (privateBuf.length !== estSubrsOff) throw new Error('private size mismatch');

// Sub-FontDict for FDArray: just contains Private DICT pointer
// Operator 18 takes [size, offset]
function buildFontDict(privSize, privOffsetFromCFFStart) {
  const parts = [];
  // FontName SID — use the existing fontname
  // SID for FontName is op 38 ("FontName" in CIDFont).
  parts.push(CFFWriter.encNum(391 + newStrings.indexOf(fontName) >= 391 ? 391 + newStrings.indexOf(fontName) : addString(fontName)));
  parts.push(CFFWriter.encOp(0x0c26)); // op 12 38 = FontName
  // Force 32-bit encoding for offsets so size is predictable
  const sz = Buffer.alloc(5); sz[0] = 29; sz.writeInt32BE(privSize, 1);
  const of = Buffer.alloc(5); of[0] = 29; of.writeInt32BE(privOffsetFromCFFStart, 1);
  parts.push(sz);
  parts.push(of);
  parts.push(CFFWriter.encOp(18));
  return Buffer.concat(parts);
}

// Now we need to lay out all sections and compute their offsets relative to CFF start.
// Layout order:
//   [0] Header (4 bytes)
//   [1] Name INDEX
//   [2] Top DICT INDEX
//   [3] String INDEX
//   [4] Global Subr INDEX
//   [5] charset
//   [6] FDSelect
//   [7] CharStrings INDEX
//   [8] FDArray (Font DICT INDEX, 1 entry pointing to Private DICT)
//   [9] Private DICT
//   [10] Local Subr INDEX
//
// We need to know offsets to encode in Top DICT and FDArray's sub-dict.
// Top DICT has variable size depending on its own operands. To keep things simple,
// we'll *force* all offsets to be encoded as 5-byte integers (op 29). That way the
// Top DICT size is predictable and we can compute everything in one pass.

const header = Buffer.from([1, 0, 4, 4]);  // major, minor, hdrSize, offSize
// Name INDEX: 1 entry with our fontName (without subset prefix — subset prefix shouldn't appear here)
const nameINDEX = CFFWriter.indexFrom([Buffer.from(fontName, 'latin1')]);

// Build String INDEX
const stringINDEX = CFFWriter.indexFrom(newStrings.map(s => Buffer.from(s, 'latin1')));

// Build top DICT operators that DON'T depend on offsets:
//   ROS (12 30): [sidRegistry sidOrdering supplement]
//   CIDFontVersion (12 31): 0
//   CIDFontRevision (12 32): 0
//   CIDFontType (12 33): 0
//   CIDCount (12 34): N
//   then offsets: charset (15), CharStrings (17), FDSelect (12 37), FDArray (12 36)
function buildTopDict(off) {
  const parts = [];
  // ROS
  parts.push(CFFWriter.encNum(sidAdobe));
  parts.push(CFFWriter.encNum(sidIdentity));
  parts.push(CFFWriter.encNum(0));
  parts.push(CFFWriter.encOp(0x0c1e)); // 12 30
  // CIDFontVersion / Revision / Type / Count
  parts.push(CFFWriter.encNum(0)); parts.push(CFFWriter.encOp(0x0c1f)); // 12 31
  parts.push(CFFWriter.encNum(0)); parts.push(CFFWriter.encOp(0x0c20)); // 12 32
  parts.push(CFFWriter.encNum(0)); parts.push(CFFWriter.encOp(0x0c21)); // 12 33
  parts.push(CFFWriter.encNum(numGlyphs)); parts.push(CFFWriter.encOp(0x0c22)); // 12 34
  // Also copy FontBBox if present in source
  if (topDict[5]) {
    for (const n of topDict[5]) parts.push(CFFWriter.encNum(n));
    parts.push(CFFWriter.encOp(5));
  }
  // Notice (op 1) — optional
  if (topDict[1]) {
    parts.push(CFFWriter.encNum(topDict[1][0]));
    parts.push(CFFWriter.encOp(1));
  }
  // FullName, FamilyName, Weight (ops 2,3,4) — optional, can skip for size
  // Offset operators — use 5-byte int encoding so size is predictable
  function enc32(v) { const b = Buffer.alloc(5); b[0] = 29; b.writeInt32BE(v, 1); return b; }
  parts.push(enc32(off.charset));     parts.push(CFFWriter.encOp(15));
  parts.push(enc32(off.charStrings)); parts.push(CFFWriter.encOp(17));
  parts.push(enc32(off.fdSelect));    parts.push(CFFWriter.encOp(0x0c25)); // 12 37
  parts.push(enc32(off.fdArray));     parts.push(CFFWriter.encOp(0x0c24)); // 12 36
  return Buffer.concat(parts);
}

// Estimate sizes: we need iterative layout because Top DICT size depends on offsets (which depend on Top DICT size).
// First pass with dummy offsets to compute Top DICT size:
let topDictBuf = buildTopDict({ charset: 0, charStrings: 0, fdSelect: 0, fdArray: 0 });
const topDictINDEX_pad = CFFWriter.indexFrom([topDictBuf]);

// Now compute real offsets
let pos = header.length;
pos += nameINDEX.length;
const topDictOffset = pos;
pos += topDictINDEX_pad.length;
pos += stringINDEX.length;
pos += globalSubrsBuf.length;
const charsetOffN  = pos; pos += charsetBuf.length;
const fdSelectOffN = pos; pos += fdSelectBuf.length;
const charStringsOffN = pos; pos += charStringsBuf.length;
const fdArrayOffN = pos;
// FDArray = Font DICT INDEX with 1 entry (a sub-dict pointing to Private DICT)
// We need to know Private DICT offset to encode it inside FDArray.
// Lay out: FDArray, then PrivateDICT, then LocalSubrs.
// FDArray length depends on what we put in the sub-dict.
// Force fixed 5-byte encoding so size is predictable.
// First pass with dummy private offset:
let subDict = buildFontDict(privateBuf.length, 0);
let fdArrayBuf = CFFWriter.indexFrom([subDict]);
pos += fdArrayBuf.length;
const privateOffN = pos;
pos += privateBuf.length;
const localSubrsOffN = pos; // Local Subrs immediately after Private DICT
pos += localSubrsBuf.length;

// Second pass: rebuild top DICT and FDArray with real offsets
topDictBuf = buildTopDict({
  charset:     charsetOffN,
  charStrings: charStringsOffN,
  fdSelect:    fdSelectOffN,
  fdArray:     fdArrayOffN,
});
const topDictINDEX = CFFWriter.indexFrom([topDictBuf]);
if (topDictINDEX.length !== topDictINDEX_pad.length) {
  throw new Error('Top DICT size changed between passes: ' + topDictINDEX.length + ' vs ' + topDictINDEX_pad.length);
}
subDict = buildFontDict(privateBuf.length, privateOffN);
fdArrayBuf = CFFWriter.indexFrom([subDict]);

// Final assemble
const cff = Buffer.concat([
  header,
  nameINDEX,
  topDictINDEX,
  stringINDEX,
  globalSubrsBuf,
  charsetBuf,
  fdSelectBuf,
  charStringsBuf,
  fdArrayBuf,
  privateBuf,
  localSubrsBuf,
]);
console.log('CID-keyed CFF size:', cff.length, 'bytes');
fs.writeFileSync('Connections-Regular-CID.cff', cff);
console.log('Wrote Connections-Regular-CID.cff');
