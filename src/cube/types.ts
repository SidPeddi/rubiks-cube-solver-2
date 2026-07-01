
export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'] as const;
export type Face = (typeof FACES)[number];

export const FACE_BASE: Record<Face, number> = {
  U: 0,
  R: 9,
  F: 18,
  D: 27,
  L: 36,
  B: 45,
};

export const CENTER_INDEX: Record<Face, number> = {
  U: 4,
  R: 13,
  F: 22,
  D: 31,
  L: 40,
  B: 49,
};

export const COLORS = ['W', 'Y', 'G', 'B', 'R', 'O'] as const;
export type Color = (typeof COLORS)[number];

export const COLOR_NAMES: Record<Color, string> = {
  W: 'White',
  Y: 'Yellow',
  G: 'Green',
  B: 'Blue',
  R: 'Red',
  O: 'Orange',
};

export const COLOR_HEX: Record<Color, string> = {
  W: '#f8fafc',
  Y: '#fde047',
  G: '#22c55e',
  B: '#3b82f6',
  R: '#ef4444',
  O: '#f97316',
};

export const DEFAULT_SCHEME: Record<Face, Color> = {
  U: 'W',
  R: 'R',
  F: 'G',
  D: 'Y',
  L: 'O',
  B: 'B',
};

export type FaceletState = Color[];

export type MoveDirection = '' | "'" | '2';

export interface Move {

  face: Face;

  dir: MoveDirection;
}
