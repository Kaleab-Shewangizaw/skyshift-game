import { memo, type CSSProperties } from 'react';
import type { Challenge } from '../../shared/challenge';
import { MATERIALS, type DecorId, type MaterialId } from '../../shared/content';
import { hashString } from '../../shared/rng';
import {
  SPIRE_HEIGHT,
  towerHeight,
  unlocked,
  weakFloors,
  type Floor,
  type TowerState,
} from '../../shared/rules';

const PX_PER_M = 8;
const VIEW_W = 200;
const GROUND = 22;
const TOWER_W = 92;
const X0 = (VIEW_W - TOWER_W) / 2;

type Props = {
  tower: TowerState;
  challenge: Challenge;
  /** Floor to emphasize (preview target or the floor just changed). */
  focusIndex?: number | null;
  /** Draw the floor at focusIndex as a not-yet-built ghost. */
  ghost?: boolean;
  /** Floor that should play the drop-in animation. */
  justBuilt?: number | null;
};

export const TowerScene = memo(
  ({
    tower,
    challenge,
    focusIndex = null,
    ghost = false,
    justBuilt = null,
  }: Props) => {
    const { theme, targets, condition } = challenge;
    const heightM = towerHeight(tower);
    const hasSpire = tower.floors.length > 0 && unlocked(tower.spirit, 'spire');
    const hasScaffold = unlocked(tower.spirit, 'scaffold');
    const hasPicnic = unlocked(tower.spirit, 'picnic');
    const weak = new Set(weakFloors(tower, challenge));
    // Frame the tower, not the goal: young towers should fill the stage.
    // When the goal is above the frame, a pinned tag shows how far to go.
    const goalNear = targets.height <= heightM + 10;
    const viewM = goalNear
      ? Math.max(targets.height + 6, heightM + 10)
      : Math.max(heightM + 12, 22);
    const viewH = viewM * PX_PER_M + GROUND;
    const groundY = viewH - GROUND;
    const night = theme.tag === 'night';

    // Floor bottoms, from the ground up.
    const placed = tower.floors.reduce<
      { f: Floor; i: number; y: number; h: number }[]
    >((acc, f, i) => {
      const h = MATERIALS[f.material].height * PX_PER_M;
      const below = acc.length > 0 ? acc[acc.length - 1]!.y : groundY;
      return [...acc, { f, i, y: below - h, h }];
    }, []);
    const topY = placed.length > 0 ? placed[placed.length - 1]!.y : groundY;
    const goalY = groundY - targets.height * PX_PER_M;
    const n = tower.floors.length;
    const cloudSpeed = [70, 40, 22][condition.wind] ?? 40;
    const swayStyle: CSSProperties & Record<'--sway', string> = {
      '--sway': ['0deg', '0.5deg', '1.1deg'][condition.wind] ?? '0deg',
    };

    return (
      <svg
        viewBox={`0 0 ${VIEW_W} ${viewH}`}
        preserveAspectRatio="xMidYMax meet"
        className="absolute inset-0 block h-full w-full"
        style={{ overflow: 'visible' }}
        role="img"
        aria-label={`Tower with ${n} floors, ${heightM} meters tall`}
      >
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={theme.sky[0]} />
            <stop offset="1" stopColor={theme.sky[1]} />
          </linearGradient>
        </defs>
        <rect
          x={-1000}
          y={-viewH * 3}
          width={VIEW_W + 2000}
          height={viewH * 4}
          fill={theme.sky[0]}
        />
        <rect
          x={-1000}
          y={0}
          width={VIEW_W + 2000}
          height={viewH}
          fill="url(#sky)"
        />

        {/* Sun or moon */}
        {night ? (
          <g>
            <circle cx={34} cy={30} r={11} fill="#fff6d5" />
            <circle cx={39} cy={26} r={10} fill={theme.sky[0]} />
            {[
              [150, 20],
              [120, 44],
              [60, 60],
              [180, 70],
              [20, 90],
            ].map(([x, y]) => (
              <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r={0.9}
                fill="#fff"
                className="twinkle"
              />
            ))}
          </g>
        ) : (
          <circle cx={34} cy={30} r={12} fill="#fff3b0" opacity={0.9} />
        )}

        {/* Clouds drift faster on windy days */}
        {[0, 1, 2].map((k) => (
          <g
            key={k}
            className="cloud"
            style={{
              animationDuration: `${cloudSpeed + k * 9}s`,
              animationDelay: `${-k * 13}s`,
            }}
          >
            <Cloud x={0} y={24 + k * 38} s={0.8 + (k % 2) * 0.35} />
          </g>
        ))}

        {/* Goal line, or a pinned tag when the goal is above the frame */}
        {!goalNear && (
          <g>
            <rect
              x={VIEW_W - 92}
              y={6}
              width={86}
              height={11}
              rx={3}
              fill={theme.accent}
            />
            <text
              x={VIEW_W - 49}
              y={13.6}
              textAnchor="middle"
              fontSize={6}
              fontWeight={700}
              fill="#fff"
            >
              {`GOAL ${targets.height} m · ${targets.height - heightM} m to go ↑`}
            </text>
          </g>
        )}
        <g display={goalNear ? undefined : 'none'}>
          <line
            x1={6}
            x2={VIEW_W - 6}
            y1={goalY}
            y2={goalY}
            stroke={theme.accent}
            strokeWidth={1}
            strokeDasharray="4 3"
            opacity={0.8}
          />
          <rect
            x={6}
            y={goalY - 9}
            width={44}
            height={9}
            rx={2}
            fill={theme.accent}
          />
          <text
            x={28}
            y={goalY - 2.4}
            textAnchor="middle"
            fontSize={6.2}
            fontWeight={700}
            fill="#fff"
          >
            GOAL {targets.height} m
          </text>
        </g>

        {/* Birds */}
        {[0, 1].map((k) => (
          <g
            key={k}
            className="bird"
            style={{
              animationDuration: `${16 + k * 7}s`,
              animationDelay: `${-k * 6}s`,
            }}
          >
            <Bird x={0} y={40 + k * 26} />
          </g>
        ))}

        <Crane
          topY={Math.min(
            topY - (hasSpire ? SPIRE_HEIGHT * PX_PER_M : 0),
            groundY - 10
          )}
          groundY={groundY}
        />

        {/* Ground */}
        {/* Ground runs on below the scene so the panels sit on it. */}
        <rect
          x={-1000}
          y={groundY}
          width={VIEW_W + 2000}
          height={2000}
          fill={theme.ground}
        />
        <rect
          x={-1000}
          y={groundY}
          width={VIEW_W + 2000}
          height={3}
          fill="#000"
          opacity={0.1}
        />
        {[-30, 12, 60, 140, 190, 230].map((x, k) => (
          <path
            key={x}
            d={`M${x} ${groundY + 8 + (k % 2) * 6} q 2 -4 4 0 q 2 -4 4 0`}
            stroke="#000"
            strokeOpacity={0.12}
            fill="none"
          />
        ))}
        <rect
          x={X0 - 8}
          y={groundY - 3}
          width={TOWER_W + 16}
          height={5}
          rx={1.5}
          fill="#8d8a84"
        />
        <SiteProps groundY={groundY} />
        {hasPicnic && <Picnic groundY={groundY} />}
        <Worker groundY={groundY} />

        {n === 0 && (
          <g>
            <rect
              x={X0 + 18}
              y={groundY - 30}
              width={TOWER_W - 36}
              height={20}
              rx={3}
              fill="#fff"
              stroke="#c9b48a"
            />
            <text
              x={VIEW_W / 2}
              y={groundY - 22}
              textAnchor="middle"
              fontSize={6}
              fontWeight={700}
              fill="#6b5a3a"
            >
              Empty lot!
            </text>
            <text
              x={VIEW_W / 2}
              y={groundY - 14.5}
              textAnchor="middle"
              fontSize={5}
              fill="#6b5a3a"
            >
              Lay the first floor
            </text>
          </g>
        )}

        <g className="tower-sway" style={swayStyle}>
          {hasScaffold && n > 0 && <Scaffold topY={topY} groundY={groundY} />}
          {placed.map(({ f, i, y, h }) => (
            <FloorShape
              key={i}
              floor={f}
              y={y}
              h={h}
              weak={weak.has(i)}
              ghost={ghost && i === focusIndex}
              focus={!ghost && i === focusIndex}
              drop={i === justBuilt}
              seed={hashString(`${challenge.dateKey}:${i}:${f.material}`)}
            />
          ))}

          {n > 0 && (
            <Roof
              y={topY}
              accent={theme.accent}
              ghost={ghost && focusIndex === n - 1}
              spire={hasSpire}
            />
          )}
        </g>
        {focusIndex !== null && placed[focusIndex] && (
          <Sparkles x={X0} y={placed[focusIndex].y} h={placed[focusIndex].h} />
        )}
      </svg>
    );
  }
);

