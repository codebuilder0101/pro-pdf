// Convert origin1.pdf's TrueType (CID) Connections fonts into SIMPLE Type 1 Connections.
// This drops the Type 0 composite structure so Acrobat shows "Type 1" without "(CID)" suffix.
//
// Pipeline:
//   1. Build a single shared simple Type 1 Connections font:
//        - /BaseFont /Connections, /Subtype /Type1
//        - /FontDescriptor with /FontFile3 pointing to Connections-Regular-Simple.cff
//        - /Encoding /Identity-H (kept as a name so Acrobat displays "Identity-H")
//        - /FirstChar 0, /LastChar 255, /Widths array
//   2. Read every page's content stream via mupdf (so streams are properly decoded).
//   3. Tokenize each content stream and:
//        - track current font through /Tf and q/Q
//        - whenever a Tj or TJ runs under a Type 0 Connections font, collapse each 2-byte CID
//          (high byte must be 0) to a 1-byte char code
//   4. Update each page's /Resources/Font so the Type 0 Connections tags point to the new
//      shared simple Type 1 font.
//   5. Write the modified content streams back.
//   6. Save to C:/output/result2.pdf.
import fs from 'fs';
import * as mupdf from 'mupdf';

const SRC = '../asset/origin2.pdf';
const DST = 'C:/output/result2.pdf';
const SIMPLE_CFF = fs.readFileSync('Connections-Regular-Simple.cff');

const data = fs.readFileSync(SRC);
const doc = mupdf.Document.openDocument(data, 'application/pdf');
const pdf = doc.asPDF();
const N = pdf.countObjects();
console.log('Total objects:', N);

// ---- Step 1: identify every Type 0 Connections wrapper (object number set)
const connWrappers = new Set();
for (let i = 1; i < N; i++) {
  let o;
  try { o = pdf.newIndirect(i, 0).resolve(); } catch { continue; }
  if (!o || !o.isDictionary()) continue;
  const t = o.get('Type'); if (!t || t.asName() !== 'Font') continue;
  const st = o.get('Subtype'); if (!st || st.asName() !== 'Type0') continue;
  const bf = o.get('BaseFont'); if (!bf || !/Connections/i.test(bf.asName())) continue;
  connWrappers.add(i);
}
console.log('Type 0 Connections wrappers:', connWrappers.size);

// ---- Step 2: create the shared simple Type 1 Connections font
// First, create the FontFile3 stream object (CFF Type1C)
const fontFileRef = pdf.addStream(SIMPLE_CFF, pdf.newDictionary());
const fontFile = fontFileRef.resolve();
fontFile.put('Subtype', pdf.newName('Type1C'));
console.log('Created FontFile3 stream obj:', fontFileRef.asIndirect());

// Create FontDescriptor
const fdDict = pdf.newDictionary();
fdDict.put('Type', pdf.newName('FontDescriptor'));
fdDict.put('FontName', pdf.newName('Connections'));
fdDict.put('Flags', pdf.newInteger(4));
fdDict.put('ItalicAngle', pdf.newInteger(0));
fdDict.put('Ascent', pdf.newInteger(800));
fdDict.put('Descent', pdf.newInteger(-200));
fdDict.put('CapHeight', pdf.newInteger(700));
fdDict.put('StemV', pdf.newInteger(80));
// FontBBox
const fbb = pdf.newArray();
fbb.push(pdf.newInteger(-200));
fbb.push(pdf.newInteger(-300));
fbb.push(pdf.newInteger(1100));
fbb.push(pdf.newInteger(1000));
fdDict.put('FontBBox', fbb);
fdDict.put('FontFile3', fontFileRef);
const fdRef = pdf.addObject(fdDict);
console.log('Created FontDescriptor obj:', fdRef.asIndirect());

