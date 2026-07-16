import { marchingSquares } from '../lib/marchingSquares';
import { projectPathOntoPanel, backProjectToWall, SHADOW_SCALE } from '../lib/projection';
import { buildPanelBoundary } from '../lib/fingerJoints';
import { pathsToSvgData } from '../lib/svgExport';
import { splitForBridging } from '../lib/bridges';
import { clipPathToRect } from '../lib/clipPath';
import type { BoxConfig, PanelData, Path, Point } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────

export type WorkerRequest =
  | { type: 'generate'; binaryData: Uint8ClampedArray; width: number; height: number; config: BoxConfig; gen: number }
  | { type: 'panels';   contours:   Path[];                                           config: BoxConfig; gen: number };

export type WorkerResponse =
  | { type: 'contours'; contours: Path[];      gen: number }
  | { type: 'panels';   panels:   PanelData[]; gen: number }
  | { type: 'error';    message:  string;      gen: number };

// ── Entry point ────────────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  const { gen } = msg;

  try {
    if (msg.type === 'generate') {
      // Restore width/height onto the TypedArray (lost during ArrayBuffer transfer)
      (msg.binaryData as any).width  = msg.width;
      (msg.binaryData as any).height = msg.height;
      // 1. Extract contours
      const rawContours = marchingSquares(msg.binaryData);
      const contours    = rawContours.length > 0 ? rawContours : [];
      postMessage({ type: 'contours', contours, gen } satisfies WorkerResponse);

      // 2. Build panels from the fresh contours
      const panels = buildPanels(contours, msg.config);
      postMessage({ type: 'panels', panels, gen } satisfies WorkerResponse);

    } else if (msg.type === 'panels') {
      const panels = buildPanels(msg.contours, msg.config);
      postMessage({ type: 'panels', panels, gen } satisfies WorkerResponse);
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err), gen } satisfies WorkerResponse);
  }
};

// ── Contour transform ─────────────────────────────────────────────────────

function transformContour(path: Path, config: BoxConfig): Path {
  const ss   = config.shadowScale ?? SHADOW_SCALE;
  const offX = config.silhouetteOffsetX ?? 0;
  const offY = config.silhouetteOffsetY ?? 0;
  const shadowRad = (config.shadowRotation ?? 0) * Math.PI / 180;
  const cosSR = Math.cos(shadowRad);
  const sinSR = Math.sin(shadowRad);
  const angle = -(config.silhouetteRotation ?? 0) * Math.PI / 180;
  const cosA  = Math.cos(angle);
  const sinA  = Math.sin(angle);

  return path.map((p: Point) => {
    const sdx = p.x - 0.5;
    const sdy = p.y - 0.5;
    const rx0 = sdx * cosSR - sdy * sinSR;
    const ry0 = sdx * sinSR + sdy * cosSR;
    const wallX = rx0 * config.width  * ss - offX;
    const wallY = -(ry0 * config.height * ss) + offY;
    const rx = wallX * cosA - wallY * sinA;
    const ry = wallX * sinA + wallY * cosA;
    return {
      x:  rx / (config.width  * ss) + 0.5,
      y: -(ry / (config.height * ss)) + 0.5,
    };
  });
}

// ── Panel generation ───────────────────────────────────────────────────────

function buildPanels(rawContours: Path[], config: BoxConfig): PanelData[] {
  const pData: PanelData[] = [
    { panel: 'top',    widthMm: config.width,  heightMm: config.depth, outlinePath: buildPanelBoundary(config.width,  config.depth, 'top',    config), cutPaths: [], rawCutPaths: [], backProjectedPaths: [] },
    { panel: 'right',  widthMm: config.height, heightMm: config.depth, outlinePath: buildPanelBoundary(config.height, config.depth, 'right',  config), cutPaths: [], rawCutPaths: [], backProjectedPaths: [] },
    { panel: 'bottom', widthMm: config.width,  heightMm: config.depth, outlinePath: buildPanelBoundary(config.width,  config.depth, 'bottom', config), cutPaths: [], rawCutPaths: [], backProjectedPaths: [] },
    { panel: 'left',   widthMm: config.height, heightMm: config.depth, outlinePath: buildPanelBoundary(config.height, config.depth, 'left',   config), cutPaths: [], rawCutPaths: [], backProjectedPaths: [] },
  ];

  rawContours.forEach(rawPath => {
    const path = transformContour(rawPath, config);
    pData.forEach(p => {
      const projected = projectPathOntoPanel(path, p.panel, config);
      const offset    = (p.panel === 'top' || p.panel === 'bottom') ? config.width / 2 : config.height / 2;

      projected.forEach(proj => {
        const localPath = proj.map(pt => ({ x: pt.x + offset, y: pt.y }));
        const mt       = config.materialThickness;
        const clipXMin = p.panel === 'right' ? mt : 0;
        const clipXMax = p.panel === 'top'   ? p.widthMm : p.widthMm - mt;
        const clipped  = clipPathToRect(localPath, clipXMin, clipXMax, 0, p.heightMm);

        clipped.forEach(clippedSeg => {
          splitForBridging(clippedSeg, p.widthMm, p.heightMm).forEach(seg => {
            p.cutPaths.push(pathsToSvgData([seg], config.smoothEpsilon ?? 1.5));
            p.rawCutPaths.push(seg);
            p.backProjectedPaths!.push(
              backProjectToWall(seg.map(pt => ({ x: pt.x - offset, y: pt.y })), p.panel, config),
            );
          });
        });
      });
    });
  });

  return pData;
}
