// V2: keep the PDF's Type 0 / CID structure. Only swap the embedded TrueType (FontFile2)
// for a CID-keyed CFF (FontFile3 / CIDFontType0C). Update the CIDFont's Subtype from
// CIDFontType2 to CIDFontType0. No content stream rewriting needed.
//
// Result: Acrobat will report the embedded "Connections" font as Type 1 (CFF-based CID).

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const SRC = 'normalized.pdf';
const text = fs.readFileSync(SRC, 'latin1');
const buf  = fs.readFileSync(SRC);

class PdfObj {
  constructor(num, gen, dictText, streamData) {
    this.num = num; this.gen = gen;
    this.dictText = dictText;
    this.streamData = streamData;
  }
  isStream() { return this.streamData !== null; }
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

// Find CIDFontType2 objects and their FontDescriptor/FontFile2 chain
const cidFonts = [];
for (const [num, o] of objs) {
  if (/\/Subtype\s*\/CIDFontType2\b/.test(o.dictText)) {
    const fdMatch = o.dictText.match(/\/FontDescriptor\s+(\d+)\s+\d+\s+R/);
    if (!fdMatch) continue;
    const fdNum = parseInt(fdMatch[1]);
    const fdObj = objs.get(fdNum);
    if (!fdObj) continue;
    const ff2Match = fdObj.dictText.match(/\/FontFile2\s+(\d+)\s+\d+\s+R/);
    if (!ff2Match) continue;
    cidFonts.push({ num, fdNum, ff2Num: parseInt(ff2Match[1]) });
  }
}
console.log('CIDFontType2 objects:', cidFonts.length);
cidFonts.forEach(f => console.log(`  CIDFont ${f.num} -> FontDescriptor ${f.fdNum} -> FontFile2 ${f.ff2Num}`));

// Read the CID-keyed CFF we generated
const cidCff = fs.readFileSync('Connections-Regular-CIDCFF.cff');
const cffCompressed = zlib.deflateSync(cidCff);
console.log('CID-keyed CFF:', cidCff.length, 'bytes (compressed', cffCompressed.length, ')');

// ----------------------- Emit rewritten PDF -----------------------
const out = [];
const xref = new Map();
function emit(s) { out.push(typeof s === 'string' ? Buffer.from(s, 'latin1') : s); }
function curLen() { return out.reduce((a, b) => a + b.length, 0); }

emit('%PDF-1.6\n%\xE2\xE3\xCF\xD3\n');

const cidFontByNum = new Map(cidFonts.map(f => [f.num, f]));
const fdByNum = new Map(cidFonts.map(f => [f.fdNum, f]));
const ff2ByNum = new Map(cidFonts.map(f => [f.ff2Num, f]));

const maxNum = Math.max(...objs.keys());
for (let n = 1; n <= maxNum; n++) {
  if (!objs.has(n)) continue;
  const o = objs.get(n);
  xref.set(n, curLen());
  emit(`${n} ${o.gen} obj\n`);

  if (cidFontByNum.has(n)) {
    // Change /Subtype /CIDFontType2 -> /Subtype /CIDFontType0
    let dict = o.dictText.replace(/\/Subtype\s*\/CIDFontType2/, '/Subtype /CIDFontType0');
    // CIDToGIDMap entry is meaningless for CIDFontType0 — remove it
    dict = dict.replace(/\/CIDToGIDMap\s+(?:\/\w+|\d+\s+\d+\s+R)/g, '');
    emit(dict + '\n');
  } else if (fdByNum.has(n)) {
    // Replace /FontFile2 -> /FontFile3
    let dict = o.dictText.replace(/\/FontFile2\s+(\d+\s+\d+\s+R)/, '/FontFile3 $1');
    emit(dict + '\n');
  } else if (ff2ByNum.has(n)) {
    // Replace the TTF stream with CFF data, add /Subtype /CIDFontType0C
    emit(`<< /Subtype /CIDFontType0C /Filter /FlateDecode /Length ${cffCompressed.length} >>\nstream\n`);
    emit(cffCompressed);
    emit('\nendstream\n');
  } else if (o.isStream()) {
    // Pass stream through, recompressing with FlateDecode for compactness
    const raw = /\/Filter\s+\/FlateDecode/.test(o.dictText) ? zlib.inflateSync(o.streamData) : o.streamData;
    const compressed = zlib.deflateSync(raw);
    // Clean dict: drop /Length and /Filter, then add fresh ones
    let dict = o.dictText.trim();
    // Strip /Length and /Filter entries respecting nested dicts
    function stripKey(text, key) {
      // Match key followed by an indirect ref, name, integer, or array
      const re = new RegExp('\\/' + key + '\\s+(?:\\d+\\s+\\d+\\s+R|\\/[A-Za-z][\\w]*|\\d+|\\[[^\\]]*\\])', 'g');
      return text.replace(re, '');
    }
    dict = stripKey(dict, 'Length');
    dict = stripKey(dict, 'Filter');
    // Insert the new keys right before the closing >>
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
const outPath = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
fs.writeFileSync(outPath, outBuf);
console.log(`Wrote ${outPath} (${outBuf.length} bytes)`);
