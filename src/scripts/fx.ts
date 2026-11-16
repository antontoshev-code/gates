/** 2D overlay: the firefly that follows you, plus ambient embers, sparkles and data motes. */

export type FxMode = 'gate' | 'people' | 'technology';

type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; kind: 'ember' | 'spark' | 'mote' | 'fly' };

export class Fx {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  mode: FxMode = 'gate';
  W = 0;
  H = 0;
  ps: P[] = [];
  fly = { x: 0, y: 0, tx: 0, ty: 0, trail: [] as { x: number; y: number }[] };
  pointer: { x: number; y: number } | null = null;
  idleAnchor: () => [number, number] = () => [this.W / 2, this.H * 0.42];
  private last = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    this.fly.x = this.fly.tx = this.W / 2;
    this.fly.y = this.fly.ty = this.H * 0.42;
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.W = innerWidth;
    this.H = innerHeight;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private spawn() {
    const { W, H } = this;
    const r = Math.random;
    if (this.mode === 'gate') {
      if (r() < 0.5) this.ps.push({ x: r() * W * 0.45, y: H * (0.6 + r() * 0.35), vx: (r() - 0.5) * 0.2, vy: -0.3 - r() * 0.5, life: 0, max: 200 + r() * 200, size: 1 + r() * 1.8, kind: 'ember' });
      else this.ps.push({ x: W * (0.55 + r() * 0.45), y: r() * H * 0.8, vx: 0, vy: -0.05, life: 0, max: 120 + r() * 160, size: 0.6 + r() * 1.6, kind: 'spark' });
    } else if (this.mode === 'people') {
      this.ps.push({ x: r() * W, y: H * (0.3 + r() * 0.7), vx: (r() - 0.5) * 0.4, vy: -0.15 - r() * 0.3, life: 0, max: 260 + r() * 260, size: 1.2 + r() * 2.2, kind: r() < 0.6 ? 'fly' : 'ember' });
    } else {
      this.ps.push({ x: r() * W, y: H * (0.2 + r() * 0.8), vx: 0, vy: -0.2 - r() * 0.4, life: 0, max: 200 + r() * 220, size: 2 + Math.floor(r() * 3), kind: 'mote' });
    }
  }

  frame(now: number) {
    const dt = Math.min(3, (now - this.last) / 16.7);
    this.last = now;
    const { ctx, W, H } = this;
    ctx.clearRect(0, 0, W, H);
    const cap = this.mode === 'gate' ? 90 : 70;
    if (this.ps.length < cap && Math.random() < 0.7) this.spawn();

    ctx.globalCompositeOperation = 'lighter';
    this.ps = this.ps.filter((p) => {
      p.life += dt;
      p.x += (p.vx + Math.sin((p.life + p.y) * 0.02) * 0.15) * dt;
      p.y += p.vy * dt;
      const k = p.life / p.max;
      const a = Math.sin(Math.min(1, k) * Math.PI);
      if (p.kind === 'ember') {
        ctx.fillStyle = `rgba(255,${140 + Math.floor(60 * (1 - k))},70,${0.8 * a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.283); ctx.fill();
      } else if (p.kind === 'fly') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
        g.addColorStop(0, `rgba(255,220,140,${0.9 * a})`); g.addColorStop(1, 'rgba(255,180,90,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 5, 0, 6.283); ctx.fill();
      } else if (p.kind === 'spark') {
        const tw = 0.5 + 0.5 * Math.sin(p.life * 0.2 + p.x);
        ctx.fillStyle = `rgba(${150 + Math.floor(80 * tw)},170,255,${0.85 * a * tw})`;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size * 2, p.size, p.size * 4);
        ctx.fillRect(p.x - p.size * 2, p.y - p.size / 2, p.size * 4, p.size);
      } else {
        ctx.fillStyle = `rgba(130,150,255,${0.55 * a})`;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      return p.life < p.max && p.y > -20;
    });

    // the firefly
    const f = this.fly;
    if (this.pointer) { f.tx = this.pointer.x + 26; f.ty = this.pointer.y - 22; }
    else {
      const [ax, ay] = this.idleAnchor();
      f.tx = ax + Math.sin(now * 0.0011) * 34;
      f.ty = ay + Math.cos(now * 0.0017) * 22;
    }
    f.x += (f.tx - f.x) * 0.045 * dt;
    f.y += (f.ty - f.y) * 0.045 * dt + Math.sin(now * 0.006) * 0.35;
    f.trail.unshift({ x: f.x, y: f.y });
    if (f.trail.length > 26) f.trail.pop();
    f.trail.forEach((pt, i) => {
      if (i % 3) return;
      ctx.fillStyle = `rgba(255,214,120,${0.5 * (1 - i / 26)})`;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.6 * (1 - i / 30), 0, 6.283); ctx.fill();
    });
    const pulse = 0.75 + 0.25 * Math.sin(now * 0.008);
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 26);
    g.addColorStop(0, `rgba(255,236,170,${pulse})`);
    g.addColorStop(0.25, `rgba(255,190,90,${0.45 * pulse})`);
    g.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, 26, 0, 6.283); ctx.fill();
    // wings
    ctx.globalCompositeOperation = 'source-over';
    const flap = Math.sin(now * 0.05) * 0.5 + 0.5;
    ctx.fillStyle = 'rgba(230,240,255,0.55)';
    ctx.beginPath(); ctx.ellipse(f.x - 4, f.y - 5, 4, 2 + flap * 2, -0.6, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.ellipse(f.x + 4, f.y - 5, 4, 2 + flap * 2, 0.6, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ffd77a';
    ctx.beginPath(); ctx.arc(f.x, f.y, 2.6, 0, 6.283); ctx.fill();
  }
}
