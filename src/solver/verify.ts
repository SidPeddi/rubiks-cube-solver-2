
import { applyMoves } from '../cube/moves';
import { isSolved } from '../cube/cube';
import type { FaceletState, Move } from '../cube/types';

export function verifySolution(initial: FaceletState, solution: Move[]): boolean {
  return isSolved(applyMoves(initial, solution));
}
