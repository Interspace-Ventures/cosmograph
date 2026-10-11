"""Cosmograph cube spike v2: a free-flowing 3D cuboidal galaxy.

Owner feedback applied:
- Planets are perfect N×N×N voxel cubes, N from 1 to 9 on a continuous log
  scale of citations, so 175 and 275 citations look different.
- No platforms. Systems float freely in a thick 3D disk, clustered by field.
- Full camera freedom: orbit through any angle (including vertical), pan,
  zoom. Iso and Top are presets, not constraints.
- Stars are a deep 3D shell, so zooming all the way out stays starry.
- Every planet moves on its own terms: its own tumble axis and speed, some
  doing Rampart quarter-turn rolls, orbit lanes on their own tilted planes,
  with Kepler speeds (inner faster).
- Distance from the sun means something: papers most central to the field
  orbit closest.
- Each field has its own surface texture (bands, continents, caps, craters,
  stripes, speckle...) so systems feel distinct beyond colour.
"""
import json, pathlib

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[2]
SRC = REPO / "artifacts/cosmograph/src/data/galaxyData.json"
OUT = HERE / "cube-v3.html"
CHANGELOG = json.loads((HERE / "changelog.json").read_text())  # exported from artifacts/cosmograph/src/data/changelog.ts
d = json.loads(SRC.read_text())
data = {
    "author": d["author"].get("name"),
    "stats": d["stats"],
    "domains": [
        {"id": x["id"], "name": x["name"], "field": x["field"], "papers": x["paperCount"], "cites": x["totalCitations"]}
        for x in d["domains"]
    ],
    "changelog": CHANGELOG,
    "papers": [
        [p["domainId"], p["title"][:140], p["year"], p["citations"], round(p.get("relevance") or 0.5, 3), p.get("coAuthorCount", 0)]
        for p in d["papers"]
    ],
}

