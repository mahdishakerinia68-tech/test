import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const forbiddenNames = new Set(['app.js.bak','hesabyar-1_2_7-password.zip','hesabyar-1_2_8-password.zip']);
const forbidden = [/sk-[A-Za-z0-9_-]{12,}/, new RegExp('ANTH'+'ROPIC_KEY_STORAGE'), new RegExp('localStorage\\.setItem\\(KEY')];
function walk(dir){let out=[];for(const n of readdirSync(dir)){if(['node_modules','.git','android','ios'].includes(n))continue;const p=join(dir,n);const st=statSync(p);if(st.isDirectory())out=out.concat(walk(p));else out.push(p)}return out}
const files=walk('.');
for(const f of files){if(forbiddenNames.has(f.split('/').pop()))throw new Error(`forbidden release file: ${f}`);if(!/\.(js|html|json|mjs|ts|css|md|yml)$/.test(f))continue;const s=readFileSync(f,'utf8');for(const re of forbidden)if(re.test(s))throw new Error(`security check failed: ${re} in ${f}`)}
console.log('security-check: PASS');
