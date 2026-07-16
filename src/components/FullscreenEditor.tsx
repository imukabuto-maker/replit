import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Undo2, Eraser } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BoxConfig } from '../types';
import type { DotFilterColor } from '../lib/imageProcessing';

interface Props {
  binaryData: Uint8ClampedArray;
  onApply: (newData: Uint8ClampedArray) => void;
  onClose: () => void;
  config: BoxConfig;
  updateConfig: (p: Partial<BoxConfig>) => void;
}

function imgDims(data: Uint8ClampedArray) {
  return { w: (data as any).width as number, h: (data as any).height as number };
}

function copyWithDims(src: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  (out as any).width  = (src as any).width;
  (out as any).height = (src as any).height;
  return out;
}

function drawBinaryToCanvas(data: Uint8ClampedArray, canvas: HTMLCanvasElement) {
  const { w, h } = imgDims(data);
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const id = ctx.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = data[i];
    id.data[i * 4]     = v;
    id.data[i * 4 + 1] = v;
    id.data[i * 4 + 2] = v;
    id.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(id, 0, 0);
}

function CommitSlider({ value, min, max, step, onCommit }: {
  value: number; min: number; max: number; step: number; onCommit: (v: number) => void;
}) {
  const [display, setDisplay] = useState(value);
  useEffect(() => { setDisplay(value); }, [value]);
  return (
    <Slider
      value={[display]} min={min} max={max} step={step}
      onValueChange={([v]) => setDisplay(v)}
      onValueCommit={([v]) => onCommit(v)}
      className="flex-1"
    />
  );
}

const ThresholdSlider = ({ value, onCommit }: { value: number; onCommit: (v: number) => void }) =>
  <CommitSlider value={value} min={0} max={255} step={1} onCommit={onCommit} />;

const MinDotSlider = ({ value, onCommit }: { value: number; onCommit: (v: number) => void }) =>
  <CommitSlider value={value} min={0} max={500} step={5} onCommit={onCommit} />;