HTML = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Cosmograph — cube galaxy v3</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
<style>
  :root{--bg:#0e0c13;--panel:#1a1722;--ink:#f3f1f7;--dim:#a49eb5;--accent:#a388ee;--edge:#000}
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif;overflow:hidden}
  canvas{display:block}
  #stage{position:fixed;inset:0}
  .mono{font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:.12em}
  .panel{background:var(--panel);border:2px solid var(--edge);box-shadow:6px 6px 0 var(--edge)}
  #top{position:fixed;left:16px;right:16px;top:16px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;pointer-events:none}
  #brand{padding:10px 14px;pointer-events:auto}
  #brand b{display:block;font-size:20px;font-weight:800}
  #brand span{font-size:10px;color:var(--dim)}
  #kpis{display:grid;grid-template-columns:repeat(3,minmax(90px,auto));pointer-events:auto}
  #kpis div{padding:8px 12px;border-right:2px solid var(--edge)}
  #kpis div:last-child{border-right:0;text-align:right}
  #kpis small{display:block;font-size:9px;color:var(--dim)}
  #kpis strong{font-size:18px;font-variant-numeric:tabular-nums}
  #systems{position:fixed;left:16px;bottom:16px;width:290px;max-height:52vh;overflow:auto;scrollbar-width:thin;scrollbar-color:#000 var(--panel)}
  #systems h3{margin:0;padding:10px 12px;font-size:10px;color:var(--dim);border-bottom:2px solid var(--edge);cursor:pointer}
  #systems button{all:unset;display:flex;justify-content:space-between;gap:8px;width:100%;padding:8px 18px 8px 12px;font-size:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,.06)}
  #systems button:hover{background:rgba(163,136,238,.12)}
  #systems button.on{background:var(--accent);color:#000}
  #systems button i{font-style:normal;width:10px;height:10px;border:2px solid #000;flex:none;margin-top:3px}
  #systems button em{font-style:normal;font-family:"Space Mono",monospace;font-size:10px;opacity:.7}
  .tag{position:fixed;left:0;top:0;pointer-events:none;font:700 10px "Space Mono",monospace;text-transform:uppercase;letter-spacing:.1em;padding:3px 6px;background:var(--panel);border:2px solid #000;box-shadow:3px 3px 0 #000;white-space:nowrap;transition:opacity .2s}
  .tag.on{background:var(--accent);color:#000}
  #card{position:fixed;right:16px;bottom:16px;width:330px;padding:14px;display:none}
  #card .mono{font-size:9px;color:var(--accent)}
  #card h4{margin:6px 0 10px;font-size:15px;line-height:1.3}
  #card .row{display:grid;grid-template-columns:1fr 1fr 1fr;border:2px solid var(--edge)}
  #card .row div{padding:6px 8px;border-right:2px solid var(--edge)}
  #card .row div:last-child{border-right:0;text-align:right}
  #card .row small{display:block;font-size:9px;color:var(--dim)}
  #legend{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);font-size:10px;color:var(--dim);padding:6px 10px;display:flex;gap:14px;align-items:center;white-space:nowrap}
  #legend b{color:var(--ink);font-weight:700}
  #jump{position:fixed;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .15s}
  #jump.on{opacity:1}
  #jump .mono{font-size:13px;background:var(--panel);border:2px solid #000;box-shadow:6px 6px 0 #000;padding:8px 14px}
  #toggles{position:fixed;right:16px;top:96px;display:flex;flex-direction:column;gap:8px}
  #toggles button{all:unset;cursor:pointer;font-size:10px;font-family:"Space Mono",monospace;text-transform:uppercase;letter-spacing:.1em;padding:8px 10px;background:var(--panel);border:2px solid #000;box-shadow:4px 4px 0 #000}
  #toggles button:active{transform:translate(4px,4px);box-shadow:none}
  @media (max-width:720px){#systems{width:auto;right:16px;max-height:44px;overflow:hidden}#systems.open{max-height:46vh;overflow:auto}#kpis,#legend{display:none}#toggles{top:auto;bottom:76px}#card{left:16px;width:auto;bottom:76px}}

  #hdr{position:fixed;left:0;right:0;top:0;display:flex;align-items:stretch;justify-content:space-between;border-bottom:2px solid #000;background:rgba(18,16,24,.82);backdrop-filter:blur(14px);z-index:20}
  #hdr .l{display:flex;align-items:center;gap:12px;padding:10px 16px}
  #hdr .l b{font-size:22px;font-weight:800;letter-spacing:-.02em}
  #hdr .l .ver{font-size:9px;color:var(--dim);border:2px solid #000;padding:2px 6px;background:var(--panel)}
  #hdr .r{display:flex}
  #hdr .r button{all:unset;cursor:pointer;font-size:10px;padding:0 16px;border-left:2px solid #000;display:flex;align-items:center;gap:6px}
  #hdr .r button:hover{background:rgba(163,136,238,.14)}
  #promo{position:fixed;left:50%;top:62px;transform:translateX(-50%);z-index:19;font-size:10px;padding:7px 12px;display:flex;gap:10px;align-items:center;white-space:nowrap}
  #promo button{all:unset;cursor:pointer;background:var(--accent);color:#000;padding:3px 8px;border:2px solid #000}
  #hero{position:fixed;left:0;right:0;top:108px;text-align:center;pointer-events:none;z-index:5}
  #hero .eyebrow{font-size:10px;color:var(--accent)}
  #stats{display:inline-grid;grid-template-columns:repeat(6,auto);margin-top:10px;pointer-events:auto}
  #stats div{padding:8px 14px;border-right:2px solid #000;text-align:left}
  #stats div:last-child{border-right:0}
  #stats strong{display:block;font-size:20px;font-variant-numeric:tabular-nums}
  #stats small{font-size:9px;color:var(--dim)}
  #stats .live strong{color:var(--accent)}
  #dock{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);display:flex;z-index:20}
  #dock button{all:unset;position:relative;cursor:pointer;font-size:10px;padding:12px 14px;border-right:2px solid #000;display:flex;flex-direction:column;align-items:center;gap:5px;min-width:62px}
  #dock button:last-child{border-right:0}
  #dock button .ico{font-size:15px;line-height:1}
  #dock button:hover:not(.soon){background:rgba(163,136,238,.14)}
  #dock button.on{background:var(--accent);color:#000}
  #dock button.primary{background:var(--ink);color:#000}
  #dock button.soon{color:#6c6680;cursor:help}
  #dock button.soon::after{content:"SOON";position:absolute;top:4px;right:4px;font-size:6px;letter-spacing:.1em;background:#000;color:var(--accent);border:1px solid var(--accent);padding:1px 4px}
  #foot{position:fixed;left:320px;right:200px;bottom:100px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;font-size:9px;color:#6c6680;pointer-events:none;z-index:4}
  .drawer{position:fixed;top:62px;bottom:84px;right:16px;width:420px;overflow:auto;z-index:21;display:none;padding:0;scrollbar-width:thin;scrollbar-color:#000 var(--panel)}
  .drawer.open{display:block}
  .drawer .tabs{display:flex;border-bottom:2px solid #000;position:sticky;top:0;background:var(--panel)}
  .drawer .tabs button{all:unset;cursor:pointer;flex:1;text-align:center;font-size:10px;padding:10px;border-right:2px solid #000}
  .drawer .tabs button:last-child{border-right:0}
  .drawer .tabs button.on{background:var(--accent);color:#000}
  .drawer .x{all:unset;cursor:pointer;position:absolute;right:10px;top:8px;font-size:16px}
  .drawer section{padding:16px 18px;border-bottom:2px solid #000}
  .drawer h5{margin:0 0 8px;font-size:10px;color:var(--accent)}
  .drawer h6{margin:0 0 10px;font-size:17px;line-height:1.25}
  .drawer p,.drawer li{font-size:13px;line-height:1.55;color:#d9d4e6}
  .drawer ul{padding-left:18px;margin:6px 0}
  .drawer .kv{display:grid;grid-template-columns:1fr 1fr;border:2px solid #000;margin-top:8px}
  .drawer .kv div{padding:8px 10px;border-right:2px solid #000;border-bottom:2px solid #000;font-size:12px}
  .drawer .kv div:nth-child(2n){border-right:0}
  .drawer .kv b{display:block;font-size:9px;color:var(--dim);font-family:"Space Mono",monospace;letter-spacing:.1em;text-transform:uppercase}
  .rel{padding:12px 18px;border-bottom:1px solid rgba(255,255,255,.07)}
  .rel .meta{font-size:9px;color:var(--dim)}
  .rel .meta i{font-style:normal;color:var(--accent)}
  .rel strong{display:block;font-size:13px;margin:4px 0}
  .plans{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:6px}
  .plan{border:2px solid #000;box-shadow:4px 4px 0 #000;padding:12px;background:#15121d}
  .plan.hi{background:var(--accent);color:#000}
  .plan.hi p,.plan.hi li{color:#000}
  .plan .price{font-size:26px;font-weight:800}
  .plan .price small{font-size:11px;font-weight:600}
  .cta{all:unset;cursor:pointer;display:block;text-align:center;margin-top:10px;padding:9px;border:2px solid #000;background:#000;color:var(--ink);font-size:10px}
  .plan.hi .cta{background:#000;color:var(--accent)}
  #toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:30;font-size:11px;padding:8px 12px;display:none}
  #brand,#kpis,#legend{display:none!important}
  #toggles{top:auto;bottom:20px}
  #systems{bottom:20px;max-height:calc(100vh - 380px);overflow-x:hidden}
  #systems button{box-sizing:border-box}
  #systems button em{padding-right:4px}
  #card{bottom:76px}
  @media (max-width:720px){#hdr .r button span{display:none}#promo{display:none}#stats{grid-template-columns:repeat(3,auto)}#stats div:nth-child(n+4){display:none}#dock button{min-width:0;padding:10px 8px}#dock button .lbl{font-size:8px}.drawer{left:8px;right:8px;width:auto}#foot{display:none}#hero{top:72px}#systems{bottom:84px}}
  @media (max-width:720px){
    #systems{left:8px;right:auto;width:200px;bottom:84px;max-height:38px;overflow:hidden}
    #systems.open{max-height:46vh;overflow:auto}
    #dock{left:8px;right:8px;transform:none;justify-content:space-between}
    #dock button{flex:1;min-width:0;padding:9px 2px;gap:3px}
    #dock button .lbl{font-size:7px;letter-spacing:.04em;white-space:nowrap}
    #dock button.soon::after{top:2px;right:2px;font-size:5px;padding:0 2px}
    #eyebrow{font-size:8px;padding:0 12px}
    #toggles{bottom:84px}
  }
</style>
<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.170.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.170.0/examples/jsm/"}}</script>
</head>
<body>
<div id="stage"></div>
<div id="top" style="display:none"><div id="brand"></div><div id="kpis"></div></div>
<header id="hdr">
  <div class="l"><b>cosmograph</b><span class="ver mono" id="ver"></span></div>
  <div class="r mono">
    <button id="hShare">↗ <span>Share</span></button>
    <button id="hSponsor">♥ <span>Sponsor</span></button>
    <button id="hSource">⌘ <span>Source</span></button>
  </div>
</header>
<div id="promo" class="panel mono">Launching soon · $9.99 / year or $29.99 lifetime <button id="promoBtn">See what's included</button></div>
<div id="hero">
  <div class="eyebrow mono" id="eyebrow"></div>
  <div id="stats" class="panel mono"></div>
</div>
<nav id="dock" class="panel mono">
  <button class="primary" data-act="signup"><span class="ico">✦</span><span class="lbl">Sign up</span></button>
  <button data-act="tour"><span class="ico">▶</span><span class="lbl">Tour</span></button>
  <button class="on" data-act="orbit"><span class="ico">◎</span><span class="lbl">Orbit</span></button>
  <button class="soon" data-act="fly" data-soon="Fly mode: pilot your own ship through the galaxy."><span class="ico">➤</span><span class="lbl">Fly</span></button>
  <button data-act="info"><span class="ico">i</span><span class="lbl">Info</span></button>
  <button class="soon" data-act="ask" data-soon="Ask Cosmo: ask about the work and watch matching papers light up."><span class="ico">✳</span><span class="lbl">Ask</span></button>
  <button class="soon" data-act="gift" data-soon="Make it a gift: their name, an envelope reveal, and a guided walk through their journey."><span class="ico">✉</span><span class="lbl">Gift</span></button>
</nav>
<div id="foot" class="mono"></div>
<div id="toast" class="panel mono"></div>
<aside id="info" class="drawer panel"><button class="x" data-close>×</button>
  <div class="tabs mono"><button class="on" data-tab="about">About</button><button data-tab="guide">Guide</button><button data-tab="log">Changelog</button></div>
  <div data-pane="about"></div><div data-pane="guide" hidden></div><div data-pane="log" hidden></div>
</aside>
<aside id="pricing" class="drawer panel"><button class="x" data-close>×</button><div id="pricingBody"></div></aside>
<div id="toggles">
  <button class="mono" id="tour" style="display:none">▶ Jump tour</button>
  <button class="mono" id="iso">◇ Iso view</button>
  <button class="mono" id="topv">⊙ Top view</button>
</div>
<div id="systems" class="panel"><h3 class="mono">Systems · tap to jump</h3><div id="list"></div></div>
<div id="card" class="panel"></div>
<div id="legend" class="mono panel"><span><b>Bigger cube</b> = more citations</span><span><b>Closer to sun</b> = more central to the field</span><span>Drag rotate · Right-drag pan · Scroll zoom</span></div>
<div id="tags"></div>
<div id="jump"><div class="mono" id="jumpLabel">Jumping</div></div>

<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const DATA = __DATA__;
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("en-US");
const rand = (seed) => { let s = (seed % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

// Field palette: no purples (purple = selection + HUD only).
const PALETTE = ["#6fc3ff","#ffc94d","#5fe0a8","#ff6f5e","#ff4d6d","#b6e35a","#ff7fd0","#3fd9d9","#ff9a2e","#ffb3a0","#c9f2ff","#8f9cff"];
// Each field gets its own surface texture, applied to voxel colours only (shape stays a perfect cube).
const PATTERNS = ["continents","bands","caps","craters","stripes","speckle","equator","checker","continents","bands","craters","caps"];

// $("who").textContent = `${DATA.author} · ${DATA.stats.firstYear}–${DATA.stats.lastYear}`;
const _unusedK = [["Papers", DATA.stats.totalPapers], ["Citations", DATA.stats.totalCitations], ["Systems", DATA.domains.length]]
  .map(([k, v]) => `<div><small>${k}</small><strong>${fmt(v)}</strong></div>`).join("");

// ------------------------------------------------------------------ renderer + camera
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x0e0c13);
renderer.autoClear = false;
$("stage").appendChild(renderer.domElement);
const aspect = () => innerWidth / innerHeight;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0e0c13, 2600, 11000);   // far systems recede
// A narrow FOV keeps cubes reading as true cubes while still giving real depth.
const camera = new THREE.PerspectiveCamera(30, aspect(), 1, 140000);
// Bloom, as on the original site: only the brightest pixels (suns) spill light.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.6, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minPolarAngle = 0.02; controls.maxPolarAngle = Math.PI - 0.02;   // go fully vertical either way
controls.minDistance = 60; controls.maxDistance = 14000;
controls.screenSpacePanning = true;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
const ISO_DIR = new THREE.Vector3(Math.SQRT1_2, Math.tan(Math.atan(1 / Math.SQRT2)), Math.SQRT1_2).normalize();
camera.position.copy(ISO_DIR).multiplyScalar(3000);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const key = new THREE.DirectionalLight(0xffffff, 0.45); key.position.set(-0.5, 1, 0.3); scene.add(key);
const bands = new Uint8Array([80, 165, 255]);
const gradient = new THREE.DataTexture(bands, 3, 1, THREE.RedFormat);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.needsUpdate = true;

// ------------------------------------------------------------------ stars
// A deep 3D shell (plus nearer dust), so the sky never runs out when you zoom out.
function starLayer(n, rMin, rMax, size, opacity, seed) {
  const r = rand(seed), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const tints = [[1, 1, 1], [0.8, 0.85, 1], [1, 0.92, 0.8], [0.85, 0.8, 1]];
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), R = rMin + Math.pow(r(), 0.6) * (rMax - rMin);
    pos.set([Math.cos(th) * s * R, u * R, Math.sin(th) * s * R], i * 3);
    const t = tints[Math.floor(r() * tints.length)], b = 0.55 + r() * 0.45;
    col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, transparent: true, opacity, depthWrite: false, fog: false }));
  pts.frustumCulled = false; scene.add(pts); return pts;
}
// The original site's painted galaxy panorama as a skybox (Milky Way band, nebula colour, depth),
// then thousands of real points in front of it at several depths and sizes.
new THREE.TextureLoader().load("../../../artifacts/cosmograph/public/textures/galaxy_starfield.png", (tex) => {
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(60000, 60, 40), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.scale.x = -1; sky.renderOrder = -10; scene.add(sky);
});
starLayer(9000, 20000, 50000, 2.2, 0.95, 11);
starLayer(5000, 6000, 20000, 1.6, 0.75, 23);
starLayer(1500, 3000, 9000, 2.8, 0.6, 29);
const dust = starLayer(900, 200, 2600, 1.1, 0.35, 37);

// ------------------------------------------------------------------ cube bodies
const glowTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); // same stops as the original site
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.18, "rgba(255,255,255,0.7)"); gr.addColorStop(0.4, "rgba(255,244,214,0.28)"); gr.addColorStop(0.75, "rgba(255,238,200,0.06)"); gr.addColorStop(1, "rgba(255,238,200,0)");
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const box = new THREE.BoxGeometry(1, 1, 1);
const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
const VOXEL = 4.2;
const LMAX = Math.log1p(Math.max(...DATA.papers.map((p) => p[3])));
// Continuous: every integer side length 1..9, from a log scale of citations.
const cubeN = (c) => 1 + Math.round(8 * Math.pow(Math.log1p(c) / LMAX, 1.6));
const shellCache = new Map();
function shell(n) {
  if (shellCache.has(n)) return shellCache.get(n);
  const h = (n - 1) / 2, out = [];
  for (let x = -h; x <= h; x++) for (let y = -h; y <= h; y++) for (let z = -h; z <= h; z++)
    if (Math.abs(x) === h || Math.abs(y) === h || Math.abs(z) === h) out.push([x, y, z]);
  shellCache.set(n, out); return out;
}
const tone = (c, k) => c.clone().lerp(new THREE.Color(k > 0 ? 0xffffff : 0x0b0a10), Math.abs(k));
// Surface patterns: returns 0 base, 1 dark, 2 light, 3 accent.
function voxelTone(pattern, ix, iy, iz, n, seed, r) {
  if (n === 1) return 0;
  switch (pattern) {
    case "bands": return Math.floor(iy * 4 / n) % 2 ? 1 : (iy === n - 1 ? 2 : 0);
    case "caps": return iy === 0 || iy === n - 1 ? 2 : (r() < 0.12 ? 1 : 0);
    case "craters": return r() < 0.14 ? 1 : (r() < 0.06 ? 2 : 0);
    case "stripes": return (ix + iz + seed) % 3 === 0 ? 1 : 0;
    case "speckle": return r() < 0.28 ? 2 : 0;
    case "equator": return iy === Math.floor(n / 2) ? 3 : (iy > n / 2 ? 2 : 0);
    case "checker": return (ix + iy + iz) % 2 ? 1 : 0;
    default: { // continents
      const s = Math.sin(ix * 1.3 + seed) + Math.cos(iz * 1.1 + seed * 2) + Math.sin(iy * 0.9 + seed * 3);
      return s > 0.8 ? 1 : s < -1.3 ? 2 : 0;
    }
  }
}

// ------------------------------------------------------------------ systems
const byDomain = new Map(DATA.domains.map((dm) => [dm.id, []]));
DATA.papers.forEach((p, i) => byDomain.get(p[0])?.push(i));
const maxYear = DATA.stats.lastYear, minYear = DATA.stats.firstYear;
const systems = [], pickables = [];

DATA.domains.forEach((dm, si) => {
  const color = new THREE.Color(PALETTE[si % PALETTE.length]);
  const pattern = PATTERNS[si % PATTERNS.length];
  const g = new THREE.Group(); scene.add(g);
  const r = rand(si * 7919 + 13);

  // Sun: a bright, unlit cube (it emits), slowly tumbling on a tilted axis.
  const sunS = 44 + Math.log2(1 + dm.papers) * 9;   // suns clearly outrank the biggest planet (9 voxels = 38)
  const sun = new THREE.Group(); g.add(sun);
  // White-hot, like the original: each face is the field colour pushed toward warm white, with per-sun variety.
  const hot = color.clone().lerp(new THREE.Color("#fff6e6"), 0.45);
  const vary = (r() - 0.5) * 0.25;
  const sunCore = new THREE.Mesh(box, [0.35, 0.15, 0.55, 0.0, 0.45, 0.25].map((k) => new THREE.MeshBasicMaterial({ color: tone(hot, Math.min(0.6, k + vary)), toneMapped: false })) /* faces keep their cube edges; the halo does the glowing */);
  sunCore.scale.setScalar(sunS); sun.add(sunCore);
  const sunHull = new THREE.Mesh(box, outlineMat); sunHull.scale.setScalar(sunS + 4); sun.add(sunHull);
  sunCore.userData = { kind: "sun", si }; pickables.push(sunCore);
  // Corona, as on the original site: two additive shells (cube-shaped here) plus a big radial glow.
  [[1.22, 0.14, hot], [1.6, 0.05, color]].forEach(([m, op, c]) => {
    const shellM = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    shellM.scale.setScalar(sunS * m); sun.add(shellM);
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: hot, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(sunS * 5); glow.renderOrder = -1; g.add(glow);
  const breathe = { mats: sunCore.material, base: sunCore.material.map((m) => m.color.clone()), ph: r() * 6 };
  const sunAxis = new THREE.Vector3(r() - 0.5, 1, r() - 0.5).normalize();
  sun.quaternion.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
  const sunQ0 = sun.quaternion.clone();
  // The sun lights its own planets (warm, near-white tint of its colour).
  const light = new THREE.PointLight(color, 2.0, sunS * 60, 0);   // decay 0, as on the original
  g.add(light);

  // Planets: papers sorted by how central they are to the field; inner lanes first.
  const idx = (byDomain.get(dm.id) ?? []).slice().sort((a, b) => DATA.papers[b][4] - DATA.papers[a][4]);
  const planets = idx.map((pi) => {
    const p = DATA.papers[pi], n = cubeN(p[3]);
    return { pi, n, size: n * VOXEL, voxels: shell(n) };
  });
  // Lane packing. A lane takes cubes while their tumbling diagonals (+gap) fit
  // its circumference. Lanes are separated by the sum of half-diagonals, and
  // points on different lanes sit on spheres of different radius, so no two
  // cubes can ever touch (|r1 - r2| bounds their distance from below).
  const lanes = [];
  let cur = null;
  let inner = sunS * 0.87 + 14;
  for (const pl of planets) {
    const need = pl.size * 1.8 + 6;
    if (!cur || cur.used + need > 2 * Math.PI * (inner + Math.max(cur.maxS, pl.size) * 0.87) * 0.55) {
      if (cur) inner = cur.R + cur.maxS * 0.87 + 10;
      cur = { list: [], used: 0, maxS: 0, R: 0 }; lanes.push(cur);
    }
    cur.list.push(pl); cur.used += need; cur.maxS = Math.max(cur.maxS, pl.size);
    cur.R = inner + cur.maxS * 0.87;
  }
  const ringPts = [];
  lanes.forEach((ln, li) => {
    // Every lane has its own tilt and node: a real system, not one flat disc.
    ln.q = new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 1.1, r() * Math.PI * 2, (r() - 0.5) * 0.6, "YXZ"));
    ln.omega = 0.3 * Math.pow(70 / ln.R, 1.5) * (r() < 0.12 ? -1 : 1);   // Kepler: inner faster; a few retrograde
    const total = ln.list.reduce((s, pl) => s + pl.size * 1.8 + 6, 0);
    const slack = (2 * Math.PI * ln.R - total) / ln.list.length;
    let arc = r() * ln.R;
    ln.list.forEach((pl) => {
      arc += (pl.size * 1.8 + 6 + slack) / 2; pl.theta0 = arc / ln.R; arc += (pl.size * 1.8 + 6 + slack) / 2;
      pl.lane = ln;
      // Spin: everyone different. Most tumble on their own axis; ~30% do Rampart's quarter-turn roll.
      pl.mode = r() < 0.3 ? "roll" : "tumble";
      pl.axis = new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
      pl.rate = (0.1 + r() * 0.45) * (r() < 0.5 ? -1 : 1) / Math.sqrt(pl.n);
      pl.period = 1.4 + r() * 2.6;
      pl.q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6));
    });
    const v = new THREE.Vector3(), w = new THREE.Vector3();
    for (let s = 0; s < 128; s++) {
      const a0 = s / 128 * Math.PI * 2, a1 = (s + 1) / 128 * Math.PI * 2;
      v.set(Math.cos(a0) * ln.R, 0, Math.sin(a0) * ln.R).applyQuaternion(ln.q);
      w.set(Math.cos(a1) * ln.R, 0, Math.sin(a1) * ln.R).applyQuaternion(ln.q);
      ringPts.push(v.x, v.y, v.z, w.x, w.y, w.z);
    }
  });
  const extent = lanes.length ? lanes[lanes.length - 1].R + lanes[lanes.length - 1].maxS * 0.87 : sunS;
  const ringGeo = new THREE.BufferGeometry(); ringGeo.setAttribute("position", new THREE.Float32BufferAttribute(ringPts, 3));
  const ringMat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false });
  g.add(new THREE.LineSegments(ringGeo, ringMat));

  // Voxels: one instanced mesh per system; one outline hull per planet.
  const nVox = planets.reduce((s, pl) => s + pl.voxels.length, 0);
  const voxMesh = new THREE.InstancedMesh(box, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: gradient }), nVox);
  const hull = new THREE.InstancedMesh(box, outlineMat, planets.length);
  voxMesh.frustumCulled = hull.frustumCulled = false;
  voxMesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(), extent + 20);
  hull.boundingSphere = voxMesh.boundingSphere;
  const voxOwner = new Int32Array(nVox);
  let vi = 0;
  planets.forEach((pl, k) => {
    const p = DATA.papers[pl.pi], pr = rand(pl.pi * 31 + 5), seed = pl.pi % 7;
    const age = (p[2] - minYear) / Math.max(1, maxYear - minYear);
    const base = color.clone().offsetHSL(0, 0.08, -0.04).lerp(new THREE.Color(0xffffff), 0.18 - age * 0.18);   // older papers slightly paler
    const tones = [base, tone(base, -0.42), tone(base, 0.35), base.clone().offsetHSL(0.08, 0.1, -0.12)].map((c) => c.multiplyScalar(0.86));   // below the bloom threshold: only suns glow
    const h = (pl.n - 1) / 2;
    pl.vStart = vi;
    for (const [x, y, z] of pl.voxels) {
      voxMesh.setColorAt(vi, tones[voxelTone(pattern, x + h, y + h, z + h, pl.n, seed, pr)]);
      voxOwner[vi++] = k;
    }
  });
  voxMesh.instanceColor.needsUpdate = true;
  voxMesh.userData = { kind: "planet", si, voxOwner };
  pickables.push(voxMesh);
  g.add(hull, voxMesh);

  // Selection: a purple outline shell around the sun (reads as a highlight, not a gizmo).
  // Two nested purple wireframe cubes that hug the sun: a highlight, not a panel.
  const brackets = new THREE.Group(); brackets.visible = false; sun.add(brackets);
  { const e = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xa388ee, side: THREE.BackSide }));
    e.scale.setScalar(sunS + 10); brackets.add(e); }   // a thick purple outline, same rotation as the sun
  systems.push({ si, g, sun, sunQ0, sunAxis, sunS, breathe, planets, voxMesh, hull, extent, ringMat, brackets, color });
});

// ------------------------------------------------------------------ galaxy layout (3D, free-flowing)
// Biggest system at the core; others placed beside a system in the same field
// when possible (distance = relatedness), in a thick disk, never overlapping.
{
  const GAP = 300, placed = [], r = rand(4242);
  const order = systems.slice().sort((a, b) => b.extent - a.extent);
  for (const s of order) {
    if (!placed.length) { s.g.position.set(0, 0, 0); placed.push(s); continue; }
    const kin = placed.filter((q) => DATA.domains[q.si].field === DATA.domains[s.si].field);
    const anchors = kin.length ? kin : placed;
    let best = null, bestScore = Infinity;
    for (let tries = 0; tries < 400; tries++) {
      const a = anchors[Math.floor(r() * anchors.length)];
      const dir = new THREE.Vector3(r() - 0.5, (r() - 0.5) * 3, r() - 0.5).normalize();   // a volume, not a disc
      const pos = a.g.position.clone().addScaledVector(dir, a.extent + s.extent + GAP + r() * 60);
      if (placed.some((q) => q.g.position.distanceTo(pos) < q.extent + s.extent + GAP)) continue;
      const targetY = ((s.si * 0.618) % 1 - 0.5) * 1400;   // spread systems over ~1400 units of height
      const score = pos.length() + Math.abs(pos.y - targetY) * 1.5 + (kin.length ? 0 : 200);
      if (score < bestScore) { bestScore = score; best = pos; }
    }
    s.g.position.copy(best ?? new THREE.Vector3(placed.length * 900, 0, 0)); placed.push(s);
  }
}
const galaxyCenter = new THREE.Vector3(), galaxyRadius = (() => {
  systems.forEach((s) => galaxyCenter.add(s.g.position)); galaxyCenter.divideScalar(systems.length);
  return Math.max(...systems.map((s) => s.g.position.distanceTo(galaxyCenter) + s.extent));
})();
dust.position.copy(galaxyCenter);

// ------------------------------------------------------------------ animation
const easedRoll = (p) => p <= 0.15 ? 0 : p >= 0.85 ? 1 : ((x) => x * x * (3 - 2 * x))((p - 0.15) / 0.7);
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _qs = new THREE.Quaternion(), _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _l = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _s = new THREE.Vector3();
let selected = null;
const selBox = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0xa388ee, depthTest: false }));
selBox.renderOrder = 11; selBox.visible = false; scene.add(selBox);

