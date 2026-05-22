// Generalized PDF rewriter: convert every Type 0 (CID) /Connections font in the
// BANK STATEMENT PDF into a simple Type 1 font, replace its TrueType FontFile2
// with the CFF (Type 1C) form, rewrite the per-page content streams to use
// 1-byte codes instead of 2-byte CIDs, and rewrite the ToUnicode CMaps to match.
//
// We start from the *normalized* (object-streams expanded) copy and write a fresh
// PDF with a clean linear xref.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as fontkit from 'fontkit';

const SRC = 'normalized.pdf';

const text = fs.readFileSync(SRC, 'latin1');
const buf  = fs.readFileSync(SRC);

// ----------------------- Parse the PDF objects -----------------------
class PdfObj {
  constructor(num, gen, headerStart, dictStart, body, streamStart, streamLen, dictText) {
    this.num = num; this.gen = gen;
    this.body = body;
    this.dictText = dictText;
    this.streamStart = streamStart;
    this.streamLen = streamLen;
  }
  getStream() {
    if (this.streamStart === null) return null;
    let data = buf.slice(this.streamStart, this.streamStart + this.streamLen);
    if (/\/Filter\s+\/FlateDecode/.test(this.dictText)) {
      try { data = zlib.inflateSync(data); } catch (e) { /* maybe already plain */ }
    }
    return data;
  }
}
function parseAll() {
  const re = /(\d+) (\d+) obj\b/g;
  const objs = new Map();
  let m;
  while ((m = re.exec(text)) !== null) {
    const num = parseInt(m[1]);
    const gen = parseInt(m[2]);
    const bodyStart = m.index + m[0].length;
    const endIdx = text.indexOf('endobj', bodyStart);
    if (endIdx < 0) continue;
    const body = text.slice(bodyStart, endIdx);
    // Find optional stream
    const streamIdx = text.indexOf('stream', bodyStart);
    let dictText = body, streamStart = null, streamLen = 0;
    if (streamIdx >= 0 && streamIdx < endIdx) {
      dictText = text.slice(bodyStart, streamIdx);
      // Read /Length from dict
      const lenMatch = dictText.match(/\/Length\s+(\d+)/);
      if (lenMatch) {
        let s = streamIdx + 'stream'.length;
        if (buf[s] === 0x0d) s++;
        if (buf[s] === 0x0a) s++;
        streamStart = s;
        streamLen = parseInt(lenMatch[1]);
      }
    }
    objs.set(num, new PdfObj(num, gen, m.index, bodyStart, body, streamStart, streamLen, dictText));
  }
  return objs;
}
const objs = parseAll();
console.log('Parsed', objs.size, 'objects from', SRC);

// ----------------------- Identify Type 0 / CID fonts to convert -----------------------
const type0Fonts = []; // {num, baseFont, descendantObj, toUniObj, cidFontObj, fontDescriptorObj, fontFile2Obj}
const cidByDescArrayObj = {};

// First find Type 0 fonts whose Subtype is Type0
const fontByObj = {};
for (const [num, o] of objs) {
  if (/\/Type\s*\/Font\b/.test(o.body)) {
    const subtype = (o.body.match(/\/Subtype\s*\/([A-Za-z0-9]+)/) || [])[1];
    const baseFont = (o.body.match(/\/BaseFont\s*\/([\w+,\-\.]+)/) || [])[1];
    fontByObj[num] = { num, subtype, baseFont, body: o.body };
  }
}