export function FullscreenEditor({ binaryData, onApply, onClose, config, updateConfig }: Props) {
  const { w: imgW, h: imgH } = imgDims(binaryData);

  const viewportRef    = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const markCanvasRef  = useRef<HTMLCanvasElement>(null);

  const [transform, setTransform] = useState({ scale: 1, tx: 0, ty: 0 });
  const transformRef = useRef(transform);
  useEffect(() => { transformRef.current = transform; }, [transform]);

  const [brushSize, setBrushSize] = useState(15);
  const brushSizeRef = useRef(brushSize);
  useEffect(() => { brushSizeRef.current = brushSize; }, [brushSize]);

  const [hasMarks, setHasMarks] = useState(false);
  const [undoStack, setUndoStack] = useState<Uint8ClampedArray[]>([]);

  useEffect(() => {
    const imgCanvas  = imageCanvasRef.current;
    const markCanvas = markCanvasRef.current;
    if (!imgCanvas || !markCanvas || !imgW || !imgH) return;

    drawBinaryToCanvas(binaryData, imgCanvas);
    markCanvas.width  = imgW;
    markCanvas.height = imgH;
    markCanvas.getContext('2d')!.clearRect(0, 0, imgW, imgH);
    setHasMarks(false);

    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const fit = Math.min((rect.width * 0.95) / imgW, (rect.height * 0.95) / imgH);
    setTransform({ scale: fit, tx: 0, ty: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [binaryData]);

  const paintAt = useCallback((screenX: number, screenY: number) => {
    const markCanvas = markCanvasRef.current;
    if (!markCanvas) return;
    const rect = markCanvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const scaleX = markCanvas.width  / rect.width;
    const scaleY = markCanvas.height / rect.height;
    const cx = (screenX - rect.left)  * scaleX;
    const cy = (screenY - rect.top)   * scaleY;
    const ctx = markCanvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(255, 40, 40, 0.80)';
    ctx.beginPath();
    ctx.arc(cx, cy, brushSizeRef.current, 0, Math.PI * 2);
    ctx.fill();
    setHasMarks(true);
  }, []);

  const handlePinch = useCallback(
    (prev: { x: number; y: number }[], next: { x: number; y: number }[]) => {
      if (prev.length < 2 || next.length < 2) return;
      const prevD = Math.hypot(prev[1].x - prev[0].x, prev[1].y - prev[0].y);
      const nextD = Math.hypot(next[1].x - next[0].x, next[1].y - next[0].y);
      const sf    = prevD > 2 ? nextD / prevD : 1;

      const prevMid = { x: (prev[0].x + prev[1].x) / 2, y: (prev[0].y + prev[1].y) / 2 };
      const nextMid = { x: (next[0].x + next[1].x) / 2, y: (next[0].y + next[1].y) / 2 };
      const dx = nextMid.x - prevMid.x;
      const dy = nextMid.y - prevMid.y;

      setTransform(t => {
        const newScale = Math.min(12, Math.max(0.3, t.scale * sf));
        const vp = viewportRef.current;
        if (!vp) return { scale: newScale, tx: t.tx + dx, ty: t.ty + dy };
        const vr = vp.getBoundingClientRect();
        const lx = prevMid.x - vr.left - vr.width  / 2;
        const ly = prevMid.y - vr.top  - vr.height / 2;
        const sd = newScale / t.scale;
        return { scale: newScale, tx: lx + (t.tx - lx) * sd + dx, ty: ly + (t.ty - ly) * sd + dy };
      });
    },
    [],
  );

  const touchState = useRef<{ painting: boolean; lastTouches: { x: number; y: number }[] }>({ painting: false, lastTouches: [] });

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;

    const onStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1) {
        touchState.current.painting = true;
        touchState.current.lastTouches = [];
        paintAt(e.touches[0].clientX, e.touches[0].clientY);
      } else {
        touchState.current.painting = false;
        touchState.current.lastTouches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
      }
    };

    const onMove = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 1 && touchState.current.painting) {
        paintAt(e.touches[0].clientX, e.touches[0].clientY);
      } else if (e.touches.length >= 2) {
        const next = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
        if (touchState.current.lastTouches.length >= 2) handlePinch(touchState.current.lastTouches, next);
        touchState.current.lastTouches = next;
      }
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) touchState.current.lastTouches = [];
      if (e.touches.length === 0) touchState.current.painting = false;
    };

    vp.addEventListener('touchstart', onStart, { passive: false });
    vp.addEventListener('touchmove',  onMove,  { passive: false });
    vp.addEventListener('touchend',   onEnd,   { passive: false });
    return () => {
      vp.removeEventListener('touchstart', onStart);
      vp.removeEventListener('touchmove',  onMove);
      vp.removeEventListener('touchend',   onEnd);
    };
  }, [paintAt, handlePinch]);

  const mouseDown = useRef(false);
  const handleMouseDown = (e: React.MouseEvent) => { mouseDown.current = true; paintAt(e.clientX, e.clientY); };
  const handleMouseMove = (e: React.MouseEvent) => { if (mouseDown.current) paintAt(e.clientX, e.clientY); };
  const handleMouseUp   = () => { mouseDown.current = false; };

  const clearMarks = () => {
    const mc = markCanvasRef.current;
    if (!mc) return;
    mc.getContext('2d')!.clearRect(0, 0, imgW, imgH);
    setHasMarks(false);
  };

  const undo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack(s => s.slice(0, -1));
    clearMarks();
    onApply(prev);
  };

  const handleRemove = () => {
    const mc = markCanvasRef.current;
    if (!mc || !hasMarks) return;
    const mCtx = mc.getContext('2d')!;
    const mData = mCtx.getImageData(0, 0, imgW, imgH);

    const result = copyWithDims(binaryData);
    for (let i = 0; i < imgW * imgH; i++) {
      if (mData.data[i * 4 + 3] === 0) continue;
      if (config.dotFilterColor === 'white') result[i] = 0;
      else if (config.dotFilterColor === 'black') result[i] = 255;
      else result[i] = binaryData[i] === 255 ? 0 : 255;
    }

    setUndoStack(s => [...s.slice(-9), binaryData]);
    clearMarks();
    onApply(result);
  };

  const cssTransform = `translate(${transform.tx}px, ${transform.ty}px) scale(${transform.scale})`;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col dark select-none">
      <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground active:text-primary transition-colors" aria-label="Close">
          <X size={18} />
        </button>
        <span className="text-[10px] font-mono text-primary uppercase tracking-widest">Silhouette · Edit</span>
        <button onClick={undo} disabled={undoStack.length === 0} className="p-1.5 rounded-lg text-muted-foreground active:text-primary disabled:opacity-30 transition-colors" aria-label="Undo">
          <Undo2 size={18} />
        </button>
      </div>

      <div
        ref={viewportRef}
        className="flex-1 min-h-0 relative overflow-hidden bg-black flex items-center justify-center"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ touchAction: 'none' }}
      >
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 border border-border pointer-events-none">
          <Eraser size={11} className="text-primary" />
          <span className="text-[10px] font-mono text-muted-foreground">Paint red · then tap Remove</span>
        </div>

        <div style={{ transform: cssTransform, transformOrigin: 'center center', position: 'relative', cursor: 'crosshair', lineHeight: 0 }}>
          <canvas ref={imageCanvasRef} style={{ display: 'block', imageRendering: 'pixelated' }} />
          <canvas ref={markCanvasRef} style={{ display: 'block', position: 'absolute', top: 0, left: 0, imageRendering: 'pixelated', mixBlendMode: 'screen' }} />
        </div>
      </div>

      <div className="flex-none border-t border-border bg-card px-4 pt-3 pb-5 space-y-3">
        <button onClick={handleRemove} disabled={!hasMarks} className="w-full py-3 rounded-2xl bg-[#ff3366] text-white font-bold text-sm tracking-wide disabled:opacity-35 active:opacity-75 transition-opacity">
          Remove
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono shrink-0 w-8">Size</span>
          <Slider value={[brushSize]} min={2} max={60} step={1} onValueChange={([v]) => setBrushSize(v)} className="flex-1" />
          <span className="text-xs font-mono text-primary w-6 text-right">{brushSize}</span>
        </div>

        <div className="border-t border-border/50 pt-3 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono shrink-0 w-16">Threshold</span>
            <ThresholdSlider value={config.threshold} onCommit={v => updateConfig({ threshold: v })} />
            <span className="text-xs font-mono text-primary w-8 text-right">{config.threshold}</span>
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground font-mono">Invert</Label>
            <Switch checked={config.invert} onCheckedChange={v => updateConfig({ invert: v })} />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-mono shrink-0 w-16">Min dot</span>
            <MinDotSlider value={config.minDotSize} onCommit={v => updateConfig({ minDotSize: v })} />
            <span className="text-xs font-mono text-primary w-8 text-right">{config.minDotSize}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground font-mono shrink-0 w-16">Remove</span>
            <ToggleGroup type="single" value={config.dotFilterColor} onValueChange={(v) => v && updateConfig({ dotFilterColor: v as DotFilterColor })} className="flex-1 justify-end">
              <ToggleGroupItem value="white" className="text-xs px-2 h-7">White</ToggleGroupItem>
              <ToggleGroupItem value="black" className="text-xs px-2 h-7">Black</ToggleGroupItem>
              <ToggleGroupItem value="both" className="text-xs px-2 h-7">Both</ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </div>
    </div>
  );
}
