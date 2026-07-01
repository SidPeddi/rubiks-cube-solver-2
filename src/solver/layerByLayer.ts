
import { applyMoves, parseMoves, simplifyMoves } from '../cube/moves';
import { centerColors, createSolved, isSolved } from '../cube/cube';
import { CENTER_INDEX, type Color, type Face, type FaceletState, type Move } from '../cube/types';
import { CORNER_FACELETS, EDGE_FACELETS } from '../cube/cubies';

const UR = 0, UF = 1, UL = 2, UB = 3;

const URF = 0, UFL = 1, ULB = 2, UBR = 3, DFR = 4, DLF = 5, DBL = 6, DRB = 7;

const SIDE_CYCLE: Face[] = ['F', 'R', 'B', 'L'];
function rightOf(face: Face): Face {
  return SIDE_CYCLE[(SIDE_CYCLE.indexOf(face) + 1) % 4];
}

const MAX_PHASE_ITERS = 30;

const ALL_MOVES = [
  'U', "U'", 'U2', 'D', "D'", 'D2', 'L', "L'", 'L2', 'R', "R'", 'R2', 'F', "F'", 'F2', 'B', "B'", 'B2',
];
const PARSED_ALL_MOVES = ALL_MOVES.map((m) => parseMoves(m));

function crossSig(s: FaceletState, cD: Color, center: Record<Face, Color>): string {
  let sig = '';
  for (const side of SIDE_CYCLE) {
    const target = center[side];
    for (let e = 0; e < 12; e++) {
      const c0 = s[EDGE_FACELETS[e][0]];
      const c1 = s[EDGE_FACELETS[e][1]];
      if (c0 === cD && c1 === target) {
        sig += `${e}.0|`;
        break;
      }
      if (c1 === cD && c0 === target) {
        sig += `${e}.1|`;
        break;
      }
    }
  }
  return sig;
}

let CROSS_PDB: Map<string, number> | null = null;
function getCrossPdb(): Map<string, number> {
  if (CROSS_PDB) return CROSS_PDB;

  const solved = createSolved();
  const cD = solved[CENTER_INDEX.D];
  const center = centerColors(solved);
  const pdb = new Map<string, number>();
  pdb.set(crossSig(solved, cD, center), 0);
  let frontier: FaceletState[] = [solved];
  let depth = 0;
  while (frontier.length) {
    const next: FaceletState[] = [];
    for (const st of frontier) {
      for (let i = 0; i < PARSED_ALL_MOVES.length; i++) {
        const ns = applyMoves(st, PARSED_ALL_MOVES[i]);
        const sig = crossSig(ns, cD, center);
        if (!pdb.has(sig)) {
          pdb.set(sig, depth + 1);
          next.push(ns);
        }
      }
    }
    frontier = next;
    depth++;
  }
  CROSS_PDB = pdb;
  return pdb;
}

class LayerSolver {
  state: FaceletState;
  readonly moves: Move[] = [];

  readonly cU: Color;
  readonly cD: Color;
  readonly center: Record<Face, Color>;

  constructor(state: FaceletState) {
    this.state = state.slice();
    this.cU = state[CENTER_INDEX.U];
    this.cD = state[CENTER_INDEX.D];
    this.center = centerColors(state);
  }

  do(notation: string): void {
    const ms = parseMoves(notation);
    this.state = applyMoves(this.state, ms);
    for (const m of ms) this.moves.push(m);
  }

  private color(i: number): Color {
    return this.state[i];
  }

  private findCorner(a: Color, b: Color, c: Color): number {
    const want = [a, b, c].sort().join('');
    for (let s = 0; s < 8; s++) {
      const cols = CORNER_FACELETS[s].map((i) => this.state[i]).sort().join('');
      if (cols === want) return s;
    }
    return -1;
  }

  private crossSolved(): boolean {
    return this.crossSolvedIn(this.state);
  }

  private crossSolvedIn(s: FaceletState): boolean {
    return SIDE_CYCLE.every((side) => {
      const { dFacelet, sFacelet } = BOTTOM_EDGE[side];
      return s[dFacelet] === this.cD && s[sFacelet] === this.center[side];
    });
  }

