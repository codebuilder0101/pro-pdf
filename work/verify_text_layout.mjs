// Verify the rebuilt PDF by extracting positioned text and laying it out as ASCII
import fs from 'fs';
import path from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function layoutText(pdfPath) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await getDocument({ data, useSystemFonts: false }).promise;
  const page = await pdf.getPage(1);
  const tc = await page.getTextContent();
  const items = tc.items;
  const viewport = page.getViewport({ scale: 1 });
  const H = viewport.height, W = viewport.width;
  // Bucket by Y to approximate lines
  const sorted = items
    .map(it => {
      const tx = it.transform;
      const x = tx[4];
      const y = H - tx[5];
      return { x, y, h: it.height, str: it.str, width: it.width };
    })
    .filter(it => it.str && it.str.trim())
    .sort((a, b) => a.y - b.y || a.x - b.x);
  // Print one item per line with [x,y]
  console.log(`Page: ${W}x${H}, ${sorted.length} text items`);
  for (const it of sorted) {
    console.log(`  y=${it.y.toFixed(1).padStart(6)} x=${it.x.toFixed(1).padStart(6)}  "${it.str}"`);
  }
  return sorted;
}

console.log('=== ORIGINAL DUMMY.pdf ===');
const orig = await layoutText(path.resolve('../DUMMY.pdf'));
console.log('\n\n=== REBUILT DUMMY-Type1.pdf ===');
const rebuilt = await layoutText(path.resolve('../DUMMY-Type1.pdf'));

// Diff
console.log('\n\n=== Comparison ===');
console.log(`Original items: ${orig.length}, Rebuilt items: ${rebuilt.length}`);
const origText = orig.map(i => i.str).join('|');
const rebText = rebuilt.map(i => i.str).join('|');
if (origText === rebText) {
  console.log('TEXT CONTENT IS IDENTICAL.');
} else {
  console.log('Text content differs (showing diff):');
  const o = orig.map(i => i.str);
  const r = rebuilt.map(i => i.str);
  for (let i = 0; i < Math.max(o.length, r.length); i++) {
    if (o[i] !== r[i]) {
      console.log(`  [${i}] orig="${o[i] ?? ''}" rebuilt="${r[i] ?? ''}"`);
    }
  }
}
