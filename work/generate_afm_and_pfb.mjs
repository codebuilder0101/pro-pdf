// Generate AFM (Adobe Font Metrics) and PFB (PostScript Font Binary) companion files
import * as fontkit from 'fontkit';
import fs from 'fs';

const TTF = fs.readFileSync('../ConnectionsRegular.ttf');
const font = fontkit.create(TTF);

// ---------------------------- AFM ----------------------------
const lines = [];
const bb = font.bbox;
lines.push('StartFontMetrics 4.1');
lines.push('Comment Copyright (c) 2013 Parachute. Exclusively designed for the Bank of America.');
lines.push('Comment Converted from ConnectionsRegular.ttf');
lines.push('FontName Connections');
lines.push('FullName Connections Regular');
lines.push('FamilyName Connections');
lines.push('Weight Regular');
lines.push('ItalicAngle 0');
lines.push('IsFixedPitch false');
lines.push(`FontBBox ${Math.floor(bb.minX)} ${Math.floor(bb.minY)} ${Math.ceil(bb.maxX)} ${Math.ceil(bb.maxY)}`);
lines.push('UnderlinePosition -100');
lines.push('UnderlineThickness 50');
lines.push(`Version 1.003`);
lines.push('EncodingScheme FontSpecific');
lines.push(`CapHeight ${font.capHeight || 685}`);
lines.push(`XHeight ${font.xHeight || 488}`);
lines.push(`Ascender ${font.ascent}`);
lines.push(`Descender ${font.descent}`);

const N = font.numGlyphs;
lines.push(`StartCharMetrics ${N}`);
for (let i = 0; i < N; i++) {
  const g = font.getGlyph(i);
  const name = g.name || (i === 0 ? '.notdef' : `gid${i}`);
  const w = Math.round(g.advanceWidth);
  const bx = g.bbox;
  const bxs = `${Math.floor(bx.minX)} ${Math.floor(bx.minY)} ${Math.ceil(bx.maxX)} ${Math.ceil(bx.maxY)}`;
  // Encoding: we use Identity mapping (byte code i if i < 256 else -1)
  const code = (i < 256) ? i : -1;
  lines.push(`C ${code} ; WX ${w} ; N ${name} ; B ${bxs} ;`);
}
lines.push('EndCharMetrics');
lines.push('EndFontMetrics');
const afm = lines.join('\n') + '\n';
fs.writeFileSync('../Connections-Regular.afm', afm);
console.log(`Wrote ../Connections-Regular.afm (${afm.length} bytes)`);

// ---------------------------- PFB ----------------------------
// PFB is the binary variant of PFA, with three "blocks":
//   Block 1: ASCII text (header up to "currentfile eexec\n")
//   Block 2: binary (the eexec-encrypted bytes, raw, NOT hex)
//   Block 3: ASCII text (trailing zeros + "cleartomark")
// Each block is preceded by:  0x80, blockType (1=ascii, 2=binary, 3=eof), 4-byte little-endian length.
// Final block:                 0x80, 0x03
//
// We need to regenerate the cleartext + encrypted-binary + cleartext-trailer for PFB.
//
// Easiest path: read the PFA we just made and re-serialize.
const pfaText = fs.readFileSync('../Connections-Regular.pfa', 'latin1');
const eexecMarker = 'currentfile eexec\n';
const eexecIdx = pfaText.indexOf(eexecMarker);
const cleartomarkMarker = 'cleartomark';
const cleartomarkIdx = pfaText.indexOf(cleartomarkMarker);

const block1Text = pfaText.slice(0, eexecIdx + eexecMarker.length);
const hexBlock = pfaText.slice(eexecIdx + eexecMarker.length, cleartomarkIdx).replace(/\s+/g, '');
const block3Text = '\n' + '0'.repeat(64) + '\n'.repeat(0) + pfaText.slice(cleartomarkIdx);

// Convert hex back to binary
const block2 = Buffer.alloc(hexBlock.length / 2);
for (let i = 0; i < block2.length; i++) {
  block2[i] = parseInt(hexBlock.substr(i * 2, 2), 16);
}

function pfbHeader(type, length) {
  const h = Buffer.alloc(6);
  h[0] = 0x80; h[1] = type;
  h.writeUInt32LE(length, 2);
  return h;
}

const block1Buf = Buffer.from(block1Text, 'latin1');
// Recreate block 3 as 8 lines of 64 zeros + cleartomark
const block3 = Buffer.from('\n' + ('0'.repeat(64) + '\n').repeat(8) + 'cleartomark\n', 'latin1');

const pfb = Buffer.concat([
  pfbHeader(1, block1Buf.length), block1Buf,
  pfbHeader(2, block2.length),    block2,
  pfbHeader(1, block3.length),    block3,
  Buffer.from([0x80, 0x03]),
]);
fs.writeFileSync('../Connections-Regular.pfb', pfb);
console.log(`Wrote ../Connections-Regular.pfb (${pfb.length} bytes)`);
