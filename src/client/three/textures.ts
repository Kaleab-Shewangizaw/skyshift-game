import * as THREE from 'three';
import { makeRng } from '../../shared/rng';

// Small procedural textures, drawn once on a canvas. No image downloads.

const canvasTexture = (
  size: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
};

/** One "window cell" per 4 m × 3.5 m of facade. White walls so material color tints them. */
export const facadeTexture = (): THREE.CanvasTexture =>
  canvasTexture(64, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#e9e4dc';
    ctx.fillRect(0, 56, 64, 8);
    ctx.fillStyle = '#5b6b7d';
    ctx.fillRect(12, 14, 40, 34);
    ctx.fillStyle = '#8fa6bd';
    ctx.fillRect(14, 16, 17, 30);
    ctx.fillRect(33, 16, 17, 30);
  });

/** Emissive map with a random subset of windows lit, for night scenes. */
export const nightWindowsTexture = (seed: number): THREE.CanvasTexture => {
  const rng = makeRng(seed);
  const cells = 8;
  return canvasTexture(256, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        if (rng() < 0.45) continue;
        ctx.fillStyle = rng() < 0.7 ? '#ffd27a' : '#bfe3ff';
        ctx.fillRect(x * 32 + 6, y * 32 + 7, 20, 17);
      }
    }
  });
};

/** Lattice for the crane mast: transparent with yellow struts. */
export const latticeTexture = (): THREE.CanvasTexture =>
  canvasTexture(64, (ctx) => {
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = '#f2b632';
    ctx.lineWidth = 7;
    ctx.strokeRect(3, 0, 58, 64);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(4, 64);
    ctx.lineTo(60, 0);
    ctx.moveTo(4, 2);
    ctx.lineTo(60, 2);
    ctx.stroke();
  });

/** Asphalt with a dashed center line along U. */
export const roadTexture = (): THREE.CanvasTexture =>
  canvasTexture(64, (ctx) => {
    ctx.fillStyle = '#4a4d55';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 40; i++)
      ctx.fillRect((i * 37) % 64, (i * 23) % 64, 2, 2);
    ctx.fillStyle = '#f4d35e';
    ctx.fillRect(0, 30, 34, 4);
  });

/** Packed dirt for the building lot. */
export const dirtTexture = (): THREE.CanvasTexture =>
  canvasTexture(128, (ctx) => {
    ctx.fillStyle = '#b98a5a';
    ctx.fillRect(0, 0, 128, 128);
    const rng = makeRng(7);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle =
        rng() < 0.5 ? 'rgba(90,60,30,0.18)' : 'rgba(255,230,190,0.16)';
      const r = 1 + rng() * 3;
      ctx.beginPath();
      ctx.arc(rng() * 128, rng() * 128, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });

/** Fresh concrete slab with chalk layout lines every 3 m (a 12 m tile = 4×4 cells). */
export const padTexture = (): THREE.CanvasTexture =>
  canvasTexture(256, (ctx) => {
    ctx.fillStyle = '#d3d0c8';
    ctx.fillRect(0, 0, 256, 256);
    const rng = makeRng(11);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle =
        rng() < 0.5 ? 'rgba(120,115,105,0.10)' : 'rgba(255,255,255,0.12)';
      ctx.fillRect(rng() * 256, rng() * 256, 2, 2);
    }
    ctx.strokeStyle = 'rgba(70,140,220,0.55)';
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      const v = i * 64;
      ctx.beginPath();
      ctx.moveTo(v, 6);
      ctx.lineTo(v, 250);
      ctx.moveTo(6, v);
      ctx.lineTo(250, v);
      ctx.stroke();
    }
    // A faint joint where neighboring pads meet.
    ctx.strokeStyle = 'rgba(90,85,78,0.22)';
    ctx.lineWidth = 3;
    ctx.strokeRect(3, 3, 250, 250);
  });

