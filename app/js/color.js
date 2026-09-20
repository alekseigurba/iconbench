// Colour arithmetic: hex in and out, and the hue, saturation and brightness the
// picker thinks in. Pure functions, so they run headless under test.

export const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));

/**
 * A colour as a line keeps it — #rrggbb in lower case — or null when the text
 * is not one. The short form and a missing # are read as well, since both are
 * how a hex gets typed.
 */
export function readHex(text) {
  let value = String(text ?? '').trim().toLowerCase();
  if (!value.startsWith('#')) value = `#${value}`;
  if (/^#[0-9a-f]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`;
  }
  return /^#[0-9a-f]{6}$/.test(value) ? value : null;
}

export function toHsv(color) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) h = (g - b) / delta;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max > 0 ? delta / max : 0, v: max };
}

export function toHex({ h, s, v }) {
  const channel = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * clamp(Math.min(k, 4 - k))) * 255);
  };
  return `#${[5, 3, 1].map((n) => channel(n).toString(16).padStart(2, '0')).join('')}`;
}
