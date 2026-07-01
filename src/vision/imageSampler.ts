
import type { RGB } from './colorClassify';

export interface ImageLike {
  data: Uint8ClampedArray | number[];
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function averageRGB(img: ImageLike, cx: number, cy: number, half: number): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  const x0 = Math.max(0, Math.floor(cx - half));
  const x1 = Math.min(img.width - 1, Math.ceil(cx + half));
  const y0 = Math.max(0, Math.floor(cy - half));
  const y1 = Math.min(img.height - 1, Math.ceil(cy + half));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const idx = (y * img.width + x) * 4;
      r += img.data[idx];
      g += img.data[idx + 1];
      b += img.data[idx + 2];
      n++;
    }
  }
  if (n === 0) return { r: 0, g: 0, b: 0 };
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

export function sampleGrid(img: ImageLike, rect: Rect, grid = 3, patchFraction = 0.5): RGB[] {
  const cellW = rect.width / grid;
  const cellH = rect.height / grid;
  const half = (Math.min(cellW, cellH) * patchFraction) / 2;
  const samples: RGB[] = [];
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const cx = rect.x + (col + 0.5) * cellW;
      const cy = rect.y + (row + 0.5) * cellH;
      samples.push(averageRGB(img, cx, cy, half));
    }
  }
  return samples;
}

export function defaultFaceRect(img: ImageLike): Rect {
  const size = Math.min(img.width, img.height);
  return {
    x: (img.width - size) / 2,
    y: (img.height - size) / 2,
    width: size,
    height: size,
  };
}

export interface Point {
  x: number;
  y: number;
}

export type Quad = [Point, Point, Point, Point];

export function quadPoint(q: Quad, u: number, v: number): Point {
  const top = { x: q[0].x + (q[1].x - q[0].x) * u, y: q[0].y + (q[1].y - q[0].y) * u };
  const bot = { x: q[3].x + (q[2].x - q[3].x) * u, y: q[3].y + (q[2].y - q[3].y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

function pixelAt(img: ImageLike, x: number, y: number): RGB {
  const px = Math.max(0, Math.min(img.width - 1, Math.round(x)));
  const py = Math.max(0, Math.min(img.height - 1, Math.round(y)));
  const idx = (py * img.width + px) * 4;
  return { r: img.data[idx], g: img.data[idx + 1], b: img.data[idx + 2] };
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function sampleQuadGrid(img: ImageLike, quad: Quad, grid = 3, patchFrac = 0.6, n = 5): RGB[] {
  const out: RGB[] = [];
  const pad = (1 - patchFrac) / 2;
  for (let row = 0; row < grid; row++) {
    for (let col = 0; col < grid; col++) {
      const rs: number[] = [];
      const gs: number[] = [];
      const bs: number[] = [];
      const u0 = (col + pad) / grid;
      const u1 = (col + 1 - pad) / grid;
      const v0 = (row + pad) / grid;
      const v1 = (row + 1 - pad) / grid;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const u = u0 + ((u1 - u0) * (i + 0.5)) / n;
          const v = v0 + ((v1 - v0) * (j + 0.5)) / n;
          const p = quadPoint(quad, u, v);
          const px = pixelAt(img, p.x, p.y);
          rs.push(px.r);
          gs.push(px.g);
          bs.push(px.b);
        }
      }
      out.push({ r: median(rs), g: median(gs), b: median(bs) });
    }
  }
  return out;
}
