# BLOCKCRAFT

A handcrafted voxel sandbox that runs in the browser. Explore an infinite procedural world, mine and place blocks, build a base, watch the sun go down, and meet the local wildlife.

Built with [Three.js](https://threejs.org/) and [Vite](https://vite.dev/).

## Play

```bash
npm install
npm run dev
```

Open the URL Vite prints (the project defaults to port `3002`). To make a production build:

```bash
npm run build
npm run preview
```

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look (click the world to capture the cursor) |
| Left mouse | Mine / hold to break |
| Right mouse | Place selected block |
| `Space` | Jump (ascend while flying) |
| `Shift` | Sprint |
| `Ctrl` | Crouch (descend while flying) |
| `1`–`9` / wheel | Choose hotbar slot |
| `E` | Open the block palette |
| `F` | Toggle flying |
| `F3` | Debug overlay |
| `Esc` | Pause / release the cursor |

On phones and tablets, drag the left thumbstick to move, drag the right side of the screen to look, and use the buttons for jump, mine, place, fly, and the block palette. The layout respects notches and other safe-area insets.

## Features

- Infinite chunked terrain with plains, forests, deserts, snowy peaks, beaches, caves, ore veins, lakes, trees, flowers, cacti, and pumpkins.
- Per-face ambient occlusion baked into chunk meshes, with distance fog and a full day/night cycle.
- Mining with block-specific hardness, placement, block particles, a held-item view, and synthesized Web Audio effects.
- Pigs, sheep, and chickens wandering the landscape.
- Creative block palette with 26 block types, isometric inventory icons, and a nine-slot hotbar.
- Procedural texture atlas generated at runtime — no external art assets.
- Worlds are saved to `localStorage`; edits, time of day, and the spawn point survive reloads.
- Shareable world seeds through the URL (`?seed=...`).

## Project layout

```text
src/
  main.js      game loop, input, HUD, saving, held item, particles
  world.js     terrain generation, chunk meshing, AO, trees, spawn clearing
  player.js    movement, collision, camera, block raycasting
  blocks.js    texture atlas, block registry, inventory icons
  mobs.js      low-poly animals
  sky.js       sky shader, sun/moon, stars, clouds, lighting
  audio.js     procedural sound effects
  noise.js     deterministic noise and hashing helpers
  style.css    menu, HUD, touch controls, responsive layouts
```

## Development notes

The renderer uses `MeshLambertMaterial` and baked vertex colours rather than real-time shadows, keeping the scene light enough for laptops and phones. World edits are stored as a compact list of chunk-local indices. Software-rendered browsers (such as Playwright's SwiftShader fallback) will report much lower frame rates than a real GPU.
