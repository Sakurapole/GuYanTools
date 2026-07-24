import { onBeforeUnmount, watch, type Ref } from 'vue';

export function useOverlayFocus(open: Ref<boolean>, trigger: Ref<HTMLElement | null>): void {
  let previous: HTMLElement | null = null;

  watch(open, value => {
    if (value) previous = trigger.value ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    else previous?.focus();
  });

  onBeforeUnmount(() => previous?.focus());
}
