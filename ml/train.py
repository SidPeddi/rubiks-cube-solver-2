
"""
Train the cube-face corner detector and export it to ONNX.

Reads the dataset produced by generate_dataset.py (images + labels.json) and
trains a **heatmap keypoint** model: a CNN predicts one heatmap per corner, and a
differentiable spatial soft-argmax (DSNT-style) turns each heatmap into an (x,y)
coordinate. Heatmap localization is more accurate and robust than regressing the
8 numbers directly. The soft-argmax is baked into the model, so the exported ONNX
still outputs 8 normalized numbers (order TL,TR,BR,BL) — the browser side
(src/vision/detectModel.ts) needs no changes.

Training loss = coordinate SmoothL1 + a heatmap term that pulls each predicted
heatmap toward a Gaussian blob at the true corner (keeps peaks sharp/unimodal).

Re-runnable: regenerate data and re-run any time. Nothing is locked in.

Usage:
    python train.py --epochs 60 --size 160          # uses ml/dataset, writes ml/model.onnx
    python train.py --data dataset --out model.onnx --batch 32

Preprocessing here MUST match src/vision/detectModel.ts: RGB, resized to --size,
values /255, NCHW. Output: 8 numbers in [0,1] = TL,TR,BR,BL.
"""
import argparse
import json
import os

import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torch.utils.data import ConcatDataset, DataLoader, Dataset, random_split

HERE = os.path.dirname(__file__)

def resolve(root, samples):
    """Resolve each sample's file to an absolute path (root may be relative to ml/)."""
    if not os.path.isabs(root):
        root = os.path.join(HERE, root)
    return [{"path": os.path.join(root, s["file"]), "corners": s["corners"]} for s in samples]

class CornerDataset(Dataset):
    def __init__(self, entries, size, aug=False):
        self.entries = entries
        self.size = size
        self.aug = aug

    def __len__(self):
        return len(self.entries)

    def __getitem__(self, i):
        s = self.entries[i]
        img = Image.open(s["path"]).convert("RGB").resize((self.size, self.size), Image.BILINEAR)
        arr = np.asarray(img, dtype=np.float32) / 255.0
        if self.aug:
            import random as _r
            arr = np.clip(arr * _r.uniform(0.7, 1.3) + _r.uniform(-0.08, 0.08), 0, 1)
            arr = np.clip(((arr - 0.5) * _r.uniform(0.8, 1.25)) + 0.5, 0, 1)
        x = torch.from_numpy(arr).permute(2, 0, 1).contiguous().float()
        y = torch.tensor([v for pt in s["corners"] for v in pt], dtype=torch.float32)
        return x, y

class SoftArgmax2d(nn.Module):
    """Spatial softmax → expected (x,y) per channel, in normalized [0,1] coords."""

    def __init__(self, size):
        super().__init__()
        self.register_buffer("xs", torch.linspace(0, 1, size).view(1, 1, 1, size))
        self.register_buffer("ys", torch.linspace(0, 1, size).view(1, 1, size, 1))

    def forward(self, heat):
        b, c, h, w = heat.shape
        prob = torch.softmax(heat.reshape(b, c, h * w), dim=2).reshape(b, c, h, w)
        ex = (prob * self.xs).sum(dim=3).sum(dim=2)
        ey = (prob * self.ys).sum(dim=3).sum(dim=2)
        coords = torch.stack([ex, ey], dim=2).reshape(b, c * 2)
        return coords, prob

