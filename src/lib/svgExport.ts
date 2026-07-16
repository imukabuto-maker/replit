import { PanelData, Path } from '../types';
import { rdpSimplify, smoothPathToSvg } from './pathUtils';

/**
 * Convert raw Path array → SVG path string.
 * When smoothEpsilon > 0, applies RDP simplification + Catmull-Rom bezier smoothing.
 */
export function pathsToSvgData(paths: Path[], smoothEpsilon = 0): string {
  return paths.map(path => {
    if (path.length === 0) return '';
    if (smoothEpsilon > 0 && path.length > 2) {
      const simplified = rdpSimplify(path, smoothEpsilon);
      const closed = path.length > 3 &&
        Math.hypot(path[0].x - path[path.length - 1].x, path[0].y - path[path.length - 1].y) < smoothEpsilon * 2;
      return smoothPathToSvg(simplified, closed);
    }
    return path.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(3)},${pt.y.toFixed(3)}`).join(' ');
  }).join(' ');
}

export function exportSVG(panels: PanelData[]): string {
  // Zero gap — panels touch with common-line shared edges (no double-cut)
  let currentX = 0;
  let maxHeight = 0;

  const svgs = panels.map(p => {
    const w = p.widthMm;
    const h = p.heightMm;
    if (h > maxHeight) maxHeight = h;

    // Top and Bottom panels are mirrored horizontally so the silhouette
    // orientation is correct after the panel is flipped into its assembled position.
    const shouldMirror = p.panel === 'top' || p.panel === 'bottom';
    // Mirror transform: translate right edge to origin, flip x, paths stay in [currentX, currentX+w]
    const cutTransform = shouldMirror
      ? `translate(${(currentX + w).toFixed(3)}, 0) scale(-1, 1)`
      : `translate(${currentX.toFixed(3)}, 0)`;

    const panelSvg = `
      <g transform="translate(${currentX.toFixed(3)}, 0)">
        <path d="${p.outlinePath}" stroke="#000000" fill="none" stroke-width="0.1" />
      </g>
      <g transform="${cutTransform}">
        ${p.cutPaths.map(d => `<path d="${d}" stroke="#FF0000" fill="none" stroke-width="0.1" />`).join('\n        ')}
      </g>`;

    currentX += w; // zero gap
    return panelSvg;
  });

  const totalWidth = currentX;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}mm" height="${maxHeight}mm" viewBox="0 0 ${totalWidth} ${maxHeight}">
    ${svgs.join('\n')}
  </svg>`;
}
