// Line maths: the three kinds of line as runs of segments, the path each one
// draws, and the questions editing asks of them — what is nearest the pointer,
// where a new bend goes, what is left when one is taken out. Pure functions —
// no DOM, no store — so all of it runs headless under test.
//
// A line is `{ kind, points, closed }`, and what `points` means is the kind's:
//
//   straight   every point is a corner the line turns at.
//   quadratic  anchors and controls take turns — a0 c0 a1 c1 a2 … — so an even
//              index is on the line and an odd one pulls the segment it is in.
//              Closed, the last point is the control of the run back to a0.
//   catmull    every point is on the line, and the curve finds its own way
//              between them.

export const KINDS = ['straight', 'quadratic', 'catmull'];

/** Two decimals: a hundredth of a pixel on a 24px canvas is already nothing. */
export const round = (n) => Math.round(n * 100) / 100;

/** The nearest step of the grid, or the value itself when the step is 0. */
export const snap = (value, step) => (step > 0 ? round(Math.round(value / step) * step) : round(value));

const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export const midpoint = (a, b) => lerp(a, b, 0.5);

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// --- what a point is ---------------------------------------------------------

/** Only a quadratic has points that are off the line. */
export const isControl = (line, index) => line.kind === 'quadratic' && index % 2 === 1;

/** How many points are on the line itself. */
export function anchorCount(line) {
  if (line.kind !== 'quadratic') return line.points.length;
  return Math.ceil(line.points.length / 2);
}

/** The fewest points a line of this kind can be drawn from. */
export const minPoints = (kind) => (kind === 'quadratic' ? 3 : 2);

/**
 * Can this be kept? A straight or Catmull-Rom line needs two points. An open
 * quadratic is odd — it ends on an anchor — and a closed one even, since the
 * run home has a control of its own.
 */
export function isDrawable(line) {
  const n = line.points.length;
  if (line.kind !== 'quadratic') return n >= (line.closed ? 3 : 2);
  return line.closed ? n >= 4 && n % 2 === 0 : n >= 3 && n % 2 === 1;
}

// --- segments ------------------------------------------------------------------

/**
 * The line as the runs it is drawn in, each `{ type, from, to }` with whatever
 * handles its type takes: none for L, `control` for Q, `c1` and `c2` for C. One
 * description serves the path and the hit test, so the two cannot disagree
 * about where the line is.
 */
