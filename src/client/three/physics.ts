import { CITY_RADIUS, TILE, isLotTile, isPad, tileAt } from '../../shared/city';
import { STOREY, type Piece } from '../../shared/structure';
import { PAD_TOP, pieceBox } from './layout';

// Simple character physics: the world is a list of axis-aligned boxes. The
// player is a short upright cylinder. Boxes block sideways movement when they
// rise above step height, and their tops are floors to stand on. Columns can
// be climbed like ladders.

export type Collider = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY: number;
  maxY: number;
  /** Walking into it climbs instead of stopping. */
  climbable: boolean;
};

export type Body = {
  x: number;
  /** Height of the feet. */
  y: number;
  z: number;
  vy: number;
  /** Facing angle (radians, 0 = +z). */
  heading: number;
  grounded: boolean;
  climbing: boolean;
};

export type Input = {
  /** Joystick / keys, -1..1 each; already turned to world space. */
  moveX: number;
  moveZ: number;
  jump: boolean;
};

export const RADIUS = 0.35;
export const HEIGHT = 1.8;
const STEP = 0.55;
const WALK = 5.2;
const CLIMB = 2.6;
const GRAVITY = 22;
const JUMP = 7.2;
const LIMIT = (CITY_RADIUS + 0.5) * TILE - 1;

const fromBox = (
  pos: [number, number, number],
  size: [number, number, number],
  climbable = false
): Collider => ({
  minX: pos[0] - size[0] / 2,
  maxX: pos[0] + size[0] / 2,
  minY: pos[1] - size[1] / 2,
  maxY: pos[1] + size[1] / 2,
  minZ: pos[2] - size[2] / 2,
  maxZ: pos[2] + size[2] / 2,
  climbable,
});

/** Everything solid: city buildings, pads, the crane mast and every placed piece. */
export const buildColliders = (
  site: readonly string[],
  pads: readonly string[],
  pieces: readonly Piece[],
  crane: [number, number]
): Collider[] => {
  const out: Collider[] = [];
  for (let x = -CITY_RADIUS; x <= CITY_RADIUS; x++) {
    for (let z = -CITY_RADIUS; z <= CITY_RADIUS; z++) {
      const t = tileAt(site, x, z);
      if (t.kind === 'building') {
        const s = TILE - 2.6;
        out.push(fromBox([x * TILE, t.height / 2, z * TILE], [s, t.height, s]));
      } else if (isLotTile(site, x, z) && isPad(pads, x, z)) {
        out.push(
          fromBox([x * TILE, PAD_TOP / 2, z * TILE], [TILE, PAD_TOP, TILE])
        );
      }
    }
  }
  out.push(fromBox([crane[0], 20, crane[1]], [2.4, 40, 2.4], true));
  for (const p of pieces) {
    const b = pieceBox(p);
    out.push(fromBox(b.pos, b.size, p.kind === 'column'));
  }
  return out;
};

const overlapsXZ = (c: Collider, x: number, z: number, r: number) =>
  x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ;

/** The first box that would block a body standing at (x, y, z), if any. */
const blocker = (cs: readonly Collider[], x: number, y: number, z: number) =>
  cs.find(
    (c) =>
      overlapsXZ(c, x, z, RADIUS) && c.maxY > y + STEP && c.minY < y + HEIGHT
  );

/** Highest floor under the body that it can step onto from height y. */
const floorUnder = (
  cs: readonly Collider[],
  x: number,
  y: number,
  z: number
) => {
  let best = 0;
  for (const c of cs)
    if (
      overlapsXZ(c, x, z, RADIUS * 0.6) &&
      c.maxY <= y + STEP &&
      c.maxY > best
    )
      best = c.maxY;
  return best;
};

/** Advance the body by dt seconds. Mutates and returns it. */
export const step = (
  b: Body,
  input: Input,
  cs: readonly Collider[],
  dt: number
): Body => {
  const len = Math.hypot(input.moveX, input.moveZ);
  const mx = len > 1 ? input.moveX / len : input.moveX;
  const mz = len > 1 ? input.moveZ / len : input.moveZ;
  if (len > 0.1) b.heading = Math.atan2(mx, mz);

  // Sideways, one axis at a time so the body slides along walls.
  let climb = false;
  const nx = Math.max(-LIMIT, Math.min(LIMIT, b.x + mx * WALK * dt));
  const hitX = blocker(cs, nx, b.y, b.z);
  if (hitX) climb ||= hitX.climbable;
  else b.x = nx;
  const nz = Math.max(-LIMIT, Math.min(LIMIT, b.z + mz * WALK * dt));
  const hitZ = blocker(cs, b.x, b.y, nz);
  if (hitZ) climb ||= hitZ.climbable;
  else b.z = nz;

  // Pushing into a column climbs it; let go to drop back down.
  b.climbing = climb && len > 0.1;
  if (b.climbing) {
    b.vy = 0;
    b.y += CLIMB * dt;
    b.grounded = false;
    return b;
  }

  if (input.jump && b.grounded) b.vy = JUMP;
  b.vy -= GRAVITY * dt;
  const floor = floorUnder(cs, b.x, b.y, b.z);
  // Never fall through a ceiling: stop rising under a box overhead.
  const nextY = b.y + b.vy * dt;
  if (b.vy > 0 && blocker(cs, b.x, nextY, b.z)) b.vy = 0;
  else b.y = nextY;
  if (b.y <= floor) {
    b.y = floor;
    b.vy = 0;
    b.grounded = true;
  } else {
    b.grounded = false;
  }
  return b;
};

/** Which storey the body is on, from its feet height. */
export const storeyOf = (y: number): number =>
  Math.max(0, Math.floor((y - PAD_TOP + 0.6) / STOREY));
