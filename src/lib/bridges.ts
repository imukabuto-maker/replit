import { Point } from '../types';

// Bridges/micro-tabs are disabled — all cut paths are continuous solid lines.
export function splitForBridging(path: Point[], _width: number, _height: number): Point[][] {
  return [path];
}
