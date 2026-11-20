// Authored content. Every daily challenge is a combination of these pieces.

export type MaterialId =
  'brick' | 'timber' | 'steel' | 'glass' | 'stone' | 'bamboo';

export type Material = {
  id: MaterialId;
  name: string;
  /** Meters of height one floor adds. */
  height: number;
  /** How much load the floor can carry before it needs bracing. */
  sturdiness: number;
  /** Style points the floor contributes. */
  style: number;
  blurb: string;
  colors: { wall: string; trim: string; window: string };
};

export const MATERIALS: Record<MaterialId, Material> = {
  brick: {
    id: 'brick',
    name: 'Brick',
    height: 3,
    sturdiness: 3,
    style: 1,
    blurb: 'Reliable all-rounder',
    colors: { wall: '#c8644a', trim: '#8f3d2c', window: '#ffe8a3' },
  },
  timber: {
    id: 'timber',
    name: 'Timber',
    height: 3,
    sturdiness: 2,
    style: 2,
    blurb: 'Warm and charming, a bit light',
    colors: { wall: '#d9a066', trim: '#8a5a2b', window: '#fff3c4' },
  },
  steel: {
    id: 'steel',
    name: 'Steel',
    height: 4,
    sturdiness: 4,
    style: 0,
    blurb: 'Tall and strong, plain looking',
    colors: { wall: '#8fa3b3', trim: '#4d5f6e', window: '#d6f0ff' },
  },
  glass: {
    id: 'glass',
    name: 'Glass',
    height: 4,
    sturdiness: 1,
    style: 3,
    blurb: 'Dazzling, but fragile',
    colors: { wall: '#9fd8e8', trim: '#3f8aa6', window: '#e9fbff' },
  },
  stone: {
    id: 'stone',
    name: 'Stone',
    height: 2,
    sturdiness: 5,
    style: 1,
    blurb: 'Short and rock solid',
    colors: { wall: '#b5ab9c', trim: '#6e6557', window: '#fff0c9' },
  },
  bamboo: {
    id: 'bamboo',
    name: 'Bamboo',
    height: 3,
    sturdiness: 2,
    style: 2,
    blurb: 'Springy and leafy',
    colors: { wall: '#a9c46c', trim: '#5e7a2a', window: '#f6ffd6' },
  },
};

export type DecorId =
  | 'flowerbox'
  | 'flag'
  | 'lights'
  | 'awning'
  | 'birdhouse'
  | 'mural'
  | 'solar'
  | 'lantern';

export type Decor = {
  id: DecorId;
  name: string;
  style: number;
  tags: string[];
};

export const DECORATIONS: Record<DecorId, Decor> = {
  flowerbox: {
    id: 'flowerbox',
    name: 'Flower boxes',
    style: 4,
    tags: ['garden', 'spring'],
  },
  flag: {
    id: 'flag',
    name: 'Pennant flags',
    style: 3,
    tags: ['festival', 'harbor'],
  },
  lights: {
    id: 'lights',
    name: 'String lights',
    style: 4,
    tags: ['festival', 'night'],
  },
  awning: {
    id: 'awning',
    name: 'Striped awning',
    style: 3,
    tags: ['harbor', 'market'],
  },
  birdhouse: {
    id: 'birdhouse',
    name: 'Birdhouse',
    style: 3,
    tags: ['garden', 'forest'],
  },
  mural: {
    id: 'mural',
    name: 'Little mural',
    style: 5,
    tags: ['market', 'night'],
  },
  solar: {
    id: 'solar',
    name: 'Solar panel',
    style: 3,
    tags: ['desert', 'forest'],
  },
  lantern: {
    id: 'lantern',
    name: 'Paper lantern',
    style: 4,
    tags: ['night', 'festival'],
  },
};

export type Theme = {
  id: string;
  name: string;
  site: string;
  tag: string;
  sky: [string, string];
  ground: string;
  accent: string;
};

