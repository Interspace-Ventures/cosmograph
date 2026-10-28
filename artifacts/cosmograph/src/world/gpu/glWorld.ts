// The world's GPU layer: one WebGL2 canvas under the SVG/DOM layer. Raw WebGL2,
// no library: the whole renderer is a few KB of shaders and buffers, where
// PixiJS v8 would add ~200 KB min (~60 KB gz) and regl ~80 KB min (~27 KB gz)
// for features this view never uses (scene graph, text, filters).
//
// Three instanced passes, each a single draw call however big the world is:
//   1. ground  : the pre-rendered deep-zoom pyramid (islands, bowls, tiles,
//                machines at rest), 256 px tiles out of one TEXTURE_2D_ARRAY
//   2. auras   : one quad per island aura, gradients + pulse in the shader,
//                screen-blended like v9's mix-blend-mode:screen
//   3. sprites : one quad per machine on screen, playing its pre-baked flipbook
//                from another TEXTURE_2D_ARRAY; the frame is picked in the
//                vertex shader from time + a per-instance phase, so motion
//                costs nothing on the CPU
//
// The camera is three uniforms (centre x, y and zoom). Panning and zooming
// re-upload nothing but a tiny per-frame list of visible ground tiles.

export interface GLCam {
  x: number;
  y: number;
  /** CSS px per world unit */
  z: number;
}

const TILE_PX = 256;

const VS_TILE = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aRect;   // world x, y, w, h
layout(location=2) in vec4 aUv;     // u0, v0, u1, v1 (0..1 within the tile)
layout(location=3) in float aLayer;
uniform vec3 uCam;   // x, y, z (css px per unit)
uniform vec2 uView;  // css px
out vec3 vUv;
void main(){
  vec2 w = aRect.xy + aCorner * aRect.zw;
  vec2 s = (w - uCam.xy) * uCam.z / (uView * 0.5);
  gl_Position = vec4(s.x, -s.y, 0.0, 1.0);
  vUv = vec3(mix(aUv.xy, aUv.zw, aCorner), aLayer);
}`;

const FS_TILE = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;
uniform sampler2DArray uTex;
in vec3 vUv;
out vec4 o;
void main(){ o = texture(uTex, vUv); }`;

