import fs from 'fs';
const content = fs.readFileSync('src/db/database.js', 'utf8');
const lines = content.split('\n');
let start = -1;
lines.forEach((l, i) => {
  if (l.includes('export async function mergeProjectData')) {
    start = i;
  }
});
console.log('mergeProjectData starts at line:', start + 1);
