import { PanelData, Path } from '../types';
import { rdpSimplify } from './pathUtils';

const RDP_EPSILON = 0.4; // mm — controls DXF/PDF path simplification
const OUTLINE_WIDTH = 0.2; // mm stroke
const CUT_WIDTH = 0.1;     // mm stroke
const GAP = 0;             // zero gap — panels touch (common-line cutting)

function parseSvgPathToPoints(d: string): Path {
  const points: Path = [];
  let cx = 0, cy = 0;
  const tokens = d.match(/[MmLlHhVvZz][^MmLlHhVvZz]*/g) ?? [];
  for (const tok of tokens) {
    const type = tok[0];
    const nums = tok.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
    switch (type) {
      case 'M': case 'm':
        for (let i = 0; i + 1 < nums.length; i += 2) {
          cx = type === 'M' ? nums[i] : cx + nums[i];
          cy = type === 'M' ? nums[i + 1] : cy + nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case 'L': case 'l':
        for (let i = 0; i + 1 < nums.length; i += 2) {
          cx = type === 'L' ? nums[i] : cx + nums[i];
          cy = type === 'L' ? nums[i + 1] : cy + nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case 'H': case 'h': cx = type === 'H' ? nums[0] : cx + nums[0]; points.push({ x: cx, y: cy }); break;
      case 'V': case 'v': cy = type === 'V' ? nums[0] : cy + nums[0]; points.push({ x: cx, y: cy }); break;
    }
  }
  return points;
}

function polyline(doc: any, pts: Path, offsetX: number, closed: boolean) {
  if (pts.length < 2) return;
  const deltas = pts.slice(1).map((pt, i) => [pt.x - pts[i].x, pt.y - pts[i].y]);
  doc.lines(deltas, pts[0].x + offsetX, pts[0].y, [1, 1], 'S', closed);
}

export async function exportPDF(panels: PanelData[]): Promise<void> {
  const { default: jsPDF } = await import('jspdf');

  const totalW = panels.reduce((s, p) => s + p.widthMm + GAP, 0);
  const maxH   = panels.reduce((m, p) => Math.max(m, p.heightMm), 0);

  const doc = new (jsPDF as any)({
    unit: 'mm',
    format: [totalW, maxH],
    compress: false,
  });

  let offsetX = 0;

  for (const p of panels) {
    // — Outline (black) —
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(OUTLINE_WIDTH);
    const outlinePts = parseSvgPathToPoints(p.outlinePath);
    if (outlinePts.length >= 2) {
      polyline(doc, outlinePts, offsetX, true);
    } else {
      doc.rect(offsetX, 0, p.widthMm, p.heightMm, 'S');
    }

    // — Cut paths (red) —
    // Top and Bottom are mirrored horizontally so the silhouette reads correctly
    // once the panel is flipped into its assembled position.
    const shouldMirror = p.panel === 'top' || p.panel === 'bottom';
    doc.setDrawColor(255, 0, 0);
    doc.setLineWidth(CUT_WIDTH);
    for (const seg of p.rawCutPaths) {
      if (seg.length < 2) continue;
      const simplified = seg.length > 3 ? rdpSimplify(seg, RDP_EPSILON) : seg;
      if (simplified.length < 2) continue;
      const pts = shouldMirror
        ? simplified.map(pt => ({ x: p.widthMm - pt.x, y: pt.y }))
        : simplified;
      polyline(doc, pts, offsetX, false);
    }

    offsetX += p.widthMm + GAP;
  }

  doc.save('shadow-box-panels.pdf');
}
