import { ref, onMounted, onUnmounted, type Ref } from 'vue';

export interface PerspectiveTiltOptions {
  /** Maximum tilt angle in degrees (default: 6) */
  maxTilt?: number;
  /** CSS perspective value in pixels (default: 800) */
  perspective?: number;
  /** Transition duration when mouse leaves (default: 600) */
  resetDuration?: number;
  /** Whether the effect is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Composable for adding CSS 3D perspective tilt effect
 * to any element. Tracks mouse position and applies
 * rotateX/Y transforms for a tactile parallax response.
 *
 * Respects prefers-reduced-motion media query.
 *
 * Usage:
 *   const { tiltRef, tiltStyle } = usePerspectiveTilt({ maxTilt: 5 });
 *   <div ref="tiltRef" :style="tiltStyle">...</div>
 */
export function usePerspectiveTilt(options: PerspectiveTiltOptions = {}) {
  const {
    maxTilt = 6,
    perspective = 800,
    resetDuration = 600,
    enabled = true,
  } = options;

  const tiltRef = ref<HTMLElement | null>(null) as Ref<HTMLElement | null>;
  const tiltStyle = ref<Record<string, string>>({});

  let rafId: number | null = null;
  let prefersReducedMotion = false;

  function updateTilt(e: MouseEvent) {
    if (!enabled || prefersReducedMotion || !tiltRef.value) return;

    const el = tiltRef.value;
    const rect = el.getBoundingClientRect();

    // Normalized mouse position relative to element center (-1 to 1)
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;

    if (rafId !== null) cancelAnimationFrame(rafId);

    rafId = requestAnimationFrame(() => {
      // rotateX is inverted: mouse at top -> positive rotation
      const rotateX = -y * maxTilt;
      const rotateY = x * maxTilt;

      tiltStyle.value = {
        transform: `perspective(${perspective}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`,
        transition: 'transform 80ms ease-out',
      };
      rafId = null;
    });
  }

  function resetTilt() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    tiltStyle.value = {
      transform: `perspective(${perspective}px) rotateX(0deg) rotateY(0deg)`,
      transition: `transform ${resetDuration}ms cubic-bezier(0.32, 0.72, 0, 1)`,
    };
  }

  onMounted(() => {
    prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const el = tiltRef.value;
    if (!el || prefersReducedMotion) return;

    el.addEventListener('mousemove', updateTilt, { passive: true });
    el.addEventListener('mouseleave', resetTilt, { passive: true });
  });

  onUnmounted(() => {
    const el = tiltRef.value;
    if (!el) return;

    el.removeEventListener('mousemove', updateTilt);
    el.removeEventListener('mouseleave', resetTilt);

    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  });

  return { tiltRef, tiltStyle };
}
