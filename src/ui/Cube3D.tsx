import { useLayoutEffect, useRef, useState } from 'react';
import { applyMove, invertMove } from '../cube/moves';
import { COLOR_HEX, type Color, type Face, type FaceletState, type Move } from '../cube/types';
import {
  CUBIES,
  FACE_TILE_TRANSFORM,
  UNIT,
  TILE,
  type Cubie,
  inLayer,
  moveRotation,
  stickerFacelet,
  visibleFaces,
} from './cube3dModel';

interface Props {
  state: FaceletState;

  animateMove?: { move: Move; nonce: number } | null;

  highlightFace?: Face | null;
}

const DURATION = 320;
const ROTATION_STEP = 6;

export function Cube3D({ state, animateMove = null, highlightFace = null }: Props) {
  const [rot, setRot] = useState({ x: -28, y: -36 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const [anim, setAnim] = useState<{ move: Move; from: FaceletState } | null>(null);
  const [turned, setTurned] = useState(false);
  const firstFrameRef = useRef<number | null>(null);
  const secondFrameRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => {
    if (!animateMove) return;

    const from = applyMove(state, invertMove(animateMove.move));
    setAnim({ move: animateMove.move, from });
    setTurned(false);
    firstFrameRef.current = requestAnimationFrame(() => {
      firstFrameRef.current = null;
      secondFrameRef.current = requestAnimationFrame(() => {
        secondFrameRef.current = null;
        setTurned(true);
      });
    });
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setAnim(null), DURATION + 40);
    return () => {
      if (firstFrameRef.current !== null) cancelAnimationFrame(firstFrameRef.current);
      if (secondFrameRef.current !== null) cancelAnimationFrame(secondFrameRef.current);
      firstFrameRef.current = null;
      secondFrameRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    };
  }, [animateMove?.nonce]);

  const baseState = anim ? anim.from : state;
  const turningFace = anim ? anim.move.face : null;
  const groupTransform = anim && turned ? moveRotation(anim.move) : 'rotateX(0deg)';

  const staticCubies = CUBIES.filter((c) => !turningFace || !inLayer(turningFace, c));
  const layerCubies = turningFace ? CUBIES.filter((c) => inLayer(turningFace, c)) : [];

  const rotateWithKey = (key: string): boolean => {
    switch (key) {
      case 'ArrowUp':
        setRot((r) => ({ ...r, x: clamp(r.x + ROTATION_STEP, -89, 89) }));
        return true;
      case 'ArrowDown':
        setRot((r) => ({ ...r, x: clamp(r.x - ROTATION_STEP, -89, 89) }));
        return true;
      case 'ArrowLeft':
        setRot((r) => ({ ...r, y: r.y - ROTATION_STEP }));
        return true;
      case 'ArrowRight':
        setRot((r) => ({ ...r, y: r.y + ROTATION_STEP }));
        return true;
      default:
        return false;
    }
  };

  return (
    <div
      className="cube3d"
      role="group"
      tabIndex={0}
      aria-label="3D Rubik's Cube. Use arrow keys to rotate."
      aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
      onKeyDown={(e) => {
        if (rotateWithKey(e.key)) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        drag.current = { x: e.clientX, y: e.clientY };
        setRot((r) => ({ x: clamp(r.x - dy * 0.5, -89, 89), y: r.y + dx * 0.5 }));
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      title="Drag or use arrow keys to rotate"
    >
      <div className="cube3d__scene">
        <div className="cube3d__cube" style={{ transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)` }}>
          {staticCubies.map((c) => (
            <CubieView key={key(c)} cubie={c} state={baseState} highlightFace={anim ? null : highlightFace} />
          ))}
          {turningFace && (
            <div
              className="cube3d__layer"
              style={{ transform: groupTransform, transition: `transform ${DURATION}ms ease-in-out` }}
            >
              {layerCubies.map((c) => (
                <CubieView key={key(c)} cubie={c} state={baseState} highlightFace={null} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CubieView({ cubie, state, highlightFace }: { cubie: Cubie; state: FaceletState; highlightFace: Face | null }) {
  return (
    <div
      className="cube3d__cubie"
      style={{ transform: `translate3d(${cubie.lx * UNIT}px, ${-cubie.ly * UNIT}px, ${cubie.lz * UNIT}px)` }}
    >
      {visibleFaces(cubie).map((face) => (
        <span
          key={face}
          className={`cube3d__tile ${highlightFace === face ? 'cube3d__tile--highlight' : ''}`}
          style={{
            width: TILE,
            height: TILE,
            transform: FACE_TILE_TRANSFORM[face],
            background: COLOR_HEX[state[stickerFacelet(face, cubie)] as Color],
          }}
        />
      ))}
    </div>
  );
}

function key(c: Cubie): string {
  return `${c.lx},${c.ly},${c.lz}`;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