  private solveCross(): void {
    const pdb = getCrossPdb();
    let dist = pdb.get(crossSig(this.state, this.cD, this.center)) ?? 0;
    let guard = 0;
    while (dist > 0 && guard++ < 12) {
      for (let i = 0; i < PARSED_ALL_MOVES.length; i++) {
        const ns = applyMoves(this.state, PARSED_ALL_MOVES[i]);
        if ((pdb.get(crossSig(ns, this.cD, this.center)) ?? Infinity) === dist - 1) {
          this.state = ns;
          for (const m of PARSED_ALL_MOVES[i]) this.moves.push(m);
          dist--;
          break;
        }
      }
    }
  }

  private firstLayerCornersSolved(): boolean {
    return SIDE_CYCLE.every((f) => this.cornerSolvedDown(f));
  }

  private cornerSolvedDown(side: Face): boolean {
    const pillar = PILLAR[side];
    const { dFacelet, fFacelet, rFacelet } = pillar;
    return (
      this.color(dFacelet) === this.cD &&
      this.color(fFacelet) === this.center[side] &&
      this.color(rFacelet) === this.center[rightOf(side)]
    );
  }

  private solveFirstLayerCorners(): void {
    for (let pass = 0; pass < 6 && !this.firstLayerCornersSolved(); pass++) {
      for (const side of SIDE_CYCLE) {
        this.placeFirstLayerCorner(side);
      }
    }
  }

  private placeFirstLayerCorner(side: Face): void {
    const r = rightOf(side);
    const colors: [Color, Color, Color] = [this.cD, this.center[side], this.center[r]];
    const slot = FL_CORNER[side];

    for (let iter = 0; iter < MAX_PHASE_ITERS; iter++) {
      if (this.cornerSolvedDown(side)) return;
      const at = this.findCorner(colors[0], colors[1], colors[2]);

      if (at === DFR || at === DLF || at === DBL || at === DRB) {
        this.do(`${BOTTOM_CORNER_RIGHT[at]} U ${BOTTOM_CORNER_RIGHT[at]}'`);
        continue;
      }

      this.alignTopCornerAbove(colors, slot.uCorner);
      const rf = slot.rightFace;
      if (this.color(slot.topFacelet) === this.cD) {

        this.do(`${rf} U2 ${rf}' U' ${rf} U ${rf}'`);
      } else if (this.color(slot.rightFacelet) === this.cD) {
        this.do(`${rf} U ${rf}'`);
      } else {
        this.do(`${slot.frontFace}' U' ${slot.frontFace}`);
      }
    }
  }

  private alignTopCornerAbove(colors: [Color, Color, Color], uCornerSlot: number): void {
    for (let i = 0; i < 4; i++) {
      if (this.findCorner(colors[0], colors[1], colors[2]) === uCornerSlot) return;
      this.do('U');
    }
  }

  private middleSolved(): boolean {
    return (
      this.middleSlotSolved('F') && this.middleSlotSolved('R') && this.middleSlotSolved('B') && this.middleSlotSolved('L')
    );
  }

  private middleSlotSolved(side: Face): boolean {
    const r = rightOf(side);
    const { sFacelet, rFacelet } = MIDDLE[side];
    return this.color(sFacelet) === this.center[side] && this.color(rFacelet) === this.center[r];
  }

  private solveMiddle(): void {
    for (let iter = 0; iter < 4 * MAX_PHASE_ITERS && !this.middleSolved(); iter++) {

      let placed = false;
      for (const slot of [UF, UR, UB, UL]) {
        const c0 = this.color(EDGE_FACELETS[slot][0]);
        const c1 = this.color(EDGE_FACELETS[slot][1]);
        if (c0 !== this.cU && c0 !== this.cD && c1 !== this.cU && c1 !== this.cD) {
          this.insertMiddleFromTop();
          placed = true;
          break;
        }
      }
      if (placed) continue;

      for (const side of SIDE_CYCLE) {
        if (!this.middleSlotSolved(side)) {
          this.middleRightInsert(side);
          break;
        }
      }
    }
  }

