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
    ctx.strokeStyle = 'rgba(90,85,78,0.6)';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 250);
  });
