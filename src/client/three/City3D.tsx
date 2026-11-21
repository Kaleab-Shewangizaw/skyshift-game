import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Challenge } from '../../shared/challenge';
import { TILE, siteTiles, type Tile } from '../../shared/city';
import type { SiteWork, TowerState } from '../../shared/rules';
import {
  STOREY,
  type PieceKind,
  type PieceSpec,
  type WallMaterial,
} from '../../shared/structure';
import { City, type SiteFx } from './City';
import { Crane } from './Crane';
import { CraneOperator, type CraneAim } from './CraneOperator';
import { CRANE_POS, PAD_TOP, STACK_POS } from './layout';
import { Player } from './Player';
import { buildColliders } from './physics';
import { Structure, type BuildView } from './Structure';

export type City3DProps = {
  tower: TowerState;
  challenge: Challenge;
  /** Pixels covered by the HUD at the top and controls at the bottom. */
  insetTop: number;
  insetBottom: number;
  /** Selected piece, and the callback for the spot the worker aims at. */
  kind: PieceKind;
  material: WallMaterial;
  onAim: (spec: PieceSpec, level: number) => void;
  /** Grid and ghost around the worker or under the hook (null in site overview). */
  build: BuildView | null;
  /** The worker is up in the crane cab. */
  inCrane: boolean;
  onCraneAim: (aim: CraneAim) => void;
  onNearCrane: (near: boolean) => void;
  onCell: (x: number, z: number, level: number) => void;
  /** Site work overview: the camera pulls back over the site and taps pick tiles. */
  siteMode: boolean;
  tool: SiteWork;
  candidates: readonly { x: number; z: number }[];
  selected: Tile | null;
  fx: SiteFx | null;
  onPickTile: (x: number, z: number) => void;
};

const FOV = 50;

export const City3D = (p: City3DProps) => {
  const night = p.challenge.theme.tag === 'night';
  const { site, pads, pieces } = p.tower;
  // How far the site (plus one ring of neighbors) reaches from the origin, in meters.
  const siteRadius = useMemo(
    () =>
      (Math.max(
        ...siteTiles(site).map((t) => Math.max(Math.abs(t.x), Math.abs(t.z)))
      ) +
        1.5) *
      TILE,
    [site]
  );
  const colliders = useMemo(
    () => buildColliders(site, pads, pieces, CRANE_POS, STACK_POS),
    [site, pads, pieces]
  );
  // The crane always stands taller than whatever has been built.
  const buildingTop = useMemo(
    () =>
      pieces.reduce(
        (top, piece) => Math.max(top, PAD_TOP + (piece.level + 1) * STOREY),
        0
      ),
    [pieces]
  );
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      // A near plane at 0.6 m (not 0.3) gives the depth buffer 2× the precision,
      // which keeps distant faces from shimmering through each other.
      camera={{ fov: FOV, near: 0.6, far: 1500, position: [0, 8, 14] }}
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
        site={site}
        pads={pads}
        tool={p.tool}
        candidates={p.siteMode ? p.candidates : undefined}
        selected={p.siteMode ? p.selected : null}
        fx={p.fx}
        onPickTile={p.siteMode ? p.onPickTile : undefined}
      />
      <Structure
        pieces={pieces}
        pads={pads}
        pallets={p.tower.pallets}
        build={p.build}
      />
      <Crane
        x={CRANE_POS[0]}
        z={CRANE_POS[1]}
        buildingTop={buildingTop}
        operated={p.inCrane}
      />
      <Player
        colliders={colliders}
        drive={!p.siteMode && !p.inCrane}
        visible={!p.inCrane}
        onNearCrane={p.onNearCrane}
        onCell={p.onCell}
        kind={p.kind}
        material={p.material}
        onAim={p.onAim}
      />
      {p.inCrane && !p.siteMode && (
        <CraneOperator buildingTop={buildingTop} onAim={p.onCraneAim} />
      )}
      <ViewOffset insetTop={p.insetTop} insetBottom={p.insetBottom} />
      {p.siteMode && (
        <SiteOverview
          radius={siteRadius}
          insetTop={p.insetTop}
          insetBottom={p.insetBottom}
        />
      )}
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

/** Shift the projection so the scene centers in the visible gap, not the whole screen. */
const ViewOffset = ({
  insetTop,
  insetBottom,
}: {
  insetTop: number;
  insetBottom: number;
}) => {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const h = size.height;
    const gapCenter = insetTop + (h - insetTop - insetBottom) / 2;
    camera.setViewOffset(size.width, h, 0, h / 2 - gapCenter, size.width, h);
    camera.updateProjectionMatrix();
  }, [camera, size, insetTop, insetBottom]);
  return null;
};

/**
 * Site work camera: orbit around the site from above, easing out to fit the
 * whole site and its neighbors until the player takes over.
 */
const SiteOverview = ({
  radius,
  insetTop,
  insetBottom,
}: {
  radius: number;
  insetTop: number;
  insetBottom: number;
}) => {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const controls = useRef<OrbitControls | null>(null);
  const touched = useRef(false);

  useEffect(() => {
    const c = new OrbitControls(camera, gl.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.enablePan = false;
    c.minDistance = 16;
    c.maxDistance = 360;
    c.minPolarAngle = 0.3;
    c.maxPolarAngle = 1.12;
    c.target.set(0, 2, 0);
    const onStart = () => {
      touched.current = true;
    };
    c.addEventListener('start', onStart);
    controls.current = c;
    return () => {
      c.removeEventListener('start', onStart);
      c.dispose();
      controls.current = null;
    };
  }, [camera, gl]);

  useFrame((_, dt) => {
    const c = controls.current;
    if (!c) return;
    if (!touched.current && camera instanceof THREE.PerspectiveCamera) {
      const k = Math.min(1, dt * 1.8);
      c.target.lerp(new THREE.Vector3(0, 2, 0), k);
      const gapFrac = Math.max(
        0.25,
        (size.height - insetTop - insetBottom) / size.height
      );
      const halfTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const want = THREE.MathUtils.clamp(
        Math.max(
          radius / (halfTan * camera.aspect),
          (radius * 0.75) / (halfTan * gapFrac)
        ),
        c.minDistance,
        c.maxDistance
      );
      const sph = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(c.target)
      );
      sph.radius += (want - sph.radius) * k;
      sph.phi += (0.62 - sph.phi) * k;
      camera.position
        .copy(c.target)
        .add(new THREE.Vector3().setFromSpherical(sph));
    }
    c.update();
  });
  return null;
};
