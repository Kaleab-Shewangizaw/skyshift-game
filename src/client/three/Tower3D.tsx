import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import type { Challenge } from '../../shared/challenge';
import { MATERIALS, type DecorId } from '../../shared/content';
import {
  SPIRE_HEIGHT,
  unlocked,
  weakFloors,
  type TowerState,
} from '../../shared/rules';
import { TOWER_D, TOWER_W, placeFloors, type Placed } from './layout';

const SLAB = 0.35;

type Props = {
  tower: TowerState;
  challenge: Challenge;
  focusIndex: number | null;
  ghost: boolean;
  justBuilt: number | null;
  night: boolean;
};

export const Tower3D = ({
  tower,
  challenge,
  focusIndex,
  ghost,
  justBuilt,
  night,
}: Props) => {
  const { placed, top } = useMemo(() => placeFloors(tower), [tower]);
  const weak = useMemo(
    () => new Set(weakFloors(tower, challenge)),
    [tower, challenge]
  );
  const n = tower.floors.length;
  const spire = n > 0 && unlocked(tower.spirit, 'spire');
  const scaffold = n > 0 && unlocked(tower.spirit, 'scaffold');
  const picnic = unlocked(tower.spirit, 'picnic');

  return (
    <group>
      {/* foundation pad */}
      <mesh position={[0, 0.15, 0]} receiveShadow castShadow>
        <boxGeometry args={[TOWER_W + 2, 0.3, TOWER_D + 2]} />
        <meshStandardMaterial color="#9a958d" roughness={0.95} />
      </mesh>

      {placed.map((p) => (
        <FloorMesh
          key={p.i}
          p={p}
          weak={weak.has(p.i)}
          ghost={ghost && p.i === focusIndex}
          focus={!ghost && p.i === focusIndex}
          drop={p.i === justBuilt}
          night={night}
        />
      ))}

      {n > 0 && (
        <Roof
          y={top}
          accent={challenge.theme.accent}
          spire={spire}
          ghost={ghost && focusIndex === n - 1}
        />
      )}
      {scaffold && <Scaffold top={top} />}
      {picnic && <Picnic />}
      <GoalFrame
        height={challenge.targets.height}
        color={challenge.theme.accent}
        reached={top + (spire ? SPIRE_HEIGHT : 0) >= challenge.targets.height}
      />
    </group>
  );
};

const FloorMesh = ({
  p,
  weak,
  ghost,
  focus,
  drop,
  night,
}: {
  p: Placed;
  weak: boolean;
  ghost: boolean;
  focus: boolean;
  drop: boolean;
  night: boolean;
}) => {
  const m = MATERIALS[p.f.material];
  const group = useRef<THREE.Group>(null);
  const wall = useRef<THREE.MeshStandardMaterial>(null);
  const born = useRef<number | null>(null);
  const isGlass = p.f.material === 'glass';
  const wallH = p.h - SLAB;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current && drop) {
      born.current ??= t;
      // Ease the new floor down from above with a little bounce.
      const k = Math.min(1, (t - born.current) / 0.8);
      const ease = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      group.current.position.y = p.y + (1 - ease) * 18;
    }
    if (wall.current) {
      wall.current.emissiveIntensity = focus
        ? 0.25 + Math.sin(t * 5) * 0.15
        : ghost
          ? 0.35
          : 0;
    }
  });

  return (
    <group ref={group} position={[0, p.y, 0]}>
      {/* floor slab */}
      <mesh position={[0, SLAB / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[TOWER_W + 0.6, SLAB, TOWER_D + 0.6]} />
        <meshStandardMaterial
          color="#8d8a84"
          transparent={ghost}
          opacity={ghost ? 0.4 : 1}
        />
      </mesh>
      {/* walls */}
      <mesh
        position={[0, SLAB + wallH / 2, 0]}
        castShadow={!ghost}
        receiveShadow
      >
        <boxGeometry args={[TOWER_W, wallH, TOWER_D]} />
        <meshStandardMaterial
          ref={wall}
          color={m.colors.wall}
          emissive={ghost ? '#ffffff' : '#ffd166'}
          emissiveIntensity={0}
          roughness={isGlass ? 0.1 : 0.85}
          metalness={isGlass || p.f.material === 'steel' ? 0.35 : 0}
          transparent={ghost || isGlass}
          opacity={ghost ? 0.45 : isGlass ? 0.75 : 1}
        />
      </mesh>
      {!ghost && (
        <Windows
          width={TOWER_W}
          depth={TOWER_D}
          y={SLAB + wallH / 2}
          h={wallH}
          glass={isGlass}
          color={m.colors.window}
          trim={m.colors.trim}
          night={night}
        />
      )}
      {!ghost && p.f.braces > 0 && (
        <Braces count={p.f.braces} y={SLAB} h={wallH} />
      )}
      {!ghost &&
        p.f.decor.map((d, k) => (
          <Decor key={d} id={d} slot={k} y={SLAB} h={wallH} night={night} />
        ))}
      {weak && !ghost && <Warning y={SLAB + wallH / 2} />}
    </group>
  );
};

