/** Shared types for the guided walk. Words come from src/content, positions from the Blender exports. */

export type WorldId = 'human' | 'tech';
export type Tier = '3d' | '25d' | 'plain';
export type Pose = 'welcome' | 'point_left' | 'point_right' | 'listen' | 'walk';
export const POSES: Pose[] = ['welcome', 'point_left', 'point_right', 'listen', 'walk'];

/** Where you can stand on a world's route: its start (the threshold), one of its stops, or its exit (back at the threshold). */
export type RoutePoint = 'start' | 'exit' | string;

export interface StopData {
  id: string;
  world: WorldId;
  order: number;
  title: string;
  place: string;
  say: string;
  picture: string;
}

export interface WorldData {
  id: WorldId;
  label: string;
  gate: string;
  hint: string;
  side: 'left' | 'right';
}

export interface DialogueData {
  greeting: string[];
  returning: string[];
  lookAround: string;
  entries: Record<WorldId, string>;
  exits: Record<WorldId, string>;
  choices: { look: string; ask: string };
}

export interface TourData {
  stops: StopData[];
  worlds: WorldData[];
  dialogue: DialogueData;
  faq: { q: string; a: string }[];
  /** Pose name → image URL. Several poses may share one photo until the real shots exist. */
  anthony: Record<Pose, string>;
}

export interface ScreenPoint { x: number; y: number }

/** What the tour needs from a renderer (3D scene or 2.5D pictures). */
export interface Renderer {
  init(onProgress: (share: number) => void): Promise<void>;
  /** Move along `world`'s route. Resolves when the camera has settled. */
  travel(world: WorldId, from: RoutePoint, to: RoutePoint, instant?: boolean): Promise<void>;
  /** Screen position of a stop's ui_anchor or a gate ('gate:human'), or null when not visible / not available. */
  anchor(key: string): ScreenPoint | null;
  /** Screen position just above Anthony's head, or null. */
  head(): ScreenPoint | null;
  setPose(pose: Pose): void;
  /** Start loading a world early (on gate hover or focus). Safe to call many times. */
  prepare(world: WorldId): Promise<void>;
  /** Optional hover state for a gate in the scene. */
  highlightGate?(world: WorldId | null): void;
  /** Which way Anthony should point at this stop, from where its anchor sits on screen. */
  pointPose(stopId: string): Pose;
  /** Called after every rendered frame where something moved, so the HTML layer can follow. */
  onFrame: () => void;
  /** Called when a 3D object is clicked: a stop id, 'gate:human', 'gate:tech' or 'anthony'. */
  onPick: (key: string) => void;
}
