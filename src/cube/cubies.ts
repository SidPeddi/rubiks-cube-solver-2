
import { FACE_BASE, FACES, type Face } from './types';

export const CORNER_FACELETS: readonly (readonly [number, number, number])[] = [
  [8, 9, 20],
  [6, 18, 38],
  [0, 36, 47],
  [2, 45, 11],
  [29, 26, 15],
  [27, 44, 24],
  [33, 53, 42],
  [35, 17, 51],
] as const;

export const CORNER_NAMES = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'] as const;

export const EDGE_FACELETS: readonly (readonly [number, number])[] = [
  [5, 10],
  [7, 19],
  [3, 37],
  [1, 46],
  [32, 16],
  [28, 25],
  [30, 43],
  [34, 52],
  [23, 12],
  [21, 41],
  [50, 39],
  [48, 14],
] as const;

export const EDGE_NAMES = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'] as const;

export const FACE_OF_INDEX: Face[] = (() => {
  const arr = new Array<Face>(54);
  for (const face of FACES) {
    const base = FACE_BASE[face];
    for (let i = 0; i < 9; i++) arr[base + i] = face;
  }
  return arr;
})();

export const CORNER_COLORS: Face[][] = CORNER_FACELETS.map((c) => c.map((i) => FACE_OF_INDEX[i]));

export const EDGE_COLORS: Face[][] = EDGE_FACELETS.map((e) => e.map((i) => FACE_OF_INDEX[i]));
