/**
 * caustic-field — the continuous defocused colour ground.
 * ─────────────────────────────────────────────────────────────────────────
 * Derived from corpus clip 6 (ZOI ICE TEA), where the frame-by-frame read calls this
 * "the single highest-leverage mechanism in the clip". Worth restating why, because it is
 * not an effect in the usual sense:
 *
 *   ONE full-bleed, heavily out-of-focus organic colour field sits under EVERY section.
 *   Its blur and its motion never change. Only its HUE changes, and it changes as a
 *   function of scroll — deep blue, through silver, to amber, to saturated orange.
 *
 * Because a single element spans every section, the site never has a seam. There is no
 * background swap at a section boundary, no hard cut, no divider, no spacing token doing
 * the work: foreground content changes while the ground stays continuous. That is what
 * makes a long page read as one film instead of as a stack of blocks. The corpus sites
 * that feel expensive nearly all do some version of this; the ones that feel like a
 * template put a flat colour behind each section and a rule between them.
 *
 * Zero dependencies, on purpose. No three.js, no import map, no shared Stage — this is
 * raw WebGL against one fullscreen triangle, so it drops into any page including one that
 * has no build step. The whole thing is one file and one <canvas>.
 *
 *   import { initCausticField } from './engine.js'
 *   const bg = initCausticField(document.querySelector('[data-bg]'), {
 *     stops: [
 *       { at: 0.00, deep: '#05070f', mid: '#0d2a4d', hot: '#3fa9f5' },  // hero, cold
 *       { at: 0.55, deep: '#0a0a0c', mid: '#2b2b30', hot: '#c9c4b6' },  // silver
 *       { at: 1.00, deep: '#140803', mid: '#5c2a08', hot: '#ff9a3c' },  // amber
 *     ],
 *   })
 *   bg.setProgress(scrollTop / (scrollHeight - innerHeight))   // 0..1
 *   bg.destroy()
 *
 * prefers-reduced-motion: renders exactly one frame and never opens a rAF loop. The field
 * still recolours on setProgress(), because recolouring is a response to the visitor's own
 * scrolling rather than autonomous motion — the preference asks for no self-driven
 * animation, not for a monochrome page. Re-checked live, so toggling the OS setting takes
 * effect without a reload.
 */

const RM_QUERY = '(prefers-reduced-motion: reduce)';

const DEFAULTS = {
  /** Palette stops along scroll progress. `at` is 0..1 and must ascend. */
  stops: [
    { at: 0.0, deep: '#05070f', mid: '#0d2a4d', hot: '#3fa9f5' },
    { at: 0.5, deep: '#0a0a0c', mid: '#2b2b30', hot: '#c9c4b6' },
    { at: 1.0, deep: '#140803', mid: '#5c2a08', hot: '#ff9a3c' },
  ],
  /** Drift speed of the field. The reference barely moves; this is not a lava lamp. */
  speed: 0.055,
  /** Feature scale. Lower = larger, softer blobs. The defocused look lives here. */
  scale: 1.25,
  /** How tightly the hot colour concentrates into a core, 0..1. */
  focus: 0.62,
  /** Film grain amount, 0..1. Kills banding on large soft gradients — that is its real job. */
  grain: 0.045,
  /** Devicepixelratio ceiling. Clamp BEFORE allocating or a phone allocates 3x for nothing. */
  dprMax: 1.5,
  /** Seconds to ease a progress change, so a jumpy scroll source does not strobe the hue. */
  ease: 0.08,
};

