
import type { ImageLike, Quad } from './imageSampler';

type P = { x: number; y: number };

function lum(img: ImageLike, x: number, y: number): number {
  const W = img.width;
  const H = img.height;
  const xi = Math.max(0, Math.min(W - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(H - 1, Math.round(y)));
  const i = (yi * W + xi) * 4;
  return 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
}

function fitLine(pts: P[]): { p: P; d: P } | null {
  if (pts.length < 3) return null;
  let mx = 0;
  let my = 0;
  for (const q of pts) {
    mx += q.x;
    my += q.y;
  }
  mx /= pts.length;
  my /= pts.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const q of pts) {
    const dx = q.x - mx;
    const dy = q.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }

  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lambda = tr / 2 + disc;
  let dx = sxy;
  let dy = lambda - sxx;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) {
    dx = lambda - syy;
    dy = sxy;
  }
  const len = Math.hypot(dx, dy) || 1;
  return { p: { x: mx, y: my }, d: { x: dx / len, y: dy / len } };
}

function intersect(a: { p: P; d: P }, b: { p: P; d: P }): P | null {
  const det = a.d.x * -b.d.y - -b.d.x * a.d.y;
  if (Math.abs(det) < 1e-6) return null;
  const rx = b.p.x - a.p.x;
  const ry = b.p.y - a.p.y;
  const s = (rx * -b.d.y - -b.d.x * ry) / det;
  return { x: a.p.x + s * a.d.x, y: a.p.y + s * a.d.y };
}

function refineEdge(img: ImageLike, A: P, B: P, center: P, win: number): { p: P; d: P } | null {
  const ex = B.x - A.x;
  const ey = B.y - A.y;
  const elen = Math.hypot(ex, ey) || 1;
  const dirx = ex / elen;
  const diry = ey / elen;

  let nx = -diry;
  let ny = dirx;
  const midx = (A.x + B.x) / 2;
  const midy = (A.y + B.y) / 2;
  if (nx * (midx - center.x) + ny * (midy - center.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  const hits: P[] = [];
  const SAMPLES = 24;
  for (let s = 0; s < SAMPLES; s++) {
    const t = 0.12 + (0.76 * s) / (SAMPLES - 1);
    const px = A.x + t * ex;
    const py = A.y + t * ey;
    let bestG = 0;
    let bestD = 0;
    for (let d = -win; d <= win; d++) {
      const g = Math.abs(
        lum(img, px + (d + 1) * nx, py + (d + 1) * ny) - lum(img, px + (d - 1) * nx, py + (d - 1) * ny),
      );
      if (g > bestG) {
        bestG = g;
        bestD = d;
      }
    }
    if (bestG > 16) hits.push({ x: px + bestD * nx, y: py + bestD * ny });
  }
  return fitLine(hits);
}

export function refineQuad(img: ImageLike, quad: Quad): Quad {
  const W = img.width;
  const H = img.height;
  const px = quad.map((p) => ({ x: p.x * W, y: p.y * H })) as P[];
  const [TL, TR, BR, BL] = px;
  const center = {
    x: (TL.x + TR.x + BR.x + BL.x) / 4,
    y: (TL.y + TR.y + BR.y + BL.y) / 4,
  };
  const side =
    (Math.hypot(TR.x - TL.x, TR.y - TL.y) + Math.hypot(BR.x - BL.x, BR.y - BL.y)) / 2;
  const win = Math.max(3, Math.min(40, Math.round(side * 0.08)));

  const top = refineEdge(img, TL, TR, center, win);
  const right = refineEdge(img, TR, BR, center, win);
  const bottom = refineEdge(img, BR, BL, center, win);
  const left = refineEdge(img, BL, TL, center, win);
  if (!top || !right || !bottom || !left) return quad;

  const nTL = intersect(left, top);
  const nTR = intersect(top, right);
  const nBR = intersect(right, bottom);
  const nBL = intersect(bottom, left);
  if (!nTL || !nTR || !nBR || !nBL) return quad;

  const maxDrift = side * 0.18;
  const refined = [nTL, nTR, nBR, nBL];
  for (let i = 0; i < 4; i++) {
    if (Math.hypot(refined[i].x - px[i].x, refined[i].y - px[i].y) > maxDrift) return quad;
  }
  return refined.map((p) => ({
    x: Math.max(0, Math.min(1, p.x / W)),
    y: Math.max(0, Math.min(1, p.y / H)),
  })) as Quad;
}