// Read the simple CFF's glyph names from its charset. /Encoding /Differences maps
// each char code C (which equals the CID's low byte) to the glyph name at GID C in the CFF.
const STD_SID_NAMES = ['.notdef','space','exclam','quotedbl','numbersign','dollar','percent','ampersand','quoteright','parenleft','parenright','asterisk','plus','comma','hyphen','period','slash','zero','one','two','three','four','five','six','seven','eight','nine','colon','semicolon','less','equal','greater','question','at','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','bracketleft','backslash','bracketright','asciicircum','underscore','quoteleft','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','braceleft','bar','braceright','asciitilde','exclamdown','cent','sterling','fraction','yen','florin','section','currency','quotesingle','quotedblleft','guillemotleft','guilsinglleft','guilsinglright','fi','fl','endash','dagger','daggerdbl','periodcentered','paragraph','bullet','quotesinglbase','quotedblbase','quotedblright','guillemotright','ellipsis','perthousand','questiondown','grave','acute','circumflex','tilde','macron','breve','dotaccent','dieresis','ring','cedilla','hungarumlaut','ogonek','caron','emdash','AE','ordfeminine','Lslash','Oslash','OE','ordmasculine','ae','dotlessi','lslash','oslash','oe','germandbls','onesuperior','twosuperior','threesuperior','minus','multiply','onesuperior','twosuperior','threesuperior','onehalf','onequarter','threequarters'];
function readSimpleCFFGlyphNames(cff) {
  // Returns array of glyph names indexed by GID (0..N-1).
  const hdrSize = cff[2];
  let p = hdrSize;
  function readIdx(pp){
    const cn = (cff[pp] << 8) | cff[pp+1];
    if (cn === 0) return { end: pp + 2, entries: [] };
    const os = cff[pp+2];
    const offs = [];
    for (let i = 0; i <= cn; i++) {
      let v = 0;
      for (let j = 0; j < os; j++) v = (v << 8) | cff[pp + 3 + i*os + j];
      offs.push(v);
    }
    const dataBase = pp + 3 + os * (cn + 1);
    const entries = [];
    for (let i = 0; i < cn; i++) entries.push(cff.slice(dataBase + offs[i] - 1, dataBase + offs[i+1] - 1));
    return { end: dataBase + offs[cn] - 1, entries };
  }
  const nameI = readIdx(p); p = nameI.end;
  const topI  = readIdx(p); p = topI.end;
  const strI  = readIdx(p); p = strI.end;
  const strings = strI.entries.map(e => e.toString('latin1'));
  // Parse top DICT for CharStrings offset (op 17) and charset offset (op 15)
  function parseDictAll(dd){
    const map = {}; const stack=[]; let s = []; let i=0;
    while (i < dd.length) {
      const b = dd[i];
      if (b <= 21) {
        let op = b; if (b === 12) { op = 1200 + dd[i+1]; i+=2; } else i++;
        map[op] = s; s = [];
      } else if (b === 28) { s.push((dd[i+1]<<8)|dd[i+2]); i+=3; }
      else if (b === 29) { s.push((dd[i+1]<<24)|(dd[i+2]<<16)|(dd[i+3]<<8)|dd[i+4]); i+=5; }
      else if (b >= 32 && b <= 246) { s.push(b-139); i++; }
      else if (b >= 247 && b <= 250) { s.push((b-247)*256+dd[i+1]+108); i+=2; }
      else if (b >= 251 && b <= 254) { s.push(-(b-251)*256-dd[i+1]-108); i+=2; }
      else if (b === 30) { i++; while(i<dd.length){const n=dd[i++]; if((n&0x0f)===0x0f||(n>>4)===0x0f) break;} s.push(0); }
      else i++;
    }
    return map;
  }
  const td = parseDictAll(topI.entries[0]);
  const csOff = td[17][0];
  const charsetOff = td[15] ? td[15][0] : 0;
  const nGlyphs = (cff[csOff] << 8) | cff[csOff+1];
  // Charset: format 0 = list of SIDs for GIDs 1..N-1
  const fmt = cff[charsetOff];
  const names = ['.notdef'];
  if (fmt === 0) {
    for (let g = 1; g < nGlyphs; g++) {
      const sid = (cff[charsetOff + 1 + (g-1)*2] << 8) | cff[charsetOff + 2 + (g-1)*2];
      let name;
      if (sid < 391) name = STD_SID_NAMES[sid] || ('sid' + sid);
      else name = strings[sid - 391] || ('sid' + sid);
      names.push(name);
    }
  } else if (fmt === 1 || fmt === 2) {
    let g = 1;
    let pp = charsetOff + 1;
    while (g < nGlyphs) {
      const first = (cff[pp] << 8) | cff[pp+1];
      const nLeft = fmt === 1 ? cff[pp+2] : ((cff[pp+2] << 8) | cff[pp+3]);
      pp += fmt === 1 ? 3 : 4;
      for (let k = 0; k <= nLeft && g < nGlyphs; k++) {
        const sid = first + k;
        let name;
        if (sid < 391) name = STD_SID_NAMES[sid] || ('sid' + sid);
        else name = strings[sid - 391] || ('sid' + sid);
        names.push(name);
        g++;
      }
    }
  }
  return names;
}
const cffGlyphNames = readSimpleCFFGlyphNames(SIMPLE_CFF);
console.log('CFF glyph names: total', cffGlyphNames.length);

