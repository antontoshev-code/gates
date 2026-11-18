/**
 * Anthony as a photo billboard: a flat cut-out that turns around its vertical axis to face you.
 * Poses are separate photos, swapped with a short crossfade. A soft blob shadow grounds him.
 * Swap this class for a char_anthony GLB later; the walk only calls the methods below.
 */
import {
  Group, Mesh, PlaneGeometry, MeshBasicMaterial, Texture, CanvasTexture, Color, SRGBColorSpace, Vector3, Camera, DoubleSide,
} from 'three';
import type { Pose } from '../tour/types';

const FADE_MS = 260;

export class Anthony {
  group = new Group();
  private a: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private b: Mesh<PlaneGeometry, MeshBasicMaterial>;
  private shadow: Mesh;
  private pose: Pose = 'welcome';
  private fadeStart = -1;
  private bob = 0;
  readonly height: number;

  constructor(private textures: Record<Pose, Texture>, height = 1.8) {
    this.height = height;
    const img = textures.welcome.image as { width: number; height: number };
    const w = height * (img.width / img.height);
    const geo = new PlaneGeometry(w, height);
    geo.translate(0, height / 2, 0);
    const mat = () => new MeshBasicMaterial({ transparent: true, alphaTest: 0.04, depthWrite: false, side: DoubleSide, toneMapped: false, fog: false });
    this.a = new Mesh(geo, mat());
    this.b = new Mesh(geo, mat());
    this.a.material.map = textures.welcome;
    this.b.material.map = textures.welcome;
    this.b.material.opacity = 0;
    this.a.renderOrder = 10;
    this.b.renderOrder = 11;
    this.a.name = this.b.name = 'anthony';

    // soft blob shadow on the ground
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const st = new CanvasTexture(c);
    st.colorSpace = SRGBColorSpace;
    this.shadow = new Mesh(new PlaneGeometry(w * 0.9, w * 0.45), new MeshBasicMaterial({ map: st, transparent: true, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = 9;

    this.group.add(this.shadow, this.a, this.b);
    this.group.name = 'char_anthony';
  }

  get meshes() { return [this.a, this.b]; }

  /** Crossfade to another pose photo. Returns true while a fade still needs frames. */
  setPose(p: Pose) {
    if (p === this.pose) return;
    this.pose = p;
    const next = this.textures[p];
    if (next === this.a.material.map) return; // same photo: nothing to fade
    this.b.material.map = next;
    this.b.material.needsUpdate = true;
    this.b.material.opacity = 0;
    this.fadeStart = performance.now();
  }

  /** Subtle world-colour tint so he sits in the light of the place. */
  setTint(hex: string, amount: number) {
    const c = new Color(0xffffff).lerp(new Color(hex), amount);
    this.a.material.color.copy(c);
    this.b.material.color.copy(c);
  }

  /** Walking bob, 0..1 phase. */
  setBob(phase: number, on: boolean) {
    this.bob = on ? Math.abs(Math.sin(phase * Math.PI)) * 0.035 : 0;
  }

  /** Face the camera (vertical axis only). Returns true if a crossfade is still running. */
  update(camera: Camera, now: number): boolean {
    const p = this.group.position;
    const cp = camera.getWorldPosition(new Vector3());
    const yaw = Math.atan2(cp.x - p.x, cp.z - p.z);
    this.a.rotation.y = this.b.rotation.y = yaw;
    this.a.position.y = this.b.position.y = this.bob;
    if (this.fadeStart < 0) return false;
    const k = Math.min(1, (now - this.fadeStart) / FADE_MS);
    this.b.material.opacity = k;
    this.a.material.opacity = 1 - k;
    if (k >= 1) {
      this.a.material.map = this.b.material.map;
      this.a.material.needsUpdate = true;
      this.a.material.opacity = 1;
      this.b.material.opacity = 0;
      this.fadeStart = -1;
      return false;
    }
    return true;
  }
}
