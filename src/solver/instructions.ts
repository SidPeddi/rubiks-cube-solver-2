
import { formatMove } from '../cube/moves';
import type { Face, Move } from '../cube/types';

export type TurnDirection = 'cw' | 'ccw' | '180';

export interface MoveInstruction {
  move: Move;

  notation: string;
  face: Face;

  faceName: string;

  facePosition: string;
  direction: TurnDirection;

  directionLabel: string;

  text: string;
}

const FACE_NAME: Record<Face, string> = {
  U: 'Up',
  D: 'Down',
  L: 'Left',
  R: 'Right',
  F: 'Front',
  B: 'Back',
};

const FACE_POSITION: Record<Face, string> = {
  U: 'top face',
  D: 'bottom face',
  L: 'left face',
  R: 'right face',
  F: 'front face',
  B: 'back face',
};

const DIRECTION_LABEL: Record<TurnDirection, string> = {
  cw: 'clockwise (90°)',
  ccw: 'counter-clockwise (90°)',
  '180': 'a half turn (180°)',
};

export function describeMove(move: Move): MoveInstruction {
  const direction: TurnDirection = move.dir === '' ? 'cw' : move.dir === "'" ? 'ccw' : '180';
  const faceName = FACE_NAME[move.face];
  return {
    move,
    notation: formatMove(move),
    face: move.face,
    faceName,
    facePosition: FACE_POSITION[move.face],
    direction,
    directionLabel: DIRECTION_LABEL[direction],
    text: `Turn the ${faceName} face ${DIRECTION_LABEL[direction]}.`,
  };
}
