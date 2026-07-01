import { CENTER_INDEX, COLOR_HEX, COLOR_NAMES, FACES, type Color, type Face, type FaceletState } from '../cube/types';
import type { TurnDirection } from '../solver/instructions';
import { FACE_GRID_AREA, FACE_LABEL, faceletIndex } from './cubeLayout';

interface Props {
  state: FaceletState;
  editable?: boolean;

  onPaint?: (index: number) => void;

  highlightFace?: Face | null;
  turnDirection?: TurnDirection;

  flagged?: Set<number>;
}

export function CubeNet({ state, editable = false, onPaint, highlightFace = null, turnDirection, flagged }: Props) {
  return (
    <div className={`net ${editable ? 'net--editable' : ''}`}>
      {FACES.map((face) => (
        <FaceGrid
          key={face}
          face={face}
          state={state}
          editable={editable}
          onPaint={onPaint}
          highlighted={highlightFace === face}
          turnDirection={highlightFace === face ? turnDirection : undefined}
          flagged={flagged}
        />
      ))}
    </div>
  );
}

function FaceGrid({
  face,
  state,
  editable,
  onPaint,
  highlighted,
  turnDirection,
  flagged,
}: {
  face: Face;
  state: FaceletState;
  editable?: boolean;
  onPaint?: (index: number) => void;
  highlighted?: boolean;
  turnDirection?: TurnDirection;
  flagged?: Set<number>;
}) {
  const centerColor = state[CENTER_INDEX[face]] as Color;
  return (
    <div
      className={`face ${highlighted ? 'face--highlight' : ''}`}
      style={{ gridArea: FACE_GRID_AREA[face] }}
      data-face={face}
    >
      <span className="face__label" style={{ color: COLOR_HEX[centerColor] }}>
        {COLOR_NAMES[centerColor]}
      </span>
      <div className="face__box">
        <div className="face__grid">
          {Array.from({ length: 9 }, (_, local) => {
            const idx = faceletIndex(face, local);
            const color = state[idx] as Color;

            const isCenter = local === 4;
            const paint = () => {
              if (editable && !isCenter) onPaint?.(idx);
            };
            return (
              <button
                key={idx}
                type="button"
                className={`sticker ${isCenter ? 'sticker--center' : ''} ${flagged?.has(idx) ? 'sticker--flagged' : ''}`}
                style={{ background: COLOR_HEX[color] }}
                disabled={!editable || isCenter}
                aria-label={
                  isCenter
                    ? `${FACE_LABEL[face]} center (${COLOR_NAMES[color]}, fixed)`
                    : `${FACE_LABEL[face]} sticker ${local + 1}`
                }
                onPointerDown={paint}
                onPointerEnter={(e) => {

                  if (e.buttons === 1) paint();
                }}
              />
            );
          })}
        </div>
        {highlighted && turnDirection && <TurnArrow direction={turnDirection} />}
      </div>
    </div>
  );
}

function TurnArrow({ direction }: { direction: TurnDirection }) {
  if (direction === '180') {
    return (
      <div className="turn-arrow turn-arrow--180" aria-hidden>
        ⟳<span className="turn-arrow__180-label">180°</span>
      </div>
    );
  }
  return (
    <div className={`turn-arrow turn-arrow--${direction}`} aria-hidden>
      {direction === 'cw' ? '↻' : '↺'}
    </div>
  );
}
