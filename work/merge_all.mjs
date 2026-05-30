// Merge every duplicated embedded font family into ONE font so each appears once in Acrobat.
// Strategy: for each family, collect all member font objects; for each glyph used (keyed by
// Unicode) collect one outline; build a single merged CFF + /Differences; re-encode every
// text run that used any member. Also convert the Type0 Connections font to one simple Type1.
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as fontkit from 'fontkit';
import { buildCFF } from './buildcff.mjs';
import { wrapCFFtoOTF } from './cff_to_otf.mjs';

const SRC = 'normalized.pdf';
const DST = path.resolve('../asset/bank document.pdf');
const text = fs.readFileSync(SRC, 'latin1');
const buf  = fs.readFileSync(SRC);

// ---------- object parser ----------
class O { constructor(num,gen,dict,sStart,sLen){this.num=num;this.gen=gen;this.dictText=dict;this.sStart=sStart;this.sLen=sLen;}
  isStream(){return this.sStart!=null;}
  stream(){ if(this.sStart==null)return null; let d=buf.slice(this.sStart,this.sStart+this.sLen);
    if(/\/Filter\s*\/FlateDecode/.test(this.dictText)){try{d=zlib.inflateSync(d);}catch{}} return d; } }
const objs=new Map();
{ const re=/(\d+) (\d+) obj\b/g; let m;
  while((m=re.exec(text))!==null){const num=+m[1],gen=+m[2];const bs=m.index+m[0].length;const end=text.indexOf('endobj',bs);if(end<0)continue;
    const si=text.indexOf('stream',bs);let dict,sS=null,sL=0;
    if(si>=0&&si<end){dict=text.slice(bs,si);const lm=dict.match(/\/Length\s+(\d+)/);if(lm){let s=si+6;if(buf[s]===0x0d)s++;if(buf[s]===0x0a)s++;sS=s;sL=+lm[1];}}
    else dict=text.slice(bs,end);
    objs.set(num,new O(num,gen,dict,sS,sL));}}
console.log('objects:',objs.size);

// ---------- name -> unicode ----------
const MACROMAN=[]; // byte->glyphname (Adobe MacRomanEncoding); fill ASCII + needed
// ASCII 32..126 standard names
const ASCII={32:'space',33:'exclam',34:'quotedbl',35:'numbersign',36:'dollar',37:'percent',38:'ampersand',39:'quotesingle',40:'parenleft',41:'parenright',42:'asterisk',43:'plus',44:'comma',45:'hyphen',46:'period',47:'slash',48:'zero',49:'one',50:'two',51:'three',52:'four',53:'five',54:'six',55:'seven',56:'eight',57:'nine',58:'colon',59:'semicolon',60:'less',61:'equal',62:'greater',63:'question',64:'at',91:'bracketleft',92:'backslash',93:'bracketright',94:'asciicircum',95:'underscore',96:'grave',123:'braceleft',124:'bar',125:'braceright',126:'asciitilde'};
for(let i=0;i<256;i++){let nm='.notdef';
  if(ASCII[i])nm=ASCII[i];
  else if(i>=65&&i<=90)nm=String.fromCharCode(i);
  else if(i>=97&&i<=122)nm=String.fromCharCode(i);
  MACROMAN[i]=nm;}
// MacRoman high range common (enough for these docs): map a few; default keep .notdef
const NAME2UNI={space:0x20,exclam:0x21,quotedbl:0x22,numbersign:0x23,dollar:0x24,percent:0x25,ampersand:0x26,quotesingle:0x27,quoteright:0x2019,parenleft:0x28,parenright:0x29,asterisk:0x2a,plus:0x2b,comma:0x2c,hyphen:0x2d,period:0x2e,slash:0x2f,colon:0x3a,semicolon:0x3b,less:0x3c,equal:0x3d,greater:0x3e,question:0x3f,at:0x40,bracketleft:0x5b,backslash:0x5c,bracketright:0x5d,asciicircum:0x5e,underscore:0x5f,grave:0x60,braceleft:0x7b,bar:0x7c,braceright:0x7d,asciitilde:0x7e,quoteleft:0x2018,bullet:0x2022,endash:0x2013,emdash:0x2014,registered:0xae,copyright:0xa9,trademark:0x2122,degree:0xb0,cent:0xa2,sterling:0xa3,section:0xa7,paragraph:0xb6,germandbls:0xdf,periodcentered:0xb7,quotesinglbase:0x201a,quotedblbase:0x201e,quotedblleft:0x201c,quotedblright:0x201d,guillemotleft:0xab,guillemotright:0xbb,ellipsis:0x2026,onesuperior:0xb9,twosuperior:0xb2,threesuperior:0xb3,ordfeminine:0xaa,ordmasculine:0xba,onehalf:0xbd,dieresis:0xa8,acute:0xb4,cedilla:0xb8,macron:0xaf};
for(let i=0;i<=9;i++)NAME2UNI[['zero','one','two','three','four','five','six','seven','eight','nine'][i]]=0x30+i;
for(let i=65;i<=90;i++)NAME2UNI[String.fromCharCode(i)]=i;
for(let i=97;i<=122;i++)NAME2UNI[String.fromCharCode(i)]=i;
function nameToUni(nm){ if(nm==null)return null;
  let m=nm.match(/^uni([0-9A-Fa-f]{4})$/); if(m)return parseInt(m[1],16);
  m=nm.match(/^u([0-9A-Fa-f]{4,6})$/); if(m)return parseInt(m[1],16);
  if(NAME2UNI[nm]!=null)return NAME2UNI[nm];
  return null;}