const VERT = `#version 100
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

/* Domain-warped fBm — the standard Inigo Quilez construction. Three nested noise lookups is
 * what turns a bland cloud into something that reads as liquid caught out of focus; two is
 * visibly "noise texture" and four costs frames for a difference nobody sees. */
const FRAG = `#version 100
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform float uScale;
uniform float uFocus;
uniform float uGrain;
uniform vec3  uDeep;
uniform vec3  uMid;
uniform vec3  uHot;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                 dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
             mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                 dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  p *= uScale;

  float t = uTime;
  vec2 q = vec2(fbm(p + vec2(0.0, 0.0) + t * 0.10),
                fbm(p + vec2(5.2, 1.3) - t * 0.08));
  vec2 r = vec2(fbm(p + 3.4 * q + vec2(1.7, 9.2) + t * 0.06),
                fbm(p + 3.4 * q + vec2(8.3, 2.8) - t * 0.05));
  float f = fbm(p + 3.2 * r);
  f = f * 0.5 + 0.5;

  // Two mixes rather than a three-stop gradient: deep->mid fills the frame, then hot is
  // added only where the field peaks. That is what produces a bright CORE with dark
  // shoulders instead of an evenly lit wash.
  vec3 col = mix(uDeep, uMid, smoothstep(0.18, 0.78, f));
  float core = smoothstep(mix(0.86, 0.52, uFocus), 1.0, f + length(r) * 0.35);
  col = mix(col, uHot, core);

  // Radial falloff toward the frame edge. The reference is always brightest around the
  // optical centre; without this the field reads as wallpaper rather than as light.
  float vig = 1.0 - 0.55 * smoothstep(0.25, 1.15, length((gl_FragCoord.xy / uRes - 0.5) * vec2(uRes.x / uRes.y, 1.0)) * 1.6);
  col *= vig;

  // Grain is not decoration here. A field this smooth banks hard on an 8-bit framebuffer;
  // a little per-pixel noise dithers the gradient and the banding disappears.
  float g = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * uGrain;

  gl_FragColor = vec4(col, 1.0);
}`;

const hexToRgb = (hex) => {
  const h = String(hex).replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const rgb = [parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255];
  // Anything that is not hex — 'rebeccapurple', 'rgb(10,20,30)' — takes parseInt to NaN on at
  // least one channel and goes straight into a uniform, where it paints garbage and reads as a
  // colour bug rather than a type error. §6 says log the reason rather than throw.
  if (rgb.some(Number.isNaN)) {
    console.error('[caustic-field] colour must be hex, got:', hex);
    return [0, 0, 0];
  }
  return rgb;
};

const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Resolve the three colours for a progress value by walking the sorted stop list. */
function paletteAt(stops, prog) {
  const s = stops;
  if (prog <= s[0].at) return s[0].rgb;
  if (prog >= s[s.length - 1].at) return s[s.length - 1].rgb;
  for (let i = 0; i < s.length - 1; i++) {
    if (prog >= s[i].at && prog <= s[i + 1].at) {
      const span = s[i + 1].at - s[i].at;
      // A zero-width span would divide by zero and paint NaN, which WebGL renders as black
      // with no error anywhere. Two stops at the same `at` is a legal way to ask for a hard
      // switch, so this is a supported input, not a guard against the impossible.
      const t = span <= 0 ? 1 : (prog - s[i].at) / span;
      const e = t * t * (3 - 2 * t);
      return {
        deep: mix3(s[i].rgb.deep, s[i + 1].rgb.deep, e),
        mid: mix3(s[i].rgb.mid, s[i + 1].rgb.mid, e),
        hot: mix3(s[i].rgb.hot, s[i + 1].rgb.hot, e),
      };
    }
  }
  return s[0].rgb;
}

const inert = () => ({ destroy() {}, setProgress() {}, canvas: null, supported: false });

export function initCausticField(container, config = {}) {
  if (typeof window === 'undefined' || !container) return inert();
  const C = Object.assign({}, DEFAULTS, config);

  const stops = C.stops
    .map((s) => ({ at: s.at, rgb: { deep: hexToRgb(s.deep), mid: hexToRgb(s.mid), hot: hexToRgb(s.hot) } }))
    .sort((a, b) => a.at - b.at);
  if (!stops.length) return inert();

  const canvas = document.createElement('canvas');
  canvas.setAttribute('data-sc', 'caustic-field');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

  const gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  // No WebGL is a real state, not an error: the caller keeps whatever CSS background it
  // already had and the page is simply flatter. Never throw from a decorative layer.
  if (!gl) return inert();

  container.appendChild(canvas);

  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('[caustic-field] shader:', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  };

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { canvas.remove(); return inert(); }

  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('[caustic-field] link:', gl.getProgramInfoLog(prog));
    canvas.remove(); return inert();
  }
  gl.useProgram(prog);

  // One triangle that covers the viewport, not two that make a quad. It is one fewer vertex,
  // and more usefully there is no diagonal seam for the rasteriser to interpolate across.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = {};
  for (const n of ['uRes', 'uTime', 'uScale', 'uFocus', 'uGrain', 'uDeep', 'uMid', 'uHot']) {
    U[n] = gl.getUniformLocation(prog, n);
  }
  gl.uniform1f(U.uScale, C.scale);
  gl.uniform1f(U.uFocus, C.focus);
  gl.uniform1f(U.uGrain, C.grain);

  let destroyed = false;
  let raf = 0;
  let t0 = 0;
  let time = 0;
  let target = 0;      // where scroll says the palette should be
  let current = 0;     // where it actually is, eased
  const rmq = window.matchMedia(RM_QUERY);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, C.dprMax);
    const w = Math.max(1, Math.round(container.clientWidth * dpr));
    const h = Math.max(1, Math.round(container.clientHeight * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(U.uRes, w, h);
  }

  function paint() {
    const pal = paletteAt(stops, current);
    gl.uniform3fv(U.uDeep, pal.deep);
    gl.uniform3fv(U.uMid, pal.mid);
    gl.uniform3fv(U.uHot, pal.hot);
    gl.uniform1f(U.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    if (destroyed) return;
    if (!t0) t0 = now;
    // Re-read the preference every frame rather than caching it at init. A visitor who turns
    // reduce-motion ON mid-session gets a field that stops drifting immediately, and one who
    // turns it off gets the drift back — neither needs a reload.
    if (rmq.matches) { raf = 0; current = target; paint(); return; }
    time = ((now - t0) / 1000) * C.speed;
    current += (target - current) * C.ease;
    resize();
    paint();
    raf = requestAnimationFrame(frame);
  }

  resize();

  if (rmq.matches) {
    // One frame, no loop. Not a still IMAGE of the animation — the same shader at t=0.
    current = target;
    paint();
  } else {
    raf = requestAnimationFrame(frame);
  }

  const onResize = () => { resize(); if (!raf) paint(); };
  window.addEventListener('resize', onResize, { passive: true });

  // Restarting the loop when the preference is switched back off: the frame callback bails
  // out and clears `raf`, so something has to notice the change and kick it again.
  const onPrefChange = () => {
    if (destroyed) return;
    if (!rmq.matches && !raf) { t0 = 0; raf = requestAnimationFrame(frame); }
    else if (rmq.matches) { current = target; paint(); }
  };
  rmq.addEventListener?.('change', onPrefChange);

  return {
    canvas,
    supported: true,
    /** Drive the hue. Accepts 0..1; anything else is clamped rather than wrapped. */
    setProgress(p) {
      target = Math.max(0, Math.min(1, Number(p) || 0));
      // Under reduced motion there is no loop to pick the change up, so paint on demand.
      if (rmq.matches && !destroyed) { current = target; paint(); }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      rmq.removeEventListener?.('change', onPrefChange);
      gl.deleteBuffer(buf); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
      // Release the drawing buffer rather than waiting on GC — a page that mounts and
      // destroys several of these otherwise hits the browser's live-context ceiling (~16)
      // and every later canvas silently fails to acquire one.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    },
  };
}

export default initCausticField;
