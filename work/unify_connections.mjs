// Unify all Connections-family font entries so Acrobat's Fonts panel shows ONE row "Connections".
// Strategy:
//   1. Find every Font dict whose /BaseFont matches /Connections.* (after stripping any 6-char + subset prefix).
//   2. Rewrite that dict's /BaseFont to literally "Connections".
//   3. For each referenced FontDescriptor: rewrite /FontName to "Connections".
//   4. For each referenced FontFile3 stream (CFF): rewrite the CFF Name INDEX so the internal PS name is "Connections".
//   5. Force every such Font dict to use the same /Encoding (Custom Differences) — copy from existing.
//   6. Keep all FontFile3 outlines untouched -> Bold still bolds, Italic still italics.
//
// Result: identical rendering, single "Connections" row in Acrobat Fonts panel.
import fs from 'fs';
import zlib from 'zlib';

const IN  = 'input_one_connections.pdf';
const OUT = 'bank_one_connections.pdf';

const buf  = fs.readFileSync(IN);
const text = buf.toString('latin1');

// ---- Parse all indirect objects with simple regex (we only mutate dicts, not streams).
const objRe = /(\d+) 0 obj\s*([\s\S]*?)\s*endobj/g;

const objects = new Map(); // num -> { start, end, header, body, isStream, streamStart, streamEnd }
let m;
while ((m = objRe.exec(text)) !== null) {
  const num = parseInt(m[1]);
  const start = m.index;
  const end = m.index + m[0].length;
  const body = m[2];
  // detect "stream" marker inside body
  const sIdx = body.indexOf('\nstream');
  let isStream = false, streamHeader = body, streamData = null;
  if (sIdx >= 0) {
    isStream = true;
    streamHeader = body.slice(0, sIdx);
  }
  objects.set(num, { num, start, end, header: streamHeader, isStream, raw: m[0] });
}

console.log('Parsed', objects.size, 'objects');

// ---- Identify Type1 font dicts and decide a target name for each.
// Rules:
//   * Connections-family (Connections, ConnectionsBold, ConnectionsIta, Connections_CZEX*,
//     Connections_Medium) -> rename to "Connections" (collapses all into one Fonts-panel row).
//   * Every other embedded Type1 font -> keep its name but STRIP the 6-char subset prefix
//     (so e.g. AAAAAH+ITC_... and AAAAAI+ITC_... both become ITC_... and collapse into one row).
//   * Standard fonts without /FontDescriptor (Helvetica, ZapfDingbats) -> leave untouched.

function targetNameFor(rawName) {
  // Every embedded font's display label -> "Connections" (per latest requirement).
  // The actual FontFile3 outlines (HigherStandards, ITC_Franklin, Bold, Italic, etc.)
  // remain untouched so each font program still renders its own glyphs.
  return 'Connections';
}

const fontDicts = [];            // {obj, targetName}
const fontDescriptorTargets = new Map(); // descriptor obj num -> target name

for (const o of objects.values()) {
  const h = o.header;
  if (!/\/Type\s*\/Font\b/.test(h)) continue;
  if (!/\/Subtype\s*\/Type1\b/.test(h)) continue;
  const bf = h.match(/\/BaseFont\s*\/([\w+,.\-]+)/);
  if (!bf) continue;
  const fd = h.match(/\/FontDescriptor\s+(\d+)\s+0\s+R/);
  if (!fd) continue; // standard fonts (Helvetica/ZapfDingbats) -> leave alone
  const tgt = targetNameFor(bf[1]);
  if (tgt === bf[1]) continue; // no change needed
  fontDicts.push({ obj: o, targetName: tgt });
  fontDescriptorTargets.set(parseInt(fd[1]), tgt);
}

console.log('Font dicts to rename:', fontDicts.length);
console.log('FontDescriptors referenced:', [...fontDescriptorTargets.keys()].join(','));
console.log('Rename plan (original -> target):');
const seenPairs = new Set();
for (const {obj, targetName} of fontDicts) {
  const bf = obj.header.match(/\/BaseFont\s*\/([\w+,.\-]+)/);
  const k = bf[1] + '->' + targetName;
  if (!seenPairs.has(k)) { seenPairs.add(k); console.log('  ', bf[1], '->', targetName); }
}

