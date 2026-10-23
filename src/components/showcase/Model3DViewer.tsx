import { useEffect, useMemo, useRef, useState } from 'react';
import { Box, RotateCcw, ZoomIn, ZoomOut, Grid, Play, Pause } from 'lucide-react';
import type { Model3DFormat } from '@/lib/showcaseMedia';

type Vec3 = [number, number, number];
interface MeshData {
  vertices: Vec3[];
  faces: number[][];
}

function normalizeMesh(vertices: Vec3[], faces: number[][]): MeshData {
  if (vertices.length === 0) return { vertices: [], faces: [] };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const [x, y, z] of vertices) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-5) / 2;
  const normVerts: Vec3[] = vertices.map(([x, y, z]) => [
    (x - cx) / span,
    (y - cy) / span,
    (z - cz) / span,
  ]);
  return { vertices: normVerts, faces };
}

function parseObj(text: string): MeshData {
  const vertices: Vec3[] = [];
  const faces: number[][] = [];
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith('v ')) {
      const parts = line.split(/\s+/);
      if (parts.length >= 4) {
        const x = parseFloat(parts[1]);
        const y = parseFloat(parts[2]);
        const z = parseFloat(parts[3]);
        if (!Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(z)) {
          vertices.push([x, y, z]);
        }
      }
    } else if (line.startsWith('f ')) {
      const parts = line.split(/\s+/).slice(1);
      const indices: number[] = [];
      for (const p of parts) {
        const idx = parseInt(p.split('/')[0], 10);
        if (!Number.isNaN(idx)) {
          const resolved = idx > 0 ? idx - 1 : vertices.length + idx;
          if (resolved >= 0) indices.push(resolved);
        }
      }
      if (indices.length >= 3) {
        for (let i = 1; i < indices.length - 1; i++) {
          faces.push([indices[0], indices[i], indices[i + 1]]);
        }
      }
    }
  }
  return normalizeMesh(vertices, faces);
}

function parseAsciiStl(text: string): MeshData {
  const vertices: Vec3[] = [];
  const faces: number[][] = [];
  const regex = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const x = parseFloat(match[1]);
    const y = parseFloat(match[2]);
    const z = parseFloat(match[3]);
    if (!Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(z)) {
      vertices.push([x, y, z]);
      if (vertices.length % 3 === 0) {
        const n = vertices.length;
        faces.push([n - 3, n - 2, n - 1]);
      }
    }
  }
  return normalizeMesh(vertices, faces);
}

function buildPresetMesh(presetId: string): MeshData {
  const vertices: Vec3[] = [];
  const faces: number[][] = [];

  if (presetId === 'telescope') {
    const segments = 24;
    const rings = [
      { z: -1.1, r: 0.42 },
      { z: 0.1, r: 0.42 },
      { z: 0.12, r: 0.32 },
      { z: 0.85, r: 0.32 },
      { z: 0.87, r: 0.22 },
      { z: 1.2, r: 0.22 },
    ];
    rings.forEach((ring) => {
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        vertices.push([Math.cos(a) * ring.r, Math.sin(a) * ring.r, ring.z]);
      }
    });
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        const a = r * segments + i;
        const b = r * segments + next;
        const c = (r + 1) * segments + next;
        const d = (r + 1) * segments + i;
        faces.push([a, b, c], [a, c, d]);
      }
    }
    return normalizeMesh(vertices, faces);
  }

  if (presetId === 'pendulum') {
    const addBox = (cx: number, cy: number, cz: number, sx: number, sy: number, sz: number) => {
      const base = vertices.length;
      for (const dx of [-sx, sx]) {
        for (const dy of [-sy, sy]) {
          for (const dz of [-sz, sz]) {
            vertices.push([cx + dx, cy + dy, cz + dz]);
          }
        }
      }
      const boxFaces = [
        [0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1],
        [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3],
      ];
      for (const [a, b, c, d] of boxFaces) {
        faces.push([base + a, base + b, base + c], [base + a, base + c, base + d]);
      }
    };
    addBox(0, 0.85, 0, 0.9, 0.06, 0.08);
    addBox(-0.82, 0, 0, 0.06, 0.85, 0.08);
    addBox(0.82, 0, 0, 0.06, 0.85, 0.08);
    addBox(0, -0.85, 0, 0.95, 0.05, 0.45);
    addBox(-0.32, 0.15, 0.08, 0.02, 0.65, 0.02);
    addBox(0.32, 0.15, -0.08, 0.02, 0.65, 0.02);
    addBox(-0.32, -0.45, 0.12, 0.16, 0.16, 0.16);
    addBox(0.32, -0.45, -0.12, 0.16, 0.16, 0.16);
    return normalizeMesh(vertices, faces);
  }

  // Default: tokamak torus mesh
  const majorSegs = 28;
  const minorSegs = 14;
  const R = 0.72;
  const r = 0.28;
  for (let i = 0; i < majorSegs; i++) {
    const u = (i / majorSegs) * Math.PI * 2;
    for (let j = 0; j < minorSegs; j++) {
      const v = (j / minorSegs) * Math.PI * 2;
      const x = (R + r * Math.cos(v)) * Math.cos(u);
      const z = (R + r * Math.cos(v)) * Math.sin(u);
      const y = r * Math.sin(v);
      vertices.push([x, y, z]);
    }
  }
  for (let i = 0; i < majorSegs; i++) {
    const nextI = (i + 1) % majorSegs;
    for (let j = 0; j < minorSegs; j++) {
      const nextJ = (j + 1) % minorSegs;
      const a = i * minorSegs + j;
      const b = nextI * minorSegs + j;
      const c = nextI * minorSegs + nextJ;
      const d = i * minorSegs + nextJ;
      faces.push([a, b, c], [a, c, d]);
    }
  }
  return normalizeMesh(vertices, faces);
}

