// Icon files, in and out. An icon is saved as the SVG it is — a file any page
// can use as it stands — and carries what the editor needs to open it again in
// data-* attributes: each layer's name on its <g>, each line's kind and points
// on its <path>. So the library is a folder of icons, not of project files.
//
// The sketch layer is not in the document at all, which is what keeps it out of
// every file written here.
//
// Pure: no DOM, so the tests and the server can read a file the same way.

import { CANVAS_SIZE, ICON_NAME, LAYER_NAME, LINE_STYLE, PALETTE_SIZE } from './defaults.js';
import { KINDS, isDrawable, linePath, round } from './geometry.js';
import { readHex } from './color.js';

/**
 * Bumped when the data-* attributes change shape. The swatches past 32 that
 * came with 1.1 did not bump it — the owner's call: the attributes are the same
 * ones, and a 1.0 bench says which swatch it has no colour for.
 */
export const FORMAT_VERSION = 1;

export const MAX_LAYERS = 12;
export const MIN_WIDTH = 0.25;
export const MAX_WIDTH = 4;

/**
 * A width held to the scale. 1.0 drew lines up to 8 wide, and an icon saved
 * with one still has to open: a value off the scale is held to its nearer end
 * rather than refused.
 */
export const holdWidth = (width) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(width) || MIN_WIDTH));

let counter = 0;
/** Ids only have to be unique within the tab: nothing outside it sees them. */
export const newId = (prefix) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export function newLayer(name) {
  return { id: newId('layer'), name, hidden: false, dimmed: false, lines: [] };
}

export function newDocument() {
  return { version: FORMAT_VERSION, name: ICON_NAME, size: CANVAS_SIZE, layers: [newLayer(`${LAYER_NAME} 1`)] };
}

// --- names ---------------------------------------------------------------------

/**
 * A name the library can keep as a file: lower case, words joined by dashes,
 * the way icon sets name theirs. Null when nothing usable is left.
 */