const Cloud = ({ x, y, s }: { x: number; y: number; s: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill="#fff" opacity={0.85}>
    <ellipse cx={0} cy={0} rx={14} ry={6} />
    <ellipse cx={-8} cy={2} rx={9} ry={5} />
    <ellipse cx={9} cy={2} rx={10} ry={5} />
  </g>
);

const Crane = ({ topY, groundY }: { topY: number; groundY: number }) => {
  const mastX = 176;
  const jibY = Math.max(14, topY - 22);
  const hookX = VIEW_W / 2 + 18;
  return (
    <g className="crane">
      <rect
        x={mastX - 4}
        y={jibY}
        width={8}
        height={groundY - jibY}
        fill="none"
        stroke="#e8a92c"
        strokeWidth={1.4}
      />
      <path
        d={Array.from({ length: Math.ceil((groundY - jibY) / 8) }, (_, k) => {
          const yy = jibY + k * 8;
          return `M${mastX - 4} ${yy} L${mastX + 4} ${yy + 8}`;
        }).join(' ')}
        stroke="#e8a92c"
        strokeWidth={1}
      />
      <rect
        x={hookX - 6}
        y={jibY - 3}
        width={mastX - hookX + 18}
        height={4}
        rx={1}
        fill="#f2b632"
      />
      <rect
        x={mastX + 6}
        y={jibY - 6}
        width={8}
        height={7}
        rx={1}
        fill="#6f7a86"
      />
      <line
        x1={hookX}
        x2={hookX}
        y1={jibY + 1}
        y2={topY - 8}
        stroke="#555"
        strokeWidth={0.6}
        className="hook-line"
      />
      <path
        d={`M${hookX} ${topY - 8} q 3 1 0 4 q -2 -1 -1 -2`}
        stroke="#555"
        fill="none"
        strokeWidth={1}
      />
    </g>
  );
};

const SiteProps = ({ groundY }: { groundY: number }) => (
  <g>
    {/* Traffic cones and a little lumber pile */}
    {[18, 30].map((x) => (
      <g key={x}>
        <path
          d={`M${x - 4} ${groundY + 1} L${x} ${groundY - 9} L${x + 4} ${groundY + 1} Z`}
          fill="#f47c3c"
        />
        <rect
          x={x - 2.2}
          y={groundY - 5}
          width={4.4}
          height={1.6}
          fill="#fff"
        />
      </g>
    ))}
    <rect x={150} y={groundY - 4} width={18} height={3} rx={1} fill="#c18b52" />
    <rect x={152} y={groundY - 7} width={14} height={3} rx={1} fill="#d9a066" />
  </g>
);

const Roof = ({
  y,
  accent,
  ghost,
  spire,
}: {
  y: number;
  accent: string;
  ghost: boolean;
  spire: boolean;
}) => {
  const cx = X0 + TOWER_W / 2;
  const sh = SPIRE_HEIGHT * PX_PER_M;
  return (
    <g opacity={ghost ? 0.6 : 1}>
      <rect
        x={X0 - 3}
        y={y - 4}
        width={TOWER_W + 6}
        height={4}
        rx={1.5}
        fill="#5d5a55"
        stroke="#3b2a1a"
        strokeWidth={0.8}
      />
      {spire ? (
        <g>
          <path
            d={`M${cx - 14} ${y - 4} L${cx} ${y - 4 - sh} L${cx + 14} ${y - 4} Z`}
            fill="#ffc93c"
            stroke="#8a5a00"
            strokeWidth={1}
          />
          <path
            d={`M${cx - 4} ${y - 6} L${cx} ${y - 4 - sh + 6} L${cx + 1} ${y - 6} Z`}
            fill="#fff4b0"
            opacity={0.8}
          />
          <circle
            cx={cx}
            cy={y - 6 - sh}
            r={3}
            fill="#fff4b0"
            stroke="#8a5a00"
            strokeWidth={0.8}
            className="twinkle"
          />
        </g>
      ) : (
        <g>
          <line
            x1={X0 + TOWER_W - 12}
            x2={X0 + TOWER_W - 12}
            y1={y - 4}
            y2={y - 24}
            stroke="#5d5a55"
            strokeWidth={1.2}
          />
          <path
            d={`M${X0 + TOWER_W - 12} ${y - 24} l 12 3.5 l -12 3.5 Z`}
            fill={accent}
            className="pennant"
          />
        </g>
      )}
    </g>
  );
};

const Bird = ({ x, y }: { x: number; y: number }) => (
  <g
    transform={`translate(${x} ${y})`}
    fill="none"
    stroke="#3b2a1a"
    strokeWidth={0.9}
    strokeLinecap="round"
  >
    <path className="wing" d="M-4 0 q 2 -3 4 0" />
    <path className="wing" d="M0 0 q 2 -3 4 0" />
  </g>
);

const Sparkles = ({ x, y, h }: { x: number; y: number; h: number }) => (
  <g pointerEvents="none">
    {[
      { sx: x - 6, sy: y + 2, d: 0 },
      { sx: x + TOWER_W + 6, sy: y + h / 2, d: 0.5 },
      { sx: x + TOWER_W / 2, sy: y - 6, d: 1 },
      { sx: x + 10, sy: y + h + 2, d: 1.3 },
    ].map(({ sx, sy, d }) => (
      <path
        key={`${sx}-${sy}`}
        className="sparkle"
        style={{ animationDelay: `${d}s` }}
        d={`M${sx} ${sy - 4} L${sx + 1} ${sy - 1} L${sx + 4} ${sy} L${sx + 1} ${sy + 1} L${sx} ${sy + 4} L${sx - 1} ${sy + 1} L${sx - 4} ${sy} L${sx - 1} ${sy - 1} Z`}
        fill="#fff4b0"
        stroke="#e0a800"
        strokeWidth={0.5}
      />
    ))}
  </g>
);

const Scaffold = ({ topY, groundY }: { topY: number; groundY: number }) => {
  const left = X0 - 6;
  const right = X0 + TOWER_W + 6;
  const rungs: number[] = [];
  for (let yy = groundY - 10; yy > topY; yy -= 14) rungs.push(yy);
  return (
    <g stroke="#e8a92c" strokeWidth={1.3}>
      {[left, right].map((x) => (
        <line key={x} x1={x} x2={x} y1={groundY} y2={topY + 2} />
      ))}
      {rungs.map((yy) => (
        <g key={yy}>
          <line x1={left - 3} x2={left + 3} y1={yy} y2={yy} />
          <line x1={right - 3} x2={right + 3} y1={yy} y2={yy} />
        </g>
      ))}
    </g>
  );
};

const Picnic = ({ groundY }: { groundY: number }) => (
  <g transform={`translate(12 ${groundY + 4})`}>
    <path
      d="M0 6 L30 6 L26 0 L4 0 Z"
      fill="#e8574b"
      stroke="#3b2a1a"
      strokeWidth={0.6}
    />
    <path
      d="M8 0 L6 6 M15 0 L15 6 M22 0 L24 6"
      stroke="#fff"
      strokeWidth={1.2}
    />
    <rect
      x={18}
      y={-6}
      width={8}
      height={6}
      rx={1}
      fill="#c18b52"
      stroke="#3b2a1a"
      strokeWidth={0.5}
    />
    <path
      d="M19 -6 q 3 -4 6 0"
      stroke="#3b2a1a"
      strokeWidth={0.6}
      fill="none"
    />
  </g>
);

const Worker = ({ groundY }: { groundY: number }) => (
  <g className="worker-walk">
    <text x={0} y={groundY + 1} fontSize={11} textAnchor="middle">
      👷
    </text>
  </g>
);

const BRACE = '#6b4a2e';

const FloorShape = ({
  floor,
  y,
  h,
  weak,
  ghost,
  focus,
  drop,
  seed,
}: {
  floor: Floor;
  y: number;
  h: number;
  weak: boolean;
  ghost: boolean;
  focus: boolean;
  drop: boolean;
  seed: number;
}) => {
  const m = MATERIALS[floor.material];
  const cls = [drop ? 'drop-in' : '', focus ? 'focus-pulse' : ''].join(' ');
  return (
    <g className={cls} opacity={ghost ? 0.55 : 1}>
      <rect
        x={X0}
        y={y}
        width={TOWER_W}
        height={h}
        rx={1.5}
        fill={m.colors.wall}
        stroke={ghost ? '#333' : m.colors.trim}
        strokeWidth={ghost ? 1 : 1.4}
        strokeDasharray={ghost ? '3 2' : undefined}
      />
      <Texture material={floor.material} y={y} h={h} color={m.colors.trim} />
      <Windows
        material={floor.material}
        y={y}
        h={h}
        color={m.colors.window}
        trim={m.colors.trim}
        seed={seed}
      />
      {/* Braces: 1 = diagonal, 2 = X, 3 = X + belt */}
      {floor.braces >= 1 && (
        <line
          x1={X0 + 2}
          y1={y + h - 1}
          x2={X0 + TOWER_W - 2}
          y2={y + 1}
          stroke={BRACE}
          strokeWidth={2}
          opacity={0.85}
        />
      )}
      {floor.braces >= 2 && (
        <line
          x1={X0 + 2}
          y1={y + 1}
          x2={X0 + TOWER_W - 2}
          y2={y + h - 1}
          stroke={BRACE}
          strokeWidth={2}
          opacity={0.85}
        />
      )}
      {floor.braces >= 3 && (
        <rect
          x={X0 - 1}
          y={y + h / 2 - 1.5}
          width={TOWER_W + 2}
          height={3}
          fill={BRACE}
        />
      )}
      {floor.decor.map((d, k) => (
        <DecorShape key={d} id={d} slot={k} y={y} h={h} />
      ))}
      {weak && !ghost && (
        <g>
          <path
            d={`M${X0 + 66} ${y + 1} l -3 ${h * 0.3} l 4 ${h * 0.15} l -4 ${h * 0.35}`}
            stroke="#3a2a20"
            strokeWidth={0.9}
            fill="none"
          />
          <g transform={`translate(${X0 + TOWER_W + 3} ${y + h / 2 - 5})`}>
            <g className="warn-bob">
              <path
                d="M5 0 L10 9 L0 9 Z"
                fill="#ffb020"
                stroke="#8a5a00"
                strokeWidth={0.6}
              />
              <text
                x={5}
                y={8}
                textAnchor="middle"
                fontSize={6}
                fontWeight={800}
                fill="#5a3a00"
              >
                !
              </text>
            </g>
          </g>
        </g>
      )}
    </g>
  );
};

const Texture = ({
  material,
  y,
  h,
  color,
}: {
  material: MaterialId;
  y: number;
  h: number;
  color: string;
}) => {
  const lines: string[] = [];
  if (material === 'brick') {
    for (let yy = y + 4; yy < y + h; yy += 4)
      lines.push(`M${X0} ${yy} h${TOWER_W}`);
  } else if (material === 'timber') {
    for (let xx = X0 + 8; xx < X0 + TOWER_W; xx += 8)
      lines.push(`M${xx} ${y} v${h}`);
  } else if (material === 'bamboo') {
    for (let xx = X0 + 6; xx < X0 + TOWER_W; xx += 6)
      lines.push(`M${xx} ${y} v${h}`);
    lines.push(`M${X0} ${y + h / 2} h${TOWER_W}`);
  } else if (material === 'stone') {
    lines.push(`M${X0} ${y + h / 2} h${TOWER_W}`);
    for (let xx = X0 + 14; xx < X0 + TOWER_W; xx += 22)
      lines.push(`M${xx} ${y} v${h / 2} M${xx + 11} ${y + h / 2} v${h / 2}`);
  } else if (material === 'steel') {
    lines.push(
      `M${X0} ${y + 2.5} h${TOWER_W}`,
      `M${X0} ${y + h - 2.5} h${TOWER_W}`
    );
  }
  return (
    <path
      d={lines.join(' ')}
      stroke={color}
      strokeWidth={0.5}
      opacity={0.45}
      fill="none"
    />
  );
};

const Windows = ({
  material,
  y,
  h,
  color,
  trim,
  seed,
}: {
  material: MaterialId;
  y: number;
  h: number;
  color: string;
  trim: string;
  seed: number;
}) => {
  if (material === 'glass') {
    return (
      <g>
        {[0, 1, 2, 3].map((k) => (
          <rect
            key={k}
            x={X0 + 3 + k * 22}
            y={y + 3}
            width={20}
            height={h - 6}
            fill={color}
            opacity={0.7}
            stroke={trim}
            strokeWidth={0.6}
          />
        ))}
        <path
          d={`M${X0 + 10} ${y + h - 4} l 10 ${-(h - 8)}`}
          stroke="#fff"
          strokeWidth={2}
          opacity={0.6}
        />
      </g>
    );
  }
  const count = material === 'stone' ? 4 : 3;
  const ww = material === 'stone' ? 10 : 14;
  const wh = Math.max(5, h * 0.42);
  const gap = (TOWER_W - count * ww) / (count + 1);
  return (
    <g>
      {Array.from({ length: count }, (_, k) => {
        const lit = ((seed >> k) & 3) !== 0;
        return (
          <rect
            key={k}
            x={X0 + gap + k * (ww + gap)}
            y={y + (h - wh) / 2}
            width={ww}
            height={wh}
            rx={material === 'timber' || material === 'bamboo' ? 2.5 : 0.8}
            fill={lit ? color : '#6b7a88'}
            stroke={trim}
            strokeWidth={0.8}
          />
        );
      })}
    </g>
  );
};

const DecorShape = ({
  id,
  slot,
  y,
  h,
}: {
  id: DecorId;
  slot: number;
  y: number;
  h: number;
}) => {
  const left = slot === 0;
  const sideX = left ? X0 - 9 : X0 + TOWER_W + 1;
  switch (id) {
    case 'flowerbox':
      return (
        <g>
          <rect
            x={X0 + 8}
            y={y + h - 5}
            width={TOWER_W - 16}
            height={3.5}
            rx={1}
            fill="#7a4b2a"
          />
          {Array.from({ length: 9 }, (_, k) => (
            <circle
              key={k}
              cx={X0 + 12 + k * 8.5}
              cy={y + h - 5.5}
              r={1.8}
              fill={['#ff6b8b', '#ffd166', '#c77dff'][k % 3]}
            />
          ))}
        </g>
      );
    case 'flag':
      return (
        <g>
          <path
            d={`M${X0} ${y + 1} Q ${X0 + TOWER_W / 2} ${y + 6} ${X0 + TOWER_W} ${y + 1}`}
            stroke="#555"
            strokeWidth={0.5}
            fill="none"
          />
          {Array.from({ length: 8 }, (_, k) => {
            const x = X0 + 6 + k * 11;
            const sag = 4 * Math.sin((Math.PI * (x - X0)) / TOWER_W);
            return (
              <path
                key={k}
                d={`M${x - 3} ${y + 1 + sag} l 3 5 l 3 -5 Z`}
                fill={['#e8574b', '#2a9d8f', '#ffd166', '#5c7cfa'][k % 4]}
              />
            );
          })}
        </g>
      );
    case 'lights':
      return (
        <g>
          {Array.from({ length: 12 }, (_, k) => {
            const x = X0 + 4 + k * 7.6;
            const sag = 3 * Math.sin((Math.PI * (x - X0)) / TOWER_W);
            return (
              <circle
                key={k}
                cx={x}
                cy={y + 2 + sag}
                r={1.3}
                fill="#ffe066"
                className="twinkle"
                style={{ animationDelay: `${k * 0.2}s` }}
              />
            );
          })}
        </g>
      );
    case 'awning':
      return (
        <g>
          {Array.from({ length: 6 }, (_, k) => (
            <path
              key={k}
              d={`M${X0 + 28 + k * 6} ${y + 2} h6 l 1.5 5 h-6 Z`}
              fill={k % 2 ? '#fff' : '#e8574b'}
            />
          ))}
        </g>
      );
    case 'birdhouse':
      return (
        <g transform={`translate(${sideX} ${y + h / 2 - 5})`}>
          <rect
            x={0}
            y={3}
            width={8}
            height={7}
            fill="#e9c46a"
            stroke="#8a5a2b"
            strokeWidth={0.5}
          />
          <path d="M-1 3.5 L4 -1 L9 3.5 Z" fill="#c0392b" />
          <circle cx={4} cy={6.5} r={1.3} fill="#3a2a20" />
        </g>
      );
    case 'mural':
      return (
        <g>
          <circle
            cx={left ? X0 + 14 : X0 + TOWER_W - 14}
            cy={y + h / 2}
            r={Math.min(6, h / 2 - 2)}
            fill="#ffd166"
            stroke="#e76f51"
            strokeWidth={1.2}
          />
          <path
            d={`M${(left ? X0 + 14 : X0 + TOWER_W - 14) - 3} ${y + h / 2 + 1} q 3 3 6 0`}
            stroke="#e76f51"
            strokeWidth={0.8}
            fill="none"
          />
        </g>
      );
    case 'solar':
      return (
        <g transform={`translate(${sideX} ${y + 1})`}>
          <path
            d="M0 6 L8 1 L8 4 L0 9 Z"
            fill="#2d4f8a"
            stroke="#9fb7e0"
            strokeWidth={0.4}
          />
          <line
            x1={4}
            y1={7}
            x2={4}
            y2={h - 2}
            stroke="#777"
            strokeWidth={0.8}
          />
        </g>
      );
    case 'lantern':
      return (
        <g transform={`translate(${sideX + 4} ${y + 2})`}>
          <g className="sway">
            <line x1={0} y1={0} x2={0} y2={3} stroke="#555" strokeWidth={0.5} />
            <ellipse cx={0} cy={7} rx={3.5} ry={4.2} fill="#e63946" />
            <ellipse
              cx={0}
              cy={7}
              rx={1.5}
              ry={3}
              fill="#ffb4a2"
              opacity={0.7}
            />
          </g>
        </g>
      );
  }
};
