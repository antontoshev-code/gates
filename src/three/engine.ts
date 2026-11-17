/**
 * The full 3D tier: loads the Blender exports, glides the camera along the fixed paths,
 * keeps Anthony's billboard facing you, and tells the HTML layer where things are on screen.
 * Renders only when something moves.
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, FogExp2, HemisphereLight, Vector3, Vector2, Raycaster,
  TextureLoader, SRGBColorSpace, type Light, ACESFilmicToneMapping, LoadingManager, Object3D, Texture, MathUtils,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { gsap } from 'gsap';
import { SceneMap } from './scene-map';
import { Anthony } from './anthony';
import type { Renderer, RoutePoint, TourData, WorldId, Pose, ScreenPoint } from '../tour/types';
import { POSES } from '../tour/types';

const BG = '#0a0c14';
const TINT: Record<'threshold' | WorldId, [string, number]> = {
  threshold: ['#ffffff', 0],
  human: ['#ffb27a', 0.16],
  tech: ['#a9b6ff', 0.16],
};
const EYE_PITCH = -0.03;
const LIGHT_SCALE = 683;

type View = { pos: Vector3; yaw: number; pitch: number };

function yawPitch(from: Vector3, to: Vector3) {
  const d = to.clone().sub(from);
  return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)) };
}
function angleLerp(a: number, b: number, k: number) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}
const smooth = (a: number, b: number, x: number) => { const t = MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class ThreeRenderer implements Renderer {
  onFrame = () => {};
  onPick = (_key: string) => {};

  private gl!: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(58, 1, 0.05, 200);
  private map!: SceneMap;
  private anthony!: Anthony;
  private dirty = true;
  private raycaster = new Raycaster();
  private pointer = new Vector2();
  private pickables: Object3D[] = [];
  private hoverPending = false;
  private sides: Record<'left' | 'right', WorldId>;

  constructor(private canvas: HTMLCanvasElement, private data: TourData) {
    const left = data.worlds.find((w) => w.side === 'left')!.id;
    this.sides = { left, right: left === 'human' ? 'tech' : 'human' };
  }

  async init(onProgress: (share: number) => void) {
    const gl = new WebGLRenderer({ canvas: this.canvas, antialias: window.devicePixelRatio < 2, powerPreference: 'high-performance' });
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    gl.outputColorSpace = SRGBColorSpace;
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
    this.gl = gl;
    this.scene.background = new Color(BG);
    this.scene.fog = new FogExp2(BG, 0.03);
    this.scene.add(new HemisphereLight('#8f9ad0', '#2a1d14', 0.7));

    const manager = new LoadingManager();
    manager.onProgress = (_u, loaded, total) => onProgress(loaded / total);
    const loader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);
    const tl = new TextureLoader(manager);
    const urls = [...new Set(POSES.map((p) => this.data.anthony[p]))];
    const [gltfs, texList] = await Promise.all([
      Promise.all(['threshold', 'human', 'tech'].map((n) => loader.loadAsync(`3d/${n}.glb`))),
      Promise.all(urls.map((u) => tl.loadAsync(u))),
    ]);
    const tex = new Map<string, Texture>(urls.map((u, i) => [u, texList[i]]));
    tex.forEach((t) => { t.colorSpace = SRGBColorSpace; t.anisotropy = 4; });

    const roots = gltfs.map((g) => g.scene);
    roots.forEach((r) => this.scene.add(r));
    // Blender exports light power in its own units (W × 683 lm/W), far too bright for three.js. Bring them back to scale.
    for (const r of roots) r.traverse((o) => { const l = o as Light; if (l.isLight) l.intensity /= LIGHT_SCALE; });
    this.map = new SceneMap(roots, this.data.stops);
    const missing = this.map.validate();
    if (missing.length) throw new Error(`Scene export is missing: ${missing.join(', ')}`);
    this.map.build();

    const mark = this.map.get('char_anthony_mark_threshold');
    const height = Number(mark.userData?.height_m) || 1.8;
    const textures = Object.fromEntries(POSES.map((p) => [p, tex.get(this.data.anthony[p])!])) as Record<Pose, Texture>;
    this.anthony = new Anthony(textures, height);
    this.scene.add(this.anthony.group);

    for (const r of roots) r.traverse((o) => { if ((o as { isMesh?: boolean }).isMesh && this.map.stopFor(o)) this.pickables.push(o); });
    this.pickables.push(...this.anthony.meshes);

    this.applyView(this.view('threshold'));
    this.anthony.group.position.copy(this.markPos('threshold'));
    this.anthony.setTint(...TINT.threshold);

    this.resize();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { this.dirty = true; });
    this.canvas.addEventListener('pointermove', (e) => this.hover(e));
    this.canvas.addEventListener('click', (e) => this.click(e));
    gl.setAnimationLoop((t) => this.frame(t));
  }

  // ---------- route geometry ----------
  private tOf(world: WorldId, p: RoutePoint) {
    if (p === 'start') return 0;
    if (p === 'exit') return 1;
    const t = this.map.stopT.get(p);
    if (t === undefined) throw new Error(`Stop ${p} is not on the ${world} path`);
    return t;
  }
  private view(id: string): View {
    const pos = this.map.pos(`cam_${id}_pos`);
    const look = this.map.pos(`cam_${id}_look`);
    return { pos, ...yawPitch(pos, look) };
  }
  private markPos(id: string) { return this.map.pos(`char_anthony_mark_${id}`); }
  private applyView(v: View) {
    this.camera.position.copy(v.pos);
    this.camera.rotation.set(v.pitch, v.yaw, 0, 'YXZ');
    this.dirty = true;
  }

  travel(world: WorldId, from: RoutePoint, to: RoutePoint, instant = false): Promise<void> {
    const curve = this.map.paths.get(world)!;
    const id = (p: RoutePoint) => (p === 'start' || p === 'exit' ? 'threshold' : p);
    const tA = this.tOf(world, from), tB = this.tOf(world, to);
    const A = this.view(id(from)), B = this.view(id(to));
    A.pos = curve.getPointAt(tA); B.pos = curve.getPointAt(tB);
    const mA = this.markPos(id(from)), mB = this.markPos(id(to));
    const tint = TINT[id(to) === 'threshold' ? 'threshold' : world];

    if (instant || tA === tB) {
      this.applyView(B);
      this.anthony.group.position.copy(mB);
      this.anthony.group.visible = true;
      this.anthony.setTint(...tint);
      return Promise.resolve();
    }

    const len = curve.getLength() * Math.abs(tB - tA);
    const duration = MathUtils.clamp(len / 4.5, 1.3, 4.6);
    const dir = Math.sign(tB - tA);
    const state = { u: 0 };
    const pos = new Vector3(), tan = new Vector3();
    this.anthony.setPose('walk');
    this.anthony.setTint(...TINT[world]);

    return new Promise((resolve) => {
      gsap.to(state, {
        u: 1,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          const u = state.u;
          const t = tA + (tB - tA) * u;
          curve.getPointAt(t, pos);
          curve.getTangentAt(MathUtils.clamp(t, 0.0005, 0.9995), tan).multiplyScalar(dir);
          const yawF = Math.atan2(-tan.x, -tan.z);
          const s1 = smooth(0, 0.3, u), s2 = smooth(0.7, 1, u);
          this.camera.position.copy(pos);
          this.camera.rotation.set(
            MathUtils.lerp(MathUtils.lerp(A.pitch, EYE_PITCH, s1), B.pitch, s2),
            angleLerp(angleLerp(A.yaw, yawF, s1), B.yaw, s2),
            0,
            'YXZ',
          );
          // Anthony glides to his next mark with a small walking bob
          const k = smooth(0.05, 0.95, u);
          this.anthony.group.position.lerpVectors(mA, mB, k);
          this.anthony.setBob((u * len) / 0.75, true);
          // never let the camera walk through him
          const a = this.anthony.group.position;
          this.anthony.group.visible = Math.hypot(a.x - pos.x, a.z - pos.z) > 1.4;
          this.dirty = true;
        },
        onComplete: () => {
          this.anthony.setBob(0, false);
          this.anthony.group.visible = true;
          this.anthony.setTint(...tint);
          this.dirty = true;
          resolve();
        },
      });
    });
  }

  // ---------- screen positions for the HTML layer ----------
  private project(p: Vector3): ScreenPoint | null {
    const cam = p.clone().applyMatrix4(this.camera.matrixWorldInverse);
    if (cam.z > -0.2) return null;
    const v = p.clone().project(this.camera);
    if (Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) return null;
    const r = this.canvas.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width + r.left, y: (-v.y * 0.5 + 0.5) * r.height + r.top };
  }
  anchor(key: string) {
    if (!this.map) return null;
    if (key.startsWith('gate:')) {
      const side = this.sides.left === key.slice(5) ? 'left' : 'right';
      const c = this.map.centre(`env_threshold_${side}_gate`);
      c.y = Math.min(c.y, 1.15);
      return this.project(c);
    }
    return this.project(this.map.pos(`ui_anchor_${key}`));
  }
  head() {
    if (!this.anthony?.group.visible) return null;
    return this.project(this.anthony.group.position.clone().add(new Vector3(0, this.anthony.height + 0.12, 0)));
  }
  setPose(p: Pose) { this.anthony?.setPose(p); this.dirty = true; }
  pointPose(stopId: string): Pose {
    const a = this.anchor(stopId);
    const h = this.project(this.anthony.group.position.clone().add(new Vector3(0, this.anthony.height * 0.7, 0)));
    if (!a || !h) return 'welcome';
    return a.x < h.x ? 'point_left' : 'point_right';
  }

  // ---------- picking ----------
  private pick(e: PointerEvent | MouseEvent): string | null {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.pickables, false).find((h) => h.object.visible && (h.object.name !== 'anthony' || this.anthony.group.visible));
    if (!hit) return null;
    if (hit.object.name === 'anthony') return 'anthony';
    const k = this.map.stopFor(hit.object);
    if (k === 'gate:left') return `gate:${this.sides.left}`;
    if (k === 'gate:right') return `gate:${this.sides.right}`;
    return k;
  }
  private hover(e: PointerEvent) {
    if (this.hoverPending || e.pointerType === 'touch') return;
    this.hoverPending = true;
    requestAnimationFrame(() => {
      this.hoverPending = false;
      const k = this.pick(e);
      const usable = k && (k === 'anthony' || k.startsWith('gate:') ? true : document.body.dataset.world === this.data.stops.find((s) => s.id === k)?.world);
      this.canvas.style.cursor = usable ? 'pointer' : '';
    });
  }
  private click(e: MouseEvent) {
    const k = this.pick(e);
    if (!k) return;
    const place = document.body.dataset.place;
    if (k.startsWith('gate:') && place !== 'threshold') return;
    const stop = this.data.stops.find((s) => s.id === k);
    if (stop && document.body.dataset.world !== stop.world) return;
    this.onPick(k);
  }

  // ---------- loop ----------
  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the scene readable on tall screens
    this.camera.fov = w / h < 1 ? 70 : 58;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }
  private frame(now: number) {
    if (document.hidden) return;
    const fading = this.anthony.update(this.camera, now);
    if (!this.dirty && !fading) return;
    this.dirty = false;
    this.camera.updateMatrixWorld();
    this.gl.render(this.scene, this.camera);
    this.onFrame();
  }
}
