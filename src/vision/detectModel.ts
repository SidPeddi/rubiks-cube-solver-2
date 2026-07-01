
import type { ImageLike, Quad } from './imageSampler';

export const INPUT_SIZE = 160;

export interface MLDetectOptions {

  modelUrl: string;

  ortModule?: string;

  wasmPaths?: string;
}

function importOrt(specifier: string): Promise<any> {
  return import(/* @vite-ignore */ specifier);
}

let ortPromise: Promise<any> | null = null;
let sessionPromise: Promise<any> | null = null;

function getOrt(specifier: string, wasmPaths?: string): Promise<any> {
  if (!ortPromise) {
    ortPromise = importOrt(specifier).then((ort) => {
      try {

        ort.env.wasm.numThreads = 1;
        if (wasmPaths) ort.env.wasm.wasmPaths = wasmPaths;
      } catch {
      }
      return ort;
    });
  }
  return ortPromise;
}

function getSession(modelUrl: string, specifier: string, wasmPaths?: string): Promise<any> {
  if (!sessionPromise) {
    sessionPromise = getOrt(specifier, wasmPaths).then((ort) => ort.InferenceSession.create(modelUrl));
  }
  return sessionPromise;
}

function preprocess(img: ImageLike, size: number): Float32Array {
  const out = new Float32Array(3 * size * size);
  const { width: W, height: H, data } = img;
  const plane = size * size;
  for (let y = 0; y < size; y++) {
    const sy = ((y + 0.5) * H) / size - 0.5;
    const y0 = Math.max(0, Math.min(H - 1, Math.floor(sy)));
    const y1 = Math.min(H - 1, y0 + 1);
    const fy = Math.max(0, Math.min(1, sy - y0));
    for (let x = 0; x < size; x++) {
      const sx = ((x + 0.5) * W) / size - 0.5;
      const x0 = Math.max(0, Math.min(W - 1, Math.floor(sx)));
      const x1 = Math.min(W - 1, x0 + 1);
      const fx = Math.max(0, Math.min(1, sx - x0));
      const i00 = (y0 * W + x0) * 4;
      const i01 = (y0 * W + x1) * 4;
      const i10 = (y1 * W + x0) * 4;
      const i11 = (y1 * W + x1) * 4;
      for (let c = 0; c < 3; c++) {
        const top = data[i00 + c] + (data[i01 + c] - data[i00 + c]) * fx;
        const bot = data[i10 + c] + (data[i11 + c] - data[i10 + c]) * fx;
        out[c * plane + y * size + x] = (top + (bot - top) * fy) / 255;
      }
    }
  }
  return out;
}

export async function detectFaceQuadML(img: ImageLike, opts: MLDetectOptions): Promise<Quad | null> {
  try {
    const specifier = opts.ortModule ?? 'onnxruntime-web';
    const ort = await getOrt(specifier, opts.wasmPaths);
    const session = await getSession(opts.modelUrl, specifier, opts.wasmPaths);
    const input = preprocess(img, INPUT_SIZE);
    const tensor = new ort.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const feeds: Record<string, unknown> = { [session.inputNames[0]]: tensor };
    const output = await session.run(feeds);
    const data: Float32Array = output[session.outputNames[0]].data;
    if (!data || data.length < 8) return null;
    const clamp = (v: number) => Math.max(0, Math.min(1, v));
    return [
      { x: clamp(data[0]), y: clamp(data[1]) },
      { x: clamp(data[2]), y: clamp(data[3]) },
      { x: clamp(data[4]), y: clamp(data[5]) },
      { x: clamp(data[6]), y: clamp(data[7]) },
    ];
  } catch (e) {

    console.warn('ML cube detection unavailable; using heuristic fallback.', e);
    return null;
  }
}