function animate(t) {
  for (const S of systems) {
    _qs.setFromAxisAngle(S.sunAxis, t * 0.08); S.sun.quaternion.multiplyQuaternions(_qs, S.sunQ0);
    { const k = 1 + Math.sin(t * 1.3 + S.breathe.ph) * 0.06; S.breathe.mats.forEach((m, i) => m.color.copy(S.breathe.base[i]).multiplyScalar(k)); }
    S.planets.forEach((pl, k) => {
      const th = pl.theta0 + t * pl.lane.omega;
      _p.set(Math.cos(th) * pl.lane.R, 0, Math.sin(th) * pl.lane.R).applyQuaternion(pl.lane.q);
      if (pl.mode === "roll") {   // Rampart: dwell, tip 90°, dwell
        const steps = (t + pl.theta0 * 3) / pl.period, step = Math.floor(steps);
        _qs.setFromAxisAngle(pl.axis, (step + easedRoll(steps - step)) * Math.PI / 2 * Math.sign(pl.rate));
      } else _qs.setFromAxisAngle(pl.axis, t * pl.rate);
      _q.multiplyQuaternions(_qs, pl.q0);
      _m.compose(_p, _q, _one);
      _w.copy(_m).scale(_s.setScalar(pl.size + 2.6)); S.hull.setMatrixAt(k, _w);
      for (let i = 0; i < pl.voxels.length; i++) {
        const [x, y, z] = pl.voxels[i];
        _l.makeScale(VOXEL * 0.92, VOXEL * 0.92, VOXEL * 0.92).setPosition(x * VOXEL, y * VOXEL, z * VOXEL);
        _w.multiplyMatrices(_m, _l); S.voxMesh.setMatrixAt(pl.vStart + i, _w);
      }
      if (selected && selected.si === S.si && selected.k === k) {
        selBox.position.copy(_p).add(S.g.position); selBox.quaternion.copy(_q); selBox.scale.setScalar(pl.size * 1.3 + 6);
      }
    });
    S.voxMesh.instanceMatrix.needsUpdate = S.hull.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ camera framing
const railPx = () => innerWidth > 720 ? 310 : 0;
const camAnim = { active: false };
function fitDistance(radius) {
  const v = THREE.MathUtils.degToRad(camera.fov), hfov = 2 * Math.atan(Math.tan(v / 2) * aspect());
  const fw = (innerWidth - railPx() - 40) / innerWidth, fh = (innerHeight - (innerWidth > 720 ? 300 : 260)) / innerHeight;
  return Math.min(controls.maxDistance, Math.max(radius / Math.tan(v / 2 * fh), radius / Math.tan(hfov / 2 * fw)) * 0.85);
}
// Move the camera to look at `center` from `dir` (unit, from target to camera), framed to `radius`.
function flyTo(center, radius, dir, ms = 0) {
  const dist = fitDistance(radius);
  const to = { target: center.clone(), pos: center.clone().addScaledVector(dir, dist) };
  // Shift left by half the rail so the subject centres in the free area.
  const tmp = camera.clone(); tmp.position.copy(to.pos); tmp.lookAt(to.target); tmp.updateMatrixWorld();
  const worldPerPx = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / innerHeight;
  const right = new THREE.Vector3().setFromMatrixColumn(tmp.matrixWorld, 0).multiplyScalar(-railPx() / 2 * worldPerPx);
  to.target.add(right); to.pos.add(right);
  if (!ms) { controls.target.copy(to.target); camera.position.copy(to.pos); controls.update(); return; }
  Object.assign(camAnim, { active: true, t0: performance.now(), ms, fromT: controls.target.clone(), fromP: camera.position.clone(), to });
}
function stepCam(now) {
  if (!camAnim.active) return;
  const k = Math.min(1, (now - camAnim.t0) / camAnim.ms), e = 1 - Math.pow(1 - k, 3);
  controls.target.lerpVectors(camAnim.fromT, camAnim.to.target, e);
  // Arc the position around the target (slerp the direction) instead of cutting through.
  const d0 = camAnim.fromP.clone().sub(camAnim.fromT), d1 = camAnim.to.pos.clone().sub(camAnim.to.target);
  const len = THREE.MathUtils.lerp(d0.length(), d1.length(), e);
  const q = new THREE.Quaternion().setFromUnitVectors(d0.clone().normalize(), d1.clone().normalize());
  const dir = d0.clone().normalize().applyQuaternion(new THREE.Quaternion().slerp(q, e));
  camera.position.copy(controls.target).addScaledVector(dir, len);
  if (k >= 1) camAnim.active = false;
}
const viewDir = () => camera.position.clone().sub(controls.target).normalize();
const focus = () => (activeSi === null ? { c: galaxyCenter, r: galaxyRadius } : { c: systems[activeSi].g.position, r: systems[activeSi].extent });
$("iso").onclick = () => { const f = focus(); flyTo(f.c, f.r, ISO_DIR, 800); };
$("topv").onclick = () => { const f = focus(); flyTo(f.c, f.r, new THREE.Vector3(0.001, 1, 0.001).normalize(), 800); };

// ------------------------------------------------------------------ lightspeed jump
const jumpScene = new THREE.Scene(), jumpCam = new THREE.PerspectiveCamera(70, aspect(), 0.1, 2000);
const NS = 900, streakPos = new Float32Array(NS * 6), streaks = [];
for (let i = 0; i < NS; i++) { const a = Math.random() * Math.PI * 2, rr = 34 + Math.random() * 150; streaks.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr, z: -Math.random() * 1500, v: 0.6 + Math.random() * 0.8 }); }
const streakGeo = new THREE.BufferGeometry(); streakGeo.setAttribute("position", new THREE.BufferAttribute(streakPos, 3));
const streakCol = new Float32Array(NS * 6); for (let i = 0; i < NS; i++) streakCol.set([1, 1, 1, 0.05, 0.04, 0.12], i * 6);
streakGeo.setAttribute("color", new THREE.BufferAttribute(streakCol, 3));
const streakMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0 });
const veil = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshBasicMaterial({ color: 0x0e0c13, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
veil.position.z = -1600; jumpScene.add(veil);
const streakLines = new THREE.LineSegments(streakGeo, streakMat); streakLines.renderOrder = 2; jumpScene.add(streakLines);
let jump = null;
function startJump(si) {
  if (jump) return;
  $("jumpLabel").textContent = "Jumping → " + DATA.domains[si].name;
  jump = { t0: performance.now(), si, cut: false };
  $("jump").classList.add("on"); setActive(si);
  setTimeout(() => $("jump").classList.remove("on"), 1700);
}
function jumpFrame(now) {
  const t = (now - jump.t0) / 1000;
  const warp = t < 0.9 ? Math.pow(t / 0.9, 2.2) : t < 1.1 ? 1 : Math.max(0, 1 - (t - 1.1) / 0.5);
  for (let i = 0; i < NS; i++) {
    const s = streaks[i]; s.z += (6 + warp * 90) * s.v; if (s.z > 0) s.z -= 1500;
    const near = (1500 + s.z) / 1500, len = near < 0.45 ? 0 : 2 + warp * (20 + near * near * 700) * s.v;
    streakPos.set([s.x, s.y, s.z, s.x, s.y, s.z - len], i * 6);
  }
  streakGeo.attributes.position.needsUpdate = true;
  streakMat.opacity = Math.min(1, warp * 1.4);
  veil.material.opacity = Math.min(0.92, warp * 1.3);
  if (!jump.cut && t > 1.0) {
    jump.cut = true;
    const S = systems[jump.si];
    // Arrive from a slightly raised, varied angle so each system feels like a new place.
    const dir = new THREE.Vector3(Math.cos(jump.si * 2.1), 0.55, Math.sin(jump.si * 2.1)).normalize();
    flyTo(S.g.position, S.extent, dir);
  }
  const flash = t > 0.95 && t < 1.15 ? 1 - Math.abs(t - 1.05) / 0.1 : 0;
  renderer.setClearColor(new THREE.Color(0x0e0c13).lerp(new THREE.Color(0xe9e2ff), flash * 0.85));
  if (t > 1.6) { jump = null; renderer.setClearColor(0x0e0c13); }
  return warp;
}

// ------------------------------------------------------------------ UI
$("list").innerHTML = DATA.domains.map((dm, i) => `<button data-si="${i}"><span style="display:flex;gap:8px"><i style="background:${PALETTE[i % PALETTE.length]}"></i>${dm.name}</span><em>${dm.papers}</em></button>`).join("");
$("list").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { stopTour(); startJump(+b.dataset.si); $("systems").classList.remove("open"); } });
document.querySelector("#systems h3").addEventListener("click", () => $("systems").classList.toggle("open"));
let activeSi = null;
function setActive(si) {
  activeSi = si;
  document.querySelectorAll("#list button").forEach((b) => b.classList.toggle("on", si !== null && +b.dataset.si === si));
  systems.forEach((S, i) => { S.brackets.visible = i === si; S.ringMat.opacity = i === si ? 0.45 : 0.22; });
  tagEls.forEach((t, i) => t.classList.toggle("on", i === si));
}
const tagEls = DATA.domains.map((dm) => { const el = document.createElement("div"); el.className = "tag"; el.textContent = dm.name; $("tags").appendChild(el); return el; });
const tv = new THREE.Vector3(), camUp = new THREE.Vector3();
function placeTags() {
  camUp.setFromMatrixColumn(camera.matrixWorld, 1);
  const boxes = systems.map((S, i) => {
    tv.copy(S.g.position).addScaledVector(camUp, -(S.sunS * 0.9 + 10)).project(camera);
    const x = (tv.x + 1) / 2 * innerWidth, y = (1 - tv.y) / 2 * innerHeight, w = tagEls[i].offsetWidth;
    tagEls[i].style.transform = `translate(${x - w / 2}px, ${y}px)`;
    const off = tv.z > 1 || x < railPx() + 30 || x > innerWidth - 30 || y < 200 || y > innerHeight - 100;
    return { i, x, y, w, off, depth: tv.z };
  });
  const placed = [];
  boxes.slice().sort((a, b) => (b.i === activeSi) - (a.i === activeSi) || a.depth - b.depth).forEach((b) => {
    const hit = placed.some((q) => Math.abs(q.x - b.x) < (q.w + b.w) / 2 + 6 && Math.abs(q.y - b.y) < 24);
    const phoneHide = innerWidth < 720 && b.i !== activeSi;
    const show = !jump && !b.off && !hit && !phoneHide; if (show) placed.push(b);
    const camD = camera.position.distanceTo(systems[b.i].g.position), fade = THREE.MathUtils.clamp(1 - (camD - scene.fog.near) / (scene.fog.far - scene.fog.near), 0.6, 1);
    tagEls[b.i].style.opacity = show ? fade : 0;
  });
}
function showPaper(si, k) {
  const pl = systems[si].planets[k], p = DATA.papers[pl.pi];
  selected = { si, k }; selBox.visible = true;
  $("card").style.display = "block";
  $("card").innerHTML = `<div class="mono">${DATA.domains[si].name} · ${p[2]}</div><h4>${p[1]}</h4>
    <div class="row mono"><div><small>Citations</small>${fmt(p[3])}</div><div><small>Co-authors</small>${p[5]}</div><div><small>Cube</small>${pl.n}×${pl.n}×${pl.n}</div></div>`;
}
function showSystem(si) {
  const dm = DATA.domains[si]; selected = null; selBox.visible = false; setActive(si);
  $("card").style.display = "block";
  $("card").innerHTML = `<div class="mono">System · ${dm.field}</div><h4>${dm.name}</h4>
    <div class="row mono"><div><small>Papers</small>${dm.papers}</div><div><small>Citations</small>${fmt(dm.cites)}</div><div><small>Surface</small>${PATTERNS[si % PATTERNS.length]}</div></div>`;
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down = null;
renderer.domElement.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(pickables, false)[0];
  if (!hit) return;
  stopTour();
  if (hit.object.userData.kind === "planet") showPaper(hit.object.userData.si, hit.object.userData.voxOwner[hit.instanceId]);
  else showSystem(hit.object.userData.si);
});
let tourTimer = null;
function stopTour() { clearInterval(tourTimer); tourTimer = null; $("tour").textContent = "▶ Jump tour"; }
$("tour").onclick = () => {
  if (tourTimer) return stopTour();
  let i = 0; startJump(i);
  tourTimer = setInterval(() => { i = (i + 1) % DATA.domains.length; startJump(i); }, 4200);
  $("tour").textContent = "■ Stop tour";
};
addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = jumpCam.aspect = aspect(); camera.updateProjectionMatrix(); jumpCam.updateProjectionMatrix();
});


