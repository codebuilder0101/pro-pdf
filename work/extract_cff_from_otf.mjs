// Extract the raw CFF table from our generated OTF
import fs from 'fs';

const buf = fs.readFileSync('Connections-Regular.otf');
// OTF/SFNT header: 4-byte tag, 2-byte numTables, 6 bytes ignored
const numTables = buf.readUInt16BE(4);
console.log('numTables:', numTables);
console.log('sfnt tag:', buf.slice(0, 4).toString('latin1'));

for (let i = 0; i < numTables; i++) {
  const off = 12 + i * 16;
  const tag = buf.slice(off, off + 4).toString('latin1');
  const checksum = buf.readUInt32BE(off + 4);
  const tabOffset = buf.readUInt32BE(off + 8);
  const tabLength = buf.readUInt32BE(off + 12);
  console.log(`  ${tag}: offset=${tabOffset}, length=${tabLength}`);
  if (tag === 'CFF ') {
    const cff = buf.slice(tabOffset, tabOffset + tabLength);
    fs.writeFileSync('Connections-Regular.cff', cff);
    console.log(`  -> wrote Connections-Regular.cff (${cff.length} bytes)`);
    // Print header bytes
    console.log('  CFF header:', [...cff.slice(0, 16)].map(b => b.toString(16).padStart(2,'0')).join(' '));
  }
}
