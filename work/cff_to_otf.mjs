// Wrap a bare CFF into a minimal OTF sfnt so fontkit can read its glyph outlines.
export function wrapCFFtoOTF(cff, numGlyphs, unitsPerEm = 1000) {
  function tbl(tag, data) { return { tag, data }; }
  // head
  const head = Buffer.alloc(54);
  head.writeUInt32BE(0x00010000, 0);      // version
  head.writeUInt32BE(0x00010000, 4);      // fontRevision
  head.writeUInt32BE(0, 8);               // checkSumAdjustment
  head.writeUInt32BE(0x5F0F3CF5, 12);     // magic
  head.writeUInt16BE(0, 16);              // flags
  head.writeUInt16BE(unitsPerEm, 18);
  // created/modified (8 bytes each) left 0
  head.writeInt16BE(-1000, 36); head.writeInt16BE(-1000, 38); // xMin yMin
  head.writeInt16BE(2000, 40); head.writeInt16BE(2000, 42);   // xMax yMax
  head.writeUInt16BE(0, 44);              // macStyle
  head.writeUInt16BE(8, 46);              // lowestRecPPEM
  head.writeInt16BE(2, 48);               // fontDirectionHint
  head.writeInt16BE(0, 50);               // indexToLocFormat
  head.writeInt16BE(0, 52);               // glyphDataFormat
  // maxp (CFF version 0.5)
  const maxp = Buffer.alloc(6);
  maxp.writeUInt32BE(0x00005000, 0);
  maxp.writeUInt16BE(numGlyphs, 4);
  // hhea
  const hhea = Buffer.alloc(36);
  hhea.writeUInt32BE(0x00010000, 0);
  hhea.writeInt16BE(800, 4);   // ascent
  hhea.writeInt16BE(-200, 6);  // descent
  hhea.writeInt16BE(0, 8);     // lineGap
  hhea.writeUInt16BE(2000, 10);// advanceWidthMax
  hhea.writeUInt16BE(numGlyphs, 34); // numberOfHMetrics
  // hmtx (numGlyphs entries, advance 600, lsb 0)
  const hmtx = Buffer.alloc(numGlyphs * 4);
  for (let i = 0; i < numGlyphs; i++) { hmtx.writeUInt16BE(600, i*4); hmtx.writeInt16BE(0, i*4+2); }
  // cmap (format 4, empty)
  const cmap = Buffer.from([
    0,0, 0,1,            // version, numTables
    0,3, 0,1, 0,0,0,12,  // platform 3 enc 1 offset 12
    0,4, 0,24, 0,0,      // format4 length24 lang0
    0,2, 0,2, 0,0, 0,0,  // segCountX2=2, searchRange, entrySelector, rangeShift
    0xFF,0xFF, 0,0,      // endCount=FFFF, reservedPad
    0xFF,0xFF, 0,1, 0,0  // startCount=FFFF, idDelta=1, idRangeOffset=0
  ]);
  // name (0 records)
  const name = Buffer.from([0,0, 0,0, 0,6]);
  // OS/2 (version 4, minimal)
  const os2 = Buffer.alloc(96);
  os2.writeUInt16BE(4, 0);
  // post (version 3.0)
  const post = Buffer.alloc(32);
  post.writeUInt32BE(0x00030000, 0);

  const tables = [
    tbl('CFF ', cff), tbl('OS/2', os2), tbl('cmap', cmap), tbl('head', head),
    tbl('hhea', hhea), tbl('hmtx', hmtx), tbl('maxp', maxp), tbl('name', name), tbl('post', post),
  ].sort((a,b)=>a.tag<b.tag?-1:1);

  const numTables = tables.length;
  const headerSize = 12 + numTables*16;
  let offset = headerSize;
  const dir = Buffer.alloc(12 + numTables*16);
  dir.writeUInt32BE(0x4F54544F, 0); // 'OTTO'
  dir.writeUInt16BE(numTables, 4);
  // searchRange etc.
  let sr = 1; while (sr*2 <= numTables) sr*=2; sr*=16;
  dir.writeUInt16BE(sr, 6);
  let es=0,t=sr/16; while(t>1){t/=2;es++;} dir.writeUInt16BE(es,8);
  dir.writeUInt16BE(numTables*16 - sr, 10);
  const bodies = [];
  let p = 12;
  for (const tt of tables) {
    const data = tt.data;
    const padded = Buffer.alloc(Math.ceil(data.length/4)*4);
    data.copy(padded);
    dir.write(tt.tag, p, 4, 'latin1');
    // checksum
    let sum = 0; for (let i=0;i<padded.length;i+=4) sum = (sum + padded.readUInt32BE(i))>>>0;
    dir.writeUInt32BE(sum, p+4);
    dir.writeUInt32BE(offset, p+8);
    dir.writeUInt32BE(data.length, p+12);
    bodies.push(padded);
    offset += padded.length;
    p += 16;
  }
  return Buffer.concat([dir, ...bodies]);
}
