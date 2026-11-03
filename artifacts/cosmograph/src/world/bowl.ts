// Island "bowls": the glass hull under each flat island top. A sphere through the
// four top corners, lofted so the corner creases start sharp at the top and fade
// into a round bowl. Shading is software-rasterised into a canvas per island
// (no WebGL) and clipped to the exact silhouette, re-rendered as the zoom changes.
// Ported from the approved v8 mockup.

import { at, convexHull, ISLAND_Z, type Vec2 } from "./iso";
import { hslRgb, lum, TINT_S, type RGB } from "./color";

export interface BowlMesh {
  X: Float64Array;
  Y: Float64Array;
  Z: Float64Array;
  N: number;
  M: number;
}

export function bowlMesh(h: number, D: number, s: number, R: number, N: number, M: number): BowlMesh {
  const X = new Float64Array((M + 1) * N);
  const Y = new Float64Array((M + 1) * N);
  const Z = new Float64Array((M + 1) * N);
  for (let m = 0; m <= M; m++) {
    const f = Math.pow(m / M, 1.35);
    const z = -f * D;
    const c = Math.min(h * Math.SQRT2, Math.sqrt(Math.max(0, R * R - (z - s) * (z - s))));
    const r = Math.SQRT1_2 * (1 + (Math.SQRT2 - 1) * f * f);
    const a = Math.min(h, c * r);
    const p =
      m === 0
        ? 1e3
        : Math.max(2, Math.min(1e3, 1 / Math.max(1e-3, 0.5 - Math.log2(Math.max(1, c / Math.max(a, 1e-9))))));
    for (let n = 0; n < N; n++) {
      const q = (4 * n) / N;
      const side = Math.floor(q);
      const w = q - side;
      const t = -1 + 2 * w;
      let sx: number;
      let sy: number;
      if (side === 0) {
        sx = 1;
        sy = t;
      } else if (side === 1) {
        sx = -t;
        sy = 1;
      } else if (side === 2) {
        sx = -1;
        sy = -t;
      } else {
        sx = t;
        sy = -1;
      }
      const k = m === 0 ? 1 : 1 / Math.pow(Math.pow(Math.abs(sx), p) + Math.pow(Math.abs(sy), p), 1 / p);
      const i = m * N + n;
      X[i] = sx * k * a;
      Y[i] = sy * k * a;
      Z[i] = z;
    }
  }
  return { X, Y, Z, N, M };
}

export interface BowlGeom {
  /** half side of the flat top */
  h: number;
  /** depth from the top to the lowest point */
  D: number;
  /** sphere centre height above the top plane */
  s: number;
  R: number;
}

export function bowlFromDepth(h: number, depthW: number): BowlGeom {
  const s = (2 * h * h - depthW * depthW) / (2 * depthW);
  return { h, D: depthW, s, R: Math.hypot(Math.SQRT2 * h, s) };
}

export function bowlHull(C: Vec2, g: BowlGeom): Vec2[] {
  const mesh = bowlMesh(g.h, g.D, g.s, g.R, 160, 60);
  const P: Vec2[] = [];
  for (let v = 0; v < mesh.X.length; v++) P.push(at([C[0] + mesh.X[v], C[1] + mesh.Y[v], ISLAND_Z + mesh.Z[v]]));
  // the top square corners are part of the silhouette too
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push(at([C[0] + a * g.h, C[1] + b * g.h, ISLAND_Z]));
  return convexHull(P);
}

export interface BowlRenderSpec extends BowlGeom {
  /** screen origin of the island centre at the top plane */
  o: Vec2;
  /** silhouette bbox in world svg units */
  bb: [number, number, number, number];
  hue: number;
  acc: RGB;
  seed: number;
}

const SA = Math.SQRT1_2;
const CA = Math.SQRT1_2;
const SE = 0.5;
const CE = Math.sqrt(3) / 2;
const KK = Math.sqrt(1.6);
const DV = [CA * CE, SA * CE, SE]; // toward the viewer
const E1 = [SA, -CA, 0];
const E2 = [CA * SE, SA * SE, -CE];
const LV = (() => {
  const v = [DV[0] - 0.08, DV[1] + 0.02, DV[2] + 0.62];
  const l = Math.hypot(v[0], v[1], v[2]);
  return v.map((a) => a / l);
})();