// ------------------------------------------------------------------ app chrome (restored from cosmograph.space)
const CL = DATA.changelog, VER = "v" + CL[0].version;
$("ver").textContent = VER;
$("eyebrow").textContent = `A lifetime of discovery, at galactic scale · ${DATA.author}`;
const ST = DATA.stats;
const words = ST.estimatedWords >= 1e6 ? (ST.estimatedWords / 1e6).toFixed(1) + "M+" : fmt(ST.estimatedWords);
$("stats").innerHTML = [[fmt(ST.totalPapers), "Papers"], [fmt(ST.totalCitations), "Citations"], [fmt(ST.uniqueCoAuthors), "Co-authors"], [ST.yearsActive, "Years"], [words, "Words"], ["2", "Cosmonauts streaming now", "live"]]
  .map(([v, k, c]) => `<div class="${c || ""}"><strong>${v}</strong><small>${k}</small></div>`).join("");
$("foot").textContent = `© 2026 ${VER} · Cosmograph is an Interspace Venture. Built at the speed of thought with AI. Interface built with Structured Liquidity.`;
const toast = (msg) => { const t = $("toast"); t.textContent = msg; t.style.display = "block"; clearTimeout(toast.h); toast.h = setTimeout(() => (t.style.display = "none"), 2600); };
$("hShare").onclick = () => toast("Share cards: capture this galaxy as an image. Launching soon.");
$("hSponsor").onclick = () => window.open("https://github.com/sponsors/heyinterspace", "_blank");
$("hSource").onclick = () => window.open("https://github.com/Interspace-Ventures/cosmograph", "_blank");

