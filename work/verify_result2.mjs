// Verify C:/output/result2.pdf matches the user-specified target font structure.
import fs from 'fs';
import * as mupdf from 'mupdf';

const FINAL = 'C:/output/result2.pdf';
const ORIGIN = '../asset/origin2.pdf';

// User-specified target structure (15 entries)
const target = [
  ['Connections',                              'Type 1', 'Identity-H'],
  ['Connections',                              'Type 1', 'Identity-H'],
  ['Connections',                              'Type 1', 'Identity-H'],
  ['Connections',                              'Type 1', 'Identity-H'],
  ['Connections',                              'Type 1', 'Identity-H'],
  ['Connections',                              'Type 1', 'Identity-H'],
  ['ConnectionsBold_CZEX0AA0',                 'Type 1', 'Custom'],
  ['ConnectionsBold_CZEX0AA0',                 'Type 1', 'Roman'],
  ['Connections_CZEX0A60',                     'Type 1', 'Custom'],
  ['Connections_CZEX0A60',                     'Type 1', 'Roman'],
  ['Connections_Medium_CZEX0A80',              'Type 1', 'Custom'],
  ['Connections_Medium_CZEX0A80',              'Type 1', 'Roman'],
  ['HigherStandards_CZEX0660',                 'Type 1', 'Custom'],
  ['ITC_Franklin_Gothic_Book_CZEX0080',        'Type 1', 'Custom'],
  ['ITC_Franklin_Gothic_Book_CZEX0080',        'Type 1', 'Roman'],
];

function fontInventory(path) {
  const data = fs.readFileSync(path);
  const doc = mupdf.Document.openDocument(data, 'application/pdf');
  const pdf = doc.asPDF();
  const N = pdf.countObjects();
  const rows = [];
  for (let i = 1; i < N; i++) {
    let o;
    try { o = pdf.newIndirect(i, 0).resolve(); } catch { continue; }
    if (!o || !o.isDictionary()) continue;
    const t = o.get('Type'); if (!t || t.asName() !== 'Font') continue;
    const st = o.get('Subtype'); if (!st) continue;
    const sub = st.asName();
    if (sub === 'CIDFontType2' || sub === 'CIDFontType0') continue; // descendant
    const bfO = o.get('BaseFont'); if (!bfO) continue;
    const bf = bfO.asName();
    const noPrefix = bf.replace(/^[A-Z]{6}\+/, '');
    let type, enc;
    if (sub === 'Type0') {
      const desc = o.get('DescendantFonts');
      let descSubtype = null;
      if (desc && desc.isArray()) {
        const d0 = desc.get(0);
        if (d0 && d0.isIndirect()) {
          const d0r = d0.resolve();
          const dst = d0r.get('Subtype');
          if (dst) descSubtype = dst.asName();
        }
      }
      if (descSubtype === 'CIDFontType0') type = 'Type 1';
      else if (descSubtype === 'CIDFontType2') type = 'TrueType (CID)';
      else type = sub;
      const e = o.get('Encoding');
      enc = e ? e.asName() : '—';
    } else if (sub === 'Type1') {
      type = 'Type 1';
      const e = o.get('Encoding');
      if (e && e.isName()) {
        const n = e.asName();
        if (n === 'MacRomanEncoding') enc = 'Roman';
        else if (n === 'WinAnsiEncoding') enc = 'Ansi';
        else if (n === 'StandardEncoding') enc = 'Standard';
        else enc = n;
      } else if (e && (e.isDictionary() || e.isIndirect())) {
        enc = 'Custom';
      } else enc = '—';
    } else { type = sub; enc = '—'; }
    rows.push({ name: noPrefix, type, enc });
  }
  return rows;
}

console.log('=== ORIGIN inventory ===');
const orig = fontInventory(ORIGIN);
orig.sort((a,b)=>a.name.localeCompare(b.name) || a.enc.localeCompare(b.enc));
orig.forEach(r => console.log(`  ${r.name.padEnd(40)} ${r.type.padEnd(18)} ${r.enc}`));
console.log(`  total: ${orig.length} rows`);

console.log('\n=== FINAL inventory ===');
const final = fontInventory(FINAL);
final.sort((a,b)=>a.name.localeCompare(b.name) || a.enc.localeCompare(b.enc));
final.forEach(r => console.log(`  ${r.name.padEnd(40)} ${r.type.padEnd(18)} ${r.enc}`));
console.log(`  total: ${final.length} rows`);

// Count by (name, type, enc) for both
function tally(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = `${r.name}|${r.type}|${r.enc}`;
    m.set(k, (m.get(k)||0)+1);
  }
  return m;
}
const origT = tally(orig), finalT = tally(final);

console.log('\n=== TYPE CHANGE (Connections only) ===');
console.log(`  Origin TrueType (CID) Connections rows: ${[...origT].filter(([k])=>k.startsWith('Connections|TrueType (CID)|')).reduce((a,[,c])=>a+c,0)}`);
console.log(`  Final  Type 1 Connections [Identity-H] rows: ${[...finalT].filter(([k])=>k==='Connections|Type 1|Identity-H').reduce((a,[,c])=>a+c,0)}`);
console.log(`  Remaining TrueType (CID) in final: ${[...finalT].filter(([k])=>k.includes('TrueType (CID)')).reduce((a,[,c])=>a+c,0)}`);

console.log('\n=== Text diff via pdf.js ===');
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
async function pages(p){const d=new Uint8Array(fs.readFileSync(p));const doc=await pdfjs.getDocument({data:d,disableFontFace:true,useSystemFonts:false}).promise;const out=[];for(let i=1;i<=doc.numPages;i++){const pg=await doc.getPage(i);const tc=await pg.getTextContent();out.push(tc.items.map(it=>it.str).join(''));}return out;}
const wA=[]; const wB=[]; const ow=console.warn;
console.warn=(...x)=>wA.push(x); const ap = await pages(ORIGIN);
console.warn=(...x)=>wB.push(x); const bp = await pages(FINAL);
console.warn=ow;
let ok=0; for (let i=0;i<ap.length;i++) if (ap[i]===bp[i]) ok++;
console.log(`  Pages: ${ap.length} (origin) vs ${bp.length} (final)`);
console.log(`  Text-identical: ${ok}/${Math.max(ap.length,bp.length)}`);
console.log(`  pdf.js warnings: origin=${wA.length}, final=${wB.length}`);
if (ok !== ap.length) {
  for (let i=0;i<ap.length;i++) {
    if (ap[i]!==bp[i]) {
      let p=0; while(p<Math.min(ap[i].length,bp[i].length)&&ap[i][p]===bp[i][p])p++;
      console.log(`  page ${i+1}: differ at pos ${p}; A:${JSON.stringify(ap[i].slice(Math.max(0,p-20),p+40))}; B:${JSON.stringify(bp[i].slice(Math.max(0,p-20),p+40))}`);
    }
  }
}