// ---------- helpers ----------
function dictVal(dictText,key){ // returns referenced obj number for /Key N 0 R, or null
  const m=dictText.match(new RegExp('\\/'+key+'\\s+(\\d+)\\s+\\d+\\s+R')); return m?+m[1]:null; }
function getEncodingMap(fontDictText){ // byte-> glyphname
  const map={};
  // /Encoding may be /MacRomanEncoding, /WinAnsiEncoding, or dict with /Differences
  const encRef=dictVal(fontDictText,'Encoding');
  let encText=null, base=null;
  if(encRef){ encText=objs.get(encRef)?.dictText||''; }
  else { const inl=fontDictText.match(/\/Encoding\s*<<([\s\S]*?)>>/); if(inl)encText=inl[1];
         const nm=fontDictText.match(/\/Encoding\s*\/(\w+)/); if(nm)base=nm[1]; }
  if(encText){ const bm=encText.match(/\/BaseEncoding\s*\/(\w+)/); if(bm)base=bm[1]; }
  // start from base
  if(base==='MacRomanEncoding'||base==='WinAnsiEncoding'||base==null){ for(let i=0;i<256;i++)if(MACROMAN[i]!=='.notdef')map[i]=MACROMAN[i]; }
  // apply Differences
  if(encText){ const dm=encText.match(/\/Differences\s*\[([\s\S]*?)\]/); if(dm){ let cur=0; const toks=dm[1].match(/\d+|\/[^\s\/\]]+/g)||[];
    for(const t of toks){ if(t[0]==='/')map[cur++]=t.slice(1); else cur=+t; } } }
  return map;
}
function getToUnicode(fontDictText){ // byte-> unicode (from object's ToUnicode CMap)
  const tu=dictVal(fontDictText,'ToUnicode'); if(!tu)return {};
  const o=objs.get(tu); if(!o||!o.isStream())return {};
  const c=o.stream().toString('latin1'); const map={};
  // bfchar
  const bc=c.match(/beginbfchar([\s\S]*?)endbfchar/g)||[];
  for(const blk of bc){ const re=/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g; let m; while((m=re.exec(blk))){ const code=parseInt(m[1],16); const uni=parseInt(m[2].slice(0,4),16); map[code]=uni; } }
  const br=c.match(/beginbfrange([\s\S]*?)endbfrange/g)||[];
  for(const blk of br){ const re=/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g; let m; while((m=re.exec(blk))){ const lo=parseInt(m[1],16),hi=parseInt(m[2],16),u=parseInt(m[3].slice(0,4),16); for(let cc=lo;cc<=hi;cc++)map[cc]=u+(cc-lo); } }
  return map;
}
// CFF Standard Strings (first 391 SIDs) — needed to resolve charset SID -> glyph name.
const STD_STRINGS=".notdef space exclam quotedbl numbersign dollar percent ampersand quoteright parenleft parenright asterisk plus comma hyphen period slash zero one two three four five six seven eight nine colon semicolon less equal greater question at A B C D E F G H I J K L M N O P Q R S T U V W X Y Z bracketleft backslash bracketright asciicircum underscore quoteleft a b c d e f g h i j k l m n o p q r s t u v w x y z braceleft bar braceright asciitilde exclamdown cent sterling fraction yen florin section currency quotesingle quotedblleft guillemotleft guilsinglleft guilsinglright fi fl endash dagger daggerdbl periodcentered paragraph bullet quotesinglbase quotedblbase quotedblright guillemotright ellipsis perthousand questiondown grave acute circumflex tilde macron breve dotaccent dieresis ring cedilla hungarumlaut ogonek caron emdash AE ordfeminine Lslash Oslash OE ordmasculine ae dotlessi lslash oslash oe germandbls onesuperior logicalnot mu trademark Eth onehalf plusminus Thorn onequarter divide brokenbar degree thorn threequarters twosuperior registered minus eth multiply threesuperior copyright Aacute Acircumflex Adieresis Agrave Aring Atilde Ccedilla Eacute Ecircumflex Edieresis Egrave Iacute Icircumflex Idieresis Igrave Ntilde Oacute Ocircumflex Odieresis Ograve Otilde Scaron Uacute Ucircumflex Udieresis Ugrave Yacute Ydieresis Zcaron aacute acircumflex adieresis agrave aring atilde ccedilla eacute ecircumflex edieresis egrave iacute icircumflex idieresis igrave ntilde oacute ocircumflex odieresis ograve otilde scaron uacute ucircumflex udieresis ugrave yacute ydieresis zcaron".split(' ');

