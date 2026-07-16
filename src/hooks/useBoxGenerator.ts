import { useState, useEffect, useCallback, useRef } from 'react';
import { BoxConfig, PanelData, Path, Point } from '../types';
import { processImage, processSvg, removeSmallComponents } from '../lib/imageProcessing';
import type { WorkerResponse } from '../workers/boxWorker';

// ── Demo silhouette (used when no image is loaded) ─────────────────────────

function buildDemoStar(): Path {
  const path: Path = [];
  const cx = 0.5, cy = 0.5;
  const R_OUT = 0.45, R_IN = 0.32;
  const N = 5;
  for (let k = 0; k < N; k++) {
    const outerA = -Math.PI / 2 + k * (2 * Math.PI / N);
    const innerA = outerA + Math.PI / N;
    path.push({ x: cx + R_OUT * Math.cos(outerA), y: cy + R_OUT * Math.sin(outerA) });
    path.push({ x: cx + R_IN  * Math.cos(innerA), y: cy + R_IN  * Math.sin(innerA) });
  }
  path.push(path[0]);
  return path;
}

const DEMO_CONTOUR = buildDemoStar();

// ── Hook ───────────────────────────────────────────────────────────────────

export function useBoxGenerator() {
  const [config, setConfig] = useState<BoxConfig>({
    width: 200,
    height: 150,
    depth: 80,
    materialThickness: 3.0,
    tabWidth: 10,
    ledZ: 40,
    ledX: 0,
    ledY: 0,
    threshold: 128,
    bypassThreshold: false,
    invert: false,
    margin: 5,
    silhouetteOffsetX: 0,
    silhouetteOffsetY: 0,
    silhouetteRotation: 0,
    shadowScale: 4.0,
    shadowRotation: 0,
    minDotSize: 0,
    dotFilterColor: 'white',
    rasterResolution: 1024,
    smoothEpsilon: 1.5,
  });

  const [imageSrc,  setImageSrc]  = useState<string | null>(null);
  const [svgText,   setSvgText]   = useState<string | null>(null);
  // rawBinaryData: output of processImage, before dot-filter (kept as ref to avoid re-renders)
  const rawBinaryRef = useRef<Uint8ClampedArray | null>(null);
  // binaryData: after dot-filter, shown in FullscreenEditor
  const [binaryData, setBinaryData] = useState<Uint8ClampedArray | null>(null);
  const [contours,   setContours]   = useState<Path[]>([DEMO_CONTOUR]);
  const [panels,     setPanels]     = useState<PanelData[]>([]);
  const [computing,  setComputing]  = useState(false);

  // Always-current refs (avoid stale closures)
  const configRef  = useRef(config);
  configRef.current = config;

  const contoursRef = useRef(contours);
  contoursRef.current = contours;

  // ── Worker lifecycle ─────────────────────────────────────────────────────

  const workerRef    = useRef<Worker | null>(null);
  const genRef       = useRef(0);
  const panelDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const w = new Worker(
      new URL('../workers/boxWorker.ts', import.meta.url),
      { type: 'module' },
    );

    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.gen !== genRef.current) return; // discard stale result

      if (msg.type === 'contours') {
        const c = msg.contours;
        setContours(c.length > 0 ? c : [DEMO_CONTOUR]);
        contoursRef.current = c.length > 0 ? c : [DEMO_CONTOUR];
      } else if (msg.type === 'panels') {
        setPanels(msg.panels);
        setComputing(false);
      } else if (msg.type === 'error') {
        console.error('[boxWorker]', msg.message);
        setComputing(false);
      }
    };

    w.onerror = (err) => {
      console.error('[boxWorker] uncaught:', err);
      setComputing(false);
    };

    workerRef.current = w;

    // Kick off first computation with demo contour
    const g = ++genRef.current;
    setComputing(true);
    w.postMessage({ type: 'panels', contours: [DEMO_CONTOUR], config: configRef.current, gen: g });

    return () => { w.terminate(); workerRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Worker dispatch: full image recompute ────────────────────────────────
  // Stable reference — uses refs so never needs to be recreated.
  // Cancels any pending panel-only debounce since 'generate' handles both.

  const dispatchGenerate = useCallback((bd: Uint8ClampedArray) => {
    const w = workerRef.current;
    if (!w) return;
    // Cancel pending panel debounce — generate already produces panels
    if (panelDebounce.current) { clearTimeout(panelDebounce.current); panelDebounce.current = null; }
    const g = ++genRef.current;
    setComputing(true);
    const width  = (bd as any).width  as number;
    const height = (bd as any).height as number;
    const copy   = bd.slice(0);
    w.postMessage(
      { type: 'generate', binaryData: copy, width, height, config: configRef.current, gen: g },
      [copy.buffer],
    );
  }, []); // stable — all state accessed via refs

  // ── Worker dispatch: panel-only recompute (config changed, image same) ───

  const schedulePanelRebuild = useCallback(() => {
    if (panelDebounce.current) clearTimeout(panelDebounce.current);
    panelDebounce.current = setTimeout(() => {
      panelDebounce.current = null;
      const w = workerRef.current;
      if (!w) return;
      const g = ++genRef.current;
      setComputing(true);
      w.postMessage({ type: 'panels', contours: contoursRef.current, config: configRef.current, gen: g });
    }, 400);
  }, []); // stable — all state accessed via refs

  // ── Image → rawBinaryData ────────────────────────────────────────────────

  useEffect(() => {
    if (!imageSrc) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const raw = processImage(img, configRef.current);
      rawBinaryRef.current = raw;
      applyDotFilter(raw);
    };
    img.src = imageSrc;
  // Re-run when image source or threshold-related settings change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc, config.threshold, config.bypassThreshold, config.invert]);

  useEffect(() => {
    if (!svgText) return;
    processSvg(svgText, configRef.current).then(raw => {
      rawBinaryRef.current = raw;
      applyDotFilter(raw);
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgText, config.threshold, config.bypassThreshold, config.invert]);

  // Dot-size filter (runs on main thread — fast, just BFS over pixels)
  // Stable: uses refs for config, stable dispatchGenerate
  const applyDotFilter = useCallback((raw: Uint8ClampedArray) => {
    const { minDotSize, dotFilterColor } = configRef.current;
    const filtered = minDotSize > 0
      ? removeSmallComponents(raw, minDotSize, dotFilterColor)
      : raw;
    setBinaryData(filtered);
    dispatchGenerate(filtered);
  }, [dispatchGenerate]); // dispatchGenerate is stable

  // Re-apply dot filter when minDotSize / color changes (no image reload)
  useEffect(() => {
    const raw = rawBinaryRef.current;
    if (!raw) return;
    const { minDotSize, dotFilterColor } = configRef.current;
    const filtered = minDotSize > 0
      ? removeSmallComponents(raw, minDotSize, dotFilterColor)
      : raw;
    setBinaryData(filtered);
    dispatchGenerate(filtered);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.minDotSize, config.dotFilterColor]);

  // Config-only changes (box dimensions, LED position, etc.) → rebuild panels
  const prevConfigRef = useRef(config);
  useEffect(() => {
    const prev = prevConfigRef.current;
    prevConfigRef.current = config;

    // Skip fields that already trigger a full image recompute
    const imageFields: (keyof BoxConfig)[] = ['threshold', 'bypassThreshold', 'invert', 'minDotSize', 'dotFilterColor', 'rasterResolution'];
    const onlyImageFieldChanged = (Object.keys(config) as (keyof BoxConfig)[]).every(
      k => config[k] === prev[k] || imageFields.includes(k),
    );

    // If the change is purely image-side, don't schedule a redundant panel rebuild
    // (dispatchGenerate already handles it via the image-change effects)
    if (onlyImageFieldChanged) return;

    schedulePanelRebuild();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // ── Manual pixel editing (FullscreenEditor) ──────────────────────────────

  const eraseComponentAt = useCallback((ix: number, iy: number) => {
    if (!binaryData) return;
    const width  = (binaryData as any).width  as number;
    const height = (binaryData as any).height as number;
    const startIdx = iy * width + ix;
    if (binaryData[startIdx] !== 255) return;

    const result = new Uint8ClampedArray(binaryData);
    (result as any).width  = width;
    (result as any).height = height;

    const queue: number[] = [startIdx];
    result[startIdx] = 0;
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const x = idx % width;
      const y = (idx / width) | 0;
      if (y > 0          && result[idx - width] === 255) { result[idx - width] = 0; queue.push(idx - width); }
      if (y < height - 1 && result[idx + width] === 255) { result[idx + width] = 0; queue.push(idx + width); }
      if (x > 0          && result[idx - 1]     === 255) { result[idx - 1]     = 0; queue.push(idx - 1);     }
      if (x < width - 1  && result[idx + 1]     === 255) { result[idx + 1]     = 0; queue.push(idx + 1);     }
    }
    setBinaryData(result);
    dispatchGenerate(result);
  }, [binaryData, dispatchGenerate]);

  const overrideBinaryData = useCallback((data: Uint8ClampedArray) => {
    setBinaryData(data);
    dispatchGenerate(data);
  }, [dispatchGenerate]);

  // ── Config helpers ───────────────────────────────────────────────────────

  const updateConfig = useCallback((updates: Partial<BoxConfig>) => {
    setConfig(prev => ({ ...prev, ...updates }));
  }, []);

  return {
    config, updateConfig,
    setImageSrc, setSvgText,
    binaryData, panels, contours,
    eraseComponentAt, overrideBinaryData,
    computing,
  };
}
