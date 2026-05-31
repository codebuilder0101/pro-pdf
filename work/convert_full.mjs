// Convert the FULL 8-page bank statement to simple Type 1.
// Same algorithm as convert_pages_12.mjs but on the normalized full PDF.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as fontkit from 'fontkit';

const SRC = 'normalized.pdf';
const DST = path.resolve('C:/output/result1.pdf');

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
      try { return zlib.inflateSync(this.streamData); } catch { return this.streamData; }
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

// Identify Type 0 fonts to convert
const type0Fonts = [];
for (const [num, o] of objs) {
  if (/\/Type\s*\/Font\b/.test(o.dictText)) {
    const subtype = (o.dictText.match(/\/Subtype\s*\/([A-Za-z0-9]+)/) || [])[1];
    const baseFont = (o.dictText.match(/\/BaseFont\s*\/([\w+,\-\.]+)/) || [])[1];
    if (subtype === 'Type0' && baseFont && /^[A-Z]{6}\+Connections$/.test(baseFont)) {
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
        descArrayRef: o.dictText.match(/\/DescendantFonts\s+(\d+)\s+\d+\s+R/),
        descObjNum,
        fdNum,
        ff2Num: parseInt(ff2Match[1]),
        toUniObj: tuMatch ? parseInt(tuMatch[1]) : null,
      });
    }
  }
}
console.log('Type 0 Connections fonts to convert:', type0Fonts.length);

// Read CFF and font metrics
const cffData = fs.readFileSync('Connections-Regular-Simple.cff');
const ttf = fontkit.create(fs.readFileSync('../ConnectionsRegular.ttf'));
const N_GLYPHS = ttf.numGlyphs;
console.log('CFF:', cffData.length, 'bytes,', N_GLYPHS, 'glyphs');

const diffParts = ['0'];
const widthsArr = [];
for (let g = 0; g < N_GLYPHS; g++) {
  const glyph = ttf.getGlyph(g);
  diffParts.push('/' + (glyph.name || ('gid' + g)));
  widthsArr.push(Math.round(glyph.advanceWidth));
}
const diffStr   = diffParts.join(' ');
const widthsStr = widthsArr.join(' ');

// ToUnicode CMap converter
function convertToUnicodeCMap(cmap) {
  let t = cmap.toString('latin1');
  t = t.replace(/\d+\s+begincodespacerange[\s\S]*?endcodespacerange/g,
                '1 begincodespacerange\n<00><FF>\nendcodespacerange');
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
  t = t.replace(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]+)>/g, (m, a, b) => {
    if (a.slice(0,2) === '00') return `<${a.slice(2)}> <${b}>`;
    return m;
  });
  return Buffer.from(t, 'latin1');
}

// Decode a PDF literal-string body (with escapes) into raw bytes
function decodeLiteral(body) {
  const bytes = [];
  let p = 0;
  while (p < body.length) {
    if (body[p] === '\\') {
      const n = body[p+1];
      if (n === 'n') { bytes.push(0x0a); p += 2; }
      else if (n === 'r') { bytes.push(0x0d); p += 2; }
      else if (n === 't') { bytes.push(0x09); p += 2; }
      else if (n === 'b') { bytes.push(0x08); p += 2; }
      else if (n === 'f') { bytes.push(0x0c); p += 2; }
      else if (n === '\\' || n === '(' || n === ')') { bytes.push(body.charCodeAt(p+1)); p += 2; }
      else if (n === '\n') { p += 2; } // line continuation
      else if (n === '\r') { p += (body[p+2] === '\n') ? 3 : 2; }
      else if (/[0-7]/.test(n)) {
        let oct = n; p += 2;
        if (p < body.length && /[0-7]/.test(body[p])) { oct += body[p]; p++; }
        if (oct.length < 3 && p < body.length && /[0-7]/.test(body[p])) { oct += body[p]; p++; }
        bytes.push(parseInt(oct, 8) & 0xff);
      } else { bytes.push(body.charCodeAt(p+1)); p += 2; }
    } else { bytes.push(body.charCodeAt(p)); p++; }
  }
  return bytes;
}
// Encode raw bytes back into a PDF literal string
function encodeLiteral(bytes) {
  return bytes.map(b => {
    if (b === 0x28) return '\\(';
    if (b === 0x29) return '\\)';
    if (b === 0x5c) return '\\\\';
    if (b >= 0x20 && b < 0x7f) return String.fromCharCode(b);
    return '\\' + b.toString(8).padStart(3, '0');
  }).join('');
}
// Collapse a 2-byte-CID byte array to 1-byte codes (high byte must be 0). Returns null if not collapsible.
function collapseBytes(bytes) {
  if (bytes.length % 2 !== 0) return null;
  const out = [];
  for (let i = 0; i < bytes.length; i += 2) {
    if (bytes[i] !== 0) return null;
    out.push(bytes[i+1]);
  }
  return out;
}