for (const f of Object.values(fontByObj)) {
  if (f.subtype !== 'Type0') continue;
  if (!f.baseFont || !/Connections/.test(f.baseFont)) continue;  // Only handle Connections-family
  // Skip if it's a NON-Connections-Regular variant (other family names)
  // Pure regular has BaseFont like "XXXXXX+Connections" (no _CZEX suffix)
  if (!/^[A-Z]{6}\+Connections$/.test(f.baseFont)) continue;

  // Resolve DescendantFonts -> array obj -> first ref -> CID font obj
  const refMatch = f.body.match(/\/DescendantFonts\s+(\d+)\s+\d+\s+R/);
  if (!refMatch) continue;
  const arrObj = objs.get(parseInt(refMatch[1]));
  if (!arrObj) continue;
  const inner = arrObj.body.match(/\[\s*(\d+)\s+\d+\s+R/);
  if (!inner) continue;
  const cidObjNum = parseInt(inner[1]);
  const cidObj = objs.get(cidObjNum);
  if (!cidObj) continue;
  // Get FontDescriptor and CIDSystemInfo from the CIDFont
  const fdMatch = cidObj.body.match(/\/FontDescriptor\s+(\d+)\s+\d+\s+R/);
  if (!fdMatch) continue;
  const fdObjNum = parseInt(fdMatch[1]);
  const fdObj = objs.get(fdObjNum);
  if (!fdObj) continue;
  const ff2Match = fdObj.body.match(/\/FontFile2\s+(\d+)\s+\d+\s+R/);
  if (!ff2Match) continue;

  // ToUnicode CMap
  const tuMatch = f.body.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
  const toUniObj = tuMatch ? parseInt(tuMatch[1]) : null;

  type0Fonts.push({
    num: f.num, baseFont: f.baseFont,
    descArrayObj: parseInt(refMatch[1]),
    cidFontObj: cidObjNum,
    fontDescriptorObj: fdObjNum,
    fontFile2Obj: parseInt(ff2Match[1]),
    toUniObj,
  });
}

console.log('Type 0 Connections fonts to convert:', type0Fonts.length);
for (const f of type0Fonts) console.log(`  obj ${f.num}: ${f.baseFont} -> CID=${f.cidFontObj} FD=${f.fontDescriptorObj} FF2=${f.fontFile2Obj} ToUni=${f.toUniObj}`);

// They all share the same FontFile2 and FontDescriptor (verified earlier)
const sharedFontFile2 = type0Fonts[0].fontFile2Obj;
const sharedFontDescriptor = type0Fonts[0].fontDescriptorObj;
const allShareFF2 = type0Fonts.every(f => f.fontFile2Obj === sharedFontFile2);
console.log('All Type 0 fonts share FontFile2?', allShareFF2);

// Verify the embedded TTF is the Connections Regular we already converted
const embeddedTTF = objs.get(sharedFontFile2).getStream();
const cffData = fs.readFileSync('Connections-Regular.cff');
console.log('Embedded TTF length:', embeddedTTF.length);
console.log('Our CFF length:', cffData.length);

// ----------------------- Build the new font program -----------------------
// We'll use the *full* ConnectionsRegular CFF (231 glyphs) for all fonts.
// The original embedded TTF is a subset of that font (8052 bytes — same as DUMMY.pdf)
// but we don't really need to keep subsetting; embedding the full ~33KB CFF once
// adds <100KB to a 400KB PDF and is much simpler.

const otfFont = fontkit.create(fs.readFileSync('Connections-Regular.otf'));
const N_GLYPHS = otfFont.numGlyphs;
console.log('Full font glyph count:', N_GLYPHS);

function glyphName(gid) {
  try { return otfFont.getGlyph(gid).name || ('gid' + gid); }
  catch { return 'gid' + gid; }
}
function glyphWidth(gid) {
  try { return Math.round(otfFont.getGlyph(gid).advanceWidth); }
  catch { return 0; }
}

// Build /Differences encoding covering glyphs 0..230, then widths
const diffParts = ['0'];
for (let g = 0; g < N_GLYPHS; g++) diffParts.push('/' + glyphName(g));
const diffStr = diffParts.join(' ');
const widthsArr = []; for (let g = 0; g < N_GLYPHS; g++) widthsArr.push(glyphWidth(g));
const widthsStr = widthsArr.join(' ');

// ----------------------- Parse a ToUnicode CMap and convert to 1-byte form -----------------------
function convertToUnicodeCMap(cmap) {
  // Change codespacerange from <0000><FFFF> -> <00><FF>
  // Change bfchar/bfrange entries: 4-hex-digit codes -> 2-hex-digit codes
  let t = cmap.toString('latin1');
  // codespacerange
  t = t.replace(/begincodespacerange[\s\S]*?endcodespacerange/g, '1 begincodespacerange\n<00><FF>\nendcodespacerange');
  // bfchar entries: <NNNN> <UUUU...>  =>  <NN> <UUUU...>
  t = t.replace(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g, (m, a, b) => {
    // Only collapse if high byte is 00
    if (a.slice(0,2) === '00') return `<${a.slice(2)}> <${b}>`;
    return m;
  });
  // bfrange entries: <NNNN><NNNN> <UUUU>  =>  <NN><NN> <UUUU>
  t = t.replace(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g, (m, a, b, u) => {
    if (a.slice(0,2) === '00' && b.slice(0,2) === '00')
      return `<${a.slice(2)}><${b.slice(2)}> <${u}>`;
    return m;
  });
  // bfrange entries with array target: <NNNN><NNNN> [ <UU> <UU> ... ]
  t = t.replace(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>\s*\[/g, (m, a, b) => {
    if (a.slice(0,2) === '00' && b.slice(0,2) === '00')
      return `<${a.slice(2)}><${b.slice(2)}> [`;
    return m;
  });
  return Buffer.from(t, 'latin1');
}

// ----------------------- Rewrite content streams -----------------------
// For each page, identify which /Fxx names map to one of the Type 0 fonts being converted.
// In that page's content stream(s), for any text under one of those font selectors,
// rewrite the hex string from 4-hex-digits-per-glyph to 2-hex-digits-per-glyph.
const targetObjSet = new Set(type0Fonts.map(f => f.num));
console.log('\nProcessing pages...');

const newContentStreams = new Map();  // contentObjNum -> new content Buffer

for (const [pageNum, pageObj] of objs) {
  if (!/\/Type\s*\/Page\b/.test(pageObj.body)) continue;
  if (/\/Type\s*\/Pages\b/.test(pageObj.body)) continue;
  // Find Resources sub-dict, properly tracking nested << >>
  function extractDict(text, key) {
    // Find /key followed by either an indirect ref or an inline <<...>>
    const refRe = new RegExp('\\/' + key + '\\s+(\\d+)\\s+\\d+\\s+R');
    const refMatch = text.match(refRe);
    if (refMatch) {
      const ro = objs.get(parseInt(refMatch[1]));
      if (ro) {
        // Get just the inner dict text
        const m2 = ro.body.match(/<<([\s\S]*)>>/);
        return m2 ? m2[1] : ro.body;
      }
    }
    const keyIdx = text.indexOf('/' + key);
    if (keyIdx < 0) return null;
    // Skip whitespace after key
    let i = keyIdx + ('/' + key).length;
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] !== '<' || text[i+1] !== '<') return null;
    // Walk forward, tracking << >> nesting
    let depth = 1;
    i += 2;
    const start = i;
    while (i < text.length && depth > 0) {
      if (text[i] === '<' && text[i+1] === '<') { depth++; i += 2; }
      else if (text[i] === '>' && text[i+1] === '>') { depth--; i += 2; }
      else i++;
    }
    return text.slice(start, i - 2);
  }
  let resourcesBlob = extractDict(pageObj.body, 'Resources');
  if (!resourcesBlob) continue;
  let fontDict = extractDict(resourcesBlob, 'Font');
  if (!fontDict) continue;
  const allMappings = [...fontDict.matchAll(/\/([A-Za-z][\w]*)\s+(\d+)\s+\d+\s+R/g)];
  const targetNames = new Set();
  for (const mm of allMappings) {
    if (targetObjSet.has(parseInt(mm[2]))) targetNames.add(mm[1]);
  }
  if (targetNames.size === 0) continue;
  // Get Contents (might be single ref or array)
  let contentRefs = [];
  const cRef = pageObj.body.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
  const cArr = pageObj.body.match(/\/Contents\s*\[([^\]]+)\]/);
  if (cRef) contentRefs.push(parseInt(cRef[1]));
  else if (cArr) for (const m2 of cArr[1].matchAll(/(\d+)\s+\d+\s+R/g)) contentRefs.push(parseInt(m2[1]));
  console.log(`  Page ${pageNum}: target fonts /${[...targetNames].join(', /')}, content streams=${contentRefs.join(',')}`);

  for (const cn of contentRefs) {
    const co = objs.get(cn);
    if (!co) continue;
    const raw = co.getStream();
    if (!raw) continue;
    let txt = raw.toString('latin1');
    const newTxt = rewriteContentStream(txt, targetNames);
    if (txt !== newTxt) {
      newContentStreams.set(cn, Buffer.from(newTxt, 'latin1'));
    }
  }
}

