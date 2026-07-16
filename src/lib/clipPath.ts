import { Point } from '../types';

const INSIDE = 0, LEFT = 1, RIGHT = 2, BOTTOM = 4, TOP = 8;

function outcode(p: Point, x0: number, x1: number, y0: number, y1: number): number {
  let c = INSIDE;
  if (p.x < x0) c |= LEFT;
  else if (p.x > x1) c |= RIGHT;
  if (p.y < y0) c |= BOTTOM;
  else if (p.y > y1) c |= TOP;
  return c;
}

function clip(a: Point, b: Point, c: number, x0: number, x1: number, y0: number, y1: number): Point {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (c & LEFT)   return { x: x0, y: a.y + dy * (x0 - a.x) / dx };
  if (c & RIGHT)  return { x: x1, y: a.y + dy * (x1 - a.x) / dx };
  if (c & BOTTOM) return { x: a.x + dx * (y0 - a.y) / dy, y: y0 };
  /* TOP */       return { x: a.x + dx * (y1 - a.y) / dy, y: y1 };
}

/**
 * Cohen-Sutherland segment clipping.
 * Returns null if entirely outside; otherwise [clippedA, clippedB].
 */
function clipSegment(
  a: Point, b: Point,
  x0: number, x1: number, y0: number, y1: number
): [Point, Point] | null {
  let ca = outcode(a, x0, x1, y0, y1);
  let cb = outcode(b, x0, x1, y0, y1);
  while (true) {
    if (!(ca | cb)) return [a, b];          // both inside
    if (ca & cb)   return null;             // both outside same edge
    const c = ca !== INSIDE ? ca : cb;
    const pt = clip(a, b, c, x0, x1, y0, y1);
    if (c === ca) { a = pt; ca = outcode(a, x0, x1, y0, y1); }
    else          { b = pt; cb = outcode(b, x0, x1, y0, y1); }
  }
}

/**
 * Clip an open polyline to the rectangle [x0,x1] × [y0,y1].
 * Returns zero or more sub-paths, each fully inside the rectangle.
 */
export function clipPathToRect(
  path: Point[],
  x0: number, x1: number,
  y0: number, y1: number,
): Point[][] {
  if (path.length < 2) return [];

  const result: Point[][] = [];
  let cur: Point[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const seg = clipSegment(path[i], path[i + 1], x0, x1, y0, y1);

    if (seg === null) {
      // Segment fully outside — break current sub-path
      if (cur.length >= 2) result.push(cur);
      cur = [];
      continue;
    }

    const [a, b] = seg;

    if (cur.length === 0) {
      cur.push(a, b);
    } else {
      const last = cur[cur.length - 1];
      // If the clipped start drifted from our last point, we have a gap
      if (Math.hypot(a.x - last.x, a.y - last.y) > 0.02) {
        if (cur.length >= 2) result.push(cur);
        cur = [a, b];
      } else {
        cur.push(b);
      }
    }
  }

  if (cur.length >= 2) result.push(cur);
  return result;
}
