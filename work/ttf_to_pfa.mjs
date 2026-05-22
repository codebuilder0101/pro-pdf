// Convert ConnectionsRegular.ttf to a classic PostScript Type 1 font in PFA (ASCII) format.
// This is a self-contained converter: parses the TTF glyph outlines via fontkit, converts
// each outline to Type 1 charstring bytes, eexec-encrypts the private section,
// and assembles the .pfa text.
//
// Result: Connections-Regular.pfa — a classic Type 1 font (the format used by PostScript
// printers and legacy DTP). Pair with the matching .afm if width metrics are required.
//
// References:
//   Adobe Type 1 Font Format (Black Book, 1990)
//   Adobe Type 2 charstring format (used by CFF) — we DON'T use Type 2 here.
import * as fontkit from 'fontkit';
import fs from 'fs';

const TTF = fs.readFileSync('../ConnectionsRegular.ttf');
const font = fontkit.create(TTF);

// ---------- Type 1 charstring writer ----------
// Operators we need:
const OP = {
  HSTEM:        1,
  VSTEM:        3,
  VMOVETO:      4,
  RLINETO:      5,
  HLINETO:      6,
  VLINETO:      7,
  RRCURVETO:    8,
  CLOSEPATH:    9,
  HSBW:        13,
  ENDCHAR:     14,
  RMOVETO:     21,
  HMOVETO:     22,
};

function encNum(n) {
  // Type 1 number encoding. Note that Type 1 uses BIG-ENDIAN integers.
  // Range -107..107   -> 1 byte: n + 139
  // Range 108..1131   -> 2 bytes: (n-108)/256 + 247, (n-108)%256
  // Range -1131..-108 -> 2 bytes: -(n+108)/256 + 251, -(n+108)%256
  // Range -32768..32767 -> 5 bytes: 255, then 4-byte BE int
  n = Math.round(n);
  if (n >= -107 && n <= 107) {
    return Buffer.from([n + 139]);
  } else if (n >= 108 && n <= 1131) {
    n -= 108;
    return Buffer.from([Math.floor(n / 256) + 247, n & 0xff]);
  } else if (n >= -1131 && n <= -108) {
    n = -n - 108;
    return Buffer.from([Math.floor(n / 256) + 251, n & 0xff]);
  } else {
    // 32-bit big-endian
    const b = Buffer.alloc(5);
    b[0] = 255;
    b.writeInt32BE(n, 1);
    return b;
  }
}