// Aura: v9's pool (radial), beam + core (bottom-anchored elliptical gradients)
// and the iso ring, all in one quad per island, pulsing .62..1 over 3.2 s.
const VS_AURA = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aBase;   // ring centre (iso, island level)
layout(location=2) in vec2 aTop;    // beam foot
layout(location=3) in vec4 aCol;    // accent rgb, phase
layout(location=4) in vec3 aEd;     // accent mixed 45% to white
uniform vec3 uCam;
uniform vec2 uView;
out vec2 vW;
flat out vec2 vBase;
flat out vec2 vTop;
flat out vec4 vCol;
flat out vec3 vEd;
void main(){
  // box covering pool (560 x 320 around the base) and beam (300 x 3000 above the top)
  vec2 lo = vec2(min(aBase.x - 560.0, aTop.x - 150.0), aTop.y - 3000.0);
  vec2 hi = vec2(max(aBase.x + 560.0, aTop.x + 150.0), aBase.y + 320.0);
  vec2 w = mix(lo, hi, aCorner);
  vec2 s = (w - uCam.xy) * uCam.z / (uView * 0.5);
  gl_Position = vec4(s.x, -s.y, 0.0, 1.0);
  vW = w; vBase = aBase; vTop = aTop; vCol = aCol; vEd = aEd;
}`;

const FS_AURA = `#version 300 es
precision highp float;
uniform float uTime;
uniform float uAura;   // zoom fade (v9 --aura)
uniform float uPulse;  // 1 = animate, 0 = held still
uniform float uZ;
in vec2 vW;
flat in vec2 vBase;
flat in vec2 vTop;
flat in vec4 vCol;
flat in vec3 vEd;
out vec4 o;
// 3-stop gradient: (0: a0 ed) (m: a1 acc) (1: 0)
vec4 grad(float t, float a0, float m, float a1){
  t = clamp(t, 0.0, 1.0);
  vec3 c; float a;
  if (t < m) { float k = t / m; c = mix(vEd, vCol.rgb, k); a = mix(a0, a1, k); }
  else { float k = (t - m) / (1.0 - m); c = vCol.rgb; a = mix(a1, 0.0, k); }
  return vec4(c * a, a);
}
void main(){
  vec2 p = vW;
  // pool: ellipse 560 x 320 around the base
  vec2 q = (p - vBase) / vec2(560.0, 320.0);
  vec4 col = grad(length(q), 0.5, 0.45, 0.2) * 0.9;
  // beam 300 x 3000 and core 48 x 2400 above the top: objectBoundingBox radial
  // gradient centred bottom-middle, radius = half the width across, full height up
  vec2 b = p - vTop;
  if (b.y <= 0.0) {
    if (abs(b.x) < 150.0 && b.y > -3000.0) {
      vec2 u = vec2(b.x / 150.0, b.y / 3000.0);
      vec4 g = grad(length(u), 0.55, 0.3, 0.22);
      col = col + g * (1.0 - col.a);
    }
    if (abs(b.x) < 24.0 && b.y > -2400.0) {
      vec2 u = vec2(b.x / 24.0, b.y / 2400.0);
      vec4 g = grad(length(u), 0.9, 0.35, 0.35);
      col = col + g * (1.0 - col.a);
    }
  }
  // ring: iso diamond (plan +-168) drawn with a 3 css px stroke
  vec2 r = abs(p - vBase);
  float hx = 300.5, hy = 150.3;
  float dd = (r.x / hx + r.y / hy - 1.0) * (hx * hy / length(vec2(hx, hy))) * uZ;
  float ring = (1.0 - smoothstep(1.0, 2.0, abs(dd))) * 0.85;
  col = col + vec4(vCol.rgb * ring, ring) * (1.0 - col.a);
  float pulse = mix(1.0, 0.81 + 0.19 * sin(6.2831853 * (uTime / 3.2 + vCol.a)), uPulse);
  o = col * uAura * pulse;
}`;

// Sprites: one quad per machine on screen; the flipbook frame is chosen here.
const VS_SPRITE = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aRect;   // world x, y, w, h
layout(location=2) in vec4 aFlip;   // layer, first cell, phase (0..1), alpha
layout(location=3) in vec4 aTint;   // eraser: ground rgb, 1 = paint the rest silhouette in it
uniform vec3 uCam;
uniform vec2 uView;
uniform float uTime;
uniform float uAnim;    // 1 = play, 0 = rest frame
uniform vec4 uCells;    // cols, rows, frames, fps
out vec3 vUv;
out float vA;
out vec4 vTint;
void main(){
  vec2 w = aRect.xy + aCorner * aRect.zw;
  vec2 s = (w - uCam.xy) * uCam.z / (uView * 0.5);
  gl_Position = vec4(s.x, -s.y, 0.0, 1.0);
  float n = uCells.z;
  // ping-pong 0..n-1..1 so a few frames read as a loop
  float period = max(1.0, 2.0 * n - 2.0);
  float k = mod(floor(uTime * uCells.w + aFlip.z * period), period);
  float f = uAnim * (1.0 - aTint.w) * (k < n ? k : period - k);
  float cell = aFlip.y + f;
  float col = mod(cell, uCells.x);
  float row = floor(cell / uCells.x);
  vUv = vec3((vec2(col, row) + aCorner) / uCells.xy, aFlip.x);
  vA = aFlip.w;
  vTint = aTint;
}`;

