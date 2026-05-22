// Rebuild DUMMY.pdf with the "Connections" font embedded as PostScript Type 1 (CFF)
// instead of as a TrueType CID font.
//
// Transformations:
//   Object 17 (Type0 Connections)         -> simple Type1 font dict
//   Object 47 (FontDescriptor /FontFile2) -> same descriptor with /FontFile3 instead
//   Object 48 (TTF stream)                -> CFF (Type1C) stream
//   Object 45 (ToUnicode CMap)            -> rewritten with 1-byte codespace ranges
//   Object 3  (content stream)            -> hex strings for /G1 compressed from 2-byte to 1-byte
//   Objects 44 (CIDFont)                  -> dropped (no longer referenced)

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const srcPath = path.resolve('../DUMMY.pdf');
const buf = fs.readFileSync(srcPath);
const text = buf.toString('latin1');

// ------------------------------------------------------------------------------
// 1. Parse the PDF into objects, keeping each object's dict text and raw stream
// ------------------------------------------------------------------------------
function parseObjects(buf, text) {
  const objs = new Map();
  const re = /(\d+) (\d+) obj\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const num = parseInt(m[1]);
    const headerStart = m.index;
    const bodyStart = headerStart + m[0].length;
    const endIdx = text.indexOf('endobj', bodyStart);
    const body = text.slice(bodyStart, endIdx);
    // Detect stream
    const streamIdx = text.indexOf('stream', bodyStart);
    let dictText, streamData = null;
    if (streamIdx >= 0 && streamIdx < endIdx) {
      dictText = text.slice(bodyStart, streamIdx).trim();
      const lenMatch = dictText.match(/\/Length\s+(\d+)/);
      if (lenMatch) {
        let s = streamIdx + 'stream'.length;
        if (buf[s] === 0x0d) s++;
        if (buf[s] === 0x0a) s++;
        streamData = buf.slice(s, s + parseInt(lenMatch[1]));
      }
    } else {
      dictText = body.trim();
    }
    objs.set(num, { num, dictText, streamData, gen: parseInt(m[2]) });
  }
  return objs;
}

const objs = parseObjects(buf, text);
console.log('Parsed', objs.size, 'objects');

// ------------------------------------------------------------------------------
// 2. Decode the content stream and rewrite /G1 hex strings 4-hex -> 2-hex
// ------------------------------------------------------------------------------
function decodeStream(o) {
  if (!o.streamData) return null;
  if (/\/Filter\s+\/FlateDecode/.test(o.dictText)) {
    return zlib.inflateSync(o.streamData);
  }
  return o.streamData;
}

const contentOrig = decodeStream(objs.get(3));
const contentText = contentOrig.toString('latin1');

// Rewrite hex strings used with /G1
// We need to find each /G1 ... <hex> Tj sequence and shrink the hex.
// Simpler: scan the stream and only touch hex strings that follow /G1 ... Tf (until next Tf).
const fontTfRe = /\/([A-Za-z][\w]*)\s+([\-\d.]+)\s+Tf/g;
// Walk through text and segment by Tf operations
// Strategy: collect ranges where currentFont == G1, and within those ranges rewrite hex strings
const segments = [];
let lastIdx = 0;
let curFont = null;
fontTfRe.lastIndex = 0;
let mm;
const tfPositions = [];
while ((mm = fontTfRe.exec(contentText)) !== null) {
  tfPositions.push({ idx: mm.index + mm[0].length, name: mm[1], rawStart: mm.index, raw: mm[0] });
}
// Build [start, end, font] ranges
let i = 0;
let outChunks = [];
let scanStart = 0;
let font = null;
const ranges = [];
for (let k = 0; k < tfPositions.length; k++) {
  const tf = tfPositions[k];
  // The font for the range starting AFTER tf.idx is tf.name. The range BEFORE this tf had `font`.
  ranges.push({ from: scanStart, to: tf.rawStart, font });
  // include the Tf token itself in the next range
  ranges.push({ from: tf.rawStart, to: tf.idx, font: tf.name, isTfToken: true });
  scanStart = tf.idx;
  font = tf.name;
}
ranges.push({ from: scanStart, to: contentText.length, font });

// Now process each range
for (const r of ranges) {
  let chunk = contentText.slice(r.from, r.to);
  if (r.font === 'G1' && !r.isTfToken) {
    // Rewrite all hex strings <....> in this chunk: drop high byte pairs
    chunk = chunk.replace(/<([0-9A-Fa-f\s]+)>/g, (_, hex) => {
      const h = hex.replace(/\s+/g, '');
      let out = '';
      for (let p = 0; p + 4 <= h.length; p += 4) {
        // Each 4-hex chunk: high byte must be 00 (we verified earlier)
        const hi = h.substr(p, 2);
        const lo = h.substr(p + 2, 2);
        if (hi !== '00') {
          // Shouldn't happen — but be safe: keep original size
          out = null;
          break;
        }
        out += lo;
      }
      return out !== null ? `<${out}>` : `<${h}>`;
    });
  }
  outChunks.push(chunk);
}
const newContentText = outChunks.join('');
const newContent = Buffer.from(newContentText, 'latin1');
console.log('Content stream rewritten: orig', contentOrig.length, '-> new', newContent.length);

// ------------------------------------------------------------------------------
// 3. Build the new ToUnicode CMap for the simple Type 1 font (1-byte codespace)
// ------------------------------------------------------------------------------
const newToUnicode = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo <<
  /Registry (Adobe)
  /Ordering (UCS)
  /Supplement 0
>> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<00><FF>
endcodespacerange
7 beginbfrange
<03><03><0020>
<14><14><0031>
<1b><1b><0038>
<33><33><0050>
<44><44><0061>
<48><4a><0065>
<52><52><006f>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;

