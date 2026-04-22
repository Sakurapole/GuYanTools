<script lang="ts" setup>
/**
 * Ui3DScene — Pure Three.js 3D canvas component.
 *
 * Creates a WebGL renderer, scene, camera, and lights.
 * Manages the render loop with automatic visibility-based pausing.
 * Emits a 'scene-ready' event with the scene object so child
 * components can add objects to it.
 *
 * No TresJS dependency — uses Three.js directly for zero
 * component resolution issues.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue';
import * as THREE from 'three';

const props = withDefaults(defineProps<{
  /** Pause the render loop */
  paused?: boolean;
  /** Camera distance from origin */
  cameraZ?: number;
  /** Background transparency */
  transparent?: boolean;
  /** Ambient light intensity */
  ambientIntensity?: number;
  /** Directional light intensity */
  directionalIntensity?: number;
}>(), {
  paused: false,
  cameraZ: 6,
  transparent: true,
  ambientIntensity: 0.6,
  directionalIntensity: 0.4,
});

const emit = defineEmits<{
  (e: 'scene-ready', payload: { scene: THREE.Scene; camera: THREE.PerspectiveCamera }): void;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
const containerRef = ref<HTMLElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let animFrameId: number | null = null;
let isVisible = true;
let observer: IntersectionObserver | null = null;

function initScene() {
  const canvas = canvasRef.value;
  const container = containerRef.value;
  if (!canvas || !container) return;

  // Renderer
  renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: props.transparent,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 0, props.cameraZ);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, props.ambientIntensity);
  const directional = new THREE.DirectionalLight(0xffffff, props.directionalIntensity);
  directional.position.set(4, 6, 4);
  scene.add(ambient, directional);

  // Initial size
  handleResize();

  // Emit so child components can add objects
  emit('scene-ready', { scene, camera });

  // Start render loop
  animate();
}

function handleResize() {
  const container = containerRef.value;
  if (!renderer || !camera || !container) return;

  const w = container.clientWidth;
  const h = container.clientHeight;
  if (w === 0 || h === 0) return;

  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function animate() {
  if (props.paused || !isVisible) {
    animFrameId = null;
    return;
  }

  animFrameId = requestAnimationFrame(animate);

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

function startLoop() {
  if (animFrameId === null && !props.paused && isVisible) {
    animate();
  }
}

function stopLoop() {
  if (animFrameId !== null) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

// Watch pause state
watch(() => props.paused, (paused) => {
  if (paused) stopLoop();
  else startLoop();
});

onMounted(() => {
  initScene();

  // Visibility observer
  if (containerRef.value) {
    observer = new IntersectionObserver(
      ([entry]) => {
        isVisible = entry.isIntersecting;
        if (isVisible) startLoop();
        else stopLoop();
      },
      { threshold: 0.05 },
    );
    observer.observe(containerRef.value);
  }

  window.addEventListener('resize', handleResize, { passive: true });
});

onUnmounted(() => {
  stopLoop();
  observer?.disconnect();
  observer = null;
  window.removeEventListener('resize', handleResize);

  renderer?.dispose();
  renderer = null;
  scene = null;
  camera = null;
});

// Expose scene for programmatic access
defineExpose({ getScene: () => scene, getCamera: () => camera });
</script>

<template>
  <div ref="containerRef" class="ui-3d-scene">
    <canvas ref="canvasRef" class="ui-3d-scene__canvas" />
  </div>
</template>

<style scoped>
.ui-3d-scene {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.ui-3d-scene__canvas {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