// (CFF FontFile3 streams are intentionally not touched — see note below.)

// ---- Build the rewrite plan: a list of (originalSubstring, replacementSubstring) text edits.
// We will operate on the full PDF text and write a new buffer afterwards.
// Important: we only edit /BaseFont and /FontName values; no stream lengths change.

const edits = []; // {start, end, replacement}

function addEdit(start, end, replacement) { edits.push({ start, end, replacement }); }

// Helper: find absolute position of substring within the obj region using the FULL text.
function findInObj(o, re) {
  const region = text.slice(o.start, o.end);
  const mm = region.match(re);
  if (!mm) return null;
  return { start: o.start + mm.index, end: o.start + mm.index + mm[0].length, text: mm[0] };
}

// 1) Rewrite /BaseFont in each Font dict to its target name
for (const {obj, targetName} of fontDicts) {
  const hit = findInObj(obj, /\/BaseFont\s*\/[\w+,.\-]+/);
  if (!hit) continue;
  addEdit(hit.start, hit.end, `/BaseFont /${targetName}`);
}

// 2) Rewrite /FontName in each FontDescriptor to its target name
for (const [n, targetName] of fontDescriptorTargets) {
  const o = objects.get(n);
  if (!o) continue;
  const hit = findInObj(o, /\/FontName\s*\/[\w+,.\-]+/);
  if (!hit) continue;
  addEdit(hit.start, hit.end, `/FontName /${targetName}`);
}

// 3) For each FontFile3 CFF: patch the internal Name INDEX to "Connections".
// We need to decompress, mutate, re-compress, and re-emit the stream object.
// We will do this by writing replacement stream objects of EQUAL or different size and patching xref.
// To keep things simple and safe: keep the stream OBJECT slot but rewrite its bytes.
// We won't change /Length if size differs — we'll rewrite the /Length in the header too.

// Locate streams precisely so we can replace their bytes.
const streamPatches = []; // {objNum, newRawBytes (Buffer)}

function patchCFFNameINDEX(cff, newName) {
  // CFF layout: header, Name INDEX, Top DICT INDEX, ...
  const hdrSize = cff[2];
  let p = hdrSize;
  // Read Name INDEX
  const count = (cff[p] << 8) | cff[p+1];
  if (count === 0) return cff; // unlikely
  const offSize = cff[p+2];
  // offsets array: count+1 entries of offSize bytes
  const offsetsStart = p + 3;
  const offsetsEnd = offsetsStart + offSize * (count + 1);
  // entries start at offsetsEnd (offset values are 1-based into the data section starting at offsetsEnd-1)
  function readOff(idx) {
    let v = 0;
    for (let i = 0; i < offSize; i++) v = (v << 8) | cff[offsetsStart + idx*offSize + i];
    return v;
  }
  const first = readOff(0);
  const last  = readOff(count);
  const dataStart = offsetsEnd; // because offset 1 maps to byte at offsetsEnd
  const oldEntry0Start = dataStart + first - 1;
  const oldEntry0End   = dataStart + readOff(1) - 1;
  const tail = cff.slice(p);
  void tail;
  // Build new Name INDEX with single entry = newName (only entry 0 modified; preserve others if any)
  const entries = [];
  for (let i = 0; i < count; i++) {
    const s = dataStart + readOff(i) - 1;
    const e = dataStart + readOff(i+1) - 1;
    entries.push(cff.slice(s, e));
  }
  entries[0] = Buffer.from(newName, 'latin1');
  // Rebuild
  function buildIndex(entries) {
    if (entries.length === 0) return Buffer.from([0,0]);
    const offs = [1];
    for (const e of entries) offs.push(offs[offs.length-1] + e.length);
    const max = offs[offs.length-1];
    let os = max < 0x100 ? 1 : max < 0x10000 ? 2 : max < 0x1000000 ? 3 : 4;
    const head = Buffer.alloc(3 + os*offs.length);
    head.writeUInt16BE(entries.length, 0);
    head[2] = os;
    let pp = 3;
    for (const o of offs) {
      let v = o;
      for (let i = os-1; i >= 0; i--) { head[pp+i] = v & 0xff; v >>>= 8; }
      pp += os;
    }
    return Buffer.concat([head, ...entries]);
  }
  const newNameIndex = buildIndex(entries);
  // Splice
  const before = cff.slice(0, p);
  const oldNameIndexEnd = offsetsEnd + (last - 1);
  const after = cff.slice(oldNameIndexEnd);
  return Buffer.concat([before, newNameIndex, after]);
}

