
import { FACES, type Face, type FaceletState, type Move, type MoveDirection } from './types';

const CLOCKWISE_CYCLES: Record<Face, number[][]> = {

  U: [
    [0, 2, 8, 6],
    [1, 5, 7, 3],
    [18, 36, 45, 9],
    [19, 37, 46, 10],
    [20, 38, 47, 11],
  ],

  R: [
    [9, 11, 17, 15],
    [10, 14, 16, 12],
    [20, 2, 51, 29],
    [23, 5, 48, 32],
    [26, 8, 45, 35],
  ],

  F: [
    [18, 20, 26, 24],
    [19, 23, 25, 21],
    [6, 9, 29, 44],
    [7, 12, 28, 41],
    [8, 15, 27, 38],
  ],

  D: [
    [27, 29, 35, 33],
    [28, 32, 34, 30],
    [24, 15, 51, 42],
    [25, 16, 52, 43],
    [26, 17, 53, 44],
  ],

  L: [
    [36, 38, 44, 42],
    [37, 41, 43, 39],
    [0, 18, 27, 53],
    [3, 21, 30, 50],
    [6, 24, 33, 47],
  ],

  B: [
    [45, 47, 53, 51],
    [46, 50, 52, 48],
    [0, 42, 35, 11],
    [1, 39, 34, 14],
    [2, 36, 33, 17],
  ],
};

function buildPermutation(cycles: number[][]): number[] {
  const perm = Array.from({ length: 54 }, (_, i) => i);
  for (const cycle of cycles) {
    for (let k = 0; k < cycle.length; k++) {
      const from = cycle[k];
      const to = cycle[(k + 1) % cycle.length];
      perm[to] = from;
    }
  }
  return perm;
}

function invertPermutation(perm: number[]): number[] {
  const inv = new Array<number>(perm.length);
  for (let i = 0; i < perm.length; i++) inv[perm[i]] = i;
  return inv;
}

function applyPermutation(state: FaceletState, perm: number[]): FaceletState {
  const next = new Array<FaceletState[number]>(54);
  for (let i = 0; i < 54; i++) next[i] = state[perm[i]];
  return next;
}

const CW_PERM: Record<Face, number[]> = {} as Record<Face, number[]>;
const CCW_PERM: Record<Face, number[]> = {} as Record<Face, number[]>;
for (const face of FACES) {
  CW_PERM[face] = buildPermutation(CLOCKWISE_CYCLES[face]);
  CCW_PERM[face] = invertPermutation(CW_PERM[face]);
}

export function applyMove(state: FaceletState, move: Move): FaceletState {
  switch (move.dir) {
    case '':
      return applyPermutation(state, CW_PERM[move.face]);
    case "'":
      return applyPermutation(state, CCW_PERM[move.face]);
    case '2':
      return applyPermutation(applyPermutation(state, CW_PERM[move.face]), CW_PERM[move.face]);
  }
}

export function applyMoves(state: FaceletState, moves: Move[]): FaceletState {
  let s = state;
  for (const m of moves) s = applyMove(s, m);
  return s;
}

const FACE_SET = new Set<string>(FACES);

export function parseMoves(input: string): Move[] {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const moves: Move[] = [];
  for (const token of tokens) {
    const faceChar = token[0]?.toUpperCase();
    if (!faceChar || !FACE_SET.has(faceChar)) {
      throw new Error(`Invalid move "${token}": face must be one of U, D, L, R, F, B.`);
    }
    const suffix = token.slice(1);
    let dir: MoveDirection;
    if (suffix === '' ) dir = '';
    else if (suffix === "'" || suffix === '’') dir = "'";
    else if (suffix === '2') dir = '2';
    else throw new Error(`Invalid move "${token}": suffix must be empty, ' (prime), or 2.`);
    moves.push({ face: faceChar as Face, dir });
  }
  return moves;
}

export function formatMove(move: Move): string {
  return `${move.face}${move.dir}`;
}

export function formatMoves(moves: Move[]): string {
  return moves.map(formatMove).join(' ');
}

export function invertMove(move: Move): Move {
  if (move.dir === '2') return move;
  return { face: move.face, dir: move.dir === '' ? "'" : '' };
}

export function invertMoves(moves: Move[]): Move[] {
  return [...moves].reverse().map(invertMove);
}

const OPPOSITE: Record<Face, Face> = { U: 'D', D: 'U', R: 'L', L: 'R', F: 'B', B: 'F' };

export function simplifyMoves(moves: Move[]): Move[] {

  const toCount = (d: MoveDirection): number => (d === '' ? 1 : d === '2' ? 2 : 3);
  const fromCount = (c: number): MoveDirection | null => {
    const m = ((c % 4) + 4) % 4;
    if (m === 0) return null;
    if (m === 1) return '';
    if (m === 2) return '2';
    return "'";
  };
  const merge = (a: Move, b: Move): Move | null => {
    const dir = fromCount(toCount(a.dir) + toCount(b.dir));
    return dir === null ? null : { face: a.face, dir };
  };

  let result = [...moves];
  let changed = true;
  while (changed) {
    changed = false;
    const next: Move[] = [];
    for (const move of result) {
      const top = next[next.length - 1];
      const below = next[next.length - 2];
      if (top && top.face === move.face) {
        next.pop();
        const merged = merge(top, move);
        if (merged) next.push(merged);
        changed = true;
      } else if (top && below && below.face === move.face && top.face === OPPOSITE[move.face]) {

        const opp = next.pop()!;
        next.pop();
        const merged = merge(below, move);
        if (merged) next.push(merged);
        next.push(opp);
        changed = true;
      } else {
        next.push(move);
      }
    }
    result = next;
  }
  return result;
}