function buildDifferences() {
  const a = pdf.newArray();
  a.push(pdf.newInteger(0));
  for (let c = 0; c < 256; c++) {
    const name = (c < cffGlyphNames.length) ? cffGlyphNames[c] : '.notdef';
    a.push(pdf.newName(name));
  }
  return a;
}
const encDict = pdf.newDictionary();
encDict.put('Type', pdf.newName('Encoding'));
encDict.put('Differences', buildDifferences());
const encRef = pdf.addObject(encDict);

// Widths array (placeholder — all 600 — won't affect text extraction or basic layout)
function buildWidths() {
  const a = pdf.newArray();
  for (let i = 0; i < 256; i++) a.push(pdf.newInteger(600));
  return a;
}

// Create the shared Font dict
const fontDict = pdf.newDictionary();
fontDict.put('Type', pdf.newName('Font'));
fontDict.put('Subtype', pdf.newName('Type1'));
fontDict.put('BaseFont', pdf.newName('Connections'));
fontDict.put('FontDescriptor', fdRef);
fontDict.put('Encoding', encRef);
fontDict.put('FirstChar', pdf.newInteger(0));
fontDict.put('LastChar', pdf.newInteger(255));
fontDict.put('Widths', buildWidths());
const sharedFontRef = pdf.addObject(fontDict);
console.log('Created shared simple Type 1 Connections obj:', sharedFontRef.asIndirect());

// ---- Step 3: tokenize + rewrite content streams
function collapseTwoByteCIDs(bytes) {
  // bytes is Uint8Array. Each 2-byte pair must have high byte = 0. Returns Uint8Array of 1-byte codes,
  // or null if any CID has nonzero high byte.
  if (bytes.length % 2 !== 0) return null;
  const out = new Uint8Array(bytes.length / 2);
  for (let i = 0; i < bytes.length; i += 2) {
    if (bytes[i] !== 0) return null;
    out[i / 2] = bytes[i + 1];
  }
  return out;
}

// Encode bytes back into PDF literal string format. Use hex string for safety.
function bytesToHex(bytes) {
  let s = '<';
  for (const b of bytes) s += b.toString(16).padStart(2, '0').toUpperCase();
  s += '>';
  return s;
}

