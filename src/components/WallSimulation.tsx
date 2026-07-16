import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BoxConfig, PanelData, Path } from '../types';

interface WallSimulationProps {
  contours: Path[];
  panels: PanelData[];
  config: BoxConfig;
}

interface SceneState {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  ledLight: THREE.PointLight;
  ledMesh: THREE.Mesh;
  wallMesh: THREE.Mesh;
  wallCanvas: HTMLCanvasElement;
  wallTexture: THREE.CanvasTexture;
  panelGroup: THREE.Group;
  camState: {
    radius: number; theta: number; phi: number;
    target: THREE.Vector3; minR: number; maxR: number;
  };
  draw: () => void;
  resize: () => void;
  defaultRadius: number;
  framedOnce: boolean;
  lastDiag: number;
}

function buildWallTexture(
  s: SceneState,
  contours: Path[],
  config: BoxConfig,
) {
  const cv  = s.wallCanvas;
  const res = cv.width;
  const ctx = cv.getContext('2d')!;

  const W   = config.width;
  const H   = config.height;
  const ss  = config.shadowScale ?? 4;
  const mar = 3.0;
  const viewW = W * ss * mar;
  const viewH = H * ss * mar;

  ctx.fillStyle = '#030e09';
  ctx.fillRect(0, 0, res, res);

  const shadowRad = (config.shadowRotation ?? 0) * Math.PI / 180;
  const cosSR = Math.cos(shadowRad);
  const sinSR = Math.sin(shadowRad);
  const offX  = config.silhouetteOffsetX ?? 0;
  const offY  = config.silhouetteOffsetY ?? 0;

  const toWall = (px: number, py: number) => {
    const dx = px - 0.5, dy = py - 0.5;
    return {
      x:  (dx * cosSR - dy * sinSR) * W * ss + offX,
      y: -(dx * sinSR + dy * cosSR) * H * ss + offY,
    };
  };
  const toCv = (wx: number, wy: number) => ({
    cx: ( wx / viewW + 0.5) * res,
    cy: (-wy / viewH + 0.5) * res,
  });

  // Filled glow silhouette
  ctx.save();
  ctx.shadowColor = '#00ffaa';
  ctx.shadowBlur  = 22;
  ctx.fillStyle   = '#1a6a48';
  contours.forEach(path => {
    if (path.length < 2) return;
    ctx.beginPath();
    const c0 = toCv(...Object.values(toWall(path[0].x, path[0].y)) as [number, number]);
    ctx.moveTo(c0.cx, c0.cy);
    for (let i = 1; i < path.length; i++) {
      const c = toCv(...Object.values(toWall(path[i].x, path[i].y)) as [number, number]);
      ctx.lineTo(c.cx, c.cy);
    }
    ctx.closePath();
    ctx.fill('evenodd');
  });
  ctx.restore();

  // Crisp edge overlay
  ctx.save();
  ctx.strokeStyle = '#2dd9b0';
  ctx.lineWidth   = 1.5;
  ctx.shadowColor = '#2dd9b0';
  ctx.shadowBlur  = 8;
  contours.forEach(path => {
    if (path.length < 2) return;
    ctx.beginPath();
    const c0 = toCv(...Object.values(toWall(path[0].x, path[0].y)) as [number, number]);
    ctx.moveTo(c0.cx, c0.cy);
    for (let i = 1; i < path.length; i++) {
      const c = toCv(...Object.values(toWall(path[i].x, path[i].y)) as [number, number]);
      ctx.lineTo(c.cx, c.cy);
    }
    ctx.closePath();
    ctx.stroke();
  });
  ctx.restore();

  s.wallTexture.needsUpdate = true;
  s.wallMesh.scale.set(viewW / 4000, viewH / 4000, 1);
}

