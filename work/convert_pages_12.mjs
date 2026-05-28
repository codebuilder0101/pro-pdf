// Convert the 2-page extracted PDF: every Type 0 Connections font becomes a simple Type 1.
// Uses the clean non-CID CFF (Connections-Regular-Simple.cff).

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as fontkit from 'fontkit';

const SRC = 'bank_p3_original.pdf';
const DST = path.resolve('../asset/BANK-p3-Type1.pdf');

const text = fs.readFileSync(SRC, 'latin1');
const buf  = fs.readFileSync(SRC);

class PdfObj {
  constructor(num, gen, dictText, streamData) {
    this.num = num; this.gen = gen;
    this.dictText = dictText;
    this.streamData = streamData;
  }
  isStream() { return this.streamData !== null; }
  getStream() {
    if (!this.streamData) return null;
    if (/\/Filter\s+\/FlateDecode/.test(this.dictText)) {
      try { return zlib.inflateSync(this.streamData); } catch (e) { return this.streamData; }
    }
    return this.streamData;
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
    const streamIdx = text.indexOf('stream', bodyStart);
    let dictText, streamData = null;
    if (streamIdx >= 0 && streamIdx < endIdx) {
      dictText = text.slice(bodyStart, streamIdx);
      const lenMatch = dictText.match(/\/Length\s+(\d+)/);
      if (lenMatch) {
        let s = streamIdx + 'stream'.length;
        if (buf[s] === 0x0d) s++;
        if (buf[s] === 0x0a) s++;
        streamData = buf.slice(s, s + parseInt(lenMatch[1]));
      }
    } else {
      dictText = text.slice(bodyStart, endIdx);
    }
    objs.set(num, new PdfObj(num, gen, dictText, streamData));
  }
  return objs;
}

const objs = parseAll();
console.log('Parsed', objs.size, 'objects');