// Info drawer: About / Guide / Changelog (copy from the live site).
document.querySelector('[data-pane="about"]').innerHTML = `
  <section><h5 class="mono">About this venture</h5><h6>Research on galactic scale</h6>
  <p>Cosmograph turns a researcher's lifetime of research into a universe you can fly through. Every sun is a field they helped shape, and every cube a paper they published. Right now you're exploring the work of ${DATA.author}.</p>
  <p>It began as a Father's Day gift: a way to make one researcher's life's work feel as vast as it truly is. A career of research usually disappears into citation counts and PDFs; this is an attempt to let you feel the scale of it, and to say thank you to the people who spend their lives expanding what we know.</p>
  <p>Point it at any researcher (a parent, a mentor, or yourself) and the whole galaxy rebuilds from their public record on OpenAlex.</p>
  <div class="kv"><div><b>Papers</b>${fmt(ST.totalPapers)}</div><div><b>Fields</b>${DATA.domains.length}</div><div><b>Data</b>OpenAlex</div><div><b>Built with</b>Three.js · Structured Liquidity</div></div></section>`;
document.querySelector('[data-pane="guide"]').innerHTML = `
  <section><h5 class="mono">The guide to Cosmograph</h5><h6>A lifetime of work, mapped to the stars</h6>
  <p><b>Suns are research fields.</b> Each sun is a field in this body of work. The bigger the sun, the more papers in that field.</p>
  <p><b>Cubes are papers.</b> Every cube orbiting a sun is one published paper. The bigger the cube, the more it has been cited: from a single block up to 9×9×9.</p>
  <p><b>Orbits show relevance.</b> The closer a cube orbits its sun, the more central the paper is to that field.</p>
  <p><b>Surfaces show the field.</b> Each field has its own surface pattern: bands, caps, craters, continents.</p>
  <p><b>Nearby suns are related.</b> Fields in the same broad area of science cluster together.</p></section>
  <section><h5 class="mono">Getting around</h5><h6>Two ways to explore</h6>
  <p><b>Orbit</b> · Float around the galaxy and study it from any angle.</p>
  <ul><li>Drag · rotate and tilt, all the way to vertical</li><li>Right-drag · pan</li><li>Scroll or pinch · zoom</li><li>Click a sun or cube for details</li></ul>
  <p><b>Fly</b> <span class="mono" style="font-size:9px;color:var(--accent)">· launching soon</span> · Drop into the galaxy and pilot your own ship through it.</p></section>`;
