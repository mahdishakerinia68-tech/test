import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const index=readFileSync('index.html','utf8'), sw=readFileSync('sw.js','utf8'), app=readFileSync('app.js','utf8');
assert.match(index,/sw\.js\?v=t1/); assert.doesNotMatch(index,/maximum-scale=1/); assert.match(sw,/hesabdar-t1-offline-v1/); assert.match(app,/APP_VERSION="t1"/); assert.doesNotMatch(app,/saveAnthropicKey|clearAnthropicKey/);
console.log('e2e-smoke: PASS (static PWA/security/startup checks)');