function buildCharstring(glyph, advanceWidth) {
  const parts = [];
  // hsbw: side-bearing and width. We use lsb = bbox.minX (or 0 if undefined).
  const lsb = Math.round((glyph.bbox && Number.isFinite(glyph.bbox.minX)) ? glyph.bbox.minX : 0);
  parts.push(encNum(lsb));
  parts.push(encNum(Math.round(advanceWidth)));
  parts.push(Buffer.from([OP.HSBW]));

  // Process path commands. fontkit Path commands are absolute. Type 1 charstrings are relative.
  let curX = 0, curY = 0;
  let startX = 0, startY = 0;

  const path = glyph.path;
  const cmds = path && path.commands ? path.commands : [];
  let firstMove = true;

  for (const c of cmds) {
    if (c.type === 'M') {
      // If a sub-path was open, close it first
      if (!firstMove) {
        parts.push(Buffer.from([OP.CLOSEPATH]));
      }
      const dx = Math.round(c.x - curX), dy = Math.round(c.y - curY);
      if (dx === 0 && dy === 0) {
        // skip degenerate
      } else if (dy === 0) {
        parts.push(encNum(dx)); parts.push(Buffer.from([OP.HMOVETO]));
      } else if (dx === 0) {
        parts.push(encNum(dy)); parts.push(Buffer.from([OP.VMOVETO]));
      } else {
        parts.push(encNum(dx)); parts.push(encNum(dy)); parts.push(Buffer.from([OP.RMOVETO]));
      }
      curX = Math.round(c.x); curY = Math.round(c.y);
      startX = curX; startY = curY;
      firstMove = false;
    } else if (c.type === 'L') {
      const dx = Math.round(c.x - curX), dy = Math.round(c.y - curY);
      if (dx === 0 && dy === 0) { /* skip */ }
      else if (dy === 0) { parts.push(encNum(dx)); parts.push(Buffer.from([OP.HLINETO])); }
      else if (dx === 0) { parts.push(encNum(dy)); parts.push(Buffer.from([OP.VLINETO])); }
      else { parts.push(encNum(dx)); parts.push(encNum(dy)); parts.push(Buffer.from([OP.RLINETO])); }
      curX = Math.round(c.x); curY = Math.round(c.y);
    } else if (c.type === 'C') {
      // cubic Bezier: (x1,y1) (x2,y2) (x,y)
      const dx1 = Math.round(c.x1 - curX), dy1 = Math.round(c.y1 - curY);
      const dx2 = Math.round(c.x2 - c.x1), dy2 = Math.round(c.y2 - c.y1);
      const dx3 = Math.round(c.x  - c.x2), dy3 = Math.round(c.y  - c.y2);
      parts.push(encNum(dx1)); parts.push(encNum(dy1));
      parts.push(encNum(dx2)); parts.push(encNum(dy2));
      parts.push(encNum(dx3)); parts.push(encNum(dy3));
      parts.push(Buffer.from([OP.RRCURVETO]));
      curX = Math.round(c.x); curY = Math.round(c.y);
    } else if (c.type === 'Q') {
      // Convert quadratic to cubic on the fly.
      // Q control: (x1,y1) end: (x,y)
      // Cubic equivalent:
      //   c1 = cur + 2/3 (Q1 - cur)
      //   c2 = end + 2/3 (Q1 - end)
      const c1x = curX + (2/3) * (c.x1 - curX);
      const c1y = curY + (2/3) * (c.y1 - curY);
      const c2x = c.x   + (2/3) * (c.x1 - c.x);
      const c2y = c.y   + (2/3) * (c.y1 - c.y);
      const dx1 = Math.round(c1x - curX), dy1 = Math.round(c1y - curY);
      const dx2 = Math.round(c2x - c1x), dy2 = Math.round(c2y - c1y);
      const dx3 = Math.round(c.x  - c2x), dy3 = Math.round(c.y  - c2y);
      parts.push(encNum(dx1)); parts.push(encNum(dy1));
      parts.push(encNum(dx2)); parts.push(encNum(dy2));
      parts.push(encNum(dx3)); parts.push(encNum(dy3));
      parts.push(Buffer.from([OP.RRCURVETO]));
      curX = Math.round(c.x); curY = Math.round(c.y);
    } else if (c.type === 'Z') {
      parts.push(Buffer.from([OP.CLOSEPATH]));
      curX = startX; curY = startY;
    }
  }
  if (!firstMove) {
    // If the last sub-path wasn't explicitly closed, close it
    parts.push(Buffer.from([OP.CLOSEPATH]));
  }
  parts.push(Buffer.from([OP.ENDCHAR]));
  return Buffer.concat(parts);
}

// ---------- Charstring encryption ----------
function csEncrypt(raw) {
  // Prepend 4 random bytes ("random" — fixed for reproducibility)
  const leading = Buffer.from([0xab, 0xcd, 0xef, 0x12]);
  const plain = Buffer.concat([leading, raw]);
  let R = 4330;
  const c1 = 52845, c2 = 22719;
  const out = Buffer.alloc(plain.length);
  for (let i = 0; i < plain.length; i++) {
    const c = (plain[i] ^ (R >> 8)) & 0xff;
    out[i] = c;
    R = ((c + R) * c1 + c2) & 0xffff;
  }
  return out;
}
function eexecEncrypt(plainText) {
  const leading = Buffer.from([0xab, 0xcd, 0xef, 0x12]);
  const plain = Buffer.concat([leading, plainText]);
  let R = 55665;
  const c1 = 52845, c2 = 22719;
  const out = Buffer.alloc(plain.length);
  for (let i = 0; i < plain.length; i++) {
    const c = (plain[i] ^ (R >> 8)) & 0xff;
    out[i] = c;
    R = ((c + R) * c1 + c2) & 0xffff;
  }
  return out;
}

