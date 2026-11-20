import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Challenge } from '../../shared/challenge';
import { TILE, siteTiles, type Tile } from '../../shared/city';
import {
  SPIRE_HEIGHT,
  unlocked,
  type SiteWork,
  type TowerState,
} from '../../shared/rules';
import { City, type SiteFx } from './City';
import { Crane } from './Crane';
import { TOWER_D, TOWER_W, placeFloors } from './layout';
import { Tower3D } from './Tower3D';

export type City3DProps = {
  tower: TowerState;
  challenge: Challenge;
  focusIndex: number | null;
  ghost: boolean;
  justBuilt: number | null;
  /** Pixels covered by HUD at the top and panels at the bottom; the tower is framed between them. */
  insetTop: number;
  insetBottom: number;
  /** Site mode: the camera pulls back over the site and taps pick tiles. */
  siteMode: boolean;
  tool: SiteWork;
  candidates: readonly { x: number; z: number }[];
  selected: Tile | null;
  fx: SiteFx | null;
  onPickTile: (x: number, z: number) => void;
};

const FOV = 38;
const CRANE_POS: [number, number] = [TOWER_W / 2 + 5, -TOWER_D / 2 - 3];

export const City3D = (p: City3DProps) => {
  const night = p.challenge.theme.tag === 'night';
  const { top } = useMemo(() => placeFloors(p.tower), [p.tower]);
  const spire = p.tower.floors.length > 0 && unlocked(p.tower.spirit, 'spire');
  const fullTop = top + (spire ? SPIRE_HEIGHT : 0);
  // How far the site (plus one ring of neighbors) reaches from the origin, in meters.
  const siteRadius = useMemo(
    () =>
      (Math.max(
        ...siteTiles(p.tower.site).map((t) =>
          Math.max(Math.abs(t.x), Math.abs(t.z))
        )
      ) +
        1.5) *
      TILE,
    [p.tower.site]
  );
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: FOV, near: 0.5, far: 1500, position: [42, 48, 54] }}
      style={{ touchAction: 'none' }}
    >
      <Sky
        top={p.challenge.theme.sky[0]}
        horizon={p.challenge.theme.sky[1]}
        night={night}
      />
      <Lights night={night} />
      <City
        night={night}
        wind={p.challenge.condition.wind}
        ground={p.challenge.theme.ground}
        site={p.tower.site}
        pads={p.tower.pads}
        tool={p.tool}
        candidates={p.siteMode ? p.candidates : undefined}
        selected={p.siteMode ? p.selected : null}
        fx={p.fx}
        onPickTile={p.siteMode ? p.onPickTile : undefined}
      />
      <Tower3D
        tower={p.tower}
        challenge={p.challenge}
        focusIndex={p.focusIndex}
        ghost={p.ghost}
        justBuilt={p.justBuilt}
        night={night}
      />
      <Crane
        x={CRANE_POS[0]}
        z={CRANE_POS[1]}
        buildingTop={top}
        target={[0, 0]}
        wind={p.challenge.condition.wind}
      />
      <Workers />
      <CameraRig
        height={fullTop}
        insetTop={p.insetTop}
        insetBottom={p.insetBottom}
        siteMode={p.siteMode}
        siteRadius={siteRadius}
      />
    </Canvas>
  );
};

/** Gradient sky dome; fog fades the city into the horizon color. */
const Sky = ({
  top,
  horizon,
  night,
}: {
  top: string;
  horizon: string;
  night: boolean;
}) => {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color(top) },
          horizon: { value: new THREE.Color(horizon) },
        },
        vertexShader: `varying vec3 vPos; void main(){ vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vPos;
          void main(){ float t = clamp(vPos.y * 1.6, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, pow(t, 0.8)), 1.0); }`,
      }),
    [top, horizon]
  );
  return (
    <>
      <color attach="background" args={[horizon]} />
      <fog attach="fog" args={[horizon, night ? 200 : 260, 760]} />
      <mesh material={material} renderOrder={-1}>
        <sphereGeometry args={[900, 32, 16]} />
      </mesh>
    </>
  );
};