const FS_SPRITE = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;
uniform sampler2DArray uTex;
in vec3 vUv;
in float vA;
in vec4 vTint;
out vec4 o;
void main(){
  vec4 c = texture(uTex, vUv);
  // eraser: the silhouette (slightly thickened by its alpha) in the ground colour
  o = (vTint.w > 0.5 ? vec4(vTint.rgb, 1.0) * min(1.0, c.a * 1.6) : c) * vA;
}`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader");
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link");
  return p;
}

interface Pass {
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
  cap: number;
  count: number;
  u: Record<string, WebGLUniformLocation | null>;
}

export interface TextureArray {
  tex: WebGLTexture;
  w: number;
  h: number;
  layers: number;
}

export class GLWorld {
  readonly gl: WebGL2RenderingContext;
  private corner: WebGLBuffer;
  private tile: Pass;
  private aura: Pass;
  private sprite: Pass;
  tiles: TextureArray;
  flip: TextureArray | null = null;
  private w = 1;
  private h = 1;
  scale = 1;
  /** bytes of GPU texture memory allocated (estimate: RGBA8, no mips) */
  texBytes = 0;
  lost = false;

  static create(canvas: HTMLCanvasElement, tileLayers: number): GLWorld | null {
    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
      });
    } catch {
      gl = null;
    }
    if (!gl) return null;
    try {
      return new GLWorld(gl, canvas, tileLayers);
    } catch (e) {
      console.warn("[world] WebGL2 setup failed, using the SVG renderer", e);
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement, tileLayers: number) {
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.lost = true;
    });
    this.corner = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    // ground: rect(4) uv(4) layer(1)
    this.tile = this.pass(VS_TILE, FS_TILE, [4, 4, 1], ["uCam", "uView", "uTex"]);
    // aura: base(2) top(2) col(4) ed(3)
    this.aura = this.pass(VS_AURA, FS_AURA, [2, 2, 4, 3], ["uCam", "uView", "uTime", "uAura", "uPulse", "uZ"]);
    // sprite: rect(4) flip(4) tint(4)
    this.sprite = this.pass(VS_SPRITE, FS_SPRITE, [4, 4, 4], ["uCam", "uView", "uTime", "uAnim", "uCells", "uTex"]);
    this.tiles = this.texArray(TILE_PX, TILE_PX, tileLayers);
    gl.clearColor(0x15 / 255, 0x16 / 255, 0x1c / 255, 1);
    gl.enable(gl.BLEND);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  }

  private pass(vs: string, fs: string, sizes: number[], uniforms: string[]): Pass {
    const gl = this.gl;
    const prog = compile(gl, vs, fs);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corner);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const stride = sizes.reduce((a, b) => a + b, 0) * 4;
    let off = 0;
    sizes.forEach((n, i) => {
      gl.enableVertexAttribArray(i + 1);
      gl.vertexAttribPointer(i + 1, n, gl.FLOAT, false, stride, off);
      gl.vertexAttribDivisor(i + 1, 1);
      off += n * 4;
    });
    gl.bindVertexArray(null);
    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const n of uniforms) u[n] = gl.getUniformLocation(prog, n);
    return { prog, vao, buf, cap: 0, count: 0, u };
  }

  texArray(w: number, h: number, layers: number): TextureArray {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, w, h, layers);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.texBytes += w * h * 4 * layers;
    return { tex, w, h, layers };
  }

  ensureFlip(w: number, h: number, layers: number): TextureArray {
    if (this.flip && this.flip.w === w && this.flip.h === h && this.flip.layers === layers) return this.flip;
    if (this.flip) {
      this.gl.deleteTexture(this.flip.tex);
      this.texBytes -= this.flip.w * this.flip.h * 4 * this.flip.layers;
    }
    this.flip = this.texArray(w, h, layers);
    return this.flip;
  }

  /** Upload a premultiplied bitmap into one layer (bitmap may be smaller than the layer). */
  upload(ta: TextureArray, layer: number, img: TexImageSource) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, ta.tex);
    const iw = (img as ImageBitmap).width ?? ta.w;
    const ih = (img as ImageBitmap).height ?? ta.h;
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, Math.min(iw, ta.w), Math.min(ih, ta.h), 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
  }

  private fill(p: Pass, data: Float32Array, count: number) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, p.buf);
    if (data.byteLength > p.cap) {
      p.cap = data.byteLength * 2;
      gl.bufferData(gl.ARRAY_BUFFER, p.cap, gl.DYNAMIC_DRAW);
    }
    if (count) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    p.count = count;
  }

  setTiles(data: Float32Array, count: number) {
    this.fill(this.tile, data.subarray(0, count * 9), count);
  }
  setAuras(data: Float32Array, count: number) {
    this.fill(this.aura, data.subarray(0, count * 11), count);
  }
  setSprites(data: Float32Array, count: number) {
    this.fill(this.sprite, data.subarray(0, count * 12), count);
  }

  resize(cssW: number, cssH: number, scale: number) {
    const c = this.gl.canvas as HTMLCanvasElement;
    const W = Math.max(1, Math.round(cssW * scale));
    const H = Math.max(1, Math.round(cssH * scale));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    this.w = cssW;
    this.h = cssH;
    this.scale = scale;
  }

  draw(
    cam: GLCam,
    t: number,
    o: { aura: number; pulse: boolean; anim: boolean; cells: [number, number, number, number] },
  ) {
    const gl = this.gl;
    if (this.lost) return;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const setCam = (p: Pass) => {
      gl.uniform3f(p.u.uCam!, cam.x, cam.y, cam.z);
      gl.uniform2f(p.u.uView!, this.w, this.h);
    };
    // premultiplied "over"
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (this.tile.count) {
      const p = this.tile;
      gl.useProgram(p.prog);
      setCam(p);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.tiles.tex);
      gl.uniform1i(p.u.uTex!, 0);
      gl.bindVertexArray(p.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, p.count);
    }
    if (this.sprite.count && this.flip) {
      const p = this.sprite;
      gl.useProgram(p.prog);
      setCam(p);
      gl.uniform1f(p.u.uTime!, t);
      gl.uniform1f(p.u.uAnim!, o.anim ? 1 : 0);
      gl.uniform4f(p.u.uCells!, ...o.cells);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.flip.tex);
      gl.uniform1i(p.u.uTex!, 0);
      gl.bindVertexArray(p.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, p.count);
    }
    if (this.aura.count && o.aura > 0.005) {
      const p = this.aura;
      // screen blend: src + dst * (1 - src)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
      gl.useProgram(p.prog);
      setCam(p);
      gl.uniform1f(p.u.uTime!, t);
      gl.uniform1f(p.u.uAura!, o.aura);
      gl.uniform1f(p.u.uPulse!, o.pulse ? 1 : 0);
      gl.uniform1f(p.u.uZ!, cam.z);
      gl.bindVertexArray(p.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, p.count);
    }
    gl.bindVertexArray(null);
  }
}
