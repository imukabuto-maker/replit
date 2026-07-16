import { PanelData, Path } from '../types';
import { rdpSimplify } from './pathUtils';

/** Parse a simple SVG path (M/L/H/V/Z only) into a point array. */
function parseSvgPathToPoints(d: string): Path {
  const points: Path = [];
  let cx = 0, cy = 0;
  const tokens = d.match(/[MmLlHhVvZz][^MmLlHhVvZz]*/g) ?? [];
  for (const tok of tokens) {
    const type = tok[0];
    const nums = tok.slice(1).trim().split(/[\s,]+/).map(Number).filter(n => !isNaN(n));
    switch (type) {
      case 'M': case 'm':
        for (let i = 0; i + 1 < nums.length; i += 2) {
          cx = type === 'M' ? nums[i] : cx + nums[i];
          cy = type === 'M' ? nums[i + 1] : cy + nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case 'L': case 'l':
        for (let i = 0; i + 1 < nums.length; i += 2) {
          cx = type === 'L' ? nums[i] : cx + nums[i];
          cy = type === 'L' ? nums[i + 1] : cy + nums[i + 1];
          points.push({ x: cx, y: cy });
        }
        break;
      case 'H': case 'h': cx = type === 'H' ? nums[0] : cx + nums[0]; points.push({ x: cx, y: cy }); break;
      case 'V': case 'v': cy = type === 'V' ? nums[0] : cy + nums[0]; points.push({ x: cx, y: cy }); break;
    }
  }
  return points;
}

function f(n: number) { return n.toFixed(6); }

// Geometry handles start at 0x200 (512) to stay clear of all structural handles below
let gHandle = 0x200;
function nextHandle(): string { return (gHandle++).toString(16).toUpperCase(); }

function lwpolyline(pts: Path, closed: boolean, layer: string, colorIdx: number): string {
  if (pts.length < 2) return '';
  const h = nextHandle();
  const rows = [
    '0', 'LWPOLYLINE',
    '5', h,
    '100', 'AcDbEntity',
    '8', layer,
    '62', String(colorIdx),
    '100', 'AcDbPolyline',
    '90', String(pts.length),
    '70', closed ? '1' : '0',
    '43', '0.0',
  ];
  for (const pt of pts) { rows.push('10', f(pt.x), '20', f(pt.y)); }
  return rows.join('\n');
}

export function exportDXF(panels: PanelData[]): string {
  gHandle = 0x200; // reset per export

  // ── 1. build geometry ───────────────────────────────────────────────────────
  const gap = 0; // zero gap — common-line cutting, panels touch
  let offsetX = 0;
  const entityLines: string[] = [];

  for (const p of panels) {
    const w = p.widthMm;
    const h = p.heightMm;

    // Outline (black → colorIdx 7)
    const outlinePts = parseSvgPathToPoints(p.outlinePath);
    const oFinal = (outlinePts.length >= 2
      ? outlinePts
      : [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }]
    ).map(pt => ({ x: pt.x + offsetX, y: pt.y }));
    entityLines.push(lwpolyline(oFinal, true, 'OUTLINE', 7));

    // Cut paths (red → colorIdx 1) — RDP simplified to keep file manageable
    // Top and Bottom are mirrored horizontally so the silhouette reads correctly
    // once the panel is flipped into its assembled position.
    const shouldMirror = p.panel === 'top' || p.panel === 'bottom';
    for (const seg of p.rawCutPaths) {
      if (seg.length < 2) continue;
      const simplified = seg.length > 3 ? rdpSimplify(seg, 0.4) : seg;
      if (simplified.length < 2) continue;
      const mapped = simplified.map(pt => ({
        x: shouldMirror ? (offsetX + w - pt.x) : (pt.x + offsetX),
        y: pt.y,
      }));
      entityLines.push(lwpolyline(mapped, false, 'CUT', 1));
    }

    offsetX += w + gap;
  }

  const totalW = offsetX > gap ? offsetX - gap : offsetX;
  const maxH   = panels.reduce((m, p) => Math.max(m, p.heightMm), 0);
  const entities = entityLines.filter(Boolean).join('\n');

  // ── 2. Assemble full DXF ────────────────────────────────────────────────────
  // All structural handles are hardcoded (fixed) to avoid collisions with geometry handles (≥0x200)
  return `\
0
SECTION
2
HEADER
9
$ACADVER
1
AC1015
9
$INSUNITS
70
4
9
$LUNITS
70
2
9
$EXTMIN
10
0.0
20
0.0
30
0.0
9
$EXTMAX
10
${f(totalW)}
20
${f(maxH)}
30
0.0
0
ENDSEC
0
SECTION
2
CLASSES
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
VPORT
5
8
100
AcDbSymbolTable
70
1
0
VPORT
5
AE
100
AcDbSymbolTableRecord
100
AcDbViewportTableRecord
2
*Active
70
0
10
0.0
20
0.0
11
1.0
21
1.0
12
${f(totalW / 2)}
22
${f(maxH / 2)}
13
0.0
23
0.0
14
10.0
24
10.0
15
10.0
25
10.0
16
0.0
26
0.0
36
1.0
17
0.0
27
0.0
37
0.0
40
${f(maxH > 0 ? maxH : 100)}
41
${f(totalW > 0 ? totalW / maxH : 1)}
42
50.0
43
0.0
44
4.0
50
0.0
51
0.0
71
0
72
1000
73
1
74
1
75
0
76
0
77
0
78
0
0
ENDTAB
0
TABLE
2
LTYPE
5
5
100
AcDbSymbolTable
70
2
0
LTYPE
5
14
100
AcDbSymbolTableRecord
100
AcDbLinetypeTableRecord
2
ByLayer
70
0
3

72
65
73
0
40
0.0
0
LTYPE
5
15
100
AcDbSymbolTableRecord
100
AcDbLinetypeTableRecord
2
ByBlock
70
0
3

72
65
73
0
40
0.0
0
ENDTAB
0
TABLE
2
LAYER
5
2
100
AcDbSymbolTable
70
3
0
LAYER
5
30
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
2
0
70
0
62
7
6
Continuous
0
LAYER
5
31
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
2
OUTLINE
70
0
62
7
6
Continuous
0
LAYER
5
32
100
AcDbSymbolTableRecord
100
AcDbLayerTableRecord
2
CUT
70
0
62
1
6
Continuous
0
ENDTAB
0
TABLE
2
STYLE
5
3
100
AcDbSymbolTable
70
1
0
STYLE
5
11
100
AcDbSymbolTableRecord
100
AcDbTextStyleTableRecord
2
Standard
70
0
40
0.0
41
1.0
50
0.0
71
0
42
0.2
3
txt
4

0
ENDTAB
0
TABLE
2
VIEW
5
6
100
AcDbSymbolTable
70
0
0
ENDTAB
0
TABLE
2
UCS
5
7
100
AcDbSymbolTable
70
0
0
ENDTAB
0
TABLE
2
APPID
5
9
100
AcDbSymbolTable
70
1
0
APPID
5
12
100
AcDbSymbolTableRecord
100
AcDbRegAppTableRecord
2
ACAD
70
0
0
ENDTAB
0
TABLE
2
DIMSTYLE
5
A
100
AcDbSymbolTable
70
1
0
DIMSTYLE
5
27
100
AcDbSymbolTableRecord
100
AcDbDimStyleTableRecord
2
Standard
70
0
0
ENDTAB
0
ENDSEC
0
SECTION
2
BLOCKS
0
BLOCK
5
20
100
AcDbEntity
8
0
100
AcDbBlockBegin
2
*Model_Space
70
0
10
0.0
20
0.0
30
0.0
3
*Model_Space
1

0
ENDBLK
5
21
100
AcDbEntity
8
0
100
AcDbBlockEnd
0
BLOCK
5
1C
100
AcDbEntity
67
1
8
0
100
AcDbBlockBegin
2
*Paper_Space
70
0
10
0.0
20
0.0
30
0.0
3
*Paper_Space
1

0
ENDBLK
5
1D
100
AcDbEntity
67
1
8
0
100
AcDbBlockEnd
0
ENDSEC
0
SECTION
2
ENTITIES
${entities}
0
ENDSEC
0
SECTION
2
OBJECTS
0
DICTIONARY
5
C
100
AcDbDictionary
3
ACAD_GROUP
350
D
0
DICTIONARY
5
D
100
AcDbDictionary
0
ENDSEC
0
EOF`;
}
