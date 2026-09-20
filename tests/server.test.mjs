// Starts the real server on a free port over a throwaway folder, and checks the
// file API the page depends on: what it keeps, what it hands back, what it
// refuses. Nothing else is needed — no database, no Docker.
//   node tests/server.test.mjs

import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { newDocument, newLine, toSvg } from '../app/js/document.js';
import { createIconbenchServer } from '../scripts/server.mjs';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

const storageDir = await mkdtemp(join(tmpdir(), 'iconbench-test-'));
const server = createIconbenchServer({ storageDir });
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;

const doc = newDocument();
doc.layers[0].lines.push(newLine('straight', [{ x: 2, y: 2 }, { x: 22, y: 22 }]));
const svg = toSvg(doc);

const put = (key, body) => fetch(`${base}/api/files/${key}`, { method: 'PUT', body });

try {
  // --- the app ---
  const page = await fetch(`${base}/`);
  check('the page is served at the root', page.ok && (await page.text()).includes('iconbench'));
  check('a module is served as one', (await fetch(`${base}/js/geometry.js`)).headers.get('content-type').startsWith('application/javascript'));
  check('nothing outside the app is', (await fetch(`${base}/..%2Fpackage.json`)).status === 404);
  check('health answers without touching the store', (await (await fetch(`${base}/health`)).json()).status === 'ok');

  // --- the library ---
  const empty = await (await fetch(`${base}/api/files?prefix=packs/`)).json();
  check('a fresh library lists nothing, rather than failing', Array.isArray(empty.objects) && empty.objects.length === 0);

  const saved = await put('packs/domain-map/arrow-right.svg', svg);
  check('an icon is saved', saved.ok && (await saved.json()).key === 'packs/domain-map/arrow-right.svg');
  check('and is a file in the folder', (await readFile(join(storageDir, 'packs', 'domain-map', 'arrow-right.svg'), 'utf8')) === svg);

  const read = await fetch(`${base}/api/files/packs/domain-map/arrow-right.svg`);
  check('it reads back byte for byte', (await read.text()) === svg);
  check('as an SVG that may do nothing but be a picture',
    read.headers.get('content-type') === 'image/svg+xml' && read.headers.get('content-security-policy').includes('sandbox'));

  const listed = await (await fetch(`${base}/api/files?prefix=packs/`)).json();
  check('and it is listed', listed.objects[0].key === 'packs/domain-map/arrow-right.svg');

  // --- what is refused ---
  const palette = JSON.stringify({ version: 1, name: 'domain-map', palette: ['#000000'] });
  check('a pack keeps its palette beside its icons', (await put('packs/domain-map/pack.json', palette)).ok);
  check('and hands it back as JSON',
    (await fetch(`${base}/api/files/packs/domain-map/pack.json`)).headers.get('content-type').startsWith('application/json'));
  check('a palette that is not JSON is refused', (await put('packs/domain-map/pack.json', '{nope')).status === 400);

  check('a file that is not an SVG is refused', (await put('packs/domain-map/notes.txt', 'hello')).status === 400);
  check('so is one outside the packs folder', (await put('settings.svg', svg)).status === 400);
  check('and one that is in no pack', (await put('packs/arrow.svg', svg)).status === 400);
  check('and one in a folder of its own inside a pack', (await put('packs/domain-map/sets/arrow.svg', svg)).status === 400);
  check('and a name that is not a tidy one', (await put('packs/domain-map/Arrow%20Right.svg', svg)).status === 400);
  check('a pack has a tidy name too', (await put('packs/Domain%20Map/arrow.svg', svg)).status === 400);
  check('a key cannot climb out of the store', (await put('packs/..%2F..%2Fescape.svg', svg)).status === 400);
  check('an SVG carrying script is refused',
    (await put('packs/domain-map/bad.svg', svg.replace('</svg>', '<script>alert(1)</script></svg>'))).status === 400);
  check('an icon the size of a photograph is refused',
    (await put('packs/domain-map/huge.svg', `${svg}<!--${'x'.repeat(1100 * 1024)}-->`).catch(() => ({ status: 413 }))).status === 413);
  check('an icon that is not there is a 404', (await fetch(`${base}/api/files/packs/domain-map/missing.svg`)).status === 404);

  // --- deleting ---
  check('an icon is deleted', (await fetch(`${base}/api/files/packs/domain-map/arrow-right.svg`, { method: 'DELETE' })).status === 204);
  check('and is gone', (await fetch(`${base}/api/files/packs/domain-map/arrow-right.svg`)).status === 404);
  check('deleting it twice says so', (await fetch(`${base}/api/files/packs/domain-map/arrow-right.svg`, { method: 'DELETE' })).status === 404);

  // --- a pack is its folder ---
  check('a pack with its palette left is still a folder', (await readdir(join(storageDir, 'packs'))).includes('domain-map'));
  check('its last file gone, the pack is gone with it',
    (await fetch(`${base}/api/files/packs/domain-map/pack.json`, { method: 'DELETE' })).status === 204
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
