import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { activeRemotes, remoteBySid } from '../game/remote';
import { WorkerModel } from './Player';

// Other players' workers, moving live as their positions arrive over realtime.

/** Who is around; re-checked twice a second so arrivals and departures show up. */
export const RemoteWorkers = () => {
  const [users, setUsers] = useState<string[]>([]);
  useEffect(() => {
    const t = setInterval(() => {
      const next = activeRemotes()
        .map((r) => r.sid)
        .sort();
      setUsers((prev) =>
        prev.length === next.length && prev.every((u, i) => u === next[i])
          ? prev
          : next
      );
    }, 500);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      {users.map((sid) => (
        <RemoteWorker key={sid} sid={sid} />
      ))}
    </>
  );
};

const RemoteWorker = ({ sid }: { sid: string }) => {
  const group = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const phase = useRef(0);
  const placed = useRef(false);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20);
    const g = group.current;
    const r = remoteBySid(sid);
    if (!g || !r) return;
    g.visible = !r.crane;
    if (!placed.current) {
      g.position.set(r.x, r.y, r.z);
      placed.current = true;
    }
    // Dead reckoning: carry on at the reported speed since the last report
    // (for at most half a second), and glide toward that point.
    const ahead = Math.min(0.5, (Date.now() - r.seen) / 1000);
    const target = new THREE.Vector3(
      r.x + r.vx * ahead,
      r.y,
      r.z + r.vz * ahead
    );
    const before = g.position.clone();
    g.position.lerp(target, Math.min(1, dt * 12));
    let d = r.h - g.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y += d * Math.min(1, dt * 8);
    const speed = before.distanceTo(g.position) / dt;
    phase.current += dt * speed * 2.2;
    const swing = Math.sin(phase.current) * Math.min(0.75, speed * 0.2);
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.8;
    if (armR.current) armR.current.rotation.x = swing * 0.8;
  });

  return (
    <group ref={group}>
      <WorkerModel
        legL={legL}
        legR={legR}
        armL={armL}
        armR={armR}
        torso={torso}
        vest="#3d8bff"
      />
      <NameTag sid={sid} />
    </group>
  );
};

/** A small floating label above a worker's head. */
const NameTag = ({ sid }: { sid: string }) => {
  const text = `u/${remoteBySid(sid)?.user ?? 'builder'}`;
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = 'rgba(30,22,14,0.75)';
      ctx.beginPath();
      ctx.roundRect(4, 8, 248, 48, 24);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text.length > 18 ? `${text.slice(0, 17)}…` : text, 128, 33);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [text]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={[0, 2.55, 0]} scale={[1.8, 0.45, 1]}>
      <spriteMaterial map={texture} depthWrite={false} transparent />
    </sprite>
  );
};