// ---------- Build the font ----------
const numGlyphs = font.numGlyphs;
console.log('numGlyphs:', numGlyphs);

// Collect glyph data
const glyphNames = [];
const glyphCharstrings = [];
for (let i = 0; i < numGlyphs; i++) {
  const g = font.getGlyph(i);
  let name = g.name || (i === 0 ? '.notdef' : `gid${i}`);
  glyphNames.push(name);
  const cs = buildCharstring(g, g.advanceWidth);
  const enc = csEncrypt(cs);
  glyphCharstrings.push(enc);
}

// Build encoding array — map byte codes 0..255 to glyph names by Unicode where possible.
// We use a custom encoding that matches the PDF /Differences we used: each byte N maps to
// the glyph at GID N (Identity), so the PostScript font behaves the same way the PDF does.
const encoding = [];
for (let i = 0; i < 256; i++) {
  if (i < numGlyphs) {
    encoding.push(glyphNames[i]);
  } else {
    encoding.push('.notdef');
  }
}

// ---------- Build the Type 1 text streams ----------
function lookupPostScriptName(font, code) {
  // Try to find a glyph for this character code.
  try {
    const g = font.glyphForCodePoint(code);
    return g && g.name;
  } catch { return null; }
}

// Header (cleartext) portion
const lines = [];
lines.push('%!PS-AdobeFont-1.0: Connections 1.003');
lines.push('%%CreationDate: 2026-05-21');
lines.push('%%Title: Connections Regular');
lines.push('%%Creator: Custom TTF->Type1 converter');
lines.push('%%Copyright: Copyright (c) 2013 Parachute. Exclusively designed for the Bank of America.');
lines.push('%%EndComments');
lines.push('11 dict begin');
lines.push('/FontInfo 10 dict dup begin');
lines.push('/version (1.003) readonly def');
lines.push('/Notice (Copyright (c) 2013 Parachute. Exclusively designed for the Bank of America.) readonly def');
lines.push('/FullName (Connections Regular) readonly def');
lines.push('/FamilyName (Connections) readonly def');
lines.push('/Weight (Regular) readonly def');
lines.push('/ItalicAngle 0 def');
lines.push('/isFixedPitch false def');
lines.push('/UnderlinePosition -100 def');
lines.push('/UnderlineThickness 50 def');
lines.push('end readonly def');
lines.push('/FontName /Connections def');
lines.push('/PaintType 0 def');
lines.push('/FontType 1 def');
lines.push('/FontMatrix [0.001 0 0 0.001 0 0] readonly def');
const bb = font.bbox;
lines.push(`/FontBBox{${Math.floor(bb.minX)} ${Math.floor(bb.minY)} ${Math.ceil(bb.maxX)} ${Math.ceil(bb.maxY)}}readonly def`);
lines.push('/Encoding 256 array');
lines.push('0 1 255 {1 index exch /.notdef put} for');
for (let i = 0; i < 256; i++) {
  if (encoding[i] !== '.notdef') {
    lines.push(`dup ${i}/${encoding[i]} put`);
  }
}
lines.push('readonly def');
lines.push('currentdict end');
lines.push('currentfile eexec');
const cleartext = Buffer.from(lines.join('\n') + '\n', 'latin1');

