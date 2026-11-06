/**
 * Palco de partículas da abertura. Carregado sob demanda (import dinâmico) depois da primeira pintura.
 *
 * WebGL2 puro, uma única chamada de desenho com instâncias: cada partícula é um triângulo pequeno com contorno fino e
 * carrega a posição de todas as formas (esfera com o "M", coluna, figura, joelho, anel) e uma semente própria.
 * O vertex shader interpola a forma atual até a próxima pelo progresso da rolagem e, no meio do caminho, solta a
 * partícula numa nuvem pela tela inteira (a "explosão"). Sem WebGL2: canvas 2D com menos partículas.
 *
 * Desempenho: quantidade adaptativa (mede o FPS e reduz), DPR limitado, redimensiona só em resize com debounce,
 * pausa fora da tela e com a aba oculta, libera buffers e o contexto ao destruir.
 */
import { SEGMENTS, timeline } from "./scene-timeline";

/** heroTop: no celular, onde o texto da abertura começa (px do palco); a esfera inicial cabe no espaço acima dele. */
export type StageOptions = { mobile: boolean; intro: boolean; palette: [string, string, string, string]; pointer: boolean; heroTop?: () => number };
export type Stage = { setProgress(p: number): void; setPalette(p: StageOptions["palette"]): void; skipIntro(): void; destroy(): void; kind: "webgl" | "2d" };

const DATA_VERSION = 1;
type Data = { esfera: Int8Array; formas: Int8Array[] };

async function loadData(n: number): Promise<Data> {
  const res = await fetch(`/site/particulas-v${DATA_VERSION}-${n}.json`);
  if (!res.ok) throw new Error(`partículas: ${res.status}`);
  const j = (await res.json()) as Record<string, string>;
  const dec = (s: string) => new Int8Array(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer);
  return { esfera: dec(j.esfera), formas: ["coluna", "figura", "joelho", "anel"].map((k) => dec(j[k])) };
}

const hex = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  // Reserva só se o token --particle-* faltar: o mesmo turquesa do tema claro
  const v = m ? parseInt(m[1], 16) : 0x5fe9dc;
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

/**
 * Onde cada forma fica, em px do palco: [x, y, escala]. Desktop: as formas alternam direita/esquerda e a esfera
 * final volta ao centro. Celular (ou tela em pé): tudo centralizado na metade de cima, o texto fica embaixo.
 */
export function placements(w: number, h: number, mobile: boolean, heroTop = h * 0.5): [number, number, number][] {
  if (mobile) {
    const s = Math.min(w * 0.42, h * 0.22);
    // Abaixo do cabeçalho (64 px) e acima do título, com folga, sem cobrir texto nem botões
    const free = Math.max(80, heroTop - 64 - 28);
    const r0 = Math.min(w * 0.3, free * 0.46);
    return [[w * 0.5, 64 + 14 + free / 2, r0], [w * 0.5, h * 0.36, s], [w * 0.5, h * 0.36, s], [w * 0.5, h * 0.36, s], [w * 0.5, h * 0.36, s * 0.9], [w * 0.5, h * 0.4, Math.min(w * 0.3, h * 0.17)]];
  }
  const s = h * 0.34;
  return [[w * 0.74, h * 0.54, Math.min(w * 0.2, h * 0.32)], [w * 0.28, h * 0.55, s], [w * 0.72, h * 0.55, s], [w * 0.28, h * 0.55, s], [w * 0.72, h * 0.55, s * 0.92], [w * 0.5, h * 0.55, Math.min(w * 0.16, h * 0.27)]];
}

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec4 a_sph;
layout(location=1) in vec2 a_f1;
layout(location=2) in vec2 a_f2;
layout(location=3) in vec2 a_f3;
layout(location=4) in vec2 a_f4;
layout(location=5) in vec4 a_seed;
uniform vec2 u_res;
uniform float u_time, u_t, u_size, u_intro;
uniform int u_seg;
uniform vec3 u_place[6];
uniform vec3 u_pal[4];
uniform vec3 u_pointer;
out vec3 v_col;
out float v_alpha;
out vec3 v_bary;