document.querySelector('[data-pane="log"]').innerHTML = `<section><h5 class="mono">Flight log</h5><h6>${CL.length} releases since ${new Date(CL.at(-1).date).toLocaleDateString("en-US", { month: "short", year: "numeric" })}</h6></section>` +
  CL.map((r) => `<div class="rel"><div class="meta mono">${"v" + r.version} · <i>${r.codename}</i> · ${new Date(r.date + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div><strong>${r.summary}</strong></div>`).join("");
document.querySelectorAll("#info .tabs button").forEach((b) => b.onclick = () => {
  document.querySelectorAll("#info .tabs button").forEach((x) => x.classList.toggle("on", x === b));
  document.querySelectorAll("#info [data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== b.dataset.tab));
});

// Pricing drawer (new model).
$("pricingBody").innerHTML = `
  <section><h5 class="mono">Membership · launching soon</h5><h6>Exploring is free. Make it theirs.</h6>
  <p>Anyone can explore any researcher's galaxy. Membership turns one into a gift: their name on it, a cosmograph.space link of their own, and a guided walk through their journey.</p>
  <div class="plans">
    <div class="plan"><div class="mono" style="font-size:9px">Annual</div><div class="price">$9.99<small> / year</small></div><ul><li>Everything in membership</li><li>Every release while active</li></ul><button class="cta mono" data-soon="Checkout opens at launch.">Join the waitlist</button></div>
    <div class="plan hi"><div class="mono" style="font-size:9px">Lifetime · best value</div><div class="price">$29.99<small> once</small></div><ul><li>Everything, forever</li><li>Every future release</li></ul><button class="cta mono" data-soon="Checkout opens at launch.">Join the waitlist</button></div>
  </div></section>
  <section><h5 class="mono">Everything membership includes</h5><ul>
    <li>A personal link: <span class="mono" style="font-size:11px">cosmograph.space/<b>rao</b></span></li>
    <li>Their name on the galaxy, with a sealed-envelope reveal when they open it</li>
    <li>A guided walkthrough of their journey, field by field</li>
    <li>Fix the data: merge, hide, or correct papers</li>
    <li>Share cards without the watermark</li>
    <li>Fly mode and every ship type</li>
    <li>Ask Cosmo, with a generous monthly allowance</li>
    <li>More scientists: a whole lab or family</li>
    <li>Every new walkthrough, effect and feature as it ships</li></ul></section>
  <section><h5 class="mono">Free, always</h5><ul><li>Explore any researcher's galaxy</li><li>Orbit, zoom, tour, and click into every paper</li><li>About, guide and changelog</li></ul></section>`;

const openDrawer = (id) => { document.querySelectorAll(".drawer").forEach((d) => d.classList.toggle("open", d.id === id && !d.classList.contains("open"))); };
document.querySelectorAll("[data-close]").forEach((b) => b.onclick = () => b.closest(".drawer").classList.remove("open"));
$("promoBtn").onclick = () => openDrawer("pricing");
document.addEventListener("click", (e) => { const sb = e.target.closest("[data-soon]"); if (sb) { e.stopPropagation(); toast(sb.dataset.soon + "  · Launching soon"); } }, true);
$("dock").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b || b.classList.contains("soon")) return;
  const act = b.dataset.act;
  if (act === "signup") openDrawer("pricing");
  if (act === "info") openDrawer("info");
  if (act === "tour") { $("tour").click(); b.classList.toggle("on", !!tourTimer); }
  if (act === "orbit") { flyTo(galaxyCenter, galaxyRadius, new THREE.Vector3(0.62, 0.62, 0.48).normalize(), 900); setActive(null); }
});
addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".drawer").forEach((d) => d.classList.remove("open")); });