export const THEMES: Theme[] = [
  {
    id: 'harbor',
    name: 'Harbor Lookout',
    site: 'a pier by the bay',
    tag: 'harbor',
    sky: ['#9ed4f2', '#e7f6ff'],
    ground: '#7fa7b8',
    accent: '#e8574b',
  },
  {
    id: 'garden',
    name: 'Garden Spire',
    site: 'the community garden',
    tag: 'garden',
    sky: ['#b8e3c8', '#f3fff0'],
    ground: '#7fb069',
    accent: '#f08a5d',
  },
  {
    id: 'festival',
    name: 'Festival Tower',
    site: 'the town square',
    tag: 'festival',
    sky: ['#ffd1a8', '#fff4e3'],
    ground: '#c9a37a',
    accent: '#d94f87',
  },
  {
    id: 'night',
    name: 'Moonlight Loft',
    site: 'a quiet hill at dusk',
    tag: 'night',
    sky: ['#4b5c9e', '#c3b3e6'],
    ground: '#5c6b7f',
    accent: '#ffd166',
  },
  {
    id: 'market',
    name: 'Market Stack',
    site: 'the old market lane',
    tag: 'market',
    sky: ['#f6c9a0', '#fff1de'],
    ground: '#b48a6a',
    accent: '#2a9d8f',
  },
  {
    id: 'forest',
    name: 'Treeline Tower',
    site: 'a clearing in the pines',
    tag: 'forest',
    sky: ['#a8d5c8', '#eefaf4'],
    ground: '#5f8a5a',
    accent: '#e9c46a',
  },
  {
    id: 'desert',
    name: 'Mesa Beacon',
    site: 'a sunny mesa',
    tag: 'desert',
    sky: ['#ffd59e', '#fff6e5'],
    ground: '#d8a96b',
    accent: '#3d7ea6',
  },
  {
    id: 'spring',
    name: 'Blossom Heights',
    site: 'a cherry orchard',
    tag: 'spring',
    sky: ['#ffd6e4', '#fff5f8'],
    ground: '#94c47d',
    accent: '#c44569',
  },
];

export type Condition = {
  id: string;
  name: string;
  description: string;
  /** Extra sturdiness every floor in the upper half of the tower needs. */
  upperNeed: number;
  /** Sturdiness modifiers for specific materials today. */
  materialMods: Partial<Record<MaterialId, number>>;
  /** Added to the base stability target. */
  stabilityTargetBonus: number;
  wind: 0 | 1 | 2;
  icon: string;
};

export const CONDITIONS: Condition[] = [
  {
    id: 'calm',
    name: 'Calm skies',
    description: 'A gentle day. Build freely.',
    upperNeed: 0,
    materialMods: {},
    stabilityTargetBonus: 0,
    wind: 0,
    icon: '☀️',
  },
  {
    id: 'breezy',
    name: 'Breezy',
    description: 'Upper floors need a bit more sturdiness.',
    upperNeed: 1,
    materialMods: {},
    stabilityTargetBonus: -5,
    wind: 1,
    icon: '🌬️',
  },
  {
    id: 'gusty',
    name: 'Gusty winds',
    description: 'Upper floors need extra bracing. Glass sways.',
    upperNeed: 1,
    materialMods: { glass: -1 },
    stabilityTargetBonus: 0,
    wind: 2,
    icon: '💨',
  },
  {
    id: 'drizzle',
    name: 'Drizzle',
    description: 'Damp timber and bamboo are a little weaker.',
    upperNeed: 0,
    materialMods: { timber: -1, bamboo: -1 },
    stabilityTargetBonus: 0,
    wind: 0,
    icon: '🌦️',
  },
  {
    id: 'frost',
    name: 'Crisp frost',
    description: 'Cold stone and steel set extra firm.',
    upperNeed: 0,
    materialMods: { stone: 1, steel: 1 },
    stabilityTargetBonus: 5,
    wind: 0,
    icon: '❄️',
  },
  {
    id: 'heat',
    name: 'Heatwave',
    description: 'Steel softens a touch in the sun.',
    upperNeed: 0,
    materialMods: { steel: -1 },
    stabilityTargetBonus: 0,
    wind: 0,
    icon: '🔥',
  },
];
