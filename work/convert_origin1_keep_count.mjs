// Convert origin1.pdf: for EACH TrueType CID Connections wrapper, replace it IN-PLACE with a
// simple Type 1 dict. Keep its original BaseFont (with its subset prefix), so Acrobat shows
// each original wrapper as a separate "Connections (Embedded Subset)" row labeled Type 1.
//
// All wrappers share one FontDescriptor + FontFile3 + Encoding for simplicity.
import fs from 'fs';
import * as mupdf from 'mupdf';

const SRC = '../asset/origin1.pdf';
const DST = 'C:/output/result1.pdf';
const SIMPLE_CFF = fs.readFileSync('Connections-Regular-Simple.cff');

const data = fs.readFileSync(SRC);
const doc = mupdf.Document.openDocument(data, 'application/pdf');
const pdf = doc.asPDF();
const N = pdf.countObjects();
console.log('Total objects:', N);

// ---- Step 1: find all Type 0 Connections wrappers (keep their object numbers + BaseFont)
const wrappers = [];
for (let i = 1; i < N; i++) {
  let o;
  try { o = pdf.newIndirect(i, 0).resolve(); } catch { continue; }
  if (!o || !o.isDictionary()) continue;
  const t = o.get('Type'); if (!t || t.asName() !== 'Font') continue;
  const st = o.get('Subtype'); if (!st || st.asName() !== 'Type0') continue;
  const bf = o.get('BaseFont'); if (!bf || !/Connections/i.test(bf.asName())) continue;
  wrappers.push({ num: i, baseFont: bf.asName() });
}
console.log('Connections wrappers:', wrappers.length);
const connWrapperSet = new Set(wrappers.map(w => w.num));

// ---- Step 2: build shared FontDescriptor + FontFile3 (Type1C CFF) + Encoding
// Glyph names of the simple CFF (read from charset) — used to populate /Differences
const STD_SID_NAMES = ['.notdef','space','exclam','quotedbl','numbersign','dollar','percent','ampersand','quoteright','parenleft','parenright','asterisk','plus','comma','hyphen','period','slash','zero','one','two','three','four','five','six','seven','eight','nine','colon','semicolon','less','equal','greater','question','at','A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z','bracketleft','backslash','bracketright','asciicircum','underscore','quoteleft','a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t','u','v','w','x','y','z','braceleft','bar','braceright','asciitilde','exclamdown','cent','sterling','fraction','yen','florin','section','currency','quotesingle','quotedblleft','guillemotleft','guilsinglleft','guilsinglright','fi','fl','endash','dagger','daggerdbl','periodcentered','paragraph','bullet','quotesinglbase','quotedblbase','quotedblright','guillemotright','ellipsis','perthousand','questiondown','grave','acute','circumflex','tilde','macron','breve','dotaccent','dieresis','ring','cedilla','hungarumlaut','ogonek','caron','emdash'];
function readCFFGlyphNames(cff) {
  const hdrSize = cff[2]; let p = hdrSize;
  function readIdx(pp){
    const cn=(cff[pp]<<8)|cff[pp+1]; if(cn===0)return {end:pp+2,entries:[]};
    const os=cff[pp+2]; const offs=[];
    for(let i=0;i<=cn;i++){let v=0;for(let j=0;j<os;j++)v=(v<<8)|cff[pp+3+i*os+j];offs.push(v);}
    const db=pp+3+os*(cn+1); const entries=[];
    for(let i=0;i<cn;i++)entries.push(cff.slice(db+offs[i]-1,db+offs[i+1]-1));
    return {end:db+offs[cn]-1,entries};
  }
  const nameI=readIdx(p);p=nameI.end;
  const topI=readIdx(p);p=topI.end;
  const strI=readIdx(p);p=strI.end;
  const strings=strI.entries.map(e=>e.toString('latin1'));
  function parseDictAll(dd){
    const map={}; let s=[]; let i=0;
    while(i<dd.length){
      const b=dd[i];
      if(b<=21){let op=b;if(b===12){op=1200+dd[i+1];i+=2;}else i++;map[op]=s;s=[];}
      else if(b===28){s.push((dd[i+1]<<8)|dd[i+2]);i+=3;}
      else if(b===29){s.push((dd[i+1]<<24)|(dd[i+2]<<16)|(dd[i+3]<<8)|dd[i+4]);i+=5;}
      else if(b>=32&&b<=246){s.push(b-139);i++;}
      else if(b>=247&&b<=250){s.push((b-247)*256+dd[i+1]+108);i+=2;}
      else if(b>=251&&b<=254){s.push(-(b-251)*256-dd[i+1]-108);i+=2;}
      else if(b===30){i++;while(i<dd.length){const n=dd[i++];if((n&0x0f)===0x0f||(n>>4)===0x0f)break;}s.push(0);}
      else i++;
    }
    return map;
  }
  const td=parseDictAll(topI.entries[0]);
  const csOff=td[17][0];
  const charsetOff=td[15]?td[15][0]:0;
  const nG=(cff[csOff]<<8)|cff[csOff+1];
  const fmt=cff[charsetOff];
  const names=['.notdef'];
  if(fmt===0){
    for(let g=1;g<nG;g++){
      const sid=(cff[charsetOff+1+(g-1)*2]<<8)|cff[charsetOff+2+(g-1)*2];
      names.push(sid<391?(STD_SID_NAMES[sid]||('sid'+sid)):(strings[sid-391]||('sid'+sid)));
    }
  }
  return names;
}
const cffNames = readCFFGlyphNames(SIMPLE_CFF);
console.log('CFF glyphs:', cffNames.length);

