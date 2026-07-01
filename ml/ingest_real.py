
"""
Ingest real labeled examples exported from the web app into a training set.

In the app's "From photos" view, place each face's corner box accurately and click
"Save corners for training" — that downloads a `cube-labels-*.json` (the photos +
the corners you placed, which ARE the ground-truth labels). Drop those JSON files
into `ml/real/`, then run this to decode them into an image folder + labels.json in
the same format as generate_dataset.py.

    python ingest_real.py                      # ml/real/*.json -> ml/real_dataset/
    python train.py --extra real_dataset       # mix real data into training

This is the real-labeled-capture loop: every cube you scan can become training data
that closes the synthetic-to-real gap — no manual annotation tool needed.
"""
import argparse
import base64
import glob
import json
import os
from io import BytesIO

from PIL import Image

HERE = os.path.dirname(__file__)

def main():
    ap = argparse.ArgumentParser(description="Ingest app-exported labels into a dataset.")
    ap.add_argument("--src", default=os.path.join(HERE, "real"))
    ap.add_argument("--out", default=os.path.join(HERE, "real_dataset"))
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.src, "*.json")))
    if not files:
        print(f"No *.json found in {args.src}. Export from the app and drop them there.")
        return

    os.makedirs(os.path.join(args.out, "images"), exist_ok=True)
    samples = []
    n = 0
    for jf in files:
        with open(jf) as f:
            data = json.load(f)
        for s in data.get("samples", []):
            b64 = s["image"].split(",", 1)[-1]
            img = Image.open(BytesIO(base64.b64decode(b64))).convert("RGB")
            fname = f"real_{n:05d}.jpg"
            img.save(os.path.join(args.out, "images", fname), "JPEG", quality=92)
            samples.append({"file": f"images/{fname}", "corners": s["corners"]})
            n += 1

    with open(os.path.join(args.out, "labels.json"), "w") as f:
        json.dump({"order": "TL,TR,BR,BL", "samples": samples}, f)
    print(f"Ingested {n} real labeled examples from {len(files)} file(s) -> {args.out}")
    print("Now: python train.py --extra real_dataset")

if __name__ == "__main__":
    main()
