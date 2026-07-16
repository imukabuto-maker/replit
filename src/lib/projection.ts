import { BoxConfig, Panel, Path, Point, Point3D } from '../types';

export const SHADOW_SCALE = 2.5;

export function contourPointToWall(p: Point, config: BoxConfig): Point3D {
  return {
    x: (p.x - 0.5) * config.width  * SHADOW_SCALE,
    y: (0.5 - p.y) * config.height * SHADOW_SCALE,
    z: 0
  };
}

export function projectPointOntoPanel(
  wallPt: Point3D,
  panel: Panel,
  config: BoxConfig
): Point | null {
  const Lx = config.ledX;
  const Ly = config.ledY;
  const Lz = config.ledZ;

  const Dx = wallPt.x - Lx;
  const Dy = wallPt.y - Ly;

  let t: number;

  switch (panel) {
    case 'top':
      if (Math.abs(Dy) < 1e-10) return null;
      t = (config.height / 2 - Ly) / Dy;
      break;
    case 'bottom':
      if (Math.abs(Dy) < 1e-10) return null;
      t = (-config.height / 2 - Ly) / Dy;
      break;
    case 'left':
      if (Math.abs(Dx) < 1e-10) return null;
      t = (-config.width / 2 - Lx) / Dx;
      break;
    case 'right':
      if (Math.abs(Dx) < 1e-10) return null;
      t = (config.width / 2 - Lx) / Dx;
      break;
    default:
      return null;
  }

  if (t <= 0 || t >= 1) return null;

  const ix = Lx + t * Dx;
  const iy = Ly + t * Dy;
  const iz = Lz * (1 - t);

  if (iz < 0 || iz > config.ledZ) return null;
  if (iz > config.depth) return null;

  if (panel === 'top' || panel === 'bottom') {
    if (ix < -config.width / 2 || ix > config.width / 2) return null;
    return { x: ix, y: iz };
  } else {
    if (iy < -config.height / 2 || iy > config.height / 2) return null;
    return { x: iy, y: iz };
  }
}

function projectSegmentOntoPanel(
  w1: Point3D,
  w2: Point3D,
  panel: Panel,
  config: BoxConfig,
): Path[] {
  // Adaptive subdivision: large segments need more steps for accuracy,
  // tiny marchingSquares segments (1-2px) need only 2 steps.
  const segLen = Math.hypot(w2.x - w1.x, w2.y - w1.y);
  const steps  = Math.max(2, Math.min(32, Math.ceil(segLen * 80)));

  const result: Path[] = [];
  let current: Path = [];

  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const pt: Point3D = {
      x: w1.x + (w2.x - w1.x) * f,
      y: w1.y + (w2.y - w1.y) * f,
      z: 0
    };
    const proj = projectPointOntoPanel(pt, panel, config);
    if (proj) {
      current.push(proj);
    } else {
      if (current.length >= 2) result.push([...current]);
      current = [];
    }
  }
  if (current.length >= 2) result.push(current);
  return result;
}

export function projectPathOntoPanel(
  path: Path,
  panel: Panel,
  config: BoxConfig
): Path[] {
  if (path.length < 2) return [];

  const allSegments: Path[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const w1 = contourPointToWall(path[i], config);
    const w2 = contourPointToWall(path[i + 1], config);
    allSegments.push(...projectSegmentOntoPanel(w1, w2, panel, config));
  }

  if (allSegments.length === 0) return [];

  const merged: Path[] = [allSegments[0]];
  for (let i = 1; i < allSegments.length; i++) {
    const prev = merged[merged.length - 1];
    const cur  = allSegments[i];
    const last = prev[prev.length - 1];
    const first = cur[0];
    if (Math.hypot(last.x - first.x, last.y - first.y) < 0.5) {
      prev.push(...cur.slice(1));
    } else {
      merged.push(cur);
    }
  }
  return merged;
}

export function backProjectToWall(
  panelPath: Path,
  panel: Panel,
  config: BoxConfig
): Path {
  const Lx = config.ledX;
  const Ly = config.ledY;
  const Lz = config.ledZ;

  return panelPath.map(pt => {
    let Px: number, Py: number;
    const Pz = pt.y;

    switch (panel) {
      case 'top':    Px = pt.x; Py =  config.height / 2; break;
      case 'bottom': Px = pt.x; Py = -config.height / 2; break;
      case 'left':   Px = -config.width / 2; Py = pt.x;  break;
      case 'right':  Px =  config.width / 2; Py = pt.x;  break;
      default: return { x: 0, y: 0 };
    }

    const dz = Pz - Lz;
    if (Math.abs(dz) < 1e-10) {
      return { x: Lx + (Px - Lx) * 1e4, y: Ly + (Py - Ly) * 1e4 };
    }

    const t = -Lz / dz;
    return {
      x: Lx + t * (Px - Lx),
      y: Ly + t * (Py - Ly),
    };
  });
}