  private insertMiddleFromTop(): void {

    for (let i = 0; i < 4; i++) {
      for (const slot of [UF, UR, UB, UL]) {
        const upColor = this.color(EDGE_FACELETS[slot][0]);
        const sideColor = this.color(EDGE_FACELETS[slot][1]);
        if (upColor === this.cU || upColor === this.cD || sideColor === this.cU || sideColor === this.cD) continue;

        const faceOfSlot = TOP_EDGE_SIDE[slot];
        if (sideColor === this.center[faceOfSlot]) {

          if (upColor === this.center[rightOf(faceOfSlot)]) {
            this.middleRightInsert(faceOfSlot);
          } else {
            this.middleLeftInsert(faceOfSlot);
          }
          return;
        }
      }
      this.do('U');
    }
  }

  private middleRightInsert(side: Face): void {
    const r = rightOf(side);

    this.do(`U ${r} U' ${r}' U' ${side}' U ${side}`);
  }

  private middleLeftInsert(side: Face): void {
    const l = rightOf(rightOf(rightOf(side)));

    this.do(`U' ${l}' U ${l} U ${side} U' ${side}'`);
  }

  private topCrossCount(): number {
    let n = 0;
    for (const slot of [UF, UR, UB, UL]) if (this.color(EDGE_FACELETS[slot][0]) === this.cU) n++;
    return n;
  }

  private solveTopCross(): void {
    for (let iter = 0; iter < 6 && this.topCrossCount() !== 4; iter++) {
      const oriented = {
        UF: this.color(EDGE_FACELETS[UF][0]) === this.cU,
        UR: this.color(EDGE_FACELETS[UR][0]) === this.cU,
        UB: this.color(EDGE_FACELETS[UB][0]) === this.cU,
        UL: this.color(EDGE_FACELETS[UL][0]) === this.cU,
      };
      const count = (oriented.UF ? 1 : 0) + (oriented.UR ? 1 : 0) + (oriented.UB ? 1 : 0) + (oriented.UL ? 1 : 0);
      if (count === 0) {

        this.do("F R U R' U' F'");
      } else if (count === 2) {
        if (oriented.UF && oriented.UB) {

          this.do('U');
          this.do("F R U R' U' F'");
        } else if (oriented.UL && oriented.UR) {

          this.do("F R U R' U' F'");
        } else {

          this.orientLShapeToBackLeft(oriented);
          this.do("F R U R' U' F'");
        }
      } else {

        this.do("F R U R' U' F'");
      }
    }
  }

  private orientLShapeToBackLeft(o: { UF: boolean; UR: boolean; UB: boolean; UL: boolean }): void {

    let turns = 0;
    if (o.UB && o.UL) turns = 0;
    else if (o.UL && o.UF) turns = 1;
    else if (o.UF && o.UR) turns = 2;
    else if (o.UR && o.UB) turns = 3;
    for (let i = 0; i < turns; i++) this.do('U');
  }

  private allTopCornersOriented(): boolean {
    return (
      this.color(8) === this.cU && this.color(6) === this.cU && this.color(0) === this.cU && this.color(2) === this.cU
    );
  }

  private solveOrientLLCorners(): void {
    this.searchMacros(['U', "U'", 'U2', SUNE, ANTISUNE], (s) => this.topCornersOrientedIn(s), 8);
  }

  private topCornersOrientedIn(s: FaceletState): boolean {
    return s[8] === this.cU && s[6] === this.cU && s[0] === this.cU && s[2] === this.cU;
  }

  private solvePermuteLL(): void {
    this.searchMacros([CORNER_3CYCLE, EDGE_3CYCLE, 'U', "U'", 'U2'], (s) => isSolved(s), 12);
  }

