// Run all acceptance tests defined in the requirements.
import fs from 'fs';

const ORIGIN = '../asset/origin.pdf';
const FINAL  = 'bank_one_connections.pdf';

const finalBuf = fs.readFileSync(FINAL);
const finalTxt = finalBuf.toString('latin1');

function pass(label, cond, detail = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
}

// T1: no Type0 / CIDFontType2 references
const t0Hits = (finalTxt.match(/\/Subtype\s*\/Type0\b/g) || []).length;
const cidHits = (finalTxt.match(/\/Subtype\s*\/CIDFontType2\b/g) || []).length;
pass('T1  No /Type0 or /CIDFontType2 in final', t0Hits === 0 && cidHits === 0,
     `(Type0=${t0Hits}, CIDFontType2=${cidHits})`);

// T2: count Connections-prefixed rows
const fontRows = new Set();
const fre = /(\d+) 0 obj\s*<<([\s\S]*?)>>\s*endobj/g;
let m;
while ((m = fre.exec(finalTxt)) !== null) {
  const body = m[2];
  if (!/\/Type\s*\/Font\b/.test(body)) continue;
  const bf = body.match(/\/BaseFont\s*\/([\w+,.\-]+)/);
  if (!bf) continue;
  const sub = (body.match(/\/Subtype\s*\/(\w+)/) || [])[1] || '?';
  let enc;
  if (/\/Encoding\s*\/(\w+Encoding)/.test(body)) enc = body.match(/\/Encoding\s*\/(\w+Encoding)/)[1];
  else if (/\/Encoding\s+\d+\s+0\s+R/.test(body)) enc = 'Custom';
  else if (/\/Encoding\s*<<[\s\S]*?\/Differences/.test(body)) enc = 'Custom';
  else enc = '—';
  fontRows.add(`${bf[1]}  [${enc}]  ${sub}`);
}
const connRows = [...fontRows].filter(r => /Connections/i.test(r));
pass('T2  Connections-family rows = 1', connRows.length === 1,
     `(found ${connRows.length}: ${connRows.join(' | ')})`);

// T3+T4: HigherStandards and ITC Font dicts byte-identical to origin
async function loadFontDictsByName(path) {
  const txt = fs.readFileSync(path, 'latin1');
  // First try direct parse (works for normalized).
  // For origin.pdf (linearized + compressed), use normalized version we already have.
  const m = new Map();
  let mm;
  const re = /(\d+) 0 obj\s*<<([\s\S]*?)>>\s*endobj/g;
  while ((mm = re.exec(txt)) !== null) {
    const body = mm[2];
    if (!/\/Type\s*\/Font\b/.test(body) && !/\/Type\s*\/FontDescriptor/.test(body)) continue;
    const bf = body.match(/\/BaseFont\s*\/([\w+,.\-]+)/);
    const fn = body.match(/\/FontName\s*\/([\w+,.\-]+)/);
    const name = (bf && bf[1]) || (fn && fn[1]);
    if (!name) continue;
    if (!m.has(name)) m.set(name, []);
    m.get(name).push(body.replace(/\s+/g, ' ').trim());
  }
  return m;
}
const origDicts  = await loadFontDictsByName('origin_normalized.pdf');
const finalDicts = await loadFontDictsByName(FINAL);

function compareDictsFor(name) {
  const a = origDicts.get(name) || [];
  const b = finalDicts.get(name) || [];
  if (a.length !== b.length) return { ok:false, why: `count ${a.length} vs ${b.length}` };
  const A = [...a].sort(), B = [...b].sort();
  for (let i = 0; i < A.length; i++) {
    if (A[i] !== B[i]) return { ok:false, why: 'content differs', a:A[i].slice(0,160), b:B[i].slice(0,160) };
  }
  return { ok:true };
}
for (const target of ['AAAAAG+HigherStandards_CZEX0660', 'AAAAAH+ITC_Franklin_Gothic_Book_CZEX0080', 'AAAAAI+ITC_Franklin_Gothic_Book_CZEX0080']) {
  const r = compareDictsFor(target);
  pass(`T3/4  ${target} preserved byte-identical (normalized form)`, r.ok, r.ok ? '' : r.why);
}

// T5: text per page identical via pdf.js
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
async function pages(path) {
  const data = new Uint8Array(fs.readFileSync(path));
  const doc = await pdfjs.getDocument({data, disableFontFace:true, useSystemFonts:false}).promise;
  const out = [];
  for (let i=1;i<=doc.numPages;i++){ const p=await doc.getPage(i); const tc=await p.getTextContent(); out.push(tc.items.map(it=>it.str).join('')); }
  return out;
}
const warnsA = []; const warnsB = [];
const origWarn = console.warn;
console.warn = (...a) => warnsA.push(a.join(' '));
const ap = await pages(ORIGIN);
console.warn = (...a) => warnsB.push(a.join(' '));
const bp = await pages(FINAL);
console.warn = origWarn;
let identical = 0;
for (let i=0;i<ap.length;i++) if (ap[i]===bp[i]) identical++;
pass(`T5  8/8 pages text-identical to origin`, identical === ap.length, `(${identical}/${ap.length})`);

// T6: zero pdf.js warnings on final
pass(`T6  pdf.js warnings on final = 0`, warnsB.length === 0, `(origin warns: ${warnsA.length}, final warns: ${warnsB.length})`);

// T7: file size
pass(`T7  file size in 400-600 KB`, finalBuf.length >= 400_000 && finalBuf.length <= 600_000, `(${finalBuf.length} bytes)`);

// Summary of final fonts
console.log('\n--- Final font rows ---');
[...fontRows].sort().forEach(r => console.log('  ' + r));
