import { onBeforeUnmount, onMounted, type Ref } from 'vue';

export function useOverlayPosition(open: Ref<boolean>, reposition: () => void): void {
  const handleViewportChange = () => { if (open.value) reposition(); };
  onMounted(() => { window.addEventListener('resize', handleViewportChange); window.addEventListener('scroll', handleViewportChange, true); });
  onBeforeUnmount(() => { window.removeEventListener('resize', handleViewportChange); window.removeEventListener('scroll', handleViewportChange, true); });
}
