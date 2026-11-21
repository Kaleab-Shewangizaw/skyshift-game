import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {
  CITY_RADIUS,
  FACADE_COLORS,
  TILE,
  baseTile,
  groundAt,
  isLotTile,
  isPad,
  isRoadLine,
  tileAt,
  tileFromWorld,
  type Tile,
} from '../../shared/city';
import { makeRng } from '../../shared/rng';
import { PAD_TOP } from './layout';
import { QUALITY } from './quality';
import type { SiteWork } from '../../shared/rules';
import {
  dirtTexture,
  facadeTexture,
  nightWindowsTexture,
  padTexture,
  roadTexture,
} from './textures';

/** Buildings leave a sidewalk margin inside their tile. */
const BUILDING_FOOTPRINT = TILE - 2.6;
const CITY_EXTENT = (CITY_RADIUS + 0.5) * TILE;

const ROOF = new THREE.MeshStandardMaterial({
  color: '#8a8580',
  roughness: 0.9,
});

/** Box whose facade UVs repeat once per 4 m wide × 3.5 m tall window cell. */
const facadeBox = (w: number, h: number, d: number): THREE.BoxGeometry => {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv');
  // Groups: +x, -x, +y, -y, +z, -z (4 vertices each).
  const scale = [
    [d / 4, h / 3.5],
    [d / 4, h / 3.5],
    [1, 1],
    [1, 1],
    [w / 4, h / 3.5],
    [w / 4, h / 3.5],
  ];
  for (let face = 0; face < 6; face++) {
    const [su = 1, sv = 1] = scale[face] ?? [];
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
  }
  uv.needsUpdate = true;
  return g;
};

/** Facade materials are shared per color so the whole city costs few materials. */
const useFacadeMaterials = (night: boolean) => {
  const facade = useMemo(() => facadeTexture(), []);
  const lit = useMemo(() => {
    const t = nightWindowsTexture(2026);
    t.repeat.set(1 / 8, 1 / 8);
    return t;
  }, []);
  return useMemo(() => {
    // Built up front for the city's fixed palette; nothing is created during render.
    const make = (color: string): THREE.Material[] => {
      const side = new THREE.MeshStandardMaterial({
        map: facade,
        color,
        roughness: 0.85,
      });
      if (night) {
        side.emissiveMap = lit;
        side.emissive = new THREE.Color('#ffffff');
        side.emissiveIntensity = 1.1;
      }
      return [side, side, ROOF, ROOF, side, side];
    };
    const byColor = new Map(FACADE_COLORS.map((c) => [c, make(c)]));
    const fallback = make('#dddddd');
    return (color: string) => byColor.get(color) ?? fallback;
  }, [facade, lit, night]);
};

const BuildingMesh = ({
  t,
  materials,
  detail,
}: {
  t: Tile;
  materials: THREE.Material[];
  detail: boolean;
}) => {
  const geometry = useMemo(
    () => facadeBox(BUILDING_FOOTPRINT, t.height, BUILDING_FOOTPRINT),
    [t.height]
  );
  return (
    <group>
      <mesh
        geometry={geometry}
        material={materials}
        position={[0, t.height / 2, 0]}
        castShadow={detail}
        receiveShadow
      />
      {/* roof slab with a low parapet all round */}
      <mesh position={[0, t.height + 0.12, 0]} material={ROOF} receiveShadow>
        <boxGeometry args={[BUILDING_FOOTPRINT, 0.24, BUILDING_FOOTPRINT]} />
      </mesh>
      {PARAPETS.map((q) => (
        <mesh
          key={q.key}
          // Sits on top of the roof slab (no overlap, so no flickering edge).
          position={[q.x, t.height + 0.24 + 0.3, q.z]}
          material={PARAPET}
          castShadow={detail}
        >
          <boxGeometry args={q.size} />
        </mesh>
      ))}
      {/* ground-floor shop band in a darker tone */}
      <mesh position={[0, 1.6, 0]} material={SHOPFRONT}>
        <boxGeometry
          args={[BUILDING_FOOTPRINT + 0.06, 3.2, BUILDING_FOOTPRINT + 0.06]}
        />
      </mesh>
      {detail && <RoofKit seed={t.seed} top={t.height} />}
    </group>
  );
};

const PARAPET = new THREE.MeshStandardMaterial({
  color: '#9b968f',
  roughness: 0.85,
});
const SHOPFRONT = new THREE.MeshStandardMaterial({
  color: '#3a4350',
  metalness: 0.3,
  roughness: 0.35,
});
const P = BUILDING_FOOTPRINT / 2 - 0.12;
const PARAPETS: {
  key: string;
  x: number;
  z: number;
  size: [number, number, number];
}[] = [
  { key: 'n', x: 0, z: -P, size: [BUILDING_FOOTPRINT, 0.6, 0.24] },
  { key: 's', x: 0, z: P, size: [BUILDING_FOOTPRINT, 0.6, 0.24] },
  { key: 'w', x: -P, z: 0, size: [0.24, 0.6, BUILDING_FOOTPRINT - 0.48] },
  { key: 'e', x: P, z: 0, size: [0.24, 0.6, BUILDING_FOOTPRINT - 0.48] },
];
const STEEL_GREY = new THREE.MeshStandardMaterial({
  color: '#b8bcc2',
  metalness: 0.6,
  roughness: 0.35,
});
const TANK_WOOD = new THREE.MeshStandardMaterial({
  color: '#8a5a3c',
  roughness: 0.8,
});

