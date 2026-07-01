
import { FACE_BASE, type Face } from '../cube/types';

export const FACE_GRID_AREA: Record<Face, string> = {
  U: 'u',
  L: 'l',
  F: 'f',
  R: 'r',
  B: 'b',
  D: 'd',
};

export function faceletIndex(face: Face, local: number): number {
  return FACE_BASE[face] + local;
}

export const FACE_LABEL: Record<Face, string> = {
  U: 'Up',
  D: 'Down',
  L: 'Left',
  R: 'Right',
  F: 'Front',
  B: 'Back',
};