export default function Model3DViewer({
  format,
  data,
  title,
}: {
  format: Model3DFormat;
  data: string;
  title: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [yaw, setYaw] = useState(0.6);
  const [pitch, setPitch] = useState(0.42);
  const [zoom, setZoom] = useState(1);
  const [wireframe, setWireframe] = useState(false);
  const [autoSpin, setAutoSpin] = useState(true);
  const dragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });

  const mesh = useMemo(() => {
    if (format === 'obj') {
      const parsed = parseObj(data);
      if (parsed.vertices.length > 0 && parsed.faces.length > 0) return parsed;
    } else if (format === 'stl') {
      const parsed = parseAsciiStl(data);
      if (parsed.vertices.length > 0 && parsed.faces.length > 0) return parsed;
    }
    return buildPresetMesh(data || 'tokamak');
  }, [format, data]);

  useEffect(() => {
    if (!autoSpin) return;
    let raf = 0;
    const tick = () => {
      setYaw((prev) => prev + 0.012);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoSpin]);

  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;

    const w = cvs.width;
    const h = cvs.height;
    ctx.clearRect(0, 0, w, h);

    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);

    const transformed: Vec3[] = mesh.vertices.map(([x, y, z]) => {
      const x1 = x * cosY - z * sinY;
      const z1 = x * sinY + z * cosY;
      const y2 = y * cosP - z1 * sinP;
      const z2 = y * sinP + z1 * cosP;
      return [x1, y2, z2];
    });

    const scale = Math.min(w, h) * 0.34 * zoom;
    const project = ([x, y, z]: Vec3): [number, number, number] => {
      const perspective = 3.2 / (3.2 + z * 0.65);
      return [w / 2 + x * scale * perspective, h / 2 - y * scale * perspective, z];
    };

    const projected = transformed.map(project);

    const faceItems = mesh.faces.map((face) => {
      const v0 = transformed[face[0]];
      const v1 = transformed[face[1]];
      const v2 = transformed[face[2]];
      if (!v0 || !v1 || !v2) return null;
      const ux = v1[0] - v0[0], uy = v1[1] - v0[1], uz = v1[2] - v0[2];
      const vx = v2[0] - v0[0], vy = v2[1] - v0[1], vz = v2[2] - v0[2];
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz) || 1;
      const light = Math.max(0.18, (nx * 0.35 + ny * 0.55 - nz * 0.75) / len);
      const depth = (v0[2] + v1[2] + v2[2]) / 3;
      return { face, depth, light };
    }).filter((x): x is { face: number[]; depth: number; light: number } => x !== null);

    faceItems.sort((a, b) => b.depth - a.depth);

    for (const item of faceItems) {
      const p0 = projected[item.face[0]];
      const p1 = projected[item.face[1]];
      const p2 = projected[item.face[2]];
      if (!p0 || !p1 || !p2) continue;

      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]);
      ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.closePath();

      if (!wireframe) {
        const r = Math.round(35 + item.light * 75);
        const g = Math.round(95 + item.light * 120);
        const b = Math.round(180 + item.light * 70);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
        ctx.lineWidth = 0.6;
        ctx.stroke();
      } else {
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }, [mesh, yaw, pitch, zoom, wireframe]);

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-950 text-slate-100 select-none">
      <div className="flex flex-wrap items-center justify-between gap-2 pl-4 pr-14 py-2 bg-slate-900 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <Box size={14} className="text-cyan-400 shrink-0" />
          <span className="font-semibold truncate">{title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 shrink-0">
            3D 网格检视 ({mesh.vertices.length} 顶点 · {mesh.faces.length} 面)
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setAutoSpin((s) => !s)}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1 transition"
          >
            {autoSpin ? <Pause size={12} /> : <Play size={12} />}
            {autoSpin ? '暂停旋转' : '自动旋转'}
          </button>
          <button
            type="button"
            onClick={() => setWireframe((w) => !w)}
            className={`px-2 py-1 rounded-lg inline-flex items-center gap-1 transition ${
              wireframe ? 'bg-cyan-600 text-white' : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
            }`}
          >
            <Grid size={12} />
            {wireframe ? '实体着色' : '线框网格'}
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.2).toFixed(2)))}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            title="放大"
            aria-label="放大模型"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.2).toFixed(2)))}
            className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200"
            title="缩小"
            aria-label="缩小模型"
          >
            <ZoomOut size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              setYaw(0.6);
              setPitch(0.42);
              setZoom(1);
            }}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 inline-flex items-center gap-1 transition"
          >
            <RotateCcw size={12} />
            复位视角
          </button>
        </div>
      </div>

      <div className="relative bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={680}
          height={380}
          onPointerDown={(e) => {
            setAutoSpin(false);
            dragRef.current = { active: true, x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            if (!dragRef.current.active) return;
            const dx = e.clientX - dragRef.current.x;
            const dy = e.clientY - dragRef.current.y;
            dragRef.current = { active: true, x: e.clientX, y: e.clientY };
            setYaw((prev) => prev + dx * 0.01);
            setPitch((prev) => Math.max(-1.4, Math.min(1.4, prev + dy * 0.01)));
          }}
          onPointerUp={() => {
            dragRef.current.active = false;
          }}
          onPointerLeave={() => {
            dragRef.current.active = false;
          }}
          className="w-full max-h-[55vh] cursor-grab active:cursor-grabbing"
        />
        <div className="absolute bottom-2.5 left-3.5 text-[11px] text-slate-400 pointer-events-none">
          按住拖拽可 360° 旋转检视 · 当前缩放 {Math.round(zoom * 100)}%
        </div>
      </div>
    </div>
  );
}
