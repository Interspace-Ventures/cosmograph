import { useFrame } from "@react-three/fiber";
import { OrbitControls, PointerLockControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useAppState } from "@/lib/store";
import { planetRefs, sunRefs } from "./GalaxySystem";

export function CameraController() {
  const { cameraMode, selectedObject } = useAppState();
  const orbitRef = useRef<any>(null);

  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());
  
  const keys = useRef({ forward: false, backward: false, left: false, right: false });
  const velocity = useRef(new THREE.Vector3());
  const direction = useRef(new THREE.Vector3());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (cameraMode !== 'spaceship') return;
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW': keys.current.forward = true; break;
        case 'ArrowLeft':
        case 'KeyA': keys.current.left = true; break;
        case 'ArrowDown':
        case 'KeyS': keys.current.backward = true; break;
        case 'ArrowRight':
        case 'KeyD': keys.current.right = true; break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (cameraMode !== 'spaceship') return;
      switch (e.code) {
        case 'ArrowUp':
        case 'KeyW': keys.current.forward = false; break;
        case 'ArrowLeft':
        case 'KeyA': keys.current.left = false; break;
        case 'ArrowDown':
        case 'KeyS': keys.current.backward = false; break;
        case 'ArrowRight':
        case 'KeyD': keys.current.right = false; break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [cameraMode]);

  useFrame((state, delta) => {
    if (cameraMode === 'god') {
      if (selectedObject) {
        let worldPos = new THREE.Vector3();
        if (selectedObject.type === 'sun') {
          const sun = sunRefs[selectedObject.id];
          if (sun) sun.getWorldPosition(worldPos);
        } else if (selectedObject.type === 'planet') {
          const planet = planetRefs[selectedObject.id];
          if (planet) planet.getWorldPosition(worldPos);
        }
        
        if (worldPos.lengthSq() > 0) {
          targetLookAt.current.copy(worldPos);
          const offset = selectedObject.type === 'sun' 
            ? new THREE.Vector3(0, 50, 100) 
            : new THREE.Vector3(0, 10, 20);
          
          targetPosition.current.copy(worldPos).add(offset);
        }
      } else {
        targetPosition.current.set(0, 400, 400);
        targetLookAt.current.set(0, 0, 0);
      }
      
      state.camera.position.lerp(targetPosition.current, delta * 3);
      if (orbitRef.current) {
        orbitRef.current.target.lerp(targetLookAt.current, delta * 3);
      }
    } else if (cameraMode === 'spaceship') {
      const speed = 150.0 * delta;
      
      direction.current.z = Number(keys.current.forward) - Number(keys.current.backward);
      direction.current.x = Number(keys.current.right) - Number(keys.current.left);
      direction.current.normalize();

      if (keys.current.forward || keys.current.backward) velocity.current.z -= direction.current.z * speed;
      if (keys.current.left || keys.current.right) velocity.current.x -= direction.current.x * speed;

      state.camera.translateZ(velocity.current.z);
      state.camera.translateX(velocity.current.x);

      velocity.current.multiplyScalar(0.9); // friction
    }
  });

  if (cameraMode === 'spaceship') {
    return <PointerLockControls selector="#root" />;
  }

  return (
    <OrbitControls 
      ref={orbitRef}
      makeDefault
      enableDamping
      dampingFactor={0.05}
      maxDistance={2000}
      minDistance={10}
      maxPolarAngle={Math.PI / 1.5}
    />
  );
}