// ---------- Identify Type 0 fonts to convert ----------
const type0Fonts = [];
const cidFontByNum = new Map();
for (const [num, o] of objs) {
  if (/\/Type\s*\/Font\b/.test(o.dictText)) {
    const subtype = (o.dictText.match(/\/Subtype\s*\/([A-Za-z0-9]+)/) || [])[1];
    const baseFont = (o.dictText.match(/\/BaseFont\s*\/([\w+,\-\.]+)/) || [])[1];
    if (subtype === 'Type0' && baseFont && /^[A-Z]{6}\+Connections$/.test(baseFont)) {
      // Resolve descendant -> CIDFont -> FontDescriptor -> FontFile2
      let descObjNum = null;
      const inline = o.dictText.match(/\/DescendantFonts\s*\[\s*(\d+)\s+\d+\s+R/);
      if (inline) descObjNum = parseInt(inline[1]);
      else {
        const ref = o.dictText.match(/\/DescendantFonts\s+(\d+)\s+\d+\s+R/);
        if (ref) {
          const arr = objs.get(parseInt(ref[1]));
          if (arr) {
            const inner = arr.dictText.match(/\[\s*(\d+)\s+\d+\s+R/);
            if (inner) descObjNum = parseInt(inner[1]);
          }
        }
      }
      if (!descObjNum) continue;
      const cidObj = objs.get(descObjNum);
      if (!cidObj) continue;
      const fdMatch = cidObj.dictText.match(/\/FontDescriptor\s+(\d+)\s+\d+\s+R/);
      if (!fdMatch) continue;
      const fdNum = parseInt(fdMatch[1]);
      const fdObj = objs.get(fdNum);
      if (!fdObj) continue;
      const ff2Match = fdObj.dictText.match(/\/FontFile2\s+(\d+)\s+\d+\s+R/);
      if (!ff2Match) continue;

      const tuMatch = o.dictText.match(/\/ToUnicode\s+(\d+)\s+\d+\s+R/);
      type0Fonts.push({
        num, baseFont,
        descObjNum,
        cidFontObj: descObjNum,
        fdNum,
        ff2Num: parseInt(ff2Match[1]),
        toUniObj: tuMatch ? parseInt(tuMatch[1]) : null,
      });
      cidFontByNum.set(descObjNum, true);
    }
  }
}
console.log('Type 0 Connections fonts to convert:', type0Fonts.length);
for (const f of type0Fonts) {
  console.log(`  obj ${f.num} ${f.baseFont} -> CID ${f.cidFontObj} -> FD ${f.fdNum} -> FF2 ${f.ff2Num} ToUni=${f.toUniObj}`);
}

// ---------- Read the simple CFF and the source font metadata ----------
const cffData = fs.readFileSync('Connections-Regular-Simple.cff');
const ttf = fontkit.create(fs.readFileSync('../ConnectionsRegular.ttf'));
const N_GLYPHS = ttf.numGlyphs;
console.log('CFF size:', cffData.length, 'numGlyphs:', N_GLYPHS);

// Build /Differences (every glyph 0..230 named) and /Widths
const diffParts = ['0'];
const widthsArr = [];
for (let g = 0; g < N_GLYPHS; g++) {
  const glyph = ttf.getGlyph(g);
  const name = glyph.name || ('gid' + g);
  diffParts.push('/' + name);
  widthsArr.push(Math.round(glyph.advanceWidth));
}
const diffStr   = diffParts.join(' ');
const widthsStr = widthsArr.join(' ');

// ---------- Helper: convert ToUnicode CMap from 2-byte to 1-byte codespace ----------
function convertToUnicodeCMap(cmap) {
  let t = cmap.toString('latin1');
  // Replace codespacerange block
  t = t.replace(/\d+\s+begincodespacerange[\s\S]*?endcodespacerange/g,
                '1 begincodespacerange\n<00><FF>\nendcodespacerange');
  // bfrange entries: <NNNN> <NNNN> <UUUU> -> <NN> <NN> <UUUU> (only if high byte of both = 00)
  t = t.replace(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g, (m, a, b, u) => {
    if (a.slice(0,2) === '00' && b.slice(0,2) === '00')
      return `<${a.slice(2)}><${b.slice(2)}> <${u}>`;
    return m;
  });
  t = t.replace(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4})>\s*\[/g, (m, a, b) => {
    if (a.slice(0,2) === '00' && b.slice(0,2) === '00')
      return `<${a.slice(2)}><${b.slice(2)}> [`;
    return m;
  });
  // bfchar entries: <NNNN> <UUUU...> -> <NN> <UUUU...>
  t = t.replace(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g, (m, a, b) => {
    if (a.slice(0,2) === '00') return `<${a.slice(2)}> <${b}>`;
    return m;
  });
  return Buffer.from(t, 'latin1');
}

// ---------- Content stream rewriter ----------
// For each page, find all /Cx_y font aliases in Resources that map to one of our target Type 0 objs,
// then rewrite all <hex> strings under those font selectors from 2-byte CIDs to 1-byte codes.
function rewriteContentStream(txt, targetNames) {
  const tfRe = /\/([A-Za-z][\w]*)\s+([\-\d.]+)\s+Tf/g;
  const tfPositions = [];
  let m;
  while ((m = tfRe.exec(txt)) !== null) {
    tfPositions.push({ pos: m.index + m[0].length, name: m[1], rawStart: m.index });
  }
  if (tfPositions.length === 0) return txt;
  const ranges = [];
  let cursor = 0, curFont = null;
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
      s = s.replace(/<([0-9A-Fa-f\s]+)>/g, (mm, hex) => {
        const h = hex.replace(/\s+/g, '');
        if (h.length % 4 !== 0) return mm;
        let out = '';
        for (let i = 0; i < h.length; i += 4) {
          if (h.substr(i, 2) !== '00') return mm;
          out += h.substr(i + 2, 2);
        }
        return '<' + out + '>';
      });
    }
    chunks.push(s);
  }
  return chunks.join('');
}

