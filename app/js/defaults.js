// What a new icon and a new line start as. Change a value here, then run
// `node tests/document.test.mjs`, which checks each one against what an icon
// file may hold.

/** The canvas is square, and 24 is what Material, Lucide, Feather, Tabler,
    Heroicons and Remix all draw on. */
export const CANVAS_SIZE = 24;

/** Air kept clear around the artwork, which leaves a 20×20 live area. */
export const CANVAS_PADDING = 2;

/** How many swatches a pack's palette holds: eight across, four down. */
export const PALETTE_SIZE = 32;
export const PALETTE_COLUMNS = 8;

/**
 * What each row of the palette is for. A column is a family: a colour to draw
 * lines in, then three lighter tints of it to fill with. Eight line colours is
 * more than any one set of minimal icons should wear, but it is what lets each
 * set pick its own two or three and find their fills under them.
 */
export const PALETTE_ROWS = Object.freeze(['line color', 'medium fill', 'light fill', 'lightest fill']);

/** The swatch in `row` (from 0) of the column `swatch` is in. Swatches count from 1, across the rows. */
const inColumnOf = (swatch, row) => ((swatch - 1) % PALETTE_COLUMNS) + 1 + row * PALETTE_COLUMNS;

/**
 * What a line wears until it is given something else. A colour is worn either
 * as a swatch of the pack's palette, counted from 1 — and then it follows the
 * palette when that is edited — or as a hex of the line's own, with no swatch.
 * The hex is always there, since it is what is drawn; the swatch says where it
 * came from. Swatch 1 heads the grey column: #282828, the ink of the chrome.
 * 0.75 is a fine line on a 24px canvas — a minimal icon is mostly air.
 */
export const LINE_STYLE = Object.freeze({
  stroke: '#282828',
  strokeSwatch: 1,
  strokeOpacity: 100,
  width: 0.75,
  fill: null,          // no fill: most of a minimal icon is line
  fillSwatch: null,
  fillOpacity: 100,
});

/**
 * The swatch a fill starts as when fill is first switched on: the light tint in
 * the column the line's colour is in, so the two belong together without being
 * chosen. A line in a colour of its own takes the grey column's.
 */
export const firstFillSwatch = (strokeSwatch) => inColumnOf(strokeSwatch || 1, 2);

/** The pack a fresh install starts in, until another is made or opened. */
export const PACK_NAME = 'my-icons';

export const LAYER_NAME = 'Layer';
export const ICON_NAME = 'untitled';

/** Points land on half pixels, which keeps a 1px or 2px line crisp either way. */
export const GRID_STEP = 0.5;

export const SMOOTHING_LEVEL = 'normal';