function rewriteContentStream(srcText, targetFontTags) {
  // Token-aware rewriter. Track curFont via Tf and q/Q stack. When Tj/TJ runs under a target,
  // collapse the just-emitted string(s) from 2-byte CIDs to 1-byte codes.
  const n = srcText.length;
  let outParts = [];     // array of strings to be joined at end
  let outLen = 0;
  function emit(s) { outParts.push(s); outLen += s.length; }
  function isWS(ch) { return ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === '\f' || ch === '\0'; }

  let i = 0;
  let curFont = null;
  const fontStack = [];
  let pendingName = null;
  let pendingStrings = []; // { startInOutParts, endInOutParts, bytes }

  while (i < n) {
    const ch = srcText[i];

    if (isWS(ch)) { emit(ch); i++; continue; }

    if (ch === '%') {
      let j = i;
      while (j < n && srcText[j] !== '\n' && srcText[j] !== '\r') j++;
      emit(srcText.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '/') {
      let j = i + 1;
      while (j < n && !isWS(srcText[j]) && !'()<>[]{}/%'.includes(srcText[j])) j++;
      pendingName = srcText.slice(i + 1, j);
      emit(srcText.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '(') {
      let depth = 1, j = i + 1;
      while (j < n && depth > 0) {
        if (srcText[j] === '\\') { j += 2; continue; }
        if (srcText[j] === '(') depth++;
        else if (srcText[j] === ')') depth--;
        j++;
      }
      const body = srcText.slice(i + 1, j - 1);
      // decode literal string into bytes
      const bytes = [];
      let p = 0;
      while (p < body.length) {
        if (body.charCodeAt(p) === 0x5c) {
          if (p + 1 < body.length) {
            const nxt = body[p + 1];
            if (nxt === 'n') { bytes.push(0x0a); p += 2; }
            else if (nxt === 'r') { bytes.push(0x0d); p += 2; }
            else if (nxt === 't') { bytes.push(0x09); p += 2; }
            else if (nxt === 'b') { bytes.push(0x08); p += 2; }
            else if (nxt === 'f') { bytes.push(0x0c); p += 2; }
            else if (nxt === '(' || nxt === ')' || nxt === '\\') { bytes.push(body.charCodeAt(p + 1)); p += 2; }
            else if (/[0-7]/.test(nxt)) {
              let oct = nxt; p += 2;
              if (p < body.length && /[0-7]/.test(body[p])) { oct += body[p]; p++; }
              if (oct.length < 3 && p < body.length && /[0-7]/.test(body[p])) { oct += body[p]; p++; }
              bytes.push(parseInt(oct, 8) & 0xff);
            } else { bytes.push(body.charCodeAt(p + 1)); p += 2; }
          } else { p++; }
        } else { bytes.push(body.charCodeAt(p)); p++; }
      }
      pendingStrings.push({ startPart: outParts.length, bytes: new Uint8Array(bytes) });
      emit(srcText.slice(i, j));
      i = j;
      continue;
    }

    if (ch === '<' && srcText[i + 1] !== '<') {
      let j = i + 1;
      while (j < n && srcText[j] !== '>') j++;
      const hex = srcText.slice(i + 1, j).replace(/\s+/g, '');
      const bytes = [];
      for (let k = 0; k + 2 <= hex.length; k += 2) bytes.push(parseInt(hex.substr(k, 2), 16));
      if (hex.length % 2 === 1) bytes.push(parseInt(hex[hex.length - 1] + '0', 16));
      pendingStrings.push({ startPart: outParts.length, bytes: new Uint8Array(bytes) });
      emit(srcText.slice(i, j + 1));
      i = j + 1;
      continue;
    }

    if (ch === '<' && srcText[i + 1] === '<') { emit('<<'); i += 2; continue; }
    if (ch === '>' && srcText[i + 1] === '>') { emit('>>'); i += 2; continue; }

    if (ch === '[') { pendingStrings = []; emit(ch); i++; continue; }
    if (ch === ']') { emit(ch); i++; continue; }

    // bare token (operator or number)
    let j = i;
    while (j < n && !isWS(srcText[j]) && !'()<>[]{}/%'.includes(srcText[j])) j++;
    const tok = srcText.slice(i, j);
    emit(tok);
    i = j;

    if (tok === 'q') { fontStack.push(curFont); }
    else if (tok === 'Q') { if (fontStack.length) curFont = fontStack.pop(); }
    else if (tok === 'Tf') { curFont = pendingName; }
    else if (tok === 'Tj' || tok === "'" || tok === '"') {
      if (targetFontTags.has(curFont) && pendingStrings.length) {
        const last = pendingStrings[pendingStrings.length - 1];
        const collapsed = collapseTwoByteCIDs(last.bytes);
        if (collapsed) outParts[last.startPart] = bytesToHex(collapsed);
      }
      pendingStrings = [];
    } else if (tok === 'TJ') {
      if (targetFontTags.has(curFont)) {
        for (const s of pendingStrings) {
          const collapsed = collapseTwoByteCIDs(s.bytes);
          if (collapsed) outParts[s.startPart] = bytesToHex(collapsed);
        }
      }
      pendingStrings = [];
    }
  }

  return outParts.join('');
}

// ---- Step 4: walk pages + Form XObjects recursively, rewrite content streams
const visitedStreams = new Set();
const visitedXobjs = new Set();
let rewroteStreams = 0;

function processContentStreamObj(cRef, targetTags) {
  if (!cRef || !cRef.isIndirect()) return;
  const cNum = cRef.asIndirect();
  if (visitedStreams.has(cNum)) return;
  visitedStreams.add(cNum);
  // mupdf: resolve() returns Dictionary (not Stream); cRef has stream content via readStream.
  const cObj = cRef.resolve();
  if (!cObj || !cObj.isDictionary()) return;
  console.log(`  PageContent obj ${cNum}: tags=${[...targetTags].join(',') || '<none>'}`);
  if (targetTags.size === 0) return;
  const buf = Buffer.from(cRef.readStream().asUint8Array());
  const srcText = buf.toString('latin1');
  const newText = rewriteContentStream(srcText, targetTags);
  if (newText !== srcText) {
    const mbuf = new mupdf.Buffer();
    mbuf.writeBuffer(Buffer.from(newText, 'latin1'));
    cRef.writeStream(mbuf);
    rewroteStreams++;
    console.log(`    -> rewrote ${srcText.length} -> ${newText.length} bytes`);
  }
}

function processResources(resources) {
  // returns the set of font tags (within this resources dict) that map to Conn wrappers
  if (!resources) return new Set();
  let fontDict = resources.get('Font');
  if (fontDict && fontDict.isIndirect()) fontDict = fontDict.resolve();
  const targetTags = new Set();
  if (fontDict) {
    fontDict.forEach((val, key) => {
      if (val && val.isIndirect()) {
        const num = val.asIndirect();
        if (connWrappers.has(num)) targetTags.add(key);
      }
    });
    for (const tag of targetTags) fontDict.put(tag, sharedFontRef);
  }
  return targetTags;
}

function processXObjects(resources) {
  if (!resources) return;
  let xobjDict = resources.get('XObject');
  if (xobjDict && xobjDict.isIndirect()) xobjDict = xobjDict.resolve();
  if (!xobjDict) return;
  xobjDict.forEach((val, key) => {
    if (!val || !val.isIndirect()) return;
    const xNum = val.asIndirect();
    if (visitedXobjs.has(xNum)) return;
    visitedXobjs.add(xNum);
    const xObj = val.resolve();
    if (!xObj || !xObj.isDictionary()) return;
    // Check Subtype: only Form XObjects have content; Image XObjects we skip.
    const xSub = xObj.get('Subtype');
    if (xSub && xSub.asName() !== 'Form') return;
    // Form XObject has its own /Resources (sometimes); process recursively.
    let xRes = xObj.get('Resources');
    if (xRes && xRes.isIndirect()) xRes = xRes.resolve();
    const inheritedTags = xRes ? processResources(xRes) : new Set();
    if (xRes) processXObjects(xRes);
    console.log(`  XObj ${xNum} (/${key}): tags=${[...inheritedTags].join(',') || '<none>'}`);
    if (inheritedTags.size > 0) {
      const buf = Buffer.from(val.readStream().asUint8Array());
      const srcText = buf.toString('latin1');
      const newText = rewriteContentStream(srcText, inheritedTags);
      if (newText !== srcText) {
        const mbuf = new mupdf.Buffer();
        mbuf.writeBuffer(Buffer.from(newText, 'latin1'));
        val.writeStream(mbuf);
        rewroteStreams++;
        console.log(`    -> rewrote ${srcText.length} -> ${newText.length} bytes`);
      }
    }
  });
}

const pageCount = pdf.countPages();
console.log('Pages:', pageCount);
for (let pi = 0; pi < pageCount; pi++) {
  const page = pdf.loadPage(pi);
  const pageObj = page.getObject();
  let resources = pageObj.get('Resources');
  if (resources && resources.isIndirect()) resources = resources.resolve();
  const targetTags = processResources(resources);
  processXObjects(resources);
  // Page's direct content
  let contents = pageObj.get('Contents');
  if (contents) {
    if (contents.isIndirect()) processContentStreamObj(contents, targetTags);
    else if (contents.isArray()) {
      for (let k = 0; k < contents.length; k++) processContentStreamObj(contents.get(k), targetTags);
    }
  }
}
console.log('Rewrote content streams:', rewroteStreams);
console.log('Visited XObjects:', visitedXobjs.size);

// ---- Step 5: save
const outBuf = pdf.saveToBuffer('compress=yes,garbage=yes');
const obuf = Buffer.from(outBuf.asUint8Array());
fs.writeFileSync(DST, obuf);
console.log('Wrote', DST, obuf.length, 'bytes');
