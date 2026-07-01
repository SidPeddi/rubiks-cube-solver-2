# Cube-face detector — offline ML toolkit

This folder is **offline tooling** to train a small model that finds a cube
face's four corners in a photo (to power the opt-in **Auto-detect** button in the
web app). It is **not** part of the web bundle — nothing here is imported by
`src/`. The trained model ships as a static asset (`public/model.onnx`, ~547 KB)
that `src/vision/detectModel.ts` loads on demand via `onnxruntime-web`.

> Deeper design rationale (architecture, heatmap loss, ONNX export, the browser
> integration) lives in [`../docs/DESIGN_DECISIONS.md`](../docs/DESIGN_DECISIONS.md)
> §19–21 and [`../docs/CODE_WALKTHROUGH.md`](../docs/CODE_WALKTHROUGH.md) §6.

The pipeline:

```
1. (optional) take ~10-20 cube-face photos      ->  ml/faces/       (+ real backgrounds -> ml/backgrounds/)
2. generate a synthetic, auto-labeled dataset   ->  ml/dataset/     (generate_dataset.py)
3. train the heatmap keypoint model -> ONNX      ->  ml/model.onnx   (train.py)
4. ship it + bump the cache-buster                ->  public/model.onnx + MODEL_VERSION in ImageUploader.tsx
5. (loop) turn real scans into labeled data      ->  ml/real/ -> ingest_real.py -> train.py --extra
```

You can do step 2 with **zero photos** (it renders synthetic sticker grids), but
results transfer to real photos better if you provide a few real faces + real
backgrounds. The browser hook is **wired in** (opt-in Auto-detect), not dormant.

## Setup

```bash
cd ml
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 1. (Optional) add your photos

Drop ~10–20 cube-face images into `ml/faces/`:
- **Scramble the cube between shots** — mixed-colour faces give strong grid lines
  (better signal, closer to real use) than solid solved faces.
- Reasonably straight-on, whole face visible. You're providing the *look* of
  stickers; the generator handles all the angles/lighting/backgrounds.
- Make sure all six colours appear across the set.

Drop real background images into `ml/backgrounds/` for realism (19 are already
supplied; used ~85% of the time via random crop/scale). Otherwise random
gradients + noise are generated.

## 2. Generate the dataset

```bash
python generate_dataset.py --count 24                # quick look: 24 images + labelled previews
python generate_dataset.py --count 8000              # a real training set (default --size 256)
```

Each sample composites a **3-D cube body** (darker adjacent side/top/bottom faces
behind the front face, so the model learns to pick the front colored face out of
real cube structure), warps the front face at **±30° perspective** onto a real or
procedural background, then applies a heavy augmentation stack: white-balance /
color-temperature shift, directional shadow, glare blob, partial occlusion,
Gaussian + horizontal motion blur, noise, and JPEG recompression.

Outputs:
- `dataset/images/img_*.jpg` — the training images.
- `dataset/labels.json` — `{ size, order: "TL,TR,BR,BL", samples: [{ file, corners:[[x,y]×4] }] }`
  with corners normalized to `[0,1]`.
- `dataset/preview/*.jpg` — the first N images **with the labelled quad drawn on**,
  so you can eyeball that the labels are correct.

How many photos to take: **0** (fully synthetic) up to **~10–20** (recommended,
composited real stickers). The generator multiplies each into thousands of
varied, auto-labeled images, so you never label by hand.

## 3. Train (`train.py`)

```bash
pip install -r requirements.txt          # includes torch
python train.py --epochs 60 --size 160   # reads ml/dataset, writes ml/model.onnx (+ .pt)
```

A small from-scratch **heatmap-keypoint CNN** (~0.3M params): a strided encoder
with **dilated convs** produces a 4-channel heatmap (one per corner) at input/4
(40×40 for `--size 160`), and a **differentiable soft-argmax (DSNT)**, baked into
the model, turns each heatmap into an `(x,y)` — so the exported ONNX still outputs
8 numbers (TL,TR,BR,BL) and the browser needs no changes. Trained with a **dual
loss** (coordinate SmoothL1 + a heatmap term pulling each map toward a Gaussian
blob) on **Apple MPS** (→ CUDA → CPU). It prints **mean per-corner pixel error**
each epoch (~2.6 px/corner on synthetic val, vs ~6.2 px for the old regression
head) and exports `model.onnx` (opset 12, legacy exporter). Re-runnable.

## 4. Ship it into the app (`src/vision/detectModel.ts` — already wired in)

The browser hook is **live**: `ImageUploader` exposes an opt-in **Auto-detect**
button that runs the model via `onnxruntime-web` lazy-loaded from a pinned CDN
(zero bundle cost), with a coarse-to-fine cascade + edge-snapping. To ship a
retrained model:

1. Copy it to where the app fetches it: `cp ml/model.onnx ../public/model.onnx`.
2. **Bump `MODEL_VERSION`** in `src/ui/ImageUploader.tsx` (it's a `?v=` cache-buster
   on the model URL) so browsers/CDNs pick up the new weights.

`detectModel.ts` preprocesses identically to `train.py` (RGB, resize to 160, /255,
NCHW), runs the model, and returns the normalized quad; `refineQuad.ts` then snaps
corners to the cube's edges. The manual corner-drag + colour review always remain.

## 5. Close the sim-to-real gap (`ingest_real.py`)

Every scan can become training data — no annotation tool. In the app's *From
photos* view, place each face's box accurately and click **"Save corners for
training"** (the corners you placed **are** the ground-truth labels). Drop the
exported `cube-labels-*.json` files into `ml/real/`, then:

```bash
python ingest_real.py                     # ml/real/*.json -> ml/real_dataset/
python train.py --extra real_dataset      # oversamples the real data into training
```

Real data is mixed into TRAIN (oversampled, `--extra-rep`, default ×10) and never
leaks into the synthetic-only validation set.