function rewriteContentStream(txt, targetNames) {
  // We need to track current font selection and rewrite hex strings that follow Tj/TJ
  // while the current font is one of the target names.
  // The Tf operator: "/name size Tf"
  // Tj operator: "<hex> Tj" or "(string) Tj"
  // TJ operator: "[ ( ) num <hex> ... ] TJ"
  //
  // Approach: tokenize coarsely. We'll do regex-based replacement scoped by Tf operations.
  // Find all "/<name> <size> Tf" occurrences; partition the stream into ranges, each
  // tagged with the font name in effect for that range. Apply hex-string rewrites
  // inside ranges whose font is in targetNames.
  const tfRe = /\/([A-Za-z][\w]*)\s+([\-\d.]+)\s+Tf/g;
  const tfPositions = [];
  let m;
  while ((m = tfRe.exec(txt)) !== null) {
    tfPositions.push({ pos: m.index + m[0].length, name: m[1], rawStart: m.index, rawLen: m[0].length });
  }
  if (tfPositions.length === 0) return txt;
  const ranges = [];
  let cursor = 0;
  let curFont = null;
  for (const tf of tfPositions) {
    ranges.push({ from: cursor, to: tf.rawStart, font: curFont });
    ranges.push({ from: tf.rawStart, to: tf.pos, font: curFont, isTf: true });
    cursor = tf.pos;
    curFont = tf.name;
  }
  ranges.push({ from: cursor, to: txt.length, font: curFont });

  const chunks = [];
  for (const r of ranges) {
    let s = txt.slice(r.from, r.to);
    if (!r.isTf && targetNames.has(r.font)) {
      // Rewrite hex strings: < ... > occurring before Tj / TJ.
      // Simpler: just rewrite ALL hex strings in this range, since this range is "text under target font"
      s = s.replace(/<([0-9A-Fa-f\s]+)>/g, (mm, hex) => {
        const h = hex.replace(/\s+/g, '');
        if (h.length % 4 !== 0) return mm;  // not 2-byte CIDs
        let out = '';
        for (let i = 0; i < h.length; i += 4) {
          if (h.substr(i, 2) !== '00') return mm;  // non-collapsible
          out += h.substr(i + 2, 2);
        }
        return '<' + out + '>';
      });
    }
    chunks.push(s);
  }
  return chunks.join('');
}