vec3 sphereAt(vec3 place, float spin) {
  vec3 p = a_sph.xyz;
  if (a_sph.w < 0.5) {
    float c = cos(spin), s = sin(spin);
    p = vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
    float tilt = 0.32 + u_pointer.y * 0.18;
    float ct = cos(tilt), st = sin(tilt);
    p = vec3(p.x, ct * p.y - st * p.z, st * p.y + ct * p.z);
  } else {
    p.z = 1.0;
  }
  float breathe = 1.0 + 0.025 * sin(u_time * 0.9);
  return vec3(place.xy + p.xy * place.z * breathe, p.z);
}
vec3 shapeAt(int i) {
  if (i == 0 || i == 5) return sphereAt(u_place[i], u_time * 0.12 + float(i) * 1.3 + u_pointer.x * 0.35);
  vec2 f = i == 1 ? a_f1 : i == 2 ? a_f2 : i == 3 ? a_f3 : a_f4;
  return vec3(u_place[i].xy + f * u_place[i].z, 0.4);
}
void main() {
  vec3 A = shapeAt(u_seg);
  vec3 B = shapeAt(min(u_seg + 1, 5));
  // Cada partícula sai e chega no seu tempo: a forma se desfaz e se refaz de modo orgânico
  float d = (a_seed.z - 0.5) * 0.16;
  float m = smoothstep(0.3 + d, 0.7 + d, u_t);
  float burst = pow(sin(3.14159265 * m), 0.75);
  burst = max(burst, u_intro * (0.55 + 0.45 * a_seed.w));
  vec2 cloud = a_seed.xy * u_res * 1.08 - u_res * 0.04;
  cloud += vec2(sin(u_time * 0.35 + a_seed.z * 6.283), cos(u_time * 0.29 + a_seed.w * 6.283)) * 26.0;
  vec2 formed = mix(A.xy, B.xy, m) + vec2(sin(u_time * 1.3 + a_seed.w * 20.0), cos(u_time * 1.1 + a_seed.z * 20.0)) * 1.1;
  vec2 pos = mix(formed, cloud, burst);
  // Mouse (só desktop, u_pointer.z = 1): empurra de leve as partículas a até 90 px do ponteiro
  vec2 away = pos - (u_pointer.xy * 0.5 + 0.5) * u_res;
  float dist = max(length(away), 0.001);
  pos += away / dist * max(0.0, 90.0 - dist) * 0.35 * u_pointer.z;
  float depth = mix(mix(A.z, B.z, m), 0.3, burst);
  float size = u_size * (0.65 + a_seed.w * 0.7) * (0.8 + 0.2 * depth) * (1.0 + burst * 0.5);
  float ang = a_seed.w * 6.283 + u_time * (0.25 + burst * 2.2) * (a_seed.z - 0.5);
  int vid = gl_VertexID;
  float ca = 1.5708 + float(vid) * 2.0944;
  vec2 corner = vec2(cos(ca + ang), sin(ca + ang));
  vec2 p = pos + corner * size;
  vec2 clip = p / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  int ci = int(floor(fract(a_seed.z * 13.37) * 4.0));
  vec3 col = ci == 0 ? u_pal[0] : ci == 1 ? u_pal[1] : ci == 2 ? u_pal[2] : u_pal[3];
  v_col = col * (0.82 + 0.36 * a_seed.y);
  float front = clamp(depth * 0.5 + 0.5, 0.0, 1.0);
  v_alpha = (0.35 + 0.65 * front) * (1.0 - burst * 0.2) * (a_sph.w > 0.5 ? 1.15 : 1.0);
  v_bary = vid == 0 ? vec3(1, 0, 0) : vid == 1 ? vec3(0, 1, 0) : vec3(0, 0, 1);
}`;

const FRAG = `#version 300 es
precision mediump float;
in vec3 v_col;
in float v_alpha;
in vec3 v_bary;
uniform float u_line;
out vec4 o;
void main() {
  // Contorno fino (≈1,25 px na tela) e um preenchimento bem leve
  float e = min(min(v_bary.x, v_bary.y), v_bary.z);
  float w = fwidth(e) * u_line;
  float line = 1.0 - smoothstep(w * 0.5, w * 1.5, e);
  float a = clamp(v_alpha * max(line, 0.16), 0.0, 1.0);
  o = vec4(v_col * a, a);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
  return s;
}

/** Sementes estáveis por partícula (mesma sequência a cada visita). */
function seeds(n: number) {
  const out = new Float32Array(n * 4);
  let s = 7;
  for (let i = 0; i < out.length; i++) out[i] = (s = (s * 16807) % 2147483647) / 2147483647;
  return out;
}

type Loop = { setProgress(p: number): void; setPalette(p: StageOptions["palette"]): void; skipIntro(): void; destroy(): void };