const Lights = ({ night }: { night: boolean }) => {
  const sun = useRef<THREE.DirectionalLight>(null);
  useEffect(() => {
    const s = sun.current;
    if (!s) return;
    const cam = s.shadow.camera;
    cam.left = -70;
    cam.right = 70;
    cam.top = 70;
    cam.bottom = -70;
    cam.near = 1;
    cam.far = 260;
    cam.updateProjectionMatrix();
    s.shadow.bias = -0.0004;
    s.shadow.normalBias = 0.04;
  }, []);
  return (
    <>
      <hemisphereLight
        args={[
          night ? '#5b6fb5' : '#dff1ff',
          night ? '#2a2540' : '#c9b48a',
          night ? 0.55 : 1.15,
        ]}
      />
      <directionalLight
        ref={sun}
        position={night ? [-50, 90, 40] : [60, 100, 45]}
        intensity={night ? 0.5 : 2.4}
        color={night ? '#aab8ff' : '#fff1d6'}
        castShadow
        shadow-mapSize={[1536, 1536]}
      />
      {!night && (
        <mesh position={[240, 260, -420]}>
          <sphereGeometry args={[22, 24, 16]} />
          <meshBasicMaterial color="#fff6c8" fog={false} />
        </mesh>
      )}
      {night && (
        <mesh position={[-200, 240, -420]}>
          <sphereGeometry args={[16, 24, 16]} />
          <meshBasicMaterial color="#fff6d5" fog={false} />
        </mesh>
      )}
    </>
  );
};

/** Little site workers strolling around the lot (players will control them later). */
const Workers = () => {
  const crew = useMemo(
    () => [
      {
        color: '#ff8a3d',
        path: [
          [-8, 11],
          [-3, 11],
          [-3, 7],
          [-8, 7],
        ],
        speed: 1.6,
      },
      {
        color: '#4fa8ff',
        path: [
          [9, 6],
          [12, 9],
          [9, 12],
          [6, 9],
        ],
        speed: 1.3,
      },
      {
        color: '#4cd964',
        path: [
          [-11, -4],
          [-11, 4],
          [-9, 4],
          [-9, -4],
        ],
        speed: 1.1,
      },
    ],
    []
  );
  return (
    <group>
      {crew.map((w) => (
        <Worker key={w.color} color={w.color} path={w.path} speed={w.speed} />
      ))}
    </group>
  );
};