/** Speckled cast concrete. White-ish so the material color can tint it. */
export const concreteTexture = (): THREE.CanvasTexture =>
  canvasTexture(256, (ctx) => {
    ctx.fillStyle = '#e4e1da';
    ctx.fillRect(0, 0, 256, 256);
    const rng = makeRng(21);
    for (let i = 0; i < 2600; i++) {
      const v = rng();
      ctx.fillStyle =
        v < 0.5 ? 'rgba(110,104,96,0.10)' : 'rgba(255,255,255,0.18)';
      const r = 0.6 + rng() * 1.6;
      ctx.beginPath();
      ctx.arc(rng() * 256, rng() * 256, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // A few faint form-work lines.
    ctx.strokeStyle = 'rgba(120,114,104,0.10)';
    ctx.lineWidth = 2;
    for (const y of [64, 128, 192]) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
  });

/** Running-bond brick, one texture repeat ≈ 1 m × 1 m. */
export const brickTexture = (): THREE.CanvasTexture =>
  canvasTexture(256, (ctx) => {
    ctx.fillStyle = '#d9cfc2'; // mortar
    ctx.fillRect(0, 0, 256, 256);
    const rng = makeRng(5);
    const rows = 13;
    const h = 256 / rows;
    const w = 256 / 4;
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 ? w / 2 : 0;
      for (let c = -1; c < 5; c++) {
        const x = c * w + offset;
        const shade = 0.82 + rng() * 0.3;
        const red = Math.round(196 * shade);
        const green = Math.round(98 * shade);
        const blue = Math.round(72 * shade);
        ctx.fillStyle = `rgb(${red},${green},${blue})`;
        ctx.fillRect(x + 2, r * h + 2, w - 4, h - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + 2, r * h + 2, w - 4, 2);
      }
    }
  });

/** Dressed stone blocks in staggered courses. */
export const stoneTexture = (): THREE.CanvasTexture =>
  canvasTexture(256, (ctx) => {
    ctx.fillStyle = '#9c968b';
    ctx.fillRect(0, 0, 256, 256);
    const rng = makeRng(9);
    const rows = 5;
    const h = 256 / rows;
    for (let r = 0; r < rows; r++) {
      let x = r % 2 ? -40 : 0;
      while (x < 256) {
        const w = 70 + rng() * 60;
        const shade = 0.86 + rng() * 0.22;
        const v = Math.round(196 * shade);
        ctx.fillStyle = `rgb(${v},${Math.round(v * 0.96)},${Math.round(v * 0.89)})`;
        ctx.fillRect(x + 3, r * h + 3, w - 6, h - 6);
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle =
            rng() < 0.5 ? 'rgba(80,72,60,0.12)' : 'rgba(255,255,255,0.12)';
          ctx.fillRect(
            x + 3 + rng() * (w - 6),
            r * h + 3 + rng() * (h - 6),
            2,
            2
          );
        }
        x += w;
      }
    }
  });

/** Vertical timber boards with grain. */
export const timberTexture = (): THREE.CanvasTexture =>
  canvasTexture(256, (ctx) => {
    const rng = makeRng(13);
    const boards = 6;
    const w = 256 / boards;
    for (let b = 0; b < boards; b++) {
      const shade = 0.85 + rng() * 0.25;
      ctx.fillStyle = `rgb(${Math.round(214 * shade)},${Math.round(160 * shade)},${Math.round(104 * shade)})`;
      ctx.fillRect(b * w, 0, w, 256);
      ctx.strokeStyle = 'rgba(110,70,35,0.22)';
      ctx.lineWidth = 1;
      for (let g = 0; g < 7; g++) {
        const gx = b * w + 4 + rng() * (w - 8);
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.bezierCurveTo(gx + 4, 80, gx - 4, 170, gx + 2, 256);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(70,40,20,0.45)';
      ctx.fillRect(b * w, 0, 2, 256);
    }
  });
