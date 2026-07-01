
import { FACES, type Face, type Move, type MoveDirection } from './types';

const DIRS: MoveDirection[] = ['', "'", '2'];

export function randomScramble(length = 25, rng: () => number = Math.random): Move[] {
  const moves: Move[] = [];
  let lastFace: Face | null = null;
  for (let i = 0; i < length; i++) {

    const choices: readonly Face[] = lastFace === null ? FACES : FACES.filter((f) => f !== lastFace);
    const face = choices[Math.floor(rng() * choices.length)];
    lastFace = face;
    const dir = DIRS[Math.floor(rng() * DIRS.length)];
    moves.push({ face, dir });
  }
  return moves;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
