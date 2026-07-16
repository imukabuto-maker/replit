import { Point, Path } from '../types';

function perpDistance(pt: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(pt.x - a.x, pt.y - a.y);
  const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
  const nx = a.x + t * dx;
  const ny = a.y + t * dy;
  return Math.hypot(pt.x - nx, pt.y - ny);
}

/**
 * Ramer-Douglas-Peucker path simplification.
 * epsilon is in the same units as the path coordinates.
 */
export function rdpSimplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDistance(points[i], first, last);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left  = rdpSimplify(points.slice(0, maxIdx + 1), epsilon);
    const right = rdpSimplify(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/**
 * Convert a simplified polyline to a smooth SVG path string using
 * Catmull-Rom → cubic bezier conversion.
 *
 * Each span P[i]→P[i+1] becomes a cubic bezier whose control points are:
 *   CP1 = P[i]  + (P[i+1] - P[i-1]) * tension / 6
 *   CP2 = P[i+1] - (P[i+2] - P[i]) * tension / 6
 * where missing endpoints are mirrored (open path) or wrapped (closed path).
 */
export function smoothPathToSvg(points: Point[], closed: boolean, tension = 1): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${fmt(points[0].x)},${fmt(points[0].y)}`;
  if (points.length === 2) {
    return `M ${fmt(points[0].x)},${fmt(points[0].y)} L ${fmt(points[1].x)},${fmt(points[1].y)}`;
  }

  const n = points.length;

  function pt(i: number): Point {
    if (closed) {
      return points[((i % n) + n) % n];
    }
    if (i < 0) {
      const p0 = points[0], p1 = points[1];
      return { x: 2 * p0.x - p1.x, y: 2 * p0.y - p1.y };
    }
    if (i >= n) {
      const pn = points[n - 1], pn1 = points[n - 2];
      return { x: 2 * pn.x - pn1.x, y: 2 * pn.y - pn1.y };
    }
    return points[i];
  }

  const segments: string[] = [];
  const end = closed ? n : n - 1;

  for (let i = 0; i < end; i++) {
    const p0 = pt(i - 1);
    const p1 = pt(i);
    const p2 = pt(i + 1);
    const p3 = pt(i + 2);

    const cp1x = p1.x + (p2.x - p0.x) * tension / 6;
    const cp1y = p1.y + (p2.y - p0.y) * tension / 6;
    const cp2x = p2.x - (p3.x - p1.x) * tension / 6;
    const cp2y = p2.y - (p3.y - p1.y) * tension / 6;

    segments.push(`C ${fmt(cp1x)},${fmt(cp1y)} ${fmt(cp2x)},${fmt(cp2y)} ${fmt(p2.x)},${fmt(p2.y)}`);
  }

  const start = points[0];
  const d = `M ${fmt(start.x)},${fmt(start.y)} ${segments.join(' ')}${closed ? ' Z' : ''}`;
  return d;
}

function fmt(v: number): string { return v.toFixed(4); }

/**
 * Full pipeline: simplify then smooth a path.
 * epsilon is in path coordinate units (e.g. mm for exported panels, normalized for wall).
 */
export function simplifyAndSmooth(points: Point[], epsilon: number, closed = false): string {
  const simplified = rdpSimplify(points, epsilon);
  return smoothPathToSvg(simplified, closed);
}
