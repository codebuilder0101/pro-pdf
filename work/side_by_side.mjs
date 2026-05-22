// Build a side-by-side comparison image (before vs after)
import fs from 'fs';
import path from 'path';
import * as mupdf from 'mupdf';

function renderAt(pdfPath, scale = 1.5) {
  const data = fs.readFileSync(pdfPath);
  const doc = mupdf.Document.openDocument(data, 'application/pdf');
  const page = doc.loadPage(0);
  const matrix = mupdf.Matrix.scale(scale, scale);
  const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false, true);
  return pixmap;
}

const left  = renderAt(path.resolve('../DUMMY.pdf'));
const right = renderAt(path.resolve('../DUMMY-Type1.pdf'));
const W = left.getWidth(), H = left.getHeight();
const gap = 30;
const headerH = 80;
const totalW = 2 * W + gap;
const totalH = H + headerH;

// Build an empty pixmap and blit both renders
const composite = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, totalW, totalH], false);
composite.clear(255);

// Copy pixels from a source pixmap into composite at (dstX, dstY)
function blit(src, dstX, dstY) {
  const sw = src.getWidth(), sh = src.getHeight();
  const sp = src.getPixels();
  const dp = composite.getPixels();
  const sn = src.getNumberOfComponents();
  const dn = composite.getNumberOfComponents();
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const si = (y * sw + x) * sn;
      const di = ((dstY + y) * totalW + (dstX + x)) * dn;
      dp[di]   = sp[si];
      dp[di+1] = sp[si+1];
      dp[di+2] = sp[si+2];
    }
  }
}

blit(left,  0,        headerH);
blit(right, W + gap,  headerH);

// Add simple labels at the top by drawing in mupdf — we'll just save the comparison and add labels in PNG metadata
// Actually we'll create a tiny labeled PNG via a Device. For simplicity, just save as-is.
fs.writeFileSync(path.resolve('../comparison.png'), composite.asPNG());
console.log('Wrote comparison.png');