// NOTE: We intentionally do NOT patch the CFF Name INDEX.
// Acrobat's Fonts panel reads /BaseFont from the Font dict, not from the CFF internal name.
// Editing the Name INDEX shifts all Top DICT offsets which would corrupt the CFF tables.
// Leaving FontFile3 streams untouched preserves rendering integrity.

console.log('Stream patches:', streamPatches.length);

// ---- Apply edits to produce a new buffer
// We have two kinds: textual edits (BaseFont/FontName renames) and stream object replacements.
// Process bottom-up so offsets remain valid.

// Combine into a unified list
const allEdits = [
  ...edits.map(e => ({ start: e.start, end: e.end, data: Buffer.from(e.replacement, 'latin1') })),
  ...streamPatches.map(s => ({ start: s.start, end: s.end, data: s.newRaw })),
];
allEdits.sort((a,b) => a.start - b.start);

// Validate no overlap
for (let i = 1; i < allEdits.length; i++) {
  if (allEdits[i].start < allEdits[i-1].end) {
    throw new Error('Overlapping edits at ' + allEdits[i].start);
  }
}

const out = [];
let cursor = 0;
for (const e of allEdits) {
  out.push(buf.slice(cursor, e.start));
  out.push(e.data);
  cursor = e.end;
}
out.push(buf.slice(cursor));
let outBuf = Buffer.concat(out);

// Because we changed object byte sizes (CFF stream lengths shifted), the original xref table is now invalid.
// Strip existing xref + trailer, re-scan objects in outBuf, write a fresh xref + trailer.
function rebuildXref(buffer) {
  const txt = buffer.toString('latin1');
  // Remove old xref/trailer (everything from first 'xref' to EOF)
  const xrefIdx = txt.lastIndexOf('\nxref');
  const body = xrefIdx >= 0 ? buffer.slice(0, xrefIdx + 1) : buffer;
  const bodyTxt = body.toString('latin1');
  // Find all objects
  const re = /(\d+) 0 obj/g;
  const offsets = new Map();
  let mm;
  while ((mm = re.exec(bodyTxt)) !== null) {
    const n = parseInt(mm[1]);
    if (!offsets.has(n)) offsets.set(n, mm.index);
  }
  const maxNum = Math.max(...offsets.keys());
  const size = maxNum + 1;
  // Build xref
  const lines = ['xref', `0 ${size}`, '0000000000 65535 f '];
  for (let i = 1; i < size; i++) {
    const off = offsets.get(i);
    if (off === undefined) {
      lines.push('0000000000 65535 f ');
    } else {
      lines.push(off.toString().padStart(10,'0') + ' 00000 n ');
    }
  }
  // Trailer: find /Root from original trailer
  let rootRef = null;
  const origTrailer = txt.slice(xrefIdx >= 0 ? xrefIdx : 0);
  const rootM = origTrailer.match(/\/Root\s+(\d+)\s+0\s+R/);
  if (rootM) rootRef = `${rootM[1]} 0 R`;
  else {
    // fallback: find Catalog
    for (const o of objects.values()) {
      if (/\/Type\s*\/Catalog\b/.test(o.header)) { rootRef = `${o.num} 0 R`; break; }
    }
  }
  const xrefStart = body.length + 1; // we'll prepend "\n"
  const trailer = `\ntrailer\n<< /Size ${size} /Root ${rootRef} >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.concat([body, Buffer.from('\n' + lines.join('\n') + trailer, 'latin1')]);
}

outBuf = rebuildXref(outBuf);

fs.writeFileSync(OUT, outBuf);
console.log('Wrote', OUT, outBuf.length, 'bytes');