// Content-stream rewriter with a proper graphics-state-aware tokenizer.
// Tracks the current font through Tf operators AND q/Q save/restore, so text shown
// under a /C2_* font that was restored via Q is correctly identified and collapsed.
function rewriteContentStream(txt, targetNames) {
  const edits = [];
  let out = '';
  let i = 0;
  const n = txt.length;
  let curFont = null;
  const stack = [];
  // pending operands (we only care about the most recent name and string operands)
  let pendingName = null;     // last /name seen (for Tf)
  // For string operators we look back at the immediately-preceding string token.
  // We'll track the output positions of string tokens so we can rewrite them when
  // the following operator confirms they're text shown under a target font.
  let lastStringRange = null; // { outStart, outEnd, bytes } for a literal/hex string just emitted
  let arrayStringRanges = []; // for TJ arrays: list of {outStart,outEnd,bytes,isHex}

  function isWS(ch) { return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\f' || ch === '\0'; }

  while (i < n) {
    const ch = txt[i];
    // Whitespace / generic single chars
    if (isWS(ch)) { out += ch; i++; continue; }

    // Comment
    if (ch === '%') { let j = i; while (j < n && txt[j] !== '\n' && txt[j] !== '\r') j++; out += txt.slice(i, j); i = j; continue; }

    // Name: /xxxx
    if (ch === '/') {
      let j = i + 1;
      while (j < n && !isWS(txt[j]) && !'()<>[]{}/%'.includes(txt[j])) j++;
      pendingName = txt.slice(i + 1, j);
      out += txt.slice(i, j);
      i = j;
      continue;
    }

    // Literal string (....)
    if (ch === '(') {
      let depth = 1, j = i + 1;
      while (j < n && depth > 0) {
        if (txt[j] === '\\') { j += 2; continue; }
        if (txt[j] === '(') depth++;
        else if (txt[j] === ')') depth--;
        j++;
      }
      const body = txt.slice(i + 1, j - 1);
      const outStart = out.length;
      out += txt.slice(i, j);
      lastStringRange = { outStart, outEnd: out.length, bytes: decodeLiteral(body), isHex: false };
      arrayStringRanges.push(lastStringRange);
      i = j;
      continue;
    }

    // Hex string <....>  (but not << dict)
    if (ch === '<' && txt[i+1] !== '<') {
      let j = i + 1;
      while (j < n && txt[j] !== '>') j++;
      const hex = txt.slice(i + 1, j).replace(/\s+/g, '');
      const bytes = [];
      for (let k = 0; k + 2 <= hex.length; k += 2) bytes.push(parseInt(hex.substr(k, 2), 16));
      if (hex.length % 2 === 1) bytes.push(parseInt(hex[hex.length-1] + '0', 16));
      const outStart = out.length;
      out += txt.slice(i, j + 1);
      lastStringRange = { outStart, outEnd: out.length, bytes, isHex: true };
      arrayStringRanges.push(lastStringRange);
      i = j + 1;
      continue;
    }

    // Dict << >> — pass through opaquely
    if (ch === '<' && txt[i+1] === '<') { out += '<<'; i += 2; continue; }
    if (ch === '>' && txt[i+1] === '>') { out += '>>'; i += 2; continue; }

    // Array [ ] — we let contents flow through; reset array string list at '['
    if (ch === '[') { arrayStringRanges = []; out += ch; i++; continue; }
    if (ch === ']') { out += ch; i++; continue; }

    // Bare token (operator or number)
    let j = i;
    while (j < n && !isWS(txt[j]) && !'()<>[]{}/%'.includes(txt[j])) j++;
    const tok = txt.slice(i, j);
    out += tok;
    i = j;

    // Act on operators
    if (tok === 'q') { stack.push(curFont); }
    else if (tok === 'Q') { curFont = stack.length ? stack.pop() : curFont; }
    else if (tok === 'Tf') { curFont = pendingName; }
    else if (tok === 'Tj' || tok === "'" || tok === '"') {
      if (lastStringRange && targetNames.has(curFont)) {
        rewriteStringInOut(lastStringRange);
      }
      lastStringRange = null;
      arrayStringRanges = [];
    }
    else if (tok === 'TJ') {
      if (targetNames.has(curFont)) {
        // Rewrite every string collected since the last '['
        for (const r of arrayStringRanges) rewriteStringInOut(r);
      }
      arrayStringRanges = [];
      lastStringRange = null;
    }
  }

  // Apply deferred rewrites: we recorded ranges referencing `out` positions, but since we
  // rewrite in place by rebuilding, do the rewrites now using recorded data.
  // (rewriteStringInOut pushes edits into `edits`; apply them.)
  if (edits.length) {
    edits.sort((a, b) => a.start - b.start);
    let res = '';
    let prev = 0;
    for (const e of edits) {
      res += out.slice(prev, e.start) + e.text;
      prev = e.end;
    }
    res += out.slice(prev);
    return res;
  }
  return out;

  // ---- helpers that close over `out` and `edits` ----
  function rewriteStringInOut(range) {
    const collapsed = collapseBytes(range.bytes);
    if (!collapsed) return;
    const text = range.isHex
      ? '<' + collapsed.map(b => b.toString(16).padStart(2, '0')).join('') + '>'
      : '(' + encodeLiteral(collapsed) + ')';
    edits.push({ start: range.outStart, end: range.outEnd, text });
  }
}

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
let pageCount = 0;
for (const [pageNum, pageObj] of objs) {
  if (!/\/Type\s*\/Page\b/.test(pageObj.dictText)) continue;
  if (/\/Type\s*\/Pages\b/.test(pageObj.dictText)) continue;
  pageCount++;
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
  console.log(`  Page ${pageNum}: target=${[...targetNames].join(',')} contents=${contentRefs.join(',')}`);
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
console.log(`Pages: ${pageCount}, rewrote ${newContentStreams.size} content streams`);

// New font dicts.
// The original embedded the "Connections" TrueType font ONCE (all 17 Type0 wrappers
// shared a single CIDFont + FontFile2). To keep Acrobat showing it as a SINGLE
// "Connections" font, all converted fonts share ONE FontDescriptor + ONE FontFile3 (CFF)
// and use the SAME BaseFont name "Connections".
const cffCompressed = zlib.deflateSync(cffData);
const newFontDicts = new Map();
const extraObjs = new Map();
let nextNewObjNum = Math.max(...objs.keys()) + 1;

const SHARED_NAME = 'Connections';
const sharedFFObj = nextNewObjNum++;   // single CFF program
const sharedFDObj = nextNewObjNum++;   // single FontDescriptor
extraObjs.set(sharedFFObj, {
  kind: 'stream',
  dict: `<< /Subtype /Type1C /Filter /FlateDecode /Length ${cffCompressed.length} >>`,
  stream: cffCompressed,
});
extraObjs.set(sharedFDObj, {
  kind: 'dict',
  dict: `<<
/Type /FontDescriptor
/FontName /${SHARED_NAME}
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
/FontFile3 ${sharedFFObj} 0 R
>>`
});

// Build ONE merged ToUnicode CMap (1-byte) covering every glyph, from the font's own
// glyph->Unicode reverse mapping. (All original per-font CMaps shared the same CID->Unicode
// because CID==GID for one underlying font, so a single CMap is correct for all.)
const bf = [];
for (let g = 0; g < N_GLYPHS; g++) {
  const glyph = ttf.getGlyph(g);
  const cps = glyph.codePoints;
  if (cps && cps.length === 1 && cps[0] > 0) {
    bf.push(`<${g.toString(16).padStart(2,'0')}> <${cps[0].toString(16).padStart(4,'0')}>`);
  }
}
const mergedToUni = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<00><FF>
endcodespacerange
${bf.length} beginbfchar
${bf.join('\n')}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;
const sharedToUniObj = nextNewObjNum++;
extraObjs.set(sharedToUniObj, {
  kind: 'stream',
  dict: `<< /Length ${Buffer.byteLength(mergedToUni, 'latin1')} >>`,
  stream: Buffer.from(mergedToUni, 'latin1'),
});

// ONE single Connections Type 1 font object, referenced by every page.
const sharedFontObj = nextNewObjNum++;
extraObjs.set(sharedFontObj, {
  kind: 'dict',
  dict: `<<
/Type /Font
/Subtype /Type1
/BaseFont /${SHARED_NAME}
/FirstChar 0
/LastChar ${N_GLYPHS - 1}
/Widths [ ${widthsStr} ]
/FontDescriptor ${sharedFDObj} 0 R
/Encoding << /Type /Encoding /Differences [ ${diffStr} ] >>
/ToUnicode ${sharedToUniObj} 0 R
>>`,
});
// (No per-font font dicts; newFontDicts stays empty. Page references get redirected to
//  sharedFontObj, and the 17 original Type0 font dicts are dropped.)

// ---- Encoding unification (SAFE): convert every /Encoding /MacRomanEncoding font dict to an
// explicit /Differences encoding that replicates MacRomanEncoding exactly. Rendering is
// byte-identical (same byte->name->glyph), but Acrobat then groups each font family under a
// single "Custom" encoding, so each font appears ONCE instead of twice (Custom + Roman).
const MACROMAN = (()=>{ const a=new Array(256).fill('.notdef');
  const asc={32:'space',33:'exclam',34:'quotedbl',35:'numbersign',36:'dollar',37:'percent',38:'ampersand',39:'quotesingle',40:'parenleft',41:'parenright',42:'asterisk',43:'plus',44:'comma',45:'hyphen',46:'period',47:'slash',48:'zero',49:'one',50:'two',51:'three',52:'four',53:'five',54:'six',55:'seven',56:'eight',57:'nine',58:'colon',59:'semicolon',60:'less',61:'equal',62:'greater',63:'question',64:'at',91:'bracketleft',92:'backslash',93:'bracketright',94:'asciicircum',95:'underscore',96:'grave',123:'braceleft',124:'bar',125:'braceright',126:'asciitilde'};
  for(const k in asc)a[k]=asc[k];
  for(let i=65;i<=90;i++)a[i]=String.fromCharCode(i);
  for(let i=97;i<=122;i++)a[i]=String.fromCharCode(i);
  const hi='Adieresis Aring Ccedilla Eacute Ntilde Odieresis Udieresis aacute agrave acircumflex adieresis atilde aring ccedilla eacute egrave ecircumflex edieresis iacute igrave icircumflex idieresis ntilde oacute ograve ocircumflex odieresis otilde uacute ugrave ucircumflex udieresis dagger degree cent sterling section bullet paragraph germandbls registered copyright trademark acute dieresis notequal AE Oslash infinity plusminus lessequal greaterequal yen mu partialdiff summation product pi integral ordfeminine ordmasculine Omega ae oslash questiondown exclamdown logicalnot radical florin approxequal Delta guillemotleft guillemotright ellipsis space Agrave Atilde Otilde OE oe endash emdash quotedblleft quotedblright quoteleft quoteright divide lozenge ydieresis Ydieresis fraction currency guilsinglleft guilsinglright fi fl daggerdbl periodcentered quotesinglbase quotedblbase perthousand Acircumflex Ecircumflex Aacute Edieresis Egrave Iacute Icircumflex Idieresis Igrave Oacute Ocircumflex apple Ograve Uacute Ucircumflex Ugrave dotlessi circumflex tilde macron breve dotaccent ring cedilla hungarumlaut ogonek caron'.split(' ');
  for(let i=0;i<hi.length;i++)a[128+i]=hi[i];
  return a; })();
const macRomanDiffStr = (()=>{ const parts=['0']; for(let i=0;i<256;i++) parts.push('/'+(MACROMAN[i]==='.notdef'?'.notdef':MACROMAN[i])); return parts.join(' '); })();
// Per final requirements: every NON-CID font must remain byte-identical to the original,
// including its encoding (Custom or MacRomanEncoding). The MacRoman->Custom fixup is DISABLED.
const encodingFixups = new Map();
console.log('MacRoman->Custom encoding fixups: DISABLED');

// ToUnicode CMap rewrites
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

// Drop orphaned objects: the CID descendants/arrays/old descriptors/old TTF programs,
// the per-font ToUnicode CMaps, AND all 17 original Type0 Connections font dicts
// (every page reference is redirected to the single sharedFontObj).
const droppedObjs = new Set();
const redirectFrom = new Set();   // original Connections font obj numbers -> redirect to sharedFontObj
for (const f of type0Fonts) {
  if (f.descArrayRef) droppedObjs.add(parseInt(f.descArrayRef[1]));
  droppedObjs.add(f.descObjNum);
  droppedObjs.add(f.fdNum);
  droppedObjs.add(f.ff2Num);
  droppedObjs.add(f.num);              // drop the original font dict object
  redirectFrom.add(f.num);
  if (f.toUniObj) droppedObjs.add(f.toUniObj);  // drop per-font ToUnicode
  const fdObj = objs.get(f.fdNum);
  if (fdObj) {
    const csMatch = fdObj.dictText.match(/\/CIDSet\s+(\d+)\s+\d+\s+R/);
    if (csMatch) droppedObjs.add(parseInt(csMatch[1]));
  }
}
console.log('Dropped objects:', [...droppedObjs].sort((a,b)=>a-b).join(','));

// Redirect any "/Name <origFontObj> 0 R" in page Resources to the single shared font object.
function redirectFontRefs(dictText) {
  return dictText.replace(/(\/[A-Za-z][\w]*\s+)(\d+)(\s+\d+\s+R)/g, (mm, pre, num, post) => {
    if (redirectFrom.has(parseInt(num))) return `${pre}${sharedFontObj}${post}`;
    return mm;
  });
}

// Emit PDF
const out = [];
const xref = new Map();
let runningLen = 0;
function emit(s) {
  const b = typeof s === 'string' ? Buffer.from(s, 'latin1') : s;
  out.push(b);
  runningLen += b.length;
}
function curLen() { return runningLen; }

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
    const raw = o.getStream();
    const compressed = zlib.deflateSync(raw);
    function stripKey(text, key) {
      const re = new RegExp('\\/' + key + '\\s+(?:\\d+\\s+\\d+\\s+R|\\/[A-Za-z][\\w]*|\\d+|\\[[^\\]]*\\])', 'g');
      return text.replace(re, '');
    }
    let dict = o.dictText.trim();
    dict = stripKey(dict, 'Length');
    dict = stripKey(dict, 'Filter');
    const lastGT = dict.lastIndexOf('>>');
    dict = dict.slice(0, lastGT) + ` /Filter /FlateDecode /Length ${compressed.length} ` + dict.slice(lastGT);
    emit(redirectFontRefs(dict) + '\nstream\n');
    emit(compressed);
    emit('\nendstream\n');
  } else if (encodingFixups.has(n)) {
    emit(redirectFontRefs(encodingFixups.get(n).trim()) + '\n');
  } else {
    emit(redirectFontRefs(o.dictText.trim()) + '\n');
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
console.log(`\nWrote ${DST} (${outBuf.length} bytes)`);