/** Rooftop clutter: an AC unit or two, and sometimes a water tank on legs. */
const RoofKit = ({ seed, top }: { seed: number; top: number }) => {
  const rng = makeRng(seed ^ 0xa11);
  const units = 1 + Math.floor(rng() * 2);
  const tank = rng() < 0.45;
  const spots: [number, number][] = [
    [-2, -2],
    [2, 1.5],
    [-1.5, 2.2],
  ];
  return (
    <group position={[0, top + 0.24, 0]}>
      {spots.slice(0, units).map(([x, z]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <mesh position={[0, 0.45, 0]} material={STEEL_GREY} castShadow>
            <boxGeometry args={[1.6, 0.9, 1.1]} />
          </mesh>
          <mesh position={[0, 0.92, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.38, 16]} />
            <meshStandardMaterial color="#5b6068" />
          </mesh>
        </group>
      ))}
      {tank && (
        <group position={[2.2, 0, -2.2]}>
          {[-0.5, 0.5].map((x) =>
            [-0.5, 0.5].map((z) => (
              <mesh
                key={`${x}${z}`}
                position={[x, 0.6, z]}
                material={STEEL_GREY}
              >
                <boxGeometry args={[0.08, 1.2, 0.08]} />
              </mesh>
            ))
          )}
          <mesh position={[0, 1.85, 0]} material={TANK_WOOD} castShadow>
            <cylinderGeometry args={[0.85, 0.85, 1.4, 16]} />
          </mesh>
          <mesh position={[0, 2.75, 0]} material={TANK_WOOD} castShadow>
            <coneGeometry args={[0.92, 0.45, 16]} />
          </mesh>
        </group>
      )}
    </group>
  );
};

/** Road materials: dashed (center line along U) and plain for intersections. */
const useRoadMaterials = () =>
  useMemo(() => {
    const t = roadTexture();
    t.repeat.set(TILE / 8, 1);
    t.needsUpdate = true;
    return {
      dashed: new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }),
      plain: new THREE.MeshStandardMaterial({
        color: '#4a4d55',
        roughness: 0.95,
      }),
    };
  }, []);

const ZEBRA = new THREE.MeshStandardMaterial({
  color: '#f4f1ea',
  roughness: 1,
});

const RoadTile = ({
  t,
  mats,
}: {
  t: Tile;
  mats: ReturnType<typeof useRoadMaterials>;
}) => {
  const cross = isRoadLine(t.x) && isRoadLine(t.z);
  // A road on an x-line runs north-south (along z).
  const alongZ = isRoadLine(t.x) && !cross;
  return (
    <group>
      <mesh
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, alongZ ? Math.PI / 2 : 0]}
        material={cross ? mats.plain : mats.dashed}
        receiveShadow
      >
        <planeGeometry args={[TILE, TILE]} />
      </mesh>
      {cross &&
        [-1, 1].map((s) =>
          Array.from({ length: 5 }, (_, k) => (
            <mesh
              key={`${s},${k}`}
              position={[s * 4.6, 0.03, -4 + k * 2]}
              rotation={[-Math.PI / 2, 0, 0]}
              material={ZEBRA}
            >
              <planeGeometry args={[2.2, 0.9]} />
            </mesh>
          ))
        )}
    </group>
  );
};

const ParkTile = () => (
  <group>
    <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[TILE - 1.6, TILE - 1.6]} />
      <meshStandardMaterial color="#7fb069" roughness={1} />
    </mesh>
    <mesh position={[0, 0.45, 2.5]} castShadow>
      <boxGeometry args={[2.4, 0.15, 0.7]} />
      <meshStandardMaterial color="#a0673a" />
    </mesh>
  </group>
);

