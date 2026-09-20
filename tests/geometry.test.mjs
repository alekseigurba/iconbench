// Headless checks for the line maths and the colour arithmetic: the invariants
// that are painful to eyeball in a browser.
//   node tests/geometry.test.mjs

import * as geo from '../app/js/geometry.js';
import { readHex, toHex, toHsv } from '../app/js/color.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) console.log(`  ok  ${label}`);
  else { failures++; console.log(`FAIL  ${label} ${detail}`); }
};

const p = (x, y) => ({ x, y });
const near = (a, b, within = 0.011) => Math.abs(a - b) <= within;
const samePoint = (a, b, within) => near(a.x, b.x, within) && near(a.y, b.y, within);

// --- paths ---
const corner = { kind: 'straight', points: [p(2, 2), p(12, 2), p(12, 12)], closed: false };
check('a straight line is drawn corner to corner', geo.linePath(corner) === 'M 2 2 L 12 2 L 12 12');
check('a closed straight line leaves the run home to Z',
  geo.linePath({ ...corner, closed: true }) === 'M 2 2 L 12 2 L 12 12 Z');

const arc = { kind: 'quadratic', points: [p(2, 12), p(12, 2), p(22, 12)], closed: false };
check('a quadratic names its control, then where it lands', geo.linePath(arc) === 'M 2 12 Q 12 2 22 12');
check('a draft with a control and nowhere to go yet draws what it has',
  geo.linePath({ ...arc, points: [...arc.points, p(22, 20)] }) === 'M 2 12 Q 12 2 22 12');

const lens = { kind: 'quadratic', points: [p(2, 12), p(12, 2), p(22, 12), p(12, 22)], closed: true };
check('a closed quadratic runs home through its last control',
  geo.linePath(lens) === 'M 2 12 Q 12 2 22 12 Q 12 22 2 12 Z');

const wave = { kind: 'catmull', points: [p(2, 12), p(8, 4), p(16, 20), p(22, 12)], closed: false };
const waveSegments = geo.segmentsOf(wave);
check('a Catmull-Rom line has a run between each pair of points', waveSegments.length === 3);
check('and every run starts and ends on a point of the line',
  waveSegments.every((s, i) => s.from === wave.points[i] && s.to === wave.points[i + 1]));
check('it is smooth across a point: the handles either side of it line up', (() => {
  const before = waveSegments[0].c2;
  const after = waveSegments[1].c1;
  const at = wave.points[1];
  return near(at.x - before.x, after.x - at.x) && near(at.y - before.y, after.y - at.y);
})());
check('closed, it has a run home as well', geo.segmentsOf({ ...wave, closed: true }).length === 4);
check('a line of one point draws nothing', geo.linePath({ kind: 'catmull', points: [p(1, 1)], closed: false }) === '');

// --- what can be kept ---
check('two points make a straight line', geo.isDrawable({ kind: 'straight', points: [p(0, 0), p(1, 1)], closed: false }));
check('but not a closed one', !geo.isDrawable({ kind: 'straight', points: [p(0, 0), p(1, 1)], closed: true }));
check('an open quadratic ends on an anchor', geo.isDrawable(arc) && !geo.isDrawable({ ...arc, points: arc.points.slice(0, 2) }));
check('a closed quadratic ends on the control of its run home', geo.isDrawable(lens) && !geo.isDrawable({ ...lens, closed: false }));

// --- finding the spot under the pointer ---
const spot = geo.nearestOnLine(corner, 7, 3);
check('the nearest spot on a line names its segment', spot.segment === 0 && near(spot.distance, 1, 0.2));
const top = geo.nearestOnLine(arc, 12, 0);
check('on a curve it is found on the curve, not on the chord', near(top.point.y, 7, 0.2) && near(top.t, 0.5, 0.05));

// --- adding and removing bends ---
const bent = geo.insertPoint(corner, 1, 0.5);
check('a bend added to a straight line lands on it', samePoint(bent.points[bent.index], p(12, 7)) && bent.points.length === 4);

const split = geo.insertPoint(arc, 0, 0.5);
check('a bend added to a quadratic is an anchor with a control either side', split.points.length === 5 && split.index === 2);
check('and the curve does not move under it', (() => {
  const whole = geo.segmentsOf(arc)[0];
  const halves = geo.segmentsOf({ ...arc, points: split.points });
  return [0.1, 0.3, 0.5].every((t) => samePoint(geo.pointAt(whole, t / 2), geo.pointAt(halves[0], t), 0.02))
    && [0.2, 0.6, 0.9].every((t) => samePoint(geo.pointAt(whole, 0.5 + t / 2), geo.pointAt(halves[1], t), 0.02));
})());

