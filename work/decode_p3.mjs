import fs from 'fs';
import * as fontkit from 'fontkit';
const ttf = fontkit.create(fs.readFileSync('../ConnectionsRegular.ttf'));
const name = {};
for (let g = 0; g < ttf.numGlyphs; g++) name[g] = ttf.getGlyph(g).name || ('g'+g);
// Map glyph name to a char for readability
function gidToChar(gid) {
  const n = name[gid];
  const map = {space:' ',zero:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',slash:'/',period:'.',comma:',',colon:':',hyphen:'-',percent:'%'};
  if (map[n]) return map[n];
  if (n && n.length === 1) return n;
  return '{'+n+'}';
}

const c = fs.readFileSync('converted_p3.txt', 'latin1');
// Find all BT...ET blocks, decode hex Tj strings, track Tm/Td
const blocks = c.split(/(?<=ET)/);
let blockNo = 0;
for (const b of blocks) {
  if (!b.includes('Tj') && !b.includes('TJ')) continue;
  // Get position (first Tm or Td)
  const tm = b.match(/([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s+([\-\d.]+)\s+Tm/);
  const td = b.match(/([\-\d.]+)\s+([\-\d.]+)\s+Td/);
  const tf = b.match(/\/([A-Za-z][\w]*)\s+([\d.]+)\s+Tf/);
  // Decode all hex Tj
  const hexes = [...b.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)];
  if (hexes.length === 0) continue;
  let decoded = '';
  for (const h of hexes) {
    const hex = h[1];
    for (let i = 0; i + 2 <= hex.length; i += 2) {
      const gid = parseInt(hex.substr(i,2),16);
      decoded += gidToChar(gid);
    }
    decoded += '|';
  }
  // Only show blocks that look like dates or descriptions
  if (/0|1|2|3|4|5|6|7|8|9/.test(decoded) && blockNo < 25) {
    const pos = tm ? `Tm(${tm[5]},${tm[6]})` : (td ? `Td(${td[1]},${td[2]})` : '?');
    console.log(`[${tf?tf[1]:'?'} ${pos}] nTj=${hexes.length}: ${decoded.slice(0,70)}`);
    blockNo++;
  }
}
