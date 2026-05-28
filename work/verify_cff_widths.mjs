// Read our CFF and decode the FIRST OPERAND (the width) from a few charstrings
import fs from 'fs';
const cff = fs.readFileSync('Connections-Regular-Simple.cff');

// Parse to find CharStrings INDEX offset from Top DICT
const hdrSize = cff[2];
let pos = hdrSize;

// Skip Name INDEX
const nameCount = cff.readUInt16BE(pos);
const nameOffSize = cff[pos + 2];
let lastOff = 0;
for (let i = 0; i <= nameCount; i++) {
  let v = 0;
  for (let j = 0; j < nameOffSize; j++) v = (v << 8) | cff[pos + 3 + i * nameOffSize + j];
  lastOff = v;
}
pos = pos + 3 + nameOffSize * (nameCount + 1) + (lastOff - 1);

// Top DICT INDEX
const tdCount = cff.readUInt16BE(pos);
const tdOffSize = cff[pos + 2];
const tdStart = pos + 3 + tdOffSize * (tdCount + 1);
let tdEnd = 0;
for (let i = 1; i <= tdCount; i++) {
  let v = 0;
  for (let j = 0; j < tdOffSize; j++) v = (v << 8) | cff[pos + 3 + i * tdOffSize + j];
  if (i === tdCount) tdEnd = v - 1;
}
const topDict = cff.slice(tdStart, tdStart + tdEnd);

// Parse Top DICT to find CharStrings offset (op 17)
function readNum(buf, pos) {
  const b0 = buf[pos];
  if (b0 >= 32 && b0 <= 246) return { val: b0 - 139, next: pos + 1 };
  if (b0 >= 247 && b0 <= 250) return { val: (b0 - 247) * 256 + buf[pos + 1] + 108, next: pos + 2 };
  if (b0 >= 251 && b0 <= 254) return { val: -(b0 - 251) * 256 - buf[pos + 1] - 108, next: pos + 2 };
  if (b0 === 28) { const v = (buf[pos+1] << 8) | buf[pos+2]; return { val: v < 32768 ? v : v - 65536, next: pos + 3 }; }
  if (b0 === 29) { return { val: buf.readInt32BE(pos + 1), next: pos + 5 }; }
  return null;
}
let stack = [];
let charStringsOff = null;
let p = 0;
while (p < topDict.length) {
  const b = topDict[p];
  if (b <= 21) {
    let op = b;
    if (b === 12) { op = (12 << 8) | topDict[p + 1]; p += 2; } else p++;
    if (op === 17) charStringsOff = stack[0];
    stack = [];
  } else {
    const n = readNum(topDict, p);
    if (!n) throw new Error('Bad number');
    stack.push(n.val);
    p = n.next;
  }
}
console.log('CharStrings offset:', charStringsOff);

// Read CharStrings INDEX
pos = charStringsOff;
const csCount = cff.readUInt16BE(pos);
const csOffSize = cff[pos + 2];
console.log('CharStrings count:', csCount);

// Decode first operand (width) of charstrings for GIDs 3, 19, 36, 68
const offsetsStart = pos + 3;
function getOffset(idx) {
  let v = 0;
  for (let j = 0; j < csOffSize; j++) v = (v << 8) | cff[offsetsStart + idx * csOffSize + j];
  return v;
}
const dataStart = offsetsStart + csOffSize * (csCount + 1);
function decodeFirstNumber(gid) {
  const off1 = getOffset(gid) - 1;
  const off2 = getOffset(gid + 1) - 1;
  const cs = cff.slice(dataStart + off1, dataStart + off2);
  const n = readNum(cs, 0);
  return { width: n ? n.val : null, charstringLen: cs.length };
}
for (const gid of [0, 1, 2, 3, 19, 32, 36, 68, 107, 122]) {
  const d = decodeFirstNumber(gid);
  console.log(`  GID ${gid}: charstring width = ${d.width}, charstring length = ${d.charstringLen}`);
}