// Find target font names per page
function extractDict(text, key) {
  const refRe = new RegExp('\\/' + key + '\\s+(\\d+)\\s+\\d+\\s+R');
  const refMatch = text.match(refRe);
  if (refMatch) {
    const ro = objs.get(parseInt(refMatch[1]));
    if (ro) {
      const m2 = ro.dictText.match(/<<([\s\S]*)>>/);
      return m2 ? m2[1] : ro.dictText;
    }
  }
  const keyIdx = text.indexOf('/' + key);
  if (keyIdx < 0) return null;
  let i = keyIdx + ('/' + key).length;
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] !== '<' || text[i+1] !== '<') return null;
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

const targetObjSet = new Set(type0Fonts.map(f => f.num));
const newContentStreams = new Map();

for (const [pageNum, pageObj] of objs) {
  if (!/\/Type\s*\/Page\b/.test(pageObj.dictText)) continue;
  if (/\/Type\s*\/Pages\b/.test(pageObj.dictText)) continue;
  const resourcesBlob = extractDict(pageObj.dictText, 'Resources');
  if (!resourcesBlob) continue;
  const fontDict = extractDict(resourcesBlob, 'Font');
  if (!fontDict) continue;
  const allMappings = [...fontDict.matchAll(/\/([A-Za-z][\w]*)\s+(\d+)\s+\d+\s+R/g)];
  const targetNames = new Set();
  for (const mm of allMappings) {
    if (targetObjSet.has(parseInt(mm[2]))) targetNames.add(mm[1]);
  }
  if (targetNames.size === 0) continue;
  let contentRefs = [];
  const cRef = pageObj.dictText.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
  const cArr = pageObj.dictText.match(/\/Contents\s*\[([^\]]+)\]/);
  if (cRef) contentRefs.push(parseInt(cRef[1]));
  else if (cArr) for (const m2 of cArr[1].matchAll(/(\d+)\s+\d+\s+R/g)) contentRefs.push(parseInt(m2[1]));
  console.log(`  Page ${pageNum}: target fonts /${[...targetNames].join(', /')}, content streams=${contentRefs.join(',')}`);
  for (const cn of contentRefs) {
    const co = objs.get(cn);
    if (!co) continue;
    const raw = co.getStream();
    if (!raw) continue;
    const txt = raw.toString('latin1');
    const newTxt = rewriteContentStream(txt, targetNames);
    if (txt !== newTxt) newContentStreams.set(cn, Buffer.from(newTxt, 'latin1'));
  }
}
console.log(`Rewrote ${newContentStreams.size} content streams`);

// ---------- Build new font dicts (simple Type 1) ----------
// Each Type 0 wrapper gets its own simple Type 1 dict + its own FontDescriptor + its own FontFile3 (CFF) stream.
const cffCompressed = zlib.deflateSync(cffData);
const newFontDicts = new Map();
const extraObjs = new Map();
let nextNewObjNum = Math.max(...objs.keys()) + 1;

for (const f of type0Fonts) {
  const ffObjNum = nextNewObjNum++;
  const fdObjNum = nextNewObjNum++;
  extraObjs.set(ffObjNum, {
    kind: 'stream',
    dict: `<< /Subtype /Type1C /Filter /FlateDecode /Length ${cffCompressed.length} >>`,
    stream: cffCompressed,
  });
  extraObjs.set(fdObjNum, {
    kind: 'dict',
    dict: `<<
/Type /FontDescriptor
/FontName /${f.baseFont}
/FontFamily (Connections)
/FontStretch /Normal
/FontWeight 400
/Flags 32
/FontBBox [ -47 -244 962 923 ]
/ItalicAngle 0
/Ascent 923
/Descent -244
/CapHeight 685
/XHeight 488
/StemV 84
/MissingWidth 0
/FontFile3 ${ffObjNum} 0 R
>>`
  });
  const dict = `<<
/Type /Font
/Subtype /Type1
/BaseFont /${f.baseFont}
/FirstChar 0
/LastChar ${N_GLYPHS - 1}
/Widths [ ${widthsStr} ]
/FontDescriptor ${fdObjNum} 0 R
/Encoding << /Type /Encoding /Differences [ ${diffStr} ] >>
${f.toUniObj ? `/ToUnicode ${f.toUniObj} 0 R` : ''}
>>`;
  newFontDicts.set(f.num, dict);
}