console.log(`\nRewrote ${newContentStreams.size} content streams.`);

// ----------------------- Rewrite the font objects -----------------------
// For each of the 17 Type 0 fonts, generate a fresh simple Type 1 dict.
// Each gets its OWN FontDescriptor copy + its OWN /FontFile3 stream so that
// PDF readers can never confuse one with another via shared resources.
const newFontDicts = new Map();
const extraObjs = new Map(); // objNum -> { dict, stream? }
let nextNewObjNum = Math.max(...objs.keys()) + 1;

const cffCompressed = zlib.deflateSync(cffData);

for (const f of type0Fonts) {
  // Allocate a new FontDescriptor and new FontFile3 stream for this font
  const ffObjNum = nextNewObjNum++;
  const fdObjNum = nextNewObjNum++;
  extraObjs.set(ffObjNum, { kind: 'stream', dict: `<< /Subtype /Type1C /Filter /FlateDecode /Length ${cffCompressed.length} >>`, stream: cffCompressed });
  extraObjs.set(fdObjNum, { kind: 'dict', dict: `<<
/Type /FontDescriptor
/FontName /${f.baseFont}
/FontFamily (Connections)
/FontStretch /Normal
/FontWeight 400
/Flags 4
/FontBBox [ -47 -244 962 923 ]
/ItalicAngle 0
/Ascent 923
/Descent -244
/CapHeight 685
/XHeight 488
/StemV 84
/FontFile3 ${ffObjNum} 0 R
>>` });

  const dict = `<<
/Type /Font
/Subtype /Type1
/BaseFont /${f.baseFont}
/FirstChar 0
/LastChar ${N_GLYPHS - 1}
/Widths [ ${widthsStr} ]
/FontDescriptor ${fdObjNum} 0 R
/Encoding <<
/Type /Encoding
/Differences [ ${diffStr} ]
>>
${f.toUniObj ? `/ToUnicode ${f.toUniObj} 0 R` : ''}
>>`;
  newFontDicts.set(f.num, dict);
}

// The original FontDescriptor (168) and FontFile2 (142) are no longer referenced
// by any of our converted fonts (each new font has its own copies). Drop them too.

// New ToUnicode CMaps: convert each to 1-byte form
const newToUnicodeStreams = new Map(); // objNum -> Buffer (uncompressed)
for (const f of type0Fonts) {
  if (!f.toUniObj) continue;
  if (newToUnicodeStreams.has(f.toUniObj)) continue;
  const tu = objs.get(f.toUniObj);
  if (!tu) continue;
  const raw = tu.getStream();
  if (!raw) continue;
  const converted = convertToUnicodeCMap(raw);
  newToUnicodeStreams.set(f.toUniObj, converted);
}

