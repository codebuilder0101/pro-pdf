// Identify the TTF that matches the embedded TrueType inside the PDF
import fs from 'fs';
import path from 'path';
import * as fontkit from 'fontkit';

function inspect(label, filePath) {
  const buf = fs.readFileSync(filePath);
  console.log(`\n=== ${label} (${filePath}, ${buf.length} bytes) ===`);
  let font;
  try {
    font = fontkit.create(buf);
  } catch (e) {
    console.log('fontkit error:', e.message);
    return null;
  }
  console.log('  PostScript name :', font.postscriptName);
  console.log('  Family name     :', font.familyName);
  console.log('  Subfamily       :', font.subfamilyName);
  console.log('  Full name       :', font.fullName);
  console.log('  Copyright       :', font.copyright);
  console.log('  Version         :', font.version);
  console.log('  numGlyphs       :', font.numGlyphs);
  console.log('  unitsPerEm      :', font.unitsPerEm);
  console.log('  ascent/descent  :', font.ascent, font.descent);
  console.log('  bbox            :', JSON.stringify(font.bbox));
  try { console.log('  italicAngle     :', font.italicAngle); } catch(e) { console.log('  italicAngle     : (n/a)'); }
  try { console.log('  capHeight       :', font.capHeight); } catch(e) {}
  try { console.log('  xHeight         :', font.xHeight); } catch(e) {}
  // Try to dump some characteristic glyph metrics
  const samples = ['A','a','C','o','n','e','c','t','i','s','M'];
  const widths = {};
  for (const ch of samples) {
    try {
      const glyph = font.glyphForCodePoint(ch.charCodeAt(0));
      widths[ch] = glyph && glyph.advanceWidth;
    } catch (_) {}
  }
  console.log('  char advances   :', JSON.stringify(widths));
  return font;
}

inspect('Embedded TTF in PDF (obj48)', path.resolve('extracted/extracted_obj48_raw.bin'));
inspect('ConnectionsRegular.ttf', path.resolve('../ConnectionsRegular.ttf'));
inspect('Connections_Medium.ttf', path.resolve('../Connections_Medium.ttf'));
inspect('ConnectionsBold.ttf', path.resolve('../ConnectionsBold.ttf'));
