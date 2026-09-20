// Headless checks for icon packs: the palette a pack keeps, how editing it
// recolours the icons, and a pack carried between machines as one file.
//   node tests/pack.test.mjs

import { PALETTE_SIZE } from '../app/js/defaults.js';
import { fromSvg, newDocument, newLine, toSvg } from '../app/js/document.js';
import * as packs from '../app/js/pack.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

const p = (x, y) => ({ x, y });
const throwsWith = (action, words) => {
  try {
    action();
    return false;
  } catch (error) {
    return error.message.includes(words);
  }
};

const stock = Array.from({ length: PALETTE_SIZE }, (_, i) => `#${(i * 5).toString(16).padStart(2, '0').repeat(3)}`);

// --- palettes ---
check('a palette is always the full set of swatches', packs.tidyPalette(['#ff0000'], stock).length === PALETTE_SIZE);
check('a swatch that is not a hex is filled from the stock one', (() => {
  const tidy = packs.tidyPalette(['#ff0000', 'mauve'], stock);
  return tidy[0] === '#ff0000' && tidy[1] === stock[1];
})());

const pack = packs.newPack('domain-map', stock);
const kept = packs.packFromJson(packs.packToJson(pack), 'domain-map', stock);
check('a pack.json reads back as the pack it was', JSON.stringify(kept) === JSON.stringify(pack));
check('a pack with no pack.json worth the name opens on the stock palette',
  packs.packFromJson('not json', 'loose', stock).palette.join() === stock.join());
check('a pack from a newer iconbench says so',
  throwsWith(() => packs.packFromJson('{"version": 99}', 'x', stock), 'newer iconbench'));

// --- recolouring ---
const doc = newDocument();
doc.layers[0].lines.push(
  { ...newLine('straight', [p(2, 2), p(22, 2)]), stroke: stock[4], strokeSwatch: 5 },
  { ...newLine('straight', [p(2, 6), p(22, 6), p(12, 20)], undefined, true),
    stroke: stock[4], strokeSwatch: 5, fill: stock[9], fillSwatch: 10 },
  { ...newLine('straight', [p(2, 9), p(22, 9)]), stroke: '#123456', strokeSwatch: null },
);

const edited = [...stock];
edited[4] = '#ff0000';
edited[9] = '#00ff00';

check('editing a swatch recolours every line that wears it', (() => {
  const changed = packs.applyPalette(doc, edited);
  const [a, b] = doc.layers[0].lines;
  return changed && a.stroke === '#ff0000' && b.stroke === '#ff0000' && b.fill === '#00ff00';
})());
check('a line with a colour of its own is left alone', doc.layers[0].lines[2].stroke === '#123456');
check('applying the same palette again changes nothing', packs.applyPalette(doc, edited) === false);

const file = toSvg(doc);
check('an icon keeps which swatch each colour came from',
  file.includes('data-stroke-swatch="5"') && file.includes('data-fill-swatch="10"'));
check('and reads them back', (() => {
  const [, filled, own] = fromSvg(file).layers[0].lines;
  return filled.strokeSwatch === 5 && filled.fillSwatch === 10 && own.strokeSwatch === null;
})());

const again = [...edited];
again[4] = '#0000ff';
const recoloured = packs.recolourSvg(file, again, 'arrow');
check('an icon file is recoloured as a file', recoloured.includes('stroke="#0000ff"') && !recoloured.includes('#ff0000'));
check('and keeps everything else it held', fromSvg(recoloured).layers[0].lines.length === 3);
check('a file that wears none of what changed is not rewritten', packs.recolourSvg(recoloured, again, 'arrow') === null);

// --- a pack as one file ---
const bundle = packs.packToBundle(pack, [['zebra', file], ['arrow', recoloured]]);
const opened = packs.packFromBundle(bundle, stock);
check('a pack travels as one file, palette and icons',
  opened.pack.name === 'domain-map' && opened.pack.palette.join() === stock.join() && opened.icons.length === 2);
check('with its icons in name order, as the SVGs they are',
  opened.icons[0][0] === 'arrow' && opened.icons[0][1] === recoloured);
check('an icon in it that carries script is left out, and named', (() => {
  const bad = JSON.parse(bundle);
  bad.icons.evil = file.replace('</svg>', '<script>alert(1)</script></svg>');
  const result = packs.packFromBundle(JSON.stringify(bad), stock);
  return result.icons.length === 2 && result.skipped.join() === 'evil';
})());
check('a file that is not a pack is refused, in words',
  throwsWith(() => packs.packFromBundle('{"hello": 1}', stock), 'not an iconbench pack')
  && throwsWith(() => packs.packFromBundle('<svg/>', stock), 'not JSON'));

if (failures > 0) {
  console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nPacks hold.');
