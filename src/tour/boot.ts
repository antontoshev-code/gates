/**
 * Starts the right tier. The tier was already chosen by the inline script in Base.astro,
 * before anything heavy downloads: tier-3d, tier-25d or tier-plain on <html>.
 * The 3D code is a separate chunk that only the 3D tier fetches.
 */
import type { Renderer, Tier, TourData } from './types';
import { startTour } from './tour';

export function currentTier(): Tier {
  const c = document.documentElement.classList;
  return c.contains('tier-3d') ? '3d' : c.contains('tier-25d') ? '25d' : 'plain';
}

function toPlain(reason: unknown) {
  console.warn('[gates] falling back to the plain page:', reason);
  const u = new URL(location.href);
  u.searchParams.set('tier', 'plain');
  u.searchParams.set('why', 'error');
  try { sessionStorage.setItem('gates.error', String((reason as Error)?.message || reason).slice(0, 200)); } catch {}
  location.replace(u.toString());
}

export async function boot() {
  const tier = currentTier();
  setupPlainMenu();
  if (tier === 'plain') return explainPlain();

  const data: TourData = JSON.parse(document.getElementById('tour-data')!.textContent || '{}');
  const loader = document.getElementById('loader')!;
  const count = document.getElementById('load-n')!;
  const progress = (k: number) => { count.textContent = `${Math.round(k * 100)}%`; };

  try {
    let r: Renderer;
    if (tier === '3d') {
      const { ThreeRenderer } = await import('../three/engine');
      r = new ThreeRenderer(document.getElementById('three') as HTMLCanvasElement, data);
    } else {
      const { PictureRenderer } = await import('./pictures');
      r = new PictureRenderer(document.getElementById('pics')!, data);
    }
    const giveUp = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('loading took longer than 25 s')), 25000));
    await Promise.race([r.init(progress), giveUp]);
    addEventListener('gates:fail', (e) => toPlain((e as CustomEvent).detail));
    const tour = startTour(data, r);
    await tour.begin();
    loader.classList.add('done');
    document.documentElement.classList.add('ready');
  } catch (e) {
    toPlain(e);
  }
}

/** Plain page: the menu still opens and closes. The walk tiers wire their own. */
function setupPlainMenu() {
  if (currentTier() !== 'plain') return;
  const menu = document.getElementById('menu');
  const btn = document.getElementById('menu-btn');
  if (!menu || !btn) return;
  const set = (open: boolean) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
  btn.addEventListener('click', () => set(menu.hidden === true));
  menu.addEventListener('click', (e) => { if ((e.target as Element).closest('a')) set(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); } });
}

/** Say why the plain page is showing, so nobody mistakes it for the walk. */
function explainPlain() {
  const box = document.getElementById('why');
  const why = document.documentElement.dataset.why;
  if (!box || !why || why === 'chosen') return;
  let err = '';
  try { err = sessionStorage.getItem('gates.error') || ''; } catch {}
  const text: Record<string, string> = {
    'reduced-motion': 'Your device asks for less motion, so this is the calm page version. The 3D walk is one click away.',
    'no-webgl': "This browser can't show 3D here (WebGL 2 is off or blocked), so this is the page version.",
    error: `The 3D walk couldn't start here, so this is the page version.${err ? ` (${err})` : ''}`,
  };
  box.querySelector('span')!.textContent = text[why] ?? '';
  (box.querySelector('a') as HTMLElement).hidden = why === 'no-webgl';
  box.hidden = false;
}
