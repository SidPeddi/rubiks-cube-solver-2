import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { COLOR_HEX, COLOR_NAMES, DEFAULT_SCHEME, FACE_BASE, type Color, type Face } from '../cube/types';
import { recognizeFromSamples, type RGB } from '../vision/colorClassify';
import { quadPoint, sampleQuadGrid, type Quad } from '../vision/imageSampler';
import { detectFaceQuadML } from '../vision/detectModel';
import { refineQuad } from '../vision/refineQuad';

const ORT_VERSION = '1.20.1';
const ORT_MODULE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.min.mjs`;
const ORT_WASM_PATHS = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

const MODEL_VERSION = '4';
const MODEL_URL = `${import.meta.env.BASE_URL}model.onnx?v=${MODEL_VERSION}`;

function centeredQuad(w: number, h: number): Quad {
  const side = 0.7 * Math.min(w, h);
  const hw = side / 2 / w;
  const hh = side / 2 / h;
  return [
    { x: 0.5 - hw, y: 0.5 - hh }, // TL
    { x: 0.5 + hw, y: 0.5 - hh }, // TR
    { x: 0.5 + hw, y: 0.5 + hh }, // BR
    { x: 0.5 - hw, y: 0.5 + hh }, // BL
  ];
}

type SquareReg = { crop: ImageData; x0: number; y0: number; side: number };

function cropSquare(img: ImageData, x0: number, y0: number, side: number): SquareReg {
  side = Math.round(Math.min(side, img.width, img.height));
  x0 = Math.max(0, Math.min(img.width - side, Math.round(x0)));
  y0 = Math.max(0, Math.min(img.height - side, Math.round(y0)));
  const src = document.createElement('canvas');
  src.width = img.width;
  src.height = img.height;
  src.getContext('2d')!.putImageData(img, 0, 0);
  const dst = document.createElement('canvas');
  dst.width = side;
  dst.height = side;
  const dctx = dst.getContext('2d')!;
  dctx.drawImage(src, x0, y0, side, side, 0, 0, side, side);
  return { crop: dctx.getImageData(0, 0, side, side), x0, y0, side };
}

async function runModel(reg: SquareReg, img: ImageData): Promise<Quad | null> {
  const ml = await detectFaceQuadML(reg.crop, {
    modelUrl: MODEL_URL,
    ortModule: ORT_MODULE,
    wasmPaths: ORT_WASM_PATHS,
  });
  if (!ml) return null;
  return ml.map((p) => ({
    x: (reg.x0 + p.x * reg.side) / img.width,
    y: (reg.y0 + p.y * reg.side) / img.height,
  })) as Quad;
}

function squareAround(img: ImageData, quad: Quad, margin: number): SquareReg {
  const xs = quad.map((p) => p.x * img.width);
  const ys = quad.map((p) => p.y * img.height);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const floor = 0.25 * Math.min(img.width, img.height);
  const side = Math.max(floor, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * (1 + margin));
  return cropSquare(img, cx - side / 2, cy - side / 2, side);
}

async function detectQuadML(img: ImageData): Promise<Quad | null> {
  const side0 = Math.min(img.width, img.height);
  let quad = await runModel(cropSquare(img, (img.width - side0) / 2, (img.height - side0) / 2, side0), img);
  if (!quad) return null;

  const zoomed = await runModel(squareAround(img, quad, 0.3), img);
  if (zoomed) quad = zoomed;

  return refineQuad(img, quad);
}

const HEIC2ANY_MODULE = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/+esm';

function isHeic(file: File): boolean {
  return /image\/(heic|heif)/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

async function ensureLoadable(file: File): Promise<Blob> {
  if (!isHeic(file)) return file;
  try {
    const mod: any = await import(/* @vite-ignore */ HEIC2ANY_MODULE);
    const heic2any = mod.default ?? mod;
    const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    return Array.isArray(out) ? out[0] : out;
  } catch (e) {
    console.warn('HEIC conversion unavailable; passing the original file through.', e);
    return file;
  }
}

interface Props {

  onRecognized: (colors: Color[], confidence: number[]) => void;
}

const UPLOAD_ORDER: Face[] = ['U', 'F', 'R', 'B', 'L', 'D'];

const FACE_TOP_REF: Record<Face, Color> = {
  U: 'B', // White face → Blue edge up
  F: 'W',
  R: 'W',
  B: 'W',
  L: 'W',
  D: 'G', // Yellow face → Green edge up
};

interface FaceData {
  url: string;
  imageData: ImageData;
  w: number;
  h: number;
  quad: Quad;
  autoConfidence: number;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = url;
  });
}

async function fileToFaceData(file: File): Promise<FaceData> {
  const loadable = await ensureLoadable(file);
  const url = URL.createObjectURL(loadable);
  const img = await loadImage(url);
  const maxDim = 420;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);
  return { url, imageData, w, h, quad: centeredQuad(w, h), autoConfidence: 0 };
}

export function ImageUploader({ onRecognized }: Props) {
  const [faces, setFaces] = useState<Partial<Record<Face, FaceData>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pending, setPending] = useState<Set<Face>>(new Set());

  const [detecting, setDetecting] = useState<Set<Face>>(new Set());

  const allUploaded = UPLOAD_ORDER.every((f) => faces[f]);

  const toggleInSet =
    (setFn: typeof setPending) =>
    (face: Face, on: boolean) =>
      setFn((prev) => {
        const next = new Set(prev);
        on ? next.add(face) : next.delete(face);
        return next;
      });
  const markPending = toggleInSet(setPending);
  const markDetecting = toggleInSet(setDetecting);

  const handleFile = async (face: Face, file: File | undefined) => {
    if (!file) return;
    setError(null);
    markPending(face, true);
    try {
      const data = await fileToFaceData(file);
      setFaces((prev) => {
        const old = prev[face];
        if (old) URL.revokeObjectURL(old.url);
        return { ...prev, [face]: data };
      });
    } catch {
      setError(
        "Couldn't read that photo. If you're on an iPhone, set Camera to “Most Compatible” (JPEG) or upload a JPEG/PNG."
      );
    } finally {
      markPending(face, false);
    }
  };

  const setQuad = (face: Face, quad: Quad) => {
    setFaces((prev) => (prev[face] ? { ...prev, [face]: { ...prev[face]!, quad } } : prev));
  };

  const reDetect = (face: Face) => {
    const d = faces[face];
    if (!d) return;
    setQuad(face, centeredQuad(d.w, d.h));
  };

  const autoDetect = async (face: Face) => {
    const d = faces[face];
    if (!d) return;
    setError(null);
    markDetecting(face, true);
    try {
      const quad = await detectQuadML(d.imageData);
      if (quad) setQuad(face, quad);
      else setError('Auto-detect is unavailable right now — drag the box manually.');
    } catch {
      setError('Auto-detect failed — drag the box manually.');
    } finally {
      markDetecting(face, false);
    }
  };

  const exportTraining = () => {
    const samples: { corners: number[][]; image: string }[] = [];
    for (const face of UPLOAD_ORDER) {
      const d = faces[face];
      if (!d) continue;
      const c = document.createElement('canvas');
      c.width = d.imageData.width;
      c.height = d.imageData.height;
      c.getContext('2d')!.putImageData(d.imageData, 0, 0);
      samples.push({
        corners: d.quad.map((p) => [Math.round(p.x * 1e5) / 1e5, Math.round(p.y * 1e5) / 1e5]),
        image: c.toDataURL('image/jpeg', 0.9),
      });
    }
    if (!samples.length) return;
    const blob = new Blob([JSON.stringify({ order: 'TL,TR,BR,BL', samples })], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cube-labels-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const detect = () => {
    setBusy(true);
    setError(null);
    try {
      const samples = new Array<RGB>(54);
      for (const face of UPLOAD_ORDER) {
        const d = faces[face]!;
        const pxQuad = d.quad.map((p) => ({ x: p.x * d.imageData.width, y: p.y * d.imageData.height })) as Quad;
        const faceSamples = sampleQuadGrid(d.imageData, pxQuad);
        for (let i = 0; i < 9; i++) samples[FACE_BASE[face] + i] = faceSamples[i];
      }
      const { colors, confidence } = recognizeFromSamples(samples);
      onRecognized(colors, confidence);
    } catch (e) {
      setError(`Could not read colors: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="uploader">
      <div className="uploader__instructions">
        <p className="hint">Hold the cube the same way for every photo so each face lands the right way up:</p>
        <p className="step">1. Start with White on top and Green facing you (standard colors).</p>
        <p className="step">2. Turn left/right to shoot Green, Red, Blue, Orange — keep White on top.</p>
        <p className="step">3. White face: Blue edge at the top. Yellow face: Green edge at the top.</p>
        <p className="step">
          4. Each box lists its top-edge color and marks the top-left (TL) corner. Drag the corners onto the stickers,
          detect, then review the net on the left.
        </p>
        <p className="hint uploader__share-tip">
          Tip: Photos are fastest on a phone — open this page on your phone, solve there, then tap “Share solve” and open
          the shared link here to see the steps on this screen.
        </p>
      </div>
      <div className="uploader__grid">
        {UPLOAD_ORDER.map((face) => {
          const data = faces[face];
          const isPending = pending.has(face);
          const color = DEFAULT_SCHEME[face];
          const topColor = FACE_TOP_REF[face];
          return (
            <div key={face} className={`uploader__cell ${data ? 'uploader__cell--filled' : ''}`}>
              <div className="uploader__cell-head">
                <span className="uploader__face-label" style={{ color: COLOR_HEX[color] }}>
                  {COLOR_NAMES[color]}
                </span>
                <span className="uploader__orient">
                  ↑ top: <b style={{ color: COLOR_HEX[topColor] }}>{COLOR_NAMES[topColor]}</b>
                </span>
              </div>
              {data ? (
                <>
                  <FaceQuadEditor data={data} topColor={topColor} onChange={(q) => setQuad(face, q)} />
                  <div className="uploader__cell-actions">
                    <button
                      type="button"
                      className="btn btn--tiny"
                      onClick={() => autoDetect(face)}
                      disabled={detecting.has(face)}
                      title="Try the ML detector to place the box"
                    >
                      {detecting.has(face) ? 'Detecting…' : 'Auto-detect'}
                    </button>
                    <button type="button" className="btn btn--tiny" onClick={() => reDetect(face)}>
                      Center box
                    </button>
                    <label className="btn btn--tiny">
                      Replace
                      <input
                        type="file"
                        accept="image/*"
                        className="uploader__input"
                        onChange={(e) => handleFile(face, e.target.files?.[0])}
                      />
                    </label>
                  </div>
                </>
              ) : isPending ? (
                <div className="uploader__add uploader__add--busy" aria-busy>
                  <span>Processing…</span>
                </div>
              ) : (
                <label className="uploader__add">
                  <span>+ Add photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="uploader__input"
                    onChange={(e) => handleFile(face, e.target.files?.[0])}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
      {error && <p className="error-text">{error}</p>}
      <button type="button" className="btn btn--primary" disabled={!allUploaded || busy} onClick={detect}>
        {busy ? 'Detecting…' : 'Detect colors from photos'}
      </button>
      {UPLOAD_ORDER.some((f) => faces[f]) && (
        <button
          type="button"
          className="btn btn--ghost btn--tiny uploader__export"
          onClick={exportTraining}
          title="Download these photos + the corners you placed, to improve the detector"
        >
          Save corners for training
        </button>
      )}
    </div>
  );
}

type Drag =
  | { kind: 'corner'; i: number }
  | { kind: 'move'; startPointer: { x: number; y: number }; startQuad: Quad };

function FaceQuadEditor({
  data,
  topColor,
  onChange,
}: {
  data: FaceData;
  topColor: Color;
  onChange: (q: Quad) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const q = data.quad;

  const toNorm = (clientX: number, clientY: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (clientY - r.top) / r.height)),
    };
  };

  const startCornerDrag = (i: number, e: ReactPointerEvent) => {
    e.preventDefault();
    drag.current = { kind: 'corner', i };
    boxRef.current?.setPointerCapture(e.pointerId);
  };
  const startMoveDrag = (e: ReactPointerEvent) => {
    e.preventDefault();
    drag.current = { kind: 'move', startPointer: toNorm(e.clientX, e.clientY), startQuad: q.map((p) => ({ ...p })) as Quad };
    boxRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const n = toNorm(e.clientX, e.clientY);
    if (d.kind === 'corner') {
      const nq = q.map((p) => ({ ...p })) as Quad;
      nq[d.i] = n;
      onChange(nq);
    } else {

      const xs = d.startQuad.map((p) => p.x);
      const ys = d.startQuad.map((p) => p.y);
      let dx = n.x - d.startPointer.x;
      let dy = n.y - d.startPointer.y;
      dx = Math.max(-Math.min(...xs), Math.min(1 - Math.max(...xs), dx));
      dy = Math.max(-Math.min(...ys), Math.min(1 - Math.max(...ys), dy));
      onChange(d.startQuad.map((p) => ({ x: p.x + dx, y: p.y + dy })) as Quad);
    }
  };
  const endDrag = () => {
    drag.current = null;
  };

  const lines: [{ x: number; y: number }, { x: number; y: number }][] = [];
  for (const t of [1 / 3, 2 / 3]) {
    lines.push([quadPoint(q, t, 0), quadPoint(q, t, 1)]);
    lines.push([quadPoint(q, 0, t), quadPoint(q, 1, t)]);
  }
  const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
  const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;

  return (
    <div
      className="quad-editor"
      style={{ aspectRatio: `${data.w} / ${data.h}` }}
      ref={boxRef}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <img className="quad-editor__img" src={data.url} alt="" draggable={false} />
      <span className="quad-editor__top-tag" style={{ color: COLOR_HEX[topColor] }} aria-hidden>
        ▲ {COLOR_NAMES[topColor]} up
      </span>
      <svg className="quad-editor__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {lines.map(([a, b], i) => (
          <line key={i} x1={a.x * 100} y1={a.y * 100} x2={b.x * 100} y2={b.y * 100} className="quad-editor__grid" />
        ))}
        <polygon points={q.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')} className="quad-editor__poly" />
      </svg>
      {q.map((p, i) => (
        <div
          key={i}
          className={`quad-editor__handle ${i === 0 ? 'quad-editor__handle--tl' : ''}`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          onPointerDown={(e) => startCornerDrag(i, e)}
          aria-label={`Corner ${i + 1}`}
        >
          {i === 0 && <span className="quad-editor__handle-label">TL</span>}
        </div>
      ))}
      <div
        className="quad-editor__handle quad-editor__handle--move"
        style={{ left: `${cx * 100}%`, top: `${cy * 100}%` }}
        onPointerDown={startMoveDrag}
        aria-label="Move box"
      >
        <span className="quad-editor__move-icon" aria-hidden>✣</span>
      </div>
    </div>
  );
}
