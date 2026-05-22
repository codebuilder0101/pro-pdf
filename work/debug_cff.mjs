import fs from 'fs';
const src = fs.readFileSync('Connections-Regular.cff');
console.log('size:', src.length);
// Hex dump of first 64 bytes
console.log('header:', [...src.slice(0, 16)].map(b=>b.toString(16).padStart(2,'0')).join(' '));
// Look near end
console.log('last 64:', [...src.slice(src.length-64)].map(b=>b.toString(16).padStart(2,'0')).join(' '));

// Check what's at offset 2423 (CharStrings INDEX)
console.log('\nAt 2423:', [...src.slice(2423, 2423+32)].map(b=>b.toString(16).padStart(2,'0')).join(' '));
// First two bytes are count, then offSize
const cs_count = src.readUInt16BE(2423);
const cs_offSize = src[2425];
console.log('CharStrings count:', cs_count, 'offSize:', cs_offSize);

// Compute end of CharStrings INDEX
// CharStrings INDEX has count, offSize, (count+1) offsets each offSize bytes, then data
const csOffsetsStart = 2423 + 3;
const csOffsetsEnd = csOffsetsStart + (cs_count + 1) * cs_offSize;
let lastOff = 0;
for (let i = 0; i <= cs_count; i++) {
  let v = 0;
  for (let j = 0; j < cs_offSize; j++) v = (v << 8) | src[csOffsetsStart + i*cs_offSize + j];
  if (i === cs_count) lastOff = v;
}
console.log('CharStrings data ends at:', csOffsetsEnd + lastOff - 1);
const csEnd = csOffsetsEnd + lastOff - 1;
console.log('At csEnd:', [...src.slice(csEnd, csEnd + 64)].map(b=>b.toString(16).padStart(2,'0')).join(' '));

// Try to look for Private DICT data
// Private DICT contains numbers and operators. The typical operators are:
// 19 = Subrs (local subrs offset relative to Private DICT)
// 6 = BlueValues, 7 = OtherBlues, 8 = FamilyBlues, ...
console.log('Bytes around end:');
for (let off = src.length - 200; off < src.length; off += 16) {
  console.log(off.toString().padStart(6), ':', [...src.slice(off, off+16)].map(b=>b.toString(16).padStart(2,'0')).join(' '), '|', [...src.slice(off, off+16)].map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join(''));
}
