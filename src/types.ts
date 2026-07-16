export interface BoxConfig {
  width: number;
  height: number;
  depth: number;
  materialThickness: number;
  tabWidth: number;
  ledZ: number;
  ledX: number;
  ledY: number;
  threshold: number;
  bypassThreshold: boolean;
  invert: boolean;
  margin: number;
  silhouetteOffsetX: number;
  silhouetteOffsetY: number;
  silhouetteRotation: number;
  shadowScale: number;
  shadowRotation: number;
  minDotSize: number;
  dotFilterColor: 'white' | 'black' | 'both';
  rasterResolution: number;
  smoothEpsilon: number;
}

export type Point = { x: number; y: number };
export type Point3D = { x: number; y: number; z: number };
export type Path = Point[];
export type Panel = 'top' | 'bottom' | 'left' | 'right';

export interface PanelData {
  panel: Panel;
  widthMm: number;
  heightMm: number;
  outlinePath: string;
  cutPaths: string[];
  rawCutPaths: Path[];   // pre-bezier point arrays, used for DXF
  backProjectedPaths?: Path[];
}
