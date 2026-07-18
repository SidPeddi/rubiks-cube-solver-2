import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createSolved } from '../cube/cube';
import { applyMoves, invertMove } from '../cube/moves';
import { validateState } from '../cube/validation';
import { mulberry32, randomScramble } from '../cube/scramble';
import { describeMove } from '../solver/instructions';
import { solve, type SolveResult } from '../solver/solver';
import { buildShareUrl, readSharedState } from '../cube/shareState';
import { COLOR_NAMES, type Color, type Face, type FaceletState, type Move } from '../cube/types';
import { CubeNet } from './CubeNet';
import { Cube3D } from './Cube3D';
import { ColorPalette } from './ColorPalette';
import { ImageUploader } from './ImageUploader';
import { SolutionPlayer } from './SolutionPlayer';

type Mode = 'manual' | 'photo';

export function App() {
  const [mode, setMode] = useState<Mode>('manual');
  const [cube, setCube] = useState<FaceletState>(() => createSolved());
  const [paint, setPaint] = useState<Color>('W');
  const [result, setResult] = useState<SolveResult | null>(null);
  const [step, setStep] = useState(0);
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [shared, setShared] = useState<'shared' | 'copied' | 'manual' | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const shareInputRef = useRef<HTMLInputElement | null>(null);
  const shareTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  const solving = result?.ok === true;

  useEffect(() => {
    const incoming = readSharedState(window.location.hash);
    if (!incoming) return;
    setCube(incoming);
    if (validateState(incoming).ok) {
      setResult(solve(incoming));
      setStep(0);
    }
  }, []);

  const netRef = useRef<HTMLElement | null>(null);
  const cubeRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const net = netRef.current;
    const cube = cubeRef.current;
    if (!net || !cube) return;

    let raf = 0;
    const sync = () => {

      net.style.minHeight = '';
      cube.style.minHeight = '';
      const h = Math.max(net.offsetHeight, cube.offsetHeight);
      net.style.minHeight = `${h}px`;
      cube.style.minHeight = `${h}px`;
    };
    const schedule = () => {
      if (typeof requestAnimationFrame === 'undefined') {
        sync();
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(sync);
    };

    sync();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(schedule);
      ro.observe(net);
      ro.observe(cube);
    }
    window.addEventListener('resize', schedule);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', schedule);
      if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(raf);
      net.style.minHeight = '';
      cube.style.minHeight = '';
    };
  }, [solving]);

  const validation = useMemo(() => validateState(cube), [cube]);

  const displayState = useMemo(() => {
    if (solving && result) return applyMoves(cube, result.solution.slice(0, step));
    return cube;
  }, [cube, result, step, solving]);

  const currentMove = solving && result && step < result.solution.length ? result.solution[step] : null;
  const highlightFace: Face | null = currentMove ? currentMove.face : null;
  const turnDirection = currentMove ? describeMove(currentMove).direction : undefined;

  const [animateMove, setAnimateMove] = useState<{ move: Move; nonce: number } | null>(null);
  const prevStep = useRef(step);
  const nonce = useRef(0);
  useEffect(() => {
    if (solving && result) {
      const delta = step - prevStep.current;
      let move: Move | null = null;
      if (delta === 1) move = result.solution[step - 1] ?? null;
      else if (delta === -1) move = result.solution[step] ? invertMove(result.solution[step]) : null;
      if (move) {
        nonce.current += 1;
        setAnimateMove({ move, nonce: nonce.current });
      }
    }
    prevStep.current = step;
  }, [step, solving, result]);

  const paintSticker = (index: number) => {
    setCube((prev) => {
      const next = prev.slice();
      next[index] = paint;
      return next;
    });
    setFlagged((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const handleScramble = () => {
    const seed = Math.floor(Math.random() * 1e9);
    setCube(applyMoves(createSolved(), randomScramble(25, mulberry32(seed))));
    setResult(null);
    setFlagged(new Set());
  };

  const handleReset = () => {
    setCube(createSolved());
    setResult(null);
    setFlagged(new Set());
  };

  const handleRecognized = (colors: Color[], confidence: number[]) => {
    setCube(colors.slice());
    setResult(null);
    const low = new Set<number>();
    confidence.forEach((c, i) => {
      if (c < 0.45) low.add(i);
    });
    setFlagged(low);
    setMode('manual');
  };

  const handleSolve = () => {
    const r = solve(cube);
    setResult(r);
    setStep(0);
  };

  const backToEdit = () => {
    setResult(null);
    setStep(0);
  };

  const flashShared = (kind: 'shared' | 'copied') => {
    if (!mountedRef.current) return;
    setShared(kind);
    setShareUrl(null);
    if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
    shareTimeoutRef.current = setTimeout(() => setShared(null), 2000);
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (shareTimeoutRef.current) clearTimeout(shareTimeoutRef.current);
    };
  }, []);

  const handleShare = async () => {
    const url = buildShareUrl(cube);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: "Rubik's Cube solve", url });
        if (!mountedRef.current) return;
        flashShared('shared');
        return;
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
      }
    }
    if (!mountedRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        if (!mountedRef.current) return;
        flashShared('copied');
        return;
      } catch {
        void 0;
      }
    }
    if (!mountedRef.current) return;
    setShareUrl(url);
  };

  useEffect(() => {
    if (!shareUrl) return;
    const el = shareInputRef.current;
    if (!el) return;
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length);
    let ok = false;
    try {
      ok = typeof document !== 'undefined' && document.execCommand('copy');
    } catch {
      ok = false;
    }
    setShared(ok ? 'copied' : 'manual');
  }, [shareUrl]);

  return (
    <div className="app">
      <header className="app__header">
        <h1 className="app__title" aria-label="Rubik's Cube Solver">
          <CubeColoredText text="Rubik's Cube Solver" />
        </h1>
      </header>

      <main className="app__main">
        <section className="panel panel--net" ref={netRef}>
          <CubeNet
            state={displayState}
            editable={!solving}
            onPaint={paintSticker}
            highlightFace={highlightFace}
            turnDirection={turnDirection}
            flagged={flagged}
          />
        </section>

        <section className="panel panel--controls">
          {!solving ? (
            <>
              <div className="tabs" role="tablist">
                <button
                  role="tab"
                  aria-selected={mode === 'manual'}
                  aria-label="Manual entry"
                  className={`tab ${mode === 'manual' ? 'tab--active' : ''}`}
                  onClick={() => setMode('manual')}
                >
                  <CubeColoredWords lines={['Manual entry']} start={0} palette={ACCESSIBLE_COLORS} />
                </button>
                <button
                  role="tab"
                  aria-selected={mode === 'photo'}
                  aria-label="From photos"
                  className={`tab ${mode === 'photo' ? 'tab--active' : ''}`}
                  onClick={() => setMode('photo')}
                >
                  <CubeColoredWords lines={['From photos']} start={2} palette={ACCESSIBLE_COLORS} />
                </button>
              </div>

              {mode === 'manual' ? (
                <div className="controls-block">
                  <p className="hint hint--manual">
                    <CubeColoredWords
                      lines={[
                        'Pick a color, then click the stickers to change their color.',
                        "Center stickers define each face's color.",
                      ]}
                    />
                  </p>
                  <ColorPalette selected={paint} onSelect={setPaint} />
                  <div className="btn-row">
                    <button className="btn" onClick={handleScramble} aria-label="Random scramble">
                      <CubeColoredWords lines={['Random scramble']} start={4} palette={ACCESSIBLE_COLORS} />
                    </button>
                    <button className="btn" onClick={handleReset} aria-label="Reset to solved">
                      <CubeColoredWords lines={['Reset to solved']} start={6} palette={ACCESSIBLE_COLORS} />
                    </button>
                  </div>
                </div>
              ) : (
                <ImageUploader onRecognized={handleRecognized} />
              )}

              {flagged.size > 0 && (
                <p className="warn-text">
                  {flagged.size} sticker{flagged.size > 1 ? 's were' : ' was'} detected with low confidence (dashed
                  outline). Please double-check {flagged.size > 1 ? 'them' : 'it'}.
                </p>
              )}

              <ValidationPanel validation={validation} />

              <button
                className="btn btn--primary btn--solve"
                onClick={handleSolve}
                disabled={!validation.ok}
                aria-label="Solve"
                title={validation.ok ? 'Compute a solution' : 'Fix the cube first'}
              >
                <CubeColoredWords lines={['Solve']} start={3} palette={ACCESSIBLE_COLORS} />
              </button>
            </>
          ) : (
            result && (
              <>
                <div className="solve-summary">
                  <button className="btn btn--ghost" onClick={backToEdit}>
                    ← Edit cube
                  </button>
                  <span className="solve-summary__count">{result.moveCount} moves</span>
                  <button
                    className="btn btn--ghost solve-summary__share"
                    onClick={handleShare}
                    title="Copy a link that reopens this solve on another device"
                  >
                    {shared === 'shared'
                      ? 'Shared ✓'
                      : shared === 'copied'
                        ? 'Link copied ✓'
                        : shared === 'manual'
                          ? 'Copy the link ↓'
                          : 'Share solve'}
                  </button>
                </div>
                {shareUrl && (
                  <div className="share-link">
                    <p className="share-link__label">Copy this link and open it on the other device:</p>
                    <input
                      ref={shareInputRef}
                      className="share-link__input mono"
                      readOnly
                      value={shareUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      onClick={(e) => e.currentTarget.select()}
                      aria-label="Shareable solve link"
                    />
                  </div>
                )}
                <SolutionPlayer
                  cube={cube}
                  solution={result.solution}
                  phases={result.phases}
                  step={step}
                  setStep={setStep}
                />
              </>
            )
          )}

          {result && !result.ok && <p className="error-text">{result.error}</p>}
        </section>

        <section className="panel panel--cube3d" ref={cubeRef}>
          <Cube3D state={displayState} animateMove={solving ? animateMove : null} highlightFace={highlightFace} />
        </section>
      </main>

    </div>
  );
}

