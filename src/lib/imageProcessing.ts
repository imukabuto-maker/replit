import { BoxConfig } from '../types';

export function processImage(img: HTMLImageElement, config: BoxConfig): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  const maxDim = config.rasterResolution ?? 1024;
  let w = img.width;
  let h = img.height;
  if (w > maxDim || h > maxDim) {
    if (w > h) {
      h = Math.round((h * maxDim) / w);
      w = maxDim;
    } else {
      w = Math.round((w * maxDim) / h);
      h = maxDim;
    }
  }

  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const binaryData = new Uint8ClampedArray(w * h);

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    const idx = i / 4;

    // Transparent pixels are always background regardless of invert
    if (a < 128) {
      binaryData[idx] = 0;
      continue;
    }

    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    // bypassThreshold: image is already a silhouette — skip dynamic threshold,
    // use a fixed gray < 128 cutoff so no extra processing distorts the shape.
    const cutoff = config.bypassThreshold ? 128 : config.threshold;
    let isForeground = gray < cutoff;
    if (config.invert) isForeground = !isForeground;

    binaryData[idx] = isForeground ? 255 : 0;
  }

  (binaryData as any).width = w;
  (binaryData as any).height = h;

  return binaryData;
}

/**
 * Rasterize an SVG string into a binaryData array.
 */
export async function processSvg(svgText: string, config: BoxConfig): Promise<Uint8ClampedArray> {
  return new Promise((resolve, reject) => {
    const maxDim = config.rasterResolution ?? 1024;

    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);

      let w = img.naturalWidth || maxDim;
      let h = img.naturalHeight || maxDim;

      if (w === 0 || h === 0) { w = maxDim; h = maxDim; }

      if (w > maxDim || h > maxDim) {
        if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
        else { w = Math.round((w * maxDim) / h); h = maxDim; }
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) { reject(new Error('No canvas context')); return; }

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      const binaryData = new Uint8ClampedArray(w * h);

      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        const idx = i / 4;

        if (a < 128) {
          binaryData[idx] = 0;
          continue;
        }

        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const cutoff = config.bypassThreshold ? 128 : config.threshold;
        let isForeground = gray < cutoff;
        if (config.invert) isForeground = !isForeground;

        binaryData[idx] = isForeground ? 255 : 0;
      }

      (binaryData as any).width = w;
      (binaryData as any).height = h;
      resolve(binaryData);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load SVG image'));
    };

    img.src = url;
  });
}

export type DotFilterColor = 'white' | 'black' | 'both';

export function removeSmallComponents(
  binaryData: Uint8ClampedArray,
  minSize: number,
  color: DotFilterColor = 'white',
): Uint8ClampedArray {
  if (minSize <= 1) return binaryData;

  const targets: number[] =
    color === 'both' ? [255, 0] : color === 'white' ? [255] : [0];

  let current = binaryData;
  for (const target of targets) {
    current = removeSmallComponentsOfColor(current, minSize, target);
  }
  return current;
}

function removeSmallComponentsOfColor(
  binaryData: Uint8ClampedArray,
  minSize: number,
  target: number,
): Uint8ClampedArray {
  const width  = (binaryData as any).width  as number;
  const height = (binaryData as any).height as number;
  const total  = width * height;

  const visited = new Uint8Array(total);
  const result  = new Uint8ClampedArray(binaryData);
  (result as any).width  = width;
  (result as any).height = height;

  const fillValue = target === 255 ? 0 : 255;

  for (let start = 0; start < total; start++) {
    if (binaryData[start] !== target || visited[start]) continue;

    const component: number[] = [start];
    visited[start] = 1;
    let head = 0;

    while (head < component.length) {
      const idx = component[head++];
      const x   = idx % width;
      const y   = (idx / width) | 0;

      if (y > 0          && binaryData[idx - width] === target && !visited[idx - width]) { visited[idx - width] = 1; component.push(idx - width); }
      if (y < height - 1 && binaryData[idx + width] === target && !visited[idx + width]) { visited[idx + width] = 1; component.push(idx + width); }
      if (x > 0          && binaryData[idx - 1]     === target && !visited[idx - 1])     { visited[idx - 1]     = 1; component.push(idx - 1);     }
      if (x < width - 1  && binaryData[idx + 1]     === target && !visited[idx + 1])     { visited[idx + 1]     = 1; component.push(idx + 1);     }
    }

    if (component.length < minSize) {
      for (const i of component) result[i] = fillValue;
    }
  }

  return result;
}
