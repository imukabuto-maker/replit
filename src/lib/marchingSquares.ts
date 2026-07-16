import { Path, Point } from '../types';

type Segment = { p1: Point; p2: Point };

const TABLE: Record<number, Array<[number, number][]>> = {
  0:  [[]],
  1:  [[[3, 0]]],
  2:  [[[0, 1]]],
  3:  [[[3, 1]]],
  4:  [[[1, 2]]],
  5:  [[[3, 2], [0, 1]], [[3, 0], [1, 2]]],
  6:  [[[0, 2]]],
  7:  [[[3, 2]]],
  8:  [[[2, 3]]],
  9:  [[[2, 0]]],
  10: [[[2, 1], [3, 0]], [[2, 3], [0, 1]]],
  11: [[[2, 1]]],
  12: [[[1, 3]]],
  13: [[[1, 0]]],
  14: [[[0, 3]]],
  15: [[]],
};

export function marchingSquares(binaryData: Uint8ClampedArray): Path[] {
  const width  = (binaryData as any).width  as number;
  const height = (binaryData as any).height as number;
  if (!width || !height) return [];

  const pxFloat = (x: number, y: number): number => {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return binaryData[y * width + x] > 0 ? 1 : 0;
  };

  function lerp(a: number, b: number): number {
    if (Math.abs(b - a) < 1e-6) return 0.5;
    return (0.5 - a) / (b - a);
  }

  const segments: Segment[] = [];

  for (let y = -1; y < height; y++) {
    for (let x = -1; x < width; x++) {
      const bl = pxFloat(x,     y + 1);
      const br = pxFloat(x + 1, y + 1);
      const tr = pxFloat(x + 1, y);
      const tl = pxFloat(x,     y);

      const caseIdx = ((tl > 0 ? 1 : 0) << 3) |
                      ((tr > 0 ? 1 : 0) << 2) |
                      ((br > 0 ? 1 : 0) << 1) |
                       (bl > 0 ? 1 : 0);

      const variants = TABLE[caseIdx];
      if (!variants) continue;

      let edgePairs: Array<[number, number]>;
      if (variants.length === 1) {
        edgePairs = variants[0];
      } else {
        const avg = (bl + br + tr + tl) / 4;
        edgePairs = avg >= 0.5 ? variants[0] : variants[1];
      }

      const getPt = (edgeIdx: number): Point => {
        switch (edgeIdx) {
          case 0: { const t = lerp(bl, br); return { x: x + t, y: y + 1 }; }
          case 1: { const t = lerp(br, tr); return { x: x + 1, y: y + 1 - t }; }
          case 2: { const t = lerp(tl, tr); return { x: x + t, y: y }; }
          case 3: { const t = lerp(bl, tl); return { x: x, y: y + 1 - t }; }
          default: return { x, y };
        }
      };

      for (const [e1, e2] of edgePairs) {
        segments.push({ p1: getPt(e1), p2: getPt(e2) });
      }
    }
  }

  if (segments.length === 0) return [];

  const fmt = (p: Point) => `${(p.x * 4).toFixed(0)},${(p.y * 4).toFixed(0)}`;

  const adj = new Map<string, number[]>();
  segments.forEach((seg, idx) => {
    const k1 = fmt(seg.p1);
    const k2 = fmt(seg.p2);
    if (!adj.has(k1)) adj.set(k1, []);
    if (!adj.has(k2)) adj.set(k2, []);
    adj.get(k1)!.push(idx);
    adj.get(k2)!.push(idx);
  });

  const used = new Uint8Array(segments.length);
  const paths: Path[] = [];

  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;

    const chain: Point[] = [{ ...segments[start].p1 }, { ...segments[start].p2 }];
    used[start] = 1;

    let head = segments[start].p2;
    outer: while (true) {
      const neighbours = adj.get(fmt(head)) ?? [];
      for (const ni of neighbours) {
        if (used[ni]) continue;
        used[ni] = 1;
        const seg = segments[ni];
        const k1 = fmt(seg.p1);
        const kHead = fmt(head);
        if (k1 === kHead) { head = seg.p2; chain.push({ ...head }); }
        else { head = seg.p1; chain.push({ ...head }); }
        continue outer;
      }
      break;
    }

    let tail = segments[start].p1;
    outer2: while (true) {
      const neighbours = adj.get(fmt(tail)) ?? [];
      for (const ni of neighbours) {
        if (used[ni]) continue;
        used[ni] = 1;
        const seg = segments[ni];
        const k1 = fmt(seg.p1);
        const kTail = fmt(tail);
        if (k1 === kTail) { tail = seg.p2; chain.unshift({ ...tail }); }
        else { tail = seg.p1; chain.unshift({ ...tail }); }
        continue outer2;
      }
      break;
    }

    const normalized: Path = chain.map(p => ({ x: p.x / width, y: p.y / height }));
    if (normalized.length >= 2) paths.push(normalized);
  }

  return paths;
}
