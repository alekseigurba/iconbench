// The layer control, in the bottom left corner of the stage as it is in
// domain-map: one row per layer, topmost first, reading
// `name · working on · dim · eye`. Here the layers are the icon's own, so they
// can be added, renamed and deleted, and under them all lies the sketch — a row
// of its own, since it is a guide to draw over and not part of the icon.

import * as actions from './store.js';
import { store, subscribe } from './store.js';
import { loadIcons } from './icons.js';

const control = document.getElementById('layer-control');

/** The layer whose name is being typed over, so a redraw does not take the field away. */
let renaming = null;

export function initLayers() {
  subscribe((reason) => {
    if (['doc', 'view', 'sketch'].includes(reason) && !renaming) render();
  });
  render();
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function layerButton(className, icon, label, pressed, onClick, { disabled = false } = {}) {
  const button = element('button', `layers__btn ${className}`);
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  if (pressed !== null) button.setAttribute('aria-pressed', String(pressed));
  button.disabled = disabled;

  // Drawn as an icon file, like every other control in the app.
  const drawing = element('span', 'icon');
  drawing.dataset.icon = `icons/${icon}.svg`;
  drawing.setAttribute('aria-hidden', 'true');
  button.appendChild(drawing);

  button.addEventListener('click', onClick);
  return button;
}

/** Renaming happens in place: the name gives way to a field holding it. */
function startRename(layer, name) {
  renaming = layer.id;
  const field = element('input', 'layers__rename');
  field.value = layer.name;
  field.maxLength = 40;
  field.setAttribute('aria-label', `Rename ${layer.name}`);

  const finish = (keep) => {
    if (renaming !== layer.id) return;
    renaming = null;
    if (keep) actions.renameLayer(layer.id, field.value);
    // Drawn again whatever happened: a rename given up leaves nothing changed
    // but the field, which still has to go.
    drawnFrom = '';
    render();
  };
  field.addEventListener('keydown', (event) => {
    event.stopPropagation(); // Delete and the arrows belong to the field here
    if (event.key === 'Enter') finish(true);
    else if (event.key === 'Escape') finish(false);
  });
  field.addEventListener('blur', () => finish(true));

  name.replaceWith(field);
  field.focus();
  field.select();
}

function layerRow(layer) {
  const chosen = store.activeLayerId === layer.id;
  const row = element('div', `layers__row${layer.hidden ? ' layers__row--hidden' : ''}`
    + `${layer.dimmed ? ' layers__row--dimmed' : ''}`
    + `${chosen ? ' layers__row--selected' : ''}`);

  const name = element('span', 'layers__name', layer.name);
  name.title = `${layer.name} — double-click to rename`;
  name.addEventListener('dblclick', () => startRename(layer, name));
  name.addEventListener('click', () => { if (!chosen) actions.setActiveLayer(layer.id); });

  row.append(
    name,
    layerButton('layers__pick', chosen ? 'pick-on' : 'pick', `Draw on ${layer.name}`, chosen,
      () => actions.setActiveLayer(layer.id)),
    layerButton('layers__dim', layer.dimmed ? 'dim-on' : 'dim', `Dim ${layer.name}`, Boolean(layer.dimmed),
      () => actions.toggleLayerDimmed(layer.id)),
    layerButton('layers__eye', layer.hidden ? 'eye-off' : 'eye',
      layer.hidden ? `Show ${layer.name}` : `Hide ${layer.name}`, !layer.hidden,
      () => actions.toggleLayerHidden(layer.id)),
  );
  return row;
}

function sketchRow() {
  const { sketch } = store;
  const empty = !sketch.image && sketch.marks.length === 0;
  const row = element('div', `layers__row layers__row--sketch${sketch.hidden ? ' layers__row--hidden' : ''}`
    + `${sketch.dimmed ? ' layers__row--dimmed' : ''}`);

  const name = element('span', 'layers__name', 'Sketch');
  name.title = 'The guide this icon is drawn over: a pasted picture and marker lines. Never saved with the icon.';

  row.append(
    name,
    layerButton('layers__clear', 'clear', 'Clear the sketch', null, () => actions.clearSketch(), { disabled: empty }),
    layerButton('layers__dim', sketch.dimmed ? 'dim-on' : 'dim', 'Dim the sketch', sketch.dimmed,
      () => actions.toggleSketch('dimmed')),
    layerButton('layers__eye', sketch.hidden ? 'eye-off' : 'eye',
      sketch.hidden ? 'Show the sketch' : 'Hide the sketch', !sketch.hidden,
      () => actions.toggleSketch('hidden')),
  );
  return row;
}

/** What the control was last drawn from, so it is only redrawn when that changes. */
let drawnFrom = '';

function render() {
  // The store says "doc" for every pixel a bend is dragged; the rows only care
  // about the layers themselves, not the lines on them.
  const showing = JSON.stringify([
    store.doc.layers.map((layer) => [layer.id, layer.name, layer.hidden, layer.dimmed, layer.lines.length]),
    store.activeLayerId,
    store.sketch.hidden, store.sketch.dimmed, Boolean(store.sketch.image), store.sketch.marks.length,
  ]);
  if (showing === drawnFrom) return;
  drawnFrom = showing;

  const head = element('div', 'layers__head');
  head.append(
    element('span', 'layers__title', 'Layers'),
    // Up and down the pile, for the layer being drawn on: what is higher paints
    // over what is lower, in the file as on the canvas.
    layerButton('layers__up', 'arrow-up', 'Move the layer being drawn on up the pile', null,
      () => actions.moveLayer(store.activeLayerId, 1), { disabled: !actions.canMoveLayer(store.activeLayerId, 1) }),
    layerButton('layers__down', 'arrow-down', 'Move the layer being drawn on down the pile', null,
      () => actions.moveLayer(store.activeLayerId, -1), { disabled: !actions.canMoveLayer(store.activeLayerId, -1) }),
    layerButton('layers__add', 'add', 'Add a layer above the one being drawn on', null,
      () => actions.addLayer(), { disabled: !actions.canAddLayer() }),
    layerButton('layers__delete', 'delete', 'Delete the layer being drawn on, and the lines on it', null, () => {
      const layer = actions.activeLayer();
      if (layer.lines.length === 0 || window.confirm(`Delete "${layer.name}" and the ${layer.lines.length} line${layer.lines.length === 1 ? '' : 's'} on it?`)) {
        actions.deleteLayer(layer.id);
      }
    }, { disabled: store.doc.layers.length <= 1 }),
  );

  // Topmost first: the control reads the way the icon is stacked, from the top
  // of the pile down — and the sketch is at the bottom of it.
  const rows = [...store.doc.layers].reverse().map(layerRow);
  control.replaceChildren(head, ...rows, sketchRow());
  loadIcons(control);
}
