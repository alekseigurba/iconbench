// The library dialog: a sheet of tiles and, when there is something to name, a
// name field under it. One dialog asks all three questions the library has —
// which pack to open, what to call a new pack, what to save this icon as —
// because each is answered the same way: by looking at what is already there.

import { safeName } from './document.js';

const dialog = document.getElementById('library-dialog');
const title = document.getElementById('library-title');
const note = document.getElementById('library-note');
const list = document.getElementById('library-list');
const form = document.getElementById('library-save');
const label = form.querySelector('.field__label');
const field = document.getElementById('library-name');
const suffix = form.querySelector('.library__ext');
const confirmButton = document.getElementById('library-confirm');
const closeButton = document.getElementById('library-close');

/** Settles the question being asked; null until one is. */
let answer = null;

/** Whether the press behind a click began on the backdrop. */
let pressedBackdrop = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function tileFor(tile, { current, onPress }) {
  const button = element('button', 'library__tile');
  button.type = 'button';
  button.title = tile.name;
  if (tile.name === current) button.setAttribute('aria-current', 'true');

  // Up to four drawings: one for an icon, the first few for a pack.
  const thumbs = element('span', tile.thumbs.length > 1 ? 'library__thumbs library__thumbs--sheet' : 'library__thumbs');
  for (const src of tile.thumbs.slice(0, 4)) {
    const image = element('img', 'library__thumb');
    image.src = src;
    image.alt = '';
    image.loading = 'lazy';
    thumbs.append(image);
  }

  button.append(thumbs, element('span', 'library__label', tile.name));
  if (tile.caption) button.append(element('span', 'library__when', tile.caption));
  button.addEventListener('click', () => onPress(tile.name));
  return button;
}

/**
 * Ask the library a question. Answers with a name fit for a file, or null when
 * the dialog was shut without one.
 *
 * @param question.title   the heading
 * @param question.note    a line under it, or nothing
 * @param question.tiles   `{ name, thumbs, caption }` for each thing already there
 * @param question.current the tile to mark as the one that is open
 * @param question.empty   what to say when there are no tiles
 * @param question.sheet   true for the pack preview: a wider dialog, since it is
 *                         there to be looked at, shut with Close rather than Cancel
 * @param question.name    `{ label, value, suffix, confirm }` to ask for a name as
 *                         well — pressing a tile then fills the field instead of
 *                         answering — or nothing, when a tile is the answer
 */
export function askLibrary(question) {
  if (dialog.open) dialog.close();

  title.textContent = question.title;
  note.hidden = !question.note;
  note.textContent = question.note ?? '';

  const naming = Boolean(question.name);
  form.hidden = !naming;
  confirmButton.hidden = !naming;
  closeButton.textContent = question.sheet ? 'Close' : 'Cancel';
  dialog.classList.toggle('dialog--sheet', Boolean(question.sheet));
  if (naming) {
    label.textContent = question.name.label;
    field.value = question.name.value ?? '';
    suffix.textContent = question.name.suffix ?? '';
    confirmButton.textContent = question.name.confirm;
  }

  const onPress = (name) => {
    if (!naming) return settle(name);
    field.value = name;
    field.focus();
    return undefined;
  };
  const tiles = question.tiles.map((tile) => tileFor(tile, { current: question.current, onPress }));
  list.replaceChildren(...(tiles.length > 0 ? tiles : [element('p', 'library__empty', question.empty ?? 'Nothing here yet.')]));

  return new Promise((resolve) => {
    answer = resolve;
    dialog.showModal();
    if (naming) {
      field.focus();
      field.select();
    }
  });
}

function settle(value) {
  const resolve = answer;
  answer = null;
  if (dialog.open) dialog.close();
  resolve?.(value);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = safeName(field.value);
  if (!name) {
    field.classList.add('field__input--bad');
    field.focus();
    return;
  }
  settle(name);
});

field.addEventListener('input', () => field.classList.remove('field__input--bad'));
closeButton.addEventListener('click', () => settle(null));

// Esc, or a click on the backdrop: shut without an answer. The dialog has no
// padding of its own, so a click aimed at the dialog itself came from outside
// it — but only if the press began there too.
dialog.addEventListener('close', () => settle(null));
dialog.addEventListener('pointerdown', (event) => { pressedBackdrop = event.target === dialog; });
dialog.addEventListener('click', (event) => {
  if (pressedBackdrop && event.target === dialog) settle(null);
});
