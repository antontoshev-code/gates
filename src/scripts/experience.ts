import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import SplitType from 'split-type';

gsap.registerPlugin(ScrollTrigger);

type World = 'people' | 'gate' | 'technology';
const ORDER: World[] = ['people', 'gate', 'technology'];
const NAMES: Record<World, string> = { people: 'People', gate: 'Gate', technology: 'Technology' };
const isWorld = (v: unknown): v is World => ORDER.includes(v as World);

/**
 * The site is three worlds side by side: People ← Gate → Technology.
 * Left/right (arrow keys, swipe, horizontal trackpad, links) moves between worlds.
 * Up/down (scroll, swipe, arrow keys) moves through the scenes inside a world.
 * Without JS every world simply renders one after another.
 */
export function initExperience() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const worlds = new Map<World, HTMLElement>();
  document.querySelectorAll<HTMLElement>('.world').forEach((w) => worlds.set(w.dataset.world as World, w));
  if (!worlds.size) return;

  const sceneI = document.getElementById('scene-i');
  const sceneN = document.getElementById('scene-n');
  const sceneName = document.getElementById('scene-name');

  // ---------- smooth scroll ----------
  let lenis: Lenis | null = null;
  if (!reduce) {
    lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis!.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const scrollToEl = (el: HTMLElement | number, immediate = false) => {
    if (lenis) {
      lenis.scrollTo(el, { immediate, force: true, duration: 1.3, offset: typeof el === 'number' ? 0 : -70 });
    } else {
      const top = typeof el === 'number' ? el : el.getBoundingClientRect().top + scrollY - 70;
      window.scrollTo({ top, behavior: immediate || reduce ? 'auto' : 'smooth' });
    }
  };

  // ---------- per-world motion ----------
  let triggers: ScrollTrigger[] = [];
  const splitDone = new WeakSet<Element>();

  function setScene(world: HTMLElement, i: number) {
    const scenes = world.querySelectorAll<HTMLElement>('.scene');
    if (sceneI) sceneI.textContent = String(i + 1).padStart(2, '0');
    if (sceneN) sceneN.textContent = String(scenes.length).padStart(2, '0');
    if (sceneName) sceneName.textContent = scenes[i]?.dataset.scene ?? '';
  }

  function setupWorld(key: World) {
    triggers.forEach((t) => t.kill());
    triggers = [];
    const world = worlds.get(key)!;
    setScene(world, 0);

    world.querySelectorAll<HTMLElement>('.scene').forEach((scene, i) => {
      triggers.push(ScrollTrigger.create({
        trigger: scene, start: 'top 55%', end: 'bottom 55%',
        onToggle: (self) => self.isActive && setScene(world, i),
      }));
    });

    if (reduce) return;

    world.querySelectorAll<HTMLElement>('.split').forEach((el) => {
      if (splitDone.has(el)) return;
      splitDone.add(el);
      const st = new SplitType(el, { types: 'words' });
      const tw = gsap.from(st.words, {
        yPercent: 70, opacity: 0, rotate: 2, stagger: 0.05, duration: 1.1, ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
      if (tw.scrollTrigger) triggers.push(tw.scrollTrigger);
    });

    world.querySelectorAll<HTMLElement>('.reveal').forEach((el) => {
      if (splitDone.has(el)) return;
      splitDone.add(el);
      const tw = gsap.from(el, {
        y: 46, opacity: 0, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 92%', once: true },
      });
      if (tw.scrollTrigger) triggers.push(tw.scrollTrigger);
    });

    // big outlined words drift a little against the scroll
    world.querySelectorAll<HTMLElement>('.huge').forEach((el) => {
      const tw = gsap.fromTo(el, { xPercent: 6 }, { xPercent: -4, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
      if (tw.scrollTrigger) triggers.push(tw.scrollTrigger);
    });

    ScrollTrigger.refresh();
  }

  // ---------- world switching ----------
  const fromHash = (): { world: World; target?: HTMLElement } | null => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return null;
    if (isWorld(id)) return { world: id };
    const el = document.getElementById(id);
    const w = el?.closest<HTMLElement>('.world')?.dataset.world;
    return isWorld(w) ? { world: w, target: el! } : null;
  };

  const start = fromHash();
  let current: World = start?.world ?? 'gate';
  let busy = false;
  worlds.forEach((el, k) => { el.hidden = k !== current; });
  document.body.dataset.world = current;

  const flash = document.createElement('div');
  flash.className = 'world-flash';
  flash.setAttribute('aria-hidden', 'true');
  document.body.appendChild(flash);

  function go(target: World, then?: HTMLElement) {
    if (busy) return;
    if (target === current) { if (then) scrollToEl(then); return; }
    busy = true;
    const from = worlds.get(current)!, to = worlds.get(target)!;
    const dir = ORDER.indexOf(target) > ORDER.indexOf(current) ? 1 : -1;
    triggers.forEach((t) => t.kill());
    triggers = [];

    const y = scrollY;
    lenis?.stop();
    document.body.classList.add('is-switching');
    Object.assign(from.style, { position: 'fixed', top: `${-y}px`, left: '0', width: '100%', zIndex: '1' });
    to.hidden = false;
    Object.assign(to.style, { position: 'fixed', top: '0', left: '0', width: '100%', zIndex: '2' });
    window.scrollTo(0, 0);
    lenis?.scrollTo(0, { immediate: true, force: true });
    document.body.dataset.world = target;
    flash.textContent = NAMES[target];
    flash.dataset.world = target;

    const done = () => {
      from.hidden = true;
      from.removeAttribute('style');
      to.removeAttribute('style');
      document.body.classList.remove('is-switching');
      lenis?.start();
      current = target;
      history.replaceState(null, '', `#${target}`);
      setupWorld(target);
      if (target === 'gate') gateIntro();
      busy = false;
      if (then) requestAnimationFrame(() => scrollToEl(then));
      (to.querySelector<HTMLElement>('h1, h2') ?? to).focus?.({ preventScroll: true });
    };

    if (reduce) { done(); return; }
    gsap.timeline({ defaults: { duration: 1.05, ease: 'expo.inOut' }, onComplete: done })
      .fromTo(to, { xPercent: 100 * dir }, { xPercent: 0 }, 0)
      .to(from, { xPercent: -30 * dir, opacity: 0.25 }, 0)
      .fromTo(flash, { opacity: 0, xPercent: 20 * dir }, { opacity: 1, xPercent: 0, duration: 0.5, ease: 'power3.out' }, 0.1)
      .to(flash, { opacity: 0, xPercent: -20 * dir, duration: 0.45, ease: 'power3.in' }, 0.65);
  }

  const step = (d: number) => {
    const i = ORDER.indexOf(current) + d;
    if (i >= 0 && i < ORDER.length) go(ORDER[i]);
  };

  const sceneStep = (d: number) => {
    const scenes = [...worlds.get(current)!.querySelectorAll<HTMLElement>('.scene')];
    const mid = innerHeight * 0.4;
    let i = 0;
    scenes.forEach((s, k) => { if (s.getBoundingClientRect().top <= mid) i = k; });
    const next = scenes[Math.max(0, Math.min(scenes.length - 1, i + d))];
    if (next) scrollToEl(next === scenes[0] ? 0 : next);
  };

  // ---------- input ----------
  const typing = (t: EventTarget | null) =>
    t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

  addEventListener('keydown', (e) => {
    if (typing(e.target) || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); sceneStep(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sceneStep(-1); }
  });

  let tx = 0, ty = 0, tt = 0;
  addEventListener('touchstart', (e) => { const t = e.touches[0]; tx = t.clientX; ty = t.clientY; tt = Date.now(); }, { passive: true });
  addEventListener('touchend', (e) => {
    if ((e.target as Element)?.closest?.('input, textarea, .no-swipe')) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - tx, dy = t.clientY - ty;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - tt < 700) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  let acc = 0, lockUntil = 0;
  addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) { acc = 0; return; }
    if (Date.now() < lockUntil) return;
    acc += e.deltaX;
    if (Math.abs(acc) > 140) { step(acc > 0 ? 1 : -1); acc = 0; lockUntil = Date.now() + 1300; }
  }, { passive: true });

  document.addEventListener('click', (e) => {
    const a = (e.target as Element)?.closest?.<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href')!.slice(1);
    e.preventDefault();
    if (isWorld(id) && !a.dataset.target) { go(id); return; }
    const target = document.getElementById(a.dataset.target || id) ?? undefined;
    const w = (a.dataset.worldLink as World | undefined) ?? (target?.closest<HTMLElement>('.world')?.dataset.world as World | undefined) ?? current;
    go(isWorld(w) ? w : current, target);
  });

  addEventListener('hashchange', () => { const h = fromHash(); if (h) go(h.world, h.target); });

  // ---------- gate intro + clock ----------
  function gateIntro() {
    if (reduce) return;
    gsap.from('#gate .split-hero span', { yPercent: 60, opacity: 0, stagger: 0.07, duration: 1.2, ease: 'expo.out' });
    gsap.from('#gate .lede, #gate .row', { y: 24, opacity: 0, duration: 1, delay: 0.35, ease: 'power3.out', stagger: 0.08 });
  }

  const clock = document.getElementById('clock');
  const tick = () => {
    try {
      if (clock) clock.textContent = 'Sofia ' + new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Sofia', hour: '2-digit', minute: '2-digit' }).format(new Date());
    } catch { /* ignore */ }
  };
  tick();
  setInterval(tick, 20000);

  setupWorld(current);
  if (current === 'gate') gateIntro();
  if (start?.target) requestAnimationFrame(() => scrollToEl(start.target!, true));
}
