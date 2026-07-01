# Rubik's Cube Solver

A full-stack web app that takes a Rubik's Cube entered by hand or recognized from photos and produces a correct solution. Everything runs in the browser. 


## Set up on a new machine

The project is a self-contained Node/TypeScript web app — no databases, services,
or system libraries to install. You only need Node.js and a modern browser.

### 1. Install Node.js (18 or newer)

  ```bash
  # install nvm: https://github.com/nvm-sh/nvm
  nvm install --lts
  nvm use --lts
  ```

### 2. Get the project onto the machine

- If it's in a Git repository:
  ```bash
  git clone <your-repo-url> rubiks-cube-solver
  cd rubiks-cube-solver
  ```

### 3. Install dependencies

```bash
npm install
```

### 4. Run it

```bash
npm run dev
```

Then open the URL it prints — **http://localhost:5173**

### 5. (Optional) verify the build and tests

```bash
npm run test:run   
npm run build     
npm run preview    
```

---


## Using the app

### Manual entry
1. Pick a color from the palette, then click stickers on the net to paint them
   (click-and-drag to paint several). Each face is titled by its center color, and
   the center sticker of each face is fixed (you can't repaint it).
2. Use **Random scramble** to generate a solvable cube, or **Reset to solved**.
3. When the cube is valid the **Solve** button is enabled (an invalid cube shows a
   message explaining why) — press **Solve**.

### From photos
1. Switch to the **From photos** tab.
2. Hold the cube a consistent way and follow the on-screen scan order (White up,
   Green facing you; keep White on top while shooting the four sides). Each capture
   box shows the color that belongs at its **top edge** and marks the **top-left
   (TL)** corner, so every photo goes in the right way up. On a **phone**, tapping a
   face opens the camera directly.
3. Add a photo of each face. A centered 3×3 grid appears over each one.
4. **Drag the four corner handles** so the grid lines up with that face's stickers —
   this corrects for angle, perspective, and off-center framing. Hit **Auto-detect**
   to have the ML detector place the box for you, **Center box** to reset it, or
   **Replace** to swap the photo.
5. Press **Detect colors from photos**. Detected colors load onto the net
   (low-confidence stickers get a dashed outline) so you can **review and fix**
   them before solving.

### Following the solution
- The instruction card tells you exactly which face to turn and which way.
- The **3-D cube animates each turn**; the flat net highlights the turning face
  with a direction arrow. Drag the 3-D cube to watch the turn from any angle.
- **Play / pause**, choose a **speed**, step **forward / back**, or click any move
  to jump there. The phase banner explains what each stage is doing.
- A **checkpoint timeline** lists the six solve phases (done / in-progress /
  upcoming) — click any phase to jump to it.
- **Keyboard:** ← / → step, **Space** play/pause, **Home / End** jump to the
  start / end.

---
