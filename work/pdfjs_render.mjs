import fs from 'fs';
import path from 'path';
import { createCanvas } from 'canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const pdfPath = path.resolve('../asset/BANK STATEMENT APRIL 2026 DAPOS CONv1.2-Type1.pdf');
const data = new Uint8Array(fs.readFileSync(pdfPath));
const pdf = await getDocument({ data, useSystemFonts: false, isEvalSupported: false }).promise;
const page = await pdf.getPage(3);
const viewport = page.getViewport({ scale: 2 });
const canvas = createCanvas(viewport.width, viewport.height);
const ctx = canvas.getContext('2d');
const factory = {
  create(w, h) { const c = createCanvas(w, h); return { canvas: c, context: c.getContext('2d') }; },
  reset(o, w, h) { o.canvas.width = w; o.canvas.height = h; },
  destroy(o) { o.canvas.width = 0; o.canvas.height = 0; }
};
await page.render({ canvasContext: ctx, viewport, canvasFactory: factory }).promise;
fs.writeFileSync(path.resolve('../bank_pdfjs_p3.png'), canvas.toBuffer('image/png'));
console.log('done');
