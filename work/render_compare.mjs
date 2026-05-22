// Render both PDFs to PNG side-by-side for visual comparison
import fs from 'fs';
import path from 'path';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

async function render(pdfPath, outPng) {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const pdf = await getDocument({ data, useSystemFonts: false, isEvalSupported: false }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, viewport.width, viewport.height);
  await page.render({ canvasContext: ctx, viewport, canvasFactory: {
    create(w, h) { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; },
    reset(o, w, h) { o.canvas.width = w; o.canvas.height = h; },
    destroy(o) { o.canvas.width = 0; o.canvas.height = 0; }
  }}).promise;
  fs.writeFileSync(outPng, canvas.toBuffer('image/png'));
  console.log('Wrote', outPng);
}

await render(path.resolve('../DUMMY.pdf'),       path.resolve('../render_original.png'));
await render(path.resolve('../DUMMY-Type1.pdf'), path.resolve('../render_type1.png'));
console.log('Done.');
