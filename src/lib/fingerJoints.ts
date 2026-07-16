import { BoxConfig, Panel } from '../types';

function buildEdge(
  x0: number, y0: number,
  x1: number, y1: number,
  joint: 'none' | 'male' | 'female',
  nx: number, ny: number,
  mt: number,
  tw: number,
  startWithTab: boolean
): string {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);

  if (joint === 'none' || len < 1e-9) {
    return `L ${x1.toFixed(3)},${y1.toFixed(3)} `;
  }

  const ex = dx / len;
  const ey = dy / len;

  let numTabs = Math.max(3, Math.round(len / tw));
  if (numTabs % 2 === 0) numTabs++;
  const tabLen = len / numTabs;
  const sign = joint === 'male' ? 1 : -1;

  let d = '';
  let prevOffset = 0;

  for (let i = 0; i < numTabs; i++) {
    const isTabSeg = (i % 2 === 0) ? startWithTab : !startWithTab;
    const offset = isTabSeg ? sign * mt : 0;

    const xS = x0 + ex * i * tabLen;
    const yS = y0 + ey * i * tabLen;
    const xE = x0 + ex * (i + 1) * tabLen;
    const yE = y0 + ey * (i + 1) * tabLen;

    if (offset !== prevOffset) {
      d += `L ${(xS + nx * offset).toFixed(3)},${(yS + ny * offset).toFixed(3)} `;
    }
    d += `L ${(xE + nx * offset).toFixed(3)},${(yE + ny * offset).toFixed(3)} `;
    prevOffset = offset;
  }

  if (Math.abs(prevOffset) > 1e-9) {
    d += `L ${x1.toFixed(3)},${y1.toFixed(3)} `;
  }

  return d;
}

export function buildPanelBoundary(
  width: number,
  height: number,
  panel: Panel,
  config: BoxConfig
): string {
  const { materialThickness: mt, tabWidth: tw } = config;

  let d = `M 0.000,0.000 `;

  switch (panel) {
    case 'top': {
      d += `L ${width.toFixed(3)},0.000 `;
      d += buildEdge(width, 0, width, height, 'male', 1, 0, mt, tw, false);
      d += `L 0.000,${height.toFixed(3)} `;
      d += buildEdge(0, height, 0, 0, 'male', -1, 0, mt, tw, false);
      break;
    }
    case 'bottom': {
      d += `L ${width.toFixed(3)},0.000 `;
      d += buildEdge(width, 0, width, height, 'female', 1, 0, mt, tw, false);
      d += `L 0.000,${height.toFixed(3)} `;
      // left edge: 'male' so it interlocks with Right's 'female' right edge in strip layout
      d += buildEdge(0, height, 0, 0, 'male', -1, 0, mt, tw, false);
      break;
    }
    case 'left': {
      d += `L ${width.toFixed(3)},0.000 `;
      d += buildEdge(width, 0, width, height, 'female', 1, 0, mt, tw, false);
      d += `L 0.000,${height.toFixed(3)} `;
      // left edge: 'male' so it interlocks with Bottom's 'female' right edge in strip layout
      d += buildEdge(0, height, 0, 0, 'male', -1, 0, mt, tw, false);
      break;
    }
    case 'right': {
      d += `L ${width.toFixed(3)},0.000 `;
      d += buildEdge(width, 0, width, height, 'female', 1, 0, mt, tw, false);
      d += `L 0.000,${height.toFixed(3)} `;
      // left edge: 'female' so it interlocks with Top's 'male' right edge in strip layout
      d += buildEdge(0, height, 0, 0, 'female', -1, 0, mt, tw, false);
      break;
    }
  }

  d += 'Z';
  return d;
}