const Worker = ({
  color,
  path,
  speed,
}: {
  color: string;
  path: number[][];
  speed: number;
}) => {
  const g = useRef<THREE.Group>(null);
  const legs = useMemo(() => {
    const segs: {
      ax: number;
      az: number;
      bx: number;
      bz: number;
      len: number;
      start: number;
    }[] = [];
    let total = 0;
    for (let i = 0; i < path.length; i++) {
      const a = path[i] ?? [0, 0];
      const b = path[(i + 1) % path.length] ?? a;
      const ax = a[0] ?? 0;
      const az = a[1] ?? 0;
      const bx = b[0] ?? 0;
      const bz = b[1] ?? 0;
      const len = Math.hypot(bx - ax, bz - az);
      segs.push({ ax, az, bx, bz, len, start: total });
      total += len;
    }
    return { segs, total };
  }, [path]);
  useFrame(({ clock }) => {
    const el = g.current;
    if (!el) return;
    const d = (clock.elapsedTime * speed) % legs.total;
    const s =
      legs.segs.find((x) => d >= x.start && d < x.start + x.len) ??
      legs.segs[0];
    if (!s) return;
    const k = (d - s.start) / s.len;
    el.position.set(
      s.ax + (s.bx - s.ax) * k,
      Math.abs(Math.sin(clock.elapsedTime * speed * 5)) * 0.12,
      s.az + (s.bz - s.az) * k
    );
    el.rotation.y = Math.atan2(s.bx - s.ax, s.bz - s.az);
  });
  return (
    <group ref={g}>
      <mesh position={[0, 0.9, 0]} castShadow>
        <capsuleGeometry args={[0.38, 0.8, 4, 10]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0, 1.85, 0]} castShadow>
        <sphereGeometry args={[0.33, 14, 12]} />
        <meshStandardMaterial color="#f1c27d" />
      </mesh>
      <mesh position={[0, 2.03, 0]} castShadow>
        <sphereGeometry args={[0.38, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#ffc93c" />
      </mesh>
    </group>
  );
};

/**
 * Orbit camera for touch and mouse. Idles with a slow turn, and keeps the
 * tower framed in the open area between the HUD and the bottom panels.
 */
const CameraRig = ({
  height,
  insetTop,
  insetBottom,
  siteMode,
  siteRadius,
}: {
  height: number;
  insetTop: number;
  insetBottom: number;
  siteMode: boolean;
  siteRadius: number;
}) => {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const controls = useRef<OrbitControls | null>(null);
  const lastTouch = useRef(-Infinity);

  const fit = Math.max(height + 8, 22);
  const focusY = siteMode ? 2 : Math.max(5, fit / 2 - 3);

  // Switching modes re-frames right away instead of waiting for the idle timer.
  useEffect(() => {
    lastTouch.current = -Infinity;
  }, [siteMode]);

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.enablePan = false;
    c.minDistance = 16;
    c.maxDistance = 360;
    // Stay above roof level of the neighbors: at least ~27° looking down.
    c.minPolarAngle = 0.3;
    c.maxPolarAngle = 1.12;
    c.rotateSpeed = 0.7;
    c.zoomSpeed = 0.9;
    c.autoRotate = true;
    c.autoRotateSpeed = 0.35;
    c.target.set(0, 6, 0);
    const onStart = () => {
      lastTouch.current = performance.now();
      c.autoRotate = false;
    };
    c.addEventListener('start', onStart);
    controls.current = c;
    return () => {
      c.removeEventListener('start', onStart);
      c.dispose();
      controls.current = null;
    };
  }, [camera, gl]);

  // Shift the projection so the scene centers in the visible gap, not the whole screen.
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const h = size.height;
    const gapCenter = insetTop + (h - insetTop - insetBottom) / 2;
    camera.setViewOffset(size.width, h, 0, h / 2 - gapCenter, size.width, h);
    camera.updateProjectionMatrix();
  }, [camera, size, insetTop, insetBottom]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    const k = Math.min(1, dt * 1.8);
    c.target.y += (focusY - c.target.y) * k;
    const idle = performance.now() - lastTouch.current > 8000;
    if (idle) {
      // Hold still while picking tiles; drift around the tower otherwise.
      c.autoRotate = !siteMode;
      if (camera instanceof THREE.PerspectiveCamera && siteMode) {
        // Look down over the whole site and its neighbors.
        const gapFrac = Math.max(
          0.25,
          (size.height - insetTop - insetBottom) / size.height
        );
        const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const byWidth = siteRadius / (halfTan * camera.aspect);
        const byHeight = (siteRadius * 0.75) / (halfTan * gapFrac);
        const want = THREE.MathUtils.clamp(
          Math.max(byWidth, byHeight),
          c.minDistance,
          c.maxDistance
        );
        const offset = camera.position.clone().sub(c.target);
        const sph = new THREE.Spherical().setFromVector3(offset);
        sph.radius += (want - sph.radius) * k;
        sph.phi += (0.62 - sph.phi) * k;
        camera.position
          .copy(c.target)
          .add(new THREE.Vector3().setFromSpherical(sph));
      } else if (camera instanceof THREE.PerspectiveCamera) {
        // Fit the whole tower (plus a margin) into the visible gap.
        const gapFrac = Math.max(
          0.25,
          (size.height - insetTop - insetBottom) / size.height
        );
        const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const byHeight = fit / 2 / (halfTan * gapFrac);
        const byWidth = (TOWER_W + 14) / 2 / (halfTan * camera.aspect);
        const want = THREE.MathUtils.clamp(
          Math.max(byHeight, byWidth) * 1.08,
          c.minDistance,
          c.maxDistance
        );
        const offset = camera.position.clone().sub(c.target);
        offset.setLength(offset.length() + (want - offset.length()) * k);
        camera.position.copy(c.target).add(offset);
      }
    }
    c.update();
  });

  return null;
};
