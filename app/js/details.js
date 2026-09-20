// The panel: how the selected line looks — or, with nothing selected, how the
// next one drawn will. Spline, then Fill, then the color both of them share.
//
// The controls are built once and repainted in place. A slider rebuilt while it
// is being pulled is a slider the pointer has let go of, and every pull here
// changes the store, which repaints the panel.

import * as actions from './store.js';
import { store, subscribe } from './store.js';
import { firstFillSwatch } from './defaults.js';
import { MAX_WIDTH, MIN_WIDTH } from './document.js';
import { SMOOTHING_LEVELS, anchorCount } from './geometry.js';
import { initPalette, openPaletteEditor, renderPaletteEditor, showColor } from './palette.js';

const KIND_NAMES = {
  straight: 'Straight line',
  quadratic: 'Quadratic Bézier',
  catmull: 'Catmull-Rom curve',
};

const SMOOTHING_NAMES = {
  none: 'No smoothing',
  min: 'Min',
  normal: 'Normal',
  max: 'Max',
};

const controls = {};

/** The fill a line had before it was switched off, so switching it on again is not a loss. */
let lastFill = null;

/**
 * @param callbacks.onPaletteEdited hears that the palette editor has been shut,
 *                                  which is when the pack's files catch up
 */
export function initDetails(callbacks = {}) {
  buildSpline(document.getElementById('spline-body'));
  buildFill(document.getElementById('fill-body'));
  initPalette(document.getElementById('color-body'), {
    // A swatch is worn, and its number kept; a color from the picker is the
    // line's own, and takes the line off the palette.
    onPick: (color, key, swatch) => actions.setStyle(
      store.target === 'fill' ? { fill: color, fillSwatch: swatch } : { stroke: color, strokeSwatch: swatch }, key),
    onLand: () => actions.settle(),
    onEditorClose: () => callbacks.onPaletteEdited?.(),
  });

  controls.remove = document.getElementById('delete-selected');
  controls.remove.addEventListener('click', () => {
    if (store.selection) actions.deleteLine(store.selection);
  });

  // The palette belongs to the pack rather than to the selection, so this one
  // stays when nothing is selected. It opens on the swatch the line in hand wears.
  document.getElementById('edit-palette').addEventListener('click', () => {
    const style = actions.currentStyle();
    openPaletteEditor(store.target === 'fill' ? style.fillSwatch : style.strokeSwatch);
  });

  subscribe(paint);
  paint();
}

// --- building ----------------------------------------------------------------

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** A label beside or above a control, as one field. */
function field(label, control, { inline = true, id } = {}) {
  const wrap = element('div', inline ? 'field field--inline' : 'field');
  const caption = element('label', 'field__label', label);
  if (id) {
    control.id = id;
    caption.htmlFor = id;
  }
  wrap.append(caption, control);
  return wrap;
}

/**
 * A slider with its value beside it. `input` changes the line as it is pulled,
 * under one undo key; `change` says the pull is over.
 */
function slider({ id, min, max, step, format, onInput }) {
  const wrap = element('div', 'slider');
  const input = element('input', 'slider__input');
  input.type = 'range';
  input.id = id;
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  const value = element('span', 'slider__value');
  input.addEventListener('input', () => {
    value.textContent = format(Number(input.value));
    onInput(Number(input.value));
  });
  input.addEventListener('change', () => actions.settle());
  wrap.append(input, value);
  return {
    wrap,
    input,
    set(number) {
      input.value = String(number);
      value.textContent = format(number);
    },
  };
}

/** The color a line or a fill is wearing; pressed, it is the one the picker sets. */
function inkButton(target, label) {
  const button = element('button', 'ink');
  button.type = 'button';
  button.title = `Set the ${label} color below`;
  const chip = element('span', 'ink__chip');
  const text = element('span', 'ink__text');
  button.append(chip, text);
  button.addEventListener('click', () => actions.setTarget(target));
  return { button, chip, text };
}

const percent = (n) => `${n}%`;

