// Convert ConnectionsRegular.ttf (TrueType outlines) to a CFF-based OpenType font.
// CFF (Compact Font Format) is the modern serialization of Adobe PostScript Type 1.
// Acrobat lists CFF fonts under /FontFile3 with Subtype /Type1C as "Type 1".
import opentype from 'opentype.js';
import fs from 'fs';
import path from 'path';

const srcPath = path.resolve('../ConnectionsRegular.ttf');
const srcBuf = fs.readFileSync(srcPath);
const ttf = opentype.parse(srcBuf.buffer.slice(srcBuf.byteOffset, srcBuf.byteOffset + srcBuf.byteLength));

console.log('Source font:');
console.log('  names keys     :', Object.keys(ttf.names || {}));
console.log('  Glyphs         :', ttf.glyphs.length);
console.log('  outlinesFormat :', ttf.outlinesFormat);
console.log('  unitsPerEm     :', ttf.unitsPerEm);

// Build a CFF-flavoured OpenType font from the TrueType glyphs by re-creating a Font.
// opentype.js writes CFF (PostScript outlines) whenever you instantiate opentype.Font and call toBuffer().
const glyphList = [];
for (let i = 0; i < ttf.glyphs.length; i++) {
  const g = ttf.glyphs.get(i);
  // Convert TrueType quadratic curves to cubic Beziers expected by CFF
  const path0 = g.path;
  const newPath = new opentype.Path();
  const cmds = path0.commands;
  for (const cmd of cmds) {
    if (cmd.type === 'M') newPath.moveTo(cmd.x, cmd.y);
    else if (cmd.type === 'L') newPath.lineTo(cmd.x, cmd.y);
    else if (cmd.type === 'C') newPath.curveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
    else if (cmd.type === 'Q') newPath.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
    else if (cmd.type === 'Z') newPath.close();
  }
  const newGlyph = new opentype.Glyph({
    name: g.name || ('glyph' + i),
    unicode: g.unicode,
    unicodes: g.unicodes || [],
    advanceWidth: g.advanceWidth || ttf.unitsPerEm,
    path: newPath,
  });
  glyphList.push(newGlyph);
}

const outFont = new opentype.Font({
  familyName: 'Connections',
  styleName: 'Regular',
  unitsPerEm: ttf.unitsPerEm,
  ascender: ttf.ascender,
  descender: ttf.descender,
  glyphs: glyphList,
});

// New opentype.js API uses unicode platform under "macintosh"/"windows"
const setName = (key, value) => {
  outFont.names.macintosh = outFont.names.macintosh || {};
  outFont.names.windows = outFont.names.windows || {};
  outFont.names.macintosh[key] = { en: value };
  outFont.names.windows[key]   = { en: value };
};
setName('postScriptName', 'Connections');
setName('fullName',       'Connections Regular');
setName('fontFamily',     'Connections');
setName('fontSubfamily',  'Regular');
setName('copyright',      'Copyright (c) 2013 Parachute. Exclusively designed for the Bank of America. All rights reserved.');
setName('version',        'Version 1.003');
setName('uniqueID',       'Connections;Regular;CFF-converted-by-claude');

const outBuf = Buffer.from(outFont.toArrayBuffer());
const outPath = path.resolve('Connections-Regular.otf');
fs.writeFileSync(outPath, outBuf);
console.log(`Wrote ${outPath}  (${outBuf.length} bytes)`);

// Sanity check: re-open and confirm it has a CFF table
const re = opentype.parse(outBuf.buffer.slice(outBuf.byteOffset, outBuf.byteOffset + outBuf.byteLength));
console.log('Re-opened outlinesFormat:', re.outlinesFormat);
console.log('Re-opened glyph count   :', re.glyphs.length);
