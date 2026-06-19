import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { galaxyData, papersByDomain } from "@/data/galaxy";
import { getStellarColor } from "@/lib/colors";
import { useAppState } from "@/lib/store";

const TEX = (f: string) => `${import.meta.env.BASE_URL}textures/${f}`;

const PLANET_TEXTURES = [
  "mercurymap.jpg",
  "venusmap.jpg",
  "earthmap1k.jpg",
  "marsmap1k.jpg",
  "jupitermap.jpg",
  "saturnmap.jpg",
  "uranusmap.jpg",
  "neptunemap.jpg",
  "plutomap1k.jpg",
];
const SATURN_IDX = 5;

// deterministic rng
const mulberry32 = (a: number) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  return hash;
}

export interface OrbitParams {
  a: number;
  e: number;
  incl: number;
  node: number;
  initialAngle: number;
  speed: number;
  planetRadius: number;
  texIndex: number;
}

export const domainPositions: Record<string, THREE.Vector3> = {};
export const sunRadii: Record<string, number> = {};
export const planetOrbits: Record<string, OrbitParams> = {};
export const planetRefs: Record<string, THREE.Object3D> = {};
export const sunRefs: Record<string, THREE.Object3D> = {};

// ----- precompute galaxy distribution + planetary orbits ONCE (deterministic) -----
const ARMS = 3;
const RING_STEP = 470;
const INNER_GALAXY = 380;

galaxyData.domains.forEach((d, i) => {
  const rng = mulberry32(hashString(d.id));
  const arm = i % ARMS;
  const ring = Math.floor(i / ARMS);
  const radius = INNER_GALAXY + ring * RING_STEP + (rng() - 0.5) * 130;
  const armBase = arm * ((Math.PI * 2) / ARMS);
  const angle = armBase + radius * 0.0017 + (rng() - 0.5) * 0.55;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  const y = (rng() - 0.5) * radius * 0.1;
  domainPositions[d.id] = new THREE.Vector3(x, y, z);

  const sunRadius = Math.max(7, Math.sqrt(d.totalCitations) * 0.22);
  sunRadii[d.id] = sunRadius;

  const papers = [...(papersByDomain[d.id] || [])].sort((a, b) => b.relevance - a.relevance);
  const n = papers.length;
  const innerR = sunRadius + 12;
  const targetOuter = innerR + 40 + 9 * Math.sqrt(Math.max(1, n));

  papers.forEach((p, k) => {
    const prng = mulberry32(hashString(p.id));
    const f = n > 1 ? Math.pow(k / (n - 1), 0.82) : 0;
    const a = innerR + (targetOuter - innerR) * f + (prng() - 0.5) * 3;
    const e = 0.02 + prng() * 0.12;
    const incl = (prng() - 0.5) * 0.5;
    const node = prng() * Math.PI * 2;
    const initialAngle = prng() * Math.PI * 2;
    const speed = (0.4 + prng() * 0.5) / Math.sqrt(a);
    const planetRadius = Math.min(6, Math.max(0.7, Math.sqrt(p.citations) * 0.12 + 0.7));
    const texIndex = Math.abs(hashString(p.id)) % PLANET_TEXTURES.length;
    planetOrbits[p.id] = { a, e, incl, node, initialAngle, speed, planetRadius, texIndex };
  });
});

function ellipseR(a: number, e: number, theta: number) {
  return (a * (1 - e * e)) / (1 + e * Math.cos(theta));
}

export function GalaxySystem() {
  const { galaxyTilt, selectedObject, setHoveredObject, setSelectedObject } = useAppState();

  const textures = useTexture([
    ...PLANET_TEXTURES.map(TEX),
    TEX("sunmap.jpg"),
    TEX("moonmap1k.jpg"),
    TEX("saturnringcolor.jpg"),
  ]);

  const planetTex = textures.slice(0, PLANET_TEXTURES.length);
  const sunTex = textures[PLANET_TEXTURES.length];
  const moonTex = textures[PLANET_TEXTURES.length + 1];
  const ringTex = textures[PLANET_TEXTURES.length + 2];

  useMemo(() => {
    [...planetTex, sunTex, ringTex, moonTex].forEach((t) => {
      if (t) t.colorSpace = THREE.SRGBColorSpace;
    });
  }, [planetTex, sunTex, ringTex, moonTex]);

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    for (const id in planetRefs) {
      const ref = planetRefs[id];
      const o = planetOrbits[id];
      if (!ref || !o) continue;
      const theta = o.initialAngle + time * o.speed;
      const r = ellipseR(o.a, o.e, theta);
      ref.position.set(Math.cos(theta) * r, 0, Math.sin(theta) * r);
      ref.rotation.y += 0.0025;
    }
  });

  return (
    <group rotation-x={galaxyTilt}>
      {galaxyData.domains.map((domain, i) => (
        <SolarSystem
          key={domain.id}
          domainId={domain.id}
          domainName={domain.name}
          index={i}
          position={domainPositions[domain.id]}
          sunRadius={sunRadii[domain.id]}
          sunTex={sunTex}
          planetTex={planetTex}
          moonTex={moonTex}
          ringTex={ringTex}
          selectedObject={selectedObject}
          setHoveredObject={setHoveredObject}
          setSelectedObject={setSelectedObject}
        />
      ))}
    </group>
  );
}

interface SolarSystemProps {
  domainId: string;
  domainName: string;
  index: number;
  position: THREE.Vector3;
  sunRadius: number;
  sunTex: THREE.Texture;
  planetTex: THREE.Texture[];
  moonTex: THREE.Texture;
  ringTex: THREE.Texture;
  selectedObject: { type: string; id: string } | null;
  setHoveredObject: (o: any) => void;
  setSelectedObject: (o: any) => void;
}