export function segmentsOf(line) {
  const { kind, points, closed } = line;
  const n = points.length;
  if (n < 2) return [];

  if (kind === 'quadratic') {
    const segments = [];
    for (let i = 0; i + 1 < n; i += 2) {
      const to = points[i + 2] ?? (closed ? points[0] : null);
      if (!to) break; // a control with nowhere to go: a draft, mid-click
      segments.push({ type: 'Q', from: points[i], control: points[i + 1], to });
    }
    return segments;
  }

  const runs = closed ? n : n - 1;

  if (kind === 'catmull') {
    // Open, the ends stand in for the neighbours they do not have, which lets
    // the curve leave and arrive along its own first and last runs.
    const at = (i) => (closed ? points[(i + n) % n] : points[Math.min(n - 1, Math.max(0, i))]);
    return Array.from({ length: runs }, (_, i) => {
      const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      // A sixth of the way along its neighbours' run is the Catmull-Rom handle,
      // written as the cubic Bézier an SVG path can hold.
      return {
        type: 'C',
        from: p1,
        c1: { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
        c2: { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
        to: p2,
      };
    });
  }

  return Array.from({ length: runs }, (_, i) => ({
    type: 'L',
    from: points[i],
    to: points[(i + 1) % n],
  }));
}

/** Where a segment is, `t` of the way along it. */
export function pointAt(segment, t) {
  if (segment.type === 'Q') {
    return lerp(lerp(segment.from, segment.control, t), lerp(segment.control, segment.to, t), t);
  }
  if (segment.type === 'C') {
    const a = lerp(segment.from, segment.c1, t);
    const b = lerp(segment.c1, segment.c2, t);
    const c = lerp(segment.c2, segment.to, t);
    return lerp(lerp(a, b, t), lerp(b, c, t), t);
  }
  return lerp(segment.from, segment.to, t);
}

const at = (point) => `${round(point.x)} ${round(point.y)}`;

/** The `d` of the path a line draws, or '' for one with nothing to draw yet. */
export function linePath(line) {
  const segments = segmentsOf(line);
  if (segments.length === 0) return '';

  let d = `M ${at(segments[0].from)}`;
  segments.forEach((segment, i) => {
    // The run home on a closed straight line is Z's to draw, so the corner it
    // ends on is joined rather than capped.
    if (segment.type === 'L' && line.closed && i === segments.length - 1) return;
    if (segment.type === 'Q') d += ` Q ${at(segment.control)} ${at(segment.to)}`;
    else if (segment.type === 'C') d += ` C ${at(segment.c1)} ${at(segment.c2)} ${at(segment.to)}`;
    else d += ` L ${at(segment.to)}`;
  });
  return line.closed ? `${d} Z` : d;
}

// --- finding things --------------------------------------------------------------

/* How finely a curve is walked when looking for the spot nearest the pointer. */
const SAMPLES = 32;

/**
 * The spot on a line nearest (x, y): which segment, how far along it, how far
 * off, and where. What a shift-click needs to drop a bend in the right place.
 */
export function nearestOnLine(line, x, y) {
  let best = { segment: -1, t: 0, distance: Infinity, point: null };
  segmentsOf(line).forEach((segment, index) => {
    for (let step = 0; step <= SAMPLES; step++) {
      const t = step / SAMPLES;
      const point = pointAt(segment, t);
      const d = Math.hypot(point.x - x, point.y - y);
      if (d < best.distance) best = { segment: index, t, distance: d, point };
    }
  });
  return best;
}

/** The corners of the box around every point of a line, controls included. */
export function boundsOf(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// --- changing a line ---------------------------------------------------------------

/** Every point moved by the same amount. */
export const translate = (points, dx, dy) =>
  points.map((p) => ({ x: round(p.x + dx), y: round(p.y + dy) }));

/**
 * A new bend, `t` of the way along one segment. Answers with the new points
 * and the index the bend landed at. A quadratic is split exactly, so the line
 * does not move under the pointer; a Catmull-Rom line takes the point where the
 * curve already ran, and gives a little either side of it.
 */
export function insertPoint(line, segmentIndex, t) {
  const segment = segmentsOf(line)[segmentIndex];
  if (!segment) return null;
  const points = [...line.points];

  if (line.kind === 'quadratic') {
    const c1 = lerp(segment.from, segment.control, t);
    const c2 = lerp(segment.control, segment.to, t);
    const middle = lerp(c1, c2, t);
    points.splice(segmentIndex * 2 + 1, 1, tidy(c1), tidy(middle), tidy(c2));
    return { points, index: segmentIndex * 2 + 2 };
  }

  points.splice(segmentIndex + 1, 0, tidy(pointAt(segment, t)));
  return { points, index: segmentIndex + 1 };
}

const tidy = (point) => ({ x: round(point.x), y: round(point.y) });

/**
 * The points left when one is taken out, or null when the line could not be
 * drawn from what is left. Taking a quadratic's anchor out joins the two runs
 * that met there, and the anchor stays on as the control of the joined run —
 * the curve keeps leaning the way it did. Taking a control out only puts it
 * back on the chord, which straightens its run.
 */
export function removePoint(line, index) {
  const { kind, points, closed } = line;
  const n = points.length;
  if (index < 0 || index >= n) return null;

  if (kind !== 'quadratic') {
    const left = points.filter((_, i) => i !== index);
    return isDrawable({ kind, closed, points: left }) ? left : null;
  }

  if (index % 2 === 1) {
    const to = points[index + 1] ?? points[0];
    return points.map((p, i) => (i === index ? tidy(midpoint(points[index - 1], to)) : p));
  }

  let left;
  if (closed && index === 0) {
    // a0 c0 a1 … an cn: the run an → a1 takes a0 as its control.
    left = [...points.slice(2, n - 1), points[0]];
  } else if (index === 0) {
    left = points.slice(2);
  } else if (!closed && index === n - 1) {
    left = points.slice(0, n - 2);
  } else {
    left = [...points.slice(0, index - 1), points[index], ...points.slice(index + 2)];
  }
  return isDrawable({ kind, closed, points: left }) ? left : null;
}

// --- free-hand ----------------------------------------------------------------------

/**
 * How much of a free-hand stroke is kept, as the furthest a dropped point may
 * lie from the line drawn without it, in canvas pixels. A hand on a 24px canvas
 * wobbles by a few tenths, so that is the scale the steps run over.
 */
export const SMOOTHING = Object.freeze({ none: 0, min: 0.1, normal: 0.25, max: 0.5 });
export const SMOOTHING_LEVELS = Object.keys(SMOOTHING);

/* A stroke let go this near where it began was meant to be a closed shape. */
const CLOSE_WITHIN = 1;
/* Two samples nearer than this are one sample: a pen held still sends dozens. */
const SAME_SPOT = 0.02;

/** How far a point lies from the run between two others. */
function offRun(point, a, b) {
  const runX = b.x - a.x;
  const runY = b.y - a.y;
  const length = runX * runX + runY * runY;
  const t = length === 0 ? 0 : clampUnit(((point.x - a.x) * runX + (point.y - a.y) * runY) / length);
  return Math.hypot(a.x + runX * t - point.x, a.y + runY * t - point.y);
}

const clampUnit = (t) => Math.max(0, Math.min(1, t));

/**
 * Ramer-Douglas-Peucker: keep the ends, keep the point furthest off the run
 * between them if it is further off than `tolerance`, and ask the same of the
 * two halves. What is left is the fewest points that still say what was drawn.
 * Walked with a stack rather than by recursion, since a slow stroke is
 * thousands of samples long.
 */
export function simplify(points, tolerance) {
  if (points.length <= 2 || tolerance <= 0) return [...points];

  const keep = new Array(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const spans = [[0, points.length - 1]];
  while (spans.length > 0) {
    const [first, last] = spans.pop();
    let furthest = -1;
    let reach = tolerance;
    for (let i = first + 1; i < last; i++) {
      const d = offRun(points[i], points[first], points[last]);
      if (d > reach) {
        furthest = i;
        reach = d;
      }
    }
    if (furthest < 0) continue;
    keep[furthest] = true;
    spans.push([first, furthest], [furthest, last]);
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * The line a free-hand stroke becomes when it is let go, or null for a stroke
 * too short to be one. With no smoothing it is the samples themselves, joined
 * straight; otherwise the stroke is thinned and a Catmull-Rom curve run through
 * what is left — so what was drawn by hand is an ordinary line afterwards, with
 * bends to drag like any other.
 */
export function strokeToLine(samples, level = 'normal') {
  const spaced = samples.filter((point, i) => i === 0 || distance(point, samples[i - 1]) > SAME_SPOT);
  if (spaced.length < 2) return null;

  const tolerance = SMOOTHING[level] ?? SMOOTHING.normal;
  let points = simplify(spaced, tolerance).map(tidy);

  const closed = points.length > 3 && distance(points[0], points[points.length - 1]) <= CLOSE_WITHIN;
  if (closed) points = points.slice(0, -1);

  return { kind: tolerance > 0 ? 'catmull' : 'straight', points, closed };
}

/**
 * The points of a line once it is joined up or cut open. Only a quadratic's
 * change: the run home needs a control, which starts on the chord, and an
 * opened line has no run home to keep one for.
 */
export function pointsWhenClosed(line, closed) {
  const { kind, points } = line;
  if (kind !== 'quadratic' || closed === Boolean(line.closed)) return [...points];
  return closed
    ? [...points, tidy(midpoint(points[points.length - 1], points[0]))]
    : points.slice(0, -1);
}