// ------------------------------------------------------------------ loop
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const clock = new THREE.Clock();
function frame(now) {
  const t = reduce ? 0 : clock.getElapsedTime();
  stepCam(now);
  controls.update();
  { // Aerial perspective: things behind the focus point fade toward the background.
    const dd = camera.position.distanceTo(controls.target), R = activeSi === null ? galaxyRadius : Math.max(galaxyRadius * 0.5, systems[activeSi].extent * 3);
    scene.fog.near = Math.max(1, dd - R * 0.45); scene.fog.far = dd + R * 0.75; }
  animate(t);
  camera.updateMatrixWorld();
  placeTags();
  renderer.clear();
  const warp = jump ? jumpFrame(now) : 0;
  { const dd = camera.position.distanceTo(controls.target); bloom.strength = THREE.MathUtils.clamp(dd / 2500, 0.25, 0.9); }
  if (warp < 0.98) composer.render();
  if (jump) { renderer.clearDepth(); renderer.render(jumpScene, jumpCam); }
  requestAnimationFrame(frame);
}
// Open on the whole galaxy, from a raised three-quarter angle.
flyTo(galaxyCenter, galaxyRadius, new THREE.Vector3(0.62, 0.62, 0.48).normalize());
requestAnimationFrame(frame);
window.__fog = () => ({ near: Math.round(scene.fog.near), far: Math.round(scene.fog.far), d: systems.map((S) => Math.round(camera.position.distanceTo(S.g.position))) }); window.__ys = systems.map((S) => Math.round(S.g.position.y)); window.__debug = { systems: systems.map((S) => ({ name: DATA.domains[S.si].name, extent: Math.round(S.extent), lanes: new Set(S.planets.map((p) => p.lane)).size, sizes: [...new Set(S.planets.map((p) => p.n))].sort((a, b) => a - b).join(",") })), galaxyRadius: Math.round(galaxyRadius) };
</script>
</body>
</html>
"""

OUT.write_text(HTML.replace("__DATA__", json.dumps(data, separators=(",", ":"))))
print(OUT, OUT.stat().st_size)