const SolarSystem = React.memo(function SolarSystem({
  domainId,
  domainName,
  index,
  position,
  sunRadius,
  sunTex,
  planetTex,
  moonTex,
  ringTex,
  selectedObject,
  setHoveredObject,
  setSelectedObject,
}: SolarSystemProps) {
  const color = useMemo(() => getStellarColor(index), [index]);
  const papers = papersByDomain[domainId] || [];

  return (
    <group position={position} ref={(el) => { if (el) sunRefs[domainId] = el; }}>
      <Sun
        radius={sunRadius}
        color={color}
        tex={sunTex}
        onSelect={() => setSelectedObject({ type: "sun", id: domainId })}
        onOver={() => setHoveredObject({ type: "sun", id: domainId, name: domainName })}
        onOut={() => setHoveredObject(null)}
      />
      {papers.map((p) => (
        <PlanetSystem
          key={p.id}
          paperId={p.id}
          paperTitle={p.title}
          coAuthors={p.coAuthors}
          planetTex={planetTex}
          moonTex={moonTex}
          ringTex={ringTex}
          isSelected={selectedObject?.type === "planet" && selectedObject.id === p.id}
          setHoveredObject={setHoveredObject}
          setSelectedObject={setSelectedObject}
        />
      ))}
    </group>
  );
});

function Sun({
  radius,
  color,
  tex,
  onSelect,
  onOver,
  onOut,
}: {
  radius: number;
  color: THREE.Color;
  tex: THREE.Texture;
  onSelect: () => void;
  onOver: () => void;
  onOut: () => void;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, d) => {
    if (ref.current) ref.current.rotation.y += d * 0.02;
  });
  return (
    <group>
      <mesh
        ref={ref}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onPointerOver={(e) => { e.stopPropagation(); onOver(); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { onOut(); document.body.style.cursor = "auto"; }}
      >
        <sphereGeometry args={[radius, 48, 48]} />
        <meshStandardMaterial
          map={tex}
          emissiveMap={tex}
          emissive={color}
          emissiveIntensity={1.5}
          color={color}
          toneMapped={false}
        />
      </mesh>
      <pointLight color={color} intensity={4} distance={radius * 60} decay={1.5} />
      <mesh scale={1.22}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.16}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

interface PlanetSystemProps {
  paperId: string;
  paperTitle: string;
  coAuthors: string[];
  planetTex: THREE.Texture[];
  moonTex: THREE.Texture;
  ringTex: THREE.Texture;
  isSelected: boolean;
  setHoveredObject: (o: any) => void;
  setSelectedObject: (o: any) => void;
}

const PlanetSystem = React.memo(function PlanetSystem({
  paperId,
  paperTitle,
  coAuthors,
  planetTex,
  moonTex,
  ringTex,
  isSelected,
  setHoveredObject,
  setSelectedObject,
}: PlanetSystemProps) {
  const o = planetOrbits[paperId];
  const tex = planetTex[o.texIndex];
  const isSaturn = o.texIndex === SATURN_IDX;

  const orbitLine = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const seg = 110;
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const r = ellipseR(o.a, o.e, th);
      pts.push(new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: 0x8b8fa3, transparent: true, opacity: 0.13 });
    return new THREE.LineLoop(geo, mat);
  }, [o.a, o.e]);

  return (
    <group rotation={[o.incl, o.node, 0]}>
      <primitive object={orbitLine} />
      <mesh
        ref={(el: THREE.Mesh | null) => { if (el) planetRefs[paperId] = el; }}
        onClick={(e) => { e.stopPropagation(); setSelectedObject({ type: "planet", id: paperId }); }}
        onPointerOver={(e) => { e.stopPropagation(); setHoveredObject({ type: "planet", id: paperId, name: paperTitle }); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHoveredObject(null); document.body.style.cursor = "auto"; }}
      >
        <sphereGeometry args={[o.planetRadius, 32, 32]} />
        <meshStandardMaterial map={tex} roughness={0.9} metalness={0.0} />
        {isSaturn && (
          <mesh rotation={[-Math.PI / 2.3, 0, 0]}>
            <ringGeometry args={[o.planetRadius * 1.4, o.planetRadius * 2.4, 64]} />
            <meshBasicMaterial map={ringTex} side={THREE.DoubleSide} transparent opacity={0.85} />
          </mesh>
        )}
        {isSelected &&
          coAuthors.map((a, i) => (
            <Moon
              key={i}
              tex={moonTex}
              index={i}
              total={coAuthors.length}
              planetRadius={o.planetRadius}
              seed={a}
            />
          ))}
      </mesh>
    </group>
  );
});

function Moon({
  tex,
  index,
  total,
  planetRadius,
  seed,
}: {
  tex: THREE.Texture;
  index: number;
  total: number;
  planetRadius: number;
  seed: string;
}) {
  const ref = useRef<THREE.Mesh>(null);
  const { dist, speed, init, incl } = useMemo(() => {
    const r = mulberry32(hashString(seed + index));
    return {
      dist: planetRadius + 1.0 + r() * 1.8,
      speed: 0.4 + r() * 1.0,
      init: (index / Math.max(1, total)) * Math.PI * 2 + r(),
      incl: (r() - 0.5) * 0.9,
    };
  }, [index, total, planetRadius, seed]);

  useFrame((s) => {
    if (!ref.current) return;
    const a = init + s.clock.elapsedTime * speed;
    ref.current.position.set(
      Math.cos(a) * dist,
      Math.sin(a) * Math.sin(incl) * dist * 0.5,
      Math.sin(a) * dist,
    );
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[Math.max(0.14, planetRadius * 0.2), 16, 16]} />
      <meshStandardMaterial map={tex} roughness={0.95} />
    </mesh>
  );
}
