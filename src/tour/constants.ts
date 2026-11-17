/** Numbers you may want to tweak, in one place. */

/** Anthony's height in metres. Placeholder until Anton sends his real height. The billboard is scaled to this. */
export const ANTHONY_HEIGHT_M = 1.78;

/** Blender exports light power as W × 683 lm/W, far too bright for three.js. Every light_* is divided by this. */
export const LIGHT_SCALE = 683;

/** Camera eye level is set by the Blender empties (1.6 m). Slight downward tilt while walking, in radians. */
export const WALK_PITCH = -0.03;

/** Walking speed in metres per second, and the shortest / longest glide in seconds. */
export const WALK_SPEED = 4.5;
export const GLIDE_MIN_S = 1.3;
export const GLIDE_MAX_S = 4.6;

/** Wheel / trackpad: one stop per gesture, then ignore input for this long. */
export const STEP_LOCK_MS = 700;

/** Where the KTX2 (Basis) transcoder lives, relative to the page. Only fetched if a GLB uses KTX2 textures. */
export const BASIS_PATH = 'basis/';
