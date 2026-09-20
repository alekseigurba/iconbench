// A color picker that is always open: a saturation and brightness area, a hue
// strip, and a hex field, each keeping the others in step. It is domain-map's,
// made into something that can be built twice — the panel has one for the line
// in hand, and the palette editor one for the swatch being edited.
//
// It knows nothing of lines or palettes: it is shown a color, and says when
// another has been picked.

import { clamp, readHex, toHex, toHsv } from './color.js';

function element(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/**
 * @param container        where the picker is built; it is appended, not swapped in
 * @param callbacks.onPick hears `(color, key)`. `key` names a drag or a run of
 *                         arrow keys, so the whole of it can be one step to undo;
 *                         it is null for a color typed or chosen outright.
 * @param callbacks.onLand hears that such a run is over
 * @param idPrefix         keeps the two pickers' field ids apart
 */
export function createPicker(container, callbacks, idPrefix = 'picker') {
  /** The color on show, as its owner holds it, or null for none. */
  let shown = null;

  /**
   * Where the picker sits, as hue, saturation and brightness rather than as
   * hex. A grey has no hue and black no saturation, so holding them here is
   * what keeps the picker from losing its place when a color passes through
   * either.
   */
  let hsv = { h: 0, s: 0, v: 0 };

  /** A drag over the color area is under way. */
  let dragging = false;

  // Saturation runs across the area and brightness up it, over the pure hue
  // the strip underneath is set to.
  const area = element('div', 'picker__area');
  area.tabIndex = 0;
  area.setAttribute('role', 'slider');
  area.setAttribute('aria-label', 'Saturation and brightness');
  area.setAttribute('aria-valuemin', '0');
  area.setAttribute('aria-valuemax', '100');
  const thumb = element('span', 'picker__thumb');
  area.appendChild(thumb);

  const hue = element('input', 'picker__hue');
  hue.type = 'range';
  hue.min = '0';
  hue.max = '360';
  hue.step = '1';
  hue.id = `${idPrefix}-hue`;
  hue.setAttribute('aria-label', 'Hue');

  const chip = element('span', 'picker__chip');

  // One hex field rather than three channels: a color is written down as hex
  // everywhere else it is discussed, so it is what there is to type.
  const hex = element('input', 'field__input');
  hex.id = `${idPrefix}-hex`;
  hex.spellcheck = false;
  hex.autocomplete = 'off';
  hex.maxLength = 7;
  hex.setAttribute('aria-label', 'Hex value');

  const hexRow = element('div', 'picker__hex');
  hexRow.append(chip, hex);

  const picker = element('div', 'picker');
  picker.append(area, hue, hexRow);
  container.append(picker);

  const pick = (color, key = null) => callbacks.onPick?.(color, key);

  /**
   * Point the picker at a color. A grey has no hue of its own and black no
   * saturation, so the picker keeps the ones it had rather than jumping into a
   * corner — except when it is shown another color outright.
   */
  function aim(color, { keep = true } = {}) {
    const next = toHsv(color);
    if (keep && next.s === 0) next.h = hsv.h;
    if (keep && next.v === 0) next.s = hsv.s;
    hsv = next;
  }

  function land() {
    if (!dragging) return;
    dragging = false;
    callbacks.onLand?.();
  }

  function paint({ field = true } = {}) {
    const color = toHex(hsv);
    const pure = `hsl(${Math.round(hsv.h)}, 100%, 50%)`;

    area.style.setProperty('--hue', pure);
    area.setAttribute('aria-valuenow', String(Math.round(hsv.s * 100)));
    area.setAttribute('aria-valuetext',
      `Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`);
    thumb.style.left = `${hsv.s * 100}%`;
    thumb.style.top = `${(1 - hsv.v) * 100}%`;
    thumb.style.background = color;

    hue.style.setProperty('--hue', pure);
    hue.value = String(Math.round(hsv.h));
    chip.style.background = color;

    if (field && document.activeElement !== hex) {
      hex.value = shown ?? color;
      hex.classList.remove('field__input--bad');
    }
  }

  // --- the area: dragging, or the arrow keys with Shift for bigger steps -------

  const dragTo = (event) => {
    const box = area.getBoundingClientRect();
    hsv = {
      h: hsv.h,
      s: clamp((event.clientX - box.left) / box.width),
      v: 1 - clamp((event.clientY - box.top) / box.height),
    };
    pick(toHex(hsv), idPrefix);
  };

  area.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    // Focused before the drag starts, so a hex still being typed is written
    // first rather than landing on top of it afterwards.
    area.focus();
    area.setPointerCapture(event.pointerId);
    dragging = true;
    dragTo(event);
  });
  area.addEventListener('pointermove', (event) => { if (dragging) dragTo(event); });
  area.addEventListener('pointerup', land);
  area.addEventListener('lostpointercapture', land);

  const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  area.addEventListener('keydown', (event) => {
    const direction = steps[event.key];
    if (!direction) return;
    event.preventDefault();
    event.stopPropagation(); // the arrows nudge the selected line everywhere else
    const step = event.shiftKey ? 0.1 : 0.01;
    hsv = { h: hsv.h, s: clamp(hsv.s + direction[0] * step), v: clamp(hsv.v + direction[1] * step) };
    pick(toHex(hsv), idPrefix);
  });
  area.addEventListener('keyup', (event) => {
    if (steps[event.key]) callbacks.onLand?.();
  });

  // --- the hue strip ---------------------------------------------------------------

  hue.addEventListener('input', () => {
    hsv = { ...hsv, h: Number(hue.value) };
    // A grey has no hue to change: the strip moves, and the color waits for
    // some saturation before it has anything new to say.
    if (hsv.s > 0 && hsv.v > 0) pick(toHex(hsv), idPrefix);
    else paint();
  });
  hue.addEventListener('change', () => callbacks.onLand?.());
  hue.addEventListener('keydown', (event) => event.stopPropagation());

  // --- the hex field -----------------------------------------------------------------

  // The field and the picker follow each other both ways: a readable hex moves
  // the picker as it is typed, and is written on Enter or on leaving the field.
  // Esc puts back what the owner holds.
  const commit = () => {
    const color = readHex(hex.value);
    if (color && color !== shown) {
      aim(color);
      pick(color);
    }
    hex.value = shown ?? toHex(hsv);
    hex.classList.remove('field__input--bad');
  };

  hex.addEventListener('input', () => {
    const color = readHex(hex.value);
    hex.classList.toggle('field__input--bad', hex.value.trim().length > 0 && !color);
    if (!color) return;
    aim(color);
    paint({ field: false });
  });
  hex.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      hex.select();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (shown) aim(shown);
      hex.value = shown ?? toHex(hsv);
      hex.blur();
    }
  });
  hex.addEventListener('blur', commit);

  return {
    /** Show a color: the owner's, or null for none. */
    show(color) {
      const next = color ? readHex(color) : null;
      // One the picker has just sent comes back rounded to whole channels, and
      // would nudge the thumb off the spot it was let go on.
      const mine = next !== null && next === toHex(hsv);
      shown = next;
      if (next && !mine && !dragging) aim(next, { keep: false });
      paint();
    },
    /** Is a drag over the area under way? */
    get dragging() {
      return dragging;
    },
  };
}