// FontFile3 stream
const fontFileRef = pdf.addStream(SIMPLE_CFF, pdf.newDictionary());
const fontFile = fontFileRef.resolve();
fontFile.put('Subtype', pdf.newName('Type1C'));

// FontDescriptor (shared)
const fdDict = pdf.newDictionary();
fdDict.put('Type', pdf.newName('FontDescriptor'));
fdDict.put('FontName', pdf.newName('Connections'));
fdDict.put('Flags', pdf.newInteger(4));
fdDict.put('ItalicAngle', pdf.newInteger(0));
fdDict.put('Ascent', pdf.newInteger(800));
fdDict.put('Descent', pdf.newInteger(-200));
fdDict.put('CapHeight', pdf.newInteger(700));
fdDict.put('StemV', pdf.newInteger(80));
const fbb = pdf.newArray();
fbb.push(pdf.newInteger(-200)); fbb.push(pdf.newInteger(-300));
fbb.push(pdf.newInteger(1100)); fbb.push(pdf.newInteger(1000));
fdDict.put('FontBBox', fbb);
fdDict.put('FontFile3', fontFileRef);
const fdRef = pdf.addObject(fdDict);

// Encoding (shared): /Differences mapping code C -> glyph name at GID C in simple CFF
function buildDifferences() {
  const a = pdf.newArray();
  a.push(pdf.newInteger(0));
  for (let c = 0; c < 256; c++) {
    const name = (c < cffNames.length) ? cffNames[c] : '.notdef';
    a.push(pdf.newName(name));
  }
  return a;
}
const encDict = pdf.newDictionary();
encDict.put('Type', pdf.newName('Encoding'));
encDict.put('Differences', buildDifferences());
const encRef = pdf.addObject(encDict);

function buildWidths() {
  const a = pdf.newArray();
  for (let i = 0; i < 256; i++) a.push(pdf.newInteger(600));
  return a;
}

// ---- Step 3: REPLACE each Type 0 wrapper's dict with a simple Type 1 dict (in place; same obj number)
for (const w of wrappers) {
  const o = pdf.newIndirect(w.num, 0).resolve();
  // Remove all keys
  const keys = [];
  o.forEach((_, k) => keys.push(k));
  for (const k of keys) o.delete(k);
  // Populate as simple Type 1
  o.put('Type', pdf.newName('Font'));
  o.put('Subtype', pdf.newName('Type1'));
  o.put('BaseFont', pdf.newName(w.baseFont));   // preserves subset prefix -> Acrobat shows as separate row
  o.put('FontDescriptor', fdRef);
  o.put('Encoding', encRef);
  o.put('FirstChar', pdf.newInteger(0));
  o.put('LastChar', pdf.newInteger(255));
  o.put('Widths', buildWidths());
}
console.log('Replaced', wrappers.length, 'wrappers in-place with simple Type 1 dicts');

// ---- Step 4: rewrite content streams (collapse 2-byte CIDs -> 1-byte codes)
function collapseTwoByteCIDs(bytes) {
  if (bytes.length % 2 !== 0) return null;
  const out = new Uint8Array(bytes.length / 2);
  for (let i = 0; i < bytes.length; i += 2) {
    if (bytes[i] !== 0) return null;
    out[i / 2] = bytes[i + 1];
  }
  return out;
}
function bytesToHex(bytes) {
  let s = '<';
  for (const b of bytes) s += b.toString(16).padStart(2, '0').toUpperCase();
  s += '>';
  return s;
}

