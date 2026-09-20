// The file API as the service worker answers it, where there is no server: the
// same checks the real server gets, asked of `answerFiles` over a store kept in
// memory. No browser is needed — the handler speaks Request and Response, and
// Node has both.
//   node tests/fileapi.test.mjs

import { answerFiles } from '../app/js/fileapi.js';
import { checkLibrary, svg } from './library-checks.mjs';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

/** The four calls over a Map: the shape the browser's store has, without the browser. */
function memoryStore() {
  const files = new Map();
  const listing = (key) => ({ key, size: files.get(key).body.byteLength, lastModified: files.get(key).lastModified });
  return {
    read: async (key) => files.get(key) ?? null,
    write: async (key, body) => {
      files.set(key, { body, lastModified: new Date().toISOString() });
      return listing(key);
    },
    remove: async (key) => files.delete(key),
    list: async (prefix = '') => [...files.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort((a, b) => a.localeCompare(b))
      .map(listing),
  };
}

// As on Pages, where the app is not at the root of the site: the repo's name
// comes first, and the handler has to look past it to find the key.
const API_PATH = '/iconbench/app/api/files';
const store = memoryStore();
const ask = (path, init) => answerFiles(new Request(`https://example.github.io${API_PATH}${path}`, init), store, API_PATH);

await checkLibrary(check, ask);

const listing = await ask('?prefix=packs/');
check('every answer says it came from the browser, so the page can say so too',
  listing.headers.get('iconbench-library') === 'browser'
  && (await ask('/packs/domain-map/missing.svg')).headers.get('iconbench-library') === 'browser');
check('and is never to be kept by a cache', listing.headers.get('cache-control') === 'no-store');

const failing = { ...store, list: async () => { throw new Error('The disk is full.'); } };
const failed = await answerFiles(new Request(`https://example.github.io${API_PATH}?prefix=packs/`), failing, API_PATH);
check('a store that fails is an answer saying why, not a worker that fell over',
  failed.status === 400 && (await failed.json()).error === 'The disk is full.');

await ask('/packs/domain-map/arrow.svg', { method: 'PUT', body: svg });
const kept = await store.read('packs/domain-map/arrow.svg');
check('what reaches the store is the bytes that were sent', new TextDecoder().decode(kept.body) === svg);

if (failures > 0) {
  console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nThe browser\'s library holds.');