// Encrypted portion: contains Private dict and CharStrings
const eLines = [];
eLines.push('dup /Private 12 dict dup begin');
eLines.push('/-|{string currentfile exch readstring pop}executeonly def');
eLines.push('/|-{noaccess def}executeonly def');
eLines.push('/|{noaccess put}executeonly def');
eLines.push('/BlueValues [-12 0 488 500 685 697] def');
eLines.push('/OtherBlues [-244 -232] def');
eLines.push('/MinFeature{16 16} |-');
eLines.push('/password 5839 def');
eLines.push('/lenIV 4 def');
eLines.push('/Subrs 0 array def');  // No subroutines
eLines.push(`2 index /CharStrings ${numGlyphs} dict dup begin`);

// For each glyph, write its encrypted charstring as binary data using -| operator.
// The -| reads N bytes from the stream and treats them as raw data.
// However, eexec only allows ASCII-hex if we use the ASCII variant, or binary if pfb.
// For a .pfa file, the charstring binary bytes are typically embedded as hex strings
// using readhexstring instead. To keep things simple, we'll use hex strings.
// Define a hex variant: /-! { dup type /stringtype eq {readhexstring pop} ... } executeonly def
eLines.push('/RD{string currentfile exch readstring pop} executeonly def');

// We'll output charstrings as base16-encoded for hex compatibility in PFA.
// Standard pattern is binary bytes; PFA wraps them in (...) string. But Encapsulated
// strings in PostScript handle binary bytes fine if we escape parens and \.
function psBinaryStringLiteral(buf) {
  const parts = ['('];
  for (const b of buf) {
    if (b === 0x28) parts.push('\\(');
    else if (b === 0x29) parts.push('\\)');
    else if (b === 0x5c) parts.push('\\\\');
    else if (b === 0x0a) parts.push('\\n');
    else if (b === 0x0d) parts.push('\\r');
    else if (b === 0x08) parts.push('\\b');
    else if (b === 0x09) parts.push('\\t');
    else if (b === 0x0c) parts.push('\\f');
    else if (b >= 0x20 && b < 0x7f) parts.push(String.fromCharCode(b));
    else parts.push('\\' + b.toString(8).padStart(3, '0'));
  }
  parts.push(')');
  return parts.join('');
}

const usedNames = new Set();
for (let i = 0; i < numGlyphs; i++) {
  const name = glyphNames[i];
  // Each name must be unique. If a duplicate, append a suffix.
  let n = name;
  let k = 1;
  while (usedNames.has(n)) n = name + '$' + (k++);
  usedNames.add(n);
  const cs = glyphCharstrings[i];
  // Type 1 charstring entry: "/<name> <len> RD <bytes> ND"
  // ND = noaccess def (alias |-)
  eLines.push(`/${n} ${cs.length} RD ` + psBinaryStringLiteral(cs) + ' noaccess def');
}

eLines.push('end');
eLines.push('end');
eLines.push('readonly put');
eLines.push('noaccess put');
eLines.push('dup/FontName get exch definefont pop');
eLines.push('mark currentfile closefile');
const encPlain = Buffer.from(eLines.join('\n') + '\n', 'latin1');

const encrypted = eexecEncrypt(encPlain);

// Format encrypted bytes as ASCII hex, 64 chars per line
const hexLines = [];
let line = '';
for (const b of encrypted) {
  line += b.toString(16).padStart(2, '0').toUpperCase();
  if (line.length >= 64) { hexLines.push(line); line = ''; }
}
if (line.length) hexLines.push(line);

const trailer = '\n' + '0000000000000000000000000000000000000000000000000000000000000000\n'.repeat(8) + 'cleartomark\n';

const pfa = Buffer.concat([
  cleartext,
  Buffer.from(hexLines.join('\n') + '\n', 'latin1'),
  Buffer.from(trailer, 'latin1'),
]);

fs.writeFileSync('../Connections-Regular.pfa', pfa);
console.log(`Wrote ../Connections-Regular.pfa (${pfa.length} bytes, ${numGlyphs} glyphs)`);
