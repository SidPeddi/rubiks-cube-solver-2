
import { COLORS, type Color } from '../cube/types';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSV {
  h: number;
  s: number;
  v: number;
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rn) h = 60 * (((gn - bn) / delta) % 6);
    else if (max === gn) h = 60 * ((bn - rn) / delta + 2);
    else h = 60 * ((rn - gn) / delta + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

function hsvToCone({ h, s, v }: HSV): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const chroma = s * v;
  return [chroma * Math.cos(rad), chroma * Math.sin(rad), v];
}

function coneDistance(a: RGB, b: RGB): number {
  const [ax, ay, az] = hsvToCone(rgbToHsv(a));
  const [bx, by, bz] = hsvToCone(rgbToHsv(b));

  const dz = (az - bz) * 0.7;
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + dz * dz);
}

export const CANONICAL_ANCHORS: Record<Color, RGB> = {
  W: { r: 245, g: 245, b: 245 },
  Y: { r: 254, g: 213, b: 20 },
  G: { r: 0, g: 158, b: 80 },
  B: { r: 0, g: 81, b: 186 },
  R: { r: 200, g: 30, b: 45 },
  O: { r: 255, g: 100, b: 10 },
};

export function classifyAgainst(sample: RGB, references: { color: Color; rgb: RGB }[]): Color {
  let best = references[0].color;
  let bestDist = Infinity;
  for (const ref of references) {
    const d = coneDistance(sample, ref.rgb);
    if (d < bestDist) {
      bestDist = d;
      best = ref.color;
    }
  }
  return best;
}

export function recognizeFromSamples(samples: RGB[]): { colors: Color[]; confidence: number[] } {
  if (samples.length !== 54) {
    throw new Error(`Expected 54 samples, got ${samples.length}.`);
  }
  const centerIndices = [4, 13, 22, 31, 40, 49];

  const centerColors = assignCentersToColors(centerIndices.map((i) => samples[i]));
  const references = centerIndices.map((i, k) => ({ color: centerColors[k], rgb: samples[i] }));

  const cost = samples.map((s) => references.map((ref) => coneDistance(s, ref.rgb)));

  const refIdx = balancedAssign(cost, 9);

  const colors: Color[] = refIdx.map((k) => references[k].color);

  const confidence = cost.map((row, i) => {
    const assigned = row[refIdx[i]];
    let bestOther = Infinity;
    for (let k = 0; k < row.length; k++) if (k !== refIdx[i]) bestOther = Math.min(bestOther, row[k]);
    return Math.max(0, Math.min(1, (bestOther - assigned) / 0.25));
  });
  return { colors, confidence };
}

function balancedAssign(cost: number[][], capacity: number): number[] {
  const N = cost.length;
  const C = cost[0].length;
  const assign = new Array<number>(N).fill(-1);
  const remaining = new Array<number>(C).fill(capacity);

  const pairs: { i: number; c: number; d: number }[] = [];
  for (let i = 0; i < N; i++) for (let c = 0; c < C; c++) pairs.push({ i, c, d: cost[i][c] });
  pairs.sort((a, b) => a.d - b.d);
  let placed = 0;
  for (const p of pairs) {
    if (placed === N) break;
    if (assign[p.i] !== -1 || remaining[p.c] <= 0) continue;
    assign[p.i] = p.c;
    remaining[p.c]--;
    placed++;
  }

  let improved = true;
  while (improved) {
    improved = false;
    for (let a = 0; a < N; a++) {
      for (let b = a + 1; b < N; b++) {
        const ca = assign[a];
        const cb = assign[b];
        if (ca === cb) continue;
        const before = cost[a][ca] + cost[b][cb];
        const after = cost[a][cb] + cost[b][ca];
        if (after + 1e-9 < before) {
          assign[a] = cb;
          assign[b] = ca;
          improved = true;
        }
      }
    }
  }
  return assign;
}

function assignCentersToColors(centers: RGB[]): Color[] {
  const palette = COLORS as readonly Color[];

  const cost = centers.map((c) => palette.map((col) => coneDistance(c, CANONICAL_ANCHORS[col])));

  let bestPerm: number[] = [0, 1, 2, 3, 4, 5];
  let bestCost = Infinity;
  const perm: number[] = [];
  const used = new Array(6).fill(false);
  const recurse = (depth: number, acc: number): void => {
    if (acc >= bestCost) return;
    if (depth === 6) {
      if (acc < bestCost) {
        bestCost = acc;
        bestPerm = perm.slice();
      }
      return;
    }
    for (let c = 0; c < 6; c++) {
      if (used[c]) continue;
      used[c] = true;
      perm[depth] = c;
      recurse(depth + 1, acc + cost[depth][c]);
      used[c] = false;
    }
  };
  recurse(0, 0);
  return bestPerm.map((colorIdx) => palette[colorIdx]);
}

export function colorHistogram(colors: Color[]): Record<Color, number> {
  const counts = { W: 0, Y: 0, G: 0, B: 0, R: 0, O: 0 } as Record<Color, number>;
  for (const c of colors) if (COLORS.includes(c)) counts[c]++;
  return counts;
}