/** Ciclo comum aos dois motores: progresso suavizado, visibilidade, resize com debounce, FPS adaptativo. */
function runLoop(canvas: HTMLCanvasElement, opts: StageOptions, draw: (s: { w: number; h: number; dpr: number; time: number; p: number; intro: number; pointer: [number, number, number] }) => void,
  onResize: (w: number, h: number, dpr: number) => void, reduce: () => boolean, cleanup: () => void): Loop {
  const maxDpr = opts.mobile ? 1.5 : 2;
  let w = 0, h = 0, dpr = 1;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, r.width); h = Math.max(1, r.height); dpr = Math.min(maxDpr, devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    onResize(w, h, dpr);
  };
  resize();
  let resizeTimer: ReturnType<typeof setTimeout> | undefined;
  const onWinResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); };
  addEventListener("resize", onWinResize, { passive: true });

  let target = 0, p = 0, intro = opts.intro ? 1 : 0;
  const pointer: [number, number, number] = [0, 0, 0];
  const pTarget: [number, number] = [0, 0];
  const onMove = (e: PointerEvent) => { pTarget[0] = (e.clientX / innerWidth) * 2 - 1; pTarget[1] = (e.clientY / innerHeight) * 2 - 1; };
  if (opts.pointer) addEventListener("pointermove", onMove, { passive: true });

  const start = performance.now();
  let visible = true, frame = 0, last = start;
  // FPS: mede ~1,5 s de cada vez; abaixo de ~50 fps reduz a quantidade (até duas vezes)
  let fpsFrames = 0, fpsStart = last, cuts = 0;
  const tick = (now: number) => {
    frame = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    p += (target - p) * (1 - Math.exp(-dt * 9));
    if (Math.abs(target - p) < 0.0004) p = target;
    if (intro > 0) intro = Math.max(0, intro - dt / 0.9);
    pointer[0] += (pTarget[0] - pointer[0]) * (1 - Math.exp(-dt * 4));
    pointer[1] += (pTarget[1] - pointer[1]) * (1 - Math.exp(-dt * 4));
    draw({ w, h, dpr, time: (now - start) / 1000, p, intro: intro * intro * (3 - 2 * intro), pointer });
    fpsFrames++;
    if (cuts < 2 && now - fpsStart > 1500) {
      const fps = (fpsFrames * 1000) / (now - fpsStart);
      if (fps < 50 && reduce()) cuts++;
      else cuts = 2;
      fpsFrames = 0; fpsStart = now;
    }
    if (visible && !document.hidden) frame = requestAnimationFrame(tick);
  };
  const play = () => { if (!frame && visible && !document.hidden) { last = performance.now(); fpsStart = last; fpsFrames = 0; frame = requestAnimationFrame(tick); } };
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) play(); });
  io.observe(canvas);
  const onVis = () => play();
  document.addEventListener("visibilitychange", onVis);
  play();
  return {
    setProgress(v) { target = Math.max(0, Math.min(1, v)); play(); },
    setPalette() { /* trocado pelo motor */ },
    skipIntro() { intro = 0; },
    destroy() {
      cancelAnimationFrame(frame); frame = 0; visible = false;
      io.disconnect();
      clearTimeout(resizeTimer);
      removeEventListener("resize", onWinResize);
      removeEventListener("pointermove", onMove);
      document.removeEventListener("visibilitychange", onVis);
      cleanup();
    },
  };
}

function startWebGL(canvas: HTMLCanvasElement, data: Data, n: number, opts: StageOptions): Stage | null {
  const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true, powerPreference: "low-power" });
  if (!gl) return null;
  let prog: WebGLProgram;
  try {
    prog = gl.createProgram()!;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT), fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    gl.deleteShader(vs); gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link");
  } catch {
    return null;
  }
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const buffers: WebGLBuffer[] = [];
  const attr = (loc: number, size: number, src: Int8Array | Float32Array) => {
    const b = gl.createBuffer()!;
    buffers.push(b);
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, src, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    if (src instanceof Int8Array) gl.vertexAttribPointer(loc, size, gl.BYTE, true, 0, 0);
    else gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(loc, 1);
  };
  // Esfera: x, y, z de -1 a 1 e a marca do monograma (0/1) na 4ª coordenada
  const sph = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    sph[i * 4] = data.esfera[i * 4] / 127; sph[i * 4 + 1] = data.esfera[i * 4 + 1] / 127;
    sph[i * 4 + 2] = data.esfera[i * 4 + 2] / 127; sph[i * 4 + 3] = data.esfera[i * 4 + 3];
  }
  attr(0, 4, sph);
  data.formas.forEach((f, k) => attr(1 + k, 2, f.subarray(0, n * 2)));
  attr(5, 4, seeds(n));
  gl.bindVertexArray(null);

  gl.useProgram(prog);
  const u = (name: string) => gl.getUniformLocation(prog, name);
  const U = { res: u("u_res"), time: u("u_time"), t: u("u_t"), seg: u("u_seg"), place: u("u_place"), pal: u("u_pal"), size: u("u_size"), intro: u("u_intro"), line: u("u_line"), pointer: u("u_pointer") };
  const setPal = (pal: StageOptions["palette"]) => { gl.useProgram(prog); gl.uniform3fv(U.pal, new Float32Array(pal.flatMap(hex))); };
  setPal(opts.palette);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);

  let count = n;
  let place = new Float32Array(18);
  const loop = runLoop(canvas, opts, ({ w, h, dpr, time, p, intro, pointer }) => {
    const { seg, t } = timeline(p);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog);
    gl.uniform2f(U.res, w, h);
    gl.uniform1f(U.time, time);
    gl.uniform1f(U.t, t);
    gl.uniform1i(U.seg, seg);
    gl.uniform3fv(U.place, place);
    gl.uniform1f(U.size, opts.mobile ? 3.4 : 4.4);
    gl.uniform1f(U.intro, intro);
    gl.uniform1f(U.line, 1.25 * dpr);
    gl.uniform3f(U.pointer, pointer[0], pointer[1], opts.pointer ? 1 : 0);
    gl.bindVertexArray(vao);
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 3, count);
    gl.bindVertexArray(null);
  }, (w, h) => { place = new Float32Array(placements(w, h, opts.mobile, opts.heroTop?.()).flat()); }, () => {
    if (count <= 1200) return false;
    count = Math.max(1200, Math.floor(count * 0.6));
    return true;
  }, () => {
    buffers.forEach((b) => gl.deleteBuffer(b));
    gl.deleteVertexArray(vao);
    gl.deleteProgram(prog);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  });
  return { ...loop, setPalette: setPal, kind: "webgl" };
}