// fontkit font + ACCURATE name->GID read straight from the CFF charset (not fontkit's
// possibly-renamed glyph names), so PDF /Differences names resolve exactly.
const fkCache=new Map();
function fontFromFontFile3(fdNum){
  const fd=objs.get(fdNum); if(!fd)return null;
  const ff3=dictVal(fd.dictText,'FontFile3'); if(!ff3)return null;
  if(fkCache.has(ff3))return fkCache.get(ff3);
  const cff=objs.get(ff3)?.stream(); if(!cff)return null;
  const u16=(b,q)=>(b[q]<<8)|b[q+1];
  function indexEnd(pp){const c=u16(cff,pp);if(c===0)return pp+2;const os=cff[pp+2];let last=0;for(let j=0;j<os;j++)last=(last<<8)|cff[pp+3+c*os+j];return pp+3+os*(c+1)+last-1;}
  // String INDEX entries (for SID >= 391)
  function indexEntries(pp){const c=u16(cff,pp);if(c===0)return {entries:[],end:pp+2};const os=cff[pp+2];const offs=[];for(let i=0;i<=c;i++){let v=0;for(let j=0;j<os;j++)v=(v<<8)|cff[pp+3+i*os+j];offs.push(v);}const base=pp+3+os*(c+1)-1;const entries=[];for(let i=0;i<c;i++)entries.push(cff.slice(base+offs[i],base+offs[i+1]).toString('latin1'));return {entries,end:base+offs[c]};}
  const hdr=cff[2];
  const nameEnd=indexEnd(hdr);
  // Top DICT INDEX
  const tdc=u16(cff,nameEnd),tos=cff[nameEnd+2];const tdb=nameEnd+3+tos*(tdc+1);let tl=0;for(let j=0;j<tos;j++)tl=(tl<<8)|cff[nameEnd+3+tdc*tos+j];const top=cff.slice(tdb,tdb+tl-1);
  const topEnd=indexEnd(nameEnd);
  // String INDEX follows Top DICT INDEX
  const strInfo=indexEntries(topEnd);
  // parse top dict for CharStrings(17) and charset(15)
  let stack=[],i=0,csOff=0,charsetOff=0;
  while(i<top.length){const b=top[i];if(b<=21){let op=b;if(b===12){op=1200+top[i+1];i+=2;}else i++;if(op===17)csOff=stack[0];if(op===15)charsetOff=stack[0];stack=[];}else if(b===28){stack.push((top[i+1]<<8)|top[i+2]);i+=3;}else if(b===29){stack.push((top[i+1]<<24)|(top[i+2]<<16)|(top[i+3]<<8)|top[i+4]);i+=5;}else if(b>=32&&b<=246){stack.push(b-139);i++;}else if(b>=247&&b<=250){stack.push((b-247)*256+top[i+1]+108);i+=2;}else if(b>=251&&b<=254){stack.push(-(b-251)*256-top[i+1]-108);i+=2;}else if(b===30){i++;while(i<top.length){const n=top[i++];if((n&0xf)===0xf||(n>>4)===0xf)break;}stack.push(0);}else i++;}
  const ng=u16(cff,csOff);
  const sidName=sid=> sid<391?STD_STRINGS[sid]:(strInfo.entries[sid-391]||('sid'+sid));
  // charset: GID0=.notdef. If charsetOff is 0/1/2 it's a predefined charset.
  const nameToGid={}; const gidName=new Array(ng);
  gidName[0]='.notdef';
  if(charsetOff>2){ const fmt=cff[charsetOff]; let p=charsetOff+1; let gid=1;
    if(fmt===0){ while(gid<ng){const sid=u16(cff,p);p+=2;gidName[gid]=sidName(sid);gid++;} }
    else if(fmt===1){ while(gid<ng){const sid=u16(cff,p);p+=2;const n=cff[p];p++;for(let k=0;k<=n&&gid<ng;k++){gidName[gid]=sidName(sid+k);gid++;}} }
    else if(fmt===2){ while(gid<ng){const sid=u16(cff,p);p+=2;const n=u16(cff,p);p+=2;for(let k=0;k<=n&&gid<ng;k++){gidName[gid]=sidName(sid+k);gid++;}} }
  } else { // predefined (ISOAdobe etc.) — fall back to fontkit names
    for(let g=1;g<ng;g++)gidName[g]='sid'+g;
  }
  for(let g=0;g<ng;g++){if(gidName[g])nameToGid[gidName[g]]=g;}
  const otf=wrapCFFtoOTF(cff,ng,1000);
  const font=fontkit.create(otf);
  const res={font,nameToGid,gidName}; fkCache.set(ff3,res); return res;
}

