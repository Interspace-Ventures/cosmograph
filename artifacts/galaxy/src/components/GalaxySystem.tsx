import React, { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { galaxyData, papersByDomain } from "@/data/galaxy";
import { getDomainColor } from "@/lib/colors";
import { useAppState } from "@/lib/store";

export const domainPositions: Record<string, THREE.Vector3> = {};
export const planetOrbits: Record<string, { orbitDistance: number; initialAngle: number; speed: number; planetRadius: number; sunRadius: number }> = {};
export const planetRefs: Record<string, THREE.Group> = {};
export const sunRefs: Record<string, THREE.Group> = {};

// deterministic rng
const mulberry32 = (a: number) => {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}
function hashString(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  return hash;
}

galaxyData.domains.forEach((d, i) => {
  const angle = i * Math.PI * 0.5; // Golden ratio spiral approach
  const radius = 50 + i * 25;
  const x = Math.cos(angle) * radius;
  const z = Math.sin(angle) * radius;
  
  const rng = mulberry32(hashString(d.id));
  const y = (rng() - 0.5) * 40; 
  domainPositions[d.id] = new THREE.Vector3(x, y, z);
  
  const sunRadius = Math.max(5, Math.sqrt(d.totalCitations) * 0.2);
  const papers = papersByDomain[d.id] || [];
  
  papers.forEach(p => {
    const prng = mulberry32(hashString(p.id));
    const planetRadius = Math.max(0.5, Math.sqrt(p.citations) * 0.1);
    const baseDistance = sunRadius + 10;
    const spread = 80;
    const orbitDistance = baseDistance + ((1 - p.relevance) * spread) + (prng() * 10 - 5);
    const initialAngle = prng() * Math.PI * 2;
    const speed = (prng() * 0.2 + 0.1) / Math.sqrt(orbitDistance);
    
    planetOrbits[p.id] = { orbitDistance, initialAngle, speed, planetRadius, sunRadius };
  });
});

export function GalaxySystem() {
  const { galaxyTilt, selectedObject, setHoveredObject, setSelectedObject } = useAppState();

  useFrame((state) => {
    const time = state.clock.elapsedTime;
    for (const domain of galaxyData.domains) {
      const papers = papersByDomain[domain.id] || [];
      for (const p of papers) {
        const ref = planetRefs[p.id];
        if (ref) {
          const orbit = planetOrbits[p.id];
          const angle = orbit.initialAngle + time * orbit.speed;
          ref.position.x = Math.cos(angle) * orbit.orbitDistance;
          ref.position.z = Math.sin(angle) * orbit.orbitDistance;
        }
      }
    }
  });

  return (
    <group rotation-x={galaxyTilt}>
      {galaxyData.domains.map((domain, i) => (
        <SolarSystem 
          key={domain.id} 
          domain={domain} 
          index={i} 
          position={domainPositions[domain.id]} 
          selectedObject={selectedObject}
          setHoveredObject={setHoveredObject}
          setSelectedObject={setSelectedObject}
        />
      ))}
    </group>
  );
}

const SolarSystem = React.memo(function SolarSystem({ domain, index, position, selectedObject, setHoveredObject, setSelectedObject }: { domain: any, index: number, position: THREE.Vector3, selectedObject: any, setHoveredObject: any, setSelectedObject: any }) {
  const color = useMemo(() => getDomainColor(index), [index]);
  const papers = papersByDomain[domain.id] || [];

  const sunRadius = Math.max(5, Math.sqrt(domain.totalCitations) * 0.2);

  const handleSunClick = (e: any) => {
    e.stopPropagation();
    setSelectedObject({ type: 'sun', id: domain.id });
  };

  return (
    <group position={position} ref={(el) => { if (el) sunRefs[domain.id] = el; }}>
      <mesh 
        onClick={handleSunClick}
        onPointerOver={(e) => { e.stopPropagation(); setHoveredObject({ type: 'sun', id: domain.id, name: domain.name }); }}
        onPointerOut={() => setHoveredObject(null)}
      >
        <sphereGeometry args={[sunRadius, 32, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
        <pointLight color={color} intensity={2} distance={200} decay={2} />
      </mesh>
      
      {papers.map((p, i) => (
        <Planet 
          key={p.id} 
          paper={p} 
          index={i} 
          color={color} 
          isSelected={selectedObject?.type === 'planet' && selectedObject.id === p.id}
          setHoveredObject={setHoveredObject}
          setSelectedObject={setSelectedObject}
        />
      ))}
    </group>
  );
});

const Planet = React.memo(function Planet({ paper, index, color, isSelected, setHoveredObject, setSelectedObject }: { paper: any, index: number, color: THREE.Color, isSelected: boolean, setHoveredObject: any, setSelectedObject: any }) {
  const orbit = planetOrbits[paper.id];

  const handleClick = (e: any) => {
    e.stopPropagation();
    setSelectedObject({ type: 'planet', id: paper.id });
  };

  return (
    <group ref={(el) => { if (el) planetRefs[paper.id] = el; }}>
      <mesh
        onClick={handleClick}
        onPointerOver={(e) => { e.stopPropagation(); setHoveredObject({ type: 'planet', id: paper.id, name: paper.title }); }}
        onPointerOut={() => setHoveredObject(null)}
      >
        <sphereGeometry args={[orbit.planetRadius, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} roughness={0.4} metalness={0.8} />
      </mesh>
      {isSelected && paper.coAuthors.map((author: string, i: number) => (
        <Moon key={i} author={author} index={i} planetRadius={orbit.planetRadius} totalMoons={paper.coAuthors.length} />
      ))}
    </group>
  );
});

function Moon({ author, index, planetRadius, totalMoons }: { author: string, index: number, planetRadius: number, totalMoons: number }) {
  const ref = useRef<THREE.Mesh>(null);
  
  const { orbitDistance, speed, initialAngle } = useMemo(() => {
    const prng = mulberry32(hashString(author + index));
    return {
      orbitDistance: planetRadius + 1.5 + (prng() * 1.5),
      speed: 0.2 + prng() * 0.8,
      initialAngle: (index / totalMoons) * Math.PI * 2 + prng()
    };
  }, [index, planetRadius, totalMoons, author]);

  useFrame((state) => {
    if (ref.current) {
      const angle = initialAngle + state.clock.elapsedTime * speed;
      ref.current.position.x = Math.cos(angle) * orbitDistance;
      ref.current.position.z = Math.sin(angle) * orbitDistance;
      ref.current.position.y = Math.sin(angle * 2) * (orbitDistance * 0.2);
    }
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.15, 8, 8]} />
      <meshStandardMaterial color="#ffffff" roughness={0.8} />
    </mesh>
  );
}
