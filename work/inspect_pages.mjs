// Inspect page structure: pages, their content streams, and which Type 0 fonts they reference.
import fs from 'fs';
import path from 'path';

const text = fs.readFileSync('normalized.pdf', 'latin1');

const objRe = /(\d+) (\d+) obj\b/g;
const objs = new Map();
let m;
while ((m = objRe.exec(text)) !== null) {
  const num = parseInt(m[1]);
  const start = m.index + m[0].length;
  const end = text.indexOf('endobj', start);
  if (end < 0) continue;
  objs.set(num, text.slice(start, end));
}

// Find page objects
const pages = [];
for (const [num, body] of objs) {
  if (/\/Type\s*\/Page\b/.test(body) && !/\/Type\s*\/Pages\b/.test(body)) {
    const contents = body.match(/\/Contents\s+(\d+)\s+\d+\s+R/);
    const contentsArr = body.match(/\/Contents\s*\[([^\]]+)\]/);
    const resources = body.match(/\/Resources\s+(\d+)\s+\d+\s+R/);
    let contentObjs = [];
    if (contents) contentObjs = [parseInt(contents[1])];
    else if (contentsArr) {
      const matches = [...contentsArr[1].matchAll(/(\d+)\s+\d+\s+R/g)];
      contentObjs = matches.map(m => parseInt(m[1]));
    }
    pages.push({ num, contentObjs, resourcesObj: resources ? parseInt(resources[1]) : null });
  }
}
console.log('Pages:', pages.length);
for (const p of pages) {
  console.log(`  page obj=${p.num}  contents=${p.contentObjs.join(',')}  resources=${p.resourcesObj}`);
}

// For each page, find its Resources Font subdict
console.log('\nResources/Font analysis per page:');
const targetType0 = new Set([79, 81, 83, 84, 85, 92, 95, 96, 98, 103, 110, 111, 116, 117, 118, 171, 173]);
for (const p of pages) {
  if (!p.resourcesObj) continue;
  const rBody = objs.get(p.resourcesObj);
  if (!rBody) continue;
  // Find /Font << ... >> sub-dict (may be indirect)
  // Try indirect first
  let fontDict = null;
  const fontRef = rBody.match(/\/Font\s+(\d+)\s+\d+\s+R/);
  if (fontRef) {
    fontDict = objs.get(parseInt(fontRef[1]));
  } else {
    const fontInline = rBody.match(/\/Font\s*<<([\s\S]*?)>>/);
    if (fontInline) fontDict = fontInline[1];
  }
  if (!fontDict) continue;
  // Parse /Fn -> obj refs
  const mappings = [...fontDict.matchAll(/\/([A-Za-z][\w]*)\s+(\d+)\s+\d+\s+R/g)];
  const relevant = mappings.filter(mm => targetType0.has(parseInt(mm[2])));
  console.log(`  page ${p.num}: ${relevant.length} Type0-Connections font aliases:`);
  for (const r of relevant) console.log(`    /${r[1]} -> obj ${r[2]}`);
}
