import React from 'react';
import { PanelData } from '../types';

interface PanelPreviewProps {
  data: PanelData;
}

const PANEL_LABELS: Record<string, string> = {
  top: 'Top',
  bottom: 'Bottom',
  left: 'Left',
  right: 'Right',
};

export function PanelPreview({ data }: PanelPreviewProps) {
  const viewBox = `0 0 ${data.widthMm} ${data.heightMm}`;
  const hasCuts = data.cutPaths.length > 0;

  return (
    <div className="w-full h-full flex flex-col bg-card rounded-2xl border border-border overflow-hidden relative">
      <div className="absolute top-2 left-0 right-0 flex justify-center z-10 pointer-events-none">
        <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest bg-card/80 px-2 py-0.5 rounded-full">
          {PANEL_LABELS[data.panel]} · {data.widthMm}×{data.heightMm}mm
        </span>
      </div>

      <div className="flex-1 p-4 flex items-center justify-center overflow-hidden relative">
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          className="w-full h-full max-w-full max-h-full"
          style={{ overflow: 'visible' }}
        >
          <rect x={0} y={0} width={data.widthMm} height={data.heightMm} fill="#151c28" rx="1" />
          <path d={data.outlinePath} stroke="#3a4a60" fill="none" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          {data.cutPaths.map((d, i) => (
            <path key={i} d={d} stroke="#ff3366" fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
          ))}
          <text x={data.widthMm / 2} y={data.heightMm * 0.06} textAnchor="middle" fontSize={data.heightMm * 0.045} fill="#5b6b82" style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>
            WALL SIDE ▲
          </text>
          <text x={data.widthMm / 2} y={data.heightMm * 0.97} textAnchor="middle" fontSize={data.heightMm * 0.045} fill="#5b6b82" style={{ fontFamily: 'monospace', letterSpacing: '0.05em' }}>
            FRONT / OPENING ▼
          </text>
        </svg>

        {!hasCuts && (
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9px] font-mono text-muted-foreground/50 uppercase tracking-widest text-center px-2 leading-5">
              No cuts —<br />shadow doesn't<br />reach this edge
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
