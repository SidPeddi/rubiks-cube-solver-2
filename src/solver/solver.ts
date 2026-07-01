
import { formatMoves } from '../cube/moves';
import type { FaceletState, Move } from '../cube/types';
import { validateState } from '../cube/validation';
import { solveLayerByLayerSegmented, type SolutionPhase } from './layerByLayer';
import { verifySolution } from './verify';

export interface SolveResult {
  ok: boolean;

  error?: string;

  solution: Move[];

  solutionString: string;

  phases: SolutionPhase[];

  verified: boolean;

  moveCount: number;
}

export function solve(state: FaceletState): SolveResult {
  const validation = validateState(state);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.errors.join(' '),
      solution: [],
      solutionString: '',
      phases: [],
      verified: false,
      moveCount: 0,
    };
  }

  let phases: SolutionPhase[];
  let solution: Move[];
  try {
    phases = solveLayerByLayerSegmented(state);
    solution = phases.flatMap((p) => p.moves);
  } catch (e) {
    return {
      ok: false,
      error: `Solver failed unexpectedly: ${(e as Error).message}`,
      solution: [],
      solutionString: '',
      phases: [],
      verified: false,
      moveCount: 0,
    };
  }

  const verified = verifySolution(state, solution);
  if (!verified) {
    return {
      ok: false,
      error:
        'Internal error: the generated solution did not verify. Please report this scramble. ' +
        'No incorrect solution will be shown.',
      solution,
      solutionString: formatMoves(solution),
      phases,
      verified: false,
      moveCount: solution.length,
    };
  }

  return {
    ok: true,
    solution,
    solutionString: formatMoves(solution),
    phases,
    verified: true,
    moveCount: solution.length,
  };
}
