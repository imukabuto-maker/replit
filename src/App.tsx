import React, { useState, useRef, useEffect } from 'react';
import { useBoxGenerator } from './hooks/useBoxGenerator';
import { WallSimulation } from './components/WallSimulation';
import { SourceView } from './components/SourceView';
import { PanelPreview } from './components/PanelPreview';
import { SettingsPanel } from './components/SettingsPanel';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { exportSVG } from './lib/svgExport';
import { exportDXF } from './lib/dxfExport';
import { exportPDF } from './lib/pdfExport';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Upload, Download, ImageIcon, ChevronDown, ChevronRight, X, FileImage, FileText, FileCode } from 'lucide-react';
import { FullscreenEditor } from './components/FullscreenEditor';
import type { DotFilterColor } from './lib/imageProcessing';

function ImageControlRow({ label, value, min, max, step = 1, unit = '', onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void;
}) {
  // displayVal: tracks thumb while dragging — UI only, no computation
  const [displayVal, setDisplayVal] = useState(value);
  const [inputVal, setInputVal]     = useState(String(value));
  useEffect(() => { setDisplayVal(value); setInputVal(String(value)); }, [value]);
  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (!isNaN(n)) {
      const c = Math.min(max, Math.max(min, n));
      onChange(c);
      setDisplayVal(c);
      setInputVal(String(c));
    } else {
      setDisplayVal(value);
      setInputVal(String(value));
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center gap-2">
        <Label className="text-sm shrink-0">{label}</Label>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={inputVal}
            min={min} max={max} step={step}
            onChange={e => setInputVal(e.target.value)}
            onBlur={e => commit(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            className="w-16 text-xs font-mono text-primary bg-primary/10 px-2 py-0.5 rounded text-right border border-transparent focus:border-primary/50 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && <span className="text-xs text-muted-foreground shrink-0">{unit}</span>}
        </div>
      </div>
      <Slider
        value={[displayVal]}
        min={min} max={max} step={step}
        onValueChange={([v]) => { setDisplayVal(v); setInputVal(String(v)); }}
        onValueCommit={([v]) => onChange(v)}
      />
    </div>
  );
}

function SectionHeader({ label, open, onToggle }: { label: string; open: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 text-[10px] font-semibold text-primary uppercase tracking-wider hover:bg-muted/20 transition-colors"
    >
      <span>{label}</span>
      {open ? <ChevronDown size={12} className="text-muted-foreground" /> : <ChevronRight size={12} className="text-muted-foreground" />}
    </button>
  );
}

const queryClient = new QueryClient();

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ExportModal({ panels, onClose }: { panels: Parameters<typeof exportSVG>[0]; onClose: () => void }) {
  const [pdfLoading, setPdfLoading] = useState(false);

  const handleSVG = () => {
    const svgStr = exportSVG(panels);
    download(new Blob([svgStr], { type: 'image/svg+xml' }), 'shadow-box-panels.svg');
    onClose();
  };

  const handlePDF = async () => {
    setPdfLoading(true);
    try {
      await exportPDF(panels);
      onClose();
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleDXF = () => {
    const dxfStr = exportDXF(panels);
    download(new Blob([dxfStr], { type: 'application/dxf' }), 'shadow-box-panels.dxf');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-sm bg-card border border-border rounded-t-3xl pb-8 pt-2 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto w-10 h-1 bg-border rounded-full mb-4" />
        <div className="px-5 pb-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold">Export Panels</h2>
            <button onClick={onClose} className="p-1 rounded-lg text-muted-foreground active:bg-muted/40">
              <X size={16} />
            </button>
          </div>
          <div className="flex flex-col gap-2">

            <button
              onClick={handleSVG}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl border border-border hover:bg-muted/30 active:bg-muted/50 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-none">
                <FileImage size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">SVG</p>
                <p className="text-[11px] text-muted-foreground">Vector · CorelDraw, Inkscape</p>
              </div>
            </button>

            <button
              onClick={handlePDF}
              disabled={pdfLoading}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl border border-border hover:bg-muted/30 active:bg-muted/50 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-none">
                <FileText size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">PDF</p>
                <p className="text-[11px] text-muted-foreground">
                  {pdfLoading ? 'Generating…' : 'Vector PDF · 1:1 scale · AutoCAD ready'}
                </p>
              </div>
            </button>

            <button
              onClick={handleDXF}
              className="flex items-center gap-3 w-full px-4 py-3.5 rounded-2xl border border-border hover:bg-muted/30 active:bg-muted/50 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center flex-none">
                <FileCode size={18} className="text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">DXF</p>
                <p className="text-[11px] text-muted-foreground">AutoCAD native · 1:1 mm · OUTLINE + CUT layers</p>
              </div>
            </button>

          </div>
        </div>
      </div>
    </div>
  );
}

function ShadowBoxApp() {
  const { config, updateConfig, setImageSrc, setSvgText, binaryData, panels, contours, eraseComponentAt, overrideBinaryData, computing } = useBoxGenerator();
  const [fileName, setFileName] = useState<string | null>(null);
  const [sourceOpen, setSourceOpen] = useState(true);
  const [wallOpen, setWallOpen] = useState(true);
  const [showExport, setShowExport] = useState(false);
  const [sourceFullscreen, setSourceFullscreen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setSvgText(ev.target.result as string);
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) setImageSrc(ev.target.result as string);
      };
      reader.readAsDataURL(file);
    }

    e.target.value = '';
  };

  const topPanel    = panels.find(p => p.panel === 'top');
  const bottomPanel = panels.find(p => p.panel === 'bottom');
  const leftPanel   = panels.find(p => p.panel === 'left');
  const rightPanel  = panels.find(p => p.panel === 'right');

  return (
    <div className="flex flex-col h-screen bg-background text-foreground dark overflow-hidden">

      <header className="flex-none flex items-center justify-between px-4 py-3 border-b border-border bg-card z-10">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-[15px] font-bold tracking-tight leading-none">Shadow Box</h1>
            <p className="text-[9px] text-primary font-mono uppercase tracking-widest mt-0.5">Wall-Wash Generator</p>
          </div>
          {computing && (
            <span className="flex items-center gap-1 text-[9px] text-muted-foreground font-mono animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block animate-pulse" />
              computing…
            </span>
          )}
        </div>
        <button
          onClick={() => setShowExport(true)}
          className="flex items-center gap-1.5 bg-primary text-black text-xs font-semibold px-4 py-2 rounded-xl active:opacity-75 transition-opacity"
        >
          <Download size={12} />
          Export
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-3 pb-8">

          {/* Source Threshold — collapsible */}
          <section className="rounded-2xl border border-border bg-card overflow-hidden">
            <SectionHeader label="Silhouette Image" open={sourceOpen} onToggle={() => setSourceOpen(o => !o)} />

            {sourceOpen && (
              <>
                <div className="px-4 pb-2">
                  <input
                    type="file"
                    id="image-upload"
                    accept="image/png, image/jpeg, image/svg+xml, .svg"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <label
                    htmlFor="image-upload"
                    className="flex items-center gap-2 w-full py-3 px-3 border border-dashed border-border rounded-xl text-sm text-muted-foreground active:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <Upload size={14} className="flex-none" />
                    <span className="truncate">{fileName ?? 'Upload silhouette image or SVG'}</span>
                  </label>
                  <p className="text-[10px] text-muted-foreground/60 font-mono mt-1.5 px-1">
                    Accepted: PNG · JPEG · SVG
                  </p>
                </div>

                <div className="px-4 pt-2 space-y-4 pb-4">

                  {/* Pre-made silhouette toggle */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <Label className="text-sm leading-tight">Pre-made silhouette</Label>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {config.bypassThreshold
                          ? 'Threshold skipped — gambar dipakai langsung'
                          : 'Aktifkan jika gambar sudah hitam-putih / siluet bersih'}
                      </p>
                    </div>
                    <Switch
                      checked={config.bypassThreshold}
                      onCheckedChange={v => updateConfig({ bypassThreshold: v })}
                    />
                  </div>

                  {/* Threshold slider — hidden when bypass is ON */}
                  {!config.bypassThreshold && (
                    <ImageControlRow label="Threshold" value={config.threshold} min={0} max={255} onChange={v => updateConfig({ threshold: v })} />
                  )}

                  <div className="flex items-center justify-between">
                    <Label className="text-sm">Invert image</Label>
                    <Switch checked={config.invert} onCheckedChange={v => updateConfig({ invert: v })} />
                  </div>

                  <ImageControlRow label="Remove dots smaller than" value={config.minDotSize} min={0} max={500} step={5} unit="px" onChange={v => updateConfig({ minDotSize: v })} />

                  <div className="flex justify-between items-center gap-2">
                    <Label className="text-sm shrink-0">Remove which dots</Label>
                    <ToggleGroup type="single" value={config.dotFilterColor} onValueChange={(v) => v && updateConfig({ dotFilterColor: v as DotFilterColor })} className="justify-end">
                      <ToggleGroupItem value="white" className="text-xs px-2 h-7">White</ToggleGroupItem>
                      <ToggleGroupItem value="black" className="text-xs px-2 h-7">Black</ToggleGroupItem>
                      <ToggleGroupItem value="both" className="text-xs px-2 h-7">Both</ToggleGroupItem>
                    </ToggleGroup>
                  </div>

                  {/* Edge Quality — inside this section */}
                  <div className="border-t border-border/40 pt-3 space-y-4">
                    <p className="text-[9px] font-mono text-muted-foreground/60 uppercase tracking-widest">Edge Quality</p>

                    <ImageControlRow
                      label="Raster Resolution"
                      value={config.rasterResolution}
                      min={256} max={2048} step={128} unit="px"
                      onChange={v => updateConfig({ rasterResolution: v })}
                    />
                    <p className="text-[10px] text-muted-foreground/50 -mt-1">Higher = sharper silhouette, slower processing</p>

                    <ImageControlRow
                      label="Curve Smoothing"
                      value={config.smoothEpsilon}
                      min={0} max={5} step={0.1} unit="mm"
                      onChange={v => updateConfig({ smoothEpsilon: v })}
                    />
                    <p className="text-[10px] text-muted-foreground/50 -mt-1">Higher = smoother curves, less pixel detail</p>
                  </div>
                </div>

                <div style={{ height: 200 }}>
                  {binaryData ? (
                    <SourceView binaryData={binaryData} onExpand={() => setSourceFullscreen(true)} onEraseAt={eraseComponentAt} />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-black/40 text-muted-foreground rounded-b-2xl">
                      <ImageIcon size={28} className="opacity-30" />
                      <p className="text-xs font-mono opacity-50">No image uploaded</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          {sourceFullscreen && binaryData && (
            <FullscreenEditor
              binaryData={binaryData}
              onApply={overrideBinaryData}
              onClose={() => setSourceFullscreen(false)}
              config={config}
              updateConfig={updateConfig}
            />
          )}

          {/* Wall Projection — collapsible */}
          <section className="rounded-2xl border border-border overflow-hidden bg-card">
            <SectionHeader label="Wall Projection" open={wallOpen} onToggle={() => setWallOpen(o => !o)} />
            {wallOpen && (
              <>
                <div className="p-3 pt-2">
                  <div style={{ aspectRatio: '1/1', width: '100%', position: 'relative' }}>
                    <WallSimulation contours={contours} panels={panels} config={config} />
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-border overflow-hidden bg-card">
            <div className="px-4 pt-4 pb-1 text-[10px] font-semibold text-primary uppercase tracking-wider">
              Box Settings
            </div>
            <SettingsPanel config={config} onChange={updateConfig} />
          </section>

          <section>
            <div className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-2 px-1">
              Laser-Cut Panels
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([topPanel, bottomPanel, leftPanel, rightPanel]).map(p =>
                p ? (
                  <div key={p.panel} style={{ aspectRatio: '1' }}>
                    <PanelPreview data={p} />
                  </div>
                ) : null
              )}
            </div>
          </section>

        </div>
      </main>

      {showExport && <ExportModal panels={panels} onClose={() => setShowExport(false)} />}
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ShadowBoxApp />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