function rewriteContentStream(srcText, targetFontTags) {
  const n = srcText.length;
  let outParts = [];
  function emit(s) { outParts.push(s); }
  function isWS(ch){return ch===' '||ch==='\t'||ch==='\r'||ch==='\n'||ch==='\f'||ch==='\0';}
  let i = 0, curFont = null;
  const fontStack = [];
  let pendingName = null;
  let pendingStrings = [];

  while (i < n) {
    const ch = srcText[i];
    if (isWS(ch)) { emit(ch); i++; continue; }
    if (ch === '%') { let j = i; while (j < n && srcText[j] !== '\n' && srcText[j] !== '\r') j++; emit(srcText.slice(i, j)); i = j; continue; }
    if (ch === '/') {
      let j = i + 1;
      while (j < n && !isWS(srcText[j]) && !'()<>[]{}/%'.includes(srcText[j])) j++;
      pendingName = srcText.slice(i + 1, j);
      emit(srcText.slice(i, j)); i = j; continue;
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
      emit(srcText.slice(i, j)); i = j; continue;
    }
    if (ch === '<' && srcText[i + 1] !== '<') {
      let j = i + 1;
      while (j < n && srcText[j] !== '>') j++;
      const hex = srcText.slice(i + 1, j).replace(/\s+/g, '');
      const bytes = [];
      for (let k = 0; k + 2 <= hex.length; k += 2) bytes.push(parseInt(hex.substr(k, 2), 16));
      if (hex.length % 2 === 1) bytes.push(parseInt(hex[hex.length - 1] + '0', 16));
      pendingStrings.push({ startPart: outParts.length, bytes: new Uint8Array(bytes) });
      emit(srcText.slice(i, j + 1)); i = j + 1; continue;
    }
    if (ch === '<' && srcText[i + 1] === '<') { emit('<<'); i += 2; continue; }
    if (ch === '>' && srcText[i + 1] === '>') { emit('>>'); i += 2; continue; }
    if (ch === '[') { pendingStrings = []; emit(ch); i++; continue; }
    if (ch === ']') { emit(ch); i++; continue; }

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

// Walk pages + Form XObjects recursively
const visitedStreams = new Set();
const visitedXobjs = new Set();
let rewroteStreams = 0;

function processContentStreamObj(cRef, targetTags) {
  if (!cRef || !cRef.isIndirect()) return;
  const cNum = cRef.asIndirect();
  if (visitedStreams.has(cNum)) return;
  visitedStreams.add(cNum);
  const cObj = cRef.resolve();
  if (!cObj || !cObj.isDictionary()) return;
  if (targetTags.size === 0) return;
  const buf = Buffer.from(cRef.readStream().asUint8Array());
  const srcText = buf.toString('latin1');
  const newText = rewriteContentStream(srcText, targetTags);
  if (newText !== srcText) {
    const mbuf = new mupdf.Buffer();
    mbuf.writeBuffer(Buffer.from(newText, 'latin1'));
    cRef.writeStream(mbuf);
    rewroteStreams++;
  }
}

function tagsInResources(resources) {
  if (!resources) return new Set();
  let fontDict = resources.get('Font');
  if (fontDict && fontDict.isIndirect()) fontDict = fontDict.resolve();
  const targetTags = new Set();
  if (fontDict) {
    fontDict.forEach((val, key) => {
      if (val && val.isIndirect()) {
        const num = val.asIndirect();
        if (connWrapperSet.has(num)) targetTags.add(key);
      }
    });
  }
  return targetTags;
}

function processXObjects(resources) {
  if (!resources) return;
  let xobjDict = resources.get('XObject');
  if (xobjDict && xobjDict.isIndirect()) xobjDict = xobjDict.resolve();
  if (!xobjDict) return;
  xobjDict.forEach((val) => {
    if (!val || !val.isIndirect()) return;
    const xNum = val.asIndirect();
    if (visitedXobjs.has(xNum)) return;
    visitedXobjs.add(xNum);
    const xObj = val.resolve();
    if (!xObj || !xObj.isDictionary()) return;
    const xSub = xObj.get('Subtype');
    if (xSub && xSub.asName() !== 'Form') return;
    let xRes = xObj.get('Resources');
    if (xRes && xRes.isIndirect()) xRes = xRes.resolve();
    const targetTags = xRes ? tagsInResources(xRes) : new Set();
    if (xRes) processXObjects(xRes);
    if (targetTags.size > 0) {
      const buf = Buffer.from(val.readStream().asUint8Array());
      const srcText = buf.toString('latin1');
      const newText = rewriteContentStream(srcText, targetTags);
      if (newText !== srcText) {
        const mbuf = new mupdf.Buffer();
        mbuf.writeBuffer(Buffer.from(newText, 'latin1'));
        val.writeStream(mbuf);
        rewroteStreams++;
      }
    }
  });
}

const pageCount = pdf.countPages();
for (let pi = 0; pi < pageCount; pi++) {
  const page = pdf.loadPage(pi);
  const pageObj = page.getObject();
  let resources = pageObj.get('Resources');
  if (resources && resources.isIndirect()) resources = resources.resolve();
  const targetTags = tagsInResources(resources);
  processXObjects(resources);
  const contents = pageObj.get('Contents');
  if (contents) {
    if (contents.isIndirect()) processContentStreamObj(contents, targetTags);
    else if (contents.isArray()) {
      for (let k = 0; k < contents.length; k++) processContentStreamObj(contents.get(k), targetTags);
    }
  }
}
console.log('Rewrote content streams:', rewroteStreams);

const outBuf = pdf.saveToBuffer('compress=yes,garbage=yes');
const buf = Buffer.from(outBuf.asUint8Array());
fs.writeFileSync(DST, buf);
console.log('Wrote', DST, buf.length, 'bytes');
