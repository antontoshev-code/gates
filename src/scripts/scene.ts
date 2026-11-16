/**
 * WebGL scene: draws the illustrated world image with a fake depth map so it moves in 2.5D.
 * A "camera" (centre + zoom, in image coordinates) lets us glide around and fly through the gates.
 */

export type Cam = { x: number; y: number; zoom: number };
type Tex = { tex: WebGLTexture; w: number; h: number };

const VERT = `
attribute vec2 p;
varying vec2 vScreen;
void main(){ vScreen = p * 0.5 + 0.5; vScreen.y = 1.0 - vScreen.y; gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
varying vec2 vScreen;
uniform sampler2D img;
uniform vec2 cam;        // centre in image uv
uniform vec2 view;       // visible size in image uv (already divided by zoom)
uniform vec2 par;        // parallax input, -1..1
uniform float t;
uniform float blur;      // 0..1
uniform float bright;    // 1 = normal
uniform float tint;      // -1 warm .. 1 cool
uniform vec2 texel;

float depth(vec2 uv){
  // bottom of the image is close to the viewer, the sky is far away
  float d = smoothstep(0.30, 1.0, uv.y);
  // the two gates sit in the middle distance and pop forward a little
  d += 0.18 * smoothstep(0.30, 0.0, length((uv - vec2(0.25, 0.52)) * vec2(1.6, 1.0)));
  d += 0.18 * smoothstep(0.30, 0.0, length((uv - vec2(0.73, 0.52)) * vec2(1.6, 1.0)));
  // foreground table and rocks
  d += 0.25 * smoothstep(0.25, 0.0, length((uv - vec2(0.08, 0.82)) * vec2(1.0, 1.2)));
  d += 0.2 * smoothstep(0.2, 0.0, length((uv - vec2(0.9, 0.85)) * vec2(1.0, 1.4)));
  return clamp(d, 0.0, 1.2);
}

vec3 sample(vec2 uv){ return texture2D(img, clamp(uv, vec2(0.001), vec2(0.999))).rgb; }

void main(){
  vec2 uv = cam + (vScreen - 0.5) * view;
  vec2 sway = vec2(sin(t * 0.25), cos(t * 0.21)) * 0.15;
  float d = depth(uv);
  uv -= (par + sway) * (d - 0.35) * 0.022 * (view.x);
  vec3 col;
  if (blur > 0.001) {
    vec2 r = texel * blur * 14.0;
    col = sample(uv) * 0.2;
    col += sample(uv + vec2( r.x, 0.0)) * 0.1; col += sample(uv - vec2( r.x, 0.0)) * 0.1;
    col += sample(uv + vec2(0.0,  r.y)) * 0.1; col += sample(uv - vec2(0.0,  r.y)) * 0.1;
    col += sample(uv + r) * 0.1; col += sample(uv - r) * 0.1;
    col += sample(uv + vec2(r.x, -r.y)) * 0.1; col += sample(uv - vec2(r.x, -r.y)) * 0.1;
  } else {
    col = sample(uv);
  }
  // soft glow on highlights (lanterns, glass, fire)
  vec3 hi = max(col - 0.62, 0.0);
  col += hi * hi * 2.2;
  col *= bright;
  col = mix(col, col * vec3(1.08, 0.96, 0.86), clamp(-tint, 0.0, 1.0) * 0.5);
  col = mix(col, col * vec3(0.88, 0.95, 1.12), clamp(tint, 0.0, 1.0) * 0.5);
  // vignette
  vec2 q = vScreen - 0.5;
  col *= 1.0 - dot(q, q) * 0.9;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Scene {
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  prog: WebGLProgram;
  textures: Record<string, Tex> = {};
  current = '';
  cam: Cam = { x: 0.5, y: 0.5, zoom: 1 };
  blur = 0;
  bright = 1;
  tint = 0;
  par = { x: 0, y: 0 };
  parTarget = { x: 0, y: 0 };
  W = 0;
  H = 0;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private t0 = performance.now();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('no webgl');
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['img', 'cam', 'view', 'par', 't', 'blur', 'bright', 'tint', 'texel']) this.u[n] = gl.getUniformLocation(prog, n);
    this.resize();
  }

  load(name: string, src: string, onProgress?: (p: number) => void): Promise<void> {
    // Try XHR first (gives a real progress counter). If it fails, stalls or is blocked
    // (some hosts and sandboxes do that), fall back to a plain <img> load.
    const viaXhr = () => new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', src);
      xhr.responseType = 'blob';
      xhr.timeout = 10000;
      xhr.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onerror = xhr.ontimeout = xhr.onabort = () => reject(new Error('xhr'));
      xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 && xhr.response ? resolve(URL.createObjectURL(xhr.response)) : reject(new Error('status')));
      xhr.send();
    });
    const decode = (url: string, cors: boolean) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      if (cors) img.crossOrigin = 'anonymous';
      const t = setTimeout(() => reject(new Error('timeout')), 15000);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); reject(new Error('decode')); };
      img.src = url;
    });
    const upload = (img: HTMLImageElement) => {
      const gl = this.gl;
      const tex = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.textures[name] = { tex, w: img.naturalWidth, h: img.naturalHeight };
    };
    return viaXhr()
      .then(async (url) => { try { upload(await decode(url, false)); } finally { URL.revokeObjectURL(url); } })
      .catch(async () => { upload(await decode(src, true)); onProgress?.(1); });
  }

  use(name: string) {
    this.current = name;
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, matchMedia('(pointer: coarse)').matches ? 1.5 : 2);
    this.W = innerWidth;
    this.H = innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Visible area in image uv at zoom 1 (cover fit). */
  baseView(): [number, number] {
    const tx = this.textures[this.current];
    if (!tx) return [1, 1];
    const A = this.W / this.H, I = tx.w / tx.h;
    return A > I ? [1, I / A] : [A / I, 1];
  }

  view(cam = this.cam): [number, number] {
    const [w, h] = this.baseView();
    return [w / cam.zoom, h / cam.zoom];
  }

  /** Keep the camera inside the picture. */
  clamp(cam: Cam): Cam {
    const [vw, vh] = this.view(cam);
    return {
      zoom: cam.zoom,
      x: Math.min(1 - vw / 2, Math.max(vw / 2, cam.x)),
      y: Math.min(1 - vh / 2, Math.max(vh / 2, cam.y)),
    };
  }

  /** Image uv → screen px. */
  project(u: number, v: number): [number, number] {
    const [vw, vh] = this.view();
    return [((u - this.cam.x) / vw + 0.5) * this.W, ((v - this.cam.y) / vh + 0.5) * this.H];
  }

  render(now = performance.now()) {
    const tx = this.textures[this.current];
    if (!tx) return;
    const gl = this.gl;
    this.par.x += (this.parTarget.x - this.par.x) * 0.06;
    this.par.y += (this.parTarget.y - this.par.y) * 0.06;
    const c = this.clamp(this.cam);
    this.cam.x = c.x; this.cam.y = c.y;
    const [vw, vh] = this.view();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tx.tex);
    gl.uniform1i(this.u.img, 0);
    gl.uniform2f(this.u.cam, this.cam.x, this.cam.y);
    gl.uniform2f(this.u.view, vw, vh);
    gl.uniform2f(this.u.par, this.par.x, this.par.y);
    gl.uniform1f(this.u.t, (now - this.t0) / 1000);
    gl.uniform1f(this.u.blur, this.blur);
    gl.uniform1f(this.u.bright, this.bright);
    gl.uniform1f(this.u.tint, this.tint);
    gl.uniform2f(this.u.texel, 1 / tx.w, 1 / tx.h);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
