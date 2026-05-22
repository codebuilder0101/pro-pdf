import fs from 'fs';
import * as fontkit from 'fontkit';
const ttf = fontkit.create(fs.readFileSync('../ConnectionsRegular.ttf'));
console.log('Glyph 36 (A) path:');
const g = ttf.getGlyph(36);
console.log('  advance:', g.advanceWidth);
console.log('  bbox:', g.bbox);
console.log('  path commands:', g.path?.commands?.length || 0);
if (g.path?.commands) {
  console.log('  first 5 commands:', g.path.commands.slice(0, 5));
}
