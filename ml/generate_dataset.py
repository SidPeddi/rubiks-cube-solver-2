
"""
Synthetic dataset generator for the cube-face corner detector.

It produces training images of a cube face placed at random perspectives, on
random backgrounds, under random lighting/noise/blur/JPEG — together with the
*exact* 4 corner labels (because we choose the destination quad, we know where
the corners land). This is the auto-labeled data the corner-regression model
trains on.

Two source modes for the face "texture":
  - Real photos: drop ~10-20 straight-on cube-face photos into `ml/faces/`
    (scrambled faces are best — mixed colours give strong grid lines). Each photo
    is treated as a face that fills the frame.
  - None provided: it renders synthetic 3x3 sticker grids procedurally.

Backgrounds: drop images into `ml/backgrounds/` (optional); otherwise random
gradients + noise are generated.

Usage:
    python generate_dataset.py --count 4000 --size 256 --out dataset
    python generate_dataset.py --count 24            # quick sample + previews

Output:
    <out>/images/img_00000.jpg ...
    <out>/labels.json          # [{ "file", "corners": [[x,y]x4 normalized TL,TR,BR,BL] }]
    <out>/preview/...          # first N images with the labelled quad drawn on
"""
import argparse
import json
import os
import random
from io import BytesIO

import numpy as np
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

STICKER_COLORS = [
    (245, 245, 245), (254, 213, 20), (0, 158, 80),
    (0, 81, 186), (200, 30, 45), (255, 110, 10),
]

def find_coeffs(target, source):
    """PIL PERSPECTIVE coefficients mapping `source` corners onto `target` corners."""
    matrix = []
    for t, s in zip(target, source):
        matrix.append([t[0], t[1], 1, 0, 0, 0, -s[0] * t[0], -s[0] * t[1]])
        matrix.append([0, 0, 0, t[0], t[1], 1, -s[1] * t[0], -s[1] * t[1]])
    A = np.array(matrix, dtype=np.float64)
    B = np.array(source, dtype=np.float64).reshape(8)
    return np.linalg.solve(A, B).reshape(8)

