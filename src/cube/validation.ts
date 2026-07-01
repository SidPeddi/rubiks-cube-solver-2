
import { CENTER_INDEX, COLOR_NAMES, COLORS, FACES, type Color, type Face, type FaceletState } from './types';
import { CORNER_COLORS, CORNER_FACELETS, CORNER_NAMES, EDGE_COLORS, EDGE_FACELETS, EDGE_NAMES } from './cubies';

export interface CubieState {
  cp: number[];
  co: number[];
  ep: number[];
  eo: number[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  cubies?: CubieState;
}

function permutationParity(perm: number[]): number {
  const seen = new Array<boolean>(perm.length).fill(false);
  let transpositions = 0;
  for (let i = 0; i < perm.length; i++) {
    if (seen[i]) continue;
    let j = i;
    let cycleLen = 0;
    while (!seen[j]) {
      seen[j] = true;
      j = perm[j];
      cycleLen++;
    }
    transpositions += cycleLen - 1;
  }
  return transpositions % 2;
}

export function validateState(state: FaceletState): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(state) || state.length !== 54) {
    return { ok: false, errors: [`Cube must have exactly 54 stickers (got ${state?.length ?? 0}).`] };
  }
  const colorSet = new Set<string>(COLORS);
  for (let i = 0; i < 54; i++) {
    if (!colorSet.has(state[i])) {
      errors.push(`Sticker ${i} has an unknown color "${state[i]}".`);
    }
  }
  if (errors.length) return { ok: false, errors };

  const counts: Record<Color, number> = { W: 0, Y: 0, G: 0, B: 0, R: 0, O: 0 };
  for (const c of state) counts[c]++;
  const wrong = (Object.keys(counts) as Color[]).filter((c) => counts[c] !== 9);
  if (wrong.length) {
    const detail = wrong.map((c) => `${COLOR_NAMES[c]}: ${counts[c]}`).join(', ');
    errors.push(`Each color must appear exactly 9 times.\nOff by: ${detail}.`);
  }

  const centerColors = FACES.map((f) => state[CENTER_INDEX[f]]);
  const distinctCenters = new Set(centerColors);
  if (distinctCenters.size !== 6) {
    errors.push('The 6 center stickers must all be different colors.');

    return { ok: false, errors };
  }
  const colorToFace = new Map<Color, Face>();
  FACES.forEach((f, idx) => colorToFace.set(centerColors[idx], f));

  const fl: Face[] = state.map((c) => colorToFace.get(c)!);

  const cp = new Array<number>(8).fill(-1);
  const co = new Array<number>(8).fill(0);
  const cornerKey = (labels: Face[]) => labels.join('');
  const cornerLookup = new Map<string, number>();
  CORNER_COLORS.forEach((labels, j) => cornerLookup.set(cornerKey(labels), j));

  for (let i = 0; i < 8; i++) {
    const p = CORNER_FACELETS[i].map((idx) => fl[idx]) as Face[];
    const udPositions = [0, 1, 2].filter((k) => p[k] === 'U' || p[k] === 'D');
    if (udPositions.length !== 1) {
      errors.push(
        `Corner ${CORNER_NAMES[i]} has colors that don't form a real corner (a corner must have exactly one U/D-face color).`,
      );
      continue;
    }
    const ori = udPositions[0];

    const rotated = [p[ori], p[(ori + 1) % 3], p[(ori + 2) % 3]];
    const j = cornerLookup.get(cornerKey(rotated));
    if (j === undefined) {
      errors.push(`Corner ${CORNER_NAMES[i]} (${p.join('/')}) is not a real cube corner.`);
      continue;
    }
    cp[i] = j;
    co[i] = ori;
  }

  const ep = new Array<number>(12).fill(-1);
  const eo = new Array<number>(12).fill(0);
  const edgeLookup = new Map<string, number>();
  EDGE_COLORS.forEach((labels, j) => {
    edgeLookup.set(labels.join(''), j);
  });
  for (let i = 0; i < 12; i++) {
    const a = fl[EDGE_FACELETS[i][0]];
    const b = fl[EDGE_FACELETS[i][1]];
    let matched = false;
    const direct = edgeLookup.get(a + b);
    const flipped = edgeLookup.get(b + a);
    if (direct !== undefined) {
      ep[i] = direct;
      eo[i] = 0;
      matched = true;
    } else if (flipped !== undefined) {
      ep[i] = flipped;
      eo[i] = 1;
      matched = true;
    }
    if (!matched) {
      errors.push(`Edge ${EDGE_NAMES[i]} (${a}/${b}) is not a real cube edge.`);
    }
  }

  if (errors.length) return { ok: false, errors };

  const cornerUsed = new Array<number>(8).fill(0);
  cp.forEach((j) => cornerUsed[j]++);
  if (cornerUsed.some((n) => n !== 1)) {
    errors.push('Some corner piece is duplicated or missing — each corner must appear exactly once.');
  }
  const edgeUsed = new Array<number>(12).fill(0);
  ep.forEach((j) => edgeUsed[j]++);
  if (edgeUsed.some((n) => n !== 1)) {
    errors.push('Some edge piece is duplicated or missing — each edge must appear exactly once.');
  }
  if (errors.length) return { ok: false, errors };

  const coSum = co.reduce((a, b) => a + b, 0);
  if (coSum % 3 !== 0) {
    errors.push('A single corner is twisted in place — this scramble is not physically reachable.');
  }
  const eoSum = eo.reduce((a, b) => a + b, 0);
  if (eoSum % 2 !== 0) {
    errors.push('A single edge is flipped in place — this scramble is not physically reachable.');
  }
  if (permutationParity(cp) !== permutationParity(ep)) {
    errors.push('Exactly two pieces are swapped — this scramble is not physically reachable.');
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], cubies: { cp, co, ep, eo } };
}

export function isValidState(state: FaceletState): boolean {
  return validateState(state).ok;
}
