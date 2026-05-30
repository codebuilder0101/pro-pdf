// Feasibility test: can I extract glyph outlines + names from an embedded _CZEX CFF?
// I wrap the bare CFF into a minimal OTF sfnt and read it with fontkit.
import fs from 'fs';
import zlib from 'zlib';
import * as fontkit from 'fontkit';

const text = fs.readFileSync('normalized.pdf', 'latin1');
const buf = fs.readFileSync('normalized.pdf');

// Find a ConnectionsBold_CZEX FontFile3 (Type1C). Locate a FontDescriptor for it.
function getStreamBytes(objNum) {
  const re = new RegExp('\\b' + objNum + ' 0 obj','');
  const m = text.match(re);
  if (!m) return null;
  const sIdx = text.indexOf('stream', m.index);
  const dict = text.slice(m.index, sIdx);
  const lm = dict.match(/\/Length\s+(\d+)/);
  let s = sIdx + 'stream'.length;
  if (buf[s] === 0x0d) s++; if (buf[s] === 0x0a) s++;
  const data = buf.slice(s, s + parseInt(lm[1]));
  return /\/Filter\s*\/FlateDecode/.test(dict) ? zlib.inflateSync(data) : data;
}

// Find first FontDescriptor with ConnectionsBold and FontFile3
const re = /(\d+) 0 obj\s*<<([\s\S]*?)>>\s*endobj/g;
let m, ff3 = null, fname=null;
while ((m = re.exec(text)) !== null) {
  if (/\/Type\s*\/FontDescriptor/.test(m[2]) && /ConnectionsBold_CZEX0AA0/.test(m[2])) {
    const f = m[2].match(/\/FontFile3\s+(\d+)/);
    if (f) { ff3 = parseInt(f[1]); fname = (m[2].match(/\/FontName\s*\/([\w+,.\-]+)/)||[])[1]; break; }
  }
}
console.log('ConnectionsBold FontFile3 obj:', ff3, 'FontName:', fname);
const cff = getStreamBytes(ff3);
console.log('CFF length:', cff.length, 'magic:', [...cff.slice(0,4)].map(b=>b.toString(16)).join(' '));

// --- Wrap CFF into a minimal OTF so fontkit can parse it ---
// Need: count glyphs from CFF CharStrings. Quick parse.
function u8(b,p){return b[p];}
function u16(b,p){return (b[p]<<8)|b[p+1];}
function readIndexCount(b,p){return u16(b,p);}
// Parse header
const hdrSize=cff[2], offSize0=cff[3];
let p=hdrSize;
function skipIndex(pp){
  const count=u16(cff,pp); if(count===0)return pp+2;
  const os=cff[pp+2]; const base=pp+3+os*(count+1);
  // last offset
  let last=0; for(let j=0;j<os;j++) last=(last<<8)|cff[pp+3+count*os+j];
  return base+last-1;
}
let q=p;
q=skipIndex(q); // Name INDEX
const topStart=q;
// Top DICT INDEX -> need CharStrings offset (op 17)
const tdCount=u16(cff,q); const tdOS=cff[q+2];
const tdDataBase=q+3+tdOS*(tdCount+1);
let tdLast=0; for(let j=0;j<tdOS;j++) tdLast=(tdLast<<8)|cff[q+3+tdCount*tdOS+j];
const topDict=cff.slice(tdDataBase, tdDataBase+tdLast-1);
// parse top dict operands for op 17
function parseDictForOp(dd, targetOp){
  let stack=[],i=0;
  while(i<dd.length){
    const b=dd[i];
    if(b<=21){let op=b;if(b===12){op=1200+dd[i+1];i+=2;}else i++; if(op===targetOp)return stack.slice(); stack=[];}
    else if(b===28){stack.push((dd[i+1]<<8)|dd[i+2]);i+=3;}
    else if(b===29){stack.push((dd[i+1]<<24)|(dd[i+2]<<16)|(dd[i+3]<<8)|dd[i+4]);i+=5;}
    else if(b>=32&&b<=246){stack.push(b-139);i++;}
    else if(b>=247&&b<=250){stack.push((b-247)*256+dd[i+1]+108);i+=2;}
    else if(b>=251&&b<=254){stack.push(-(b-251)*256-dd[i+1]-108);i+=2;}
    else if(b===30){i++;while(i<dd.length){const n=dd[i++];if((n&0x0f)===0x0f||(n>>4)===0x0f)break;}stack.push(0);}
    else i++;
  }
  return null;
}
const csOff=parseDictForOp(topDict,17)[0];
const nGlyphs=u16(cff,csOff);
console.log('Glyphs in CharStrings INDEX:', nGlyphs);

console.log(nGlyphs>0 ? 'FEASIBLE: can parse embedded CFF glyph count.' : 'cannot parse');
