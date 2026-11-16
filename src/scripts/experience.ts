import gsap from 'gsap';
import SplitType from 'split-type';
import { Scene, type Cam } from './scene';
import { Fx } from './fx';

type Mode = 'gate' | 'people' | 'technology';
type World = Exclude<Mode, 'gate'>;
type Stop = { id: string; world: World; x: number; y: number; place: string; panel: HTMLElement; hot: HTMLElement };

/** Where things are in each picture (0–1 image coordinates). */
const GATES = {
  wide: { people: { x: 0.25, y: 0.5 }, technology: { x: 0.72, y: 0.5 }, label: { people: [0.27, 0.25], technology: [0.74, 0.27] } },
  tall: { people: { x: 0.24, y: 0.53 }, technology: { x: 0.73, y: 0.55 }, label: { people: [0.25, 0.34], technology: [0.76, 0.37] } },
} as const;
const SRC = { wide: 'scenes/gate-wide.jpg', tall: 'scenes/gate-tall.jpg' };

export function initExperience() {
  const root = document.documentElement;
  const body = document.body;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const D = (s: number) => (reduce ? 0 : s);
  if (coarse) body.classList.add('touch');

  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const fxCanvas = document.getElementById('fx') as HTMLCanvasElement;
  const loader = document.getElementById('loader')!;
  const loadN = document.getElementById('load-n')!;

  let scene: Scene;
  try {
    scene = new Scene(canvas);
  } catch {
    // No WebGL: fall back to the calm, readable version.
    root.classList.replace('js', 'no-js');
    return;
  }
  const fx = new Fx(fxCanvas);

  // ---------- stops ----------
  const stops: Stop[] = [...document.querySelectorAll<HTMLElement>('.panel')].map((panel) => ({
    id: panel.dataset.stop!,
    world: panel.dataset.world as World,
    x: Number(panel.dataset.x),
    y: Number(panel.dataset.y),
    place: panel.querySelector('header .px')?.textContent?.split('·').pop()?.trim() ?? '',
    panel,
    hot: document.querySelector<HTMLElement>(`.hot[data-stop="${panel.dataset.stop}"]`)!,
  }));
  const inWorld = (w: World) => stops.filter((s) => s.world === w);

  // ---------- state ----------
  let mode: Mode = 'gate';
  let idx = 0;
  let busy = false;
  const gateTex = () => (innerWidth / innerHeight < 0.9 ? 'tall' : 'wide');
  const portrait = () => innerWidth <= 820 || innerWidth / innerHeight < 0.9;

  function stopCam(s: Stop): Cam {
    const zoom = portrait() ? (innerWidth / innerHeight < 0.9 ? 1.25 : 1.9) : 2.2;
    const probe: Cam = { x: s.x, y: s.y, zoom };
    const [vw, vh] = scene.view(probe);
    // keep the spot clear of the panel: left of it on desktop, above it on phones
    return portrait() ? { x: s.x, y: s.y + 0.22 * vh, zoom } : { x: s.x + 0.16 * vw, y: s.y, zoom };
  }

  // ---------- UI helpers ----------
  const dots = document.getElementById('dots')!;
  function buildDots(w: World) {
    dots.innerHTML = '';
    inWorld(w).forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s.place;
      b.setAttribute('aria-label', s.place);
      b.addEventListener('click', () => goStop(i));
      dots.appendChild(b);
    });
  }
  function markDots() {
    [...dots.children].forEach((b, i) => b.setAttribute('aria-current', String(i === idx)));
    (dots.children[idx] as HTMLElement | undefined)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  const splitDone = new WeakSet<Element>();
  function showPanel(s: Stop | null) {
    stops.forEach((x) => { x.panel.classList.toggle('on', x === s); x.hot.classList.toggle('active', x === s); });
    if (!s) return;
    s.panel.scrollTop = 0;
    if (reduce) return;
    const title = s.panel.querySelector<HTMLElement>('.ptitle');
    if (title && !splitDone.has(title)) { splitDone.add(title); new SplitType(title, { types: 'words' }); }
    gsap.fromTo(s.panel, { opacity: 0, y: 24, rotateX: 8, transformPerspective: 900 }, { opacity: 1, y: 0, rotateX: 0, duration: 0.8, ease: 'power3.out' });
    if (title) gsap.fromTo(title.querySelectorAll('.word'), { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, stagger: 0.05, duration: 0.8, ease: 'expo.out', delay: 0.1 });
    gsap.fromTo(s.panel.querySelectorAll('.sum, .more, .btn, .slip, .steps, .brief, .started'), { y: 14, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.06, duration: 0.7, ease: 'power3.out', delay: 0.2 });
  }

  function setHash(h: string) { try { history.replaceState(null, '', `#${h}`); } catch { /* ignore */ } }

  // ---------- moves ----------
  function tweenCam(to: Cam, dur: number, ease: string, extra: gsap.TweenVars = {}) {
    return gsap.to(scene.cam, { ...to, duration: D(dur), ease, ...extra });
  }

  async function enter(w: World, i = 0) {
    if (busy) return;
    if (mode === w) { goStop(i); return; }
    busy = true;
    closeMenu();
    if (mode !== 'gate') await leave(true);
    const g = GATES[gateTex()][w];
    // fly through the gate
    await Promise.all([
      tweenCam({ x: g.x, y: g.y, zoom: 3.4 }, 1.25, 'power2.in'),
      gsap.to(scene, { blur: 0.7, bright: 1.7, tint: w === 'people' ? -1 : 1, duration: D(1.25), ease: 'power2.in' }),
    ]);
    mode = w;
    body.dataset.mode = w;
    fx.mode = w;
    scene.use('wide');
    idx = Math.max(0, Math.min(inWorld(w).length - 1, i));
    const target = scene.clamp(stopCam(inWorld(w)[idx]));
    scene.cam = { ...target, zoom: target.zoom * 1.6 };
    buildDots(w);
    markDots();
    await Promise.all([
      tweenCam(target, 1.4, 'power3.out'),
      gsap.to(scene, { blur: 0, bright: 1, tint: (w === 'people' ? -0.35 : 0.35), duration: D(1.4), ease: 'power3.out' }),
    ]);
    showPanel(inWorld(w)[idx]);
    setHash(`stop-${inWorld(w)[idx].id}`);
    busy = false;
  }

  async function leave(chained = false) {
    if (mode === 'gate') return;
    if (!chained) { if (busy) return; busy = true; }
    const w = mode as World;
    showPanel(null);
    await Promise.all([
      tweenCam({ ...scene.cam, zoom: scene.cam.zoom * 1.5 }, 0.7, 'power2.in'),
      gsap.to(scene, { blur: 0.7, bright: 1.6, duration: D(0.7), ease: 'power2.in' }),
    ]);
    mode = 'gate';
    body.dataset.mode = 'gate';
    fx.mode = 'gate';
    const tex = gateTex();
    scene.use(tex);
    const g = GATES[tex][w];
    scene.cam = { x: g.x, y: g.y, zoom: 3.4 };
    await Promise.all([
      tweenCam({ x: 0.5, y: 0.5, zoom: 1 }, 1.3, 'power3.out'),
      gsap.to(scene, { blur: 0, bright: 1, tint: 0, duration: D(1.3), ease: 'power3.out' }),
    ]);
    if (!chained) { setHash('gate'); busy = false; }
  }

  async function goStop(i: number) {
    if (mode === 'gate' || busy) return;
    const list = inWorld(mode);
    if (i < 0 || i >= list.length || i === idx) return;
    busy = true;
    idx = i;
    markDots();
    showPanel(null);
    await tweenCam(scene.clamp(stopCam(list[i])), 1.1, 'power3.inOut');
    showPanel(list[i]);
    setHash(`stop-${list[i].id}`);
    busy = false;
  }

  function step(d: number) {
    if (mode === 'gate') { if (d < 0) enter('people'); else enter('technology'); return; }
    const n = idx + d;
    if (n < 0) { if (mode === 'technology') leave(); return; }
    if (n >= inWorld(mode).length) { if (mode === 'people') leave(); return; }
    goStop(n);
  }

  // ---------- routing ----------
  function route(hash: string) {
    const h = hash.replace(/^#/, '');
    if (h === 'people' || h === 'technology') return enter(h);
    if (h === 'gate' || !h) return leave();
    const id = h.replace(/^stop-/, '');
    const s = stops.find((x) => x.id === id);
    if (s) return enter(s.world, inWorld(s.world).indexOf(s));
  }

  document.addEventListener('click', (e) => {
    const a = (e.target as Element)?.closest?.<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    closeMenu();
    route(a.dataset.go ? `#${a.dataset.go}` : a.getAttribute('href')!);
  });
  addEventListener('hashchange', () => route(location.hash));
  document.getElementById('back')!.addEventListener('click', () => leave());
  document.getElementById('prev')!.addEventListener('click', () => step(-1));
  document.getElementById('next')!.addEventListener('click', () => step(1));

  // menu
  const menu = document.getElementById('menu')!;
  const menuBtn = document.getElementById('menu-btn')!;
  function closeMenu() { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open && !reduce) gsap.from(menu.querySelectorAll('a'), { y: 20, opacity: 0, stagger: 0.03, duration: 0.5, ease: 'power3.out' });
  });

  // ---------- input ----------
  const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!menu.hidden) closeMenu(); else leave(); return; }
    if (typing(e.target) || e.altKey || e.metaKey || e.ctrlKey || !menu.hidden) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(1); }
  });

  const canScroll = (el: Element | null, dy: number) => {
    const p = el?.closest?.('.panel, .menu') as HTMLElement | null;
    if (!p) return false;
    return dy > 0 ? p.scrollTop + p.clientHeight < p.scrollHeight - 2 : p.scrollTop > 2;
  };
  let acc = 0, lockUntil = 0;
  addEventListener('wheel', (e) => {
    if (!menu.hidden || canScroll(e.target as Element, e.deltaY)) return;
    if (Date.now() < lockUntil) return;
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (mode === 'gate' && Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical scroll at the gate does nothing
    acc += d;
    if (Math.abs(acc) > 60) { step(acc > 0 ? 1 : -1); acc = 0; lockUntil = Date.now() + 1100; }
  }, { passive: true });

  let tx = 0, ty = 0, tt = 0;
  addEventListener('touchstart', (e) => { const t = e.touches[0]; tx = t.clientX; ty = t.clientY; tt = Date.now(); }, { passive: true });
  addEventListener('touchend', (e) => {
    if (!menu.hidden) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tx, dy = t.clientY - ty;
    const target = e.target as Element;
    if (Date.now() - tt > 800 || target?.closest?.('input, textarea, .dots')) return;
    const inPanel = !!target?.closest?.('.panel');
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
    else if (!inPanel && mode !== 'gate' && Math.abs(dy) > 55) step(dy < 0 ? 1 : -1);
  }, { passive: true });

  addEventListener('pointermove', (e) => {
    scene.parTarget.x = (e.clientX / innerWidth - 0.5) * 2;
    scene.parTarget.y = (e.clientY / innerHeight - 0.5) * 2;
    if (e.pointerType === 'mouse') fx.pointer = { x: e.clientX, y: e.clientY };
  });
  document.addEventListener('pointerleave', () => { fx.pointer = null; });
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null || e.beta == null) return;
    scene.parTarget.x = Math.max(-1, Math.min(1, e.gamma / 25));
    scene.parTarget.y = Math.max(-1, Math.min(1, (e.beta - 45) / 25));
  });

  // gate hover: lean toward the side you're looking at
  document.querySelectorAll<HTMLElement>('.half').forEach((h) => {
    const w = h.classList.contains('left') ? 'people' : 'technology';
    h.addEventListener('pointerenter', () => {
      if (mode !== 'gate' || busy) return;
      const g = GATES[gateTex()][w];
      tweenCam({ x: 0.5 + (g.x - 0.5) * 0.12, y: 0.5, zoom: 1.06 }, 1.2, 'power2.out');
      gsap.to(scene, { tint: w === 'people' ? -0.6 : 0.6, duration: D(1.2) });
    });
    h.addEventListener('pointerleave', () => {
      if (mode !== 'gate' || busy) return;
      tweenCam({ x: 0.5, y: 0.5, zoom: 1 }, 1.2, 'power2.out');
      gsap.to(scene, { tint: 0, duration: D(1.2) });
    });
  });

  // ---------- frame loop ----------
  const labelP = document.getElementById('label-people')!;
  const labelT = document.getElementById('label-tech')!;
  const pill = document.querySelector<HTMLElement>('.pill')!;
  fx.idleAnchor = () => {
    if (mode === 'gate') { const [x, y] = scene.project(0.5, 0.42); return [x, y]; }
    const s = inWorld(mode)[idx];
    const [x, y] = scene.project(s.x, s.y);
    return [x + 40, y - 50];
  };

  function frame(now: number) {
    if (!reduce) scene.render(now); else scene.render(0);
    fx.frame(now);
    if (mode === 'gate') {
      const L = GATES[gateTex()].label;
      const [px, py] = scene.project(L.people[0], L.people[1]);
      const [qx, qy] = scene.project(L.technology[0], L.technology[1]);
      const narrow = portrait();
      labelP.style.left = `${narrow ? innerWidth / 4 : px}px`; labelP.style.top = `${py}px`;
      labelT.style.left = `${narrow ? innerWidth / 4 : qx - innerWidth / 2}px`; labelT.style.top = `${qy}px`;
      // sit the glowing button on the spot in the painting where the path button was
      const [, by] = scene.project(0.5, gateTex() === 'tall' ? 0.84 : 0.845);
      pill.style.top = `${by}px`;
    } else {
      for (const s of inWorld(mode)) {
        const [x, y] = scene.project(s.x, s.y);
        s.hot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    }
    requestAnimationFrame(frame);
  }

  addEventListener('resize', () => {
    scene.resize();
    fx.resize();
    if (mode === 'gate' && !busy) { scene.use(gateTex()); scene.cam = { x: 0.5, y: 0.5, zoom: 1 }; }
    else if (mode !== 'gate' && !busy) scene.cam = scene.clamp(stopCam(inWorld(mode)[idx]));
  });

  // ---------- boot ----------
  const first = gateTex();
  const counter = { n: 0 };
  const showN = () => { loadN.textContent = `${Math.round(counter.n)}%`; };
  scene.load(first, SRC[first], (p) => gsap.to(counter, { n: p * 90, duration: 0.3, onUpdate: showN }))
    .then(async () => {
      root.classList.add('webgl');
      scene.use(first);
      // the worlds always use the wide picture
      const other = first === 'wide' ? null : scene.load('wide', SRC.wide);
      await gsap.to(counter, { n: 100, duration: D(0.4), onUpdate: showN });
      loader.classList.add('done');
      requestAnimationFrame(frame);
      if (!reduce) {
        scene.cam = { x: 0.5, y: 0.56, zoom: 1.35 };
        scene.blur = 0.5;
        gsap.to(scene, { blur: 0, duration: 1.8, ease: 'power2.out' });
        await tweenCam({ x: 0.5, y: 0.5, zoom: 1 }, 2.2, 'power3.out');
      }
      if (other) await other;
      if (location.hash && location.hash !== '#gate') route(location.hash);
    })
    .catch(() => {
      loader.classList.add('done');
      root.classList.replace('js', 'no-js');
    });
}