const TITLE_COLORS = ['#f8fafc', '#fde047', '#22c55e', '#3b82f6', '#ef4444', '#f97316'];

const ACCESSIBLE_COLORS = ['#ffffff', '#fde047', '#4ade80', '#60a5fa', '#f87171', '#fb923c'];

function CubeColoredText({ text }: { text: string }) {
  let colorIdx = 0;
  return (
    <>
      {Array.from(text).map((ch, i) => {
        if (ch === ' ') return <span key={i}>{' '}</span>;
        const color = TITLE_COLORS[colorIdx % TITLE_COLORS.length];
        colorIdx += 1;
        return (
          <span key={i} style={{ color }}>
            {ch}
          </span>
        );
      })}
    </>
  );
}

function CubeColoredWords({
  lines,
  start = 0,
  palette = TITLE_COLORS,
}: {
  lines: string[];
  start?: number;
  palette?: string[];
}) {
  let colorIdx = start;
  return (
    <>
      {lines.map((line, li) => {
        const words = line.split(' ');
        return (
          <span key={li}>
            {words.map((word, wi) => {
              const color = palette[colorIdx % palette.length];
              colorIdx += 1;
              return (
                <span key={wi} style={{ color }}>
                  {word}
                  {wi < words.length - 1 ? ' ' : ''}
                </span>
              );
            })}
            {li < lines.length - 1 ? <br /> : null}
          </span>
        );
      })}
    </>
  );
}

function ValidationPanel({ validation }: { validation: ReturnType<typeof validateState> }) {

  if (validation.ok) return null;
  return (
    <div className="validation validation--bad">
      <strong>This cube can't be solved yet:</strong>
      <ul>
        {validation.errors.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>
      <p className="hint">Counts must be 9 of each color {colorList()}, and the position must be physically reachable.</p>
    </div>
  );
}

function colorList(): string {
  return `(${(Object.values(COLOR_NAMES) as string[]).join(', ')})`;
}