/** Instanced trees and lamps along every street that still exists. */
const StreetFurniture = ({
  site,
  night,
}: {
  site: readonly string[];
  night: boolean;
}) => {
  const spots = useMemo(() => {
    const trees: [number, number][] = [];
    const lamps: [number, number][] = [];
    const rng = makeRng(42);
    for (let x = -CITY_RADIUS; x <= CITY_RADIUS; x++) {
      for (let z = -CITY_RADIUS; z <= CITY_RADIUS; z++) {
        const t = tileAt(site, x, z);
        if (t.kind === 'road' || t.kind === 'lot') continue;
        const cx = x * TILE;
        const cz = z * TILE;
        const edge = TILE / 2 - 0.9;
        if (t.kind === 'park')
          trees.push([cx - 3, cz - 2], [cx + 3.2, cz - 1], [cx - 1, cz + 3.5]);
        const faces: [number, number, number, number][] = [
          [1, 0, edge, 0],
          [-1, 0, -edge, 0],
          [0, 1, 0, edge],
          [0, -1, 0, -edge],
        ];
        for (const [dx, dz, ox, oz] of faces) {
          if (tileAt(site, x + dx, z + dz).kind !== 'road') continue;
          // Along the edge: maybe a lamp in the middle, trees toward the corners.
          const px = cx + ox;
          const pz = cz + oz;
          const sx = dz !== 0 ? 1 : 0;
          const sz = dx !== 0 ? 1 : 0;
          if (rng() < 0.5) lamps.push([px, pz]);
          trees.push(
            [px + sx * 3.6, pz + sz * 3.6],
            [px - sx * 3.6, pz - sz * 3.6]
          );
        }
      }
    }
    return { trees, lamps };
  }, [site]);

  const trunk = useRef<THREE.InstancedMesh>(null);
  const crown = useRef<THREE.InstancedMesh>(null);
  const pole = useRef<THREE.InstancedMesh>(null);
  const bulb = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const rng = makeRng(7);
    spots.trees.forEach(([x, z], i) => {
      const s = 0.7 + rng() * 0.45;
      trunk.current?.setMatrixAt(
        i,
        m.compose(
          new THREE.Vector3(x, 1.2 * s, z),
          new THREE.Quaternion(),
          new THREE.Vector3(s, s, s)
        )
      );
      crown.current?.setMatrixAt(
        i,
        m.compose(
          new THREE.Vector3(x, 3.6 * s, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * 3, 0)),
          new THREE.Vector3(s, s, s)
        )
      );
    });
    spots.lamps.forEach(([x, z], i) => {
      pole.current?.setMatrixAt(i, m.makeTranslation(x, 2.5, z));
      bulb.current?.setMatrixAt(i, m.makeTranslation(x, 5.1, z));
    });
    for (const r of [trunk, crown, pole, bulb])
      if (r.current) r.current.instanceMatrix.needsUpdate = true;
  }, [spots]);

  // Instance counts are fixed at creation, so the keys remount them when counts change.
  return (
    <group>
      <instancedMesh
        key={`t${spots.trees.length}`}
        ref={trunk}
        args={[undefined, undefined, spots.trees.length]}
        castShadow
      >
        <cylinderGeometry args={[0.25, 0.35, 2.4, 6]} />
        <meshStandardMaterial color="#7a5232" />
      </instancedMesh>
      <instancedMesh
        key={`c${spots.trees.length}`}
        ref={crown}
        args={[undefined, undefined, spots.trees.length]}
        castShadow
      >
        <icosahedronGeometry args={[2, 0]} />
        <meshStandardMaterial color="#5fae5a" flatShading />
      </instancedMesh>
      <instancedMesh
        key={`p${spots.lamps.length}`}
        ref={pole}
        args={[undefined, undefined, spots.lamps.length]}
        castShadow
      >
        <cylinderGeometry args={[0.12, 0.16, 5, 6]} />
        <meshStandardMaterial color="#4a4f57" />
      </instancedMesh>
      <instancedMesh
        key={`b${spots.lamps.length}`}
        ref={bulb}
        args={[undefined, undefined, spots.lamps.length]}
      >
        <sphereGeometry args={[0.35, 8, 6]} />
        <meshStandardMaterial
          color="#fff6d0"
          emissive="#ffd27a"
          emissiveIntensity={night ? 2.5 : 0.2}
        />
      </instancedMesh>
    </group>
  );
};

const CAR_COLORS = [
  '#e8574b',
  '#4fa8ff',
  '#ffc93c',
  '#ffffff',
  '#4cd964',
  '#3b3f4a',
  '#ff8a3d',
  '#b18cff',
];

/** Cars looping the ring road around the starting block. They vanish where the road was demolished. */
const Traffic = ({
  site,
  night,
}: {
  site: readonly string[];
  night: boolean;
}) => {
  const refs = useRef<(THREE.Group | null)[]>([]);
  const half = 2 * TILE;
  const cars = useMemo(
    () =>
      CAR_COLORS.slice(0, QUALITY.cars).map((color, i) => ({
        color,
        offset: (i / CAR_COLORS.length) * half * 8,
        speed: 7 + (i % 3) * 1.5,
        lane: i % 2,
      })),
    [half]
  );

  useFrame(({ clock }) => {
    cars.forEach((car, i) => {
      const g = refs.current[i];
      if (!g) return;
      // Inner lane runs clockwise, outer lane counter-clockwise.
      const dir = car.lane === 0 ? 1 : -1;
      const r = half + (car.lane === 0 ? -2.6 : 2.6);
      const side = r * 2;
      const loop = side * 4;
      const t =
        (((car.offset + dir * clock.elapsedTime * car.speed) % loop) + loop) %
        loop;
      const seg = Math.floor(t / side);
      const u = t - seg * side;
      const legs: [number, number, number][] = [
        [-r + u, -r, 0],
        [r, -r + u, -Math.PI / 2],
        [r - u, r, Math.PI],
        [-r, r - u, Math.PI / 2],
      ];
      const [x, z, heading] = legs[seg] ?? legs[0] ?? [0, 0, 0];
      g.position.set(x, 0, z);
      g.rotation.y = heading + (dir < 0 ? Math.PI : 0);
      const at = tileFromWorld(x, z);
      g.visible = tileAt(site, at.x, at.z).kind === 'road';
    });
  });

  return (
    <group>
      {cars.map((car, i) => (
        <group
          key={car.color}
          ref={(el) => {
            refs.current[i] = el;
          }}
        >
          <Car color={car.color} style={i % 3} night={night} />
        </group>
      ))}
    </group>
  );
};

// ---------- Cars ----------

type CarStyle = {
  len: number;
  h: number;
  cabin: number;
  cabinH: number;
  back: number;
};
/** Hatchback, sedan, van. */
const CAR_STYLES: CarStyle[] = [
  { len: 3.8, h: 0.7, cabin: 2.0, cabinH: 0.72, back: -0.35 },
  { len: 4.4, h: 0.62, cabin: 2.1, cabinH: 0.66, back: -0.15 },
  { len: 4.6, h: 1.0, cabin: 3.3, cabinH: 0.85, back: -0.45 },
];

