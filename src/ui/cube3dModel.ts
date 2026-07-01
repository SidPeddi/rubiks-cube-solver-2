
import { FACE_BASE, type Face, type Move } from '../cube/types';

export interface Cubie {
  lx: number;
  ly: number;
  lz: number;
}

export const UNIT = 37;
export const TILE = 34;
const HALF = TILE / 2;

export const CUBIES: Cubie[] = (() => {
  const list: Cubie[] = [];
  for (let lx = -1; lx <= 1; lx++)
    for (let ly = -1; ly <= 1; ly++)
      for (let lz = -1; lz <= 1; lz++) {
        if (lx === 0 && ly === 0 && lz === 0) continue;
        list.push({ lx, ly, lz });
      }
  return list;
})();

export function inLayer(face: Face, c: Cubie): boolean {
  switch (face) {
    case 'U':
      return c.ly === 1;
    case 'D':
      return c.ly === -1;
    case 'R':
      return c.lx === 1;
    case 'L':
      return c.lx === -1;
    case 'F':
      return c.lz === 1;
    case 'B':
      return c.lz === -1;
  }
}

export function visibleFaces(c: Cubie): Face[] {
  const faces: Face[] = [];
  if (c.ly === 1) faces.push('U');
  if (c.ly === -1) faces.push('D');
  if (c.lx === 1) faces.push('R');
  if (c.lx === -1) faces.push('L');
  if (c.lz === 1) faces.push('F');
  if (c.lz === -1) faces.push('B');
  return faces;
}

export function stickerFacelet(face: Face, c: Cubie): number {
  const { lx, ly, lz } = c;
  switch (face) {
    case 'U':
      return FACE_BASE.U + (lz + 1) * 3 + (lx + 1);
    case 'D':
      return FACE_BASE.D + (1 - lz) * 3 + (lx + 1);
    case 'F':
      return FACE_BASE.F + (1 - ly) * 3 + (lx + 1);
    case 'B':
      return FACE_BASE.B + (1 - ly) * 3 + (1 - lx);
    case 'R':
      return FACE_BASE.R + (1 - ly) * 3 + (1 - lz);
    case 'L':
      return FACE_BASE.L + (1 - ly) * 3 + (lz + 1);
  }
}

export const FACE_TILE_TRANSFORM: Record<Face, string> = {
  U: `rotateX(90deg) translateZ(${HALF}px)`,
  D: `rotateX(-90deg) translateZ(${HALF}px)`,
  F: `translateZ(${HALF}px)`,
  B: `rotateY(180deg) translateZ(${HALF}px)`,
  R: `rotateY(90deg) translateZ(${HALF}px)`,
  L: `rotateY(-90deg) translateZ(${HALF}px)`,
};

const AXIS: Record<Face, 'X' | 'Y' | 'Z'> = { U: 'Y', D: 'Y', R: 'X', L: 'X', F: 'Z', B: 'Z' };
const CW_ANGLE: Record<Face, number> = { U: -90, D: 90, R: 90, L: -90, F: 90, B: -90 };

export function moveRotation(move: Move): string {
  const base = CW_ANGLE[move.face];
  const angle = move.dir === '' ? base : move.dir === "'" ? -base : base * 2;
  return `rotate${AXIS[move.face]}(${angle}deg)`;
}
