/** Gate canvas: warm drifting light on the People side, a reactive pixel grid on the Technology side. */
export function initGateFx() {
  const gate = document.getElementById('gate-split');
  const cv = document.getElementById('fx') as HTMLCanvasElement | null;
  if (!gate || !cv) return;
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  const people = gate.querySelector<HTMLElement>('.people')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, mx = -999, my = -999, running = false, raf = 0;
  const t0 = performance.now();

  const size = () => {
    const r = gate.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!running) draw(performance.now());
  };

  gate.addEventListener('pointermove', (e) => {
    const r = gate.getBoundingClientRect();
    mx = e.clientX - r.left; my = e.clientY - r.top;
  });
  gate.addEventListener('pointerleave', () => { mx = my = -999; });

  const blobs: [number, number, number, string][] = [
    [0.3, 0.35, 0.55, '255,106,61'],
    [0.7, 0.75, 0.45, '255,160,120'],
    [0.15, 0.85, 0.4, '200,60,90'],
  ];

  function draw(now: number) {
    const t = (now - t0) / 1000;
    const stacked = innerWidth <= 720;
    const pr = people.getBoundingClientRect();
    const sx = pr.width;
    ctx!.fillStyle = '#07080c';
    ctx!.fillRect(0, 0, W, H);

    // People: warm light
    const pw = stacked ? W : sx, ph = stacked ? pr.height : H;
    ctx!.save(); ctx!.beginPath(); ctx!.rect(0, 0, pw, ph); ctx!.clip();
    blobs.forEach((b, k) => {
      let x = pw * (b[0] + 0.08 * Math.sin(t * 0.35 + k * 2));
      let y = ph * (b[1] + 0.08 * Math.cos(t * 0.3 + k));
      const r = Math.max(pw, ph) * b[2];
      if (mx > -999 && mx < pw && my < ph) { x += (mx - x) * 0.1; y += (my - y) * 0.1; }
      const g = ctx!.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${b[3]},.42)`); g.addColorStop(1, `rgba(${b[3]},0)`);
      ctx!.fillStyle = g; ctx!.fillRect(0, 0, pw, ph);
    });
    ctx!.restore();

    // Technology: pixel grid
    const ox = stacked ? 0 : sx, oy = stacked ? ph : 0, tw = stacked ? W : W - sx, th = stacked ? H - ph : H, s = 16;
    ctx!.save(); ctx!.beginPath(); ctx!.rect(ox, oy, tw, th); ctx!.clip();
    for (let x = ox + 4; x < ox + tw; x += s) {
      for (let y = oy + 4; y < oy + th; y += s) {
        const wave = 0.5 + 0.5 * Math.sin(x * 0.012 + y * 0.018 - t * 1.2);
        const near = Math.max(0, 1 - Math.hypot(x - mx, y - my) / 170);
        const a = 0.05 + 0.16 * wave * wave + 0.75 * near;
        ctx!.fillStyle = `rgba(113,130,255,${a.toFixed(3)})`;
        const sz = near > 0.4 ? s - 5 : s - 9;
        ctx!.fillRect(x, y, sz, sz);
      }
    }
    ctx!.restore();
  }

  const loop = (now: number) => { draw(now); raf = requestAnimationFrame(loop); };
  const start = () => { if (reduce || running) return; running = true; raf = requestAnimationFrame(loop); };
  const stop = () => { running = false; cancelAnimationFrame(raf); };

  // Only animate while the gate is on screen.
  new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(gate);
  new ResizeObserver(size).observe(gate);
  size();
}