function buildSpline(body) {
  controls.note = element('p', 'details__note');

  controls.smoothing = element('select', 'field__select');
  controls.smoothing.append(...SMOOTHING_LEVELS.map((level) => {
    const option = element('option', '', SMOOTHING_NAMES[level]);
    option.value = level;
    return option;
  }));
  controls.smoothing.addEventListener('change', () => actions.setSmoothing(controls.smoothing.value));
  controls.smoothingField = field('Smoothing', controls.smoothing, { id: 'smoothing' });

  controls.width = slider({
    id: 'line-width',
    min: MIN_WIDTH,
    max: MAX_WIDTH,
    step: 0.25,
    format: (n) => `${n}px`,
    onInput: (width) => actions.setStyle({ width }, 'width'),
  });

  controls.stroke = inkButton('stroke', 'line');

  controls.strokeOpacity = slider({
    id: 'line-opacity',
    min: 0,
    max: 100,
    step: 5,
    format: percent,
    onInput: (strokeOpacity) => actions.setStyle({ strokeOpacity }, 'stroke-opacity'),
  });

  controls.closed = element('input', 'field__check');
  controls.closed.type = 'checkbox';
  controls.closed.addEventListener('change', () => {
    if (store.selection) actions.setClosed(store.selection, controls.closed.checked);
  });
  controls.closedField = field('Closed', controls.closed, { id: 'line-closed' });

  body.replaceChildren(
    controls.note,
    controls.smoothingField,
    field('Width', controls.width.wrap),
    field('Color', controls.stroke.button),
    field('Opacity', controls.strokeOpacity.wrap),
    controls.closedField,
  );
}

function buildFill(body) {
  controls.filled = element('input', 'field__check');
  controls.filled.type = 'checkbox';
  controls.filled.addEventListener('change', () => {
    if (controls.filled.checked) {
      // Switched on for the first time, a fill is the light tint of the family
      // the line is drawn in, so the two belong together without being chosen.
      const fillSwatch = firstFillSwatch(actions.currentStyle().strokeSwatch);
      actions.setStyle(lastFill ?? { fill: store.pack.palette[fillSwatch - 1], fillSwatch });
      actions.setTarget('fill');
    } else {
      const { fill, fillSwatch } = actions.currentStyle();
      if (fill) lastFill = { fill, fillSwatch };
      actions.setStyle({ fill: null, fillSwatch: null });
      actions.setTarget('stroke');
    }
  });

  controls.fill = inkButton('fill', 'fill');

  controls.fillOpacity = slider({
    id: 'fill-opacity',
    min: 0,
    max: 100,
    step: 5,
    format: percent,
    onInput: (fillOpacity) => actions.setStyle({ fillOpacity }, 'fill-opacity'),
  });

  body.replaceChildren(
    field('Filled', controls.filled, { id: 'line-filled' }),
    field('Color', controls.fill.button),
    field('Opacity', controls.fillOpacity.wrap),
  );
}

// --- painting ----------------------------------------------------------------

function describe(line) {
  const bends = anchorCount(line);
  return `${KIND_NAMES[line.kind]}, ${line.closed ? 'closed' : 'open'}, ${bends} bend${bends === 1 ? '' : 's'}.`;
}

/** A color worn as a swatch is named by its number: that is what it will follow. */
function paintInk(ink, color, swatch, pressed) {
  ink.chip.style.background = color ?? '';
  ink.chip.classList.toggle('ink__chip--none', !color);
  ink.text.textContent = !color ? 'none' : swatch ? `${color} · ${swatch}` : color;
  ink.button.setAttribute('aria-pressed', String(pressed));
}

function paint() {
  const line = actions.selectedLine();
  const style = actions.currentStyle();

  controls.note.textContent = line
    ? describe(line)
    : 'Nothing selected: this is what the next line will wear.';

  controls.smoothingField.hidden = store.tool !== 'freehand';
  controls.smoothing.value = store.smoothing;

  controls.width.set(style.width);
  controls.strokeOpacity.set(style.strokeOpacity);
  paintInk(controls.stroke, style.stroke, style.strokeSwatch, store.target === 'stroke');

  controls.closedField.hidden = !line;
  controls.closed.checked = Boolean(line?.closed);
  // Two points make a line, but not a shape: there is nothing to join up.
  controls.closed.disabled = Boolean(line) && !line.closed && !actions.canClose(line);

  const filled = Boolean(style.fill);
  controls.filled.checked = filled;
  controls.fillOpacity.set(style.fillOpacity);
  controls.fillOpacity.input.disabled = !filled;
  paintInk(controls.fill, style.fill, style.fillSwatch, store.target === 'fill');

  // Picking a color with the fill in hand switches the fill on, so the picker
  // is never pointed at nothing: with no fill it shows none pressed.
  document.getElementById('color-title').textContent = store.target === 'fill' ? 'Fill color' : 'Line color';
  if (store.target === 'fill') showColor(style.fill, style.fillSwatch);
  else showColor(style.stroke, style.strokeSwatch);
  renderPaletteEditor();

  controls.remove.hidden = !line;
}
