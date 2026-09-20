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

/**
 * What a line wears until it is given something else. A colour is worn either
 * as a swatch of the pack's palette, counted from 1 — and then it follows the
 * palette when that is edited — or as a hex of the line's own, with no swatch.
 * The hex is always there, since it is what is drawn; the swatch says where it
 * came from. Swatch 17 is the stock palette's #282828, the ink of the chrome.
 */
export const LINE_STYLE = Object.freeze({
  stroke: '#282828',
  strokeSwatch: 17,
  strokeOpacity: 100,
  width: 2,
  fill: null,          // no fill: most of a minimal icon is line
  fillSwatch: null,
  fillOpacity: 100,
});

/** The fill a line takes when fill is first switched on: swatch 18, the pale grey. */
export const FIRST_FILL = Object.freeze({ fill: '#c9c9c9', fillSwatch: 18 });

/** The pack a fresh install starts in, until another is made or opened. */
export const PACK_NAME = 'my-icons';

export const LAYER_NAME = 'Layer';
export const ICON_NAME = 'untitled';

/** Points land on half pixels, which keeps a 1px or 2px line crisp either way. */
export const GRID_STEP = 0.5;

export const SMOOTHING_LEVEL = 'normal';