// Drop the CIDFont (descendant), DescendantFonts arrays, original FontDescriptor,
// and original FontFile2 stream — none of them are referenced anymore.
const droppedObjs = new Set();
for (const f of type0Fonts) droppedObjs.add(f.descArrayObj);
droppedObjs.add(type0Fonts[0].cidFontObj);
droppedObjs.add(sharedFontDescriptor);
droppedObjs.add(sharedFontFile2);
console.log('Will drop CID-related objects:', [...droppedObjs].sort((a,b)=>a-b).join(','));

// ----------------------- Emit the new PDF -----------------------
const out = [];
out.push(Buffer.from('%PDF-1.6\n%\xE2\xE3\xCF\xD3\n', 'latin1'));
function curLen() { return out.reduce((a, b) => a + b.length, 0); }
function emit(s) { out.push(typeof s === 'string' ? Buffer.from(s, 'latin1') : s); }
const xref = new Map();

const maxNum = Math.max(...objs.keys(), ...extraObjs.keys());
for (let n = 1; n <= maxNum; n++) {
  // New extra objects (FontDescriptors + FontFile3 streams for new Type 1 fonts)
  if (extraObjs.has(n)) {
    const e = extraObjs.get(n);
    xref.set(n, curLen());
    emit(`${n} 0 obj\n`);
    if (e.kind === 'stream') {
      emit(e.dict + '\nstream\n');
      emit(e.stream);
      emit('\nendstream\n');
    } else {
      emit(e.dict + '\n');
    }
    emit('endobj\n');
    continue;
  }
  if (!objs.has(n)) continue;
  if (droppedObjs.has(n)) continue;
  const o = objs.get(n);
  xref.set(n, curLen());
  emit(`${n} ${o.gen} obj\n`);

  if (newFontDicts.has(n)) {
    emit(newFontDicts.get(n) + '\n');
  } else if (newContentStreams.has(n)) {
    const data = newContentStreams.get(n);
    const compressed = zlib.deflateSync(data);
    emit(`<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`);
    emit(compressed);
    emit('\nendstream\n');
  } else if (newToUnicodeStreams.has(n)) {
    const data = newToUnicodeStreams.get(n);
    const compressed = zlib.deflateSync(data);
    emit(`<< /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`);
    emit(compressed);
    emit('\nendstream\n');
  } else if (o.streamStart !== null) {
    // Stream passthrough (recompress if originally FlateDecode'd to keep PDF small)
    const raw = o.getStream();
    // Recompress
    const compressed = zlib.deflateSync(raw);
    // Filter out /Length and /Filter from the dict so we can add fresh ones
    let dictText = o.dictText.replace(/<<([\s\S]*?)>>/, (m, inner) => {
      let cleaned = inner.replace(/\/Length\s+\d+/g, '').replace(/\/Filter\s+\/\w+/g, '').replace(/\/Filter\s*\[[^\]]*\]/g, '');
      return `<<${cleaned} /Filter /FlateDecode /Length ${compressed.length} >>`;
    });
    emit(dictText.trim() + '\nstream\n');
    emit(compressed);
    emit('\nendstream\n');
  } else {
    emit(o.body.trim() + '\n');
  }
  emit('endobj\n');
}

// xref
const xrefStart = curLen();
emit('xref\n');
emit(`0 ${maxNum + 1}\n`);
emit('0000000000 65535 f \n');
for (let n = 1; n <= maxNum; n++) {
  if (xref.has(n)) emit(`${String(xref.get(n)).padStart(10, '0')} 00000 n \n`);
  else emit('0000000000 00000 f \n');
}
// trailer
const trailerMatch = text.match(/trailer\s*<<([\s\S]*?)>>/);
const trailerDict = trailerMatch ? trailerMatch[1].trim() : '';
// Strip /Size and /Prev from existing dict and add fresh /Size
const cleanedTrailer = trailerDict.replace(/\/Size\s+\d+/g, '').replace(/\/Prev\s+\d+/g, '');
emit(`trailer << ${cleanedTrailer} /Size ${maxNum + 1} >>\nstartxref\n${xrefStart}\n%%EOF\n`);

const outBuf = Buffer.concat(out);
const outPath = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
fs.writeFileSync(outPath, outBuf);
console.log(`Wrote ${outPath} (${outBuf.length} bytes from ${buf.length})`);
