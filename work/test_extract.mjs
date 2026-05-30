import fs from 'fs';
import zlib from 'zlib';
import * as fontkit from 'fontkit';
import { wrapCFFtoOTF } from './cff_to_otf.mjs';

const text = fs.readFileSync('normalized.pdf', 'latin1');
const buf = fs.readFileSync('normalized.pdf');
function getStreamBytes(objNum) {
  const m = text.match(new RegExp('(?:^|[^0-9])'+objNum+' 0 obj'));
  const sIdx = text.indexOf('stream', m.index);
  const dict = text.slice(m.index, sIdx);
  const lm = dict.match(/\/Length\s+(\d+)/);
  let s = sIdx + 'stream'.length;
  if (buf[s]===0x0d)s++; if(buf[s]===0x0a)s++;
  const data = buf.slice(s, s+parseInt(lm[1]));
  return /\/Filter\s*\/FlateDecode/.test(dict)?zlib.inflateSync(data):data;
}
const cff = getStreamBytes(127); // ConnectionsBold Custom CFF
// parse numGlyphs (from earlier=60)
const otf = wrapCFFtoOTF(cff, 60, 1000);
fs.writeFileSync('test_wrap.otf', otf);
const font = fontkit.create(otf);
console.log('Parsed OK. numGlyphs:', font.numGlyphs);
let withPath=0;
for (let i=0;i<font.numGlyphs;i++){
  const g=font.getGlyph(i);
  const cmds=g.path&&g.path.commands?g.path.commands.length:0;
  if(cmds>0)withPath++;
  if(i<6) console.log(`  GID ${i}: name=${g.name} adv=${g.advanceWidth} pathCmds=${cmds}`);
}
console.log('Glyphs with outlines:', withPath, '/', font.numGlyphs);
console.log(withPath>0 ? 'SUCCESS: can extract outlines from embedded CFF.' : 'FAIL');