class CornerNet(nn.Module):
    """Encoder (down to size/4) with dilated convs for a wide receptive field,
    a 4-channel heatmap head, and soft-argmax. ~0.3M params."""

    def __init__(self, size):
        super().__init__()

        def cbr(cin, cout, stride=1, dil=1):
            return nn.Sequential(
                nn.Conv2d(cin, cout, 3, stride=stride, padding=dil, dilation=dil, bias=False),
                nn.BatchNorm2d(cout),
                nn.ReLU(inplace=True),
            )

        self.backbone = nn.Sequential(
            cbr(3, 16, stride=2),
            cbr(16, 32, stride=2),
            cbr(32, 64),
            cbr(64, 64, dil=2),
            cbr(64, 64, dil=4),
            cbr(64, 64),
        )
        self.head = nn.Conv2d(64, 4, 1)
        self.softargmax = SoftArgmax2d(size // 4)

    def forward(self, x):
        f = self.backbone(x)
        h = self.head(f)
        return self.softargmax(h)

class ExportWrapper(nn.Module):
    """Exposes only the 8 coords for ONNX (drops the heatmap)."""

    def __init__(self, net):
        super().__init__()
        self.net = net

    def forward(self, x):
        return self.net(x)[0]

def make_model(size):
    return CornerNet(size)

def gaussian_targets(coords, h, w, sigma, device):
    """Per-corner Gaussian heatmaps centered at the true corners, sum-normalized
    to match the predicted spatial-softmax distributions. coords: B,8 in [0,1]."""
    b = coords.shape[0]
    xs = torch.linspace(0, 1, w, device=device).view(1, 1, 1, w)
    ys = torch.linspace(0, 1, h, device=device).view(1, 1, h, 1)
    cx = coords[:, 0::2].reshape(b, 4, 1, 1)
    cy = coords[:, 1::2].reshape(b, 4, 1, 1)
    g = torch.exp(-(((xs - cx) ** 2) + ((ys - cy) ** 2)) / (2 * sigma * sigma))
    return g / (g.sum(dim=3, keepdim=True).sum(dim=2, keepdim=True) + 1e-8)

def pick_device():
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"

def run_epoch(model, loader, device, opt=None, lam=1.0, sigma=0.04):
    train = opt is not None
    model.train(train)
    coordfn = nn.SmoothL1Loss()
    total, abs_err, n = 0.0, 0.0, 0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        with torch.set_grad_enabled(train):
            coords, prob = model(x)
            h, w = prob.shape[2], prob.shape[3]
            tgt = gaussian_targets(y, h, w, sigma, device)
            loss_hm = ((prob - tgt) ** 2).sum(dim=3).sum(dim=2).mean()
            loss = coordfn(coords, y) + lam * loss_hm
            if train:
                opt.zero_grad()
                loss.backward()
                opt.step()
        total += loss.item() * x.size(0)
        abs_err += (coords - y).abs().mean(dim=1).sum().item()
        n += x.size(0)
    return total / n, abs_err / n

def main():
    ap = argparse.ArgumentParser(description="Train cube-face corner heatmap detector → ONNX")
    ap.add_argument("--data", default=os.path.join(HERE, "dataset"))
    ap.add_argument("--out", default=os.path.join(HERE, "model.onnx"))
    ap.add_argument("--size", type=int, default=160)
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--extra", default="", help="comma-sep dirs of real labeled data (from ingest_real.py)")
    ap.add_argument("--extra-rep", type=int, default=10, help="how many times to oversample the real data")
    args = ap.parse_args()

    with open(os.path.join(args.data, "labels.json")) as f:
        meta = json.load(f)
    samples = meta["samples"]
    print(f"Loaded {len(samples)} synthetic samples (label order: {meta.get('order')})")
    if len(samples) < 50:
        print("⚠️  Very small dataset — regenerate with e.g. --count 2000+ for a real model.")

    synth = CornerDataset(resolve(args.data, samples), args.size)
    n_val = max(1, int(len(synth) * 0.1))
    n_train = len(synth) - n_val
    train_synth, val_ds = random_split(synth, [n_train, n_val], generator=torch.Generator().manual_seed(0))

    parts = [train_synth]
    for d in [x for x in args.extra.split(",") if x.strip()]:
        with open(os.path.join(d if os.path.isabs(d) else os.path.join(HERE, d), "labels.json")) as f:
            real = json.load(f)["samples"]
        real_ds = CornerDataset(resolve(d, real), args.size, aug=True)
        print(f"  + {len(real)} real samples from {d} (×{args.extra_rep} oversample)")
        parts += [real_ds] * args.extra_rep
    train_ds = ConcatDataset(parts)

    train_loader = DataLoader(train_ds, batch_size=args.batch, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch)

    device = pick_device()
    print(f"Device: {device}")
    model = make_model(args.size).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    best = float("inf")
    for epoch in range(1, args.epochs + 1):
        tr_loss, _ = run_epoch(model, train_loader, device, opt)
        va_loss, va_err = run_epoch(model, val_loader, device)
        sched.step()
        px = va_err * args.size
        print(f"epoch {epoch:3d}/{args.epochs}  train {tr_loss:.5f}  val {va_loss:.5f}  ~{px:.1f}px/corner")
        if va_loss < best:
            best = va_loss
            torch.save(model.state_dict(), os.path.splitext(args.out)[0] + ".pt")

    model.eval().cpu()
    wrapper = ExportWrapper(model).eval()
    dummy = torch.randn(1, 3, args.size, args.size)
    torch.onnx.export(
        wrapper,
        dummy,
        args.out,
        input_names=["image"],
        output_names=["corners"],
        opset_version=12,
        dynamic_axes={"image": {0: "batch"}, "corners": {0: "batch"}},
        dynamo=False,
    )
    print(f"Exported ONNX → {args.out}  (input 1x3x{args.size}x{args.size}, RGB /255, NCHW; output 8 = TL,TR,BR,BL)")
    print("Copy to public/model.onnx and bump MODEL_VERSION in ImageUploader.tsx.")

if __name__ == "__main__":
    main()
