// What the page depends on from `api/files`, whoever answers it: what is kept,
// what is handed back, what is refused. The Node server answers it out of a
// folder and the service worker out of the browser, and the page is not to know
// which it has — so both are put through these, word for word.
//
// `ask(path, init)` makes a request of the API and answers with a Response;
// `path` is what comes after `api/files`. The library is left as empty as it
// was found.

import { newDocument, newLine, toSvg } from '../app/js/document.js';

const doc = newDocument();
doc.layers[0].lines.push(newLine('straight', [{ x: 2, y: 2 }, { x: 22, y: 22 }]));

/** An icon as the page would save it. */
export const svg = toSvg(doc);

export async function checkLibrary(check, ask) {
  const put = (key, body) => ask(`/${key}`, { method: 'PUT', body });
  const remove = (key) => ask(`/${key}`, { method: 'DELETE' });

  // --- the library ---
  const empty = await (await ask('?prefix=packs/')).json();
  check('a fresh library lists nothing, rather than failing', Array.isArray(empty.objects) && empty.objects.length === 0);

  const saved = await put('packs/domain-map/arrow-right.svg', svg);
  check('an icon is saved', saved.ok && (await saved.json()).key === 'packs/domain-map/arrow-right.svg');

  const read = await ask('/packs/domain-map/arrow-right.svg');
  check('it reads back byte for byte', (await read.text()) === svg);
  check('as an SVG that may do nothing but be a picture',
    read.headers.get('content-type') === 'image/svg+xml' && read.headers.get('content-security-policy').includes('sandbox'));
  check('whatever is after the ? being only there to get past a cache',
    (await (await ask('/packs/domain-map/arrow-right.svg?v=2026')).text()) === svg);

  await put('packs/domain-map/arrow-left.svg', svg);
  await put('packs/another/arrow-right.svg', svg);
  const listed = (await (await ask('?prefix=packs/')).json()).objects;
  check('what is saved is listed, in name order',
    listed.map((object) => object.key).join(' ') === 'packs/another/arrow-right.svg packs/domain-map/arrow-left.svg packs/domain-map/arrow-right.svg');
  check('with its size and when it was last written',
    listed[0].size === new TextEncoder().encode(svg).length && !Number.isNaN(Date.parse(listed[0].lastModified)));
  const ofOnePack = (await (await ask('?prefix=packs/domain-map/')).json()).objects;
  check('a listing can be of one pack', ofOnePack.length === 2 && ofOnePack.every((object) => object.key.startsWith('packs/domain-map/')));

  // --- what is refused ---
  const palette = JSON.stringify({ version: 1, name: 'domain-map', palette: ['#000000'] });
  check('a pack keeps its palette beside its icons', (await put('packs/domain-map/pack.json', palette)).ok);
  check('and hands it back as JSON',
    (await ask('/packs/domain-map/pack.json')).headers.get('content-type').startsWith('application/json'));
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
  // The server hangs up on a body this size rather than read it all, which a client sees as a failure to send.
  check('an icon the size of a photograph is refused',
    (await put('packs/domain-map/huge.svg', `${svg}<!--${'x'.repeat(1100 * 1024)}-->`).catch(() => ({ status: 413 }))).status === 413);
  check('an icon that is not there is a 404', (await ask('/packs/domain-map/missing.svg')).status === 404);
  check('and the API does nothing but get, put, delete and list',
    (await ask('/packs/domain-map/arrow-right.svg', { method: 'POST', body: svg })).status === 405);

  // --- deleting ---
  check('an icon is deleted', (await remove('packs/domain-map/arrow-right.svg')).status === 204);
  check('and is gone', (await ask('/packs/domain-map/arrow-right.svg')).status === 404);
  check('deleting it twice says so', (await remove('packs/domain-map/arrow-right.svg')).status === 404);
  check('what is not an icon cannot be deleted either', (await remove('packs/domain-map/notes.txt')).status === 400);

  // --- a pack is what is in it ---
  await remove('packs/domain-map/arrow-left.svg');
  const paletteOnly = (await (await ask('?prefix=packs/domain-map/')).json()).objects;
  check('a pack with only its palette left is still there', paletteOnly.length === 1 && paletteOnly[0].key === 'packs/domain-map/pack.json');
  await remove('packs/domain-map/pack.json');
  await remove('packs/another/arrow-right.svg');
  check('its last file gone, the pack is gone with it', (await (await ask('?prefix=packs/')).json()).objects.length === 0);
}
