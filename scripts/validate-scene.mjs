#!/usr/bin/env node
/**
 * Checks that the Blender exports and the stop files agree, before every build.
 *
 * Fails when:
 * - a stop file is missing one of its empties (cam_<stop>_pos, cam_<stop>_look, char_anthony_mark_<stop>, ui_anchor_<stop>)
 * - an empty or int_ object names a stop that has no file in src/content/stops
 * - a world has no camera path (cam_<world>_path_01, _02, …) or the path skips a number
 * - an object name uses a prefix outside the naming contract
 * - a stop file contains coordinates
 *
 * Usage: node scripts/validate-scene.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const GLB_DIR = join(root, 'public/3d');
const STOP_DIR = join(root, 'src/content/stops');
const WORLDS = { human: 'human.glb', tech: 'tech.glb' };
const PREFIXES = ['world_', 'env_', 'int_', 'cam_', 'char_anthony_mark_', 'ui_anchor_', 'light_'];

const errors = [];
const fail = (msg) => errors.push(msg);

/** Node names from a .glb, read straight from its JSON chunk (no decoding needed). */
function nodeNames(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${basename(path)} is not a .glb file`);
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
  return (json.nodes || []).map((n) => n.name).filter(Boolean);
}

/** Minimal front matter reader: top-level keys and the world value. */
function readStop(file) {
  const text = readFileSync(join(STOP_DIR, file), 'utf8');
  const fm = text.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { fail(`${file}: no front matter`); return null; }
  const keys = [...fm[1].matchAll(/^([A-Za-z_][\w-]*):/gm)].map((m) => m[1]);
  const world = fm[1].match(/^world:\s*(\w+)/m)?.[1];
  const order = Number(fm[1].match(/^order:\s*(\d+)/m)?.[1]);
  const coords = keys.filter((k) => /^(x|y|z|pos|position|coords?|look|target|rotation|camera)$/i.test(k));
  if (coords.length) fail(`${file}: coordinates don't belong in content (${coords.join(', ')}). They come from the Blender empties.`);
  return { id: basename(file, '.md'), world, order };
}

const stops = readdirSync(STOP_DIR).filter((f) => f.endsWith('.md')).map(readStop).filter(Boolean);

for (const s of stops) {
  if (s.world === 'threshold') { if (s.id !== 'threshold') fail(`${s.id}.md: only threshold.md can use world: threshold`); continue; }
  if (!WORLDS[s.world]) fail(`${s.id}.md: world must be one of ${Object.keys(WORLDS).join(', ')}`);
}
for (const w of Object.keys(WORLDS)) {
  const orders = stops.filter((s) => s.world !== 'threshold').filter((s) => s.world === w).map((s) => s.order).sort((a, b) => a - b);
  orders.forEach((o, i) => { if (o !== i + 1) fail(`world ${w}: stop orders should be 1..${orders.length}, got ${orders.join(', ')}`); });
}

const required = (id) => [`cam_${id}_pos`, `cam_${id}_look`, `char_anthony_mark_${id}`, `ui_anchor_${id}`];

function checkNames(file, names, known) {
  for (const n of names) {
    if (!PREFIXES.some((p) => n.startsWith(p))) fail(`${file}: "${n}" is outside the naming contract (${PREFIXES.join(' ')})`);
    let m;
    if ((m = n.match(/^cam_(.+)_(pos|look)$/)) && !known.has(m[1])) fail(`${file}: "${n}" points at stop "${m[1]}", which has no file in src/content/stops`);
    if ((m = n.match(/^char_anthony_mark_(.+)$/)) && !known.has(m[1])) fail(`${file}: "${n}" points at stop "${m[1]}", which has no file`);
    if ((m = n.match(/^ui_anchor_(.+)$/)) && !known.has(m[1])) fail(`${file}: "${n}" points at stop "${m[1]}", which has no file`);
    if (n.startsWith('int_') && ![...known].some((id) => n.startsWith(`int_${id}_`))) fail(`${file}: "${n}" should be int_<stop>_<thing> for a stop that exists`);
  }
}

// threshold
let names;
try { names = nodeNames(join(GLB_DIR, 'threshold.glb')); } catch (e) { fail(`threshold.glb: ${e.message}`); names = []; }
if (!stops.some((s) => s.id === 'threshold')) fail('src/content/stops/threshold.md is missing');
const thresholdKnown = new Set(['threshold']);
for (const n of [...required('threshold'), 'env_threshold_left_gate', 'env_threshold_right_gate']) {
  if (!names.includes(n)) fail(`threshold.glb: missing "${n}"`);
}
checkNames('threshold.glb', names, thresholdKnown);

// worlds
for (const [world, file] of Object.entries(WORLDS)) {
  let wn;
  try { wn = nodeNames(join(GLB_DIR, file)); } catch (e) { fail(`${file}: ${e.message}`); continue; }
  const mine = stops.filter((s) => s.world === world);
  for (const s of mine) for (const n of required(s.id)) if (!wn.includes(n)) fail(`${file}: stop "${s.id}" needs an empty called "${n}"`);
  const known = new Set(mine.map((s) => s.id));
  checkNames(file, wn, known);
  const path = wn.filter((n) => n.startsWith(`cam_${world}_path_`)).map((n) => Number(n.slice(`cam_${world}_path_`.length))).sort((a, b) => a - b);
  if (path.length < 2) fail(`${file}: needs a camera path cam_${world}_path_01, _02, … (found ${path.length})`);
  path.forEach((p, i) => { if (p !== i + 1) fail(`${file}: camera path skips a number near cam_${world}_path_${String(i + 1).padStart(2, '0')}`); });
  for (const n of wn) if (n.startsWith('cam_') && !n.startsWith(`cam_${world}_path_`) && /_path_/.test(n)) fail(`${file}: "${n}" is a path for another world`);
}

if (errors.length) {
  console.error(`\nScene check failed (${errors.length}):\n` + errors.map((e) => `  ✗ ${e}`).join('\n') + '\n');
  process.exit(1);
}
console.log(`Scene check passed: ${stops.length} stops, threshold + ${Object.keys(WORLDS).length} worlds.`);
