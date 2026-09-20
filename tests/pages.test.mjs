// The copy of the app that GitHub Pages serves: that the script makes a copy,
// a whole one, and nothing but one. Built into a throwaway folder — whether the
// copy committed under docs/ is up to date is a matter for the release, not for
// every run of the tests.
//   node tests/pages.test.mjs

import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPages } from '../scripts/build-pages.mjs';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

const app = fileURLToPath(new URL('../app', import.meta.url));
const docs = fileURLToPath(new URL('../docs', import.meta.url));

/** Every file under a folder, as forward-slash paths from it, sorted. */
async function filesUnder(dir) {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

const scratch = await mkdtemp(join(tmpdir(), 'iconbench-pages-'));
const to = join(scratch, 'app');

try {
  // Something left over from the build before, which the app no longer has.
  await mkdir(join(to, 'js'), { recursive: true });
  await writeFile(join(to, 'js', 'gone.js'), '// deleted from the app since');

  await buildPages({ to });
  const copied = await filesUnder(to);
  const source = await filesUnder(app);

  check('every file of the app is in the copy, and nothing else is', copied.join('\n') === source.join('\n'));
  check('a file the app no longer has is gone from it', !copied.includes('js/gone.js'));

  const same = await Promise.all(source.map(async (file) => (await readFile(join(app, file))).equals(await readFile(join(to, file)))));
  check('byte for byte, fonts and all', same.every(Boolean), source.filter((_, index) => !same[index]).join(' '));

  // A worker answers only for its own folder and what is under it, so the one
  // that answers api/files has to be served from beside the page that asks.
  check('the worker sits beside the page', copied.includes('sw.js') && copied.includes('index.html'));
  check('and the page reaches everything by a relative path, so it works under /iconbench/app/',
    !/(?:src|href)="\//.test(await readFile(join(to, 'index.html'), 'utf8')));

  // --- what Pages is pointed at ---
  check('docs/ sends a visitor on to the app', (await readFile(join(docs, 'index.html'), 'utf8')).includes('url=app/'));
  check('and tells Pages to serve it as it is, not to run Jekyll over it', (await readdir(docs)).includes('.nojekyll'));
} finally {
  await rm(scratch, { recursive: true, force: true });
}

if (failures > 0) {
  console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nThe Pages copy holds.');
