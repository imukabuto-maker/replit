import React, { useEffect, useRef } from 'react';
import { Maximize2, Eraser } from 'lucide-react';

interface SourceViewProps {
  binaryData: Uint8ClampedArray | null;
  onExpand?: () => void;
  onEraseAt?: (ix: number, iy: number) => void;
}

export function SourceView({ binaryData, onExpand, onEraseAt }: SourceViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!binaryData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width  = (binaryData as any).width  as number;
    const height = (binaryData as any).height as number;
    const container = canvas.parentElement;
    if (!container) return;

    const cw    = container.clientWidth;
    const ch    = container.clientHeight;
    const scale = Math.min(cw / width, ch / height) * 0.92;

    canvas.width  = width  * scale;
    canvas.height = height * scale;

    const tmp  = document.createElement('canvas');
    tmp.width  = width;
    tmp.height = height;
    const tCtx = tmp.getContext('2d');
    if (!tCtx) return;

    const idata = tCtx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const v = binaryData[i];
      idata.data[i * 4]     = v;
      idata.data[i * 4 + 1] = v;
      idata.data[i * 4 + 2] = v;
      idata.data[i * 4 + 3] = 255;
    }
    tCtx.putImageData(idata, 0, 0);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
  }, [binaryData]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onEraseAt || !binaryData) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect   = canvas.getBoundingClientRect();
    const cx     = e.clientX - rect.left;
    const cy     = e.clientY - rect.top;
    const width  = (binaryData as any).width  as number;
    const height = (binaryData as any).height as number;
    const ix = Math.floor(cx * width  / canvas.width);
    const iy = Math.floor(cy * height / canvas.height);
    if (ix >= 0 && ix < width && iy >= 0 && iy < height) onEraseAt(ix, iy);
  };

  const eraseMode = !!onEraseAt && !!binaryData;

  return (
    <div className="w-full h-full flex items-center justify-center bg-black rounded-2xl overflow-hidden relative border border-border">
      <div className="absolute top-2 left-3 text-[9px] font-mono text-muted-foreground uppercase tracking-widest opacity-70 z-10 pointer-events-none">
        Source Threshold
      </div>

      {onExpand && binaryData && (
        <button
          onClick={onExpand}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/60 text-muted-foreground active:text-primary transition-colors"
          aria-label="Expand full screen"
        >
          <Maximize2 size={14} />
        </button>
      )}

      {eraseMode && !onExpand && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/70 border border-border pointer-events-none">
          <Eraser size={11} className="text-primary" />
          <span className="text-[10px] font-mono text-muted-foreground">Tap a dot to erase it</span>
        </div>
      )}

      {!binaryData && (
        <p className="text-xs text-muted-foreground font-mono">No image uploaded</p>
      )}

      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full object-contain"
        style={{ cursor: eraseMode ? 'crosshair' : 'default' }}
        onClick={handleCanvasClick}
      />
    </div>
  );
}
