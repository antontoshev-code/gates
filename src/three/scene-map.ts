/**
 * Turns the Blender exports into named things the walk can use.
 * Positions come only from here. Copy comes only from src/content.
 */
import { Object3D, Vector3, Box3, CatmullRomCurve3 } from 'three';
import type { StopData, WorldId } from '../tour/types';

export class SceneMap {
  byName = new Map<string, Object3D>();
  paths = new Map<WorldId, CatmullRomCurve3>();
  /** Arc-length position (0..1) of each stop on its world's path. */
  stopT = new Map<string, number>();

  constructor(private stops: StopData[]) {}

  /** Add a loaded GLB root (threshold, human or tech). */
  add(root: Object3D) {
    root.updateMatrixWorld(true);
    root.traverse((o) => { if (o.name) this.byName.set(o.name, o); });
  }

  get(name: string): Object3D {
    const o = this.byName.get(name);
    if (!o) throw new Error(`Scene is missing "${name}"`);
    return o;
  }
  pos(name: string): Vector3 { return this.get(name).getWorldPosition(new Vector3()); }

  /** Same contract as scripts/validate-scene.mjs, checked again at runtime so a stale export can't half-load. */
  missing(part: 'threshold' | WorldId): string[] {
    const out: string[] = [];
    const need = (n: string) => { if (!this.byName.has(n)) out.push(n); };
    const ids = part === 'threshold' ? ['threshold'] : this.stops.filter((s) => s.world === part).map((s) => s.id);
    for (const id of ids) { need(`cam_${id}_pos`); need(`cam_${id}_look`); need(`char_anthony_mark_${id}`); need(`ui_anchor_${id}`); }
    if (part === 'threshold') { need('env_threshold_left_gate'); need('env_threshold_right_gate'); }
    else { need(`cam_${part}_path_01`); need(`cam_${part}_path_02`); }
    return out;
  }

  /** Build a world's camera path and find where each stop sits on it. */
  buildWorld(w: WorldId) {
    const pts: Vector3[] = [];
    for (let i = 1; this.byName.has(`cam_${w}_path_${String(i).padStart(2, '0')}`); i++) pts.push(this.pos(`cam_${w}_path_${String(i).padStart(2, '0')}`));
    const curve = new CatmullRomCurve3(pts, false, 'centripetal');
    curve.arcLengthDivisions = 600;
    this.paths.set(w, curve);
    const samples = 800;
    const probe = new Vector3();
    for (const s of this.stops.filter((x) => x.world === w)) {
      const target = this.pos(`cam_${s.id}_pos`);
      let best = 0, bestD = Infinity;
      for (let i = 0; i <= samples; i++) {
        const d = curve.getPointAt(i / samples, probe).distanceToSquared(target);
        if (d < bestD) { bestD = d; best = i / samples; }
      }
      this.stopT.set(s.id, best);
    }
  }

  /** Centre of an object's bounds, e.g. the middle of a gate. */
  centre(name: string): Vector3 {
    return new Box3().setFromObject(this.get(name)).getCenter(new Vector3());
  }

  /** The int_<stop>_* object a mesh belongs to, if any. */
  stopFor(o: Object3D | null): string | null {
    for (let n = o; n; n = n.parent) {
      if (n.name.startsWith('int_')) {
        const s = this.stops.find((x) => n!.name.startsWith(`int_${x.id}_`));
        if (s) return s.id;
      }
      if (n.name === 'env_threshold_left_gate') return 'gate:left';
      if (n.name === 'env_threshold_right_gate') return 'gate:right';
    }
    return null;
  }
}