/** Window panes on all four faces. Glass floors get full-height curtain wall mullions instead. */
const Windows = ({
  width,
  depth,
  y,
  h,
  glass,
  color,
  trim,
  night,
}: {
  width: number;
  depth: number;
  y: number;
  h: number;
  glass: boolean;
  color: string;
  trim: string;
  night: boolean;
}) => {
  const faces = useMemo(() => {
    const out: { pos: [number, number, number]; rotY: number; w: number }[] =
      [];
    const along = (len: number, count: number, make: (o: number) => void) => {
      for (let k = 0; k < count; k++)
        make(-len / 2 + (len / count) * (k + 0.5));
    };
    const cx = Math.max(2, Math.round(width / 3));
    const cz = Math.max(2, Math.round(depth / 3));
    along(width, cx, (o) => {
      out.push({ pos: [o, 0, depth / 2 + 0.03], rotY: 0, w: width / cx });
      out.push({
        pos: [o, 0, -depth / 2 - 0.03],
        rotY: Math.PI,
        w: width / cx,
      });
    });
    along(depth, cz, (o) => {
      out.push({
        pos: [width / 2 + 0.03, 0, o],
        rotY: Math.PI / 2,
        w: depth / cz,
      });
      out.push({
        pos: [-width / 2 - 0.03, 0, o],
        rotY: -Math.PI / 2,
        w: depth / cz,
      });
    });
    return out;
  }, [width, depth]);

  if (glass) {
    return (
      <group position={[0, y, 0]}>
        {faces.map((f) => (
          <mesh
            key={`${f.pos[0]},${f.pos[2]}`}
            position={f.pos}
            rotation={[0, f.rotY, 0]}
          >
            <planeGeometry args={[0.12, h]} />
            <meshStandardMaterial color={trim} />
          </mesh>
        ))}
      </group>
    );
  }
  const pw = Math.min(1.6, h * 0.45);
  const ph = h * 0.5;
  return (
    <group position={[0, y, 0]}>
      {faces.map((f, k) => (
        <group
          key={`${f.pos[0]},${f.pos[2]}`}
          position={f.pos}
          rotation={[0, f.rotY, 0]}
        >
          <mesh>
            <planeGeometry args={[pw + 0.3, ph + 0.3]} />
            <meshStandardMaterial color={trim} />
          </mesh>
          <mesh position={[0, 0, 0.01]}>
            <planeGeometry args={[pw, ph]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={night ? (k % 3 === 0 ? 0.2 : 1.4) : 0.1}
              roughness={0.2}
              metalness={0.1}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
};

/** Diagonal steel braces on the long faces: 1 = one diagonal, 2 = an X, 3 = X plus a belt. */
const Braces = ({ count, y, h }: { count: number; y: number; h: number }) => {
  const len = Math.hypot(TOWER_W, h);
  const angle = Math.atan2(h, TOWER_W);
  return (
    <group position={[0, y + h / 2, 0]}>
      {[TOWER_D / 2 + 0.15, -TOWER_D / 2 - 0.15].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh rotation={[0, 0, angle]} castShadow>
            <boxGeometry args={[len, 0.3, 0.2]} />
            <meshStandardMaterial color="#6b4a2e" />
          </mesh>
          {count >= 2 && (
            <mesh rotation={[0, 0, -angle]} castShadow>
              <boxGeometry args={[len, 0.3, 0.2]} />
              <meshStandardMaterial color="#6b4a2e" />
            </mesh>
          )}
          {count >= 3 && (
            <mesh castShadow>
              <boxGeometry args={[TOWER_W + 0.4, 0.45, 0.25]} />
              <meshStandardMaterial color="#6b4a2e" />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
};

const PETALS = ['#ff6b8b', '#ffd166', '#c77dff'];

const Decor = ({
  id,
  slot,
  y,
  h,
  night,
}: {
  id: DecorId;
  slot: number;
  y: number;
  h: number;
  night: boolean;
}) => {
  const front = TOWER_D / 2 + 0.4;
  const sideX = slot === 0 ? -TOWER_W / 2 - 0.5 : TOWER_W / 2 + 0.5;
  switch (id) {
    case 'flowerbox':
      return (
        <group position={[0, y + 0.4, front]}>
          <mesh castShadow>
            <boxGeometry args={[TOWER_W - 2, 0.5, 0.7]} />
            <meshStandardMaterial color="#7a4b2a" />
          </mesh>
          {Array.from({ length: 12 }, (_, k) => (
            <mesh
              key={k}
              position={[
                -TOWER_W / 2 + 1.5 + k * ((TOWER_W - 3) / 11),
                0.45,
                0,
              ]}
            >
              <sphereGeometry args={[0.28, 8, 6]} />
              <meshStandardMaterial color={PETALS[k % 3] ?? '#ff6b8b'} />
            </mesh>
          ))}
        </group>
      );
    case 'lights':
      return (
        <group position={[0, y + h - 0.3, front - 0.2]}>
          {Array.from({ length: 14 }, (_, k) => {
            const x = -TOWER_W / 2 + 0.5 + k * ((TOWER_W - 1) / 13);
            const sag = Math.sin((Math.PI * k) / 13) * 0.6;
            return (
              <mesh key={k} position={[x, -sag, 0]}>
                <sphereGeometry args={[0.17, 8, 6]} />
                <meshStandardMaterial
                  color="#ffe066"
                  emissive="#ffd23f"
                  emissiveIntensity={night ? 3 : 1}
                />
              </mesh>
            );
          })}
        </group>
      );
    case 'flag':
      return (
        <group position={[0, y + h - 0.4, front - 0.2]}>
          {Array.from({ length: 9 }, (_, k) => (
            <mesh
              key={k}
              position={[
                -TOWER_W / 2 + 1 + k * ((TOWER_W - 2) / 8),
                -Math.sin((Math.PI * k) / 8) * 0.5,
                0,
              ]}
              rotation={[0, 0, Math.PI]}
            >
              <coneGeometry args={[0.35, 0.8, 3]} />
              <meshStandardMaterial
                color={
                  ['#e8574b', '#2a9d8f', '#ffd166', '#5c7cfa'][k % 4] ??
                  '#e8574b'
                }
                side={THREE.DoubleSide}
              />
            </mesh>
          ))}
        </group>
      );
    case 'awning':
      return (
        <group
          position={[0, y + h * 0.75, front + 0.3]}
          rotation={[0.45, 0, 0]}
        >
          {Array.from({ length: 6 }, (_, k) => (
            <mesh key={k} position={[-2.5 + k, 0, 0]} castShadow>
              <boxGeometry args={[1, 0.08, 1.6]} />
              <meshStandardMaterial color={k % 2 ? '#ffffff' : '#e8574b'} />
            </mesh>
          ))}
        </group>
      );
    case 'mural':
      return (
        <mesh
          position={[
            slot === 0 ? -TOWER_W / 4 : TOWER_W / 4,
            y + h / 2,
            TOWER_D / 2 + 0.05,
          ]}
        >
          <circleGeometry args={[Math.min(1.4, h / 2 - 0.2), 24]} />
          <meshStandardMaterial
            color="#ffd166"
            emissive="#e76f51"
            emissiveIntensity={0.15}
          />
        </mesh>
      );
    case 'birdhouse':
      return (
        <group position={[sideX, y + h / 2, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.8, 0.9, 0.8]} />
            <meshStandardMaterial color="#e9c46a" />
          </mesh>
          <mesh
            position={[0, 0.7, 0]}
            rotation={[0, Math.PI / 4, 0]}
            castShadow
          >
            <coneGeometry args={[0.75, 0.6, 4]} />
            <meshStandardMaterial color="#c0392b" />
          </mesh>
        </group>
      );
    case 'solar':
      return (
        <mesh
          position={[sideX, y + h - 0.3, 0]}
          rotation={[0, 0, slot === 0 ? 0.6 : -0.6]}
          castShadow
        >
          <boxGeometry args={[1.6, 0.1, 3]} />
          <meshStandardMaterial
            color="#2d4f8a"
            metalness={0.6}
            roughness={0.25}
          />
        </mesh>
      );
    case 'lantern':
      return (
        <Swing position={[sideX, y + h - 0.6, TOWER_D / 4]}>
          <mesh position={[0, -0.6, 0]}>
            <sphereGeometry args={[0.45, 12, 10]} />
            <meshStandardMaterial
              color="#e63946"
              emissive="#ff6b4a"
              emissiveIntensity={night ? 2 : 0.5}
            />
          </mesh>
        </Swing>
      );
  }
};

const Swing = ({
  position,
  children,
}: {
  position: [number, number, number];
  children: ReactNode;
}) => {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (g.current)
      g.current.rotation.z = Math.sin(clock.elapsedTime * 2) * 0.15;
  });
  return (
    <group ref={g} position={position}>
      {children}
    </group>
  );
};

/** Bobbing orange marker next to a floor that needs bracing. */
const Warning = ({ y }: { y: number }) => {
  const g = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.position.y = y + Math.sin(clock.elapsedTime * 3) * 0.3;
    g.current.rotation.y = clock.elapsedTime * 1.5;
  });
  return (
    <group ref={g} position={[TOWER_W / 2 + 1.6, y, TOWER_D / 2]}>
      <mesh>
        <octahedronGeometry args={[0.7, 0]} />
        <meshStandardMaterial
          color="#ffb020"
          emissive="#ff8a00"
          emissiveIntensity={0.6}
        />
      </mesh>
    </group>
  );
};

const Roof = ({
  y,
  accent,
  spire,
  ghost,
}: {
  y: number;
  accent: string;
  spire: boolean;
  ghost: boolean;
}) => {
  const flag = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (flag.current)
      flag.current.rotation.y = Math.sin(clock.elapsedTime * 2.2) * 0.35;
  });
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[TOWER_W + 0.8, 0.5, TOWER_D + 0.8]} />
        <meshStandardMaterial
          color="#5d5a55"
          transparent={ghost}
          opacity={ghost ? 0.5 : 1}
        />
      </mesh>
      {spire ? (
        <group>
          <mesh position={[0, 0.5 + SPIRE_HEIGHT / 2, 0]} castShadow>
            <coneGeometry args={[2.2, SPIRE_HEIGHT, 8]} />
            <meshStandardMaterial
              color="#ffc93c"
              metalness={0.7}
              roughness={0.25}
              emissive="#ffb000"
              emissiveIntensity={0.2}
            />
          </mesh>
          <mesh position={[0, 0.8 + SPIRE_HEIGHT, 0]}>
            <sphereGeometry args={[0.45, 12, 10]} />
            <meshStandardMaterial
              color="#fff4b0"
              emissive="#ffe066"
              emissiveIntensity={1.5}
            />
          </mesh>
        </group>
      ) : (
        <group position={[TOWER_W / 2 - 1.5, 0.5, -TOWER_D / 2 + 1.5]}>
          <mesh position={[0, 2.5, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 5, 6]} />
            <meshStandardMaterial color="#5d5a55" />
          </mesh>
          <group ref={flag} position={[0, 4.4, 0]}>
            <mesh position={[0, 0, 0.9]}>
              <boxGeometry args={[0.05, 1, 1.8]} />
              <meshStandardMaterial color={accent} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </group>
      )}
    </group>
  );
};

/** Crew perk: yellow scaffolding poles and walk boards around the building. */
const Scaffold = ({ top }: { top: number }) => {
  const posts: [number, number][] = [];
  for (const x of [-TOWER_W / 2 - 1, 0, TOWER_W / 2 + 1]) {
    posts.push([x, TOWER_D / 2 + 1], [x, -TOWER_D / 2 - 1]);
  }
  const boards: number[] = [];
  for (let y = 3; y < top; y += 3) boards.push(y);
  return (
    <group>
      {posts.map(([x, z]) => (
        <mesh key={`${x},${z}`} position={[x, top / 2, z]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, top, 6]} />
          <meshStandardMaterial color="#e8a92c" />
        </mesh>
      ))}
      {boards.map((y) =>
        [TOWER_D / 2 + 1, -TOWER_D / 2 - 1].map((z) => (
          <mesh key={`${y},${z}`} position={[0, y, z]} castShadow>
            <boxGeometry args={[TOWER_W + 2.2, 0.12, 0.8]} />
            <meshStandardMaterial color="#c18b52" />
          </mesh>
        ))
      )}
    </group>
  );
};

