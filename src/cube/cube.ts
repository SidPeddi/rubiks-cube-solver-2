
import { applyMove, applyMoves, parseMoves } from './moves';
import {
  CENTER_INDEX,
  DEFAULT_SCHEME,
  FACES,
  FACE_BASE,
  type Color,
  type Face,
  type FaceletState,
  type Move,
} from './types';

export function createSolved(scheme: Record<Face, Color> = DEFAULT_SCHEME): FaceletState {
  const state = new Array<Color>(54);
  for (const face of FACES) {
    const base = FACE_BASE[face];
    for (let i = 0; i < 9; i++) state[base + i] = scheme[face];
  }
  return state;
}

export function cloneState(state: FaceletState): FaceletState {
  return state.slice();
}

export function centerColors(state: FaceletState): Record<Face, Color> {
  return {
    U: state[CENTER_INDEX.U],
    R: state[CENTER_INDEX.R],
    F: state[CENTER_INDEX.F],
    D: state[CENTER_INDEX.D],
    L: state[CENTER_INDEX.L],
    B: state[CENTER_INDEX.B],
  };
}

export function isSolved(state: FaceletState): boolean {
  for (const face of FACES) {
    const base = FACE_BASE[face];
    const c = state[base + 4];
    for (let i = 0; i < 9; i++) {
      if (state[base + i] !== c) return false;
    }
  }
  return true;
}

export function statesEqual(a: FaceletState, b: FaceletState): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export class Cube {
  readonly state: FaceletState;

  constructor(state?: FaceletState) {
    this.state = state ? state.slice() : createSolved();
  }

  static solved(scheme?: Record<Face, Color>): Cube {
    return new Cube(createSolved(scheme));
  }

  move(move: Move): Cube {
    return new Cube(applyMove(this.state, move));
  }

  apply(moves: Move[] | string): Cube {
    const list = typeof moves === 'string' ? parseMoves(moves) : moves;
    return new Cube(applyMoves(this.state, list));
  }

  isSolved(): boolean {
    return isSolved(this.state);
  }

  clone(): Cube {
    return new Cube(this.state);
  }
}