const carGeometries = CAR_STYLES.map((st) => ({
  body: new RoundedBoxGeometry(st.len, st.h, 1.9, 3, 0.22),
  cabin: new RoundedBoxGeometry(st.cabin, st.cabinH, 1.72, 3, 0.2),
  bumper: new RoundedBoxGeometry(0.22, 0.28, 1.95, 2, 0.08),
}));
const WHEEL = new THREE.CylinderGeometry(0.4, 0.4, 0.28, 18);
const RIM = new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12);
const LAMP = new THREE.BoxGeometry(0.06, 0.16, 0.38);
const MIRROR = new THREE.BoxGeometry(0.16, 0.12, 0.08);
const GLASS = new THREE.MeshStandardMaterial({
  color: '#1d2a38',
  metalness: 0.6,
  roughness: 0.08,
});
const TIRE = new THREE.MeshStandardMaterial({
  color: '#1b1b1d',
  roughness: 0.9,
});
const CHROME = new THREE.MeshStandardMaterial({
  color: '#d8dde3',
  metalness: 0.9,
  roughness: 0.25,
});
const TRIM = new THREE.MeshStandardMaterial({
  color: '#2a2c31',
  roughness: 0.6,
});

/** A little rounded car: painted body, dark glass cabin, wheels with rims, lights. */
const Car = ({
  color,
  style,
  night,
}: {
  color: string;
  style: number;
  night: boolean;
}) => {
  const st = CAR_STYLES[style] ?? CAR_STYLES[0];
  const g = carGeometries[style] ?? carGeometries[0];
  const paint = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        metalness: 0.35,
        roughness: 0.32,
      }),
    [color]
  );
  if (!st || !g) return null;
  const bodyY = 0.42 + st.h / 2;
  const roofY = 0.42 + st.h + st.cabinH / 2 - 0.08;
  const front = st.len / 2;
  return (
    <group>
      <mesh
        geometry={g.body}
        material={paint}
        position={[0, bodyY, 0]}
        castShadow
      />
      <mesh
        geometry={g.cabin}
        material={GLASS}
        position={[st.back, roofY, 0]}
        castShadow
      />
      {/* roof panel in body color over the glass */}
      <mesh
        position={[st.back, roofY + st.cabinH / 2 - 0.04, 0]}
        material={paint}
      >
        <boxGeometry args={[st.cabin - 0.3, 0.08, 1.6]} />
      </mesh>
      {[front, -front].map((x) => (
        <mesh
          key={x}
          geometry={g.bumper}
          material={TRIM}
          position={[x, 0.55, 0]}
        />
      ))}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <group
            key={`${sx}${sz}`}
            position={[sx * (front - 0.8), 0.4, sz * 0.88]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <mesh geometry={WHEEL} material={TIRE} castShadow />
            <mesh geometry={RIM} material={CHROME} />
          </group>
        ))
      )}
      {[-0.6, 0.6].map((z) => (
        <mesh
          key={`h${z}`}
          geometry={LAMP}
          position={[front + 0.01, bodyY + 0.05, z]}
        >
          <meshStandardMaterial
            color="#fff8d0"
            emissive="#fff3b0"
            emissiveIntensity={night ? 3 : 0.4}
          />
        </mesh>
      ))}
      {[-0.65, 0.65].map((z) => (
        <mesh
          key={`t${z}`}
          geometry={LAMP}
          position={[-front - 0.01, bodyY + 0.05, z]}
        >
          <meshStandardMaterial
            color="#c21d1d"
            emissive="#ff2a2a"
            emissiveIntensity={night ? 2 : 0.35}
          />
        </mesh>
      ))}
      {[-1, 1].map((sz) => (
        <mesh
          key={`m${sz}`}
          geometry={MIRROR}
          material={paint}
          position={[
            st.back + st.cabin / 2 - 0.05,
            bodyY + st.h / 2 + 0.05,
            sz * 1.0,
          ]}
        />
      ))}
    </group>
  );
};

