<script lang="ts" setup>
/**
 * Ui3DFloatingShapes — Ambient floating geometric scene.
 *
 * Adds semi-transparent geometric primitives to a Three.js scene.
 * Each shape self-rotates and orbits gently for a premium ambient effect.
 *
 * Usage: Listen for Ui3DScene's 'scene-ready' event and pass the scene
 * object to this component via the 'scene' prop.
 *
 * Pure Three.js — no TresJS dependency.
 */
import { onMounted, onUnmounted, watch } from 'vue';
import * as THREE from 'three';

const props = withDefaults(defineProps<{
  /** The Three.js Scene object to add shapes to */
  scene?: THREE.Scene | null;
  /** Primary accent color (hex) */
  colorPrimary?: string;
  /** Secondary fill color (hex) */
  colorSecondary?: string;
  /** Global animation speed multiplier */
  speed?: number;
  /** Overall opacity of shapes */
  opacity?: number;
  /** Whether animation is paused */
  paused?: boolean;
}>(), {
  scene: null,
  colorPrimary: '#66ccff',
  colorSecondary: '#a8e0ff',
  speed: 1,
  opacity: 0.35,
  paused: false,
});

interface ShapeDef {
  position: [number, number, number];
  scale: number;
  rotationSpeed: [number, number, number];
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
}

const shapeDefs: ShapeDef[] = [
  {
    position: [-1.8, 0.8, -1],
    scale: 1.1,
    rotationSpeed: [0.003, 0.005, 0.002],
    orbitRadius: 0.4,
    orbitSpeed: 0.3,
    orbitPhase: 0,
  },
  {
    position: [1.5, -0.5, -0.5],
    scale: 0.9,
    rotationSpeed: [0.004, 0.002, 0.006],
    orbitRadius: 0.35,
    orbitSpeed: 0.45,
    orbitPhase: Math.PI * 0.6,
  },
  {
    position: [0.3, 1.2, -1.5],
    scale: 0.75,
    rotationSpeed: [0.005, 0.003, 0.004],
    orbitRadius: 0.3,
    orbitSpeed: 0.55,
    orbitPhase: Math.PI * 1.2,
  },
  {
    position: [-0.8, -1.0, -0.8],
    scale: 0.85,
    rotationSpeed: [0.002, 0.004, 0.003],
    orbitRadius: 0.25,
    orbitSpeed: 0.6,
    orbitPhase: Math.PI * 0.3,
  },
  {
    position: [2.0, 0.6, -2.0],
    scale: 0.7,
    rotationSpeed: [0.003, 0.006, 0.002],
    orbitRadius: 0.3,
    orbitSpeed: 0.35,
    orbitPhase: Math.PI * 1.8,
  },
];

const geometries = [
  new THREE.TorusGeometry(0.5, 0.18, 24, 48),
  new THREE.IcosahedronGeometry(0.42, 1),
  new THREE.OctahedronGeometry(0.38, 0),
  new THREE.SphereGeometry(0.28, 24, 24),
  new THREE.TorusKnotGeometry(0.32, 0.1, 64, 16, 2, 3),
];

function createMaterial(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    transparent: true,
    opacity: props.opacity,
    roughness: 0.15,
    metalness: 0.1,
    transmission: 0.3,
    thickness: 1.2,
    clearcoat: 0.4,
    clearcoatRoughness: 0.2,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
}

const colors = [
  props.colorPrimary,
  props.colorSecondary,
  props.colorPrimary,
  props.colorSecondary,
  props.colorPrimary,
];

const materials = colors.map(c => createMaterial(c));
const group = new THREE.Group();
const meshes: THREE.Mesh[] = [];

// Build meshes
shapeDefs.forEach((def, i) => {
  const mesh = new THREE.Mesh(geometries[i], materials[i]);
  mesh.position.set(...def.position);
  mesh.scale.setScalar(def.scale);
  group.add(mesh);
  meshes.push(mesh);
});

// Animation via rAF — independent loop
let elapsed = 0;
let lastTime = 0;
let animId: number | null = null;

function tick(time: number) {
  if (props.paused) {
    animId = null;
    return;
  }

  const delta = lastTime ? (time - lastTime) / 1000 : 0.016;
  lastTime = time;
  elapsed += delta * props.speed;

  meshes.forEach((mesh, i) => {
    const def = shapeDefs[i];

    mesh.rotation.x += def.rotationSpeed[0] * props.speed;
    mesh.rotation.y += def.rotationSpeed[1] * props.speed;
    mesh.rotation.z += def.rotationSpeed[2] * props.speed;

    const phase = elapsed * def.orbitSpeed + def.orbitPhase;
    mesh.position.x = def.position[0] + Math.sin(phase) * def.orbitRadius;
    mesh.position.y = def.position[1] + Math.cos(phase * 0.7) * def.orbitRadius * 0.8;
    mesh.position.z = def.position[2] + Math.sin(phase * 0.5) * def.orbitRadius * 0.5;
  });

  animId = requestAnimationFrame(tick);
}

function startAnimation() {
  if (animId === null && !props.paused) {
    lastTime = 0;
    animId = requestAnimationFrame(tick);
  }
}

function stopAnimation() {
  if (animId !== null) {
    cancelAnimationFrame(animId);
    animId = null;
  }
}

// Add group to scene when scene becomes available
function attachToScene(scene: THREE.Scene | null) {
  if (scene && !scene.children.includes(group)) {
    scene.add(group);
    startAnimation();
  }
}

function detachFromScene(scene: THREE.Scene | null) {
  if (scene && scene.children.includes(group)) {
    scene.remove(group);
  }
  stopAnimation();
}

watch(() => props.scene, (newScene, oldScene) => {
  if (oldScene) detachFromScene(oldScene);
  if (newScene) attachToScene(newScene);
}, { immediate: true });

watch(() => props.paused, (paused) => {
  if (paused) stopAnimation();
  else startAnimation();
});

onMounted(() => {
  if (props.scene) attachToScene(props.scene);
});

onUnmounted(() => {
  stopAnimation();
  detachFromScene(props.scene);

  geometries.forEach(g => g.dispose());
  materials.forEach(m => m.dispose());
  group.clear();
});
</script>

<template>
  <!-- Renderless component — adds objects to the provided scene -->
</template>