/** Plano B sem WebGL2: a mesma conta na CPU, com no máximo 1200 triângulos preenchidos. */
function start2D(canvas: HTMLCanvasElement, data: Data, opts: StageOptions): Stage | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const n = Math.min(1200, data.esfera.length / 4);
  const sd = seeds(n);
  let pal = opts.palette;
  let place = placements(1, 1, opts.mobile);
  const loop = runLoop(canvas, opts, ({ w, h, dpr, time, p, intro, pointer }) => {
    const { seg, t } = timeline(p);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const shape = (i: number, k: number): [number, number] => {
      const [px, py, s] = place[i];
      if (i === 0 || i === 5) {
        const e = data.esfera, m = e[k * 4 + 3];
        let x = e[k * 4] / 127, z = e[k * 4 + 2] / 127;
        if (!m) { const a = time * 0.12 + i * 1.3 + pointer[0] * 0.35, c = Math.cos(a), sn = Math.sin(a); [x, z] = [c * x + sn * z, -sn * x + c * z]; }
        return [px + x * s, py + (e[k * 4 + 1] / 127) * s];
      }
      const f = data.formas[i - 1];
      return [px + (f[k * 2] / 127) * s, py + (f[k * 2 + 1] / 127) * s];
    };
    for (let k = 0; k < n; k++) {
      const d = (sd[k * 4 + 2] - 0.5) * 0.16;
      const x0 = Math.min(1, Math.max(0, (t - 0.3 - d) / 0.4)), m = x0 * x0 * (3 - 2 * x0);
      const burst = Math.max(Math.sin(Math.PI * m) ** 0.75, intro * (0.55 + 0.45 * sd[k * 4 + 3]));
      const [ax, ay] = shape(seg, k), [bx, by] = shape(Math.min(seg + 1, SEGMENTS), k);
      const cx = sd[k * 4] * w * 1.08 - w * 0.04 + Math.sin(time * 0.35 + sd[k * 4 + 2] * 6.283) * 26;
      const cy = sd[k * 4 + 1] * h * 1.08 - h * 0.04 + Math.cos(time * 0.29 + sd[k * 4 + 3] * 6.283) * 26;
      const fx = ax + (bx - ax) * m, fy = ay + (by - ay) * m;
      const x = fx + (cx - fx) * burst, y = fy + (cy - fy) * burst;
      const size = (opts.mobile ? 3.4 : 4.4) * (0.65 + sd[k * 4 + 3] * 0.7);
      const ang = sd[k * 4 + 3] * 6.283 + time * (0.25 + burst * 2.2) * (sd[k * 4 + 2] - 0.5);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = pal[Math.floor((sd[k * 4 + 2] * 13.37 % 1) * 4)];
      ctx.beginPath();
      for (let v = 0; v < 3; v++) { const a = ang + 1.5708 + v * 2.0944; ctx[v ? "lineTo" : "moveTo"](x + Math.cos(a) * size, y + Math.sin(a) * size); }
      ctx.fill();
    }
  }, (w, h) => { place = placements(w, h, opts.mobile, opts.heroTop?.()); }, () => false, () => {});
  return { ...loop, setPalette: (p) => { pal = p; }, kind: "2d" };
}

/** Sobe o palco no canvas. Devolve null se não houver como desenhar (o chamador mostra o fallback estático). */
export async function startParticleStage(canvas: HTMLCanvasElement, opts: StageOptions): Promise<Stage | null> {
  const n = opts.mobile ? 2000 : 6000;
  const data = await loadData(n);
  return startWebGL(canvas, data, n, opts) ?? start2D(canvas, data, opts);
}