/** Rasterise one bowl at `res` device px per world unit. Returns [neutral, tinted] PNG data urls. */
export function renderBowl(b: BowlRenderSpec, res: number): [string, string] | null {
  const [x0, y0, x1, y1] = b.bb;
  const W = Math.max(8, Math.round((x1 - x0) * res));
  const H = Math.max(8, Math.round((y1 - y0) * res));
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const cx = cv.getContext("2d");
  const cv2 = document.createElement("canvas");
  cv2.width = W;
  cv2.height = H;
  const cx2 = cv2.getContext("2d");
  if (!cx || !cx2) return null;
  const im = cx.createImageData(W, H);
  const px = im.data;
  const im2 = cx2.createImageData(W, H);
  const px2 = im2.data;
  const Nn = Math.min(512, Math.max(96, (Math.round(W / 2.5) >> 2) << 2));
  const Mm = Math.min(220, Math.max(48, Math.round(H / 3)));
  const g = bowlMesh(b.h, b.D, b.s, b.R, Nn, Mm);
  const NV = g.X.length;
  const SX = new Float32Array(NV);
  const SY = new Float32Array(NV);
  const SZ = new Float32Array(NV);
  const NX = new Float32Array(NV);
  const NY = new Float32Array(NV);
  const NZ = new Float32Array(NV);
  for (let v = 0; v < NV; v++) {
    const x = g.X[v];
    const y = g.Y[v];
    const z = g.Z[v];
    SX[v] = (b.o[0] + KK * (x * E1[0] + y * E1[1]) - x0) * res;
    SY[v] = (b.o[1] + KK * (x * E2[0] + y * E2[1] + z * E2[2]) - y0) * res;
    SZ[v] = x * DV[0] + y * DV[1] + z * DV[2];
  }
  for (let m = 0; m <= Mm; m++)
    for (let n = 0; n < Nn; n++) {
      const v = m * Nn + n;
      const l = m * Nn + ((n + Nn - 1) % Nn);
      const r = m * Nn + ((n + 1) % Nn);
      const u = Math.max(0, m - 1) * Nn + n;
      const d = Math.min(Mm, m + 1) * Nn + n;
      const ax = g.X[r] - g.X[l];
      const ay = g.Y[r] - g.Y[l];
      const az = g.Z[r] - g.Z[l];
      const bx = g.X[d] - g.X[u];
      const by = g.Y[d] - g.Y[u];
      const bz = g.Z[d] - g.Z[u];
      let nx = ay * bz - az * by;
      let ny = az * bx - ax * bz;
      let nz = ax * by - ay * bx;
      if (m === Mm) {
        nx = 0;
        ny = 0;
        nz = -1;
      }
      const L = Math.hypot(nx, ny, nz) || 1;
      NX[v] = nx / L;
      NY[v] = ny / L;
      NZ[v] = nz / L;
    }
  {
    const v = Math.floor(Mm / 2) * Nn;
    if (NX[v] * g.X[v] + NY[v] * g.Y[v] < 0)
      for (let k = 0; k < NV; k++) {
        NX[k] = -NX[k];
        NY[k] = -NY[k];
        NZ[k] = -NZ[k];
      }
  }
  const zb = new Float32Array(W * H).fill(-1e9);
  const nb = new Float32Array(W * H * 4);
  const tri = (A: number, B: number, C: number) => {
    const ax = SX[A];
    const ay = SY[A];
    const bx = SX[B];
    const by = SY[B];
    const cxx = SX[C];
    const cy = SY[C];
    const ar = (bx - ax) * (cy - ay) - (by - ay) * (cxx - ax);
    if (Math.abs(ar) < 1e-9) return;
    const nA = NX[A] * DV[0] + NY[A] * DV[1] + NZ[A] * DV[2];
    const nB = NX[B] * DV[0] + NY[B] * DV[1] + NZ[B] * DV[2];
    const nC = NX[C] * DV[0] + NY[C] * DV[1] + NZ[C] * DV[2];
    if (nA < -0.05 && nB < -0.05 && nC < -0.05) return;
    const minx = Math.max(0, Math.floor(Math.min(ax, bx, cxx)));
    const maxx = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cxx)));
    const miny = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxy = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = miny; y <= maxy; y++)
      for (let x = minx; x <= maxx; x++) {
        const qx = x + 0.5;
        const qy = y + 0.5;
        const w0 = ((bx - qx) * (cy - qy) - (by - qy) * (cxx - qx)) / ar;
        const w1 = ((cxx - qx) * (ay - qy) - (cy - qy) * (ax - qx)) / ar;
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4) continue;
        const z = w0 * SZ[A] + w1 * SZ[B] + w2 * SZ[C];
        const o = y * W + x;
        if (z <= zb[o]) continue;
        zb[o] = z;
        nb[o * 4] = w0 * NX[A] + w1 * NX[B] + w2 * NX[C];
        nb[o * 4 + 1] = w0 * NY[A] + w1 * NY[B] + w2 * NY[C];
        nb[o * 4 + 2] = w0 * NZ[A] + w1 * NZ[B] + w2 * NZ[C];
        nb[o * 4 + 3] = -(w0 * g.Z[A] + w1 * g.Z[B] + w2 * g.Z[C]) / b.D;
      }
  };
  for (let m = 0; m < Mm; m++)
    for (let n = 0; n < Nn; n++) {
      const a = m * Nn + n;
      const bq = m * Nn + ((n + 1) % Nn);
      const c = (m + 1) * Nn + ((n + 1) % Nn);
      const d = (m + 1) * Nn + n;
      tri(a, bq, c);
      tri(a, c, d);
    }
  const tint = hslRgb(b.hue, 14, 50).map((c) => 1 + (c / 0.5 - 1) * 0.5) as RGB;
  const lt = lum(tint) / Math.max(1e-6, lum(b.acc));
  const tintT = tint.map((v, k) => v * (1 - TINT_S) + b.acc[k] * lt * TINT_S);
  let seed = b.seed * 977 + 13;
  const rn = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ch = (v: number) => Math.max(0, Math.min(255, Math.pow(Math.max(0, v), 1 / 1.15) * 255));
  for (let o = 0; o < W * H; o++) {
    let L: number;
    if (zb[o] < -1e8) L = 0.012;
    else {
      let nx = nb[o * 4];
      let ny = nb[o * 4 + 1];
      let nz = nb[o * 4 + 2];
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l;
      ny /= l;
      nz /= l;
      const f = Math.min(1, Math.max(0, nb[o * 4 + 3]));
      const ndl = Math.max(0, nx * LV[0] + ny * LV[1] + nz * LV[2]);
      const ndv = Math.max(0, nx * DV[0] + ny * DV[1] + nz * DV[2]);
      L =
        0.022 +
        0.34 * Math.pow(ndl, 1.3) * (1 - 0.6 * Math.pow(f, 1.2)) +
        0.035 * Math.pow(1 - ndv, 3) * (1 - f * 0.5) +
        0.08 * Math.pow(ndv, 6) * (1 - f) * (1 - f) +
        0.1 * Math.exp((-f * b.D) / 14);
    }
    const dz = (rn() - 0.5) / 255;
    const p4 = o * 4;
    px[p4] = ch(L * tint[0] + dz);
    px[p4 + 1] = ch(L * tint[1] + dz);
    px[p4 + 2] = ch(L * tint[2] + dz);
    px[p4 + 3] = 255;
    px2[p4] = ch(L * tintT[0] + dz);
    px2[p4 + 1] = ch(L * tintT[1] + dz);
    px2[p4 + 2] = ch(L * tintT[2] + dz);
    px2[p4 + 3] = 255;
  }
  cx.putImageData(im, 0, 0);
  cx2.putImageData(im2, 0, 0);
  return [cv.toDataURL("image/png"), cv2.toDataURL("image/png")];
}
