/**
 * The phone tier: the same walk, told with pictures. Each stop is a photo you "walk into":
 * the current one grows and fades as the next one settles in. Same stops, same words, same buttons.
 * Loads only the picture you're on and its neighbours.
 */
import type { Renderer, RoutePoint, TourData, WorldId, Pose } from './types';

const MS = 900;

export class PictureRenderer implements Renderer {
  onFrame = () => {};
  onPick = (_key: string) => {};
  private layer: HTMLElement;
  private pics = new Map<string, HTMLElement>();
  private order: string[];
  private current = 'threshold';
  private guide!: HTMLImageElement;

  constructor(layer: HTMLElement, private data: TourData) {
    this.layer = layer;
    this.order = ['threshold', ...data.worlds.flatMap((w) => data.stops.filter((s) => s.world === w.id).sort((a, b) => a.order - b.order).map((s) => s.id))];
  }

  private picture(id: string) {
    let el = this.pics.get(id);
    if (el) return el;
    const name = id === 'threshold' ? 'gate' : this.data.stops.find((s) => s.id === id)!.picture;
    el = document.createElement('div');
    el.className = 'pic';
    el.dataset.key = id;
    el.innerHTML = `<picture><source media="(max-aspect-ratio: 9/10)" srcset="pictures/${name}-m.webp"><img alt="" decoding="async" src="pictures/${name}-d.webp"></picture>`;
    if (id === 'threshold') {
      this.guide = Object.assign(document.createElement('img'), { className: 'guide', alt: '', src: this.data.anthony.welcome });
      this.guide.addEventListener('click', () => this.onPick('anthony'));
      el.append(this.guide);
    }
    this.layer.append(el);
    this.pics.set(id, el);
    return el;
  }

  private warm(id: string) {
    const i = this.order.indexOf(id);
    for (const j of [i - 1, i + 1]) if (this.order[j]) this.picture(this.order[j]);
  }

  async init(onProgress: (share: number) => void) {
    const el = this.picture('threshold');
    el.classList.add('on');
    const img = el.querySelector('img')!;
    await Promise.race([
      img.decode().catch(() => {}),
      new Promise((r) => setTimeout(r, 6000)),
    ]);
    onProgress(1);
    this.warm('threshold');
    this.picture(this.data.stops.find((s) => s.world === 'tech' && s.order === 1)!.id);
  }

  travel(_world: WorldId, from: RoutePoint, to: RoutePoint, instant = false): Promise<void> {
    const id = (p: RoutePoint) => (p === 'start' || p === 'exit' ? 'threshold' : p);
    const a = this.picture(id(from) === this.current ? this.current : id(from));
    const b = this.picture(id(to));
    const forward = to === 'exit' || (from !== 'exit' && this.order.indexOf(id(to)) > this.order.indexOf(id(from)));
    this.current = id(to);
    this.warm(this.current);
    this.pics.forEach((p) => { if (p !== a && p !== b) p.classList.remove('on', 'out', 'in-f', 'in-b', 'out-f', 'out-b'); });
    if (instant || a === b) {
      a.classList.remove('on');
      b.classList.add('on');
      this.onFrame();
      return Promise.resolve();
    }
    a.classList.remove('in-f', 'in-b');
    b.classList.remove('out-f', 'out-b');
    a.classList.add(forward ? 'out-f' : 'out-b');
    b.classList.add('on', forward ? 'in-f' : 'in-b');
    return new Promise((resolve) => setTimeout(() => {
      a.classList.remove('on', 'out-f', 'out-b');
      b.classList.remove('in-f', 'in-b');
      this.onFrame();
      resolve();
    }, MS));
  }

  prepare(world: WorldId) {
    const first = this.data.stops.find((s) => s.world === world && s.order === 1);
    if (first) this.picture(first.id);
    return Promise.resolve();
  }
  anchor() { return null; }
  head() { return null; }
  setPose(p: Pose) { if (this.guide) this.guide.src = this.data.anthony[p]; }
  pointPose(): Pose { return 'welcome'; }
}
