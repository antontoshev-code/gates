/**
 * One gesture = one step. Wheel, swipe, keys. Buttons are wired in the tour itself.
 * Ignores gestures that belong to something scrollable (a panel, the menu) or to a form field.
 */
import { STEP_LOCK_MS } from './constants';

export interface InputHandlers {
  next(): void;
  prev(): void;
  left(): void;
  right(): void;
  home(): void;
  escape(): void;
  busy(): boolean;
}

const SCROLLABLE = '#content, .stop .body, .menu, #bubble';
const TYPING = 'input, textarea, select, [contenteditable="true"]';

function canScroll(el: Element | null, dy: number): boolean {
  for (let n = el as HTMLElement | null; n && n !== document.body; n = n.parentElement) {
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) {
      if (dy > 0 && n.scrollTop + n.clientHeight < n.scrollHeight - 1) return true;
      if (dy < 0 && n.scrollTop > 0) return true;
    }
  }
  return false;
}

export function attachInput(h: InputHandlers) {
  let acc = 0;
  let lockUntil = 0;
  const step = (dir: 1 | -1) => {
    const now = performance.now();
    if (now < lockUntil || h.busy()) return;
    lockUntil = now + STEP_LOCK_MS;
    acc = 0;
    if (dir > 0) h.next(); else h.prev();
  };

  addEventListener('wheel', (e) => {
    const t = e.target as Element;
    if (t.closest?.(SCROLLABLE) && canScroll(t, e.deltaY)) return;
    if (t.closest?.('.menu:not([hidden])')) return;
    e.preventDefault();
    if (performance.now() < lockUntil || h.busy()) { acc = 0; return; }
    acc += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    if (Math.abs(acc) > 40) step(acc > 0 ? 1 : -1);
  }, { passive: false });

  // One swipe = one step. Sideways swipes count anywhere, including over a panel or Anthony's bubble,
  // because those only scroll up and down. Up/down swipes count only outside them. Never while a form is open.
  let sx = 0, sy = 0, tracking = false, inScroll = false;
  addEventListener('touchstart', (e) => {
    const t = e.target as Element;
    tracking = e.touches.length === 1 && !document.body.dataset.sheet && !t.closest?.(TYPING) && !t.closest?.('.menu:not([hidden])');
    inScroll = !!t.closest?.(SCROLLABLE);
    if (tracking) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }
  }, { passive: true });
  addEventListener('touchcancel', () => { tracking = false; }, { passive: true });
  addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 50) return;
    // swipe up or left = forward, like turning a page
    if (Math.abs(dy) > Math.abs(dx)) { if (!inScroll) step(dy < 0 ? 1 : -1); }
    else step(dx < 0 ? 1 : -1);
  }, { passive: true });

  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const t = e.target as Element;
    if (t.closest?.(TYPING)) { if (e.key === 'Escape') h.escape(); return; }
    if (e.key === 'Escape') { h.escape(); return; }
    if (t.closest?.('.menu:not([hidden])')) return;
    const inPanel = !!t.closest?.(SCROLLABLE);
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); h.right(); break;
      case 'ArrowLeft': e.preventDefault(); h.left(); break;
      case 'ArrowDown': case 'PageDown':
        if (inPanel) return; e.preventDefault(); step(1); break;
      case 'ArrowUp': case 'PageUp':
        if (inPanel) return; e.preventDefault(); step(-1); break;
      case 'Home': if (inPanel) return; e.preventDefault(); h.home(); break;
    }
  });
}
