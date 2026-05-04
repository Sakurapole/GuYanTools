import type { Directive } from 'vue';
import { createTooltipController, type TooltipOptions } from '../components/ui/tooltip_core';

type TooltipValue = string | TooltipOptions | null | undefined;

type TooltipHost = HTMLElement & {
  _tooltipValue?: TooltipValue;
  _tooltipController?: ReturnType<typeof createTooltipController>;
};

const tooltip: Directive<HTMLElement, TooltipValue> = {
  mounted(el, binding) {
    const host = el as TooltipHost;
    host._tooltipValue = binding.value;
    host._tooltipController = createTooltipController(host, () => host._tooltipValue);
  },
  updated(el, binding) {
    const host = el as TooltipHost;
    host._tooltipValue = binding.value;
    host._tooltipController?.sync();
  },
  unmounted(el) {
    const host = el as TooltipHost;
    host._tooltipController?.destroy();
    delete host._tooltipController;
    delete host._tooltipValue;
  },
};

export default tooltip;
