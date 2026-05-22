// Inspect PDF fonts using pdfjs-dist
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import fs from 'fs';
import path from 'path';

const pdfPath = path.resolve('../DUMMY.pdf');
const data = new Uint8Array(fs.readFileSync(pdfPath));

const loadingTask = getDocument({ data, useSystemFonts: false, disableFontFace: true });
const pdf = await loadingTask.promise;
console.log('Number of pages:', pdf.numPages);

for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const ops = await page.getOperatorList();
  const commonObjs = page.commonObjs;
  const objs = page.objs;
  const fontIds = new Set();
  // Find font ids referenced in the page operator list
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] === 38 /* setFont */) {
      const fontRef = ops.argsArray[i][0];
      fontIds.add(fontRef);
    }
  }
  console.log('Page', p, 'fonts referenced:', [...fontIds]);

  // Try to extract font data
  for (const fontId of fontIds) {
    try {
      const font = await new Promise((resolve, reject) => {
        commonObjs.get(fontId, (val) => resolve(val));
      });
      console.log('--- Font:', fontId);
      console.log('  loadedName:', font.loadedName);
      console.log('  name:', font.name);
      console.log('  type:', font.type);
      console.log('  subtype:', font.subtype);
      console.log('  isType3Font:', font.isType3Font);
      console.log('  bold:', font.bold);
      console.log('  italic:', font.italic);
      console.log('  fallbackName:', font.fallbackName);
      console.log('  mimetype:', font.mimetype);
      if (font.data) console.log('  dataLen:', font.data.length);
    } catch (err) {
      console.log('Error reading font', fontId, err.message);
    }
  }
}
