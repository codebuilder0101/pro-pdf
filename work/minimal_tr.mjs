import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import * as fontkit from 'fontkit';
import * as mupdf from 'mupdf';

const cffData = fs.readFileSync('Connections-Regular-Simple.cff');
const ttf = fontkit.create(fs.readFileSync('../ConnectionsRegular.ttf'));
const N = ttf.numGlyphs;
const diffParts = ['0']; const widthsArr = [];
for (let g = 0; g < N; g++) { const glyph = ttf.getGlyph(g); diffParts.push('/' + (glyph.name||('gid'+g))); widthsArr.push(Math.round(glyph.advanceWidth)); }
const cffCompressed = zlib.deflateSync(cffData);

// Test: render "04/08/26" with Tr=2 (fill+stroke), Tc=.15, plus a line width
const content = `0.229 w
0 0 0 1 K
BT
/F1 12 Tf
0.15 Tc 2 Tr
72 700 Td
<1317121318121519> Tj
0 Tc 0 Tr
0 -30 Td
<1317121318121519> Tj
ET`;
const contentBuf = Buffer.from(content, 'latin1');
const objs = [null];
objs.push(`<< /Type /Catalog /Pages 2 0 R >>`);
objs.push(`<< /Type /Pages /Kids [3 0 R] /Count 1 >>`);
objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`);
objs.push({ dict: `<< /Length ${contentBuf.length} >>`, stream: contentBuf });
objs.push(`<< /Type /Font /Subtype /Type1 /BaseFont /Connections /FirstChar 0 /LastChar ${N-1} /Widths [ ${widthsArr.join(' ')} ] /FontDescriptor 6 0 R /Encoding << /Type /Encoding /Differences [ ${diffParts.join(' ')} ] >> >>`);
objs.push(`<< /Type /FontDescriptor /FontName /Connections /Flags 32 /FontBBox [-47 -244 962 923] /ItalicAngle 0 /Ascent 923 /Descent -244 /CapHeight 685 /StemV 84 /FontFile3 7 0 R >>`);
objs.push({ dict: `<< /Subtype /Type1C /Filter /FlateDecode /Length ${cffCompressed.length} >>`, stream: cffCompressed });
const out = []; const xref = [];
function emit(s){out.push(typeof s==='string'?Buffer.from(s,'latin1'):s);}
function curLen(){return out.reduce((a,b)=>a+b.length,0);}
emit('%PDF-1.6\n%\xE2\xE3\xCF\xD3\n');
for (let i=1;i<objs.length;i++){xref[i]=curLen();emit(`${i} 0 obj\n`);const o=objs[i];if(typeof o==='string')emit(o+'\n');else{emit(o.dict+'\nstream\n');emit(o.stream);emit('\nendstream\n');}emit('endobj\n');}
const xs=curLen();emit('xref\n');emit(`0 ${objs.length}\n`);emit('0000000000 65535 f \n');
for(let i=1;i<objs.length;i++)emit(`${String(xref[i]).padStart(10,'0')} 00000 n \n`);
emit(`trailer << /Root 1 0 R /Size ${objs.length} >>\nstartxref\n${xs}\n%%EOF\n`);
const pdf=Buffer.concat(out);
fs.writeFileSync('minimal_tr.pdf',pdf);
const d=mupdf.Document.openDocument(pdf,'application/pdf');
const pix=d.loadPage(0).toPixmap(mupdf.Matrix.scale(3,3),mupdf.ColorSpace.DeviceRGB,false,true);
fs.writeFileSync(path.resolve('../minimal_tr.png'),pix.asPNG());
console.log('done');
