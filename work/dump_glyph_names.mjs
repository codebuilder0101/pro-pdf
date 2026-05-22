// Dump glyph names from our generated CFF
import * as fontkit from 'fontkit';
import fs from 'fs';
import opentype from 'opentype.js';

const otfBuf = fs.readFileSync('Connections-Regular.otf');
const font = fontkit.create(otfBuf);
console.log('numGlyphs:', font.numGlyphs);

const usedGids = [3,6,7,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,36,37,38,39,40,42,44,47,51,54,55,68,69,70,71,72,73,74,75,76,78,79,80,81,82,83,85,86,87,88,89,90,92,122];
console.log('\nGlyph names of used GIDs:');
for (const gid of usedGids) {
  const g = font.getGlyph(gid);
  console.log(`  GID ${gid} (0x${gid.toString(16).padStart(2,'0')}): name="${g.name}", advance=${g.advanceWidth}, cps=${JSON.stringify(g.codePoints)}`);
}

// Compare with source TTF post-table names
const ttfBuf = fs.readFileSync('../ConnectionsRegular.ttf');
const ttf = fontkit.create(ttfBuf);
console.log('\nSame GIDs in original TTF:');
for (const gid of usedGids) {
  const g = ttf.getGlyph(gid);
  console.log(`  GID ${gid}: name="${g.name}", advance=${g.advanceWidth}, cps=${JSON.stringify(g.codePoints)}`);
}
