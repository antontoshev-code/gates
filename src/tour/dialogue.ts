/**
 * Anthony's one dialogue bubble. Never blocks navigation: it can always be closed,
 * and then shrinks to an "Ask Anthony" button.
 */
import type { TourData, Pose } from './types';

export interface Choice { label: string; run: () => void; tone?: 'warm' | 'cool' }

export class Dialogue {
  el: HTMLElement;
  lines: HTMLElement;
  choices: HTMLElement;
  ask: HTMLButtonElement;
  open = false;
  /** What the "Ask Anthony" button opens. Defaults to the questions. */
  onAsk: (() => void) | null = null;
  private timer = 0;

  constructor(private data: TourData, private pose: (p: Pose) => void) {
    this.el = document.getElementById('bubble')!;
    this.lines = this.el.querySelector('.lines')!;
    this.choices = this.el.querySelector('.choices')!;
    this.ask = document.getElementById('ask') as HTMLButtonElement;
    this.el.querySelector('.close')!.addEventListener('click', () => this.close(true));
    this.ask.addEventListener('click', () => (this.onAsk ? this.onAsk() : this.faq()));
    this.el.addEventListener('pointerenter', () => clearTimeout(this.timer));
    this.el.addEventListener('focusin', () => clearTimeout(this.timer));
  }

  /** Show lines and optional choices. `autoClose` (ms) folds it back to the Ask button. */
  say(lines: string[], choices: Choice[] = [], opts: { autoClose?: number; pose?: Pose } = {}) {
    clearTimeout(this.timer);
    this.lines.replaceChildren(...lines.map((l) => Object.assign(document.createElement('p'), { textContent: l })));
    this.choices.replaceChildren(
      ...choices.map((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice' + (c.tone ? ` ${c.tone}` : '');
        b.textContent = c.label;
        b.addEventListener('click', () => c.run());
        return b;
      }),
    );
    this.choices.hidden = choices.length === 0;
    this.el.hidden = false;
    this.ask.hidden = true;
    this.open = true;
    this.el.classList.remove('in');
    void this.el.offsetWidth;
    this.el.classList.add('in');
    if (opts.pose) this.pose(opts.pose);
    if (opts.autoClose) this.timer = window.setTimeout(() => this.close(false), opts.autoClose);
  }

  /** The scripted questions. */
  faq() {
    this.say(
      ["Ask me something. These are the questions people actually ask."],
      [
        ...this.data.faq.map((f) => ({ label: f.q, run: () => this.answer(f.q, f.a) })),
      ],
      { pose: 'listen' },
    );
    (this.choices.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  private answer(q: string, a: string) {
    this.say([a], [{ label: 'Another question', run: () => this.faq() }], { pose: 'welcome' });
    this.lines.setAttribute('data-q', q);
    (this.choices.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  /** `byUser` is kept for callers' clarity; focus only moves when it was inside the bubble. */
  close(_byUser: boolean) {
    clearTimeout(this.timer);
    const hadFocus = this.el.contains(document.activeElement);
    this.el.hidden = true;
    this.ask.hidden = false;
    this.open = false;
    // only move focus if it was inside the bubble; Esc pressed elsewhere leaves focus where it is
    if (hadFocus) {
      this.ask.focus({ preventScroll: true });
      // the Ask button can be off screen on some layouts; then give focus back to the page's main controls
      if (document.activeElement !== this.ask) document.getElementById('next')?.focus({ preventScroll: true });
    }
  }
}
