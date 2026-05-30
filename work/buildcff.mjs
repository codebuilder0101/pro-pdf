// Build a non-CID CFF (Type1C) from a list of glyphs: [{name, advanceWidth, path(fontkit)}]
// glyphs[0] should be .notdef. Returns Buffer.
export function buildCFF(glyphs, fontName = 'MergedFont') {
  function encNum(n){n=Math.round(n);
    if(n>=-107&&n<=107)return Buffer.from([n+139]);
    if(n>=108&&n<=1131){n-=108;return Buffer.from([(n>>8)+247,n&0xff]);}
    if(n>=-1131&&n<=-108){n=-n-108;return Buffer.from([(n>>8)+251,n&0xff]);}
    if(n>=-32768&&n<=32767){const b=Buffer.alloc(3);b[0]=28;b.writeInt16BE(n,1);return b;}
    const b=Buffer.alloc(5);b[0]=29;b.writeInt32BE(n,1);return b;}
  function encOp(op){return op<256?Buffer.from([op]):Buffer.from([12,op&0xff]);}
  const OP={RMOVETO:21,HMOVETO:22,VMOVETO:4,RLINETO:5,HLINETO:6,VLINETO:7,RRCURVETO:8,ENDCHAR:14};
  function buildCharstring(g){
    const parts=[]; parts.push(encNum(Math.round(g.advanceWidth||0)));
    let cx=0,cy=0; const cmds=g.path&&g.path.commands?g.path.commands:[];
    for(const c of cmds){const a=c.args;
      if(c.command==='moveTo'){const[x,y]=a;const dx=Math.round(x-cx),dy=Math.round(y-cy);
        if(dy===0&&dx!==0){parts.push(encNum(dx),encOp(OP.HMOVETO));}else if(dx===0&&dy!==0){parts.push(encNum(dy),encOp(OP.VMOVETO));}else{parts.push(encNum(dx),encNum(dy),encOp(OP.RMOVETO));}cx=Math.round(x);cy=Math.round(y);}
      else if(c.command==='lineTo'){const[x,y]=a;const dx=Math.round(x-cx),dy=Math.round(y-cy);
        if(dy===0){parts.push(encNum(dx),encOp(OP.HLINETO));}else if(dx===0){parts.push(encNum(dy),encOp(OP.VLINETO));}else{parts.push(encNum(dx),encNum(dy),encOp(OP.RLINETO));}cx=Math.round(x);cy=Math.round(y);}
      else if(c.command==='bezierCurveTo'||c.command==='curveTo'){const[x1,y1,x2,y2,x,y]=a;
        parts.push(encNum(Math.round(x1-cx)),encNum(Math.round(y1-cy)),encNum(Math.round(x2-x1)),encNum(Math.round(y2-y1)),encNum(Math.round(x-x2)),encNum(Math.round(y-y2)),encOp(OP.RRCURVETO));cx=Math.round(x);cy=Math.round(y);}
      else if(c.command==='quadraticCurveTo'){const[x1,y1,x,y]=a;
        const c1x=cx+2/3*(x1-cx),c1y=cy+2/3*(y1-cy),c2x=x+2/3*(x1-x),c2y=y+2/3*(y1-y);
        parts.push(encNum(Math.round(c1x-cx)),encNum(Math.round(c1y-cy)),encNum(Math.round(c2x-c1x)),encNum(Math.round(c2y-c1y)),encNum(Math.round(x-c2x)),encNum(Math.round(y-c2y)),encOp(OP.RRCURVETO));cx=Math.round(x);cy=Math.round(y);}
    }
    parts.push(encOp(OP.ENDCHAR));return Buffer.concat(parts);
  }
  function buildIndex(entries){
    if(entries.length===0)return Buffer.from([0,0]);
    const offs=[1];for(const e of entries)offs.push(offs[offs.length-1]+e.length);
    const max=offs[offs.length-1];let os=max<0x100?1:max<0x10000?2:max<0x1000000?3:4;
    const head=Buffer.alloc(3+os*offs.length);head.writeUInt16BE(entries.length,0);head[2]=os;
    let p=3;for(const o of offs){let v=o;for(let i=os-1;i>=0;i--){head[p+i]=v&0xff;v>>=8;}p+=os;}
    return Buffer.concat([head,...entries]);
  }
  const STD=391; const strings=[]; const addStr=s=>{let i=strings.indexOf(s);if(i<0){strings.push(s);i=strings.length-1;}return STD+i;};
  const N=glyphs.length;
  const charstrings=glyphs.map(buildCharstring);
  // charset format 0: SID per glyph (gid1..)
  const charsetBuf=Buffer.alloc(1+2*(N-1)); charsetBuf[0]=0;
  for(let g=1;g<N;g++) charsetBuf.writeUInt16BE(addStr(glyphs[g].name||('g'+g)),1+(g-1)*2);
  const enc32=n=>{const b=Buffer.alloc(5);b[0]=29;b.writeInt32BE(n,1);return b;};
  function buildTop(off){const p=[];
    p.push(encNum(0),encNum(0),encNum(0),encNum(0)); // placeholder? no. FontBBox:
    // Actually emit FontBBox -1000..2000
    return null;}
  // Top DICT with FontBBox + charset + CharStrings + Private (fixed 32-bit offsets)
  function topDict(off){const p=[];
    p.push(encNum(-200),encNum(-300),encNum(1100),encNum(1000),encOp(5)); // FontBBox
    p.push(enc32(off.charset),encOp(15));
    p.push(enc32(off.charStrings),encOp(17));
    p.push(enc32(off.privSize),enc32(off.privOff),encOp(18));
    return Buffer.concat(p);
  }
  function privateDict(subrsOff){const p=[];p.push(encNum(0),encOp(20));p.push(encNum(0),encOp(21));p.push(enc32(subrsOff),encOp(19));return Buffer.concat(p);}
  const header=Buffer.from([1,0,4,4]);
  const nameINDEX=buildIndex([Buffer.from(fontName,'latin1')]);
  const charStringsBuf=buildIndex(charstrings);
  const globalSubrs=buildIndex([]); const localSubrs=buildIndex([]);
  const stringINDEX=buildIndex(strings.map(s=>Buffer.from(s,'latin1')));
  let topBytes=topDict({charset:0,charStrings:0,privSize:0,privOff:0});
  const topSize=buildIndex([topBytes]).length;
  let pos=header.length+nameINDEX.length+topSize+stringINDEX.length+globalSubrs.length;
  const charsetOff=pos;pos+=charsetBuf.length;
  const charStringsOff=pos;pos+=charStringsBuf.length;
  const privOff=pos; const privSize=privateDict(0).length; const localOff=privOff+privSize;
  pos+=privSize+localSubrs.length;
  topBytes=topDict({charset:charsetOff,charStrings:charStringsOff,privSize,privOff});
  const topINDEX=buildIndex([topBytes]);
  if(topINDEX.length!==topSize)throw new Error('top size mismatch '+topINDEX.length+'!='+topSize);
  const privBytes=privateDict(localOff-privOff);
  return Buffer.concat([header,nameINDEX,topINDEX,stringINDEX,globalSubrs,charsetBuf,charStringsBuf,privBytes,localSubrs]);
}
