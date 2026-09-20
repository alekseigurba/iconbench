// Starts the real server on a free port over a throwaway folder, and checks the
// file API the page depends on: what it keeps, what it hands back, what it
// refuses. Nothing else is needed — no database, no Docker.
//   node tests/server.test.mjs

import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createIconbenchServer } from '../scripts/server.mjs';
import { checkLibrary, svg } from './library-checks.mjs';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

const storageDir = await mkdtemp(join(tmpdir(), 'iconbench-test-'));
const server = createIconbenchServer({ storageDir });
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

const ask = (path, init) => fetch(`${base}/api/files${path}`, init);
const put = (key, body) => ask(`/${key}`, { method: 'PUT', body });

try {
  // --- the app ---
  const page = await fetch(`${base}/`);
  check('the page is served at the root', page.ok && (await page.text()).includes('iconbench'));
  check('a module is served as one', (await fetch(`${base}/js/geometry.js`)).headers.get('content-type').startsWith('application/javascript'));
  check('nothing outside the app is', (await fetch(`${base}/..%2Fpackage.json`)).status === 404);
  check('health answers without touching the store', (await (await fetch(`${base}/health`)).json()).status === 'ok');

  // --- the library, as anything that answers api/files must keep it ---
  await checkLibrary(check, ask);
  check('and the server does not claim to be the browser', (await ask('?prefix=packs/')).headers.get('iconbench-library') === null);

  // --- and, this being the server, a folder of files ---
  await put('packs/domain-map/arrow-right.svg', svg);
  check('a saved icon is a file in the folder', (await readFile(join(storageDir, 'packs', 'domain-map', 'arrow-right.svg'), 'utf8')) === svg);
  await put('packs/domain-map/pack.json', JSON.stringify({ version: 1, name: 'domain-map', palette: ['#000000'] }));
  await ask('/packs/domain-map/arrow-right.svg', { method: 'DELETE' });
  check('a pack with its palette left is still a folder', (await readdir(join(storageDir, 'packs'))).includes('domain-map'));
  check('its last file gone, the folder is gone with it',
    (await ask('/packs/domain-map/pack.json', { method: 'DELETE' })).status === 204
    && !(await readdir(storageDir)).includes('packs'));
  check('and the store itself is still there to be written to', (await put('packs/again/arrow.svg', svg)).ok);
} finally {
  await new Promise((resolve) => server.close(resolve));
  server.closeAllConnections?.();
  await rm(storageDir, { recursive: true, force: true });
}

if (failures > 0) {
  console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nThe server holds.');