const closedSplit = geo.insertPoint(lens, 1, 0.5);
check('splitting the run home keeps a closed quadratic closed and even',
  geo.isDrawable({ ...lens, points: closedSplit.points }) && closedSplit.points.length === 6);

check('a bend comes out of a straight line', geo.removePoint(corner, 1).length === 2);
check('but not the last two', geo.removePoint({ ...corner, points: corner.points.slice(0, 2) }, 0) === null);

const twoArcs = { kind: 'quadratic', points: [p(0, 0), p(2, 4), p(4, 0), p(6, -4), p(8, 0)], closed: false };
const joined = geo.removePoint(twoArcs, 2);
check('taking out a quadratic anchor joins its runs, with the anchor left as the control',
  joined.length === 3 && samePoint(joined[1], p(4, 0)));
check('taking out an end takes its control with it', geo.removePoint(twoArcs, 0).length === 3 && geo.removePoint(twoArcs, 4).length === 3);
check('taking out a control straightens its run', samePoint(geo.removePoint(twoArcs, 1)[1], p(2, 0)));
check('a single arc keeps both its ends', geo.removePoint(arc, 0) === null);

const ring = { kind: 'quadratic', points: [p(0, 0), p(1, 1), p(2, 0), p(3, 1), p(4, 0), p(2, -3)], closed: true };
const smaller = geo.removePoint(ring, 0);
check('a closed quadratic can lose its first anchor and stay closed',
  smaller.length === 4 && geo.isDrawable({ ...ring, points: smaller }) && samePoint(smaller[3], p(0, 0)));

// --- closing and opening ---
const shut = geo.pointsWhenClosed(arc, true);
check('closing a quadratic gives the run home a control on the chord', shut.length === 4 && samePoint(shut[3], p(12, 12)));
check('and opening it takes that control away', geo.pointsWhenClosed({ ...arc, points: shut, closed: true }, false).length === 3);
check('the other kinds keep their points either way', geo.pointsWhenClosed(wave, true).length === 4);

// --- the grid ---
check('a point lands on the nearest half pixel', geo.snap(3.26, 0.5) === 3.5 && geo.snap(3.24, 0.5) === 3);
check('and is left alone, but tidy, with no grid', geo.snap(3.2449, 0) === 3.24);
check('moving a line moves every point', samePoint(geo.translate(corner.points, 1, -1)[2], p(13, 11)));

// --- free-hand ---
const wobbly = Array.from({ length: 101 }, (_, i) => p(2 + i * 0.2, 12 + Math.sin(i) * 0.04));
check('a wobbly straight stroke thins to its two ends', geo.simplify(wobbly, geo.SMOOTHING.normal).length === 2);
check('with no tolerance nothing is dropped', geo.simplify(wobbly, 0).length === wobbly.length);

const hook = [...Array.from({ length: 50 }, (_, i) => p(2 + i * 0.2, 4)), ...Array.from({ length: 50 }, (_, i) => p(12, 4 + i * 0.2))];
const thinned = geo.simplify(hook, geo.SMOOTHING.min);
check('a corner in a stroke survives thinning', thinned.length === 3 && samePoint(thinned[1], p(12, 4), 0.21));

const counts = geo.SMOOTHING_LEVELS.map((level) => {
  const stroke = Array.from({ length: 200 }, (_, i) => p(2 + i * 0.1, 12 + Math.sin(i / 12) * 4 + Math.sin(i * 1.7) * 0.12));
  return geo.strokeToLine(stroke, level).points.length;
});
check('each smoothing level keeps fewer points than the one before',
  counts.every((count, i) => i === 0 || count < counts[i - 1]), JSON.stringify(counts));
check('an unsmoothed stroke is joined straight, a smoothed one is a Catmull-Rom line',
  geo.strokeToLine(wobbly, 'none').kind === 'straight' && geo.strokeToLine(wobbly, 'max').kind === 'catmull');

const loop = Array.from({ length: 60 }, (_, i) => p(12 + 8 * Math.cos(i / 9.4), 12 + 8 * Math.sin(i / 9.4)));
const circle = geo.strokeToLine(loop, 'normal');
check('a stroke let go where it began is a closed shape', circle.closed && geo.isDrawable(circle));
check('a pen held still is not a line', geo.strokeToLine([p(5, 5), p(5.001, 5), p(5, 5.001)], 'none') === null);

// --- colour ---
check('a hex is read short, long, and without its #',
  readHex('#ABC') === '#aabbcc' && readHex('527a42') === '#527a42' && readHex('nope') === null);
check('a colour survives the trip through the picker and back',
  ['#527a42', '#000000', '#ffffff', '#fede49', '#0071e3'].every((hex) => toHex(toHsv(hex)) === hex));

if (failures > 0) {
  console.log(`\n${failures} check${failures === 1 ? '' : 's'} failed.`);
  process.exit(1);
}
console.log('\nGeometry holds.');
