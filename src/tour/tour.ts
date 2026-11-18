/**
 * The guided walk: where you are, where one step takes you, and the HTML layer on top
 * (panels, hotspots, gate buttons, chapter dots, routes). Works with any Renderer.
 */
import type { Renderer, StopData, TourData, WorldId, RoutePoint } from './types';
import { Dialogue, type Choice } from './dialogue';
import { attachInput } from './input';

type Place = 'threshold' | string;

const $ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => root.querySelector(s) as T;
const $$ = <T extends Element = HTMLElement>(s: string, root: ParentNode = document) => [...root.querySelectorAll(s)] as T[];

function store(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch { return null; }
}

export function startTour(data: TourData, r: Renderer) {
  const body = document.body;
  const byId = new Map(data.stops.map((s) => [s.id, s]));
  const inWorld = (w: WorldId) => data.stops.filter((s) => s.world === w).sort((a, b) => a.order - b.order);
  const worldOf = (w: WorldId) => data.worlds.find((x) => x.id === w)!;
  const other = (w: WorldId): WorldId => (w === 'human' ? 'tech' : 'human');

  let place: Place = 'threshold';
  /** At the threshold: which world's route we came out of, and at which end. */
  let back: { world: WorldId; end: 'start' | 'exit' } | null = null;
  let busy = false;
  type WalkOpts = { via?: 'exit'; focus?: boolean; history?: boolean };
  let queued: { to: Place; opts: WalkOpts } | null = null;
  let panelOpen = true;
  let sheet: HTMLElement | null = null;
  const visited = new Set<WorldId>();

  const dialogue = new Dialogue(data, (p) => r.setPose(p));
  const announce = $('#announce');
  const content = $('#content');
  const hots = $$<HTMLButtonElement>('#hotspots .hot');
  const gates = $$<HTMLButtonElement>('#gates [data-gate]');
  const gatesBox = $('#gates');
  const bubble = $('#bubble');
  const prevBtn = $<HTMLButtonElement>('#prev');
  const nextBtn = $<HTMLButtonElement>('#next');

  // ---------- moving ----------
  async function walk(to: Place, opts: WalkOpts = {}) {
    const via = opts.via;
    if (busy) { queued = { to, opts }; return; }
    if (to === place && !sheet) { openPanel(opts.focus); return; }
    const from = place;
    // a keyboard or screen-reader user had focus somewhere; don't let it fall to <body> when that control hides
    const hadFocus = document.activeElement instanceof HTMLElement && document.activeElement !== body;
    // reduced motion: cut straight to the stop instead of gliding
    const cut = matchMedia('(prefers-reduced-motion: reduce)').matches;
    busy = true;
    body.dataset.moving = 'true';
    closeSheet(false);
    if (dialogue.open) dialogue.close(false);
    try {
      if (to === 'threshold') {
        if (place !== 'threshold') {
          const s = byId.get(place)!;
          const end = s.order === 1 ? 'start' : 'exit';
          await r.travel(s.world, s.id, end, cut);
          back = { world: s.world, end };
          place = 'threshold';
        }
      } else {
        const t = byId.get(to)!;
        if (place === 'threshold') {
          const from: RoutePoint = via === 'exit' && back?.world === t.world ? 'exit' : 'start';
          await r.travel(t.world, from, t.id, cut);
        } else {
          const s = byId.get(place)!;
          if (s.world === t.world) await r.travel(t.world, s.id, t.id, cut);
          else {
            await r.travel(s.world, s.id, s.order === 1 ? 'start' : 'exit', cut);
            await r.travel(t.world, 'start', t.id, cut);
          }
        }
        place = to;
      }
    } finally {
      busy = false;
      delete body.dataset.moving;
    }
    arrive(true, { from, focus: opts.focus, history: opts.history ? 'skip' : 'push' });
    if (hadFocus && !queued) keepFocus();
    if (queued) { const q = queued; queued = null; walk(q.to, q.opts); }
  }

  /** True when focus sits on nothing, or on a control that is now hidden. */
  function focusLost() {
    const a = document.activeElement as HTMLElement | null;
    return !a || a === body || !a.isConnected || a.closest('[hidden]') !== null || a.getClientRects().length === 0;
  }
  /** After a walk: land on the stop's panel title, or back at the threshold on the gate you came out of. */
  function keepFocus() {
    if (!focusLost()) return;
    if (place !== 'threshold') {
      document.querySelector<HTMLElement>(`#${place} .ptitle`)?.focus({ preventScroll: true });
      return;
    }
    const gate = gates.find((g) => g.dataset.gate === back?.world) ?? gates[0];
    gate?.focus({ preventScroll: true });
  }

  const urlFor = (p: Place) => (p === 'threshold' ? location.pathname + location.search : `#${p}`);
  function arrive(spoken: boolean, o: { from?: Place; focus?: boolean; history?: 'push' | 'replace' | 'skip' } = {}) {
    const s = byId.get(place);
    body.dataset.place = place;
    body.dataset.world = s ? s.world : '';
    // every step is a history entry, so the browser's Back and Forward walk you back and forth
    const h = o.history ?? 'replace';
    if (h === 'push' && location.hash.slice(1) !== (place === 'threshold' ? '' : place)) history.pushState({ place }, '', urlFor(place));
    else if (h === 'replace') history.replaceState({ place }, '', urlFor(place));
    updateNav();
    if (s) {
      visited.add(s.world);
      openPanel(o.focus);
      r.setPose(r.pointPose(s.id));
      const list = inWorld(s.world);
      announce.textContent = `${worldOf(s.world).label}: ${s.title}, ${s.order} of ${list.length}.`;
      const entering = o.from === 'threshold' && s.order === 1;
      if (spoken) dialogue.say(entering ? [data.dialogue.entries[s.world], s.say] : [s.say], [], { autoClose: entering ? 8500 : 6500 });
    } else {
      showPanel(null);
      r.setPose('welcome');
      announce.textContent = 'Back at the two gates.';
      if (spoken && back?.end === 'exit') {
        const o = other(back.world);
        dialogue.say([data.dialogue.exits[back.world]], [
          { label: worldOf(o).gate, run: () => enter(o), tone: o === 'human' ? 'warm' : 'cool' },
          { label: data.dialogue.choices.look, run: lookAround },
        ]);
      }
    }
    r.onFrame();
  }

  const enter = (w: WorldId) => walk(inWorld(w)[0].id);

  function next() {
    if (place === 'threshold') {
      const w: WorldId = !visited.has('human') ? 'human' : !visited.has('tech') ? 'tech' : back ? other(back.world) : 'human';
      return enter(w);
    }
    const s = byId.get(place)!;
    const list = inWorld(s.world);
    if (s.order < list.length) walk(list[s.order].id);
    else walk('threshold');
  }
  function prev() {
    if (place === 'threshold') {
      if (back?.end === 'exit') { const list = inWorld(back.world); walk(list[list.length - 1].id, { via: 'exit' }); }
      return;
    }
    const s = byId.get(place)!;
    if (s.order > 1) walk(inWorld(s.world)[s.order - 2].id);
    else walk('threshold');
  }

  function lookAround() {
    dialogue.say([data.dialogue.lookAround], [], { autoClose: 6000 });
  }

  function greet() {
    const seen = store('gates.seen');
    store('gates.seen', '1');
    const lines = seen ? data.dialogue.returning : data.dialogue.greeting;
    const choices: Choice[] = [
      ...data.worlds.map((w) => ({ label: w.gate, run: () => enter(w.id), tone: (w.id === 'human' ? 'warm' : 'cool') as Choice['tone'] })),
      { label: data.dialogue.choices.look, run: lookAround },
      { label: data.dialogue.choices.ask, run: () => dialogue.faq() },
    ];
    dialogue.say(lines, choices, { pose: 'welcome' });
  }

  // ---------- panels and sheets ----------
  function showPanel(id: string | null) {
    $$('#content > section > article.stop, #content > .sheet').forEach((a) => a.classList.toggle('on', a.id === id));
    body.dataset.panel = id ? 'open' : 'closed';
    content.scrollTop = 0;
    $$('#content .stop').forEach((a) => { if (a.id === id) a.scrollTop = 0; });
  }
  /** Open the current stop's panel. With focus, keyboard and screen-reader users land on its title. */
  function openPanel(focus = false) {
    if (place === 'threshold') return;
    panelOpen = true;
    showPanel(place);
    if (focus) document.querySelector<HTMLElement>(`#${place} .ptitle`)?.focus({ preventScroll: true });
  }
  /** Close it, and give focus back to the hotspot (or chapter dot) that leads to it. */
  function hidePanel() {
    const hadFocus = content.contains(document.activeElement);
    panelOpen = false;
    showPanel(null);
    if (hadFocus) {
      const hot = hots.find((x) => x.dataset.stop === place && !x.classList.contains('off'));
      const dot = document.querySelector<HTMLElement>(`#walknav .dots [data-to="${place}"]`);
      (hot ?? dot)?.focus({ preventScroll: true });
    }
  }
  function openSheet(id: 'contact' | 'brief', topic?: string) {
    sheet = document.getElementById(id);
    if (!sheet) return;
    if (topic) {
      const sel = sheet.querySelector<HTMLSelectElement>('select[name="topic"]');
      if (sel && [...sel.options].some((o) => o.value === topic)) sel.value = topic;
    }
    showPanel(id);
    history.replaceState(null, '', `#${id}`);
    sheet.querySelector<HTMLElement>('h2, h3')?.focus({ preventScroll: true });
  }
  function closeSheet(restore = true) {
    if (!sheet) return;
    sheet = null;
    if (restore) {
      if (place !== 'threshold' && panelOpen) showPanel(place); else showPanel(null);
      history.replaceState(null, '', place === 'threshold' ? location.pathname + location.search : `#${place}`);
      const btn = place !== 'threshold' ? document.querySelector<HTMLElement>(`#${place} .cta`) : null;
      btn?.focus({ preventScroll: true });
    }
  }

  // ---------- nav ----------
  function updateNav() {
    const s = byId.get(place);
    $$('#walknav .dots [data-to]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.to === place)));
    const list = s ? inWorld(s.world) : [];
    prevBtn.disabled = !s && back?.end !== 'exit';
    prevBtn.setAttribute('aria-label', s ? (s.order === 1 ? 'Back to the gates' : `Back to ${list[s.order - 2].title}`) : 'Back');
    nextBtn.setAttribute('aria-label', s ? (s.order === list.length ? 'Walk back to the gates' : `On to ${list[s.order].title}`) : 'Walk in');
    hots.forEach((h) => h.classList.toggle('active', h.dataset.stop === place));
  }

  // ---------- following the 3D scene ----------
  r.onFrame = () => {
    const w = body.dataset.world;
    for (const h of hots) {
      if (h.dataset.world !== w) continue;
      const p = r.anchor(h.dataset.stop!);
      h.classList.toggle('off', !p);
      if (p) h.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
    let pinned = place === 'threshold';
    for (const g of gates) {
      const p = place === 'threshold' ? r.anchor(`gate:${g.dataset.gate}`) : null;
      if (!p) { pinned = false; continue; }
      g.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    }
    gatesBox.classList.toggle('pinned', pinned);
    const head = r.head();
    // keep the panel on the side where Anthony isn't
    if (head && !body.dataset.moving) body.dataset.panelSide = head.x > innerWidth / 2 ? 'left' : 'right';
    // pin the bubble over Anthony's head only when there's room above it; otherwise it sits in its usual place
    bubble.classList.toggle('pinned', !!head && head.y > 300);
    if (head) {
      bubble.style.setProperty('--hx', `${head.x.toFixed(1)}px`);
      bubble.style.setProperty('--hy', `${head.y.toFixed(1)}px`);
    }
  };
  r.onPick = (key) => {
    if (key === 'anthony') return dialogue.open ? dialogue.close(true) : dialogue.faq();
    if (key.startsWith('gate:')) return enter(key.slice(5) as WorldId);
    if (byId.has(key)) walk(key);
  };

  // ---------- wiring ----------
  gates.forEach((g) => g.addEventListener('click', () => enter(g.dataset.gate as WorldId)));
  hots.forEach((h) => h.addEventListener('click', () => walk(h.dataset.stop!, { focus: true })));
  gates.forEach((g) => {
    const w = g.dataset.gate as WorldId;
    const on = () => { r.prepare(w).catch(() => {}); r.highlightGate?.(w); };
    const off = () => r.highlightGate?.(null);
    g.addEventListener('pointerenter', on); g.addEventListener('focus', on);
    g.addEventListener('pointerleave', off); g.addEventListener('blur', off);
  });
  prevBtn.addEventListener('click', prev);
  nextBtn.addEventListener('click', next);
  $$('#walknav .dots [data-to]').forEach((b) => b.addEventListener('click', () => walk(b.dataset.to!, { focus: b.dataset.to !== 'threshold' })));
  $$('#content .panel-close').forEach((b) => b.addEventListener('click', () => (sheet ? closeSheet() : hidePanel())));

  const menu = $('#menu');
  const menuBtn = $<HTMLButtonElement>('#menu-btn');
  const setMenu = (open: boolean) => {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) menu.querySelector<HTMLElement>('a')?.focus(); else menuBtn.focus({ preventScroll: true });
  };
  menuBtn.addEventListener('click', () => setMenu(menu.hidden === true));

  /** In-page links become walks: #coaching, #contact, #brief, #faq, #threshold. */
  function route(hash: string, link?: HTMLElement, fromHistory = false) {
    const go = (to: Place, focus = false) => walk(to, { focus, history: fromHistory });
    const id = decodeURIComponent(hash.replace(/^#/, ''));
    if (!menu.hidden) setMenu(false);
    if (id === 'contact' || id === 'brief') { openSheet(id, link?.dataset.topic); return true; }
    if (id === 'faq') { dialogue.faq(); return true; }
    if (id === 'threshold' || id === '' || id === 'content') { go('threshold'); return true; }
    if (id === 'people' || id === 'world-human') { go(inWorld('human')[0].id); return true; }
    if (id === 'systems' || id === 'world-tech') { go(inWorld('tech')[0].id); return true; }
    if (byId.has(id)) { go(id, !!link); return true; }
    return false;
  }
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest?.('a[href^="#"]') as HTMLAnchorElement | null;
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey) return;
    if (route(a.getAttribute('href')!, a)) e.preventDefault();
  });
  addEventListener('popstate', () => route(location.hash, undefined, true));

  attachInput({
    next, prev,
    left: () => (place === 'threshold' ? enter(data.worlds.find((w) => w.side === 'left')!.id) : prev()),
    right: () => (place === 'threshold' ? enter(data.worlds.find((w) => w.side === 'right')!.id) : next()),
    home: () => walk('threshold'),
    // Esc closes the topmost thing: menu, form, panel, Anthony's bubble. Then it walks you back to the gates.
    escape: () => {
      if (!menu.hidden) return setMenu(false);
      if (sheet) return closeSheet();
      if (place !== 'threshold' && panelOpen) return hidePanel();
      if (dialogue.open) return dialogue.close(true);
      if (place !== 'threshold') walk('threshold');
    },
    busy: () => busy,
  });

  // ---------- start ----------
  async function begin() {
    const id = decodeURIComponent(location.hash.slice(1));
    const s = byId.get(id);
    if (s) {
      await r.travel(s.world, 'start', s.id, true);
      place = s.id;
      arrive(false);
      dialogue.close(false); // nothing was said yet, so show the "Ask Anthony" button
    } else {
      arrive(false);
      if (id === 'contact' || id === 'brief') openSheet(id);
      greet();
    }
  }
  return { begin };
}

export type { StopData };
