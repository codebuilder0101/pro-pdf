import fs from 'fs';
const pfb = fs.readFileSync('../Connections-Regular.pfb');
console.log('Size:', pfb.length);
let p = 0, blockNum = 1;
while (p < pfb.length) {
  if (pfb[p] !== 0x80) { console.log('bad marker at', p); break; }
  const type = pfb[p+1];
  if (type === 3) { console.log(`Block ${blockNum}: EOF marker`); break; }
  const len = pfb.readUInt32LE(p+2);
  console.log(`Block ${blockNum}: type=${type}, length=${len}`);
  // Print first 80 bytes of block as text (for type 1 ASCII blocks)
  if (type === 1) {
    console.log('  preview:', pfb.slice(p+6, p+6+Math.min(120,len)).toString('latin1').replace(/\n/g,' / '));
  } else {
    const slice = pfb.slice(p+6, p+6+8);
    console.log('  binary head:', [...slice].map(b=>b.toString(16).padStart(2,'0')).join(' '));
  }
  p += 6 + len;
  blockNum++;
}
