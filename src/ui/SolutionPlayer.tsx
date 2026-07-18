import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { applyMoves, formatMove } from '../cube/moves';
import { COLOR_HEX, FACE_BASE, type Color, type Face, type FaceletState, type Move } from '../cube/types';
import { describeMove } from '../solver/instructions';
import type { SolutionPhase } from '../solver/layerByLayer';

interface Props {

  cube: FaceletState;
  solution: Move[];
  phases: SolutionPhase[];
  step: number;
  setStep: Dispatch<SetStateAction<number>>;
}

const PHASE_FACE: Face[] = ['D', 'D', 'F', 'U', 'U', 'U'];

const SPEEDS = [
  { label: 'Slow', ms: 1400 },
  { label: 'Normal', ms: 850 },
  { label: 'Fast', ms: 400 },
];

export function SolutionPlayer({ cube, solution, phases, step, setStep }: Props) {
  const total = solution.length;
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1);

  const [openPhase, setOpenPhase] = useState<string | null>(null);

  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const copyFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setStep((s: number) => {
        if (s >= total) {
          return s;
        }
        return s + 1;
      });
    }, SPEEDS[speedIdx].ms);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, speedIdx, total]);

  useEffect(() => {
    if (step >= total) setPlaying(false);
  }, [step, total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;

      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setStep((s: number) => Math.min(total, s + 1));
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setStep((s: number) => Math.max(0, s - 1));
          break;
        case 'Home':
          e.preventDefault();
          setStep(0);
          break;
        case 'End':
          e.preventDefault();
          setStep(total);
          break;
        case ' ':
        case 'Spacebar':

          if (tag === 'BUTTON') return;
          e.preventDefault();
          if (step >= total) {
            setStep(0);
            setPlaying(true);
          } else {
            setPlaying((p) => !p);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, total]);

  const phaseBounds = useMemo(() => {
    const bounds: { phase: SolutionPhase; start: number; end: number }[] = [];
    let offset = 0;
    for (const phase of phases) {
      bounds.push({ phase, start: offset, end: offset + phase.moves.length });
      offset += phase.moves.length;
    }
    return bounds;
  }, [phases]);

  const phaseFaces = useMemo<Color[][]>(() => {
    return phaseBounds.map((b, i) => {
      const st = applyMoves(cube, solution.slice(0, b.end));
      const base = FACE_BASE[PHASE_FACE[i] ?? 'U'];
      return Array.from({ length: 9 }, (_, k) => st[base + k]);
    });
  }, [cube, solution, phaseBounds]);

  const solutionText = useMemo(() => solution.map(formatMove).join(' '), [solution]);

  const done = step >= total;
  const currentMove = done ? null : solution[step];
  const instruction = currentMove ? describeMove(currentMove) : null;
  const currentPhase = phaseBounds.find((b) => step >= b.start && step < b.end) ?? phaseBounds[phaseBounds.length - 1];

  return (
    <div className="player">
      <div className="player__status">
        {done ? (
          <div className="player__solved">
            <div>
              <strong>Solved!</strong>
              <p>All {total} moves applied. The cube is complete.</p>
            </div>
          </div>
        ) : (
          instruction && (
            <div className="player__instruction">
              <div className="player__instruction-body">
                <div className="player__move-notation">
                  Move {step + 1} of {total} · <span className="mono">{instruction.notation}</span>
                </div>
                <div className="player__move-text">{instruction.text}</div>
              </div>
            </div>
          )
        )}
      </div>

      <div className="player__progress">
        <div className="player__progress-bar" style={{ width: `${total ? (step / total) * 100 : 100}%` }} />
      </div>

      <details className="checkpoints">
        <summary className="checkpoints__summary">
          <span className="checkpoints__title">Checkpoints</span>
          <span className="checkpoints__now">{done ? 'Solved' : currentPhase?.phase.label}</span>
        </summary>
        <div className="checkpoints__list" aria-label="Solve checkpoints">
          {phaseBounds.map(({ phase, start, end }, i) => {
            const status = step >= end ? 'done' : step >= start ? 'current' : 'todo';
            const open = openPhase === phase.id;
            return (
              <div className="checkpoint-item" key={phase.id}>
                <button
                  type="button"
                  className={`checkpoint checkpoint--${status} ${open ? 'checkpoint--open' : ''}`}

                  onClick={() => {
                    setPlaying(false);
                    setStep(start);
                    setOpenPhase(open ? null : phase.id);
                  }}
                  aria-expanded={open}
                  aria-current={status === 'current' ? 'step' : undefined}
                >
                  {status === 'done' ? (
                    <span className="checkpoint__check" aria-hidden>
                      <svg viewBox="0 0 16 16" width="16" height="16" fill="none">
                        <path
                          d="M3 8.5l3.3 3.3L13 4.5"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  ) : (
                    <span className="mini-face" aria-hidden>
                      {phaseFaces[i].map((c, k) => (
                        <span key={k} className="mini-face__cell" style={{ background: COLOR_HEX[c] }} />
                      ))}
                    </span>
                  )}
                  <span className="checkpoint__label">{phase.label}</span>
                  <span className="checkpoint__meta">
                    {status === 'done' ? 'done' : `${phase.moves.length} moves`}
                  </span>
                </button>
                {open && (
                  <div className="checkpoint__blurb">
                    <span className="checkpoint__blurb-step">step {start + 1}–{end} of {total}</span>
                    <p>{phase.description}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>

      <div className="player__controls">
        <div className="player__transport">
          <button type="button" className="btn" onClick={() => setStep(0)} disabled={step === 0} aria-label="Restart">
            ⏮
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            aria-label="Previous move"
          >
            ◀
          </button>
          <button
            type="button"
            className="btn btn--primary player__play"
            onClick={() => {
              if (done) {
                setStep(0);
                setPlaying(true);
              } else {
                setPlaying((p) => !p);
              }
            }}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? 'Pause' : done ? 'Replay' : 'Play'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setStep(Math.min(total, step + 1))}
            disabled={done}
            aria-label="Next move"
          >
            ▶
          </button>
        </div>
        <div className="player__speed" role="radiogroup" aria-label="Speed">
          <span className="player__speed-label">Speed:</span>
          {SPEEDS.map((s, i) => (
            <label
              key={s.label}
              className={`speed-radio ${speedIdx === i ? 'speed-radio--active' : ''}`}
            >
              <input
                type="radio"
                name="speed"
                checked={speedIdx === i}
                onChange={() => setSpeedIdx(i)}
              />
              {s.label}
            </label>
          ))}
        </div>
      </div>

      <p className="player__keys">Keys: ← → step · Space play/pause · Home / End jump</p>

      <div className="player__moves-head">
        <span className="player__moves-title">All moves</span>
        <button
          type="button"
          className="btn btn--tiny"
          onClick={async () => {
            let copyStatus: 'ok' | 'fail';
            try {
              if (!navigator.clipboard) throw new Error('clipboard unavailable');
              await navigator.clipboard.writeText(solutionText);
              copyStatus = 'ok';
            } catch {
              copyStatus = 'fail';
            }
            if (!isMounted.current) return;
            setCopied(copyStatus);
            if (copyFeedbackTimer.current) clearTimeout(copyFeedbackTimer.current);
            copyFeedbackTimer.current = setTimeout(() => {
              setCopied(null);
              copyFeedbackTimer.current = null;
            }, 1500);
          }}
          title="Copy the full solution"
          disabled={total === 0}
        >
          {copied === 'ok' ? 'Copied ✓' : copied === 'fail' ? 'Copy failed' : 'Copy'}
        </button>
      </div>

      <div className="player__moves" aria-label="All moves">
        {solution.map((m, i) => (
          <button
            key={i}
            type="button"
            className={`move-chip ${i === step ? 'move-chip--current' : ''} ${i < step ? 'move-chip--done' : ''}`}
            onClick={() => setStep(i)}
            title={describeMove(m).text}
          >
            {formatMove(m)}
          </button>
        ))}
      </div>
    </div>
  );
}
