// Extract embedded font streams from the PDF
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const pdfPath = path.resolve('../DUMMY.pdf');
const buf = fs.readFileSync(pdfPath);

// We need to find object 48 0 obj which holds the FontFile2 stream
// Plus the other FontFile3 (CFF) streams: 28, 30, 33, 35, 38, 40, 43, 51, 54, 56
const targetObjs = [28, 30, 33, 35, 38, 40, 43, 48, 51, 54, 56];

for (const objNum of targetObjs) {
  const marker = Buffer.from(`${objNum} 0 obj`);
  const idx = buf.indexOf(marker);
  if (idx < 0) { console.log(`Object ${objNum}: NOT FOUND`); continue; }
  // find "stream\n" or "stream\r\n"
  const dictEnd = buf.indexOf(Buffer.from('stream'), idx);
  if (dictEnd < 0) { console.log(`Object ${objNum}: no stream`); continue; }
  const dictText = buf.slice(idx, dictEnd).toString('latin1');
  // Parse Length and Filter
  const lenMatch = dictText.match(/\/Length\s+(\d+)/);
  const filterMatch = dictText.match(/\/Filter\s+\/(\w+)/);
  const subtypeMatch = dictText.match(/\/Subtype\s+\/(\w+)/);
  const length1Match = dictText.match(/\/Length1\s+(\d+)/);
  const length2Match = dictText.match(/\/Length2\s+(\d+)/);
  const length3Match = dictText.match(/\/Length3\s+(\d+)/);

  const len = lenMatch ? parseInt(lenMatch[1]) : null;
  const filter = filterMatch ? filterMatch[1] : null;
  const subtype = subtypeMatch ? subtypeMatch[1] : null;
  const length1 = length1Match ? parseInt(length1Match[1]) : null;
  const length2 = length2Match ? parseInt(length2Match[1]) : null;
  const length3 = length3Match ? parseInt(length3Match[1]) : null;

  // Find the start of stream data
  let streamStart = dictEnd + 'stream'.length;
  if (buf[streamStart] === 0x0d) streamStart++;
  if (buf[streamStart] === 0x0a) streamStart++;

  const streamData = buf.slice(streamStart, streamStart + len);
  console.log(`Object ${objNum}: Subtype=${subtype} Filter=${filter} Length=${len} L1=${length1} L2=${length2} L3=${length3}`);

  let decoded = streamData;
  if (filter === 'FlateDecode') {
    decoded = zlib.inflateSync(streamData);
  }
  const outName = `extracted_obj${objNum}_${subtype || 'raw'}.bin`;
  fs.writeFileSync(path.join('extracted', outName), decoded);
  // Inspect the first bytes to identify font format
  const magic = decoded.slice(0, 8);
  console.log(`  decoded len=${decoded.length}  magic=${[...magic].map(b => b.toString(16).padStart(2,'0')).join(' ')}  ascii="${magic.toString('latin1').replace(/[^\x20-\x7e]/g,'.')}"`);
}
