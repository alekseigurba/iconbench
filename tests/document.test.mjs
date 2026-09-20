// Headless checks for icon files: what is written, that it reads back as what
// it was, and that the defaults are values a file may hold.
//   node tests/document.test.mjs

import * as defaults from '../app/js/defaults.js';
import * as documents from '../app/js/document.js';
import { SMOOTHING_LEVELS } from '../app/js/geometry.js';

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

// --- defaults ---
const fresh = documents.newDocument();
check('a new icon is a 24px canvas with one empty layer',
  fresh.size === 24 && fresh.layers.length === 1 && fresh.layers[0].lines.length === 0);
check('the padding leaves a 20px live area', defaults.CANVAS_SIZE - 2 * defaults.CANVAS_PADDING === 20);
check('a new icon is one a file may hold', documents.validate(fresh) === null);
check('the default line is one a file may hold', (() => {
  const doc = documents.newDocument();
  doc.layers[0].lines.push(documents.newLine('straight', [p(2, 2), p(22, 22)]));
  return documents.validate(doc) === null;
})());
check('the default smoothing is one of the levels', SMOOTHING_LEVELS.includes(defaults.SMOOTHING_LEVEL));
check("a new line is 0.75 wide, on the scale and on the slider's quarter steps",
  defaults.LINE_STYLE.width === 0.75 && documents.MAX_WIDTH === 4 && (defaults.LINE_STYLE.width / 0.25) % 1 === 0);

// --- the palette's columns ---
check('the palette is eight columns of four', defaults.PALETTE_SIZE === 32 && defaults.PALETTE_COLUMNS === 8
  && defaults.PALETTE_ROWS.length * defaults.PALETTE_COLUMNS === defaults.PALETTE_SIZE);
check('a new line wears the colour that heads the first column', defaults.LINE_STYLE.strokeSwatch === 1);
check("a first fill is the light tint in the line's own column",
  [1, 2, 8].every((line) => defaults.firstFillSwatch(line) === line + 16));
check('whichever row of the column the line colour was taken from',
  defaults.firstFillSwatch(10) === 18 && defaults.firstFillSwatch(18) === 18 && defaults.firstFillSwatch(32) === 24);
check("and the grey column's, for a line in a colour of its own", defaults.firstFillSwatch(null) === 17);

// --- writing ---
const doc = documents.newDocument();
doc.layers[0].name = 'Outline & "frame" <1>';
doc.layers[0].lines.push(
  { ...documents.newLine('catmull', [p(2, 12), p(8, 4), p(16, 20), p(22, 12)]), width: 1.5 },
  { ...documents.newLine('quadratic', [p(2, 12), p(12, 2), p(22, 12), p(12, 22)], undefined, true),
    fill: '#fede49', fillOpacity: 40, strokeOpacity: 80 },
);
doc.layers.push({ ...documents.newLayer('Scrap'), hidden: true, dimmed: true,
  lines: [documents.newLine('straight', [p(4, 4), p(20, 4)])] });

const svg = documents.toSvg(doc);
check('an icon is written as a 24px SVG', svg.includes('viewBox="0 0 24 24"') && svg.includes('width="24"'));
check('with round caps and joins, and no fill unless a line asks for one',
  svg.includes('stroke-linecap="round"') && svg.includes('stroke-linejoin="round"') && svg.includes('<svg') && svg.includes(' fill="none"'));
check('a fill and its opacity are written on the line that has them',
  svg.includes('fill="#fede49"') && svg.includes('fill-opacity="0.4"') && svg.includes('stroke-opacity="0.8"'));
check('a solid line carries no opacity at all', (svg.match(/stroke-opacity/g) ?? []).length === 1);
check('a hidden layer is written, and kept out of the picture', svg.includes('data-layer="Scrap" display="none"'));
check('a layer name is escaped', svg.includes('data-layer="Outline &amp; &quot;frame&quot; &lt;1&gt;"'));
check('nothing of the sketch is ever in a file', !/sketch|marker|<image/i.test(svg));

// --- reading ---
const back = documents.fromSvg(svg, 'Payment Card.svg');
check('an icon reads back with its layers, in order',
  back.layers.length === 2 && back.layers[0].name === doc.layers[0].name && back.layers[1].name === 'Scrap');
check('and its lines, point for point',
  JSON.stringify(back.layers[0].lines.map((l) => l.points)) === JSON.stringify(doc.layers[0].lines.map((l) => l.points)));
check('and what each line wears', (() => {
  const [curve, lens] = back.layers[0].lines;
  return curve.kind === 'catmull' && curve.width === 1.5 && curve.fill === null && curve.strokeOpacity === 100
    && lens.kind === 'quadratic' && lens.closed && lens.fill === '#fede49' && lens.fillOpacity === 40 && lens.strokeOpacity === 80;
})());
check('hidden comes back hidden; dimmed is not the file\'s to keep', back.layers[1].hidden && !back.layers[1].dimmed);
check('it takes its name from the file', back.name === 'payment-card');
check('written again, it is the same file', documents.toSvg(back) === svg);

// --- refusing ---
check('an SVG drawn elsewhere is refused, in words',
  throwsWith(() => documents.fromSvg('<svg viewBox="0 0 24 24"><path d="M0 0L1 1"/></svg>'), 'not drawn in iconbench'));
check('an SVG carrying script is refused',
  throwsWith(() => documents.fromSvg(svg.replace('</svg>', '<script>alert(1)</script></svg>')), 'script'));
check('and so is one with a handler on it',
  throwsWith(() => documents.fromSvg(svg.replace('<path ', '<path onload="alert(1)" ')), 'script'));
check('a layer name that only looks like a handler is not', (() => {
  const named = documents.newDocument();
  named.layers[0].name = 'lines onpaper = yes';
  return documents.fromSvg(documents.toSvg(named)).layers[0].name === 'lines onpaper = yes';
})());
check('an icon from a newer iconbench says so',
  throwsWith(() => documents.fromSvg(svg.replace('data-iconbench="1"', 'data-iconbench="99"')), 'newer iconbench'));
check('a line 1.0 drew wider than the scale now runs is held to the widest, not refused',
  documents.fromSvg(svg.replace('stroke-width="1.5"', 'stroke-width="7"')).layers[0].lines[0].width === documents.MAX_WIDTH);
check('a line of a kind nobody draws is refused',
  throwsWith(() => documents.fromSvg(svg.replace('data-kind="catmull"', 'data-kind="spiral"')), 'spiral'));
check('a colour that is not a hex is refused', (() => {
  const bad = documents.newDocument();
  bad.layers[0].lines.push({ ...documents.newLine('straight', [p(1, 1), p(2, 2)]), stroke: 'red' });
  return documents.validate(bad)?.includes('not a hex');
})());

// --- names ---
check('a name is made fit for a file', documents.safeName('  Payment Card (v2).SVG ') === 'payment-card-v2');
check('and a name with nothing usable in it is no name', documents.safeName('…/…') === null);

if (failures > 0) {
  console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nDocuments hold.');