  private searchMacros(
    macros: string[],
    goal: (s: FaceletState) => boolean,
    maxDepth: number,
    signature: (s: FaceletState) => string = (s) => s.join(''),
  ): boolean {
    if (goal(this.state)) return true;
    const parsed = macros.map((m) => parseMoves(m));

    const queue: { state: FaceletState; seq: Move[]; depth: number }[] = [{ state: this.state, seq: [], depth: 0 }];
    const visited = new Set<string>([signature(this.state)]);
    for (let head = 0; head < queue.length; head++) {
      const node = queue[head];
      if (node.depth >= maxDepth) continue;
      for (let mi = 0; mi < parsed.length; mi++) {
        const ns = applyMoves(node.state, parsed[mi]);
        const key = signature(ns);
        if (visited.has(key)) continue;
        visited.add(key);
        const seq = node.seq.concat(parsed[mi]);
        if (goal(ns)) {
          this.state = ns;
          for (const m of seq) this.moves.push(m);
          return true;
        }
        queue.push({ state: ns, seq, depth: node.depth + 1 });
      }
    }
    return false;
  }

  private phases(): { name: string; label: string; description: string; run: () => void; ok: () => boolean }[] {
    return [
      {
        name: 'cross',
        label: 'Bottom cross',
        description: 'Build a plus sign on the bottom face by placing its four edges so each side colour matches its centre.',
        run: () => this.solveCross(),
        ok: () => this.crossSolved(),
      },
      {
        name: 'first-layer',
        label: 'First-layer corners',
        description: 'Drop the four bottom corners into place to finish the entire first layer.',
        run: () => this.solveFirstLayerCorners(),
        ok: () => this.firstLayerCornersSolved(),
      },
      {
        name: 'middle-layer',
        label: 'Middle-layer edges',
        description: 'Insert the four edges of the middle layer, completing the bottom two layers.',
        run: () => this.solveMiddle(),
        ok: () => this.middleSolved(),
      },
      {
        name: 'top-cross',
        label: 'Top cross',
        description: 'Flip the last-layer edges so they form a cross on the top face.',
        run: () => this.solveTopCross(),
        ok: () => this.topCrossCount() === 4,
      },
      {
        name: 'orient-corners',
        label: 'Orient the top corners',
        description: 'Twist the last-layer corners so the whole top face becomes one solid colour.',
        run: () => this.solveOrientLLCorners(),
        ok: () => this.allTopCornersOriented(),
      },
      {
        name: 'permute-last-layer',
        label: 'Finish the last layer',
        description: 'Slide the last-layer pieces into their final spots to solve the cube.',
        run: () => this.solvePermuteLL(),
        ok: () => isSolved(this.state),
      },
    ];
  }

  solve(): Move[] {
    return this.solveSegmented().flatMap((p) => p.moves);
  }

  solveSegmented(): SolutionPhase[] {
    const segments: SolutionPhase[] = [];
    for (const phase of this.phases()) {
      const before = this.moves.length;
      phase.run();
      const raw = this.moves.slice(before);
      segments.push({
        id: phase.name,
        label: phase.label,
        description: phase.description,
        moves: simplifyMoves(raw),
      });
    }
    return segments;
  }

  runFirstPhases(n: number): { state: FaceletState; moves: Move[] } {
    const phases = this.phases();
    for (let i = 0; i < n && i < phases.length; i++) phases[i].run();
    return { state: this.state, moves: this.moves };
  }

  solveWithTrace(): { firstBadPhase: string | null; trace: { name: string; ok: boolean }[] } {
    const trace: { name: string; ok: boolean }[] = [];
    let firstBadPhase: string | null = null;
    for (const phase of this.phases()) {
      phase.run();
      const ok = phase.ok();
      trace.push({ name: phase.name, ok });
      if (!ok && firstBadPhase === null) firstBadPhase = phase.name;
    }
    return { firstBadPhase, trace };
  }
}

export interface SolutionPhase {
  id: string;
  label: string;
  description: string;
  moves: Move[];
}