def render_synthetic_face(side=240):
    """Render a random 3x3 sticker grid (RGBA, fully opaque) as a fake face."""
    img = Image.new("RGBA", (side, side), (15, 15, 18, 255))
    draw = ImageDraw.Draw(img)
    gap = side // 22
    cell = (side - 4 * gap) // 3
    for r in range(3):
        for c in range(3):
            x0 = gap + c * (cell + gap)
            y0 = gap + r * (cell + gap)
            col = random.choice(STICKER_COLORS)
            draw.rounded_rectangle([x0, y0, x0 + cell, y0 + cell], radius=cell // 6, fill=col + (255,))
    return img

def load_faces(faces_dir):
    faces = []
    if os.path.isdir(faces_dir):
        for name in sorted(os.listdir(faces_dir)):
            if name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                try:
                    faces.append(Image.open(os.path.join(faces_dir, name)).convert("RGBA"))
                except Exception:
                    pass
    return faces

def load_backgrounds(bg_dir):
    bgs = []
    if os.path.isdir(bg_dir):
        for name in sorted(os.listdir(bg_dir)):
            if name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                try:
                    bgs.append(Image.open(os.path.join(bg_dir, name)).convert("RGB"))
                except Exception:
                    pass
    return bgs

def procedural_background(size):
    """A random gradient + noise — cheap, varied background when none supplied."""
    w, h = size
    c0 = np.array([random.randint(0, 255) for _ in range(3)], dtype=np.float64)
    c1 = np.array([random.randint(0, 255) for _ in range(3)], dtype=np.float64)
    t = np.linspace(0, 1, w if random.random() < 0.5 else h)
    if random.random() < 0.5:
        grad = (c0[None, None, :] * (1 - t)[None, :, None] + c1[None, None, :] * t[None, :, None])
        grad = np.broadcast_to(grad, (h, w, 3)).copy()
    else:
        grad = (c0[None, None, :] * (1 - t)[:, None, None] + c1[None, None, :] * t[:, None, None])
        grad = np.broadcast_to(grad, (h, w, 3)).copy()
    grad += np.random.normal(0, 10, (h, w, 3))
    return Image.fromarray(np.clip(grad, 0, 255).astype(np.uint8), "RGB")

def random_background(size, bgs):
    if bgs and random.random() < 0.85:
        bg = random.choice(bgs)

        scale = random.uniform(1.0, 1.6)
        cw, ch = int(size[0] * scale), int(size[1] * scale)
        bg = bg.resize((max(cw, size[0]), max(ch, size[1])))
        x = random.randint(0, bg.width - size[0])
        y = random.randint(0, bg.height - size[1])
        return bg.crop((x, y, x + size[0], y + size[1])).convert("RGB")
    return procedural_background(size)

def random_dst_quad(size):
    """A random convex quad (TL,TR,BR,BL) placing the face in the canvas. Wider
    rotation + perspective jitter than before, to match hand-held phone angles."""
    w, h = size
    s = random.uniform(0.30, 0.86) * min(w, h)
    cx = random.uniform(0.34, 0.66) * w
    cy = random.uniform(0.34, 0.66) * h
    half = s / 2
    base = [(-half, -half), (half, -half), (half, half), (-half, half)]
    theta = np.radians(random.uniform(-30, 30))
    ct, st = np.cos(theta), np.sin(theta)
    jit = s * 0.20
    quad = []
    for (x, y) in base:
        rx = x * ct - y * st
        ry = x * st + y * ct
        rx += cx + random.uniform(-jit, jit)
        ry += cy + random.uniform(-jit, jit)
        quad.append((rx, ry))
    return quad

def warp_face(face, dst, canvas):
    """Warp a face image (RGBA) onto dst corners (TL,TR,BR,BL) over a clear canvas."""
    src = [(0, 0), (face.width, 0), (face.width, face.height), (0, face.height)]
    coeffs = find_coeffs([tuple(p) for p in dst], src)
    return face.transform(canvas, Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=(0, 0, 0, 0))

def add_side_faces(scene, faces, dst, canvas):
    """Composite a 3-D cube body: darker adjacent faces along the front face's
    edges, painted BEHIND the front face (which is drawn afterwards on top). This
    teaches the model to pick the front colored face out of real cube structure
    instead of latching onto any colored blob."""
    TL, TR, BR, BL = [np.array(p, dtype=np.float64) for p in dst]
    side = (np.linalg.norm(TR - TL) + np.linalg.norm(BR - BL)) / 2
    depth = side * random.uniform(0.14, 0.34)

    def pick():
        return (random.choice(faces).copy() if faces else render_synthetic_face())

    quads = []

    if random.random() < 0.75:
        if random.random() < 0.5:
            dvec = np.array([depth, -depth * random.uniform(0.0, 0.4)])
            quads.append([TR, TR + dvec, BR + dvec, BR])
        else:
            dvec = np.array([-depth, -depth * random.uniform(0.0, 0.4)])
            quads.append([TL + dvec, TL, BL, BL + dvec])

    if random.random() < 0.55:
        if random.random() < 0.6:
            uvec = np.array([depth * random.uniform(-0.3, 0.3), -depth])
            quads.append([TL + uvec, TR + uvec, TR, TL])
        else:
            uvec = np.array([depth * random.uniform(-0.3, 0.3), depth])
            quads.append([BL, BR, BR + uvec, BL + uvec])

    for quad in quads:
        sf = ImageEnhance.Brightness(pick()).enhance(random.uniform(0.4, 0.72))
        warped = warp_face(sf, [tuple(p) for p in quad], canvas)
        scene.alpha_composite(warped)

def augment(img):
    """Photometric + sensor augmentations to bridge the sim-to-real gap."""
    img = ImageEnhance.Brightness(img).enhance(random.uniform(0.55, 1.45))
    img = ImageEnhance.Contrast(img).enhance(random.uniform(0.7, 1.35))
    img = ImageEnhance.Color(img).enhance(random.uniform(0.65, 1.4))
    gamma = random.uniform(0.7, 1.45)
    lut = [int(np.clip(((i / 255.0) ** gamma) * 255, 0, 255)) for i in range(256)] * 3
    img = img.point(lut)

    if random.random() < 0.7:
        rs = random.uniform(0.88, 1.14)
        bs = random.uniform(0.88, 1.14)
        arr = np.asarray(img).astype(np.float64)
        arr[..., 0] *= rs
        arr[..., 2] *= bs
        img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")

    if random.random() < 0.45:
        sh = Image.new("L", img.size, 0)
        sd = ImageDraw.Draw(sh)
        x0 = random.randint(-img.width // 3, img.width)
        sd.polygon(
            [(x0, 0), (x0 + random.randint(img.width // 3, img.width), 0),
             (x0 + random.randint(0, img.width), img.height), (x0 - random.randint(0, img.width // 2), img.height)],
            fill=random.randint(60, 140),
        )
        sh = sh.filter(ImageFilter.GaussianBlur(img.width / 8))
        dark = ImageEnhance.Brightness(img).enhance(random.uniform(0.4, 0.7))
        img = Image.composite(dark, img, sh)
    if random.random() < 0.5:
        img = img.filter(ImageFilter.GaussianBlur(random.uniform(0.0, 1.8)))
    if random.random() < 0.18:
        k = 5
        kernel = [0.0] * (k * k)
        for j in range(k):
            kernel[(k // 2) * k + j] = 1.0 / k
        img = img.filter(ImageFilter.Kernel((k, k), kernel, scale=1.0))
    if random.random() < 0.45:
        glare = Image.new("RGBA", img.size, (0, 0, 0, 0))
        gd = ImageDraw.Draw(glare)
        gx, gy = random.randint(0, img.width), random.randint(0, img.height)
        gr = random.randint(img.width // 12, img.width // 5)
        gd.ellipse([gx - gr, gy - gr, gx + gr, gy + gr], fill=(255, 255, 255, random.randint(40, 130)))
        glare = glare.filter(ImageFilter.GaussianBlur(gr / 3))
        img = Image.alpha_composite(img.convert("RGBA"), glare).convert("RGB")
    if random.random() < 0.3:
        oc = Image.new("RGBA", img.size, (0, 0, 0, 0))
        od = ImageDraw.Draw(oc)
        skin = random.choice([(210, 170, 140), (60, 60, 65), (180, 140, 110), (30, 30, 35)])
        ox = random.choice([0, img.width])
        oy = random.randint(0, img.height)
        orr = random.randint(img.width // 8, img.width // 4)
        od.ellipse([ox - orr, oy - orr, ox + orr, oy + orr], fill=skin + (255,))
        oc = oc.filter(ImageFilter.GaussianBlur(2))
        img = Image.alpha_composite(img.convert("RGBA"), oc).convert("RGB")
    arr = np.asarray(img).astype(np.float64)
    arr += np.random.normal(0, random.uniform(0, 12), arr.shape)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB")
    if random.random() < 0.88:
        buf = BytesIO()
        img.save(buf, "JPEG", quality=random.randint(34, 95))
        buf.seek(0)
        img = Image.open(buf).convert("RGB")
    return img

def generate(count, size, out, faces_dir, bg_dir, preview_n):
    os.makedirs(os.path.join(out, "images"), exist_ok=True)
    os.makedirs(os.path.join(out, "preview"), exist_ok=True)
    faces = load_faces(faces_dir)
    bgs = load_backgrounds(bg_dir)
    print(f"Source faces: {len(faces) or 'none (rendering synthetic)'} | backgrounds: {len(bgs) or 'procedural'}")
    canvas = (size, size)
    labels = []
    for i in range(count):
        face = random.choice(faces).copy() if faces else render_synthetic_face()
        dst = random_dst_quad(canvas)
        scene = random_background(canvas, bgs).convert("RGBA")

        add_side_faces(scene, faces, dst, canvas)

        scene.alpha_composite(warp_face(face, dst, canvas))
        final = augment(scene.convert("RGB"))
        fname = f"img_{i:05d}.jpg"
        final.save(os.path.join(out, "images", fname), "JPEG", quality=92)
        corners = [[round(x / size, 5), round(y / size, 5)] for (x, y) in dst]
        labels.append({"file": f"images/{fname}", "corners": corners})
        if i < preview_n:
            prev = final.copy()
            d = ImageDraw.Draw(prev)
            poly = [(c[0] * size, c[1] * size) for c in corners]
            d.line(poly + [poly[0]], fill=(0, 255, 0), width=2)
            for (px, py) in poly:
                d.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(255, 0, 0))
            prev.save(os.path.join(out, "preview", fname))
        if (i + 1) % 500 == 0:
            print(f"  {i + 1}/{count}")
    with open(os.path.join(out, "labels.json"), "w") as f:
        json.dump({"size": size, "order": "TL,TR,BR,BL", "samples": labels}, f)
    print(f"Done: {count} images -> {out}/images, labels -> {out}/labels.json, previews -> {out}/preview")

def main():
    ap = argparse.ArgumentParser(description="Generate a synthetic cube-face corner dataset.")
    ap.add_argument("--count", type=int, default=4000)
    ap.add_argument("--size", type=int, default=256)
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "dataset"))
    ap.add_argument("--faces", default=os.path.join(os.path.dirname(__file__), "faces"))
    ap.add_argument("--backgrounds", default=os.path.join(os.path.dirname(__file__), "backgrounds"))
    ap.add_argument("--preview", type=int, default=16, help="how many preview (labelled) images to write")
    args = ap.parse_args()
    random.seed(0)
    np.random.seed(0)
    generate(args.count, args.size, args.out, args.faces, args.backgrounds, args.preview)

if __name__ == "__main__":
    main()