const Clouds = ({ wind }: { wind: number }) => {
  const group = useRef<THREE.Group>(null);
  const clouds = useMemo(() => {
    const rng = makeRng(99);
    return Array.from({ length: QUALITY.clouds }, () => ({
      x: (rng() - 0.5) * 300,
      y: 80 + rng() * 30,
      z: (rng() - 0.5) * 300,
      s: 4 + rng() * 5,
      puffs: Array.from({ length: 4 }, () => ({
        px: (rng() - 0.5) * 3,
        py: (rng() - 0.5) * 0.8,
        pz: (rng() - 0.5) * 2,
        r: 0.8 + rng() * 0.6,
      })),
    }));
  }, []);
  useFrame(({ camera }, dt) => {
    const g = group.current;
    if (!g) return;
    for (const c of g.children) {
      c.position.x += dt * (2 + wind * 4);
      if (c.position.x > 160) c.position.x = -160;
      // A pulled-back camera can end up inside a cloud: hide the ones too close.
      c.visible = c.position.distanceTo(camera.position) > 70;
    }
  });
  return (
    <group ref={group}>
      {clouds.map((c, i) => (
        <group key={i} position={[c.x, c.y, c.z]} scale={c.s}>
          {c.puffs.map(({ px, py, pz, r }, k) => (
            <mesh key={k} position={[px, py, pz]}>
              <sphereGeometry args={[r, 10, 8]} />
              <meshStandardMaterial
                color="#ffffff"
                roughness={1}
                emissive="#ffffff"
                emissiveIntensity={0.25}
              />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
};

const FENCE = new THREE.MeshStandardMaterial({
  color: '#ff9f43',
  roughness: 0.7,
  transparent: true,
  opacity: 0.85,
});

/** Dirt or rubble on rough site tiles, pads where it's buildable, and a fence around it all. */
const Site = ({
  site,
  pads,
  pouring,
}: {
  site: readonly string[];
  pads: readonly string[];
  /** A pad being poured right now; its animation draws it instead. */
  pouring: string | null;
}) => {
  const dirt = useMemo(() => {
    const t = dirtTexture();
    t.repeat.set(1.5, 1.5);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 1 });
  }, []);
  const { tiles, rubble, slabs, fences } = useMemo(() => {
    const tiles: [number, number][] = [];
    const rubble: [number, number][] = [];
    const slabs: [number, number][] = [];
    const fences: { x: number; z: number; alongX: boolean }[] = [];
    const h = TILE / 2;
    for (let x = -CITY_RADIUS; x <= CITY_RADIUS; x++) {
      for (let z = -CITY_RADIUS; z <= CITY_RADIUS; z++) {
        if (!isLotTile(site, x, z)) continue;
        if (isPad(pads, x, z)) {
          if (`${x},${z}` !== pouring) slabs.push([x, z]);
        } else {
          tiles.push([x, z]);
          if (groundAt(site, x, z) === 'rubble') rubble.push([x, z]);
        }
        if (!isLotTile(site, x, z - 1))
          fences.push({ x: x * TILE, z: z * TILE - h, alongX: true });
        if (!isLotTile(site, x, z + 1))
          fences.push({ x: x * TILE, z: z * TILE + h, alongX: true });
        if (!isLotTile(site, x - 1, z))
          fences.push({ x: x * TILE - h, z: z * TILE, alongX: false });
        if (!isLotTile(site, x + 1, z))
          fences.push({ x: x * TILE + h, z: z * TILE, alongX: false });
      }
    }
    return { tiles, rubble, slabs, fences };
  }, [site, pads, pouring]);
  return (
    <group>
      {tiles.map(([x, z]) => (
        <mesh
          key={`${x},${z}`}
          position={[x * TILE, 0.04, z * TILE]}
          rotation={[-Math.PI / 2, 0, 0]}
          material={dirt}
          receiveShadow
        >
          <planeGeometry args={[TILE, TILE]} />
        </mesh>
      ))}
      <Rubble key={rubble.length} tiles={rubble} />
      {slabs.map(([x, z]) => (
        <Pad key={`${x},${z}`} x={x} z={z} />
      ))}
      {fences.map((f) => (
        <mesh
          key={`${f.x},${f.z},${f.alongX}`}
          position={[f.x, 1, f.z]}
          material={FENCE}
          castShadow
        >
          <boxGeometry args={f.alongX ? [TILE, 2, 0.2] : [0.2, 2, TILE]} />
        </mesh>
      ))}
    </group>
  );
};

/** Site cabin and material stacks inside the starting block (cleared away once their spot gets a pad). */
const SiteProps = ({ pads }: { pads: readonly string[] }) => (
  <group>
    <group
      position={[-12, 0, 12]}
      rotation={[0, 0.3, 0]}
      visible={!isPad(pads, -1, 1)}
    >
      <mesh position={[0, 1.4, 0]} castShadow receiveShadow>
        <boxGeometry args={[6, 2.8, 2.6]} />
        <meshStandardMaterial color="#3d7ea6" />
      </mesh>
      <mesh position={[0.8, 1.7, 1.31]}>
        <boxGeometry args={[1.6, 0.9, 0.05]} />
        <meshStandardMaterial
          color="#d6f0ff"
          emissive="#bfe3ff"
          emissiveIntensity={0.3}
        />
      </mesh>
    </group>
    <group position={[12, 0, 12]} visible={!isPad(pads, 1, 1)}>
      {[0, 1, 2].map((r) =>
        [0, 1].map((c) => (
          <mesh
            key={`b${r}${c}`}
            position={[c * 1.3 - 0.65, 0.35 + r * 0.6, 0]}
            castShadow
          >
            <boxGeometry args={[1.2, 0.55, 1.2]} />
            <meshStandardMaterial color="#c8644a" />
          </mesh>
        ))
      )}
      {[0, 1, 2, 3].map((r) => (
        <mesh key={`s${r}`} position={[0, 0.2 + r * 0.32, -3]} castShadow>
          <boxGeometry args={[6, 0.3, 0.45]} />
          <meshStandardMaterial
            color="#8fa3b3"
            metalness={0.5}
            roughness={0.45}
          />
        </mesh>
      ))}
      <mesh position={[-3, 0.5, -1.4]} castShadow>
        <boxGeometry args={[1.4, 1, 1.4]} />
        <meshStandardMaterial color="#b5ab9c" />
      </mesh>
    </group>
  </group>
);

// ---------- Ground: rubble and pads ----------

const RUBBLE_PER_TILE = 18;
const RUBBLE_COLORS = ['#9c968c', '#b0663f', '#7d7870', '#c4b8a4', '#8a5a3c'];

type Chunk = {
  x: number;
  z: number;
  y: number;
  sx: number;
  sy: number;
  sz: number;
  rot: number;
  tilt: number;
  color: string;
};

/** Broken concrete and brick left where something was demolished. Deterministic per tile. */
const rubbleChunks = (x: number, z: number): Chunk[] => {
  const rng = makeRng(baseTile(x, z).seed ^ 0x5eed);
  return Array.from({ length: RUBBLE_PER_TILE }, () => {
    // Heaped toward the middle of the tile.
    const r = Math.sqrt(rng()) * (TILE / 2 - 1.4);
    const a = rng() * Math.PI * 2;
    const size = 0.5 + rng() * 1.3;
    return {
      x: x * TILE + Math.cos(a) * r,
      z: z * TILE + Math.sin(a) * r,
      y: size * 0.3,
      sx: size,
      sy: size * (0.4 + rng() * 0.5),
      sz: size * (0.6 + rng() * 0.6),
      rot: rng() * Math.PI,
      tilt: (rng() - 0.5) * 0.6,
      color: RUBBLE_COLORS[Math.floor(rng() * RUBBLE_COLORS.length)] ?? '#999',
    };
  });
};

const chunkMatrix = (c: Chunk, m: THREE.Matrix4): THREE.Matrix4 =>
  m.compose(
    new THREE.Vector3(c.x, c.y, c.z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(c.tilt, c.rot, 0)),
    new THREE.Vector3(c.sx, c.sy, c.sz)
  );

/** All rubble on the site in one instanced draw call. */
const Rubble = ({ tiles }: { tiles: [number, number][] }) => {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const chunks = useMemo(
    () => tiles.flatMap(([x, z]) => rubbleChunks(x, z)),
    [tiles]
  );
  useLayoutEffect(() => {
    const el = mesh.current;
    if (!el) return;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    chunks.forEach((c, i) => {
      el.setMatrixAt(i, chunkMatrix(c, m));
      el.setColorAt(i, color.set(c.color));
    });
    el.instanceMatrix.needsUpdate = true;
    if (el.instanceColor) el.instanceColor.needsUpdate = true;
  }, [chunks]);
  if (chunks.length === 0) return null;
  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, chunks.length]}
      castShadow
      receiveShadow
    >
      <dodecahedronGeometry args={[0.6, 0]} />
      <meshStandardMaterial roughness={0.95} flatShading />
    </instancedMesh>
  );
};

/** Pads fill their tile, so neighboring pads join into one level floor. */
const PAD_SIZE = TILE;
const PAD_HEIGHT = PAD_TOP;
const padGeometry = new THREE.BoxGeometry(PAD_SIZE, PAD_HEIGHT, PAD_SIZE);
let padMaterial: THREE.MeshStandardMaterial | null = null;
/** Shared concrete material, created on first use (canvas textures need the DOM). */
const getPadMaterial = (): THREE.MeshStandardMaterial => {
  padMaterial ??= new THREE.MeshStandardMaterial({
    map: padTexture(),
    roughness: 0.85,
  });
  return padMaterial;
};

/** A finished foundation pad: buildable ground. */
const Pad = ({ x, z }: { x: number; z: number }) => (
  <group position={[x * TILE, 0, z * TILE]}>
    <mesh
      position={[0, PAD_HEIGHT / 2, 0]}
      geometry={padGeometry}
      material={getPadMaterial()}
      receiveShadow
    />
  </group>
);

/**
 * Pouring a pad: the rubble is hauled off, wet concrete rises and dries,
 * and a ring of light marks the spot as buildable. Ends as a normal pad.
 */
const Pour = ({ x, z, rubble }: { x: number; z: number; rubble: boolean }) => {
  const debris = useRef<THREE.InstancedMesh>(null);
  const slab = useRef<THREE.Mesh>(null);
  const wet = useRef<THREE.MeshStandardMaterial>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const start = useRef<number | null>(null);
  const chunks = useMemo(
    () => (rubble ? rubbleChunks(x, z) : []),
    [x, z, rubble]
  );
  const dry = useMemo(() => new THREE.Color('#ffffff'), []);
  const damp = useMemo(() => new THREE.Color('#6f6a62'), []);

  useLayoutEffect(() => {
    const el = debris.current;
    if (!el) return;
    const color = new THREE.Color();
    chunks.forEach((c, i) => el.setColorAt(i, color.set(c.color)));
    if (el.instanceColor) el.instanceColor.needsUpdate = true;
  }, [chunks]);

  useFrame(({ clock }) => {
    start.current ??= clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    // 0–0.7 s: debris lifts off and shrinks away.
    const el = debris.current;
    if (el) {
      const k = Math.min(1, t / 0.7);
      const m = new THREE.Matrix4();
      chunks.forEach((c, i) => {
        const lifted = {
          ...c,
          y: c.y + k * k * 9,
          sx: c.sx * (1 - k),
          sy: c.sy * (1 - k),
          sz: c.sz * (1 - k),
        };
        el.setMatrixAt(i, chunkMatrix(lifted, m));
      });
      el.instanceMatrix.needsUpdate = true;
      el.visible = k < 1;
    }
    // 0.5–1.3 s: the slab rises; it stays dark and wet, then dries by 2.4 s.
    const rise = THREE.MathUtils.smoothstep(t, 0.5, 1.3);
    if (slab.current) {
      slab.current.scale.y = Math.max(0.001, rise);
      slab.current.position.y = (PAD_HEIGHT * rise) / 2;
    }
    if (wet.current)
      wet.current.color
        .copy(damp)
        .lerp(dry, THREE.MathUtils.smoothstep(t, 1.2, 2.4));
    // 1.3–2.3 s: a ring of light spreads out from the center.
    const r = THREE.MathUtils.clamp((t - 1.3) / 1, 0, 1);
    if (ring.current) {
      ring.current.scale.setScalar(0.2 + r * 1.1);
      ring.current.visible = r > 0 && r < 1;
    }
    if (ringMat.current) ringMat.current.opacity = 0.8 * (1 - r);
  });

  return (
    <group>
      {chunks.length > 0 && (
        <instancedMesh
          ref={debris}
          args={[undefined, undefined, chunks.length]}
          castShadow
        >
          <dodecahedronGeometry args={[0.6, 0]} />
          <meshStandardMaterial roughness={0.95} flatShading />
        </instancedMesh>
      )}
      <group position={[x * TILE, 0, z * TILE]}>
        <mesh ref={slab} geometry={padGeometry} receiveShadow>
          <meshStandardMaterial
            ref={wet}
            map={getPadMaterial().map}
            roughness={0.85}
            color="#6f6a62"
          />
        </mesh>
        <mesh
          ref={ring}
          position={[0, PAD_HEIGHT + 0.1, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          visible={false}
        >
          <ringGeometry args={[PAD_SIZE * 0.42, PAD_SIZE * 0.5, 48]} />
          <meshBasicMaterial
            ref={ringMat}
            color="#7fe3ff"
            transparent
            opacity={0.8}
            depthWrite={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
    </group>
  );
};

// ---------- Site work visuals ----------

const TOOL_COLORS: Record<
  SiteWork,
  { fill: string; edge: string; picked: string }
> = {
  demolish: { fill: '#ffd23f', edge: '#ffb000', picked: '#ff3b30' },
  prepare: { fill: '#38c6ff', edge: '#0a7cff', picked: '#22d36b' },
};

/** Pulsing outline on a tile the current tool can work on. */
const CandidateOutline = ({
  x,
  z,
  tool,
}: {
  x: number;
  z: number;
  tool: SiteWork;
}) => {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const pulse = 0.55 + Math.sin(clock.elapsedTime * 4) * 0.35;
    for (const c of g.current?.children ?? []) {
      if (
        c instanceof THREE.Mesh &&
        c.material instanceof THREE.MeshBasicMaterial
      ) {
        // The fill stays softer than the glowing edges.
        c.material.opacity =
          c.geometry instanceof THREE.PlaneGeometry
            ? pulse * (tool === 'prepare' ? 0.8 : 0.45)
            : pulse;
      }
    }
  });
  const s = TILE - 0.8;
  const bars: {
    pos: [number, number, number];
    size: [number, number, number];
  }[] = [
    { pos: [0, 0, s / 2], size: [s, 1.2, 0.9] },
    { pos: [0, 0, -s / 2], size: [s, 1.2, 0.9] },
    { pos: [s / 2, 0, 0], size: [0.9, 1.2, s] },
    { pos: [-s / 2, 0, 0], size: [0.9, 1.2, s] },
  ];
  return (
    <group ref={g} position={[x * TILE, 0.6, z * TILE]}>
      {/* tinted fill so the whole tile reads as "can be cleared" */}
      <mesh position={[0, -0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[s, s]} />
        <meshBasicMaterial
          color={TOOL_COLORS[tool].fill}
          transparent
          opacity={0.35}
          depthWrite={false}
        />
      </mesh>
      {bars.map((b) => (
        <mesh key={b.pos.join(',')} position={b.pos}>
          <boxGeometry args={b.size} />
          <meshBasicMaterial
            color={TOOL_COLORS[tool].edge}
            transparent
            opacity={0.9}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
};

/** Pulsing volume over the tile the player picked. */
const SelectedMarker = ({ tile, tool }: { tile: Tile; tool: SiteWork }) => {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (mat.current)
      mat.current.opacity = 0.28 + Math.sin(clock.elapsedTime * 6) * 0.12;
  });
  const h = Math.max(1.2, tile.height + 1);
  return (
    <mesh position={[tile.x * TILE, h / 2, tile.z * TILE]}>
      <boxGeometry args={[TILE - 0.4, h, TILE - 0.4]} />
      <meshBasicMaterial
        ref={mat}
        color={TOOL_COLORS[tool].picked}
        transparent
        opacity={0.3}
        depthWrite={false}
      />
    </mesh>
  );
};

/**
 * Collapse animation for a tile that was just demolished: the building
 * shakes, sinks into the ground and throws up a dust cloud.
 */
const Collapse = ({
  tile,
  materials,
}: {
  tile: Tile;
  materials: THREE.Material[];
}) => {
  const body = useRef<THREE.Group>(null);
  const dust = useRef<THREE.Group>(null);
  const start = useRef<number | null>(null);
  const puffs = useMemo(() => {
    const rng = makeRng(tile.seed);
    return Array.from({ length: 14 }, () => ({
      x: (rng() - 0.5) * TILE,
      z: (rng() - 0.5) * TILE,
      r: 1.6 + rng() * 2.2,
      rise: 2 + rng() * Math.max(4, tile.height * 0.4),
    }));
  }, [tile]);

  useFrame(({ clock }) => {
    start.current ??= clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    const k = Math.min(1, t / 1.4);
    if (body.current) {
      body.current.scale.y = Math.max(0.001, 1 - k * k);
      body.current.position.x = Math.sin(t * 60) * 0.25 * (1 - k);
      body.current.visible = k < 1;
    }
    if (dust.current) {
      const d = Math.min(1, t / 2.4);
      dust.current.children.forEach((c, i) => {
        const p = puffs[i];
        if (!p) return;
        c.position.y = p.rise * Math.sqrt(d);
        c.scale.setScalar(p.r * (0.4 + d));
        if (
          c instanceof THREE.Mesh &&
          c.material instanceof THREE.MeshStandardMaterial
        ) {
          c.material.opacity = 0.75 * (1 - d);
        }
      });
      dust.current.visible = d < 1;
    }
  });

  return (
    <group position={[tile.x * TILE, 0, tile.z * TILE]}>
      <group ref={body}>
        {tile.kind === 'building' && (
          <BuildingMesh t={tile} materials={materials} detail={false} />
        )}
        {tile.kind === 'road' && (
          <mesh position={[0, 0.3, 0]}>
            <boxGeometry args={[TILE, 0.6, TILE]} />
            <meshStandardMaterial color="#4a4d55" />
          </mesh>
        )}
      </group>
      <group ref={dust}>
        {puffs.map((p, i) => (
          <mesh key={i} position={[p.x, 0, p.z]}>
            <sphereGeometry args={[1, 10, 8]} />
            <meshStandardMaterial
              color="#d8c8b0"
              roughness={1}
              transparent
              opacity={0.7}
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
};

/** The site work the player just did, to play its animation. */
export type SiteFx = { work: SiteWork; x: number; z: number; key: number };

type CityProps = {
  night: boolean;
  wind: number;
  ground: string;
  site: readonly string[];
  pads: readonly string[];
  /** Site mode: the active tool, tiles it can work on, and the one picked. */
  tool?: SiteWork | undefined;
  candidates?: readonly { x: number; z: number }[] | undefined;
  selected?: Tile | null | undefined;
  fx?: SiteFx | null | undefined;
  /** When set, taps on the city report the tile under the finger. */
  onPickTile?: ((x: number, z: number) => void) | undefined;
};

export const City = ({
  night,
  wind,
  ground,
  site,
  pads,
  tool = 'demolish',
  candidates,
  selected,
  fx,
  onPickTile,
}: CityProps) => {
  const facadeFor = useFacadeMaterials(night);
  const roads = useRoadMaterials();
  const tiles = useMemo(() => {
    const out: Tile[] = [];
    for (let x = -CITY_RADIUS; x <= CITY_RADIUS; x++) {
      for (let z = -CITY_RADIUS; z <= CITY_RADIUS; z++) {
        const t = tileAt(site, x, z);
        if (t.kind !== 'lot') out.push(t);
      }
    }
    return out;
  }, [site]);
  const blastTile = useMemo(
    () => (fx?.work === 'demolish' ? baseTile(fx.x, fx.z) : null),
    [fx]
  );
  // Only animate a pour while that pad still exists (a reset could remove it).
  const pour = fx?.work === 'prepare' && isPad(pads, fx.x, fx.z) ? fx : null;

  const pick = (e: ThreeEvent<MouseEvent>) => {
    if (!onPickTile || e.delta > 8) return; // a drag to orbit, not a tap
    e.stopPropagation();
    const t = tileFromWorld(e.point.x, e.point.z);
    onPickTile(t.x, t.z);
  };

  return (
    <group>
      {/* sidewalks under the whole city, and far ground tinted by the day's theme */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={pick}>
        <planeGeometry args={[CITY_EXTENT * 2, CITY_EXTENT * 2]} />
        <meshStandardMaterial color="#d6cfc2" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[2000, 2000]} />
        <meshStandardMaterial color={ground} roughness={1} />
      </mesh>
      <group onClick={pick}>
        {tiles.map((t) => (
          <group key={`${t.x},${t.z}`} position={[t.x * TILE, 0, t.z * TILE]}>
            {t.kind === 'road' && <RoadTile t={t} mats={roads} />}
            {t.kind === 'park' && <ParkTile />}
            {t.kind === 'building' && (
              <BuildingMesh
                t={t}
                materials={facadeFor(t.color)}
                detail={Math.max(Math.abs(t.x), Math.abs(t.z)) <= 5}
              />
            )}
          </group>
        ))}
      </group>
      <group onClick={pick}>
        <Site
          site={site}
          pads={pads}
          pouring={pour ? `${pour.x},${pour.z}` : null}
        />
      </group>
      {pour && (
        <Pour
          key={pour.key}
          x={pour.x}
          z={pour.z}
          rubble={groundAt(site, pour.x, pour.z) === 'rubble'}
        />
      )}
      <SiteProps pads={pads} />
      <StreetFurniture site={site} night={night} />
      <Traffic site={site} night={night} />
      <Clouds wind={wind} />
      {candidates?.map((t) => (
        <CandidateOutline
          key={`${tool}:${t.x},${t.z}`}
          x={t.x}
          z={t.z}
          tool={tool}
        />
      ))}
      {selected && <SelectedMarker tile={selected} tool={tool} />}
      {fx && blastTile && (
        <Collapse
          key={fx.key}
          tile={blastTile}
          materials={facadeFor(blastTile.color)}
        />
      )}
    </group>
  );
};