const BOTTOM_EDGE: Record<Face, { dFacelet: number; sFacelet: number }> = {
  F: { dFacelet: 28, sFacelet: 25 },
  R: { dFacelet: 32, sFacelet: 16 },
  B: { dFacelet: 34, sFacelet: 52 },
  L: { dFacelet: 30, sFacelet: 43 },
  U: { dFacelet: -1, sFacelet: -1 },
  D: { dFacelet: -1, sFacelet: -1 },
};

const TOP_EDGE_SIDE: Record<number, Face> = { [UF]: 'F', [UR]: 'R', [UB]: 'B', [UL]: 'L' };

const MIDDLE: Record<Face, { sFacelet: number; rFacelet: number }> = {
  F: { sFacelet: 23, rFacelet: 12 }, // FR: F-face 23, R-face 12
  R: { sFacelet: 14, rFacelet: 48 }, // BR: R-face 14, B-face 48
  B: { sFacelet: 50, rFacelet: 39 }, // BL: B-face 50, L-face 39
  L: { sFacelet: 41, rFacelet: 21 }, // FL: L-face 41, F-face 21
  U: { sFacelet: -1, rFacelet: -1 },
  D: { sFacelet: -1, rFacelet: -1 },
};

const PILLAR: Record<Face, { dFacelet: number; fFacelet: number; rFacelet: number; uCorner: number }> = {

  F: { dFacelet: 29, fFacelet: 26, rFacelet: 15, uCorner: URF },

  R: { dFacelet: 35, fFacelet: 17, rFacelet: 51, uCorner: UBR },

  B: { dFacelet: 33, fFacelet: 53, rFacelet: 42, uCorner: ULB },

  L: { dFacelet: 27, fFacelet: 44, rFacelet: 24, uCorner: UFL },
  U: { dFacelet: -1, fFacelet: -1, rFacelet: -1, uCorner: -1 },
  D: { dFacelet: -1, fFacelet: -1, rFacelet: -1, uCorner: -1 },
};

const BOTTOM_CORNER_RIGHT: Record<number, string> = { [DFR]: 'R', [DRB]: 'B', [DBL]: 'L', [DLF]: 'F' };

const FL_CORNER: Record<
  Face,
  { uCorner: number; topFacelet: number; rightFacelet: number; frontFacelet: number; rightFace: Face; frontFace: Face }
> = {
  F: { uCorner: URF, topFacelet: 8, rightFacelet: 9, frontFacelet: 20, rightFace: 'R', frontFace: 'F' },
  R: { uCorner: UBR, topFacelet: 2, rightFacelet: 45, frontFacelet: 11, rightFace: 'B', frontFace: 'R' },
  B: { uCorner: ULB, topFacelet: 0, rightFacelet: 36, frontFacelet: 47, rightFace: 'L', frontFace: 'B' },
  L: { uCorner: UFL, topFacelet: 6, rightFacelet: 18, frontFacelet: 38, rightFace: 'F', frontFace: 'L' },
  U: { uCorner: -1, topFacelet: -1, rightFacelet: -1, frontFacelet: -1, rightFace: 'U', frontFace: 'U' },
  D: { uCorner: -1, topFacelet: -1, rightFacelet: -1, frontFacelet: -1, rightFace: 'D', frontFace: 'D' },
};

const SUNE = "R U R' U R U2 R'";
const ANTISUNE = "R U2 R' U' R U' R'";

const CORNER_3CYCLE = "R' F R' B2 R F' R' B2 R2";

const EDGE_3CYCLE = "R U' R U R U R U' R' U' R2";

export function solveLayerByLayer(state: FaceletState): Move[] {
  return new LayerSolver(state).solve();
}

export function solveLayerByLayerSegmented(state: FaceletState): SolutionPhase[] {
  return new LayerSolver(state).solveSegmented();
}

export function traceSolve(state: FaceletState): { firstBadPhase: string | null; trace: { name: string; ok: boolean }[] } {
  return new LayerSolver(state).solveWithTrace();
}

export function debugRunPhases(state: FaceletState, n: number): { state: FaceletState; moves: Move[] } {
  const solver = new LayerSolver(state);
  return solver.runFirstPhases(n);
}
