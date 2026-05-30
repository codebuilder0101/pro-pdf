import fs from 'fs'; import zlib from 'zlib'; import * as fontkit from 'fontkit';
import { wrapCFFtoOTF } from './cff_to_otf.mjs';
const text=fs.readFileSync('normalized.pdf','latin1');const buf=fs.readFileSync('normalized.pdf');
function obj(n){const m=text.match(new RegExp('(?:^|[^0-9])'+n+' 0 obj'));const bs=m.index+m[0].length-(m[0].length-m[0].indexOf(n+' 0 obj'));return m;}
function getStream(n){const m=text.match(new RegExp('(?:^|[^0-9])'+n+' 0 obj'));const si=text.indexOf('stream',m.index);const dict=text.slice(m.index,si);const lm=dict.match(/\/Length\s+(\d+)/);let s=si+6;if(buf[s]===0x0d)s++;if(buf[s]===0x0a)s++;const d=buf.slice(s,s+ +lm[1]);return /FlateDecode/.test(dict)?zlib.inflateSync(d):d;}
function getDict(n){const m=text.match(new RegExp('(?:^|[^0-9])'+n+' 0 obj([\s\S]*?)(?:stream|endobj)'));return m[1];}
// Find a Connections_Medium or ConnectionsBold simple font dict and inspect
// Page 1 = obj 1; its /Font resources:
const p1=getDict(1);
const fontDictMatch=p1.match(/\/Font\s*<<([\s\S]*?)>>/);
console.log('Page1 fonts:', fontDictMatch?fontDictMatch[1].trim():'(indirect)');
