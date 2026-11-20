import { useRef, type PointerEvent } from 'react';
import { controls } from '../game/controls';

const SIZE = 116;
const KNOB = 48;
const RANGE = (SIZE - KNOB) / 2;

/** Thumb stick for walking. Writes straight into `controls`; no React state. */
export const Joystick = () => {
  const knob = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RANGE) {
      dx = (dx / len) * RANGE;
      dy = (dy / len) * RANGE;
    }
    controls.stickX = dx / RANGE;
    controls.stickY = -dy / RANGE;
    if (knob.current)
      knob.current.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const release = () => {
    pointer.current = null;
    controls.stickX = 0;
    controls.stickY = 0;
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)';
  };

  return (
    <div
      className="relative touch-none select-none rounded-full border-4 border-white/70 bg-black/25 shadow-lg"
      style={{ width: SIZE, height: SIZE }}
      onPointerDown={(e) => {
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={(e) => {
        if (pointer.current === e.pointerId) move(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      aria-label="Walk"
      role="presentation"
    >
      <div
        ref={knob}
        className="absolute rounded-full border-4 border-[#3b2a1a] bg-[#ffd23f] shadow-md"
        style={{
          width: KNOB,
          height: KNOB,
          left: (SIZE - KNOB) / 2,
          top: (SIZE - KNOB) / 2,
        }}
      />
    </div>
  );
};