// ---------- classify fonts ----------
// Simple Type1 embedded families (group by stripped BaseFont) + Type0 Connections.
const families=new Map(); // famName -> {members:[{num,enc,tu,fdNum,ff3}], }
const type0Conn=[]; // {num, toUniObj}
for(const [num,o] of objs){
  if(!/\/Type\s*\/Font\b/.test(o.dictText))continue;
  const sub=(o.dictText.match(/\/Subtype\s*\/(\w+)/)||[])[1];
  const bfRaw=(o.dictText.match(/\/BaseFont\s*\/([\w+,\.\-]+)/)||[])[1]||'';
  const bf=bfRaw.replace(/^[A-Z]{6}\+/,'');
  if(sub==='Type0'){ if(/^Connections$/.test(bf)){ type0Conn.push({num, dictText:o.dictText}); } continue; }
  if(sub==='CIDFontType0'||sub==='CIDFontType2')continue;
  if(sub!=='Type1'&&sub!=='TrueType'&&sub!=='MMType1')continue;
  // Only merge EMBEDDED fonts (skip Helvetica/ZapfDingbats with no descriptor)
  const fdNum=dictVal(o.dictText,'FontDescriptor'); if(!fdNum)continue;
  const fd=objs.get(fdNum); if(!fd||!/\/FontFile3/.test(fd.dictText))continue;
  if(!families.has(bf))families.set(bf,{members:[]});
  families.get(bf).members.push({num, fdNum, dictText:o.dictText});
}
console.log('Embedded simple families:',[...families.keys()].join(', '));
console.log('Type0 Connections objs:',type0Conn.length);

// ---------- build merged font per simple family ----------
let nextObj=Math.max(...objs.keys())+1;
const objRemap=new Map();   // origFontObjNum -> { mergedObj, remap:Uint16-ish map byte->newbyte, twoByte:false }
const newObjects=new Map(); // objNum -> {dict, stream?}
const droppedObjs=new Set();