export function safeName(text) {
  const name = String(text ?? '')
    .trim()
    .replace(/\.svg$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return name || null;
}

// --- writing --------------------------------------------------------------------

const escape = (text) => String(text)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const unescape = (text) => String(text)
  .replace(/&quot;/g, '"')
  .replace(/&gt;/g, '>')
  .replace(/&lt;/g, '<')
  .replace(/&amp;/g, '&');

/** The attributes that paint a line. Shared with the canvas, so both draw alike. */
export function paintOf(line) {
  const paint = {
    stroke: line.stroke,
    'stroke-width': round(line.width),
    fill: line.fill ?? 'none',
  };
  if (line.strokeOpacity < 100) paint['stroke-opacity'] = line.strokeOpacity / 100;
  if (line.fill && line.fillOpacity < 100) paint['fill-opacity'] = line.fillOpacity / 100;
  return paint;
}

function pathMarkup(line) {
  const attributes = {
    d: linePath(line),
    ...paintOf(line),
    'data-kind': line.kind,
    'data-points': line.points.map((p) => `${round(p.x)},${round(p.y)}`).join(' '),
  };
  if (line.closed) attributes['data-closed'] = 'true';
  // Which swatch of the pack's palette a colour came from, when it came from
  // one: what lets the whole pack be recoloured by editing its palette.
  if (line.strokeSwatch) attributes['data-stroke-swatch'] = line.strokeSwatch;
  if (line.fill && line.fillSwatch) attributes['data-fill-swatch'] = line.fillSwatch;
  const text = Object.entries(attributes).map(([name, value]) => `${name}="${escape(value)}"`).join(' ');
  return `    <path ${text}/>`;
}

/**
 * The icon as an SVG file. A hidden layer is written with display="none": it
 * stays out of the picture, as it is on the canvas, and is still there to be
 * shown again when the file is next opened. Dimming is a way of looking at the
 * canvas rather than a property of the icon, so it is not written.
 */
export function toSvg(doc) {
  const size = doc.size;
  const layers = doc.layers.map((layer) => {
    const hidden = layer.hidden ? ' display="none"' : '';
    const lines = layer.lines.filter(isDrawable).map(pathMarkup);
    return [`  <g data-layer="${escape(layer.name)}"${hidden}>`, ...lines, '  </g>'].join('\n');
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"`
      + ` fill="none" stroke-linecap="round" stroke-linejoin="round" data-iconbench="${FORMAT_VERSION}">`,
    ...layers,
    '</svg>',
    '',
  ].join('\n');
}

// --- reading --------------------------------------------------------------------

/** Was this file written here? Anything else is a picture, not a drawing. */
export const isIconbenchFile = (text) => /<svg\b[^>]*\bdata-iconbench="/.test(String(text ?? ''));

/**
 * An SVG is a document, and a document served from this origin could carry
 * script that runs as whoever opens it. Nothing iconbench writes has any of
 * these in it, so a file that does is refused rather than cleaned.
 */
export const looksExecutable = (text) =>
  /<script\b|<foreignObject\b|\son[a-z]+\s*=|javascript:/i
    // A layer's name is the one piece of free text in a file, and a quoted
    // value is inert whatever it says — so a layer called "lines on = off"
    // does not get its own icon refused.
    .test(String(text ?? '').replace(/\bdata-layer="[^"]*"/g, ''));

function attributesOf(text) {
  const attributes = {};
  for (const [, name, value] of text.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
    attributes[name] = unescape(value);
  }
  return attributes;
}

function readPoints(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).map((pair) => {
    const [x, y] = pair.split(',').map(Number);
    return { x, y };
  });
}

const percent = (value) => (value === undefined ? 100 : Math.round(Number(value) * 100));

const swatch = (value) => (value === undefined ? null : Number(value));

/**
 * The document an iconbench SVG holds. It reads only the three tags this file
 * writes — a scanner rather than an XML parser, which is what lets it run
 * without a DOM — and throws, in words fit for the status line, on anything it
 * cannot open.
 */
export function fromSvg(text, name = ICON_NAME) {
  if (!isIconbenchFile(text)) throw new Error('That SVG was not drawn in iconbench, so there are no lines in it to edit.');
  if (looksExecutable(text)) throw new Error('That SVG carries script, so it was not opened.');

  const doc = { version: FORMAT_VERSION, name: safeName(name) ?? ICON_NAME, size: CANVAS_SIZE, layers: [] };
  let layer = null;

  for (const [, closing, tag, body] of text.matchAll(/<(\/?)(svg|g|path)\b([^>]*)>/g)) {
    if (closing) {
      if (tag === 'g') layer = null;
      continue;
    }
    const attributes = attributesOf(body);

    if (tag === 'svg') {
      const version = Number(attributes['data-iconbench']);
      if (version > FORMAT_VERSION) throw new Error(`That icon was saved by a newer iconbench (format ${version}).`);
      const size = Number(attributes.viewBox?.split(/\s+/)[2]);
      if (size > 0) doc.size = size;
    } else if (tag === 'g') {
      layer = newLayer(attributes['data-layer'] || `${LAYER_NAME} ${doc.layers.length + 1}`);
      layer.hidden = attributes.display === 'none';
      doc.layers.push(layer);
    } else if (layer && attributes['data-kind']) {
      const fill = attributes.fill && attributes.fill !== 'none' ? attributes.fill : null;
      layer.lines.push({
        id: newId('line'),
        kind: attributes['data-kind'],
        points: readPoints(attributes['data-points']),
        closed: attributes['data-closed'] === 'true',
        stroke: attributes.stroke,
        strokeSwatch: swatch(attributes['data-stroke-swatch']),
        strokeOpacity: percent(attributes['stroke-opacity']),
        width: holdWidth(attributes['stroke-width']),
        fill,
        fillSwatch: fill ? swatch(attributes['data-fill-swatch']) : null,
        fillOpacity: percent(attributes['fill-opacity']),
      });
    }
  }

  if (doc.layers.length === 0) doc.layers.push(newLayer(`${LAYER_NAME} 1`));
  const problem = validate(doc);
  if (problem) throw new Error(`That icon cannot be opened: ${problem}`);
  return doc;
}

// --- checking --------------------------------------------------------------------

const isPercent = (value) => Number.isInteger(value) && value >= 0 && value <= 100;

/** No swatch at all, or one of the palette's, counted from 1. */
const isSwatch = (value) => value === null || value === undefined
  || (Number.isInteger(value) && value >= 1 && value <= PALETTE_SIZE);

/** What is wrong with a document, in a sentence, or null when nothing is. */
export function validate(doc) {
  if (!doc || typeof doc !== 'object') return 'it is not a document.';
  if (!(doc.size > 0)) return 'it has no canvas size.';
  if (!Array.isArray(doc.layers) || doc.layers.length === 0) return 'it has no layers.';
  if (doc.layers.length > MAX_LAYERS) return `it has more than ${MAX_LAYERS} layers.`;

  for (const layer of doc.layers) {
    if (typeof layer.name !== 'string' || !layer.name) return 'a layer has no name.';
    if (!Array.isArray(layer.lines)) return `layer "${layer.name}" has no list of lines.`;

    for (const line of layer.lines) {
      const where = `a line on "${layer.name}"`;
      if (!KINDS.includes(line.kind)) return `${where} is of a kind this version does not draw: ${line.kind}.`;
      if (!Array.isArray(line.points) || line.points.some((p) => !Number.isFinite(p?.x) || !Number.isFinite(p?.y))) {
        return `${where} has a point that is not a pair of numbers.`;
      }
      if (!isDrawable(line)) return `${where} has too few points to draw.`;
      if (!readHex(line.stroke)) return `${where} has a line color that is not a hex: ${line.stroke}.`;
      if (line.fill !== null && !readHex(line.fill)) return `${where} has a fill that is not a hex: ${line.fill}.`;
      if (!(line.width >= MIN_WIDTH && line.width <= MAX_WIDTH)) return `${where} has a width outside ${MIN_WIDTH}–${MAX_WIDTH}.`;
      if (!isPercent(line.strokeOpacity) || !isPercent(line.fillOpacity)) return `${where} has an opacity outside 0–100.`;
      if (!isSwatch(line.strokeSwatch) || !isSwatch(line.fillSwatch)) return `${where} wears a swatch outside 1–${PALETTE_SIZE}.`;
    }
  }
  return null;
}

/** A line as it starts out: the kind and points given, wearing `style`. */
export function newLine(kind, points, style = LINE_STYLE, closed = false) {
  return { id: newId('line'), kind, points, closed, ...style };
}