/** Crew perk: a picnic blanket and basket on the lot. */
const Picnic = () => (
  <group position={[-9, 0.06, -9]}>
    <mesh rotation={[-Math.PI / 2, 0, 0.3]} receiveShadow>
      <planeGeometry args={[4, 3]} />
      <meshStandardMaterial color="#e8574b" />
    </mesh>
    <mesh position={[0.6, 0.4, 0.2]} castShadow>
      <boxGeometry args={[1, 0.7, 0.7]} />
      <meshStandardMaterial color="#c18b52" />
    </mesh>
  </group>
);

/** A glowing outline at the goal height so players see how far is left. */
const GoalFrame = ({
  height,
  color,
  reached,
}: {
  height: number;
  color: string;
  reached: boolean;
}) => {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const opacity = reached
      ? 0.25
      : 0.55 + Math.sin(clock.elapsedTime * 2.5) * 0.25;
    for (const child of group.current?.children ?? []) {
      if (
        child instanceof THREE.Mesh &&
        child.material instanceof THREE.MeshBasicMaterial
      ) {
        child.material.opacity = opacity;
      }
    }
  });
  const w = TOWER_W + 3;
  const d = TOWER_D + 3;
  const bars: {
    pos: [number, number, number];
    size: [number, number, number];
  }[] = [
    { pos: [0, 0, d / 2], size: [w, 0.25, 0.25] },
    { pos: [0, 0, -d / 2], size: [w, 0.25, 0.25] },
    { pos: [w / 2, 0, 0], size: [0.25, 0.25, d] },
    { pos: [-w / 2, 0, 0], size: [0.25, 0.25, d] },
  ];
  return (
    <group ref={group} position={[0, height, 0]}>
      {bars.map((b) => (
        <mesh key={b.pos.join(',')} position={b.pos}>
          <boxGeometry args={b.size} />
          <meshBasicMaterial
            color={reached ? '#4cd964' : color}
            transparent
            opacity={0.6}
          />
        </mesh>
      ))}
    </group>
  );
};
