// Color, in its two places.
//
// The panel's color section sets one color — the line's or the fill's,
// whichever the panel is pointed at. A swatch pressed there is *worn*: the line
// keeps the swatch's number, and follows the palette from then on. A color made
// with the picker is the line's own, and follows nothing.
//
// The palette editor changes the palette itself, and so every line in the pack
// that wears the swatch being edited. It is a modal, as domain-map's is, because
// the palette belongs to the pack rather than to whatever happens to be selected.

import * as actions from './store.js';
import { store } from './store.js';
import { createPicker } from './picker.js';
import { STOCK_PALETTE } from './stock-palette.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// --- the panel's color section ----------------------------------------------------

let handlers = {};
let panelPicker;
let panelGrid;

/** The swatch the color on show is worn as, counted from 1, or null for a color of the line's own. */
let shownSwatch = null;

/**
 * @param container        where the section is built
 * @param callbacks.onPick hears `(color, key, swatch)`: `swatch` is the number of
 *                         the swatch pressed, or null for a color from the picker;
 *                         `key` names a drag, so the whole of it is one undo step
 * @param callbacks.onLand hears that a drag is over
 */
export function initPalette(container, callbacks) {
  handlers = callbacks;
  container.replaceChildren();

  panelPicker = createPicker(container, {
    onPick: (color, key) => handlers.onPick?.(color, key, null),
    onLand: () => handlers.onLand?.(),
  }, 'panel-picker');

  panelGrid = element('div', 'swatches');
  panelGrid.setAttribute('role', 'group');
  panelGrid.setAttribute('aria-label', 'Pack palette');
  container.append(panelGrid);

  buildEditor();
}

/** Point the section at a color, and at the swatch it is worn as, if it is. */
export function showColor(color, swatch = null) {
  shownSwatch = color ? swatch : null;
  panelPicker.show(color);
  paintGrid(panelGrid, shownSwatch === null ? -1 : shownSwatch - 1, (i) => {
    handlers.onPick?.(store.pack.palette[i], null, i + 1);
  }, (i) => `Wear color ${i + 1}`);
}

/**
 * The swatches, repainted in place while the count holds: a button rebuilt
 * between pointerdown and pointerup never gets its click.
 */
function paintGrid(grid, pressed, onPress, titleOf) {
  const { palette } = store.pack;
  if (grid.children.length !== palette.length) {
    grid.replaceChildren(...palette.map((_, i) => {
      const button = element('button', 'swatch');
      button.type = 'button';
      button.addEventListener('click', () => onPress(i));
      return button;
    }));
  }
  [...grid.children].forEach((button, i) => {
    button.style.background = palette[i];
    button.title = `${titleOf(i)} — ${palette[i]}`;
    button.setAttribute('aria-pressed', String(i === pressed));
  });
}

// --- the palette editor -------------------------------------------------------------

const dialog = document.getElementById('palette-dialog');

/** The swatch the editor's picker is pointed at. */
let active = 0;

/** Whether the press behind a click began on the backdrop. */
let pressedBackdrop = false;

let editorPicker;
let editorGrid;
let editorCaption;

/** Open on one swatch: the one the line in hand wears, or whichever was edited last. */
export function openPaletteEditor(swatch = null) {
  if (dialog.open) return;
  if (swatch) active = swatch - 1;
  paintEditor();
  dialog.showModal();
  editorGrid.children[active]?.focus();
}

/** Keep an open editor in step with the pack: after an edit, a reset, another pack. */
export function renderPaletteEditor() {
  if (dialog.open) paintEditor();
}

function paintEditor() {
  active = Math.min(Math.max(active, 0), store.pack.palette.length - 1);
  paintGrid(editorGrid, active, (i) => {
    active = i;
    paintEditor();
  }, (i) => `Edit color ${i + 1}`);
  editorCaption.textContent = `Color ${active + 1} — changes every line that wears it, in every icon of ${store.pack.name}`;
  editorPicker.show(store.pack.palette[active]);
}

function buildEditor() {
  const title = element('h2', 'dialog__title', 'Edit palette');
  title.id = 'palette-title';

  editorGrid = element('div', 'swatches');
  editorGrid.setAttribute('role', 'group');
  editorGrid.setAttribute('aria-label', 'The color to edit');

  editorCaption = element('p', 'palette-editor__label');

  const column = element('div', 'palette-editor');
  column.append(editorGrid, editorCaption);
  // A drag is shown the whole way, swatch and icon both, and the pack's files
  // are only rewritten once the editor is shut — so nothing here needs landing.
  editorPicker = createPicker(column, {
    onPick: (color) => actions.setPaletteColor(active, color),
  }, 'editor-picker');

  const reset = element('button', 'btn btn--chip', 'Reset to defaults');
  reset.type = 'button';
  reset.addEventListener('click', () => actions.setPalette([...STOCK_PALETTE]));

  const done = element('button', 'btn btn--chip', 'Done');
  done.type = 'button';
  done.addEventListener('click', () => dialog.close());

  const foot = element('div', 'dialog__foot');
  foot.append(reset, done);

  const body = element('div', 'dialog__body');
  body.append(title, column, foot);
  dialog.replaceChildren(body);

  // Clicking the backdrop shuts the editor, as Esc does. The dialog has no
  // padding of its own, so a click aimed at the dialog itself came from outside
  // it — but only if the press began there too, or a drag let go past the edge
  // would count.
  dialog.addEventListener('pointerdown', (event) => { pressedBackdrop = event.target === dialog; });
  dialog.addEventListener('click', (event) => {
    if (pressedBackdrop && event.target === dialog) dialog.close();
  });
  dialog.addEventListener('close', () => handlers.onEditorClose?.());
}