function buildPanelGeometry(
  cutPaths: Path[],
  dimW: number,
  outlineExtra: number,   // extend outline by this amount on each U-side (fills corner gap)
  depth: number,
  thick: number,
  basis: { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 },
  pos: THREE.Vector3,
  color: number,
): THREE.Mesh {
  const holeOffsetU    = dimW / 2;          // holes stay at the panel's natural centre
  const outlineHalfW   = dimW / 2 + outlineExtra; // outline is wider to close corner gaps

  const makeShape = (withHoles: boolean) => {
    const shape = new THREE.Shape();
    shape.moveTo(-outlineHalfW, 0);
    shape.lineTo( outlineHalfW, 0);
    shape.lineTo( outlineHalfW, depth);
    shape.lineTo(-outlineHalfW, depth);
    shape.closePath();

    if (withHoles) {
      cutPaths.forEach(path => {
        if (path.length < 3) return;
        const hole = new THREE.Path();
        hole.moveTo(path[0].x - holeOffsetU, path[0].y);
        for (let i = 1; i < path.length; i++) {
          hole.lineTo(path[i].x - holeOffsetU, path[i].y);
        }
        hole.closePath();
        shape.holes.push(hole);
      });
    }
    return shape;
  };

  const applyTransform = (geo: THREE.BufferGeometry) => {
    const m4 = new THREE.Matrix4();
    m4.makeBasis(basis.x, basis.y, basis.z);
    m4.setPosition(pos.x, pos.y, pos.z);
    geo.applyMatrix4(m4);
    return geo;
  };

  const extOptions = { depth: thick, bevelEnabled: false, steps: 1, curveSegments: 1 };
  let geo: THREE.BufferGeometry;
  try {
    geo = applyTransform(new THREE.ExtrudeGeometry(makeShape(true), extOptions));
  } catch {
    geo = applyTransform(new THREE.ExtrudeGeometry(makeShape(false), extOptions));
  }

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function WallSimulation({ contours, panels, config }: WallSimulationProps) {
  const mountRef  = useRef<HTMLDivElement>(null);
  const sceneRef  = useRef<SceneState | null>(null);
  const dragRef   = useRef({ dragging: false, lastX: 0, lastY: 0 });
  const pinchRef  = useRef<{ startDist: number; startRadius: number } | null>(null);

  // ── ONE-TIME INIT ─────────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // WebGL check
    const probe = document.createElement('canvas');
    const hasGL = !!(
      probe.getContext('webgl2') ||
      probe.getContext('webgl') ||
      (probe.getContext as any)('experimental-webgl')
    );
    if (!hasGL) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch { return; }

    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width   = '100%';
    renderer.domElement.style.height  = '100%';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04100c);

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 5000);
    scene.add(new THREE.AmbientLight(0x224433, 0.9));

    const ledLight = new THREE.PointLight(0xffcc66, 300, 0, 2);
    ledLight.castShadow = false;
    scene.add(ledLight);

    const ledMesh = new THREE.Mesh(
      new THREE.SphereGeometry(4, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffcc66 }),
    );
    scene.add(ledMesh);

    const wallCanvas = document.createElement('canvas');
    wallCanvas.width  = 512;
    wallCanvas.height = 512;
    const wallTexture = new THREE.CanvasTexture(wallCanvas);
    const wallMesh    = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshBasicMaterial({ map: wallTexture }),
    );
    scene.add(wallMesh);

    const panelGroup = new THREE.Group();
    scene.add(panelGroup);

    const camState = {
      radius: 400, theta: 0.7, phi: 1.05,
      target: new THREE.Vector3(0, 0, 40),
      minR: 80, maxR: 2500,
    };

    const applyCam = () => {
      const { radius, theta, phi, target } = camState;
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.sin(theta),
        target.y + radius * Math.cos(phi),
        target.z + radius * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(target);
    };
    const draw   = () => { applyCam(); renderer.render(scene, camera); };
    const resize = () => {
      const w = mount.clientWidth  || 300;
      const h = mount.clientHeight || 300;
      if (w <= 0 || h <= 0) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      draw();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const el = renderer.domElement;

    // Pointer drag (works for both mouse and single-finger touch)
    const onPointerDown = (e: PointerEvent) => {
      dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
      try { el.setPointerCapture(e.pointerId); } catch {}
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.dragging) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      camState.theta -= dx * 0.008;
      camState.phi    = Math.min(Math.PI - 0.05, Math.max(0.05, camState.phi - dy * 0.008));
      draw();
    };
    const onPointerUp = () => { dragRef.current.dragging = false; };

    el.addEventListener('pointerdown',  onPointerDown);
    el.addEventListener('pointermove',  onPointerMove);
    (['pointerup', 'pointercancel', 'pointerleave'] as const).forEach(ev =>
      el.addEventListener(ev, onPointerUp),
    );

    // Scroll zoom
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camState.radius = Math.min(camState.maxR, Math.max(camState.minR,
        camState.radius * (1 + e.deltaY * 0.0012)));
      draw();
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    // Pinch zoom (two-finger)
    const touchDist = (t: TouchList) =>
      Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        dragRef.current.dragging = false;
        pinchRef.current = { startDist: touchDist(e.touches), startRadius: camState.radius };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchRef.current) {
        e.preventDefault();
        const d = touchDist(e.touches);
        camState.radius = Math.min(camState.maxR, Math.max(camState.minR,
          pinchRef.current.startRadius * (pinchRef.current.startDist / d)));
        draw();
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    el.addEventListener('touchend',   onTouchEnd,   { passive: true });

    sceneRef.current = {
      renderer, scene, camera, ledLight, ledMesh,
      wallMesh, wallCanvas, wallTexture, panelGroup,
      camState, draw, resize,
      defaultRadius: 400, framedOnce: false, lastDiag: 0,
    };

    resize();

    return () => {
      ro.disconnect();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      (['pointerup', 'pointercancel', 'pointerleave'] as const).forEach(ev =>
        el.removeEventListener(ev, onPointerUp),
      );
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
      el.removeEventListener('touchend',   onTouchEnd);
      renderer.dispose();
      if (mount.contains(el)) mount.removeChild(el);
      sceneRef.current = null;
    };
  }, []);

  // ── REBUILD GEOMETRY WHEN DATA CHANGES ───────────────────────────────────
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;

    const W     = config.width;
    const H     = config.height;
    const D     = config.depth;
    const thick = config.materialThickness;
    const V3    = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // Clear previous panel meshes
    while (s.panelGroup.children.length) {
      const m = s.panelGroup.children.pop() as THREE.Mesh;
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => mt.dispose());
    }

    // Panel data lookup
    const pdMap: Record<string, PanelData> = {};
    panels.forEach(p => { pdMap[p.panel] = p; });

    type PanelDef = {
      key: 'top' | 'bottom' | 'left' | 'right';
      dimW: number;
      // outlineExtra: extend the solid outline beyond the cut-path area on each U-side.
      // Top/Bottom use `thick` so the panel "wraps" the corner gap left by the side panels.
      // Right/Left use 0 — they fit flush between the (already-extended) top/bottom panels.
      outlineExtra: number;
      basis: { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 };
      pos: THREE.Vector3;
    };

    const defs: PanelDef[] = [
      { key: 'top',    dimW: W, outlineExtra: thick, basis: { x: V3(1,0,0), y: V3(0,0,1), z: V3(0, 1,0) }, pos: V3(0,  H/2, 0) },
      { key: 'bottom', dimW: W, outlineExtra: thick, basis: { x: V3(1,0,0), y: V3(0,0,1), z: V3(0,-1,0) }, pos: V3(0, -H/2, 0) },
      { key: 'right',  dimW: H, outlineExtra: 0,     basis: { x: V3(0,1,0), y: V3(0,0,1), z: V3( 1,0,0) }, pos: V3( W/2, 0, 0) },
      { key: 'left',   dimW: H, outlineExtra: 0,     basis: { x: V3(0,1,0), y: V3(0,0,1), z: V3(-1,0,0) }, pos: V3(-W/2, 0, 0) },
    ];

    const PANEL_COLOR = 0x2a3838;
    for (const def of defs) {
      const pd = pdMap[def.key];
      const cuts = pd ? pd.rawCutPaths : [];
      s.panelGroup.add(buildPanelGeometry(cuts, def.dimW, def.outlineExtra, D, thick, def.basis, def.pos, PANEL_COLOR));
    }

    // Back plate (solid rectangle, mounts to wall at z=0)
    {
      const shape = new THREE.Shape([
        new THREE.Vector2(-W/2, -H/2),
        new THREE.Vector2( W/2, -H/2),
        new THREE.Vector2( W/2,  H/2),
        new THREE.Vector2(-W/2,  H/2),
      ]);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, steps: 1, curveSegments: 1 });
      const m4  = new THREE.Matrix4();
      m4.makeBasis(V3(1,0,0), V3(0,1,0), V3(0,0,-1));
      m4.setPosition(0, 0, 0);
      geo.applyMatrix4(m4);
      const back = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x1f2b2b, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide }));
      back.castShadow    = true;
      back.receiveShadow = true;
      s.panelGroup.add(back);
    }

    // LED
    s.ledLight.position.set(config.ledX, config.ledY, config.ledZ);
    s.ledMesh.position.copy(s.ledLight.position);

    // Wall texture + plane
    s.wallMesh.position.set(0, 0, -2);
    buildWallTexture(s, contours, config);

    // Camera framing
    const diag     = Math.hypot(W, H, D);
    const desiredR = Math.max(150, diag * 1.6);
    s.camState.target.set(0, 0, D / 2);
    s.camState.minR = diag * 0.3;
    s.camState.maxR = diag * 8;
    s.defaultRadius = desiredR;
    if (!s.framedOnce || Math.abs(s.lastDiag - diag) > diag * 0.4) {
      s.camState.radius = desiredR;
      s.framedOnce = true;
    }
    s.lastDiag = diag;

    s.resize();
    s.draw();
  }, [panels, contours, config]);

  const handleReset = () => {
    const s = sceneRef.current;
    if (!s) return;
    s.camState.theta  = 0.7;
    s.camState.phi    = 1.05;
    s.camState.radius = s.defaultRadius;
    s.draw();
  };

  return (
    <div className="w-full h-full relative bg-[#04100c] rounded-2xl overflow-hidden" style={{ touchAction: 'none' }}>
      {/* Labels */}
      <div className="absolute top-2 left-3 text-[9px] font-mono text-primary uppercase tracking-widest opacity-70 z-10 pointer-events-none select-none">
        3D Preview
      </div>
      <button
        onClick={handleReset}
        className="absolute top-2 right-3 flex items-center gap-1 text-[9px] font-mono text-muted-foreground uppercase tracking-widest opacity-60 hover:opacity-100 transition-opacity z-10 bg-transparent border-0 cursor-pointer"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>
        </svg>
        Reset view
      </button>
      <div className="absolute bottom-2 left-0 right-0 flex justify-center z-10 pointer-events-none select-none">
        <span className="text-[9px] font-mono text-muted-foreground/40">drag to rotate · pinch or scroll to zoom</span>
      </div>
      {/* Three.js canvas mount point */}
      <div ref={mountRef} className="w-full h-full" />
    </div>
  );
}