// ---------- Rewrite ToUnicode CMaps ----------
const newToUnicodeStreams = new Map();
for (const f of type0Fonts) {
  if (!f.toUniObj) continue;
  if (newToUnicodeStreams.has(f.toUniObj)) continue;
  const tu = objs.get(f.toUniObj);
  if (!tu) continue;
  const raw = tu.getStream();
  if (!raw) continue;
  newToUnicodeStreams.set(f.toUniObj, convertToUnicodeCMap(raw));
}

// ---------- Drop now-orphaned objects ----------
const droppedObjs = new Set();
for (const f of type0Fonts) {
  // descendant array obj (if present) - locate it
  const arrRef = objs.get(f.num).dictText.match(/\/DescendantFonts\s+(\d+)\s+\d+\s+R/);
  if (arrRef) droppedObjs.add(parseInt(arrRef[1]));
  droppedObjs.add(f.descObjNum);     // CIDFont
  droppedObjs.add(f.fdNum);          // old FontDescriptor
  droppedObjs.add(f.ff2Num);         // old FontFile2 stream
  // Note: CIDSet streams referenced by FontDescriptor — also drop if no longer referenced
  const fdObj = objs.get(f.fdNum);
  if (fdObj) {
    const csMatch = fdObj.dictText.match(/\/CIDSet\s+(\d+)\s+\d+\s+R/);
    if (csMatch) droppedObjs.add(parseInt(csMatch[1]));
  }
}
console.log('Dropped objects:', [...droppedObjs].sort((a,b)=>a-b).join(','));

// ---------- Emit ----------
const out = [];
const xref = new Map();
function emit(s) { out.push(typeof s === 'string' ? Buffer.from(s, 'latin1') : s); }
function curLen() { return out.reduce((a, b) => a + b.length, 0); }

emit('%PDF-1.6\n%\xE2\xE3\xCF\xD3\n');

const maxNum = Math.max(...objs.keys(), ...extraObjs.keys());
for (let n = 1; n <= maxNum; n++) {
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
  } else if (o.isStream()) {
    // Pass-through with re-compression
    const raw = o.getStream();
    const compressed = zlib.deflateSync(raw);
    // Strip /Length and /Filter from existing dict, add fresh
    function stripKey(text, key) {
      const re = new RegExp('\\/' + key + '\\s+(?:\\d+\\s+\\d+\\s+R|\\/[A-Za-z][\\w]*|\\d+|\\[[^\\]]*\\])', 'g');
      return text.replace(re, '');
    }
    let dict = o.dictText.trim();
    dict = stripKey(dict, 'Length');
    dict = stripKey(dict, 'Filter');
    const lastGT = dict.lastIndexOf('>>');
    dict = dict.slice(0, lastGT) + ` /Filter /FlateDecode /Length ${compressed.length} ` + dict.slice(lastGT);
    emit(dict + '\nstream\n');
    emit(compressed);
    emit('\nendstream\n');
  } else {
    emit(o.dictText.trim() + '\n');
  }
  emit('endobj\n');
}

const xrefStart = curLen();
emit('xref\n');
emit(`0 ${maxNum + 1}\n`);
emit('0000000000 65535 f \n');
for (let n = 1; n <= maxNum; n++) {
  if (xref.has(n)) emit(`${String(xref.get(n)).padStart(10, '0')} 00000 n \n`);
  else emit('0000000000 00000 f \n');
}
const trailerMatch = text.match(/trailer\s*<<([\s\S]*?)>>/);
let trailerDict = trailerMatch ? trailerMatch[1].trim() : '';
trailerDict = trailerDict.replace(/\/Size\s+\d+/g, '').replace(/\/Prev\s+\d+/g, '');
emit(`trailer << ${trailerDict} /Size ${maxNum + 1} >>\nstartxref\n${xrefStart}\n%%EOF\n`);

const outBuf = Buffer.concat(out);
fs.writeFileSync(DST, outBuf);
console.log(`Wrote ${DST} (${outBuf.length} bytes)`);
