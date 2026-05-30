import fs from 'fs';
import zlib from 'zlib';
import * as fontkit from 'fontkit';

const text = fs.readFileSync('bank_all_grafted.pdf', 'latin1');
const buf = fs.readFileSync('bank_all_grafted.pdf');

// Find the page-3 content's font resources. Page 3 = page obj 145.
const pm = text.match(/\b145 0 obj\s*<<([\s\S]*?)>>/);
console.log('Page 145 dict:', pm ? pm[1].slice(0, 600) : 'not found');
