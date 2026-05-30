// Verify C:/output/result.pdf matches the user-specified target font structure.
import fs from 'fs';

const FINAL = 'C:/output/result.pdf';
const ORIGIN = '../asset/origin.pdf';

// User-specified target structure (12 entries)
const target = [
  ['Connections',                              'Type 1', 'Custom'],
  ['ConnectionsBold_CZEX0AA0',                 'Type 1', 'Custom'],
  ['ConnectionsBold_CZEX0AA0',                 'Type 1', 'Roman'],
  ['ConnectionsIta_CZEX0AC0',                  'Type 1', 'Custom'],
  ['ConnectionsIta_CZEX0AC0',                  'Type 1', 'Roman'],
  ['Connections_CZEX0A60',                     'Type 1', 'Custom'],
  ['Connections_CZEX0A60',                     'Type 1', 'Roman'],
  ['Connections_Medium_CZEX0A80',              'Type 1', 'Custom'],
  ['Connections_Medium_CZEX0A80',              'Type 1', 'Roman'],
  ['HigherStandards_CZEX0660',                 'Type 1', 'Custom'],
  ['ITC_Franklin_Gothic_Book_CZEX0080',        'Type 1', 'Custom'],
  ['ITC_Franklin_Gothic_Book_CZEX0080',        'Type 1', 'Roman'],
];

function listFonts(path) {
  const text = fs.readFileSync(path, 'latin1');
  const re = /(\d+) 0 obj\s*<<([\s\S]*?)>>\s*endobj/g;
  const rows = new Map(); // key -> { name, type, enc }
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = m[2];
    if (!/\/Type\s*\/Font\b/.test(body)) continue;
    const sub = (body.match(/\/Subtype\s*\/(\w+)/) || [])[1] || '?';
    if (sub === 'CIDFontType2' || sub === 'CIDFontType0') continue; // descendants
    const bf = (body.match(/\/BaseFont\s*\/([\w+,.\-]+)/) || [])[1];
    if (!bf) continue;
    const noPrefix = bf.replace(/^[A-Z]{6}\+/, '');
    let type, enc;
    if (sub === 'Type0') {
      // composite CID — Acrobat shows the descendant's type and the parent's encoding
      type = 'TrueType (CID)';
      enc = (body.match(/\/Encoding\s*\/(\S+?)(?=[\s>])/) || [])[1] || '—';
    } else if (sub === 'Type1') {
      type = 'Type 1';
      if (/\/Encoding\s*\/MacRomanEncoding\b/.test(body)) enc = 'Roman';
      else if (/\/Encoding\s*\/WinAnsiEncoding\b/.test(body)) enc = 'Ansi';
      else if (/\/Encoding\s*\/StandardEncoding\b/.test(body)) enc = 'Standard';
      else if (/\/Encoding\s+\d+\s+0\s+R/.test(body)) enc = 'Custom';
      else if (/\/Encoding\s*<<[\s\S]*?\/Differences/.test(body)) enc = 'Custom';
      else enc = '—';
    } else {
      type = sub;
      enc = '—';
    }
    rows.set(`${noPrefix}|${type}|${enc}`, { name: noPrefix, type, enc });
  }
  return [...rows.values()];
}

console.log('=== ORIGIN ===');
const orig = listFonts(ORIGIN);
orig.sort((a,b)=>a.name.localeCompare(b.name) || a.enc.localeCompare(b.enc));
orig.forEach(r => console.log(`  ${r.name.padEnd(40)} ${r.type.padEnd(18)} ${r.enc}`));
console.log(`  (${orig.length} unique rows)`);

console.log('\n=== FINAL (C:/output/result.pdf) ===');
const final = listFonts(FINAL);
final.sort((a,b)=>a.name.localeCompare(b.name) || a.enc.localeCompare(b.enc));
final.forEach(r => console.log(`  ${r.name.padEnd(40)} ${r.type.padEnd(18)} ${r.enc}`));
console.log(`  (${final.length} unique rows)`);

console.log('\n=== TARGET (what user wants) ===');
const tgt = target.map(([n,t,e])=>({name:n,type:t,enc:e}));
tgt.sort((a,b)=>a.name.localeCompare(b.name) || a.enc.localeCompare(b.enc));
tgt.forEach(r => console.log(`  ${r.name.padEnd(40)} ${r.type.padEnd(18)} ${r.enc}`));
console.log(`  (${tgt.length} unique rows)`);

// Compare final vs target
console.log('\n=== MATCH CHECK ===');
const finalSet = new Set(final.map(r => `${r.name}|${r.type}|${r.enc}`));
const tgtSet   = new Set(tgt.map(r => `${r.name}|${r.type}|${r.enc}`));
const missing = [...tgtSet].filter(k => !finalSet.has(k));
const extra   = [...finalSet].filter(k => !tgtSet.has(k));
if (missing.length === 0 && extra.length === 0) {
  console.log('PASS — final matches target exactly.');
} else {
  if (missing.length) console.log('Missing in final:'); missing.forEach(k => console.log('  -', k));
  if (extra.length)   console.log('Extra in final:');   extra.forEach(k => console.log('  +', k));
}