// ------------------------------------------------------------------------------
// 4. Read the CFF for the new font, and build the Type 1 font dict
// ------------------------------------------------------------------------------
const cffBuf = fs.readFileSync('Connections-Regular.cff');

// Glyph names per GID (PostScript names) — we found these earlier.
// Build /Differences array from GID 3 through 122 (the used range) covering ALL GIDs
// in that range. opentype.js generates standard PostScript names.
import * as fontkit from 'fontkit';
const cffFont = fontkit.create(fs.readFileSync('Connections-Regular.otf'));
const gidWidth = (gid) => {
  try { return cffFont.getGlyph(gid).advanceWidth; } catch { return 0; }
};
const gidName = (gid) => {
  try { return cffFont.getGlyph(gid).name || `gid${gid}`; } catch { return `gid${gid}`; }
};

const FIRST = 0, LAST = 230;  // Cover all glyphs so the encoding is complete
const differences = [];
let prev = null;
let group = [];
function flushGroup(start) {
  if (group.length) {
    differences.push(`${start} ${group.map(n => '/' + n).join(' ')}`);
    group = [];
  }
}
let groupStart = null;
for (let g = FIRST; g <= LAST; g++) {
  if (groupStart === null) groupStart = g;
  group.push(gidName(g));
}
flushGroup(groupStart);
const diffStr = differences.join(' ');

// Widths array (FirstChar..LastChar)
const widths = [];
for (let g = FIRST; g <= LAST; g++) widths.push(gidWidth(g));

// New Object 17: simple Type1 font dict
const newObj17Dict = `<< /Type /Font /Subtype /Type1 /BaseFont /AAAAAM+Connections /FirstChar ${FIRST} /LastChar ${LAST} /Widths [ ${widths.join(' ')} ] /FontDescriptor 47 0 R /Encoding << /Type /Encoding /Differences [ ${diffStr} ] >> /ToUnicode 45 0 R >>`;

// New FontDescriptor (Object 47): change FontFile2 -> FontFile3
const desc47 = objs.get(47).dictText;
const newObj47Dict = desc47.replace(/\/FontFile2\s+48\s+0\s+R/, '/FontFile3 48 0 R');

// New stream for Object 48: CFF data, with FlateDecode
const cffCompressed = zlib.deflateSync(cffBuf);
const newObj48Dict = `<< /Subtype /Type1C /Filter /FlateDecode /Length ${cffCompressed.length} >>`;

// New ToUnicode stream (Object 45)
const toUniCompressed = zlib.deflateSync(Buffer.from(newToUnicode, 'latin1'));
const newObj45Dict = `<< /Filter /FlateDecode /Length ${toUniCompressed.length} >>`;

// New content stream (Object 3)
const newContentCompressed = zlib.deflateSync(newContent);
const newObj3Dict = `<< /Filter /FlateDecode /Length ${newContentCompressed.length} >>`;

// ------------------------------------------------------------------------------
// 5. Emit the new PDF
// ------------------------------------------------------------------------------
const out = [];
out.push(Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1'));

const xref = new Map(); // objNum -> offset

function emit(s) { out.push(typeof s === 'string' ? Buffer.from(s, 'latin1') : s); }
function curLen() { return out.reduce((a, b) => a + b.length, 0); }

const maxNum = Math.max(...objs.keys());

// Drop object 44 — the CIDFont descendant — since it's no longer referenced.
// (Leaving it would create unused but valid object; dropping keeps things tidy.)
const dropped = new Set([44]);

for (let n = 1; n <= maxNum; n++) {
  if (!objs.has(n)) continue;
  if (dropped.has(n)) continue;
  xref.set(n, curLen());
  const o = objs.get(n);
  emit(`${n} ${o.gen} obj\n`);
  if (n === 17) {
    emit(newObj17Dict + '\n');
  } else if (n === 47) {
    emit(newObj47Dict + '\n');
  } else if (n === 48) {
    emit(newObj48Dict + '\nstream\n');
    emit(cffCompressed);
    emit('\nendstream\n');
  } else if (n === 45) {
    emit(newObj45Dict + '\nstream\n');
    emit(toUniCompressed);
    emit('\nendstream\n');
  } else if (n === 3) {
    emit(newObj3Dict + '\nstream\n');
    emit(newContentCompressed);
    emit('\nendstream\n');
  } else if (o.streamData) {
    // Pass-through stream object. We need to also update /Length if data length changed
    // (it didn't here — we keep all other streams byte-identical).
    emit(o.dictText + '\nstream\n');
    emit(o.streamData);
    emit('\nendstream\n');
  } else {
    emit(o.dictText + '\n');
  }
  emit('endobj\n');
}

// XRef table
const xrefStart = curLen();
emit('xref\n');
emit(`0 ${maxNum + 1}\n`);
emit('0000000000 65535 f \n');
for (let n = 1; n <= maxNum; n++) {
  if (xref.has(n)) {
    emit(`${String(xref.get(n)).padStart(10, '0')} 00000 n \n`);
  } else {
    // Free entry (for object 44 which we dropped)
    emit('0000000000 00000 f \n');
  }
}
// Find trailer Root and Info from original
const trailerMatch = text.match(/trailer\s*<<([\s\S]*?)>>/);
const trailerDict = trailerMatch ? trailerMatch[1] : '/Root 5 0 R';
emit(`trailer << ${trailerDict.trim()} /Size ${maxNum + 1} >>\nstartxref\n${xrefStart}\n%%EOF\n`);

const outBuf = Buffer.concat(out);
const outPath = path.resolve('../DUMMY-Type1.pdf');
fs.writeFileSync(outPath, outBuf);
console.log(`Wrote ${outPath} (${outBuf.length} bytes)`);