for(const [fam,info] of families){
  // gather glyphs keyed by GLYPH NAME (accurately resolved from each member's CFF charset)
  const glyphByName=new Map(); // name -> {path,adv}
  const nameUni=new Map();     // name -> representative unicode (for merged ToUnicode)
  const memberEnc=new Map();   // member.num -> {byte-> name}
  let unresolved=0;
  for(const mem of info.members){
    const enc=getEncodingMap(mem.dictText);
    const tu=getToUnicode(mem.dictText);
    const fk=fontFromFontFile3(mem.fdNum);
    const byteToName={};
    if(fk){ for(const b in enc){ const nm=enc[b];
      let gid=fk.nameToGid[nm];
      if(gid==null){ const u=nameToUni(nm); if(u!=null){const h=u.toString(16).padStart(4,'0');gid=fk.nameToGid['uni'+h.toUpperCase()]??fk.nameToGid['uni'+h];} }
      if(gid==null){ unresolved++; continue; }
      const g=fk.font.getGlyph(gid);
      if(!glyphByName.has(nm)) glyphByName.set(nm,{path:g.path,adv:g.advanceWidth});
      if(!nameUni.has(nm)){ const u=(tu[b]!=null?tu[b]:nameToUni(nm)); if(u!=null)nameUni.set(nm,u); }
      byteToName[b]=nm;
    } }
    memberEnc.set(mem.num,byteToName);
    droppedObjs.add(mem.num); droppedObjs.add(mem.fdNum);
    const ff3=dictVal(objs.get(mem.fdNum).dictText,'FontFile3'); if(ff3)droppedObjs.add(ff3);
    const tuN=dictVal(mem.dictText,'ToUnicode'); if(tuN)droppedObjs.add(tuN);
  }
  if(unresolved) console.warn('  ['+fam+'] unresolved byte->glyph:',unresolved);
  // assign codes by name
  const names=[...glyphByName.keys()];
  if(names.length>255){ console.warn('FAMILY '+fam+' has '+names.length+' glyphs >255 — skipping merge');
    for(const mem of info.members){droppedObjs.delete(mem.num);droppedObjs.delete(mem.fdNum);} continue; }
  const glyphList=[{name:'.notdef',advanceWidth:0,path:{commands:[]}}];
  const nameToCode=new Map();
  names.forEach((nm,idx)=>{ const code=idx+1; nameToCode.set(nm,code); const gi=glyphByName.get(nm); glyphList.push({name:nm,advanceWidth:gi.adv,path:gi.path}); });
  const cff=buildCFF(glyphList, fam.replace(/[^A-Za-z0-9]/g,''));
  const cffZ=zlib.deflateSync(cff);
  const ffObj=nextObj++, fdObj=nextObj++, tuObj=nextObj++, fontObj=nextObj++;
  // Differences + Widths
  const diff=['0','/.notdef']; const widths=[0];
  for(let c=1;c<glyphList.length;c++){ diff.push('/'+glyphList[c].name); widths.push(Math.round(glyphList[c].advanceWidth||0)); }
  // ToUnicode
  const bf2=[...nameToCode.entries()].filter(([nm])=>nameUni.has(nm)).map(([nm,c])=>`<${c.toString(16).padStart(2,'0')}> <${nameUni.get(nm).toString(16).padStart(4,'0')}>`);
  const tuCMap=`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00><FF>\nendcodespacerange\n${bf2.length} beginbfchar\n${bf2.join('\n')}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
  newObjects.set(ffObj,{dict:`<< /Subtype /Type1C /Filter /FlateDecode /Length ${cffZ.length} >>`,stream:cffZ});
  newObjects.set(fdObj,{dict:`<<\n/Type /FontDescriptor\n/FontName /${fam}\n/Flags 4\n/FontBBox [ -200 -300 1100 1000 ]\n/ItalicAngle 0\n/Ascent 800\n/Descent -200\n/CapHeight 700\n/StemV 80\n/MissingWidth 0\n/FontFile3 ${ffObj} 0 R\n>>`});
  newObjects.set(tuObj,{dict:`<< /Length ${Buffer.byteLength(tuCMap,'latin1')} >>`,stream:Buffer.from(tuCMap,'latin1')});
  newObjects.set(fontObj,{dict:`<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /${fam}\n/FirstChar 0\n/LastChar ${glyphList.length-1}\n/Widths [ ${widths.join(' ')} ]\n/FontDescriptor ${fdObj} 0 R\n/Encoding << /Type /Encoding /Differences [ ${diff.join(' ')} ] >>\n/ToUnicode ${tuObj} 0 R\n>>`});
  // per-member remap byte->newbyte (via glyph name)
  for(const mem of info.members){ const b2n=memberEnc.get(mem.num); const remap={};
    for(const b in b2n){ const code=nameToCode.get(b2n[b]); if(code!=null)remap[+b]=code; }
    objRemap.set(mem.num,{mergedObj:fontObj,remap,twoByte:false});
  }
  console.log('  merged family',fam,'-> font obj',fontObj,'glyphs',glyphList.length,'from',info.members.length,'objects');
}

// ---------- Connections Type0 -> single simple Type1 (reuse ConnectionsRegular full CFF) ----------
let connMergedObj=null;
if(type0Conn.length){
  const ttf=fontkit.create(fs.readFileSync('../ConnectionsRegular.ttf'));
  const NG=ttf.numGlyphs;
  const cffData=fs.readFileSync('Connections-Regular-Simple.cff');
  const cffZ=zlib.deflateSync(cffData);
  const diff=['0']; const widths=[]; const bf2=[];
  for(let g=0;g<NG;g++){const gl=ttf.getGlyph(g);diff.push('/'+(gl.name||('g'+g)));widths.push(Math.round(gl.advanceWidth));const cps=gl.codePoints;if(cps&&cps.length===1&&cps[0]>0)bf2.push(`<${g.toString(16).padStart(2,'0')}> <${cps[0].toString(16).padStart(4,'0')}>`);}
  const tuCMap=`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<00><FF>\nendcodespacerange\n${bf2.length} beginbfchar\n${bf2.join('\n')}\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n`;
  const ffObj=nextObj++, fdObj=nextObj++, tuObj=nextObj++; connMergedObj=nextObj++;
  newObjects.set(ffObj,{dict:`<< /Subtype /Type1C /Filter /FlateDecode /Length ${cffZ.length} >>`,stream:cffZ});
  newObjects.set(fdObj,{dict:`<<\n/Type /FontDescriptor\n/FontName /Connections\n/Flags 4\n/FontBBox [ -47 -244 962 923 ]\n/ItalicAngle 0\n/Ascent 923\n/Descent -244\n/CapHeight 685\n/StemV 84\n/MissingWidth 0\n/FontFile3 ${ffObj} 0 R\n>>`});
  newObjects.set(tuObj,{dict:`<< /Length ${Buffer.byteLength(tuCMap,'latin1')} >>`,stream:Buffer.from(tuCMap,'latin1')});
  newObjects.set(connMergedObj,{dict:`<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Connections\n/FirstChar 0\n/LastChar ${NG-1}\n/Widths [ ${widths.join(' ')} ]\n/FontDescriptor ${fdObj} 0 R\n/Encoding << /Type /Encoding /Differences [ ${diff.join(' ')} ] >>\n/ToUnicode ${tuObj} 0 R\n>>`});
  for(const t of type0Conn){
    objRemap.set(t.num,{mergedObj:connMergedObj,remap:null,twoByte:true});
    droppedObjs.add(t.num);
    // drop descendant chain
    const arr=dictVal(t.dictText,'DescendantFonts'); if(arr){droppedObjs.add(arr);const a=objs.get(arr);const inner=a&&a.dictText.match(/(\d+)\s+\d+\s+R/);if(inner){const cid=+inner[1];droppedObjs.add(cid);const cidO=objs.get(cid);if(cidO){const fdn=dictVal(cidO.dictText,'FontDescriptor');if(fdn){droppedObjs.add(fdn);const ff2=dictVal(objs.get(fdn).dictText,'FontFile2');if(ff2)droppedObjs.add(ff2);const cs=dictVal(objs.get(fdn).dictText,'CIDSet');if(cs)droppedObjs.add(cs);}}}}
    const tuN=dictVal(t.dictText,'ToUnicode'); if(tuN)droppedObjs.add(tuN);
  }
  console.log('  Connections Type0 ->',type0Conn.length,'wrappers -> single font obj',connMergedObj);
}

console.log('Total merged font objects created. Dropped originals:',droppedObjs.size);

// ---------- content stream rewriting ----------
function decodeLiteral(body){const o=[];let p=0;while(p<body.length){if(body[p]==='\\'){const n=body[p+1];if(n==='n'){o.push(10);p+=2;}else if(n==='r'){o.push(13);p+=2;}else if(n==='t'){o.push(9);p+=2;}else if(n==='b'){o.push(8);p+=2;}else if(n==='f'){o.push(12);p+=2;}else if(n==='\\'||n==='('||n===')'){o.push(body.charCodeAt(p+1));p+=2;}else if(n==='\n'){p+=2;}else if(n==='\r'){p+=(body[p+2]==='\n')?3:2;}else if(/[0-7]/.test(n)){let oc=n;p+=2;if(p<body.length&&/[0-7]/.test(body[p])){oc+=body[p];p++;}if(oc.length<3&&p<body.length&&/[0-7]/.test(body[p])){oc+=body[p];p++;}o.push(parseInt(oc,8)&0xff);}else{o.push(body.charCodeAt(p+1));p+=2;}}else{o.push(body.charCodeAt(p));p++;}}return o;}
function encLiteral(bytes){return bytes.map(b=>{if(b===0x28)return '\\(';if(b===0x29)return '\\)';if(b===0x5c)return '\\\\';if(b>=0x20&&b<0x7f)return String.fromCharCode(b);return '\\'+b.toString(8).padStart(3,'0');}).join('');}

function rewriteContent(txt, nameToInfo){ // nameToInfo: resourceName -> {remap,twoByte}
  const edits=[]; let out='';let i=0;const n=txt.length;let curName=null;const stack=[];let pendName=null;let lastStr=null;let arr=[];
  const ws=c=>c===' '||c==='\t'||c==='\r'||c==='\n'||c==='\f'||c==='\0';
  function applyRemap(range,info){ let bytes=range.bytes; let outb;
    if(info.twoByte){ if(bytes.length%2)return; outb=[]; for(let k=0;k<bytes.length;k+=2){ if(bytes[k]!==0)return; outb.push(bytes[k+1]); } }
    else { outb=bytes.map(b=> info.remap[b]!=null?info.remap[b]:0); }
    const t= range.isHex? '<'+outb.map(b=>b.toString(16).padStart(2,'0')).join('')+'>' : '('+encLiteral(outb)+')';
    edits.push({s:range.s,e:range.e,t}); }
  while(i<n){const ch=txt[i];
    if(ws(ch)){out+=ch;i++;continue;}
    if(ch==='%'){let j=i;while(j<n&&txt[j]!=='\n'&&txt[j]!=='\r')j++;out+=txt.slice(i,j);i=j;continue;}
    if(ch==='/'){let j=i+1;while(j<n&&!ws(txt[j])&&!'()<>[]{}/%'.includes(txt[j]))j++;pendName=txt.slice(i+1,j);out+=txt.slice(i,j);i=j;continue;}
    if(ch==='('){let d=1,j=i+1;while(j<n&&d>0){if(txt[j]==='\\'){j+=2;continue;}if(txt[j]==='(')d++;else if(txt[j]===')')d--;j++;}const body=txt.slice(i+1,j-1);const s=out.length;out+=txt.slice(i,j);lastStr={s,e:out.length,bytes:decodeLiteral(body),isHex:false};arr.push(lastStr);i=j;continue;}
    if(ch==='<'&&txt[i+1]!=='<'){let j=i+1;while(j<n&&txt[j]!=='>')j++;const hx=txt.slice(i+1,j).replace(/\s+/g,'');const bytes=[];for(let k=0;k+2<=hx.length;k+=2)bytes.push(parseInt(hx.substr(k,2),16));const s=out.length;out+=txt.slice(i,j+1);lastStr={s,e:out.length,bytes,isHex:true};arr.push(lastStr);i=j+1;continue;}
    if(ch==='<'&&txt[i+1]==='<'){out+='<<';i+=2;continue;}
    if(ch==='>'&&txt[i+1]==='>'){out+='>>';i+=2;continue;}
    if(ch==='['){arr=[];out+=ch;i++;continue;}
    if(ch===']'){out+=ch;i++;continue;}
    let j=i;while(j<n&&!ws(txt[j])&&!'()<>[]{}/%'.includes(txt[j]))j++;const tok=txt.slice(i,j);out+=tok;i=j;
    if(tok==='q')stack.push(curName);
    else if(tok==='Q')curName=stack.length?stack.pop():curName;
    else if(tok==='Tf')curName=pendName;
    else if(tok==='Tj'||tok==="'"||tok==='"'){const info=nameToInfo[curName];if(info&&lastStr)applyRemap(lastStr,info);lastStr=null;arr=[];}
    else if(tok==='TJ'){const info=nameToInfo[curName];if(info)for(const r of arr)applyRemap(r,info);arr=[];lastStr=null;}
  }
  if(!edits.length)return txt;
  edits.sort((a,b)=>a.s-b.s);let res='',prev=0;for(const e of edits){res+=out.slice(prev,e.s)+e.t;prev=e.e;}res+=out.slice(prev);return res;
}

// build, per page, resourceName -> info, and rewrite content + resources
function extractDict(t,key){const ref=t.match(new RegExp('\\/'+key+'\\s+(\\d+)\\s+\\d+\\s+R'));if(ref){const o=objs.get(+ref[1]);if(o){const m=o.dictText.match(/<<([\s\S]*)>>/);return m?m[1]:o.dictText;}}
  const ki=t.indexOf('/'+key);if(ki<0)return null;let i=ki+key.length+1;while(i<t.length&&/\s/.test(t[i]))i++;if(t[i]!=='<'||t[i+1]!=='<')return null;let d=1;i+=2;const st=i;while(i<t.length&&d>0){if(t[i]==='<'&&t[i+1]==='<'){d++;i+=2;}else if(t[i]==='>'&&t[i+1]==='>'){d--;i+=2;}else i++;}return t.slice(st,i-2);}

const newContent=new Map();      // contentObj -> Buffer
const fontResourceRedirect=new Map(); // resourceObjOrPage -> replacements [{from,to}]
for(const [pnum,po] of objs){
  if(!/\/Type\s*\/Page\b/.test(po.dictText)||/\/Type\s*\/Pages\b/.test(po.dictText))continue;
  const resBlob=extractDict(po.dictText,'Resources'); if(!resBlob)continue;
  const fontBlob=extractDict(resBlob,'Font'); if(!fontBlob)continue;
  const maps=[...fontBlob.matchAll(/\/([A-Za-z][\w]*)\s+(\d+)\s+\d+\s+R/g)];
  const nameToInfo={}; let any=false;
  for(const mm of maps){ const rn=mm[1], on=+mm[2]; if(objRemap.has(on)){ nameToInfo[rn]=objRemap.get(on); any=true; } }
  if(!any)continue;
  // content streams
  let crefs=[]; const cR=po.dictText.match(/\/Contents\s+(\d+)\s+\d+\s+R/);const cA=po.dictText.match(/\/Contents\s*\[([^\]]+)\]/);
  if(cR)crefs.push(+cR[1]);else if(cA)for(const m2 of cA[1].matchAll(/(\d+)\s+\d+\s+R/g))crefs.push(+m2[1]);
  for(const cn of crefs){const co=objs.get(cn);if(!co)continue;const raw=co.stream();if(!raw)continue;const t=raw.toString('latin1');const nt=rewriteContent(t,nameToInfo);if(nt!==t)newContent.set(cn,Buffer.from(nt,'latin1'));}
}

// ---------- emit ----------
const out=[];const xref=new Map();
const emit=s=>out.push(typeof s==='string'?Buffer.from(s,'latin1'):s);
const clen=()=>out.reduce((a,b)=>a+b.length,0);
emit('%PDF-1.6\n%\xE2\xE3\xCF\xD3\n');
const maxN=Math.max(...objs.keys(),...newObjects.keys());
// redirect refs to dropped font objects -> merged objects, in page/resource dicts
function redirectRefs(t){ return t.replace(/(\/[A-Za-z][\w]*\s+)(\d+)(\s+\d+\s+R)/g,(mm,pre,num,post)=>{ const info=objRemap.get(+num); if(info)return `${pre}${info.mergedObj}${post}`; return mm; }); }
for(let nn=1;nn<=maxN;nn++){
  if(newObjects.has(nn)){const e=newObjects.get(nn);xref.set(nn,clen());emit(`${nn} 0 obj\n`);if(e.stream){emit(e.dict+'\nstream\n');emit(e.stream);emit('\nendstream\n');}else emit(e.dict+'\n');emit('endobj\n');continue;}
  if(!objs.has(nn))continue; if(droppedObjs.has(nn))continue;
  const o=objs.get(nn);xref.set(nn,clen());emit(`${nn} ${o.gen} obj\n`);
  if(newContent.has(nn)){const z=zlib.deflateSync(newContent.get(nn));emit(`<< /Filter /FlateDecode /Length ${z.length} >>\nstream\n`);emit(z);emit('\nendstream\n');}
  else if(o.isStream()){const raw=o.stream();const z=zlib.deflateSync(raw);let d=o.dictText.trim();d=d.replace(/\/Length\s+\d+/g,'').replace(/\/Filter\s*\/\w+/g,'').replace(/\/Filter\s*\[[^\]]*\]/g,'');const gt=d.lastIndexOf('>>');d=d.slice(0,gt)+` /Filter /FlateDecode /Length ${z.length} `+d.slice(gt);emit(redirectRefs(d)+'\nstream\n');emit(z);emit('\nendstream\n');}
  else emit(redirectRefs(o.dictText.trim())+'\n');
  emit('endobj\n');
}
const xs=clen();emit('xref\n');emit(`0 ${maxN+1}\n`);emit('0000000000 65535 f \n');
for(let nn=1;nn<=maxN;nn++){if(xref.has(nn))emit(`${String(xref.get(nn)).padStart(10,'0')} 00000 n \n`);else emit('0000000000 00000 f \n');}
const tr=text.match(/trailer\s*<<([\s\S]*?)>>/);let trd=tr?tr[1].trim():'';trd=trd.replace(/\/Size\s+\d+/g,'').replace(/\/Prev\s+\d+/g,'');
emit(`trailer << ${trd} /Size ${maxN+1} >>\nstartxref\n${xs}\n%%EOF\n`);
fs.writeFileSync(DST,Buffer.concat(out));
console.log('Wrote',DST,fs.statSync(DST).size,'bytes');
